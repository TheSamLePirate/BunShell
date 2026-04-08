import { describe, it, expect } from "bun:test";
import {
  hash,
  hmac,
  randomBytes,
  randomUUID,
  randomInt,
  encrypt,
  decrypt,
} from "../../src/wrappers/crypto";

describe("hash", () => {
  it("produces SHA-256 hex", () => {
    const h = hash("hello world", "sha256");
    expect(h.hex).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
  });

  it("produces consistent results", () => {
    expect(hash("test").hex).toBe(hash("test").hex);
  });

  it("different inputs produce different hashes", () => {
    expect(hash("a").hex).not.toBe(hash("b").hex);
  });

  it("supports MD5", () => {
    const h = hash("hello", "md5");
    expect(h.hex.length).toBe(32);
  });

  it("supports SHA-512", () => {
    const h = hash("hello", "sha512");
    expect(h.hex.length).toBe(128);
  });

  it("returns base64", () => {
    const h = hash("hello", "sha256");
    expect(h.base64.length).toBeGreaterThan(0);
  });

  it("returns bytes as Uint8Array", () => {
    const h = hash("hello", "sha256");
    expect(h.bytes).toBeInstanceOf(Uint8Array);
    expect(h.bytes.length).toBe(32);
  });

  it("accepts Uint8Array input", () => {
    const input = new TextEncoder().encode("hello world");
    const h = hash(input, "sha256");
    expect(h.hex).toBe(hash("hello world", "sha256").hex);
  });
});

describe("hmac", () => {
  it("produces keyed hash", () => {
    const h = hmac("message", "key", "sha256");
    expect(h.hex.length).toBe(64);
  });

  it("different keys produce different results", () => {
    expect(hmac("msg", "key1").hex).not.toBe(hmac("msg", "key2").hex);
  });

  it("is consistent", () => {
    expect(hmac("msg", "key").hex).toBe(hmac("msg", "key").hex);
  });
});

describe("randomBytes", () => {
  it("returns requested number of bytes", () => {
    expect(randomBytes(16).length).toBe(16);
    expect(randomBytes(32).length).toBe(32);
  });

  it("returns Uint8Array", () => {
    expect(randomBytes(8)).toBeInstanceOf(Uint8Array);
  });

  it("produces different values each time", () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(Buffer.from(a).toString("hex")).not.toBe(
      Buffer.from(b).toString("hex"),
    );
  });
});

describe("randomUUID", () => {
  it("returns a valid UUID v4 format", () => {
    const uuid = randomUUID();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("generates unique values", () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
});

describe("randomInt", () => {
  it("returns within range", () => {
    for (let i = 0; i < 50; i++) {
      const n = randomInt(10, 20);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThan(20);
    }
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips string data", () => {
    const key = randomBytes(32);
    const encrypted = encrypt("hello world", key);
    const decrypted = decrypt(
      encrypted.ciphertext,
      key,
      encrypted.iv,
      encrypted.tag,
    );
    expect(decrypted).toBe("hello world");
  });

  it("produces different ciphertext each time (random IV)", () => {
    const key = randomBytes(32);
    const a = encrypt("same data", key);
    const b = encrypt("same data", key);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails with wrong key", () => {
    const key1 = randomBytes(32);
    const key2 = randomBytes(32);
    const encrypted = encrypt("secret", key1);
    expect(() =>
      decrypt(encrypted.ciphertext, key2, encrypted.iv, encrypted.tag),
    ).toThrow();
  });

  it("fails with tampered tag", () => {
    const key = randomBytes(32);
    const encrypted = encrypt("secret", key);
    expect(() =>
      decrypt(encrypted.ciphertext, key, encrypted.iv, "0000000000000000"),
    ).toThrow();
  });
});
