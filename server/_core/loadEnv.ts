import "dotenv/config";

/** Default for local dev on Windows where `NODE_ENV=development` in npm scripts is not supported. */
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}
