# BunShell

**A typed execution layer for AI agents.** TypeScript's type system _is_ the permission model.

Every file read, network request, process spawn, and database query goes through typed capabilities that are checked at compile time and enforced at runtime. Agents operate on a virtual filesystem in isolated sessions — nothing touches disk unless you say so.

BunShell is what happens when you take the "bash is not enough" thesis seriously: a typed, sandboxed, auditable TypeScript environment that any agent harness can use as its execution backend.

## Quick Start

```bash
bun install
```

### Interactive REPL

```bash
bun run shell
```

```typescript
bunshell ts > await ls(ctx, "src", { recursive: true, glob: "*.ts" })
// : FileEntry[31]
FileEntry[31] [
  FileEntry { name: "index.ts", size: 342, extension: "ts", ... },
  ...
]

bunshell ts > await pipe(ls(ctx, "."), filter(f => f.isFile), sortBy("size", "desc"), toTable())
┌──────────┬────────┬───────────┐
│ name     │   size │ extension │
├──────────┼────────┼───────────┤
│ bun.lock │ 20,638 │ lock      │
│ ...      │    ... │ ...       │
└──────────┴────────┴───────────┘

bunshell ts > .type FileEntry
interface FileEntry {
  name: string
  path: string
  size: number
  isDirectory: boolean
  ...
}
```

### Server Mode

```bash
bun run server
```

Any harness (Claude Code, Cursor, custom) connects via JSON-RPC:

```bash
# Create an isolated session with virtual filesystem
curl -X POST http://127.0.0.1:7483 -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 1,
  "method": "session.create",
  "params": {
    "name": "my-agent",
    "capabilities": [
      { "kind": "fs:read", "pattern": "*" },
      { "kind": "fs:write", "pattern": "/output/**" }
    ],
    "files": {
      "/src/app.ts": "export const main = () => console.log(\"hello\");",
      "/src/utils.ts": "export function add(a: number, b: number) { return a + b; }"
    }
  }
}'

# Execute typed TypeScript in the session
curl -X POST http://127.0.0.1:7483 -H 'Content-Type: application/json' -d '{
  "jsonrpc": "2.0", "id": 2,
  "method": "session.execute",
  "params": { "sessionId": "session-1-...", "code": "ls(\"/src\")" }
}'
# → { "value": [{ "name": "app.ts", ... }, { "name": "utils.ts", ... }], "type": "Array[2]" }
```

## Why Not Bash?

| Problem | Bash | BunShell |
|---|---|---|
| Is `rm -rf /` destructive? | No standard to tell | `fs:delete` is a distinct capability type |
| Auto-approve reads, block writes | Impossible | `capabilities().fsRead("**")` — no write granted |
| Agent escapes sandbox | One bad command = game over | VM isolation blocks `node:fs`, `require`, `process` |
| Output of `ls -la` | Raw text, needs parsing | `FileEntry[]` — typed, structured, pipeable |
| Permission scope | All or nothing | Glob patterns: `.fsRead("/src/**").spawn(["git"])` |
| Where data lives | Real disk | Virtual filesystem — nothing touches disk |
| Auditing | Hope you logged it | Every operation automatically recorded |
| Portability | Needs a real machine | JSON-RPC server, sessions, VFS snapshots |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│              Any Agent Harness                        │
│   Claude Code / Cursor / Custom Agent / REPL          │
├───────────────── JSON-RPC 2.0 ───────────────────────┤
│              BunShell Server                          │
│   Sessions × Virtual Filesystem × Audit Trail         │
├──────────────────────────────────────────────────────┤
│  Layer 5: Agent Sandbox        VM-isolated execution  │
│  Layer 4: Audit System         Auto-logged operations │
│  Layer 3: Pipe System          Array + Stream (O(1))  │
│  Layer 2: 80+ Wrappers         Typed structured I/O   │
│  Layer 1: 11 Capability Types  Types ARE permissions  │
├──────────────────────────────────────────────────────┤
│              Bun Runtime                              │
└──────────────────────────────────────────────────────┘
```

## The 11 Capability Types

Every operation requires a capability. No capability = denied at compile time AND runtime.

| Capability | Gates | Example |
|---|---|---|
| `fs:read` | Read files/directories | `{ kind: "fs:read", pattern: "/src/**" }` |
| `fs:write` | Write/create files | `{ kind: "fs:write", pattern: "/tmp/**" }` |
| `fs:delete` | Delete files/directories | `{ kind: "fs:delete", pattern: "/tmp/**" }` |
| `process:spawn` | Execute binaries | `{ kind: "process:spawn", allowedBinaries: ["git"] }` |
| `net:fetch` | HTTP requests | `{ kind: "net:fetch", allowedDomains: ["api.github.com"] }` |
| `net:listen` | Open server port | `{ kind: "net:listen", port: 3000 }` |
| `env:read` | Read env variables | `{ kind: "env:read", allowedKeys: ["HOME", "PATH"] }` |
| `env:write` | Modify env variables | `{ kind: "env:write", allowedKeys: ["NODE_ENV"] }` |
| `db:query` | SQLite database access | `{ kind: "db:query", pattern: "/data/*.db" }` |
| `net:connect` | Raw TCP/UDP | `{ kind: "net:connect", allowedHosts: ["redis.local"] }` |
| `os:interact` | Desktop (notify, clipboard) | `{ kind: "os:interact" }` |

### Builder API

```typescript
const caps = capabilities()
  .fsRead("/src/**")
  .fsWrite("/tmp/**")
  .spawn(["git", "bun"])
  .netFetch(["api.github.com"])
  .envRead(["HOME", "PATH"])
  .dbQuery("/data/**")
  .build();
```

### No Escalation

```typescript
const parent = createContext({ name: "parent", capabilities: [...] });

// Child can only REDUCE permissions, never escalate
const child = parent.derive("child", [
  { kind: "fs:read", pattern: "/src/**" },     // OK if parent has it
  { kind: "fs:write", pattern: "**" },          // DROPPED — parent doesn't have fs:write
]);
```

## 80+ Typed Wrappers

Every wrapper takes a `CapabilityContext`, checks permissions, audit-logs, and returns typed data.

### Filesystem
```typescript
const files = await ls(ctx, "src", { recursive: true, glob: "*.ts", sortBy: "size" });
// → FileEntry[]

const content = await cat(ctx, "src/index.ts");     // → string
const info = await stat(ctx, "src/index.ts");        // → FileEntry
await write(ctx, "/tmp/out.txt", "hello");            // → WriteResult
await chmod(ctx, "/tmp/script.sh", 0o755);
const real = await realPath(ctx, "/tmp/link");        // → string (resolved)
const matches = await globFiles(ctx, "**/*.ts");      // → string[]
```

### Process
```typescript
const result = await spawn(ctx, "git", ["status"]);
// → SpawnResult { exitCode: 0, stdout: "...", success: true, duration: 45 }

const procs = await ps(ctx);                          // → ProcessInfo[]
const output = await exec(ctx, "git", ["branch"]);    // → string (throws on failure)
```

### Network
```typescript
const resp = await netFetch(ctx, "https://api.github.com/user");
// → NetResponse { status: 200, body: {...}, duration: 150 }

await download(ctx, "https://example.com/data.json", "/tmp/data.json");
const server = serve(ctx, { port: 3000, routes: { "/health": () => new Response("ok") } });
```

### Database (SQLite)
```typescript
const db = dbOpen(ctx, "/data/app.db");
db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
db.exec("INSERT INTO users (name) VALUES (?)", ["Alice"]);
const users = db.query<{ id: number; name: string }>("SELECT * FROM users");
db.close();
```

### Git
```typescript
const status = await gitStatus(ctx);
// → GitStatus { branch: "main", staged: [...], unstaged: [...], clean: false }

const commits = await gitLog(ctx, { limit: 10 });     // → GitCommit[]
const branches = await gitBranch(ctx);                  // → GitBranches
```

### Crypto
```typescript
const h = hash("hello", "sha256");                     // → HashResult { hex: "2cf24d...", base64: "..." }
const key = randomBytes(32);
const encrypted = encrypt("secret", key);               // → EncryptResult { ciphertext, iv, tag }
const decrypted = decrypt(encrypted.ciphertext, key, encrypted.iv, encrypted.tag);
```

### Text, Env, System, Archive, Stream, Data, OS, Scheduling, User

See `.help` in the REPL or [the full guide](docs/guide.md) for all 80+ functions.

## Pipe System

### Array Pipe (eager)

```typescript
await pipe(
  ls(ctx, "src", { recursive: true }),
  filter<FileEntry>(f => f.size > 1000),
  sortBy("size", "desc"),
  take(10),
  toTable(),
);
```

### Stream Pipe (lazy, O(1) memory)

```typescript
// Process a 5GB log file with constant memory
const errors = streamPipe(
  lineStream(ctx, "/var/log/huge.log"),
  sFilter(line => line.includes("ERROR")),
  sMap(line => ({ ts: line.slice(0, 23), msg: line.slice(24) })),
  sTake(100),
);
for await (const err of errors) console.log(err);
```

### Visualization Sinks

```typescript
// Table
await pipe(ps(ctx), toTable({ columns: ["pid", "name", "cpu", "memory"] }));

// Bar chart
await pipe(ps(ctx), sortBy("cpu", "desc"), take(10), toBarChart("cpu", "name"));

// Sparkline
await pipe(ls(ctx, "src", { recursive: true }), pluck("size"), toSparkline());

// Histogram
await pipe(ls(ctx, "."), pluck("size"), toHistogram({ buckets: 8 }));
```

## Server Mode

BunShell as an execution backend for any agent harness.

```bash
bun run server
```

### Protocol: JSON-RPC 2.0

| Method | Description |
|---|---|
| `session.create` | New session with capabilities + VFS + files |
| `session.execute` | Run TypeScript in session (VFS-backed) |
| `session.destroy` | Tear down session |
| `session.list` | List active sessions |
| `session.audit` | Query audit trail |
| `session.fs.read` | Read VFS file directly |
| `session.fs.write` | Write VFS file directly |
| `session.fs.list` | List VFS directory |
| `session.fs.snapshot` | Export full VFS state |

### Virtual Filesystem

Sessions operate on an in-memory VFS. Nothing touches disk.

```typescript
// Harness pre-populates files from a git repo
session.create({
  files: { "/src/index.ts": "...", "/src/utils.ts": "..." }
})

// Or mount a real directory into the VFS
session.create({
  mount: { diskPath: "/real/repo", vfsPath: "/workspace" }
})

// Agent code reads/writes VFS — capabilities enforced
session.execute({ code: 'cat("/src/index.ts")' })       // OK
session.execute({ code: 'write("/src/hack.ts", "bad")' }) // DENIED

// Get the VFS back when done
session.fs.snapshot({ sessionId: "..." })
```

## Security Model

### Defense in Depth
1. **Compile time** — TypeScript enforces capability requirements on function signatures
2. **Runtime** — `CapabilitySet.demand()` checks and throws `CapabilityError`
3. **VM sandbox** — Agent subprocesses can't import `node:fs`, `child_process`, `require`, or access `process`
4. **VFS isolation** — Server mode agents never touch real disk
5. **Symlink safety** — Paths resolved through symlinks before capability checks
6. **Recursive traversal** — Per-path checks on `ls`, `du` walks; wildcard enforcement on `rm`, `cp`

### What Gets Blocked

```typescript
// No fs:write → can't write files
write(ctx, "/tmp/hack.txt", "data")
// CapabilityError: No capability of kind "fs:write" granted

// Path outside pattern → denied
cat(ctx, "/etc/passwd")  // ctx only has fsRead("/src/**")
// CapabilityError: Path "/etc/passwd" does not match pattern "/src/**"

// Binary not in allowlist → can't spawn
spawn(ctx, "rm", ["-rf", "/"])  // ctx only allows ["git"]
// CapabilityError: Binary "rm" not in allowed list [git]

// VM sandbox → can't escape
import { readFileSync } from "node:fs"  // in agent script
// Error: Import blocked: "node:fs" is not an allowed module

// derive() can't escalate
parent.derive("child", [{ kind: "fs:write", pattern: "**" }])
// fs:write silently dropped — parent doesn't have it
```

## Commands

```bash
bun run shell           # Interactive TypeScript REPL
bun run shell:audit     # REPL with audit logging
bun run server          # JSON-RPC server on port 7483
bun test                # Run 395 tests
bun run typecheck       # TypeScript type checking
bun run check           # Both typecheck + tests
```

## Examples

```bash
bun run examples/01-basic-ls.ts           # Simple ls with typed output
bun run examples/02-pipe-chain.ts         # Pipe: ls → sort → pluck → stdout
bun run examples/03-sandboxed-agent.ts    # Agent with limited capabilities
bun run examples/04-audit-trail.ts        # Full audit logging
bun run examples/05-denied-operations.ts  # Every denial category demonstrated
bun run examples/06-visualizations.ts     # Tables, bar charts, sparklines
```

## Project Structure

```
bunshell/
├── src/
│   ├── capabilities/   Layer 1 — 11 types, guard, context, builder, presets
│   ├── wrappers/       Layer 2 — 80+ typed functions (fs, process, net, ...)
│   ├── pipe/           Layer 3 — Array pipe + Stream pipe + Visualization
│   ├── audit/          Layer 4 — Logger + 3 sinks (console, JSONL, stream)
│   ├── agent/          Layer 5 — VM-sandboxed subprocess execution
│   ├── vfs/            Virtual filesystem (in-memory, session-scoped)
│   ├── server/         JSON-RPC server (sessions, protocol, handler)
│   └── repl/           TypeScript REPL with autocompletion + type explorer
├── bin/
│   ├── bunshell.ts         Interactive shell entry point
│   └── bunshell-server.ts  Server daemon entry point
├── examples/           6 runnable examples
├── tests/              395 tests across 28 files
└── docs/               Architecture guide
```

## Stats

- **17,400+ lines** of TypeScript
- **395 tests**, 0 failures, 0 type errors
- **80+ wrapper functions** across 15 modules
- **11 capability types** gating every operation
- **0 runtime dependencies** (only dev: typescript, eslint, bun-types)
- **21 commits** of incremental, tested development

## License

MIT
