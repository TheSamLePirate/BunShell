/**
 * BunShell agent environment for testProject.
 *
 * Drop this in any repo — every team member gets the same
 * sandboxed, capability-checked execution environment.
 *
 * Start pi with:
 *   pi -e /Users/olivierveinand/Documents/DEV/BunShell/.pi/extensions/bunshell/index.ts
 */

import type { BunShellEnv } from "/Users/olivierveinand/Documents/DEV/BunShell/src/config/types";

export default {
  name: "test-agent",

  capabilities: {
    fs: {
      read: ["**"],
      write: ["src/**", "tests/**", "/tmp/**"],
      delete: ["/tmp/**"],
    },
    process: {
      spawn: ["git", "bun", "tsc", "node", "npm"],
    },
    net: {
      fetch: ["api.github.com", "registry.npmjs.org", "httpbin.org"],
    },
    env: {
      read: ["HOME", "PATH", "NODE_ENV", "USER"],
    },
    docker: {
      run: ["node:20-alpine", "python:3.*", "alpine:latest"],
    },
    secrets: {
      read: ["GITHUB_TOKEN"],
      write: ["GITHUB_TOKEN"],
    },
  },

  vfs: {
    mount: [
      {
        live: ".",
        to: "/workspace",
        policy: "draft",
        ignore: ["node_modules/**", ".git/**", "dist/**"],
      },
    ],
  },

  audit: {
    console: false,
    jsonl: "/tmp/testproject-audit.jsonl",
  },

  timeout: 30000,
} satisfies BunShellEnv;
