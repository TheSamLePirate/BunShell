/**
 * BunShell Structured Wrappers — Layer 2
 *
 * Typed replacements for Unix commands. Every wrapper requires
 * a CapabilityContext and returns structured data instead of text.
 *
 * @module
 */

// Types
export type {
  FileEntry,
  FilePermissions,
  DiskUsage,
  ProcessInfo,
  SpawnResult,
  GrepMatch,
  WcResult,
  NetResponse,
  PingResult,
  SystemInfo,
  DfEntry,
  EnvEntry,
  WriteResult,
} from "./types";

// Filesystem
export {
  ls,
  cat,
  stat,
  exists,
  mkdir,
  write,
  readJson,
  writeJson,
  rm,
  cp,
  mv,
  find,
  du,
  chmod,
  createSymlink,
  readLink,
  touch,
  append,
  truncate,
  realPath,
  watchPath,
  globFiles,
} from "./fs";
export type { LsOptions, WatchEvent } from "./fs";

// Process
export { ps, kill, spawn, exec } from "./process";

// Network
export { netFetch, ping } from "./net";

// Environment
export { env, getEnv, setEnv } from "./env";

// Text
export { grep, sort, uniq, head, tail, wc } from "./text";

// System
export { uname, uptime, whoami, hostname, df } from "./system";

// Crypto
export {
  hash,
  hmac,
  randomBytes,
  randomUUID,
  randomInt,
  encrypt,
  decrypt,
} from "./crypto";
export type { HashAlgorithm, HashResult, EncryptResult } from "./crypto";

// Archive
export { tar, untar, zip, unzip, gzip, gunzip } from "./archive";
export type { ExtractResult } from "./archive";

// Stream
export { lineStream, tailStream, pipeSpawn, streamSpawn } from "./stream";
export type { StreamingProcess } from "./stream";
