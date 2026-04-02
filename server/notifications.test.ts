import { describe, expect, it, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { adminNotifications, notificationDeliveries } from "../drizzle/schema_notifications";
import { eq } from "drizzle-orm";

// ── Helpers ──────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const TEST_PREFIX = "__vitest_notif__";

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

// ── Cleanup: remove any test notifications created during this run ──────

const createdNotifIds: string[] = [];

afterAll(async () => {
  const db = await getDb();
  if (!db) return;

  for (const id of createdNotifIds) {
    try {
      await db.delete(notificationDeliveries).where(eq(notificationDeliveries.notificationId, id));
      await db.delete(adminNotifications).where(eq(adminNotifications.id, id));
    } catch {
      // Best-effort cleanup
    }
  }
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("notifications router", () => {
  it("admin can list notifications", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.list({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("admin can create and send notification (with cleanup)", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.notifications.createAndSend({
      title: `${TEST_PREFIX} Vitest Notification`,
      message: "This notification is created by vitest and will be cleaned up automatically",
      priority: "low",
      targetAudience: "admins", // Only target admins to minimize impact
      expiresAt: Date.now() + 1000, // Expire in 1 second so it won't show up
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("sent");
    expect(result).toHaveProperty("total");
    expect(typeof result.id).toBe("string");

    // Track for cleanup
    createdNotifIds.push(result.id);
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
