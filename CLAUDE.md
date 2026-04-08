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
bun test              # Run all tests
bun run typecheck     # TypeScript type checking (tsc --noEmit)
bun run check         # Both typecheck + tests
```

## Architecture

5-layer system, built phase by phase:

1. **Capability Types** (`src/capabilities/`) — Types ARE permissions. FSRead, FSWrite, Spawn, NetFetch, etc.
2. **Structured Wrappers** (`src/wrappers/`) — ls(), cat(), grep() return typed objects, not text
3. **Typed Pipes** (`src/pipe/`) — pipe(source, filter, map, sink) with compile-time type flow
4. **Audit System** (`src/audit/`) — Automatic structured logging of all operations
5. **Agent Sandbox** (`src/agent/`) — Subprocess-isolated agent execution

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
- **Subprocess-based sandbox** for agent isolation (not soft sandbox)
- Package name: `bunshell` (unscoped), `@bunshell/*` as internal path aliases only
