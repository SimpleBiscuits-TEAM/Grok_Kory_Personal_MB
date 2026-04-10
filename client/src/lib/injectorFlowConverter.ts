/**
 * Diesel Injector Flow Converter — Calculation Engine
 *
 * Converts a stock OEM injector duration table to work with aftermarket injectors
 * by computing flow ratio corrections at each (mm3/stroke, MPa) operating point.
 *
 * NOW PARAMETERIZED: accepts user-provided test points (from OCR or manual entry)
 * instead of hardcoded S&S data.
 *
 * The approach:
 * 1. Use the user-provided flow sheet test points to determine what the aftermarket
 *    injector delivers at specific (MPa, µs) conditions.
 * 2. Use the stock OEM table to determine what the stock injector delivers at those
 *    same (MPa, µs) conditions (via inverse interpolation).
 * 3. Compute a flow ratio (correction factor) at each test point.
 * 4. Build a pressure-based correction curve by interpolating/extrapolating from
 *    the known test points.
 * 5. Apply the correction: for each cell in the stock table, multiply the duration
 *    by the correction factor at that (mm3, MPa) point.
 */

import {
  LB7_PRESSURE_AXIS_MPA,
  LB7_QUANTITY_AXIS_MM3,
  LB7_STOCK_DURATION_TABLE,
} from './lb7InjectorData';

// ── User-provided test point interface ─────────────────────────────────────
export interface FlowTestPoint {
  pressureMPa: number;
  durationUs: number;
  avgFlowMm3: number;
}

// ── Step 1: Inverse-interpolate the stock table ─────────────────────────────
// Given (MPa, µs), find what mm3/stroke the stock injector delivers.

function interpolateStockQuantity(pressureMPa: number, durationUs: number): number {
  const pAxis = LB7_PRESSURE_AXIS_MPA;
  const qAxis = LB7_QUANTITY_AXIS_MM3;
  const table = LB7_STOCK_DURATION_TABLE;

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

  // Inverse-interpolate: find which mm3/stroke corresponds to durationUs
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

// ── Step 2: Compute flow ratios at user-provided test points ───────────────

export interface CorrectionPoint {
  pressureMPa: number;
  durationUs: number;
  stockMm3: number;
  aftermarketMm3: number;
  /** Correction factor: stockMm3 / aftermarketMm3. Multiply stock duration by this. */
  correctionFactor: number;
}

export function computeCorrectionPoints(testPoints: FlowTestPoint[]): CorrectionPoint[] {
  return testPoints.map((tp) => {
    const stockMm3 = interpolateStockQuantity(tp.pressureMPa, tp.durationUs);
    const aftermarketMm3 = tp.avgFlowMm3;
    // If aftermarket delivers less than stock, correction > 1 (increase duration)
    // If aftermarket delivers more than stock, correction < 1 (decrease duration)
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

// ── Step 3: Build a pressure-based correction curve ────────────────────────

export function buildCorrectionCurve(
  testPoints: FlowTestPoint[]
): { pressureMPa: number; factor: number }[] {
  const points = computeCorrectionPoints(testPoints);

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

  for (const mpa of LB7_PRESSURE_AXIS_MPA) {
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

// ── Step 4: Generate the corrected duration table ──────────────────────────

export function generateCorrectedTable(testPoints: FlowTestPoint[]): {
  table: number[][];
  correctionCurve: { pressureMPa: number; factor: number }[];
  correctionPoints: CorrectionPoint[];
} {
  const correctionCurve = buildCorrectionCurve(testPoints);
  const correctionPoints = computeCorrectionPoints(testPoints);

  const factorByMPa = new Map<number, number>();
  for (const c of correctionCurve) {
    factorByMPa.set(c.pressureMPa, c.factor);
  }

  const correctedTable: number[][] = [];

  for (let r = 0; r < LB7_QUANTITY_AXIS_MM3.length; r++) {
    const row: number[] = [];
    for (let c = 0; c < LB7_PRESSURE_AXIS_MPA.length; c++) {
      const stockDuration = LB7_STOCK_DURATION_TABLE[r][c];
      const mpa = LB7_PRESSURE_AXIS_MPA[c];
      const factor = factorByMPa.get(mpa) ?? 1.0;

      if (stockDuration <= 0) {
        row.push(0.0);
      } else {
        const corrected = stockDuration / factor;
        row.push(Math.round(corrected * 2) / 2);
      }
    }
    correctedTable.push(row);
  }

  return {
    table: correctedTable,
    correctionCurve,
    correctionPoints,
  };
}

// ── Export helpers ──────────────────────────────────────────────────────────

/**
 * Format the corrected table as tab-separated values for pasting into
 * calibration software (e.g., HP Tuners, EFILive).
 */
export function formatTableForExport(table: number[][]): string {
  const header = ['mm3\\MPa', ...LB7_PRESSURE_AXIS_MPA.map(String)].join('\t');
  const rows = table.map((row, i) => {
    return [LB7_QUANTITY_AXIS_MM3[i].toString(), ...row.map(v => v.toFixed(1))].join('\t');
  });
  return [header, ...rows].join('\n');
}

/**
 * Format as CSV for file export.
 */
export function formatTableAsCSV(table: number[][]): string {
  const header = ['mm3/stroke', ...LB7_PRESSURE_AXIS_MPA.map(v => `${v} MPa`)].join(',');
  const rows = table.map((row, i) => {
    return [LB7_QUANTITY_AXIS_MM3[i].toString(), ...row.map(v => v.toFixed(1))].join(',');
  });
  return [header, ...rows].join('\n');
}
