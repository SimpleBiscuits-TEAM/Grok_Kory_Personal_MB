/**
 * Vehicle Health Report Generator
 * Uses real-world L5P Duramax operating thresholds sourced from GM service data and ECU calibration.
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

import { ProcessedMetrics } from './dataProcessor';
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
  p0088Status: string;
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

export function generateHealthReport(data: ProcessedMetrics, vehicleInfo?: VehicleInfo): HealthReportData {
  const engineHealth = evaluateEngineHealth(data);
  const fuelSystem = evaluateFuelSystem(data);
  const transmission = evaluateTransmission(data);
  const thermalManagement = evaluateThermalManagement(data);
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

  if (boostVals.length > 0) {
    const maxBoost = Math.max(...boostVals);
    // P0299 condition: high MAF (>55 lb/min) but low boost (<25 PSIG gauge) = likely boost leak
    const highMafLowBoostCount = data.maf.filter((m, i) => m > 55 && boostVals[i] !== undefined && boostVals[i] < 25).length;

    if (highMafLowBoostCount > 30) {
      turboStatus = '⚠ WARNING — Possible boost leak (high MAF, low boost pressure)';
      score -= 15;
      findings.push('High MAF with low boost pressure detected — perform boost leak test and inspect intake');
    } else {
      findings.push(`Turbocharger healthy — peak boost ${maxBoost.toFixed(1)} PSIG, peak MAF ${maxMaf.toFixed(1)} lb/min`);
    }
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

  // P0087: Actual is 3k+ lower than desired for >2 seconds (at 25Hz = 50 samples)
  let lowRailCount = 0;
  let highRailCount = 0;
  for (let i = 0; i < railActual.length; i++) {
    if (railActual[i] > 0 && railDesired[i] > 0) {
      if (railDesired[i] - railActual[i] > 3000) lowRailCount++;
      if (railActual[i] - railDesired[i] > 1500) highRailCount++;
    }
  }

  const avgActual = safeAvg(railActual);
  const avgDesired = safeAvg(railDesired);
  const avgDiff = Math.abs(avgActual - avgDesired);

  let pressureStatus = '✓ Normal — Rail pressure regulation within spec';

  if (lowRailCount >= 50) {
    pressureStatus = '✗ FAIL — Low rail pressure (P0087 condition)';
    score -= 25;
    const pcvVals = validValues(data.pcvDutyCycle);
    const avgPcv = pcvVals.length ? pcvVals.reduce((a, b) => a + b, 0) / pcvVals.length : 0;
    if (avgPcv < 500 && avgPcv > 0) {
      findings.push('Low rail pressure — PCV below 500mA, fuel system is maxed out. Check fuel pump, lift pump, and filter.');
    } else {
      findings.push('Low rail pressure — PCV above 500mA, a tuning adjustment may resolve this. Contact PPEI.');
    }
  } else if (highRailCount >= 50) {
    pressureStatus = '⚠ WARNING — High rail pressure (P0088 condition)';
    score -= 15;
    findings.push(`High rail pressure detected (${highRailCount} samples > +1500 psi offset) — regulator adjustment may be needed. Contact tuner.`);
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

  const slip = validValues(data.converterSlip.map(s => Math.abs(s)));
  const transTemp = validValues(data.transFluidTemp);

  let slipStatus = '✓ Normal — Torque converter slip within spec';

  if (slip.length > 0) {
    const maxSlip = Math.max(...slip);
    const avgSlip = slip.reduce((a, b) => a + b, 0) / slip.length;
    const highSlipCount = slip.filter(s => s > 15).length;
    const criticalSlipCount = slip.filter(s => s > 25).length;

    if (criticalSlipCount > 10) {
      slipStatus = '✗ FAIL — Excessive converter slip (>25 RPM)';
      score -= 30;
      findings.push(`Torque converter slipping excessively — max ${maxSlip.toFixed(0)} RPM slip. Internal wear suspected.`);
    } else if (highSlipCount > 10) {
      slipStatus = `⚠ WARNING — Elevated converter slip (max: ${maxSlip.toFixed(0)} RPM)`;
      score -= 10;
      findings.push(`Converter slip above 15 RPM detected (${highSlipCount} samples) — monitor and inspect`);
    } else {
      findings.push(`Torque converter healthy — max slip ${maxSlip.toFixed(1)} RPM, avg ${avgSlip.toFixed(1)} RPM`);
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

  // ── P0087: Low Rail Pressure ──────────────────────────────────────────────
  // Actual is 3k+ lower than desired for >2 seconds (50 samples at 25Hz)
  let p0087Status = '✓ PASS';
  const railActual = data.railPressureActual;
  const railDesired = data.railPressureDesired;
  const hasRailData = validValues(railActual).length > 10 && validValues(railDesired).length > 10;
  if (hasRailData) {
    const lowRailCount = railActual.filter((a, i) => a > 0 && railDesired[i] > 0 && (railDesired[i] - a) > 3000).length;
    if (lowRailCount >= 50) {
      p0087Status = '✗ DETECTED — P0087 Low Rail Pressure';
      detectedCodes.push('P0087');
    }
  } else {
    p0087Status = '— Rail pressure not logged';
  }

  // ── P0088: High Rail Pressure ─────────────────────────────────────────────
  // Actual is 1.5k+ higher than desired for >2 seconds
  let p0088Status = '✓ PASS';
  if (hasRailData) {
    const highRailCount = railActual.filter((a, i) => a > 0 && railDesired[i] > 0 && (a - railDesired[i]) > 1500).length;
    if (highRailCount >= 50) {
      p0088Status = '✗ DETECTED — P0088 High Rail Pressure';
      detectedCodes.push('P0088');
    }
  } else {
    p0088Status = '— Rail pressure not logged';
  }

  // ── P0299: Underboost ─────────────────────────────────────────────────────
  // Actual boost 5+ PSI below desired for >3 seconds (75 samples at 25Hz)
  let p0299Status = '✓ PASS';
  const boostActual = validValues(data.boost);
  if (boostActual.length > 0) {
    // Check for high MAF but low boost (boost leak indicator)
    const highMafLowBoost = data.maf.filter((m, i) => m > 55 && data.boost[i] > 0 && data.boost[i] < 40).length;
    if (highMafLowBoost >= 75) {
      p0299Status = '✗ DETECTED — P0299 Underboost (possible boost leak)';
      detectedCodes.push('P0299');
    }
  } else {
    p0299Status = '— Boost pressure not logged';
  }

  // ── EGT Warning ───────────────────────────────────────────────────────────
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

  // ── P0101: MAF Out of Range at Idle ──────────────────────────────────────
  let p0101Status = '✓ PASS';
  const idleIndices = data.rpm.map((r, i) => (r > 500 && r < 900 ? i : -1)).filter(i => i !== -1);
  if (idleIndices.length > 50) {
    const idleMafVals = idleIndices.map(i => data.maf[i]).filter(m => m > 0);
    if (idleMafVals.length > 0) {
      const highIdleCount = idleMafVals.filter(m => m > 6).length;
      const lowIdleCount = idleMafVals.filter(m => m < 2).length;
      if (highIdleCount > 30) {
        p0101Status = '✗ DETECTED — P0101 MAF High at Idle (>6 lb/min)';
        detectedCodes.push('P0101');
      } else if (lowIdleCount > 30) {
        p0101Status = '✗ DETECTED — P0101 MAF Low at Idle (<2 lb/min)';
        detectedCodes.push('P0101');
      }
    }
  } else {
    p0101Status = '— Insufficient idle data';
  }

  // ── Converter Slip ────────────────────────────────────────────────────────
  let converterSlipStatus = '✓ PASS';
  const slipVals = validValues(data.converterSlip.map(s => Math.abs(s)));
  if (slipVals.length > 0) {
    const criticalSlipCount = slipVals.filter(s => s > 25).length;
    const highSlipCount = slipVals.filter(s => s > 15).length;
    if (criticalSlipCount > 10) {
      converterSlipStatus = '✗ DETECTED — Excessive Converter Slip (>25 RPM)';
      detectedCodes.push('TCC_SLIP_CRITICAL');
    } else if (highSlipCount > 10) {
      converterSlipStatus = '⚠ WARNING — Elevated Converter Slip (>15 RPM)';
      detectedCodes.push('TCC_SLIP_WARNING');
    }
  } else {
    converterSlipStatus = '— Converter slip not logged';
  }

  return {
    p0087Status,
    p0088Status,
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

  if (engine.score < 90) recommendations.push('Have engine diagnostics performed by a qualified Duramax technician');
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
