// Printed before `pnpm dev` — Vite-in-Express uses one HTTP port (default 3000), not :5173.
console.log(`
  V-OP dev: open http://localhost:3000/  (or the port printed after startup — 3001 if 3000 is busy)
  If the browser spins: try http://127.0.0.1:PORT/__vop_ping  (must respond with plain text "ok")
  Do not use http://localhost:5173/ — standalone Vite only; this app is Express + Vite on ONE port.
  If dev crashes with "tsx" or "npx" not found: use  npm run dev:tsx  (calls Node on the local tsx CLI).
  Blank page in production mode without a build: run  npm run dev  (forces NODE_ENV=development) or  npm run build && npm start
`);
