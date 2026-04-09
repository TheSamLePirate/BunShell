/**
 * JSON-RPC 2.0 protocol types for BunShell server mode.
 *
 * Any harness (Claude Code, Cursor, custom) sends these messages
 * to BunShell and gets typed results back.
 *
 * @module
 */

import type { Capability } from "../capabilities/types";
import type { VfsSnapshot } from "../vfs/vfs";

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 base types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id: string | number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: string | number;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom codes
  SESSION_NOT_FOUND: -32001,
  CAPABILITY_DENIED: -32002,
  EXECUTION_ERROR: -32003,
  TIMEOUT: -32004,
  PLUGIN_VALIDATION_FAILED: -32005,
  PLUGIN_NOT_FOUND: -32006,
} as const;

// ---------------------------------------------------------------------------
// Method params / results
// ---------------------------------------------------------------------------

/** session.create — create a new execution session. */
export interface SessionCreateParams {
  /** Session name (human-readable). */
  readonly name: string;
  /** Capabilities to grant. */
  readonly capabilities: readonly Capability[];
  /** Pre-populate the VFS with files. */
  readonly files?: Record<string, string>;
  /** Mount a disk directory into the VFS. */
  readonly mount?: { diskPath: string; vfsPath: string };
  /** Execution timeout in ms (default: 30000). */
  readonly timeout?: number;
}

export interface SessionCreateResult {
  readonly sessionId: string;
  readonly name: string;
  readonly capabilities: readonly Capability[];
  readonly fileCount: number;
}

/** session.execute — run TypeScript code in a session. */
export interface SessionExecuteParams {
  readonly sessionId: string;
  /** TypeScript code to evaluate. */
  readonly code: string;
  /** Execution timeout override in ms. */
  readonly timeout?: number;
}

export interface SessionExecuteResult {
  readonly value: unknown;
  readonly type: string;
  readonly duration: number;
  readonly auditEntries: number;
}

/** session.destroy — tear down a session. */
export interface SessionDestroyParams {
  readonly sessionId: string;
}

export interface SessionDestroyResult {
  readonly sessionId: string;
  readonly totalExecutions: number;
  readonly totalAuditEntries: number;
}

/** session.list — list active sessions. */
export interface SessionListResult {
  readonly sessions: ReadonlyArray<{
    readonly sessionId: string;
    readonly name: string;
    readonly fileCount: number;
    readonly createdAt: string;
  }>;
}

/** session.audit — get audit trail for a session. */
export interface SessionAuditParams {
  readonly sessionId: string;
  readonly limit?: number;
  readonly capability?: string;
}

export interface SessionAuditResult {
  readonly entries: ReadonlyArray<{
    readonly timestamp: string;
    readonly capability: string;
    readonly operation: string;
    readonly result: string;
  }>;
}

/** session.fs.read — read a file from VFS. */
export interface SessionFsReadParams {
  readonly sessionId: string;
  readonly path: string;
}

export interface SessionFsReadResult {
  readonly path: string;
  readonly content: string;
  readonly size: number;
}

/** session.fs.write — write a file to VFS. */
export interface SessionFsWriteParams {
  readonly sessionId: string;
  readonly path: string;
  readonly content: string;
}

export interface SessionFsWriteResult {
  readonly path: string;
  readonly size: number;
}

/** session.fs.list — list VFS directory. */
export interface SessionFsListParams {
  readonly sessionId: string;
  readonly path: string;
}

export interface SessionFsListResult {
  readonly entries: ReadonlyArray<{
    readonly name: string;
    readonly path: string;
    readonly isFile: boolean;
    readonly size: number;
  }>;
}

/** session.fs.snapshot — export full VFS state. */
export interface SessionFsSnapshotParams {
  readonly sessionId: string;
}

export interface SessionFsSnapshotResult {
  readonly snapshot: VfsSnapshot;
  readonly fileCount: number;
  readonly totalBytes: number;
}

/** workspace.requestPluginApproval — agent submits a plugin for review. */
export interface PluginApprovalRequestParams {
  readonly sessionId: string;
  readonly pluginName: string;
  readonly source: string;
}

export interface PluginApprovalRequestResult {
  readonly pluginName: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly exports: readonly string[];
  readonly status: "pending" | "approved" | "rejected";
}

/** workspace.approvePlugin — human approves a pending plugin. */
export interface PluginApproveParams {
  readonly sessionId: string;
  readonly pluginName: string;
}

export interface PluginApproveResult {
  readonly pluginName: string;
  readonly exports: readonly string[];
  readonly status: "approved";
}

/** workspace.rejectPlugin — human rejects a pending plugin. */
export interface PluginRejectParams {
  readonly sessionId: string;
  readonly pluginName: string;
}

/** workspace.listPlugins — list all plugins in a session. */
export interface PluginListParams {
  readonly sessionId: string;
}
