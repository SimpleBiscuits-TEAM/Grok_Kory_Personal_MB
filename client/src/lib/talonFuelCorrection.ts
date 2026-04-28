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
 *   - Turbo auto-detection: MAP > 100 kPa = turbo
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
}

/** Full correction result for one fuel map */
export interface MapCorrectionResult {
  mapKey: keyof FuelMapState;
  corrections: CellCorrection[];
  totalCellsCorrected: number;
  totalCellsInMap: number;
  totalSamplesUsed: number;
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
 * Turbo = MAP > 100 kPa at any point.
 */
export function detectTurbo(wp8Data: WP8ParseResult): boolean {
  const keys = getHondaTalonKeyChannels(wp8Data);
  // Prefer corrected MAP if available
  const mapIdx = keys.mapCorrected !== -1 ? keys.mapCorrected : keys.map;
  if (mapIdx === -1) return false;

  for (const row of wp8Data.rows) {
    const mapVal = row.values[mapIdx];
    if (Number.isFinite(mapVal) && mapVal > 100) return true;
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
 * Transient fueling detection thresholds.
 *
 * "Additional Pulsewidth" = Injector PW Final - Injector PW Desired
 *
 * During steady-state operation, Additional PW is near zero (typically <5% of
 * Desired PW). When the driver makes a sudden throttle change, the ECU adds
 * transient enrichment which shows up as a spike in Additional PW. This
 * enrichment decays back to baseline as the engine stabilizes.
 *
 * Thresholds (as percentage of Desired PW):
 *   - Normal operation: Additional PW < 15% of Desired
 *   - Transient fueling: Additional PW >= 15% of Desired → skip correction
 *   - Excessive transient (lean): lambda > 1.1 during transient → tuner note
 *   - Excessive transient (rich): lambda < 0.75 during transient → tuner note
 *
 * This primarily applies to turbo applications where transient enrichment
 * is more aggressive, but the filter runs on all logs for safety.
 */
export const TRANSIENT_THRESHOLD_PCT = 15;  // % of desired PW
export const TRANSIENT_EXCESSIVE_LEAN_LAMBDA = 1.1;
export const TRANSIENT_EXCESSIVE_RICH_LAMBDA = 0.75;

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

// ─── Main Correction Engine ─────────────────────────────────────────────────────────

/**
 * Compute "Additional Pulsewidth" and detect transient fueling conditions.
 * Returns per-sample boolean array (true = transient, skip for correction)
 * and collects transient fueling statistics for tuner notes.
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

    // Transient = Additional PW exceeds threshold % of Desired PW
    const pctOfDesired = (addPW / desired) * 100;
    if (Math.abs(pctOfDesired) >= TRANSIENT_THRESHOLD_PCT) {
      isTransient[i] = true;
      transientCount++;

      // Collect lambda data for this transient sample
      const rpmVal = i < rpm.length ? rpm[i] : NaN;
      // Use average of both cylinders if available
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
      if (Number.isFinite(stftVal)) {
        correctedVal = rawVal / (1 + stftVal / 100);
      }
    }

    // Convert to lambda:
    // - If data is already lambda (dyno log Lambda1/Lambda2), use directly
    // - If data is AFR, divide by 14.7 (stoichiometric ratio for gasoline)
    const actualLambda = channelData.isAlreadyLambda
      ? correctedVal
      : correctedVal / 14.7;

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

  // Build correction results
  const corrections: CellCorrection[] = [];
  for (let r = 0; r < accum.length; r++) {
    for (let c = 0; c < accum[r].length; c++) {
      const cell = accum[r][c];
      if (cell.count === 0) continue; // Cell not used in datalog — no correction

      const avgLambda = cell.sumLambda / cell.count;
      const targetLambda = c < map.targetLambda.length ? map.targetLambda[c] : 0.95;

      // Correction factor: actual / target
      // If actual lambda is 1.0 and target is 0.85, factor = 1.176 → need more fuel
      // The correction is applied as: new_value = old_value * correction_factor
      const correctionFactor = targetLambda > 0 ? avgLambda / targetLambda : 1;

      const originalValue = map.data[r][c];
      const correctedValue = originalValue * correctionFactor;

      const correction: CellCorrection = {
        row: r,
        col: c,
        originalValue,
        correctedValue,
        correctionFactor,
        sampleCount: cell.count,
        avgActualLambda: avgLambda,
        targetLambda,
      };
      if (cell.stftCount > 0) {
        correction.avgStft = cell.sumStft / cell.stftCount;
      }
      corrections.push(correction);
    }
  }

  return {
    mapKey,
    corrections,
    totalCellsCorrected: corrections.length,
    totalCellsInMap: map.data.length * (map.data[0]?.length ?? 0),
    totalSamplesUsed: totalSamples,
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
