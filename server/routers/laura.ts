/**
 * Laura — PPEI Weather AI Agent
 * 
 * Laura is the weather intelligence agent for the VOP ecosystem.
 * She is trained on:
 * - Historical weather patterns (tornado alley, hurricane seasons, pressure systems, fronts)
 * - Atmospheric science (SAE calculations, density altitude, dew point, wind chill, heat index)
 * - Storm chasing best practices (supercell identification, mesocyclone signatures, safe positioning)
 * - VOP sensor data interpretation (vehicle-reported conditions vs NWS data)
 * - Real-world vehicle performance under various atmospheric conditions
 * 
 * Storm chasers and weather enthusiasts can ask Laura about conditions,
 * get predictions, and receive atmospheric analysis.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { protectedProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { weatherReports, liveWeatherStreams } from "../../drizzle/schema";
import { desc, sql, gte } from "drizzle-orm";

const LAURA_SYSTEM_PROMPT = `You are Laura, the PPEI Weather AI Agent for the V-OP (Vehicle Optimizer by PPEI) ecosystem.

## Your Identity
You are a specialized weather intelligence agent. You combine deep atmospheric science knowledge with real-time vehicle sensor data from the VOP cloud network. You speak with authority on weather, atmospheric conditions, and how they affect vehicle performance — but you're approachable and practical, not academic.

## Your Knowledge Domains

### Historical Weather Patterns
- **Tornado Alley**: Central US corridor (Texas to South Dakota). Peak season April-June. Know the classic setup: dryline, warm moist air from Gulf, upper-level jet, wind shear profiles. Understand CAPE values, SRH, and significant tornado parameters.
- **Hurricane Seasons**: Atlantic (June 1 - Nov 30), Eastern Pacific (May 15 - Nov 30). Know Saffir-Simpson scale, storm surge mechanics, rapid intensification factors, and steering currents.
- **Pressure Systems**: High/low pressure mechanics, frontal boundaries (cold, warm, stationary, occluded), pressure tendency analysis, and how they affect local conditions.
- **Regional Climatology**: Know typical conditions for major US regions — Gulf Coast humidity, Mountain West altitude effects, Great Plains temperature swings, Pacific Northwest marine layer.
- **Seasonal Patterns**: Understand how jet stream position, El Niño/La Niña, and seasonal transitions affect weather patterns.

### Atmospheric Science
- **SAE J1349 Correction Factor**: CF = (29.235 / Pd) × √((T + 460) / 545.4) where Pd = dry air pressure. Know that this corrects dynamometer readings to standard conditions. Explain what CF values mean for performance (CF > 1.0 = favorable, < 1.0 = unfavorable).
- **Density Altitude**: DA = PA + (120 × (OAT - ISA_temp)). Critical for performance — higher DA = less dense air = less power. Explain in practical terms: "At 5000ft density altitude, your engine makes roughly 15% less power than at sea level."
- **Dew Point**: Magnus formula. Explain comfort levels and engine intake implications. Dew point > 65°F = muggy, > 70°F = oppressive.
- **Air Density**: ρ = P / (R × T). Directly affects combustion efficiency, turbo performance, and naturally aspirated power output.
- **Wind Chill & Heat Index**: Know the formulas and practical implications for both humans and vehicles (cooling system load, intake temps).
- **Barometric Pressure**: Standard is 29.92 inHg at sea level. Know how to correct for altitude. Understand pressure altitude vs density altitude.

### Storm Chasing
- **Supercell Identification**: Know the visual cues — wall cloud, rotating updraft base, inflow bands, flanking line, anvil overshoot. Understand radar signatures (hook echo, BWER, mesocyclone).
- **Safe Positioning**: Always stay south/southeast of a storm. Maintain escape routes. Know the "bear's cage" danger. Never core-punch. Understand right-moving vs left-moving supercells.
- **Chase Equipment**: Understand how VOP-equipped vehicles serve as mobile mesonets. Vehicle sensors provide ground-truth data that supplements radar and satellite.
- **Communication**: Know NWS terminology, storm reports (LSR), and SPC products (outlooks, watches, warnings).

### VOP Sensor Data
- **Vehicle as Weather Station**: VOP-connected vehicles report: temperature (IAT sensor, corrected), barometric pressure (MAP sensor at idle/key-on), humidity (if equipped), altitude (GPS + baro), and GPS position.
- **Data Quality**: Explain that vehicle sensors are calibrated for engine management, not meteorology — but they provide excellent relative measurements and ground-truth data that fills gaps between official weather stations.
- **Network Effect**: More vehicles = better coverage. The VOP weather network provides real-time atmospheric data from areas where no weather stations exist.

### Vehicle Performance & Weather
- **Turbocharged Engines**: Denser air = more oxygen = more power. Cold, high-pressure days are best. Explain how intercooler efficiency varies with ambient temp.
- **Naturally Aspirated**: Even more sensitive to air density than turbocharged engines.
- **Diesel Specifics**: Know how altitude and temperature affect diesel combustion, turbo spool, and EGT management.
- **Dyno Corrections**: Explain why SAE J1349 exists — to normalize dyno results across different atmospheric conditions so runs can be fairly compared.

## Your Behavior
- Be direct and practical. Storm chasers need quick, actionable information.
- When discussing conditions, always relate them to practical implications (vehicle performance, safety, comfort).
- If you have VOP network data available, reference it. If not, explain what data would be helpful.
- For storm chasing questions, always emphasize safety first.
- Use proper units: °F for temperature (this is a US-focused vehicle community), inHg for pressure, mph for wind.
- When calculating SAE correction factors, show your work so users understand the math.
- You can analyze trends in VOP weather data and provide insights about how conditions are changing.
- Reference the VOP cloud network as a data source — "Based on reports from VOP-connected vehicles in your area..."

## Current VOP Network Context
You will receive current network statistics and recent weather reports as context. Use this data to provide specific, data-driven answers rather than generic weather information.`;

export const lauraRouter = router({
  /**
   * Chat with Laura — the weather AI agent.
   * Injects current VOP weather network data as context.
   */
  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(4000),
      conversationHistory: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).max(50).optional(),
      // Optional location context for area-specific answers
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
    }))
    .mutation(async ({ input }) => {
      // Gather current VOP network context
      let networkContext = "";
      try {
        const db = (await getDb())!;
        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Get network stats
        const [stats] = await db.select({
          totalReports: sql<number>`COUNT(*)`,
          totalVehicles: sql<number>`COUNT(DISTINCT vehicleId)`,
          avgTempF: sql<string>`AVG(CAST(temperatureF AS DECIMAL(6,2)))`,
          avgBaroInHg: sql<string>`AVG(CAST(baroPressureInHg AS DECIMAL(6,3)))`,
          avgHumidity: sql<string>`AVG(CAST(humidityPct AS DECIMAL(5,2)))`,
        }).from(weatherReports).where(gte(weatherReports.measuredAt, cutoff24h));

        // Get recent reports (last 10)
        const recentReports = await db.select({
          city: weatherReports.city,
          state: weatherReports.state,
          temperatureF: weatherReports.temperatureF,
          baroPressureInHg: weatherReports.baroPressureInHg,
          humidityPct: weatherReports.humidityPct,
          saeCorrectionFactor: weatherReports.saeCorrectionFactor,
          densityAltitudeFt: weatherReports.densityAltitudeFt,
          measuredAt: weatherReports.measuredAt,
        }).from(weatherReports)
          .orderBy(desc(weatherReports.measuredAt))
          .limit(10);

        // Get active streams
        const [streamStats] = await db.select({
          liveCount: sql<number>`COUNT(*)`,
        }).from(liveWeatherStreams)
          .where(sql`status = 'live'`);

        networkContext = `\n\n## Current VOP Weather Network Status (last 24h)
- Total reports: ${stats?.totalReports ?? 0}
- Unique vehicles reporting: ${stats?.totalVehicles ?? 0}
- Network avg temperature: ${stats?.avgTempF ? parseFloat(stats.avgTempF).toFixed(1) + '°F' : 'No data'}
- Network avg barometric pressure: ${stats?.avgBaroInHg ? parseFloat(stats.avgBaroInHg).toFixed(3) + ' inHg' : 'No data'}
- Network avg humidity: ${stats?.avgHumidity ? parseFloat(stats.avgHumidity).toFixed(1) + '%' : 'No data'}
- Active live streams: ${streamStats?.liveCount ?? 0}

## Recent Vehicle Weather Reports:
${recentReports.length > 0 ? recentReports.map(r =>
          `- ${r.city || 'Unknown'}, ${r.state || '??'}: ${r.temperatureF}°F, ${r.baroPressureInHg} inHg, ${r.humidityPct ?? 'N/A'}% humidity, SAE CF: ${r.saeCorrectionFactor}, DA: ${r.densityAltitudeFt}ft (${r.measuredAt ? new Date(r.measuredAt).toLocaleString() : 'unknown time'})`
        ).join('\n') : 'No recent reports available.'}`;
      } catch (e) {
        networkContext = "\n\n## VOP Network: No data currently available.";
      }

      // Build messages
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: LAURA_SYSTEM_PROMPT + networkContext },
      ];

      // Add conversation history
      if (input.conversationHistory) {
        for (const msg of input.conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Add location context if provided
      let userMessage = input.message;
      if (input.latitude != null && input.longitude != null) {
        userMessage += `\n\n[User's current location: ${input.latitude.toFixed(4)}°N, ${input.longitude.toFixed(4)}°W]`;
      }
      messages.push({ role: "user", content: userMessage });

      const response = await invokeLLM({ messages });

      return {
        reply: response.choices[0]?.message?.content ?? "I'm sorry, I couldn't process that request. Please try again.",
        model: "laura-wx-v1",
      };
    }),

  /**
   * Get Laura's quick analysis of current conditions.
   * No conversation needed — just a snapshot analysis.
   */
  quickAnalysis: publicProcedure
    .input(z.object({
      temperatureF: z.number().optional(),
      baroPressureInHg: z.number().optional(),
      humidityPct: z.number().optional(),
      altitudeFt: z.number().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }))
    .query(async ({ input }) => {
      if (!input.temperatureF || !input.baroPressureInHg) {
        return { analysis: "Provide temperature and barometric pressure for a quick analysis." };
      }

      const tempF = input.temperatureF;
      const baroInHg = input.baroPressureInHg;
      const humidity = input.humidityPct ?? 0;
      const altFt = input.altitudeFt ?? 0;

      // Calculate derived values
      const tempC = (tempF - 32) * 5 / 9;
      const satVaporPressureMb = 6.1078 * Math.pow(10, (7.5 * tempC) / (237.3 + tempC));
      const vaporPressureInHg = (satVaporPressureMb * (humidity / 100)) / 33.8639;
      const dryAirPressure = baroInHg - vaporPressureInHg;
      const saeCF = Math.round((29.235 / dryAirPressure) * Math.sqrt((tempF + 460) / 545.4) * 10000) / 10000;
      const isaTemp = 15 - (2 * altFt / 1000);
      const densityAlt = Math.round(altFt + 120 * (tempC - isaTemp));
      const pressurePa = baroInHg * 3386.39;
      const tempK = tempC + 273.15;
      const airDensity = Math.round((pressurePa / (287.058 * tempK)) * 0.062428 * 1000000) / 1000000;

      // Build analysis
      let performanceRating = "";
      if (saeCF > 1.02) performanceRating = "Excellent conditions for power — cold, dense air.";
      else if (saeCF > 1.005) performanceRating = "Good conditions — slightly above standard.";
      else if (saeCF > 0.995) performanceRating = "Near-standard conditions.";
      else if (saeCF > 0.98) performanceRating = "Slightly below standard — warm or low pressure.";
      else performanceRating = "Poor conditions for power — hot, thin air.";

      let stormRisk = "Low";
      if (humidity > 70 && tempF > 75 && baroInHg < 29.8) stormRisk = "Moderate — warm, humid, low pressure";
      if (humidity > 80 && tempF > 80 && baroInHg < 29.6) stormRisk = "Elevated — conditions favor convection";

      return {
        analysis: performanceRating,
        conditions: {
          temperatureF: tempF,
          baroPressureInHg: baroInHg,
          humidityPct: humidity,
          altitudeFt: altFt,
        },
        derived: {
          saeCorrectionFactor: saeCF,
          densityAltitudeFt: densityAlt,
          airDensityLbFt3: airDensity,
          dryAirPressureInHg: Math.round(dryAirPressure * 1000) / 1000,
        },
        performance: performanceRating,
        stormRisk,
      };
    }),
});
