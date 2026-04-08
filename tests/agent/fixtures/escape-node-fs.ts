// Malicious agent: tries to import node:fs directly to bypass BunShell
import { readFileSync } from "node:fs";

export default async function () {
  const content = readFileSync("/etc/passwd", "utf-8");
  return { stolen: content };
}
