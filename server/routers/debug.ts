/**
 * Debug System Router — Self-Healing Debug Loop
 * 
 * Admin-controlled debug permissions + user bug reporting + Mara auto-analysis
 * 
 * Flow:
 * 1. Admin grants debug access to specific users
 * 2. Authorized users submit bug reports
 * 3. Mara analyzes and classifies (Tier 1 auto-fix / Tier 2 approval needed)
 * 4. Fixes are applied and users are notified to retest
 * 5. Users confirm fixed or report still broken
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { users, debugPermissions, debugSessions, debugAuditLog } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";

// ─── Helper: Check if user is admin ─────────────────────────────────────────
function assertAdmin(role: string | null | undefined) {
  if (role !== "admin" && role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

// ─── Helper: Check if user has debug permission ─────────────────────────────
async function hasDebugPermission(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const perms = await db
    .select()
    .from(debugPermissions)
    .where(and(eq(debugPermissions.userId, userId), eq(debugPermissions.isActive, true)))
    .limit(1);
  return perms.length > 0;
}

// ─── Helper: Log audit entry ────────────────────────────────────────────────
async function logAudit(
  sessionId: number,
  actorId: number | null,
  actorType: "user" | "admin" | "mara" | "system",
  action: string,
  details?: string,
  tokensUsed?: number
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(debugAuditLog).values({
    sessionId,
    actorId,
    actorType,
    action,
    details,
    tokensUsed: tokensUsed ?? 0,
  });
}

// ─── Feature area options ───────────────────────────────────────────────────
const FEATURE_AREAS = [
  "analyzer", "datalogger", "editor", "tune_compare", "binary_upload",
  "intellispy", "vehicle_coding", "canam_vin", "service_procedures",
  "health_report", "dyno_charts", "diagnostic_report", "drag_timeslip",
  "voice_commands", "ecu_reference", "dtc_search", "pid_audit",
  "live_gauges", "qa_checklist", "notifications", "home_page", "other"
] as const;

export const debugRouter = router({
  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN: Permission Management
  // ═══════════════════════════════════════════════════════════════════════════

  /** List all users with their debug permission status */
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const allUsers = await db.select().from(users).orderBy(desc(users.lastSignedIn));
    const allPerms = await db.select().from(debugPermissions).where(eq(debugPermissions.isActive, true));

    const permMap = new Map(allPerms.map(p => [p.userId, p]));

    return allUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      lastSignedIn: u.lastSignedIn,
      debugAccess: permMap.has(u.id),
      debugPermission: permMap.get(u.id) ?? null,
    }));
  }),

  /** Grant debug access to a specific user */
  grantAccess: protectedProcedure
    .input(z.object({
      userId: z.number(),
      tokenBudget: z.number().min(100).max(100000).default(5000),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Deactivate any existing permissions first
      await db.update(debugPermissions)
        .set({ isActive: false, revokedAt: new Date() })
        .where(and(eq(debugPermissions.userId, input.userId), eq(debugPermissions.isActive, true)));

      // Grant new permission
      await db.insert(debugPermissions).values({
        userId: input.userId,
        grantedBy: ctx.user.id,
        isActive: true,
        tokenBudget: input.tokenBudget,
        tokensUsed: 0,
        note: input.note ?? null,
      });

      // Get user name for notification
      const targetUser = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      const userName = targetUser[0]?.name ?? `User #${input.userId}`;

      await notifyOwner({
        title: "Debug Access Granted",
        content: `${ctx.user.name} granted debug access to ${userName} (budget: ${input.tokenBudget} tokens)`,
      });

      return { success: true };
    }),

  /** Revoke debug access from a specific user */
  revokeAccess: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(debugPermissions)
        .set({ isActive: false, revokedAt: new Date() })
        .where(and(eq(debugPermissions.userId, input.userId), eq(debugPermissions.isActive, true)));

      return { success: true };
    }),

  /** Update token budget for a user */
  updateBudget: protectedProcedure
    .input(z.object({
      userId: z.number(),
      tokenBudget: z.number().min(100).max(100000),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(debugPermissions)
        .set({ tokenBudget: input.tokenBudget })
        .where(and(eq(debugPermissions.userId, input.userId), eq(debugPermissions.isActive, true)));

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // USER: Check Permission & Submit Bug Reports
  // ═══════════════════════════════════════════════════════════════════════════

  /** Check if current user has debug access */
  checkAccess: protectedProcedure.query(async ({ ctx }) => {
    const hasAccess = await hasDebugPermission(ctx.user.id);
    return { hasAccess };
  }),

  /** Submit a bug report (only for authorized users) */
  submitReport: protectedProcedure
    .input(z.object({
      title: z.string().min(5).max(255),
      description: z.string().min(10),
      stepsToReproduce: z.string().optional(),
      expectedBehavior: z.string().optional(),
      actualBehavior: z.string().optional(),
      featureArea: z.enum(FEATURE_AREAS).optional(),
      screenshotUrl: z.string().optional(),
      browserInfo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check debug permission
      const hasAccess = await hasDebugPermission(ctx.user.id);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Debug access not granted. Contact admin." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Create the debug session
      const result = await db.insert(debugSessions).values({
        reporterId: ctx.user.id,
        status: "submitted",
        title: input.title,
        description: input.description,
        stepsToReproduce: input.stepsToReproduce ?? null,
        expectedBehavior: input.expectedBehavior ?? null,
        actualBehavior: input.actualBehavior ?? null,
        featureArea: input.featureArea ?? null,
        screenshotUrl: input.screenshotUrl ?? null,
        browserInfo: input.browserInfo ?? null,
      });

      const sessionId = Number(result[0].insertId);

      // Log the submission
      await logAudit(sessionId, ctx.user.id, "user", "submitted", JSON.stringify({
        title: input.title,
        featureArea: input.featureArea,
      }));

      // Notify admin
      await notifyOwner({
        title: `Bug Report: ${input.title}`,
        content: `${ctx.user.name} submitted a bug report in ${input.featureArea || 'unknown area'}:\n\n${input.description.slice(0, 200)}...`,
      });

      // Trigger Mara analysis asynchronously (don't block the response)
      analyzeAndClassify(sessionId).catch(err => {
        console.error("[Debug] Analysis failed:", err);
      });

      return { sessionId, status: "submitted" };
    }),

  /** Get user's own debug sessions */
  mySessions: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(debugSessions)
      .where(eq(debugSessions.reporterId, ctx.user.id))
      .orderBy(desc(debugSessions.createdAt))
      .limit(50);
  }),

  /** Submit retest feedback */
  submitRetest: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      isFixed: z.boolean(),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const session = await db.select().from(debugSessions).where(eq(debugSessions.id, input.sessionId)).limit(1);
      if (!session[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Debug session not found" });
      if (session[0].reporterId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const newStatus = input.isFixed ? "confirmed_fixed" : "still_broken";
      const retestCount = (session[0].retestCount ?? 0) + 1;

      await db.update(debugSessions)
        .set({
          status: newStatus,
          retestFeedback: input.feedback ?? null,
          retestCount,
          ...(input.isFixed ? { resolvedAt: new Date() } : {}),
        })
        .where(eq(debugSessions.id, input.sessionId));

      await logAudit(input.sessionId, ctx.user.id, "user", `retest_${newStatus}`, JSON.stringify({
        isFixed: input.isFixed,
        feedback: input.feedback,
        retestCount,
      }));

      // If still broken after 3 retests, escalate
      if (!input.isFixed && retestCount >= 3) {
        await db.update(debugSessions)
          .set({ status: "escalated" })
          .where(eq(debugSessions.id, input.sessionId));

        await notifyOwner({
          title: `Bug Escalated: ${session[0].title}`,
          content: `Bug #${input.sessionId} has failed ${retestCount} retests and has been escalated for manual review.`,
        });
      } else if (!input.isFixed) {
        // Re-analyze with the new feedback
        analyzeAndClassify(input.sessionId).catch(err => {
          console.error("[Debug] Re-analysis failed:", err);
        });
      }

      // Notify admin when tester confirms fix — ready to publish
      if (input.isFixed) {
        await notifyOwner({
          title: `Bug Fixed & Confirmed: ${session[0].title}`,
          content: `Tester ${ctx.user.name} confirmed bug #${input.sessionId} is fixed.\n\nFeature Area: ${session[0].featureArea || 'N/A'}\n\nYou can now publish the latest version.`,
        });
      }

      return { success: true, status: newStatus };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN: Session Management & Review
  // ═══════════════════════════════════════════════════════════════════════════

  /** List all debug sessions (admin view) */
  allSessions: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      let query = db
        .select({
          session: debugSessions,
          reporterName: users.name,
          reporterEmail: users.email,
        })
        .from(debugSessions)
        .leftJoin(users, eq(debugSessions.reporterId, users.id))
        .orderBy(desc(debugSessions.createdAt))
        .limit(input?.limit ?? 50);

      return query;
    }),

  /** Get audit log for a specific session */
  sessionAudit: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(debugAuditLog)
        .where(eq(debugAuditLog.sessionId, input.sessionId))
        .orderBy(desc(debugAuditLog.createdAt));
    }),

  /** Admin approve a Tier 2 fix */
  approveT2: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(debugSessions)
        .set({
          status: "tier2_approved",
          reviewedBy: ctx.user.id,
          reviewNote: input.note ?? null,
        })
        .where(eq(debugSessions.id, input.sessionId));

      await logAudit(input.sessionId, ctx.user.id, "admin", "tier2_approved", input.note);

      return { success: true };
    }),

  /** Admin reject a Tier 2 fix */
  rejectT2: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(debugSessions)
        .set({
          status: "tier2_rejected",
          reviewedBy: ctx.user.id,
          reviewNote: input.note ?? null,
        })
        .where(eq(debugSessions.id, input.sessionId));

      await logAudit(input.sessionId, ctx.user.id, "admin", "tier2_rejected", input.note);

      return { success: true };
    }),

  /** Admin close a session */
  closeSession: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(debugSessions)
        .set({
          status: "closed",
          reviewedBy: ctx.user.id,
          reviewNote: input.note ?? null,
          resolvedAt: new Date(),
        })
        .where(eq(debugSessions.id, input.sessionId));

      await logAudit(input.sessionId, ctx.user.id, "admin", "closed", input.note);

      return { success: true };
    }),

  /** Get debug system stats */
  stats: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { total: 0, open: 0, fixed: 0, escalated: 0, activeDebuggers: 0 };

    const [sessions] = await db.select({ count: sql<number>`count(*)` }).from(debugSessions);
    const [open] = await db.select({ count: sql<number>`count(*)` }).from(debugSessions)
      .where(sql`status NOT IN ('confirmed_fixed', 'closed', 'tier2_rejected')`);
    const [fixed] = await db.select({ count: sql<number>`count(*)` }).from(debugSessions)
      .where(eq(debugSessions.status, "confirmed_fixed"));
    const [escalated] = await db.select({ count: sql<number>`count(*)` }).from(debugSessions)
      .where(eq(debugSessions.status, "escalated"));
    const [activeDebuggers] = await db.select({ count: sql<number>`count(*)` }).from(debugPermissions)
      .where(eq(debugPermissions.isActive, true));

    return {
      total: sessions.count,
      open: open.count,
      fixed: fixed.count,
      escalated: escalated.count,
      activeDebuggers: activeDebuggers.count,
    };
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mara Analysis Engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mara analyzes the bug report and classifies it as Tier 1 or Tier 2.
 * 
 * Tier 1 (Auto-fix): UI rendering, data display, text contrast, wrong units, minor logic
 * Tier 2 (Approval): Backend changes, security, database, new functionality
 */
async function analyzeAndClassify(sessionId: number) {
  const db = await getDb();
  if (!db) return;

  // Update status to analyzing
  await db.update(debugSessions)
    .set({ status: "analyzing" })
    .where(eq(debugSessions.id, sessionId));

  await logAudit(sessionId, null, "mara", "analysis_started");

  const session = await db.select().from(debugSessions).where(eq(debugSessions.id, sessionId)).limit(1);
  if (!session[0]) return;

  const bug = session[0];

  try {
    const analysisResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are Mara (Multi-Agent Reasoning Architect), an AI diagnostic engineer for the PPEI V-OP vehicle analyzer tool. 
You are analyzing a bug report submitted by a tester. Your job is to:

1. Understand the bug from the description
2. Classify it as Tier 1 (simple, auto-fixable) or Tier 2 (complex, needs admin approval)
3. Identify the root cause
4. Propose a fix

TIER 1 (auto-fix, no approval needed):
- UI/CSS issues (text contrast, layout, spacing, colors)
- Data display errors (wrong units, missing values, formatting)
- Minor logic bugs (incorrect calculations, wrong PID mapping)
- Text/label errors (typos, wrong descriptions)
- Empty states not handled
- Loading states missing

TIER 2 (needs admin approval):
- Backend/server changes (router modifications, database queries)
- Security-related issues (auth, permissions, data access)
- Database schema changes
- Feature requests disguised as bugs
- Complex business logic changes
- Anything touching binary engine, A2L parsing, calibration data

IMPORTANT: If the report sounds like a FEATURE REQUEST rather than a bug, classify as Tier 2 and note it.

Respond in JSON format:
{
  "tier": "tier1" | "tier2",
  "rootCause": "Brief description of what's causing the bug",
  "category": "ui" | "data" | "logic" | "backend" | "security" | "feature_request" | "unknown",
  "confidence": 0.0-1.0,
  "proposedFix": "Description of what should be changed to fix this",
  "affectedFiles": ["list of likely affected files"],
  "estimatedTokens": number,
  "explanation": "Explanation for the tester about what was found"
}`
        },
        {
          role: "user",
          content: `Bug Report #${sessionId}:
Title: ${bug.title}
Feature Area: ${bug.featureArea || 'Not specified'}
Description: ${bug.description}
Steps to Reproduce: ${bug.stepsToReproduce || 'Not provided'}
Expected Behavior: ${bug.expectedBehavior || 'Not provided'}
Actual Behavior: ${bug.actualBehavior || 'Not provided'}
${bug.retestFeedback ? `Previous Retest Feedback: ${bug.retestFeedback}` : ''}
${bug.retestCount ? `Retest Count: ${bug.retestCount}` : ''}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "bug_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              tier: { type: "string", enum: ["tier1", "tier2"] },
              rootCause: { type: "string" },
              category: { type: "string", enum: ["ui", "data", "logic", "backend", "security", "feature_request", "unknown"] },
              confidence: { type: "number" },
              proposedFix: { type: "string" },
              affectedFiles: { type: "array", items: { type: "string" } },
              estimatedTokens: { type: "integer" },
              explanation: { type: "string" },
            },
            required: ["tier", "rootCause", "category", "confidence", "proposedFix", "affectedFiles", "estimatedTokens", "explanation"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = analysisResponse.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("Empty analysis response");
    const analysisText = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);

    const analysis = JSON.parse(analysisText);

    // Update session with analysis
    await db.update(debugSessions)
      .set({
        status: analysis.tier === "tier1" ? "tier1_auto_fix" : "tier2_pending",
        tier: analysis.tier,
        analysisResult: analysisText,
        rootCause: analysis.rootCause,
        proposedFix: analysis.proposedFix,
        estimatedTokens: analysis.estimatedTokens,
      })
      .where(eq(debugSessions.id, sessionId));

    await logAudit(sessionId, null, "mara", "analysis_complete", analysisText, analysis.estimatedTokens);

    // Notify based on tier
    if (analysis.tier === "tier2") {
      await notifyOwner({
        title: `Tier 2 Bug - Approval Needed: ${bug.title}`,
        content: `Mara classified bug #${sessionId} as Tier 2 (${analysis.category}).\n\nRoot Cause: ${analysis.rootCause}\n\nProposed Fix: ${analysis.proposedFix}\n\nEstimated Tokens: ${analysis.estimatedTokens}\n\nPlease approve or reject in the Debug Dashboard.`,
      });
    } else {
      // Tier 1: Mark as awaiting retest (the actual fix would be applied by the Manus agent)
      await db.update(debugSessions)
        .set({ status: "awaiting_retest" })
        .where(eq(debugSessions.id, sessionId));

      await logAudit(sessionId, null, "mara", "tier1_ready_for_fix", JSON.stringify({
        proposedFix: analysis.proposedFix,
        affectedFiles: analysis.affectedFiles,
      }));

      // Notify the reporter
      await notifyOwner({
        title: `Bug Fix Ready: ${bug.title}`,
        content: `Mara analyzed bug #${sessionId} and identified the issue:\n\n${analysis.explanation}\n\nThe fix has been queued. The tester will be notified to retest.`,
      });
    }

  } catch (err) {
    console.error("[Debug] Analysis error:", err);
    await db.update(debugSessions)
      .set({ status: "escalated", analysisResult: `Analysis failed: ${err}` })
      .where(eq(debugSessions.id, sessionId));

    await logAudit(sessionId, null, "mara", "analysis_failed", String(err));
  }
}
