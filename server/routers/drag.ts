import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  dragProfiles, dragRuns, dragChallenges, dragTournaments, dragLeaderboard,
  dragCallouts, dragLeagues, dragLeagueMembers, dragLeagueSeasons,
  dragLeagueStandings, dragWallets, dragTransactions, dragSubscriptions,
} from "../../drizzle/schema";

// ── Knox Drag Racing AI ─────────────────────────────────────────────────────
function buildDragAiPrompt(): string {
  return [
    `You are Knox, the V-OP Drag Racing AI Analyst built by PPEI.`,
    `You analyze drag racing performance data and generate race reports.`,
    ``,
    `Your capabilities:`,
    `- Analyze time slips: reaction time, 60ft, 330ft, 1/8 mile, 1000ft, 1/4 mile`,
    `- Identify performance bottlenecks: traction, shift timing, converter slip, boost lag`,
    `- Compare runs and predict improvements`,
    `- Generate race reports with tips for faster times`,
    `- Understand vehicle dynamics: weight transfer, tire pressure, launch RPM`,
    ``,
    `Tips you commonly give:`,
    `- 60ft time is the most important number — it sets up the whole run`,
    `- TCC should lock by 3rd gear for drag racing — slip = lost time`,
    `- Rail pressure drops = fuel delivery issue = slower trap speed`,
    `- Boost pressure drops = turbo lag or wastegate issue`,
    `- Shift times: calculate time lost between gears`,
    `- Calculate % of estimated torque not applied to ground due to converter slippage`,
    ``,
    `CLOSED COURSE ONLY disclaimer: Always remind users that drag racing should only be done at sanctioned facilities.`,
    ``,
    `Be enthusiastic but data-driven. Use markdown for formatting.`,
  ].join('\n');
}

export const dragRouter = router({
  // ── Profiles ────────────────────────────────────────────────────────────
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(dragProfiles).where(eq(dragProfiles.userId, ctx.user.id));
    return rows[0] || null;
  }),

  createProfile: protectedProcedure
    .input(z.object({
      displayName: z.string().min(1).max(128),
      vehicleDesc: z.string().max(255).optional(),
      vehicleClass: z.string().max(64).optional(),
      bio: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(dragProfiles).values({
        userId: ctx.user.id,
        displayName: input.displayName,
        vehicleDesc: input.vehicleDesc,
        vehicleClass: input.vehicleClass,
        bio: input.bio,
      });
      return { id: result[0].insertId };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      displayName: z.string().min(1).max(128).optional(),
      vehicleDesc: z.string().max(255).optional(),
      vehicleClass: z.string().max(64).optional(),
      bio: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(dragProfiles).set(input).where(eq(dragProfiles.userId, ctx.user.id));
      return { success: true };
    }),

  // ── Runs (Time Slips) ──────────────────────────────────────────────────
  submitRun: protectedProcedure
    .input(z.object({
      profileId: z.number(),
      runType: z.enum(["eighth", "quarter"]),
      reactionTime: z.string().optional(),
      sixtyFt: z.string().optional(),
      threeThirtyFt: z.string().optional(),
      eighthEt: z.string().optional(),
      eighthMph: z.string().optional(),
      thousandFt: z.string().optional(),
      quarterEt: z.string().optional(),
      quarterMph: z.string().optional(),
      peakBoost: z.string().optional(),
      peakEgt: z.string().optional(),
      peakRpm: z.number().optional(),
      intakeTemp: z.string().optional(),
      ambientTemp: z.string().optional(),
      densityAltitude: z.number().optional(),
      dataSource: z.enum(["vop_obd", "manual", "dragy", "racepak"]),
      trackName: z.string().optional(),
      trackLocation: z.string().optional(),
      weatherConditions: z.string().optional(),
      notes: z.string().optional(),
      isPublic: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(dragRuns).values({
        profileId: input.profileId,
        runType: input.runType,
        reactionTime: input.reactionTime,
        sixtyFt: input.sixtyFt,
        threeThirtyFt: input.threeThirtyFt,
        eighthEt: input.eighthEt,
        eighthMph: input.eighthMph,
        thousandFt: input.thousandFt,
        quarterEt: input.quarterEt,
        quarterMph: input.quarterMph,
        peakBoost: input.peakBoost,
        peakEgt: input.peakEgt,
        peakRpm: input.peakRpm,
        intakeTemp: input.intakeTemp,
        ambientTemp: input.ambientTemp,
        densityAltitude: input.densityAltitude,
        dataSource: input.dataSource,
        trackName: input.trackName,
        trackLocation: input.trackLocation,
        weatherConditions: input.weatherConditions,
        notes: input.notes,
        isPublic: input.isPublic,
      });
      return { id: result[0].insertId };
    }),

  getMyRuns: protectedProcedure
    .input(z.object({ profileId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragRuns)
        .where(eq(dragRuns.profileId, input.profileId))
        .orderBy(desc(dragRuns.createdAt))
        .limit(input.limit);
    }),

  getPublicRuns: publicProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragRuns)
        .where(eq(dragRuns.isPublic, true))
        .orderBy(desc(dragRuns.createdAt))
        .limit(input.limit);
    }),

  // ── AI Race Report ─────────────────────────────────────────────────────
  analyzeRun: protectedProcedure
    .input(z.object({
      runData: z.string(), // JSON stringified run data
    }))
    .mutation(async ({ input }) => {
      const response = await invokeLLM({
        messages: [
          { role: "system", content: buildDragAiPrompt() },
          { role: "user", content: `Analyze this drag run and provide a detailed race report with tips for improvement:\n\n${input.runData}` },
        ],
      });
      return {
        report: response.choices?.[0]?.message?.content || "Analysis unavailable",
      };
    }),

  // ── Challenges ─────────────────────────────────────────────────────────
  createChallenge: protectedProcedure
    .input(z.object({
      challengerId: z.number(),
      opponentId: z.number().optional(),
      challengeType: z.enum(["eighth", "quarter"]),
      entryFee: z.string().default("0"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const fee = parseFloat(input.entryFee);
      const prizePool = fee * 2;
      const platformFee = prizePool * 0.01; // 1% rake
      const result = await db.insert(dragChallenges).values({
        challengerId: input.challengerId,
        opponentId: input.opponentId,
        challengeType: input.challengeType,
        entryFee: input.entryFee,
        prizePool: prizePool.toFixed(2),
        platformFee: platformFee.toFixed(2),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      return { id: result[0].insertId };
    }),

  getChallenges: protectedProcedure
    .input(z.object({ profileId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragChallenges)
        .orderBy(desc(dragChallenges.createdAt))
        .limit(50);
    }),

  // ── Regional Callouts ──────────────────────────────────────────────────
  createCallout: protectedProcedure
    .input(z.object({
      creatorId: z.number(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      locationType: z.enum(["state", "city", "zip", "county", "region", "country"]),
      locationValue: z.string().min(1),
      locationState: z.string().optional(),
      vehicleClass: z.string().optional(),
      raceType: z.enum(["eighth", "quarter"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(dragCallouts).values({
        creatorId: input.creatorId,
        title: input.title,
        description: input.description,
        locationType: input.locationType,
        locationValue: input.locationValue,
        locationState: input.locationState,
        vehicleClass: input.vehicleClass,
        raceType: input.raceType,
      });
      return { id: result[0].insertId };
    }),

  getCallouts: publicProcedure
    .input(z.object({
      locationType: z.string().optional(),
      locationValue: z.string().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragCallouts)
        .where(eq(dragCallouts.isActive, true))
        .orderBy(desc(dragCallouts.createdAt))
        .limit(input.limit);
    }),

  // ── User-Created Leagues ───────────────────────────────────────────────
  createLeague: protectedProcedure
    .input(z.object({
      commissionerId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      rules: z.string().optional(),
      vehicleClass: z.string().optional(),
      raceType: z.enum(["eighth", "quarter"]),
      locationType: z.enum(["state", "city", "zip", "region", "national", "open"]).optional(),
      locationValue: z.string().optional(),
      maxMembers: z.number().default(64),
      isPublic: z.boolean().default(true),
      entryFee: z.string().default("0"),
      pointsForWin: z.number().default(3),
      pointsForLoss: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(dragLeagues).values({
        commissionerId: input.commissionerId,
        name: input.name,
        description: input.description,
        rules: input.rules,
        vehicleClass: input.vehicleClass,
        raceType: input.raceType,
        locationType: input.locationType || "open",
        locationValue: input.locationValue,
        maxMembers: input.maxMembers,
        isPublic: input.isPublic,
        entryFee: input.entryFee,
        pointsForWin: input.pointsForWin,
        pointsForLoss: input.pointsForLoss,
      });
      return { id: result[0].insertId };
    }),

  getLeagues: publicProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragLeagues)
        .where(eq(dragLeagues.isPublic, true))
        .orderBy(desc(dragLeagues.createdAt))
        .limit(input.limit);
    }),

  joinLeague: protectedProcedure
    .input(z.object({ leagueId: z.number(), profileId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.insert(dragLeagueMembers).values({
        leagueId: input.leagueId,
        profileId: input.profileId,
      });
      // Increment member count
      await db.update(dragLeagues)
        .set({ memberCount: sql`${dragLeagues.memberCount} + 1` })
        .where(eq(dragLeagues.id, input.leagueId));
      return { success: true };
    }),

  getLeagueStandings: publicProcedure
    .input(z.object({ seasonId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragLeagueStandings)
        .where(eq(dragLeagueStandings.seasonId, input.seasonId))
        .orderBy(asc(dragLeagueStandings.rank));
    }),

  // ── Leaderboard ────────────────────────────────────────────────────────
  getLeaderboard: publicProcedure
    .input(z.object({
      category: z.string().default("quarter_et"),
      vehicleClass: z.string().default("open"),
      limit: z.number().default(25),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragLeaderboard)
        .where(and(
          eq(dragLeaderboard.category, input.category),
          eq(dragLeaderboard.vehicleClass, input.vehicleClass),
        ))
        .orderBy(asc(dragLeaderboard.bestValue))
        .limit(input.limit);
    }),

  // ── BTC Wallet ─────────────────────────────────────────────────────────
  addWallet: protectedProcedure
    .input(z.object({
      profileId: z.number(),
      walletType: z.enum(["btc", "btc_lightning", "usdc", "eth"]),
      walletAddress: z.string().min(1),
      label: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const result = await db.insert(dragWallets).values({
        profileId: input.profileId,
        walletType: input.walletType,
        walletAddress: input.walletAddress,
        label: input.label,
      });
      return { id: result[0].insertId };
    }),

  getWallets: protectedProcedure
    .input(z.object({ profileId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragWallets)
        .where(eq(dragWallets.profileId, input.profileId));
    }),

  // ── Subscription ───────────────────────────────────────────────────────
  getSubscription: protectedProcedure
    .input(z.object({ profileId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db.select().from(dragSubscriptions)
        .where(eq(dragSubscriptions.profileId, input.profileId));
      return rows[0] || null;
    }),

  // ── Tournaments ────────────────────────────────────────────────────────
  getTournaments: publicProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dragTournaments)
        .orderBy(desc(dragTournaments.createdAt))
        .limit(input.limit);
    }),
});
