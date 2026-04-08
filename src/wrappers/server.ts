/**
 * HTTP server wrapper — Bun.serve() with capability checks.
 *
 * Requires net:listen capability for the port.
 *
 * @module
 */

import type { CapabilityKind, RequireCap } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A route handler function. */
export type RouteHandler = (req: Request) => Response | Promise<Response>;

/** Server configuration. */
export interface ServeOptions {
  readonly port: number;
  readonly hostname?: string;
  readonly routes?: Record<string, RouteHandler>;
  readonly handler?: RouteHandler;
}

/** A running server handle. */
export interface ServerHandle {
  readonly port: number;
  readonly hostname: string;
  readonly url: string;
  stop(): void;
}

// ---------------------------------------------------------------------------
// serve
// ---------------------------------------------------------------------------

/**
 * Start an HTTP server with capability checks.
 *
 * @example
 * ```ts
 * const server = serve(ctx, {
 *   port: 3000,
 *   routes: {
 *     "/health": () => new Response("ok"),
 *     "/api/data": () => Response.json({ status: "running" }),
 *   },
 * });
 * // ... later
 * server.stop();
 * ```
 */
export function serve<K extends CapabilityKind>(
  ctx: RequireCap<K, "net:listen">,
  options: ServeOptions,
): ServerHandle {
  ctx.caps.demand({ kind: "net:listen", port: options.port });
  ctx.audit.log("net:listen", {
    op: "serve",
    port: options.port,
    hostname: options.hostname,
  });

  const routes = options.routes ?? {};
  const fallback =
    options.handler ?? (() => new Response("Not Found", { status: 404 }));

  const serveOpts: Record<string, unknown> = {
    port: options.port,
    fetch(req: Request): Response | Promise<Response> {
      const url = new URL(req.url);
      const handler = routes[url.pathname];
      if (handler) return handler(req);
      return fallback(req);
    },
  };
  if (options.hostname) serveOpts["hostname"] = options.hostname;

  const server = Bun.serve(
    serveOpts as unknown as Parameters<typeof Bun.serve>[0],
  );
  const hostname = options.hostname ?? "localhost";

  return {
    port: server.port ?? options.port,
    hostname,
    url: `http://${hostname}:${server.port}`,
    stop() {
      ctx.audit.log("net:listen", { op: "serve:stop", port: server.port });
      server.stop();
    },
  };
}
