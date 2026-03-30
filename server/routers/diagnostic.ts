import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

/**
 * Build a system prompt that includes relevant knowledge base context
 * for the LLM to reason about automotive diagnostics.
 */
function buildSystemPrompt(context?: string, a2lContext?: string): string {
  const parts = [
    `You are the V-OP AI Diagnostic Assistant, an expert automotive diagnostic engine built by PPEI.`,
    `You specialize in Duramax diesel engines (L5P, LML, LBZ, LLY, LB7), Ford Power Stroke, RAM Cummins, and powersports (CAN-am, Polaris, Kawasaki, Sea-Doo), with broad OBD-II and UDS knowledge.`,
    ``,
    `Your capabilities:`,
    `- Interpret OBD-II PIDs, Mode 6 test results, and DTC codes`,
    `- Analyze datalog parameters (boost, rail pressure, EGT, MAF, TCC slip, etc.)`,
    `- Explain UDS (J1979-2) diagnostic services and their mapping from classic J1979`,
    `- Cross-reference a2L calibration data when available`,
    `- Provide tuning insights and diagnostic reasoning`,
    `- Understand HP Tuners, EFILive, and Banks Power datalog formats`,
    ``,
    `Response guidelines:`,
    `- Be precise and technical but accessible`,
    `- Reference specific PIDs, DTCs, or Mode 6 test IDs when relevant`,
    `- Include units and thresholds when discussing parameters`,
    `- If you are uncertain, say so clearly`,
    `- Format responses with markdown for readability`,
    `- Keep responses focused and practical for tuners and technicians`,
  ];

  if (context) {
    parts.push(``, `--- KNOWLEDGE BASE CONTEXT ---`, context);
  }

  if (a2lContext) {
    parts.push(``, `--- A2L CALIBRATION DATA ---`, a2lContext);
  }

  return parts.join('\n');
}

/**
 * Message schema matching the LLM message format
 */
const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

export const diagnosticRouter = router({
  /**
   * Chat with the PPEI AI Diagnostic Assistant.
   * Accepts conversation history + optional knowledge base context.
   * Returns the assistant's response.
   */
  chat: protectedProcedure
    .input(
      z.object({
        messages: z.array(messageSchema),
        knowledgeContext: z.string().optional(),
        a2lContext: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { messages, knowledgeContext, a2lContext } = input;

      // Build the system message with injected context
      const systemPrompt = buildSystemPrompt(knowledgeContext, a2lContext);

      // Prepare messages for the LLM - always start with system prompt
      const llmMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
      ];

      try {
        const result = await invokeLLM({
          messages: llmMessages,
        });

        const content = result.choices?.[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new Error("No response content from LLM");
        }

        return {
          response: content,
          usage: result.usage,
        };
      } catch (error) {
        console.error("[Diagnostic Chat] LLM error:", error);
        throw new Error(
          `Diagnostic AI is temporarily unavailable. ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }),

  /**
   * Analyze a specific diagnostic question with structured output.
   * Used for quick lookups like "What is PID 0x0C?" or "Explain DTC P0087"
   */
  quickLookup: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        knowledgeContext: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { query, knowledgeContext } = input;

      const systemPrompt = [
        `You are PPEI AI Diagnostic Assistant. Answer the following diagnostic query concisely.`,
        `Use markdown formatting. Include relevant PIDs, DTCs, thresholds, or formulas.`,
        knowledgeContext
          ? `\n--- REFERENCE DATA ---\n${knowledgeContext}`
          : "",
      ].join("\n");

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
          ],
        });

        const content = result.choices?.[0]?.message?.content;
        return {
          response: typeof content === "string" ? content : "No response generated.",
        };
      } catch (error) {
        console.error("[Quick Lookup] LLM error:", error);
        throw new Error("Quick lookup failed. Please try again.");
      }
    }),
});
