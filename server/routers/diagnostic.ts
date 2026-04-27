import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { queryKnox, type AccessLevel } from "../lib/knoxReconciler";
import { buildRelevantContextPack, normalizeCacheKey, trimHistory } from "../lib/llmContext";
import { classifyIntent } from "../lib/llmIntent";

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

const QUICK_LOOKUP_TTL_MS = 2 * 60 * 1000;
const quickLookupCache = new Map<string, { response: string; expiresAt: number; pipeline?: string }>();

function withEvidenceFooter(response: string, citations: string[]): string {
  if (!citations.length) return response;
  const trimmed = response.trim();
  const footerLines = citations.slice(0, 3).map((c) => `- ${c}`);
  const footer = `\n\n**Evidence Tags**\n${footerLines.join("\n")}`;
  if (/evidence tags/i.test(trimmed)) return trimmed;
  return `${trimmed}${footer}`;
}

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
    .mutation(async ({ input, ctx }) => {
      const { messages, knowledgeContext, a2lContext } = input;
      const userAccessLevel = (ctx.user?.accessLevel || 0) as AccessLevel;
      const effectiveLevel: AccessLevel = userAccessLevel >= 3 ? 3 : userAccessLevel >= 2 ? 2 : 1;

      // Get the last user message for the pipeline
      const userMessages = messages.filter(m => m.role === 'user');
      const lastUserMsg = userMessages[userMessages.length - 1]?.content || 'Diagnose this issue.';
      const intent = classifyIntent(lastUserMsg);
      const historyMsgs = trimHistory(
        messages
          .filter(m => m.role !== 'system')
          .slice(0, -1)
          .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { maxTurns: 10, maxChars: 5500 }
      );
      const contextPack = buildRelevantContextPack({
        question: lastUserMsg,
        sources: [knowledgeContext, a2lContext],
        maxChars: 6000,
      });

      // Try triple-agent pipeline first
      try {
        const knoxResult = await queryKnox({
          question: lastUserMsg,
          accessLevel: effectiveLevel,
          domain: intent.domain,
          moduleContext: contextPack.context,
          history: historyMsgs,
        });
        const response = withEvidenceFooter(knoxResult.answer, contextPack.citations);
        return {
          response,
          usage: null,
          pipeline: knoxResult.pipeline,
          confidence: knoxResult.confidence,
          intent: intent.label,
        };
      } catch (pipelineErr) {
        console.warn('[Diagnostic Chat] Pipeline failed, falling back:', pipelineErr);
      }

      // Fallback to direct LLM
      const systemPrompt = buildSystemPrompt(contextPack.context || knowledgeContext, a2lContext);
      const llmMessages = [
        { role: "system" as const, content: systemPrompt },
        ...messages
          .filter((m) => m.role !== "system")
          .slice(-10)
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
          response: withEvidenceFooter(content, contextPack.citations),
          usage: result.usage,
          intent: intent.label,
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
    .mutation(async ({ input, ctx }) => {
      const { query, knowledgeContext } = input;
      const userAccessLevel = (ctx.user?.accessLevel || 0) as AccessLevel;
      const effectiveLevel: AccessLevel = userAccessLevel >= 3 ? 3 : userAccessLevel >= 2 ? 2 : 1;
      const intent = classifyIntent(query);
      const contextPack = buildRelevantContextPack({
        question: query,
        sources: [knowledgeContext],
        maxChars: 3500,
      });
      const cacheKey = normalizeCacheKey([String(effectiveLevel), intent.domain, query, contextPack.context]);
      const now = Date.now();
      const cached = quickLookupCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return {
          response: cached.response,
          pipeline: cached.pipeline ?? 'cache',
          intent: intent.label,
        };
      }

      // Try triple-agent pipeline first
      try {
        const knoxResult = await queryKnox({
          question: query,
          accessLevel: effectiveLevel,
          domain: intent.domain,
          moduleContext: contextPack.context,
        });
        const response = withEvidenceFooter(knoxResult.answer, contextPack.citations);
        quickLookupCache.set(cacheKey, {
          response,
          pipeline: knoxResult.pipeline,
          expiresAt: now + QUICK_LOOKUP_TTL_MS,
        });
        return {
          response,
          pipeline: knoxResult.pipeline,
          intent: intent.label,
        };
      } catch {
        // Fallback
      }

      const systemPrompt = [
        `You are PPEI AI Diagnostic Assistant. Answer the following diagnostic query concisely.`,
        `Use markdown formatting. Include relevant PIDs, DTCs, thresholds, or formulas.`,
        `If evidence is incomplete, explicitly list what data is missing.`,
        contextPack.context
          ? `\n--- REFERENCE DATA ---\n${contextPack.context}`
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
        const baseResponse =
          typeof content === "string" ? content : "No response generated.";
        const response = withEvidenceFooter(baseResponse, contextPack.citations);
        quickLookupCache.set(cacheKey, {
          response,
          pipeline: 'llm_fallback',
          expiresAt: now + QUICK_LOOKUP_TTL_MS,
        });
        return {
          response,
          intent: intent.label,
        };
      } catch (error) {
        console.error("[Quick Lookup] LLM error:", error);
        throw new Error("Quick lookup failed. Please try again.");
      }
    }),
});
