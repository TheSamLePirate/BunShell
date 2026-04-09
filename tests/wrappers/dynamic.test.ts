import { describe, it, expect } from "bun:test";
import {
  validatePlugin,
  createPluginRegistry,
} from "../../src/wrappers/dynamic";
import {
  createContext,
  capabilities,
  CapabilityError,
  checkCapability,
} from "../../src/capabilities/index";

// ---------------------------------------------------------------------------
// Validation — banned imports
// ---------------------------------------------------------------------------

describe("validatePlugin — banned imports", () => {
  it("rejects node: protocol imports", () => {
    const result = validatePlugin(`
      import { readFileSync } from "node:fs";
      export function bad() { return readFileSync("/etc/passwd"); }
    `);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Banned import");
  });

  it("rejects bare builtin imports", () => {
    const result = validatePlugin(`
      import { spawn } from "child_process";
      export function bad() { return spawn("ls"); }
    `);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Banned import");
  });

  it("rejects require() of node builtins", () => {
    const result = validatePlugin(`
      const fs = require("node:fs");
      export function bad() { return fs.readFileSync("/etc"); }
    `);
    expect(result.valid).toBe(false);
  });

  it("rejects Bun.spawn direct usage", () => {
    const result = validatePlugin(`
      export function bad() { return Bun.spawn(["ls"]); }
    `);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Bun.spawn");
  });

  it("rejects Bun.write direct usage", () => {
    const result = validatePlugin(`
      export function bad() { return Bun.write("/tmp/f", "data"); }
    `);
    expect(result.valid).toBe(false);
  });

  it("rejects Bun.file direct usage", () => {
    const result = validatePlugin(`
      export function bad() { return Bun.file("/etc/passwd").text(); }
    `);
    expect(result.valid).toBe(false);
  });

  it("rejects eval()", () => {
    const result = validatePlugin(`
      export function bad() { return eval("process.exit(1)"); }
    `);
    expect(result.valid).toBe(false);
  });

  it("rejects Function constructor", () => {
    const result = validatePlugin(`
      export function bad() { return new Function("return process")(); }
    `);
    expect(result.valid).toBe(false);
  });

  it("rejects process.env access", () => {
    const result = validatePlugin(`
      export function bad() { return process.env.SECRET; }
    `);
    expect(result.valid).toBe(false);
  });

  it("ignores banned patterns in comments", () => {
    const result = validatePlugin(`
      // import { readFileSync } from "node:fs";
      /* Bun.spawn is not used here */
      export function good() { return 42; }
    `);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation — export detection
// ---------------------------------------------------------------------------

describe("validatePlugin — exports", () => {
  it("detects exported functions", () => {
    const result = validatePlugin(`
      export function hello() { return "world"; }
      export async function deploy() { return true; }
    `);
    expect(result.valid).toBe(true);
    expect(result.exports).toEqual(["hello", "deploy"]);
  });

  it("detects exported consts", () => {
    const result = validatePlugin(`
      export const TIMEOUT = 5000;
    `);
    expect(result.valid).toBe(true);
    expect(result.exports).toContain("TIMEOUT");
  });

  it("rejects empty plugin (no exports)", () => {
    const result = validatePlugin(`
      function internal() { return 1; }
    `);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("export");
  });

  it("accepts a well-formed plugin with RequireCap", () => {
    const result = validatePlugin(`
      import type { CapabilityKind, RequireCap } from "bunshell";

      export async function deploy<K extends CapabilityKind>(
        ctx: RequireCap<K, "plugin:deploy" | "net:fetch">,
        target: string,
      ): Promise<{ deployed: boolean }> {
        return { deployed: true };
      }
    `);
    expect(result.valid).toBe(true);
    expect(result.exports).toEqual(["deploy"]);
  });
});

// ---------------------------------------------------------------------------
// Plugin capability guard
// ---------------------------------------------------------------------------

describe("plugin:* capability guard", () => {
  it("exact plugin name match", () => {
    const held = {
      kind: "plugin:deploy" as const,
      pluginName: "deploy",
    };
    const required = {
      kind: "plugin:deploy" as const,
      pluginName: "deploy",
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });

  it("wildcard plugin grants all", () => {
    const held = {
      kind: "plugin:*" as const,
      pluginName: "*",
    };
    // kinds differ between held and required, so test via CapabilitySet
    const ctx = createContext({
      name: "test",
      capabilities: [held],
    });
    expect(ctx.caps.has("plugin:*")).toBe(true);
  });

  it("rejects mismatched plugin names", () => {
    const held = {
      kind: "plugin:deploy" as const,
      pluginName: "deploy",
    };
    const required = {
      kind: "plugin:deploy" as const,
      pluginName: "hack",
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(false);
  });

  it("glob matching on plugin names", () => {
    const held = {
      kind: "plugin:aws-*" as const,
      pluginName: "aws-*",
    };
    const required = {
      kind: "plugin:aws-*" as const,
      pluginName: "aws-deploy",
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Builder — plugin()
// ---------------------------------------------------------------------------

describe("capability builder — plugin()", () => {
  it("adds plugin capability", () => {
    const set = capabilities().plugin("deploy").build();
    expect(set.has("plugin:deploy")).toBe(true);
  });

  it("chains with core capabilities", () => {
    const set = capabilities()
      .fsRead("**")
      .netFetch(["api.github.com"])
      .plugin("deploy")
      .build();
    expect(set.has("fs:read")).toBe(true);
    expect(set.has("net:fetch")).toBe(true);
    expect(set.has("plugin:deploy")).toBe(true);
  });

  it("context demands plugin capability", () => {
    const ctx = createContext({
      name: "test",
      capabilities: capabilities()
        .plugin("deploy")
        .build()
        .capabilities.slice(),
    });

    expect(() =>
      ctx.caps.demand({
        kind: "plugin:deploy",
        pluginName: "deploy",
      } as never),
    ).not.toThrow();

    expect(() =>
      ctx.caps.demand({
        kind: "plugin:hack",
        pluginName: "hack",
      } as never),
    ).toThrow(CapabilityError);
  });
});

// ---------------------------------------------------------------------------
// Plugin Registry
// ---------------------------------------------------------------------------

describe("createPluginRegistry", () => {
  it("requests a plugin and tracks as pending", () => {
    const registry = createPluginRegistry();

    const pending = registry.request(
      "greet",
      `export function greet() { return "hello"; }`,
      "agent-1",
    );

    expect(pending.name).toBe("greet");
    expect(pending.status).toBe("pending");
    expect(pending.validation.valid).toBe(true);
    expect(pending.validation.exports).toEqual(["greet"]);
    expect(registry.listPending().length).toBe(1);
  });

  it("request detects invalid plugins", () => {
    const registry = createPluginRegistry();

    const pending = registry.request(
      "bad",
      `import { readFileSync } from "node:fs"; export function bad() {}`,
      "agent-1",
    );

    expect(pending.validation.valid).toBe(false);
    expect(pending.validation.errors.length).toBeGreaterThan(0);
  });

  it("approve loads a valid plugin", async () => {
    const registry = createPluginRegistry();

    registry.request(
      "math",
      `export function add(a, b) { return a + b; }`,
      "agent-1",
    );

    const ctx = createContext({
      name: "test",
      capabilities: capabilities().plugin("math").build().capabilities.slice(),
    });

    const loaded = await registry.approve("math", ctx);
    expect(loaded.name).toBe("math");
    expect(loaded.exportNames).toContain("add");
    expect(typeof loaded.exports["add"]).toBe("function");

    // Function works
    const addFn = loaded.exports["add"] as (a: number, b: number) => number;
    expect(addFn(2, 3)).toBe(5);

    // Registry tracks it
    expect(registry.get("math")).toBeDefined();
    expect(registry.list().length).toBe(1);
    expect(registry.listPending().length).toBe(0);
  });

  it("approve rejects invalid plugins", async () => {
    const registry = createPluginRegistry();

    registry.request(
      "bad",
      `import { readFileSync } from "node:fs"; export function bad() {}`,
      "agent-1",
    );

    const ctx = createContext({
      name: "test",
      capabilities: capabilities().plugin("bad").build().capabilities.slice(),
    });

    await expect(registry.approve("bad", ctx)).rejects.toThrow("validation");
  });

  it("approve demands plugin capability", async () => {
    const registry = createPluginRegistry();

    registry.request("tool", `export function tool() { return 1; }`, "agent-1");

    // Context WITHOUT plugin:tool capability
    const ctx = createContext({
      name: "test",
      capabilities: capabilities().fsRead("**").build().capabilities.slice(),
    });

    await expect(registry.approve("tool", ctx)).rejects.toThrow(
      "Capability denied",
    );
  });

  it("reject removes from pending", () => {
    const registry = createPluginRegistry();

    registry.request(
      "unwanted",
      `export function unwanted() { return 1; }`,
      "agent-1",
    );

    expect(registry.listPending().length).toBe(1);
    registry.reject("unwanted");
    expect(registry.listPending().length).toBe(0);
  });

  it("unload removes a loaded plugin", async () => {
    const registry = createPluginRegistry();

    registry.request("temp", `export function temp() { return 1; }`, "agent-1");

    const ctx = createContext({
      name: "test",
      capabilities: capabilities().plugin("temp").build().capabilities.slice(),
    });

    await registry.approve("temp", ctx);
    expect(registry.get("temp")).toBeDefined();

    const removed = registry.unload("temp");
    expect(removed).toBe(true);
    expect(registry.get("temp")).toBeUndefined();
  });

  it("allExports aggregates all loaded plugins", async () => {
    const registry = createPluginRegistry();

    registry.request(
      "alpha",
      `export function alphaFn() { return "a"; }`,
      "agent-1",
    );
    registry.request(
      "beta",
      `export function betaFn() { return "b"; }`,
      "agent-1",
    );

    const ctx = createContext({
      name: "test",
      capabilities: capabilities()
        .plugin("alpha")
        .plugin("beta")
        .build()
        .capabilities.slice(),
    });

    await registry.approve("alpha", ctx);
    await registry.approve("beta", ctx);

    const all = registry.allExports();
    expect(typeof all["alphaFn"]).toBe("function");
    expect(typeof all["betaFn"]).toBe("function");
  });
});
