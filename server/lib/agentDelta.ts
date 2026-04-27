/**
 * Agent Delta — The Archivist
 * ============================
 * Searches PPEI's internal knowledge: Knox file library, flash session logs,
 * debug reports, customer cases, and accumulated institutional knowledge.
 *
 * Delta's job is to PROVE or DISPROVE what Alpha, Beta, and Gamma claim
 * by finding concrete internal evidence. It's the institutional memory
 * that makes the whole system smarter over time.
 *
 * Data sources:
 *   1. Knox file library (A2L files, binaries, documentation uploads)
 *   2. Flash session logs (past flash attempts, successes, failures, NRC codes)
 *   3. Debug sessions (bug reports, resolutions, Knox auto-analysis)
 *   4. Accumulated patterns (cross-referencing past interactions)
 */

import { invokeLLM, type Message } from "../_core/llm";
import { getDb } from "../db";
import { getKnoxFiles, getKnoxFileContextForLLM } from "../db";
import {
  flashSessions,
  flashSessionLogs,
  debugSessions,
  debugAuditLog,
  knoxFiles,
} from "../../drizzle/schema";
import { desc, eq, like, sql, and, or } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeltaQuery {
  /** The user's question */
  question: string;
  /** What Alpha claimed */
  alphaAnswer?: string;
  /** What Beta claimed */
  betaAnswer?: string;
  /** What Gamma claimed */
  gammaAnswer?: string;
  /** Which domain is asking */
  domain: string;
  /** Optional: ECU family to narrow search */
  ecuFamily?: string;
  /** Optional: Vehicle context */
  vehicleContext?: string;
  /** Optional: Conversation history */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional: Additional context */
  moduleContext?: string;
}

export interface DeltaResponse {
  /** Delta's evidence-based answer */
  answer: string;
  /** Confidence based on how much internal evidence was found */
  confidence: 'high' | 'medium' | 'low';
  /** Internal evidence found */
  evidence: string[];
  /** Which claims from other agents Delta can confirm */
  confirmed: string[];
  /** Which claims from other agents Delta contradicts */
  contradicted: string[];
  /** Relevant past cases or sessions found */
  relatedCases: Array<{
    type: 'flash_session' | 'debug_session' | 'knox_file';
    id: number;
    summary: string;
    relevance: 'high' | 'medium' | 'low';
  }>;
  /** What's missing from internal records */
  gaps: string[];
  /** Tokens used */
  tokensUsed: number;
}

// ── Internal Evidence Gathering ─────────────────────────────────────────────

/**
 * Search flash session history for relevant past attempts.
 * Looks for matching ECU types, similar errors, NRC codes, and outcomes.
 */
async function searchFlashHistory(
  ecuFamily?: string,
  keywords?: string[],
): Promise<string> {
  const db = await getDb();
  if (!db) return 'Flash history: database unavailable.';

  try {
    const conditions = [];
    if (ecuFamily) {
      conditions.push(like(flashSessions.ecuType, `%${ecuFamily}%`));
    }

    const sessions = await db
      .select({
        id: flashSessions.id,
        ecuType: flashSessions.ecuType,
        ecuName: flashSessions.ecuName,
        flashMode: flashSessions.flashMode,
        connectionMode: flashSessions.connectionMode,
        status: flashSessions.status,
        vin: flashSessions.vin,
        totalBlocks: flashSessions.totalBlocks,
        totalBytes: flashSessions.totalBytes,
        progress: flashSessions.progress,
        durationMs: flashSessions.durationMs,
        errorMessage: flashSessions.errorMessage,
        nrcCode: flashSessions.nrcCode,
        metadata: flashSessions.metadata,
        createdAt: flashSessions.createdAt,
      })
      .from(flashSessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(flashSessions.createdAt))
      .limit(20);

    if (sessions.length === 0) return 'Flash history: no matching sessions found.';

    // Get logs for failed sessions (most informative)
    const failedSessions = sessions.filter(s => s.status === 'failed');
    const successSessions = sessions.filter(s => s.status === 'success');

    let logContext = '';
    for (const session of failedSessions.slice(0, 5)) {
      const logs = await db
        .select({
          phase: flashSessionLogs.phase,
          type: flashSessionLogs.type,
          message: flashSessionLogs.message,
          nrcCode: flashSessionLogs.nrcCode,
        })
        .from(flashSessionLogs)
        .where(eq(flashSessionLogs.sessionId, session.id))
        .orderBy(desc(flashSessionLogs.createdAt))
        .limit(10);

      if (logs.length > 0) {
        logContext += `\n\n--- Failed Session #${session.id} (${session.ecuType}, ${session.flashMode}, ${session.createdAt?.toISOString()}) ---\n`;
        logContext += `Error: ${session.errorMessage || 'unknown'}\n`;
        if (session.nrcCode) logContext += `NRC: 0x${session.nrcCode.toString(16).toUpperCase()}\n`;
        logContext += `Progress: ${session.progress}%\n`;
        logContext += `Logs:\n${logs.map(l => `  [${l.phase}/${l.type}] ${l.message}${l.nrcCode ? ` (NRC: 0x${l.nrcCode.toString(16)})` : ''}`).join('\n')}`;
      }
    }

    const summary = [
      `Flash history: ${sessions.length} sessions found for ${ecuFamily || 'all ECUs'}.`,
      `Success: ${successSessions.length}, Failed: ${failedSessions.length}, Other: ${sessions.length - successSessions.length - failedSessions.length}`,
      successSessions.length > 0 ? `Last successful flash: ${successSessions[0].ecuType} (${successSessions[0].flashMode}) — ${successSessions[0].durationMs ? Math.round(successSessions[0].durationMs / 1000) + 's' : 'unknown duration'}` : '',
      logContext,
    ].filter(Boolean).join('\n');

    return summary;
  } catch (err) {
    console.error('[Delta] Flash history search failed:', err);
    return 'Flash history: search error.';
  }
}

/**
 * Search debug session history for relevant past issues.
 */
async function searchDebugHistory(
  keywords?: string[],
): Promise<string> {
  const db = await getDb();
  if (!db) return 'Debug history: database unavailable.';

  try {
    const sessions = await db
      .select({
        id: debugSessions.id,
        title: debugSessions.title,
        description: debugSessions.description,
        featureArea: debugSessions.featureArea,
        status: debugSessions.status,
        tier: debugSessions.tier,
        analysisResult: debugSessions.analysisResult,
        rootCause: debugSessions.rootCause,
        proposedFix: debugSessions.proposedFix,
        fixApplied: debugSessions.fixApplied,
        retestFeedback: debugSessions.retestFeedback,
        createdAt: debugSessions.createdAt,
      })
      .from(debugSessions)
      .orderBy(desc(debugSessions.createdAt))
      .limit(30);

    if (sessions.length === 0) return 'Debug history: no sessions found.';

    // Filter by keyword relevance if keywords provided
    let relevant = sessions;
    if (keywords && keywords.length > 0) {
      relevant = sessions.filter(s => {
        const text = `${s.title} ${s.description} ${s.featureArea} ${s.analysisResult || ''} ${s.rootCause || ''} ${s.fixApplied || ''}`.toLowerCase();
        return keywords.some(k => text.includes(k.toLowerCase()));
      });
    }

    if (relevant.length === 0) relevant = sessions.slice(0, 10); // Fallback to recent

    const summary = relevant.slice(0, 10).map(s =>
      `[#${s.id}] ${s.featureArea}/${s.tier} — "${s.title}" (${s.status})\n  ${s.description?.slice(0, 200) || 'No description'}\n  Knox analysis: ${s.analysisResult?.slice(0, 200) || 'None'}\n  Root cause: ${s.rootCause?.slice(0, 200) || 'Unknown'}\n  Fix: ${s.fixApplied?.slice(0, 200) || 'Pending'}`
    ).join('\n\n');

    return `Debug history: ${relevant.length} relevant sessions.\n\n${summary}`;
  } catch (err) {
    console.error('[Delta] Debug history search failed:', err);
    return 'Debug history: search error.';
  }
}

/**
 * Search Knox file library for relevant documents.
 */
async function searchKnoxLibrary(
  ecuFamily?: string,
  keywords?: string[],
): Promise<string> {
  try {
    // Get the full library context
    const libraryContext = await getKnoxFileContextForLLM();

    // Also search for specific files if we have an ECU family
    if (ecuFamily) {
      const { files } = await getKnoxFiles({
        search: ecuFamily,
        limit: 10,
      });

      if (files.length > 0) {
        const fileList = files.map(f =>
          `[${f.fileType}] ${f.filename} — Platform: ${f.platform || 'unknown'}, ECU: ${f.ecuId || 'unknown'}, Calibratables: ${f.totalCalibratables || 0}`
        ).join('\n');

        return `Knox library (${ecuFamily}):\n${fileList}\n\nFull library context:\n${libraryContext}`;
      }
    }

    return `Knox library:\n${libraryContext}`;
  } catch (err) {
    console.error('[Delta] Knox library search failed:', err);
    return 'Knox library: search error.';
  }
}

// ── Extract Keywords ────────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const keywords: string[] = [];

  // ECU types
  const ecuMatches = text.match(/\b(E[0-9]{2}|E[0-9]{3}|L5P|LML|LBZ|LLY|LB7|LMM|CM2350|CM2250|MG1C|MDG1)\b/gi);
  if (ecuMatches) keywords.push(...ecuMatches);

  // NRC codes
  const nrcMatches = text.match(/\bNRC[:\s]*0x[0-9A-Fa-f]{2}\b/gi);
  if (nrcMatches) keywords.push(...nrcMatches);

  // UDS services
  const udsMatches = text.match(/\b(SecurityAccess|RequestDownload|TransferData|DiagnosticSession|TesterPresent|seed.?key)\b/gi);
  if (udsMatches) keywords.push(...udsMatches);

  // Flash-related
  const flashMatches = text.match(/\b(flash|bootloader|calibration|brick|recover|programming|unlock)\b/gi);
  if (flashMatches) keywords.push(...flashMatches);

  // DTC patterns
  const dtcMatches = text.match(/\b[PBCU][0-9]{4}\b/gi);
  if (dtcMatches) keywords.push(...dtcMatches);

  // Sensor/system keywords
  const sensorMatches = text.match(/\b(boost|turbo|DPF|EGR|SCR|DEF|NOx|MAF|MAP|IAT|ECT|fuel|injection|torque|transmission)\b/gi);
  if (sensorMatches) keywords.push(...sensorMatches);

  return [...new Set(keywords)];
}

// ── Delta System Prompt ─────────────────────────────────────────────────────

function buildDeltaPrompt(
  query: DeltaQuery,
  flashHistory: string,
  debugHistory: string,
  libraryContext: string,
): string {
  return `You are DELTA — The Archivist. You are the institutional memory of the PPEI V-OP system.

## Your Role
You search PPEI's internal records — past flash sessions, debug reports, Knox file library, customer cases — to find CONCRETE EVIDENCE that proves or disproves what the other agents (Alpha, Beta, Gamma) have claimed.

You are NOT here to theorize. You are here to say:
- "We tried this exact thing on March 15th and it failed because..."
- "Our flash logs show that E41 bootloader responds in 6 seconds, not 4"
- "We have 3 successful flash sessions for this ECU type, all used calibration mode"
- "Our debug history has 2 reports of this exact symptom — both were resolved by..."

## Your Internal Evidence

### Flash Session History
${flashHistory}

### Debug Session History
${debugHistory}

### Knox File Library
${libraryContext}

## What Other Agents Claimed

${query.alphaAnswer ? `### Alpha (Data Agent) said:\n${query.alphaAnswer}\n` : ''}
${query.betaAnswer ? `### Beta (Spec Agent) said:\n${query.betaAnswer}\n` : ''}
${query.gammaAnswer ? `### Gamma (Skeptic) said:\n${query.gammaAnswer}\n` : ''}

## Your Response Format

You MUST respond with a JSON object:
{
  "answer": "Your evidence-based analysis. Reference specific session IDs, dates, and outcomes.",
  "confidence": "high|medium|low",
  "evidence": ["Specific piece of evidence 1", "Specific piece of evidence 2"],
  "confirmed": ["Which claims from other agents your evidence supports"],
  "contradicted": ["Which claims from other agents your evidence contradicts"],
  "relatedCases": [
    {"type": "flash_session|debug_session|knox_file", "id": 123, "summary": "Brief description", "relevance": "high|medium|low"}
  ],
  "gaps": ["What's missing from our internal records that would help"]
}

## Rules
1. ONLY cite evidence you actually found in the internal records above
2. If you find NO relevant evidence, say so honestly — don't fabricate
3. When you find contradicting evidence, be SPECIFIC: cite session IDs, dates, outcomes
4. When you find confirming evidence, cite it with the same specificity
5. Flag patterns: "3 out of 5 flash attempts for E41 failed at the same phase"
6. Note what's MISSING: "We have no flash logs for this ECU type" is valuable information
7. Prioritize recent evidence over old evidence

## Context
Domain: ${query.domain}
${query.ecuFamily ? `ECU Family: ${query.ecuFamily}` : ''}
${query.vehicleContext ? `Vehicle: ${query.vehicleContext}` : ''}`;
}

// ── Main Query Function ─────────────────────────────────────────────────────

export async function queryDelta(query: DeltaQuery): Promise<DeltaResponse> {
  const keywords = extractKeywords(query.question + ' ' + (query.moduleContext || ''));

  // Gather all internal evidence in parallel
  const [flashHistory, debugHistory, libraryContext] = await Promise.all([
    searchFlashHistory(query.ecuFamily, keywords),
    searchDebugHistory(keywords),
    searchKnoxLibrary(query.ecuFamily, keywords),
  ]);

  const systemPrompt = buildDeltaPrompt(query, flashHistory, debugHistory, libraryContext);

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (query.history) {
    for (const msg of query.history.slice(-4)) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: query.question });

  try {
    const result = await invokeLLM({
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "delta_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              answer: { type: "string", description: "Evidence-based analysis" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              evidence: { type: "array", items: { type: "string" } },
              confirmed: { type: "array", items: { type: "string" } },
              contradicted: { type: "array", items: { type: "string" } },
              relatedCases: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["flash_session", "debug_session", "knox_file"] },
                    id: { type: "integer" },
                    summary: { type: "string" },
                    relevance: { type: "string", enum: ["high", "medium", "low"] },
                  },
                  required: ["type", "id", "summary", "relevance"],
                  additionalProperties: false,
                },
              },
              gaps: { type: "array", items: { type: "string" } },
            },
            required: ["answer", "confidence", "evidence", "confirmed", "contradicted", "relatedCases", "gaps"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = result.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof rawContent === 'string' ? rawContent : '{}');

    return {
      answer: parsed.answer || 'No internal evidence found.',
      confidence: parsed.confidence || 'low',
      evidence: parsed.evidence || [],
      confirmed: parsed.confirmed || [],
      contradicted: parsed.contradicted || [],
      relatedCases: parsed.relatedCases || [],
      gaps: parsed.gaps || [],
      tokensUsed: result.usage?.total_tokens || 0,
    };
  } catch (err) {
    console.error('[Delta] Query failed:', err);
    return {
      answer: 'Delta was unable to search internal records at this time.',
      confidence: 'low',
      evidence: [],
      confirmed: [],
      contradicted: [],
      relatedCases: [],
      gaps: ['Internal search unavailable — database or LLM error'],
      tokensUsed: 0,
    };
  }
}
