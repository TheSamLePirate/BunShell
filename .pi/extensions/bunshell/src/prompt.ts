/**
 * System prompt injection — tells the LLM about BunShell capabilities.
 */

import { getEnv } from "./bootstrap";

/**
 * Build the BunShell context block to inject into the system prompt.
 */
export function buildPromptInjection(): string | null {
  const env = getEnv();
  if (!env) return null;

  const caps = env.ctx.caps;
  const sections: string[] = [];

  sections.push("## BunShell Environment");
  sections.push(`Agent: ${env.name}`);
  sections.push("");

  // List active capabilities
  const activeCaps: string[] = [];
  if (caps.has("fs:read")) activeCaps.push("fs:read");
  if (caps.has("fs:write")) activeCaps.push("fs:write");
  if (caps.has("fs:delete")) activeCaps.push("fs:delete");
  if (caps.has("process:spawn")) activeCaps.push("process:spawn");
  if (caps.has("net:fetch")) activeCaps.push("net:fetch");
  if (caps.has("env:read")) activeCaps.push("env:read");
  if (caps.has("db:query")) activeCaps.push("db:query");
  if (caps.has("docker:run")) activeCaps.push("docker:run");
  if (caps.has("secret:read")) activeCaps.push("secret:read");

  sections.push(`Capabilities: ${activeCaps.join(", ")}`);
  sections.push("");

  // List available tools and their actions
  sections.push("Available BunShell tools:");
  if (caps.has("fs:read") || caps.has("fs:write") || caps.has("fs:delete")) {
    sections.push(
      "- bunshell_fs: ls, cat, write, mkdir, rm, cp, mv, find, stat, exists, glob, readJson, writeJson, append, du",
    );
  }
  if (caps.has("process:spawn")) {
    sections.push("- bunshell_process: spawn, exec, ps, kill");
    sections.push(
      "- bunshell_git: status, log, diff, branch, add, commit, push, pull, clone, stash",
    );
  }
  if (caps.has("net:fetch")) {
    sections.push("- bunshell_net: fetch, download, ping, dig");
  }
  if (caps.has("docker:run")) {
    sections.push(
      "- bunshell_docker: run, exec_script, build, pull, images, ps, stop, rm, logs",
    );
  }
  sections.push(
    "- bunshell_data: parseJSON, formatJSON, parseCSV, hash, base64Encode, base64Decode, randomUUID",
  );
  sections.push("");
  sections.push(
    "All operations are capability-checked. If you attempt an unauthorized action, " +
      "you will receive a clear CapabilityError explaining the missing permission. " +
      "Do NOT retry denied operations — the .bunshell.ts config controls what is allowed.",
  );

  return sections.join("\n");
}
