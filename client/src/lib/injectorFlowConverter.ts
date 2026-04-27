/**
 * Diesel Injector Flow Converter — Calculation Engine (v2)
 *
 * Fully parameterized: accepts any EngineConfig from duramaxInjectorData.ts.
 *
 * TWO-STEP WORKFLOW:
 *
 * Step 1 — OEM Match:
 *   Given the aftermarket injector's flow sheet (pressure, duration, mm³),
 *   compute new duration values so the ECM delivers the SAME mm³ as stock
 *   at every cell. This is pure interpolation from the flow sheet data
 *   against the stock duration table.
 *
 * Step 2 — Target Fueling (optional):
 *   User specifies a target max mm³ (e.g., 300 mm³). The tool ADDS duration
 *   in the lower-right corner of the table (high quantity rows, high pressure
 *   columns) to hit the target. The upper-left (idle, light load) stays at
 *   the OEM-matched values. The additional duration ramps progressively —
 *   it's NOT a uniform scale.
 *
 * Key insight: the mm³ axis labels may be hardcoded in the ECM. Even if the
 * axis says "100 mm³", the duration value can make the aftermarket injector
 * deliver 300 mm³. The axis is just an index; duration controls actual fuel.
 */

import {
  type EngineConfig,
  getPressureAxisMpa,
} from './duramaxInjectorData';

// ── User-provided test point interface ─────────────────────────────────────
export interface FlowTestPoint {
  pressureMPa: number;   // Rail pressure in MPa (always normalized internally)
  durationUs: number;    // Injector open time in µs
  avgFlowMm3: number;   // Average fuel delivered in mm³/stroke
}

// ── Correction / analysis output types ─────────────────────────────────────
export interface CorrectionPoint {
  pressureMPa: number;
  durationUs: number;
  stockMm3: number;
  aftermarketMm3: number;
  /** Correction factor: stockMm3 / aftermarketMm3. */
  correctionFactor: number;
}

export interface CorrectedTableResult {
  table: number[][];
  /** The OEM-matched table (before target fueling additions) */
  oemMatchedTable: number[][];
  correctionCurve: { pressureMPa: number; factor: number }[];
  correctionPoints: CorrectionPoint[];
  engine: EngineConfig;
  /** If target fueling was used */
  targetFueling?: {
    targetMaxMm3: number;
    stockMaxMm3: number;
  };
}

// ── Step 1a: Inverse-interpolate the stock table ────────────────────────────
// Given (MPa, µs) and an engine config, find what mm³/stroke the stock
// injector delivers.

function interpolateStockQuantity(
  pressureMPa: number,
  durationUs: number,
  engine: EngineConfig,
): number {
  const pAxis = getPressureAxisMpa(engine);
  const qAxis = engine.quantityAxis;
  const table = engine.durationTable;

  // Find pressure column interpolation
  let pIdx0 = 0;
  let pIdx1 = 0;
  let pFrac = 0;

  if (pressureMPa <= pAxis[0]) {
    pIdx0 = 0; pIdx1 = 0; pFrac = 0;
  } else if (pressureMPa >= pAxis[pAxis.length - 1]) {
    pIdx0 = pAxis.length - 1; pIdx1 = pAxis.length - 1; pFrac = 0;
  } else {
    for (let i = 0; i < pAxis.length - 1; i++) {
      if (pressureMPa >= pAxis[i] && pressureMPa <= pAxis[i + 1]) {
        pIdx0 = i;
        pIdx1 = i + 1;
        pFrac = (pressureMPa - pAxis[i]) / (pAxis[i + 1] - pAxis[i]);
        break;
      }
    }
  }

  // For each quantity row, interpolate the duration at this pressure
  const durationsAtPressure: number[] = [];
  for (let r = 0; r < qAxis.length; r++) {
    const d0 = table[r][pIdx0];
    const d1 = table[r][pIdx1];
    durationsAtPressure.push(d0 + (d1 - d0) * pFrac);
  }

  // Inverse-interpolate: find which mm³/stroke corresponds to durationUs
  if (durationUs <= 0) return 0;

  for (let r = 0; r < qAxis.length - 1; r++) {
    const dur0 = durationsAtPressure[r];
    const dur1 = durationsAtPressure[r + 1];

    if (dur0 <= 0 && dur1 <= 0) continue;
    if (dur1 <= dur0) continue;

    if (durationUs >= dur0 && durationUs <= dur1) {
      const frac = (durationUs - dur0) / (dur1 - dur0);
      return qAxis[r] + (qAxis[r + 1] - qAxis[r]) * frac;
    }
  }

  // Extrapolate beyond table range
  const lastDur = durationsAtPressure[durationsAtPressure.length - 1];
  const secondLastDur = durationsAtPressure[durationsAtPressure.length - 2];
  if (durationUs > lastDur && lastDur > secondLastDur) {
    const slope = (qAxis[qAxis.length - 1] - qAxis[qAxis.length - 2]) / (lastDur - secondLastDur);
    return qAxis[qAxis.length - 1] + slope * (durationUs - lastDur);
  }

  return 0;
}

// ── Step 1b: Compute flow ratios at user-provided test points ──────────────

export function computeCorrectionPoints(
  testPoints: FlowTestPoint[],
  engine: EngineConfig,
): CorrectionPoint[] {
  return testPoints.map((tp) => {
    const stockMm3 = interpolateStockQuantity(tp.pressureMPa, tp.durationUs, engine);
    const aftermarketMm3 = tp.avgFlowMm3;
    const correctionFactor = aftermarketMm3 > 0 ? stockMm3 / aftermarketMm3 : 1.0;
    return {
      pressureMPa: tp.pressureMPa,
      durationUs: tp.durationUs,
      stockMm3: Math.round(stockMm3 * 10) / 10,
      aftermarketMm3,
      correctionFactor: Math.round(correctionFactor * 1000) / 1000,
    };
  });
}

// ── Step 1c: Build a pressure-based correction curve ───────────────────────

export function buildCorrectionCurve(
  testPoints: FlowTestPoint[],
  engine: EngineConfig,
): { pressureMPa: number; factor: number }[] {
  const points = computeCorrectionPoints(testPoints, engine);
  const pAxisMpa = getPressureAxisMpa(engine);

  const sorted = [...points].sort((a, b) => a.pressureMPa - b.pressureMPa);

  // Known correction factors by pressure (average if multiple at same pressure)
  const pressureFactors: Map<number, number[]> = new Map();
  for (const p of sorted) {
    const existing = pressureFactors.get(p.pressureMPa) || [];
    existing.push(p.correctionFactor);
    pressureFactors.set(p.pressureMPa, existing);
  }

  const knownPoints: { p: number; f: number }[] = [];
  for (const [p, factors] of pressureFactors) {
    const avg = factors.reduce((a, b) => a + b, 0) / factors.length;
    knownPoints.push({ p, f: avg });
  }
  knownPoints.sort((a, b) => a.p - b.p);

  const curve: { pressureMPa: number; factor: number }[] = [];

  for (const mpa of pAxisMpa) {
    if (mpa === 0) {
      curve.push({ pressureMPa: 0, factor: 1.0 });
      continue;
    }

    let factor: number;

    if (knownPoints.length === 0) {
      factor = 1.0;
    } else if (knownPoints.length === 1) {
      factor = knownPoints[0].f;
    } else if (mpa <= knownPoints[0].p) {
      factor = knownPoints[0].f;
    } else if (mpa >= knownPoints[knownPoints.length - 1].p) {
      factor = knownPoints[knownPoints.length - 1].f;
    } else {
      let lo = knownPoints[0];
      let hi = knownPoints[knownPoints.length - 1];
      for (let i = 0; i < knownPoints.length - 1; i++) {
        if (mpa >= knownPoints[i].p && mpa <= knownPoints[i + 1].p) {
          lo = knownPoints[i];
          hi = knownPoints[i + 1];
          break;
        }
      }
      const frac = (mpa - lo.p) / (hi.p - lo.p);
      factor = lo.f + (hi.f - lo.f) * frac;
    }

    curve.push({ pressureMPa: mpa, factor: Math.round(factor * 1000) / 1000 });
  }

  return curve;
}

// ── Step 1d: Generate OEM-matched duration table ───────────────────────────
// Produces a table where every cell delivers the same mm³ as stock,
// but using the aftermarket injector's flow characteristics.

function generateOemMatchedTable(
  correctionCurve: { pressureMPa: number; factor: number }[],
  engine: EngineConfig,
): number[][] {
  const pAxisMpa = getPressureAxisMpa(engine);

  const factorByMPa = new Map<number, number>();
  for (const c of correctionCurve) {
    factorByMPa.set(c.pressureMPa, c.factor);
  }

  const table: number[][] = [];

  for (let r = 0; r < engine.quantityAxis.length; r++) {
    const row: number[] = [];
    for (let c = 0; c < pAxisMpa.length; c++) {
      const stockDuration = engine.durationTable[r][c];
      const mpa = pAxisMpa[c];
      const factor = factorByMPa.get(mpa) ?? 1.0;

      if (stockDuration <= 0) {
        row.push(0.0);
      } else {
        // Divide stock duration by correction factor to get OEM-equivalent
        // If aftermarket flows more (factor < 1), duration decreases
        // If aftermarket flows less (factor > 1), duration increases
        const corrected = stockDuration / factor;
        row.push(Math.round(corrected * 2) / 2); // Round to 0.5 µs
      }
    }
    table.push(row);
  }

  return table;
}

// ── Step 2: Add duration for target fueling ────────────────────────────────
// Starting from the OEM-matched table, ADD duration in the lower-right
// corner to hit the user's desired mm³. The ramp is progressive:
// - Row 0 (0 mm³) gets no addition
// - Rows increase progressively toward the bottom
// - The addition is proportional to how far above stock the target is
// - At each pressure, higher pressures need less additional duration
//   (because the injector flows more per µs at higher pressure)

function addTargetFuelingDuration(
  oemTable: number[][],
  correctionCurve: { pressureMPa: number; factor: number }[],
  engine: EngineConfig,
  targetMaxMm3: number,
): number[][] {
  const qAxis = engine.quantityAxis;
  const pAxisMpa = getPressureAxisMpa(engine);
  const stockMaxMm3 = qAxis[qAxis.length - 1];

  // If target is at or below stock, no additions needed
  if (targetMaxMm3 <= stockMaxMm3) return oemTable.map(row => [...row]);

  // How much extra mm³ we need at the max row
  const extraMm3Needed = targetMaxMm3 - stockMaxMm3;

  // Build a factor map for quick lookup
  const factorByMPa = new Map<number, number>();
  for (const c of correctionCurve) {
    factorByMPa.set(c.pressureMPa, c.factor);
  }

  // For each row, compute a "ramp" factor: 0 at row 0, 1.0 at the last row.
  // The ramp is based on the quantity axis position (how far along the
  // fueling range this row is). We use a progressive curve so the bottom
  // rows get most of the addition.
  const maxQ = stockMaxMm3;
  const rampFactors: number[] = qAxis.map(q => {
    if (maxQ <= 0) return 0;
    // Use a power curve for progressive ramp (exponent > 1 = more addition at bottom)
    const normalized = q / maxQ;
    return Math.pow(normalized, 1.5); // 1.5 gives a nice progressive ramp
  });

  // At each cell, we need to figure out how much additional duration
  // to add so the aftermarket injector delivers the extra mm³.
  //
  // The aftermarket injector's flow rate (mm³ per µs) at a given pressure
  // can be estimated from the correction factor and the stock table's
  // implicit flow rate.
  //
  // Stock flow rate at pressure P ≈ stockMaxMm3 / stockDuration_at_maxRow
  // Aftermarket flow rate = stock flow rate / correctionFactor
  // Extra duration needed = extraMm3 / aftermarketFlowRate

  const result: number[][] = [];

  for (let r = 0; r < qAxis.length; r++) {
    const row: number[] = [];
    const ramp = rampFactors[r];
    const extraMm3ForThisRow = extraMm3Needed * ramp;

    for (let c = 0; c < pAxisMpa.length; c++) {
      const oemDuration = oemTable[r][c];

      if (oemDuration <= 0 || extraMm3ForThisRow <= 0) {
        row.push(oemDuration);
        continue;
      }

      // Estimate the aftermarket injector's flow rate at this pressure
      // using the stock table's max-row duration and the correction factor
      const mpa = pAxisMpa[c];
      const factor = factorByMPa.get(mpa) ?? 1.0;
      const stockMaxDuration = engine.durationTable[engine.quantityAxis.length - 1][c];

      if (stockMaxDuration <= 0) {
        row.push(oemDuration);
        continue;
      }

      // Stock flow rate: mm³ per µs at this pressure
      const stockFlowRate = stockMaxMm3 / stockMaxDuration;
      // Aftermarket flow rate: adjusted by correction factor
      // factor < 1 means aftermarket flows MORE, so flow rate is higher
      const aftermarketFlowRate = stockFlowRate / factor;

      if (aftermarketFlowRate <= 0) {
        row.push(oemDuration);
        continue;
      }

      // Additional duration needed for the extra mm³
      const additionalDuration = extraMm3ForThisRow / aftermarketFlowRate;
      const finalDuration = oemDuration + additionalDuration;

      row.push(Math.round(finalDuration * 2) / 2); // Round to 0.5 µs
    }
    result.push(row);
  }

  return result;
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Generate a corrected duration table.
 *
 * @param testPoints - Aftermarket injector flow sheet data
 * @param engine - The engine config to use
 * @param targetMaxMm3 - Optional: if provided and > stock max, adds duration
 *   progressively in the lower-right corner to hit this target.
 */
export function generateCorrectedTable(
  testPoints: FlowTestPoint[],
  engine: EngineConfig,
  targetMaxMm3?: number,
): CorrectedTableResult {
  const correctionCurve = buildCorrectionCurve(testPoints, engine);
  const correctionPoints = computeCorrectionPoints(testPoints, engine);

  // Step 1: OEM-matched table
  const oemMatchedTable = generateOemMatchedTable(correctionCurve, engine);

  // Step 2: Add target fueling if requested
  let finalTable: number[][];
  let targetFueling: CorrectedTableResult['targetFueling'] = undefined;
  const stockMaxMm3 = engine.quantityAxis[engine.quantityAxis.length - 1];

  if (targetMaxMm3 && targetMaxMm3 > stockMaxMm3) {
    finalTable = addTargetFuelingDuration(
      oemMatchedTable,
      correctionCurve,
      engine,
      targetMaxMm3,
    );
    targetFueling = {
      targetMaxMm3,
      stockMaxMm3,
    };
  } else {
    finalTable = oemMatchedTable.map(row => [...row]);
  }

  return {
    table: finalTable,
    oemMatchedTable,
    correctionCurve,
    correctionPoints,
    engine,
    targetFueling,
  };
}

// ── Export helpers ──────────────────────────────────────────────────────────

/**
 * Format the corrected table as tab-separated values for pasting into
 * calibration software (e.g., HP Tuners, EFILive).
 * Uses the engine's native pressure axis for column headers.
 */
export function formatTableForExport(
  table: number[][],
  engine: EngineConfig,
): string {
  const pAxis = engine.pressureAxis;
  const qAxis = engine.quantityAxis;
  const unit = engine.nativePressureUnit;

  const header = [`mm3\\${unit}`, ...pAxis.map(String)].join('\t');
  const rows = table.map((row, i) => {
    return [qAxis[i].toString(), ...row.map(v => v.toFixed(1))].join('\t');
  });
  return [header, ...rows].join('\n');
}

/**
 * Format as CSV for file export.
 */
export function formatTableAsCSV(
  table: number[][],
  engine: EngineConfig,
): string {
  const pAxis = engine.pressureAxis;
  const qAxis = engine.quantityAxis;
  const unit = engine.nativePressureUnit;

  const header = ['mm3/stroke', ...pAxis.map(v => `${v} ${unit}`)].join(',');
  const rows = table.map((row, i) => {
    return [qAxis[i].toString(), ...row.map(v => v.toFixed(1))].join(',');
  });
  return [header, ...rows].join('\n');
}
