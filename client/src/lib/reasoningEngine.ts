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
import { shouldApplyDieselAnalyzerRules } from './combustionInference';

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
  platform: string; // e.g. 'LB7', 'LLY', 'LBZ', 'LMM', 'LML', 'L5P'
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
  const dieselRules = shouldApplyDieselAnalyzerRules(data.vehicleMeta);

  // ── Step 1: Build operating context ──────────────────────────────────────
  const ctx = buildOperatingContext(data);

  // ── Step 2: TCC / Transmission reasoning ─────────────────────────────────
  findings.push(...analyzeTccBehavior(data, ctx, diagnostics));

  // ── Step 3: Rail pressure / fuel system reasoning (common-rail diesel) ───
  if (dieselRules) {
    findings.push(...analyzeRailPressure(data, ctx, diagnostics));
  }

  // ── Step 4: Thermal management reasoning ─────────────────────────────────
  findings.push(...analyzeThermalManagement(data, ctx));

  // ── Step 5: Boost / VGT correlation reasoning (VGT sections no-op without vane PIDs)
  findings.push(...analyzeBoostSystem(data, ctx));

  // ── Step 5b: Converter stall vs turbo spool (diesel turbo / smoke narrative)
  if (dieselRules) {
    findings.push(...analyzeConverterStallVsTurboSpool(data, ctx));
  }

  // ── Step 5c: Boost leak via MAF vs boost heuristics (diesel-calibrated)
  if (dieselRules) {
    findings.push(...analyzeBoostLeak(data, ctx));
  }

  // ── Step 5d: Performance recommendations ─────────────────────────────────
  findings.push(...generatePerformanceRecommendations(data, ctx, dieselRules));

  // ── Step 6: Beta improvement suggestions ─────────────────────────────────
  betaImprovements.push(...generateBetaImprovements(data, ctx, findings, diagnostics, dieselRules));

  // ── Step 7: Generate summary ──────────────────────────────────────────────
  const summary = generateSummary(findings, ctx, diagnostics);

  return {
    findings,
    operatingContext: ctx,
    betaImprovements,
    summary,
    engineVersion: 'V-OP Beta v1.0',
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
    platform: data.vehicleMeta?.engineType || '',
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
      'V-OP Beta: Slip pattern analysis uses ±25 RPM noise-floor filtering (logging tool signal noise), ' +
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

  // Detect channel format: most Duramax logs use FPR/PCV **mA** (~400–1800); some tools mislabel a column as "% duty"
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
  // EFILive: >900 mA swing = significant (raised from 200 — CP3 systems like LB7/LBZ
  // can show 800+ mA swings under normal operation); HP Tuners: >25% swing = significant
  const pcvFluctuating = isEFILivePcvMa ? pcvRange > 900 : pcvRange > 25;

  // Count samples with significant deviation (>5.5% from desired)
  // Raised from 5% to 5.5% to reduce false positives on acceptable deviation
  const significantDevCount = warmSamples.filter(s => Math.abs(s.devPct) > 5.5).length;
  const significantDevRate = (significantDevCount / warmSamples.length) * 100;

  // Only report if there's a meaningful pattern (raised from 10% to 15%)
  if (significantDevRate > 15 || pcvFluctuating) {
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

    if (pcvFluctuating && significantDevRate > 30) {
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
        'V-OP Beta: Rail pressure deviation is only evaluated at operating temperature (ECT >160°F). ' +
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

  // VGT-EGT correlation analysis
  // VGT position semantics: Higher % = more CLOSED = more boost.
  // Lower % = more OPEN = less boost = potentially HIGHER EGTs.
  // CRITICAL NUANCE: The relationship is NOT linear or simple.
  //   - Opening VGT: less energy extracted → hotter exhaust downstream, less boost.
  //   - Closing VGT: more backpressure (drive pressure). If the engine doesn't have
  //     enough heat/RPM to push through that backpressure, exhaust dwells longer and
  //     EGTs can ALSO rise. Closing VGT does NOT always mean cooler EGTs.
  //   - More boost does NOT always mean more power. If VGT is too closed for the
  //     operating conditions, the pressure ratio (boost-to-drive) gets out of hand,
  //     hurting horsepower and risking turbo overspeed.
  //   - Healthy boost-to-drive ratio: 1.5:1 to 2:1. Ratios approaching 1:1 or worse
  //     (drive > boost) = turbo is choking the engine.
  const egtVals = data.exhaustGasTemp.filter(v => v > 0);
  if (vane.length > 20 && egtVals.length > 20) {
    // Find periods where VGT is relatively open (< 40%) under load
    const minLen = Math.min(data.turboVanePosition.length, data.exhaustGasTemp.length, data.rpm.length);
    let openVgtHighEgt = 0;
    let closedVgtNormalEgt = 0;
    for (let i = 0; i < minLen; i++) {
      const vanePos = data.turboVanePosition[i];
      const egt = data.exhaustGasTemp[i];
      const rpmVal = data.rpm[i];
      if (rpmVal < 1500 || egt <= 0 || vanePos <= 0) continue;
      if (vanePos < 40 && egt > 1200) openVgtHighEgt++;
      if (vanePos > 60 && egt < 1200) closedVgtNormalEgt++;
    }

    if (openVgtHighEgt > 30) {
      findings.push({
        id: 'vgt-egt-correlation',
        category: 'thermal',
        confidence: 'medium',
        type: 'info',
        title: 'VGT Position Correlates with Elevated EGTs',
        reasoning:
          `When the VGT vanes are more open (< 40% closed), less exhaust energy is ` +
          `extracted by the turbine, which means the exhaust gas retains more heat. ` +
          `This log shows ${openVgtHighEgt} samples where VGT was open and EGT exceeded 1200F. ` +
          `Note: closing the VGT does NOT always fix high EGTs — if the VGT is too closed ` +
          `without enough heat or RPM, the boost-to-drive pressure ratio gets out of hand, ` +
          `which can hurt horsepower and risk turbo overspeed. The fix depends on the ` +
          `operating conditions and whether the VGT position makes sense for the current RPM/load.`,
        evidence: [
          `Open VGT + high EGT samples: ${openVgtHighEgt}`,
          `Closed VGT + normal EGT samples: ${closedVgtNormalEgt}`,
          `Max boost: ${maxBoost.toFixed(1)} psi`,
        ],
        suggestion: 'Evaluate VGT position relative to RPM and load. Closing the VGT more is not always the answer — if the boost-to-drive pressure ratio is already poor, more VGT closure can hurt power and risk turbo overspeed. Discuss VGT mapping and boost targets with your tuner.',
      });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Converter Stall vs Turbo Spool Mismatch Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect when the torque converter stall speed at WOT from a stop is too low
 * to get the turbocharger into its efficient spool range. This is especially
 * relevant for vehicles with larger aftermarket turbochargers that need higher
 * RPM to begin producing boost.
 *
 * IMPORTANT: We never state the stall is definitively "too tight" — we suggest
 * it as a possibility that warrants investigation.
 */
function analyzeConverterStallVsTurboSpool(
  data: ProcessedMetrics,
  ctx: OperatingContext
): ReasoningFinding[] {
  const findings: ReasoningFinding[] = [];
  const rpm = data.rpm;
  const throttle = data.throttlePosition;
  const boost = data.boost;
  const gear = data.currentGear || [];
  const vss = data.vehicleSpeed;

  if (rpm.length === 0 || throttle.length === 0 || boost.length === 0) return findings;

  // Find WOT launch events: throttle > 85%, gear 1, vehicle speed < 15 mph (from a stop)
  // Look for the peak RPM during these events before the vehicle starts moving
  const wotLaunches: Array<{
    startIdx: number;
    peakRpm: number;
    peakBoostDuringStall: number;
    rpmAtFirstBoost: number;
    boostBuildDelay: number; // samples from WOT to first meaningful boost
  }> = [];

  let inWotLaunch = false;
  let launchStart = -1;
  let peakRpm = 0;
  let peakBoostDuringStall = 0;
  let firstBoostIdx = -1;

  for (let i = 0; i < rpm.length; i++) {
    const isWot = throttle[i] > 85;
    const isLowGear = gear.length > 0 ? (gear[i] === 1 || gear[i] === 2) : true;
    const isLowSpeed = vss[i] < 15;

    if (isWot && isLowGear && isLowSpeed && !inWotLaunch) {
      inWotLaunch = true;
      launchStart = i;
      peakRpm = rpm[i];
      peakBoostDuringStall = boost[i];
      firstBoostIdx = -1;
    } else if (inWotLaunch) {
      if (!isWot || vss[i] > 30) {
        // End of launch event
        if (launchStart >= 0 && (i - launchStart) > 5) {
          wotLaunches.push({
            startIdx: launchStart,
            peakRpm,
            peakBoostDuringStall,
            rpmAtFirstBoost: firstBoostIdx >= 0 ? rpm[firstBoostIdx] : 0,
            boostBuildDelay: firstBoostIdx >= 0 ? firstBoostIdx - launchStart : i - launchStart,
          });
        }
        inWotLaunch = false;
        launchStart = -1;
      } else {
        if (rpm[i] > peakRpm) peakRpm = rpm[i];
        if (boost[i] > peakBoostDuringStall) peakBoostDuringStall = boost[i];
        if (firstBoostIdx < 0 && boost[i] > 3) firstBoostIdx = i;
      }
    }
  }

  if (wotLaunches.length === 0) return findings;

  // ── Analyze the launches for turbo spool delay / converter stall mismatch ──
  // The key insight: we don't just look at peak RPM during the event (the turbo
  // eventually spools and RPM climbs). Instead we look at:
  //  1. rpmAtFirstBoost — what RPM did the engine need to reach before the turbo
  //     started producing meaningful boost (>3 psi)? Higher = more lag.
  //  2. boostBuildDelay — how many samples from WOT to first meaningful boost?
  //     Longer = more time spent fueling without airflow (smoke, lag).
  //  3. The RPM at the START of the WOT event (initial stall RPM) — if the
  //     converter doesn't flash high enough, the turbo never enters its spool range.

  const maxBoostOverall = Math.max(...boost.filter(v => v > 0));
  const sampleRate = 10; // assumed 10 Hz

  // Compute averages across all launches
  const avgRpmAtFirstBoost = wotLaunches
    .filter(l => l.rpmAtFirstBoost > 0)
    .reduce((s, l, _, a) => s + l.rpmAtFirstBoost / a.length, 0);
  const avgBoostBuildDelay = wotLaunches.reduce((s, l) => s + l.boostBuildDelay, 0) / wotLaunches.length;
  const avgBoostBuildDelaySec = avgBoostBuildDelay / sampleRate;
  const avgStartRpm = wotLaunches.reduce((s, l) => s + rpm[l.startIdx], 0) / wotLaunches.length;

  // Trigger conditions (any of these indicates a potential issue):
  // A) Turbo doesn't produce boost until engine is above 1800 RPM (high spool threshold)
  const highSpoolThreshold = avgRpmAtFirstBoost > 1800;
  // B) Boost build delay is more than 1.0 seconds from WOT (extended lag)
  const extendedBoostDelay = avgBoostBuildDelaySec > 1.0;
  // C) Start RPM at WOT is low (converter not flashing high) AND boost is delayed
  const lowStartRpm = avgStartRpm < 1500;

  // We need at least one strong indicator
  const hasSpoolIssue = highSpoolThreshold || extendedBoostDelay;

  if (hasSpoolIssue) {
    const evidence: string[] = [
      `WOT launch events analyzed: ${wotLaunches.length}`,
      `Average RPM at WOT start (converter stall flash): ${avgStartRpm.toFixed(0)} RPM`,
    ];

    if (avgRpmAtFirstBoost > 0) {
      evidence.push(`Average RPM when boost first exceeded 3 psi: ${avgRpmAtFirstBoost.toFixed(0)} RPM`);
    }
    evidence.push(`Average time from WOT to first meaningful boost: ${avgBoostBuildDelaySec.toFixed(1)} seconds (${avgBoostBuildDelay.toFixed(0)} samples)`);
    evidence.push(`Peak boost observed in log: ${maxBoostOverall.toFixed(1)} psi`);

    for (const launch of wotLaunches.slice(0, 3)) {
      const startRpm = rpm[launch.startIdx];
      const delaySec = launch.boostBuildDelay / sampleRate;
      evidence.push(
        `Launch event: start RPM ${startRpm.toFixed(0)}, peak RPM ${launch.peakRpm.toFixed(0)}, ` +
        `first boost (>3 psi) at ${launch.rpmAtFirstBoost > 0 ? launch.rpmAtFirstBoost.toFixed(0) + ' RPM' : 'N/A'}, ` +
        `boost delay ${delaySec.toFixed(1)}s, peak boost ${launch.peakBoostDuringStall.toFixed(1)} psi`
      );
    }

    // Build reasoning based on what we observed
    let reasoningText =
      `During WOT launches from a stop, the turbocharger required approximately ` +
      `${avgBoostBuildDelaySec.toFixed(1)} seconds to begin producing meaningful boost (>3 psi). `;

    if (avgRpmAtFirstBoost > 0) {
      reasoningText +=
        `The engine needed to reach approximately ${avgRpmAtFirstBoost.toFixed(0)} RPM before ` +
        `the turbo started building pressure. `;
    }

    if (lowStartRpm) {
      reasoningText +=
        `The converter stall flash speed at WOT was approximately ${avgStartRpm.toFixed(0)} RPM, ` +
        `which may be below the turbo's effective spool range. If this vehicle is equipped with ` +
        `a larger aftermarket turbocharger that comes on around 2000+ RPM, a converter stall ` +
        `speed that doesn't reach that range could contribute to sluggish off-the-line response ` +
        `and excessive smoke from fueling without adequate airflow. `;
    }

    if (extendedBoostDelay) {
      reasoningText +=
        `The extended boost build time (${avgBoostBuildDelaySec.toFixed(1)}s) means the engine ` +
        `is fueling at WOT for a significant period before the turbo provides matching airflow. ` +
        `This can cause visible smoke and a perception of lag. `;
    }

    reasoningText +=
      `This is one possible contributing factor — it does not necessarily mean the converter is ` +
      `the sole issue, but the data suggests the turbo is slow to respond during the initial ` +
      `launch phase. A boost leak could compound this by further reducing the turbo's ability ` +
      `to build pressure.`;

    // Determine confidence based on how many indicators are present
    const indicatorCount = [highSpoolThreshold, extendedBoostDelay, lowStartRpm].filter(Boolean).length;
    const confidence = indicatorCount >= 2 ? 'medium' : 'low';

    findings.push({
      id: 'converter-stall-turbo-mismatch',
      category: 'transmission',
      confidence,
      type: 'warning',
      title: 'Possible Converter Stall / Turbo Spool Mismatch — Extended Boost Build Time',
      reasoning: reasoningText,
      evidence,
      suggestion:
        'Consider evaluating the torque converter stall speed relative to the turbocharger\'s ' +
        'effective spool range. Note that converter stall ratings (e.g. "2200 stall") are measured ' +
        'under specific conditions — actual flash stall from a dead stop can be significantly lower ' +
        'than the rated number. A converter with a higher stall speed matched to the turbo\'s ' +
        'power curve may improve off-the-line response. ' +
        'Also check for boost leaks that could compound the issue (pressurize the charge system to ' +
        '40 PSI and watch for leakdown). If the vehicle has a larger turbo, a stall converter in the ' +
        '2200-2800 RPM range (matched to the turbo) is common practice. ' +
        'If a boost leak is also present, be aware that the turbo shaft speeds can get very high — ' +
        'the turbo spins harder trying to compensate for pressure lost through the leak, which can ' +
        'overspeed the turbo. A tight stall alone does not overspeed the turbo, but a boost leak will. ' +
        'MAF limiting (reducing fuel on the bottom end) can reduce smoke but may increase lag since ' +
        'there is less heat energy to drive the turbo.',
      betaNote:
        'V-OP Beta: Converter stall analysis examines WOT launch events (throttle >85%, ' +
        'gear 1-2, VSS <15 mph) and measures the delay from WOT to first meaningful boost ' +
        'production, as well as the RPM at which the turbo begins spooling. ' +
        'This finding is presented as a possibility, not a definitive diagnosis — multiple ' +
        'factors (boost leaks, fueling, turbo sizing) can produce similar symptoms.',
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boost Leak Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect possible boost leaks by analyzing the relationship between MAF
 * (airflow), RPM, and peak boost pressure. A vehicle with a larger turbo
 * should be pegging the MAP sensor, so low peak boost with adequate airflow
 * suggests a leak in the charge system.
 *
 * Also considers compound effects: a tight converter stall + boost leak
 * exaggerate each other — the turbo can't spool efficiently at low RPM,
 * and whatever boost it does make is leaking out.
 */
function analyzeBoostLeak(
  data: ProcessedMetrics,
  ctx: OperatingContext
): ReasoningFinding[] {
  const findings: ReasoningFinding[] = [];
  const boost = data.boost;
  const maf = data.maf;
  const rpm = data.rpm;
  const throttle = data.throttlePosition;

  if (boost.length === 0 || maf.length === 0) return findings;
  if (data.boostActualAvailable === false) return findings;

  const maxBoost = Math.max(...boost.filter(v => v > 0));
  if (maxBoost < 1) return findings;

  // Find WOT samples (throttle > 85%) to analyze boost under load
  const wotSamples: Array<{boost: number; maf: number; rpm: number}> = [];
  for (let i = 0; i < rpm.length; i++) {
    if (throttle[i] > 85 && rpm[i] > 1500) {
      wotSamples.push({ boost: boost[i], maf: maf[i], rpm: rpm[i] });
    }
  }

  if (wotSamples.length < 10) return findings;

  const peakWotBoost = Math.max(...wotSamples.map(s => s.boost));
  const peakWotMaf = Math.max(...wotSamples.map(s => s.maf));
  const avgWotMaf = wotSamples.reduce((s, w) => s + w.maf, 0) / wotSamples.length;
  const peakWotRpm = Math.max(...wotSamples.map(s => s.rpm));

  // Heuristic: If MAF is reasonably high (engine is getting fuel and air request)
  // but boost is suspiciously low, suspect a leak.
  //
  // IMPORTANT: Must account for OEM MAP sensor limits per platform!
  // OEM MAP sensor gauge maximums (approximate):
  //   LB7 (2001-2004):   ~3 bar raw, ECU boost PID caps ~22-24 psi, raw MAP kPa ~29 psi gauge
  //   LLY (2004.5-2005): ~3 bar, reads to ~37 psi gauge
  //   LBZ (2006-2007):   ~3 bar, reads to ~37 psi gauge
  //   LMM (2007.5-2010): ~3 bar, reads to ~37 psi gauge
  //   LML (2011-2016):   ~3 bar, reads to ~37 psi gauge
  //   L5P (2017+):       ~3 bar, reads to ~37 psi gauge
  // Aftermarket 4-bar or 5-bar or 10-bar sensors read higher.
  // If peak boost is near the sensor limit, the sensor is SATURATED
  // and we cannot conclude boost is "low" — the turbo may be making more than the sensor reads.
  //
  // We use multiple indicators:
  // 1. Peak boost well below sensor limit with high MAF = possible leak
  // 2. Boost plateau: boost doesn't climb with RPM despite more airflow
  // 3. MAF-to-boost ratio as secondary indicator
  // But NONE of these apply if the MAP sensor is pegged.

  // MAP sensor saturation detection (data-driven, no platform assumption needed)
  // Instead of guessing the sensor bar rating, detect saturation from the data itself:
  // If the peak boost value hits a hard ceiling (multiple samples at the same max value),
  // the sensor is saturated and we cannot conclude boost is "low".
  //
  // Known OEM MAP sensor gauge ceilings:
  //   LB7 (2001-2004):   ~29 psi gauge (3-bar sensor, raw MAP kPa)
  //   LLY-LML (2004-2016): ~37 psi gauge
  //   L5P (2017+):       ~37 psi gauge
  // But aftermarket sensors (4-bar, 5-bar, 10-bar) read much higher.
  //
  // Detection: count how many WOT samples are within 1 psi of peak boost.
  // If >20% of WOT samples are at the ceiling, the sensor is likely maxed out.
  const nearPeakSamples = wotSamples.filter(s => s.boost >= (peakWotBoost - 1.0)).length;
  const nearPeakRatio = nearPeakSamples / wotSamples.length;
  const sensorSaturated = nearPeakRatio > 0.20 && peakWotBoost > 20;

  if (sensorSaturated) {
    // Sensor appears to be pegged — many WOT samples hitting the same ceiling.
    // The turbo is making at least as much boost as the sensor can read.
    // Cannot determine if there's a leak from boost pressure alone.
    return findings;
  }

  // Determine if boost seems low for the airflow being produced
  const mafHighEnough = peakWotMaf > 40; // lb/min — indicates turbo is moving air
  const boostSuspiciouslyLow = peakWotBoost < 25; // well below 3-bar sensor limit

  // MAF-to-boost ratio: how many lb/min of air per psi of boost?
  // A healthy system typically shows 1.5-2.0 lb/min per psi at peak.
  // Higher ratios (>2.5) suggest air is being produced but not contained.
  const mafToBoostRatio = peakWotBoost > 1 ? peakWotMaf / peakWotBoost : 0;
  const highMafToBoostRatio = mafToBoostRatio > 2.5; // raised from 2.2 to reduce false positives

  // Also check: does boost plateau early and not climb with increasing RPM?
  // This is a classic leak signature — the turbo makes more air but it escapes.
  const highRpmSamples = wotSamples.filter(s => s.rpm > 2500);
  const midRpmSamples = wotSamples.filter(s => s.rpm >= 1800 && s.rpm <= 2500);
  let boostPlateaus = false;
  if (highRpmSamples.length > 5 && midRpmSamples.length > 5) {
    const avgHighBoost = highRpmSamples.reduce((s, w) => s + w.boost, 0) / highRpmSamples.length;
    const avgMidBoost = midRpmSamples.reduce((s, w) => s + w.boost, 0) / midRpmSamples.length;
    // If boost doesn't increase much from mid to high RPM despite more airflow
    if (avgMidBoost > 5 && (avgHighBoost - avgMidBoost) < 3) {
      boostPlateaus = true;
    }
  }

  if ((mafHighEnough && boostSuspiciouslyLow) || boostPlateaus || (mafHighEnough && highMafToBoostRatio)) {
    const evidence: string[] = [
      `Peak boost under WOT: ${peakWotBoost.toFixed(1)} psi`,
      `Peak MAF under WOT: ${peakWotMaf.toFixed(1)} lb/min`,
      `Average MAF under WOT: ${avgWotMaf.toFixed(1)} lb/min`,
      `Peak RPM under WOT: ${peakWotRpm.toFixed(0)} RPM`,
    ];

    if (boostPlateaus) {
      evidence.push('Boost pressure plateaus between mid and high RPM despite increasing airflow — classic leak signature');
    }

    if (mafHighEnough && boostSuspiciouslyLow) {
      evidence.push(
        `MAF indicates the turbo is moving adequate air (${peakWotMaf.toFixed(1)} lb/min) ` +
        `but peak boost is only ${peakWotBoost.toFixed(1)} psi — air may be escaping before the intake manifold`
      );
    }

    // Check if we also found a converter stall mismatch — compound diagnosis
    const hasStallMismatch = data.rpm.length > 0; // will be cross-referenced at render time
    // We note the compound effect in the reasoning regardless

    findings.push({
      id: 'boost-leak-suspicion',
      category: 'boost',
      confidence: boostPlateaus ? 'medium' : 'low',
      type: 'warning',
      title: 'Possible Boost Leak — Low Peak Boost for Observed Airflow',
      reasoning:
        `The turbocharger appears to be producing adequate airflow (peak MAF ${peakWotMaf.toFixed(1)} lb/min) ` +
        `but peak boost pressure is only ${peakWotBoost.toFixed(1)} psi under WOT conditions. ` +
        `On a vehicle with a larger turbocharger, the MAP sensor should be approaching its maximum ` +
        `reading (typically 30-36 psi). The lower-than-expected boost suggests air may be escaping ` +
        `the charge system before reaching the intake manifold. ` +
        (boostPlateaus
          ? 'Additionally, boost pressure plateaus between mid and high RPM despite increasing ' +
            'airflow — this is a classic boost leak signature where the turbo produces more air ' +
            'at higher RPM but the leak prevents pressure from building further. '
          : '') +
        `If a converter stall mismatch is also present, the two issues compound each other: ` +
        `the turbo cannot spool efficiently at low RPM due to the stall speed, and whatever ` +
        `boost it does produce is reduced by the leak. This combination can make both problems ` +
        `appear worse than either would be in isolation.`,
      evidence,
      suggestion:
        'IMPORTANT: Before assuming a boost leak, check if the vehicle has an aftermarket intake ' +
        'or if the OEM MAF baffle has been removed. A larger pre-MAF tube diameter causes the ' +
        'MAF sensor to under-read (lower air velocity across the heated element = lower reported ' +
        'airflow), which makes the smoke limiter engage prematurely and limits power. In this case, ' +
        'the fix is a MAF scaling tune revision, not a mechanical repair. If the intake is stock, ' +
        'perform a boost leak test on the charge system. Check all intercooler boots, clamps, ' +
        'intercooler end tanks, up-pipe connections, and turbo outlet. Even a small leak can ' +
        'significantly reduce peak boost. If the vehicle also has a converter stall concern, ' +
        'address the boost leak first — restoring full boost pressure may partially compensate ' +
        'for a lower stall speed by allowing the turbo to build pressure more quickly.',
      betaNote:
        'V-OP Beta: Boost leak detection compares peak MAF (airflow) against peak boost ' +
        'pressure under WOT conditions. A secondary check looks for boost plateauing between ' +
        'mid and high RPM despite increasing airflow. The compound effect with converter stall ' +
        'mismatch is noted when both conditions are detected in the same log.',
    });
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

// ─────────────────────────────────────────────────────────────────────────────
// Performance Recommendations
// Analyzes the datalog to provide actionable performance improvement suggestions
// based on observed engine behavior, tuning parameters, and operating conditions.
// ─────────────────────────────────────────────────────────────────────────────

function generatePerformanceRecommendations(
  data: ProcessedMetrics,
  ctx: OperatingContext,
  dieselRules: boolean
): ReasoningFinding[] {
  const findings: ReasoningFinding[] = [];

  // ── Injector pulse width analysis (direct-injection diesel framing) ──
  const ipwNonZero = dieselRules ? data.injectorPulseWidth.filter(v => v > 0) : [];
  const maxIpw = ipwNonZero.length > 0 ? Math.max(...ipwNonZero) : 0;
  const avgIpw = ipwNonZero.length > 0 ? ipwNonZero.reduce((a, b) => a + b, 0) / ipwNonZero.length : 0;

  // Solenoid injectors: 3000 µs is basically maxed out, 2500+ is where you start paying attention
  // Piezo injectors: > 1.5 ms is race-level
  const isPiezo = dieselRules && (ctx.platform === 'LML' || ctx.platform === 'L5P');
  const raceThreshold = isPiezo ? 1.5 : 3.0;
  const highThreshold = isPiezo ? 1.2 : 2.5;

  if (maxIpw > raceThreshold) {
    findings.push({
      id: 'perf-high-ipw',
      category: 'fuel_system',
      confidence: 'high',
      type: 'info',
      title: 'Race-Level Injector Pulse Width Detected',
      reasoning:
        `Peak injector pulse width of ${maxIpw.toFixed(2)} ${isPiezo ? 'ms' : 'µs'} indicates ` +
        `race-level fueling. At this level, EGTs will be elevated and injector life may be reduced. ` +
        `For sustained high-performance use, consider upgrading to larger injectors that can deliver ` +
        `the same fuel volume at a shorter pulse width, reducing thermal stress on the injector tips.`,
      evidence: [
        `Peak injector pulse width: ${maxIpw.toFixed(2)} ${isPiezo ? 'ms' : 'µs'}`,
        `Average pulse width: ${avgIpw.toFixed(2)} ${isPiezo ? 'ms' : 'µs'}`,
        `Platform: ${ctx.platform} (${isPiezo ? 'piezo' : 'solenoid'} injectors)`,
      ],
      suggestion: isPiezo
        ? 'For builds over 600 HP, consider aftermarket piezo injectors with higher flow rates to reduce pulse width and EGTs.'
        : 'For builds over 500 HP, consider larger solenoid injectors (e.g., SAC nozzles) to reduce pulse width below 2500 µs. 3000 µs is considered basically maxed out on a solenoid injector.',
    });
  } else if (maxIpw > highThreshold) {
    findings.push({
      id: 'perf-moderate-ipw',
      category: 'fuel_system',
      confidence: 'medium',
      type: 'info',
      title: 'High Injector Pulse Width — Monitor EGTs',
      reasoning:
        `Peak injector pulse width of ${maxIpw.toFixed(2)} ${isPiezo ? 'ms' : 'µs'} is in the ` +
        `high-performance range. This is typical for moderate tunes but approaching the limit where ` +
        `injector efficiency drops and EGTs rise. Monitor exhaust gas temperatures closely.`,
      evidence: [
        `Peak injector pulse width: ${maxIpw.toFixed(2)} ${isPiezo ? 'ms' : 'µs'}`,
        `Average pulse width: ${avgIpw.toFixed(2)} ${isPiezo ? 'ms' : 'µs'}`,
      ],
      suggestion: 'Keep EGTs below 1475°F sustained. If EGTs are consistently above 1475°F for more than 14 seconds, discuss injector sizing and boost targets with your tuner.',
    });
  }

  // ── Rail pressure headroom analysis (CP3 / common-rail diesel) ──
  const rpActual = dieselRules ? data.railPressureActual.filter(v => v > 0) : [];
  const rpDesired = dieselRules ? data.railPressureDesired.filter(v => v > 0) : [];
  const maxRpActual = rpActual.length > 0 ? Math.max(...rpActual) : 0;
  const maxRpDesired = rpDesired.length > 0 ? Math.max(...rpDesired) : 0;

  // Detect if rail pressure is at the CP3 pump's physical limit
  // Stock CP3 typically maxes out around 26,000-27,000 psi
  const cp3Limit = 26500;
  if (dieselRules && maxRpActual > cp3Limit && maxRpDesired > maxRpActual + 500) {
    findings.push({
      id: 'perf-cp3-limit',
      category: 'fuel_system',
      confidence: 'medium',
      type: 'improvement',
      title: 'CP3 Pump Approaching Maximum Output',
      reasoning:
        `Peak rail pressure of ${maxRpActual.toFixed(0)} psi with desired at ${maxRpDesired.toFixed(0)} psi ` +
        `suggests the CP3 injection pump is near its physical output limit. The pump cannot deliver ` +
        `the fuel volume the tune is requesting at this pressure. This limits peak power and can ` +
        `cause rail pressure droop under sustained load.`,
      evidence: [
        `Peak actual rail pressure: ${maxRpActual.toFixed(0)} psi`,
        `Peak desired rail pressure: ${maxRpDesired.toFixed(0)} psi`,
        `Deficit: ${(maxRpDesired - maxRpActual).toFixed(0)} psi`,
      ],
      suggestion: 'Consider a CP3 upgrade (stroker pump or twin CP3 kit) to support higher fuel demands. A lift pump upgrade may also help if not already installed.',
    });
  }

  // ── Boost-to-power efficiency (Duramax-oriented thresholds) ──
  const maxBoost = data.stats.boostMax;
  const maxHp = Math.max(data.stats.hpTorqueMax, data.stats.hpMafMax, data.stats.hpAccelMax);
  if (dieselRules && maxBoost > 0 && maxHp > 100) {
    const hpPerPsi = maxHp / maxBoost;
    // Typical efficiency: 10-15 HP/psi for stock turbo, 15-25 for aftermarket
    if (hpPerPsi < 8 && maxBoost > 25) {
      findings.push({
        id: 'perf-low-boost-efficiency',
        category: 'boost',
        confidence: 'medium',
        type: 'improvement',
        title: 'Low Boost-to-Power Efficiency',
        reasoning:
          `At ${maxBoost.toFixed(1)} psi peak boost, the estimated ${maxHp.toFixed(0)} HP yields ` +
          `only ${hpPerPsi.toFixed(1)} HP per psi of boost. This is below typical efficiency for ` +
          `a performance-tuned Duramax. Possible causes include turbo inefficiency at this flow rate, ` +
          `excessive backpressure, or intercooler heat soak reducing charge density.`,
        evidence: [
          `Peak boost: ${maxBoost.toFixed(1)} psi`,
          `Estimated peak HP: ${maxHp.toFixed(0)}`,
          `Efficiency: ${hpPerPsi.toFixed(1)} HP/psi`,
        ],
        suggestion: 'Check intercooler efficiency (intake air temps). If turbo is stock and boost is high, an aftermarket turbo may deliver more power at the same boost level.',
      });
    }
  }

  // ── EGT management recommendations (diesel thermal limits; gas EGT differs) ──
  const egtNonZero = dieselRules ? data.exhaustGasTemp.filter(v => v > 0) : [];
  const maxEgt = egtNonZero.length > 0 ? Math.max(...egtNonZero) : 0;
  const avgEgt = egtNonZero.length > 10
    ? egtNonZero.reduce((a, b) => a + b, 0) / egtNonZero.length
    : 0;

  if (dieselRules && maxEgt > 1475 && avgEgt > 900) {
    findings.push({
      id: 'perf-high-egt',
      category: 'thermal',
      confidence: 'high',
      type: 'warning',
      title: 'Elevated Exhaust Gas Temperatures',
      reasoning:
        `Peak EGT of ${maxEgt.toFixed(0)}°F with an average of ${avgEgt.toFixed(0)}°F indicates ` +
        `significant thermal loading. Sustained EGTs above 1475°F accelerate turbo wear and reduce injector life. ` +
        `Brief spikes to 1800-2000°F are acceptable during racing pulls (<12 seconds), but sustained temps at this level indicate a problem. ` +
        (maxEgt > 1800
          ? `At ${maxEgt.toFixed(0)}°F, this is racing-level heat — acceptable for short drag passes but not for sustained pulls.`
          : `Current levels should be monitored during towing or sustained pulls.`),
      evidence: [
        `Peak EGT: ${maxEgt.toFixed(0)}°F`,
        `Average EGT: ${avgEgt.toFixed(0)}°F`,
        `Max RPM: ${ctx.maxRpmObserved.toFixed(0)}`,
      ],
      suggestion: maxEgt > 1500
        ? 'Reduce fueling or increase airflow (larger turbo, better intercooler). Consider water-methanol injection for sustained high-load use.'
        : 'Monitor EGTs during towing or sustained pulls. Ensure intercooler is not heat-soaked.',
    });
  }

  // ── Intake air temperature analysis ──
  const iatNonZero = data.intakeAirTemp.filter(v => v > 0);
  const maxIat = iatNonZero.length > 0 ? Math.max(...iatNonZero) : 0;
  if (maxIat > 160 && maxBoost > 15) {
    findings.push({
      id: 'perf-high-iat',
      category: 'thermal',
      confidence: 'medium',
      type: 'improvement',
      title: 'High Intake Air Temperature Under Boost',
      reasoning:
        `Intake air temperature reached ${maxIat.toFixed(0)}°F while boost was above 15 psi. ` +
        `Hot intake air reduces charge density, lowering power output and increasing detonation risk. ` +
        `Every 10°F reduction in IAT can yield approximately 1% more power.`,
      evidence: [
        `Peak IAT: ${maxIat.toFixed(0)}°F`,
        `Peak boost: ${maxBoost.toFixed(1)} psi`,
      ],
      suggestion: 'Upgrade intercooler to a larger core or add water-methanol injection. Ensure intercooler piping is not kinked or restricted.',
    });
  }

  // ── Torque converter matching ──
  const slipNonZero = data.converterSlip.filter(v => Math.abs(v) > 5);
  const maxSlip = slipNonZero.length > 0 ? Math.max(...slipNonZero.map(Math.abs)) : 0;
  if (maxSlip > 300 && maxHp > 400) {
    findings.push({
      id: 'perf-converter-slip',
      category: 'transmission',
      confidence: 'medium',
      type: 'improvement',
      title: 'Torque Converter Slip at High Power',
      reasoning:
        `Peak converter slip of ${maxSlip.toFixed(0)} RPM at an estimated ${maxHp.toFixed(0)} HP ` +
        `indicates the torque converter may not be matched to the power level. Excessive slip ` +
        `generates heat in the transmission fluid and wastes power. For high-performance builds, ` +
        `the converter stall speed should match the turbo's spool point for optimal launch and ` +
        `minimal slip once locked.`,
      evidence: [
        `Peak converter slip: ${maxSlip.toFixed(0)} RPM`,
        `Estimated peak HP: ${maxHp.toFixed(0)}`,
      ],
      suggestion: 'Consider a performance torque converter with a stall speed matched to your turbo setup. For drag racing, a higher stall (2800-3200 RPM) helps launch; for towing, a lower stall (1800-2200 RPM) reduces heat.',
    });
  }

  return findings;
}

function generateBetaImprovements(
  data: ProcessedMetrics,
  ctx: OperatingContext,
  findings: ReasoningFinding[],
  diagnostics: DiagnosticReport,
  dieselRules: boolean
): BetaImprovement[] {
  const improvements: BetaImprovement[] = [];
  const toolName = getToolDisplayName(ctx.fileFormat);

  // Suggestion 1: Additional PIDs that would improve diagnostic accuracy
  const missingPids: string[] = [];
  // LB7 does not have factory EGT sensors — don't suggest adding EGT for LB7
  // Detect LB7 from platform field OR from PID prefix (PCM.* = LB7/LLY era)
  const platformLower = ctx.platform?.toLowerCase() || '';
  const isLb7ByPlatform = platformLower.includes('lb7');
  // If no vehicleMeta, detect from file format: EFILive with PCM prefix = LB7/LLY (no factory EGT)
  const isLb7ByPids = ctx.fileFormat === 'efilive' && data.fileFormat === 'efilive' &&
    data.exhaustGasTemp.every(v => v === 0) && data.turboVanePosition.every(v => v === 0);
  const hasNoFactoryEgt = isLb7ByPlatform || isLb7ByPids;
  if (dieselRules && data.exhaustGasTemp.every(v => v === 0) && !hasNoFactoryEgt) {
    missingPids.push('Exhaust Gas Temperature (EGT)');
  }
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
        `diagnostics.` +
        (hasEgt && dieselRules ? ` EGT is particularly valuable for detecting fueling issues and exhaust system health.` : '') +
        ` Oil pressure and temperature help identify lubrication system concerns under load.`,
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
    const dieselSampleDetail = dieselRules
      ? 'brief slip events, rail pressure spikes, and boost transients. '
      : 'brief TCC slip events and boost transients. ';
    improvements.push({
      id: 'sample-rate',
      area: 'Data Quality',
      observation: `Estimated sample rate: ~${sampleRateHz.toFixed(1)} Hz. Higher sample rates improve transient event detection.`,
      suggestion:
        `Increasing your ${toolName} sample rate to 10+ Hz will improve detection of ` +
        dieselSampleDetail +
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
    parts.push('No critical faults or warnings detected.');
  }

  if (ctx.tccFullLockDetected) {
    parts.push(
      `TCC full lock command confirmed in ${ctx.tccFullLockSamples} samples ` +
      `(${ctx.tccPressureFormat === 'kpa_pcs' ? '≥1000 kPa' : '≥90% duty'}).`
    );
  }

  // Include DTCs from the datalog session in the summary
  if (diagnostics.dtcs && diagnostics.dtcs.total > 0) {
    const dtcParts: string[] = [];
    if (diagnostics.dtcs.stored.length > 0) dtcParts.push(`Stored: ${diagnostics.dtcs.stored.join(', ')}`);
    if (diagnostics.dtcs.pending.length > 0) dtcParts.push(`Pending: ${diagnostics.dtcs.pending.join(', ')}`);
    if (diagnostics.dtcs.permanent.length > 0) dtcParts.push(`Permanent: ${diagnostics.dtcs.permanent.join(', ')}`);
    parts.push(`Vehicle DTCs at time of datalog (${diagnostics.dtcs.total}): ${dtcParts.join(' | ')}. These should be considered alongside the data analysis.`);
  }

  return parts.join(' ');
}
