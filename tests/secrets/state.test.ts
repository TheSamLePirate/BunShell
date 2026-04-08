import { describe, it, expect, afterAll } from "bun:test";
import { createStateStore } from "../../src/secrets/state";
import { createContext, capabilities } from "../../src/capabilities/index";
import { rmSync } from "node:fs";
import { join } from "node:path";

const ctx = createContext({
  name: "state-test",
  capabilities: capabilities()
    .secretRead(["*"])
    .secretWrite(["*"])
    .build()
    .capabilities.slice(),
});

const testDir = join(import.meta.dir, ".tmp-test-state");
import { mkdirSync } from "node:fs";
mkdirSync(testDir, { recursive: true });

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("createStateStore", () => {
  it("sets and gets typed values", () => {
    const state = createStateStore();
    state.set(ctx, "user", { name: "alice", role: "admin" });
    const user = state.get<{ name: string; role: string }>(ctx, "user");
    expect(user).toBeDefined();
    expect(user!.name).toBe("alice");
    expect(user!.role).toBe("admin");
  });

  it("returns undefined for missing keys", () => {
    const state = createStateStore();
    expect(state.get(ctx, "nope")).toBeUndefined();
  });

  it("has() checks existence", () => {
    const state = createStateStore();
    state.set(ctx, "k", "v");
    expect(state.has(ctx, "k")).toBe(true);
    expect(state.has(ctx, "nope")).toBe(false);
  });

  it("delete() removes entries", () => {
    const state = createStateStore();
    state.set(ctx, "k", "v");
    state.delete(ctx, "k");
    expect(state.has(ctx, "k")).toBe(false);
  });

  it("keys() lists keys with optional glob", () => {
    const state = createStateStore();
    state.set(ctx, "auth.github.token", "ghp");
    state.set(ctx, "auth.github.user", "alice");
    state.set(ctx, "auth.gitlab.token", "glpat");
    state.set(ctx, "config.theme", "dark");

    const all = state.keys(ctx);
    expect(all.length).toBe(4);

    const github = state.keys(ctx, "auth.github.*");
    expect(github.length).toBe(2);
    expect(github).toContain("auth.github.token");
    expect(github).toContain("auth.github.user");
  });

  it("count tracks entries", () => {
    const state = createStateStore();
    expect(state.count).toBe(0);
    state.set(ctx, "a", 1);
    state.set(ctx, "b", 2);
    expect(state.count).toBe(2);
  });

  it("handles complex nested objects", () => {
    const state = createStateStore();
    state.set(ctx, "complex", {
      tokens: ["a", "b"],
      nested: { deep: { value: 42 } },
    });
    const val = state.get<{
      tokens: string[];
      nested: { deep: { value: number } };
    }>(ctx, "complex");
    expect(val!.tokens).toEqual(["a", "b"]);
    expect(val!.nested.deep.value).toBe(42);
  });
});

describe("TTL", () => {
  it("expired entries return undefined", () => {
    const state = createStateStore();
    state.set(ctx, "temp", "value", 1); // 1ms TTL
    // Wait for expiration
    const start = Date.now();
    while (Date.now() - start < 10) {
      /* busy wait */
    }
    expect(state.get(ctx, "temp")).toBeUndefined();
  });

  it("non-expired entries are accessible", () => {
    const state = createStateStore();
    state.set(ctx, "fresh", "value", 60000); // 60s TTL
    expect(state.get<string>(ctx, "fresh")).toBe("value");
  });
});

describe("snapshot / restore", () => {
  it("round-trips through snapshot", () => {
    const state = createStateStore();
    state.set(ctx, "a", { x: 1 });
    state.set(ctx, "b", "hello");

    const snap = state.snapshot();
    const state2 = createStateStore();
    state2.restore(snap);

    expect(state2.get<{ x: number }>(ctx, "a")).toEqual({ x: 1 });
    expect(state2.get<string>(ctx, "b")).toBe("hello");
  });
});

describe("file persistence", () => {
  it("save and load from file", async () => {
    const path = join(testDir, "state.json");

    const state = createStateStore();
    state.set(ctx, "key1", "val1");
    state.set(ctx, "key2", { n: 42 });
    await state.save(path);

    const state2 = createStateStore();
    await state2.load(path);
    expect(state2.get<string>(ctx, "key1")).toBe("val1");
    expect(state2.get<{ n: number }>(ctx, "key2")!.n).toBe(42);
  });
});
