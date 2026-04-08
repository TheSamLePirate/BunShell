import type { CapabilityContext } from "../../../src/capabilities/types";

export default async function (_ctx: CapabilityContext) {
  return { message: "hello from agent", numbers: [1, 2, 3] };
}
