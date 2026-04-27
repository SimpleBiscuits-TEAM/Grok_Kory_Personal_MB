/**
 * Infer compression-ignition (diesel) vs spark-ignition (gasoline) from datalog column
 * names and/or OBD PID numbers. Used by the analyzer pipeline and any feature that should
 * branch on combustion family before full vehicle metadata exists.
 */

export type CombustionFamily = 'diesel' | 'spark' | 'unknown';

export type CombustionInferenceSource = 'metadata' | 'columns' | 'pids' | 'merged';

export interface CombustionInferenceResult {
  family: CombustionFamily;
  /** Positive favors diesel, negative favors spark (magnitude is heuristic-only). */
  score: number;
  confidence: 'high' | 'medium' | 'low';
  dieselHints: string[];
  sparkHints: string[];
  source: CombustionInferenceSource;
}

/** GM / common diesel-only UDS Mode 22-style PIDs (HPT-verified). */
const DIESEL_OBD_PIDS = new Set<number>([
  // Fuel system (HPT-verified)
  0x208A, 0x12DA, 0x20E3, 0x208B, 0x1141,
  0x30BC, 0x30C1, 0x30BE, 0x30D5, 0x30D7, 0x308A, 0x30DA, 0x30CA, 0x328A,
  // Throttle / sensors
  0x1543, 0x1540, 0x114D, 0x13C8, 0x232C,
  // Emissions
  0x1502, 0x11F8, 0x11FA,
  // DPF / DEF / SCR
  0x1a10, 0x1a11, 0x1a12, 0x1a13, 0x1a14, 0x1a15, 0x1a16,
  0x1a20, 0x1a21, 0x1a22, 0x1a23, 0x1a24, 0x1a25, 0x1a26,
  // Injector Pulse Widths
  0x20AC, 0x20AD, 0x20AE, 0x20AF, 0x20B0, 0x20B1, 0x20B2, 0x20B3,
  // Injector Balance Rates
  0x20B4, 0x20B5, 0x20B6, 0x20B7, 0x20B8, 0x20B9, 0x20BA, 0x20BB,
]);

/** Mode 01 (and similar) channels that are typical of gasoline OBD logs. */
const SPARK_OBD_PIDS = new Set<number>([
  0x06, 0x07, 0x08, 0x09, 0x14, 0x15, 0x17, 0x18, 0x19,
  0x2e, 0x2f, 0x31, 0x34, 0x35, 0x3c, 0x3d, 0x3e, 0x3f, 0x44,
]);

type ColumnPattern = { needle: string; weight: number; id: string; side: 'diesel' | 'spark' };

const COLUMN_PATTERNS: ColumnPattern[] = [
  // Diesel-strong
  { needle: 'dpf', weight: 4, id: 'dpf', side: 'diesel' },
  { needle: 'soot', weight: 4, id: 'soot', side: 'diesel' },
  { needle: 'def_', weight: 3, id: 'def_chan', side: 'diesel' },
  { needle: 'def tank', weight: 3, id: 'def_tank', side: 'diesel' },
  { needle: 'def dosing', weight: 3, id: 'def_dose', side: 'diesel' },
  { needle: 'nox_', weight: 3, id: 'nox', side: 'diesel' },
  { needle: 'scr', weight: 3, id: 'scr', side: 'diesel' },
  { needle: 'regen', weight: 3, id: 'regen', side: 'diesel' },
  { needle: 'vgt_', weight: 3, id: 'vgt_us', side: 'diesel' },
  { needle: 'vgt pos', weight: 3, id: 'vgt_pos', side: 'diesel' },
  { needle: 'turbo vane', weight: 3, id: 'turbo_vane', side: 'diesel' },
  { needle: 'injector balance', weight: 4, id: 'ibr_phrase', side: 'diesel' },
  { needle: 'ibr_', weight: 4, id: 'ibr_token', side: 'diesel' },
  { needle: 'pilot', weight: 3, id: 'pilot_inj', side: 'diesel' },
  { needle: 'post 1', weight: 2, id: 'post_inj', side: 'diesel' },
  { needle: 'post 2', weight: 2, id: 'post_inj2', side: 'diesel' },
  { needle: 'post1', weight: 2, id: 'post1', side: 'diesel' },
  { needle: 'post2', weight: 2, id: 'post2', side: 'diesel' },
  { needle: 'duramax', weight: 4, id: 'duramax', side: 'diesel' },
  { needle: 'l5p', weight: 3, id: 'l5p', side: 'diesel' },
  { needle: 'lml', weight: 3, id: 'lml', side: 'diesel' },
  { needle: 'lb7', weight: 3, id: 'lb7', side: 'diesel' },
  { needle: 'cp3', weight: 3, id: 'cp3', side: 'diesel' },
  { needle: 'cp4', weight: 3, id: 'cp4', side: 'diesel' },
  { needle: 'hp4', weight: 3, id: 'hp4', side: 'diesel' },
  { needle: 'fpr_i', weight: 2, id: 'fpr_i', side: 'diesel' },
  { needle: 'frp_cmd', weight: 2, id: 'frp_cmd', side: 'diesel' },
  { needle: 'cummins', weight: 3, id: 'cummins', side: 'diesel' },
  { needle: 'cm2350', weight: 3, id: 'cm2350', side: 'diesel' },
  { needle: 'injection pressure', weight: 2, id: 'inj_press', side: 'diesel' },
  { needle: 'rail pressure desired', weight: 2, id: 'rail_des', side: 'diesel' },
  { needle: 'commanded fuel rail', weight: 3, id: 'cmd_rail', side: 'diesel' },
  // Spark-strong
  { needle: 'stft', weight: 3, id: 'stft', side: 'spark' },
  { needle: 'ltft', weight: 3, id: 'ltft', side: 'spark' },
  { needle: 'short term fuel', weight: 3, id: 'stft_long', side: 'spark' },
  { needle: 'long term fuel', weight: 3, id: 'ltft_long', side: 'spark' },
  { needle: 'o2 b1s1', weight: 3, id: 'o2_b1s1', side: 'spark' },
  { needle: 'o2 b1s2', weight: 2, id: 'o2_b1s2', side: 'spark' },
  { needle: 'oxygen sensor', weight: 3, id: 'o2_phrase', side: 'spark' },
  { needle: 'lambda', weight: 2, id: 'lambda', side: 'spark' },
  { needle: 'spark advance', weight: 3, id: 'spark_adv', side: 'spark' },
  { needle: 'ignition timing', weight: 3, id: 'ign_timing', side: 'spark' },
  { needle: 'knock', weight: 2, id: 'knock', side: 'spark' },
  { needle: 'misfire', weight: 3, id: 'misfire', side: 'spark' },
  { needle: 'catalyst', weight: 2, id: 'cat', side: 'spark' },
  { needle: 'evap', weight: 2, id: 'evap', side: 'spark' },
  { needle: 'purge', weight: 2, id: 'purge', side: 'spark' },
  { needle: 'wideband', weight: 2, id: 'wb', side: 'spark' },
];

function finalizeFromScore(
  score: number,
  dieselHints: string[],
  sparkHints: string[],
  source: CombustionInferenceSource
): CombustionInferenceResult {
  const uniq = (a: string[]) => [...new Set(a)];
  const dh = uniq(dieselHints);
  const sh = uniq(sparkHints);
  let family: CombustionFamily = 'unknown';
  if (score >= 5) family = 'diesel';
  else if (score <= -5) family = 'spark';
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (Math.abs(score) >= 12) confidence = 'high';
  else if (Math.abs(score) >= 5) confidence = 'medium';
  return { family, score, confidence, dieselHints: dh, sparkHints: sh, source };
}

function mergeCombustionInferences(
  a: CombustionInferenceResult,
  b: CombustionInferenceResult
): CombustionInferenceResult {
  const score = a.score + b.score;
  return finalizeFromScore(score, [...a.dieselHints, ...b.dieselHints], [...a.sparkHints, ...b.sparkHints], 'merged');
}

/**
 * Score column / channel labels (HP Tuners names, EFI Live ECM.*, datalogger SHORTNAMEs, etc.).
 */
export function inferCombustionFromColumnTokens(tokens: string[]): CombustionInferenceResult {
  let score = 0;
  const dieselHints: string[] = [];
  const sparkHints: string[] = [];
  const matched = new Set<string>();

  const haystack = tokens
    .map((t) => t.toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const cell of haystack) {
    for (const pat of COLUMN_PATTERNS) {
      if (!cell.includes(pat.needle)) continue;
      const key = `${pat.side}:${pat.id}`;
      if (matched.has(key)) continue;
      matched.add(key);
      if (pat.side === 'diesel') {
        score += pat.weight;
        dieselHints.push(`column:${pat.id}`);
      } else {
        score -= pat.weight;
        sparkHints.push(`column:${pat.id}`);
      }
    }
  }

  return finalizeFromScore(score, dieselHints, sparkHints, 'columns');
}

/**
 * Score numeric OBD PID values (Mode 01 = 0x01–0xFF, Mode 22 = larger DID values).
 */
export function inferCombustionFromObdPids(pids: number[]): CombustionInferenceResult {
  let score = 0;
  const dieselHints: string[] = [];
  const sparkHints: string[] = [];

  for (const p of pids) {
    const u = p & 0xffff;
    if (DIESEL_OBD_PIDS.has(u)) {
      score += 3;
      dieselHints.push(`pid:0x${u.toString(16)}`);
    }
    if (SPARK_OBD_PIDS.has(u)) {
      score -= 2;
      sparkHints.push(`pid:0x${u.toString(16)}`);
    }
  }

  return finalizeFromScore(score, dieselHints, sparkHints, 'pids');
}

/**
 * Prefer explicit CSV metadata (# FuelType) when present; otherwise merge column + PID inference.
 */
export function resolveCombustionFromLogContext(
  meta: { fuelType?: string } | undefined,
  columnTokens: string[],
  obdPids: number[]
): CombustionInferenceResult {
  const ft = meta?.fuelType?.toLowerCase()?.trim();
  if (ft === 'diesel') {
    return {
      family: 'diesel',
      score: 100,
      confidence: 'high',
      dieselHints: ['metadata:FuelType'],
      sparkHints: [],
      source: 'metadata',
    };
  }
  if (ft === 'gasoline' || ft === 'gas' || ft === 'petrol') {
    return {
      family: 'spark',
      score: -100,
      confidence: 'high',
      dieselHints: [],
      sparkHints: ['metadata:FuelType'],
      source: 'metadata',
    };
  }

  const fromCols = inferCombustionFromColumnTokens(columnTokens);
  const fromPids = inferCombustionFromObdPids(obdPids);
  if (columnTokens.length === 0 && obdPids.length === 0) {
    return {
      family: 'unknown',
      score: 0,
      confidence: 'low',
      dieselHints: [],
      sparkHints: [],
      source: 'merged',
    };
  }
  if (columnTokens.length === 0) return fromPids;
  if (obdPids.length === 0) return fromCols;
  return mergeCombustionInferences(fromCols, fromPids);
}

/** First CSV row(s) that look like headers — strips `NAME (unit)` suffixes. */
export function extractColumnTokensForCombustionInference(content: string): string[] {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dataLines = lines.filter((l) => !l.startsWith('#'));
  const tokens = new Set<string>();

  for (let i = 0; i < Math.min(8, dataLines.length); i++) {
    const line = dataLines[i];
    if (isLikelyCsvDataRow(line)) break;

    for (const raw of line.split(',')) {
      const cell = raw.trim().replace(/^"|"$/g, '');
      const m = cell.match(/^(.+?)\s+\(([^)]+)\)\s*$/);
      const name = (m ? m[1] : cell).trim();
      if (name.length > 0) tokens.add(name);
    }
  }

  return [...tokens];
}

function isLikelyCsvDataRow(line: string): boolean {
  const first = line.split(',')[0]?.trim().replace(/^"|"$/g, '') ?? '';
  if (!first) return false;
  if (/^time$/i.test(first) || /^frame$/i.test(first) || /^elapsed$/i.test(first) || /^timestamp$/i.test(first)) {
    return false;
  }
  if (/^[a-z_][\w.]*$/i.test(first) && !/^[-\d.]/.test(first)) return false;
  const n = parseFloat(first);
  return Number.isFinite(n);
}

/** Pull 0x-prefixed hex values from a text slice (e.g. Banks iDash PID row). */
export function extractObdPidNumbersFromText(text: string): number[] {
  const re = /\b0x([0-9a-f]{2,4})\b/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = parseInt(m[1], 16);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Short UI string for analyzer status bars (not user-facing diagnostics). */
export function formatCombustionInferenceSummary(inf: CombustionInferenceResult): string {
  if (inf.family === 'diesel') {
    return `Combustion: diesel (${inf.confidence})`;
  }
  if (inf.family === 'spark') {
    return `Combustion: spark / gasoline (${inf.confidence})`;
  }
  return `Combustion: unknown (${inf.confidence})`;
}

/** Convenience for branching when you only have processed metrics. */
export function getCombustionFamilyFromProcessedVehicleMeta(meta?: {
  fuelType?: string;
  combustionInference?: CombustionInferenceResult;
}): CombustionFamily {
  const ft = meta?.fuelType?.toLowerCase()?.trim();
  if (ft === 'diesel') return 'diesel';
  if (ft === 'gasoline' || ft === 'gas' || ft === 'petrol') return 'spark';
  return meta?.combustionInference?.family ?? 'unknown';
}

/**
 * Whether diesel-oriented analyzer rules (Duramax MAF thresholds, rail/VGT/EGT narratives, etc.)
 * should run. Spark-ignition logs skip those rules; unknown fuel keeps legacy diesel-tool behavior.
 */
export interface AnalyzerVehicleMetaLike {
  fuelType?: string;
  combustionInference?: CombustionInferenceResult;
}

export function shouldApplyDieselAnalyzerRules(meta?: AnalyzerVehicleMetaLike): boolean {
  const inf = meta?.combustionInference;
  if (inf?.family === 'spark') return false;
  if (inf?.family === 'diesel') return true;
  const ft = meta?.fuelType?.toLowerCase()?.trim();
  if (ft === 'gasoline' || ft === 'gas' || ft === 'petrol') return false;
  if (ft === 'diesel') return true;
  if (ft === 'hybrid') return false;
  return true;
}
