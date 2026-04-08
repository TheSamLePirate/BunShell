import { describe, it, expect } from "bun:test";
import { pipe } from "../../src/pipe/pipe";
import {
  filter,
  map,
  reduce,
  take,
  skip,
  sortBy,
  groupBy,
  unique,
  flatMap,
  tap,
  count,
  first,
  last,
  pluck,
} from "../../src/pipe/operators";
import { from, collect } from "../../src/pipe/index";

// ---------------------------------------------------------------------------
// pipe() core
// ---------------------------------------------------------------------------

describe("pipe", () => {
  it("passes source through a single stage", async () => {
    const result = await pipe(
      [1, 2, 3],
      filter<number>((n) => n > 1),
    );
    expect(result).toEqual([2, 3]);
  });

  it("chains multiple stages", async () => {
    const result = await pipe(
      [3, 1, 4, 1, 5],
      filter<number>((n) => n > 2),
      take<number>(2),
    );
    expect(result).toEqual([3, 4]);
  });

  it("handles async sources", async () => {
    const asyncSource = Promise.resolve([1, 2, 3]);
    const result = await pipe(asyncSource, count<number>());
    expect(result).toBe(3);
  });

  it("handles async stages", async () => {
    const result = await pipe(
      [1, 2, 3],
      map<number, number>(async (n) => n * 2),
    );
    expect(result).toEqual([2, 4, 6]);
  });
});

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

describe("filter", () => {
  it("filters elements by predicate", async () => {
    const result = await pipe(
      [1, 2, 3, 4, 5],
      filter<number>((n) => n % 2 === 0),
    );
    expect(result).toEqual([2, 4]);
  });
});

describe("map", () => {
  it("transforms each element", async () => {
    const result = await pipe(
      [1, 2, 3],
      map<number, string>((n) => `item-${n}`),
    );
    expect(result).toEqual(["item-1", "item-2", "item-3"]);
  });
});

describe("reduce", () => {
  it("reduces to a single value", async () => {
    const result = await pipe(
      [1, 2, 3, 4],
      reduce<number, number>((acc, n) => acc + n, 0),
    );
    expect(result).toBe(10);
  });
});

describe("take", () => {
  it("takes first N elements", async () => {
    const result = await pipe([1, 2, 3, 4, 5], take<number>(3));
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("skip", () => {
  it("skips first N elements", async () => {
    const result = await pipe([1, 2, 3, 4, 5], skip<number>(2));
    expect(result).toEqual([3, 4, 5]);
  });
});

describe("sortBy", () => {
  interface Item {
    name: string;
    value: number;
  }

  it("sorts ascending by default", async () => {
    const data: Item[] = [
      { name: "c", value: 3 },
      { name: "a", value: 1 },
      { name: "b", value: 2 },
    ];
    const result = await pipe(data, sortBy<Item>("value"));
    expect(result.map((i) => i.name)).toEqual(["a", "b", "c"]);
  });

  it("sorts descending", async () => {
    const data: Item[] = [
      { name: "a", value: 1 },
      { name: "b", value: 2 },
      { name: "c", value: 3 },
    ];
    const result = await pipe(data, sortBy<Item>("value", "desc"));
    expect(result.map((i) => i.name)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate original array", async () => {
    const data = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const original = [...data];
    await pipe(data, sortBy<(typeof data)[0]>("v"));
    expect(data).toEqual(original);
  });
});

describe("groupBy", () => {
  it("groups elements by key", async () => {
    const data = [
      { type: "a", val: 1 },
      { type: "b", val: 2 },
      { type: "a", val: 3 },
    ];
    const result = await pipe(data, groupBy<(typeof data)[0]>("type"));
    expect(Object.keys(result)).toEqual(["a", "b"]);
    expect(result["a"]!.length).toBe(2);
    expect(result["b"]!.length).toBe(1);
  });
});

describe("unique", () => {
  it("removes duplicates from primitives", async () => {
    const result = await pipe([1, 2, 2, 3, 3, 3], unique<number>());
    expect(result).toEqual([1, 2, 3]);
  });

  it("removes duplicates by key", async () => {
    const data = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 1, name: "c" },
    ];
    const result = await pipe(data, unique<(typeof data)[0]>("id"));
    expect(result.length).toBe(2);
  });
});

describe("flatMap", () => {
  it("maps and flattens", async () => {
    const result = await pipe(
      ["a b", "c d"],
      flatMap<string, string>((s) => s.split(" ")),
    );
    expect(result).toEqual(["a", "b", "c", "d"]);
  });
});

describe("tap", () => {
  it("runs side effect without modifying data", async () => {
    let captured: number[] = [];
    const result = await pipe(
      [1, 2, 3],
      tap<number[]>((data) => {
        captured = data;
      }),
    );
    expect(result).toEqual([1, 2, 3]);
    expect(captured).toEqual([1, 2, 3]);
  });
});

describe("count", () => {
  it("counts elements", async () => {
    const result = await pipe([1, 2, 3], count<number>());
    expect(result).toBe(3);
  });
});

describe("first / last", () => {
  it("returns first element", async () => {
    const result = await pipe([10, 20, 30], first<number>());
    expect(result).toBe(10);
  });

  it("returns last element", async () => {
    const result = await pipe([10, 20, 30], last<number>());
    expect(result).toBe(30);
  });

  it("returns undefined for empty array", async () => {
    const result = await pipe([], first<number>());
    expect(result).toBeUndefined();
  });
});

describe("pluck", () => {
  it("extracts a property from each element", async () => {
    const data = [
      { name: "alice", age: 30 },
      { name: "bob", age: 25 },
    ];
    const result = await pipe(data, pluck<(typeof data)[0], "name">("name"));
    expect(result).toEqual(["alice", "bob"]);
  });
});

// ---------------------------------------------------------------------------
// from / collect helpers
// ---------------------------------------------------------------------------

describe("from", () => {
  it("creates a source from an array", () => {
    expect(from([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("collect", () => {
  it("returns data unchanged", async () => {
    const result = await pipe([1, 2, 3], collect<number[]>());
    expect(result).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Complex chains
// ---------------------------------------------------------------------------

describe("complex pipe chains", () => {
  interface Record {
    name: string;
    score: number;
    category: string;
  }

  const data: Record[] = [
    { name: "alice", score: 95, category: "A" },
    { name: "bob", score: 72, category: "B" },
    { name: "charlie", score: 88, category: "A" },
    { name: "diana", score: 65, category: "B" },
    { name: "eve", score: 91, category: "A" },
  ];

  it("filter → sortBy → take → pluck", async () => {
    const result = await pipe(
      data,
      filter<Record>((r) => r.score > 70),
      sortBy<Record>("score", "desc"),
      take<Record>(3),
      pluck<Record, "name">("name"),
    );
    expect(result).toEqual(["alice", "eve", "charlie"]);
  });

  it("filter → count", async () => {
    const result = await pipe(
      data,
      filter<Record>((r) => r.category === "A"),
      count<Record>(),
    );
    expect(result).toBe(3);
  });

  it("sortBy → first", async () => {
    const result = await pipe(
      data,
      sortBy<Record>("score", "desc"),
      first<Record>(),
    );
    expect(result?.name).toBe("alice");
  });
});
