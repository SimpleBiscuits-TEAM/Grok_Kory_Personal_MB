/**
 * Dyno Router — Competition Dyno Runs with SAE Corrections
 * 
 * Links dyno runs to real atmospheric conditions from the weather system.
 * SAE J1349 correction factors are calculated from ACTUAL vehicle-reported
 * weather data, not guessed standard values. This enables fair dyno competitions.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { dynoSessions, dynoCompetitions, weatherReports, sharedDynos } from "../../drizzle/schema";
import { storagePut } from "../storage";
import crypto from "crypto";
import { desc, eq, sql, and, gte, lte } from "drizzle-orm";

/**
 * SAE J1349 correction factor (same formula as weather router).
 * CF = (29.235 / Pd) × ((T + 460) / 545.4)^0.5
 */
function calculateSaeCorrectionFactor(
  tempF: number,
  baroInHg: number,
  humidityPct: number | null
): number {
  const humidity = humidityPct ?? 0;
  const tempC = (tempF - 32) * 5 / 9;
  const satVaporPressureMb = 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
  const vaporPressureInHg = (satVaporPressureMb * (humidity / 100)) / 33.8639;
  const dryAirPressure = baroInHg - vaporPressureInHg;
  const cf = (29.235 / dryAirPressure) * Math.sqrt((tempF + 460) / 545.4);
  return Math.round(cf * 10000) / 10000;
}

function calculateDensityAltitude(altitudeFt: number, tempF: number): number {
  const tempC = (tempF - 32) * 5 / 9;
  const isaTemp = 15 - (2 * altitudeFt / 1000);
  return Math.round(altitudeFt + 120 * (tempC - isaTemp));
}

function calculateAirDensity(baroInHg: number, tempF: number): number {
  const pressurePa = baroInHg * 3386.39;
  const tempK = (tempF - 32) * 5 / 9 + 273.15;
  const densityKgM3 = pressurePa / (287.058 * tempK);
  return Math.round(densityKgM3 * 0.062428 * 1000000) / 1000000;
}

export const dynoRouter = router({
  /**
   * Submit a dyno run with atmospheric conditions.
   * Auto-calculates SAE correction and corrected HP/TQ.
   */
  submitRun: protectedProcedure
    .input(z.object({
      vehicleId: z.string().max(64).optional(),
      vehicleName: z.string().max(128).optional(),
      vehicleYear: z.number().min(1900).max(2030).optional(),
      vehicleMake: z.string().max(64).optional(),
      vehicleModel: z.string().max(64).optional(),
      vehicleClass: z.string().max(64).optional(),
      peakHpObserved: z.number().min(0).max(5000),
      peakTqObserved: z.number().min(0).max(5000),
      peakHpRpm: z.number().min(0).max(15000).optional(),
      peakTqRpm: z.number().min(0).max(15000).optional(),
      // Atmospheric conditions (from weather system or manual)
      temperatureF: z.number().min(-60).max(160),
      baroPressureInHg: z.number().min(20).max(35),
      humidityPct: z.number().min(0).max(100).optional(),
      altitudeFt: z.number().min(-1500).max(30000).optional(),
      // Location
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      facilityName: z.string().max(128).optional(),
      // Dyno info
      dynoType: z.enum(["chassis", "engine", "hub"]).optional(),
      dynoBrand: z.string().max(64).optional(),
      competitionId: z.number().optional(),
      runNumber: z.number().min(1).max(100).optional(),
      notes: z.string().max(2000).optional(),
      dynoSheetUrl: z.string().max(2000).optional(),
      curveData: z.array(z.object({
        rpm: z.number(),
        hp: z.number(),
        tq: z.number(),
      })).optional(),
      // Optional: link to a specific weather report
      weatherReportId: z.number().optional(),
      weatherStationId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const saeCF = calculateSaeCorrectionFactor(input.temperatureF, input.baroPressureInHg, input.humidityPct ?? null);
      const correctedHp = Math.round(input.peakHpObserved * saeCF * 100) / 100;
      const correctedTq = Math.round(input.peakTqObserved * saeCF * 100) / 100;
      const altFt = input.altitudeFt ?? 0;
      const densityAlt = calculateDensityAltitude(altFt, input.temperatureF);
      const airDensity = calculateAirDensity(input.baroPressureInHg, input.temperatureF);

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [result] = await db.insert(dynoSessions).values({
        userId: ctx.user.id,
        vehicleId: input.vehicleId ?? null,
        vehicleName: input.vehicleName ?? null,
        vehicleYear: input.vehicleYear ?? null,
        vehicleMake: input.vehicleMake ?? null,
        vehicleModel: input.vehicleModel ?? null,
        vehicleClass: input.vehicleClass ?? null,
        peakHpObserved: String(input.peakHpObserved),
        peakTqObserved: String(input.peakTqObserved),
        peakHpRpm: input.peakHpRpm ?? null,
        peakTqRpm: input.peakTqRpm ?? null,
        peakHpCorrected: String(correctedHp),
        peakTqCorrected: String(correctedTq),
        saeCorrectionFactor: String(saeCF),
        temperatureF: String(input.temperatureF),
        baroPressureInHg: String(input.baroPressureInHg),
        humidityPct: input.humidityPct != null ? String(input.humidityPct) : null,
        densityAltitudeFt: String(densityAlt),
        airDensityLbFt3: String(airDensity),
        weatherReportId: input.weatherReportId ?? null,
        weatherStationId: input.weatherStationId ?? null,
        latitude: input.latitude != null ? String(input.latitude) : null,
        longitude: input.longitude != null ? String(input.longitude) : null,
        facilityName: input.facilityName ?? null,
        dynoType: input.dynoType ?? "chassis",
        dynoBrand: input.dynoBrand ?? null,
        competitionId: input.competitionId ?? null,
        runNumber: input.runNumber ?? 1,
        notes: input.notes ?? null,
        dynoSheetUrl: input.dynoSheetUrl ?? null,
        curveData: input.curveData ?? null,
      });

      return {
        success: true,
        id: result.insertId,
        saeCorrectionFactor: saeCF,
        peakHpCorrected: correctedHp,
        peakTqCorrected: correctedTq,
        densityAltitudeFt: densityAlt,
        airDensityLbFt3: airDensity,
      };
    }),

  /**
   * Get dyno runs — optionally filtered by user, competition, or vehicle class.
   */
  getRuns: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      userId: z.number().optional(),
      competitionId: z.number().optional(),
      vehicleClass: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input.userId) conditions.push(eq(dynoSessions.userId, input.userId));
      if (input.competitionId) conditions.push(eq(dynoSessions.competitionId, input.competitionId));
      if (input.vehicleClass) conditions.push(eq(dynoSessions.vehicleClass, input.vehicleClass));

      const runs = await db.select()
        .from(dynoSessions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(dynoSessions.createdAt))
        .limit(input.limit);

      return runs;
    }),

  /**
   * Get my dyno runs.
   */
  getMyRuns: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      return db.select()
        .from(dynoSessions)
        .where(eq(dynoSessions.userId, ctx.user.id))
        .orderBy(desc(dynoSessions.createdAt))
        .limit(input.limit);
    }),

  /**
   * Get the leaderboard — top corrected HP by vehicle class.
   */
  getLeaderboard: publicProcedure
    .input(z.object({
      vehicleClass: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input.vehicleClass) conditions.push(eq(dynoSessions.vehicleClass, input.vehicleClass));

      return db.select()
        .from(dynoSessions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(dynoSessions.peakHpCorrected))
        .limit(input.limit);
    }),

  // ── Competitions ──

  /**
   * Create a dyno competition event.
   */
  createCompetition: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      facilityName: z.string().max(128).optional(),
      city: z.string().max(128).optional(),
      state: z.string().max(64).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      vehicleClass: z.string().max(64).optional(),
      dynoType: z.enum(["chassis", "engine", "hub"]).optional(),
      maxParticipants: z.number().min(2).max(1000).optional(),
      startDate: z.string().optional(), // ISO date string
      endDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [result] = await db.insert(dynoCompetitions).values({
        name: input.name,
        description: input.description ?? null,
        facilityName: input.facilityName ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        latitude: input.latitude != null ? String(input.latitude) : null,
        longitude: input.longitude != null ? String(input.longitude) : null,
        vehicleClass: input.vehicleClass ?? null,
        dynoType: input.dynoType ?? "chassis",
        maxParticipants: input.maxParticipants ?? null,
        createdBy: ctx.user.id,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      });

      return { success: true, id: result.insertId };
    }),

  /**
   * Get competitions list.
   */
  getCompetitions: publicProcedure
    .input(z.object({
      status: z.enum(["upcoming", "active", "completed", "cancelled"]).optional(),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input.status) conditions.push(eq(dynoCompetitions.status, input.status));

      return db.select()
        .from(dynoCompetitions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(dynoCompetitions.createdAt))
        .limit(input.limit);
    }),

  /**
   * Get a single competition with its runs.
   */
  getCompetition: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [competition] = await db.select()
        .from(dynoCompetitions)
        .where(eq(dynoCompetitions.id, input.id))
        .limit(1);

      if (!competition) return null;

      const runs = await db.select()
        .from(dynoSessions)
        .where(eq(dynoSessions.competitionId, input.id))
        .orderBy(desc(dynoSessions.peakHpCorrected));

      return { ...competition, runs };
    }),

  // ── Share Virtual Dyno ──────────────────────────────────────────────────

  /** Upload a virtual dyno PDF to S3 and create a shareable link */
  shareDyno: protectedProcedure
    .input(z.object({
      pdfBase64: z.string().min(1),
      peakHp: z.number().optional(),
      peakTorque: z.number().optional(),
      peakHpRpm: z.number().optional(),
      peakTorqueRpm: z.number().optional(),
      turboType: z.string().optional(),
      fuelType: z.string().optional(),
      injectorType: z.string().optional(),
      has3BarMap: z.boolean().optional(),
      fileName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Generate unique share token
      const shareToken = crypto.randomBytes(12).toString('hex'); // 24 chars

      // Decode base64 PDF and upload to S3
      const pdfBuffer = Buffer.from(input.pdfBase64, 'base64');
      const fileKey = `shared-dynos/${shareToken}.pdf`;
      const { url: pdfUrl } = await storagePut(fileKey, pdfBuffer, 'application/pdf');

      // Store metadata in database
      await db.insert(sharedDynos).values({
        shareToken,
        userId: ctx.user.id,
        pdfUrl,
        peakHp: input.peakHp?.toFixed(1) ?? null,
        peakTorque: input.peakTorque?.toFixed(1) ?? null,
        peakHpRpm: input.peakHpRpm ?? null,
        peakTorqueRpm: input.peakTorqueRpm ?? null,
        turboType: input.turboType ?? null,
        fuelType: input.fuelType ?? null,
        injectorType: input.injectorType ?? null,
        has3BarMap: input.has3BarMap ?? false,
        fileName: input.fileName ?? null,
      });

      return { shareToken, pdfUrl };
    }),

  /** Get a shared dyno by token (public — no auth required) */
  getSharedDyno: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [result] = await db.select()
        .from(sharedDynos)
        .where(eq(sharedDynos.shareToken, input.token))
        .limit(1);

      if (!result) return null;

      // Increment view count
      await db.update(sharedDynos)
        .set({ views: sql`${sharedDynos.views} + 1` })
        .where(eq(sharedDynos.id, result.id));

      return result;
    }),
});
