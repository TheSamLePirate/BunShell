import { describe, it, expect } from "bun:test";
import {
  parseJSON,
  formatJSON,
  parseCSV,
  formatCSV,
  parseTOML,
  base64Encode,
  base64Decode,
  base64DecodeString,
} from "../../src/wrappers/data";

describe("parseJSON / formatJSON", () => {
  it("round-trips objects", () => {
    const obj = { name: "test", nums: [1, 2, 3] };
    const json = formatJSON(obj);
    const parsed = parseJSON<typeof obj>(json);
    expect(parsed).toEqual(obj);
  });

  it("formats with custom indent", () => {
    const json = formatJSON({ a: 1 }, 4);
    expect(json).toContain("    ");
  });
});

describe("parseCSV", () => {
  it("parses CSV with headers", () => {
    const rows = parseCSV("name,age\nAlice,30\nBob,25");
    expect(rows.length).toBe(2);
    expect(rows[0]!["name"]).toBe("Alice");
    expect(rows[0]!["age"]).toBe("30");
    expect(rows[1]!["name"]).toBe("Bob");
  });

  it("handles quoted fields", () => {
    const rows = parseCSV(
      'name,desc\nAlice,"has, comma"\nBob,"he said ""hi"""',
    );
    expect(rows[0]!["desc"]).toBe("has, comma");
    expect(rows[1]!["desc"]).toBe('he said "hi"');
  });

  it("supports custom delimiter", () => {
    const rows = parseCSV("name\tage\nAlice\t30", { delimiter: "\t" });
    expect(rows[0]!["name"]).toBe("Alice");
    expect(rows[0]!["age"]).toBe("30");
  });

  it("handles empty input", () => {
    expect(parseCSV("").length).toBe(0);
  });
});

describe("formatCSV", () => {
  it("formats records as CSV", () => {
    const csv = formatCSV([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
    expect(csv).toBe("name,age\nAlice,30\nBob,25");
  });

  it("escapes fields with commas", () => {
    const csv = formatCSV([{ value: "a,b" }]);
    expect(csv).toContain('"a,b"');
  });

  it("round-trips with parseCSV", () => {
    const original = [
      { name: "Alice", city: "Paris" },
      { name: "Bob", city: "London" },
    ];
    const csv = formatCSV(original);
    const parsed = parseCSV(csv);
    expect(parsed).toEqual(original);
  });
});

describe("parseTOML", () => {
  it("parses key-value pairs", () => {
    const result = parseTOML('name = "test"\nport = 8080\nenabled = true');
    expect(result["name"]).toBe("test");
    expect(result["port"]).toBe(8080);
    expect(result["enabled"]).toBe(true);
  });

  it("parses sections", () => {
    const result = parseTOML('[server]\nport = 3000\nhost = "localhost"');
    const server = result["server"] as Record<string, unknown>;
    expect(server["port"]).toBe(3000);
    expect(server["host"]).toBe("localhost");
  });

  it("parses arrays", () => {
    const result = parseTOML('tags = ["a", "b", "c"]');
    expect(result["tags"]).toEqual(["a", "b", "c"]);
  });

  it("ignores comments", () => {
    const result = parseTOML('# comment\nkey = "value"');
    expect(result["key"]).toBe("value");
  });
});

describe("base64", () => {
  it("encodes string to base64", () => {
    expect(base64Encode("hello world")).toBe("aGVsbG8gd29ybGQ=");
  });

  it("encodes Uint8Array to base64", () => {
    const bytes = new TextEncoder().encode("hello");
    expect(base64Encode(bytes)).toBe("aGVsbG8=");
  });

  it("decodes base64 to bytes", () => {
    const bytes = base64Decode("aGVsbG8=");
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("decodes base64 to string", () => {
    expect(base64DecodeString("aGVsbG8gd29ybGQ=")).toBe("hello world");
  });

  it("round-trips", () => {
    const original = "BunShell is great!";
    expect(base64DecodeString(base64Encode(original))).toBe(original);
  });
});
