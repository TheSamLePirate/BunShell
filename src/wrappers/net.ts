/**
 * Network wrappers — structured replacements for fetch, ping, dig.
 *
 * @module
 */

import type { CapabilityContext, CapabilityKind, RequireCap } from "../capabilities/types";
import type { NetResponse, PingResult, WriteResult } from "./types";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

/**
 * Capability-checked HTTP fetch with structured response.
 *
 * @example
 * ```ts
 * const resp = await netFetch(ctx, "https://api.github.com/user");
 * console.log(resp.status, resp.body);
 * ```
 */
export async function netFetch<T = unknown>(
  ctx: CapabilityContext,
  url: string,
  options?: RequestInit,
): Promise<NetResponse<T>> {
  const parsed = new URL(url);
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === "https:"
      ? 443
      : 80;

  ctx.caps.demand({
    kind: "net:fetch",
    allowedDomains: [parsed.hostname],
    allowedPorts: [port],
  });
  ctx.audit.log("net:fetch", {
    op: "fetch",
    url,
    method: options?.method ?? "GET",
  });

  const start = performance.now();
  const response = await fetch(url, options);
  const duration = performance.now() - start;

  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const contentType = response.headers.get("content-type") ?? "";
  let body: T;
  if (contentType.includes("application/json")) {
    body = (await response.json()) as T;
  } else {
    body = (await response.text()) as T;
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    body,
    url: response.url,
    duration,
  };
}

// ---------------------------------------------------------------------------
// ping
// ---------------------------------------------------------------------------

/**
 * Ping a host and return structured result.
 * Requires process:spawn for "ping".
 *
 * @example
 * ```ts
 * const result = await ping(ctx, "google.com");
 * if (result.alive) console.log(`${result.time}ms`);
 * ```
 */
export async function ping<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  host: string,
): Promise<PingResult> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: ["ping"] });
  ctx.audit.log("process:spawn", { op: "ping", host });

  const proc = Bun.spawn(["ping", "-c", "1", "-W", "3", host], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return { host, alive: false, time: null };
  }

  const timeMatch = stdout.match(/time=(\d+\.?\d*)\s*ms/);
  const time = timeMatch ? parseFloat(timeMatch[1]!) : null;

  return { host, alive: true, time };
}

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

/** Result of a DNS lookup. */
export interface DnsRecord {
  readonly name: string;
  readonly type: string;
  readonly value: string;
  readonly ttl: number;
}

/**
 * Download a URL to a local file.
 * Requires net:fetch for the domain and fs:write for the destination.
 *
 * @example
 * ```ts
 * const result = await download(ctx, "https://example.com/data.json", "/tmp/data.json");
 * console.log(result.bytesWritten);
 * ```
 */
export async function download<K extends CapabilityKind>(
  ctx: RequireCap<K, "net:fetch" | "fs:write">,
  url: string,
  dest: string,
): Promise<WriteResult> {
  const parsed = new URL(url);
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === "https:"
      ? 443
      : 80;

  ctx.caps.demand({
    kind: "net:fetch",
    allowedDomains: [parsed.hostname],
    allowedPorts: [port],
  });

  const absDest = resolve(dest);
  ctx.caps.demand({ kind: "fs:write", pattern: absDest });
  ctx.audit.log("net:fetch", { op: "download", url, dest: absDest });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const bytesWritten = await Bun.write(absDest, bytes);
  return { bytesWritten, path: absDest };
}

// ---------------------------------------------------------------------------
// dig — DNS lookup
// ---------------------------------------------------------------------------

/**
 * DNS lookup using the dig command.
 * Requires process:spawn for "dig".
 *
 * @example
 * ```ts
 * const records = await dig(ctx, "example.com", "A");
 * ```
 */
export async function dig<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  domain: string,
  type: string = "A",
): Promise<DnsRecord[]> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: ["dig"] });
  ctx.audit.log("process:spawn", { op: "dig", domain, type });

  const proc = Bun.spawn(["dig", "+short", "+ttlid", type, domain], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  return stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => ({
      name: domain,
      type,
      value: line.trim(),
      ttl: 0,
    }));
}
