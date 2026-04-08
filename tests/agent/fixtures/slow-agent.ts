import type { CapabilityContext } from "bunshell";

export default async function (_ctx: CapabilityContext) {
  // This agent takes too long and should be killed by timeout
  await new Promise((resolve) => setTimeout(resolve, 30000));
  return { shouldNotReach: true };
}
