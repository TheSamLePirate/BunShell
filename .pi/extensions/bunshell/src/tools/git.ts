/**
 * bunshell_git — git operations backed by BunShell wrappers.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { LoadedEnvironment } from "../../../../../src/config/loader";
import { CapabilityError } from "../../../../../src/capabilities/types";
import {
  gitStatus,
  gitLog,
  gitDiff,
  gitBranch,
  gitAdd,
  gitCommit,
  gitPush,
  gitPull,
  gitClone,
  gitStash,
} from "../../../../../src/wrappers/git";

const GitActions = Type.Union([
  Type.Literal("status"),
  Type.Literal("log"),
  Type.Literal("diff"),
  Type.Literal("branch"),
  Type.Literal("add"),
  Type.Literal("commit"),
  Type.Literal("push"),
  Type.Literal("pull"),
  Type.Literal("clone"),
  Type.Literal("stash"),
]);

export const BunShellGitParams = Type.Object({
  action: GitActions,
  files: Type.Optional(
    Type.Array(Type.String(), { description: "Files to add" }),
  ),
  message: Type.Optional(Type.String({ description: "Commit message" })),
  branch: Type.Optional(Type.String({ description: "Branch name" })),
  remote: Type.Optional(
    Type.String({ description: "Remote name (default origin)" }),
  ),
  url: Type.Optional(
    Type.String({ description: "Repository URL (for clone)" }),
  ),
  destination: Type.Optional(Type.String({ description: "Clone destination" })),
  count: Type.Optional(Type.Number({ description: "Number of log entries" })),
  stashAction: Type.Optional(
    Type.Union(
      [
        Type.Literal("push"),
        Type.Literal("pop"),
        Type.Literal("list"),
        Type.Literal("drop"),
      ],
      { description: "Stash sub-action" },
    ),
  ),
});

type GitParams = Static<typeof BunShellGitParams>;

export function createGitTool(env: LoadedEnvironment) {
  return {
    name: "bunshell_git",
    label: "BunShell Git",
    description:
      "Git operations with typed output. Actions: status, log, diff, branch, add, commit, push, pull, clone, stash. Returns GitStatus, GitCommit[], GitDiffEntry[], etc.",
    promptSnippet:
      "Use bunshell_git for version control. Returns structured data like GitStatus, GitCommit[].",
    promptGuidelines: [
      "Use action:'status' to see working tree state (returns GitStatus with staged/unstaged/untracked)",
      "Use action:'log' with count to see recent commits",
      "Use action:'diff' to see current changes",
      "Use action:'add' with files array, then action:'commit' with message",
    ],
    parameters: BunShellGitParams,

    async execute(_toolCallId: string, params: GitParams) {
      try {
        const ctx = env.ctx;
        let result: unknown;

        switch (params.action) {
          case "status":
            result = await gitStatus(ctx as never);
            break;
          case "log": {
            const opts: Record<string, unknown> = {};
            if (params.count) opts["limit"] = params.count;
            result = await gitLog(
              ctx as never,
              Object.keys(opts).length > 0 ? opts : undefined,
            );
            break;
          }
          case "diff":
            result = await gitDiff(ctx as never);
            break;
          case "branch":
            result = await gitBranch(ctx as never);
            break;
          case "add":
            if (!params.files) throw new Error("add requires 'files'");
            result = await gitAdd(ctx as never, params.files);
            break;
          case "commit":
            if (!params.message) throw new Error("commit requires 'message'");
            result = await gitCommit(ctx as never, params.message);
            break;
          case "push":
            result = await gitPush(ctx as never, params.remote, params.branch);
            break;
          case "pull":
            result = await gitPull(ctx as never, params.remote, params.branch);
            break;
          case "clone":
            if (!params.url) throw new Error("clone requires 'url'");
            if (!params.destination)
              throw new Error("clone requires 'destination'");
            result = await gitClone(
              ctx as never,
              params.url,
              params.destination,
            );
            break;
          case "stash":
            result = await gitStash(ctx as never, params.stashAction);
            break;
          default:
            throw new Error(`Unknown git action: ${params.action}`);
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
