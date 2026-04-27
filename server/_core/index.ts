import "./loadEnv";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import helmet from "helmet";
import rateLimit, { type Options } from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { knoxShieldMiddleware } from "../lib/knoxShieldMiddleware";
import { registerTuneDeployRoutes } from "../tuneDeployRoutes";
import { registerDevObjectStorageRoute } from "../storage";
import { registerGitMapRoute } from "../gitMapRoute";
import { attachStormChaseRelay } from "../lib/stormChaseRelay";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Bind HTTP server so both http://127.0.0.1 and http://localhost work on Windows.
 * `127.0.0.1`-only rejects browsers that resolve `localhost` → IPv6 (::1).
 * `0.0.0.0`-only rejects some ::1-only clients. Dual-stack `::` + ipv6Only:false
 * accepts both; we fall back to 0.0.0.0 if IPv6 is disabled.
 */
function listenServer(
  server: ReturnType<typeof createServer>,
  port: number,
  isDev: boolean,
  onListening: (hostLabel: string) => void,
): void {
  const explicit = process.env.HOST?.trim();
  if (explicit) {
    server.listen(port, explicit, () => onListening(explicit));
    return;
  }

  if (!isDev) {
    server.listen(port, "0.0.0.0", () => onListening("0.0.0.0"));
    return;
  }

  const onFail = (err: NodeJS.ErrnoException) => {
    server.removeListener("error", onFail);
    if (err.code === "EADDRINUSE") {
      console.error(err);
      process.exit(1);
    }
    console.warn(
      `[V-OP] Could not bind IPv6 dual-stack (::): ${err.message} (${err.code ?? "?"})`,
    );
    console.warn(
      `         Using 0.0.0.0 instead. If the page still won't load, open http://127.0.0.1:${port}/`,
    );
    server.listen(port, "0.0.0.0", () => onListening("0.0.0.0"));
  };

  server.once("error", onFail);
  server.listen({ port, host: "::", ipv6Only: false }, () => {
    server.removeListener("error", onFail);
    onListening(":: (IPv4 + IPv6)");
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const isDev = process.env.NODE_ENV === "development";

  // Plain-text health check (no tRPC / Vite). If this fails, nothing is listening.
  app.get("/__vop_ping", (_req, res) => {
    res
      .status(200)
      .type("text/plain")
      .send(
        `ok\nNODE_ENV=${process.env.NODE_ENV ?? "(unset)"}\n` +
          `mode=${isDev ? "development (Vite expected)" : "production (static build)"}\n`,
      );
  });

  // ── Security Headers (helmet) ──────────────────────────────────────────
  // Skip Helmet entirely in development: remaining headers (COOP/CORP, etc.) can
  // still interfere with Vite + module loading on localhost; production stays locked down.
  if (!isDev) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "https:", "wss:"],
            mediaSrc: ["'self'", "blob:"],
            workerSrc: ["'self'", "blob:"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        },
        strictTransportSecurity: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        frameguard: { action: "deny" },
        noSniff: true,
        hidePoweredBy: true,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
      }),
    );
  }

  // ── Body Parser ────────────────────────────────────────────────────────
  // JSON limit set to 10mb to support PDF sharing (base64-encoded dyno PDFs
  // can be 3-6MB). For very large files, use direct-to-S3 presigned URLs.
  // The urlencoded limit stays at 10mb for form submissions with file data.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ── Canonical Domain Redirect ──────────────────────────────────────────
  // ppei.ai → www.ppei.ai
  app.use((req, res, next) => {
    const host = req.hostname || req.headers.host?.split(':')[0] || '';
    if (host === 'ppei.ai') {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      return res.redirect(301, `${proto}://www.ppei.ai${req.originalUrl}`);
    }
    next();
  });

  // ── Global API Rate Limiting ───────────────────────────────────────────
  // 300 requests per minute per IP across all API endpoints.
  // Individual routers may have stricter per-user limits via secureFileAccess.
  // OAuth callback is excluded to prevent login failures.
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300,
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
    // Skip rate limiting in development, and always skip for OAuth callback
    skip: (req) => {
      if (process.env.NODE_ENV === "development") return true;
      // Never rate-limit the OAuth callback — it's a one-shot redirect
      if (req.path.startsWith("/oauth/callback")) return true;
      return false;
    },
    // Use ipKeyGenerator helper for proper IPv6 subnet handling
    keyGenerator: (req) => {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      return ipKeyGenerator(ip);
    },
  });
  app.use("/api/", apiLimiter);

  // ── LLM Route Rate Limiting (stricter) ─────────────────────────────────
  // LLM-powered routes get a tighter limit to prevent credit abuse.
  // 30 LLM requests per minute per IP.
  const llmLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "AI request rate limit exceeded. Please wait a moment." },
    skip: () => process.env.NODE_ENV === "development",
    keyGenerator: (req) => {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      return ipKeyGenerator(ip);
    },
  });
  // Apply stricter limits to known LLM-heavy tRPC procedures
  app.use("/api/trpc/diagnostic.chat", llmLimiter);
  app.use("/api/trpc/diagnostic.quickLookup", llmLimiter);
  app.use("/api/trpc/compare.analyze", llmLimiter);
  app.use("/api/trpc/editor.knoxChat", llmLimiter);
  app.use("/api/trpc/editor.simplifyMaps", llmLimiter);
  app.use("/api/trpc/fleet.gooseChat", llmLimiter);

  // ── Knox Shield Validation ─────────────────────────────────────────────
  // Validates X-Knox-Shield and X-Knox-Timestamp headers from the client.
  // Flags suspicious requests but does not block them (defense-in-depth).
  app.use(knoxShieldMiddleware);

  // ── OAuth ──────────────────────────────────────────────────────────────
  registerOAuthRoutes(app);

  // ── Local object storage (when Forge S3 proxy is not configured) ────────
  registerDevObjectStorageRoute(app);

  // ── Tune Deploy (raw binary upload — avoids JSON body size limits) ─────
  registerTuneDeployRoutes(app);

  // ── Dev: Git map HTML (iframe target for /git-map) ─────────────────────
  registerGitMapRoute(app);

  // ── tRPC API ───────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ── Storm Chase WebSocket Relay ────────────────────────────────────────
  attachStormChaseRelay(server);

  // ── Static / Vite ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    try {
      await setupVite(app, server);
    } catch (err) {
      console.error(
        "[V-OP] Vite failed to start — the UI will not load until this is fixed. Common causes: missing deps (run pnpm install), bad vite.config, or port/file permission errors.\n",
      );
      console.error(err);
      process.exit(1);
    }
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  listenServer(server, port, isDev, (hostLabel) => {
    const mode = isDev ? "development + Vite" : "production static";
    console.log("");
    console.log("────────────────────────────────────────────────────────────");
    console.log(`  V-OP  ${mode}`);
    console.log(`  bind  ${hostLabel}`);
    console.log(`  !     This app is NOT on Vite's default :5173 — UI + /api share this port.`);
    console.log(`  →     http://127.0.0.1:${port}/`);
    console.log(`  →     http://localhost:${port}/`);
    console.log(`  ping  http://127.0.0.1:${port}/__vop_ping   (should print "ok" — if not, nothing is reaching Node)`);
    if (!process.env.HOST?.trim()) {
      if (isDev) {
        console.log("  tip   Set HOST=0.0.0.0 in .env if you need LAN / phone access.");
      } else {
        console.log("  tip   Production listens on all interfaces (0.0.0.0).");
      }
    }
    console.log("────────────────────────────────────────────────────────────");
    console.log("");
  });
}

startServer().catch(console.error);
