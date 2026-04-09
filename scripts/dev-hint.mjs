// Printed before `pnpm dev` — Vite-in-Express uses one HTTP port (default 3000), not :5173.
console.log(`
  V-OP dev: open http://localhost:3000/  (or the port shown after "Server running")
  Do not use http://localhost:5173/ — that is only for standalone Vite; this repo uses Express+Vite together.
`);
