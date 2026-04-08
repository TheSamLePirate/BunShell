/**
 * OS integration wrappers — desktop interaction with capability checks.
 *
 * Requires os:interact capability.
 *
 * @module
 */

import type { CapabilityContext, CapabilityKind, RequireCap } from "../capabilities/types";

// ---------------------------------------------------------------------------
// openUrl
// ---------------------------------------------------------------------------

/**
 * Open a URL in the default browser.
 *
 * @example
 * ```ts
 * await openUrl(ctx, "https://example.com");
 * ```
 */
export async function openUrl<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  url: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "openUrl", url });

  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  const proc = Bun.spawn([cmd, url], { stdout: "pipe", stderr: "pipe" });
  await proc.exited;
}

// ---------------------------------------------------------------------------
// openFile
// ---------------------------------------------------------------------------

/**
 * Open a file in its default application.
 *
 * @example
 * ```ts
 * await openFile(ctx, "/tmp/report.pdf");
 * ```
 */
export async function openFile<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact" | "fs:read">,
  path: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.caps.demand({ kind: "fs:read", pattern: path });
  ctx.audit.log("os:interact", { op: "openFile", path });

  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  const proc = Bun.spawn([cmd, path], { stdout: "pipe", stderr: "pipe" });
  await proc.exited;
}

// ---------------------------------------------------------------------------
// notify
// ---------------------------------------------------------------------------

/**
 * Send a desktop notification.
 * Uses osascript on macOS, notify-send on Linux.
 *
 * @example
 * ```ts
 * await notify(ctx, "Build Complete", "All tests passed.");
 * ```
 */
export async function notify<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  title: string,
  body: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "notify", title, body });

  if (process.platform === "darwin") {
    const script = `display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
    const proc = Bun.spawn(["osascript", "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
  } else {
    const proc = Bun.spawn(["notify-send", title, body], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
  }
}

// ---------------------------------------------------------------------------
// clipboard
// ---------------------------------------------------------------------------

/** Clipboard read/write handle. */
export interface ClipboardHandle {
  /** Read the current clipboard contents. */
  read(): Promise<string>;
  /** Write text to the clipboard. */
  write(text: string): Promise<void>;
}

/**
 * Access the system clipboard.
 *
 * @example
 * ```ts
 * const clip = clipboard(ctx);
 * await clip.write("hello");
 * const text = await clip.read();
 * ```
 */
export function clipboard(ctx: CapabilityContext): ClipboardHandle {
  ctx.caps.demand({ kind: "os:interact" });

  return {
    async read(): Promise<string> {
      ctx.audit.log("os:interact", { op: "clipboard:read" });
      const cmd =
        process.platform === "darwin"
          ? ["pbpaste"]
          : ["xclip", "-o", "-selection", "clipboard"];
      const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
      const text = await new Response(proc.stdout).text();
      await proc.exited;
      return text;
    },

    async write(text: string): Promise<void> {
      ctx.audit.log("os:interact", { op: "clipboard:write" });
      const cmd =
        process.platform === "darwin"
          ? ["pbcopy"]
          : ["xclip", "-i", "-selection", "clipboard"];
      const proc = Bun.spawn(cmd, {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      proc.stdin.write(text);
      proc.stdin.end();
      await proc.exited;
    },
  };
}
