/**
 * Agent system types.
 *
 * @module
 */

import type { Capability } from "../capabilities/types";
import type { AuditEntry, AuditSink } from "../audit/types";

/** Configuration for running an agent. */
export interface AgentConfig {
  /** Human-readable agent name. */
  readonly name: string;
  /** Path to the agent's .ts file. */
  readonly script: string;
  /** Capabilities granted to the agent. */
  readonly capabilities: readonly Capability[];
  /** Maximum execution time in milliseconds. */
  readonly timeout?: number | undefined;
  /** Audit sinks for logging. */
  readonly sinks?: readonly AuditSink[] | undefined;
}

/** Result of an agent execution. */
export interface AgentResult {
  readonly success: boolean;
  readonly exitCode: number;
  readonly output: unknown;
  readonly auditTrail: readonly AuditEntry[];
  readonly duration: number;
  readonly error?: string | undefined;
}

/**
 * IPC message from sandbox worker to host.
 * @internal
 */
export type WorkerMessage =
  | { type: "audit"; entry: AuditEntry }
  | { type: "result"; output: unknown }
  | { type: "error"; message: string };

/**
 * IPC message from host to sandbox worker.
 * @internal
 */
export interface WorkerInit {
  readonly script: string;
  readonly capabilities: readonly Capability[];
  readonly agentName: string;
  readonly agentId: string;
}
