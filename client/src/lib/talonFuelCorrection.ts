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
 * 0-40° TPS = 0.95, 45° = 0.9, 50°+ = 0.85
 */
export function getNAAlphaNTargets(colAxis: number[]): number[] {
  return colAxis.map(tps => {
    if (tps <= 40) return 0.95;
    if (tps <= 45) return 0.90;
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

// ─── Main Correction Engine ───────────────────────────────────────────────────────────────────

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

  // ── Pass 1: Gap Interpolation ──
  // For each row, find uncorrected cells between two corrected cells and interpolate
  for (let r = 0; r < rows; r++) {
    interpolateGapsInLine(factorGrid[r], isCorrected[r], isInterpolated[r]);
  }
  // For each column, find uncorrected cells between two corrected cells and interpolate
  for (let c = 0; c < cols; c++) {
    const colFactors = factorGrid.map(row => row[c]);
    const colCorrected = isCorrected.map(row => row[c]);
    const colInterpolated = isInterpolated.map(row => row[c]);
    interpolateGapsInLine(colFactors, colCorrected, colInterpolated);
    // Write back
    for (let r = 0; r < rows; r++) {
      if (!isCorrected[r][c] && !isInterpolated[r][c] && colInterpolated[r]) {
        // Column interpolation found a gap that row interpolation missed
        factorGrid[r][c] = colFactors[r];
        isInterpolated[r][c] = true;
      } else if (isInterpolated[r][c] && colInterpolated[r]) {
        // Both row and column found this as a gap — average the two interpolations
        factorGrid[r][c] = (factorGrid[r][c] + colFactors[r]) / 2;
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
 * Finds uncorrected cells between two corrected cells and linearly interpolates.
 */
function interpolateGapsInLine(
  factors: number[],
  corrected: boolean[],
  interpolated: boolean[],
): void {
  const len = factors.length;
  let i = 0;

  while (i < len) {
    // Find a corrected cell (start of potential gap)
    if (!corrected[i]) { i++; continue; }

    const gapStart = i;
    // Scan forward to find the next corrected cell
    let j = i + 1;
    while (j < len && !corrected[j]) j++;

    if (j < len && j - gapStart > 1) {
      // There's a gap between gapStart and j — interpolate
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
}
