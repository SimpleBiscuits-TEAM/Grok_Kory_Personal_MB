import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { fcaCalibrations } from "../../drizzle/schema";
import { like, eq, and, or, sql, desc, count, gte, lte, asc } from "drizzle-orm";

/**
 * FCA Calibration platform-code-to-vehicle mapping.
 * Maps the 2-letter FCA platform codes to human-readable vehicle names and makes.
 */
const PLATFORM_VEHICLE_MAP: Record<string, { make: string; model: string }> = {
  // Ram Trucks (consolidated)
  BR: { make: 'Ram', model: 'Ram 1500' },
  BE: { make: 'Ram', model: 'Ram 1500' },
  BT: { make: 'Ram', model: 'Ram 1500' },
  DR: { make: 'Ram', model: 'Ram 1500' },
  DS: { make: 'Ram', model: 'Ram 1500' },
  DT: { make: 'Ram', model: 'Ram 1500' },
  DJ: { make: 'Ram', model: 'Ram 2500' },
  D1: { make: 'Ram', model: 'Ram 3500' },
  D2: { make: 'Ram', model: 'Ram 3500' },
  DD: { make: 'Ram', model: 'Ram 3500 Cab Chassis' },
  DM: { make: 'Ram', model: 'Ram 4500/5500' },
  DP: { make: 'Ram', model: 'Ram 4500/5500' },
  DF: { make: 'Ram', model: 'Ram 3500' },
  DX: { make: 'Ram', model: 'Ram 2500' },
  // Dodge/Ram SUVs
  AN: { make: 'Dodge', model: 'Dakota' },
  ND: { make: 'Dodge', model: 'Dakota' },
  DN: { make: 'Dodge', model: 'Durango' },
  HB: { make: 'Dodge', model: 'Durango' },
  WD: { make: 'Dodge', model: 'Durango' },
  // Jeep (consolidated)
  WK: { make: 'Jeep', model: 'Grand Cherokee' },
  WL: { make: 'Jeep', model: 'Grand Cherokee' },
  WJ: { make: 'Jeep', model: 'Grand Cherokee' },
  WH: { make: 'Jeep', model: 'Grand Cherokee' },
  WS: { make: 'Jeep', model: 'Grand Cherokee' },
  W3: { make: 'Jeep', model: 'Grand Cherokee' },
  ZJ: { make: 'Jeep', model: 'Grand Cherokee' },
  ZG: { make: 'Jeep', model: 'Grand Cherokee' },
  JK: { make: 'Jeep', model: 'Wrangler' },
  JL: { make: 'Jeep', model: 'Wrangler' },
  TJ: { make: 'Jeep', model: 'Wrangler' },
  JT: { make: 'Jeep', model: 'Gladiator' },
  KL: { make: 'Jeep', model: 'Cherokee' },
  XJ: { make: 'Jeep', model: 'Cherokee' },
  KJ: { make: 'Jeep', model: 'Liberty' },
  KK: { make: 'Jeep', model: 'Liberty' },
  MK: { make: 'Jeep', model: 'Compass' },
  MP: { make: 'Jeep', model: 'Compass' },
  XK: { make: 'Jeep', model: 'Commander' },
  BU: { make: 'Jeep', model: 'Renegade' },
  // Chrysler (consolidated)
  LX: { make: 'Chrysler', model: '300' },
  LD: { make: 'Dodge', model: 'Charger' },
  LA: { make: 'Dodge', model: 'Charger' },
  LC: { make: 'Dodge', model: 'Challenger' },
  LH: { make: 'Chrysler', model: '300M/Concorde' },
  CS: { make: 'Chrysler', model: 'Pacifica' },
  RU: { make: 'Chrysler', model: 'Pacifica' },
  PF: { make: 'Chrysler', model: 'Pacifica' },
  // Dodge Cars
  JA: { make: 'Dodge', model: 'Stratus' },
  JR: { make: 'Dodge', model: 'Sebring' },
  JS: { make: 'Dodge', model: 'Avenger' },
  JX: { make: 'Chrysler', model: 'Sebring' },
  PL: { make: 'Dodge', model: 'Neon' },
  PT: { make: 'Chrysler', model: 'PT Cruiser' },
  SR: { make: 'Dodge', model: 'Viper' },
  FF: { make: 'Fiat', model: '500' },
  BV: { make: 'Fiat', model: '500X' },
  // Vans (consolidated)
  AB: { make: 'Dodge', model: 'Ram Van' },
  RT: { make: 'Dodge', model: 'Grand Caravan' },
  RS: { make: 'Dodge', model: 'Grand Caravan' },
  AS: { make: 'Dodge', model: 'Grand Caravan' },
  NS: { make: 'Dodge', model: 'Grand Caravan' },
  RG: { make: 'Chrysler', model: 'Voyager' },
  GS: { make: 'Chrysler', model: 'Voyager' },
  VF: { make: 'Ram', model: 'ProMaster' },
  VM: { make: 'Ram', model: 'ProMaster City' },
  JC: { make: 'Dodge', model: 'Journey' },
  // Alfa Romeo
  GA: { make: 'Alfa Romeo', model: 'Giulia' },
  GU: { make: 'Alfa Romeo', model: 'Stelvio' },
  // Classic
  AA: { make: 'Dodge', model: 'Spirit' },
  AC: { make: 'Chrysler', model: 'New Yorker' },
  AY: { make: 'Chrysler', model: 'Imperial' },
  AG: { make: 'Dodge', model: 'Daytona' },
  AP: { make: 'Dodge', model: 'Shadow' },
  KA: { make: 'Dodge', model: 'Nitro' },
  // Maserati
  M1: { make: 'Maserati', model: 'Levante' },
  M4: { make: 'Maserati', model: 'Ghibli' },
  M6: { make: 'Maserati', model: 'Quattroporte' },
  // Misc
  B1: { make: 'Fiat', model: '500L' },
  SK: { make: 'Jeep', model: 'Compass (SK)' },
};

/**
 * Extract the vehicle model name from a calibration description string.
 * Format: "2007 2008 2009 VB CR4 | D1 - RAM 3500 PICKUP"
 * Returns the part after the dash in the pipe section.
 */
function extractModelFromCalibration(calibration: string): string | null {
  const pipeIdx = calibration.indexOf('|');
  if (pipeIdx === -1) return null;
  const afterPipe = calibration.substring(pipeIdx + 1).trim();
  const dashIdx = afterPipe.indexOf('-');
  if (dashIdx === -1) return afterPipe.trim() || null;
  return afterPipe.substring(dashIdx + 1).trim() || null;
}

export const calibrationsRouter = router({
  /**
   * Search FCA calibrations with filters.
   * Supports: text search (calibration, part number), module type, year range, platform code, model.
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().optional(),
        moduleType: z.string().optional(),
        yearStart: z.number().optional(),
        yearEnd: z.number().optional(),
        platformCode: z.string().optional(),
        model: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { results: [], total: 0 };

      const conditions: any[] = [];

      if (input.query && input.query.trim()) {
        const q = `%${input.query.trim()}%`;
        conditions.push(
          or(
            like(fcaCalibrations.calibration, q),
            like(fcaCalibrations.newPartNumber, q),
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

      if (input.model) {
        conditions.push(like(fcaCalibrations.calibration, `%${input.model}%`));
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
   * Get distinct years available in the calibration database.
   * Returns a sorted list of all years that appear in any calibration record.
   */
  getYears: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const result = await db
      .select({
        minYear: sql<number>`MIN(${fcaCalibrations.yearStart})`,
        maxYear: sql<number>`MAX(${fcaCalibrations.yearEnd})`,
      })
      .from(fcaCalibrations)
      .where(sql`${fcaCalibrations.yearStart} IS NOT NULL`);

    const minYear = result[0]?.minYear || 1995;
    const maxYear = result[0]?.maxYear || 2026;

    // Generate array of years from max to min (newest first)
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      years.push(y);
    }
    return years;
  }),

  /**
   * Get distinct vehicle models available for a given year.
   * Extracts model names from calibration descriptions and platform code mapping.
   * Uses a two-pass approach:
   *   1. Extract explicit model names from pipe-delimited descriptions (e.g., "| WK - GRAND CHEROKEE")
   *   2. For records without explicit names, resolve via PLATFORM_VEHICLE_MAP fallback
   */
  getModelsForYear: publicProcedure
    .input(z.object({ year: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Find all calibrations that cover this year
      const results = await db
        .select({
          calibration: fcaCalibrations.calibration,
          platformCodes: fcaCalibrations.platformCodes,
        })
        .from(fcaCalibrations)
        .where(
          and(
            lte(fcaCalibrations.yearStart, input.year),
            gte(fcaCalibrations.yearEnd, input.year)
          )
        );

      // Build model map: model name -> { count, platformCodes }
      const modelMap = new Map<string, { model: string; count: number; platformCodes: Set<string> }>(); 

      // Normalize explicit model names to match platform-resolved canonical names
      const MODEL_ALIASES: Record<string, string> = {
        'RAM 3500 PICKUP': 'RAM 3500',
        'RAM 2500 PICKUP': 'RAM 2500',
        'RAM 1500 PICKUP': 'RAM 1500',
        '1500 PICKUP': 'RAM 1500',
        '1500 PICKUP (DT)': 'RAM 1500',
        '2500 PICKUP': 'RAM 2500',
        '3500 PICKUP': 'RAM 3500',
        '3500 CAB CHASSIS': 'RAM 3500 CAB CHASSIS',
        '4500/5500 CAB CHASSIS': 'RAM 4500/5500',
        'PACIFICA (RU)': 'PACIFICA',
        'PACIFICA (PF)': 'PACIFICA',
        'GRAND CHEROKEE (STEYR)': 'GRAND CHEROKEE',
        'GRAND CHEROKEE (WS)': 'GRAND CHEROKEE',
        'WRANGLER (TJ)': 'WRANGLER',
        '300 / MAGNUM / CHARGER': '300',
        '300/CHARGER': 'CHARGER',
        'COMPASS/PATRIOT': 'COMPASS',
        'COMPASS (SK)': 'COMPASS',
        'CARAVAN / TOWN & COUNTRY': 'GRAND CARAVAN',
        'CARAVAN/VOYAGER/T&C': 'GRAND CARAVAN',
        'CARAVAN': 'GRAND CARAVAN',
        'TOWN & COUNTRY': 'GRAND CARAVAN',
        'BREEZE/STRATUS/CIRRUS': 'STRATUS',
        'STRATUS/SEBRING': 'SEBRING',
        'AVENGER/SEBRING': 'AVENGER',
        '500L/500X': '500L',
        'INTREPID/CONCORDE/300M': '300M',
        'RAM VAN/WAGON': 'RAM VAN',
        'VOYAGER (GRAZ)': 'VOYAGER',
        'REG CAB CHASSIS (MEX)': 'RAM 3500 CAB CHASSIS',
        'PROMASTER CITY': 'PROMASTER CITY',
      };

      const addToMap = (modelName: string, platformCodes: string | null) => {
        let normalized = modelName.toUpperCase().trim();
        if (!normalized || normalized.length < 2) return;
        // Skip non-vehicle entries (technical suffixes, region codes, junk)
        if (/^(CUMMINSCOLD|CUMMINSNORM|EOBDOFF|LATAM|AGS|BE\d|BR\d|\d{4}\s+(MP|WK|DS|LD|LA|LC))/i.test(normalized)) return;
        // Skip entries that look like raw calibration descriptions (contain PCM/TCM/ECM with engine specs)
        if (/PCM\(|TCM\(|ECM\(|9HP|8HP|845RE|850RE/.test(normalized)) return;
        // Apply alias normalization
        normalized = MODEL_ALIASES[normalized] || normalized;

        const existing = modelMap.get(normalized);
        if (existing) {
          existing.count++;
          if (platformCodes) {
            platformCodes.split(',').forEach(pc => existing.platformCodes.add(pc.trim()));
          }
        } else {
          const pcSet = new Set<string>();
          if (platformCodes) {
            platformCodes.split(',').forEach(pc => pcSet.add(pc.trim()));
          }
          modelMap.set(normalized, { model: normalized, count: 1, platformCodes: pcSet });
        }
      };

      for (const row of results) {
        // Pass 1: Try explicit model name from pipe-delimited description
        const explicitModel = extractModelFromCalibration(row.calibration);
        if (explicitModel) {
          addToMap(explicitModel, row.platformCodes);
          continue;
        }

        // Pass 2: Fallback to platform code mapping
        if (row.platformCodes) {
          const codes = row.platformCodes.split(',').map(c => c.trim()).filter(Boolean);
          // Use the first platform code that maps to a known vehicle
          let resolved = false;
          for (const code of codes) {
            const vehicle = PLATFORM_VEHICLE_MAP[code];
            if (vehicle) {
              addToMap(vehicle.model, row.platformCodes);
              resolved = true;
              break;
            }
          }
          // If no platform code matched, try to extract model name from calibration text
          if (!resolved) {
            // Look for common model keywords in the calibration text
            const calText = row.calibration.toUpperCase();
            const modelKeywords = [
              'RAM 1500', 'RAM 2500', 'RAM 3500', 'RAM 4500', 'RAM 5500',
              'GRAND CHEROKEE', 'WRANGLER', 'GLADIATOR', 'CHEROKEE', 'COMPASS',
              'RENEGADE', 'CHARGER', 'CHALLENGER', 'DURANGO', 'PACIFICA',
              'CARAVAN', 'JOURNEY', 'DART', 'VIPER', 'PROMASTER',
              '300', 'PT CRUISER', 'TOWN & COUNTRY', 'DAKOTA',
            ];
            for (const kw of modelKeywords) {
              if (calText.includes(kw)) {
                addToMap(kw, row.platformCodes);
                resolved = true;
                break;
              }
            }
          }
        }
      }

      // Convert to array and sort by count
      return Array.from(modelMap.values())
        .map(m => ({
          model: m.model,
          count: m.count,
          platformCodes: Array.from(m.platformCodes).filter(Boolean),
        }))
        .sort((a, b) => b.count - a.count);
    }),

  /**
   * Search calibrations by year, model, and optional module type.
   * This is the primary "Search by Vehicle" endpoint.
   */
  searchByVehicle: publicProcedure
    .input(
      z.object({
        year: z.number(),
        model: z.string().optional(),
        platformCodes: z.array(z.string()).optional(),
        moduleType: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { results: [], total: 0 };

      const conditions: any[] = [
        lte(fcaCalibrations.yearStart, input.year),
        gte(fcaCalibrations.yearEnd, input.year),
      ];

      if (input.model) {
        // Build a combined condition: match model name in calibration text OR match any of the platform codes
        const modelConditions: any[] = [
          like(fcaCalibrations.calibration, `%${input.model}%`),
        ];

        // Also match by platform codes associated with this model
        if (input.platformCodes && input.platformCodes.length > 0) {
          const pcConditions = input.platformCodes.map(pc =>
            like(fcaCalibrations.platformCodes, `%${pc}%`)
          );
          modelConditions.push(...pcConditions);
        }

        conditions.push(or(...modelConditions));
      }

      if (input.moduleType) {
        conditions.push(eq(fcaCalibrations.moduleType, input.moduleType));
      }

      const where = and(...conditions);

      const [results, totalResult] = await Promise.all([
        db
          .select()
          .from(fcaCalibrations)
          .where(where)
          .orderBy(asc(fcaCalibrations.moduleType), desc(fcaCalibrations.id))
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
   * Get the platform-to-vehicle mapping for UI display.
   */
  platformMap: publicProcedure.query(() => {
    return PLATFORM_VEHICLE_MAP;
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
