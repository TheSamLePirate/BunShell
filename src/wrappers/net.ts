/**
 * Network wrappers — structured replacements for fetch, ping, dig.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import type { NetResponse, PingResult } from "./types";

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
export async function ping(
  ctx: CapabilityContext,
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
