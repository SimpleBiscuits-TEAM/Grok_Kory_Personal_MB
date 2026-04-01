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
 *   - WOT qualification: requires 3+ seconds of TPS > 90%
 *   - AFR correction factor applied to injector PW for HP calculation
 *   - Wideband availability warning
 *   - PNG export / download
 *   - Fullscreen mode
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Maximize2, Minimize2, AlertTriangle } from 'lucide-react';
import { WP8ParseResult, getHondaTalonKeyChannels } from '@/lib/wp8Parser';
import {
  VirtualDynoConfig,
  FUEL_PROFILES,
  INJECTOR_FLOW_RATES,
  calculateFuelFlow,
  estimateHP,
  calculateTorque,
  smoothCurve,
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
  fileName: string;
  warnings: string[];
  qualified: boolean;
  disqualifyReason?: string;
}

// ─── WOT Detection & AFR Correction ────────────────────────────────────────

const WOT_TPS_THRESHOLD = 90;    // degrees — consider WOT above this
const WOT_MIN_DURATION_SEC = 3;  // minimum 3 seconds of WOT
const NA_TARGET_LAMBDA = 0.85;
const TURBO_TARGET_LAMBDA = 0.80;

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
  if (honda3BarIdx >= 0 && !config.isTurbo) {
    warnings.push('Honda 3-bar MAP sensor detected — vehicle may be turbocharged.');
  }

  if (!hasWideband) {
    warnings.push('No wideband AFR/Lambda data available — HP numbers may not be accurate. Install a wideband O2 sensor for more precise results.');
  }

  if (rpmIdx < 0) {
    return {
      runs: [], hpCurve: [], peakHP: 0, peakHPRpm: 0,
      peakTorque: 0, peakTorqueRpm: 0, hasWideband, hasDynoData, isTurbo: config.isTurbo,
      fileName, warnings: ['Missing Engine Speed channel — cannot generate dyno sheet'],
      qualified: false, disqualifyReason: 'Missing Engine Speed channel',
    };
  }

  if (injPWIdx < 0) {
    return {
      runs: [], hpCurve: [], peakHP: 0, peakHPRpm: 0,
      peakTorque: 0, peakTorqueRpm: 0, hasWideband, hasDynoData, isTurbo: config.isTurbo,
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
  const wotRuns: WOTRun[] = [];
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
        wotRuns.push(buildWOTRun(wp8, wotStart, i - 1, keys, config, fuel, injFlowRate, targetLambda, hasWideband, isLambdaChannel, afrSourceIdx, sampleRate, hasDynoData, realHPIdx, realTorqueIdx));
      }
      wotStart = -1;
    }
  }

  // Check if still in WOT at end of log
  if (wotStart >= 0) {
    const runLength = wp8.rows.length - wotStart;
    if (runLength >= minWOTSamples) {
      wotRuns.push(buildWOTRun(wp8, wotStart, wp8.rows.length - 1, keys, config, fuel, injFlowRate, targetLambda, hasWideband, isLambdaChannel, afrSourceIdx, sampleRate, hasDynoData, realHPIdx, realTorqueIdx));
    }
  }

  if (wotRuns.length === 0) {
    return {
      runs: [], hpCurve: [], peakHP: 0, peakHPRpm: 0,
      peakTorque: 0, peakTorqueRpm: 0, hasWideband, hasDynoData, isTurbo: config.isTurbo,
      fileName, warnings,
      qualified: false,
      disqualifyReason: `No full-throttle run detected (need ${WOT_MIN_DURATION_SEC}+ seconds at ${WOT_TPS_THRESHOLD}%+ TPS)`,
    };
  }

  // Use the best (longest) WOT run for the dyno sheet
  const bestRun = wotRuns.reduce((a, b) => a.durationSec > b.durationSec ? a : b);

  // Build RPM-binned curve from the best run
  const RPM_BIN_SIZE = 250;
  const rpmBins = new Map<number, { hpMax: number; torqueMax: number; count: number }>();

  for (const pt of bestRun.points) {
    if (pt.rpm < 2000) continue;
    const bin = Math.round(pt.rpm / RPM_BIN_SIZE) * RPM_BIN_SIZE;
    const existing = rpmBins.get(bin) || { hpMax: 0, torqueMax: 0, count: 0 };
    existing.hpMax = Math.max(existing.hpMax, pt.hp);
    existing.torqueMax = Math.max(existing.torqueMax, pt.torque);
    existing.count++;
    rpmBins.set(bin, existing);
  }

  let hpCurve = Array.from(rpmBins.entries())
    .filter(([_, bin]) => bin.count >= 2)
    .map(([rpm, bin]) => ({
      rpm,
      hp: Math.round(bin.hpMax * 100) / 100,
      torque: Math.round(bin.torqueMax * 100) / 100,
    }))
    .sort((a, b) => a.rpm - b.rpm);

  // Smooth the curve
  hpCurve = smoothCurve(hpCurve, 3);

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
  const injPWIdx = keys.injPwFinal >= 0 ? keys.injPwFinal : keys.injPwDesired;
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
      hp = estimateHP(fuelFlowGPerSec, fuel.bsfc);
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

// ─── Canvas Renderer ────────────────────────────────────────────────────────

interface DynoSheetProps {
  data: DynoSheetData;
  config: VirtualDynoConfig;
  compareData?: DynoSheetData | null;
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 900;
const HEADER_HEIGHT = 80;
const FOOTER_HEIGHT = 60;
const PANEL_GAP = 8;
const MARGIN = { left: 70, right: 70, top: 10, bottom: 25 };
const SEPARATOR_HEIGHT = 6;

// Colors
const COLORS = {
  bg: '#FFFFFF',
  grid: '#E0E0E0',
  gridMinor: '#F0F0F0',
  text: '#333333',
  textLight: '#888888',
  axisLabel: '#555555',
  hpLine: '#2563EB',       // blue
  torqueLine: '#DC2626',   // red
  rpmLine: '#DC2626',      // red for RPM trace
  separator: '#888888',
  peakMarker: '#333333',
  warning: '#B45309',
  ppeiRed: '#CC0000',
  // Comparison overlay colors (dashed, lighter)
  hpLineCompare: '#93C5FD',     // light blue for comparison HP
  torqueLineCompare: '#FCA5A5', // light red for comparison torque
  rpmLineCompare: '#FCA5A5',    // light red for comparison RPM
};

function drawDynoSheet(
  canvas: HTMLCanvasElement,
  data: DynoSheetData,
  logoImg: HTMLImageElement | null,
  compareData?: DynoSheetData | null,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Clear
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // ─── Header ─────────────────────────────────────────────────────────
  // PPEI Logo
  if (logoImg && logoImg.complete) {
    const logoSize = 50;
    const logoX = W / 2 - logoSize / 2;
    ctx.drawImage(logoImg, logoX, 8, logoSize, logoSize);
  }

  // "PPEI Virtual Dyno" text
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PPEI Virtual Dyno', W / 2, 72);

  // MEASURED vs ESTIMATED badge
  const badgeText = data.hasDynoData ? 'MEASURED' : 'ESTIMATED';
  const badgeColor = data.hasDynoData ? '#22c55e' : '#f59e0b';
  ctx.font = 'bold 10px Arial, sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 12;
  const badgeX = W / 2 + ctx.measureText('PPEI Virtual Dyno').width / 2 + 8;
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.roundRect(badgeX - 2, 60, badgeW, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.textAlign = 'left';
  ctx.fillText(badgeText, badgeX + 4, 72);

  // Config info (right side)
  ctx.font = '11px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.textLight;
  ctx.fillText('CF: SAE Smoothing: 5', W - 20, 20);

  // ─── Calculate panel dimensions ─────────────────────────────────────
  const chartAreaHeight = H - HEADER_HEIGHT - FOOTER_HEIGHT - SEPARATOR_HEIGHT * 2 - PANEL_GAP * 2;
  const rpmPanelHeight = Math.floor(chartAreaHeight * 0.25);
  const hpPanelHeight = Math.floor(chartAreaHeight * 0.375);
  const torquePanelHeight = chartAreaHeight - rpmPanelHeight - hpPanelHeight;

  const rpmPanelY = HEADER_HEIGHT;
  const hpPanelY = rpmPanelY + rpmPanelHeight + SEPARATOR_HEIGHT + PANEL_GAP;
  const torquePanelY = hpPanelY + hpPanelHeight + SEPARATOR_HEIGHT + PANEL_GAP;

  // ─── Determine axis ranges ─────────────────────────────────────────
  const curve = data.hpCurve;
  if (curve.length === 0) {
    ctx.fillStyle = COLORS.text;
    ctx.font = '18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No qualifying WOT data', W / 2, H / 2);
    return;
  }

  const minRPM = Math.floor(curve[0].rpm / 1000) * 1000;
  const maxRPM = Math.ceil(curve[curve.length - 1].rpm / 1000) * 1000;
  const rpmRange = maxRPM - minRPM || 1000;

  // HP axis: round up to nearest 20
  const maxHP = Math.ceil((data.peakHP * 1.15) / 20) * 20;
  // Torque axis: round up to nearest 10
  const maxTorque = Math.ceil((data.peakTorque * 1.15) / 10) * 10;
  // RPM axis for top panel: show in thousands
  const maxRPMDisplay = Math.ceil(maxRPM / 1000);

  // Chart area bounds (shared X axis)
  const chartLeft = MARGIN.left;
  const chartRight = W - MARGIN.right;
  const chartWidth = chartRight - chartLeft;

  function rpmToX(rpm: number): number {
    return chartLeft + ((rpm - minRPM) / rpmRange) * chartWidth;
  }

  // ─── Draw Panel 1: Engine Speed ─────────────────────────────────────
  const rpmChartTop = rpmPanelY + MARGIN.top;
  const rpmChartBottom = rpmPanelY + rpmPanelHeight - MARGIN.bottom;
  const rpmChartHeight = rpmChartBottom - rpmChartTop;

  function rpmToY_panel1(rpm: number): number {
    return rpmChartBottom - (rpm / (maxRPMDisplay * 1000)) * rpmChartHeight;
  }

  // Grid
  drawGrid(ctx, chartLeft, rpmChartTop, chartWidth, rpmChartHeight, minRPM, maxRPM, 1000, 0, maxRPMDisplay * 1000, maxRPMDisplay * 1000 / 5);

  // Y-axis label
  ctx.save();
  ctx.translate(15, rpmChartTop + rpmChartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Engine Speed (rpmx1000)', 0, 0);
  ctx.restore();

  // Y-axis ticks
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'right';
  for (let r = 0; r <= maxRPMDisplay; r += 2) {
    const y = rpmChartBottom - (r / maxRPMDisplay) * rpmChartHeight;
    ctx.fillText(String(r), chartLeft - 5, y + 3);
  }

  // Draw comparison RPM trace (behind main)
  if (compareData && compareData.hpCurve.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS.rpmLineCompare;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    let cFirst = true;
    for (const pt of compareData.hpCurve) {
      const x = rpmToX(pt.rpm);
      const y = rpmToY_panel1(pt.rpm);
      if (cFirst) { ctx.moveTo(x, y); cFirst = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw RPM trace line
  ctx.beginPath();
  ctx.strokeStyle = COLORS.rpmLine;
  ctx.lineWidth = 2;
  let first = true;
  for (const pt of curve) {
    const x = rpmToX(pt.rpm);
    const y = rpmToY_panel1(pt.rpm);
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Peak RPM annotation
  const peakRPMPt = curve[curve.length - 1];
  const peakRPMx = rpmToX(peakRPMPt.rpm);
  const peakRPMy = rpmToY_panel1(peakRPMPt.rpm);
  ctx.fillStyle = COLORS.rpmLine;
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((peakRPMPt.rpm / 1000).toFixed(3), peakRPMx, peakRPMy - 8);

  // Separator bar
  drawSeparator(ctx, 0, rpmPanelY + rpmPanelHeight, W, SEPARATOR_HEIGHT);

  // ─── Draw Panel 2: Power (HP) ───────────────────────────────────────
  const hpChartTop = hpPanelY + MARGIN.top;
  const hpChartBottom = hpPanelY + hpPanelHeight - MARGIN.bottom;
  const hpChartHeight = hpChartBottom - hpChartTop;

  function hpToY(hp: number): number {
    return hpChartBottom - (hp / maxHP) * hpChartHeight;
  }

  // Grid
  drawGrid(ctx, chartLeft, hpChartTop, chartWidth, hpChartHeight, minRPM, maxRPM, 1000, 0, maxHP, 20);

  // Y-axis label
  ctx.save();
  ctx.translate(15, hpChartTop + hpChartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Power (hp)', 0, 0);
  ctx.restore();

  // Y-axis ticks
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'right';
  for (let hp = 0; hp <= maxHP; hp += 20) {
    const y = hpToY(hp);
    ctx.fillText(String(hp), chartLeft - 5, y + 3);
  }

  // Draw comparison HP curve (behind main)
  if (compareData && compareData.hpCurve.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS.hpLineCompare;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    let cFirst = true;
    for (const pt of compareData.hpCurve) {
      const x = rpmToX(pt.rpm);
      const y = hpToY(pt.hp);
      if (cFirst) { ctx.moveTo(x, y); cFirst = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw HP curve
  ctx.beginPath();
  ctx.strokeStyle = COLORS.hpLine;
  ctx.lineWidth = 2.5;
  first = true;
  for (const pt of curve) {
    const x = rpmToX(pt.rpm);
    const y = hpToY(pt.hp);
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Peak HP annotation
  const peakHPPt = curve.find(p => p.hp === Math.max(...curve.map(c => c.hp)));
  if (peakHPPt) {
    const px = rpmToX(peakHPPt.rpm);
    const py = hpToY(peakHPPt.hp);

    // Peak marker triangle
    ctx.fillStyle = COLORS.hpLine;
    ctx.beginPath();
    ctx.moveTo(px, py - 6);
    ctx.lineTo(px - 4, py);
    ctx.lineTo(px + 4, py);
    ctx.closePath();
    ctx.fill();

    // Peak value text
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.peakHP.toFixed(3), px, py - 10);
  }

  // Legend box
  const legendY = hpChartTop + 15;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(chartLeft + chartWidth * 0.25, legendY - 12, 320, compareData ? 36 : 20);
  ctx.fillStyle = COLORS.hpLine;
  ctx.fillRect(chartLeft + chartWidth * 0.25 + 5, legendY - 5, 10, 10);
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Max Power = ${data.peakHP.toFixed(3)} at Engine RPM = ${(data.peakHPRpm / 1000).toFixed(3)}`,
    chartLeft + chartWidth * 0.25 + 20, legendY + 3,
  );
  if (compareData && compareData.qualified) {
    ctx.fillStyle = COLORS.hpLineCompare;
    ctx.fillRect(chartLeft + chartWidth * 0.25 + 5, legendY + 11, 10, 10);
    ctx.fillStyle = COLORS.textLight;
    ctx.fillText(
      `Baseline Power = ${compareData.peakHP.toFixed(3)} at ${(compareData.peakHPRpm / 1000).toFixed(3)}`,
      chartLeft + chartWidth * 0.25 + 20, legendY + 19,
    );
  }

  // Separator bar
  drawSeparator(ctx, 0, hpPanelY + hpPanelHeight, W, SEPARATOR_HEIGHT);

  // ─── Draw Panel 3: Torque ───────────────────────────────────────────
  const torqueChartTop = torquePanelY + MARGIN.top;
  const torqueChartBottom = torquePanelY + torquePanelHeight - MARGIN.bottom;
  const torqueChartHeight = torqueChartBottom - torqueChartTop;

  function torqueToY(torque: number): number {
    return torqueChartBottom - (torque / maxTorque) * torqueChartHeight;
  }

  // Grid
  drawGrid(ctx, chartLeft, torqueChartTop, chartWidth, torqueChartHeight, minRPM, maxRPM, 1000, 0, maxTorque, 10);

  // Y-axis label
  ctx.save();
  ctx.translate(15, torqueChartTop + torqueChartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Torque (ft-lbs)', 0, 0);
  ctx.restore();

  // Y-axis ticks
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'right';
  for (let t = 0; t <= maxTorque; t += 10) {
    const y = torqueToY(t);
    ctx.fillText(String(t), chartLeft - 5, y + 3);
  }

  // Draw comparison Torque curve (behind main)
  if (compareData && compareData.hpCurve.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS.torqueLineCompare;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    let cFirst = true;
    for (const pt of compareData.hpCurve) {
      const x = rpmToX(pt.rpm);
      const y = torqueToY(pt.torque);
      if (cFirst) { ctx.moveTo(x, y); cFirst = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw Torque curve
  ctx.beginPath();
  ctx.strokeStyle = COLORS.torqueLine;
  ctx.lineWidth = 2.5;
  first = true;
  for (const pt of curve) {
    const x = rpmToX(pt.rpm);
    const y = torqueToY(pt.torque);
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Peak Torque annotation
  const peakTqPt = curve.find(p => p.torque === Math.max(...curve.map(c => c.torque)));
  if (peakTqPt) {
    const px = rpmToX(peakTqPt.rpm);
    const py = torqueToY(peakTqPt.torque);

    // Peak marker triangle
    ctx.fillStyle = COLORS.torqueLine;
    ctx.beginPath();
    ctx.moveTo(px, py - 6);
    ctx.lineTo(px - 4, py);
    ctx.lineTo(px + 4, py);
    ctx.closePath();
    ctx.fill();

    // Peak value text
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.peakTorque.toFixed(3), px, py - 10);
  }

  // Legend box
  const tqLegendY = torqueChartTop + 15;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(chartLeft + chartWidth * 0.25, tqLegendY - 12, 340, compareData ? 36 : 20);
  ctx.fillStyle = COLORS.torqueLine;
  ctx.fillRect(chartLeft + chartWidth * 0.25 + 5, tqLegendY - 5, 10, 10);
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Max Torque = ${data.peakTorque.toFixed(3)} at Engine RPM = ${(data.peakTorqueRpm / 1000).toFixed(3)}`,
    chartLeft + chartWidth * 0.25 + 20, tqLegendY + 3,
  );
  if (compareData && compareData.qualified) {
    ctx.fillStyle = COLORS.torqueLineCompare;
    ctx.fillRect(chartLeft + chartWidth * 0.25 + 5, tqLegendY + 11, 10, 10);
    ctx.fillStyle = COLORS.textLight;
    ctx.fillText(
      `Baseline Torque = ${compareData.peakTorque.toFixed(3)} at ${(compareData.peakTorqueRpm / 1000).toFixed(3)}`,
      chartLeft + chartWidth * 0.25 + 20, tqLegendY + 19,
    );
  }

  // ─── X-axis (shared) ───────────────────────────────────────────────
  ctx.fillStyle = COLORS.axisLabel;
  ctx.font = '11px Arial, sans-serif';
  ctx.textAlign = 'center';

  for (let rpm = minRPM; rpm <= maxRPM; rpm += 1000) {
    const x = rpmToX(rpm);
    ctx.fillText((rpm / 1000).toString(), x, torqueChartBottom + 15);
  }

  ctx.fillText('Engine RPM (rpmx1000)', chartLeft + chartWidth / 2, torqueChartBottom + 30);

  // ─── Footer ─────────────────────────────────────────────────────────
  const footerY = H - FOOTER_HEIGHT;

  // Run name
  ctx.fillStyle = COLORS.hpLine;
  ctx.fillRect(20, footerY + 8, 10, 10);
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(data.fileName || 'Uploaded Datalog', 35, footerY + 17);

  // Wideband warning
  if (!data.hasWideband) {
    ctx.fillStyle = COLORS.warning;
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ No wideband data — HP numbers may not be accurate', W / 2, footerY + 35);
  }

  // Disclaimer
  ctx.fillStyle = COLORS.textLight;
  ctx.font = '9px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Virtual dyno estimates are dependent on tuning setup and conditions — results serve as reference only.',
    W / 2, footerY + 50,
  );

  // PPEI watermark (semi-transparent in center)
  if (logoImg && logoImg.complete) {
    ctx.globalAlpha = 0.06;
    const wmSize = 200;
    ctx.drawImage(logoImg, W / 2 - wmSize / 2, H / 2 - wmSize / 2, wmSize, wmSize);
    ctx.globalAlpha = 1.0;
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  xMin: number, xMax: number, xStep: number,
  yMin: number, yMax: number, yStep: number,
) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.5;

  // Vertical gridlines (RPM)
  for (let v = xMin; v <= xMax; v += xStep) {
    const px = x + ((v - xMin) / (xMax - xMin)) * w;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + h);
    ctx.stroke();
  }

  // Horizontal gridlines
  const yRange = yMax - yMin || 1;
  for (let v = yMin; v <= yMax; v += yStep) {
    const py = y + h - ((v - yMin) / yRange) * h;
    ctx.beginPath();
    ctx.moveTo(x, py);
    ctx.lineTo(x + w, py);
    ctx.stroke();
  }

  // Border
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawSeparator(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
) {
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, '#999999');
  gradient.addColorStop(0.5, '#666666');
  gradient.addColorStop(1, '#999999');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
}

// ─── React Component ────────────────────────────────────────────────────────

export default function DynoSheet({ data, config, compareData }: DynoSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Load PPEI logo
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLogoImg(img);
    img.src = PPEI_LOGO_URL;
  }, []);

  // Draw on canvas when data or logo changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.qualified) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    drawDynoSheet(canvas, data, logoImg, compareData);
  }, [data, logoImg, compareData]);

  // Download as PNG
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `PPEI_Virtual_Dyno_${data.fileName.replace(/\.[^.]+$/, '')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [data.fileName]);

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

  // ─── Not Qualified ──────────────────────────────────────────────────
  if (!data.qualified) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Dyno Sheet Not Available</h3>
        <p className="text-zinc-400 mb-4">{data.disqualifyReason}</p>
        <p className="text-zinc-500 text-sm">
          The datalog must contain at least {WOT_MIN_DURATION_SEC} seconds of full throttle
          (TPS &gt; {WOT_TPS_THRESHOLD}%) to generate a virtual dyno sheet.
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

  return (
    <div ref={containerRef} className={`${isFullscreen ? 'bg-black flex items-center justify-center h-full' : ''}`}>
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-white tracking-wider" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            PPEI VIRTUAL DYNO
          </h3>
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
            onClick={handleDownload}
            className="text-zinc-300 border-zinc-600 hover:bg-zinc-800"
          >
            <Download className="w-4 h-4 mr-1" />
            Download PNG
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

      {/* Canvas */}
      <div className="bg-white rounded-lg overflow-hidden shadow-lg">
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: isFullscreen ? '90vh' : '700px',
          }}
        />
      </div>

      {/* Stats below canvas */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Peak HP</div>
          <div className="text-xl font-bold text-blue-400">{data.peakHP.toFixed(1)}</div>
          <div className="text-xs text-zinc-500">@ {data.peakHPRpm} RPM</div>
          {compareData && compareData.qualified && (
            <div className="text-xs mt-1" style={{ color: data.peakHP > compareData.peakHP ? '#22c55e' : data.peakHP < compareData.peakHP ? '#ef4444' : '#888' }}>
              {data.peakHP > compareData.peakHP ? '+' : ''}{(data.peakHP - compareData.peakHP).toFixed(1)} HP vs baseline
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Peak Torque</div>
          <div className="text-xl font-bold text-red-400">{data.peakTorque.toFixed(1)}</div>
          <div className="text-xs text-zinc-500">@ {data.peakTorqueRpm} RPM</div>
          {compareData && compareData.qualified && (
            <div className="text-xs mt-1" style={{ color: data.peakTorque > compareData.peakTorque ? '#22c55e' : data.peakTorque < compareData.peakTorque ? '#ef4444' : '#888' }}>
              {data.peakTorque > compareData.peakTorque ? '+' : ''}{(data.peakTorque - compareData.peakTorque).toFixed(1)} ft-lbs vs baseline
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">WOT Runs</div>
          <div className="text-xl font-bold text-green-400">{data.runs.length}</div>
          <div className="text-xs text-zinc-500">detected</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded p-3 text-center">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Best Run</div>
          <div className="text-xl font-bold text-zinc-300">
            {data.runs.length > 0 ? data.runs.reduce((a, b) => a.durationSec > b.durationSec ? a : b).durationSec.toFixed(1) : '—'}s
          </div>
          <div className="text-xs text-zinc-500">duration</div>
        </div>
      </div>
    </div>
  );
}
