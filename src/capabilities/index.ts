/**
 * BunShell Capability System — Layer 1
 *
 * Types ARE permissions. Every system operation requires
 * a capability that is checked at both compile time and runtime.
 *
 * @module
 */

// Core types
export type {
  Result,
  GlobPattern,
  FSRead,
  FSWrite,
  FSDelete,
  Spawn,
  NetFetch,
  NetListen,
  EnvRead,
  EnvWrite,
  DbQuery,
  NetConnect,
  OsInteract,
  SecretRead,
  SecretWrite,
  Capability,
  CapabilityKind,
  CheckResult,
  CapabilitySet,
  TypedCapabilitySet,
  AuditLogger,
  CapabilityContext,
} from "./types";

export { ok, err, CapabilityError, noopAuditLogger } from "./types";

// Guard (runtime enforcement)
export {
  resolvePath,
  resolvePattern,
  matchesGlob,
  checkCapability,
  createCapabilitySet,
} from "./guard";

// Context
export { createContext } from "./context";
export type {
  CreateContextOptions,
  CreateTypedContextOptions,
} from "./context";

// Builder
export { capabilities } from "./builder";
export type { CapabilityBuilder } from "./builder";

// Presets
export {
  readonlyPreset,
  networkOnlyPreset,
  builderPreset,
  fullPreset,
} from "./presets";
