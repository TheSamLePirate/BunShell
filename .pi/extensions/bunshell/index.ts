/**
 * BunShell extension for pi-coding-agent.
 *
 * Connects to BunShell's JSON-RPC server (bun run server).
 * No Bun dependency — pure Node.js HTTP calls.
 *
 * The LLM gets three tools:
 * - bunshell_execute: run TypeScript code in a capability-checked session
 * - bunshell_fs: direct VFS file operations (read, write, list)
 * - bunshell_audit: inspect the BunShell audit trail
 *
 * This extension also deactivates pi's built-in coding tools so the agent
 * can only use BunShell tools.
 *
 * On session_start:
 * 1. Connect to BunShell server (default localhost:7483)
 * 2. Create a session with capabilities from .bunshell.ts
 * 3. Show status in pi's UI
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// JSON-RPC client — pure Node.js fetch, no Bun
// ---------------------------------------------------------------------------

const DEFAULT_URL = "http://127.0.0.1:7483";

interface RpcResult {
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

let rpcIdCounter = 0;

async function rpc(
  url: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<RpcResult> {
  rpcIdCounter++;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: rpcIdCounter,
    method,
    params,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  return (await resp.json()) as RpcResult;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const BUNSHELL_TOOL_NAMES = [
  "bunshell_execute",
  "bunshell_fs",
  "bunshell_audit",
] as const;

const ALLOWED_TOOL_NAMES = new Set<string>(BUNSHELL_TOOL_NAMES);

const state = {
  url: DEFAULT_URL,
  sessionId: null as string | null,
  sessionName: "",
  capabilities: [] as string[],
  opCount: 0,
};

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const ExecuteParams = Type.Object({
  code: Type.String({
    description:
      "TypeScript code to execute in the BunShell session. " +
      "All BunShell APIs are available: ls, cat, write, spawn, exec, netFetch, " +
      "gitStatus, dockerRun, pipe, filter, toTable, etc. " +
      "The code runs in a capability-checked sandbox — unauthorized operations " +
      "return clear errors. Use 'await' for async operations.",
  }),
  timeout: Type.Optional(
    Type.Number({ description: "Execution timeout in ms (default: 30000)" }),
  ),
});

const FsParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("read"),
      Type.Literal("write"),
      Type.Literal("list"),
      Type.Literal("snapshot"),
    ],
    { description: "VFS operation" },
  ),
  path: Type.Optional(Type.String({ description: "File or directory path" })),
  content: Type.Optional(Type.String({ description: "Content to write" })),
});

const AuditParams = Type.Object({
  limit: Type.Optional(
    Type.Number({ description: "Max entries to return (default: 20)" }),
  ),
  capability: Type.Optional(
    Type.String({ description: "Filter by capability kind" }),
  ),
});

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function bunshellExtension(pi: ExtensionAPI) {
  // -------------------------------------------------------------------
  // Session start — connect to BunShell server, create session
  // -------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    state.opCount = 0;
    state.sessionId = null;

    // Register tools + enforce only BunShell tools
    pi.registerTool(
      createExecuteTool() as Parameters<typeof pi.registerTool>[0],
    );
    pi.registerTool(createFsTool() as Parameters<typeof pi.registerTool>[0]);
    pi.registerTool(createAuditTool() as Parameters<typeof pi.registerTool>[0]);
    pi.setActiveTools([...BUNSHELL_TOOL_NAMES]);

    // Check if BunShell server is running
    try {
      const health = await fetch(state.url);
      const info = (await health.json()) as {
        name?: string;
        version?: string;
      };
      if (info.name !== "bunshell") {
        ctx.ui.setStatus("bunshell", "BunShell: wrong server");
        return;
      }
    } catch {
      ctx.ui.setStatus(
        "bunshell",
        "BunShell: server not running (bun run server)",
      );
      return;
    }

    // Create a session with full capabilities
    // (The .bunshell.ts config is loaded server-side)
    const createResult = await rpc(state.url, "session.create", {
      name: "pi-agent",
      capabilities: [
        { kind: "fs:read", pattern: "**" },
        { kind: "fs:write", pattern: "**" },
        { kind: "fs:delete", pattern: "/tmp/**" },
        { kind: "process:spawn", allowedBinaries: ["*"] },
        { kind: "net:fetch", allowedDomains: ["*"] },
        { kind: "env:read", allowedKeys: ["*"] },
        { kind: "env:write", allowedKeys: ["*"] },
        { kind: "db:query", pattern: "**" },
        { kind: "docker:run", allowedImages: ["*"] },
        { kind: "os:interact" },
        { kind: "secret:read", allowedKeys: ["*"] },
        { kind: "secret:write", allowedKeys: ["*"] },
      ],
      mount: {
        diskPath: ctx.cwd,
        vfsPath: "/workspace",
      },
    });

    if (createResult.error) {
      ctx.ui.setStatus("bunshell", `BunShell: ${createResult.error.message}`);
      return;
    }

    const session = createResult.result as {
      sessionId: string;
      name: string;
      capabilities: Array<{ kind: string }>;
      fileCount: number;
    };

    state.sessionId = session.sessionId;
    state.sessionName = session.name;
    state.capabilities = [...new Set(session.capabilities.map((c) => c.kind))];

    // Status
    const capsShort = state.capabilities
      .map((c) => c.split(":")[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" ");
    ctx.ui.setStatus(
      "bunshell",
      `● BunShell │ ${capsShort} │ ${session.fileCount} files`,
    );

    ctx.ui.notify(
      `BunShell connected: session ${session.sessionId.slice(0, 12)}`,
      "info",
    );
  });

  // -------------------------------------------------------------------
  // System prompt injection
  // -------------------------------------------------------------------

  pi.on("before_agent_start", async (event) => {
    if (!state.sessionId) return;

    const injection = [
      "",
      "## BunShell — Typed Execution Environment",
      "",
      "You have a BunShell session connected. Use the `bunshell_execute` tool to run TypeScript code",
      "in a capability-checked sandbox. All BunShell APIs are pre-imported:",
      "",
      "**Filesystem:** ls, cat, write, readJson, writeJson, rm, cp, mv, find, stat, glob, du",
      "**Process:** spawn, exec, ps, kill",
      "**Network:** netFetch, ping, download, dig",
      "**Git:** gitStatus, gitLog, gitDiff, gitBranch, gitAdd, gitCommit, gitPush, gitPull",
      "**Docker:** dockerRun, dockerExec, dockerVfsRun, dockerBuild, dockerImages, dockerPs",
      "**Data:** parseJSON, parseCSV, parseTOML, hash, base64Encode, base64Decode",
      "**Pipe:** pipe, filter, map, sortBy, take, toTable, toBarChart, streamPipe",
      "**Crypto:** hash, hmac, encrypt, decrypt, randomUUID",
      "",
      "The working directory is mounted at /workspace in the VFS.",
      "Use `ctx` as the first argument to capability-checked functions.",
      "If a capability is denied, you'll get a clear error — do NOT retry.",
      "",
      "Use `bunshell_fs` for direct file read/write/list without writing code.",
      "Use `bunshell_audit` to inspect the audit trail of operations.",
    ].join("\n");

    return {
      systemPrompt: event.systemPrompt + injection,
    };
  });

  // -------------------------------------------------------------------
  // Tool enforcement + execution tracking
  // -------------------------------------------------------------------

  pi.on("tool_call", async (event) => {
    if (ALLOWED_TOOL_NAMES.has(event.toolName)) return;
    return {
      block: true,
      reason: "Only BunShell tools are allowed in this project",
    };
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    if (!event.toolName.startsWith("bunshell_")) return;
    state.opCount++;
    ctx.ui.setStatus("bunshell", `● BunShell │ ${state.opCount} ops`);
  });

  // -------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------

  pi.registerCommand("bunshell-status", {
    description: "Show BunShell session status",
    handler: async (_args, ctx) => {
      if (!state.sessionId) {
        ctx.ui.notify("BunShell not connected. Run: bun run server", "error");
        return;
      }
      const listResult = await rpc(state.url, "session.list");
      ctx.ui.notify(JSON.stringify(listResult.result, null, 2), "info");
    },
  });

  // -------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------

  pi.on("session_shutdown", async () => {
    if (state.sessionId) {
      await rpc(state.url, "session.destroy", {
        sessionId: state.sessionId,
      }).catch(() => {});
    }
    state.sessionId = null;
    state.opCount = 0;
  });
}

// ---------------------------------------------------------------------------
// Tool factories
// ---------------------------------------------------------------------------

function createExecuteTool() {
  return {
    name: "bunshell_execute",
    label: "BunShell Execute",
    description: [
      "Execute TypeScript code in a BunShell capability-checked session.",
      "All BunShell APIs are pre-imported (ls, cat, write, spawn, exec, netFetch, gitStatus, dockerRun, pipe, etc.).",
      "Use 'ctx' as the first argument to capability-checked functions.",
      "Use 'await' for async operations. The working directory is mounted at /workspace.",
      "Returns the execution result as typed structured data.",
    ].join(" "),
    promptSnippet:
      "Use bunshell_execute to run TypeScript in a sandboxed, capability-checked environment.",
    promptGuidelines: [
      'Example: await ls(ctx, "/workspace") — lists project files',
      'Example: await spawn(ctx, "git", ["status"]) — run git with structured result',
      'Example: await pipe(ls(ctx, "/workspace"), filter(f => f.isFile), toTable()) — pipe + visualize',
      "If you get a CapabilityError, the operation is not permitted — do NOT retry",
    ],
    parameters: ExecuteParams,

    async execute(_toolCallId: string, params: Static<typeof ExecuteParams>) {
      if (!state.sessionId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "BunShell not connected. Start the server: bun run server",
            },
          ],
          isError: true,
          details: {},
        };
      }

      const result = await rpc(state.url, "session.execute", {
        sessionId: state.sessionId,
        code: params.code,
        timeout: params.timeout,
      });

      if (result.error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `BunShell error: ${result.error.message}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      const exec = result.result as {
        value: unknown;
        type: string;
        duration: number;
        auditEntries: number;
      };

      const output =
        exec.value === undefined || exec.value === null
          ? `// executed in ${exec.duration.toFixed(0)}ms (${exec.auditEntries} audit entries)`
          : typeof exec.value === "string"
            ? exec.value
            : JSON.stringify(exec.value, null, 2);

      return {
        content: [
          {
            type: "text" as const,
            text: `// : ${exec.type} (${exec.duration.toFixed(0)}ms)\n${output}`,
          },
        ],
        details: { type: exec.type, duration: exec.duration },
      };
    },
  };
}

function createFsTool() {
  return {
    name: "bunshell_fs",
    label: "BunShell FS",
    description:
      "Direct VFS file operations without writing code. Actions: read, write, list, snapshot.",
    parameters: FsParams,

    async execute(_toolCallId: string, params: Static<typeof FsParams>) {
      if (!state.sessionId) {
        return {
          content: [{ type: "text" as const, text: "BunShell not connected" }],
          isError: true,
          details: {},
        };
      }

      let method: string;
      const rpcParams: Record<string, unknown> = {
        sessionId: state.sessionId,
      };

      switch (params.action) {
        case "read":
          method = "session.fs.read";
          rpcParams["path"] = params.path ?? "/";
          break;
        case "write":
          method = "session.fs.write";
          rpcParams["path"] = params.path ?? "/tmp/output.txt";
          rpcParams["content"] = params.content ?? "";
          break;
        case "list":
          method = "session.fs.list";
          rpcParams["path"] = params.path ?? "/";
          break;
        case "snapshot":
          method = "session.fs.snapshot";
          break;
        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown action: ${params.action}`,
              },
            ],
            isError: true,
            details: {},
          };
      }

      const result = await rpc(state.url, method, rpcParams);

      if (result.error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `BunShell error: ${result.error.message}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result.result, null, 2),
          },
        ],
        details: { action: params.action },
      };
    },
  };
}

function createAuditTool() {
  return {
    name: "bunshell_audit",
    label: "BunShell Audit",
    description:
      "Query the BunShell audit trail — every operation is logged with timestamp, capability, and result.",
    parameters: AuditParams,

    async execute(_toolCallId: string, params: Static<typeof AuditParams>) {
      if (!state.sessionId) {
        return {
          content: [{ type: "text" as const, text: "BunShell not connected" }],
          isError: true,
          details: {},
        };
      }

      const rpcParams: Record<string, unknown> = {
        sessionId: state.sessionId,
        limit: params.limit ?? 20,
      };
      if (params.capability) rpcParams["capability"] = params.capability;

      const result = await rpc(state.url, "session.audit", rpcParams);

      if (result.error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `BunShell error: ${result.error.message}`,
            },
          ],
          isError: true,
          details: {},
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result.result, null, 2),
          },
        ],
        details: {},
      };
    },
  };
}
