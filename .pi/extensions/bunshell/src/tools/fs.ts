/**
 * bunshell_fs — filesystem operations backed by BunShell wrappers.
 *
 * Each action dispatches to a typed BunShell wrapper with full
 * capability enforcement. CapabilityError → tool error to LLM.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { LoadedEnvironment } from "../../../../../src/config/loader";
import { CapabilityError } from "../../../../../src/capabilities/types";
import {
  ls,
  cat,
  stat,
  exists,
  mkdir,
  write,
  readJson,
  writeJson,
  rm,
  cp,
  mv,
  find,
  globFiles,
  append,
  du,
} from "../../../../../src/wrappers/fs";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const FsActions = Type.Union([
  Type.Literal("ls"),
  Type.Literal("cat"),
  Type.Literal("write"),
  Type.Literal("mkdir"),
  Type.Literal("rm"),
  Type.Literal("cp"),
  Type.Literal("mv"),
  Type.Literal("find"),
  Type.Literal("stat"),
  Type.Literal("exists"),
  Type.Literal("glob"),
  Type.Literal("readJson"),
  Type.Literal("writeJson"),
  Type.Literal("append"),
  Type.Literal("du"),
]);

export const BunShellFsParams = Type.Object({
  action: FsActions,
  path: Type.Optional(Type.String({ description: "File or directory path" })),
  destination: Type.Optional(
    Type.String({ description: "Destination path (for cp, mv)" }),
  ),
  content: Type.Optional(Type.String({ description: "Content to write" })),
  data: Type.Optional(
    Type.Unknown({ description: "JSON data (for writeJson)" }),
  ),
  pattern: Type.Optional(
    Type.String({ description: "Glob pattern (for find, glob)" }),
  ),
  recursive: Type.Optional(
    Type.Boolean({ description: "Recursive operation (for ls, rm)" }),
  ),
});

type FsParams = Static<typeof BunShellFsParams>;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export function createFsTool(env: LoadedEnvironment) {
  return {
    name: "bunshell_fs",
    label: "BunShell FS",
    description: [
      "Filesystem operations with typed output and capability-checked permissions.",
      "Actions: ls, cat, write, mkdir, rm, cp, mv, find, stat, exists, glob, readJson, writeJson, append, du.",
      "Returns structured data (FileEntry[], string, WriteResult, etc.).",
      "Unauthorized operations return a clear error explaining the missing capability.",
    ].join(" "),
    promptSnippet:
      "Use bunshell_fs for all file operations. It returns typed objects, not raw text.",
    promptGuidelines: [
      "Use action:'ls' with path to list directory contents (returns FileEntry[])",
      "Use action:'cat' to read file content (returns string)",
      "Use action:'write' with path+content to create/overwrite files",
      "Use action:'find' with path+pattern for glob-based file search",
      "Use action:'readJson' to parse JSON files directly",
      "If you get a CapabilityError, the .bunshell.ts config does not grant that permission — do NOT retry",
    ],
    parameters: BunShellFsParams,

    async execute(
      _toolCallId: string,
      params: FsParams,
      _signal: AbortSignal | undefined,
    ) {
      try {
        const ctx = env.ctx;
        const result = await dispatchFs(ctx, params);

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

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatchFs(ctx: any, params: FsParams): Promise<unknown> {
  const p = params.path ?? ".";

  switch (params.action) {
    case "ls":
      return ls(ctx, p, params.recursive ? { recursive: true } : undefined);

    case "cat":
      return cat(ctx, p);

    case "write": {
      if (!params.content)
        throw new Error("write requires 'content' parameter");
      return write(ctx, p, params.content);
    }

    case "mkdir":
      return mkdir(ctx, p);

    case "rm":
      return rm(ctx, p, params.recursive ? { recursive: true } : undefined);

    case "cp": {
      if (!params.destination)
        throw new Error("cp requires 'destination' parameter");
      return cp(ctx, p, params.destination);
    }

    case "mv": {
      if (!params.destination)
        throw new Error("mv requires 'destination' parameter");
      return mv(ctx, p, params.destination);
    }

    case "find": {
      if (!params.pattern) throw new Error("find requires 'pattern' parameter");
      return find(ctx, p, params.pattern);
    }

    case "stat":
      return stat(ctx, p);

    case "exists":
      return exists(ctx, p);

    case "glob": {
      if (!params.pattern) throw new Error("glob requires 'pattern' parameter");
      return globFiles(ctx, params.pattern, p);
    }

    case "readJson":
      return readJson(ctx, p);

    case "writeJson": {
      if (params.data === undefined)
        throw new Error("writeJson requires 'data' parameter");
      return writeJson(ctx, p, params.data);
    }

    case "append": {
      if (!params.content)
        throw new Error("append requires 'content' parameter");
      return append(ctx, p, params.content);
    }

    case "du":
      return du(ctx, p);

    default:
      throw new Error(`Unknown fs action: ${params.action}`);
  }
}
