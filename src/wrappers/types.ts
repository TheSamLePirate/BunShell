/**
 * Shared output types for structured wrappers.
 *
 * Every wrapper returns typed objects instead of raw text.
 * These types are the structured data that flows through pipes.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// Filesystem types
// ---------------------------------------------------------------------------

/** File permission information. */
export interface FilePermissions {
  readonly readable: boolean;
  readonly writable: boolean;
  readonly executable: boolean;
  readonly mode: number;
  readonly modeString: string;
}

/** Structured representation of a file or directory entry. */
export interface FileEntry {
  readonly name: string;
  readonly path: string;
  readonly size: number;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly isSymlink: boolean;
  readonly permissions: FilePermissions;
  readonly modifiedAt: Date;
  readonly createdAt: Date;
  readonly accessedAt: Date;
  readonly extension: string | null;
}

/** Disk usage summary. */
export interface DiskUsage {
  readonly path: string;
  readonly bytes: number;
  readonly human: string;
  readonly files: number;
  readonly directories: number;
}

// ---------------------------------------------------------------------------
// Process types
// ---------------------------------------------------------------------------

/** Information about a running process. */
export interface ProcessInfo {
  readonly pid: number;
  readonly ppid: number;
  readonly name: string;
  readonly command: string;
  readonly user: string;
  readonly cpu: number;
  readonly memory: number;
  readonly state: string;
}

/** Result of a spawned command. */
export interface SpawnResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly success: boolean;
  readonly duration: number;
  readonly command: string;
  readonly args: readonly string[];
}

// ---------------------------------------------------------------------------
// Text types
// ---------------------------------------------------------------------------

/** A single match from a grep operation. */
export interface GrepMatch {
  readonly file: string | null;
  readonly line: number;
  readonly column: number;
  readonly content: string;
  readonly match: string;
}

/** Word/line/character count result. */
export interface WcResult {
  readonly lines: number;
  readonly words: number;
  readonly chars: number;
  readonly bytes: number;
}

// ---------------------------------------------------------------------------
// Network types
// ---------------------------------------------------------------------------

/** Structured HTTP response. */
export interface NetResponse<T = unknown> {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly body: T;
  readonly url: string;
  readonly duration: number;
}

/** Ping result for a single host. */
export interface PingResult {
  readonly host: string;
  readonly alive: boolean;
  readonly time: number | null;
}

// ---------------------------------------------------------------------------
// System types
// ---------------------------------------------------------------------------

/** System information from uname. */
export interface SystemInfo {
  readonly os: string;
  readonly hostname: string;
  readonly release: string;
  readonly arch: string;
  readonly platform: string;
}

/** Disk space information. */
export interface DfEntry {
  readonly filesystem: string;
  readonly size: string;
  readonly used: string;
  readonly available: string;
  readonly usePercent: string;
  readonly mountedOn: string;
}

// ---------------------------------------------------------------------------
// Environment types
// ---------------------------------------------------------------------------

/** Structured environment variable entry. */
export interface EnvEntry {
  readonly key: string;
  readonly value: string;
}

// ---------------------------------------------------------------------------
// Write result
// ---------------------------------------------------------------------------

/** Result of a write operation. */
export interface WriteResult {
  readonly bytesWritten: number;
  readonly path: string;
}
