/**
 * BunShell REPL — Interactive typed shell.
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
export { COMMANDS, findCommand, FILE_ENTRY_FIELDS } from "./commands";
export type { CommandDef, ArgDef, FlagDef, ArgType } from "./commands";
export { formatAuto } from "./format";
