/**
 * Streaming pipe system — lazy async iterable operators.
 *
 * Unlike the array-based pipe(), streamPipe() processes items one at a time
 * through async generators. Memory usage stays constant regardless of
 * input size — a 5GB log file uses the same memory as a 5KB one.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A streaming stage: transforms an async iterable into another. */
export type StreamStage<A, B> = (input: AsyncIterable<A>) => AsyncIterable<B>;

/** A terminal stage: consumes a stream and produces a final value. */
export type StreamSink<A, B> = (input: AsyncIterable<A>) => Promise<B>;

// ---------------------------------------------------------------------------
// streamPipe — lazy async iterable pipeline
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

// Overloads for 1–8 stages
export function streamPipe<A, B>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
): AsyncIterable<B>;
export function streamPipe<A, B, C>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
  s2: StreamStage<B, C>,
): AsyncIterable<C>;
export function streamPipe<A, B, C, D>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
  s2: StreamStage<B, C>,
  s3: StreamStage<C, D>,
): AsyncIterable<D>;
export function streamPipe<A, B, C, D, E>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
  s2: StreamStage<B, C>,
  s3: StreamStage<C, D>,
  s4: StreamStage<D, E>,
): AsyncIterable<E>;
export function streamPipe<A, B, C, D, E, F>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
  s2: StreamStage<B, C>,
  s3: StreamStage<C, D>,
  s4: StreamStage<D, E>,
  s5: StreamStage<E, F>,
): AsyncIterable<F>;
export function streamPipe<A, B, C, D, E, F, G>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
  s2: StreamStage<B, C>,
  s3: StreamStage<C, D>,
  s4: StreamStage<D, E>,
  s5: StreamStage<E, F>,
  s6: StreamStage<F, G>,
): AsyncIterable<G>;
export function streamPipe<A, B, C, D, E, F, G, H>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
  s2: StreamStage<B, C>,
  s3: StreamStage<C, D>,
  s4: StreamStage<D, E>,
  s5: StreamStage<E, F>,
  s6: StreamStage<F, G>,
  s7: StreamStage<G, H>,
): AsyncIterable<H>;
export function streamPipe<A, B, C, D, E, F, G, H, I>(
  source: AsyncIterable<A>,
  s1: StreamStage<A, B>,
  s2: StreamStage<B, C>,
  s3: StreamStage<C, D>,
  s4: StreamStage<D, E>,
  s5: StreamStage<E, F>,
  s6: StreamStage<F, G>,
  s7: StreamStage<G, H>,
  s8: StreamStage<H, I>,
): AsyncIterable<I>;

/**
 * Lazy streaming pipe — chains async iterables with zero buffering.
 * Each item flows through the entire chain before the next is pulled.
 *
 * @example
 * ```ts
 * // Process a 5GB log file with constant memory:
 * const errors = streamPipe(
 *   lineStream(ctx, "/var/log/huge.log"),
 *   sFilter(line => line.includes("ERROR")),
 *   sMap(line => ({ ts: line.slice(0, 23), msg: line.slice(24) })),
 *   sTake(100),
 * );
 * for await (const err of errors) console.log(err);
 * ```
 */
export function streamPipe(
  source: AsyncIterable<any>,
  ...stages: Array<(input: AsyncIterable<any>) => AsyncIterable<any>>
): AsyncIterable<any> {
  let current: AsyncIterable<any> = source;
  for (const stage of stages) {
    current = stage(current);
  }
  return current;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Streaming operators — all lazy, all O(1) memory
// ---------------------------------------------------------------------------

/**
 * Stream filter — yields only items matching the predicate.
 *
 * @example
 * ```ts
 * streamPipe(source, sFilter(line => line.includes("ERROR")))
 * ```
 */
export function sFilter<T>(
  predicate: (item: T) => boolean | Promise<boolean>,
): StreamStage<T, T> {
  return async function* (input) {
    for await (const item of input) {
      if (await predicate(item)) yield item;
    }
  };
}

/**
 * Stream map — transforms each item lazily.
 *
 * @example
 * ```ts
 * streamPipe(source, sMap(line => line.toUpperCase()))
 * ```
 */
export function sMap<T, U>(fn: (item: T) => U | Promise<U>): StreamStage<T, U> {
  return async function* (input) {
    for await (const item of input) {
      yield await fn(item);
    }
  };
}

/**
 * Stream flatMap — maps each item to multiple items.
 *
 * @example
 * ```ts
 * streamPipe(source, sFlatMap(line => line.split(",")))
 * ```
 */
export function sFlatMap<T, U>(
  fn: (item: T) => Iterable<U> | AsyncIterable<U>,
): StreamStage<T, U> {
  return async function* (input) {
    for await (const item of input) {
      yield* fn(item) as AsyncIterable<U>;
    }
  };
}

/**
 * Stream take — yields the first N items, then stops.
 * The upstream is NOT consumed beyond N — backpressure is respected.
 *
 * @example
 * ```ts
 * streamPipe(infiniteSource, sTake(10))
 * ```
 */
export function sTake<T>(n: number): StreamStage<T, T> {
  return async function* (input) {
    let count = 0;
    for await (const item of input) {
      if (count >= n) return;
      yield item;
      count++;
    }
  };
}

/**
 * Stream skip — drops the first N items, yields the rest.
 *
 * @example
 * ```ts
 * streamPipe(source, sSkip(100))
 * ```
 */
export function sSkip<T>(n: number): StreamStage<T, T> {
  return async function* (input) {
    let count = 0;
    for await (const item of input) {
      if (count >= n) yield item;
      count++;
    }
  };
}

/**
 * Stream tap — side effect without modifying items.
 *
 * @example
 * ```ts
 * streamPipe(source, sTap(item => console.log("processing:", item)))
 * ```
 */
export function sTap<T>(
  fn: (item: T) => void | Promise<void>,
): StreamStage<T, T> {
  return async function* (input) {
    for await (const item of input) {
      await fn(item);
      yield item;
    }
  };
}

/**
 * Stream unique — deduplicates items using a Set.
 * Memory grows with the number of unique items, not total items.
 *
 * @example
 * ```ts
 * streamPipe(source, sUnique())
 * streamPipe(source, sUnique(item => item.id))
 * ```
 */
export function sUnique<T>(keyFn?: (item: T) => unknown): StreamStage<T, T> {
  return async function* (input) {
    const seen = new Set<unknown>();
    for await (const item of input) {
      const key = keyFn ? keyFn(item) : item;
      if (!seen.has(key)) {
        seen.add(key);
        yield item;
      }
    }
  };
}

/**
 * Stream pluck — extracts a single property from each item.
 *
 * @example
 * ```ts
 * streamPipe(fileStream, sPluck("name"))
 * ```
 */
export function sPluck<T, K extends keyof T>(key: K): StreamStage<T, T[K]> {
  return async function* (input) {
    for await (const item of input) {
      yield item[key];
    }
  };
}

/**
 * Stream chunk — groups items into fixed-size arrays.
 * Useful for batched processing (e.g., batch DB inserts).
 *
 * @example
 * ```ts
 * streamPipe(source, sChunk(100), sMap(batch => insertAll(batch)))
 * ```
 */
export function sChunk<T>(size: number): StreamStage<T, T[]> {
  return async function* (input) {
    let batch: T[] = [];
    for await (const item of input) {
      batch.push(item);
      if (batch.length >= size) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length > 0) yield batch;
  };
}

/**
 * Stream scan — running accumulator, yielding each intermediate value.
 * Like reduce but emits at every step.
 *
 * @example
 * ```ts
 * streamPipe(numbers, sScan((sum, n) => sum + n, 0))
 * // yields: 1, 3, 6, 10, ...
 * ```
 */
export function sScan<T, U>(
  fn: (acc: U, item: T) => U,
  initial: U,
): StreamStage<T, U> {
  return async function* (input) {
    let acc = initial;
    for await (const item of input) {
      acc = fn(acc, item);
      yield acc;
    }
  };
}

/**
 * Stream throttle — yields at most one item per interval.
 * Items arriving too fast are dropped.
 *
 * @example
 * ```ts
 * streamPipe(fastSource, sThrottle(100)) // max 10 items/sec
 * ```
 */
export function sThrottle<T>(ms: number): StreamStage<T, T> {
  return async function* (input) {
    let lastYield = 0;
    for await (const item of input) {
      const now = Date.now();
      if (now - lastYield >= ms) {
        lastYield = now;
        yield item;
      }
    }
  };
}

/**
 * Stream takeWhile — yields items while predicate is true, then stops.
 *
 * @example
 * ```ts
 * streamPipe(logLines, sTakeWhile(line => !line.includes("SHUTDOWN")))
 * ```
 */
export function sTakeWhile<T>(
  predicate: (item: T) => boolean,
): StreamStage<T, T> {
  return async function* (input) {
    for await (const item of input) {
      if (!predicate(item)) return;
      yield item;
    }
  };
}

/**
 * Stream skipWhile — drops items while predicate is true, yields the rest.
 *
 * @example
 * ```ts
 * streamPipe(logLines, sSkipWhile(line => !line.includes("START")))
 * ```
 */
export function sSkipWhile<T>(
  predicate: (item: T) => boolean,
): StreamStage<T, T> {
  return async function* (input) {
    let skipping = true;
    for await (const item of input) {
      if (skipping) {
        if (predicate(item)) continue;
        skipping = false;
      }
      yield item;
    }
  };
}

// ---------------------------------------------------------------------------
// Terminal sinks — consume the stream and produce a value
// ---------------------------------------------------------------------------

/**
 * Collect a stream into an array.
 * WARNING: buffers everything. Use only when you know the stream is bounded.
 *
 * @example
 * ```ts
 * const items = await sToArray(streamPipe(source, sFilter(...), sTake(100)));
 * ```
 */
export async function sToArray<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const item of stream) {
    result.push(item);
  }
  return result;
}

/**
 * Reduce a stream to a single value.
 *
 * @example
 * ```ts
 * const total = await sReduce(stream, (sum, n) => sum + n, 0);
 * ```
 */
export async function sReduce<T, U>(
  stream: AsyncIterable<T>,
  fn: (acc: U, item: T) => U,
  initial: U,
): Promise<U> {
  let acc = initial;
  for await (const item of stream) {
    acc = fn(acc, item);
  }
  return acc;
}

/**
 * Count items in a stream.
 *
 * @example
 * ```ts
 * const n = await sCount(streamPipe(source, sFilter(predicate)));
 * ```
 */
export async function sCount<T>(stream: AsyncIterable<T>): Promise<number> {
  let n = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _item of stream) {
    n++;
  }
  return n;
}

/**
 * Get the first item from a stream.
 * Stops consuming after the first item.
 *
 * @example
 * ```ts
 * const first = await sFirst(streamPipe(source, sFilter(pred)));
 * ```
 */
export async function sFirst<T>(
  stream: AsyncIterable<T>,
): Promise<T | undefined> {
  for await (const item of stream) {
    return item;
  }
  return undefined;
}

/**
 * Run a function for each item in a stream.
 *
 * @example
 * ```ts
 * await sForEach(errorStream, err => auditLog(err));
 * ```
 */
export async function sForEach<T>(
  stream: AsyncIterable<T>,
  fn: (item: T) => void | Promise<void>,
): Promise<void> {
  for await (const item of stream) {
    await fn(item);
  }
}

/**
 * Write each item to a file (one per line for strings, JSON for objects).
 *
 * @example
 * ```ts
 * await sToFile(errorStream, "/tmp/errors.log");
 * ```
 */
export async function sToFile(
  stream: AsyncIterable<unknown>,
  path: string,
): Promise<{ lines: number; path: string }> {
  const { appendFileSync, writeFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const absPath = resolve(path);
  writeFileSync(absPath, ""); // truncate
  let lines = 0;
  for await (const item of stream) {
    const line = typeof item === "string" ? item : JSON.stringify(item);
    appendFileSync(absPath, line + "\n");
    lines++;
  }
  return { lines, path: absPath };
}

// ---------------------------------------------------------------------------
// Helpers to bridge arrays and streams
// ---------------------------------------------------------------------------

/**
 * Convert an array to an async iterable (for feeding into streamPipe).
 *
 * @example
 * ```ts
 * streamPipe(fromArray([1, 2, 3]), sFilter(n => n > 1))
 * ```
 */
export async function* fromArray<T>(arr: readonly T[]): AsyncIterable<T> {
  for (const item of arr) {
    yield item;
  }
}

/**
 * Create an async iterable from a ReadableStream.
 *
 * @example
 * ```ts
 * streamPipe(fromReadable(response.body), sMap(chunk => decode(chunk)))
 * ```
 */
export async function* fromReadable<T>(
  stream: ReadableStream<T>,
): AsyncIterable<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create an async iterable that yields lines from a string.
 *
 * @example
 * ```ts
 * streamPipe(fromLines(text), sFilter(l => l.includes("ERROR")))
 * ```
 */
export async function* fromLines(text: string): AsyncIterable<string> {
  const lines = text.split("\n");
  for (const line of lines) {
    yield line;
  }
}
