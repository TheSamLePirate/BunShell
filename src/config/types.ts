/**
 * Portable agent environment configuration types.
 *
 * A .bunshell.ts file exports a BunShellEnv that defines everything
 * an agent needs: capabilities, secrets, VFS mounts, audit sinks.
 * Drop it in any repo and every team member gets the same sandboxed
 * environment.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Environment config
// ---------------------------------------------------------------------------

/**
 * Declarative agent environment configuration.
 *
 * @example
 * ```typescript
 * // .bunshell.ts
 * import type { BunShellEnv } from "bunshell";
 *
 * export default {
 *   name: "code-review-agent",
 *
 *   capabilities: {
 *     fs: { read: ["src/**", "tests/**"], write: ["/tmp/reports/**"] },
 *     process: { spawn: ["git", "bun", "tsc"] },
 *     net: { fetch: ["api.github.com"], listen: [] },
 *     env: { read: ["HOME", "PATH", "NODE_ENV"], write: [] },
 *     db: { query: [] },
 *     secrets: { read: ["GITHUB_*"], write: [] },
 *     os: { interact: false },
 *     docker: { run: ["node:20", "python:3.*"] },
 *     plugins: ["deploy", "formatter"],
 *   },
 *
 *   secrets: {
 *     fromEnv: ["GITHUB_TOKEN", "OPENAI_API_KEY"],
 *   },
 *
 *   vfs: {
 *     mount: [
 *       { live: ".", to: "/workspace", policy: "draft", ignore: ["node_modules/**"] },
 *       { git: "github://owner/repo@main/src", to: "/upstream", include: [".ts"] },
 *     ],
 *   },
 *
 *   audit: {
 *     console: true,
 *     jsonl: "/tmp/audit.jsonl",
 *   },
 *
 *   timeout: 30000,
 * } satisfies BunShellEnv;
 * ```
 */
export interface BunShellEnv {
  /** Agent name. */
  readonly name: string;

  /** Capability grants. Omitted categories = denied. */
  readonly capabilities: CapabilityConfig;

  /** Secrets to load from environment variables into the encrypted store. */
  readonly secrets?: SecretsConfig;

  /** Virtual filesystem mounts. */
  readonly vfs?: VfsConfig;

  /** Audit configuration. */
  readonly audit?: AuditConfig;

  /** Default execution timeout in ms (default: 30000). */
  readonly timeout?: number;
}

/** Capability grants by category. */
export interface CapabilityConfig {
  readonly fs?: {
    readonly read?: readonly string[];
    readonly write?: readonly string[];
    readonly delete?: readonly string[];
  };
  readonly process?: {
    readonly spawn?: readonly string[];
  };
  readonly net?: {
    readonly fetch?: readonly string[];
    readonly listen?: readonly number[];
  };
  readonly env?: {
    readonly read?: readonly string[];
    readonly write?: readonly string[];
  };
  readonly db?: {
    readonly query?: readonly string[];
  };
  readonly secrets?: {
    readonly read?: readonly string[];
    readonly write?: readonly string[];
  };
  readonly os?: {
    readonly interact?: boolean;
  };
  readonly docker?: {
    readonly run?: readonly string[];
  };
  readonly plugins?: readonly string[];
}

/** Secrets configuration. */
export interface SecretsConfig {
  /** Environment variable names to import into the encrypted store. */
  readonly fromEnv?: readonly string[];
  /** Master key password (if not set, auto-generated per session). */
  readonly masterPassword?: string;
}

/** VFS mount configuration. */
export interface VfsConfig {
  /** Mounts to apply. */
  readonly mount?: readonly MountConfig[];
}

/** A single mount — disk, git, or live. */
export type MountConfig =
  | { readonly from: string; readonly to: string }
  | {
      readonly git: string;
      readonly to: string;
      readonly include?: readonly string[];
      readonly exclude?: readonly string[];
      readonly maxFiles?: number;
    }
  | {
      readonly live: string;
      readonly to: string;
      readonly policy?: "auto-flush" | "draft";
      readonly ignore?: readonly string[];
    };

/** Audit output configuration. */
export interface AuditConfig {
  /** Log to console with colors (default: false). */
  readonly console?: boolean;
  /** Append to a JSONL file at this path. */
  readonly jsonl?: string;
}
