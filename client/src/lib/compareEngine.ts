/**
 * Compare Engine — Datalog Comparison & Delta Analysis
 * 
 * Takes two ProcessedMetrics objects, identifies WOT/load events in each,
 * pairs them by similar operating conditions (RPM range + load), computes
 * deltas for every available PID, and generates a structured comparison report.
 * 
 * Also detects combustion mode (normal vs regen) via:
 *   1. Direct PID: DPF Regen Status, ECM.REGENIR, combustion mode columns
 *   2. Timing inference: -20° to -7° timing = likely regen/non-normal mode
 */

import { ProcessedMetrics } from './dataProcessor';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompareDataset {
  label: string;           // filename or user-provided label
  data: ProcessedMetrics;
  regenInfo: RegenDetection;
}

export interface RegenDetection {
  regenDetected: boolean;
  regenSampleCount: number;
  totalSamples: number;
  regenPercent: number;
  method: 'pid' | 'timing_inference' | 'none';
  details: string;
}

/** A single matched operating condition window between two logs */
export interface MatchedEvent {
  id: number;
  rpmRangeLow: number;
  rpmRangeHigh: number;
  description: string;       // e.g. "WOT Pull 2500-3200 RPM"
  aIndices: number[];        // sample indices in dataset A
  bIndices: number[];        // sample indices in dataset B
}

/** Per-PID comparison at a matched event */
export interface PidDelta {
  pid: string;
  label: string;
  unit: string;
  aAvg: number;
  bAvg: number;
  aMax: number;
  bMax: number;
  delta: number;             // bAvg - aAvg
  deltaMax: number;          // bMax - aMax
  deltaPct: number;          // percentage change from A to B
  available: 'both' | 'a_only' | 'b_only';
}

/** Full comparison of a matched event */
export interface EventComparison {
  event: MatchedEvent;
  deltas: PidDelta[];
  summary: string;           // human-readable summary
}

/** Overall comparison report */
export interface ComparisonReport {
  datasetA: CompareDataset;
  datasetB: CompareDataset;
  events: EventComparison[];
  overallSummary: OverallSummary;
  warnings: string[];
  pidCoverage: PidCoverage;
}

export interface PidCoverage {
  commonPids: string[];
  aOnlyPids: string[];
  bOnlyPids: string[];
}

export interface OverallSummary {
  peakHpA: number;
  peakHpB: number;
  hpDelta: number;
  peakBoostA: number;
  peakBoostB: number;
  boostDelta: number;
  peakRailA: number;
  peakRailB: number;
  railDelta: number;
  peakEgtA: number;
  peakEgtB: number;
  egtDelta: number;
  peakTimingA: number;
  peakTimingB: number;
  timingDelta: number;
  peakPwA: number;
  peakPwB: number;
  pwDelta: number;
  peakMafA: number;
  peakMafB: number;
  mafDelta: number;
}

// ── Regen / Combustion Mode Detection ──────────────────────────────────────

/**
 * Detect if a log contains regen/non-normal combustion mode samples.
 * Method 1: Check for negative timing (-20° to -7°) which is a dead giveaway
 *           for regen mode — ECM retards timing heavily to raise exhaust temps.
 * Method 2: In the future, direct PID detection when combustion mode is parsed.
 */
export function detectRegenMode(data: ProcessedMetrics): RegenDetection {
  const timing = data.injectionTiming;
  const total = timing.length;
  
  if (total < 10) {
    return { regenDetected: false, regenSampleCount: 0, totalSamples: total, regenPercent: 0, method: 'none', details: 'Insufficient data' };
  }

  // Timing-based inference: -20° to -7° = likely regen
  let regenCount = 0;
  for (let i = 0; i < total; i++) {
    const t = timing[i];
    if (t < -7 && t > -25) {
      regenCount++;
    }
  }

  const regenPct = (regenCount / total) * 100;
  
  if (regenCount > 5 && regenPct > 1) {
    return {
      regenDetected: true,
      regenSampleCount: regenCount,
      totalSamples: total,
      regenPercent: regenPct,
      method: 'timing_inference',
      details: `Detected ${regenCount} samples (${regenPct.toFixed(1)}%) with timing between -7° and -20° BTDC, indicating DPF regeneration or non-normal combustion mode. Vehicle may have been in regen during part of this log — power output will be reduced by 80+ HP during these events.`,
    };
  }

  return { regenDetected: false, regenSampleCount: 0, totalSamples: total, regenPercent: 0, method: 'none', details: 'No regen indicators detected — vehicle appears to be in normal combustion mode.' };
}

/**
 * Get indices of samples that are in normal combustion mode (not regen).
 * Filters out samples with timing in the -20° to -7° range.
 */
function getNormalModeIndices(data: ProcessedMetrics): Set<number> {
  const normal = new Set<number>();
  const timing = data.injectionTiming;
  const rpm = data.rpm;
  const sampleCount = Math.max(rpm.length, timing.length);

  // If no timing data at all, assume all samples are normal mode
  // (Ford Powerstroke, gas engines, etc. may not have injection timing)
  const hasTimingData = timing.length > 0 && timing.some(t => t !== 0);

  if (!hasTimingData) {
    for (let i = 0; i < sampleCount; i++) {
      normal.add(i);
    }
    return normal;
  }

  for (let i = 0; i < timing.length; i++) {
    const t = timing[i];
    // Normal mode: timing is positive (or slightly negative but not in regen range)
    if (t >= -5 || t === 0) {
      normal.add(i);
    }
  }
  return normal;
}

// ── Event Detection ────────────────────────────────────────────────────────

interface LoadEvent {
  startIdx: number;
  endIdx: number;
  peakRpm: number;
  avgRpm: number;
  minRpm: number;
  maxRpm: number;
  avgBoost: number;
  peakBoost: number;
  avgThrottle: number;
}

/**
 * Find WOT / high-load events in a datalog.
 * A load event is a sustained period where RPM is above idle and
 * throttle/boost indicates the driver is on it.
 */
function findLoadEvents(data: ProcessedMetrics, normalIndices: Set<number>): LoadEvent[] {
  const events: LoadEvent[] = [];
  const rpm = data.rpm;
  const boost = data.boost;
  const throttle = data.throttlePosition;
  const len = rpm.length;

  // Determine if we have throttle data
  const hasThrottle = throttle.some(v => v > 0);
  const hasBoost = boost.some(v => v > 2);

  let inEvent = false;
  let startIdx = 0;

  for (let i = 0; i < len; i++) {
    // Skip regen samples
    if (!normalIndices.has(i)) continue;

    const r = rpm[i];
    const b = boost[i];
    const t = hasThrottle ? throttle[i] : 100; // assume WOT if no throttle data

    // Event trigger: RPM > 1500 AND (throttle > 50% OR boost > 5 psi)
    const isLoaded = r > 1500 && (t > 50 || b > 5);

    if (isLoaded && !inEvent) {
      inEvent = true;
      startIdx = i;
    } else if (!isLoaded && inEvent) {
      inEvent = false;
      const endIdx = i - 1;
      // Minimum event length: 10 samples
      if (endIdx - startIdx >= 10) {
        const slice = { start: startIdx, end: endIdx };
        const rpmSlice = rpm.slice(slice.start, slice.end + 1);
        const boostSlice = boost.slice(slice.start, slice.end + 1);
        const throttleSlice = hasThrottle ? throttle.slice(slice.start, slice.end + 1) : [];

        events.push({
          startIdx,
          endIdx,
          peakRpm: Math.max(...rpmSlice),
          avgRpm: rpmSlice.reduce((a, b) => a + b, 0) / rpmSlice.length,
          minRpm: Math.min(...rpmSlice),
          maxRpm: Math.max(...rpmSlice),
          avgBoost: boostSlice.length > 0 ? boostSlice.reduce((a, b) => a + b, 0) / boostSlice.length : 0,
          peakBoost: boostSlice.length > 0 ? Math.max(...boostSlice) : 0,
          avgThrottle: throttleSlice.length > 0 ? throttleSlice.reduce((a, b) => a + b, 0) / throttleSlice.length : 0,
        });
      }
    }
  }

  // Close any trailing event
  if (inEvent && len - startIdx >= 10) {
    const rpmSlice = rpm.slice(startIdx);
    const boostSlice = boost.slice(startIdx);
    events.push({
      startIdx,
      endIdx: len - 1,
      peakRpm: Math.max(...rpmSlice),
      avgRpm: rpmSlice.reduce((a, b) => a + b, 0) / rpmSlice.length,
      minRpm: Math.min(...rpmSlice),
      maxRpm: Math.max(...rpmSlice),
      avgBoost: boostSlice.length > 0 ? boostSlice.reduce((a, b) => a + b, 0) / boostSlice.length : 0,
      peakBoost: boostSlice.length > 0 ? Math.max(...boostSlice) : 0,
      avgThrottle: 0,
    });
  }

  return events;
}

// ── RPM Bin Approach (fallback when event pairing is sparse) ───────────────

interface RpmBin {
  rpmLow: number;
  rpmHigh: number;
  indices: number[];
}

/**
 * Bin all normal-mode samples into RPM ranges for comparison.
 * This is the fallback approach that always works even if the logs
 * don't have matching WOT events.
 */
function binByRpm(data: ProcessedMetrics, normalIndices: Set<number>, binSize: number = 500): RpmBin[] {
  const rpm = data.rpm;
  const bins: Map<number, number[]> = new Map();

  for (let i = 0; i < rpm.length; i++) {
    if (!normalIndices.has(i)) continue;
    if (rpm[i] < 800) continue; // skip sub-idle

    const binKey = Math.floor(rpm[i] / binSize) * binSize;
    if (!bins.has(binKey)) bins.set(binKey, []);
    bins.get(binKey)!.push(i);
  }

  return Array.from(bins.entries())
    .map(([key, indices]) => ({ rpmLow: key, rpmHigh: key + binSize, indices }))
    .sort((a, b) => a.rpmLow - b.rpmLow);
}

// ── PID Extraction Helpers ─────────────────────────────────────────────────

interface PidConfig {
  key: keyof ProcessedMetrics;
  label: string;
  unit: string;
}

const PID_CONFIGS: PidConfig[] = [
  { key: 'hpTorque', label: 'Estimated HP (Torque)', unit: 'HP' },
  { key: 'hpMaf', label: 'Estimated HP (MAF)', unit: 'HP' },
  { key: 'boost', label: 'Boost Pressure', unit: 'PSI' },
  { key: 'boostDesired', label: 'Desired Boost', unit: 'PSI' },
  { key: 'maf', label: 'Mass Air Flow', unit: 'g/s' },
  { key: 'railPressureActual', label: 'Rail Pressure (Actual)', unit: 'PSI' },
  { key: 'railPressureDesired', label: 'Rail Pressure (Desired)', unit: 'PSI' },
  { key: 'injectorPulseWidth', label: 'Injector Pulse Width', unit: 'ms' },
  { key: 'injectionTiming', label: 'Injection Timing', unit: '° BTDC' },
  { key: 'exhaustGasTemp', label: 'Exhaust Gas Temp', unit: '°F' },
  { key: 'turboVanePosition', label: 'Turbo Vane Position', unit: '%' },
  { key: 'turboVaneDesired', label: 'Turbo Vane Desired', unit: '%' },
  { key: 'converterSlip', label: 'TCC Slip', unit: 'RPM' },
  { key: 'pcvDutyCycle', label: 'FPR current', unit: 'mA' },
  { key: 'vehicleSpeed', label: 'Vehicle Speed', unit: 'MPH' },
  { key: 'coolantTemp', label: 'Coolant Temp', unit: '°F' },
  { key: 'oilTemp', label: 'Oil Temp', unit: '°F' },
  { key: 'transFluidTemp', label: 'Trans Fluid Temp', unit: '°F' },
  { key: 'intakeAirTemp', label: 'Intake Air Temp', unit: '°F' },
  { key: 'fuelQuantity', label: 'Fuel Quantity', unit: 'mm³' },
  { key: 'oilPressure', label: 'Oil Pressure', unit: 'PSI' },
  { key: 'exhaustPressure', label: 'Exhaust Backpressure', unit: 'PSI' },
  { key: 'barometricPressure', label: 'Barometric Pressure', unit: 'PSI' },
  { key: 'batteryVoltage', label: 'Battery Voltage', unit: 'V' },
  { key: 'throttlePosition', label: 'Throttle Position', unit: '%' },
  { key: 'currentGear', label: 'Current Gear', unit: '' },
];

function hasData(arr: number[]): boolean {
  return arr.length > 0 && arr.some(v => v !== 0 && !isNaN(v));
}

function safeAvg(arr: number[], indices: number[]): number {
  const vals = indices.map(i => arr[i]).filter(v => !isNaN(v) && v !== 0);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function safeMax(arr: number[], indices: number[]): number {
  const vals = indices.map(i => arr[i]).filter(v => !isNaN(v));
  if (vals.length === 0) return 0;
  return Math.max(...vals);
}

// ── PID Coverage Analysis ──────────────────────────────────────────────────

function analyzePidCoverage(a: ProcessedMetrics, b: ProcessedMetrics): PidCoverage {
  const common: string[] = [];
  const aOnly: string[] = [];
  const bOnly: string[] = [];

  for (const cfg of PID_CONFIGS) {
    const aHas = hasData(a[cfg.key] as number[]);
    const bHas = hasData(b[cfg.key] as number[]);
    if (aHas && bHas) common.push(cfg.label);
    else if (aHas) aOnly.push(cfg.label);
    else if (bHas) bOnly.push(cfg.label);
  }

  return { commonPids: common, aOnlyPids: aOnly, bOnlyPids: bOnly };
}

// ── Delta Computation ──────────────────────────────────────────────────────

function computeDeltas(
  a: ProcessedMetrics,
  b: ProcessedMetrics,
  aIndices: number[],
  bIndices: number[],
): PidDelta[] {
  const deltas: PidDelta[] = [];

  for (const cfg of PID_CONFIGS) {
    const aArr = a[cfg.key] as number[];
    const bArr = b[cfg.key] as number[];
    const aHas = hasData(aArr);
    const bHas = hasData(bArr);

    if (!aHas && !bHas) continue;

    const aAvg = aHas ? safeAvg(aArr, aIndices) : 0;
    const bAvg = bHas ? safeAvg(bArr, bIndices) : 0;
    const aMax = aHas ? safeMax(aArr, aIndices) : 0;
    const bMax = bHas ? safeMax(bArr, bIndices) : 0;
    const delta = bAvg - aAvg;
    const deltaMax = bMax - aMax;
    const deltaPct = aAvg !== 0 ? ((bAvg - aAvg) / Math.abs(aAvg)) * 100 : 0;

    deltas.push({
      pid: cfg.key as string,
      label: cfg.label,
      unit: cfg.unit,
      aAvg, bAvg, aMax, bMax,
      delta, deltaMax, deltaPct,
      available: aHas && bHas ? 'both' : aHas ? 'a_only' : 'b_only',
    });
  }

  return deltas;
}

// ── Event Matching ─────────────────────────────────────────────────────────

function matchEvents(
  aEvents: LoadEvent[],
  bEvents: LoadEvent[],
): { aIdx: number; bIdx: number; overlap: number }[] {
  const matches: { aIdx: number; bIdx: number; overlap: number }[] = [];
  const usedB = new Set<number>();

  for (let ai = 0; ai < aEvents.length; ai++) {
    const ae = aEvents[ai];
    let bestBi = -1;
    let bestOverlap = 0;

    for (let bi = 0; bi < bEvents.length; bi++) {
      if (usedB.has(bi)) continue;
      const be = bEvents[bi];

      // RPM overlap: how much do the RPM ranges overlap?
      const overlapLow = Math.max(ae.minRpm, be.minRpm);
      const overlapHigh = Math.min(ae.maxRpm, be.maxRpm);
      const overlap = Math.max(0, overlapHigh - overlapLow);
      const rangeA = ae.maxRpm - ae.minRpm;
      const rangeB = be.maxRpm - be.minRpm;
      const maxRange = Math.max(rangeA, rangeB, 1);
      const overlapPct = overlap / maxRange;

      if (overlapPct > 0.3 && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestBi = bi;
      }
    }

    if (bestBi >= 0) {
      matches.push({ aIdx: ai, bIdx: bestBi, overlap: bestOverlap });
      usedB.add(bestBi);
    }
  }

  return matches;
}

// ── Generate Event Summary ─────────────────────────────────────────────────

function generateEventSummary(deltas: PidDelta[], rpmRange: string): string {
  const parts: string[] = [];
  
  const hp = deltas.find(d => d.pid === 'hpTorque' && d.available === 'both');
  const hpMaf = deltas.find(d => d.pid === 'hpMaf' && d.available === 'both');
  const boost = deltas.find(d => d.pid === 'boost' && d.available === 'both');
  const timing = deltas.find(d => d.pid === 'injectionTiming' && d.available === 'both');
  const pw = deltas.find(d => d.pid === 'injectorPulseWidth' && d.available === 'both');
  const rail = deltas.find(d => d.pid === 'railPressureActual' && d.available === 'both');
  const egt = deltas.find(d => d.pid === 'exhaustGasTemp' && d.available === 'both');
  const maf = deltas.find(d => d.pid === 'maf' && d.available === 'both');

  parts.push(`At ${rpmRange} RPM:`);

  if (hp) {
    const dir = hp.deltaMax > 0 ? 'gained' : hp.deltaMax < 0 ? 'lost' : 'unchanged';
    parts.push(`Power ${dir} ${Math.abs(hp.deltaMax).toFixed(0)} HP (peak: ${hp.aMax.toFixed(0)} → ${hp.bMax.toFixed(0)})`);
  } else if (hpMaf) {
    const dir = hpMaf.deltaMax > 0 ? 'gained' : hpMaf.deltaMax < 0 ? 'lost' : 'unchanged';
    parts.push(`Power (MAF-based) ${dir} ${Math.abs(hpMaf.deltaMax).toFixed(0)} HP`);
  }

  if (boost) {
    parts.push(`Boost: ${boost.aMax.toFixed(1)} → ${boost.bMax.toFixed(1)} PSI (${boost.deltaMax >= 0 ? '+' : ''}${boost.deltaMax.toFixed(1)})`);
  }

  if (timing) {
    parts.push(`Timing: ${timing.aAvg.toFixed(1)}° → ${timing.bAvg.toFixed(1)}° avg (${timing.delta >= 0 ? '+' : ''}${timing.delta.toFixed(1)}°)`);
  }

  if (pw) {
    parts.push(`Pulse Width: ${pw.aMax.toFixed(2)} → ${pw.bMax.toFixed(2)}ms peak`);
  }

  if (rail) {
    parts.push(`Rail Pressure: ${rail.aMax.toFixed(0)} → ${rail.bMax.toFixed(0)} PSI peak`);
  }

  if (egt) {
    parts.push(`EGT: ${egt.aMax.toFixed(0)} → ${egt.bMax.toFixed(0)}°F peak (${egt.deltaMax >= 0 ? '+' : ''}${egt.deltaMax.toFixed(0)}°F)`);
  }

  if (maf) {
    parts.push(`MAF: ${maf.aMax.toFixed(0)} → ${maf.bMax.toFixed(0)} g/s peak`);
  }

  return parts.join(' | ');
}

// ── Overall Summary ────────────────────────────────────────────────────────

function computeOverallSummary(a: ProcessedMetrics, b: ProcessedMetrics, aNorm: Set<number>, bNorm: Set<number>): OverallSummary {
  const aIdx = Array.from(aNorm);
  const bIdx = Array.from(bNorm);

  return {
    peakHpA: safeMax(a.hpTorque, aIdx),
    peakHpB: safeMax(b.hpTorque, bIdx),
    hpDelta: safeMax(b.hpTorque, bIdx) - safeMax(a.hpTorque, aIdx),
    peakBoostA: safeMax(a.boost, aIdx),
    peakBoostB: safeMax(b.boost, bIdx),
    boostDelta: safeMax(b.boost, bIdx) - safeMax(a.boost, aIdx),
    peakRailA: safeMax(a.railPressureActual, aIdx),
    peakRailB: safeMax(b.railPressureActual, bIdx),
    railDelta: safeMax(b.railPressureActual, bIdx) - safeMax(a.railPressureActual, aIdx),
    peakEgtA: safeMax(a.exhaustGasTemp, aIdx),
    peakEgtB: safeMax(b.exhaustGasTemp, bIdx),
    egtDelta: safeMax(b.exhaustGasTemp, bIdx) - safeMax(a.exhaustGasTemp, aIdx),
    peakTimingA: safeMax(a.injectionTiming, aIdx),
    peakTimingB: safeMax(b.injectionTiming, bIdx),
    timingDelta: safeMax(b.injectionTiming, bIdx) - safeMax(a.injectionTiming, aIdx),
    peakPwA: safeMax(a.injectorPulseWidth, aIdx),
    peakPwB: safeMax(b.injectorPulseWidth, bIdx),
    pwDelta: safeMax(b.injectorPulseWidth, bIdx) - safeMax(a.injectorPulseWidth, aIdx),
    peakMafA: safeMax(a.maf, aIdx),
    peakMafB: safeMax(b.maf, bIdx),
    mafDelta: safeMax(b.maf, bIdx) - safeMax(a.maf, aIdx),
  };
}

// ── Main Compare Function ──────────────────────────────────────────────────

export function compareDatasets(
  aData: ProcessedMetrics,
  bData: ProcessedMetrics,
  aLabel: string,
  bLabel: string,
): ComparisonReport {
  const warnings: string[] = [];

  // 1. Detect regen/combustion mode
  const aRegen = detectRegenMode(aData);
  const bRegen = detectRegenMode(bData);

  if (aRegen.regenDetected) {
    warnings.push(`[WARNING] Log A ("${aLabel}") contains ${aRegen.regenSampleCount} regen-mode samples (${aRegen.regenPercent.toFixed(1)}%). These are excluded from comparison. Power output is reduced 80+ HP during regen.`);
  }
  if (bRegen.regenDetected) {
    warnings.push(`[WARNING] Log B ("${bLabel}") contains ${bRegen.regenSampleCount} regen-mode samples (${bRegen.regenPercent.toFixed(1)}%). These are excluded from comparison. Power output is reduced 80+ HP during regen.`);
  }

  // 2. Get normal-mode indices
  const aNormal = getNormalModeIndices(aData);
  const bNormal = getNormalModeIndices(bData);

  // 3. Analyze PID coverage
  const pidCoverage = analyzePidCoverage(aData, bData);
  if (pidCoverage.aOnlyPids.length > 0) {
    warnings.push(`Log A has PIDs not present in Log B: ${pidCoverage.aOnlyPids.join(', ')}`);
  }
  if (pidCoverage.bOnlyPids.length > 0) {
    warnings.push(`Log B has PIDs not present in Log A: ${pidCoverage.bOnlyPids.join(', ')}`);
  }

  // 4. Find load events in each log
  const aEvents = findLoadEvents(aData, aNormal);
  const bEvents = findLoadEvents(bData, bNormal);

  // 5. Try event-based matching first
  const eventMatches = matchEvents(aEvents, bEvents);
  const eventComparisons: EventComparison[] = [];

  if (eventMatches.length > 0) {
    for (const match of eventMatches) {
      const ae = aEvents[match.aIdx];
      const be = bEvents[match.bIdx];
      const rpmLow = Math.min(ae.minRpm, be.minRpm);
      const rpmHigh = Math.max(ae.maxRpm, be.maxRpm);

      const aIndices: number[] = [];
      for (let i = ae.startIdx; i <= ae.endIdx; i++) {
        if (aNormal.has(i)) aIndices.push(i);
      }
      const bIndices: number[] = [];
      for (let i = be.startIdx; i <= be.endIdx; i++) {
        if (bNormal.has(i)) bIndices.push(i);
      }

      const deltas = computeDeltas(aData, bData, aIndices, bIndices);
      const rpmRange = `${Math.round(rpmLow)}-${Math.round(rpmHigh)}`;

      eventComparisons.push({
        event: {
          id: eventComparisons.length + 1,
          rpmRangeLow: rpmLow,
          rpmRangeHigh: rpmHigh,
          description: `Load Event ${eventComparisons.length + 1}: ${rpmRange} RPM`,
          aIndices,
          bIndices,
        },
        deltas,
        summary: generateEventSummary(deltas, rpmRange),
      });
    }
  }

  // 6. RPM-bin fallback: always generate binned comparison for full coverage
  const aBins = binByRpm(aData, aNormal, 500);
  const bBins = binByRpm(bData, bNormal, 500);

  for (const aBin of aBins) {
    // Find matching bin in B
    const bBin = bBins.find(b => b.rpmLow === aBin.rpmLow);
    if (!bBin || aBin.indices.length < 5 || bBin.indices.length < 5) continue;

    // Skip if we already have an event-based comparison covering this RPM range
    const alreadyCovered = eventComparisons.some(ec =>
      ec.event.rpmRangeLow <= aBin.rpmLow && ec.event.rpmRangeHigh >= aBin.rpmHigh
    );
    if (alreadyCovered) continue;

    const deltas = computeDeltas(aData, bData, aBin.indices, bBin.indices);
    const rpmRange = `${aBin.rpmLow}-${aBin.rpmHigh}`;

    eventComparisons.push({
      event: {
        id: eventComparisons.length + 1,
        rpmRangeLow: aBin.rpmLow,
        rpmRangeHigh: aBin.rpmHigh,
        description: `RPM Bin: ${rpmRange} RPM`,
        aIndices: aBin.indices,
        bIndices: bBin.indices,
      },
      deltas,
      summary: generateEventSummary(deltas, rpmRange),
    });
  }

  // Sort by RPM range
  eventComparisons.sort((a, b) => a.event.rpmRangeLow - b.event.rpmRangeLow);

  // 7. Compute overall summary
  const overallSummary = computeOverallSummary(aData, bData, aNormal, bNormal);

  return {
    datasetA: { label: aLabel, data: aData, regenInfo: aRegen },
    datasetB: { label: bLabel, data: bData, regenInfo: bRegen },
    events: eventComparisons,
    overallSummary,
    warnings,
    pidCoverage,
  };
}

/**
 * Build a structured text summary of the comparison for LLM consumption.
 * This gets sent to the server-side LLM to generate intelligent commentary.
 */
export function buildComparisonContext(report: ComparisonReport, userContext?: string): string {
  const lines: string[] = [];

  lines.push(`=== DATALOG COMPARISON SUMMARY ===`);
  lines.push(`Log A: "${report.datasetA.label}" (${report.datasetA.data.fileFormat})`);
  lines.push(`Log B: "${report.datasetB.label}" (${report.datasetB.data.fileFormat})`);
  lines.push('');

  if (userContext) {
    lines.push(`=== USER CONTEXT (what changed between tests) ===`);
    lines.push(userContext);
    lines.push('');
  }

  if (report.warnings.length > 0) {
    lines.push(`=== WARNINGS ===`);
    report.warnings.forEach(w => lines.push(w));
    lines.push('');
  }

  lines.push(`=== OVERALL PEAK COMPARISON ===`);
  const s = report.overallSummary;
  lines.push(`HP (Torque): ${s.peakHpA.toFixed(0)} → ${s.peakHpB.toFixed(0)} (${s.hpDelta >= 0 ? '+' : ''}${s.hpDelta.toFixed(0)})`);
  lines.push(`Boost: ${s.peakBoostA.toFixed(1)} → ${s.peakBoostB.toFixed(1)} PSI (${s.boostDelta >= 0 ? '+' : ''}${s.boostDelta.toFixed(1)})`);
  lines.push(`Rail Pressure: ${s.peakRailA.toFixed(0)} → ${s.peakRailB.toFixed(0)} PSI (${s.railDelta >= 0 ? '+' : ''}${s.railDelta.toFixed(0)})`);
  lines.push(`EGT: ${s.peakEgtA.toFixed(0)} → ${s.peakEgtB.toFixed(0)}°F (${s.egtDelta >= 0 ? '+' : ''}${s.egtDelta.toFixed(0)})`);
  lines.push(`Timing: ${s.peakTimingA.toFixed(1)} → ${s.peakTimingB.toFixed(1)}° (${s.timingDelta >= 0 ? '+' : ''}${s.timingDelta.toFixed(1)})`);
  lines.push(`Pulse Width: ${s.peakPwA.toFixed(2)} → ${s.peakPwB.toFixed(2)}ms (${s.pwDelta >= 0 ? '+' : ''}${s.pwDelta.toFixed(2)})`);
  lines.push(`MAF: ${s.peakMafA.toFixed(0)} → ${s.peakMafB.toFixed(0)} g/s (${s.mafDelta >= 0 ? '+' : ''}${s.mafDelta.toFixed(0)})`);
  lines.push('');

  lines.push(`=== PID COVERAGE ===`);
  lines.push(`Common PIDs: ${report.pidCoverage.commonPids.join(', ')}`);
  if (report.pidCoverage.aOnlyPids.length) lines.push(`Log A only: ${report.pidCoverage.aOnlyPids.join(', ')}`);
  if (report.pidCoverage.bOnlyPids.length) lines.push(`Log B only: ${report.pidCoverage.bOnlyPids.join(', ')}`);
  lines.push('');

  lines.push(`=== MATCHED EVENT COMPARISONS (${report.events.length} events) ===`);
  const maDeltaFlags: string[] = [];
  const railSurgeFlags: string[] = [];
  for (const ec of report.events) {
    lines.push(`--- ${ec.event.description} ---`);
    lines.push(`  Samples: A=${ec.event.aIndices.length}, B=${ec.event.bIndices.length}`);
    for (const d of ec.deltas) {
      if (d.available !== 'both') continue;
      lines.push(`  ${d.label}: avg ${d.aAvg.toFixed(1)} → ${d.bAvg.toFixed(1)} (${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(1)} ${d.unit}, ${d.deltaPct >= 0 ? '+' : ''}${d.deltaPct.toFixed(1)}%) | peak ${d.aMax.toFixed(1)} → ${d.bMax.toFixed(1)}`);
      // Flag significant mA differences
      if (d.label === 'FPR current' && Math.abs(d.delta) > 50) {
        maDeltaFlags.push(`  ⚠️ mA DELTA: ${ec.event.description} — FPR current changed ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(0)} mA (${d.aAvg.toFixed(0)} → ${d.bAvg.toFixed(0)} mA). ${d.delta > 0 ? 'Regulator closing more (less fuel delivery)' : 'Regulator opening more (more fuel delivery)'}. Investigate: Fuel Flow Base revision, pump/injector change, or regulator drift.`);
      }
      // Flag rail pressure surge patterns
      if (d.label === 'Rail Pressure (Actual)' && d.label === 'Rail Pressure (Actual)') {
        const desiredDelta = ec.deltas.find(dd => dd.label === 'Rail Pressure (Desired)');
        if (desiredDelta && desiredDelta.available === 'both') {
          const overshootA = d.aMax - desiredDelta.aMax;
          const overshootB = d.bMax - desiredDelta.bMax;
          if (overshootB > 2000 && overshootB > overshootA + 500) {
            railSurgeFlags.push(`  ⚠️ RAIL SURGE: ${ec.event.description} — Log B peak actual exceeds desired by ${overshootB.toFixed(0)} psi (was ${overshootA.toFixed(0)} psi in Log A). Possible pump overshoot or regulator issue.`);
          }
        }
      }
    }
    lines.push('');
  }

  // Append flagged findings
  if (maDeltaFlags.length > 0 || railSurgeFlags.length > 0) {
    lines.push(`=== FLAGGED FUEL SYSTEM FINDINGS ===`);
    for (const f of maDeltaFlags) lines.push(f);
    for (const f of railSurgeFlags) lines.push(f);
    lines.push('');
  }

  return lines.join('\n');
}
