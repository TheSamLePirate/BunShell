/**
 * TUI visualization sinks — render typed data as tables and charts.
 *
 * Works as pipe() stages: pipe(ps(ctx), toTable()) renders a process table.
 * Zero dependencies — pure ANSI escape codes and Unicode box/block characters.
 *
 * @module
 */

import type { PipeStage } from "./types";

// ---------------------------------------------------------------------------
// ANSI + Unicode constants
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
};

const BOX = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeDown: "┬",
  teeUp: "┴",
  teeRight: "├",
  teeLeft: "┤",
  cross: "┼",
};

// Block characters: index 0 = empty, 8 = full block
const BLOCKS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

// Colors for bar chart series
const BAR_COLORS = [
  "\x1b[38;5;39m", // blue
  "\x1b[38;5;208m", // orange
  "\x1b[38;5;82m", // green
  "\x1b[38;5;196m", // red
  "\x1b[38;5;141m", // purple
  "\x1b[38;5;220m", // yellow
  "\x1b[38;5;45m", // cyan
  "\x1b[38;5;213m", // pink
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function termWidth(): number {
  return process.stdout.columns ?? 80;
}

/** Strip ANSI escape codes to get the visible string length. */
function visLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** Pad a string to a width, accounting for ANSI codes. */
function padRight(s: string, width: number): string {
  const diff = width - visLen(s);
  return diff > 0 ? s + " ".repeat(diff) : s;
}

/** Right-align a string to a width. */
function padLeft(s: string, width: number): string {
  const diff = width - visLen(s);
  return diff > 0 ? " ".repeat(diff) + s : s;
}

/** Format a value for display in a table cell. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return `${C.dim}—${C.reset}`;
  if (value instanceof Date)
    return value.toISOString().slice(0, 19).replace("T", " ");
  if (typeof value === "boolean")
    return value ? `${C.green}true${C.reset}` : `${C.dim}false${C.reset}`;
  if (typeof value === "number")
    return `${C.yellow}${formatNumber(value)}${C.reset}`;
  if (typeof value === "object") return `${C.dim}{…}${C.reset}`;
  return String(value);
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toFixed(2);
}

function isNumeric(value: unknown): boolean {
  return typeof value === "number" && !isNaN(value);
}

/** Render a bar using block characters for smooth sub-character width. */
function renderBar(
  value: number,
  maxValue: number,
  width: number,
  color: string,
): string {
  if (maxValue === 0) return "";
  const ratio = Math.min(value / maxValue, 1);
  const filledWidth = ratio * width;
  const fullBlocks = Math.floor(filledWidth);
  const fractional = Math.round((filledWidth - fullBlocks) * 8);
  const fractionalChar = BLOCKS[fractional] ?? "";

  return color + "█".repeat(fullBlocks) + fractionalChar + C.reset;
}

// ---------------------------------------------------------------------------
// toTable — render any typed array as a bordered table
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Options for toTable(). */
export interface TableOptions {
  /** Columns to display (default: auto-detect from first row). */
  readonly columns?: readonly string[];
  /** Maximum column width (default: 40). */
  readonly maxColWidth?: number;
  /** Maximum rows to show (default: 50). */
  readonly maxRows?: number;
  /** Column header aliases (e.g., { modifiedAt: "Modified" }). */
  readonly headers?: Record<string, string>;
  /** Right-align numeric columns (default: true). */
  readonly alignNumbers?: boolean;
}

/**
 * Render a typed array as a bordered Unicode table.
 * Auto-detects column types and aligns numbers right.
 *
 * @example
 * ```ts
 * await pipe(ls(ctx, "."), toTable());
 * await pipe(ps(ctx), toTable({ columns: ["pid", "name", "cpu", "memory"] }));
 * await pipe(gitLog(ctx), toTable({ maxRows: 10 }));
 * ```
 */
export function toTable<T extends Record<string, any>>(
  options?: TableOptions,
): PipeStage<T[], string> {
  return (rows) => {
    if (rows.length === 0) return `${C.dim}(empty table)${C.reset}`;

    const maxColWidth = options?.maxColWidth ?? 40;
    const maxRows = options?.maxRows ?? 50;
    const alignNumbers = options?.alignNumbers !== false;

    // Determine columns
    const cols = options?.columns
      ? options.columns.map(String)
      : Object.keys(rows[0]!).filter((k) => {
          const v = rows[0]![k];
          return typeof v !== "object" || v instanceof Date || v === null;
        });

    // Build header labels
    const headers = cols.map((col) => options?.headers?.[col] ?? col);

    // Format all cells
    const formattedRows: string[][] = [];
    const displayRows = rows.slice(0, maxRows);
    for (const row of displayRows) {
      formattedRows.push(
        cols.map((col) => {
          const val = row[col];
          const formatted = formatCell(val);
          const vis = visLen(formatted);
          return vis > maxColWidth
            ? formatted.slice(0, maxColWidth - 1) + "…"
            : formatted;
        }),
      );
    }

    // Calculate column widths
    const colWidths = cols.map((_, i) => {
      const headerWidth = visLen(headers[i]!);
      const maxCell = formattedRows.reduce(
        (max, row) => Math.max(max, visLen(row[i]!)),
        0,
      );
      return Math.min(Math.max(headerWidth, maxCell) + 2, maxColWidth + 2);
    });

    // Detect numeric columns
    const numericCols = cols.map(
      (col) => alignNumbers && displayRows.some((r) => isNumeric(r[col])),
    );

    // Clamp to terminal width
    const tw = termWidth();
    const totalWidth = colWidths.reduce((s, w) => s + w, 0) + cols.length + 1;
    if (totalWidth > tw) {
      const scale = (tw - cols.length - 1) / (totalWidth - cols.length - 1);
      for (let i = 0; i < colWidths.length; i++) {
        colWidths[i] = Math.max(3, Math.floor(colWidths[i]! * scale));
      }
    }

    // Render
    const lines: string[] = [];

    // Top border
    lines.push(
      C.dim +
        BOX.topLeft +
        colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.teeDown) +
        BOX.topRight +
        C.reset,
    );

    // Header row
    const headerCells = headers.map(
      (h, i) =>
        ` ${C.bold}${C.cyan}${padRight(h, colWidths[i]! - 2)}${C.reset} `,
    );
    lines.push(
      C.dim +
        BOX.vertical +
        C.reset +
        headerCells.join(C.dim + BOX.vertical + C.reset) +
        C.dim +
        BOX.vertical +
        C.reset,
    );

    // Header separator
    lines.push(
      C.dim +
        BOX.teeRight +
        colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.cross) +
        BOX.teeLeft +
        C.reset,
    );

    // Data rows
    for (const row of formattedRows) {
      const cells = row.map((cell, i) => {
        const w = colWidths[i]! - 2;
        return numericCols[i]
          ? ` ${padLeft(cell, w)} `
          : ` ${padRight(cell, w)} `;
      });
      lines.push(
        C.dim +
          BOX.vertical +
          C.reset +
          cells.join(C.dim + BOX.vertical + C.reset) +
          C.dim +
          BOX.vertical +
          C.reset,
      );
    }

    // Bottom border
    lines.push(
      C.dim +
        BOX.bottomLeft +
        colWidths.map((w) => BOX.horizontal.repeat(w)).join(BOX.teeUp) +
        BOX.bottomRight +
        C.reset,
    );

    // Row count
    if (rows.length > maxRows) {
      lines.push(`${C.dim} ... ${rows.length - maxRows} more rows${C.reset}`);
    }
    lines.push(
      `${C.dim} ${rows.length} row${rows.length === 1 ? "" : "s"}${C.reset}`,
    );

    const output = lines.join("\n");
    console.log(output);
    return output;
  };
}

// ---------------------------------------------------------------------------
// toBarChart — horizontal bar chart from typed data
// ---------------------------------------------------------------------------

/** Options for toBarChart(). */
export interface BarChartOptions {
  /** Maximum bar width in characters (default: auto from terminal). */
  readonly width?: number;
  /** Maximum bars to show (default: 20). */
  readonly maxBars?: number;
  /** Sort bars by value descending (default: true). */
  readonly sort?: boolean;
  /** Show values next to bars (default: true). */
  readonly showValues?: boolean;
  /** Color index override (0-7). */
  readonly colorIndex?: number;
  /** Title above the chart. */
  readonly title?: string;
}

/**
 * Render a horizontal bar chart from typed data.
 * Takes a value field (numeric) and a label field (string).
 *
 * @example
 * ```ts
 * // Top 5 processes by CPU
 * await pipe(ps(ctx), sortBy("cpu", "desc"), take(10),
 *   toBarChart("cpu", "name"));
 *
 * // Git commits by author
 * await pipe(gitLog(ctx, { limit: 100 }),
 *   groupBy("author"),
 *   toBarChart());  // auto: key = label, array.length = value
 *
 * // File sizes
 * await pipe(ls(ctx, "src"), toBarChart("size", "name"));
 * ```
 */
export function toBarChart<T>(
  valueField?: keyof T & string,
  labelField?: keyof T & string,
  options?: BarChartOptions,
): PipeStage<T[] | Record<string, T[]>, string> {
  return (input) => {
    const maxBars = options?.maxBars ?? 20;
    const showValues = options?.showValues !== false;
    const shouldSort = options?.sort !== false;
    const title = options?.title;
    const colorIdx = options?.colorIndex ?? 0;
    const color = BAR_COLORS[colorIdx % BAR_COLORS.length]!;

    // Normalize input to { label, value } pairs
    let bars: Array<{ label: string; value: number }>;

    if (Array.isArray(input)) {
      if (input.length === 0) return `${C.dim}(no data for chart)${C.reset}`;

      if (valueField && labelField) {
        // Direct field extraction
        bars = input.map((item: any) => ({
          label: String(item[labelField]),
          value: Number(item[valueField]),
        }));
      } else if (valueField) {
        // Value field only — use index as label
        bars = input.map((item: any, i: number) => ({
          label: String(i),
          value: Number(item[valueField]),
        }));
      } else {
        // Auto-detect: try to find a string field and a numeric field
        const first = input[0] as Record<string, any>;
        const keys = Object.keys(first);
        const numKey = keys.find((k) => typeof first[k] === "number");
        const strKey = keys.find((k) => typeof first[k] === "string");
        if (numKey && strKey) {
          bars = input.map((item: any) => ({
            label: String(item[strKey]),
            value: Number(item[numKey]),
          }));
        } else {
          bars = input.map((item: any, i: number) => ({
            label: String(item[keys[0]!] ?? i),
            value: Number(item[keys[1]!] ?? 0),
          }));
        }
      }
    } else {
      // Record<string, T[]> from groupBy — label = key, value = array length
      bars = Object.entries(input).map(([key, arr]) => ({
        label: key,
        value: (arr as any[]).length,
      }));
    }

    // Sort and limit
    if (shouldSort) bars.sort((a, b) => b.value - a.value);
    if (bars.length > maxBars) bars = bars.slice(0, maxBars);

    if (bars.length === 0) return `${C.dim}(no data for chart)${C.reset}`;

    // Calculate dimensions
    const maxValue = Math.max(...bars.map((b) => b.value));
    const maxLabelWidth = Math.min(
      Math.max(...bars.map((b) => b.label.length)),
      25,
    );
    const valueWidth = showValues ? formatNumber(maxValue).length + 1 : 0;
    const barWidth =
      (options?.width ?? termWidth()) - maxLabelWidth - valueWidth - 4;
    const effectiveBarWidth = Math.max(barWidth, 10);

    // Render
    const lines: string[] = [];

    if (title) {
      lines.push(`${C.bold}${title}${C.reset}`);
      lines.push("");
    }

    for (const bar of bars) {
      const label =
        bar.label.length > maxLabelWidth
          ? bar.label.slice(0, maxLabelWidth - 1) + "…"
          : bar.label;

      const renderedBar = renderBar(
        bar.value,
        maxValue,
        effectiveBarWidth,
        color,
      );
      const valueStr = showValues
        ? ` ${C.dim}${formatNumber(bar.value)}${C.reset}`
        : "";

      lines.push(
        `${C.cyan}${padLeft(label, maxLabelWidth)}${C.reset} ${BOX.vertical} ${renderedBar}${valueStr}`,
      );
    }

    // Scale indicator
    lines.push(
      `${" ".repeat(maxLabelWidth)} ${BOX.vertical} ${C.dim}0${padLeft(formatNumber(maxValue), effectiveBarWidth - 1)}${C.reset}`,
    );

    const output = lines.join("\n");
    console.log(output);
    return output;
  };
}

// ---------------------------------------------------------------------------
// toSparkline — inline sparkline from numeric array
// ---------------------------------------------------------------------------

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/**
 * Render a sparkline from numeric data (inline mini chart).
 *
 * @example
 * ```ts
 * pipe([1, 4, 2, 8, 5, 3, 7], toSparkline());
 * // "▁▄▂█▅▃▇"
 * ```
 */
export function toSparkline<T = number>(
  valueField?: keyof T & string,
): PipeStage<T[], string> {
  return (input) => {
    const values: number[] = valueField
      ? input.map((item: any) => Number(item[valueField]))
      : (input as unknown as number[]);

    if (values.length === 0) return "";

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const spark = values
      .map((v) => {
        const idx = Math.round(((v - min) / range) * 7);
        return SPARK_CHARS[idx]!;
      })
      .join("");

    const output = `${spark} ${C.dim}min=${formatNumber(min)} max=${formatNumber(max)}${C.reset}`;
    console.log(output);
    return output;
  };
}

// ---------------------------------------------------------------------------
// toHistogram — frequency distribution
// ---------------------------------------------------------------------------

/** Options for toHistogram(). */
export interface HistogramOptions {
  /** Number of buckets (default: 10). */
  readonly buckets?: number;
  /** Width of bars (default: auto). */
  readonly width?: number;
}

/**
 * Render a histogram (frequency distribution) from numeric data.
 *
 * @example
 * ```ts
 * await pipe(ls(ctx, ".", { recursive: true }),
 *   pluck("size"),
 *   toHistogram({ buckets: 8 }));
 * ```
 */
export function toHistogram<T = number>(
  valueField?: keyof T & string,
  options?: HistogramOptions,
): PipeStage<T[], string> {
  return (input) => {
    const values: number[] = valueField
      ? input.map((item: any) => Number(item[valueField]))
      : (input as unknown as number[]);

    if (values.length === 0) return `${C.dim}(no data)${C.reset}`;

    const numBuckets = options?.buckets ?? 10;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const bucketSize = range / numBuckets;

    // Count items in each bucket
    const counts: number[] = new Array(numBuckets).fill(0) as number[];
    for (const v of values) {
      const idx = Math.min(Math.floor((v - min) / bucketSize), numBuckets - 1);
      counts[idx]!++;
    }

    const maxCount = Math.max(...counts);
    const labelWidth = formatNumber(max).length + 3;
    const barWidth = (options?.width ?? termWidth()) - labelWidth - 10;
    const color = BAR_COLORS[2]!; // green

    const lines: string[] = [];
    for (let i = 0; i < numBuckets; i++) {
      const lo = min + i * bucketSize;
      const label = formatNumber(lo);
      const bar = renderBar(
        counts[i]!,
        maxCount,
        Math.max(barWidth, 10),
        color,
      );
      const countStr = `${C.dim}(${counts[i]})${C.reset}`;
      lines.push(
        `${padLeft(label, labelWidth)} ${BOX.vertical} ${bar} ${countStr}`,
      );
    }

    lines.push(
      `${C.dim}${" ".repeat(labelWidth)} ${BOX.vertical} ${values.length} values, ${numBuckets} buckets${C.reset}`,
    );

    const output = lines.join("\n");
    console.log(output);
    return output;
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
