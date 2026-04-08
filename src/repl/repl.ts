/**
 * BunShell interactive REPL.
 *
 * readline-based shell with context-aware tab completion,
 * persistent history, colored output, and pipe support.
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
import { parsePipeline } from "./parser";
import { createCompleter } from "./completions";
import { executePipeline, type ExecutorState } from "./executor";
import { formatAuto } from "./format";

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
    // Silently fail if we can't write history
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for starting the REPL. */
export interface ReplOptions {
  /** Enable audit logging to console (default: false). */
  readonly auditConsole?: boolean;
  /** Custom capabilities (default: full access). */
  readonly capabilities?: ReturnType<typeof capabilities>;
}

// ---------------------------------------------------------------------------
// REPL
// ---------------------------------------------------------------------------

/**
 * Start the BunShell interactive REPL.
 *
 * @example
 * ```ts
 * import { startRepl } from "bunshell";
 * await startRepl();
 * ```
 */
export async function startRepl(options?: ReplOptions): Promise<void> {
  let cwd = process.cwd();

  // Build capabilities
  const caps = options?.capabilities
    ? options.capabilities.build()
    : capabilities()
        .fsRead("*")
        .fsWrite("*")
        .fsDelete("*")
        .spawn(["*"])
        .netFetch(["*"])
        .netListen(0)
        .envRead(["*"])
        .envWrite(["*"])
        .build();

  // Audit logger
  const sinks = options?.auditConsole ? [consoleSink()] : [];
  const audit: FullAuditLogger = createAuditLogger({
    agentId: `repl-${Date.now().toString(36)}`,
    agentName: "bunshell-repl",
    sinks,
  });

  // Context
  const ctx = createContext({
    name: "bunshell-repl",
    capabilities: caps.capabilities.slice(),
    audit,
  });

  // Executor state
  const state: ExecutorState = {
    ctx,
    audit,
    cwd,
    setCwd(path: string) {
      cwd = path;
      state.cwd = path;
    },
  };

  // Load history
  const history = loadHistory();

  // Build prompt
  function getPrompt(): string {
    const dir = cwd.replace(homedir(), "~");
    return `${C.cyan}bunshell${C.reset} ${C.dim}${dir}${C.reset} ${C.green}>${C.reset} `;
  }

  // Create readline
  const rl = createInterface({
    input: stdin,
    output: stdout,
    prompt: getPrompt(),
    completer: createCompleter(() => cwd),
    terminal: true,
  });

  // Load history into readline
  for (const entry of history) {
    (rl as unknown as { history: string[] }).history.push(entry);
  }

  // Banner
  console.log(
    `${C.bold}${C.cyan}BunShell${C.reset} ${C.dim}v0.1.0${C.reset} — Typed Agent Shell`,
  );
  console.log(
    `${C.dim}Type 'help' for commands, Tab for completion, Ctrl+C to exit${C.reset}\n`,
  );

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      rl.prompt();
      return;
    }

    // Save to history
    history.push(trimmed);
    saveHistory(history);

    // Parse and execute
    const pipeline = parsePipeline(trimmed);
    if (
      pipeline.commands.length === 0 ||
      pipeline.commands[0]!.command === ""
    ) {
      rl.prompt();
      return;
    }

    try {
      const result = await executePipeline(pipeline, state);

      switch (result.kind) {
        case "exit":
          console.log(`\n${C.dim}Goodbye!${C.reset}`);
          rl.close();
          process.exit(0);
          return;
        case "clear":
          console.clear();
          break;
        case "error":
          console.log(`${C.red}Error:${C.reset} ${result.message}`);
          break;
        case "text":
          if (result.value) console.log(result.value);
          break;
        case "data":
          console.log(formatAuto(result.value));
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`${C.red}Error:${C.reset} ${message}`);
    }

    // Update prompt (cwd may have changed)
    rl.setPrompt(getPrompt());
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(`\n${C.dim}Goodbye!${C.reset}`);
    process.exit(0);
  });

  // Handle SIGINT gracefully
  rl.on("SIGINT", () => {
    console.log();
    rl.setPrompt(getPrompt());
    rl.prompt();
  });
}
