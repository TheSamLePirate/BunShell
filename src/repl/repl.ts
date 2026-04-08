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
      .dbQuery("*")
      .netConnect(["*"])
      .osInteract()
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
      if (trimmed.startsWith(".type")) {
        const arg = trimmed.slice(5).trim();
        printType(arg);
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

${C.yellow}Globals:${C.reset}
  ${C.cyan}ctx${C.reset}    CapabilityContext (full access)    ${C.cyan}audit${C.reset}  AuditLogger

${C.yellow}Capabilities:${C.reset}
  createContext  capabilities  CapabilityError  ok  err

${C.yellow}Filesystem${C.reset} ${C.dim}(fs:read, fs:write, fs:delete)${C.reset}
  ls  cat  stat  exists  mkdir  write  readJson  writeJson
  rm  cp  mv  find  du  chmod  createSymlink  readLink
  touch  append  truncate  realPath  watchPath  globFiles

${C.yellow}Process${C.reset} ${C.dim}(process:spawn)${C.reset}
  ps  kill  spawn  exec

${C.yellow}Network${C.reset} ${C.dim}(net:fetch, net:listen)${C.reset}
  netFetch  ping  download  dig  serve  wsConnect

${C.yellow}Environment${C.reset} ${C.dim}(env:read, env:write)${C.reset}
  env  getEnv  setEnv

${C.yellow}Text${C.reset}
  grep  sort  uniq  head  tail  wc

${C.yellow}System${C.reset}
  uname  uptime  whoami  hostname  df

${C.yellow}Crypto${C.reset} ${C.dim}(no capability)${C.reset}
  hash  hmac  randomBytes  randomUUID  randomInt  encrypt  decrypt

${C.yellow}Archive${C.reset} ${C.dim}(fs:read, fs:write)${C.reset}
  tar  untar  zip  unzip  gzip  gunzip

${C.yellow}Stream${C.reset}
  lineStream  tailStream  pipeSpawn  streamSpawn

${C.yellow}Data${C.reset} ${C.dim}(no capability)${C.reset}
  parseJSON  formatJSON  parseCSV  formatCSV  parseTOML
  base64Encode  base64Decode  base64DecodeString

${C.yellow}Database${C.reset} ${C.dim}(db:query)${C.reset}
  dbOpen  dbQuery  dbExec

${C.yellow}Git${C.reset} ${C.dim}(process:spawn → git)${C.reset}
  gitStatus  gitLog  gitDiff  gitBranch  gitAdd  gitCommit
  gitPush  gitPull  gitClone  gitStash

${C.yellow}OS${C.reset} ${C.dim}(os:interact)${C.reset}
  openUrl  openFile  notify  clipboard

${C.yellow}Scheduling${C.reset} ${C.dim}(no capability)${C.reset}
  sleep  interval  timeout  debounce  throttle  retry

${C.yellow}User${C.reset} ${C.dim}(env:read, fs:read)${C.reset}
  currentUser  users  groups

${C.yellow}Pipe${C.reset}
  pipe  filter  map  reduce  take  skip  sortBy  groupBy
  unique  flatMap  tap  count  first  last  pluck
  from  fromFile  fromJSON  fromCommand
  toFile  toJSON  toStdout  collect

${C.yellow}Agent${C.reset}
  runAgent

${C.yellow}Dot commands:${C.reset}
  .help              Show this help
  .type ${C.dim}<name>${C.reset}       Show type definition (e.g. ${C.cyan}.type FileEntry${C.reset})
  .vars              Show defined variables
  .caps              Show current capabilities
  .audit             Show recent audit entries
  .clear             Clear the screen
  .exit              Exit the REPL

${C.yellow}Examples:${C.reset}
  ${C.dim}// List files${C.reset}
  await ls(ctx, "src", { recursive: true, glob: "*.ts" })

  ${C.dim}// Typed pipe chain${C.reset}
  await pipe(ls(ctx, "."), filter(f => f.isFile), sortBy("size", "desc"), pluck("name"))

  ${C.dim}// Explore a type${C.reset}
  .type FileEntry

  ${C.dim}// SQLite database${C.reset}
  const db = dbOpen(ctx, "/tmp/app.db")

  ${C.dim}// Git status${C.reset}
  await gitStatus(ctx)
`);
}

// ---------------------------------------------------------------------------
// Type explorer
// ---------------------------------------------------------------------------

const TYPE_DEFS: Record<string, string> = {
  FileEntry: `${C.magenta}interface${C.reset} ${C.cyan}FileEntry${C.reset} {
  ${C.cyan}name${C.reset}: string
  ${C.cyan}path${C.reset}: string
  ${C.cyan}size${C.reset}: number
  ${C.cyan}isDirectory${C.reset}: boolean
  ${C.cyan}isFile${C.reset}: boolean
  ${C.cyan}isSymlink${C.reset}: boolean
  ${C.cyan}permissions${C.reset}: FilePermissions
  ${C.cyan}modifiedAt${C.reset}: Date
  ${C.cyan}createdAt${C.reset}: Date
  ${C.cyan}accessedAt${C.reset}: Date
  ${C.cyan}extension${C.reset}: string | null
}`,
  FilePermissions: `${C.magenta}interface${C.reset} ${C.cyan}FilePermissions${C.reset} {
  ${C.cyan}readable${C.reset}: boolean
  ${C.cyan}writable${C.reset}: boolean
  ${C.cyan}executable${C.reset}: boolean
  ${C.cyan}mode${C.reset}: number           ${C.dim}// e.g. 0o755${C.reset}
  ${C.cyan}modeString${C.reset}: string     ${C.dim}// e.g. "rwxr-xr-x"${C.reset}
}`,
  ProcessInfo: `${C.magenta}interface${C.reset} ${C.cyan}ProcessInfo${C.reset} {
  ${C.cyan}pid${C.reset}: number
  ${C.cyan}ppid${C.reset}: number
  ${C.cyan}name${C.reset}: string
  ${C.cyan}command${C.reset}: string
  ${C.cyan}user${C.reset}: string
  ${C.cyan}cpu${C.reset}: number
  ${C.cyan}memory${C.reset}: number
  ${C.cyan}state${C.reset}: string
}`,
  SpawnResult: `${C.magenta}interface${C.reset} ${C.cyan}SpawnResult${C.reset} {
  ${C.cyan}exitCode${C.reset}: number
  ${C.cyan}stdout${C.reset}: string
  ${C.cyan}stderr${C.reset}: string
  ${C.cyan}success${C.reset}: boolean
  ${C.cyan}duration${C.reset}: number       ${C.dim}// milliseconds${C.reset}
  ${C.cyan}command${C.reset}: string
  ${C.cyan}args${C.reset}: readonly string[]
}`,
  GrepMatch: `${C.magenta}interface${C.reset} ${C.cyan}GrepMatch${C.reset} {
  ${C.cyan}file${C.reset}: string | null
  ${C.cyan}line${C.reset}: number
  ${C.cyan}column${C.reset}: number
  ${C.cyan}content${C.reset}: string
  ${C.cyan}match${C.reset}: string
}`,
  WcResult: `${C.magenta}interface${C.reset} ${C.cyan}WcResult${C.reset} {
  ${C.cyan}lines${C.reset}: number
  ${C.cyan}words${C.reset}: number
  ${C.cyan}chars${C.reset}: number
  ${C.cyan}bytes${C.reset}: number
}`,
  DiskUsage: `${C.magenta}interface${C.reset} ${C.cyan}DiskUsage${C.reset} {
  ${C.cyan}path${C.reset}: string
  ${C.cyan}bytes${C.reset}: number
  ${C.cyan}human${C.reset}: string          ${C.dim}// e.g. "1.5 MB"${C.reset}
  ${C.cyan}files${C.reset}: number
  ${C.cyan}directories${C.reset}: number
}`,
  WriteResult: `${C.magenta}interface${C.reset} ${C.cyan}WriteResult${C.reset} {
  ${C.cyan}bytesWritten${C.reset}: number
  ${C.cyan}path${C.reset}: string
}`,
  NetResponse: `${C.magenta}interface${C.reset} ${C.cyan}NetResponse${C.reset}<T = unknown> {
  ${C.cyan}status${C.reset}: number
  ${C.cyan}statusText${C.reset}: string
  ${C.cyan}headers${C.reset}: Record<string, string>
  ${C.cyan}body${C.reset}: T
  ${C.cyan}url${C.reset}: string
  ${C.cyan}duration${C.reset}: number
}`,
  PingResult: `${C.magenta}interface${C.reset} ${C.cyan}PingResult${C.reset} {
  ${C.cyan}host${C.reset}: string
  ${C.cyan}alive${C.reset}: boolean
  ${C.cyan}time${C.reset}: number | null
}`,
  SystemInfo: `${C.magenta}interface${C.reset} ${C.cyan}SystemInfo${C.reset} {
  ${C.cyan}os${C.reset}: string
  ${C.cyan}hostname${C.reset}: string
  ${C.cyan}release${C.reset}: string
  ${C.cyan}arch${C.reset}: string
  ${C.cyan}platform${C.reset}: string
}`,
  DfEntry: `${C.magenta}interface${C.reset} ${C.cyan}DfEntry${C.reset} {
  ${C.cyan}filesystem${C.reset}: string
  ${C.cyan}size${C.reset}: string
  ${C.cyan}used${C.reset}: string
  ${C.cyan}available${C.reset}: string
  ${C.cyan}usePercent${C.reset}: string
  ${C.cyan}mountedOn${C.reset}: string
}`,
  EnvEntry: `${C.magenta}interface${C.reset} ${C.cyan}EnvEntry${C.reset} {
  ${C.cyan}key${C.reset}: string
  ${C.cyan}value${C.reset}: string
}`,
  HashResult: `${C.magenta}interface${C.reset} ${C.cyan}HashResult${C.reset} {
  ${C.cyan}hex${C.reset}: string
  ${C.cyan}base64${C.reset}: string
  ${C.cyan}bytes${C.reset}: Uint8Array
}`,
  EncryptResult: `${C.magenta}interface${C.reset} ${C.cyan}EncryptResult${C.reset} {
  ${C.cyan}ciphertext${C.reset}: string
  ${C.cyan}iv${C.reset}: string
  ${C.cyan}tag${C.reset}: string
}`,
  ExtractResult: `${C.magenta}interface${C.reset} ${C.cyan}ExtractResult${C.reset} {
  ${C.cyan}dest${C.reset}: string
  ${C.cyan}success${C.reset}: boolean
  ${C.cyan}output${C.reset}: string
}`,
  GitStatus: `${C.magenta}interface${C.reset} ${C.cyan}GitStatus${C.reset} {
  ${C.cyan}branch${C.reset}: string
  ${C.cyan}staged${C.reset}: GitFileChange[]
  ${C.cyan}unstaged${C.reset}: GitFileChange[]
  ${C.cyan}untracked${C.reset}: string[]
  ${C.cyan}clean${C.reset}: boolean
}`,
  GitFileChange: `${C.magenta}interface${C.reset} ${C.cyan}GitFileChange${C.reset} {
  ${C.cyan}status${C.reset}: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown"
  ${C.cyan}path${C.reset}: string
}`,
  GitCommit: `${C.magenta}interface${C.reset} ${C.cyan}GitCommit${C.reset} {
  ${C.cyan}hash${C.reset}: string
  ${C.cyan}shortHash${C.reset}: string
  ${C.cyan}author${C.reset}: string
  ${C.cyan}email${C.reset}: string
  ${C.cyan}date${C.reset}: Date
  ${C.cyan}message${C.reset}: string
}`,
  GitDiffEntry: `${C.magenta}interface${C.reset} ${C.cyan}GitDiffEntry${C.reset} {
  ${C.cyan}file${C.reset}: string
  ${C.cyan}additions${C.reset}: number
  ${C.cyan}deletions${C.reset}: number
}`,
  GitBranches: `${C.magenta}interface${C.reset} ${C.cyan}GitBranches${C.reset} {
  ${C.cyan}current${C.reset}: string
  ${C.cyan}branches${C.reset}: string[]
}`,
  TypedDatabase: `${C.magenta}interface${C.reset} ${C.cyan}TypedDatabase${C.reset} {
  ${C.cyan}path${C.reset}: string
  ${C.cyan}query${C.reset}<T>(sql: string, params?: SQLQueryBindings[]): T[]
  ${C.cyan}exec${C.reset}(sql: string, params?: SQLQueryBindings[]): { changes: number }
  ${C.cyan}run${C.reset}(sql: string): void
  ${C.cyan}get${C.reset}<T>(sql: string, params?: SQLQueryBindings[]): T | null
  ${C.cyan}tables${C.reset}(): string[]
  ${C.cyan}close${C.reset}(): void
}`,
  ServerHandle: `${C.magenta}interface${C.reset} ${C.cyan}ServerHandle${C.reset} {
  ${C.cyan}port${C.reset}: number
  ${C.cyan}hostname${C.reset}: string
  ${C.cyan}url${C.reset}: string
  ${C.cyan}stop${C.reset}(): void
}`,
  TypedWebSocket: `${C.magenta}interface${C.reset} ${C.cyan}TypedWebSocket${C.reset} {
  ${C.cyan}url${C.reset}: string
  ${C.cyan}isOpen${C.reset}: boolean
  ${C.cyan}send${C.reset}(data: string | object): void
  ${C.cyan}onMessage${C.reset}(handler: (data: string) => void): void
  ${C.cyan}onError${C.reset}(handler: (error: Error) => void): void
  ${C.cyan}onClose${C.reset}(handler: (code: number, reason: string) => void): void
  ${C.cyan}close${C.reset}(code?: number, reason?: string): void
}`,
  CurrentUser: `${C.magenta}interface${C.reset} ${C.cyan}CurrentUser${C.reset} {
  ${C.cyan}uid${C.reset}: number
  ${C.cyan}gid${C.reset}: number
  ${C.cyan}username${C.reset}: string
  ${C.cyan}home${C.reset}: string
  ${C.cyan}shell${C.reset}: string
}`,
  UserEntry: `${C.magenta}interface${C.reset} ${C.cyan}UserEntry${C.reset} {
  ${C.cyan}username${C.reset}: string
  ${C.cyan}uid${C.reset}: number
  ${C.cyan}gid${C.reset}: number
  ${C.cyan}home${C.reset}: string
  ${C.cyan}shell${C.reset}: string
}`,
  GroupEntry: `${C.magenta}interface${C.reset} ${C.cyan}GroupEntry${C.reset} {
  ${C.cyan}name${C.reset}: string
  ${C.cyan}gid${C.reset}: number
  ${C.cyan}members${C.reset}: string[]
}`,
  DnsRecord: `${C.magenta}interface${C.reset} ${C.cyan}DnsRecord${C.reset} {
  ${C.cyan}name${C.reset}: string
  ${C.cyan}type${C.reset}: string
  ${C.cyan}value${C.reset}: string
  ${C.cyan}ttl${C.reset}: number
}`,
  WatchEvent: `${C.magenta}interface${C.reset} ${C.cyan}WatchEvent${C.reset} {
  ${C.cyan}type${C.reset}: "rename" | "change"
  ${C.cyan}filename${C.reset}: string | null
}`,
  AuditEntry: `${C.magenta}interface${C.reset} ${C.cyan}AuditEntry${C.reset} {
  ${C.cyan}timestamp${C.reset}: Date
  ${C.cyan}agentId${C.reset}: string
  ${C.cyan}agentName${C.reset}: string
  ${C.cyan}capability${C.reset}: CapabilityKind
  ${C.cyan}operation${C.reset}: string
  ${C.cyan}args${C.reset}: Record<string, unknown>
  ${C.cyan}result${C.reset}: "success" | "denied" | "error"
  ${C.cyan}error${C.reset}?: string
  ${C.cyan}duration${C.reset}?: number
  ${C.cyan}parentId${C.reset}?: string
}`,
  CapabilityContext: `${C.magenta}interface${C.reset} ${C.cyan}CapabilityContext${C.reset} {
  ${C.cyan}id${C.reset}: string
  ${C.cyan}name${C.reset}: string
  ${C.cyan}caps${C.reset}: CapabilitySet
  ${C.cyan}audit${C.reset}: AuditLogger
  ${C.cyan}derive${C.reset}(name: string, subset: Capability[]): CapabilityContext
}`,
  CapabilitySet: `${C.magenta}interface${C.reset} ${C.cyan}CapabilitySet${C.reset} {
  ${C.cyan}capabilities${C.reset}: readonly Capability[]
  ${C.cyan}has${C.reset}(kind: CapabilityKind): boolean
  ${C.cyan}getAll${C.reset}(kind: CapabilityKind): readonly Capability[]
  ${C.cyan}check${C.reset}(required: Capability): CheckResult
  ${C.cyan}demand${C.reset}(required: Capability): void  ${C.dim}// throws CapabilityError${C.reset}
}`,
  Capability: `${C.magenta}type${C.reset} ${C.cyan}Capability${C.reset} =
  | FSRead      ${C.dim}{ kind: "fs:read",     pattern: string }${C.reset}
  | FSWrite     ${C.dim}{ kind: "fs:write",    pattern: string }${C.reset}
  | FSDelete    ${C.dim}{ kind: "fs:delete",   pattern: string }${C.reset}
  | Spawn       ${C.dim}{ kind: "process:spawn", allowedBinaries: string[] }${C.reset}
  | NetFetch    ${C.dim}{ kind: "net:fetch",   allowedDomains: string[] }${C.reset}
  | NetListen   ${C.dim}{ kind: "net:listen",  port: number }${C.reset}
  | EnvRead     ${C.dim}{ kind: "env:read",    allowedKeys: string[] }${C.reset}
  | EnvWrite    ${C.dim}{ kind: "env:write",   allowedKeys: string[] }${C.reset}
  | DbQuery     ${C.dim}{ kind: "db:query",    pattern: string }${C.reset}
  | NetConnect  ${C.dim}{ kind: "net:connect", allowedHosts: string[] }${C.reset}
  | OsInteract  ${C.dim}{ kind: "os:interact" }${C.reset}`,
  AgentResult: `${C.magenta}interface${C.reset} ${C.cyan}AgentResult${C.reset} {
  ${C.cyan}success${C.reset}: boolean
  ${C.cyan}exitCode${C.reset}: number
  ${C.cyan}output${C.reset}: unknown
  ${C.cyan}auditTrail${C.reset}: AuditEntry[]
  ${C.cyan}duration${C.reset}: number
  ${C.cyan}error${C.reset}?: string
}`,
  StreamingProcess: `${C.magenta}interface${C.reset} ${C.cyan}StreamingProcess${C.reset} {
  ${C.cyan}stdout${C.reset}: ReadableStream<Uint8Array>
  ${C.cyan}stderr${C.reset}: ReadableStream<Uint8Array>
  ${C.cyan}exitCode${C.reset}: Promise<number>
  ${C.cyan}kill${C.reset}(signal?: string): void
}`,
  ClipboardHandle: `${C.magenta}interface${C.reset} ${C.cyan}ClipboardHandle${C.reset} {
  ${C.cyan}read${C.reset}(): Promise<string>
  ${C.cyan}write${C.reset}(text: string): Promise<void>
}`,
  Result: `${C.magenta}type${C.reset} ${C.cyan}Result${C.reset}<T, E = Error> =
  | { ${C.cyan}ok${C.reset}: true,  ${C.cyan}value${C.reset}: T }
  | { ${C.cyan}ok${C.reset}: false, ${C.cyan}error${C.reset}: E }`,
  CsvOptions: `${C.magenta}interface${C.reset} ${C.cyan}CsvOptions${C.reset} {
  ${C.cyan}delimiter${C.reset}?: string     ${C.dim}// default ","${C.reset}
  ${C.cyan}header${C.reset}?: boolean       ${C.dim}// default true${C.reset}
}`,
  LsOptions: `${C.magenta}interface${C.reset} ${C.cyan}LsOptions${C.reset} {
  ${C.cyan}recursive${C.reset}?: boolean
  ${C.cyan}hidden${C.reset}?: boolean
  ${C.cyan}glob${C.reset}?: string
  ${C.cyan}sortBy${C.reset}?: keyof FileEntry
  ${C.cyan}order${C.reset}?: "asc" | "desc"
}`,
};

function printType(name: string): void {
  if (!name) {
    console.log(`${C.yellow}Available types:${C.reset}`);
    const names = Object.keys(TYPE_DEFS).sort();
    const cols = 4;
    const width = 20;
    for (let i = 0; i < names.length; i += cols) {
      const row = names
        .slice(i, i + cols)
        .map((n) => n.padEnd(width))
        .join("");
      console.log(`  ${row}`);
    }
    console.log(
      `\n${C.dim}Usage: .type <name>  e.g. .type FileEntry${C.reset}`,
    );
    return;
  }

  // Case-insensitive lookup
  const key = Object.keys(TYPE_DEFS).find(
    (k) => k.toLowerCase() === name.toLowerCase(),
  );
  if (!key) {
    // Fuzzy match
    const matches = Object.keys(TYPE_DEFS).filter((k) =>
      k.toLowerCase().includes(name.toLowerCase()),
    );
    if (matches.length > 0) {
      console.log(`${C.red}Unknown type "${name}".${C.reset} Did you mean:`);
      for (const m of matches) {
        console.log(`  ${C.cyan}${m}${C.reset}`);
      }
    } else {
      console.log(
        `${C.red}Unknown type "${name}".${C.reset} Use ${C.cyan}.type${C.reset} to see all types.`,
      );
    }
    return;
  }

  console.log(TYPE_DEFS[key]!);
}
