/**
 * Environment variable wrappers — typed access to env vars.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import type { EnvEntry } from "./types";

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

/**
 * List all environment variables as structured entries.
 * Requires env:read with wildcard "*".
 *
 * @example
 * ```ts
 * const vars = env(ctx);
 * const paths = vars.filter(e => e.key.includes("PATH"));
 * ```
 */
export function env(ctx: CapabilityContext): EnvEntry[] {
  ctx.caps.demand({ kind: "env:read", allowedKeys: ["*"] });
  ctx.audit.log("env:read", { op: "env" });

  return Object.entries(Bun.env)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => ({ key, value }));
}

// ---------------------------------------------------------------------------
// getEnv
// ---------------------------------------------------------------------------

/**
 * Get a single environment variable.
 *
 * @example
 * ```ts
 * const home = getEnv(ctx, "HOME");
 * ```
 */
export function getEnv(
  ctx: CapabilityContext,
  key: string,
): string | undefined {
  ctx.caps.demand({ kind: "env:read", allowedKeys: [key] });
  ctx.audit.log("env:read", { op: "getEnv", key });
  return Bun.env[key];
}

// ---------------------------------------------------------------------------
// setEnv
// ---------------------------------------------------------------------------

/**
 * Set an environment variable.
 *
 * @example
 * ```ts
 * setEnv(ctx, "NODE_ENV", "production");
 * ```
 */
export function setEnv(
  ctx: CapabilityContext,
  key: string,
  value: string,
): void {
  ctx.caps.demand({ kind: "env:write", allowedKeys: [key] });
  ctx.audit.log("env:write", { op: "setEnv", key });
  process.env[key] = value;
}
