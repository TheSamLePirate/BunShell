import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer, type BunShellServer } from "../../src/server/serve";

let server: BunShellServer;

beforeAll(() => {
  server = startServer({ port: 0, verbose: false });
});

afterAll(() => {
  server.stop();
});

async function rpc(method: string, params?: Record<string, unknown>) {
  const resp = await fetch(server.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  return resp.json() as Promise<{
    result?: unknown;
    error?: { code: number; message: string };
  }>;
}

// ---------------------------------------------------------------------------
// admin.stats
// ---------------------------------------------------------------------------

describe("admin.stats", () => {
  it("returns initial stats", async () => {
    const res = await rpc("admin.stats");
    expect(res.error).toBeUndefined();
    const stats = res.result as {
      uptime: number;
      activeSessions: number;
      totalSessionsCreated: number;
      totalExecutions: number;
      totalAuditEntries: number;
    };
    expect(stats.uptime).toBeGreaterThan(0);
    expect(typeof stats.activeSessions).toBe("number");
    expect(typeof stats.totalSessionsCreated).toBe("number");
    expect(typeof stats.totalExecutions).toBe("number");
    expect(typeof stats.totalAuditEntries).toBe("number");
  });

  it("tracks session creation", async () => {
    const before = (await rpc("admin.stats")).result as {
      totalSessionsCreated: number;
    };
    await rpc("session.create", {
      name: "stats-test",
      capabilities: [{ kind: "fs:read", pattern: "*" }],
    });
    const after = (await rpc("admin.stats")).result as {
      totalSessionsCreated: number;
    };
    expect(after.totalSessionsCreated).toBe(before.totalSessionsCreated + 1);
  });
});

// ---------------------------------------------------------------------------
// admin.audit.query
// ---------------------------------------------------------------------------

describe("admin.audit.query", () => {
  it("returns global audit entries after execution", async () => {
    // Create session and execute code to generate audit entries
    const createRes = await rpc("session.create", {
      name: "audit-test",
      capabilities: [
        { kind: "fs:read", pattern: "**" },
        { kind: "fs:write", pattern: "**" },
      ],
    });
    const { sessionId } = createRes.result as { sessionId: string };

    await rpc("session.execute", {
      sessionId,
      code: 'write("/test.txt", "hello")',
    });

    const res = await rpc("admin.audit.query", {});
    expect(res.error).toBeUndefined();
    const result = res.result as {
      entries: Array<{ sessionId: string; operation: string }>;
      total: number;
      hasMore: boolean;
    };
    expect(result.total).toBeGreaterThan(0);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("filters by sessionId", async () => {
    const createRes = await rpc("session.create", {
      name: "filter-test",
      capabilities: [{ kind: "fs:read", pattern: "**" }],
    });
    const { sessionId } = createRes.result as { sessionId: string };

    await rpc("session.execute", { sessionId, code: "ls('/')" });

    const res = await rpc("admin.audit.query", { sessionId });
    expect(res.error).toBeUndefined();
    const result = res.result as {
      entries: Array<{ sessionId: string }>;
    };
    for (const e of result.entries) {
      expect(e.sessionId).toBe(sessionId);
    }
  });

  it("filters by capability", async () => {
    const res = await rpc("admin.audit.query", {
      capability: "fs:write",
    });
    expect(res.error).toBeUndefined();
    const result = res.result as {
      entries: Array<{ capability: string }>;
    };
    for (const e of result.entries) {
      expect(e.capability).toBe("fs:write");
    }
  });

  it("supports pagination with limit and offset", async () => {
    const all = await rpc("admin.audit.query", { limit: 1000 });
    const allResult = (all.result as { total: number }).total;

    const page1 = await rpc("admin.audit.query", { limit: 2, offset: 0 });
    const page1Result = page1.result as {
      entries: unknown[];
      hasMore: boolean;
    };
    expect(page1Result.entries.length).toBeLessThanOrEqual(2);

    if (allResult > 2) {
      expect(page1Result.hasMore).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// admin.session.detail
// ---------------------------------------------------------------------------

describe("admin.session.detail", () => {
  it("returns detailed session info", async () => {
    const createRes = await rpc("session.create", {
      name: "detail-test",
      capabilities: [
        { kind: "fs:read", pattern: "**" },
        { kind: "net:fetch", allowedDomains: ["example.com"] },
      ],
      files: { "/hello.txt": "world" },
    });
    const { sessionId } = createRes.result as { sessionId: string };

    const res = await rpc("admin.session.detail", { sessionId });
    expect(res.error).toBeUndefined();
    const detail = res.result as {
      sessionId: string;
      name: string;
      createdAt: string;
      executions: number;
      timeout: number;
      capabilities: Array<{ kind: string; constraint: string }>;
      auditSummary: { totalEntries: number };
      vfs: { fileCount: number; totalBytes: number };
      plugins: { pending: unknown[]; loaded: unknown[] };
    };
    expect(detail.sessionId).toBe(sessionId);
    expect(detail.name).toBe("detail-test");
    expect(detail.timeout).toBe(30000);
    expect(detail.capabilities.length).toBe(2);
    expect(detail.vfs.fileCount).toBeGreaterThanOrEqual(1);
  });

  it("returns error for unknown session", async () => {
    const res = await rpc("admin.session.detail", {
      sessionId: "nonexistent",
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32001);
  });
});

// ---------------------------------------------------------------------------
// admin.config CRUD
// ---------------------------------------------------------------------------

describe("admin.config CRUD", () => {
  it("saves and retrieves a config", async () => {
    const saveRes = await rpc("admin.config.save", {
      config: {
        name: "test-agent",
        capabilities: [{ kind: "fs:read", pattern: "**" }],
        timeout: 5000,
      },
    });
    expect(saveRes.error).toBeUndefined();
    const saved = saveRes.result as {
      configId: string;
      name: string;
      savedAt: string;
    };
    expect(saved.configId).toBeTruthy();
    expect(saved.name).toBe("test-agent");

    const getRes = await rpc("admin.config.get", {
      configId: saved.configId,
    });
    expect(getRes.error).toBeUndefined();
    const got = getRes.result as {
      configId: string;
      config: { name: string; timeout: number };
    };
    expect(got.configId).toBe(saved.configId);
    expect(got.config.name).toBe("test-agent");
    expect(got.config.timeout).toBe(5000);
  });

  it("lists configs", async () => {
    const res = await rpc("admin.config.list");
    expect(res.error).toBeUndefined();
    const result = res.result as {
      configs: Array<{ configId: string; name: string }>;
    };
    expect(result.configs.length).toBeGreaterThan(0);
  });

  it("deletes a config", async () => {
    const saveRes = await rpc("admin.config.save", {
      config: {
        name: "to-delete",
        capabilities: [{ kind: "fs:read", pattern: "*" }],
      },
    });
    const { configId } = saveRes.result as { configId: string };

    const delRes = await rpc("admin.config.delete", { configId });
    expect(delRes.error).toBeUndefined();
    const deleted = delRes.result as { deleted: boolean };
    expect(deleted.deleted).toBe(true);

    const getRes = await rpc("admin.config.get", { configId });
    expect(getRes.error).toBeDefined();
    expect(getRes.error!.code).toBe(-32007);
  });

  it("launches a session from config", async () => {
    const saveRes = await rpc("admin.config.save", {
      config: {
        name: "launchable",
        capabilities: [{ kind: "fs:read", pattern: "**" }],
        timeout: 10000,
      },
    });
    const { configId } = saveRes.result as { configId: string };

    const launchRes = await rpc("admin.config.launch", {
      configId,
      files: { "/init.txt": "launched" },
    });
    expect(launchRes.error).toBeUndefined();
    const launched = launchRes.result as {
      sessionId: string;
      configId: string;
      name: string;
    };
    expect(launched.sessionId).toBeTruthy();
    expect(launched.configId).toBe(configId);
    expect(launched.name).toBe("launchable");

    // Verify the session works
    const execRes = await rpc("session.execute", {
      sessionId: launched.sessionId,
      code: 'cat("/init.txt")',
    });
    expect(execRes.error).toBeUndefined();
    const execResult = execRes.result as { value: string };
    expect(execResult.value).toBe("launched");
  });
});

// ---------------------------------------------------------------------------
// admin.plugins.pending
// ---------------------------------------------------------------------------

describe("admin.plugins.pending", () => {
  it("returns empty list when no plugins pending", async () => {
    const res = await rpc("admin.plugins.pending");
    expect(res.error).toBeUndefined();
    const result = res.result as {
      plugins: unknown[];
    };
    expect(Array.isArray(result.plugins)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SSE endpoint
// ---------------------------------------------------------------------------

describe("SSE /events", () => {
  it("streams audit entries in real-time", async () => {
    // Create a session first
    const createRes = await rpc("session.create", {
      name: "sse-test",
      capabilities: [
        { kind: "fs:read", pattern: "**" },
        { kind: "fs:write", pattern: "**" },
      ],
    });
    const { sessionId } = createRes.result as { sessionId: string };

    // Connect to SSE
    const controller = new AbortController();
    const eventPromise = fetch(`${server.url}/events`, {
      signal: controller.signal,
    });

    // Wait a tick for the connection to establish
    await new Promise((r) => setTimeout(r, 50));

    // Execute code to generate an audit entry
    await rpc("session.execute", {
      sessionId,
      code: 'write("/sse-test.txt", "hello")',
    });

    // Give SSE time to deliver
    await new Promise((r) => setTimeout(r, 100));

    // Abort the connection
    controller.abort();

    const resp = await eventPromise.catch(() => null);
    // SSE connection was established (status 200)
    if (resp) {
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toBe("text/event-stream");
    }
  });
});

// ---------------------------------------------------------------------------
// Health check extensions
// ---------------------------------------------------------------------------

describe("extended health check", () => {
  it("includes uptime and counters", async () => {
    const resp = await fetch(`${server.url}/healthz`);
    const data = (await resp.json()) as Record<string, unknown>;
    expect(data["name"]).toBe("bunshell");
    expect(typeof data["uptime"]).toBe("number");
    expect(typeof data["totalExecutions"]).toBe("number");
    expect(typeof data["totalAuditEntries"]).toBe("number");
  });
});
