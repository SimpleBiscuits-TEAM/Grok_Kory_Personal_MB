import { MANUS_WEBDEV_OAUTH_PORTAL_DEFAULT } from "@shared/manusWebDevDefaults";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * OAuth portal URL + app id for the hosted sign-in page (Manus `/app-auth`).
 * Portal defaults to `https://portal.manus.im` when unset — same as typical Manus-hosted injects.
 * Returns `null` only when `VITE_APP_ID` is missing.
 */
export const getLoginUrl = (): string | null => {
  const oauthPortalUrl =
    import.meta.env.VITE_OAUTH_PORTAL_URL?.trim() ||
    MANUS_WEBDEV_OAUTH_PORTAL_DEFAULT;
  const appId = import.meta.env.VITE_APP_ID?.trim();

  if (!appId) {
    return null;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl.replace(/\/$/, "")}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
