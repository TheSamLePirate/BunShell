/**
 * JSON-RPC request handler — routes methods to session manager.
 *
 * @module
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  SessionCreateParams,
  SessionExecuteParams,
  SessionDestroyParams,
  SessionAuditParams,
  SessionFsReadParams,
  SessionFsWriteParams,
  SessionFsListParams,
  SessionFsSnapshotParams,
  PluginApprovalRequestParams,
  PluginApproveParams,
  PluginRejectParams,
  PluginListParams,
} from "./protocol";
import { RPC_ERRORS } from "./protocol";
import type { SessionManager } from "./session";

/* eslint-disable @typescript-eslint/no-explicit-any */

function ok(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(
  id: string | number,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

/**
 * Handle a single JSON-RPC request.
 */
export async function handleRequest(
  req: JsonRpcRequest,
  mgr: SessionManager,
): Promise<JsonRpcResponse> {
  const { id, method, params } = req;
  const p = (params ?? {}) as Record<string, any>;

  try {
    switch (method) {
      // ---------------------------------------------------------------
      // Session lifecycle
      // ---------------------------------------------------------------
      case "session.create": {
        const opts = p as SessionCreateParams;
        if (!opts.name || !opts.capabilities) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "name and capabilities required",
          );
        }
        const createOpts: Record<string, unknown> = {
          name: opts.name,
          capabilities: opts.capabilities,
        };
        if (opts.files) createOpts["files"] = opts.files;
        if (opts.timeout) createOpts["timeout"] = opts.timeout;
        const session = mgr.create(
          createOpts as Parameters<typeof mgr.create>[0],
        );

        if (opts.mount) {
          await session.vfs.mountFromDisk(
            opts.mount.diskPath,
            opts.mount.vfsPath,
          );
        }

        return ok(id, {
          sessionId: session.id,
          name: session.name,
          capabilities: session.ctx.caps.capabilities,
          fileCount: session.vfs.fileCount,
        });
      }

      case "session.execute": {
        const opts = p as SessionExecuteParams;
        if (!opts.sessionId || !opts.code) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "sessionId and code required",
          );
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }

        try {
          const result = await mgr.execute(
            opts.sessionId,
            opts.code,
            opts.timeout,
          );
          return ok(id, {
            value: result.value,
            type: result.type,
            duration: result.duration,
            auditEntries: session.audit.entries.length,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("Capability denied")) {
            return err(id, RPC_ERRORS.CAPABILITY_DENIED, msg);
          }
          if (msg.includes("timed out")) {
            return err(id, RPC_ERRORS.TIMEOUT, msg);
          }
          return err(id, RPC_ERRORS.EXECUTION_ERROR, msg);
        }
      }

      case "session.destroy": {
        const opts = p as SessionDestroyParams;
        if (!opts.sessionId) {
          return err(id, RPC_ERRORS.INVALID_PARAMS, "sessionId required");
        }
        const session = mgr.destroy(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        return ok(id, {
          sessionId: session.id,
          totalExecutions: session.executions,
          totalAuditEntries: session.audit.entries.length,
        });
      }

      case "session.list": {
        const sessions = mgr.list().map((s) => ({
          sessionId: s.id,
          name: s.name,
          fileCount: s.vfs.fileCount,
          createdAt: s.createdAt.toISOString(),
        }));
        return ok(id, { sessions });
      }

      // ---------------------------------------------------------------
      // Audit
      // ---------------------------------------------------------------
      case "session.audit": {
        const opts = p as SessionAuditParams;
        if (!opts.sessionId) {
          return err(id, RPC_ERRORS.INVALID_PARAMS, "sessionId required");
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }

        let entries = session.audit.entries.slice();
        if (opts.capability) {
          entries = entries.filter((e) => e.capability === opts.capability);
        }
        if (opts.limit) {
          entries = entries.slice(-opts.limit);
        }

        return ok(id, {
          entries: entries.map((e) => ({
            timestamp: e.timestamp.toISOString(),
            capability: e.capability,
            operation: e.operation,
            result: e.result,
          })),
        });
      }

      // ---------------------------------------------------------------
      // VFS operations
      // ---------------------------------------------------------------
      case "session.fs.read": {
        const opts = p as SessionFsReadParams;
        if (!opts.sessionId || !opts.path) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "sessionId and path required",
          );
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        const content = session.vfs.readFile(opts.path);
        return ok(id, { path: opts.path, content, size: content.length });
      }

      case "session.fs.write": {
        const opts = p as SessionFsWriteParams;
        if (!opts.sessionId || !opts.path || opts.content === undefined) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "sessionId, path, and content required",
          );
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        session.vfs.writeFile(opts.path, opts.content);
        return ok(id, { path: opts.path, size: opts.content.length });
      }

      case "session.fs.list": {
        const opts = p as SessionFsListParams;
        if (!opts.sessionId || !opts.path) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "sessionId and path required",
          );
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        const entries = session.vfs.readdir(opts.path).map((e) => ({
          name: e.name,
          path: e.path,
          isFile: e.isFile,
          size: e.size,
        }));
        return ok(id, { entries });
      }

      case "session.fs.snapshot": {
        const opts = p as SessionFsSnapshotParams;
        if (!opts.sessionId) {
          return err(id, RPC_ERRORS.INVALID_PARAMS, "sessionId required");
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        return ok(id, {
          snapshot: session.vfs.snapshot(),
          fileCount: session.vfs.fileCount,
          totalBytes: session.vfs.totalBytes,
        });
      }

      // ---------------------------------------------------------------
      // Plugin system
      // ---------------------------------------------------------------
      case "workspace.requestPluginApproval": {
        const opts = p as PluginApprovalRequestParams;
        if (!opts.sessionId || !opts.pluginName || !opts.source) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "sessionId, pluginName, and source required",
          );
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        const pending = session.plugins.request(
          opts.pluginName,
          opts.source,
          session.name,
        );
        return ok(id, {
          pluginName: pending.name,
          valid: pending.validation.valid,
          errors: pending.validation.errors,
          exports: pending.validation.exports,
          status: pending.status,
        });
      }

      case "workspace.approvePlugin": {
        const opts = p as PluginApproveParams;
        if (!opts.sessionId || !opts.pluginName) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "sessionId and pluginName required",
          );
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        const loaded = await session.plugins.approve(
          opts.pluginName,
          session.ctx,
        );
        return ok(id, {
          pluginName: loaded.name,
          exports: loaded.exportNames,
          status: "approved",
        });
      }

      case "workspace.rejectPlugin": {
        const opts = p as PluginRejectParams;
        if (!opts.sessionId || !opts.pluginName) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "sessionId and pluginName required",
          );
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        session.plugins.reject(opts.pluginName);
        return ok(id, { pluginName: opts.pluginName, status: "rejected" });
      }

      case "workspace.listPlugins": {
        const opts = p as PluginListParams;
        if (!opts.sessionId) {
          return err(id, RPC_ERRORS.INVALID_PARAMS, "sessionId required");
        }
        const session = mgr.get(opts.sessionId);
        if (!session) {
          return err(
            id,
            RPC_ERRORS.SESSION_NOT_FOUND,
            `Session not found: ${opts.sessionId}`,
          );
        }
        return ok(id, {
          pending: session.plugins.listPending().map((p) => ({
            name: p.name,
            valid: p.validation.valid,
            status: p.status,
          })),
          loaded: session.plugins.list().map((p) => ({
            name: p.name,
            exports: p.exportNames,
            loadedAt: p.loadedAt.toISOString(),
          })),
        });
      }

      default:
        return err(
          id,
          RPC_ERRORS.METHOD_NOT_FOUND,
          `Unknown method: ${method}`,
        );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(id, RPC_ERRORS.INTERNAL_ERROR, msg);
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
