import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("access.myAccess", () => {
  it("returns access info for authenticated user", async () => {
    const ctx = createContext({ id: 1 });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.access.myAccess();

    expect(result).toHaveProperty("role");
    expect(result).toHaveProperty("advancedAccess");
    expect(result).toHaveProperty("accessLevel");
    expect(result).toHaveProperty("canAccessAdvanced");
    expect(typeof result.canAccessAdvanced).toBe("boolean");
  });

  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.myAccess()).rejects.toThrow();
  });
});

describe("access.requestAccess", () => {
  it("rejects unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.requestAccess()).rejects.toThrow();
  });
});

describe("access.listUsers", () => {
  it("allows admin to list users", async () => {
    const ctx = createContext({ id: 1, role: "admin" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.access.listUsers({ filter: "all" });

    expect(result).toHaveProperty("users");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("pendingCount");
    expect(Array.isArray(result.users)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  it("allows super_admin to list users", async () => {
    const ctx = createContext({ id: 1, role: "super_admin" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.access.listUsers({ filter: "all" });

    expect(result).toHaveProperty("users");
    expect(Array.isArray(result.users)).toBe(true);
  });

  it("rejects regular users from listing", async () => {
    const ctx = createContext({ id: 99, role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.listUsers({ filter: "all" })).rejects.toThrow();
  });

  it("supports search filter", async () => {
    const ctx = createContext({ id: 1, role: "admin" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.access.listUsers({ filter: "all", search: "ppei" });

    expect(result).toHaveProperty("users");
    expect(Array.isArray(result.users)).toBe(true);
  });

  it("supports status filter", async () => {
    const ctx = createContext({ id: 1, role: "admin" });
    const caller = appRouter.createCaller(ctx);

    for (const filter of ["pending", "approved", "revoked", "admin", "none"] as const) {
      const result = await caller.access.listUsers({ filter });
      expect(result).toHaveProperty("users");
      expect(Array.isArray(result.users)).toBe(true);
    }
  });
});

describe("access.stats", () => {
  it("returns stats for admin", async () => {
    const ctx = createContext({ id: 1, role: "admin" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.access.stats();

    expect(result).toHaveProperty("totalUsers");
    expect(result).toHaveProperty("pendingRequests");
    expect(result).toHaveProperty("approvedUsers");
    expect(result).toHaveProperty("adminCount");
    expect(typeof result.totalUsers).toBe("number");
    expect(result.totalUsers).toBeGreaterThanOrEqual(0);
  });

  it("rejects regular users", async () => {
    const ctx = createContext({ id: 99, role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.stats()).rejects.toThrow();
  });
});

describe("access.setRole", () => {
  it("rejects admin users (only super_admin can set roles)", async () => {
    const ctx = createContext({ id: 1, role: "admin" });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.setRole({ userId: 2, role: "admin" })).rejects.toThrow();
  });

  it("rejects regular users", async () => {
    const ctx = createContext({ id: 99, role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.setRole({ userId: 2, role: "admin" })).rejects.toThrow();
  });
});

describe("access.approveAccess", () => {
  it("rejects regular users", async () => {
    const ctx = createContext({ id: 99, role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.approveAccess({ userId: 2 })).rejects.toThrow();
  });
});

describe("access.revokeAccess", () => {
  it("rejects regular users", async () => {
    const ctx = createContext({ id: 99, role: "user" });
    const caller = appRouter.createCaller(ctx);

    await expect(caller.access.revokeAccess({ userId: 2 })).rejects.toThrow();
  });
});
