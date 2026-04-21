/**
 * PPEI Virtual Dyno Sheet — Dynojet-style 3-panel canvas renderer
 *
 * Layout (top to bottom):
 *   - Header: PPEI logo + "PPEI Virtual Dyno" + config info
 *   - Panel 1: Engine Speed (RPM) vs time/RPM axis
 *   - Panel 2: Power (HP) vs RPM
 *   - Panel 3: Torque (ft-lbs) vs RPM
 *   - Footer: Run name, warnings, disclaimer
 *
 * Features:
 *   - WOT qualification: requires 3+ seconds of TPS > 72° (Honda Talon uses degrees, full throttle ≈ 80°)
 *   - AFR correction factor applied to injector PW for HP calculation
 *   - Wideband availability warning
 *   - PNG export / download
 *   - Fullscreen mode
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Maximize2, Minimize2, AlertTriangle, FileDown, Loader2, Share2, Check, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { APP_VERSION } from '@/lib/version';
import { WP8ParseResult, getHondaTalonKeyChannels } from '@/lib/wp8Parser';
import {
  VirtualDynoConfig,
  TurboType,
  FUEL_PROFILES,
  INJECTOR_FLOW_RATES,
  calculateFuelFlow,
  estimateHP,
  estimateHPWithBoost,
  calculateTorque,
  smoothCurve,
  detectTurboType,
} from '@/lib/talonVirtualDyno';


const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WOTRun {
  startIdx: number;
  endIdx: number;
  durationSec: number;
  points: RunDataPoint[];
}

export interface RunDataPoint {
  rpm: number;
  hp: number;
  torque: number;
  tps: number;
  afr: number;
  lambda: number;
  map: number;
  time: number;  // seconds from start of run
}

export interface DynoSheetData {
  runs: WOTRun[];
  hpCurve: { rpm: number; hp: number; torque: number }[];
  peakHP: number;
  peakHPRpm: number;
  peakTorque: number;
  peakTorqueRpm: number;
  hasWideband: boolean;
  hasDynoData: boolean;
  isTurbo: boolean;
  turboType: TurboType;
  has3BarMapSensor: boolean;
  fileName: string;
  warnings: string[];
  qualified: boolean;
  disqualifyReason?: string;
}

// ─── WOT Detection & AFR Correction ────────────────────────────────────────

const WOT_TPS_THRESHOLD = 72;    // degrees — Honda Talon TPS is in degrees of rotation (full throttle ≈ 80°)
const WOT_MIN_DURATION_SEC = 3;  // minimum 3 seconds of WOT
const NA_TARGET_LAMBDA = 0.85;
const TURBO_TARGET_LAMBDA = 0.80;

/**
 * Find individual RPM sweeps (acceleration pulls) within a WOT segment.
 * A sweep = RPM increasing by at least MIN_RPM_RANGE over at least 1 second.
 * This handles trail/track logs where the driver holds WOT for 90+ seconds
 * but only has brief acceleration pulls within.
 */
function findRPMSweeps(
  wp8: WP8ParseResult,
  segStart: number,
  segEnd: number,
  rpmIdx: number,
  sampleRate: number,
): { start: number; end: number }[] {
  const MIN_RPM_RANGE = 500;  // minimum RPM gain to qualify as a pull
  const MIN_PULL_SAMPLES = Math.ceil(sampleRate * 1); // at least 1 second
  const RPM_DROP_THRESHOLD = 300; // RPM drop that ends a pull

  const pulls: { start: number; end: number; rpmGain: number }[] = [];
  let pullStart = -1;
  let pullMinRPM = Infinity;
  let pullMaxRPM = 0;
  let prevRPM = 0;
  let decliningCount = 0;

  for (let i = segStart; i <= segEnd; i++) {
    const rpm = wp8.rows[i].values[rpmIdx];
    if (!Number.isFinite(rpm)) continue;

    if (pullStart < 0) {
      // Not in a pull — look for RPM starting to rise
      if (prevRPM > 0 && rpm > prevRPM + 20) {
        pullStart = i;
        pullMinRPM = prevRPM;
        pullMaxRPM = rpm;
        decliningCount = 0;
      }
    } else {
      // In a pull — track the sweep
      if (rpm > pullMaxRPM) {
        pullMaxRPM = rpm;
        decliningCount = 0;
      } else if (rpm < pullMaxRPM - RPM_DROP_THRESHOLD) {
        decliningCount++;
      }

      // End the pull if RPM drops significantly or declines for too long
      if (decliningCount >= Math.ceil(sampleRate * 0.5) || rpm < pullMinRPM) {
        const pullEnd = i - decliningCount;
        const rpmGain = pullMaxRPM - pullMinRPM;
        const pullLength = pullEnd - pullStart;

        if (rpmGain >= MIN_RPM_RANGE && pullLength >= MIN_PULL_SAMPLES) {
          pulls.push({ start: pullStart, end: pullEnd, rpmGain });
        }

        pullStart = -1;
        pullMinRPM = Infinity;
        pullMaxRPM = 0;
        decliningCount = 0;
      }
    }

    prevRPM = rpm;
  }

  // Check if we ended mid-pull
  if (pullStart >= 0) {
    const rpmGain = pullMaxRPM - pullMinRPM;
    const pullLength = segEnd - pullStart;
    if (rpmGain >= MIN_RPM_RANGE && pullLength >= MIN_PULL_SAMPLES) {
      pulls.push({ start: pullStart, end: segEnd, rpmGain });
    }
  }

  return pulls;
}

/** Get the RPM range of a WOT run (max RPM - min RPM) */
function rpmRangeOfRun(run: WOTRun): number {
  if (run.points.length === 0) return 0;
  let minRPM = Infinity;
  let maxRPM = 0;
  for (const pt of run.points) {
    if (pt.rpm < minRPM) minRPM = pt.rpm;
    if (pt.rpm > maxRPM) maxRPM = pt.rpm;
  }
  return maxRPM - minRPM;
}

/**
 * Detect WOT runs in the datalog and build dyno sheet data
 */
export function buildDynoSheetData(
  wp8: WP8ParseResult,
  config: VirtualDynoConfig,
  fileName: string,
): DynoSheetData {
  const keys = getHondaTalonKeyChannels(wp8);
  const warnings: string[] = [];
  const fuel = FUEL_PROFILES[config.fuelType];
  const injFlowRate = INJECTOR_FLOW_RATES[config.injectorType];
  const targetLambda = config.isTurbo ? TURBO_TARGET_LAMBDA : NA_TARGET_LAMBDA;

  // Channel indices
  const rpmIdx = keys.engineSpeed;
  const tpsIdx = keys.throttlePosition;
  const injPWIdx = keys.injPwFinal >= 0 ? keys.injPwFinal : keys.injPwDesired;
  const mapIdx = keys.mapCorrected >= 0 ? keys.mapCorrected : keys.map;
  const ignIdx = keys.ignitionTiming;

  // AFR/Lambda channels — check multiple sources (PC5 lambda, standard lambda, AFR, AFR Average)
  const afr1Idx = keys.afr1;
  const lambda1Idx = keys.lambda1 >= 0 ? keys.lambda1 : keys.pc5Lambda1;
  const afrAvgIdx = keys.afrAverage;
  const hasWideband = afr1Idx >= 0 || lambda1Idx >= 0 || afrAvgIdx >= 0;
  // Determine which channel to use: AFR1 > Lambda1/PC5 > AFR Average
  const isLambdaChannel = afr1Idx < 0 && lambda1Idx >= 0;
  const afrSourceIdx = afr1Idx >= 0 ? afr1Idx : (lambda1Idx >= 0 ? lambda1Idx : afrAvgIdx);

  // Check for real dyno HP/Torque channels (from actual dyno runs)
  const realHPIdx = keys.horsepower >= 0 ? keys.horsepower
    : keys.power >= 0 ? keys.power
    : keys.normalizedPower >= 0 ? keys.normalizedPower
    : keys.power1 >= 0 ? keys.power1 : -1;
  const realTorqueIdx = keys.torque >= 0 ? keys.torque
    : keys.torqueUncorrected >= 0 ? keys.torqueUncorrected : -1;
  const hasDynoData = realHPIdx >= 0 && realTorqueIdx >= 0;

  if (hasDynoData) {
    warnings.push('Real dyno HP/Torque channels detected — using measured power data.');
  }

  // Honda 3-bar MAP for turbo detection
  const honda3BarIdx = keys.honda3BarMap;
  const has3BarMapSensor = honda3BarIdx >= 0;
  if (has3BarMapSensor && !config.isTurbo) {
    warnings.push('Honda 3-bar MAP sensor detected — vehicle may be turbocharged.');
  }

  // Resolve turbo type from config or detection
  const resolvedTurboType: TurboType = config.turboType ?? (config.isTurbo ? 'generic_turbo' : 'na');

  if (!hasWideband) {
    warnings.push('No wideband AFR/Lambda data available — HP numbers may not be accurate. Install a wideband O2 sensor for more precise results.');
  }

  if (rpmIdx < 0) {
    return {
      runs: [], hpCurve: [], peakHP: 0, peakHPRpm: 0,
      peakTorque: 0, peakTorqueRpm: 0, hasWideband, hasDynoData, isTurbo: config.isTurbo,
      turboType: resolvedTurboType, has3BarMapSensor,
      fileName, warnings: ['Missing Engine Speed channel — cannot generate dyno sheet'],
      qualified: false, disqualifyReason: 'Missing Engine Speed channel',
    };
  }

  if (injPWIdx < 0) {
    return {
      runs: [], hpCurve: [], peakHP: 0, peakHPRpm: 0,
      peakTorque: 0, peakTorqueRpm: 0, hasWideband, hasDynoData, isTurbo: config.isTurbo,
      turboType: resolvedTurboType, has3BarMapSensor,
      fileName, warnings: ['Missing Injector Pulsewidth channel — cannot estimate power'],
      qualified: false, disqualifyReason: 'Missing Injector Pulsewidth channel',
    };
  }

  // ─── Find WOT runs ─────────────────────────────────────────────────
  // Estimate sample rate from timestamps if available, otherwise assume ~20Hz
  const sampleRate = wp8.rows.length > 1
    ? 1000 / Math.max(1, (wp8.rows[1].timestamp - wp8.rows[0].timestamp))
    : 20;

  const minWOTSamples = Math.ceil(WOT_MIN_DURATION_SEC * sampleRate);

  // Scan for consecutive WOT samples
  const rawWotSegments: { start: number; end: number }[] = [];
  let wotStart = -1;

  for (let i = 0; i < wp8.rows.length; i++) {
    const row = wp8.rows[i];
    const tps = tpsIdx >= 0 ? row.values[tpsIdx] : 0;
    const rpm = row.values[rpmIdx];

    const isWOT = tps >= WOT_TPS_THRESHOLD && rpm > 2000;

    if (isWOT && wotStart < 0) {
      wotStart = i;
    } else if (!isWOT && wotStart >= 0) {
      const runLength = i - wotStart;
      if (runLength >= minWOTSamples) {
        rawWotSegments.push({ start: wotStart, end: i - 1 });
      }
      wotStart = -1;
    }
  }

  // Check if still in WOT at end of log
  if (wotStart >= 0) {
    const runLength = wp8.rows.length - wotStart;
    if (runLength >= minWOTSamples) {
      rawWotSegments.push({ start: wotStart, end: wp8.rows.length - 1 });
    }
  }

  if (rawWotSegments.length === 0) {
    return {
      runs: [], hpCurve: [], peakHP: 0, peakHPRpm: 0,
      peakTorque: 0, peakTorqueRpm: 0, hasWideband, hasDynoData, isTurbo: config.isTurbo,
      turboType: resolvedTurboType, has3BarMapSensor,
      fileName, warnings,
      qualified: false,
      disqualifyReason: `No full-throttle run detected (need ${WOT_MIN_DURATION_SEC}+ seconds at ${WOT_TPS_THRESHOLD}\u00B0+ TPS)`,
    };
  }

  // ─── Split long WOT segments into individual RPM sweep pulls ─────
  // Trail/track driving can produce WOT segments of 90+ seconds where
  // RPM stays relatively flat. Within these, we need to find individual
  // acceleration pulls (RPM sweeping upward) for accurate dyno curves.
  const wotRuns: WOTRun[] = [];

  for (const seg of rawWotSegments) {
    const segDuration = (seg.end - seg.start) / sampleRate;

    // Short segments (< 15s) are likely individual pulls — use as-is
    if (segDuration < 15) {
      wotRuns.push(buildWOTRun(wp8, seg.start, seg.end, keys, config, fuel, injFlowRate, targetLambda, hasWideband, isLambdaChannel, afrSourceIdx, sampleRate, hasDynoData, realHPIdx, realTorqueIdx));
      continue;
    }

    // Long segments: scan for RPM sweeps (acceleration pulls)
    // A pull = RPM increasing by 500+ over at least 1 second
    const pulls = findRPMSweeps(wp8, seg.start, seg.end, rpmIdx, sampleRate);

    if (pulls.length > 0) {
      for (const pull of pulls) {
        wotRuns.push(buildWOTRun(wp8, pull.start, pull.end, keys, config, fuel, injFlowRate, targetLambda, hasWideband, isLambdaChannel, afrSourceIdx, sampleRate, hasDynoData, realHPIdx, realTorqueIdx));
      }
    } else {
      // No clear sweeps found — fall back to using the whole segment
      wotRuns.push(buildWOTRun(wp8, seg.start, seg.end, keys, config, fuel, injFlowRate, targetLambda, hasWideband, isLambdaChannel, afrSourceIdx, sampleRate, hasDynoData, realHPIdx, realTorqueIdx));
    }
  }

  if (wotRuns.length === 0) {
    return {
      runs: [], hpCurve: [], peakHP: 0, peakHPRpm: 0,
      peakTorque: 0, peakTorqueRpm: 0, hasWideband, hasDynoData, isTurbo: config.isTurbo,
      turboType: resolvedTurboType, has3BarMapSensor,
      fileName, warnings,
      qualified: false,
      disqualifyReason: `No acceleration pull detected within WOT segments`,
    };
  }

  // Select the best run: prefer the pull with the widest RPM range
  // (not the longest duration — trail driving at flat RPM is not useful)
  const bestRun = wotRuns.reduce((a, b) => {
    const aRange = rpmRangeOfRun(a);
    const bRange = rpmRangeOfRun(b);
    return aRange >= bRange ? a : b;
  });

  // Build RPM-binned curve from the best run
  // Use 100 RPM bins for a smoother, more detailed curve
  const RPM_BIN_SIZE = 100;
  const rpmBins = new Map<number, { hpSum: number; torqueSum: number; hpMax: number; torqueMax: number; count: number }>();

  for (const pt of bestRun.points) {
    if (pt.rpm < 2000) continue;
    const bin = Math.round(pt.rpm / RPM_BIN_SIZE) * RPM_BIN_SIZE;
    const existing = rpmBins.get(bin) || { hpSum: 0, torqueSum: 0, hpMax: 0, torqueMax: 0, count: 0 };
    existing.hpSum += pt.hp;
    existing.torqueSum += pt.torque;
    existing.hpMax = Math.max(existing.hpMax, pt.hp);
    existing.torqueMax = Math.max(existing.torqueMax, pt.torque);
    existing.count++;
    rpmBins.set(bin, existing);
  }

  let hpCurve = Array.from(rpmBins.entries())
    .filter(([_, bin]) => bin.count >= 1)
    .map(([rpm, bin]) => ({
      rpm,
      // Use peak values for dyno-style curves (not averages)
      hp: Math.round(bin.hpMax * 10) / 10,
      torque: Math.round(bin.torqueMax * 10) / 10,
    }))
    .sort((a, b) => a.rpm - b.rpm);

  // Smooth the curve with a wider window for cleaner display
  hpCurve = smoothCurve(hpCurve, 5);

  // Find peaks
  let peakHP = 0, peakHPRpm = 0, peakTorque = 0, peakTorqueRpm = 0;
  for (const pt of hpCurve) {
    if (pt.hp > peakHP) { peakHP = pt.hp; peakHPRpm = pt.rpm; }
    if (pt.torque > peakTorque) { peakTorque = pt.torque; peakTorqueRpm = pt.rpm; }
  }

  return {
    runs: wotRuns,
    hpCurve,
    peakHP: Math.round(peakHP * 1000) / 1000,
    peakHPRpm,
    peakTorque: Math.round(peakTorque * 1000) / 1000,
    peakTorqueRpm,
    hasWideband,
    hasDynoData,
    isTurbo: config.isTurbo,
    turboType: resolvedTurboType,
    has3BarMapSensor,
    fileName,
    warnings,
    qualified: true,
  };
}

function buildWOTRun(
  wp8: WP8ParseResult,
  startIdx: number,
  endIdx: number,
  keys: ReturnType<typeof getHondaTalonKeyChannels>,
  config: VirtualDynoConfig,
  fuel: typeof FUEL_PROFILES[keyof typeof FUEL_PROFILES],
  injFlowRate: number,
  targetLambda: number,
  hasWideband: boolean,
  isLambdaChannel: boolean,
  afrSourceIdx: number,
  sampleRate: number,
  hasDynoData: boolean = false,
  realHPIdx: number = -1,
  realTorqueIdx: number = -1,
): WOTRun {
  const rpmIdx = keys.engineSpeed;
  const tpsIdx = keys.throttlePosition;
  // Power Commander override: use Primary Inj PW 1 when PC channels are present
  const hasPowerCommander = keys.primaryInjPw1 >= 0;
  const injPWIdx = hasPowerCommander
    ? keys.primaryInjPw1
    : (keys.injPwFinal >= 0 ? keys.injPwFinal : keys.injPwDesired);
  const mapIdx = keys.mapCorrected >= 0 ? keys.mapCorrected
    : keys.honda3BarMap >= 0 ? keys.honda3BarMap
    : keys.map;

  const points: RunDataPoint[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const row = wp8.rows[i];
    const rpm = row.values[rpmIdx];
    const tps = tpsIdx >= 0 ? row.values[tpsIdx] : 0;
    const injPW = injPWIdx >= 0 ? row.values[injPWIdx] : 0;
    const map = mapIdx >= 0 ? row.values[mapIdx] : 0;

    // Get AFR/Lambda
    let afr = fuel.stoichAFR;
    let lambda = 1.0;
    if (afrSourceIdx >= 0) {
      const rawVal = row.values[afrSourceIdx];
      if (isLambdaChannel) {
        lambda = rawVal;
        afr = rawVal * fuel.stoichAFR;
      } else {
        afr = rawVal;
        lambda = rawVal / fuel.stoichAFR;
      }
    }

    // Apply AFR correction factor to injector PW for HP calculation
    // correctedPW = injPW × (actualLambda / targetLambda)
    // If running richer than target (lambda < target), correction < 1 = less fuel needed = lower HP
    // If running leaner than target (lambda > target), correction > 1 = more fuel needed = higher HP
    let correctedPW = injPW;
    if (hasWideband && lambda > 0.5 && lambda < 1.5) {
      correctedPW = injPW * (lambda / targetLambda);
    }

    // Calculate fuel flow with corrected PW
    const fuelFlowGPerSec = calculateFuelFlow(
      correctedPW, rpm, injFlowRate, fuel.density,
    );

    // Use real dyno data if available, otherwise estimate from fuel flow
    let hp: number;
    let torque: number;
    if (hasDynoData && realHPIdx >= 0 && realTorqueIdx >= 0) {
      hp = Math.abs(row.values[realHPIdx]);
      torque = Math.abs(row.values[realTorqueIdx]);
      // Filter out unrealistic values (sensor noise / roller artifacts)
      if (hp > 500) hp = 0;
      if (torque > 500) torque = 0;
    } else {
      const effectiveTurboType = config.turboType ?? (config.isTurbo ? 'generic_turbo' as const : 'na' as const);
      hp = estimateHPWithBoost(fuelFlowGPerSec, fuel.bsfc, effectiveTurboType, map, config.fuelType);
      hp *= config.dynoCalibrationFactor;
      torque = calculateTorque(hp, rpm);
    }

    points.push({
      rpm,
      hp: Math.round(hp * 100) / 100,
      torque: Math.round(torque * 100) / 100,
      tps,
      afr,
      lambda,
      map,
      time: (i - startIdx) / sampleRate,
    });
  }

  return {
    startIdx,
    endIdx,
    durationSec: (endIdx - startIdx) / sampleRate,
    points,
  };
}

// ─── Interactive Recharts Renderer ──────────────────────────────────────────

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import { ZoomableChart } from './ZoomableChart';

interface DynoSheetProps {
  data: DynoSheetData;
  config: VirtualDynoConfig;
  compareData?: DynoSheetData | null;
}

// Colors — dark motorsport theme matching the app
const COLORS = {
  bg: '#0d0f14',
  grid: 'rgba(255,255,255,0.06)',
  text: '#e0e0e0',
  textDim: '#888888',
  hpLine: '#ff4d00',         // Dynojet orange-red for HP
  torqueLine: '#00c8ff',     // cyan for Torque
  hpLineCompare: '#ff4d0066',
  torqueLineCompare: '#00c8ff66',
  peakHP: '#ff6b00',
  peakTorque: '#00e5ff',
  warning: '#f59e0b',
};

// ─── Custom Dyno Tooltip ───────────────────────────────────────────────────────
const DynoTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  // Shorten labels for cleaner tooltip display
  const shortName = (name: string) => {
    if (name === 'Torque (ft-lb)') return 'TQ (ft-lb)';
    if (name === 'Torque (Baseline)') return 'TQ (Base)';
    if (name === 'HP (Baseline)') return 'HP (Base)';
    return name;
  };
  return (
    <div style={{
      background: 'rgba(13,15,20,0.97)',
      border: '1px solid #ff4d00',
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e0e0e0',
      boxShadow: '0 0 12px rgba(255,77,0,0.3)',
      minWidth: 200,
      whiteSpace: 'nowrap' as const,
    }}>
      <div style={{ color: '#ff4d00', fontWeight: 'bold', marginBottom: 6, fontSize: 13 }}>
        {label != null ? `${Number(label).toLocaleString()} RPM` : ''}
      </div>
      {payload.map((p: any, i: number) => (
        p.value != null && (
          <div key={i} style={{ color: p.color || p.stroke, marginBottom: 3, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span>{shortName(p.name)}</span>
            <span style={{ color: '#fff', fontWeight: 'bold' }}>{Number(p.value).toFixed(1)}</span>
          </div>
        )
      ))}
    </div>
  );
};

// ─── React Component (Interactive Recharts) ───────────────────────────────────────

export default function DynoSheet({ data, config, compareData }: DynoSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareMutation = trpc.dyno.shareDyno.useMutation();

  // Human-readable labels for turbo types and injector types
  const TURBO_LABELS: Record<string, string> = {
    na: 'N/A',
    jr: 'Jackson Racing (JR)',
    kw: 'Kraftwerks (KW)',
    fp: 'Full Performance (FP)',
    generic_turbo: 'Turbo (Generic)',
  };
  const INJECTOR_LABELS: Record<string, string> = {
    stock: 'Stock (~310cc)',
    jr_kit: 'JR Kit (~345cc)',
    kw800: 'FIC 800cc (KW)',
    id1050: 'ID1050X (1050cc)',
    id1300: 'ID1300X (1300cc)',
  };

  // PDF Export handler
  const exportToPdf = useCallback(async () => {
    if (!chartAreaRef.current) return;
    setIsExportingPdf(true);
    try {
      // Dynamic imports to avoid breaking test environment (no DOM)
      // @ts-ignore — dom-to-image-more has no @types package
      const domtoimage = (await import('dom-to-image-more')).default;
      const { default: jsPDF } = await import('jspdf');

      // Pre-load PPEI logo for watermark (do this while waiting for re-render)
      let logoDataUrl: string | null = null;
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.src = PPEI_LOGO_URL;
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          setTimeout(() => reject(), 5000);
        });
        const canvas = document.createElement('canvas');
        canvas.width = logoImg.naturalWidth;
        canvas.height = logoImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(logoImg, 0, 0);
          logoDataUrl = canvas.toDataURL('image/png');
        }
      } catch {
        // Logo load failed — fall back to text watermark
      }

      // Wait a tick for React to re-render with hideControls=true
      await new Promise(r => setTimeout(r, 200));

      // Capture the chart area as a high-res image (zoom controls now hidden)
      const dataUrl = await domtoimage.toPng(chartAreaRef.current, {
        scale: 2.5,
        bgcolor: '#0d0f14',
        style: { background: '#0d0f14' },
      });

      // Create landscape PDF
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();  // 297mm
      const pageH = doc.internal.pageSize.getHeight(); // 210mm
      const margin = 10;

      // Dark background
      doc.setFillColor(10, 10, 10);
      doc.rect(0, 0, pageW, pageH, 'F');

      // ── PPEI Logo watermark (drawn FIRST so chart image overlays with transparency) ──
      // The watermark must be placed before the chart image so it shows through
      // the chart's dark background at reduced opacity
      const drawWatermark = () => {
        if (logoDataUrl) {
          // @ts-ignore — jsPDF supports opacity via GState
          doc.setGState(new doc.GState({ opacity: 0.06 }));
          const wmW = 150;
          const wmH = 150;
          doc.addImage(logoDataUrl, 'PNG', (pageW - wmW) / 2, (pageH - wmH) / 2, wmW, wmH);
          // @ts-ignore
          doc.setGState(new doc.GState({ opacity: 1 }));
        } else {
          doc.setFontSize(70);
          doc.setTextColor(255, 255, 255);
          // @ts-ignore
          doc.setGState(new doc.GState({ opacity: 0.04 }));
          doc.text('PPEI', pageW / 2, pageH / 2, { align: 'center', angle: 30 });
          // @ts-ignore
          doc.setGState(new doc.GState({ opacity: 1 }));
        }
      };
      // We'll call drawWatermark() later, after the header but before the chart

      // ── Header Row 1: "Virtual Dyno by" + PPEI Logo (larger) + Badge + Version ──
      doc.setFontSize(14);
      doc.setTextColor(160, 160, 160);
      doc.setFont('helvetica', 'normal');
      doc.text('Virtual Dyno by', margin, 15);

      // PPEI Logo next to title — larger size
      if (logoDataUrl) {
        const logoH = 16;
        const logoW = 16;
        doc.addImage(logoDataUrl, 'PNG', margin + 38, 4, logoW, logoH);
      } else {
        doc.setFontSize(16);
        doc.setTextColor(255, 77, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('PPEI', margin + 38, 15);
      }

      // Badge — shifted right to accommodate larger logo
      const badgeText = data.hasDynoData ? 'MEASURED' : 'ESTIMATED';
      const badgeColor: [number, number, number] = data.hasDynoData ? [34, 197, 94] : [245, 158, 11];
      doc.setFillColor(...badgeColor);
      doc.roundedRect(margin + 58, 8, 26, 7, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(badgeText, margin + 60, 13.5);

      // Version + date (right-aligned)
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(`V-OP ${APP_VERSION}  |  ${new Date().toLocaleDateString()}`, pageW - margin, 12, { align: 'right' });

      // ── Header Row 2: Config details (Fuel, Injector, Turbo, MAP) ──
      const turboLabel = TURBO_LABELS[data.turboType] || data.turboType;
      const injectorLabel = INJECTOR_LABELS[config.injectorType] || config.injectorType;
      const fuelLabelMap: Record<string, string> = {
        pump: 'Pump 91/93',
        utv96: 'UTV96',
        e85: 'E85',
        e90: 'E90',
        ignite_red: 'Ignite Red',
      };
      const fuelLabel = fuelLabelMap[config.fuelType] || config.fuelType.toUpperCase();

      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.setFont('helvetica', 'normal');

      const configParts: string[] = [
        `Fuel: ${fuelLabel}`,
        `Injector: ${injectorLabel}`,
      ];
      if (data.isTurbo) {
        configParts.push(`Turbo: ${turboLabel}`);
      }
      if (data.has3BarMapSensor) {
        configParts.push('MAP: 3-Bar Detected');
      }
      configParts.push('CF: SAE', 'Smoothing: 5');
      doc.text(configParts.join('  |  '), margin, 21);

      // Watermark will be drawn AFTER the chart image so it overlays on top

      // ── Chart Image (vertically centered in available space) ──
      const headerBottom = 24;
      const footerTop = pageH - 8;
      const suggestionsHeight = 22; // reduced — no estimated HP numbers
      const statsHeight = 10;
      const availableH = footerTop - headerBottom - suggestionsHeight - statsHeight - 4;

      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve) => { img.onload = () => resolve(); });
      const imgAspect = img.width / img.height;
      const chartW = pageW - 2 * margin;
      let chartH = Math.min(availableH, chartW / imgAspect);
      // Vertically center the chart in the available space
      const chartY = headerBottom + (availableH - chartH) / 2;
      doc.addImage(dataUrl, 'PNG', margin, chartY, chartW, chartH);

      // ── Draw watermark ON TOP of the chart so it's visible through the graph ──
      drawWatermark();

      // ── Peak Stats Row (below chart) ──
      const statsY = chartY + chartH + 5;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');

      // Peak HP
      doc.setTextColor(255, 77, 0);
      doc.text(`Peak HP: ${data.peakHP.toFixed(1)} @ ${data.peakHPRpm.toLocaleString()} RPM`, margin, statsY);

      // Peak Torque
      doc.setTextColor(0, 200, 255);
      doc.text(`Peak Torque: ${data.peakTorque.toFixed(1)} ft-lb @ ${data.peakTorqueRpm.toLocaleString()} RPM`, margin + 100, statsY);

      // WOT Runs + Best Run
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(9);
      const bestDur = data.runs.length > 0
        ? data.runs.reduce((a, b) => {
            const aR = a.points.length > 0 ? a.points[a.points.length - 1].rpm - a.points[0].rpm : 0;
            const bR = b.points.length > 0 ? b.points[b.points.length - 1].rpm - b.points[0].rpm : 0;
            return aR >= bR ? a : b;
          }).durationSec
        : 0;
      doc.text(`WOT Runs: ${data.runs.length}  |  Best Run: ${bestDur.toFixed(1)}s`, margin + 210, statsY);

      // ── Suggestions & Notes Section ──
      const sugY = statsY + 8;

      // Subtle separator line
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.3);
      doc.line(margin, sugY - 2, pageW - margin, sugY - 2);

      doc.setFontSize(9);
      doc.setTextColor(255, 77, 0);
      doc.setFont('helvetica', 'bold');
      doc.text('SUGGESTIONS & NOTES', margin, sugY + 2);

      doc.setFontSize(7.5);
      doc.setTextColor(160, 160, 160);
      doc.setFont('helvetica', 'normal');

      const suggestions: string[] = [];
      const currentFuel = config.fuelType;
      const currentTurbo = data.turboType;

      // E85 fuel switch suggestion (only if currently on pump gas) — no estimated HP numbers
      if (currentFuel === 'pump' || currentFuel === 'utv96') {
        if (currentTurbo !== 'na') {
          suggestions.push(
            `Switching to E85 with ${turboLabel} could yield significant gains. E85 allows 30-35\u00b0 timing vs 20-25\u00b0 on pump gas, unlocking more power from forced induction.`
          );
        } else {
          suggestions.push(
            'Switching to E85 could provide modest gains from increased timing advance headroom and improved combustion efficiency.'
          );
        }
      }

      // Turbo upgrade suggestion (only if NA) — no estimated HP numbers
      if (currentTurbo === 'na') {
        suggestions.push(
          'Adding a Jackson Racing turbo kit could provide significant power gains over the naturally aspirated setup on pump gas.'
        );
      }

      // Injector upgrade suggestion
      if (config.injectorType === 'stock' && currentTurbo !== 'na') {
        suggestions.push(
          'Stock injectors (~310cc) are at capacity with forced induction. Upgrading to ID1050X or ID1300X injectors would support higher boost levels safely.'
        );
      }

      // If already on E85 with turbo, suggest boost increase
      if ((currentFuel === 'e85' || currentFuel === 'e90' || currentFuel === 'ignite_red') && currentTurbo !== 'na') {
        suggestions.push(
          'Already running ethanol with forced induction \u2014 consider verifying boost target and timing advance. Each additional 1 PSI of boost typically adds 3-5 HP on this platform.'
        );
      }

      // Default suggestion if none apply
      if (suggestions.length === 0) {
        suggestions.push(
          'Current setup appears well-optimized. Consider a dyno session to validate virtual estimates and fine-tune calibration.'
        );
      }

      // Render suggestions as bullet points
      let sugTextY = sugY + 6;
      for (const s of suggestions) {
        const lines = doc.splitTextToSize(`\u2022  ${s}`, pageW - 2 * margin - 4);
        doc.text(lines, margin + 2, sugTextY);
        sugTextY += lines.length * 3.2;
      }

      // ── Disclaimer Footer ──
      doc.setFontSize(6.5);
      doc.setTextColor(70, 70, 70);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'Virtual dyno estimates are dependent on tuning setup and conditions \u2014 results serve as reference only. Generated by PPEI V-OP.',
        pageW / 2,
        pageH - 4,
        { align: 'center' }
      );

      doc.save(`PPEI_Virtual_Dyno_${data.peakHP.toFixed(0)}HP_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  }, [data, config, compareData]);

  // Merge main + comparison data for Recharts
  const chartData = useMemo(() => {
    if (!data.qualified || data.hpCurve.length === 0) return [];

    // Build a map keyed by RPM
    const rpmMap = new Map<number, any>();

    for (const pt of data.hpCurve) {
      rpmMap.set(pt.rpm, {
        rpm: pt.rpm,
        hp: pt.hp,
        torque: pt.torque,
      });
    }

    // Merge comparison data if present
    if (compareData?.qualified && compareData.hpCurve.length > 0) {
      for (const pt of compareData.hpCurve) {
        const existing = rpmMap.get(pt.rpm) || { rpm: pt.rpm };
        existing.hpBaseline = pt.hp;
        existing.torqueBaseline = pt.torque;
        rpmMap.set(pt.rpm, existing);
      }
    }

    return Array.from(rpmMap.values()).sort((a: any, b: any) => a.rpm - b.rpm);
  }, [data, compareData]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Axis domain calculations — unified scale for HP and Torque
  // Auto-scale Y-axis to fit data range (like Dynojet) instead of starting at 0
  const { yMin, yMax } = useMemo(() => {
    // Collect all HP and torque values from main + comparison curves
    let allValues: number[] = [];
    for (const pt of data.hpCurve) {
      allValues.push(pt.hp, pt.torque);
    }
    if (compareData?.qualified && compareData.hpCurve.length > 0) {
      for (const pt of compareData.hpCurve) {
        allValues.push(pt.hp, pt.torque);
      }
    }
    allValues = allValues.filter(v => Number.isFinite(v) && v > 0);
    if (allValues.length === 0) return { yMin: 0, yMax: 200 };

    const dataMin = Math.min(...allValues);
    const dataMax = Math.max(...allValues);
    const range = dataMax - dataMin;
    // Add 10% padding above and below, then round to nice tick values
    const padding = Math.max(range * 0.10, 5);
    const rawMin = dataMin - padding;
    const rawMax = dataMax + padding;
    // Round to nearest 10 for clean axis ticks
    const roundedMin = Math.max(0, Math.floor(rawMin / 10) * 10);
    const roundedMax = Math.ceil(rawMax / 10) * 10;
    return { yMin: roundedMin, yMax: roundedMax };
  }, [data, compareData]);

  // Best run stats
  const bestRunDuration = useMemo(() => {
    if (data.runs.length === 0) return 0;
    // Best run = widest RPM range
    return data.runs.reduce((a, b) => {
      const aRange = rpmRangeOfRun(a);
      const bRange = rpmRangeOfRun(b);
      return aRange >= bRange ? a : b;
    }).durationSec;
  }, [data.runs]);

  // ─── Not Qualified ──────────────────────────────────────────────────
  if (!data.qualified) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Dyno Sheet Not Available</h3>
        <p className="text-zinc-400 mb-4">{data.disqualifyReason}</p>
        <p className="text-zinc-500 text-sm">
          The datalog must contain at least {WOT_MIN_DURATION_SEC} seconds of full throttle
          (TPS &gt; {WOT_TPS_THRESHOLD}&deg;) to generate a virtual dyno sheet.
        </p>
        {data.warnings.length > 0 && (
          <div className="mt-4 text-left max-w-md mx-auto">
            {data.warnings.map((w, i) => (
              <p key={i} className="text-amber-400 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {w}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  const hasCompare = compareData?.qualified && compareData.hpCurve.length > 0;

  return (
    <div ref={containerRef} className={`${isFullscreen ? 'bg-black flex flex-col items-center justify-center h-full p-4' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-base text-zinc-400 tracking-wider" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            VIRTUAL DYNO BY
          </span>
          <img
            src={PPEI_LOGO_URL}
            alt="PPEI"
            className="h-8 object-contain"
            crossOrigin="anonymous"
          />
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{
              background: data.hasDynoData ? '#22c55e' : '#f59e0b',
              color: '#000',
            }}
          >
            {data.hasDynoData ? 'MEASURED' : 'ESTIMATED'}
          </span>
          {!data.hasWideband && (
            <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-1 rounded flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              NO WIDEBAND
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToPdf}
            disabled={isExportingPdf || !data.qualified}
            className="text-zinc-300 border-zinc-600 hover:bg-zinc-800"
          >
            {isExportingPdf ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Exporting...</>
            ) : (
              <><FileDown className="w-4 h-4 mr-1" /> Export PDF</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (shareUrl) {
                await navigator.clipboard.writeText(shareUrl);
                toast.success('Link copied to clipboard!');
                return;
              }
              if (!chartAreaRef.current) return;
              setIsSharing(true);
              try {
                // @ts-ignore
                const domtoimage = (await import('dom-to-image-more')).default;
                const { default: jsPDF } = await import('jspdf');

                // Capture chart as image
                const dataUrl = await domtoimage.toJpeg(chartAreaRef.current, {
                  scale: 2,
                  bgcolor: '#0d0f14',
                  style: { background: '#0d0f14' },
                  quality: 0.85,
                });

                // Build PDF in memory (same as export)
                const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
                const pageW = doc.internal.pageSize.getWidth();
                const pageH = doc.internal.pageSize.getHeight();
                doc.setFillColor(13, 15, 20);
                doc.rect(0, 0, pageW, pageH, 'F');

                // Header
                doc.setFontSize(16);
                doc.setTextColor(255, 77, 0);
                doc.text('PPEI Virtual Dyno', pageW / 2, 12, { align: 'center' });
                doc.setFontSize(9);
                doc.setTextColor(160, 160, 160);
                const configLine = `${data.peakHP.toFixed(1)} HP @ ${data.peakHPRpm} RPM  |  ${data.peakTorque.toFixed(1)} ft-lb @ ${data.peakTorqueRpm} RPM`;
                doc.text(configLine, pageW / 2, 18, { align: 'center' });

                // Chart image
                const img = new Image();
                img.src = dataUrl;
                await new Promise<void>((r) => { img.onload = () => r(); });
                const imgAspect = img.width / img.height;
                const imgW = pageW - 10;
                const imgH = imgW / imgAspect;
                doc.addImage(dataUrl, 'JPEG', 5, 22, imgW, Math.min(imgH, pageH - 35));

                // Disclaimer
                doc.setFontSize(7);
                doc.setTextColor(100, 100, 100);
                doc.text('Virtual dyno estimates are dependent on tuning setup and conditions. Results serve as reference only.', pageW / 2, pageH - 4, { align: 'center' });

                // Convert to base64
                const pdfBase64 = doc.output('datauristring').split(',')[1];

                // Upload via tRPC
                const result = await shareMutation.mutateAsync({
                  pdfBase64,
                  peakHp: data.peakHP,
                  peakTorque: data.peakTorque,
                  peakHpRpm: data.peakHPRpm,
                  peakTorqueRpm: data.peakTorqueRpm,
                  turboType: data.turboType,
                  fuelType: config.fuelType,
                  injectorType: config.injectorType,
                  has3BarMap: data.has3BarMapSensor,
                  fileName: data.fileName,
                });

                const url = `${window.location.origin}/shared/dyno/${result.shareToken}`;
                setShareUrl(url);
                await navigator.clipboard.writeText(url);
                toast.success('Shareable link copied to clipboard!', {
                  description: url,
                  duration: 6000,
                });
              } catch (err) {
                console.error('Share failed:', err);
                toast.error('Failed to share dyno result. Please try again.');
              } finally {
                setIsSharing(false);
              }
            }}
            disabled={isSharing || !data.qualified}
            className="text-zinc-300 border-zinc-600 hover:bg-zinc-800"
          >
            {isSharing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Sharing...</>
            ) : shareUrl ? (
              <><Link2 className="w-4 h-4 mr-1" /> Copy Link</>
            ) : (
              <><Share2 className="w-4 h-4 mr-1" /> Share</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="text-zinc-300 border-zinc-600 hover:bg-zinc-800"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Interactive Chart — wrapped in ref for PDF capture */}
      <div
        ref={chartAreaRef}
        className="rounded-lg overflow-hidden"
        style={{ background: COLORS.bg, border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <ZoomableChart data={chartData} height={isFullscreen ? '75vh' : 500} hideControls={isExportingPdf}>
          {(visibleData) => (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={visibleData}
                margin={{ top: 20, right: 60, left: 20, bottom: 20 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 3"
                  vertical={false}
                />

                {/* X-axis: RPM */}
                <XAxis
                  dataKey="rpm"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v: number) => v.toLocaleString()}
                  tick={{ fill: COLORS.textDim, fontSize: 11, fontFamily: 'monospace' }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                  tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  label={{
                    value: 'Engine RPM',
                    position: 'insideBottom',
                    offset: -10,
                    fill: COLORS.text,
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                />

                {/* Left Y-axis: HP */}
                <YAxis
                  yAxisId="hp"
                  orientation="left"
                  domain={[yMin, yMax]}
                  tick={{ fill: COLORS.hpLine, fontSize: 11, fontFamily: 'monospace' }}
                  axisLine={{ stroke: COLORS.hpLine }}
                  tickLine={{ stroke: COLORS.hpLine }}
                  label={{
                    value: 'HP',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    fill: COLORS.hpLine,
                    fontSize: 14,
                    fontWeight: 'bold',
                  }}
                />

                {/* Right Y-axis: Torque */}
                <YAxis
                  yAxisId="torque"
                  orientation="right"
                  domain={[yMin, yMax]}
                  tick={{ fill: COLORS.torqueLine, fontSize: 11, fontFamily: 'monospace' }}
                  axisLine={{ stroke: COLORS.torqueLine }}
                  tickLine={{ stroke: COLORS.torqueLine }}
                  label={{
                    value: 'ft-lb',
                    angle: 90,
                    position: 'insideRight',
                    offset: 10,
                    fill: COLORS.torqueLine,
                    fontSize: 14,
                    fontWeight: 'bold',
                  }}
                />

                {/* Tooltip */}
                <Tooltip content={<DynoTooltip />} />

                {/* Peak HP cursor dot */}
                <ReferenceDot
                  x={data.peakHPRpm}
                  y={data.peakHP}
                  yAxisId="hp"
                  r={6}
                  fill={COLORS.hpLine}
                  stroke="#fff"
                  strokeWidth={2}
                  isFront
                  label={{
                    value: `${data.peakHP.toFixed(1)} HP`,
                    position: 'top',
                    fill: COLORS.hpLine,
                    fontSize: 11,
                    fontWeight: 'bold',
                    offset: 10,
                  }}
                />

                {/* Peak Torque cursor dot */}
                <ReferenceDot
                  x={data.peakTorqueRpm}
                  y={data.peakTorque}
                  yAxisId="torque"
                  r={6}
                  fill={COLORS.torqueLine}
                  stroke="#fff"
                  strokeWidth={2}
                  isFront
                  label={{
                    value: `${data.peakTorque.toFixed(1)} ft-lb`,
                    position: 'bottom',
                    fill: COLORS.torqueLine,
                    fontSize: 11,
                    fontWeight: 'bold',
                    offset: 10,
                  }}
                />

                {/* Comparison curves (behind main) */}
                {hasCompare && (
                  <>
                    <Line
                      yAxisId="hp"
                      type="monotone"
                      dataKey="hpBaseline"
                      name="HP (Baseline)"
                      stroke={COLORS.hpLineCompare}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                    />
                    <Line
                      yAxisId="torque"
                      type="monotone"
                      dataKey="torqueBaseline"
                      name="Torque (Baseline)"
                      stroke={COLORS.torqueLineCompare}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                    />
                  </>
                )}

                {/* Main HP curve */}
                <Line
                  yAxisId="hp"
                  type="monotone"
                  dataKey="hp"
                  name="HP"
                  stroke={COLORS.hpLine}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, fill: COLORS.hpLine, stroke: '#fff', strokeWidth: 2 }}
                />

                {/* Main Torque curve */}
                <Line
                  yAxisId="torque"
                  type="monotone"
                  dataKey="torque"
                  name="Torque (ft-lb)"
                  stroke={COLORS.torqueLine}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, fill: COLORS.torqueLine, stroke: '#fff', strokeWidth: 2 }}
                />


              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ZoomableChart>

        {/* Disclaimer */}
        <div className="text-center pb-2">
          <span className="text-[10px] text-zinc-600" style={{ fontFamily: 'monospace' }}>
            Virtual dyno estimates are dependent on tuning setup and conditions — results serve as reference only.
          </span>
        </div>
      </div>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div className="mt-2">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-amber-400 text-xs flex items-start gap-2 mb-1">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Stats cards below chart */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Peak HP</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.hpLine }}>{data.peakHP.toFixed(1)}</div>
          <div className="text-xs text-zinc-500">@ {data.peakHPRpm.toLocaleString()} RPM</div>
          {hasCompare && (
            <div className="text-xs mt-1" style={{ color: data.peakHP > compareData!.peakHP ? '#22c55e' : data.peakHP < compareData!.peakHP ? '#ef4444' : '#888' }}>
              {data.peakHP > compareData!.peakHP ? '+' : ''}{(data.peakHP - compareData!.peakHP).toFixed(1)} HP vs baseline
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Peak Torque</div>
          <div className="text-2xl font-bold" style={{ color: COLORS.torqueLine }}>{data.peakTorque.toFixed(1)}</div>
          <div className="text-xs text-zinc-500">@ {data.peakTorqueRpm.toLocaleString()} RPM</div>
          {hasCompare && (
            <div className="text-xs mt-1" style={{ color: data.peakTorque > compareData!.peakTorque ? '#22c55e' : data.peakTorque < compareData!.peakTorque ? '#ef4444' : '#888' }}>
              {data.peakTorque > compareData!.peakTorque ? '+' : ''}{(data.peakTorque - compareData!.peakTorque).toFixed(1)} ft-lbs vs baseline
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>WOT Runs</div>
          <div className="text-2xl font-bold text-green-400">{data.runs.length}</div>
          <div className="text-xs text-zinc-500">detected</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider" style={{ fontFamily: 'monospace' }}>Best Run</div>
          <div className="text-2xl font-bold text-zinc-300">
            {bestRunDuration > 0 ? bestRunDuration.toFixed(1) : '—'}s
          </div>
          <div className="text-xs text-zinc-500">duration</div>
        </div>
      </div>
    </div>
  );
}
