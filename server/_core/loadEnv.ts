import "dotenv/config";
import { isTsxVopServerEntryFromArgv } from "./vopDevServerArgv";

/**
 * Local `pnpm dev` / `npm run dev` must use Vite. A `.env` line like
 * `NODE_ENV=production` would skip Vite and serve `dist/public` instead — if you
 * have not run `pnpm build`, the app appears blank / broken on localhost.
 */

const argvJoined = process.argv.join(" ");
// Any tsx run of the V-OP server entry is local dev — not only `tsx watch …`
// (IDE "Run" / one-shot `tsx server/_core/index.ts` would otherwise keep
// NODE_ENV=production from `.env` and skip Vite → blank localhost).
if (
  process.env.npm_lifecycle_event === "dev" ||
  isTsxVopServerEntryFromArgv(argvJoined)
) {
  process.env.NODE_ENV = "development";
}

/** Default for local dev on Windows where `NODE_ENV=development` in npm scripts is not supported. */
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}
