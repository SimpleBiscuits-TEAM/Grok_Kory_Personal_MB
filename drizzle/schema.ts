import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal, json } from "drizzle-orm/mysql-core";

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
  /** Advanced access status: none (default), pending (requested), approved, revoked */
  advancedAccess: mysqlEnum("advancedAccess", ["none", "pending", "approved", "revoked"]).default("none").notNull(),
  /** Access level for future tiered feature gating (0=none, 1-3=tiers) */
  accessLevel: int("accessLevel").default(0).notNull(),
  /** User ID of admin who approved/revoked access */
  accessApprovedBy: int("accessApprovedBy"),
  /** When access was approved/revoked */
  accessApprovedAt: timestamp("accessApprovedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Access Codes ─────────────────────────────────────────────────────────
/**
 * Access codes allow entry to the application without OAuth sign-in.
 * Admins create codes with optional expiry and usage limits.
 */
export const accessCodes = mysqlTable("access_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 255 }), // e.g. "Beta Tester", "SEMA 2026"
  createdBy: int("createdBy"), // FK to users.id (admin)
  isActive: boolean("isActive").default(true).notNull(),
  maxUses: int("maxUses"), // null = unlimited
  currentUses: int("currentUses").default(0).notNull(),
  expiresAt: timestamp("expiresAt"), // null = never expires
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccessCode = typeof accessCodes.$inferSelect;
export type InsertAccessCode = typeof accessCodes.$inferInsert;

// ── Share Tokens (single-session, single-page guest links) ──────────────
/**
 * Share tokens allow a guest to view exactly ONE page without signing in.
 * Each token is single-use: once validated it is marked consumed.
 * The viewer is locked to the allowedPath and cannot navigate elsewhere.
 */
export const shareTokens = mysqlTable("share_tokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  allowedPath: varchar("allowedPath", { length: 512 }).notNull(), // e.g. "/pitch"
  label: varchar("label", { length: 255 }), // optional description
  createdBy: int("createdBy"), // FK to users.id (admin/owner)
  consumed: boolean("consumed").default(false).notNull(),
  consumedAt: timestamp("consumedAt"),
  expiresAt: timestamp("expiresAt"), // null = 24h default enforced in code
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ShareToken = typeof shareTokens.$inferSelect;
export type InsertShareToken = typeof shareTokens.$inferInsert;

// ── NDA Submissions (for share token gated access) ──────────────────────
export const ndaSubmissions = mysqlTable("nda_submissions", {
  id: int("id").autoincrement().primaryKey(),
  tokenId: int("tokenId").notNull(), // FK to share_tokens.id
  signerName: varchar("signerName", { length: 255 }).notNull(),
  signerEmail: varchar("signerEmail", { length: 320 }),
  signatureImageUrl: text("signatureImageUrl"), // S3 URL of drawn signature
  uploadedDocUrl: text("uploadedDocUrl"), // S3 URL of uploaded pre-signed NDA
  status: mysqlEnum("status", ["pending", "verified", "rejected"]).default("pending").notNull(),
  verifiedBy: int("verifiedBy"), // FK to users.id (admin who verified)
  verifiedAt: timestamp("verifiedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type NdaSubmission = typeof ndaSubmissions.$inferSelect;
export type InsertNdaSubmission = typeof ndaSubmissions.$inferInsert;

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

/**
 * Cached datalog uploads for development/debugging.
 * Any CSV/datalog uploaded through the public analyzer is cached to S3
 * and tracked here for 8 hours so developers and testers can retrieve
 * the exact file that caused an issue.
 */
export const datalogCache = mysqlTable("datalog_cache", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: text("s3Url").notNull(),
  fileSize: int("fileSize").notNull(), // bytes
  sourcePage: varchar("sourcePage", { length: 128 }).default("analyzer"), // analyzer, advanced, compare
  uploadedBy: varchar("uploadedBy", { length: 128 }), // user openId if signed in, null if anonymous
  uploaderName: varchar("uploaderName", { length: 256 }), // display name if available
  expiresAt: timestamp("expiresAt").notNull(), // 8 hours from upload
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DatalogCache = typeof datalogCache.$inferSelect;
export type InsertDatalogCache = typeof datalogCache.$inferInsert;

// ── Waitlist ────────────────────────────────────────────────────────────────
export const waitlist = mysqlTable("waitlist", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),
  interest: varchar("interest", { length: 128 }), // fleet, drag, tuning, general
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Waitlist = typeof waitlist.$inferSelect;
export type InsertWaitlist = typeof waitlist.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// V-OP DRAG — Virtual Racing Terminal
// ══════════════════════════════════════════════════════════════════════════════

/** Drag racer profiles — linked to user account */
export const dragProfiles = mysqlTable("drag_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  displayName: varchar("displayName", { length: 128 }).notNull(),
  vehicleDesc: varchar("vehicleDesc", { length: 255 }), // "2022 L5P Duramax"
  vehicleClass: varchar("vehicleClass", { length: 64 }), // street, pro-street, race, diesel, gas, powersports
  bestEt: decimal("bestEt", { precision: 6, scale: 4 }), // best 1/4 mile ET
  bestMph: decimal("bestMph", { precision: 6, scale: 2 }), // best trap speed
  totalRuns: int("totalRuns").default(0),
  wins: int("wins").default(0),
  losses: int("losses").default(0),
  elo: int("elo").default(1200), // skill rating for matchmaking
  subscriptionStatus: mysqlEnum("subscriptionStatus", ["none", "active", "expired", "cancelled"]).default("none").notNull(),
  subscriptionExpiresAt: timestamp("subscriptionExpiresAt"),
  avatarUrl: text("avatarUrl"),
  vehiclePhotoUrl: text("vehiclePhotoUrl"), // truck photo for share cards
  bio: text("bio"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DragProfile = typeof dragProfiles.$inferSelect;
export type InsertDragProfile = typeof dragProfiles.$inferInsert;

/** Individual drag runs — captured from V-OP OBD or manual upload */
export const dragRuns = mysqlTable("drag_runs", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(), // FK to dragProfiles
  runType: mysqlEnum("runType", ["eighth", "quarter"]).default("quarter").notNull(),
  // Timing data
  reactionTime: decimal("reactionTime", { precision: 5, scale: 4 }), // seconds
  sixtyFt: decimal("sixtyFt", { precision: 5, scale: 4 }), // 60ft time
  threeThirtyFt: decimal("threeThirtyFt", { precision: 5, scale: 4 }), // 330ft
  eighthEt: decimal("eighthEt", { precision: 6, scale: 4 }), // 1/8 mile ET
  eighthMph: decimal("eighthMph", { precision: 6, scale: 2 }), // 1/8 mile MPH
  thousandFt: decimal("thousandFt", { precision: 6, scale: 4 }), // 1000ft
  quarterEt: decimal("quarterEt", { precision: 6, scale: 4 }), // 1/4 mile ET
  quarterMph: decimal("quarterMph", { precision: 6, scale: 2 }), // trap speed
  // Vehicle conditions from OBD
  peakBoost: decimal("peakBoost", { precision: 5, scale: 1 }),
  peakEgt: decimal("peakEgt", { precision: 6, scale: 1 }),
  peakRpm: int("peakRpm"),
  intakeTemp: decimal("intakeTemp", { precision: 5, scale: 1 }),
  ambientTemp: decimal("ambientTemp", { precision: 5, scale: 1 }),
  densityAltitude: int("densityAltitude"),
  // Data source
  dataSource: mysqlEnum("dataSource", ["vop_obd", "manual", "dragy", "racepak"]).default("vop_obd").notNull(),
  rawDataUrl: text("rawDataUrl"), // S3 link to full datalog
  // AI analysis
  aiReport: text("aiReport"), // JSON: Knox's race analysis
  timeslipUrl: text("timeslipUrl"), // S3 link to generated timeslip image
  // Verification
  isVerified: boolean("isVerified").default(false), // V-OP OBD verified = true
  verificationHash: varchar("verificationHash", { length: 64 }), // hardware verification
  // Metadata
  trackName: varchar("trackName", { length: 255 }),
  trackLocation: varchar("trackLocation", { length: 255 }),
  weatherConditions: varchar("weatherConditions", { length: 128 }),
  notes: text("notes"),
  isPublic: boolean("isPublic").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DragRun = typeof dragRuns.$inferSelect;
export type InsertDragRun = typeof dragRuns.$inferInsert;

/** Head-to-head challenges between racers */
export const dragChallenges = mysqlTable("drag_challenges", {
  id: int("id").autoincrement().primaryKey(),
  challengerId: int("challengerId").notNull(), // FK to dragProfiles
  opponentId: int("opponentId"), // FK to dragProfiles (null = open challenge)
  status: mysqlEnum("status", [
    "open",        // waiting for opponent
    "accepted",    // opponent accepted, waiting for runs
    "challenger_submitted", // challenger uploaded their run
    "opponent_submitted",   // opponent uploaded their run
    "complete",    // both runs in, winner determined
    "cancelled",   // cancelled
    "expired",     // timed out
  ]).default("open").notNull(),
  challengeType: mysqlEnum("challengeType", ["eighth", "quarter"]).default("quarter").notNull(),
  // Wagering
  entryFee: decimal("entryFee", { precision: 10, scale: 2 }).default("0"), // per racer
  prizePool: decimal("prizePool", { precision: 10, scale: 2 }).default("0"),
  platformFee: decimal("platformFee", { precision: 10, scale: 2 }).default("0"), // 1%
  // Linked runs
  challengerRunId: int("challengerRunId"), // FK to dragRuns
  opponentRunId: int("opponentRunId"), // FK to dragRuns
  winnerId: int("winnerId"), // FK to dragProfiles
  // Animation
  animationUrl: text("animationUrl"), // S3 link to race animation video
  // Timing
  expiresAt: timestamp("expiresAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DragChallenge = typeof dragChallenges.$inferSelect;
export type InsertDragChallenge = typeof dragChallenges.$inferInsert;

/** Tournament brackets */
export const dragTournaments = mysqlTable("drag_tournaments", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  tournamentType: mysqlEnum("tournamentType", ["bracket", "best_et", "king_of_hill"]).default("bracket").notNull(),
  raceType: mysqlEnum("raceType", ["eighth", "quarter"]).default("quarter").notNull(),
  vehicleClass: varchar("vehicleClass", { length: 64 }), // restrict to class or open
  maxParticipants: int("maxParticipants").default(32),
  currentParticipants: int("currentParticipants").default(0),
  entryFee: decimal("entryFee", { precision: 10, scale: 2 }).default("0"),
  prizePool: decimal("prizePool", { precision: 10, scale: 2 }).default("0"),
  status: mysqlEnum("status", ["registration", "active", "complete", "cancelled"]).default("registration").notNull(),
  rules: text("rules"),
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  winnerId: int("winnerId"), // FK to dragProfiles
  createdBy: int("createdBy").notNull(), // FK to users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DragTournament = typeof dragTournaments.$inferSelect;
export type InsertDragTournament = typeof dragTournaments.$inferInsert;

/** Leaderboard entries — aggregated for fast queries */
export const dragLeaderboard = mysqlTable("drag_leaderboard", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  category: varchar("category", { length: 64 }).notNull(), // "quarter_et", "eighth_et", "quarter_mph", "reaction"
  vehicleClass: varchar("vehicleClass", { length: 64 }).default("open"),
  bestValue: decimal("bestValue", { precision: 8, scale: 4 }).notNull(),
  runId: int("runId").notNull(), // FK to dragRuns
  season: varchar("season", { length: 16 }), // "2026-Q1", "all-time"
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DragLeaderboard = typeof dragLeaderboard.$inferSelect;
export type InsertDragLeaderboard = typeof dragLeaderboard.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// V-OP COMMUNITY — Modern Forum System
// ══════════════════════════════════════════════════════════════════════════════

/** Forum categories — top-level groupings */
export const forumCategories = mysqlTable("forum_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  description: text("description"),
  icon: varchar("icon", { length: 64 }), // lucide icon name
  color: varchar("color", { length: 32 }), // hex or oklch
  sortOrder: int("sortOrder").default(0),
  isDefault: boolean("isDefault").default(false), // system-created, can't delete
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ForumCategory = typeof forumCategories.$inferSelect;
export type InsertForumCategory = typeof forumCategories.$inferInsert;

/** Forum channels — individual discussion spaces within categories */
export const forumChannels = mysqlTable("forum_channels", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(), // FK to forumCategories
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").notNull(), // FK to users
  isOfficial: boolean("isOfficial").default(false), // PPEI official channel
  isPinned: boolean("isPinned").default(false),
  memberCount: int("memberCount").default(0),
  postCount: int("postCount").default(0),
  lastActivityAt: timestamp("lastActivityAt").defaultNow(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ForumChannel = typeof forumChannels.$inferSelect;
export type InsertForumChannel = typeof forumChannels.$inferInsert;

/** Forum threads — discussion topics within channels */
export const forumThreads = mysqlTable("forum_threads", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channelId").notNull(), // FK to forumChannels
  authorId: int("authorId").notNull(), // FK to users
  title: varchar("title", { length: 255 }).notNull(),
  isPinned: boolean("isPinned").default(false),
  isLocked: boolean("isLocked").default(false),
  viewCount: int("viewCount").default(0),
  replyCount: int("replyCount").default(0),
  likeCount: int("likeCount").default(0),
  lastReplyAt: timestamp("lastReplyAt"),
  lastReplyBy: int("lastReplyBy"), // FK to users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ForumThread = typeof forumThreads.$inferSelect;
export type InsertForumThread = typeof forumThreads.$inferInsert;

/** Forum posts — individual messages within threads */
export const forumPosts = mysqlTable("forum_posts", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(), // FK to forumThreads
  authorId: int("authorId").notNull(), // FK to users
  content: text("content").notNull(),
  replyToId: int("replyToId"), // FK to forumPosts (for nested replies)
  likeCount: int("likeCount").default(0),
  isEdited: boolean("isEdited").default(false),
  editedAt: timestamp("editedAt"),
  imageUrl: text("imageUrl"), // optional attached image
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ForumPost = typeof forumPosts.$inferSelect;
export type InsertForumPost = typeof forumPosts.$inferInsert;

/** Forum post likes — track who liked what */
export const forumLikes = mysqlTable("forum_likes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  postId: int("postId"), // FK to forumPosts
  threadId: int("threadId"), // FK to forumThreads (for liking the OP)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ForumLike = typeof forumLikes.$inferSelect;
export type InsertForumLike = typeof forumLikes.$inferInsert;

/** Channel memberships — who follows which channels */
export const forumMemberships = mysqlTable("forum_memberships", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  channelId: int("channelId").notNull(), // FK to forumChannels
  role: mysqlEnum("role", ["member", "moderator", "owner"]).default("member").notNull(),
  notificationsEnabled: boolean("notificationsEnabled").default(true),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type ForumMembership = typeof forumMemberships.$inferSelect;
export type InsertForumMembership = typeof forumMemberships.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// V-OP DRAG — Regional Callouts & User-Created Leagues
// ══════════════════════════════════════════════════════════════════════════════

/** Regional callouts — "Fastest in Louisiana", "King of 70601" */
export const dragCallouts = mysqlTable("drag_callouts", {
  id: int("id").autoincrement().primaryKey(),
  creatorId: int("creatorId").notNull(), // FK to dragProfiles
  title: varchar("title", { length: 255 }).notNull(), // "Fastest L5P in Louisiana"
  description: text("description"),
  locationType: mysqlEnum("locationType", ["state", "city", "zip", "county", "region", "country"]).notNull(),
  locationValue: varchar("locationValue", { length: 128 }).notNull(), // "Louisiana", "70601", "Houston"
  locationState: varchar("locationState", { length: 64 }), // state abbreviation for filtering
  vehicleClass: varchar("vehicleClass", { length: 64 }), // restrict to class or open
  raceType: mysqlEnum("raceType", ["eighth", "quarter"]).default("quarter").notNull(),
  currentChampionId: int("currentChampionId"), // FK to dragProfiles — who holds the title
  challengeCount: int("challengeCount").default(0),
  isActive: boolean("isActive").default(true),
  // Social
  shareUrl: text("shareUrl"), // shareable Facebook/social link
  coverImageUrl: text("coverImageUrl"), // callout banner image
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DragCallout = typeof dragCallouts.$inferSelect;
export type InsertDragCallout = typeof dragCallouts.$inferInsert;

/** User-created racing leagues/series */
export const dragLeagues = mysqlTable("drag_leagues", {
  id: int("id").autoincrement().primaryKey(),
  commissionerId: int("commissionerId").notNull(), // FK to dragProfiles — league creator/manager
  name: varchar("name", { length: 255 }).notNull(), // "Gulf Coast Diesel Series"
  description: text("description"),
  rules: text("rules"), // custom rules set by commissioner
  vehicleClass: varchar("vehicleClass", { length: 64 }), // restrict to class or open
  raceType: mysqlEnum("raceType", ["eighth", "quarter"]).default("quarter").notNull(),
  locationType: mysqlEnum("locationType", ["state", "city", "zip", "region", "national", "open"]).default("open"),
  locationValue: varchar("locationValue", { length: 128 }),
  // Membership
  maxMembers: int("maxMembers").default(64),
  memberCount: int("memberCount").default(0),
  isPublic: boolean("isPublic").default(true), // public = anyone can join, private = invite only
  entryFee: decimal("entryFee", { precision: 10, scale: 2 }).default("0"), // per season
  // Scoring
  pointsForWin: int("pointsForWin").default(3),
  pointsForLoss: int("pointsForLoss").default(0),
  pointsForDraw: int("pointsForDraw").default(1),
  bonusPointBestEt: boolean("bonusPointBestEt").default(true), // bonus point for best ET of the round
  // Status
  status: mysqlEnum("status", ["setup", "active", "paused", "completed", "archived"]).default("setup").notNull(),
  // Social
  logoUrl: text("logoUrl"),
  bannerUrl: text("bannerUrl"),
  shareUrl: text("shareUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DragLeague = typeof dragLeagues.$inferSelect;
export type InsertDragLeague = typeof dragLeagues.$inferInsert;

/** League memberships */
export const dragLeagueMembers = mysqlTable("drag_league_members", {
  id: int("id").autoincrement().primaryKey(),
  leagueId: int("leagueId").notNull(), // FK to dragLeagues
  profileId: int("profileId").notNull(), // FK to dragProfiles
  role: mysqlEnum("role", ["member", "moderator", "commissioner"]).default("member").notNull(),
  seasonPoints: int("seasonPoints").default(0),
  seasonWins: int("seasonWins").default(0),
  seasonLosses: int("seasonLosses").default(0),
  seasonBestEt: decimal("seasonBestEt", { precision: 6, scale: 4 }),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type DragLeagueMember = typeof dragLeagueMembers.$inferSelect;
export type InsertDragLeagueMember = typeof dragLeagueMembers.$inferInsert;

/** League seasons — multi-round championship tracking */
export const dragLeagueSeasons = mysqlTable("drag_league_seasons", {
  id: int("id").autoincrement().primaryKey(),
  leagueId: int("leagueId").notNull(), // FK to dragLeagues
  seasonNumber: int("seasonNumber").default(1).notNull(),
  name: varchar("name", { length: 255 }), // "Season 2 — Summer 2026"
  status: mysqlEnum("status", ["upcoming", "active", "playoffs", "complete"]).default("upcoming").notNull(),
  totalRounds: int("totalRounds").default(8),
  currentRound: int("currentRound").default(0),
  prizePool: decimal("prizePool", { precision: 10, scale: 2 }).default("0"),
  championId: int("championId"), // FK to dragProfiles
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DragLeagueSeason = typeof dragLeagueSeasons.$inferSelect;
export type InsertDragLeagueSeason = typeof dragLeagueSeasons.$inferInsert;

/** Season standings — per-member per-season points */
export const dragLeagueStandings = mysqlTable("drag_league_standings", {
  id: int("id").autoincrement().primaryKey(),
  seasonId: int("seasonId").notNull(), // FK to dragLeagueSeasons
  profileId: int("profileId").notNull(), // FK to dragProfiles
  rank: int("rank").default(0),
  points: int("points").default(0),
  wins: int("wins").default(0),
  losses: int("losses").default(0),
  bestEt: decimal("bestEt", { precision: 6, scale: 4 }),
  bestMph: decimal("bestMph", { precision: 6, scale: 2 }),
  roundsCompleted: int("roundsCompleted").default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DragLeagueStanding = typeof dragLeagueStandings.$inferSelect;
export type InsertDragLeagueStanding = typeof dragLeagueStandings.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// V-OP DRAG — Bitcoin / Crypto Payments
// ══════════════════════════════════════════════════════════════════════════════

/** Crypto wallet connections for drag racing wagering */
export const dragWallets = mysqlTable("drag_wallets", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(), // FK to dragProfiles
  walletType: mysqlEnum("walletType", ["btc", "btc_lightning", "usdc", "eth"]).notNull(),
  walletAddress: varchar("walletAddress", { length: 255 }).notNull(),
  label: varchar("label", { length: 128 }), // user-friendly name
  isDefault: boolean("isDefault").default(false),
  isVerified: boolean("isVerified").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DragWallet = typeof dragWallets.$inferSelect;
export type InsertDragWallet = typeof dragWallets.$inferInsert;

/** Crypto transactions — deposits, wagers, payouts, rake */
export const dragTransactions = mysqlTable("drag_transactions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(), // FK to dragProfiles
  txType: mysqlEnum("txType", [
    "deposit",        // user deposits BTC to platform
    "withdrawal",     // user withdraws BTC from platform
    "wager_lock",     // BTC locked in escrow for a challenge
    "wager_win",      // BTC won from a challenge
    "wager_refund",   // BTC refunded (cancelled challenge)
    "rake",           // 1% platform fee
    "subscription",   // monthly subscription payment
    "tournament_entry", // tournament entry fee
    "tournament_prize", // tournament prize payout
  ]).notNull(),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(), // BTC amount (8 decimal places)
  currency: mysqlEnum("currency", ["btc", "usdc", "eth"]).default("btc").notNull(),
  usdValueAtTime: decimal("usdValueAtTime", { precision: 10, scale: 2 }), // USD value at transaction time
  // References
  challengeId: int("challengeId"), // FK to dragChallenges
  tournamentId: int("tournamentId"), // FK to dragTournaments
  walletId: int("walletId"), // FK to dragWallets
  // Blockchain
  txHash: varchar("txHash", { length: 128 }), // blockchain transaction hash
  blockConfirmations: int("blockConfirmations").default(0),
  status: mysqlEnum("status", ["pending", "confirmed", "failed", "cancelled"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  confirmedAt: timestamp("confirmedAt"),
});

export type DragTransaction = typeof dragTransactions.$inferSelect;
export type InsertDragTransaction = typeof dragTransactions.$inferInsert;

/** Subscription tracking for drag racing tiers */
export const dragSubscriptions = mysqlTable("drag_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(), // FK to dragProfiles
  tier: mysqlEnum("tier", ["free", "racer", "competitor"]).default("free").notNull(),
  // free = 3 runs, racer = $20/mo (no betting), competitor = $200/mo (BTC wagering)
  priceUsd: decimal("priceUsd", { precision: 6, scale: 2 }).default("0"),
  paymentMethod: mysqlEnum("paymentMethod", ["btc", "usdc", "eth", "fiat"]).default("btc"),
  freeRunsUsed: int("freeRunsUsed").default(0), // out of 3
  status: mysqlEnum("status", ["active", "expired", "cancelled", "trial"]).default("trial").notNull(),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DragSubscription = typeof dragSubscriptions.$inferSelect;
export type InsertDragSubscription = typeof dragSubscriptions.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// V-OP FLEET — Full Schema (16 tables)
// ══════════════════════════════════════════════════════════════════════════════

/** Fleet organizations — multi-industry support */
export const fleetOrgs = mysqlTable("fleet_orgs", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(), // FK to users
  name: varchar("name", { length: 255 }).notNull(),
  industry: mysqlEnum("industry", [
    "diesel_trucks", "agriculture", "powersports", "golf_carts",
    "heavy_equipment", "construction", "rental", "mixed"
  ]).default("diesel_trucks").notNull(),
  tier: mysqlEnum("tier", ["self_service", "goose_standard", "goose_pro"]).default("self_service").notNull(),
  maxVehicles: int("maxVehicles").default(25),
  maxDrivers: int("maxDrivers").default(50),
  logoUrl: text("logoUrl"),
  timezone: varchar("timezone", { length: 64 }).default("America/Chicago"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FleetOrg = typeof fleetOrgs.$inferSelect;
export type InsertFleetOrg = typeof fleetOrgs.$inferInsert;

/** Fleet vehicles */
export const fleetVehicles = mysqlTable("fleet_vehicles", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(), // FK to fleetOrgs
  vin: varchar("vin", { length: 17 }),
  year: int("year"),
  make: varchar("make", { length: 64 }),
  model: varchar("model", { length: 128 }),
  engine: varchar("engine", { length: 128 }),
  vehicleType: mysqlEnum("vehicleType", [
    "truck", "tractor", "utv", "atv", "golf_cart",
    "excavator", "loader", "skid_steer", "generator", "other"
  ]).default("truck"),
  status: mysqlEnum("status", ["active", "maintenance", "inactive", "retired"]).default("active").notNull(),
  // OBD/Telematics
  deviceId: varchar("deviceId", { length: 128 }), // V-OP adapter serial
  lastOdometerMiles: int("lastOdometerMiles"),
  lastEngineHours: decimal("lastEngineHours", { precision: 10, scale: 1 }),
  lastLatitude: decimal("lastLatitude", { precision: 10, scale: 7 }),
  lastLongitude: decimal("lastLongitude", { precision: 10, scale: 7 }),
  lastSyncAt: timestamp("lastSyncAt"),
  // Maintenance
  nextServiceMiles: int("nextServiceMiles"),
  nextServiceDate: timestamp("nextServiceDate"),
  // Photo
  photoUrl: text("photoUrl"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FleetVehicle = typeof fleetVehicles.$inferSelect;
export type InsertFleetVehicle = typeof fleetVehicles.$inferInsert;

/** Fleet members (drivers, mechanics, managers) */
export const fleetMembers = mysqlTable("fleet_members", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(), // FK to fleetOrgs
  userId: int("userId"), // FK to users (null if not yet linked)
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  role: mysqlEnum("role", ["driver", "mechanic", "manager", "admin", "viewer"]).default("driver").notNull(),
  // Driver-specific
  licenseNumber: varchar("licenseNumber", { length: 64 }),
  licenseExpiry: timestamp("licenseExpiry"),
  assignedVehicleId: int("assignedVehicleId"), // FK to fleetVehicles
  // Scoring
  driverScore: int("driverScore").default(100), // 0-100
  totalTrips: int("totalTrips").default(0),
  totalMiles: int("totalMiles").default(0),
  hardBrakes: int("hardBrakes").default(0),
  hardAccels: int("hardAccels").default(0),
  speedingEvents: int("speedingEvents").default(0),
  idleMinutes: int("idleMinutes").default(0),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FleetMember = typeof fleetMembers.$inferSelect;
export type InsertFleetMember = typeof fleetMembers.$inferInsert;

/** Fleet trips */
export const fleetTrips = mysqlTable("fleet_trips", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  driverId: int("driverId"), // FK to fleetMembers
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime"),
  startOdometer: int("startOdometer"),
  endOdometer: int("endOdometer"),
  distanceMiles: decimal("distanceMiles", { precision: 8, scale: 1 }),
  fuelUsedGallons: decimal("fuelUsedGallons", { precision: 8, scale: 2 }),
  avgMpg: decimal("avgMpg", { precision: 5, scale: 1 }),
  maxSpeed: int("maxSpeed"),
  hardBrakes: int("hardBrakes").default(0),
  hardAccels: int("hardAccels").default(0),
  idleMinutes: int("idleMinutes").default(0),
  routeDataUrl: text("routeDataUrl"), // S3 link to GPS trace
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetTrip = typeof fleetTrips.$inferSelect;
export type InsertFleetTrip = typeof fleetTrips.$inferInsert;

/** Fleet events (maintenance, incidents, inspections) */
export const fleetEvents = mysqlTable("fleet_events", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  eventType: mysqlEnum("eventType", [
    "maintenance", "repair", "inspection", "incident",
    "fuel_fill", "tire_rotation", "oil_change", "dtc_alert"
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  odometerAtEvent: int("odometerAtEvent"),
  performedBy: int("performedBy"), // FK to fleetMembers
  scheduledDate: timestamp("scheduledDate"),
  completedDate: timestamp("completedDate"),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetEvent = typeof fleetEvents.$inferSelect;
export type InsertFleetEvent = typeof fleetEvents.$inferInsert;

/** Fleet fuel logs */
export const fleetFuelLogs = mysqlTable("fleet_fuel_logs", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  driverId: int("driverId"),
  gallons: decimal("gallons", { precision: 8, scale: 3 }).notNull(),
  pricePerGallon: decimal("pricePerGallon", { precision: 5, scale: 3 }),
  totalCost: decimal("totalCost", { precision: 8, scale: 2 }),
  odometer: int("odometer"),
  fuelType: mysqlEnum("fuelType", ["diesel", "gasoline", "e85", "electric", "propane"]).default("diesel"),
  station: varchar("station", { length: 255 }),
  isFull: boolean("isFull").default(true), // full tank fill-up
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetFuelLog = typeof fleetFuelLogs.$inferSelect;
export type InsertFleetFuelLog = typeof fleetFuelLogs.$inferInsert;

/** Fleet alerts */
export const fleetAlerts = mysqlTable("fleet_alerts", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId"),
  driverId: int("driverId"),
  alertType: mysqlEnum("alertType", [
    "dtc", "maintenance_due", "speeding", "hard_brake", "hard_accel",
    "geofence_exit", "geofence_enter", "idle_excessive", "fuel_low",
    "battery_low", "device_offline", "tire_pressure", "temp_high"
  ]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  isRead: boolean("isRead").default(false),
  isResolved: boolean("isResolved").default(false),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetAlert = typeof fleetAlerts.$inferSelect;
export type InsertFleetAlert = typeof fleetAlerts.$inferInsert;

/** Fleet alert rules — configurable thresholds */
export const fleetAlertRules = mysqlTable("fleet_alert_rules", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  alertType: varchar("alertType", { length: 64 }).notNull(),
  isEnabled: boolean("isEnabled").default(true),
  threshold: decimal("threshold", { precision: 10, scale: 2 }), // e.g., speed limit = 75
  cooldownMinutes: int("cooldownMinutes").default(30),
  notifyEmail: boolean("notifyEmail").default(true),
  notifyPush: boolean("notifyPush").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetAlertRule = typeof fleetAlertRules.$inferSelect;
export type InsertFleetAlertRule = typeof fleetAlertRules.$inferInsert;

/** Fleet remote diagnostic sessions */
export const fleetRemoteSessions = mysqlTable("fleet_remote_sessions", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  mechanicId: int("mechanicId"), // FK to fleetMembers
  sessionType: mysqlEnum("sessionType", ["diagnostic", "live_data", "dtc_read", "dtc_clear", "bidirectional"]).default("diagnostic").notNull(),
  status: mysqlEnum("status", ["requested", "active", "completed", "failed"]).default("requested").notNull(),
  // Knox AI analysis (NO tuning/calibration/A2L access for fleet mechanics)
  aiDiagnosis: text("aiDiagnosis"),
  dtcCodes: text("dtcCodes"), // JSON array of DTCs found
  recommendations: text("recommendations"),
  datalogUrl: text("datalogUrl"), // S3 link to captured data
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetRemoteSession = typeof fleetRemoteSessions.$inferSelect;
export type InsertFleetRemoteSession = typeof fleetRemoteSessions.$inferInsert;

/** Fleet aftermarket sensors (TPMS, temp, etc.) */
export const fleetSensors = mysqlTable("fleet_sensors", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  sensorType: mysqlEnum("sensorType", [
    "tpms", "egt_probe", "trans_temp", "coolant_temp",
    "oil_pressure", "oil_temp", "fuel_level", "battery_voltage",
    "ambient_temp", "humidity", "gps_tracker"
  ]).notNull(),
  sensorId: varchar("sensorId", { length: 128 }), // hardware serial
  label: varchar("label", { length: 128 }), // "Front Left Tire", "Turbo EGT"
  lastValue: decimal("lastValue", { precision: 10, scale: 2 }),
  lastUnit: varchar("lastUnit", { length: 32 }),
  lastReadAt: timestamp("lastReadAt"),
  minThreshold: decimal("minThreshold", { precision: 10, scale: 2 }),
  maxThreshold: decimal("maxThreshold", { precision: 10, scale: 2 }),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetSensor = typeof fleetSensors.$inferSelect;
export type InsertFleetSensor = typeof fleetSensors.$inferInsert;

/** Fleet device sync log */
export const fleetDeviceSyncs = mysqlTable("fleet_device_syncs", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  deviceId: varchar("deviceId", { length: 128 }),
  syncType: mysqlEnum("syncType", ["obd", "bluetooth", "wifi", "cellular", "manual"]).default("obd"),
  protocol: mysqlEnum("protocol", ["j1939", "can", "kline", "obd2", "uds"]).default("obd2"),
  pidsCollected: int("pidsCollected").default(0),
  dataSize: int("dataSize").default(0), // bytes
  duration: int("duration").default(0), // seconds
  status: mysqlEnum("status", ["success", "partial", "failed"]).default("success"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetDeviceSync = typeof fleetDeviceSyncs.$inferSelect;
export type InsertFleetDeviceSync = typeof fleetDeviceSyncs.$inferInsert;

/** Fleet AI insights — Goose-generated analysis */
export const fleetAiInsights = mysqlTable("fleet_ai_insights", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId"),
  insightType: mysqlEnum("insightType", [
    "fuel_efficiency", "driver_coaching", "maintenance_prediction",
    "route_optimization", "cost_analysis", "safety_alert", "fleet_summary"
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  severity: mysqlEnum("severity", ["info", "suggestion", "warning", "critical"]).default("info"),
  isActionable: boolean("isActionable").default(false),
  isRead: boolean("isRead").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetAiInsight = typeof fleetAiInsights.$inferSelect;
export type InsertFleetAiInsight = typeof fleetAiInsights.$inferInsert;

/** Fleet access tokens — shareable fleet-only access links */
export const fleetAccessTokens = mysqlTable("fleet_access_tokens", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  label: varchar("label", { length: 255 }), // "Mechanic Shop Link"
  role: mysqlEnum("role", ["viewer", "driver", "mechanic"]).default("viewer").notNull(),
  maxUses: int("maxUses"),
  usedCount: int("usedCount").default(0),
  expiresAt: timestamp("expiresAt"),
  isActive: boolean("isActive").default(true),
  createdBy: int("createdBy").notNull(), // FK to users
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetAccessToken = typeof fleetAccessTokens.$inferSelect;
export type InsertFleetAccessToken = typeof fleetAccessTokens.$inferInsert;

/** Fleet geofences */
export const fleetGeofences = mysqlTable("fleet_geofences", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  geoType: mysqlEnum("geoType", ["circle", "polygon"]).default("circle"),
  centerLat: decimal("centerLat", { precision: 10, scale: 7 }),
  centerLng: decimal("centerLng", { precision: 10, scale: 7 }),
  radiusMeters: int("radiusMeters"), // for circle type
  polygonCoords: text("polygonCoords"), // JSON for polygon type
  alertOnEnter: boolean("alertOnEnter").default(false),
  alertOnExit: boolean("alertOnExit").default(true),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FleetGeofence = typeof fleetGeofences.$inferSelect;
export type InsertFleetGeofence = typeof fleetGeofences.$inferInsert;

/** Fleet maintenance schedules */
export const fleetMaintenance = mysqlTable("fleet_maintenance", {
  id: int("id").autoincrement().primaryKey(),
  orgId: int("orgId").notNull(),
  vehicleId: int("vehicleId").notNull(),
  serviceType: varchar("serviceType", { length: 128 }).notNull(), // "Oil Change", "Tire Rotation"
  intervalMiles: int("intervalMiles"), // every X miles
  intervalDays: int("intervalDays"), // every X days
  lastServiceMiles: int("lastServiceMiles"),
  lastServiceDate: timestamp("lastServiceDate"),
  nextDueMiles: int("nextDueMiles"),
  nextDueDate: timestamp("nextDueDate"),
  estimatedCost: decimal("estimatedCost", { precision: 8, scale: 2 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FleetMaintenance = typeof fleetMaintenance.$inferSelect;
export type InsertFleetMaintenance = typeof fleetMaintenance.$inferInsert;

// ── Knox ECU File Library ──────────────────────────────────────────────────
/**
 * Stores uploaded ECU definition files (A2L, VST, H32, ATI, VBF, C source).
 * Files are stored in S3; this table holds metadata + analysis results.
 * Used by Erika for learning ECU structures and building definition files.
 */
export const knoxFiles = mysqlTable("knox_files", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 512 }).notNull(),
  fileType: varchar("fileType", { length: 32 }).notNull(), // a2l, binary, vst_text, vst_binary, source, ati, vbf, error_log
  sizeMb: decimal("sizeMb", { precision: 10, scale: 2 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  s3Key: varchar("s3Key", { length: 512 }).notNull(),
  s3Url: text("s3Url").notNull(),
  // ECU identification
  platform: varchar("platform", { length: 256 }).notNull(), // e.g., "Ford PCM / Coyote 5.0L"
  ecuId: varchar("ecuId", { length: 128 }), // e.g., "MED17", "MG1CS019"
  projectId: varchar("projectId", { length: 128 }), // A2L project ID
  projectName: varchar("projectName", { length: 256 }), // A2L project name
  version: varchar("version", { length: 256 }),
  epk: text("epk"), // EPK string
  cpuType: varchar("cpuType", { length: 64 }),
  // Parameter counts
  totalCalibratables: int("totalCalibratables").default(0),
  totalMeasurements: int("totalMeasurements").default(0),
  totalFunctions: int("totalFunctions").default(0),
  // Full analysis JSON (memory segments, subsystems, etc.)
  analysisJson: json("analysisJson"),
  // Source collection
  sourceCollection: varchar("sourceCollection", { length: 256 }), // e.g., "Mustang", "PCMTec", "Copperhead"
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type KnoxFile = typeof knoxFiles.$inferSelect;
export type InsertKnoxFile = typeof knoxFiles.$inferInsert;

// ── Tune Deploy — calibration binary library (R2 + searchable metadata) ────
/**
 * Indexed metadata for uploaded calibrations. Files live in object storage (R2 via storage proxy);
 * this table powers search, filters, and future vehicle-connected auto-match.
 * NOTE: Stack uses MySQL today; JSON columns mirror how you would model this in Postgres.
 */
export const tuneDeployCalibrations = mysqlTable("tune_deploy_calibrations", {
  id: int("id").autoincrement().primaryKey(),
  uploadedByUserId: int("uploadedByUserId").notNull(),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  r2Key: varchar("r2Key", { length: 512 }).notNull(),
  storageUrl: text("storageUrl"),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  vehicleFamily: varchar("vehicleFamily", { length: 128 }).notNull(),
  vehicleSubType: varchar("vehicleSubType", { length: 128 }).notNull(),
  modelYear: int("modelYear"),
  osVersion: varchar("osVersion", { length: 256 }),
  ecuType: varchar("ecuType", { length: 128 }),
  ecuHardwareId: varchar("ecuHardwareId", { length: 128 }),
  /** Denormalized for SQL LIKE search; also stored inside parsedMeta JSON */
  partNumbersCsv: text("partNumbersCsv"),
  /** Full Zod-validated parse result + extras */
  parsedMeta: json("parsedMeta").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TuneDeployCalibrationRow = typeof tuneDeployCalibrations.$inferSelect;
export type InsertTuneDeployCalibration = typeof tuneDeployCalibrations.$inferInsert;


// ── CASTING MODE — Live Streaming & Virtual Dyno Events ─────────────────────

/** Stream platform keys (YouTube, Twitch, Facebook, TikTok, custom RTMP) */
export const streamKeys = mysqlTable("stream_keys", {
  id: int("id").autoincrement().primaryKey(),
  platform: varchar("platform", { length: 64 }).notNull(), // youtube, twitch, facebook, tiktok, custom
  label: varchar("label", { length: 128 }).notNull(), // display name
  rtmpUrl: text("rtmpUrl").notNull(), // RTMP ingest URL
  streamKey: text("streamKey").notNull(), // stream key (encrypted at rest)
  enabled: boolean("enabled").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type StreamKey = typeof streamKeys.$inferSelect;

/** Cast sessions — each "Go Live" creates a session */
export const castSessions = mysqlTable("cast_sessions", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  mode: mysqlEnum("mode", ["standard", "dyno", "event"]).default("standard").notNull(),
  status: mysqlEnum("status", ["scheduled", "lobby", "live", "ended"]).default("scheduled").notNull(),
  /** Admin who started the cast */
  hostId: int("hostId").notNull(),
  /** Event ID if this session is part of a scheduled event */
  eventId: int("eventId"),
  /** WebRTC/media config */
  mediaConfig: json("mediaConfig"), // { camera, mic, screenShare, resolution, bitrate }
  /** Platforms being cast to */
  activePlatforms: json("activePlatforms"), // array of streamKey IDs
  /** Dyno mode overlay config */
  dynoConfig: json("dynoConfig"), // { showHp, showTorque, showBoost, showRpm, showEgt, overlayPosition }
  /** Peak stats captured during session */
  peakStats: json("peakStats"), // { maxHp, maxTorque, maxBoost, maxRpm, maxEgt, quarterMile }
  /** VOD recording URL after session ends */
  vodUrl: text("vodUrl"),
  /** Viewer count tracking */
  peakViewers: int("peakViewers").default(0),
  totalUniqueViewers: int("totalUniqueViewers").default(0),
  startedAt: timestamp("startedAt"),
  endedAt: timestamp("endedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CastSession = typeof castSessions.$inferSelect;

/** Scheduled dyno events */
export const castEvents = mysqlTable("cast_events", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  /** Event banner/thumbnail URL */
  bannerUrl: text("bannerUrl"),
  /** Vehicle info for the event */
  vehicleInfo: json("vehicleInfo"), // { year, make, model, engine, mods, owner }
  scheduledAt: timestamp("scheduledAt").notNull(),
  /** Duration estimate in minutes */
  estimatedDuration: int("estimatedDuration").default(60),
  status: mysqlEnum("status", ["upcoming", "live", "completed", "cancelled"]).default("upcoming").notNull(),
  /** Associated cast session ID (set when event goes live) */
  sessionId: int("sessionId"),
  /** RSVP count */
  rsvpCount: int("rsvpCount").default(0),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CastEvent = typeof castEvents.$inferSelect;

/** Viewers in a cast session (stadium seats) */
export const castViewers = mysqlTable("cast_viewers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId").notNull(),
  /** Seat position in the virtual stadium */
  seatSection: mysqlEnum("seatSection", ["front_row", "lower_bowl", "upper_deck", "skybox"]).default("upper_deck").notNull(),
  seatIndex: int("seatIndex").default(0).notNull(),
  /** Whether viewer has camera on (visible in stadium) */
  cameraOn: boolean("cameraOn").default(false).notNull(),
  /** WebRTC peer connection ID */
  peerId: varchar("peerId", { length: 128 }),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  leftAt: timestamp("leftAt"),
});
export type CastViewer = typeof castViewers.$inferSelect;

/** Chat messages during a cast */
export const castChat = mysqlTable("cast_chat", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId"),
  /** External platform source (null = in-app) */
  platform: varchar("platform", { length: 64 }), // null, youtube, twitch, facebook
  username: varchar("username", { length: 128 }).notNull(),
  message: text("message").notNull(),
  /** Message type */
  type: mysqlEnum("type", ["chat", "system", "ai_host", "highlight", "question"]).default("chat").notNull(),
  /** Pinned messages stay at top */
  pinned: boolean("pinned").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CastChatMessage = typeof castChat.$inferSelect;

/** Crowd reactions during a cast */
export const castReactions = mysqlTable("cast_reactions", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId"),
  /** Reaction type */
  reaction: varchar("reaction", { length: 32 }).notNull(), // fire, horn, applause, boost, checkered_flag, wrench, turbo
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CastReaction = typeof castReactions.$inferSelect;

/** Event RSVPs */
export const castRsvps = mysqlTable("cast_rsvps", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CastRsvp = typeof castRsvps.$inferSelect;

/** Front row seat requests */
export const castSeatRequests = mysqlTable("cast_seat_requests", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "denied"]).default("pending").notNull(),
  requestedSection: mysqlEnum("requestedSection", ["front_row", "lower_bowl"]).default("front_row").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CastSeatRequest = typeof castSeatRequests.$inferSelect;

/** Dyno data snapshots streamed during a live session */
export const castDynoSnapshots = mysqlTable("cast_dyno_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  /** Real-time dyno values */
  rpm: decimal("rpm", { precision: 10, scale: 2 }),
  hp: decimal("hp", { precision: 10, scale: 2 }),
  torque: decimal("torque", { precision: 10, scale: 2 }),
  boost: decimal("boost", { precision: 10, scale: 2 }),
  egt: decimal("egt", { precision: 10, scale: 2 }),
  speed: decimal("speed", { precision: 10, scale: 2 }),
  /** Timestamp of this data point */
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});
export type CastDynoSnapshot = typeof castDynoSnapshots.$inferSelect;

// ── FCA Calibration Database ────────────────────────────────────────────────

/**
 * FCA/Stellantis calibration records — parsed from the FED WORLD REPORT.
 * Each record maps old (superseded) part numbers to the current calibration,
 * with cross-references to TSBs and recalls.
 */
export const fcaCalibrations = mysqlTable("fca_calibrations", {
  id: int("id").autoincrement().primaryKey(),
  /** Vehicle/module description (e.g., "2007 2008 2009 VB CR4 | D1 - RAM 3500 PICKUP") */
  calibration: text("calibration").notNull(),
  /** Module type: ECM, PCM, TCM, BCM, etc. */
  moduleType: varchar("moduleType", { length: 32 }).notNull(),
  /** Current/latest calibration part number */
  newPartNumber: varchar("newPartNumber", { length: 32 }).notNull(),
  /** JSON array of superseded part numbers */
  oldPartNumbers: json("oldPartNumbers").notNull(),
  /** JSON array of related TSB references */
  tsbs: json("tsbs").notNull(),
  /** JSON array of related recall campaign numbers */
  recalls: json("recalls").notNull(),
  /** Extracted year range from calibration description */
  yearStart: int("yearStart"),
  yearEnd: int("yearEnd"),
  /** Vehicle platform codes extracted from calibration */
  platformCodes: varchar("platformCodes", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FcaCalibration = typeof fcaCalibrations.$inferSelect;
export type InsertFcaCalibration = typeof fcaCalibrations.$inferInsert;

// ── Pitch Analytics ─────────────────────────────────────────────────────────
/**
 * Tracks engagement events for the Pitch (AI Business Chat) tab.
 * Events: tab_view, chat_message, prompt_click, session_end
 */
export const pitchAnalytics = mysqlTable("pitch_analytics", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to users.id — null for unauthenticated visitors (future) */
  userId: int("userId"),
  /** Event type */
  eventType: mysqlEnum("eventType", ["tab_view", "chat_message", "prompt_click", "session_end"]).notNull(),
  /** Additional event data (e.g., prompt text, message length, session duration in seconds) */
  metadata: json("metadata"),
  /** Client-side session ID to group events from the same visit */
  sessionId: varchar("sessionId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PitchAnalytic = typeof pitchAnalytics.$inferSelect;
export type InsertPitchAnalytic = typeof pitchAnalytics.$inferInsert;

// ── Geo-Fencing ─────────────────────────────────────────────────────────────
/**
 * Geofence zones define geographical areas where tune upload/download is restricted.
 * Each zone stores a polygon as a JSON array of {lat, lng} coordinates.
 * Admins can create, edit, enable/disable, and delete zones.
 * The owner (Kory Willis / super_admin) has GOD MODE override authority.
 */
export const geofenceZones = mysqlTable("geofence_zones", {
  id: int("id").autoincrement().primaryKey(),
  /** Human-readable zone name (e.g., "SEMA Restricted Area", "Competitor Shop") */
  name: varchar("name", { length: 255 }).notNull(),
  /** Optional description of why this zone exists */
  description: text("description"),
  /** Restriction type: what actions are blocked inside this zone */
  restrictionType: mysqlEnum("restrictionType", ["block_upload", "block_download", "block_both"]).default("block_both").notNull(),
  /** Zone color for map display (hex string) */
  color: varchar("color", { length: 7 }).default("#FF0000"),
  /** Polygon coordinates as JSON array: [{lat: number, lng: number}, ...] */
  polygon: json("polygon").notNull(),
  /** Center point for quick map centering */
  centerLat: decimal("centerLat", { precision: 10, scale: 7 }),
  centerLng: decimal("centerLng", { precision: 10, scale: 7 }),
  /** Whether this zone is currently enforced */
  isActive: boolean("isActive").default(true).notNull(),
  /** FK to users.id — admin who created this zone */
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GeofenceZone = typeof geofenceZones.$inferSelect;
export type InsertGeofenceZone = typeof geofenceZones.$inferInsert;

/**
 * Per-user geofence overrides — allows super_admin (GOD MODE) to exempt
 * specific users from geofence restrictions, or to apply extra restrictions.
 */
export const geofenceUserOverrides = mysqlTable("geofence_user_overrides", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to users.id — the user being overridden */
  userId: int("userId").notNull(),
  /** FK to geofence_zones.id — null means override applies to ALL zones */
  zoneId: int("zoneId"),
  /** Override type: exempt (bypass restriction) or enforce (add restriction even outside zone) */
  overrideType: mysqlEnum("overrideType", ["exempt", "enforce"]).default("exempt").notNull(),
  /** Reason for the override */
  reason: text("reason"),
  /** FK to users.id — super_admin who granted this override */
  grantedBy: int("grantedBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeofenceUserOverride = typeof geofenceUserOverrides.$inferSelect;
export type InsertGeofenceUserOverride = typeof geofenceUserOverrides.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════
// FLASH SYSTEM TABLES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flash sessions — records each flash attempt (simulator or real PCAN).
 */
export const flashSessions = mysqlTable("flash_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique session UUID for client reference */
  uuid: varchar("uuid", { length: 64 }).notNull().unique(),
  /** FK to users.id */
  userId: int("userId").notNull(),
  /** ECU type string (e.g., "E88", "E41") */
  ecuType: varchar("ecuType", { length: 32 }).notNull(),
  /** ECU display name */
  ecuName: varchar("ecuName", { length: 128 }),
  /** Flash mode: full_flash, calibration, patch_only */
  flashMode: mysqlEnum("flashMode", ["full_flash", "calibration", "patch_only"]).notNull(),
  /** Connection mode: simulator or pcan */
  connectionMode: mysqlEnum("connectionMode", ["simulator", "pcan"]).notNull(),
  /** Session status */
  status: mysqlEnum("status", ["pending", "running", "success", "failed", "aborted"]).default("pending").notNull(),
  /** File hash (FNV-1a) for duplicate detection */
  fileHash: varchar("fileHash", { length: 64 }),
  /** Original filename */
  fileName: varchar("fileName", { length: 256 }),
  /** File size in bytes */
  fileSize: int("fileSize"),
  /** VIN from container header */
  vin: varchar("vin", { length: 32 }),
  /** File ID from container header */
  fileId: varchar("fileId", { length: 128 }),
  /** Total blocks in flash plan */
  totalBlocks: int("totalBlocks").default(0),
  /** Total bytes to transfer */
  totalBytes: int("totalBytes").default(0),
  /** Final progress percentage (0-100) */
  progress: int("progress").default(0),
  /** Duration in milliseconds */
  durationMs: int("durationMs"),
  /** Error message if failed */
  errorMessage: text("errorMessage"),
  /** NRC code if failed */
  nrcCode: int("nrcCode"),
  /** JSON metadata (flash plan summary, recovery info, etc.) */
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FlashSession = typeof flashSessions.$inferSelect;
export type InsertFlashSession = typeof flashSessions.$inferInsert;

/**
 * Flash session logs — individual log entries for a flash session.
 */
export const flashSessionLogs = mysqlTable("flash_session_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to flash_sessions.id */
  sessionId: int("sessionId").notNull(),
  /** Log timestamp (ms since session start) */
  timestampMs: int("timestampMs").notNull(),
  /** Flash phase */
  phase: varchar("phase", { length: 32 }).notNull(),
  /** Log type: info, success, warning, error, can_tx, can_rx, nrc */
  type: varchar("type", { length: 16 }).notNull(),
  /** Log message */
  message: text("message").notNull(),
  /** Block ID if applicable */
  blockId: int("blockId"),
  /** NRC code if applicable */
  nrcCode: int("nrcCode"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FlashSessionLog = typeof flashSessionLogs.$inferSelect;
export type InsertFlashSessionLog = typeof flashSessionLogs.$inferInsert;

/**
 * Flash queue — pending flash jobs.
 */
export const flashQueue = mysqlTable("flash_queue", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to users.id */
  userId: int("userId").notNull(),
  /** ECU type */
  ecuType: varchar("ecuType", { length: 32 }).notNull(),
  /** Flash mode */
  flashMode: mysqlEnum("flashMode", ["full_flash", "calibration", "patch_only"]).notNull(),
  /** Queue status */
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed", "cancelled"]).default("queued").notNull(),
  /** Priority (lower = higher priority) */
  priority: int("priority").default(10).notNull(),
  /** File hash for the container */
  fileHash: varchar("fileHash", { length: 64 }),
  /** S3 URL for the uploaded container */
  fileUrl: varchar("fileUrl", { length: 512 }),
  /** Original filename */
  fileName: varchar("fileName", { length: 256 }),
  /** FK to flash_sessions.id when processing starts */
  sessionId: int("sessionId"),
  /** JSON metadata */
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FlashQueueItem = typeof flashQueue.$inferSelect;
export type InsertFlashQueueItem = typeof flashQueue.$inferInsert;

/**
 * ECU snapshots — captured ECU state before/after flash.
 */
export const ecuSnapshots = mysqlTable("ecu_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to flash_sessions.id */
  sessionId: int("sessionId").notNull(),
  /** Snapshot type: pre_flash or post_flash */
  snapshotType: mysqlEnum("snapshotType", ["pre_flash", "post_flash"]).notNull(),
  /** ECU type */
  ecuType: varchar("ecuType", { length: 32 }).notNull(),
  /** VIN at time of snapshot */
  vin: varchar("vin", { length: 32 }),
  /** Software version identifiers (JSON array) */
  softwareVersions: json("softwareVersions"),
  /** Hardware number */
  hardwareNumber: varchar("hardwareNumber", { length: 64 }),
  /** DTC snapshot (JSON array of codes) */
  dtcSnapshot: json("dtcSnapshot"),
  /** Raw DID responses (JSON object) */
  didResponses: json("didResponses"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EcuSnapshot = typeof ecuSnapshots.$inferSelect;
export type InsertEcuSnapshot = typeof ecuSnapshots.$inferInsert;

/**
 * Flash stats — aggregated statistics per ECU type.
 */
export const flashStats = mysqlTable("flash_stats", {
  id: int("id").autoincrement().primaryKey(),
  /** ECU type */
  ecuType: varchar("ecuType", { length: 32 }).notNull(),
  /** Total flash attempts */
  totalAttempts: int("totalAttempts").default(0).notNull(),
  /** Successful flashes */
  successCount: int("successCount").default(0).notNull(),
  /** Failed flashes */
  failCount: int("failCount").default(0).notNull(),
  /** Average duration in ms */
  avgDurationMs: int("avgDurationMs").default(0),
  /** Last flash timestamp */
  lastFlashAt: timestamp("lastFlashAt"),
  /** Most common NRC code */
  commonNrc: int("commonNrc"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FlashStat = typeof flashStats.$inferSelect;
export type InsertFlashStat = typeof flashStats.$inferInsert;

/**
 * File fingerprints — for duplicate detection and flash history.
 */
export const fileFingerprints = mysqlTable("file_fingerprints", {
  id: int("id").autoincrement().primaryKey(),
  /** File hash (FNV-1a) */
  fileHash: varchar("fileHash", { length: 64 }).notNull(),
  /** ECU type */
  ecuType: varchar("ecuType", { length: 32 }).notNull(),
  /** Original filename */
  fileName: varchar("fileName", { length: 256 }),
  /** File size in bytes */
  fileSize: int("fileSize"),
  /** Number of times this file has been flashed */
  flashCount: int("flashCount").default(0).notNull(),
  /** Last flash session ID */
  lastSessionId: int("lastSessionId"),
  /** Last flash result */
  lastResult: mysqlEnum("lastResult", ["success", "failed"]),
  /** FK to users.id — who first uploaded this file */
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FileFingerprint = typeof fileFingerprints.$inferSelect;
export type InsertFileFingerprint = typeof fileFingerprints.$inferInsert;

// ── Weather Reports (Vehicle-Reported Atmospheric Data) ─────────────────────
/**
 * Individual weather reports from vehicles with VOP plugged in.
 * Vehicles calculate atmospheric conditions from onboard sensors:
 * - IAT (Intake Air Temperature) → ambient temperature
 * - MAP/BARO (Manifold/Barometric Pressure) → barometric pressure
 * - Calculated humidity from intake conditions
 * - GPS coordinates for location
 */
export const weatherReports = mysqlTable("weather_reports", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to users.id — vehicle owner who submitted the report */
  userId: int("userId"),
  /** Vehicle identifier (VIN or fleet tag) */
  vehicleId: varchar("vehicleId", { length: 64 }),
  vehicleName: varchar("vehicleName", { length: 128 }),
  /** GPS coordinates */
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  /** City/region (reverse geocoded or user-provided) */
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  /** Atmospheric measurements from vehicle sensors */
  temperatureF: decimal("temperatureF", { precision: 6, scale: 2 }).notNull(), // Fahrenheit
  temperatureC: decimal("temperatureC", { precision: 6, scale: 2 }).notNull(), // Celsius
  baroPressureInHg: decimal("baroPressureInHg", { precision: 6, scale: 3 }).notNull(), // inches of mercury
  baroPressureKpa: decimal("baroPressureKpa", { precision: 7, scale: 2 }).notNull(), // kilopascals
  humidityPct: decimal("humidityPct", { precision: 5, scale: 2 }), // relative humidity %
  altitudeFt: decimal("altitudeFt", { precision: 8, scale: 1 }), // feet above sea level
  /** Derived values */
  dewPointF: decimal("dewPointF", { precision: 6, scale: 2 }), // dew point Fahrenheit
  densityAltitudeFt: decimal("densityAltitudeFt", { precision: 8, scale: 1 }), // density altitude
  airDensityLbFt3: decimal("airDensityLbFt3", { precision: 8, scale: 6 }), // lb/ft³
  /** SAE J1349 correction factor computed from these conditions */
  saeCorrectionFactor: decimal("saeCorrectionFactor", { precision: 6, scale: 4 }),
  /** Sensor source info */
  sensorSource: mysqlEnum("sensorSource", ["obd2", "j1939", "kline", "manual"]).default("obd2"),
  /** Data quality score (0-100) based on sensor consistency */
  qualityScore: int("qualityScore").default(100),
  /** Timestamp of the actual measurement (may differ from createdAt) */
  measuredAt: timestamp("measuredAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WeatherReport = typeof weatherReports.$inferSelect;
export type InsertWeatherReport = typeof weatherReports.$inferInsert;

// ── Weather Stations (Aggregated Area Conditions) ───────────────────────────
/**
 * Virtual weather stations — aggregated atmospheric conditions from multiple
 * vehicle reports within a geographic area. Updated periodically.
 * These provide the "actual weather" for a region based on real vehicle data.
 */
export const weatherStations = mysqlTable("weather_stations", {
  id: int("id").autoincrement().primaryKey(),
  /** Station name (auto-generated from location) */
  name: varchar("name", { length: 128 }).notNull(),
  /** Center coordinates of the aggregation area */
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  /** Aggregation radius in miles */
  radiusMiles: decimal("radiusMiles", { precision: 6, scale: 2 }).default("25").notNull(),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  country: varchar("country", { length: 64 }),
  /** Aggregated atmospheric conditions (averaged from vehicle reports) */
  avgTemperatureF: decimal("avgTemperatureF", { precision: 6, scale: 2 }),
  avgBaroPressureInHg: decimal("avgBaroPressureInHg", { precision: 6, scale: 3 }),
  avgHumidityPct: decimal("avgHumidityPct", { precision: 5, scale: 2 }),
  avgAltitudeFt: decimal("avgAltitudeFt", { precision: 8, scale: 1 }),
  avgDensityAltitudeFt: decimal("avgDensityAltitudeFt", { precision: 8, scale: 1 }),
  avgAirDensityLbFt3: decimal("avgAirDensityLbFt3", { precision: 8, scale: 6 }),
  avgSaeCorrectionFactor: decimal("avgSaeCorrectionFactor", { precision: 6, scale: 4 }),
  /** Number of vehicle reports in this aggregation window */
  reportCount: int("reportCount").default(0).notNull(),
  /** Number of unique vehicles contributing */
  vehicleCount: int("vehicleCount").default(0).notNull(),
  /** Time window for aggregation */
  windowStartAt: timestamp("windowStartAt"),
  windowEndAt: timestamp("windowEndAt"),
  /** Last time this station was recalculated */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WeatherStation = typeof weatherStations.$inferSelect;
export type InsertWeatherStation = typeof weatherStations.$inferInsert;

// ── Dyno Sessions (Competition Dyno Runs with SAE Corrections) ──────────────
/**
 * Individual dyno runs with full atmospheric data and SAE correction factors.
 * Links to weather data so corrections are based on ACTUAL conditions,
 * not guessed standard values. This enables fair dyno competitions.
 */
export const dynoSessions = mysqlTable("dyno_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to users.id */
  userId: int("userId").notNull(),
  /** Vehicle info */
  vehicleId: varchar("vehicleId", { length: 64 }),
  vehicleName: varchar("vehicleName", { length: 128 }),
  vehicleYear: int("vehicleYear"),
  vehicleMake: varchar("vehicleMake", { length: 64 }),
  vehicleModel: varchar("vehicleModel", { length: 64 }),
  vehicleClass: varchar("vehicleClass", { length: 64 }), // e.g., "stock", "bolt-on", "built", "open"
  /** Dyno results — observed (uncorrected) */
  peakHpObserved: decimal("peakHpObserved", { precision: 7, scale: 2 }),
  peakTqObserved: decimal("peakTqObserved", { precision: 7, scale: 2 }),
  peakHpRpm: int("peakHpRpm"),
  peakTqRpm: int("peakTqRpm"),
  /** Dyno results — SAE corrected */
  peakHpCorrected: decimal("peakHpCorrected", { precision: 7, scale: 2 }),
  peakTqCorrected: decimal("peakTqCorrected", { precision: 7, scale: 2 }),
  /** SAE correction factor used (from real weather data) */
  saeCorrectionFactor: decimal("saeCorrectionFactor", { precision: 6, scale: 4 }).notNull(),
  /** Atmospheric conditions at time of run (from weather system) */
  temperatureF: decimal("temperatureF", { precision: 6, scale: 2 }).notNull(),
  baroPressureInHg: decimal("baroPressureInHg", { precision: 6, scale: 3 }).notNull(),
  humidityPct: decimal("humidityPct", { precision: 5, scale: 2 }),
  densityAltitudeFt: decimal("densityAltitudeFt", { precision: 8, scale: 1 }),
  airDensityLbFt3: decimal("airDensityLbFt3", { precision: 8, scale: 6 }),
  /** FK to weather_reports.id — the specific weather report used for correction */
  weatherReportId: int("weatherReportId"),
  /** FK to weather_stations.id — the station area used */
  weatherStationId: int("weatherStationId"),
  /** Location of the dyno run */
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  facilityName: varchar("facilityName", { length: 128 }), // dyno shop name
  /** Dyno type */
  dynoType: mysqlEnum("dynoType", ["chassis", "engine", "hub"]).default("chassis"),
  dynoBrand: varchar("dynoBrand", { length: 64 }), // e.g., "DynoJet", "Mustang", "Mainline"
  /** FK to dyno_competitions.id — if this run is part of a competition */
  competitionId: int("competitionId"),
  /** Run metadata */
  runNumber: int("runNumber").default(1),
  notes: text("notes"),
  /** S3 URL for dyno sheet image/PDF */
  dynoSheetUrl: text("dynoSheetUrl"),
  /** Full HP/TQ curve data as JSON array of {rpm, hp, tq} */
  curveData: json("curveData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DynoSession = typeof dynoSessions.$inferSelect;
export type InsertDynoSession = typeof dynoSessions.$inferInsert;

// ── Dyno Competitions (Events with Weather-Linked Conditions) ───────────────
/**
 * Competition events where multiple vehicles compete on the dyno.
 * Each competition is linked to real atmospheric conditions from the weather system,
 * ensuring all participants are corrected with the SAME actual conditions.
 * No more guessing the correction factor — we KNOW the conditions.
 */
export const dynoCompetitions = mysqlTable("dyno_competitions", {
  id: int("id").autoincrement().primaryKey(),
  /** Competition details */
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  /** Location */
  facilityName: varchar("facilityName", { length: 128 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  /** Competition rules */
  vehicleClass: varchar("vehicleClass", { length: 64 }), // e.g., "stock", "bolt-on", "built", "open"
  dynoType: mysqlEnum("dynoType", ["chassis", "engine", "hub"]).default("chassis"),
  maxParticipants: int("maxParticipants"),
  /** Atmospheric conditions for this competition (from weather system) */
  avgTemperatureF: decimal("avgTemperatureF", { precision: 6, scale: 2 }),
  avgBaroPressureInHg: decimal("avgBaroPressureInHg", { precision: 6, scale: 3 }),
  avgHumidityPct: decimal("avgHumidityPct", { precision: 5, scale: 2 }),
  avgSaeCorrectionFactor: decimal("avgSaeCorrectionFactor", { precision: 6, scale: 4 }),
  /** FK to weather_stations.id — the station providing conditions */
  weatherStationId: int("weatherStationId"),
  /** Status */
  status: mysqlEnum("status", ["upcoming", "active", "completed", "cancelled"]).default("upcoming").notNull(),
  /** Organizer */
  createdBy: int("createdBy").notNull(), // FK to users.id
  /** Schedule */
  startDate: timestamp("startDate"),
  endDate: timestamp("endDate"),
  /** Stats */
  participantCount: int("participantCount").default(0).notNull(),
  runCount: int("runCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DynoCompetition = typeof dynoCompetitions.$inferSelect;
export type InsertDynoCompetition = typeof dynoCompetitions.$inferInsert;

// ── Cloud Network — Crowd-Sourced Vehicle Analytics ─────────────────────────
/**
 * Cloud network enrollment. Users opt-in their vehicles to contribute
 * anonymized data (MPG, health, performance) to the crowd-sourced network.
 * Data is aggregated by vehicle type so owners and fleets can see real-world
 * averages instead of relying on forums or manufacturer specs.
 */
export const cloudEnrollments = mysqlTable("cloud_enrollments", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to users.id — the vehicle owner */
  userId: int("userId").notNull(),
  /** Vehicle identification */
  vehicleId: varchar("vehicleId", { length: 64 }),
  vin: varchar("vin", { length: 17 }),
  /** Vehicle classification for grouping */
  vehicleYear: int("vehicleYear"),
  vehicleMake: varchar("vehicleMake", { length: 64 }),
  vehicleModel: varchar("vehicleModel", { length: 64 }),
  vehicleEngine: varchar("vehicleEngine", { length: 64 }), // e.g., "6.6L Duramax L5P", "5.3L Vortec"
  vehicleClass: varchar("vehicleClass", { length: 64 }), // "stock", "bolt-on", "built", "deleted", "tuned"
  /** Normalized vehicle type key for aggregation (e.g., "2020_chevrolet_silverado_l5p") */
  vehicleTypeKey: varchar("vehicleTypeKey", { length: 128 }).notNull(),
  /** Optional fleet link */
  fleetOrgId: int("fleetOrgId"), // FK to fleet_orgs.id — null for individual owners
  /** Enrollment status */
  isActive: boolean("isActive").default(true).notNull(),
  /** What data the user consents to share */
  shareMpg: boolean("shareMpg").default(true).notNull(),
  shareHealth: boolean("shareHealth").default(true).notNull(),
  sharePerformance: boolean("sharePerformance").default(true).notNull(),
  shareDtcs: boolean("shareDtcs").default(true).notNull(),
  /** Region for geographic aggregation */
  region: varchar("region", { length: 64 }), // "US-South", "US-Midwest", etc.
  state: varchar("state", { length: 2 }),
  /** Timestamps */
  enrolledAt: timestamp("enrolledAt").defaultNow().notNull(),
  unenrolledAt: timestamp("unenrolledAt"),
  lastReportAt: timestamp("lastReportAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CloudEnrollment = typeof cloudEnrollments.$inferSelect;
export type InsertCloudEnrollment = typeof cloudEnrollments.$inferInsert;

/**
 * Periodic vehicle data snapshots submitted by enrolled vehicles.
 * Each snapshot captures a moment-in-time reading from the vehicle's sensors.
 * All data is anonymized — no PII, just vehicle type + metrics.
 */
export const cloudVehicleSnapshots = mysqlTable("cloud_vehicle_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  /** FK to cloud_enrollments.id */
  enrollmentId: int("enrollmentId").notNull(),
  /** Denormalized vehicle type key for fast aggregation */
  vehicleTypeKey: varchar("vehicleTypeKey", { length: 128 }).notNull(),
  /** Fleet org ID (null for individual) */
  fleetOrgId: int("fleetOrgId"),
  /** Fuel economy */
  avgMpg: decimal("avgMpg", { precision: 6, scale: 2 }),
  instantMpg: decimal("instantMpg", { precision: 6, scale: 2 }),
  totalMiles: decimal("totalMiles", { precision: 10, scale: 1 }),
  totalGallons: decimal("totalGallons", { precision: 10, scale: 2 }),
  /** Engine health metrics */
  coolantTempF: decimal("coolantTempF", { precision: 6, scale: 1 }),
  oilTempF: decimal("oilTempF", { precision: 6, scale: 1 }),
  oilPressurePsi: decimal("oilPressurePsi", { precision: 6, scale: 1 }),
  transTemp: decimal("transTemp", { precision: 6, scale: 1 }),
  batteryVoltage: decimal("batteryVoltage", { precision: 5, scale: 2 }),
  /** Performance metrics */
  boostPsi: decimal("boostPsi", { precision: 6, scale: 1 }),
  egtF: decimal("egtF", { precision: 7, scale: 1 }), // exhaust gas temp
  fuelRailPsi: decimal("fuelRailPsi", { precision: 8, scale: 1 }),
  airflowGps: decimal("airflowGps", { precision: 7, scale: 2 }), // MAF g/s
  /** Health score (0-100, computed from diagnostics) */
  healthScore: int("healthScore"),
  /** Active DTC count */
  activeDtcCount: int("activeDtcCount").default(0),
  /** Common DTCs (JSON array of codes, no PII) */
  activeDtcs: text("activeDtcs"), // JSON: ["P0300", "P0171"]
  /** Odometer reading */
  odometerMiles: int("odometerMiles"),
  /** Atmospheric conditions at time of snapshot */
  ambientTempF: decimal("ambientTempF", { precision: 6, scale: 1 }),
  baroPressureInHg: decimal("baroPressureInHg", { precision: 6, scale: 3 }),
  altitudeFt: int("altitudeFt"),
  /** Snapshot timestamp */
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CloudVehicleSnapshot = typeof cloudVehicleSnapshots.$inferSelect;
export type InsertCloudVehicleSnapshot = typeof cloudVehicleSnapshots.$inferInsert;

/**
 * Pre-computed fleet aggregates by vehicle type.
 * Updated periodically from cloud_vehicle_snapshots.
 * Provides the "real-world averages" that users and fleets compare against.
 */
export const cloudFleetAggregates = mysqlTable("cloud_fleet_aggregates", {
  id: int("id").autoincrement().primaryKey(),
  /** Vehicle type key for grouping (e.g., "2020_chevrolet_silverado_l5p") */
  vehicleTypeKey: varchar("vehicleTypeKey", { length: 128 }).notNull(),
  /** Human-readable vehicle type label */
  vehicleTypeLabel: varchar("vehicleTypeLabel", { length: 255 }).notNull(),
  /** Period for this aggregate (e.g., "2026-Q1", "all-time", "last-30d") */
  period: varchar("period", { length: 32 }).default("all-time").notNull(),
  /** Fleet vs individual breakdown */
  isFleetOnly: boolean("isFleetOnly").default(false).notNull(), // true = fleet vehicles only
  /** Fuel economy averages */
  avgMpg: decimal("avgMpg", { precision: 6, scale: 2 }),
  minMpg: decimal("minMpg", { precision: 6, scale: 2 }),
  maxMpg: decimal("maxMpg", { precision: 6, scale: 2 }),
  medianMpg: decimal("medianMpg", { precision: 6, scale: 2 }),
  /** Health averages */
  avgHealthScore: decimal("avgHealthScore", { precision: 5, scale: 1 }),
  avgCoolantTempF: decimal("avgCoolantTempF", { precision: 6, scale: 1 }),
  avgOilTempF: decimal("avgOilTempF", { precision: 6, scale: 1 }),
  avgTransTemp: decimal("avgTransTemp", { precision: 6, scale: 1 }),
  avgBatteryVoltage: decimal("avgBatteryVoltage", { precision: 5, scale: 2 }),
  /** Performance averages */
  avgBoostPsi: decimal("avgBoostPsi", { precision: 6, scale: 1 }),
  avgEgtF: decimal("avgEgtF", { precision: 7, scale: 1 }),
  /** DTC statistics */
  avgDtcCount: decimal("avgDtcCount", { precision: 5, scale: 2 }),
  topDtcs: text("topDtcs"), // JSON: [{ code: "P0300", count: 42, pct: 12.5 }]
  /** Mileage statistics */
  avgOdometerMiles: int("avgOdometerMiles"),
  minOdometerMiles: int("minOdometerMiles"),
  maxOdometerMiles: int("maxOdometerMiles"),
  /** Network size */
  vehicleCount: int("vehicleCount").default(0).notNull(),
  snapshotCount: int("snapshotCount").default(0).notNull(),
  fleetVehicleCount: int("fleetVehicleCount").default(0).notNull(),
  individualVehicleCount: int("individualVehicleCount").default(0).notNull(),
  /** Last computed */
  computedAt: timestamp("computedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CloudFleetAggregate = typeof cloudFleetAggregates.$inferSelect;
export type InsertCloudFleetAggregate = typeof cloudFleetAggregates.$inferInsert;


// ─── Live Weather Streams (Storm Chaser / Weather Streamer Telemetry) ────────

export const liveWeatherStreams = mysqlTable("live_weather_streams", {
  id: int("id").autoincrement().primaryKey(),
  /** User who owns this stream */
  userId: int("userId").notNull(),
  /** Stream key for authentication */
  streamKey: varchar("streamKey", { length: 64 }).notNull().unique(),
  /** Display name for the stream (e.g. "Ryan Hall Y'all - Oklahoma Chase") */
  title: varchar("title", { length: 256 }).notNull(),
  /** Stream description / mission */
  description: text("description"),
  /** Vehicle type (e.g. "2018 L5P Duramax") */
  vehicleType: varchar("vehicleType", { length: 128 }),
  /** Vehicle identifier / callsign */
  callsign: varchar("callsign", { length: 64 }),
  /** Stream status */
  status: mysqlEnum("status", ["live", "paused", "ended"]).default("live").notNull(),
  /** Current latitude */
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  /** Current longitude */
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  /** Current heading (degrees) */
  heading: decimal("heading", { precision: 5, scale: 1 }),
  /** Current speed (mph) */
  speedMph: decimal("speedMph", { precision: 6, scale: 1 }),
  /** Latest atmospheric: temperature (°F) */
  temperatureF: decimal("temperatureF", { precision: 6, scale: 2 }),
  /** Latest atmospheric: barometric pressure (inHg) */
  baroPressureInHg: decimal("baroPressureInHg", { precision: 6, scale: 3 }),
  /** Latest atmospheric: humidity (%) */
  humidityPct: decimal("humidityPct", { precision: 5, scale: 2 }),
  /** Latest atmospheric: wind speed (mph) */
  windSpeedMph: decimal("windSpeedMph", { precision: 6, scale: 1 }),
  /** Latest atmospheric: wind direction (degrees) */
  windDirection: decimal("windDirection", { precision: 5, scale: 1 }),
  /** Latest vehicle: engine RPM */
  engineRpm: int("engineRpm"),
  /** Latest vehicle: throttle position (%) */
  throttlePct: decimal("throttlePct", { precision: 5, scale: 2 }),
  /** Latest vehicle: engine load (%) */
  engineLoadPct: decimal("engineLoadPct", { precision: 5, scale: 2 }),
  /** Latest vehicle: boost pressure (psi) */
  boostPsi: decimal("boostPsi", { precision: 6, scale: 2 }),
  /** Latest vehicle: transmission temp (°F) */
  transTemp: decimal("transTemp", { precision: 6, scale: 1 }),
  /** Latest vehicle: coolant temp (°F) */
  coolantTemp: decimal("coolantTemp", { precision: 6, scale: 1 }),
  /** Latest vehicle: intake air temp (°F) */
  intakeAirTemp: decimal("intakeAirTemp", { precision: 6, scale: 1 }),
  /** Latest vehicle: fuel rate (gal/hr) */
  fuelRateGph: decimal("fuelRateGph", { precision: 6, scale: 2 }),
  /** Viewer count */
  viewerCount: int("viewerCount").default(0).notNull(),
  /** Total data points received */
  totalDataPoints: int("totalDataPoints").default(0).notNull(),
  /** External stream URL (YouTube, Twitch, etc.) for video embed */
  externalStreamUrl: varchar("externalStreamUrl", { length: 512 }),
  /** OBS overlay embed URL (generated) */
  overlayUrl: varchar("overlayUrl", { length: 512 }),
  /** Tags for categorization (JSON array: ["storm-chase", "tornado", "hurricane"]) */
  tags: json("tags"),
  /** Stream started at */
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  /** Stream ended at */
  endedAt: timestamp("endedAt"),
  /** Last telemetry update */
  lastUpdateAt: timestamp("lastUpdateAt").defaultNow().onUpdateNow().notNull(),
});
export type LiveWeatherStream = typeof liveWeatherStreams.$inferSelect;
export type InsertLiveWeatherStream = typeof liveWeatherStreams.$inferInsert;

export const streamTelemetryPoints = mysqlTable("stream_telemetry_points", {
  id: int("id").autoincrement().primaryKey(),
  /** Parent stream */
  streamId: int("streamId").notNull(),
  /** GPS coordinates */
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  heading: decimal("heading", { precision: 5, scale: 1 }),
  speedMph: decimal("speedMph", { precision: 6, scale: 1 }),
  /** Atmospheric data */
  temperatureF: decimal("temperatureF", { precision: 6, scale: 2 }),
  baroPressureInHg: decimal("baroPressureInHg", { precision: 6, scale: 3 }),
  humidityPct: decimal("humidityPct", { precision: 5, scale: 2 }),
  windSpeedMph: decimal("windSpeedMph", { precision: 6, scale: 1 }),
  windDirection: decimal("windDirection", { precision: 5, scale: 1 }),
  /** Vehicle telemetry */
  engineRpm: int("engineRpm"),
  throttlePct: decimal("throttlePct", { precision: 5, scale: 2 }),
  engineLoadPct: decimal("engineLoadPct", { precision: 5, scale: 2 }),
  boostPsi: decimal("boostPsi", { precision: 6, scale: 2 }),
  transTemp: decimal("transTemp", { precision: 6, scale: 1 }),
  coolantTemp: decimal("coolantTemp", { precision: 6, scale: 1 }),
  intakeAirTemp: decimal("intakeAirTemp", { precision: 6, scale: 1 }),
  fuelRateGph: decimal("fuelRateGph", { precision: 6, scale: 2 }),
  /** Timestamp of this data point */
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
});
export type StreamTelemetryPoint = typeof streamTelemetryPoints.$inferSelect;
export type InsertStreamTelemetryPoint = typeof streamTelemetryPoints.$inferInsert;
