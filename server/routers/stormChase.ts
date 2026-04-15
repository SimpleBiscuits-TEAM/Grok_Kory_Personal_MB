/**
 * Storm Chase Router — Live Telemetry for Storm Chasers
 *
 * Extends the weather streaming system with:
 * - Storm Chase Active mode (vehicle telemetry overlay for streams)
 * - Emergency Override (DTC clear every 7s for 10 min)
 * - Event markers (tornado spotted, hail impact, etc.)
 * - Read Codes broadcast to viewers
 * - Test Mode (full flow without going live)
 * - Session summary generation
 * - OBS overlay URL with customizable theme
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { liveWeatherStreams, streamEvents } from "../../drizzle/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

// ── Types ────────────────────────────────────────────────────────────────────

interface StreamSettings {
  peakGauges: boolean;
  healthPulse: boolean;
  viewerCount: boolean;
  audioAlert: boolean;
  overlayTheme: "dark" | "light" | "transparent";
  overlayPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  overlayScale: number; // 0.5 - 2.0
}

interface PeakValues {
  maxMph: number;
  maxRpm: number;
  maxGForceX: number;
  maxGForceY: number;
  maxBoost: number;
  maxThrottle: number;
}

interface SessionSummary {
  totalDurationSec: number;
  totalDataPoints: number;
  maxSpeed: number;
  maxRpm: number;
  maxGForce: number;
  maxBoost: number;
  dtcsEncountered: string[];
  emergencyOverridesUsed: number;
  codeClearsAttempted: number;
  codeClearsSuccessful: number;
  eventMarkers: Array<{ label: string; timestamp: string }>;
  peakViewerCount: number;
}

const DEFAULT_SETTINGS: StreamSettings = {
  peakGauges: true,
  healthPulse: true,
  viewerCount: true,
  audioAlert: true,
  overlayTheme: "dark",
  overlayPosition: "bottom-left",
  overlayScale: 1.0,
};

const DEFAULT_PEAKS: PeakValues = {
  maxMph: 0,
  maxRpm: 0,
  maxGForceX: 0,
  maxGForceY: 0,
  maxBoost: 0,
  maxThrottle: 0,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateShareKey(): string {
  return `sc_${crypto.randomBytes(8).toString("hex")}`;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const stormChaseRouter = router({
  /**
   * Start a storm chase session in TEST mode.
   * Connects to vehicle, runs auto-scan, but doesn't broadcast to viewers.
   */
  startTestSession: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(256).default("Storm Chase Test"),
      vehicleType: z.string().max(128).optional(),
      externalStreamUrl: z.string().url().max(512).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const shareKey = generateShareKey();
      const [result] = await (await getDb())!.insert(liveWeatherStreams).values({
        userId: ctx.user.id,
        streamKey: shareKey,
        title: input.title,
        vehicleType: input.vehicleType ?? null,
        externalStreamUrl: input.externalStreamUrl ?? null,
        status: "testing",
        stormChaseActive: false,
        emergencyOverrideActive: false,
        streamSettings: DEFAULT_SETTINGS,
        peakValues: DEFAULT_PEAKS,
        viewerCount: 0,
        peakViewerCount: 0,
        totalDataPoints: 0,
        tags: ["storm-chase"],
      });

      // Log connection event
      await (await getDb())!.insert(streamEvents).values({
        sessionId: result.insertId,
        type: "connection",
        data: { action: "test_started", vehicleType: input.vehicleType },
        label: "Test session started",
      });

      return {
        success: true,
        sessionId: result.insertId,
        shareKey,
        status: "testing" as const,
      };
    }),

  /**
   * Go live — transition from test mode to live broadcast.
   */
  goLive: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ id: liveWeatherStreams.id, status: liveWeatherStreams.status })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };
      if (stream.status === "ended") return { success: false, error: "Session already ended" };

      await db.update(liveWeatherStreams)
        .set({ status: "live" })
        .where(eq(liveWeatherStreams.id, stream.id));

      await db.insert(streamEvents).values({
        sessionId: stream.id,
        type: "connection",
        data: { action: "went_live" },
        label: "Stream went live",
      });

      return { success: true, status: "live" as const };
    }),

  /**
   * Activate Storm Chase mode — enables telemetry overlay for viewers.
   */
  activateStormChase: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(liveWeatherStreams)
        .set({ stormChaseActive: true })
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ));

      return { success: true };
    }),

  /**
   * Deactivate Storm Chase mode.
   */
  deactivateStormChase: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(liveWeatherStreams)
        .set({ stormChaseActive: false })
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ));

      return { success: true };
    }),

  /**
   * Emergency Override — trigger DTC code clear every 7 seconds for 10 minutes.
   * This is a safety feature to get the driver out of a limp-mode situation.
   */
  startEmergencyOverride: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ id: liveWeatherStreams.id })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };

      const now = new Date();
      await db.update(liveWeatherStreams)
        .set({
          emergencyOverrideActive: true,
          emergencyOverrideStartedAt: now,
        })
        .where(eq(liveWeatherStreams.id, stream.id));

      await db.insert(streamEvents).values({
        sessionId: stream.id,
        type: "override_start",
        data: { startedAt: now.toISOString(), durationMin: 10, intervalSec: 7 },
        label: "Emergency Override activated — DTC clear every 7s for 10 min",
      });

      return {
        success: true,
        startedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      };
    }),

  /**
   * Stop Emergency Override manually (before the 10-min timer expires).
   */
  stopEmergencyOverride: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ id: liveWeatherStreams.id, emergencyOverrideStartedAt: liveWeatherStreams.emergencyOverrideStartedAt })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };

      await db.update(liveWeatherStreams)
        .set({
          emergencyOverrideActive: false,
          emergencyOverrideStartedAt: null,
        })
        .where(eq(liveWeatherStreams.id, stream.id));

      const durationSec = stream.emergencyOverrideStartedAt
        ? Math.round((Date.now() - stream.emergencyOverrideStartedAt.getTime()) / 1000)
        : 0;

      await db.insert(streamEvents).values({
        sessionId: stream.id,
        type: "override_end",
        data: { stoppedManually: true, durationSec },
        label: `Emergency Override stopped after ${durationSec}s`,
      });

      return { success: true, durationSec };
    }),

  /**
   * Log a DTC code clear attempt (called by the client every 7s during override).
   */
  logCodeClear: protectedProcedure
    .input(z.object({
      streamKey: z.string(),
      success: z.boolean(),
      dtcsCleared: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ id: liveWeatherStreams.id })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };

      await db.insert(streamEvents).values({
        sessionId: stream.id,
        type: "code_clear",
        data: { dtcsCleared: input.dtcsCleared ?? [] },
        success: input.success,
        label: input.success ? "DTC codes cleared" : "DTC clear failed",
      });

      return { success: true };
    }),

  /**
   * Read Codes — broadcast DTCs to viewers.
   */
  readCodes: protectedProcedure
    .input(z.object({
      streamKey: z.string(),
      codes: z.array(z.object({
        code: z.string(),
        description: z.string().optional(),
        severity: z.enum(["info", "warning", "critical"]).optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ id: liveWeatherStreams.id })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };

      await db.insert(streamEvents).values({
        sessionId: stream.id,
        type: "code_read",
        data: { codes: input.codes },
        label: `Read ${input.codes.length} DTC(s): ${input.codes.map(c => c.code).join(", ")}`,
      });

      return { success: true, codesRead: input.codes.length };
    }),

  /**
   * Add an event marker — driver tags a moment during the chase.
   */
  addEventMarker: protectedProcedure
    .input(z.object({
      streamKey: z.string(),
      label: z.string().min(1).max(255),
      data: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ id: liveWeatherStreams.id })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };

      await db.insert(streamEvents).values({
        sessionId: stream.id,
        type: "event_marker",
        data: input.data ?? {},
        label: input.label,
      });

      return { success: true };
    }),

  /**
   * Update stream settings (toggle prefs).
   */
  updateSettings: protectedProcedure
    .input(z.object({
      streamKey: z.string(),
      settings: z.object({
        peakGauges: z.boolean().optional(),
        healthPulse: z.boolean().optional(),
        viewerCount: z.boolean().optional(),
        audioAlert: z.boolean().optional(),
        overlayTheme: z.enum(["dark", "light", "transparent"]).optional(),
        overlayPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
        overlayScale: z.number().min(0.5).max(2.0).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({
        id: liveWeatherStreams.id,
        streamSettings: liveWeatherStreams.streamSettings,
      })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };

      const current = (stream.streamSettings as StreamSettings | null) ?? DEFAULT_SETTINGS;
      const merged = { ...current, ...input.settings };

      await db.update(liveWeatherStreams)
        .set({ streamSettings: merged })
        .where(eq(liveWeatherStreams.id, stream.id));

      return { success: true, settings: merged };
    }),

  /**
   * Update peak values (called by client when new peaks are hit).
   */
  updatePeaks: protectedProcedure
    .input(z.object({
      streamKey: z.string(),
      mph: z.number().optional(),
      rpm: z.number().optional(),
      gForceX: z.number().optional(),
      gForceY: z.number().optional(),
      boost: z.number().optional(),
      throttle: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({
        id: liveWeatherStreams.id,
        peakValues: liveWeatherStreams.peakValues,
      })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false };

      const peaks = (stream.peakValues as PeakValues | null) ?? DEFAULT_PEAKS;
      const updated: PeakValues = {
        maxMph: Math.max(peaks.maxMph, input.mph ?? 0),
        maxRpm: Math.max(peaks.maxRpm, input.rpm ?? 0),
        maxGForceX: Math.max(peaks.maxGForceX, Math.abs(input.gForceX ?? 0)),
        maxGForceY: Math.max(peaks.maxGForceY, Math.abs(input.gForceY ?? 0)),
        maxBoost: Math.max(peaks.maxBoost, input.boost ?? 0),
        maxThrottle: Math.max(peaks.maxThrottle, input.throttle ?? 0),
      };

      await db.update(liveWeatherStreams)
        .set({ peakValues: updated })
        .where(eq(liveWeatherStreams.id, stream.id));

      return { success: true, peaks: updated };
    }),

  /**
   * Update vehicle health status.
   */
  updateHealthStatus: protectedProcedure
    .input(z.object({
      streamKey: z.string(),
      status: z.enum(["green", "yellow", "red"]),
    }))
    .mutation(async ({ input, ctx }) => {
      await (await getDb())!.update(liveWeatherStreams)
        .set({ healthStatus: input.status as "green" | "yellow" | "red" })
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ));

      return { success: true };
    }),

  /**
   * End the storm chase session and generate summary.
   */
  endSession: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select()
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Session not found" };

      // Gather events for summary
      const events = await db.select()
        .from(streamEvents)
        .where(eq(streamEvents.sessionId, stream.id))
        .orderBy(streamEvents.timestamp);

      const codeClearEvents = events.filter(e => e.type === "code_clear");
      const codeReadEvents = events.filter(e => e.type === "code_read");
      const overrideEvents = events.filter(e => e.type === "override_start");
      const markerEvents = events.filter(e => e.type === "event_marker");

      // Collect all DTCs encountered
      const allDtcs = new Set<string>();
      codeReadEvents.forEach(e => {
        const data = e.data as { codes?: Array<{ code: string }> } | null;
        data?.codes?.forEach(c => allDtcs.add(c.code));
      });

      const peaks = (stream.peakValues as PeakValues | null) ?? DEFAULT_PEAKS;
      const durationSec = Math.round((Date.now() - stream.startedAt.getTime()) / 1000);

      const summary: SessionSummary = {
        totalDurationSec: durationSec,
        totalDataPoints: stream.totalDataPoints,
        maxSpeed: peaks.maxMph,
        maxRpm: peaks.maxRpm,
        maxGForce: Math.max(peaks.maxGForceX, peaks.maxGForceY),
        maxBoost: peaks.maxBoost,
        dtcsEncountered: Array.from(allDtcs),
        emergencyOverridesUsed: overrideEvents.length,
        codeClearsAttempted: codeClearEvents.length,
        codeClearsSuccessful: codeClearEvents.filter(e => e.success).length,
        eventMarkers: markerEvents.map(e => ({
          label: e.label ?? "Event",
          timestamp: e.timestamp.toISOString(),
        })),
        peakViewerCount: stream.peakViewerCount,
      };

      await db.update(liveWeatherStreams)
        .set({
          status: "ended",
          endedAt: new Date(),
          stormChaseActive: false,
          emergencyOverrideActive: false,
          sessionSummary: summary,
        })
        .where(eq(liveWeatherStreams.id, stream.id));

      return { success: true, summary };
    }),

  /**
   * Get session details (for driver dashboard or viewer).
   */
  getSession: publicProcedure
    .input(z.object({
      streamKey: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [stream] = await db.select()
        .from(liveWeatherStreams)
        .where(eq(liveWeatherStreams.streamKey, input.streamKey))
        .limit(1);

      if (!stream) return null;

      return {
        ...stream,
        streamSettings: (stream.streamSettings as StreamSettings | null) ?? DEFAULT_SETTINGS,
        peakValues: (stream.peakValues as PeakValues | null) ?? DEFAULT_PEAKS,
        sessionSummary: stream.sessionSummary as SessionSummary | null,
        tags: (stream.tags as string[] | null) ?? [],
      };
    }),

  /**
   * Get session events (for viewer timeline or replay).
   */
  getSessionEvents: publicProcedure
    .input(z.object({
      streamKey: z.string(),
      type: z.enum(["event_marker", "code_clear", "code_read", "override_start", "override_end", "connection", "error"]).optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ id: liveWeatherStreams.id })
        .from(liveWeatherStreams)
        .where(eq(liveWeatherStreams.streamKey, input.streamKey))
        .limit(1);

      if (!stream) return [];

      let query = db.select()
        .from(streamEvents)
        .where(
          input.type
            ? and(eq(streamEvents.sessionId, stream.id), eq(streamEvents.type, input.type))
            : eq(streamEvents.sessionId, stream.id)
        )
        .orderBy(desc(streamEvents.timestamp))
        .limit(input.limit);

      return query;
    }),

  /**
   * Get user's storm chase history.
   */
  getMyChases: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const streams = await (await getDb())!.select()
        .from(liveWeatherStreams)
        .where(eq(liveWeatherStreams.userId, ctx.user.id))
        .orderBy(desc(liveWeatherStreams.startedAt))
        .limit(input.limit);

      return streams.map(s => ({
        ...s,
        streamSettings: (s.streamSettings as StreamSettings | null) ?? DEFAULT_SETTINGS,
        peakValues: (s.peakValues as PeakValues | null) ?? DEFAULT_PEAKS,
        sessionSummary: s.sessionSummary as SessionSummary | null,
        tags: (s.tags as string[] | null) ?? [],
      }));
    }),

  /**
   * Get the OBS overlay URL for a session.
   * Returns the URL that can be added as a Browser Source in OBS.
   */
  getOverlayUrl: publicProcedure
    .input(z.object({
      streamKey: z.string(),
      theme: z.enum(["dark", "light", "transparent"]).optional(),
      position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
      scale: z.number().min(0.5).max(2.0).optional(),
    }))
    .query(({ input }) => {
      const params = new URLSearchParams();
      params.set("key", input.streamKey);
      if (input.theme) params.set("theme", input.theme);
      if (input.position) params.set("pos", input.position);
      if (input.scale) params.set("scale", String(input.scale));

      // The overlay URL is relative — the frontend will resolve it
      return {
        overlayPath: `/stream/overlay?${params.toString()}`,
        obsInstructions: [
          "1. In OBS, add a new Browser Source",
          "2. Set the URL to the overlay URL above",
          "3. Set width to 400 and height to 600 (adjust as needed)",
          "4. Check 'Shutdown source when not visible'",
          "5. Position the overlay on your stream layout",
        ],
      };
    }),
});
