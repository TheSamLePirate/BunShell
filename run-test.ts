import { runAgent } from "./src/agent/sandbox";
import { capabilities } from "./src/capabilities/builder";

async function run() {
  const result = await runAgent({
    name: "test-escape",
    script: "./test-escape.ts",
    capabilities: capabilities().build().capabilities.slice()
  });
  console.log(result);
}
run();
