/**
 * Fluent capability builder.
 *
 * Provides an ergonomic API for constructing capability sets
 * without manually wiring up capability objects.
 *
 * @module
 */

import type { Capability, CapabilitySet, GlobPattern } from "./types";
import { createCapabilitySet } from "./guard";

// ---------------------------------------------------------------------------
// Builder interface
// ---------------------------------------------------------------------------

/** Fluent builder for constructing CapabilitySets. */
export interface CapabilityBuilder {
  /** Grant read access to paths matching the glob pattern. */
  fsRead(pattern: GlobPattern): CapabilityBuilder;

  /** Grant write access to paths matching the glob pattern. */
  fsWrite(pattern: GlobPattern): CapabilityBuilder;

  /** Grant delete access to paths matching the glob pattern. */
  fsDelete(pattern: GlobPattern): CapabilityBuilder;

  /** Grant permission to spawn specific binaries. */
  spawn(binaries: readonly string[]): CapabilityBuilder;

  /** Grant permission to fetch from specific domains. */
  netFetch(
    domains: readonly string[],
    ports?: readonly number[],
  ): CapabilityBuilder;

  /** Grant permission to listen on a specific port. */
  netListen(port: number): CapabilityBuilder;

  /** Grant permission to read specific environment variables. */
  envRead(keys: readonly string[]): CapabilityBuilder;

  /** Grant permission to write specific environment variables. */
  envWrite(keys: readonly string[]): CapabilityBuilder;

  /** Grant permission to query a database at a path. */
  dbQuery(pattern: GlobPattern): CapabilityBuilder;

  /** Grant permission for raw TCP/UDP connections to hosts. */
  netConnect(
    hosts: readonly string[],
    ports?: readonly number[],
  ): CapabilityBuilder;

  /** Grant permission for OS interaction (notifications, clipboard, open). */
  osInteract(): CapabilityBuilder;

  /** Add a raw capability object. */
  add(capability: Capability): CapabilityBuilder;

  /** Freeze and return the immutable CapabilitySet. */
  build(): CapabilitySet;

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
export function capabilities(): CapabilityBuilder {
  const items: Capability[] = [];

  const builder: CapabilityBuilder = {
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

    add(capability: Capability): CapabilityBuilder {
      items.push(capability);
      return builder;
    },

    build(): CapabilitySet {
      return createCapabilitySet(items);
    },

    toArray(): readonly Capability[] {
      return [...items];
    },
  };

  return builder;
}
