# BunShell Improvement Plan: Sandbox Isolation and File Traversal

This document outlines the required implementation steps to address two critical security flaws in BunShell: the cooperative sandbox bypass and the recursive file traversal capability bypass.

## 1. Addressing the Recursive File Traversal Bypass

Currently, recursive operations (like `ls`, `du`, `cp`, and `rm`) only check permissions against the top-level path provided as an argument. They fail to validate permissions against nested files and directories discovered during the recursive traversal.

### Target Files:
* `src/wrappers/fs.ts`
* `tests/wrappers/fs.test.ts`

### Implementation Steps:

1.  **`ls` / `find` (Custom Walkers):**
    *   Inside the `walk(dir)` function in `ls`, update the loop to invoke `ctx.caps.check({ kind: "fs:read", pattern: fullPath })` for every newly discovered `fullPath`.
    *   If the check fails, the item should be silently skipped (or logged as a denial if an audit flag is set, but to match standard Unix `ls` behavior on denied directories, skipping/excluding is preferred). Do *not* throw an error, as partial reads are normal.

2.  **`du` (Custom Walker):**
    *   Similar to `ls`, add a capability check inside `walk(dir)` for each discovered file/directory. If a file is denied, do not add its size to the total byte count.

3.  **`rm` (Native Delegation):**
    *   Currently, `rm` delegates entirely to `node:fs/promises.rm(absPath, { recursive: true })`.
    *   If `recursive: true` is set, we must assert that the context has blanket permission to delete everything underneath the path. This requires verifying a wildcard capability like `fs:delete` for `${absPath}/**`.
    *   *Alternative:* Implement a custom walker for `rm` that checks each file individually before unlinking, mimicking the `ls` fix, but native delegation is faster. If keeping native delegation, we must enforce the wildcard requirement.

4.  **`cp` (Native Delegation):**
    *   Like `rm`, `cp` delegates to `node:fs/promises.cp(src, dest, { recursive: true })`.
    *   We must enforce wildcard requirements for both `fs:read` on `${absSrc}/**` and `fs:write` on `${absDest}/**`.

## 2. Implementing True Sandboxing via `node:vm`

Currently, `src/agent/worker.ts` executes agent scripts via native dynamic import (`await import(init.script)`). This allows an agent to bypass Bunshell's wrappers entirely by importing `node:fs`, `node:child_process`, etc. We must migrate to the `node:vm` module to enforce isolation.

### Target Files:
* `src/agent/worker.ts`
* `src/agent/types.ts`
* `tests/agent/sandbox.test.ts` (needs new tests confirming `node:fs` imports fail)

### Implementation Steps:

1.  **Refactor `worker.ts` to use `vm.SourceTextModule` or `vm.runInNewContext`:**
    *   Read the contents of the agent script directly into a string.
    *   Create a clean, isolated context using `vm.createContext()`.

2.  **Inject Safe APIs into the Sandbox Context:**
    *   The sandbox context must *only* contain safe globals (like `console`, `setTimeout`, etc.).
    *   To allow agents to write code like `import { ls } from "bunshell"`, we must intercept imports. If using `vm.SourceTextModule` (which supports ESM), we must provide a custom `linker` function.
    *   The `linker` will resolve `"bunshell"` (or `@bunshell/*` imports if allowed in user-land) to a synthetic module that only exports the Bunshell wrappers (`fs`, `process`, `pipe`, `capabilities`).
    *   All attempts to import node built-ins (`node:fs`, `node:child_process`) or external modules not explicitly whitelisted via the linker must throw an error.

3.  **Pass Context and Execute:**
    *   Evaluate the script within the VM context.
    *   Extract the default export function.
    *   Invoke the function, passing the `CapabilityContext`.

4.  **Security Considerations for the VM Context:**
    *   Ensure the agent cannot escape the VM by manipulating constructors (e.g., `constructor.constructor("return process")()`). Basic `node:vm` protects against this, but careful construction of the injected globals is necessary.
    *   Ensure any functions passed *into* the VM (like the Bunshell wrappers themselves) don't inadvertently leak the host context. Bunshell wrappers operate via the `CapabilityContext`, so as long as the context instance is secure, the wrappers are secure.

## 3. Testing Strategy

1.  **FS Traversal Tests:**
    *   Write a test that grants read access to a parent directory but specifically denies read access to a specific nested folder.
    *   Run a recursive `ls` and verify the denied folder (and its children) do not appear in the result.
2.  **Sandbox Escape Tests:**
    *   Write a malicious agent script that attempts to:
        *   `import fs from "node:fs"` and read a file.
        *   `import cp from "node:child_process"` and spawn a shell.
        *   Access `process.env` directly.
    *   Assert that `runAgent` catches these attempts and fails the execution with appropriate security errors.
