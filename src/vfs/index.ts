/**
 * BunShell Virtual Filesystem.
 *
 * @module
 */

export { createVfs } from "./vfs";
export type {
  VirtualFilesystem,
  VfsNode,
  VfsMeta,
  VfsEntry,
  VfsStat,
  VfsSnapshot,
  GitMountOptions,
  GitMountResult,
} from "./vfs";
