# CLAUDE.md — BunShell: Typed Agent Shell System

## Vision

BunShell is a **typed shell and agent operating system** built on Bun and TypeScript. The core insight: TypeScript's type system becomes the **permission and security layer**. Every system call, file access, network request, and process spawn is wrapped in typed capabilities that are verified **at compile time**. Agents interact with the system via standard `import` statements — no DSL, no custom language, pure TypeScript.

This is not a traditional shell. It's an **execution environment where types ARE permissions**, pipes carry structured data, and every action is auditable by design.

## Tech Stack

- **Runtime**: Bun (latest stable)
- **Language**: TypeScript 5.x, strict mode, no `any`
- **Package manager**: Bun
- **No dependencies on**: Node.js APIs, React, npm (use Bun equivalents)
- **Testing**: `bun:test`
- **Build**: `bun build` (no webpack, no esbuild)
- **Target**: macOS first (Darwin), Linux second

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Agent Code                     │
│  import { ls, spawn, pipe } from "@bunshell/core"│
├─────────────────────────────────────────────────┤
│              Layer 4: Audit Logger                │
│  Automatic structured logging of all operations  │
├─────────────────────────────────────────────────┤
│           Layer 3: Typed Pipe System              │
│  pipe(ls("/tmp"), filter(f => f.size > 1024),    │
│       map(f => f.name), write("out.txt"))        │
├─────────────────────────────────────────────────┤
│         Layer 2: Structured Wrappers             │
│  ls() → FileEntry[], ps() → Process[],          │
│  env() → TypedEnv, cat() → Buffer | string      │
├─────────────────────────────────────────────────┤
│        Layer 1: Capability Type System           │
│  FSRead<Path>, FSWrite<Path>, NetFetch<Domain>,  │
│  Spawn<Binary>, EnvRead<Key>                     │
├─────────────────────────────────────────────────┤
│              Bun Runtime Primitives              │
│  Bun.file(), Bun.spawn(), Bun.$, Bun.serve()    │
└─────────────────────────────────────────────────┘
```

## Directory Structure

```
bunshell/
├── CLAUDE.md                    # This file
├── package.json
├── tsconfig.json
├── bunfig.toml
├── src/
│   ├── index.ts                 # Main entrypoint, re-exports public API
│   │
│   ├── capabilities/            # Layer 1 — Capability type system
│   │   ├── types.ts             # Core capability types (FSRead, FSWrite, Spawn, etc.)
│   │   ├── context.ts           # CapabilityContext — the "passport" an agent receives
│   │   ├── guard.ts             # Runtime capability checks (complement to compile-time)
│   │   ├── builder.ts           # Fluent API to build capability sets
│   │   └── presets.ts           # Pre-built capability profiles (readonly, network-only, full)
│   │
│   ├── wrappers/                # Layer 2 — Structured command wrappers
│   │   ├── types.ts             # Shared output types (FileEntry, Process, etc.)
│   │   ├── fs.ts                # ls, cat, stat, mkdir, rm, cp, mv, find, du
│   │   ├── process.ts           # ps, kill, spawn, exec
│   │   ├── net.ts               # fetch, curl, ping, dig, listen
│   │   ├── env.ts               # env, getEnv, setEnv (typed keys)
│   │   ├── text.ts              # grep, sed, awk, sort, uniq, head, tail, wc
│   │   ├── archive.ts           # tar, zip, unzip, gzip
│   │   ├── system.ts            # uname, uptime, whoami, hostname, df, free
│   │   └── index.ts             # Re-exports all wrappers
│   │
│   ├── pipe/                    # Layer 3 — Typed pipe system
│   │   ├── types.ts             # Pipe<In, Out>, PipeStage<A, B>
│   │   ├── pipe.ts              # pipe() function with variadic generics
│   │   ├── operators.ts         # filter, map, reduce, take, skip, groupBy, sortBy
│   │   ├── sources.ts           # from(), fromStream(), fromFile(), fromCommand()
│   │   ├── sinks.ts             # toFile(), toStdout(), toArray(), toJSON(), collect()
│   │   └── index.ts
│   │
│   ├── audit/                   # Layer 4 — Audit system
│   │   ├── types.ts             # AuditEntry, AuditTrail, AuditSink
│   │   ├── logger.ts            # Core audit logger (intercepts all capability usage)
│   │   ├── sinks/               # Pluggable output targets
│   │   │   ├── console.ts       # Pretty-print to terminal
│   │   │   ├── jsonl.ts         # JSONL file output
│   │   │   └── stream.ts        # Real-time event stream
│   │   └── index.ts
│   │
│   ├── agent/                   # Agent runtime
│   │   ├── types.ts             # AgentConfig, AgentHandle
│   │   ├── sandbox.ts           # Create sandboxed agent execution contexts
│   │   ├── loader.ts            # Load and validate agent scripts
│   │   └── index.ts
│   │
│   └── repl/                    # Interactive REPL (optional, phase 2)
│       ├── repl.ts              # Interactive typed shell
│       └── completions.ts       # Type-aware tab completions
│
├── presets/                     # Ready-made capability profiles
│   ├── readonly.ts              # Read-only filesystem agent
│   ├── builder.ts               # Build system agent (fs + spawn limited binaries)
│   ├── network.ts               # Network-only agent (fetch, no fs)
│   └── full.ts                  # Unrestricted (for trusted scripts)
│
├── examples/
│   ├── 01-basic-ls.ts           # Simple ls with typed output
│   ├── 02-pipe-chain.ts         # Pipe: ls → filter → sort → output
│   ├── 03-sandboxed-agent.ts    # Agent with limited capabilities
│   ├── 04-audit-trail.ts        # Full audit logging example
│   ├── 05-custom-wrapper.ts     # How agents create new wrappers
│   └── 06-multi-agent.ts        # Multiple agents with different caps
│
└── tests/
    ├── capabilities/
    │   ├── context.test.ts
    │   ├── guard.test.ts
    │   └── builder.test.ts
    ├── wrappers/
    │   ├── fs.test.ts
    │   ├── process.test.ts
    │   ├── net.test.ts
    │   └── text.test.ts
    ├── pipe/
    │   ├── pipe.test.ts
    │   └── operators.test.ts
    └── audit/
        └── logger.test.ts
```

## Implementation Plan — Phase by Phase

### Phase 1: Foundation — Capability Type System

**Goal**: Define the core types that make permissions compile-time checkable.

```typescript
// src/capabilities/types.ts

/**
 * Glob pattern for path matching.
 * Uses template literal types for compile-time path validation.
 */
type GlobPattern = string; // Runtime validated, but typed in context

/**
 * Core capability types.
 * Each represents a single, atomic permission.
 */
interface FSRead<P extends GlobPattern = "*"> {
  readonly kind: "fs:read";
  readonly pattern: P;
}

interface FSWrite<P extends GlobPattern = "*"> {
  readonly kind: "fs:write";
  readonly pattern: P;
}

interface FSDelete<P extends GlobPattern = "*"> {
  readonly kind: "fs:delete";
  readonly pattern: P;
}

interface Spawn<B extends string = "*"> {
  readonly kind: "process:spawn";
  readonly allowedBinaries: readonly B[];
}

interface NetFetch<D extends string = "*"> {
  readonly kind: "net:fetch";
  readonly allowedDomains: readonly D[];
  readonly allowedPorts?: readonly number[];
}

interface NetListen<P extends number = number> {
  readonly kind: "net:listen";
  readonly port: P;
}

interface EnvRead<K extends string = "*"> {
  readonly kind: "env:read";
  readonly allowedKeys: readonly K[];
}

interface EnvWrite<K extends string = "*"> {
  readonly kind: "env:write";
  readonly allowedKeys: readonly K[];
}

/**
 * Union of all capabilities
 */
type Capability =
  | FSRead
  | FSWrite
  | FSDelete
  | Spawn
  | NetFetch
  | NetListen
  | EnvRead
  | EnvWrite;

/**
 * A CapabilitySet is the "passport" — the full set of what an agent can do.
 * Immutable after creation.
 */
interface CapabilitySet {
  readonly capabilities: readonly Capability[];
  has<C extends Capability>(kind: C["kind"]): boolean;
  get<C extends Capability>(kind: C["kind"]): C | undefined;
  check(required: Capability): CheckResult;
}

interface CheckResult {
  readonly allowed: boolean;
  readonly capability: Capability;
  readonly reason?: string;
}
```

**CapabilityContext** — what an agent actually receives:

```typescript
// src/capabilities/context.ts

/**
 * The execution context for an agent. All system operations
 * go through this — it's the bridge between types and runtime.
 */
interface CapabilityContext {
  readonly id: string;          // Unique agent identifier
  readonly name: string;        // Human-readable name
  readonly caps: CapabilitySet; // Immutable permission set
  readonly audit: AuditLogger;  // Auto-injected logger

  /**
   * Request a sub-context with reduced capabilities.
   * An agent can NEVER escalate — only reduce.
   */
  derive(subset: Capability[]): CapabilityContext;
}
```

**Builder** — fluent API for constructing capability sets:

```typescript
// src/capabilities/builder.ts

// Usage:
const caps = capabilities()
  .fsRead("/home/agent/**")
  .fsWrite("/tmp/**")
  .spawn(["git", "bun", "tsc"])
  .netFetch(["api.github.com", "registry.npmjs.org"])
  .build();
```

**Deliverables Phase 1:**
- All types in `src/capabilities/types.ts`
- `CapabilityContext` implementation in `src/capabilities/context.ts`
- Runtime guard in `src/capabilities/guard.ts` (validates at runtime what types check at compile time)
- Builder in `src/capabilities/builder.ts`
- Presets in `src/capabilities/presets.ts` (readonly, network-only, builder, full)
- Tests for all of the above

### Phase 2: Structured Wrappers

**Goal**: Replace text-based Unix commands with typed functions that return structured data.

**Key principle**: Every wrapper function requires a `CapabilityContext` as first argument. This makes the permission requirement explicit and visible.

```typescript
// src/wrappers/types.ts

interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  permissions: FilePermissions;
  owner: string;
  group: string;
  modifiedAt: Date;
  createdAt: Date;
  accessedAt: Date;
  extension: string | null;
  mime: string | null;
}

interface FilePermissions {
  readable: boolean;
  writable: boolean;
  executable: boolean;
  mode: number;        // e.g. 0o755
  modeString: string;  // e.g. "rwxr-xr-x"
}

interface ProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  args: string[];
  user: string;
  cpu: number;
  memory: number;
  memoryRss: number;
  startedAt: Date;
  state: "running" | "sleeping" | "stopped" | "zombie";
}

interface SpawnResult<T = string> {
  exitCode: number;
  stdout: T;
  stderr: string;
  success: boolean;
  duration: number; // ms
  command: string;
  args: string[];
}

interface GrepMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  match: string;
  context?: {
    before: string[];
    after: string[];
  };
}

interface DiskUsage {
  path: string;
  bytes: number;
  human: string;
  files: number;
  directories: number;
}

interface NetResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: T;
  url: string;
  duration: number;
  redirects: string[];
}
```

**Example wrapper implementations:**

```typescript
// src/wrappers/fs.ts

import type { CapabilityContext, FSRead, FSWrite } from "../capabilities/types";

/**
 * List directory contents with structured output.
 * Requires: FSRead capability matching the path.
 */
export async function ls(
  ctx: CapabilityContext,
  path: string = ".",
  options?: {
    recursive?: boolean;
    hidden?: boolean;
    glob?: string;
    sortBy?: keyof FileEntry;
    order?: "asc" | "desc";
  }
): Promise<FileEntry[]> {
  ctx.caps.check({ kind: "fs:read", pattern: path }); // Throws if not allowed
  ctx.audit.log("fs:read", { op: "ls", path, options });
  // Implementation using Bun.file() and fs APIs
}

/**
 * Read file contents. Return type depends on options.
 */
export async function cat(
  ctx: CapabilityContext,
  path: string,
  options?: { encoding?: BufferEncoding }
): Promise<string>;
export async function cat(
  ctx: CapabilityContext,
  path: string,
  options: { raw: true }
): Promise<Buffer>;
export async function cat(
  ctx: CapabilityContext,
  path: string,
  options?: { encoding?: BufferEncoding; raw?: boolean }
): Promise<string | Buffer> {
  ctx.caps.check({ kind: "fs:read", pattern: path });
  ctx.audit.log("fs:read", { op: "cat", path });
  const file = Bun.file(path);
  if (options?.raw) return Buffer.from(await file.arrayBuffer());
  return file.text();
}

/**
 * Write data to file. Typed input accepted.
 */
export async function write(
  ctx: CapabilityContext,
  path: string,
  data: string | Buffer | object, // object = auto JSON.stringify
  options?: { append?: boolean; mode?: number }
): Promise<{ bytesWritten: number; path: string }> {
  ctx.caps.check({ kind: "fs:write", pattern: path });
  ctx.audit.log("fs:write", { op: "write", path, size: typeof data === "string" ? data.length : undefined });
  // Implementation
}
```

```typescript
// src/wrappers/text.ts

/**
 * Structured grep — returns match objects, not text lines.
 */
export async function grep(
  ctx: CapabilityContext,
  pattern: string | RegExp,
  target: string | string[] | FileEntry[],
  options?: {
    ignoreCase?: boolean;
    maxMatches?: number;
    context?: number; // lines of context
    invert?: boolean;
  }
): Promise<GrepMatch[]> {
  // Validate capability for each file
  // Return structured matches
}
```

**Deliverables Phase 2:**
- All types in `src/wrappers/types.ts`
- `fs.ts`: ls, cat, stat, mkdir, rm, cp, mv, find, du, write, exists, readJson, writeJson
- `process.ts`: ps, kill, spawn, exec (spawn wraps Bun.spawn with capability check)
- `net.ts`: fetch (wraps global fetch with domain check), ping, dig
- `env.ts`: env (list all), getEnv, setEnv (with typed keys)
- `text.ts`: grep, sed, sort, uniq, head, tail, wc, split, join
- `archive.ts`: tar, zip, unzip
- `system.ts`: uname, uptime, whoami, hostname, df
- Each wrapper must: require CapabilityContext, validate capabilities, audit log, return typed data
- Tests for every wrapper function

### Phase 3: Typed Pipe System

**Goal**: Build a pipe operator where output types flow through and are checked at compile time.

```typescript
// src/pipe/types.ts

/**
 * A PipeStage transforms data from type A to type B.
 */
interface PipeStage<A, B> {
  (input: A): B | Promise<B>;
}

/**
 * Pipe function with variadic generics.
 * TypeScript infers the chain: if ls() returns FileEntry[],
 * and filter takes FileEntry[] → FileEntry[],
 * and map takes FileEntry[] → string[],
 * the pipe is fully typed end-to-end.
 */
```

```typescript
// src/pipe/pipe.ts

// Overloads for up to 10 stages (TypeScript variadic limit in practice)
export function pipe<A, B>(source: A | Promise<A>, s1: PipeStage<A, B>): Promise<B>;
export function pipe<A, B, C>(source: A | Promise<A>, s1: PipeStage<A, B>, s2: PipeStage<B, C>): Promise<C>;
export function pipe<A, B, C, D>(source: A | Promise<A>, s1: PipeStage<A, B>, s2: PipeStage<B, C>, s3: PipeStage<C, D>): Promise<D>;
// ... up to 10

// Implementation
export async function pipe(source: any, ...stages: Function[]): Promise<any> {
  let result = await source;
  for (const stage of stages) {
    result = await stage(result);
  }
  return result;
}
```

```typescript
// src/pipe/operators.ts — Generic operators that work on arrays

export function filter<T>(predicate: (item: T) => boolean): PipeStage<T[], T[]>;
export function map<T, U>(fn: (item: T) => U): PipeStage<T[], U[]>;
export function reduce<T, U>(fn: (acc: U, item: T) => U, initial: U): PipeStage<T[], U>;
export function take<T>(n: number): PipeStage<T[], T[]>;
export function skip<T>(n: number): PipeStage<T[], T[]>;
export function sortBy<T>(key: keyof T, order?: "asc" | "desc"): PipeStage<T[], T[]>;
export function groupBy<T>(key: keyof T): PipeStage<T[], Record<string, T[]>>;
export function unique<T>(key?: keyof T): PipeStage<T[], T[]>;
export function flatMap<T, U>(fn: (item: T) => U[]): PipeStage<T[], U[]>;
export function tap<T>(fn: (item: T[]) => void): PipeStage<T[], T[]>; // Side-effect, passthrough
export function count<T>(): PipeStage<T[], number>;
export function first<T>(): PipeStage<T[], T | undefined>;
export function last<T>(): PipeStage<T[], T | undefined>;
export function pluck<T, K extends keyof T>(key: K): PipeStage<T[], T[K][]>;
```

```typescript
// src/pipe/sources.ts

export function from<T>(data: T[]): T[];
export function fromStream<T>(stream: ReadableStream<T>): AsyncIterable<T>;
export function fromFile(ctx: CapabilityContext, path: string): Promise<string>;
export function fromJSON<T>(ctx: CapabilityContext, path: string): Promise<T>;
export function fromCommand(ctx: CapabilityContext, cmd: string, args?: string[]): Promise<string>;
```

```typescript
// src/pipe/sinks.ts

export function toFile(ctx: CapabilityContext, path: string): PipeStage<any, { written: string }>;
export function toJSON(ctx: CapabilityContext, path: string): PipeStage<any, { written: string }>;
export function toStdout<T>(): PipeStage<T, T>; // Print and passthrough
export function collect<T>(): PipeStage<T, T>;   // Identity (materialize)
```

**Example usage:**

```typescript
import { pipe, filter, sortBy, pluck, toFile } from "@bunshell/pipe";
import { ls } from "@bunshell/wrappers";

// Find large files, sorted by size, write names to file
const result = await pipe(
  ls(ctx, "/var/log", { recursive: true }),     // FileEntry[]
  filter<FileEntry>(f => f.size > 1_000_000),   // FileEntry[] (filtered)
  sortBy("size", "desc"),                        // FileEntry[] (sorted)
  pluck("path"),                                 // string[]
  toFile(ctx, "/tmp/large-files.txt")            // { written: string }
);
// Fully typed end-to-end. Compiler catches type mismatches between stages.
```

**Deliverables Phase 3:**
- `pipe()` function with overloads
- All operators in `operators.ts`
- Sources and sinks
- Full type inference tests (ensure `tsc --noEmit` catches wrong pipe chains)
- Integration tests: real pipe chains using wrappers from Phase 2

### Phase 4: Audit System

**Goal**: Every operation through a CapabilityContext is automatically logged with structured data.

```typescript
// src/audit/types.ts

interface AuditEntry {
  timestamp: Date;
  agentId: string;
  agentName: string;
  capability: string;        // "fs:read", "net:fetch", etc.
  operation: string;         // "ls", "cat", "fetch", etc.
  args: Record<string, unknown>;
  result: "success" | "denied" | "error";
  error?: string;
  duration?: number;
  parentId?: string;         // For nested/derived contexts
  metadata?: Record<string, unknown>;
}

interface AuditSink {
  write(entry: AuditEntry): void | Promise<void>;
  flush?(): Promise<void>;
}

interface AuditQuery {
  agentId?: string;
  capability?: string;
  operation?: string;
  result?: "success" | "denied" | "error";
  since?: Date;
  until?: Date;
  limit?: number;
}
```

**Deliverables Phase 4:**
- AuditLogger that wraps CapabilityContext
- Console sink (pretty terminal output with colors)
- JSONL sink (append to file)
- Stream sink (real-time EventEmitter)
- Query API to search audit logs
- Tests

### Phase 5: Agent Sandbox

**Goal**: Provide a safe way to load and execute agent scripts with bounded capabilities.

```typescript
// src/agent/sandbox.ts

interface AgentConfig {
  name: string;
  script: string;            // Path to the agent's .ts file
  capabilities: Capability[];
  timeout?: number;          // Max execution time (ms)
  maxMemory?: number;        // Memory limit (bytes)
  audit?: AuditSink[];       // Where to send audit logs
}

/**
 * Run an agent script in a sandboxed context.
 * The agent receives a CapabilityContext and can only use
 * the wrappers/operations allowed by its capabilities.
 */
async function runAgent(config: AgentConfig): Promise<AgentResult>;

interface AgentResult {
  success: boolean;
  exitCode: number;
  output: unknown;
  auditTrail: AuditEntry[];
  duration: number;
  error?: Error;
}
```

**Agent script format:**

```typescript
// examples/my-agent.ts
// Agents export a default async function that receives a context.

import type { CapabilityContext } from "@bunshell/capabilities";
import { ls, grep } from "@bunshell/wrappers";
import { pipe, filter, map } from "@bunshell/pipe";

export default async function (ctx: CapabilityContext) {
  // This agent can only do what its capabilities allow.
  // If it tries ls("/etc/shadow"), the runtime guard throws.
  
  const logs = await pipe(
    ls(ctx, "/var/log"),
    filter(f => f.extension === "log" && f.modifiedAt > yesterday()),
    map(f => f.path)
  );

  return { recentLogs: logs };
}
```

**Deliverables Phase 5:**
- Agent loader (import + validate)
- Sandbox execution with timeout
- Capability injection
- Example agents in `examples/`
- Integration tests: agent that tries to exceed capabilities gets denied

## Design Principles

1. **Types are permissions.** If it compiles, it's authorized. If it doesn't compile, it's a security violation caught before runtime.

2. **Runtime backs up compile-time.** The capability guard also checks at runtime (defense in depth). An agent that somehow bypasses the type system still hits the runtime check.

3. **No escalation, only reduction.** A context can `derive()` a sub-context with fewer capabilities. Never more. This is enforced structurally — `derive` intersects, never unions.

4. **Structured data everywhere.** No raw text pipes. Every command returns typed objects. If you need text, it's explicit: `toString()` or a `format()` stage.

5. **Audit is automatic, not opt-in.** The CapabilityContext logs every operation. You can't forget to audit — it's built into the execution path.

6. **Agents are TypeScript files.** They `import` from the shell system. They don't learn a new language. An LLM that can write TypeScript can write agents.

7. **Bun-native.** Use `Bun.file()`, `Bun.spawn()`, `Bun.$`, `Bun.serve()`, `Bun.write()` directly. Don't reimplement what Bun provides. Don't use Node.js fs/child_process.

8. **Wrappers are thin.** A wrapper is: capability check → audit log → call Bun primitive → parse output → return typed data. No business logic in wrappers.

## Code Style

- Strict TypeScript: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`
- No `any`. Use `unknown` + type guards when needed.
- No classes unless genuinely needed (prefer functions + interfaces).
- No `default export` except for agent scripts.
- Named exports everywhere.
- Error handling: return `Result<T, E>` types, throw only for capability violations.
- Use `satisfies` operator for type validation of literal objects.
- All public functions must have JSDoc comments with `@example`.
- Max file length: ~300 lines. Split if longer.

## Result Type

Use throughout the codebase:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> { return { ok: true, value }; }
function err<E>(error: E): Result<never, E> { return { ok: false, error }; }
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "paths": {
      "@bunshell/*": ["./src/*"]
    },
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts", "examples/**/*.ts", "tests/**/*.ts"]
}
```

## Testing Strategy

- Unit tests for every function in every module.
- Type tests: files that should fail `tsc --noEmit` (put in `tests/type-errors/`). These validate that the type system correctly rejects unauthorized operations.
- Integration tests: full pipe chains, agent execution, audit output.
- Run with: `bun test`
- Test naming: `describe("ls")` → `it("returns FileEntry[] for valid directory")`, `it("throws CapabilityError when FSRead not granted")`

## Type-Level Security Tests

Create files in `tests/type-errors/` that MUST fail to compile. Use `// @ts-expect-error` to assert this:

```typescript
// tests/type-errors/no-escalation.ts
import { capabilities } from "@bunshell/capabilities";

const readOnly = capabilities().fsRead("/tmp/**").build();

// @ts-expect-error — Cannot add FSWrite to a readonly context
const escalated = readOnly.add({ kind: "fs:write", pattern: "/tmp/**" });
```

## Workflow

1. Start with Phase 1. Get the type system right.
2. Write tests FIRST for each module (TDD).
3. After each phase, run `bun test` AND `tsc --noEmit` to validate.
4. The codebase must compile and pass tests at every commit.
5. Build examples as you go — they're the proof the API is ergonomic.

## What NOT To Build

- No REPL in Phase 1-5 (that's Phase 6, later).
- No CLI binary yet. This is a library first.
- No web UI, no terminal emulator integration.
- No package publishing setup. Focus on the code.
- No config files (YAML, TOML, etc.) for capabilities — everything is TypeScript.

## Success Criteria

When done, this should work:

```typescript
import { createContext, capabilities } from "@bunshell/core";
import { ls, grep, cat } from "@bunshell/wrappers";
import { pipe, filter, sortBy, map, toJSON } from "@bunshell/pipe";

// Create a restricted context
const ctx = createContext({
  name: "log-analyzer",
  capabilities: capabilities()
    .fsRead("/var/log/**")
    .fsWrite("/tmp/reports/**")
    .build()
});

// Fully typed pipeline — compiler verifies every step
const report = await pipe(
  ls(ctx, "/var/log", { recursive: true, glob: "*.log" }),
  filter<FileEntry>(f => f.modifiedAt > oneDayAgo()),
  sortBy("size", "desc"),
  map(async f => ({
    file: f.path,
    lines: (await cat(ctx, f.path)).split("\n").length,
    errors: (await grep(ctx, /ERROR|FATAL/, f.path)).length,
    size: f.size
  })),
  toJSON(ctx, "/tmp/reports/daily.json")
);

// Every operation above is:
// ✓ Type-checked at compile time
// ✓ Permission-checked at runtime
// ✓ Automatically audit-logged
// ✓ Structured data throughout (no text parsing)
```

Start building. Phase 1 first. Tests first. Ship it.
