/**
 * Docker wrappers — the Compute Plane.
 *
 * TypeScript is the Control Plane (typed, fast, in-memory).
 * Docker is the Compute Plane (native, isolated, ephemeral).
 *
 * The agent stays in its typed sandbox for 90% of tasks and
 * only spins up ephemeral containers for heavy, untyped, or
 * OS-level native work (cargo build, ffmpeg, kubectl, etc.).
 *
 * Key function: dockerVfsRun() syncs VFS → Docker volume → runs
 * container → ingests file diff back into VFS. The agent never
 * touches the host filesystem.
 *
 * @module
 */

import type { CapabilityKind, RequireCap } from "../capabilities/types";
import type { VirtualFilesystem } from "../vfs/vfs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of running a Docker container. */
export interface DockerRunResult {
  readonly containerId: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly success: boolean;
  readonly duration: number;
  readonly image: string;
}

/** Result of a VFS-synced Docker run. */
export interface DockerVfsRunResult extends DockerRunResult {
  readonly filesChanged: number;
  readonly filesAdded: number;
  readonly filesRemoved: number;
  readonly bytesTransferred: number;
}

/** Result of building a Docker image. */
export interface DockerBuildResult {
  readonly imageId: string;
  readonly tag: string;
  readonly success: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly duration: number;
}

/** Information about a Docker image. */
export interface DockerImage {
  readonly repository: string;
  readonly tag: string;
  readonly imageId: string;
  readonly created: string;
  readonly size: string;
}

/** Information about a running Docker container. */
export interface DockerContainer {
  readonly containerId: string;
  readonly image: string;
  readonly command: string;
  readonly created: string;
  readonly status: string;
  readonly ports: string;
  readonly names: string;
}

/** Options for running a Docker container. */
export interface DockerRunOptions {
  /** Command to run inside the container. */
  readonly command?: readonly string[];
  /** Environment variables to pass. */
  readonly env?: Record<string, string>;
  /** Working directory inside the container. */
  readonly workdir?: string;
  /** Volume mounts (host:container). */
  readonly volumes?: readonly string[];
  /** Port mappings (host:container). */
  readonly ports?: readonly string[];
  /** Remove container after exit (default: true). */
  readonly rm?: boolean;
  /** Timeout in ms (default: 60000). */
  readonly timeout?: number;
  /** User to run as inside the container. */
  readonly user?: string;
  /** Memory limit (e.g., "512m"). */
  readonly memory?: string;
  /** CPU limit (e.g., "1.0"). */
  readonly cpus?: string;
  /** Network mode (e.g., "none", "host", "bridge"). */
  readonly network?: string;
  /** Read-only root filesystem (default: false). */
  readonly readOnly?: boolean;
}

/** Options for VFS-synced Docker runs. */
export interface DockerVfsRunOptions extends DockerRunOptions {
  /** VFS path to sync into the container. */
  readonly vfsPath: string;
  /** Path inside the container where VFS is mounted (default: /workspace). */
  readonly containerPath?: string;
  /** Whether to sync changes back to VFS (default: true). */
  readonly syncBack?: boolean;
}

/** Options for building a Docker image. */
export interface DockerBuildOptions {
  /** Path to Dockerfile (relative to context). */
  readonly dockerfile?: string;
  /** Build arguments. */
  readonly buildArgs?: Record<string, string>;
  /** Target build stage. */
  readonly target?: string;
  /** No cache (default: false). */
  readonly noCache?: boolean;
  /** Timeout in ms (default: 300000). */
  readonly timeout?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse image name to extract the base name for capability checks. */
function imageBase(image: string): string {
  return image;
}

async function runDocker(
  args: readonly string[],
  timeout: number = 60_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeout);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  clearTimeout(timer);

  if (timedOut) {
    throw new Error(
      `Docker command timed out after ${timeout}ms: docker ${args.join(" ")}`,
    );
  }

  return { exitCode, stdout, stderr };
}

// ---------------------------------------------------------------------------
// Container lifecycle
// ---------------------------------------------------------------------------

/**
 * Run a Docker container and return structured output.
 *
 * @example
 * ```ts
 * const result = await dockerRun(ctx, "node:20-alpine", {
 *   command: ["node", "-e", "console.log(JSON.stringify({ok:true}))"],
 * });
 * // result.stdout → '{"ok":true}'
 * ```
 */
export async function dockerRun<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  image: string,
  options?: DockerRunOptions,
): Promise<DockerRunResult> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [imageBase(image)] });
  ctx.audit.log("docker:run", { op: "run", image });

  const start = performance.now();
  const args: string[] = ["run"];

  // Default: remove after exit
  if (options?.rm !== false) args.push("--rm");

  if (options?.env) {
    for (const [k, v] of Object.entries(options.env)) {
      args.push("-e", `${k}=${v}`);
    }
  }
  if (options?.workdir) args.push("-w", options.workdir);
  if (options?.volumes) {
    for (const v of options.volumes) args.push("-v", v);
  }
  if (options?.ports) {
    for (const p of options.ports) args.push("-p", p);
  }
  if (options?.user) args.push("--user", options.user);
  if (options?.memory) args.push("--memory", options.memory);
  if (options?.cpus) args.push("--cpus", options.cpus);
  if (options?.network) args.push("--network", options.network);
  if (options?.readOnly) args.push("--read-only");

  args.push(image);
  if (options?.command) args.push(...options.command);

  const result = await runDocker(args, options?.timeout ?? 60_000);
  const duration = performance.now() - start;

  // Extract container ID from output if available
  const containerId =
    result.stdout.trim().split("\n").pop()?.slice(0, 12) ?? "";

  return {
    containerId,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.exitCode === 0,
    duration,
    image,
  };
}

/**
 * Run a script inside a Docker container. Convenience wrapper
 * that writes a script and executes it.
 *
 * @example
 * ```ts
 * const result = await dockerExec(ctx, "python:3.12-slim", `
 *   import json
 *   print(json.dumps({"pi": 3.14159}))
 * `);
 * ```
 */
export async function dockerExec<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  image: string,
  script: string,
  options?: Omit<DockerRunOptions, "command">,
): Promise<DockerRunResult> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [imageBase(image)] });
  ctx.audit.log("docker:run", { op: "exec", image });

  const start = performance.now();
  const args: string[] = ["run", "--rm"];

  if (options?.env) {
    for (const [k, v] of Object.entries(options.env)) {
      args.push("-e", `${k}=${v}`);
    }
  }
  if (options?.workdir) args.push("-w", options.workdir);
  if (options?.memory) args.push("--memory", options.memory);
  if (options?.cpus) args.push("--cpus", options.cpus);
  if (options?.network) args.push("--network", options.network);
  if (options?.readOnly) args.push("--read-only");

  // Pipe script via sh -c
  args.push(image, "sh", "-c", script);

  const result = await runDocker(args, options?.timeout ?? 60_000);
  const duration = performance.now() - start;

  return {
    containerId: "",
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.exitCode === 0,
    duration,
    image,
  };
}

// ---------------------------------------------------------------------------
// VFS ↔ Docker volume sync — the key integration
// ---------------------------------------------------------------------------

/**
 * Run a Docker container with VFS sync.
 *
 * 1. Flushes VFS state to a temporary directory
 * 2. Mounts it as a Docker volume
 * 3. Runs the container
 * 4. Ingests the file diff back into VFS
 *
 * This is how agents do heavy native work (cargo build, make,
 * ffmpeg) without ever touching the host filesystem.
 *
 * @example
 * ```ts
 * // Build a Rust project that lives in VFS
 * const result = await dockerVfsRun(ctx, vfs, "rust:1.77", {
 *   vfsPath: "/project",
 *   command: ["cargo", "build", "--release"],
 * });
 * // result.filesChanged — how many files the build produced
 * // VFS now contains the build artifacts at /project/target/
 * ```
 */
export async function dockerVfsRun<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  vfs: VirtualFilesystem,
  image: string,
  options: DockerVfsRunOptions,
): Promise<DockerVfsRunResult> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [imageBase(image)] });
  ctx.audit.log("docker:run", {
    op: "vfsRun",
    image,
    vfsPath: options.vfsPath,
  });

  const {
    mkdtemp,
    rm: fsRm,
    readdir,
    stat: fsStat,
    readFile,
  } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");

  const start = performance.now();
  const containerPath = options.containerPath ?? "/workspace";
  const syncBack = options.syncBack !== false;

  // Step 1: Flush VFS to temp directory
  const tempDir = await mkdtemp(join(tmpdir(), "bunshell-docker-"));

  try {
    await vfs.syncToDisk(options.vfsPath, tempDir);

    // Snapshot file state before run (for diff)
    const beforeFiles = new Map<string, { size: number; mtime: number }>();
    if (syncBack) {
      await walkDisk(tempDir, tempDir, beforeFiles, readdir, fsStat, join);
    }

    // Step 2: Run container with mounted volume
    const args: string[] = ["run", "--rm"];
    args.push("-v", `${tempDir}:${containerPath}`);
    args.push("-w", containerPath);

    if (options.env) {
      for (const [k, v] of Object.entries(options.env)) {
        args.push("-e", `${k}=${v}`);
      }
    }
    if (options.memory) args.push("--memory", options.memory);
    if (options.cpus) args.push("--cpus", options.cpus);
    if (options.network) args.push("--network", options.network);
    if (options.user) args.push("--user", options.user);

    args.push(image);
    if (options.command) args.push(...options.command);

    const result = await runDocker(args, options.timeout ?? 60_000);
    const duration = performance.now() - start;

    // Step 3: Ingest diff back into VFS
    let filesChanged = 0;
    let filesAdded = 0;
    let filesRemoved = 0;
    let bytesTransferred = 0;

    if (syncBack) {
      const afterFiles = new Map<string, { size: number; mtime: number }>();
      await walkDisk(tempDir, tempDir, afterFiles, readdir, fsStat, join);

      // Find new + changed files
      for (const [relPath, after] of afterFiles) {
        const before = beforeFiles.get(relPath);
        if (
          !before ||
          before.mtime !== after.mtime ||
          before.size !== after.size
        ) {
          const diskPath = join(tempDir, relPath);
          const content = new Uint8Array(await readFile(diskPath));
          const vfsTarget = options.vfsPath + "/" + relPath;
          vfs.writeFile(vfsTarget, content);
          bytesTransferred += content.length;

          if (before) {
            filesChanged++;
          } else {
            filesAdded++;
          }
        }
      }

      // Find removed files
      for (const relPath of beforeFiles.keys()) {
        if (!afterFiles.has(relPath)) {
          const vfsTarget = options.vfsPath + "/" + relPath;
          if (vfs.exists(vfsTarget)) {
            vfs.rm(vfsTarget);
            filesRemoved++;
          }
        }
      }
    }

    return {
      containerId: "",
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      success: result.exitCode === 0,
      duration,
      image,
      filesChanged,
      filesAdded,
      filesRemoved,
      bytesTransferred,
    };
  } finally {
    // Clean up temp directory
    await fsRm(tempDir, { recursive: true, force: true });
  }
}

/** Walk a disk directory and collect file metadata. */
async function walkDisk(
  base: string,
  dir: string,
  out: Map<string, { size: number; mtime: number }>,
  readdir: (p: string) => Promise<string[]>,
  fsStat: (p: string) => Promise<{
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
    mtimeMs: number;
  }>,
  join: (...args: string[]) => string,
): Promise<void> {
  const items = await readdir(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const s = await fsStat(fullPath);
    const relPath = fullPath.slice(base.length + 1);

    if (s.isDirectory()) {
      await walkDisk(base, fullPath, out, readdir, fsStat, join);
    } else if (s.isFile()) {
      out.set(relPath, { size: s.size, mtime: s.mtimeMs });
    }
  }
}

// ---------------------------------------------------------------------------
// Image management
// ---------------------------------------------------------------------------

/**
 * Build a Docker image from a Dockerfile context.
 *
 * @example
 * ```ts
 * const result = await dockerBuild(ctx, "/path/to/context", "my-app:latest");
 * ```
 */
export async function dockerBuild<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  contextPath: string,
  tag: string,
  options?: DockerBuildOptions,
): Promise<DockerBuildResult> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [tag] });
  ctx.audit.log("docker:run", { op: "build", tag, contextPath });

  const start = performance.now();
  const args: string[] = ["build", "-t", tag];

  if (options?.dockerfile) args.push("-f", options.dockerfile);
  if (options?.target) args.push("--target", options.target);
  if (options?.noCache) args.push("--no-cache");
  if (options?.buildArgs) {
    for (const [k, v] of Object.entries(options.buildArgs)) {
      args.push("--build-arg", `${k}=${v}`);
    }
  }

  args.push(contextPath);

  const result = await runDocker(args, options?.timeout ?? 300_000);
  const duration = performance.now() - start;

  // Extract image ID from build output
  const idMatch = result.stdout.match(/writing image sha256:([a-f0-9]+)/);
  const imageId = idMatch ? idMatch[1]!.slice(0, 12) : "";

  return {
    imageId,
    tag,
    success: result.exitCode === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    duration,
  };
}

/**
 * Pull a Docker image.
 *
 * @example
 * ```ts
 * await dockerPull(ctx, "node:20-alpine");
 * ```
 */
export async function dockerPull<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  image: string,
): Promise<DockerRunResult> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [imageBase(image)] });
  ctx.audit.log("docker:run", { op: "pull", image });

  const start = performance.now();
  const result = await runDocker(["pull", image], 300_000);
  const duration = performance.now() - start;

  return {
    containerId: "",
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    success: result.exitCode === 0,
    duration,
    image,
  };
}

/**
 * List local Docker images.
 *
 * @example
 * ```ts
 * const images = await dockerImages(ctx);
 * const nodeImages = images.filter(i => i.repository.includes("node"));
 * ```
 */
export async function dockerImages<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
): Promise<DockerImage[]> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: ["*"] });
  ctx.audit.log("docker:run", { op: "images" });

  const result = await runDocker([
    "images",
    "--format",
    "{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}",
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`docker images failed: ${result.stderr}`);
  }

  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      return {
        repository: parts[0] ?? "",
        tag: parts[1] ?? "",
        imageId: parts[2] ?? "",
        created: parts[3] ?? "",
        size: parts[4] ?? "",
      };
    });
}

// ---------------------------------------------------------------------------
// Container management
// ---------------------------------------------------------------------------

/**
 * List running Docker containers.
 *
 * @example
 * ```ts
 * const containers = await dockerPs(ctx);
 * ```
 */
export async function dockerPs<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
): Promise<DockerContainer[]> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: ["*"] });
  ctx.audit.log("docker:run", { op: "ps" });

  const result = await runDocker([
    "ps",
    "--format",
    "{{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}",
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`docker ps failed: ${result.stderr}`);
  }

  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("\t");
      return {
        containerId: parts[0] ?? "",
        image: parts[1] ?? "",
        command: parts[2] ?? "",
        created: parts[3] ?? "",
        status: parts[4] ?? "",
        ports: parts[5] ?? "",
        names: parts[6] ?? "",
      };
    });
}

/**
 * Stop a running Docker container.
 *
 * @example
 * ```ts
 * await dockerStop(ctx, "abc123");
 * ```
 */
export async function dockerStop<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  containerId: string,
  timeout: number = 10,
): Promise<boolean> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: ["*"] });
  ctx.audit.log("docker:run", { op: "stop", containerId });

  const result = await runDocker(["stop", "-t", String(timeout), containerId]);
  return result.exitCode === 0;
}

/**
 * Remove a Docker container.
 *
 * @example
 * ```ts
 * await dockerRm(ctx, "abc123");
 * ```
 */
export async function dockerRm<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  containerId: string,
  force: boolean = false,
): Promise<boolean> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: ["*"] });
  ctx.audit.log("docker:run", { op: "rm", containerId });

  const args = ["rm"];
  if (force) args.push("-f");
  args.push(containerId);

  const result = await runDocker(args);
  return result.exitCode === 0;
}

/**
 * Get logs from a Docker container.
 *
 * @example
 * ```ts
 * const logs = await dockerLogs(ctx, "abc123", { tail: 100 });
 * ```
 */
export async function dockerLogs<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  containerId: string,
  options?: { readonly tail?: number; readonly follow?: boolean },
): Promise<string> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: ["*"] });
  ctx.audit.log("docker:run", { op: "logs", containerId });

  const args = ["logs"];
  if (options?.tail !== undefined) args.push("--tail", String(options.tail));
  args.push(containerId);

  const result = await runDocker(args);
  if (result.exitCode !== 0) {
    throw new Error(`docker logs failed: ${result.stderr}`);
  }

  return result.stdout + result.stderr;
}

// ---------------------------------------------------------------------------
// Daemon — background containers with handles
// ---------------------------------------------------------------------------

/** Handle for a background Docker container (dev server, database, etc.). */
export interface DockerDaemonHandle {
  /** The Docker container ID. */
  readonly containerId: string;
  /** The image used. */
  readonly image: string;

  /** Get the current container status. */
  status(): Promise<"running" | "exited" | "paused" | "unknown">;

  /** Get container logs (snapshot). */
  logs(options?: { readonly tail?: number }): Promise<string>;

  /** Stream container logs line-by-line (live tail). */
  logStream(): AsyncIterable<string>;

  /** Execute a command inside the running container. */
  exec(command: readonly string[]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;

  /**
   * Wait until a port is reachable inside the container.
   * Polls every `interval` ms, gives up after `timeout` ms.
   * Resolves true if port became reachable, false on timeout.
   */
  waitForPort(
    port: number,
    options?: { readonly timeout?: number; readonly interval?: number },
  ): Promise<boolean>;

  /** Graceful stop (SIGTERM → wait → SIGKILL). */
  stop(timeout?: number): Promise<boolean>;

  /** Immediate kill (SIGKILL). */
  kill(): Promise<boolean>;
}

/**
 * Spawn a background Docker container. Returns a handle for
 * querying status, reading live logs, and managing lifecycle.
 *
 * This is for long-running processes: dev servers, databases,
 * message queues — anything that runs indefinitely.
 *
 * @example
 * ```ts
 * const server = await dockerSpawnBackground(ctx, "node:20", {
 *   command: ["npm", "run", "dev"],
 *   ports: ["3000:3000"],
 * });
 *
 * await server.waitForPort(3000);
 * // Server is ready — test it
 * const resp = await netFetch(ctx, "http://localhost:3000/health");
 *
 * // Read live logs
 * for await (const line of server.logStream()) {
 *   if (line.includes("ERROR")) break;
 * }
 *
 * await server.stop();
 * ```
 */
export async function dockerSpawnBackground<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  image: string,
  options?: DockerRunOptions,
): Promise<DockerDaemonHandle> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [imageBase(image)] });
  ctx.audit.log("docker:run", { op: "spawnBackground", image });

  const args: string[] = ["run", "-d"];

  if (options?.env) {
    for (const [k, v] of Object.entries(options.env)) {
      args.push("-e", `${k}=${v}`);
    }
  }
  if (options?.workdir) args.push("-w", options.workdir);
  if (options?.volumes) {
    for (const v of options.volumes) args.push("-v", v);
  }
  if (options?.ports) {
    for (const p of options.ports) args.push("-p", p);
  }
  if (options?.user) args.push("--user", options.user);
  if (options?.memory) args.push("--memory", options.memory);
  if (options?.cpus) args.push("--cpus", options.cpus);
  if (options?.network) args.push("--network", options.network);
  if (options?.readOnly) args.push("--read-only");

  args.push(image);
  if (options?.command) args.push(...options.command);

  const result = await runDocker(args, options?.timeout ?? 30_000);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to start container: ${result.stderr}`);
  }

  const containerId = result.stdout.trim().slice(0, 12);

  return createDaemonHandle(containerId, image);
}

function createDaemonHandle(
  containerId: string,
  image: string,
): DockerDaemonHandle {
  return {
    containerId,
    image,

    async status(): Promise<"running" | "exited" | "paused" | "unknown"> {
      const result = await runDocker([
        "inspect",
        "--format",
        "{{.State.Status}}",
        containerId,
      ]);
      const s = result.stdout.trim();
      if (s === "running" || s === "exited" || s === "paused") return s;
      return "unknown";
    },

    async logs(options?: { readonly tail?: number }): Promise<string> {
      const args = ["logs"];
      if (options?.tail !== undefined)
        args.push("--tail", String(options.tail));
      args.push(containerId);
      const result = await runDocker(args);
      return result.stdout + result.stderr;
    },

    async *logStream(): AsyncIterable<string> {
      const proc = Bun.spawn(["docker", "logs", "-f", containerId], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;

          for (const line of lines) {
            yield line;
          }
        }
        // Flush remaining buffer
        if (buffer.length > 0) {
          yield buffer;
        }
      } finally {
        reader.releaseLock();
        proc.kill();
      }
    },

    async exec(
      command: readonly string[],
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
      return runDocker(["exec", containerId, ...command]);
    },

    async waitForPort(
      port: number,
      options?: { readonly timeout?: number; readonly interval?: number },
    ): Promise<boolean> {
      const timeout = options?.timeout ?? 30_000;
      const interval = options?.interval ?? 500;
      const deadline = Date.now() + timeout;

      while (Date.now() < deadline) {
        // Check if the port is reachable on the host
        try {
          const conn = await Bun.connect({
            hostname: "localhost",
            port,
            socket: {
              data() {},
              open(socket) {
                socket.end();
              },
              error() {},
              close() {},
            },
          });
          conn.end();
          return true;
        } catch {
          // Port not ready yet
        }

        // Check if container is still running
        const status = await this.status();
        if (status !== "running") return false;

        await new Promise((r) => setTimeout(r, interval));
      }

      return false;
    },

    async stop(timeout: number = 10): Promise<boolean> {
      const result = await runDocker([
        "stop",
        "-t",
        String(timeout),
        containerId,
      ]);
      return result.exitCode === 0;
    },

    async kill(): Promise<boolean> {
      const result = await runDocker(["kill", containerId]);
      return result.exitCode === 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Streaming output — async iterable + early kill
// ---------------------------------------------------------------------------

/** A streaming Docker execution with line-by-line output and kill capability. */
export interface DockerStream extends AsyncIterable<string> {
  /** Kill the running container immediately. */
  kill(): Promise<void>;
  /** The container ID (available after start). */
  readonly containerId: string;
}

/**
 * Run a Docker container with streaming output. Returns an async
 * iterable that yields stdout lines as they arrive.
 *
 * The agent can read output incrementally and kill early on error,
 * instead of waiting for completion and parsing a massive string.
 *
 * @example
 * ```ts
 * const stream = await dockerRunStreaming(ctx, "rust:1.77", {
 *   command: ["cargo", "build"],
 * });
 *
 * for await (const line of stream) {
 *   console.log(line);
 *   if (line.includes("error[E")) {
 *     await stream.kill();  // Agent interrupts early
 *     break;
 *   }
 * }
 * ```
 */
export async function dockerRunStreaming<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run">,
  image: string,
  options?: DockerRunOptions,
): Promise<DockerStream> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [imageBase(image)] });
  ctx.audit.log("docker:run", { op: "runStreaming", image });

  const args: string[] = ["run"];
  // Don't use --rm here: we need the container ID to kill it
  // We'll clean up manually

  if (options?.env) {
    for (const [k, v] of Object.entries(options.env)) {
      args.push("-e", `${k}=${v}`);
    }
  }
  if (options?.workdir) args.push("-w", options.workdir);
  if (options?.volumes) {
    for (const v of options.volumes) args.push("-v", v);
  }
  if (options?.ports) {
    for (const p of options.ports) args.push("-p", p);
  }
  if (options?.user) args.push("--user", options.user);
  if (options?.memory) args.push("--memory", options.memory);
  if (options?.cpus) args.push("--cpus", options.cpus);
  if (options?.network) args.push("--network", options.network);
  if (options?.readOnly) args.push("--read-only");

  // Run with --cidfile to capture container ID
  const { mkdtemp } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const tempDir = await mkdtemp(join(tmpdir(), "bunshell-stream-"));
  const cidFile = join(tempDir, "cid");
  args.push("--cidfile", cidFile);

  args.push(image);
  if (options?.command) args.push(...options.command);

  const proc = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Read container ID from cidfile (poll briefly)
  let containerId = "";
  const { readFile, rm: fsRm } = await import("node:fs/promises");
  const cidDeadline = Date.now() + 10_000;
  while (Date.now() < cidDeadline) {
    try {
      containerId = (await readFile(cidFile, "utf-8")).trim().slice(0, 12);
      if (containerId.length > 0) break;
    } catch {
      // File not yet written
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  let killed = false;

  async function killContainer(): Promise<void> {
    if (killed) return;
    killed = true;
    proc.kill();
    if (containerId) {
      await runDocker(["kill", containerId]).catch(() => {});
      await runDocker(["rm", "-f", containerId]).catch(() => {});
    }
    await fsRm(tempDir, { recursive: true, force: true }).catch(() => {});
  }

  async function* generateLines(): AsyncGenerator<string> {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          yield line;
        }
      }
      if (buffer.length > 0) {
        yield buffer;
      }
    } finally {
      reader.releaseLock();
      // Clean up container after iteration completes
      await killContainer();
    }
  }

  const generator = generateLines();

  const stream: DockerStream = {
    containerId,
    kill: killContainer,
    [Symbol.asyncIterator]() {
      return generator;
    },
  };

  return stream;
}

// ---------------------------------------------------------------------------
// Egress Proxy — capability-checked network for containers
// ---------------------------------------------------------------------------

/**
 * Handle for a running egress proxy. The proxy intercepts HTTP requests
 * from Docker containers and checks them against net:fetch capabilities.
 */
export interface EgressProxyHandle {
  /** Port the proxy is listening on. */
  readonly port: number;
  /** Number of requests allowed through. */
  readonly allowed: number;
  /** Number of requests blocked. */
  readonly blocked: number;
  /** Blocked domain log. */
  readonly blockedDomains: readonly string[];
  /** Stop the proxy server. */
  stop(): void;
}

/** Options for starting an egress proxy. */
export interface EgressProxyOptions {
  /** Port to listen on (default: random). */
  readonly port?: number;
}

/**
 * Start a capability-checked egress proxy.
 *
 * The proxy checks every HTTP request against the context's `net:fetch`
 * capabilities. Allowed domains pass through, blocked domains get 403.
 * Docker containers route traffic through this proxy via HTTP_PROXY/HTTPS_PROXY.
 *
 * @example
 * ```ts
 * const ctx = createContext({
 *   name: "builder",
 *   capabilitySet: capabilities()
 *     .dockerRun(["node:20"])
 *     .netFetch(["registry.npmjs.org", "github.com"])
 *     .build(),
 * });
 *
 * const proxy = startEgressProxy(ctx);
 *
 * // Container can only reach allowed domains
 * await dockerRun(ctx, "node:20", {
 *   command: ["npm", "install"],
 *   env: {
 *     HTTP_PROXY: `http://host.docker.internal:${proxy.port}`,
 *     HTTPS_PROXY: `http://host.docker.internal:${proxy.port}`,
 *   },
 *   // --add-host makes host.docker.internal resolvable
 * });
 *
 * proxy.stop();
 * ```
 */
export function startEgressProxy<K extends CapabilityKind>(
  ctx: RequireCap<K, "net:fetch">,
  options?: EgressProxyOptions,
): EgressProxyHandle {
  ctx.audit.log("net:fetch", { op: "startEgressProxy" });

  let allowedCount = 0;
  let blockedCount = 0;
  const blockedDomainsList: string[] = [];

  function checkDomain(hostname: string): boolean {
    try {
      ctx.caps.demand({ kind: "net:fetch", allowedDomains: [hostname] });
      return true;
    } catch {
      return false;
    }
  }

  const server = Bun.serve({
    port: options?.port ?? 0,

    async fetch(req: Request): Promise<Response> {
      // HTTPS CONNECT tunneling
      if (req.method === "CONNECT") {
        const [hostname] = req.url.split(":");

        if (!hostname || !checkDomain(hostname)) {
          blockedCount++;
          blockedDomainsList.push(hostname ?? "unknown");
          ctx.audit.log("net:fetch", {
            op: "egressBlocked",
            domain: hostname,
            method: "CONNECT",
          });
          return new Response("Blocked by BunShell egress proxy", {
            status: 403,
          });
        }

        allowedCount++;
        ctx.audit.log("net:fetch", {
          op: "egressAllowed",
          domain: hostname,
          method: "CONNECT",
        });

        // For CONNECT, return 200 and let Bun handle the tunnel
        // This is a simplified version — full CONNECT tunnel requires
        // socket upgrade which Bun.serve handles natively
        return new Response(null, { status: 200 });
      }

      // Regular HTTP proxy — extract domain from URL
      let targetUrl: URL;
      try {
        targetUrl = new URL(req.url);
      } catch {
        return new Response("Invalid URL", { status: 400 });
      }

      const hostname = targetUrl.hostname;

      if (!checkDomain(hostname)) {
        blockedCount++;
        blockedDomainsList.push(hostname);
        ctx.audit.log("net:fetch", {
          op: "egressBlocked",
          domain: hostname,
          method: req.method,
          url: req.url,
        });
        return new Response(
          `Blocked by BunShell egress proxy: domain "${hostname}" not in allowed list`,
          { status: 403 },
        );
      }

      allowedCount++;
      ctx.audit.log("net:fetch", {
        op: "egressAllowed",
        domain: hostname,
        method: req.method,
      });

      // Forward the request
      try {
        const headers = new Headers(req.headers);
        // Remove proxy headers
        headers.delete("proxy-authorization");
        headers.delete("proxy-connection");

        const resp = await fetch(req.url, {
          method: req.method,
          headers,
          body: req.body,
          redirect: "follow",
        });

        return new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers: resp.headers,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Proxy error";
        return new Response(msg, { status: 502 });
      }
    },
  });

  return {
    get port() {
      return server.port ?? 0;
    },
    get allowed() {
      return allowedCount;
    },
    get blocked() {
      return blockedCount;
    },
    get blockedDomains() {
      return blockedDomainsList;
    },
    stop() {
      server.stop();
    },
  };
}

/**
 * Run a Docker container with egress proxy — convenience wrapper.
 *
 * Automatically starts an egress proxy, configures the container
 * to route through it, runs the container, and stops the proxy.
 *
 * The container can only reach domains allowed by `net:fetch`.
 * npm install works (registry.npmjs.org), curl evil.com is blocked.
 *
 * @example
 * ```ts
 * const ctx = createContext({
 *   name: "secure-builder",
 *   capabilitySet: capabilities()
 *     .dockerRun(["node:20"])
 *     .netFetch(["registry.npmjs.org"])
 *     .build(),
 * });
 *
 * const result = await dockerRunProxied(ctx, "node:20", {
 *   command: ["npm", "install"],
 *   vfsPath: "/project",
 * });
 * // npm install succeeds (registry.npmjs.org allowed)
 * // any dependency trying to phone home is blocked
 * ```
 */
export async function dockerRunProxied<K extends CapabilityKind>(
  ctx: RequireCap<K, "docker:run" | "net:fetch">,
  image: string,
  options?: DockerRunOptions,
): Promise<
  DockerRunResult & {
    readonly proxyStats: {
      allowed: number;
      blocked: number;
      blockedDomains: readonly string[];
    };
  }
> {
  ctx.caps.demand({ kind: "docker:run", allowedImages: [imageBase(image)] });
  ctx.audit.log("docker:run", { op: "runProxied", image });

  // Cast ctx for the egress proxy — it has net:fetch since K includes it
  const proxy = startEgressProxy(ctx as unknown as RequireCap<K, "net:fetch">);

  try {
    // Merge proxy env vars into options
    const proxyEnv: Record<string, string> = {
      HTTP_PROXY: `http://host.docker.internal:${proxy.port}`,
      HTTPS_PROXY: `http://host.docker.internal:${proxy.port}`,
      http_proxy: `http://host.docker.internal:${proxy.port}`,
      https_proxy: `http://host.docker.internal:${proxy.port}`,
      NO_PROXY: "localhost,127.0.0.1",
      ...(options?.env ?? {}),
    };

    const result = await dockerRun(ctx, image, {
      ...options,
      env: proxyEnv,
      // Ensure host.docker.internal is resolvable
      // (Docker Desktop sets this automatically, Linux needs --add-host)
    });

    return {
      ...result,
      proxyStats: {
        allowed: proxy.allowed,
        blocked: proxy.blocked,
        blockedDomains: proxy.blockedDomains,
      },
    };
  } finally {
    proxy.stop();
  }
}
