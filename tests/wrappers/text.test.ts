import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { grep, sort, uniq, head, tail, wc } from "../../src/wrappers/text";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-text");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
  writeFileSync(
    join(testDir, "log.txt"),
    "INFO: started\nERROR: failed\nINFO: running\nERROR: timeout\nDEBUG: trace",
  );
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const ctx = createContext({
  name: "test",
  capabilities: capabilities().fsRead("**").build().capabilities.slice(),
});

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

describe("grep", () => {
  it("finds matches in a file", async () => {
    const matches = await grep(ctx, "ERROR", join(testDir, "log.txt"));
    expect(matches.length).toBe(2);
    expect(matches[0]!.line).toBe(2);
    expect(matches[0]!.content).toBe("ERROR: failed");
  });

  it("supports regex patterns", async () => {
    const matches = await grep(ctx, /ERROR|DEBUG/, join(testDir, "log.txt"));
    expect(matches.length).toBe(3);
  });

  it("supports case-insensitive search", async () => {
    const matches = await grep(ctx, "error", join(testDir, "log.txt"), {
      ignoreCase: true,
    });
    expect(matches.length).toBe(2);
  });

  it("respects maxMatches", async () => {
    const matches = await grep(ctx, "INFO", join(testDir, "log.txt"), {
      maxMatches: 1,
    });
    expect(matches.length).toBe(1);
  });

  it("supports invert match", async () => {
    const matches = await grep(ctx, "ERROR", join(testDir, "log.txt"), {
      invert: true,
    });
    expect(matches.length).toBe(3); // INFO, INFO, DEBUG
  });

  it("searches string input directly", async () => {
    const matches = await grep(ctx, "world", null, {
      input: "hello world\nfoo bar",
    });
    expect(matches.length).toBe(1);
    expect(matches[0]!.file).toBeNull();
  });

  it("returns structured GrepMatch", async () => {
    const matches = await grep(ctx, "ERROR", join(testDir, "log.txt"));
    const m = matches[0]!;
    expect(m.file).toBe(join(testDir, "log.txt"));
    expect(m.line).toBe(2);
    expect(m.column).toBeGreaterThan(0);
    expect(m.match).toBe("ERROR");
  });
});

// ---------------------------------------------------------------------------
// sort
// ---------------------------------------------------------------------------

describe("sort", () => {
  it("sorts lines alphabetically", () => {
    expect(sort("banana\napple\ncherry")).toBe("apple\nbanana\ncherry");
  });

  it("sorts in reverse", () => {
    expect(sort("a\nb\nc", { reverse: true })).toBe("c\nb\na");
  });

  it("sorts numerically", () => {
    expect(sort("10\n2\n30\n1", { numeric: true })).toBe("1\n2\n10\n30");
  });

  it("removes duplicates with unique", () => {
    expect(sort("b\na\nb\na", { unique: true })).toBe("a\nb");
  });
});

// ---------------------------------------------------------------------------
// uniq
// ---------------------------------------------------------------------------

describe("uniq", () => {
  it("removes consecutive duplicates", () => {
    expect(uniq("a\na\nb\nb\na")).toBe("a\nb\na");
  });

  it("counts occurrences", () => {
    const result = uniq("a\na\na\nb\nb", { count: true });
    expect(result).toContain("3 a");
    expect(result).toContain("2 b");
  });
});

// ---------------------------------------------------------------------------
// head / tail
// ---------------------------------------------------------------------------

describe("head", () => {
  it("returns first N lines", () => {
    expect(head("a\nb\nc\nd\ne", 3)).toBe("a\nb\nc");
  });

  it("defaults to 10 lines", () => {
    const lines = Array.from({ length: 20 }, (_, i) => String(i)).join("\n");
    expect(head(lines).split("\n").length).toBe(10);
  });
});

describe("tail", () => {
  it("returns last N lines", () => {
    expect(tail("a\nb\nc\nd\ne", 2)).toBe("d\ne");
  });
});

// ---------------------------------------------------------------------------
// wc
// ---------------------------------------------------------------------------

describe("wc", () => {
  it("counts lines, words, chars, bytes", () => {
    const result = wc("hello world\nfoo bar");
    expect(result.lines).toBe(2);
    expect(result.words).toBe(4);
    expect(result.chars).toBe(19);
    expect(result.bytes).toBe(19);
  });

  it("handles empty string", () => {
    const result = wc("");
    expect(result.lines).toBe(0);
    expect(result.words).toBe(0);
    expect(result.chars).toBe(0);
  });
});
