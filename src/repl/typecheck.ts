/**
 * tsc type checker integration — compile-check before execution.
 *
 * Generates a temporary .ts file with the user's code + proper imports,
 * runs tsc --noEmit, and parses errors. Capability violations become
 * type errors because CapabilityContext<K> encodes which kinds are held.
 *
 * @module
 */

import { resolve, join } from "node:path";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
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
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dir, "../..");
// Temp files MUST be inside the project (rootDir constraint)
const TMP_DIR = join(PROJECT_ROOT, ".typecheck-tmp");

// Ensure tmp dir exists and is gitignored
try {
  mkdirSync(TMP_DIR, { recursive: true });
} catch {
  // already exists
}

// ---------------------------------------------------------------------------
// Preamble generation
// ---------------------------------------------------------------------------

/**
 * Generate the TypeScript preamble that declares ctx and imports
 * all BunShell APIs with proper types.
 */
function generatePreamble(contextKinds: readonly CapabilityKind[]): string {
  const kindsUnion = contextKinds.map((k) => `"${k}"`).join(" | ");
  const srcPath = join(PROJECT_ROOT, "src/index");

  return `
// Auto-generated preamble for type checking
import type { CapabilityContext } from "${srcPath}";
import {
  // Capabilities
  createContext, capabilities, CapabilityError, ok, err,
  // Filesystem
  ls, cat, stat, exists, mkdir, write, readJson, writeJson,
  rm, cp, mv, find, du, chmod, createSymlink, readLink,
  touch, append, truncate, realPath, watchPath, globFiles,
  // Process
  ps, kill, spawn, exec,
  // Network
  netFetch, ping, download, dig, serve, wsConnect,
  // Env
  env, getEnv, setEnv,
  // Text
  grep, sort, uniq, head, tail, wc,
  // System
  uname, uptime, whoami, hostname, df,
  // Crypto
  hash, hmac, randomBytes, randomUUID, randomInt, encrypt, decrypt,
  // Archive
  tar, untar, zip, unzip, gzip, gunzip,
  // Stream
  lineStream, tailStream, pipeSpawn, streamSpawn,
  // Data
  parseJSON, formatJSON, parseCSV, formatCSV, parseTOML,
  base64Encode, base64Decode, base64DecodeString,
  // Database
  dbOpen, dbQuery, dbExec,
  // Git
  gitStatus, gitLog, gitDiff, gitBranch, gitAdd, gitCommit,
  gitPush, gitPull, gitClone, gitStash,
  // OS
  openUrl, openFile, notify, clipboard,
  // Scheduling
  sleep, interval, timeout, debounce, throttle, retry,
  // User
  currentUser, users, groups,
  // Pipe
  pipe, filter, map, reduce, take, skip, sortBy, groupBy,
  unique, flatMap, tap, count, first, last, pluck,
  from, fromFile, fromJSON, fromCommand,
  toFile, toJSON, toStdout, collect,
  toTable, toBarChart, toSparkline, toHistogram,
  // Stream pipe
  streamPipe, sFilter, sMap, sFlatMap, sTake, sSkip, sTap,
  sUnique, sPluck, sChunk, sScan, sThrottle, sTakeWhile, sSkipWhile,
  sToArray, sReduce, sCount, sFirst, sForEach, sToFile,
  fromArray, fromReadable, fromLines,
  // Agent
  runAgent,
  // Secrets
  createSecretStore, deriveKey, createStateStore,
  authBearer, authBasic, authedFetch, oauth2DeviceFlow, cookieJar, secretFromEnv,
} from "${srcPath}";

// Suppress unused variable warnings — these are available in scope
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
 * Runs tsc --noEmit on a temp file. Returns structured errors.
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

  const preamble = generatePreamble(contextKinds);
  const preambleLines = preamble.split("\n").length;

  // Wrap user code in async IIFE to allow top-level await
  const fullCode = `${preamble}\n(async () => {\n${code}\n})();\n`;

  // Write temp .ts file and a temp tsconfig that only includes it
  const stamp = Date.now();
  const tmpFile = join(TMP_DIR, `check-${stamp}.ts`);
  const tmpTsconfig = join(TMP_DIR, `tsconfig-${stamp}.json`);

  writeFileSync(tmpFile, fullCode);
  // Temp tsconfig: extends the main one but ONLY includes our temp file.
  // Must use absolute path for include (relative is to tsconfig location).
  // Must override exclude to NOT exclude .typecheck-tmp.
  writeFileSync(
    tmpTsconfig,
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
      },
      include: [tmpFile],
      exclude: [],
    }),
  );

  try {
    // Run tsc with the temp tsconfig — only checks our temp file
    const proc = Bun.spawn(
      [
        "bunx",
        "tsc",
        "--noEmit",
        "--pretty",
        "false",
        "--project",
        tmpTsconfig,
      ],
      { stdout: "pipe", stderr: "pipe", cwd: PROJECT_ROOT },
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    const output = stdout + stderr;
    const duration = performance.now() - start;

    if (!output.trim()) {
      return { pass: true, errors: [], duration };
    }

    // Parse tsc errors — only keep errors from our temp file
    const errors: TypeCheckError[] = [];
    const errorLines = output.trim().split("\n");
    const tmpBasename = `check-${stamp}.ts`;

    for (const line of errorLines) {
      // Only parse errors from our temp file (ignore errors in other files)
      if (!line.includes(tmpBasename)) continue;

      // Format: path/filename(line,col): error TSxxxx: message
      const match = line.match(/\((\d+),(\d+)\):\s*(error\s+TS\d+):\s*(.+)/);
      if (match) {
        const tscLine = parseInt(match[1]!, 10);
        const col = parseInt(match[2]!, 10);
        const errCode = match[3]!;
        const message = match[4]!;

        // Map line back to user code (subtract preamble + async wrapper)
        const userLine = tscLine - preambleLines - 1;
        if (userLine > 0) {
          errors.push({ line: userLine, col, code: errCode, message });
        }
      }
    }

    return { pass: errors.length === 0, errors, duration };
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(tmpTsconfig);
    } catch {
      /* ignore */
    }
  }
}
