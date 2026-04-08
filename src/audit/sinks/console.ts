/**
 * Console audit sink — pretty-prints entries to the terminal.
 *
 * @module
 */

import type { AuditSink, AuditEntry } from "../types";

const RESULT_COLORS: Record<string, string> = {
  success: "\x1b[32m", // green
  denied: "\x1b[31m", // red
  error: "\x1b[33m", // yellow
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function formatEntry(entry: AuditEntry): string {
  const color = RESULT_COLORS[entry.result] ?? RESET;
  const time = entry.timestamp.toISOString().slice(11, 23);
  const duration =
    entry.duration !== undefined
      ? ` ${DIM}(${entry.duration.toFixed(1)}ms)${RESET}`
      : "";
  const err = entry.error ? ` — ${entry.error}` : "";

  return `${DIM}${time}${RESET} ${color}[${entry.result.toUpperCase()}]${RESET} ${entry.agentName}/${entry.capability}:${entry.operation}${duration}${err}`;
}

/**
 * Create a console audit sink.
 *
 * @example
 * ```ts
 * const audit = createAuditLogger({
 *   agentId: "1",
 *   agentName: "agent",
 *   sinks: [consoleSink()],
 * });
 * ```
 */
export function consoleSink(): AuditSink {
  return {
    write(entry: AuditEntry): void {
      console.log(formatEntry(entry));
    },
  };
}
