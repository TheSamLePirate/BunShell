/**
 * Git wrappers — typed git operations.
 *
 * Requires process:spawn for "git".
 *
 * @module
 */

import type { CapabilityContext, CapabilityKind, RequireCap } from "../capabilities/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Git repository status. */
export interface GitStatus {
  readonly branch: string;
  readonly staged: readonly GitFileChange[];
  readonly unstaged: readonly GitFileChange[];
  readonly untracked: readonly string[];
  readonly clean: boolean;
}

/** A single file change in git status. */
export interface GitFileChange {
  readonly status:
    | "added"
    | "modified"
    | "deleted"
    | "renamed"
    | "copied"
    | "unknown";
  readonly path: string;
}

/** A git commit entry. */
export interface GitCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly author: string;
  readonly email: string;
  readonly date: Date;
  readonly message: string;
}

/** A git diff entry for a single file. */
export interface GitDiffEntry {
  readonly file: string;
  readonly additions: number;
  readonly deletions: number;
}

/** Git branch information. */
export interface GitBranches {
  readonly current: string;
  readonly branches: readonly string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runGit(
  ctx: CapabilityContext,
  args: readonly string[],
): Promise<string> {
  ctx.caps.demand({ kind: "process:spawn", allowedBinaries: ["git"] });
  ctx.audit.log("process:spawn", { op: "git", args });

  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`git ${args[0]} failed: ${stderr.trim()}`);
  }

  return stdout;
}

function parseStatusCode(code: string): GitFileChange["status"] {
  switch (code) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// gitStatus
// ---------------------------------------------------------------------------

/**
 * Get the current git status with structured output.
 *
 * @example
 * ```ts
 * const status = await gitStatus(ctx);
 * console.log(status.branch, status.staged.length, "files staged");
 * ```
 */
export async function gitStatus(ctx: CapabilityContext): Promise<GitStatus> {
  const output = await runGit(ctx, ["status", "--porcelain=v1", "-b"]);
  const lines = output
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);

  let branch = "HEAD";
  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const branchPart = line.slice(3).split("...")[0]!;
      branch = branchPart.trim();
      continue;
    }

    const x = line[0]!; // index status
    const y = line[1]!; // working tree status
    const path = line.slice(3).trim();

    if (x === "?" && y === "?") {
      untracked.push(path);
    } else {
      if (x !== " " && x !== "?") {
        staged.push({ status: parseStatusCode(x), path });
      }
      if (y !== " " && y !== "?") {
        unstaged.push({ status: parseStatusCode(y), path });
      }
    }
  }

  return {
    branch,
    staged,
    unstaged,
    untracked,
    clean:
      staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  };
}

// ---------------------------------------------------------------------------
// gitLog
// ---------------------------------------------------------------------------

/**
 * Get git log with structured commit entries.
 *
 * @example
 * ```ts
 * const commits = await gitLog(ctx, { limit: 10 });
 * for (const c of commits) console.log(c.shortHash, c.message);
 * ```
 */
export async function gitLog<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  options?: { readonly limit?: number; readonly ref?: string },
): Promise<GitCommit[]> {
  const limit = options?.limit ?? 20;
  const ref = options?.ref ?? "HEAD";
  const sep = "<<SEP>>";
  const format = `%H${sep}%h${sep}%an${sep}%ae${sep}%aI${sep}%s`;

  const output = await runGit(ctx, [
    "log",
    `--format=${format}`,
    `-n${limit}`,
    ref,
  ]);

  return output
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const parts = line.split(sep);
      return {
        hash: parts[0] ?? "",
        shortHash: parts[1] ?? "",
        author: parts[2] ?? "",
        email: parts[3] ?? "",
        date: new Date(parts[4] ?? ""),
        message: parts[5] ?? "",
      };
    });
}

// ---------------------------------------------------------------------------
// gitDiff
// ---------------------------------------------------------------------------

/**
 * Get git diff statistics per file.
 *
 * @example
 * ```ts
 * const diff = await gitDiff(ctx);
 * for (const d of diff) console.log(`${d.file}: +${d.additions} -${d.deletions}`);
 * ```
 */
export async function gitDiff<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  ref?: string,
): Promise<GitDiffEntry[]> {
  const args = ref ? ["diff", "--numstat", ref] : ["diff", "--numstat"];
  const output = await runGit(ctx, args);

  return output
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      return {
        file: parts[2] ?? "",
        additions: parseInt(parts[0] ?? "0", 10),
        deletions: parseInt(parts[1] ?? "0", 10),
      };
    });
}

// ---------------------------------------------------------------------------
// gitBranch
// ---------------------------------------------------------------------------

/**
 * List git branches.
 *
 * @example
 * ```ts
 * const { current, branches } = await gitBranch(ctx);
 * ```
 */
export async function gitBranch(ctx: CapabilityContext): Promise<GitBranches> {
  const output = await runGit(ctx, ["branch", "--no-color"]);
  const lines = output
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);
  let current = "";
  const branches: string[] = [];

  for (const line of lines) {
    const name = line.replace(/^\*?\s+/, "").trim();
    branches.push(name);
    if (line.startsWith("*")) {
      current = name;
    }
  }

  return { current, branches };
}

// ---------------------------------------------------------------------------
// gitAdd
// ---------------------------------------------------------------------------

/**
 * Stage files for commit.
 *
 * @example
 * ```ts
 * await gitAdd(ctx, ["src/index.ts", "package.json"]);
 * ```
 */
export async function gitAdd<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  paths: readonly string[],
): Promise<void> {
  await runGit(ctx, ["add", ...paths]);
}

// ---------------------------------------------------------------------------
// gitCommit
// ---------------------------------------------------------------------------

/**
 * Create a git commit.
 *
 * @example
 * ```ts
 * const result = await gitCommit(ctx, "feat: add new feature");
 * console.log(result.hash);
 * ```
 */
export async function gitCommit<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  message: string,
): Promise<{ hash: string }> {
  const output = await runGit(ctx, ["commit", "-m", message]);
  const match = output.match(/\[[\w/-]+\s+([a-f0-9]+)\]/);
  return { hash: match ? match[1]! : "" };
}

// ---------------------------------------------------------------------------
// gitPush / gitPull / gitClone / gitStash
// ---------------------------------------------------------------------------

/**
 * Push to a remote.
 *
 * @example
 * ```ts
 * await gitPush(ctx, "origin", "main");
 * ```
 */
export async function gitPush<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  remote: string = "origin",
  branch?: string,
): Promise<string> {
  const args = branch ? ["push", remote, branch] : ["push", remote];
  return runGit(ctx, args);
}

/**
 * Pull from a remote.
 *
 * @example
 * ```ts
 * await gitPull(ctx);
 * ```
 */
export async function gitPull<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  remote: string = "origin",
  branch?: string,
): Promise<string> {
  const args = branch ? ["pull", remote, branch] : ["pull", remote];
  return runGit(ctx, args);
}

/**
 * Clone a repository.
 *
 * @example
 * ```ts
 * await gitClone(ctx, "https://github.com/user/repo.git", "/tmp/repo");
 * ```
 */
export async function gitClone<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  url: string,
  dest: string,
): Promise<string> {
  return runGit(ctx, ["clone", url, dest]);
}

/**
 * Git stash operations.
 *
 * @example
 * ```ts
 * await gitStash(ctx, "push");
 * await gitStash(ctx, "pop");
 * ```
 */
export async function gitStash<K extends CapabilityKind>(
  ctx: RequireCap<K, "process:spawn">,
  action: "push" | "pop" | "list" | "drop" = "push",
): Promise<string> {
  return runGit(ctx, ["stash", action]);
}
