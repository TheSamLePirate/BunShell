/**
 * BunShell extension for pi-coding-agent.
 *
 * Loads .bunshell.ts config on session start, registers capability-checked
 * tools for the LLM, injects BunShell context into the system prompt,
 * and displays status + audit in pi's UI.
 *
 * Drop a .bunshell.ts in your project → pi's LLM gets typed, capability-gated
 * access to filesystem, processes, network, Docker, git, and more.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { bootstrap, getEnv, teardown } from "./src/bootstrap";
import { buildPromptInjection } from "./src/prompt";
import { formatStatus, formatCapsList } from "./src/ui/status";
import { formatAuditWidget } from "./src/ui/audit";
import { createFsTool } from "./src/tools/fs";
import { createProcessTool } from "./src/tools/process";
import { createNetTool } from "./src/tools/net";
import { createGitTool } from "./src/tools/git";
import { createDataTool } from "./src/tools/data";
import { createDockerTool } from "./src/tools/docker";

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

let opCount = 0;

export default function bunshellExtension(pi: ExtensionAPI) {
  // -------------------------------------------------------------------
  // Session start — bootstrap BunShell from .bunshell.ts
  // -------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    opCount = 0;

    const env = await bootstrap(ctx.cwd);
    if (!env) {
      ctx.ui.setStatus("bunshell", "BunShell: no config");
      return;
    }

    // Register tools based on available capabilities
    const caps = env.ctx.caps;

    if (caps.has("fs:read") || caps.has("fs:write") || caps.has("fs:delete")) {
      pi.registerTool(
        createFsTool(env) as Parameters<typeof pi.registerTool>[0],
      );
    }

    if (caps.has("process:spawn")) {
      pi.registerTool(
        createProcessTool(env) as Parameters<typeof pi.registerTool>[0],
      );
      pi.registerTool(
        createGitTool(env) as Parameters<typeof pi.registerTool>[0],
      );
    }

    if (caps.has("net:fetch")) {
      pi.registerTool(
        createNetTool(env) as Parameters<typeof pi.registerTool>[0],
      );
    }

    if (caps.has("docker:run")) {
      pi.registerTool(
        createDockerTool(env) as Parameters<typeof pi.registerTool>[0],
      );
    }

    // Data tool always available (pure computation)
    pi.registerTool(
      createDataTool(env) as Parameters<typeof pi.registerTool>[0],
    );

    // Status bar
    ctx.ui.setStatus("bunshell", formatStatus(env, 0));

    // Capability widget
    ctx.ui.setWidget("bunshell-caps", formatCapsList(env), {
      placement: "belowEditor",
    });

    ctx.ui.notify(`BunShell loaded: ${env.name}`, "info");
  });

  // -------------------------------------------------------------------
  // System prompt injection — tell LLM about capabilities
  // -------------------------------------------------------------------

  pi.on("before_agent_start", async (event) => {
    const injection = buildPromptInjection();
    if (!injection) return;

    return {
      systemPrompt: event.systemPrompt + "\n\n" + injection,
    };
  });

  // -------------------------------------------------------------------
  // Tool execution tracking — update status + audit widget
  // -------------------------------------------------------------------

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!event.toolName.startsWith("bunshell_")) return;

    const env = getEnv();
    if (!env) return;

    ctx.ui.setStatus("bunshell", `● ${env.name} │ running...`);
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    const env = getEnv();
    if (!env) return;

    opCount++;
    ctx.ui.setStatus("bunshell", formatStatus(env, opCount));

    // Update audit widget
    ctx.ui.setWidget("bunshell-audit", formatAuditWidget(env.audit));
  });

  // -------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------

  pi.registerCommand("bunshell-caps", {
    description: "Show BunShell capabilities for this project",
    handler: async (_args, ctx) => {
      const env = getEnv();
      if (!env) {
        ctx.ui.notify("No .bunshell.ts config found", "error");
        return;
      }
      const lines = formatCapsList(env);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("bunshell-audit", {
    description: "Show BunShell audit trail",
    handler: async (_args, ctx) => {
      const env = getEnv();
      if (!env) {
        ctx.ui.notify("No .bunshell.ts config found", "error");
        return;
      }
      const lines = formatAuditWidget(env.audit, 20);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // -------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------

  pi.on("session_shutdown", async () => {
    await teardown();
    opCount = 0;
  });
}
