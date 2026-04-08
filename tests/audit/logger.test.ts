import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { createAuditLogger } from "../../src/audit/logger";
import { jsonlSink } from "../../src/audit/sinks/jsonl";
import { streamSink } from "../../src/audit/sinks/stream";
import { ls } from "../../src/wrappers/fs";
import type { AuditEntry } from "../../src/audit/types";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-audit");

beforeAll(() => {
  rmSync(testDir, { recursive: true, force: true });
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, "file.txt"), "hello");
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// createAuditLogger
// ---------------------------------------------------------------------------

describe("createAuditLogger", () => {
  it("records log() calls", () => {
    const audit = createAuditLogger({
      agentId: "test-1",
      agentName: "test-agent",
    });
    audit.log("fs:read", { op: "ls", path: "/tmp" });
    expect(audit.entries.length).toBe(1);
    expect(audit.entries[0]!.capability).toBe("fs:read");
    expect(audit.entries[0]!.operation).toBe("ls");
    expect(audit.entries[0]!.result).toBe("success");
  });

  it("records logSuccess with duration", () => {
    const audit = createAuditLogger({
      agentId: "test-1",
      agentName: "test-agent",
    });
    audit.logSuccess(
      "net:fetch",
      { op: "fetch", url: "https://example.com" },
      150,
    );
    expect(audit.entries[0]!.duration).toBe(150);
  });

  it("records logDenied with reason", () => {
    const audit = createAuditLogger({
      agentId: "test-1",
      agentName: "test-agent",
    });
    audit.logDenied(
      "fs:write",
      { op: "write", path: "/etc/passwd" },
      "Not allowed",
    );
    expect(audit.entries[0]!.result).toBe("denied");
    expect(audit.entries[0]!.error).toBe("Not allowed");
  });

  it("records logError", () => {
    const audit = createAuditLogger({
      agentId: "test-1",
      agentName: "test-agent",
    });
    audit.logError("fs:read", { op: "cat", path: "/gone" }, "ENOENT");
    expect(audit.entries[0]!.result).toBe("error");
    expect(audit.entries[0]!.error).toBe("ENOENT");
  });

  it("includes parentId when set", () => {
    const audit = createAuditLogger({
      agentId: "child-1",
      agentName: "child",
      parentId: "parent-1",
    });
    audit.log("fs:read", { op: "ls" });
    expect(audit.entries[0]!.parentId).toBe("parent-1");
  });

  it("includes timestamp", () => {
    const before = new Date();
    const audit = createAuditLogger({
      agentId: "test-1",
      agentName: "test",
    });
    audit.log("fs:read", { op: "ls" });
    const after = new Date();
    expect(audit.entries[0]!.timestamp.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(audit.entries[0]!.timestamp.getTime()).toBeLessThanOrEqual(
      after.getTime(),
    );
  });
});

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

describe("query", () => {
  function makeLogger() {
    const audit = createAuditLogger({
      agentId: "a1",
      agentName: "agent",
    });
    audit.log("fs:read", { op: "ls" });
    audit.log("fs:read", { op: "cat" });
    audit.log("fs:write", { op: "write" });
    audit.logDenied("fs:delete", { op: "rm" }, "denied");
    audit.logError("net:fetch", { op: "fetch" }, "timeout");
    return audit;
  }

  it("queries by capability", () => {
    const audit = makeLogger();
    const results = audit.query({ capability: "fs:read" });
    expect(results.length).toBe(2);
  });

  it("queries by operation", () => {
    const audit = makeLogger();
    const results = audit.query({ operation: "cat" });
    expect(results.length).toBe(1);
  });

  it("queries by result", () => {
    const audit = makeLogger();
    expect(audit.query({ result: "denied" }).length).toBe(1);
    expect(audit.query({ result: "error" }).length).toBe(1);
    expect(audit.query({ result: "success" }).length).toBe(3);
  });

  it("applies limit", () => {
    const audit = makeLogger();
    expect(audit.query({ limit: 2 }).length).toBe(2);
  });

  it("combines filters", () => {
    const audit = makeLogger();
    const results = audit.query({ capability: "fs:read", operation: "ls" });
    expect(results.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: audit + context + wrappers
// ---------------------------------------------------------------------------

describe("audit + wrappers integration", () => {
  it("records operations from wrappers automatically", async () => {
    const audit = createAuditLogger({
      agentId: "int-1",
      agentName: "integration-test",
    });
    const ctx = createContext({
      name: "integration-test",
      capabilities: capabilities().fsRead("**").build().capabilities.slice(),
      audit,
    });

    await ls(ctx, testDir);

    expect(audit.entries.length).toBe(1);
    expect(audit.entries[0]!.capability).toBe("fs:read");
    expect(audit.entries[0]!.operation).toBe("ls");
  });
});

// ---------------------------------------------------------------------------
// Sinks
// ---------------------------------------------------------------------------

describe("jsonlSink", () => {
  it("appends JSONL entries to a file", () => {
    const outPath = join(testDir, "audit.jsonl");
    const audit = createAuditLogger({
      agentId: "sink-1",
      agentName: "sink-test",
      sinks: [jsonlSink(outPath)],
    });
    audit.log("fs:read", { op: "ls" });
    audit.log("fs:write", { op: "write" });

    const content = readFileSync(outPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2);

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.capability).toBe("fs:read");
    expect(parsed.agentName).toBe("sink-test");
  });
});

describe("streamSink", () => {
  it("emits entry events in real-time", () => {
    const stream = streamSink();
    const received: AuditEntry[] = [];
    stream.on("entry", (entry) => received.push(entry));

    const audit = createAuditLogger({
      agentId: "stream-1",
      agentName: "stream-test",
      sinks: [stream],
    });

    audit.log("fs:read", { op: "ls" });
    audit.log("fs:write", { op: "write" });

    expect(received.length).toBe(2);
    expect(received[0]!.operation).toBe("ls");
    expect(received[1]!.operation).toBe("write");
  });

  it("supports off to remove listeners", () => {
    const stream = streamSink();
    const received: AuditEntry[] = [];
    const listener = (entry: AuditEntry) => received.push(entry);
    stream.on("entry", listener);

    const audit = createAuditLogger({
      agentId: "stream-2",
      agentName: "stream-off",
      sinks: [stream],
    });

    audit.log("fs:read", { op: "first" });
    stream.off("entry", listener);
    audit.log("fs:read", { op: "second" });

    expect(received.length).toBe(1);
  });
});
