import { describe, expect, it, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { createShareToken, validateShareToken } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// ── Helper: create an admin context ──────────────────────────────────────
function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-001",
    email: "admin@ppei.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {}, cookies: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["res"],
  };
}

function createSuperAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "superadmin-001",
    email: "super@ppei.com",
    name: "Super Admin",
    loginMethod: "manus",
    role: "super_admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {}, cookies: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["res"],
  };
}

function createRegularUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 3,
    openId: "user-001",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {}, cookies: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {}, cookies: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as TrpcContext["res"],
  };
}

// ── Share Token Generation Tests ─────────────────────────────────────────
describe("auth.generateShareLink", () => {
  it("allows admin to generate a share link", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.generateShareLink({
      path: "/pitch",
      expiresInHours: 24,
      label: "Test pitch link",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.token).toBeTruthy();
      expect(result.token.length).toBeGreaterThanOrEqual(20);
      expect(result.allowedPath).toBe("/pitch");
      expect(result.expiresAt).toBeDefined();
    }
  });

  it("allows super_admin to generate a share link", async () => {
    const ctx = createSuperAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.generateShareLink({
      path: "/fleet",
      expiresInHours: 12,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.allowedPath).toBe("/fleet");
    }
  });

  it("rejects regular users from generating share links", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.generateShareLink({
      path: "/pitch",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain("admin");
    }
  });

  it("rejects unauthenticated users from generating share links", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.generateShareLink({
      path: "/pitch",
    });
    expect(result.success).toBe(false);
  });

  it("defaults to 24-hour expiry when not specified", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const before = Date.now();
    const result = await caller.auth.generateShareLink({
      path: "/drag",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const expiresMs = new Date(result.expiresAt).getTime();
      const expectedMs = before + 24 * 60 * 60 * 1000;
      // Allow 10 second tolerance
      expect(expiresMs).toBeGreaterThan(expectedMs - 10000);
      expect(expiresMs).toBeLessThan(expectedMs + 10000);
    }
  });

  it("generates unique tokens for each call", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const result1 = await caller.auth.generateShareLink({ path: "/pitch" });
    const result2 = await caller.auth.generateShareLink({ path: "/pitch" });
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    if (result1.success && result2.success) {
      expect(result1.token).not.toBe(result2.token);
    }
  });
});

// ── Share Token Validation Tests ─────────────────────────────────────────
describe("auth.validateShareToken", () => {
  it("validates a fresh token and returns allowed path", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    // Generate a token
    const genResult = await caller.auth.generateShareLink({
      path: "/pitch",
      expiresInHours: 1,
    });
    expect(genResult.success).toBe(true);
    if (!genResult.success) return;

    // Validate it (anyone can validate, even unauthenticated)
    const unauthCaller = appRouter.createCaller(createUnauthContext());
    const valResult = await unauthCaller.auth.validateShareToken({
      token: genResult.token,
    });
    expect(valResult.success).toBe(true);
    if (valResult.success) {
      expect(valResult.allowedPath).toBe("/pitch");
    }
  });

  it("rejects a token that has already been consumed (single-use)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const genResult = await caller.auth.generateShareLink({
      path: "/community",
      expiresInHours: 24,
    });
    expect(genResult.success).toBe(true);
    if (!genResult.success) return;

    const unauthCaller = appRouter.createCaller(createUnauthContext());

    // First use — should succeed
    const first = await unauthCaller.auth.validateShareToken({ token: genResult.token });
    expect(first.success).toBe(true);

    // Second use — should fail (consumed)
    const second = await unauthCaller.auth.validateShareToken({ token: genResult.token });
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.message).toContain("Invalid");
    }
  });

  it("rejects a completely invalid/random token", async () => {
    const unauthCaller = appRouter.createCaller(createUnauthContext());
    const result = await unauthCaller.auth.validateShareToken({
      token: "this-token-does-not-exist-at-all-12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty token string", async () => {
    const unauthCaller = appRouter.createCaller(createUnauthContext());
    // z.string().min(1) should reject empty string
    await expect(
      unauthCaller.auth.validateShareToken({ token: "" })
    ).rejects.toThrow();
  });
});

// ── DB-level Share Token Tests ───────────────────────────────────────────
describe("shareToken DB functions", () => {
  it("createShareToken returns token with correct path", async () => {
    const result = await createShareToken("/calibrations", 1, "test label", 48);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.token.length).toBeGreaterThanOrEqual(20);
      expect(result.allowedPath).toBe("/calibrations");
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("createShareToken strips trailing slashes from path", async () => {
    const result = await createShareToken("/pitch///", 1, undefined, 1);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.allowedPath).toBe("/pitch");
    }
  });

  it("createShareToken handles root path", async () => {
    const result = await createShareToken("/", 1, undefined, 1);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.allowedPath).toBe("/");
    }
  });

  it("validateShareToken returns null for non-existent token", async () => {
    const result = await validateShareToken("nonexistent-token-xyz-123");
    expect(result).toBeNull();
  });

  it("validateShareToken consumes token on first use", async () => {
    const created = await createShareToken("/tasks", 1, "consume test", 24);
    expect(created).not.toBeNull();
    if (!created) return;

    // First validation — should succeed and consume
    const first = await validateShareToken(created.token);
    expect(first).not.toBeNull();
    expect(first?.allowedPath).toBe("/tasks");

    // Second validation — should fail (consumed)
    const second = await validateShareToken(created.token);
    expect(second).toBeNull();
  });

  it("validateShareToken rejects expired tokens", async () => {
    // Create a token that expires in 0 hours (already expired)
    // We need to manually insert an expired token
    const created = await createShareToken("/expired-test", 1, "expired", 0);
    // With 0 hours, expiresAt = now, so it should be expired immediately
    // (or within milliseconds)
    expect(created).not.toBeNull();
    if (!created) return;

    // Wait a tiny bit to ensure it's past expiry
    await new Promise((r) => setTimeout(r, 50));

    const result = await validateShareToken(created.token);
    expect(result).toBeNull();
  });

  it("validateShareToken trims whitespace from token", async () => {
    const created = await createShareToken("/trim-test", 1, "trim", 24);
    expect(created).not.toBeNull();
    if (!created) return;

    // Validate with leading/trailing whitespace
    const result = await validateShareToken(`  ${created.token}  `);
    expect(result).not.toBeNull();
    expect(result?.allowedPath).toBe("/trim-test");
  });

  it("each generated token is unique", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = await createShareToken("/unique-test", 1, `unique-${i}`, 1);
      expect(result).not.toBeNull();
      if (result) {
        expect(tokens.has(result.token)).toBe(false);
        tokens.add(result.token);
      }
    }
    expect(tokens.size).toBe(10);
  });
});
