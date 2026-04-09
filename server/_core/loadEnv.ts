import "dotenv/config";

/**
 * Local `pnpm dev` / `npm run dev` must use Vite. A `.env` line like
 * `NODE_ENV=production` would skip Vite and serve `dist/public` instead — if you
 * have not run `pnpm build`, the app appears blank / broken on localhost.
 */
const argvJoined = process.argv.join(" ");
const isTsxWatchDevServer =
  /tsx/i.test(argvJoined) &&
  /watch/i.test(argvJoined) &&
  /server[/\\]_core[/\\]index/i.test(argvJoined);

if (process.env.npm_lifecycle_event === "dev" || isTsxWatchDevServer) {
  process.env.NODE_ENV = "development";
}

/** Default for local dev on Windows where `NODE_ENV=development` in npm scripts is not supported. */
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}
