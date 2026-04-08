/**
 * Virtual Filesystem — in-memory FS that agents operate on.
 *
 * Agents think they're reading/writing real files. In reality,
 * everything lives in a Map in RAM. Nothing touches disk unless
 * explicitly synced.
 *
 * Session-scoped: each session gets its own VFS instance.
 * Capability-checked: the VFS respects CapabilityContext.
 *
 * @module
 */

import { resolve, dirname, basename, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A node in the virtual filesystem. */
export type VfsNode =
  | { type: "file"; content: Uint8Array; meta: VfsMeta }
  | { type: "dir"; meta: VfsMeta };

/** File/directory metadata. */
export interface VfsMeta {
  createdAt: Date;
  modifiedAt: Date;
  mode: number;
  size: number;
}

/** Entry returned by VFS readdir. */
export interface VfsEntry {
  readonly name: string;
  readonly path: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly modifiedAt: Date;
}

/** Stats returned by VFS stat. */
export interface VfsStat {
  readonly path: string;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly mode: number;
  readonly createdAt: Date;
  readonly modifiedAt: Date;
}

// ---------------------------------------------------------------------------
// VirtualFilesystem
// ---------------------------------------------------------------------------

/**
 * An in-memory filesystem. All paths are normalized to absolute.
 *
 * @example
 * ```ts
 * const vfs = createVfs();
 * vfs.writeFile("/app/index.ts", 'console.log("hello")');
 * vfs.mkdir("/app/src");
 * vfs.writeFile("/app/src/util.ts", "export const x = 1;");
 *
 * const content = vfs.readFile("/app/index.ts"); // "console.log(...)"
 * const entries = vfs.readdir("/app"); // [{ name: "index.ts", ... }, ...]
 * ```
 */
export interface VirtualFilesystem {
  /** Write a file (creates parent dirs automatically). */
  writeFile(path: string, content: string | Uint8Array): void;

  /** Read a file as string. Throws if not found. */
  readFile(path: string): string;

  /** Read a file as bytes. Throws if not found. */
  readFileBytes(path: string): Uint8Array;

  /** Check if a path exists. */
  exists(path: string): boolean;

  /** Get file/directory stats. Throws if not found. */
  stat(path: string): VfsStat;

  /** Create a directory (and parents). */
  mkdir(path: string): void;

  /** List directory contents. Throws if not a directory. */
  readdir(path: string): VfsEntry[];

  /** Remove a file or directory. */
  rm(path: string, opts?: { recursive?: boolean }): void;

  /** Copy a file. */
  cp(src: string, dest: string): void;

  /** Move/rename a file or directory. */
  mv(src: string, dest: string): void;

  /** Append to a file. */
  append(path: string, content: string | Uint8Array): void;

  /** Find files matching a glob pattern. */
  glob(pattern: string, cwd?: string): string[];

  /** Mount a real directory into the VFS (read files from disk into memory). */
  mountFromDisk(diskPath: string, vfsPath: string): Promise<void>;

  /** Sync a VFS directory back to disk. */
  syncToDisk(vfsPath: string, diskPath: string): Promise<void>;

  /** Get total number of files. */
  readonly fileCount: number;

  /** Get total bytes stored. */
  readonly totalBytes: number;

  /** Export the entire VFS as a serializable snapshot. */
  snapshot(): VfsSnapshot;

  /** Restore from a snapshot. */
  restore(snapshot: VfsSnapshot): void;
}

/** Serializable VFS state. */
export interface VfsSnapshot {
  files: Record<
    string,
    { content: string; mode: number; createdAt: string; modifiedAt: string }
  >;
  dirs: string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function normPath(path: string): string {
  if (!path.startsWith("/")) return resolve("/", path);
  return resolve(path);
}

function toBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string"
    ? new TextEncoder().encode(content)
    : content;
}

function now(): Date {
  return new Date();
}

/**
 * Create a new virtual filesystem.
 *
 * @example
 * ```ts
 * const vfs = createVfs();
 * vfs.writeFile("/hello.txt", "world");
 * ```
 */
export function createVfs(): VirtualFilesystem {
  const nodes = new Map<string, VfsNode>();

  // Root always exists
  nodes.set("/", {
    type: "dir",
    meta: { createdAt: now(), modifiedAt: now(), mode: 0o755, size: 0 },
  });

  function ensureParents(path: string): void {
    const parts = path.split("/").filter(Boolean);
    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current += "/" + parts[i];
      const norm = normPath(current);
      if (!nodes.has(norm)) {
        nodes.set(norm, {
          type: "dir",
          meta: { createdAt: now(), modifiedAt: now(), mode: 0o755, size: 0 },
        });
      }
    }
  }

  function getNode(path: string): VfsNode | undefined {
    return nodes.get(normPath(path));
  }

  function demandNode(path: string): VfsNode {
    const node = getNode(path);
    if (!node) throw new Error(`VFS: path not found: ${path}`);
    return node;
  }

  return {
    writeFile(path: string, content: string | Uint8Array): void {
      const norm = normPath(path);
      ensureParents(norm);
      const bytes = toBytes(content);
      nodes.set(norm, {
        type: "file",
        content: bytes,
        meta: {
          createdAt: now(),
          modifiedAt: now(),
          mode: 0o644,
          size: bytes.length,
        },
      });
    },

    readFile(path: string): string {
      const node = demandNode(path);
      if (node.type !== "file") throw new Error(`VFS: not a file: ${path}`);
      return new TextDecoder().decode(node.content);
    },

    readFileBytes(path: string): Uint8Array {
      const node = demandNode(path);
      if (node.type !== "file") throw new Error(`VFS: not a file: ${path}`);
      return node.content;
    },

    exists(path: string): boolean {
      return nodes.has(normPath(path));
    },

    stat(path: string): VfsStat {
      const norm = normPath(path);
      const node = demandNode(path);
      return {
        path: norm,
        isFile: node.type === "file",
        isDirectory: node.type === "dir",
        size: node.meta.size,
        mode: node.meta.mode,
        createdAt: node.meta.createdAt,
        modifiedAt: node.meta.modifiedAt,
      };
    },

    mkdir(path: string): void {
      const norm = normPath(path);
      ensureParents(norm);
      if (!nodes.has(norm)) {
        nodes.set(norm, {
          type: "dir",
          meta: { createdAt: now(), modifiedAt: now(), mode: 0o755, size: 0 },
        });
      }
    },

    readdir(path: string): VfsEntry[] {
      const norm = normPath(path);
      const node = getNode(path);
      if (!node || node.type !== "dir")
        throw new Error(`VFS: not a directory: ${path}`);

      const prefix = norm === "/" ? "/" : norm + "/";
      const entries: VfsEntry[] = [];

      for (const [key, val] of nodes) {
        if (key === norm) continue;
        if (!key.startsWith(prefix)) continue;
        // Only direct children (no deeper nesting)
        const rest = key.slice(prefix.length);
        if (rest.includes("/")) continue;

        entries.push({
          name: basename(key),
          path: key,
          isFile: val.type === "file",
          isDirectory: val.type === "dir",
          size: val.meta.size,
          modifiedAt: val.meta.modifiedAt,
        });
      }

      return entries.sort((a, b) => a.name.localeCompare(b.name));
    },

    rm(path: string, opts?: { recursive?: boolean }): void {
      const norm = normPath(path);
      const node = getNode(path);
      if (!node) return;

      if (node.type === "dir" && opts?.recursive) {
        const prefix = norm === "/" ? "/" : norm + "/";
        for (const key of [...nodes.keys()]) {
          if (key === norm || key.startsWith(prefix)) {
            nodes.delete(key);
          }
        }
      } else {
        nodes.delete(norm);
      }
    },

    cp(src: string, dest: string): void {
      const srcNode = demandNode(src);
      if (srcNode.type !== "file")
        throw new Error(`VFS: can only copy files: ${src}`);
      const normDest = normPath(dest);
      ensureParents(normDest);
      nodes.set(normDest, {
        type: "file",
        content: new Uint8Array(srcNode.content),
        meta: { ...srcNode.meta, createdAt: now(), modifiedAt: now() },
      });
    },

    mv(src: string, dest: string): void {
      const normSrc = normPath(src);
      const normDest = normPath(dest);
      const node = demandNode(src);
      ensureParents(normDest);
      nodes.set(normDest, node);
      nodes.delete(normSrc);

      // Move children if directory
      if (node.type === "dir") {
        const prefix = normSrc + "/";
        for (const [key, val] of [...nodes.entries()]) {
          if (key.startsWith(prefix)) {
            const newKey = normDest + "/" + key.slice(prefix.length);
            nodes.set(newKey, val);
            nodes.delete(key);
          }
        }
      }
    },

    append(path: string, content: string | Uint8Array): void {
      const norm = normPath(path);
      const existing = getNode(path);
      const newBytes = toBytes(content);

      if (!existing) {
        ensureParents(norm);
        nodes.set(norm, {
          type: "file",
          content: newBytes,
          meta: {
            createdAt: now(),
            modifiedAt: now(),
            mode: 0o644,
            size: newBytes.length,
          },
        });
      } else if (existing.type === "file") {
        const merged = new Uint8Array(
          existing.content.length + newBytes.length,
        );
        merged.set(existing.content);
        merged.set(newBytes, existing.content.length);
        existing.content = merged;
        existing.meta.size = merged.length;
        existing.meta.modifiedAt = now();
      } else {
        throw new Error(`VFS: cannot append to directory: ${path}`);
      }
    },

    glob(pattern: string, cwd?: string): string[] {
      const base = cwd ? normPath(cwd) : "/";
      const glob = new Bun.Glob(pattern);
      const results: string[] = [];

      for (const [key, val] of nodes) {
        if (val.type !== "file") continue;
        // Make path relative to base for matching
        const prefix = base === "/" ? "/" : base + "/";
        if (!key.startsWith(prefix) && key !== base) continue;
        const relative = key.slice(prefix.length);
        if (glob.match(relative)) {
          results.push(key);
        }
      }

      return results.sort();
    },

    async mountFromDisk(diskPath: string, vfsPath: string): Promise<void> {
      const {
        readdir: fsReaddir,
        stat: fsStat,
        readFile: fsRead,
      } = await import("node:fs/promises");
      const absBase = resolve(diskPath);

      async function walk(dir: string, vfsDir: string): Promise<void> {
        const items = await fsReaddir(dir);
        for (const item of items) {
          if (item.startsWith(".")) continue;
          const fullPath = join(dir, item);
          const s = await fsStat(fullPath);
          const vfsFullPath = normPath(join(vfsDir, item));

          if (s.isDirectory()) {
            nodes.set(vfsFullPath, {
              type: "dir",
              meta: {
                createdAt: s.birthtime,
                modifiedAt: s.mtime,
                mode: s.mode & 0o777,
                size: 0,
              },
            });
            await walk(fullPath, vfsFullPath);
          } else if (s.isFile()) {
            const content = new Uint8Array(await fsRead(fullPath));
            nodes.set(vfsFullPath, {
              type: "file",
              content,
              meta: {
                createdAt: s.birthtime,
                modifiedAt: s.mtime,
                mode: s.mode & 0o777,
                size: content.length,
              },
            });
          }
        }
      }

      const norm = normPath(vfsPath);
      nodes.set(norm, {
        type: "dir",
        meta: { createdAt: now(), modifiedAt: now(), mode: 0o755, size: 0 },
      });
      await walk(absBase, norm);
    },

    async syncToDisk(vfsPath: string, diskPath: string): Promise<void> {
      const { mkdir: fsMkdir, writeFile: fsWrite } =
        await import("node:fs/promises");
      const norm = normPath(vfsPath);
      const absBase = resolve(diskPath);

      await fsMkdir(absBase, { recursive: true });

      for (const [key, val] of nodes) {
        if (!key.startsWith(norm === "/" ? "/" : norm + "/") && key !== norm)
          continue;
        const relative = key.slice(norm.length);
        const diskTarget = join(absBase, relative);

        if (val.type === "dir") {
          await fsMkdir(diskTarget, { recursive: true });
        } else {
          await fsMkdir(dirname(diskTarget), { recursive: true });
          await fsWrite(diskTarget, val.content);
        }
      }
    },

    get fileCount(): number {
      let n = 0;
      for (const val of nodes.values()) {
        if (val.type === "file") n++;
      }
      return n;
    },

    get totalBytes(): number {
      let total = 0;
      for (const val of nodes.values()) {
        if (val.type === "file") total += val.meta.size;
      }
      return total;
    },

    snapshot(): VfsSnapshot {
      const files: VfsSnapshot["files"] = {};
      const dirs: string[] = [];

      for (const [key, val] of nodes) {
        if (val.type === "file") {
          files[key] = {
            content: Buffer.from(val.content).toString("base64"),
            mode: val.meta.mode,
            createdAt: val.meta.createdAt.toISOString(),
            modifiedAt: val.meta.modifiedAt.toISOString(),
          };
        } else {
          dirs.push(key);
        }
      }

      return { files, dirs };
    },

    restore(snapshot: VfsSnapshot): void {
      nodes.clear();
      nodes.set("/", {
        type: "dir",
        meta: { createdAt: now(), modifiedAt: now(), mode: 0o755, size: 0 },
      });

      for (const dir of snapshot.dirs) {
        nodes.set(dir, {
          type: "dir",
          meta: { createdAt: now(), modifiedAt: now(), mode: 0o755, size: 0 },
        });
      }

      for (const [path, file] of Object.entries(snapshot.files)) {
        const content = new Uint8Array(Buffer.from(file.content, "base64"));
        nodes.set(path, {
          type: "file",
          content,
          meta: {
            createdAt: new Date(file.createdAt),
            modifiedAt: new Date(file.modifiedAt),
            mode: file.mode,
            size: content.length,
          },
        });
      }
    },
  };
}
