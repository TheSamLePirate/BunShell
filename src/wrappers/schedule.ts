/**
 * Scheduling wrappers — time utilities and recurring tasks.
 *
 * Pure runtime — no capability required.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A cancellable interval handle. */
export interface IntervalHandle {
  stop(): void;
}

/** A cancellable timeout handle. */
export interface TimeoutHandle {
  cancel(): void;
}

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

/**
 * Sleep for a given number of milliseconds.
 *
 * @example
 * ```ts
 * await sleep(1000); // wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// interval
// ---------------------------------------------------------------------------

/**
 * Run a function on a recurring interval. Returns a handle to stop it.
 *
 * @example
 * ```ts
 * const handle = interval(5000, () => console.log("tick"));
 * // ... later
 * handle.stop();
 * ```
 */
export function interval(
  ms: number,
  fn: () => void | Promise<void>,
): IntervalHandle {
  const id = setInterval(() => {
    fn();
  }, ms);

  return {
    stop() {
      clearInterval(id);
    },
  };
}

// ---------------------------------------------------------------------------
// timeout
// ---------------------------------------------------------------------------

/**
 * Run a function after a delay. Returns a handle to cancel it.
 *
 * @example
 * ```ts
 * const handle = timeout(3000, () => console.log("done"));
 * handle.cancel(); // cancel before it fires
 * ```
 */
export function timeout(
  ms: number,
  fn: () => void | Promise<void>,
): TimeoutHandle {
  const id = setTimeout(() => {
    fn();
  }, ms);

  return {
    cancel() {
      clearTimeout(id);
    },
  };
}

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------

/**
 * Debounce a function — only executes after the given delay
 * since the last invocation.
 *
 * @example
 * ```ts
 * const save = debounce(500, () => writeFile(...));
 * save(); save(); save(); // only runs once, 500ms after the last call
 * ```
 */
export function debounce<T extends (...args: never[]) => void>(
  ms: number,
  fn: T,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, ms);
  };
}

// ---------------------------------------------------------------------------
// throttle
// ---------------------------------------------------------------------------

/**
 * Throttle a function — executes at most once per interval.
 *
 * @example
 * ```ts
 * const log = throttle(1000, (msg) => console.log(msg));
 * log("a"); log("b"); log("c"); // only "a" fires, rest throttled
 * ```
 */
export function throttle<T extends (...args: never[]) => void>(
  ms: number,
  fn: T,
): (...args: Parameters<T>) => void {
  let lastRun = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastRun >= ms) {
      lastRun = now;
      fn(...args);
    }
  };
}

// ---------------------------------------------------------------------------
// retry
// ---------------------------------------------------------------------------

/**
 * Retry an async function with exponential backoff.
 *
 * @example
 * ```ts
 * const data = await retry(3, 1000, () => fetchData());
 * ```
 */
export async function retry<T>(
  maxAttempts: number,
  baseDelayMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}
