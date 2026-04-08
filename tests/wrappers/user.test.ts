import { describe, it, expect } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { currentUser, users, groups } from "../../src/wrappers/user";

const ctx = createContext({
  name: "user-test",
  capabilities: capabilities()
    .envRead(["*"])
    .fsRead("**")
    .build()
    .capabilities.slice(),
});

describe("currentUser", () => {
  it("returns current user info", () => {
    const user = currentUser(ctx);
    expect(user.username.length).toBeGreaterThan(0);
    expect(user.home.length).toBeGreaterThan(0);
    expect(typeof user.uid).toBe("number");
    expect(typeof user.gid).toBe("number");
  });
});

describe("users", () => {
  it("lists system users from /etc/passwd", async () => {
    const list = await users(ctx);
    expect(list.length).toBeGreaterThan(0);
    const root = list.find((u) => u.username === "root");
    expect(root).toBeDefined();
    expect(root!.uid).toBe(0);
  });

  it("returns structured UserEntry objects", async () => {
    const list = await users(ctx);
    const first = list[0]!;
    expect(typeof first.username).toBe("string");
    expect(typeof first.uid).toBe("number");
    expect(typeof first.gid).toBe("number");
    expect(typeof first.home).toBe("string");
    expect(typeof first.shell).toBe("string");
  });
});

describe("groups", () => {
  it("lists system groups from /etc/group", async () => {
    const list = await groups(ctx);
    expect(list.length).toBeGreaterThan(0);
  });

  it("returns structured GroupEntry objects", async () => {
    const list = await groups(ctx);
    const first = list[0]!;
    expect(typeof first.name).toBe("string");
    expect(typeof first.gid).toBe("number");
    expect(Array.isArray(first.members)).toBe(true);
  });
});
