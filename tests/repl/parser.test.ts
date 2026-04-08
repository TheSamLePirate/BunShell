import { describe, it, expect } from "bun:test";
import {
  tokenize,
  parseCommand,
  parsePipeline,
  getCurrentWord,
} from "../../src/repl/parser";

describe("tokenize", () => {
  it("splits on spaces", () => {
    expect(tokenize("ls -la /tmp")).toEqual(["ls", "-la", "/tmp"]);
  });

  it("handles double quotes", () => {
    expect(tokenize('grep "hello world" file.txt')).toEqual([
      "grep",
      "hello world",
      "file.txt",
    ]);
  });

  it("handles single quotes", () => {
    expect(tokenize("echo 'foo bar'")).toEqual(["echo", "foo bar"]);
  });

  it("handles escaped spaces", () => {
    expect(tokenize("cat my\\ file.txt")).toEqual(["cat", "my file.txt"]);
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles multiple spaces", () => {
    expect(tokenize("ls    -la")).toEqual(["ls", "-la"]);
  });
});

describe("parseCommand", () => {
  it("parses command and args", () => {
    const result = parseCommand(["ls", "/tmp", "/var"]);
    expect(result.command).toBe("ls");
    expect(result.args).toEqual(["/tmp", "/var"]);
  });

  it("parses long flags", () => {
    const result = parseCommand(["ls", "--recursive", "--glob=*.ts"]);
    expect(result.flags["recursive"]).toBe(true);
    expect(result.flags["glob"]).toBe("*.ts");
  });

  it("parses short flags", () => {
    const result = parseCommand(["ls", "-r", "-a"]);
    expect(result.flags["r"]).toBe(true);
    expect(result.flags["a"]).toBe(true);
  });

  it("separates flags from args", () => {
    const result = parseCommand([
      "grep",
      "--ignore-case",
      "pattern",
      "file.txt",
    ]);
    expect(result.flags["ignore-case"]).toBe(true);
    expect(result.args).toEqual(["pattern", "file.txt"]);
  });

  it("handles empty tokens", () => {
    const result = parseCommand([]);
    expect(result.command).toBe("");
    expect(result.args).toEqual([]);
  });
});

describe("parsePipeline", () => {
  it("parses single command", () => {
    const result = parsePipeline("ls /tmp");
    expect(result.commands.length).toBe(1);
    expect(result.commands[0]!.command).toBe("ls");
  });

  it("splits on pipes", () => {
    const result = parsePipeline("ls src | filter extension=ts | count");
    expect(result.commands.length).toBe(3);
    expect(result.commands[0]!.command).toBe("ls");
    expect(result.commands[1]!.command).toBe("filter");
    expect(result.commands[2]!.command).toBe("count");
  });

  it("preserves args across pipe segments", () => {
    const result = parsePipeline(
      "ls src --recursive | sortby size desc | take 5",
    );
    expect(result.commands[0]!.flags["recursive"]).toBe(true);
    expect(result.commands[1]!.args).toEqual(["size", "desc"]);
    expect(result.commands[2]!.args).toEqual(["5"]);
  });

  it("does not split on pipes inside quotes", () => {
    const result = parsePipeline('grep "a|b" file.txt');
    expect(result.commands.length).toBe(1);
    expect(result.commands[0]!.args[0]).toBe("a|b");
  });
});

describe("getCurrentWord", () => {
  it("returns empty word when line ends with space", () => {
    const result = getCurrentWord("ls ");
    expect(result.word).toBe("");
    expect(result.tokenIndex).toBe(1);
  });

  it("returns partial word at end", () => {
    const result = getCurrentWord("ls /tm");
    expect(result.word).toBe("/tm");
    expect(result.tokenIndex).toBe(1);
  });

  it("returns command when first word", () => {
    const result = getCurrentWord("he");
    expect(result.word).toBe("he");
    expect(result.tokenIndex).toBe(0);
  });

  it("handles empty line", () => {
    const result = getCurrentWord("");
    expect(result.word).toBe("");
    expect(result.tokenIndex).toBe(0);
  });
});
