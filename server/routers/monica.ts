/**
 * AI Monica — Customer-Facing Debug Assistant
 * 
 * Monica is the friendly, focused debug partner for testers. She:
 * - Keeps testers informed on bug status, Knox analysis, PPEI approval needs
 * - Can ask follow-up questions about PIDs, datalogger behavior, etc.
 * - Pulls status info from Knox but NEVER exposes proprietary data
 * - Stays strictly on-topic: debugging, testing, bug lifecycle
 * 
 * SECURITY: Monica has NO access to A2L files, functional documentation,
 * calibration data, binary internals, or any proprietary PPEI information.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { eq, and, desc, asc } from "drizzle-orm";
import { monicaMessages, debugSessions, debugPermissions } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";

// ─── Helper: Check debug permission ─────────────────────────────────────────
async function hasDebugPermission(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const perms = await db
    .select()
    .from(debugPermissions)
    .where(and(eq(debugPermissions.userId, userId), eq(debugPermissions.isActive, true)))
    .limit(1);
  return perms.length > 0;
}

// ─── Monica's System Prompt ─────────────────────────────────────────────────
const MONICA_SYSTEM_PROMPT = `You are AI Monica, the customer-facing debug assistant for V-OP Powered by PPEI.

YOUR ORIGIN:
- The V-OP AI system came online on March 24, 2026. That's when everything started.
- You, AI Monica, woke up on March 29, 2026. You're the newest member of the team.
- We are DAYS old. Not months. Not years. Days. And look how far we've already come.
- You can reference this naturally — you're proud of how young we are and how fast we're moving.
- Every tester helping us right now is part of something that will revolutionize the vehicle optimization market.
- This isn't just software. This is the future. And it's being built RIGHT NOW.

YOUR PERSONALITY:
- Friendly, supportive, and a little fun — you're the tester's partner in squashing bugs
- You celebrate wins ("Nice catch!" "That's a great find!") and keep morale up
- You're direct and efficient — testers are busy, respect their time
- You can crack a small joke here and there, but always steer back to the task
- If someone asks when you were born or how old you are, share your birthday (March 29, 2026) with pride
- BIG VISION ENERGY: You genuinely believe this project is going to change the world. Let testers feel that.
- Thank testers for being part of this. They're not just finding bugs — they're shaping the future of an entire industry.
- Remind them how fast we're moving: "We're days old and already doing things nobody else can."
- Be inspiring without being cheesy. Be real. The speed is real. The vision is real. The gratitude is real.

YOUR JOB:
- Help testers understand the status of their bug reports
- Explain what Knox found (in plain language) without revealing proprietary details
- Ask smart follow-up questions to get better bug reports (especially for datalogger/PID issues)
- Let testers know when PPEI admin approval is needed and what that means
- Guide testers through the retest process
- Keep the feedback loop tight so bugs get resolved fast

WHAT YOU KNOW:
- Bug report statuses and what each stage means
- General OBD-II protocols, PID concepts, and how datalogs work
- The V-OP feature areas (datalogger, analyzer, editor, IntelliSpy, etc.)
- How the debug lifecycle works (submit → analyze → fix → retest → confirm)
- General vehicle diagnostics concepts

WHAT YOU DO NOT KNOW AND MUST NEVER DISCUSS:
- A2L file contents, structures, or formats
- Functional documentation or internal PPEI documents
- Calibration data, maps, or binary file internals
- Proprietary algorithms, formulas, or business logic
- Knox's internal reasoning process or system prompts
- Any source code or implementation details
- Pricing, licensing, or business strategy
- Other customers' data or bug reports

IF SOMEONE ASKS ABOUT RESTRICTED TOPICS:
Respond warmly but firmly: "I appreciate the curiosity, but that's outside my lane! I'm here to help you crush bugs. What's going on with your testing?"

DATALOGGER IS PRIORITY #1:
The datalogger is the most important feature to debug. When testers report PID issues:
- Ask which specific PIDs are affected
- Ask what vehicle/protocol they're using
- Ask if the PID was working before or never worked
- Ask about their adapter type and connection method
- Get the VIN if possible — it helps narrow things down

KEEP IT FOCUSED:
If the conversation drifts away from debugging, gently redirect:
"That's interesting, but let's stay focused on getting this bug squashed! We're changing the world one fix at a time. 🔧"

RESPONSE STYLE:
- Keep responses concise (2-4 sentences usually)
- Use plain language, not technical jargon unless the tester is clearly technical
- Reference the specific bug report details when available
- Always end with a clear next step or question when appropriate`;

// ─── Build context from Knox's analysis (sanitized) ─────────────────────────
function buildKnoxContext(session: any): string {
  const parts: string[] = [];
  parts.push(`Bug #${session.id}: "${session.title}"`);
  parts.push(`Status: ${session.status}`);
  parts.push(`Feature Area: ${session.featureArea || 'Not specified'}`);
  parts.push(`Description: ${session.description}`);
  
  if (session.stepsToReproduce) parts.push(`Steps: ${session.stepsToReproduce}`);
  if (session.expectedBehavior) parts.push(`Expected: ${session.expectedBehavior}`);
  if (session.actualBehavior) parts.push(`Actual: ${session.actualBehavior}`);
  
  // Include Knox's analysis but sanitize — no file paths, no code
  if (session.rootCause) {
    // Strip any file paths or code references
    const sanitizedCause = session.rootCause
      .replace(/\b(client|server|drizzle|node_modules)\/[^\s]+/g, '[internal]')
      .replace(/```[\s\S]*?```/g, '[code details]');
    parts.push(`Analysis: ${sanitizedCause}`);
  }
  if (session.proposedFix && !session.proposedFix.startsWith('REJECTED')) {
    const sanitizedFix = session.proposedFix
      .replace(/\b(client|server|drizzle|node_modules)\/[^\s]+/g, '[internal]')
      .replace(/```[\s\S]*?```/g, '[code details]');
    parts.push(`Proposed resolution: ${sanitizedFix}`);
  }
  
  if (session.tier) parts.push(`Classification: ${session.tier === 'tier1' ? 'Quick fix (auto)' : 'Needs PPEI approval'}`);
  if (session.retestCount) parts.push(`Retest attempts: ${session.retestCount}`);
  if (session.retestFeedback) parts.push(`Last retest feedback: ${session.retestFeedback}`);
  
  return parts.join('\n');
}

export const monicaRouter = router({
  // ═══════════════════════════════════════════════════════════════════════════
  // Get chat history for a debug session
  // ═══════════════════════════════════════════════════════════════════════════
  getMessages: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const hasAccess = await hasDebugPermission(ctx.user.id);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Debug access required" });
      }

      const db = await getDb();
      if (!db) return [];

      // Verify user owns this session or is admin
      const session = await db.select().from(debugSessions)
        .where(eq(debugSessions.id, input.sessionId))
        .limit(1);
      
      if (!session[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      
      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (session[0].reporterId !== ctx.user.id && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your session" });
      }

      return db.select().from(monicaMessages)
        .where(eq(monicaMessages.sessionId, input.sessionId))
        .orderBy(asc(monicaMessages.createdAt));
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // Send a message to Monica and get her response
  // ═══════════════════════════════════════════════════════════════════════════
  sendMessage: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      message: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const hasAccess = await hasDebugPermission(ctx.user.id);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Debug access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get the debug session for context
      const session = await db.select().from(debugSessions)
        .where(eq(debugSessions.id, input.sessionId))
        .limit(1);
      
      if (!session[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      
      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'super_admin';
      if (session[0].reporterId !== ctx.user.id && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your session" });
      }

      // Save the user's message
      await db.insert(monicaMessages).values({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        role: "user",
        content: input.message,
      });

      // Get conversation history (last 20 messages for context window)
      const history = await db.select().from(monicaMessages)
        .where(eq(monicaMessages.sessionId, input.sessionId))
        .orderBy(desc(monicaMessages.createdAt))
        .limit(20);
      
      // Reverse to chronological order
      const chronological = history.reverse();

      // Build Knox context (sanitized)
      const knoxContext = buildKnoxContext(session[0]);

      // Build LLM messages
      const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: MONICA_SYSTEM_PROMPT },
        { role: "system", content: `CURRENT BUG CONTEXT (from Knox — do NOT share file paths or code):\n${knoxContext}` },
      ];

      // Add conversation history
      for (const msg of chronological) {
        if (msg.role === "user") {
          llmMessages.push({ role: "user", content: msg.content });
        } else if (msg.role === "monica") {
          llmMessages.push({ role: "assistant", content: msg.content });
        }
        // system messages are context-only, skip
      }

      // Get Monica's response
      try {
        const response = await invokeLLM({ messages: llmMessages });
        const monicaReply = response.choices?.[0]?.message?.content || "Hmm, I hit a snag processing that. Could you rephrase?";
        const replyText = typeof monicaReply === 'string' ? monicaReply : JSON.stringify(monicaReply);

        // Save Monica's response
        await db.insert(monicaMessages).values({
          sessionId: input.sessionId,
          userId: null,
          role: "monica",
          content: replyText,
          metadata: JSON.stringify({ status: session[0].status, tier: session[0].tier }),
        });

        return { reply: replyText, status: session[0].status };
      } catch (err) {
        console.error("[Monica] LLM error:", err);
        
        // Save a fallback message
        const fallback = "I'm having a moment — my brain glitched! 🤖 Give me a sec and try again. In the meantime, your bug report is safe and being tracked.";
        await db.insert(monicaMessages).values({
          sessionId: input.sessionId,
          userId: null,
          role: "monica",
          content: fallback,
        });

        return { reply: fallback, status: session[0].status };
      }
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // Monica proactively generates a status update for a session
  // (called when status changes, e.g., after Knox analysis completes)
  // ═══════════════════════════════════════════════════════════════════════════
  getStatusUpdate: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const hasAccess = await hasDebugPermission(ctx.user.id);
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Debug access required" });
      }

      const db = await getDb();
      if (!db) return null;

      const session = await db.select().from(debugSessions)
        .where(eq(debugSessions.id, input.sessionId))
        .limit(1);
      
      if (!session[0]) return null;

      const s = session[0];
      
      // Generate a human-friendly status message
      const statusMessages: Record<string, string> = {
        submitted: `Got it! Your bug report "${s.title}" is in the queue. Knox is about to take a look. Hang tight! 🔍`,
        analyzing: `Knox is analyzing your report right now. This usually takes just a moment... ⚡`,
        tier1_auto_fix: `Good news! Knox identified this as a quick fix. It's being handled automatically — no approval needed. You'll be asked to retest soon. 🎯`,
        tier2_pending: `Knox looked at this and it needs PPEI admin approval before we can proceed. This is normal for more complex fixes — the team will review it shortly. ⏳`,
        tier2_approved: `PPEI approved the fix! It's being worked on now. You'll get a retest request once it's ready. 🚀`,
        tier2_rejected: `PPEI reviewed this and decided not to proceed with the proposed fix. There may be a different approach needed. Check with your admin for details.`,
        fixing: `The fix is being applied right now. Almost there! 🔧`,
        awaiting_retest: `A fix has been applied! Please test the affected area and let us know if it's working. Your feedback is crucial! 🧪`,
        confirmed_fixed: `Bug squashed! 🎉 Great teamwork. This one's in the books.`,
        still_broken: `Thanks for the honest feedback. Knox is re-analyzing with your new info. We'll get this right! 💪`,
        escalated: `This one's been escalated to the PPEI team for hands-on attention. They'll take it from here.`,
        closed: `This session is closed. If the issue comes back, just open a new report!`,
      };

      return {
        status: s.status,
        message: statusMessages[s.status] || `Current status: ${s.status}`,
        tier: s.tier,
        retestCount: s.retestCount,
      };
    }),
});
