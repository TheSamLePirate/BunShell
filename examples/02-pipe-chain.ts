/**
 * Example 2: Pipe chain — ls → filter → sort → output.
 *
 * Demonstrates typed pipe system with compile-time verified stages.
 */

import { createContext, capabilities } from "../src/capabilities/index";
import { ls } from "../src/wrappers/fs";
import { pipe, sortBy, pluck, toStdout } from "../src/pipe/index";
import type { FileEntry } from "../src/wrappers/types";

const ctx = createContext({
  name: "pipe-demo",
  capabilities: capabilities().fsRead("**").build().capabilities.slice(),
});

// Find all TypeScript files, sorted by size, print their names
await pipe(
  ls(ctx, "src", { recursive: true, glob: "*.ts" }),
  sortBy<FileEntry>("size", "desc"),
  pluck<FileEntry, "name">("name"),
  toStdout<string[]>(),
);
