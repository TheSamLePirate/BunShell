# Installing BunShell

BunShell is a self-hosted server with a built-in React dashboard. You clone it, build it, and run it on your machine (or wherever you want it).

## Requirements

- [Bun](https://bun.com) — latest stable. The runtime *and* the package manager.
- That's it. No Node.js, no npm, no Docker required for basic use. (Docker is optional and only needed for `dockerRun` / `dockerVfsRun` features.)

## Install

```bash
git clone https://github.com/<your-fork-or-this-repo>/bunshell.git
cd bunshell
bun install              # root deps (~99 packages)
bun run build            # installs dashboard deps + builds dashboard/dist
```

## Run

```bash
bun run start            # JSON-RPC server + dashboard at http://127.0.0.1:7483
```

Open `http://127.0.0.1:7483` in a browser. The dashboard talks to the server over the same origin — no CORS gymnastics.

| URL | Serves |
|---|---|
| `GET  /` | Dashboard SPA (`index.html` + assets). React Router handles in-app routes. |
| `GET  /healthz` | JSON `{ name, version, sessions, uptime, ... }` for monitoring/probes. |
| `GET  /events` | Server-Sent Events stream of audit entries (used by the live audit panel). |
| `POST /` | JSON-RPC 2.0 endpoint — every wrapper, every session operation, every admin call. |

## Common flags

```bash
bun run start --port 8080                    # custom port
bun run start --no-ui                        # disable the dashboard, RPC + healthz only
bun run start --dashboard-dir ./custom/dist  # serve a custom dashboard build
```

`BUNSHELL_DASHBOARD_DIR` env works the same as `--dashboard-dir` (CLI flag wins).

## Development mode

If you want hot-reloaded dashboard development:

```bash
bun run server &              # JSON-RPC server on :7483
bun run dashboard:dev         # vite on :5173, proxies /api → :7483
```

Open `http://127.0.0.1:5173`.

## Scaffold an agent config

In any repo where you want BunShell to gate the agent's actions:

```bash
bun run init --name my-agent --preset builder
```

This writes `.bunshell.ts` at the repo root with a working capability set you can edit.

## Sanity check

```bash
bun run check                # tsc --noEmit + bun test (should be all green)
curl http://127.0.0.1:7483/healthz | jq
```

## Where things live at runtime

- **Audit JSONL**: wherever the loaded `.bunshell.ts` config points (`audit.jsonl`). Default in the example is `/tmp/<name>-audit.jsonl`.
- **Sessions / VFS state**: in-memory; lost on restart. Use `session.fs.snapshot` to export.
- **Saved configs**: stored in the server process via `admin.config.save` (in-memory).

For self-hosting behind a reverse proxy or in production, see [SELF_HOST.md](SELF_HOST.md).
