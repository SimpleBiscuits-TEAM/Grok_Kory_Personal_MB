/**
 * Agent Gamma — The Skeptic
 * ===========================
 * Specializes in real-world experience, forum knowledge, tribal wisdom,
 * known gotchas, hardware revision quirks, and "what actually happens on
 * the truck." Gamma's job is to POKE HOLES in Alpha and Beta's answers.
 *
 * Gamma carries the knowledge that doesn't exist in any spec or A2L file:
 * - "GM changed the bootloader on 2020+ L5P and the old timing doesn't work"
 * - "The spec says 4s but PCMHacking found it's actually 6s on E41"
 * - "That address works on bench but not in-vehicle because of gateway filtering"
 * - "HP Tuners users reported bricking when doing X in that order"
 *
 * Gamma does NOT provide the primary answer — Alpha and Beta do that.
 * Gamma CHALLENGES their answers with real-world counterevidence.
 *
 * Architecture:
 *   Knox (question) → Alpha (data-grounded answer)
 *                   → Beta  (spec-grounded answer)
 *                   → Gamma (real-world challenge)  ← THIS AGENT
 *                   → Reconciler (triangulated response)
 */

import { invokeLLM, type Message } from "../_core/llm";
import { getFullKnoxKnowledge } from "./knoxKnowledgeServer";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GammaQuery {
  /** The original question Knox is investigating */
  question: string;
  /** Alpha's answer to challenge */
  alphaAnswer?: string;
  /** Beta's answer to challenge */
  betaAnswer?: string;
  /** Domain context */
  domain: 'editor' | 'diagnostics' | 'flash' | 'intellispy' | 'coding' | 'drag' | 'fleet' | 'debug' | 'casting' | 'general';
  /** Optional: ECU family */
  ecuFamily?: string;
  /** Optional: Vehicle year/model context */
  vehicleContext?: string;
  /** Optional: What the user has already tried */
  attemptHistory?: string;
  /** Optional: Conversation history */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional: Additional context */
  moduleContext?: string;
}

export interface GammaResponse {
  /** Gamma's real-world assessment — challenges, confirmations, or warnings */
  answer: string;
  /** Does Gamma agree with Alpha/Beta, partially disagree, or fully disagree? */
  verdict: 'agrees' | 'partially_disagrees' | 'disagrees' | 'insufficient_data';
  /** Specific challenges to Alpha and/or Beta's answers */
  challenges: string[];
  /** Known gotchas, hardware quirks, or real-world failures relevant to this question */
  gotchas: string[];
  /** What Gamma would try first based on real-world experience */
  practicalAdvice: string[];
  /** Forum/community sources this knowledge comes from (general, not URLs) */
  knowledgeSources: string[];
  /** Confidence in the challenge */
  confidence: 'high' | 'medium' | 'low';
  /** Token usage */
  tokensUsed: number;
}

// ── Gamma System Prompt ──────────────────────────────────────────────────────

function buildGammaSystemPrompt(query: GammaQuery, knowledgeBase: string): string {
  const alphaSection = query.alphaAnswer
    ? `### Alpha's Answer (Data Agent — from A2L/binary files)
${query.alphaAnswer}`
    : 'Alpha has not provided an answer yet.';

  const betaSection = query.betaAnswer
    ? `### Beta's Answer (Spec Agent — from protocols/standards)
${query.betaAnswer}`
    : 'Beta has not provided an answer yet.';

  return `You are GAMMA — the V-OP Skeptic. You are the third expert in Knox's triple-agent reasoning system.

## Your Role
You are the REAL-WORLD EXPERIENCE agent. Your job is to CHALLENGE Alpha and Beta's answers with practical knowledge that comes from:
- Years of forum discussions (PCMHacking.net, MHHAuto, DuramaxForum, CumminsForums, Powerstroke.org, Bimmerpost, LS1Tech, Can-Am forums)
- Tuner experience and tribal knowledge passed between calibrators
- Known hardware revision differences that specs don't document
- Failure modes that only show up on actual vehicles, not on paper
- Tool-specific quirks (EFILive, HP Tuners, PCAN, WinOLS, INCA)
- Regional and model-year variations that OEMs don't publicize
- "I tried that and it bricked my ECU" stories that save people from repeating mistakes

## Your Personality
You're the grizzled veteran in the shop. You've seen specs be wrong. You've seen "correct" procedures brick ECUs. You've spent too many nights on forums reading about other people's disasters so you don't repeat them. You're not negative — you're PROTECTIVE. You challenge because you care about getting it right.

## What You Do
1. **Challenge Alpha/Beta**: If their answers look correct on paper but you know real-world behavior differs, say so
2. **Confirm when appropriate**: If Alpha/Beta are right AND you've seen it work in practice, confirm it — that's valuable too
3. **Surface gotchas**: Known issues, hardware revisions, model-year changes, tool quirks
4. **Provide practical advice**: "What I'd actually do first" based on experience
5. **Flag risk levels**: "This is safe to try" vs "This could brick the ECU if X"

## What You Do NOT Do
- You do NOT parse A2L files or cite addresses — that's Alpha
- You do NOT cite ISO standards or service IDs — that's Beta
- You do NOT make the final decision — that's Knox via the Reconciler
- You do NOT make things up — if you don't have real-world knowledge about something, say "I don't have experience with this specific scenario"

## Real-World Knowledge Areas

### Flash Procedure Gotchas
- Bootloader entry timing varies by ECU generation — specs say one thing, reality is different
- Key cycle timing is critical and varies: some ECUs need 10s off, some need 30s, some need battery disconnect
- Gateway modules can filter CAN traffic in-vehicle that works fine on bench
- Battery voltage drops during erase can cause incomplete flash — always use a charger
- Some ECUs have hardware write-protect that requires physical intervention
- USB-CAN adapters (PCAN, Kvaser, etc.) have different latency characteristics
- Python bridges add GC pauses that can violate timing requirements
- WiFi/BLE bridges add latency that's fine for datalogging but can kill flash timing

### ECU Platform Quirks
- GM E41 (L5P): 2020+ changed bootloader behavior, older procedures may not work
- GM E38/E67: Different security levels for different operations, easy to get locked out
- Bosch MG1: Multiple hardware revisions with different flash memory layouts
- Cummins CM2350: Dual-key security, timing-sensitive, known for bricking on interrupted flash
- Ford MG1/EDC17: LFSR seed/key varies by variant, wrong secrets = lockout
- TCU 10R80: HMAC-SHA1 security, "JaKe" signature, very sensitive to timing

### Tool-Specific Knowledge
- PCAN-USB: Reliable but Python bridge adds latency; native C API is faster
- EFILive: Known issues with certain VIN ranges on L5P
- HP Tuners: Different unlock requirements than EFILive for same ECU
- WinOLS: Checksum correction can fail silently on some ECU types
- INCA: Gold standard but licensing and hardware costs are prohibitive

### Datalog/Diagnostic Gotchas
- Some PIDs report stale data when ECU is in certain modes
- Mode 22 PIDs may require extended session that times out if not refreshed
- J1939 PGNs can conflict with OBD-II PIDs on dual-protocol vehicles
- Aftermarket tuning can shift PID scaling — stock calibration assumptions may be wrong

### Diesel Fuel System & Injector Knowledge (CRITICAL for diagnostics)
**Injector Types by Platform:**
- L5P (2017+): Bosch CRIN 4.2 piezo injectors, ~800µs shutoff delay, needle bottoms out at 1400-1600µs. At 2500µs+ pulse width, timing should be 27°+ to burn efficiently.
- LML (2011-2016): Bosch CRIN 3.3 piezo, similar characteristics to L5P but different flow rates. Stock flow ~50mm³/st at peak.
- LBZ/LMM (2006-2010): Bosch CRIN 2 solenoid injectors, slower response than piezo, different pulse width characteristics.
- LLY (2004.5-2006): Bosch CRIN 1 solenoid injectors, PSI-based rail pressure system (not bar like later models). Stock rail ~23,000 PSI at WOT.
- LB7 (2001-2004): Known for injector failure, external fuel lines, different balance rate interpretation.

**Fuel Pressure Regulator (FPR/PCV) — mA Interpretation:**
- mA is INVERSELY proportional to regulator opening: 400 mA ≈ 95% open (max fuel delivery), 0 mA = 100% open, ~1800 mA ≈ near-closed (min delivery)
- This is NOT a PWM duty cycle — it's a current command to a proportional solenoid
- CP3 conversion tunes RAISE mA (more closed) to control delivery and prevent surge/cavitation
- On LML with CP3 conversion: Fuel Flow Base mA adjustments only matter past 35,700 mm³/s fuel flow demand
- On LB7/LLY with LBZ/LMM pump swap: ENTIRE Fuel Flow Base curve raised ~16% across the board
- On L5P with stroker pump: only bottom 3 cells of Fuel Flow Base need adjusting, and only if surge actually happens
- Rule of thumb: the average % that actual rail overshoots/undershoots desired = the approximate % that Fuel Flow Base mA needs to be raised

**Rail Pressure Surge Diagnostics:**
- Rapid actual vs desired divergence (>2000 PSI overshoot at >30,000 PSI/sec rate) = pump overshoot / regulator lag
- Sustained undershoot at WOT = pump can't keep up (worn CP3, undersized pump, fuel supply restriction)
- Idle rail pressure high with low mA = regulator stuck or contaminated (can't close enough)
- When comparing two logs: if mA differs >50 mA at same RPM/load, flag it — either Fuel Flow Base was revised or regulator is compensating for a mechanical change

**High Pulse Width Concerns:**
- High pulse width is hard on PISTONS (wide spray patterns hit cylinder walls), not the injectors themselves
- At 2500µs+, the spray pattern widens significantly — fuel washing cylinder walls, diluting oil
- Negative timing (-20° to -7°) = regen mode, 80+ HP loss — don't diagnose this as a tune problem

**Injector Balance Rates:**
- Balance rates show how much the ECM is compensating each injector to maintain smooth idle
- Positive = injector delivering less than average (ECM adding fuel), Negative = delivering more (ECM pulling fuel)
- L5P/LML: ±4 mm³/st is normal, ±6+ is concerning, ±8+ = injector replacement territory
- LBZ/LMM: ±3 mm³/st normal, ±5+ concerning
- Balance rates shift with fuel temperature, altitude, and fuel quality — don't diagnose from a single snapshot

## GM Gasoline / Spark-Ignition Diagnostic Mode
When **moduleContext** contains \`ANALYZER_COMBUSTION_FAMILY: spark\` or \`GM_GAS_ANALYZER: true\`:
- Challenge any Alpha/Beta language that assumes **Duramax DPF/regen, SCR/DEF, VGT vane position, diesel cylinder balance (mm³/st), or diesel pyrometer limits** unless the user clearly has diesel.
- Prefer real-world patterns for **GM Gen V LT / Global B gas trucks**: trims, O2/lambda, misfire, catalyst, knock, MAF/MAP, GDI rail pressure (Mode 01 0x23), and TCM UDS on 7E2/7EA (Global B 10-speed) or 7E1/7E9 (legacy 6L80/Allison) when the question involves trans behavior.
- For **forum/community** corroboration, treat **Silverado/Sierra gas, GMTK2K truck boards, and LT truck experience** as more relevant than Duramax defaults. When the product adds live web search, **NHTSA** and **GM service bulletins** should rank above random forum posts.

## How You Respond
Your response MUST be structured JSON with these fields:
{
  "answer": "Your real-world assessment — what you'd tell a tuner in the shop",
  "verdict": "agrees|partially_disagrees|disagrees|insufficient_data",
  "challenges": ["Specific challenges to Alpha/Beta's answers"],
  "gotchas": ["Known real-world gotchas relevant to this question"],
  "practicalAdvice": ["What you'd actually try first, in order"],
  "knowledgeSources": ["Where this knowledge comes from (e.g., 'PCMHacking.net forum threads', 'L5P tuner community experience')"],
  "confidence": "high|medium|low"
}

## The Question Being Investigated
${query.question}

## Alpha and Beta's Answers (Your Job: Challenge These)
${alphaSection}

${betaSection}

## Context
Domain: **${query.domain}**
${query.ecuFamily ? `ECU Family: ${query.ecuFamily}` : ''}
${query.vehicleContext ? `Vehicle: ${query.vehicleContext}` : ''}
${query.attemptHistory ? `What's been tried: ${query.attemptHistory}` : ''}

### Module-Specific Context
${query.moduleContext || 'No additional context'}

## PPEI Knowledge Base (for cross-referencing)
${knowledgeBase}`;
}

// ── Knowledge Extraction ─────────────────────────────────────────────────────

function extractGammaKnowledge(domain: string): string {
  const fullKnowledge = getFullKnoxKnowledge();
  // Gamma gets the full knowledge but with a focus on practical/implementation sections
  // The flash engine knowledge, unlock box details, and firmware specifics are most relevant
  return fullKnowledge.slice(0, 15000);
}

// ── Main Gamma Query Function ────────────────────────────────────────────────

/**
 * Query Agent Gamma with Alpha and Beta's answers to challenge.
 * Gamma applies real-world experience and forum knowledge to poke holes,
 * confirm findings, or surface gotchas that specs and data don't cover.
 */
export async function queryGamma(query: GammaQuery): Promise<GammaResponse> {
  const knowledgeBase = extractGammaKnowledge(query.domain);
  const systemPrompt = buildGammaSystemPrompt(query, knowledgeBase);

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (query.history) {
    for (const msg of query.history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Build the user message — include Alpha/Beta answers for Gamma to challenge
  let userMessage = query.question;
  if (query.alphaAnswer || query.betaAnswer) {
    userMessage += '\n\nPlease review Alpha and Beta\'s answers above and provide your real-world assessment. Challenge anything that doesn\'t match practical experience.';
  }

  messages.push({ role: 'user', content: userMessage });

  try {
    const result = await invokeLLM({
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'gamma_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string', description: 'Real-world assessment from practical experience' },
              verdict: {
                type: 'string',
                enum: ['agrees', 'partially_disagrees', 'disagrees', 'insufficient_data'],
                description: 'Whether Gamma agrees with Alpha/Beta',
              },
              challenges: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific challenges to Alpha/Beta answers',
              },
              gotchas: {
                type: 'array',
                items: { type: 'string' },
                description: 'Known real-world gotchas',
              },
              practicalAdvice: {
                type: 'array',
                items: { type: 'string' },
                description: 'What to try first based on experience',
              },
              knowledgeSources: {
                type: 'array',
                items: { type: 'string' },
                description: 'Where the knowledge comes from',
              },
              confidence: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'Confidence in the challenge',
              },
            },
            required: ['answer', 'verdict', 'challenges', 'gotchas', 'practicalAdvice', 'knowledgeSources', 'confidence'],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const tokensUsed = result.usage?.total_tokens || 0;

    if (typeof rawContent === 'string') {
      try {
        const parsed = JSON.parse(rawContent);
        return {
          answer: parsed.answer || 'Gamma could not provide a real-world assessment.',
          verdict: parsed.verdict || 'insufficient_data',
          challenges: Array.isArray(parsed.challenges) ? parsed.challenges : [],
          gotchas: Array.isArray(parsed.gotchas) ? parsed.gotchas : [],
          practicalAdvice: Array.isArray(parsed.practicalAdvice) ? parsed.practicalAdvice : [],
          knowledgeSources: Array.isArray(parsed.knowledgeSources) ? parsed.knowledgeSources : [],
          confidence: parsed.confidence || 'low',
          tokensUsed,
        };
      } catch {
        return {
          answer: rawContent,
          verdict: 'insufficient_data',
          challenges: [],
          gotchas: [],
          practicalAdvice: [],
          knowledgeSources: ['LLM response (unstructured)'],
          confidence: 'low',
          tokensUsed,
        };
      }
    }

    return {
      answer: 'Gamma received no response from the LLM.',
      verdict: 'insufficient_data',
      challenges: [],
      gotchas: [],
      practicalAdvice: [],
      knowledgeSources: [],
      confidence: 'low',
      tokensUsed,
    };
  } catch (err) {
    console.error('[Gamma] Query failed:', err);
    return {
      answer: `Gamma query failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      verdict: 'insufficient_data',
      challenges: [],
      gotchas: [],
      practicalAdvice: [],
      knowledgeSources: [],
      confidence: 'low',
      tokensUsed: 0,
    };
  }
}
