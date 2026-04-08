# CLAUDE.md — BunShell

## What is this?

BunShell is a **typed execution layer for AI agents** built on Bun and TypeScript. TypeScript's type system is the permission and security layer. Every system call, file access, network request, and process spawn is wrapped in typed capabilities verified at compile time and enforced at runtime. Agents operate on a virtual filesystem in isolated sessions — nothing touches disk unless explicitly synced.

## Tech Stack

- **Runtime**: Bun (latest stable)
- **Language**: TypeScript 5.x, strict mode, no `any`
- **Package manager**: Bun
- **Testing**: `bun:test` (395 tests)
- **Linting**: ESLint with typescript-eslint

## Commands

```bash
bun run shell           # Interactive TypeScript REPL
bun run shell:audit     # REPL with audit logging
bun run server          # JSON-RPC server on port 7483
bun test                # Run all 395 tests
bun run typecheck       # TypeScript type checking (tsc --noEmit)
bun run check           # Both typecheck + tests
```

## Architecture

```
Harness (Claude Code / Cursor / Custom) ──── JSON-RPC 2.0
            │
    BunShell Server (sessions + VFS + audit)
            │
    Layer 5: Agent Sandbox (VM-isolated subprocess)
    Layer 4: Audit System (auto-logged, 3 sinks)
    Layer 3: Pipe System (array + stream O(1) + visualization)
    Layer 2: 80+ Wrappers (typed structured I/O)
    Layer 1: 11 Capability Types (types = permissions)
            │
        Bun Runtime
```

### Key modules

- **`src/capabilities/`** — 11 capability types, builder, guard, presets, context (derive)
- **`src/wrappers/`** — 15 modules: fs, process, net, env, text, system, crypto, archive, stream, data, db, git, server, ws, os, schedule, user
- **`src/pipe/`** — Array pipe (14 operators) + Stream pipe (15 lazy operators) + Visualization (table, bar chart, sparkline, histogram)
- **`src/audit/`** — Logger + 3 sinks (console, JSONL, EventEmitter)
- **`src/agent/`** — VM-sandboxed subprocess execution, blocked node:fs/child_process
- **`src/vfs/`** — In-memory virtual filesystem, session-scoped, snapshot/restore
- **`src/server/`** — JSON-RPC 2.0 HTTP server, session manager, protocol handler
- **`src/repl/`** — TypeScript eval REPL, autocompletion, type explorer (.type)

## Code Style

- Strict TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- No `any` — use `unknown` + type guards
- No classes unless genuinely needed (prefer functions + interfaces)
- Named exports everywhere (no default exports except agent scripts)
- Error handling: `Result<T, E>` types, throw only for capability violations
- Max file length: ~300 lines
- TDD: write tests first, run `bun test` and `tsc --noEmit` after every change

## Key Design Decisions

- **Bun.Glob** for path matching (no external deps)
- **Symlink resolution** before capability checks (prevents escape attacks)
- **Pattern resolution** handles macOS /tmp → /private/tmp transparently
- **VM sandbox** for agent isolation via `node:vm` (blocks node:fs, child_process, require, process)
- **Per-path recursive traversal checks** on ls, du, rm, cp
- **Virtual filesystem** in server mode — agents never touch real disk
- **JSON-RPC 2.0** protocol for harness integration
- **s-prefixed operators** for stream pipe (sFilter, sMap, sTake) to distinguish from array operators
- Package name: `bunshell` (unscoped), `@bunshell/*` as internal path aliases only
