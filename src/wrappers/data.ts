/**
 * Data parsing wrappers — structured data transforms.
 *
 * Pure computation — no capability required.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for CSV parsing. */
export interface CsvOptions {
  readonly delimiter?: string;
  readonly header?: boolean;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string with type inference.
 *
 * @example
 * ```ts
 * const data = parseJSON<{ name: string }>(text);
 * ```
 */
export function parseJSON<T = unknown>(text: string): T {
  return JSON.parse(text) as T;
}

/**
 * Format data as pretty-printed JSON.
 *
 * @example
 * ```ts
 * const json = formatJSON({ key: "value" });
 * ```
 */
export function formatJSON(data: unknown, indent: number = 2): string {
  return JSON.stringify(data, null, indent);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into an array of records.
 * First row is treated as headers by default.
 *
 * @example
 * ```ts
 * const rows = parseCSV("name,age\nAlice,30\nBob,25");
 * // [{ name: "Alice", age: "30" }, { name: "Bob", age: "25" }]
 * ```
 */
export function parseCSV(
  text: string,
  options?: CsvOptions,
): Record<string, string>[] {
  const delimiter = options?.delimiter ?? ",";
  const useHeader = options?.header !== false;

  const lines = text.trim().split("\n");
  if (lines.length === 0) return [];

  if (useHeader) {
    const headers = parseCsvLine(lines[0]!, delimiter);
    return lines.slice(1).map((line) => {
      const values = parseCsvLine(line, delimiter);
      const record: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        record[headers[i]!] = values[i] ?? "";
      }
      return record;
    });
  }

  return lines.map((line) => {
    const values = parseCsvLine(line, delimiter);
    const record: Record<string, string> = {};
    for (let i = 0; i < values.length; i++) {
      record[String(i)] = values[i] ?? "";
    }
    return record;
  });
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Format an array of records as CSV text.
 *
 * @example
 * ```ts
 * const csv = formatCSV([{ name: "Alice", age: "30" }]);
 * // "name,age\nAlice,30"
 * ```
 */
export function formatCSV(
  rows: readonly Record<string, string>[],
  options?: CsvOptions,
): string {
  if (rows.length === 0) return "";
  const delimiter = options?.delimiter ?? ",";
  const headers = Object.keys(rows[0]!);
  const lines: string[] = [];

  if (options?.header !== false) {
    lines.push(
      headers.map((h) => escapeCsvField(h, delimiter)).join(delimiter),
    );
  }

  for (const row of rows) {
    lines.push(
      headers
        .map((h) => escapeCsvField(row[h] ?? "", delimiter))
        .join(delimiter),
    );
  }

  return lines.join("\n");
}

function escapeCsvField(field: string, delimiter: string): string {
  if (
    field.includes(delimiter) ||
    field.includes('"') ||
    field.includes("\n")
  ) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

// ---------------------------------------------------------------------------
// TOML (Bun-native)
// ---------------------------------------------------------------------------

/**
 * Parse TOML text. Uses Bun's built-in TOML support.
 *
 * @example
 * ```ts
 * const config = parseTOML<Config>('[server]\nport = 8080');
 * ```
 */
export function parseTOML<T = Record<string, unknown>>(text: string): T {
  // Bun doesn't have a built-in TOML parser exposed directly,
  // but we can use a simple approach via bunfig-style parsing.
  // For now, implement a basic TOML parser for common cases.
  return basicTomlParse(text) as T;
}

function basicTomlParse(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection = result;
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    // Section header [section]
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const key = sectionMatch[1]!;
      const section: Record<string, unknown> = {};
      result[key] = section;
      currentSection = section;
      continue;
    }

    // Key = value
    const kvMatch = line.match(/^(\w[\w.-]*)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1]!;
      const rawVal = kvMatch[2]!.trim();
      currentSection[key] = parseTomlValue(rawVal);
    }
  }

  return result;
}

function parseTomlValue(raw: string): unknown {
  // String
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Integer
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  // Float
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  // Array
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((v) => parseTomlValue(v.trim()));
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

/**
 * Encode data to base64.
 *
 * @example
 * ```ts
 * base64Encode("hello world") // "aGVsbG8gd29ybGQ="
 * ```
 */
export function base64Encode(data: string | Uint8Array): string {
  if (typeof data === "string") {
    return btoa(data);
  }
  return Buffer.from(data).toString("base64");
}

/**
 * Decode base64 to bytes.
 *
 * @example
 * ```ts
 * base64Decode("aGVsbG8gd29ybGQ=") // Uint8Array
 * ```
 */
export function base64Decode(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64"));
}

/**
 * Decode base64 to string.
 *
 * @example
 * ```ts
 * base64DecodeString("aGVsbG8gd29ybGQ=") // "hello world"
 * ```
 */
export function base64DecodeString(text: string): string {
  return atob(text);
}
