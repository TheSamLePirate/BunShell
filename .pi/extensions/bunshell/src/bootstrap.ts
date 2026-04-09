/**
 * Bootstrap — config discovery and BunShell environment creation.
 *
 * On session_start, discovers .bunshell.ts in the project directory,
 * loads the full environment (ctx, vfs, secrets, audit), and stores
 * it for use by tools and UI.
 */

import {
  findConfig,
  loadEnvironment,
  type LoadedEnvironment,
} from "../../../../src/config/loader";
import { streamSink } from "../../../../src/audit/sinks/stream";

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let currentEnv: LoadedEnvironment | null = null;
let auditStream: ReturnType<typeof streamSink> | null = null;

/** Get the current BunShell environment (null if not loaded). */
export function getEnv(): LoadedEnvironment | null {
  return currentEnv;
}

/** Get the audit event stream (for real-time UI updates). */
export function getAuditStream(): ReturnType<typeof streamSink> | null {
  return auditStream;
}

/**
 * Bootstrap BunShell from a project directory.
 *
 * 1. Discovers .bunshell.ts config
 * 2. Loads the full environment (ctx, vfs, secrets, audit)
 * 3. Stores for tool/UI access
 *
 * Returns the LoadedEnvironment or null if no config found.
 */
export async function bootstrap(
  cwd: string,
): Promise<LoadedEnvironment | null> {
  const configPath = findConfig(cwd);
  if (!configPath) return null;

  const env = await loadEnvironment(configPath);
  currentEnv = env;

  return env;
}

/**
 * Teardown — cleanup on session_shutdown.
 */
export async function teardown(): Promise<void> {
  // Flush audit
  if (currentEnv) {
    await currentEnv.audit.flush?.();
  }

  currentEnv = null;
  auditStream = null;
}
