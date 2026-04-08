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
  type CapabilitySet,
  type AuditLogger,
  noopAuditLogger,
} from "./types";
import { createCapabilitySet, checkCapability } from "./guard";

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

/** Options for creating a new CapabilityContext. */
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

let contextCounter = 0;

function generateId(name: string): string {
  contextCounter++;
  return `${name}-${String(contextCounter)}-${Date.now().toString(36)}`;
}

/**
 * Create a new CapabilityContext — the primary way to start an execution.
 *
 * @example
 * ```ts
 * const ctx = createContext({
 *   name: "log-analyzer",
 *   capabilities: [
 *     { kind: "fs:read", pattern: "/var/log/**" },
 *     { kind: "fs:write", pattern: "/tmp/reports/**" },
 *   ],
 * });
 * ```
 */
export function createContext(
  options: CreateContextOptions,
): CapabilityContext {
  const id = options.id ?? generateId(options.name);
  const caps = createCapabilitySet(options.capabilities);
  const audit = options.audit ?? noopAuditLogger;

  return buildContext(id, options.name, caps, audit);
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
