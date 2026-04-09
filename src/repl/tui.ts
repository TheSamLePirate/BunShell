/**
 * BunShell TUI — terminal pushed to the edge.
 *
 * Fixed layout: StatusBar pinned top, InfoBar pinned bottom,
 * OutputArea scrolls in between. Mouse wheel scrolls output.
 * Click on InfoBar commands to execute them.
 *
 * The OutputArea returns exactly viewportHeight lines so the
 * total buffer height matches the terminal — nothing scrolls
 * at the pi-tui level. Scroll is managed internally.
 *
 * Mouse: xterm SGR 1006 protocol for wheel + click.
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
import { typeCheck, type TypeCheckError } from "./typecheck";
import { formatAuto } from "./format";
import { getSignature, detectFunctionCall } from "./signatures";
import type { CapabilityKind } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ANSI_RE = new RegExp("\x1b" + "\\[[0-9;]*[a-zA-Z]", "g");

function visLen(s: string): number {
  return s.replace(ANSI_RE, "").length;
}

function pad(s: string, width: number): string {
  const len = visLen(s);
  return len >= width ? s : s + " ".repeat(width - len);
}

function truncVis(s: string, width: number): string {
  const vis = s.replace(ANSI_RE, "");
  if (vis.length <= width) return s;
  return s.slice(0, width - 1) + chalk.dim("…");
}

// Box-drawing
const BOX = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" } as const;

function boxLine(
  content: string,
  width: number,
  color: (s: string) => string,
): string {
  const inner = width - 4;
  const vis = content.replace(ANSI_RE, "").length;
  const padded = vis >= inner ? content : content + " ".repeat(inner - vis);
  return color(BOX.v) + " " + padded + " " + color(BOX.v);
}

function boxTop(
  title: string,
  width: number,
  color: (s: string) => string,
): string {
  const titleLen = title.replace(ANSI_RE, "").length;
  const lineLen = Math.max(1, width - 4 - titleLen);
  return (
    color(BOX.tl + BOX.h + " ") +
    title +
    " " +
    color(BOX.h.repeat(lineLen) + BOX.tr)
  );
}

function boxBottom(width: number, color: (s: string) => string): string {
  return color(BOX.bl + BOX.h.repeat(width - 2) + BOX.br);
}

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

type CheckStatus = "idle" | "checking" | "ok" | "error";

// ---------------------------------------------------------------------------
// Mouse protocol
// ---------------------------------------------------------------------------

/** Enable xterm SGR 1006 mouse tracking. */
function enableMouse(): void {
  // Enable mouse tracking: button events + wheel + SGR extended mode
  process.stdout.write("\x1b[?1000h"); // Enable mouse button tracking
  process.stdout.write("\x1b[?1002h"); // Enable mouse button + motion tracking
  process.stdout.write("\x1b[?1006h"); // Enable SGR extended mouse mode
}

/** Disable mouse tracking. */
function disableMouse(): void {
  process.stdout.write("\x1b[?1006l");
  process.stdout.write("\x1b[?1002l");
  process.stdout.write("\x1b[?1000l");
}

/** Parsed mouse event. */
interface MouseEvent {
  readonly button: number; // 0=left, 1=middle, 2=right, 64=wheelUp, 65=wheelDown
  readonly col: number; // 1-based
  readonly row: number; // 1-based
  readonly press: boolean; // true=press, false=release
}

/**
 * Try to parse an SGR 1006 mouse event from input data.
 * Format: ESC [ < button ; col ; row M|m
 */
function parseMouseEvent(data: string): MouseEvent | null {
  // eslint-disable-next-line no-control-regex
  const match = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
  if (!match) return null;
  return {
    button: parseInt(match[1]!, 10),
    col: parseInt(match[2]!, 10),
    row: parseInt(match[3]!, 10),
    press: match[4] === "M",
  };
}

// ---------------------------------------------------------------------------
// StatusBar — pinned top, solid green/red BG
// ---------------------------------------------------------------------------

class StatusBar implements Component {
  status: CheckStatus = "idle";
  errorHint = "";
  capKinds: readonly CapabilityKind[] = [];

  invalidate(): void {}

  render(width: number): string[] {
    const badge =
      this.status === "ok"
        ? chalk.bgGreen.black.bold(" ■ BunShell ")
        : this.status === "error"
          ? chalk.bgRed.white.bold(" ■ BunShell ")
          : this.status === "checking"
            ? chalk.bgYellow.black.bold(" ■ BunShell ")
            : chalk.bgCyan.black.bold(" ■ BunShell ");

    const statusIcon =
      this.status === "ok"
        ? chalk.bgGreen.black.bold(" ✓ PASS ")
        : this.status === "error"
          ? chalk.bgRed.white.bold(" ✗ FAIL ")
          : this.status === "checking"
            ? chalk.bgYellow.black(" ◌ checking… ")
            : chalk.dim(" ○ idle ");

    const sep = chalk.dim(" │ ");

    // Capability chips colored by category
    const chips: string[] = [];
    const kinds = [...new Set(this.capKinds)].sort();
    for (const k of kinds) {
      if (k.startsWith("plugin:")) chips.push(chalk.magenta(k));
      else if (k.startsWith("docker:")) chips.push(chalk.blue(k));
      else if (k.startsWith("fs:")) chips.push(chalk.green(k));
      else if (k.startsWith("net:")) chips.push(chalk.cyan(k));
      else if (k.startsWith("process:")) chips.push(chalk.yellow(k));
      else if (k.startsWith("env:")) chips.push(chalk.white(k));
      else if (k.startsWith("secret:")) chips.push(chalk.red(k));
      else if (k.startsWith("db:")) chips.push(chalk.blue(k));
      else chips.push(chalk.dim(k));
    }

    const leftPart = badge + sep + statusIcon + sep;
    const leftLen = visLen(leftPart);
    const maxChipWidth = width - leftLen - 2;
    let chipStr = "";
    let chipLen = 0;
    for (const chip of chips) {
      const cLen = visLen(chip) + 1;
      if (chipLen + cLen > maxChipWidth) break;
      chipStr += chip + " ";
      chipLen += cLen;
    }

    return [pad(leftPart + chipStr, width)];
  }
}

// ---------------------------------------------------------------------------
// OutputArea — viewport-managed, boxed results, error panels
// ---------------------------------------------------------------------------

class OutputArea implements Component {
  private allLines: string[] = [];
  private maxLines = 2000;
  viewportHeight = 10;
  scrollOffset = 0; // 0 = pinned to bottom (latest), positive = scrolled up
  auditCount = 0;
  execCount = 0;

  addOutput(text: string): void {
    this.allLines.push(...text.split("\n"));
    if (this.allLines.length > this.maxLines) {
      this.allLines = this.allLines.slice(this.allLines.length - this.maxLines);
    }
    // Reset scroll to bottom when new output arrives
    this.scrollOffset = 0;
  }

  addResult(type: string, formatted: string, width: number): void {
    const color = (s: string) => chalk.dim(s);
    this.allLines.push(boxTop(chalk.magenta.bold(type), width, color));
    for (const line of formatted.split("\n")) {
      this.allLines.push(boxLine(line, width, color));
    }
    this.allLines.push(boxBottom(width, color));
    this.scrollOffset = 0;
  }

  addError(errors: readonly TypeCheckError[], width: number): void {
    const color = (s: string) => chalk.red(s);
    const count = errors.length;
    const title = chalk.red.bold(
      `✗ ${count} TYPE ERROR${count > 1 ? "S" : ""}`,
    );
    this.allLines.push(boxTop(title, width, color));

    for (const err of errors) {
      this.allLines.push(
        boxLine(
          chalk.red.bold(err.code) + chalk.dim(` (${err.line}:${err.col})`),
          width,
          color,
        ),
      );
      const msgWidth = width - 6;
      const words = err.message.split(" ");
      let msgLine = "";
      for (const word of words) {
        if (msgLine.length + word.length + 1 > msgWidth && msgLine.length > 0) {
          this.allLines.push(boxLine("  " + msgLine, width, color));
          msgLine = word;
        } else {
          msgLine = msgLine ? msgLine + " " + word : word;
        }
      }
      if (msgLine) this.allLines.push(boxLine("  " + msgLine, width, color));

      const fix = suggestFix(err);
      if (fix) {
        this.allLines.push(boxLine("", width, color));
        this.allLines.push(
          boxLine(chalk.yellow("  → ") + chalk.italic(fix), width, color),
        );
      }

      if (errors.indexOf(err) < errors.length - 1) {
        this.allLines.push(
          boxLine(chalk.dim("─".repeat(width - 6)), width, color),
        );
      }
    }

    this.allLines.push(boxBottom(width, color));
    this.allLines.push(
      chalk.dim(`  ${count} type error${count > 1 ? "s" : ""} — not executed`),
    );
    this.scrollOffset = 0;
  }

  /** Scroll up (positive delta) or down (negative delta). */
  scroll(delta: number): void {
    const maxScroll = Math.max(0, this.allLines.length - this.viewportHeight);
    this.scrollOffset = Math.max(
      0,
      Math.min(maxScroll, this.scrollOffset + delta),
    );
  }

  get totalLines(): number {
    return this.allLines.length;
  }

  get isScrolledUp(): boolean {
    return this.scrollOffset > 0;
  }

  get linesAbove(): number {
    const endIdx = this.allLines.length - this.scrollOffset;
    const startIdx = Math.max(0, endIdx - this.viewportHeight);
    return startIdx;
  }

  get linesBelow(): number {
    return this.scrollOffset;
  }

  clear(): void {
    this.allLines = [];
    this.scrollOffset = 0;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const vh = this.viewportHeight;

    if (this.allLines.length === 0) {
      // Fill viewport with empty lines to maintain fixed layout
      return new Array(vh).fill("");
    }

    // Calculate visible window (pinned to bottom minus scrollOffset)
    const endIdx = this.allLines.length - this.scrollOffset;
    const startIdx = Math.max(0, endIdx - vh);
    const visible = this.allLines.slice(startIdx, endIdx);

    // Truncate and pad to exact viewport height
    const lines = visible.map((line) => truncVis(line, width));

    // Pad if not enough content to fill viewport
    while (lines.length < vh) {
      lines.unshift(""); // pad from top
    }

    // Scroll indicators (replace first/last line if scrolled)
    if (startIdx > 0) {
      const aboveCount = startIdx;
      lines[0] = chalk.dim(
        `  ▲ ${aboveCount} more line${aboveCount > 1 ? "s" : ""} above — scroll up`,
      );
    }
    if (this.scrollOffset > 0) {
      const belowCount = this.scrollOffset;
      lines[lines.length - 1] = chalk.dim(
        `  ▼ ${belowCount} more line${belowCount > 1 ? "s" : ""} below — scroll down`,
      );
    }

    return lines;
  }
}

// ---------------------------------------------------------------------------
// SignatureHint
// ---------------------------------------------------------------------------

class SignatureHint implements Component {
  hint = "";

  invalidate(): void {}

  render(width: number): string[] {
    if (!this.hint) return [""]; // Always 1 line to maintain fixed layout
    return [truncVis(chalk.dim("  ") + chalk.italic.dim(this.hint), width)];
  }
}

// ---------------------------------------------------------------------------
// InfoBar — pinned bottom
// ---------------------------------------------------------------------------

class InfoBar implements Component {
  ctxName = "ctx";
  capCount = 0;
  auditCount = 0;
  pluginCount = 0;
  execCount = 0;
  scrollInfo = "";

  invalidate(): void {}

  render(width: number): string[] {
    const parts: string[] = [];
    parts.push(chalk.cyan.bold(this.ctxName));
    parts.push(chalk.dim("│"));
    parts.push(chalk.green(`${this.capCount} caps`));
    parts.push(chalk.dim("│"));
    parts.push(chalk.yellow(`${this.execCount} exec`));
    parts.push(chalk.dim("│"));
    parts.push(chalk.dim(`${this.auditCount} audit`));

    if (this.pluginCount > 0) {
      parts.push(chalk.dim("│"));
      parts.push(chalk.magenta(`${this.pluginCount} plugins`));
    }

    if (this.scrollInfo) {
      parts.push(chalk.dim("│"));
      parts.push(chalk.dim(this.scrollInfo));
    }

    const leftStr = " " + parts.join(" ");

    // Clickable commands (positions tracked for mouse)
    const rightStr =
      chalk.dim(" .help ") +
      chalk.dim("│") +
      chalk.dim(" .type ") +
      chalk.dim("│") +
      chalk.dim(" .caps ") +
      chalk.dim("│") +
      chalk.dim(" .exit ");

    const leftLen = visLen(leftStr);
    const rightLen = visLen(rightStr);
    const padLen = Math.max(1, width - leftLen - rightLen);

    return [chalk.bgBlackBright(leftStr + " ".repeat(padLen) + rightStr)];
  }
}

// ---------------------------------------------------------------------------
// Fix suggestions
// ---------------------------------------------------------------------------

function suggestFix(err: TypeCheckError): string | null {
  const msg = err.message;
  const reqMatch = msg.match(/RequireCap<\w+,\s*"([^"]+)"/);
  if (reqMatch) {
    const needed = reqMatch[1]!;
    const builderMethod = capToBuilder(needed);
    if (builderMethod)
      return `Add .${builderMethod} to your capability builder`;
    return `Context needs "${needed}" capability`;
  }
  if (msg.includes("not assignable") && msg.includes("never")) {
    const capMatch = msg.match(/"([a-z]+:[a-z]+)"/);
    if (capMatch)
      return `Context missing "${capMatch[1]}" — add it to capabilities()`;
  }
  if (msg.includes("does not exist on type")) {
    return "Check spelling or use .type to explore available types";
  }
  return null;
}

function capToBuilder(kind: string): string | null {
  const map: Record<string, string> = {
    "fs:read": 'fsRead("**")',
    "fs:write": 'fsWrite("/tmp/**")',
    "fs:delete": 'fsDelete("/tmp/**")',
    "process:spawn": 'spawn(["command"])',
    "net:fetch": 'netFetch(["domain.com"])',
    "net:listen": "netListen(3000)",
    "env:read": 'envRead(["KEY"])',
    "env:write": 'envWrite(["KEY"])',
    "db:query": 'dbQuery("/data/**")',
    "docker:run": 'dockerRun(["image"])',
  };
  return map[kind] ?? null;
}

// ---------------------------------------------------------------------------
// Main TUI REPL
// ---------------------------------------------------------------------------

export function startTuiRepl(options: TuiReplOptions): void {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  const statusBar = new StatusBar();
  statusBar.capKinds = options.contextKinds;

  const output = new OutputArea();
  const sigHint = new SignatureHint();
  const infoBar = new InfoBar();
  infoBar.capCount = options.contextKinds.length;

  // Compute viewport: terminal height - status(1) - hint(1) - editor(~3) - info(1)
  function updateViewport(): void {
    const termH = process.stdout.rows ?? 24;
    const editorEstimate = 3; // border top + 1 line + border bottom
    output.viewportHeight = Math.max(3, termH - 1 - 1 - editorEstimate - 1);
  }
  updateViewport();

  // Re-compute on terminal resize
  process.stdout.on("resize", () => {
    updateViewport();
    tui.requestRender();
  });

  // Editor theme
  const theme: EditorTheme = {
    borderColor: (s: string) => {
      if (statusBar.status === "ok") return chalk.green(s);
      if (statusBar.status === "error") return chalk.red(s);
      if (statusBar.status === "checking") return chalk.yellow(s);
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

  // Layout: statusBar → output (fixed viewport) → sigHint → editor → infoBar
  tui.addChild(statusBar);
  tui.addChild(output);
  tui.addChild(sigHint);
  tui.addChild(editor);
  tui.addChild(infoBar);
  tui.setFocus(editor);

  // -----------------------------------------------------------------------
  // Mouse support — enable xterm SGR 1006
  // -----------------------------------------------------------------------

  enableMouse();

  // Intercept raw stdin for mouse events BEFORE pi-tui processes them
  process.stdin.prependListener("data", (data: Buffer) => {
    const str = data.toString();
    const mouse = parseMouseEvent(str);
    if (!mouse) return; // Not a mouse event — let pi-tui handle it

    if (mouse.press) {
      // Wheel up (button 64)
      if (mouse.button === 64) {
        output.scroll(3); // Scroll up 3 lines
        infoBar.scrollInfo = output.isScrolledUp
          ? `↑${output.linesAbove} ↓${output.linesBelow}`
          : "";
        tui.requestRender();
      }
      // Wheel down (button 65)
      else if (mouse.button === 65) {
        output.scroll(-3); // Scroll down 3 lines
        infoBar.scrollInfo = output.isScrolledUp
          ? `↑${output.linesAbove} ↓${output.linesBelow}`
          : "";
        tui.requestRender();
      }
      // Left click (button 0)
      else if (mouse.button === 0) {
        const termH = process.stdout.rows ?? 24;
        const termW = process.stdout.columns ?? 80;

        // Click on InfoBar (last row)
        if (mouse.row === termH) {
          const rightStart = termW - 30;
          if (mouse.col > rightStart) {
            // Approximate positions of commands
            const col = mouse.col - rightStart;
            if (col >= 1 && col <= 6) {
              // .help
              editor.setText(".help");
              editor.onSubmit?.(".help");
            } else if (col >= 8 && col <= 14) {
              // .type
              editor.setText(".type");
              editor.onSubmit?.(".type");
            } else if (col >= 16 && col <= 21) {
              // .caps
              editor.setText(".caps");
              editor.onSubmit?.(".caps");
            } else if (col >= 23) {
              // .exit
              editor.setText(".exit");
              editor.onSubmit?.(".exit");
            }
          }
        }

        // Click on StatusBar (first row) — toggle capability view
        if (mouse.row === 1) {
          editor.setText(".caps");
          editor.onSubmit?.(".caps");
        }
      }
    }
  });

  // Cleanup on exit
  const cleanup = (): void => {
    disableMouse();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  // -----------------------------------------------------------------------
  // Real-time type checking
  // -----------------------------------------------------------------------

  let checkTimer: ReturnType<typeof setTimeout> | null = null;
  let checkVersion = 0;

  function setStatus(s: CheckStatus, error?: string): void {
    statusBar.status = s;
    if (error !== undefined) statusBar.errorHint = error;
    statusBar.invalidate();
    tui.requestRender();
  }

  editor.onChange = (text: string) => {
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

    const termWidth = process.stdout.columns ?? 80;

    output.addOutput(chalk.dim("› ") + highlightCode(trimmed));

    // Dot commands
    if (trimmed.startsWith(".")) {
      if (trimmed === ".exit" || trimmed === ".quit") {
        cleanup();
        tui.stop();
        process.exit(0);
      }
      if (trimmed === ".clear") {
        output.clear();
        setStatus("idle", "");
        tui.requestRender();
        return;
      }

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
      infoBar.execCount++;
      tui.requestRender();
      return;
    }

    // Type check
    setStatus("checking");
    tui.requestRender();

    const check = await typeCheck(code, options.contextKinds);
    if (!check.pass) {
      output.addError(check.errors, termWidth);
      setStatus("error", check.errors[0]?.message);
      editor.setText("");
      editor.addToHistory(code);
      infoBar.execCount++;
      tui.requestRender();
      return;
    }

    // Execute
    try {
      const result = await options.evaluate(code);
      if (result.value !== undefined) {
        output.addResult(result.type, formatAuto(result.value), termWidth);
      }
      setStatus("ok", "");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output.addOutput(chalk.red.bold("Runtime Error: ") + message);
      setStatus("error", message);
    }

    output.addOutput("");
    editor.setText("");
    editor.addToHistory(code);
    infoBar.execCount++;
    tui.requestRender();
  };

  // -----------------------------------------------------------------------
  // Welcome
  // -----------------------------------------------------------------------

  output.addOutput(
    chalk.dim("  ") +
      chalk.cyan.bold("Welcome to BunShell") +
      chalk.dim(" — types ARE permissions"),
  );
  output.addOutput(
    chalk.dim("  ") +
      highlightCode('await ls(ctx, ".")') +
      chalk.dim(" │ ") +
      chalk.cyan(".type FileEntry") +
      chalk.dim(" │ ") +
      chalk.cyan(".help"),
  );
  output.addOutput(
    chalk.dim("  Mouse: scroll wheel ↕ output │ click infobar commands"),
  );
  output.addOutput("");

  tui.start();
}

/* eslint-enable @typescript-eslint/no-explicit-any */
