# BunShell — The Concept Guide

## What is BunShell?

BunShell is a **typed shell and agent operating system** where TypeScript's type system _is_ the security layer. Instead of relying on OS-level permissions, sandboxes, or policy files, BunShell uses the language itself to control what code can do.

The core insight is simple:

> **If it compiles, it's authorized. If it doesn't compile, it's a security violation — caught before your code ever runs.**

Every file access, network request, process spawn, and environment variable read goes through a **capability check** that the TypeScript compiler can verify at build time, and that a runtime guard enforces as defense-in-depth.

---

## The Problem BunShell Solves

When you let an AI agent (or any script) interact with your system, you face a fundamental question: **what should it be allowed to do?**

Traditional approaches:
- **No restrictions** — dangerous. The agent can delete files, exfiltrate data, spawn anything.
- **OS sandboxing** (containers, seccomp, etc.) — heavy, hard to configure per-agent, no granularity.
- **Policy files** (YAML/JSON configs) — disconnected from the code, easy to get wrong, not type-checked.
- **Runtime-only checks** — you find out permissions are wrong only when the code runs and crashes.

BunShell's approach:
- **Capabilities are TypeScript types.** The permission model lives in the same language as the code.
- **Compile-time verification.** The TypeScript compiler catches unauthorized operations before runtime.
- **Runtime enforcement.** Even if types are bypassed, a runtime guard provides defense-in-depth.
- **Structured data.** No text parsing — every command returns typed objects that flow through typed pipes.

---

## Architecture: 5 Layers

BunShell is built as a stack of 5 layers, each building on the one below:

```
┌──────────────────────────────────────────────────┐
│                  Your Agent Code                  │
│  import { ls, pipe, filter } from "bunshell"      │
├──────────────────────────────────────────────────┤
│  Layer 5: Agent Sandbox                           │
│  Isolated subprocess execution with IPC            │
├──────────────────────────────────────────────────┤
│  Layer 4: Audit System                            │
│  Automatic structured logging of every operation   │
├──────────────────────────────────────────────────┤
│  Layer 3: Typed Pipe System                       │
│  pipe(source, filter, map, sortBy, toFile)         │
├──────────────────────────────────────────────────┤
│  Layer 2: Structured Wrappers                     │
│  ls() → FileEntry[], ps() → ProcessInfo[]          │
├──────────────────────────────────────────────────┤
│  Layer 1: Capability Type System                  │
│  FSRead<"/tmp/**">, Spawn<"git">, NetFetch<"...">  │
├──────────────────────────────────────────────────┤
│              Bun Runtime Primitives               │
│  Bun.file(), Bun.spawn(), Bun.write(), fetch()     │
└──────────────────────────────────────────────────┘
```

Let's walk through each layer.

---

## Layer 1: Capabilities — Types as Permissions

This is the foundation. Every operation in BunShell requires a **capability** — a typed permission object.

### The 8 Capability Types

| Capability | What it allows | Key property |
|---|---|---|
| `FSRead` | Read files/directories | `pattern` (glob) |
| `FSWrite` | Write/create files | `pattern` (glob) |
| `FSDelete` | Delete files/directories | `pattern` (glob) |
| `Spawn` | Execute a binary | `allowedBinaries` (list) |
| `NetFetch` | HTTP requests | `allowedDomains` + `allowedPorts` |
| `NetListen` | Open a server port | `port` |
| `EnvRead` | Read env variables | `allowedKeys` (list) |
| `EnvWrite` | Modify env variables | `allowedKeys` (list) |

Each is a TypeScript interface with a `kind` discriminant:

```typescript
interface FSRead {
  readonly kind: "fs:read";
  readonly pattern: string;  // Glob pattern like "/tmp/**"
}

interface Spawn {
  readonly kind: "process:spawn";
  readonly allowedBinaries: readonly string[];  // ["git", "bun"]
}
```

### Building Capability Sets

Use the fluent builder to create a set of permissions:

```typescript
import { capabilities } from "bunshell";

const caps = capabilities()
  .fsRead("/home/agent/**")     // Can read files under /home/agent/
  .fsWrite("/tmp/**")           // Can write to /tmp/
  .spawn(["git", "bun", "tsc"]) // Can run these 3 binaries
  .netFetch(["api.github.com"]) // Can fetch from this domain
  .envRead(["PATH", "HOME"])    // Can read these 2 env vars
  .build();
```

The `.build()` call returns an immutable `CapabilitySet` — frozen and unmodifiable.

### Presets

For common use cases, BunShell ships 4 presets:

```typescript
import { readonlyPreset, networkOnlyPreset, builderPreset, fullPreset } from "bunshell";

// readonlyPreset   — Read any file, read env vars. Nothing else.
// networkOnlyPreset — Fetch from any domain, read env vars. No filesystem.
// builderPreset    — Read all, write to build dirs, spawn build tools.
// fullPreset       — Unrestricted. For trusted scripts only.
```

---

## The Capability Context

A `CapabilityContext` is the **passport** an agent carries. It bundles:
- An **identity** (id + name)
- A **capability set** (what this agent can do)
- An **audit logger** (records every operation)

```typescript
import { createContext, capabilities } from "bunshell";

const ctx = createContext({
  name: "log-analyzer",
  capabilities: capabilities()
    .fsRead("/var/log/**")
    .fsWrite("/tmp/reports/**")
    .build()
    .capabilities.slice(),
});
```

Every wrapper function takes `ctx` as its first argument. This makes the permission requirement **explicit and visible** — you can never accidentally bypass it.

### The Derive Rule: Only Reduce, Never Escalate

A context can create a sub-context with `derive()`:

```typescript
// Parent can read /tmp/** and /var/log/**
const parent = createContext({
  name: "parent",
  capabilities: capabilities()
    .fsRead("/tmp/**")
    .fsRead("/var/log/**")
    .build().capabilities.slice(),
});

// Child asks for /tmp/** only — this works (subset of parent)
const child = parent.derive("child", [
  { kind: "fs:read", pattern: "/tmp/**" },
]);

// Child tries to add /etc/** — silently dropped (not in parent)
const sneakyChild = parent.derive("sneaky", [
  { kind: "fs:read", pattern: "/etc/**" },  // ← rejected
]);
// sneakyChild.caps.has("fs:read") === false — nothing was granted
```

**An agent can never escalate its own permissions.** `derive()` computes the intersection of what the parent allows and what the child requests.

---

## Layer 2: Structured Wrappers

Traditional Unix commands return text. BunShell wrappers return **typed objects**.

### Filesystem

```typescript
import { ls, cat, stat, exists, write, readJson, rm, find, du } from "bunshell";

// ls returns FileEntry[] — not text
const files = await ls(ctx, "/var/log", {
  recursive: true,
  glob: "*.log",
  sortBy: "size",
  order: "desc",
});

// Each FileEntry is fully typed:
// {
//   name: "app.log",
//   path: "/var/log/app.log",
//   size: 1048576,
//   isFile: true,
//   isDirectory: false,
//   isSymlink: false,
//   permissions: { readable: true, writable: true, executable: false,
//                  mode: 0o644, modeString: "rw-r--r--" },
//   modifiedAt: Date,
//   createdAt: Date,
//   extension: "log",
// }

const content = await cat(ctx, "/var/log/app.log");     // string
const info = await stat(ctx, "/var/log/app.log");        // FileEntry
const found = await exists(ctx, "/var/log/app.log");     // boolean
await write(ctx, "/tmp/out.txt", "hello");               // WriteResult
const data = await readJson<Config>(ctx, "config.json"); // Config
await rm(ctx, "/tmp/old", { recursive: true });
```

### Process

```typescript
import { spawn, exec, ps, kill } from "bunshell";

// spawn returns SpawnResult with structured fields
const result = await spawn(ctx, "git", ["status"]);
// {
//   exitCode: 0,
//   stdout: "On branch main\n...",
//   stderr: "",
//   success: true,
//   duration: 45.2,    // milliseconds
//   command: "git",
//   args: ["status"],
// }

// exec is a convenience — returns stdout, throws on failure
const branch = await exec(ctx, "git", ["branch", "--show-current"]);

// ps returns ProcessInfo[]
const procs = await ps(ctx);
const nodeProcs = procs.filter(p => p.name.includes("node"));
```

### Text Processing

```typescript
import { grep, sort, uniq, head, tail, wc } from "bunshell";

// grep returns GrepMatch[] — not text lines
const errors = await grep(ctx, /ERROR|FATAL/, "/var/log/app.log");
// [
//   { file: "/var/log/app.log", line: 42, column: 1,
//     content: "ERROR: connection timeout", match: "ERROR" },
//   ...
// ]

// Pure text operations (no ctx needed)
const sorted = sort("banana\napple\ncherry");      // "apple\nbanana\ncherry"
const deduped = uniq("a\na\nb\nb\na");              // "a\nb\na"
const first10 = head(text, 10);
const counts = wc("hello world\nfoo bar");
// { lines: 2, words: 4, chars: 19, bytes: 19 }
```

### Network, Environment, System

```typescript
import { netFetch, ping, getEnv, setEnv, uname, whoami, df } from "bunshell";

// Capability-checked HTTP fetch
const resp = await netFetch(ctx, "https://api.github.com/user");
// { status: 200, statusText: "OK", headers: {...}, body: {...},
//   url: "...", duration: 150.3 }

const pong = await ping(ctx, "google.com");
// { host: "google.com", alive: true, time: 12.5 }

const home = getEnv(ctx, "HOME");  // "/Users/you"
setEnv(ctx, "NODE_ENV", "production");

const sys = uname(ctx);
// { os: "darwin", hostname: "mac", release: "...", arch: "arm64",
//   platform: "darwin-arm64" }
```

---

## Layer 3: Typed Pipes

The pipe system lets you chain operations with **compile-time type inference**. If stage 1 outputs `FileEntry[]` and stage 2 expects `string[]`, the TypeScript compiler catches the mismatch.

### Basic Usage

```typescript
import { pipe, filter, sortBy, pluck, map, take, count, toFile } from "bunshell";
import { ls } from "bunshell";

// Find the 5 largest .log files and write their paths to a file
const result = await pipe(
  ls(ctx, "/var/log", { recursive: true, glob: "*.log" }),  // → FileEntry[]
  filter<FileEntry>(f => f.size > 1_000_000),                // → FileEntry[]
  sortBy<FileEntry>("size", "desc"),                          // → FileEntry[]
  take<FileEntry>(5),                                         // → FileEntry[]
  pluck<FileEntry, "path">("path"),                           // → string[]
  toFile(ctx, "/tmp/large-logs.txt"),                         // → WriteResult
);
```

Each arrow shows the type flowing through. The compiler verifies every connection.

### All 14 Operators

| Operator | Input → Output | Description |
|---|---|---|
| `filter<T>(pred)` | `T[]` → `T[]` | Keep elements matching predicate |
| `map<T,U>(fn)` | `T[]` → `U[]` | Transform each element |
| `reduce<T,U>(fn, init)` | `T[]` → `U` | Fold to a single value |
| `take<T>(n)` | `T[]` → `T[]` | First N elements |
| `skip<T>(n)` | `T[]` → `T[]` | Drop first N elements |
| `sortBy<T>(key, order)` | `T[]` → `T[]` | Sort by object key |
| `groupBy<T>(key)` | `T[]` → `Record<string, T[]>` | Group by key |
| `unique<T>(key?)` | `T[]` → `T[]` | Remove duplicates |
| `flatMap<T,U>(fn)` | `T[]` → `U[]` | Map + flatten |
| `tap<T>(fn)` | `T` → `T` | Side effect, passthrough |
| `count<T>()` | `T[]` → `number` | Count elements |
| `first<T>()` | `T[]` → `T \| undefined` | First element |
| `last<T>()` | `T[]` → `T \| undefined` | Last element |
| `pluck<T,K>(key)` | `T[]` → `T[K][]` | Extract one property |

### Sources and Sinks

**Sources** — starting points for pipes:

```typescript
from([1, 2, 3])                          // Direct array
fromFile(ctx, "/tmp/data.txt")           // File as string
fromJSON<Item[]>(ctx, "/tmp/items.json") // Parsed JSON
fromCommand(ctx, "git", ["log"])         // Command stdout
```

**Sinks** — terminal stages:

```typescript
toFile(ctx, "/tmp/output.txt")   // Write to file (arrays join with \n)
toJSON(ctx, "/tmp/report.json")  // Write as formatted JSON
toStdout()                       // Print and passthrough
collect()                        // Identity — materialize the result
```

---

## Layer 4: Audit System

Every operation through a `CapabilityContext` is **automatically logged**. You don't opt in — auditing is built into the execution path.

### Setting Up Auditing

```typescript
import { createAuditLogger, consoleSink, jsonlSink, streamSink } from "bunshell";

const audit = createAuditLogger({
  agentId: "agent-1",
  agentName: "log-analyzer",
  sinks: [
    consoleSink(),                        // Pretty terminal output
    jsonlSink("/tmp/audit.jsonl"),         // Append-only JSON lines file
    streamSink(),                          // Real-time EventEmitter
  ],
});

const ctx = createContext({
  name: "log-analyzer",
  capabilities: [...],
  audit,  // ← inject the audit logger
});

// Now every ls(), cat(), spawn(), fetch() is automatically recorded
```

### Audit Entries

Each entry captures:

```typescript
{
  timestamp: Date,
  agentId: "agent-1",
  agentName: "log-analyzer",
  capability: "fs:read",         // Which capability was used
  operation: "ls",               // Which wrapper function
  args: { path: "/var/log" },    // Arguments passed
  result: "success",             // "success" | "denied" | "error"
  duration: 12.5,                // Optional: milliseconds
  error: undefined,              // Set if denied or errored
  parentId: undefined,           // Set for derived contexts
}
```

### Querying the Audit Trail

```typescript
// Find all denied operations
const denied = audit.query({ result: "denied" });

// Find all filesystem reads by a specific agent
const reads = audit.query({ agentId: "agent-1", capability: "fs:read" });

// Find operations in a time window
const recent = audit.query({
  since: new Date("2024-01-01"),
  until: new Date("2024-01-02"),
  limit: 100,
});
```

### Real-time Monitoring

```typescript
const stream = streamSink();
stream.on("entry", (entry) => {
  if (entry.result === "denied") {
    alert(`SECURITY: ${entry.agentName} tried ${entry.operation} — DENIED`);
  }
});
```

---

## Layer 5: Agent Sandbox

Agents are TypeScript files that run in **isolated subprocesses**. The host process controls what capabilities the agent receives.

### Writing an Agent

An agent is a `.ts` file that exports a default async function:

```typescript
// agents/log-analyzer.ts
import type { CapabilityContext } from "bunshell";
import { ls, grep } from "bunshell";
import { pipe, filter, map } from "bunshell";

export default async function (ctx: CapabilityContext) {
  // This agent can ONLY do what its capabilities allow.
  // If it tries to read /etc/shadow, the runtime guard throws.

  const logs = await pipe(
    ls(ctx, "/var/log"),
    filter(f => f.extension === "log"),
    map(f => f.path),
  );

  return { recentLogs: logs };  // Returned to the host
}
```

### Running an Agent

```typescript
import { runAgent, capabilities, consoleSink } from "bunshell";

const result = await runAgent({
  name: "log-analyzer",
  script: "./agents/log-analyzer.ts",
  capabilities: capabilities()
    .fsRead("/var/log/**")
    .build()
    .capabilities.slice(),
  timeout: 10000,  // Kill after 10 seconds
  sinks: [consoleSink()],
});

// result:
// {
//   success: true,
//   exitCode: 0,
//   output: { recentLogs: [...] },      // What the agent returned
//   auditTrail: [AuditEntry, ...],      // Every operation it performed
//   duration: 245,                       // Total runtime in ms
//   error: undefined,
// }
```

### Isolation Guarantees

- **Subprocess isolation** — each agent runs in its own Bun process via `fork()`.
- **Capability enforcement** — the agent's context only allows what was granted. Attempting anything else throws `CapabilityError`.
- **Timeout** — agents that run too long are killed with `SIGKILL`.
- **Audit trail** — every operation is sent to the host via IPC, even from inside the subprocess.
- **No escalation** — an agent cannot grant itself more permissions.

### What Happens When an Agent Misbehaves?

```typescript
// Agent tries to read outside its allowed pattern
const result = await runAgent({
  name: "sneaky",
  script: "./agents/sneaky.ts",  // Tries to read /etc/passwd
  capabilities: capabilities()
    .fsRead("/tmp/**")            // Only /tmp/ allowed
    .build().capabilities.slice(),
});

// result.success === false
// result.error === "Capability denied [fs:read]: Path \"/etc/passwd\" ..."
// result.auditTrail — still contains the denied attempt
```

---

## Security Model

### Defense in Depth

BunShell has two layers of enforcement:

1. **Compile-time** — TypeScript's type system prevents you from calling a function without passing a `CapabilityContext`. If the types don't match, the code doesn't compile.

2. **Runtime** — Even if types are somehow bypassed (e.g., `as any` cast), the `CapabilitySet.demand()` method checks at runtime and throws `CapabilityError`.

### Symlink Safety

On macOS, `/tmp` is a symlink to `/private/tmp`. A naive glob check would let an attacker create a symlink at `/tmp/safe-link` pointing to `/etc/shadow`, then read it through a `/tmp/**` capability.

BunShell resolves symlinks **before** checking capabilities. The path `/tmp/safe-link → /etc/shadow` becomes `/etc/shadow` for the capability check, which correctly denies it against a `/tmp/**` pattern.

### Pattern Resolution

Both the requested path and the capability pattern are resolved through symlinks. This means:
- Writing `fsRead("/tmp/**")` automatically covers `/private/tmp/**` on macOS.
- No need to know the real paths — BunShell handles the translation transparently.

---

## Mental Model: Think Like a Passport

The best way to understand BunShell is the **passport analogy**:

| Real World | BunShell |
|---|---|
| Passport | `CapabilityContext` |
| Visa stamps | `Capability[]` in the set |
| Border control | `CapabilitySet.demand()` |
| Immigration officer | Runtime guard (glob matching) |
| Embassy issuing visa | `capabilities().fsRead(...).build()` |
| Parent granting child passport | `ctx.derive()` |
| Passport forgery detection | TypeScript compiler |
| Audit log of border crossings | `AuditLogger` |
| Country (sandboxed area) | Agent subprocess |

An agent carries its passport everywhere. Every time it tries to do something (enter a country / read a file), the border control (guard) checks the visa (capability). Every crossing is logged (audit). A parent can give a child a passport with fewer visas (derive), but never more.

---

## Quick Start

### 1. Install

```bash
bun add bunshell
```

### 2. Create a Context

```typescript
import { createContext, capabilities } from "bunshell";

const ctx = createContext({
  name: "my-agent",
  capabilities: capabilities()
    .fsRead("**")           // Read anything
    .fsWrite("/tmp/**")     // Write to /tmp/ only
    .spawn(["git"])         // Can run git
    .build()
    .capabilities.slice(),
});
```

### 3. Use Wrappers

```typescript
import { ls, cat, write, grep, spawn } from "bunshell";

const files = await ls(ctx, "src", { recursive: true, glob: "*.ts" });
const content = await cat(ctx, "src/index.ts");
const matches = await grep(ctx, /TODO/, "src/index.ts");
await write(ctx, "/tmp/output.txt", "hello world");
const result = await spawn(ctx, "git", ["status"]);
```

### 4. Pipe It

```typescript
import { pipe, filter, sortBy, pluck, toFile } from "bunshell";

await pipe(
  ls(ctx, "src", { recursive: true }),
  filter(f => f.extension === "ts" && f.size > 1000),
  sortBy("size", "desc"),
  pluck("path"),
  toFile(ctx, "/tmp/big-ts-files.txt"),
);
```

### 5. Run as a Sandboxed Agent

```typescript
import { runAgent, capabilities } from "bunshell";

const result = await runAgent({
  name: "analyzer",
  script: "./agents/analyzer.ts",
  capabilities: capabilities()
    .fsRead("src/**")
    .build()
    .capabilities.slice(),
  timeout: 5000,
});

console.log(result.output);
console.log(`Agent performed ${result.auditTrail.length} operations`);
```

---

## Project Structure

```
bunshell/
├── src/
│   ├── index.ts                  # Main entrypoint, re-exports all
│   ├── capabilities/             # Layer 1 — Type system
│   │   ├── types.ts              # Core types (Capability, CapabilitySet, etc.)
│   │   ├── guard.ts              # Runtime enforcement (glob matching, symlinks)
│   │   ├── context.ts            # CapabilityContext + derive()
│   │   ├── builder.ts            # Fluent capability builder
│   │   ├── presets.ts            # readonlyPreset, builderPreset, etc.
│   │   └── index.ts
│   ├── wrappers/                 # Layer 2 — Structured commands
│   │   ├── types.ts              # FileEntry, ProcessInfo, GrepMatch, etc.
│   │   ├── fs.ts                 # ls, cat, stat, write, rm, cp, mv, find, du
│   │   ├── process.ts            # ps, kill, spawn, exec
│   │   ├── net.ts                # netFetch, ping
│   │   ├── env.ts                # env, getEnv, setEnv
│   │   ├── text.ts               # grep, sort, uniq, head, tail, wc
│   │   ├── system.ts             # uname, uptime, whoami, hostname, df
│   │   └── index.ts
│   ├── pipe/                     # Layer 3 — Typed pipes
│   │   ├── types.ts              # PipeStage<A, B>
│   │   ├── pipe.ts               # pipe() with 10 overloads
│   │   ├── operators.ts          # filter, map, sortBy, pluck, etc.
│   │   ├── sources.ts            # from, fromFile, fromJSON, fromCommand
│   │   ├── sinks.ts              # toFile, toJSON, toStdout, collect
│   │   └── index.ts
│   ├── audit/                    # Layer 4 — Audit system
│   │   ├── types.ts              # AuditEntry, AuditSink, AuditQuery
│   │   ├── logger.ts             # createAuditLogger with query API
│   │   ├── sinks/
│   │   │   ├── console.ts        # Color-coded terminal output
│   │   │   ├── jsonl.ts          # Append-only JSON lines file
│   │   │   └── stream.ts         # Real-time EventEmitter
│   │   └── index.ts
│   └── agent/                    # Layer 5 — Sandbox
│       ├── types.ts              # AgentConfig, AgentResult, WorkerMessage
│       ├── sandbox.ts            # runAgent() — subprocess orchestration
│       ├── worker.ts             # Runs inside the subprocess
│       └── index.ts
├── examples/
│   ├── 01-basic-ls.ts            # Simple ls with typed output
│   ├── 02-pipe-chain.ts          # Pipe: ls → sort → pluck → stdout
│   ├── 03-sandboxed-agent.ts     # Agent with limited capabilities
│   ├── 04-audit-trail.ts         # Full audit logging
│   └── agents/
│       └── file-lister.ts        # Example agent script
├── tests/                        # 186 tests
│   ├── capabilities/
│   ├── wrappers/
│   ├── pipe/
│   ├── audit/
│   └── agent/
├── CLAUDE.md
├── package.json
└── tsconfig.json
```

---

## Design Principles

1. **Types are permissions.** If it compiles, it's authorized.
2. **Runtime backs up compile-time.** Defense in depth — capability guards check at both layers.
3. **No escalation, only reduction.** `derive()` intersects, never unions.
4. **Structured data everywhere.** No raw text pipes. Every command returns typed objects.
5. **Audit is automatic.** Built into the execution path — you can't forget it.
6. **Agents are TypeScript.** No DSL, no custom language. An LLM that writes TypeScript can write agents.
7. **Bun-native.** Uses `Bun.file()`, `Bun.spawn()`, `Bun.Glob` directly. No Node.js shims.
8. **Wrappers are thin.** Capability check → audit log → call Bun → return typed data. No business logic.
