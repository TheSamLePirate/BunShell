import { describe, it, expect } from "bun:test";
import { runAgent } from "../../src/agent/sandbox";
import { capabilities } from "../../src/capabilities/index";
import { join } from "node:path";

const fixturesDir = join(import.meta.dir, "fixtures");

describe("runAgent", () => {
  it("runs a simple agent and returns output", async () => {
    const result = await runAgent({
      name: "test-good",
      script: join(fixturesDir, "good-agent.ts"),
      capabilities: capabilities().fsRead("**").build().capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toBeDefined();
    const output = result.output as { count: number };
    expect(output.count).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
  }, 15000);

  it("returns structured output from agent", async () => {
    const result = await runAgent({
      name: "test-return",
      script: join(fixturesDir, "return-value-agent.ts"),
      capabilities: capabilities().build().capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(true);
    const output = result.output as { message: string; numbers: number[] };
    expect(output.message).toBe("hello from agent");
    expect(output.numbers).toEqual([1, 2, 3]);
  }, 15000);

  it("fails when agent exceeds capabilities", async () => {
    const result = await runAgent({
      name: "test-denied",
      script: join(fixturesDir, "denied-agent.ts"),
      capabilities: capabilities()
        .fsRead(join(fixturesDir, "**"))
        .build()
        .capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Capability denied");
  }, 15000);

  it("kills agent on timeout", async () => {
    const result = await runAgent({
      name: "test-slow",
      script: join(fixturesDir, "slow-agent.ts"),
      capabilities: capabilities().build().capabilities.slice(),
      timeout: 500,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  }, 10000);

  it("collects audit trail from agent", async () => {
    const result = await runAgent({
      name: "test-audit",
      script: join(fixturesDir, "good-agent.ts"),
      capabilities: capabilities().fsRead("**").build().capabilities.slice(),
      timeout: 10000,
    });

    expect(result.success).toBe(true);
    expect(result.auditTrail.length).toBeGreaterThan(0);
    expect(result.auditTrail[0]!.capability).toBe("fs:read");
    expect(result.auditTrail[0]!.agentName).toBe("test-audit");
  }, 15000);
});
