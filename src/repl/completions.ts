/**
 * TypeScript REPL autocompletion engine.
 *
 * Provides context-aware completions for:
 * - BunShell API functions and types (ls, pipe, filter, ctx, ...)
 * - Property/method access on objects (ctx.caps., f.name, ...)
 * - User-defined variables
 * - File path strings (inside quotes)
 * - Dot commands (.help, .exit, ...)
 *
 * @module
 */

import { readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CompleterResult = [completions: string[], partial: string];

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Known type shapes for property completion
// ---------------------------------------------------------------------------

const FILE_ENTRY_PROPS = [
  "name",
  "path",
  "size",
  "isDirectory",
  "isFile",
  "isSymlink",
  "permissions",
  "modifiedAt",
  "createdAt",
  "accessedAt",
  "extension",
];

const CAPABILITY_CONTEXT_PROPS = ["id", "name", "caps", "audit", "derive"];
const CAPABILITY_SET_PROPS = [
  "capabilities",
  "has",
  "getAll",
  "check",
  "demand",
];
const AUDIT_LOGGER_PROPS = [
  "log",
  "entries",
  "query",
  "flush",
  "logSuccess",
  "logDenied",
  "logError",
];
const SPAWN_RESULT_PROPS = [
  "exitCode",
  "stdout",
  "stderr",
  "success",
  "duration",
  "command",
  "args",
];
const GREP_MATCH_PROPS = ["file", "line", "column", "content", "match"];
const PROCESS_INFO_PROPS = [
  "pid",
  "ppid",
  "name",
  "command",
  "user",
  "cpu",
  "memory",
  "state",
];
const WRITE_RESULT_PROPS = ["bytesWritten", "path"];
const DISK_USAGE_PROPS = ["path", "bytes", "human", "files", "directories"];
const WC_RESULT_PROPS = ["lines", "words", "chars", "bytes"];
const NET_RESPONSE_PROPS = [
  "status",
  "statusText",
  "headers",
  "body",
  "url",
  "duration",
];
const SYSTEM_INFO_PROPS = ["os", "hostname", "release", "arch", "platform"];
const AGENT_RESULT_PROPS = [
  "success",
  "exitCode",
  "output",
  "auditTrail",
  "duration",
  "error",
];

const DOT_COMMANDS = [
  ".help",
  ".vars",
  ".caps",
  ".audit",
  ".clear",
  ".exit",
  ".quit",
];

// Map known variable names to their property lists
const KNOWN_SHAPES: Record<string, string[]> = {
  ctx: CAPABILITY_CONTEXT_PROPS,
  audit: AUDIT_LOGGER_PROPS,
};

// ---------------------------------------------------------------------------
// File path completion (inside strings)
// ---------------------------------------------------------------------------

function completeFilePath(partial: string): string[] {
  try {
    const cwd = process.cwd();
    let dir: string;
    if (partial === "") {
      dir = cwd;
    } else if (partial.endsWith("/")) {
      dir = resolve(cwd, partial);
    } else {
      dir = resolve(cwd, dirname(partial));
    }
    const entries = readdirSync(dir);
    const results: string[] = [];
    for (const entry of entries) {
      if (
        entry.startsWith(".") &&
        !partial.endsWith("/.") &&
        !partial.startsWith(".")
      )
        continue;
      const fullEntry = partial.includes("/")
        ? join(dirname(partial), entry)
        : entry;
      if (fullEntry.startsWith(partial) || partial === "") {
        try {
          const s = statSync(resolve(cwd, fullEntry));
          results.push(s.isDirectory() ? fullEntry + "/" : fullEntry);
        } catch {
          results.push(fullEntry);
        }
      }
    }
    return results.sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Detect property access type from runtime values
// ---------------------------------------------------------------------------

function getPropsForValue(value: any): string[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return [
      "length",
      "filter",
      "map",
      "reduce",
      "find",
      "some",
      "every",
      "forEach",
      "slice",
      "sort",
      "reverse",
      "concat",
      "join",
      "flat",
      "flatMap",
      "includes",
      "indexOf",
      "at",
      "push",
      "pop",
    ];
  }

  if (typeof value === "string") {
    return [
      "length",
      "trim",
      "split",
      "replace",
      "includes",
      "startsWith",
      "endsWith",
      "slice",
      "substring",
      "indexOf",
      "toLowerCase",
      "toUpperCase",
      "match",
      "search",
      "padStart",
      "padEnd",
      "repeat",
      "at",
    ];
  }

  if (typeof value === "object") {
    // Detect known BunShell types
    if ("caps" in value && "derive" in value) return CAPABILITY_CONTEXT_PROPS;
    if ("capabilities" in value && "has" in value && "demand" in value)
      return CAPABILITY_SET_PROPS;
    if ("entries" in value && "query" in value && "flush" in value)
      return AUDIT_LOGGER_PROPS;
    if ("exitCode" in value && "stdout" in value) return SPAWN_RESULT_PROPS;
    if ("isFile" in value && "permissions" in value) return FILE_ENTRY_PROPS;
    if ("line" in value && "match" in value && "content" in value)
      return GREP_MATCH_PROPS;
    if ("pid" in value && "cpu" in value) return PROCESS_INFO_PROPS;
    if ("bytesWritten" in value) return WRITE_RESULT_PROPS;
    if ("bytes" in value && "human" in value && "files" in value)
      return DISK_USAGE_PROPS;
    if ("lines" in value && "words" in value && "chars" in value)
      return WC_RESULT_PROPS;
    if ("status" in value && "statusText" in value && "body" in value)
      return NET_RESPONSE_PROPS;
    if ("os" in value && "arch" in value && "platform" in value)
      return SYSTEM_INFO_PROPS;
    if ("success" in value && "auditTrail" in value) return AGENT_RESULT_PROPS;

    // Fallback: enumerate own keys
    return Object.keys(value);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Main completer
// ---------------------------------------------------------------------------

/**
 * Create a completer for the TypeScript REPL.
 */
export function createCompleter(
  scope: Record<string, any>,
  userVars: Record<string, any>,
): (line: string) => CompleterResult {
  return (line: string): CompleterResult => {
    const trimmed = line.trimStart();

    // --- Dot commands ---
    if (trimmed.startsWith(".")) {
      const matches = DOT_COMMANDS.filter((c) => c.startsWith(trimmed));
      return [matches, trimmed];
    }

    // --- Inside a string literal? Complete file paths ---
    const lastQuote = Math.max(line.lastIndexOf('"'), line.lastIndexOf("'"));
    if (lastQuote !== -1) {
      // Count quotes to see if we're inside one
      const beforeCursor = line;
      let singleCount = 0;
      let doubleCount = 0;
      for (const ch of beforeCursor) {
        if (ch === "'") singleCount++;
        if (ch === '"') doubleCount++;
      }
      // If odd number of quotes, we're inside a string
      if (singleCount % 2 === 1 || doubleCount % 2 === 1) {
        const partial = line.slice(lastQuote + 1);
        const paths = completeFilePath(partial);
        // Reconstruct with the path inserted
        const prefix = line.slice(0, lastQuote + 1);
        return [paths.map((p) => prefix + p), line];
      }
    }

    // --- Property access: foo.bar ---
    const dotMatch = trimmed.match(/(\w+(?:\.\w+)*)\.(\w*)$/);
    if (dotMatch) {
      const objPath = dotMatch[1]!;
      const partial = dotMatch[2]!;

      // Try to resolve the object from userVars or scope
      const rootVar = objPath.split(".")[0]!;
      let obj =
        userVars[rootVar] !== undefined ? userVars[rootVar] : scope[rootVar];

      // Walk the property chain
      const pathParts = objPath.split(".").slice(1);
      for (const part of pathParts) {
        if (obj == null) break;
        obj = obj[part];
      }

      let props: string[];
      if (obj != null) {
        props = getPropsForValue(obj);
      } else {
        // Fallback: use known shapes
        props = KNOWN_SHAPES[objPath] ?? [];
      }

      const matches = props
        .filter((p) => p.startsWith(partial))
        .map((p) => objPath + "." + p);

      // Return completions relative to the full line
      const prefix = line.slice(
        0,
        line.length - (objPath.length + 1 + partial.length),
      );
      return [matches.map((m) => prefix + m), line];
    }

    // --- Variable / function name completion ---
    const wordMatch = trimmed.match(/(\w*)$/);
    const partial = wordMatch ? wordMatch[1]! : "";

    // Combine scope + user vars
    const allNames = [
      ...Object.keys(scope),
      ...Object.keys(userVars),
      "await",
      "const",
      "let",
      "async",
      "function",
      "if",
      "else",
      "for",
      "while",
      "return",
      "true",
      "false",
      "null",
      "undefined",
      "typeof",
      "instanceof",
      "new",
      "import",
      "from",
      "export",
    ];

    const uniqueNames = [...new Set(allNames)];
    const matches = uniqueNames
      .filter((n) => n.startsWith(partial) && n !== partial)
      .sort();

    if (matches.length === 0) return [[], partial];

    // Preserve the line prefix before the word
    const prefix = line.slice(0, line.length - partial.length);
    return [matches.map((m) => prefix + m), line];
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
