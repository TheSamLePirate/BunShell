import { describe, it, expect, beforeAll } from "bun:test";
import { createVfs } from "../../src/vfs/vfs";
import { createContext } from "../../src/capabilities/context";
import { capabilities } from "../../src/capabilities/builder";
import { createSecretStore } from "../../src/secrets/store";
import { secretFromEnv } from "../../src/secrets/auth";
import { randomBytes } from "../../src/wrappers/crypto";

/**
 * Git mount tests use BunShell's own secret system:
 * 1. Load GITHUB_TOKEN from .env via secretFromEnv()
 * 2. Requires secret:read + secret:write + env:read capabilities
 * 3. Token is encrypted at rest in SecretStore
 * 4. Passed to mountGit via options.token
 *
 * This is how an agent would authenticate — dogfooding the capability system.
 */

// Context with capabilities needed for secret management + git mounting
const ctx = createContext({
  name: "git-mount-test",
  capabilities: capabilities()
    .secretRead(["GITHUB_TOKEN"])
    .secretWrite(["GITHUB_TOKEN"])
    .envRead(["GITHUB_TOKEN"])
    .fsRead("*")
    .build()
    .capabilities.slice(),
});

const masterKey = randomBytes(32);
const secrets = createSecretStore(masterKey);
let token: string | undefined;

beforeAll(() => {
  // Load token from .env into encrypted secret store
  try {
    secretFromEnv(ctx, secrets, "GITHUB_TOKEN");
    token = secrets.get(ctx, "GITHUB_TOKEN");
  } catch {
    // No .env or no GITHUB_TOKEN — tests will use unauthenticated requests
    token = undefined;
  }
});

function gitOpts(extra?: Record<string, unknown>) {
  const opts: Record<string, unknown> = { maxFiles: 10, ...extra };
  if (token) opts["token"] = token;
  return opts;
}

describe("mountGit", () => {
  it("mounts a public repo into VFS", async () => {
    const vfs = createVfs();
    const result = await vfs.mountGit(
      "github://octocat/Hello-World",
      "/repo",
      gitOpts(),
    );

    expect(result.owner).toBe("octocat");
    expect(result.repo).toBe("Hello-World");
    expect(result.filesLoaded).toBeGreaterThan(0);
    expect(result.totalSize).toBeGreaterThan(0);

    // Files are in VFS
    expect(vfs.exists("/repo")).toBe(true);
    const entries = vfs.readdir("/repo");
    expect(entries.length).toBeGreaterThan(0);

    // Should have a README
    expect(entries.some((e) => e.name.toLowerCase().includes("readme"))).toBe(
      true,
    );
  }, 30000);

  it("rejects invalid URLs", async () => {
    const vfs = createVfs();
    await expect(vfs.mountGit("not-a-url", "/repo")).rejects.toThrow(
      "Invalid git URL",
    );
  });

  it("rejects missing repos", async () => {
    const vfs = createVfs();
    await expect(
      vfs.mountGit(
        "github://nonexistent-user-xyz/nonexistent-repo-xyz",
        "/repo",
        gitOpts(),
      ),
    ).rejects.toThrow("GitHub API error");
  }, 15000);

  it("respects maxFiles limit", async () => {
    const vfs = createVfs();
    const result = await vfs.mountGit(
      "github://octocat/Hello-World",
      "/limited",
      gitOpts({ maxFiles: 2 }),
    );
    expect(result.filesLoaded).toBeLessThanOrEqual(2);
  }, 30000);

  it("supports @ref for branches/tags", async () => {
    const vfs = createVfs();
    const result = await vfs.mountGit(
      "github://octocat/Hello-World@master",
      "/ref-test",
      gitOpts({ maxFiles: 5 }),
    );
    expect(result.filesLoaded).toBeGreaterThan(0);
  }, 30000);

  it("files are readable after mount", async () => {
    const vfs = createVfs();
    await vfs.mountGit(
      "github://octocat/Hello-World",
      "/readable",
      gitOpts({ maxFiles: 5 }),
    );

    const entries = vfs.readdir("/readable");
    const file = entries.find((e) => e.isFile);
    if (file) {
      const content = vfs.readFile(file.path);
      expect(content.length).toBeGreaterThan(0);
    }
  }, 30000);

  it("respects include filter", async () => {
    const vfs = createVfs();
    const result = await vfs.mountGit(
      "github://octocat/Hello-World",
      "/filtered",
      gitOpts({ include: [".md"], maxFiles: 50 }),
    );

    const files = vfs.glob("**/*.md", "/filtered");
    expect(files.length).toBe(result.filesLoaded);
  }, 30000);

  it("uses token from secret store (capability-checked)", () => {
    // Verify the token was loaded through the secret system
    if (!process.env["GITHUB_TOKEN"]) {
      console.log("  (skipped — no GITHUB_TOKEN in .env)");
      return;
    }
    expect(secrets.has(ctx, "GITHUB_TOKEN")).toBe(true);

    // A context WITHOUT secret:read should NOT be able to access the token
    const restrictedCtx = createContext({
      name: "no-secrets",
      capabilities: capabilities().fsRead("*").build().capabilities.slice(),
    });
    expect(() => secrets.get(restrictedCtx, "GITHUB_TOKEN")).toThrow(
      "Capability denied",
    );
  });
});
