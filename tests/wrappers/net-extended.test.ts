import { describe, it, expect, afterAll } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { download } from "../../src/wrappers/net";
import { serve } from "../../src/wrappers/server";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-net-ext");
import { mkdirSync } from "node:fs";
mkdirSync(testDir, { recursive: true });

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const ctx = createContext({
  name: "net-ext-test",
  capabilities: capabilities()
    .netFetch(["*"])
    .netListen(0)
    .fsWrite("**")
    .build()
    .capabilities.slice(),
});

describe("download", () => {
  it("downloads a URL to a local file", async () => {
    // Start a local server to download from
    const server = serve(ctx, {
      port: 0,
      routes: {
        "/data.txt": () => new Response("downloaded content"),
      },
    });

    try {
      const dest = join(testDir, "downloaded.txt");
      const result = await download(
        ctx,
        `http://localhost:${server.port}/data.txt`,
        dest,
      );
      expect(result.bytesWritten).toBeGreaterThan(0);
      expect(readFileSync(dest, "utf-8")).toBe("downloaded content");
    } finally {
      server.stop();
    }
  });

  it("throws on non-200 response", async () => {
    const server = serve(ctx, { port: 0 });
    try {
      await expect(
        download(
          ctx,
          `http://localhost:${server.port}/missing`,
          join(testDir, "fail.txt"),
        ),
      ).rejects.toThrow("Download failed");
    } finally {
      server.stop();
    }
  });
});
