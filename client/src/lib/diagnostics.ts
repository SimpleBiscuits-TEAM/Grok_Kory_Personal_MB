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
  const exhaustGasTemp = data.exhaustGasTemp || [];
  const maf = data.maf || [];
  const rpm = data.rpm || [];
  const converterSlip = data.converterSlip || [];
  const converterDutyCycle = data.converterDutyCycle || [];
  const converterPressure = data.converterPressure || [];

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

  // Check Exhaust Gas Temperature
  if (exhaustGasTemp.length > 0) {
    const egtIssues = checkExhaustGasTemp(exhaustGasTemp);
    issues.push(...egtIssues);
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
  const threshold = 3000; // 3k psi offset
  const minDuration = 5; // seconds
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
        if (pcvValue < 500) {
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
      const minConsecutive = 2 * 10; // 2 seconds
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
  const threshold = 1500; // 1.5k psi offset
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
      if (desiredChange < 1000 && Math.abs(actualDeviation - prevActualDeviation) > 2500) {
        oscillationCount++;
      }
    }

    const oscillationPercentage = (oscillationCount / actual.length) * 100;
    if (oscillationPercentage > 15) {
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
        if (avgIdlePcv < 1600) {
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
  const threshold = 5; // 5 psi offset
  const minDuration = 5; // seconds (UPDATED from 3)
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
        if (mafFlow > 55 && actual[i] < 25 && vanePos > 45) {
          issues.push({
            code: 'P0299-BOOST-LEAK',
            severity: 'critical',
            title: 'Low Boost Pressure - Likely Boost Leak',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired. Turbo vane position is ${vanePos.toFixed(1)}% (above 45%) and MAF flow is ${mafFlow.toFixed(1)} lb/min (above 55 lb/min).`,
            recommendation:
              'A boost leak is very likely. Perform a boost leakdown test and inspect intake system for leaks, cracks, or loose connections. Check intercooler, piping, and clamps.',
          });
        } else if (vanePos > 45 && currentRpm > 2800) {
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
 * Check Exhaust Gas Temperature - Updated thresholds
 */
function checkExhaustGasTemp(egt: number[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const highThreshold = 1650;
  const criticalThreshold = 1800;
  const minDuration = 5; // seconds
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;

  let consecutiveHighTemp = 0;

  for (let i = 0; i < egt.length; i++) {
    if (egt[i] > criticalThreshold) {
      issues.push({
        code: 'EGT-SENSOR-FAULT',
        severity: 'critical',
        title: 'Exhaust Gas Temperature Sensor Fault',
        description: `EGT reading is stuck at ${egt[i].toFixed(0)}°F (above 1800°F threshold).`,
        recommendation:
          'The EGT sensor is likely disconnected or out of service. Check sensor connections and wiring. Replace sensor if faulty.',
      });
      break;
    }

    if (egt[i] > highThreshold) {
      consecutiveHighTemp++;

      if (consecutiveHighTemp >= minSamples) {
        issues.push({
          code: 'EGT-HIGH',
          severity: 'warning',
          title: 'High Exhaust Gas Temperature',
          description: `EGT exceeded ${highThreshold}°F for more than ${minDuration} seconds (peak: ${Math.max(...egt).toFixed(0)}°F).`,
          recommendation:
            'High EGT indicates aggressive tuning or fuel issues. Contact your tuner for further details. Ensure fuel quality and check for engine knock.',
        });

        consecutiveHighTemp = 0;
      }
    } else {
      consecutiveHighTemp = 0;
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
      if (idleMaf[i] > 6) {
        highMafCount++;
      }
    }

    if (highMafCount > 50) {
      // More than 5 seconds
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
      if (idleMaf[i] < 2) {
        lowMafCount++;
      }
    }

    if (lowMafCount > 50) {
      // More than 5 seconds
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
    if (Math.abs(slip[i]) > 15) {
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
  if (dutyPercentage > 30 && pressurePercentage > 30 && slipPercentage > 20) {
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
