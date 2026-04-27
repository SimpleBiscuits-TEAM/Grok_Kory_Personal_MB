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

describe("auth.checkAccess — tiered", () => {
  it("returns authenticated=false for OAuth users WITHOUT access code cookie", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(false);
    expect(result.tier).toBe("none");
    expect(result.method).toBe("none");
    expect(result.hasOAuth).toBe(true);
  });

  it("returns tier=lite for vop_access=lite cookie", async () => {
    const ctx = createUnauthContext("vop_access=lite");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.tier).toBe("lite");
    expect(result.method).toBe("access_code");
    expect(result.hasOAuth).toBe(false);
  });

  it("returns tier=pro for vop_access=pro cookie", async () => {
    const ctx = createUnauthContext("vop_access=pro");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.tier).toBe("pro");
    expect(result.method).toBe("access_code");
    expect(result.hasOAuth).toBe(false);
  });

  it("backward compat: vop_access=granted treated as lite", async () => {
    const ctx = createUnauthContext("vop_access=granted");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.tier).toBe("lite");
    expect(result.method).toBe("access_code");
  });

  it("returns authenticated=false for unauthenticated users with no cookies", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(false);
    expect(result.tier).toBe("none");
    expect(result.method).toBe("none");
    expect(result.hasOAuth).toBe(false);
  });

  it("parses vop_access cookie correctly among multiple cookies", async () => {
    const ctx = createUnauthContext("session=abc123; vop_access=pro; other=value");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.checkAccess();

    expect(result.authenticated).toBe(true);
    expect(result.tier).toBe("pro");
    expect(result.method).toBe("access_code");
  });
});

describe("auth.verifyAccessCode — tiered", () => {
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

  it("KINGKONG sets tier=lite cookie", async () => {
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
      expect(result.tier).toBe("lite");
      expect(result.label).toBe("VOP LITE");
    }
    expect(setCookieName).toBe("vop_access");
    expect(setCookieValue).toBe("lite");
  });

  it("KINGKONG1 sets tier=pro cookie", async () => {
    let setCookieName = "";
    let setCookieValue = "";
    const ctx = createUnauthContext();
    (ctx.res as any).cookie = (name: string, value: string) => {
      setCookieName = name;
      setCookieValue = value;
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.verifyAccessCode({ code: "KINGKONG1" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tier).toBe("pro");
      expect(result.label).toBe("VOP PRO — Full Access");
    }
    expect(setCookieName).toBe("vop_access");
    expect(setCookieValue).toBe("pro");
  });

  it("KINGKONG1 is case-insensitive", async () => {
    let setCookieValue = "";
    const ctx = createUnauthContext();
    (ctx.res as any).cookie = (_: string, value: string) => { setCookieValue = value; };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.verifyAccessCode({ code: "kingkong1" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tier).toBe("pro");
    }
    expect(setCookieValue).toBe("pro");
  });
});
