/**
 * Fluent capability builder.
 *
 * Provides an ergonomic API for constructing capability sets
 * without manually wiring up capability objects.
 *
 * @module
 */

import type {
  Capability,
  CapabilityKind,
  GlobPattern,
  TypedCapabilitySet,
} from "./types";
import { createCapabilitySet } from "./guard";

// ---------------------------------------------------------------------------
// Builder interface
// ---------------------------------------------------------------------------

/**
 * Fluent builder for constructing typed CapabilitySets.
 *
 * The type parameter K accumulates which capability kinds have been added.
 * When build() is called, it returns a TypedCapabilitySet<K> that carries
 * the kind information, enabling createContext to infer CapabilityContext<K>.
 *
 * @typeParam K - Union of capability kinds added so far. Starts as `never`.
 */
export interface CapabilityBuilder<K extends CapabilityKind = never> {
  fsRead(pattern: GlobPattern): CapabilityBuilder<K | "fs:read">;
  fsWrite(pattern: GlobPattern): CapabilityBuilder<K | "fs:write">;
  fsDelete(pattern: GlobPattern): CapabilityBuilder<K | "fs:delete">;
  spawn(binaries: readonly string[]): CapabilityBuilder<K | "process:spawn">;
  netFetch(
    domains: readonly string[],
    ports?: readonly number[],
  ): CapabilityBuilder<K | "net:fetch">;
  netListen(port: number): CapabilityBuilder<K | "net:listen">;
  envRead(keys: readonly string[]): CapabilityBuilder<K | "env:read">;
  envWrite(keys: readonly string[]): CapabilityBuilder<K | "env:write">;
  dbQuery(pattern: GlobPattern): CapabilityBuilder<K | "db:query">;
  netConnect(
    hosts: readonly string[],
    ports?: readonly number[],
  ): CapabilityBuilder<K | "net:connect">;
  osInteract(): CapabilityBuilder<K | "os:interact">;
  secretRead(keys: readonly string[]): CapabilityBuilder<K | "secret:read">;
  secretWrite(keys: readonly string[]): CapabilityBuilder<K | "secret:write">;
  dockerRun(images: readonly string[]): CapabilityBuilder<K | "docker:run">;
  plugin<P extends string>(name: P): CapabilityBuilder<K | `plugin:${P}`>;
  add(capability: Capability): CapabilityBuilder<K | CapabilityKind>;

  /** Freeze and return the immutable CapabilitySet, branded with tracked kinds. */
  build(): TypedCapabilitySet<K>;

  /** Return the raw capability array (before creating a set). */
  toArray(): readonly Capability[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Start building a capability set with a fluent API.
 *
 * @example
 * ```ts
 * const caps = capabilities()
 *   .fsRead("/home/agent/**")
 *   .fsWrite("/tmp/**")
 *   .spawn(["git", "bun", "tsc"])
 *   .netFetch(["api.github.com"])
 *   .build();
 * ```
 */
export function capabilities(): CapabilityBuilder<never> {
  const items: Capability[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    fsRead(pattern: GlobPattern): CapabilityBuilder {
      items.push({ kind: "fs:read", pattern });
      return builder;
    },

    fsWrite(pattern: GlobPattern): CapabilityBuilder {
      items.push({ kind: "fs:write", pattern });
      return builder;
    },

    fsDelete(pattern: GlobPattern): CapabilityBuilder {
      items.push({ kind: "fs:delete", pattern });
      return builder;
    },

    spawn(binaries: readonly string[]): CapabilityBuilder {
      items.push({ kind: "process:spawn", allowedBinaries: binaries });
      return builder;
    },

    netFetch(
      domains: readonly string[],
      ports?: readonly number[],
    ): CapabilityBuilder {
      const cap: Capability = ports
        ? {
            kind: "net:fetch",
            allowedDomains: domains,
            allowedPorts: ports,
          }
        : { kind: "net:fetch", allowedDomains: domains };
      items.push(cap);
      return builder;
    },

    netListen(port: number): CapabilityBuilder {
      items.push({ kind: "net:listen", port });
      return builder;
    },

    envRead(keys: readonly string[]): CapabilityBuilder {
      items.push({ kind: "env:read", allowedKeys: keys });
      return builder;
    },

    envWrite(keys: readonly string[]): CapabilityBuilder {
      items.push({ kind: "env:write", allowedKeys: keys });
      return builder;
    },

    dbQuery(pattern: GlobPattern): CapabilityBuilder {
      items.push({ kind: "db:query", pattern });
      return builder;
    },

    netConnect(
      hosts: readonly string[],
      ports?: readonly number[],
    ): CapabilityBuilder {
      const cap: Capability = ports
        ? { kind: "net:connect", allowedHosts: hosts, allowedPorts: ports }
        : { kind: "net:connect", allowedHosts: hosts };
      items.push(cap);
      return builder;
    },

    osInteract(): CapabilityBuilder {
      items.push({ kind: "os:interact" });
      return builder;
    },

    secretRead(keys: readonly string[]): CapabilityBuilder {
      items.push({ kind: "secret:read", allowedKeys: keys });
      return builder;
    },

    secretWrite(keys: readonly string[]): CapabilityBuilder {
      items.push({ kind: "secret:write", allowedKeys: keys });
      return builder;
    },

    dockerRun(images: readonly string[]): CapabilityBuilder {
      items.push({ kind: "docker:run", allowedImages: images });
      return builder;
    },

    plugin(name: string): CapabilityBuilder {
      items.push({ kind: `plugin:${name}`, pluginName: name } as Capability);
      return builder;
    },

    add(capability: Capability): CapabilityBuilder {
      items.push(capability);
      return builder;
    },

    build(): TypedCapabilitySet<CapabilityKind> {
      return createCapabilitySet(items);
    },

    toArray(): readonly Capability[] {
      return [...items];
    },
  };

  return builder as unknown as CapabilityBuilder<never>;
}
