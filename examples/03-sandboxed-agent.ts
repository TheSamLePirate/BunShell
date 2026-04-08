/**
 * Example 3: Sandboxed agent with limited capabilities.
 *
 * Demonstrates running an agent script in an isolated subprocess
 * with restricted permissions.
 */

import { capabilities } from "../src/capabilities/index";
import { runAgent } from "../src/agent/sandbox";
import { consoleSink } from "../src/audit/sinks/console";

const result = await runAgent({
  name: "file-lister",
  script: "./examples/agents/file-lister.ts",
  capabilities: capabilities().fsRead("**").build().capabilities.slice(),
  timeout: 5000,
  sinks: [consoleSink()],
});

console.log("\n--- Agent Result ---");
console.log("Success:", result.success);
console.log("Duration:", `${result.duration.toFixed(0)}ms`);
console.log("Output:", result.output);
console.log("Audit entries:", result.auditTrail.length);

if (result.error) {
  console.error("Error:", result.error);
}
