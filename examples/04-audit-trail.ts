/**
 * Example 4: Full audit logging.
 *
 * Demonstrates how every operation is automatically logged
 * and queryable through the audit system.
 */

import { createContext, capabilities } from "../src/capabilities/index";
import { createAuditLogger } from "../src/audit/logger";
import { consoleSink } from "../src/audit/sinks/console";
import { ls, cat, exists } from "../src/wrappers/fs";
import { pipe, filter, count } from "../src/pipe/index";
import type { FileEntry } from "../src/wrappers/types";

const audit = createAuditLogger({
  agentId: "audit-demo-1",
  agentName: "audit-demo",
  sinks: [consoleSink()],
});

const ctx = createContext({
  name: "audit-demo",
  capabilities: capabilities().fsRead("**").build().capabilities.slice(),
  audit,
});

// These operations will all be audit-logged automatically
console.log("--- Operations (each is audit-logged) ---\n");

await ls(ctx, "src");
await exists(ctx, "package.json");
await cat(ctx, "package.json");
await pipe(
  ls(ctx, "src", { recursive: true, glob: "*.ts" }),
  filter<FileEntry>((f) => f.size > 100),
  count<FileEntry>(),
);

// Query the audit trail
console.log("\n--- Audit Query: all fs:read operations ---");
const reads = audit.query({ capability: "fs:read" });
for (const entry of reads) {
  console.log(`  ${entry.operation} — ${JSON.stringify(entry.args)}`);
}

console.log(`\nTotal operations recorded: ${audit.entries.length}`);
