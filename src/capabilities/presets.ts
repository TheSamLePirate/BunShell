/**
 * Pre-built capability profiles.
 *
 * Ready-made CapabilitySets for common agent roles.
 * Use as-is or as starting points for custom profiles.
 *
 * @module
 */

import type { CapabilitySet } from "./types";
import { capabilities } from "./builder";

/**
 * Read-only filesystem access. No writes, no network, no spawning.
 *
 * @example
 * ```ts
 * const ctx = createContext({ name: "reader", capabilities: readonlyPreset.capabilities });
 * ```
 */
export const readonlyPreset: CapabilitySet = capabilities()
  .fsRead("**")
  .envRead(["*"])
  .build();

/**
 * Network-only. Fetch from any domain, read env vars. No filesystem access.
 *
 * @example
 * ```ts
 * const ctx = createContext({ name: "fetcher", capabilities: networkOnlyPreset.capabilities });
 * ```
 */
export const networkOnlyPreset: CapabilitySet = capabilities()
  .netFetch(["*"])
  .envRead(["*"])
  .build();

/**
 * Build system agent. Read anywhere, write to build dirs, spawn build tools.
 *
 * @example
 * ```ts
 * const ctx = createContext({ name: "builder", capabilities: builderPreset.capabilities });
 * ```
 */
export const builderPreset: CapabilitySet = capabilities()
  .fsRead("**")
  .fsWrite("dist/**")
  .fsWrite("build/**")
  .fsWrite("node_modules/**")
  .fsWrite(".cache/**")
  .spawn(["bun", "tsc", "git", "esbuild"])
  .envRead(["*"])
  .build();

/**
 * Full unrestricted access. For trusted scripts only.
 *
 * @example
 * ```ts
 * const ctx = createContext({ name: "admin", capabilities: fullPreset.capabilities });
 * ```
 */
export const fullPreset: CapabilitySet = capabilities()
  .fsRead("*")
  .fsWrite("*")
  .fsDelete("*")
  .spawn(["*"])
  .netFetch(["*"])
  .netListen(0)
  .envRead(["*"])
  .envWrite(["*"])
  .dockerRun(["*"])
  .build();
