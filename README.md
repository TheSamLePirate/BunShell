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

## The 13 Capability Types

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
| `.help` | All 80+ wrappers organized by category |
| `.type <name>` | Show TypeScript interface (50+ types) |
| `.vars` | Show defined variables with types |
| `.caps` | Show current capabilities |
| `.audit` | Show recent audit entries |
| `.clear` | Clear output |
| `.exit` | Exit |

## 80+ Typed Wrappers

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

## Commands

```bash
bun run shell           # Interactive TypeScript shell (highlighted, type-checked)
bun run shell:audit     # Shell with audit logging to console
bun run server          # JSON-RPC server on port 7483
bun test                # Run 439 tests
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
│  + Audit               │  + live tsc type checking    │
├──────────────────────────────────────────────────────┤
│  Secrets & Auth    Encrypted store, OAuth2, cookies   │
│  Agent Sandbox     VM-isolated subprocess execution   │
│  Audit System      Auto-logged, 3 sinks              │
│  Pipe System       Array + Stream O(1) + Viz          │
│  80+ Wrappers      Every operation typed + checked    │
│  13 Cap Types      Compile-time permission model      │
├──────────────────────────────────────────────────────┤
│              Bun Runtime                              │
└──────────────────────────────────────────────────────┘
```

## Stats

- **20,500+ lines** of TypeScript
- **439 tests**, 0 failures, 0 type errors
- **80+ wrapper functions** across 17 modules
- **13 capability types** enforced by the TypeScript compiler
- **2 runtime dependencies**: `@mariozechner/pi-tui` (TUI), `chalk` (colors)
- **30 commits** of incremental, tested development

## License

MIT
