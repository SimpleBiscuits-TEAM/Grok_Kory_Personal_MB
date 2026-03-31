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
