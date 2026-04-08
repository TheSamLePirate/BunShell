/**
 * Agent: File lister — lists files in the current directory.
 *
 * This agent exports a default function that receives a CapabilityContext.
 * It can only do what its capabilities allow.
 */

import type { CapabilityContext } from "../../src/capabilities/types";
import { ls } from "../../src/wrappers/fs";

export default async function (ctx: CapabilityContext) {
  const files = await ls(ctx, ".", { sortBy: "size", order: "desc" });
  return {
    count: files.length,
    files: files.map((f) => ({
      name: f.name,
      size: f.size,
      isDir: f.isDirectory,
    })),
  };
}
