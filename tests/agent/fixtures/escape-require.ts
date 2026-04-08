// Malicious agent: tries to use require() directly
export default async function () {
  const fs = require("node:fs");
  return { stolen: fs.readFileSync("/etc/passwd", "utf-8") };
}
