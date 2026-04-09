/**
 * Defaults aligned with Manus WebDev templates (ObserverZ / standard exports).
 * Hosted Manus injects these; local clones often only set `VITE_APP_ID` + secrets.
 *
 * @see https://portal.manus.im — browser OAuth (`/app-auth`)
 * @see https://api.manus.im — WebDev auth RPC (`ExchangeToken`, `GetUserInfo`, …)
 */
export const MANUS_WEBDEV_OAUTH_PORTAL_DEFAULT = "https://portal.manus.im" as const;
export const MANUS_WEBDEV_OAUTH_API_DEFAULT = "https://api.manus.im" as const;
