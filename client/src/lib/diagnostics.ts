/**
 * V-OP diagnostic rules engine for vehicle performance analysis
 * Checks for common issues and provides recommendations
 *
 * False-positive prevention strategy:
 * - Rail pressure: exclude rapid throttle transients (>2%/sample), low RPM (<800),
 *   deceleration, and require longer sustained duration
 * - Boost pressure: exclude rapid throttle transients, turbo spool-up lag,
 *   deceleration, and require longer sustained duration
 * - TCC slip: only flag when converter is truly locked AND slip is NOT converging
 *   (decreasing over time). ControlledHyst = intentional controlled slip, not a fault.
 *   ControlledOn with converging slip = normal torque multiplication during acceleration.
 */

import { shouldApplyDieselAnalyzerRules } from './combustionInference';

export interface DiagnosticIssue {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  detectedAt?: string;
}

export interface DiagnosticReport {
  issues: DiagnosticIssue[];
  summary: string;
  timestamp: Date;
}

interface RawDataPoint {
  railPressureActual?: number;
  railPressureDesired?: number;
  pcvDutyCycle?: number;
  boostActual?: number;
  boostDesired?: number;
  turboVanePosition?: number;
  exhaustGasTemp?: number;
  maf?: number;
  rpm?: number;
  converterSlip?: number;
  converterDutyCycle?: number;
  converterPressure?: number;
  timestamp?: number;
}

// ── Shared transient-detection helpers ─────────────────────────────────────

/**
 * Build a boolean mask marking samples during rapid throttle changes.
 * A sample is "transient" if throttle changed by more than `rateThreshold`
 * per sample over the last `lookback` samples.
 */
function buildThrottleTransientMask(
  throttle: number[],
  lookback = 5,
  rateThreshold = 2.0 // % per sample
): boolean[] {
  if (!throttle.length) return [];
  return throttle.map((_, i) => {
    if (i < lookback) return true; // beginning of log = uncertain, treat as transient
    const delta = Math.abs(throttle[i] - throttle[i - lookback]);
    return (delta / lookback) > rateThreshold;
  });
}

/**
 * Build a decel mask: true when RPM is actively falling or below idle threshold.
 */
function buildDecelMask(
  rpmArr: number[],
  idleRpm = 900,
  lookback10 = 10,
  drop10Threshold = 150,
  lookback5 = 5,
  drop5Threshold = 50
): boolean[] {
  return rpmArr.map((rpm, i) => {
    if (rpm < idleRpm) return true;
    const drop10 = i >= lookback10 ? rpmArr[i - lookback10] - rpm : 0;
    const drop5 = i >= lookback5 ? rpmArr[i - lookback5] - rpm : 0;
    return drop10 > drop10Threshold || drop5 > drop5Threshold;
  });
}

/**
 * Analyze datalog for diagnostic issues
 */
/**
 * Determine the vehicle's fuel type from VehicleMeta.
 * Returns 'diesel', 'gasoline', 'hybrid', or 'unknown'.
 */
function getVehicleFuelType(meta?: import('./dataProcessor').VehicleMeta): string {
  if (!meta) return 'unknown';
  if (meta.fuelType && meta.fuelType !== 'any') return meta.fuelType;
  const fam = meta.combustionInference?.family;
  if (fam === 'diesel') return 'diesel';
  if (fam === 'spark') return 'gasoline';
  // BMW XM, Ford Raptor gas, etc. — do not assume GM = diesel (Silverado gas, etc.).
  if (meta.engineType) {
    const et = meta.engineType.toLowerCase();
    if (et.includes('diesel') || et.includes('duramax')) return 'diesel';
    if (et.includes('hybrid') || et.includes('phev')) return 'hybrid';
    if (et.includes('gas') || et.includes('petrol') || et.includes('v8') || et.includes('v6') || et.includes('turbo')) return 'gasoline';
  }
  return 'unknown';
}

export function analyzeDiagnostics(data: any): DiagnosticReport {
  const issues: DiagnosticIssue[] = [];

  // ── Vehicle-aware filtering ────────────────────────────────────────────
  const vehicleMeta: import('./dataProcessor').VehicleMeta | undefined = data.vehicleMeta;
  const vehicleFuel = getVehicleFuelType(vehicleMeta);
  const dieselDiagnosticsEnabled = shouldApplyDieselAnalyzerRules(vehicleMeta);

  if (vehicleMeta) {
    console.log('[Diagnostics] Vehicle-aware mode:', {
      vin: vehicleMeta.vin,
      make: vehicleMeta.make,
      model: vehicleMeta.model,
      fuelType: vehicleFuel,
      manufacturer: vehicleMeta.manufacturer,
      combustionFamily: vehicleMeta.combustionInference?.family,
      dieselDiagnosticsEnabled,
    });
  }

  const railPressureActual = data.railPressureActual || [];
  const railPressureDesired = data.railPressureDesired || [];
  const pcvDutyCycle = data.pcvDutyCycle || [];
  const boostActual = data.boost || [];
  const boostDesired = data.boostDesired || [];
  const turboVanePosition = data.turboVanePosition || [];
  const turboVaneDesired = data.turboVaneDesired || [];
  const exhaustGasTemp = data.exhaustGasTemp || [];
  const maf = data.maf || [];
  const rpm = data.rpm || [];
  const converterSlip = data.converterSlip || [];
  const converterDutyCycle = data.converterDutyCycle || [];
  const converterPressure = data.converterPressure || [];
  const coolantTemp = data.coolantTemp || [];
  const timeMinutes = data.timeMinutes || [];
  const currentGear = data.currentGear || [];
  const throttlePosition = data.throttlePosition || [];
  const exhaustPressure = data.exhaustPressure || [];
  const vehicleSpeed = data.vehicleSpeed || [];

  // Debug logging — helps trace false positives
  if (railPressureActual.length > 0) {
    const maxActual = Math.max(...railPressureActual);
    const maxDesired = Math.max(...railPressureDesired);
    const maxDelta = Math.max(...railPressureActual.map((a: number, i: number) => a - (railPressureDesired[i] || 0)));
    console.log('[Diagnostics] Rail Pressure:', {
      samples: railPressureActual.length,
      maxActual: maxActual.toFixed(0),
      maxDesired: maxDesired.toFixed(0),
      maxDeltaHigh: maxDelta.toFixed(0),
      format: data.fileFormat,
    });
  }
  if (boostActual.length > 0) {
    const maxBoost = Math.max(...boostActual);
    const maxBoostDesired = Math.max(...boostDesired);
    console.log('[Diagnostics] Boost Pressure:', {
      samples: boostActual.length,
      maxActual: maxBoost.toFixed(1),
      maxDesired: maxBoostDesired.toFixed(1),
      unit: 'PSIG (gauge)',
    });
  }

  // Pre-compute shared masks
  const decelMask = buildDecelMask(rpm);
  const throttleTransientMask = buildThrottleTransientMask(throttlePosition);

  // Check for Low Rail Pressure (P0087) — diesel only
  if (dieselDiagnosticsEnabled && railPressureActual.length > 0) {
    const lowRailIssues = checkLowRailPressure(
      railPressureActual,
      railPressureDesired,
      pcvDutyCycle,
      rpm,
      decelMask,
      throttleTransientMask,
      throttlePosition
    );
    issues.push(...lowRailIssues);
  }

  // Check for High Rail Pressure (P0088) — diesel only
  if (dieselDiagnosticsEnabled && railPressureActual.length > 0) {
    const highRailIssues = checkHighRailPressure(
      railPressureActual,
      railPressureDesired,
      pcvDutyCycle,
      rpm,
      decelMask,
      throttleTransientMask
    );
    issues.push(...highRailIssues);
  }

  // Check for Low Boost Pressure (P0299) — diesel only (VGT turbo-specific thresholds)
  const boostActualAvailable = data.boostActualAvailable !== false;
  if (dieselDiagnosticsEnabled && boostActual.length > 0 && boostActualAvailable) {
    const lowBoostIssues = checkLowBoostPressure(
      boostActual,
      boostDesired,
      turboVanePosition,
      maf,
      rpm,
      decelMask,
      throttleTransientMask
    );
    issues.push(...lowBoostIssues);
  } else if (dieselDiagnosticsEnabled && boostDesired.length > 0 && !boostActualAvailable && boostDesired.some((v: number) => v > 0)) {
    issues.push({
      code: 'INFO-MAP-NOT-LOGGED',
      severity: 'info',
      title: 'Actual Boost Not Available — Manifold Absolute Pressure Not Logged',
      description: `Desired boost data is present (peak: ${Math.max(...boostDesired).toFixed(1)} psi) but the Manifold Absolute Pressure (MAP) sensor was not included in the datalog. Actual vs. desired boost comparison cannot be performed.`,
      recommendation: 'Add Manifold Absolute Pressure (MAP) to your datalog configuration to enable boost efficiency analysis and underboost detection.',
    });
  }

  // Check for Rail Pressure Surge (rapid actual overshoot vs desired) — diesel only
  if (dieselDiagnosticsEnabled && railPressureActual.length > 0) {
    issues.push(...checkRailPressureSurge(railPressureActual, railPressureDesired, rpm, decelMask, throttleTransientMask));
  }

  // Check Exhaust Gas Temperature (unified: sensor faults + high-temp, deduplicated)
  // Diesel EGT thresholds (1475°F sustained) are NOT applicable to gasoline engines.
  // Gasoline EGT is typically 1400-1600°F under load — normal for gas, critical for diesel.
  // GUARD: Only run EGT checks if the channel has actual observed data (non-zero values).
  // An all-zero array means the EGT channel was not logged or not populated.
  const egtHasRealData = exhaustGasTemp.length > 0 && exhaustGasTemp.some((v: number) => v > 0);
  if (dieselDiagnosticsEnabled && egtHasRealData) {
    issues.push(...checkAllEgtIssues(exhaustGasTemp));
  }

  // Check Mass Airflow (P0101) — diesel-specific MAF/RPM ratios
  if (dieselDiagnosticsEnabled && maf.length > 0 && rpm.length > 0) {
    const mafIssues = checkMassAirflow(maf, rpm);
    issues.push(...mafIssues);
  }

  // Check Torque Converter Slip
  if (converterSlip.length > 0) {
    const converterIssues = checkConverterSlip(
      converterSlip,
      converterDutyCycle,
      converterPressure,
      rpm,
      currentGear
    );
    issues.push(...converterIssues);
  }

  // P0046 - VGT Vane Tracking — diesel VGT only
  // Also require non-zero data — LB7 and other non-VGT platforms may have
  // zero-filled arrays when no VGT PID exists
  const vgtHasRealData = turboVanePosition.length > 0 && turboVaneDesired.length > 0
    && turboVanePosition.some((v: number) => v > 0) && turboVaneDesired.some((v: number) => v > 0);
  if (dieselDiagnosticsEnabled && vgtHasRealData) {
    issues.push(...checkVgtTracking(turboVanePosition, turboVaneDesired, rpm));
  }

  // P0089 - Fuel Pressure Regulator Performance —
  if (dieselDiagnosticsEnabled && railPressureActual.length > 0) {
    issues.push(...checkFuelPressureRegulatorPerformance(railPressureActual, railPressureDesired, rpm));
  }

  // P0116/P0128 - Coolant Temperature
  if (coolantTemp.length > 0) {
    issues.push(...checkCoolantTemp(coolantTemp, timeMinutes));
  }

  // P0741/P0742 - TCC Operation
  if (converterSlip.length > 0) {
    issues.push(...checkTccOperation(converterSlip, converterDutyCycle, rpm, converterPressure, currentGear));
  }

  // P1089 - Rail Pressure High on Decel — diesel only
  if (dieselDiagnosticsEnabled && railPressureActual.length > 0) {
    issues.push(...checkHighRailOnDecel(railPressureActual, railPressureDesired, rpm));
  }

  // TURBO SURGE / TURBO BRAKING — diesel VGT only
  if (dieselDiagnosticsEnabled && vgtHasRealData && boostActual.length > 0) {
    issues.push(...checkTurboSurge(boostActual, boostDesired, turboVanePosition, turboVaneDesired, throttlePosition, rpm));
  }

  // EXHAUST BACKPRESSURE vs BOOST ANALYSIS — diesel turbo only
  const exhHasData = exhaustPressure.length > 0 && exhaustPressure.some((v: number) => v > 0);
  if (dieselDiagnosticsEnabled && exhHasData && boostActual.length > 0) {
    issues.push(...checkBackpressureVsBoost(exhaustPressure, boostActual, throttlePosition, rpm, vehicleSpeed));
  }

  // ── Global deduplication: one entry per fault code, keep the most severe ──
  const seenCodes = new Set<string>();
  const dedupedIssues = issues.filter(issue => {
    const key = issue.code ?? issue.title;
    if (seenCodes.has(key)) return false;
    seenCodes.add(key);
    return true;
  });

  const summary =
    dedupedIssues.length === 0
      ? 'No diagnostic issues detected. Engine parameters are within normal ranges.'
      : `Found ${dedupedIssues.length} diagnostic issue(s). Review recommendations below.`;

  return {
    issues: dedupedIssues,
    summary,
    timestamp: new Date(),
  };
}

/**
 * Check for Low Rail Pressure (P0087)
 *
 * False-positive prevention:
 * - Exclude deceleration events (RPM dropping, idle/coast)
 * - Exclude rapid throttle transients (pump can't build pressure instantly during tip-in)
 * - Exclude low throttle (<30%) per user requirement
 * - Exclude low RPM (<1000) where pump output is physically limited
 * - Require 10+ seconds sustained deviation (was 6.5s)
 * - Threshold raised to 5000 psi (was 3900)
 */
function checkLowRailPressure(
  actual: number[],
  desired: number[],
  pcv: number[],
  rpmArr: number[],
  decelMask: boolean[],
  throttleTransientMask: boolean[],
  throttlePosition: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const ABS_THRESHOLD = 5500;   // psi absolute offset (raised from 5000 — +10%)
  const PCT_THRESHOLD = 0.22;   // 22% relative deviation required (raised from 20% — +10%)
  const minDuration = 15;       // seconds sustained (raised from 10)
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;
  const MIN_RPM = 1000;         // pump can't make pressure below this
  const MIN_THROTTLE = 30;      // per user requirement: don't flag below 30%
  const RAMP_LOOKBACK = 30;     // 3 seconds lookback for pressure ramp detection
  const RAMP_RISE_THRESHOLD = 1000; // psi rise = pump is responding

  // ── Pump saturation detection ──────────────────────────────────────────
  // On tuned trucks, desired rail pressure is set above the high-pressure pump's
  // physical capacity. The pump maxes out while desired stays higher.
  // This is normal for high-HP tunes — NOT a fuel system fault.
  const validActual = actual.filter((v, i) => v > 5000 && rpmArr[i] > MIN_RPM && !decelMask[i]);
  const peakActualRail = validActual.length > 0 ? Math.max(...validActual) : 0;
  // Saturation zone: within 15% of peak actual rail pressure
  const saturationFloor = peakActualRail * 0.85;

  let consecutiveViolations = 0;
  for (let i = 0; i < actual.length; i++) {
    const offset = desired[i] - actual[i];
    const pctOffset = desired[i] > 0 ? offset / desired[i] : 0;

    // Pump ramp-up detection: if pressure is rising, pump is responding
    let isRamping = false;
    if (i >= RAMP_LOOKBACK) {
      const pressRise = actual[i] - actual[i - RAMP_LOOKBACK];
      if (pressRise > RAMP_RISE_THRESHOLD) isRamping = true;
    }

    // Pump saturation: actual is near its physical peak
    const isSaturated = peakActualRail > 20000 && actual[i] >= saturationFloor && actual[i] > 15000;

    const isExcluded =
      decelMask[i] ||
      throttleTransientMask[i] ||
      rpmArr[i] < MIN_RPM ||
      (throttlePosition.length > i && throttlePosition[i] < MIN_THROTTLE) ||
      isRamping ||
      isSaturated;

    // Must exceed BOTH absolute AND percentage thresholds
    if (offset > ABS_THRESHOLD && pctOffset > PCT_THRESHOLD && !isExcluded) {
      consecutiveViolations++;
      if (consecutiveViolations >= minSamples) {
        const pcvValue = pcv[i] || 0;
        if (pcvValue < 325) {
          issues.push({
            code: 'LOW-RAIL-PRESSURE-MAXED',
            severity: 'critical',
            title: 'Low Rail Pressure - System Maxed Out',
            description: `Rail pressure is ${offset.toFixed(0)} psi (${(pctOffset * 100).toFixed(0)}%) lower than desired for more than ${minDuration} seconds at steady-state (transients, decel, pump ramp-up, and low-throttle excluded). PCV current is ${pcvValue.toFixed(0)} mA. Pump peak in this log: ${peakActualRail.toFixed(0)} psi.`,
            recommendation:
              'The fuel rail system is at maximum capacity. Check for fuel pump issues, fuel filter restrictions, or fuel line blockages. Consider upgrading the fuel system.',
          });
        } else {
          issues.push({
            code: 'LOW-RAIL-PRESSURE-TUNING',
            severity: 'warning',
            title: 'Low Rail Pressure - Possible Tuning Issue',
            description: `Rail pressure is ${offset.toFixed(0)} psi (${(pctOffset * 100).toFixed(0)}%) lower than desired for more than ${minDuration} seconds at steady-state (transients, decel, pump ramp-up, and low-throttle excluded). PCV current is ${pcvValue.toFixed(0)} mA. Pump peak: ${peakActualRail.toFixed(0)} psi.`,
            recommendation:
              'A tuning adjustment may resolve this issue. Contact your tuner to review fuel pressure calibration and PCV settings.',
          });
        }
        consecutiveViolations = 0;
      }
    } else {
      consecutiveViolations = 0;
    }
  }

  // ── Scattered low-rail detection ──────────────────────────────────────
  // The health report counts ALL qualifying samples across the entire log.
  // If total scattered violations exceed threshold, flag it even without
  // 15 consecutive seconds — ensures fault zone chart always renders when
  // the health report identifies a rail pressure issue.
  if (issues.length === 0) {
    let totalViolations = 0;
    for (let i = 0; i < actual.length; i++) {
      const offset = desired[i] - actual[i];
      const pctOffset = desired[i] > 0 ? offset / desired[i] : 0;
      const isSaturated = peakActualRail > 20000 && actual[i] >= saturationFloor && actual[i] > 15000;
      // Apply same exclusions as the consecutive path: RPM, throttle, decel, transients
      const isExcludedScattered =
        decelMask[i] ||
        throttleTransientMask[i] ||
        rpmArr[i] < MIN_RPM ||
        (throttlePosition.length > i && throttlePosition[i] < MIN_THROTTLE) ||
        isSaturated;
      if (offset > ABS_THRESHOLD && pctOffset > PCT_THRESHOLD && !isExcludedScattered && actual[i] > 0 && desired[i] > 0) {
        totalViolations++;
      }
    }
    if (totalViolations >= 150) {
      const avgPcv = pcv.filter(v => v > 0).length > 0
        ? pcv.filter(v => v > 0).reduce((a, b) => a + b, 0) / pcv.filter(v => v > 0).length
        : 0;
      if (avgPcv < 325 && avgPcv > 0) {
        issues.push({
          code: 'LOW-RAIL-PRESSURE-MAXED',
          severity: 'warning',
          title: 'Low Rail Pressure - Scattered Deviation',
          description: `${totalViolations} samples exceed ${ABS_THRESHOLD} psi / ${(PCT_THRESHOLD * 100).toFixed(0)}% deviation threshold (scattered, not consecutive). PCV avg current: ${avgPcv.toFixed(0)} mA. Pump peak: ${peakActualRail.toFixed(0)} psi.`,
          recommendation:
            'Fuel rail pressure shows intermittent low-pressure events. Check fuel pump, lift pump, and filter condition.',
        });
      } else {
        issues.push({
          code: 'LOW-RAIL-PRESSURE-TUNING',
          severity: 'info',
          title: 'Low Rail Pressure - Scattered Deviation (Tuning)',
          description: `${totalViolations} samples exceed ${ABS_THRESHOLD} psi / ${(PCT_THRESHOLD * 100).toFixed(0)}% deviation threshold (scattered). PCV avg current: ${avgPcv.toFixed(0)} mA. Pump peak: ${peakActualRail.toFixed(0)} psi. This may be normal for high-HP tunes.`,
          recommendation:
            'Contact your tuner to review fuel pressure calibration if concerned.',
        });
      }
    }
  }

  // Check for relief valve issue (sustained 12k-15k when desired >25k)
  if (desired.length > 0) {
    const avgDesired = desired.reduce((a: number, b: number) => a + b) / desired.length;
    if (avgDesired > 25000) {
      let lowPressureCount = 0;
      let consecutiveLowCount = 0;
      const minConsecutive = 50; // 5 seconds at 10Hz
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] >= 12000 && actual[i] <= 15000 && !decelMask[i]) {
          consecutiveLowCount++;
          if (consecutiveLowCount >= minConsecutive) {
            lowPressureCount++;
          }
        } else {
          consecutiveLowCount = 0;
        }
      }

      if (lowPressureCount > 0) {
        issues.push({
          code: 'LOW-RAIL-PRESSURE-RELIEF-VALVE',
          severity: 'warning',
          title: 'Low Rail Pressure - Possible Relief Valve Issue',
          description: `Desired rail pressure exceeds 25kpsi, but actual pressure stays between 12k-15kpsi for extended periods.`,
          recommendation:
            'The pressure relief valve on the fuel rail may be stuck or faulty. Inspect and test the relief valve. Contact PPEI for additional diagnostics if issue persists.',
        });
      }
    }
  }

  return issues;
}

/**
 * Check for High Rail Pressure (P0088)
 *
 * False-positive prevention:
 * - Exclude deceleration (pump overshoot during engine braking is normal)
 * - Exclude rapid throttle transients
 * - Require 8+ seconds sustained (was 5s)
 * - Threshold raised to 2500 psi (was 1950)
 */
function checkHighRailPressure(
  actual: number[],
  desired: number[],
  pcv: number[],
  rpmArr: number[],
  decelMask: boolean[],
  throttleTransientMask: boolean[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const threshold = 3500;       // psi offset (raised from 2500 — 2500 triggers on normal decel pressure lag)
  const minDuration = 12;       // seconds (raised from 8 — need sustained deviation, not transient)
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;
  const MIN_RPM = 1000;         // exclude low RPM where pressure control is less precise

  // Build a "desired-dropping" mask: when desired pressure is falling or has
  // recently fallen, the high-pressure pump physically cannot depressurize the rail fast
  // enough — this is normal behavior during commanded decel, NOT a regulator fault.
  // Strategy: check multiple lookback windows to catch both fast and gradual drops.
  // Also mark samples where desired is still settling after a drop.
  const desiredDroppingMask = desired.map((d, i) => {
    // Short-term drop: 200+ psi over 5 samples (fast transient)
    if (i >= 5 && desired[i - 5] - d > 200) return true;
    // Medium-term drop: 500+ psi over 20 samples (moderate decel)
    if (i >= 20 && desired[i - 20] - d > 500) return true;
    // Long-term drop: 1000+ psi over 50 samples (gradual decel / coast-down)
    if (i >= 50 && desired[i - 50] - d > 1000) return true;
    // Recent peak check: if desired was 2000+ psi higher at any point in last 80 samples,
    // the rail is still bleeding off pressure — not a fault
    if (i >= 10) {
      const lookback = Math.min(i, 80);
      let recentMax = 0;
      for (let j = i - lookback; j < i; j++) {
        if (desired[j] > recentMax) recentMax = desired[j];
      }
      if (recentMax - d > 2000) return true;
    }
    return false;
  });

  let consecutiveViolations = 0;

  for (let i = 0; i < actual.length; i++) {
    const offset = actual[i] - desired[i];
    const isExcluded = decelMask[i] || throttleTransientMask[i] || desiredDroppingMask[i];
    const rpmOk = rpmArr[i] >= MIN_RPM;

    if (offset > threshold && !isExcluded && rpmOk) {
      consecutiveViolations++;

      if (consecutiveViolations >= minSamples) {
        issues.push({
          code: 'HIGH-RAIL-PRESSURE',
          severity: 'warning',
          title: 'High Rail Pressure Detected',
          description: `Actual rail pressure is ${offset.toFixed(0)} psi higher than desired for more than ${minDuration} seconds at steady-state (transients, deceleration, and commanded pressure drops excluded).`,
          recommendation:
            'Check PCV (Pressure Control Valve) current settings. This is generally a regulator adjustment by the tuner. Contact your tuner to review fuel pressure calibration.',
        });

        consecutiveViolations = 0;
      }
    } else {
      consecutiveViolations = 0;
    }
  }

  // Check for rapid oscillations — only flag when ACTUAL pressure swings wildly
  // relative to DESIRED while desired itself is stable
  if (actual.length > 100) {
    let oscillationCount = 0;
    for (let i = 1; i < actual.length; i++) {
      if (decelMask[i] || throttleTransientMask[i]) continue;
      const desiredChange = Math.abs(desired[i] - desired[i - 1]);
      const actualDeviation = actual[i] - desired[i];
      const prevActualDeviation = actual[i - 1] - desired[i - 1];
      if (desiredChange < 1000 && Math.abs(actualDeviation - prevActualDeviation) > 3500) {
        oscillationCount++;
      }
    }

    // Count only non-excluded samples for percentage
    const steadySamples = actual.filter((_, i) => !decelMask[i] && !throttleTransientMask[i]).length;
    const oscillationPercentage = steadySamples > 0 ? (oscillationCount / steadySamples) * 100 : 0;
    if (oscillationPercentage > 20) {
      issues.push({
        code: 'RAIL-PRESSURE-OSCILLATION',
        severity: 'warning',
        title: 'Rail Pressure Oscillation',
        description: `Rail pressure is jumping rapidly (over/undershooting by 3500+ psi while desired is stable) ${oscillationPercentage.toFixed(1)}% of steady-state time.`,
        recommendation:
          'This is generally a regulator adjustment issue. Contact your tuner to fine-tune the fuel pressure regulator response.',
      });
    }
  }

  // Check idle condition — only when FPR/PCV current (mA) is logged
  const hasPcvData = pcv.some((v: number) => v > 0);
  if (desired.length > 0 && hasPcvData) {
    const idleIndices = desired
      .map((d: number, i: number) => (d < 5000 ? i : -1))
      .filter((i: number) => i !== -1);
    if (idleIndices.length > 50) {
      const idleActual = idleIndices.map((i: number) => actual[i]);
      const avgIdleActual = idleActual.reduce((a: number, b: number) => a + b) / idleActual.length;
      if (avgIdleActual >= 12000 && avgIdleActual <= 14000) {
        const avgIdlePcv = idleIndices.map((i: number) => pcv[i] || 0).reduce((a: number, b: number) => a + b) / idleIndices.length;
        if (avgIdlePcv < 1040) {
          issues.push({
            code: 'HIGH-IDLE-RAIL-PRESSURE',
            severity: 'info',
            title: 'High Idle Rail Pressure - FPR Current Adjustment Needed',
            description: `At idle, desired pressure is under 5kpsi but actual is ${avgIdleActual.toFixed(0)}psi. FPR/inlet metering current is ${avgIdlePcv.toFixed(0)} mA (below 1600 mA). Rule of thumb: ~400 mA ≈ high regulator opening (more flow toward rail), ~1800 mA ≈ low opening — not a PWM duty %.`,
            recommendation:
              'An adjustment in tuning can resolve this. Contact your tuner to adjust FPR commanded current at idle for better pressure control.',
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check for Low Boost Pressure (P0299)
 *
 * False-positive prevention:
 * - Exclude rapid throttle transients (turbo spool-up lag is normal)
 * - Exclude deceleration
 * - Exclude low RPM (<1500) where turbo hasn't spooled
 * - Require 10+ seconds sustained (was 6.5s)
 * - Threshold raised to 8 psi (was 6.5)
 */
function checkLowBoostPressure(
  actual: number[],
  desired: number[],
  turboVane: number[],
  maf: number[],
  rpm: number[],
  decelMask: boolean[],
  throttleTransientMask: boolean[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const ABS_THRESHOLD = 15;     // psi absolute offset (raised from 10 — loosened to reduce false positives)
  const PCT_THRESHOLD = 0.40;   // 40% relative deviation required (raised from 30% — loosened per user feedback)
  const minDuration = 20;       // seconds sustained (raised from 15 — more time for turbo to respond)
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;
  const MIN_RPM = 1500;         // turbo needs RPM to spool
  const SPOOL_LOOKBACK = 30;    // 3 seconds lookback for spool detection
  const SPOOL_RISE_THRESHOLD = 3; // psi rise = turbo is spooling

  // ── Turbo saturation detection ──────────────────────────────────────────
  // On tuned trucks, desired boost is intentionally set above the turbo's
  // physical limit to extract maximum performance. The turbo plateaus at its
  // max output while desired stays higher — this is NOT a fault.
  // Strategy: find the peak actual boost in the log. If actual consistently
  // reaches near that peak while desired is higher, the turbo is saturated.
  const validActual = actual.filter((v, i) => v > 5 && rpm[i] > MIN_RPM && !decelMask[i]);
  const peakActualBoost = validActual.length > 0 ? Math.max(...validActual) : 0;
  // Saturation zone: within 15% of peak actual boost
  const saturationFloor = peakActualBoost * 0.85;

  let consecutiveViolations = 0;

  for (let i = 0; i < actual.length; i++) {
    const offset = desired[i] - actual[i];
    const pctOffset = desired[i] > 0 ? offset / desired[i] : 0;

    // Turbo spool-up detection: if boost is rising, turbo is responding
    let isSpooling = false;
    if (i >= SPOOL_LOOKBACK) {
      const boostRise = actual[i] - actual[i - SPOOL_LOOKBACK];
      if (boostRise > SPOOL_RISE_THRESHOLD) isSpooling = true;
    }

    // Turbo saturation: actual is near its physical peak
    const isSaturated = peakActualBoost > 20 && actual[i] >= saturationFloor && actual[i] > 15;

    const isExcluded =
      decelMask[i] ||
      throttleTransientMask[i] ||
      rpm[i] < MIN_RPM ||
      isSpooling ||
      isSaturated;

    // Must exceed BOTH absolute AND percentage thresholds
    if (offset > ABS_THRESHOLD && pctOffset > PCT_THRESHOLD && !isExcluded) {
      consecutiveViolations++;

      if (consecutiveViolations >= minSamples && issues.length === 0) {
        const vanePos = turboVane[i] || 0;
        const mafFlow = maf[i] || 0;
        const currentRpm = rpm[i] || 0;

        // VGT position semantics:
        // Higher % = more CLOSED (vanes restricting exhaust flow = more boost)
        // Lower % = more OPEN (vanes allowing exhaust to bypass = less boost)
        // So vanePos > 58.5% means VGT is CLOSED trying to build boost.
        // If VGT is closed AND boost is low, the boost is leaking somewhere.
        // If VGT is OPEN (< 40%) and boost is low, that's expected behavior
        // (ECM is commanding less boost, not a fault).
        if (mafFlow > 71.5 && actual[i] < 20 && vanePos > 58.5) {
          issues.push({
            code: 'LOW-BOOST-LEAK',
            severity: 'critical',
            title: 'Low Boost Pressure - Likely Boost Leak',
            description: `Boost is ${offset.toFixed(1)} psi (${(pctOffset * 100).toFixed(0)}%) lower than desired for ${minDuration}+ seconds at steady-state (transients excluded). VGT is commanding ${vanePos.toFixed(1)}% closed to build boost, but actual boost is only ${actual[i].toFixed(1)} psi with ${mafFlow.toFixed(1)} lb/min airflow. Turbo peak in this log: ${peakActualBoost.toFixed(1)} psi.`,
            recommendation:
              'A boost leak is very likely. Perform a boost leakdown test and inspect intake system for leaks, cracks, or loose connections. Check intercooler, piping, and clamps.',
          });
        } else if (vanePos > 58.5 && currentRpm > 3640) {
          issues.push({
            code: 'LOW-BOOST-TURBO',
            severity: 'warning',
            title: 'Low Boost Pressure - Turbo Issue',
            description: `Boost is ${offset.toFixed(1)} psi (${(pctOffset * 100).toFixed(0)}%) lower than desired for ${minDuration}+ seconds at ${currentRpm.toFixed(0)} RPM (transients excluded). VGT is commanding ${vanePos.toFixed(1)}% closed but boost is not responding. Turbo peak: ${peakActualBoost.toFixed(1)} psi.`,
            recommendation:
              'Perform a boost leakdown test and check the intake system for leaks. Inspect turbo for damage or excessive play.',
          });
        } else if (vanePos < 40 && actual[i] < 15) {
          // VGT is OPEN (low %) = less boost is expected.
          // Opening VGT = less exhaust restriction = less boost = potentially HIGHER EGTs
          // because exhaust energy is not being used to drive the turbine.
          // This is normal operation when ECM doesn't need boost, skip fault.
          // No issue to report -- this is commanded behavior.
          consecutiveViolations = 0;
          continue;
        } else {
          issues.push({
            code: 'LOW-BOOST-GENERAL',
            severity: 'info',
            title: 'Low Boost Pressure Detected',
            description: `Boost is ${offset.toFixed(1)} psi (${(pctOffset * 100).toFixed(0)}%) lower than desired for ${minDuration}+ seconds at steady-state (transients, low-RPM, and turbo spool-up excluded). Turbo peak: ${peakActualBoost.toFixed(1)} psi.`,
            recommendation:
              'Check boost system components including turbo, intercooler, and intake piping. Verify wastegate operation.',
          });
        }

        consecutiveViolations = 0;
      }
    } else {
      consecutiveViolations = 0;
    }
  }

  return issues;
}

/**
 * Unified EGT diagnostic check.
 * Merges sensor-fault detection (stuck, erratic, out-of-range) with high-temp detection.
 */
function checkAllEgtIssues(egt: number[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!egt.length) return issues;

  const HIGH_THRESHOLD = 1475;     // Sustained street/towing limit — flag if EGTs stay above this
  const RACING_THRESHOLD = 1800;   // Racing conditions — brief spikes OK, sustained = problem
  const CRITICAL_THRESHOLD = 2100;  // Raised from 1900 -- aftermarket sensors can read higher
  const MIN_DURATION_SEC = 14;     // User requirement: flag if sustained more than 14 seconds
  const RACING_DURATION_SEC = 12;  // Racing: 1800-2000°F for <12s is acceptable, >12s = problem
  const SAMPLE_RATE = 10;
  const MIN_SAMPLES = MIN_DURATION_SEC * SAMPLE_RATE;
  const RACING_SAMPLES = RACING_DURATION_SEC * SAMPLE_RATE;

  let sensorFaulty = false;

  const maxEgt = Math.max(...egt);
  if (maxEgt > CRITICAL_THRESHOLD) {
    issues.push({
      code: 'EGT-SENSOR-OUT-OF-RANGE',
      severity: 'critical',
      title: 'Exhaust Gas Temperature Sensor Fault',
      description: `EGT reading reached ${maxEgt.toFixed(0)}F, which exceeds the physically plausible limit of ${CRITICAL_THRESHOLD}F. The sensor is likely disconnected or out of range.`,
      recommendation: 'Check EGT sensor connections and wiring. Replace sensor if faulty.',
    });
    sensorFaulty = true;
  }

  // Stuck sensor detection with context awareness:
  // EGT sensors have high thermal mass and respond slowly. During short runs
  // (drag strips, quick pulls), EGT may legitimately stay flat at low values.
  // Only flag as stuck if: (1) stuck for 150+ samples (raised from 65), AND
  // (2) the stuck value is above 400F (below 400F = engine hasn't warmed EGT yet,
  //     sensor is just reading ambient/low exhaust temp -- not a fault).
  let maxStuck = 0;
  let currentStuck = 0;
  let stuckValue = 0;
  for (let i = 1; i < egt.length; i++) {
    if (Math.abs(egt[i] - egt[i - 1]) < 1) {
      currentStuck++;
      if (currentStuck > maxStuck) {
        maxStuck = currentStuck;
        stuckValue = egt[i];
      }
    } else {
      currentStuck = 0;
    }
  }
  // Only flag stuck if the sensor is stuck at a meaningful temperature (>400F)
  // AND for a very long time (150+ samples = 15+ seconds at 10Hz).
  // Short runs with slowly-changing EGT are normal, not a sensor fault.
  if (maxStuck > 150 && stuckValue > 400) {
    // Special case: 1832°F (999.9°C) is the open-circuit default reading.
    // When someone removes emissions equipment and tunes the sensor out to
    // avoid a DTC, the ECM reports ~1832°F as if the circuit is open.
    // This is NOT a real temperature — it's a disconnected/tuned-out sensor.
    const isOpenCircuit = Math.abs(stuckValue - 1832) < 5; // within 5°F of 1832
    if (isOpenCircuit) {
      issues.push({
        code: 'EGT-SENSOR-OPEN-CIRCUIT',
        severity: 'info',
        title: 'EGT Sensor Disconnected — Open Circuit (1832°F)',
        description: `EGT sensor is flatlined at ${stuckValue.toFixed(0)}°F for the entire log (${(maxStuck / SAMPLE_RATE).toFixed(0)}s). 1832°F (999.9°C) is the open-circuit default value — this indicates the EGT sensor is disconnected or the circuit has been tuned out. This is common on vehicles with emissions equipment removed and a tune that disables the EGT DTC.`,
        recommendation: 'This is not a real temperature reading. The EGT sensor is disconnected or open circuit. If the vehicle has had emissions equipment removed, this is expected behavior with the current tune. EGT-based diagnostics will be skipped for this log.',
      });
      sensorFaulty = true;
    } else {
      issues.push({
        code: 'EGT-SENSOR-STUCK',
        severity: 'warning',
        title: 'EGT Sensor Stuck/Frozen',
        description: `EGT sensor reading was frozen at ${stuckValue.toFixed(0)}°F (< 1°F change) for ${maxStuck} consecutive samples (${(maxStuck / SAMPLE_RATE).toFixed(0)}s). A stuck sensor cannot protect the DPF from overtemperature events.`,
        recommendation: 'Replace the EGT sensor. Inspect sensor wiring and connector for damage or corrosion.',
      });
      sensorFaulty = true;
    }
  }

  let erraticCount = 0;
  for (let i = 1; i < egt.length; i++) {
    if (Math.abs(egt[i] - egt[i - 1]) > 260) erraticCount++;
  }
  if (erraticCount > 4) {
    issues.push({
      code: 'EGT-SENSOR-ERRATIC',
      severity: 'warning',
      title: 'EGT Sensor Erratic',
      description: `EGT sensor shows ${erraticCount} rapid jumps of >260F between samples. This indicates a failing sensor or wiring fault.`,
      recommendation: 'Inspect EGT sensor connector and wiring for heat damage. Replace EGT sensor if erratic readings persist.',
    });
    sensorFaulty = true;
  }

  if (!sensorFaulty) {
    // ── Racing EGT check (1800-2000°F sustained >12s) ──
    let consecutiveRacing = 0;
    let racingReported = false;
    for (let i = 0; i < egt.length; i++) {
      if (egt[i] > RACING_THRESHOLD) {
        consecutiveRacing++;
        if (consecutiveRacing >= RACING_SAMPLES && !racingReported) {
          issues.push({
            code: 'EGT-RACING-SUSTAINED',
            severity: 'warning',
            title: 'Sustained Racing-Level EGT',
            description: `EGT exceeded ${RACING_THRESHOLD}°F for more than ${RACING_DURATION_SEC} seconds (peak: ${maxEgt.toFixed(0)}°F). Brief spikes to 1800-2000°F are normal during racing pulls, but sustained temps at this level indicate insufficient airflow or excessive fueling.`,
            recommendation: 'Reduce pull duration or increase airflow (larger turbo, better intercooler). Consider water-methanol injection for sustained high-load use. These temps are acceptable for short drag passes (<12 seconds) but not for extended pulls.',
          });
          racingReported = true;
        }
      } else {
        consecutiveRacing = 0;
      }
    }

    // ── Street/towing EGT check (>1475°F sustained >14s) ──
    let consecutiveHighTemp = 0;
    let egtHighReported = false;
    for (let i = 0; i < egt.length; i++) {
      if (egt[i] > HIGH_THRESHOLD) {
        consecutiveHighTemp++;
        if (consecutiveHighTemp >= MIN_SAMPLES && !egtHighReported) {
          issues.push({
            code: 'EGT-HIGH',
            severity: 'warning',
            title: 'High Exhaust Gas Temperature',
            description: `EGT exceeded ${HIGH_THRESHOLD}°F for more than ${MIN_DURATION_SEC} seconds (peak: ${maxEgt.toFixed(0)}°F). Sustained temps above 1475°F accelerate component wear.`,
            recommendation: 'Monitor EGTs during towing or sustained pulls. If EGTs are consistently above 1475°F, discuss fueling and boost targets with your tuner. Ensure intercooler is not heat-soaked.',
          });
          egtHighReported = true;
        }
      } else {
        consecutiveHighTemp = 0;
      }
    }
  }

  return issues;
}

/**
 * Check Mass Airflow (P0101)
 */
function checkMassAirflow(maf: number[], rpm: number[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  const idleIndices = rpm
    .map((r, i) => (r < 1000 ? i : -1))
    .filter((i) => i !== -1);

  if (idleIndices.length > 50) {
    const idleMaf = idleIndices.map((i) => maf[i]);
    const avgIdleMaf = idleMaf.reduce((a, b) => a + b) / idleMaf.length;
    const maxIdleMaf = Math.max(...idleMaf);
    const minIdleMaf = Math.min(...idleMaf);

    let highMafCount = 0;
    for (let i = 0; i < idleIndices.length; i++) {
      if (idleMaf[i] > 7.8) highMafCount++;
    }

    if (highMafCount > 65) {
      issues.push({
        code: 'HIGH-IDLE-MAF',
        severity: 'warning',
        title: 'High MAF at Idle',
        description: `MAF flow exceeds 6 lb/min at idle for extended periods (peak: ${maxIdleMaf.toFixed(1)} lb/min, average: ${avgIdleMaf.toFixed(1)} lb/min).`,
        recommendation:
          'Check MAF sensor for contamination or damage. Contact tuner to verify MAF calibration. May indicate air leak or sensor fault.',
      });
    }

    let lowMafCount = 0;
    for (let i = 0; i < idleIndices.length; i++) {
      if (idleMaf[i] < 1.54) lowMafCount++;
    }

    if (lowMafCount > 65) {
      issues.push({
        code: 'LOW-IDLE-MAF',
        severity: 'warning',
        title: 'Low MAF at Idle',
        description: `MAF flow drops below 2 lb/min at idle for extended periods (minimum: ${minIdleMaf.toFixed(1)} lb/min).`,
        recommendation:
          'If an aftermarket intake is installed or the OEM baffle has been removed, the MAF sensor may be under-reading due to the larger pre-MAF tube diameter — this is expected physics, not a sensor fault. The fix is a MAF scaling tune revision to recalibrate the transfer function for the new tube geometry. If the intake is stock, check MAF sensor for contamination or blockage and contact tuner to verify MAF calibration.',
      });
    }
  }

  return issues;
}

/**
 * Check Torque Converter Slip
 *
 * Major false-positive prevention changes:
 * 1. Only consider "fully locked" when duty >= threshold AND TCC is NOT in
 *    ControlledHyst mode (which is intentional controlled slip)
 * 2. Detect converging slip patterns (slip decreasing over time = normal
 *    torque multiplication during acceleration, not a fault)
 * 3. Wider gear-shift exclusion window (±15 samples, was ±8)
 * 4. Wider TCC state transition grace period (±20 samples, was ±10)
 * 5. Higher slip noise floor (±25 RPM, was ±15) to account for real-world noise
 * 6. Require 15+ consecutive samples (was 5) for confirmed slip event
 * 7. Higher event count thresholds (12 critical / 6 warning, was 8/4)
 */
function checkConverterSlip(
  slip: number[],
  dutyCycle: number[],
  pressure: number[],
  rpm: number[],
  currentGear: number[] = []
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (slip.length === 0) return issues;

  // ── Determine which signal to use for "full lock" detection ──
  const maxDuty = dutyCycle.length > 0 ? Math.max(...dutyCycle.filter(v => v > 0)) : 0;
  const maxPressure = pressure.length > 0 ? Math.max(...pressure.filter(v => v > 0)) : 0;
  const dutyHasData = maxDuty > 5;
  const isEFILiveKpa = maxDuty > 200;
  const usePressureAsLock = !dutyHasData && maxPressure > 10;

  const FULL_LOCK_THRESHOLD = isEFILiveKpa ? 1000 : (usePressureAsLock ? 80 : 90);
  const lockSignal = (i: number) => {
    if (isEFILiveKpa || dutyHasData) return dutyCycle[i] ?? 0;
    if (usePressureAsLock) return pressure[i] ?? 0;
    return 0;
  };

  // ── For HP Tuners synthetic duty: 100 = ControlledOn, 75 = ControlledHyst ──
  // ControlledHyst is intentional controlled slip — NOT a fault condition.
  // Only flag slip when duty is truly at 100% (ControlledOn) or EFILive ≥1000 kPa.
  // For HP Tuners format, the threshold of 90 will correctly exclude ControlledHyst (75).
  // For EFILive kPa format, the threshold of 1000 already works correctly.

  // ── Build gear-shift exclusion mask (wider window) ──
  const SHIFT_EXCLUSION_WINDOW = 15; // raised from 8
  const isShifting = new Uint8Array(slip.length);
  if (currentGear.length >= slip.length) {
    for (let i = 1; i < currentGear.length; i++) {
      if (currentGear[i] !== currentGear[i - 1] && currentGear[i] > 0 && currentGear[i - 1] > 0) {
        const start = Math.max(0, i - SHIFT_EXCLUSION_WINDOW);
        const end = Math.min(slip.length - 1, i + SHIFT_EXCLUSION_WINDOW);
        for (let j = start; j <= end; j++) isShifting[j] = 1;
      }
    }
  }

  // ── Build lock-transition grace period mask (wider window) ──
  const LOCK_GRACE_WINDOW = 20; // raised from 10
  const isTransitioning = new Uint8Array(slip.length);
  let prevLocked = lockSignal(0) >= FULL_LOCK_THRESHOLD;
  for (let i = 1; i < slip.length; i++) {
    const nowLocked = lockSignal(i) >= FULL_LOCK_THRESHOLD;
    if (nowLocked !== prevLocked) {
      const start = Math.max(0, i - LOCK_GRACE_WINDOW);
      const end = Math.min(slip.length - 1, i + LOCK_GRACE_WINDOW);
      for (let j = start; j <= end; j++) isTransitioning[j] = 1;
    }
    prevLocked = nowLocked;
  }

  // ── SETTLE-THEN-RISE slip detection ──
  // Only flag slip as a fault when the converter has ALREADY SETTLED
  // (slip was <20 RPM for 10+ consecutive samples, indicating full lockup)
  // and then rises back above the noise floor. During the initial apply sequence
  // (ControlledOn with high slip converging to zero), high slip is NORMAL
  // and should never be flagged.
  const SLIP_NOISE_FLOOR = 40;
  const MIN_CONSECUTIVE = 15; // Lowered from 25 for better sensitivity
  const SETTLE_THRESHOLD = 20; // RPM — below this = fully locked
  const SETTLE_SAMPLES = 10;   // Must stay below threshold for this many samples
  const CUMULATIVE_THRESHOLD = 40; // Total samples of elevated slip (catches intermittent)

  let slipEventCount = 0;
  let maxSlipObserved = 0;
  let consecutiveSlip = 0;
  let slipWhileLockedCount = 0;
  let totalLockedSamples = 0;
  let hasSettled = false;
  let settledCount = 0;
  // TCC apply lag tracking — only counts lag when slip is NOT converging
  // Converging slip = normal apply sequence; stalled/rising slip = real lag
  let tccApplyStart = -1;
  let maxApplyLag = 0;
  let applyLagEvents = 0;
  const LAG_THRESHOLD = 125; // ~5s at 25Hz — generous to avoid false positives
  let stalledLagSamples = 0; // Samples where slip is stalled/rising during apply
  const STALLED_LAG_THRESHOLD = 50; // ~2s of stalled slip = real lag

  for (let i = 0; i < slip.length; i++) {
    const isFullyLocked = lockSignal(i) >= FULL_LOCK_THRESHOLD;
    const absSlip = Math.abs(slip[i]);

    if (!isFullyLocked) {
      // TCC not commanded on — reset all tracking
      consecutiveSlip = 0;
      hasSettled = false;
      settledCount = 0;
      tccApplyStart = -1;
      continue;
    }

    // Skip samples during gear shifts or lock transitions
    if (isShifting[i] || isTransitioning[i]) {
      consecutiveSlip = 0;
      continue;
    }

    // Track TCC apply lag — only count stalled/rising slip as real lag
    if (tccApplyStart === -1 && !hasSettled) {
      tccApplyStart = i;
      stalledLagSamples = 0;
    } else if (!hasSettled && tccApplyStart >= 0 && absSlip > SETTLE_THRESHOLD) {
      // Check if slip is stalled or rising (not converging)
      // Look back ~10 samples: if slip hasn't decreased significantly, it's stalled
      const lookback = Math.min(10, i - tccApplyStart);
      if (lookback > 0) {
        const prevSlip = Math.abs(slip[i - lookback]);
        if (absSlip >= prevSlip - 10) {
          // Slip hasn't decreased by more than 10 RPM over lookback — stalled
          stalledLagSamples++;
        }
      }
    }

    // Track settle state: has the converter reached full lockup?
    if (absSlip < SETTLE_THRESHOLD) {
      settledCount++;
      if (settledCount >= SETTLE_SAMPLES) {
        if (!hasSettled && tccApplyStart >= 0) {
          const totalLag = i - tccApplyStart;
          if (totalLag > maxApplyLag) maxApplyLag = totalLag;
          // Only count as a lag event if there were significant stalled samples
          // (not just a normal converging apply that took a while)
          if (totalLag > LAG_THRESHOLD && stalledLagSamples > STALLED_LAG_THRESHOLD) {
            applyLagEvents++;
          }
        }
        hasSettled = true;
      }
    } else if (!hasSettled) {
      // High slip but converter hasn't settled yet — this is the apply sequence
      settledCount = 0;
      consecutiveSlip = 0;
      continue; // Skip — normal apply behavior
    }

    // Only count samples AFTER the converter has settled
    if (hasSettled) {
      totalLockedSamples++;

      if (absSlip > SLIP_NOISE_FLOOR) {
        consecutiveSlip++;
        slipWhileLockedCount++;
        maxSlipObserved = Math.max(maxSlipObserved, absSlip);
        if (consecutiveSlip >= MIN_CONSECUTIVE) {
          slipEventCount++;
        }
      } else {
        consecutiveSlip = 0;
      }
    }
  }

  if (totalLockedSamples === 0) return issues;

  const slipRate = (slipWhileLockedCount / totalLockedSamples) * 100;

  // Critical: frequent sustained slip events under full lock command
  // Thresholds: 20+ confirmed events OR >35% slip rate OR cumulative >40 samples
  if (slipEventCount >= 20 || slipRate > 35 || slipWhileLockedCount >= CUMULATIVE_THRESHOLD * 2) {
    const lockDesc = isEFILiveKpa
      ? `TCC PCS commanded pressure at full lock (≥1050 kPa)`
      : `TCC commanded at ≥90% duty cycle (full lock)`;
    issues.push({
      code: 'CONVERTER-SLIP',
      severity: 'critical',
      title: 'Torque Converter Slip Under Full Lock Command',
      description:
        `${lockDesc}, yet the converter shows sustained slip events exceeding ${SLIP_NOISE_FLOOR} RPM ` +
        `(${slipEventCount} confirmed events after filtering shift/transition/convergence noise, ` +
        `peak slip: ${maxSlipObserved.toFixed(0)} RPM, ` +
        `${slipRate.toFixed(1)}% of steady-state locked samples). ` +
        `Gear-shift, lock-transition, and converging-slip samples were excluded from analysis. ` +
        `This is a confirmed TCC clutch slip — the converter is not holding under load.`,
      recommendation:
        'The torque converter clutch is slipping under full lock command. This indicates internal ' +
        'converter wear, a faulty TCC solenoid, or degraded transmission fluid. Have the converter ' +
        'and TCC solenoid inspected. Consider a transmission fluid service. Contact your transmission specialist.',
    });
  } else if (slipEventCount >= 10 || slipRate > 20 || slipWhileLockedCount >= CUMULATIVE_THRESHOLD) {
    // Warning: occasional sustained slip events or cumulative threshold met
    const lockDesc = isEFILiveKpa ? `TCC PCS at full lock (≥1050 kPa)` : `TCC at ≥90% duty`;
    issues.push({
      code: 'CONVERTER-SLIP-WARN',
      severity: 'warning',
      title: 'Intermittent TCC Slip Under Lock Command',
      description:
        `${lockDesc}, the converter shows intermittent slip above ${SLIP_NOISE_FLOOR} RPM ` +
        `(${slipEventCount} events after filtering, peak: ${maxSlipObserved.toFixed(0)} RPM, ` +
        `${slipRate.toFixed(1)}% of steady-state locked samples). ` +
        `Gear-shift, lock-transition, and converging-slip samples were excluded. ` +
        `May indicate early converter wear or a marginal TCC apply circuit.`,
      recommendation:
        'Monitor converter slip closely. Check transmission fluid level and condition. ' +
        'If slip events increase under load, have the TCC solenoid and converter inspected.',
    });
  }

  // ── TCC Apply Lag Detection ──
  // Excessive time from TCC commanded to lockup achieved indicates worn clutch plates,
  // low apply pressure, or degraded fluid.
  if (applyLagEvents >= 3) {
    const maxLagSec = (maxApplyLag / 25).toFixed(1);
    issues.push({
      code: 'TCC-APPLY-LAG',
      severity: 'critical',
      title: 'Excessive TCC Apply Lag (Slow Lockup)',
      description:
        `TCC was commanded to lock but took excessively long to achieve lockup ` +
        `(${applyLagEvents} events exceeding ${(LAG_THRESHOLD / 25).toFixed(1)}s, ` +
        `max lag: ${maxLagSec}s). Normal TCC apply is <2 seconds. ` +
        `This indicates worn clutch plates, low apply pressure, or degraded transmission fluid.`,
      recommendation:
        'Have the transmission inspected by a specialist. Check transmission fluid level and condition. ' +
        'The TCC solenoid and apply circuit should be tested. Worn converter clutch plates may require converter replacement.',
    });
  } else if (applyLagEvents >= 1 || (maxApplyLag / 25) > 5.0) {
    const maxLagSec = (maxApplyLag / 25).toFixed(1);
    issues.push({
      code: 'TCC-APPLY-LAG-WARN',
      severity: 'warning',
      title: 'TCC Apply Lag Detected',
      description:
        `TCC lockup is slower than normal (max lag: ${maxLagSec}s, ` +
        `${applyLagEvents} slow event(s)). Normal TCC apply is <2 seconds. ` +
        `May indicate early wear or marginal fluid condition.`,
      recommendation:
        'Check transmission fluid level and condition. Monitor for worsening lag on future datalogs. ' +
        'If lag increases, have the TCC solenoid and converter inspected.',
    });
  }

  return issues;
}

// ===== ADDITIONAL GM HD OBD SPEC CHECKS (2024 24OBDG06C HD) =====

/**
 * P0046 - Turbocharger Boost Control Solenoid Circuit Performance
 * Detects when actual vane position does not track commanded vane position.
 */
export function checkVgtTracking(
  vaneActual: number[],
  vaneDesired: number[],
  rpm: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!vaneActual.length || !vaneDesired.length) return issues;

  const desiredHasData = vaneDesired.some(v => v > 1);
  if (!desiredHasData) return issues;

  const actualHasData = vaneActual.some(v => v > 1);
  if (!actualHasData) return issues;

  const minCoverage = vaneActual.length * 0.20;
  const nonZeroActual = vaneActual.filter(v => v > 1).length;
  const nonZeroDesired = vaneDesired.filter(v => v > 1).length;
  if (nonZeroActual < minCoverage || nonZeroDesired < minCoverage) return issues;

  const TRACKING_THRESHOLD = 19.5;
  const MIN_SAMPLES = 39;
  const MIN_RPM = 1200;

  let consecutiveCount = 0;
  let maxDelta = 0;

  for (let i = 1; i < vaneActual.length; i++) {
    const rpmDrop = rpm[i - 1] - rpm[i];
    const isDecel = rpm[i] < MIN_RPM || rpmDrop > 50;
    if (isDecel) { consecutiveCount = 0; continue; }

    const delta = Math.abs(vaneDesired[i] - vaneActual[i]);
    if (delta > TRACKING_THRESHOLD) {
      consecutiveCount++;
      maxDelta = Math.max(maxDelta, delta);
    } else {
      consecutiveCount = 0;
    }

    if (consecutiveCount >= MIN_SAMPLES) {
      issues.push({
      code: 'VGT-TRACKING-ERROR',
      severity: 'warning',
      title: 'VGT Vane Tracking Error',
        description: `Turbo vane position deviated from commanded by up to ${maxDelta.toFixed(1)}% for more than 3 seconds. This indicates a sticking VGT actuator, carbon buildup on vanes, or a faulty boost control solenoid.`,
        recommendation: 'Clean VGT vanes with approved cleaner. Test boost control solenoid. Perform VGT learn procedure. Inspect actuator rod for binding.',
      });
      break;
    }
  }
  return issues;
}

/**
 * P0089 - Fuel Pressure Regulator Performance
 * Detects when rail pressure oscillates excessively around desired (regulator hunting).
 */
export function checkFuelPressureRegulatorPerformance(
  actual: number[],
  desired: number[],
  rpm: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!actual.length) return issues;

  const OSCILLATION_THRESHOLD = 2600;
  const MIN_RPM = 800;
  let oscillationCount = 0;
  let prevDelta = 0;
  let directionChanges = 0;

  for (let i = 1; i < actual.length; i++) {
    if (rpm[i] < MIN_RPM) continue;
    const delta = actual[i] - desired[i];
    const swing = Math.abs(actual[i] - actual[i - 1]);
    if (swing > OSCILLATION_THRESHOLD) {
      oscillationCount++;
    }
    if (i > 1 && Math.sign(delta) !== Math.sign(prevDelta) && Math.abs(delta) > 1300) {
      directionChanges++;
    }
    prevDelta = delta;
  }

  const oscillationRate = (oscillationCount / actual.length) * 100;
  if (oscillationRate > 6.5 || directionChanges > 26) {
    issues.push({
      code: 'FUEL-REGULATOR-HUNTING',
      severity: 'warning',
      title: 'Fuel Pressure Regulator Performance',
      description: `Rail pressure is oscillating excessively (${oscillationRate.toFixed(1)}% of samples show large swings, ${directionChanges} direction reversals). This indicates a hunting or unstable fuel pressure regulator.`,
      recommendation: 'Inspect the fuel pressure regulator (PCV solenoid). Check for air in the fuel system. Verify fuel filter is not partially clogged causing pressure fluctuations.',
    });
  }
  return issues;
}

/**
 * P0116/P0128 - Coolant Temperature Performance
 */
export function checkCoolantTemp(
  coolantTemp: number[],
  timeMinutes: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!coolantTemp.length) return issues;

  const validTemps = coolantTemp.filter(t => t > -39);
  if (validTemps.length === 0) return issues;

  const maxTemp = Math.max(...validTemps);
  const minTemp = Math.min(...validTemps);
  const runTime = timeMinutes.length > 1 ? timeMinutes[timeMinutes.length - 1] - timeMinutes[0] : 0;

  const WARMUP_COMPLETE_THRESHOLD = 160;
  let warmupCompleteIdx = coolantTemp.length;
  for (let i = 0; i < coolantTemp.length; i++) {
    if (coolantTemp[i] > WARMUP_COMPLETE_THRESHOLD) {
      warmupCompleteIdx = i;
      break;
    }
  }
  const engineWarmedUp = warmupCompleteIdx < coolantTemp.length;

  if (runTime > 10 && maxTemp < 185) {
    issues.push({
      code: 'COOLANT-LOW-TEMP',
      severity: 'warning',
      title: 'Coolant Below Thermostat Regulating Temperature',
      description:
        `After ${runTime.toFixed(1)} minutes of operation, coolant temperature only reached ` +
        `${maxTemp.toFixed(0)}°F (started at ${minTemp.toFixed(0)}°F). ` +
        `The thermostat should regulate at 195°F. A stuck-open thermostat causes reduced fuel ` +
        `economy, increased emissions, and potential engine wear.`,
      recommendation:
        'Replace the thermostat. Verify the coolant temperature sensor is accurate. ' +
        'Check for air pockets in the cooling system.',
    });
  }

  if (engineWarmedUp) {
    let erraticCount = 0;
    for (let i = Math.max(1, warmupCompleteIdx); i < coolantTemp.length; i++) {
      const delta = Math.abs(coolantTemp[i] - coolantTemp[i - 1]);
      if (coolantTemp[i - 1] < -38 || coolantTemp[i] < -38) continue;
      if (delta > 20) {
        erraticCount++;
      }
    }
    if (erraticCount > 5) {
      issues.push({
        code: 'COOLANT-SENSOR-ERRATIC',
        severity: 'warning',
        title: 'Coolant Temperature Sensor Erratic',
        description:
          `After warmup, coolant temperature sensor shows ${erraticCount} rapid jumps of >20°F ` +
          `between samples. This indicates a failing sensor, loose connector, or wiring fault.`,
        recommendation:
          'Inspect coolant temperature sensor connector and wiring. Replace coolant temperature sensor if erratic readings persist.',
      });
    }
  }

  return issues;
}

/**
 * P0506/P0507 - Idle RPM Too Low / Too High
 */
export function checkIdleRpm(rpm: number[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!rpm.length) return issues;

  const IDLE_MAX_RPM = 900;
  const IDLE_LOW_THRESHOLD = 540;
  const IDLE_HIGH_THRESHOLD = 1100;
  const MIN_SAMPLES = 65;

  let lowCount = 0;
  let highCount = 0;
  let minIdleRpm = Infinity;
  let maxIdleRpm = 0;

  for (const r of rpm) {
    if (r > 400 && r < IDLE_MAX_RPM) {
      if (r < IDLE_LOW_THRESHOLD) {
        lowCount++;
        minIdleRpm = Math.min(minIdleRpm, r);
      }
    } else if (r >= IDLE_MAX_RPM && r < 1200) {
      if (r > IDLE_HIGH_THRESHOLD) {
        highCount++;
        maxIdleRpm = Math.max(maxIdleRpm, r);
      }
    }
  }

  if (lowCount >= MIN_SAMPLES) {
    issues.push({
      code: 'IDLE-RPM-LOW',
      severity: 'warning',
      title: 'Idle RPM Too Low',
      description: `Engine idle RPM dropped below ${IDLE_LOW_THRESHOLD} RPM for ${lowCount} samples (min observed: ${minIdleRpm === Infinity ? 'N/A' : minIdleRpm} RPM). This can indicate a rough idle, vacuum leak, or idle control system fault.`,
      recommendation: 'Check for vacuum leaks. Inspect idle air control system. Verify no misfires or fuel delivery issues at idle.',
    });
  }

  if (highCount >= MIN_SAMPLES) {
    issues.push({
      code: 'IDLE-RPM-HIGH',
      severity: 'warning',
      title: 'Idle RPM Too High',
      description: `Engine idle RPM exceeded ${IDLE_HIGH_THRESHOLD} RPM for ${highCount} samples (max observed: ${maxIdleRpm} RPM). This can indicate a vacuum leak, stuck throttle, or idle control fault.`,
      recommendation: 'Check for vacuum leaks causing unmetered air. Inspect throttle body for sticking. Check idle control system.',
    });
  }

  return issues;
}

/**
 * P0741/P0742 - TCC Stuck Off / Stuck On
 *
 * False-positive prevention:
 * - Wider gear-shift exclusion (±15 samples)
 * - Wider lock-transition grace (±20 samples)
 * - Converging slip exclusion (same as checkConverterSlip)
 * - Higher sample thresholds (75/100, was 50/75)
 * - P0741 slip threshold raised to 75 RPM (was 50)
 */
export function checkTccOperation(
  slip: number[],
  dutyCycle: number[],
  rpm: number[],
  pressure: number[] = [],
  currentGear: number[] = []
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!slip.length) return issues;

  const slipHasData = slip.some(v => Math.abs(v) > 25); // raised from 15
  if (!slipHasData) return issues;

  const maxDuty = dutyCycle.length > 0 ? Math.max(...dutyCycle.filter(v => v > 0)) : 0;
  const maxPressure = pressure.length > 0 ? Math.max(...pressure.filter(v => v > 0)) : 0;
  const isEFILiveKpa = maxDuty > 200;
  const dutyCycleHasData = dutyCycle.some(v => v > 5);
  const usePressureAsLock = !dutyCycleHasData && maxPressure > 10;

  const FULL_LOCK_THRESHOLD = isEFILiveKpa ? 1000 : (usePressureAsLock ? 80 : 90);
  const OPEN_CONV_THRESHOLD = isEFILiveKpa ? 200 : (usePressureAsLock ? 15 : 15);
  const lockVal = (i: number) => usePressureAsLock ? (pressure[i] ?? 0) : (dutyCycle[i] ?? 0);
  const SLIP_THRESHOLD_LOCKED = 75;  // raised from 50 RPM
  const SLIP_THRESHOLD_OPEN = 10;
  const MIN_RPM = 1500;

  // Build gear-shift exclusion mask (wider)
  const SHIFT_EXCLUSION_WINDOW = 15;
  const isShifting = new Uint8Array(slip.length);
  if (currentGear.length >= slip.length) {
    for (let i = 1; i < currentGear.length; i++) {
      if (currentGear[i] !== currentGear[i - 1] && currentGear[i] > 0 && currentGear[i - 1] > 0) {
        const start = Math.max(0, i - SHIFT_EXCLUSION_WINDOW);
        const end = Math.min(slip.length - 1, i + SHIFT_EXCLUSION_WINDOW);
        for (let j = start; j <= end; j++) isShifting[j] = 1;
      }
    }
  }

  // Build lock-transition grace period mask (wider)
  const LOCK_GRACE_WINDOW = 20;
  const isTransitioning = new Uint8Array(slip.length);
  let prevLockedState = lockVal(0) >= FULL_LOCK_THRESHOLD;
  for (let i = 1; i < slip.length; i++) {
    const nowLocked = lockVal(i) >= FULL_LOCK_THRESHOLD;
    if (nowLocked !== prevLockedState) {
      const start = Math.max(0, i - LOCK_GRACE_WINDOW);
      const end = Math.min(slip.length - 1, i + LOCK_GRACE_WINDOW);
      for (let j = start; j <= end; j++) isTransitioning[j] = 1;
    }
    prevLockedState = nowLocked;
  }

  // Build converging slip mask
  const CONVERGE_WINDOW = 20;
  const isConverging = new Uint8Array(slip.length);
  for (let i = CONVERGE_WINDOW; i < slip.length; i++) {
    const startSlip = Math.abs(slip[i - CONVERGE_WINDOW]);
    const endSlip = Math.abs(slip[i]);
    if (startSlip > 50 && endSlip < startSlip * 0.7) {
      for (let j = i - CONVERGE_WINDOW; j <= i; j++) isConverging[j] = 1;
    }
  }

  let stuckOffCount = 0;
  let stuckOnCount = 0;

  for (let i = 0; i < slip.length; i++) {
    if (rpm[i] < MIN_RPM) continue;
    if (isShifting[i] || isTransitioning[i] || isConverging[i]) continue;

    const absSlip = Math.abs(slip[i]);
    const lv = lockVal(i);

    // P0741: commanded full lock but sustained slip
    if ((dutyCycleHasData || usePressureAsLock) && lv >= FULL_LOCK_THRESHOLD && absSlip > SLIP_THRESHOLD_LOCKED) {
      stuckOffCount++;
    }
    // P0742: commanded open but near-zero slip at cruise
    if ((dutyCycleHasData || usePressureAsLock) && lv < OPEN_CONV_THRESHOLD && absSlip < SLIP_THRESHOLD_OPEN && rpm[i] > 2000) {
      stuckOnCount++;
    }
  }

  const lockLabel = isEFILiveKpa ? `≥${FULL_LOCK_THRESHOLD} kPa (full lock)` : (usePressureAsLock ? `≥${FULL_LOCK_THRESHOLD} psi line pressure` : `>${FULL_LOCK_THRESHOLD}% duty cycle`);
  const openLabel = isEFILiveKpa ? `<${OPEN_CONV_THRESHOLD} kPa (open)` : (usePressureAsLock ? `<${OPEN_CONV_THRESHOLD} psi line pressure` : `<${OPEN_CONV_THRESHOLD}% duty cycle`);

  // Raised thresholds: 75 samples (was 50) for stuck off, 100 (was 75) for stuck on
  if ((dutyCycleHasData || usePressureAsLock) && stuckOffCount > 75) {
    issues.push({
      code: 'TCC-STUCK-OFF',
      severity: 'critical',
      title: 'Torque Converter Clutch Not Engaging',
      description:
        `TCC commanded at ${lockLabel} but showed >${SLIP_THRESHOLD_LOCKED} RPM slip for ` +
        `${stuckOffCount} samples (gear shifts, lock transitions, and converging slip excluded). ` +
        `The converter clutch is not engaging properly.`,
      recommendation:
        'Check transmission fluid level and condition. Test TCC solenoid. Inspect torque converter for internal wear. Consider transmission service.',
    });
  }

  if ((dutyCycleHasData || usePressureAsLock) && stuckOnCount > 100) {
    issues.push({
      code: 'TCC-STUCK-ON',
      severity: 'warning',
      title: 'Torque Converter Clutch Stuck Applied',
      description:
        `TCC commanded ${openLabel} but showed near-zero slip (<${SLIP_THRESHOLD_OPEN} RPM) ` +
        `for ${stuckOnCount} samples at cruise (gear shifts excluded). ` +
        `The converter clutch may be stuck applied.`,
      recommendation:
        'Inspect TCC solenoid and hydraulic circuit. Check transmission fluid for contamination. Have transmission inspected for stuck TCC apply circuit.',
    });
  }

  return issues;
}

/**
 * P1089 - Fuel Rail Pressure High During Deceleration
 */
export function checkHighRailOnDecel(
  actual: number[],
  desired: number[],
  rpm: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!actual.length) return issues;

  const HIGH_DECEL_THRESHOLD = 23000;
  const RPM_DROP_WINDOW = 5;
  const RPM_DROP_RATE = 100;
  let highDecelCount = 0;

  for (let i = RPM_DROP_WINDOW; i < actual.length; i++) {
    const rpmDrop = rpm[i - RPM_DROP_WINDOW] - rpm[i];
    const isDecel = rpmDrop > RPM_DROP_RATE;
    if (isDecel && actual[i] > HIGH_DECEL_THRESHOLD && actual[i] > desired[i] + 3900) {
      highDecelCount++;
    }
  }

  if (highDecelCount > 26) {
    issues.push({
      code: 'HIGH-RAIL-DECEL',
      severity: 'warning',
      title: 'Rail Pressure High During Deceleration',
      description: `Rail pressure remained above ${HIGH_DECEL_THRESHOLD.toLocaleString()} psi during ${highDecelCount} deceleration samples when it should have dropped. This indicates a stuck-open high-pressure pump or faulty pressure relief valve.`,
      recommendation: 'Inspect the high-pressure fuel pump pressure relief valve. Check PCV solenoid operation. Verify fuel return lines are not restricted.',
    });
  }

  return issues;
}

// checkEgtSensorPerformance removed -- its logic is now part of checkAllEgtIssues above.


/**
 * TURBO SURGE / TURBO BRAKING DETECTION
 *
 * Detects turbo surge caused by turbo braking on deceleration.
 * Turbo braking is an intentional ECU feature in tow tunes (especially DSP5 tunes)
 * that closes VGT vanes on decel to create exhaust restriction for engine braking.
 *
 * Diagnostic signature:
 * 1. Throttle at 0% (decel)
 * 2. Desired boost elevated well above atmospheric (>150 kPa) — ECU commanding turbo braking
 * 3. Desired vane position at 99% (fully closed) — vanes trying to achieve desired boost
 * 4. Actual boost stays high (>120 kPa / 17+ psi) despite 0% throttle
 *
 * The desired boost being high on decel is the smoking gun — it proves the ECU is
 * intentionally commanding turbo braking, not a stuck vane or sensor issue.
 */
export function checkTurboSurge(
  boostActual: number[],
  boostDesired: number[],
  vaneActual: number[],
  vaneDesired: number[],
  throttle: number[],
  rpm: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!boostActual.length || !vaneActual.length || !throttle.length) return issues;

  // Need at least some of the arrays to have data
  const hasVaneDesired = vaneDesired.length > 0 && vaneDesired.some(v => v > 0);
  const hasBoostDesired = boostDesired.length > 0 && boostDesired.some(v => v > 0);

  // Atmospheric pressure baseline (approx 100 kPa / 14.5 psi)
  const ATMO_KPA = 100;
  const BOOST_ELEVATED_THRESHOLD = 120; // kPa — boost above this on decel is suspicious
  const DESIRED_BOOST_BRAKING_THRESHOLD = 150; // kPa — desired boost above this on decel = turbo braking
  const VANE_CLOSED_THRESHOLD = 85; // % — vanes above this are nearly fully closed
  const DESIRED_VANE_BRAKING_THRESHOLD = 95; // % — desired vane above this = turbo braking command
  const THROTTLE_DECEL_THRESHOLD = 5; // % — throttle below this = decel
  const MIN_SURGE_SAMPLES = 10; // ~1 second at typical sample rates

  let surgeCount = 0;
  let turboBrakingConfirmed = false;
  let maxBoostOnDecel = 0;
  let maxVaneOnDecel = 0;
  let maxDesiredBoostOnDecel = 0;
  let surgeEvents = 0;

  const len = Math.min(boostActual.length, vaneActual.length, throttle.length, rpm.length);

  for (let i = 0; i < len; i++) {
    const isDecel = throttle[i] < THROTTLE_DECEL_THRESHOLD && rpm[i] > 800;
    const boostElevated = boostActual[i] > BOOST_ELEVATED_THRESHOLD;
    const vanesClosed = vaneActual[i] > VANE_CLOSED_THRESHOLD;

    if (isDecel && boostElevated && vanesClosed) {
      surgeCount++;
      maxBoostOnDecel = Math.max(maxBoostOnDecel, boostActual[i]);
      maxVaneOnDecel = Math.max(maxVaneOnDecel, vaneActual[i]);

      // Check if desired boost is also elevated (confirms turbo braking vs stuck vane)
      if (hasBoostDesired && i < boostDesired.length && boostDesired[i] > DESIRED_BOOST_BRAKING_THRESHOLD) {
        turboBrakingConfirmed = true;
        maxDesiredBoostOnDecel = Math.max(maxDesiredBoostOnDecel, boostDesired[i]);
      }
      // Also check if desired vane is commanding closed
      if (hasVaneDesired && i < vaneDesired.length && vaneDesired[i] > DESIRED_VANE_BRAKING_THRESHOLD) {
        turboBrakingConfirmed = true;
      }

      if (surgeCount >= MIN_SURGE_SAMPLES) {
        surgeEvents++;
        surgeCount = 0; // reset to count next event
      }
    } else {
      surgeCount = 0;
    }
  }

  if (surgeEvents > 0) {
    const boostPsi = ((maxBoostOnDecel - ATMO_KPA) * 0.145038).toFixed(1);
    const desiredBoostPsi = maxDesiredBoostOnDecel > 0
      ? ((maxDesiredBoostOnDecel - ATMO_KPA) * 0.145038).toFixed(1)
      : 'N/A';

    if (turboBrakingConfirmed) {
      issues.push({
        code: 'TURBO-BRAKING-SURGE',
        severity: 'info',
        title: 'Turbo Braking Active — Turbo Surge on Deceleration',
        description: `Detected ${surgeEvents} turbo surge event(s) on deceleration. Boost reached ${boostPsi} psi above atmospheric with vanes at ${maxVaneOnDecel.toFixed(0)}% while throttle was at 0%. Desired boost was ${desiredBoostPsi} psi above atmospheric on decel — this confirms the ECU is intentionally commanding turbo braking. This is a calibration feature, not a hardware fault. Common in tow tunes (DSP5.1/DSP5.2 on EFI Live systems).`,
        recommendation: 'This is normal behavior for tunes with turbo braking enabled. If the surge is undesirable, switch to a non-tow tune (higher DSP5 level) or have the tuner reduce turbo braking aggressiveness by lowering the decel vane position target from 99% to 60-70%.',
      });
    } else {
      // Surge detected but no turbo braking confirmation — could be stuck vanes
      issues.push({
        code: 'TURBO-SURGE-DECEL',
        severity: 'warning',
        title: 'Turbo Surge on Deceleration — Possible Stuck VGT Vanes',
        description: `Detected ${surgeEvents} turbo surge event(s) on deceleration. Boost reached ${boostPsi} psi above atmospheric with vanes at ${maxVaneOnDecel.toFixed(0)}% while throttle was at 0%. Could not confirm turbo braking from desired boost/vane data. This may indicate stuck VGT vanes, carbon buildup, or unison ring failure.`,
        recommendation: 'Inspect VGT vanes for carbon buildup or sticking. Check unison ring for wear. Test VGT actuator movement. If the vehicle has a tow tune, verify turbo braking settings with the tuner.',
      });
    }
  }

  return issues;
}


// ── RAIL PRESSURE SURGE DETECTION ──────────────────────────────────────────
/**
 * Detects rapid fuel rail pressure surges where actual pressure spikes
 * significantly above desired pressure in a short time window.
 *
 * Pattern: actual jumps from ~24-26k to 30k+ while desired holds at ~29k.
 * This is NOT the same as the sustained high-rail check (P0088) — this catches
 * rapid transient spikes that indicate fuel pump overshoot or regulator issues.
 *
 * Detection strategy:
 *   1. Compute rate of change of actual rail pressure (psi/sec)
 *   2. Flag when actual surges >2000 psi above desired in a short window
 *   3. Exclude decel and throttle transients
 */
function checkRailPressureSurge(
  actual: number[],
  desired: number[],
  rpm: number[],
  decelMask: boolean[],
  throttleTransientMask: boolean[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (actual.length < 20) return issues;

  const SAMPLE_RATE = 10; // 10 Hz
  const MIN_RPM = 1200;
  const SURGE_OVERSHOOT = 2000;    // psi above desired = surge
  const RATE_THRESHOLD = 30000;    // psi/sec rate of rise = rapid surge
  const RATE_LOOKBACK = 5;         // 0.5 seconds lookback for rate calc
  const MIN_SURGE_EVENTS = 2;      // need at least 2 surge events to flag
  const MIN_DESIRED_PRESSURE = 10000; // only check when desired is meaningful

  let surgeEvents = 0;
  let maxOvershoot = 0;
  let maxRate = 0;
  let worstActual = 0;
  let worstDesired = 0;
  // Cooldown: don't count multiple samples from the same surge event
  let cooldown = 0;

  for (let i = RATE_LOOKBACK; i < actual.length; i++) {
    if (cooldown > 0) { cooldown--; continue; }
    if (decelMask[i] || throttleTransientMask[i]) continue;
    if (rpm[i] < MIN_RPM) continue;
    if (desired[i] < MIN_DESIRED_PRESSURE) continue;
    if (actual[i] <= 0 || desired[i] <= 0) continue;

    const overshoot = actual[i] - desired[i];
    const rateOfRise = (actual[i] - actual[i - RATE_LOOKBACK]) * (SAMPLE_RATE / RATE_LOOKBACK);

    if (overshoot > SURGE_OVERSHOOT && rateOfRise > RATE_THRESHOLD) {
      surgeEvents++;
      if (overshoot > maxOvershoot) {
        maxOvershoot = overshoot;
        worstActual = actual[i];
        worstDesired = desired[i];
      }
      if (rateOfRise > maxRate) maxRate = rateOfRise;
      cooldown = 20; // 2 seconds cooldown between events
    }
  }

  if (surgeEvents >= MIN_SURGE_EVENTS) {
    issues.push({
      code: 'RAIL-PRESSURE-SURGE',
      severity: 'warning',
      title: 'Fuel Rail Pressure Surge Detected',
      description: `Detected ${surgeEvents} rapid rail pressure surge event(s) where actual pressure spiked ${maxOvershoot.toFixed(0)} psi above desired (actual: ${worstActual.toFixed(0)} psi, desired: ${worstDesired.toFixed(0)} psi). Rate of pressure rise reached ${maxRate.toFixed(0)} psi/sec. This indicates the high-pressure fuel pump is overshooting the target — the pressure regulator is not responding fast enough to control the surge.`,
      recommendation: 'Contact your tuner to review fuel pressure regulator PID gains (proportional/integral response). The pump is building pressure faster than the regulator can bleed it off. This can also indicate a mechanical issue with the pressure control valve (PCV/FPR solenoid) or a fuel system that is over-pressurizing during rapid load changes.',
    });
  } else if (surgeEvents === 1) {
    issues.push({
      code: 'RAIL-PRESSURE-SURGE',
      severity: 'info',
      title: 'Minor Rail Pressure Surge',
      description: `Detected 1 rail pressure surge event where actual spiked ${maxOvershoot.toFixed(0)} psi above desired (actual: ${worstActual.toFixed(0)} psi, desired: ${worstDesired.toFixed(0)} psi). Rate: ${maxRate.toFixed(0)} psi/sec. A single event may be transient, but monitor for recurrence.`,
      recommendation: 'Monitor for recurrence. If surges happen consistently, have the tuner review fuel pressure regulator calibration.',
    });
  }

  return issues;
}


// ── EXHAUST BACKPRESSURE vs BOOST ANALYSIS ─────────────────────────────────
/**
 * Analyzes the relationship between exhaust backpressure and intake boost.
 * 
 * Key metrics:
 *   - Backpressure Ratio (BPR) = Exhaust Pressure / Boost Pressure
 *     Ideal: < 2.0 for performance, < 2.5 for tow, > 3.0 is a problem
 *   - Delta = Exhaust Pressure - Boost Pressure
 *     Shows how much harder the engine works to push exhaust vs pull intake
 *   - Backpressure at idle should be near atmospheric (~14.7 psi absolute)
 *
 * Common causes of high backpressure:
 *   - Clogged DPF (soot load too high)
 *   - Restrictive exhaust (crushed pipe, plugged cat)
 *   - VGT vanes stuck closed
 *   - Aftermarket exhaust restriction (wrong size, kinks)
 *   - Turbo braking active (intentional — tow tunes)
 *
 * The S&B filter baffle case: removing the intake baffle can cause turbulence
 * in the intake tract that disrupts MAF readings and turbo spool behavior,
 * leading to sluggish throttle response despite theoretically more airflow.
 */
function checkBackpressureVsBoost(
  exhaustPressure: number[],
  boostActual: number[],
  throttlePosition: number[],
  rpm: number[],
  vehicleSpeed: number[],
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const len = Math.min(exhaustPressure.length, boostActual.length, rpm.length);
  if (len < 20) return issues;

  // ── Compute per-sample metrics under load ──────────────────────────────
  const loadSamples: { exh: number; boost: number; ratio: number; delta: number; rpm: number; idx: number }[] = [];
  const idleSamples: { exh: number; boost: number }[] = [];

  for (let i = 0; i < len; i++) {
    const exh = exhaustPressure[i];
    const bst = boostActual[i];
    const r = rpm[i] || 0;
    const t = throttlePosition[i] || 0;

    // Skip zero/invalid readings
    if (exh <= 0 && bst <= 0) continue;

    // Idle: RPM < 1000 and throttle < 5%
    if (r < 1000 && t < 5) {
      idleSamples.push({ exh, boost: bst });
      continue;
    }

    // Under load: RPM > 1500 and (throttle > 20% or boost > 3 psi)
    if (r > 1500 && (t > 20 || bst > 3)) {
      const ratio = bst > 0.5 ? exh / bst : 0;
      const delta = exh - bst;
      loadSamples.push({ exh, boost: bst, ratio, delta, rpm: r, idx: i });
    }
  }

  if (loadSamples.length < 5) return issues;

  // ── Peak metrics ──────────────────────────────────────────────────────
  const peakExhaust = Math.max(...loadSamples.map(s => s.exh));
  const peakBoost = Math.max(...loadSamples.map(s => s.boost));
  const avgRatio = loadSamples.reduce((sum, s) => sum + s.ratio, 0) / loadSamples.length;
  const peakRatio = Math.max(...loadSamples.filter(s => s.ratio > 0).map(s => s.ratio));
  const avgDelta = loadSamples.reduce((sum, s) => sum + s.delta, 0) / loadSamples.length;
  const peakDelta = Math.max(...loadSamples.map(s => s.delta));

  // ── High Backpressure Ratio Warning ────────────────────────────────────
  // Sustained BPR > 2.5 indicates exhaust restriction
  const highBprSamples = loadSamples.filter(s => s.ratio > 2.5);
  const highBprPercent = (highBprSamples.length / loadSamples.length) * 100;

  if (highBprPercent > 20 && peakRatio > 3.0) {
    issues.push({
      title: 'High Exhaust Backpressure Ratio',
      code: 'BACKPRESSURE_HIGH_RATIO',
      severity: 'warning',
      description: `Exhaust backpressure ratio (exhaust/boost) averages ${avgRatio.toFixed(1)}:1 under load with peak of ${peakRatio.toFixed(1)}:1. ` +
        `${highBprPercent.toFixed(0)}% of load samples exceed 2.5:1 ratio. ` +
        `Peak exhaust pressure: ${peakExhaust.toFixed(1)} PSI vs peak boost: ${peakBoost.toFixed(1)} PSI (delta: ${peakDelta.toFixed(1)} PSI). ` +
        `High backpressure forces the engine to work harder pushing exhaust out than pulling intake air in, reducing efficiency and power.`,
      recommendation: 'Check DPF soot load and regeneration status. Inspect exhaust system for restrictions (crushed pipes, clogged catalytic converter). ' +
        'If VGT-equipped, verify vane operation — stuck closed vanes cause excessive backpressure. ' +
        'Consider a forced regen if DPF soot load is high. For aftermarket exhaust, verify proper sizing and routing.',
    });
  } else if (highBprPercent > 10 && peakRatio > 2.5) {
    issues.push({
      title: 'Elevated Exhaust Backpressure',
      code: 'BACKPRESSURE_ELEVATED',
      severity: 'info',
      description: `Exhaust backpressure ratio averages ${avgRatio.toFixed(1)}:1 under load (peak ${peakRatio.toFixed(1)}:1). ` +
        `Peak exhaust: ${peakExhaust.toFixed(1)} PSI, peak boost: ${peakBoost.toFixed(1)} PSI, peak delta: ${peakDelta.toFixed(1)} PSI. ` +
        `This is slightly elevated but within acceptable range for most driving conditions.`,
      recommendation: 'Monitor DPF soot load. If backpressure continues to rise over time, schedule a forced regen or exhaust inspection.',
    });
  }

  // ── Backpressure spike detection (sudden restriction) ──────────────────
  // Look for rapid backpressure increases that don't correlate with boost increases
  let spikeCount = 0;
  for (let i = 5; i < loadSamples.length; i++) {
    const prev5Exh = loadSamples.slice(i - 5, i).reduce((s, v) => s + v.exh, 0) / 5;
    const curr = loadSamples[i];
    // Exhaust jumped > 5 psi above recent average while boost stayed flat
    if (curr.exh - prev5Exh > 5 && curr.boost - loadSamples[i - 1].boost < 1) {
      spikeCount++;
    }
  }

  if (spikeCount >= 3) {
    issues.push({
      title: 'Exhaust Backpressure Spikes Detected',
      code: 'BACKPRESSURE_SPIKES',
      severity: 'warning',
      description: `Detected ${spikeCount} sudden exhaust backpressure spikes (>5 PSI above rolling average) that don't correlate with boost changes. ` +
        `This pattern suggests intermittent exhaust restriction — possibly a partially clogged DPF, sticking VGT vanes, or exhaust valve issue.`,
      recommendation: 'Inspect VGT vane actuator for sticking. Check DPF differential pressure sensor. ' +
        'If equipped with exhaust brake, verify it is not engaging unexpectedly.',
    });
  }

  // ── Summary info: always report backpressure stats when data is available ──
  if (issues.length === 0) {
    issues.push({
      title: 'Exhaust Backpressure Normal',
      code: 'BACKPRESSURE_NORMAL',
      severity: 'info',
      description: `Exhaust backpressure ratio averages ${avgRatio.toFixed(1)}:1 under load (peak ${peakRatio.toFixed(1)}:1). ` +
        `Peak exhaust: ${peakExhaust.toFixed(1)} PSI, peak boost: ${peakBoost.toFixed(1)} PSI. ` +
        `Exhaust system appears to be flowing well with no significant restrictions detected.`,
      recommendation: 'No action needed. Continue monitoring during regular maintenance intervals.',
    });
  }

  return issues;
}
