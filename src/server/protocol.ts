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
  CONFIG_NOT_FOUND: -32007,
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

// ---------------------------------------------------------------------------
// Admin API types
// ---------------------------------------------------------------------------

/** admin.audit.query — cross-session audit query. */
export interface AdminAuditQueryParams {
  readonly sessionId?: string;
  readonly capability?: string;
  readonly operation?: string;
  readonly result?: "success" | "denied" | "error";
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AdminAuditQueryResult {
  readonly entries: ReadonlyArray<{
    readonly sessionId: string;
    readonly sessionName: string;
    readonly timestamp: string;
    readonly capability: string;
    readonly operation: string;
    readonly args: Record<string, unknown>;
    readonly result: string;
    readonly error?: string | undefined;
    readonly duration?: number | undefined;
    readonly parentId?: string | undefined;
  }>;
  readonly total: number;
  readonly hasMore: boolean;
}

/** admin.stats — aggregated server metrics. */
export interface AdminStatsResult {
  readonly uptime: number;
  readonly activeSessions: number;
  readonly totalSessionsCreated: number;
  readonly totalExecutions: number;
  readonly totalAuditEntries: number;
  readonly capabilityBreakdown: ReadonlyArray<{
    readonly capability: string;
    readonly count: number;
    readonly denied: number;
    readonly errors: number;
  }>;
  readonly recentErrors: ReadonlyArray<{
    readonly sessionId: string;
    readonly sessionName: string;
    readonly timestamp: string;
    readonly capability: string;
    readonly operation: string;
    readonly error: string;
  }>;
}

/** admin.session.detail — extended session information. */
export interface AdminSessionDetailParams {
  readonly sessionId: string;
}

export interface AdminSessionDetailResult {
  readonly sessionId: string;
  readonly name: string;
  readonly createdAt: string;
  readonly executions: number;
  readonly timeout: number;
  readonly capabilities: ReadonlyArray<{
    readonly kind: string;
    readonly constraint: string;
  }>;
  readonly auditSummary: {
    readonly totalEntries: number;
    readonly byCapability: Record<string, number>;
    readonly byResult: Record<string, number>;
  };
  readonly vfs: {
    readonly fileCount: number;
    readonly totalBytes: number;
  };
  readonly plugins: {
    readonly pending: ReadonlyArray<{
      readonly name: string;
      readonly valid: boolean;
      readonly status: string;
    }>;
    readonly loaded: ReadonlyArray<{
      readonly name: string;
      readonly exports: readonly string[];
      readonly loadedAt: string;
    }>;
  };
}

/** admin.agent.run — run an agent script via RPC. */
export interface AdminAgentRunParams {
  readonly name: string;
  readonly script: string;
  readonly capabilities: readonly Capability[];
  readonly timeout?: number;
}

export interface AdminAgentRunResult {
  readonly success: boolean;
  readonly exitCode: number;
  readonly output: unknown;
  readonly auditTrail: ReadonlyArray<{
    readonly timestamp: string;
    readonly capability: string;
    readonly operation: string;
    readonly result: string;
    readonly error?: string;
    readonly duration?: number;
  }>;
  readonly duration: number;
  readonly error?: string;
}

/** admin.config.save — persist an agent configuration. */
export interface AdminConfigSaveParams {
  readonly configId?: string;
  readonly config: {
    readonly name: string;
    readonly capabilities: readonly Capability[];
    readonly timeout?: number;
  };
}

export interface AdminConfigSaveResult {
  readonly configId: string;
  readonly name: string;
  readonly savedAt: string;
}

/** admin.config.get — retrieve a saved agent configuration. */
export interface AdminConfigGetParams {
  readonly configId: string;
}

export interface AdminConfigGetResult {
  readonly configId: string;
  readonly config: {
    readonly name: string;
    readonly capabilities: readonly Capability[];
    readonly timeout?: number;
  };
  readonly savedAt: string;
  readonly updatedAt: string;
}

/** admin.config.list — list all saved agent configurations. */
export interface AdminConfigListResult {
  readonly configs: ReadonlyArray<{
    readonly configId: string;
    readonly name: string;
    readonly capabilityCount: number;
    readonly savedAt: string;
    readonly updatedAt: string;
  }>;
}

/** admin.config.delete — remove a saved agent configuration. */
export interface AdminConfigDeleteParams {
  readonly configId: string;
}

export interface AdminConfigDeleteResult {
  readonly configId: string;
  readonly deleted: boolean;
}

/** admin.config.launch — create a session from a saved configuration. */
export interface AdminConfigLaunchParams {
  readonly configId: string;
  readonly files?: Record<string, string>;
}

export interface AdminConfigLaunchResult {
  readonly sessionId: string;
  readonly configId: string;
  readonly name: string;
  readonly capabilities: readonly Capability[];
}

/** admin.plugins.pending — list ALL pending plugins across all sessions. */
export interface AdminPluginsPendingResult {
  readonly plugins: ReadonlyArray<{
    readonly sessionId: string;
    readonly sessionName: string;
    readonly pluginName: string;
    readonly valid: boolean;
    readonly errors: readonly string[];
    readonly exports: readonly string[];
    readonly requestedAt: string;
    readonly status: string;
  }>;
}
