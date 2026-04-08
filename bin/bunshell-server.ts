#!/usr/bin/env bun

/**
 * BunShell server entry point.
 *
 * Usage:
 *   bun run bin/bunshell-server.ts              # Start on port 7483
 *   bun run bin/bunshell-server.ts --port 8080  # Custom port
 *   bun run bin/bunshell-server.ts --verbose    # Log requests
 */

import { startServer } from "../src/server/serve";

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : undefined;
const verbose = args.includes("--verbose") || args.includes("-v");

startServer({ port, verbose: verbose || true });
