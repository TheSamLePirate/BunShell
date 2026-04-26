# Self-hosting BunShell

BunShell ships as a single Bun process: HTTP server + JSON-RPC + static dashboard. This guide covers running it somewhere other than your laptop.

> **Security note.** The server has no built-in authentication. Treat it like a database — bind to localhost, put it behind a reverse proxy with auth, or restrict network access. Do not expose it directly to the public internet.

## Behind a reverse proxy (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name bunshell.example.com;

  # ... TLS config ...

  # Proxy auth — bunshell does not authenticate
  auth_basic "BunShell";
  auth_basic_user_file /etc/nginx/htpasswd.bunshell;

  location / {
    proxy_pass http://127.0.0.1:7483;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;

    # SSE: don't buffer, no idle timeout
    proxy_buffering off;
    proxy_read_timeout 1d;
  }
}
```

Critical: `proxy_buffering off` and a long `proxy_read_timeout` for the `/events` SSE stream. Without these, the live audit panel will reconnect every few seconds.

## systemd

`/etc/systemd/system/bunshell.service`:

```ini
[Unit]
Description=BunShell
After=network.target

[Service]
Type=simple
User=bunshell
Group=bunshell
WorkingDirectory=/opt/bunshell
Environment=BUNSHELL_DASHBOARD_DIR=/opt/bunshell/dashboard/dist
ExecStart=/usr/local/bin/bun run /opt/bunshell/bin/bunshell-server.ts --port 7483
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bunshell
journalctl -u bunshell -f
```

## Docker

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && \
    cd dashboard && bun install --frozen-lockfile && bun run build
EXPOSE 7483
CMD ["bun", "run", "bin/bunshell-server.ts", "--port", "7483"]
```

```bash
docker build -t bunshell .
docker run -p 127.0.0.1:7483:7483 -v "$(pwd)/audit:/tmp" bunshell
```

The Docker user inside the container won't have access to your host filesystem unless you bind-mount it explicitly. That's the point — capability-checked agent execution in an already-isolated runtime.

## Splitting dashboard and server

If you want to host the static dashboard on a CDN and only run the RPC server:

```bash
bun run start --no-ui --port 7483
```

Build the dashboard with the server's URL baked in:

```bash
cd dashboard
VITE_BUNSHELL_URL=https://api.bunshell.example.com bun run build
# upload dashboard/dist to your CDN
```

The dashboard's RPC client honours `VITE_BUNSHELL_URL` at build time.

## Health checks

Probes should hit `/healthz` (always JSON, regardless of UI mode):

```bash
curl -fsS http://127.0.0.1:7483/healthz
# {"name":"bunshell","version":"0.6.0","protocol":"json-rpc-2.0","dashboard":true,...}
```

Kubernetes:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 7483
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /healthz
    port: 7483
  periodSeconds: 5
```

## Persisting audit logs

Configure `audit.jsonl` in the agent's `.bunshell.ts` to point at a path you can rotate / ship to a log aggregator:

```ts
audit: {
  console: false,
  jsonl: "/var/log/bunshell/audit.jsonl",
}
```

Rotate with logrotate or vector — JSONL is one event per line.

## Scaling notes

The server is single-process and stateful (sessions live in memory). To scale, run independent instances per tenant or per team. There is no clustered mode today — by design, since the threat model is "one agent, one workspace."
