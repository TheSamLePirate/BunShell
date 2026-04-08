/**
 * BunShell — Typed Agent Shell System
 *
 * TypeScript's type system as the permission and security layer.
 * Every system call, file access, network request, and process spawn
 * is wrapped in typed capabilities verified at compile time.
 *
 * @module
 */

export * from "./capabilities/index";
export * from "./wrappers/index";
export * from "./pipe/index";
export * from "./audit/index";
export * from "./agent/index";
export { startRepl } from "./repl/index";
export type { ReplOptions } from "./repl/index";
export * from "./vfs/index";
export * from "./server/index";
