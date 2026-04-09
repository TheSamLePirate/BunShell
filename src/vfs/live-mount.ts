/**
 * Live Mount — bi-directional VFS ↔ disk sync.
 *
 * Creates an overlay between a physical directory and the VFS.
 * The user edits files in VS Code → agent sees changes in VFS instantly.
 * The agent writes via VFS → changes appear on disk (auto-flush)
 * or accumulate as a diff (draft mode) for human review.
 *
 * @module
 */

import { resolve, join, relative, dirname } from "node:path";
import {
  watch,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { readdir, stat, readFile } from "node:fs/promises";
import type { VirtualFilesystem } from "./vfs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Sync policy for agent writes. */
export type LiveMountPolicy = "auto-flush" | "draft";

/** Options for creating a live mount. */
export interface LiveMountOptions {
  /** Sync policy (default: "auto-flush"). */
  readonly policy?: LiveMountPolicy;
  /** Glob patterns to ignore (e.g., ["node_modules/**", ".git/**"]). */
  readonly ignore?: readonly string[];
  /** Whether to do the initial disk→VFS load (default: true). */
  readonly initialLoad?: boolean;
}

/** A single file change in draft mode. */
export interface LiveMountDiff {
  readonly path: string;
  readonly vfsPath: string;
  readonly action: "add" | "modify" | "delete";
  readonly content?: string;
}

/** Handle for managing a live mount. */
export interface LiveMountHandle {
  /** The physical disk path. */
  readonly diskPath: string;
  /** The VFS mount point. */
  readonly vfsPath: string;
  /** Current sync policy. */
  readonly policy: LiveMountPolicy;
  /** Whether the mount is active. */
  readonly active: boolean;

  /** Number of files currently synced. */
  readonly fileCount: number;

  /**
   * Get pending diffs (draft mode only).
   * Returns all agent writes that haven't been flushed to disk.
   */
  diff(): readonly LiveMountDiff[];

  /**
   * Flush all pending diffs to disk (draft mode).
   * In auto-flush mode, this is a no-op.
   * Returns the number of files flushed.
   */
  flush(): number;

  /**
   * Discard all pending diffs (draft mode).
   * Reverts VFS to match disk state.
   * Returns the number of diffs discarded.
   */
  discard(): number;

  /**
   * Switch policy at runtime.
   * Switching to auto-flush flushes all pending diffs.
   */
  setPolicy(policy: LiveMountPolicy): void;

  /** Stop watching and detach. VFS files remain but are no longer synced. */
  unmount(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldIgnore(
  relPath: string,
  ignoreGlobs: readonly Bun.Glob[],
): boolean {
  return ignoreGlobs.some((g) => g.match(relPath));
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a live bi-directional mount between a disk directory and VFS.
 *
 * @example
 * ```ts
 * // Auto-flush: agent writes appear on disk immediately
 * const mount = await createLiveMount(vfs, "/Users/olivier/project", "/workspace", {
 *   policy: "auto-flush",
 *   ignore: ["node_modules/**", ".git/**", "dist/**"],
 * });
 *
 * // Agent writes → disk instantly
 * vfs.writeFile("/workspace/src/app.ts", "new code");
 * // File appears at /Users/olivier/project/src/app.ts immediately
 *
 * // User edits in VS Code → VFS updates instantly
 * // Agent reads the latest: vfs.readFile("/workspace/src/app.ts")
 *
 * mount.unmount(); // Stop syncing
 * ```
 *
 * @example
 * ```ts
 * // Draft mode: agent writes stay in RAM until human approves
 * const mount = await createLiveMount(vfs, "/Users/olivier/project", "/workspace", {
 *   policy: "draft",
 * });
 *
 * // Agent works in VFS
 * vfs.writeFile("/workspace/src/fix.ts", "patched code");
 * vfs.rm("/workspace/src/old.ts");
 *
 * // Human reviews the diff
 * const diffs = mount.diff();
 * // [
 * //   { action: "modify", path: "src/fix.ts", vfsPath: "/workspace/src/fix.ts", content: "..." },
 * //   { action: "delete", path: "src/old.ts", vfsPath: "/workspace/src/old.ts" },
 * // ]
 *
 * mount.flush();   // Apply all diffs to disk
 * // — or —
 * mount.discard(); // Revert VFS to match disk
 * ```
 */
export async function createLiveMount(
  vfs: VirtualFilesystem,
  diskPath: string,
  vfsPath: string,
  options?: LiveMountOptions,
): Promise<LiveMountHandle> {
  const absDisk = resolve(diskPath);
  const normVfs = vfsPath.startsWith("/") ? vfsPath : "/" + vfsPath;
  let policy: LiveMountPolicy = options?.policy ?? "auto-flush";
  const ignoreGlobs = (options?.ignore ?? []).map((p) => new Bun.Glob(p));
  let active = true;
  let fileCount = 0;

  // Pending diffs for draft mode
  const pendingDiffs = new Map<string, LiveMountDiff>();

  // Track which writes originated from disk→VFS sync (to avoid loops)
  let syncingFromDisk = false;
  // Track which writes originated from VFS→disk flush (to avoid loops)
  let syncingToDisk = false;

  // -----------------------------------------------------------------------
  // Step 1: Initial load — disk → VFS
  // -----------------------------------------------------------------------

  if (options?.initialLoad !== false) {
    await loadDiskToVfs(absDisk, absDisk, normVfs, vfs, ignoreGlobs);
    fileCount = countFiles(vfs, normVfs);
  }

  // -----------------------------------------------------------------------
  // Step 2: Watch disk for changes → propagate to VFS
  // -----------------------------------------------------------------------

  const watcher = watch(absDisk, { recursive: true }, (event, filename) => {
    if (!active || !filename || syncingToDisk) return;

    const relPath = filename.toString();
    if (shouldIgnore(relPath, ignoreGlobs)) return;

    const fullDisk = join(absDisk, relPath);
    const fullVfs = normVfs + "/" + relPath;

    syncingFromDisk = true;
    try {
      if (existsSync(fullDisk)) {
        const s = statSync(fullDisk);
        if (s.isFile()) {
          const content = readFileSync(fullDisk);
          vfs.writeFile(fullVfs, new Uint8Array(content));
        } else if (s.isDirectory()) {
          vfs.mkdir(fullVfs);
        }
      } else {
        // File deleted on disk
        if (vfs.exists(fullVfs)) {
          vfs.rm(fullVfs, { recursive: true });
        }
      }
    } catch {
      // File may have been deleted between check and read
    }
    syncingFromDisk = false;

    fileCount = countFiles(vfs, normVfs);
  });

  // -----------------------------------------------------------------------
  // Step 3: Intercept VFS writes → sync to disk or accumulate diffs
  // -----------------------------------------------------------------------

  // We wrap the VFS's writeFile, rm, mv, append methods to intercept
  // writes under our mount point. We store the original methods and
  // replace them, restoring on unmount.

  const origWriteFile = vfs.writeFile.bind(vfs);
  const origRm = vfs.rm.bind(vfs);
  const origMv = vfs.mv.bind(vfs);
  const origAppend = vfs.append.bind(vfs);

  vfs.writeFile = (path: string, content: string | Uint8Array): void => {
    origWriteFile(path, content);

    if (!active || syncingFromDisk) return;
    if (!isUnderMount(path, normVfs)) return;

    const relPath = path.slice(normVfs.length + 1);
    if (shouldIgnore(relPath, ignoreGlobs)) return;

    if (policy === "auto-flush") {
      flushSingleWrite(absDisk, relPath, content);
    } else {
      const contentStr =
        typeof content === "string"
          ? content
          : new TextDecoder().decode(content);
      const diskFile = join(absDisk, relPath);
      const action = existsSync(diskFile) ? "modify" : "add";
      pendingDiffs.set(relPath, {
        path: relPath,
        vfsPath: path,
        action,
        content: contentStr,
      });
    }

    fileCount = countFiles(vfs, normVfs);
  };

  vfs.rm = (path: string, opts?: { recursive?: boolean }): void => {
    origRm(path, opts);

    if (!active || syncingFromDisk) return;
    if (!isUnderMount(path, normVfs)) return;

    const relPath = path.slice(normVfs.length + 1);
    if (shouldIgnore(relPath, ignoreGlobs)) return;

    if (policy === "auto-flush") {
      const diskFile = join(absDisk, relPath);
      syncingToDisk = true;
      try {
        rmSync(diskFile, { recursive: true, force: true });
      } catch {
        // May already be gone
      }
      syncingToDisk = false;
    } else {
      pendingDiffs.set(relPath, {
        path: relPath,
        vfsPath: path,
        action: "delete",
      });
    }

    fileCount = countFiles(vfs, normVfs);
  };

  vfs.append = (path: string, content: string | Uint8Array): void => {
    origAppend(path, content);

    if (!active || syncingFromDisk) return;
    if (!isUnderMount(path, normVfs)) return;

    const relPath = path.slice(normVfs.length + 1);
    if (shouldIgnore(relPath, ignoreGlobs)) return;

    if (policy === "auto-flush") {
      // Read the full file from VFS and write to disk
      const fullContent = vfs.readFileBytes(path);
      flushSingleWrite(absDisk, relPath, fullContent);
    } else {
      const fullContent = vfs.readFile(path);
      const diskFile = join(absDisk, relPath);
      const action = existsSync(diskFile) ? "modify" : "add";
      pendingDiffs.set(relPath, {
        path: relPath,
        vfsPath: path,
        action,
        content: fullContent,
      });
    }
  };

  vfs.mv = (src: string, dest: string): void => {
    origMv(src, dest);

    if (!active || syncingFromDisk) return;

    const srcUnder = isUnderMount(src, normVfs);
    const destUnder = isUnderMount(dest, normVfs);

    if (srcUnder) {
      const relSrc = src.slice(normVfs.length + 1);
      if (policy === "auto-flush") {
        const diskSrc = join(absDisk, relSrc);
        syncingToDisk = true;
        try {
          rmSync(diskSrc, { recursive: true, force: true });
        } catch {
          // ignore
        }
        syncingToDisk = false;
      } else {
        pendingDiffs.set(relSrc, {
          path: relSrc,
          vfsPath: src,
          action: "delete",
        });
      }
    }

    if (destUnder) {
      const relDest = dest.slice(normVfs.length + 1);
      const content = vfs.readFile(dest);
      if (policy === "auto-flush") {
        flushSingleWrite(absDisk, relDest, content);
      } else {
        pendingDiffs.set(relDest, {
          path: relDest,
          vfsPath: dest,
          action: "add",
          content,
        });
      }
    }
  };

  // -----------------------------------------------------------------------
  // Handle
  // -----------------------------------------------------------------------

  function flushPending(): number {
    const count = pendingDiffs.size;
    if (count === 0) return 0;

    syncingToDisk = true;
    for (const d of pendingDiffs.values()) {
      const diskFile = join(absDisk, d.path);
      if (d.action === "delete") {
        try {
          rmSync(diskFile, { recursive: true, force: true });
        } catch {
          // ignore
        }
      } else {
        mkdirSync(dirname(diskFile), { recursive: true });
        writeFileSync(diskFile, d.content ?? "");
      }
    }
    syncingToDisk = false;

    pendingDiffs.clear();
    return count;
  }

  function discardPending(): number {
    const count = pendingDiffs.size;
    if (count === 0) return 0;

    syncingFromDisk = true;
    for (const d of pendingDiffs.values()) {
      const diskFile = join(absDisk, d.path);
      if (d.action === "delete") {
        if (existsSync(diskFile)) {
          const content = readFileSync(diskFile);
          origWriteFile(d.vfsPath, new Uint8Array(content));
        }
      } else {
        if (existsSync(diskFile)) {
          const content = readFileSync(diskFile);
          origWriteFile(d.vfsPath, new Uint8Array(content));
        } else {
          origRm(d.vfsPath);
        }
      }
    }
    syncingFromDisk = false;

    pendingDiffs.clear();
    fileCount = countFiles(vfs, normVfs);
    return count;
  }

  function restoreOriginals(): void {
    vfs.writeFile = origWriteFile;
    vfs.rm = origRm;
    vfs.mv = origMv;
    vfs.append = origAppend;
  }

  return {
    diskPath: absDisk,
    vfsPath: normVfs,

    get policy() {
      return policy;
    },

    get active() {
      return active;
    },

    get fileCount() {
      return fileCount;
    },

    diff(): readonly LiveMountDiff[] {
      return [...pendingDiffs.values()];
    },

    flush: flushPending,

    discard: discardPending,

    setPolicy(newPolicy: LiveMountPolicy): void {
      if (newPolicy === policy) return;

      if (newPolicy === "auto-flush" && pendingDiffs.size > 0) {
        flushPending();
      }

      policy = newPolicy;
    },

    unmount(): void {
      if (!active) return;
      active = false;
      watcher.close();
      restoreOriginals();
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isUnderMount(path: string, mountPoint: string): boolean {
  return path === mountPoint || path.startsWith(mountPoint + "/");
}

function flushSingleWrite(
  absDisk: string,
  relPath: string,
  content: string | Uint8Array,
): void {
  const diskFile = join(absDisk, relPath);
  mkdirSync(dirname(diskFile), { recursive: true });
  const data = typeof content === "string" ? content : Buffer.from(content);
  writeFileSync(diskFile, data);
}

async function loadDiskToVfs(
  base: string,
  dir: string,
  vfsDir: string,
  vfs: VirtualFilesystem,
  ignoreGlobs: readonly Bun.Glob[],
): Promise<void> {
  vfs.mkdir(vfsDir);

  const items = await readdir(dir);
  for (const item of items) {
    if (item.startsWith(".")) continue;

    const fullPath = join(dir, item);
    const relPath = relative(base, fullPath);

    if (shouldIgnore(relPath, ignoreGlobs)) continue;

    const s = await stat(fullPath);
    const vfsFullPath = vfsDir + "/" + item;

    if (s.isDirectory()) {
      await loadDiskToVfs(base, fullPath, vfsFullPath, vfs, ignoreGlobs);
    } else if (s.isFile()) {
      const content = new Uint8Array(await readFile(fullPath));
      vfs.writeFile(vfsFullPath, content);
    }
  }
}

function countFiles(vfs: VirtualFilesystem, mountPoint: string): number {
  try {
    return vfs.glob("**", mountPoint).length;
  } catch {
    return 0;
  }
}
