import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer, type UserConfig } from "vite";
import viteConfig from "../../vite.config";

/**
 * Express + Vite middleware. The HTTP server param must NOT be named `server` here:
 * a separate `const server = { … hmr: { server } }` redeclares `server` and tsx/esbuild
 * fails to load this file — `pnpm dev` then exits and nothing listens on :3000.
 * @see server/_core/vite.setup.test.ts
 */
export async function setupVite(app: Express, httpServer: Server) {
  const base = viteConfig as UserConfig;
  // Must merge with vite.config.ts `server` (fs.allow, etc.). Passing only
  // { middlewareMode, hmr } replaced the whole block and broke dev on some setups.
  const viteServerConfig: UserConfig["server"] = {
    ...base.server,
    middlewareMode: true,
    hmr: { server: httpServer },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...base,
    configFile: false,
    server: viteServerConfig,
    appType: "custom",
  });

  app.use(vite.middlewares);
  // Plain middleware (not path "*") — reliable SPA fallback after Vite handles assets.
  app.use(async (req, res, next) => {
    if (res.writableEnded || res.headersSent) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();

    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  const indexHtml = path.resolve(distPath, "index.html");

  if (!fs.existsSync(distPath) || !fs.existsSync(indexHtml)) {
    console.error(
      `[V-OP] Client build missing: ${distPath}\n` +
        `  Run: pnpm build   (or use: pnpm dev with NODE_ENV=development — not production in .env)\n` +
        `  Until then, the site will not load on localhost.`,
    );
    app.use((_req, res) => {
      res
        .status(503)
        .type("html")
        .send(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Build required</title></head>
<body style="font-family:system-ui,sans-serif;background:#111;color:#ddd;padding:2rem;max-width:42rem;">
<h1 style="margin-top:0;">Client not built</h1>
<p>The server is running in production mode without a client bundle. From the project root run:</p>
<pre style="background:#222;padding:1rem;overflow:auto;">pnpm build</pre>
<p>Or for local development with hot reload:</p>
<pre style="background:#222;padding:1rem;overflow:auto;">pnpm dev</pre>
<p style="opacity:.85;font-size:.9rem;">If you use a <code>.env</code> file, remove <code>NODE_ENV=production</code> while developing, or rely on <code>pnpm dev</code> (it forces development mode).</p>
</body></html>`);
    });
    return;
  }

  app.use(express.static(distPath));

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(indexHtml);
  });
}
