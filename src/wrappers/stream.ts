/**
 * Stream wrappers — streaming I/O for files and processes.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import type { SpawnResult } from "./types";
import { resolve } from "node:path";
import { open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A live spawned process with streaming stdout/stderr. */
export interface StreamingProcess {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exitCode: Promise<number>;
  kill(signal?: string): void;
}

/** A file watcher handle. */
export interface WatchHandle {
  close(): void;
}

// ---------------------------------------------------------------------------
// lineStream — read a file line by line
// ---------------------------------------------------------------------------

/**
 * Stream a file line by line as an async iterable.
 * Memory-efficient for large files.
 *
 * @example
 * ```ts
 * for await (const line of lineStream(ctx, "/var/log/app.log")) {
 *   if (line.includes("ERROR")) console.log(line);
 * }
 * ```
 */
export async function* lineStream(
  ctx: CapabilityContext,
  path: string,
): AsyncIterable<string> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "lineStream", path: absPath });

  const stream = createReadStream(absPath, { encoding: "utf-8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    yield line;
  }
}

// ---------------------------------------------------------------------------
// tailStream — live tail a file (like tail -f)
// ---------------------------------------------------------------------------

/**
 * Live-tail a file, yielding new lines as they're appended.
 * Call return() on the iterator to stop.
 *
 * @example
 * ```ts
 * const tail = tailStream(ctx, "/var/log/app.log");
 * for await (const line of tail) {
 *   console.log("NEW:", line);
 *   if (line.includes("SHUTDOWN")) break;
 * }
 * ```
 */
export async function* tailStream(
  ctx: CapabilityContext,
  path: string,
  opts?: { readonly fromEnd?: boolean },
): AsyncIterable<string> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.audit.log("fs:read", { op: "tailStream", path: absPath });

  const fh = await open(absPath, "r");
  const stat = await fh.stat();
  let offset = opts?.fromEnd === false ? 0 : stat.size;
  let buffer = "";

  try {
    while (true) {
      const currentStat = await fh.stat();
      if (currentStat.size > offset) {
        const chunk = Buffer.alloc(currentStat.size - offset);
        await fh.read(chunk, 0, chunk.length, offset);
        offset = currentStat.size;
        buffer += chunk.toString("utf-8");

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          yield line;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    await fh.close();
  }
}

// ---------------------------------------------------------------------------
// pipeSpawn — pipe string input into a command
// ---------------------------------------------------------------------------

/**
 * Spawn a command with string input piped to its stdin.
 *
 * @example
 * ```ts
 * const result = await pipeSpawn(ctx, "sort", [], "banana\napple\ncherry");
 * // result.stdout === "apple\nbanana\ncherry\n"
 * ```
 */
export async function pipeSpawn(
  ctx: CapabilityContext,
  command: string,
  args: readonly string[],
  input: string,
): Promise<SpawnResult> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: [command] });
  ctx.audit.log("process:spawn", { op: "pipeSpawn", command, args });

  const start = performance.now();
  const proc = Bun.spawn([command, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.write(input);
  proc.stdin.end();

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const duration = performance.now() - start;

  return {
    exitCode,
    stdout,
    stderr,
    success: exitCode === 0,
    duration,
    command,
    args,
  };
}

// ---------------------------------------------------------------------------
// streamSpawn — spawn with streaming stdout/stderr
// ---------------------------------------------------------------------------

/**
 * Spawn a command and get streaming access to its stdout/stderr.
 * Unlike spawn(), this doesn't buffer — you consume the streams.
 *
 * @example
 * ```ts
 * const proc = streamSpawn(ctx, "find", ["/", "-name", "*.log"]);
 * const reader = proc.stdout.getReader();
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   console.log(new TextDecoder().decode(value));
 * }
 * ```
 */
export function streamSpawn(
  ctx: CapabilityContext,
  command: string,
  args: readonly string[] = [],
): StreamingProcess {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: [command] });
  ctx.audit.log("process:spawn", { op: "streamSpawn", command, args });

  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    stdout: proc.stdout as ReadableStream<Uint8Array>,
    stderr: proc.stderr as ReadableStream<Uint8Array>,
    exitCode: proc.exited,
    kill(signal?: string) {
      proc.kill(signal ? (signal as NodeJS.Signals) : undefined);
    },
  };
}
