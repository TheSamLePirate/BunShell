export const queryKeys = {
  health: ["health"] as const,
  sessions: {
    all: ["sessions"] as const,
    detail: (id: string) => ["sessions", id] as const,
    audit: (id: string) => ["sessions", id, "audit"] as const,
    vfs: (id: string, path: string) => ["sessions", id, "vfs", path] as const,
  },
  audit: {
    global: (filters?: Record<string, unknown>) =>
      ["audit", "global", filters] as const,
  },
  stats: ["stats"] as const,
  configs: {
    all: ["configs"] as const,
    detail: (id: string) => ["configs", id] as const,
  },
  plugins: {
    pending: ["plugins", "pending"] as const,
    list: (sessionId: string) => ["plugins", sessionId] as const,
  },
};
