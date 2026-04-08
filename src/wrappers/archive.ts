/**
 * Archive wrappers — tar, zip, gzip with capability checks.
 *
 * Uses system binaries (tar, zip, unzip, gzip, gunzip) via spawn.
 * Requires fs:read on sources and fs:write on destinations.
 *
 * @module
 */

import type { CapabilityKind, RequireCap } from "../capabilities/types";
import type { WriteResult } from "./types";
import { resolve } from "node:path";
import { stat as fsStat } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an extraction operation. */
export interface ExtractResult {
  readonly dest: string;
  readonly success: boolean;
  readonly output: string;
}

// ---------------------------------------------------------------------------
// tar
// ---------------------------------------------------------------------------

/**
 * Create a .tar.gz archive from files/directories.
 *
 * @example
 * ```ts
 * await tar(ctx, ["src", "package.json"], "backup.tar.gz");
 * ```
 */
export async function tar<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  paths: readonly string[],
  dest: string,
): Promise<WriteResult> {
  const absDest = resolve(dest);
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });

  for (const p of paths) {
    const absP = resolve(p);
    ctx.caps.demand({ kind: "fs:read", pattern: absP });
    try {
      const s = await fsStat(absP);
      if (s.isDirectory()) {
        ctx.caps.demand({ kind: "fs:read", pattern: absP + "/**" });
      }
    } catch {
      // Will fail at tar command
    }
  }

  ctx.audit.log("fs:write", { op: "tar", paths, dest: absDest });

  const proc = Bun.spawn(["tar", "czf", absDest, ...paths], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`tar failed: ${stderr}`);
  }

  const s = await fsStat(absDest);
  return { bytesWritten: s.size, path: absDest };
}

/**
 * Extract a .tar.gz archive.
 *
 * @example
 * ```ts
 * await untar(ctx, "backup.tar.gz", "/tmp/extracted");
 * ```
 */
export async function untar<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  archive: string,
  dest: string,
): Promise<ExtractResult> {
  const absArchive = resolve(archive);
  const absDest = resolve(dest);
  ctx.caps.demand({ kind: "fs:read", pattern: absArchive });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest + "/**" });
  ctx.audit.log("fs:write", {
    op: "untar",
    archive: absArchive,
    dest: absDest,
  });

  const { mkdir } = await import("node:fs/promises");
  await mkdir(absDest, { recursive: true });

  const proc = Bun.spawn(["tar", "xzf", absArchive, "-C", absDest], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { dest: absDest, success: exitCode === 0, output: output || stderr };
}

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------

/**
 * Create a .zip archive.
 *
 * @example
 * ```ts
 * await zip(ctx, ["src", "package.json"], "backup.zip");
 * ```
 */
export async function zip<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  paths: readonly string[],
  dest: string,
): Promise<WriteResult> {
  const absDest = resolve(dest);
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });

  for (const p of paths) {
    const absP = resolve(p);
    ctx.caps.demand({ kind: "fs:read", pattern: absP });
  }

  ctx.audit.log("fs:write", { op: "zip", paths, dest: absDest });

  const proc = Bun.spawn(["zip", "-r", absDest, ...paths], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`zip failed: ${stderr}`);
  }

  const s = await fsStat(absDest);
  return { bytesWritten: s.size, path: absDest };
}

/**
 * Extract a .zip archive.
 *
 * @example
 * ```ts
 * await unzip(ctx, "backup.zip", "/tmp/extracted");
 * ```
 */
export async function unzip<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  archive: string,
  dest: string,
): Promise<ExtractResult> {
  const absArchive = resolve(archive);
  const absDest = resolve(dest);
  ctx.caps.demand({ kind: "fs:read", pattern: absArchive });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest + "/**" });
  ctx.audit.log("fs:write", {
    op: "unzip",
    archive: absArchive,
    dest: absDest,
  });

  const { mkdir } = await import("node:fs/promises");
  await mkdir(absDest, { recursive: true });

  const proc = Bun.spawn(["unzip", "-o", absArchive, "-d", absDest], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { dest: absDest, success: exitCode === 0, output: output || stderr };
}

// ---------------------------------------------------------------------------
// gzip / gunzip
// ---------------------------------------------------------------------------

/**
 * Gzip a file. Creates path.gz alongside the original.
 *
 * @example
 * ```ts
 * await gzip(ctx, "data.json");  // creates data.json.gz
 * ```
 */
export async function gzip<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  path: string,
): Promise<WriteResult> {
  const absPath = resolve(path);
  const absDest = absPath + ".gz";
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });
  ctx.audit.log("fs:write", { op: "gzip", path: absPath });

  const proc = Bun.spawn(["gzip", "-k", absPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`gzip failed: ${stderr}`);
  }

  const s = await fsStat(absDest);
  return { bytesWritten: s.size, path: absDest };
}

/**
 * Gunzip a .gz file. Creates the uncompressed file alongside.
 *
 * @example
 * ```ts
 * await gunzip(ctx, "data.json.gz");  // creates data.json
 * ```
 */
export async function gunzip<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read" | "fs:write">,
  path: string,
): Promise<WriteResult> {
  const absPath = resolve(path);
  const absDest = absPath.replace(/\.gz$/, "");
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });
  ctx.audit.log("fs:write", { op: "gunzip", path: absPath });

  const proc = Bun.spawn(["gunzip", "-k", absPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`gunzip failed: ${stderr}`);
  }

  const s = await fsStat(absDest);
  return { bytesWritten: s.size, path: absDest };
}
