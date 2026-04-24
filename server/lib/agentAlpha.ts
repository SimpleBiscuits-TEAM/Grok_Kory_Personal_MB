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
import { getFullKnoxKnowledge } from "./knoxKnowledgeServer";

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

function buildAlphaSystemPrompt(query: AlphaQuery, fileLibraryContext: string, a2lAnalysis: string, protocolBridgeContext: string): string {
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
- You do NOT OWN protocol reasoning (UDS, GMLAN, CAN) — that's Beta's primary domain
- You do NOT reason about flash procedures or timing — that's Beta
- You do NOT reason about NRC codes — that's Beta
- You do NOT make recommendations about tuning strategy — that's Knox's job after reconciliation
- You do NOT speculate beyond what the data shows

## Protocol-to-Data Bridge Knowledge
You UNDERSTAND how diagnostic protocols map to A2L data structures so you can cross-reference effectively:

### A2L ↔ UDS/OBD Mapping
- A2L MEASUREMENT blocks define live data signals. Each has an ECU_ADDRESS (RAM address) that can be read via UDS $23 (ReadMemoryByAddress) or mapped to a Mode 22 DID.
- A2L CHARACTERISTIC blocks define calibration parameters (maps, curves, values). These are the tunable data at specific ECU addresses.
- COMPU_METHOD blocks define scaling formulas (e.g., RAT_FUNC with coefficients a-f) that convert raw bytes to engineering units — same math as OBD PID formulas.
- RECORD_LAYOUT blocks define how multi-dimensional maps are stored in memory (row-major, column-major, axis interleaving).
- DID (Data Identifier) numbers in Mode 22 ($22) often correspond to A2L MEASUREMENT names. Example: DID 0x162F maps to CylBalRate_Cyl1 in the A2L.
- DDDI (Service $2C) packs multiple A2L MEASUREMENTs into a single periodic stream by referencing their ECU_ADDRESS offsets.
- IOCTL (Service $2F/$AE) controls actuators that correspond to A2L CHARACTERISTIC outputs.

### GM CAN Addressing for A2L Context
- GM Global A (11-bit): ECM at 0x7E0/0x7E8, TCM at 0x7E1/0x7E9, UUDT periodic on 0x5xx
- GM Global B (29-bit): Format 0x14DA[Target][Source], e.g., ECM = 0x14DA11F1/0x14DAF111
- GMLAN enhanced: $241-$25F (request) / $641-$65F (USDT response) / $541-$55F (UUDT/periodic)
- A2L files for GM Global B ECUs (E42, T93) use 29-bit extended CAN IDs in their IF_DATA sections

### J1939 for A2L Context (Heavy-Duty)
- J1939 uses 29-bit CAN IDs: Priority(3) + EDP(1) + DP(1) + PF(8) + PS(8) + SA(8)
- PGN = Parameter Group Number, maps to groups of SPNs (Suspect Parameter Numbers)
- SPNs are the J1939 equivalent of A2L MEASUREMENTs — each has a defined bit position, scaling, and unit
- Key source addresses: 0x00=Engine, 0x03=Transmission, 0x0B=Brakes

### ISO 14229 UDS Services Relevant to A2L Data
- $22 ReadDataByIdentifier: Read DIDs that map to A2L MEASUREMENTs
- $23 ReadMemoryByAddress: Read raw ECU RAM at A2L ECU_ADDRESS offsets
- $2C DynamicallyDefineDataIdentifier: Create custom DIDs from A2L addresses for streaming
- $2A ReadDataByPeriodicIdentifier: Subscribe to periodic DID updates
- $2E WriteDataByIdentifier: Write to A2L CHARACTERISTIC addresses
- $2F IOControlByIdentifier: Control actuators mapped in A2L

### KWP2000 Legacy Mapping
- $21 readDataByLocalIdentifier (older GM equivalent of $22)
- $2C dynamicallyDefineLocalIdentifier (older DDDI)
- Service IDs overlap with UDS but some differ — positive response = SID + 0x40

### DTC Status Bits (for A2L diagnostic context)
- Each DTC has 8-bit status: bit0=testFailed, bit2=pendingDTC, bit3=confirmedDTC, bit7=warningIndicatorRequested
- A2L files may reference DTC-related MEASUREMENTs that track these status bits

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
${query.moduleContext || 'No additional module context'}

### Diagnostic Standards Reference
${protocolBridgeContext}`;
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

// ── Protocol Bridge Context for Alpha ────────────────────────────────────────

/**
 * Extract A2L-relevant protocol knowledge from the Knox knowledge base.
 * Alpha doesn't get the full spec knowledge (that's Beta's job), but it needs
 * enough diagnostic protocol context to cross-reference A2L data structures
 * with UDS services, DID addresses, DDDI definitions, and J1939 SPNs.
 */
function extractProtocolBridgeContext(domain: string): string {
  const fullKnowledge = getFullKnoxKnowledge();
  const maxLength = 8000;
  let sections = '';

  // Always include: GM CAN ID assignments, DDDI protocol, Mode 22 PIDs
  const gmDiagIdx = fullKnowledge.indexOf('## GM Diagnostic Communication');
  if (gmDiagIdx >= 0) {
    sections += fullKnowledge.substring(gmDiagIdx, gmDiagIdx + 3000) + '\n\n';
  }

  // Include: Normen_CAN standards reference (J1939, UDS, KWP2000, Global B)
  const normenIdx = fullKnowledge.indexOf('## Normen_CAN Standards Reference');
  if (normenIdx >= 0) {
    sections += fullKnowledge.substring(normenIdx, normenIdx + 4000) + '\n\n';
  }

  // Include: OBD-II PID reference (for Mode 01 formula cross-referencing)
  const obdPidIdx = fullKnowledge.indexOf('## OBD-II Standard PID Reference');
  if (obdPidIdx >= 0) {
    sections += fullKnowledge.substring(obdPidIdx, obdPidIdx + 2000) + '\n\n';
  }

  // Include: GM bar code traceability (for ECU identification context)
  const barCodeIdx = fullKnowledge.indexOf('## GM Bar Code Traceability');
  if (barCodeIdx >= 0) {
    sections += fullKnowledge.substring(barCodeIdx, barCodeIdx + 1500) + '\n\n';
  }

  // For editor domain, also include E42 A2L knowledge and advanced logger PIDs
  if (domain === 'editor' || domain === 'diagnostics') {
    const e42Idx = fullKnowledge.indexOf('## E42 (2024 L5P Gen2) A2L Knowledge');
    if (e42Idx >= 0) {
      sections += fullKnowledge.substring(e42Idx, e42Idx + 2000) + '\n\n';
    }
    const advLogIdx = fullKnowledge.indexOf('## Advanced Logger PIDs');
    if (advLogIdx >= 0) {
      sections += fullKnowledge.substring(advLogIdx, advLogIdx + 2000) + '\n\n';
    }
  }

  if (sections.length === 0) {
    return 'No protocol bridge context available';
  }

  return sections.slice(0, maxLength);
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

  // Extract protocol-to-data bridge context from Knox knowledge base
  // Alpha gets the A2L-relevant sections: GM CAN IDs, DDDI protocol, Mode 22 PIDs,
  // J1939 structure, UDS service table, GM bar code traceability, and Normen_CAN standards
  const protocolBridgeContext = extractProtocolBridgeContext(query.domain);

  const systemPrompt = buildAlphaSystemPrompt(
    query,
    fileLibraryContext.slice(0, 6000),
    combinedA2L.slice(0, 15000),
    protocolBridgeContext,
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
