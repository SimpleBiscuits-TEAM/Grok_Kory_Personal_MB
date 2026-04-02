/**
 * Protocol-Specific Diagnostics Analysis
 * 
 * Analyzes J1939 and K-Line data for fault patterns, anomalies, and diagnostic insights.
 */

import { J1939ParameterReading } from './j1939Protocol';
import { KLineParameterReading, KLineDTC, getKLineDTCSeverity } from './klineProtocol';

// ─── J1939 Diagnostics ───────────────────────────────────────────────────────

export interface J1939DiagnosticIssue {
  type: 'warning' | 'critical' | 'info';
  parameter: string;
  shortName: string;
  value: number;
  unit: string;
  threshold: number;
  description: string;
  recommendation: string;
  timestamp: number;
}

export interface J1939DiagnosticReport {
  timestamp: number;
  duration: number;
  totalReadings: number;
  issues: J1939DiagnosticIssue[];
  engineHealth: number;                // 0-100
  transmissionHealth: number;           // 0-100
  temperatureStatus: string;            // 'normal', 'elevated', 'critical'
  fuelEfficiency: number;               // L/100km or gal/mile
}

/**
 * Analyze J1939 engine parameters for diagnostic issues
 */
export function analyzeJ1939EngineParameters(
  readings: J1939ParameterReading[]
): J1939DiagnosticIssue[] {
  const issues: J1939DiagnosticIssue[] = [];
  const readingMap = new Map(readings.map((r) => [r.shortName, r]));

  // Engine Speed Analysis
  const engSpeed = readingMap.get('ENG_SPD');
  if (engSpeed && engSpeed.value > 2500) {
    if (engSpeed.value > 3000) {
      issues.push({
        type: 'warning',
        parameter: 'Engine Speed',
        shortName: 'ENG_SPD',
        value: engSpeed.value,
        unit: 'rpm',
        threshold: 3000,
        description: 'Engine speed exceeds normal operating range',
        recommendation: 'Check for excessive throttle or load conditions',
        timestamp: engSpeed.timestamp,
      });
    }
  }

  // Engine Load Analysis
  const engLoad = readingMap.get('ENG_LOAD');
  if (engLoad && engLoad.value > 90) {
    issues.push({
      type: 'warning',
      parameter: 'Engine Load',
      shortName: 'ENG_LOAD',
      value: engLoad.value,
      unit: '%',
      threshold: 90,
      description: 'Engine load is very high',
      recommendation: 'Monitor for potential overload conditions',
      timestamp: engLoad.timestamp,
    });
  }

  // Torque Analysis
  const engTrq = readingMap.get('ENG_TRQ_ACT');
  if (engTrq && engTrq.value > 100) {
    issues.push({
      type: 'info',
      parameter: 'Engine Torque',
      shortName: 'ENG_TRQ_ACT',
      value: engTrq.value,
      unit: '%',
      threshold: 100,
      description: 'Engine torque is at or above maximum',
      recommendation: 'High torque output detected - verify load is appropriate',
      timestamp: engTrq.timestamp,
    });
  }

  return issues;
}

/**
 * Analyze J1939 transmission parameters
 */
export function analyzeJ1939TransmissionParameters(
  readings: J1939ParameterReading[]
): J1939DiagnosticIssue[] {
  const issues: J1939DiagnosticIssue[] = [];
  const readingMap = new Map(readings.map((r) => [r.shortName, r]));

  // Transmission Temperature Analysis
  const transTemp = readingMap.get('TRANS_TEMP');
  if (transTemp) {
    if (transTemp.value > 100) {
      issues.push({
        type: 'warning',
        parameter: 'Transmission Fluid Temperature',
        shortName: 'TRANS_TEMP',
        value: transTemp.value,
        unit: '°C',
        threshold: 100,
        description: 'Transmission fluid temperature is elevated',
        recommendation: 'Allow transmission to cool or reduce load',
        timestamp: transTemp.timestamp,
      });
    }
    if (transTemp.value > 120) {
      issues.push({
        type: 'critical',
        parameter: 'Transmission Fluid Temperature',
        shortName: 'TRANS_TEMP',
        value: transTemp.value,
        unit: '°C',
        threshold: 120,
        description: 'Transmission fluid temperature is critical',
        recommendation: 'Stop immediately and allow transmission to cool',
        timestamp: transTemp.timestamp,
      });
    }
  }

  // Torque Converter Lockup Status
  const tccStatus = readingMap.get('TCC_STATUS');
  if (tccStatus) {
    // 0 = Off, 1 = On, 2 = Transitioning, 3 = Error
    if (tccStatus.value === 3) {
      issues.push({
        type: 'critical',
        parameter: 'Torque Converter Status',
        shortName: 'TCC_STATUS',
        value: tccStatus.value,
        unit: 'status',
        threshold: 0,
        description: 'Torque converter lockup error detected',
        recommendation: 'Check transmission fluid level and condition',
        timestamp: tccStatus.timestamp,
      });
    }
  }

  return issues;
}

/**
 * Analyze J1939 temperature parameters
 */
export function analyzeJ1939TemperatureParameters(
  readings: J1939ParameterReading[]
): J1939DiagnosticIssue[] {
  const issues: J1939DiagnosticIssue[] = [];
  const readingMap = new Map(readings.map((r) => [r.shortName, r]));

  // Coolant Temperature
  const ect = readingMap.get('ECT');
  if (ect) {
    if (ect.value > 110) {
      issues.push({
        type: 'warning',
        parameter: 'Engine Coolant Temperature',
        shortName: 'ECT',
        value: ect.value,
        unit: '°C',
        threshold: 110,
        description: 'Coolant temperature is elevated',
        recommendation: 'Check cooling system and thermostat',
        timestamp: ect.timestamp,
      });
    }
    if (ect.value > 120) {
      issues.push({
        type: 'critical',
        parameter: 'Engine Coolant Temperature',
        shortName: 'ECT',
        value: ect.value,
        unit: '°C',
        threshold: 120,
        description: 'Engine is overheating',
        recommendation: 'Stop immediately and check cooling system',
        timestamp: ect.timestamp,
      });
    }
  }

  // Oil Temperature
  const oilTemp = readingMap.get('OIL_TEMP');
  if (oilTemp && oilTemp.value > 120) {
    issues.push({
      type: 'warning',
      parameter: 'Engine Oil Temperature',
      shortName: 'OIL_TEMP',
      value: oilTemp.value,
      unit: '°C',
      threshold: 120,
      description: 'Oil temperature is elevated',
      recommendation: 'Check oil level and cooling system',
      timestamp: oilTemp.timestamp,
    });
  }

  // Turbo Inlet Temperature
  const turboInlet = readingMap.get('TURBO_INLET_TEMP');
  if (turboInlet && turboInlet.value > 80) {
    issues.push({
      type: 'info',
      parameter: 'Turbo Inlet Temperature',
      shortName: 'TURBO_INLET_TEMP',
      value: turboInlet.value,
      unit: '°C',
      threshold: 80,
      description: 'Turbo inlet temperature is elevated',
      recommendation: 'Monitor intercooler efficiency',
      timestamp: turboInlet.timestamp,
    });
  }

  // Turbo Outlet Temperature
  const turboOutlet = readingMap.get('TURBO_OUTLET_TEMP');
  if (turboOutlet && turboOutlet.value > 120) {
    issues.push({
      type: 'warning',
      parameter: 'Turbo Outlet Temperature',
      shortName: 'TURBO_OUTLET_TEMP',
      value: turboOutlet.value,
      unit: '°C',
      threshold: 120,
      description: 'Turbo outlet temperature is high',
      recommendation: 'Check intercooler and boost pressure',
      timestamp: turboOutlet.timestamp,
    });
  }

  return issues;
}

/**
 * Generate comprehensive J1939 diagnostic report
 */
export function generateJ1939DiagnosticReport(
  readings: J1939ParameterReading[],
  startTime: number
): J1939DiagnosticReport {
  const engineIssues = analyzeJ1939EngineParameters(readings);
  const transIssues = analyzeJ1939TransmissionParameters(readings);
  const tempIssues = analyzeJ1939TemperatureParameters(readings);

  const allIssues = [...engineIssues, ...transIssues, ...tempIssues];

  // Calculate health scores
  const criticalCount = allIssues.filter((i) => i.type === 'critical').length;
  const warningCount = allIssues.filter((i) => i.type === 'warning').length;

  const engineHealth = Math.max(0, 100 - criticalCount * 20 - warningCount * 5);
  const transmissionHealth = Math.max(0, 100 - transIssues.length * 10);
  const tempStatus =
    criticalCount > 0 ? 'critical' : warningCount > 0 ? 'elevated' : 'normal';

  return {
    timestamp: Date.now(),
    duration: Date.now() - startTime,
    totalReadings: readings.length,
    issues: allIssues,
    engineHealth,
    transmissionHealth,
    temperatureStatus: tempStatus,
    fuelEfficiency: 0, // Calculate from fuel consumption data
  };
}

// ─── K-Line Diagnostics ──────────────────────────────────────────────────────

export interface KLineDiagnosticIssue {
  type: 'warning' | 'critical' | 'info';
  parameter: string;
  shortName: string;
  value: number;
  unit: string;
  threshold: number;
  description: string;
  recommendation: string;
  timestamp: number;
}

export interface KLineDiagnosticReport {
  timestamp: number;
  duration: number;
  totalReadings: number;
  issues: KLineDiagnosticIssue[];
  dtcCount: number;
  engineHealth: number;                // 0-100
  emissionsStatus: string;             // 'compliant', 'non-compliant', 'unknown'
  fuelSystemStatus: string;            // 'open-loop', 'closed-loop', 'fault'
}

/**
 * Analyze K-Line engine parameters
 */
export function analyzeKLineEngineParameters(
  readings: KLineParameterReading[]
): KLineDiagnosticIssue[] {
  const issues: KLineDiagnosticIssue[] = [];
  const readingMap = new Map(readings.map((r) => [r.shortName, r]));

  // RPM Analysis
  const rpm = readingMap.get('RPM');
  if (rpm && rpm.value > 7000) {
    issues.push({
      type: 'warning',
      parameter: 'Engine RPM',
      shortName: 'RPM',
      value: rpm.value,
      unit: 'rpm',
      threshold: 7000,
      description: 'Engine RPM is very high',
      recommendation: 'Reduce engine speed to normal operating range',
      timestamp: rpm.timestamp,
    });
  }

  // Coolant Temperature
  const ect = readingMap.get('ECT');
  if (ect) {
    if (ect.value > 110) {
      issues.push({
        type: 'warning',
        parameter: 'Engine Coolant Temperature',
        shortName: 'ECT',
        value: ect.value,
        unit: '°C',
        threshold: 110,
        description: 'Coolant temperature is elevated',
        recommendation: 'Check cooling system',
        timestamp: ect.timestamp,
      });
    }
    if (ect.value > 120) {
      issues.push({
        type: 'critical',
        parameter: 'Engine Coolant Temperature',
        shortName: 'ECT',
        value: ect.value,
        unit: '°C',
        threshold: 120,
        description: 'Engine is overheating',
        recommendation: 'Stop and check cooling system immediately',
        timestamp: ect.timestamp,
      });
    }
  }

  // Fuel Trim Analysis
  const stft = readingMap.get('STFT1');
  if (stft && Math.abs(stft.value) > 20) {
    issues.push({
      type: 'warning',
      parameter: 'Short Term Fuel Trim (Bank 1)',
      shortName: 'STFT1',
      value: stft.value,
      unit: '%',
      threshold: 20,
      description: 'Fuel trim is out of normal range',
      recommendation: 'Check fuel system and oxygen sensors',
      timestamp: stft.timestamp,
    });
  }

  return issues;
}

/**
 * Generate comprehensive K-Line diagnostic report
 */
export function generateKLineDiagnosticReport(
  readings: KLineParameterReading[],
  dtcs: KLineDTC[],
  startTime: number
): KLineDiagnosticReport {
  const issues = analyzeKLineEngineParameters(readings);

  // Calculate health score
  const criticalCount = issues.filter((i) => i.type === 'critical').length;
  const warningCount = issues.filter((i) => i.type === 'warning').length;
  const engineHealth = Math.max(0, 100 - criticalCount * 20 - warningCount * 5);

  // Determine emissions status
  const emissionsIssues = dtcs.filter((d) => d.spn >= 1000 && d.spn <= 1999);
  const emissionsStatus =
    emissionsIssues.length === 0 ? 'compliant' : 'non-compliant';

  // Determine fuel system status (from fuel trim readings)
  const readingMap = new Map(readings.map((r) => [r.shortName, r]));
  const stft = readingMap.get('STFT1');
  const fuelSystemStatus =
    stft && Math.abs(stft.value) > 20 ? 'fault' : 'closed-loop';

  return {
    timestamp: Date.now(),
    duration: Date.now() - startTime,
    totalReadings: readings.length,
    issues,
    dtcCount: dtcs.length,
    engineHealth,
    emissionsStatus,
    fuelSystemStatus,
  };
}

// ─── Cross-Protocol Diagnostics ──────────────────────────────────────────────

export interface CrossProtocolDiagnosticSummary {
  protocol: 'j1939' | 'kline' | 'obd2';
  vehicleType: string;
  overallHealth: number;              // 0-100
  criticalIssues: number;
  warnings: number;
  recommendations: string[];
  lastUpdated: number;
}

/**
 * Get diagnostic summary for a protocol
 */
export function getDiagnosticSummary(
  protocol: 'j1939' | 'kline',
  report: J1939DiagnosticReport | KLineDiagnosticReport,
  vehicleType: string
): CrossProtocolDiagnosticSummary {
  const issues = report.issues;
  const criticalIssues = issues.filter((i) => i.type === 'critical').length;
  const warnings = issues.filter((i) => i.type === 'warning').length;

  const recommendations = issues
    .filter((i) => i.type === 'critical')
    .map((i) => i.recommendation);

  const overallHealth =
    'engineHealth' in report
      ? Math.min(
          (report as J1939DiagnosticReport).engineHealth,
          'transmissionHealth' in report ? (report as J1939DiagnosticReport).transmissionHealth : 100
        )
      : issues.length === 0
        ? 100
        : 80;

  return {
    protocol,
    vehicleType,
    overallHealth,
    criticalIssues,
    warnings,
    recommendations,
    lastUpdated: report.timestamp,
  };
}
