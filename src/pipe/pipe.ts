/**
 * Typed pipe function with overloads.
 *
 * Provides end-to-end type inference through a chain of stages.
 * If ls() returns FileEntry[], and filter takes FileEntry[] → FileEntry[],
 * the pipe is fully typed — the compiler catches mismatches.
 *
 * @module
 */

import type { PipeStage } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Overloads for 1–10 stages
export function pipe<A, B>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
): Promise<B>;
export function pipe<A, B, C>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
): Promise<C>;
export function pipe<A, B, C, D>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
): Promise<D>;
export function pipe<A, B, C, D, E>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
  s4: PipeStage<D, E>,
): Promise<E>;
export function pipe<A, B, C, D, E, F>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
  s4: PipeStage<D, E>,
  s5: PipeStage<E, F>,
): Promise<F>;
export function pipe<A, B, C, D, E, F, G>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
  s4: PipeStage<D, E>,
  s5: PipeStage<E, F>,
  s6: PipeStage<F, G>,
): Promise<G>;
export function pipe<A, B, C, D, E, F, G, H>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
  s4: PipeStage<D, E>,
  s5: PipeStage<E, F>,
  s6: PipeStage<F, G>,
  s7: PipeStage<G, H>,
): Promise<H>;
export function pipe<A, B, C, D, E, F, G, H, I>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
  s4: PipeStage<D, E>,
  s5: PipeStage<E, F>,
  s6: PipeStage<F, G>,
  s7: PipeStage<G, H>,
  s8: PipeStage<H, I>,
): Promise<I>;
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
  s4: PipeStage<D, E>,
  s5: PipeStage<E, F>,
  s6: PipeStage<F, G>,
  s7: PipeStage<G, H>,
  s8: PipeStage<H, I>,
  s9: PipeStage<I, J>,
): Promise<J>;
export function pipe<A, B, C, D, E, F, G, H, I, J, K>(
  source: A | Promise<A>,
  s1: PipeStage<A, B>,
  s2: PipeStage<B, C>,
  s3: PipeStage<C, D>,
  s4: PipeStage<D, E>,
  s5: PipeStage<E, F>,
  s6: PipeStage<F, G>,
  s7: PipeStage<G, H>,
  s8: PipeStage<H, I>,
  s9: PipeStage<I, J>,
  s10: PipeStage<J, K>,
): Promise<K>;

/**
 * Pipe data through a chain of typed stages.
 *
 * @example
 * ```ts
 * const result = await pipe(
 *   [3, 1, 4, 1, 5],
 *   filter<number>(n => n > 2),
 *   map<number, string>(n => String(n)),
 * );
 * // result: ["3", "4", "5"]
 * ```
 */
export async function pipe(
  source: any,
  ...stages: Array<(input: any) => any>
): Promise<any> {
  let result = await source;
  for (const stage of stages) {
    result = await stage(result);
  }
  return result;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
