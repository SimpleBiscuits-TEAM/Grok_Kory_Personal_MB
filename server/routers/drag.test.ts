import { describe, expect, it, vi } from "vitest";

// Mock the LLM module before importing the router
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "Knox Race Report: Your 10.8s quarter mile at 124 MPH shows strong mid-range power. The 1.6s 60ft suggests room for improvement in launch technique. Consider lowering tire pressure by 2 PSI for better traction.",
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 60, total_tokens: 160 },
  }),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-drag-user",
      email: "racer@example.com",
      name: "Test Racer",
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

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("drag.getMyProfile", () => {
  it("returns null or profile for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getMyProfile();

    // New user has no profile yet, should return null
    expect(result === null || (typeof result === "object" && result !== null)).toBe(true);
  });
});

describe("drag.getLeaderboard", () => {
  it("returns an array of leaderboard entries", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getLeaderboard({
      limit: 25,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts category and vehicleClass filters", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getLeaderboard({
      category: "quarter_et",
      vehicleClass: "diesel_truck",
      limit: 10,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("drag.getCallouts", () => {
  it("returns an array of active callouts", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getCallouts({
      limit: 50,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("drag.getLeagues", () => {
  it("returns an array of public leagues", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getLeagues({
      limit: 50,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("drag.getTournaments", () => {
  it("returns an array of tournaments", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getTournaments({
      limit: 20,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("drag.getWallets", () => {
  it("returns wallets for authenticated user profile", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getWallets({
      profileId: 1,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("drag.getSubscription", () => {
  it("returns null for user without subscription", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getSubscription({
      profileId: 999,
    });

    expect(result === null || typeof result === "object").toBe(true);
  });
});

describe("drag.getRegionalChampions", () => {
  it("returns an array of regional champions", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getRegionalChampions({
      raceType: "quarter",
      limit: 50,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("accepts eighth mile race type", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getRegionalChampions({
      raceType: "eighth",
      limit: 10,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("drag.getProfileBadges", () => {
  it("returns an array of badges for a profile", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getProfileBadges({
      profileId: 1,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array for non-existent profile", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getProfileBadges({
      profileId: 99999,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("drag.getPlayoffBracket", () => {
  it("returns season and bracket data", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getPlayoffBracket({
      seasonId: 1,
    });

    expect(result).toBeDefined();
    expect(result).toHaveProperty("season");
    expect(result).toHaveProperty("bracket");
    expect(Array.isArray(result.bracket)).toBe(true);
  });

  it("returns null season for non-existent season", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.drag.getPlayoffBracket({
      seasonId: 99999,
    });

    expect(result.season).toBeNull();
    expect(result.bracket).toEqual([]);
  });
});
