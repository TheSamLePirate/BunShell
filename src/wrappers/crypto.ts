/**
 * Crypto wrappers — hashing, encryption, random generation.
 *
 * Pure computation — no capability required (no I/O side effects).
 *
 * @module
 */

import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported hash algorithms. */
export type HashAlgorithm = "sha256" | "sha512" | "sha1" | "md5" | "sha384";

/** Result of a hash operation. */
export interface HashResult {
  readonly hex: string;
  readonly base64: string;
  readonly bytes: Uint8Array;
}

/** Result of an encryption operation. */
export interface EncryptResult {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Hash data with a given algorithm.
 *
 * @example
 * ```ts
 * const h = hash("hello world", "sha256");
 * console.log(h.hex); // "b94d27b9..."
 * ```
 */
export function hash(
  data: string | Uint8Array,
  algorithm: HashAlgorithm = "sha256",
): HashResult {
  const h = createHash(algorithm);
  h.update(typeof data === "string" ? data : Buffer.from(data));
  const bytes = new Uint8Array(h.digest());
  return {
    hex: Buffer.from(bytes).toString("hex"),
    base64: Buffer.from(bytes).toString("base64"),
    bytes,
  };
}

/**
 * HMAC — keyed hash for authentication.
 *
 * @example
 * ```ts
 * const h = hmac("message", "secret-key", "sha256");
 * console.log(h.hex);
 * ```
 */
export function hmac(
  data: string | Uint8Array,
  key: string | Uint8Array,
  algorithm: HashAlgorithm = "sha256",
): HashResult {
  const h = createHmac(
    algorithm,
    typeof key === "string" ? key : Buffer.from(key),
  );
  h.update(typeof data === "string" ? data : Buffer.from(data));
  const bytes = new Uint8Array(h.digest());
  return {
    hex: Buffer.from(bytes).toString("hex"),
    base64: Buffer.from(bytes).toString("base64"),
    bytes,
  };
}

// ---------------------------------------------------------------------------
// Random generation
// ---------------------------------------------------------------------------

/**
 * Generate cryptographically secure random bytes.
 *
 * @example
 * ```ts
 * const bytes = randomBytes(32);
 * ```
 */
export function randomBytes(n: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(n));
}

/**
 * Generate a random UUID v4.
 *
 * @example
 * ```ts
 * const id = randomUUID(); // "550e8400-e29b-41d4-..."
 * ```
 */
export function randomUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a random integer in [min, max) range.
 *
 * @example
 * ```ts
 * const n = randomInt(1, 100);
 * ```
 */
export function randomInt(min: number, max: number): number {
  const range = max - min;
  const bytes = new Uint8Array(nodeRandomBytes(4));
  const value =
    (bytes[0]! |
      (bytes[1]! << 8) |
      (bytes[2]! << 16) |
      ((bytes[3]! & 0x7f) << 24)) >>>
    0;
  return min + (value % range);
}

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

/**
 * Encrypt data with AES-256-GCM.
 *
 * @example
 * ```ts
 * const key = randomBytes(32);
 * const encrypted = encrypt("secret data", key);
 * const decrypted = decrypt(encrypted.ciphertext, key, encrypted.iv, encrypted.tag);
 * ```
 */
export function encrypt(
  data: string | Uint8Array,
  key: Uint8Array,
): EncryptResult {
  const iv = nodeRandomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), iv);
  let ciphertext: string;
  if (typeof data === "string") {
    ciphertext = cipher.update(data, "utf8", "hex");
  } else {
    ciphertext = cipher.update(Buffer.from(data), undefined, "hex");
  }
  ciphertext += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    iv: Buffer.from(iv).toString("hex"),
    tag: Buffer.from(tag).toString("hex"),
  };
}

/**
 * Decrypt data with AES-256-GCM.
 *
 * @example
 * ```ts
 * const plaintext = decrypt(ciphertext, key, iv, tag);
 * ```
 */
export function decrypt(
  ciphertext: string,
  key: Uint8Array,
  iv: string,
  tag: string,
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
