/**
 * Example: Portable agent environment config.
 *
 * Drop this file in any repo as .bunshell.ts and every team member
 * gets the same sandboxed environment. The agent can only do what
 * this config allows — enforced at the type level.
 *
 * Load with: const env = await loadEnvironment(".bunshell.ts")
 */

import type { BunShellEnv } from "../src/config/types";

export default {
  name: "code-review-agent",

  capabilities: {
    fs: {
      read: ["src/**", "tests/**", "package.json", "tsconfig.json"],
      write: ["/tmp/reports/**"],
    },
    process: {
      spawn: ["git", "bun", "tsc"],
    },
    net: {
      fetch: ["api.github.com"],
    },
    env: {
      read: ["HOME", "PATH", "NODE_ENV"],
    },
    secrets: {
      read: ["GITHUB_TOKEN"],
      write: ["GITHUB_TOKEN"],
    },
    docker: {
      run: ["node:20-alpine", "python:3.*", "alpine:latest"],
    },
    plugins: ["deploy", "formatter"],
  },

  secrets: {
    fromEnv: ["GITHUB_TOKEN"],
  },

  vfs: {
    mount: [{ from: ".", to: "/workspace" }],
  },

  audit: {
    console: true,
    jsonl: "/tmp/bunshell-audit.jsonl",
  },

  timeout: 30000,
} satisfies BunShellEnv;
