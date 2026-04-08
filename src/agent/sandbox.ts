/**
 * Agent sandbox — subprocess-isolated agent execution.
 *
 * Each agent runs in its own Bun subprocess. Capabilities are
 * passed via IPC and enforced within the subprocess. The host
 * collects audit entries and results through IPC messages.
 *
 * @module
 */

import { resolve } from "node:path";
import { fork } from "node:child_process";
import type {
  AgentConfig,
  AgentResult,
  WorkerMessage,
  WorkerInit,
} from "./types";
import type { AuditEntry } from "../audit/types";

const WORKER_PATH = resolve(import.meta.dir, "worker.ts");

/**
 * Run an agent script in a sandboxed subprocess.
 *
 * The agent receives a CapabilityContext and can only use operations
 * allowed by its granted capabilities. All operations are audited.
 *
 * @example
 * ```ts
 * const result = await runAgent({
 *   name: "log-analyzer",
 *   script: "./agents/log-analyzer.ts",
 *   capabilities: capabilities()
 *     .fsRead("/var/log/**")
 *     .build()
 *     .capabilities.slice(),
 *   timeout: 10000,
 * });
 *
 * if (result.success) {
 *   console.log("Output:", result.output);
 *   console.log("Audit trail:", result.auditTrail);
 * }
 * ```
 */
export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const absScript = resolve(config.script);
  const agentId = `${config.name}-${Date.now().toString(36)}`;
  const start = performance.now();

  return new Promise<AgentResult>((resolvePromise) => {
    const auditTrail: AuditEntry[] = [];
    let output: unknown = null;
    let errorMessage: string | undefined;
    let settled = false;

    function finish(exitCode: number): void {
      if (settled) return;
      settled = true;
      const duration = performance.now() - start;

      // Forward audit entries to configured sinks
      if (config.sinks) {
        for (const entry of auditTrail) {
          for (const sink of config.sinks) {
            sink.write(entry);
          }
        }
      }

      resolvePromise({
        success: exitCode === 0 && !errorMessage,
        exitCode,
        output,
        auditTrail,
        duration,
        error: errorMessage,
      });
    }

    const child = fork(WORKER_PATH, [], {
      execArgv: [],
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      execPath: "bun",
    });

    // Handle IPC messages from worker
    child.on("message", (msg: WorkerMessage) => {
      switch (msg.type) {
        case "audit":
          // Revive Date objects from JSON serialization
          auditTrail.push({
            ...msg.entry,
            timestamp: new Date(msg.entry.timestamp),
          });
          break;
        case "result":
          output = msg.output;
          break;
        case "error":
          errorMessage = msg.message;
          break;
      }
    });

    child.on("exit", (code) => {
      finish(code ?? 1);
    });

    child.on("error", (err) => {
      errorMessage = err.message;
      finish(1);
    });

    // Set timeout if configured
    if (config.timeout) {
      setTimeout(() => {
        if (!settled) {
          errorMessage = `Agent timed out after ${config.timeout}ms`;
          child.kill("SIGKILL");
          finish(124);
        }
      }, config.timeout);
    }

    // Send init message to worker
    const initMsg: WorkerInit = {
      script: absScript,
      capabilities: config.capabilities.slice(),
      agentName: config.name,
      agentId,
    };
    child.send(initMsg);
  });
}
