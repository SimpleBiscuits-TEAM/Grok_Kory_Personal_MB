import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  cloudEnrollments, cloudVehicleSnapshots, cloudFleetAggregates,
} from "../../drizzle/schema";

// ── Helper: generate vehicleTypeKey from vehicle info ──────────────────────
function makeVehicleTypeKey(year: number | null, make: string | null, model: string | null, engine: string | null): string {
  const parts = [
    year?.toString() ?? "unknown",
    (make ?? "unknown").toLowerCase().replace(/\s+/g, "_"),
    (model ?? "unknown").toLowerCase().replace(/\s+/g, "_"),
  ];
  if (engine) parts.push(engine.toLowerCase().replace(/[\s.]+/g, "_"));
  return parts.join("_");
}

function makeVehicleTypeLabel(year: number | null, make: string | null, model: string | null, engine: string | null): string {
  const parts = [];
  if (year) parts.push(year.toString());
  if (make) parts.push(make);
  if (model) parts.push(model);
  if (engine) parts.push(`(${engine})`);
  return parts.join(" ") || "Unknown Vehicle";
}

export const cloudRouter = router({
  // ── Enrollment ─────────────────────────────────────────────────────────────

  /** Get current user's enrollment status */
  getMyEnrollment: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(cloudEnrollments)
      .where(and(eq(cloudEnrollments.userId, ctx.user.id), eq(cloudEnrollments.isActive, true)))
      .limit(10);
    return rows;
  }),

  /** Enroll a vehicle in the cloud network */
  enroll: protectedProcedure.input(z.object({
    vehicleId: z.string().optional(),
    vin: z.string().max(17).optional(),
    vehicleYear: z.number().min(1900).max(2100).optional(),
    vehicleMake: z.string().optional(),
    vehicleModel: z.string().optional(),
    vehicleEngine: z.string().optional(),
    vehicleClass: z.string().optional(),
    fleetOrgId: z.number().optional(),
    region: z.string().optional(),
    state: z.string().max(2).optional(),
    shareMpg: z.boolean().default(true),
    shareHealth: z.boolean().default(true),
    sharePerformance: z.boolean().default(true),
    shareDtcs: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const vehicleTypeKey = makeVehicleTypeKey(
      input.vehicleYear ?? null,
      input.vehicleMake ?? null,
      input.vehicleModel ?? null,
      input.vehicleEngine ?? null,
    );

    const [result] = await db.insert(cloudEnrollments).values({
      userId: ctx.user.id,
      vehicleId: input.vehicleId,
      vin: input.vin,
      vehicleYear: input.vehicleYear,
      vehicleMake: input.vehicleMake,
      vehicleModel: input.vehicleModel,
      vehicleEngine: input.vehicleEngine,
      vehicleClass: input.vehicleClass,
      vehicleTypeKey,
      fleetOrgId: input.fleetOrgId,
      region: input.region,
      state: input.state,
      shareMpg: input.shareMpg,
      shareHealth: input.shareHealth,
      sharePerformance: input.sharePerformance,
      shareDtcs: input.shareDtcs,
    });
    return { id: result.insertId, vehicleTypeKey };
  }),

  /** Update enrollment preferences (opt-in/out of specific data sharing) */
  updateEnrollment: protectedProcedure.input(z.object({
    enrollmentId: z.number(),
    shareMpg: z.boolean().optional(),
    shareHealth: z.boolean().optional(),
    sharePerformance: z.boolean().optional(),
    shareDtcs: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const updates: Record<string, boolean> = {};
    if (input.shareMpg !== undefined) updates.shareMpg = input.shareMpg;
    if (input.shareHealth !== undefined) updates.shareHealth = input.shareHealth;
    if (input.sharePerformance !== undefined) updates.sharePerformance = input.sharePerformance;
    if (input.shareDtcs !== undefined) updates.shareDtcs = input.shareDtcs;

    await db.update(cloudEnrollments)
      .set(updates)
      .where(and(eq(cloudEnrollments.id, input.enrollmentId), eq(cloudEnrollments.userId, ctx.user.id)));
    return { success: true };
  }),

  /** Unenroll a vehicle from the cloud network */
  unenroll: protectedProcedure.input(z.object({
    enrollmentId: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    await db.update(cloudEnrollments)
      .set({ isActive: false, unenrolledAt: new Date() })
      .where(and(eq(cloudEnrollments.id, input.enrollmentId), eq(cloudEnrollments.userId, ctx.user.id)));
    return { success: true };
  }),

  // ── Data Submission ────────────────────────────────────────────────────────

  /** Submit a vehicle data snapshot */
  submitSnapshot: protectedProcedure.input(z.object({
    enrollmentId: z.number(),
    avgMpg: z.number().optional(),
    instantMpg: z.number().optional(),
    totalMiles: z.number().optional(),
    totalGallons: z.number().optional(),
    coolantTempF: z.number().optional(),
    oilTempF: z.number().optional(),
    oilPressurePsi: z.number().optional(),
    transTemp: z.number().optional(),
    batteryVoltage: z.number().optional(),
    boostPsi: z.number().optional(),
    egtF: z.number().optional(),
    fuelRailPsi: z.number().optional(),
    airflowGps: z.number().optional(),
    healthScore: z.number().min(0).max(100).optional(),
    activeDtcCount: z.number().optional(),
    activeDtcs: z.array(z.string()).optional(),
    odometerMiles: z.number().optional(),
    ambientTempF: z.number().optional(),
    baroPressureInHg: z.number().optional(),
    altitudeFt: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;

    // Verify enrollment belongs to user
    const [enrollment] = await db.select().from(cloudEnrollments)
      .where(and(eq(cloudEnrollments.id, input.enrollmentId), eq(cloudEnrollments.userId, ctx.user.id), eq(cloudEnrollments.isActive, true)))
      .limit(1);
    if (!enrollment) throw new Error("Enrollment not found or inactive");

    const [result] = await db.insert(cloudVehicleSnapshots).values({
      enrollmentId: input.enrollmentId,
      vehicleTypeKey: enrollment.vehicleTypeKey,
      fleetOrgId: enrollment.fleetOrgId,
      avgMpg: input.avgMpg?.toString(),
      instantMpg: input.instantMpg?.toString(),
      totalMiles: input.totalMiles?.toString(),
      totalGallons: input.totalGallons?.toString(),
      coolantTempF: input.coolantTempF?.toString(),
      oilTempF: input.oilTempF?.toString(),
      oilPressurePsi: input.oilPressurePsi?.toString(),
      transTemp: input.transTemp?.toString(),
      batteryVoltage: input.batteryVoltage?.toString(),
      boostPsi: input.boostPsi?.toString(),
      egtF: input.egtF?.toString(),
      fuelRailPsi: input.fuelRailPsi?.toString(),
      airflowGps: input.airflowGps?.toString(),
      healthScore: input.healthScore,
      activeDtcCount: input.activeDtcCount ?? 0,
      activeDtcs: input.activeDtcs ? JSON.stringify(input.activeDtcs) : null,
      odometerMiles: input.odometerMiles,
      ambientTempF: input.ambientTempF?.toString(),
      baroPressureInHg: input.baroPressureInHg?.toString(),
      altitudeFt: input.altitudeFt,
    });

    // Update last report timestamp
    await db.update(cloudEnrollments)
      .set({ lastReportAt: new Date() })
      .where(eq(cloudEnrollments.id, input.enrollmentId));

    return { id: result.insertId };
  }),

  // ── Analytics ──────────────────────────────────────────────────────────────

  /** Get fleet averages for a specific vehicle type */
  getVehicleTypeAverages: publicProcedure.input(z.object({
    vehicleTypeKey: z.string(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(cloudFleetAggregates)
      .where(eq(cloudFleetAggregates.vehicleTypeKey, input.vehicleTypeKey))
      .orderBy(desc(cloudFleetAggregates.computedAt))
      .limit(2); // one for all, one for fleet-only
    return rows;
  }),

  /** Get all available vehicle types in the network */
  getVehicleTypes: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const rows = await db.select({
      vehicleTypeKey: cloudFleetAggregates.vehicleTypeKey,
      vehicleTypeLabel: cloudFleetAggregates.vehicleTypeLabel,
      vehicleCount: cloudFleetAggregates.vehicleCount,
      avgMpg: cloudFleetAggregates.avgMpg,
      avgHealthScore: cloudFleetAggregates.avgHealthScore,
      fleetVehicleCount: cloudFleetAggregates.fleetVehicleCount,
      individualVehicleCount: cloudFleetAggregates.individualVehicleCount,
    }).from(cloudFleetAggregates)
      .where(eq(cloudFleetAggregates.isFleetOnly, false))
      .orderBy(desc(cloudFleetAggregates.vehicleCount))
      .limit(100);
    return rows;
  }),

  /** Compare user's vehicle against fleet averages */
  compareMyVehicle: protectedProcedure.input(z.object({
    enrollmentId: z.number(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;

    // Get enrollment
    const [enrollment] = await db.select().from(cloudEnrollments)
      .where(and(eq(cloudEnrollments.id, input.enrollmentId), eq(cloudEnrollments.userId, ctx.user.id)))
      .limit(1);
    if (!enrollment) return null;

    // Get user's latest snapshot
    const [latestSnapshot] = await db.select().from(cloudVehicleSnapshots)
      .where(eq(cloudVehicleSnapshots.enrollmentId, input.enrollmentId))
      .orderBy(desc(cloudVehicleSnapshots.capturedAt))
      .limit(1);

    // Get fleet averages for this vehicle type
    const aggregates = await db.select().from(cloudFleetAggregates)
      .where(eq(cloudFleetAggregates.vehicleTypeKey, enrollment.vehicleTypeKey))
      .orderBy(desc(cloudFleetAggregates.computedAt))
      .limit(2);

    const allVehicles = aggregates.find(a => !a.isFleetOnly) ?? null;
    const fleetOnly = aggregates.find(a => a.isFleetOnly) ?? null;

    return {
      enrollment,
      latestSnapshot: latestSnapshot ?? null,
      averages: { allVehicles, fleetOnly },
    };
  }),

  /** Get network-wide statistics */
  getNetworkStats: publicProcedure.query(async () => {
    const db = (await getDb())!;

    const [enrollmentStats] = await db.select({
      totalVehicles: sql<number>`COUNT(*)`,
      activeVehicles: sql<number>`SUM(CASE WHEN ${cloudEnrollments.isActive} = true THEN 1 ELSE 0 END)`,
      fleetVehicles: sql<number>`SUM(CASE WHEN ${cloudEnrollments.fleetOrgId} IS NOT NULL THEN 1 ELSE 0 END)`,
      individualVehicles: sql<number>`SUM(CASE WHEN ${cloudEnrollments.fleetOrgId} IS NULL THEN 1 ELSE 0 END)`,
      uniqueTypes: sql<number>`COUNT(DISTINCT ${cloudEnrollments.vehicleTypeKey})`,
    }).from(cloudEnrollments);

    const [snapshotStats] = await db.select({
      totalSnapshots: sql<number>`COUNT(*)`,
    }).from(cloudVehicleSnapshots);

    return {
      totalVehicles: enrollmentStats?.totalVehicles ?? 0,
      activeVehicles: enrollmentStats?.activeVehicles ?? 0,
      fleetVehicles: enrollmentStats?.fleetVehicles ?? 0,
      individualVehicles: enrollmentStats?.individualVehicles ?? 0,
      uniqueVehicleTypes: enrollmentStats?.uniqueTypes ?? 0,
      totalDataPoints: snapshotStats?.totalSnapshots ?? 0,
    };
  }),

  /** Get fleet benchmarking data — compare a fleet org against cloud averages */
  getFleetBenchmark: protectedProcedure.input(z.object({
    fleetOrgId: z.number(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;

    // Get all enrolled vehicles for this fleet
    const fleetEnrollments = await db.select().from(cloudEnrollments)
      .where(and(eq(cloudEnrollments.fleetOrgId, input.fleetOrgId), eq(cloudEnrollments.isActive, true)));

    if (fleetEnrollments.length === 0) return { vehicles: [], benchmarks: [] };

    // Get latest snapshot for each fleet vehicle
    const vehicleTypeKeys = [...new Set(fleetEnrollments.map(e => e.vehicleTypeKey))];

    // Get cloud averages for each vehicle type in the fleet
    const benchmarks = vehicleTypeKeys.length > 0
      ? await db.select().from(cloudFleetAggregates)
          .where(inArray(cloudFleetAggregates.vehicleTypeKey, vehicleTypeKeys))
          .orderBy(desc(cloudFleetAggregates.computedAt))
      : [];

    return { vehicles: fleetEnrollments, benchmarks };
  }),

  /** Get "Best for Fleet" rankings — which vehicle types perform best in fleet use */
  getBestForFleet: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const rows = await db.select().from(cloudFleetAggregates)
      .where(eq(cloudFleetAggregates.isFleetOnly, true))
      .orderBy(desc(cloudFleetAggregates.vehicleCount))
      .limit(20);
    return rows;
  }),

  /** Get recent snapshots for a user's enrolled vehicle */
  getMySnapshots: protectedProcedure.input(z.object({
    enrollmentId: z.number(),
    limit: z.number().min(1).max(100).default(20),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;

    // Verify ownership
    const [enrollment] = await db.select().from(cloudEnrollments)
      .where(and(eq(cloudEnrollments.id, input.enrollmentId), eq(cloudEnrollments.userId, ctx.user.id)))
      .limit(1);
    if (!enrollment) return [];

    return db.select().from(cloudVehicleSnapshots)
      .where(eq(cloudVehicleSnapshots.enrollmentId, input.enrollmentId))
      .orderBy(desc(cloudVehicleSnapshots.capturedAt))
      .limit(input.limit);
  }),

  /** Get top DTCs across the network for a vehicle type */
  getTopDtcs: publicProcedure.input(z.object({
    vehicleTypeKey: z.string(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const [aggregate] = await db.select({
      topDtcs: cloudFleetAggregates.topDtcs,
      vehicleCount: cloudFleetAggregates.vehicleCount,
    }).from(cloudFleetAggregates)
      .where(and(
        eq(cloudFleetAggregates.vehicleTypeKey, input.vehicleTypeKey),
        eq(cloudFleetAggregates.isFleetOnly, false),
      ))
      .orderBy(desc(cloudFleetAggregates.computedAt))
      .limit(1);

    if (!aggregate?.topDtcs) return { dtcs: [], vehicleCount: 0 };
    try {
      return { dtcs: JSON.parse(aggregate.topDtcs), vehicleCount: aggregate.vehicleCount };
    } catch {
      return { dtcs: [], vehicleCount: aggregate.vehicleCount };
    }
  }),
});
