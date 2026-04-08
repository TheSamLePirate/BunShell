/**
 * Stream audit sink — real-time event emitter for audit entries.
 *
 * @module
 */

import type { AuditSink, AuditEntry } from "../types";
import { EventEmitter } from "node:events";

/** Event emitter that fires "entry" events for each audit entry. */
export interface AuditStream extends AuditSink {
  readonly emitter: EventEmitter;
  on(event: "entry", listener: (entry: AuditEntry) => void): void;
  off(event: "entry", listener: (entry: AuditEntry) => void): void;
}

/**
 * Create a stream audit sink backed by an EventEmitter.
 *
 * @example
 * ```ts
 * const stream = streamSink();
 * stream.on("entry", (entry) => {
 *   console.log("Real-time:", entry.operation);
 * });
 *
 * const audit = createAuditLogger({
 *   agentId: "1",
 *   agentName: "agent",
 *   sinks: [stream],
 * });
 * ```
 */
export function streamSink(): AuditStream {
  const emitter = new EventEmitter();

  return {
    emitter,

    write(entry: AuditEntry): void {
      emitter.emit("entry", entry);
    },

    on(event: "entry", listener: (entry: AuditEntry) => void): void {
      emitter.on(event, listener);
    },

    off(event: "entry", listener: (entry: AuditEntry) => void): void {
      emitter.off(event, listener);
    },
  };
}
