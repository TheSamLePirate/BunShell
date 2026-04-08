/**
 * Example 6: TUI Visualizations — tables, bar charts, sparklines, histograms.
 *
 * Run: bun run examples/06-visualizations.ts
 */

import { createContext, capabilities } from "../src/capabilities/index";
import { ls } from "../src/wrappers/fs";
import { gitLog } from "../src/wrappers/git";
import { pipe, sortBy, take, pluck, groupBy } from "../src/pipe/index";
import {
  toTable,
  toBarChart,
  toSparkline,
  toHistogram,
} from "../src/pipe/visualize";
import type { FileEntry } from "../src/wrappers/types";
import type { GitCommit } from "../src/wrappers/git";

const ctx = createContext({
  name: "viz-demo",
  capabilities: capabilities()
    .fsRead("**")
    .spawn(["git"])
    .envRead(["*"])
    .build()
    .capabilities.slice(),
});

console.log("\x1b[1m\n━━━ 1. Files as Table ━━━\x1b[0m\n");
await pipe(
  ls(ctx, "src", { recursive: true, glob: "*.ts" }),
  sortBy<FileEntry>("size", "desc"),
  take<FileEntry>(15),
  toTable({ columns: ["name", "size", "extension", "modifiedAt"] }),
);

console.log("\x1b[1m\n━━━ 2. File Sizes — Bar Chart ━━━\x1b[0m\n");
await pipe(
  ls(ctx, "src", { recursive: true, glob: "*.ts" }),
  sortBy<FileEntry>("size", "desc"),
  take<FileEntry>(12),
  toBarChart<FileEntry>("size", "name", { title: "Largest Source Files" }),
);

console.log("\x1b[1m\n━━━ 3. File Sizes — Sparkline ━━━\x1b[0m\n");
await pipe(
  ls(ctx, "src", { recursive: true, glob: "*.ts", sortBy: "size" }),
  pluck<FileEntry, "size">("size"),
  toSparkline(),
);

console.log("\x1b[1m\n━━━ 4. File Size Distribution — Histogram ━━━\x1b[0m\n");
await pipe(
  ls(ctx, "src", { recursive: true, glob: "*.ts" }),
  pluck<FileEntry, "size">("size"),
  toHistogram(undefined, { buckets: 6 }),
);

console.log("\x1b[1m\n━━━ 5. Git Commits by Author — Bar Chart ━━━\x1b[0m\n");
await pipe(
  gitLog(ctx, { limit: 50 }),
  groupBy<GitCommit>("author"),
  toBarChart(undefined, undefined, { title: "Commits by Author" }),
);

console.log("\x1b[1m\n━━━ 6. Git Log — Table ━━━\x1b[0m\n");
await pipe(
  gitLog(ctx, { limit: 10 }),
  toTable<GitCommit>({
    columns: ["shortHash", "author", "date", "message"],
    headers: {
      shortHash: "Hash",
      author: "Author",
      date: "Date",
      message: "Message",
    },
  }),
);
