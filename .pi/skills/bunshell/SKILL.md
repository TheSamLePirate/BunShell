---
name: bunshell
description: Execute TypeScript in a capability-checked BunShell session. Use for file operations, process spawning, network requests, Docker containers, git operations, data parsing, and piped transformations — all with typed structured output and compile-time permission enforcement.
---

# BunShell — Typed Execution in TypeScript

BunShell is a typed execution layer where TypeScript's type system IS the permission model. Every operation goes through a `CapabilityContext` that enforces permissions at both compile-time and runtime.

## Prerequisites

Start the BunShell server in a separate terminal:

```bash
cd /path/to/BunShell && bun run server
```

The server runs on `http://127.0.0.1:7483`. Load the pi extension:

```bash
pi -e /path/to/BunShell/.pi/extensions/bunshell/index.ts
```

## Tool: `bunshell_execute`

The primary tool. Write TypeScript code — BunShell executes it with full capability checking.

**All BunShell APIs are pre-imported.** Use `ctx` as the first argument to any capability-checked function. Use `await` for async operations.

### Filesystem

```typescript
// List files — returns FileEntry[] (typed objects, not text)
await ls(ctx, "/workspace")
await ls(ctx, "/workspace/src", { recursive: true, glob: "*.ts" })

// Read file
await cat(ctx, "/workspace/README.md")

// Write file — returns WriteResult { bytesWritten, path }
await write(ctx, "/workspace/output.txt", "hello world")

// JSON read/write
const config = await readJson(ctx, "/workspace/package.json")
await writeJson(ctx, "/workspace/config.json", { port: 3000 })

// Find files by glob
await find(ctx, "/workspace", "**/*.test.ts")
await globFiles(ctx, "**/*.ts", "/workspace/src")

// File info
await stat(ctx, "/workspace/package.json")
await exists(ctx, "/workspace/.env")
await du(ctx, "/workspace/src")

// Copy, move, delete
await cp(ctx, "/workspace/a.ts", "/workspace/b.ts")
await mv(ctx, "/workspace/old.ts", "/workspace/new.ts")
await rm(ctx, "/tmp/trash", { recursive: true })
await mkdir(ctx, "/workspace/new-dir")
```

### Process Execution

```typescript
// Spawn with full structured result
const result = await spawn(ctx, "git", ["status"])
// → SpawnResult { exitCode, stdout, stderr, success, duration, command, args }

// Convenience — returns stdout, throws on failure
const branch = await exec(ctx, "git", ["branch", "--show-current"])

// List processes
const procs = await ps(ctx)

// With options
await spawn(ctx, "npm", ["test"], { cwd: "/workspace", timeout: 60000 })
```

### Git

```typescript
// Structured git operations
const status = await gitStatus(ctx)
// → GitStatus { branch, staged, unstaged, untracked, clean }

const commits = await gitLog(ctx, { limit: 10 })
// → GitCommit[] { hash, shortHash, author, email, date, message }

const diff = await gitDiff(ctx)
// → GitDiffEntry[] { file, additions, deletions }

const { current, branches } = await gitBranch(ctx)

await gitAdd(ctx, ["src/fix.ts"])
await gitCommit(ctx, "fix: resolve issue")
await gitPush(ctx, "origin", "main")
await gitPull(ctx)
await gitStash(ctx, "push")
```

### Network

```typescript
// HTTP fetch — returns NetResponse { status, headers, body, duration }
const resp = await netFetch(ctx, "https://api.github.com/user")

// With options
await netFetch(ctx, "https://api.example.com/data", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "value" }),
})

// Download file
await download(ctx, "https://example.com/file.zip", "/tmp/file.zip")

// DNS lookup
await dig(ctx, "example.com", "A")

// Ping
await ping(ctx, "google.com")
```

### Docker (Compute Plane)

```typescript
// Run container — returns DockerRunResult
const result = await dockerRun(ctx, "node:20-alpine", {
  command: ["node", "-e", "console.log(JSON.stringify({ok:true}))"],
})

// Run script in any language
await dockerExec(ctx, "python:3.12", `
  import json
  print(json.dumps({"pi": 3.14159}))
`)

// List images and containers
await dockerImages(ctx)
await dockerPs(ctx)

// Build from Dockerfile
await dockerBuild(ctx, "/workspace", "my-app:latest")
```

### Pipe System

```typescript
// Chain operations with typed pipes
await pipe(
  ls(ctx, "/workspace/src", { recursive: true }),
  filter(f => f.isFile && f.extension === "ts"),
  sortBy("size", "desc"),
  take(10),
  toTable({ columns: ["name", "size", "path"] })
)

// Pipe to file
await pipe(
  ls(ctx, "/workspace"),
  filter(f => f.size > 10000),
  pluck("path"),
  toFile(ctx, "/tmp/large-files.txt")
)

// Bar chart
await pipe(
  ps(ctx),
  sortBy("cpu", "desc"),
  take(10),
  toBarChart("cpu", "name")
)
```

### Data Processing

```typescript
// Parse/format
const data = parseJSON('{"key": "value"}')
const csv = parseCSV("name,age\nAlice,30\nBob,25")
const toml = parseTOML("[server]\nport = 8080")
const json = formatJSON(data, 2)

// Crypto
const h = hash("hello", "sha256")   // → HashResult { hex, base64, bytes }
const id = randomUUID()
const encoded = base64Encode("secret")
const decoded = base64DecodeString(encoded)

// Encryption
const key = randomBytes(32)
const encrypted = encrypt("secret data", key)
const plain = decrypt(encrypted.ciphertext, key, encrypted.iv, encrypted.tag)
```

### Secrets

```typescript
// Create encrypted secret store
const { key } = deriveKey("password")
const secrets = createSecretStore(key)

// Store and retrieve
secrets.set(ctx, "API_KEY", "sk-xxx...")
const apiKey = secrets.get(ctx, "API_KEY")

// Import from environment
secretFromEnv(ctx, secrets, "GITHUB_TOKEN")
```

### Stream Pipe (O(1) Memory)

```typescript
// Process large files line by line
const errors = streamPipe(
  lineStream(ctx, "/var/log/huge.log"),
  sFilter(line => line.includes("ERROR")),
  sMap(line => ({ ts: line.slice(0, 23), msg: line.slice(24) })),
  sTake(100)
)
for await (const err of errors) {
  console.log(err.ts, err.msg)
}
```

## Tool: `bunshell_fs`

Direct VFS file operations without writing code:

- `action: "read"` + `path` — read file content
- `action: "write"` + `path` + `content` — write file
- `action: "list"` + `path` — list directory entries
- `action: "snapshot"` — export full VFS state

## Tool: `bunshell_audit`

Query the audit trail:

- `limit` — max entries (default 20)
- `capability` — filter by kind (e.g., "fs:read")

Every operation through BunShell is logged with timestamp, capability, operation name, and result.

## Capability Errors

If you attempt an unauthorized operation, you get a clear error:

```
Capability denied [fs:write]: Path "/etc/passwd" does not match pattern "/workspace/**"
```

**Do NOT retry denied operations.** The capabilities are defined in `.bunshell.ts` and cannot be escalated at runtime.

## Key Types

| Type | Fields |
|------|--------|
| `FileEntry` | name, path, size, isFile, isDirectory, permissions, modifiedAt, extension |
| `SpawnResult` | exitCode, stdout, stderr, success, duration, command, args |
| `NetResponse` | status, statusText, headers, body, url, duration |
| `GitStatus` | branch, staged, unstaged, untracked, clean |
| `GitCommit` | hash, shortHash, author, email, date, message |
| `DockerRunResult` | containerId, exitCode, stdout, stderr, success, duration, image |
| `WriteResult` | bytesWritten, path |
| `HashResult` | hex, base64, bytes |
| `DiskUsage` | path, bytes, human, files, directories |

## Reference

See [API reference](references/api-reference.md) for the full list of 90+ functions.
