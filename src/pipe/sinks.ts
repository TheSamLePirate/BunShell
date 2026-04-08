/**
 * Pipe sinks — terminal stages that write output or materialize results.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import type { PipeStage } from "./types";
import type { WriteResult } from "../wrappers/types";
import { resolve } from "node:path";

/**
 * Write pipe data to a file (as text, one item per line for arrays).
 *
 * @example
 * ```ts
 * pipe(data, pluck("name"), toFile(ctx, "/tmp/names.txt"));
 * ```
 */
export function toFile(
  ctx: CapabilityContext,
  path: string,
): PipeStage<unknown, WriteResult> {
  return async (input) => {
    const absPath = resolve(path);
    ctx.caps.demand({ kind: "fs:write", pattern: absPath });
    ctx.audit.log("fs:write", { op: "toFile", path: absPath });

    const content = Array.isArray(input) ? input.join("\n") : String(input);
    const bytesWritten = await Bun.write(absPath, content);
    return { bytesWritten, path: absPath };
  };
}

/**
 * Write pipe data to a file as formatted JSON.
 *
 * @example
 * ```ts
 * pipe(data, toJSON(ctx, "/tmp/report.json"));
 * ```
 */
export function toJSON(
  ctx: CapabilityContext,
  path: string,
): PipeStage<unknown, WriteResult> {
  return async (input) => {
    const absPath = resolve(path);
    ctx.caps.demand({ kind: "fs:write", pattern: absPath });
    ctx.audit.log("fs:write", { op: "toJSON", path: absPath });

    const content = JSON.stringify(input, null, 2);
    const bytesWritten = await Bun.write(absPath, content);
    return { bytesWritten, path: absPath };
  };
}

/**
 * Print data to stdout and pass it through.
 *
 * @example
 * ```ts
 * pipe(data, toStdout(), nextStage);
 * ```
 */
export function toStdout<T>(): PipeStage<T, T> {
  return (input) => {
    if (Array.isArray(input)) {
      for (const item of input) {
        console.log(item);
      }
    } else {
      console.log(input);
    }
    return input;
  };
}

/**
 * Identity sink — materializes the pipe result.
 * Useful as a terminal stage to make intent explicit.
 *
 * @example
 * ```ts
 * const result = await pipe(data, filter(...), collect());
 * ```
 */
export function collect<T>(): PipeStage<T, T> {
  return (input) => input;
}
