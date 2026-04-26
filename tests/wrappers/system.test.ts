import { describe, it, expect } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { uname, uptime, whoami, hostname } from "../../src/wrappers/system";

const ctx = createContext({
  name: "test",
  capabilities: capabilities()
    .envRead(["*"])
    .spawn(["df"])
    .build()
    .capabilities.slice(),
});

describe("uname", () => {
  it("returns system info", () => {
    const info = uname(ctx);
    expect(["darwin", "linux", "win32"]).toContain(info.os);
    expect(info.arch).toBeTruthy();
    expect(info.hostname).toBeTruthy();
    expect(info.release).toBeTruthy();
    expect(info.platform.startsWith(info.os)).toBe(true);
  });
});

describe("uptime", () => {
  it("returns a positive number", () => {
    const seconds = uptime(ctx);
    expect(seconds).toBeGreaterThan(0);
  });
});

describe("whoami", () => {
  it("returns current username", () => {
    const user = whoami(ctx);
    expect(user.length).toBeGreaterThan(0);
  });
});

describe("hostname", () => {
  it("returns system hostname", () => {
    const name = hostname(ctx);
    expect(name.length).toBeGreaterThan(0);
  });
});
