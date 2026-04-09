# BunShell

**A typed execution layer for AI agents.** TypeScript's type system _is_ the permission model.

Unauthorized actions don't just fail at runtime — they don't compile. Every wrapper function carries its capability requirement in its type signature. `tsc` itself rejects code that tries to read files without `fs:read`, spawn processes without `process:spawn`, or access secrets without `secret:read`. The compiler is the permission system.

```typescript
// This compiles and runs:
const ctx: CapabilityContext<"fs:read" | "env:read"> = ...;
await ls(ctx, "src");          // OK — ctx has fs:read

// This is a TYPE ERROR — tsc rejects it before execution:
await write(ctx, "/tmp/f", "d");
//    ~~~~~ Error: CapabilityContext<"fs:read" | "env:read">
//          is not assignable to RequireCap<K, "fs:write">
```

The shell shows this live — real-time syntax highlighting as you type, and `tsc --noEmit` before every execution.

## Quick Start

```bash
bun install
```

### Interactive Shell

```bash
bun run shell
```

```
bunshell ts > const files = await ls(ctx, "src")
              ─────                ──      ─────
              blue(keyword)        cyan(api) green(string)
// : FileEntry[7]
FileEntry[7] [
  FileEntry { name: "capabilities", isDirectory: true, ... },
  FileEntry { name: "wrappers", isDirectory: true, ... },
  ...
]

bunshell ts > .type FileEntry
interface FileEntry {
  name: string
  path: string
  size: number
  isDirectory: boolean
  ...
}

bunshell ts > await pipe(ls(ctx, "."), filter(f => f.isFile), sortBy("size", "desc"), toTable())
┌──────────┬────────┬───────────┐
│ name     │   size │ extension │
├──────────┼────────┼───────────┤
│ bun.lock │ 20,638 │ lock      │
│ ...      │    ... │ ...       │
└──────────┴────────┴───────────┘
```

### Server Mode

```bash
bun run server
```

Any agent harness connects via JSON-RPC 2.0:

```bash
# Create session with virtual filesystem — nothing touches disk
curl -X POST http://127.0.0.1:7483 -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1,
  "method": "session.create",
  "params": {
    "name": "my-agent",
    "capabilities": [{ "kind": "fs:read", "pattern": "*" }],
    "files": { "/src/app.ts": "export const main = () => {}" }
  }
}'

# Execute typed TypeScript — capability-checked, audited
curl -X POST http://127.0.0.1:7483 -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 2,
  "method": "session.execute",
  "params": { "sessionId": "...", "code": "ls(\"/src\")" }
}'
```

## Why Not Bash?

| Problem | Bash | BunShell |
|---|---|---|
| Is `rm -rf /` destructive? | No standard | `fs:delete` is a separate type |
| Auto-approve reads, block writes | Impossible | Types enforce it at compile time |
| Agent escapes sandbox | One command away | VM blocks `node:fs`, `require`, `process` |
| Output of `ls -la` | Raw text | `FileEntry[]` — typed, pipeable |
| Permission scope | All or nothing | Glob patterns, domain lists, key lists |
| Where data lives | Real disk | Virtual filesystem per session |
| Auditing | Hope you logged it | Automatic, structural |
| Portability | Needs a real machine | JSON-RPC server, VFS snapshots |
| **Permission model** | **Runtime, ad-hoc** | **Compile-time, in the type system** |

## How Types Enforce Permissions

### CapabilityContext is Generic

```typescript
// The context carries which capabilities it has AT THE TYPE LEVEL:
interface CapabilityContext<K extends CapabilityKind> {
  readonly caps: CapabilitySet;
  derive<S extends K>(name: string, subset: Capability[]): CapabilityContext<S>;
}
```

### Every Wrapper Has a Type Constraint

```typescript
// RequireCap resolves to the context type if it has the required kind,
// otherwise resolves to `never` — making the call a type error.
type RequireCap<K, Required> = [Required] extends [K] ? CapabilityContext<K> : never;

// ls requires fs:read:
function ls<K extends CapabilityKind>(ctx: RequireCap<K, "fs:read">, path?: string): Promise<FileEntry[]>

// cp requires BOTH fs:read AND fs:write:
function cp<K extends CapabilityKind>(ctx: RequireCap<K, "fs:read" | "fs:write">, src: string, dest: string): Promise<void>

// dbOpen requires db:query AND fs:read AND fs:write:
function dbOpen<K extends CapabilityKind>(ctx: RequireCap<K, "db:query" | "fs:read" | "fs:write">, path: string): TypedDatabase
```

### What tsc Catches

```typescript
const readOnly: CapabilityContext<"fs:read"> = ...;
const envOnly: CapabilityContext<"env:read"> = ...;
const full: CapabilityContext<"fs:read" | "fs:write" | "process:spawn"> = ...;

ls(readOnly, ".");       // OK — has fs:read
ls(full, ".");           // OK — has fs:read (among others)
ls(envOnly, ".");        // TYPE ERROR — no fs:read

write(readOnly, "/f", "d");  // TYPE ERROR — no fs:write
write(full, "/f", "d");     // OK — has fs:write

cp(readOnly, "a", "b");     // TYPE ERROR — has fs:read but NOT fs:write
cp(full, "a", "b");         // OK — has both
```

### The Builder Accumulates Types

```typescript
capabilities()
  .fsRead("/src/**")          // CapabilityBuilder<"fs:read">
  .spawn(["git"])             // CapabilityBuilder<"fs:read" | "process:spawn">
  .envRead(["HOME", "PATH"])  // CapabilityBuilder<"fs:read" | "process:spawn" | "env:read">
  .build()
```

### derive() Can Only Reduce

```typescript
const parent: CapabilityContext<"fs:read" | "fs:write"> = ...;
const child: CapabilityContext<"fs:read"> = parent.derive("child", [...]);
// child's K is a subset of parent's K — enforced by <S extends K>
```

## The 14+N Capability Types

| Capability | Gates | Type constraint |
|---|---|---|
| `fs:read` | Read files/directories | `RequireCap<K, "fs:read">` |
| `fs:write` | Write/create files | `RequireCap<K, "fs:write">` |
| `fs:delete` | Delete files/directories | `RequireCap<K, "fs:delete">` |
| `process:spawn` | Execute binaries | `RequireCap<K, "process:spawn">` |
| `net:fetch` | HTTP requests | `RequireCap<K, "net:fetch">` |
| `net:listen` | Open server port | `RequireCap<K, "net:listen">` |
| `env:read` | Read env variables | `RequireCap<K, "env:read">` |
| `env:write` | Modify env variables | `RequireCap<K, "env:write">` |
| `db:query` | SQLite database access | `RequireCap<K, "db:query">` |
| `net:connect` | Raw TCP/UDP | `RequireCap<K, "net:connect">` |
| `os:interact` | Desktop (notify, clipboard) | `RequireCap<K, "os:interact">` |
| `secret:read` | Read secrets (glob on keys) | `RequireCap<K, "secret:read">` |
| `secret:write` | Write secrets | `RequireCap<K, "secret:write">` |
| `docker:run` | Run Docker containers | `RequireCap<K, "docker:run">` |
| `` plugin:${string} `` | Dynamic agent plugins | `RequireCap<K, "plugin:name">` |

## The Shell

Built with [pi-tui](https://github.com/badlogic/pi-mono) — a component-based TUI framework with differential rendering.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  BunShell  ts ● ok                     .help │ .type │ .exit │  ← header (color = status)
│                                                              │
│  Try: await ls(ctx, ".") │ .type FileEntry │ .help           │
│                                                              │
│  › await ls(ctx, "src")                                      │  ← output (scrollable)
│  // : FileEntry[7]                                           │
│  FileEntry[7] [                                              │
│    FileEntry { name: "capabilities", ... },                  │
│    ...                                                       │
│  ]                                                           │
│                                                              │
│  ▌await pipe(ls(ctx, "."), filter(f => f.isFile), toTable()) │  ← editor (multi-line, highlighted)
└──────────────────────────────────────────────────────────────┘
```

### Live Status Header

The **BunShell** badge in the header changes color in real-time as you type:

| Color | Meaning |
|---|---|
| **Green** `● ok` | Code type-checks — safe to execute |
| **Red** `● type error` | tsc detected an error (shows the message) |
| **Yellow** `◌ checking…` | tsc is running in the background |
| **Cyan** `○` | Idle — empty input or dot command |

The editor border follows the same color scheme.

### Syntax Highlighting

The editor highlights TypeScript as you type:

| Token | Color | Example |
|---|---|---|
| Keywords | **bold blue** | `const`, `await`, `async`, `function`, `if` |
| BunShell APIs | **cyan** | `ls`, `pipe`, `filter`, `hash`, `gitStatus` |
| Capability kinds | **yellow bold** | `"fs:read"`, `"process:spawn"` |
| Strings | **green** | `"hello"`, `'/tmp'` |
| Numbers | **yellow** | `42`, `0xFF`, `3.14` |
| Types | **magenta italic** | `: number`, `: FileEntry[]` |
| Booleans/null | **yellow** | `true`, `false`, `null`, `undefined` |
| Operators | **dim** | `===`, `=>`, `&&`, `\|\|` |
| Comments | **dim** | `// comment`, `/* block */` |

### Type Checking Before Execution

Every time you press Enter, `tsc --noEmit` runs on your code. Type errors — including capability violations — block execution:

```
› await write(readOnlyCtx, "/tmp/f", "data")
error TS2345 (1:13): Argument of type 'CapabilityContext<"fs:read">'
  is not assignable to parameter of type 'RequireCap<"fs:read", "fs:write">'
1 type error — not executed
```

The header also shows errors live as you type (400ms debounce + ~1s tsc).

### Type Explorer

```
› .type
Available types:
  AgentResult     AuditEntry      Capability      CapabilityContext
  FileEntry       GitCommit       SpawnResult     TypedDatabase    ...

› .type Capability
type Capability =
  | FSRead      { kind: "fs:read",     pattern: string }
  | FSWrite     { kind: "fs:write",    pattern: string }
  | Spawn       { kind: "process:spawn", allowedBinaries: string[] }
  ...
```

### Dot Commands

| Command | Description |
|---|---|
| `.help` | All 90+ wrappers organized by category |
| `.type <name>` | Show TypeScript interface (50+ types) |
| `.vars` | Show defined variables with types |
| `.caps` | Show current capabilities |
| `.audit` | Show recent audit entries |
| `.clear` | Clear output |
| `.exit` | Exit |

## 90+ Typed Wrappers

### Filesystem
`ls` `cat` `stat` `exists` `mkdir` `write` `readJson` `writeJson` `rm` `cp` `mv` `find` `du` `chmod` `createSymlink` `readLink` `touch` `append` `truncate` `realPath` `watchPath` `globFiles`

### Process
`ps` `kill` `spawn` `exec`

### Network
`netFetch` `ping` `download` `dig` `serve` `wsConnect`

### Database
`dbOpen` `dbQuery` `dbExec`

### Git
`gitStatus` `gitLog` `gitDiff` `gitBranch` `gitAdd` `gitCommit` `gitPush` `gitPull` `gitClone` `gitStash`

### Crypto
`hash` `hmac` `randomBytes` `randomUUID` `randomInt` `encrypt` `decrypt`

### Secrets & Auth
`createSecretStore` `deriveKey` `secretFromEnv` `authBearer` `authBasic` `authedFetch` `oauth2DeviceFlow` `cookieJar`

### Docker (Compute Plane)
`dockerRun` `dockerExec` `dockerVfsRun` `dockerBuild` `dockerPull` `dockerImages` `dockerPs` `dockerStop` `dockerRm` `dockerLogs` `dockerSpawnBackground` `dockerRunStreaming` `dockerRunProxied` `startEgressProxy`

### Archive, Stream, Data, Text, Env, System, OS, Scheduling, User
See `.help` in the shell or [docs/guide.md](docs/guide.md).

## Pipe System

### Array Pipe (eager)

```typescript
await pipe(
  ls(ctx, "src", { recursive: true }),
  filter<FileEntry>(f => f.size > 1000),
  sortBy("size", "desc"),
  take(10),
  toBarChart("size", "name"),
);
```

### Stream Pipe (lazy, O(1) memory)

```typescript
const errors = streamPipe(
  lineStream(ctx, "/var/log/huge.log"),
  sFilter(line => line.includes("ERROR")),
  sTake(100),
);
for await (const err of errors) console.log(err);
```

### Visualization Sinks

`toTable()` `toBarChart()` `toSparkline()` `toHistogram()`

## Server Mode

JSON-RPC 2.0 over HTTP. Any harness connects.

| Method | Description |
|---|---|
| `session.create` | New session with capabilities + VFS |
| `session.execute` | Run TypeScript (VFS-backed, capability-checked) |
| `session.destroy` | Tear down session |
| `session.list` | List active sessions |
| `session.audit` | Query audit trail |
| `session.fs.read/write/list/snapshot` | Direct VFS access |

### Virtual Filesystem

Sessions operate on in-memory VFS. Nothing touches disk.

```typescript
session.create({
  files: { "/src/app.ts": "...", "/src/utils.ts": "..." },
  capabilities: [{ kind: "fs:read", pattern: "*" }]
})
session.execute({ code: 'cat("/src/app.ts")' })     // OK
session.execute({ code: 'write("/hack", "bad")' })  // DENIED
session.fs.snapshot()                                 // export full VFS
```

### Git Mounting — GitHub repos in RAM

Mount GitHub repositories directly into the VFS without cloning. No disk, all in RAM. Uses the GitHub Trees + Blobs API.

```typescript
// Mount a full repo
await vfs.mountGit("github://facebook/react", "/repo");

// Mount a subdirectory of a specific branch, filtered
await vfs.mountGit("github://owner/repo@main/src", "/src", {
  include: [".ts", ".tsx"],      // only these extensions
  exclude: ["**/*.test.ts"],     // skip tests
  maxFiles: 200,                 // cap
  maxFileSize: 1_048_576,        // skip files > 1MB
  token: "ghp_...",              // for private repos
});
// → { filesLoaded: 142, totalSize: 580_000, ref: "a1b2c3d4" }

// Now use BunShell wrappers on the repo — entirely in memory
vfs.readdir("/repo/src");
vfs.readFile("/repo/README.md");
vfs.glob("**/*.ts", "/repo");
```

URL format: `github://owner/repo[@ref][/subpath]`

### Live Mount — Bi-directional VFS ↔ Disk Sync

Mount a physical directory so the user and agent share a live workspace. The user edits in VS Code, the agent sees changes instantly. The agent writes via VFS, changes appear on disk (or accumulate for review).

```typescript
// Auto-flush: agent writes hit disk immediately
const mount = await vfs.mountLive("/Users/olivier/project", "/workspace", {
  policy: "auto-flush",
  ignore: ["node_modules/**", ".git/**"],
});

// Agent writes → user sees in VS Code instantly
vfs.writeFile("/workspace/src/fix.ts", "patched code");

// User saves in VS Code → agent reads latest
const latest = vfs.readFile("/workspace/src/app.ts");

mount.unmount();  // Stop syncing
```

```typescript
// Draft mode: agent works in RAM, human reviews before apply
const mount = await vfs.mountLive("/Users/olivier/project", "/workspace", {
  policy: "draft",
});

// Agent works freely in VFS
vfs.writeFile("/workspace/src/fix.ts", "patched");
vfs.rm("/workspace/src/old.ts");

// Human reviews the diff
const diffs = mount.diff();
// → [{ action: "modify", path: "src/fix.ts", content: "..." },
//    { action: "delete", path: "src/old.ts" }]

mount.flush();    // Apply all to disk
// — or —
mount.discard();  // Revert VFS to disk state
```

In `.bunshell.ts` config:
```typescript
vfs: {
  mount: [{ live: ".", to: "/workspace", policy: "draft", ignore: ["node_modules/**"] }],
}
```

## Docker Compute Plane

TypeScript is the **Control Plane** — typed, fast, in-memory. Docker is the **Compute Plane** — native, isolated, ephemeral. The agent stays in its typed sandbox for 90% of tasks and only spins up containers for heavy, untyped, or OS-level native work.

```typescript
// Run a container — structured output, capability-checked
const result = await dockerRun(ctx, "node:20-alpine", {
  command: ["node", "-e", "console.log(JSON.stringify({ok:true}))"],
});
// → DockerRunResult { success: true, stdout: '{"ok":true}', ... }

// Execute a script in any language
const py = await dockerExec(ctx, "python:3.12-slim", `
  import json
  print(json.dumps({"pi": 3.14159}))
`);

// The key integration: VFS ↔ Docker volume sync
// 1. Flushes VFS to temp dir  2. Mounts as Docker volume
// 3. Runs container  4. Ingests file diff back into VFS
const build = await dockerVfsRun(ctx, vfs, "rust:1.77", {
  vfsPath: "/project",
  command: ["cargo", "build", "--release"],
});
// → { filesChanged: 3, filesAdded: 42, bytesTransferred: 8_500_000 }
// VFS now contains the build artifacts — no disk touched
```

### Daemon Containers

```typescript
// Spawn a background container (dev server, database, etc.)
const server = await dockerSpawnBackground(ctx, "node:20", {
  command: ["npm", "run", "dev"],
  ports: ["3000:3000"],
});

await server.waitForPort(3000);                    // Poll until ready
const resp = await netFetch(ctx, "http://localhost:3000/health");

for await (const line of server.logStream()) {     // Live log stream
  if (line.includes("ERROR")) break;
}

await server.exec(["npm", "test"]);                // Exec inside container
await server.stop();
```

### Streaming Output

```typescript
// Read output line-by-line — kill early on error
const stream = await dockerRunStreaming(ctx, "rust:1.77", {
  command: ["cargo", "build"],
});

for await (const line of stream) {
  console.log(line);
  if (line.includes("error[E")) {
    await stream.kill();   // Agent interrupts — no 5-minute wait
    break;
  }
}
```

### Egress Proxy — Capability-Checked Network

```typescript
// npm install is allowed, curl evil.com is blocked
const result = await dockerRunProxied(ctx, "node:20", {
  command: ["npm", "install"],
});
// result.proxyStats → { allowed: 47, blocked: 0, blockedDomains: [] }
```

Under the hood, BunShell starts an HTTP proxy that checks `net:fetch` capabilities before forwarding. The container routes through it via `HTTP_PROXY`/`HTTPS_PROXY`. `registry.npmjs.org` passes, `evil.com` gets 403.

Image access is capability-checked — `docker:run` controls which images an agent can use. Supports exact names, tags, and glob patterns (`python:3.*`).

```typescript
const ctx = createContext({
  name: "builder",
  capabilitySet: capabilities()
    .dockerRun(["node", "python:3.*", "rust:1.77"])
    .build(),
});

await dockerRun(ctx, "node:20", { ... });    // OK — "node" matches "node:20"
await dockerRun(ctx, "postgres", { ... });   // TYPE + RUNTIME ERROR
```

## Dynamic Plugins — Agent-Written Wrappers

Agents can write their own typed wrappers and register them as capabilities. The plugin system validates source code (no raw `node:` imports, no `Bun.spawn` bypass), requires human approval, and enforces transitive security through the type system.

```typescript
// Agent writes a plugin — must declare its core capability dependencies
const source = `
  import type { CapabilityKind, RequireCap } from "bunshell";

  export async function deploy<K extends CapabilityKind>(
    ctx: RequireCap<K, "plugin:deploy" | "net:fetch">,
    target: string,
  ): Promise<{ deployed: boolean }> {
    const resp = await netFetch(ctx, \`https://api.deploy.io/\${target}\`);
    return { deployed: resp.status === 200 };
  }
`;

// Validation catches unsafe patterns
const result = validatePlugin(source);
// { valid: true, errors: [], exports: ["deploy"] }

// Human approves via RPC: workspace.approvePlugin
// Plugin functions are injected into the eval scope
// Agent can now: await deploy(ctx, "production")
```

**Transitive security**: `RequireCap<K, "plugin:deploy" | "net:fetch">` means tsc will reject calling `deploy()` unless the context has both `plugin:deploy` AND `net:fetch`. The agent can't hide its real requirements — the type system forces honest declaration.

**What's banned**: `node:*` imports, bare builtins (`fs`, `child_process`), `Bun.spawn/write/file`, `eval()`, `Function()`, `process.env`. Plugins must go through `ctx` for everything.

## Secret & State Management

```typescript
const { key } = deriveKey("password");  // PBKDF2, 100K iterations
const secrets = createSecretStore(key);  // AES-256-GCM encrypted

secrets.set(ctx, "GITHUB_TOKEN", "ghp_xxx...", { expiresAt: ... });
const token = secrets.get(ctx, "GITHUB_TOKEN");  // decrypted on access

// Audit logs NEVER contain secret values — structurally [REDACTED]
// Key enumeration respects glob capability patterns
// HMAC integrity verification on snapshots
// Master key rotation without data loss
```

## Security Model

| Layer | What it catches |
|---|---|
| **TypeScript compiler** | Unauthorized capability usage (compile-time type error) |
| **Runtime guard** | Path/domain/key pattern violations (`demand()` throws) |
| **VM sandbox** | Agent imports of `node:fs`, `child_process`, `require`, `process` |
| **VFS isolation** | Server-mode agents never touch real disk |
| **Symlink resolution** | Path traversal attacks via symlinks |
| **Recursive traversal** | Per-path capability checks in `ls`, `du`, `rm`, `cp` |
| **Secret redaction** | Values structurally impossible to appear in audit logs |
| **HMAC integrity** | Tampered secret store snapshots detected |
| **Docker isolation** | Heavy/native work in ephemeral containers, not on host |
| **Docker image caps** | `docker:run` capability controls which images an agent can use |
| **Egress proxy** | Containers route through BunShell proxy — only `net:fetch` allowed domains pass |

## Commands

```bash
bun run shell           # Interactive TypeScript shell (highlighted, type-checked)
bun run shell:audit     # Shell with audit logging to console
bun run server          # JSON-RPC server on port 7483
bun test                # Run 542 tests
bun run typecheck       # TypeScript type checking
bun run check           # Both typecheck + tests
```

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              Any Agent Harness                        │
│   Claude Code / Cursor / Custom Agent                 │
├───────────────── JSON-RPC 2.0 ───────────────────────┤
│  BunShell Server       │  BunShell TUI Shell          │
│  Sessions + VFS        │  pi-tui + syntax highlight   │
│  + Git Mount + Audit   │  + live tsc + param hints    │
├──────────────────────────────────────────────────────┤
│  Secrets & Auth    Encrypted store, OAuth2, cookies   │
│  Agent Sandbox     VM-isolated subprocess execution   │
│  Audit System      Auto-logged, 3 sinks              │
│  Pipe System       Array + Stream O(1) + Viz          │
│  Docker            Compute Plane — VFS ↔ volume sync  │
│  Dynamic Plugins   Agent-written wrappers (plugin:*)  │
│  90+ Wrappers      Every operation typed + checked    │
│  14+N Cap Types    Compile-time + dynamic plugins     │
├──────────────────────────────────────────────────────┤
│              Bun Runtime                              │
└──────────────────────────────────────────────────────┘
```

## Stats

- **24,000+ lines** of TypeScript
- **542 tests**, 0 failures, 0 type errors
- **90+ wrapper functions** across 19 modules
- **14+N capability types** — 14 core + dynamic `plugin:${string}` — enforced by the TypeScript compiler
- **Dynamic plugins** — agents write their own wrappers, validated + approved + injected
- **Docker Compute Plane** — VFS ↔ volume sync, daemon containers, streaming, egress proxy
- **Live Mount** — bi-directional VFS ↔ disk sync (auto-flush or draft mode)
- **Typed builder** — capabilities auto-infer `CapabilityContext<K>` without annotation
- **2 runtime dependencies**: `@mariozechner/pi-tui` (TUI), `chalk` (colors)
- **33 commits** of incremental, tested development

## License

MIT
