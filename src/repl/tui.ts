/**
 * BunShell TUI — beautiful terminal interface using pi-tui.
 *
 * Features:
 * - Syntax-highlighted editor with autocomplete
 * - Scrollable typed output
 * - Header: green/red/yellow based on type-check status
 * - Real-time tsc type checking as you type
 *
 * @module
 */

import chalk from "chalk";
import {
  TUI,
  ProcessTerminal,
  Editor,
  type Component,
  type EditorTheme,
} from "@mariozechner/pi-tui";
import { highlightCode } from "./highlight";
import { typeCheck } from "./typecheck";
import { formatAuto } from "./format";
import { getSignature, detectFunctionCall } from "./signatures";
import type { CapabilityKind } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Regex to strip ANSI escape codes. */
const ANSI_RE = new RegExp("\x1b" + "\\[[0-9;]*[a-zA-Z]", "g");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TuiReplOptions {
  readonly contextKinds: readonly CapabilityKind[];
  readonly evaluate: (code: string) => Promise<{ value: any; type: string }>;
  readonly handleDotCommand: (cmd: string) => boolean;
  readonly getTypeName: (value: any) => string;
}

// ---------------------------------------------------------------------------
// Custom components
// ---------------------------------------------------------------------------

type CheckStatus = "idle" | "checking" | "ok" | "error";

/** Scrollable output area. */
class OutputArea implements Component {
  private lines: string[] = [];
  private maxLines = 500;

  addOutput(text: string): void {
    this.lines.push(...text.split("\n"));
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(this.lines.length - this.maxLines);
    }
  }

  clear(): void {
    this.lines = [];
  }

  invalidate(): void {
    /* no cache */
  }

  render(width: number): string[] {
    if (this.lines.length === 0) return [];
    // Return ALL lines — pi-tui handles viewport/scrolling
    return this.lines.map((line) => {
      const vis = line.replace(ANSI_RE, "");
      return vis.length > width
        ? line.slice(0, width - 1) + chalk.dim("…")
        : line;
    });
  }
}

/** Header bar — BunShell badge changes color with type-check status. */
class HeaderBar implements Component {
  status: CheckStatus = "idle";
  errorHint = "";

  invalidate(): void {
    /* no cache */
  }

  render(width: number): string[] {
    const badge =
      this.status === "ok"
        ? chalk.bgGreen.black.bold(" BunShell ")
        : this.status === "error"
          ? chalk.bgRed.white.bold(" BunShell ")
          : this.status === "checking"
            ? chalk.bgYellow.black.bold(" BunShell ")
            : chalk.bgCyan.black.bold(" BunShell ");

    const desc = chalk.dim(" ts ");
    const statusText =
      this.status === "ok"
        ? chalk.green("● ok")
        : this.status === "error"
          ? chalk.red("● " + (this.errorHint || "type error").slice(0, 50))
          : this.status === "checking"
            ? chalk.yellow("◌ checking…")
            : chalk.dim("○");

    const right = chalk.dim(" .help │ .type │ .exit ");
    const leftStr = badge + desc + statusText;
    const leftLen = leftStr.replace(ANSI_RE, "").length;
    const rightLen = right.replace(ANSI_RE, "").length;
    const pad = Math.max(1, width - leftLen - rightLen);

    return [leftStr + " ".repeat(pad) + right];
  }
}

/** Signature hint — shows function parameters below editor. */
class SignatureHint implements Component {
  hint = "";

  invalidate(): void {
    /* no cache */
  }

  render(): string[] {
    if (!this.hint) return [];
    return [chalk.dim("  ") + chalk.italic.dim(this.hint)];
  }
}

// ---------------------------------------------------------------------------
// Main TUI REPL
// ---------------------------------------------------------------------------

/**
 * Start the pi-tui based BunShell REPL.
 */
export function startTuiRepl(options: TuiReplOptions): void {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const header = new HeaderBar();
  const output = new OutputArea();

  // Editor theme
  const theme: EditorTheme = {
    borderColor: (s: string) => {
      if (header.status === "ok") return chalk.green(s);
      if (header.status === "error") return chalk.red(s);
      if (header.status === "checking") return chalk.yellow(s);
      return chalk.cyan(s);
    },
    selectList: {
      selectedPrefix: (s) => chalk.cyan(s),
      selectedText: (s) => chalk.cyan.bold(s),
      description: (s) => chalk.dim(s),
      scrollInfo: (s) => chalk.dim(s),
      noMatch: (s) => chalk.dim(s),
    },
  };

  const editor = new Editor(tui, theme, { paddingX: 1 });
  const sigHint = new SignatureHint();

  // Layout: header → output → sigHint → editor
  tui.addChild(header);
  tui.addChild(output);
  tui.addChild(sigHint);
  tui.addChild(editor);

  tui.setFocus(editor);

  // -----------------------------------------------------------------------
  // Real-time type checking
  // -----------------------------------------------------------------------

  let checkTimer: ReturnType<typeof setTimeout> | null = null;
  let checkVersion = 0;

  function setStatus(s: CheckStatus, error?: string): void {
    header.status = s;
    if (error !== undefined) header.errorHint = error;
    header.invalidate();
    tui.requestRender();
  }

  editor.onChange = (text: string) => {
    // Signature hint detection
    const funcName = detectFunctionCall(text);
    const newHint = funcName
      ? (() => {
          const sig = getSignature(funcName);
          return sig
            ? `${funcName}${sig.signature}  ${chalk.dim("— " + sig.description)}`
            : "";
        })()
      : "";
    if (sigHint.hint !== newHint) {
      sigHint.hint = newHint;
      tui.requestRender();
    }

    const code = text.trim();
    if (code.length === 0 || code.startsWith(".")) {
      setStatus("idle", "");
      return;
    }

    setStatus("checking");
    if (checkTimer) clearTimeout(checkTimer);
    checkVersion++;
    const thisVersion = checkVersion;

    checkTimer = setTimeout(async () => {
      try {
        const result = await typeCheck(code, options.contextKinds);
        if (thisVersion !== checkVersion) return;
        if (result.pass) {
          setStatus("ok", "");
        } else {
          setStatus("error", result.errors[0]?.message ?? "type error");
        }
      } catch {
        if (thisVersion === checkVersion) setStatus("error", "check failed");
      }
    }, 400);
  };

  // -----------------------------------------------------------------------
  // Submit handler
  // -----------------------------------------------------------------------

  editor.onSubmit = async (code: string) => {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;

    // Echo input
    output.addOutput(chalk.dim("› ") + highlightCode(trimmed));

    // Dot commands
    if (trimmed.startsWith(".")) {
      if (trimmed === ".exit" || trimmed === ".quit") {
        tui.stop();
        process.exit(0);
      }
      if (trimmed === ".clear") {
        output.clear();
        setStatus("idle", "");
        tui.requestRender();
        return;
      }
      // Capture console.log output from dot command handlers
      const oldLog = console.log;
      let captured = "";
      console.log = (...args: unknown[]) => {
        captured += args.map(String).join(" ") + "\n";
      };
      options.handleDotCommand(trimmed);
      console.log = oldLog;
      if (captured.trim()) output.addOutput(captured.trimEnd());
      editor.setText("");
      setStatus("idle", "");
      tui.requestRender();
      return;
    }

    // Type check
    setStatus("checking");
    tui.requestRender();

    const check = await typeCheck(code, options.contextKinds);
    if (!check.pass) {
      for (const err of check.errors) {
        output.addOutput(
          chalk.red("error ") +
            chalk.dim(err.code) +
            chalk.dim(` (${err.line}:${err.col})`) +
            ": " +
            err.message,
        );
      }
      output.addOutput(
        chalk.dim(
          `${check.errors.length} type error${check.errors.length === 1 ? "" : "s"} — not executed`,
        ),
      );
      setStatus("error", check.errors[0]?.message);
      editor.setText("");
      editor.addToHistory(code);
      tui.requestRender();
      return;
    }

    // Execute
    try {
      const result = await options.evaluate(code);
      if (result.value !== undefined) {
        output.addOutput(chalk.dim(`// : ${result.type}`));
        output.addOutput(formatAuto(result.value));
      }
      setStatus("ok", "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output.addOutput(chalk.red("Error: ") + message);
      setStatus("error", message);
    }

    output.addOutput("");
    editor.setText("");
    editor.addToHistory(code);
    tui.requestRender();
  };

  // -----------------------------------------------------------------------
  // Welcome
  // -----------------------------------------------------------------------

  output.addOutput(
    chalk.dim("Try: ") +
      highlightCode('await ls(ctx, ".")') +
      chalk.dim(" │ ") +
      chalk.cyan(".type FileEntry") +
      chalk.dim(" │ ") +
      chalk.cyan(".help"),
  );

  tui.start();
}

/* eslint-enable @typescript-eslint/no-explicit-any */
