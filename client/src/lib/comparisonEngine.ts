/**
 * Multi-Protocol Comparative Analysis Engine
 * 
 * TIER 2: Compares data from J1939, K-Line, and OBD-II protocols side-by-side.
 * Features:
 *   - Timestamp alignment across protocols
 *   - Parameter matching (e.g., RPM from OBD-II vs J1939)
 *   - Statistical comparison (mean, std, correlation)
 *   - Protocol quality scoring (latency, resolution, coverage)
 *   - Comparison report generation
 */

import { NormalizedReading } from './protocolDataNormalizer';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProtocolDataset {
  protocol: 'obd2' | 'j1939' | 'kline';
  label: string;
  readings: NormalizedReading[];
  startTime: number;
  endTime: number;
  sampleCount: number;
}

export interface ParameterMatch {
  parameterId: string;
  parameterName: string;
  shortName: string;
  category: string;
  unit: string;
  datasets: {
    protocol: 'obd2' | 'j1939' | 'kline';
    values: number[];
    timestamps: number[];
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    sampleRate: number; // samples per second
  }[];
  correlation: number | null; // Pearson correlation between first two datasets
  meanDifference: number; // Absolute mean difference
  meanDifferencePct: number; // Percentage mean difference
  agreement: 'excellent' | 'good' | 'fair' | 'poor'; // How well protocols agree
}

export interface ProtocolQualityScore {
  protocol: 'obd2' | 'j1939' | 'kline';
  overallScore: number; // 0-100
  metrics: {
    sampleRate: number; // avg samples/sec
    parameterCoverage: number; // % of matched params available
    latencyEstimate: number; // estimated ms between readings
    resolution: number; // avg value resolution
    consistency: number; // low std dev = high consistency
  };
}

export interface ComparisonReport {
  id: string;
  createdAt: number;
  datasets: ProtocolDataset[];
  matchedParameters: ParameterMatch[];
  unmatchedParameters: { protocol: string; params: string[] }[];
  qualityScores: ProtocolQualityScore[];
  summary: {
    totalMatched: number;
    excellentAgreement: number;
    goodAgreement: number;
    fairAgreement: number;
    poorAgreement: number;
    bestProtocol: string;
    recommendations: string[];
  };
}

// ─── Parameter Matching ─────────────────────────────────────────────────────

/**
 * Known cross-protocol parameter equivalences.
 * Maps shortName aliases to a canonical key.
 */
const PARAMETER_ALIASES: Record<string, string> = {
  // Engine RPM
  'RPM': 'engine_rpm',
  'EngineSpeed': 'engine_rpm',
  'Engine Speed': 'engine_rpm',
  'ENGINE_RPM': 'engine_rpm',
  'EngRPM': 'engine_rpm',

  // Vehicle Speed
  'VSS': 'vehicle_speed',
  'VehicleSpeed': 'vehicle_speed',
  'Vehicle Speed': 'vehicle_speed',
  'WheelBasedVehicleSpeed': 'vehicle_speed',
  'VEHICLE_SPEED': 'vehicle_speed',

  // Coolant Temperature
  'ECT': 'coolant_temp',
  'EngineCoolantTemp': 'coolant_temp',
  'Engine Coolant Temperature': 'coolant_temp',
  'ENGINE_COOLANT_TEMP': 'coolant_temp',
  'CoolantTemp': 'coolant_temp',

  // Intake Air Temperature
  'IAT': 'intake_air_temp',
  'IntakeAirTemp': 'intake_air_temp',
  'Intake Air Temperature': 'intake_air_temp',
  'INTAKE_AIR_TEMP': 'intake_air_temp',

  // Boost / MAP
  'MAP': 'manifold_pressure',
  'ManifoldAbsolutePressure': 'manifold_pressure',
  'BoostPressure': 'manifold_pressure',
  'Boost': 'manifold_pressure',
  'BOOST': 'manifold_pressure',
  'BOOST_PRESSURE': 'manifold_pressure',

  // Throttle Position
  'TPS': 'throttle_position',
  'ThrottlePosition': 'throttle_position',
  'Throttle Position': 'throttle_position',
  'APP': 'throttle_position',
  'AccelPedalPos': 'throttle_position',

  // Engine Load
  'LOAD': 'engine_load',
  'EngineLoad': 'engine_load',
  'CalculatedLoad': 'engine_load',
  'ENGINE_LOAD': 'engine_load',
  'PercentLoadAtCurrentSpeed': 'engine_load',

  // Fuel Rate
  'FuelRate': 'fuel_rate',
  'EngineFuelRate': 'fuel_rate',
  'FUEL_RATE': 'fuel_rate',

  // Oil Pressure
  'OilPressure': 'oil_pressure',
  'EngineOilPressure': 'oil_pressure',
  'OIL_PRESSURE': 'oil_pressure',

  // Oil Temperature
  'OilTemp': 'oil_temp',
  'EngineOilTemp': 'oil_temp',
  'OIL_TEMP': 'oil_temp',

  // Transmission Temperature
  'TransTemp': 'trans_temp',
  'TransmissionOilTemp': 'trans_temp',
  'TFT': 'trans_temp',
  'TRANS_TEMP': 'trans_temp',

  // Battery Voltage
  'BatteryVoltage': 'battery_voltage',
  'BATTERY_VOLTAGE': 'battery_voltage',
  'BattVoltage': 'battery_voltage',

  // Exhaust Gas Temperature
  'EGT': 'exhaust_gas_temp',
  'ExhaustGasTemp': 'exhaust_gas_temp',
  'EGT1': 'exhaust_gas_temp',
  'EXHAUST_GAS_TEMP': 'exhaust_gas_temp',
};

/**
 * Resolve a parameter's canonical key for cross-protocol matching
 */
function resolveCanonicalKey(reading: NormalizedReading): string {
  // Try shortName first
  if (PARAMETER_ALIASES[reading.shortName]) {
    return PARAMETER_ALIASES[reading.shortName];
  }
  // Try name
  if (PARAMETER_ALIASES[reading.name]) {
    return PARAMETER_ALIASES[reading.name];
  }
  // Fallback: protocol + category + unit as a rough match
  return `${reading.protocol}_${reading.shortName}`;
}

// ─── Statistics ─────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Pearson correlation coefficient between two arrays.
 * Returns null if arrays are too short or have zero variance.
 */
function pearsonCorrelation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;

  const aSlice = a.slice(0, n);
  const bSlice = b.slice(0, n);
  const meanA = mean(aSlice);
  const meanB = mean(bSlice);
  const stdA = stdDev(aSlice);
  const stdB = stdDev(bSlice);

  if (stdA === 0 || stdB === 0) return null;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (aSlice[i] - meanA) * (bSlice[i] - meanB);
  }
  return sum / ((n - 1) * stdA * stdB);
}

// ─── Timestamp Alignment ────────────────────────────────────────────────────

/**
 * Align two time-series datasets by interpolating to common timestamps.
 * Uses linear interpolation for the shorter dataset.
 */
function alignTimeSeries(
  tsA: number[], valA: number[],
  tsB: number[], valB: number[],
  maxGapMs: number = 500
): { alignedA: number[]; alignedB: number[]; timestamps: number[] } {
  // Use the dataset with more samples as reference
  const [refTs, refVal, otherTs, otherVal, isSwapped] =
    tsA.length >= tsB.length
      ? [tsA, valA, tsB, valB, false]
      : [tsB, valB, tsA, valA, true];

  const alignedRef: number[] = [];
  const alignedOther: number[] = [];
  const timestamps: number[] = [];

  let otherIdx = 0;

  for (let i = 0; i < refTs.length; i++) {
    const t = refTs[i];

    // Find bracketing samples in other dataset
    while (otherIdx < otherTs.length - 1 && otherTs[otherIdx + 1] <= t) {
      otherIdx++;
    }

    if (otherIdx >= otherTs.length - 1) {
      // Past end of other dataset
      if (otherTs.length > 0 && Math.abs(t - otherTs[otherTs.length - 1]) <= maxGapMs) {
        alignedRef.push(refVal[i]);
        alignedOther.push(otherVal[otherTs.length - 1]);
        timestamps.push(t);
      }
      continue;
    }

    const t0 = otherTs[otherIdx];
    const t1 = otherTs[otherIdx + 1];

    // Check gap
    if (t1 - t0 > maxGapMs * 2) continue;
    if (t < t0 - maxGapMs || t > t1 + maxGapMs) continue;

    // Linear interpolation
    const frac = t1 !== t0 ? (t - t0) / (t1 - t0) : 0;
    const interpolated = otherVal[otherIdx] + frac * (otherVal[otherIdx + 1] - otherVal[otherIdx]);

    alignedRef.push(refVal[i]);
    alignedOther.push(interpolated);
    timestamps.push(t);
  }

  return isSwapped
    ? { alignedA: alignedOther, alignedB: alignedRef, timestamps }
    : { alignedA: alignedRef, alignedB: alignedOther, timestamps };
}

// ─── Agreement Classification ───────────────────────────────────────────────

function classifyAgreement(correlation: number | null, meanDiffPct: number): ParameterMatch['agreement'] {
  if (correlation !== null && correlation > 0.95 && meanDiffPct < 3) return 'excellent';
  if (correlation !== null && correlation > 0.85 && meanDiffPct < 8) return 'good';
  if (correlation !== null && correlation > 0.70 && meanDiffPct < 15) return 'fair';
  return 'poor';
}

// ─── Main Comparison Engine ─────────────────────────────────────────────────

/**
 * Build a comparison report from multiple protocol datasets.
 */
export function compareProtocols(datasets: ProtocolDataset[]): ComparisonReport {
  if (datasets.length < 2) {
    return createEmptyReport(datasets);
  }

  // Group readings by canonical key per protocol
  const paramGroups = new Map<string, Map<string, NormalizedReading[]>>();

  for (const ds of datasets) {
    for (const reading of ds.readings) {
      const key = resolveCanonicalKey(reading);
      if (!paramGroups.has(key)) {
        paramGroups.set(key, new Map());
      }
      const protocolMap = paramGroups.get(key)!;
      if (!protocolMap.has(ds.protocol)) {
        protocolMap.set(ds.protocol, []);
      }
      protocolMap.get(ds.protocol)!.push(reading);
    }
  }

  // Build matched parameters (present in 2+ protocols)
  const matchedParameters: ParameterMatch[] = [];
  const unmatchedByProtocol = new Map<string, Set<string>>();

  for (const ds of datasets) {
    unmatchedByProtocol.set(ds.protocol, new Set());
  }

  for (const [canonicalKey, protocolMap] of Array.from(paramGroups.entries())) {
    const protocols = Array.from(protocolMap.keys());

    if (protocols.length < 2) {
      // Unmatched — only in one protocol
      const proto = protocols[0];
      const readings = protocolMap.get(proto)!;
      if (readings.length > 0) {
        unmatchedByProtocol.get(proto)?.add(readings[0].name);
      }
      continue;
    }

    // Build dataset stats for each protocol
    const dsStats = protocols.map(proto => {
      const readings = protocolMap.get(proto)!;
      readings.sort((a, b) => a.timestamp - b.timestamp);
      const values = readings.map(r => r.value);
      const timestamps = readings.map(r => r.timestamp);
      const duration = timestamps.length > 1
        ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
        : 1;

      return {
        protocol: proto as 'obd2' | 'j1939' | 'kline',
        values,
        timestamps,
        mean: mean(values),
        stdDev: stdDev(values),
        min: Math.min(...values),
        max: Math.max(...values),
        sampleRate: values.length / Math.max(duration, 0.001),
      };
    });

    // Compute correlation between first two datasets (aligned)
    let correlation: number | null = null;
    if (dsStats.length >= 2) {
      const aligned = alignTimeSeries(
        dsStats[0].timestamps, dsStats[0].values,
        dsStats[1].timestamps, dsStats[1].values
      );
      if (aligned.alignedA.length >= 5) {
        correlation = pearsonCorrelation(aligned.alignedA, aligned.alignedB);
      }
    }

    const meanDiff = dsStats.length >= 2
      ? Math.abs(dsStats[0].mean - dsStats[1].mean)
      : 0;
    const avgMean = dsStats.length >= 2
      ? (Math.abs(dsStats[0].mean) + Math.abs(dsStats[1].mean)) / 2
      : 1;
    const meanDiffPct = avgMean > 0.001 ? (meanDiff / avgMean) * 100 : 0;

    const firstReading = protocolMap.get(protocols[0])![0];

    matchedParameters.push({
      parameterId: canonicalKey,
      parameterName: firstReading.name,
      shortName: firstReading.shortName,
      category: firstReading.category,
      unit: firstReading.unit,
      datasets: dsStats,
      correlation,
      meanDifference: meanDiff,
      meanDifferencePct: meanDiffPct,
      agreement: classifyAgreement(correlation, meanDiffPct),
    });
  }

  // Build quality scores
  const qualityScores = datasets.map(ds => computeQualityScore(ds, matchedParameters));

  // Build summary
  const excellentCount = matchedParameters.filter(m => m.agreement === 'excellent').length;
  const goodCount = matchedParameters.filter(m => m.agreement === 'good').length;
  const fairCount = matchedParameters.filter(m => m.agreement === 'fair').length;
  const poorCount = matchedParameters.filter(m => m.agreement === 'poor').length;

  const bestProtocol = qualityScores.reduce((best, qs) =>
    qs.overallScore > best.overallScore ? qs : best
  );

  const recommendations = generateRecommendations(matchedParameters, qualityScores, datasets);

  return {
    id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    datasets,
    matchedParameters,
    unmatchedParameters: Array.from(unmatchedByProtocol.entries()).map(([proto, params]) => ({
      protocol: proto,
      params: Array.from(params),
    })),
    qualityScores,
    summary: {
      totalMatched: matchedParameters.length,
      excellentAgreement: excellentCount,
      goodAgreement: goodCount,
      fairAgreement: fairCount,
      poorAgreement: poorCount,
      bestProtocol: bestProtocol.protocol,
      recommendations,
    },
  };
}

// ─── Quality Scoring ────────────────────────────────────────────────────────

function computeQualityScore(
  dataset: ProtocolDataset,
  matchedParams: ParameterMatch[]
): ProtocolQualityScore {
  const duration = (dataset.endTime - dataset.startTime) / 1000;
  const avgSampleRate = dataset.sampleCount / Math.max(duration, 0.001);

  // How many matched params does this protocol cover?
  const totalMatched = matchedParams.length;
  const coveredCount = matchedParams.filter(m =>
    m.datasets.some(d => d.protocol === dataset.protocol)
  ).length;
  const coverage = totalMatched > 0 ? (coveredCount / totalMatched) * 100 : 100;

  // Average latency estimate
  const latency = avgSampleRate > 0 ? 1000 / avgSampleRate : 999;

  // Average resolution (from readings)
  const resolutions = dataset.readings
    .filter(r => r.resolution > 0)
    .map(r => r.resolution);
  const avgResolution = resolutions.length > 0 ? mean(resolutions) : 1;

  // Consistency: average coefficient of variation across matched params
  const cvValues = matchedParams
    .flatMap(m => m.datasets.filter(d => d.protocol === dataset.protocol))
    .filter(d => d.mean !== 0)
    .map(d => d.stdDev / Math.abs(d.mean));
  const avgCV = cvValues.length > 0 ? mean(cvValues) : 0.5;
  const consistency = Math.max(0, 100 - avgCV * 100);

  // Overall score (weighted)
  const sampleRateScore = Math.min(100, avgSampleRate * 10); // 10 Hz = 100
  const coverageScore = coverage;
  const latencyScore = Math.max(0, 100 - latency / 10);
  const resolutionScore = Math.min(100, (1 / Math.max(avgResolution, 0.001)) * 10);
  const consistencyScore = consistency;

  const overall = (
    sampleRateScore * 0.25 +
    coverageScore * 0.25 +
    latencyScore * 0.20 +
    resolutionScore * 0.10 +
    consistencyScore * 0.20
  );

  return {
    protocol: dataset.protocol,
    overallScore: Math.round(Math.min(100, Math.max(0, overall))),
    metrics: {
      sampleRate: Math.round(avgSampleRate * 100) / 100,
      parameterCoverage: Math.round(coverage * 10) / 10,
      latencyEstimate: Math.round(latency),
      resolution: Math.round(avgResolution * 1000) / 1000,
      consistency: Math.round(consistency * 10) / 10,
    },
  };
}

// ─── Recommendations ────────────────────────────────────────────────────────

function generateRecommendations(
  matchedParams: ParameterMatch[],
  qualityScores: ProtocolQualityScore[],
  datasets: ProtocolDataset[]
): string[] {
  const recs: string[] = [];

  // Check for poor agreement
  const poorParams = matchedParams.filter(m => m.agreement === 'poor');
  if (poorParams.length > 0) {
    recs.push(
      `${poorParams.length} parameter(s) show poor agreement between protocols: ${poorParams.slice(0, 3).map(p => p.shortName).join(', ')}. ` +
      `Verify sensor calibration and protocol configuration.`
    );
  }

  // Check sample rate differences
  if (qualityScores.length >= 2) {
    const sorted = [...qualityScores].sort((a, b) => b.metrics.sampleRate - a.metrics.sampleRate);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    if (fastest.metrics.sampleRate > slowest.metrics.sampleRate * 3) {
      recs.push(
        `${fastest.protocol.toUpperCase()} samples ${Math.round(fastest.metrics.sampleRate / slowest.metrics.sampleRate)}x faster than ${slowest.protocol.toUpperCase()}. ` +
        `Use ${fastest.protocol.toUpperCase()} for time-critical parameters.`
      );
    }
  }

  // Protocol-specific recommendations
  for (const qs of qualityScores) {
    if (qs.metrics.parameterCoverage < 50) {
      recs.push(
        `${qs.protocol.toUpperCase()} covers only ${qs.metrics.parameterCoverage}% of matched parameters. ` +
        `Consider supplementing with another protocol for full coverage.`
      );
    }
  }

  // Best protocol recommendation
  const best = qualityScores.reduce((a, b) => a.overallScore > b.overallScore ? a : b);
  if (qualityScores.length >= 2) {
    recs.push(
      `${best.protocol.toUpperCase()} scored highest overall (${best.overallScore}/100). ` +
      `Recommended as primary protocol for this vehicle.`
    );
  }

  // Check for excellent agreement
  const excellentCount = matchedParams.filter(m => m.agreement === 'excellent').length;
  if (excellentCount > 0 && matchedParams.length > 0) {
    const pct = Math.round((excellentCount / matchedParams.length) * 100);
    recs.push(`${pct}% of matched parameters show excellent cross-protocol agreement.`);
  }

  return recs;
}

// ─── Empty Report ───────────────────────────────────────────────────────────

function createEmptyReport(datasets: ProtocolDataset[]): ComparisonReport {
  return {
    id: `cmp_${Date.now()}_empty`,
    createdAt: Date.now(),
    datasets,
    matchedParameters: [],
    unmatchedParameters: [],
    qualityScores: [],
    summary: {
      totalMatched: 0,
      excellentAgreement: 0,
      goodAgreement: 0,
      fairAgreement: 0,
      poorAgreement: 0,
      bestProtocol: datasets[0]?.protocol || 'obd2',
      recommendations: ['Need at least 2 protocol datasets for comparison.'],
    },
  };
}

// ─── Export Comparison as CSV ───────────────────────────────────────────────

export function exportComparisonCSV(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('# Multi-Protocol Comparison Report');
  lines.push(`# Generated: ${new Date(report.createdAt).toISOString()}`);
  lines.push(`# Protocols: ${report.datasets.map(d => d.protocol.toUpperCase()).join(' vs ')}`);
  lines.push(`# Matched Parameters: ${report.summary.totalMatched}`);
  lines.push('');

  // Header
  const protocols = report.datasets.map(d => d.protocol.toUpperCase());
  const header = [
    'Parameter', 'Category', 'Unit',
    ...protocols.flatMap(p => [`${p} Mean`, `${p} StdDev`, `${p} Min`, `${p} Max`, `${p} Rate(Hz)`]),
    'Correlation', 'Mean Diff %', 'Agreement'
  ];
  lines.push(header.join(','));

  // Data rows
  for (const mp of report.matchedParameters) {
    const row: string[] = [
      `"${mp.parameterName}"`,
      mp.category,
      mp.unit,
    ];

    for (const proto of report.datasets.map(d => d.protocol)) {
      const ds = mp.datasets.find(d => d.protocol === proto);
      if (ds) {
        row.push(
          ds.mean.toFixed(2),
          ds.stdDev.toFixed(2),
          ds.min.toFixed(2),
          ds.max.toFixed(2),
          ds.sampleRate.toFixed(1),
        );
      } else {
        row.push('N/A', 'N/A', 'N/A', 'N/A', 'N/A');
      }
    }

    row.push(
      mp.correlation !== null ? mp.correlation.toFixed(4) : 'N/A',
      mp.meanDifferencePct.toFixed(1),
      mp.agreement.toUpperCase(),
    );

    lines.push(row.join(','));
  }

  return lines.join('\n');
}
