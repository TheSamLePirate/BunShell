/**
 * bunshell_docker — Docker Compute Plane operations.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { LoadedEnvironment } from "../../../../../src/config/loader";
import { CapabilityError } from "../../../../../src/capabilities/types";
import {
  dockerRun,
  dockerExec,
  dockerBuild,
  dockerPull,
  dockerImages,
  dockerPs,
  dockerStop,
  dockerRm,
  dockerLogs,
} from "../../../../../src/wrappers/docker";

const DockerActions = Type.Union([
  Type.Literal("run"),
  Type.Literal("exec_script"),
  Type.Literal("build"),
  Type.Literal("pull"),
  Type.Literal("images"),
  Type.Literal("ps"),
  Type.Literal("stop"),
  Type.Literal("rm"),
  Type.Literal("logs"),
]);

export const BunShellDockerParams = Type.Object({
  action: DockerActions,
  image: Type.Optional(Type.String({ description: "Docker image name" })),
  command: Type.Optional(
    Type.Array(Type.String(), { description: "Command to run in container" }),
  ),
  script: Type.Optional(
    Type.String({ description: "Script to execute (for exec_script)" }),
  ),
  env: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "Environment variables",
    }),
  ),
  ports: Type.Optional(
    Type.Array(Type.String(), {
      description: "Port mappings (host:container)",
    }),
  ),
  containerId: Type.Optional(Type.String({ description: "Container ID" })),
  context: Type.Optional(Type.String({ description: "Build context path" })),
  tag: Type.Optional(Type.String({ description: "Image tag (for build)" })),
  memory: Type.Optional(
    Type.String({ description: "Memory limit (e.g. 512m)" }),
  ),
  network: Type.Optional(Type.String({ description: "Network mode" })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in ms" })),
  tail: Type.Optional(Type.Number({ description: "Number of log lines" })),
});

type DockerParams = Static<typeof BunShellDockerParams>;

export function createDockerTool(env: LoadedEnvironment) {
  return {
    name: "bunshell_docker",
    label: "BunShell Docker",
    description:
      "Docker Compute Plane — run containers, build images, manage lifecycle. Actions: run, exec_script, build, pull, images, ps, stop, rm, logs. Capability-checked against docker:run image list.",
    promptSnippet:
      "Use bunshell_docker for container operations. Returns DockerRunResult with exitCode, stdout, stderr.",
    promptGuidelines: [
      "Use action:'run' with image+command to run a container",
      "Use action:'exec_script' with image+script to run inline scripts (any language)",
      "Use action:'build' with context+tag to build from Dockerfile",
      "Only images allowed by docker:run capability can be used",
    ],
    parameters: BunShellDockerParams,

    async execute(_toolCallId: string, params: DockerParams) {
      try {
        const ctx = env.ctx;
        let result: unknown;

        switch (params.action) {
          case "run": {
            if (!params.image) throw new Error("run requires 'image'");
            const opts: Record<string, unknown> = {};
            if (params.command) opts["command"] = params.command;
            if (params.env) opts["env"] = params.env;
            if (params.ports) opts["ports"] = params.ports;
            if (params.memory) opts["memory"] = params.memory;
            if (params.network) opts["network"] = params.network;
            if (params.timeout) opts["timeout"] = params.timeout;
            result = await dockerRun(ctx as never, params.image, opts);
            break;
          }
          case "exec_script": {
            if (!params.image) throw new Error("exec_script requires 'image'");
            if (!params.script)
              throw new Error("exec_script requires 'script'");
            result = await dockerExec(
              ctx as never,
              params.image,
              params.script,
            );
            break;
          }
          case "build": {
            if (!params.context) throw new Error("build requires 'context'");
            if (!params.tag) throw new Error("build requires 'tag'");
            result = await dockerBuild(
              ctx as never,
              params.context,
              params.tag,
            );
            break;
          }
          case "pull": {
            if (!params.image) throw new Error("pull requires 'image'");
            result = await dockerPull(ctx as never, params.image);
            break;
          }
          case "images":
            result = await dockerImages(ctx as never);
            break;
          case "ps":
            result = await dockerPs(ctx as never);
            break;
          case "stop": {
            if (!params.containerId)
              throw new Error("stop requires 'containerId'");
            result = await dockerStop(ctx as never, params.containerId);
            break;
          }
          case "rm": {
            if (!params.containerId)
              throw new Error("rm requires 'containerId'");
            result = await dockerRm(ctx as never, params.containerId);
            break;
          }
          case "logs": {
            if (!params.containerId)
              throw new Error("logs requires 'containerId'");
            const logOpts: Record<string, unknown> = {};
            if (params.tail) logOpts["tail"] = params.tail;
            result = await dockerLogs(
              ctx as never,
              params.containerId,
              logOpts,
            );
            break;
          }
          default:
            throw new Error(`Unknown docker action: ${params.action}`);
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
