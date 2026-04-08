import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  resolvePath,
  matchesGlob,
  checkCapability,
  createCapabilitySet,
  CapabilityError,
} from "../../src/capabilities/index";
import type { Capability } from "../../src/capabilities/index";
import { mkdirSync, symlinkSync, rmSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// matchesGlob
// ---------------------------------------------------------------------------

describe("matchesGlob", () => {
  it("wildcard '*' matches everything", () => {
    expect(matchesGlob("/any/path", "*")).toBe(true);
    expect(matchesGlob("foo.txt", "*")).toBe(true);
  });

  it("matches paths within a directory glob", () => {
    expect(matchesGlob("/tmp/foo.txt", "/tmp/**")).toBe(true);
    expect(matchesGlob("/tmp/sub/bar.log", "/tmp/**")).toBe(true);
  });

  it("rejects paths outside a directory glob", () => {
    expect(matchesGlob("/etc/passwd", "/tmp/**")).toBe(false);
    expect(matchesGlob("/var/log/syslog", "/tmp/**")).toBe(false);
  });

  it("matches exact file paths", () => {
    expect(matchesGlob("/tmp/config.json", "/tmp/config.json")).toBe(true);
    expect(matchesGlob("/tmp/other.json", "/tmp/config.json")).toBe(false);
  });

  it("matches extension globs", () => {
    expect(matchesGlob("/src/app.ts", "/src/**/*.ts")).toBe(true);
    expect(matchesGlob("/src/app.js", "/src/**/*.ts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolvePath — symlink resolution
// ---------------------------------------------------------------------------

describe("resolvePath", () => {
  const testDir = join(import.meta.dir, ".tmp-test-guard");
  const realDir = join(testDir, "real");
  const linkPath = join(testDir, "link-to-real");

  beforeAll(() => {
    mkdirSync(realDir, { recursive: true });
    try {
      symlinkSync(realDir, linkPath);
    } catch {
      // Link may already exist from a prior interrupted run
    }
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("resolves symlinks to their real path", () => {
    const resolved = resolvePath(linkPath);
    expect(resolved).toBe(realDir);
  });

  it("returns the path unchanged for non-symlinks", () => {
    const resolved = resolvePath(realDir);
    expect(resolved).toBe(realDir);
  });

  it("resolves parent directory for non-existent files", () => {
    const fakePath = join(realDir, "nonexistent.txt");
    const resolved = resolvePath(fakePath);
    expect(resolved).toBe(fakePath);
  });

  it("prevents symlink escape (link outside allowed pattern)", () => {
    // A symlink in /tmp that points to /etc should resolve to /etc
    // The guard should then reject /etc against a /tmp/** pattern
    const resolved = resolvePath(linkPath);
    expect(matchesGlob(resolved, join(testDir, "link-*"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkCapability — single capability checks
// ---------------------------------------------------------------------------

describe("checkCapability", () => {
  it("allows fs:read within pattern", () => {
    const held: Capability = { kind: "fs:read", pattern: "/tmp/**" };
    const required: Capability = { kind: "fs:read", pattern: "/tmp/foo.txt" };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });

  it("denies fs:read outside pattern", () => {
    const held: Capability = { kind: "fs:read", pattern: "/tmp/**" };
    const required: Capability = { kind: "fs:read", pattern: "/etc/passwd" };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("/etc/passwd");
  });

  it("denies kind mismatch", () => {
    const held: Capability = { kind: "fs:read", pattern: "/tmp/**" };
    const required: Capability = { kind: "fs:write", pattern: "/tmp/foo" };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("mismatch");
  });

  it("allows spawn for listed binary", () => {
    const held: Capability = {
      kind: "process:spawn",
      allowedBinaries: ["git", "bun"],
    };
    const required: Capability = {
      kind: "process:spawn",
      allowedBinaries: ["git"],
    };
    expect(checkCapability(held, required).allowed).toBe(true);
  });

  it("denies spawn for unlisted binary", () => {
    const held: Capability = {
      kind: "process:spawn",
      allowedBinaries: ["git"],
    };
    const required: Capability = {
      kind: "process:spawn",
      allowedBinaries: ["rm"],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("rm");
  });

  it("allows spawn wildcard", () => {
    const held: Capability = {
      kind: "process:spawn",
      allowedBinaries: ["*"],
    };
    const required: Capability = {
      kind: "process:spawn",
      allowedBinaries: ["anything"],
    };
    expect(checkCapability(held, required).allowed).toBe(true);
  });

  it("allows net:fetch for listed domain", () => {
    const held: Capability = {
      kind: "net:fetch",
      allowedDomains: ["api.github.com"],
    };
    const required: Capability = {
      kind: "net:fetch",
      allowedDomains: ["api.github.com"],
    };
    expect(checkCapability(held, required).allowed).toBe(true);
  });

  it("denies net:fetch for unlisted domain", () => {
    const held: Capability = {
      kind: "net:fetch",
      allowedDomains: ["api.github.com"],
    };
    const required: Capability = {
      kind: "net:fetch",
      allowedDomains: ["evil.com"],
    };
    expect(checkCapability(held, required).allowed).toBe(false);
  });

  it("allows net:fetch wildcard domain", () => {
    const held: Capability = { kind: "net:fetch", allowedDomains: ["*"] };
    const required: Capability = {
      kind: "net:fetch",
      allowedDomains: ["any.domain"],
    };
    expect(checkCapability(held, required).allowed).toBe(true);
  });

  it("denies net:fetch on disallowed port", () => {
    const held: Capability = {
      kind: "net:fetch",
      allowedDomains: ["api.github.com"],
      allowedPorts: [443],
    };
    const required: Capability = {
      kind: "net:fetch",
      allowedDomains: ["api.github.com"],
      allowedPorts: [8080],
    };
    expect(checkCapability(held, required).allowed).toBe(false);
  });

  it("allows net:listen on matching port", () => {
    const held: Capability = { kind: "net:listen", port: 3000 };
    const required: Capability = { kind: "net:listen", port: 3000 };
    expect(checkCapability(held, required).allowed).toBe(true);
  });

  it("denies net:listen on wrong port", () => {
    const held: Capability = { kind: "net:listen", port: 3000 };
    const required: Capability = { kind: "net:listen", port: 8080 };
    expect(checkCapability(held, required).allowed).toBe(false);
  });

  it("allows net:listen with port 0 wildcard", () => {
    const held: Capability = { kind: "net:listen", port: 0 };
    const required: Capability = { kind: "net:listen", port: 9999 };
    expect(checkCapability(held, required).allowed).toBe(true);
  });

  it("allows env:read for listed key", () => {
    const held: Capability = {
      kind: "env:read",
      allowedKeys: ["PATH", "HOME"],
    };
    const required: Capability = {
      kind: "env:read",
      allowedKeys: ["PATH"],
    };
    expect(checkCapability(held, required).allowed).toBe(true);
  });

  it("denies env:read for unlisted key", () => {
    const held: Capability = {
      kind: "env:read",
      allowedKeys: ["PATH"],
    };
    const required: Capability = {
      kind: "env:read",
      allowedKeys: ["SECRET_KEY"],
    };
    expect(checkCapability(held, required).allowed).toBe(false);
  });

  it("allows env:read wildcard", () => {
    const held: Capability = { kind: "env:read", allowedKeys: ["*"] };
    const required: Capability = {
      kind: "env:read",
      allowedKeys: ["ANYTHING"],
    };
    expect(checkCapability(held, required).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createCapabilitySet
// ---------------------------------------------------------------------------

describe("createCapabilitySet", () => {
  const set = createCapabilitySet([
    { kind: "fs:read", pattern: "/tmp/**" },
    { kind: "fs:read", pattern: "/home/**" },
    { kind: "fs:write", pattern: "/tmp/**" },
    { kind: "process:spawn", allowedBinaries: ["git", "bun"] },
  ]);

  it("has() returns true for granted kinds", () => {
    expect(set.has("fs:read")).toBe(true);
    expect(set.has("fs:write")).toBe(true);
    expect(set.has("process:spawn")).toBe(true);
  });

  it("has() returns false for missing kinds", () => {
    expect(set.has("net:fetch")).toBe(false);
    expect(set.has("fs:delete")).toBe(false);
  });

  it("getAll() returns all capabilities of a kind", () => {
    const reads = set.getAll("fs:read");
    expect(reads.length).toBe(2);
  });

  it("check() allows path in any matching pattern", () => {
    const r1 = set.check({ kind: "fs:read", pattern: "/tmp/foo" });
    expect(r1.allowed).toBe(true);

    const r2 = set.check({ kind: "fs:read", pattern: "/home/user/doc" });
    expect(r2.allowed).toBe(true);
  });

  it("check() denies path outside all patterns", () => {
    const result = set.check({ kind: "fs:read", pattern: "/etc/shadow" });
    expect(result.allowed).toBe(false);
  });

  it("check() denies missing capability kind", () => {
    const result = set.check({
      kind: "net:fetch",
      allowedDomains: ["example.com"],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("No capability");
  });

  it("demand() does not throw for allowed operations", () => {
    expect(() => {
      set.demand({ kind: "fs:read", pattern: "/tmp/foo" });
    }).not.toThrow();
  });

  it("demand() throws CapabilityError for denied operations", () => {
    expect(() => {
      set.demand({ kind: "fs:read", pattern: "/etc/shadow" });
    }).toThrow(CapabilityError);
  });

  it("demand() throws CapabilityError with correct message", () => {
    try {
      set.demand({ kind: "fs:delete", pattern: "/tmp/foo" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CapabilityError);
      const err = e as CapabilityError;
      expect(err.capability.kind).toBe("fs:delete");
      expect(err.reason).toContain("No capability");
    }
  });

  it("capabilities array is frozen", () => {
    expect(Object.isFrozen(set.capabilities)).toBe(true);
  });
});
