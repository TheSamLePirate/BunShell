/**
 * CapabilityContext implementation.
 *
 * The execution context is the "passport" an agent receives.
 * It wraps a CapabilitySet and audit logger, and supports
 * derive() for creating sub-contexts with reduced permissions.
 *
 * @module
 */

import {
  type Capability,
  type CapabilityContext,
  type CapabilityKind,
  type CapabilitySet,
  type TypedCapabilitySet,
  type AuditLogger,
  noopAuditLogger,
} from "./types";
import { createCapabilitySet, checkCapability } from "./guard";

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

/** Options for creating a new CapabilityContext (untyped — backward compat). */
export interface CreateContextOptions {
  /** Human-readable name for this agent/context. */
  name: string;
  /** Capabilities to grant. */
  capabilities: readonly Capability[];
  /** Optional audit logger (defaults to noop). */
  audit?: AuditLogger | undefined;
  /** Optional custom ID (auto-generated if omitted). */
  id?: string | undefined;
}

/** Options for creating a typed CapabilityContext (new — auto-inferred K). */
export interface CreateTypedContextOptions<K extends CapabilityKind> {
  /** Human-readable name for this agent/context. */
  name: string;
  /** Typed capability set from builder.build(). */
  capabilitySet: TypedCapabilitySet<K>;
  /** Optional audit logger (defaults to noop). */
  audit?: AuditLogger | undefined;
  /** Optional custom ID (auto-generated if omitted). */
  id?: string | undefined;
}

let contextCounter = 0;

function generateId(name: string): string {
  contextCounter++;
  return `${name}-${String(contextCounter)}-${Date.now().toString(36)}`;
}

/**
 * Create a new CapabilityContext.
 *
 * Two forms:
 * - **Typed** (new): pass `capabilitySet` from builder.build() — K is auto-inferred
 * - **Untyped** (legacy): pass `capabilities` array — returns CapabilityContext (all kinds)
 *
 * @example
 * ```ts
 * // Typed — K is inferred as "fs:read" | "process:spawn"
 * const ctx = createContext({
 *   name: "agent",
 *   capabilitySet: capabilities().fsRead("**").spawn(["git"]).build(),
 * });
 *
 * // Untyped — backward compatible
 * const ctx2 = createContext({
 *   name: "agent",
 *   capabilities: [{ kind: "fs:read", pattern: "**" }],
 * });
 * ```
 */
export function createContext<K extends CapabilityKind>(
  options: CreateTypedContextOptions<K>,
): CapabilityContext<K>;
export function createContext(options: CreateContextOptions): CapabilityContext;
export function createContext<K extends CapabilityKind>(
  options: CreateContextOptions | CreateTypedContextOptions<K>,
): CapabilityContext<K> {
  const id = options.id ?? generateId(options.name);
  const audit = options.audit ?? noopAuditLogger;

  let caps: CapabilitySet;
  if ("capabilitySet" in options) {
    caps = options.capabilitySet;
  } else {
    caps = createCapabilitySet(options.capabilities);
  }

  return buildContext(id, options.name, caps, audit) as CapabilityContext<K>;
}

// ---------------------------------------------------------------------------
// Internal context builder
// ---------------------------------------------------------------------------

function buildContext(
  id: string,
  name: string,
  caps: CapabilitySet,
  audit: AuditLogger,
): CapabilityContext {
  return {
    id,
    name,
    caps,
    audit,

    derive(
      derivedName: string,
      subset: readonly Capability[],
    ): CapabilityContext {
      // Intersection: only keep capabilities that the parent allows.
      // For each requested capability, check if the parent grants it.
      const allowed: Capability[] = [];

      for (const requested of subset) {
        const matching = caps.capabilities.filter(
          (c) => c.kind === requested.kind,
        );
        for (const held of matching) {
          const result = checkCapability(held, requested);
          if (result.allowed) {
            allowed.push(requested);
            break;
          }
        }
      }

      const derivedId = generateId(derivedName);
      const derivedCaps = createCapabilitySet(allowed);

      return buildContext(derivedId, derivedName, derivedCaps, audit);
    },
  };
}
