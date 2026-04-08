/**
 * Command executor — runs parsed commands through BunShell wrappers.
 *
 * Handles both standalone commands and pipe chains.
 *
 * @module
 */

import type { CapabilityContext } from "../capabilities/types";
import type { FullAuditLogger } from "../audit/logger";
import type { ParsedCommand, ParsedPipeline } from "./parser";
import { COMMANDS, findCommand, type CommandDef } from "./commands";

// Wrappers
import * as fs from "../wrappers/fs";
import * as proc from "../wrappers/process";
import * as net from "../wrappers/net";
import * as envW from "../wrappers/env";
import * as text from "../wrappers/text";
import * as sys from "../wrappers/system";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ExecutorState {
  ctx: CapabilityContext;
  audit: FullAuditLogger;
  cwd: string;
  setCwd: (path: string) => void;
}

export type CommandResult =
  | { kind: "data"; value: any }
  | { kind: "text"; value: string }
  | { kind: "exit" }
  | { kind: "clear" }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Pipe operators
// ---------------------------------------------------------------------------

function applyPipeOperator(cmd: ParsedCommand, data: any): any {
  switch (cmd.command) {
    case "filter": {
      if (!Array.isArray(data)) return data;
      const expr = cmd.args[0] ?? "";
      // Parse expressions like: size>1000, extension=ts, isDirectory=true, name~pattern
      const match = expr.match(/^(\w+)(=|!=|>|<|>=|<=|~)(.+)$/);
      if (!match) return data;
      const [, field, op, val] = match;
      return data.filter((item: any) => {
        const v = item[field!];
        switch (op) {
          case "=":
            return String(v) === val;
          case "!=":
            return String(v) !== val;
          case ">":
            return Number(v) > Number(val);
          case "<":
            return Number(v) < Number(val);
          case ">=":
            return Number(v) >= Number(val);
          case "<=":
            return Number(v) <= Number(val);
          case "~":
            return String(v).includes(val!);
          default:
            return true;
        }
      });
    }
    case "sortby": {
      if (!Array.isArray(data)) return data;
      const key = cmd.args[0] ?? "name";
      const order = cmd.args[1] === "desc" ? -1 : 1;
      return [...data].sort((a: any, b: any) => {
        const av = a[key];
        const bv = b[key];
        if (typeof av === "number" && typeof bv === "number")
          return (av - bv) * order;
        return String(av).localeCompare(String(bv)) * order;
      });
    }
    case "take": {
      if (!Array.isArray(data)) return data;
      return data.slice(0, parseInt(cmd.args[0] ?? "10", 10));
    }
    case "skip": {
      if (!Array.isArray(data)) return data;
      return data.slice(parseInt(cmd.args[0] ?? "0", 10));
    }
    case "count": {
      if (Array.isArray(data)) return data.length;
      if (typeof data === "string") return data.split("\n").length;
      return 0;
    }
    case "pluck": {
      if (!Array.isArray(data)) return data;
      const field = cmd.args[0] ?? "name";
      return data.map((item: any) => item[field]);
    }
    case "uniq": {
      if (!Array.isArray(data)) return data;
      const field = cmd.args[0];
      if (field) {
        const seen = new Set();
        return data.filter((item: any) => {
          const v = item[field];
          if (seen.has(v)) return false;
          seen.add(v);
          return true;
        });
      }
      return [...new Set(data)];
    }
    case "first":
      return Array.isArray(data) ? data[0] : data;
    case "last":
      return Array.isArray(data) ? data[data.length - 1] : data;
    case "tojson":
      return JSON.stringify(data, null, 2);
    default:
      return data;
  }
}

// ---------------------------------------------------------------------------
// Primary command execution
// ---------------------------------------------------------------------------

async function executeCommand(
  cmd: ParsedCommand,
  state: ExecutorState,
): Promise<CommandResult> {
  const { ctx } = state;
  const { command, args, flags } = cmd;

  switch (command) {
    // --- Shell builtins ---
    case "exit":
    case "quit":
      return { kind: "exit" };
    case "clear":
      return { kind: "clear" };
    case "pwd":
      return { kind: "text", value: state.cwd };
    case "cd": {
      const target = args[0] ?? process.env["HOME"] ?? "/";
      const { resolve } = await import("node:path");
      const absPath = resolve(state.cwd, target);
      try {
        const { statSync } = await import("node:fs");
        const s = statSync(absPath);
        if (!s.isDirectory())
          return { kind: "error", message: `Not a directory: ${absPath}` };
        state.setCwd(absPath);
        process.chdir(absPath);
        return { kind: "text", value: absPath };
      } catch {
        return { kind: "error", message: `No such directory: ${absPath}` };
      }
    }
    case "caps":
      return {
        kind: "data",
        value: ctx.caps.capabilities.map((c) => {
          if ("pattern" in c) return `${c.kind}: ${c.pattern}`;
          if ("allowedBinaries" in c)
            return `${c.kind}: [${c.allowedBinaries.join(", ")}]`;
          if ("allowedDomains" in c)
            return `${c.kind}: [${c.allowedDomains.join(", ")}]`;
          if ("allowedKeys" in c)
            return `${c.kind}: [${c.allowedKeys.join(", ")}]`;
          if ("port" in c) return `${c.kind}: ${c.port}`;
          return (c as { kind: string }).kind;
        }),
      };
    case "audit": {
      const n = parseInt(args[0] ?? "20", 10);
      const q: Record<string, unknown> = { limit: n };
      if (flags["capability"]) q["capability"] = flags["capability"];
      if (flags["result"]) q["result"] = flags["result"];
      const entries = state.audit.query(q as any);
      return {
        kind: "data",
        value: entries.map(
          (e) =>
            `${e.timestamp.toISOString().slice(11, 23)} [${e.result.toUpperCase().padEnd(7)}] ${e.capability}:${e.operation}`,
        ),
      };
    }
    case "help": {
      if (args[0]) {
        const def = findCommand(args[0]);
        if (!def)
          return { kind: "error", message: `Unknown command: ${args[0]}` };
        const lines = [`\x1b[1m${def.name}\x1b[0m — ${def.description}`, ""];
        if (def.args.length > 0) {
          lines.push("Arguments:");
          for (const a of def.args) {
            lines.push(
              `  ${a.name.padEnd(12)} ${a.required ? "(required)" : "(optional)"}  ${a.description}`,
            );
          }
        }
        if (def.flags.length > 0) {
          lines.push("Flags:");
          for (const f of def.flags) {
            const short = f.short ? `-${f.short}, ` : "    ";
            lines.push(
              `  ${short}--${f.name.padEnd(14)} ${f.description}${f.values ? ` [${f.values.join("|")}]` : ""}`,
            );
          }
        }
        return { kind: "text", value: lines.join("\n") };
      }
      // Group by category
      const categories = new Map<string, CommandDef[]>();
      for (const c of COMMANDS) {
        const cat = c.category;
        if (!categories.has(cat)) categories.set(cat, []);
        categories.get(cat)!.push(c);
      }
      const lines: string[] = ["\x1b[1mBunShell Commands\x1b[0m\n"];
      for (const [cat, cmds] of categories) {
        lines.push(`\x1b[33m${cat.toUpperCase()}\x1b[0m`);
        for (const c of cmds) {
          const aliases = c.aliases
            ? ` \x1b[2m(${c.aliases.join(", ")})\x1b[0m`
            : "";
          lines.push(`  ${c.name.padEnd(12)}${aliases} ${c.description}`);
        }
        lines.push("");
      }
      lines.push(
        "Use \x1b[1mhelp <command>\x1b[0m for details. Tab for autocompletion.",
      );
      lines.push(
        "Pipe with \x1b[1m|\x1b[0m: ls src | filter extension=ts | sortby size desc | head 5",
      );
      return { kind: "text", value: lines.join("\n") };
    }

    // --- Filesystem ---
    case "ls": {
      const path = args[0] ?? ".";
      const options: Record<string, unknown> = {
        recursive: flags["recursive"] === true || flags["r"] === true,
        hidden: flags["hidden"] === true || flags["a"] === true,
      };
      const globVal =
        typeof flags["glob"] === "string"
          ? flags["glob"]
          : typeof flags["g"] === "string"
            ? flags["g"]
            : null;
      if (globVal) options["glob"] = globVal;
      if (typeof flags["sort"] === "string") options["sortBy"] = flags["sort"];
      if (flags["desc"] === true) options["order"] = "desc";
      return {
        kind: "data",
        value: await fs.ls(ctx, path, options as fs.LsOptions),
      };
    }
    case "cat":
      if (!args[0]) return { kind: "error", message: "Usage: cat <path>" };
      return { kind: "text", value: await fs.cat(ctx, args[0]) };
    case "stat":
      if (!args[0]) return { kind: "error", message: "Usage: stat <path>" };
      return { kind: "data", value: await fs.stat(ctx, args[0]) };
    case "exists":
      if (!args[0]) return { kind: "error", message: "Usage: exists <path>" };
      return { kind: "data", value: await fs.exists(ctx, args[0]) };
    case "find":
      if (!args[0] || !args[1])
        return { kind: "error", message: "Usage: find <path> <pattern>" };
      return { kind: "data", value: await fs.find(ctx, args[0], args[1]) };
    case "du":
      return { kind: "data", value: await fs.du(ctx, args[0] ?? ".") };
    case "mkdir":
      if (!args[0]) return { kind: "error", message: "Usage: mkdir <path>" };
      await fs.mkdir(ctx, args[0]);
      return { kind: "text", value: `Created: ${args[0]}` };
    case "write":
      if (!args[0] || !args[1])
        return { kind: "error", message: "Usage: write <path> <content>" };
      return {
        kind: "data",
        value: await fs.write(ctx, args[0], args.slice(1).join(" ")),
      };
    case "rm":
      if (!args[0]) return { kind: "error", message: "Usage: rm <path>" };
      await fs.rm(ctx, args[0], {
        recursive: flags["recursive"] === true || flags["r"] === true,
      });
      return { kind: "text", value: `Removed: ${args[0]}` };
    case "cp":
      if (!args[0] || !args[1])
        return { kind: "error", message: "Usage: cp <src> <dest>" };
      await fs.cp(ctx, args[0], args[1]);
      return { kind: "text", value: `Copied: ${args[0]} → ${args[1]}` };
    case "mv":
      if (!args[0] || !args[1])
        return { kind: "error", message: "Usage: mv <src> <dest>" };
      await fs.mv(ctx, args[0], args[1]);
      return { kind: "text", value: `Moved: ${args[0]} → ${args[1]}` };

    // --- Text ---
    case "grep": {
      if (!args[0] || !args[1])
        return { kind: "error", message: "Usage: grep <pattern> <path>" };
      const grepOpts: Record<string, unknown> = {
        ignoreCase: flags["ignore-case"] === true || flags["i"] === true,
        invert: flags["invert"] === true || flags["v"] === true,
      };
      if (typeof flags["max"] === "string")
        grepOpts["maxMatches"] = parseInt(flags["max"], 10);
      const matches = await text.grep(
        ctx,
        args[0],
        args[1],
        grepOpts as Parameters<typeof text.grep>[3],
      );
      return { kind: "data", value: matches };
    }
    case "head": {
      if (!args[0]) return { kind: "error", message: "Usage: head <path> [n]" };
      const content = await fs.cat(ctx, args[0]);
      return {
        kind: "text",
        value: text.head(content, parseInt(args[1] ?? "10", 10)),
      };
    }
    case "tail": {
      if (!args[0]) return { kind: "error", message: "Usage: tail <path> [n]" };
      const content = await fs.cat(ctx, args[0]);
      return {
        kind: "text",
        value: text.tail(content, parseInt(args[1] ?? "10", 10)),
      };
    }
    case "wc": {
      if (!args[0]) return { kind: "error", message: "Usage: wc <path>" };
      const content = await fs.cat(ctx, args[0]);
      return { kind: "data", value: text.wc(content) };
    }

    // --- Process ---
    case "ps":
      return { kind: "data", value: await proc.ps(ctx) };
    case "kill": {
      if (!args[0])
        return { kind: "error", message: "Usage: kill <pid> [signal]" };
      const ok = await proc.kill(ctx, parseInt(args[0], 10), args[1]);
      return {
        kind: "text",
        value: ok ? "Signal sent" : "Failed to send signal",
      };
    }
    case "exec":
    case "run": {
      if (!args[0])
        return { kind: "error", message: "Usage: exec <command> [args...]" };
      const result = await proc.spawn(ctx, args[0], args.slice(1));
      return { kind: "data", value: result };
    }

    // --- Network ---
    case "fetch": {
      if (!args[0]) return { kind: "error", message: "Usage: fetch <url>" };
      const method =
        typeof flags["method"] === "string" ? flags["method"] : "GET";
      return {
        kind: "data",
        value: await net.netFetch(ctx, args[0], { method }),
      };
    }
    case "ping":
      if (!args[0]) return { kind: "error", message: "Usage: ping <host>" };
      return { kind: "data", value: await net.ping(ctx, args[0]) };

    // --- Env ---
    case "env": {
      let entries = envW.env(ctx);
      const filter =
        typeof flags["filter"] === "string"
          ? flags["filter"]
          : typeof flags["f"] === "string"
            ? flags["f"]
            : null;
      if (filter) {
        entries = entries.filter((e) =>
          e.key.toLowerCase().includes(filter.toLowerCase()),
        );
      }
      return { kind: "data", value: entries };
    }
    case "getenv":
      if (!args[0]) return { kind: "error", message: "Usage: getenv <key>" };
      return {
        kind: "text",
        value: envW.getEnv(ctx, args[0]) ?? "\x1b[2m(undefined)\x1b[0m",
      };
    case "setenv":
      if (!args[0] || !args[1])
        return { kind: "error", message: "Usage: setenv <key> <value>" };
      envW.setEnv(ctx, args[0], args[1]);
      return { kind: "text", value: `${args[0]}=${args[1]}` };

    // --- System ---
    case "uname":
      return { kind: "data", value: sys.uname(ctx) };
    case "uptime": {
      const secs = sys.uptime(ctx);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      return { kind: "text", value: `${h}h ${m}m` };
    }
    case "whoami":
      return { kind: "text", value: sys.whoami(ctx) };
    case "hostname":
      return { kind: "text", value: sys.hostname(ctx) };
    case "df":
      return { kind: "data", value: await sys.df(ctx) };

    default:
      return {
        kind: "error",
        message: `Unknown command: ${command}. Type 'help' for available commands.`,
      };
  }
}

// ---------------------------------------------------------------------------
// Pipeline execution
// ---------------------------------------------------------------------------

/**
 * Execute a full pipeline (commands separated by |).
 */
export async function executePipeline(
  pipeline: ParsedPipeline,
  state: ExecutorState,
): Promise<CommandResult> {
  if (pipeline.commands.length === 0) {
    return { kind: "text", value: "" };
  }

  // Execute the first command
  const firstCmd = pipeline.commands[0]!;
  const result = await executeCommand(firstCmd, state);

  if (
    result.kind === "exit" ||
    result.kind === "clear" ||
    result.kind === "error"
  ) {
    return result;
  }

  // Pipe through remaining stages
  let data = result.kind === "data" ? result.value : result.value;

  for (let i = 1; i < pipeline.commands.length; i++) {
    const cmd = pipeline.commands[i]!;

    // Check if it's a pipe operator
    const def = findCommand(cmd.command);
    if (def?.category === "pipe") {
      data = applyPipeOperator(cmd, data);
    } else if (cmd.command === "tojson" && cmd.args[0]) {
      const content = JSON.stringify(data, null, 2);
      await fs.write(state.ctx, cmd.args[0], content);
      return { kind: "text", value: `Written to ${cmd.args[0]}` };
    } else {
      return {
        kind: "error",
        message: `Cannot pipe into '${cmd.command}'. Use pipe operators: filter, sortby, take, skip, count, pluck, uniq, first, last`,
      };
    }
  }

  return { kind: "data", value: data };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
