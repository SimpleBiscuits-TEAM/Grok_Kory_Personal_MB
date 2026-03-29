import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { supportSessions, supportSessionRecordings, supportMetrics } from "../../drizzle/schema_projects";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

/**
 * Support Sessions Router
 * Enables PPEI employees to create guest support sessions for customers
 * Customers join via invite link without needing an account
 */

// Generate a unique, short invite link
function generateInviteLink(): string {
  return crypto.randomBytes(8).toString("hex");
}

export const supportRouter = router({
  // Create a new support session with invite link
  createSession: protectedProcedure
    .input(
      z.object({
        customerName: z.string().min(1, "Customer name required"),
        customerEmail: z.string().email().optional(),
        expirationHours: z.number().default(24),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Only admins and super_admins can create support sessions
      if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "super_admin")) {
        throw new Error("Only admins can create support sessions");
      }

      const sessionId = uuidv4();
      const inviteLink = generateInviteLink();
      const expiresAt = new Date(Date.now() + input.expirationHours * 60 * 60 * 1000);

      await db.insert(supportSessions).values({
        id: sessionId,
        inviteLink,
        createdBy: ctx.user.id,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        status: "active",
        expiresAt,
      });

      return {
        sessionId,
        inviteLink,
        expiresAt,
        joinUrl: `/support/join/${inviteLink}`,
      };
    }),

  // Get list of active support sessions for current user
  listSessions: protectedProcedure
    .input(
      z.object({
        status: z.enum(["active", "ended", "expired"]).optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!ctx.user) throw new Error("Not authenticated");

      const conditions = [eq(supportSessions.createdBy, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(supportSessions.status, input.status));
      }

      const sessions = await db
        .select()
        .from(supportSessions)
        .where(and(...conditions))
        .orderBy(desc(supportSessions.createdAt))
        .limit(Math.min(input.limit, 100));

      return sessions;
    }),

  // Get session details by ID
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!ctx.user) throw new Error("Not authenticated");

      const session = await db
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.id, input.sessionId))
        .then((rows: any) => rows[0]);

      if (!session) throw new Error("Session not found");

      // Only creator or super_admin can view session details
      if (session.createdBy !== ctx.user.id && ctx.user.role !== "super_admin") {
        throw new Error("Access denied");
      }

      return session;
    }),

  // Get session by invite link (public access for guests)
  getSessionByLink: protectedProcedure
    .input(z.object({ inviteLink: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const session = await db
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.inviteLink, input.inviteLink))
        .then((rows: any) => rows[0]);

      if (!session) throw new Error("Session not found");

      // Check if session is expired
      if (session.status === "expired" || new Date() > session.expiresAt) {
        throw new Error("Session has expired");
      }

      return {
        id: session.id,
        customerName: session.customerName,
        status: session.status,
      };
    }),

  // End a support session
  endSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!ctx.user) throw new Error("Not authenticated");

      const session = await db
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.id, input.sessionId))
        .then((rows: any) => rows[0]);

      if (!session) throw new Error("Session not found");

      // Only creator or super_admin can end session
      if (session.createdBy !== ctx.user.id && ctx.user.role !== "super_admin") {
        throw new Error("Access denied");
      }

      await db
        .update(supportSessions)
        .set({
          status: "ended" as const,
          endedAt: new Date(),
        })
        .where(eq(supportSessions.id, input.sessionId)) as any;

      return { success: true };
    }),

  // Save session recording metadata
  saveRecording: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        screenRecordingUrl: z.string().optional(),
        webcamRecordingUrl: z.string().optional(),
        audioRecordingUrl: z.string().optional(),
        combinedVideoUrl: z.string().optional(),
        chatTranscript: z.array(z.any()).optional(),
        duration: z.number(),
        fileSize: z.string(),
        isEducational: z.boolean().default(false),
        courseTitle: z.string().optional(),
        courseTopic: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!ctx.user) throw new Error("Not authenticated");

      // Verify user owns the session
      const session = await db
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.id, input.sessionId))
        .then((rows: any) => rows[0]);

      if (!session) throw new Error("Session not found");
      if (session.createdBy !== ctx.user.id && ctx.user.role !== "super_admin") {
        throw new Error("Access denied");
      }

      const recordingId = uuidv4();

      await db.insert(supportSessionRecordings).values({
        id: recordingId,
        sessionId: input.sessionId,
        screenRecordingUrl: input.screenRecordingUrl,
        webcamRecordingUrl: input.webcamRecordingUrl,
        audioRecordingUrl: input.audioRecordingUrl,
        combinedVideoUrl: input.combinedVideoUrl,
        chatTranscript: input.chatTranscript,
        duration: input.duration,
        fileSize: input.fileSize,
        isEducational: input.isEducational,
        courseTitle: input.courseTitle,
        courseTopic: input.courseTopic,
        tags: input.tags,
      });

      return { recordingId, success: true };
    }),

  // Get recordings for educational library
  getEducationalRecordings: protectedProcedure
    .input(
      z.object({
        topic: z.string().optional(),
        searchTerm: z.string().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let query: any = db
        .select()
        .from(supportSessionRecordings)
        .where(eq(supportSessionRecordings.isEducational, true));

      // Note: In production, you'd want to implement proper full-text search
      // For now, we filter by topic if provided
      if (input.topic) {
        query = query.where(eq(supportSessionRecordings.courseTopic, input.topic));
      }

      const recordings = await query
        .orderBy(desc(supportSessionRecordings.createdAt))
        .limit(Math.min(input.limit, 100));

      return recordings;
    }),

  // Get all recordings for a session
  getSessionRecordings: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!ctx.user) throw new Error("Not authenticated");

      // Verify user owns the session
      const session = await db
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.id, input.sessionId))
        .then((rows: any) => rows[0]);

      if (!session) throw new Error("Session not found");
      if (session.createdBy !== ctx.user.id && ctx.user.role !== "super_admin") {
        throw new Error("Access denied");
      }

      const recordings = await db
        .select()
        .from(supportSessionRecordings)
        .where(eq(supportSessionRecordings.sessionId, input.sessionId));

      return recordings;
    }),

  // Save support metrics after session ends
  saveMetrics: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        responseTime: z.number().optional(),
        resolutionStatus: z.enum(["resolved", "partial", "escalated", "pending"]).optional(),
        resolutionNotes: z.string().optional(),
        customerSatisfaction: z.number().optional(),
        customerFeedback: z.string().optional(),
        totalParticipants: z.number().optional(),
        totalDuration: z.number().optional(),
        screenShareTime: z.number().optional(),
        audioTime: z.number().optional(),
        videoTime: z.number().optional(),
        chatMessages: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!ctx.user) throw new Error("Not authenticated");

      // Verify user owns the session
      const session = await db
        .select()
        .from(supportSessions)
        .where(eq(supportSessions.id, input.sessionId))
        .then((rows: any) => rows[0]);

      if (!session) throw new Error("Session not found");
      if (session.createdBy !== ctx.user.id && ctx.user.role !== "super_admin") {
        throw new Error("Access denied");
      }

      const metricsId = uuidv4();

      await db.insert(supportMetrics).values({
        id: metricsId,
        sessionId: input.sessionId,
        responseTime: input.responseTime,
        resolutionStatus: input.resolutionStatus,
        resolutionNotes: input.resolutionNotes,
        customerSatisfaction: input.customerSatisfaction,
        customerFeedback: input.customerFeedback,
        totalParticipants: input.totalParticipants,
        totalDuration: input.totalDuration,
        screenShareTime: input.screenShareTime,
        audioTime: input.audioTime,
        videoTime: input.videoTime,
        chatMessages: input.chatMessages,
      });

      return { metricsId, success: true };
    }),

  // Get support metrics dashboard data
  getMetricsDashboard: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    if (!ctx.user) throw new Error("Not authenticated");

    // Only admins and super_admins can view metrics
    if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
      throw new Error("Access denied");
    }

    // Get all metrics for user's sessions
    const metrics = await db
      .select()
      .from(supportMetrics)
      .innerJoin(supportSessions, eq(supportMetrics.sessionId, supportSessions.id))
      .where(eq(supportSessions.createdBy, ctx.user.id));

    // Calculate aggregate stats
    const totalSessions = metrics.length;
    const avgResponseTime =
      metrics.reduce((sum: number, m: any) => sum + (m.support_metrics.responseTime || 0), 0) / totalSessions || 0;
    const avgDuration =
      metrics.reduce((sum: number, m: any) => sum + (m.support_metrics.totalDuration || 0), 0) / totalSessions || 0;
    const avgSatisfaction =
      metrics.reduce((sum: number, m: any) => sum + (m.support_metrics.customerSatisfaction || 0), 0) / totalSessions || 0;
    const resolvedCount = metrics.filter((m: any) => m.support_metrics.resolutionStatus === "resolved").length;

    return {
      totalSessions,
      avgResponseTime,
      avgDuration,
      avgSatisfaction,
      resolvedCount,
      resolutionRate: totalSessions > 0 ? (resolvedCount / totalSessions) * 100 : 0,
    };
  }),
});
