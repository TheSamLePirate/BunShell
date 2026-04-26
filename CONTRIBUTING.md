# Contributing to BunShell

Thanks for your interest. BunShell is a typed execution layer for AI agents — TypeScript's type system *is* the permission model. Every contribution should preserve that invariant.

## Getting started

```bash
bun install                 # Install root deps
bun run dashboard:install   # Install dashboard deps (separate workspace)
bun run check               # tsc --noEmit + bun test (must be green)
```

If anything fails on a fresh clone, that's a bug — open an issue.

## Repository layout

| Path | Purpose |
|---|---|
| `src/capabilities/` | Cap types, `RequireCap<K>`, builder, guard, presets |
| `src/wrappers/` | 19 modules, ~90 typed wrappers (fs, process, net, db, git, docker, …) |
| `src/pipe/` | Array + stream pipelines, visualisation sinks |
| `src/audit/` | Logger + 3 sinks (console, JSONL, EventEmitter) |
| `src/agent/` | VM-sandboxed subprocess runner |
| `src/vfs/` | In-memory virtual filesystem, GitHub mount, live disk mount |
| `src/server/` | JSON-RPC 2.0 HTTP server + dashboard static handler |
| `src/secrets/` | AES-256-GCM secret store, OAuth2, cookie jar |
| `src/repl/` | pi-tui TUI shell |
| `dashboard/` | React/Vite UI (separate `package.json`) |
| `tests/` | `bun:test`, mirrors `src/` layout |
| `bin/` | CLI entrypoints (`bunshell`, `bunshell-server`, `bunshell-init`) |

## Adding a new wrapper

Every wrapper follows the same shape — see `src/wrappers/fs.ts` for the canonical example.

```ts
export async function myOp<K extends CapabilityKind>(
  ctx: RequireCap<K, "fs:read">,        // 1. Capability constraint in the type
  path: string,
): Promise<MyResult> {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });   // 2. Runtime check
  ctx.audit.log("fs:read", { op: "myOp", path: absPath });  // 3. Audit
  // 4. Do the work
  return { ... };
}
```

Then add a test under `tests/wrappers/` — one path that succeeds, one that's denied:

```ts
it("denies myOp without fs:read", async () => {
  const ctx = createContext({ name: "denied", capabilities: [] });
  await expect(myOp(ctx as never, "/etc/passwd")).rejects.toThrow();
});
```

## Code style

- **Strict TypeScript**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any`.
- **Generic on `K extends CapabilityKind`** for every wrapper that gates on capabilities.
- **Named exports only**, except for agent scripts (which use `export default` for the entry function).
- **Throw only on capability violations** or programmer errors. For expected failure modes, return a `Result<T, E>` shape.
- **One concept per file**, max ~300 lines (the `src/repl/signatures.ts` data table is the documented exception).
- **No comments that restate the code.** Keep comments for non-obvious *why*.

## Testing

- `bun test` — run everything. Should pass on Linux *and* macOS.
- `bun test tests/wrappers/fs.test.ts` — run a single file.
- Cross-platform tests: gate Linux-incompatible code with `describe.skipIf(process.platform === "linux")(...)`. Add a comment pointing at the underlying limitation.
- Network tests (e.g. `tests/vfs/git-mount.test.ts`): gate behind `process.env.GITHUB_TOKEN` so unauthenticated CI doesn't hit rate limits.

## Pull requests

- Branch from `main`. Small, focused commits.
- `bun run check` must pass locally before opening a PR.
- CI runs the same on Ubuntu and macOS.
- Update `CHANGELOG.md` under the unreleased section if your change is user-visible.

## Reporting security issues

Please do not open a public issue for security vulnerabilities. Email the maintainers privately, or use GitHub's private vulnerability reporting if enabled.
