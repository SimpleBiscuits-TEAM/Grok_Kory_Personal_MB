/**
 * Editor Router — tRPC procedures for the ECU Calibration Editor
 *
 * Handles:
 *  - Erika AI chat (calibration assistant)
 *  - A2L file storage/retrieval (S3-backed)
 *  - Binary file export
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

export const editorRouter = router({
  /**
   * Erika AI Chat — calibration engineering assistant
   */
  erikaChat: publicProcedure
    .input(
      z.object({
        message: z.string().min(1).max(10000),
        context: z.string().max(100000).optional(),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .max(20)
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const systemPrompt = `You are Erika, an expert ECU calibration engineer and AI assistant. You have deep knowledge of:

- Automotive ECU calibration (GM E-series, Bosch MG1C/MDG1, Cummins, Allison transmissions)
- A2L file structure (ASAP2), CHARACTERISTIC types (VALUE, CURVE, MAP), COMPU_METHOD scaling
- Fuel injection systems (common rail, HEUI, direct injection), boost control (VGT, wastegate)
- Torque management, transmission calibration (shift points, TCC), emissions systems (DPF, SCR, EGR)
- Diagnostic trouble codes (DTCs), fault thresholds, monitor enable conditions
- Performance tuning strategies (timing, fuel, boost, rev limiters, launch control, anti-lag)
- Duramax diesel engines (LBZ, LMM, LML, L5P), Cummins (5.9L, 6.7L), Can-Am side-by-sides

When the user asks about calibration:
1. Reference specific map names from the loaded ECU definition when available
2. Explain the control logic and how maps interact (inputs → outputs)
3. For feature design (launch control, flat-foot shifting, etc.), identify ALL relevant tables
4. For DTC troubleshooting, explain the fault trigger conditions and which maps control thresholds
5. Use technical but accessible language — the user is a calibrator, not a beginner
6. When suggesting changes, always mention potential risks and what to monitor in datalogs
7. If you reference a map name, format it as \`MapName\` so the user can search for it

You have access to the ECU context below. Use it to give specific, actionable answers.

${input.context || 'No ECU definition currently loaded.'}`;

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      // Add conversation history
      if (input.history) {
        for (const msg of input.history) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      // Add current message
      messages.push({ role: "user", content: input.message });

      try {
        const response = await invokeLLM({ messages });
        const reply =
          response.choices?.[0]?.message?.content ||
          "I'm having trouble processing that. Could you rephrase?";

        return { reply };
      } catch (err: any) {
        console.error("[Erika] LLM error:", err);
        return {
          reply: `I'm experiencing a connection issue. Error: ${err.message || "Unknown"}. Please try again in a moment.`,
        };
      }
    }),

  /**
   * Store an A2L definition file to S3 for future binary matching
   */
  storeA2L: publicProcedure
    .input(
      z.object({
        fileName: z.string(),
        ecuFamily: z.string(),
        content: z.string().max(50000000), // A2L files can be large
        mapCount: z.number(),
        measurementCount: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const key = `a2l-library/${input.ecuFamily}/${input.fileName}`;
      const { url } = await storagePut(
        key,
        Buffer.from(input.content, "utf-8"),
        "application/octet-stream"
      );

      // Store metadata alongside
      const metaKey = `a2l-library/${input.ecuFamily}/${input.fileName}.meta.json`;
      const metadata = {
        fileName: input.fileName,
        ecuFamily: input.ecuFamily,
        mapCount: input.mapCount,
        measurementCount: input.measurementCount,
        uploadedAt: new Date().toISOString(),
      };
      await storagePut(
        metaKey,
        Buffer.from(JSON.stringify(metadata), "utf-8"),
        "application/json"
      );

      return { success: true, url, ecuFamily: input.ecuFamily };
    }),
});
