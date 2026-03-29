import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal } from "drizzle-orm/mysql-core";

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
    "analyzing",       // Knox is analyzing the bug
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
  // Knox's analysis
  analysisResult: text("analysisResult"), // JSON: Knox's diagnosis
  rootCause: text("rootCause"),
  proposedFix: text("proposedFix"), // JSON: what Knox proposes to change
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
  actorId: int("actorId"), // FK to users.id (null = system/Knox)
  actorType: mysqlEnum("actorType", ["user", "admin", "mara", "system"]).notNull(),
  action: varchar("action", { length: 128 }).notNull(), // e.g., "submitted", "analyzed", "fix_applied", "retest_confirmed"
  details: text("details"), // JSON: action-specific data
  tokensUsed: int("tokensUsed").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DebugAuditLog = typeof debugAuditLog.$inferSelect;
export type InsertDebugAuditLog = typeof debugAuditLog.$inferInsert;

// ── Admin Messaging System ───────────────────────────────────────────────────

/**
 * Admin conversations — tracks ongoing conversations between admin and users/testers.
 * Organized by user for easy management.
 */
export const adminConversations = mysqlTable("admin_conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // FK to users.id (the user being communicated with)
  adminId: int("adminId").notNull(), // FK to users.id (the admin managing this conversation)
  subject: varchar("subject", { length: 255 }).notNull(), // conversation topic
  isActive: boolean("isActive").default(true).notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdminConversation = typeof adminConversations.$inferSelect;
export type InsertAdminConversation = typeof adminConversations.$inferInsert;

/**
 * Admin messages — individual messages within a conversation.
 * Supports both admin-to-user and user-to-admin messages.
 */
export const adminMessages = mysqlTable("admin_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(), // FK to adminConversations.id
  senderId: int("senderId").notNull(), // FK to users.id (who sent this message)
  senderType: mysqlEnum("senderType", ["admin", "user"]).notNull(),
  content: text("content").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AdminMessage = typeof adminMessages.$inferSelect;
export type InsertAdminMessage = typeof adminMessages.$inferInsert;


// ── Generated A2L Cache ──────────────────────────────────────────────────────
/**
 * Generated A2L files — stores auto-generated A2L definitions from binary reverse engineering.
 * Indexed by OS number for fast lookup when matching binaries are uploaded.
 * Allows reuse of previously generated definitions without regenerating.
 */
export const generatedA2L = mysqlTable("generated_a2l", {
  id: int("id").autoincrement().primaryKey(),
  osNumber: varchar("osNumber", { length: 32 }).notNull().unique(), // e.g., 1G0100914SB3VUM8
  ecuFamily: varchar("ecuFamily", { length: 64 }).notNull(), // e.g., MG1C, ME17
  version: varchar("version", { length: 32 }).default("1.0.0").notNull(),
  a2lContent: text("a2lContent").notNull(), // Full A2L definition (can be 10+ MB)
  fileSize: int("fileSize").notNull(), // Size in bytes
  mapCount: int("mapCount").notNull(), // Number of discovered maps
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(), // Detection confidence 0.00-1.00
  binaryHash: varchar("binaryHash", { length: 64 }), // SHA256 hash of original binary for verification
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GeneratedA2L = typeof generatedA2L.$inferSelect;
export type InsertGeneratedA2L = typeof generatedA2L.$inferInsert;
