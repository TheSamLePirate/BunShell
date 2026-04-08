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
} from "./fs";
export type { LsOptions } from "./fs";

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
