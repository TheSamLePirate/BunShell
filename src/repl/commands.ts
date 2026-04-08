/**
 * Command definitions for the BunShell CLI.
 *
 * Each command has a name, description, argument spec, and
 * available flags — used for both execution and autocompletion.
 *
 * @module
 */

/** Argument type for autocompletion context. */
export type ArgType =
  | "path"
  | "pattern"
  | "string"
  | "number"
  | "signal"
  | "url"
  | "key"
  | "command";

/** A single argument definition. */
export interface ArgDef {
  readonly name: string;
  readonly type: ArgType;
  readonly required: boolean;
  readonly description: string;
}

/** A flag definition. */
export interface FlagDef {
  readonly name: string;
  readonly short?: string;
  readonly hasValue: boolean;
  readonly description: string;
  readonly values?: readonly string[];
}

/** Full command definition. */
export interface CommandDef {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly args: readonly ArgDef[];
  readonly flags: readonly FlagDef[];
  readonly category:
    | "filesystem"
    | "process"
    | "network"
    | "env"
    | "text"
    | "system"
    | "pipe"
    | "shell";
}

/**
 * All available commands.
 */
export const COMMANDS: readonly CommandDef[] = [
  // --- Filesystem ---
  {
    name: "ls",
    description: "List directory contents",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: false,
        description: "Directory to list (default: .)",
      },
    ],
    flags: [
      {
        name: "recursive",
        short: "r",
        hasValue: false,
        description: "List recursively",
      },
      {
        name: "hidden",
        short: "a",
        hasValue: false,
        description: "Include hidden files",
      },
      {
        name: "glob",
        short: "g",
        hasValue: true,
        description: "Filter by glob pattern",
      },
      {
        name: "sort",
        short: "s",
        hasValue: true,
        description: "Sort by field",
        values: ["name", "size", "modifiedAt", "extension"],
      },
      { name: "desc", hasValue: false, description: "Sort descending" },
    ],
  },
  {
    name: "cat",
    description: "Read file contents",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "File to read",
      },
    ],
    flags: [],
  },
  {
    name: "stat",
    description: "Get file information",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "File to inspect",
      },
    ],
    flags: [],
  },
  {
    name: "exists",
    description: "Check if path exists",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "Path to check",
      },
    ],
    flags: [],
  },
  {
    name: "find",
    description: "Find files by glob pattern",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "Directory to search",
      },
      {
        name: "pattern",
        type: "pattern",
        required: true,
        description: "Glob pattern",
      },
    ],
    flags: [],
  },
  {
    name: "du",
    description: "Disk usage for a path",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: false,
        description: "Path to measure (default: .)",
      },
    ],
    flags: [],
  },
  {
    name: "mkdir",
    description: "Create directory",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "Directory to create",
      },
    ],
    flags: [],
  },
  {
    name: "write",
    description: "Write text to a file",
    category: "filesystem",
    args: [
      { name: "path", type: "path", required: true, description: "File path" },
      {
        name: "content",
        type: "string",
        required: true,
        description: "Content to write",
      },
    ],
    flags: [],
  },
  {
    name: "rm",
    description: "Remove file or directory",
    category: "filesystem",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "Path to remove",
      },
    ],
    flags: [
      {
        name: "recursive",
        short: "r",
        hasValue: false,
        description: "Remove recursively",
      },
    ],
  },
  {
    name: "cp",
    description: "Copy file or directory",
    category: "filesystem",
    args: [
      { name: "src", type: "path", required: true, description: "Source path" },
      {
        name: "dest",
        type: "path",
        required: true,
        description: "Destination path",
      },
    ],
    flags: [],
  },
  {
    name: "mv",
    description: "Move/rename file or directory",
    category: "filesystem",
    args: [
      { name: "src", type: "path", required: true, description: "Source path" },
      {
        name: "dest",
        type: "path",
        required: true,
        description: "Destination path",
      },
    ],
    flags: [],
  },
  // --- Text ---
  {
    name: "grep",
    description: "Search for pattern in file",
    category: "text",
    args: [
      {
        name: "pattern",
        type: "pattern",
        required: true,
        description: "Search pattern (regex)",
      },
      {
        name: "path",
        type: "path",
        required: true,
        description: "File to search",
      },
    ],
    flags: [
      {
        name: "ignore-case",
        short: "i",
        hasValue: false,
        description: "Case insensitive",
      },
      { name: "max", short: "m", hasValue: true, description: "Max matches" },
      {
        name: "invert",
        short: "v",
        hasValue: false,
        description: "Invert match",
      },
    ],
  },
  {
    name: "head",
    description: "Show first N lines",
    category: "text",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "File to read",
      },
      {
        name: "n",
        type: "number",
        required: false,
        description: "Number of lines (default: 10)",
      },
    ],
    flags: [],
  },
  {
    name: "tail",
    description: "Show last N lines",
    category: "text",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "File to read",
      },
      {
        name: "n",
        type: "number",
        required: false,
        description: "Number of lines (default: 10)",
      },
    ],
    flags: [],
  },
  {
    name: "wc",
    description: "Count lines, words, chars",
    category: "text",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "File to count",
      },
    ],
    flags: [],
  },
  // --- Process ---
  {
    name: "ps",
    description: "List running processes",
    category: "process",
    args: [],
    flags: [],
  },
  {
    name: "kill",
    description: "Send signal to process",
    category: "process",
    args: [
      {
        name: "pid",
        type: "number",
        required: true,
        description: "Process ID",
      },
      {
        name: "signal",
        type: "signal",
        required: false,
        description: "Signal (default: SIGTERM)",
      },
    ],
    flags: [],
  },
  {
    name: "exec",
    aliases: ["run"],
    description: "Execute a command",
    category: "process",
    args: [
      {
        name: "command",
        type: "command",
        required: true,
        description: "Command to run",
      },
    ],
    flags: [],
  },
  // --- Network ---
  {
    name: "fetch",
    description: "HTTP fetch",
    category: "network",
    args: [
      { name: "url", type: "url", required: true, description: "URL to fetch" },
    ],
    flags: [
      {
        name: "method",
        hasValue: true,
        description: "HTTP method",
        values: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      },
    ],
  },
  {
    name: "ping",
    description: "Ping a host",
    category: "network",
    args: [
      {
        name: "host",
        type: "string",
        required: true,
        description: "Host to ping",
      },
    ],
    flags: [],
  },
  // --- Env ---
  {
    name: "env",
    description: "List environment variables",
    category: "env",
    args: [],
    flags: [
      {
        name: "filter",
        short: "f",
        hasValue: true,
        description: "Filter by key pattern",
      },
    ],
  },
  {
    name: "getenv",
    description: "Get an environment variable",
    category: "env",
    args: [
      {
        name: "key",
        type: "key",
        required: true,
        description: "Variable name",
      },
    ],
    flags: [],
  },
  {
    name: "setenv",
    description: "Set an environment variable",
    category: "env",
    args: [
      {
        name: "key",
        type: "key",
        required: true,
        description: "Variable name",
      },
      { name: "value", type: "string", required: true, description: "Value" },
    ],
    flags: [],
  },
  // --- System ---
  {
    name: "uname",
    description: "System information",
    category: "system",
    args: [],
    flags: [],
  },
  {
    name: "uptime",
    description: "System uptime",
    category: "system",
    args: [],
    flags: [],
  },
  {
    name: "whoami",
    description: "Current username",
    category: "system",
    args: [],
    flags: [],
  },
  {
    name: "hostname",
    description: "System hostname",
    category: "system",
    args: [],
    flags: [],
  },
  {
    name: "df",
    description: "Disk space usage",
    category: "system",
    args: [],
    flags: [],
  },
  // --- Pipe operators (used after |) ---
  {
    name: "filter",
    description: "Filter items by field comparison",
    category: "pipe",
    args: [
      {
        name: "expr",
        type: "string",
        required: true,
        description: "e.g. size>1000 or extension=ts",
      },
    ],
    flags: [],
  },
  {
    name: "sortby",
    description: "Sort by a field",
    category: "pipe",
    args: [
      {
        name: "field",
        type: "string",
        required: true,
        description: "Field to sort by",
      },
      {
        name: "order",
        type: "string",
        required: false,
        description: "asc or desc (default: asc)",
      },
    ],
    flags: [],
  },
  {
    name: "take",
    description: "Take first N items",
    category: "pipe",
    args: [{ name: "n", type: "number", required: true, description: "Count" }],
    flags: [],
  },
  {
    name: "skip",
    description: "Skip first N items",
    category: "pipe",
    args: [{ name: "n", type: "number", required: true, description: "Count" }],
    flags: [],
  },
  {
    name: "count",
    description: "Count items",
    category: "pipe",
    args: [],
    flags: [],
  },
  {
    name: "pluck",
    description: "Extract a field from each item",
    category: "pipe",
    args: [
      {
        name: "field",
        type: "string",
        required: true,
        description: "Field name",
      },
    ],
    flags: [],
  },
  {
    name: "uniq",
    description: "Remove duplicate items",
    category: "pipe",
    args: [
      {
        name: "field",
        type: "string",
        required: false,
        description: "Field for uniqueness",
      },
    ],
    flags: [],
  },
  {
    name: "first",
    description: "Get the first item",
    category: "pipe",
    args: [],
    flags: [],
  },
  {
    name: "last",
    description: "Get the last item",
    category: "pipe",
    args: [],
    flags: [],
  },
  {
    name: "tojson",
    description: "Write pipe data as JSON to file",
    category: "pipe",
    args: [
      {
        name: "path",
        type: "path",
        required: true,
        description: "Output file",
      },
    ],
    flags: [],
  },
  // --- Shell builtins ---
  {
    name: "help",
    description: "Show available commands",
    category: "shell",
    args: [
      {
        name: "command",
        type: "command",
        required: false,
        description: "Command to get help for",
      },
    ],
    flags: [],
  },
  {
    name: "cd",
    description: "Change directory",
    category: "shell",
    args: [
      {
        name: "path",
        type: "path",
        required: false,
        description: "Directory (default: ~)",
      },
    ],
    flags: [],
  },
  {
    name: "pwd",
    description: "Print working directory",
    category: "shell",
    args: [],
    flags: [],
  },
  {
    name: "clear",
    description: "Clear the screen",
    category: "shell",
    args: [],
    flags: [],
  },
  {
    name: "exit",
    aliases: ["quit"],
    description: "Exit the shell",
    category: "shell",
    args: [],
    flags: [],
  },
  {
    name: "caps",
    description: "Show current capabilities",
    category: "shell",
    args: [],
    flags: [],
  },
  {
    name: "audit",
    description: "Show recent audit entries",
    category: "shell",
    args: [
      {
        name: "n",
        type: "number",
        required: false,
        description: "Number of entries (default: 20)",
      },
    ],
    flags: [
      {
        name: "capability",
        hasValue: true,
        description: "Filter by capability",
      },
      {
        name: "result",
        hasValue: true,
        description: "Filter by result",
        values: ["success", "denied", "error"],
      },
    ],
  },
];

/** Lookup a command by name or alias. */
export function findCommand(name: string): CommandDef | undefined {
  return COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
}

/** Common file entry fields for pipe autocompletion. */
export const FILE_ENTRY_FIELDS = [
  "name",
  "path",
  "size",
  "isDirectory",
  "isFile",
  "isSymlink",
  "extension",
  "modifiedAt",
  "createdAt",
  "accessedAt",
] as const;

/** Common process fields for pipe autocompletion. */
export const PROCESS_FIELDS = [
  "pid",
  "ppid",
  "name",
  "command",
  "user",
  "cpu",
  "memory",
  "state",
] as const;
