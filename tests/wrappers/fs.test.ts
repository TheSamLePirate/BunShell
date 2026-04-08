import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  createContext,
  capabilities,
  CapabilityError,
} from "../../src/capabilities/index";
import {
  ls,
  cat,
  stat,
  exists,
  mkdir,
  write,
  readJson,
  writeJson,
  rm,
  cp,
  mv,
  find,
  du,
} from "../../src/wrappers/fs";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-fs");
const subDir = join(testDir, "sub");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(testDir, "hello.txt"), "hello world");
  writeFileSync(join(testDir, "data.json"), '{"key":"value"}');
  writeFileSync(join(subDir, "nested.ts"), "export const x = 1;");
  writeFileSync(join(testDir, ".hidden"), "secret");
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

const readOnlyCtx = createContext({
  name: "readonly",
  capabilities: capabilities().fsRead("**").build().capabilities.slice(),
});

// ---------------------------------------------------------------------------
// ls
// ---------------------------------------------------------------------------

describe("ls", () => {
  it("lists directory contents", async () => {
    const entries = await ls(ctx, testDir);
    const names = entries.map((e) => e.name);
    expect(names).toContain("hello.txt");
    expect(names).toContain("data.json");
    expect(names).toContain("sub");
  });

  it("skips hidden files by default", async () => {
    const entries = await ls(ctx, testDir);
    const names = entries.map((e) => e.name);
    expect(names).not.toContain(".hidden");
  });

  it("includes hidden files when requested", async () => {
    const entries = await ls(ctx, testDir, { hidden: true });
    const names = entries.map((e) => e.name);
    expect(names).toContain(".hidden");
  });

  it("lists recursively", async () => {
    const entries = await ls(ctx, testDir, { recursive: true });
    const names = entries.map((e) => e.name);
    expect(names).toContain("nested.ts");
  });

  it("filters with glob", async () => {
    const entries = await ls(ctx, testDir, { glob: "*.txt" });
    expect(entries.length).toBe(1);
    expect(entries[0]!.name).toBe("hello.txt");
  });

  it("sorts by name", async () => {
    const entries = await ls(ctx, testDir, { sortBy: "name" });
    const names = entries.map((e) => e.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it("returns FileEntry with correct structure", async () => {
    const entries = await ls(ctx, testDir, { glob: "*.txt" });
    const entry = entries[0]!;
    expect(entry.isFile).toBe(true);
    expect(entry.isDirectory).toBe(false);
    expect(entry.extension).toBe("txt");
    expect(entry.size).toBeGreaterThan(0);
    expect(entry.permissions.readable).toBe(true);
    expect(entry.modifiedAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// cat
// ---------------------------------------------------------------------------

describe("cat", () => {
  it("reads file contents", async () => {
    const content = await cat(ctx, join(testDir, "hello.txt"));
    expect(content).toBe("hello world");
  });

  it("throws on capability violation", () => {
    const restricted = createContext({
      name: "restricted",
      capabilities: capabilities()
        .fsRead(join(testDir, "*.json"))
        .build()
        .capabilities.slice(),
    });
    expect(cat(restricted, join(testDir, "hello.txt"))).rejects.toBeInstanceOf(
      CapabilityError,
    );
  });
});

// ---------------------------------------------------------------------------
// stat
// ---------------------------------------------------------------------------

describe("stat", () => {
  it("returns file info", async () => {
    const info = await stat(ctx, join(testDir, "hello.txt"));
    expect(info.isFile).toBe(true);
    expect(info.size).toBe(11); // "hello world"
    expect(info.name).toBe("hello.txt");
  });
});

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

describe("exists", () => {
  it("returns true for existing file", async () => {
    expect(await exists(ctx, join(testDir, "hello.txt"))).toBe(true);
  });

  it("returns false for non-existent file", async () => {
    expect(await exists(ctx, join(testDir, "nope.txt"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mkdir / write / rm
// ---------------------------------------------------------------------------

describe("mkdir + write + rm", () => {
  const newDir = join(testDir, "created");
  const newFile = join(newDir, "output.txt");

  it("creates directory, writes file, then removes", async () => {
    await mkdir(ctx, newDir);
    expect(await exists(ctx, newDir)).toBe(true);

    const result = await write(ctx, newFile, "test content");
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(await cat(ctx, newFile)).toBe("test content");

    await rm(ctx, newDir, { recursive: true });
    expect(await exists(ctx, newDir)).toBe(false);
  });

  it("write rejects without fs:write capability", () => {
    expect(
      write(readOnlyCtx, join(testDir, "nope.txt"), "data"),
    ).rejects.toBeInstanceOf(CapabilityError);
  });
});

// ---------------------------------------------------------------------------
// readJson / writeJson
// ---------------------------------------------------------------------------

describe("readJson / writeJson", () => {
  it("reads JSON files", async () => {
    const data = await readJson<{ key: string }>(
      ctx,
      join(testDir, "data.json"),
    );
    expect(data.key).toBe("value");
  });

  it("writes and reads JSON round-trip", async () => {
    const path = join(testDir, "round-trip.json");
    await writeJson(ctx, path, { items: [1, 2, 3] });
    const data = await readJson<{ items: number[] }>(ctx, path);
    expect(data.items).toEqual([1, 2, 3]);
    await rm(ctx, path);
  });
});

// ---------------------------------------------------------------------------
// cp / mv
// ---------------------------------------------------------------------------

describe("cp / mv", () => {
  it("copies a file", async () => {
    const dest = join(testDir, "hello-copy.txt");
    await cp(ctx, join(testDir, "hello.txt"), dest);
    expect(await cat(ctx, dest)).toBe("hello world");
    await rm(ctx, dest);
  });

  it("moves a file", async () => {
    const src = join(testDir, "moveme.txt");
    const dest = join(testDir, "moved.txt");
    await write(ctx, src, "move test");
    await mv(ctx, src, dest);
    expect(await exists(ctx, src)).toBe(false);
    expect(await cat(ctx, dest)).toBe("move test");
    await rm(ctx, dest);
  });
});

// ---------------------------------------------------------------------------
// find
// ---------------------------------------------------------------------------

describe("find", () => {
  it("finds files by glob pattern", async () => {
    const entries = await find(ctx, testDir, "*.ts");
    expect(entries.length).toBe(1);
    expect(entries[0]!.name).toBe("nested.ts");
  });
});

// ---------------------------------------------------------------------------
// du
// ---------------------------------------------------------------------------

describe("du", () => {
  it("calculates disk usage", async () => {
    const usage = await du(ctx, testDir);
    expect(usage.bytes).toBeGreaterThan(0);
    expect(usage.files).toBeGreaterThanOrEqual(3);
    expect(usage.human).toMatch(/\d+(\.\d+)?\s+(B|KB|MB)/);
  });
});
