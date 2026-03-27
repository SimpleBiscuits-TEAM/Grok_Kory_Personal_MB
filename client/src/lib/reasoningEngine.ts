/**
 * PPEI AI Reasoning Engine
 *
 * A lightweight, rule-based reasoning layer that applies common-sense vehicle
 * operation logic to the processed datalog. This engine:
 *
 *  1. Understands CONTEXT — it knows that cold engines warm up, that rail pressure
 *     at idle is different from rail pressure under load, and that TCC slip during
 *     partial apply is normal.
 *
 *  2. Correlates MULTIPLE PIDs — it doesn't just look at one sensor in isolation.
 *     It asks: "Is the rail pressure low AND is the PCV current maxed? If yes, that's
 *     a fuel supply issue, not a tuning issue."
 *
 *  3. Generates BETA IMPROVEMENT SUGGESTIONS — it identifies patterns in the data
 *     that might not be faults yet but indicate areas for improvement.
 *
 *  4. Provides NARRATIVE REASONING — it explains WHY it reached a conclusion, not
 *     just WHAT the conclusion is.
 */

import type { ProcessedMetrics } from './dataProcessor';
import type { DiagnosticReport } from './diagnostics';

export interface ReasoningFinding {
  id: string;
  category: 'transmission' | 'fuel_system' | 'thermal' | 'boost' | 'general';
  confidence: 'high' | 'medium' | 'low';
  type: 'fault' | 'warning' | 'improvement' | 'info';
  title: string;
  reasoning: string;
  evidence: string[];
  suggestion?: string;
  betaNote?: string;
}

export interface ReasoningReport {
  findings: ReasoningFinding[];
  operatingContext: OperatingContext;
  betaImprovements: BetaImprovement[];
  summary: string;
  engineVersion: string;
}

export interface OperatingContext {
  logDuration: number;
  warmupPhaseDetected: boolean;
  warmupCompletedAt: number; // seconds into log
  operatingTempReached: boolean;
  maxCoolantTempF: number;
  minCoolantTempF: number;
  maxRpmObserved: number;
  maxVehicleSpeedMph: number;
  tccFullLockDetected: boolean;
  tccFullLockSamples: number;
  railPressureFormat: 'kpa' | 'psi';
  tccPressureFormat: 'kpa_pcs' | 'percent';
  fileFormat: string;
}

export interface BetaImprovement {
  id: string;
  area: string;
  observation: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Main reasoning engine entry point.
 * Takes processed metrics and an existing diagnostic report, then applies
 * higher-level contextual reasoning to produce additional findings and
 * beta improvement suggestions.
 */
export function runReasoningEngine(
  data: ProcessedMetrics,
  diagnostics: DiagnosticReport
): ReasoningReport {
  const findings: ReasoningFinding[] = [];
  const betaImprovements: BetaImprovement[] = [];

  // ── Step 1: Build operating context ──────────────────────────────────────
  const ctx = buildOperatingContext(data);

  // ── Step 2: TCC / Transmission reasoning ─────────────────────────────────
  findings.push(...analyzeTccBehavior(data, ctx, diagnostics));

  // ── Step 3: Rail pressure / fuel system reasoning ─────────────────────────
  findings.push(...analyzeRailPressure(data, ctx, diagnostics));

  // ── Step 4: Thermal management reasoning ─────────────────────────────────
  findings.push(...analyzeThermalManagement(data, ctx));

  // ── Step 5: Boost / VGT correlation reasoning ────────────────────────────
  findings.push(...analyzeBoostSystem(data, ctx));

  // ── Step 6: Beta improvement suggestions ─────────────────────────────────
  betaImprovements.push(...generateBetaImprovements(data, ctx, findings, diagnostics));

  // ── Step 7: Generate summary ──────────────────────────────────────────────
  const summary = generateSummary(findings, ctx, diagnostics);

  return {
    findings,
    operatingContext: ctx,
    betaImprovements,
    summary,
    engineVersion: 'PPEI AI Beta v1.0',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Operating Context Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildOperatingContext(data: ProcessedMetrics): OperatingContext {
  const coolant = data.coolantTemp.filter(t => t > -39 && t > 0);
  const maxCoolantTempF = coolant.length > 0 ? Math.max(...coolant) : 0;
  const minCoolantTempF = coolant.length > 0 ? Math.min(...coolant) : 0;

  // Find when warmup completed (first time coolant > 160°F)
  let warmupCompleteIdx = data.coolantTemp.length;
  for (let i = 0; i < data.coolantTemp.length; i++) {
    if (data.coolantTemp[i] > 160) {
      warmupCompleteIdx = i;
      break;
    }
  }
  const warmupPhaseDetected = minCoolantTempF < 160 && coolant.length > 0;
  const operatingTempReached = maxCoolantTempF > 185;

  // Warmup time in seconds
  const warmupCompletedAt = warmupCompleteIdx < data.timeMinutes.length
    ? data.timeMinutes[warmupCompleteIdx] * 60
    : -1;

  // TCC format detection
  const tccDuty = data.converterDutyCycle.filter(v => v > 0);
  const maxTccDuty = tccDuty.length > 0 ? Math.max(...tccDuty) : 0;
  const tccPressureFormat: 'kpa_pcs' | 'percent' = maxTccDuty > 200 ? 'kpa_pcs' : 'percent';
  const fullLockThreshold = tccPressureFormat === 'kpa_pcs' ? 1000 : 90;
  const tccFullLockSamples = data.converterDutyCycle.filter(v => v >= fullLockThreshold).length;
  const tccFullLockDetected = tccFullLockSamples > 5;

  // Rail pressure format (EFILive converts kPa→psi in parser, so values are in psi)
  const maxRail = data.railPressureActual.filter(v => v > 0);
  const railPressureFormat: 'kpa' | 'psi' = 'psi'; // always psi after parser conversion

  const logDuration = data.timeMinutes.length > 1
    ? (data.timeMinutes[data.timeMinutes.length - 1] - data.timeMinutes[0]) * 60
    : 0;

  return {
    logDuration,
    warmupPhaseDetected,
    warmupCompletedAt,
    operatingTempReached,
    maxCoolantTempF,
    minCoolantTempF,
    maxRpmObserved: data.stats.rpmMax,
    maxVehicleSpeedMph: Math.max(...data.vehicleSpeed.filter(v => v > 0), 0),
    tccFullLockDetected,
    tccFullLockSamples,
    railPressureFormat,
    tccPressureFormat,
    fileFormat: data.fileFormat,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TCC / Transmission Reasoning
// ─────────────────────────────────────────────────────────────────────────────

function analyzeTccBehavior(
  data: ProcessedMetrics,
  ctx: OperatingContext,
  diagnostics: DiagnosticReport
): ReasoningFinding[] {
  const findings: ReasoningFinding[] = [];
  const slip = data.converterSlip;
  const duty = data.converterDutyCycle;
  const rpm = data.rpm;
  const vss = data.vehicleSpeed;
  const gear = data.currentGear || [];

  if (slip.length === 0) return findings;

  const fullLockThreshold = ctx.tccPressureFormat === 'kpa_pcs' ? 1000 : 90;
  const lockLabel = ctx.tccPressureFormat === 'kpa_pcs' ? '1050 kPa (full lock)' : '90% duty (full lock)';

  // ── Noise-floor awareness ─────────────────────────────────────────────────
  // ±25 RPM slip while locked is normal — caused by the logging tool's
  // filtering/sampling of the TCM slip speed signal, not actual mechanical slip.
  // Raised from 15 to 25 RPM to account for real-world noise.
  const SLIP_NOISE_FLOOR = 25;

  // Build gear-shift exclusion mask: slip during shifts is expected because
  // the converter naturally slips while the transmission changes ratios,
  // even with steady duty cycle.
  const SHIFT_EXCLUSION_WINDOW = 15; // raised from 8 to match diagnostics.ts
  const isShifting = new Uint8Array(slip.length);
  if (gear.length >= slip.length) {
    for (let i = 1; i < gear.length; i++) {
      if (gear[i] !== gear[i - 1] && gear[i] > 0 && gear[i - 1] > 0) {
        const start = Math.max(0, i - SHIFT_EXCLUSION_WINDOW);
        const end = Math.min(slip.length - 1, i + SHIFT_EXCLUSION_WINDOW);
        for (let j = start; j <= end; j++) isShifting[j] = 1;
      }
    }
  }

  // Build lock-transition grace period mask: when the TCM transitions
  // between locked/unlocked, there is a hydraulic apply delay.
  const LOCK_GRACE_WINDOW = 20; // raised from 10 to match diagnostics.ts
  const isTransitioning = new Uint8Array(slip.length);
  let prevLocked = duty[0] >= fullLockThreshold;
  for (let i = 1; i < slip.length; i++) {
    const nowLocked = duty[i] >= fullLockThreshold;
    if (nowLocked !== prevLocked) {
      const start = Math.max(0, i - LOCK_GRACE_WINDOW);
      const end = Math.min(slip.length - 1, i + LOCK_GRACE_WINDOW);
      for (let j = start; j <= end; j++) isTransitioning[j] = 1;
    }
    prevLocked = nowLocked;
  }

  // Build converging slip mask: when slip is steadily decreasing, the converter
  // is in normal torque-multiplication mode during acceleration — NOT a fault.
  const CONVERGE_WINDOW = 20;
  const isConverging = new Uint8Array(slip.length);
  for (let i = CONVERGE_WINDOW; i < slip.length; i++) {
    const startSlip = Math.abs(slip[i - CONVERGE_WINDOW]);
    const endSlip = Math.abs(slip[i]);
    if (startSlip > 50 && endSlip < startSlip * 0.7) {
      for (let j = i - CONVERGE_WINDOW; j <= i; j++) isConverging[j] = 1;
    }
  }

  // Collect slip events under full lock, excluding noise, shifts, transitions, and converging slip
  const slipEventsUnderLock: Array<{slip: number; rpm: number; vss: number; idx: number}> = [];
  let consecutiveSlip = 0;

  for (let i = 0; i < slip.length; i++) {
    const isLocked = duty[i] >= fullLockThreshold;
    const absSlip = Math.abs(slip[i]);

    // Skip gear shifts, lock transitions, and converging slip — all are expected
    if (isShifting[i] || isTransitioning[i] || isConverging[i]) {
      consecutiveSlip = 0;
      continue;
    }

    if (isLocked && absSlip > SLIP_NOISE_FLOOR) {
      consecutiveSlip++;
      // Require 15 consecutive samples (raised from 5) = 1.5s at 10 Hz
      if (consecutiveSlip >= 15) {
        slipEventsUnderLock.push({ slip: slip[i], rpm: rpm[i] || 0, vss: vss[i] || 0, idx: i });
      }
    } else {
      consecutiveSlip = 0;
    }
  }

  if (slipEventsUnderLock.length === 0) return findings;

  // Analyze the slip events for patterns
  const maxSlip = Math.max(...slipEventsUnderLock.map(e => Math.abs(e.slip)));
  const avgSlipRpm = slipEventsUnderLock.reduce((s, e) => s + e.rpm, 0) / slipEventsUnderLock.length;
  const avgSlipVss = slipEventsUnderLock.map(e => e.vss).filter(v => v > 0);
  const avgSpeed = avgSlipVss.length > 0 ? avgSlipVss.reduce((a, b) => a + b, 0) / avgSlipVss.length : 0;

  // Determine if slip is load-induced (high RPM + high speed = WOT/heavy load)
  const highLoadSlip = slipEventsUnderLock.filter(e => e.rpm > 2500 && e.vss > 50);
  const lowSpeedSlip = slipEventsUnderLock.filter(e => e.vss < 40);

  const evidence: string[] = [
    `TCC commanded at ${lockLabel} throughout slip events`,
    `${slipEventsUnderLock.length} confirmed slip events (≥15 consecutive samples >${SLIP_NOISE_FLOOR} RPM, gear shifts, lock transitions, and converging slip excluded)`,
    `Peak slip: ${maxSlip.toFixed(0)} RPM`,
    `Average RPM during slip: ${avgRpmObserved(slipEventsUnderLock)} RPM`,
    `Average speed during slip: ${avgSpeed.toFixed(0)} mph`,
  ];

  if (highLoadSlip.length > 0) {
    evidence.push(`${highLoadSlip.length} events occurred at high load (>2500 RPM, >50 mph) — load-induced slip pattern`);
  }

  // Determine likely root cause
  let rootCause = '';
  let suggestion = '';

  if (highLoadSlip.length > slipEventsUnderLock.length * 0.6) {
    // Majority of slip events at high load → converter clutch wear or fluid degradation
    rootCause =
      'The slip pattern is predominantly load-induced: slip events cluster at high RPM and vehicle speed, ' +
      'indicating the converter clutch is unable to hold under torque. This is consistent with internal ' +
      'converter clutch wear, degraded friction material, or insufficient TCC apply pressure.';
    suggestion =
      'Inspect torque converter clutch friction material. Check TCC solenoid apply pressure. ' +
      'Perform transmission fluid service (check for burnt smell or dark color). ' +
      'If slip persists after fluid service, converter rebuild or replacement is likely needed.';
  } else if (lowSpeedSlip.length > slipEventsUnderLock.length * 0.5) {
    // Slip at low speed → possible TCC solenoid or hydraulic issue
    rootCause =
      'Slip events occurring at lower vehicle speeds suggest the TCC apply circuit is not maintaining ' +
      'adequate hydraulic pressure to keep the clutch engaged. This can indicate a faulty TCC solenoid, ' +
      'worn valve body, or low transmission fluid pressure.';
    suggestion =
      'Test TCC solenoid resistance and operation. Check transmission line pressure. ' +
      'Inspect valve body for wear. Verify transmission fluid level and condition.';
  } else {
    rootCause =
      'Converter slip is occurring across a range of operating conditions while the TCM commands full lock. ' +
      'The converter clutch is not holding consistently, indicating wear or a hydraulic apply issue.';
    suggestion =
      'Comprehensive transmission inspection recommended. Check TCC solenoid, fluid condition, ' +
      'and converter clutch friction material.';
  }

  findings.push({
    id: 'tcc-slip-analysis',
    category: 'transmission',
    confidence: slipEventsUnderLock.length >= 10 ? 'high' : 'medium',
    type: 'fault',
    title: 'Confirmed TCC Clutch Slip Under Full Lock Command',
    reasoning: rootCause,
    evidence,
    suggestion,
    betaNote:
      'PPEI AI Beta: Slip pattern analysis uses ±25 RPM noise-floor filtering (logging tool signal noise), ' +
      'gear-shift exclusion (±15 samples around gear changes), lock-transition grace period (±20 samples), ' +
      'converging-slip exclusion (slip decreasing >30% over 20 samples = normal torque multiplication), ' +
      'and 15-consecutive-sample confirmation. Load-correlation logic compares slip events against ' +
      'RPM/VSS thresholds to distinguish mechanical wear from solenoid/hydraulic faults.',
  });

  return findings;
}

function avgRpmObserved(events: Array<{rpm: number}>): string {
  if (events.length === 0) return 'N/A';
  return (events.reduce((s, e) => s + e.rpm, 0) / events.length).toFixed(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rail Pressure / Fuel System Reasoning
// ─────────────────────────────────────────────────────────────────────────────

function analyzeRailPressure(
  data: ProcessedMetrics,
  ctx: OperatingContext,
  diagnostics: DiagnosticReport
): ReasoningFinding[] {
  const findings: ReasoningFinding[] = [];

  const actual = data.railPressureActual;
  const desired = data.railPressureDesired;
  const pcv = data.pcvDutyCycle;
  const coolant = data.coolantTemp;
  const rpm = data.rpm;

  if (actual.length === 0 || desired.length === 0) return findings;

  // Only analyze rail pressure at operating temperature (exclude warmup)
  // This prevents false positives from cold-start fuel enrichment
  const warmSamples: Array<{actual: number; desired: number; pcv: number; dev: number; devPct: number}> = [];

  for (let i = 0; i < actual.length; i++) {
    const ect = coolant[i] || 0;
    const isWarm = ect > 160 || (ctx.warmupCompletedAt < 0 && ect === 0);
    if (!isWarm) continue;

    const des = desired[i];
    const act = actual[i];
    if (des <= 0 || act <= 0) continue;

    const dev = act - des;
    const devPct = (dev / des) * 100;
    warmSamples.push({ actual: act, desired: des, pcv: pcv[i] || 0, dev, devPct });
  }

  if (warmSamples.length < 10) return findings;

  // Detect PCV format: EFILive logs mA (typical range 800-1400 mA), HP Tuners logs %
  const maxPcv = Math.max(...warmSamples.map(s => s.pcv).filter(v => v > 0));
  const isEFILivePcvMa = maxPcv > 200; // mA values >> 100%

  // Rail pressure deviation analysis
  const devs = warmSamples.map(s => s.dev);
  const devPcts = warmSamples.map(s => s.devPct);
  const avgDev = devs.reduce((a, b) => a + b, 0) / devs.length;
  const maxPosDev = Math.max(...devs);
  const maxNegDev = Math.min(...devs);
  const avgDevPct = devPcts.reduce((a, b) => a + b, 0) / devPcts.length;

  // PCV current variation (indicates regulator hunting)
  const pcvVals = warmSamples.map(s => s.pcv).filter(v => v > 0);
  const pcvRange = pcvVals.length > 0 ? Math.max(...pcvVals) - Math.min(...pcvVals) : 0;
  const pcvLabel = isEFILivePcvMa ? 'mA' : '%';

  // Determine if PCV is fluctuating excessively (indicates regulator instability)
  // EFILive: >200 mA swing = significant; HP Tuners: >20% swing = significant
  const pcvFluctuating = isEFILivePcvMa ? pcvRange > 200 : pcvRange > 20;

  // Count samples with significant deviation (>5% from desired)
  const significantDevCount = warmSamples.filter(s => Math.abs(s.devPct) > 5).length;
  const significantDevRate = (significantDevCount / warmSamples.length) * 100;

  // Only report if there's a meaningful pattern
  if (significantDevRate > 10 || pcvFluctuating) {
    const evidence: string[] = [
      `${warmSamples.length} samples analyzed at operating temperature`,
      `Average rail pressure deviation: ${avgDev.toFixed(0)} psi (${avgDevPct.toFixed(1)}%)`,
      `Max positive deviation: +${maxPosDev.toFixed(0)} psi`,
      `Max negative deviation: ${maxNegDev.toFixed(0)} psi`,
      `Samples with >5% deviation: ${significantDevCount} (${significantDevRate.toFixed(1)}%)`,
    ];

    if (pcvVals.length > 0) {
      evidence.push(`PCV current range: ${Math.min(...pcvVals).toFixed(0)}-${Math.max(...pcvVals).toFixed(0)} ${pcvLabel} (swing: ${pcvRange.toFixed(0)} ${pcvLabel})`);
    }

    let reasoning = '';
    let type: 'fault' | 'warning' | 'improvement' | 'info' = 'info';

    if (pcvFluctuating && significantDevRate > 20) {
      type = 'warning';
      reasoning =
        `The PCV (pressure control valve) current is fluctuating by ${pcvRange.toFixed(0)} ${pcvLabel}, ` +
        `which correlates with rail pressure deviating more than 5% from desired in ${significantDevRate.toFixed(1)}% of samples. ` +
        `When PCV current fluctuates while desired pressure is stable, it indicates the regulator is ` +
        `hunting — actively correcting an unstable pressure condition. This can indicate a partially ` +
        `clogged fuel filter, air entrainment in the fuel system, or a marginal high-pressure pump (HP4 on L5P, CP4 on LML, CP3 on LBZ/LMM).`;
    } else if (pcvFluctuating) {
      type = 'improvement';
      reasoning =
        `PCV current shows a ${pcvRange.toFixed(0)} ${pcvLabel} swing, indicating the pressure regulator ` +
        `is working to maintain rail pressure stability. While rail pressure deviation is within ` +
        `acceptable limits (avg ${avgDevPct.toFixed(1)}%), the PCV activity suggests the fuel system ` +
        `is working harder than ideal. This is worth monitoring, especially under higher load conditions.`;
    } else {
      type = 'info';
      reasoning =
        `Rail pressure deviates from desired by an average of ${avgDevPct.toFixed(1)}% at operating temperature. ` +
        `The PCV current variation (${pcvRange.toFixed(0)} ${pcvLabel}) is within normal operating range. ` +
        `This level of deviation is typical for a healthy common-rail fuel system under varying load.`;
    }

    findings.push({
      id: 'rail-pressure-analysis',
      category: 'fuel_system',
      confidence: warmSamples.length > 50 ? 'high' : 'medium',
      type,
      title: 'Rail Pressure Deviation Analysis',
      reasoning,
      evidence,
      suggestion: type === 'warning'
        ? 'Check fuel filter condition and replacement interval. Inspect fuel lines for air entrainment. ' +
          'Verify high-pressure pump output pressure (HP4 on L5P, CP4 on LML, CP3 on older platforms). Consider fuel system inspection if deviation worsens under load.'
        : undefined,
      betaNote:
        'PPEI AI Beta: Rail pressure deviation is only evaluated at operating temperature (ECT >160°F). ' +
        'PCV current fluctuation is cross-correlated with deviation to distinguish regulator hunting ' +
        'from normal load-induced variation.',
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thermal Management Reasoning
// ─────────────────────────────────────────────────────────────────────────────

function analyzeThermalManagement(
  data: ProcessedMetrics,
  ctx: OperatingContext
): ReasoningFinding[] {
  const findings: ReasoningFinding[] = [];
  const coolant = data.coolantTemp.filter(t => t > -39 && t > 0);

  if (coolant.length === 0) return findings;

  // Warmup rate analysis
  if (ctx.warmupPhaseDetected && ctx.warmupCompletedAt > 0) {
    const warmupMinutes = ctx.warmupCompletedAt / 60;
    findings.push({
      id: 'warmup-analysis',
      category: 'thermal',
      confidence: 'high',
      type: 'info',
      title: 'Cold Start Warmup Detected',
      reasoning:
        `Engine started from ${ctx.minCoolantTempF.toFixed(0)}°F and reached operating temperature ` +
        `(160°F threshold) in ${warmupMinutes.toFixed(1)} minutes. ` +
        `All diagnostic checks during the warmup phase (0 to ${warmupMinutes.toFixed(1)} min) ` +
        `have been excluded from fault detection to prevent false positives. ` +
        `Low coolant temperature during warmup is completely normal — engines must heat up from ambient.`,
      evidence: [
        `Start temperature: ${ctx.minCoolantTempF.toFixed(0)}°F`,
        `Warmup complete at: ${warmupMinutes.toFixed(1)} minutes into log`,
        `Max temperature reached: ${ctx.maxCoolantTempF.toFixed(0)}°F`,
        `Operating temp reached: ${ctx.operatingTempReached ? 'Yes (>185°F)' : 'No — still warming up or thermostat issue'}`,
      ],
    });
  }

  // Operating temperature stability
  if (ctx.operatingTempReached) {
    const warmSamples = coolant.filter(t => t > 160);
    const maxWarm = Math.max(...warmSamples);
    const minWarm = Math.min(...warmSamples);
    const tempRange = maxWarm - minWarm;

    if (tempRange > 30) {
      findings.push({
        id: 'coolant-stability',
        category: 'thermal',
        confidence: 'medium',
        type: 'improvement',
        title: 'Coolant Temperature Variation at Operating Temp',
        reasoning:
          `After reaching operating temperature, coolant varied by ${tempRange.toFixed(0)}°F ` +
          `(${minWarm.toFixed(0)}°F to ${maxWarm.toFixed(0)}°F). ` +
          `Some variation is normal under changing load conditions, but a ${tempRange.toFixed(0)}°F ` +
          `range may indicate the thermostat is cycling more than expected or the cooling system ` +
          `is slightly oversized for current operating conditions.`,
        evidence: [
          `Temperature at operating temp: ${minWarm.toFixed(0)}°F to ${maxWarm.toFixed(0)}°F`,
          `Range: ${tempRange.toFixed(0)}°F`,
        ],
        suggestion: 'Monitor coolant temperature under consistent load conditions. If variation exceeds 40°F, inspect thermostat operation.',
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boost / VGT Reasoning
// ─────────────────────────────────────────────────────────────────────────────

function analyzeBoostSystem(
  data: ProcessedMetrics,
  ctx: OperatingContext
): ReasoningFinding[] {
  const findings: ReasoningFinding[] = [];

  // When boostActualAvailable is false, MAP was not in the scan list.
  // Emit an informational finding and skip all boost comparisons to prevent false analysis.
  const boostAvail = data.boostActualAvailable !== false;
  if (!boostAvail) {
    const maxDesired = data.boostDesired.length > 0 ? Math.max(...data.boostDesired) : 0;
    if (maxDesired > 0) {
      const toolName = getToolDisplayName(ctx.fileFormat);
      findings.push({
        id: 'boost-map-not-logged',
        category: 'boost',
        confidence: 'high',
        type: 'info',
        title: 'Actual Boost Not Available — Manifold Absolute Pressure Not Logged',
        reasoning:
          `Desired boost data is present (peak ${maxDesired.toFixed(1)} psi) but the Manifold Absolute Pressure (MAP) ` +
          `sensor was not included in the datalog. Without actual MAP readings, ` +
          `boost efficiency, underboost detection, and VGT tracking analysis cannot be performed. ` +
          `This is a data collection gap, not a vehicle fault.`,
        evidence: [
          `Peak desired boost: ${maxDesired.toFixed(1)} psi`,
          `Manifold Absolute Pressure: not present in datalog`,
        ],
        suggestion: `Add Manifold Absolute Pressure (MAP) to your ${toolName} configuration and re-log to enable full boost analysis.`,
      });
    }
    return findings;
  }

  const boost = data.boost.filter(v => v > 0);
  const boostDesired = data.boostDesired.filter(v => v > 0);
  const vane = data.turboVanePosition.filter(v => v > 0);
  const vaneDesired = data.turboVaneDesired.filter(v => v > 0);

  if (boost.length === 0) return findings;

  // Check if boost data is meaningful (not all zeros)
  const maxBoost = Math.max(...boost);
  if (maxBoost < 1) return findings;

  // VGT tracking analysis (only if both actual and desired are logged)
  if (vane.length > 20 && vaneDesired.length > 20) {
    let trackingErrors = 0;
    const minLen = Math.min(data.turboVanePosition.length, data.turboVaneDesired.length);
    for (let i = 0; i < minLen; i++) {
      const act = data.turboVanePosition[i];
      const des = data.turboVaneDesired[i];
      if (act > 1 && des > 1 && Math.abs(act - des) > 15) {
        trackingErrors++;
      }
    }
    const trackingErrorRate = (trackingErrors / minLen) * 100;

    if (trackingErrorRate > 10) {
      findings.push({
        id: 'vgt-tracking',
        category: 'boost',
        confidence: 'medium',
        type: 'warning',
        title: 'VGT Vane Tracking Deviation',
        reasoning:
          `The turbo VGT vanes deviated from commanded position by more than 15% in ` +
          `${trackingErrorRate.toFixed(1)}% of samples. This can indicate carbon buildup ` +
          `on the vanes, a sticking actuator, or a faulty boost control solenoid.`,
        evidence: [
          `Tracking errors (>15% deviation): ${trackingErrors} samples (${trackingErrorRate.toFixed(1)}%)`,
          `Max boost observed: ${maxBoost.toFixed(1)} psi`,
        ],
        suggestion: 'Clean VGT vanes with approved cleaner. Test boost control solenoid. Perform VGT learn procedure.',
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Beta Improvement Suggestions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a user-friendly display name for the datalog source tool.
 * Used throughout suggestions to avoid referencing the wrong tool.
 */
function getToolDisplayName(fileFormat: string): string {
  switch (fileFormat) {
    case 'bankspower': return 'Banks Power iDash';
    case 'efilive': return 'EFILive';
    case 'hptuners': return 'datalog tool';
    default: return 'datalog tool';
  }
}

function generateBetaImprovements(
  data: ProcessedMetrics,
  ctx: OperatingContext,
  findings: ReasoningFinding[],
  diagnostics: DiagnosticReport
): BetaImprovement[] {
  const improvements: BetaImprovement[] = [];
  const toolName = getToolDisplayName(ctx.fileFormat);

  // Suggestion 1: Additional PIDs that would improve diagnostic accuracy
  const missingPids: string[] = [];
  if (data.exhaustGasTemp.every(v => v === 0)) missingPids.push('Exhaust Gas Temperature (EGT)');
  if (data.oilPressure.every(v => v === 0)) missingPids.push('Oil Pressure');
  if (data.oilTemp.every(v => v === 0)) missingPids.push('Oil Temperature');
  if (data.transFluidTemp.every(v => v === 0)) missingPids.push('Transmission Fluid Temperature');

  if (missingPids.length > 0) {
    const hasEgt = missingPids.some(p => p.includes('EGT'));
    improvements.push({
      id: 'missing-pids',
      area: 'Data Coverage',
      observation: `The following parameters were not found in this datalog: ${missingPids.join(', ')}`,
      suggestion:
        `Adding these parameters to your ${toolName} configuration would enable more comprehensive ` +
        `diagnostics. EGT is particularly valuable for detecting fueling issues and DPF health. ` +
        `Oil pressure and temperature help identify lubrication system concerns under load.`,
      priority: hasEgt ? 'high' : 'medium',
    });
  }

  // Suggestion 2: TCC slip correlation with load
  const tccSlipFinding = findings.find(f => f.id === 'tcc-slip-analysis');
  if (tccSlipFinding) {
    improvements.push({
      id: 'tcc-load-correlation',
      area: 'Transmission Diagnostics',
      observation:
        'TCC slip events were detected under full lock command. Adding Transmission Line Pressure ' +
        'to the datalog would allow the analyzer to distinguish between a TCC solenoid fault ' +
        '(insufficient apply pressure) and mechanical converter wear.',
      suggestion:
        `Log Transmission Line Pressure alongside Converter Slip Speed and TCC Commanded Pressure ` +
        `in your ${toolName} configuration. ` +
        'If line pressure is normal but slip persists, the issue is mechanical (converter clutch). ' +
        'If line pressure is low, the issue is hydraulic (solenoid, valve body, or pump).',
      priority: 'high',
    });
  }

  // Suggestion 3: Sample rate improvement
  const logDurationSec = ctx.logDuration;
  const sampleCount = data.rpm.length;
  const sampleRateHz = logDurationSec > 0 ? sampleCount / logDurationSec : 0;

  if (sampleRateHz > 0 && sampleRateHz < 8) {
    improvements.push({
      id: 'sample-rate',
      area: 'Data Quality',
      observation: `Estimated sample rate: ~${sampleRateHz.toFixed(1)} Hz. Higher sample rates improve transient event detection.`,
      suggestion:
        `Increasing your ${toolName} sample rate to 10+ Hz will improve detection of ` +
        `brief slip events, rail pressure spikes, and boost transients. ` +
        `Short-duration events (<300ms) may be missed at lower sample rates.`,
      priority: 'medium',
    });
  }

  // Suggestion 4: Rail pressure PCV correlation
  const railFinding = findings.find(f => f.id === 'rail-pressure-analysis' && f.type === 'warning');
  if (railFinding) {
    improvements.push({
      id: 'rail-pcv-correlation',
      area: 'Fuel System Diagnostics',
      observation:
        'Rail pressure deviation correlates with Pressure Control Valve (PCV) current fluctuation. ' +
        'Adding PCV Measured Current alongside PCV Desired Current ' +
        'would allow the analyzer to detect PCV solenoid response lag.',
      suggestion:
        `Log both PCV Measured Current and PCV Desired Current in your ${toolName} configuration. ` +
        'A large gap between desired and measured current indicates a failing PCV solenoid. ' +
        'This is a key early indicator of high-pressure fuel pump failure on LML/L5P engines.',
      priority: 'high',
    });
  }

  return improvements;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Generator
// ─────────────────────────────────────────────────────────────────────────────

function generateSummary(
  findings: ReasoningFinding[],
  ctx: OperatingContext,
  diagnostics: DiagnosticReport
): string {
  const faults = findings.filter(f => f.type === 'fault');
  const warnings = findings.filter(f => f.type === 'warning');
  const improvements = findings.filter(f => f.type === 'improvement');

  const parts: string[] = [];

  if (ctx.warmupPhaseDetected) {
    parts.push(
      `Cold-start warmup detected (${ctx.minCoolantTempF.toFixed(0)}°F start). ` +
      `Warmup-phase data excluded from fault detection.`
    );
  }

  if (faults.length > 0) {
    parts.push(`${faults.length} confirmed fault(s) identified: ${faults.map(f => f.title).join('; ')}.`);
  }

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s) requiring attention: ${warnings.map(f => f.title).join('; ')}.`);
  }

  if (improvements.length > 0) {
    parts.push(`${improvements.length} improvement opportunity(ies) identified.`);
  }

  if (faults.length === 0 && warnings.length === 0) {
    parts.push('No critical faults or warnings detected by the reasoning engine.');
  }

  if (ctx.tccFullLockDetected) {
    parts.push(
      `TCC full lock command confirmed in ${ctx.tccFullLockSamples} samples ` +
      `(${ctx.tccPressureFormat === 'kpa_pcs' ? '≥1000 kPa' : '≥90% duty'}).`
    );
  }

  return parts.join(' ');
}
