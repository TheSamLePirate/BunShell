/**
 * Typed state store — persistent key-value for session data.
 *
 * Used for auth tokens, cookies, agent state, anything that
 * persists across executions. Can be in-memory (session-scoped)
 * or file-backed (persistent across restarts).
 *
 * Requires secret:read / secret:write capabilities (state may
 * contain sensitive data like auth tokens).
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A state entry with metadata. */
interface StateEntry {
  value: string; // JSON-serialized
  updatedAt: string;
  ttl?: number; // milliseconds from updatedAt
}

/** Serialized state for persistence. */
export interface StateSnapshot {
  entries: Record<string, StateEntry>;
}

// ---------------------------------------------------------------------------
// StateStore
// ---------------------------------------------------------------------------

export interface StateStore {
  /** Set a typed value. */
  set<T>(ctx: CapabilityContext, key: string, value: T, ttl?: number): void;

  /** Get a typed value. Returns undefined if missing or expired. */
  get<T>(ctx: CapabilityContext, key: string): T | undefined;

  /** Check if a key exists and is not expired. */
  has(ctx: CapabilityContext, key: string): boolean;

  /** Delete a key. */
  delete(ctx: CapabilityContext, key: string): boolean;

  /** List keys matching a glob pattern (respects capabilities). */
  keys(ctx: CapabilityContext, pattern?: string): string[];

  /** Number of active entries. */
  readonly count: number;

  /** Export state. */
  snapshot(): StateSnapshot;

  /** Restore state. */
  restore(snapshot: StateSnapshot): void;

  /** Save to a file (JSON). */
  save(path: string): Promise<void>;

  /** Load from a file (JSON). */
  load(path: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function isExpired(entry: StateEntry): boolean {
  if (!entry.ttl) return false;
  const expiresAt = new Date(entry.updatedAt).getTime() + entry.ttl;
  return Date.now() > expiresAt;
}

/**
 * Create a state store.
 *
 * @example
 * ```ts
 * const state = createStateStore();
 *
 * stateSet(ctx, state, "github.auth", {
 *   accessToken: "ghp_xxx",
 *   refreshToken: "ghr_xxx",
 *   expiresAt: "2024-12-01T00:00:00Z",
 * });
 *
 * const auth = stateGet<GithubAuth>(ctx, state, "github.auth");
 * ```
 */
export function createStateStore(): StateStore {
  const entries = new Map<string, StateEntry>();

  function purgeExpired(): void {
    for (const [key, entry] of entries) {
      if (isExpired(entry)) entries.delete(key);
    }
  }

  return {
    set<T>(ctx: CapabilityContext, key: string, value: T, ttl?: number): void {
      ctx.caps.demand({ kind: "secret:write", allowedKeys: [key] });
      ctx.audit.log("secret:write", { op: "stateSet", key, value: "[STATE]" });
      const entry: StateEntry = {
        value: JSON.stringify(value),
        updatedAt: new Date().toISOString(),
      };
      if (ttl !== undefined) entry.ttl = ttl;
      entries.set(key, entry);
    },

    get<T>(ctx: CapabilityContext, key: string): T | undefined {
      ctx.caps.demand({ kind: "secret:read", allowedKeys: [key] });
      ctx.audit.log("secret:read", { op: "stateGet", key });
      const entry = entries.get(key);
      if (!entry || isExpired(entry)) {
        if (entry) entries.delete(key);
        return undefined;
      }
      return JSON.parse(entry.value) as T;
    },

    has(ctx: CapabilityContext, key: string): boolean {
      ctx.caps.demand({ kind: "secret:read", allowedKeys: [key] });
      const entry = entries.get(key);
      if (!entry) return false;
      if (isExpired(entry)) {
        entries.delete(key);
        return false;
      }
      return true;
    },

    delete(ctx: CapabilityContext, key: string): boolean {
      ctx.caps.demand({ kind: "secret:write", allowedKeys: [key] });
      ctx.audit.log("secret:write", { op: "stateDelete", key });
      return entries.delete(key);
    },

    keys(ctx: CapabilityContext, pattern?: string): string[] {
      purgeExpired();
      const result: string[] = [];
      const glob = pattern ? new Bun.Glob(pattern) : null;

      for (const key of entries.keys()) {
        if (glob && !glob.match(key)) continue;
        const check = ctx.caps.check({
          kind: "secret:read",
          allowedKeys: [key],
        });
        if (check.allowed) result.push(key);
      }

      ctx.audit.log("secret:read", {
        op: "stateKeys",
        pattern,
        count: result.length,
      });
      return result.sort();
    },

    get count() {
      purgeExpired();
      return entries.size;
    },

    snapshot(): StateSnapshot {
      purgeExpired();
      const data: Record<string, StateEntry> = {};
      for (const [key, entry] of entries) {
        data[key] = { ...entry };
      }
      return { entries: data };
    },

    restore(snapshot: StateSnapshot): void {
      entries.clear();
      for (const [key, entry] of Object.entries(snapshot.entries)) {
        if (!isExpired(entry)) {
          entries.set(key, entry);
        }
      }
    },

    async save(path: string): Promise<void> {
      const snap = this.snapshot();
      await Bun.write(path, JSON.stringify(snap, null, 2));
    },

    async load(path: string): Promise<void> {
      const text = await Bun.file(path).text();
      const snap = JSON.parse(text) as StateSnapshot;
      this.restore(snap);
    },
  };
}
