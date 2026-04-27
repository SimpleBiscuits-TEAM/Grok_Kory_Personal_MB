import type { Express, Request, Response } from "express";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "docs", "git-repository-map.html");
const TTL_MS = 60_000;

let cache: { html: string; at: number } | null = null;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateHtml(): string {
  execSync("node scripts/git-map.mjs", {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!existsSync(OUT)) {
    throw new Error("docs/git-repository-map.html was not created");
  }
  return readFileSync(OUT, "utf8");
}

function sendUnavailable(res: Response, detail: string) {
  res.status(503).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Git map unavailable</title></head>
<body style="font-family:system-ui,sans-serif;background:#1e1e1e;color:#ccc;padding:24px;max-width:560px;">
  <p style="margin-top:0;"><strong>Git map is not available</strong> on this deployment (no Git checkout, offline fetch, or generation failed).</p>
  <pre style="opacity:.75;font-size:12px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(detail)}</pre>
</body>
</html>`);
}

export function registerGitMapRoute(app: Express) {
  app.get("/api/dev/git-map", (req: Request, res: Response) => {
    const bypass = req.query.refresh === "1" || req.query.refresh === "true";
    const now = Date.now();
    if (!bypass && cache && now - cache.at < TTL_MS) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.send(cache.html);
    }
    try {
      const html = generateHtml();
      cache = { html, at: now };
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "private, max-age=60");
      res.send(html);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      console.warn("[git-map]", detail);
      sendUnavailable(res, detail);
    }
  });
}
