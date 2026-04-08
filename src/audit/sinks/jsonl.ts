/**
 * JSONL audit sink — appends entries as JSON lines to a file.
 *
 * @module
 */

import type { AuditSink, AuditEntry } from "../types";
import { appendFileSync } from "node:fs";

/**
 * Create a JSONL file audit sink.
 *
 * @example
 * ```ts
 * const audit = createAuditLogger({
 *   agentId: "1",
 *   agentName: "agent",
 *   sinks: [jsonlSink("/tmp/audit.jsonl")],
 * });
 * ```
 */
export function jsonlSink(path: string): AuditSink {
  return {
    write(entry: AuditEntry): void {
      const line = JSON.stringify(entry) + "\n";
      appendFileSync(path, line);
    },
  };
}
