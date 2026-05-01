/**
 * Honda Talon Fuel Table Correction Engine
 *
 * Corrects fuel tables based on AFR readings from WP8 datalog.
 *
 * Rules:
 *   - AFR1 → Cylinder 1, AFR2 → Cylinder 2
 *   - Correction factor = actual_lambda / target_lambda per cell, averaged
 *   - Alpha-N channel STRICTLY = 1 → only Alpha-N tables; anything else → only Speed Density tables
 *   - Only cells visited in the datalog get corrected
 *   - Skip deceleration events (NO corrections during decel):
 *       1. TPS = 0 AND vehicle speed > 0 (closed throttle while moving)
 *       2. Injector PW Final = 0 (ECU has cut fuel entirely)
 *       3. Post-decel buffer: skip 5 samples (~0.5s at 10Hz) AFTER a decel event
 *          ends to account for AFR sensor transport delay (O2 sensor reads lean
 *          for a brief period after fuel is restored)
 *   - When Short Term Fuel Trims (STFT) are present, factor them into the
 *     actual AFR before computing lambda. Negative STFT = ECU pulling fuel,
 *     positive STFT = ECU adding fuel. Corrected AFR = measured AFR / (1 + STFT/100).
 *   - Turbo auto-detection: MAP > 105 kPa = turbo
 *   - Turbo SD column lookup: use Desired Injector Pulsewidth interpolated against
 *     SD Cyl1 table (MAP not accurate enough on turbo applications)
 *   - When "Manifold Absolute Pressure Corrected" channel is available, use it for
 *     SD axis reference instead of raw MAP
 *   - Transient fueling detection: "Additional Pulsewidth" = Final - Desired.
 *     When Additional PW exceeds 15% of Desired, the sample is in transient fueling
 *     enrichment and is excluded from correction. If transient fueling produces
 *     excessively lean or rich AFR, a tuner note is generated.
 *
 * NOTE: Deceleration filter, STFT logic, and transient fueling detection are
 * designed to be reusable for future Kawasaki fuel correction tool.
 */

import { WP8ParseResult, getHondaTalonKeyChannels } from './wp8Parser';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FuelMap {
  name: string;
  description: string;
  rowAxis: number[];    // RPM axis
  colAxis: number[];    // TPS (Alpha-N) or MAP kPa (Speed Density)
  data: number[][];     // 2D fuel values
  targetLambda: number[];  // Target Lambda row (one per column)
  rowLabel: string;
  colLabel: string;
  unit: string;
  /** Set of "row:col" keys for cells that were blended (interpolated/boundary), not from datalog data */
  blendedCells?: Set<string>;
}

export interface FuelMapState {
  alphaN_cyl1: FuelMap | null;
  alphaN_cyl2: FuelMap | null;
  speedDensity_cyl1: FuelMap | null;
  speedDensity_cyl2: FuelMap | null;
}

export type VehicleMode = 'na' | 'turbo';
export type MapSensor = 'stock' | '3bar';

export interface CorrectionConfig {
  vehicleMode: VehicleMode;
  mapSensor: MapSensor;  // Only relevant when vehicleMode === 'turbo'
  minSamples: number;    // Minimum sample count required before a cell is used for correction
}

/** Correction tier classification */
export type CorrectionTier = 'sandpaper' | 'hammer_chisel' | 'outlier_capped';

/** Per-cell correction result */
export interface CellCorrection {
  row: number;
  col: number;
  originalValue: number;
  correctedValue: number;
  correctionFactor: number;  // actual_lambda / target_lambda averaged
  sampleCount: number;       // how many datalog samples hit this cell
  avgActualLambda: number;
  targetLambda: number;
  avgStft?: number;          // average STFT % for this cell (if available)
  /** Which correction tier was applied */
  tier: CorrectionTier;
  /** Original (raw) correction factor before tiered smoothing was applied */
  rawCorrectionFactor?: number;
  /** Whether this cell was flagged as an outlier (>20% error, capped to neighbor avg) */
  isOutlier?: boolean;
  /** Note explaining outlier capping or regional averaging */
  tierNote?: string;
}

/** Outlier note for the correction report */
export interface OutlierNote {
  row: number;
  col: number;
  mapKey: keyof FuelMapState;
  rawErrorPct: number;       // original error % before capping
  cappedErrorPct: number;    // error % after capping to neighbor average
  neighborAvgFactor: number; // the neighbor average correction factor used
  message: string;
}

/** Full correction result for one fuel map */
export interface MapCorrectionResult {
  mapKey: keyof FuelMapState;
  corrections: CellCorrection[];
  totalCellsCorrected: number;
  totalCellsInMap: number;
  totalSamplesUsed: number;
  /** Cells that were capped as outliers */
  outlierNotes: OutlierNote[];
  /** Count of cells in each tier */
  tierCounts: { sandpaper: number; hammer_chisel: number; outlier_capped: number };
}

/** Tuner note for transient fueling anomalies */
export interface TransientNote {
  type: 'lean' | 'rich';
  severity: 'warning' | 'critical';
  message: string;
  avgLambda: number;
  avgAdditionalPW: number;
  sampleCount: number;
  rpmRange: [number, number];
}

/** Complete correction report */
export interface CorrectionReport {
  results: MapCorrectionResult[];
  vehicleMode: VehicleMode;
  mapSensor: MapSensor;
  isTurboDetected: boolean;
  hasAfr1: boolean;
  hasAfr2: boolean;
  hasLambda1: boolean;
  hasLambda2: boolean;
  hasStft: boolean;
  hasInjPwFinal: boolean;
  isDynoLog: boolean;
  /** Which source was used: 'afr' or 'lambda' */
  lambdaSource: 'afr' | 'lambda';
  totalSamples: number;
  alphaNSamples: number;
  sdSamples: number;
  decelSamplesSkipped: number;
  transientSamplesSkipped: number;
  /** Tuner notes about transient fueling anomalies */
  transientNotes: TransientNote[];
  /** Outlier notes across all maps (cells capped due to >20% isolated error) */
  outlierNotes: OutlierNote[];
}

// ─── Target Lambda Presets ──────────────────────────────────────────────────

/**
 * Generate NA target lambda presets for Speed Density tables.
 * All columns = 0.95
 */
export function getNASpeedDensityTargets(colAxis: number[]): number[] {
  return colAxis.map(() => 0.95);
}

/**
 * Generate NA target lambda presets for Alpha-N tables.
 * TPS axis: 0, 0.195, 0.39, 0.976, 1.952, 3.026, 4.002, 4.978, 5.954, 8.003,
 *           9.955, 12.005, 13.957, 16.006, 20.008, 24.01, 28.011, 32.013, 36.014,
 *           40.016, 44.994, 49.971, 54.949, 60.024, 72.712
 * 0-36.014° = 0.95, 40.016° = 0.925, 44.994° = 0.90, 49.971° = 0.875, 54.949°+ = 0.85
 */
export function getNAAlphaNTargets(colAxis: number[]): number[] {
  return colAxis.map(tps => {
    if (tps <= 37) return 0.95;
    if (tps <= 41) return 0.925;
    if (tps <= 45) return 0.90;
    if (tps <= 50) return 0.875;
    return 0.85;
  });
}

/**
 * Generate Turbo + Stock MAP sensor target lambda for Speed Density tables.
 * min-100 kPa = 0.95, 100-120 = 0.9, 120-145 = 0.85, 145+ = 0.8
 */
export function getTurboStockMapTargets(colAxis: number[]): number[] {
  return colAxis.map(kpa => {
    if (kpa < 100) return 0.95;
    if (kpa <= 120) return 0.90;
    if (kpa <= 145) return 0.85;
    return 0.80;
  });
}

/**
 * Generate Turbo + 3-Bar MAP sensor target lambda for Speed Density tables.
 * min-60 kPa = 0.95, 60-80 = 0.9, 80-90 = 0.85, 90+ = 0.8
 */
export function getTurbo3BarMapTargets(colAxis: number[]): number[] {
  return colAxis.map(kpa => {
    if (kpa < 60) return 0.95;
    if (kpa <= 80) return 0.90;
    if (kpa <= 90) return 0.85;
    return 0.80;
  });
}

/**
 * Generate Turbo target lambda for Alpha-N tables.
 * All columns = 0.95
 */
export function getTurboAlphaNTargets(colAxis: number[]): number[] {
  return colAxis.map(() => 0.95);
}

/**
 * Get the appropriate target lambda preset for a given map key and config.
 */
export function getTargetLambdaPreset(
  mapKey: keyof FuelMapState,
  colAxis: number[],
  config: CorrectionConfig,
): number[] {
  const isAlphaN = mapKey.startsWith('alphaN');
  const isSD = mapKey.startsWith('speedDensity');

  if (config.vehicleMode === 'na') {
    if (isAlphaN) return getNAAlphaNTargets(colAxis);
    if (isSD) return getNASpeedDensityTargets(colAxis);
  } else {
    // Turbo
    if (isAlphaN) return getTurboAlphaNTargets(colAxis);
    if (isSD) {
      if (config.mapSensor === 'stock') return getTurboStockMapTargets(colAxis);
      return getTurbo3BarMapTargets(colAxis);
    }
  }
  return colAxis.map(() => 0.95);
}

// ─── Turbo Auto-Detection ───────────────────────────────────────────────────

/**
 * Detect if the vehicle is turbocharged from the datalog.
 * Turbo = MAP > 105 kPa at any point.
 */
export function detectTurbo(wp8Data: WP8ParseResult): boolean {
  const keys = getHondaTalonKeyChannels(wp8Data);
  // Prefer corrected MAP if available
  const mapIdx = keys.mapCorrected !== -1 ? keys.mapCorrected : keys.map;
  if (mapIdx === -1) return false;

  for (const row of wp8Data.rows) {
    const mapVal = row.values[mapIdx];
    if (Number.isFinite(mapVal) && mapVal > 105) return true;
  }
  return false;
}

// ─── Interpolation Helpers ──────────────────────────────────────────────────

/** Find the nearest index in a sorted axis */
function findNearestIdx(axis: number[], value: number): number {
  if (axis.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(axis[0] - value);
  for (let i = 1; i < axis.length; i++) {
    const d = Math.abs(axis[i] - value);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/**
 * Interpolate to find the SD column index from desired injector pulsewidth.
 *
 * For turbo applications, MAP is not accurate enough, so we use the desired
 * injector pulsewidth and find where it falls in the SD Cyl1 table.
 *
 * Given a RPM row and a desired pulsewidth, we find which column in the
 * SD Cyl1 table has the closest value at that RPM row, interpolating between
 * adjacent columns.
 */
function findSDColumnByPulsewidth(
  sdCyl1Map: FuelMap,
  rpmRowIdx: number,
  desiredPW: number,
): number {
  if (!sdCyl1Map || rpmRowIdx < 0 || rpmRowIdx >= sdCyl1Map.data.length) return 0;

  const rowValues = sdCyl1Map.data[rpmRowIdx];
  if (rowValues.length === 0) return 0;

  // Find the column where the table value is closest to the desired pulsewidth
  let bestCol = 0;
  let bestDist = Math.abs(rowValues[0] - desiredPW);
  for (let c = 1; c < rowValues.length; c++) {
    const d = Math.abs(rowValues[c] - desiredPW);
    if (d < bestDist) { bestDist = d; bestCol = c; }
  }
  return bestCol;
}// ─── Transient Fueling Constants ────────────────────────────────────────────────────────

/**
 * ─── Transient Fueling Detection ──────────────────────────────────────────
 *
 * Detects transient fueling by looking at the RATE OF CHANGE of Injector PW
 * Final between consecutive samples. On the Honda Talon, the "Desired" PW is
 * just the raw fuel map lookup, while "Final" includes ALL ECU corrections
 * (closed-loop, warmup, altitude, etc.). The steady-state difference between
 * Final and Desired can be 100-200% of Desired — this is NORMAL, not transient.
 *
 * True transient enrichment is characterized by a SUDDEN SPIKE in Final PW
 * (the ECU dumps extra fuel for a throttle tip-in). We detect this by:
 *   1. Computing the sample-to-sample change in InjPwFinal
 *   2. Expressing that change as a % of the current Final PW
 *   3. If the rate-of-change exceeds the threshold, the sample is transient
 *   4. A settling window (TRANSIENT_SETTLE_SAMPLES) after each spike is also
 *      marked transient, since the enrichment decays over several samples.
 *
 * Thresholds:
 *   - Normal operation: |ΔFinal/Final| < 20% per sample
 *   - Transient fueling: |ΔFinal/Final| >= 20% → skip correction + settle
 *   - Excessive transient (lean): lambda > 1.1 during transient → tuner note
 *   - Excessive transient (rich): lambda < 0.75 during transient → tuner note
 */
export const TRANSIENT_RATE_THRESHOLD_PCT = 20;  // % change in Final PW per sample
export const TRANSIENT_SETTLE_SAMPLES = 3;       // samples to skip after spike settles
export const TRANSIENT_EXCESSIVE_LEAN_LAMBDA = 1.1;
export const TRANSIENT_EXCESSIVE_RICH_LAMBDA = 0.75;
// Legacy export for backward compatibility (tests may reference this)
export const TRANSIENT_THRESHOLD_PCT = TRANSIENT_RATE_THRESHOLD_PCT;

/**
 * Post-deceleration buffer: number of samples to skip AFTER a decel event ends.
 *
 * AFR sensors have a transport delay — the O2 sensor is physically downstream
 * of the exhaust port, so after the ECU restores fuel (decel event ends), the
 * sensor continues reading lean for a brief period as the fresh (fueled) exhaust
 * gas travels to the sensor. At 10 Hz sample rate, 5 samples ≈ 0.5 seconds,
 * which is sufficient to cover the sensor transport delay on the Honda Talon.
 *
 * During the buffer period, samples are counted as decel-skipped in the report.
 */
export const POST_DECEL_BUFFER_SAMPLES = 5;  // ~0.5 seconds at 10 Hz

// ─── Tiered Correction Strategy Constants ─────────────────────────────────────────────────

/**
 * Tiered correction strategy: "Sculpture" approach.
 *
 * Hammer & Chisel (error > 5%):
 *   The fuel map is significantly off in this region. Instead of correcting
 *   individual cells, we look for patterns in adjacent cells (8-neighbor).
 *   If multiple adjacent cells show >5% error in the same direction, we
 *   average the correction across the group and apply the averaged value
 *   to all cells in the group. This prevents jagged corrections.
 *
 * Sandpaper (error ≤ 5%):
 *   Fine-tuning territory. Corrections are applied cell-by-cell as-is.
 *   The map is close enough that individual cell precision matters.
 *
 * Outlier Fact-Check (error > 20% AND isolated):
 *   If a cell shows >20% error but its 8 neighbors don't show a similar
 *   pattern, it's likely bad data (sensor glitch, brief transient). The
 *   correction is CAPPED to match the neighbor average, and the cell is
 *   flagged with a note for the tuner.
 */
export const SANDPAPER_THRESHOLD = 0.05;      // ≤5% error = fine cell-by-cell
export const HAMMER_CHISEL_THRESHOLD = 0.05;  // >5% error = regional averaging
export const OUTLIER_THRESHOLD = 0.20;        // >20% error = suspect outlier if isolated

// ─── Lambda Sanity Bounds ─────────────────────────────────────────────────────────────────
// Physical limits for lambda sensor readings. Values outside this range are sensor errors,
// protobuf parsing artifacts, or wideband saturation. Discard these samples.
export const LAMBDA_MIN_VALID = 0.5;   // Below 0.5 = impossibly rich (sensor error)
export const LAMBDA_MAX_VALID = 1.3;   // Above 1.3 = extreme lean/misfire (sensor error)

// ─── Blend/Smooth Constants ──────────────────────────────────────────────────────────────────
/**
 * Blend/Smooth: prevents sharp discontinuities in the fuel map at boundaries
 * between corrected and uncorrected cells.
 *
 * Two-pass approach:
 *   1. GAP INTERPOLATION: If an uncorrected cell sits between two corrected cells
 *      (in the same row or column), interpolate its correction factor based on
 *      the corrected neighbors on either side.
 *   2. BOUNDARY BLENDING: Uncorrected cells on the outer edge of the corrected
 *      region get a partial correction that fades toward 1.0 (no correction).
 *      Blend weight decreases with distance from the corrected region.
 */
export const BLEND_BOUNDARY_WEIGHT = 0.5;  // Outer boundary cells get 50% of nearest corrected neighbor's factor

/**
 * Interpolate gaps in a column (vertical direction).
 * Uses different anchor-finding logic than rows because vertical patterns differ:
 *   - Values do NOT necessarily increase monotonically from top to bottom
 *   - Top boundary: scan UP for cell with value GREATER than corrected value
 *     (if none found, skip 3 cells and use the 4th as anchor)
 *   - Bottom boundary: scan DOWN for cell with value LESS than corrected value
 *     (if none found, skip 3 cells and use the 4th as anchor)
 *
 * @param factors - The factor grid column (mutated in place)
 * @param corrected - Which cells are directly corrected
 * @param interpolated - Which cells have been interpolated (mutated in place)
 * @param originalValues - The original map values for this column
 */
function interpolateGapsInColumn(
  factors: number[],
  corrected: boolean[],
  interpolated: boolean[],
  originalValues: number[],
): void {
  const len = factors.length;

  // ── Standard gap interpolation (between two corrected cells in the same column) ──
  let i = 0;
  while (i < len) {
    if (!corrected[i]) { i++; continue; }

    const gapStart = i;
    let j = i + 1;
    while (j < len && !corrected[j]) j++;

    if (j < len && j - gapStart > 1) {
      const startFactor = factors[gapStart];
      const endFactor = factors[j];
      const gapLen = j - gapStart;

      for (let k = gapStart + 1; k < j; k++) {
        if (!corrected[k] && !interpolated[k]) {
          const t = (k - gapStart) / gapLen;
          factors[k] = startFactor + (endFactor - startFactor) * t;
          interpolated[k] = true;
        }
      }
    }

    i = j;
  }

  // ── Open-ended gap interpolation (column-specific anchor logic) ──

  // Find all corrected cell indices in this column
  const correctedIndices: number[] = [];
  for (let idx = 0; idx < len; idx++) {
    if (corrected[idx]) correctedIndices.push(idx);
  }
  if (correctedIndices.length === 0) return;

  const topmostCorrected = correctedIndices[0]; // closest to top of table (index 0)
  const bottommostCorrected = correctedIndices[correctedIndices.length - 1]; // closest to bottom

  // ── Top boundary (above the highest corrected cell) ──
  // Scan UP (toward index 0) for a cell with value GREATER than the corrected value.
  // If none found, skip 3 cells and use the 4th as anchor.
  if (topmostCorrected > 0) {
    const correctedValue = originalValues[topmostCorrected] * factors[topmostCorrected];
    const corrFactor = factors[topmostCorrected];

    let anchorIdx = -1;
    for (let k = topmostCorrected - 1; k >= 0; k--) {
      if (corrected[k] || interpolated[k]) {
        anchorIdx = -1;
        break;
      }
      if (originalValues[k] > correctedValue) {
        // Found a cell with value greater than corrected — use as anchor
        // Must be at least 2 positions away for interpolation
        if ((topmostCorrected - k) > 1) {
          anchorIdx = k;
          break;
        }
        // Distance 1 — keep scanning
      }
    }

    // Fallback: if no anchor found, skip 3 cells and use the 4th
    if (anchorIdx < 0) {
      const fallbackIdx = Math.max(0, topmostCorrected - 4);
      if (fallbackIdx < topmostCorrected - 1) {
        // Only use fallback if there's at least 1 cell to interpolate
        anchorIdx = fallbackIdx;
      }
    }

    if (anchorIdx >= 0 && anchorIdx < topmostCorrected - 1) {
      // Interpolate from anchor (factor=1.0) to topmostCorrected (factor=corrFactor)
      const gapLen = topmostCorrected - anchorIdx;
      for (let k = anchorIdx + 1; k < topmostCorrected; k++) {
        if (!corrected[k] && !interpolated[k]) {
          const t = (k - anchorIdx) / gapLen;
          factors[k] = 1.0 + (corrFactor - 1.0) * t;
          interpolated[k] = true;
        }
      }
    }
  }

  // ── Bottom boundary (below the lowest corrected cell) ──
  // Scan DOWN (toward last index) for a cell with value LESS than the corrected value.
  // If none found, skip 3 cells and use the 4th as anchor.
  if (bottommostCorrected < len - 1) {
    const correctedValue = originalValues[bottommostCorrected] * factors[bottommostCorrected];
    const corrFactor = factors[bottommostCorrected];

    let anchorIdx = -1;
    for (let k = bottommostCorrected + 1; k < len; k++) {
      if (corrected[k] || interpolated[k]) {
        anchorIdx = -1;
        break;
      }
      if (originalValues[k] < correctedValue) {
        // Found a cell with value less than corrected — use as anchor
        // Must be at least 2 positions away for interpolation
        if ((k - bottommostCorrected) > 1) {
          anchorIdx = k;
          break;
        }
        // Distance 1 — keep scanning
      }
    }

    // Fallback: if no anchor found, skip 3 cells and use the 4th
    if (anchorIdx < 0) {
      const fallbackIdx = Math.min(len - 1, bottommostCorrected + 4);
      if (fallbackIdx > bottommostCorrected + 1) {
        // Only use fallback if there's at least 1 cell to interpolate
        anchorIdx = fallbackIdx;
      }
    }

    if (anchorIdx >= 0 && anchorIdx > bottommostCorrected + 1) {
      // Interpolate from bottommostCorrected (factor=corrFactor) to anchor (factor=1.0)
      const gapLen = anchorIdx - bottommostCorrected;
      for (let k = bottommostCorrected + 1; k < anchorIdx; k++) {
        if (!corrected[k] && !interpolated[k]) {
          const t = (k - bottommostCorrected) / gapLen;
          factors[k] = corrFactor + (1.0 - corrFactor) * t;
          interpolated[k] = true;
        }
      }
    }
  }
}
// ─── Smoothing Engine ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect transient fueling using rate-of-change of Injector PW Final.
 * Returns per-sample boolean array (true = transient, skip for correction)
 * and collects transient fueling statistics for tuner notes.
 *
 * Algorithm:
 *   1. For each sample, compute ΔFinal = |Final[i] - Final[i-1]|
 *   2. Express as % of current Final: ratePct = (ΔFinal / Final[i]) * 100
 *   3. If ratePct >= TRANSIENT_RATE_THRESHOLD_PCT → mark as transient
 *   4. After a transient spike, mark the next TRANSIENT_SETTLE_SAMPLES as
 *      transient too (enrichment decay period)
 */
export function detectTransientFueling(
  injPwDesired: number[],
  injPwFinal: number[],
  rpm: number[],
  cyl1Lambda: number[],
  cyl2Lambda: number[],
  isAlreadyLambda: boolean,
): {
  isTransient: boolean[];
  additionalPW: number[];
  transientNotes: TransientNote[];
  transientCount: number;
} {
  const len = Math.min(injPwDesired.length, injPwFinal.length);
  const isTransient: boolean[] = new Array(len).fill(false);
  const additionalPW: number[] = new Array(len).fill(0);
  let transientCount = 0;
  let settleCountdown = 0;

  // Collect transient samples for tuner note analysis
  const transientSamples: { rpm: number; lambda: number; addPW: number }[] = [];

  for (let i = 0; i < len; i++) {
    const desired = injPwDesired[i];
    const final_ = injPwFinal[i];

    if (!Number.isFinite(desired) || !Number.isFinite(final_) || desired <= 0) {
      continue;
    }

    const addPW = final_ - desired;
    additionalPW[i] = addPW;

    // Rate-of-change detection: compare to previous sample's Final PW
    let isSpike = false;
    if (i > 0) {
      const prevFinal = injPwFinal[i - 1];
      if (Number.isFinite(prevFinal) && prevFinal > 0) {
        const deltaFinal = Math.abs(final_ - prevFinal);
        const ratePct = (deltaFinal / final_) * 100;
        if (ratePct >= TRANSIENT_RATE_THRESHOLD_PCT) {
          isSpike = true;
          settleCountdown = TRANSIENT_SETTLE_SAMPLES;
        }
      }
    }

    // Mark as transient if this is a spike OR we're in the settle window
    if (isSpike || settleCountdown > 0) {
      isTransient[i] = true;
      transientCount++;
      if (!isSpike) settleCountdown--;

      // Collect lambda data for this transient sample
      const rpmVal = i < rpm.length ? rpm[i] : NaN;
      let lambda = NaN;
      const l1 = i < cyl1Lambda.length ? cyl1Lambda[i] : NaN;
      const l2 = i < cyl2Lambda.length ? cyl2Lambda[i] : NaN;
      const lam1 = Number.isFinite(l1) ? (isAlreadyLambda ? l1 : l1 / 14.7) : NaN;
      const lam2 = Number.isFinite(l2) ? (isAlreadyLambda ? l2 : l2 / 14.7) : NaN;
      if (Number.isFinite(lam1) && Number.isFinite(lam2)) lambda = (lam1 + lam2) / 2;
      else if (Number.isFinite(lam1)) lambda = lam1;
      else if (Number.isFinite(lam2)) lambda = lam2;

      if (Number.isFinite(rpmVal) && Number.isFinite(lambda)) {
        transientSamples.push({ rpm: rpmVal, lambda, addPW });
      }
    }
  }

  // Analyze transient samples for excessive lean/rich conditions
  const transientNotes: TransientNote[] = [];

  if (transientSamples.length > 5) {
    const leanSamples = transientSamples.filter(s => s.lambda > TRANSIENT_EXCESSIVE_LEAN_LAMBDA);
    const richSamples = transientSamples.filter(s => s.lambda < TRANSIENT_EXCESSIVE_RICH_LAMBDA);

    if (leanSamples.length >= 3) {
      const avgLambda = leanSamples.reduce((s, x) => s + x.lambda, 0) / leanSamples.length;
      const avgAddPW = leanSamples.reduce((s, x) => s + x.addPW, 0) / leanSamples.length;
      const rpms = leanSamples.map(s => s.rpm);
      const severity = avgLambda > 1.2 ? 'critical' : 'warning';
      transientNotes.push({
        type: 'lean',
        severity,
        message: severity === 'critical'
          ? `CRITICAL: Excessively lean during transient fueling (avg λ=${avgLambda.toFixed(3)}). Check transient enrichment settings — risk of detonation.`
          : `WARNING: Lean condition during transient fueling (avg λ=${avgLambda.toFixed(3)}). Consider increasing transient enrichment.`,
        avgLambda,
        avgAdditionalPW: avgAddPW,
        sampleCount: leanSamples.length,
        rpmRange: [Math.min(...rpms), Math.max(...rpms)],
      });
    }

    if (richSamples.length >= 3) {
      const avgLambda = richSamples.reduce((s, x) => s + x.lambda, 0) / richSamples.length;
      const avgAddPW = richSamples.reduce((s, x) => s + x.addPW, 0) / richSamples.length;
      const rpms = richSamples.map(s => s.rpm);
      const severity = avgLambda < 0.65 ? 'critical' : 'warning';
      transientNotes.push({
        type: 'rich',
        severity,
        message: severity === 'critical'
          ? `CRITICAL: Excessively rich during transient fueling (avg λ=${avgLambda.toFixed(3)}). Check transient enrichment settings — wasting fuel and fouling plugs.`
          : `WARNING: Rich condition during transient fueling (avg λ=${avgLambda.toFixed(3)}). Consider reducing transient enrichment.`,
        avgLambda,
        avgAdditionalPW: avgAddPW,
        sampleCount: richSamples.length,
        rpmRange: [Math.min(...rpms), Math.max(...rpms)],
      });
    }
  }

  return { isTransient, additionalPW, transientNotes, transientCount };
}

/**
 * Extract channel data arrays from WP8 for correction processing.
 */
function extractChannelData(wp8Data: WP8ParseResult) {
  const keys = getHondaTalonKeyChannels(wp8Data);

  const extract = (idx: number): number[] => {
    if (idx === -1) return [];
    return wp8Data.rows.map(r => {
      const v = r.values[idx];
      return Number.isFinite(v) ? v : NaN;
    });
  };

  // Detect dyno log: presence of Horsepower or Torque channels
  const isDynoLog = keys.horsepower !== -1 || keys.torque !== -1;

  // Lambda source priority:
  //   1. If AFR1 exists → use AFR channels (convert to lambda via /14.7)
  //   2. If Lambda1 exists (dyno logs) → use Lambda channels directly (no conversion)
  //   3. Single-sensor fallback: if only one channel exists (AFR1 or Lambda1),
  //      use it for both cylinders
  const hasAfr1 = keys.afr1 !== -1;
  const hasAfr2 = keys.afr2 !== -1;
  const hasLambda1 = keys.lambda1 !== -1 || keys.pc5Lambda1 !== -1;
  const hasLambda2 = keys.lambda2 !== -1 || keys.pc5Lambda2 !== -1;
  const lambda1Idx = keys.lambda1 !== -1 ? keys.lambda1 : keys.pc5Lambda1;
  const lambda2Idx = keys.lambda2 !== -1 ? keys.lambda2 : keys.pc5Lambda2;

  // Determine which source to use
  const useLambdaChannels = !hasAfr1 && hasLambda1;

  let cyl1Data: number[];
  let cyl2Data: number[];
  let isAlreadyLambda: boolean;

  if (useLambdaChannels) {
    // Dyno log or PC5: use Lambda channels directly
    cyl1Data = extract(lambda1Idx);
    // Single-sensor fallback: if Lambda2 not available, use Lambda1 for both
    cyl2Data = hasLambda2 ? extract(lambda2Idx) : cyl1Data;
    isAlreadyLambda = true;
  } else {
    // Standard log: use AFR channels
    cyl1Data = extract(keys.afr1);
    // Single-sensor fallback: if AFR2 not available, use AFR1 for both
    cyl2Data = hasAfr2 ? extract(keys.afr2) : cyl1Data;
    isAlreadyLambda = false;
  }

  return {
    rpm: extract(keys.engineSpeed),
    tps: extract(keys.throttlePosition),
    map: keys.mapCorrected !== -1 ? extract(keys.mapCorrected)
      : keys.honda3BarMap !== -1 ? extract(keys.honda3BarMap)
      : extract(keys.map),
    cyl1: cyl1Data,
    cyl2: cyl2Data,
    isAlreadyLambda,
    alphaN: extract(keys.alphaN),
    injPwDesired: extract(keys.injPwDesired),
    vehicleSpeed: extract(keys.vehicleSpeed),
    stft: keys.stft !== -1 ? extract(keys.stft)
      : keys.polarisTotalFuelTrim !== -1 ? extract(keys.polarisTotalFuelTrim)
      : [],
    hasAfr1,
    hasAfr2,
    hasLambda1,
    hasLambda2,
    hasAlphaN: keys.alphaN !== -1,
    injPwFinal: extract(keys.injPwFinal),
    hasInjPwDesired: keys.injPwDesired !== -1,
    hasInjPwFinal: keys.injPwFinal !== -1,
    hasMapCorrected: keys.mapCorrected !== -1,
    hasVehicleSpeed: keys.vehicleSpeed !== -1,
    hasStft: keys.stft !== -1 || keys.polarisTotalFuelTrim !== -1,
    isDynoLog,
  };
}

/**
 * Compute corrections for a single fuel map.
 *
 * @param mapKey - Which map slot this is
 * @param map - The fuel map to correct
 * @param sdCyl1Map - SD Cyl1 map (needed for turbo pulsewidth interpolation)
 * @param channelData - Extracted channel data from the datalog
 * @param config - Turbo/NA + MAP sensor config
 */
function computeMapCorrections(
  mapKey: keyof FuelMapState,
  map: FuelMap,
  sdCyl1Map: FuelMap | null,
  channelData: ReturnType<typeof extractChannelData>,
  config: CorrectionConfig,
  transientMask: boolean[] = [],
): MapCorrectionResult {
  const isAlphaN = mapKey.startsWith('alphaN');
  const isCyl1 = mapKey.includes('cyl1');

  // Pick the right cylinder data (AFR or Lambda, depending on what's available)
  // extractChannelData already handles the single-sensor fallback:
  //   - cyl1 = AFR1 or Lambda1
  //   - cyl2 = AFR2 or Lambda2 (falls back to cyl1 if not available)
  const cylData = isCyl1 ? channelData.cyl1 : channelData.cyl2;

  if (cylData.length === 0) {
    return {
      mapKey,
      corrections: [],
      totalCellsCorrected: 0,
      totalCellsInMap: map.data.length * (map.data[0]?.length ?? 0),
      totalSamplesUsed: 0,
      outlierNotes: [],
      tierCounts: { sandpaper: 0, hammer_chisel: 0, outlier_capped: 0 },
    };
  }

  // Accumulator: [row][col] → { sumLambda, count, sumStft, stftCount }
  const accum: { sumLambda: number; count: number; sumStft: number; stftCount: number }[][] = [];
  for (let r = 0; r < map.data.length; r++) {
    accum.push([]);
    for (let c = 0; c < map.data[r].length; c++) {
      accum[r].push({ sumLambda: 0, count: 0, sumStft: 0, stftCount: 0 });
    }
  }

  let totalSamples = 0;
  // Post-decel buffer: counts down from POST_DECEL_BUFFER_SAMPLES after a decel event ends
  let postDecelBufferRemaining = 0;

  for (let i = 0; i < channelData.rpm.length; i++) {
    const rpm = channelData.rpm[i];
    const alphaNVal = channelData.alphaN[i];
    const rawVal = cylData[i];

    if (isNaN(rpm) || isNaN(rawVal) || rawVal <= 0) continue;

    // ── Deceleration filter ──
    // Skip samples that indicate deceleration/fuel cut:
    //   1. TPS = 0 AND vehicle speed > 0 (closed throttle while moving)
    //   2. Injector PW Final = 0 (ECU has cut fuel entirely)
    //   3. Post-decel buffer: skip N samples after decel event ends (sensor transport delay)
    // In all cases, AFR readings are meaningless for correction.
    // (Reusable pattern for Kawasaki tool)
    const tpsVal = channelData.tps[i];
    const vSpeed = channelData.vehicleSpeed[i];
    let isDecel = false;
    if (channelData.hasVehicleSpeed && Number.isFinite(tpsVal) && Number.isFinite(vSpeed)) {
      if (tpsVal === 0 && vSpeed > 0) isDecel = true;
    }
    // Injector PW Final = 0 means ECU has completely cut fuel (decel fuel cut)
    if (!isDecel && channelData.hasInjPwFinal) {
      const injFinal = channelData.injPwFinal[i];
      if (Number.isFinite(injFinal) && injFinal === 0) isDecel = true;
    }

    if (isDecel) {
      // Reset the buffer counter — it will start counting down once decel ends
      postDecelBufferRemaining = POST_DECEL_BUFFER_SAMPLES;
      continue;
    }

    // Post-decel buffer: skip samples while the buffer is counting down
    // This accounts for AFR sensor transport delay after fuel is restored
    if (postDecelBufferRemaining > 0) {
      postDecelBufferRemaining--;
      continue;
    }

    // ── Transient fueling filter: skip samples during transient enrichment ──
    // When Additional PW (Final - Desired) exceeds 15% of Desired PW,
    // the ECU is applying transient enrichment. These samples don't
    // reflect steady-state fueling and should not be used for corrections.
    if (transientMask.length > i && transientMask[i]) continue;

    // Check if this sample belongs to this map's mode
    // Alpha-N channel: 1 = Alpha-N mode active, anything else (0, NaN, undefined) = Speed Density
    // CRITICAL: Only apply corrections to Alpha-N table when channel STRICTLY equals 1.
    // Use Math.round to handle floating point precision (e.g., 0.9999 or 1.0001 from sensor)
    const sampleIsAlphaN = Number.isFinite(alphaNVal) && Math.round(alphaNVal) === 1;
    if (isAlphaN && !sampleIsAlphaN) continue;
    if (!isAlphaN && sampleIsAlphaN) continue;

    // ── STFT adjustment ──
    // If Short Term Fuel Trims are present, we need to account for the ECU's
    // real-time corrections. The measured value already includes the STFT effect,
    // so to get what the value *would have been* without the ECU's correction:
    //   true_val = measured_val / (1 + STFT/100)
    // Negative STFT = ECU pulling fuel → measured is leaner than table commands
    // Positive STFT = ECU adding fuel → measured is richer than table commands
    // (Reusable pattern for Kawasaki tool)
    let correctedVal = rawVal;
    let stftVal = NaN;
    if (channelData.hasStft) {
      stftVal = channelData.stft[i];
      // Sanity check: STFT should be in a reasonable range (-50% to +50%).
      // Values outside this range indicate corrupt/garbage data in the channel
      // (e.g., protobuf parsing artifacts). Ignore invalid STFT values.
      if (Number.isFinite(stftVal) && stftVal >= -50 && stftVal <= 50) {
        correctedVal = rawVal / (1 + stftVal / 100);
      } else {
        stftVal = NaN; // Treat as no STFT data for this sample
      }
    }

    // Convert to lambda:
    // - If data is already lambda (dyno log Lambda1/Lambda2), use directly
    // - If data is AFR, divide by 14.7 (stoichiometric ratio for gasoline)
    const actualLambda = channelData.isAlreadyLambda
      ? correctedVal
      : correctedVal / 14.7;

    // ── Lambda sanity bounds ──
    // A real lambda sensor cannot physically read above ~1.3 (extreme lean/misfire)
    // or below ~0.5 (impossibly rich). Values outside this range indicate sensor
    // errors, protobuf parsing artifacts, or wideband sensor saturation.
    // Discard these samples — they would corrupt the correction factors.
    if (actualLambda < LAMBDA_MIN_VALID || actualLambda > LAMBDA_MAX_VALID) continue;

    // Find the RPM row
    const rpmRow = findNearestIdx(map.rowAxis, rpm);

    // Find the column
    let col: number;
    if (isAlphaN) {
      // Alpha-N: column = TPS
      const tps = channelData.tps[i];
      if (isNaN(tps)) continue;
      col = findNearestIdx(map.colAxis, tps);
    } else {
      // Speed Density: column depends on turbo/NA
      if (config.vehicleMode === 'turbo' && sdCyl1Map && channelData.hasInjPwDesired) {
        // Turbo: use desired injector pulsewidth to find column in SD Cyl1 table
        const desiredPW = channelData.injPwDesired[i];
        if (isNaN(desiredPW) || desiredPW <= 0) continue;
        const sdRpmRow = findNearestIdx(sdCyl1Map.rowAxis, rpm);
        col = findSDColumnByPulsewidth(sdCyl1Map, sdRpmRow, desiredPW);
      } else {
        // NA or no pulsewidth data: use MAP directly
        const mapVal = channelData.map[i];
        if (isNaN(mapVal)) continue;
        col = findNearestIdx(map.colAxis, mapVal);
      }
    }

    // Bounds check
    if (rpmRow < 0 || rpmRow >= map.data.length) continue;
    if (col < 0 || col >= map.data[rpmRow].length) continue;

    accum[rpmRow][col].sumLambda += actualLambda;
    accum[rpmRow][col].count++;
    if (Number.isFinite(stftVal)) {
      accum[rpmRow][col].sumStft += stftVal;
      accum[rpmRow][col].stftCount++;
    }
    totalSamples++;
  }

  // ─── Build raw correction factors per cell ───────────────────────────────
  const numRows = accum.length;
  const numCols = accum[0]?.length ?? 0;

  // rawFactors[r][c] = correction factor (or NaN if cell has no data)
  const rawFactors: number[][] = [];
  const rawLambdas: number[][] = [];
  const rawTargets: number[][] = [];
  const rawCounts: number[][] = [];
  const rawStftSum: number[][] = [];
  const rawStftCount: number[][] = [];

  for (let r = 0; r < numRows; r++) {
    rawFactors.push([]);
    rawLambdas.push([]);
    rawTargets.push([]);
    rawCounts.push([]);
    rawStftSum.push([]);
    rawStftCount.push([]);
    for (let c = 0; c < numCols; c++) {
      const cell = accum[r][c];
      if (cell.count === 0) {
        rawFactors[r].push(NaN);
        rawLambdas[r].push(NaN);
        rawTargets[r].push(NaN);
        rawCounts[r].push(0);
        rawStftSum[r].push(0);
        rawStftCount[r].push(0);
      } else {
        const avgLambda = cell.sumLambda / cell.count;
        const target = c < map.targetLambda.length ? map.targetLambda[c] : 0.95;
        const factor = target > 0 ? avgLambda / target : 1;
        rawFactors[r].push(factor);
        rawLambdas[r].push(avgLambda);
        rawTargets[r].push(target);
        rawCounts[r].push(cell.count);
        rawStftSum[r].push(cell.sumStft);
        rawStftCount[r].push(cell.stftCount);
      }
    }
  }

  // ─── Tiered correction: apply sculpture strategy ─────────────────────────
  const corrections: CellCorrection[] = [];
  const outlierNotes: OutlierNote[] = [];
  const tierCounts = { sandpaper: 0, hammer_chisel: 0, outlier_capped: 0 };

  // Helper: get 8-neighbor correction factors for a cell
  function getNeighborFactors(r: number, c: number): number[] {
    const neighbors: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue; // skip self
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < numRows && nc >= 0 && nc < numCols) {
          const f = rawFactors[nr][nc];
          if (Number.isFinite(f)) neighbors.push(f);
        }
      }
    }
    return neighbors;
  }

  // Helper: get error percentage from a correction factor (distance from 1.0)
  function errorPct(factor: number): number {
    return Math.abs(factor - 1.0);
  }

  // Helper: check if neighbors show a similar pattern (same direction, >5% error)
  function neighborsShowPattern(r: number, c: number, factor: number): boolean {
    const neighbors = getNeighborFactors(r, c);
    if (neighbors.length === 0) return false;
    const direction = factor > 1.0 ? 'lean' : 'rich';
    // Count neighbors with >5% error in the same direction
    let patternCount = 0;
    for (const nf of neighbors) {
      const nErr = errorPct(nf);
      if (nErr > HAMMER_CHISEL_THRESHOLD) {
        const nDir = nf > 1.0 ? 'lean' : 'rich';
        if (nDir === direction) patternCount++;
      }
    }
    // Pattern exists if at least 2 neighbors agree (or 1 if only 1-2 neighbors have data)
    return patternCount >= Math.min(2, neighbors.length);
  }

  // Apply minimum sample threshold: cells below minSamples are treated as no-data
  const minSamples = config.minSamples || 1;
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (rawCounts[r][c] < minSamples) {
        rawFactors[r][c] = NaN;
        rawLambdas[r][c] = NaN;
        rawCounts[r][c] = 0;
      }
    }
  }

  // First pass: classify each cell into tiers
  const cellTiers: CorrectionTier[][] = [];
  for (let r = 0; r < numRows; r++) {
    cellTiers.push([]);
    for (let c = 0; c < numCols; c++) {
      const factor = rawFactors[r][c];
      if (!Number.isFinite(factor)) {
        cellTiers[r].push('sandpaper'); // placeholder, won't be used
        continue;
      }
      const err = errorPct(factor);
      if (err <= SANDPAPER_THRESHOLD) {
        cellTiers[r].push('sandpaper');
      } else if (err > OUTLIER_THRESHOLD && getNeighborFactors(r, c).length > 0 && !neighborsShowPattern(r, c, factor)) {
        // >20% error AND neighbors have data but don't agree → outlier
        // (If no neighbors have data, we can't fact-check → treat as hammer_chisel)
        cellTiers[r].push('outlier_capped');
      } else {
        // >5% error with pattern (or 5-20% error) → hammer & chisel
        cellTiers[r].push('hammer_chisel');
      }
    }
  }

  // Second pass: for hammer_chisel cells, find connected groups and average them
  // Use flood-fill to find groups of adjacent hammer_chisel cells with same direction
  const visited: boolean[][] = Array.from({ length: numRows }, () => Array(numCols).fill(false));

  function floodFillGroup(startR: number, startC: number): [number, number][] {
    const group: [number, number][] = [];
    const direction = rawFactors[startR][startC] > 1.0 ? 'lean' : 'rich';
    const stack: [number, number][] = [[startR, startC]];
    while (stack.length > 0) {
      const [r, c] = stack.pop()!;
      if (r < 0 || r >= numRows || c < 0 || c >= numCols) continue;
      if (visited[r][c]) continue;
      if (!Number.isFinite(rawFactors[r][c])) continue;
      if (cellTiers[r][c] !== 'hammer_chisel') continue;
      const cellDir = rawFactors[r][c] > 1.0 ? 'lean' : 'rich';
      if (cellDir !== direction) continue;
      visited[r][c] = true;
      group.push([r, c]);
      // Check all 8 neighbors
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          stack.push([r + dr, c + dc]);
        }
      }
    }
    return group;
  }

  // Build groups of connected hammer_chisel cells
  const hammerGroups: [number, number][][] = [];
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (!visited[r][c] && cellTiers[r][c] === 'hammer_chisel' && Number.isFinite(rawFactors[r][c])) {
        const group = floodFillGroup(r, c);
        if (group.length > 0) hammerGroups.push(group);
      }
    }
  }

  // Compute averaged correction factor for each group
  const groupAvgFactor: Map<string, number> = new Map();
  for (const group of hammerGroups) {
    let sumFactor = 0;
    for (const [r, c] of group) {
      sumFactor += rawFactors[r][c];
    }
    const avgFactor = sumFactor / group.length;
    for (const [r, c] of group) {
      groupAvgFactor.set(`${r}-${c}`, avgFactor);
    }
  }

  // Third pass: build final corrections with tiered logic
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const rawFactor = rawFactors[r][c];
      if (!Number.isFinite(rawFactor) || rawCounts[r][c] === 0) continue;

      const tier = cellTiers[r][c];
      const originalValue = map.data[r][c];
      const targetLambda = rawTargets[r][c];
      let finalFactor: number;
      let tierNote: string | undefined;
      let isOutlier = false;
      let rawCorrectionFactor: number | undefined;

      if (tier === 'sandpaper') {
        // Fine-tuning: apply cell-by-cell as-is
        finalFactor = rawFactor;
      } else if (tier === 'outlier_capped') {
        // Outlier: cap to neighbor average
        const neighbors = getNeighborFactors(r, c);
        const neighborAvg = neighbors.length > 0
          ? neighbors.reduce((s, v) => s + v, 0) / neighbors.length
          : 1.0; // If no neighbors have data, don't correct
        rawCorrectionFactor = rawFactor;
        finalFactor = neighborAvg;
        isOutlier = true;
        const rawErrPct = (errorPct(rawFactor) * 100).toFixed(1);
        const cappedErrPct = (errorPct(neighborAvg) * 100).toFixed(1);
        tierNote = `Outlier: ${rawErrPct}% error capped to neighbor avg (${cappedErrPct}%). Possible bad data.`;
        outlierNotes.push({
          row: r,
          col: c,
          mapKey,
          rawErrorPct: errorPct(rawFactor) * 100,
          cappedErrorPct: errorPct(neighborAvg) * 100,
          neighborAvgFactor: neighborAvg,
          message: `Cell [${map.rowAxis[r]} RPM, ${map.colAxis[c]} ${map.colLabel}]: ` +
            `${rawErrPct}% ${rawFactor > 1 ? 'lean' : 'rich'} error is isolated (neighbors don't agree). ` +
            `Capped to ${cappedErrPct}% correction. Verify data quality for this cell.`,
        });
        tierCounts.outlier_capped++;
      } else {
        // Hammer & chisel: use group-averaged factor
        const groupKey = `${r}-${c}`;
        const avgFactor = groupAvgFactor.get(groupKey);
        if (avgFactor !== undefined && avgFactor !== rawFactor) {
          rawCorrectionFactor = rawFactor;
          finalFactor = avgFactor;
          tierNote = `Regional avg applied (${(errorPct(rawFactor) * 100).toFixed(1)}% → ${(errorPct(avgFactor) * 100).toFixed(1)}%)`;
        } else {
          finalFactor = rawFactor;
        }
        tierCounts.hammer_chisel++;
      }

      if (tier === 'sandpaper') tierCounts.sandpaper++;

      const correctedValue = originalValue * finalFactor;

      const correction: CellCorrection = {
        row: r,
        col: c,
        originalValue,
        correctedValue,
        correctionFactor: finalFactor,
        sampleCount: rawCounts[r][c],
        avgActualLambda: rawLambdas[r][c],
        targetLambda,
        tier,
      };
      if (rawCorrectionFactor !== undefined) correction.rawCorrectionFactor = rawCorrectionFactor;
      if (isOutlier) correction.isOutlier = true;
      if (tierNote) correction.tierNote = tierNote;
      if (rawStftCount[r][c] > 0) {
        correction.avgStft = rawStftSum[r][c] / rawStftCount[r][c];
      }
      corrections.push(correction);
    }
  }

  return {
    mapKey,
    corrections,
    totalCellsCorrected: corrections.length,
    totalCellsInMap: numRows * numCols,
    totalSamplesUsed: totalSamples,
    outlierNotes,
    tierCounts,
  };
}

/**
 * Run the full fuel table correction analysis.
 *
 * @param fuelMaps - Current fuel map state (all 4 maps)
 * @param wp8Data - Parsed WP8 datalog
 * @param config - Turbo/NA + MAP sensor configuration
 * @returns Complete correction report
 */
export function computeCorrections(
  fuelMaps: FuelMapState,
  wp8Data: WP8ParseResult,
  config: CorrectionConfig,
): CorrectionReport {
  const channelData = extractChannelData(wp8Data);
  const isTurboDetected = detectTurbo(wp8Data);

  // Count Alpha-N vs SD samples, and decel-filtered samples (including post-decel buffer)
  let alphaNSamples = 0;
  let sdSamples = 0;
  let decelSamplesSkipped = 0;
  let postDecelBufferRemaining = 0;
  for (let i = 0; i < channelData.alphaN.length; i++) {
    // Check decel filter at the top-level count too
    // 1. TPS = 0 AND vehicle speed > 0
    const tpsVal = channelData.tps[i];
    const vSpeed = channelData.vehicleSpeed[i];
    let isDecel = false;
    if (channelData.hasVehicleSpeed && Number.isFinite(tpsVal) && Number.isFinite(vSpeed)) {
      if (tpsVal === 0 && vSpeed > 0) isDecel = true;
    }
    // 2. Injector PW Final = 0 (ECU fuel cut)
    if (!isDecel && channelData.hasInjPwFinal) {
      const injFinal = channelData.injPwFinal[i];
      if (Number.isFinite(injFinal) && injFinal === 0) isDecel = true;
    }

    if (isDecel) {
      postDecelBufferRemaining = POST_DECEL_BUFFER_SAMPLES;
      decelSamplesSkipped++;
      continue;
    }

    // 3. Post-decel buffer: skip samples after decel ends (sensor transport delay)
    if (postDecelBufferRemaining > 0) {
      postDecelBufferRemaining--;
      decelSamplesSkipped++;
      continue;
    }
    // Alpha-N mode check: strictly equals 1 (with float tolerance)
    const alphaNVal = channelData.alphaN[i];
    if (Number.isFinite(alphaNVal) && Math.round(alphaNVal) === 1) alphaNSamples++;
    else sdSamples++;
  }

  // ─── Transient fueling detection ─────────────────────────────────────
  // Compute "Additional Pulsewidth" (Final - Desired) and detect transient
  // fueling conditions. Transient samples are excluded from corrections.
  let transientSamplesSkipped = 0;
  let transientNotes: TransientNote[] = [];
  let transientMask: boolean[] = [];

  if (channelData.hasInjPwFinal && channelData.hasInjPwDesired) {
    const transientResult = detectTransientFueling(
      channelData.injPwDesired,
      channelData.injPwFinal,
      channelData.rpm,
      channelData.cyl1,
      channelData.cyl2,
      channelData.isAlreadyLambda,
    );
    transientMask = transientResult.isTransient;
    transientSamplesSkipped = transientResult.transientCount;
    transientNotes = transientResult.transientNotes;
  }

  const results: MapCorrectionResult[] = [];
  const mapKeys: (keyof FuelMapState)[] = [
    'alphaN_cyl1', 'alphaN_cyl2',
    'speedDensity_cyl1', 'speedDensity_cyl2',
  ];

  for (const key of mapKeys) {
    const map = fuelMaps[key];
    if (!map) continue;

    const result = computeMapCorrections(
      key,
      map,
      fuelMaps.speedDensity_cyl1, // SD Cyl1 used for turbo pulsewidth interpolation
      channelData,
      config,
      transientMask,
    );
    results.push(result);
  }

  return {
    results,
    vehicleMode: config.vehicleMode,
    mapSensor: config.mapSensor,
    isTurboDetected,
    hasAfr1: channelData.hasAfr1,
    hasAfr2: channelData.hasAfr2,
    hasLambda1: channelData.hasLambda1,
    hasLambda2: channelData.hasLambda2,
    hasStft: channelData.hasStft,
    hasInjPwFinal: channelData.hasInjPwFinal,
    isDynoLog: channelData.isDynoLog,
    lambdaSource: channelData.isAlreadyLambda ? 'lambda' : 'afr',
    totalSamples: channelData.rpm.length,
    alphaNSamples,
    sdSamples,
    decelSamplesSkipped,
    transientSamplesSkipped,
    transientNotes,
    outlierNotes: results.flatMap(r => r.outlierNotes),
  };
}

/**
 * Apply corrections to a fuel map, returning a new map with corrected values.
 * Only cells that were visited in the datalog are modified.
 */
export function applyCorrectionToMap(
  map: FuelMap,
  corrections: CellCorrection[],
): FuelMap {
  const newData = map.data.map(row => [...row]);

  for (const corr of corrections) {
    if (corr.row < newData.length && corr.col < newData[corr.row].length) {
      newData[corr.row][corr.col] = corr.correctedValue;
    }
  }

  return { ...map, data: newData };
}

/**
 * Blend/Smooth corrected fuel map to prevent sharp discontinuities.
 *
 * Two-pass approach:
 *   Pass 1 - GAP INTERPOLATION: Fill uncorrected cells that sit between corrected
 *            cells (in the same row or column) by linearly interpolating the
 *            correction factor from the corrected neighbors on either side.
 *   Pass 2 - BOUNDARY BLENDING: Uncorrected cells on the outer edge of the
 *            corrected region get a partial correction (50% weight) blended
 *            toward 1.0 (no correction).
 *
 * @param map - The original (uncorrected) fuel map
 * @param corrections - The corrections that were applied
 * @returns A new FuelMap with blended values (includes original corrections + interpolated gaps + blended boundaries)
 */
export function blendCorrectedMap(
  map: FuelMap,
  corrections: CellCorrection[],
): FuelMap {
  const rows = map.data.length;
  const cols = rows > 0 ? map.data[0].length : 0;
  if (rows === 0 || cols === 0) return { ...map, data: map.data.map(r => [...r]) };

  // Maximum blend factor deviation from 1.0 for non-corrected cells (20% cap)
  const MAX_BLEND_DEVIATION = 0.20;

  // ── Detect isolated corrections (single outliers with no neighboring corrections) ──
  // These get only 8-sided boundary blend, not row/column interpolation.
  const isIsolated = new Set<string>();
  for (const corr of corrections) {
    if (corr.row >= rows || corr.col >= cols) continue;
    // Check if any other correction is within 2 cells in any direction
    let hasNeighbor = false;
    for (const other of corrections) {
      if (other === corr) continue;
      if (other.row >= rows || other.col >= cols) continue;
      const rowDist = Math.abs(other.row - corr.row);
      const colDist = Math.abs(other.col - corr.col);
      if (rowDist <= 2 && colDist <= 2) {
        hasNeighbor = true;
        break;
      }
    }
    if (!hasNeighbor) {
      isIsolated.add(`${corr.row}:${corr.col}`);
    }
  }

  // Build a factor grid: 1.0 = no correction, other values = correction factor
  const factorGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(NaN));
  const isCorrected: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (const corr of corrections) {
    if (corr.row < rows && corr.col < cols) {
      factorGrid[corr.row][corr.col] = corr.correctionFactor;
      isCorrected[corr.row][corr.col] = true;
    }
  }

  // Track which cells get interpolated/blended (so we don't double-process)
  const isInterpolated: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  // ── Handle isolated corrections with 8-sided boundary blend only ──
  // Skip them from row/column interpolation by temporarily removing from isCorrected,
  // then apply their boundary blend separately.
  const isolatedCorrections: CellCorrection[] = [];
  const groupedCorrections: CellCorrection[] = [];
  for (const corr of corrections) {
    if (corr.row >= rows || corr.col >= cols) continue;
    if (isIsolated.has(`${corr.row}:${corr.col}`)) {
      isolatedCorrections.push(corr);
    } else {
      groupedCorrections.push(corr);
    }
  }

  // Remove isolated corrections from the factor grid — they won't participate in row/col interpolation
  for (const corr of isolatedCorrections) {
    factorGrid[corr.row][corr.col] = NaN;
    isCorrected[corr.row][corr.col] = false;
  }

  // ── Pass 1: Gap Interpolation ──
  // For each row, find uncorrected cells between two corrected cells and interpolate
  // Also handle open-ended gaps using original map values for monotonic ramp
  for (let r = 0; r < rows; r++) {
    interpolateGapsInLine(factorGrid[r], isCorrected[r], isInterpolated[r], map.data[r]);
  }
  // For each column, find uncorrected cells between two corrected cells and interpolate.
  // IMPORTANT: Column pass does NOT overwrite row-interpolated values.
  // Row blending is authoritative because fuel maps are monotonically increasing L-R
  // (more airflow = more fuel), so the row pass establishes definitive ramp values.
  // Column pass only fills cells that the row pass didn't touch.
  //
  // Column anchor logic (different from row):
  //   - Top boundary (above highest corrected cell): scan UP for cell with value > corrected value.
  //     If none found, skip 3 cells and use the 4th as anchor.
  //   - Bottom boundary (below lowest corrected cell): scan DOWN for cell with value < corrected value.
  //     If none found, skip 3 cells and use the 4th as anchor.
  for (let c = 0; c < cols; c++) {
    const colFactors = factorGrid.map(row => row[c]);
    const colCorrected = isCorrected.map(row => row[c]);
    const colInterpolated = isInterpolated.map(row => row[c]);
    const colOriginalValues = map.data.map(row => row[c]);
    interpolateGapsInColumn(colFactors, colCorrected, colInterpolated, colOriginalValues);
    // Write back — only for cells NOT already handled by row interpolation
    for (let r = 0; r < rows; r++) {
      if (!isCorrected[r][c] && !isInterpolated[r][c] && colInterpolated[r]) {
        // Column interpolation found a gap that row interpolation missed — use it
        factorGrid[r][c] = colFactors[r];
        isInterpolated[r][c] = true;
      }
      // If row already interpolated this cell, leave it alone (row is authoritative)
    }
  }

  // ── Pass 1b: Row-wise Non-Monotonic Bump Fix (before boundary blending) ──
  // After row+column interpolation and averaging, some interpolated cells may have
  // blended values that create a non-monotonic "bump" — i.e., the blended value
  // increases then decreases (or vice versa) when it should be a smooth ramp.
  //
  // The user's specific issue: at 4250-5000 RPM left of TPS 12, values go up then
  // back down when moving left from the corrected cell. The fix:
  // For each interpolated cell to the LEFT of a corrected cell, if its blended value
  // exceeds the corrected value, find the next cell further left that is below the
  // corrected value and use it as an anchor for re-interpolation.
  //
  // This only targets the specific pattern: interpolated cells whose blended values
  // overshoot the corrected cell they're ramping toward.
  for (let r = 0; r < rows; r++) {
    // Compute current blended values for this row
    const rowValues = map.data[r].map((val, c) => {
      const factor = factorGrid[r][c];
      if (isNaN(factor) || (!isCorrected[r][c] && !isInterpolated[r][c])) return val;
      return val * factor;
    });

    // For each corrected cell, check interpolated cells to its left
    for (let c = 0; c < cols; c++) {
      if (!isCorrected[r][c]) continue;
      const correctedValue = rowValues[c];
      const corrFactor = factorGrid[r][c];

      // Check left side: if correction is enrichment (factor > 1), blended values
      // to the left should not exceed the corrected value
      if (corrFactor > 1.0) {
        for (let k = c - 1; k >= 0; k--) {
          if (isCorrected[r][k]) break; // hit another correction, stop
          if (!isInterpolated[r][k]) break; // hit untouched cell, stop
          if (rowValues[k] > correctedValue) {
            // This interpolated cell overshoots the corrected value — find anchor
            // Scan further left for a cell with value < correctedValue
            let anchorCol = -1;
            for (let a = k - 1; a >= 0; a--) {
              if (isCorrected[r][a]) break;
              if (!isInterpolated[r][a]) {
                // Untouched cell — use as anchor if its value < correctedValue
                if (rowValues[a] < correctedValue) anchorCol = a;
                break;
              }
              if (rowValues[a] < correctedValue) {
                anchorCol = a;
                break;
              }
            }
            if (anchorCol >= 0) {
              // Re-interpolate from anchor to corrected cell
              const gapLen = c - anchorCol;
              for (let j = anchorCol + 1; j < c; j++) {
                if (!isInterpolated[r][j] || isCorrected[r][j]) continue;
                const t = (j - anchorCol) / gapLen;
                const targetValue = rowValues[anchorCol] + (correctedValue - rowValues[anchorCol]) * t;
                if (map.data[r][j] > 0) {
                  factorGrid[r][j] = targetValue / map.data[r][j];
                  rowValues[j] = targetValue;
                }
              }
            }
            break; // done with this corrected cell's left side
          }
        }
      }

      // Check right side: if correction is lean (factor < 1), blended values
      // to the right should not go below the corrected value
      if (corrFactor < 1.0) {
        for (let k = c + 1; k < cols; k++) {
          if (isCorrected[r][k]) break;
          if (!isInterpolated[r][k]) break;
          if (rowValues[k] < correctedValue) {
            // This interpolated cell undershoots — find anchor to the right
            let anchorCol = -1;
            for (let a = k + 1; a < cols; a++) {
              if (isCorrected[r][a]) break;
              if (!isInterpolated[r][a]) {
                if (rowValues[a] > correctedValue) anchorCol = a;
                break;
              }
              if (rowValues[a] > correctedValue) {
                anchorCol = a;
                break;
              }
            }
            if (anchorCol >= 0) {
              const gapLen = anchorCol - c;
              for (let j = c + 1; j < anchorCol; j++) {
                if (!isInterpolated[r][j] || isCorrected[r][j]) continue;
                const t = (j - c) / gapLen;
                const targetValue = correctedValue + (rowValues[anchorCol] - correctedValue) * t;
                if (map.data[r][j] > 0) {
                  factorGrid[r][j] = targetValue / map.data[r][j];
                  rowValues[j] = targetValue;
                }
              }
            }
            break;
          }
        }
      }
    }
  }

  // ── Pass 2: Boundary Blending (single ring only) ──
  // For ALL cells adjacent (8-connected) to corrected/interpolated cells,
  // blend using all 8 neighbors as potential sources.
  // Only use corrected or gap-interpolated cells as blend sources (not other boundary cells)
  // to prevent cascading ripple effects.

  const isBoundary: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const boundaryFactors: number[][] = Array.from({ length: rows }, () => Array(cols).fill(NaN));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isCorrected[r][c] || isInterpolated[r][c]) continue;

      // Always check all 8 neighbors (including diagonals) for blend sources
      const all8: [number, number][] = [[r-1, c-1], [r-1, c], [r-1, c+1], [r, c-1], [r, c+1], [r+1, c-1], [r+1, c], [r+1, c+1]];

      const neighborFacs: number[] = [];
      for (const [nr, nc] of all8) {
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          if (isCorrected[nr][nc] || isInterpolated[nr][nc]) {
            neighborFacs.push(factorGrid[nr][nc]);
          }
        }
      }

      if (neighborFacs.length > 0) {
        const avgNeighborFactor = neighborFacs.reduce((s, f) => s + f, 0) / neighborFacs.length;
        boundaryFactors[r][c] = 1.0 + (avgNeighborFactor - 1.0) * BLEND_BOUNDARY_WEIGHT;
        isBoundary[r][c] = true;
      }
    }
  }

  // Apply boundary factors to the grid
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBoundary[r][c]) {
        factorGrid[r][c] = boundaryFactors[r][c];
        isInterpolated[r][c] = true;
      }
    }
  }

  // ── Pass 3: Post-Boundary Monotonicity Enforcement ──
  // After all blending passes, enforce that blended values don't create non-monotonic
  // bumps where the original map was monotonically increasing.
  // For each row, scan left-to-right: if a blended cell's value is LESS than the
  // previous blended cell's value, AND the original values were increasing (or equal),
  // then re-interpolate from the last valid anchor to the next corrected cell.
  // This uses the user's specified approach: find the next value to the left that is
  // less than the corrected value and use it as an anchor for interpolation.
  for (let r = 0; r < rows; r++) {
    // Compute current blended values for this row
    const rowBlended = map.data[r].map((val, c) => {
      const factor = factorGrid[r][c];
      if (isNaN(factor) || (!isCorrected[r][c] && !isInterpolated[r][c])) return val;
      return val * factor;
    });

    // Scan for non-monotonic bumps in blended values where original was increasing
    // Only fix cells that are interpolated/boundary (not corrected, not untouched)
    for (let c = 1; c < cols; c++) {
      if (!isInterpolated[r][c] || isCorrected[r][c]) continue;
      // Check if this blended cell is less than the previous cell
      if (rowBlended[c] < rowBlended[c - 1] - 0.0001) {
        // Only fix if original values were increasing (this is a blend artifact)
        if (map.data[r][c] >= map.data[r][c - 1]) {
          // Find the rightmost corrected/interpolated anchor to the right
          let rightAnchor = -1;
          for (let k = c; k < cols; k++) {
            if (isCorrected[r][k]) {
              rightAnchor = k;
              break;
            }
          }
          // Find the leftmost valid anchor to the left (last cell that's not part of the bump)
          let leftAnchor = c - 1;
          // Walk left to find where the bump started
          while (leftAnchor > 0 && isInterpolated[r][leftAnchor] && !isCorrected[r][leftAnchor]) {
            if (rowBlended[leftAnchor] <= rowBlended[leftAnchor - 1] + 0.0001 || !isInterpolated[r][leftAnchor - 1]) break;
            leftAnchor--;
          }

          if (rightAnchor > 0 && rightAnchor > leftAnchor + 1) {
            // Re-interpolate between leftAnchor and rightAnchor
            const leftVal = rowBlended[leftAnchor];
            const rightVal = rowBlended[rightAnchor];
            const gapLen = rightAnchor - leftAnchor;
            for (let k = leftAnchor + 1; k < rightAnchor; k++) {
              if (!isInterpolated[r][k] || isCorrected[r][k]) continue;
              const t = (k - leftAnchor) / gapLen;
              const newVal = leftVal + (rightVal - leftVal) * t;
              if (map.data[r][k] > 0) {
                factorGrid[r][k] = newVal / map.data[r][k];
                rowBlended[k] = newVal;
              }
            }
          }
        }
      }
    }

    // Also scan right-to-left for the right side of corrections
    for (let c = cols - 2; c >= 0; c--) {
      if (!isInterpolated[r][c] || isCorrected[r][c]) continue;
      if (rowBlended[c] > rowBlended[c + 1] + 0.0001) {
        if (map.data[r][c] <= map.data[r][c + 1]) {
          // Find the leftmost corrected anchor to the left
          let leftAnchor = -1;
          for (let k = c; k >= 0; k--) {
            if (isCorrected[r][k]) {
              leftAnchor = k;
              break;
            }
          }
          // Find the rightmost valid anchor
          let rightAnchor = c + 1;
          while (rightAnchor < cols - 1 && isInterpolated[r][rightAnchor] && !isCorrected[r][rightAnchor]) {
            if (rowBlended[rightAnchor] >= rowBlended[rightAnchor + 1] - 0.0001 || !isInterpolated[r][rightAnchor + 1]) break;
            rightAnchor++;
          }

          if (leftAnchor >= 0 && rightAnchor > leftAnchor + 1) {
            const leftVal = rowBlended[leftAnchor];
            const rightVal = rowBlended[rightAnchor];
            const gapLen = rightAnchor - leftAnchor;
            for (let k = leftAnchor + 1; k < rightAnchor; k++) {
              if (!isInterpolated[r][k] || isCorrected[r][k]) continue;
              const t = (k - leftAnchor) / gapLen;
              const newVal = leftVal + (rightVal - leftVal) * t;
              if (map.data[r][k] > 0) {
                factorGrid[r][k] = newVal / map.data[r][k];
                rowBlended[k] = newVal;
              }
            }
          }
        }
      }
    }
  }

  // ── Apply 20% cap to all blended (non-corrected) factors ──
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isCorrected[r][c]) continue; // Don't cap directly corrected cells
      if (!isInterpolated[r][c]) continue;
      const factor = factorGrid[r][c];
      if (isNaN(factor)) continue;
      // Clamp factor to [1 - MAX_BLEND_DEVIATION, 1 + MAX_BLEND_DEVIATION]
      factorGrid[r][c] = Math.max(1.0 - MAX_BLEND_DEVIATION, Math.min(1.0 + MAX_BLEND_DEVIATION, factor));
    }
  }

  // ── Re-add isolated corrections with 8-sided boundary blend only ──
  for (const corr of isolatedCorrections) {
    const r = corr.row;
    const c = corr.col;
    // Apply the correction factor to the isolated cell itself
    factorGrid[r][c] = corr.correctionFactor;
    isCorrected[r][c] = true;

    // Apply 8-sided boundary blend to its neighbors
    const neighbors: [number, number][] = [
      [r-1, c-1], [r-1, c], [r-1, c+1],
      [r, c-1],             [r, c+1],
      [r+1, c-1], [r+1, c], [r+1, c+1],
    ];
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (isCorrected[nr][nc] || isInterpolated[nr][nc]) continue;
      // Boundary blend: 50% of the correction factor's deviation from 1.0
      const boundaryFactor = 1.0 + (corr.correctionFactor - 1.0) * BLEND_BOUNDARY_WEIGHT;
      // Also cap the boundary blend at 20%
      factorGrid[nr][nc] = Math.max(1.0 - MAX_BLEND_DEVIATION, Math.min(1.0 + MAX_BLEND_DEVIATION, boundaryFactor));
      isInterpolated[nr][nc] = true;
    }
  }

  // ── Apply all factors to produce the blended map ──
  const blendedCellKeys = new Set<string>();
  const newData = map.data.map((row, r) =>
    row.map((val, c) => {
      const factor = factorGrid[r][c];
      if (isNaN(factor) || (!isCorrected[r][c] && !isInterpolated[r][c])) return val;
      // Track cells that are blended (interpolated/boundary) vs directly corrected from data
      if (!isCorrected[r][c] && isInterpolated[r][c]) {
        blendedCellKeys.add(`${r}:${c}`);
      }
      return val * factor;
    })
  );

  return { ...map, data: newData, blendedCells: blendedCellKeys };
}

/**
 * Same as blendCorrectedMap but returns the set of blended cell keys separately.
 * Useful when the caller needs to know which cells were blended for highlighting.
 */
export function getBlendedCellKeys(
  map: FuelMap,
  corrections: CellCorrection[],
): Set<string> {
  const result = blendCorrectedMap(map, corrections);
  return (result as any).blendedCells || new Set<string>();
}

/**
 * Interpolate gaps in a 1D line (row or column).
 * Handles three cases:
 * 1. Gaps BETWEEN two corrected cells — linear interpolation of factors
 * 2. Open-ended LEFT gap — from leftmost corrected cell back to where original
 *    map values naturally exceed the corrected value (monotonic ramp)
 * 3. Open-ended RIGHT gap — from rightmost corrected cell forward to where original
 *    map values naturally exceed the corrected value (monotonic ramp)
 *
 * @param factors - The factor grid line (mutated in place)
 * @param corrected - Which cells are directly corrected
 * @param interpolated - Which cells have been interpolated (mutated in place)
 * @param originalValues - The original map values for this line (needed for open-ended gaps)
 */
function interpolateGapsInLine(
  factors: number[],
  corrected: boolean[],
  interpolated: boolean[],
  originalValues?: number[],
): void {
  const len = factors.length;

  // ── Standard gap interpolation (between two corrected cells) ──
  let i = 0;
  while (i < len) {
    if (!corrected[i]) { i++; continue; }

    const gapStart = i;
    let j = i + 1;
    while (j < len && !corrected[j]) j++;

    if (j < len && j - gapStart > 1) {
      const startFactor = factors[gapStart];
      const endFactor = factors[j];
      const gapLen = j - gapStart;

      for (let k = gapStart + 1; k < j; k++) {
        if (!corrected[k] && !interpolated[k]) {
          const t = (k - gapStart) / gapLen;
          factors[k] = startFactor + (endFactor - startFactor) * t;
          interpolated[k] = true;
        }
      }
    }

    i = j;
  }

  // ── Open-ended gap interpolation (edges without a second anchor) ──
  if (!originalValues) return;

  // Find all corrected cell indices
  const correctedIndices: number[] = [];
  for (let idx = 0; idx < len; idx++) {
    if (corrected[idx]) correctedIndices.push(idx);
  }
  if (correctedIndices.length === 0) return;

  const leftmostCorrected = correctedIndices[0];
  const rightmostCorrected = correctedIndices[correctedIndices.length - 1];

  // ── Left open-ended gap ──
  // From leftmost corrected cell, extend leftward.
  // Fuel maps are monotonically increasing left-to-right (more airflow = more fuel).
  // So to the LEFT of a corrected cell, we look for the first cell with a value
  // LESS THAN the corrected value — that's the natural anchor where the ramp starts.
  // Interpolate smoothly between that anchor value and the corrected value.
  // IMPORTANT: The anchor must be at least 2 positions away (distance > 1) so there's
  // at least one cell between anchor and corrected to interpolate. If the first candidate
  // is immediately adjacent (distance 1), keep scanning further left for a valid anchor.
  if (leftmostCorrected > 1) {
    const correctedValue = originalValues[leftmostCorrected] * factors[leftmostCorrected];
    const corrFactor = factors[leftmostCorrected];

    // Scan left to find anchor: first cell where original value < corrected value
    // that is at least 2 positions away from the corrected cell.
    // This ensures there's at least 1 cell in between to interpolate.
    let anchorIdx = -1;
    for (let k = leftmostCorrected - 1; k >= 0; k--) {
      if (corrected[k] || interpolated[k]) {
        // Hit another corrected/interpolated cell — stop, this is already handled
        anchorIdx = -1;
        break;
      }
      if (originalValues[k] < correctedValue) {
        // Found a candidate — but only use it if distance > 1
        if ((leftmostCorrected - k) > 1) {
          anchorIdx = k;
          break;
        }
        // Distance is exactly 1 — skip this candidate and keep scanning left
        // to find one further away
      }
    }

    if (anchorIdx >= 0) {
      // Interpolate from anchor (factor=1.0, keeps original lower value) to leftmostCorrected (factor=corrFactor)
      const gapLen = leftmostCorrected - anchorIdx;
      for (let k = anchorIdx + 1; k < leftmostCorrected; k++) {
        if (!corrected[k] && !interpolated[k]) {
          const t = (k - anchorIdx) / gapLen;
          factors[k] = 1.0 + (corrFactor - 1.0) * t;
          interpolated[k] = true;
        }
      }
    } else if (anchorIdx < 0) {
      // No valid anchor found — use gradual fade
      // Blend from 1.0 at the edge to corrFactor at the corrected cell
      // Only blend up to 5 cells max to avoid over-extending
      const blendStart = Math.max(0, leftmostCorrected - 5);
      const blendLen = leftmostCorrected - blendStart;
      if (blendLen > 1) {
        for (let k = blendStart; k < leftmostCorrected; k++) {
          if (!corrected[k] && !interpolated[k]) {
            const t = (k - blendStart) / blendLen;
            factors[k] = 1.0 + (corrFactor - 1.0) * t;
            interpolated[k] = true;
          }
        }
      }
    }
  }

  // ── Right open-ended gap ──
  // From rightmost corrected cell, extend rightward.
  // Fuel maps are monotonically increasing left-to-right (more airflow = more fuel).
  // So to the RIGHT of a corrected cell, we look for the first cell with a value
  // GREATER THAN the corrected value — that's the natural anchor where the ramp ends.
  // Interpolate smoothly between the corrected value and that anchor value.
  // IMPORTANT: The anchor must be at least 2 positions away (distance > 1) so there's
  // at least one cell between corrected and anchor to interpolate.
  if (rightmostCorrected < len - 2) {
    const correctedValue = originalValues[rightmostCorrected] * factors[rightmostCorrected];
    const corrFactor = factors[rightmostCorrected];

    // Scan right to find anchor: first cell where original value > corrected value
    // that is at least 2 positions away from the corrected cell.
    let anchorIdx = -1;
    for (let k = rightmostCorrected + 1; k < len; k++) {
      if (corrected[k] || interpolated[k]) {
        // Hit another corrected/interpolated cell — stop
        anchorIdx = -1;
        break;
      }
      if (originalValues[k] > correctedValue) {
        // Found a candidate — but only use it if distance > 1
        if ((k - rightmostCorrected) > 1) {
          anchorIdx = k;
          break;
        }
        // Distance is exactly 1 — skip and keep scanning right
      }
    }

    if (anchorIdx >= 0) {
      // Interpolate from rightmostCorrected (factor=corrFactor) to anchor (factor=1.0, keeps original higher value)
      const gapLen = anchorIdx - rightmostCorrected;
      for (let k = rightmostCorrected + 1; k < anchorIdx; k++) {
        if (!corrected[k] && !interpolated[k]) {
          const t = (k - rightmostCorrected) / gapLen;
          factors[k] = corrFactor + (1.0 - corrFactor) * t;
          interpolated[k] = true;
        }
      }
    } else if (anchorIdx < 0) {
      // No valid anchor found — use gradual fade
      const blendEnd = Math.min(len - 1, rightmostCorrected + 5);
      const blendLen = blendEnd - rightmostCorrected;
      if (blendLen > 1) {
        for (let k = rightmostCorrected + 1; k <= blendEnd; k++) {
          if (!corrected[k] && !interpolated[k]) {
            const t = (k - rightmostCorrected) / blendLen;
            factors[k] = corrFactor + (1.0 - corrFactor) * t;
            interpolated[k] = true;
          }
        }
      }
    }
  }
}

// ─── Smoothing Engine ─────────────────────────────────────────────────────────

/**
 * Smoothing pass for corrected fuel maps.
 *
 * Fuel tables should have smooth gradients:
 *   - Values generally increase from left to right (more fuel at higher TPS/MAP)
 *   - Values peak around peak torque RPM, then may decrease at higher RPM
 *   - No sharp "spikes" or "dips" that deviate significantly from neighbors
 *
 * Algorithm:
 *   1. For each corrected/blended cell, compute the "expected" value as the
 *      weighted average of its 8 neighbors (Gaussian-weighted by distance).
 *   2. If the cell deviates from the expected value by more than a threshold,
 *      pull it toward the expected value by a smoothing factor.
 *   3. Repeat for multiple iterations to propagate smoothness.
 *   4. Only smooth cells that were corrected or blended — leave untouched cells alone.
 *
 * This preserves the overall correction direction while eliminating unrealistic
 * spikes that would cause driveability issues.
 *
 * @param map - The fuel map (after corrections/blending have been applied)
 * @param corrections - The cell corrections that were applied
 * @param options - Smoothing parameters
 * @returns A new FuelMap with smoothed values + set of smoothed cell keys
 */
export interface SmoothingOptions {
  /** Number of smoothing iterations (more = smoother). Default: 3 */
  iterations?: number;
  /** Max deviation threshold (fraction) before smoothing kicks in. Default: 0.03 (3%) */
  deviationThreshold?: number;
  /** How aggressively to pull toward expected value (0-1). Default: 0.6 */
  smoothingStrength?: number;
  /** Whether to also smooth blended cells or only data-corrected cells. Default: true */
  smoothBlended?: boolean;
}

export function smoothCorrectedMap(
  map: FuelMap,
  corrections: CellCorrection[],
  options?: SmoothingOptions,
): FuelMap & { smoothedCells: Set<string> } {
  const {
    iterations = 3,
    deviationThreshold = 0.03,
    smoothingStrength = 0.6,
    smoothBlended = true,
  } = options || {};

  // Build sample count lookup from corrections
  const sampleCountMap = new Map<string, number>();
  for (const corr of corrections) {
    sampleCountMap.set(`${corr.row}:${corr.col}`, corr.sampleCount);
  }

  const rows = map.data.length;
  const cols = rows > 0 ? map.data[0].length : 0;
  if (rows === 0 || cols === 0) {
    return { ...map, data: map.data.map(r => [...r]), smoothedCells: new Set() };
  }

  // Build a set of cells that are eligible for smoothing
  const correctedKeys = new Set<string>();
  for (const corr of corrections) {
    correctedKeys.add(`${corr.row}:${corr.col}`);
  }

  const blendedKeys = map.blendedCells || new Set<string>();

  // Compute the average sample count of corrected cells (for relative comparison)
  let totalSampleCount = 0;
  let correctedCellCount = 0;
  for (const corr of corrections) {
    if (corr.sampleCount > 0) {
      totalSampleCount += corr.sampleCount;
      correctedCellCount++;
    }
  }
  const avgSampleCount = correctedCellCount > 0 ? totalSampleCount / correctedCellCount : 1;

  // Determine which cells can be smoothed
  // High-sample cells (>= 2x average) are NOT smoothable — their data is more reliable
  const isSmootable: boolean[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const key = `${r}:${c}`;
      if (correctedKeys.has(key)) {
        // Skip smoothing for cells with significantly higher sample count than average
        const cellSamples = sampleCountMap.get(key) || 0;
        if (cellSamples >= avgSampleCount * 2) return false; // High-confidence cell, don't smooth
        return true;
      }
      if (smoothBlended && blendedKeys.has(key)) return true;
      return false;
    })
  );

  // Work on a copy of the data
  let data = map.data.map(r => [...r]);
  const smoothedCells = new Set<string>();

  // Gaussian-like weights for 8-connected neighbors
  // Cardinal neighbors (distance 1) get weight 1.0
  // Diagonal neighbors (distance √2) get weight 0.707
  const neighborOffsets: { dr: number; dc: number; weight: number }[] = [
    { dr: -1, dc: -1, weight: 0.707 },
    { dr: -1, dc:  0, weight: 1.0 },
    { dr: -1, dc:  1, weight: 0.707 },
    { dr:  0, dc: -1, weight: 1.0 },
    { dr:  0, dc:  1, weight: 1.0 },
    { dr:  1, dc: -1, weight: 0.707 },
    { dr:  1, dc:  0, weight: 1.0 },
    { dr:  1, dc:  1, weight: 0.707 },
  ];

  for (let iter = 0; iter < iterations; iter++) {
    const nextData = data.map(r => [...r]);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!isSmootable[r][c]) continue;

        const currentVal = data[r][c];
        if (currentVal <= 0) continue; // Skip zero/negative cells

        // Compute weighted average of neighbors
        // Weight = geometric distance weight * sample count weight
        // Neighbors with more samples exert stronger influence
        let weightedSum = 0;
        let totalWeight = 0;

        for (const { dr, dc, weight: distWeight } of neighborOffsets) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const neighborVal = data[nr][nc];
            if (neighborVal > 0) {
              // Sample-count weight: neighbors with more samples pull harder
              // Use sqrt to dampen the effect (avoid one high-sample cell dominating)
              const neighborKey = `${nr}:${nc}`;
              const neighborSamples = sampleCountMap.get(neighborKey) || 0;
              const sampleWeight = neighborSamples > 0
                ? Math.sqrt(neighborSamples / avgSampleCount)
                : 0.5; // Blended/interpolated cells get half weight
              const combinedWeight = distWeight * sampleWeight;
              weightedSum += neighborVal * combinedWeight;
              totalWeight += combinedWeight;
            }
          }
        }

        if (totalWeight === 0) continue;

        const expectedVal = weightedSum / totalWeight;
        const deviation = Math.abs(currentVal - expectedVal) / expectedVal;

        // Only smooth if deviation exceeds threshold
        if (deviation > deviationThreshold) {
          // Scale smoothing strength inversely by sample count:
          // Cells with more samples get less smoothing (they're more reliable)
          const cellKey = `${r}:${c}`;
          const cellSamples = sampleCountMap.get(cellKey) || 0;
          let effectiveStrength = smoothingStrength;
          if (cellSamples > 0 && avgSampleCount > 0) {
            // Reduce strength proportionally: at 1x avg → full strength, at 2x avg → 0 strength
            const sampleRatio = cellSamples / avgSampleCount;
            // Cells below avg get full strength, cells above avg get reduced strength (linear to 0 at 2x)
            effectiveStrength = smoothingStrength * Math.min(1, Math.max(0, 1 - (sampleRatio - 1)));
          }

          if (effectiveStrength > 0.01) {
            // Pull toward expected value by effective strength
            const smoothedVal = currentVal + (expectedVal - currentVal) * effectiveStrength;
            // Round to 3 decimal places (fuel table precision)
            nextData[r][c] = Math.round(smoothedVal * 1000) / 1000;
            smoothedCells.add(cellKey);
          }
        }
      }
    }

    data = nextData;
  }

  return { ...map, data, smoothedCells };
}
