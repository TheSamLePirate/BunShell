/**
 * BunShell Audit System — Layer 4
 *
 * Automatic structured logging of all capability usage.
 * Every operation through a CapabilityContext is recorded.
 *
 * @module
 */

export type { AuditEntry, AuditSink, AuditQuery } from "./types";
export { createAuditLogger } from "./logger";
export type { AuditLoggerOptions, FullAuditLogger } from "./logger";
export { consoleSink } from "./sinks/console";
export { jsonlSink } from "./sinks/jsonl";
export { streamSink } from "./sinks/stream";
export type { AuditStream } from "./sinks/stream";
