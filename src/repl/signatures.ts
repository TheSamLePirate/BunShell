/**
 * Static function signature registry for the REPL.
 *
 * Provides parameter hints when the user types a known function name.
 * Shows types, parameter names, and return types.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Signature hint for a function. */
export interface FunctionSignature {
  readonly signature: string;
  readonly description: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const SIGNATURES = new Map<string, FunctionSignature>([
  // Filesystem
  [
    "ls",
    {
      signature: "(ctx, path?: string, options?: LsOptions) → FileEntry[]",
      description: "List directory",
    },
  ],
  [
    "cat",
    { signature: "(ctx, path: string) → string", description: "Read file" },
  ],
  [
    "stat",
    { signature: "(ctx, path: string) → FileEntry", description: "File info" },
  ],
  [
    "exists",
    { signature: "(ctx, path: string) → boolean", description: "Check path" },
  ],
  [
    "mkdir",
    {
      signature: "(ctx, path: string) → void",
      description: "Create directory",
    },
  ],
  [
    "write",
    {
      signature:
        "(ctx, path: string, data: string | Uint8Array | object) → WriteResult",
      description: "Write file",
    },
  ],
  [
    "readJson",
    { signature: "<T>(ctx, path: string) → T", description: "Read JSON" },
  ],
  [
    "writeJson",
    {
      signature: "(ctx, path: string, data: unknown) → WriteResult",
      description: "Write JSON",
    },
  ],
  [
    "rm",
    {
      signature: "(ctx, path: string, opts?: { recursive? }) → void",
      description: "Remove",
    },
  ],
  [
    "cp",
    {
      signature: "(ctx, src: string, dest: string) → void",
      description: "Copy",
    },
  ],
  [
    "mv",
    {
      signature: "(ctx, src: string, dest: string) → void",
      description: "Move",
    },
  ],
  [
    "find",
    {
      signature: "(ctx, path: string, pattern: string) → FileEntry[]",
      description: "Find by glob",
    },
  ],
  [
    "du",
    { signature: "(ctx, path: string) → DiskUsage", description: "Disk usage" },
  ],
  [
    "chmod",
    {
      signature: "(ctx, path: string, mode: number) → void",
      description: "Change permissions",
    },
  ],
  [
    "createSymlink",
    {
      signature: "(ctx, target: string, path: string) → void",
      description: "Create symlink",
    },
  ],
  [
    "readLink",
    {
      signature: "(ctx, path: string) → string",
      description: "Read symlink target",
    },
  ],
  [
    "touch",
    {
      signature: "(ctx, path: string) → void",
      description: "Create/update timestamps",
    },
  ],
  [
    "append",
    {
      signature: "(ctx, path: string, data: string | Uint8Array) → void",
      description: "Append to file",
    },
  ],
  [
    "truncate",
    {
      signature: "(ctx, path: string, size?: number) → void",
      description: "Truncate file",
    },
  ],
  [
    "realPath",
    {
      signature: "(ctx, path: string) → string",
      description: "Resolve symlinks",
    },
  ],
  [
    "watchPath",
    {
      signature:
        "(ctx, path: string, cb: (e: WatchEvent) → void) → { close() }",
      description: "Watch for changes",
    },
  ],
  [
    "globFiles",
    {
      signature: "(ctx, pattern: string, cwd?: string) → string[]",
      description: "Glob search",
    },
  ],

  // Process
  ["ps", { signature: "(ctx) → ProcessInfo[]", description: "List processes" }],
  [
    "kill",
    {
      signature: "(ctx, pid: number, signal?: string) → boolean",
      description: "Kill process",
    },
  ],
  [
    "spawn",
    {
      signature: "(ctx, cmd: string, args?: string[], opts?) → SpawnResult",
      description: "Spawn process",
    },
  ],
  [
    "exec",
    {
      signature: "(ctx, cmd: string, args?: string[]) → string",
      description: "Execute command",
    },
  ],

  // Network
  [
    "netFetch",
    {
      signature: "<T>(ctx, url: string, opts?: RequestInit) → NetResponse<T>",
      description: "HTTP fetch",
    },
  ],
  [
    "ping",
    { signature: "(ctx, host: string) → PingResult", description: "Ping host" },
  ],
  [
    "download",
    {
      signature: "(ctx, url: string, dest: string) → WriteResult",
      description: "Download file",
    },
  ],
  [
    "dig",
    {
      signature: "(ctx, domain: string, type?: string) → DnsRecord[]",
      description: "DNS lookup",
    },
  ],
  [
    "serve",
    {
      signature: "(ctx, opts: ServeOptions) → ServerHandle",
      description: "Start HTTP server",
    },
  ],
  [
    "wsConnect",
    {
      signature: "(ctx, url: string) → TypedWebSocket",
      description: "WebSocket connect",
    },
  ],

  // Env
  ["env", { signature: "(ctx) → EnvEntry[]", description: "List env vars" }],
  [
    "getEnv",
    {
      signature: "(ctx, key: string) → string | undefined",
      description: "Get env var",
    },
  ],
  [
    "setEnv",
    {
      signature: "(ctx, key: string, value: string) → void",
      description: "Set env var",
    },
  ],

  // Text
  [
    "grep",
    {
      signature:
        "(ctx, pattern: string | RegExp, path: string | null, opts?) → GrepMatch[]",
      description: "Search pattern",
    },
  ],
  [
    "sort",
    { signature: "(text: string, opts?) → string", description: "Sort lines" },
  ],
  [
    "uniq",
    {
      signature: "(text: string, opts?) → string",
      description: "Remove duplicates",
    },
  ],
  [
    "head",
    {
      signature: "(text: string, n?: number) → string",
      description: "First N lines",
    },
  ],
  [
    "tail",
    {
      signature: "(text: string, n?: number) → string",
      description: "Last N lines",
    },
  ],
  ["wc", { signature: "(text: string) → WcResult", description: "Word count" }],

  // System
  ["uname", { signature: "(ctx) → SystemInfo", description: "System info" }],
  ["uptime", { signature: "(ctx) → number", description: "Uptime in seconds" }],
  ["whoami", { signature: "(ctx) → string", description: "Current username" }],
  ["hostname", { signature: "(ctx) → string", description: "System hostname" }],
  ["df", { signature: "(ctx) → DfEntry[]", description: "Disk space" }],

  // Crypto
  [
    "hash",
    {
      signature:
        "(data: string | Uint8Array, algo?: HashAlgorithm) → HashResult",
      description: "Hash data",
    },
  ],
  [
    "hmac",
    {
      signature:
        "(data: string | Uint8Array, key: string | Uint8Array, algo?) → HashResult",
      description: "HMAC",
    },
  ],
  [
    "randomBytes",
    { signature: "(n: number) → Uint8Array", description: "Random bytes" },
  ],
  ["randomUUID", { signature: "() → string", description: "Random UUID v4" }],
  [
    "randomInt",
    {
      signature: "(min: number, max: number) → number",
      description: "Random int [min, max)",
    },
  ],
  [
    "encrypt",
    {
      signature: "(data: string | Uint8Array, key: Uint8Array) → EncryptResult",
      description: "AES-256-GCM",
    },
  ],
  [
    "decrypt",
    {
      signature:
        "(ciphertext: string, key: Uint8Array, iv: string, tag: string) → string",
      description: "AES-256-GCM",
    },
  ],

  // Archive
  [
    "tar",
    {
      signature: "(ctx, paths: string[], dest: string) → WriteResult",
      description: "Create .tar.gz",
    },
  ],
  [
    "untar",
    {
      signature: "(ctx, archive: string, dest: string) → ExtractResult",
      description: "Extract .tar.gz",
    },
  ],
  [
    "zip",
    {
      signature: "(ctx, paths: string[], dest: string) → WriteResult",
      description: "Create .zip",
    },
  ],
  [
    "unzip",
    {
      signature: "(ctx, archive: string, dest: string) → ExtractResult",
      description: "Extract .zip",
    },
  ],
  [
    "gzip",
    {
      signature: "(ctx, path: string) → WriteResult",
      description: "Gzip file",
    },
  ],
  [
    "gunzip",
    {
      signature: "(ctx, path: string) → WriteResult",
      description: "Gunzip file",
    },
  ],

  // Stream
  [
    "lineStream",
    {
      signature: "(ctx, path: string) → AsyncIterable<string>",
      description: "Stream file lines",
    },
  ],
  [
    "tailStream",
    {
      signature: "(ctx, path: string) → AsyncIterable<string>",
      description: "Live tail",
    },
  ],
  [
    "pipeSpawn",
    {
      signature:
        "(ctx, cmd: string, args: string[], input: string) → SpawnResult",
      description: "Pipe to stdin",
    },
  ],
  [
    "streamSpawn",
    {
      signature: "(ctx, cmd: string, args?: string[]) → StreamingProcess",
      description: "Streaming spawn",
    },
  ],

  // Data
  [
    "parseJSON",
    { signature: "<T>(text: string) → T", description: "Parse JSON" },
  ],
  [
    "formatJSON",
    {
      signature: "(data: unknown, indent?: number) → string",
      description: "Format JSON",
    },
  ],
  [
    "parseCSV",
    {
      signature: "(text: string, opts?: CsvOptions) → Record<string, string>[]",
      description: "Parse CSV",
    },
  ],
  [
    "formatCSV",
    {
      signature: "(rows: Record<string, string>[], opts?) → string",
      description: "Format CSV",
    },
  ],
  [
    "parseTOML",
    { signature: "<T>(text: string) → T", description: "Parse TOML" },
  ],
  [
    "base64Encode",
    {
      signature: "(data: string | Uint8Array) → string",
      description: "Base64 encode",
    },
  ],
  [
    "base64Decode",
    { signature: "(text: string) → Uint8Array", description: "Base64 decode" },
  ],
  [
    "base64DecodeString",
    { signature: "(text: string) → string", description: "Base64 to string" },
  ],

  // Database
  [
    "dbOpen",
    {
      signature: "(ctx, path: string) → TypedDatabase",
      description: "Open SQLite",
    },
  ],
  [
    "dbQuery",
    {
      signature: "<T>(ctx, path: string, sql: string, params?) → T[]",
      description: "Query SQLite",
    },
  ],
  [
    "dbExec",
    {
      signature: "(ctx, path: string, sql: string, params?) → { changes }",
      description: "Exec SQLite",
    },
  ],

  // Git
  ["gitStatus", { signature: "(ctx) → GitStatus", description: "Git status" }],
  [
    "gitLog",
    {
      signature: "(ctx, opts?: { limit?, ref? }) → GitCommit[]",
      description: "Git log",
    },
  ],
  [
    "gitDiff",
    {
      signature: "(ctx, ref?: string) → GitDiffEntry[]",
      description: "Git diff",
    },
  ],
  [
    "gitBranch",
    { signature: "(ctx) → GitBranches", description: "Git branches" },
  ],
  [
    "gitAdd",
    { signature: "(ctx, paths: string[]) → void", description: "Git add" },
  ],
  [
    "gitCommit",
    {
      signature: "(ctx, message: string) → { hash }",
      description: "Git commit",
    },
  ],
  [
    "gitPush",
    { signature: "(ctx, remote?, branch?) → string", description: "Git push" },
  ],
  [
    "gitPull",
    { signature: "(ctx, remote?, branch?) → string", description: "Git pull" },
  ],
  [
    "gitClone",
    {
      signature: "(ctx, url: string, dest: string) → string",
      description: "Git clone",
    },
  ],
  [
    "gitStash",
    {
      signature: "(ctx, action?: 'push' | 'pop' | 'list' | 'drop') → string",
      description: "Git stash",
    },
  ],

  // OS
  [
    "openUrl",
    { signature: "(ctx, url: string) → void", description: "Open in browser" },
  ],
  [
    "openFile",
    {
      signature: "(ctx, path: string) → void",
      description: "Open in default app",
    },
  ],
  [
    "notify",
    {
      signature: "(ctx, title: string, body: string) → void",
      description: "Desktop notification",
    },
  ],
  [
    "clipboard",
    { signature: "(ctx) → ClipboardHandle", description: "Clipboard access" },
  ],

  // Scheduling
  [
    "sleep",
    { signature: "(ms: number) → Promise<void>", description: "Sleep" },
  ],
  [
    "interval",
    {
      signature: "(ms: number, fn: () => void) → IntervalHandle",
      description: "Recurring interval",
    },
  ],
  [
    "timeout",
    {
      signature: "(ms: number, fn: () => void) → TimeoutHandle",
      description: "Delayed timeout",
    },
  ],
  [
    "debounce",
    {
      signature: "(ms: number, fn: Function) → Function",
      description: "Debounce",
    },
  ],
  [
    "throttle",
    {
      signature: "(ms: number, fn: Function) → Function",
      description: "Throttle",
    },
  ],
  [
    "retry",
    {
      signature:
        "<T>(maxAttempts: number, baseDelay: number, fn: () => Promise<T>) → T",
      description: "Retry with backoff",
    },
  ],

  // User
  [
    "currentUser",
    { signature: "(ctx) → CurrentUser", description: "Current user info" },
  ],
  ["users", { signature: "(ctx) → UserEntry[]", description: "System users" }],
  [
    "groups",
    { signature: "(ctx) → GroupEntry[]", description: "System groups" },
  ],

  // Pipe
  [
    "pipe",
    {
      signature: "(source, ...stages) → Promise<T>",
      description: "Array pipe chain",
    },
  ],
  [
    "filter",
    {
      signature: "<T>(pred: (item: T) => boolean) → PipeStage<T[], T[]>",
      description: "Filter items",
    },
  ],
  [
    "map",
    {
      signature: "<T, U>(fn: (item: T) => U) → PipeStage<T[], U[]>",
      description: "Transform items",
    },
  ],
  [
    "reduce",
    {
      signature:
        "<T, U>(fn: (acc: U, item: T) => U, init: U) → PipeStage<T[], U>",
      description: "Reduce",
    },
  ],
  [
    "take",
    {
      signature: "<T>(n: number) → PipeStage<T[], T[]>",
      description: "First N items",
    },
  ],
  [
    "skip",
    {
      signature: "<T>(n: number) → PipeStage<T[], T[]>",
      description: "Skip N items",
    },
  ],
  [
    "sortBy",
    {
      signature:
        "<T>(key: keyof T, order?: 'asc' | 'desc') → PipeStage<T[], T[]>",
      description: "Sort by key",
    },
  ],
  [
    "groupBy",
    {
      signature: "<T>(key: keyof T) → PipeStage<T[], Record<string, T[]>>",
      description: "Group by key",
    },
  ],
  [
    "unique",
    {
      signature: "<T>(key?: keyof T) → PipeStage<T[], T[]>",
      description: "Deduplicate",
    },
  ],
  [
    "pluck",
    {
      signature: "<T, K>(key: K) → PipeStage<T[], T[K][]>",
      description: "Extract property",
    },
  ],
  [
    "count",
    { signature: "<T>() → PipeStage<T[], number>", description: "Count items" },
  ],
  [
    "first",
    {
      signature: "<T>() → PipeStage<T[], T | undefined>",
      description: "First item",
    },
  ],
  [
    "last",
    {
      signature: "<T>() → PipeStage<T[], T | undefined>",
      description: "Last item",
    },
  ],

  // Viz
  [
    "toTable",
    {
      signature: "(opts?: TableOptions) → PipeStage<T[], string>",
      description: "Render table",
    },
  ],
  [
    "toBarChart",
    {
      signature: "(valueField?, labelField?, opts?) → PipeStage<T[], string>",
      description: "Bar chart",
    },
  ],
  [
    "toSparkline",
    {
      signature: "(valueField?) → PipeStage<T[], string>",
      description: "Sparkline",
    },
  ],
  [
    "toHistogram",
    {
      signature: "(valueField?, opts?) → PipeStage<T[], string>",
      description: "Histogram",
    },
  ],

  // Stream pipe
  [
    "streamPipe",
    {
      signature: "(source: AsyncIterable, ...stages) → AsyncIterable",
      description: "Stream pipe",
    },
  ],
  [
    "sFilter",
    {
      signature: "<T>(pred: (item: T) => boolean) → StreamStage<T, T>",
      description: "Stream filter",
    },
  ],
  [
    "sMap",
    {
      signature: "<T, U>(fn: (item: T) => U) → StreamStage<T, U>",
      description: "Stream map",
    },
  ],
  [
    "sTake",
    {
      signature: "<T>(n: number) → StreamStage<T, T>",
      description: "Stream take N",
    },
  ],
  [
    "sToArray",
    {
      signature: "<T>(stream: AsyncIterable<T>) → T[]",
      description: "Collect to array",
    },
  ],
  [
    "sCount",
    {
      signature: "<T>(stream: AsyncIterable<T>) → number",
      description: "Count stream",
    },
  ],

  // Secrets
  [
    "createSecretStore",
    {
      signature: "(masterKey: Uint8Array, opts?) → SecretStore",
      description: "Encrypted store",
    },
  ],
  [
    "deriveKey",
    {
      signature: "(password: string, salt?) → { key, salt }",
      description: "PBKDF2 key derivation",
    },
  ],
  [
    "createStateStore",
    { signature: "() → StateStore", description: "Typed KV store" },
  ],
  [
    "authBearer",
    {
      signature: "(ctx, secrets, key: string) → Record<string, string>",
      description: "Bearer header",
    },
  ],
  [
    "authedFetch",
    {
      signature: "(ctx, secrets, tokenKey, url, init?) → Response",
      description: "Authed HTTP fetch",
    },
  ],
  [
    "secretFromEnv",
    {
      signature: "(ctx, secrets, envKey: string, secretKey?) → void",
      description: "Import env to secrets",
    },
  ],

  // Agent
  [
    "runAgent",
    {
      signature: "(config: AgentConfig) → AgentResult",
      description: "Run sandboxed agent",
    },
  ],

  // Context
  [
    "createContext",
    {
      signature:
        "(opts: { name, capabilitySet | capabilities }) → CapabilityContext<K>",
      description: "Create context",
    },
  ],
  [
    "capabilities",
    {
      signature: "() → CapabilityBuilder<never>",
      description: "Start building capabilities",
    },
  ],

  // Docker (Compute Plane)
  [
    "dockerRun",
    {
      signature:
        "(ctx, image: string, opts?: DockerRunOptions) → DockerRunResult",
      description: "Run Docker container",
    },
  ],
  [
    "dockerExec",
    {
      signature:
        "(ctx, image: string, script: string, opts?) → DockerRunResult",
      description: "Run script in container",
    },
  ],
  [
    "dockerVfsRun",
    {
      signature:
        "(ctx, vfs, image: string, opts: DockerVfsRunOptions) → DockerVfsRunResult",
      description: "VFS-synced Docker run",
    },
  ],
  [
    "dockerBuild",
    {
      signature:
        "(ctx, contextPath: string, tag: string, opts?) → DockerBuildResult",
      description: "Build Docker image",
    },
  ],
  [
    "dockerPull",
    {
      signature: "(ctx, image: string) → DockerRunResult",
      description: "Pull Docker image",
    },
  ],
  [
    "dockerImages",
    {
      signature: "(ctx) → DockerImage[]",
      description: "List Docker images",
    },
  ],
  [
    "dockerPs",
    {
      signature: "(ctx) → DockerContainer[]",
      description: "List running containers",
    },
  ],
  [
    "dockerStop",
    {
      signature: "(ctx, containerId: string, timeout?: number) → boolean",
      description: "Stop container",
    },
  ],
  [
    "dockerRm",
    {
      signature: "(ctx, containerId: string, force?: boolean) → boolean",
      description: "Remove container",
    },
  ],
  [
    "dockerLogs",
    {
      signature: "(ctx, containerId: string, opts?) → string",
      description: "Get container logs",
    },
  ],
  [
    "dockerSpawnBackground",
    {
      signature:
        "(ctx, image: string, opts?: DockerRunOptions) → DockerDaemonHandle",
      description: "Spawn background container",
    },
  ],
  [
    "dockerRunStreaming",
    {
      signature: "(ctx, image: string, opts?: DockerRunOptions) → DockerStream",
      description: "Stream container output",
    },
  ],
  [
    "dockerRunProxied",
    {
      signature:
        "(ctx, image: string, opts?) → DockerRunResult & { proxyStats }",
      description: "Run with egress proxy",
    },
  ],
  [
    "startEgressProxy",
    {
      signature: "(ctx, opts?) → EgressProxyHandle",
      description: "Start capability-checked proxy",
    },
  ],

  // Live Mount
  [
    "createLiveMount",
    {
      signature:
        "(vfs, diskPath: string, vfsPath: string, opts?) → LiveMountHandle",
      description: "Bi-directional VFS ↔ disk sync",
    },
  ],

  // Dynamic plugins
  [
    "validatePlugin",
    {
      signature: "(source: string) → PluginValidationResult",
      description: "Validate plugin source",
    },
  ],
  [
    "createPluginRegistry",
    {
      signature: "() → PluginRegistry",
      description: "Create plugin registry",
    },
  ],

  // cmux terminal multiplexer
  [
    "cmuxDetect",
    { signature: "(ctx) → boolean", description: "Check if inside cmux" },
  ],
  [
    "cmuxIdentify",
    {
      signature: "(ctx) → CmuxIdentity",
      description: "Get current context IDs",
    },
  ],
  [
    "cmuxListWorkspaces",
    { signature: "(ctx) → CmuxWorkspace[]", description: "List workspaces" },
  ],
  [
    "cmuxNewWorkspace",
    { signature: "(ctx, opts?) → string", description: "Create workspace" },
  ],
  [
    "cmuxSelectWorkspace",
    { signature: "(ctx, id) → void", description: "Switch workspace" },
  ],
  [
    "cmuxCloseWorkspace",
    { signature: "(ctx, id) → void", description: "Close workspace" },
  ],
  [
    "cmuxRenameWorkspace",
    { signature: "(ctx, title, id?) → void", description: "Rename workspace" },
  ],
  [
    "cmuxListWindows",
    { signature: "(ctx) → CmuxWindow[]", description: "List windows" },
  ],
  [
    "cmuxNewWindow",
    { signature: "(ctx) → string", description: "Create window" },
  ],
  [
    "cmuxFocusWindow",
    { signature: "(ctx, id) → void", description: "Focus window" },
  ],
  [
    "cmuxNewSplit",
    {
      signature: "(ctx, direction, surfaceId?) → string",
      description: "Create split",
    },
  ],
  [
    "cmuxListPanes",
    {
      signature: "(ctx, workspaceId?) → CmuxPane[]",
      description: "List panes",
    },
  ],
  [
    "cmuxListSurfaces",
    { signature: "(ctx) → CmuxSurface[]", description: "List surfaces" },
  ],
  [
    "cmuxFocusPane",
    {
      signature: "(ctx, paneId, workspaceId?) → void",
      description: "Focus pane",
    },
  ],
  [
    "cmuxCloseSurface",
    { signature: "(ctx, surfaceId?) → void", description: "Close surface" },
  ],
  [
    "cmuxTree",
    { signature: "(ctx, opts?) → string", description: "Show workspace tree" },
  ],
  [
    "cmuxSend",
    {
      signature: "(ctx, text, surfaceId?) → void",
      description: "Send text to terminal",
    },
  ],
  [
    "cmuxSendKey",
    {
      signature: "(ctx, key, surfaceId?) → void",
      description: "Send key press",
    },
  ],
  [
    "cmuxReadScreen",
    {
      signature: "(ctx, opts?) → CmuxScreenContent",
      description: "Read terminal screen",
    },
  ],
  [
    "cmuxNotify",
    {
      signature: "(ctx, { title, body }) → void",
      description: "Desktop notification",
    },
  ],
  [
    "cmuxSetStatus",
    {
      signature: "(ctx, key, value, opts?) → void",
      description: "Set sidebar status",
    },
  ],
  [
    "cmuxClearStatus",
    { signature: "(ctx, key) → void", description: "Clear sidebar status" },
  ],
  [
    "cmuxSetProgress",
    {
      signature: "(ctx, value, label?) → void",
      description: "Set progress bar",
    },
  ],
  [
    "cmuxClearProgress",
    { signature: "(ctx) → void", description: "Clear progress bar" },
  ],
  [
    "cmuxLog",
    {
      signature: "(ctx, message, opts?) → void",
      description: "Add sidebar log entry",
    },
  ],
  [
    "cmuxClearLog",
    { signature: "(ctx) → void", description: "Clear sidebar log" },
  ],
  [
    "cmuxBrowserOpen",
    {
      signature: "(ctx, url, opts?) → string",
      description: "Open browser surface",
    },
  ],
  [
    "cmuxBrowserNavigate",
    {
      signature: "(ctx, surfaceId, url) → void",
      description: "Navigate browser",
    },
  ],
  [
    "cmuxBrowserClick",
    {
      signature: "(ctx, surfaceId, selector) → void",
      description: "Click element",
    },
  ],
  [
    "cmuxBrowserFill",
    {
      signature: "(ctx, surfaceId, selector, text) → void",
      description: "Fill input",
    },
  ],
  [
    "cmuxBrowserSnapshot",
    {
      signature: "(ctx, surfaceId, opts?) → string",
      description: "A11y snapshot",
    },
  ],
  [
    "cmuxBrowserScreenshot",
    { signature: "(ctx, surfaceId, path) → void", description: "Screenshot" },
  ],
  [
    "cmuxBrowserEval",
    {
      signature: "(ctx, surfaceId, expr) → string",
      description: "Eval JavaScript",
    },
  ],
  [
    "cmuxBrowserWait",
    {
      signature: "(ctx, surfaceId, opts) → void",
      description: "Wait for condition",
    },
  ],
  [
    "cmuxBrowserGet",
    {
      signature: "(ctx, surfaceId, prop, sel?) → string",
      description: "Get DOM property",
    },
  ],
  [
    "cmuxSetBuffer",
    {
      signature: "(ctx, text, name?) → void",
      description: "Set clipboard buffer",
    },
  ],
  [
    "cmuxPasteBuffer",
    { signature: "(ctx, opts?) → void", description: "Paste buffer" },
  ],
  [
    "cmuxPing",
    { signature: "(ctx) → boolean", description: "Check if cmux running" },
  ],
  [
    "cmuxVersion",
    { signature: "(ctx) → string", description: "Get cmux version" },
  ],
]);

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Get the signature hint for a function name.
 */
export function getSignature(name: string): FunctionSignature | null {
  return SIGNATURES.get(name) ?? null;
}

/**
 * Detect if the user is typing a function call.
 * Returns the function name or null.
 */
export function detectFunctionCall(text: string): string | null {
  // Match the last function name before an unclosed paren
  const match = text.match(/(\w+)\s*\([^)]*$/);
  if (!match) return null;
  return SIGNATURES.has(match[1]!) ? match[1]! : null;
}
