/**
 * WebSocket wrappers — client and server with capability checks.
 *
 * Client requires net:fetch (reuses domain checks).
 * Server requires net:listen.
 *
 * @module
 */

import type { CapabilityKind, RequireCap } from "../capabilities/types";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A managed WebSocket client connection. */
export interface TypedWebSocket {
  /** Send a message (string or object auto-serialized to JSON). */
  send(data: string | object): void;
  /** Register a message handler. */
  onMessage(handler: (data: string) => void): void;
  /** Register an error handler. */
  onError(handler: (error: Error) => void): void;
  /** Register a close handler. */
  onClose(handler: (code: number, reason: string) => void): void;
  /** Close the connection. */
  close(code?: number, reason?: string): void;
  /** The connection URL. */
  readonly url: string;
  /** Whether the connection is open. */
  readonly isOpen: boolean;
}

// ---------------------------------------------------------------------------
// wsConnect — WebSocket client
// ---------------------------------------------------------------------------

/**
 * Connect to a WebSocket server with capability checks.
 * Requires net:fetch capability for the server's domain.
 *
 * @example
 * ```ts
 * const ws = await wsConnect(ctx, "wss://echo.websocket.org");
 * ws.onMessage((data) => console.log("Received:", data));
 * ws.send("hello");
 * ws.close();
 * ```
 */
export async function wsConnect<K extends CapabilityKind>(
  ctx: RequireCap<K, "net:fetch">,
  url: string,
): Promise<TypedWebSocket> {
  const parsed = new URL(url);
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === "wss:"
      ? 443
      : 80;

  ctx.caps.demand({
    kind: "net:fetch",
    allowedDomains: [parsed.hostname],
    allowedPorts: [port],
  });
  ctx.audit.log("net:fetch", { op: "wsConnect", url });

  const emitter = new EventEmitter();
  let open = false;

  const ws = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => {
      open = true;
      resolve();
    });
    ws.addEventListener("error", (e) => {
      if (!open) reject(new Error(`WebSocket connection failed: ${url}`));
      emitter.emit("error", e);
    });
  });

  ws.addEventListener("message", (event) => {
    emitter.emit("message", String(event.data));
  });

  ws.addEventListener("close", (event) => {
    open = false;
    emitter.emit("close", event.code, event.reason);
  });

  ws.addEventListener("error", () => {
    open = false;
  });

  return {
    url,

    get isOpen() {
      return open;
    },

    send(data: string | object): void {
      const msg = typeof data === "object" ? JSON.stringify(data) : data;
      ws.send(msg);
    },

    onMessage(handler: (data: string) => void): void {
      emitter.on("message", handler);
    },

    onError(handler: (error: Error) => void): void {
      emitter.on("error", handler);
    },

    onClose(handler: (code: number, reason: string) => void): void {
      emitter.on("close", handler);
    },

    close(code?: number, reason?: string): void {
      ctx.audit.log("net:fetch", { op: "wsClose", url });
      open = false;
      ws.close(code, reason);
    },
  };
}
