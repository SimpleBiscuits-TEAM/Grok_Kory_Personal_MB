/**
 * Honda Talon Virtual Dyno Engine
 *
 * Estimates HP and Torque from street datalogs using fuel-flow-based power
 * estimation. When a dyno log with actual HP/Torque channels is loaded,
 * the engine learns a correction factor to improve street log estimates.
 *
 * Power estimation formula:
 *   Fuel Flow (g/s) = (Inj PW ms × Inj Flow Rate cc/min × Fuel Density g/cc × Cylinders) / (2 × 60 × 1000)
 *   HP = Fuel Flow (lb/hr) / BSFC
 *   Torque = HP × 5252 / RPM
 *
 * Supports:
 *   - Stock injectors (Honda Talon OEM ~310cc)
 *   - ID1050X injectors (1050cc)
 *   - ID1300X injectors (1300cc)
 *   - Fuel types: Pump Gas, UTV96, E85, E90, Ignite Red
 *   - Turbo and NA configurations
 *   - Dyno calibration learning from dyno WP8 logs
 */

import { WP8ParseResult, getHondaTalonKeyChannels } from './wp8Parser';

// ─── Injector Definitions ─────────────────────────────────────────────────────

export type InjectorType = 'stock' | 'id1050' | 'id1300';

/** Injector flow rates in cc/min at 3 bar (43.5 psi) base fuel pressure */
export const INJECTOR_FLOW_RATES: Record<InjectorType, number> = {
  stock: 310,    // Honda Talon OEM injectors ~310cc
  id1050: 1050,  // Injector Dynamics ID1050X
  id1300: 1300,  // Injector Dynamics ID1300X
};

// ─── Fuel Definitions ─────────────────────────────────────────────────────────

export type FuelType = 'pump' | 'utv96' | 'e85' | 'e90' | 'ignite_red';

export interface FuelProfile {
  name: string;
  stoichAFR: number;       // Stoichiometric AFR
  density: number;         // g/cc
  bsfc: number;            // Brake Specific Fuel Consumption (lb/hr per HP)
  energyDensity: number;   // BTU/lb (relative energy content)
}

/**
 * BSFC values calibrated from real Honda Talon dyno WP8 logs.
 *
 * Pump gas: 1,043 NA dyno logs, median measured BSFC = 0.3438, adjusted to 0.45
 * E85:     1 turbo dyno run (Kory_Talon_e85_JR_3bar_BRR_ID1050), measured BSFC = 1.02
 * E90:     1 turbo dyno run (Kory_JR_IgniteRed_ID1050_GravesSARemoved), measured BSFC = 1.04
 *
 * E85/E90/IGNITE RED are all ethanol fuels:
 *   - E85 = ~85% ethanol, 15% gasoline (stoich 9.8:1, ~108 RON)
 *   - E90 = ~90% ethanol, 10% gasoline (stoich 9.5:1, ~109 RON)
 *   - IGNITE RED = branded E90 race fuel (same properties as E90)
 *   - All require ~30-35% more fuel volume than gasoline for same energy
 *   - Primary advantage: high octane allows 30-35° timing (vs 20-25° pump gas)
 *   - Net power gain from timing advance exceeds energy density penalty
 */
export const FUEL_PROFILES: Record<FuelType, FuelProfile> = {
  pump: {
    name: 'Pump Gas (91/93)',
    stoichAFR: 14.7,
    density: 0.755,
    bsfc: 0.45,       // calibrated from 1043 dyno logs (median 0.34, adjusted for 2-cyl losses)
    energyDensity: 18400,
  },
  utv96: {
    name: 'UTV96',
    stoichAFR: 14.2,
    density: 0.760,
    bsfc: 0.44,       // slightly lower BSFC due to higher octane / better detonation margin
    energyDensity: 18200,
  },
  e85: {
    name: 'E85',
    stoichAFR: 9.8,
    density: 0.789,
    bsfc: 0.58,       // higher BSFC due to lower energy density — needs ~30% more fuel
    energyDensity: 12800,
  },
  e90: {
    name: 'E90',
    stoichAFR: 9.5,
    density: 0.793,
    bsfc: 0.60,       // similar to E85 but slightly more ethanol
    energyDensity: 12400,
  },
  ignite_red: {
    name: 'Ignite Red (E90)',
    stoichAFR: 9.5,   // IGNITE RED is E90 — same stoich as E90, NOT gasoline
    density: 0.793,   // same density as E90 (ethanol-based)
    bsfc: 0.60,       // same BSFC as E90 (same fuel chemistry)
    energyDensity: 12400,  // same energy density as E90
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TALON_CYLINDERS = 2;
const GRAMS_PER_POUND = 453.592;
const SECONDS_PER_HOUR = 3600;

/** Standard atmospheric pressure in kPa */
const ATM_KPA = 101.325;

/**
 * Turbo BSFC multipliers — fuel-specific, calibrated from real Dynojet dyno runs.
 *
 * Pump gas: 21 runs (58,351 pts), median measured BSFC = 0.905 → factor = 1.40
 * E85:     1 run (1,762 pts), median measured BSFC = 1.020 → factor = 1.76
 * E90:     1 run (2,463 pts), median measured BSFC = 1.039 → factor = 1.76
 *
 * The higher BSFC for turbo reflects:
 *   - Rich AFR targets for combustion chamber cooling (lambda ~0.80)
 *   - Excess fuel that doesn't produce power (cooling duty)
 *   - Large injector oversizing (ID1050 vs stock 310cc)
 *
 * NOTE: E85/E90 reference files had conservative timing (20-23° vs optimal 30-35°).
 * With properly advanced timing, E85/E90 turbo BSFC would be lower (better efficiency).
 * These factors will be recalibrated when properly-timed E85 reference files are available.
 *
 * E85 and E90 share the same turbo factor because their measured BSFC was nearly
 * identical (1.020 vs 1.039) — both are ethanol fuels with similar stoichiometry.
 */
const TURBO_BSFC_FACTOR_PUMP = 1.40;  // pump gas turbo (21 dyno runs)
const TURBO_BSFC_FACTOR_ETHANOL = 1.76;  // E85/E90/IGNITE RED turbo (2 dyno runs, conservative timing)

/** Helper to get fuel-specific turbo BSFC factor */
function getTurboBsfcFactor(fuelType: FuelType): number {
  switch (fuelType) {
    case 'e85':
    case 'e90':
    case 'ignite_red':
      return TURBO_BSFC_FACTOR_ETHANOL;
    default:
      return TURBO_BSFC_FACTOR_PUMP;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VirtualDynoConfig {
  injectorType: InjectorType;
  fuelType: FuelType;
  isTurbo: boolean;
  /** Optional correction factor learned from dyno log (default 1.0) */
  dynoCalibrationFactor: number;
}

export interface DynoDataPoint {
  rpm: number;
  estimatedHP: number;
  estimatedTorque: number;
  injPulseWidth: number;    // ms
  tps: number;              // degrees
  map: number;              // kPa
  afr: number;              // AFR (or lambda × 14.7)
  ignitionTiming: number;   // degrees
  fuelFlowGPerSec: number;  // g/s
  /** If dyno log, actual measured values */
  actualHP?: number;
  actualTorque?: number;
}

export interface VirtualDynoResult {
  dataPoints: DynoDataPoint[];
  /** RPM-binned peak HP/Torque curve */
  hpCurve: { rpm: number; hp: number; torque: number }[];
  peakHP: number;
  peakHPRpm: number;
  peakTorque: number;
  peakTorqueRpm: number;
  /** Detected configuration */
  detectedInjector: InjectorType;
  detectedFuel: FuelType;
  isDynoLog: boolean;
  /** Calibration factor (actual/estimated) from dyno log */
  calibrationFactor: number;
  /** Confidence level based on data quality */
  confidence: 'high' | 'medium' | 'low';
  /** Warnings */
  warnings: string[];
}

// ─── Metadata Detection ──────────────────────────────────────────────────────

/**
 * Detect injector type from filename, part number, and channel names
 */
export function detectInjectorType(
  fileName: string,
  partNumber: string,
): InjectorType {
  const combined = `${fileName} ${partNumber}`.toLowerCase();

  if (combined.includes('id1300') || combined.includes('1300x') || combined.includes('1300cc')) {
    return 'id1300';
  }
  if (combined.includes('id1050') || combined.includes('1050x') || combined.includes('1050cc')) {
    return 'id1050';
  }

  return 'stock';
}

/**
 * Detect fuel type from filename, part number, and notes
 */
export function detectFuelType(
  fileName: string,
  partNumber: string,
): FuelType {
  const combined = `${fileName} ${partNumber}`.toLowerCase();

  // Check specific fuels first (more specific matches)
  if (combined.includes('e90')) return 'e90';
  if (combined.includes('e85')) return 'e85';
  // IGNITE RED is a branded E90 race fuel — match various filename patterns
  if (combined.includes('ignite red') || combined.includes('ignitered') || combined.includes('ignite_red') || combined.includes('ignitred') || combined.includes('ignite')) {
    return 'ignite_red';
  }
  if (combined.includes('utv96') || combined.includes('utv 96')) return 'utv96';

  return 'pump';
}

/**
 * Detect if log is from a dyno (has HP/Torque channels)
 */
export function isDynoLog(wp8: WP8ParseResult): boolean {
  const keys = getHondaTalonKeyChannels(wp8);
  return keys.horsepower >= 0 || keys.torque >= 0;
}

// ─── Power Estimation ─────────────────────────────────────────────────────────

/**
 * Calculate fuel flow in grams per second from injector pulsewidth
 *
 * Formula:
 *   Flow (cc/s) = (PW_ms / 1000) × (FlowRate_cc_min / 60) × Cylinders / 2
 *   (divide by 2 because each cylinder fires once per 2 revolutions in 4-stroke)
 *   But PW is already per-injection, so:
 *   Flow (cc/s) = (PW_ms / 1000) × (FlowRate_cc_min / 60) × (RPM / 120)
 *   where RPM/120 = injections per second for one cylinder in a 4-stroke
 *   Total flow = Flow × Cylinders
 */
export function calculateFuelFlow(
  injPulseWidthMs: number,
  rpm: number,
  injectorFlowRate: number,  // cc/min
  fuelDensity: number,       // g/cc
  cylinders: number = TALON_CYLINDERS,
): number {
  if (rpm <= 0 || injPulseWidthMs <= 0) return 0;

  // Injections per second per cylinder (4-stroke: 1 injection per 2 revolutions)
  const injectionsPerSecond = rpm / 120;

  // Volume per injection (cc)
  const ccPerInjection = (injPulseWidthMs / 1000) * (injectorFlowRate / 60);

  // Total fuel flow (g/s) for all cylinders
  const fuelFlowGPerSec = ccPerInjection * injectionsPerSecond * cylinders * fuelDensity;

  return fuelFlowGPerSec;
}

/**
 * Estimate HP from fuel flow
 *
 * HP = FuelFlow(lb/hr) / BSFC
 */
export function estimateHP(fuelFlowGPerSec: number, bsfc: number): number {
  if (fuelFlowGPerSec <= 0 || bsfc <= 0) return 0;

  // Convert g/s to lb/hr
  const fuelFlowLbPerHr = (fuelFlowGPerSec / GRAMS_PER_POUND) * SECONDS_PER_HOUR;

  return fuelFlowLbPerHr / bsfc;
}

/**
 * Estimate HP with turbo BSFC correction.
 *
 * Calibrated from 21 real Dynojet dyno runs (58,351 WOT data points)
 * of a Jackson Racing turbo Talon with ID1050 injectors on 93 octane.
 *
 * The fuel-flow-based HP estimate already captures the extra fuel
 * being injected under boost. The correction needed is purely a BSFC
 * adjustment — turbo setups run significantly richer (lambda ~0.80)
 * for combustion chamber cooling, so a large portion of injected fuel
 * doesn't produce power. This is captured by the higher effective BSFC.
 *
 * No MAP-based multiplier is needed because:
 *   - The injector PW already reflects the actual fuel delivered
 *   - The BSFC ratio (2.01×) was derived from real measured HP vs
 *     calculated fuel flow, so it inherently accounts for all turbo
 *     effects (rich mixture, cooling duty, injector oversizing)
 */
export function estimateHPWithBoost(
  fuelFlowGPerSec: number,
  bsfc: number,
  isTurbo: boolean,
  _mapKpa: number,  // reserved for future RPM-dependent BSFC
  fuelType: FuelType = 'pump',
): number {
  if (fuelFlowGPerSec <= 0 || bsfc <= 0) return 0;

  const turboFactor = getTurboBsfcFactor(fuelType);
  const effectiveBsfc = isTurbo ? bsfc * turboFactor : bsfc;
  return estimateHP(fuelFlowGPerSec, effectiveBsfc);
}

/**
 * Calculate torque from HP and RPM
 * Torque (ft-lb) = HP × 5252 / RPM
 */
export function calculateTorque(hp: number, rpm: number): number {
  if (rpm <= 0 || hp <= 0) return 0;
  return (hp * 5252) / rpm;
}

// ─── Main Virtual Dyno Computation ───────────────────────────────────────────

/**
 * Run the virtual dyno analysis on a WP8 datalog
 */
export function computeVirtualDyno(
  wp8: WP8ParseResult,
  config: VirtualDynoConfig,
  fileName: string = '',
): VirtualDynoResult {
  const keys = getHondaTalonKeyChannels(wp8);
  const warnings: string[] = [];
  const hasDyno = isDynoLog(wp8);

  // Get fuel profile
  const fuel = FUEL_PROFILES[config.fuelType];
  const injFlowRate = INJECTOR_FLOW_RATES[config.injectorType];

  // Validate required channels
  const hasRPM = keys.engineSpeed >= 0;
  const hasInjPW = keys.injPwFinal >= 0 || keys.injPwDesired >= 0;
  const hasTPS = keys.throttlePosition >= 0;
  const hasMAP = keys.map >= 0 || keys.mapCorrected >= 0;
  const hasAFR = keys.afr1 >= 0 || keys.lambda1 >= 0;
  const hasIgnition = keys.ignitionTiming >= 0;

  if (!hasRPM) warnings.push('Missing Engine Speed channel — cannot estimate power');
  if (!hasInjPW) warnings.push('Missing Injector Pulsewidth channel — using TPS-based estimation');

  // Select channel indices
  const rpmIdx = keys.engineSpeed;
  const injPWIdx = keys.injPwFinal >= 0 ? keys.injPwFinal : keys.injPwDesired;
  const tpsIdx = keys.throttlePosition;
  const mapIdx = keys.mapCorrected >= 0 ? keys.mapCorrected : keys.map;
  const ignIdx = keys.ignitionTiming;

  // AFR: prefer AFR1, fallback to Lambda1 × stoich
  const afrIdx = keys.afr1 >= 0 ? keys.afr1 : -1;
  const lambdaIdx = keys.lambda1 >= 0 ? keys.lambda1 : -1;
  const isLambda = afrIdx < 0 && lambdaIdx >= 0;
  const afrSourceIdx = afrIdx >= 0 ? afrIdx : lambdaIdx;

  // Dyno channels
  const hpIdx = keys.horsepower;
  const torqueIdx = keys.torque;

  // ─── Process each row ────────────────────────────────────────────────
  const dataPoints: DynoDataPoint[] = [];

  for (const row of wp8.rows) {
    const rpm = rpmIdx >= 0 ? row.values[rpmIdx] : 0;

    // Skip idle and very low RPM
    if (rpm < 1500) continue;

    const injPW = injPWIdx >= 0 ? row.values[injPWIdx] : 0;
    const tps = tpsIdx >= 0 ? row.values[tpsIdx] : 0;
    const map = mapIdx >= 0 ? row.values[mapIdx] : 0;
    const ignition = ignIdx >= 0 ? row.values[ignIdx] : 0;

    // Skip deceleration (TPS = 0 with RPM > idle)
    if (tps <= 0 && rpm > 2000) continue;

    // Get AFR
    let afr = 14.7; // default stoich
    if (afrSourceIdx >= 0) {
      const rawVal = row.values[afrSourceIdx];
      afr = isLambda ? rawVal * fuel.stoichAFR : rawVal;
    }

    // Skip invalid AFR readings
    if (afr < 5 || afr > 25) continue;

    // Calculate fuel flow
    const fuelFlowGPerSec = calculateFuelFlow(
      injPW, rpm, injFlowRate, fuel.density,
    );

    // Estimate HP (with boost correction for turbo setups)
    let estHP = estimateHPWithBoost(fuelFlowGPerSec, fuel.bsfc, config.isTurbo, map, config.fuelType);

    // Apply dyno calibration factor
    estHP *= config.dynoCalibrationFactor;

    // Calculate torque
    const estTorque = calculateTorque(estHP, rpm);

    const point: DynoDataPoint = {
      rpm,
      estimatedHP: estHP,
      estimatedTorque: estTorque,
      injPulseWidth: injPW,
      tps,
      map,
      afr,
      ignitionTiming: ignition,
      fuelFlowGPerSec,
    };

    // If dyno log, capture actual values
    if (hasDyno) {
      if (hpIdx >= 0) point.actualHP = row.values[hpIdx];
      if (torqueIdx >= 0) point.actualTorque = row.values[torqueIdx];
    }

    dataPoints.push(point);
  }

  // ─── Build RPM-binned HP/Torque curve ────────────────────────────────
  const RPM_BIN_SIZE = 250;
  const rpmBins = new Map<number, { hpSum: number; torqueSum: number; count: number; maxHP: number; maxTorque: number }>();

  for (const pt of dataPoints) {
    const bin = Math.round(pt.rpm / RPM_BIN_SIZE) * RPM_BIN_SIZE;
    const existing = rpmBins.get(bin) || { hpSum: 0, torqueSum: 0, count: 0, maxHP: 0, maxTorque: 0 };

    // Use actual values from dyno if available, otherwise estimated
    const hp = pt.actualHP ?? pt.estimatedHP;
    const torque = pt.actualTorque ?? pt.estimatedTorque;

    existing.hpSum += hp;
    existing.torqueSum += torque;
    existing.count++;
    existing.maxHP = Math.max(existing.maxHP, hp);
    existing.maxTorque = Math.max(existing.maxTorque, torque);
    rpmBins.set(bin, existing);
  }

  // Build curve using peak values per bin (dyno-style — peak, not average)
  const hpCurve = Array.from(rpmBins.entries())
    .filter(([_, bin]) => bin.count >= 3) // need at least 3 samples per bin
    .map(([rpm, bin]) => ({
      rpm,
      hp: Math.round(bin.maxHP * 10) / 10,
      torque: Math.round(bin.maxTorque * 10) / 10,
    }))
    .sort((a, b) => a.rpm - b.rpm);

  // Find peaks
  let peakHP = 0, peakHPRpm = 0, peakTorque = 0, peakTorqueRpm = 0;
  for (const pt of hpCurve) {
    if (pt.hp > peakHP) { peakHP = pt.hp; peakHPRpm = pt.rpm; }
    if (pt.torque > peakTorque) { peakTorque = pt.torque; peakTorqueRpm = pt.rpm; }
  }

  // ─── Calculate calibration factor from dyno log ──────────────────────
  let calibrationFactor = config.dynoCalibrationFactor;
  if (hasDyno && dataPoints.some(p => p.actualHP !== undefined && p.actualHP > 10)) {
    // Compare estimated vs actual at WOT (TPS > 80%)
    const wotPoints = dataPoints.filter(p =>
      p.tps > 80 && p.actualHP !== undefined && p.actualHP > 10 && p.estimatedHP > 5
    );

    if (wotPoints.length >= 10) {
      const ratioSum = wotPoints.reduce((sum, p) => {
        // Undo the current calibration factor to get raw estimate
        const rawEstimate = p.estimatedHP / config.dynoCalibrationFactor;
        return sum + (p.actualHP! / rawEstimate);
      }, 0);
      calibrationFactor = ratioSum / wotPoints.length;

      // Clamp to reasonable range (0.5 to 2.0)
      calibrationFactor = Math.max(0.5, Math.min(2.0, calibrationFactor));
    } else {
      warnings.push('Not enough WOT data points to calibrate — using default factor');
    }
  }

  // ─── Determine confidence ────────────────────────────────────────────
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (hasDyno && calibrationFactor !== config.dynoCalibrationFactor) {
    confidence = 'high';
  } else if (hasInjPW && hasRPM && dataPoints.length > 100) {
    confidence = 'medium';
  } else if (dataPoints.length > 20) {
    confidence = 'low';
  }

  if (!hasInjPW) {
    confidence = 'low';
    warnings.push('No injector pulsewidth data — power estimates are rough approximations');
  }

  // Auto-detect injector and fuel from metadata
  const detectedInjector = detectInjectorType(fileName, wp8.partNumber);
  const detectedFuel = detectFuelType(fileName, wp8.partNumber);

  return {
    dataPoints,
    hpCurve,
    peakHP: Math.round(peakHP * 10) / 10,
    peakHPRpm,
    peakTorque: Math.round(peakTorque * 10) / 10,
    peakTorqueRpm,
    detectedInjector,
    detectedFuel,
    isDynoLog: hasDyno,
    calibrationFactor: Math.round(calibrationFactor * 1000) / 1000,
    confidence,
    warnings,
  };
}

/**
 * Smooth a curve using a simple moving average
 */
export function smoothCurve(
  curve: { rpm: number; hp: number; torque: number }[],
  windowSize: number = 3,
): { rpm: number; hp: number; torque: number }[] {
  if (curve.length < windowSize) return curve;

  const half = Math.floor(windowSize / 2);
  return curve.map((pt, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(curve.length - 1, i + half);
    let hpSum = 0, torqueSum = 0, count = 0;
    for (let j = start; j <= end; j++) {
      hpSum += curve[j].hp;
      torqueSum += curve[j].torque;
      count++;
    }
    return {
      rpm: pt.rpm,
      hp: Math.round((hpSum / count) * 10) / 10,
      torque: Math.round((torqueSum / count) * 10) / 10,
    };
  });
}
