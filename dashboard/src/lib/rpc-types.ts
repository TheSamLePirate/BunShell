// Mirrored types from BunShell server protocol.
// Kept separate from server code since dashboard targets DOM, not Bun.

export type CapabilityKind =
  | "fs:read"
  | "fs:write"
  | "fs:delete"
  | "process:spawn"
  | "net:fetch"
  | "net:listen"
  | "net:connect"
  | "env:read"
  | "env:write"
  | "secret:read"
  | "secret:write"
  | "db:query"
  | "docker:run"
  | "os:interact"
  | `plugin:${string}`;

export const CAPABILITY_KINDS: CapabilityKind[] = [
  "fs:read",
  "fs:write",
  "fs:delete",
  "process:spawn",
  "net:fetch",
  "net:listen",
  "net:connect",
  "env:read",
  "env:write",
  "secret:read",
  "secret:write",
  "db:query",
  "docker:run",
  "os:interact",
];

export interface Capability {
  readonly kind: CapabilityKind;
  readonly pattern?: string;
  readonly allowedBinaries?: readonly string[];
  readonly allowedDomains?: readonly string[];
  readonly allowedPorts?: readonly number[];
  readonly port?: number;
  readonly allowedKeys?: readonly string[];
  readonly allowedHosts?: readonly string[];
  readonly allowedImages?: readonly string[];
  readonly pluginName?: string;
}

export interface AuditEntryDTO {
  readonly sessionId: string;
  readonly sessionName: string;
  readonly timestamp: string;
  readonly capability: string;
  readonly operation: string;
  readonly args: Record<string, unknown>;
  readonly result: "success" | "denied" | "error";
  readonly error?: string;
  readonly duration?: number;
  readonly parentId?: string;
}

export interface HealthInfo {
  name: string;
  version: string;
  protocol: string;
  sessions: number;
  uptime: number;
  totalExecutions: number;
  totalAuditEntries: number;
}

export interface SessionInfo {
  sessionId: string;
  name: string;
  fileCount: number;
  createdAt: string;
}

export interface SessionDetail {
  sessionId: string;
  name: string;
  createdAt: string;
  executions: number;
  timeout: number;
  capabilities: Array<{ kind: string; constraint: string }>;
  auditSummary: {
    totalEntries: number;
    byCapability: Record<string, number>;
    byResult: Record<string, number>;
  };
  vfs: { fileCount: number; totalBytes: number };
  plugins: {
    pending: Array<{ name: string; valid: boolean; status: string }>;
    loaded: Array<{ name: string; exports: string[]; loadedAt: string }>;
  };
}

export interface ExecResult {
  value: unknown;
  type: string;
  duration: number;
  auditEntries: number;
}

export interface AuditQueryResult {
  entries: AuditEntryDTO[];
  total: number;
  hasMore: boolean;
}

export interface StatsResult {
  uptime: number;
  activeSessions: number;
  totalSessionsCreated: number;
  totalExecutions: number;
  totalAuditEntries: number;
  capabilityBreakdown: Array<{
    capability: string;
    count: number;
    denied: number;
    errors: number;
  }>;
  recentErrors: Array<{
    sessionId: string;
    sessionName: string;
    timestamp: string;
    capability: string;
    operation: string;
    error: string;
  }>;
}

export interface SavedConfigSummary {
  configId: string;
  name: string;
  capabilityCount: number;
  savedAt: string;
  updatedAt: string;
}

export interface SavedConfigDetail {
  configId: string;
  config: {
    name: string;
    capabilities: Capability[];
    timeout?: number;
  };
  savedAt: string;
  updatedAt: string;
}

export interface VfsEntry {
  name: string;
  path: string;
  isFile: boolean;
  size: number;
}
