/**
 * Context-aware autocompletion engine.
 *
 * Best practices implemented:
 * - Position-aware: knows if you're typing a command, argument, or flag
 * - File path completion with directory traversal
 * - Flag completion per command (shows only valid flags)
 * - Flag value completion for known value sets
 * - Pipe operator completion after |
 * - Fuzzy prefix matching for commands
 * - Environment variable key completion
 *
 * @module
 */

import { readdirSync, statSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import {
  COMMANDS,
  findCommand,
  FILE_ENTRY_FIELDS,
  type CommandDef,
} from "./commands";
import { getCurrentWord } from "./parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CompleterResult = [completions: string[], partial: string];

// ---------------------------------------------------------------------------
// File path completion
// ---------------------------------------------------------------------------

function completeFilePath(partial: string, cwd: string): string[] {
  try {
    let dir: string;

    if (partial === "") {
      dir = cwd;
    } else if (partial.endsWith("/")) {
      dir = resolve(cwd, partial);
    } else {
      dir = resolve(cwd, dirname(partial));
    }

    const entries = readdirSync(dir);
    const results: string[] = [];

    for (const entry of entries) {
      // Skip hidden files unless user started typing a dot
      const partialBase = basename(partial || ".");
      if (entry.startsWith(".") && !partialBase.startsWith(".")) continue;

      const fullEntry = partial.includes("/")
        ? join(dirname(partial), entry)
        : entry;

      if (fullEntry.startsWith(partial) || partial === "") {
        // Add trailing / for directories
        try {
          const fullPath = resolve(cwd, fullEntry);
          const s = statSync(fullPath);
          results.push(s.isDirectory() ? fullEntry + "/" : fullEntry);
        } catch {
          results.push(fullEntry);
        }
      }
    }

    return results.sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Command completion
// ---------------------------------------------------------------------------

function completeCommand(partial: string, inPipe: boolean): string[] {
  const available = inPipe
    ? COMMANDS.filter((c) => c.category === "pipe" || c.category === "shell")
    : COMMANDS;

  const matches = available
    .filter(
      (c) =>
        c.name.startsWith(partial) ||
        (c.aliases?.some((a) => a.startsWith(partial)) ?? false),
    )
    .map((c) => c.name);

  return matches.sort();
}

// ---------------------------------------------------------------------------
// Flag completion
// ---------------------------------------------------------------------------

function completeFlag(partial: string, cmd: CommandDef): string[] {
  const flagPrefix = partial.startsWith("--")
    ? partial.slice(2)
    : partial.slice(1);

  return cmd.flags
    .filter((f) => f.name.startsWith(flagPrefix))
    .map((f) => `--${f.name}${f.hasValue ? "=" : ""}`)
    .sort();
}

function completeFlagValue(
  flagName: string,
  partial: string,
  cmd: CommandDef,
): string[] {
  const flag = cmd.flags.find((f) => f.name === flagName);
  if (!flag?.values) return [];
  return flag.values.filter((v) => v.startsWith(partial)).map(String);
}

// ---------------------------------------------------------------------------
// Env key completion
// ---------------------------------------------------------------------------

function completeEnvKey(partial: string): string[] {
  return Object.keys(process.env)
    .filter((k) => k.startsWith(partial.toUpperCase()) || k.startsWith(partial))
    .sort()
    .slice(0, 30);
}

// ---------------------------------------------------------------------------
// Field name completion (for pipe operators)
// ---------------------------------------------------------------------------

function completeField(partial: string): string[] {
  return FILE_ENTRY_FIELDS.filter((f) => f.startsWith(partial)).map(String);
}

// ---------------------------------------------------------------------------
// Main completer
// ---------------------------------------------------------------------------

/**
 * Create the completer function for readline.
 *
 * @example
 * ```ts
 * const rl = createInterface({
 *   input: stdin,
 *   output: stdout,
 *   completer: createCompleter(process.cwd()),
 * });
 * ```
 */
export function createCompleter(
  getCwd: () => string,
): (line: string) => CompleterResult {
  return (line: string): CompleterResult => {
    const cwd = getCwd();

    // Check if we're in a pipe segment
    const lastPipe = line.lastIndexOf("|");
    const inPipe = lastPipe !== -1;
    const segment = inPipe ? line.slice(lastPipe + 1).trimStart() : line;

    const { word, tokens, tokenIndex } = getCurrentWord(segment);

    // --- Position 0: completing a command name ---
    if (tokenIndex === 0) {
      const matches = completeCommand(word, inPipe);
      if (matches.length === 0) return [[], word];

      // If in pipe, prepend the prefix
      if (inPipe) {
        const prefix = line.slice(0, lastPipe + 1) + " ";
        return [matches.map((m) => prefix + m), line];
      }
      return [matches, word];
    }

    // --- We have a command, complete its arguments ---
    const cmdName = tokens[0] ?? "";
    const cmd = findCommand(cmdName);
    if (!cmd) return [[], word];

    // Completing a flag
    if (word.startsWith("-")) {
      const matches = completeFlag(word, cmd);
      if (inPipe) {
        const prefix = line.slice(0, line.length - word.length);
        return [matches.map((m) => prefix + m), line];
      }
      return [matches, word];
    }

    // Completing a flag value (--flag=partial)
    const prevToken = tokens[tokenIndex - 1];
    if (prevToken && prevToken.startsWith("--") && prevToken.includes("=")) {
      const flagName = prevToken.slice(2, prevToken.indexOf("="));
      const matches = completeFlagValue(flagName, word, cmd);
      return [matches, word];
    }

    // Determine which positional arg we're on
    const positionalIndex = tokens
      .slice(1, tokenIndex)
      .filter((t) => !t.startsWith("-")).length;

    const argDef = cmd.args[positionalIndex];

    if (!argDef) {
      // Extra args — try file path as fallback
      const paths = completeFilePath(word, cwd);
      return [paths, word];
    }

    // Complete based on argument type
    switch (argDef.type) {
      case "path": {
        const paths = completeFilePath(word, cwd);
        return [paths, word];
      }
      case "key": {
        const keys = completeEnvKey(word);
        return [keys, word];
      }
      case "command": {
        // For 'exec' command, complete against command names
        const commands = completeCommand(word, false);
        return [commands, word];
      }
      case "string": {
        // For pipe operators like sortby, pluck — complete field names
        if (cmd.category === "pipe") {
          const fields = completeField(word);
          return [fields, word];
        }
        return [[], word];
      }
      case "signal": {
        const signals = [
          "SIGTERM",
          "SIGKILL",
          "SIGINT",
          "SIGHUP",
          "SIGUSR1",
          "SIGUSR2",
          "SIGSTOP",
          "SIGCONT",
        ].filter((s) => s.startsWith(word.toUpperCase()));
        return [signals, word];
      }
      default:
        return [[], word];
    }
  };
}
