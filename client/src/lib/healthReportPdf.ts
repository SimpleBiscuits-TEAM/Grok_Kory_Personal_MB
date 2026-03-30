/**
 * PPEI Vehicle Health Report PDF Generator
 * Author: Kory (Maybe?)
 *
 * Generates a standalone, customer-facing PDF health report with personality.
 * Tone: dry humor, darker truck jokes (respectful), adjusts based on severity.
 * Includes BETA AI disclaimer, dyno graph note, data graphs, and recommendations.
 */

import jsPDF from 'jspdf';
import { HealthReportData } from './healthReport';
import { ProcessedMetrics } from './dataProcessor';
import { renderAdvancedAnalytics } from './advancedHealthPdf';
import { DragAnalysis, DragRun, DragTip } from './dragAnalyzer';
import { APP_VERSION } from './version';

const PPEI_RED: [number, number, number] = [220, 38, 38];
const DARK_BG: [number, number, number] = [13, 15, 20];
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_GRAY: [number, number, number] = [180, 180, 180];
const MED_GRAY: [number, number, number] = [120, 120, 120];
const TEXT_DARK: [number, number, number] = [40, 40, 40];
const TEXT_BODY: [number, number, number] = [60, 60, 60];
const GREEN: [number, number, number] = [22, 163, 74];
const AMBER: [number, number, number] = [202, 138, 4];
const BLUE: [number, number, number] = [30, 100, 200];

function getOverallMood(status: string): 'happy' | 'cautious' | 'concerned' | 'serious' {
  if (status === 'excellent') return 'happy';
  if (status === 'good') return 'cautious';
  if (status === 'fair') return 'concerned';
  return 'serious';
}

function getGreeting(mood: 'happy' | 'cautious' | 'concerned' | 'serious', vehicleName: string): string {
  switch (mood) {
    case 'happy':
      return `Your ${vehicleName} checked out clean. No drama, no surprises. Either you take care of this thing or it's too scared of you to break. Either way, well done.`;
    case 'cautious':
      return `Your ${vehicleName} is doing alright. Not perfect, but nothing that suggests it's plotting against you yet. We found a couple of things worth watching before they become things worth paying for.`;
    case 'concerned':
      return `Your ${vehicleName} is trying to tell you something, and it's not "I'm fine." We found some items that need attention. Ignoring them won't make them go away — it'll just make them more expensive. Let's walk through what the data is saying.`;
    case 'serious':
      return `We need to have a conversation about your ${vehicleName}. The data doesn't lie, and right now it's telling a story you probably don't want to hear. Some of these findings need professional attention sooner rather than later. Don't shoot the messenger — we're just reading the numbers.`;
  }
}

function getClosing(mood: 'happy' | 'cautious' | 'concerned' | 'serious'): string {
  switch (mood) {
    case 'happy':
      return `Your truck passed with flying colors. Keep doing whatever you're doing. Or don't change anything and just take credit for it. We won't tell.`;
    case 'cautious':
      return `Nothing here is going to ruin your weekend, but addressing these items will keep it that way. A little preventive maintenance now beats a tow truck later. Your wallet will thank you.`;
    case 'concerned':
      return `This report has more yellow than we'd like. The silver lining is that you caught it now instead of on the side of the highway. Get these items looked at and your truck will forgive you. Probably.`;
    case 'serious':
      return `We strongly recommend addressing these findings before any heavy towing or spirited driving. Contact PPEI directly if you need guidance. Your truck needs help, and pretending otherwise won't fix it.`;
  }
}

function getScoreEmoji(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'B+';
  if (score >= 70) return 'C+';
  if (score >= 60) return 'D';
  return 'F';
}

function getSectionComment(name: string, score: number): string {
  if (score >= 95) {
    const comments: Record<string, string> = {
      'Engine Health': 'Running clean. No misfires, no drama. This engine owes you nothing.',
      'Fuel System': 'Rail pressure is locked in. The injectors are doing their job and the regulator isn\'t hunting. Textbook.',
      'Transmission': 'Shifts are clean, converter lockup is solid, no slip events. This trans is earning its keep.',
      'Thermal Management': 'Temps are where they should be. The cooling system is doing exactly what GM designed it to do.',
    };
    return comments[name] || 'No issues detected. Everything within spec.';
  }
  if (score >= 80) {
    const comments: Record<string, string> = {
      'Engine Health': 'Engine is running well with minor notes. Nothing that warrants a panic call, but worth knowing about.',
      'Fuel System': 'Fuel system is mostly behaving. A few readings caught our attention, but nothing that screams "problem" yet.',
      'Transmission': 'Trans is performing well overall. A couple of data points worth monitoring on future logs.',
      'Thermal Management': 'Temps are generally in range. One or two readings were a bit warm, but not enough to lose sleep over.',
    };
    return comments[name] || 'Performing well with minor items to monitor.';
  }
  if (score >= 60) {
    const comments: Record<string, string> = {
      'Engine Health': 'The engine has some items that need attention. It\'s not dead yet, but it\'s definitely sending you hints.',
      'Fuel System': 'The fuel system is showing stress. Rail pressure deviations or regulator behavior suggest something needs a closer look.',
      'Transmission': 'The transmission data has some concerning trends. A fluid change and inspection would be a smart move before this gets worse.',
      'Thermal Management': 'Temps are running hotter than they should. Could be a thermostat, could be a fan, could be a head gasket starting to think about retirement.',
    };
    return comments[name] || 'Needs attention. Don\'t wait until it strands you.';
  }
  const comments: Record<string, string> = {
    'Engine Health': 'This engine needs professional help. Not the kind you can YouTube your way through.',
    'Fuel System': 'The fuel system is in rough shape. Injectors, regulator, or pump — something in there is not having a good time.',
    'Transmission': 'The transmission data is concerning enough that we\'d recommend a specialist look at it. Sooner, not later.',
    'Thermal Management': 'Temperature readings are outside safe operating ranges. This is the kind of thing that turns a repair into a rebuild.',
  };
  return comments[name] || 'Needs immediate professional attention.';
}

// ── Mini graph drawing helpers ────────────────────────────────────────────────

interface MiniGraphConfig {
  data: number[];
  label: string;
  unit: string;
  color: [number, number, number];
  thresholdHigh?: number;
  thresholdLow?: number;
  speedData?: number[];  // MPH overlay for reference
  rpmData?: number[];    // RPM overlay for reference
  isSpeedGraph?: boolean; // skip speed overlay on the speed graph itself
  isRpmGraph?: boolean;   // skip RPM overlay on the RPM graph itself
}

/** Generate a data-driven synopsis of what actually happened in the graph */
function generateSynopsis(label: string, min: number, max: number, avg: number, unit: string, sampled: number[]): string {
  const peakIdx = sampled.indexOf(Math.max(...sampled));
  const peakPct = ((peakIdx / sampled.length) * 100).toFixed(0);
  const earlyAvg = sampled.slice(0, Math.floor(sampled.length * 0.25)).reduce((a, b) => a + b, 0) / Math.floor(sampled.length * 0.25);
  const lateAvg = sampled.slice(Math.floor(sampled.length * 0.75)).reduce((a, b) => a + b, 0) / (sampled.length - Math.floor(sampled.length * 0.75));
  const trend = lateAvg > earlyAvg * 1.1 ? 'rising' : lateAvg < earlyAvg * 0.9 ? 'falling' : 'steady';

  switch (label) {
    case 'ENGINE RPM':
      return `RPM ranged from ${min.toFixed(0)} to ${max.toFixed(0)}, averaging ${avg.toFixed(0)} RPM. Peak hit around ${peakPct}% through the log. The trend was ${trend} over the recording.`;
    case 'BOOST PRESSURE':
      return `Boost peaked at ${max.toFixed(1)} PSI and averaged ${avg.toFixed(1)} PSI during the log. Peak boost occurred around ${peakPct}% through the recording. Overall boost trend was ${trend}.`;
    case 'FUEL RAIL PRESSURE':
      return `Rail pressure ranged from ${min.toFixed(0)} to ${max.toFixed(0)} PSI, averaging ${avg.toFixed(0)} PSI. The highest demand point was around ${peakPct}% through the log.`;
    case 'COOLANT TEMPERATURE': {
      const stabilized = sampled.filter(v => v > avg * 0.9);
      const stableAvg = stabilized.length > 0 ? stabilized.reduce((a, b) => a + b, 0) / stabilized.length : avg;
      return `Coolant ranged from ${min.toFixed(0)}${unit} to ${max.toFixed(0)}${unit}. After warm-up, it stabilized around ${stableAvg.toFixed(0)}${unit}. Trend was ${trend} over the session.`;
    }
    case 'EXHAUST GAS TEMPERATURE':
      return `EGT ranged from ${min.toFixed(0)}${unit} to ${max.toFixed(0)}${unit}, averaging ${avg.toFixed(0)}${unit}. Peak EGT occurred around ${peakPct}% through the log. Trend was ${trend}.`;
    case 'TORQUE CONVERTER SLIP': {
      const lockedPct = ((sampled.filter(v => Math.abs(v) < 20).length / sampled.length) * 100).toFixed(0);
      return `Converter slip ranged from ${min.toFixed(0)} to ${max.toFixed(0)} RPM. The converter was locked (near-zero slip) approximately ${lockedPct}% of the time.`;
    }
    case 'TRANSMISSION FLUID TEMP': {
      const stableTemp = sampled.slice(Math.floor(sampled.length * 0.5));
      const stableAvgT = stableTemp.reduce((a, b) => a + b, 0) / stableTemp.length;
      return `Trans fluid temp ranged from ${min.toFixed(0)}${unit} to ${max.toFixed(0)}${unit}. In the second half of the log it averaged ${stableAvgT.toFixed(0)}${unit}. Trend was ${trend}.`;
    }
    case 'VEHICLE SPEED':
      return `Speed ranged from ${min.toFixed(0)} to ${max.toFixed(0)} MPH, averaging ${avg.toFixed(0)} MPH over the recording.`;
    default:
      return `Ranged from ${min.toFixed(1)}${unit} to ${max.toFixed(1)}${unit}, averaging ${avg.toFixed(1)}${unit}.`;
  }
}

/** Round to a "nice" number for axis labels */
function niceRound(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 10000) return Math.round(val / 100) * 100 + '';
  if (abs >= 1000) return Math.round(val / 50) * 50 + '';
  if (abs >= 100) return Math.round(val / 10) * 10 + '';
  if (abs >= 10) return Math.round(val) + '';
  return val.toFixed(1);
}

function drawMiniGraph(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  config: MiniGraphConfig,
  margin: number,
  contentWidth: number,
): number {
  const { data, label, unit, color, thresholdHigh, thresholdLow, speedData, rpmData, isSpeedGraph, isRpmGraph } = config;

  // Filter to valid non-zero data for graph (allow zeros for converter slip)
  const allowZero = label === 'TORQUE CONVERTER SLIP';
  const validData = allowZero ? data.filter(v => !isNaN(v)) : data.filter(v => !isNaN(v) && v !== 0);
  if (validData.length < 10) return y; // Not enough data to graph

  // Downsample to ~200 points for PDF
  const step = Math.max(1, Math.floor(validData.length / 200));
  const sampled = validData.filter((_, i) => i % step === 0);

  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;
  const avg = sampled.reduce((a, b) => a + b, 0) / sampled.length;

  // Reserve space: left margin for Y-axis labels, bottom for RPM/Speed axis
  const yAxisW = 16; // width reserved for Y-axis labels
  const bottomAxisH = 22; // height reserved for RPM + Speed bottom axis (larger for readability, no overlap)
  const totalH = height + bottomAxisH;

  // Graph background
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, totalH, 1, 1, 'FD');

  // Label
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...color);
  doc.text(label, x + 3, y + 5.5);

  // Stats
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MED_GRAY);
  doc.text(`Min: ${niceRound(min)}${unit}  Avg: ${niceRound(avg)}${unit}  Max: ${niceRound(max)}${unit}`, x + 3, y + 10);

  // Draw the line graph area (shifted right for Y-axis labels)
  const graphX = x + yAxisW;
  const graphY = y + 13;
  const graphW = width - yAxisW - 3;
  const graphH = height - 17;

  // Grid lines (5 horizontal) with Y-axis labels for better readability
  doc.setDrawColor(235, 235, 240);
  doc.setLineWidth(0.1);
  const gridSteps = 4; // 5 lines = 4 intervals
  for (let g = 0; g <= gridSteps; g++) {
    const gy = graphY + (graphH * g) / gridSteps;
    doc.line(graphX, gy, graphX + graphW, gy);

    // Y-axis label (simple rounded values)
    const val = max - (g / gridSteps) * range;
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 135);
    doc.text(niceRound(val), x + 1.5, gy + 1.5);
  }

  // Threshold lines
  if (thresholdHigh !== undefined && thresholdHigh >= min && thresholdHigh <= max * 1.1) {
    const thY = graphY + graphH - ((thresholdHigh - min) / range) * graphH;
    doc.setDrawColor(220, 50, 50);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(graphX, thY, graphX + graphW, thY);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(5.5);
    doc.setTextColor(220, 50, 50);
    doc.text(`${thresholdHigh}${unit}`, graphX + graphW - 14, thY - 1);
  }
  if (thresholdLow !== undefined && thresholdLow >= min && thresholdLow <= max) {
    const thY = graphY + graphH - ((thresholdLow - min) / range) * graphH;
    doc.setDrawColor(202, 138, 4);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(graphX, thY, graphX + graphW, thY);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(5.5);
    doc.setTextColor(202, 138, 4);
    doc.text(`${thresholdLow}${unit}`, graphX + graphW - 14, thY - 1);
  }

  // Data line (main series)
  doc.setDrawColor(...color);
  doc.setLineWidth(0.4);
  const points: [number, number][] = sampled.map((v, i) => [
    graphX + (i / (sampled.length - 1)) * graphW,
    graphY + graphH - ((v - min) / range) * graphH,
  ]);
  for (let i = 1; i < points.length; i++) {
    doc.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }

  // ── BOTTOM AXIS: RPM + Speed (separated into distinct bands) ─────────
  const axisY = graphY + graphH + 1; // just below the main graph
  const axisH = bottomAxisH - 2; // ~20mm total for both overlays
  const halfH = axisH / 2; // ~10mm each for RPM and Speed
  const rpmBandTop = axisY;
  const rpmBandBot = axisY + halfH;
  const spdBandTop = rpmBandBot + 0.5; // small gap between bands
  const spdBandBot = axisY + axisH;

  // Light background bands for visual separation
  doc.setFillColor(240, 245, 255); // very light blue for RPM band
  doc.rect(graphX, rpmBandTop, graphW, halfH, 'F');
  doc.setFillColor(245, 245, 250); // very light gray for Speed band
  doc.rect(graphX, spdBandTop, graphW, halfH - 0.5, 'F');

  // Separator line between RPM and Speed bands
  doc.setDrawColor(200, 200, 215);
  doc.setLineWidth(0.2);
  doc.line(graphX, rpmBandBot, graphX + graphW, rpmBandBot);

  // RPM axis (top band, light blue) with tick marks
  if (rpmData && !isRpmGraph && rpmData.length > 10) {
    const rpmValid = rpmData.filter(v => !isNaN(v) && v > 0);
    const rpmStep = Math.max(1, Math.floor(rpmValid.length / 200));
    const rpmSampled = rpmValid.filter((_, i) => i % rpmStep === 0);
    const rpmMax = Math.max(...rpmSampled, 1);
    const traceH = halfH - 4; // leave room for tick labels below trace

    // Draw RPM trace line
    doc.setDrawColor(70, 120, 200);
    doc.setLineWidth(0.25);
    for (let i = 1; i < rpmSampled.length; i++) {
      const x1 = graphX + ((i - 1) / (rpmSampled.length - 1)) * graphW;
      const x2 = graphX + (i / (rpmSampled.length - 1)) * graphW;
      const y1 = rpmBandTop + 1 + traceH - (rpmSampled[i - 1] / rpmMax) * traceH;
      const y2 = rpmBandTop + 1 + traceH - (rpmSampled[i] / rpmMax) * traceH;
      doc.line(x1, y1, x2, y2);
    }

    // RPM tick marks along bottom of RPM band
    const rpmTickCount = 6;
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 120, 200);
    for (let t = 0; t <= rpmTickCount; t++) {
      const frac = t / rpmTickCount;
      const tx = graphX + frac * graphW;
      const idx = Math.min(Math.floor(frac * (rpmSampled.length - 1)), rpmSampled.length - 1);
      const rpmVal = rpmSampled[idx] || 0;
      // Tick mark
      doc.setDrawColor(70, 120, 200);
      doc.setLineWidth(0.12);
      doc.line(tx, rpmBandBot - 3.5, tx, rpmBandBot - 2.5);
      // Value label
      doc.text(`${Math.round(rpmVal)}`, tx - 2.5, rpmBandBot - 0.5);
    }
    // RPM label at left
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(70, 120, 200);
    doc.text('RPM', x + 1, rpmBandTop + 4);
  }

  // Speed axis (bottom band, gray) with tick marks
  if (speedData && !isSpeedGraph && speedData.length > 10) {
    const spdValid = speedData.filter(v => !isNaN(v));
    const spdStep = Math.max(1, Math.floor(spdValid.length / 200));
    const spdSampled = spdValid.filter((_, i) => i % spdStep === 0);
    const spdMax = Math.max(...spdSampled, 1);
    const bandH = spdBandBot - spdBandTop;
    const traceH = bandH - 4; // leave room for tick labels below trace

    // Draw speed trace line
    doc.setDrawColor(130, 130, 160);
    doc.setLineWidth(0.25);
    for (let i = 1; i < spdSampled.length; i++) {
      const x1 = graphX + ((i - 1) / (spdSampled.length - 1)) * graphW;
      const x2 = graphX + (i / (spdSampled.length - 1)) * graphW;
      const y1 = spdBandTop + 1 + traceH - (spdSampled[i - 1] / spdMax) * traceH;
      const y2 = spdBandTop + 1 + traceH - (spdSampled[i] / spdMax) * traceH;
      doc.line(x1, y1, x2, y2);
    }

    // Speed tick marks along bottom of Speed band
    const spdTickCount = 6;
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130, 130, 160);
    for (let t = 0; t <= spdTickCount; t++) {
      const frac = t / spdTickCount;
      const tx = graphX + frac * graphW;
      const idx = Math.min(Math.floor(frac * (spdSampled.length - 1)), spdSampled.length - 1);
      const spdVal = spdSampled[idx] || 0;
      // Tick mark
      doc.setDrawColor(130, 130, 160);
      doc.setLineWidth(0.12);
      doc.line(tx, spdBandBot - 3.5, tx, spdBandBot - 2.5);
      // Value label
      doc.text(`${Math.round(spdVal)}`, tx - 2.5, spdBandBot - 0.5);
    }
    // MPH label at left
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(130, 130, 160);
    doc.text('MPH', x + 1, spdBandTop + 4);
  }

  let newY = y + totalH + 2;

  // Data-driven synopsis of what happened in this graph
  const synopsis = generateSynopsis(label, min, max, avg, unit, sampled);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(90, 90, 100);
  const synLines = doc.splitTextToSize(synopsis, contentWidth - 4);
  doc.text(synLines, margin + 2, newY);
  newY += synLines.length * 3.4 + 4;

  return newY;
}

/** Draw a single drag strip timeslip card in the PDF (Dragy-style) */
function drawTimeslip(
  doc: jsPDF,
  margin: number,
  startY: number,
  contentWidth: number,
  run: DragRun,
  runIdx: number,
  isBest: boolean,
  checkBreak: (space: number) => void,
  pageHeight: number,
): number {
  let y = startY;
  checkBreak(90);

  const slipW = contentWidth;
  const slipX = margin;
  const borderColor: [number, number, number] = isBest ? PPEI_RED : [80, 80, 90];

  // Outer card background
  doc.setFillColor(18, 18, 24);
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(isBest ? 0.8 : 0.3);
  doc.roundedRect(slipX, y, slipW, 82, 1.5, 1.5, 'FD');

  // Left red accent bar for best run
  if (isBest) {
    doc.setFillColor(...PPEI_RED);
    doc.rect(slipX, y + 1, 2.5, 80, 'F');
  }

  const innerX = slipX + 5;
  const innerW = slipW - 10;

  // Header row: RUN #, BEST badge, quality badge
  y += 5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(160, 160, 170);
  doc.text(`RUN ${runIdx + 1}`, innerX, y);

  if (isBest) {
    doc.setFillColor(...PPEI_RED);
    doc.roundedRect(innerX + 16, y - 3, 14, 4.5, 0.8, 0.8, 'F');
    doc.setFontSize(5.5);
    doc.setTextColor(255, 255, 255);
    doc.text('BEST', innerX + 23, y - 0.5, { align: 'center' });
  }

  // Quality badge
  const qualColor: [number, number, number] =
    run.runQuality === 'excellent' ? GREEN :
    run.runQuality === 'good' ? BLUE :
    run.runQuality === 'fair' ? AMBER : PPEI_RED;
  doc.setFontSize(5.5);
  doc.setTextColor(...qualColor);
  doc.text(run.runQuality.toUpperCase(), innerX + innerW - 2, y, { align: 'right' });

  y += 5;

  // ── ET Grid (4 cells: 60ft, 330ft, 1/8 mile, 1/4 mile) ──────────────
  const cellW = (innerW - 3) / 4;
  const cellH = 14;
  const etData: { label: string; value: number | null; unit: string; highlight: boolean }[] = [
    { label: '60 FT', value: run.time60ft, unit: 's', highlight: true },
    { label: '330 FT', value: run.time330ft, unit: 's', highlight: false },
    { label: '1/8 MILE', value: run.time660ft, unit: 's', highlight: run.time660ft !== null },
    { label: '1/4 MILE', value: run.time1320ft, unit: 's', highlight: run.time1320ft !== null },
  ];

  etData.forEach((cell, ci) => {
    const cx = innerX + ci * (cellW + 1);
    doc.setFillColor(cell.highlight ? 28 : 22, cell.highlight ? 28 : 22, cell.highlight ? 36 : 30);
    doc.roundedRect(cx, y, cellW, cellH, 0.5, 0.5, 'F');

    // Label
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 100);
    doc.text(cell.label, cx + cellW / 2, y + 4, { align: 'center' });

    // Value
    doc.setFontSize(cell.value !== null ? 10 : 7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(cell.value !== null ? (cell.highlight ? 255 : 180) : 60, cell.value !== null ? (cell.highlight ? 255 : 180) : 60, cell.value !== null ? (cell.highlight ? 255 : 190) : 70);
    doc.text(
      cell.value !== null ? cell.value.toFixed(3) : '---',
      cx + cellW / 2,
      y + 10,
      { align: 'center' },
    );

    // Unit
    if (cell.value !== null) {
      doc.setFontSize(4);
      doc.setTextColor(80, 80, 90);
      doc.text(cell.unit, cx + cellW / 2, y + 13, { align: 'center' });
    }
  });

  y += cellH + 2;

  // ── Trap Speed Grid (2 cells: 1/8 trap, 1/4 trap) ────────────────────
  const trapW = (innerW - 1) / 2;
  const trapH = 11;
  const trapData: { label: string; value: number | null }[] = [
    { label: '1/8 TRAP', value: run.speed660ft },
    { label: '1/4 TRAP', value: run.speed1320ft },
  ];

  trapData.forEach((cell, ci) => {
    const cx = innerX + ci * (trapW + 1);
    doc.setFillColor(22, 22, 30);
    doc.roundedRect(cx, y, trapW, trapH, 0.5, 0.5, 'F');

    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 100);
    doc.text(cell.label, cx + trapW / 2, y + 3.5, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(cell.value !== null ? 255 : 60, cell.value !== null ? 255 : 60, cell.value !== null ? 255 : 70);
    doc.text(
      cell.value !== null ? `${cell.value.toFixed(1)} mph` : '---',
      cx + trapW / 2,
      y + 8.5,
      { align: 'center' },
    );
  });

  y += trapH + 2;

  // ── Launch / Peak Stats Row (3 cells) ─────────────────────────────────
  const statW = (innerW - 2) / 3;
  const statH = 10;
  const statData: { label: string; value: string }[] = [
    { label: 'LAUNCH RPM', value: run.launchRpm.toFixed(0) },
    { label: 'PEAK BOOST', value: run.peakBoost > 0 ? `${run.peakBoost.toFixed(1)} psi` : '---' },
    { label: 'PEAK RPM', value: run.peakRpm.toFixed(0) },
  ];

  statData.forEach((cell, ci) => {
    const cx = innerX + ci * (statW + 1);
    doc.setFillColor(26, 26, 34);
    doc.setDrawColor(40, 40, 50);
    doc.setLineWidth(0.15);
    doc.roundedRect(cx, y, statW, statH, 0.5, 0.5, 'FD');

    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 100);
    doc.text(cell.label, cx + statW / 2, y + 3.5, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 220, 230);
    doc.text(cell.value, cx + statW / 2, y + 8, { align: 'center' });
  });

  y += statH + 2;

  // ── Fault Indicator Pills ─────────────────────────────────────────────
  let pillX = innerX;
  const pillH = 4.5;
  const pills: { label: string; color: [number, number, number] }[] = [];

  if (run.maxTccSlip > 75) pills.push({ label: `TCC SLIP ${run.maxTccSlip.toFixed(0)} RPM`, color: PPEI_RED });
  if (run.railPressureDropPct > 5) pills.push({ label: `RAIL DROP ${run.railPressureDropPct.toFixed(1)}%`, color: AMBER });
  if (run.boostDropPct > 10) pills.push({ label: `BOOST DROP ${run.boostDropPct.toFixed(1)}%`, color: BLUE });
  if (run.tccSlipTorqueLoss > 2) pills.push({ label: `~${run.tccSlipTorqueLoss.toFixed(1)}% TORQUE LOST`, color: PPEI_RED });
  if (run.estimatedEtGain > 0.05) pills.push({ label: `~${run.estimatedEtGain.toFixed(2)}s RECOVERABLE`, color: GREEN });

  pills.forEach((pill) => {
    const tw = doc.getTextWidth(pill.label) + 4;
    if (pillX + tw > innerX + innerW) { pillX = innerX; y += pillH + 1; }
    doc.setFillColor(pill.color[0], pill.color[1], pill.color[2]);
    // @ts-ignore
    doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
    doc.roundedRect(pillX, y, tw + 2, pillH, 0.5, 0.5, 'F');
    // @ts-ignore
    doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...pill.color);
    doc.text(pill.label, pillX + 1.5, y + 3.2);
    pillX += tw + 4;
  });

  if (pills.length > 0) y += pillH + 2;

  // ── Gear Shifts Strip ─────────────────────────────────────────────────
  if (run.shifts.length > 0) {
    doc.setDrawColor(40, 40, 50);
    doc.setLineWidth(0.1);
    doc.line(innerX, y, innerX + innerW, y);
    y += 2;

    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 100);
    doc.text('GEAR SHIFTS', innerX, y + 2);

    let shiftX = innerX + 22;
    run.shifts.forEach((shift) => {
      const shiftText = `${shift.gear - 1}\u2192${shift.gear} @${shift.timeFromLaunch.toFixed(2)}s -${shift.rpmDrop.toFixed(0)}rpm`;
      const sw = doc.getTextWidth(shiftText) + 4;
      if (shiftX + sw > innerX + innerW) { shiftX = innerX + 22; y += 5; }

      doc.setFillColor(26, 26, 34);
      doc.setDrawColor(40, 40, 50);
      doc.setLineWidth(0.1);
      doc.roundedRect(shiftX, y, sw, 4.5, 0.5, 0.5, 'FD');

      doc.setFontSize(5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(140, 140, 150);
      doc.text(shiftText, shiftX + 2, y + 3.2);
      shiftX += sw + 2;
    });

    y += 6;
    if (run.totalShiftTimeLost > 0.01) {
      doc.setFontSize(5);
      doc.setTextColor(...AMBER);
      doc.text(`Total shift time lost: ${run.totalShiftTimeLost.toFixed(3)}s`, innerX, y + 2);
      y += 4;
    }
  }

  return y + 6;
}

export function generateHealthReportPdf(
  healthReport: HealthReportData,
  data: ProcessedMetrics,
  fileName: string,
  hasDynoChart: boolean = false,
  dragAnalysis?: DragAnalysis | null,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const vehicleName = healthReport.vehicleInfo
    ? `${healthReport.vehicleInfo.year} ${healthReport.vehicleInfo.make} ${healthReport.vehicleInfo.model}`
    : 'vehicle';

  const mood = getOverallMood(healthReport.overallStatus);

  // ── Helper functions ──────────────────────────────────────────────────────
  const addText = (
    text: string,
    size: number,
    weight: 'normal' | 'bold' | 'italic' = 'normal',
    color: [number, number, number] = TEXT_DARK,
    maxWidth: number = contentWidth,
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const style = weight === 'italic' ? 'italic' : weight;
    doc.setFont('helvetica', style);
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, margin, y);
    y += (lines.length * size) / 2.8 + 2;
  };

  const addWrappedText = (
    text: string,
    size: number,
    weight: 'normal' | 'bold' | 'italic' = 'normal',
    color: [number, number, number] = TEXT_BODY,
    lineSpacing: number = 1.5,
  ) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const style = weight === 'italic' ? 'italic' : weight;
    doc.setFont('helvetica', style);
    const lines = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      checkBreak(size / 2.8 + lineSpacing);
      doc.text(line, margin, y);
      y += size / 2.8 + lineSpacing;
    }
    y += 2;
  };

  const checkBreak = (space: number) => {
    if (y + space > pageHeight - 20) {
      doc.addPage();
      y = margin + 5;
    }
  };

  const drawHR = (color: [number, number, number] = [220, 220, 220]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  };

  const scoreColor = (score: number): [number, number, number] => {
    if (score >= 90) return GREEN;
    if (score >= 75) return BLUE;
    if (score >= 60) return AMBER;
    return PPEI_RED;
  };

  // ══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ══════════════════════════════════════════════════════════════════════════

  // Dark header band
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, pageWidth, 70, 'F');

  // Red accent bar
  doc.setFillColor(...PPEI_RED);
  doc.rect(0, 70, pageWidth, 3, 'F');

  // PPEI branding
  doc.setTextColor(...WHITE);
  doc.setFontSize(32);
  doc.setFont('helvetica', 'bold');
  doc.text('PPEI', margin, 24);

  // Vertical red divider
  doc.setDrawColor(...PPEI_RED);
  doc.setLineWidth(0.8);
  doc.line(margin + 26, 12, margin + 26, 64);

  // Title
  doc.setFontSize(20);
  doc.text('VEHICLE HEALTH REPORT', margin + 32, 24);

  // Subtitle
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...LIGHT_GRAY);
  doc.text('AI-Powered Diagnostic Analysis', margin + 32, 33);

  // Vehicle name
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(vehicleName.toUpperCase(), margin + 32, 44);

  // File & date info
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MED_GRAY);
  doc.text(`Datalog: ${fileName}`, margin + 32, 53);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin + 32, 59);
  doc.text(`Author: Kory (Maybe?)`, margin + 32, 65);

  // V-OP BETA badge
  doc.setFillColor(...PPEI_RED);
  doc.roundedRect(pageWidth - margin - 44, 10, 44, 12, 1.5, 1.5, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`V-OP BETA ${APP_VERSION}`, pageWidth - margin - 22, 17.5, { align: 'center' });

  // Score circle area
  const scoreX = pageWidth - margin - 25;
  const scoreY = 48;
  doc.setFillColor(30, 30, 35);
  doc.circle(scoreX, scoreY, 16, 'F');
  doc.setDrawColor(...scoreColor(healthReport.overallScore));
  doc.setLineWidth(1.5);
  doc.circle(scoreX, scoreY, 16, 'S');
  doc.setTextColor(...scoreColor(healthReport.overallScore));
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(`${healthReport.overallScore}`, scoreX, scoreY + 3, { align: 'center' });
  doc.setFontSize(7);
  doc.setTextColor(...LIGHT_GRAY);
  doc.text('/ 100', scoreX, scoreY + 9, { align: 'center' });

  y = 82;

  // ── GREETING / INTRO ──────────────────────────────────────────────────────
  addWrappedText(getGreeting(mood, vehicleName), 10, 'normal', TEXT_BODY, 1.8);
  y += 3;

  // ── OVERALL SCORE SUMMARY ─────────────────────────────────────────────────
  checkBreak(30);
  doc.setFillColor(245, 245, 248);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...scoreColor(healthReport.overallScore));
  doc.text(`Overall Health: ${healthReport.overallScore}/100  (${getScoreEmoji(healthReport.overallScore)})`, margin + 6, y + 9);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_BODY);
  doc.text(`Status: ${healthReport.overallStatus.toUpperCase()}`, margin + 6, y + 17);

  // Status bar
  const barY = y + 5;
  const barW = 50;
  const barX = pageWidth - margin - barW - 6;
  doc.setFillColor(230, 230, 230);
  doc.roundedRect(barX, barY, barW, 5, 1, 1, 'F');
  const fillW = (healthReport.overallScore / 100) * barW;
  doc.setFillColor(...scoreColor(healthReport.overallScore));
  doc.roundedRect(barX, barY, fillW, 5, 1, 1, 'F');

  y += 28;

  // ── VEHICLE INFO ──────────────────────────────────────────────────────────
  if (healthReport.vehicleInfo) {
    checkBreak(45);
    const vi = healthReport.vehicleInfo;
    addText('VEHICLE INFORMATION', 12, 'bold', BLUE);
    drawHR([200, 210, 230]);

    const infoRows = [
      ['Year / Make / Model', `${vi.year} ${vi.make} ${vi.model}`],
      ['Engine', vi.engine],
      ['Transmission', vi.transmission],
      ['VIN', vi.vin],
      ['Drive Type', vi.driveType],
      ['Factory HP / Torque', `${vi.factoryHp} HP / ${vi.factoryTorque} lb-ft`],
    ];

    infoRows.forEach(([label, val]) => {
      checkBreak(7);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXT_BODY);
      doc.text(`${label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXT_DARK);
      doc.text(val || 'N/A', margin + 55, y);
      y += 6;
    });
    y += 4;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: BASIC VEHICLE HEALTH REPORT
  // ══════════════════════════════════════════════════════════════════════════
  checkBreak(25);
  doc.setFillColor(30, 100, 200);
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SECTION 1: BASIC VEHICLE HEALTH REPORT', margin + 6, y + 8);
  y += 18;
  addWrappedText(
    'This section provides a straightforward overview of your vehicle\'s health based on the datalog. Simple graphs, plain-language summaries, and system scores give you the big picture without needing an engineering degree.',
    8.5, 'normal', [100, 100, 110], 1.3,
  );
  y += 2;

  // ── DATA GRAPHS ──────────────────────────────────────────────────────────
  checkBreak(20);
  addText('DATALOG ANALYSIS GRAPHS', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);
  addWrappedText(
    'These graphs show key parameters from your datalog over time. Each graph includes RPM (blue) and vehicle speed (gray) reference lines at the bottom axis, so you can see what the engine and truck were doing at any given point. Y-axis labels on the left show simple values. Dashed red lines mark common reference thresholds.',
    8.5, 'normal', [100, 100, 110], 1.3,
  );
  y += 2;

  const graphConfigs: MiniGraphConfig[] = [];

  // Speed + RPM data for overlay on all other graphs
  const speedRef = data.vehicleSpeed.length > 10 ? data.vehicleSpeed : undefined;
  const rpmRef = data.rpm.length > 10 ? data.rpm : undefined;

  // RPM graph (always available)
  if (data.rpm.length > 10) {
    graphConfigs.push({
      data: data.rpm,
      label: 'ENGINE RPM',
      unit: ' RPM',
      color: [60, 130, 200],
      thresholdHigh: 4000,
      speedData: speedRef,
      isRpmGraph: true,
    });
  }

  // Boost pressure
  if (data.boost.some(v => v > 0)) {
    graphConfigs.push({
      data: data.boost,
      label: 'BOOST PRESSURE',
      unit: ' PSI',
      color: [30, 160, 80],
      thresholdHigh: 40,
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // Rail pressure
  if (data.railPressureActual.some(v => v > 0)) {
    graphConfigs.push({
      data: data.railPressureActual,
      label: 'FUEL RAIL PRESSURE',
      unit: ' PSI',
      color: [200, 80, 40],
      thresholdHigh: 30000,
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // Coolant temp
  if (data.coolantTemp.some(v => v > 100)) {
    graphConfigs.push({
      data: data.coolantTemp,
      label: 'COOLANT TEMPERATURE',
      unit: '°F',
      color: [180, 60, 60],
      thresholdHigh: 230,
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // EGT
  if (data.exhaustGasTemp.some(v => v > 100)) {
    graphConfigs.push({
      data: data.exhaustGasTemp,
      label: 'EXHAUST GAS TEMPERATURE',
      unit: '°F',
      color: [220, 120, 20],
      thresholdHigh: 1300,
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // Converter slip
  if (data.converterSlip.some(v => Math.abs(v) > 5)) {
    graphConfigs.push({
      data: data.converterSlip,
      label: 'TORQUE CONVERTER SLIP',
      unit: ' RPM',
      color: [140, 60, 180],
      thresholdHigh: 100,
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // TCC Duty Cycle (if available)
  if (data.converterDutyCycle.some(v => v > 0)) {
    graphConfigs.push({
      data: data.converterDutyCycle,
      label: 'TCC DUTY CYCLE',
      unit: '%',
      color: [100, 60, 160],
      thresholdHigh: 95,
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // Converter Pressure / TCC Line Pressure (if available)
  if (data.converterPressure.some(v => v > 0)) {
    graphConfigs.push({
      data: data.converterPressure,
      label: 'TCC LINE PRESSURE',
      unit: ' PSI',
      color: [180, 100, 40],
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // Current Gear
  if (data.currentGear.some(v => v > 0)) {
    graphConfigs.push({
      data: data.currentGear,
      label: 'TRANSMISSION GEAR',
      unit: '',
      color: [60, 60, 140],
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // Transmission temp (if available)
  if (data.transFluidTemp && data.transFluidTemp.some(v => v > 100)) {
    graphConfigs.push({
      data: data.transFluidTemp,
      label: 'TRANSMISSION FLUID TEMP',
      unit: '°F',
      color: [160, 80, 120],
      thresholdHigh: 250,
      speedData: speedRef,
      rpmData: rpmRef,
    });
  }

  // Speed (no speed overlay on itself, but show RPM)
  if (data.vehicleSpeed.some(v => v > 5)) {
    graphConfigs.push({
      data: data.vehicleSpeed,
      label: 'VEHICLE SPEED',
      unit: ' MPH',
      color: [80, 80, 160],
      isSpeedGraph: true,
      rpmData: rpmRef,
    });
  }

  // Draw all graphs (height 50 + 22 for bottom axis = 72 total, checkBreak for 80)
  for (const config of graphConfigs) {
    checkBreak(80);
    y = drawMiniGraph(doc, margin, y, contentWidth, 50, config, margin, contentWidth);
  }

  // ── SYSTEM-BY-SYSTEM BREAKDOWN ────────────────────────────────────────────
  const sections = [
    { name: 'Engine Health', score: healthReport.engineHealth.score, status: healthReport.engineHealth.status, findings: healthReport.engineHealth.findings },
    { name: 'Fuel System', score: healthReport.fuelSystem.score, status: healthReport.fuelSystem.status, findings: healthReport.fuelSystem.findings },
    { name: 'Transmission', score: healthReport.transmission.score, status: healthReport.transmission.status, findings: healthReport.transmission.findings },
    { name: 'Thermal Management', score: healthReport.thermalManagement.score, status: healthReport.thermalManagement.status, findings: healthReport.thermalManagement.findings },
  ];

  checkBreak(20);
  addText('SYSTEM-BY-SYSTEM BREAKDOWN', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);

  sections.forEach((sec) => {
    checkBreak(35);

    // Section header with score
    doc.setFillColor(248, 248, 250);
    doc.roundedRect(margin, y - 1, contentWidth, 10, 1, 1, 'F');

    // Score indicator dot
    doc.setFillColor(...scoreColor(sec.score));
    doc.circle(margin + 4, y + 3.5, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_DARK);
    doc.text(sec.name.toUpperCase(), margin + 10, y + 5.5);

    doc.setTextColor(...scoreColor(sec.score));
    doc.text(`${sec.score}/100`, pageWidth - margin - 20, y + 5.5);

    y += 13;

    // Section comment (dry humor)
    addWrappedText(getSectionComment(sec.name, sec.score), 9, 'italic', [100, 100, 110], 1.3);

    // Findings
    if (sec.findings.length > 0) {
      sec.findings.forEach((finding) => {
        checkBreak(10);
        const isGood = finding.includes('healthy') || finding.includes('normal') || finding.includes('excellent') || finding.includes('Normal');
        const isWarn = finding.includes('WARNING') || finding.includes('elevated') || finding.includes('CAUTION');
        const isBad = finding.includes('CRITICAL') || finding.includes('FAULT') || finding.includes('FAIL') || finding.includes('dangerously');

        const bulletColor: [number, number, number] = isBad ? PPEI_RED : isWarn ? AMBER : isGood ? GREEN : TEXT_BODY;
        const bullet = isBad ? '!' : isWarn ? '~' : '+';

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...bulletColor);
        doc.text(bullet, margin + 2, y);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_BODY);
        const lines = doc.splitTextToSize(finding, contentWidth - 10);
        doc.text(lines, margin + 8, y);
        y += lines.length * 3.8 + 1.5;
      });
    }

    y += 4;
  });

  // ── POTENTIAL FAULT AREA SUMMARY ──────────────────────────────────────────
  if (healthReport.diagnosticSummary.anyFaultDetected) {
    checkBreak(30);
    addText('POTENTIAL FAULT AREAS DETECTED', 12, 'bold', PPEI_RED);
    drawHR(PPEI_RED);

    addWrappedText(
      'The following conditions were flagged during analysis. These are data-driven indicators, not confirmed DTCs. A Check Engine Light may or may not be present. Think of these as the truck raising its hand and saying "hey, look at this."',
      9, 'normal', TEXT_BODY, 1.5,
    );

    const faultStatuses = [
      { label: 'Rail Pressure (Low)', status: healthReport.diagnosticSummary.p0087Status },
      { label: 'Rail Pressure (High)', status: healthReport.diagnosticSummary.highRailStatus },
      { label: 'Boost Pressure', status: healthReport.diagnosticSummary.p0299Status },
      { label: 'Exhaust Gas Temp', status: healthReport.diagnosticSummary.egtStatus },
      { label: 'Mass Airflow (Idle)', status: healthReport.diagnosticSummary.p0101Status },
      { label: 'Converter Slip', status: healthReport.diagnosticSummary.converterSlipStatus },
    ];

    faultStatuses.forEach((f) => {
      if (f.status.includes('DETECTED') || f.status.includes('WARNING')) {
        checkBreak(8);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(f.status.includes('DETECTED') ? PPEI_RED : AMBER));
        doc.text(`  ${f.label}`, margin, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_BODY);
        const statusText = f.status.replace(/^[^—]*— /, '');
        doc.text(statusText, margin + 50, y);
        y += 6;
      }
    });
    y += 4;
  } else {
    checkBreak(20);
    addText('POTENTIAL FAULT AREAS', 12, 'bold', GREEN);
    drawHR([180, 220, 180]);
    addWrappedText(
      'No potential fault areas were detected in this datalog. Everything checked out within normal operating parameters. Your truck is either well-maintained or very good at hiding its problems.',
      9, 'normal', TEXT_BODY, 1.5,
    );
    y += 2;
  }

  // ── DATALOG QUICK STATS ───────────────────────────────────────────────────
  checkBreak(40);
  addText('DATALOG QUICK STATS', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);

  const stats = data.stats;
  const maxSpeed = data.vehicleSpeed.length > 0 ? Math.max(...data.vehicleSpeed.filter((v: number) => !isNaN(v))) : 0;
  const maxEct = data.coolantTemp.length > 0 ? Math.max(...data.coolantTemp.filter(v => !isNaN(v) && v > 0)) : 0;
  const maxRail = data.railPressureActual.length > 0 ? Math.max(...data.railPressureActual.filter(v => !isNaN(v) && v > 0)) : 0;

  const statRows: [string, string, string][] = [
    ['Peak RPM', `${stats.rpmMax.toFixed(0)} RPM`, 'Highest engine speed recorded in this log.'],
    ['Max Vehicle Speed', `${maxSpeed.toFixed(0)} MPH`, 'Top speed reached during the recording.'],
  ];

  if (maxEct > 0) {
    statRows.push(['Max Coolant Temp', `${maxEct.toFixed(0)}°F`, maxEct > 220 ? 'Running warm. Keep an eye on this.' : 'Within normal range.']);
  }
  if (stats.boostMax > 0) {
    statRows.push(['Peak Boost', `${stats.boostMax.toFixed(1)} PSI`, 'Maximum turbo boost pressure recorded.']);
  }
  if (maxRail > 0) {
    statRows.push(['Peak Rail Pressure', `${maxRail.toFixed(0)} PSI`, 'Maximum fuel rail pressure under load.']);
  }
  if (stats.hpTorqueMax > 0) {
    statRows.push(['Est. Peak HP', `${stats.hpTorqueMax.toFixed(0)} HP`, 'Estimated from datalog. Take with a grain of salt (see dyno disclaimer).']);
  }

  statRows.forEach(([label, value, note]) => {
    checkBreak(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TEXT_DARK);
    doc.text(label, margin, y);
    doc.setTextColor(...BLUE);
    doc.text(value, margin + 55, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MED_GRAY);
    doc.setFontSize(7.5);
    doc.text(note, margin + 90, y);
    y += 6.5;
  });
  y += 4;

  // ── PEAK POWER vs PEAK TORQUE SNAPSHOT ──────────────────────────────────
  // Find the sample indices where peak HP (torque-based) and peak torque occur
  if (data.hpTorque.length > 10 && data.stats.hpTorqueMax > 0) {
    checkBreak(55);
    addText('PEAK POWER vs PEAK TORQUE SNAPSHOT', 12, 'bold', BLUE);
    drawHR([200, 210, 230]);

    // Find peak HP index
    let peakHpIdx = 0;
    let peakHpVal = 0;
    for (let i = 0; i < data.hpTorque.length; i++) {
      if (data.hpTorque[i] > peakHpVal) {
        peakHpVal = data.hpTorque[i];
        peakHpIdx = i;
      }
    }

    // Find peak torque index (torque = torquePercent/100 * maxTorque if available)
    // torque lb-ft = (torquePercent / 100) * maxTorque
    let peakTqIdx = 0;
    let peakTqVal = 0;
    const torquePercent = data.rpm.map((_, i) => {
      // hpTorque = (torquePercent/100 * maxTorque * rpm) / 5252
      // torque lb-ft = hpTorque * 5252 / rpm
      const rpm = data.rpm[i];
      if (rpm < 500) return 0;
      return (data.hpTorque[i] * 5252) / rpm;
    });
    for (let i = 0; i < torquePercent.length; i++) {
      if (torquePercent[i] > peakTqVal) {
        peakTqVal = torquePercent[i];
        peakTqIdx = i;
      }
    }

    // Helper to get value at index safely
    const valAt = (arr: number[], idx: number) => {
      if (!arr || idx >= arr.length) return 0;
      const v = arr[idx];
      return isNaN(v) ? 0 : v;
    };

    // Check if fuel quantity data is available
    const hasFuelQty = data.fuelQuantity && data.fuelQuantity.some(v => v > 0);

    // Build side-by-side table
    const colW = (contentWidth - 45) / 2; // two data columns
    const labelW = 45;
    const tableX = margin;
    const col1X = tableX + labelW;
    const col2X = col1X + colW;

    // Table header
    doc.setFillColor(30, 30, 40);
    doc.rect(tableX, y, contentWidth, 7, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Parameter', tableX + 2, y + 5);
    doc.text(`@ Peak HP (${Math.round(peakHpVal)} HP)`, col1X + 2, y + 5);
    doc.text(`@ Peak Torque (${Math.round(peakTqVal)} lb-ft)`, col2X + 2, y + 5);
    y += 7;

    // Table rows
    const snapshotRows: [string, string, string][] = [
      ['RPM', `${Math.round(valAt(data.rpm, peakHpIdx))}`, `${Math.round(valAt(data.rpm, peakTqIdx))}`],
      ['MAF (g/s)', `${valAt(data.maf, peakHpIdx).toFixed(1)}`, `${valAt(data.maf, peakTqIdx).toFixed(1)}`],
      ['Boost (PSI)', `${valAt(data.boost, peakHpIdx).toFixed(1)}`, `${valAt(data.boost, peakTqIdx).toFixed(1)}`],
      ['Rail Pressure (PSI)', `${Math.round(valAt(data.railPressureActual, peakHpIdx))}`, `${Math.round(valAt(data.railPressureActual, peakTqIdx))}`],
      ['Vane Position (%)', `${valAt(data.turboVanePosition, peakHpIdx).toFixed(1)}`, `${valAt(data.turboVanePosition, peakTqIdx).toFixed(1)}`],
    ];

    if (hasFuelQty) {
      snapshotRows.push([
        'Fuel Qty (mm\u00B3)', 
        `${valAt(data.fuelQuantity, peakHpIdx).toFixed(1)}`,
        `${valAt(data.fuelQuantity, peakTqIdx).toFixed(1)}`
      ]);
    }

    // Add vehicle speed and EGT if available
    if (data.vehicleSpeed.some(v => v > 0)) {
      snapshotRows.push([
        'Speed (MPH)',
        `${Math.round(valAt(data.vehicleSpeed, peakHpIdx))}`,
        `${Math.round(valAt(data.vehicleSpeed, peakTqIdx))}`
      ]);
    }
    if (data.exhaustGasTemp.some(v => v > 0)) {
      snapshotRows.push([
        'EGT (\u00B0F)',
        `${Math.round(valAt(data.exhaustGasTemp, peakHpIdx))}`,
        `${Math.round(valAt(data.exhaustGasTemp, peakTqIdx))}`
      ]);
    }

    snapshotRows.forEach(([label, val1, val2], rowIdx) => {
      checkBreak(7);
      const rowY = y;
      // Alternating row background
      if (rowIdx % 2 === 0) {
        doc.setFillColor(245, 245, 250);
        doc.rect(tableX, rowY, contentWidth, 6, 'F');
      }
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXT_DARK);
      doc.text(label, tableX + 2, rowY + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BLUE);
      doc.text(val1, col1X + 2, rowY + 4.2);
      doc.text(val2, col2X + 2, rowY + 4.2);
      y += 6;
    });
    y += 4;
  }

  // ── ESTIMATED DYNO GRAPH ──────────────────────────────────────────────────
  if (data.stats.hpTorqueMax > 0 && data.hpTorque.length > 10) {
    checkBreak(75);
    addText('ESTIMATED DYNO CHART (HP vs RPM)', 12, 'bold', BLUE);
    drawHR([200, 210, 230]);

    // Build RPM-binned HP curve for a cleaner dyno-style look
    const dynoH = 50;
    const dynoX = margin;
    const dynoY = y;
    const dynoW = contentWidth;

    // Collect peak HP at each RPM bin (100 RPM bins)
    const rpmBins = new Map<number, number>();
    for (let i = 0; i < data.rpm.length; i++) {
      const rpm = Math.round(data.rpm[i] / 100) * 100;
      const hp = data.hpTorque[i];
      if (hp > 0 && rpm > 500) {
        rpmBins.set(rpm, Math.max(rpmBins.get(rpm) || 0, hp));
      }
    }
    const sortedBins = Array.from(rpmBins.entries()).sort((a, b) => a[0] - b[0]);

    if (sortedBins.length > 3) {
      const rpmMin = sortedBins[0][0];
      const rpmMax = sortedBins[sortedBins.length - 1][0];
      const hpMax = Math.max(...sortedBins.map(b => b[1]));
      const hpCeil = Math.ceil(hpMax / 50) * 50;

      // Background
      doc.setFillColor(20, 20, 25);
      doc.roundedRect(dynoX, dynoY, dynoW, dynoH, 1, 1, 'F');

      // Grid lines (4 horizontal)
      doc.setDrawColor(50, 50, 60);
      doc.setLineWidth(0.15);
      for (let g = 1; g <= 4; g++) {
        const gy = dynoY + dynoH - (g / 4) * dynoH;
        doc.line(dynoX + 12, gy, dynoX + dynoW - 2, gy);
        // Y-axis label
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 130);
        doc.text(`${Math.round((g / 4) * hpCeil)}`, dynoX + 1, gy + 1.5);
      }

      // X-axis RPM labels
      const rpmRange = rpmMax - rpmMin;
      const rpmStep = rpmRange > 3000 ? 500 : 250;
      for (let r = Math.ceil(rpmMin / rpmStep) * rpmStep; r <= rpmMax; r += rpmStep) {
        const xPos = dynoX + 12 + ((r - rpmMin) / rpmRange) * (dynoW - 14);
        doc.setFontSize(5.5);
        doc.setTextColor(120, 120, 130);
        doc.text(`${r}`, xPos, dynoY + dynoH - 1, { align: 'center' });
      }
      // RPM label
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 110);
      doc.text('RPM', dynoX + dynoW / 2, dynoY + dynoH + 3, { align: 'center' });

      // HP label
      doc.text('EST. HP', dynoX + 1, dynoY + 3);

      // Draw HP curve
      doc.setDrawColor(200, 40, 40);
      doc.setLineWidth(0.6);
      let prevPx = -1, prevPy = -1;
      for (const [rpm, hp] of sortedBins) {
        const px = dynoX + 12 + ((rpm - rpmMin) / rpmRange) * (dynoW - 14);
        const py = dynoY + dynoH - 5 - (hp / hpCeil) * (dynoH - 10);
        if (prevPx >= 0) {
          doc.line(prevPx, prevPy, px, py);
        }
        prevPx = px;
        prevPy = py;
      }

      // Peak HP annotation
      const peakEntry = sortedBins.reduce((best, e) => e[1] > best[1] ? e : best, sortedBins[0]);
      const peakPx = dynoX + 12 + ((peakEntry[0] - rpmMin) / rpmRange) * (dynoW - 14);
      const peakPy = dynoY + dynoH - 5 - (peakEntry[1] / hpCeil) * (dynoH - 10);
      doc.setFillColor(200, 40, 40);
      doc.circle(peakPx, peakPy, 1.2, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(200, 40, 40);
      doc.text(`${Math.round(peakEntry[1])} HP @ ${peakEntry[0]} RPM`, peakPx + 3, peakPy - 2);

      // Also draw MAF-based HP if available
      if (data.hpMaf.length > 10 && data.stats.hpMafMax > 50) {
        const mafBins = new Map<number, number>();
        for (let i = 0; i < data.rpm.length; i++) {
          const rpm = Math.round(data.rpm[i] / 100) * 100;
          const hp = data.hpMaf[i];
          if (hp > 0 && rpm > 500) {
            mafBins.set(rpm, Math.max(mafBins.get(rpm) || 0, hp));
          }
        }
        const mafSorted = Array.from(mafBins.entries()).sort((a, b) => a[0] - b[0]);
        if (mafSorted.length > 3) {
          doc.setDrawColor(60, 130, 200);
          doc.setLineWidth(0.4);
          let mpx = -1, mpy = -1;
          for (const [rpm, hp] of mafSorted) {
            const px = dynoX + 12 + ((rpm - rpmMin) / rpmRange) * (dynoW - 14);
            const py = dynoY + dynoH - 5 - (hp / hpCeil) * (dynoH - 10);
            if (mpx >= 0) {
              doc.line(mpx, mpy, px, py);
            }
            mpx = px;
            mpy = py;
          }
          // Legend
          doc.setFontSize(5.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 130, 200);
          doc.text('— MAF-based HP', dynoX + dynoW - 30, dynoY + 5);
          doc.setTextColor(200, 40, 40);
          doc.text('— Torque-based HP', dynoX + dynoW - 30, dynoY + 9);
        }
      }

      y = dynoY + dynoH + 6;
    } else {
      y += 2;
    }

    // Synopsis
    const peakHp = Math.round(data.stats.hpTorqueMax);
    const peakMaf = data.stats.hpMafMax > 50 ? Math.round(data.stats.hpMafMax) : 0;
    let dynoSynopsis = `Estimated peak: ${peakHp} HP (torque-based).`;
    if (peakMaf > 0) {
      const diff = Math.abs(peakHp - peakMaf);
      dynoSynopsis += ` MAF-based estimate: ${peakMaf} HP.`;
      if (diff > 50) {
        dynoSynopsis += ` The ${diff} HP gap between methods suggests the tune may be reporting torque differently than airflow indicates.`;
      }
    }
    addWrappedText(dynoSynopsis, 8, 'normal', TEXT_DARK, 1.3);
    y += 2;

    // Disclaimer
    checkBreak(25);
    addText('A NOTE ABOUT THE DYNO GRAPH', 11, 'bold', BLUE);
    drawHR([200, 210, 230]);
    addWrappedText(
      'If you see HP and torque estimates in this report, keep in mind that those numbers are calculated from the datalog and are heavily dependent on how the tuning is configured. They can often be inaccurate compared to an actual chassis dyno pull. That said, they\'re still useful as a reference for understanding what\'s happening under load. Use them as a trend indicator, not as bragging rights at the truck meet. If you want real numbers, strap it to a dyno.',
      9, 'normal', TEXT_BODY, 1.5,
    );
    y += 2;
  }

  // ── RECOMMENDATIONS ───────────────────────────────────────────────────────
  checkBreak(30);
  addText('RECOMMENDATIONS', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);

  healthReport.recommendations.forEach((rec) => {
    checkBreak(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_BODY);
    const lines = doc.splitTextToSize(`>  ${rec}`, contentWidth - 6);
    doc.text(lines, margin + 2, y);
    y += lines.length * 3.8 + 2;
  });
  y += 4;

  // ── DRAG RACING TIMESLIP ──────────────────────────────────────────────────
  if (dragAnalysis && dragAnalysis.runsDetected > 0 && dragAnalysis.bestRun) {
    checkBreak(25);
    addText('DRAG RACING ANALYSIS', 12, 'bold', PPEI_RED);
    drawHR(PPEI_RED);
    addWrappedText(
      `${dragAnalysis.runsDetected} drag run${dragAnalysis.runsDetected !== 1 ? 's' : ''} detected in this datalog. ` +
      `Data quality: ${dragAnalysis.dataQuality.toUpperCase()}. ` +
      (dragAnalysis.missingChannels.length > 0
        ? `Missing channels for full analysis: ${dragAnalysis.missingChannels.join(', ')}.`
        : 'All required channels present for full analysis.'),
      8.5, 'normal', TEXT_BODY, 1.3,
    );
    y += 2;

    // Draw timeslip for best run (and up to 2 more)
    const runsToShow = dragAnalysis.runs.slice(0, 3);
    runsToShow.forEach((run, runIdx) => {
      const isBest = run === dragAnalysis!.bestRun;
      y = drawTimeslip(doc, margin, y, contentWidth, run, runIdx, isBest, checkBreak, pageHeight);
    });

    // Performance tips
    if (dragAnalysis.tips.length > 0) {
      checkBreak(25);
      addText('DRAG PERFORMANCE TIPS', 10, 'bold', BLUE);
      drawHR([200, 210, 230]);

      dragAnalysis.tips.forEach((tip) => {
        checkBreak(12);
        const sevColor: [number, number, number] = tip.severity === 'critical' ? PPEI_RED : tip.severity === 'warning' ? AMBER : BLUE;
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...sevColor);
        doc.text(`[${tip.category.toUpperCase()}]`, margin, y);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TEXT_DARK);
        doc.text(tip.title, margin + 22, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_BODY);
        doc.setFontSize(8);
        const tipLines = doc.splitTextToSize(tip.detail, contentWidth - 6);
        tipLines.forEach((line: string) => {
          checkBreak(4);
          doc.text(line, margin + 4, y);
          y += 3.5;
        });
        if (tip.estimatedGain !== 'N/A' && tip.estimatedGain !== 'Already optimized') {
          doc.setFontSize(7);
          doc.setTextColor(...GREEN);
          doc.text(`Estimated gain: ${tip.estimatedGain}`, margin + 4, y);
          y += 3.5;
        }
        y += 2;
      });
    }
    y += 4;
  } else if (dragAnalysis && dragAnalysis.runsDetected === 0) {
    // No runs detected — mention what's needed
    checkBreak(25);
    addText('DRAG RACING ANALYSIS', 12, 'bold', BLUE);
    drawHR([200, 210, 230]);
    addWrappedText(
      'No drag runs were detected in this datalog. For drag analysis, the log needs to capture a launch from near-zero speed with wide-open throttle (80%+ accelerator). ' +
      'Required channels: Vehicle Speed, Throttle Position, RPM. Recommended additional channels: Boost Pressure, Rail Pressure, TCC Slip/Converter Pressure for full fault analysis.',
      8.5, 'normal', TEXT_BODY, 1.3,
    );
    y += 4;
  }

  // ── CLOSING MESSAGE (Basic Section) ────────────────────────────────────────
  checkBreak(30);
  drawHR([200, 210, 230]);
  addWrappedText(getClosing(mood), 9.5, 'normal', TEXT_DARK, 1.6);
  y += 4;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 2: ADVANCED TUNING ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = margin + 5;

  // Section 2 header banner
  doc.setFillColor(220, 38, 38);
  doc.roundedRect(margin, y, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SECTION 2: ADVANCED TUNING ANALYSIS', margin + 6, y + 8);
  y += 18;
  addWrappedText(
    'This section digs deeper into the relationship between key engine parameters. Correlated multi-parameter graphs, injection timing math, boost leak detection, and derived analytics like Manifold Air Density. If you\'re not into the technical details, the Basic section above has you covered. If you are, welcome to the fun part.',
    8.5, 'normal', [100, 100, 110], 1.3,
  );
  y += 4;

  renderAdvancedAnalytics(
    doc,
    y,
    data,
    healthReport.vehicleInfo,
    margin,
    contentWidth,
    pageHeight,
    speedRef,
    addText,
    addWrappedText,
    checkBreak,
    drawHR,
    () => y,
    (newY: number) => { y = newY; },
    data.rpm,
  );

  // ── BETA DISCLAIMER (with joke) ───────────────────────────────────────────
  checkBreak(55);
  doc.setFillColor(255, 248, 240);
  doc.setDrawColor(...PPEI_RED);
  doc.setLineWidth(0.5);
  const disclaimerH = 48;
  doc.roundedRect(margin, y, contentWidth, disclaimerH, 2, 2, 'FD');

  y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PPEI_RED);
  doc.text(`IMPORTANT: V-OP BETA ${APP_VERSION} — AI MODEL DISCLAIMER`, margin + 6, y);
  y += 6;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_BODY);
  const disclaimerLines = doc.splitTextToSize(
    `This report was generated by V-OP BETA ${APP_VERSION}, an AI-powered vehicle analysis tool by PPEI Custom Tuning. It's getting smarter every day, but it's not a certified technician and it doesn't have feelings (yet). Do not make major repair decisions based solely on this report without consulting PPEI directly or a qualified technician. V-OP is in active beta development — results may contain inaccuracies. Every datalog you run helps make it better. Use at your own discretion.`,

    contentWidth - 12,
  );
  doc.text(disclaimerLines, margin + 6, y);
  y += disclaimerLines.length * 3.5 + 4;

  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140, 100, 60);
  const jokeLines = doc.splitTextToSize(
    '"We asked the AI to rate its own confidence level. It said \'somewhere between a Magic 8-Ball and a seasoned diesel tech who hasn\'t had coffee yet.\' So yeah... maybe verify with PPEI before you start ordering parts."  — Kory (Maybe?)',
    contentWidth - 12,
  );
  doc.text(jokeLines, margin + 6, y);
  y += jokeLines.length * 3.5 + 4;

  // ── CONTACT INFO ──────────────────────────────────────────────────────────
  checkBreak(20);
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(margin, y, contentWidth, 14, 1, 1, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_DARK);
  doc.text('Questions? Contact PPEI directly:', margin + 4, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLUE);
  doc.text('ppei.com  |  support@ppei.com  |  (936) 271-4234', margin + 4, y + 10.5);
  y += 18;

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE NUMBERS + FOOTER
  // ══════════════════════════════════════════════════════════════════════════
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer bar
    doc.setFillColor(...DARK_BG);
    doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');

    // Author credit
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PPEI_RED);
    doc.text(`V-OP BETA ${APP_VERSION}`, margin, pageHeight - 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MED_GRAY);
    doc.text('Author: Kory (Maybe?)', margin, pageHeight - 4);

    // Page number
    doc.setTextColor(...LIGHT_GRAY);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

    // Date
    doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 6, { align: 'right' });

    // Subtle watermark on non-cover pages
    if (i > 1) {
      doc.saveGraphicsState();
      doc.setTextColor(230, 230, 230);
      doc.setFontSize(38);
      doc.setFont('helvetica', 'bold');
      // @ts-ignore
      doc.setGState(new (doc as any).GState({ opacity: 0.035 }));
      doc.text(`V-OP BETA ${APP_VERSION}`, pageWidth / 2, pageHeight / 2, {
        align: 'center',
        angle: 45,
      });
      doc.restoreGraphicsState();
    }
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const cleanName = vehicleName.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`PPEI_Health_Report_${APP_VERSION}_${cleanName}_${timestamp}.pdf`);
}
