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
} from "./protocol";
export { RPC_ERRORS } from "./protocol";
