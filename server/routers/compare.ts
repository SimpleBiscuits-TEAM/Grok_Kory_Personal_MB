import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { queryKnox, type AccessLevel } from "../lib/knoxReconciler";

/**
 * Compare Router — LLM-powered datalog comparison analysis.
 * Takes a structured comparison summary + optional user context
 * and generates intelligent commentary about tune changes.
 */

function buildCompareSystemPrompt(): string {
  return [
    `You are the V-OP Performance Comparison Analyst by PPEI, an expert at evaluating tune changes on diesel engines, gas engines, and powersports platforms.`,
    `You are analyzing a side-by-side comparison of two datalogs from the same (or similar) vehicle.`,
    ``,
    `Your job:`,
    `- Identify the most significant changes between the two logs`,
    `- Explain what the changes mean for performance, efficiency, and reliability`,
    `- If the user described what they changed (tune revision, turbo swap, injectors, etc.), evaluate whether the data supports the expected outcome`,
    `- Flag any concerns: higher EGTs, excessive pulse width, rail pressure deviation, TCC slip issues`,
    `- Note if one log appears to be in regen/non-normal combustion mode (timing -20° to -7°)`,
    `- Compare timing strategy, fuel delivery, boost control, and drivetrain behavior`,
    ``,
    `Key domain knowledge:`,
    `- Piezo injectors (L5P, LML) have ~800μs shutoff delay; needle bottoms out at 1400-1600μs`,
    `- At 2500μs+ pulse width, timing should be 27°+ to efficiently burn the fuel`,
    `- Negative timing (-20° to -7°) = regen mode, 80+ HP loss`,
    `- High pulse width is hard on pistons (wide spray patterns), not the injectors themselves`,
    `- Rail pressure deviation = actual vs desired gap; watch for PCV saturation`,
    `- TCC slip > 100 RPM sustained = potential converter issue`,
    ``,
    `MAF & Intake Tube Knowledge (CRITICAL):`,
    `- OEM intake tubes have a baffle/venturi that narrows the cross-section before the MAF sensor, accelerating air past the heated element for accurate metering`,
    `- When the baffle is removed or a larger-diameter intake tube is installed, the pre-MAF area increases, air velocity drops, and the MAF sensor under-reads`,
    `- The MAF sensor measures air VELOCITY across its element, not total mass directly — larger tube = lower velocity for same mass flow = lower reading`,
    `- MAF under-reading causes the smoke limiter to engage prematurely (it caps IQ based on reported air mass), making the vehicle MAF-limited/smoke-limited`,
    `- Symptoms: lower peak MAF than expected, reduced HP, poor throttle response, smoke limiter engaging early, flat feeling at low RPM`,
    `- The fix is a MAF scaling tune revision — recalibrate the MAF transfer function (voltage-to-airflow table) to match the new tube geometry`,
    `- Do NOT diagnose low MAF with a larger tube as a sensor fault — it is expected physics from the larger cross-sectional area`,
    `- Many intake companies (S&B, Banks, AFE) intentionally keep stock MAF tube diameter so no tune revision is needed — "no-tune-required" bolt-on`,
    `- When comparing two logs where one has lower MAF: consider intake modifications (baffle out, larger tube) BEFORE assuming sensor failure or turbo issues`,
    `- If boost is building normally but MAF is low, the sensor is under-reading, not an actual airflow problem`,
    ``,
    `Format your response as a structured analysis with these sections:`,
    `## Summary`,
    `Brief 2-3 sentence overview of the key differences.`,
    ``,
    `## Power & Efficiency`,
    `HP/torque changes, MAF flow, fuel quantity analysis.`,
    ``,
    `## Fuel System`,
    `Rail pressure, pulse width, timing strategy comparison.`,
    ``,
    `## Turbo & Boost`,
    `Boost levels, vane position, response characteristics.`,
    ``,
    `## Drivetrain`,
    `TCC behavior, converter slip, gear behavior if applicable.`,
    ``,
    `## Thermal`,
    `EGT, coolant, oil temp, intake air temp changes.`,
    ``,
    `## Calibrator Notes`,
    `Actionable insights for the tuner — what to adjust next, what looks good, what to watch.`,
    ``,
    `Use markdown formatting. Be direct and technical. Reference specific numbers from the data.`,
    `If PIDs are missing from one log, note it but work with what's available.`,
  ].join('\n');
}

export const compareRouter = router({
  /**
   * Generate an AI-powered comparison analysis from structured comparison data.
   */
  analyze: protectedProcedure
    .input(
      z.object({
        comparisonContext: z.string().max(50000),
        userContext: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { comparisonContext, userContext } = input;
      const userAccessLevel = (ctx.user?.accessLevel || 0) as AccessLevel;
      const effectiveLevel: AccessLevel = userAccessLevel >= 3 ? 3 : userAccessLevel >= 2 ? 2 : 1;

      const question = userContext
        ? `Comparison analysis — user says: "${userContext}"\n\nDoes the data support the expected outcome?`
        : `Analyze this datalog comparison and identify key differences, implications, and concerns.`;

      // Try quad-agent pipeline first
      try {
        const knoxResult = await queryKnox({
          question,
          accessLevel: effectiveLevel,
          domain: 'diagnostics',
          moduleContext: comparisonContext.slice(0, 20000),
        });
        return { analysis: knoxResult.answer, usage: null, pipeline: knoxResult.pipeline, confidence: knoxResult.confidence };
      } catch {
        // Fallback
      }

      const userMessage = userContext
        ? `Here is the comparison data:\n\n${comparisonContext}\n\nThe user described the following changes between tests:\n"${userContext}"\n\nPlease analyze the comparison and evaluate whether the data supports the expected outcome of those changes.`
        : `Here is the comparison data:\n\n${comparisonContext}\n\nPlease analyze the comparison and identify the key differences, their implications, and any concerns.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: buildCompareSystemPrompt() },
            { role: "user", content: userMessage },
          ],
        });

        const content = result.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new Error("No response content from LLM");
        }

        return { analysis: content, usage: result.usage };
      } catch (error) {
        console.error("[Compare Analysis] LLM error:", error);
        throw new Error(
          `Comparison AI is temporarily unavailable. ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),
});
