/**
 * cmux terminal multiplexer wrappers — typed access to workspaces,
 * panes, splits, browser automation, sidebar, and notifications.
 *
 * Requires os:interact capability. Calls the `cmux` CLI binary.
 *
 * @module
 */

import type { CapabilityKind, RequireCap } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CmuxWorkspace {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
  readonly active: boolean;
}

export interface CmuxWindow {
  readonly id: string;
  readonly active: boolean;
}

export interface CmuxSurface {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly paneId: string;
}

export interface CmuxPane {
  readonly id: string;
  readonly workspaceId: string;
  readonly surfaces: readonly CmuxSurface[];
}

export interface CmuxIdentity {
  readonly windowId: string;
  readonly workspaceId: string;
  readonly paneId: string;
  readonly surfaceId: string;
}

export interface CmuxNotification {
  readonly title: string;
  readonly body: string;
  readonly subtitle?: string;
}

export interface CmuxStatusPill {
  readonly key: string;
  readonly value: string;
  readonly icon?: string;
  readonly color?: string;
}

export interface CmuxLogEntry {
  readonly level: string;
  readonly message: string;
  readonly source?: string;
}

export interface CmuxScreenContent {
  readonly lines: readonly string[];
  readonly surfaceId: string;
}

export interface CmuxBrowserResult {
  readonly success: boolean;
  readonly data?: unknown;
}

// ---------------------------------------------------------------------------
// Internal helper — run cmux command and return parsed output
// ---------------------------------------------------------------------------

async function runCmux(
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["cmux", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

async function runCmuxJson<T>(args: readonly string[]): Promise<T> {
  const result = await runCmux([...args, "--json"]);
  if (result.exitCode !== 0) {
    throw new Error(
      `cmux ${args[0]} failed: ${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout) as T;
}

async function runCmuxText(args: readonly string[]): Promise<string> {
  const result = await runCmux(args);
  if (result.exitCode !== 0) {
    throw new Error(
      `cmux ${args[0]} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

async function runCmuxVoid(args: readonly string[]): Promise<void> {
  const result = await runCmux(args);
  if (result.exitCode !== 0) {
    throw new Error(
      `cmux ${args[0]} failed: ${result.stderr || result.stdout}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Check if running inside cmux.
 *
 * @example
 * ```ts
 * if (await cmuxDetect(ctx)) { ... }
 * ```
 */
export async function cmuxDetect<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<boolean> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxDetect" });
  try {
    const result = await runCmux(["ping"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get current cmux context (window, workspace, pane, surface IDs).
 */
export async function cmuxIdentify<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<CmuxIdentity> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxIdentify" });
  return runCmuxJson<CmuxIdentity>(["identify"]);
}

// ---------------------------------------------------------------------------
// Workspace management
// ---------------------------------------------------------------------------

/**
 * List all workspaces.
 */
export async function cmuxListWorkspaces<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<CmuxWorkspace[]> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxListWorkspaces" });
  return runCmuxJson<CmuxWorkspace[]>(["list-workspaces"]);
}

/**
 * Create a new workspace.
 */
export async function cmuxNewWorkspace<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  options?: { readonly cwd?: string; readonly command?: string },
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxNewWorkspace", ...options });
  const args = ["new-workspace"];
  if (options?.cwd) args.push("--cwd", options.cwd);
  if (options?.command) args.push("--command", options.command);
  return runCmuxText(args);
}

/**
 * Switch to a workspace.
 */
export async function cmuxSelectWorkspace<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  workspaceId: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxSelectWorkspace", workspaceId });
  await runCmuxVoid(["select-workspace", "--workspace", workspaceId]);
}

/**
 * Close a workspace.
 */
export async function cmuxCloseWorkspace<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  workspaceId: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxCloseWorkspace", workspaceId });
  await runCmuxVoid(["close-workspace", "--workspace", workspaceId]);
}

/**
 * Rename a workspace.
 */
export async function cmuxRenameWorkspace<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  title: string,
  workspaceId?: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", {
    op: "cmuxRenameWorkspace",
    title,
    workspaceId,
  });
  const args = ["rename-workspace"];
  if (workspaceId) args.push("--workspace", workspaceId);
  args.push(title);
  await runCmuxVoid(args);
}

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

/**
 * List all windows.
 */
export async function cmuxListWindows<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<CmuxWindow[]> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxListWindows" });
  return runCmuxJson<CmuxWindow[]>(["list-windows"]);
}

/**
 * Create a new window.
 */
export async function cmuxNewWindow<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxNewWindow" });
  return runCmuxText(["new-window"]);
}

/**
 * Focus a window.
 */
export async function cmuxFocusWindow<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  windowId: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxFocusWindow", windowId });
  await runCmuxVoid(["focus-window", "--window", windowId]);
}

// ---------------------------------------------------------------------------
// Splits, panes, surfaces
// ---------------------------------------------------------------------------

/**
 * Create a new split. Direction: left, right, up, down.
 */
export async function cmuxNewSplit<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  direction: "left" | "right" | "up" | "down",
  surfaceId?: string,
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxNewSplit", direction, surfaceId });
  const args = ["new-split", direction];
  if (surfaceId) args.push("--surface", surfaceId);
  return runCmuxText(args);
}

/**
 * List panes in a workspace.
 */
export async function cmuxListPanes<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  workspaceId?: string,
): Promise<CmuxPane[]> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxListPanes", workspaceId });
  const args = ["list-panes"];
  if (workspaceId) args.push("--workspace", workspaceId);
  return runCmuxJson<CmuxPane[]>(args);
}

/**
 * List all surfaces.
 */
export async function cmuxListSurfaces<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<CmuxSurface[]> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxListSurfaces" });
  return runCmuxJson<CmuxSurface[]>(["list-surfaces"]);
}

/**
 * Focus a pane.
 */
export async function cmuxFocusPane<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  paneId: string,
  workspaceId?: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxFocusPane", paneId });
  const args = ["focus-pane", "--pane", paneId];
  if (workspaceId) args.push("--workspace", workspaceId);
  await runCmuxVoid(args);
}

/**
 * Close a surface.
 */
export async function cmuxCloseSurface<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId?: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxCloseSurface", surfaceId });
  const args = ["close-surface"];
  if (surfaceId) args.push("--surface", surfaceId);
  await runCmuxVoid(args);
}

/**
 * Show workspace tree.
 */
export async function cmuxTree<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  options?: { readonly all?: boolean; readonly workspaceId?: string },
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxTree" });
  const args = ["tree"];
  if (options?.all) args.push("--all");
  if (options?.workspaceId) args.push("--workspace", options.workspaceId);
  return runCmuxText(args);
}

// ---------------------------------------------------------------------------
// Send input
// ---------------------------------------------------------------------------

/**
 * Send text to a terminal surface. Use \n for enter.
 *
 * @example
 * ```ts
 * await cmuxSend(ctx, "npm test\n");
 * await cmuxSend(ctx, "echo hello\n", "surface:2");
 * ```
 */
export async function cmuxSend<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  text: string,
  surfaceId?: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxSend", surfaceId });
  const args = ["send"];
  if (surfaceId) args.push("--surface", surfaceId);
  args.push(text);
  await runCmuxVoid(args);
}

/**
 * Send a key press (enter, tab, escape, up, down, etc.).
 */
export async function cmuxSendKey<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  key: string,
  surfaceId?: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxSendKey", key, surfaceId });
  const args = ["send-key"];
  if (surfaceId) args.push("--surface", surfaceId);
  args.push(key);
  await runCmuxVoid(args);
}

// ---------------------------------------------------------------------------
// Read terminal output
// ---------------------------------------------------------------------------

/**
 * Read the current screen content of a terminal surface.
 *
 * @example
 * ```ts
 * const screen = await cmuxReadScreen(ctx);
 * const output = await cmuxReadScreen(ctx, { surfaceId: "surface:2", lines: 50 });
 * ```
 */
export async function cmuxReadScreen<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  options?: {
    readonly surfaceId?: string;
    readonly scrollback?: boolean;
    readonly lines?: number;
  },
): Promise<CmuxScreenContent> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxReadScreen", ...options });
  const args = ["read-screen"];
  if (options?.surfaceId) args.push("--surface", options.surfaceId);
  if (options?.scrollback) args.push("--scrollback");
  if (options?.lines) args.push("--lines", String(options.lines));
  const text = await runCmuxText(args);
  return {
    lines: text.split("\n"),
    surfaceId: options?.surfaceId ?? "current",
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Send a desktop notification via cmux.
 *
 * @example
 * ```ts
 * await cmuxNotify(ctx, { title: "Build", body: "All tests passed" });
 * ```
 */
export async function cmuxNotify<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  notification: CmuxNotification,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxNotify", title: notification.title });
  const args = [
    "notify",
    "--title",
    notification.title,
    "--body",
    notification.body,
  ];
  if (notification.subtitle) args.push("--subtitle", notification.subtitle);
  await runCmuxVoid(args);
}

/**
 * Clear all notifications.
 */
export async function cmuxClearNotifications<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxClearNotifications" });
  await runCmuxVoid(["clear-notifications"]);
}

// ---------------------------------------------------------------------------
// Sidebar — status pills
// ---------------------------------------------------------------------------

/**
 * Set a sidebar status pill.
 *
 * @example
 * ```ts
 * await cmuxSetStatus(ctx, "build", "passing", { icon: "checkmark", color: "#34c759" });
 * ```
 */
export async function cmuxSetStatus<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  key: string,
  value: string,
  options?: {
    readonly icon?: string;
    readonly color?: string;
    readonly workspaceId?: string;
  },
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxSetStatus", key, value });
  const args = ["set-status", key, value];
  if (options?.icon) args.push("--icon", options.icon);
  if (options?.color) args.push("--color", options.color);
  if (options?.workspaceId) args.push("--workspace", options.workspaceId);
  await runCmuxVoid(args);
}

/**
 * Clear a sidebar status pill.
 */
export async function cmuxClearStatus<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  key: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxClearStatus", key });
  await runCmuxVoid(["clear-status", key]);
}

// ---------------------------------------------------------------------------
// Sidebar — progress bar
// ---------------------------------------------------------------------------

/**
 * Set the sidebar progress bar (0.0 to 1.0).
 *
 * @example
 * ```ts
 * await cmuxSetProgress(ctx, 0.5, "Compiling...");
 * await cmuxSetProgress(ctx, 1.0, "Done");
 * ```
 */
export async function cmuxSetProgress<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  value: number,
  label?: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxSetProgress", value, label });
  const args = ["set-progress", String(value)];
  if (label) args.push("--label", label);
  await runCmuxVoid(args);
}

/**
 * Clear the sidebar progress bar.
 */
export async function cmuxClearProgress<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxClearProgress" });
  await runCmuxVoid(["clear-progress"]);
}

// ---------------------------------------------------------------------------
// Sidebar — log entries
// ---------------------------------------------------------------------------

/**
 * Add a log entry to the sidebar.
 *
 * @example
 * ```ts
 * await cmuxLog(ctx, "Build started", { level: "info", source: "build" });
 * await cmuxLog(ctx, "All 42 tests passed", { level: "success" });
 * ```
 */
export async function cmuxLog<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  message: string,
  options?: {
    readonly level?: "info" | "progress" | "success" | "warning" | "error";
    readonly source?: string;
  },
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", {
    op: "cmuxLog",
    message,
    level: options?.level,
  });
  const args = ["log"];
  if (options?.level) args.push("--level", options.level);
  if (options?.source) args.push("--source", options.source);
  args.push("--", message);
  await runCmuxVoid(args);
}

/**
 * Clear all sidebar log entries.
 */
export async function cmuxClearLog<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxClearLog" });
  await runCmuxVoid(["clear-log"]);
}

/**
 * Get full sidebar state.
 */
export async function cmuxSidebarState<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  workspaceId?: string,
): Promise<unknown> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxSidebarState" });
  const args = ["sidebar-state"];
  if (workspaceId) args.push("--workspace", workspaceId);
  return runCmuxJson(args);
}

// ---------------------------------------------------------------------------
// Browser automation
// ---------------------------------------------------------------------------

/**
 * Open a URL in an embedded browser surface.
 *
 * @example
 * ```ts
 * const surfaceId = await cmuxBrowserOpen(ctx, "https://example.com");
 * ```
 */
export async function cmuxBrowserOpen<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  url: string,
  options?: { readonly split?: boolean },
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxBrowserOpen", url });
  const cmd = options?.split ? "open-split" : "open";
  return runCmuxText(["browser", cmd, url]);
}

/**
 * Navigate a browser surface to a URL.
 */
export async function cmuxBrowserNavigate<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  url: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxBrowserNavigate", surfaceId, url });
  await runCmuxVoid(["browser", surfaceId, "navigate", url]);
}

/**
 * Click an element in a browser surface.
 */
export async function cmuxBrowserClick<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  selector: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxBrowserClick", surfaceId, selector });
  await runCmuxVoid(["browser", surfaceId, "click", selector]);
}

/**
 * Fill an input field in a browser surface.
 */
export async function cmuxBrowserFill<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  selector: string,
  text: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxBrowserFill", surfaceId, selector });
  await runCmuxVoid(["browser", surfaceId, "fill", selector, "--text", text]);
}

/**
 * Get an accessibility snapshot of a browser surface.
 */
export async function cmuxBrowserSnapshot<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  options?: { readonly interactive?: boolean; readonly compact?: boolean },
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxBrowserSnapshot", surfaceId });
  const args = ["browser", surfaceId, "snapshot"];
  if (options?.interactive) args.push("--interactive");
  if (options?.compact) args.push("--compact");
  return runCmuxText(args);
}

/**
 * Take a screenshot of a browser surface.
 */
export async function cmuxBrowserScreenshot<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  outPath: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", {
    op: "cmuxBrowserScreenshot",
    surfaceId,
    outPath,
  });
  await runCmuxVoid(["browser", surfaceId, "screenshot", "--out", outPath]);
}

/**
 * Execute JavaScript in a browser surface.
 */
export async function cmuxBrowserEval<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  expression: string,
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxBrowserEval", surfaceId });
  return runCmuxText(["browser", surfaceId, "eval", expression]);
}

/**
 * Wait for a condition in a browser surface.
 */
export async function cmuxBrowserWait<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  options: {
    readonly loadState?: string;
    readonly selector?: string;
    readonly text?: string;
    readonly timeoutMs?: number;
  },
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", {
    op: "cmuxBrowserWait",
    surfaceId,
    ...options,
  });
  const args = ["browser", surfaceId, "wait"];
  if (options.loadState) args.push("--load-state", options.loadState);
  if (options.selector) args.push("--selector", options.selector);
  if (options.text) args.push("--text", options.text);
  if (options.timeoutMs) args.push("--timeout-ms", String(options.timeoutMs));
  await runCmuxVoid(args);
}

/**
 * Get a property from a browser surface (title, text, value).
 */
export async function cmuxBrowserGet<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  surfaceId: string,
  property: "title" | "text" | "value",
  selector?: string,
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxBrowserGet", surfaceId, property });
  const args = ["browser", surfaceId, "get", property];
  if (selector) args.push(selector);
  return runCmuxText(args);
}

// ---------------------------------------------------------------------------
// Clipboard / buffers
// ---------------------------------------------------------------------------

/**
 * Set a named buffer.
 */
export async function cmuxSetBuffer<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  text: string,
  name?: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxSetBuffer", name });
  const args = ["set-buffer"];
  if (name) args.push("--name", name);
  args.push(text);
  await runCmuxVoid(args);
}

/**
 * Paste a buffer to a surface.
 */
export async function cmuxPasteBuffer<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  options?: { readonly name?: string; readonly surfaceId?: string },
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxPasteBuffer" });
  const args = ["paste-buffer"];
  if (options?.name) args.push("--name", options.name);
  if (options?.surfaceId) args.push("--surface", options.surfaceId);
  await runCmuxVoid(args);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Ping cmux to check if it's running.
 */
export async function cmuxPing<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<boolean> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxPing" });
  try {
    const result = await runCmux(["ping"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Display a message in cmux.
 */
export async function cmuxDisplayMessage<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
  text: string,
): Promise<void> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxDisplayMessage" });
  await runCmuxVoid(["display-message", "-p", text]);
}

/**
 * Get cmux version.
 */
export async function cmuxVersion<K extends CapabilityKind>(
  ctx: RequireCap<K, "os:interact">,
): Promise<string> {
  ctx.caps.demand({ kind: "os:interact" });
  ctx.audit.log("os:interact", { op: "cmuxVersion" });
  return runCmuxText(["version"]);
}
