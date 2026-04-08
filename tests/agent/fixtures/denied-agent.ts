import type { CapabilityContext } from "../../../src/capabilities/types";
import { ls } from "../../../src/wrappers/fs";

export default async function (ctx: CapabilityContext) {
  // This agent tries to read /etc which it doesn't have access to
  await ls(ctx, "/etc");
  return { shouldNotReach: true };
}
