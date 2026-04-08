/**
 * Output formatting for the CLI shell.
 *
 * Renders structured data types as readable terminal output
 * with colors and alignment.
 *
 * @module
 */

import type {
  FileEntry,
  ProcessInfo,
  GrepMatch,
  WcResult,
  DiskUsage,
  SpawnResult,
  PingResult,
  SystemInfo,
  DfEntry,
  EnvEntry,
} from "../wrappers/types";
import type { NetResponse } from "../wrappers/types";

// ---------------------------------------------------------------------------
// ANSI color helpers
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
  white: "\x1b[37m",
};

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function rpad(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function humanSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatFileEntries(entries: FileEntry[]): string {
  if (entries.length === 0) return `${C.dim}(empty)${C.reset}`;

  const lines: string[] = [];
  for (const e of entries) {
    const icon = e.isDirectory
      ? `${C.blue}${C.bold}d${C.reset}`
      : e.isSymlink
        ? `${C.cyan}l${C.reset}`
        : `${C.dim}-${C.reset}`;
    const perms = `${C.dim}${e.permissions.modeString}${C.reset}`;
    const size = rpad(humanSize(e.size), 10);
    const date = `${C.dim}${e.modifiedAt.toISOString().slice(0, 16).replace("T", " ")}${C.reset}`;
    const name = e.isDirectory
      ? `${C.blue}${C.bold}${e.name}/${C.reset}`
      : e.isSymlink
        ? `${C.cyan}${e.name}${C.reset}`
        : e.name;
    lines.push(`${icon}${perms}  ${size}  ${date}  ${name}`);
  }
  lines.push(
    `${C.dim}${entries.length} item${entries.length === 1 ? "" : "s"}${C.reset}`,
  );
  return lines.join("\n");
}

export function formatFileEntry(entry: FileEntry): string {
  const lines = [
    `${C.bold}${entry.name}${C.reset}`,
    `  Path:        ${entry.path}`,
    `  Size:        ${humanSize(entry.size)} (${entry.size} bytes)`,
    `  Type:        ${entry.isDirectory ? "directory" : entry.isFile ? "file" : "symlink"}`,
    `  Permissions: ${entry.permissions.modeString} (${entry.permissions.mode.toString(8)})`,
    `  Extension:   ${entry.extension ?? "(none)"}`,
    `  Modified:    ${entry.modifiedAt.toISOString()}`,
    `  Created:     ${entry.createdAt.toISOString()}`,
  ];
  return lines.join("\n");
}

export function formatProcesses(procs: ProcessInfo[]): string {
  if (procs.length === 0) return `${C.dim}(no processes)${C.reset}`;

  const header = `${C.bold}${pad("PID", 8)} ${pad("USER", 12)} ${rpad("CPU%", 6)} ${rpad("MEM%", 6)} ${pad("STATE", 8)} ${pad("COMMAND", 30)}${C.reset}`;
  const lines = [header];
  for (const p of procs.slice(0, 50)) {
    lines.push(
      `${pad(String(p.pid), 8)} ${pad(p.user, 12)} ${rpad(p.cpu.toFixed(1), 6)} ${rpad(p.memory.toFixed(1), 6)} ${pad(p.state, 8)} ${p.name}`,
    );
  }
  if (procs.length > 50) {
    lines.push(`${C.dim}... and ${procs.length - 50} more${C.reset}`);
  }
  return lines.join("\n");
}

export function formatGrepMatches(matches: GrepMatch[]): string {
  if (matches.length === 0) return `${C.dim}(no matches)${C.reset}`;

  const lines: string[] = [];
  for (const m of matches) {
    const loc = `${C.magenta}${m.file ?? "stdin"}${C.reset}:${C.green}${m.line}${C.reset}:${C.dim}${m.column}${C.reset}`;
    // Highlight the match within the content
    const highlighted = m.content.replace(
      m.match,
      `${C.red}${C.bold}${m.match}${C.reset}`,
    );
    lines.push(`${loc}: ${highlighted}`);
  }
  lines.push(
    `${C.dim}${matches.length} match${matches.length === 1 ? "" : "es"}${C.reset}`,
  );
  return lines.join("\n");
}

export function formatWc(result: WcResult): string {
  return `  Lines: ${result.lines}\n  Words: ${result.words}\n  Chars: ${result.chars}\n  Bytes: ${result.bytes}`;
}

export function formatDiskUsage(du: DiskUsage): string {
  return [
    `${C.bold}${du.path}${C.reset}`,
    `  Total:       ${du.human} (${du.bytes} bytes)`,
    `  Files:       ${du.files}`,
    `  Directories: ${du.directories}`,
  ].join("\n");
}

export function formatSpawnResult(result: SpawnResult): string {
  const status = result.success
    ? `${C.green}OK${C.reset}`
    : `${C.red}FAIL (${result.exitCode})${C.reset}`;
  const lines = [
    `${C.dim}$ ${result.command} ${result.args.join(" ")}${C.reset}  ${status}  ${C.dim}(${result.duration.toFixed(0)}ms)${C.reset}`,
  ];
  if (result.stdout.trim()) lines.push(result.stdout.trimEnd());
  if (result.stderr.trim())
    lines.push(`${C.red}${result.stderr.trimEnd()}${C.reset}`);
  return lines.join("\n");
}

export function formatNetResponse(resp: NetResponse): string {
  const statusColor =
    resp.status < 300 ? C.green : resp.status < 400 ? C.yellow : C.red;
  const lines = [
    `${statusColor}${resp.status} ${resp.statusText}${C.reset}  ${C.dim}(${resp.duration.toFixed(0)}ms)${C.reset}`,
    `${C.dim}URL: ${resp.url}${C.reset}`,
  ];
  if (typeof resp.body === "string") {
    lines.push(resp.body.slice(0, 2000));
  } else {
    lines.push(JSON.stringify(resp.body, null, 2).slice(0, 2000));
  }
  return lines.join("\n");
}

export function formatPing(result: PingResult): string {
  if (result.alive) {
    return `${C.green}PONG${C.reset} ${result.host} — ${result.time}ms`;
  }
  return `${C.red}TIMEOUT${C.reset} ${result.host}`;
}

export function formatSystemInfo(info: SystemInfo): string {
  return [
    `  OS:       ${info.os}`,
    `  Hostname: ${info.hostname}`,
    `  Release:  ${info.release}`,
    `  Arch:     ${info.arch}`,
    `  Platform: ${info.platform}`,
  ].join("\n");
}

export function formatDf(entries: DfEntry[]): string {
  const header = `${C.bold}${pad("FILESYSTEM", 25)} ${rpad("SIZE", 8)} ${rpad("USED", 8)} ${rpad("AVAIL", 8)} ${rpad("USE%", 6)} MOUNTED ON${C.reset}`;
  const lines = [header];
  for (const e of entries) {
    lines.push(
      `${pad(e.filesystem, 25)} ${rpad(e.size, 8)} ${rpad(e.used, 8)} ${rpad(e.available, 8)} ${rpad(e.usePercent, 6)} ${e.mountedOn}`,
    );
  }
  return lines.join("\n");
}

export function formatEnvEntries(entries: EnvEntry[]): string {
  const lines: string[] = [];
  for (const e of entries) {
    lines.push(`${C.cyan}${e.key}${C.reset}=${e.value}`);
  }
  return lines.join("\n");
}

/**
 * Format any value as readable output.
 * Auto-detects known types and applies the right formatter.
 */
export function formatAuto(value: unknown): string {
  if (value === null || value === undefined) return `${C.dim}(null)${C.reset}`;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean")
    return value ? `${C.green}true${C.reset}` : `${C.red}false${C.reset}`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${C.dim}(empty)${C.reset}`;
    const first = value[0];
    // Detect FileEntry[]
    if (
      first &&
      typeof first === "object" &&
      "isFile" in first &&
      "permissions" in first
    ) {
      return formatFileEntries(value as FileEntry[]);
    }
    // Detect ProcessInfo[]
    if (
      first &&
      typeof first === "object" &&
      "pid" in first &&
      "cpu" in first
    ) {
      return formatProcesses(value as ProcessInfo[]);
    }
    // Detect GrepMatch[]
    if (
      first &&
      typeof first === "object" &&
      "line" in first &&
      "match" in first &&
      "content" in first
    ) {
      return formatGrepMatches(value as GrepMatch[]);
    }
    // Detect DfEntry[]
    if (
      first &&
      typeof first === "object" &&
      "filesystem" in first &&
      "mountedOn" in first
    ) {
      return formatDf(value as DfEntry[]);
    }
    // Detect EnvEntry[]
    if (
      first &&
      typeof first === "object" &&
      "key" in first &&
      "value" in first &&
      Object.keys(first).length === 2
    ) {
      return formatEnvEntries(value as EnvEntry[]);
    }
    // Detect string[]
    if (typeof first === "string") {
      return value.join("\n");
    }
    // Generic array
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "object") {
    // Detect specific types
    const obj = value as Record<string, unknown>;
    if ("isFile" in obj && "permissions" in obj)
      return formatFileEntry(obj as unknown as FileEntry);
    if ("exitCode" in obj && "stdout" in obj)
      return formatSpawnResult(obj as unknown as SpawnResult);
    if ("status" in obj && "statusText" in obj && "body" in obj)
      return formatNetResponse(obj as unknown as NetResponse);
    if ("alive" in obj && "host" in obj)
      return formatPing(obj as unknown as PingResult);
    if ("os" in obj && "arch" in obj && "platform" in obj)
      return formatSystemInfo(obj as unknown as SystemInfo);
    if ("lines" in obj && "words" in obj && "chars" in obj)
      return formatWc(obj as unknown as WcResult);
    if ("bytes" in obj && "human" in obj && "files" in obj)
      return formatDiskUsage(obj as unknown as DiskUsage);
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}
