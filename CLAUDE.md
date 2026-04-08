# CLAUDE.md — BunShell

## What is this?

BunShell is a **typed agent shell system** built on Bun and TypeScript. TypeScript's type system is the permission and security layer. Every system call, file access, network request, and process spawn is wrapped in typed capabilities verified at compile time and enforced at runtime.

## Tech Stack

- **Runtime**: Bun (latest stable)
- **Language**: TypeScript 5.x, strict mode, no `any`
- **Package manager**: Bun
- **Testing**: `bun:test`
- **Linting**: ESLint with typescript-eslint

## Commands

```bash
bun test              # Run all tests (186 tests)
bun run typecheck     # TypeScript type checking (tsc --noEmit)
bun run check         # Both typecheck + tests

# Run examples
bun run examples/01-basic-ls.ts
bun run examples/02-pipe-chain.ts
bun run examples/03-sandboxed-agent.ts
bun run examples/04-audit-trail.ts
```

## Architecture

5-layer system:

```
┌─────────────────────────────────────────────────┐
│                   Agent Code                     │
│  import { ls, spawn, pipe } from "bunshell"      │
├─────────────────────────────────────────────────┤
│  Layer 5: Agent Sandbox (src/agent/)             │
│  Subprocess-isolated execution with IPC          │
├─────────────────────────────────────────────────┤
│  Layer 4: Audit Logger (src/audit/)              │
│  Automatic structured logging of all operations  │
├─────────────────────────────────────────────────┤
│  Layer 3: Typed Pipe System (src/pipe/)          │
│  pipe(ls(...), filter, sortBy, pluck, toFile)    │
├─────────────────────────────────────────────────┤
│  Layer 2: Structured Wrappers (src/wrappers/)    │
│  ls→FileEntry[], ps→ProcessInfo[], grep→Match[]  │
├─────────────────────────────────────────────────┤
│  Layer 1: Capability Types (src/capabilities/)   │
│  FSRead, FSWrite, Spawn, NetFetch — types=perms  │
├─────────────────────────────────────────────────┤
│              Bun Runtime Primitives              │
└─────────────────────────────────────────────────┘
```

### Key modules

- **`src/capabilities/`** — Core type system: Capability, CapabilitySet, CapabilityContext, builder, guard, presets
- **`src/wrappers/`** — fs (ls/cat/stat/write/rm/cp/mv/find/du), process (ps/spawn/exec), net (fetch/ping), env, text (grep/sort/head/tail/wc), system (uname/df/whoami)
- **`src/pipe/`** — pipe() with 10 overloads, 14 operators, sources (from/fromFile/fromJSON/fromCommand), sinks (toFile/toJSON/toStdout/collect)
- **`src/audit/`** — AuditLogger with query API, sinks: console, JSONL, stream (EventEmitter)
- **`src/agent/`** — runAgent() spawns isolated Bun subprocess, passes capabilities via IPC, collects audit trail

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
- **Subprocess-based sandbox** for agent isolation via `child_process.fork()`
- **IPC for audit**: worker sends audit entries to host process in real-time
- Package name: `bunshell` (unscoped), `@bunshell/*` as internal path aliases only
