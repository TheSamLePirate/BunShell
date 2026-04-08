/**
 * System information wrappers — structured uname, uptime, whoami, etc.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import type { SystemInfo, DfEntry } from "./types";
import {
  hostname as osHostname,
  platform,
  arch,
  release,
  uptime as osUptime,
  userInfo,
} from "node:os";

// ---------------------------------------------------------------------------
// uname
// ---------------------------------------------------------------------------

/**
 * Get system information.
 *
 * @example
 * ```ts
 * const info = uname(ctx);
 * console.log(info.os, info.arch); // "darwin" "arm64"
 * ```
 */
export function uname(ctx: CapabilityContext): SystemInfo {
  ctx.caps.demand({ kind: "env:read", allowedKeys: ["*"] });
  ctx.audit.log("env:read", { op: "uname" });
  return {
    os: platform(),
    hostname: osHostname(),
    release: release(),
    arch: arch(),
    platform: `${platform()}-${arch()}`,
  };
}

// ---------------------------------------------------------------------------
// uptime
// ---------------------------------------------------------------------------

/**
 * Get system uptime in seconds.
 *
 * @example
 * ```ts
 * const seconds = uptime(ctx);
 * ```
 */
export function uptime(ctx: CapabilityContext): number {
  ctx.caps.demand({ kind: "env:read", allowedKeys: ["*"] });
  ctx.audit.log("env:read", { op: "uptime" });
  return osUptime();
}

// ---------------------------------------------------------------------------
// whoami
// ---------------------------------------------------------------------------

/**
 * Get the current username.
 *
 * @example
 * ```ts
 * const user = whoami(ctx);
 * ```
 */
export function whoami(ctx: CapabilityContext): string {
  ctx.caps.demand({ kind: "env:read", allowedKeys: ["*"] });
  ctx.audit.log("env:read", { op: "whoami" });
  return userInfo().username;
}

// ---------------------------------------------------------------------------
// hostname
// ---------------------------------------------------------------------------

/**
 * Get the system hostname.
 *
 * @example
 * ```ts
 * const name = hostname(ctx);
 * ```
 */
export function hostname(ctx: CapabilityContext): string {
  ctx.caps.demand({ kind: "env:read", allowedKeys: ["*"] });
  ctx.audit.log("env:read", { op: "hostname" });
  return osHostname();
}

// ---------------------------------------------------------------------------
// df
// ---------------------------------------------------------------------------

/**
 * Get disk space information.
 * Requires process:spawn for "df".
 *
 * @example
 * ```ts
 * const disks = await df(ctx);
 * const root = disks.find(d => d.mountedOn === "/");
 * ```
 */
export async function df(ctx: CapabilityContext): Promise<DfEntry[]> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: ["df"] });
  ctx.audit.log("process:spawn", { op: "df" });

  const proc = Bun.spawn(["df", "-h"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  const lines = stdout.trim().split("\n").slice(1);
  const entries: DfEntry[] = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;

    entries.push({
      filesystem: parts[0]!,
      size: parts[1]!,
      used: parts[2]!,
      available: parts[3]!,
      usePercent: parts[4]!,
      mountedOn: parts.slice(5).join(" "),
    });
  }

  return entries;
}
