/**
 * Filesystem wrappers — structured replacements for ls, cat, stat, etc.
 *
 * Every function requires a CapabilityContext and validates permissions
 * before performing any I/O.
 *
 * @module
 */

import type { CapabilityKind, RequireCap } from "../capabilities/types";
import type {
  FileEntry,
  FilePermissions,
  DiskUsage,
  WriteResult,
} from "./types";
import {
  readdir,
  stat as fsStat,
  lstat,
  chmod as fsChmod,
  symlink as fsSymlink,
  readlink as fsReadlink,
  utimes,
  appendFile,
  truncate as fsTruncate,
  realpath as fsRealpath,
} from "node:fs/promises";
import { watch as fsWatch } from "node:fs";
import { join, extname, basename, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function modeToString(mode: number): string {
  const perms = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  const owner = perms[(mode >> 6) & 7] ?? "---";
  const group = perms[(mode >> 3) & 7] ?? "---";
  const other = perms[mode & 7] ?? "---";
  return `${owner}${group}${other}`;
}

function buildPermissions(mode: number): FilePermissions {
  return {
    readable: (mode & 0o444) !== 0,
    writable: (mode & 0o222) !== 0,
    executable: (mode & 0o111) !== 0,
    mode,
    modeString: modeToString(mode),
  };
}

async function statToFileEntry(path: string, name: string): Promise<FileEntry> {
  const [s, l] = await Promise.all([fsStat(path), lstat(path)]);
  const ext = extname(name);
  return {
    name,
    path,
    size: s.size,
    isDirectory: s.isDirectory(),
    isFile: s.isFile(),
    isSymlink: l.isSymbolicLink(),
    permissions: buildPermissions(s.mode & 0o777),
    modifiedAt: s.mtime,
    createdAt: s.birthtime,
    accessedAt: s.atime,
    extension: ext ? ext.slice(1) : null,
  };
}

function humanSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// ls
// ---------------------------------------------------------------------------

/** Options for the ls() wrapper. */
export interface LsOptions {
  readonly recursive?: boolean;
  readonly hidden?: boolean;
  readonly glob?: string;
  readonly sortBy?: keyof FileEntry;
  readonly order?: "asc" | "desc";
}

/**
 * List directory contents with structured output.
 *
 * @example
 * ```ts
 * const files = await ls(ctx, "/tmp");
 * const tsFiles = await ls(ctx, "/src", { recursive: true, glob: "*.ts" });
 * ```
 */
export async function ls<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string = ".",
  options?: LsOptions,
): Promise<FileEntry[]> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "ls", path: absPath, options });

  const entries: FileEntry[] = [];
  const globMatcher = options?.glob ? new Bun.Glob(options.glob) : null;

  async function walk(dir: string): Promise<void> {
    const items = await readdir(dir);
    for (const name of items) {
      if (!options?.hidden && name.startsWith(".")) continue;

      const fullPath = join(dir, name);

      // Check capability for every discovered path (prevents traversal bypass)
      const check = ctx.caps.check({ kind: "fs:read", pattern: fullPath });
      if (!check.allowed) continue;

      if (globMatcher && !globMatcher.match(name)) {
        // Still recurse into directories if recursive
        if (options?.recursive) {
          try {
            const s = await fsStat(fullPath);
            if (s.isDirectory()) await walk(fullPath);
          } catch {
            // Skip inaccessible entries
          }
        }
        continue;
      }

      try {
        const entry = await statToFileEntry(fullPath, name);
        entries.push(entry);

        if (options?.recursive && entry.isDirectory) {
          await walk(fullPath);
        }
      } catch {
        // Skip entries we can't stat (permission denied, etc.)
      }
    }
  }

  await walk(absPath);

  if (options?.sortBy) {
    const key = options.sortBy;
    const dir = options.order === "desc" ? -1 : 1;
    entries.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av instanceof Date && bv instanceof Date) {
        return (av.getTime() - bv.getTime()) * dir;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// cat
// ---------------------------------------------------------------------------

/**
 * Read file contents as a string.
 *
 * @example
 * ```ts
 * const content = await cat(ctx, "/tmp/data.txt");
 * ```
 */
export async function cat<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
): Promise<string> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "cat", path: absPath });
  return Bun.file(absPath).text();
}

// ---------------------------------------------------------------------------
// stat
// ---------------------------------------------------------------------------

/**
 * Get structured file information.
 *
 * @example
 * ```ts
 * const info = await stat(ctx, "/tmp/data.txt");
 * console.log(info.size, info.permissions.modeString);
 * ```
 */
export async function stat<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
): Promise<FileEntry> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "stat", path: absPath });
  return statToFileEntry(absPath, basename(absPath));
}

// ---------------------------------------------------------------------------
// exists
// ---------------------------------------------------------------------------

/**
 * Check if a path exists.
 *
 * @example
 * ```ts
 * if (await exists(ctx, "/tmp/config.json")) { ... }
 * ```
 */
export async function exists<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
): Promise<boolean> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "exists", path: absPath });
  try {
    await fsStat(absPath);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// mkdir
// ---------------------------------------------------------------------------

/**
 * Create a directory (and parents if needed).
 *
 * @example
 * ```ts
 * await mkdir(ctx, "/tmp/output/reports");
 * ```
 */
export async function mkdir<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:write">,
  path: string,
): Promise<void> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("fs:write", { op: "mkdir", path: absPath });
  const { mkdir: fsMkdir } = await import("node:fs/promises");
  await fsMkdir(absPath, { recursive: true });
}

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------

/**
 * Write data to a file. Objects are auto-serialized to JSON.
 *
 * @example
 * ```ts
 * await write(ctx, "/tmp/out.txt", "hello");
 * await write(ctx, "/tmp/data.json", { key: "value" });
 * ```
 */
export async function write<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:write">,
  path: string,
  data: string | Uint8Array | object,
): Promise<WriteResult> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("fs:write", { op: "write", path: absPath });

  const content =
    typeof data === "string" || data instanceof Uint8Array
      ? data
      : JSON.stringify(data, null, 2);
  const bytesWritten = await Bun.write(absPath, content);
  return { bytesWritten, path: absPath };
}

// ---------------------------------------------------------------------------
// readJson / writeJson
// ---------------------------------------------------------------------------

/**
 * Read and parse a JSON file.
 *
 * @example
 * ```ts
 * const config = await readJson<Config>(ctx, "/tmp/config.json");
 * ```
 */
export async function readJson<
  T = unknown,
  K extends CapabilityKind = CapabilityKind,
>(ctx: RequireCap<K, "fs:read">, path: string): Promise<T> {
  const content = await cat(ctx, path);
  return JSON.parse(content) as T;
}

/**
 * Write data as formatted JSON.
 *
 * @example
 * ```ts
 * await writeJson(ctx, "/tmp/output.json", { results: [...] });
 * ```
 */
export async function writeJson<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:write">,
  path: string,
  data: unknown,
): Promise<WriteResult> {
  return write(ctx, path, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// rm
// ---------------------------------------------------------------------------

/**
 * Remove a file or directory.
 *
 * @example
 * ```ts
 * await rm(ctx, "/tmp/old-output");
 * ```
 */
export async function rm<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:delete">,
  path: string,
  options?: { readonly recursive?: boolean },
): Promise<void> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:delete", pattern: absPath });

  // For recursive deletes, demand wildcard access to everything underneath
  if (options?.recursive) {
    ctx.caps.demand({ kind: "fs:delete", pattern: absPath + "/**" });
  }

  ctx.audit.log("fs:delete", { op: "rm", path: absPath, options });
  const { rm: fsRm } = await import("node:fs/promises");
  await fsRm(absPath, { recursive: options?.recursive ?? false, force: true });
}

// ---------------------------------------------------------------------------
// cp
// ---------------------------------------------------------------------------

/**
 * Copy a file or directory.
 *
 * @example
 * ```ts
 * await cp(ctx, "/tmp/src.txt", "/tmp/dest.txt");
 * ```
 */
export async function cp<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  src: string,
  dest: string,
): Promise<void> {
  const absSrc = resolve(src);
  const absDest = resolve(dest);
  ctx.caps.demand({ kind: "fs:read", pattern: absSrc });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });

  // For directories, demand wildcard access to everything underneath
  try {
    const s = await fsStat(absSrc);
    if (s.isDirectory()) {
      ctx.caps.demand({ kind: "fs:read", pattern: absSrc + "/**" });
      ctx.caps.demand({ kind: "fs:write", pattern: absDest + "/**" });
    }
  } catch {
    // Source doesn't exist — will fail at fsCp
  }

  ctx.audit.log("fs:read", { op: "cp:read", path: absSrc });
  ctx.audit.log("fs:write", { op: "cp:write", path: absDest });
  const { cp: fsCp } = await import("node:fs/promises");
  await fsCp(absSrc, absDest, { recursive: true });
}

// ---------------------------------------------------------------------------
// mv
// ---------------------------------------------------------------------------

/**
 * Move/rename a file or directory.
 *
 * @example
 * ```ts
 * await mv(ctx, "/tmp/old.txt", "/tmp/new.txt");
 * ```
 */
export async function mv<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write" | "fs:delete">,
  src: string,
  dest: string,
): Promise<void> {
  const absSrc = resolve(src);
  const absDest = resolve(dest);
  ctx.caps.demand({ kind: "fs:read", pattern: absSrc });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });
  ctx.caps.demand({ kind: "fs:delete", pattern: absSrc });
  ctx.audit.log("fs:write", { op: "mv", src: absSrc, dest: absDest });
  const { rename } = await import("node:fs/promises");
  await rename(absSrc, absDest);
}

// ---------------------------------------------------------------------------
// find
// ---------------------------------------------------------------------------

/**
 * Find files matching a glob pattern recursively.
 *
 * @example
 * ```ts
 * const tsFiles = await find(ctx, "/src", "*.ts");
 * ```
 */
export async function find<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
  pattern: string,
): Promise<FileEntry[]> {
  return ls(ctx, path, { recursive: true, glob: pattern, hidden: true });
}

// ---------------------------------------------------------------------------
// du
// ---------------------------------------------------------------------------

/**
 * Calculate disk usage for a path.
 *
 * @example
 * ```ts
 * const usage = await du(ctx, "/tmp/data");
 * console.log(usage.human); // "1.5 MB"
 * ```
 */
export async function du<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
): Promise<DiskUsage> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "du", path: absPath });

  let bytes = 0;
  let files = 0;
  let directories = 0;

  async function walk(dir: string): Promise<void> {
    const items = await readdir(dir);
    for (const name of items) {
      const fullPath = join(dir, name);

      // Check capability for every discovered path (prevents traversal bypass)
      const check = ctx.caps.check({ kind: "fs:read", pattern: fullPath });
      if (!check.allowed) continue;

      try {
        const s = await fsStat(fullPath);
        if (s.isDirectory()) {
          directories++;
          await walk(fullPath);
        } else {
          files++;
          bytes += s.size;
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  }

  const s = await fsStat(absPath);
  if (s.isDirectory()) {
    directories++;
    await walk(absPath);
  } else {
    files++;
    bytes = s.size;
  }

  return {
    path: absPath,
    bytes,
    human: humanSize(bytes),
    files,
    directories,
  };
}

// ---------------------------------------------------------------------------
// chmod
// ---------------------------------------------------------------------------

/**
 * Change file permissions.
 *
 * @example
 * ```ts
 * await chmod(ctx, "/tmp/script.sh", 0o755);
 * ```
 */
export async function chmod<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:write">,
  path: string,
  mode: number,
): Promise<void> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("fs:write", { op: "chmod", path: absPath, mode });
  await fsChmod(absPath, mode);
}

// ---------------------------------------------------------------------------
// symlink / readlink
// ---------------------------------------------------------------------------

/**
 * Create a symbolic link.
 *
 * @example
 * ```ts
 * await createSymlink(ctx, "/tmp/data", "/tmp/data-link");
 * ```
 */
export async function createSymlink<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  target: string,
  path: string,
): Promise<void> {
  const absTarget = resolve(target);
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absTarget });
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("fs:write", {
    op: "symlink",
    target: absTarget,
    path: absPath,
  });
  await fsSymlink(absTarget, absPath);
}

/**
 * Read the target of a symbolic link.
 *
 * @example
 * ```ts
 * const target = await readLink(ctx, "/tmp/data-link");
 * ```
 */
export async function readLink<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
): Promise<string> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "readlink", path: absPath });
  return fsReadlink(absPath, "utf-8");
}

// ---------------------------------------------------------------------------
// touch
// ---------------------------------------------------------------------------

/**
 * Create a file or update its timestamps.
 *
 * @example
 * ```ts
 * await touch(ctx, "/tmp/marker");
 * ```
 */
export async function touch<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:write">,
  path: string,
): Promise<void> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("fs:write", { op: "touch", path: absPath });

  try {
    const now = new Date();
    await utimes(absPath, now, now);
  } catch {
    await Bun.write(absPath, "");
  }
}

// ---------------------------------------------------------------------------
// append
// ---------------------------------------------------------------------------

/**
 * Append data to a file.
 *
 * @example
 * ```ts
 * await append(ctx, "/tmp/log.txt", "new line\n");
 * ```
 */
export async function append<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:write">,
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("fs:write", { op: "append", path: absPath });
  await appendFile(absPath, data);
}

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

/**
 * Truncate a file to a given size (default 0).
 *
 * @example
 * ```ts
 * await truncate(ctx, "/tmp/log.txt");
 * await truncate(ctx, "/tmp/data.bin", 1024);
 * ```
 */
export async function truncate<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:write">,
  path: string,
  size: number = 0,
): Promise<void> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("fs:write", { op: "truncate", path: absPath, size });
  await fsTruncate(absPath, size);
}

// ---------------------------------------------------------------------------
// realpath
// ---------------------------------------------------------------------------

/**
 * Resolve a path to its real location, following all symlinks.
 *
 * @example
 * ```ts
 * const real = await realPath(ctx, "/tmp/link");
 * ```
 */
export async function realPath<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
): Promise<string> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "realpath", path: absPath });
  return fsRealpath(absPath, "utf-8");
}

// ---------------------------------------------------------------------------
// watch
// ---------------------------------------------------------------------------

/** Event emitted by a file watcher. */
export interface WatchEvent {
  readonly type: "rename" | "change";
  readonly filename: string | null;
}

/**
 * Watch a file or directory for changes.
 *
 * @example
 * ```ts
 * const watcher = watchPath(ctx, "/tmp/data", (event) => {
 *   console.log(event.type, event.filename);
 * });
 * watcher.close();
 * ```
 */
export function watchPath<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  path: string,
  callback: (event: WatchEvent) => void,
  options?: { readonly recursive?: boolean },
): { close(): void } {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "watch", path: absPath });

  const watcher = fsWatch(
    absPath,
    { recursive: options?.recursive ?? false },
    (eventType, filename) => {
      callback({
        type: eventType as "rename" | "change",
        filename: filename ?? null,
      });
    },
  );

  return {
    close() {
      watcher.close();
    },
  };
}

// ---------------------------------------------------------------------------
// glob
// ---------------------------------------------------------------------------

/**
 * Find files matching a glob pattern. Returns absolute paths.
 * Respects capability checks on each matched file.
 *
 * @example
 * ```ts
 * const tsFiles = await globFiles(ctx, "src/**\/*.ts");
 * ```
 */
export async function globFiles<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,
  pattern: string,
  cwd?: string,
): Promise<string[]> {
  const absBase = resolve(cwd ?? ".");
  ctx.caps.demand({ kind: "fs:read", pattern: absBase });
  ctx.audit.log("fs:read", { op: "glob", pattern, cwd: absBase });

  const glob = new Bun.Glob(pattern);
  const results: string[] = [];

  for await (const match of glob.scan({ cwd: absBase, absolute: true })) {
    const check = ctx.caps.check({ kind: "fs:read", pattern: match });
    if (check.allowed) {
      results.push(match);
    }
  }

  return results.sort();
}
