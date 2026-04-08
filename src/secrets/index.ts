/**
 * BunShell Secrets & State Management.
 *
 * @module
 */

// Secret store
export { createSecretStore, deriveKey } from "./store";
export type {
  SecretStore,
  SecretStoreSnapshot,
  SecretStoreOptions,
} from "./store";

// State store
export { createStateStore } from "./state";
export type { StateStore, StateSnapshot } from "./state";

// Auth helpers
export {
  authBearer,
  authBasic,
  authedFetch,
  oauth2DeviceFlow,
  cookieJar,
  secretFromEnv,
} from "./auth";
export type {
  OAuth2DeviceConfig,
  OAuth2Token,
  Cookie,
  CookieJar,
} from "./auth";
