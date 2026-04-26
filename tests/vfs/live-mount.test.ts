import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createVfs } from "../../src/vfs/vfs";
import { createLiveMount } from "../../src/vfs/live-mount";
import type { LiveMountHandle } from "../../src/vfs/live-mount";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-live-mount");
let mount: LiveMountHandle | null = null;

beforeEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
  mount = null;
});

afterEach(() => {
  if (mount?.active) mount.unmount();
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

describe("initial load", () => {
  it("loads disk files into VFS on mount", async () => {
    writeFileSync(join(testDir, "hello.txt"), "world");
    mkdirSync(join(testDir, "sub"));
    writeFileSync(join(testDir, "sub", "nested.txt"), "deep");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws");

    expect(vfs.exists("/ws")).toBe(true);
    expect(vfs.readFile("/ws/hello.txt")).toBe("world");
    expect(vfs.readFile("/ws/sub/nested.txt")).toBe("deep");
    expect(mount.fileCount).toBeGreaterThanOrEqual(2);
  });

  it("respects ignore patterns", async () => {
    mkdirSync(join(testDir, "node_modules"), { recursive: true });
    writeFileSync(join(testDir, "node_modules", "pkg.js"), "module");
    writeFileSync(join(testDir, "app.ts"), "code");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      ignore: ["node_modules/**"],
    });

    expect(vfs.exists("/ws/app.ts")).toBe(true);
    expect(vfs.exists("/ws/node_modules/pkg.js")).toBe(false);
  });

  it("skips initial load when initialLoad: false", async () => {
    writeFileSync(join(testDir, "file.txt"), "data");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      initialLoad: false,
    });

    expect(vfs.exists("/ws/file.txt")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Auto-flush mode — VFS writes go to disk
// ---------------------------------------------------------------------------

describe("auto-flush mode", () => {
  it("writes VFS files to disk immediately", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      policy: "auto-flush",
    });

    vfs.writeFile("/ws/new-file.ts", "export const x = 1;");

    // Should appear on disk
    const diskPath = join(testDir, "new-file.ts");
    expect(existsSync(diskPath)).toBe(true);
    expect(readFileSync(diskPath, "utf-8")).toBe("export const x = 1;");
  });

  it("creates nested directories on disk", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      policy: "auto-flush",
    });

    vfs.writeFile("/ws/deep/nested/file.ts", "nested");

    expect(existsSync(join(testDir, "deep", "nested", "file.ts"))).toBe(true);
  });

  it("deletes files from disk on VFS rm", async () => {
    writeFileSync(join(testDir, "delete-me.txt"), "bye");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      policy: "auto-flush",
    });

    expect(existsSync(join(testDir, "delete-me.txt"))).toBe(true);
    vfs.rm("/ws/delete-me.txt");
    expect(existsSync(join(testDir, "delete-me.txt"))).toBe(false);
  });

  it("append flushes full content to disk", async () => {
    writeFileSync(join(testDir, "log.txt"), "line1\n");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      policy: "auto-flush",
    });

    vfs.append("/ws/log.txt", "line2\n");

    const diskContent = readFileSync(join(testDir, "log.txt"), "utf-8");
    expect(diskContent).toBe("line1\nline2\n");
  });

  it("does not flush writes outside mount point", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      policy: "auto-flush",
    });

    vfs.writeFile("/other/file.txt", "not mounted");

    // Should NOT appear on disk in testDir
    expect(existsSync(join(testDir, "other", "file.txt"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Draft mode — accumulate diffs for review
// ---------------------------------------------------------------------------

describe("draft mode", () => {
  it("does not write to disk immediately", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    vfs.writeFile("/ws/draft-file.ts", "draft content");

    // Should NOT appear on disk yet
    expect(existsSync(join(testDir, "draft-file.ts"))).toBe(false);

    // But should be in VFS
    expect(vfs.readFile("/ws/draft-file.ts")).toBe("draft content");
  });

  it("tracks diffs correctly", async () => {
    writeFileSync(join(testDir, "existing.txt"), "original");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    vfs.writeFile("/ws/existing.txt", "modified");
    vfs.writeFile("/ws/new-file.ts", "brand new");
    vfs.rm("/ws/existing.txt");

    const diffs = mount.diff();
    expect(diffs.length).toBe(2);

    const newFile = diffs.find((d) => d.path === "new-file.ts");
    expect(newFile).toBeDefined();
    expect(newFile!.action).toBe("add");
    expect(newFile!.content).toBe("brand new");

    // existing.txt was modified then deleted — last write wins
    const deleted = diffs.find((d) => d.path === "existing.txt");
    expect(deleted).toBeDefined();
    expect(deleted!.action).toBe("delete");
  });

  it("flush writes all diffs to disk", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    vfs.writeFile("/ws/flush-test.ts", "flushed!");

    expect(existsSync(join(testDir, "flush-test.ts"))).toBe(false);

    const flushed = mount.flush();
    expect(flushed).toBe(1);
    expect(existsSync(join(testDir, "flush-test.ts"))).toBe(true);
    expect(readFileSync(join(testDir, "flush-test.ts"), "utf-8")).toBe(
      "flushed!",
    );

    // Diffs should be empty after flush
    expect(mount.diff().length).toBe(0);
  });

  it("discard reverts VFS to disk state", async () => {
    writeFileSync(join(testDir, "original.txt"), "disk version");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    // Agent modifies file
    vfs.writeFile("/ws/original.txt", "agent version");
    expect(vfs.readFile("/ws/original.txt")).toBe("agent version");

    // Discard — should revert to disk
    const discarded = mount.discard();
    expect(discarded).toBe(1);
    expect(vfs.readFile("/ws/original.txt")).toBe("disk version");

    // No pending diffs
    expect(mount.diff().length).toBe(0);
  });

  it("discard restores deleted files", async () => {
    writeFileSync(join(testDir, "keep.txt"), "keep me");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    vfs.rm("/ws/keep.txt");
    expect(vfs.exists("/ws/keep.txt")).toBe(false);

    mount.discard();
    expect(vfs.exists("/ws/keep.txt")).toBe(true);
    expect(vfs.readFile("/ws/keep.txt")).toBe("keep me");
  });
});

// ---------------------------------------------------------------------------
// Policy switching
// ---------------------------------------------------------------------------

describe("policy switching", () => {
  it("switching to auto-flush flushes pending diffs", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    vfs.writeFile("/ws/switch-test.ts", "pending");
    expect(existsSync(join(testDir, "switch-test.ts"))).toBe(false);

    mount.setPolicy("auto-flush");
    expect(existsSync(join(testDir, "switch-test.ts"))).toBe(true);
    expect(mount.diff().length).toBe(0);
  });

  it("new writes after switch use new policy", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    mount.setPolicy("auto-flush");
    vfs.writeFile("/ws/auto-after-switch.ts", "auto");
    expect(existsSync(join(testDir, "auto-after-switch.ts"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disk → VFS propagation (fs.watch)
// ---------------------------------------------------------------------------
// Skipped on Linux: fs.watch({ recursive: true }) is unsupported in Node ≤22
// and Bun on Linux. To re-enable, swap the watcher in
// src/vfs/live-mount.ts:228 for a portable implementation (chokidar or a
// manual recursive walker).

describe.skipIf(process.platform === "linux")("disk → VFS propagation", () => {
  it("picks up new files from disk", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws");

    // User creates a file on disk (simulates VS Code save)
    writeFileSync(join(testDir, "from-user.ts"), "user wrote this");

    // fs.watch is async — wait a bit
    await new Promise((r) => setTimeout(r, 300));

    expect(vfs.exists("/ws/from-user.ts")).toBe(true);
    expect(vfs.readFile("/ws/from-user.ts")).toBe("user wrote this");
  });

  it("picks up file modifications from disk", async () => {
    writeFileSync(join(testDir, "editable.txt"), "v1");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws");
    expect(vfs.readFile("/ws/editable.txt")).toBe("v1");

    // User edits the file
    writeFileSync(join(testDir, "editable.txt"), "v2");

    await new Promise((r) => setTimeout(r, 300));
    expect(vfs.readFile("/ws/editable.txt")).toBe("v2");
  });

  it("picks up file deletions from disk", async () => {
    writeFileSync(join(testDir, "doomed.txt"), "bye");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws");
    expect(vfs.exists("/ws/doomed.txt")).toBe(true);

    // User deletes the file
    rmSync(join(testDir, "doomed.txt"));

    await new Promise((r) => setTimeout(r, 300));
    expect(vfs.exists("/ws/doomed.txt")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unmount
// ---------------------------------------------------------------------------

describe("unmount", () => {
  it("stops syncing after unmount", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", {
      policy: "auto-flush",
    });

    mount.unmount();
    expect(mount.active).toBe(false);

    // VFS writes should no longer flush to disk
    vfs.writeFile("/ws/after-unmount.ts", "orphan");
    expect(existsSync(join(testDir, "after-unmount.ts"))).toBe(false);
  });

  it("VFS files remain after unmount", async () => {
    writeFileSync(join(testDir, "persist.txt"), "still here");

    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws");
    mount.unmount();

    // Files loaded during mount should still be in VFS
    expect(vfs.exists("/ws/persist.txt")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Handle properties
// ---------------------------------------------------------------------------

describe("handle properties", () => {
  it("exposes correct metadata", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    expect(mount.diskPath).toContain(".tmp-live-mount");
    expect(mount.vfsPath).toBe("/ws");
    expect(mount.policy).toBe("draft");
    expect(mount.active).toBe(true);
  });

  it("flush returns 0 when no diffs", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    expect(mount.flush()).toBe(0);
  });

  it("discard returns 0 when no diffs", async () => {
    const vfs = createVfs();
    mount = await createLiveMount(vfs, testDir, "/ws", { policy: "draft" });

    expect(mount.discard()).toBe(0);
  });
});
