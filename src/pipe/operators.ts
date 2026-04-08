/**
 * Pipe operators — generic array transformations for use in pipe chains.
 *
 * @module
 */

import type { PipeStage } from "./types";

/**
 * Filter array elements by predicate.
 *
 * @example
 * ```ts
 * pipe([1,2,3,4], filter<number>(n => n > 2)); // [3, 4]
 * ```
 */
export function filter<T>(
  predicate: (item: T) => boolean,
): PipeStage<T[], T[]> {
  return (input) => input.filter(predicate);
}

/**
 * Map each element to a new value.
 *
 * @example
 * ```ts
 * pipe([1,2,3], map<number, string>(n => String(n))); // ["1","2","3"]
 * ```
 */
export function map<T, U>(
  fn: (item: T) => U | Promise<U>,
): PipeStage<T[], Promise<U[]>> {
  return (input) => Promise.all(input.map(fn));
}

/**
 * Reduce array to a single value.
 *
 * @example
 * ```ts
 * pipe([1,2,3], reduce<number, number>((acc, n) => acc + n, 0)); // 6
 * ```
 */
export function reduce<T, U>(
  fn: (acc: U, item: T) => U,
  initial: U,
): PipeStage<T[], U> {
  return (input) => input.reduce(fn, initial);
}

/**
 * Take the first N elements.
 *
 * @example
 * ```ts
 * pipe([1,2,3,4,5], take<number>(3)); // [1,2,3]
 * ```
 */
export function take<T>(n: number): PipeStage<T[], T[]> {
  return (input) => input.slice(0, n);
}

/**
 * Skip the first N elements.
 *
 * @example
 * ```ts
 * pipe([1,2,3,4,5], skip<number>(2)); // [3,4,5]
 * ```
 */
export function skip<T>(n: number): PipeStage<T[], T[]> {
  return (input) => input.slice(n);
}

/**
 * Sort by a key, ascending or descending.
 *
 * @example
 * ```ts
 * pipe(files, sortBy<FileEntry>("size", "desc"));
 * ```
 */
export function sortBy<T>(
  key: keyof T,
  order: "asc" | "desc" = "asc",
): PipeStage<T[], T[]> {
  return (input) => {
    const dir = order === "desc" ? -1 : 1;
    return [...input].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av instanceof Date && bv instanceof Date) {
        return (av.getTime() - bv.getTime()) * dir;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  };
}

/**
 * Group elements by a key.
 *
 * @example
 * ```ts
 * pipe(files, groupBy<FileEntry>("extension"));
 * ```
 */
export function groupBy<T>(key: keyof T): PipeStage<T[], Record<string, T[]>> {
  return (input) => {
    const groups: Record<string, T[]> = {};
    for (const item of input) {
      const k = String(item[key]);
      if (!groups[k]) groups[k] = [];
      groups[k].push(item);
    }
    return groups;
  };
}

/**
 * Remove duplicate elements (by optional key).
 *
 * @example
 * ```ts
 * pipe([1,2,2,3], unique<number>()); // [1,2,3]
 * ```
 */
export function unique<T>(key?: keyof T): PipeStage<T[], T[]> {
  return (input) => {
    if (!key) {
      return [...new Set(input)];
    }
    const seen = new Set<unknown>();
    return input.filter((item) => {
      const v = item[key];
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
  };
}

/**
 * Map each element to an array and flatten.
 *
 * @example
 * ```ts
 * pipe(["a b", "c d"], flatMap<string, string>(s => s.split(" ")));
 * // ["a", "b", "c", "d"]
 * ```
 */
export function flatMap<T, U>(fn: (item: T) => U[]): PipeStage<T[], U[]> {
  return (input) => input.flatMap(fn);
}

/**
 * Side-effect stage — runs a function without modifying data.
 *
 * @example
 * ```ts
 * pipe(data, tap<Item[]>(items => console.log(`Processing ${items.length}`)));
 * ```
 */
export function tap<T>(fn: (data: T) => void): PipeStage<T, T> {
  return (input) => {
    fn(input);
    return input;
  };
}

/**
 * Count elements in an array.
 *
 * @example
 * ```ts
 * pipe([1,2,3], count<number>()); // 3
 * ```
 */
export function count<T>(): PipeStage<T[], number> {
  return (input) => input.length;
}

/**
 * Get the first element.
 *
 * @example
 * ```ts
 * pipe([1,2,3], first<number>()); // 1
 * ```
 */
export function first<T>(): PipeStage<T[], T | undefined> {
  return (input) => input[0];
}

/**
 * Get the last element.
 *
 * @example
 * ```ts
 * pipe([1,2,3], last<number>()); // 3
 * ```
 */
export function last<T>(): PipeStage<T[], T | undefined> {
  return (input) => input[input.length - 1];
}

/**
 * Extract a single property from each element.
 *
 * @example
 * ```ts
 * pipe(files, pluck<FileEntry, "name">("name")); // string[]
 * ```
 */
export function pluck<T, K extends keyof T>(key: K): PipeStage<T[], T[K][]> {
  return (input) => input.map((item) => item[key]);
}
