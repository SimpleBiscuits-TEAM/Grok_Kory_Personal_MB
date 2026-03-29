import { int, bigint, mysqlEnum, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { users } from "./schema";

// ── Admin Notifications ─────────────────────────────────────────────────────

export const adminNotifications = mysqlTable("admin_notifications", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["draft", "scheduled", "sent", "archived"]).default("draft").notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  scheduledFor: bigint("scheduledFor", { mode: "number" }),
  sentAt: bigint("sentAt", { mode: "number" }),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  actionLabel: varchar("actionLabel", { length: 255 }),
  actionUrl: varchar("actionUrl", { length: 512 }),
  targetAudience: mysqlEnum("targetAudience", ["all", "admins", "users"]).default("all").notNull(),
});

export type AdminNotification = typeof adminNotifications.$inferSelect;
export type InsertAdminNotification = typeof adminNotifications.$inferInsert;

// ── Notification Deliveries ─────────────────────────────────────────────────

export const notificationDeliveries = mysqlTable("notification_deliveries", {
  id: varchar("id", { length: 64 }).primaryKey(),
  notificationId: varchar("notificationId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "delivered", "read", "dismissed"]).default("pending").notNull(),
  deliveredAt: bigint("deliveredAt", { mode: "number" }),
  readAt: bigint("readAt", { mode: "number" }),
  dismissedAt: bigint("dismissedAt", { mode: "number" }),
  actionClickedAt: bigint("actionClickedAt", { mode: "number" }),
});

export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type InsertNotificationDelivery = typeof notificationDeliveries.$inferInsert;
