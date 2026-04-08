import { describe, it, expect } from "bun:test";
import { createSecretStore } from "../../src/secrets/store";
import { createStateStore } from "../../src/secrets/state";
import {
  authBearer,
  authBasic,
  authedFetch,
  cookieJar,
  secretFromEnv,
} from "../../src/secrets/auth";
import { createContext, capabilities } from "../../src/capabilities/index";
import { serve } from "../../src/wrappers/server";
import { randomBytes } from "../../src/wrappers/crypto";

const masterKey = randomBytes(32);

const ctx = createContext({
  name: "auth-test",
  capabilities: capabilities()
    .secretRead(["*"])
    .secretWrite(["*"])
    .netFetch(["*"])
    .netListen(0)
    .envRead(["*"])
    .build()
    .capabilities.slice(),
});

// ---------------------------------------------------------------------------
// authBearer
// ---------------------------------------------------------------------------

describe("authBearer", () => {
  it("creates Bearer header from secret", () => {
    const secrets = createSecretStore(masterKey);
    secrets.set(ctx, "TOKEN", "my-secret-token");
    const headers = authBearer(ctx, secrets, "TOKEN");
    expect(headers["Authorization"]).toBe("Bearer my-secret-token");
  });

  it("throws if secret not found", () => {
    const secrets = createSecretStore(masterKey);
    expect(() => authBearer(ctx, secrets, "MISSING")).toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// authBasic
// ---------------------------------------------------------------------------

describe("authBasic", () => {
  it("creates Basic auth header", () => {
    const secrets = createSecretStore(masterKey);
    secrets.set(ctx, "USER", "alice");
    secrets.set(ctx, "PASS", "password123");
    const headers = authBasic(ctx, secrets, "USER", "PASS");
    expect(headers["Authorization"]).toStartWith("Basic ");
    // Decode and verify
    const decoded = atob(headers["Authorization"]!.slice(6));
    expect(decoded).toBe("alice:password123");
  });
});

// ---------------------------------------------------------------------------
// authedFetch
// ---------------------------------------------------------------------------

describe("authedFetch", () => {
  it("injects auth header into request", async () => {
    // Create a test server that echoes the Authorization header
    const server = serve(ctx, {
      port: 0,
      routes: {
        "/echo-auth": (req) => {
          const auth = req.headers.get("Authorization") ?? "none";
          return Response.json({ auth });
        },
      },
    });

    try {
      const secrets = createSecretStore(masterKey);
      secrets.set(ctx, "API_KEY", "test-api-key");

      const resp = await authedFetch(
        ctx,
        secrets,
        "API_KEY",
        `http://localhost:${server.port}/echo-auth`,
      );

      const data = (await resp.json()) as { auth: string };
      expect(data.auth).toBe("Bearer test-api-key");
    } finally {
      server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// cookieJar
// ---------------------------------------------------------------------------

describe("cookieJar", () => {
  it("stores and retrieves cookies", () => {
    const state = createStateStore();
    const jar = cookieJar(ctx, state);

    jar.set("example.com", "session=abc123; Path=/; Secure");
    jar.set("example.com", "csrf=xyz; Path=/");

    const header = jar.get("example.com");
    expect(header).toContain("session=abc123");
    expect(header).toContain("csrf=xyz");
  });

  it("replaces cookies with same name", () => {
    const state = createStateStore();
    const jar = cookieJar(ctx, state);

    jar.set("example.com", "token=old");
    jar.set("example.com", "token=new");

    const cookies = jar.getAll("example.com");
    expect(cookies.length).toBe(1);
    expect(cookies[0]!.value).toBe("new");
  });

  it("isolates cookies by domain", () => {
    const state = createStateStore();
    const jar = cookieJar(ctx, state);

    jar.set("a.com", "x=1");
    jar.set("b.com", "y=2");

    expect(jar.get("a.com")).toBe("x=1");
    expect(jar.get("b.com")).toBe("y=2");
    expect(jar.get("c.com")).toBe("");
  });

  it("clear() removes domain cookies", () => {
    const state = createStateStore();
    const jar = cookieJar(ctx, state);

    jar.set("example.com", "a=1");
    jar.clear("example.com");
    expect(jar.get("example.com")).toBe("");
  });

  it("parses cookie attributes", () => {
    const state = createStateStore();
    const jar = cookieJar(ctx, state);

    jar.set("example.com", "tok=val; Path=/api; Secure; HttpOnly");

    const cookies = jar.getAll("example.com");
    expect(cookies[0]!.path).toBe("/api");
    expect(cookies[0]!.secure).toBe(true);
    expect(cookies[0]!.httpOnly).toBe(true);
  });

  it("fetch injects cookies into request", async () => {
    const server = serve(ctx, {
      port: 0,
      routes: {
        "/echo-cookies": (req) => {
          const cookies = req.headers.get("Cookie") ?? "none";
          return Response.json({ cookies });
        },
      },
    });

    try {
      const state = createStateStore();
      const jar = cookieJar(ctx, state);
      jar.set("localhost", "session=test123");

      const resp = await jar.fetch(
        ctx,
        `http://localhost:${server.port}/echo-cookies`,
      );
      const data = (await resp.json()) as { cookies: string };
      expect(data.cookies).toContain("session=test123");
    } finally {
      server.stop();
    }
  });
});

// ---------------------------------------------------------------------------
// secretFromEnv
// ---------------------------------------------------------------------------

describe("secretFromEnv", () => {
  it("imports env var into secret store", () => {
    process.env["TEST_BUNSHELL_KEY"] = "env-value-123";
    const secrets = createSecretStore(masterKey);
    secretFromEnv(ctx, secrets, "TEST_BUNSHELL_KEY");
    expect(secrets.get(ctx, "TEST_BUNSHELL_KEY")).toBe("env-value-123");
    delete process.env["TEST_BUNSHELL_KEY"];
  });

  it("imports env var under a different secret key", () => {
    process.env["REAL_ENV_VAR"] = "real-value";
    const secrets = createSecretStore(masterKey);
    secretFromEnv(ctx, secrets, "REAL_ENV_VAR", "MY_ALIAS");
    expect(secrets.get(ctx, "MY_ALIAS")).toBe("real-value");
    delete process.env["REAL_ENV_VAR"];
  });

  it("throws if env var not set", () => {
    const secrets = createSecretStore(masterKey);
    expect(() => secretFromEnv(ctx, secrets, "DOES_NOT_EXIST_XYZ")).toThrow(
      "not set",
    );
  });
});
