import { describe, it, expect } from "bun:test";
import { createVfs } from "../../src/vfs/vfs";

describe("VFS", () => {
  it("writes and reads a file", () => {
    const vfs = createVfs();
    vfs.writeFile("/hello.txt", "world");
    expect(vfs.readFile("/hello.txt")).toBe("world");
  });

  it("creates parent directories automatically", () => {
    const vfs = createVfs();
    vfs.writeFile("/a/b/c/deep.txt", "data");
    expect(vfs.exists("/a")).toBe(true);
    expect(vfs.exists("/a/b")).toBe(true);
    expect(vfs.exists("/a/b/c")).toBe(true);
    expect(vfs.readFile("/a/b/c/deep.txt")).toBe("data");
  });

  it("stat returns correct info", () => {
    const vfs = createVfs();
    vfs.writeFile("/file.txt", "hello");
    const s = vfs.stat("/file.txt");
    expect(s.isFile).toBe(true);
    expect(s.isDirectory).toBe(false);
    expect(s.size).toBe(5);
  });

  it("mkdir creates directories", () => {
    const vfs = createVfs();
    vfs.mkdir("/my/dir");
    expect(vfs.exists("/my/dir")).toBe(true);
    expect(vfs.stat("/my/dir").isDirectory).toBe(true);
  });

  it("readdir lists direct children", () => {
    const vfs = createVfs();
    vfs.writeFile("/dir/a.txt", "a");
    vfs.writeFile("/dir/b.txt", "b");
    vfs.mkdir("/dir/sub");
    vfs.writeFile("/dir/sub/c.txt", "c");

    const entries = vfs.readdir("/dir");
    expect(entries.length).toBe(3);
    expect(entries.map((e) => e.name).sort()).toEqual([
      "a.txt",
      "b.txt",
      "sub",
    ]);
    // Should NOT include nested c.txt
    expect(entries.map((e) => e.name)).not.toContain("c.txt");
  });

  it("rm removes files", () => {
    const vfs = createVfs();
    vfs.writeFile("/del.txt", "bye");
    expect(vfs.exists("/del.txt")).toBe(true);
    vfs.rm("/del.txt");
    expect(vfs.exists("/del.txt")).toBe(false);
  });

  it("rm recursive removes directory trees", () => {
    const vfs = createVfs();
    vfs.writeFile("/tree/a.txt", "a");
    vfs.writeFile("/tree/sub/b.txt", "b");
    vfs.rm("/tree", { recursive: true });
    expect(vfs.exists("/tree")).toBe(false);
    expect(vfs.exists("/tree/a.txt")).toBe(false);
    expect(vfs.exists("/tree/sub/b.txt")).toBe(false);
  });

  it("cp copies a file", () => {
    const vfs = createVfs();
    vfs.writeFile("/src.txt", "data");
    vfs.cp("/src.txt", "/dest.txt");
    expect(vfs.readFile("/dest.txt")).toBe("data");
    // Original still exists
    expect(vfs.readFile("/src.txt")).toBe("data");
  });

  it("mv moves a file", () => {
    const vfs = createVfs();
    vfs.writeFile("/old.txt", "content");
    vfs.mv("/old.txt", "/new.txt");
    expect(vfs.exists("/old.txt")).toBe(false);
    expect(vfs.readFile("/new.txt")).toBe("content");
  });

  it("append adds to a file", () => {
    const vfs = createVfs();
    vfs.writeFile("/log.txt", "line1\n");
    vfs.append("/log.txt", "line2\n");
    expect(vfs.readFile("/log.txt")).toBe("line1\nline2\n");
  });

  it("append creates file if missing", () => {
    const vfs = createVfs();
    vfs.append("/new.txt", "first");
    expect(vfs.readFile("/new.txt")).toBe("first");
  });

  it("glob finds matching files", () => {
    const vfs = createVfs();
    vfs.writeFile("/src/a.ts", "a");
    vfs.writeFile("/src/b.ts", "b");
    vfs.writeFile("/src/c.js", "c");
    vfs.writeFile("/src/sub/d.ts", "d");

    const tsFiles = vfs.glob("**/*.ts", "/src");
    expect(tsFiles.length).toBe(3);
    expect(tsFiles.every((f) => f.endsWith(".ts"))).toBe(true);

    const jsFiles = vfs.glob("*.js", "/src");
    expect(jsFiles.length).toBe(1);
  });

  it("readFileBytes returns Uint8Array", () => {
    const vfs = createVfs();
    vfs.writeFile("/bin.dat", new Uint8Array([0, 1, 2, 3]));
    const bytes = vfs.readFileBytes("/bin.dat");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(4);
    expect(bytes[0]).toBe(0);
    expect(bytes[3]).toBe(3);
  });

  it("throws on read of non-existent file", () => {
    const vfs = createVfs();
    expect(() => vfs.readFile("/nope")).toThrow("not found");
  });

  it("throws on readdir of non-directory", () => {
    const vfs = createVfs();
    vfs.writeFile("/file.txt", "data");
    expect(() => vfs.readdir("/file.txt")).toThrow("not a directory");
  });

  it("fileCount and totalBytes track correctly", () => {
    const vfs = createVfs();
    expect(vfs.fileCount).toBe(0);
    vfs.writeFile("/a.txt", "12345");
    vfs.writeFile("/b.txt", "abc");
    expect(vfs.fileCount).toBe(2);
    expect(vfs.totalBytes).toBe(8);
  });

  it("snapshot and restore round-trips", () => {
    const vfs = createVfs();
    vfs.writeFile("/app/index.ts", "console.log('hi')");
    vfs.mkdir("/app/src");
    vfs.writeFile("/app/src/util.ts", "export const x = 1;");

    const snap = vfs.snapshot();
    expect(Object.keys(snap.files).length).toBe(2);

    const vfs2 = createVfs();
    vfs2.restore(snap);
    expect(vfs2.readFile("/app/index.ts")).toBe("console.log('hi')");
    expect(vfs2.readFile("/app/src/util.ts")).toBe("export const x = 1;");
    expect(vfs2.fileCount).toBe(2);
  });
});
