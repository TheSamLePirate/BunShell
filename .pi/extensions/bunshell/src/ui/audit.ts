/**
 * Audit trail widget — shows recent operations.
 */

import type { FullAuditLogger } from "../../../../../src/audit/logger";

/**
 * Format the last N audit entries as widget lines.
 */
export function formatAuditWidget(
  audit: FullAuditLogger,
  maxLines: number = 5,
): string[] {
  const entries = audit.entries;
  if (entries.length === 0) return ["  No operations yet"];

  const recent = entries.slice(-maxLines);
  return recent.map((e) => {
    const icon =
      e.result === "success" ? "✓" : e.result === "denied" ? "✗" : "!";
    const time = e.timestamp.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return `  ${icon} ${time} ${e.capability} ${e.operation}`;
  });
}
