import { describe, it, expect } from "bun:test";
import { createContext, capabilities } from "../../src/capabilities/index";
import { serve } from "../../src/wrappers/server";

const ctx = createContext({
  name: "server-test",
  capabilities: capabilities().netListen(0).build().capabilities.slice(),
});

describe("serve", () => {
  it("starts and stops a server", () => {
    const server = serve(ctx, {
      port: 0,
      routes: {
        "/health": () => new Response("ok"),
      },
    });

    expect(server.port).toBeGreaterThan(0);
    expect(server.url).toContain("localhost");
    server.stop();
  });

  it("serves routes", async () => {
    const server = serve(ctx, {
      port: 0,
      routes: {
        "/api": () => Response.json({ status: "running" }),
        "/text": () => new Response("hello"),
      },
    });

    try {
      const jsonResp = await fetch(`http://localhost:${server.port}/api`);
      expect(jsonResp.status).toBe(200);
      const data = await jsonResp.json();
      expect(data.status).toBe("running");

      const textResp = await fetch(`http://localhost:${server.port}/text`);
      expect(await textResp.text()).toBe("hello");
    } finally {
      server.stop();
    }
  });

  it("returns 404 for unknown routes", async () => {
    const server = serve(ctx, { port: 0 });

    try {
      const resp = await fetch(`http://localhost:${server.port}/nonexistent`);
      expect(resp.status).toBe(404);
    } finally {
      server.stop();
    }
  });

  it("supports custom handler as fallback", async () => {
    const server = serve(ctx, {
      port: 0,
      handler: () => new Response("custom", { status: 200 }),
    });

    try {
      const resp = await fetch(`http://localhost:${server.port}/anything`);
      expect(resp.status).toBe(200);
      expect(await resp.text()).toBe("custom");
    } finally {
      server.stop();
    }
  });
});
