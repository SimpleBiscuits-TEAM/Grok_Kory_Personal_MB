/**
 * Weather Router — Vehicle-Reported Atmospheric Data
 * 
 * Vehicles with VOP plugged in report atmospheric conditions from onboard sensors.
 * Reports are aggregated into virtual weather stations for area-wide conditions.
 * This data feeds the SAE J1349 correction factor for dyno competitions.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { weatherReports, weatherStations } from "../../drizzle/schema";
import { desc, eq, sql, and, gte, lte } from "drizzle-orm";

/**
 * SAE J1349 correction factor calculation.
 * CF = (29.235 / Pd) × ((T + 460) / 545.4)^0.5
 * where Pd = dry air pressure (inHg) and T = temperature (°F)
 * Pd = barometric pressure - vapor pressure
 * Vapor pressure estimated from humidity and temperature
 */
function calculateSaeCorrectionFactor(
  tempF: number,
  baroInHg: number,
  humidityPct: number | null
): number {
  const humidity = humidityPct ?? 0;
  // Magnus formula for saturation vapor pressure
  const tempC = (tempF - 32) * 5 / 9;
  const satVaporPressureMb = 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
  const vaporPressureInHg = (satVaporPressureMb * (humidity / 100)) / 33.8639;
  const dryAirPressure = baroInHg - vaporPressureInHg;
  // SAE J1349 formula
  const cf = (29.235 / dryAirPressure) * Math.sqrt((tempF + 460) / 545.4);
  return Math.round(cf * 10000) / 10000;
}

/**
 * Calculate density altitude from pressure altitude and temperature.
 * DA = PA + (120 × (OAT - ISA_temp))
 * where ISA_temp = 15 - (2 × PA/1000) in °C
 */
function calculateDensityAltitude(altitudeFt: number, tempF: number): number {
  const tempC = (tempF - 32) * 5 / 9;
  const isaTemp = 15 - (2 * altitudeFt / 1000);
  return Math.round(altitudeFt + 120 * (tempC - isaTemp));
}

/**
 * Calculate air density in lb/ft³
 * ρ = P / (R × T) where P in Pa, R = 287.058, T in K
 */
function calculateAirDensity(baroInHg: number, tempF: number): number {
  const pressurePa = baroInHg * 3386.39;
  const tempK = (tempF - 32) * 5 / 9 + 273.15;
  const densityKgM3 = pressurePa / (287.058 * tempK);
  const densityLbFt3 = densityKgM3 * 0.062428;
  return Math.round(densityLbFt3 * 1000000) / 1000000;
}

/**
 * Calculate dew point from temperature and humidity
 * Using Magnus formula
 */
function calculateDewPoint(tempF: number, humidityPct: number): number {
  const tempC = (tempF - 32) * 5 / 9;
  const a = 17.27;
  const b = 237.7;
  const gamma = (a * tempC) / (b + tempC) + Math.log(humidityPct / 100);
  const dewPointC = (b * gamma) / (a - gamma);
  return Math.round((dewPointC * 9 / 5 + 32) * 100) / 100;
}

export const weatherRouter = router({
  /**
   * Submit a weather report from a vehicle's sensors.
   * Calculates derived values (SAE CF, density altitude, air density, dew point).
   */
  submitReport: protectedProcedure
    .input(z.object({
      vehicleId: z.string().max(64).optional(),
      vehicleName: z.string().max(128).optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      city: z.string().max(128).optional(),
      state: z.string().max(64).optional(),
      country: z.string().max(64).optional(),
      temperatureF: z.number().min(-60).max(160),
      baroPressureInHg: z.number().min(20).max(35),
      humidityPct: z.number().min(0).max(100).optional(),
      altitudeFt: z.number().min(-1500).max(30000).optional(),
      sensorSource: z.enum(["obd2", "j1939", "kline", "manual"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tempC = Math.round((input.temperatureF - 32) * 5 / 9 * 100) / 100;
      const baroKpa = Math.round(input.baroPressureInHg * 3.38639 * 100) / 100;
      const saeCF = calculateSaeCorrectionFactor(input.temperatureF, input.baroPressureInHg, input.humidityPct ?? null);
      const altFt = input.altitudeFt ?? 0;
      const densityAlt = calculateDensityAltitude(altFt, input.temperatureF);
      const airDensity = calculateAirDensity(input.baroPressureInHg, input.temperatureF);
      const dewPoint = input.humidityPct ? calculateDewPoint(input.temperatureF, input.humidityPct) : null;

      const [result] = await (await getDb())!.insert(weatherReports).values({
        userId: ctx.user.id,
        vehicleId: input.vehicleId ?? null,
        vehicleName: input.vehicleName ?? null,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
        temperatureF: String(input.temperatureF),
        temperatureC: String(tempC),
        baroPressureInHg: String(input.baroPressureInHg),
        baroPressureKpa: String(baroKpa),
        humidityPct: input.humidityPct != null ? String(input.humidityPct) : null,
        altitudeFt: input.altitudeFt != null ? String(altFt) : null,
        dewPointF: dewPoint != null ? String(dewPoint) : null,
        densityAltitudeFt: String(densityAlt),
        airDensityLbFt3: String(airDensity),
        saeCorrectionFactor: String(saeCF),
        sensorSource: input.sensorSource ?? "obd2",
        qualityScore: 100,
        measuredAt: new Date(),
      });

      return {
        success: true,
        id: result.insertId,
        derived: {
          temperatureC: tempC,
          baroPressureKpa: baroKpa,
          saeCorrectionFactor: saeCF,
          densityAltitudeFt: densityAlt,
          airDensityLbFt3: airDensity,
          dewPointF: dewPoint,
        },
      };
    }),

  /**
   * Get recent weather reports, optionally filtered by area.
   */
  getReports: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      radiusMiles: z.number().min(1).max(500).default(50),
      hoursBack: z.number().min(1).max(168).default(24), // max 7 days
    }))
    .query(async ({ input }) => {
      const cutoff = new Date(Date.now() - input.hoursBack * 60 * 60 * 1000);

      if (input.latitude != null && input.longitude != null) {
        // Haversine-based area filter (approximate, using SQL)
        const lat = input.latitude;
        const lng = input.longitude;
        const radiusDeg = input.radiusMiles / 69; // rough conversion

        const reports = await (await getDb())!.select()
          .from(weatherReports)
          .where(and(
            gte(weatherReports.measuredAt, cutoff),
            gte(weatherReports.latitude, String(lat - radiusDeg)),
            lte(weatherReports.latitude, String(lat + radiusDeg)),
            gte(weatherReports.longitude, String(lng - radiusDeg)),
            lte(weatherReports.longitude, String(lng + radiusDeg)),
          ))
          .orderBy(desc(weatherReports.measuredAt))
          .limit(input.limit);

        return reports;
      }

      // No location filter — return most recent
      const reports = await (await getDb())!.select()
        .from(weatherReports)
        .where(gte(weatherReports.measuredAt, cutoff))
        .orderBy(desc(weatherReports.measuredAt))
        .limit(input.limit);

      return reports;
    }),

  /**
   * Get aggregated conditions for an area (virtual weather station).
   * Averages all vehicle reports within the radius over the time window.
   */
  getAreaConditions: publicProcedure
    .input(z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusMiles: z.number().min(1).max(500).default(25),
      hoursBack: z.number().min(1).max(168).default(6),
    }))
    .query(async ({ input }) => {
      const cutoff = new Date(Date.now() - input.hoursBack * 60 * 60 * 1000);
      const radiusDeg = input.radiusMiles / 69;

      const [result] = await (await getDb())!.select({
        avgTempF: sql<string>`AVG(CAST(temperatureF AS DECIMAL(6,2)))`,
        avgBaroInHg: sql<string>`AVG(CAST(baroPressureInHg AS DECIMAL(6,3)))`,
        avgHumidity: sql<string>`AVG(CAST(humidityPct AS DECIMAL(5,2)))`,
        avgAltitude: sql<string>`AVG(CAST(altitudeFt AS DECIMAL(8,1)))`,
        avgDensityAlt: sql<string>`AVG(CAST(densityAltitudeFt AS DECIMAL(8,1)))`,
        avgAirDensity: sql<string>`AVG(CAST(airDensityLbFt3 AS DECIMAL(8,6)))`,
        avgSaeCF: sql<string>`AVG(CAST(saeCorrectionFactor AS DECIMAL(6,4)))`,
        reportCount: sql<number>`COUNT(*)`,
        vehicleCount: sql<number>`COUNT(DISTINCT vehicleId)`,
        latestReport: sql<Date>`MAX(measuredAt)`,
      })
        .from(weatherReports)
        .where(and(
          gte(weatherReports.measuredAt, cutoff),
          gte(weatherReports.latitude, String(input.latitude - radiusDeg)),
          lte(weatherReports.latitude, String(input.latitude + radiusDeg)),
          gte(weatherReports.longitude, String(input.longitude - radiusDeg)),
          lte(weatherReports.longitude, String(input.longitude + radiusDeg)),
        ));

      if (!result || result.reportCount === 0) {
        return {
          hasData: false,
          reportCount: 0,
          vehicleCount: 0,
        } as const;
      }

      const avgTempF = parseFloat(result.avgTempF ?? "0");
      const avgBaroInHg = parseFloat(result.avgBaroInHg ?? "0");
      const avgHumidity = result.avgHumidity ? parseFloat(result.avgHumidity) : null;

      return {
        hasData: true,
        avgTemperatureF: Math.round(avgTempF * 100) / 100,
        avgBaroPressureInHg: Math.round(avgBaroInHg * 1000) / 1000,
        avgHumidityPct: avgHumidity ? Math.round(avgHumidity * 100) / 100 : null,
        avgAltitudeFt: result.avgAltitude ? Math.round(parseFloat(result.avgAltitude)) : null,
        avgDensityAltitudeFt: result.avgDensityAlt ? Math.round(parseFloat(result.avgDensityAlt)) : null,
        avgAirDensityLbFt3: result.avgAirDensity ? parseFloat(result.avgAirDensity) : null,
        avgSaeCorrectionFactor: result.avgSaeCF ? Math.round(parseFloat(result.avgSaeCF) * 10000) / 10000 : null,
        reportCount: result.reportCount,
        vehicleCount: result.vehicleCount,
        latestReport: result.latestReport,
      } as const;
    }),

  /**
   * Get all weather stations (aggregated areas).
   */
  getStations: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return (await getDb())!.select()
        .from(weatherStations)
        .orderBy(desc(weatherStations.updatedAt))
        .limit(input.limit);
    }),

  /**
   * Calculate SAE J1349 correction factor from given conditions.
   * Utility endpoint for manual calculations.
   */
  calculateSaeCorrection: publicProcedure
    .input(z.object({
      temperatureF: z.number().min(-60).max(160),
      baroPressureInHg: z.number().min(20).max(35),
      humidityPct: z.number().min(0).max(100).optional(),
    }))
    .query(({ input }) => {
      const cf = calculateSaeCorrectionFactor(input.temperatureF, input.baroPressureInHg, input.humidityPct ?? null);
      const altFt = 0; // sea level default for manual calc
      const densityAlt = calculateDensityAltitude(altFt, input.temperatureF);
      const airDensity = calculateAirDensity(input.baroPressureInHg, input.temperatureF);
      const dewPoint = input.humidityPct ? calculateDewPoint(input.temperatureF, input.humidityPct) : null;

      return {
        saeCorrectionFactor: cf,
        densityAltitudeFt: densityAlt,
        airDensityLbFt3: airDensity,
        dewPointF: dewPoint,
        // Standard conditions for reference
        standard: {
          temperatureF: 77,
          baroPressureInHg: 29.235,
          humidityPct: 0,
          saeCorrectionFactor: 1.0,
        },
      };
    }),

  /**
   * Get global stats for the weather network.
   */
  getNetworkStats: publicProcedure.query(async () => {
    const [stats] = await (await getDb())!.select({
      totalReports: sql<number>`COUNT(*)`,
      totalVehicles: sql<number>`COUNT(DISTINCT vehicleId)`,
      totalUsers: sql<number>`COUNT(DISTINCT userId)`,
      reportsLast24h: sql<number>`SUM(CASE WHEN measuredAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END)`,
      reportsLast7d: sql<number>`SUM(CASE WHEN measuredAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END)`,
      statesReported: sql<number>`COUNT(DISTINCT state)`,
    }).from(weatherReports);

    return {
      totalReports: stats?.totalReports ?? 0,
      totalVehicles: stats?.totalVehicles ?? 0,
      totalUsers: stats?.totalUsers ?? 0,
      reportsLast24h: stats?.reportsLast24h ?? 0,
      reportsLast7d: stats?.reportsLast7d ?? 0,
      statesReported: stats?.statesReported ?? 0,
    };
  }),
});
