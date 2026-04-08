/**
 * Process wrappers — structured replacements for ps, kill, spawn, exec.
 *
 * @module
 */

import type { CapabilityContext, CapabilityKind, RequireCap } from "../capabilities/types";
import type { ProcessInfo, SpawnResult } from "./types";

// ---------------------------------------------------------------------------
// ps
// ---------------------------------------------------------------------------

/**
 * List running processes with structured output.
 * Requires process:spawn capability for "ps".
 *
 * @example
 * ```ts
 * const procs = await ps(ctx);
 * const node = procs.filter(p => p.name.includes("node"));
 * ```
 */
export async function ps(ctx: CapabilityContext): Promise<ProcessInfo[]> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: ["ps"] });
  ctx.audit.log("process:spawn", { op: "ps" });

  const proc = Bun.spawn(["ps", "-axo", "pid,ppid,user,state,%cpu,%mem,comm"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  const lines = stdout.trim().split("\n").slice(1); // Skip header
  const processes: ProcessInfo[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) continue;

    const pid = parseInt(parts[0]!, 10);
    const ppid = parseInt(parts[1]!, 10);
    const user = parts[2]!;
    const state = parts[3]!;
    const cpu = parseFloat(parts[4]!);
    const memory = parseFloat(parts[5]!);
    const command = parts.slice(6).join(" ");

    if (isNaN(pid)) continue;

    processes.push({
      pid,
      ppid: isNaN(ppid) ? 0 : ppid,
      name: command.split("/").pop() ?? command,
      command,
      user,
      cpu: isNaN(cpu) ? 0 : cpu,
      memory: isNaN(memory) ? 0 : memory,
      state,
    });
  }

  return processes;
}

// ---------------------------------------------------------------------------
// kill
// ---------------------------------------------------------------------------

/**
 * Send a signal to a process.
 *
 * @example
 * ```ts
 * await kill(ctx, 12345);
 * await kill(ctx, 12345, "SIGKILL");
 * ```
 */
export async function kill<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  pid: number,
  signal: string = "SIGTERM",
): Promise<boolean> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: ["kill"] });
  ctx.audit.log("process:spawn", { op: "kill", pid, signal });

  const proc = Bun.spawn(["kill", `-${signal}`, String(pid)], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  return exitCode === 0;
}

// ---------------------------------------------------------------------------
// spawn
// ---------------------------------------------------------------------------

/**
 * Spawn a command and return structured result.
 *
 * @example
 * ```ts
 * const result = await spawn(ctx, "git", ["status"]);
 * if (result.success) console.log(result.stdout);
 * ```
 */
export async function spawn<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  command: string,
  args: readonly string[] = [],
  options?: {
    readonly cwd?: string;
    readonly env?: Record<string, string>;
    readonly timeout?: number;
  },
): Promise<SpawnResult> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: [command] });
  ctx.audit.log("process:spawn", { op: "spawn", command, args });

  const start = performance.now();

  const spawnOpts: {
    stdout: "pipe";
    stderr: "pipe";
    cwd?: string;
    env?: Record<string, string>;
  } = {
    stdout: "pipe",
    stderr: "pipe",
  };
  if (options?.cwd) spawnOpts.cwd = options.cwd;
  if (options?.env) spawnOpts.env = options.env;
  const proc = Bun.spawn([command, ...args], spawnOpts);

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (options?.timeout) {
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, options.timeout);
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  const duration = performance.now() - start;

  if (timer) clearTimeout(timer);

  return {
    exitCode: timedOut ? 124 : exitCode,
    stdout,
    stderr,
    success: !timedOut && exitCode === 0,
    duration,
    command,
    args,
  };
}

// ---------------------------------------------------------------------------
// exec
// ---------------------------------------------------------------------------

/**
 * Execute a command and return stdout. Throws on non-zero exit.
 * Convenience wrapper over spawn() for simple cases.
 *
 * @example
 * ```ts
 * const branch = await exec(ctx, "git", ["branch", "--show-current"]);
 * ```
 */
export async function exec<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  command: string,
  args: readonly string[] = [],
): Promise<string> {
  const result = await spawn(ctx, command, args);
  if (!result.success) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.stderr}`,
    );
  }
  return result.stdout.trimEnd();
}
