/**
 * Raw terminal input — real-time syntax highlighting as you type.
 *
 * Replaces readline with character-by-character input handling.
 * Every keystroke re-renders the current line with ANSI colors.
 *
 * @module
 */

import { highlightCode } from "./highlight";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback when user submits a line (Enter). */
export type LineHandler = (line: string) => Promise<void>;

/** Callback for tab completion. */
export type Completer = (
  line: string,
) => [completions: string[], partial: string];

/** Options for the terminal. */
/** Pre-check callback — called with current buffer, returns true if code is valid. */
export type PreChecker = (code: string) => Promise<boolean>;

export interface TerminalOptions {
  readonly prompt: string;
  readonly onLine: LineHandler;
  readonly completer?: Completer;
  readonly preCheck?: PreChecker;
  /** Debounce delay for pre-check in ms (default: 300). */
  readonly preCheckDelay?: number;
  readonly onClose?: () => void;
  readonly history?: string[];
}

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ESC = "\x1b[";
const CLEAR_LINE = `${ESC}2K`;
const CURSOR_TO_COL = (n: number) => `${ESC}${n}G`;
const CURSOR_SAVE = `${ESC}s`;
const CURSOR_RESTORE = `${ESC}u`;

/** Strip ANSI codes to get visible length. */
function visLen(s: string): number {
  const ANSI_RE = new RegExp(ESC.replace("[", "\\[") + "[0-9;]*[a-zA-Z]", "g");
  return s.replace(ANSI_RE, "").length;
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

export interface Terminal {
  /** Write output below the input line. */
  write(text: string): void;
  /** Update the prompt string. */
  setPrompt(prompt: string): void;
  /** Close the terminal and restore normal mode. */
  close(): void;
  /** Access the history array. */
  readonly history: string[];
}

/**
 * Create a raw terminal with real-time syntax highlighting.
 *
 * @example
 * ```ts
 * const term = createTerminal({
 *   prompt: "bunshell> ",
 *   onLine: async (line) => {
 *     console.log("You typed:", line);
 *   },
 * });
 * ```
 */
export function createTerminal(options: TerminalOptions): Terminal {
  let buffer = "";
  let cursor = 0;
  let historyIndex = -1;
  let savedBuffer = "";
  const history: string[] = [...(options.history ?? [])];

  // Multi-line state
  let multiLineBuffer = "";
  let braceDepth = 0;
  let parenDepth = 0;
  let inMultiLine = false;
  const multiLinePrompt = "\x1b[36m...\x1b[0m ";

  // Pre-check status: controls "bunshell" color in prompt
  type PromptStatus = "ok" | "error" | "idle";
  let promptStatus: PromptStatus = "idle";
  let preCheckTimer: ReturnType<typeof setTimeout> | null = null;
  let preCheckVersion = 0; // prevents stale results from overwriting fresh ones
  const preCheckDelay = options.preCheckDelay ?? 300;

  function buildPrompt(): string {
    const statusColor =
      promptStatus === "error"
        ? "\x1b[31m" // red
        : promptStatus === "ok"
          ? "\x1b[32m" // green
          : "\x1b[36m"; // cyan (idle/unknown)
    return `${statusColor}bunshell\x1b[0m \x1b[35mts\x1b[0m \x1b[32m>\x1b[0m `;
  }

  function schedulePreCheck(): void {
    if (!options.preCheck) return;
    const code = inMultiLine ? multiLineBuffer + "\n" + buffer : buffer;
    if (code.trim().length === 0 || code.trim().startsWith(".")) {
      // Empty or dot-command — reset to idle
      if (promptStatus !== "idle") {
        promptStatus = "idle";
        render();
      }
      return;
    }

    if (preCheckTimer) clearTimeout(preCheckTimer);
    preCheckVersion++;
    const thisVersion = preCheckVersion;

    preCheckTimer = setTimeout(async () => {
      try {
        const pass = await options.preCheck!(code);
        // Only update if no newer check has been scheduled
        if (thisVersion === preCheckVersion) {
          const newStatus: PromptStatus = pass ? "ok" : "error";
          if (promptStatus !== newStatus) {
            promptStatus = newStatus;
            render();
          }
        }
      } catch {
        if (thisVersion === preCheckVersion && promptStatus !== "error") {
          promptStatus = "error";
          render();
        }
      }
    }, preCheckDelay);
  }

  // Enter raw mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");

  function currentPrompt(): string {
    return inMultiLine ? multiLinePrompt : buildPrompt();
  }

  function render(): void {
    const p = currentPrompt();
    const highlighted = highlightCode(buffer);
    const promptLen = visLen(p);
    process.stdout.write(
      `${CLEAR_LINE}\r${p}${highlighted}${CURSOR_TO_COL(promptLen + cursor + 1)}`,
    );
  }

  function insertChar(ch: string): void {
    buffer = buffer.slice(0, cursor) + ch + buffer.slice(cursor);
    cursor += ch.length;
    render();
    schedulePreCheck();
  }

  function backspace(): void {
    if (cursor > 0) {
      buffer = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
      cursor--;
      render();
      schedulePreCheck();
    }
  }

  function deleteChar(): void {
    if (cursor < buffer.length) {
      buffer = buffer.slice(0, cursor) + buffer.slice(cursor + 1);
      render();
      schedulePreCheck();
    }
  }

  function moveLeft(): void {
    if (cursor > 0) {
      cursor--;
      render();
    }
  }

  function moveRight(): void {
    if (cursor < buffer.length) {
      cursor++;
      render();
    }
  }

  function moveHome(): void {
    cursor = 0;
    render();
  }

  function moveEnd(): void {
    cursor = buffer.length;
    render();
  }

  function killLine(): void {
    buffer = buffer.slice(0, cursor);
    render();
    schedulePreCheck();
  }

  function killToStart(): void {
    buffer = buffer.slice(cursor);
    cursor = 0;
    render();
    schedulePreCheck();
  }

  function historyUp(): void {
    if (history.length === 0) return;
    if (historyIndex === -1) {
      savedBuffer = buffer;
      historyIndex = history.length - 1;
    } else if (historyIndex > 0) {
      historyIndex--;
    } else {
      return;
    }
    buffer = history[historyIndex]!;
    cursor = buffer.length;
    render();
    schedulePreCheck();
  }

  function historyDown(): void {
    if (historyIndex === -1) return;
    if (historyIndex < history.length - 1) {
      historyIndex++;
      buffer = history[historyIndex]!;
    } else {
      historyIndex = -1;
      buffer = savedBuffer;
    }
    cursor = buffer.length;
    render();
    schedulePreCheck();
  }

  function handleTab(): void {
    if (!options.completer) return;
    const [completions, partial] = options.completer(buffer);
    if (completions.length === 0) return;

    if (completions.length === 1) {
      // Single match — auto-complete
      const completion = completions[0]!;
      const suffix = completion.slice(partial.length);
      buffer = buffer.slice(0, cursor) + suffix + buffer.slice(cursor);
      cursor += suffix.length;
      render();
    } else {
      // Multiple matches — show them below
      process.stdout.write("\n");
      const cols = Math.min(completions.length, 5);
      const maxLen = Math.max(...completions.map((c) => c.length)) + 2;
      for (let i = 0; i < completions.length; i += cols) {
        const row = completions
          .slice(i, i + cols)
          .map((c) => c.padEnd(maxLen))
          .join("");
        process.stdout.write(`  \x1b[36m${row}\x1b[0m\n`);
      }
      render();
    }
  }

  function countDepth(line: string): void {
    for (const ch of line) {
      if (ch === "{" || ch === "(") braceDepth++;
      if (ch === "}" || ch === ")") braceDepth--;
      if (ch === "(") parenDepth++;
      if (ch === ")") parenDepth--;
    }
  }

  async function handleEnter(): Promise<void> {
    process.stdout.write("\n");

    const line = buffer;
    buffer = "";
    cursor = 0;
    historyIndex = -1;
    promptStatus = "idle";
    if (preCheckTimer) {
      clearTimeout(preCheckTimer);
      preCheckTimer = null;
    }

    if (inMultiLine) {
      multiLineBuffer += "\n" + line;
      countDepth(line);

      if (braceDepth <= 0 && parenDepth <= 0) {
        // Multi-line complete — submit
        inMultiLine = false;
        const fullCode = multiLineBuffer;
        multiLineBuffer = "";
        braceDepth = 0;
        parenDepth = 0;

        if (fullCode.trim().length > 0) {
          history.push(fullCode.replace(/\n/g, "\\n"));
          await options.onLine(fullCode);
        }
      }
      render();
      return;
    }

    // Check if this opens a multi-line block
    countDepth(line);
    if (braceDepth > 0 || parenDepth > 0) {
      inMultiLine = true;
      multiLineBuffer = line;
      render();
      return;
    }

    // Single line — reset depth and submit
    braceDepth = 0;
    parenDepth = 0;

    if (line.trim().length > 0) {
      history.push(line);
      await options.onLine(line);
    }
    render();
  }

  // Escape sequence buffer
  let escBuffer = "";
  let inEscape = false;

  function handleData(data: string): void {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i]!;
      const code = ch.charCodeAt(0);

      if (inEscape) {
        escBuffer += ch;
        // Arrow keys: ESC [ A/B/C/D
        if (escBuffer === "[A") {
          historyUp();
          inEscape = false;
          escBuffer = "";
        } else if (escBuffer === "[B") {
          historyDown();
          inEscape = false;
          escBuffer = "";
        } else if (escBuffer === "[C") {
          moveRight();
          inEscape = false;
          escBuffer = "";
        } else if (escBuffer === "[D") {
          moveLeft();
          inEscape = false;
          escBuffer = "";
        } else if (escBuffer === "[H" || escBuffer === "[1~") {
          moveHome();
          inEscape = false;
          escBuffer = "";
        } else if (escBuffer === "[F" || escBuffer === "[4~") {
          moveEnd();
          inEscape = false;
          escBuffer = "";
        } else if (escBuffer === "[3~") {
          deleteChar();
          inEscape = false;
          escBuffer = "";
        } else if (escBuffer.length > 5) {
          inEscape = false;
          escBuffer = "";
        }
        continue;
      }

      if (code === 27) {
        // ESC
        inEscape = true;
        escBuffer = "";
        continue;
      }

      if (code === 3) {
        // Ctrl+C
        if (inMultiLine) {
          inMultiLine = false;
          multiLineBuffer = "";
          braceDepth = 0;
          parenDepth = 0;
          buffer = "";
          cursor = 0;
          process.stdout.write("\n");
          render();
        } else {
          process.stdout.write("\n\x1b[2m(use .exit to quit)\x1b[0m\n");
          buffer = "";
          cursor = 0;
          render();
        }
        continue;
      }

      if (code === 4) {
        // Ctrl+D
        if (buffer.length === 0) {
          process.stdout.write("\n");
          terminal.close();
          if (options.onClose) options.onClose();
          return;
        }
        deleteChar();
        continue;
      }

      if (code === 9) {
        // Tab
        handleTab();
        continue;
      }

      if (code === 13 || code === 10) {
        // Enter
        handleEnter();
        continue;
      }

      if (code === 127 || code === 8) {
        // Backspace
        backspace();
        continue;
      }

      if (code === 1) {
        // Ctrl+A — home
        moveHome();
        continue;
      }

      if (code === 5) {
        // Ctrl+E — end
        moveEnd();
        continue;
      }

      if (code === 11) {
        // Ctrl+K — kill to end
        killLine();
        continue;
      }

      if (code === 21) {
        // Ctrl+U — kill to start
        killToStart();
        continue;
      }

      if (code === 12) {
        // Ctrl+L — clear screen
        process.stdout.write(`${ESC}2J${ESC}H`);
        render();
        continue;
      }

      // Regular printable character
      if (code >= 32) {
        insertChar(ch);
      }
    }
  }

  process.stdin.on("data", handleData);

  const terminal: Terminal = {
    write(text: string): void {
      // Save cursor, move to new line, write, restore
      process.stdout.write(`${CURSOR_SAVE}\n${text}${CURSOR_RESTORE}`);
    },

    setPrompt(_p: string): void {
      // Prompt is now dynamically built from status — setPrompt is a no-op
      render();
    },

    close(): void {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.removeListener("data", handleData);
      process.stdin.pause();
    },

    get history() {
      return history;
    },
  };

  // Initial render
  render();

  return terminal;
}
