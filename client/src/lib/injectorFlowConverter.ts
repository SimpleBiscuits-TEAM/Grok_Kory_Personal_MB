/**
 * Diesel Injector Flow Converter — Calculation Engine
 *
 * Converts a stock OEM injector duration table to work with aftermarket injectors
 * by computing flow ratio corrections at each (mm3/stroke, MPa) operating point.
 *
 * The approach:
 * 1. Use the S&S flow sheet test points to determine what the aftermarket injector
 *    delivers at specific (MPa, µs) conditions.
 * 2. Use the stock OEM table to determine what the stock injector delivers at those
 *    same (MPa, µs) conditions (via inverse interpolation).
 * 3. Compute a flow ratio (correction factor) at each test point.
 * 4. Build a 2D correction surface across the full pressure range by interpolating
 *    and extrapolating from the known test points.
 * 5. Apply the correction: for each cell in the stock table, multiply the duration
 *    by the correction factor at that (mm3, MPa) point.
 */

import {
  LB7_PRESSURE_AXIS_MPA,
  LB7_QUANTITY_AXIS_MM3,
  LB7_STOCK_DURATION_TABLE,
  SS_SAC00_FLOW_DATA,
} from './lb7InjectorData';

// ── Step 1: Inverse-interpolate the stock table ─────────────────────────────
// Given (MPa, µs), find what mm3/stroke the stock injector delivers.

function interpolateStockQuantity(pressureMPa: number, durationUs: number): number {
  // Find the pressure column index (or interpolate between columns)
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

  // Now inverse-interpolate: find which mm3/stroke corresponds to durationUs
  // Duration increases with quantity, so we search for the duration bracket
  if (durationUs <= 0) return 0;

  // Find the bracket
  for (let r = 0; r < qAxis.length - 1; r++) {
    const dur0 = durationsAtPressure[r];
    const dur1 = durationsAtPressure[r + 1];

    if (dur0 <= 0 && dur1 <= 0) continue;
    if (dur1 <= dur0) continue; // non-monotonic, skip

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

// ── Step 2: Compute flow ratios at S&S test points ──────────────────────────

export interface CorrectionPoint {
  pressureMPa: number;
  durationUs: number;
  stockMm3: number;
  ssMm3: number;
  /** Correction factor: stockMm3 / ssMm3. Multiply stock duration by this. */
  correctionFactor: number;
}

export function computeCorrectionPoints(): CorrectionPoint[] {
  return SS_SAC00_FLOW_DATA.map((tp) => {
    const stockMm3 = interpolateStockQuantity(tp.pressureMPa, tp.durationUs);
    const ssMm3 = tp.avgFlow;
    // If S&S delivers less than stock, correction > 1 (increase duration)
    // If S&S delivers more than stock, correction < 1 (decrease duration)
    const correctionFactor = ssMm3 > 0 ? stockMm3 / ssMm3 : 1.0;
    return {
      pressureMPa: tp.pressureMPa,
      durationUs: tp.durationUs,
      stockMm3: Math.round(stockMm3 * 10) / 10,
      ssMm3,
      correctionFactor: Math.round(correctionFactor * 1000) / 1000,
    };
  });
}

// ── Step 3: Build a 2D correction surface ───────────────────────────────────
// We have correction factors at 4 test points. We need to interpolate across
// the full (mm3, MPa) space.
//
// Strategy: The correction factor is primarily a function of pressure (MPa).
// At low pressure, S&S flows less → correction > 1 (longer pulse).
// At high pressure, S&S flows more → correction < 1 (shorter pulse).
// We build a pressure-dependent correction curve and apply it.

export function buildCorrectionCurve(): { pressureMPa: number; factor: number }[] {
  const points = computeCorrectionPoints();

  // Sort by pressure
  const sorted = [...points].sort((a, b) => a.pressureMPa - b.pressureMPa);

  // We have points at 30, 60, 160 MPa
  // Build a curve across the full 0-190 MPa range
  // Use the known points and interpolate/extrapolate smoothly

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

  // Build the full curve
  const curve: { pressureMPa: number; factor: number }[] = [];

  for (const mpa of LB7_PRESSURE_AXIS_MPA) {
    if (mpa === 0) {
      // At 0 MPa, no injection, factor doesn't matter but use 1.0
      curve.push({ pressureMPa: 0, factor: 1.0 });
      continue;
    }

    // Find bracketing known points
    let factor: number;

    if (mpa <= knownPoints[0].p) {
      // Below lowest known point — extrapolate (clamp to avoid extreme values)
      factor = knownPoints[0].f;
    } else if (mpa >= knownPoints[knownPoints.length - 1].p) {
      // Above highest known point — extrapolate
      factor = knownPoints[knownPoints.length - 1].f;
    } else {
      // Interpolate between bracketing points
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

// ── Step 4: Generate the corrected duration table ───────────────────────────

export function generateCorrectedTable(): {
  table: number[][];
  correctionCurve: { pressureMPa: number; factor: number }[];
  correctionPoints: CorrectionPoint[];
} {
  const correctionCurve = buildCorrectionCurve();
  const correctionPoints = computeCorrectionPoints();

  // Build a map from MPa → factor for quick lookup
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
        // Apply correction: divide by factor because if S&S flows more,
        // we need LESS duration, and vice versa.
        // corrected = stock_duration / correction_factor
        // Where correction_factor = stock_flow / ss_flow
        // If ss flows more (factor < 1), corrected < stock (shorter pulse)
        // If ss flows less (factor > 1), corrected > stock (longer pulse)
        const corrected = stockDuration / factor;
        // Round to nearest 0.5 µs for clean calibration values
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

// ── Export helpers ───────────────────────────────────────────────────────────

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
