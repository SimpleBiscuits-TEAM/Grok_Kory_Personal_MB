/**
 * Vehicle Health Report Generator
 * Uses real-world operating thresholds sourced from GM/Ford/RAM service data and ECU calibrations.
 *
 * L5P Real-World Thresholds (all values in °F or PSI as noted):
 *  - Engine Coolant Temp: Normal 180–210°F | Warning >220°F | Critical >230°F
 *  - Engine Oil Temp:     Normal 180–230°F | Warning >240°F | Critical >260°F
 *  - Engine Oil Pressure: Normal 25–80 PSI | Warning <20 PSI at idle or <30 PSI at speed
 *  - Trans Fluid Temp:    Normal 100–200°F | Warning >220°F | Critical >240°F
 *  - EGT (Turbo Inlet):   Normal <1500°F  | Warning >1650°F for >5s | Sensor fault >1800°F
 *  - EGT (DOC Inlet):     Normal <900°F   | Warning >1000°F
 *  - MAF at idle:         Normal 2–6 lb/min
 *  - Boost:               Normal 0–48 PSIG gauge (L5P peaks ~48 PSIG stock; atmospheric ~14.7 PSI subtracted)
 */

import { ProcessedMetrics, VehicleMeta } from './dataProcessor';
import { VehicleInfo } from './vinLookup';

export interface HealthReportData {
  overallStatus: 'excellent' | 'good' | 'fair' | 'poor';
  overallScore: number;
  timestamp: Date;
  vehicleInfo?: VehicleInfo;
  engineHealth: EngineHealthSection;
  fuelSystem: FuelSystemSection;
  transmission: TransmissionSection;
  thermalManagement: ThermalSection;
  diagnosticSummary: DiagnosticSummarySection;
  recommendations: string[];
}

interface EngineHealthSection {
  score: number;
  status: string;
  turbochargerStatus: string;
  egtStatus: string;
  mafStatus: string;
  findings: string[];
}

interface FuelSystemSection {
  score: number;
  status: string;
  pressureRegulation: string;
  findings: string[];
}

interface TransmissionSection {
  score: number;
  status: string;
  converterSlipStatus: string;
  findings: string[];
}

interface ThermalSection {
  score: number;
  status: string;
  oilSystemStatus: string;
  coolingSystemStatus: string;
  findings: string[];
}

interface DiagnosticSummarySection {
  p0087Status: string;
  highRailStatus: string;
  p0299Status: string;
  egtStatus: string;
  p0101Status: string;
  converterSlipStatus: string;
  // Whether any fault was actually detected (controls UI visibility)
  anyFaultDetected: boolean;
  detectedCodes: string[];
}

// Helper: filter out zero-padded / missing values (0 means not logged)
function validValues(arr: number[]): number[] {
  return arr.filter(v => v > 0);
}

function safeMax(arr: number[]): number {
  const v = validValues(arr);
  return v.length ? Math.max(...v) : 0;
}

function safeMin(arr: number[]): number {
  const v = validValues(arr);
  return v.length ? Math.min(...v) : 0;
}

function safeAvg(arr: number[]): number {
  const v = validValues(arr);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** Default engine health section for non-diesel vehicles (skip diesel-specific analysis) */
function makeDefaultSection(_label: string): EngineHealthSection {
  return {
    score: 100,
    status: 'N/A — Non-diesel vehicle',
    turbochargerStatus: 'N/A',
    egtStatus: 'N/A',
    mafStatus: 'N/A',
    findings: ['Diesel-specific engine analysis skipped — vehicle identified as non-diesel'],
  };
}

/** Default fuel system section for non-diesel vehicles */
function makeDefaultFuelSection(): FuelSystemSection {
  return {
    score: 100,
    status: 'N/A — Non-diesel vehicle',
    pressureRegulation: 'N/A',
    findings: ['Diesel fuel system analysis skipped — vehicle identified as non-diesel'],
  };
}

export function generateHealthReport(data: ProcessedMetrics, vehicleInfo?: VehicleInfo): HealthReportData {
  // Determine if vehicle is diesel from VehicleMeta
  const meta = data.vehicleMeta;
  const fuelType = meta?.fuelType || 'unknown';
  const isDiesel = fuelType === 'diesel' || fuelType === 'unknown'; // unknown = backward compat

  const engineHealth = isDiesel ? evaluateEngineHealth(data) : makeDefaultSection('Engine') as EngineHealthSection;
  const fuelSystem = isDiesel ? evaluateFuelSystem(data) : makeDefaultFuelSection();
  const transmission = evaluateTransmission(data); // universal
  const thermalManagement = evaluateThermalManagement(data); // universal
  const diagnosticSummary = evaluateDiagnostics(data);

  const scores = [engineHealth.score, fuelSystem.score, transmission.score, thermalManagement.score];
  const overallScore = Math.round(scores.reduce((a, b) => a + b) / scores.length);

  let overallStatus: 'excellent' | 'good' | 'fair' | 'poor';
  if (overallScore >= 90) overallStatus = 'excellent';
  else if (overallScore >= 75) overallStatus = 'good';
  else if (overallScore >= 60) overallStatus = 'fair';
  else overallStatus = 'poor';

  const recommendations = generateRecommendations(engineHealth, fuelSystem, transmission, thermalManagement, diagnosticSummary);

  return {
    overallStatus,
    overallScore,
    timestamp: new Date(),
    vehicleInfo,
    engineHealth,
    fuelSystem,
    transmission,
    thermalManagement,
    diagnosticSummary,
    recommendations,
  };
}

function evaluateEngineHealth(data: ProcessedMetrics): EngineHealthSection {
  const findings: string[] = [];
  let score = 100;

  // ── EGT Analysis ──────────────────────────────────────────────────────────
  // Use EGT data if available (non-zero values)
  const egtVals = validValues(data.exhaustGasTemp);
  let egtStatus = '✓ Normal — EGT within safe range';

  if (egtVals.length > 0) {
    const maxEgt = Math.max(...egtVals);
    const avgEgt = egtVals.reduce((a, b) => a + b, 0) / egtVals.length;

    // Rule: >1800°F = sensor fault
    const sensorFaultCount = egtVals.filter(e => e > 1800).length;
    // Rule: >1650°F for >5 seconds (at 25Hz = 125 samples)
    const highEgtCount = egtVals.filter(e => e > 1650).length;

    if (sensorFaultCount > 0) {
      egtStatus = '✗ FAULT — EGT sensor disconnected or out of service (readings >1800°F)';
      score -= 20;
      findings.push('EGT sensor fault detected — readings above 1800°F indicate sensor is disconnected or failed');
    } else if (highEgtCount >= 125) {
      egtStatus = '⚠ WARNING — EGT exceeded 1650°F for more than 5 seconds';
      score -= 15;
      findings.push(`EGT exceeded 1650°F for ${(highEgtCount / 25).toFixed(1)}s — contact tuner for review`);
    } else if (highEgtCount > 0) {
      egtStatus = `⚠ CAUTION — Brief EGT spike to ${maxEgt.toFixed(0)}°F (${highEgtCount} samples above 1650°F)`;
      score -= 5;
      findings.push(`EGT briefly exceeded 1650°F (${highEgtCount} samples) — monitor under sustained load`);
    } else {
      findings.push(`EGT healthy — max ${maxEgt.toFixed(0)}°F, avg ${avgEgt.toFixed(0)}°F (limit: 1650°F)`);
    }
  } else {
    egtStatus = '— EGT not logged in this file';
    findings.push('EGT channel not present in this datalog');
  }

  // ── MAF at Idle ───────────────────────────────────────────────────────────
  // L5P idle: 2–6 lb/min is normal
  let mafStatus = '✓ Normal — MAF idle flow within spec';
  const idleIndices = data.rpm.map((r, i) => (r > 500 && r < 900 ? i : -1)).filter(i => i !== -1);

  if (idleIndices.length > 50) {
    const idleMafVals = idleIndices.map(i => data.maf[i]).filter(m => m > 0);
    if (idleMafVals.length > 0) {
      const avgIdleMaf = idleMafVals.reduce((a, b) => a + b, 0) / idleMafVals.length;
      const highIdleCount = idleMafVals.filter(m => m > 6).length;
      const lowIdleCount = idleMafVals.filter(m => m < 2).length;

      if (highIdleCount > 30) {
        mafStatus = `⚠ WARNING — High MAF at idle (avg: ${avgIdleMaf.toFixed(1)} lb/min, limit: 6 lb/min)`;
        score -= 10;
        findings.push(`MAF flow above 6 lb/min at idle (avg: ${avgIdleMaf.toFixed(1)} lb/min) — check MAF sensor and contact tuner`);
      } else if (lowIdleCount > 30) {
        mafStatus = `⚠ WARNING — Low MAF at idle (avg: ${avgIdleMaf.toFixed(1)} lb/min, minimum: 2 lb/min)`;
        score -= 10;
        findings.push(`MAF flow below 2 lb/min at idle (avg: ${avgIdleMaf.toFixed(1)} lb/min) — check MAF sensor and contact tuner`);
      } else {
        findings.push(`MAF idle flow normal — avg ${avgIdleMaf.toFixed(1)} lb/min (spec: 2–6 lb/min)`);
      }
    }
  }

  // ── Turbocharger / Boost ──────────────────────────────────────────────────
  const boostVals = validValues(data.boost);
  const maxMaf = safeMax(data.maf);
  let turboStatus = '✓ Normal — Turbocharger responding correctly';
  // boostActualAvailable: false means MAP was not in the datalog — all boost values are zero/invalid
  const boostAvail = data.boostActualAvailable !== false;

  if (boostAvail && boostVals.length > 0) {
    const maxBoost = Math.max(...boostVals);
    // Low boost condition: high MAF (>55 lb/min) but low boost
    // Use dynamic threshold: if peak boost > 30 psi, turbo is making good boost
    // and the truck is likely tuned — only flag if boost is below 50% of peak
    const boostLeakFloor = maxBoost > 30 ? maxBoost * 0.50 : 25;
    const highMafLowBoostCount = data.maf.filter((m: number, i: number) =>
      m > 55 && boostVals[i] !== undefined && boostVals[i] < boostLeakFloor
    ).length;

    if (highMafLowBoostCount > 50) {
      turboStatus = '⚠ WARNING — Possible boost leak (high MAF, low boost pressure)';
      score -= 15;
      findings.push(`High MAF with low boost pressure detected (below ${boostLeakFloor.toFixed(0)} psi while MAF > 55 lb/min) — perform boost leak test and inspect intake`);
    } else {
      findings.push(`Turbocharger healthy — peak boost ${maxBoost.toFixed(1)} PSIG, peak MAF ${maxMaf.toFixed(1)} lb/min`);
    }
  } else if (!boostAvail) {
    turboStatus = '— Manifold Absolute Pressure not logged (add MAP to datalog for boost analysis)';
    findings.push(`Turbocharger — peak MAF ${maxMaf.toFixed(1)} lb/min (actual boost unavailable: MAP not in datalog)`);
  } else {
    findings.push(`Turbocharger data — peak MAF ${maxMaf.toFixed(1)} lb/min (boost channel not logged)`);
  }

  return {
    score: Math.max(0, score),
    status: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    turbochargerStatus: turboStatus,
    egtStatus,
    mafStatus,
    findings,
  };
}

function evaluateFuelSystem(data: ProcessedMetrics): FuelSystemSection {
  const findings: string[] = [];
  let score = 100;

  const railActual = data.railPressureActual;
  const railDesired = data.railPressureDesired;

  const hasRailData = validValues(railActual).length > 10 && validValues(railDesired).length > 10;

  if (!hasRailData) {
    findings.push('Fuel rail pressure channels not present in this datalog');
    return {
      score: 100,
      status: 'Excellent',
      pressureRegulation: '— Rail pressure not logged in this file',
      findings,
    };
  }

  // Low rail pressure: pump saturation-aware — only count when actual is NOT near pump peak
  // High rail pressure: Actual is 3.5k+ higher than desired, EXCLUDING decel/transients
  // Must match diagnostics.ts thresholds to avoid false positives
  const validRailForPeak = railActual.filter(v => v > 5000);
  const peakRailPressure = validRailForPeak.length > 0 ? Math.max(...validRailForPeak) : 0;
  const railSaturationFloor = peakRailPressure * 0.85;
  let lowRailCount = 0;
  let highRailSustained = 0;
  let highRailMaxConsecutive = 0;
  let highRailConsecutive = 0;
  for (let i = 0; i < railActual.length; i++) {
    if (railActual[i] > 0 && railDesired[i] > 0) {
      const railOffset = railDesired[i] - railActual[i];
      const railPctOffset = railDesired[i] > 0 ? railOffset / railDesired[i] : 0;
      const isPumpSaturated = peakRailPressure > 20000 && railActual[i] >= railSaturationFloor && railActual[i] > 15000;
      if (railOffset > 5000 && railPctOffset > 0.20 && !isPumpSaturated) lowRailCount++;
      // High rail: exclude when desired is dropping (decel/coast-down)
      const isDesiredDropping =
        (i >= 5 && railDesired[i - 5] - railDesired[i] > 200) ||
        (i >= 20 && railDesired[i - 20] - railDesired[i] > 500) ||
        (i >= 50 && railDesired[i - 50] - railDesired[i] > 1000);
      // Also exclude if desired was recently much higher (pressure still bleeding off)
      let recentPeak = 0;
      const lb = Math.min(i, 80);
      for (let j = i - lb; j < i; j++) { if (j >= 0 && railDesired[j] > recentPeak) recentPeak = railDesired[j]; }
      const isSettling = recentPeak - railDesired[i] > 2000;

      if (railActual[i] - railDesired[i] > 3500 && !isDesiredDropping && !isSettling) {
        highRailConsecutive++;
        if (highRailConsecutive > highRailMaxConsecutive) highRailMaxConsecutive = highRailConsecutive;
      } else {
        highRailConsecutive = 0;
      }
    }
  }
  // Only flag high rail if sustained for 120+ consecutive samples (12 seconds at 10Hz)
  const highRailFlagged = highRailMaxConsecutive >= 120;

  const avgActual = safeAvg(railActual);
  const avgDesired = safeAvg(railDesired);
  const avgDiff = Math.abs(avgActual - avgDesired);

  let pressureStatus = '✓ Normal — Rail pressure regulation within spec';

  if (lowRailCount >= 150) {
    pressureStatus = '✗ FAIL — Low rail pressure detected';
    score -= 25;
    const pcvVals = validValues(data.pcvDutyCycle);
    const avgPcv = pcvVals.length ? pcvVals.reduce((a, b) => a + b, 0) / pcvVals.length : 0;
    if (avgPcv < 500 && avgPcv > 0) {
      findings.push('Low rail pressure — PCV below 500mA, fuel system is maxed out. Check fuel pump, lift pump, and filter.');
    } else {
      findings.push('Low rail pressure — PCV above 500mA, a tuning adjustment may resolve this. Contact tuner.');
    }
  } else if (highRailFlagged) {
    pressureStatus = '⚠ WARNING — High rail pressure deviation detected';
    score -= 15;
    findings.push(`High rail pressure deviation sustained for ${(highRailMaxConsecutive / 10).toFixed(1)}s (threshold: 3500 psi, excl. decel/transients) — regulator adjustment may be needed.`);
  } else {
    findings.push(`Fuel rail pressure regulation excellent — avg differential: ${avgDiff.toFixed(0)} PSI`);
    findings.push(`Rail pressure: actual avg ${avgActual.toFixed(0)} PSI vs desired avg ${avgDesired.toFixed(0)} PSI`);
  }

  return {
    score: Math.max(0, score),
    status: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    pressureRegulation: pressureStatus,
    findings,
  };
}

function evaluateTransmission(data: ProcessedMetrics): TransmissionSection {
  const findings: string[] = [];
  let score = 100;

  const slip = data.converterSlip.map(s => Math.abs(s));
  const dutyCycle = data.converterDutyCycle || [];
  const transTemp = validValues(data.transFluidTemp);

  let slipStatus = '✓ Normal — Torque converter slip within spec';

  if (validValues(slip).length > 0) {
    // Only evaluate slip during LOCKED states (duty cycle > 90%)
    // Slip during ControlledOn, ImmediateOff, etc. is intentional and not a fault
    // SETTLE-THEN-RISE detection: Only flag slip as a fault when the converter
    // has already settled (slip was <20 RPM for 10+ samples, indicating full lockup)
    // and then rises back above threshold — this indicates actual clutch degradation.
    // During the initial apply sequence (ControlledOn with high slip converging to zero),
    // high slip is NORMAL and should never be flagged.
    const lockedSlip: number[] = [];
    for (let i = 0; i < slip.length; i++) {
      const isLocked = dutyCycle.length > i ? dutyCycle[i] > 90 : true;
      if (isLocked && slip[i] > 0) lockedSlip.push(slip[i]);
    }

    const maxLockedSlip = lockedSlip.length > 0 ? Math.max(...lockedSlip) : 0;
    const avgSlip = lockedSlip.length > 0 ? lockedSlip.reduce((a, b) => a + b, 0) / lockedSlip.length : 0;

    let hasSettled = false; // Has the converter reached full lockup (<20 RPM)?
    let settledCount = 0;  // How many consecutive samples below settle threshold?
    const SETTLE_THRESHOLD = 20; // RPM — below this = fully locked
    const SETTLE_SAMPLES = 10;   // Must stay below threshold for this many samples
    let criticalConsecutive = 0;
    let maxCriticalConsecutive = 0;
    let warnConsecutive = 0;
    let maxWarnConsecutive = 0;

    for (let i = 0; i < slip.length; i++) {
      const isLocked = dutyCycle.length > i ? dutyCycle[i] > 90 : true;

      if (!isLocked) {
        // TCC not commanded on — reset settle tracking
        hasSettled = false;
        settledCount = 0;
        criticalConsecutive = 0;
        warnConsecutive = 0;
        continue;
      }

      // Track settle state
      if (slip[i] < SETTLE_THRESHOLD) {
        settledCount++;
        if (settledCount >= SETTLE_SAMPLES) hasSettled = true;
      } else if (!hasSettled) {
        // High slip but converter hasn't settled yet — this is the apply sequence
        settledCount = 0;
        criticalConsecutive = 0;
        warnConsecutive = 0;
        continue; // Skip — normal apply behavior
      }
      // If hasSettled is true and slip rises, that's a real fault

      if (hasSettled && slip[i] > 60) {
        criticalConsecutive++;
        if (criticalConsecutive > maxCriticalConsecutive) maxCriticalConsecutive = criticalConsecutive;
      } else { criticalConsecutive = 0; }
      if (hasSettled && slip[i] > 40) {
        warnConsecutive++;
        if (warnConsecutive > maxWarnConsecutive) maxWarnConsecutive = warnConsecutive;
      } else { warnConsecutive = 0; }
    }

    if (maxCriticalConsecutive >= 25) {
      slipStatus = '✗ FAIL — Excessive converter slip after lockup (clutch degradation suspected)';
      score -= 30;
      findings.push(`Converter slip >60 RPM sustained for ${maxCriticalConsecutive} samples after TCC had settled. Internal wear suspected.`);
    } else if (maxWarnConsecutive >= 25) {
      slipStatus = `⚠ WARNING — Elevated converter slip after lockup (max: ${maxLockedSlip.toFixed(0)} RPM)`;
      score -= 10;
      findings.push(`Converter slip >40 RPM sustained for ${maxWarnConsecutive} samples after TCC had settled — monitor and inspect`);
    } else {
      findings.push(`Torque converter healthy — max locked slip ${maxLockedSlip.toFixed(1)} RPM, avg ${avgSlip.toFixed(1)} RPM`);
    }
  } else {
    slipStatus = '— Converter slip not logged in this file';
    findings.push('Transmission slip channel not present in this datalog');
  }

  // Transmission fluid temp — real-world L5P: normal 100–200°F, warning >220°F, critical >240°F
  if (transTemp.length > 0) {
    const maxTransTemp = Math.max(...transTemp);
    const avgTransTemp = transTemp.reduce((a, b) => a + b, 0) / transTemp.length;
    const highTempCount = transTemp.filter(t => t > 220).length;
    const criticalTempCount = transTemp.filter(t => t > 240).length;

    if (criticalTempCount > 10) {
      score -= 20;
      findings.push(`Trans fluid critically hot — max ${maxTransTemp.toFixed(0)}°F (limit: 240°F). Inspect cooler immediately.`);
    } else if (highTempCount > 10) {
      score -= 10;
      findings.push(`Trans fluid elevated — max ${maxTransTemp.toFixed(0)}°F (warning: >220°F). Monitor under tow load.`);
    } else {
      findings.push(`Trans fluid temp normal — max ${maxTransTemp.toFixed(0)}°F, avg ${avgTransTemp.toFixed(0)}°F (spec: <220°F)`);
    }
  }

  return {
    score: Math.max(0, score),
    status: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    converterSlipStatus: slipStatus,
    findings,
  };
}

function evaluateThermalManagement(data: ProcessedMetrics): ThermalSection {
  const findings: string[] = [];
  let score = 100;

  // ── Oil Pressure ──────────────────────────────────────────────────────────
  // L5P spec: 25–80 PSI operating. Low idle warning <20 PSI. Critical <15 PSI.
  const oilPressVals = validValues(data.oilPressure);
  let oilStatus = '✓ Normal — Oil pressure within spec';

  if (oilPressVals.length > 0) {
    const minOilPress = Math.min(...oilPressVals);
    const maxOilPress = Math.max(...oilPressVals);
    const avgOilPress = oilPressVals.reduce((a, b) => a + b, 0) / oilPressVals.length;
    const criticalLowCount = oilPressVals.filter(p => p < 15).length;
    const warningLowCount = oilPressVals.filter(p => p < 20).length;

    if (criticalLowCount > 10) {
      oilStatus = `✗ CRITICAL — Oil pressure dangerously low (min: ${minOilPress.toFixed(0)} PSI)`;
      score -= 30;
      findings.push(`Critical low oil pressure detected (${minOilPress.toFixed(0)} PSI) — stop engine immediately and check oil level and pump`);
    } else if (warningLowCount > 10) {
      oilStatus = `⚠ WARNING — Oil pressure low (min: ${minOilPress.toFixed(0)} PSI, limit: 20 PSI)`;
      score -= 15;
      findings.push(`Low oil pressure detected (min: ${minOilPress.toFixed(0)} PSI) — check oil level, filter, and pump condition`);
    } else {
      findings.push(`Oil pressure healthy — min ${minOilPress.toFixed(0)} PSI, max ${maxOilPress.toFixed(0)} PSI, avg ${avgOilPress.toFixed(0)} PSI (spec: 25–80 PSI)`);
    }
  } else {
    oilStatus = '— Oil pressure not logged in this file';
    findings.push('Oil pressure channel not present in this datalog');
  }

  // ── Engine Coolant Temp ───────────────────────────────────────────────────
  // L5P spec: thermostat opens at 180°F, normal 180–210°F, warning >220°F, critical >230°F
  const coolantVals = validValues(data.coolantTemp);
  let coolantStatus = '✓ Normal — Coolant temperature within spec';

  if (coolantVals.length > 0) {
    const maxCoolant = Math.max(...coolantVals);
    const avgCoolant = coolantVals.reduce((a, b) => a + b, 0) / coolantVals.length;
    const criticalCount = coolantVals.filter(c => c > 230).length;
    const warningCount = coolantVals.filter(c => c > 220).length;

    if (criticalCount > 10) {
      coolantStatus = `✗ CRITICAL — Engine overheating (max: ${maxCoolant.toFixed(0)}°F, limit: 230°F)`;
      score -= 25;
      findings.push(`Engine overheating — coolant reached ${maxCoolant.toFixed(0)}°F. Inspect cooling system, thermostat, and water pump.`);
    } else if (warningCount > 10) {
      coolantStatus = `⚠ WARNING — Elevated coolant temp (max: ${maxCoolant.toFixed(0)}°F, warning: 220°F)`;
      score -= 10;
      findings.push(`Coolant temperature elevated (max: ${maxCoolant.toFixed(0)}°F) — monitor cooling system under load`);
    } else {
      findings.push(`Coolant temp normal — max ${maxCoolant.toFixed(0)}°F, avg ${avgCoolant.toFixed(0)}°F (spec: 180–210°F operating)`);
    }
  } else {
    coolantStatus = '— Coolant temp not logged in this file';
    findings.push('Coolant temperature channel not present in this datalog');
  }

  // ── Engine Oil Temp ───────────────────────────────────────────────────────
  // L5P spec: normal 180–230°F, warning >240°F, critical >260°F
  const oilTempVals = validValues(data.oilTemp);

  if (oilTempVals.length > 0) {
    const maxOilTemp = Math.max(...oilTempVals);
    const avgOilTemp = oilTempVals.reduce((a, b) => a + b, 0) / oilTempVals.length;
    const criticalCount = oilTempVals.filter(t => t > 260).length;
    const warningCount = oilTempVals.filter(t => t > 240).length;

    if (criticalCount > 10) {
      score -= 20;
      findings.push(`Oil temp critically high — max ${maxOilTemp.toFixed(0)}°F (limit: 260°F). Check oil cooler.`);
    } else if (warningCount > 10) {
      score -= 10;
      findings.push(`Oil temp elevated — max ${maxOilTemp.toFixed(0)}°F (warning: 240°F). Monitor under sustained load.`);
    } else {
      findings.push(`Engine oil temp normal — max ${maxOilTemp.toFixed(0)}°F, avg ${avgOilTemp.toFixed(0)}°F (spec: 180–230°F)`);
    }
  }

  return {
    score: Math.max(0, score),
    status: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    oilSystemStatus: oilStatus,
    coolingSystemStatus: coolantStatus,
    findings,
  };
}

function evaluateDiagnostics(data: ProcessedMetrics): DiagnosticSummarySection {
  const detectedCodes: string[] = [];

  // ── Low Rail Pressure ──────────────────────────────────────────────────────────────
  // Pump saturation-aware: on tuned trucks, desired rail pressure is set above
  // the pump's (CP4/HP4) physical capacity. Only flag when actual is well below
  // the pump's demonstrated peak AND the deviation exceeds both absolute and
  // percentage thresholds.
  let p0087Status = '✓ PASS';
  const railActual = data.railPressureActual;
  const railDesired = data.railPressureDesired;
  const hasRailData = validValues(railActual).length > 10 && validValues(railDesired).length > 10;
  if (hasRailData) {
    // Find the pump's demonstrated peak in this log
    const validRail = railActual.filter(v => v > 5000);
    const peakRail = validRail.length > 0 ? Math.max(...validRail) : 0;
    const railSatFloor = peakRail * 0.85;
    // Only count samples where actual is NOT near the pump's peak (not saturated)
    // AND deviation exceeds both 5000 psi absolute AND 20% relative
    const lowRailCount = railActual.filter((a, i) => {
      if (a <= 0 || railDesired[i] <= 0) return false;
      const offset = railDesired[i] - a;
      const pctOffset = offset / railDesired[i];
      const isSaturated = peakRail > 20000 && a >= railSatFloor && a > 15000;
      return offset > 5000 && pctOffset > 0.20 && !isSaturated;
    }).length;
    if (lowRailCount >= 150) {
      p0087Status = '✗ DETECTED — Low Rail Pressure Deviation';
      detectedCodes.push('LOW_RAIL_PRESSURE');
    }
  } else {
    p0087Status = '— Rail pressure not logged';
  } // ── High Rail Pressure Deviation ──────────────────────────────────────────
  // Actual is 3.5k+ higher than desired, EXCLUDING decel/transients, sustained 120+ consecutive samples
  let highRailStatus = '✓ PASS';
  if (hasRailData) {
    let hrConsec = 0, hrMaxConsec = 0;
    for (let i = 0; i < railActual.length; i++) {
      if (railActual[i] > 0 && railDesired[i] > 0) {
        const isDesiredDropping =
          (i >= 5 && railDesired[i - 5] - railDesired[i] > 200) ||
          (i >= 20 && railDesired[i - 20] - railDesired[i] > 500) ||
          (i >= 50 && railDesired[i - 50] - railDesired[i] > 1000);
        let recentPeak = 0;
        const lb = Math.min(i, 80);
        for (let j = i - lb; j < i; j++) { if (j >= 0 && railDesired[j] > recentPeak) recentPeak = railDesired[j]; }
        const isSettling = recentPeak - railDesired[i] > 2000;
        if (railActual[i] - railDesired[i] > 3500 && !isDesiredDropping && !isSettling) {
          hrConsec++;
          if (hrConsec > hrMaxConsec) hrMaxConsec = hrConsec;
        } else { hrConsec = 0; }
      }
    }
    if (hrMaxConsec >= 120) {
      highRailStatus = '✗ DETECTED — High Rail Pressure Deviation';
      detectedCodes.push('HIGH_RAIL_PRESSURE');
    }
  } else {
    highRailStatus = '— Rail pressure not logged';
  }

  // ── Low Boost / Underboost ────────────────────────────────────────────────────────
  // Turbo saturation-aware: on tuned trucks, desired boost is set above the
  // turbo's physical limit. Only flag when actual is well below the turbo's
  // demonstrated peak AND high MAF confirms airflow demand.
  let p0299Status = '✓ PASS';
  const boostActual = validValues(data.boost);
  const boostAvailForP0299 = data.boostActualAvailable !== false;
  if (!boostAvailForP0299) {
    p0299Status = '— Actual boost not available (Manifold Absolute Pressure not in datalog)';
  } else if (boostActual.length > 0) {
    // Find the turbo's demonstrated peak in this log
    const peakBoost = Math.max(...boostActual.filter(v => v > 0));
    // Dynamic floor: if turbo makes > 30 psi, use 50% of peak; otherwise 25 psi
    const boostLeakFloor = peakBoost > 30 ? peakBoost * 0.50 : 25;
    // Only count samples where boost is below the dynamic floor with high MAF
    const highMafLowBoost = data.maf.filter((m: number, i: number) =>
      m > 55 && data.boost[i] > 0 && data.boost[i] < boostLeakFloor
    ).length;
    if (highMafLowBoost >= 100) {
      p0299Status = '✗ DETECTED — Low Boost (possible boost leak)';
      detectedCodes.push('LOW_BOOST');
    }
  } else {
    p0299Status = '— Boost pressure not logged';
  }

  // ── EGT Warning ─────────────────────────────────────────────────────────────────
  // >1475°F for >5 seconds, or stuck >1800°F
  let egtStatus = '✓ PASS';
  const egtVals = validValues(data.exhaustGasTemp);
  if (egtVals.length > 0) {
    const sensorFaultCount = egtVals.filter(e => e > 1800).length;
    const highEgtCount = egtVals.filter(e => e > 1475).length;
    if (sensorFaultCount > 0) {
      egtStatus = '✗ DETECTED — EGT Sensor Fault (>1800°F, likely disconnected)';
      detectedCodes.push('EGT_SENSOR_FAULT');
    } else if (highEgtCount >= 125) {
      egtStatus = '⚠ WARNING — EGT exceeded 1475°F for >5 seconds';
      detectedCodes.push('EGT_HIGH');
    }
  } else {
    egtStatus = '— EGT not logged';
  }

  // ── MAF Out of Range at Idle ───────────────────────────────────────────
  let p0101Status = '✓ PASS';
  const idleIndices = data.rpm.map((r, i) => (r > 500 && r < 900 ? i : -1)).filter(i => i !== -1);
  if (idleIndices.length > 50) {
    const idleMafVals = idleIndices.map(i => data.maf[i]).filter(m => m > 0);
    if (idleMafVals.length > 0) {
      const highIdleCount = idleMafVals.filter(m => m > 6).length;
      const lowIdleCount = idleMafVals.filter(m => m < 2).length;
      if (highIdleCount > 30) {
        p0101Status = '✗ DETECTED — MAF High at Idle (>6 lb/min)';
        detectedCodes.push('HIGH_IDLE_MAF');
      } else if (lowIdleCount > 30) {
        p0101Status = '✗ DETECTED — MAF Low at Idle (<2 lb/min)';
        detectedCodes.push('LOW_IDLE_MAF');
      }
    }
  } else {
    p0101Status = '— Insufficient idle data';
  }

  // ── Converter Slip (settle-then-rise detection) ────────────────────────────────
  // Only flag slip as a fault when the converter has ALREADY SETTLED (<20 RPM for 10+
  // samples) and then rises back above threshold. During the initial apply sequence
  // (ControlledOn with high slip converging to zero), high slip is NORMAL.
  let converterSlipStatus = '✓ PASS';
  const slipVals = data.converterSlip.map(s => Math.abs(s));
  const dcVals = data.converterDutyCycle || [];
  if (validValues(slipVals).length > 0) {
    let hasSettled = false;
    let settledCount = 0;
    const SETTLE_THRESH = 20;
    const SETTLE_SAMPLES = 10;
    let critConsec = 0, maxCritConsec = 0;
    let warnConsec = 0, maxWarnConsec = 0;
    for (let i = 0; i < slipVals.length; i++) {
      const isLocked = dcVals.length > i ? dcVals[i] > 90 : true;
      if (!isLocked) {
        hasSettled = false; settledCount = 0;
        critConsec = 0; warnConsec = 0;
        continue;
      }
      if (slipVals[i] < SETTLE_THRESH) {
        settledCount++;
        if (settledCount >= SETTLE_SAMPLES) hasSettled = true;
      } else if (!hasSettled) {
        settledCount = 0; critConsec = 0; warnConsec = 0;
        continue; // Normal apply sequence
      }
      if (hasSettled && slipVals[i] > 60) {
        critConsec++; if (critConsec > maxCritConsec) maxCritConsec = critConsec;
      } else { critConsec = 0; }
      if (hasSettled && slipVals[i] > 40) {
        warnConsec++; if (warnConsec > maxWarnConsec) maxWarnConsec = warnConsec;
      } else { warnConsec = 0; }
    }
    if (maxCritConsec >= 25) {
      converterSlipStatus = '✗ DETECTED — Excessive Converter Slip After Lockup';
      detectedCodes.push('TCC_SLIP_CRITICAL');
    } else if (maxWarnConsec >= 25) {
      converterSlipStatus = '⚠ WARNING — Elevated Converter Slip After Lockup';
      detectedCodes.push('TCC_SLIP_WARNING');
    }
  } else {
    converterSlipStatus = '— Converter slip not logged';
  }

  return {
    p0087Status,
    highRailStatus,
    p0299Status,
    egtStatus,
    p0101Status,
    converterSlipStatus,
    anyFaultDetected: detectedCodes.length > 0,
    detectedCodes,
  };
}

function generateRecommendations(
  engine: EngineHealthSection,
  fuel: FuelSystemSection,
  transmission: TransmissionSection,
  thermal: ThermalSection,
  _diagnostics: DiagnosticSummarySection
): string[] {
  const recommendations: string[] = [];

  if (engine.score < 90) recommendations.push('Have engine diagnostics performed by a qualified diesel/powertrain technician');
  if (fuel.score < 90) recommendations.push('Inspect fuel system — check lift pump pressure, fuel filter, and rail pressure regulator');
  if (transmission.score < 90) recommendations.push('Have transmission fluid and torque converter inspected by a drivetrain specialist');
  if (thermal.score < 90) recommendations.push('Check oil level, coolant level, and inspect cooling system components');

  if (recommendations.length === 0) {
    recommendations.push('Continue following GM maintenance schedule — oil change every 7,500 miles with dexos2 5W-30');
    recommendations.push('Use only Ultra-Low Sulfur Diesel (ULSD) fuel and maintain DEF fluid level');
    recommendations.push('Inspect air filter and fuel filter at next scheduled service interval');
    recommendations.push('All monitored parameters are within factory operating specifications');
  }

  return recommendations;
}
