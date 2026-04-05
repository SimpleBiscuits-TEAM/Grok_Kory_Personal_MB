/**
 * Agent Alpha — Data Agent
 * =========================
 * Specializes in A2L files, binary data, calibration maps, memory layouts,
 * offsets, and ECU data structures. When Knox needs a data-grounded answer,
 * Alpha digs into the actual files and returns evidence-based findings.
 *
 * Alpha does NOT reason about protocols, procedures, or specifications.
 * That's Beta's job. Alpha reasons about DATA.
 *
 * Architecture:
 *   Knox (question) → Alpha (data-grounded answer)
 *                   → Beta  (spec-grounded answer)
 *                   → Reconciler (triangulated response)
 */

import { invokeLLM, type Message, type InvokeResult } from "../_core/llm";
import { getKnoxFileContextForLLM, getKnoxFiles, getKnoxFileById } from "../db";
import { parseA2LFile, type CalibrationMap, type A2LMetadata } from "./a2lParser";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AlphaQuery {
  /** The question Knox is asking */
  question: string;
  /** Domain context: which module is asking (editor, diagnostics, flash, intellispy, etc.) */
  domain: 'editor' | 'diagnostics' | 'flash' | 'intellispy' | 'coding' | 'drag' | 'fleet' | 'debug' | 'casting' | 'general';
  /** Optional: ECU family being discussed (e.g., "E41", "MG1CS019") */
  ecuFamily?: string;
  /** Optional: A2L content already loaded in the editor */
  loadedA2LContent?: string;
  /** Optional: Binary data context (hex dump, addresses, etc.) */
  binaryContext?: string;
  /** Optional: Conversation history for multi-turn reasoning */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional: Additional context from the calling module */
  moduleContext?: string;
}

export interface AlphaResponse {
  /** Alpha's data-grounded answer */
  answer: string;
  /** Confidence level based on data availability */
  confidence: 'high' | 'medium' | 'low';
  /** What data sources Alpha used */
  sources: string[];
  /** Specific data points Alpha found (map names, addresses, values) */
  evidence: string[];
  /** What data Alpha couldn't find but would need for higher confidence */
  gaps: string[];
  /** Token usage for tracking */
  tokensUsed: number;
}

// ── Alpha System Prompt ──────────────────────────────────────────────────────

function buildAlphaSystemPrompt(query: AlphaQuery, fileLibraryContext: string, a2lAnalysis: string): string {
  return `You are ALPHA — the V-OP Data Agent. You are one half of Knox's dual-expert reasoning system.

## Your Role
You reason EXCLUSIVELY from DATA — A2L files, binary structures, calibration maps, memory layouts, ECU metadata, and file library contents. You are the "ground truth" agent. When you answer, you cite specific data: map names, addresses, byte offsets, calibration values, axis definitions, scaling formulas.

## What You Do
- Search A2L files for specific calibration maps, measurements, and axis definitions
- Cross-reference binary data with A2L definitions to verify addresses and values
- Identify ECU families from file signatures, metadata, and calibration structures
- Find calibration map relationships (which maps share axes, which maps feed into each other)
- Calculate memory layouts, block boundaries, and offset alignments
- Detect calibration anomalies (out-of-range values, misaligned addresses, missing maps)
- Match ECU platforms to known A2L files in the Knox library

## What You Do NOT Do
- You do NOT reason about protocols (UDS, GMLAN, CAN) — that's Beta
- You do NOT reason about flash procedures or timing — that's Beta
- You do NOT reason about NRC codes or diagnostic services — that's Beta
- You do NOT make recommendations about tuning strategy — that's Knox's job after reconciliation
- You do NOT speculate beyond what the data shows

## How You Respond
Your response MUST be structured JSON with these fields:
{
  "answer": "Your data-grounded finding (detailed, specific, citing actual data)",
  "confidence": "high|medium|low",
  "sources": ["List of data sources you used (e.g., 'Knox library: KTFKDC3.a2l', 'Loaded A2L: E41 definition')"],
  "evidence": ["Specific data points (e.g., 'Map K_BOOST_MAX at 0x3A200, 2D MAP, 16x16, unit: kPa')", "Another data point"],
  "gaps": ["Data you couldn't find but would need (e.g., 'Binary file not loaded — cannot verify actual values at address')"]
}

## Domain Context
This question comes from the **${query.domain}** module.
${query.ecuFamily ? `ECU Family: ${query.ecuFamily}` : 'ECU Family: Not specified'}

## Available Data

### Knox File Library
${fileLibraryContext || 'Knox file library: not available'}

### A2L Analysis (from loaded/matched files)
${a2lAnalysis || 'No A2L data currently available for analysis'}

### Binary Context
${query.binaryContext || 'No binary data context provided'}

### Module-Specific Context
${query.moduleContext || 'No additional module context'}`;
}

// ── A2L Analysis Helper ──────────────────────────────────────────────────────

/**
 * Build a compact A2L analysis string from loaded content.
 * Extracts metadata and relevant calibration maps for Alpha's reasoning.
 */
function buildA2LAnalysis(a2lContent: string | undefined, ecuFamily: string | undefined): string {
  if (!a2lContent) return '';

  try {
    const { metadata, maps } = parseA2LFile(a2lContent);

    let analysis = `### Parsed A2L Metadata
- Project: ${metadata.projectName}
- ECU Family: ${metadata.ecuFamily}
- Version: ${metadata.version}
- Modules: ${metadata.moduleCount}
- Characteristics: ${metadata.characteristicCount}
- Measurements: ${metadata.measurementCount}

### Calibration Maps (${maps.length} total)\n`;

    // Group by category
    const byCategory: Record<string, CalibrationMap[]> = {};
    for (const map of maps) {
      const cat = map.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(map);
    }

    for (const [category, catMaps] of Object.entries(byCategory)) {
      analysis += `\n#### ${category} (${catMaps.length} maps)\n`;
      // Show first 20 maps per category with full detail, summarize rest
      const shown = catMaps.slice(0, 20);
      for (const m of shown) {
        analysis += `- \`${m.name}\` @ 0x${m.address.toString(16).toUpperCase()} | ${m.dimensions} | ${m.units || 'no unit'} | ${m.description || ''}\n`;
      }
      if (catMaps.length > 20) {
        analysis += `  ... and ${catMaps.length - 20} more ${category} maps\n`;
      }
    }

    return analysis;
  } catch (err) {
    return `A2L parsing attempted but failed: ${err instanceof Error ? err.message : 'unknown error'}`;
  }
}

// ── Knox Library Search ──────────────────────────────────────────────────────

/**
 * Search the Knox file library for relevant A2L files matching the ECU family.
 * Returns a compact summary for Alpha's context.
 */
async function searchKnoxLibrary(ecuFamily: string | undefined): Promise<string> {
  if (!ecuFamily) return '';

  try {
    const results = await getKnoxFiles({
      search: ecuFamily,
      limit: 10,
      offset: 0,
    });

    if (results.files.length === 0) return `No Knox library files match "${ecuFamily}"`;

    let summary = `### Knox Library Matches for "${ecuFamily}" (${results.total} total)\n`;
    for (const f of results.files) {
      summary += `- **${f.filename}** (${f.fileType}) | Platform: ${f.platform || 'unknown'} | ECU: ${f.ecuId || 'unknown'} | Cals: ${f.totalCalibratables || 0} | Collection: ${f.sourceCollection || 'unknown'}\n`;
    }
    return summary;
  } catch {
    return 'Knox library search failed';
  }
}

// ── Main Alpha Query Function ────────────────────────────────────────────────

/**
 * Query Agent Alpha with a data-focused question.
 * Alpha searches A2L files, binary data, and the Knox file library
 * to provide a data-grounded answer.
 */
export async function queryAlpha(query: AlphaQuery): Promise<AlphaResponse> {
  const startTime = Date.now();

  // Gather data context in parallel
  const [fileLibraryContext, knoxLibrarySearch, a2lAnalysis] = await Promise.all([
    getKnoxFileContextForLLM().catch(() => ''),
    searchKnoxLibrary(query.ecuFamily),
    Promise.resolve(buildA2LAnalysis(query.loadedA2LContent, query.ecuFamily)),
  ]);

  const combinedA2L = [a2lAnalysis, knoxLibrarySearch].filter(Boolean).join('\n\n');

  const systemPrompt = buildAlphaSystemPrompt(
    query,
    fileLibraryContext.slice(0, 6000),
    combinedA2L.slice(0, 15000),
  );

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add history if provided
  if (query.history) {
    for (const msg of query.history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: query.question });

  try {
    const result = await invokeLLM({
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'alpha_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string', description: 'Data-grounded finding with specific citations' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence based on data availability' },
              sources: {
                type: 'array',
                items: { type: 'string' },
                description: 'Data sources used',
              },
              evidence: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific data points found',
              },
              gaps: {
                type: 'array',
                items: { type: 'string' },
                description: 'Missing data that would increase confidence',
              },
            },
            required: ['answer', 'confidence', 'sources', 'evidence', 'gaps'],
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
          answer: parsed.answer || 'Alpha could not produce a data-grounded answer.',
          confidence: parsed.confidence || 'low',
          sources: Array.isArray(parsed.sources) ? parsed.sources : [],
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
          gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
          tokensUsed,
        };
      } catch {
        // LLM returned non-JSON — extract what we can
        return {
          answer: rawContent,
          confidence: 'low',
          sources: ['LLM response (unstructured)'],
          evidence: [],
          gaps: ['Response was not structured — data extraction may be incomplete'],
          tokensUsed,
        };
      }
    }

    return {
      answer: 'Alpha received no response from the LLM.',
      confidence: 'low',
      sources: [],
      evidence: [],
      gaps: ['LLM returned empty response'],
      tokensUsed,
    };
  } catch (err) {
    console.error('[Alpha] Query failed:', err);
    return {
      answer: `Alpha query failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      confidence: 'low',
      sources: [],
      evidence: [],
      gaps: ['Agent Alpha encountered an error'],
      tokensUsed: 0,
    };
  }
}
