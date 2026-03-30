/**
 * Unified Diagnostics Engine
 * 
 * Bridges the normalized protocol data pipeline with the existing diagnostics,
 * reasoning, and health report engines. Allows J1939, K-Line, and OBD-II data
 * to flow through a single analysis pipeline with protocol-aware thresholds.
 */

import {
  NormalizedReading,
  groupByCategory,
  groupByProtocol,
  findByShortName,
  getLatestReadings,
  findEquivalentParameters,
  areEquivalentParameters,
} from './protocolDataNormalizer';

// ─── Unified Diagnostic Types ─────────────────────────────────────────────

export interface UnifiedDiagnosticIssue {
  id: string;
  type: 'info' | 'warning' | 'critical';
  protocol: 'obd2' | 'j1939' | 'kline' | 'cross-protocol';
  category: string;
  parameter: string;
  shortName: string;
  value: number;
  unit: string;
  threshold: number;
  description: string;
  recommendation: string;
  timestamp: number;
  confidence: number; // 0-1, how confident we are in this diagnosis
  relatedParameters?: string[]; // Other parameters that support this finding
}

export interface UnifiedHealthScore {
  overall: number; // 0-100
  engine: number;
  transmission: number;
  thermal: number;
  fuel: number;
  emissions: number;
  turbo: number;
}

export interface UnifiedDiagnosticReport {
  timestamp: number;
  protocol: 'obd2' | 'j1939' | 'kline' | 'multi';
  totalReadings: number;
  issues: UnifiedDiagnosticIssue[];
  health: UnifiedHealthScore;
  operatingState: OperatingState;
  crossProtocolCorrelations: CrossProtocolCorrelation[];
  summary: string;
}

export interface OperatingState {
  isIdling: boolean;
  isUnderLoad: boolean;
  isDecelerating: boolean;
  isWarmingUp: boolean;
  isCruising: boolean;
  rpm: number;
  load: number;
  speed: number;
  coolantTemp: number;
}

export interface CrossProtocolCorrelation {
  parameter: string;
  protocols: string[];
  values: { protocol: string; value: number; unit: string }[];
  deviation: number; // % difference between protocol readings
  status: 'consistent' | 'minor-deviation' | 'significant-deviation';
}

// ─── Protocol-Aware Thresholds ────────────────────────────────────────────

interface ThresholdSet {
  warning: number;
  critical: number;
  direction: 'above' | 'below' | 'both';
}

const THRESHOLDS: Record<string, Record<string, ThresholdSet>> = {
  // Engine RPM thresholds by protocol
  RPM: {
    obd2: { warning: 5500, critical: 6500, direction: 'above' },
    j1939: { warning: 2500, critical: 3200, direction: 'above' },
    kline: { warning: 5500, critical: 6500, direction: 'above' },
  },
  // Coolant Temperature
  ECT: {
    obd2: { warning: 105, critical: 115, direction: 'above' },
    j1939: { warning: 100, critical: 110, direction: 'above' },
    kline: { warning: 105, critical: 115, direction: 'above' },
  },
  // Oil Temperature
  OIL_TEMP: {
    obd2: { warning: 120, critical: 135, direction: 'above' },
    j1939: { warning: 115, critical: 130, direction: 'above' },
    kline: { warning: 120, critical: 135, direction: 'above' },
  },
  // Transmission Temperature
  TRANS_TEMP: {
    obd2: { warning: 100, critical: 120, direction: 'above' },
    j1939: { warning: 95, critical: 115, direction: 'above' },
    kline: { warning: 100, critical: 120, direction: 'above' },
  },
  // Boost Pressure (kPa)
  BOOST: {
    obd2: { warning: 200, critical: 250, direction: 'above' },
    j1939: { warning: 250, critical: 310, direction: 'above' },
    kline: { warning: 200, critical: 250, direction: 'above' },
  },
  // Engine Load
  LOAD: {
    obd2: { warning: 90, critical: 100, direction: 'above' },
    j1939: { warning: 85, critical: 95, direction: 'above' },
    kline: { warning: 90, critical: 100, direction: 'above' },
  },
  // Fuel Trim (absolute value)
  STFT: {
    obd2: { warning: 15, critical: 25, direction: 'both' },
    j1939: { warning: 15, critical: 25, direction: 'both' },
    kline: { warning: 15, critical: 25, direction: 'both' },
  },
  LTFT: {
    obd2: { warning: 10, critical: 20, direction: 'both' },
    j1939: { warning: 10, critical: 20, direction: 'both' },
    kline: { warning: 10, critical: 20, direction: 'both' },
  },
  // EGT
  EGT: {
    obd2: { warning: 700, critical: 850, direction: 'above' },
    j1939: { warning: 650, critical: 800, direction: 'above' },
    kline: { warning: 700, critical: 850, direction: 'above' },
  },
  // Rail Pressure (MPa)
  RAIL_PRESSURE: {
    obd2: { warning: 180, critical: 200, direction: 'above' },
    j1939: { warning: 200, critical: 230, direction: 'above' },
    kline: { warning: 180, critical: 200, direction: 'above' },
  },
};

function getThreshold(shortName: string, protocol: string): ThresholdSet | null {
  const normalized = shortName.toUpperCase();

  // Direct match
  if (THRESHOLDS[normalized]?.[protocol]) {
    return THRESHOLDS[normalized][protocol];
  }

  // Fuzzy match
  for (const [key, protocols] of Object.entries(THRESHOLDS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return protocols[protocol] || protocols['obd2'];
    }
  }

  return null;
}

// ─── Operating State Detection ────────────────────────────────────────────

function detectOperatingState(readings: NormalizedReading[]): OperatingState {
  const latest = getLatestReadings(readings);

  // Find RPM from any protocol
  const rpmReading = findByShortName(Array.from(latest.values()), 'RPM')
    || findByShortName(Array.from(latest.values()), 'ENG_SPD')
    || findByShortName(Array.from(latest.values()), 'ENGINE_SPEED');

  const loadReading = findByShortName(Array.from(latest.values()), 'LOAD')
    || findByShortName(Array.from(latest.values()), 'ENG_LOAD')
    || findByShortName(Array.from(latest.values()), 'ENGINE_LOAD');

  const speedReading = findByShortName(Array.from(latest.values()), 'VSS')
    || findByShortName(Array.from(latest.values()), 'VEHICLE_SPEED')
    || findByShortName(Array.from(latest.values()), 'WHEEL_SPEED');

  const ectReading = findByShortName(Array.from(latest.values()), 'ECT')
    || findByShortName(Array.from(latest.values()), 'COOLANT_TEMP');

  const rpm = rpmReading?.value ?? 0;
  const load = loadReading?.value ?? 0;
  const speed = speedReading?.value ?? 0;
  const coolantTemp = ectReading?.value ?? 0;

  return {
    isIdling: rpm > 0 && rpm < 900 && speed < 5,
    isUnderLoad: load > 60 && rpm > 1500,
    isDecelerating: load < 10 && rpm > 1200,
    isWarmingUp: coolantTemp < 70 && coolantTemp > 0,
    isCruising: speed > 50 && load < 50 && load > 10,
    rpm,
    load,
    speed,
    coolantTemp,
  };
}

// ─── Threshold-Based Analysis ─────────────────────────────────────────────

function analyzeThresholds(readings: NormalizedReading[]): UnifiedDiagnosticIssue[] {
  const issues: UnifiedDiagnosticIssue[] = [];
  const latest = getLatestReadings(readings);

  for (const [, reading] of Array.from(latest)) {
    const threshold = getThreshold(reading.shortName, reading.protocol);
    if (!threshold) continue;

    const value = reading.value;
    let issueType: 'warning' | 'critical' | null = null;

    if (threshold.direction === 'above') {
      if (value >= threshold.critical) issueType = 'critical';
      else if (value >= threshold.warning) issueType = 'warning';
    } else if (threshold.direction === 'below') {
      if (value <= threshold.critical) issueType = 'critical';
      else if (value <= threshold.warning) issueType = 'warning';
    } else {
      // 'both' — check absolute value
      const absVal = Math.abs(value);
      if (absVal >= threshold.critical) issueType = 'critical';
      else if (absVal >= threshold.warning) issueType = 'warning';
    }

    if (issueType) {
      issues.push({
        id: `threshold_${reading.protocol}_${reading.shortName}`,
        type: issueType,
        protocol: reading.protocol,
        category: reading.category,
        parameter: reading.name,
        shortName: reading.shortName,
        value: reading.value,
        unit: reading.unit,
        threshold: issueType === 'critical' ? threshold.critical : threshold.warning,
        description: `${reading.name} is ${issueType === 'critical' ? 'critically' : ''} ${threshold.direction === 'below' ? 'low' : 'high'}: ${reading.value} ${reading.unit}`,
        recommendation: generateRecommendation(reading.shortName, issueType, reading.protocol),
        timestamp: reading.timestamp,
        confidence: 0.85,
      });
    }
  }

  return issues;
}

function generateRecommendation(shortName: string, severity: string, protocol: string): string {
  const name = shortName.toUpperCase();

  if (name.includes('ECT') || name.includes('COOLANT')) {
    return severity === 'critical'
      ? 'Stop immediately. Check coolant level, thermostat, and water pump.'
      : 'Monitor coolant temperature. Check for restricted airflow or low coolant.';
  }
  if (name.includes('OIL_TEMP') || name.includes('OIL')) {
    return 'Check oil level and condition. Verify oil cooler operation.';
  }
  if (name.includes('TRANS_TEMP') || name.includes('TRANS')) {
    return severity === 'critical'
      ? 'Stop and allow transmission to cool. Check fluid level and condition.'
      : 'Reduce load and monitor transmission temperature.';
  }
  if (name.includes('RPM') || name.includes('ENG_SPD')) {
    return protocol === 'j1939'
      ? 'Heavy-duty engine RPM elevated. Check governor settings and load.'
      : 'Reduce engine speed to normal operating range.';
  }
  if (name.includes('BOOST')) {
    return 'Check turbo wastegate/VGT actuator. Verify boost control solenoid.';
  }
  if (name.includes('EGT') || name.includes('EXHAUST')) {
    return severity === 'critical'
      ? 'Reduce load immediately. Excessive EGT can damage turbo and exhaust components.'
      : 'Monitor EGT under load. Check for restricted exhaust or over-fueling.';
  }
  if (name.includes('RAIL') || name.includes('FUEL_PRESSURE')) {
    return 'Check fuel filter, fuel pump, and injectors. Verify fuel supply pressure.';
  }
  if (name.includes('STFT') || name.includes('LTFT') || name.includes('FUEL_TRIM')) {
    return 'Check for vacuum leaks, faulty O2 sensors, or fuel delivery issues.';
  }

  return 'Monitor this parameter and consult service manual for specific guidance.';
}

// ─── Pattern-Based Analysis ───────────────────────────────────────────────

function analyzePatterns(readings: NormalizedReading[], state: OperatingState): UnifiedDiagnosticIssue[] {
  const issues: UnifiedDiagnosticIssue[] = [];
  const latest = getLatestReadings(readings);
  const latestArr = Array.from(latest.values());

  // Pattern 1: High coolant + low oil pressure = potential head gasket
  const ect = findByShortName(latestArr, 'ECT') || findByShortName(latestArr, 'COOLANT_TEMP');
  const oilPress = findByShortName(latestArr, 'OIL_PRESSURE') || findByShortName(latestArr, 'OIL_PRESS');

  if (ect && oilPress && ect.value > 100 && oilPress.value < 20) {
    issues.push({
      id: 'pattern_head_gasket_suspect',
      type: 'critical',
      protocol: 'cross-protocol',
      category: 'engine',
      parameter: 'Head Gasket Integrity',
      shortName: 'HEAD_GASKET',
      value: ect.value,
      unit: '°C',
      threshold: 100,
      description: 'High coolant temperature combined with low oil pressure may indicate head gasket failure',
      recommendation: 'Perform compression test and check for coolant in oil. Do not continue driving.',
      timestamp: ect.timestamp,
      confidence: 0.65,
      relatedParameters: ['ECT', 'OIL_PRESSURE'],
    });
  }

  // Pattern 2: High EGT + low boost = turbo failure or boost leak
  const egt = findByShortName(latestArr, 'EGT') || findByShortName(latestArr, 'EXHAUST_TEMP');
  const boost = findByShortName(latestArr, 'BOOST') || findByShortName(latestArr, 'BOOST_PRESSURE') || findByShortName(latestArr, 'MAP');

  if (egt && boost && state.isUnderLoad && egt.value > 600 && boost.value < 100) {
    issues.push({
      id: 'pattern_turbo_failure',
      type: 'warning',
      protocol: 'cross-protocol',
      category: 'turbo',
      parameter: 'Turbo System Integrity',
      shortName: 'TURBO_SYSTEM',
      value: egt.value,
      unit: '°C',
      threshold: 600,
      description: 'High exhaust temperature with low boost under load suggests turbo inefficiency or boost leak',
      recommendation: 'Inspect turbo for shaft play, check all boost piping and intercooler connections.',
      timestamp: egt.timestamp,
      confidence: 0.70,
      relatedParameters: ['EGT', 'BOOST', 'LOAD'],
    });
  }

  // Pattern 3: Warm-up analysis — coolant not reaching temp
  if (state.isWarmingUp && state.rpm > 0) {
    const warmupReadings = readings.filter(r =>
      (r.shortName.toUpperCase().includes('ECT') || r.shortName.toUpperCase().includes('COOLANT'))
    );
    if (warmupReadings.length > 10) {
      const first = warmupReadings[0];
      const last = warmupReadings[warmupReadings.length - 1];
      const timeDiff = (last.timestamp - first.timestamp) / 1000; // seconds
      const tempDiff = last.value - first.value;

      // If running for > 5 min and temp hasn't risen much
      if (timeDiff > 300 && tempDiff < 10 && last.value < 60) {
        issues.push({
          id: 'pattern_thermostat_stuck_open',
          type: 'warning',
          protocol: 'cross-protocol',
          category: 'cooling',
          parameter: 'Thermostat Operation',
          shortName: 'THERMOSTAT',
          value: last.value,
          unit: '°C',
          threshold: 60,
          description: 'Coolant temperature is not rising normally — thermostat may be stuck open',
          recommendation: 'Check thermostat operation. A stuck-open thermostat reduces fuel efficiency and increases wear.',
          timestamp: last.timestamp,
          confidence: 0.60,
          relatedParameters: ['ECT'],
        });
      }
    }
  }

  // Pattern 4: Idle instability — RPM fluctuation at idle
  if (state.isIdling) {
    const rpmReadings = readings.filter(r =>
      r.shortName.toUpperCase().includes('RPM') || r.shortName.toUpperCase().includes('ENG_SPD')
    );
    if (rpmReadings.length > 5) {
      const rpmValues = rpmReadings.map(r => r.value);
      const mean = rpmValues.reduce((a, b) => a + b, 0) / rpmValues.length;
      const variance = rpmValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / rpmValues.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > 50) {
        issues.push({
          id: 'pattern_idle_instability',
          type: 'warning',
          protocol: 'cross-protocol',
          category: 'engine',
          parameter: 'Idle Stability',
          shortName: 'IDLE_STABILITY',
          value: Math.round(stdDev),
          unit: 'rpm σ',
          threshold: 50,
          description: `Idle RPM fluctuation detected (σ=${Math.round(stdDev)} rpm). May indicate vacuum leak, dirty IAC, or injector issue.`,
          recommendation: 'Check for vacuum leaks, clean idle air control valve, and inspect fuel injectors.',
          timestamp: rpmReadings[rpmReadings.length - 1].timestamp,
          confidence: 0.72,
          relatedParameters: ['RPM'],
        });
      }
    }
  }

  // Pattern 5: Fuel trim divergence (rich/lean)
  const stft = findByShortName(latestArr, 'STFT1') || findByShortName(latestArr, 'STFT');
  const ltft = findByShortName(latestArr, 'LTFT1') || findByShortName(latestArr, 'LTFT');

  if (stft && ltft) {
    const totalTrim = stft.value + ltft.value;
    if (Math.abs(totalTrim) > 25) {
      const isRich = totalTrim < 0;
      issues.push({
        id: 'pattern_fuel_trim_divergence',
        type: 'warning',
        protocol: 'cross-protocol',
        category: 'fuel',
        parameter: 'Fuel Trim Balance',
        shortName: 'FUEL_TRIM_BALANCE',
        value: Math.round(totalTrim * 10) / 10,
        unit: '%',
        threshold: 25,
        description: `Combined fuel trim is ${isRich ? 'rich' : 'lean'} (${totalTrim.toFixed(1)}%). ${isRich ? 'Excess fuel detected.' : 'Lean condition detected.'}`,
        recommendation: isRich
          ? 'Check for leaking injectors, high fuel pressure, or faulty MAF sensor.'
          : 'Check for vacuum leaks, low fuel pressure, or restricted fuel filter.',
        timestamp: stft.timestamp,
        confidence: 0.80,
        relatedParameters: ['STFT1', 'LTFT1'],
      });
    }
  }

  return issues;
}

// ─── Cross-Protocol Correlation ───────────────────────────────────────────

function findCrossProtocolCorrelations(readings: NormalizedReading[]): CrossProtocolCorrelation[] {
  const correlations: CrossProtocolCorrelation[] = [];
  const byProtocol = groupByProtocol(readings);

  if (byProtocol.size < 2) return correlations; // Need at least 2 protocols

  const protocols = Array.from(byProtocol.keys());

  // Get latest readings per protocol
  const latestByProtocol: Record<string, Map<string, NormalizedReading>> = {};
  for (const [proto, protoReadings] of Array.from(byProtocol)) {
    latestByProtocol[proto] = getLatestReadings(protoReadings);
  }

  // Compare equivalent parameters across protocols
  const checkedPairs = new Set<string>();

  for (const proto1 of protocols) {
        for (const [, reading1] of Array.from(latestByProtocol[proto1])) {
      for (const proto2 of protocols) {
        if (proto1 === proto2) continue;
        const pairKey = `${reading1.shortName}_${proto1}_${proto2}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

          for (const [, reading2] of Array.from(latestByProtocol[proto2])) {
          if (areEquivalentParameters(reading1, reading2)) {
            const maxVal = Math.max(Math.abs(reading1.value), Math.abs(reading2.value));
            const deviation = maxVal > 0
              ? Math.abs(reading1.value - reading2.value) / maxVal * 100
              : 0;

            correlations.push({
              parameter: reading1.name,
              protocols: [proto1, proto2],
              values: [
                { protocol: proto1, value: reading1.value, unit: reading1.unit },
                { protocol: proto2, value: reading2.value, unit: reading2.unit },
              ],
              deviation: Math.round(deviation * 10) / 10,
              status: deviation < 5 ? 'consistent' : deviation < 15 ? 'minor-deviation' : 'significant-deviation',
            });
          }
        }
      }
    }
  }

  return correlations;
}

// ─── Health Score Calculation ──────────────────────────────────────────────

function calculateHealthScores(
  issues: UnifiedDiagnosticIssue[],
  readings: NormalizedReading[]
): UnifiedHealthScore {
  const byCategory = groupByCategory(readings);
  const categories = Array.from(byCategory.keys());

  function scoreForCategory(cat: string): number {
    const catIssues = issues.filter(i => i.category === cat);
    const criticals = catIssues.filter(i => i.type === 'critical').length;
    const warnings = catIssues.filter(i => i.type === 'warning').length;
    return Math.max(0, 100 - criticals * 25 - warnings * 8);
  }

  const engine = categories.includes('engine') ? scoreForCategory('engine') : 100;
  const transmission = categories.includes('transmission') ? scoreForCategory('transmission') : 100;
  const thermal = scoreForCategory('cooling') * 0.5 + scoreForCategory('exhaust') * 0.5 || 100;
  const fuel = scoreForCategory('fuel');
  const emissions = scoreForCategory('emissions') || 100;
  const turbo = scoreForCategory('turbo') || 100;

  const overall = Math.round(
    engine * 0.25 + transmission * 0.15 + thermal * 0.15 + fuel * 0.20 + emissions * 0.10 + turbo * 0.15
  );

  return { overall, engine, transmission, thermal, fuel, emissions, turbo };
}

// ─── Summary Generation ───────────────────────────────────────────────────

function generateSummary(
  issues: UnifiedDiagnosticIssue[],
  health: UnifiedHealthScore,
  state: OperatingState,
  protocol: string
): string {
  const criticals = issues.filter(i => i.type === 'critical');
  const warnings = issues.filter(i => i.type === 'warning');

  if (criticals.length === 0 && warnings.length === 0) {
    return `All ${protocol.toUpperCase()} parameters are within normal operating ranges. Vehicle health score: ${health.overall}/100.`;
  }

  const parts: string[] = [];

  if (criticals.length > 0) {
    parts.push(`${criticals.length} critical issue${criticals.length > 1 ? 's' : ''} detected`);
  }
  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`);
  }

  const stateDesc = state.isIdling ? 'at idle' :
    state.isUnderLoad ? 'under load' :
    state.isCruising ? 'while cruising' :
    state.isDecelerating ? 'during deceleration' : '';

  return `${parts.join(' and ')}${stateDesc ? ` ${stateDesc}` : ''}. Overall health: ${health.overall}/100. ${criticals.length > 0 ? 'Immediate attention recommended.' : 'Monitor and schedule service.'}`;
}

// ─── Main Analysis Entry Point ────────────────────────────────────────────

/**
 * Run unified diagnostics on normalized readings from any protocol
 */
export function runUnifiedDiagnostics(readings: NormalizedReading[]): UnifiedDiagnosticReport {
  if (readings.length === 0) {
    return {
      timestamp: Date.now(),
      protocol: 'obd2',
      totalReadings: 0,
      issues: [],
      health: { overall: 100, engine: 100, transmission: 100, thermal: 100, fuel: 100, emissions: 100, turbo: 100 },
      operatingState: { isIdling: false, isUnderLoad: false, isDecelerating: false, isWarmingUp: false, isCruising: false, rpm: 0, load: 0, speed: 0, coolantTemp: 0 },
      crossProtocolCorrelations: [],
      summary: 'No data available for analysis.',
    };
  }

  // Determine protocol(s)
  const protocols = new Set(readings.map(r => r.protocol));
  const protocol = protocols.size > 1 ? 'multi' : (Array.from(protocols)[0] as 'obd2' | 'j1939' | 'kline');

  // Detect operating state
  const state = detectOperatingState(readings);

  // Run threshold analysis
  const thresholdIssues = analyzeThresholds(readings);

  // Run pattern analysis
  const patternIssues = analyzePatterns(readings, state);

  // Combine and deduplicate
  const allIssues = [...thresholdIssues, ...patternIssues];
  const deduped = deduplicateIssues(allIssues);

  // Calculate health scores
  const health = calculateHealthScores(deduped, readings);

  // Find cross-protocol correlations
  const correlations = findCrossProtocolCorrelations(readings);

  // Generate summary
  const summary = generateSummary(deduped, health, state, protocol);

  return {
    timestamp: Date.now(),
    protocol,
    totalReadings: readings.length,
    issues: deduped,
    health,
    operatingState: state,
    crossProtocolCorrelations: correlations,
    summary,
  };
}

function deduplicateIssues(issues: UnifiedDiagnosticIssue[]): UnifiedDiagnosticIssue[] {
  const seen = new Map<string, UnifiedDiagnosticIssue>();

  for (const issue of issues) {
    const existing = seen.get(issue.id);
    if (!existing || severityRank(issue.type) > severityRank(existing.type)) {
      seen.set(issue.id, issue);
    }
  }

  return Array.from(seen.values()).sort((a, b) => severityRank(b.type) - severityRank(a.type));
}

function severityRank(type: string): number {
  switch (type) {
    case 'critical': return 3;
    case 'warning': return 2;
    case 'info': return 1;
    default: return 0;
  }
}

// ─── Convenience Exports ──────────────────────────────────────────────────

export { detectOperatingState, analyzeThresholds, analyzePatterns, findCrossProtocolCorrelations };
