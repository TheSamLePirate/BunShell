/**
 * Example 5: Operations that get DENIED.
 *
 * Demonstrates what happens when code tries to exceed its capabilities.
 * Every denial is caught, logged, and throws CapabilityError.
 *
 * Run: bun run examples/05-denied-operations.ts
 */

import {
  createContext,
  capabilities,
  CapabilityError,
} from "../src/capabilities/index";
import { createAuditLogger } from "../src/audit/logger";
import { consoleSink } from "../src/audit/sinks/console";
import { ls, cat, write, rm } from "../src/wrappers/fs";
import { resolve } from "node:path";
import { spawn } from "../src/wrappers/process";
import { netFetch } from "../src/wrappers/net";
import { getEnv, setEnv } from "../src/wrappers/env";
import { grep } from "../src/wrappers/text";

const R = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// ---------------------------------------------------------------------------
// Create a RESTRICTED context — read-only access to src/ only
// ---------------------------------------------------------------------------

const audit = createAuditLogger({
  agentId: "demo-denied",
  agentName: "restricted-agent",
  sinks: [consoleSink()],
});

const srcDir = resolve("src");

const ctx = createContext({
  name: "restricted-agent",
  capabilities: capabilities()
    .fsRead(srcDir + "/**") // Can ONLY read inside src/
    .fsRead(srcDir) // Can ls the src directory itself
    .spawn(["git"]) // Can ONLY run git
    .envRead(["HOME", "PATH"]) // Can ONLY read HOME and PATH
    .build()
    .capabilities.slice(),
  audit,
});

async function tryAndCatch(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    console.log(`  ${GREEN}ALLOWED${R} ${label}`);
  } catch (err) {
    if (err instanceof CapabilityError) {
      console.log(`  ${RED}DENIED${R}  ${label}`);
      console.log(`          ${DIM}${err.reason}${R}`);
    } else {
      console.log(
        `  ${RED}ERROR${R}   ${label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Allowed operations
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== ALLOWED operations ===${R}\n`);

await tryAndCatch("ls(ctx, 'src')", () => ls(ctx, "src"));

await tryAndCatch("cat(ctx, 'src/index.ts')", () => cat(ctx, "src/index.ts"));

await tryAndCatch("grep(ctx, /export/, 'src/index.ts')", () =>
  grep(ctx, /export/, "src/index.ts"),
);

await tryAndCatch("spawn(ctx, 'git', ['status'])", () =>
  spawn(ctx, "git", ["status"]),
);

await tryAndCatch("getEnv(ctx, 'HOME')", async () => getEnv(ctx, "HOME"));

// ---------------------------------------------------------------------------
// DENIED operations — writing files
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== DENIED: no fs:write capability ===${R}\n`);

await tryAndCatch("write(ctx, '/tmp/hack.txt', 'data')", () =>
  write(ctx, "/tmp/hack.txt", "data"),
);

await tryAndCatch("write(ctx, 'src/injected.ts', 'evil')", () =>
  write(ctx, "src/injected.ts", "evil code"),
);

// ---------------------------------------------------------------------------
// DENIED operations — reading outside src/
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== DENIED: reading outside src/ ===${R}\n`);

await tryAndCatch("ls(ctx, '/')", () => ls(ctx, "/"));

await tryAndCatch("cat(ctx, '/etc/passwd')", () => cat(ctx, "/etc/passwd"));

await tryAndCatch("cat(ctx, 'package.json')", () => cat(ctx, "package.json"));

await tryAndCatch("ls(ctx, 'tests')", () => ls(ctx, "tests"));

await tryAndCatch("grep(ctx, /secret/, '/etc/shadow')", () =>
  grep(ctx, /secret/, "/etc/shadow"),
);

// ---------------------------------------------------------------------------
// DENIED operations — deleting files
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== DENIED: no fs:delete capability ===${R}\n`);

await tryAndCatch("rm(ctx, 'src/index.ts')", () => rm(ctx, "src/index.ts"));

await tryAndCatch("rm(ctx, '/tmp', { recursive: true })", () =>
  rm(ctx, "/tmp", { recursive: true }),
);

// ---------------------------------------------------------------------------
// DENIED operations — spawning unauthorized binaries
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== DENIED: only git allowed ===${R}\n`);

await tryAndCatch("spawn(ctx, 'rm', ['-rf', '/'])", () =>
  spawn(ctx, "rm", ["-rf", "/"]),
);

await tryAndCatch("spawn(ctx, 'curl', ['https://evil.com'])", () =>
  spawn(ctx, "curl", ["https://evil.com"]),
);

await tryAndCatch("spawn(ctx, 'node', ['-e', 'process.exit()'])", () =>
  spawn(ctx, "node", ["-e", "process.exit()"]),
);

await tryAndCatch("spawn(ctx, 'bash', ['-c', 'echo pwned'])", () =>
  spawn(ctx, "bash", ["-c", "echo pwned"]),
);

// ---------------------------------------------------------------------------
// DENIED operations — network access
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== DENIED: no net:fetch capability ===${R}\n`);

await tryAndCatch("netFetch(ctx, 'https://api.github.com')", () =>
  netFetch(ctx, "https://api.github.com"),
);

await tryAndCatch("netFetch(ctx, 'http://evil.com/exfiltrate')", () =>
  netFetch(ctx, "http://evil.com/exfiltrate"),
);

// ---------------------------------------------------------------------------
// DENIED operations — env access outside allowlist
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== DENIED: only HOME and PATH allowed ===${R}\n`);

await tryAndCatch("getEnv(ctx, 'AWS_SECRET_ACCESS_KEY')", async () =>
  getEnv(ctx, "AWS_SECRET_ACCESS_KEY"),
);

await tryAndCatch("getEnv(ctx, 'DATABASE_URL')", async () =>
  getEnv(ctx, "DATABASE_URL"),
);

await tryAndCatch("setEnv(ctx, 'PATH', '/usr/bin')", async () =>
  setEnv(ctx, "PATH", "/usr/bin"),
);

// ---------------------------------------------------------------------------
// DENIED operations — capability escalation via derive
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== DENIED: cannot escalate via derive ===${R}\n`);

const child = ctx.derive("escalated-child", [
  { kind: "fs:read", pattern: "src/**" }, // OK — parent has this
  { kind: "fs:write", pattern: "**" }, // DROPPED — parent doesn't have fs:write
  { kind: "net:fetch", allowedDomains: ["*"] }, // DROPPED — parent doesn't have net:fetch
  { kind: "process:spawn", allowedBinaries: ["rm", "curl"] }, // DROPPED — parent only allows git
]);

console.log(
  `  Child requested 4 capabilities, got: ${child.caps.capabilities.length}`,
);
console.log(
  `  fs:read?    ${child.caps.has("fs:read") ? GREEN + "yes" + R : RED + "no" + R}`,
);
console.log(
  `  fs:write?   ${child.caps.has("fs:write") ? GREEN + "yes" + R : RED + "no" + R}`,
);
console.log(
  `  net:fetch?  ${child.caps.has("net:fetch") ? GREEN + "yes" + R : RED + "no" + R}`,
);
console.log(
  `  spawn rm?   ${child.caps.check({ kind: "process:spawn", allowedBinaries: ["rm"] }).allowed ? GREEN + "yes" + R : RED + "no" + R}`,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}=== Audit summary ===${R}\n`);

const denied = audit.query({ result: "denied" });
const success = audit.query({ result: "success" });
console.log(`  ${GREEN}${success.length} operations allowed${R}`);
console.log(`  ${RED}${denied.length} operations denied${R}`);
console.log(`  ${DIM}${audit.entries.length} total audit entries${R}\n`);
