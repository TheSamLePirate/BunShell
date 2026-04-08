import { describe, it, expect } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { gitStatus, gitLog, gitBranch } from "../../src/wrappers/git";

const ctx = createContext({
  name: "git-test",
  capabilities: capabilities().spawn(["git"]).build().capabilities.slice(),
});

describe("gitStatus", () => {
  it("returns structured status", async () => {
    const status = await gitStatus(ctx);
    expect(status.branch).toBeTruthy();
    expect(Array.isArray(status.staged)).toBe(true);
    expect(Array.isArray(status.unstaged)).toBe(true);
    expect(Array.isArray(status.untracked)).toBe(true);
    expect(typeof status.clean).toBe("boolean");
  });

  it("reports the current branch name", async () => {
    const status = await gitStatus(ctx);
    expect(status.branch).toBe("main");
  });
});

describe("gitLog", () => {
  it("returns structured commits", async () => {
    const commits = await gitLog(ctx, { limit: 5 });
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.length).toBeLessThanOrEqual(5);

    const first = commits[0]!;
    expect(first.hash.length).toBe(40);
    expect(first.shortHash.length).toBeGreaterThan(0);
    expect(first.author.length).toBeGreaterThan(0);
    expect(first.message.length).toBeGreaterThan(0);
    expect(first.date).toBeInstanceOf(Date);
  });

  it("respects limit", async () => {
    const commits = await gitLog(ctx, { limit: 2 });
    expect(commits.length).toBe(2);
  });
});

describe("gitBranch", () => {
  it("returns current branch and branch list", async () => {
    const branches = await gitBranch(ctx);
    expect(branches.current).toBe("main");
    expect(branches.branches).toContain("main");
  });
});
