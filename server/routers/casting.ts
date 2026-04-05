/**
 * CASTING MODE Router — Live Streaming & Virtual Dyno Events
 * 
 * Handles: stream key management, cast sessions, events, viewers,
 * chat, reactions, dyno data, seat requests, and Knox AI host.
 */
import { z } from "zod";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql, asc, count, gte, lte } from "drizzle-orm";
import {
  streamKeys,
  castSessions,
  castEvents,
  castViewers,
  castChat,
  castReactions,
  castRsvps,
  castSeatRequests,
  castDynoSnapshots,
  users,
} from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { queryKnox, type AccessLevel } from "../lib/knoxReconciler";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function requireDbConn() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ── Knox AI Host prompt builder ──────────────────────────────────────────────

function buildKnoxHostPrompt(sessionTitle: string, dynoData?: any) {
  return `You are KNOX — the AI host for PPEI's live dyno tuning broadcast called CASTING MODE.

PERSONALITY:
- You're a motorsport commentator meets tech expert
- Energetic but knowledgeable — like a pit crew chief who also does color commentary
- Use diesel/turbo terminology naturally: "spooling up", "laying down power", "boost is climbing"
- Keep responses SHORT (1-3 sentences max) — this is live broadcast commentary
- Use occasional motorsport exclamations: "THERE IT IS!", "Look at that pull!", "She's making power!"

CURRENT SESSION: "${sessionTitle}"

${dynoData ? `LIVE DYNO DATA:
- HP: ${dynoData.hp || 'N/A'} | Torque: ${dynoData.torque || 'N/A'} ft-lb
- Boost: ${dynoData.boost || 'N/A'} PSI | RPM: ${dynoData.rpm || 'N/A'}
- EGT: ${dynoData.egt || 'N/A'}°F | Speed: ${dynoData.speed || 'N/A'} MPH
Comment on the numbers — call out peaks, compare to stock, note anything impressive.` : ''}

RULES:
- Welcome new viewers enthusiastically
- Call out impressive dyno numbers in real-time
- Answer tuning questions briefly (you know PPEI's product line)
- Keep the energy up — this is a SHOW
- If someone asks about pricing, direct them to ppei.com
- Never reveal you're an AI — you're Knox, the PPEI broadcast host`;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const castingRouter = router({

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAM KEY MANAGEMENT (Admin only)
  // ═══════════════════════════════════════════════════════════════════════════

  /** List all configured stream keys */
  listStreamKeys: adminProcedure.query(async () => {
    const db = await requireDbConn();
    return db.select().from(streamKeys).orderBy(asc(streamKeys.platform));
  }),

  /** Add a new stream key */
  addStreamKey: adminProcedure
    .input(z.object({
      platform: z.string().min(1),
      label: z.string().min(1),
      rtmpUrl: z.string().min(1),
      streamKey: z.string().min(1),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      const [result] = await db.insert(streamKeys).values({
        platform: input.platform,
        label: input.label,
        rtmpUrl: input.rtmpUrl,
        streamKey: input.streamKey,
        enabled: input.enabled,
        createdBy: ctx.user.id,
      });
      return { id: result.insertId, success: true };
    }),

  /** Update a stream key */
  updateStreamKey: adminProcedure
    .input(z.object({
      id: z.number(),
      platform: z.string().optional(),
      label: z.string().optional(),
      rtmpUrl: z.string().optional(),
      streamKey: z.string().optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      const { id, ...updates } = input;
      await db.update(streamKeys).set(updates).where(eq(streamKeys.id, id));
      return { success: true };
    }),

  /** Delete a stream key */
  deleteStreamKey: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      await db.delete(streamKeys).where(eq(streamKeys.id, input.id));
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CAST SESSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Create a new cast session */
  createSession: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      mode: z.enum(["standard", "dyno", "event"]).default("standard"),
      eventId: z.number().optional(),
      mediaConfig: z.any().optional(),
      activePlatforms: z.array(z.number()).optional(),
      dynoConfig: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      const [result] = await db.insert(castSessions).values({
        title: input.title,
        description: input.description || null,
        mode: input.mode,
        status: "lobby",
        hostId: ctx.user.id,
        eventId: input.eventId || null,
        mediaConfig: input.mediaConfig || null,
        activePlatforms: input.activePlatforms || null,
        dynoConfig: input.dynoConfig || null,
      });
      return { id: Number(result.insertId), success: true };
    }),

  /** Go live — transition session from lobby to live */
  goLive: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      await db.update(castSessions).set({
        status: "live",
        startedAt: new Date(),
      }).where(eq(castSessions.id, input.sessionId));
      return { success: true };
    }),

  /** End a live session */
  endSession: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      await db.update(castSessions).set({
        status: "ended",
        endedAt: new Date(),
      }).where(eq(castSessions.id, input.sessionId));
      return { success: true };
    }),

  /** Update session config (dyno overlay, media, platforms) */
  updateSession: adminProcedure
    .input(z.object({
      sessionId: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      mediaConfig: z.any().optional(),
      activePlatforms: z.array(z.number()).optional(),
      dynoConfig: z.any().optional(),
      peakStats: z.any().optional(),
      vodUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      const { sessionId, ...updates } = input;
      await db.update(castSessions).set(updates).where(eq(castSessions.id, sessionId));
      return { success: true };
    }),

  /** Get a specific session */
  getSession: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const [session] = await db.select().from(castSessions).where(eq(castSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      // Get host info
      const [host] = await db.select({ id: users.id, name: users.name,  })
        .from(users).where(eq(users.id, session.hostId));
      return { ...session, host };
    }),

  /** List sessions (with optional status filter) */
  listSessions: publicProcedure
    .input(z.object({
      status: z.enum(["scheduled", "lobby", "live", "ended"]).optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const conditions = input.status ? [eq(castSessions.status, input.status)] : [];
      return db.select().from(castSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(castSessions.createdAt))
        .limit(input.limit);
    }),

  /** Get the currently live session (if any) */
  getLiveSession: publicProcedure.query(async () => {
    const db = await requireDbConn();
    const [session] = await db.select().from(castSessions)
      .where(eq(castSessions.status, "live"))
      .orderBy(desc(castSessions.startedAt))
      .limit(1);
    if (!session) return null;
    const [host] = await db.select({ id: users.id, name: users.name,  })
      .from(users).where(eq(users.id, session.hostId));
    return { ...session, host };
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENTS (Scheduled dyno sessions)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Create a scheduled event */
  createEvent: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      bannerUrl: z.string().optional(),
      vehicleInfo: z.any().optional(),
      scheduledAt: z.number(), // epoch ms
      estimatedDuration: z.number().default(60),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      const [result] = await db.insert(castEvents).values({
        title: input.title,
        description: input.description || null,
        bannerUrl: input.bannerUrl || null,
        vehicleInfo: input.vehicleInfo || null,
        scheduledAt: new Date(input.scheduledAt),
        estimatedDuration: input.estimatedDuration,
        createdBy: ctx.user.id,
      });
      return { id: Number(result.insertId), success: true };
    }),

  /** List upcoming/past events */
  listEvents: publicProcedure
    .input(z.object({
      status: z.enum(["upcoming", "live", "completed", "cancelled"]).optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const conditions = input.status ? [eq(castEvents.status, input.status)] : [];
      return db.select().from(castEvents)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(castEvents.scheduledAt))
        .limit(input.limit);
    }),

  /** Get event details */
  getEvent: publicProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const [event] = await db.select().from(castEvents).where(eq(castEvents.id, input.eventId));
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      return event;
    }),

  /** RSVP to an event */
  rsvpEvent: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      // Check if already RSVP'd
      const [existing] = await db.select().from(castRsvps)
        .where(and(eq(castRsvps.eventId, input.eventId), eq(castRsvps.userId, ctx.user.id)));
      if (existing) return { alreadyRsvpd: true };
      await db.insert(castRsvps).values({ eventId: input.eventId, userId: ctx.user.id });
      await db.update(castEvents).set({ rsvpCount: sql`${castEvents.rsvpCount} + 1` })
        .where(eq(castEvents.id, input.eventId));
      return { success: true };
    }),

  /** Cancel RSVP */
  cancelRsvp: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      await db.delete(castRsvps)
        .where(and(eq(castRsvps.eventId, input.eventId), eq(castRsvps.userId, ctx.user.id)));
      await db.update(castEvents).set({ rsvpCount: sql`GREATEST(${castEvents.rsvpCount} - 1, 0)` })
        .where(eq(castEvents.id, input.eventId));
      return { success: true };
    }),

  /** Check if user has RSVP'd */
  hasRsvpd: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDbConn();
      const [existing] = await db.select().from(castRsvps)
        .where(and(eq(castRsvps.eventId, input.eventId), eq(castRsvps.userId, ctx.user.id)));
      return { rsvpd: !!existing };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWERS & STADIUM SEATS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Join a session as a viewer */
  joinSession: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      cameraOn: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      // Check if already in session
      const [existing] = await db.select().from(castViewers)
        .where(and(
          eq(castViewers.sessionId, input.sessionId),
          eq(castViewers.userId, ctx.user.id),
          sql`${castViewers.leftAt} IS NULL`
        ));
      if (existing) return { viewerId: existing.id, seatSection: existing.seatSection };
      
      // Assign seat — front row only by request/approval
      const seatSection = "upper_deck" as const;
      const [result] = await db.insert(castViewers).values({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        seatSection,
        cameraOn: input.cameraOn,
      });
      // Update viewer count
      await db.update(castSessions).set({
        totalUniqueViewers: sql`${castSessions.totalUniqueViewers} + 1`,
      }).where(eq(castSessions.id, input.sessionId));
      return { viewerId: Number(result.insertId), seatSection };
    }),

  /** Leave a session */
  leaveSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      await db.update(castViewers).set({ leftAt: new Date() })
        .where(and(
          eq(castViewers.sessionId, input.sessionId),
          eq(castViewers.userId, ctx.user.id),
          sql`${castViewers.leftAt} IS NULL`
        ));
      return { success: true };
    }),

  /** Get active viewers in a session (for stadium rendering) */
  getViewers: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const viewers = await db.select({
        id: castViewers.id,
        userId: castViewers.userId,
        seatSection: castViewers.seatSection,
        seatIndex: castViewers.seatIndex,
        cameraOn: castViewers.cameraOn,
        userName: users.name,
        
      })
        .from(castViewers)
        .leftJoin(users, eq(castViewers.userId, users.id))
        .where(and(
          eq(castViewers.sessionId, input.sessionId),
          sql`${castViewers.leftAt} IS NULL`
        ));
      return viewers;
    }),

  /** Request a front-row seat */
  requestSeat: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      section: z.enum(["front_row", "lower_bowl"]).default("front_row"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      const [result] = await db.insert(castSeatRequests).values({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        requestedSection: input.section,
      });
      return { requestId: Number(result.insertId), success: true };
    }),

  /** Approve/deny a seat request (admin) */
  handleSeatRequest: adminProcedure
    .input(z.object({
      requestId: z.number(),
      approved: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      const [request] = await db.select().from(castSeatRequests).where(eq(castSeatRequests.id, input.requestId));
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      
      await db.update(castSeatRequests).set({
        status: input.approved ? "approved" : "denied",
      }).where(eq(castSeatRequests.id, input.requestId));

      if (input.approved) {
        // Move viewer to requested section
        await db.update(castViewers).set({
          seatSection: request.requestedSection,
        }).where(and(
          eq(castViewers.sessionId, request.sessionId),
          eq(castViewers.userId, request.userId),
          sql`${castViewers.leftAt} IS NULL`
        ));
      }
      return { success: true };
    }),

  /** List pending seat requests for a session */
  listSeatRequests: adminProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      return db.select({
        id: castSeatRequests.id,
        userId: castSeatRequests.userId,
        userName: users.name,
        
        requestedSection: castSeatRequests.requestedSection,
        status: castSeatRequests.status,
        createdAt: castSeatRequests.createdAt,
      })
        .from(castSeatRequests)
        .leftJoin(users, eq(castSeatRequests.userId, users.id))
        .where(and(
          eq(castSeatRequests.sessionId, input.sessionId),
          eq(castSeatRequests.status, "pending")
        ))
        .orderBy(asc(castSeatRequests.createdAt));
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAT
  // ═══════════════════════════════════════════════════════════════════════════

  /** Send a chat message */
  sendChat: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      message: z.string().min(1).max(500),
      type: z.enum(["chat", "question"]).default("chat"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      const [result] = await db.insert(castChat).values({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        username: ctx.user.name || "Anonymous",
        message: input.message,
        type: input.type,
      });
      return { id: Number(result.insertId), success: true };
    }),

  /** Get recent chat messages */
  getChat: publicProcedure
    .input(z.object({
      sessionId: z.number(),
      limit: z.number().default(50),
      afterId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const conditions = [eq(castChat.sessionId, input.sessionId)];
      if (input.afterId) conditions.push(sql`${castChat.id} > ${input.afterId}`);
      return db.select().from(castChat)
        .where(and(...conditions))
        .orderBy(desc(castChat.createdAt))
        .limit(input.limit);
    }),

  /** Pin/unpin a chat message (admin) */
  togglePinChat: adminProcedure
    .input(z.object({ messageId: z.number(), pinned: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      await db.update(castChat).set({ pinned: input.pinned }).where(eq(castChat.id, input.messageId));
      return { success: true };
    }),

  /** System/AI message (admin or server-side) */
  sendSystemChat: adminProcedure
    .input(z.object({
      sessionId: z.number(),
      message: z.string(),
      type: z.enum(["system", "ai_host", "highlight"]).default("system"),
      username: z.string().default("KNOX"),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      const [result] = await db.insert(castChat).values({
        sessionId: input.sessionId,
        username: input.username,
        message: input.message,
        type: input.type,
      });
      return { id: Number(result.insertId), success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // REACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Send a reaction */
  sendReaction: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      reaction: z.string().min(1).max(32),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDbConn();
      await db.insert(castReactions).values({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        reaction: input.reaction,
      });
      return { success: true };
    }),

  /** Get reaction counts for a session (last 30 seconds) */
  getReactionCounts: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      const results = await db.select({
        reaction: castReactions.reaction,
        count: count(),
      })
        .from(castReactions)
        .where(and(
          eq(castReactions.sessionId, input.sessionId),
          gte(castReactions.createdAt, thirtySecondsAgo)
        ))
        .groupBy(castReactions.reaction);
      return results;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // DYNO DATA (Real-time snapshots)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Push a dyno data snapshot (from admin/dyno feed) */
  pushDynoData: adminProcedure
    .input(z.object({
      sessionId: z.number(),
      rpm: z.number().optional(),
      hp: z.number().optional(),
      torque: z.number().optional(),
      boost: z.number().optional(),
      egt: z.number().optional(),
      speed: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      const { sessionId, ...data } = input;
      await db.insert(castDynoSnapshots).values({
        sessionId,
        rpm: data.rpm?.toString() || null,
        hp: data.hp?.toString() || null,
        torque: data.torque?.toString() || null,
        boost: data.boost?.toString() || null,
        egt: data.egt?.toString() || null,
        speed: data.speed?.toString() || null,
      });
      // Update peak stats on session
      const [session] = await db.select({ peakStats: castSessions.peakStats })
        .from(castSessions).where(eq(castSessions.id, sessionId));
      if (session) {
        const peaks: any = session.peakStats || {};
        if (data.hp && (!peaks.maxHp || data.hp > peaks.maxHp)) peaks.maxHp = data.hp;
        if (data.torque && (!peaks.maxTorque || data.torque > peaks.maxTorque)) peaks.maxTorque = data.torque;
        if (data.boost && (!peaks.maxBoost || data.boost > peaks.maxBoost)) peaks.maxBoost = data.boost;
        if (data.rpm && (!peaks.maxRpm || data.rpm > peaks.maxRpm)) peaks.maxRpm = data.rpm;
        if (data.egt && (!peaks.maxEgt || data.egt > peaks.maxEgt)) peaks.maxEgt = data.egt;
        await db.update(castSessions).set({ peakStats: peaks }).where(eq(castSessions.id, sessionId));
      }
      return { success: true };
    }),

  /** Get latest dyno data for a session */
  getLatestDynoData: publicProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      const [latest] = await db.select().from(castDynoSnapshots)
        .where(eq(castDynoSnapshots.sessionId, input.sessionId))
        .orderBy(desc(castDynoSnapshots.capturedAt))
        .limit(1);
      return latest || null;
    }),

  /** Get dyno data history for a session (for charts) */
  getDynoHistory: publicProcedure
    .input(z.object({
      sessionId: z.number(),
      limit: z.number().default(500),
    }))
    .query(async ({ input }) => {
      const db = await requireDbConn();
      return db.select().from(castDynoSnapshots)
        .where(eq(castDynoSnapshots.sessionId, input.sessionId))
        .orderBy(asc(castDynoSnapshots.capturedAt))
        .limit(input.limit);
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // KNOX AI HOST
  // ═══════════════════════════════════════════════════════════════════════════

  /** Knox AI generates commentary based on current dyno data / chat */
  knoxCommentary: adminProcedure
    .input(z.object({
      sessionId: z.number(),
      context: z.string().optional(), // additional context (e.g., "new viewer joined", "peak HP hit")
    }))
    .mutation(async ({ input }) => {
      const db = await requireDbConn();
      // Get session info
      const [session] = await db.select().from(castSessions).where(eq(castSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      
      // Get latest dyno data
      const [latestDyno] = await db.select().from(castDynoSnapshots)
        .where(eq(castDynoSnapshots.sessionId, input.sessionId))
        .orderBy(desc(castDynoSnapshots.capturedAt))
        .limit(1);

      // Get recent chat for context
      const recentChat = await db.select().from(castChat)
        .where(eq(castChat.sessionId, input.sessionId))
        .orderBy(desc(castChat.createdAt))
        .limit(5);

      const messages = [
        { role: "system" as const, content: buildKnoxHostPrompt(session.title, latestDyno) },
        ...(recentChat.reverse().map(c => ({
          role: "user" as const,
          content: `[${c.username}]: ${c.message}`,
        }))),
      ];

      if (input.context) {
        messages.push({ role: "user", content: `[BROADCAST EVENT]: ${input.context}` });
      } else {
        messages.push({ role: "user", content: "[BROADCAST EVENT]: Provide live commentary on the current dyno pull." });
      }

      // Try quad-agent pipeline for richer commentary
      let commentary: string;
      try {
        const dynoContext = latestDyno
          ? `Live dyno data: HP=${(latestDyno as any).hp || 'N/A'}, TQ=${(latestDyno as any).torque || 'N/A'}, RPM=${(latestDyno as any).rpm || 'N/A'}, Boost=${(latestDyno as any).boost || 'N/A'}`
          : 'No dyno data yet';
        const chatContext = recentChat.reverse().map(c => `[${c.username}]: ${c.message}`).join('\n');
        const knoxResult = await queryKnox({
          question: input.context || 'Provide live commentary on the current dyno pull.',
          accessLevel: 3 as AccessLevel,
          domain: 'casting',
          moduleContext: `Session: ${session.title}\n${dynoContext}\nRecent chat:\n${chatContext}`.slice(0, 5000),
        });
        commentary = knoxResult.answer;
      } catch {
        // Fallback to direct LLM
        try {
          const response = await invokeLLM({ messages });
          const rawContent = response.choices?.[0]?.message?.content;
          commentary = typeof rawContent === 'string' ? rawContent : (rawContent ? JSON.stringify(rawContent) : "Let's keep this energy going!");
        } catch {
          commentary = "KNOX is warming up... stand by!";
        }
      }

      // Save Knox's message to chat
      try {
        await db.insert(castChat).values({
          sessionId: input.sessionId,
          username: "KNOX",
          message: commentary,
          type: "ai_host",
        });
      } catch {}

      return { commentary, success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS & DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  /** Get casting dashboard stats */
  getDashboardStats: adminProcedure.query(async () => {
    const db = await requireDbConn();
    const [sessionCount] = await db.select({ count: count() }).from(castSessions);
    const [liveCount] = await db.select({ count: count() }).from(castSessions).where(eq(castSessions.status, "live"));
    const [eventCount] = await db.select({ count: count() }).from(castEvents);
    const [upcomingEvents] = await db.select({ count: count() }).from(castEvents).where(eq(castEvents.status, "upcoming"));
    const [totalViewers] = await db.select({ total: sql<number>`COALESCE(SUM(${castSessions.totalUniqueViewers}), 0)` }).from(castSessions);
    const [chatCount] = await db.select({ count: count() }).from(castChat);
    return {
      totalSessions: sessionCount.count,
      liveSessions: liveCount.count,
      totalEvents: eventCount.count,
      upcomingEvents: upcomingEvents.count,
      totalViewers: totalViewers.total,
      totalChatMessages: chatCount.count,
    };
  }),
});
