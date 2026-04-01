/**
 * Honda Talon Fuel Table Correction Engine
 *
 * Corrects fuel tables based on AFR readings from WP8 datalog.
 *
 * Rules:
 *   - AFR1 → Cylinder 1, AFR2 → Cylinder 2
 *   - Correction factor = actual_lambda / target_lambda per cell, averaged
 *   - Alpha-N channel = 1 → only Alpha-N tables; ≠ 1 → only Speed Density tables
 *   - Only cells visited in the datalog get corrected
 *   - Skip deceleration events: TPS = 0 AND vehicle speed > 0
 *   - When Short Term Fuel Trims (STFT) are present, factor them into the
 *     actual AFR before computing lambda. Negative STFT = ECU pulling fuel,
 *     positive STFT = ECU adding fuel. Corrected AFR = measured AFR / (1 + STFT/100).
 *   - Turbo auto-detection: MAP > 100 kPa = turbo
 *   - Turbo SD column lookup: use Desired Injector Pulsewidth interpolated against
 *     SD Cyl1 table (MAP not accurate enough on turbo applications)
 *   - When "Manifold Absolute Pressure Corrected" channel is available, use it for
 *     SD axis reference instead of raw MAP
 *
 * NOTE: Deceleration filter and STFT logic are designed to be reusable for
 * future Kawasaki fuel correction tool.
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
  isDynoLog: boolean;
  /** Which source was used: 'afr' or 'lambda' */
  lambdaSource: 'afr' | 'lambda';
  totalSamples: number;
  alphaNSamples: number;
  sdSamples: number;
  decelSamplesSkipped: number;
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
}

// ─── Main Correction Engine ─────────────────────────────────────────────────

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
  const hasLambda1 = keys.lambda1 !== -1;
  const hasLambda2 = keys.lambda2 !== -1;

  // Determine which source to use
  const useLambdaChannels = !hasAfr1 && hasLambda1;

  let cyl1Data: number[];
  let cyl2Data: number[];
  let isAlreadyLambda: boolean;

  if (useLambdaChannels) {
    // Dyno log: use Lambda channels directly
    cyl1Data = extract(keys.lambda1);
    // Single-sensor fallback: if Lambda2 not available, use Lambda1 for both
    cyl2Data = hasLambda2 ? extract(keys.lambda2) : cyl1Data;
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
    map: keys.mapCorrected !== -1 ? extract(keys.mapCorrected) : extract(keys.map),
    cyl1: cyl1Data,
    cyl2: cyl2Data,
    isAlreadyLambda,
    alphaN: extract(keys.alphaN),
    injPwDesired: extract(keys.injPwDesired),
    vehicleSpeed: extract(keys.vehicleSpeed),
    stft: extract(keys.stft),
    hasAfr1,
    hasAfr2,
    hasLambda1,
    hasLambda2,
    hasAlphaN: keys.alphaN !== -1,
    hasInjPwDesired: keys.injPwDesired !== -1,
    hasMapCorrected: keys.mapCorrected !== -1,
    hasVehicleSpeed: keys.vehicleSpeed !== -1,
    hasStft: keys.stft !== -1,
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

  for (let i = 0; i < channelData.rpm.length; i++) {
    const rpm = channelData.rpm[i];
    const alphaNVal = channelData.alphaN[i];
    const rawVal = cylData[i];

    if (isNaN(rpm) || isNaN(rawVal) || rawVal <= 0) continue;

    // ── Deceleration filter: skip TPS=0 + vehicle speed > 0 ──
    // When throttle is closed and vehicle is moving, the engine is in
    // decel fuel cut or overrun — AFR readings are meaningless.
    // (Reusable pattern for Kawasaki tool)
    const tpsVal = channelData.tps[i];
    const vSpeed = channelData.vehicleSpeed[i];
    if (channelData.hasVehicleSpeed && Number.isFinite(tpsVal) && Number.isFinite(vSpeed)) {
      if (tpsVal === 0 && vSpeed > 0) continue;
    }

    // Check if this sample belongs to this map's mode
    const sampleIsAlphaN = alphaNVal === 1;
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

  // Count Alpha-N vs SD samples, and decel-filtered samples
  let alphaNSamples = 0;
  let sdSamples = 0;
  let decelSamplesSkipped = 0;
  for (let i = 0; i < channelData.alphaN.length; i++) {
    // Check decel filter at the top-level count too
    const tpsVal = channelData.tps[i];
    const vSpeed = channelData.vehicleSpeed[i];
    if (channelData.hasVehicleSpeed && Number.isFinite(tpsVal) && Number.isFinite(vSpeed)) {
      if (tpsVal === 0 && vSpeed > 0) {
        decelSamplesSkipped++;
        continue;
      }
    }
    if (channelData.alphaN[i] === 1) alphaNSamples++;
    else sdSamples++;
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
    isDynoLog: channelData.isDynoLog,
    lambdaSource: channelData.isAlreadyLambda ? 'lambda' : 'afr',
    totalSamples: channelData.rpm.length,
    alphaNSamples,
    sdSamples,
    decelSamplesSkipped,
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
