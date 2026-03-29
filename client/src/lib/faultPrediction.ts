/**
 * ML Fault Prediction & Trend Analysis Engine
 * 
 * TIER 2: Detects parameter drift, predicts emerging faults, and scores
 * fault probability using statistical pattern matching.
 *
 * Techniques:
 *   - Moving average trend detection (linear regression on sliding windows)
 *   - Anomaly detection via z-score and IQR methods
 *   - Pattern matching against known fault signatures
 *   - Predictive scoring based on rate-of-change and threshold proximity
 *   - Historical baseline comparison
 */

import { NormalizedReading } from './protocolDataNormalizer';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TrendResult {
  parameterId: string;
  parameterName: string;
  shortName: string;
  unit: string;
  category: string;
  trend: 'increasing' | 'decreasing' | 'stable' | 'oscillating' | 'erratic';
  slope: number; // units per second
  slopeNormalized: number; // % of range per minute
  rSquared: number; // goodness of fit (0-1)
  confidence: 'high' | 'medium' | 'low';
  currentValue: number;
  predictedValue30s: number;
  predictedValue60s: number;
  predictedValue300s: number;
  isApproachingLimit: boolean;
  limitType?: 'upper' | 'lower';
  timeToLimit?: number; // seconds until limit reached
  anomalyCount: number;
  anomalies: AnomalyEvent[];
}

export interface AnomalyEvent {
  timestamp: number;
  value: number;
  expectedValue: number;
  deviation: number; // z-score
  severity: 'minor' | 'moderate' | 'severe';
  type: 'spike' | 'dip' | 'plateau' | 'oscillation';
}

export interface FaultPrediction {
  id: string;
  parameterId: string;
  parameterName: string;
  shortName: string;
  category: string;
  probability: number; // 0-100
  severity: 'low' | 'medium' | 'high' | 'critical';
  predictedFault: string;
  description: string;
  evidence: string[];
  timeToFault?: number; // estimated seconds
  confidence: 'high' | 'medium' | 'low';
  relatedParameters: string[];
}

export interface FaultSignature {
  name: string;
  description: string;
  conditions: {
    parameterId: string;
    shortNames: string[];
    check: 'above' | 'below' | 'increasing' | 'decreasing' | 'erratic' | 'oscillating';
    threshold?: number;
    slopeThreshold?: number;
  }[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  faultCode: string;
}

export interface PredictionReport {
  createdAt: number;
  trends: TrendResult[];
  predictions: FaultPrediction[];
  anomalySummary: {
    totalAnomalies: number;
    severeAnomalies: number;
    affectedParameters: number;
  };
  overallRisk: 'low' | 'moderate' | 'elevated' | 'high';
  recommendations: string[];
}

// ─── Known Fault Signatures ────────────────────────────────────────────────

const FAULT_SIGNATURES: FaultSignature[] = [
  {
    name: 'Coolant System Degradation',
    description: 'Engine coolant temperature trending upward, indicating potential cooling system failure',
    conditions: [
      { parameterId: 'coolant_temp', shortNames: ['ECT', 'CoolantTemp', 'EngineCoolantTemp'], check: 'increasing', slopeThreshold: 0.05 },
    ],
    severity: 'high',
    faultCode: 'PRED_COOLANT_RISE',
  },
  {
    name: 'Boost Pressure Loss',
    description: 'Boost pressure declining under load, indicating turbo or intercooler leak',
    conditions: [
      { parameterId: 'manifold_pressure', shortNames: ['MAP', 'Boost', 'BoostPressure'], check: 'decreasing', slopeThreshold: -0.1 },
    ],
    severity: 'high',
    faultCode: 'PRED_BOOST_LOSS',
  },
  {
    name: 'Fuel Pressure Instability',
    description: 'Fuel rail pressure showing erratic behavior, indicating pump or regulator issue',
    conditions: [
      { parameterId: 'fuel_pressure', shortNames: ['FRP', 'RailPressure', 'FuelRailPressure'], check: 'erratic' },
    ],
    severity: 'critical',
    faultCode: 'PRED_FUEL_ERRATIC',
  },
  {
    name: 'Transmission Temperature Rise',
    description: 'Transmission fluid temperature trending upward, indicating excessive slip or cooling issue',
    conditions: [
      { parameterId: 'trans_temp', shortNames: ['TFT', 'TransTemp', 'TransmissionOilTemp'], check: 'increasing', slopeThreshold: 0.03 },
    ],
    severity: 'medium',
    faultCode: 'PRED_TRANS_HEAT',
  },
  {
    name: 'Oil Pressure Decline',
    description: 'Engine oil pressure trending downward, indicating wear or oil system issue',
    conditions: [
      { parameterId: 'oil_pressure', shortNames: ['OilPressure', 'EngineOilPressure'], check: 'decreasing', slopeThreshold: -0.02 },
    ],
    severity: 'critical',
    faultCode: 'PRED_OIL_DROP',
  },
  {
    name: 'Battery Voltage Sag',
    description: 'Battery voltage declining, indicating alternator or battery degradation',
    conditions: [
      { parameterId: 'battery_voltage', shortNames: ['BatteryVoltage', 'BattVoltage'], check: 'below', threshold: 12.5 },
    ],
    severity: 'medium',
    faultCode: 'PRED_BATT_SAG',
  },
  {
    name: 'Exhaust Temperature Spike',
    description: 'EGT rising rapidly, indicating rich condition or DPF regen',
    conditions: [
      { parameterId: 'exhaust_gas_temp', shortNames: ['EGT', 'EGT1', 'ExhaustGasTemp'], check: 'increasing', slopeThreshold: 0.5 },
    ],
    severity: 'high',
    faultCode: 'PRED_EGT_RISE',
  },
  {
    name: 'Engine Load Oscillation',
    description: 'Engine load showing unusual oscillation pattern, indicating fueling or sensor issue',
    conditions: [
      { parameterId: 'engine_load', shortNames: ['LOAD', 'EngineLoad', 'CalculatedLoad'], check: 'oscillating' },
    ],
    severity: 'medium',
    faultCode: 'PRED_LOAD_OSCILLATE',
  },
  {
    name: 'RPM Instability',
    description: 'Engine RPM showing erratic behavior at idle or steady state',
    conditions: [
      { parameterId: 'engine_rpm', shortNames: ['RPM', 'EngineSpeed', 'EngRPM'], check: 'erratic' },
    ],
    severity: 'medium',
    faultCode: 'PRED_RPM_ERRATIC',
  },
];

// ─── Statistics Helpers ─────────────────────────────────────────────────────

function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] || 0, rSquared: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
    sumYY += y[i] * y[i];
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n, rSquared: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssTot = sumYY - (sumY * sumY) / n;
  const ssRes = sumYY - intercept * sumY - slope * sumXY;
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;

  return { slope, intercept, rSquared };
}

function movingAverage(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(window / 2));
    const end = Math.min(values.length, i + Math.ceil(window / 2));
    let sum = 0;
    for (let j = start; j < end; j++) sum += values[j];
    result.push(sum / (end - start));
  }
  return result;
}

function zScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

function computeMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function computeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = computeMean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ─── Trend Detection ────────────────────────────────────────────────────────

function classifyTrend(slope: number, rSquared: number, values: number[]): TrendResult['trend'] {
  const stdDev = computeStdDev(values);
  const mean = computeMean(values);
  const cv = mean !== 0 ? stdDev / Math.abs(mean) : 0;

  // Check for erratic behavior (high coefficient of variation, low R²)
  if (cv > 0.3 && rSquared < 0.3) return 'erratic';

  // Check for oscillation (alternating above/below moving average)
  const ma = movingAverage(values, Math.max(5, Math.floor(values.length / 10)));
  let crossings = 0;
  let above = values[0] > ma[0];
  for (let i = 1; i < values.length; i++) {
    const nowAbove = values[i] > ma[i];
    if (nowAbove !== above) {
      crossings++;
      above = nowAbove;
    }
  }
  const crossingRate = crossings / values.length;
  if (crossingRate > 0.15 && rSquared < 0.4) return 'oscillating';

  // Linear trend
  if (rSquared > 0.3) {
    const normalizedSlope = mean !== 0 ? Math.abs(slope / mean) : Math.abs(slope);
    if (normalizedSlope < 0.001) return 'stable';
    return slope > 0 ? 'increasing' : 'decreasing';
  }

  return 'stable';
}

// ─── Anomaly Detection ──────────────────────────────────────────────────────

function detectAnomalies(
  timestamps: number[],
  values: number[],
  windowSize: number = 20
): AnomalyEvent[] {
  const anomalies: AnomalyEvent[] = [];
  if (values.length < windowSize * 2) return anomalies;

  for (let i = windowSize; i < values.length; i++) {
    const windowValues = values.slice(Math.max(0, i - windowSize), i);
    const mean = computeMean(windowValues);
    const std = computeStdDev(windowValues);

    if (std < 0.001) continue;

    const z = zScore(values[i], mean, std);
    const absZ = Math.abs(z);

    if (absZ > 2.5) {
      let severity: AnomalyEvent['severity'] = 'minor';
      if (absZ > 4) severity = 'severe';
      else if (absZ > 3) severity = 'moderate';

      let type: AnomalyEvent['type'] = z > 0 ? 'spike' : 'dip';

      // Check for plateau (sustained deviation)
      if (i + 3 < values.length) {
        const nextValues = values.slice(i, i + 3);
        const allSameDirection = nextValues.every(v => Math.abs(zScore(v, mean, std)) > 2);
        if (allSameDirection) type = 'plateau';
      }

      anomalies.push({
        timestamp: timestamps[i],
        value: values[i],
        expectedValue: mean,
        deviation: z,
        severity,
        type,
      });
    }
  }

  return anomalies;
}

// ─── Main Analysis Functions ────────────────────────────────────────────────

/**
 * Analyze trends for a set of normalized readings grouped by parameter.
 */
export function analyzeTrends(readings: NormalizedReading[]): TrendResult[] {
  // Group by parameter ID
  const groups = new Map<string, NormalizedReading[]>();
  for (const r of readings) {
    if (!groups.has(r.id)) groups.set(r.id, []);
    groups.get(r.id)!.push(r);
  }

  const results: TrendResult[] = [];

  for (const [paramId, paramReadings] of Array.from(groups.entries())) {
    if (paramReadings.length < 10) continue; // Need minimum data

    // Sort by timestamp
    paramReadings.sort((a, b) => a.timestamp - b.timestamp);

    const timestamps = paramReadings.map(r => r.timestamp);
    const values = paramReadings.map(r => r.value);
    const first = paramReadings[0];

    // Normalize timestamps to seconds from start
    const t0 = timestamps[0];
    const tNorm = timestamps.map(t => (t - t0) / 1000);

    // Linear regression
    const reg = linearRegression(tNorm, values);
    const trend = classifyTrend(reg.slope, reg.rSquared, values);

    // Normalized slope (% of range per minute)
    const range = first.max - first.min;
    const slopeNormalized = range > 0 ? (reg.slope * 60 / range) * 100 : 0;

    // Confidence based on R² and sample count
    let confidence: TrendResult['confidence'] = 'low';
    if (reg.rSquared > 0.7 && paramReadings.length > 50) confidence = 'high';
    else if (reg.rSquared > 0.4 && paramReadings.length > 20) confidence = 'medium';

    // Predictions
    const lastT = tNorm[tNorm.length - 1];
    const currentValue = values[values.length - 1];
    const predictedValue30s = reg.intercept + reg.slope * (lastT + 30);
    const predictedValue60s = reg.intercept + reg.slope * (lastT + 60);
    const predictedValue300s = reg.intercept + reg.slope * (lastT + 300);

    // Limit approach detection
    let isApproachingLimit = false;
    let limitType: 'upper' | 'lower' | undefined;
    let timeToLimit: number | undefined;

    if (reg.slope > 0 && first.max > 0) {
      const remaining = first.max - currentValue;
      if (remaining > 0 && reg.slope > 0) {
        const ttl = remaining / reg.slope;
        if (ttl < 600 && ttl > 0) { // Within 10 minutes
          isApproachingLimit = true;
          limitType = 'upper';
          timeToLimit = ttl;
        }
      }
    } else if (reg.slope < 0 && first.min >= 0) {
      const remaining = currentValue - first.min;
      if (remaining > 0 && reg.slope < 0) {
        const ttl = remaining / Math.abs(reg.slope);
        if (ttl < 600 && ttl > 0) {
          isApproachingLimit = true;
          limitType = 'lower';
          timeToLimit = ttl;
        }
      }
    }

    // Anomaly detection
    const anomalies = detectAnomalies(timestamps, values);

    results.push({
      parameterId: paramId,
      parameterName: first.name,
      shortName: first.shortName,
      unit: first.unit,
      category: first.category,
      trend,
      slope: reg.slope,
      slopeNormalized,
      rSquared: reg.rSquared,
      confidence,
      currentValue,
      predictedValue30s,
      predictedValue60s,
      predictedValue300s,
      isApproachingLimit,
      limitType,
      timeToLimit,
      anomalyCount: anomalies.length,
      anomalies,
    });
  }

  return results;
}

/**
 * Generate fault predictions based on trends and known signatures.
 */
export function predictFaults(trends: TrendResult[]): FaultPrediction[] {
  const predictions: FaultPrediction[] = [];

  for (const signature of FAULT_SIGNATURES) {
    let matchCount = 0;
    let totalConditions = signature.conditions.length;
    const evidence: string[] = [];
    const relatedParams: string[] = [];
    let worstTimeToFault: number | undefined;

    for (const condition of signature.conditions) {
      // Find matching trend by shortName
      const matchingTrend = trends.find(t =>
        condition.shortNames.some(sn =>
          t.shortName === sn || t.shortName.toLowerCase() === sn.toLowerCase()
        )
      );

      if (!matchingTrend) continue;

      relatedParams.push(matchingTrend.parameterId);

      let conditionMet = false;

      switch (condition.check) {
        case 'above':
          if (condition.threshold !== undefined && matchingTrend.currentValue > condition.threshold) {
            conditionMet = true;
            evidence.push(`${matchingTrend.shortName} is ${matchingTrend.currentValue.toFixed(1)} (above ${condition.threshold})`);
          }
          break;
        case 'below':
          if (condition.threshold !== undefined && matchingTrend.currentValue < condition.threshold) {
            conditionMet = true;
            evidence.push(`${matchingTrend.shortName} is ${matchingTrend.currentValue.toFixed(1)} (below ${condition.threshold})`);
          }
          break;
        case 'increasing':
          if (matchingTrend.trend === 'increasing' && condition.slopeThreshold !== undefined && matchingTrend.slope > condition.slopeThreshold) {
            conditionMet = true;
            evidence.push(`${matchingTrend.shortName} rising at ${matchingTrend.slope.toFixed(3)} ${matchingTrend.unit}/s`);
          }
          break;
        case 'decreasing':
          if (matchingTrend.trend === 'decreasing' && condition.slopeThreshold !== undefined && matchingTrend.slope < condition.slopeThreshold) {
            conditionMet = true;
            evidence.push(`${matchingTrend.shortName} falling at ${matchingTrend.slope.toFixed(3)} ${matchingTrend.unit}/s`);
          }
          break;
        case 'erratic':
          if (matchingTrend.trend === 'erratic') {
            conditionMet = true;
            evidence.push(`${matchingTrend.shortName} showing erratic behavior (${matchingTrend.anomalyCount} anomalies)`);
          }
          break;
        case 'oscillating':
          if (matchingTrend.trend === 'oscillating') {
            conditionMet = true;
            evidence.push(`${matchingTrend.shortName} oscillating abnormally`);
          }
          break;
      }

      if (conditionMet) {
        matchCount++;
        if (matchingTrend.timeToLimit !== undefined) {
          if (worstTimeToFault === undefined || matchingTrend.timeToLimit < worstTimeToFault) {
            worstTimeToFault = matchingTrend.timeToLimit;
          }
        }
      }
    }

    if (matchCount === 0) continue;

    // Calculate probability based on condition match ratio and confidence
    const matchRatio = matchCount / totalConditions;
    let probability = matchRatio * 70; // Base probability from condition matching

    // Boost probability if approaching limits
    if (worstTimeToFault !== undefined) {
      if (worstTimeToFault < 60) probability += 25;
      else if (worstTimeToFault < 180) probability += 15;
      else probability += 5;
    }

    // Boost for anomalies
    const relatedTrends = trends.filter(t => relatedParams.includes(t.parameterId));
    const totalAnomalies = relatedTrends.reduce((sum, t) => sum + t.anomalyCount, 0);
    if (totalAnomalies > 5) probability += 10;

    probability = Math.min(100, Math.max(0, probability));

    // Determine confidence
    let confidence: FaultPrediction['confidence'] = 'low';
    if (matchRatio >= 0.8 && relatedTrends.some(t => t.confidence === 'high')) confidence = 'high';
    else if (matchRatio >= 0.5) confidence = 'medium';

    predictions.push({
      id: `pred_${signature.faultCode}_${Date.now()}`,
      parameterId: relatedParams[0] || signature.conditions[0].parameterId,
      parameterName: relatedTrends[0]?.parameterName || signature.name,
      shortName: relatedTrends[0]?.shortName || '',
      category: relatedTrends[0]?.category || 'engine',
      probability,
      severity: signature.severity,
      predictedFault: signature.name,
      description: signature.description,
      evidence,
      timeToFault: worstTimeToFault,
      confidence,
      relatedParameters: relatedParams,
    });
  }

  // Sort by probability descending
  predictions.sort((a, b) => b.probability - a.probability);

  return predictions;
}

/**
 * Generate a full prediction report from normalized readings.
 */
export function generatePredictionReport(readings: NormalizedReading[]): PredictionReport {
  const trends = analyzeTrends(readings);
  const predictions = predictFaults(trends);

  const totalAnomalies = trends.reduce((sum, t) => sum + t.anomalyCount, 0);
  const severeAnomalies = trends.reduce(
    (sum, t) => sum + t.anomalies.filter(a => a.severity === 'severe').length,
    0
  );
  const affectedParameters = trends.filter(t => t.anomalyCount > 0).length;

  // Overall risk assessment
  let overallRisk: PredictionReport['overallRisk'] = 'low';
  const maxProbability = predictions.length > 0 ? predictions[0].probability : 0;
  const criticalPredictions = predictions.filter(p => p.severity === 'critical' && p.probability > 50);

  if (criticalPredictions.length > 0 || maxProbability > 80) overallRisk = 'high';
  else if (maxProbability > 50 || severeAnomalies > 3) overallRisk = 'elevated';
  else if (maxProbability > 25 || totalAnomalies > 10) overallRisk = 'moderate';

  // Recommendations
  const recommendations: string[] = [];

  if (overallRisk === 'high') {
    recommendations.push('IMMEDIATE ATTENTION: Critical fault predictions detected. Inspect vehicle before continued operation.');
  }

  for (const pred of predictions.slice(0, 3)) {
    if (pred.probability > 40) {
      recommendations.push(`Monitor ${pred.shortName}: ${pred.description} (${pred.probability}% probability)`);
    }
  }

  const approachingLimits = trends.filter(t => t.isApproachingLimit);
  if (approachingLimits.length > 0) {
    recommendations.push(
      `${approachingLimits.length} parameter(s) approaching limits: ${approachingLimits.map(t => `${t.shortName} (${t.timeToLimit?.toFixed(0)}s)`).join(', ')}`
    );
  }

  if (totalAnomalies > 0) {
    recommendations.push(`${totalAnomalies} anomalies detected across ${affectedParameters} parameters. Review datalog for intermittent issues.`);
  }

  if (recommendations.length === 0) {
    recommendations.push('All parameters within normal operating ranges. No emerging faults detected.');
  }

  return {
    createdAt: Date.now(),
    trends,
    predictions,
    anomalySummary: {
      totalAnomalies,
      severeAnomalies,
      affectedParameters,
    },
    overallRisk,
    recommendations,
  };
}
