/**
 * Streaming Router — Live Weather Streams & Storm Chaser Telemetry
 * 
 * Vehicles with VOP become mobile weather stations, streaming atmospheric
 * + vehicle telemetry in real-time. Storm chasers, weather streamers, and
 * enthusiasts can broadcast their chase data for viewers worldwide.
 * 
 * Integrates with external video streams (YouTube, Twitch) for combined
 * weather data + vehicle performance overlays.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { liveWeatherStreams, streamTelemetryPoints } from "../../drizzle/schema";
import { desc, eq, sql, and, ne } from "drizzle-orm";
import crypto from "crypto";

function generateStreamKey(): string {
  return `vop_wx_${crypto.randomBytes(16).toString("hex")}`;
}

export const streamingRouter = router({
  /**
   * Start a new live weather stream.
   */
  startStream: protectedProcedure
    .input(z.object({
      title: z.string().min(3).max(256),
      description: z.string().max(2000).optional(),
      vehicleType: z.string().max(128).optional(),
      callsign: z.string().max(64).optional(),
      externalStreamUrl: z.string().url().max(512).optional(),
      tags: z.array(z.string().max(32)).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const streamKey = generateStreamKey();
      const [result] = await (await getDb())!.insert(liveWeatherStreams).values({
        userId: ctx.user.id,
        streamKey,
        title: input.title,
        description: input.description ?? null,
        vehicleType: input.vehicleType ?? null,
        callsign: input.callsign ?? null,
        externalStreamUrl: input.externalStreamUrl ?? null,
        tags: input.tags ?? [],
        status: "live",
        viewerCount: 0,
        totalDataPoints: 0,
      });

      return {
        success: true,
        streamId: result.insertId,
        streamKey,
      };
    }),

  /**
   * Push telemetry data to an active stream.
   * Called by the VOP device at regular intervals (~1-5 seconds).
   */
  pushTelemetry: protectedProcedure
    .input(z.object({
      streamKey: z.string(),
      // GPS
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      heading: z.number().min(0).max(360).optional(),
      speedMph: z.number().min(0).max(300).optional(),
      // Atmospheric
      temperatureF: z.number().min(-60).max(160).optional(),
      baroPressureInHg: z.number().min(20).max(35).optional(),
      humidityPct: z.number().min(0).max(100).optional(),
      windSpeedMph: z.number().min(0).max(300).optional(),
      windDirection: z.number().min(0).max(360).optional(),
      // Vehicle
      engineRpm: z.number().min(0).max(10000).optional(),
      throttlePct: z.number().min(0).max(100).optional(),
      engineLoadPct: z.number().min(0).max(100).optional(),
      boostPsi: z.number().min(-20).max(100).optional(),
      transTemp: z.number().min(-40).max(400).optional(),
      coolantTemp: z.number().min(-40).max(300).optional(),
      intakeAirTemp: z.number().min(-40).max(300).optional(),
      fuelRateGph: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Verify stream exists and is live
      const [stream] = await db.select({ id: liveWeatherStreams.id, status: liveWeatherStreams.status })
        .from(liveWeatherStreams)
        .where(eq(liveWeatherStreams.streamKey, input.streamKey))
        .limit(1);

      if (!stream) return { success: false, error: "Stream not found" };
      if (stream.status === "ended") return { success: false, error: "Stream has ended" };

      // Insert telemetry point
      await db.insert(streamTelemetryPoints).values({
        streamId: stream.id,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        heading: input.heading != null ? String(input.heading) : null,
        speedMph: input.speedMph != null ? String(input.speedMph) : null,
        temperatureF: input.temperatureF != null ? String(input.temperatureF) : null,
        baroPressureInHg: input.baroPressureInHg != null ? String(input.baroPressureInHg) : null,
        humidityPct: input.humidityPct != null ? String(input.humidityPct) : null,
        windSpeedMph: input.windSpeedMph != null ? String(input.windSpeedMph) : null,
        windDirection: input.windDirection != null ? String(input.windDirection) : null,
        engineRpm: input.engineRpm ?? null,
        throttlePct: input.throttlePct != null ? String(input.throttlePct) : null,
        engineLoadPct: input.engineLoadPct != null ? String(input.engineLoadPct) : null,
        boostPsi: input.boostPsi != null ? String(input.boostPsi) : null,
        transTemp: input.transTemp != null ? String(input.transTemp) : null,
        coolantTemp: input.coolantTemp != null ? String(input.coolantTemp) : null,
        intakeAirTemp: input.intakeAirTemp != null ? String(input.intakeAirTemp) : null,
        fuelRateGph: input.fuelRateGph != null ? String(input.fuelRateGph) : null,
      });

      // Update stream with latest values
      await db.update(liveWeatherStreams)
        .set({
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          heading: input.heading != null ? String(input.heading) : undefined,
          speedMph: input.speedMph != null ? String(input.speedMph) : undefined,
          temperatureF: input.temperatureF != null ? String(input.temperatureF) : undefined,
          baroPressureInHg: input.baroPressureInHg != null ? String(input.baroPressureInHg) : undefined,
          humidityPct: input.humidityPct != null ? String(input.humidityPct) : undefined,
          windSpeedMph: input.windSpeedMph != null ? String(input.windSpeedMph) : undefined,
          windDirection: input.windDirection != null ? String(input.windDirection) : undefined,
          engineRpm: input.engineRpm ?? undefined,
          throttlePct: input.throttlePct != null ? String(input.throttlePct) : undefined,
          engineLoadPct: input.engineLoadPct != null ? String(input.engineLoadPct) : undefined,
          boostPsi: input.boostPsi != null ? String(input.boostPsi) : undefined,
          transTemp: input.transTemp != null ? String(input.transTemp) : undefined,
          coolantTemp: input.coolantTemp != null ? String(input.coolantTemp) : undefined,
          intakeAirTemp: input.intakeAirTemp != null ? String(input.intakeAirTemp) : undefined,
          fuelRateGph: input.fuelRateGph != null ? String(input.fuelRateGph) : undefined,
          totalDataPoints: sql`totalDataPoints + 1`,
        })
        .where(eq(liveWeatherStreams.id, stream.id));

      return { success: true };
    }),

  /**
   * End a live stream.
   */
  endStream: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await (await getDb())!.update(liveWeatherStreams)
        .set({ status: "ended", endedAt: new Date() })
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ));
      return { success: true };
    }),

  /**
   * Pause/resume a live stream.
   */
  togglePause: protectedProcedure
    .input(z.object({ streamKey: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [stream] = await db.select({ status: liveWeatherStreams.status })
        .from(liveWeatherStreams)
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ))
        .limit(1);

      if (!stream) return { success: false, error: "Stream not found" };
      const newStatus = stream.status === "paused" ? "live" : "paused";
      await db.update(liveWeatherStreams)
        .set({ status: newStatus as "live" | "paused" })
        .where(and(
          eq(liveWeatherStreams.streamKey, input.streamKey),
          eq(liveWeatherStreams.userId, ctx.user.id),
        ));
      return { success: true, status: newStatus };
    }),

  /**
   * Get all currently live streams.
   */
  getLiveStreams: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      tag: z.string().max(32).optional(),
    }))
    .query(async ({ input }) => {
      const streams = await (await getDb())!.select()
        .from(liveWeatherStreams)
        .where(ne(liveWeatherStreams.status, "ended"))
        .orderBy(desc(liveWeatherStreams.viewerCount))
        .limit(input.limit);

      return streams.map(s => ({
        ...s,
        tags: (s.tags as string[] | null) ?? [],
      }));
    }),

  /**
   * Get a single stream's details + recent telemetry.
   */
  getStream: publicProcedure
    .input(z.object({
      streamId: z.number(),
      telemetryLimit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [stream] = await db.select()
        .from(liveWeatherStreams)
        .where(eq(liveWeatherStreams.id, input.streamId))
        .limit(1);

      if (!stream) return null;

      const telemetry = await db.select()
        .from(streamTelemetryPoints)
        .where(eq(streamTelemetryPoints.streamId, input.streamId))
        .orderBy(desc(streamTelemetryPoints.capturedAt))
        .limit(input.telemetryLimit);

      return {
        stream: { ...stream, tags: (stream.tags as string[] | null) ?? [] },
        telemetry: telemetry.reverse(), // chronological order
      };
    }),

  /**
   * Get user's own streams (active + recent ended).
   */
  getMyStreams: protectedProcedure
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
        tags: (s.tags as string[] | null) ?? [],
      }));
    }),

  /**
   * Increment viewer count (called when someone opens a stream).
   */
  joinStream: publicProcedure
    .input(z.object({ streamId: z.number() }))
    .mutation(async ({ input }) => {
      await (await getDb())!.update(liveWeatherStreams)
        .set({ viewerCount: sql`viewerCount + 1` })
        .where(eq(liveWeatherStreams.id, input.streamId));
      return { success: true };
    }),

  /**
   * Decrement viewer count (called when someone leaves a stream).
   */
  leaveStream: publicProcedure
    .input(z.object({ streamId: z.number() }))
    .mutation(async ({ input }) => {
      await (await getDb())!.update(liveWeatherStreams)
        .set({ viewerCount: sql`GREATEST(viewerCount - 1, 0)` })
        .where(eq(liveWeatherStreams.id, input.streamId));
      return { success: true };
    }),

  /**
   * Get stream telemetry trail (GPS path for map rendering).
   */
  getStreamTrail: publicProcedure
    .input(z.object({
      streamId: z.number(),
      limit: z.number().min(10).max(2000).default(500),
    }))
    .query(async ({ input }) => {
      const points = await (await getDb())!.select({
        latitude: streamTelemetryPoints.latitude,
        longitude: streamTelemetryPoints.longitude,
        heading: streamTelemetryPoints.heading,
        speedMph: streamTelemetryPoints.speedMph,
        temperatureF: streamTelemetryPoints.temperatureF,
        windSpeedMph: streamTelemetryPoints.windSpeedMph,
        capturedAt: streamTelemetryPoints.capturedAt,
      })
        .from(streamTelemetryPoints)
        .where(eq(streamTelemetryPoints.streamId, input.streamId))
        .orderBy(desc(streamTelemetryPoints.capturedAt))
        .limit(input.limit);

      return points.reverse();
    }),
});
