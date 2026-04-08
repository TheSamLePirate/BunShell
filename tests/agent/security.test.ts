import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { runAgent } from "../../src/agent/sandbox";
import { capabilities } from "../../src/capabilities/index";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const fixturesDir = join(import.meta.dir, "fixtures");

// ---------------------------------------------------------------------------
// Sandbox escape tests
// ---------------------------------------------------------------------------

describe("sandbox: blocks node:fs import", () => {
  it("fails when agent imports node:fs directly", async () => {
    const result = await runAgent({
      name: "escape-fs",
      script: join(fixturesDir, "escape-node-fs.ts"),
      capabilities: capabilities().fsRead("**").build().capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("blocked");
  }, 15000);
});

describe("sandbox: blocks node:child_process import", () => {
  it("fails when agent imports child_process", async () => {
    const result = await runAgent({
      name: "escape-cp",
      script: join(fixturesDir, "escape-child-process.ts"),
      capabilities: capabilities().spawn(["*"]).build().capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("blocked");
  }, 15000);
});

describe("sandbox: blocks process.env access", () => {
  it("fails when agent accesses process.env directly", async () => {
    const result = await runAgent({
      name: "escape-env",
      script: join(fixturesDir, "escape-process-env.ts"),
      capabilities: capabilities().envRead(["*"]).build().capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // process is not defined in the VM context
    expect(result.error).toMatch(/process|not defined/i);
  }, 15000);
});

describe("sandbox: blocks require()", () => {
  it("fails when agent uses require() directly", async () => {
    const result = await runAgent({
      name: "escape-require",
      script: join(fixturesDir, "escape-require.ts"),
      capabilities: capabilities().fsRead("**").build().capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // require is not available in the VM
    expect(result.error).toMatch(/require|not defined/i);
  }, 15000);
});

// ---------------------------------------------------------------------------
// Recursive traversal bypass tests
// ---------------------------------------------------------------------------

describe("fs traversal: ls respects per-path capabilities", () => {
  const testDir = join(import.meta.dir, ".tmp-security-traversal");
  const allowedDir = join(testDir, "allowed");
  const deniedDir = join(testDir, "denied");
  const nestedAllowed = join(allowedDir, "sub");

  beforeAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(nestedAllowed, { recursive: true });
    mkdirSync(deniedDir, { recursive: true });
    writeFileSync(join(allowedDir, "ok.txt"), "allowed content");
    writeFileSync(join(nestedAllowed, "deep.txt"), "nested allowed");
    writeFileSync(join(deniedDir, "secret.txt"), "SECRET DATA");
    writeFileSync(join(testDir, "root.txt"), "root file");
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("recursive ls skips denied directories", async () => {
    // Import directly to test without subprocess overhead
    const { createContext } = await import("../../src/capabilities/context");
    const { ls } = await import("../../src/wrappers/fs");

    // Grant read to allowed/** and testDir/* but NOT denied/**
    const restrictedCtx = createContext({
      name: "restricted",
      capabilities: [
        { kind: "fs:read" as const, pattern: testDir },
        { kind: "fs:read" as const, pattern: allowedDir + "/**" },
        { kind: "fs:read" as const, pattern: testDir + "/*" },
      ],
    });

    const files = await ls(restrictedCtx, testDir, {
      recursive: true,
      hidden: true,
    });
    const names = files.map((f) => f.name);

    // Should see allowed files
    expect(names).toContain("allowed");
    expect(names).toContain("ok.txt");
    expect(names).toContain("sub");
    expect(names).toContain("deep.txt");
    expect(names).toContain("root.txt");

    // Should NOT see denied directory contents
    expect(names).not.toContain("secret.txt");
  });

  it("du skips denied paths and does not count their sizes", async () => {
    const { createContext } = await import("../../src/capabilities/context");
    const { du } = await import("../../src/wrappers/fs");

    // Only allow the allowed subdirectory
    const ctx = createContext({
      name: "du-test",
      capabilities: [
        { kind: "fs:read" as const, pattern: testDir },
        { kind: "fs:read" as const, pattern: allowedDir + "/**" },
        { kind: "fs:read" as const, pattern: testDir + "/*" },
      ],
    });

    const usage = await du(ctx, testDir);

    // denied/secret.txt should not be counted
    // We can't assert exact byte count but we can verify denied files are excluded
    // by comparing with a full-access context
    const fullCtx = createContext({
      name: "full-du",
      capabilities: [
        { kind: "fs:read" as const, pattern: testDir + "/**" },
        { kind: "fs:read" as const, pattern: testDir },
      ],
    });
    const fullUsage = await du(fullCtx, testDir);

    // Restricted du should have fewer bytes than full du
    expect(usage.bytes).toBeLessThan(fullUsage.bytes);
  });
});
