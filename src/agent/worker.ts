/**
 * Sandbox worker — runs inside a subprocess.
 *
 * Receives capability config via IPC, creates a sandboxed context,
 * loads and executes the agent script, reports results back.
 *
 * @internal
 * @module
 */

import type { WorkerInit, WorkerMessage } from "./types";
import type { AuditLogger, CapabilityKind } from "../capabilities/types";
import type { AuditEntry } from "../audit/types";
import { createContext } from "../capabilities/context";

function send(msg: WorkerMessage): void {
  if (process.send) {
    process.send(msg);
  }
}

function createWorkerAudit(agentId: string, agentName: string): AuditLogger {
  return {
    log(capability: CapabilityKind, details: Record<string, unknown>): void {
      const entry: AuditEntry = {
        timestamp: new Date(),
        agentId,
        agentName,
        capability,
        operation:
          typeof details["op"] === "string" ? details["op"] : "unknown",
        args: details,
        result: "success",
      };
      send({ type: "audit", entry });
    },
  };
}

async function main(): Promise<void> {
  // Wait for init message from parent
  const init = await new Promise<WorkerInit>((resolve) => {
    process.on("message", (msg: WorkerInit) => {
      resolve(msg);
    });
  });

  const audit = createWorkerAudit(init.agentId, init.agentName);
  const ctx = createContext({
    name: init.agentName,
    capabilities: init.capabilities,
    audit,
    id: init.agentId,
  });

  try {
    const mod = await import(init.script);
    const agentFn = mod.default;

    if (typeof agentFn !== "function") {
      send({
        type: "error",
        message: `Agent script must export a default function, got ${typeof agentFn}`,
      });
      process.exit(1);
      return;
    }

    const output = await agentFn(ctx);
    send({ type: "result", output: output ?? null });
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", message });
    process.exit(1);
  }
}

main();
