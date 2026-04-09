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

export { createLiveMount } from "./live-mount";
export type {
  LiveMountHandle,
  LiveMountOptions,
  LiveMountPolicy,
  LiveMountDiff,
} from "./live-mount";
