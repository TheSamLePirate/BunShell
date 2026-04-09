/**
 * tsc type checker integration — compile-check before execution.
 *
 * Generates a temp .ts file with the user's code + proper imports,
 * runs tsc --noEmit --incremental, and parses errors. Capability
 * violations become type errors because CapabilityContext<K> encodes
 * which kinds are held.
 *
 * Performance:
 * - Fixed temp file paths enable tsc --incremental (~200-400ms after first check)
 * - Preamble and tsconfig are cached (regenerated only when contextKinds changes)
 * - 5s timeout prevents shell freeze if tsc hangs
 *
 * @module
 */

import { resolve, join } from "node:path";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import type { CapabilityKind } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single type error from tsc. */
export interface TypeCheckError {
  readonly line: number;
  readonly col: number;
  readonly code: string;
  readonly message: string;
}

/** Result of a type check. */
export interface TypeCheckResult {
  readonly pass: boolean;
  readonly errors: readonly TypeCheckError[];
  readonly duration: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
const TMP_DIR = join(PROJECT_ROOT, ".typecheck-tmp");
const TMP_FILE = join(TMP_DIR, "check.ts");
const TMP_TSCONFIG = join(TMP_DIR, "tsconfig.json");
const TMP_BUILDINFO = join(TMP_DIR, ".tsbuildinfo");
const TSC_TIMEOUT_MS = 5000;

// Ensure tmp dir exists
try {
  mkdirSync(TMP_DIR, { recursive: true });
} catch {
  // already exists
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

let cachedPreamble: string | null = null;
let cachedPreambleKey: string | null = null;
let cachedPreambleLines = 0;
let tsconfigWrittenForKey: string | null = null;

function kindsKey(contextKinds: readonly CapabilityKind[]): string {
  return contextKinds.slice().sort().join(",");
}

function getPreamble(contextKinds: readonly CapabilityKind[]): string {
  const key = kindsKey(contextKinds);
  if (cachedPreambleKey === key && cachedPreamble !== null) {
    return cachedPreamble;
  }
  cachedPreamble = generatePreamble(contextKinds);
  cachedPreambleKey = key;
  cachedPreambleLines = cachedPreamble.split("\n").length;
  return cachedPreamble;
}

function ensureTsconfig(contextKinds: readonly CapabilityKind[]): void {
  const key = kindsKey(contextKinds);
  if (tsconfigWrittenForKey === key && existsSync(TMP_TSCONFIG)) return;

  writeFileSync(
    TMP_TSCONFIG,
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        types: ["bun-types"],
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        esModuleInterop: true,
        skipLibCheck: true,
        rootDir: PROJECT_ROOT,
        incremental: true,
        tsBuildInfoFile: TMP_BUILDINFO,
      },
      include: [TMP_FILE],
      exclude: [],
    }),
  );
  tsconfigWrittenForKey = key;
}

// ---------------------------------------------------------------------------
// Preamble generation
// ---------------------------------------------------------------------------

function generatePreamble(contextKinds: readonly CapabilityKind[]): string {
  const kindsUnion = contextKinds.map((k) => `"${k}"`).join(" | ");
  const srcPath = join(PROJECT_ROOT, "src/index");

  return `
// Auto-generated preamble for type checking
import type { CapabilityContext } from "${srcPath}";
import {
  createContext, capabilities, CapabilityError, ok, err,
  ls, cat, stat, exists, mkdir, write, readJson, writeJson,
  rm, cp, mv, find, du, chmod, createSymlink, readLink,
  touch, append, truncate, realPath, watchPath, globFiles,
  ps, kill, spawn, exec,
  netFetch, ping, download, dig, serve, wsConnect,
  env, getEnv, setEnv,
  grep, sort, uniq, head, tail, wc,
  uname, uptime, whoami, hostname, df,
  hash, hmac, randomBytes, randomUUID, randomInt, encrypt, decrypt,
  tar, untar, zip, unzip, gzip, gunzip,
  lineStream, tailStream, pipeSpawn, streamSpawn,
  parseJSON, formatJSON, parseCSV, formatCSV, parseTOML,
  base64Encode, base64Decode, base64DecodeString,
  dbOpen, dbQuery, dbExec,
  gitStatus, gitLog, gitDiff, gitBranch, gitAdd, gitCommit,
  gitPush, gitPull, gitClone, gitStash,
  openUrl, openFile, notify, clipboard,
  sleep, interval, timeout, debounce, throttle, retry,
  currentUser, users, groups,
  pipe, filter, map, reduce, take, skip, sortBy, groupBy,
  unique, flatMap, tap, count, first, last, pluck,
  from, fromFile, fromJSON, fromCommand,
  toFile, toJSON, toStdout, collect,
  toTable, toBarChart, toSparkline, toHistogram,
  streamPipe, sFilter, sMap, sFlatMap, sTake, sSkip, sTap,
  sUnique, sPluck, sChunk, sScan, sThrottle, sTakeWhile, sSkipWhile,
  sToArray, sReduce, sCount, sFirst, sForEach, sToFile,
  fromArray, fromReadable, fromLines,
  runAgent,
  createSecretStore, deriveKey, createStateStore,
  authBearer, authBasic, authedFetch, oauth2DeviceFlow, cookieJar, secretFromEnv,
} from "${srcPath}";

void [createContext, capabilities, CapabilityError, ok, err,
  ls, cat, stat, exists, mkdir, write, readJson, writeJson,
  rm, cp, mv, find, du, chmod, createSymlink, readLink,
  touch, append, truncate, realPath, watchPath, globFiles,
  ps, kill, spawn, exec,
  netFetch, ping, download, dig, serve, wsConnect,
  env, getEnv, setEnv,
  grep, sort, uniq, head, tail, wc,
  uname, uptime, whoami, hostname, df,
  hash, hmac, randomBytes, randomUUID, randomInt, encrypt, decrypt,
  tar, untar, zip, unzip, gzip, gunzip,
  lineStream, tailStream, pipeSpawn, streamSpawn,
  parseJSON, formatJSON, parseCSV, formatCSV, parseTOML,
  base64Encode, base64Decode, base64DecodeString,
  dbOpen, dbQuery, dbExec,
  gitStatus, gitLog, gitDiff, gitBranch, gitAdd, gitCommit,
  gitPush, gitPull, gitClone, gitStash,
  openUrl, openFile, notify, clipboard,
  sleep, interval, timeout, debounce, throttle, retry,
  currentUser, users, groups,
  pipe, filter, map, reduce, take, skip, sortBy, groupBy,
  unique, flatMap, tap, count, first, last, pluck,
  from, fromFile, fromJSON, fromCommand,
  toFile, toJSON, toStdout, collect,
  toTable, toBarChart, toSparkline, toHistogram,
  streamPipe, sFilter, sMap, sFlatMap, sTake, sSkip, sTap,
  sUnique, sPluck, sChunk, sScan, sThrottle, sTakeWhile, sSkipWhile,
  sToArray, sReduce, sCount, sFirst, sForEach, sToFile,
  fromArray, fromReadable, fromLines,
  runAgent,
  createSecretStore, deriveKey, createStateStore,
  authBearer, authBasic, authedFetch, oauth2DeviceFlow, cookieJar, secretFromEnv];

declare const ctx: CapabilityContext<${kindsUnion}>;
declare const audit: import("${srcPath}").FullAuditLogger;

// --- User code below ---
`;
}

// ---------------------------------------------------------------------------
// Type checker
// ---------------------------------------------------------------------------

/**
 * Type-check user code against the current context's capabilities.
 *
 * - Uses tsc --incremental for fast repeat checks (~200-400ms after cold start)
 * - 5s timeout prevents shell freeze
 * - Never throws — returns permissive result on any failure
 *
 * @example
 * ```ts
 * const result = await typeCheck('await ls(ctx, ".")', ["fs:read"]);
 * if (!result.pass) {
 *   for (const err of result.errors) console.log(err.message);
 * }
 * ```
 */
export async function typeCheck(
  code: string,
  contextKinds: readonly CapabilityKind[],
): Promise<TypeCheckResult> {
  const start = performance.now();

  try {
    const preamble = getPreamble(contextKinds);
    const fullCode = `${preamble}\n(async () => {\n${code}\n})();\n`;

    // Write code file (overwrite each time — tsc incremental handles diff)
    writeFileSync(TMP_FILE, fullCode);

    // Write tsconfig only if contextKinds changed
    ensureTsconfig(contextKinds);

    // Run tsc with incremental compilation
    const proc = Bun.spawn(
      [
        "bunx",
        "tsc",
        "--noEmit",
        "--pretty",
        "false",
        "--project",
        TMP_TSCONFIG,
      ],
      { stdout: "pipe", stderr: "pipe", cwd: PROJECT_ROOT },
    );

    // Race tsc against timeout
    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();

    const TIMEOUT_RESULT = Symbol("timeout");
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<typeof TIMEOUT_RESULT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT_RESULT), TSC_TIMEOUT_MS);
    });

    const exitResult = await Promise.race([proc.exited, timeoutPromise]);
    clearTimeout(timer!);

    if (exitResult === TIMEOUT_RESULT) {
      // tsc hung — kill it, be permissive
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      return { pass: true, errors: [], duration: performance.now() - start };
    }

    const stdout = await stdoutPromise;
    const stderr = await stderrPromise;
    const output = stdout + stderr;
    const duration = performance.now() - start;

    if (!output.trim()) {
      return { pass: true, errors: [], duration };
    }

    // Parse tsc errors — only from our temp file
    const errors: TypeCheckError[] = [];
    const errorLines = output.trim().split("\n");

    for (const line of errorLines) {
      if (!line.includes("check.ts")) continue;

      const match = line.match(/\((\d+),(\d+)\):\s*(error\s+TS\d+):\s*(.+)/);
      if (match) {
        const tscLine = parseInt(match[1]!, 10);
        const col = parseInt(match[2]!, 10);
        const errCode = match[3]!;
        const message = match[4]!;

        const userLine = tscLine - cachedPreambleLines - 1;
        if (userLine > 0) {
          errors.push({ line: userLine, col, code: errCode, message });
        }
      }
    }

    return { pass: errors.length === 0, errors, duration };
  } catch {
    // Any failure (spawn error, file I/O, parse error) — be permissive
    return { pass: true, errors: [], duration: performance.now() - start };
  }
}
