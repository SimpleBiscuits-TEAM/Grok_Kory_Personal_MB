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
 *   - Turbo kits: Jackson Racing (JR), Full Performance (FP), Kraftwerks (KW)
 *   - Power Commander piggyback detection (uses Primary Inj PW 1)
 *   - Dyno calibration learning from dyno WP8 logs
 */

import { WP8ParseResult, getHondaTalonKeyChannels } from './wp8Parser';

// ─── Injector Definitions ─────────────────────────────────────────────────────

export type InjectorType = 'stock' | 'jr_kit' | 'kw800' | 'id1050' | 'id1300';

/** Injector flow rates in cc/min at 3 bar (43.5 psi) base fuel pressure */
export const INJECTOR_FLOW_RATES: Record<InjectorType, number> = {
  stock: 310,    // Honda Talon OEM injectors ~310cc
  jr_kit: 345,   // Jackson Racing turbo kit injectors ~345cc (~15% more than stock)
                 // Believed to be the same injector used in Honda 700cc single-cylinder engines
                 // Default for JR turbo when no explicit injector model in filename
  kw800: 800,    // FIC (Fuel Injector Clinic) 800cc — Kraftwerks turbo kit injectors
                 // Flow-tested: #1 = 798 cc/min, #8 = 801 cc/min (0.5% match)
                 // Average flow: 800 cc/min at 43.5 psi / 76 lb/hr
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

// ─── Turbo Kit Definitions ──────────────────────────────────────────────────────────────

/**
 * Turbo kit type detected from filename.
 *
 * 'na'            — Naturally aspirated (no turbo)
 * 'jr'            — Jackson Racing supercharger/turbo kit (least efficient of the three)
 * 'kw'            — Kraftwerks turbo kit (mid-efficiency, between JR and FP)
 * 'fp'            — Full Performance turbo kit (most efficient of the three)
 * 'generic_turbo' — Turbo detected from MAP > 100 kPa but kit not identified from filename
 */
export type TurboType = 'na' | 'jr' | 'kw' | 'fp' | 'generic_turbo';

/**
 * Turbo BSFC multipliers — turbo-kit × fuel specific.
 *
 * Each turbo kit has different compressor efficiency, which affects how much
 * excess fuel is needed for cooling and how much of the injected fuel actually
 * produces power. More efficient turbos have lower BSFC factors.
 *
 * Calibration data:
 *   JR pump:    21 runs (58,351 pts), ID1050, 93 octane → factor 1.40
 *   JR ethanol:  2 runs (4,225 pts), ID1050, E85/IGNITE RED, conservative timing 20-23° → factor 1.76
 *   FP ethanol: 19 runs (31,000+ pts), ID1300, IGNITE RED, proper timing 29.5°, Power Commander → factor 1.83
 *   KW:         placeholder (awaiting reference files) — estimated between JR and FP
 *   Generic:    average of JR and FP for unknown turbo kits
 *
 * The higher BSFC for turbo reflects:
 *   - Rich AFR targets for combustion chamber cooling (lambda ~0.80)
 *   - Excess fuel that doesn't produce power (cooling duty)
 *   - Large injector oversizing (ID1050/ID1300 vs stock 310cc)
 *   - Turbo compressor efficiency differences between kits
 */
const TURBO_BSFC_MATRIX: Record<Exclude<TurboType, 'na'>, { pump: number; ethanol: number }> = {
  jr:            { pump: 1.40, ethanol: 1.76 },  // JR: 21 pump runs + 2 ethanol runs (conservative timing)
  kw:            { pump: 1.50, ethanol: 1.80 },  // KW: placeholder — estimated between JR and FP (awaiting files)
  fp:            { pump: 1.60, ethanol: 1.64 },  // FP: 19 ethanol runs (proper timing 29.5°), pump estimated
  generic_turbo: { pump: 1.50, ethanol: 1.80 },  // Generic: average of JR and FP for unknown turbo kits
};

/** Helper to get turbo-kit × fuel BSFC factor */
function getTurboBsfcFactor(turboType: TurboType, fuelType: FuelType): number {
  if (turboType === 'na') return 1.0;  // NA = no turbo correction
  const entry = TURBO_BSFC_MATRIX[turboType];
  switch (fuelType) {
    case 'e85':
    case 'e90':
    case 'ignite_red':
      return entry.ethanol;
    default:
      return entry.pump;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VirtualDynoConfig {
  injectorType: InjectorType;
  fuelType: FuelType;
  /** @deprecated Use turboType instead. Kept for backward compatibility. */
  isTurbo: boolean;
  /** Turbo kit type — determines kit-specific BSFC factor. Defaults to generic_turbo when isTurbo=true. */
  turboType?: TurboType;
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
  detectedTurboType: TurboType;
  isDynoLog: boolean;
  /** Calibration factor (actual/estimated) from dyno log */
  calibrationFactor: number;
  /** Confidence level based on data quality */
  confidence: 'high' | 'medium' | 'low';
  /** 3-bar MAP sensor detected: baro < 70 kPa OR baro voltage < 1.8V */
  has3BarMapSensor: boolean;
  /** When true, MAP readings are not accurate — awaiting correction formula */
  mapReadingsInaccurate: boolean;
  /** Warnings */
  warnings: string[];
}

// ─── Metadata Detection ──────────────────────────────────────────────────────

/**
 * Detect injector type from filename, part number, and channel names.
 *
 * Priority order:
 *   1. Explicit injector model in filename (ID1050, ID1300) — always wins
 *   2. Explicit FIC 800cc mention
 *   3. Turbo kit default injector (JR → jr_kit ~345cc, KW → kw800 800cc)
 *   4. Stock (~310cc)
 *
 * This means a file like "KW_ID1050_Run_1.wp8" uses ID1050 (not KW 800cc),
 * and "JR_ID1300_Run_1.wp8" uses ID1300 (not JR kit injector).
 */
export function detectInjectorType(
  fileName: string,
  partNumber: string,
): InjectorType {
  const combined = `${fileName} ${partNumber}`.toLowerCase();

  // Priority 1: Explicit aftermarket injector model always wins
  if (combined.includes('id1300') || combined.includes('1300x') || combined.includes('1300cc')) {
    return 'id1300';
  }
  if (combined.includes('id1050') || combined.includes('1050x') || combined.includes('1050cc')) {
    return 'id1050';
  }

  // Priority 2: Explicit FIC 800cc mention
  if (combined.includes('fic800') || combined.includes('800cc') || combined.includes('fic 800')) {
    return 'kw800';
  }

  // Priority 3: Turbo kit default injectors (only when no explicit model above)
  // KW turbo kit ships with FIC 800cc injectors
  if (combined.includes('kraftwerks') || /(^|[^a-z])kw([^a-z]|$)/.test(combined)) {
    return 'kw800';
  }
  // JR turbo kit ships with its own ~345cc injectors (~15% more than stock)
  // Believed to be the same injector from Honda 700cc single-cylinder engines
  if (combined.includes('jackson') || combined.includes('jacksonracing')
      || /(^|[^a-z])jr([^a-z]|$)/.test(combined)) {
    return 'jr_kit';
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
 * Detect turbo kit type from filename.
 *
 * Returns 'na' if no turbo kit pattern is found in the filename.
 * The caller should also check MAP data — if MAP > 100 kPa and this
 * returns 'na', the caller should upgrade to 'generic_turbo'.
 *
 * Filename patterns:
 *   JR, Jackson Racing, JacksonRacing → 'jr'
 *   FP, FPTurbo, Full Performance    → 'fp'
 *   KW, Kraftwerks                    → 'kw'
 */
export function detectTurboType(
  fileName: string,
  partNumber: string,
): TurboType {
  const combined = `${fileName} ${partNumber}`.toLowerCase();

  // FP turbo — check before JR because some filenames may have both
  // Use [^a-z] boundaries instead of \b because \b treats _ as a word char
  if (combined.includes('fpturbo') || combined.includes('fp turbo') || combined.includes('fp_turbo')
      || /(^|[^a-z])fp([^a-z]|$)/.test(combined) || combined.includes('full performance')) {
    return 'fp';
  }

  // Jackson Racing
  if (combined.includes('jacksonracing') || combined.includes('jackson racing') || combined.includes('jackson_racing')
      || /(^|[^a-z])jr([^a-z]|$)/.test(combined)) {
    return 'jr';
  }

  // Kraftwerks
  if (combined.includes('kraftwerks') || combined.includes('kraft werks')
      || /(^|[^a-z])kw([^a-z]|$)/.test(combined)) {
    return 'kw';
  }

  return 'na';
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
  turboType: TurboType,
  _mapKpa: number,  // reserved for future RPM-dependent BSFC
  fuelType: FuelType = 'pump',
): number {
  if (fuelFlowGPerSec <= 0 || bsfc <= 0) return 0;

  const turboFactor = getTurboBsfcFactor(turboType, fuelType);
  const effectiveBsfc = turboType !== 'na' ? bsfc * turboFactor : bsfc;
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

  // Power Commander detection: when a PC piggyback is installed, it multiplies
  // the ECU's injector pulsewidth based on manifold pressure. The ECU's
  // 'Injector Pulsewidth Final' is the un-multiplied command (~5 ms), while
  // 'Primary Injector Pulsewidth 1' is the actual injector on-time after the
  // PC multiplier (~10 ms). We MUST use Primary PW for fuel flow calculation.
  const hasPowerCommander = keys.primaryInjPw1 >= 0;
  const primaryInjPWIdx = keys.primaryInjPw1;

  if (!hasRPM) warnings.push('Missing Engine Speed channel — cannot estimate power');
  if (!hasInjPW && !hasPowerCommander) warnings.push('Missing Injector Pulsewidth channel — using TPS-based estimation');
  if (hasPowerCommander) {
    warnings.push('Power Commander detected — using Primary Injector Pulsewidth 1 for fuel flow calculation');
  }

  // ─── 3-bar MAP sensor detection ──────────────────────────────────────────
  // If barometric pressure < 70 kPa OR baro sensor voltage < 1.8V,
  // a 3-bar MAP sensor is installed and MAP readings are NOT accurate.
  // The 3-bar sensor rescales the MAP voltage range, so the ECU's
  // MAP interpretation (calibrated for the stock 1-bar sensor) is wrong.
  let has3BarMapSensor = false;
  const baroIdx = keys.baroPressure;
  const baroVoltageIdx = keys.baroSensorVoltage;
  if (baroIdx >= 0 || baroVoltageIdx >= 0) {
    // Sample first 50 rows to check baro readings
    for (let i = 0; i < Math.min(50, wp8.rows.length); i++) {
      const row = wp8.rows[i];
      if (baroIdx >= 0) {
        const baro = row.values[baroIdx];
        // Baro in kPa: if < 70, it's a 3-bar sensor reading
        // (real atmospheric pressure is always > 85 kPa even at high altitude)
        if (baro > 0 && baro < 70) { has3BarMapSensor = true; break; }
      }
      if (baroVoltageIdx >= 0) {
        const baroV = row.values[baroVoltageIdx];
        // Baro voltage < 1.8V indicates 3-bar sensor
        if (baroV > 0 && baroV < 1.8) { has3BarMapSensor = true; break; }
      }
    }
  }
  // Also detect from filename: "3bar" or "3 bar" in filename
  if (fileName.toLowerCase().includes('3bar') || fileName.toLowerCase().includes('3 bar')) {
    has3BarMapSensor = true;
  }
  if (has3BarMapSensor) {
    warnings.push('3-bar MAP sensor detected — MAP readings may not be accurate (awaiting correction formula)');
  }

  // Select channel indices
  const rpmIdx = keys.engineSpeed;
  // Use Primary Inj PW 1 when Power Commander is present, otherwise use Inj PW Final/Desired
  const injPWIdx = hasPowerCommander
    ? primaryInjPWIdx
    : (keys.injPwFinal >= 0 ? keys.injPwFinal : keys.injPwDesired);
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
    // Use turboType if set, otherwise fall back to legacy isTurbo boolean
    const effectiveTurboType: TurboType = config.turboType ?? (config.isTurbo ? 'generic_turbo' : 'na');
    let estHP = estimateHPWithBoost(fuelFlowGPerSec, fuel.bsfc, effectiveTurboType, map, config.fuelType);

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

  const detectedTurboType = detectTurboType(fileName, wp8.partNumber);

  return {
    dataPoints,
    hpCurve,
    peakHP: Math.round(peakHP * 10) / 10,
    peakHPRpm,
    peakTorque: Math.round(peakTorque * 10) / 10,
    peakTorqueRpm,
    detectedInjector,
    detectedFuel,
    detectedTurboType,
    isDynoLog: hasDyno,
    calibrationFactor: Math.round(calibrationFactor * 1000) / 1000,
    confidence,
    has3BarMapSensor,
    mapReadingsInaccurate: has3BarMapSensor, // Until correction formula is provided
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
