/**
 * BunShell server — HTTP daemon accepting JSON-RPC requests.
 *
 * Any harness (Claude Code, Cursor, custom agent) can connect
 * and execute typed TypeScript in isolated sessions.
 *
 * @module
 */

import type { JsonRpcRequest } from "./protocol";
import { RPC_ERRORS } from "./protocol";
import { createSessionManager } from "./session";
import { handleRequest } from "./handler";
import type { ServerContext } from "./handler";
import { createConfigStore } from "./config-store";
import type { AuditEntry } from "../audit/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for starting the BunShell server. */
export interface ServerOptions {
  /** Port to listen on (default: 7483 — "SHEL" on a phone). */
  readonly port?: number;
  /** Hostname (default: "127.0.0.1" — localhost only for security). */
  readonly hostname?: string;
  /** Log requests to console (default: false). */
  readonly verbose?: boolean;
}

/** A running BunShell server handle. */
export interface BunShellServer {
  readonly port: number;
  readonly hostname: string;
  readonly url: string;
  stop(): void;
}

// ---------------------------------------------------------------------------
// ANSI
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/**
 * Start the BunShell JSON-RPC server.
 *
 * @example
 * ```ts
 * const server = startServer({ port: 7483, verbose: true });
 * // Now any client can POST JSON-RPC to http://127.0.0.1:7483
 *
 * // Create session:
 * // { "jsonrpc": "2.0", "id": 1, "method": "session.create",
 * //   "params": { "name": "my-agent", "capabilities": [...] } }
 *
 * // Execute code:
 * // { "jsonrpc": "2.0", "id": 2, "method": "session.execute",
 * //   "params": { "sessionId": "...", "code": "ls('/')" } }
 *
 * server.stop();
 * ```
 */
export function startServer(options?: ServerOptions): BunShellServer {
  const port = options?.port ?? 7483;
  const hostname = options?.hostname ?? "127.0.0.1";
  const verbose = options?.verbose ?? false;

  const mgr = createSessionManager();
  const configStore = createConfigStore();
  const serverCtx: ServerContext = { mgr, configStore };

  const server = Bun.serve({
    port,
    hostname,

    async fetch(
      req: Request,
      bunServer: import("bun").Server<unknown>,
    ): Promise<Response> {
      // CORS headers for browser-based harnesses
      const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (req.method === "GET") {
        const url = new URL(req.url);

        // SSE endpoint — real-time audit stream
        //
        // Uses Bun's direct-write ReadableStream (`type: "direct"`)
        // which gives us a raw socket controller that stays open until
        // we explicitly close or flush it.  The standard ReadableStream
        // API causes ERR_INCOMPLETE_CHUNKED_ENCODING in browsers because
        // Bun eagerly terminates the chunked response.
        if (url.pathname === "/events") {
          // Disable Bun's idle timeout — without this, Bun kills the
          // connection after ~10s of inactivity, causing browsers to see
          // ERR_INCOMPLETE_CHUNKED_ENCODING.
          bunServer.timeout(req, 0);

          const filterSessionId = url.searchParams.get("sessionId");
          const filterCapability = url.searchParams.get("capability");
          const filterResult = url.searchParams.get("result");

          const stream = new ReadableStream({
            type: "direct",
            async pull(controller: ReadableStreamDirectController) {
              const encoder = new TextEncoder();
              let closed = false;

              // Send initial keepalive
              controller.write(encoder.encode(": connected\n\n"));

              const listener = (entry: AuditEntry) => {
                if (closed) return;
                if (filterSessionId && entry.agentId !== filterSessionId)
                  return;
                if (filterCapability && entry.capability !== filterCapability)
                  return;
                if (filterResult && entry.result !== filterResult) return;

                const data = JSON.stringify({
                  sessionId: entry.agentId,
                  sessionName: entry.agentName,
                  timestamp: entry.timestamp.toISOString(),
                  capability: entry.capability,
                  operation: entry.operation,
                  args: entry.args,
                  result: entry.result,
                  error: entry.error,
                  duration: entry.duration,
                });
                controller.write(encoder.encode(`data: ${data}\n\n`));
              };

              function cleanup() {
                if (closed) return;
                closed = true;
                clearInterval(keepalive);
                mgr.auditStream.off("entry", listener);
                controller.close();
              }

              mgr.auditStream.on("entry", listener);
              req.signal.addEventListener("abort", cleanup);

              // Periodic keepalive — SSE comment every 15s prevents
              // browser/proxy idle timeouts and proves liveness.
              const keepalive = setInterval(() => {
                if (closed) return;
                controller.write(encoder.encode(": keepalive\n\n"));
              }, 15000);

              // Block until the client disconnects
              await new Promise<void>((resolve) => {
                req.signal.addEventListener("abort", () => resolve());
              });

              cleanup();
            },
          } as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- Bun's direct stream extension

          return new Response(stream, {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        // Health check (GET /)
        const stats = mgr.stats();
        return Response.json(
          {
            name: "bunshell",
            version: "0.1.0",
            protocol: "json-rpc-2.0",
            sessions: mgr.list().length,
            uptime: stats.uptime,
            totalExecutions: stats.totalExecutions,
            totalAuditEntries: stats.totalAuditEntries,
          },
          { headers: corsHeaders },
        );
      }

      if (req.method !== "POST") {
        return Response.json(
          { error: "Use POST with JSON-RPC 2.0" },
          { status: 405, headers: corsHeaders },
        );
      }

      // Parse JSON-RPC request
      let body: JsonRpcRequest;
      try {
        body = (await req.json()) as JsonRpcRequest;
      } catch {
        return Response.json(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: RPC_ERRORS.PARSE_ERROR, message: "Invalid JSON" },
          },
          { headers: corsHeaders },
        );
      }

      if (!body.jsonrpc || body.jsonrpc !== "2.0" || !body.method) {
        return Response.json(
          {
            jsonrpc: "2.0",
            id: body.id ?? null,
            error: {
              code: RPC_ERRORS.INVALID_REQUEST,
              message: "Invalid JSON-RPC 2.0 request",
            },
          },
          { headers: corsHeaders },
        );
      }

      if (verbose) {
        const ts = new Date().toISOString().slice(11, 23);
        console.log(
          `${C.dim}${ts}${C.reset} ${C.cyan}${body.method}${C.reset} ${C.dim}id=${String(body.id)}${C.reset}`,
        );
      }

      // Handle the request
      const response = await handleRequest(body, serverCtx);

      if (verbose && response.error) {
        console.log(
          `${C.dim}${new Date().toISOString().slice(11, 23)}${C.reset} ${C.red}ERROR${C.reset} ${response.error.message}`,
        );
      }

      return Response.json(response, { headers: corsHeaders });
    },
  });

  const url = `http://${hostname}:${server.port}`;

  if (verbose) {
    console.log(
      `${C.bold}${C.cyan}BunShell Server${C.reset} ${C.dim}v0.1.0${C.reset}`,
    );
    console.log(`${C.green}Listening${C.reset} on ${C.bold}${url}${C.reset}`);
    console.log(`${C.dim}Protocol: JSON-RPC 2.0 over HTTP POST${C.reset}`);
    console.log(`${C.dim}GET / for health check${C.reset}\n`);
  }

  return {
    port: server.port ?? port,
    hostname,
    url,
    stop() {
      if (verbose) {
        console.log(`\n${C.dim}Server stopped.${C.reset}`);
      }
      server.stop();
    },
  };
}
