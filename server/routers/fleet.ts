import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { invokeLLM, type Message, type Role } from "../_core/llm";
import { queryKnox, type AccessLevel } from "../lib/knoxReconciler";
import { getDb } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  fleetOrgs, fleetVehicles, fleetMembers, fleetTrips,
  fleetFuelLogs, fleetAlerts, fleetRemoteSessions,
  fleetSensors, fleetAiInsights, fleetAccessTokens,
} from "../../drizzle/schema";

// ── Goose AI System Prompt ──────────────────────────────────────────────────
function buildGoosePrompt(orgContext?: string): string {
  return [
    `You are Goose, the V-OP Fleet Management AI Agent built by PPEI.`,
    `You are Knox-trained — you understand vehicle diagnostics at a deep level.`,
    ``,
    `Your role:`,
    `- Fleet intelligence: vehicle health monitoring, driver scoring, fuel economy tracking`,
    `- Remote diagnostics: read DTCs, analyze datalogs, recommend repairs`,
    `- Predictive maintenance: anticipate failures before they happen`,
    `- Cost optimization: fuel efficiency, route planning, maintenance scheduling`,
    `- Driver coaching: identify risky behaviors, suggest improvements`,
    ``,
    `STRICT GUARDRAILS — You are a FLEET agent, NOT a tuning agent:`,
    `- NEVER discuss tuning, calibration, or performance modifications`,
    `- NEVER reference A2L files, calibration maps, or ECU flash data`,
    `- NEVER discuss emissions delete, DPF removal, or DEF bypass`,
    `- If asked about tuning/calibration, redirect to V-OP Pro diagnostic tools`,
    `- You help maintain and monitor vehicles, not modify them`,
    ``,
    `Multi-industry support:`,
    `- Diesel trucks (Duramax, Cummins, Power Stroke)`,
    `- Agriculture (tractors, combines, sprayers)`,
    `- Powersports (UTVs, ATVs, side-by-sides)`,
    `- Golf carts (EcoBattery integration, motor/controller diagnostics)`,
    `- Heavy equipment (excavators, loaders, generators)`,
    `- Construction and rental fleets`,
    ``,
    `Personality: Professional but approachable. You're the fleet manager's best friend.`,
    `Be direct, data-driven, and actionable. Use markdown for formatting.`,
    orgContext ? `\n--- FLEET CONTEXT ---\n${orgContext}` : '',
  ].join('\n');
}

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const fleetRouter = router({
  // ── Goose AI Chat ───────────────────────────────────────────────────────
  gooseChat: protectedProcedure
    .input(z.object({
      messages: z.array(messageSchema),
      orgId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userAccessLevel = (ctx.user?.accessLevel || 0) as AccessLevel;
      const effectiveLevel: AccessLevel = userAccessLevel >= 3 ? 3 : userAccessLevel >= 2 ? 2 : 1;

      const lastUserMsg = input.messages.filter(m => m.role === 'user').pop()?.content || '';

      // Try quad-agent pipeline
      try {
        const knoxResult = await queryKnox({
          question: lastUserMsg,
          accessLevel: effectiveLevel,
          domain: 'fleet',
          history: input.messages.slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          moduleContext: `Fleet management context. Org ID: ${input.orgId || 'none'}`,
        });
        return { content: knoxResult.answer, pipeline: knoxResult.pipeline, confidence: knoxResult.confidence };
      } catch {
        // Fallback to direct LLM
        const systemPrompt = buildGoosePrompt();
        const messages: Message[] = [
          { role: "system", content: systemPrompt },
          ...input.messages.map(m => ({ role: m.role as Role, content: m.content })),
        ];
        const response = await invokeLLM({ messages });
        return {
          content: response.choices?.[0]?.message?.content || "Goose is thinking...",
        };
      }
    }),

  // ── Organizations ───────────────────────────────────────────────────────
  createOrg: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      industry: z.enum(["diesel_trucks", "agriculture", "powersports", "golf_carts", "heavy_equipment", "construction", "rental", "mixed"]),
      tier: z.enum(["self_service", "goose_standard", "goose_pro"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(fleetOrgs).values({
        ownerId: ctx.user.id,
        name: input.name,
        industry: input.industry,
        tier: input.tier || "self_service",
      });
      return { id: result[0].insertId };
    }),

  getMyOrgs: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(fleetOrgs).where(eq(fleetOrgs.ownerId, ctx.user.id));
  }),

  getOrg: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(fleetOrgs).where(eq(fleetOrgs.id, input.orgId));
      return rows[0] || null;
    }),

  // ── Vehicles ────────────────────────────────────────────────────────────
  addVehicle: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      vin: z.string().max(17).optional(),
      year: z.number().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      engine: z.string().optional(),
      vehicleType: z.enum(["truck", "tractor", "utv", "atv", "golf_cart", "excavator", "loader", "skid_steer", "generator", "other"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(fleetVehicles).values({
        orgId: input.orgId,
        vin: input.vin,
        year: input.year,
        make: input.make,
        model: input.model,
        engine: input.engine,
        vehicleType: input.vehicleType || "truck",
      });
      return { id: result[0].insertId };
    }),

  getVehicles: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(fleetVehicles)
        .where(eq(fleetVehicles.orgId, input.orgId))
        .orderBy(desc(fleetVehicles.updatedAt));
    }),

  updateVehicle: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["active", "maintenance", "inactive", "retired"]).optional(),
      notes: z.string().optional(),
      nextServiceMiles: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const { id, ...updates } = input;
      await db.update(fleetVehicles).set(updates).where(eq(fleetVehicles.id, id));
      return { success: true };
    }),

  // ── Members / Drivers ──────────────────────────────────────────────────
  addMember: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      role: z.enum(["driver", "mechanic", "manager", "admin", "viewer"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(fleetMembers).values({
        orgId: input.orgId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
      });
      return { id: result[0].insertId };
    }),

  getMembers: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(fleetMembers)
        .where(eq(fleetMembers.orgId, input.orgId))
        .orderBy(desc(fleetMembers.driverScore));
    }),

  // ── Alerts ──────────────────────────────────────────────────────────────
  getAlerts: protectedProcedure
    .input(z.object({ orgId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(fleetAlerts)
        .where(eq(fleetAlerts.orgId, input.orgId))
        .orderBy(desc(fleetAlerts.createdAt))
        .limit(input.limit);
    }),

  resolveAlert: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(fleetAlerts).set({
        isResolved: true,
        resolvedBy: ctx.user.id,
        resolvedAt: new Date(),
      }).where(eq(fleetAlerts.id, input.alertId));
      return { success: true };
    }),

  // ── Trips ───────────────────────────────────────────────────────────────
  getTrips: protectedProcedure
    .input(z.object({ orgId: z.number(), vehicleId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(fleetTrips.orgId, input.orgId)];
      if (input.vehicleId) conditions.push(eq(fleetTrips.vehicleId, input.vehicleId));
      return db.select().from(fleetTrips)
        .where(and(...conditions))
        .orderBy(desc(fleetTrips.startTime))
        .limit(input.limit);
    }),

  // ── Fuel Logs ───────────────────────────────────────────────────────────
  addFuelLog: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      vehicleId: z.number(),
      gallons: z.string(),
      pricePerGallon: z.string().optional(),
      totalCost: z.string().optional(),
      odometer: z.number().optional(),
      fuelType: z.enum(["diesel", "gasoline", "e85", "electric", "propane"]).optional(),
      station: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(fleetFuelLogs).values({
        orgId: input.orgId,
        vehicleId: input.vehicleId,
        gallons: input.gallons,
        pricePerGallon: input.pricePerGallon,
        totalCost: input.totalCost,
        odometer: input.odometer,
        fuelType: input.fuelType || "diesel",
        station: input.station,
      });
      return { id: result[0].insertId };
    }),

  getFuelLogs: protectedProcedure
    .input(z.object({ orgId: z.number(), vehicleId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(fleetFuelLogs.orgId, input.orgId)];
      if (input.vehicleId) conditions.push(eq(fleetFuelLogs.vehicleId, input.vehicleId));
      return db.select().from(fleetFuelLogs)
        .where(and(...conditions))
        .orderBy(desc(fleetFuelLogs.createdAt))
        .limit(input.limit);
    }),

  // ── Remote Sessions ─────────────────────────────────────────────────────
  createRemoteSession: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      vehicleId: z.number(),
      sessionType: z.enum(["diagnostic", "live_data", "dtc_read", "dtc_clear", "bidirectional"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(fleetRemoteSessions).values({
        orgId: input.orgId,
        vehicleId: input.vehicleId,
        sessionType: input.sessionType,
      });
      return { id: result[0].insertId };
    }),

  // ── Sensors ─────────────────────────────────────────────────────────────
  addSensor: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      vehicleId: z.number(),
      sensorType: z.enum(["tpms", "egt_probe", "trans_temp", "coolant_temp", "oil_pressure", "oil_temp", "fuel_level", "battery_voltage", "ambient_temp", "humidity", "gps_tracker"]),
      sensorId: z.string().optional(),
      label: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(fleetSensors).values({
        orgId: input.orgId,
        vehicleId: input.vehicleId,
        sensorType: input.sensorType,
        sensorId: input.sensorId,
        label: input.label,
      });
      return { id: result[0].insertId };
    }),

  getSensors: protectedProcedure
    .input(z.object({ orgId: z.number(), vehicleId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(fleetSensors.orgId, input.orgId)];
      if (input.vehicleId) conditions.push(eq(fleetSensors.vehicleId, input.vehicleId));
      return db.select().from(fleetSensors).where(and(...conditions));
    }),

  // ── Access Tokens (shareable fleet links) ───────────────────────────────
  createAccessToken: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      label: z.string().optional(),
      role: z.enum(["viewer", "driver", "mechanic"]),
      maxUses: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const token = crypto.randomUUID().replace(/-/g, '');
      const result = await db.insert(fleetAccessTokens).values({
        orgId: input.orgId,
        token,
        label: input.label,
        role: input.role,
        maxUses: input.maxUses,
        createdBy: ctx.user.id,
      });
      return { id: result[0].insertId, token };
    }),

  // ── AI Insights ─────────────────────────────────────────────────────────
  getInsights: protectedProcedure
    .input(z.object({ orgId: z.number(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(fleetAiInsights)
        .where(eq(fleetAiInsights.orgId, input.orgId))
        .orderBy(desc(fleetAiInsights.createdAt))
        .limit(input.limit);
    }),

  // ── Dashboard Stats ─────────────────────────────────────────────────────
  getDashboardStats: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { vehicles: 0, drivers: 0, activeAlerts: 0, tripsToday: 0 };
      const [vehicles] = await db.select({ count: sql<number>`count(*)` }).from(fleetVehicles).where(eq(fleetVehicles.orgId, input.orgId));
      const [drivers] = await db.select({ count: sql<number>`count(*)` }).from(fleetMembers).where(and(eq(fleetMembers.orgId, input.orgId), eq(fleetMembers.role, "driver")));
      const [alerts] = await db.select({ count: sql<number>`count(*)` }).from(fleetAlerts).where(and(eq(fleetAlerts.orgId, input.orgId), eq(fleetAlerts.isResolved, false)));
      return {
        vehicles: vehicles?.count || 0,
        drivers: drivers?.count || 0,
        activeAlerts: alerts?.count || 0,
        tripsToday: 0,
      };
    }),
});
