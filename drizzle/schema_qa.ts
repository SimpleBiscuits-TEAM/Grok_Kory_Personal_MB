import { int, bigint, boolean, mysqlEnum, mysqlTable, text, varchar, index } from "drizzle-orm/mysql-core";
import { users } from "./schema";

// ── QA Test Checklists ──────────────────────────────────────────────────────

export const qaChecklists = mysqlTable("qa_checklists", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 32 }),
  createdBy: int("createdBy").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active").notNull(),
}, (table) => ({
  statusIdx: index("idx_qa_checklist_status").on(table.status),
  createdByIdx: index("idx_qa_checklist_created_by").on(table.createdBy),
}));

export type QaChecklist = typeof qaChecklists.$inferSelect;
export type InsertQaChecklist = typeof qaChecklists.$inferInsert;

// ── QA Test Items ───────────────────────────────────────────────────────────

export const qaTestItems = mysqlTable("qa_test_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  checklistId: varchar("checklistId", { length: 64 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "pass", "fail", "blocked", "skipped"]).default("pending").notNull(),
  assignedTo: int("assignedTo"),
  testedBy: int("testedBy"),
  testedAt: bigint("testedAt", { mode: "number" }),
  comment: text("comment"),
  errorDetails: text("errorDetails"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  checklistIdx: index("idx_qa_item_checklist").on(table.checklistId),
  statusIdx: index("idx_qa_item_status").on(table.status),
  categoryIdx: index("idx_qa_item_category").on(table.category),
  assignedIdx: index("idx_qa_item_assigned").on(table.assignedTo),
}));

export type QaTestItem = typeof qaTestItems.$inferSelect;
export type InsertQaTestItem = typeof qaTestItems.$inferInsert;

// ── QA Test Item Comments (thread per item) ─────────────────────────────────

export const qaItemComments = mysqlTable("qa_item_comments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  testItemId: varchar("testItemId", { length: 64 }).notNull(),
  userId: int("userId").notNull(),
  message: text("message").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
}, (table) => ({
  testItemIdx: index("idx_qa_comment_item").on(table.testItemId),
  userIdx: index("idx_qa_comment_user").on(table.userId),
}));

export type QaItemComment = typeof qaItemComments.$inferSelect;
export type InsertQaItemComment = typeof qaItemComments.$inferInsert;

// ── User Notification Preferences ───────────────────────────────────────────

export const userNotificationPrefs = mysqlTable("user_notification_prefs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  enablePush: boolean("enablePush").default(true).notNull(),
  enableWhatsNew: boolean("enableWhatsNew").default(true).notNull(),
  minPriority: mysqlEnum("minPriority", ["low", "medium", "high", "critical"]).default("low").notNull(),
  mutedUntil: bigint("mutedUntil", { mode: "number" }),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
}, (table) => ({
  userIdx: index("idx_notif_prefs_user").on(table.userId),
}));

export type UserNotificationPref = typeof userNotificationPrefs.$inferSelect;
export type InsertUserNotificationPref = typeof userNotificationPrefs.$inferInsert;
