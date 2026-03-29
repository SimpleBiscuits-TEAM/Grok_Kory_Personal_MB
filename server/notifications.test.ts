import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Helpers ──────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
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
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("notifications router", () => {
  it("admin can list notifications", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create and send notification", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.createAndSend({
      title: "Test Notification",
      message: "This is a test push notification",
      priority: "medium",
      targetAudience: "all",
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("sent");
    expect(result).toHaveProperty("total");
    expect(typeof result.id).toBe("string");
  });

  it("regular user can check unread count", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.unreadCount();
    expect(result).toHaveProperty("count");
    expect(typeof result.count).toBe("number");
  });

  it("regular user can fetch their notifications", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.myNotifications({ limit: 10, includeRead: false });
    expect(Array.isArray(result)).toBe(true);
  });

  it("regular user can mark all as read", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.markAllAsRead();
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });
});
