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
  AdminAuditQueryParams,
  AdminSessionDetailParams,
  AdminAgentRunParams,
  AdminConfigSaveParams,
  AdminConfigGetParams,
  AdminConfigDeleteParams,
  AdminConfigLaunchParams,
} from "./protocol";
import { RPC_ERRORS } from "./protocol";
import type { Capability } from "../capabilities/types";
import type { SessionManager } from "./session";
import type { ConfigStore } from "./config-store";

/** Context passed to the request handler. */
export interface ServerContext {
  readonly mgr: SessionManager;
  readonly configStore: ConfigStore;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function ok(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

/** Stringify a capability's constraint for display. */
function capConstraint(cap: Record<string, any>): string {
  if (cap.pattern) return cap.pattern;
  if (cap.allowedBinaries) return (cap.allowedBinaries as string[]).join(", ");
  if (cap.allowedDomains) return (cap.allowedDomains as string[]).join(", ");
  if (cap.allowedKeys) return (cap.allowedKeys as string[]).join(", ");
  if (cap.allowedImages) return (cap.allowedImages as string[]).join(", ");
  if (cap.allowedHosts) return (cap.allowedHosts as string[]).join(", ");
  if (cap.port !== undefined) return String(cap.port);
  if (cap.pluginName) return cap.pluginName;
  return "*";
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
 *
 * Accepts either a bare SessionManager (backward compat) or a full ServerContext.
 */
export async function handleRequest(
  req: JsonRpcRequest,
  mgrOrCtx: SessionManager | ServerContext,
): Promise<JsonRpcResponse> {
  const ctx: ServerContext =
    "mgr" in mgrOrCtx
      ? mgrOrCtx
      : { mgr: mgrOrCtx, configStore: undefined as unknown as ConfigStore };
  const mgr = ctx.mgr;
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

      // ---------------------------------------------------------------
      // Admin API
      // ---------------------------------------------------------------
      case "admin.audit.query": {
        const opts = p as AdminAuditQueryParams;
        return ok(id, mgr.queryAudit(opts));
      }

      case "admin.stats": {
        return ok(id, mgr.stats());
      }

      case "admin.session.detail": {
        const opts = p as AdminSessionDetailParams;
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

        const entries = session.audit.entries;
        const byCapability: Record<string, number> = {};
        const byResult: Record<string, number> = {};
        for (const e of entries) {
          byCapability[e.capability] = (byCapability[e.capability] ?? 0) + 1;
          byResult[e.result] = (byResult[e.result] ?? 0) + 1;
        }

        return ok(id, {
          sessionId: session.id,
          name: session.name,
          createdAt: session.createdAt.toISOString(),
          executions: session.executions,
          timeout: session.timeout,
          capabilities: session.ctx.caps.capabilities.map((c) => ({
            kind: c.kind,
            constraint: capConstraint(c),
          })),
          auditSummary: {
            totalEntries: entries.length,
            byCapability,
            byResult,
          },
          vfs: {
            fileCount: session.vfs.fileCount,
            totalBytes: session.vfs.totalBytes,
          },
          plugins: {
            pending: session.plugins.listPending().map((pl) => ({
              name: pl.name,
              valid: pl.validation.valid,
              status: pl.status,
            })),
            loaded: session.plugins.list().map((pl) => ({
              name: pl.name,
              exports: pl.exportNames,
              loadedAt: pl.loadedAt.toISOString(),
            })),
          },
        });
      }

      case "admin.agent.run": {
        const opts = p as AdminAgentRunParams;
        if (!opts.name || !opts.script || !opts.capabilities) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "name, script, and capabilities required",
          );
        }
        const { runAgent } = await import("../agent/sandbox");
        const {
          mkdtemp,
          writeFile,
          rm: rmFile,
        } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { tmpdir } = await import("node:os");

        const tmpDir = await mkdtemp(join(tmpdir(), "bunshell-agent-"));
        const scriptPath = join(tmpDir, "agent.ts");
        await writeFile(scriptPath, opts.script);

        try {
          const result = await runAgent({
            name: opts.name,
            script: scriptPath,
            capabilities: opts.capabilities.slice(),
            timeout: opts.timeout,
          });
          return ok(id, {
            success: result.success,
            exitCode: result.exitCode,
            output: result.output,
            auditTrail: result.auditTrail.map((e) => ({
              timestamp:
                e.timestamp instanceof Date
                  ? e.timestamp.toISOString()
                  : String(e.timestamp),
              capability: e.capability,
              operation: e.operation,
              result: e.result,
              error: e.error,
              duration: e.duration,
            })),
            duration: result.duration,
            error: result.error,
          });
        } finally {
          await rmFile(tmpDir, { recursive: true }).catch(() => {});
        }
      }

      case "admin.config.save": {
        const opts = p as AdminConfigSaveParams;
        if (!opts.config?.name || !opts.config?.capabilities) {
          return err(
            id,
            RPC_ERRORS.INVALID_PARAMS,
            "config.name and config.capabilities required",
          );
        }
        const saved = await ctx.configStore.save(opts.config, opts.configId);
        return ok(id, {
          configId: saved.configId,
          name: saved.config.name,
          savedAt: saved.savedAt,
        });
      }

      case "admin.config.get": {
        const opts = p as AdminConfigGetParams;
        if (!opts.configId) {
          return err(id, RPC_ERRORS.INVALID_PARAMS, "configId required");
        }
        const config = await ctx.configStore.get(opts.configId);
        if (!config) {
          return err(
            id,
            RPC_ERRORS.CONFIG_NOT_FOUND,
            `Config not found: ${opts.configId}`,
          );
        }
        return ok(id, config);
      }

      case "admin.config.list": {
        const configs = await ctx.configStore.list();
        return ok(id, {
          configs: configs.map((c) => ({
            configId: c.configId,
            name: c.config.name,
            capabilityCount: c.config.capabilities.length,
            savedAt: c.savedAt,
            updatedAt: c.updatedAt,
          })),
        });
      }

      case "admin.config.delete": {
        const opts = p as AdminConfigDeleteParams;
        if (!opts.configId) {
          return err(id, RPC_ERRORS.INVALID_PARAMS, "configId required");
        }
        const deleted = await ctx.configStore.delete(opts.configId);
        return ok(id, { configId: opts.configId, deleted });
      }

      case "admin.config.launch": {
        const opts = p as AdminConfigLaunchParams;
        if (!opts.configId) {
          return err(id, RPC_ERRORS.INVALID_PARAMS, "configId required");
        }
        const config = await ctx.configStore.get(opts.configId);
        if (!config) {
          return err(
            id,
            RPC_ERRORS.CONFIG_NOT_FOUND,
            `Config not found: ${opts.configId}`,
          );
        }
        const createOpts: {
          name: string;
          capabilities: readonly Capability[];
          files?: Record<string, string>;
          timeout?: number;
        } = {
          name: config.config.name,
          capabilities: config.config.capabilities,
        };
        if (opts.files) createOpts.files = opts.files;
        if (config.config.timeout) createOpts.timeout = config.config.timeout;
        const session = mgr.create(createOpts);
        return ok(id, {
          sessionId: session.id,
          configId: opts.configId,
          name: session.name,
          capabilities: session.ctx.caps.capabilities,
        });
      }

      case "admin.plugins.pending": {
        const allSessions = mgr.list();
        const plugins: Array<Record<string, unknown>> = [];
        for (const s of allSessions) {
          for (const pl of s.plugins.listPending()) {
            plugins.push({
              sessionId: s.id,
              sessionName: s.name,
              pluginName: pl.name,
              valid: pl.validation.valid,
              errors: pl.validation.errors,
              exports: pl.validation.exports,
              requestedAt: pl.requestedAt.toISOString(),
              status: pl.status,
            });
          }
        }
        return ok(id, { plugins });
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
