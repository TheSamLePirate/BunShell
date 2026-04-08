/**
 * Encrypted secret store.
 *
 * Secrets are encrypted at rest with AES-256-GCM. Values never appear
 * in audit logs — only key names with [REDACTED]. Capability-gated
 * via secret:read and secret:write with glob patterns on key names.
 *
 * Master key is derived from a password via PBKDF2, or provided
 * directly as a 32-byte key.
 *
 * @module
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
  createHmac,
} from "node:crypto";
import type { CapabilityContext } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A stored secret with metadata. */
interface StoredSecret {
  /** AES-256-GCM encrypted value. */
  ciphertext: string;
  /** Initialization vector (hex). */
  iv: string;
  /** Auth tag (hex). */
  tag: string;
  /** When this secret was created. */
  createdAt: string;
  /** When this secret was last updated. */
  updatedAt: string;
  /** Optional TTL — auto-expire after this date. */
  expiresAt?: string;
  /** Scoped namespace (e.g., "agent/mybot" or "shared"). */
  namespace: string;
}

/** Serialized store for persistence. */
export interface SecretStoreSnapshot {
  /** PBKDF2 salt (hex). */
  salt: string;
  /** HMAC of the encrypted data for integrity verification. */
  hmac: string;
  /** The encrypted secrets. */
  secrets: Record<string, StoredSecret>;
  /** Store version for future migrations. */
  version: number;
}

/** Options for creating a secret store. */
export interface SecretStoreOptions {
  /** Default namespace for secrets without explicit namespace. */
  readonly defaultNamespace?: string;
}

// ---------------------------------------------------------------------------
// SecretStore interface
// ---------------------------------------------------------------------------

export interface SecretStore {
  /**
   * Store a secret. Encrypts immediately.
   * Requires secret:write capability for the key.
   */
  set(
    ctx: CapabilityContext,
    key: string,
    value: string,
    options?: { expiresAt?: Date; namespace?: string },
  ): void;

  /**
   * Retrieve a secret. Decrypts on access.
   * Requires secret:read capability for the key.
   * Returns undefined if key doesn't exist or has expired.
   * Audit log records access with [REDACTED] value.
   */
  get(ctx: CapabilityContext, key: string): string | undefined;

  /**
   * Check if a secret exists (without decrypting).
   * Requires secret:read capability for the key.
   */
  has(ctx: CapabilityContext, key: string): boolean;

  /**
   * Delete a secret.
   * Requires secret:write capability for the key.
   */
  delete(ctx: CapabilityContext, key: string): boolean;

  /**
   * List secret key names matching capability pattern.
   * Only returns keys the context has permission to read.
   * Never returns values.
   */
  keys(ctx: CapabilityContext): string[];

  /**
   * Get metadata for a secret (no value).
   */
  meta(
    ctx: CapabilityContext,
    key: string,
  ):
    | { createdAt: Date; updatedAt: Date; expiresAt?: Date; namespace: string }
    | undefined;

  /**
   * Rotate the master key. Re-encrypts all secrets.
   */
  rotateKey(newMasterKey: Uint8Array): void;

  /** Export the store as a serializable, integrity-verified snapshot. */
  snapshot(): SecretStoreSnapshot;

  /** Restore from a snapshot (verifies HMAC integrity first). */
  restore(snapshot: SecretStoreSnapshot): void;

  /** Number of secrets stored. */
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function encryptValue(
  value: string,
  key: Uint8Array,
): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  let ciphertext = cipher.update(value, "utf8", "hex");
  ciphertext += cipher.final("hex");
  return {
    ciphertext,
    iv: Buffer.from(iv).toString("hex"),
    tag: Buffer.from(cipher.getAuthTag()).toString("hex"),
  };
}

function decryptValue(
  ciphertext: string,
  iv: string,
  tag: string,
  key: Uint8Array,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let plaintext = decipher.update(ciphertext, "hex", "utf8");
  plaintext += decipher.final("utf8");
  return plaintext;
}

function computeHmac(data: string, key: Uint8Array): string {
  return createHmac("sha256", Buffer.from(key)).update(data).digest("hex");
}

/**
 * Derive a 32-byte master key from a password using PBKDF2.
 *
 * @example
 * ```ts
 * const { key, salt } = deriveKey("my-secure-password");
 * const store = createSecretStore(key);
 * ```
 */
export function deriveKey(
  password: string,
  salt?: Uint8Array,
): { key: Uint8Array; salt: Uint8Array } {
  const s = salt ?? randomBytes(32);
  const key = new Uint8Array(
    pbkdf2Sync(password, Buffer.from(s), 100000, 32, "sha512"),
  );
  return { key, salt: new Uint8Array(s) };
}

/**
 * Create an encrypted secret store.
 *
 * @example
 * ```ts
 * const { key } = deriveKey("my-password");
 * const store = createSecretStore(key);
 *
 * store.set(ctx, "GITHUB_TOKEN", "ghp_xxx...");
 * const token = store.get(ctx, "GITHUB_TOKEN");
 * ```
 */
export function createSecretStore(
  masterKey: Uint8Array,
  options?: SecretStoreOptions,
): SecretStore {
  let currentKey = new Uint8Array(masterKey);
  const secrets = new Map<string, StoredSecret>();
  const defaultNs = options?.defaultNamespace ?? "default";
  const salt = randomBytes(32);

  function isExpired(secret: StoredSecret): boolean {
    if (!secret.expiresAt) return false;
    return new Date(secret.expiresAt) < new Date();
  }

  function demandRead(ctx: CapabilityContext, key: string): void {
    ctx.caps.demand({ kind: "secret:read", allowedKeys: [key] });
    // Audit with REDACTED value — structurally impossible to leak
    ctx.audit.log("secret:read", { op: "secretGet", key, value: "[REDACTED]" });
  }

  function demandWrite(ctx: CapabilityContext, key: string): void {
    ctx.caps.demand({ kind: "secret:write", allowedKeys: [key] });
    ctx.audit.log("secret:write", {
      op: "secretSet",
      key,
      value: "[REDACTED]",
    });
  }

  return {
    set(ctx, key, value, opts) {
      demandWrite(ctx, key);
      const encrypted = encryptValue(value, currentKey);
      const now = new Date().toISOString();
      const entry: StoredSecret = {
        ...encrypted,
        createdAt: secrets.get(key)?.createdAt ?? now,
        updatedAt: now,
        namespace: opts?.namespace ?? defaultNs,
      };
      if (opts?.expiresAt) entry.expiresAt = opts.expiresAt.toISOString();
      secrets.set(key, entry);
    },

    get(ctx, key) {
      demandRead(ctx, key);
      const secret = secrets.get(key);
      if (!secret) return undefined;
      if (isExpired(secret)) {
        secrets.delete(key);
        return undefined;
      }
      return decryptValue(secret.ciphertext, secret.iv, secret.tag, currentKey);
    },

    has(ctx, key) {
      demandRead(ctx, key);
      const secret = secrets.get(key);
      if (!secret) return false;
      if (isExpired(secret)) {
        secrets.delete(key);
        return false;
      }
      return true;
    },

    delete(ctx, key) {
      demandWrite(ctx, key);
      ctx.audit.log("secret:write", { op: "secretDelete", key });
      return secrets.delete(key);
    },

    keys(ctx) {
      // Only return keys the context has permission to read
      const result: string[] = [];
      for (const key of secrets.keys()) {
        const check = ctx.caps.check({
          kind: "secret:read",
          allowedKeys: [key],
        });
        if (check.allowed) {
          const secret = secrets.get(key)!;
          if (!isExpired(secret)) {
            result.push(key);
          }
        }
      }
      ctx.audit.log("secret:read", { op: "secretKeys", count: result.length });
      return result.sort();
    },

    meta(ctx, key) {
      demandRead(ctx, key);
      const secret = secrets.get(key);
      if (!secret || isExpired(secret)) return undefined;
      const result: {
        createdAt: Date;
        updatedAt: Date;
        expiresAt?: Date;
        namespace: string;
      } = {
        createdAt: new Date(secret.createdAt),
        updatedAt: new Date(secret.updatedAt),
        namespace: secret.namespace,
      };
      if (secret.expiresAt) result.expiresAt = new Date(secret.expiresAt);
      return result;
    },

    rotateKey(newMasterKey: Uint8Array) {
      // Decrypt all with old key, re-encrypt with new key
      for (const [key, secret] of secrets) {
        if (isExpired(secret)) {
          secrets.delete(key);
          continue;
        }
        const plaintext = decryptValue(
          secret.ciphertext,
          secret.iv,
          secret.tag,
          currentKey,
        );
        const reEncrypted = encryptValue(plaintext, newMasterKey);
        secrets.set(key, {
          ...secret,
          ...reEncrypted,
          updatedAt: new Date().toISOString(),
        });
      }
      currentKey = new Uint8Array(newMasterKey);
    },

    snapshot(): SecretStoreSnapshot {
      const data: Record<string, StoredSecret> = {};
      for (const [key, secret] of secrets) {
        if (!isExpired(secret)) {
          data[key] = { ...secret };
        }
      }
      const serialized = JSON.stringify(data);
      return {
        salt: Buffer.from(salt).toString("hex"),
        hmac: computeHmac(serialized, currentKey),
        secrets: data,
        version: 1,
      };
    },

    restore(snapshot: SecretStoreSnapshot) {
      // Verify integrity
      const serialized = JSON.stringify(snapshot.secrets);
      const expected = computeHmac(serialized, currentKey);
      if (expected !== snapshot.hmac) {
        throw new Error(
          "Secret store integrity check failed — data may have been tampered with",
        );
      }
      secrets.clear();
      for (const [key, secret] of Object.entries(snapshot.secrets)) {
        secrets.set(key, secret);
      }
    },

    get count() {
      // Purge expired on count
      for (const [key, secret] of secrets) {
        if (isExpired(secret)) secrets.delete(key);
      }
      return secrets.size;
    },
  };
}
