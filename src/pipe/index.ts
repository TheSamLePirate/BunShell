/**
 * BunShell Typed Pipe System — Layer 3
 *
 * Compile-time verified data pipelines. Output types flow through
 * each stage and are checked by the TypeScript compiler.
 *
 * @module
 */

export type { PipeStage } from "./types";
export { pipe } from "./pipe";
export {
  filter,
  map,
  reduce,
  take,
  skip,
  sortBy,
  groupBy,
  unique,
  flatMap,
  tap,
  count,
  first,
  last,
  pluck,
} from "./operators";
export { from, fromFile, fromJSON, fromCommand } from "./sources";
export { toFile, toJSON, toStdout, collect } from "./sinks";
