/**
 * Session manager — each session is an isolated execution environment.
 *
 * A session has:
 * - Its own CapabilityContext (permissions)
 * - Its own VirtualFilesystem (no disk access)
 * - Its own AuditLogger (full trail)
 * - TypeScript evaluation via Bun.Transpiler
 *
 * @module
 */

import type { Capability, CapabilityContext } from "../capabilities/types";
import { createContext } from "../capabilities/context";
import { createAuditLogger, type FullAuditLogger } from "../audit/logger";
import { createVfs, type VirtualFilesystem } from "../vfs/vfs";

// BunShell modules injected into eval scope
import * as capsMod from "../capabilities/index";
import * as pipeMod from "../pipe/index";
// Import specific wrappers that work without real FS
import * as cryptoMod from "../wrappers/crypto";
import * as dataMod from "../wrappers/data";
import * as scheduleMod from "../wrappers/schedule";
import * as textMod from "../wrappers/text";
import { createPluginRegistry, type PluginRegistry } from "../wrappers/dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Session {
  readonly id: string;
  readonly name: string;
  readonly ctx: CapabilityContext;
  readonly vfs: VirtualFilesystem;
  readonly audit: FullAuditLogger;
  readonly plugins: PluginRegistry;
  readonly createdAt: Date;
  executions: number;
  readonly timeout: number;
}

export interface ExecResult {
  value: unknown;
  type: string;
  duration: number;
}

// ---------------------------------------------------------------------------
// Transpiler
// ---------------------------------------------------------------------------

const transpiler = new Bun.Transpiler({ loader: "ts" });

// ---------------------------------------------------------------------------
// Session manager
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SessionManager {
  create(opts: {
    name: string;
    capabilities: readonly Capability[];
    files?: Record<string, string>;
    timeout?: number;
  }): Session;

  get(id: string): Session | undefined;
  destroy(id: string): Session | undefined;
  list(): Session[];

  execute(
    sessionId: string,
    code: string,
    timeout?: number,
  ): Promise<ExecResult>;
}

let counter = 0;

/**
 * Create a session manager.
 *
 * @example
 * ```ts
 * const mgr = createSessionManager();
 * const session = mgr.create({
 *   name: "my-agent",
 *   capabilities: [{ kind: "fs:read", pattern: "**" }],
 *   files: { "/app/index.ts": "console.log('hello')" },
 * });
 * const result = await mgr.execute(session.id, 'vfs.readFile("/app/index.ts")');
 * ```
 */
export function createSessionManager(): SessionManager {
  const sessions = new Map<string, Session>();

  return {
    create(opts) {
      counter++;
      const id = `session-${counter}-${Date.now().toString(36)}`;

      const audit = createAuditLogger({
        agentId: id,
        agentName: opts.name,
      });

      const ctx = createContext({
        name: opts.name,
        capabilities: opts.capabilities.slice(),
        audit,
        id,
      });

      const vfs = createVfs();

      // Pre-populate files
      if (opts.files) {
        for (const [path, content] of Object.entries(opts.files)) {
          vfs.writeFile(path, content);
        }
      }

      const plugins = createPluginRegistry();

      const session: Session = {
        id,
        name: opts.name,
        ctx,
        vfs,
        audit,
        plugins,
        createdAt: new Date(),
        executions: 0,
        timeout: opts.timeout ?? 30000,
      };

      sessions.set(id, session);
      return session;
    },

    get(id) {
      return sessions.get(id);
    },

    destroy(id) {
      const session = sessions.get(id);
      if (session) sessions.delete(id);
      return session;
    },

    list() {
      return [...sessions.values()];
    },

    async execute(
      sessionId: string,
      code: string,
      timeout?: number,
    ): Promise<ExecResult> {
      const session = sessions.get(sessionId);
      if (!session) throw new Error(`Session not found: ${sessionId}`);

      session.executions++;
      const start = performance.now();

      // Transpile TS to JS
      let js: string;
      try {
        js = transpiler.transformSync(code);
      } catch (e) {
        throw new Error(
          `TypeScript error: ${e instanceof Error ? e.message : String(e)}`,
          { cause: e },
        );
      }

      // Build evaluation scope — VFS wrappers + BunShell pure modules
      const scope: Record<string, any> = {
        ctx: session.ctx,
        audit: session.audit,
        vfs: session.vfs,

        // VFS-backed file operations (shadow real FS wrappers)
        ls: (path: string = "/") => {
          session.ctx.caps.demand({ kind: "fs:read", pattern: path });
          session.audit.log("fs:read", { op: "ls", path });
          return session.vfs.readdir(path);
        },
        cat: (path: string) => {
          session.ctx.caps.demand({ kind: "fs:read", pattern: path });
          session.audit.log("fs:read", { op: "cat", path });
          return session.vfs.readFile(path);
        },
        write: (path: string, content: string) => {
          session.ctx.caps.demand({ kind: "fs:write", pattern: path });
          session.audit.log("fs:write", { op: "write", path });
          session.vfs.writeFile(path, content);
          return { bytesWritten: content.length, path };
        },
        exists: (path: string) => {
          session.ctx.caps.demand({ kind: "fs:read", pattern: path });
          return session.vfs.exists(path);
        },
        stat: (path: string) => {
          session.ctx.caps.demand({ kind: "fs:read", pattern: path });
          session.audit.log("fs:read", { op: "stat", path });
          return session.vfs.stat(path);
        },
        mkdir: (path: string) => {
          session.ctx.caps.demand({ kind: "fs:write", pattern: path });
          session.audit.log("fs:write", { op: "mkdir", path });
          session.vfs.mkdir(path);
        },
        rm: (path: string, opts?: { recursive?: boolean }) => {
          session.ctx.caps.demand({ kind: "fs:delete", pattern: path });
          session.audit.log("fs:delete", { op: "rm", path });
          session.vfs.rm(path, opts);
        },
        cp: (src: string, dest: string) => {
          session.ctx.caps.demand({ kind: "fs:read", pattern: src });
          session.ctx.caps.demand({ kind: "fs:write", pattern: dest });
          session.vfs.cp(src, dest);
        },
        append: (path: string, content: string) => {
          session.ctx.caps.demand({ kind: "fs:write", pattern: path });
          session.audit.log("fs:write", { op: "append", path });
          session.vfs.append(path, content);
        },
        readJson: (path: string) => {
          session.ctx.caps.demand({ kind: "fs:read", pattern: path });
          return JSON.parse(session.vfs.readFile(path));
        },
        writeJson: (path: string, data: unknown) => {
          session.ctx.caps.demand({ kind: "fs:write", pattern: path });
          const content = JSON.stringify(data, null, 2);
          session.vfs.writeFile(path, content);
          return { bytesWritten: content.length, path };
        },
        glob: (pattern: string, cwd?: string) => {
          session.audit.log("fs:read", { op: "glob", pattern });
          return session.vfs.glob(pattern, cwd);
        },

        // Pure modules (no FS needed)
        ...capsMod,
        ...pipeMod,
        ...cryptoMod,
        ...dataMod,
        ...scheduleMod,
        ...textMod,

        // Dynamic plugin exports (injected after approval)
        ...session.plugins.allExports(),

        // JS builtins
        console,
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Map,
        Set,
        Promise,
        Error,
        Buffer,
        URL,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        setTimeout,
        clearTimeout,
        TextEncoder,
        TextDecoder,
        Uint8Array,
        performance,
      };

      // User vars persist across executions in same session
      const userVars: Record<string, any> = {};

      // Transform variable declarations to capture
      const wrappedJs = js.trim().replace(/;$/, "");
      const declMatch = wrappedJs.match(
        /^(?:const|let|var)\s+(\w+)\s*=\s*([\s\S]+)$/,
      );

      const scopeKeys = [...Object.keys(scope), ...Object.keys(userVars)];
      const scopeValues = scopeKeys.map((k) =>
        userVars[k] !== undefined ? userVars[k] : scope[k],
      );

      let value: unknown;

      const execTimeout = timeout ?? session.timeout;

      // Cancellable timeout — clears when execution finishes to prevent
      // unhandled rejection crashes
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(
          () => reject(new Error(`Execution timed out after ${execTimeout}ms`)),
          execTimeout,
        );
      });

      try {
        if (declMatch) {
          const varName = declMatch[1]!;
          const expr = declMatch[2]!;
          const fn = new Function(
            ...scopeKeys,
            `return (async () => { return (${expr}); })()`,
          );
          value = await Promise.race([fn(...scopeValues), timeoutPromise]);
          userVars[varName] = value;
        } else {
          try {
            const fn = new Function(
              ...scopeKeys,
              `return (async () => { return (${wrappedJs}); })()`,
            );
            value = await Promise.race([fn(...scopeValues), timeoutPromise]);
          } catch (innerErr) {
            // If it's a syntax error (not timeout), try as statements
            if (
              innerErr instanceof SyntaxError ||
              (innerErr instanceof Error &&
                innerErr.message.includes("Unexpected token"))
            ) {
              const fn = new Function(
                ...scopeKeys,
                `return (async () => { ${wrappedJs}; })()`,
              );
              await Promise.race([fn(...scopeValues), timeoutPromise]);
              value = undefined;
            } else {
              throw innerErr;
            }
          }
        }
      } finally {
        // CRITICAL: always clear the timeout timer to prevent the rejection
        // from firing after execution completes and crashing the process
        if (timeoutTimer) clearTimeout(timeoutTimer);
      }

      const duration = performance.now() - start;
      const type = getTypeName(value);

      return { value, type, duration };
    },
  };
}

function getTypeName(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `Array[${value.length}]`;
  }
  if (value instanceof Date) return "Date";
  if (typeof value === "object") {
    if ("bytesWritten" in value) return "WriteResult";
    if ("isFile" in value) return "VfsStat";
    if ("name" in value && "path" in value && "isFile" in value)
      return "VfsEntry";
    return "object";
  }
  return typeof value;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
