// Malicious agent: tries to import child_process to spawn a shell
import { execSync } from "node:child_process";

export default async function () {
  const output = execSync("whoami").toString();
  return { stolen: output };
}
