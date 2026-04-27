import { describe, it, expect } from "vitest";
import { createServer } from "node:http";

/**
 * Regression: `setupVite` used to declare a const `server` for Vite options while
 * the HTTP `createServer` argument was also named `server`, which esbuild/tsx rejects
 * ("symbol server has already been declared") — dev then never listened and localhost:3000 refused.
 */
describe("setupVite module", () => {
  it("loads and runs without transform/duplicate-identifier errors", async () => {
    const { setupVite } = await import("./vite");
    expect(typeof setupVite).toBe("function");
  });

  it("can start Vite in middleware mode against a real HTTP server (smoke)", async () => {
    const { setupVite } = await import("./vite");
    const express = (await import("express")).default;
    const app = express();
    const httpServer = createServer(app);
    await setupVite(app, httpServer);
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
      httpServer.once("error", reject);
    });
    const addr = httpServer.address();
    expect(addr && typeof addr === "object").toBe(true);
    httpServer.close();
  });
});
