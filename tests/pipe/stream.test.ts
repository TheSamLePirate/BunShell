import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  streamPipe,
  sFilter,
  sMap,
  sFlatMap,
  sTake,
  sSkip,
  sTap,
  sUnique,
  sPluck,
  sChunk,
  sScan,
  sTakeWhile,
  sSkipWhile,
  sToArray,
  sReduce,
  sCount,
  sFirst,
  sForEach,
  sToFile,
  fromArray,
  fromLines,
} from "../../src/pipe/stream";
import { lineStream } from "../../src/wrappers/stream";
import { createContext, capabilities } from "../../src/capabilities/index";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-stream-pipe");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
  // Create a test file with 10,000 lines
  const lines = Array.from(
    { length: 10000 },
    (_, i) =>
      `${i % 2 === 0 ? "INFO" : "ERROR"}: line ${i} data=${"x".repeat(i % 50)}`,
  );
  writeFileSync(join(testDir, "big.log"), lines.join("\n"));
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const ctx = createContext({
  name: "stream-test",
  capabilities: capabilities()
    .fsRead("**")
    .fsWrite("**")
    .build()
    .capabilities.slice(),
});

// ---------------------------------------------------------------------------
// sFilter
// ---------------------------------------------------------------------------

describe("sFilter", () => {
  it("filters items lazily", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray([1, 2, 3, 4, 5]),
        sFilter((n: number) => n > 3),
      ),
    );
    expect(result).toEqual([4, 5]);
  });

  it("supports async predicates", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray([1, 2, 3]),
        sFilter(async (n: number) => n % 2 === 0),
      ),
    );
    expect(result).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// sMap
// ---------------------------------------------------------------------------

describe("sMap", () => {
  it("transforms items lazily", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray([1, 2, 3]),
        sMap((n: number) => n * 10),
      ),
    );
    expect(result).toEqual([10, 20, 30]);
  });

  it("supports async mappers", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray(["a", "b"]),
        sMap(async (s: string) => s.toUpperCase()),
      ),
    );
    expect(result).toEqual(["A", "B"]);
  });
});

// ---------------------------------------------------------------------------
// sFlatMap
// ---------------------------------------------------------------------------

describe("sFlatMap", () => {
  it("maps and flattens", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray(["a b", "c d"]),
        sFlatMap((s: string) => s.split(" ")),
      ),
    );
    expect(result).toEqual(["a", "b", "c", "d"]);
  });
});

// ---------------------------------------------------------------------------
// sTake / sSkip
// ---------------------------------------------------------------------------

describe("sTake", () => {
  it("takes first N items", async () => {
    const result = await sToArray(
      streamPipe(fromArray([1, 2, 3, 4, 5]), sTake(3)),
    );
    expect(result).toEqual([1, 2, 3]);
  });

  it("stops consuming from upstream after N", async () => {
    let consumed = 0;
    async function* source() {
      for (let i = 0; i < 1000000; i++) {
        consumed++;
        yield i;
      }
    }
    const result = await sToArray(streamPipe(source(), sTake(5)));
    expect(result).toEqual([0, 1, 2, 3, 4]);
    expect(consumed).toBeLessThanOrEqual(6); // NOT 1000000 — at most one extra pull
  });
});

describe("sSkip", () => {
  it("skips first N items", async () => {
    const result = await sToArray(
      streamPipe(fromArray([1, 2, 3, 4, 5]), sSkip(3)),
    );
    expect(result).toEqual([4, 5]);
  });
});

// ---------------------------------------------------------------------------
// sTap
// ---------------------------------------------------------------------------

describe("sTap", () => {
  it("runs side effect without modifying items", async () => {
    const seen: number[] = [];
    const result = await sToArray(
      streamPipe(
        fromArray([1, 2, 3]),
        sTap((n: number) => {
          seen.push(n);
        }),
      ),
    );
    expect(result).toEqual([1, 2, 3]);
    expect(seen).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// sUnique
// ---------------------------------------------------------------------------

describe("sUnique", () => {
  it("deduplicates items", async () => {
    const result = await sToArray(
      streamPipe(fromArray([1, 2, 2, 3, 3, 1]), sUnique()),
    );
    expect(result).toEqual([1, 2, 3]);
  });

  it("deduplicates by key function", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray([{ id: 1 }, { id: 2 }, { id: 1 }]),
        sUnique((item: { id: number }) => item.id),
      ),
    );
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// sPluck
// ---------------------------------------------------------------------------

describe("sPluck", () => {
  it("extracts a property", async () => {
    const result = await sToArray(
      streamPipe(fromArray([{ name: "a" }, { name: "b" }]), sPluck("name")),
    );
    expect(result).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// sChunk
// ---------------------------------------------------------------------------

describe("sChunk", () => {
  it("groups items into batches", async () => {
    const result = await sToArray(
      streamPipe(fromArray([1, 2, 3, 4, 5]), sChunk(2)),
    );
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });
});

// ---------------------------------------------------------------------------
// sScan
// ---------------------------------------------------------------------------

describe("sScan", () => {
  it("yields running accumulation", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray([1, 2, 3, 4]),
        sScan((sum: number, n: number) => sum + n, 0),
      ),
    );
    expect(result).toEqual([1, 3, 6, 10]);
  });
});

// ---------------------------------------------------------------------------
// sTakeWhile / sSkipWhile
// ---------------------------------------------------------------------------

describe("sTakeWhile", () => {
  it("yields while predicate is true, then stops", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray([1, 2, 3, 4, 1, 2]),
        sTakeWhile((n: number) => n < 4),
      ),
    );
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("sSkipWhile", () => {
  it("skips while predicate is true, yields the rest", async () => {
    const result = await sToArray(
      streamPipe(
        fromArray([1, 2, 3, 4, 1, 2]),
        sSkipWhile((n: number) => n < 3),
      ),
    );
    expect(result).toEqual([3, 4, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Terminal sinks
// ---------------------------------------------------------------------------

describe("sReduce", () => {
  it("reduces stream to single value", async () => {
    const sum = await sReduce(fromArray([1, 2, 3, 4]), (acc, n) => acc + n, 0);
    expect(sum).toBe(10);
  });
});

describe("sCount", () => {
  it("counts items", async () => {
    const n = await sCount(
      streamPipe(
        fromArray([1, 2, 3, 4, 5]),
        sFilter((n: number) => n > 2),
      ),
    );
    expect(n).toBe(3);
  });
});

describe("sFirst", () => {
  it("returns first item", async () => {
    const item = await sFirst(fromArray([10, 20, 30]));
    expect(item).toBe(10);
  });

  it("returns undefined for empty stream", async () => {
    const item = await sFirst(fromArray([]));
    expect(item).toBeUndefined();
  });
});

describe("sForEach", () => {
  it("runs function for each item", async () => {
    const items: number[] = [];
    await sForEach(fromArray([1, 2, 3]), (n) => {
      items.push(n);
    });
    expect(items).toEqual([1, 2, 3]);
  });
});

describe("sToFile", () => {
  it("writes stream to file", async () => {
    const outPath = join(testDir, "stream-out.txt");
    const result = await sToFile(
      fromArray(["line1", "line2", "line3"]),
      outPath,
    );
    expect(result.lines).toBe(3);
    const content = readFileSync(outPath, "utf-8");
    expect(content).toBe("line1\nline2\nline3\n");
  });
});

// ---------------------------------------------------------------------------
// Complex chains
// ---------------------------------------------------------------------------

describe("complex stream chains", () => {
  it("filter → map → take on large data", async () => {
    // Simulates processing a large file without buffering
    async function* generate() {
      for (let i = 0; i < 1_000_000; i++) yield i;
    }
    const result = await sToArray(
      streamPipe(
        generate(),
        sFilter((n: number) => n % 1000 === 0),
        sMap((n: number) => `item-${n}`),
        sTake(5),
      ),
    );
    expect(result).toEqual([
      "item-0",
      "item-1000",
      "item-2000",
      "item-3000",
      "item-4000",
    ]);
  });

  it("processes real file with lineStream", async () => {
    // Use lineStream → sFilter → sTake on the 10K line test file
    const errors = await sToArray(
      streamPipe(
        lineStream(ctx, join(testDir, "big.log")),
        sFilter((line: string) => line.startsWith("ERROR")),
        sTake(10),
      ),
    );
    expect(errors.length).toBe(10);
    expect(errors[0]!.startsWith("ERROR")).toBe(true);
  });

  it("counts errors in 10K lines without buffering", async () => {
    const errorCount = await sCount(
      streamPipe(
        lineStream(ctx, join(testDir, "big.log")),
        sFilter((line: string) => line.startsWith("ERROR")),
      ),
    );
    expect(errorCount).toBe(5000); // Half the lines are ERROR
  });

  it("chunks + scan for batch processing", async () => {
    const batchSizes = await sToArray(
      streamPipe(
        fromArray(Array.from({ length: 25 }, (_, i) => i)),
        sChunk(10),
        sMap((batch: number[]) => batch.length),
      ),
    );
    expect(batchSizes).toEqual([10, 10, 5]);
  });
});

describe("fromLines", () => {
  it("yields lines from a string", async () => {
    const result = await sToArray(
      streamPipe(
        fromLines("hello\nworld\nfoo"),
        sFilter((l: string) => l.length > 3),
      ),
    );
    expect(result).toEqual(["hello", "world"]);
  });
});
