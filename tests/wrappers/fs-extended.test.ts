import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import {
  chmod,
  createSymlink,
  readLink,
  touch,
  append,
  truncate,
  realPath,
  watchPath,
  globFiles,
  cat,
  exists,
  write,
  rm,
} from "../../src/wrappers/fs";
import { mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-fs-ext");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(join(testDir, "sub"), { recursive: true });
  writeFileSync(join(testDir, "file.txt"), "hello");
  writeFileSync(join(testDir, "sub", "nested.ts"), "code");
  writeFileSync(join(testDir, "sub", "nested.js"), "js code");
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const ctx = createContext({
  name: "test",
  capabilities: capabilities()
    .fsRead("**")
    .fsWrite("**")
    .fsDelete("**")
    .build()
    .capabilities.slice(),
});

describe("chmod", () => {
  it("changes file permissions", async () => {
    const path = join(testDir, "file.txt");
    await chmod(ctx, path, 0o755);
    const s = statSync(path);
    expect(s.mode & 0o777).toBe(0o755);
    await chmod(ctx, path, 0o644);
  });
});

describe("createSymlink / readLink", () => {
  it("creates and reads a symlink", async () => {
    const target = join(testDir, "file.txt");
    const link = join(testDir, "link.txt");
    await createSymlink(ctx, target, link);
    const resolved = await readLink(ctx, link);
    expect(resolved).toBe(target);
    await rm(ctx, link);
  });
});

describe("touch", () => {
  it("creates a new file if it doesn't exist", async () => {
    const path = join(testDir, "touched.txt");
    await touch(ctx, path);
    expect(await exists(ctx, path)).toBe(true);
    await rm(ctx, path);
  });

  it("updates timestamps on existing file", async () => {
    const path = join(testDir, "file.txt");
    const before = statSync(path).mtimeMs;
    await new Promise((r) => setTimeout(r, 50));
    await touch(ctx, path);
    const after = statSync(path).mtimeMs;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe("append", () => {
  it("appends data to a file", async () => {
    const path = join(testDir, "append-test.txt");
    await write(ctx, path, "line1\n");
    await append(ctx, path, "line2\n");
    const content = await cat(ctx, path);
    expect(content).toBe("line1\nline2\n");
    await rm(ctx, path);
  });
});

describe("truncate", () => {
  it("empties a file by default", async () => {
    const path = join(testDir, "trunc.txt");
    await write(ctx, path, "lots of data here");
    await truncate(ctx, path);
    const content = await cat(ctx, path);
    expect(content).toBe("");
    await rm(ctx, path);
  });

  it("truncates to a specific size", async () => {
    const path = join(testDir, "trunc2.txt");
    await write(ctx, path, "abcdefghij");
    await truncate(ctx, path, 5);
    const content = await cat(ctx, path);
    expect(content).toBe("abcde");
    await rm(ctx, path);
  });
});

describe("realPath", () => {
  it("resolves a regular path", async () => {
    const resolved = await realPath(ctx, join(testDir, "file.txt"));
    expect(resolved).toContain("file.txt");
  });

  it("resolves through symlinks", async () => {
    const target = join(testDir, "file.txt");
    const link = join(testDir, "rp-link.txt");
    await createSymlink(ctx, target, link);
    const resolved = await realPath(ctx, link);
    expect(resolved).toBe(await realPath(ctx, target));
    await rm(ctx, link);
  });
});

describe("watchPath", () => {
  it("detects file changes", async () => {
    const path = join(testDir, "watched.txt");
    await write(ctx, path, "initial");

    const events: Array<{ type: string; filename: string | null }> = [];
    const watcher = watchPath(ctx, path, (e) => events.push(e));

    await new Promise((r) => setTimeout(r, 50));
    writeFileSync(path, "modified");
    await new Promise((r) => setTimeout(r, 200));

    watcher.close();
    expect(events.length).toBeGreaterThan(0);
    await rm(ctx, path);
  });
});

describe("globFiles", () => {
  it("finds files matching a pattern", async () => {
    const files = await globFiles(ctx, "**/*.ts", testDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some((f) => f.endsWith("nested.ts"))).toBe(true);
  });

  it("does not match non-matching files", async () => {
    const files = await globFiles(ctx, "**/*.py", testDir);
    expect(files.length).toBe(0);
  });

  it("respects capability checks per file", async () => {
    const restricted = createContext({
      name: "restricted",
      capabilities: [
        { kind: "fs:read" as const, pattern: testDir },
        { kind: "fs:read" as const, pattern: testDir + "/**/*.ts" },
      ],
    });
    const files = await globFiles(restricted, "**/*", testDir);
    // Should only include .ts files (the only ones matching the capability)
    expect(files.every((f) => f.endsWith(".ts"))).toBe(true);
  });
});
