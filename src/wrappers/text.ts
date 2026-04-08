/**
 * Text processing wrappers — structured replacements for grep, sort, etc.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import type { GrepMatch, WcResult } from "./types";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------

/**
 * Search for a pattern in text or files. Returns structured matches.
 *
 * @example
 * ```ts
 * // Search a file
 * const matches = await grep(ctx, /ERROR/, "/var/log/app.log");
 * // Search a string directly
 * const matches = await grep(ctx, "TODO", null, { input: source });
 * ```
 */
export async function grep(
  ctx: CapabilityContext,
  pattern: string | RegExp,
  filePath: string | null,
  options?: {
    readonly ignoreCase?: boolean;
    readonly maxMatches?: number;
    readonly invert?: boolean;
    readonly input?: string;
  },
): Promise<GrepMatch[]> {
  let text: string;

  if (filePath) {
    const absPath = resolve(filePath);
    ctx.caps.demand({ kind: "fs:read", pattern: absPath });
    ctx.audit.log("fs:read", { op: "grep", path: absPath });
    text = await Bun.file(absPath).text();
  } else if (options?.input !== undefined) {
    text = options.input;
  } else {
    return [];
  }

  const flags = options?.ignoreCase ? "gi" : "g";
  const regex =
    pattern instanceof RegExp
      ? new RegExp(pattern.source, flags)
      : new RegExp(pattern, flags);

  const lines = text.split("\n");
  const matches: GrepMatch[] = [];
  const max = options?.maxMatches ?? Infinity;

  for (let i = 0; i < lines.length && matches.length < max; i++) {
    const line = lines[i]!;
    const hasMatch = regex.test(line);
    regex.lastIndex = 0; // Reset for next test

    const shouldInclude = options?.invert ? !hasMatch : hasMatch;
    if (!shouldInclude) continue;

    // Find the exact match position
    const m = regex.exec(line);
    regex.lastIndex = 0;

    matches.push({
      file: filePath,
      line: i + 1,
      column: m ? m.index + 1 : 1,
      content: line,
      match: m ? m[0] : line,
    });
  }

  return matches;
}

// ---------------------------------------------------------------------------
// sort
// ---------------------------------------------------------------------------

/**
 * Sort lines of text.
 *
 * @example
 * ```ts
 * const sorted = sort("banana\napple\ncherry");
 * // "apple\nbanana\ncherry"
 * ```
 */
export function sort(
  text: string,
  options?: {
    readonly reverse?: boolean;
    readonly numeric?: boolean;
    readonly unique?: boolean;
  },
): string {
  let lines = text.split("\n");

  if (options?.unique) {
    lines = [...new Set(lines)];
  }

  if (options?.numeric) {
    lines.sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb;
    });
  } else {
    lines.sort();
  }

  if (options?.reverse) lines.reverse();

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// uniq
// ---------------------------------------------------------------------------

/**
 * Remove consecutive duplicate lines.
 *
 * @example
 * ```ts
 * uniq("a\na\nb\nb\na"); // "a\nb\na"
 * ```
 */
export function uniq(
  text: string,
  options?: { readonly count?: boolean },
): string {
  const lines = text.split("\n");
  const result: string[] = [];
  const counts: number[] = [];

  for (const line of lines) {
    if (result.length === 0 || result[result.length - 1] !== line) {
      result.push(line);
      counts.push(1);
    } else {
      counts[counts.length - 1]!++;
    }
  }

  if (options?.count) {
    return result
      .map((line, i) => `${String(counts[i]!).padStart(4)} ${line}`)
      .join("\n");
  }

  return result.join("\n");
}

// ---------------------------------------------------------------------------
// head / tail
// ---------------------------------------------------------------------------

/**
 * Return the first N lines.
 *
 * @example
 * ```ts
 * head("a\nb\nc\nd", 2); // "a\nb"
 * ```
 */
export function head(text: string, n: number = 10): string {
  return text.split("\n").slice(0, n).join("\n");
}

/**
 * Return the last N lines.
 *
 * @example
 * ```ts
 * tail("a\nb\nc\nd", 2); // "c\nd"
 * ```
 */
export function tail(text: string, n: number = 10): string {
  const lines = text.split("\n");
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}

// ---------------------------------------------------------------------------
// wc
// ---------------------------------------------------------------------------

/**
 * Count lines, words, characters, and bytes.
 *
 * @example
 * ```ts
 * const counts = wc("hello world\nfoo bar");
 * // { lines: 2, words: 4, chars: 19, bytes: 19 }
 * ```
 */
export function wc(text: string): WcResult {
  const lines = text === "" ? 0 : text.split("\n").length;
  const words = text === "" ? 0 : text.trim().split(/\s+/).length;
  const chars = text.length;
  const bytes = new TextEncoder().encode(text).length;
  return { lines, words, chars, bytes };
}
