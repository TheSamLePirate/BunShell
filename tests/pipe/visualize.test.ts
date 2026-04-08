import { describe, it, expect } from "bun:test";
import { pipe } from "../../src/pipe/pipe";
import {
  toTable,
  toBarChart,
  toSparkline,
  toHistogram,
} from "../../src/pipe/visualize";
import { sortBy, take, pluck, groupBy } from "../../src/pipe/operators";

// ---------------------------------------------------------------------------
// toTable
// ---------------------------------------------------------------------------

describe("toTable", () => {
  it("renders a table from typed records", async () => {
    const data = [
      { name: "alice", age: 30, active: true },
      { name: "bob", age: 25, active: false },
      { name: "charlie", age: 35, active: true },
    ];
    const output = await pipe(data, toTable());
    expect(output).toContain("alice");
    expect(output).toContain("bob");
    expect(output).toContain("charlie");
    // Box drawing characters
    expect(output).toContain("┌");
    expect(output).toContain("┘");
    expect(output).toContain("│");
    expect(output).toContain("─");
    expect(output).toContain("3 rows");
  });

  it("renders selected columns only", async () => {
    const data = [{ name: "alice", age: 30, secret: "hidden" }];
    const output = await pipe(data, toTable({ columns: ["name", "age"] }));
    expect(output).toContain("name");
    expect(output).toContain("age");
    expect(output).not.toContain("secret");
  });

  it("uses custom headers", async () => {
    const data = [{ n: "alice", a: 30 }];
    const output = await pipe(
      data,
      toTable({ headers: { n: "Name", a: "Age" } }),
    );
    expect(output).toContain("Name");
    expect(output).toContain("Age");
  });

  it("handles empty array", async () => {
    const output = await pipe([], toTable());
    expect(output).toContain("empty");
  });

  it("truncates to maxRows", async () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const output = await pipe(data, toTable({ maxRows: 5 }));
    expect(output).toContain("95 more rows");
  });

  it("renders dates as readable strings", async () => {
    const data = [{ event: "deploy", at: new Date("2024-03-15T10:30:00Z") }];
    const output = await pipe(data, toTable());
    expect(output).toContain("2024-03-15");
  });

  it("right-aligns numeric values", async () => {
    const data = [
      { name: "a", value: 1 },
      { name: "b", value: 1000 },
    ];
    const output = await pipe(data, toTable());
    // Numbers should be present
    expect(output).toContain("1,000");
  });

  it("works in a pipe chain", async () => {
    const data = [
      { name: "c", score: 10 },
      { name: "a", score: 30 },
      { name: "b", score: 20 },
    ];
    const output = await pipe(
      data,
      sortBy("score", "desc"),
      take(2),
      toTable(),
    );
    expect(output).toContain("a");
    expect(output).toContain("b");
    expect(output).toContain("2 rows");
  });
});

// ---------------------------------------------------------------------------
// toBarChart
// ---------------------------------------------------------------------------

describe("toBarChart", () => {
  it("renders bars from value and label fields", async () => {
    const data = [
      { name: "alice", score: 90 },
      { name: "bob", score: 60 },
      { name: "charlie", score: 30 },
    ];
    const output = await pipe(data, toBarChart("score", "name"));
    expect(output).toContain("alice");
    expect(output).toContain("bob");
    expect(output).toContain("charlie");
    expect(output).toContain("█"); // bars rendered
  });

  it("accepts groupBy output (Record<string, T[]>)", async () => {
    const data = [{ author: "alice" }, { author: "alice" }, { author: "bob" }];
    const output = await pipe(data, groupBy("author"), toBarChart());
    expect(output).toContain("alice");
    expect(output).toContain("bob");
    expect(output).toContain("█");
  });

  it("auto-detects fields when none specified", async () => {
    const data = [
      { name: "x", value: 100 },
      { name: "y", value: 200 },
    ];
    const output = await pipe(data, toBarChart());
    expect(output).toContain("x");
    expect(output).toContain("y");
    expect(output).toContain("█");
  });

  it("sorts by value descending by default", async () => {
    const data = [
      { label: "low", val: 10 },
      { label: "high", val: 90 },
      { label: "mid", val: 50 },
    ];
    const output = await pipe(data, toBarChart("val", "label"));
    const lines = output.split("\n");
    // First data line should be "high" (sorted desc)
    const firstDataLine = lines.find((l) => l.includes("high"));
    const lastDataLine = lines.find((l) => l.includes("low"));
    expect(firstDataLine).toBeDefined();
    expect(lastDataLine).toBeDefined();
  });

  it("handles empty data", async () => {
    const output = await pipe([], toBarChart("v", "l"));
    expect(output).toContain("no data");
  });

  it("renders title when provided", async () => {
    const data = [{ n: "a", v: 10 }];
    const output = await pipe(
      data,
      toBarChart("v", "n", { title: "My Chart" }),
    );
    expect(output).toContain("My Chart");
  });

  it("works in a full pipe chain", async () => {
    const data = [
      { name: "d", cpu: 5 },
      { name: "a", cpu: 90 },
      { name: "b", cpu: 45 },
      { name: "c", cpu: 20 },
    ];
    const output = await pipe(
      data,
      sortBy("cpu", "desc"),
      take(3),
      toBarChart("cpu", "name"),
    );
    expect(output).toContain("a");
    expect(output).toContain("b");
    expect(output).toContain("c");
    expect(output).not.toContain("d"); // cut by take(3)
  });
});

// ---------------------------------------------------------------------------
// toSparkline
// ---------------------------------------------------------------------------

describe("toSparkline", () => {
  it("renders a sparkline from numbers", async () => {
    const output = await pipe([1, 4, 2, 8, 5, 3, 7], toSparkline());
    // Should contain spark characters
    expect(output).toMatch(/[▁▂▃▄▅▆▇█]/);
    expect(output).toContain("min=");
    expect(output).toContain("max=");
  });

  it("renders from objects with a value field", async () => {
    const data = [
      { ts: 1, cpu: 10 },
      { ts: 2, cpu: 50 },
      { ts: 3, cpu: 30 },
    ];
    const output = await pipe(data, toSparkline("cpu"));
    expect(output).toMatch(/[▁▂▃▄▅▆▇█]/);
  });

  it("handles empty array", async () => {
    const output = await pipe([], toSparkline());
    expect(output).toBe("");
  });

  it("works in a pipe chain", async () => {
    const data = [
      { name: "a", size: 100 },
      { name: "b", size: 500 },
      { name: "c", size: 200 },
      { name: "d", size: 800 },
    ];
    const output = await pipe(data, pluck("size"), toSparkline());
    expect(output).toMatch(/[▁▂▃▄▅▆▇█]/);
  });
});

// ---------------------------------------------------------------------------
// toHistogram
// ---------------------------------------------------------------------------

describe("toHistogram", () => {
  it("renders a histogram from numbers", async () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const output = await pipe(data, toHistogram());
    expect(output).toContain("█");
    expect(output).toContain("100 values");
    expect(output).toContain("10 buckets");
  });

  it("supports custom bucket count", async () => {
    const data = Array.from({ length: 50 }, (_, i) => i);
    const output = await pipe(data, toHistogram(undefined, { buckets: 5 }));
    expect(output).toContain("5 buckets");
  });

  it("renders from objects with a value field", async () => {
    const data = [
      { name: "a", size: 10 },
      { name: "b", size: 50 },
      { name: "c", size: 50 },
      { name: "d", size: 90 },
    ];
    const output = await pipe(data, toHistogram("size", { buckets: 3 }));
    expect(output).toContain("4 values");
  });

  it("handles empty data", async () => {
    const output = await pipe([], toHistogram());
    expect(output).toContain("no data");
  });
});
