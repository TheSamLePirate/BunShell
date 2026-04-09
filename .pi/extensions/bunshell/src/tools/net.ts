/**
 * bunshell_net — network operations backed by BunShell wrappers.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { LoadedEnvironment } from "../../../../../src/config/loader";
import { CapabilityError } from "../../../../../src/capabilities/types";
import { netFetch, ping, download, dig } from "../../../../../src/wrappers/net";

const NetActions = Type.Union([
  Type.Literal("fetch"),
  Type.Literal("download"),
  Type.Literal("ping"),
  Type.Literal("dig"),
]);

export const BunShellNetParams = Type.Object({
  action: NetActions,
  url: Type.Optional(Type.String({ description: "URL (for fetch, download)" })),
  method: Type.Optional(
    Type.Union(
      [
        Type.Literal("GET"),
        Type.Literal("POST"),
        Type.Literal("PUT"),
        Type.Literal("DELETE"),
        Type.Literal("PATCH"),
      ],
      { description: "HTTP method (default GET)" },
    ),
  ),
  headers: Type.Optional(
    Type.Record(Type.String(), Type.String(), { description: "HTTP headers" }),
  ),
  body: Type.Optional(Type.String({ description: "Request body" })),
  destination: Type.Optional(
    Type.String({ description: "Local path (for download)" }),
  ),
  host: Type.Optional(Type.String({ description: "Hostname (for ping, dig)" })),
  recordType: Type.Optional(
    Type.String({ description: "DNS record type (for dig)" }),
  ),
});

type NetParams = Static<typeof BunShellNetParams>;

export function createNetTool(env: LoadedEnvironment) {
  return {
    name: "bunshell_net",
    label: "BunShell Net",
    description:
      "HTTP requests, DNS lookups, and connectivity checks. Actions: fetch, download, ping, dig. Capability-checked against net:fetch domain list.",
    promptSnippet:
      "Use bunshell_net for HTTP requests. Returns NetResponse with status, headers, body.",
    promptGuidelines: [
      "Use action:'fetch' with url for HTTP requests — returns structured NetResponse",
      "Use action:'download' with url+destination to save files from the web",
      "Use action:'ping' with host to check connectivity",
      "Only domains listed in net:fetch capability are allowed",
    ],
    parameters: BunShellNetParams,

    async execute(_toolCallId: string, params: NetParams) {
      try {
        const ctx = env.ctx;
        let result: unknown;

        switch (params.action) {
          case "fetch": {
            if (!params.url) throw new Error("fetch requires 'url'");
            const init: Record<string, unknown> = {};
            if (params.method) init["method"] = params.method;
            if (params.headers) init["headers"] = params.headers;
            if (params.body) init["body"] = params.body;
            result = await netFetch(
              ctx as never,
              params.url,
              Object.keys(init).length > 0 ? init : undefined,
            );
            break;
          }
          case "download": {
            if (!params.url) throw new Error("download requires 'url'");
            if (!params.destination)
              throw new Error("download requires 'destination'");
            result = await download(
              ctx as never,
              params.url,
              params.destination,
            );
            break;
          }
          case "ping": {
            if (!params.host) throw new Error("ping requires 'host'");
            result = await ping(ctx as never, params.host);
            break;
          }
          case "dig": {
            if (!params.host) throw new Error("dig requires 'host'");
            result = await dig(ctx as never, params.host, params.recordType);
            break;
          }
          default:
            throw new Error(`Unknown net action: ${params.action}`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
          details: { action: params.action },
        };
      } catch (err) {
        if (err instanceof CapabilityError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Permission denied: ${err.message}`,
              },
            ],
            details: { action: params.action, denied: true },
            isError: true,
          };
        }
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { action: params.action },
          isError: true,
        };
      }
    },
  };
}
