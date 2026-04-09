import { describe, it, expect } from "bun:test";
import { createVfs } from "../../src/vfs/vfs";

describe("mountGit", () => {
  it("parses github:// URL correctly", async () => {
    const vfs = createVfs();
    // Mount a small, well-known public repo
    const result = await vfs.mountGit("github://octocat/Hello-World", "/repo", {
      maxFiles: 10,
    });

    expect(result.owner).toBe("octocat");
    expect(result.repo).toBe("Hello-World");
    expect(result.filesLoaded).toBeGreaterThan(0);
    expect(result.totalSize).toBeGreaterThan(0);

    // Verify files are in VFS
    expect(vfs.exists("/repo")).toBe(true);
    const entries = vfs.readdir("/repo");
    expect(entries.length).toBeGreaterThan(0);

    // Should have a README
    const readmeExists = entries.some((e) =>
      e.name.toLowerCase().includes("readme"),
    );
    expect(readmeExists).toBe(true);
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
      ),
    ).rejects.toThrow("GitHub API error");
  }, 15000);

  it("respects maxFiles limit", async () => {
    const vfs = createVfs();
    const result = await vfs.mountGit(
      "github://octocat/Hello-World",
      "/limited",
      { maxFiles: 2 },
    );

    expect(result.filesLoaded).toBeLessThanOrEqual(2);
  }, 30000);

  it("supports @ref for branches/tags", async () => {
    const vfs = createVfs();
    const result = await vfs.mountGit(
      "github://octocat/Hello-World@master",
      "/ref-test",
      { maxFiles: 5 },
    );

    expect(result.filesLoaded).toBeGreaterThan(0);
  }, 30000);

  it("files are readable after mount", async () => {
    const vfs = createVfs();
    await vfs.mountGit("github://octocat/Hello-World", "/readable", {
      maxFiles: 5,
    });

    // Find and read a file
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
      { include: [".md"], maxFiles: 50 },
    );

    // All loaded files should be .md
    const files = vfs.glob("**/*.md", "/filtered");
    expect(files.length).toBe(result.filesLoaded);
  }, 30000);
});
