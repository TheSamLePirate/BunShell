// Function signature registry for the web REPL — mirrors src/repl/signatures.ts
// Organized by category for both hint display and API reference browsing.

export interface FunctionSignature {
  readonly name: string;
  readonly signature: string;
  readonly description: string;
  readonly category: string;
}

export const SIGNATURES: FunctionSignature[] = [
  // --- Filesystem ---
  {
    name: "ls",
    signature: "(ctx, path?, options?) → FileEntry[]",
    description: "List directory",
    category: "Filesystem",
  },
  {
    name: "cat",
    signature: "(ctx, path) → string",
    description: "Read file contents",
    category: "Filesystem",
  },
  {
    name: "stat",
    signature: "(ctx, path) → FileEntry",
    description: "File info",
    category: "Filesystem",
  },
  {
    name: "exists",
    signature: "(ctx, path) → boolean",
    description: "Check if path exists",
    category: "Filesystem",
  },
  {
    name: "mkdir",
    signature: "(ctx, path) → void",
    description: "Create directory",
    category: "Filesystem",
  },
  {
    name: "write",
    signature: "(ctx, path, data) → WriteResult",
    description: "Write file",
    category: "Filesystem",
  },
  {
    name: "readJson",
    signature: "<T>(ctx, path) → T",
    description: "Read JSON file",
    category: "Filesystem",
  },
  {
    name: "writeJson",
    signature: "(ctx, path, data) → WriteResult",
    description: "Write JSON file",
    category: "Filesystem",
  },
  {
    name: "rm",
    signature: "(ctx, path, opts?) → void",
    description: "Remove file/dir",
    category: "Filesystem",
  },
  {
    name: "cp",
    signature: "(ctx, src, dest) → void",
    description: "Copy",
    category: "Filesystem",
  },
  {
    name: "mv",
    signature: "(ctx, src, dest) → void",
    description: "Move/rename",
    category: "Filesystem",
  },
  {
    name: "find",
    signature: "(ctx, path, pattern?) → FileEntry[]",
    description: "Find files recursively",
    category: "Filesystem",
  },
  {
    name: "du",
    signature: "(ctx, path) → DiskUsage",
    description: "Disk usage",
    category: "Filesystem",
  },
  {
    name: "chmod",
    signature: "(ctx, path, mode) → void",
    description: "Change permissions",
    category: "Filesystem",
  },
  {
    name: "createSymlink",
    signature: "(ctx, target, link) → void",
    description: "Create symlink",
    category: "Filesystem",
  },
  {
    name: "readLink",
    signature: "(ctx, path) → string",
    description: "Read symlink target",
    category: "Filesystem",
  },
  {
    name: "touch",
    signature: "(ctx, path) → void",
    description: "Touch file",
    category: "Filesystem",
  },
  {
    name: "append",
    signature: "(ctx, path, data) → WriteResult",
    description: "Append to file",
    category: "Filesystem",
  },
  {
    name: "truncate",
    signature: "(ctx, path, size?) → void",
    description: "Truncate file",
    category: "Filesystem",
  },
  {
    name: "realPath",
    signature: "(ctx, path) → string",
    description: "Resolve real path",
    category: "Filesystem",
  },
  {
    name: "watchPath",
    signature: "(ctx, path, cb) → Disposable",
    description: "Watch for changes",
    category: "Filesystem",
  },
  {
    name: "globFiles",
    signature: "(ctx, pattern, opts?) → FileEntry[]",
    description: "Glob match files",
    category: "Filesystem",
  },

  // --- Process ---
  {
    name: "ps",
    signature: "(ctx) → ProcessInfo[]",
    description: "List processes",
    category: "Process",
  },
  {
    name: "kill",
    signature: "(ctx, pid, signal?) → boolean",
    description: "Kill process",
    category: "Process",
  },
  {
    name: "spawn",
    signature: "(ctx, cmd, args?, opts?) → SpawnResult",
    description: "Spawn subprocess",
    category: "Process",
  },
  {
    name: "exec",
    signature: "(ctx, command) → SpawnResult",
    description: "Execute shell command",
    category: "Process",
  },

  // --- Network ---
  {
    name: "netFetch",
    signature: "(ctx, url, opts?) → NetResponse",
    description: "HTTP fetch",
    category: "Network",
  },
  {
    name: "ping",
    signature: "(ctx, host, opts?) → PingResult",
    description: "Ping host",
    category: "Network",
  },
  {
    name: "download",
    signature: "(ctx, url, dest) → WriteResult",
    description: "Download file",
    category: "Network",
  },
  {
    name: "dig",
    signature: "(ctx, domain, type?) → DnsResult",
    description: "DNS lookup",
    category: "Network",
  },
  {
    name: "serve",
    signature: "(ctx, opts) → ServerHandle",
    description: "Start HTTP server",
    category: "Network",
  },
  {
    name: "wsConnect",
    signature: "(ctx, url, opts?) → TypedWebSocket",
    description: "WebSocket connect",
    category: "Network",
  },

  // --- Environment ---
  {
    name: "env",
    signature: "(ctx) → EnvEntry[]",
    description: "List env vars",
    category: "Environment",
  },
  {
    name: "getEnv",
    signature: "(ctx, key) → string | undefined",
    description: "Get env var",
    category: "Environment",
  },
  {
    name: "setEnv",
    signature: "(ctx, key, value) → void",
    description: "Set env var",
    category: "Environment",
  },

  // --- Text ---
  {
    name: "grep",
    signature: "(ctx, pattern, path, opts?) → GrepMatch[]",
    description: "Search text",
    category: "Text",
  },
  {
    name: "sort",
    signature: "(items, opts?) → T[]",
    description: "Sort array",
    category: "Text",
  },
  {
    name: "uniq",
    signature: "(items) → T[]",
    description: "Unique values",
    category: "Text",
  },
  {
    name: "head",
    signature: "(items, n?) → T[]",
    description: "First N items",
    category: "Text",
  },
  {
    name: "tail",
    signature: "(items, n?) → T[]",
    description: "Last N items",
    category: "Text",
  },
  {
    name: "wc",
    signature: "(text) → WcResult",
    description: "Word/line/char count",
    category: "Text",
  },

  // --- System ---
  {
    name: "uname",
    signature: "(ctx) → SystemInfo",
    description: "System info",
    category: "System",
  },
  {
    name: "uptime",
    signature: "(ctx) → number",
    description: "System uptime",
    category: "System",
  },
  {
    name: "whoami",
    signature: "(ctx) → string",
    description: "Current user",
    category: "System",
  },
  {
    name: "hostname",
    signature: "(ctx) → string",
    description: "Hostname",
    category: "System",
  },
  {
    name: "df",
    signature: "(ctx) → DfEntry[]",
    description: "Disk free space",
    category: "System",
  },

  // --- Crypto ---
  {
    name: "hash",
    signature: "(data, algo?) → HashResult",
    description: "Hash data",
    category: "Crypto",
  },
  {
    name: "hmac",
    signature: "(data, key, algo?) → string",
    description: "HMAC signature",
    category: "Crypto",
  },
  {
    name: "randomBytes",
    signature: "(n) → Uint8Array",
    description: "Random bytes",
    category: "Crypto",
  },
  {
    name: "randomUUID",
    signature: "() → string",
    description: "Random UUID",
    category: "Crypto",
  },
  {
    name: "randomInt",
    signature: "(min, max) → number",
    description: "Random integer",
    category: "Crypto",
  },
  {
    name: "encrypt",
    signature: "(data, key) → EncryptResult",
    description: "AES-256-GCM encrypt",
    category: "Crypto",
  },
  {
    name: "decrypt",
    signature: "(encrypted, key) → string",
    description: "AES-256-GCM decrypt",
    category: "Crypto",
  },

  // --- Archive ---
  {
    name: "tar",
    signature: "(ctx, paths, dest) → WriteResult",
    description: "Create tar archive",
    category: "Archive",
  },
  {
    name: "untar",
    signature: "(ctx, archive, dest) → FileEntry[]",
    description: "Extract tar archive",
    category: "Archive",
  },
  {
    name: "zip",
    signature: "(ctx, paths, dest) → WriteResult",
    description: "Create zip archive",
    category: "Archive",
  },
  {
    name: "unzip",
    signature: "(ctx, archive, dest) → FileEntry[]",
    description: "Extract zip archive",
    category: "Archive",
  },
  {
    name: "gzip",
    signature: "(ctx, path) → WriteResult",
    description: "Gzip compress",
    category: "Archive",
  },
  {
    name: "gunzip",
    signature: "(ctx, path) → WriteResult",
    description: "Gzip decompress",
    category: "Archive",
  },

  // --- Data ---
  {
    name: "parseJSON",
    signature: "<T>(text) → T",
    description: "Parse JSON string",
    category: "Data",
  },
  {
    name: "formatJSON",
    signature: "(data, indent?) → string",
    description: "Format as JSON",
    category: "Data",
  },
  {
    name: "parseCSV",
    signature: "(text, opts?) → Record[]",
    description: "Parse CSV",
    category: "Data",
  },
  {
    name: "formatCSV",
    signature: "(rows, opts?) → string",
    description: "Format as CSV",
    category: "Data",
  },
  {
    name: "parseTOML",
    signature: "(text) → Record",
    description: "Parse TOML",
    category: "Data",
  },
  {
    name: "base64Encode",
    signature: "(data) → string",
    description: "Base64 encode",
    category: "Data",
  },
  {
    name: "base64Decode",
    signature: "(text) → Uint8Array",
    description: "Base64 decode",
    category: "Data",
  },
  {
    name: "base64DecodeString",
    signature: "(text) → string",
    description: "Base64 decode to string",
    category: "Data",
  },

  // --- Database ---
  {
    name: "dbOpen",
    signature: "(ctx, path) → TypedDatabase",
    description: "Open SQLite database",
    category: "Database",
  },
  {
    name: "dbQuery",
    signature: "(ctx, db, sql, params?) → Row[]",
    description: "Query database",
    category: "Database",
  },
  {
    name: "dbExec",
    signature: "(ctx, db, sql, params?) → void",
    description: "Execute SQL",
    category: "Database",
  },

  // --- Git ---
  {
    name: "gitStatus",
    signature: "(ctx, path?) → GitStatus",
    description: "Git status",
    category: "Git",
  },
  {
    name: "gitLog",
    signature: "(ctx, opts?) → GitCommit[]",
    description: "Git log",
    category: "Git",
  },
  {
    name: "gitDiff",
    signature: "(ctx, opts?) → string",
    description: "Git diff",
    category: "Git",
  },
  {
    name: "gitBranch",
    signature: "(ctx, opts?) → GitBranches",
    description: "Git branches",
    category: "Git",
  },
  {
    name: "gitAdd",
    signature: "(ctx, paths) → void",
    description: "Git add",
    category: "Git",
  },
  {
    name: "gitCommit",
    signature: "(ctx, message, opts?) → string",
    description: "Git commit",
    category: "Git",
  },
  {
    name: "gitPush",
    signature: "(ctx, opts?) → void",
    description: "Git push",
    category: "Git",
  },
  {
    name: "gitPull",
    signature: "(ctx, opts?) → void",
    description: "Git pull",
    category: "Git",
  },
  {
    name: "gitClone",
    signature: "(ctx, url, dest?) → void",
    description: "Git clone",
    category: "Git",
  },
  {
    name: "gitStash",
    signature: "(ctx, action?) → string",
    description: "Git stash",
    category: "Git",
  },

  // --- OS ---
  {
    name: "openUrl",
    signature: "(ctx, url) → void",
    description: "Open URL in browser",
    category: "OS",
  },
  {
    name: "openFile",
    signature: "(ctx, path) → void",
    description: "Open file with default app",
    category: "OS",
  },
  {
    name: "notify",
    signature: "(ctx, title, body?) → void",
    description: "Desktop notification",
    category: "OS",
  },
  {
    name: "clipboard",
    signature: "(ctx, action, text?) → string | void",
    description: "Clipboard read/write",
    category: "OS",
  },

  // --- Schedule ---
  {
    name: "sleep",
    signature: "(ms) → Promise<void>",
    description: "Async delay",
    category: "Schedule",
  },
  {
    name: "interval",
    signature: "(fn, ms) → Disposable",
    description: "Repeated execution",
    category: "Schedule",
  },
  {
    name: "timeout",
    signature: "(fn, ms) → Disposable",
    description: "Delayed execution",
    category: "Schedule",
  },
  {
    name: "debounce",
    signature: "(fn, ms) → Function",
    description: "Debounce calls",
    category: "Schedule",
  },
  {
    name: "throttle",
    signature: "(fn, ms) → Function",
    description: "Throttle calls",
    category: "Schedule",
  },
  {
    name: "retry",
    signature: "(fn, opts?) → T",
    description: "Retry with backoff",
    category: "Schedule",
  },

  // --- User ---
  {
    name: "currentUser",
    signature: "(ctx) → CurrentUser",
    description: "Current user info",
    category: "User",
  },
  {
    name: "users",
    signature: "(ctx) → string[]",
    description: "System users",
    category: "User",
  },
  {
    name: "groups",
    signature: "(ctx) → string[]",
    description: "System groups",
    category: "User",
  },

  // --- Docker ---
  {
    name: "dockerRun",
    signature: "(ctx, image, cmd?, opts?) → DockerRunResult",
    description: "Run container",
    category: "Docker",
  },
  {
    name: "dockerExec",
    signature: "(ctx, container, cmd) → SpawnResult",
    description: "Exec in container",
    category: "Docker",
  },
  {
    name: "dockerVfsRun",
    signature: "(ctx, vfs, image, cmd?, opts?) → DockerVfsRunResult",
    description: "Run with VFS sync",
    category: "Docker",
  },
  {
    name: "dockerBuild",
    signature: "(ctx, path, opts?) → string",
    description: "Build image",
    category: "Docker",
  },
  {
    name: "dockerPull",
    signature: "(ctx, image) → void",
    description: "Pull image",
    category: "Docker",
  },
  {
    name: "dockerImages",
    signature: "(ctx) → DockerImage[]",
    description: "List images",
    category: "Docker",
  },
  {
    name: "dockerPs",
    signature: "(ctx, all?) → DockerContainer[]",
    description: "List containers",
    category: "Docker",
  },
  {
    name: "dockerStop",
    signature: "(ctx, container) → void",
    description: "Stop container",
    category: "Docker",
  },
  {
    name: "dockerRm",
    signature: "(ctx, container) → void",
    description: "Remove container",
    category: "Docker",
  },
  {
    name: "dockerLogs",
    signature: "(ctx, container, opts?) → string",
    description: "Container logs",
    category: "Docker",
  },
  {
    name: "dockerSpawnBackground",
    signature: "(ctx, image, opts?) → string",
    description: "Start daemon container",
    category: "Docker",
  },
  {
    name: "dockerRunStreaming",
    signature: "(ctx, image, cmd?) → AsyncIterable",
    description: "Streaming container output",
    category: "Docker",
  },
  {
    name: "dockerRunProxied",
    signature: "(ctx, image, cmd?, opts?) → DockerRunResult",
    description: "Run with egress proxy",
    category: "Docker",
  },
  {
    name: "startEgressProxy",
    signature: "(ctx, port) → ProxyHandle",
    description: "Start egress proxy",
    category: "Docker",
  },

  // --- Pipe ---
  {
    name: "pipe",
    signature: "(source, ...stages) → Promise<T>",
    description: "Array data pipeline",
    category: "Pipe",
  },
  {
    name: "filter",
    signature: "(pred) → PipeStage",
    description: "Filter items",
    category: "Pipe",
  },
  {
    name: "map",
    signature: "(fn) → PipeStage",
    description: "Transform items",
    category: "Pipe",
  },
  {
    name: "reduce",
    signature: "(fn, init) → PipeStage",
    description: "Reduce to single value",
    category: "Pipe",
  },
  {
    name: "take",
    signature: "(n) → PipeStage",
    description: "Take first N",
    category: "Pipe",
  },
  {
    name: "skip",
    signature: "(n) → PipeStage",
    description: "Skip first N",
    category: "Pipe",
  },
  {
    name: "sortBy",
    signature: "(key, desc?) → PipeStage",
    description: "Sort by key",
    category: "Pipe",
  },
  {
    name: "groupBy",
    signature: "(key) → PipeStage",
    description: "Group by key",
    category: "Pipe",
  },
  {
    name: "unique",
    signature: "(key?) → PipeStage",
    description: "Unique values",
    category: "Pipe",
  },
  {
    name: "count",
    signature: "() → PipeStage",
    description: "Count items",
    category: "Pipe",
  },
  {
    name: "first",
    signature: "() → PipeStage",
    description: "First item",
    category: "Pipe",
  },
  {
    name: "last",
    signature: "() → PipeStage",
    description: "Last item",
    category: "Pipe",
  },
  {
    name: "pluck",
    signature: "(key) → PipeStage",
    description: "Extract key values",
    category: "Pipe",
  },
  {
    name: "toTable",
    signature: "(data, opts?) → string",
    description: "Format as table",
    category: "Pipe",
  },
  {
    name: "toBarChart",
    signature: "(data, opts?) → string",
    description: "ASCII bar chart",
    category: "Pipe",
  },
  {
    name: "toSparkline",
    signature: "(values) → string",
    description: "Unicode sparkline",
    category: "Pipe",
  },
  {
    name: "toHistogram",
    signature: "(values, buckets?) → string",
    description: "ASCII histogram",
    category: "Pipe",
  },

  // --- Secrets & Auth ---
  {
    name: "createSecretStore",
    signature: "(masterKey) → SecretStore",
    description: "Encrypted secret store",
    category: "Secrets",
  },
  {
    name: "deriveKey",
    signature: "(password, salt?) → Uint8Array",
    description: "PBKDF2 key derivation",
    category: "Secrets",
  },
  {
    name: "createStateStore",
    signature: "() → StateStore",
    description: "Persistent KV store",
    category: "Secrets",
  },
  {
    name: "authBearer",
    signature: "(ctx, secrets, key) → Headers",
    description: "Bearer token auth",
    category: "Secrets",
  },
  {
    name: "authedFetch",
    signature: "(ctx, secrets, key, url) → Response",
    description: "Authenticated fetch",
    category: "Secrets",
  },
  {
    name: "secretFromEnv",
    signature: "(ctx, secrets, key) → void",
    description: "Import env to secrets",
    category: "Secrets",
  },

  // --- Agent ---
  {
    name: "runAgent",
    signature: "(config) → AgentResult",
    description: "Run sandboxed agent",
    category: "Agent",
  },
  {
    name: "createContext",
    signature: "(opts) → CapabilityContext",
    description: "Create capability context",
    category: "Agent",
  },
  {
    name: "capabilities",
    signature: "() → CapabilityBuilder",
    description: "Fluent capability builder",
    category: "Agent",
  },
  {
    name: "validatePlugin",
    signature: "(source) → ValidationResult",
    description: "Validate plugin source",
    category: "Agent",
  },
  {
    name: "createPluginRegistry",
    signature: "() → PluginRegistry",
    description: "Create plugin registry",
    category: "Agent",
  },
];

const SIGNATURE_MAP = new Map(SIGNATURES.map((s) => [s.name, s]));

export function getSignature(name: string): FunctionSignature | null {
  return SIGNATURE_MAP.get(name) ?? null;
}

export function getCompletions(prefix: string): FunctionSignature[] {
  if (!prefix) return [];
  const lower = prefix.toLowerCase();
  return SIGNATURES.filter((s) => s.name.toLowerCase().startsWith(lower));
}

export function getCategories(): string[] {
  return [...new Set(SIGNATURES.map((s) => s.category))];
}

export function getByCategory(category: string): FunctionSignature[] {
  return SIGNATURES.filter((s) => s.category === category);
}
