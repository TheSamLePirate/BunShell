/**
 * Audit system types.
 *
 * @module
 */

import type { CapabilityKind } from "../capabilities/types";

/** A single audited operation. */
export interface AuditEntry {
  readonly timestamp: Date;
  readonly agentId: string;
  readonly agentName: string;
  readonly capability: CapabilityKind;
  readonly operation: string;
  readonly args: Record<string, unknown>;
  readonly result: "success" | "denied" | "error";
  readonly error?: string | undefined;
  readonly duration?: number | undefined;
  readonly parentId?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

/** Pluggable output target for audit entries. */
export interface AuditSink {
  write(entry: AuditEntry): void | Promise<void>;
  flush?(): Promise<void>;
}

/** Query filter for searching audit logs. */
export interface AuditQuery {
  readonly agentId?: string | undefined;
  readonly agentName?: string | undefined;
  readonly capability?: CapabilityKind | undefined;
  readonly operation?: string | undefined;
  readonly result?: "success" | "denied" | "error" | undefined;
  readonly since?: Date | undefined;
  readonly until?: Date | undefined;
  readonly limit?: number | undefined;
}
