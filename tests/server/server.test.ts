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
// Health check
// ---------------------------------------------------------------------------

describe("health check", () => {
  it("GET /healthz returns server info", async () => {
    const resp = await fetch(`${server.url}/healthz`);
    const data = (await resp.json()) as Record<string, unknown>;
    expect(data["name"]).toBe("bunshell");
    expect(data["protocol"]).toBe("json-rpc-2.0");
  });
});

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

describe("session lifecycle", () => {
  it("creates a session", async () => {
    const res = await rpc("session.create", {
      name: "test-agent",
      capabilities: [{ kind: "fs:read", pattern: "*" }],
    });
    expect(res.error).toBeUndefined();
    const result = res.result as { sessionId: string; name: string };
    expect(result.sessionId).toBeTruthy();
    expect(result.name).toBe("test-agent");
  });

  it("lists sessions", async () => {
    const res = await rpc("session.list");
    expect(res.error).toBeUndefined();
    const result = res.result as { sessions: unknown[] };
    expect(result.sessions.length).toBeGreaterThan(0);
  });

  it("destroys a session", async () => {
    const create = await rpc("session.create", {
      name: "to-destroy",
      capabilities: [],
    });
    const { sessionId } = create.result as { sessionId: string };

    const destroy = await rpc("session.destroy", { sessionId });
    expect(destroy.error).toBeUndefined();
    const result = destroy.result as { sessionId: string };
    expect(result.sessionId).toBe(sessionId);
  });

  it("returns error for unknown session", async () => {
    const res = await rpc("session.execute", {
      sessionId: "nonexistent",
      code: "1 + 1",
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32001);
  });
});

// ---------------------------------------------------------------------------
// Code execution with VFS
// ---------------------------------------------------------------------------

describe("code execution", () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await rpc("session.create", {
      name: "exec-test",
      capabilities: [
        { kind: "fs:read", pattern: "*" },
        { kind: "fs:write", pattern: "*" },
        { kind: "fs:delete", pattern: "*" },
      ],
      files: {
        "/app/index.ts": "export const hello = 'world';",
        "/app/config.json": '{"port": 3000}',
      },
    });
    sessionId = (res.result as { sessionId: string }).sessionId;
  });

  it("evaluates simple expressions", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: "1 + 2",
    });
    expect(res.error).toBeUndefined();
    const result = res.result as { value: number; type: string };
    expect(result.value).toBe(3);
    expect(result.type).toBe("number");
  });

  it("reads files from VFS via cat()", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'cat("/app/index.ts")',
    });
    expect(res.error).toBeUndefined();
    const result = res.result as { value: string };
    expect(result.value).toBe("export const hello = 'world';");
  });

  it("lists files from VFS via ls()", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'ls("/app")',
    });
    expect(res.error).toBeUndefined();
    const result = res.result as { value: Array<{ name: string }> };
    expect(result.value.length).toBe(2);
    const names = result.value.map((e) => e.name).sort();
    expect(names).toEqual(["config.json", "index.ts"]);
  });

  it("writes files to VFS via write()", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'write("/app/new.txt", "created")',
    });
    expect(res.error).toBeUndefined();

    // Verify it was written
    const read = await rpc("session.execute", {
      sessionId,
      code: 'cat("/app/new.txt")',
    });
    expect((read.result as { value: string }).value).toBe("created");
  });

  it("uses crypto (pure, no capability needed)", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'hash("hello", "sha256").hex',
    });
    expect(res.error).toBeUndefined();
    const result = res.result as { value: string };
    expect(result.value).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("uses pipe operators", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: "[3, 1, 4, 1, 5].filter(n => n > 2)",
    });
    expect(res.error).toBeUndefined();
    const result = res.result as { value: number[] };
    expect(result.value).toEqual([3, 4, 5]);
  });

  it("uses parseJSON/formatJSON", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'readJson("/app/config.json")',
    });
    expect(res.error).toBeUndefined();
    const result = res.result as { value: { port: number } };
    expect(result.value.port).toBe(3000);
  });

  it("tracks duration", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: "1 + 1",
    });
    const result = res.result as { duration: number };
    expect(result.duration).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Capability enforcement
// ---------------------------------------------------------------------------

describe("capability enforcement", () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await rpc("session.create", {
      name: "restricted",
      capabilities: [{ kind: "fs:read", pattern: "/allowed/**" }],
      files: {
        "/allowed/ok.txt": "visible",
        "/secret/hidden.txt": "invisible",
      },
    });
    sessionId = (res.result as { sessionId: string }).sessionId;
  });

  it("allows reading within capability", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'cat("/allowed/ok.txt")',
    });
    expect(res.error).toBeUndefined();
    expect((res.result as { value: string }).value).toBe("visible");
  });

  it("denies reading outside capability", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'cat("/secret/hidden.txt")',
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32002);
    expect(res.error!.message).toContain("Capability denied");
  });

  it("denies writing without fs:write capability", async () => {
    const res = await rpc("session.execute", {
      sessionId,
      code: 'write("/allowed/new.txt", "hack")',
    });
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32002);
  });
});

// ---------------------------------------------------------------------------
// VFS direct access (via protocol, not code execution)
// ---------------------------------------------------------------------------

describe("VFS protocol operations", () => {
  let sessionId: string;

  beforeAll(async () => {
    const res = await rpc("session.create", {
      name: "vfs-test",
      capabilities: [],
      files: { "/data.txt": "hello" },
    });
    sessionId = (res.result as { sessionId: string }).sessionId;
  });

  it("session.fs.read reads a VFS file", async () => {
    const res = await rpc("session.fs.read", { sessionId, path: "/data.txt" });
    expect(res.error).toBeUndefined();
    expect((res.result as { content: string }).content).toBe("hello");
  });

  it("session.fs.write writes a VFS file", async () => {
    const res = await rpc("session.fs.write", {
      sessionId,
      path: "/new.txt",
      content: "written via protocol",
    });
    expect(res.error).toBeUndefined();

    const read = await rpc("session.fs.read", { sessionId, path: "/new.txt" });
    expect((read.result as { content: string }).content).toBe(
      "written via protocol",
    );
  });

  it("session.fs.list lists VFS directory", async () => {
    const res = await rpc("session.fs.list", { sessionId, path: "/" });
    expect(res.error).toBeUndefined();
    const entries = (res.result as { entries: Array<{ name: string }> })
      .entries;
    expect(entries.some((e) => e.name === "data.txt")).toBe(true);
  });

  it("session.fs.snapshot exports full VFS", async () => {
    const res = await rpc("session.fs.snapshot", { sessionId });
    expect(res.error).toBeUndefined();
    const result = res.result as { fileCount: number; totalBytes: number };
    expect(result.fileCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

describe("audit trail", () => {
  it("session.audit returns logged operations", async () => {
    const create = await rpc("session.create", {
      name: "audit-test",
      capabilities: [{ kind: "fs:read", pattern: "*" }],
      files: { "/f.txt": "data" },
    });
    const sessionId = (create.result as { sessionId: string }).sessionId;

    // Execute some operations
    await rpc("session.execute", { sessionId, code: 'cat("/f.txt")' });
    await rpc("session.execute", { sessionId, code: 'stat("/f.txt")' });

    const audit = await rpc("session.audit", { sessionId });
    expect(audit.error).toBeUndefined();
    const entries = (audit.result as { entries: unknown[] }).entries;
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("returns parse error for invalid JSON", async () => {
    const resp = await fetch(server.url, {
      method: "POST",
      body: "not json",
    });
    const data = (await resp.json()) as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it("returns method not found for unknown method", async () => {
    const res = await rpc("nonexistent.method");
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32601);
  });

  it("returns invalid params for missing required params", async () => {
    const res = await rpc("session.create", {});
    expect(res.error).toBeDefined();
    expect(res.error!.code).toBe(-32602);
  });
});
