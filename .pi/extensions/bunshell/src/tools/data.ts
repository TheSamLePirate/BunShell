/**
 * bunshell_data — data parsing, crypto, and encoding (mostly pure computation).
 */

import { Type, type Static } from "@sinclair/typebox";
import type { LoadedEnvironment } from "../../../../../src/config/loader";
import {
  parseJSON,
  formatJSON,
  parseCSV,
  formatCSV,
  parseTOML,
  base64Encode,
  base64DecodeString,
} from "../../../../../src/wrappers/data";
import { hash, randomUUID } from "../../../../../src/wrappers/crypto";

const DataActions = Type.Union([
  Type.Literal("parseJSON"),
  Type.Literal("formatJSON"),
  Type.Literal("parseCSV"),
  Type.Literal("formatCSV"),
  Type.Literal("parseTOML"),
  Type.Literal("hash"),
  Type.Literal("base64Encode"),
  Type.Literal("base64Decode"),
  Type.Literal("randomUUID"),
]);

export const BunShellDataParams = Type.Object({
  action: DataActions,
  input: Type.Optional(Type.String({ description: "Input text to process" })),
  algorithm: Type.Optional(
    Type.String({ description: "Hash algorithm (sha256, sha512, md5)" }),
  ),
});

type DataParams = Static<typeof BunShellDataParams>;

export function createDataTool(_env: LoadedEnvironment) {
  return {
    name: "bunshell_data",
    label: "BunShell Data",
    description:
      "Data parsing, hashing, and encoding. Actions: parseJSON, formatJSON, parseCSV, formatCSV, parseTOML, hash, base64Encode, base64Decode, randomUUID. No capabilities needed (pure computation).",
    promptSnippet:
      "Use bunshell_data for parsing JSON/CSV/TOML, hashing, and encoding.",
    parameters: BunShellDataParams,

    async execute(_toolCallId: string, params: DataParams) {
      try {
        let result: unknown;

        switch (params.action) {
          case "parseJSON":
            if (!params.input) throw new Error("parseJSON requires 'input'");
            result = parseJSON(params.input);
            break;
          case "formatJSON":
            if (!params.input) throw new Error("formatJSON requires 'input'");
            result = formatJSON(JSON.parse(params.input), 2);
            break;
          case "parseCSV":
            if (!params.input) throw new Error("parseCSV requires 'input'");
            result = parseCSV(params.input);
            break;
          case "formatCSV":
            if (!params.input) throw new Error("formatCSV requires 'input'");
            result = formatCSV(JSON.parse(params.input));
            break;
          case "parseTOML":
            if (!params.input) throw new Error("parseTOML requires 'input'");
            result = parseTOML(params.input);
            break;
          case "hash":
            if (!params.input) throw new Error("hash requires 'input'");
            result = hash(
              params.input,
              (params.algorithm as "sha256") ?? "sha256",
            );
            break;
          case "base64Encode":
            if (!params.input) throw new Error("base64Encode requires 'input'");
            result = base64Encode(params.input);
            break;
          case "base64Decode":
            if (!params.input) throw new Error("base64Decode requires 'input'");
            result = base64DecodeString(params.input);
            break;
          case "randomUUID":
            result = randomUUID();
            break;
          default:
            throw new Error(`Unknown data action: ${params.action}`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
          details: { action: params.action },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { action: params.action },
          isError: true,
        };
      }
    },
  };
}
