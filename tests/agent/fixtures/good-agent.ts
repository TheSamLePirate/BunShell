import type { CapabilityContext } from "bunshell";
import { ls } from "bunshell";

export default async function (ctx: CapabilityContext) {
  const files = await ls(ctx, ".");
  return { count: files.length };
}
