/**
 * Heuristic flash log → human recommendations (Excel sheet + learning keys).
 * Shared between client export and server aggregation constants.
 */
import type { FlashPlan, FlashPhase, SimulatorLogEntry } from './pcanFlashOrchestrator';

export const FLASH_RECO_LEARNING_ERROR_TYPE = 'flash_reco_learning' as const;

export const FLASH_RECO_DISCLAIMERS: readonly string[] = [
  'DISCLAIMER: Suggested fixes are heuristics and may be wrong or incomplete. Verify with OEM documentation and safe workshop practice.',
  'Timestamps are relative to the start of the recorded log (milliseconds) unless noted otherwise.',
  'Optional anonymous feedback after export helps rank community-reported fixes; those notes are not verified.',
];

export interface RecoLearningAggregate {
  helpful: number;
  unhelpful: number;
  /** Most frequent fix descriptions from feedback (deduped). */
  topFixes: string[];
}

export interface FlashRecommendationRow {
  category: 'SESSION' | 'ERROR' | 'NRC' | 'WARNING';
  whenMs: number;
  phase: FlashPhase | '';
  summary: string;
  suggestedFix: string;
  /** Stable key for optional learning feedback aggregation. */
  patternKey: string;
}

export interface FlashRecoAnalysis {
  disclaimerLines: string[];
  rows: FlashRecommendationRow[];
  /** First actionable row for quick feedback (NRC/ERROR), else session key. */
  primaryPatternKey: string;
}

const NRC_HINTS: Record<number, string> = {
  0x10: 'General reject — retry after checking session state and request format.',
  0x11: 'Service not supported — confirm the UDS service is available in this ECU/session.',
  0x12: 'Sub-function not supported — routine or sub-command may not exist in this firmware.',
  0x13: 'Incorrect message length or invalid format — check payload length and encoding.',
  0x21: 'Busy repeat request — wait and retry; ECU may be finishing another operation.',
  0x22: 'Conditions not correct — ignition, RPM, speed, or DTC prerequisites may block the step.',
  0x33: 'Security access denied — verify seed/key algorithm, level, timing, and unlock sequence.',
  0x35: 'Invalid key — request a new seed; confirm algorithm matches ECU/security profile.',
  0x36: 'Exceed number of attempts — delay or power-cycle before another unlock sequence.',
  0x37: 'Required time delay not expired — wait the required delay, then retry.',
  0x70: 'Upload/download not accepted — transfer parameters or block sequence may be invalid.',
  0x71: 'Transfer data suspended — resume or restart block transfer per OEM procedure.',
  0x72: 'Programming failure — memory write/erase failed; check power supply and connections.',
  0x73: 'Wrong block sequence counter — restart transfer from the expected block.',
  0x78: 'Response pending — allow more timeout; ECU may still be processing.',
  0x7f: 'Service not supported in active session — switch diagnostic session (e.g. programming) if required.',
};

function nrcFromMessage(message: string): number | undefined {
  const m = message.match(/\bNRC\s*0x([0-9a-fA-F]{1,2})\b/i)
    ?? message.match(/\bnegative\s*0x([0-9a-fA-F]{1,2})\b/i);
  if (!m) return undefined;
  return parseInt(m[1], 16);
}

export function patternKeyForNrc(phase: FlashPhase, code: number): string {
  return `nrc:0x${code.toString(16).padStart(2, '0').toUpperCase()}@${phase}`;
}

export function patternKeyForError(phase: FlashPhase, message: string): string {
  const slug = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `err:${phase}:${slug || 'unknown'}`;
}

export function patternKeyForSession(
  result: 'SUCCESS' | 'FAILED' | 'ABORTED' | 'IN_PROGRESS' | 'READY',
): string {
  return `session:${result}`;
}

type SessionLabel = 'SUCCESS' | 'FAILED' | 'ABORTED' | 'IN_PROGRESS' | 'READY';

function resolveSessionLabel(session: {
  result: 'SUCCESS' | 'FAILED' | 'ABORTED' | null;
  isRunning: boolean;
}): SessionLabel {
  if (session.result != null) return session.result;
  if (session.isRunning) return 'IN_PROGRESS';
  return 'READY';
}

function hintForNrc(code: number): string {
  return NRC_HINTS[code] ?? `UDS negative response 0x${code.toString(16).toUpperCase().padStart(2, '0')} — look up OEM-specific meaning and recovery.`;
}

function communitySuffix(
  patternKey: string,
  aggregates?: Record<string, RecoLearningAggregate>,
): string {
  const a = aggregates?.[patternKey];
  if (!a || a.helpful < 2 || a.topFixes.length === 0) return '';
  const bits = a.topFixes.slice(0, 2).join(' · ');
  return `\n\nCommunity (anonymous, ${a.helpful}× marked helpful): ${bits}`;
}

function mergeFix(base: string, patternKey: string, aggregates?: Record<string, RecoLearningAggregate>): string {
  return `${base}${communitySuffix(patternKey, aggregates)}`.trim();
}

/**
 * Build recommendation rows from a flash log for the first Excel sheet.
 */
export function analyzeFlashLogForRecommendations(
  log: SimulatorLogEntry[],
  plan: Pick<FlashPlan, 'ecuName' | 'ecuType' | 'flashMode'>,
  session: {
    result: 'SUCCESS' | 'FAILED' | 'ABORTED' | null;
    statusMessage: string;
    elapsedMs: number;
    dryRun: boolean;
    isRunning: boolean;
  },
  opts?: { aggregates?: Record<string, RecoLearningAggregate> },
): FlashRecoAnalysis {
  const aggregates = opts?.aggregates;
  const rows: FlashRecommendationRow[] = [];

  const sessionLabel = resolveSessionLabel(session);
  const sessionKey = patternKeyForSession(sessionLabel);

  const outcomeSummary = [
    `ECU ${plan.ecuName} (${plan.ecuType})`,
    `Mode ${plan.flashMode}`,
    session.dryRun ? 'Dry run' : 'Live/simulator',
    `Outcome: ${sessionLabel}`,
    session.statusMessage ? `Status: ${session.statusMessage}` : null,
    `Elapsed ${Math.round(session.elapsedMs)} ms`,
  ]
    .filter(Boolean)
    .join(' — ');

  rows.push({
    category: 'SESSION',
    whenMs: Math.round(session.elapsedMs),
    phase: '',
    summary: outcomeSummary,
    suggestedFix: mergeFix(
      sessionLabel === 'FAILED'
        ? 'Review ERROR/NRC rows below, verify power and CAN wiring, then retry with OEM-correct session and security flow.'
        : sessionLabel === 'ABORTED'
          ? 'If unintended, check connections and battery stability before restarting from the beginning.'
          : sessionLabel === 'SUCCESS'
            ? 'No failure detected in session outcome; detailed rows list warnings or NRCs if any.'
            : 'Session not finished; export may be partial — capture again after completion for best recommendations.',
      sessionKey,
      aggregates,
    ),
    patternKey: sessionKey,
  });

  for (const e of log) {
    const parsedNrc =
      e.nrcCode != null && e.nrcCode > 0
        ? e.nrcCode
        : e.type === 'nrc'
          ? nrcFromMessage(e.message)
          : undefined;
    if (parsedNrc != null && parsedNrc > 0) {
      const pk = patternKeyForNrc(e.phase, parsedNrc);
      rows.push({
        category: 'NRC',
        whenMs: Math.round(e.timestamp),
        phase: e.phase,
        summary: e.message,
        suggestedFix: mergeFix(hintForNrc(parsedNrc), pk, aggregates),
        patternKey: pk,
      });
      continue;
    }
    if (e.type === 'error') {
      const pk = patternKeyForError(e.phase, e.message);
      rows.push({
        category: 'ERROR',
        whenMs: Math.round(e.timestamp),
        phase: e.phase,
        summary: e.message,
        suggestedFix: mergeFix(
          'Check preceding CAN/UDS traffic, supply voltage, bus termination, and that the correct container/security profile is used.',
          pk,
          aggregates,
        ),
        patternKey: pk,
      });
      continue;
    }
    if (e.type === 'warning') {
      const pk = patternKeyForError(e.phase, `warn:${e.message}`);
      rows.push({
        category: 'WARNING',
        whenMs: Math.round(e.timestamp),
        phase: e.phase,
        summary: e.message,
        suggestedFix: mergeFix(
          'Confirm vehicle state and OEM prerequisites; warnings often precede hard failures.',
          pk,
          aggregates,
        ),
        patternKey: pk,
      });
    }
  }

  const primary =
    rows.find((r) => r.category === 'NRC' || r.category === 'ERROR')?.patternKey
    ?? sessionKey;

  return {
    disclaimerLines: [...FLASH_RECO_DISCLAIMERS],
    rows,
    primaryPatternKey: primary,
  };
}
