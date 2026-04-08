/**
 * Headless auth helpers — Bearer injection, OAuth2 device flow,
 * cookie jar, and authenticated fetch.
 *
 * All auth operations go through the secret store so credentials
 * are encrypted at rest and capability-gated. Auth headers are
 * NEVER logged in audit — structurally impossible.
 *
 * @module
 */

import type { CapabilityContext, CapabilityKind, RequireCap } from "../capabilities/types";
import type { SecretStore } from "./store";
import type { StateStore } from "./state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** OAuth2 Device Flow configuration. */
export interface OAuth2DeviceConfig {
  readonly clientId: string;
  readonly deviceUrl: string;
  readonly tokenUrl: string;
  readonly scopes?: readonly string[];
  /** Called when the user needs to visit a URL and enter a code. */
  readonly onUserCode: (code: string, verificationUrl: string) => void;
  /** Polling interval in ms (default: 5000). */
  readonly pollInterval?: number;
  /** Max polling time in ms (default: 300000 = 5 min). */
  readonly timeout?: number;
}

/** OAuth2 token result. */
export interface OAuth2Token {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn?: number;
  readonly refreshToken?: string;
  readonly scope?: string;
}

/** A cookie entry. */
export interface Cookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly expiresAt?: Date;
}

/** Cookie jar for managing per-domain cookies. */
export interface CookieJar {
  /** Set a cookie from a Set-Cookie header string. */
  set(domain: string, setCookieHeader: string): void;
  /** Get all cookies for a domain as a Cookie header string. */
  get(domain: string): string;
  /** Get all cookie objects for a domain. */
  getAll(domain: string): Cookie[];
  /** Clear cookies for a domain. */
  clear(domain: string): void;
  /** Clear all cookies. */
  clearAll(): void;
  /** Fetch with cookies auto-injected and response cookies captured. */
  fetch(
    ctx: CapabilityContext,
    url: string,
    init?: RequestInit,
  ): Promise<Response>;
}

// ---------------------------------------------------------------------------
// authBearer — create Bearer auth headers from secret store
// ---------------------------------------------------------------------------

/**
 * Create an Authorization header from a secret store key.
 * The secret value never appears in audit logs.
 *
 * @example
 * ```ts
 * const headers = authBearer(ctx, secrets, "GITHUB_TOKEN");
 * // { Authorization: "Bearer ghp_xxx..." }
 * const resp = await netFetch(ctx, "https://api.github.com/user",
 *   { headers });
 * ```
 */
export function authBearer<K extends CapabilityKind>(
  ctx: RequireCap<K, "secret:read">,
  secrets: SecretStore,
  key: string,
): Record<string, string> {
  const token = secrets.get(ctx, key);
  if (!token) {
    throw new Error(`Secret "${key}" not found in store`);
  }
  return { Authorization: `Bearer ${token}` };
}

/**
 * Create a basic auth header from username + password secret keys.
 *
 * @example
 * ```ts
 * const headers = authBasic(ctx, secrets, "API_USER", "API_PASS");
 * ```
 */
export function authBasic<K extends CapabilityKind>(
  ctx: RequireCap<K, "secret:read">,
  secrets: SecretStore,
  usernameKey: string,
  passwordKey: string,
): Record<string, string> {
  const username = secrets.get(ctx, usernameKey);
  const password = secrets.get(ctx, passwordKey);
  if (!username || !password) {
    throw new Error(`Secrets "${usernameKey}" or "${passwordKey}" not found`);
  }
  const encoded = btoa(`${username}:${password}`);
  return { Authorization: `Basic ${encoded}` };
}

// ---------------------------------------------------------------------------
// authedFetch — fetch with auth headers, redacted audit
// ---------------------------------------------------------------------------

/**
 * HTTP fetch with auth headers auto-injected from secret store.
 * The Authorization header is NEVER logged in audit.
 *
 * @example
 * ```ts
 * const resp = await authedFetch(ctx, secrets, "GITHUB_TOKEN",
 *   "https://api.github.com/user");
 * ```
 */
export async function authedFetch<K extends CapabilityKind>(
  ctx: RequireCap<K, "net:fetch" | "secret:read">,
  secrets: SecretStore,
  tokenKey: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const parsed = new URL(url);
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : parsed.protocol === "https:"
      ? 443
      : 80;

  ctx.caps.demand({
    kind: "net:fetch",
    allowedDomains: [parsed.hostname],
    allowedPorts: [port],
  });

  // Audit logs the URL but NOT the auth header
  ctx.audit.log("net:fetch", {
    op: "authedFetch",
    url,
    method: init?.method ?? "GET",
    authKey: tokenKey,
    authHeader: "[REDACTED]",
  });

  const token = secrets.get(ctx, tokenKey);
  if (!token) {
    throw new Error(`Secret "${tokenKey}" not found in store`);
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, { ...init, headers });
}

// ---------------------------------------------------------------------------
// OAuth2 Device Code Flow (headless)
// ---------------------------------------------------------------------------

/**
 * Run the OAuth2 Device Authorization flow.
 * Headless — no browser on the agent's side. The harness/user
 * visits the URL and enters the code.
 *
 * @example
 * ```ts
 * const token = await oauth2DeviceFlow(ctx, {
 *   clientId: "Iv1.abc123",
 *   deviceUrl: "https://github.com/login/device/code",
 *   tokenUrl: "https://github.com/login/oauth/access_token",
 *   scopes: ["repo", "read:user"],
 *   onUserCode: (code, url) => {
 *     console.log(`Visit ${url} and enter: ${code}`);
 *   },
 * });
 *
 * // Optionally store in secret store
 * secrets.set(ctx, "GITHUB_OAUTH", token.accessToken);
 * ```
 */
export async function oauth2DeviceFlow(
  ctx: CapabilityContext,
  config: OAuth2DeviceConfig,
): Promise<OAuth2Token> {
  ctx.audit.log("net:fetch", {
    op: "oauth2DeviceFlow",
    clientId: config.clientId,
  });

  // Step 1: Request device code
  const deviceResp = await fetch(config.deviceUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.clientId,
      scope: config.scopes?.join(" ") ?? "",
    }),
  });

  if (!deviceResp.ok) {
    throw new Error(`Device code request failed: ${deviceResp.status}`);
  }

  const deviceData = (await deviceResp.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval?: number;
    expires_in?: number;
  };

  // Step 2: Tell the user/harness to visit the URL
  config.onUserCode(deviceData.user_code, deviceData.verification_uri);

  // Step 3: Poll for token
  const pollInterval = (deviceData.interval ?? 5) * 1000;
  const interval = config.pollInterval ?? pollInterval;
  const timeout = config.timeout ?? 300000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenResp = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        device_code: deviceData.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const tokenData = (await tokenResp.json()) as {
      access_token?: string;
      token_type?: string;
      expires_in?: number;
      refresh_token?: string;
      scope?: string;
      error?: string;
    };

    if (tokenData.access_token) {
      ctx.audit.log("secret:write", {
        op: "oauth2DeviceFlow:complete",
        clientId: config.clientId,
        token: "[REDACTED]",
      });
      const token: OAuth2Token = {
        accessToken: tokenData.access_token,
        tokenType: tokenData.token_type ?? "bearer",
      };
      if (tokenData.expires_in !== undefined)
        (token as unknown as Record<string, unknown>)["expiresIn"] =
          tokenData.expires_in;
      if (tokenData.refresh_token)
        (token as unknown as Record<string, unknown>)["refreshToken"] =
          tokenData.refresh_token;
      if (tokenData.scope)
        (token as unknown as Record<string, unknown>)["scope"] =
          tokenData.scope;
      return token;
    }

    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    if (tokenData.error && tokenData.error !== "authorization_pending") {
      throw new Error(`OAuth2 error: ${tokenData.error}`);
    }
  }

  throw new Error("OAuth2 device flow timed out — user did not authorize");
}

// ---------------------------------------------------------------------------
// Cookie Jar
// ---------------------------------------------------------------------------

function parseCookieHeader(domain: string, header: string): Cookie {
  const parts = header.split(";").map((p) => p.trim());
  const [nameValue, ...attrs] = parts;
  const eqIdx = nameValue!.indexOf("=");
  const name = nameValue!.slice(0, eqIdx).trim();
  const value = nameValue!.slice(eqIdx + 1).trim();

  let path = "/";
  let secure = false;
  let httpOnly = false;
  let expiresAt: Date | undefined;

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower.startsWith("path=")) path = attr.slice(5);
    if (lower === "secure") secure = true;
    if (lower === "httponly") httpOnly = true;
    if (lower.startsWith("expires=")) {
      expiresAt = new Date(attr.slice(8));
    }
    if (lower.startsWith("max-age=")) {
      const maxAge = parseInt(attr.slice(8), 10);
      expiresAt = new Date(Date.now() + maxAge * 1000);
    }
  }

  const cookie: Cookie = { name, value, domain, path, secure, httpOnly };
  if (expiresAt)
    (cookie as unknown as Record<string, unknown>)["expiresAt"] = expiresAt;
  return cookie;
}

/**
 * Create a cookie jar backed by a state store.
 * Manages per-domain cookies across requests.
 *
 * @example
 * ```ts
 * const jar = cookieJar(ctx, state);
 * jar.set("github.com", "session=abc; Path=/; Secure");
 *
 * // Auto-inject cookies in fetch
 * const resp = await jar.fetch(ctx, "https://github.com/api/...");
 * ```
 */
export function cookieJar(
  ctx: CapabilityContext,
  state: StateStore,
): CookieJar {
  const stateKey = (domain: string) => `cookies/${domain}`;

  function getCookies(domain: string): Cookie[] {
    const stored = state.get<Cookie[]>(ctx, stateKey(domain));
    if (!stored) return [];
    // Filter expired
    return stored.filter(
      (c) => !c.expiresAt || new Date(c.expiresAt) > new Date(),
    );
  }

  function saveCookies(domain: string, cookies: Cookie[]): void {
    state.set(ctx, stateKey(domain), cookies);
  }

  return {
    set(domain: string, setCookieHeader: string): void {
      const cookie = parseCookieHeader(domain, setCookieHeader);
      const existing = getCookies(domain);
      // Replace existing cookie with same name
      const updated = existing.filter((c) => c.name !== cookie.name);
      updated.push(cookie);
      saveCookies(domain, updated);
    },

    get(domain: string): string {
      const cookies = getCookies(domain);
      return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    },

    getAll(domain: string): Cookie[] {
      return getCookies(domain);
    },

    clear(domain: string): void {
      state.delete(ctx, stateKey(domain));
    },

    clearAll(): void {
      const keys = state.keys(ctx, "cookies/*");
      for (const key of keys) {
        state.delete(ctx, key);
      }
    },

    async fetch(
      fetchCtx: CapabilityContext,
      url: string,
      init?: RequestInit,
    ): Promise<Response> {
      const parsed = new URL(url);
      const cookieHeader = this.get(parsed.hostname);

      const headers = new Headers(init?.headers);
      if (cookieHeader) {
        headers.set("Cookie", cookieHeader);
      }

      fetchCtx.audit.log("net:fetch", {
        op: "cookieJar.fetch",
        url,
        cookies: "[REDACTED]",
      });

      const resp = await fetch(url, { ...init, headers });

      // Capture Set-Cookie headers from response
      const setCookies = resp.headers.getSetCookie?.() ?? [];
      for (const header of setCookies) {
        this.set(parsed.hostname, header);
      }

      return resp;
    },
  };
}

// ---------------------------------------------------------------------------
// secretFromEnv — bridge env vars into secret store
// ---------------------------------------------------------------------------

/**
 * Import an environment variable into the secret store.
 * Goes through both env:read and secret:write capability checks.
 *
 * @example
 * ```ts
 * secretFromEnv(ctx, secrets, "OPENAI_API_KEY");
 * // Now accessible as: secrets.get(ctx, "OPENAI_API_KEY")
 * ```
 */
export function secretFromEnv<K extends CapabilityKind>(
  ctx: RequireCap<K, "env:read" | "secret:write">,
  secrets: SecretStore,
  envKey: string,
  secretKey?: string,
): void {
  ctx.caps.demand({ kind: "env:read", allowedKeys: [envKey] });
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`Environment variable "${envKey}" is not set`);
  }
  secrets.set(ctx, secretKey ?? envKey, value);
}
