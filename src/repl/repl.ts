/**
 * BunShell TypeScript REPL.
 *
 * An interactive TypeScript evaluation environment with all BunShell
 * APIs pre-imported. Write real TypeScript — get typed structured output.
 *
 * @module
 */

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { createContext } from "../capabilities/context";
import { capabilities } from "../capabilities/builder";
import { createAuditLogger, type FullAuditLogger } from "../audit/logger";
import { consoleSink } from "../audit/sinks/console";
import { createCompleter } from "./completions";
import { formatAuto } from "./format";

// All BunShell exports — injected into eval scope
import * as capsMod from "../capabilities/index";
import * as wrappersMod from "../wrappers/index";
import * as pipeMod from "../pipe/index";
import * as auditMod from "../audit/index";
import * as agentMod from "../agent/index";

// ---------------------------------------------------------------------------
// ANSI
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HISTORY_DIR = join(homedir(), ".bunshell");
const HISTORY_FILE = join(HISTORY_DIR, "history");
const MAX_HISTORY = 1000;

function loadHistory(): string[] {
  try {
    return readFileSync(HISTORY_FILE, "utf-8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

function saveHistory(history: string[]): void {
  try {
    mkdirSync(HISTORY_DIR, { recursive: true });
    writeFileSync(HISTORY_FILE, history.slice(-MAX_HISTORY).join("\n") + "\n");
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// TypeScript transpiler
// ---------------------------------------------------------------------------

const transpiler = new Bun.Transpiler({ loader: "ts" });

function transpileTS(code: string): string {
  return transpiler.transformSync(code);
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for starting the REPL. */
export interface ReplOptions {
  /** Enable audit logging to console (default: false). */
  readonly auditConsole?: boolean;
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

/**
 * Start the BunShell TypeScript REPL.
 *
 * @example
 * ```ts
 * import { startRepl } from "bunshell";
 * await startRepl();
 * ```
 */
export async function startRepl(options?: ReplOptions): Promise<void> {
  // Build full-access context
  const sinks = options?.auditConsole ? [consoleSink()] : [];
  const audit: FullAuditLogger = createAuditLogger({
    agentId: `repl-${Date.now().toString(36)}`,
    agentName: "bunshell-repl",
    sinks,
  });

  const ctx = createContext({
    name: "bunshell-repl",
    capabilities: capabilities()
      .fsRead("*")
      .fsWrite("*")
      .fsDelete("*")
      .spawn(["*"])
      .netFetch(["*"])
      .netListen(0)
      .envRead(["*"])
      .envWrite(["*"])
      .build()
      .capabilities.slice(),
    audit,
  });

  // Build the evaluation scope — all BunShell APIs + ctx
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const scope: Record<string, any> = {
    ctx,
    audit,
    // Capabilities
    ...capsMod,
    // Wrappers
    ...wrappersMod,
    // Pipe
    ...pipeMod,
    // Audit
    ...auditMod,
    // Agent
    ...agentMod,
    // Utilities
    console,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    Bun,
    fetch,
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
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    performance,
    process,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    atob,
    btoa,
  };

  // Mutable scope for user-defined variables
  const userVars: Record<string, any> = {};

  /**
   * Evaluate TypeScript code in the BunShell scope.
   */
  async function evaluate(code: string): Promise<{ value: any; type: string }> {
    // Transpile TS → JS
    let js: string;
    try {
      js = transpileTS(code);
    } catch (e) {
      throw new Error(
        `TypeScript error: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }

    // Wrap in async function with scope destructured
    const scopeKeys = [...Object.keys(scope), ...Object.keys(userVars)];
    const scopeValues = scopeKeys.map((k) =>
      userVars[k] !== undefined ? userVars[k] : scope[k],
    );

    // Detect variable declarations to capture in userVars
    // Transform `const x = ...` / `let x = ...` into assignments we can capture
    let wrappedJs = js.trim();

    // Check if it's a declaration (const, let, var)
    const declMatch = wrappedJs.match(
      /^(?:const|let|var)\s+(\w+)\s*=\s*([\s\S]+?);\s*$/,
    );
    if (declMatch) {
      const varName = declMatch[1]!;
      const expr = declMatch[2]!;
      // Evaluate the expression and store in userVars
      const fn = new Function(
        ...scopeKeys,
        `return (async () => { return (${expr}); })()`,
      );
      const result = await fn(...scopeValues);
      userVars[varName] = result;
      const typeName = getTypeName(result);
      return { value: result, type: typeName };
    }

    // Check for multiple statements — wrap and return last expression
    const statements = wrappedJs.split(";\n").filter((s) => s.trim());
    if (statements.length > 1) {
      const allButLast = statements.slice(0, -1).join(";\n");
      const lastStmt = statements[statements.length - 1]!.trim().replace(
        /;$/,
        "",
      );
      const fn = new Function(
        ...scopeKeys,
        `return (async () => { ${allButLast}; return (${lastStmt}); })()`,
      );
      const result = await fn(...scopeValues);
      return { value: result, type: getTypeName(result) };
    }

    // Single expression — evaluate directly
    wrappedJs = wrappedJs.replace(/;$/, "");
    try {
      const fn = new Function(
        ...scopeKeys,
        `return (async () => { return (${wrappedJs}); })()`,
      );
      const result = await fn(...scopeValues);
      return { value: result, type: getTypeName(result) };
    } catch {
      // If expression eval fails, try as statement
      const fn = new Function(
        ...scopeKeys,
        `return (async () => { ${wrappedJs}; })()`,
      );
      await fn(...scopeValues);
      return { value: undefined, type: "void" };
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Load history
  const history = loadHistory();

  // Multi-line input state
  let multiLine = "";
  let braceDepth = 0;
  let parenDepth = 0;

  function getPrompt(): string {
    if (multiLine) {
      return `${C.cyan}...${C.reset} `;
    }
    return `${C.cyan}bunshell${C.reset} ${C.magenta}ts${C.reset} ${C.green}>${C.reset} `;
  }

  const rl = createInterface({
    input: stdin,
    output: stdout,
    prompt: getPrompt(),
    completer: createCompleter(scope, userVars),
    terminal: true,
  });

  // Load history
  for (const entry of history) {
    (rl as unknown as { history: string[] }).history.push(entry);
  }

  // Banner
  console.log(
    `${C.bold}${C.cyan}BunShell${C.reset} ${C.dim}v0.1.0${C.reset} — TypeScript REPL`,
  );
  console.log(
    `${C.dim}All BunShell APIs pre-imported. ${C.bold}ctx${C.reset}${C.dim} is ready with full capabilities.${C.reset}`,
  );
  console.log(
    `${C.dim}Try: ${C.reset}await ls(ctx, ".")${C.dim} or ${C.reset}await pipe(ls(ctx, "."), filter(f => f.isFile), pluck("name"))`,
  );
  console.log(
    `${C.dim}Multi-line: open a brace/paren, close it to execute. Ctrl+C to cancel.${C.reset}\n`,
  );

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trimEnd();

    // Handle special commands
    if (!multiLine) {
      if (trimmed === ".exit" || trimmed === ".quit") {
        console.log(`\n${C.dim}Goodbye!${C.reset}`);
        rl.close();
        process.exit(0);
        return;
      }
      if (trimmed === ".help") {
        printHelp();
        rl.prompt();
        return;
      }
      if (trimmed === ".clear") {
        console.clear();
        rl.prompt();
        return;
      }
      if (trimmed === ".vars") {
        const keys = Object.keys(userVars);
        if (keys.length === 0) {
          console.log(`${C.dim}(no variables defined)${C.reset}`);
        } else {
          for (const k of keys) {
            console.log(
              `${C.cyan}${k}${C.reset}: ${C.dim}${getTypeName(userVars[k])}${C.reset}`,
            );
          }
        }
        rl.prompt();
        return;
      }
      if (trimmed === ".caps") {
        for (const c of ctx.caps.capabilities) {
          console.log(
            `  ${C.yellow}${c.kind}${C.reset} ${"pattern" in c ? c.pattern : "allowedBinaries" in c ? (c.allowedBinaries as readonly string[]).join(", ") : "allowedDomains" in c ? (c.allowedDomains as readonly string[]).join(", ") : "allowedKeys" in c ? (c.allowedKeys as readonly string[]).join(", ") : "port" in c ? String(c.port) : ""}`,
          );
        }
        rl.prompt();
        return;
      }
      if (trimmed === ".audit") {
        const entries = audit.entries.slice(-20);
        for (const e of entries) {
          const color =
            e.result === "success"
              ? C.green
              : e.result === "denied"
                ? C.red
                : C.yellow;
          console.log(
            `${C.dim}${e.timestamp.toISOString().slice(11, 23)}${C.reset} ${color}[${e.result}]${C.reset} ${e.capability}:${e.operation}`,
          );
        }
        if (entries.length === 0)
          console.log(`${C.dim}(no audit entries)${C.reset}`);
        rl.prompt();
        return;
      }
      if (trimmed === "") {
        rl.prompt();
        return;
      }
    }

    // Multi-line support: track braces and parens
    multiLine += (multiLine ? "\n" : "") + input;
    for (const ch of input) {
      if (ch === "{" || ch === "(") braceDepth++;
      if (ch === "}" || ch === ")") braceDepth--;
      if (ch === "(") parenDepth++;
      if (ch === ")") parenDepth--;
    }

    // If unclosed braces/parens, continue on next line
    if (braceDepth > 0 || parenDepth > 0) {
      rl.setPrompt(getPrompt());
      rl.prompt();
      return;
    }

    // Execute
    const code = multiLine;
    multiLine = "";
    braceDepth = 0;
    parenDepth = 0;

    // Save to history
    history.push(code.replace(/\n/g, "\\n"));
    saveHistory(history);

    try {
      const result = await evaluate(code);

      if (result.value !== undefined) {
        // Print type annotation
        console.log(`${C.dim}// : ${result.type}${C.reset}`);
        // Print formatted value
        console.log(formatAuto(result.value));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`${C.red}Error:${C.reset} ${message}`);
    }

    rl.setPrompt(getPrompt());
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(`\n${C.dim}Goodbye!${C.reset}`);
    process.exit(0);
  });

  rl.on("SIGINT", () => {
    if (multiLine) {
      // Cancel multi-line input
      multiLine = "";
      braceDepth = 0;
      parenDepth = 0;
      console.log();
    } else {
      console.log(`\n${C.dim}(use .exit to quit)${C.reset}`);
    }
    rl.setPrompt(getPrompt());
    rl.prompt();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function getTypeName(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const first = value[0];
    if (first && typeof first === "object") {
      if ("isFile" in first && "permissions" in first)
        return `FileEntry[${value.length}]`;
      if ("pid" in first && "cpu" in first)
        return `ProcessInfo[${value.length}]`;
      if ("line" in first && "match" in first)
        return `GrepMatch[${value.length}]`;
      if ("filesystem" in first && "mountedOn" in first)
        return `DfEntry[${value.length}]`;
      if ("key" in first && "value" in first)
        return `EnvEntry[${value.length}]`;
    }
    if (typeof first === "string") return `string[${value.length}]`;
    if (typeof first === "number") return `number[${value.length}]`;
    return `Array[${value.length}]`;
  }
  if (value instanceof Date) return "Date";
  if (value instanceof RegExp) return "RegExp";
  if (typeof value === "object") {
    if ("isFile" in value && "permissions" in value) return "FileEntry";
    if ("exitCode" in value && "stdout" in value) return "SpawnResult";
    if ("status" in value && "statusText" in value && "body" in value)
      return "NetResponse";
    if ("alive" in value && "host" in value) return "PingResult";
    if ("os" in value && "arch" in value && "platform" in value)
      return "SystemInfo";
    if ("lines" in value && "words" in value && "chars" in value)
      return "WcResult";
    if ("bytes" in value && "human" in value && "files" in value)
      return "DiskUsage";
    if ("bytesWritten" in value && "path" in value) return "WriteResult";
    if ("ok" in value && "value" in value) return "Result<ok>";
    if ("ok" in value && "error" in value) return "Result<err>";
    if ("capabilities" in value && "has" in value) return "CapabilitySet";
    if ("caps" in value && "derive" in value) return "CapabilityContext";
    if ("success" in value && "auditTrail" in value) return "AgentResult";
    return "object";
  }
  return typeof value;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function printHelp(): void {
  console.log(`
${C.bold}BunShell TypeScript REPL${C.reset}

${C.yellow}Pre-imported API:${C.reset}
  ${C.cyan}ctx${C.reset}                        Pre-configured CapabilityContext (full access)
  ${C.cyan}audit${C.reset}                      AuditLogger — query with audit.query(...)

  ${C.bold}Capabilities:${C.reset}  createContext, capabilities, CapabilityError
  ${C.bold}Filesystem:${C.reset}    ls, cat, stat, exists, mkdir, write, readJson, writeJson,
                   rm, cp, mv, find, du
  ${C.bold}Process:${C.reset}       ps, kill, spawn, exec
  ${C.bold}Network:${C.reset}       netFetch, ping
  ${C.bold}Env:${C.reset}           env, getEnv, setEnv
  ${C.bold}Text:${C.reset}          grep, sort, uniq, head, tail, wc
  ${C.bold}System:${C.reset}        uname, uptime, whoami, hostname, df
  ${C.bold}Pipe:${C.reset}          pipe, filter, map, reduce, take, skip, sortBy, groupBy,
                   unique, flatMap, tap, count, first, last, pluck,
                   from, fromFile, fromJSON, fromCommand,
                   toFile, toJSON, toStdout, collect
  ${C.bold}Agent:${C.reset}         runAgent

${C.yellow}Commands:${C.reset}
  .help            Show this help
  .vars            Show defined variables
  .caps            Show current capabilities
  .audit           Show recent audit entries
  .clear           Clear the screen
  .exit            Exit the REPL

${C.yellow}Examples:${C.reset}
  ${C.dim}// List files${C.reset}
  await ls(ctx, "src", { recursive: true, glob: "*.ts" })

  ${C.dim}// Typed pipe chain${C.reset}
  await pipe(ls(ctx, "."), filter(f => f.isFile), sortBy("size", "desc"), pluck("name"))

  ${C.dim}// Store results in variables${C.reset}
  const files = await ls(ctx, "src")
  files.filter(f => f.size > 1000)

  ${C.dim}// Grep with structured output${C.reset}
  await grep(ctx, /TODO/, "src/index.ts")

  ${C.dim}// Create restricted context${C.reset}
  const restricted = ctx.derive("child", [{ kind: "fs:read", pattern: "/tmp/**" }])
`);
}
