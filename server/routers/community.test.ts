import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

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

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-community-user",
      email: "community@example.com",
      name: "Community Member",
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

describe("community.getCategories", () => {
  it("returns an array of forum categories", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.community.getCategories();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("community.getChannels", () => {
  it("returns an array of channels for a category", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.community.getChannels({
      categoryId: 1,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("community.getThreads", () => {
  it("returns an array of threads for a channel", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.community.getThreads({
      channelId: 1,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("community.getPosts", () => {
  it("returns an array of posts for a thread", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.community.getPosts({
      threadId: 1,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("community.getStats", () => {
  it("returns community statistics", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.community.getStats();

    expect(result).toBeDefined();
    expect(typeof result.categories).toBe("number");
    expect(typeof result.channels).toBe("number");
    expect(typeof result.threads).toBe("number");
    expect(typeof result.posts).toBe("number");
  });
});

describe("community.getMyMemberships", () => {
  it("returns memberships for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.community.getMyMemberships();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
