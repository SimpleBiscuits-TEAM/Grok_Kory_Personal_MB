/**
 * Datalog Auto-Naming Router
 * 
 * Uses LLM to automatically generate descriptive names for recorded datalog sessions
 * based on the data content (e.g., "WOT Pull 3rd Gear 45psi Boost", "Highway Cruise 65mph Steady State").
 */

import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

export const datalogNamingRouter = router({
  /**
   * Auto-name a datalog session based on its summary statistics.
   * Accepts key metrics from the recorded session and returns a short descriptive name.
   */
  autoName: publicProcedure
    .input(
      z.object({
        durationSeconds: z.number(),
        sampleCount: z.number(),
        peakRpm: z.number().optional().default(0),
        peakBoostPsi: z.number().optional().default(0),
        peakSpeedMph: z.number().optional().default(0),
        avgRpm: z.number().optional().default(0),
        avgSpeedMph: z.number().optional().default(0),
        maxThrottle: z.number().optional().default(0),
        maxEgt: z.number().optional(),
        maxRailPressure: z.number().optional(),
        gearRange: z.string().optional(), // e.g., "1-4" or "3-5"
        hadWotEvent: z.boolean(),
        hadIdlePeriod: z.boolean(),
        vehicleInfo: z.string().optional(), // e.g., "2006 LBZ Duramax"
      })
    )
    .mutation(async ({ input }) => {
      const prompt = `You are a vehicle datalog naming assistant for a diesel performance tuning shop (PPEI).
Generate a SHORT, descriptive name for a datalog recording session based on these stats:

Duration: ${input.durationSeconds.toFixed(0)}s (${(input.durationSeconds / 60).toFixed(1)} min)
Samples: ${input.sampleCount}
Peak RPM: ${input.peakRpm.toFixed(0)}
Peak Boost: ${input.peakBoostPsi.toFixed(1)} PSI
Peak Speed: ${input.peakSpeedMph.toFixed(0)} MPH
Avg RPM: ${input.avgRpm.toFixed(0)}
Avg Speed: ${input.avgSpeedMph.toFixed(0)} MPH
Max Throttle: ${input.maxThrottle.toFixed(0)}%
${input.maxEgt ? `Max EGT: ${input.maxEgt.toFixed(0)}°F` : ''}
${input.maxRailPressure ? `Max Rail Pressure: ${input.maxRailPressure.toFixed(0)} PSI` : ''}
${input.gearRange ? `Gear Range: ${input.gearRange}` : ''}
WOT Event: ${input.hadWotEvent ? 'Yes' : 'No'}
Idle Period: ${input.hadIdlePeriod ? 'Yes' : 'No'}
${input.vehicleInfo ? `Vehicle: ${input.vehicleInfo}` : ''}

Rules:
- Name must be 3-8 words, no more
- Use tuning/racing terminology (WOT Pull, Highway Cruise, City Drive, Cold Start, Drag Run, Tow Pull, etc.)
- Include key data points (boost PSI, gear, speed) when relevant
- Examples: "WOT Pull 3rd Gear 42psi", "Highway Cruise 65mph Steady", "Cold Start to Operating Temp", "Drag Launch 1st-4th 48psi", "City Drive Mixed Conditions"
- Just return the name, nothing else`;

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: "You generate short descriptive names for vehicle datalog recordings. Return ONLY the name, no quotes, no explanation." },
            { role: "user", content: prompt },
          ],
        });

        const rawContent = response.choices?.[0]?.message?.content;
        const name = (typeof rawContent === 'string' ? rawContent.trim() : '') || generateFallbackName(input);
        return { name };
      } catch (err) {
        console.error("[DatalogNaming] LLM error:", err);
        return { name: generateFallbackName(input) };
      }
    }),
});

/** Fallback name generator when LLM is unavailable */
function generateFallbackName(input: {
  peakRpm: number;
  peakBoostPsi: number;
  peakSpeedMph: number;
  maxThrottle: number;
  hadWotEvent: boolean;
  durationSeconds: number;
}): string {
  const parts: string[] = [];

  if (input.hadWotEvent) {
    parts.push("WOT Pull");
    if (input.peakBoostPsi > 5) parts.push(`${input.peakBoostPsi.toFixed(0)}psi`);
  } else if (input.peakSpeedMph > 55) {
    parts.push("Highway Cruise");
    parts.push(`${input.peakSpeedMph.toFixed(0)}mph`);
  } else if (input.peakSpeedMph > 20) {
    parts.push("City Drive");
  } else if (input.peakRpm < 1000) {
    parts.push("Idle Session");
  } else {
    parts.push("Mixed Drive");
  }

  if (input.durationSeconds < 30) parts.push("Short");
  
  const date = new Date();
  parts.push(`${date.getMonth() + 1}/${date.getDate()}`);

  return parts.join(" ");
}
