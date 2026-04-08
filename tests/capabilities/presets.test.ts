import { describe, it, expect } from "bun:test";
import {
  readonlyPreset,
  networkOnlyPreset,
  builderPreset,
  fullPreset,
} from "../../src/capabilities/index";

// ---------------------------------------------------------------------------
// Preset profiles
// ---------------------------------------------------------------------------

describe("readonlyPreset", () => {
  it("allows fs:read", () => {
    expect(readonlyPreset.has("fs:read")).toBe(true);
  });

  it("allows env:read", () => {
    expect(readonlyPreset.has("env:read")).toBe(true);
  });

  it("denies fs:write", () => {
    expect(readonlyPreset.has("fs:write")).toBe(false);
  });

  it("denies fs:delete", () => {
    expect(readonlyPreset.has("fs:delete")).toBe(false);
  });

  it("denies process:spawn", () => {
    expect(readonlyPreset.has("process:spawn")).toBe(false);
  });

  it("denies net:fetch", () => {
    expect(readonlyPreset.has("net:fetch")).toBe(false);
  });
});

describe("networkOnlyPreset", () => {
  it("allows net:fetch", () => {
    expect(networkOnlyPreset.has("net:fetch")).toBe(true);
  });

  it("allows env:read", () => {
    expect(networkOnlyPreset.has("env:read")).toBe(true);
  });

  it("denies fs:read", () => {
    expect(networkOnlyPreset.has("fs:read")).toBe(false);
  });

  it("denies fs:write", () => {
    expect(networkOnlyPreset.has("fs:write")).toBe(false);
  });
});

describe("builderPreset", () => {
  it("allows fs:read", () => {
    expect(builderPreset.has("fs:read")).toBe(true);
  });

  it("allows fs:write", () => {
    expect(builderPreset.has("fs:write")).toBe(true);
  });

  it("allows process:spawn", () => {
    expect(builderPreset.has("process:spawn")).toBe(true);
  });

  it("allows env:read", () => {
    expect(builderPreset.has("env:read")).toBe(true);
  });

  it("has multiple fs:write patterns for build dirs", () => {
    const writes = builderPreset.getAll("fs:write");
    expect(writes.length).toBeGreaterThanOrEqual(3);
  });

  it("limits spawn to build tools", () => {
    const result = builderPreset.check({
      kind: "process:spawn",
      allowedBinaries: ["git"],
    });
    expect(result.allowed).toBe(true);

    const denied = builderPreset.check({
      kind: "process:spawn",
      allowedBinaries: ["rm"],
    });
    expect(denied.allowed).toBe(false);
  });
});

describe("fullPreset", () => {
  it("has all capability kinds", () => {
    expect(fullPreset.has("fs:read")).toBe(true);
    expect(fullPreset.has("fs:write")).toBe(true);
    expect(fullPreset.has("fs:delete")).toBe(true);
    expect(fullPreset.has("process:spawn")).toBe(true);
    expect(fullPreset.has("net:fetch")).toBe(true);
    expect(fullPreset.has("net:listen")).toBe(true);
    expect(fullPreset.has("env:read")).toBe(true);
    expect(fullPreset.has("env:write")).toBe(true);
  });

  it("allows any fs:read path", () => {
    const result = fullPreset.check({
      kind: "fs:read",
      pattern: "/any/path/whatsoever",
    });
    expect(result.allowed).toBe(true);
  });

  it("allows any spawn binary", () => {
    const result = fullPreset.check({
      kind: "process:spawn",
      allowedBinaries: ["dangerous-thing"],
    });
    expect(result.allowed).toBe(true);
  });

  it("allows any domain fetch", () => {
    const result = fullPreset.check({
      kind: "net:fetch",
      allowedDomains: ["evil.example.com"],
    });
    expect(result.allowed).toBe(true);
  });

  it("allows any port listen", () => {
    const result = fullPreset.check({ kind: "net:listen", port: 31337 });
    expect(result.allowed).toBe(true);
  });
});
