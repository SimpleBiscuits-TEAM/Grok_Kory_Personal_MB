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
  timestamp?: number;
}

/**
 * Analyze datalog for diagnostic issues
 */
export function analyzeDiagnostics(data: any): DiagnosticReport {
  const issues: DiagnosticIssue[] = [];

  // Extract relevant columns from the data
  const railPressureActual = data.railPressureActual || [];
  const railPressureDesired = data.railPressureDesired || [];
  const pcvDutyCycle = data.pcvDutyCycle || [];
  const boostActual = data.boostActual || [];
  const boostDesired = data.boostDesired || [];
  const turboVanePosition = data.turboVanePosition || [];
  const exhaustGasTemp = data.exhaustGasTemp || [];
  const maf = data.maf || [];
  const rpm = data.rpm || [];

  // Check for Low Rail Pressure (P0087)
  if (railPressureActual.length > 0) {
    const lowRailIssues = checkLowRailPressure(
      railPressureActual,
      railPressureDesired,
      pcvDutyCycle
    );
    issues.push(...lowRailIssues);
  }

  // Check for High Rail Pressure (P0088)
  if (railPressureActual.length > 0) {
    const highRailIssues = checkHighRailPressure(
      railPressureActual,
      railPressureDesired,
      pcvDutyCycle
    );
    issues.push(...highRailIssues);
  }

  // Check for Low Boost Pressure (P0299)
  if (boostActual.length > 0) {
    const lowBoostIssues = checkLowBoostPressure(
      boostActual,
      boostDesired,
      turboVanePosition,
      maf
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
 * Check for Low Rail Pressure (P0087) conditions
 */
function checkLowRailPressure(
  actual: number[],
  desired: number[],
  pcv: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const threshold = 3000; // 3k psi offset
  const minDuration = 2; // seconds
  const sampleRate = 10; // samples per second (approximate)
  const minSamples = minDuration * sampleRate;

  let consecutiveViolations = 0;

  for (let i = 0; i < actual.length; i++) {
    const offset = desired[i] - actual[i];
    if (offset > threshold) {
      consecutiveViolations++;

      if (consecutiveViolations >= minSamples) {
        const pcvValue = pcv[i] || 0;

        if (pcvValue < 500) {
          issues.push({
            code: 'P0087-RAIL-MAXED',
            severity: 'critical',
            title: 'Low Rail Pressure - System Maxed Out',
            description: `Rail pressure is ${offset.toFixed(0)} psi lower than desired for more than ${minDuration} seconds. PCV duty cycle is ${pcvValue.toFixed(0)}mA (below 500mA threshold).`,
            recommendation:
              'The fuel rail system is at maximum capacity. Check for fuel pump issues, fuel filter restrictions, or fuel line blockages. Consider upgrading the fuel system.',
          });
        } else {
          issues.push({
            code: 'P0087-RAIL-TUNING',
            severity: 'warning',
            title: 'Low Rail Pressure - Possible Tuning Issue',
            description: `Rail pressure is ${offset.toFixed(0)} psi lower than desired for more than ${minDuration} seconds. PCV duty cycle is ${pcvValue.toFixed(0)}mA (above 500mA threshold).`,
            recommendation:
              'A tuning adjustment may resolve this issue. Contact your tuner to review fuel pressure calibration and PCV settings.',
          });
        }

        consecutiveViolations = 0; // Reset to avoid duplicate reports
      }
    } else {
      consecutiveViolations = 0;
    }
  }

  // Check for relief valve issue
  if (desired.length > 0) {
    const avgDesired = desired.reduce((a, b) => a + b) / desired.length;
    if (avgDesired > 25000) {
      let lowPressureCount = 0;
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] >= 12000 && actual[i] <= 15000) {
          lowPressureCount++;
        }
      }

      const lowPressurePercentage = (lowPressureCount / actual.length) * 100;
      if (lowPressurePercentage > 20) {
        issues.push({
          code: 'P0087-RELIEF-VALVE',
          severity: 'warning',
          title: 'Low Rail Pressure - Possible Relief Valve Issue',
          description: `Desired rail pressure exceeds 25kpsi, but actual pressure stays between 12k-15kpsi for extended periods (${lowPressurePercentage.toFixed(1)}% of session).`,
          recommendation:
            'The pressure relief valve on the fuel rail may be stuck or faulty. Inspect and test the relief valve. Contact PPEI for additional diagnostics if issue persists.',
        });
      }
    }
  }

  return issues;
}

/**
 * Check for High Rail Pressure (P0088) conditions
 */
function checkHighRailPressure(
  actual: number[],
  desired: number[],
  pcv: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const threshold = 1500; // 1.5k psi offset
  const minDuration = 2; // seconds
  const sampleRate = 10;
  const minSamples = minDuration * sampleRate;

  let consecutiveViolations = 0;

  for (let i = 0; i < actual.length; i++) {
    const offset = actual[i] - desired[i];
    if (offset > threshold) {
      consecutiveViolations++;

      if (consecutiveViolations >= minSamples) {
        issues.push({
          code: 'P0088-HIGH-RAIL',
          severity: 'warning',
          title: 'High Rail Pressure Detected',
          description: `Actual rail pressure is ${offset.toFixed(0)} psi higher than desired for more than ${minDuration} seconds.`,
          recommendation:
            'Check PCV (pressure regulator duty cycle) settings. This is generally a regulator adjustment by the tuner. Contact your tuner to review fuel pressure calibration.',
        });

        consecutiveViolations = 0;
      }
    } else {
      consecutiveViolations = 0;
    }
  }

  // Check for rapid oscillations
  if (actual.length > 100) {
    let oscillationCount = 0;
    for (let i = 1; i < actual.length; i++) {
      const delta = Math.abs(actual[i] - desired[i]) - Math.abs(actual[i - 1] - desired[i - 1]);
      if (Math.abs(delta) > 2500) {
        oscillationCount++;
      }
    }

    const oscillationPercentage = (oscillationCount / actual.length) * 100;
    if (oscillationPercentage > 10) {
      issues.push({
        code: 'P0088-OSCILLATION',
        severity: 'warning',
        title: 'Rail Pressure Oscillation',
        description: `Rail pressure is jumping rapidly (over/undershooting by 2500+ psi) ${oscillationPercentage.toFixed(1)}% of the time.`,
        recommendation:
          'This is generally a regulator adjustment issue. Contact your tuner to fine-tune the fuel pressure regulator response.',
      });
    }
  }

  // Check idle condition
  if (desired.length > 0) {
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
 * Check for Low Boost Pressure (P0299) conditions
 */
function checkLowBoostPressure(
  actual: number[],
  desired: number[],
  turboVane: number[],
  maf: number[]
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const threshold = 5; // 5 psi offset
  const minDuration = 3; // seconds
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

        if (vanePos > 45 && mafFlow > 55) {
          issues.push({
            code: 'P0299-BOOST-LEAK',
            severity: 'critical',
            title: 'Low Boost Pressure - Likely Boost Leak',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired. Turbo vane position is ${vanePos.toFixed(1)}% (above 45%) and MAF flow is ${mafFlow.toFixed(1)} lb/min (above 55 lb/min).`,
            recommendation:
              'A boost leak is very likely. Perform a boost leakdown test and inspect intake system for leaks, cracks, or loose connections. Check intercooler, piping, and clamps.',
          });
        } else if (vanePos > 45) {
          issues.push({
            code: 'P0299-UNDERBOOST',
            severity: 'warning',
            title: 'Low Boost Pressure - Turbo Issue',
            description: `Boost is ${offset.toFixed(1)} psi lower than desired for more than ${minDuration} seconds. Turbo vane position is ${vanePos.toFixed(1)}% (above 45%).`,
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
 * Check Exhaust Gas Temperature conditions
 */
function checkExhaustGasTemp(egt: number[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const highThreshold = 1475; // degrees F
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
 * Check Mass Airflow (P0101) conditions
 */
function checkMassAirflow(maf: number[], rpm: number[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  // Find idle conditions (RPM < 1000)
  const idleIndices = rpm
    .map((r, i) => (r < 1000 ? i : -1))
    .filter((i) => i !== -1);

  if (idleIndices.length > 50) {
    const idleMaf = idleIndices.map((i) => maf[i]);
    const avgIdleMaf = idleMaf.reduce((a, b) => a + b) / idleMaf.length;
    const maxIdleMaf = Math.max(...idleMaf);
    const minIdleMaf = Math.min(...idleMaf);

    if (maxIdleMaf > 6) {
      issues.push({
        code: 'P0101-HIGH-IDLE-MAF',
        severity: 'warning',
        title: 'High MAF at Idle',
        description: `MAF flow exceeds 6 lb/min at idle (peak: ${maxIdleMaf.toFixed(1)} lb/min, average: ${avgIdleMaf.toFixed(1)} lb/min).`,
        recommendation:
          'Check MAF sensor for contamination or damage. Contact tuner to verify MAF calibration. May indicate air leak or sensor fault.',
      });
    }

    if (minIdleMaf < 2) {
      issues.push({
        code: 'P0101-LOW-IDLE-MAF',
        severity: 'warning',
        title: 'Low MAF at Idle',
        description: `MAF flow drops below 2 lb/min at idle (minimum: ${minIdleMaf.toFixed(1)} lb/min).`,
        recommendation:
          'Check MAF sensor for contamination or blockage. Contact tuner to verify MAF calibration. May indicate intake restriction or sensor fault.',
      });
    }
  }

  return issues;
}
