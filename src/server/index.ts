/**
 * BunShell Server — execution backend for any agent harness.
 *
 * @module
 */

export { startServer } from "./serve";
export type { ServerOptions, BunShellServer } from "./serve";
export { createSessionManager } from "./session";
export type { SessionManager, Session, ExecResult } from "./session";
export { handleRequest } from "./handler";
export type { ServerContext } from "./handler";
export { createConfigStore } from "./config-store";
export type { ConfigStore, SavedConfig, AgentConfigData } from "./config-store";
export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcError,
  SessionCreateParams,
  SessionCreateResult,
  SessionExecuteParams,
  SessionExecuteResult,
  SessionDestroyParams,
  SessionDestroyResult,
  SessionListResult,
  SessionAuditParams,
  SessionAuditResult,
  SessionFsReadParams,
  SessionFsReadResult,
  SessionFsWriteParams,
  SessionFsWriteResult,
  SessionFsListParams,
  SessionFsListResult,
  SessionFsSnapshotParams,
  SessionFsSnapshotResult,
  AdminAuditQueryParams,
  AdminAuditQueryResult,
  AdminStatsResult,
  AdminSessionDetailParams,
  AdminSessionDetailResult,
  AdminAgentRunParams,
  AdminAgentRunResult,
  AdminConfigSaveParams,
  AdminConfigSaveResult,
  AdminConfigGetParams,
  AdminConfigGetResult,
  AdminConfigListResult,
  AdminConfigDeleteParams,
  AdminConfigDeleteResult,
  AdminConfigLaunchParams,
  AdminConfigLaunchResult,
  AdminPluginsPendingResult,
} from "./protocol";
export { RPC_ERRORS } from "./protocol";
