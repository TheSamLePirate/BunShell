import type {
  HealthInfo,
  SessionInfo,
  SessionDetail,
  ExecResult,
  AuditQueryResult,
  StatsResult,
  AuditEntryDTO,
  Capability,
  SavedConfigSummary,
  SavedConfigDetail,
  VfsEntry,
} from "./rpc-types";

const BASE_URL = import.meta.env.VITE_BUNSHELL_URL ?? "/api";
const DIRECT_URL = import.meta.env.VITE_BUNSHELL_URL ?? "http://127.0.0.1:7483";

let idCounter = 0;

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

async function rpcCall<T>(
  method: string,
  params?: Record<string, unknown>,
  timeout = 30000,
): Promise<T> {
  const id = ++idCounter;
  const resp = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(timeout),
  });
  const json = (await resp.json()) as {
    result?: T;
    error?: { code: number; message: string; data?: unknown };
  };
  if (json.error) {
    throw new RpcError(json.error.code, json.error.message, json.error.data);
  }
  return json.result as T;
}

export const api = {
  // Health check (GET, not RPC)
  health: async (): Promise<HealthInfo> => {
    const resp = await fetch(DIRECT_URL, {
      signal: AbortSignal.timeout(5000),
    });
    return resp.json() as Promise<HealthInfo>;
  },

  // Sessions
  sessions: {
    create: (params: {
      name: string;
      capabilities: Capability[];
      files?: Record<string, string>;
      timeout?: number;
    }) =>
      rpcCall<{
        sessionId: string;
        name: string;
        capabilities: Capability[];
        fileCount: number;
      }>("session.create", params as unknown as Record<string, unknown>),

    execute: (sessionId: string, code: string, timeout?: number) =>
      rpcCall<ExecResult>("session.execute", { sessionId, code, timeout }),

    destroy: (sessionId: string) =>
      rpcCall<{
        sessionId: string;
        totalExecutions: number;
        totalAuditEntries: number;
      }>("session.destroy", { sessionId }),

    list: () => rpcCall<{ sessions: SessionInfo[] }>("session.list"),

    audit: (sessionId: string, limit?: number, capability?: string) =>
      rpcCall<{ entries: AuditEntryDTO[] }>("session.audit", {
        sessionId,
        limit,
        capability,
      }),

    fs: {
      read: (sessionId: string, path: string) =>
        rpcCall<{ path: string; content: string; size: number }>(
          "session.fs.read",
          { sessionId, path },
        ),

      write: (sessionId: string, path: string, content: string) =>
        rpcCall<{ path: string; size: number }>("session.fs.write", {
          sessionId,
          path,
          content,
        }),

      list: (sessionId: string, path: string) =>
        rpcCall<{ entries: VfsEntry[] }>("session.fs.list", {
          sessionId,
          path,
        }),

      snapshot: (sessionId: string) =>
        rpcCall<{ snapshot: unknown; fileCount: number; totalBytes: number }>(
          "session.fs.snapshot",
          { sessionId },
        ),
    },
  },

  // Plugins
  plugins: {
    request: (sessionId: string, pluginName: string, source: string) =>
      rpcCall<{
        pluginName: string;
        valid: boolean;
        errors: string[];
        exports: string[];
        status: string;
      }>("workspace.requestPluginApproval", { sessionId, pluginName, source }),

    approve: (sessionId: string, pluginName: string) =>
      rpcCall<{ pluginName: string; exports: string[]; status: string }>(
        "workspace.approvePlugin",
        { sessionId, pluginName },
      ),

    reject: (sessionId: string, pluginName: string) =>
      rpcCall<void>("workspace.rejectPlugin", { sessionId, pluginName }),

    list: (sessionId: string) =>
      rpcCall<{
        pending: Array<{ name: string; valid: boolean; status: string }>;
        loaded: Array<{ name: string; exports: string[]; loadedAt: string }>;
      }>("workspace.listPlugins", { sessionId }),
  },

  // Admin
  admin: {
    auditQuery: (params?: {
      sessionId?: string;
      capability?: string;
      operation?: string;
      result?: string;
      since?: string;
      until?: string;
      limit?: number;
      offset?: number;
    }) => rpcCall<AuditQueryResult>("admin.audit.query", params),

    stats: () => rpcCall<StatsResult>("admin.stats"),

    sessionDetail: (sessionId: string) =>
      rpcCall<SessionDetail>("admin.session.detail", { sessionId }),

    agentRun: (params: {
      name: string;
      script: string;
      capabilities: Capability[];
      timeout?: number;
    }) =>
      rpcCall<{
        success: boolean;
        exitCode: number;
        output: unknown;
        auditTrail: AuditEntryDTO[];
        duration: number;
        error?: string;
      }>(
        "admin.agent.run",
        params as unknown as Record<string, unknown>,
        120000,
      ),

    configSave: (
      config: { name: string; capabilities: Capability[]; timeout?: number },
      configId?: string,
    ) =>
      rpcCall<{ configId: string; name: string; savedAt: string }>(
        "admin.config.save",
        { config, configId } as unknown as Record<string, unknown>,
      ),

    configGet: (configId: string) =>
      rpcCall<SavedConfigDetail>("admin.config.get", { configId }),

    configList: () =>
      rpcCall<{ configs: SavedConfigSummary[] }>("admin.config.list"),

    configDelete: (configId: string) =>
      rpcCall<{ configId: string; deleted: boolean }>("admin.config.delete", {
        configId,
      }),

    configLaunch: (configId: string, files?: Record<string, string>) =>
      rpcCall<{
        sessionId: string;
        configId: string;
        name: string;
        capabilities: Capability[];
      }>("admin.config.launch", { configId, files }),

    pluginsPending: () =>
      rpcCall<{
        plugins: Array<{
          sessionId: string;
          sessionName: string;
          pluginName: string;
          valid: boolean;
          errors: string[];
          exports: string[];
          requestedAt: string;
          status: string;
        }>;
      }>("admin.plugins.pending"),
  },
};
