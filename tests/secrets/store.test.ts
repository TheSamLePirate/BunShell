import { describe, it, expect } from "bun:test";
import { createSecretStore, deriveKey } from "../../src/secrets/store";
import {
  createContext,
  capabilities,
  CapabilityError,
} from "../../src/capabilities/index";
import { randomBytes } from "../../src/wrappers/crypto";

const masterKey = randomBytes(32);

const fullCtx = createContext({
  name: "secret-test",
  capabilities: capabilities()
    .secretRead(["*"])
    .secretWrite(["*"])
    .build()
    .capabilities.slice(),
});

const restrictedCtx = createContext({
  name: "restricted",
  capabilities: capabilities()
    .secretRead(["GITHUB_*", "PUBLIC_KEY"])
    .secretWrite(["GITHUB_*"])
    .build()
    .capabilities.slice(),
});

describe("createSecretStore", () => {
  it("stores and retrieves a secret", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "MY_SECRET", "super-secret-value");
    expect(store.get(fullCtx, "MY_SECRET")).toBe("super-secret-value");
  });

  it("returns undefined for missing key", () => {
    const store = createSecretStore(masterKey);
    expect(store.get(fullCtx, "NONEXISTENT")).toBeUndefined();
  });

  it("has() checks existence", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "KEY", "val");
    expect(store.has(fullCtx, "KEY")).toBe(true);
    expect(store.has(fullCtx, "NOPE")).toBe(false);
  });

  it("delete() removes a secret", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "DEL", "val");
    expect(store.delete(fullCtx, "DEL")).toBe(true);
    expect(store.has(fullCtx, "DEL")).toBe(false);
  });

  it("count tracks secrets", () => {
    const store = createSecretStore(masterKey);
    expect(store.count).toBe(0);
    store.set(fullCtx, "A", "1");
    store.set(fullCtx, "B", "2");
    expect(store.count).toBe(2);
    store.delete(fullCtx, "A");
    expect(store.count).toBe(1);
  });

  it("overwrites existing secret", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "KEY", "old");
    store.set(fullCtx, "KEY", "new");
    expect(store.get(fullCtx, "KEY")).toBe("new");
    expect(store.count).toBe(1);
  });

  it("meta() returns metadata without value", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "KEY", "secret");
    const m = store.meta(fullCtx, "KEY");
    expect(m).toBeDefined();
    expect(m!.createdAt).toBeInstanceOf(Date);
    expect(m!.updatedAt).toBeInstanceOf(Date);
    expect(m!.namespace).toBe("default");
  });
});

describe("TTL / expiration", () => {
  it("expired secrets return undefined", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "EXPIRING", "val", {
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    expect(store.get(fullCtx, "EXPIRING")).toBeUndefined();
    expect(store.has(fullCtx, "EXPIRING")).toBe(false);
  });

  it("non-expired secrets are accessible", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "FRESH", "val", {
      expiresAt: new Date(Date.now() + 60000),
    });
    expect(store.get(fullCtx, "FRESH")).toBe("val");
  });
});

describe("capability enforcement", () => {
  it("glob pattern GITHUB_* matches GITHUB_TOKEN", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "GITHUB_TOKEN", "ghp_xxx");
    expect(store.get(restrictedCtx, "GITHUB_TOKEN")).toBe("ghp_xxx");
  });

  it("glob pattern GITHUB_* matches GITHUB_WEBHOOK_SECRET", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "GITHUB_WEBHOOK_SECRET", "whsec_xxx");
    expect(store.get(restrictedCtx, "GITHUB_WEBHOOK_SECRET")).toBe("whsec_xxx");
  });

  it("denies reading keys outside pattern", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "AWS_SECRET", "akia_xxx");
    expect(() => store.get(restrictedCtx, "AWS_SECRET")).toThrow(
      CapabilityError,
    );
  });

  it("denies writing keys outside pattern", () => {
    const store = createSecretStore(masterKey);
    expect(() => store.set(restrictedCtx, "AWS_SECRET", "val")).toThrow(
      CapabilityError,
    );
  });

  it("keys() only returns permitted keys", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "GITHUB_TOKEN", "a");
    store.set(fullCtx, "GITHUB_SECRET", "b");
    store.set(fullCtx, "AWS_KEY", "c");
    store.set(fullCtx, "PUBLIC_KEY", "d");

    const keys = store.keys(restrictedCtx);
    expect(keys).toContain("GITHUB_TOKEN");
    expect(keys).toContain("GITHUB_SECRET");
    expect(keys).toContain("PUBLIC_KEY");
    expect(keys).not.toContain("AWS_KEY");
  });
});

describe("key rotation", () => {
  it("rotates master key and secrets remain accessible", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "KEY1", "value1");
    store.set(fullCtx, "KEY2", "value2");

    const newKey = randomBytes(32);
    store.rotateKey(newKey);

    expect(store.get(fullCtx, "KEY1")).toBe("value1");
    expect(store.get(fullCtx, "KEY2")).toBe("value2");
  });
});

describe("snapshot / restore", () => {
  it("round-trips through snapshot", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "A", "alpha");
    store.set(fullCtx, "B", "beta");

    const snap = store.snapshot();
    expect(snap.version).toBe(1);
    expect(snap.hmac.length).toBeGreaterThan(0);

    const store2 = createSecretStore(masterKey);
    store2.restore(snap);
    expect(store2.get(fullCtx, "A")).toBe("alpha");
    expect(store2.get(fullCtx, "B")).toBe("beta");
  });

  it("detects tampering via HMAC", () => {
    const store = createSecretStore(masterKey);
    store.set(fullCtx, "KEY", "val");
    const snap = store.snapshot();

    // Tamper with the data
    snap.secrets["KEY"]!.ciphertext = "tampered";

    const store2 = createSecretStore(masterKey);
    expect(() => store2.restore(snap)).toThrow("integrity");
  });
});

describe("deriveKey", () => {
  it("derives consistent key from password + salt", () => {
    const { key, salt } = deriveKey("my-password");
    const { key: key2 } = deriveKey("my-password", salt);
    expect(Buffer.from(key).toString("hex")).toBe(
      Buffer.from(key2).toString("hex"),
    );
  });

  it("different passwords produce different keys", () => {
    const { key: k1, salt } = deriveKey("password1");
    const { key: k2 } = deriveKey("password2", salt);
    expect(Buffer.from(k1).toString("hex")).not.toBe(
      Buffer.from(k2).toString("hex"),
    );
  });
});

describe("audit redaction", () => {
  it("audit entries never contain secret values", async () => {
    const { createAuditLogger } = await import("../../src/audit/logger");
    const audit = createAuditLogger({ agentId: "t", agentName: "t" });

    const ctx = createContext({
      name: "audit-test",
      capabilities: capabilities()
        .secretRead(["*"])
        .secretWrite(["*"])
        .build()
        .capabilities.slice(),
      audit,
    });

    const store = createSecretStore(masterKey);
    store.set(ctx, "SECRET", "my-actual-password-123");
    store.get(ctx, "SECRET");

    // Check all audit entries — none should contain the actual value
    for (const entry of audit.entries) {
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain("my-actual-password-123");
      expect(serialized).toContain("[REDACTED]");
    }
  });
});
