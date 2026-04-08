/**
 * Core audit logger.
 *
 * Intercepts all capability usage and records structured entries.
 * Supports multiple sinks and a query API over the audit trail.
 *
 * @module
 */

import type { AuditLogger, CapabilityKind } from "../capabilities/types";
import type { AuditEntry, AuditSink, AuditQuery } from "./types";

/** Options for creating an audit logger. */
export interface AuditLoggerOptions {
  readonly agentId: string;
  readonly agentName: string;
  readonly sinks?: readonly AuditSink[];
  readonly parentId?: string;
}

/**
 * Full audit logger with query capabilities.
 * Extends the minimal AuditLogger interface from capabilities.
 */
export interface FullAuditLogger extends AuditLogger {
  /** All recorded entries (in-memory). */
  readonly entries: readonly AuditEntry[];

  /** Query the audit trail. */
  query(q: AuditQuery): AuditEntry[];

  /** Flush all sinks. */
  flush(): Promise<void>;

  /** Record a success entry. */
  logSuccess(
    capability: CapabilityKind,
    details: Record<string, unknown>,
    duration?: number,
  ): void;

  /** Record a denied entry. */
  logDenied(
    capability: CapabilityKind,
    details: Record<string, unknown>,
    reason: string,
  ): void;

  /** Record an error entry. */
  logError(
    capability: CapabilityKind,
    details: Record<string, unknown>,
    error: string,
  ): void;
}

/**
 * Create a full audit logger.
 *
 * @example
 * ```ts
 * const audit = createAuditLogger({
 *   agentId: "agent-1",
 *   agentName: "log-analyzer",
 *   sinks: [consoleSink(), jsonlSink("/tmp/audit.jsonl")],
 * });
 *
 * const ctx = createContext({
 *   name: "log-analyzer",
 *   capabilities: [...],
 *   audit,
 * });
 * ```
 */
export function createAuditLogger(
  options: AuditLoggerOptions,
): FullAuditLogger {
  const entries: AuditEntry[] = [];
  const sinks = options.sinks ?? [];

  function record(entry: AuditEntry): void {
    entries.push(entry);
    for (const sink of sinks) {
      sink.write(entry);
    }
  }

  function extractOp(details: Record<string, unknown>): string {
    return typeof details["op"] === "string" ? details["op"] : "unknown";
  }

  return {
    get entries() {
      return entries as readonly AuditEntry[];
    },

    log(capability: CapabilityKind, details: Record<string, unknown>): void {
      record({
        timestamp: new Date(),
        agentId: options.agentId,
        agentName: options.agentName,
        capability,
        operation: extractOp(details),
        args: details,
        result: "success",
        parentId: options.parentId,
      });
    },

    logSuccess(
      capability: CapabilityKind,
      details: Record<string, unknown>,
      duration?: number,
    ): void {
      record({
        timestamp: new Date(),
        agentId: options.agentId,
        agentName: options.agentName,
        capability,
        operation: extractOp(details),
        args: details,
        result: "success",
        duration,
        parentId: options.parentId,
      });
    },

    logDenied(
      capability: CapabilityKind,
      details: Record<string, unknown>,
      reason: string,
    ): void {
      record({
        timestamp: new Date(),
        agentId: options.agentId,
        agentName: options.agentName,
        capability,
        operation: extractOp(details),
        args: details,
        result: "denied",
        error: reason,
        parentId: options.parentId,
      });
    },

    logError(
      capability: CapabilityKind,
      details: Record<string, unknown>,
      error: string,
    ): void {
      record({
        timestamp: new Date(),
        agentId: options.agentId,
        agentName: options.agentName,
        capability,
        operation: extractOp(details),
        args: details,
        result: "error",
        error,
        parentId: options.parentId,
      });
    },

    query(q: AuditQuery): AuditEntry[] {
      let result = entries.slice();

      if (q.agentId) result = result.filter((e) => e.agentId === q.agentId);
      if (q.agentName)
        result = result.filter((e) => e.agentName === q.agentName);
      if (q.capability)
        result = result.filter((e) => e.capability === q.capability);
      if (q.operation)
        result = result.filter((e) => e.operation === q.operation);
      if (q.result) result = result.filter((e) => e.result === q.result);
      if (q.since) {
        const since = q.since;
        result = result.filter((e) => e.timestamp >= since);
      }
      if (q.until) {
        const until = q.until;
        result = result.filter((e) => e.timestamp <= until);
      }
      if (q.limit) result = result.slice(0, q.limit);

      return result;
    },

    async flush(): Promise<void> {
      for (const sink of sinks) {
        if (sink.flush) await sink.flush();
      }
    },
  };
}
