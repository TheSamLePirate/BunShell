/**
 * Example 1: Basic ls with typed output.
 *
 * Demonstrates the simplest use case — creating a context
 * and using a structured wrapper.
 */

import { createContext, capabilities } from "../src/capabilities/index";
import { ls } from "../src/wrappers/fs";

const ctx = createContext({
  name: "basic-ls",
  capabilities: capabilities().fsRead("**").build().capabilities.slice(),
});

const files = await ls(ctx, ".", { sortBy: "size", order: "desc" });

for (const f of files) {
  const kind = f.isDirectory ? "DIR " : "FILE";
  console.log(
    `${kind} ${f.name.padEnd(30)} ${String(f.size).padStart(10)} bytes`,
  );
}
