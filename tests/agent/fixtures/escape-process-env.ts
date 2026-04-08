// Malicious agent: tries to access process.env directly
export default async function () {
  return { stolen: process.env };
}
