# Changelog

All notable changes to BunShell are documented here.

## [0.5.0] — 2026-04-09

### Added
- **Dynamic Plugins** — `plugin:${string}` template literal capability kind
  - `validatePlugin()` — AST security validation (bans node:* imports, Bun.spawn, eval, process.env)
  - `createPluginRegistry()` — request/approve/reject workflow for agent-written wrappers
  - `workspace.requestPluginApproval` / `workspace.approvePlugin` / `workspace.rejectPlugin` / `workspace.listPlugins` RPC methods
  - Session scope injection — approved plugin exports become available in eval
  - Transitive security — `RequireCap<K, "plugin:name" | "net:fetch">` forces honest capability declaration
  - Builder: `.plugin("name")` accumulates `plugin:name` into type parameter
  - Guard: function-based dispatch (refactored from Record) handles template literal kinds
  - Config: `capabilities.plugins: ["deploy", "tool"]` in `.bunshell.ts`
- 29 new plugin tests (validation, guard, builder, registry, approval, rejection)

### Changed
- Guard refactored from `Record<CapabilityKind, Checker>` to function dispatch (required for template literal keys)
- Test count: 513 → 542

## [0.4.0] — 2026-04-09

### Added
- **Live Mount** — `vfs.mountLive()` / `createLiveMount()` for bi-directional VFS ↔ disk sync
  - `auto-flush` policy: VFS writes go to disk immediately (user sees changes in VS Code)
  - `draft` policy: agent writes stay in RAM; human reviews `diff()` then `flush()` or `discard()`
  - `fs.watch` propagation: user edits on disk appear in VFS instantly
  - `setPolicy()` for runtime switching (draft → auto-flush flushes pending diffs)
  - `ignore` patterns for node_modules, .git, dist, etc.
  - Live mount config support in `.bunshell.ts` (`{ live: ".", to: "/workspace" }`)
- 23 new LiveMount tests (initial load, auto-flush, draft, disk→VFS, unmount, policy switch)

### Changed
- Test count: 490 → 513

## [0.3.0] — 2026-04-09

### Added
- **Daemon containers** — `dockerSpawnBackground()` returns `DockerDaemonHandle` with `status()`, `logs()`, `logStream()`, `exec()`, `waitForPort()`, `stop()`, `kill()`
- **Streaming output** — `dockerRunStreaming()` returns `DockerStream` (AsyncIterable<string> + `kill()`) for line-by-line output with early interruption
- **Egress proxy** — `startEgressProxy()` / `dockerRunProxied()`: HTTP proxy that checks `net:fetch` capabilities before forwarding container traffic; npm install works, curl evil.com gets 403
- 7 new tests (daemon lifecycle, log streaming, streaming kill, proxy allow/block)

### Changed
- Test count: 483 → 490

## [0.2.0] — 2026-04-09

### Added
- **Docker Compute Plane** — 14th capability kind (`docker:run`)
  - `dockerRun()` — run containers with structured output
  - `dockerExec()` — execute scripts in any language via containers
  - `dockerVfsRun()` — VFS ↔ Docker volume sync (flush → mount → run → ingest diff)
  - `dockerBuild()` — build images from Dockerfile
  - `dockerPull()` — pull images
  - `dockerImages()` / `dockerPs()` — list images and containers
  - `dockerStop()` / `dockerRm()` / `dockerLogs()` — container management
- Docker image matching with globs (`python:3.*`) and base-to-tag matching (`node` allows `node:20-alpine`)
- Docker capability in `.bunshell.ts` config (`capabilities.docker.run`)
- 27 Docker tests (capability enforcement + guard checks + daemon integration)
- Docker functions in REPL: `.help`, syntax highlighting, type explorer, parameter hints

### Changed
- Capability count: 13 → 14
- Wrapper count: 80+ → 90+
- Test count: 456 → 483
- `fullPreset` now includes `dockerRun(["*"])`

## [0.1.0] — 2026-04-08

### Added
- **Portable Agent Environments** — `.bunshell.ts` config files
  - `BunShellEnv` interface for declarative capability grants
  - `loadEnvironment()` / `autoLoadEnvironment()` config loader
  - `findConfig()` discovery (`.bunshell.ts`, `bunshell.config.ts`, `.bunshell.js`, `bunshell.config.js`)
  - Automatic VFS mount, secret import, audit sink setup
- **Git Mounting** — `vfs.mountGit("github://owner/repo", "/path")`
  - GitHub Trees + Blobs API, lazy fetch, all in RAM
  - Filters: include/exclude extensions, maxFiles, maxFileSize
  - Token auth via BunShell's secret system
- **Typed Builder** — `CapabilityBuilder<K>` accumulates kinds, `TypedCapabilitySet<K>` carries brand
  - `createContext` overload with `capabilitySet` auto-infers `CapabilityContext<K>`
- **Function Parameter Hints** — 130+ signatures in REPL
- **tsc Performance** — incremental compilation, fixed temp paths, 5s timeout
- **Secret & State Management** — AES-256-GCM encrypted store, PBKDF2 key derivation, OAuth2, cookie jar
- **Server Mode** — JSON-RPC 2.0 with sessions, VFS, audit
- **pi-tui TUI Shell** — syntax highlighting, live tsc status header, type explorer
- **Stream Pipe** — O(1) memory async iterable pipelines (15 lazy operators)
- **Visualization Sinks** — toTable, toBarChart, toSparkline, toHistogram
- **Agent Sandbox** — VM-isolated subprocess execution
- **14 capability types**, 90+ typed wrappers, 483 tests
