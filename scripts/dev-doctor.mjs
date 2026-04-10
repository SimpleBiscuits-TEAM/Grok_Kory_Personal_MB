#!/usr/bin/env node
/**
 * V-OP localhost / dev server diagnostic (run anytime: npm run dev:doctor)
 * Repeat the same checks we use when "localhost not working" — no guessing.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function ok(msg) {
  console.log(`  [ok] ${msg}`);
}
function warn(msg) {
  console.log(`  [!!] ${msg}`);
}
function info(msg) {
  console.log(`  [..] ${msg}`);
}

function portFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", (e) => {
      if (e.code === "EADDRINUSE") resolve(false);
      else resolve(false);
    });
    s.listen(port, host, () => {
      s.close(() => resolve(true));
    });
  });
}

async function main() {
  console.log("\n── V-OP dev:doctor ──────────────────────────────────────────\n");

  const v = process.version;
  ok(`Node ${v}`);

  const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  if (fs.existsSync(tsxCli)) {
    ok(`tsx CLI present (${path.relative(root, tsxCli)})`);
  } else {
    warn("tsx CLI missing — run: npm install");
  }

  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const devScript = pkg.scripts?.dev ?? "";
  if (devScript.includes("node_modules/tsx/dist/cli.mjs")) {
    ok('npm run dev uses local tsx via node (not bare "tsx" on PATH)');
  } else {
    warn('npm run dev should invoke node ./node_modules/tsx/dist/cli.mjs — check package.json "dev"');
  }

  const knoxPath = path.join(root, "shared", "knoxKnowledge.ts");
  if (fs.existsSync(knoxPath)) {
    ok("shared/knoxKnowledge.ts exists — if tsx fails with Expected ';' but found …, unescaped ` inside KNOX_KNOWLEDGE_BASE_SANITIZED must be written as \\`");
  }

  const preferred = parseInt(process.env.PORT || "3000", 10);
  const free3000 = await portFree(preferred);
  if (free3000) {
    ok(`Port ${preferred} is free on 127.0.0.1`);
  } else {
    warn(
      `Port ${preferred} is in use — dev will try 3001+ or fail. Free it: Windows: netstat -ano | findstr :${preferred}  then taskkill /PID <pid> /F`,
    );
  }

  console.log("\n── What to run ─────────────────────────────────────────────\n");
  info("1. npm install");
  info("2. npm run dev     (or npm run dev:tsx if cross-env fails)");
  info("3. Open URL printed in terminal — NOT http://localhost:5173/ alone");
  info(`4. Sanity: http://127.0.0.1:<port>/__vop_ping  → plain text "ok"`);
  console.log("\n── Note ────────────────────────────────────────────────────\n");
  info("This repo is Express + Vite middleware on ONE port (default 3000).");
  info("A separate Create-React-App on :3000 + API on :5000 is a different setup.");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
