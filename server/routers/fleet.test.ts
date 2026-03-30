import { describe, expect, it, vi } from "vitest";

// Mock the LLM module before importing the router
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content:
            "Based on fleet data analysis, your vehicle VIN 1GCHK23K89F123456 shows a potential issue with the fuel system. I recommend scheduling a fuel filter replacement within the next 1,000 miles.",
        },
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  }),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-fleet-user",
      email: "fleet@example.com",
      name: "Fleet Manager",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("fleet.gooseChat", () => {
  it("returns a response from Goose AI for fleet queries", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fleet.gooseChat({
      messages: [
        { role: "user", content: "What's the status of my fleet?" },
      ],
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(typeof result.content === "string" || Array.isArray(result.content)).toBe(true);
  });

  it("accepts optional orgId parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fleet.gooseChat({
      messages: [
        { role: "user", content: "Show me fuel logs for this organization" },
      ],
      orgId: 1,
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });

  it("preserves conversation history", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fleet.gooseChat({
      messages: [
        { role: "user", content: "What vehicles need maintenance?" },
        { role: "assistant", content: "Based on the data, vehicle #3 needs an oil change." },
        { role: "user", content: "What about vehicle #5?" },
      ],
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });
});

describe("fleet.getMyOrgs", () => {
  it("returns an array for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.fleet.getMyOrgs();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
