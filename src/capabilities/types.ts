/**
 * BunShell Capability Type System
 *
 * Core types that make permissions compile-time checkable.
 * Each capability represents a single, atomic permission.
 * Types ARE permissions — if it compiles, it's authorized.
 */

// ---------------------------------------------------------------------------
// Result type — used throughout the codebase
// ---------------------------------------------------------------------------

/** Discriminated union for fallible operations. */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Create a success result. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Create a failure result. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Capability error
// ---------------------------------------------------------------------------

/** Thrown when an operation is denied by the capability system. */
export class CapabilityError extends Error {
  readonly capability: Capability;
  readonly reason: string;

  constructor(capability: Capability, reason: string) {
    super(`Capability denied [${capability.kind}]: ${reason}`);
    this.name = "CapabilityError";
    this.capability = capability;
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Core capability interfaces
// ---------------------------------------------------------------------------

/** Glob pattern for path matching. Runtime-validated via Bun.Glob. */
export type GlobPattern = string;

/** Read files/directories matching a glob pattern. */
export interface FSRead<P extends GlobPattern = string> {
  readonly kind: "fs:read";
  readonly pattern: P;
}

/** Write files matching a glob pattern. */
export interface FSWrite<P extends GlobPattern = string> {
  readonly kind: "fs:write";
  readonly pattern: P;
}

/** Delete files matching a glob pattern. */
export interface FSDelete<P extends GlobPattern = string> {
  readonly kind: "fs:delete";
  readonly pattern: P;
}

/** Spawn specific binaries. */
export interface Spawn<B extends string = string> {
  readonly kind: "process:spawn";
  readonly allowedBinaries: readonly B[];
}

/** Fetch from specific domains. */
export interface NetFetch<D extends string = string> {
  readonly kind: "net:fetch";
  readonly allowedDomains: readonly D[];
  readonly allowedPorts?: readonly number[] | undefined;
}

/** Listen on a specific port. */
export interface NetListen<P extends number = number> {
  readonly kind: "net:listen";
  readonly port: P;
}

/** Read specific environment variables. */
export interface EnvRead<K extends string = string> {
  readonly kind: "env:read";
  readonly allowedKeys: readonly K[];
}

/** Write specific environment variables. */
export interface EnvWrite<K extends string = string> {
  readonly kind: "env:write";
  readonly allowedKeys: readonly K[];
}

/** Access a database at a specific path. */
export interface DbQuery<P extends GlobPattern = string> {
  readonly kind: "db:query";
  readonly pattern: P;
}

/** Raw TCP/UDP connection to specific hosts. */
export interface NetConnect<H extends string = string> {
  readonly kind: "net:connect";
  readonly allowedHosts: readonly H[];
  readonly allowedPorts?: readonly number[] | undefined;
}

/** Desktop/OS interaction (notifications, clipboard, open). */
export interface OsInteract {
  readonly kind: "os:interact";
}

/** Run Docker containers with specific images. */
export interface DockerRun<I extends string = string> {
  readonly kind: "docker:run";
  readonly allowedImages: readonly I[];
}

/**
 * Dynamic plugin capability — agents can write their own typed wrappers.
 * The kind is a template literal: "plugin:my-tool", "plugin:deploy", etc.
 * Plugin functions must declare their transitive core capabilities via RequireCap.
 */
export interface PluginCap<P extends string = string> {
  readonly kind: `plugin:${P}`;
  readonly pluginName: P;
}

/** Read secrets by scoped key pattern. */
export interface SecretRead<K extends string = string> {
  readonly kind: "secret:read";
  readonly allowedKeys: readonly K[];
}

/** Write/create secrets by scoped key pattern. */
export interface SecretWrite<K extends string = string> {
  readonly kind: "secret:write";
  readonly allowedKeys: readonly K[];
}

// ---------------------------------------------------------------------------
// Union + kind literal
// ---------------------------------------------------------------------------

/** Union of all capability types. */
export type Capability =
  | FSRead
  | FSWrite
  | FSDelete
  | Spawn
  | NetFetch
  | NetListen
  | EnvRead
  | EnvWrite
  | DbQuery
  | NetConnect
  | OsInteract
  | SecretRead
  | SecretWrite
  | DockerRun
  | PluginCap;

/**
 * Discriminant values for all capabilities.
 * Includes the open-ended `plugin:${string}` template literal
 * so agents can declare custom plugin capabilities.
 */
export type CapabilityKind = Capability["kind"];

// ---------------------------------------------------------------------------
// Check result
// ---------------------------------------------------------------------------

/** Result of a capability check. */
export interface CheckResult {
  readonly allowed: boolean;
  readonly capability: Capability;
  readonly reason?: string | undefined;
}

// ---------------------------------------------------------------------------
// Capability set
// ---------------------------------------------------------------------------

/**
 * Immutable set of capabilities — the "passport" an agent carries.
 * Once created, capabilities cannot be added, only reduced via derive().
 */
export interface CapabilitySet {
  /** All capabilities in this set. */
  readonly capabilities: readonly Capability[];

  /** Check if this set contains a capability of the given kind. */
  has(kind: CapabilityKind): boolean;

  /** Get all capabilities of the given kind. */
  getAll(kind: CapabilityKind): readonly Capability[];

  /**
   * Check whether a required capability is satisfied by this set.
   * Returns a CheckResult — does NOT throw.
   */
  check(required: Capability): CheckResult;

  /**
   * Like check(), but throws CapabilityError if denied.
   * This is the primary runtime enforcement point.
   */
  demand(required: Capability): void;
}

/**
 * A CapabilitySet branded with the kinds it contains.
 * Produced by the typed builder's build() method.
 * Enables createContext to infer the K parameter automatically.
 */
export interface TypedCapabilitySet<
  K extends CapabilityKind,
> extends CapabilitySet {
  /** Brand field for type inference. Not present at runtime. */
  readonly __kinds?: K | undefined;
}

// ---------------------------------------------------------------------------
// Audit logger interface (minimal — full impl in Phase 4)
// ---------------------------------------------------------------------------

/** Minimal audit logger interface used by CapabilityContext. */
export interface AuditLogger {
  log(capability: CapabilityKind, details: Record<string, unknown>): void;
}

/** No-op audit logger for contexts that don't need auditing. */
export const noopAuditLogger: AuditLogger = {
  log() {},
};

// ---------------------------------------------------------------------------
// Type-level capability helpers
// ---------------------------------------------------------------------------

/**
 * Require that a context has ALL the specified capability kinds.
 * Used by wrapper functions to enforce permissions at the type level.
 *
 * @example
 * ```ts
 * // ls requires fs:read — tsc rejects contexts without it:
 * function ls(ctx: RequireCap<K, "fs:read">, path?: string): Promise<FileEntry[]>
 *
 * // cp requires BOTH fs:read AND fs:write:
 * function cp(ctx: RequireCap<K, "fs:read" | "fs:write">, src: string, dest: string): Promise<void>
 * ```
 */
export type RequireCap<
  K extends CapabilityKind,
  Required extends CapabilityKind,
> = [Required] extends [K] ? CapabilityContext<K> : never;

// ---------------------------------------------------------------------------
// Capability context
// ---------------------------------------------------------------------------

/**
 * The execution context for an agent. All system operations
 * go through this — it bridges types and runtime enforcement.
 *
 * @typeParam K - Union of capability kinds this context holds.
 *   Defaults to all kinds (full access) for backward compatibility.
 *
 * @example
 * ```ts
 * // Full access context:
 * const full: CapabilityContext<CapabilityKind> = createContext({ ... });
 *
 * // Restricted context — only fs:read + env:read:
 * const restricted: CapabilityContext<"fs:read" | "env:read"> = ...;
 *
 * ls(restricted, ".");  // OK — has fs:read
 * write(restricted, "f", "d");  // TYPE ERROR — no fs:write
 * ```
 */
export interface CapabilityContext<K extends CapabilityKind = CapabilityKind> {
  /** Unique agent identifier. */
  readonly id: string;
  /** Human-readable agent name. */
  readonly name: string;
  /** Immutable permission set. */
  readonly caps: CapabilitySet;
  /** Auto-injected audit logger. */
  readonly audit: AuditLogger;

  /**
   * Create a sub-context with reduced capabilities.
   * An agent can NEVER escalate — only reduce.
   * S must be a subset of K.
   */
  derive<S extends K>(
    name: string,
    subset: readonly Capability[],
  ): CapabilityContext<S>;
}
