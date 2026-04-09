import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { findConfig, loadEnvironment } from "../../src/config/loader";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-config");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("findConfig", () => {
  it("finds .bunshell.ts", () => {
    writeFileSync(join(testDir, ".bunshell.ts"), "export default {}");
    expect(findConfig(testDir)).toBe(join(testDir, ".bunshell.ts"));
    rmSync(join(testDir, ".bunshell.ts"));
  });

  it("finds bunshell.config.ts", () => {
    writeFileSync(join(testDir, "bunshell.config.ts"), "export default {}");
    expect(findConfig(testDir)).toBe(join(testDir, "bunshell.config.ts"));
    rmSync(join(testDir, "bunshell.config.ts"));
  });

  it("returns null when no config exists", () => {
    expect(findConfig(testDir)).toBeNull();
  });
});

describe("loadEnvironment", () => {
  it("loads a config and creates full environment", async () => {
    const configPath = join(testDir, ".bunshell.ts");
    writeFileSync(
      configPath,
      `export default {
        name: "test-agent",
        capabilities: {
          fs: { read: ["**"] },
          env: { read: ["HOME"] },
        },
        audit: { console: false },
      }`,
    );

    const env = await loadEnvironment(configPath);

    expect(env.name).toBe("test-agent");
    expect(env.ctx.name).toBe("test-agent");
    expect(env.ctx.caps.has("fs:read")).toBe(true);
    expect(env.ctx.caps.has("env:read")).toBe(true);
    expect(env.ctx.caps.has("fs:write")).toBe(false);
    expect(env.ctx.caps.has("process:spawn")).toBe(false);
    expect(env.vfs).toBeDefined();
    expect(env.secrets).toBeDefined();
    expect(env.audit).toBeDefined();
  });

  it("imports secrets from env", async () => {
    process.env["BUNSHELL_TEST_SECRET"] = "test-value-123";

    const configPath = join(testDir, "secrets-config.ts");
    writeFileSync(
      configPath,
      `export default {
        name: "secret-test",
        capabilities: {
          secrets: { read: ["BUNSHELL_TEST_SECRET"], write: ["BUNSHELL_TEST_SECRET"] },
          env: { read: ["BUNSHELL_TEST_SECRET"] },
        },
        secrets: { fromEnv: ["BUNSHELL_TEST_SECRET"] },
      }`,
    );

    const env = await loadEnvironment(configPath);

    // Secret should be in the store, accessible via the context
    const value = env.secrets.get(env.ctx, "BUNSHELL_TEST_SECRET");
    expect(value).toBe("test-value-123");

    delete process.env["BUNSHELL_TEST_SECRET"];
  });

  it("mounts disk directories into VFS", async () => {
    // Create a source directory with files
    const srcDir = join(testDir, "mount-src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "hello.txt"), "world");

    const configPath = join(testDir, "vfs-config.ts");
    writeFileSync(
      configPath,
      `export default {
        name: "vfs-test",
        capabilities: { fs: { read: ["**"] } },
        vfs: {
          mount: [{ from: "${srcDir}", to: "/mounted" }],
        },
      }`,
    );

    const env = await loadEnvironment(configPath);

    expect(env.vfs.exists("/mounted")).toBe(true);
    expect(env.vfs.readFile("/mounted/hello.txt")).toBe("world");
  });

  it("rejects config without name", async () => {
    const configPath = join(testDir, "no-name.ts");
    writeFileSync(configPath, `export default { capabilities: {} }`);
    await expect(loadEnvironment(configPath)).rejects.toThrow("name");
  });

  it("rejects config without capabilities", async () => {
    const configPath = join(testDir, "no-caps.ts");
    writeFileSync(configPath, `export default { name: "test" }`);
    await expect(loadEnvironment(configPath)).rejects.toThrow("capabilities");
  });

  it("builds all capability types from config", async () => {
    const configPath = join(testDir, "all-caps.ts");
    writeFileSync(
      configPath,
      `export default {
        name: "full",
        capabilities: {
          fs: { read: ["**"], write: ["/tmp/**"], delete: ["/tmp/**"] },
          process: { spawn: ["git"] },
          net: { fetch: ["api.github.com"], listen: [3000] },
          env: { read: ["*"], write: ["NODE_ENV"] },
          db: { query: ["/data/**"] },
          secrets: { read: ["*"], write: ["*"] },
          os: { interact: true },
        },
      }`,
    );

    const env = await loadEnvironment(configPath);

    expect(env.ctx.caps.has("fs:read")).toBe(true);
    expect(env.ctx.caps.has("fs:write")).toBe(true);
    expect(env.ctx.caps.has("fs:delete")).toBe(true);
    expect(env.ctx.caps.has("process:spawn")).toBe(true);
    expect(env.ctx.caps.has("net:fetch")).toBe(true);
    expect(env.ctx.caps.has("net:listen")).toBe(true);
    expect(env.ctx.caps.has("env:read")).toBe(true);
    expect(env.ctx.caps.has("env:write")).toBe(true);
    expect(env.ctx.caps.has("db:query")).toBe(true);
    expect(env.ctx.caps.has("secret:read")).toBe(true);
    expect(env.ctx.caps.has("secret:write")).toBe(true);
    expect(env.ctx.caps.has("os:interact")).toBe(true);
  });
});
