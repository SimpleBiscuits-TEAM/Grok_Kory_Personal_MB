import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { fcaCalibrations } from "../../drizzle/schema";
import { like, eq, and, or, sql, desc, count, gte, lte } from "drizzle-orm";

export const calibrationsRouter = router({
  /**
   * Search FCA calibrations with filters.
   * Supports: text search (calibration, part number), module type, year range, platform code.
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().optional(),
        moduleType: z.string().optional(),
        yearStart: z.number().optional(),
        yearEnd: z.number().optional(),
        platformCode: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { results: [], total: 0, filters: { moduleTypes: [], yearRange: { min: 0, max: 0 } } };

      const conditions: any[] = [];

      if (input.query && input.query.trim()) {
        const q = `%${input.query.trim()}%`;
        conditions.push(
          or(
            like(fcaCalibrations.calibration, q),
            like(fcaCalibrations.newPartNumber, q),
            // Search in old part numbers JSON
            sql`JSON_SEARCH(${fcaCalibrations.oldPartNumbers}, 'one', ${input.query.trim()}) IS NOT NULL`
          )
        );
      }

      if (input.moduleType) {
        conditions.push(eq(fcaCalibrations.moduleType, input.moduleType));
      }

      if (input.yearStart) {
        conditions.push(gte(fcaCalibrations.yearEnd, input.yearStart));
      }

      if (input.yearEnd) {
        conditions.push(lte(fcaCalibrations.yearStart, input.yearEnd));
      }

      if (input.platformCode) {
        conditions.push(like(fcaCalibrations.platformCodes, `%${input.platformCode}%`));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [results, totalResult] = await Promise.all([
        db
          .select()
          .from(fcaCalibrations)
          .where(where)
          .orderBy(desc(fcaCalibrations.id))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ cnt: count() }).from(fcaCalibrations).where(where),
      ]);

      return {
        results,
        total: totalResult[0]?.cnt || 0,
      };
    }),

  /**
   * Get a single calibration by ID.
   */
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const result = await db
        .select()
        .from(fcaCalibrations)
        .where(eq(fcaCalibrations.id, input.id))
        .limit(1);
      return result[0] || null;
    }),

  /**
   * Look up a specific part number to find its supersession chain.
   * Returns the calibration record that contains this part number
   * (either as the new part number or in old part numbers).
   */
  lookupPartNumber: publicProcedure
    .input(z.object({ partNumber: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const pn = input.partNumber.trim();
      if (!pn) return [];

      const results = await db
        .select()
        .from(fcaCalibrations)
        .where(
          or(
            eq(fcaCalibrations.newPartNumber, pn),
            sql`JSON_SEARCH(${fcaCalibrations.oldPartNumbers}, 'one', ${pn}) IS NOT NULL`
          )
        )
        .limit(20);

      return results;
    }),

  /**
   * Get available filter options (module types, year range).
   */
  filterOptions: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { moduleTypes: [], yearRange: { min: 0, max: 0 }, totalRecords: 0 };

    const [moduleTypes, yearRange, totalResult] = await Promise.all([
      db
        .select({
          moduleType: fcaCalibrations.moduleType,
          cnt: count(),
        })
        .from(fcaCalibrations)
        .groupBy(fcaCalibrations.moduleType)
        .orderBy(desc(count())),
      db
        .select({
          minYear: sql<number>`MIN(${fcaCalibrations.yearStart})`,
          maxYear: sql<number>`MAX(${fcaCalibrations.yearEnd})`,
        })
        .from(fcaCalibrations),
      db.select({ cnt: count() }).from(fcaCalibrations),
    ]);

    return {
      moduleTypes: moduleTypes.map((m) => ({ type: m.moduleType, count: m.cnt })),
      yearRange: {
        min: yearRange[0]?.minYear || 0,
        max: yearRange[0]?.maxYear || 0,
      },
      totalRecords: totalResult[0]?.cnt || 0,
    };
  }),

  /**
   * Get statistics about the calibration database.
   */
  stats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const [total, moduleTypes, topPlatforms] = await Promise.all([
      db.select({ cnt: count() }).from(fcaCalibrations),
      db
        .select({ type: fcaCalibrations.moduleType, cnt: count() })
        .from(fcaCalibrations)
        .groupBy(fcaCalibrations.moduleType)
        .orderBy(desc(count()))
        .limit(10),
      db
        .select({
          platform: fcaCalibrations.platformCodes,
          cnt: count(),
        })
        .from(fcaCalibrations)
        .where(sql`${fcaCalibrations.platformCodes} IS NOT NULL`)
        .groupBy(fcaCalibrations.platformCodes)
        .orderBy(desc(count()))
        .limit(20),
    ]);

    return {
      totalCalibrations: total[0]?.cnt || 0,
      moduleTypes: moduleTypes.map((m) => ({ type: m.type, count: m.cnt })),
      topPlatforms: topPlatforms.map((p) => ({ platform: p.platform, count: p.cnt })),
    };
  }),
});
