/**
 * Status bar formatting for BunShell.
 */

import type { LoadedEnvironment } from "../../../../../src/config/loader";

/**
 * Format the status bar text showing BunShell state.
 * Example: "● agent-name │ fs:rw process docker │ 12 ops"
 */
export function formatStatus(env: LoadedEnvironment, opCount: number): string {
  const caps = env.ctx.caps;
  const parts: string[] = [];

  // Capability abbreviations
  const capAbbrevs: string[] = [];
  if (caps.has("fs:read") && caps.has("fs:write")) capAbbrevs.push("fs:rw");
  else if (caps.has("fs:read")) capAbbrevs.push("fs:r");
  else if (caps.has("fs:write")) capAbbrevs.push("fs:w");

  if (caps.has("process:spawn")) capAbbrevs.push("process");
  if (caps.has("net:fetch")) capAbbrevs.push("net");
  if (caps.has("docker:run")) capAbbrevs.push("docker");
  if (caps.has("db:query")) capAbbrevs.push("db");
  if (caps.has("secret:read")) capAbbrevs.push("secrets");

  parts.push(`● ${env.name}`);
  if (capAbbrevs.length > 0) parts.push(capAbbrevs.join(" "));
  parts.push(`${opCount} ops`);

  return parts.join(" │ ");
}

/**
 * Format a compact capability list for the widget.
 */
export function formatCapsList(env: LoadedEnvironment): string[] {
  const caps = env.ctx.caps;
  const lines: string[] = [];

  lines.push(`BunShell: ${env.name}`);

  const allCaps = caps.capabilities;
  for (const cap of allCaps) {
    if ("pattern" in cap) {
      lines.push(`  ${cap.kind}: ${(cap as { pattern: string }).pattern}`);
    } else if ("allowedBinaries" in cap) {
      lines.push(
        `  ${cap.kind}: ${(cap as { allowedBinaries: readonly string[] }).allowedBinaries.join(", ")}`,
      );
    } else if ("allowedDomains" in cap) {
      lines.push(
        `  ${cap.kind}: ${(cap as { allowedDomains: readonly string[] }).allowedDomains.join(", ")}`,
      );
    } else if ("allowedImages" in cap) {
      lines.push(
        `  ${cap.kind}: ${(cap as { allowedImages: readonly string[] }).allowedImages.join(", ")}`,
      );
    } else if ("allowedKeys" in cap) {
      lines.push(
        `  ${cap.kind}: ${(cap as { allowedKeys: readonly string[] }).allowedKeys.join(", ")}`,
      );
    } else {
      lines.push(`  ${cap.kind}`);
    }
  }

  return lines;
}
