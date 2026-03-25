/**
 * Diagnostic rules engine for Duramax performance analysis
 * Checks for common issues and provides recommendations
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

/**
 * Analyze datalog for diagnostic issues
 */
export function analyzeDiagnostics(data: any): DiagnosticReport {
  const issues: DiagnosticIssue[] = [];

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

  // Check for Low Rail Pressure (P0087)
  if (railPressureActual.length > 0) {
    const lowRailIssues = checkLowRailPressure(
      railPressureActual,
      railPressureDesired,
      pcvDutyCycle,
      rpm
    );
    issues.push(...lowRailIssues);
  }

  // Check for High Rail Pressure (P0088)
  if (railPressureActual.length > 0) {
    const highRailIssues = checkHighRailPressure(
      railPressureActual,
      railPressureDesired,
      pcvDutyCycle,
      rpm
    );
    issues.push(...highRailIssues);
  }

  // Check for Low Boost Pressure (P0299)
  if (boostActual.length > 0) {
    const lowBoostIssues = checkLowBoostPressure(
      boostActual,
      boostDesired,
      turboVanePosition,
      maf,
      rpm
    );
    issues.push(...lowBoostIssues);
  }

  // Check Exhaust Gas Temperature (unified: sensor faults + high-temp, deduplicated)
  if (exhaustGasTemp.length > 0) {
    issues.push(...checkAllEgtIssues(exhaustGasTemp));
  }

  // Check Mass Airflow (P0101)
  if (maf.length > 0 && rpm.length > 0) {
    const mafIssues = checkMassAirflow(maf, rpm);
    issues.push(...mafIssues);
  }

  // Check Torque Converter Slip
  if (converterSlip.length > 0) {
    const converterIssues = checkConverterSlip(
      converterSlip,
      converterDutyCycle,
      converterPressure,
      rpm
    );
    issues.push(...converterIssues);
  }

  // P0046 - VGT Vane Tracking
  if (turboVanePosition.length > 0 && turboVaneDesired.length > 0) {
    issues.push(...checkVgtTracking(turboVanePosition, turboVaneDesired, rpm));
  }

  // P0089 - Fuel Pressure Regulator Performance
  if (railPressureActual.length > 0) {
    issues.push(...checkFuelPressureRegulatorPerformance(railPressureActual, railPressureDesired, rpm));
  }

  // P0116/P0128 - Coolant Temperature
  if (coolantTemp.length > 0) {
    issues.push(...checkCoolantTemp(coolantTemp, timeMinutes));
  }

  // P0506/P0507 - Idle RPM
  if (rpm.length > 0) {
    issues.push(...checkIdleRpm(rpm));
  }

  // P0741/P0742 - TCC Operation
  if (converterSlip.length > 0 && converterDutyCycle.length > 0) {
    issues.push(...checkTccOperation(converterSlip, converterDutyCycle, rpm));
  }

  // P1089 - Rail Pressure High on Decel
  if (railPressureActual.length > 0) {
    issues.push(...checkHighRailOnDecel(railPressureActual, railPressureDesired, rpm));
  }

  // P2080/P2084 - EGT Sensor Performance is now handled inside checkAllEgtIssues above.

  const summary =
    issues.length === 0
      ? 'No diagnostic issues detected. Engine parameters are within normal ranges.'
      : `Found ${issues.length} diagnostic issue(s). Review recommendations below.`;

  return {
    issues,
    summary,
    timestamp: new Date(),
  };
}

/**
 * Check for Low Rail Pressure (P0087) - Updated thresholds
 * Decel exclusion: skip samples where RPM is actively dropping (engine braking)
 * to avoid false positives during lift-throttle events.
 */
function checkLowRailPressure(
  actual: number[],
  desired: number[],
  pcv: number[],
  rpmArr: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const threshold = 3900; // 3k psi offset +30%
  const minDuration = 6.5; // seconds +30%
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;
  // Pre-compute a decel flag for every sample using a wider 10-sample (1s) window.
  // A sample is considered decel if:
  //   1. RPM is actively dropping over the last 10 samples (>150 RPM total drop), OR
  //   2. RPM is below 1200 (idle/coast-down), OR
  //   3. RPM is lower than it was 5 samples ago by any amount (short-term downtrend)
  const decelFlags: boolean[] = rpmArr.map((rpm, i) => {
    if (rpm < 1200) return true; // idle / coast
    const drop10 = i >= 10 ? rpmArr[i - 10] - rpm : 0;
    const drop5  = i >= 5  ? rpmArr[i - 5]  - rpm : 0;
    return drop10 > 150 || drop5 > 50;
  });

  let consecutiveViolations = 0;
  for (let i = 0; i < actual.length; i++) {
    const offset = desired[i] - actual[i];
    if (offset > threshold && !decelFlags[i]) {
      consecutiveViolations++;
      if (consecutiveViolations >= minSamples) {
        const pcvValue = pcv[i] || 0;
        if (pcvValue < 325) { // 500mA -30% (lower = harder to trigger)
          issues.push({
            code: 'P0087-RAIL-MAXED',
            severity: 'critical',
            title: 'Low Rail Pressure - System Maxed Out',
            description: `Rail pressure is ${offset.toFixed(0)} psi lower than desired for more than ${minDuration} seconds. PCV duty cycle is ${pcvValue.toFixed(0)}mA (below 500mA threshold). Deceleration events excluded.`,
            recommendation:
              'The fuel rail system is at maximum capacity. Check for fuel pump issues, fuel filter restrictions, or fuel line blockages. Consider upgrading the fuel system.',
          });
        } else {
          issues.push({
            code: 'P0087-RAIL-TUNING',
            severity: 'warning',
            title: 'Low Rail Pressure - Possible Tuning Issue',
            description: `Rail pressure is ${offset.toFixed(0)} psi lower than desired for more than ${minDuration} seconds. PCV duty cycle is ${pcvValue.toFixed(0)}mA (above 500mA threshold). Deceleration events excluded.`,
            recommendation:
              'A tuning adjustment may resolve this issue. Contact your tuner to review fuel pressure calibration and PCV settings.',
          });
        }
        consecutiveViolations = 0;
      }
    } else {
      // Reset counter on non-violation OR decel event
      consecutiveViolations = 0;
    }
  }

   // Check for relief valve issue
  // Exclude decel events: during engine braking, desired stays high while actual
  // drops to 12k-15k range naturally — this is NOT a relief valve fault.
  if (desired.length > 0) {
    const avgDesired = desired.reduce((a, b) => a + b) / desired.length;
    if (avgDesired > 25000) {
      let lowPressureCount = 0;
      let consecutiveLowCount = 0;
      const minConsecutive = 2.6 * 10; // 2 seconds +30%
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] >= 12000 && actual[i] <= 15000 && !decelFlags[i]) {
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
 * Decel guard: returns true when RPM is actively falling (engine braking).
 * Looks back decelLookback samples; if total RPM drop exceeds threshold, it's decel.
 */
function isDecelEvent(rpmArr: number[], i: number, lookback = 3, dropPerSample = 30): boolean {
  return i >= lookback && (rpmArr[i - lookback] - rpmArr[i]) > (dropPerSample * lookback);
}

function checkHighRailPressure(
  actual: number[],
  desired: number[],
  pcv: number[],
  rpmArr: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const threshold = 1950; // 1.5k psi offset +30%
  const minDuration = 5; // seconds
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;

  let consecutiveViolations = 0;

  for (let i = 0; i < actual.length; i++) {
    const offset = actual[i] - desired[i];
    // Decel guard: during engine braking, rail pressure can spike above desired
    // transiently as the CP4 overshoots. Skip these samples to avoid false P0088.
    const decel = isDecelEvent(rpmArr, i);
    if (offset > threshold && !decel) {
      consecutiveViolations++;

      if (consecutiveViolations >= minSamples) {
        issues.push({
          code: 'P0088-HIGH-RAIL',
          severity: 'warning',
          title: 'High Rail Pressure Detected',
          description: `Actual rail pressure is ${offset.toFixed(0)} psi higher than desired for more than ${minDuration} seconds. Deceleration events excluded.`,
          recommendation:
            'Check PCV (pressure regulator duty cycle) settings. This is generally a regulator adjustment by the tuner. Contact your tuner to review fuel pressure calibration.',
        });

        consecutiveViolations = 0;
      }
    } else {
      // Reset on non-violation OR decel event
      consecutiveViolations = 0;
    }
  }

  // Check for rapid oscillations — only flag when ACTUAL pressure swings wildly relative to DESIRED
  // while desired itself is stable (i.e., it's not just a commanded step change)
  if (actual.length > 100) {
    let oscillationCount = 0;
    for (let i = 1; i < actual.length; i++) {
      const desiredChange = Math.abs(desired[i] - desired[i - 1]);
      const actualDeviation = actual[i] - desired[i];
      const prevActualDeviation = actual[i - 1] - desired[i - 1];
      // Only flag if desired is stable (< 1000 psi change) but actual swings > 2500 psi from desired
      if (desiredChange < 1000 && Math.abs(actualDeviation - prevActualDeviation) > 3250) { // 2500 +30%
        oscillationCount++;
      }
    }

    const oscillationPercentage = (oscillationCount / actual.length) * 100;
    if (oscillationPercentage > 19.5) { // 15% +30%
      issues.push({
        code: 'P0088-OSCILLATION',
        severity: 'warning',
        title: 'Rail Pressure Oscillation',
        description: `Rail pressure is jumping rapidly (over/undershooting by 2500+ psi while desired is stable) ${oscillationPercentage.toFixed(1)}% of the time.`,
        recommendation:
          'This is generally a regulator adjustment issue. Contact your tuner to fine-tune the fuel pressure regulator response.',
      });
    }
  }

    // Check idle condition — only when PCV data is actually logged (non-zero values present)
  const hasPcvData = pcv.some((v) => v > 0);
  if (desired.length > 0 && hasPcvData) {
    const idleIndices = desired
      .map((d, i) => (d < 5000 ? i : -1))
      .filter((i) => i !== -1);
    if (idleIndices.length > 50) {
      const idleActual = idleIndices.map((i) => actual[i]);
      const avgIdleActual = idleActual.reduce((a, b) => a + b) / idleActual.length;
      if (avgIdleActual >= 12000 && avgIdleActual <= 14000) {
        const avgIdlePcv = idleIndices.map((i) => pcv[i] || 0).reduce((a, b) => a + b) / idleIndices.length;
        if (avgIdlePcv < 1040) { // 1600mA -30% (lower = harder to trigger)
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
 * Check for Low Boost Pressure (P0299) - Updated thresholds
 */
function checkLowBoostPressure(
  actual: number[],
  desired: number[],
  turboVane: number[],
  maf: number[],
  rpm: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const threshold = 6.5; // 5 psi offset +30%
  const minDuration = 6.5; // seconds +30%
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;

  let consecutiveViolations = 0;

  for (let i = 0; i < actual.length; i++) {
    const offset = desired[i] - actual[i];
    if (offset > threshold) {
      consecutiveViolations++;

      if (consecutiveViolations >= minSamples) {
        const vanePos = turboVane[i] || 0;
        const mafFlow = maf[i] || 0;
        const currentRpm = rpm[i] || 0;

        // Check conditions for boost leak (actual is in PSIG; 25 PSIG ≈ 40 PSIA)
        if (mafFlow > 71.5 && actual[i] < 25 && vanePos > 58.5) { // 55 lb/min +30%, 45% vane +30%
          issues.push({
            code: 'P0299-BOOST-LEAK',
            severity: 'critical',
            title: 'Low Boost Pressure - Likely Boost Leak',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired. Turbo vane position is ${vanePos.toFixed(1)}% (above 45%) and MAF flow is ${mafFlow.toFixed(1)} lb/min (above 55 lb/min).`,
            recommendation:
              'A boost leak is very likely. Perform a boost leakdown test and inspect intake system for leaks, cracks, or loose connections. Check intercooler, piping, and clamps.',
          });
        } else if (vanePos > 58.5 && currentRpm > 3640) { // 45% +30%, 2800 RPM +30%
          issues.push({
            code: 'P0299-UNDERBOOST',
            severity: 'warning',
            title: 'Low Boost Pressure - Turbo Issue',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired for more than ${minDuration} seconds at ${currentRpm.toFixed(0)} RPM. Turbo vane position is ${vanePos.toFixed(1)}% (above 45%).`,
            recommendation:
              'Perform a boost leakdown test and check the intake system for leaks. Inspect turbo for damage or excessive play.',
          });
        } else {
          issues.push({
            code: 'P0299-UNDERBOOST-OTHER',
            severity: 'info',
            title: 'Low Boost Pressure Detected',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired for more than ${minDuration} seconds.`,
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
 * Priority: if the sensor is faulty, skip the high-temp check since readings are unreliable.
 * Guarantees each code (EGT-HIGH, EGT-SENSOR-FAULT, P2080, P2084) appears at most once.
 */
function checkAllEgtIssues(egt: number[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!egt.length) return issues;

  const HIGH_THRESHOLD = 1750;   // 1650F +~6%
  const CRITICAL_THRESHOLD = 1900; // 1800F +~6%
  const MIN_DURATION_SEC = 5;
  const SAMPLE_RATE = 10;
  const MIN_SAMPLES = MIN_DURATION_SEC * SAMPLE_RATE;

  // ── Step 1: Sensor quality checks (stuck / erratic / out-of-range) ──────────
  let sensorFaulty = false;

  // Out-of-range: any single reading above 1900F is physically impossible
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

  // Stuck sensor: >65 consecutive samples with <1F change
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

  // Erratic sensor: >4 rapid jumps of >260F between consecutive samples
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

  // ── Step 2: High-temp check (only when sensor is trustworthy) ────────────────
  // Skip if sensor is faulty -- readings cannot be trusted for thermal protection.
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
          egtHighReported = true; // report once per analysis
        }
      } else {
        consecutiveHighTemp = 0;
      }
    }
  }

  return issues;
}

/**
 * Check Mass Airflow (P0101) - Updated thresholds
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

    // Check for high MAF at idle (above 6 lb/min for 5 seconds)
    let highMafCount = 0;
    for (let i = 0; i < idleIndices.length; i++) {
      if (idleMaf[i] > 7.8) { // 6 lb/min +30%
        highMafCount++;
      }
    }

    if (highMafCount > 65) { // 50 samples +30%
      // More than ~6.5 seconds
      issues.push({
        code: 'P0101-HIGH-IDLE-MAF',
        severity: 'warning',
        title: 'High MAF at Idle',
        description: `MAF flow exceeds 6 lb/min at idle for extended periods (peak: ${maxIdleMaf.toFixed(1)} lb/min, average: ${avgIdleMaf.toFixed(1)} lb/min).`,
        recommendation:
          'Check MAF sensor for contamination or damage. Contact tuner to verify MAF calibration. May indicate air leak or sensor fault.',
      });
    }

    // Check for low MAF at idle (below 2 lb/min for 5 seconds)
    let lowMafCount = 0;
    for (let i = 0; i < idleIndices.length; i++) {
      if (idleMaf[i] < 1.54) { // 2 lb/min -30% (lower = harder to trigger)
        lowMafCount++;
      }
    }

    if (lowMafCount > 65) { // 50 samples +30%
      // More than ~6.5 seconds
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
 * Check Torque Converter Slip - NEW
 */
function checkConverterSlip(
  slip: number[],
  dutyCycle: number[],
  pressure: number[],
  rpm: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  if (slip.length === 0) {
    return issues;
  }

  // Look for patterns: duty cycle and pressure maxed out but slip is not controlled
  let slipViolationCount = 0;
  let maxDutyCycleCount = 0;
  let maxPressureCount = 0;

  for (let i = 0; i < slip.length; i++) {
    // Check if slip is fluctuating more than ±15 RPM
    if (Math.abs(slip[i]) > 19.5) { // 15 RPM +30%
      slipViolationCount++;
    }

    // Check if duty cycle is maxed (near 100%)
    if (dutyCycle[i] > 95) {
      maxDutyCycleCount++;
    }

    // Check if pressure is maxed
    if (pressure[i] > 200) {
      // Assuming max pressure is around 200 PSI
      maxPressureCount++;
    }
  }

  const slipPercentage = (slipViolationCount / slip.length) * 100;
  const dutyPercentage = (maxDutyCycleCount / slip.length) * 100;
  const pressurePercentage = (maxPressureCount / slip.length) * 100;

  // If duty cycle and pressure are maxed but slip is still high, converter is slipping
  if (dutyPercentage > 39 && pressurePercentage > 39 && slipPercentage > 26) { // 30/30/20 +30%
    issues.push({
      code: 'CONVERTER-SLIP',
      severity: 'critical',
      title: 'Torque Converter Slip Detected',
      description: `Converter duty cycle and pressure are maxed out (${dutyPercentage.toFixed(1)}% and ${pressurePercentage.toFixed(1)}% respectively), but converter slip is fluctuating by more than ±15 RPM (${slipPercentage.toFixed(1)}% of session).`,
      recommendation:
        'The torque converter is slipping excessively. This indicates internal converter wear or damage. Have the converter inspected and possibly rebuilt or replaced. Contact your transmission specialist.',
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

  // PID quality guard: if vaneDesired is all zeros (not logged by this logger format),
  // skip entirely — comparing actual against a flat-zero desired always shows 100% error.
  const desiredHasData = vaneDesired.some(v => v > 1);
  if (!desiredHasData) return issues;

  // PID quality guard: if vaneActual has no meaningful data, skip.
  const actualHasData = vaneActual.some(v => v > 1);
  if (!actualHasData) return issues;

  // PID quality guard: require >20% of samples to be non-zero in both channels.
  // If coverage is too low the PID was not reliably logged.
  const minCoverage = vaneActual.length * 0.20;
  const nonZeroActual = vaneActual.filter(v => v > 1).length;
  const nonZeroDesired = vaneDesired.filter(v => v > 1).length;
  if (nonZeroActual < minCoverage || nonZeroDesired < minCoverage) return issues;

  const TRACKING_THRESHOLD = 19.5; // 15% +30%
  const MIN_SAMPLES = 39; // ~3 seconds +30%
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

  const OSCILLATION_THRESHOLD = 2600; // 2000 psi +30%
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
    if (i > 1 && Math.sign(delta) !== Math.sign(prevDelta) && Math.abs(delta) > 1300) { // 1000 psi +30%
      directionChanges++;
    }
    prevDelta = delta;
  }

  const oscillationRate = (oscillationCount / actual.length) * 100;
  if (oscillationRate > 6.5 || directionChanges > 26) { // 5%/20 +30%
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
 * P0116: Coolant temp sensor erratic
 * P0128: Coolant temp below thermostat regulating temperature
 */
export function checkCoolantTemp(
  coolantTemp: number[],
  timeMinutes: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!coolantTemp.length) return issues;

  const maxTemp = Math.max(...coolantTemp);
  const runTime = timeMinutes.length > 1 ? timeMinutes[timeMinutes.length - 1] - timeMinutes[0] : 0;

  // P0128: Coolant never reaches thermostat operating temp (195F)
  if (runTime > 6.5 && maxTemp < 185) { // 5 min +30%, 190F tightened slightly
    issues.push({
      code: 'P0128',
      severity: 'warning',
      title: 'Coolant Below Thermostat Regulating Temp (P0128)',
      description: `Coolant temperature only reached ${maxTemp.toFixed(0)}F over a ${runTime.toFixed(1)}-minute log. The thermostat should regulate at 195F. A stuck-open thermostat causes reduced fuel economy, increased emissions, and potential engine wear.`,
      recommendation: 'Replace the thermostat. Verify the coolant temperature sensor is accurate. Check for air pockets in the cooling system.',
    });
  }

  // P0116: Coolant temp sensor erratic (large rapid swings)
  let erraticCount = 0;
  for (let i = 1; i < coolantTemp.length; i++) {
    if (Math.abs(coolantTemp[i] - coolantTemp[i - 1]) > 26) { // 20F +30%
      erraticCount++;
    }
  }
  if (erraticCount > 6.5) { // 5 +30%
    issues.push({
      code: 'P0116',
      severity: 'warning',
      title: 'Coolant Temperature Sensor Erratic (P0116)',
      description: `Coolant temperature sensor shows ${erraticCount} rapid jumps of >20F between samples. This indicates a failing sensor, loose connector, or wiring fault.`,
      recommendation: 'Inspect coolant temperature sensor connector and wiring. Replace coolant temperature sensor if erratic readings persist.',
    });
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
  const IDLE_LOW_THRESHOLD = 540; // 600 -10% (harder to trigger low)
  const IDLE_HIGH_THRESHOLD = 1100; // 1000 +10% (harder to trigger high)
  const MIN_SAMPLES = 65; // 50 +30%

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
 */
export function checkTccOperation(
  slip: number[],
  dutyCycle: number[],
  rpm: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  if (!slip.length || !dutyCycle.length) return issues;

  // PID quality guard: if dutyCycle is all zeros (not logged by this logger format),
  // disable the stuck-on check — duty cycle = 0 is indistinguishable from "not logged".
  // A logger that doesn't capture TCC duty cycle will always read 0%, which would
  // falsely satisfy the "commanded off" condition for P0742.
  const dutyCycleHasData = dutyCycle.some(v => v > 5);

  // PID quality guard: if slip has no meaningful variation (all near-zero),
  // the sensor is not logging — skip both checks.
  const slipHasData = slip.some(v => Math.abs(v) > 5);
  if (!slipHasData) return issues;

  const MIN_RPM = 1500;
  const HIGH_DUTY_THRESHOLD = 90; // 80 +10% (harder to trigger)
  const SLIP_THRESHOLD_LOCKED = 65; // 50 RPM +30%
  const LOW_DUTY_THRESHOLD = 15; // 20 -25% (harder to trigger stuck-on)
  const SLIP_THRESHOLD_OPEN = 7; // 10 -30% (harder to trigger stuck-on)

  let stuckOffCount = 0;
  let stuckOnCount = 0;

  for (let i = 0; i < slip.length; i++) {
    if (rpm[i] < MIN_RPM) continue;
    const absSlip = Math.abs(slip[i]);
    // P0741 stuck-off: only run when duty cycle data is present
    if (dutyCycleHasData && dutyCycle[i] > HIGH_DUTY_THRESHOLD && absSlip > SLIP_THRESHOLD_LOCKED) {
      stuckOffCount++;
    }
    // P0742 stuck-on: only run when duty cycle data is present
    // Without duty cycle data, near-zero slip at cruise is normal TCC lock, not a fault.
    if (dutyCycleHasData && dutyCycle[i] < LOW_DUTY_THRESHOLD && absSlip < SLIP_THRESHOLD_OPEN && rpm[i] > 2000) {
      stuckOnCount++;
    }
  }

  if (dutyCycleHasData && stuckOffCount > 39) { // 30 +30%
    issues.push({
      code: 'P0741',
      severity: 'critical',
      title: 'Torque Converter Clutch Stuck Off (P0741)',
      description: `TCC was commanded locked (duty cycle >${HIGH_DUTY_THRESHOLD}%) but showed >${SLIP_THRESHOLD_LOCKED} RPM slip for ${stuckOffCount} samples. The converter clutch is not engaging properly.`,
      recommendation: 'Check transmission fluid level and condition. Test TCC solenoid. Inspect torque converter for internal wear. Consider transmission service.',
    });
  }

  if (dutyCycleHasData && stuckOnCount > 65) { // 50 +30%
    issues.push({
      code: 'P0742',
      severity: 'warning',
      title: 'Torque Converter Clutch Stuck On (P0742)',
      description: `TCC showed near-zero slip (<${SLIP_THRESHOLD_OPEN} RPM) even when commanded off for ${stuckOnCount} samples. The converter clutch may be stuck applied.`,
      recommendation: 'Inspect TCC solenoid and hydraulic circuit. Check transmission fluid for contamination. Have transmission inspected for stuck TCC apply circuit.',
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

  const HIGH_DECEL_THRESHOLD = 23000; // 20000 psi +15% (decel check, be conservative)
  const RPM_DROP_WINDOW = 5;
  const RPM_DROP_RATE = 100;
  let highDecelCount = 0;

  for (let i = RPM_DROP_WINDOW; i < actual.length; i++) {
    const rpmDrop = rpm[i - RPM_DROP_WINDOW] - rpm[i];
    const isDecel = rpmDrop > RPM_DROP_RATE;
    if (isDecel && actual[i] > HIGH_DECEL_THRESHOLD && actual[i] > desired[i] + 3900) { // 3000 psi +30%
      highDecelCount++;
    }
  }

  if (highDecelCount > 26) { // 20 +30%
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
