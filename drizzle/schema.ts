import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "super_admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Feedback / Error Reports ──────────────────────────────────────────────
export const feedback = mysqlTable("feedback", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["feedback", "error"]).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  rating: int("rating"),
  message: text("message").notNull(),
  errorType: varchar("errorType", { length: 255 }),
  stepsToReproduce: text("stepsToReproduce"),
  context: text("context"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;