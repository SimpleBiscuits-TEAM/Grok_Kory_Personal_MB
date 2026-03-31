import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@ppei.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {}, cookies: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["res"],
  };
}

function createUnauthContext(cookies: Record<string, string> = {}): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {}, cookies } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["res"],
  };
}

describe("auth.checkAccess", () => {
  it("returns authenticated=true for OAuth users", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.method).toBe("oauth");
  });

  it("returns authenticated=true for access-code cookie", async () => {
    const ctx = createUnauthContext({ vop_access: "granted" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.method).toBe("access_code");
  });

  it("returns authenticated=false for unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(false);
    expect(result.method).toBe("none");
  });

  it("prefers OAuth method over access_code when both present", async () => {
    const ctx = createAuthContext();
    // Also set the access code cookie
    (ctx.req as any).cookies = { vop_access: "granted" };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.method).toBe("oauth");
  });
});

describe("auth.verifyAccessCode", () => {
  it("rejects invalid access codes", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.verifyAccessCode({ code: "INVALID-CODE-123" });

    expect(result.success).toBe(false);
    expect(result).toHaveProperty("message");
  });

  it("rejects empty-like codes", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    // Single character should still work (min length is 1)
    const result = await caller.auth.verifyAccessCode({ code: "x" });
    expect(result.success).toBe(false);
  });

  it("accepts valid access code (PPEI-VOP-2026)", async () => {
    let setCookieName = "";
    let setCookieValue = "";
    const ctx = createUnauthContext();
    (ctx.res as any).cookie = (name: string, value: string) => {
      setCookieName = name;
      setCookieValue = value;
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.verifyAccessCode({ code: "PPEI-VOP-2026" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.label).toBeTruthy();
    }
    // Verify cookie was set
    expect(setCookieName).toBe("vop_access");
    expect(setCookieValue).toBe("granted");
  });
});
