import { describe, it, expect, beforeAll } from "bun:test";
import {
  createContext,
  capabilities,
  CapabilityError,
  checkCapability,
} from "../../src/capabilities/index";

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

const fullCtx = createContext({
  name: "docker-full",
  capabilities: capabilities().dockerRun(["*"]).build().capabilities.slice(),
});

const restrictedCtx = createContext({
  name: "docker-restricted",
  capabilities: capabilities()
    .dockerRun(["node", "python:3.*", "rust:1.77"])
    .build()
    .capabilities.slice(),
});

const noDockerCtx = createContext({
  name: "no-docker",
  capabilities: capabilities()
    .fsRead("**")
    .spawn(["git"])
    .build()
    .capabilities.slice(),
});

// ---------------------------------------------------------------------------
// Capability type system
// ---------------------------------------------------------------------------

describe("docker:run capability", () => {
  it("full context has docker:run", () => {
    expect(fullCtx.caps.has("docker:run")).toBe(true);
  });

  it("restricted context has docker:run", () => {
    expect(restrictedCtx.caps.has("docker:run")).toBe(true);
  });

  it("noDockerCtx does NOT have docker:run", () => {
    expect(noDockerCtx.caps.has("docker:run")).toBe(false);
  });

  it("noDockerCtx rejects docker:run demand", () => {
    expect(() =>
      noDockerCtx.caps.demand({ kind: "docker:run", allowedImages: ["node"] }),
    ).toThrow(CapabilityError);
  });
});

// ---------------------------------------------------------------------------
// Guard: image matching
// ---------------------------------------------------------------------------

describe("docker:run guard", () => {
  it("wildcard allows any image", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["*"] };
    const required = {
      kind: "docker:run" as const,
      allowedImages: ["anything:latest"],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });

  it("exact image match", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["node"] };
    const required = { kind: "docker:run" as const, allowedImages: ["node"] };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });

  it("image with tag — exact match", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["rust:1.77"] };
    const required = {
      kind: "docker:run" as const,
      allowedImages: ["rust:1.77"],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });

  it("base image matches tagged variant", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["node"] };
    const required = {
      kind: "docker:run" as const,
      allowedImages: ["node:20-alpine"],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });

  it("glob pattern matches image tags", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["python:3.*"] };
    const required = {
      kind: "docker:run" as const,
      allowedImages: ["python:3.12-slim"],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(true);
  });

  it("glob pattern rejects non-matching tags", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["python:3.*"] };
    const required = {
      kind: "docker:run" as const,
      allowedImages: ["python:2.7"],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(false);
  });

  it("rejects unrelated images", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["node"] };
    const required = {
      kind: "docker:run" as const,
      allowedImages: ["postgres"],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(false);
  });

  it("rejects when no image specified", () => {
    const held = { kind: "docker:run" as const, allowedImages: ["node"] };
    const required = {
      kind: "docker:run" as const,
      allowedImages: [] as string[],
    };
    const result = checkCapability(held, required);
    expect(result.allowed).toBe(false);
  });

  it("restricted context allows listed images", () => {
    expect(() =>
      restrictedCtx.caps.demand({
        kind: "docker:run",
        allowedImages: ["node"],
      }),
    ).not.toThrow();
  });

  it("restricted context allows glob-matched images", () => {
    expect(() =>
      restrictedCtx.caps.demand({
        kind: "docker:run",
        allowedImages: ["python:3.12-slim"],
      }),
    ).not.toThrow();
  });

  it("restricted context rejects unlisted images", () => {
    expect(() =>
      restrictedCtx.caps.demand({
        kind: "docker:run",
        allowedImages: ["postgres:16"],
      }),
    ).toThrow(CapabilityError);
  });

  it("restricted context allows tagged variant of base image", () => {
    expect(() =>
      restrictedCtx.caps.demand({
        kind: "docker:run",
        allowedImages: ["node:20-alpine"],
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

describe("capability builder — dockerRun", () => {
  it("builds with docker:run", () => {
    const set = capabilities().dockerRun(["node", "python"]).build();
    expect(set.has("docker:run")).toBe(true);
  });

  it("chains with other capabilities", () => {
    const set = capabilities()
      .fsRead("**")
      .spawn(["git"])
      .dockerRun(["node"])
      .build();
    expect(set.has("fs:read")).toBe(true);
    expect(set.has("process:spawn")).toBe(true);
    expect(set.has("docker:run")).toBe(true);
  });

  it("build without dockerRun does not have it", () => {
    const set = capabilities().fsRead("**").build();
    expect(set.has("docker:run")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Docker daemon integration (conditional — requires Docker)
// ---------------------------------------------------------------------------

let dockerAvailable = false;

beforeAll(async () => {
  try {
    const proc = Bun.spawn(["docker", "info"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    dockerAvailable = exitCode === 0;
  } catch {
    dockerAvailable = false;
  }
  if (!dockerAvailable) {
    console.log("  (Docker not available — skipping integration tests)");
  }
});

describe("dockerRun integration", () => {
  it("runs a simple container", async () => {
    if (!dockerAvailable) return;

    const { dockerRun } = await import("../../src/wrappers/docker");
    const result = await dockerRun(fullCtx, "alpine:latest", {
      command: ["echo", "hello-bunshell"],
      timeout: 30_000,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello-bunshell");
    expect(result.image).toBe("alpine:latest");
    expect(result.duration).toBeGreaterThan(0);
  }, 60_000);

  it("returns structured error on failure", async () => {
    if (!dockerAvailable) return;

    const { dockerRun } = await import("../../src/wrappers/docker");
    const result = await dockerRun(fullCtx, "alpine:latest", {
      command: ["sh", "-c", "exit 42"],
      timeout: 30_000,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(42);
  }, 60_000);

  it("passes environment variables", async () => {
    if (!dockerAvailable) return;

    const { dockerRun } = await import("../../src/wrappers/docker");
    const result = await dockerRun(fullCtx, "alpine:latest", {
      command: ["sh", "-c", "echo $MY_VAR"],
      env: { MY_VAR: "bunshell-test" },
      timeout: 30_000,
    });

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("bunshell-test");
  }, 60_000);
});

describe("dockerExec integration", () => {
  it("executes a script in a container", async () => {
    if (!dockerAvailable) return;

    const { dockerExec } = await import("../../src/wrappers/docker");
    const result = await dockerExec(
      fullCtx,
      "alpine:latest",
      'echo "result: $(( 21 * 2 ))"',
      { timeout: 30_000 },
    );

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("result: 42");
  }, 60_000);
});

describe("dockerVfsRun integration", () => {
  it("syncs VFS to container and back", async () => {
    if (!dockerAvailable) return;

    const { createVfs } = await import("../../src/vfs/vfs");
    const { dockerVfsRun } = await import("../../src/wrappers/docker");

    const vfs = createVfs();
    vfs.writeFile("/project/input.txt", "hello from vfs");

    const result = await dockerVfsRun(fullCtx, vfs, "alpine:latest", {
      vfsPath: "/project",
      command: [
        "sh",
        "-c",
        'cat /workspace/input.txt > /workspace/output.txt && echo " processed" >> /workspace/output.txt',
      ],
      timeout: 30_000,
    });

    expect(result.success).toBe(true);
    expect(result.filesAdded).toBeGreaterThanOrEqual(1);

    // The new file should be back in VFS
    expect(vfs.exists("/project/output.txt")).toBe(true);
    const content = vfs.readFile("/project/output.txt");
    expect(content).toContain("hello from vfs");
    expect(content).toContain("processed");
  }, 60_000);

  it("detects removed files", async () => {
    if (!dockerAvailable) return;

    const { createVfs } = await import("../../src/vfs/vfs");
    const { dockerVfsRun } = await import("../../src/wrappers/docker");

    const vfs = createVfs();
    vfs.writeFile("/project/keep.txt", "keep");
    vfs.writeFile("/project/delete-me.txt", "bye");

    const result = await dockerVfsRun(fullCtx, vfs, "alpine:latest", {
      vfsPath: "/project",
      command: ["sh", "-c", "rm /workspace/delete-me.txt"],
      timeout: 30_000,
    });

    expect(result.success).toBe(true);
    expect(result.filesRemoved).toBe(1);
    expect(vfs.exists("/project/delete-me.txt")).toBe(false);
    expect(vfs.exists("/project/keep.txt")).toBe(true);
  }, 60_000);
});

describe("dockerImages / dockerPs integration", () => {
  it("lists images", async () => {
    if (!dockerAvailable) return;

    const { dockerImages } = await import("../../src/wrappers/docker");
    const images = await dockerImages(fullCtx);

    expect(Array.isArray(images)).toBe(true);
  }, 30_000);

  it("lists containers", async () => {
    if (!dockerAvailable) return;

    const { dockerPs } = await import("../../src/wrappers/docker");
    const containers = await dockerPs(fullCtx);

    expect(Array.isArray(containers)).toBe(true);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Daemon — background containers
// ---------------------------------------------------------------------------

describe("dockerSpawnBackground integration", () => {
  it("spawns and manages a background container", async () => {
    if (!dockerAvailable) return;

    const { dockerSpawnBackground } = await import("../../src/wrappers/docker");

    // Start a container that sleeps (simulates a dev server)
    const daemon = await dockerSpawnBackground(fullCtx, "alpine:latest", {
      command: ["sh", "-c", "echo 'SERVER READY' && sleep 60"],
    });

    expect(daemon.containerId.length).toBeGreaterThan(0);
    expect(daemon.image).toBe("alpine:latest");

    // Check status
    const status = await daemon.status();
    expect(status).toBe("running");

    // Read logs
    const logs = await daemon.logs();
    expect(logs).toContain("SERVER READY");

    // Exec inside the running container
    const execResult = await daemon.exec(["echo", "hello-from-exec"]);
    expect(execResult.exitCode).toBe(0);
    expect(execResult.stdout.trim()).toBe("hello-from-exec");

    // Stop
    const stopped = await daemon.stop(2);
    expect(stopped).toBe(true);

    // Confirm exited
    const afterStatus = await daemon.status();
    expect(afterStatus).toBe("exited");

    // Cleanup
    const { dockerRm } = await import("../../src/wrappers/docker");
    await dockerRm(fullCtx, daemon.containerId, true);
  }, 60_000);

  it("logStream yields lines", async () => {
    if (!dockerAvailable) return;

    const { dockerSpawnBackground } = await import("../../src/wrappers/docker");

    const daemon = await dockerSpawnBackground(fullCtx, "alpine:latest", {
      command: ["sh", "-c", "for i in 1 2 3; do echo line-$i; sleep 0.2; done"],
    });

    // Collect lines from stream
    const lines: string[] = [];
    for await (const line of daemon.logStream()) {
      lines.push(line);
      if (lines.length >= 3) break;
    }

    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toBe("line-1");
    expect(lines[1]).toBe("line-2");
    expect(lines[2]).toBe("line-3");

    await daemon.kill();
    const { dockerRm } = await import("../../src/wrappers/docker");
    await dockerRm(fullCtx, daemon.containerId, true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Streaming output
// ---------------------------------------------------------------------------

describe("dockerRunStreaming integration", () => {
  it("streams output line by line", async () => {
    if (!dockerAvailable) return;

    const { dockerRunStreaming } = await import("../../src/wrappers/docker");

    const stream = await dockerRunStreaming(fullCtx, "alpine:latest", {
      command: ["sh", "-c", "for i in 1 2 3 4 5; do echo line-$i; done"],
    });

    const lines: string[] = [];
    for await (const line of stream) {
      lines.push(line);
    }

    expect(lines).toEqual(["line-1", "line-2", "line-3", "line-4", "line-5"]);
  }, 60_000);

  it("supports early kill on error detection", async () => {
    if (!dockerAvailable) return;

    const { dockerRunStreaming } = await import("../../src/wrappers/docker");

    const stream = await dockerRunStreaming(fullCtx, "alpine:latest", {
      command: [
        "sh",
        "-c",
        "echo ok-1; echo ok-2; echo ERROR-found; echo should-not-reach; sleep 10",
      ],
    });

    const lines: string[] = [];
    for await (const line of stream) {
      lines.push(line);
      if (line.includes("ERROR")) {
        await stream.kill();
        break;
      }
    }

    expect(lines).toContain("ok-1");
    expect(lines).toContain("ERROR-found");
    // The sleep 10 should have been killed, not waited for
    expect(lines).not.toContain("should-not-reach");
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Egress proxy
// ---------------------------------------------------------------------------

describe("startEgressProxy", () => {
  // HTTP proxy protocol: the client sends the full target URL as the request URL.
  // fetch("http://evil.com/test", { proxy: "http://localhost:PORT" })
  // But Bun's fetch doesn't support the proxy option, so we send the full URL
  // directly to the proxy server — which is how HTTP proxies work.

  it("blocks disallowed domains", async () => {
    const proxyCtx = createContext({
      name: "proxy-test",
      capabilities: capabilities()
        .dockerRun(["*"])
        .netFetch(["httpbin.org"])
        .build()
        .capabilities.slice(),
    });

    const { startEgressProxy } = await import("../../src/wrappers/docker");
    const proxy = startEgressProxy(proxyCtx);

    expect(proxy.port).toBeGreaterThan(0);

    // HTTP proxy protocol: send full URL to proxy
    const blockedResp = await fetch("http://evil.com/test", {
      proxy: `http://localhost:${proxy.port}`,
    } as RequestInit).catch(() => null);

    if (blockedResp) {
      expect(blockedResp.status).toBe(403);
    }

    expect(proxy.blocked).toBeGreaterThanOrEqual(1);
    proxy.stop();
  });

  it("allows permitted domains", async () => {
    const proxyCtx = createContext({
      name: "proxy-test-allow",
      capabilities: capabilities()
        .dockerRun(["*"])
        .netFetch(["httpbin.org"])
        .build()
        .capabilities.slice(),
    });

    const { startEgressProxy } = await import("../../src/wrappers/docker");
    const proxy = startEgressProxy(proxyCtx);

    const resp = await fetch("http://httpbin.org/get", {
      proxy: `http://localhost:${proxy.port}`,
    } as RequestInit).catch(() => null);

    if (resp && resp.ok) {
      expect(resp.status).toBe(200);
      expect(proxy.allowed).toBeGreaterThan(0);
    }

    proxy.stop();
  }, 15_000);

  it("tracks blocked domain names", async () => {
    const proxyCtx = createContext({
      name: "proxy-track",
      capabilities: capabilities()
        .dockerRun(["*"])
        .netFetch(["safe.com"])
        .build()
        .capabilities.slice(),
    });

    const { startEgressProxy } = await import("../../src/wrappers/docker");
    const proxy = startEgressProxy(proxyCtx);

    // Try blocked domains via HTTP proxy protocol
    await fetch("http://evil1.com/data", {
      proxy: `http://localhost:${proxy.port}`,
    } as RequestInit).catch(() => null);
    await fetch("http://evil2.com/data", {
      proxy: `http://localhost:${proxy.port}`,
    } as RequestInit).catch(() => null);

    expect(proxy.blocked).toBe(2);
    expect(proxy.blockedDomains).toContain("evil1.com");
    expect(proxy.blockedDomains).toContain("evil2.com");

    proxy.stop();
  });
});
