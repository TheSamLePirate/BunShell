#!/usr/bin/env bun

/**
 * Scaffold a `.bunshell.ts` config in the current directory.
 *
 * Usage:
 *   bunshell init                           # interactive
 *   bunshell init --name my-agent           # set name
 *   bunshell init --preset readonly         # readonly | builder | full
 *   bunshell init --force                   # overwrite existing config
 */

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { findConfig } from "../src/config/loader";

type Preset = "readonly" | "builder" | "full";

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : undefined;
}

async function prompt(question: string, fallback: string): Promise<string> {
  process.stdout.write(`${question} [${fallback}] `);
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  const { value } = await reader.read();
  reader.releaseLock();
  const answer = value ? decoder.decode(value).trim() : "";
  return answer || fallback;
}

function template(name: string, preset: Preset): string {
  const presets: Record<Preset, string> = {
    readonly: `  capabilities: {
    fs: {
      read: ["**"],
    },
    env: {
      read: ["HOME", "PATH"],
    },
  },`,
    builder: `  capabilities: {
    fs: {
      read: ["**"],
      write: ["src/**", "tests/**", "/tmp/**"],
      delete: ["/tmp/**"],
    },
    process: {
      spawn: ["git", "bun", "node", "tsc", "npm"],
    },
    net: {
      fetch: ["api.github.com", "registry.npmjs.org"],
    },
    env: {
      read: ["HOME", "PATH", "NODE_ENV"],
    },
  },`,
    full: `  capabilities: {
    fs: {
      read: ["**"],
      write: ["**"],
      delete: ["/tmp/**"],
    },
    process: {
      spawn: ["*"],
    },
    net: {
      fetch: ["*"],
    },
    env: {
      read: ["*"],
    },
    docker: {
      run: ["*"],
    },
  },`,
  };

  return `/**
 * BunShell agent environment for ${name}.
 *
 * Drop this in any repo — every team member gets the same
 * sandboxed, capability-checked execution environment.
 *
 * Run with:
 *   bun run server   # start the server, dashboard at http://127.0.0.1:7483
 */

import type { BunShellEnv } from "bunshell";

export default {
  name: "${name}",

${presets[preset]}

  audit: {
    console: false,
    jsonl: "/tmp/${name}-audit.jsonl",
  },

  timeout: 30000,
} satisfies BunShellEnv;
`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force") || args.includes("-f");
  const cwd = process.cwd();

  const existing = findConfig(cwd);
  if (existing && !force) {
    console.error(
      `error: ${existing} already exists. Pass --force to overwrite.`,
    );
    process.exit(1);
  }

  const nameArg = flagValue(args, "--name");
  const presetArg = flagValue(args, "--preset") as Preset | undefined;

  // Interactive prompts only when args are missing AND we're on a TTY
  const interactive = process.stdin.isTTY === true;
  const defaultName = cwd.split("/").pop() ?? "agent";

  const name = nameArg ?? (interactive ? await prompt("Agent name?", defaultName) : defaultName);

  let preset: Preset;
  if (presetArg && ["readonly", "builder", "full"].includes(presetArg)) {
    preset = presetArg;
  } else if (interactive) {
    const answer = await prompt(
      "Preset? (readonly | builder | full)",
      "builder",
    );
    preset = (["readonly", "builder", "full"].includes(answer)
      ? answer
      : "builder") as Preset;
  } else {
    preset = "builder";
  }

  const target = resolve(cwd, ".bunshell.ts");
  if (existsSync(target) && !force) {
    console.error(`error: ${target} already exists. Pass --force to overwrite.`);
    process.exit(1);
  }

  writeFileSync(target, template(name, preset), "utf-8");
  console.log(`Created ${target}`);
  console.log(`  name:   ${name}`);
  console.log(`  preset: ${preset}`);
  console.log(`\nNext: bun run server`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
