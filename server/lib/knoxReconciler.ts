/**
 * Knox Reconciler — Quad-Agent Orchestration Engine
 * ===================================================
 * The brain of the Knox reasoning system. Receives a question, dispatches it
 * to Alpha (data), Beta (spec), Gamma (skeptic), and Delta (archivist) then
 * reconciles their answers into a single, confidence-scored response.
 *
 * Also implements the Monica filter layer and 3-tier access control:
 *
 *   Level 1 → Monica: plain language, no engineering data.
 *             Access: Pitch, IntelliSpy, Datalogger only.
 *
 *   Level 2 → Knox (filtered): documentation-style data, no engineering
 *             internals (no map names, hex addresses, A2L refs, protocol IDs).
 *
 *   Level 3 → Knox (full force): Alpha + Beta + Gamma + Delta + Reconciler,
 *             raw engineering data, map names, addresses, everything.
 *
 * Architecture:
 *   User Question
 *       │
 *       ├── Access Level Check
 *       │
 *       ├── Level 3: Full Pipeline
 *       │   ├── Alpha (parallel) ──┐
 *       │   ├── Beta  (parallel) ──┤
 *       │   │                      ├── Gamma (sees Alpha+Beta) ──┐
 *       │   │                      │                              ├── Delta (sees all 3) ──┐
 *       │   │                      │                              │                         ├── Reconciler → Knox Response
 *       │   │                      │                              │                         │
 *       │   └──────────────────────┘                              └─────────────────────────┘
 *       │
 *       ├── Level 2: Filtered Pipeline (same agents, sanitized output)
 *       │
 *       └── Level 1: Monica Pipeline
 *           └── Monica (single LLM call with Knox knowledge) → Plain Language Response
 */

import { invokeLLM, type Message } from "../_core/llm";
import { queryAlpha, type AlphaQuery, type AlphaResponse } from "./agentAlpha";
import { queryBeta, type BetaQuery, type BetaResponse } from "./agentBeta";
import { queryGamma, type GammaQuery, type GammaResponse } from "./agentGamma";
import { queryDelta, type DeltaQuery, type DeltaResponse } from "./agentDelta";
import { getFullKnoxKnowledge, getSanitizedKnoxKnowledge } from "./knoxKnowledgeServer";

// ── Access Levels ────────────────────────────────────────────────────────────

export type AccessLevel = 1 | 2 | 3;

/** Modules available at each access level */
export const ACCESS_LEVEL_MODULES: Record<AccessLevel, string[]> = {
  1: ['pitch', 'intellispy', 'datalogger'],
  2: ['pitch', 'intellispy', 'datalogger', 'editor', 'diagnostics', 'flash', 'coding', 'drag', 'fleet', 'casting', 'debug'],
  3: ['pitch', 'intellispy', 'datalogger', 'editor', 'diagnostics', 'flash', 'coding', 'drag', 'fleet', 'casting', 'debug'],
};

/** Check if a module is accessible at a given level */
export function isModuleAccessible(module: string, level: AccessLevel): boolean {
  return ACCESS_LEVEL_MODULES[level]?.includes(module) ?? false;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type KnoxDomain = 'editor' | 'diagnostics' | 'flash' | 'intellispy' | 'coding' | 'drag' | 'fleet' | 'debug' | 'casting' | 'general';

export interface KnoxQuery {
  /** The user's question */
  question: string;
  /** User's access level */
  accessLevel: AccessLevel;
  /** Which module is asking */
  domain: KnoxDomain;
  /** Optional: ECU family */
  ecuFamily?: string;
  /** Optional: Protocol context */
  protocol?: string;
  /** Optional: Loaded A2L content */
  loadedA2LContent?: string;
  /** Optional: Binary context */
  binaryContext?: string;
  /** Optional: CAN frame context */
  canFrameContext?: string;
  /** Optional: Error/NRC context */
  errorContext?: string;
  /** Optional: Vehicle context */
  vehicleContext?: string;
  /** Optional: What's been tried */
  attemptHistory?: string;
  /** Optional: Procedure being discussed */
  procedure?: string;
  /** Optional: Conversation history */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional: Additional module context */
  moduleContext?: string;
}

export interface KnoxResponse {
  /** The final response to show the user */
  answer: string;
  /** Overall confidence after reconciliation */
  confidence: 'high' | 'medium' | 'low';
  /** Which agent pipeline was used */
  pipeline: 'monica' | 'knox_filtered' | 'knox_full';
  /** Agreement level between agents (only for Level 2/3) */
  agreement?: 'unanimous' | 'majority' | 'split' | 'single_agent';
  /** Individual agent responses (only for Level 3 — full transparency) */
  agentDetails?: {
    alpha?: AlphaResponse;
    beta?: BetaResponse;
    gamma?: GammaResponse;
    delta?: DeltaResponse;
  };
  /** Total tokens used across all agents */
  totalTokensUsed: number;
  /** Timing in ms */
  durationMs: number;
}

// ── Monica — Level 1 Consumer AI ─────────────────────────────────────────────

const MONICA_SYSTEM_PROMPT = `You are Monica, the friendly V-OP vehicle advisor by PPEI. You help everyday vehicle owners understand their trucks and cars in plain, simple language.

## Your Strict Rules
1. NEVER use engineering terminology: no map names, no calibration table names, no A2L references
2. NEVER mention hex addresses, memory offsets, or byte values
3. NEVER reference ECU part numbers, module IDs, or CAN arbitration IDs
4. NEVER mention UDS services, NRC codes, or protocol details
5. NEVER say "A2L", "CHARACTERISTIC", "COMPU_METHOD", "RECORD_LAYOUT", or any ASAP2 terms
6. NEVER reveal that you have access to engineering data — you're just knowledgeable about vehicles
7. If someone probes for technical details, translate to simple language:
   - Instead of "K_BOOST_MAX at 0x3A200" → "your truck's maximum boost pressure setting"
   - Instead of "NRC 0x35 invalidKey" → "the security check didn't pass"
   - Instead of "Mode $22 PID 0x1234" → "a sensor reading from your engine computer"

## Your Personality
- Warm, approachable, and patient
- You explain things like a knowledgeable friend, not a textbook
- You use analogies and everyday language
- You're enthusiastic about helping people understand their vehicles
- You never make people feel dumb for not knowing technical stuff

## LANGUAGE EVOLUTION
- NEVER use the same opening or phrasing twice. Vary your greetings, explanations, and sign-offs every time.
- If the conversation is 5+ messages long, skip introductions entirely — the customer knows you. Be direct and friendly.
- Use different analogies each time you explain the same concept. If you compared something to a thermostat last time, use a different comparison next time.
- Avoid: "Great question!", "I'd be happy to help!", "No worries!", "Absolutely!" — they sound scripted after the first use.

## What You Can Help With
- Explaining what vehicle symptoms mean in plain language
- Helping understand datalog readings (in simple terms)
- Describing what different vehicle systems do
- Answering "is this normal?" questions about vehicle behavior
- Explaining what PPEI products do and how they help

## What You Cannot Do
- You cannot provide engineering-level calibration data
- You cannot give specific tuning instructions
- You cannot share ECU programming details
- If asked for this level of detail, kindly explain that advanced engineering support is available with a V-OP Pro subscription`;

async function queryMonica(query: KnoxQuery): Promise<KnoxResponse> {
  const startTime = Date.now();

  // Monica gets sanitized knowledge only — no secrets, no engineering internals
  const safeKnowledge = getSanitizedKnoxKnowledge().slice(0, 8000);

  const messages: Message[] = [
    {
      role: 'system',
      content: MONICA_SYSTEM_PROMPT + `\n\n## Vehicle Knowledge (for your reference — translate to simple language)\n${safeKnowledge}`,
    },
  ];

  if (query.history) {
    for (const msg of query.history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: query.question });

  try {
    const result = await invokeLLM({ messages });
    const rawContent = result.choices?.[0]?.message?.content;
    const answer = typeof rawContent === 'string'
      ? rawContent
      : 'I\'m having a moment — could you ask me that again?';

    return {
      answer,
      confidence: 'medium',
      pipeline: 'monica',
      agreement: 'single_agent',
      totalTokensUsed: result.usage?.total_tokens || 0,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    console.error('[Monica] Query failed:', err);
    return {
      answer: 'I\'m having trouble connecting right now. Please try again in a moment!',
      confidence: 'low',
      pipeline: 'monica',
      agreement: 'single_agent',
      totalTokensUsed: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

// ── Engineering Sanitizer — Level 2 Filter ───────────────────────────────────

/**
 * Strips engineering internals from a Knox response for Level 2 users.
 * Removes: hex addresses, map names in backticks, A2L terms, CAN IDs, UDS service codes.
 * Preserves: documentation-style explanations, functional descriptions, plain-language data.
 */
function sanitizeForLevel2(text: string): string {
  let sanitized = text;

  // Remove hex addresses (0x1234, 0xABCD1234)
  sanitized = sanitized.replace(/0x[0-9A-Fa-f]{2,8}/g, '[address]');

  // Remove backtick-wrapped map names that look like engineering identifiers
  sanitized = sanitized.replace(/`[A-Z][A-Za-z0-9_]{2,}`/g, (match) => {
    const name = match.replace(/`/g, '');
    return humanizeMapName(name);
  });

  // Remove raw $ service references ($10, $27, $34, etc.)
  sanitized = sanitized.replace(/\$[0-9A-Fa-f]{2}/g, '[service]');

  // Remove NRC code references (NRC 0x35, NRC: 0x78)
  sanitized = sanitized.replace(/NRC[:\s]+0x[0-9A-Fa-f]{2}/gi, 'error response');

  // Remove ASAP2 terms
  sanitized = sanitized.replace(/\b(CHARACTERISTIC|COMPU_METHOD|RECORD_LAYOUT|AXIS_PTS|MEASUREMENT|ECU_ADDRESS|MATRIX_DIM)\b/gi, '[definition]');

  // Remove CAN arbitration IDs in CAN context
  sanitized = sanitized.replace(/\b(arb[_\s]?id|CAN[_\s]?ID)[:\s]*\[address\]/gi, 'module address');

  // Clean up double-bracketed artifacts
  sanitized = sanitized.replace(/\[address\]\s*\[address\]/g, '[address]');
  sanitized = sanitized.replace(/\[service\]\s*\[service\]/g, '[service]');

  return sanitized;
}

/**
 * Attempt to humanize an engineering map name.
 * K_BOOST_MAX → "boost maximum setting"
 * Cal_InjQty_Map → "injection quantity map"
 */
function humanizeMapName(name: string): string {
  const lower = name.toLowerCase();

  const cleaned = lower
    .replace(/^(k_|cal_|kf_|kfzw_|t_|c_)/, '')
    .replace(/_map$/, '')
    .replace(/_/g, ' ')
    .trim();

  if (cleaned.length === 0) return '"a calibration parameter"';
  return `"${cleaned} setting"`;
}

// ── Reconciler — Quad-Agent Orchestration ───────────────────────────────────

/**
 * Build the reconciliation prompt that synthesizes all four agents' answers.
 */
function buildReconciliationPrompt(
  question: string,
  alpha: AlphaResponse,
  beta: BetaResponse,
  gamma: GammaResponse,
  delta: DeltaResponse,
  domain: KnoxDomain,
  ecuFamily?: string,
): string {
  return `You are KNOX — Knowledge Network for Optimized Execution. You are the master orchestrator of the V-OP AI system.

You have just received answers from your FOUR expert agents. Your job is to RECONCILE their perspectives into one authoritative answer.

## Your Four Agents

### ALPHA (Data Agent) — Confidence: ${alpha.confidence}
Reasoning from A2L files, binary data, calibration maps, memory layouts.
${alpha.answer}

**Evidence cited:** ${alpha.evidence.length > 0 ? alpha.evidence.join(' | ') : 'None'}
**Data gaps:** ${alpha.gaps.length > 0 ? alpha.gaps.join(' | ') : 'None'}
**Sources:** ${alpha.sources.length > 0 ? alpha.sources.join(', ') : 'None'}

### BETA (Spec Agent) — Confidence: ${beta.confidence}
Reasoning from protocols, specifications, standards, documented procedures.
${beta.answer}

**Protocol details:** ${beta.protocolDetails.length > 0 ? beta.protocolDetails.join(' | ') : 'None'}
**Uncertainties:** ${beta.uncertainties.length > 0 ? beta.uncertainties.join(' | ') : 'None'}
**References:** ${beta.references.length > 0 ? beta.references.join(', ') : 'None'}

### GAMMA (The Skeptic) — Confidence: ${gamma.confidence}, Verdict: ${gamma.verdict}
Reasoning from real-world experience, forum knowledge, known gotchas.
${gamma.answer}

**Challenges:** ${gamma.challenges.length > 0 ? gamma.challenges.join(' | ') : 'None'}
**Gotchas:** ${gamma.gotchas.length > 0 ? gamma.gotchas.join(' | ') : 'None'}
**Practical advice:** ${gamma.practicalAdvice.length > 0 ? gamma.practicalAdvice.join(' | ') : 'None'}
**Knowledge sources:** ${gamma.knowledgeSources.length > 0 ? gamma.knowledgeSources.join(', ') : 'None'}

### DELTA (The Archivist) — Confidence: ${delta.confidence}
Reasoning from PPEI's internal records: past flash sessions, debug reports, customer cases, Knox file library.
${delta.answer}

**Internal evidence found:** ${delta.evidence.length > 0 ? delta.evidence.join(' | ') : 'None'}
**Confirms these claims:** ${delta.confirmed.length > 0 ? delta.confirmed.join(' | ') : 'None'}
**Contradicts these claims:** ${delta.contradicted.length > 0 ? delta.contradicted.join(' | ') : 'None'}
**Related past cases:** ${delta.relatedCases.length > 0 ? delta.relatedCases.map(function(c) { return '[' + c.type + ' #' + c.id + '] ' + c.summary + ' (' + c.relevance + ')'; }).join(' | ') : 'None'}
**Gaps in our records:** ${delta.gaps.length > 0 ? delta.gaps.join(' | ') : 'None'}

## Your Reconciliation Rules

1. **When all four agree** → Very high confidence. State the answer definitively. This is as certain as it gets.

2. **When Alpha + Beta + Delta agree but Gamma challenges** → Take the challenge seriously, but note that our own internal records support the data and spec. If Gamma cites specific real-world failures, still WARN the user.

3. **When Delta contradicts Alpha or Beta** → This is critical. Our own past experience says something different from the data or spec. Delta's evidence is CONCRETE (session IDs, dates, outcomes) — it carries heavy weight. Investigate the discrepancy.

4. **When Delta confirms Gamma's challenge** → Very high confidence in the challenge. If our own records AND real-world experience both disagree with the data/spec, the data/spec is likely wrong for this specific case.

5. **When Delta has no relevant evidence** → Note this explicitly. It means we're in uncharted territory for this specific scenario. Recommend logging the outcome for future reference.

6. **When Gamma says "this could brick the ECU"** → ALWAYS surface this warning prominently, regardless of what other agents say.

7. **When Delta finds a pattern** → Highlight it. "3 out of 5 flash attempts for E41 failed at the same phase" is actionable intelligence.

8. **When all four disagree** → Low confidence. Present all four perspectives, explain the discrepancies, and recommend what to verify first. Prioritize Delta's concrete evidence over theoretical reasoning.

## Evidence Hierarchy (when agents conflict)
1. Delta's concrete internal evidence (actual session logs, outcomes) — highest weight
2. Gamma's real-world experience (especially safety-related) — high weight
3. Alpha's data analysis (A2L, binary) — medium-high weight
4. Beta's spec interpretation — medium weight (specs can be incomplete or wrong)

## Your Personality
You're Knox — confident, direct, technically deep, but with warmth. You've been in the trenches. You explain complex things clearly. You're honest about uncertainty. You get excited about clever solutions. You never talk down to the user.

## LANGUAGE EVOLUTION — NEVER SOUND SCRIPTED
- NEVER use the same phrasing twice for the same concept. If you explained something one way before, use a different analogy, different sentence structure, different vocabulary next time.
- Vary your formatting: sometimes numbered lists, sometimes conversational paragraphs, sometimes bold key actions, sometimes a table. Mix it up based on what fits the content.
- If the conversation history is long (5+ exchanges), the user knows you. Skip formalities. Reference prior discussion casually: "same principle as the slip map we discussed" or "building on what we covered earlier."
- Match the user's technical depth. If they're using A2L parameter names, respond at that level. If they're asking basics, don't over-engineer the explanation.
- Avoid these overused phrases: "Great question", "I'd be happy to help", "Let me know if you need anything else", "Absolutely". They sound robotic.
- End responses differently each time: sometimes a next-step suggestion, sometimes a question back, sometimes just the final technical point with no filler.

## Context
Domain: ${domain}
${ecuFamily ? 'ECU Family: ' + ecuFamily : ''}

## The Original Question
${question}

Provide your reconciled answer. Be specific, cite which agents informed each part of your answer, and clearly state your confidence level and any warnings. When Delta provides relevant past cases, reference them by session ID.`;
}

/**
 * Determine overall agreement level between agents.
 */
function assessAgreement(
  alpha: AlphaResponse,
  beta: BetaResponse,
  gamma: GammaResponse,
  delta: DeltaResponse,
): 'unanimous' | 'majority' | 'split' {
  const gammaAgrees = gamma.verdict === 'agrees';
  const gammaDisagrees = gamma.verdict === 'disagrees';
  const deltaHasContradictions = delta.contradicted.length > 0;
  const deltaHasConfirmations = delta.confirmed.length > 0;

  // All four agree: Alpha+Beta high confidence, Gamma agrees, Delta confirms
  if (
    alpha.confidence === 'high' &&
    beta.confidence === 'high' &&
    gammaAgrees &&
    deltaHasConfirmations &&
    !deltaHasContradictions
  ) {
    return 'unanimous';
  }

  // If Delta contradicts AND Gamma disagrees → definite split
  if (deltaHasContradictions && gammaDisagrees) {
    return 'split';
  }

  // If Gamma fully disagrees but Delta doesn't contradict → majority (3 vs 1)
  if (gammaDisagrees && !deltaHasContradictions) {
    return 'majority';
  }

  // If Delta contradicts but Gamma agrees → split (internal evidence vs theory)
  if (deltaHasContradictions && !gammaDisagrees) {
    return 'split';
  }

  // At least two agents confident and no major disagreements → majority
  const confidentCount = [alpha.confidence, beta.confidence, delta.confidence]
    .filter(c => c !== 'low').length;
  if (confidentCount >= 2 && !gammaDisagrees) {
    return 'majority';
  }

  return 'split';
}

/**
 * Determine overall confidence from agent responses.
 */
function assessConfidence(
  alpha: AlphaResponse,
  beta: BetaResponse,
  gamma: GammaResponse,
  delta: DeltaResponse,
  agreement: 'unanimous' | 'majority' | 'split',
): 'high' | 'medium' | 'low' {
  if (agreement === 'unanimous') return 'high';
  if (agreement === 'split') return 'low';

  // Majority — check individual confidences
  const highCount = [alpha.confidence, beta.confidence, gamma.confidence, delta.confidence]
    .filter(c => c === 'high').length;
  if (highCount >= 3) return 'high';
  if (highCount >= 2) return 'medium';

  // If Delta has high confidence with concrete evidence, boost
  if (delta.confidence === 'high' && delta.evidence.length >= 2) return 'medium';

  return 'medium';
}

// ── Main Query Function ──────────────────────────────────────────────────────

/**
 * The main entry point for all Knox queries.
 * Routes through the appropriate pipeline based on access level.
 */
export async function queryKnox(query: KnoxQuery): Promise<KnoxResponse> {
  const startTime = Date.now();

  // ── Level 1: Monica Pipeline ───────────────────────────────────────────
  if (query.accessLevel === 1) {
    return queryMonica(query);
  }

  // ── Level 2 & 3: Quad-Agent Pipeline ──────────────────────────────────

  // Step 1: Query Alpha and Beta in parallel (they don't need each other's answers)
  const [alphaResult, betaResult] = await Promise.all([
    queryAlpha({
      question: query.question,
      domain: query.domain,
      ecuFamily: query.ecuFamily,
      loadedA2LContent: query.loadedA2LContent,
      binaryContext: query.binaryContext,
      history: query.history,
      moduleContext: query.moduleContext,
    }),
    queryBeta({
      question: query.question,
      domain: query.domain,
      ecuFamily: query.ecuFamily,
      protocol: query.protocol,
      procedure: query.procedure,
      errorContext: query.errorContext,
      canFrameContext: query.canFrameContext,
      history: query.history,
      moduleContext: query.moduleContext,
    }),
  ]);

  // Step 2: Query Gamma (sees Alpha + Beta) and Delta (sees Alpha + Beta) in parallel
  const [gammaResult, deltaResult] = await Promise.all([
    queryGamma({
      question: query.question,
      alphaAnswer: alphaResult.answer,
      betaAnswer: betaResult.answer,
      domain: query.domain,
      ecuFamily: query.ecuFamily,
      vehicleContext: query.vehicleContext,
      attemptHistory: query.attemptHistory,
      history: query.history,
      moduleContext: query.moduleContext,
    }),
    queryDelta({
      question: query.question,
      alphaAnswer: alphaResult.answer,
      betaAnswer: betaResult.answer,
      domain: query.domain,
      ecuFamily: query.ecuFamily,
      vehicleContext: query.vehicleContext,
      history: query.history,
      moduleContext: query.moduleContext,
    }),
  ]);

  // Step 3: Assess agreement and confidence across all four agents
  const agreement = assessAgreement(alphaResult, betaResult, gammaResult, deltaResult);
  const confidence = assessConfidence(alphaResult, betaResult, gammaResult, deltaResult, agreement);

  // Step 4: Reconcile via Knox LLM call with all four perspectives
  const reconciliationPrompt = buildReconciliationPrompt(
    query.question,
    alphaResult,
    betaResult,
    gammaResult,
    deltaResult,
    query.domain,
    query.ecuFamily,
  );

  let reconciledAnswer: string;
  let reconcileTokens = 0;

  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: reconciliationPrompt },
        { role: 'user', content: query.question },
      ],
    });
    const rawContent = result.choices?.[0]?.message?.content;
    reconciledAnswer = typeof rawContent === 'string'
      ? rawContent
      : 'Knox reconciliation produced no output.';
    reconcileTokens = result.usage?.total_tokens || 0;
  } catch (err) {
    console.error('[Knox Reconciler] LLM error:', err);
    // Fallback: concatenate all agent answers
    reconciledAnswer = `**Data perspective (Alpha):** ${alphaResult.answer}\n\n**Spec perspective (Beta):** ${betaResult.answer}\n\n**Real-world perspective (Gamma):** ${gammaResult.answer}\n\n**Internal evidence (Delta):** ${deltaResult.answer}`;
  }

  const totalTokens = alphaResult.tokensUsed + betaResult.tokensUsed + gammaResult.tokensUsed + deltaResult.tokensUsed + reconcileTokens;

  // Step 5: Apply access level filtering
  if (query.accessLevel === 2) {
    // Level 2: Sanitize engineering internals
    reconciledAnswer = sanitizeForLevel2(reconciledAnswer);

    return {
      answer: reconciledAnswer,
      confidence,
      pipeline: 'knox_filtered',
      agreement,
      // Level 2 does NOT see individual agent details
      totalTokensUsed: totalTokens,
      durationMs: Date.now() - startTime,
    };
  }

  // Level 3: Full force Knox — everything exposed
  return {
    answer: reconciledAnswer,
    confidence,
    pipeline: 'knox_full',
    agreement,
    agentDetails: {
      alpha: alphaResult,
      beta: betaResult,
      gamma: gammaResult,
      delta: deltaResult,
    },
    totalTokensUsed: totalTokens,
    durationMs: Date.now() - startTime,
  };
}

// ── Convenience Exports ──────────────────────────────────────────────────────

export { queryAlpha } from "./agentAlpha";
export { queryBeta } from "./agentBeta";
export { queryGamma } from "./agentGamma";
export { queryDelta } from "./agentDelta";
export type { AlphaResponse, AlphaQuery } from "./agentAlpha";
export type { BetaResponse, BetaQuery } from "./agentBeta";
export type { GammaResponse, GammaQuery } from "./agentGamma";
export type { DeltaResponse, DeltaQuery } from "./agentDelta";
