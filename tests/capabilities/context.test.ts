import { describe, it, expect } from "bun:test";
import { createContext, CapabilityError } from "../../src/capabilities/index";
import type {
  Capability,
  AuditLogger,
  CapabilityKind,
} from "../../src/capabilities/index";

// ---------------------------------------------------------------------------
// createContext
// ---------------------------------------------------------------------------

describe("createContext", () => {
  const caps: Capability[] = [
    { kind: "fs:read", pattern: "/tmp/**" },
    { kind: "fs:write", pattern: "/tmp/**" },
    { kind: "process:spawn", allowedBinaries: ["git", "bun"] },
  ];

  it("creates a context with the given name", () => {
    const ctx = createContext({ name: "test-agent", capabilities: caps });
    expect(ctx.name).toBe("test-agent");
  });

  it("generates a unique ID if not provided", () => {
    const ctx1 = createContext({ name: "agent", capabilities: caps });
    const ctx2 = createContext({ name: "agent", capabilities: caps });
    expect(ctx1.id).not.toBe(ctx2.id);
  });

  it("uses provided ID when given", () => {
    const ctx = createContext({
      name: "agent",
      capabilities: caps,
      id: "custom-id",
    });
    expect(ctx.id).toBe("custom-id");
  });

  it("wraps capabilities in a CapabilitySet", () => {
    const ctx = createContext({ name: "agent", capabilities: caps });
    expect(ctx.caps.has("fs:read")).toBe(true);
    expect(ctx.caps.has("fs:write")).toBe(true);
    expect(ctx.caps.has("process:spawn")).toBe(true);
    expect(ctx.caps.has("net:fetch")).toBe(false);
  });

  it("uses noop audit logger by default", () => {
    const ctx = createContext({ name: "agent", capabilities: caps });
    // Should not throw
    ctx.audit.log("fs:read", { op: "test" });
  });

  it("uses provided audit logger", () => {
    const entries: Array<{
      capability: CapabilityKind;
      details: Record<string, unknown>;
    }> = [];
    const logger: AuditLogger = {
      log(capability, details) {
        entries.push({ capability, details });
      },
    };

    const ctx = createContext({
      name: "agent",
      capabilities: caps,
      audit: logger,
    });

    ctx.audit.log("fs:read", { op: "ls", path: "/tmp" });
    expect(entries.length).toBe(1);
    expect(entries[0]!.capability).toBe("fs:read");
  });
});

// ---------------------------------------------------------------------------
// derive() — capability reduction
// ---------------------------------------------------------------------------

describe("derive", () => {
  const parentCaps: Capability[] = [
    { kind: "fs:read", pattern: "/tmp/**" },
    { kind: "fs:write", pattern: "/tmp/**" },
    { kind: "process:spawn", allowedBinaries: ["git", "bun"] },
    { kind: "net:fetch", allowedDomains: ["api.github.com"] },
  ];

  it("creates a sub-context with fewer capabilities", () => {
    const parent = createContext({
      name: "parent",
      capabilities: parentCaps,
    });

    const child = parent.derive("child", [
      { kind: "fs:read", pattern: "/tmp/child/**" },
    ]);

    expect(child.name).toBe("child");
    expect(child.caps.has("fs:read")).toBe(true);
    expect(child.caps.has("fs:write")).toBe(false);
    expect(child.caps.has("process:spawn")).toBe(false);
  });

  it("cannot escalate beyond parent capabilities", () => {
    const parent = createContext({
      name: "parent",
      capabilities: parentCaps,
    });

    // Try to get fs:delete which parent doesn't have
    const child = parent.derive("child", [
      { kind: "fs:read", pattern: "/tmp/**" },
      { kind: "fs:delete", pattern: "/tmp/**" },
    ]);

    expect(child.caps.has("fs:read")).toBe(true);
    expect(child.caps.has("fs:delete")).toBe(false);
  });

  it("cannot widen path patterns beyond parent", () => {
    const parent = createContext({
      name: "parent",
      capabilities: [{ kind: "fs:read", pattern: "/tmp/**" }],
    });

    // Child requests broader access than parent allows
    const child = parent.derive("child", [
      { kind: "fs:read", pattern: "/etc/passwd" },
    ]);

    // /etc/passwd doesn't match /tmp/** so it should be dropped
    expect(child.caps.capabilities.length).toBe(0);
  });

  it("derives inherit the parent's audit logger", () => {
    const entries: Array<{
      capability: CapabilityKind;
      details: Record<string, unknown>;
    }> = [];
    const logger: AuditLogger = {
      log(capability, details) {
        entries.push({ capability, details });
      },
    };

    const parent = createContext({
      name: "parent",
      capabilities: parentCaps,
      audit: logger,
    });

    const child = parent.derive("child", [
      { kind: "fs:read", pattern: "/tmp/child/**" },
    ]);

    child.audit.log("fs:read", { op: "ls" });
    expect(entries.length).toBe(1);
  });

  it("generates unique ID for derived context", () => {
    const parent = createContext({
      name: "parent",
      capabilities: parentCaps,
    });

    const child1 = parent.derive("child", [
      { kind: "fs:read", pattern: "/tmp/**" },
    ]);
    const child2 = parent.derive("child", [
      { kind: "fs:read", pattern: "/tmp/**" },
    ]);

    expect(child1.id).not.toBe(child2.id);
    expect(child1.id).not.toBe(parent.id);
  });

  it("derived context enforces its own limits", () => {
    const parent = createContext({
      name: "parent",
      capabilities: parentCaps,
    });

    const child = parent.derive("child", [
      { kind: "fs:read", pattern: "/tmp/child/**" },
    ]);

    // Parent can read /tmp/other, child cannot
    expect(() => {
      parent.caps.demand({ kind: "fs:read", pattern: "/tmp/other/file" });
    }).not.toThrow();

    expect(() => {
      child.caps.demand({ kind: "fs:read", pattern: "/tmp/other/file" });
    }).toThrow(CapabilityError);
  });

  it("supports chained derive (grandchild)", () => {
    const parent = createContext({
      name: "parent",
      capabilities: parentCaps,
    });

    const child = parent.derive("child", [
      { kind: "fs:read", pattern: "/tmp/**" },
      { kind: "process:spawn", allowedBinaries: ["git"] },
    ]);

    const grandchild = child.derive("grandchild", [
      { kind: "fs:read", pattern: "/tmp/gc/**" },
    ]);

    expect(grandchild.caps.has("fs:read")).toBe(true);
    expect(grandchild.caps.has("process:spawn")).toBe(false);
  });
});
