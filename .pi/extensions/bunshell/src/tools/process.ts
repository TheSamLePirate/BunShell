/**
 * bunshell_process — process operations backed by BunShell wrappers.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { LoadedEnvironment } from "../../../../../src/config/loader";
import { CapabilityError } from "../../../../../src/capabilities/types";
import { ps, kill, spawn, exec } from "../../../../../src/wrappers/process";

const ProcessActions = Type.Union([
  Type.Literal("spawn"),
  Type.Literal("exec"),
  Type.Literal("ps"),
  Type.Literal("kill"),
]);

export const BunShellProcessParams = Type.Object({
  action: ProcessActions,
  command: Type.Optional(Type.String({ description: "Command to run" })),
  args: Type.Optional(
    Type.Array(Type.String(), { description: "Command arguments" }),
  ),
  pid: Type.Optional(Type.Number({ description: "Process ID (for kill)" })),
  signal: Type.Optional(
    Type.String({ description: "Signal (for kill, default SIGTERM)" }),
  ),
  cwd: Type.Optional(Type.String({ description: "Working directory" })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in ms" })),
});

type ProcessParams = Static<typeof BunShellProcessParams>;

export function createProcessTool(env: LoadedEnvironment) {
  return {
    name: "bunshell_process",
    label: "BunShell Process",
    description:
      "Run commands and manage processes. Actions: spawn (full result), exec (stdout only), ps (list), kill. All capability-checked against process:spawn.",
    promptSnippet:
      "Use bunshell_process to run commands. Returns SpawnResult with exitCode, stdout, stderr.",
    promptGuidelines: [
      "Use action:'exec' for simple commands that return stdout",
      "Use action:'spawn' when you need exitCode, stderr, and duration",
      "Use action:'ps' to list running processes",
      "The 'command' field is the binary name, 'args' is the argument array",
    ],
    parameters: BunShellProcessParams,

    async execute(_toolCallId: string, params: ProcessParams) {
      try {
        const ctx = env.ctx;
         
        let result: unknown;

        switch (params.action) {
          case "spawn": {
            if (!params.command) throw new Error("spawn requires 'command'");
            const opts: Record<string, unknown> = {};
            if (params.cwd) opts["cwd"] = params.cwd;
            if (params.timeout) opts["timeout"] = params.timeout;
            result = await spawn(
              ctx as never,
              params.command,
              params.args ?? [],
              Object.keys(opts).length > 0 ? opts : undefined,
            );
            break;
          }
          case "exec": {
            if (!params.command) throw new Error("exec requires 'command'");
            result = await exec(
              ctx as never,
              params.command,
              params.args ?? [],
            );
            break;
          }
          case "ps":
            result = await ps(ctx);
            break;
          case "kill": {
            if (!params.pid) throw new Error("kill requires 'pid'");
            result = await kill(ctx as never, params.pid, params.signal);
            break;
          }
          default:
            throw new Error(`Unknown process action: ${params.action}`);
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
