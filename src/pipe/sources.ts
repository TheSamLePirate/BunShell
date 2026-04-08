/**
 * Pipe sources — starting points for pipe chains.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import { resolve } from "node:path";

/**
 * Create a pipe source from an array.
 *
 * @example
 * ```ts
 * pipe(from([1, 2, 3]), filter(n => n > 1)); // [2, 3]
 * ```
 */
export function from<T>(data: T[]): T[] {
  return data;
}

/**
 * Read a file as a pipe source.
 *
 * @example
 * ```ts
 * pipe(fromFile(ctx, "/tmp/data.txt"), ...stages);
 * ```
 */
export async function fromFile(
  ctx: CapabilityContext,
  path: string,
): Promise<string> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "fromFile", path: absPath });
  return Bun.file(absPath).text();
}

/**
 * Read and parse a JSON file as a pipe source.
 *
 * @example
 * ```ts
 * pipe(fromJSON<Item[]>(ctx, "/tmp/items.json"), filter(...));
 * ```
 */
export async function fromJSON<T>(
  ctx: CapabilityContext,
  path: string,
): Promise<T> {
  const content = await fromFile(ctx, path);
  return JSON.parse(content) as T;
}

/**
 * Run a command and use its stdout as a pipe source.
 *
 * @example
 * ```ts
 * pipe(fromCommand(ctx, "git", ["log", "--oneline"]), ...stages);
 * ```
 */
export async function fromCommand(
  ctx: CapabilityContext,
  command: string,
  args: string[] = [],
): Promise<string> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: [command] });
  ctx.audit.log("process:spawn", { op: "fromCommand", command, args });

  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return stdout;
}
