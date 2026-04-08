/**
 * Typed object output formatter for the TypeScript REPL.
 *
 * Every value is always rendered as its typed structure —
 * you see exactly what TypeScript sees. Colors highlight
 * types, keys, and values distinctly.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// ANSI
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

// ---------------------------------------------------------------------------
// Core typed formatter
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Format a value as a typed object representation.
 * Always outputs the full structure — no lossy pretty-printing.
 */
export function formatAuto(value: unknown, indent: number = 0): string {
  return formatValue(value, indent, new Set());
}

function formatValue(
  value: unknown,
  indent: number,
  seen: Set<unknown>,
): string {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (value === null) return `${C.dim}null${C.reset}`;
  if (value === undefined) return `${C.dim}undefined${C.reset}`;

  if (typeof value === "string") {
    return `${C.green}"${escapeString(value)}"${C.reset}`;
  }
  if (typeof value === "number") {
    return `${C.yellow}${value}${C.reset}`;
  }
  if (typeof value === "boolean") {
    return `${C.yellow}${value}${C.reset}`;
  }
  if (typeof value === "function") {
    return `${C.dim}[Function: ${(value as { name?: string }).name || "anonymous"}]${C.reset}`;
  }
  if (typeof value === "symbol") {
    return `${C.green}${value.toString()}${C.reset}`;
  }
  if (typeof value === "bigint") {
    return `${C.yellow}${value}n${C.reset}`;
  }

  if (value instanceof Date) {
    return `${C.magenta}Date${C.reset}(${C.green}"${value.toISOString()}"${C.reset})`;
  }
  if (value instanceof RegExp) {
    return `${C.red}${value.toString()}${C.reset}`;
  }
  if (value instanceof Error) {
    return `${C.red}${value.name}: ${value.message}${C.reset}`;
  }

  // Circular reference check
  if (typeof value === "object" && seen.has(value)) {
    return `${C.dim}[Circular]${C.reset}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return `[]`;

    seen.add(value);
    const typeName = inferArrayType(value);

    // For large arrays, show first items + count
    const maxShow = 20;
    const items = value.slice(0, maxShow);
    const lines: string[] = [];

    lines.push(`${C.magenta}${typeName}${C.reset} [`);
    for (let i = 0; i < items.length; i++) {
      const comma = i < items.length - 1 || value.length > maxShow ? "," : "";
      lines.push(
        `${padInner}${formatValue(items[i], indent + 1, seen)}${comma}`,
      );
    }
    if (value.length > maxShow) {
      lines.push(
        `${padInner}${C.dim}... ${value.length - maxShow} more items${C.reset}`,
      );
    }
    lines.push(`${pad}]`);
    seen.delete(value);
    return lines.join("\n");
  }

  // Object
  if (typeof value === "object") {
    seen.add(value);
    const typeName = inferObjectType(value as Record<string, any>);
    const keys = Object.keys(value as Record<string, unknown>);

    if (keys.length === 0) {
      seen.delete(value);
      return `${C.magenta}${typeName}${C.reset} {}`;
    }

    const lines: string[] = [];
    lines.push(`${C.magenta}${typeName}${C.reset} {`);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const val = (value as Record<string, unknown>)[key];
      const comma = i < keys.length - 1 ? "," : "";
      lines.push(
        `${padInner}${C.cyan}${key}${C.reset}: ${formatValue(val, indent + 1, seen)}${comma}`,
      );
    }

    lines.push(`${pad}}`);
    seen.delete(value);
    return lines.join("\n");
  }

  return String(value);
}

// ---------------------------------------------------------------------------
// String escaping
// ---------------------------------------------------------------------------

function escapeString(s: string): string {
  if (s.length > 500) {
    return (
      s
        .slice(0, 500)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t") + `... (${s.length} chars)`
    );
  }
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

function inferObjectType(obj: Record<string, any>): string {
  if ("isFile" in obj && "permissions" in obj) return "FileEntry";
  if ("exitCode" in obj && "stdout" in obj && "stderr" in obj)
    return "SpawnResult";
  if ("status" in obj && "statusText" in obj && "body" in obj)
    return "NetResponse";
  if ("alive" in obj && "host" in obj && "time" in obj) return "PingResult";
  if ("os" in obj && "arch" in obj && "platform" in obj) return "SystemInfo";
  if ("lines" in obj && "words" in obj && "chars" in obj && "bytes" in obj)
    return "WcResult";
  if (
    "bytes" in obj &&
    "human" in obj &&
    "files" in obj &&
    "directories" in obj
  )
    return "DiskUsage";
  if ("bytesWritten" in obj && "path" in obj) return "WriteResult";
  if ("ok" in obj && "value" in obj && obj["ok"] === true) return "Result<ok>";
  if ("ok" in obj && "error" in obj && obj["ok"] === false)
    return "Result<err>";
  if ("capabilities" in obj && "has" in obj && "demand" in obj)
    return "CapabilitySet";
  if ("caps" in obj && "derive" in obj && "audit" in obj)
    return "CapabilityContext";
  if ("success" in obj && "auditTrail" in obj && "duration" in obj)
    return "AgentResult";
  if ("pid" in obj && "cpu" in obj && "memory" in obj) return "ProcessInfo";
  if ("file" in obj && "line" in obj && "match" in obj && "content" in obj)
    return "GrepMatch";
  if ("filesystem" in obj && "mountedOn" in obj) return "DfEntry";
  if ("key" in obj && "value" in obj && Object.keys(obj).length === 2)
    return "EnvEntry";
  if ("kind" in obj) {
    // Capability types
    const kind = obj["kind"];
    if (typeof kind === "string" && kind.includes(":")) return "Capability";
  }
  if ("readable" in obj && "writable" in obj && "mode" in obj)
    return "FilePermissions";
  if ("timestamp" in obj && "agentId" in obj && "capability" in obj)
    return "AuditEntry";
  return "";
}

function inferArrayType(arr: any[]): string {
  if (arr.length === 0) return "";
  const first = arr[0];
  if (typeof first === "string") return `string[${arr.length}]`;
  if (typeof first === "number") return `number[${arr.length}]`;
  if (typeof first === "boolean") return `boolean[${arr.length}]`;
  if (first instanceof Date) return `Date[${arr.length}]`;
  if (first && typeof first === "object") {
    const typeName = inferObjectType(first as Record<string, any>);
    if (typeName) return `${typeName}[${arr.length}]`;
  }
  return `Array[${arr.length}]`;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
