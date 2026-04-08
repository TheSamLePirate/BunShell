import { describe, it, expect } from "bun:test";
import {
  createContext,
  capabilities,
  CapabilityError,
} from "../../src/capabilities/index";
import { env, getEnv, setEnv } from "../../src/wrappers/env";

const fullCtx = createContext({
  name: "test",
  capabilities: capabilities()
    .envRead(["*"])
    .envWrite(["*"])
    .build()
    .capabilities.slice(),
});

const restrictedCtx = createContext({
  name: "restricted",
  capabilities: capabilities()
    .envRead(["HOME", "PATH"])
    .envWrite(["TEST_VAR"])
    .build()
    .capabilities.slice(),
});

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

describe("env", () => {
  it("returns all environment variables as entries", () => {
    const entries = env(fullCtx);
    expect(entries.length).toBeGreaterThan(0);
    const keys = entries.map((e) => e.key);
    expect(keys).toContain("PATH");
  });

  it("entries have key and value", () => {
    const entries = env(fullCtx);
    const pathEntry = entries.find((e) => e.key === "PATH");
    expect(pathEntry).toBeDefined();
    expect(pathEntry!.value.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getEnv
// ---------------------------------------------------------------------------

describe("getEnv", () => {
  it("reads an environment variable", () => {
    const home = getEnv(fullCtx, "HOME");
    expect(home).toBeDefined();
    expect(home!.length).toBeGreaterThan(0);
  });

  it("returns undefined for missing variables", () => {
    const val = getEnv(fullCtx, "BUNSHELL_DOES_NOT_EXIST_12345");
    expect(val).toBeUndefined();
  });

  it("restricted context can read allowed keys", () => {
    const home = getEnv(restrictedCtx, "HOME");
    expect(home).toBeDefined();
  });

  it("restricted context rejects disallowed keys", () => {
    expect(() => getEnv(restrictedCtx, "SECRET_KEY")).toThrow(CapabilityError);
  });
});

// ---------------------------------------------------------------------------
// setEnv
// ---------------------------------------------------------------------------

describe("setEnv", () => {
  it("sets an environment variable", () => {
    setEnv(fullCtx, "BUNSHELL_TEST_SET", "hello");
    expect(process.env["BUNSHELL_TEST_SET"]).toBe("hello");
    delete process.env["BUNSHELL_TEST_SET"];
  });

  it("restricted context can write allowed keys", () => {
    setEnv(restrictedCtx, "TEST_VAR", "ok");
    expect(process.env["TEST_VAR"]).toBe("ok");
    delete process.env["TEST_VAR"];
  });

  it("restricted context rejects disallowed write keys", () => {
    expect(() => setEnv(restrictedCtx, "PATH", "bad")).toThrow(CapabilityError);
  });
});
