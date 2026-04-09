/**
 * Dynamic plugin wrapper system.
 *
 * Agents can write their own typed wrappers and register them as plugins.
 * Each plugin is validated (no raw node: imports, no Bun.spawn bypass),
 * capability-checked (plugin:<name> required), and injected into the
 * evaluation scope.
 *
 * Transitive security: plugin functions must use RequireCap<K, "plugin:name" | ...>
 * to honestly declare which core capabilities they need. The type system
 * enforces this at compile time.
 *
 * @module
 */

import type { Capability, CapabilityContext } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of validating a plugin source. */
export interface PluginValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly exports: readonly string[];
}

/** A loaded, validated plugin ready for injection. */
export interface LoadedPlugin {
  readonly name: string;
  readonly source: string;
  readonly exports: Record<string, unknown>;
  readonly exportNames: readonly string[];
  readonly loadedAt: Date;
}

/** Plugin approval status. */
export type PluginApprovalStatus = "pending" | "approved" | "rejected";

/** A plugin pending approval. */
export interface PendingPlugin {
  readonly name: string;
  readonly source: string;
  readonly validation: PluginValidationResult;
  status: PluginApprovalStatus;
  readonly requestedAt: Date;
  readonly requestedBy: string;
}

// ---------------------------------------------------------------------------
// Banned patterns — security validation
// ---------------------------------------------------------------------------

/** Node.js built-in modules that plugins must NOT import directly. */
const BANNED_IMPORT_PATTERNS: readonly RegExp[] = [
  // node: protocol imports
  /\bfrom\s+["']node:/,
  /\bimport\s*\(["']node:/,
  /\brequire\s*\(["']node:/,

  // Bare builtin names
  /\bfrom\s+["'](fs|child_process|net|http|https|dgram|cluster|worker_threads|vm|os|path|crypto|tls|dns|readline|repl|stream|zlib|assert|buffer|console|domain|events|module|process|punycode|querystring|string_decoder|timers|tty|url|util|v8)["']/,
  /\brequire\s*\(["'](fs|child_process|net|http|https|dgram|cluster|worker_threads|vm|os|path|crypto|tls|dns|readline|repl|stream|zlib)["']\)/,
];

/** Direct Bun API calls that bypass the capability system. */
const BANNED_API_PATTERNS: readonly RegExp[] = [
  /\bBun\s*\.\s*spawn\b/,
  /\bBun\s*\.\s*write\b/,
  /\bBun\s*\.\s*file\b/,
  /\bBun\s*\.\s*serve\b/,
  /\bBun\s*\.\s*connect\b/,
  /\bBun\s*\.\s*listen\b/,
  /\bprocess\s*\.\s*env\b/,
  /\bglobalThis\s*\.\s*process\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a plugin source for security.
 *
 * Checks:
 * 1. No raw `node:` imports (must use ctx-based wrappers)
 * 2. No direct Bun API calls (Bun.spawn, Bun.write, etc.)
 * 3. No eval/Function constructor
 * 4. Has at least one export
 *
 * @example
 * ```ts
 * const result = validatePlugin(`
 *   import type { RequireCap, CapabilityKind } from "bunshell";
 *   export async function deploy<K extends CapabilityKind>(
 *     ctx: RequireCap<K, "plugin:deploy" | "net:fetch">,
 *     target: string,
 *   ) {
 *     // Uses ctx for everything — no direct imports
 *   }
 * `);
 * // { valid: true, errors: [], exports: ["deploy"] }
 * ```
 */
export function validatePlugin(source: string): PluginValidationResult {
  const errors: string[] = [];

  // Strip comments to avoid false positives
  const stripped = stripComments(source);

  // Check banned imports
  for (const pattern of BANNED_IMPORT_PATTERNS) {
    if (pattern.test(stripped)) {
      const match = stripped.match(pattern);
      errors.push(
        `Banned import detected: ${match?.[0] ?? pattern.source}. Plugins must use ctx-based wrappers, not raw Node.js imports.`,
      );
    }
  }

  // Check banned API calls
  for (const pattern of BANNED_API_PATTERNS) {
    if (pattern.test(stripped)) {
      const match = stripped.match(pattern);
      errors.push(
        `Banned API call detected: ${match?.[0] ?? pattern.source}. Plugins must use ctx-based wrappers.`,
      );
    }
  }

  // Check for exports
  const exportNames = extractExportNames(source);
  if (exportNames.length === 0) {
    errors.push("Plugin must export at least one function.");
  }

  return {
    valid: errors.length === 0,
    errors,
    exports: exportNames,
  };
}

/** Strip single-line and multi-line comments from source. */
function stripComments(source: string): string {
  return source.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Extract exported function/const names from source. */
function extractExportNames(source: string): string[] {
  const names: string[] = [];
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+(?:async\s+)?function\*\s+(\w+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) names.push(match[1]);
    }
  }

  return names;
}

// ---------------------------------------------------------------------------
// Plugin Registry
// ---------------------------------------------------------------------------

/**
 * Registry for managing dynamic plugins.
 *
 * @example
 * ```ts
 * const registry = createPluginRegistry();
 *
 * // Agent requests a plugin
 * const pending = registry.request("deploy", source, "agent-1");
 *
 * // Validate
 * const validation = validatePlugin(source);
 *
 * // Human approves (via RPC or CLI)
 * const loaded = await registry.approve("deploy", ctx);
 *
 * // Plugin functions are now available
 * loaded.exports.deploy(ctx, "production");
 * ```
 */
export interface PluginRegistry {
  /** Request approval for a new plugin. */
  request(name: string, source: string, requestedBy: string): PendingPlugin;

  /** Get a pending plugin by name. */
  getPending(name: string): PendingPlugin | undefined;

  /** List all pending plugins. */
  listPending(): readonly PendingPlugin[];

  /**
   * Approve and load a pending plugin.
   * Validates the source, transpiles to JS, dynamically imports it.
   * The ctx must have the plugin:<name> capability.
   */
  approve(name: string, ctx: CapabilityContext): Promise<LoadedPlugin>;

  /** Reject a pending plugin. */
  reject(name: string): void;

  /** Get a loaded plugin by name. */
  get(name: string): LoadedPlugin | undefined;

  /** List all loaded plugins. */
  list(): readonly LoadedPlugin[];

  /** Unload a plugin. */
  unload(name: string): boolean;

  /**
   * Get all exported functions from all loaded plugins.
   * Used for injecting into eval scope.
   */
  allExports(): Record<string, unknown>;
}

/**
 * Create a plugin registry.
 */
export function createPluginRegistry(): PluginRegistry {
  const pending = new Map<string, PendingPlugin>();
  const loaded = new Map<string, LoadedPlugin>();

  return {
    request(name: string, source: string, requestedBy: string): PendingPlugin {
      const validation = validatePlugin(source);

      const entry: PendingPlugin = {
        name,
        source,
        validation,
        status: "pending",
        requestedAt: new Date(),
        requestedBy,
      };

      pending.set(name, entry);
      return entry;
    },

    getPending(name: string): PendingPlugin | undefined {
      return pending.get(name);
    },

    listPending(): readonly PendingPlugin[] {
      return [...pending.values()].filter((p) => p.status === "pending");
    },

    async approve(name: string, ctx: CapabilityContext): Promise<LoadedPlugin> {
      const entry = pending.get(name);
      if (!entry) {
        throw new Error(`No pending plugin named "${name}"`);
      }

      if (!entry.validation.valid) {
        throw new Error(
          `Plugin "${name}" failed validation: ${entry.validation.errors.join("; ")}`,
        );
      }

      // Demand the plugin capability
      ctx.caps.demand({
        kind: `plugin:${name}` as Capability["kind"],
        pluginName: name,
      } as Capability);

      // Transpile TS → JS and create a data URL module
      const transpiler = new Bun.Transpiler({ loader: "ts" });
      const js = transpiler.transformSync(entry.source);

      // Write to a temp file for dynamic import (Bun doesn't support data: URLs for import)
      const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");

      const tempDir = await mkdtemp(join(tmpdir(), "bunshell-plugin-"));
      const tempFile = join(tempDir, `${name}.js`);

      try {
        await writeFile(tempFile, js);
        const mod = await import(tempFile);

        const exports: Record<string, unknown> = {};
        const exportNames: string[] = [];

        for (const [key, value] of Object.entries(mod)) {
          if (key === "default") continue;
          exports[key] = value;
          exportNames.push(key);
        }

        // Also include default export if it's a function
        if (typeof mod.default === "function") {
          exports[name] = mod.default;
          exportNames.push(name);
        }

        const plugin: LoadedPlugin = {
          name,
          source: entry.source,
          exports,
          exportNames,
          loadedAt: new Date(),
        };

        loaded.set(name, plugin);
        entry.status = "approved";
        pending.delete(name);

        return plugin;
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },

    reject(name: string): void {
      const entry = pending.get(name);
      if (entry) {
        entry.status = "rejected";
        pending.delete(name);
      }
    },

    get(name: string): LoadedPlugin | undefined {
      return loaded.get(name);
    },

    list(): readonly LoadedPlugin[] {
      return [...loaded.values()];
    },

    unload(name: string): boolean {
      return loaded.delete(name);
    },

    allExports(): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const plugin of loaded.values()) {
        for (const [key, value] of Object.entries(plugin.exports)) {
          result[key] = value;
        }
      }
      return result;
    },
  };
}
