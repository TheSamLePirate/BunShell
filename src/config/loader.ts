/**
 * Environment loader — reads a .bunshell.ts config and builds
 * the full execution environment: context, VFS, secrets, audit.
 *
 * @module
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { BunShellEnv } from "./types";
import type { Capability, CapabilityContext } from "../capabilities/types";
import { createContext } from "../capabilities/context";
import { capabilities } from "../capabilities/builder";
import { createAuditLogger, type FullAuditLogger } from "../audit/logger";
import { consoleSink } from "../audit/sinks/console";
import { jsonlSink } from "../audit/sinks/jsonl";
import type { AuditSink } from "../audit/types";
import { createVfs, type VirtualFilesystem } from "../vfs/vfs";
import { createSecretStore, deriveKey } from "../secrets/store";
import { secretFromEnv } from "../secrets/auth";
import type { SecretStore } from "../secrets/store";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A fully loaded BunShell environment ready to use. */
export interface LoadedEnvironment {
  readonly name: string;
  readonly ctx: CapabilityContext;
  readonly vfs: VirtualFilesystem;
  readonly secrets: SecretStore;
  readonly audit: FullAuditLogger;
  readonly config: BunShellEnv;
}

// ---------------------------------------------------------------------------
// Config file discovery
// ---------------------------------------------------------------------------

const CONFIG_NAMES = [
  ".bunshell.ts",
  "bunshell.config.ts",
  ".bunshell.js",
  "bunshell.config.js",
];

/**
 * Find a BunShell config file in the given directory (or cwd).
 * Searches for: .bunshell.ts, bunshell.config.ts, .bunshell.js, bunshell.config.js
 */
export function findConfig(dir?: string): string | null {
  const base = dir ?? process.cwd();
  for (const name of CONFIG_NAMES) {
    const path = resolve(base, name);
    if (existsSync(path)) return path;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Capability builder from config
// ---------------------------------------------------------------------------

function buildCapabilities(config: BunShellEnv): readonly Capability[] {
  const b = capabilities();

  const fs = config.capabilities.fs;
  if (fs?.read) for (const p of fs.read) b.fsRead(p);
  if (fs?.write) for (const p of fs.write) b.fsWrite(p);
  if (fs?.delete) for (const p of fs.delete) b.fsDelete(p);

  const proc = config.capabilities.process;
  if (proc?.spawn?.length) b.spawn(proc.spawn);

  const net = config.capabilities.net;
  if (net?.fetch?.length) b.netFetch(net.fetch);
  if (net?.listen) for (const p of net.listen) b.netListen(p);

  const env = config.capabilities.env;
  if (env?.read?.length) b.envRead(env.read);
  if (env?.write?.length) b.envWrite(env.write);

  const db = config.capabilities.db;
  if (db?.query) for (const p of db.query) b.dbQuery(p);

  const sec = config.capabilities.secrets;
  if (sec?.read?.length) b.secretRead(sec.read);
  if (sec?.write?.length) b.secretWrite(sec.write);

  if (config.capabilities.os?.interact) b.osInteract();

  const docker = config.capabilities.docker;
  if (docker?.run?.length) b.dockerRun(docker.run);

  const plugins = config.capabilities.plugins;
  if (plugins?.length) {
    for (const p of plugins) b.plugin(p);
  }

  return b.toArray();
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load a BunShell environment from a config file path.
 *
 * @example
 * ```ts
 * const env = await loadEnvironment(".bunshell.ts");
 * // env.ctx — CapabilityContext with the configured permissions
 * // env.vfs — VirtualFilesystem with mounts applied
 * // env.secrets — SecretStore with env vars imported
 * // env.audit — AuditLogger with configured sinks
 * ```
 */
export async function loadEnvironment(
  configPath: string,
): Promise<LoadedEnvironment> {
  const absPath = resolve(configPath);
  const mod = await import(absPath);
  const config: BunShellEnv = mod.default;

  if (!config.name)
    throw new Error(`BunShell config missing "name" field: ${absPath}`);
  if (!config.capabilities)
    throw new Error(`BunShell config missing "capabilities" field: ${absPath}`);

  // 1. Build audit sinks
  const sinks: AuditSink[] = [];
  if (config.audit?.console) sinks.push(consoleSink());
  if (config.audit?.jsonl) sinks.push(jsonlSink(config.audit.jsonl));

  const audit = createAuditLogger({
    agentId: `${config.name}-${Date.now().toString(36)}`,
    agentName: config.name,
    sinks,
  });

  // 2. Build capabilities and context
  const caps = buildCapabilities(config);
  const ctx = createContext({
    name: config.name,
    capabilities: caps,
    audit,
  });

  // 3. Build secret store
  const masterPassword = config.secrets?.masterPassword;
  const masterKey = masterPassword
    ? deriveKey(masterPassword).key
    : new Uint8Array(randomBytes(32));
  const secrets = createSecretStore(masterKey);

  // 4. Import secrets from env
  if (config.secrets?.fromEnv) {
    // Need env:read + secret:write to import
    const importCtx = createContext({
      name: `${config.name}-secret-import`,
      capabilities: [
        ...caps,
        // Ensure we have the needed caps for import even if user forgot
        {
          kind: "env:read" as const,
          allowedKeys: config.secrets.fromEnv.slice(),
        },
        {
          kind: "secret:write" as const,
          allowedKeys: config.secrets.fromEnv.slice(),
        },
        {
          kind: "secret:read" as const,
          allowedKeys: config.secrets.fromEnv.slice(),
        },
      ],
    });
    for (const envKey of config.secrets.fromEnv) {
      try {
        secretFromEnv(importCtx, secrets, envKey);
      } catch {
        // Env var not set — skip silently
      }
    }
  }

  // 5. Build VFS and apply mounts
  const vfs = createVfs();

  if (config.vfs?.mount) {
    for (const mount of config.vfs.mount) {
      if ("git" in mount) {
        // Git mount
        const token = config.secrets?.fromEnv?.includes("GITHUB_TOKEN")
          ? secrets.get(
              createContext({
                name: "git-mount",
                capabilities: [
                  {
                    kind: "secret:read" as const,
                    allowedKeys: ["GITHUB_TOKEN"],
                  },
                ],
              }),
              "GITHUB_TOKEN",
            )
          : undefined;

        const gitOpts: Record<string, unknown> = {};
        if (token) gitOpts["token"] = token;
        if (mount.include) gitOpts["include"] = mount.include;
        if (mount.exclude) gitOpts["exclude"] = mount.exclude;
        if (mount.maxFiles) gitOpts["maxFiles"] = mount.maxFiles;

        await vfs.mountGit(mount.git, mount.to, gitOpts);
      } else if ("live" in mount) {
        // Live bi-directional mount
        const absFrom = resolve(absPath, "..", mount.live);
        const liveOpts: Record<string, unknown> = {};
        if (mount.policy) liveOpts["policy"] = mount.policy;
        if (mount.ignore) liveOpts["ignore"] = mount.ignore;
        await vfs.mountLive(absFrom, mount.to, liveOpts);
      } else {
        // Disk mount (one-time snapshot)
        const absFrom = resolve(absPath, "..", mount.from);
        await vfs.mountFromDisk(absFrom, mount.to);
      }
    }
  }

  return { name: config.name, ctx, vfs, secrets, audit, config };
}

/**
 * Auto-discover and load a BunShell environment from the current directory.
 * Returns null if no config file is found.
 */
export async function autoLoadEnvironment(
  dir?: string,
): Promise<LoadedEnvironment | null> {
  const configPath = findConfig(dir);
  if (!configPath) return null;
  return loadEnvironment(configPath);
}
