/**
 * Sandbox worker — runs inside a subprocess with VM isolation.
 *
 * Receives capability config via IPC, creates a sandboxed VM context,
 * loads and executes the agent script with only BunShell APIs available.
 * Direct node:fs, node:child_process, etc. imports are blocked.
 *
 * @internal
 * @module
 */

import { createContext as vmCreateContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import type { WorkerInit, WorkerMessage } from "./types";
import type { AuditLogger, CapabilityKind } from "../capabilities/types";
import type { AuditEntry } from "../audit/types";
import { createContext } from "../capabilities/context";

// BunShell modules — these are the ONLY APIs agents can access
import * as capsMod from "../capabilities/index";
import * as wrappersMod from "../wrappers/index";
import * as pipeMod from "../pipe/index";

const transpiler = new Bun.Transpiler({ loader: "ts" });

function send(msg: WorkerMessage): void {
  if (process.send) {
    process.send(msg);
  }
}

function createWorkerAudit(agentId: string, agentName: string): AuditLogger {
  return {
    log(capability: CapabilityKind, details: Record<string, unknown>): void {
      const entry: AuditEntry = {
        timestamp: new Date(),
        agentId,
        agentName,
        capability,
        operation:
          typeof details["op"] === "string" ? details["op"] : "unknown",
        args: details,
        result: "success",
      };
      send({ type: "audit", entry });
    },
  };
}

/**
 * Build the safe module map that agents can "import" from.
 * This is the whitelist — anything not here is blocked.
 */
function buildModuleMap(
  ctx: ReturnType<typeof createContext>,
): Record<string, Record<string, unknown>> {
  return {
    bunshell: {
      ...capsMod,
      ...wrappersMod,
      ...pipeMod,
    },
    "@bunshell/capabilities": { ...capsMod },
    "@bunshell/wrappers": { ...wrappersMod },
    "@bunshell/pipe": { ...pipeMod },
    // Provide ctx as a pseudo-module
    "@bunshell/context": { ctx },
  };
}

/**
 * Transform ESM-style imports/exports into VM-compatible code.
 *
 * Converts:
 *   import { ls, cat } from "bunshell"     → const { ls, cat } = __require("bunshell")
 *   import type { ... } from "..."          → (removed by transpiler)
 *   export default async function(ctx) {}   → module.exports.default = async function(ctx) {}
 */
function transformImports(
  js: string,
  modules: Record<string, Record<string, unknown>>,
): string {
  let code = js;

  // Transform: import { a, b } from "module"
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']\s*;?/g,
    (_match, names: string, mod: string) => {
      if (!(mod in modules)) {
        throw new Error(
          `Import blocked: "${mod}" is not an allowed module. Only bunshell modules are permitted.`,
        );
      }
      return `const {${names}} = __require("${mod}");`;
    },
  );

  // Transform: import * as X from "module"
  code = code.replace(
    /import\s*\*\s*as\s+(\w+)\s+from\s*["']([^"']+)["']\s*;?/g,
    (_match, name: string, mod: string) => {
      if (!(mod in modules)) {
        throw new Error(
          `Import blocked: "${mod}" is not an allowed module. Only bunshell modules are permitted.`,
        );
      }
      return `const ${name} = __require("${mod}");`;
    },
  );

  // Transform: import X from "module"
  code = code.replace(
    /import\s+(\w+)\s+from\s*["']([^"']+)["']\s*;?/g,
    (_match, name: string, mod: string) => {
      if (!(mod in modules)) {
        throw new Error(
          `Import blocked: "${mod}" is not an allowed module. Only bunshell modules are permitted.`,
        );
      }
      return `const ${name} = __require("${mod}").default;`;
    },
  );

  // Transform: export default ...
  code = code.replace(/export\s+default\s+/g, "module.exports.default = ");

  // Transform: export { ... }
  code = code.replace(/export\s*\{([^}]+)\}\s*;?/g, (_match, names: string) => {
    const items = names.split(",").map((n) => n.trim());
    return items.map((n) => `module.exports.${n} = ${n};`).join("\n");
  });

  // Transform: export const/let/var
  code = code.replace(
    /export\s+(const|let|var)\s+/g,
    (_match, keyword: string) => `${keyword} `,
  );

  return code;
}

async function main(): Promise<void> {
  // Wait for init message from parent
  const init = await new Promise<WorkerInit>((resolve) => {
    process.on("message", (msg: WorkerInit) => {
      resolve(msg);
    });
  });

  const audit = createWorkerAudit(init.agentId, init.agentName);
  const ctx = createContext({
    name: init.agentName,
    capabilities: init.capabilities,
    audit,
    id: init.agentId,
  });

  try {
    // Read and transpile the agent script
    const source = readFileSync(init.script, "utf-8");
    const js = transpiler.transformSync(source);

    // Build the allowed module map
    const modules = buildModuleMap(ctx);

    // Transform ESM imports to __require calls
    const transformedJs = transformImports(js, modules);

    // Create the isolated VM context with only safe globals
    const mod = { exports: {} as Record<string, unknown> };
    const sandbox = vmCreateContext({
      // Module system
      module: mod,
      exports: mod.exports,
      __require: (name: string): Record<string, unknown> => {
        const m = modules[name];
        if (!m) {
          throw new Error(
            `Import blocked: "${name}" is not an allowed module. ` +
              `Only bunshell modules are permitted.`,
          );
        }
        return m;
      },

      // Safe globals
      console,
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      Promise,
      Date,
      JSON,
      Math,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      Buffer,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      performance,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      atob,
      btoa,
      Uint8Array,
      Int8Array,
      Float64Array,

      // NOT provided: process, require, Bun, fetch, import
      // Agents cannot access these directly.
    });

    // Execute the agent script inside the VM
    runInContext(transformedJs, sandbox, {
      filename: init.script,
      timeout: 30000,
    });

    const agentFn = mod.exports["default"];
    if (typeof agentFn !== "function") {
      send({
        type: "error",
        message: `Agent script must export a default function, got ${typeof agentFn}`,
      });
      process.exit(1);
      return;
    }

    const output = await (agentFn as (c: typeof ctx) => Promise<unknown>)(ctx);

    // Serialize/deserialize to cross the VM realm boundary cleanly
    const cleanOutput =
      output !== undefined && output !== null
        ? JSON.parse(JSON.stringify(output))
        : null;

    send({ type: "result", output: cleanOutput });
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", message });
    process.exit(1);
  }
}

main();
