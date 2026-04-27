import { describe, expect, it } from "vitest";
import { isTsxVopServerEntryFromArgv } from "./vopDevServerArgv";

describe("loadEnv / dev entry detection", () => {
  it("matches tsx watch server/_core/index (npm run dev)", () => {
    expect(
      isTsxVopServerEntryFromArgv(
        "node node_modules/tsx/dist/cli.mjs watch server/_core/index.ts",
      ),
    ).toBe(true);
  });

  it("matches tsx server/_core/index without watch (IDE / one-shot)", () => {
    expect(
      isTsxVopServerEntryFromArgv(
        "node ./node_modules/tsx/dist/cli.mjs server/_core/index.ts",
      ),
    ).toBe(true);
  });

  it("matches Windows-style path separators", () => {
    expect(
      isTsxVopServerEntryFromArgv("tsx watch server\\_core\\index.ts"),
    ).toBe(true);
  });

  it("does not match production node dist entry", () => {
    expect(isTsxVopServerEntryFromArgv("node dist/index.js")).toBe(false);
  });

  it("does not match arbitrary tsx scripts", () => {
    expect(isTsxVopServerEntryFromArgv("tsx scripts/foo.mjs")).toBe(false);
  });
});
