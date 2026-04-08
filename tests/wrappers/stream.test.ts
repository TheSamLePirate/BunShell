import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { lineStream, pipeSpawn } from "../../src/wrappers/stream";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-stream");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
  writeFileSync(
    join(testDir, "lines.txt"),
    "line1\nline2\nline3\nline4\nline5",
  );
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const ctx = createContext({
  name: "test",
  capabilities: capabilities()
    .fsRead("**")
    .spawn(["*"])
    .build()
    .capabilities.slice(),
});

describe("lineStream", () => {
  it("streams file line by line", async () => {
    const lines: string[] = [];
    for await (const line of lineStream(ctx, join(testDir, "lines.txt"))) {
      lines.push(line);
    }
    expect(lines).toEqual(["line1", "line2", "line3", "line4", "line5"]);
  });

  it("works with early break", async () => {
    const lines: string[] = [];
    for await (const line of lineStream(ctx, join(testDir, "lines.txt"))) {
      lines.push(line);
      if (lines.length === 2) break;
    }
    expect(lines).toEqual(["line1", "line2"]);
  });
});

describe("pipeSpawn", () => {
  it("pipes input to command stdin", async () => {
    const result = await pipeSpawn(ctx, "sort", [], "banana\napple\ncherry");
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("apple\nbanana\ncherry");
  });

  it("pipes input to grep", async () => {
    const result = await pipeSpawn(
      ctx,
      "grep",
      ["error"],
      "info: ok\nerror: bad\ninfo: fine\nerror: worse",
    );
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("error: bad\nerror: worse");
  });

  it("returns failure on non-zero exit", async () => {
    const result = await pipeSpawn(ctx, "grep", ["nomatch"], "hello\nworld");
    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });
});
