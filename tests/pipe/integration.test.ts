import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { ls } from "../../src/wrappers/fs";
import {
  pipe,
  filter,
  sortBy,
  pluck,
  count,
  toFile,
  toJSON,
} from "../../src/pipe/index";
import type { FileEntry } from "../../src/wrappers/types";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-pipe-int");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, "small.txt"), "hi");
  writeFileSync(join(testDir, "medium.txt"), "a".repeat(500));
  writeFileSync(join(testDir, "large.txt"), "b".repeat(2000));
  writeFileSync(join(testDir, "app.ts"), "export const x = 1;");
  writeFileSync(join(testDir, "test.ts"), "import { x } from './app';");
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const ctx = createContext({
  name: "pipe-test",
  capabilities: capabilities()
    .fsRead("**")
    .fsWrite("**")
    .build()
    .capabilities.slice(),
});

describe("pipe + wrappers integration", () => {
  it("ls → filter → sortBy → pluck", async () => {
    const names = await pipe(
      ls(ctx, testDir),
      filter<FileEntry>((f) => f.extension === "ts"),
      sortBy<FileEntry>("name"),
      pluck<FileEntry, "name">("name"),
    );
    expect(names).toEqual(["app.ts", "test.ts"]);
  });

  it("ls → filter by size → count", async () => {
    const n = await pipe(
      ls(ctx, testDir),
      filter<FileEntry>((f) => f.size > 100),
      count<FileEntry>(),
    );
    expect(n).toBe(2); // medium.txt and large.txt
  });

  it("ls → filter → toFile sink", async () => {
    const outPath = join(testDir, "output.txt");
    const result = await pipe(
      ls(ctx, testDir, { glob: "*.ts" }),
      pluck<FileEntry, "name">("name"),
      toFile(ctx, outPath),
    );
    expect(result.bytesWritten).toBeGreaterThan(0);
    const content = await Bun.file(outPath).text();
    expect(content).toContain("app.ts");
    expect(content).toContain("test.ts");
  });

  it("ls → filter → toJSON sink", async () => {
    const outPath = join(testDir, "report.json");
    const result = await pipe(
      ls(ctx, testDir, { glob: "*.txt" }),
      filter<FileEntry>((f) => f.size > 100),
      sortBy<FileEntry>("size", "desc"),
      toJSON(ctx, outPath),
    );
    expect(result.bytesWritten).toBeGreaterThan(0);
    const parsed = JSON.parse(await Bun.file(outPath).text());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });
});
