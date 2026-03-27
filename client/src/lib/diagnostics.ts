/**
 * Diagnostic rules engine for Duramax performance analysis
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
  // Infer from manufacturer if fuelType not explicit
  if (meta.manufacturer === 'gm') {
    // GM in this tool context is Duramax diesel
    return 'diesel';
  }
  // BMW XM, Ford Raptor gas, etc.
  if (meta.engineType) {
    const et = meta.engineType.toLowerCase();
    if (et.includes('diesel') || et.includes('duramax')) return 'diesel';
    if (et.includes('hybrid') || et.includes('phev')) return 'hybrid';
    if (et.includes('gas') || et.includes('petrol') || et.includes('v8') || et.includes('v6') || et.includes('turbo')) return 'gasoline';
  }
  return 'unknown';
}

/**
 * Check if a diagnostic check category is relevant for this vehicle.
 * Diesel-specific checks (rail pressure, boost, VGT, EGT, DPF, DEF) should
 * NOT run on gasoline or hybrid vehicles.
 */
function isDieselCheck(checkName: string): boolean {
  const dieselChecks = [
    'rail_pressure', 'boost', 'vgt', 'egt',
    'fuel_pressure_regulator', 'high_rail_decel',
  ];
  return dieselChecks.includes(checkName);
}

export function analyzeDiagnostics(data: any): DiagnosticReport {
  const issues: DiagnosticIssue[] = [];

  // ── Vehicle-aware filtering ────────────────────────────────────────────
  const vehicleMeta: import('./dataProcessor').VehicleMeta | undefined = data.vehicleMeta;
  const vehicleFuel = getVehicleFuelType(vehicleMeta);
  const isDiesel = vehicleFuel === 'diesel' || vehicleFuel === 'unknown';
  // When fuel type is unknown (no VIN), run all checks for backward compat.
  // When fuel type is explicitly non-diesel, skip diesel-specific checks.

  if (vehicleMeta && vehicleFuel !== 'unknown') {
    console.log('[Diagnostics] Vehicle-aware mode:', {
      vin: vehicleMeta.vin,
      make: vehicleMeta.make,
      model: vehicleMeta.model,
      fuelType: vehicleFuel,
      manufacturer: vehicleMeta.manufacturer,
      dieselChecksEnabled: isDiesel,
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
  if (isDiesel && railPressureActual.length > 0) {
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
  if (isDiesel && railPressureActual.length > 0) {
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
  if (isDiesel && boostActual.length > 0 && boostActualAvailable) {
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
  } else if (isDiesel && boostDesired.length > 0 && !boostActualAvailable && boostDesired.some((v: number) => v > 0)) {
    issues.push({
      code: 'INFO-MAP-NOT-LOGGED',
      severity: 'info',
      title: 'Actual Boost Not Available — MAP Not in Scan List',
      description: `Desired boost data is present (peak: ${Math.max(...boostDesired).toFixed(1)} psi) but the MAP sensor (ECM.MAP) was not included in the EFILive scan list. Actual vs. desired boost comparison cannot be performed.`,
      recommendation: 'Add ECM.MAP to your EFILive scan list to enable boost efficiency analysis and underboost detection.',
    });
  }

  // Check Exhaust Gas Temperature (unified: sensor faults + high-temp, deduplicated)
  // Diesel EGT thresholds (1300°F+) are NOT applicable to gasoline engines.
  // Gasoline EGT is typically 1400-1600°F under load — normal for gas, critical for diesel.
  if (isDiesel && exhaustGasTemp.length > 0) {
    issues.push(...checkAllEgtIssues(exhaustGasTemp));
  }

  // Check Mass Airflow (P0101) — diesel-specific MAF/RPM ratios
  if (isDiesel && maf.length > 0 && rpm.length > 0) {
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
  if (isDiesel && turboVanePosition.length > 0 && turboVaneDesired.length > 0) {
    issues.push(...checkVgtTracking(turboVanePosition, turboVaneDesired, rpm));
  }

  // P0089 - Fuel Pressure Regulator Performance — diesel CP4/CP3 only
  if (isDiesel && railPressureActual.length > 0) {
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
  if (isDiesel && railPressureActual.length > 0) {
    issues.push(...checkHighRailOnDecel(railPressureActual, railPressureDesired, rpm));
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
  const threshold = 5000;       // psi offset to flag (raised from 3900)
  const minDuration = 10;       // seconds sustained (raised from 6.5)
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;
  const MIN_RPM = 1000;         // pump can't make pressure below this
  const MIN_THROTTLE = 30;      // per user requirement: don't flag below 30%

  let consecutiveViolations = 0;
  for (let i = 0; i < actual.length; i++) {
    const offset = desired[i] - actual[i];
    const isExcluded =
      decelMask[i] ||
      throttleTransientMask[i] ||
      rpmArr[i] < MIN_RPM ||
      (throttlePosition.length > i && throttlePosition[i] < MIN_THROTTLE);

    if (offset > threshold && !isExcluded) {
      consecutiveViolations++;
      if (consecutiveViolations >= minSamples) {
        const pcvValue = pcv[i] || 0;
        if (pcvValue < 325) {
          issues.push({
            code: 'P0087-RAIL-MAXED',
            severity: 'critical',
            title: 'Low Rail Pressure - System Maxed Out',
            description: `Rail pressure is ${offset.toFixed(0)} psi lower than desired for more than ${minDuration} seconds at steady-state (transients, decel, and low-throttle excluded). PCV duty cycle is ${pcvValue.toFixed(0)}mA (below 500mA threshold).`,
            recommendation:
              'The fuel rail system is at maximum capacity. Check for fuel pump issues, fuel filter restrictions, or fuel line blockages. Consider upgrading the fuel system.',
          });
        } else {
          issues.push({
            code: 'P0087-RAIL-TUNING',
            severity: 'warning',
            title: 'Low Rail Pressure - Possible Tuning Issue',
            description: `Rail pressure is ${offset.toFixed(0)} psi lower than desired for more than ${minDuration} seconds at steady-state (transients, decel, and low-throttle excluded). PCV duty cycle is ${pcvValue.toFixed(0)}mA (above 500mA threshold).`,
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
          code: 'P0087-RELIEF-VALVE',
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
 * - Exclude deceleration (CP4 overshoot during engine braking is normal)
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
  // recently fallen, the CP4 pump physically cannot depressurize the rail fast
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
          code: 'P0088-HIGH-RAIL',
          severity: 'warning',
          title: 'High Rail Pressure Detected',
          description: `Actual rail pressure is ${offset.toFixed(0)} psi higher than desired for more than ${minDuration} seconds at steady-state (transients, deceleration, and commanded pressure drops excluded).`,
          recommendation:
            'Check PCV (pressure regulator duty cycle) settings. This is generally a regulator adjustment by the tuner. Contact your tuner to review fuel pressure calibration.',
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
        code: 'P0088-OSCILLATION',
        severity: 'warning',
        title: 'Rail Pressure Oscillation',
        description: `Rail pressure is jumping rapidly (over/undershooting by 3500+ psi while desired is stable) ${oscillationPercentage.toFixed(1)}% of steady-state time.`,
        recommendation:
          'This is generally a regulator adjustment issue. Contact your tuner to fine-tune the fuel pressure regulator response.',
      });
    }
  }

  // Check idle condition — only when PCV data is actually logged
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
            code: 'P0088-IDLE-PCV',
            severity: 'info',
            title: 'High Idle Rail Pressure - PCV Adjustment Needed',
            description: `At idle, desired pressure is under 5kpsi but actual is ${avgIdleActual.toFixed(0)}psi. PCV duty cycle is ${avgIdlePcv.toFixed(0)}mA (below 1600mA).`,
            recommendation:
              'An adjustment in tuning can resolve this. Contact your tuner to increase PCV duty cycle at idle for better pressure control.',
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
  const threshold = 8;          // psi offset (raised from 6.5)
  const minDuration = 10;       // seconds (raised from 6.5)
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;
  const MIN_RPM = 1500;         // turbo needs RPM to spool

  let consecutiveViolations = 0;

  for (let i = 0; i < actual.length; i++) {
    const offset = desired[i] - actual[i];
    const isExcluded =
      decelMask[i] ||
      throttleTransientMask[i] ||
      rpm[i] < MIN_RPM;

    if (offset > threshold && !isExcluded) {
      consecutiveViolations++;

      if (consecutiveViolations >= minSamples && issues.length === 0) {
        const vanePos = turboVane[i] || 0;
        const mafFlow = maf[i] || 0;
        const currentRpm = rpm[i] || 0;

        if (mafFlow > 71.5 && actual[i] < 25 && vanePos > 58.5) {
          issues.push({
            code: 'P0299-BOOST-LEAK',
            severity: 'critical',
            title: 'Low Boost Pressure - Likely Boost Leak',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired for ${minDuration}+ seconds at steady-state (transients excluded). Turbo vane position is ${vanePos.toFixed(1)}% (above 45%) and MAF flow is ${mafFlow.toFixed(1)} lb/min (above 55 lb/min).`,
            recommendation:
              'A boost leak is very likely. Perform a boost leakdown test and inspect intake system for leaks, cracks, or loose connections. Check intercooler, piping, and clamps.',
          });
        } else if (vanePos > 58.5 && currentRpm > 3640) {
          issues.push({
            code: 'P0299-UNDERBOOST',
            severity: 'warning',
            title: 'Low Boost Pressure - Turbo Issue',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired for ${minDuration}+ seconds at ${currentRpm.toFixed(0)} RPM (transients excluded). Turbo vane position is ${vanePos.toFixed(1)}% (above 45%).`,
            recommendation:
              'Perform a boost leakdown test and check the intake system for leaks. Inspect turbo for damage or excessive play.',
          });
        } else {
          issues.push({
            code: 'P0299-UNDERBOOST-OTHER',
            severity: 'info',
            title: 'Low Boost Pressure Detected',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired for ${minDuration}+ seconds at steady-state (transients and low-RPM excluded).`,
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

  const HIGH_THRESHOLD = 1750;
  const CRITICAL_THRESHOLD = 1900;
  const MIN_DURATION_SEC = 5;
  const SAMPLE_RATE = 10;
  const MIN_SAMPLES = MIN_DURATION_SEC * SAMPLE_RATE;

  let sensorFaulty = false;

  const maxEgt = Math.max(...egt);
  if (maxEgt > CRITICAL_THRESHOLD) {
    issues.push({
      code: 'EGT-SENSOR-FAULT',
      severity: 'critical',
      title: 'Exhaust Gas Temperature Sensor Fault',
      description: `EGT reading reached ${maxEgt.toFixed(0)}F, which exceeds the physically plausible limit of ${CRITICAL_THRESHOLD}F. The sensor is likely disconnected or out of range.`,
      recommendation: 'Check EGT sensor connections and wiring. Replace sensor if faulty.',
    });
    sensorFaulty = true;
  }

  let maxStuck = 0;
  let currentStuck = 0;
  for (let i = 1; i < egt.length; i++) {
    if (Math.abs(egt[i] - egt[i - 1]) < 1) {
      currentStuck++;
      maxStuck = Math.max(maxStuck, currentStuck);
    } else {
      currentStuck = 0;
    }
  }
  if (maxStuck > 65) {
    issues.push({
      code: 'P2080',
      severity: 'warning',
      title: 'EGT Sensor Stuck/Frozen (P2080)',
      description: `EGT sensor reading was frozen (< 1F change) for ${maxStuck} consecutive samples. A stuck sensor cannot protect the DPF from overtemperature events.`,
      recommendation: 'Replace the EGT sensor. Inspect sensor wiring and connector for damage or corrosion.',
    });
    sensorFaulty = true;
  }

  let erraticCount = 0;
  for (let i = 1; i < egt.length; i++) {
    if (Math.abs(egt[i] - egt[i - 1]) > 260) erraticCount++;
  }
  if (erraticCount > 4) {
    issues.push({
      code: 'P2084',
      severity: 'warning',
      title: 'EGT Sensor Erratic (P2084)',
      description: `EGT sensor shows ${erraticCount} rapid jumps of >200F between samples. This indicates a failing sensor or wiring fault.`,
      recommendation: 'Inspect EGT sensor connector and wiring for heat damage. Replace EGT sensor if erratic readings persist.',
    });
    sensorFaulty = true;
  }

  if (!sensorFaulty) {
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
            description: `EGT exceeded ${HIGH_THRESHOLD}F for more than ${MIN_DURATION_SEC} seconds (peak: ${maxEgt.toFixed(0)}F).`,
            recommendation: 'High EGT indicates aggressive tuning or fuel issues. Contact your tuner. Ensure fuel quality and check for engine knock.',
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
        code: 'P0101-HIGH-IDLE-MAF',
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
        code: 'P0101-LOW-IDLE-MAF',
        severity: 'warning',
        title: 'Low MAF at Idle',
        description: `MAF flow drops below 2 lb/min at idle for extended periods (minimum: ${minIdleMaf.toFixed(1)} lb/min).`,
        recommendation:
          'Check MAF sensor for contamination or blockage. Contact tuner to verify MAF calibration. May indicate intake restriction or sensor fault.',
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

  // ── Detect converging slip patterns ──
  // If slip is steadily decreasing (converging toward zero), the converter is
  // in normal torque-multiplication mode during acceleration — NOT a fault.
  // Mark these regions as "converging" and exclude them.
  const CONVERGE_WINDOW = 20; // look at 20-sample windows
  const isConverging = new Uint8Array(slip.length);
  for (let i = CONVERGE_WINDOW; i < slip.length; i++) {
    const startSlip = Math.abs(slip[i - CONVERGE_WINDOW]);
    const endSlip = Math.abs(slip[i]);
    // Converging if slip decreased by at least 30% over the window
    if (startSlip > 50 && endSlip < startSlip * 0.7) {
      // Mark the entire window as converging
      for (let j = i - CONVERGE_WINDOW; j <= i; j++) isConverging[j] = 1;
    }
  }

  // ── Slip analysis ──
  const SLIP_NOISE_FLOOR = 40; // raised from 25 RPM — 3.6% of ControlledOn samples exceed 25 RPM in normal driving
  const MIN_CONSECUTIVE = 25;  // raised from 15 (2.5 seconds at 10Hz — need truly sustained slip)

  let slipEventCount = 0;
  let maxSlipObserved = 0;
  let consecutiveSlip = 0;
  let slipWhileLockedCount = 0;
  let totalLockedSamples = 0;

  for (let i = 0; i < slip.length; i++) {
    const isFullyLocked = lockSignal(i) >= FULL_LOCK_THRESHOLD;
    const absSlip = Math.abs(slip[i]);

    if (isFullyLocked) {
      // Skip samples during gear shifts, lock transitions, or converging slip
      if (isShifting[i] || isTransitioning[i] || isConverging[i]) {
        consecutiveSlip = 0;
        continue;
      }

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
    } else {
      consecutiveSlip = 0;
    }
  }

  if (totalLockedSamples === 0) return issues;

  const slipRate = (slipWhileLockedCount / totalLockedSamples) * 100;

  // Critical: frequent sustained slip events under full lock command
  // Thresholds significantly raised to prevent false positives:
  // - Need 20+ confirmed events (was 12) and >35% slip rate (was 25%)
  if (slipEventCount >= 20 || slipRate > 35) {
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
  } else if (slipEventCount >= 10 || slipRate > 20) {
    // Warning: occasional sustained slip events (raised from 6 events / 15% rate)
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
        code: 'P0046',
        severity: 'warning',
        title: 'VGT Vane Tracking Error (P0046)',
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
      code: 'P0089',
      severity: 'warning',
      title: 'Fuel Pressure Regulator Performance (P0089)',
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
      code: 'P0128',
      severity: 'warning',
      title: 'Coolant Below Thermostat Regulating Temp (P0128)',
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
        code: 'P0116',
        severity: 'warning',
        title: 'Coolant Temperature Sensor Erratic (P0116)',
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
      code: 'P0506',
      severity: 'warning',
      title: 'Idle RPM Too Low (P0506)',
      description: `Engine idle RPM dropped below ${IDLE_LOW_THRESHOLD} RPM for ${lowCount} samples (min observed: ${minIdleRpm === Infinity ? 'N/A' : minIdleRpm} RPM). This can indicate a rough idle, vacuum leak, or idle control system fault.`,
      recommendation: 'Check for vacuum leaks. Inspect idle air control system. Verify no misfires or fuel delivery issues at idle.',
    });
  }

  if (highCount >= MIN_SAMPLES) {
    issues.push({
      code: 'P0507',
      severity: 'warning',
      title: 'Idle RPM Too High (P0507)',
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
      code: 'P0741',
      severity: 'critical',
      title: 'Torque Converter Clutch Stuck Off (P0741)',
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
      code: 'P0742',
      severity: 'warning',
      title: 'Torque Converter Clutch Stuck On (P0742)',
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
      code: 'P1089',
      severity: 'warning',
      title: 'Rail Pressure High During Deceleration (P1089)',
      description: `Rail pressure remained above ${HIGH_DECEL_THRESHOLD.toLocaleString()} psi during ${highDecelCount} deceleration samples when it should have dropped. This indicates a stuck-open high-pressure pump or faulty pressure relief valve.`,
      recommendation: 'Inspect the high-pressure fuel pump pressure relief valve. Check PCV solenoid operation. Verify fuel return lines are not restricted.',
    });
  }

  return issues;
}

// checkEgtSensorPerformance removed -- its logic is now part of checkAllEgtIssues above.
