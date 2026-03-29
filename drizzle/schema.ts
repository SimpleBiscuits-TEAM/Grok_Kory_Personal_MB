import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

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

// ── Self-Healing Debug System ────────────────────────────────────────────

/**
 * Debug permissions — admin grants specific users access to the debug system.
 * Only users with an active permission entry can submit debug reports.
 */
export const debugPermissions = mysqlTable("debug_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK to users.id
  grantedBy: int("grantedBy").notNull(), // FK to users.id (admin who granted)
  isActive: boolean("isActive").default(true).notNull(),
  tokenBudget: int("tokenBudget").default(5000), // max tokens per session
  tokensUsed: int("tokensUsed").default(0),
  note: text("note"), // admin note about why access was granted
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export type DebugPermission = typeof debugPermissions.$inferSelect;
export type InsertDebugPermission = typeof debugPermissions.$inferInsert;

/**
 * Debug sessions — tracks each bug report through the full lifecycle:
 * submitted → analyzing → classified → fixing → awaiting_retest → confirmed_fixed | still_broken | escalated
 */
export const debugSessions = mysqlTable("debug_sessions", {
  id: int("id").autoincrement().primaryKey(),
  reporterId: int("reporterId").notNull(), // FK to users.id
  status: mysqlEnum("status", [
    "submitted",       // User submitted the bug report
    "analyzing",       // Erika is analyzing the bug
    "tier1_auto_fix",  // Classified as Tier 1, auto-fixing
    "tier2_pending",   // Classified as Tier 2, awaiting admin approval
    "tier2_approved",  // Admin approved the Tier 2 fix
    "tier2_rejected",  // Admin rejected the Tier 2 fix
    "fixing",          // Fix is being applied
    "awaiting_retest", // Fix applied, waiting for user to retest
    "confirmed_fixed", // User confirmed the fix works
    "still_broken",    // User says it's still broken
    "escalated",       // Escalated to admin for manual intervention
    "closed",          // Session closed
  ]).default("submitted").notNull(),
  tier: mysqlEnum("tier", ["tier1", "tier2"]).default("tier1"),
  // Bug report details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  stepsToReproduce: text("stepsToReproduce"),
  expectedBehavior: text("expectedBehavior"),
  actualBehavior: text("actualBehavior"),
  featureArea: varchar("featureArea", { length: 128 }), // e.g., "datalogger", "editor", "analyzer"
  screenshotUrl: text("screenshotUrl"),
  browserInfo: text("browserInfo"), // user agent, viewport, etc.
  // Erika's analysis
  analysisResult: text("analysisResult"), // JSON: Erika's diagnosis
  rootCause: text("rootCause"),
  proposedFix: text("proposedFix"), // JSON: what Erika proposes to change
  fixApplied: text("fixApplied"), // JSON: what was actually changed
  estimatedTokens: int("estimatedTokens"), // estimated token cost
  actualTokens: int("actualTokens"), // actual tokens used
  // Retest feedback
  retestFeedback: text("retestFeedback"), // user's retest comments
  retestCount: int("retestCount").default(0),
  // Admin review
  reviewedBy: int("reviewedBy"), // FK to users.id (admin who reviewed)
  reviewNote: text("reviewNote"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type DebugSession = typeof debugSessions.$inferSelect;
export type InsertDebugSession = typeof debugSessions.$inferInsert;

/**
 * Debug audit log — immutable record of every action in the debug system.
 * Used for accountability, token tracking, and rollback decisions.
 */
export const debugAuditLog = mysqlTable("debug_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(), // FK to debugSessions.id
  actorId: int("actorId"), // FK to users.id (null = system/Erika)
  actorType: mysqlEnum("actorType", ["user", "admin", "erika", "system"]).notNull(),
  action: varchar("action", { length: 128 }).notNull(), // e.g., "submitted", "analyzed", "fix_applied", "retest_confirmed"
  details: text("details"), // JSON: action-specific data
  tokensUsed: int("tokensUsed").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DebugAuditLog = typeof debugAuditLog.$inferSelect;
export type InsertDebugAuditLog = typeof debugAuditLog.$inferInsert;