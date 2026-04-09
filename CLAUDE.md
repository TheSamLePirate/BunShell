# CLAUDE.md — BunShell

## What is this?

BunShell is a **typed execution layer for AI agents**. TypeScript's type system is the permission model — unauthorized actions are compile-time type errors. `CapabilityContext<K>` is generic over which capability kinds it holds, and every wrapper function's type signature enforces what's required. `tsc` itself rejects code that exceeds its permissions.

## Tech Stack

- **Runtime**: Bun (latest stable)
- **Language**: TypeScript 5.x, strict mode, no `any`
- **Package manager**: Bun
- **Testing**: `bun:test` (542 tests)
- **Linting**: ESLint with typescript-eslint

## Commands

```bash
bun run shell           # Interactive TypeScript shell (highlighted, type-checked)
bun run shell:audit     # Shell with audit logging
bun run server          # JSON-RPC server on port 7483
bun test                # Run all 542 tests
bun run typecheck       # tsc --noEmit
bun run check           # Both typecheck + tests
```

## Architecture

```
Harness (Claude Code / Cursor / Custom) ─── JSON-RPC 2.0
            │
    BunShell Server (sessions + VFS + audit + tsc)
            │
    Secrets & Auth (AES-256-GCM, OAuth2, cookie jar)
    Agent Sandbox (VM-isolated subprocess)
    Audit System (auto-logged, 3 sinks)
    Pipe System (array + stream O(1) + viz)
    Docker Compute Plane (VFS ↔ volume sync, ephemeral containers)
    90+ Wrappers (every operation typed + checked)
    14+N Capability Types (compile-time + dynamic plugins)
            │
        Bun Runtime
```

## Type-Level Permission Model

```typescript
// RequireCap — the core type helper
type RequireCap<K, Required> = [Required] extends [K] ? CapabilityContext<K> : never;

// Every wrapper carries its requirement:
function ls<K>(ctx: RequireCap<K, "fs:read">, ...): Promise<FileEntry[]>
function write<K>(ctx: RequireCap<K, "fs:write">, ...): Promise<WriteResult>
function cp<K>(ctx: RequireCap<K, "fs:read" | "fs:write">, ...): Promise<void>
function dbOpen<K>(ctx: RequireCap<K, "db:query" | "fs:read" | "fs:write">, ...): TypedDatabase
function dockerRun<K>(ctx: RequireCap<K, "docker:run">, ...): Promise<DockerRunResult>
function dockerVfsRun<K>(ctx: RequireCap<K, "docker:run">, vfs, ...): Promise<DockerVfsRunResult>
```

The shell runs `tsc --noEmit` before execution. Type errors block execution.

## Key Modules

- **`src/capabilities/`** — 14 core cap types + `plugin:${string}` template literal, `RequireCap<K>` helper, typed `CapabilityBuilder<K>`, `TypedCapabilitySet<K>`, guard (function dispatch for plugin kinds), presets, context with overloaded `createContext`
- **`src/wrappers/`** — 19 modules: fs, process, net, env, text, system, crypto, archive, stream, data, db, git, server, ws, os, schedule, user, docker, dynamic (plugin system)
- **`src/pipe/`** — Array pipe (14 ops) + Stream pipe (15 lazy ops) + Viz (table, bar, spark, histogram)
- **`src/audit/`** — Logger + 3 sinks (console, JSONL, EventEmitter)
- **`src/agent/`** — VM-sandboxed subprocess execution
- **`src/vfs/`** — In-memory virtual filesystem, session-scoped, `mountGit()` for GitHub repos in RAM, `mountLive()` for bi-directional VFS↔disk sync (auto-flush or draft mode)
- **`src/server/`** — JSON-RPC 2.0 HTTP server, session manager
- **`src/secrets/`** — Encrypted secret store (AES-256-GCM), state store, auth helpers (OAuth2, cookies)
- **`src/wrappers/docker.ts`** — Docker Compute Plane: dockerRun, dockerExec, dockerVfsRun (VFS↔volume sync), dockerBuild, dockerPull, dockerImages, dockerPs, dockerStop, dockerRm, dockerLogs, dockerSpawnBackground (daemon), dockerRunStreaming (async iterable), dockerRunProxied + startEgressProxy (capability-checked egress)
- **`src/repl/`** — pi-tui TUI shell, syntax highlighter, tsc integration (incremental, 5s timeout), type explorer (92 types), signatures (130+ functions), autocompletion

## Code Style

- Strict TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- No `any` — use `unknown` + type guards
- Named exports, no default exports (except agent scripts)
- Error handling: `Result<T, E>` types, throw only for capability violations
- Every wrapper: generic `<K extends CapabilityKind>` with `RequireCap<K, "...">` constraint
- Max file length: ~300 lines (signatures.ts exception: declarative data)
- TDD: tests first, `bun test` and `tsc --noEmit` after every change

## Key Design Decisions

- **`RequireCap<K, Required>`** — `[Required] extends [K]` with tuple wrapper prevents union distribution
- **Default `K = CapabilityKind`** — backward compat: unparameterized context has "all" capabilities
- **Bun.Glob** for path matching (no external deps)
- **Symlink resolution** before capability checks
- **VM sandbox** for agent isolation (`node:vm`, blocks `node:fs`, `child_process`, `require`, `process`)
- **Per-path recursive traversal checks** on ls, du, rm, cp
- **Virtual filesystem** in server mode
- **JSON-RPC 2.0** for harness integration
- **pi-tui** component-based TUI with differential rendering (header + output + editor)
- **Live status header** — BunShell badge green/red/yellow based on background tsc result
- **tsc --noEmit --incremental** before every REPL execution (cached preamble, fixed paths, 5s timeout)
- **Typed builder** — `CapabilityBuilder<K>` accumulates kinds, `TypedCapabilitySet<K>` carries brand, `createContext` overload infers `CapabilityContext<K>`
- **Function parameter hints** — 130+ signatures in `signatures.ts`, shown in TUI via `SignatureHint` component
- **Dynamic plugins** — `plugin:${string}` template literal capability, `validatePlugin()` AST security check (bans `node:*` imports, `Bun.spawn`, `eval`, `process.env`), `PluginRegistry` for request/approve/reject workflow, `workspace/requestPluginApproval` RPC method, session scope injection; transitive security via `RequireCap<K, "plugin:name" | "net:fetch">`
- **Docker Compute Plane** — TS is the Control Plane (typed, fast), Docker is the Compute Plane (native, isolated); `dockerVfsRun()` syncs VFS → temp dir → Docker volume → run → ingest diff back; `dockerSpawnBackground()` for daemon containers (dev servers); `dockerRunStreaming()` for line-by-line output with early kill; `startEgressProxy()` for capability-checked network egress (containers can only reach `net:fetch` allowed domains)
- **Git mounting** — `vfs.mountGit("github://owner/repo", "/path")` loads GitHub repos into VFS via Trees+Blobs API
- **Live mounting** — `vfs.mountLive("/disk/path", "/vfs/path")` bi-directional sync via `fs.watch`; auto-flush (VFS→disk instantly) or draft mode (accumulate diffs, human reviews `diff()` then `flush()` or `discard()`)
- **Secret values structurally impossible** to appear in audit logs (`[REDACTED]`)
- **PBKDF2 key derivation** (100K iterations, SHA-512) for secret store master key
