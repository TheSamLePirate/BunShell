/**
 * Pipe system types.
 *
 * @module
 */

/**
 * A PipeStage transforms data from type A to type B.
 * Can be sync or async.
 */
export type PipeStage<A, B> = (input: A) => B | Promise<B>;
