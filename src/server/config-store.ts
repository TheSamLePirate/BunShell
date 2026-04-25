/**
 * Agent configuration persistence — file-based JSON store.
 *
 * Stores agent configs at ~/.bunshell/configs/ as individual JSON files.
 * Each config has a sanitized ID used as the filename.
 *
 * @module
 */

import { join } from "node:path";
import { homedir } from "node:os";
import type { Capability } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentConfigData {
  readonly name: string;
  readonly capabilities: readonly Capability[];
  readonly timeout?: number | undefined;
}

export interface SavedConfig {
  readonly configId: string;
  readonly config: AgentConfigData;
  readonly savedAt: string;
  readonly updatedAt: string;
}

export interface ConfigStore {
  save(config: AgentConfigData, configId?: string): Promise<SavedConfig>;
  get(configId: string): Promise<SavedConfig | undefined>;
  list(): Promise<SavedConfig[]>;
  delete(configId: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_ID = /^[a-z0-9][a-z0-9-]*$/;

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateId(name: string): string {
  const base = sanitizeName(name) || "config";
  return `${base}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export function createConfigStore(basePath?: string): ConfigStore {
  const dir = basePath ?? join(homedir(), ".bunshell", "configs");

  async function ensureDir(): Promise<void> {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  }

  function filePath(configId: string): string {
    return join(dir, `${configId}.json`);
  }

  return {
    async save(config, configId?) {
      await ensureDir();
      const id = configId ?? generateId(config.name);
      if (!VALID_ID.test(id)) {
        throw new Error(
          `Invalid config ID: ${id} (must match ${VALID_ID.source})`,
        );
      }

      const existing = await this.get(id);
      const now = new Date().toISOString();

      const saved: SavedConfig = {
        configId: id,
        config,
        savedAt: existing?.savedAt ?? now,
        updatedAt: now,
      };

      await Bun.write(filePath(id), JSON.stringify(saved, null, 2));
      return saved;
    },

    async get(configId) {
      if (!VALID_ID.test(configId)) return undefined;
      const file = Bun.file(filePath(configId));
      if (!(await file.exists())) return undefined;
      const data = (await file.json()) as SavedConfig;
      return data;
    },

    async list() {
      await ensureDir();
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(dir);
      const configs: SavedConfig[] = [];

      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const file = Bun.file(join(dir, f));
        try {
          const data = (await file.json()) as SavedConfig;
          configs.push(data);
        } catch {
          // Skip corrupt files
        }
      }

      return configs.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    },

    async delete(configId) {
      if (!VALID_ID.test(configId)) return false;
      const { unlink } = await import("node:fs/promises");
      try {
        await unlink(filePath(configId));
        return true;
      } catch {
        return false;
      }
    },
  };
}
