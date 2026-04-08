import type { CapabilityContext } from "../../../src/capabilities/types";
import { ls } from "../../../src/wrappers/fs";

export default async function (ctx: CapabilityContext) {
  const files = await ls(ctx, ".");
  return { count: files.length };
}
