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
  isSpeedGraph?: boolean; // skip speed overlay on the speed graph itself
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
  const { data, label, unit, color, thresholdHigh, thresholdLow, speedData, isSpeedGraph } = config;

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

  // Graph background
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, height, 1, 1, 'FD');

  // Label
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...color);
  doc.text(label, x + 3, y + 5);

  // Stats
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MED_GRAY);
  doc.text(`Min: ${min.toFixed(1)}${unit}  Avg: ${avg.toFixed(1)}${unit}  Max: ${max.toFixed(1)}${unit}`, x + 3, y + 9.5);

  // Draw the line graph
  const graphX = x + 3;
  const graphY = y + 12;
  const graphW = width - 6;
  const graphH = height - 16;

  // Grid lines (3 horizontal)
  doc.setDrawColor(235, 235, 240);
  doc.setLineWidth(0.1);
  for (let g = 0; g <= 2; g++) {
    const gy = graphY + (graphH * g) / 2;
    doc.line(graphX, gy, graphX + graphW, gy);
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
    doc.text(`${thresholdHigh}${unit}`, graphX + graphW - 12, thY - 1);
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
    doc.text(`${thresholdLow}${unit}`, graphX + graphW - 12, thY - 1);
  }

  // ── MPH speed reference overlay (light gray, at bottom of graph) ──────────
  if (speedData && !isSpeedGraph && speedData.length > 10) {
    const spdValid = speedData.filter(v => !isNaN(v));
    const spdStep = Math.max(1, Math.floor(spdValid.length / 200));
    const spdSampled = spdValid.filter((_, i) => i % spdStep === 0);
    const spdMax = Math.max(...spdSampled, 1);

    // Draw speed as a filled area at the bottom (max 30% of graph height)
    const spdGraphH = graphH * 0.3;
    const spdBaseY = graphY + graphH;

    doc.setDrawColor(180, 180, 200);
    doc.setLineWidth(0.2);
    for (let i = 1; i < spdSampled.length; i++) {
      const x1 = graphX + ((i - 1) / (spdSampled.length - 1)) * graphW;
      const x2 = graphX + (i / (spdSampled.length - 1)) * graphW;
      const y1 = spdBaseY - (spdSampled[i - 1] / spdMax) * spdGraphH;
      const y2 = spdBaseY - (spdSampled[i] / spdMax) * spdGraphH;
      doc.line(x1, y1, x2, y2);
    }

    // MPH label at bottom-right
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 180);
    doc.text(`MPH (0-${spdMax.toFixed(0)})`, graphX + graphW - 18, spdBaseY - 1);
  }

  // Data line (draw AFTER speed overlay so it's on top)
  doc.setDrawColor(...color);
  doc.setLineWidth(0.4);
  const points: [number, number][] = sampled.map((v, i) => [
    graphX + (i / (sampled.length - 1)) * graphW,
    graphY + graphH - ((v - min) / range) * graphH,
  ]);

  for (let i = 1; i < points.length; i++) {
    doc.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }

  let newY = y + height + 2;

  // Data-driven synopsis of what happened in this graph
  const synopsis = generateSynopsis(label, min, max, avg, unit, sampled);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 110);
  const synLines = doc.splitTextToSize(synopsis, contentWidth - 4);
  doc.text(synLines, margin + 2, newY);
  newY += synLines.length * 3.2 + 4;

  return newY;
}

export function generateHealthReportPdf(
  healthReport: HealthReportData,
  data: ProcessedMetrics,
  fileName: string,
  hasDynoChart: boolean = false,
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

  // BETA badge
  doc.setFillColor(...PPEI_RED);
  doc.roundedRect(pageWidth - margin - 36, 10, 36, 12, 1.5, 1.5, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('PPEI AI BETA', pageWidth - margin - 18, 17.5, { align: 'center' });

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
  // DATA GRAPHS — "Customers love graphs"
  // ══════════════════════════════════════════════════════════════════════════
  checkBreak(20);
  addText('DATALOG ANALYSIS GRAPHS', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);
  addWrappedText(
    'These graphs show key parameters from your datalog over time. The light gray line at the bottom of each graph shows vehicle speed (MPH) for reference, so you can see what the truck was doing at any given point. Dashed red lines mark common reference thresholds.',
    8.5, 'normal', [100, 100, 110], 1.3,
  );
  y += 2;

  const graphConfigs: MiniGraphConfig[] = [];

  // Speed data for overlay on all other graphs
  const speedRef = data.vehicleSpeed.length > 10 ? data.vehicleSpeed : undefined;

  // RPM graph (always available)
  if (data.rpm.length > 10) {
    graphConfigs.push({
      data: data.rpm,
      label: 'ENGINE RPM',
      unit: ' RPM',
      color: [60, 130, 200],
      thresholdHigh: 4000,
      speedData: speedRef,
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
    });
  }

  // Speed (no speed overlay on itself)
  if (data.vehicleSpeed.some(v => v > 5)) {
    graphConfigs.push({
      data: data.vehicleSpeed,
      label: 'VEHICLE SPEED',
      unit: ' MPH',
      color: [80, 80, 160],
      isSpeedGraph: true,
    });
  }

  // Draw all graphs
  for (const config of graphConfigs) {
    checkBreak(48);
    y = drawMiniGraph(doc, margin, y, contentWidth, 38, config, margin, contentWidth);
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

  // ── DYNO GRAPH DISCLAIMER ─────────────────────────────────────────────────
  if (hasDynoChart && data.stats.hpTorqueMax > 0) {
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

  // ── CLOSING MESSAGE ───────────────────────────────────────────────────────
  checkBreak(30);
  drawHR([200, 210, 230]);
  addWrappedText(getClosing(mood), 9.5, 'normal', TEXT_DARK, 1.6);
  y += 4;

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
  doc.text('IMPORTANT: BETA AI MODEL DISCLAIMER', margin + 6, y);
  y += 6;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TEXT_BODY);
  const disclaimerLines = doc.splitTextToSize(
    'This report was generated by the PPEI AI Beta engine. It\'s getting smarter every day, but it\'s not a certified technician and it doesn\'t have feelings (yet). Do not make major repair decisions based solely on this report without consulting PPEI directly or a qualified technician. We\'re training and improving this system rapidly — every datalog you run helps make it better. If the AI ever becomes self-aware, we\'ll let you know. Probably.',
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
    doc.text('PPEI AI BETA', margin, pageHeight - 8);
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
      doc.text('PPEI AI BETA', pageWidth / 2, pageHeight / 2, {
        align: 'center',
        angle: 45,
      });
      doc.restoreGraphicsState();
    }
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const cleanName = vehicleName.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`PPEI_Health_Report_${cleanName}_${timestamp}.pdf`);
}
