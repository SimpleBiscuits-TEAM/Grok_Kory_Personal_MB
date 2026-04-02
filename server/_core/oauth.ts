import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/** Parse the frontend origin from the OAuth state parameter */
function parseRedirectFromState(state: string): string {
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    if (decoded.origin) {
      const returnPath = decoded.returnPath || "/";
      return `${decoded.origin}${returnPath}`;
    }
  } catch {
    // state is not JSON — fall through
  }
  return "/";
}

/** Retry a function up to `attempts` times with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 500): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isTransient =
        err?.message?.includes("Information schema is out of date") ||
        err?.message?.includes("schema failed to update") ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT" ||
        err?.code === "PROTOCOL_CONNECTION_LOST";

      if (isTransient && i < attempts - 1) {
        const wait = delayMs * Math.pow(2, i);
        console.warn(`[OAuth] Transient DB error (attempt ${i + 1}/${attempts}), retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("withRetry exhausted"); // unreachable
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const redirectUrl = parseRedirectFromState(state);

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // Retry upsert for transient TiDB/connection errors
      await withRetry(() =>
        db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: new Date(),
        })
      );

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, redirectUrl);
    } catch (error: any) {
      console.error("[OAuth] Callback failed", error);

      // If it's a transient DB error, redirect to home with a retry hint
      // instead of showing a raw JSON error page
      const isTransient =
        error?.message?.includes("Information schema is out of date") ||
        error?.message?.includes("schema failed to update") ||
        error?.code === "ECONNRESET";

      if (isTransient) {
        // Redirect to home with error param so the frontend can show a retry message
        const sep = redirectUrl.includes("?") ? "&" : "?";
        res.redirect(302, `${redirectUrl}${sep}login_error=transient`);
        return;
      }

      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
