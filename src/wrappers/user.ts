/**
 * User/group wrappers — current user and system identity info.
 *
 * Requires env:read capability (accesses OS user information).
 *
 * @module
 */

import type { CapabilityContext, CapabilityKind, RequireCap } from "../capabilities/types";
import { userInfo, homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Detailed information about the current user. */
export interface CurrentUser {
  readonly uid: number;
  readonly gid: number;
  readonly username: string;
  readonly home: string;
  readonly shell: string;
}

/** Information about a system user (from /etc/passwd on Unix). */
export interface UserEntry {
  readonly username: string;
  readonly uid: number;
  readonly gid: number;
  readonly home: string;
  readonly shell: string;
}

/** Information about a system group. */
export interface GroupEntry {
  readonly name: string;
  readonly gid: number;
  readonly members: readonly string[];
}

// ---------------------------------------------------------------------------
// currentUser
// ---------------------------------------------------------------------------

/**
 * Get detailed information about the current user.
 *
 * @example
 * ```ts
 * const user = currentUser(ctx);
 * console.log(user.username, user.home, user.shell);
 * ```
 */
export function currentUser(ctx: CapabilityContext): CurrentUser {
  ctx.caps.demand({ kind: "env:read", allowedKeys: ["*"] });
  ctx.audit.log("env:read", { op: "currentUser" });

  const info = userInfo();
  return {
    uid: info.uid,
    gid: info.gid,
    username: info.username,
    home: homedir(),
    shell: info.shell ?? "",
  };
}

// ---------------------------------------------------------------------------
// users — list system users
// ---------------------------------------------------------------------------

/**
 * List system users (from /etc/passwd on Unix).
 * Requires fs:read for /etc/passwd.
 *
 * @example
 * ```ts
 * const users = await users(ctx);
 * const realUsers = users.filter(u => u.uid >= 500);
 * ```
 */
export async function users(ctx: CapabilityContext): Promise<UserEntry[]> {
  ctx.caps.demand({ kind: "fs:read", pattern: "/etc/passwd" });
  ctx.audit.log("fs:read", { op: "users" });

  const content = await Bun.file("/etc/passwd").text();
  return content
    .trim()
    .split("\n")
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((line) => {
      const parts = line.split(":");
      return {
        username: parts[0] ?? "",
        uid: parseInt(parts[2] ?? "0", 10),
        gid: parseInt(parts[3] ?? "0", 10),
        home: parts[5] ?? "",
        shell: parts[6] ?? "",
      };
    });
}

// ---------------------------------------------------------------------------
// groups — list system groups
// ---------------------------------------------------------------------------

/**
 * List system groups (from /etc/group on Unix).
 * Requires fs:read for /etc/group.
 *
 * @example
 * ```ts
 * const groups = await groups(ctx);
 * const staffGroup = groups.find(g => g.name === "staff");
 * ```
 */
export async function groups(ctx: CapabilityContext): Promise<GroupEntry[]> {
  ctx.caps.demand({ kind: "fs:read", pattern: "/etc/group" });
  ctx.audit.log("fs:read", { op: "groups" });

  const content = await Bun.file("/etc/group").text();
  return content
    .trim()
    .split("\n")
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((line) => {
      const parts = line.split(":");
      const members = (parts[3] ?? "").split(",").filter((m) => m.length > 0);
      return {
        name: parts[0] ?? "",
        gid: parseInt(parts[2] ?? "0", 10),
        members,
      };
    });
}
