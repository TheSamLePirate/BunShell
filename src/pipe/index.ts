/**
 * BunShell Typed Pipe System — Layer 3
 *
 * Two modes:
 * - pipe()       — array-based, eager, fully typed (existing)
 * - streamPipe() — async iterable, lazy, O(1) memory (new)
 *
 * @module
 */

// Array pipe (eager, buffered)
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

// Stream pipe (lazy, O(1) memory)
export type { StreamStage, StreamSink } from "./stream";
export {
  streamPipe,
  // Operators (s-prefix)
  sFilter,
  sMap,
  sFlatMap,
  sTake,
  sSkip,
  sTap,
  sUnique,
  sPluck,
  sChunk,
  sScan,
  sThrottle,
  sTakeWhile,
  sSkipWhile,
  // Terminal sinks
  sToArray,
  sReduce,
  sCount,
  sFirst,
  sForEach,
  sToFile,
  // Source helpers
  fromArray,
  fromReadable,
  fromLines,
} from "./stream";
