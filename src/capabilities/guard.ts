/**
 * Runtime capability guard.
 *
 * Complements compile-time type checks with runtime enforcement.
 * Uses Bun.Glob for path matching and resolves symlinks to
 * prevent escape attacks.
 *
 * @module
 */

import {
  type Capability,
  type CapabilityKind,
  CapabilityError,
  type CheckResult,
  type CapabilitySet,
} from "./types";
import { realpathSync } from "node:fs";

// ---------------------------------------------------------------------------
// Path resolution (symlink-safe)
// ---------------------------------------------------------------------------

/**
 * Resolve a path to its real location, following symlinks.
 * Returns the original path if it doesn't exist yet (for write targets).
 *
 * @example
 * ```ts
 * resolvePath("/tmp/link-to-etc") // "/etc"
 * resolvePath("/tmp/new-file.txt") // "/tmp/new-file.txt" (doesn't exist)
 * ```
 */
export function resolvePath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    // File doesn't exist yet — resolve parent directory instead
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash <= 0) return path;
    const parent = path.slice(0, lastSlash);
    const basename = path.slice(lastSlash);
    try {
      return realpathSync(parent) + basename;
    } catch {
      return path;
    }
  }
}

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

/**
 * Check if a path matches a glob pattern using Bun.Glob.
 *
 * @example
 * ```ts
 * matchesGlob("/tmp/foo.txt", "/tmp/**")  // true
 * matchesGlob("/etc/passwd", "/tmp/**")   // false
 * matchesGlob("anything", "*")            // true (wildcard)
 * ```
 */
export function matchesGlob(path: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const glob = new Bun.Glob(pattern);
  return glob.match(path);
}

/**
 * Resolve the base (non-glob) portion of a pattern through symlinks.
 * E.g. on macOS: "/tmp/**" → "/private/tmp/**" because /tmp → /private/tmp.
 *
 * @example
 * ```ts
 * resolvePattern("/tmp/**") // "/private/tmp/**" on macOS
 * resolvePattern("*")       // "*"
 * ```
 */
export function resolvePattern(pattern: string): string {
  if (pattern === "*") return pattern;
  // Find where the first glob character appears
  const globChars = ["*", "?", "[", "{"];
  let globStart = pattern.length;
  for (const ch of globChars) {
    const idx = pattern.indexOf(ch);
    if (idx !== -1 && idx < globStart) globStart = idx;
  }
  // Split into base path and glob suffix
  const basePath = pattern.slice(0, globStart);
  const globSuffix = pattern.slice(globStart);
  // Find the last directory separator in the base
  const lastSlash = basePath.lastIndexOf("/");
  if (lastSlash <= 0) return pattern;
  const dir = basePath.slice(0, lastSlash);
  const rest = basePath.slice(lastSlash);
  const resolvedDir = resolvePath(dir);
  return resolvedDir + rest + globSuffix;
}

// ---------------------------------------------------------------------------
// Capability-specific checkers
// ---------------------------------------------------------------------------

type CapabilityChecker = (
  held: Capability,
  required: Capability,
) => CheckResult;

function checkPathCapability(
  held: Capability & { pattern: string },
  required: Capability & { pattern: string },
): CheckResult {
  const resolvedPath = resolvePath(required.pattern);
  const resolvedHeldPattern = resolvePattern(held.pattern);

  // Match the resolved path against both the original and resolved patterns
  const allowed =
    matchesGlob(required.pattern, held.pattern) ||
    matchesGlob(resolvedPath, held.pattern) ||
    matchesGlob(required.pattern, resolvedHeldPattern) ||
    matchesGlob(resolvedPath, resolvedHeldPattern);

  return {
    allowed,
    capability: required,
    reason: allowed
      ? undefined
      : `Path "${resolvedPath}" does not match pattern "${held.pattern}"`,
  };
}

function checkSpawn(held: Capability, required: Capability): CheckResult {
  const h = held as Capability & {
    allowedBinaries: readonly string[];
  };
  const r = required as Capability & {
    allowedBinaries: readonly string[];
  };

  if (h.allowedBinaries.includes("*")) {
    return { allowed: true, capability: required };
  }

  const binary = r.allowedBinaries[0];
  if (!binary) {
    return {
      allowed: false,
      capability: required,
      reason: "No binary specified",
    };
  }

  const allowed = h.allowedBinaries.includes(binary);
  return {
    allowed,
    capability: required,
    reason: allowed
      ? undefined
      : `Binary "${binary}" not in allowed list [${h.allowedBinaries.join(", ")}]`,
  };
}

function checkNetFetch(held: Capability, required: Capability): CheckResult {
  const h = held as Capability & {
    allowedDomains: readonly string[];
    allowedPorts?: readonly number[];
  };
  const r = required as Capability & {
    allowedDomains: readonly string[];
    allowedPorts?: readonly number[];
  };

  if (h.allowedDomains.includes("*")) {
    return { allowed: true, capability: required };
  }

  const domain = r.allowedDomains[0];
  if (!domain) {
    return {
      allowed: false,
      capability: required,
      reason: "No domain specified",
    };
  }

  const domainAllowed = h.allowedDomains.includes(domain);
  if (!domainAllowed) {
    return {
      allowed: false,
      capability: required,
      reason: `Domain "${domain}" not in allowed list [${h.allowedDomains.join(", ")}]`,
    };
  }

  if (h.allowedPorts && r.allowedPorts) {
    const port = r.allowedPorts[0];
    if (port !== undefined && !h.allowedPorts.includes(port)) {
      return {
        allowed: false,
        capability: required,
        reason: `Port ${String(port)} not in allowed list [${h.allowedPorts.join(", ")}]`,
      };
    }
  }

  return { allowed: true, capability: required };
}

function checkNetListen(held: Capability, required: Capability): CheckResult {
  const h = held as Capability & { port: number };
  const r = required as Capability & { port: number };

  // Port 0 means "any port" in the held capability
  if (h.port === 0) {
    return { allowed: true, capability: required };
  }

  const allowed = h.port === r.port;
  return {
    allowed,
    capability: required,
    reason: allowed
      ? undefined
      : `Port ${String(r.port)} does not match allowed port ${String(h.port)}`,
  };
}

function checkEnvCapability(
  held: Capability & { allowedKeys: readonly string[] },
  required: Capability & { allowedKeys: readonly string[] },
): CheckResult {
  if (held.allowedKeys.includes("*")) {
    return { allowed: true, capability: required };
  }

  const key = required.allowedKeys[0];
  if (!key) {
    return {
      allowed: false,
      capability: required,
      reason: "No env key specified",
    };
  }

  const allowed = held.allowedKeys.includes(key);
  return {
    allowed,
    capability: required,
    reason: allowed
      ? undefined
      : `Env key "${key}" not in allowed list [${held.allowedKeys.join(", ")}]`,
  };
}

function checkNetConnect(held: Capability, required: Capability): CheckResult {
  const h = held as Capability & {
    allowedHosts: readonly string[];
    allowedPorts?: readonly number[];
  };
  const r = required as Capability & {
    allowedHosts: readonly string[];
    allowedPorts?: readonly number[];
  };

  if (h.allowedHosts.includes("*")) {
    return { allowed: true, capability: required };
  }

  const host = r.allowedHosts[0];
  if (!host) {
    return {
      allowed: false,
      capability: required,
      reason: "No host specified",
    };
  }

  const hostAllowed = h.allowedHosts.includes(host);
  if (!hostAllowed) {
    return {
      allowed: false,
      capability: required,
      reason: `Host "${host}" not in allowed list [${h.allowedHosts.join(", ")}]`,
    };
  }

  if (h.allowedPorts && r.allowedPorts) {
    const port = r.allowedPorts[0];
    if (port !== undefined && !h.allowedPorts.includes(port)) {
      return {
        allowed: false,
        capability: required,
        reason: `Port ${String(port)} not in allowed list [${h.allowedPorts.join(", ")}]`,
      };
    }
  }

  return { allowed: true, capability: required };
}

function checkOsInteract(_held: Capability, required: Capability): CheckResult {
  return { allowed: true, capability: required };
}

/** Map capability kinds to their checker functions. */
const checkers: Record<CapabilityKind, CapabilityChecker> = {
  "fs:read": checkPathCapability as CapabilityChecker,
  "fs:write": checkPathCapability as CapabilityChecker,
  "fs:delete": checkPathCapability as CapabilityChecker,
  "process:spawn": checkSpawn,
  "net:fetch": checkNetFetch,
  "net:listen": checkNetListen,
  "env:read": checkEnvCapability as CapabilityChecker,
  "env:write": checkEnvCapability as CapabilityChecker,
  "db:query": checkPathCapability as CapabilityChecker,
  "net:connect": checkNetConnect,
  "os:interact": checkOsInteract,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a single required capability against a single held capability.
 *
 * @example
 * ```ts
 * const held: FSRead = { kind: "fs:read", pattern: "/tmp/**" };
 * const required: FSRead = { kind: "fs:read", pattern: "/tmp/foo.txt" };
 * const result = checkCapability(held, required);
 * // { allowed: true, capability: required }
 * ```
 */
export function checkCapability(
  held: Capability,
  required: Capability,
): CheckResult {
  if (held.kind !== required.kind) {
    return {
      allowed: false,
      capability: required,
      reason: `Capability kind mismatch: have "${held.kind}", need "${required.kind}"`,
    };
  }
  return checkers[held.kind](held, required);
}

/**
 * Create an immutable CapabilitySet from an array of capabilities.
 *
 * @example
 * ```ts
 * const set = createCapabilitySet([
 *   { kind: "fs:read", pattern: "/tmp/**" },
 *   { kind: "process:spawn", allowedBinaries: ["git"] },
 * ]);
 * set.has("fs:read"); // true
 * set.demand({ kind: "fs:read", pattern: "/tmp/foo" }); // OK
 * set.demand({ kind: "fs:read", pattern: "/etc/passwd" }); // throws!
 * ```
 */
export function createCapabilitySet(
  capabilities: readonly Capability[],
): CapabilitySet {
  const frozen = Object.freeze([...capabilities]);

  return {
    capabilities: frozen,

    has(kind: CapabilityKind): boolean {
      return frozen.some((c) => c.kind === kind);
    },

    getAll(kind: CapabilityKind): readonly Capability[] {
      return frozen.filter((c) => c.kind === kind);
    },

    check(required: Capability): CheckResult {
      const matching = frozen.filter((c) => c.kind === required.kind);

      if (matching.length === 0) {
        return {
          allowed: false,
          capability: required,
          reason: `No capability of kind "${required.kind}" granted`,
        };
      }

      // Any matching capability that allows the operation is sufficient
      for (const held of matching) {
        const result = checkCapability(held, required);
        if (result.allowed) return result;
      }

      // All matched capabilities denied — return the last denial reason
      return checkCapability(matching[matching.length - 1]!, required);
    },

    demand(required: Capability): void {
      const result = this.check(required);
      if (!result.allowed) {
        throw new CapabilityError(
          required,
          result.reason ?? "Capability denied",
        );
      }
    },
  };
}
