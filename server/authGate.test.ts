import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides: Partial<AuthenticatedUser> = {}, cookieHeader?: string): TrpcContext {
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
    req: { protocol: "https", headers: { cookie: cookieHeader || "" } } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["res"],
  };
}

function createUnauthContext(cookieHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: { cookie: cookieHeader || "" } } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["req"] as any,
  };
}

describe("auth.checkAccess", () => {
  it("returns authenticated=false for OAuth users WITHOUT access code cookie", async () => {
    // OAuth alone should NOT grant access — access code is mandatory
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(false);
    expect(result.method).toBe("none");
    expect(result.hasOAuth).toBe(true);
  });

  it("returns authenticated=true for access-code cookie (no OAuth)", async () => {
    const ctx = createUnauthContext("vop_access=granted");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.method).toBe("access_code");
    expect(result.hasOAuth).toBe(false);
  });

  it("returns authenticated=false for unauthenticated users with no cookies", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(false);
    expect(result.method).toBe("none");
    expect(result.hasOAuth).toBe(false);
  });

  it("returns authenticated=true when OAuth AND access code cookie are both present", async () => {
    const ctx = createAuthContext({}, "vop_access=granted; session=some_token");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.method).toBe("access_code");
    expect(result.hasOAuth).toBe(true);
  });

  it("parses vop_access cookie correctly among multiple cookies", async () => {
    const ctx = createUnauthContext("session=abc123; vop_access=granted; other=value");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.method).toBe("access_code");
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

    const result = await caller.auth.verifyAccessCode({ code: "x" });
    expect(result.success).toBe(false);
  });

  it("accepts valid access code (KINGKONG)", async () => {
    let setCookieName = "";
    let setCookieValue = "";
    const ctx = createUnauthContext();
    (ctx.res as any).cookie = (name: string, value: string) => {
      setCookieName = name;
      setCookieValue = value;
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.verifyAccessCode({ code: "KINGKONG" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.label).toBeTruthy();
    }
    // Verify cookie was set
    expect(setCookieName).toBe("vop_access");
    expect(setCookieValue).toBe("granted");
  });
});
