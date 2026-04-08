/**
 * BunShell TypeScript REPL.
 *
 * @module
 */

export { startRepl } from "./repl";
export type { ReplOptions } from "./repl";
export { createCompleter } from "./completions";
export {
  parsePipeline,
  parseCommand,
  tokenize,
  getCurrentWord,
} from "./parser";
export type { ParsedCommand, ParsedPipeline } from "./parser";
export { formatAuto } from "./format";
export { highlightCode } from "./highlight";
export { createTerminal } from "./terminal";
export type {
  Terminal,
  TerminalOptions,
  LineHandler,
  Completer,
} from "./terminal";
export { typeCheck } from "./typecheck";
export type { TypeCheckResult, TypeCheckError } from "./typecheck";
export { startTuiRepl } from "./tui";
export type { TuiReplOptions } from "./tui";
