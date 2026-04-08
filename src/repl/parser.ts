/**
 * Shell input parser.
 *
 * Handles command parsing, flag extraction, pipe splitting,
 * and quoted string support.
 *
 * @module
 */

/** A single parsed command segment. */
export interface ParsedCommand {
  /** The command name (e.g., "ls", "cat", "grep"). */
  readonly command: string;
  /** Positional arguments. */
  readonly args: readonly string[];
  /** Named flags (--key=value or --flag). */
  readonly flags: Readonly<Record<string, string | true>>;
}

/** A full parsed pipeline (commands separated by |). */
export interface ParsedPipeline {
  readonly commands: readonly ParsedCommand[];
}

/**
 * Tokenize input respecting quotes.
 * Handles single quotes, double quotes, and escaped characters.
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if ((ch === " " || ch === "\t") && !inSingle && !inDouble) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/**
 * Parse a single command segment (no pipes).
 */
export function parseCommand(tokens: readonly string[]): ParsedCommand {
  if (tokens.length === 0) {
    return { command: "", args: [], flags: {} };
  }

  const command = tokens[0]!;
  const args: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=");
      if (eqIdx !== -1) {
        flags[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
      } else {
        flags[token.slice(2)] = true;
      }
    } else if (token.startsWith("-") && token.length === 2) {
      flags[token.slice(1)] = true;
    } else {
      args.push(token);
    }
  }

  return { command, args, flags };
}

/**
 * Parse a full input line, splitting on pipes.
 *
 * @example
 * ```ts
 * parsePipeline("ls src --recursive | filter size>1000 | head 5")
 * ```
 */
export function parsePipeline(input: string): ParsedPipeline {
  // Split on | but not inside quotes
  const segments: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (const ch of input) {
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
    } else if (ch === "|" && !inSingle && !inDouble) {
      segments.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) {
    segments.push(current.trim());
  }

  const commands = segments
    .filter((s) => s.length > 0)
    .map((s) => parseCommand(tokenize(s)));

  return { commands };
}

/**
 * Get the current "word" being typed (for autocompletion).
 * Returns the partial token at the cursor position.
 */
export function getCurrentWord(line: string): {
  word: string;
  tokens: string[];
  tokenIndex: number;
} {
  const tokens = tokenize(line);

  // Empty line or ends with space — starting a new token
  if (line.length === 0 || line.endsWith(" ") || line.endsWith("\t")) {
    return { word: "", tokens, tokenIndex: tokens.length };
  }

  // Otherwise we're completing the last token
  const word = tokens.length > 0 ? tokens[tokens.length - 1]! : "";
  return { word, tokens, tokenIndex: tokens.length - 1 };
}
