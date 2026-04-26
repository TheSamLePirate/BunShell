#!/usr/bin/env bun

/**
 * BunShell server entry point.
 *
 * Usage:
 *   bun run bin/bunshell-server.ts                          # Start on port 7483 with dashboard
 *   bun run bin/bunshell-server.ts --port 8080              # Custom port
 *   bun run bin/bunshell-server.ts --verbose                # Log requests
 *   bun run bin/bunshell-server.ts --no-ui                  # Disable static dashboard handler
 *   bun run bin/bunshell-server.ts --dashboard-dir ./build  # Serve dashboard from a custom path
 *
 * Environment:
 *   BUNSHELL_DASHBOARD_DIR — same as --dashboard-dir (CLI flag wins).
 */

import { startServer } from "../src/server/serve";
import type { ServerOptions } from "../src/server/serve";

const args = process.argv.slice(2);

function flagValue(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : undefined;
}

const port = (() => {
  const v = flagValue("--port");
  return v ? parseInt(v, 10) : undefined;
})();
const verbose = args.includes("--verbose") || args.includes("-v");
const noUi = args.includes("--no-ui");
const dashboardDirFlag = flagValue("--dashboard-dir");
const dashboardDirEnv = process.env["BUNSHELL_DASHBOARD_DIR"];

const opts: ServerOptions = {
  verbose: verbose || true,
  ...(port !== undefined ? { port } : {}),
  ...(noUi
    ? { dashboardDir: false as const }
    : dashboardDirFlag
      ? { dashboardDir: dashboardDirFlag }
      : dashboardDirEnv
        ? { dashboardDir: dashboardDirEnv }
        : {}),
};

startServer(opts);
