import type { CapabilityContext } from "bunshell";
import { ls } from "bunshell";

export default async function (ctx: CapabilityContext) {
  // This agent tries to read /etc which it doesn't have access to
  await ls(ctx, "/etc");
  return { shouldNotReach: true };
}
