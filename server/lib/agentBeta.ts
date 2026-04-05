/**
 * Agent Beta — Spec Agent
 * ========================
 * Specializes in protocols, specifications, procedures, timing requirements,
 * NRC codes, UDS services, GMLAN/CAN standards, flash sequences, and OEM
 * documentation. When Knox needs to know HOW something works or WHY a
 * procedure failed, Beta reasons from the specifications.
 *
 * Beta does NOT reason about raw data files (A2L, binaries) — that's Alpha.
 * Beta does NOT challenge answers with real-world experience — that's Gamma.
 * Beta reasons about SPECIFICATIONS and PROCEDURES.
 *
 * Architecture:
 *   Knox (question) → Alpha (data-grounded answer)
 *                   → Beta  (spec-grounded answer)
 *                   → Gamma (real-world challenge)
 *                   → Reconciler (triangulated response)
 */

import { invokeLLM, type Message } from "../_core/llm";
import { getFullKnoxKnowledge } from "./knoxKnowledgeServer";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BetaQuery {
  /** The question Knox is asking */
  question: string;
  /** Domain context: which module is asking */
  domain: 'editor' | 'diagnostics' | 'flash' | 'intellispy' | 'coding' | 'drag' | 'fleet' | 'debug' | 'casting' | 'general';
  /** Optional: ECU family being discussed */
  ecuFamily?: string;
  /** Optional: Protocol context (e.g., "GMLAN", "UDS", "J1939", "K-Line") */
  protocol?: string;
  /** Optional: Specific service or procedure being discussed */
  procedure?: string;
  /** Optional: Error/NRC context (e.g., "0x7F 0x27 0x35") */
  errorContext?: string;
  /** Optional: CAN frame data for protocol analysis */
  canFrameContext?: string;
  /** Optional: Conversation history */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional: Additional context from the calling module */
  moduleContext?: string;
}

export interface BetaResponse {
  /** Beta's specification-grounded answer */
  answer: string;
  /** Confidence level based on spec coverage */
  confidence: 'high' | 'medium' | 'low';
  /** Which specifications/standards Beta referenced */
  references: string[];
  /** Specific protocol details cited (service IDs, timing values, state transitions) */
  protocolDetails: string[];
  /** What specs Beta couldn't find or are ambiguous */
  uncertainties: string[];
  /** Token usage for tracking */
  tokensUsed: number;
}

// ── Beta System Prompt ───────────────────────────────────────────────────────

function buildBetaSystemPrompt(query: BetaQuery, knowledgeBase: string): string {
  return `You are BETA — the V-OP Spec Agent. You are one third of Knox's triple-expert reasoning system.

## Your Role
You reason EXCLUSIVELY from SPECIFICATIONS, PROTOCOLS, and PROCEDURES. You are the "by the book" agent. When you answer, you cite specific standards, service IDs, timing requirements, state machine transitions, NRC definitions, and documented procedures.

## Your Knowledge Domains

### UDS (ISO 14229)
- All diagnostic services: $10 (DiagnosticSessionControl), $11 (ECUReset), $14 (ClearDTC), $19 (ReadDTCInfo), $22 (ReadDataByIdentifier), $23 (ReadMemoryByAddress), $27 (SecurityAccess), $28 (CommunicationControl), $2E (WriteDataByIdentifier), $2F (IOControl), $31 (RoutineControl), $34 (RequestDownload), $36 (TransferData), $37 (RequestTransferExit), $3E (TesterPresent), $85 (ControlDTCSetting)
- Session types: default (01), programming (02), extended (03)
- NRC codes: all standard negative response codes with context-specific meanings
- Timing parameters: P2, P2*, S3, P3, P4 timeouts and their implications
- Security access levels and state machine (seed → key → granted/denied)
- Transfer data block sequence counters, max block sizes, flow control

### GMLAN (GM Local Area Network)
- UUDT (Unacknowledged Unsolicited Data Transfer) broadcast commands
- Enhanced diagnostics vs. standard OBD-II
- GM-specific arbitration IDs (0x101 broadcast, 0x7E0/0x7E8 ECM, 0x241/0x641 TCM, etc.)
- DisableNormalCommunication ($28), ProgrammingMode ($A5), InitiateDiagnostic ($10)
- GM flash sequence: broadcast → programming mode → bootloader → security → erase → transfer → verify

### ISO 15765 (CAN Transport Protocol / ISO-TP)
- Single frame, first frame, consecutive frame, flow control frame formats
- Block size (BS), separation time (STmin), flow status (CTS/Wait/Overflow)
- Multi-frame segmentation for payloads > 7 bytes
- Padding requirements and DLC handling

### CAN Bus (ISO 11898)
- 11-bit and 29-bit arbitration IDs
- CAN 2.0A/B frame formats
- Bus arbitration, error frames, bus-off recovery
- Baud rates: 250kbps (GMLAN low-speed), 500kbps (standard), 1Mbps (CAN-FD/XCP)

### J1939 (Heavy Duty)
- PGN structure, source address, priority
- Transport protocol (BAM, CMDT)
- DM messages (DM1, DM2, DM3, DM11, DM12)

### Flash Procedures
- GM SPS-style programming sequences
- Bootloader entry conditions and validation
- Erase → Download → Transfer → Verify → Reset lifecycle
- Key cycle requirements and timing
- Recovery procedures for interrupted flashes

### OBD-II (ISO 15031 / SAE J1979)
- Mode 01-0A services
- PID definitions and scaling
- Readiness monitors and drive cycles

## What You Do NOT Do
- You do NOT reason about A2L file contents or binary data — that's Alpha
- You do NOT challenge with real-world experience — that's Gamma
- You do NOT make tuning recommendations — that's Knox after reconciliation
- You stick to what the specifications say, even if real-world behavior differs

## How You Respond
Your response MUST be structured JSON with these fields:
{
  "answer": "Your spec-grounded finding (citing specific standards, service IDs, timing values)",
  "confidence": "high|medium|low",
  "references": ["ISO 14229 Section 9.3.1 — SecurityAccess", "GM SPS Programming Guide Rev 4.2"],
  "protocolDetails": ["$27 01 requests seed in programming session", "P2* timeout for $34 is 5000ms per ISO 14229"],
  "uncertainties": ["GM may use proprietary extensions not covered in public ISO 14229"]
}

## Domain Context
This question comes from the **${query.domain}** module.
${query.ecuFamily ? `ECU Family: ${query.ecuFamily}` : 'ECU Family: Not specified'}
${query.protocol ? `Protocol: ${query.protocol}` : ''}
${query.procedure ? `Procedure: ${query.procedure}` : ''}
${query.errorContext ? `Error Context: ${query.errorContext}` : ''}

### CAN Frame Context
${query.canFrameContext || 'No CAN frame data provided'}

### Module-Specific Context
${query.moduleContext || 'No additional module context'}

## PPEI Technical Knowledge Base
${knowledgeBase}`;
}

// ── Knowledge Extraction ─────────────────────────────────────────────────────

/**
 * Extract the most relevant knowledge sections for Beta based on the domain.
 * Beta gets protocol/procedure-heavy sections, not calibration data.
 */
function extractRelevantKnowledge(domain: string): string {
  const fullKnowledge = getFullKnoxKnowledge();

  // Beta gets a larger slice focused on protocols and procedures
  // The knowledge base has security access, flash procedures, GMLAN, etc.
  // which are Beta's primary domain
  const maxLength = 18000;

  // For flash domain, prioritize flash-related knowledge
  if (domain === 'flash') {
    // Try to find flash-specific sections
    const flashIdx = fullKnowledge.indexOf('## VOP 3.0 Flash');
    const devProgIdx = fullKnowledge.indexOf('## DevProg Flash');
    const pcanIdx = fullKnowledge.indexOf('## PCAN Flash');
    const securityIdx = fullKnowledge.indexOf('## Security Access');

    let prioritySections = '';
    if (securityIdx >= 0) prioritySections += fullKnowledge.substring(securityIdx, securityIdx + 4000) + '\n\n';
    if (flashIdx >= 0) prioritySections += fullKnowledge.substring(flashIdx, flashIdx + 4000) + '\n\n';
    if (devProgIdx >= 0) prioritySections += fullKnowledge.substring(devProgIdx, devProgIdx + 4000) + '\n\n';
    if (pcanIdx >= 0) prioritySections += fullKnowledge.substring(pcanIdx, pcanIdx + 4000) + '\n\n';

    if (prioritySections.length > 0) {
      return prioritySections.slice(0, maxLength);
    }
  }

  // For diagnostics, prioritize diagnostic knowledge
  if (domain === 'diagnostics') {
    const diagIdx = fullKnowledge.indexOf('## Diagnostic');
    if (diagIdx >= 0) {
      return fullKnowledge.substring(diagIdx, diagIdx + maxLength);
    }
  }

  // Default: return from the start (security access secrets are first)
  return fullKnowledge.slice(0, maxLength);
}

// ── Main Beta Query Function ─────────────────────────────────────────────────

/**
 * Query Agent Beta with a spec/protocol-focused question.
 * Beta reasons from standards, specifications, and documented procedures
 * to provide a specification-grounded answer.
 */
export async function queryBeta(query: BetaQuery): Promise<BetaResponse> {
  const knowledgeBase = extractRelevantKnowledge(query.domain);

  const systemPrompt = buildBetaSystemPrompt(query, knowledgeBase);

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
          name: 'beta_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string', description: 'Spec-grounded finding citing specific standards and protocol details' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence based on spec coverage' },
              references: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specifications and standards referenced',
              },
              protocolDetails: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific protocol details cited',
              },
              uncertainties: {
                type: 'array',
                items: { type: 'string' },
                description: 'Spec gaps or ambiguities',
              },
            },
            required: ['answer', 'confidence', 'references', 'protocolDetails', 'uncertainties'],
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
          answer: parsed.answer || 'Beta could not produce a spec-grounded answer.',
          confidence: parsed.confidence || 'low',
          references: Array.isArray(parsed.references) ? parsed.references : [],
          protocolDetails: Array.isArray(parsed.protocolDetails) ? parsed.protocolDetails : [],
          uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties : [],
          tokensUsed,
        };
      } catch {
        return {
          answer: rawContent,
          confidence: 'low',
          references: ['LLM response (unstructured)'],
          protocolDetails: [],
          uncertainties: ['Response was not structured — spec extraction may be incomplete'],
          tokensUsed,
        };
      }
    }

    return {
      answer: 'Beta received no response from the LLM.',
      confidence: 'low',
      references: [],
      protocolDetails: [],
      uncertainties: ['LLM returned empty response'],
      tokensUsed,
    };
  } catch (err) {
    console.error('[Beta] Query failed:', err);
    return {
      answer: `Beta query failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      confidence: 'low',
      references: [],
      protocolDetails: [],
      uncertainties: ['Agent Beta encountered an error'],
      tokensUsed: 0,
    };
  }
}
