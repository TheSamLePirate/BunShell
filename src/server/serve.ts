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

  const server = Bun.serve({
    port,
    hostname,

    async fetch(req: Request): Promise<Response> {
      // CORS headers for browser-based harnesses
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Health check
      if (req.method === "GET") {
        return Response.json(
          {
            name: "bunshell",
            version: "0.1.0",
            protocol: "json-rpc-2.0",
            sessions: mgr.list().length,
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
      const response = await handleRequest(body, mgr);

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
