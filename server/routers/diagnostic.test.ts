import { describe, expect, it, vi } from "vitest";

// Mock the LLM module before importing the router
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content:
            "Based on the knowledge base, P0087 on an L5P Duramax indicates fuel rail pressure too low. This is typically caused by a weak HP4 pump or fuel supply issues.",
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  }),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
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

describe("diagnostic.chat", () => {
  it("returns a response for a diagnostic conversation", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.diagnostic.chat({
      messages: [
        { role: "user", content: "What does P0087 mean on an L5P?" },
      ],
    });

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
    expect(result.response.toLowerCase()).toContain("fuel");
  });

  it("accepts optional knowledge context", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.diagnostic.chat({
      messages: [
        { role: "user", content: "Explain boost pressure monitoring" },
      ],
      knowledgeContext:
        "PID 0x0B: Intake Manifold Absolute Pressure, Range: 0-255 kPa",
    });

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
  });

  it("accepts optional a2L context", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.diagnostic.chat({
      messages: [
        { role: "user", content: "What is the boost target map?" },
      ],
      a2lContext: "MEASUREMENT: BoostTarget, Unit: kPa, Min: 0, Max: 300",
    });

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
  });

  it("preserves conversation history", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.diagnostic.chat({
      messages: [
        { role: "user", content: "What is P0087?" },
        {
          role: "assistant",
          content: "P0087 is fuel rail pressure too low.",
        },
        { role: "user", content: "What causes it on an LML?" },
      ],
    });

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
  });

  it("returns usage statistics", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.diagnostic.chat({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.usage).toBeDefined();
    expect(result.usage.total_tokens).toBeGreaterThan(0);
  });
});

describe("diagnostic.quickLookup", () => {
  it("returns a response for a quick query", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.diagnostic.quickLookup({
      query: "What is PID 0x0C?",
    });

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");
    expect(result.response.length).toBeGreaterThan(0);
  });

  it("accepts optional knowledge context", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.diagnostic.quickLookup({
      query: "Explain DTC P0234",
      knowledgeContext: "P0234: Turbocharger/Supercharger Overboost Condition",
    });

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
  });
});
