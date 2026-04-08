#!/usr/bin/env bun

/**
 * BunShell CLI entry point.
 *
 * Usage:
 *   bun run bin/bunshell.ts          # Start interactive shell
 *   bun run bin/bunshell.ts --audit  # Start with audit logging
 */

import { startRepl } from "../src/repl/repl";

const auditConsole = process.argv.includes("--audit");

await startRepl({ auditConsole });
