/**
 * Advanced Health Report PDF — Correlated Multi-Parameter Analysis
 * Injector pulse width/timing, desired vs actual boost/vane, rail pressure/PCV,
 * boost/MAF/vane correlation with leak detection, derived analytics (MAD, boost air density).
 * Includes tuning wisdom thresholds and intelligent commentary.
 */

import jsPDF from 'jspdf';
import { ProcessedMetrics } from './dataProcessor';
import { VehicleInfo } from './vinLookup';
import { getCalibrationContext, type AnalysisInsight } from './l5pEcuReference';

// ── Colors ────────────────────────────────────────────────────────────────────
const TEXT_DARK: [number, number, number] = [40, 40, 40];
const TEXT_BODY: [number, number, number] = [60, 60, 60];
const MED_GRAY: [number, number, number] = [120, 120, 120];
const BLUE: [number, number, number] = [30, 100, 200];
const PPEI_RED: [number, number, number] = [220, 38, 38];
const GREEN: [number, number, number] = [22, 163, 74];
const AMBER: [number, number, number] = [202, 138, 4];
const TEAL: [number, number, number] = [0, 150, 136];
const PURPLE: [number, number, number] = [120, 60, 200];
const ORANGE: [number, number, number] = [230, 120, 20];

// ── Types ─────────────────────────────────────────────────────────────────────
interface CorrelatedSeries {
  data: number[];
  label: string;
  unit: string;
  color: [number, number, number];
  dashed?: boolean;
}

interface CorrelatedGraphConfig {
  title: string;
  series: CorrelatedSeries[];
  speedData?: number[];
  rpmData?: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasRealData(arr: number[], minCount: number = 10): boolean {
  return arr.filter(v => !isNaN(v) && v !== 0).length >= minCount;
}

/** Downsample multiple arrays to ~targetLen points, keeping them time-aligned */
function downsampleAligned(arrays: number[][], targetLen: number): number[][] {
  const maxLen = Math.max(...arrays.map(a => a.length));
  const step = Math.max(1, Math.floor(maxLen / targetLen));
  return arrays.map(arr => {
    const result: number[] = [];
    for (let i = 0; i < arr.length; i += step) result.push(arr[i]);
    return result;
  });
}

/** Draw a correlated multi-series graph with legend and speed overlay */
function drawCorrelatedGraph(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  config: CorrelatedGraphConfig,
  margin: number,
  contentWidth: number,
): number {
  const { title, series, speedData } = config;

  // Filter series with actual data
  const validSeries = series.filter(s => s.data.filter(v => !isNaN(v) && v !== 0).length > 10);
  if (validSeries.length < 1) return y;

  // Downsample all series to ~200 points aligned
  const allData = validSeries.map(s => s.data.filter(v => !isNaN(v)));
  const sampled = downsampleAligned(allData, 200);

  // Graph background
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, width, height, 1, 1, 'FD');

  // Title
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEXT_DARK);
  doc.text(title, x + 3, y + 5.5);

  // Legend
  let legendX = x + 3;
  const legendY = y + 10.5;
  doc.setFontSize(6);
  validSeries.forEach((s, idx) => {
    if (s.dashed) {
      doc.setDrawColor(...s.color);
      doc.setLineWidth(0.4);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(legendX, legendY - 1, legendX + 7, legendY - 1);
      doc.setLineDashPattern([], 0);
    } else {
      doc.setFillColor(...s.color);
      doc.rect(legendX, legendY - 2.5, 7, 2.2, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...s.color);
    const lbl = `${s.label} (${s.unit})`;
    doc.text(lbl, legendX + 8.5, legendY);
    legendX += doc.getTextWidth(lbl) + 13;
  });

  // Graph area (with left margin for Y-axis labels)
  const yAxisW = 14;
  const graphX = x + yAxisW;
  const graphY = y + 14;
  const graphW = width - yAxisW - 3;
  const graphH = height - 18;

  // Grid lines (5 horizontal) with Y-axis tick labels
  doc.setDrawColor(235, 235, 240);
  doc.setLineWidth(0.1);
  const gridSteps = 4; // 5 lines = 4 intervals
  for (let g = 0; g <= gridSteps; g++) {
    const gy = graphY + (graphH * g) / gridSteps;
    doc.line(graphX, gy, graphX + graphW, gy);
  }

  // RPM + Speed bottom overlay (separated into distinct bands with separator)
  const { rpmData } = config;
  const overlayH = graphH * 0.40; // slightly larger for better separation
  const overlayBaseY = graphY + graphH;
  const halfH = overlayH / 2;
  const rpmBandTop = overlayBaseY - overlayH;
  const rpmBandBot = rpmBandTop + halfH;
  const spdBandTop = rpmBandBot + 0.5;
  const spdBandBot = overlayBaseY;

  // Light background bands for visual separation
  doc.setFillColor(240, 245, 255); // very light blue for RPM band
  doc.rect(graphX, rpmBandTop, graphW, halfH, 'F');
  doc.setFillColor(245, 245, 250); // very light gray for Speed band
  doc.rect(graphX, spdBandTop, graphW, halfH - 0.5, 'F');

  // Separator line between RPM and Speed bands
  doc.setDrawColor(200, 200, 215);
  doc.setLineWidth(0.2);
  doc.line(graphX, rpmBandBot, graphX + graphW, rpmBandBot);

  // RPM overlay (top band, light blue) with tick marks
  if (rpmData && rpmData.length > 10) {
    const rpmValid = rpmData.filter(v => !isNaN(v) && v > 0);
    const rpmStep = Math.max(1, Math.floor(rpmValid.length / 200));
    const rpmSampled = rpmValid.filter((_, i) => i % rpmStep === 0);
    const rpmMax = Math.max(...rpmSampled, 1);
    const traceH = halfH - 4; // leave room for tick labels

    // Draw RPM trace line
    doc.setDrawColor(70, 120, 200);
    doc.setLineWidth(0.2);
    for (let i = 1; i < rpmSampled.length; i++) {
      const x1 = graphX + ((i - 1) / (rpmSampled.length - 1)) * graphW;
      const x2 = graphX + (i / (rpmSampled.length - 1)) * graphW;
      const y1 = rpmBandTop + 1 + traceH - (rpmSampled[i - 1] / rpmMax) * traceH;
      const y2 = rpmBandTop + 1 + traceH - (rpmSampled[i] / rpmMax) * traceH;
      doc.line(x1, y1, x2, y2);
    }

    // RPM tick marks along bottom of RPM band
    const rpmTickCount = 8;
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 120, 200);
    for (let t = 0; t <= rpmTickCount; t++) {
      const frac = t / rpmTickCount;
      const tx = graphX + frac * graphW;
      const idx = Math.min(Math.floor(frac * (rpmSampled.length - 1)), rpmSampled.length - 1);
      const rpmVal = rpmSampled[idx] || 0;
      doc.setDrawColor(70, 120, 200);
      doc.setLineWidth(0.12);
      doc.line(tx, rpmBandBot - 3.5, tx, rpmBandBot - 2.5);
      doc.text(`${Math.round(rpmVal)}`, tx - 2.5, rpmBandBot - 0.5);
    }
    // RPM label at left
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(70, 120, 200);
    doc.text('RPM', x + 1, rpmBandTop + 4);
  }

  // Speed overlay (bottom band, gray) with tick marks
  if (speedData && speedData.length > 10) {
    const spdValid = speedData.filter(v => !isNaN(v));
    const spdStep = Math.max(1, Math.floor(spdValid.length / 200));
    const spdSampled = spdValid.filter((_, i) => i % spdStep === 0);
    const spdMax = Math.max(...spdSampled, 1);
    const bandH = spdBandBot - spdBandTop;
    const traceH = bandH - 4;

    // Draw speed trace line
    doc.setDrawColor(130, 130, 160);
    doc.setLineWidth(0.2);
    for (let i = 1; i < spdSampled.length; i++) {
      const x1 = graphX + ((i - 1) / (spdSampled.length - 1)) * graphW;
      const x2 = graphX + (i / (spdSampled.length - 1)) * graphW;
      const y1 = spdBandTop + 1 + traceH - (spdSampled[i - 1] / spdMax) * traceH;
      const y2 = spdBandTop + 1 + traceH - (spdSampled[i] / spdMax) * traceH;
      doc.line(x1, y1, x2, y2);
    }

    // Speed tick marks along bottom of Speed band
    const spdTickCount = 8;
    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(130, 130, 160);
    for (let t = 0; t <= spdTickCount; t++) {
      const frac = t / spdTickCount;
      const tx = graphX + frac * graphW;
      const idx = Math.min(Math.floor(frac * (spdSampled.length - 1)), spdSampled.length - 1);
      const spdVal = spdSampled[idx] || 0;
      doc.setDrawColor(130, 130, 160);
      doc.setLineWidth(0.12);
      doc.line(tx, spdBandBot - 3.5, tx, spdBandBot - 2.5);
      doc.text(`${Math.round(spdVal)}`, tx - 2.5, spdBandBot - 0.5);
    }
    // MPH label at left
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(130, 130, 160);
    doc.text('MPH', x + 1, spdBandTop + 4);
  }

  // Draw each series
  sampled.forEach((sData, idx) => {
    const s = validSeries[idx];
    const min = Math.min(...sData);
    const max = Math.max(...sData);
    const range = max - min || 1;

    doc.setDrawColor(...s.color);
    doc.setLineWidth(s.dashed ? 0.3 : 0.4);
    if (s.dashed) doc.setLineDashPattern([1.5, 1], 0);

    for (let i = 1; i < sData.length; i++) {
      const x1 = graphX + ((i - 1) / (sData.length - 1)) * graphW;
      const x2 = graphX + (i / (sData.length - 1)) * graphW;
      const y1 = graphY + graphH - ((sData[i - 1] - min) / range) * graphH;
      const y2 = graphY + graphH - ((sData[i] - min) / range) * graphH;
      doc.line(x1, y1, x2, y2);
    }

    if (s.dashed) doc.setLineDashPattern([], 0);

    // Min/Max labels on right side
    doc.setFontSize(5.5);
    doc.setTextColor(...s.color);
    doc.text(`${max.toFixed(1)}${s.unit}`, graphX + graphW + 1, graphY + 2 + idx * 4.5);
  });

  return y + height + 2;
}

// ── Tuning Wisdom Thresholds ────────────────────────────────────────────────

function isPiezoInjector(vehicleInfo?: VehicleInfo): boolean {
  if (!vehicleInfo) return false;
  const inj = (vehicleInfo.injectionSystem || '').toLowerCase();
  return inj.includes('piezo');
}

function getOemPeakRailPsi(vehicleInfo?: VehicleInfo): number {
  if (!vehicleInfo) return 26000; // default L5P
  const rail = vehicleInfo.maxRailPressure || '';
  const match = rail.match(/(\d[\d,]*)/);
  if (match) return parseInt(match[1].replace(/,/g, ''), 10);
  return 26000;
}

function getInjectorAnalysis(
  pulseWidthMs: number[],
  isPiezo: boolean,
  railPressure?: number[],
): { maxPw: number; avgPw: number; spicyPct: number; commentary: string } {
  const valid = pulseWidthMs.filter(v => v > 0);
  if (valid.length === 0) return { maxPw: 0, avgPw: 0, spicyPct: 0, commentary: '' };

  const maxPw = Math.max(...valid);
  const avgPw = valid.reduce((a, b) => a + b, 0) / valid.length;

  // ── Rail pressure context ──
  // Pulse width severity depends heavily on rail pressure. 2.9ms at 8,000 PSI is a
  // completely different situation than 2.9ms at 25,000+ PSI. At low pressure, the
  // injector isn't delivering nearly as much fuel per microsecond, so the spray
  // pattern and piston loading are much less aggressive.
  // We find the rail pressure AT the moment of peak PW to assess the real severity.
  let railAtPeakPw = 0;
  let peakPwIdx = 0;
  for (let i = 0; i < valid.length; i++) {
    if (pulseWidthMs[i] === maxPw && peakPwIdx === 0) {
      peakPwIdx = i;
      break;
    }
  }
  // Find actual index in full array
  let fullIdx = -1;
  for (let i = 0; i < pulseWidthMs.length; i++) {
    if (Math.abs(pulseWidthMs[i] - maxPw) < 0.001) {
      fullIdx = i;
      break;
    }
  }
  if (railPressure && fullIdx >= 0 && fullIdx < railPressure.length) {
    railAtPeakPw = railPressure[fullIdx];
  }

  // Determine if this is a "high pressure" situation
  // L5P OEM peak is ~29,000 PSI, LML ~27,000 PSI, LBZ ~23,000 PSI
  // Below ~15,000 PSI, even a long PW isn't delivering massive fuel volume
  const highPressureThreshold = isPiezo ? 20000 : 18000; // PSI
  const lowPressure = railAtPeakPw > 0 && railAtPeakPw < highPressureThreshold;

  // Thresholds differ by injector type
  const spicyThreshold = isPiezo ? 1.5 : 2.5; // ms for piezo, ms (2500uS) for solenoid
  const spicyCount = valid.filter(v => v >= spicyThreshold).length;
  const spicyPct = (spicyCount / valid.length) * 100;

  // Piezo injectors have ~800μs of shutoff delay, so a 1.5ms command = ~2.3ms actual
  // fuel delivery. After 1400-1600μs, the piezo needle is bottomed out and fuel
  // delivered past that point is extremely inefficient — terrible atomization, wide
  // spray patterns, fuel washing piston bowl walls.
  const piezoShutoffDelay = 0.8; // ms (~800μs)
  const piezoBottomedOut = 1.5; // ms (1400-1600μs range, needle fully open)
  const effectivePw = isPiezo ? maxPw + piezoShutoffDelay : maxPw;

  const railContext = railAtPeakPw > 0
    ? ` Rail pressure at peak PW was ${Math.round(railAtPeakPw).toLocaleString()} PSI${lowPressure ? ' — that\'s relatively low pressure, so the actual fuel volume delivered per millisecond is significantly less than it would be at full rail pressure' : ''}.`
    : '';

  let commentary = '';
  if (maxPw < spicyThreshold * 0.7) {
    commentary = `Injector pulse width peaked at ${maxPw.toFixed(2)}ms — well within the comfort zone.${railContext} The fuel system isn't being asked to do anything heroic here, and the pistons are living an easy life.`;
  } else if (maxPw < spicyThreshold) {
    commentary = `Peak pulse width of ${maxPw.toFixed(2)}ms is getting up there.${railContext}`;
    if (lowPressure) {
      commentary += ` However, at this rail pressure the fuel volume per millisecond is moderate — the duration looks long but the actual fuel mass delivered is less aggressive than the same PW at full rail pressure would be.`;
    } else {
      commentary += ` The longer the injector stays open, the wider the spray pattern gets — and that means more fuel washing the piston bowl walls instead of atomizing cleanly.`;
    }
    if (isPiezo) {
      commentary += ` Keep in mind that piezo injectors have roughly 800μs of shutoff delay — so a ${maxPw.toFixed(2)}ms command means the injector is actually delivering fuel for approximately ${effectivePw.toFixed(2)}ms.`;
    }
    commentary += ` Keep an eye on EGTs when you're in this range.`;
  } else if (maxPw < spicyThreshold * 1.3) {
    if (lowPressure) {
      commentary = `Peak pulse width hit ${maxPw.toFixed(2)}ms — the duration is in ${isPiezo ? 'race territory for piezo injectors' : 'big-tune territory on stock injectors'}, but rail pressure at that moment was only ${Math.round(railAtPeakPw).toLocaleString()} PSI.${railContext} At this lower pressure, the injector isn't delivering nearly as much fuel per millisecond as it would at full rail pressure. The spray pattern is wider than ideal, but the actual fuel mass and piston loading are significantly less severe than the same PW at ${isPiezo ? '25,000+' : '20,000+'} PSI would be.`;
    } else {
      commentary = `Peak pulse width hit ${maxPw.toFixed(2)}ms — that's ${isPiezo ? 'race territory for piezo injectors' : 'big-tune territory on stock injectors'}.${railContext} At this duration${!lowPressure && railAtPeakPw > 0 ? ' and pressure' : ''}, the spray pattern widens significantly and fuel is hitting the piston bowl walls directly. That's hard on the pistons, not the injectors — the injectors are fine, it's the downstream effect that matters.`;
    }
    if (isPiezo) {
      commentary += ` With ~800μs shutoff delay, the actual fuel delivery duration is closer to ${effectivePw.toFixed(2)}ms. Past about 1.4-1.6ms, the piezo needle is bottomed out — fuel delivered beyond that point is extremely inefficient with terrible atomization.`;
    }
    if (!lowPressure) {
      commentary += ` ${spicyPct > 10 ? `You spent ${spicyPct.toFixed(1)}% of the log above the spicy threshold — that's a lot of time with wide spray patterns beating on the pistons.` : 'It was brief, which helps — a 1/4 mile burst is fine... until it isn\'t.'} If you're making this kind of power regularly, consider injectors sized for your target HP — shorter pulse at higher flow rate means tighter spray patterns and happier pistons.`;
    }
  } else {
    if (lowPressure) {
      commentary = `Peak pulse width of ${maxPw.toFixed(2)}ms is a long injection event, but rail pressure at that point was only ${Math.round(railAtPeakPw).toLocaleString()} PSI.${railContext} The duration is high, but the fuel volume delivered is substantially less than it would be at full rail pressure. The spray pattern is wider than ideal, but piston loading is moderated by the lower pressure. This is a different situation than the same PW at ${isPiezo ? '25,000+' : '20,000+'} PSI — context matters.`;
      if (isPiezo) {
        commentary += ` With ~800μs shutoff delay, actual fuel delivery is approximately ${effectivePw.toFixed(2)}ms.`;
      }
    } else {
      if (isPiezo) {
        commentary = `Peak pulse width of ${maxPw.toFixed(2)}ms is deep into race-only territory for piezo injectors.${railContext} With ~800μs shutoff delay, actual fuel delivery is approximately ${effectivePw.toFixed(2)}ms. The piezo needle bottoms out around 1.4-1.6ms — everything past that is extremely inefficient fuel delivery with wide-open spray patterns hammering the piston bowl walls. The injector is basically maxed out and dumping fuel with terrible atomization for ${(effectivePw - piezoBottomedOut).toFixed(2)}ms of that event.`;
      } else {
        commentary = `Peak pulse width of ${maxPw.toFixed(2)}ms is deep into the hard-on-pistons zone.${railContext} Past 2.5ms (2500μs), stock injectors are spraying fuel everywhere — wide spray patterns hammer the piston bowl walls and increase thermal loading on the bottom end.`;
      }
      commentary += ` ${spicyPct > 5 ? `${spicyPct.toFixed(1)}% of the log was above threshold — that's sustained abuse on the pistons, not just a quick pull.` : ''} This is the big injector argument: matched injectors flow more fuel in less time, keeping spray patterns tight and pistons happy. It's OK to go fast in 1/4 mile bursts... until it isn't. The more horsepower you chase on stock injectors, the harder the pistons have to work. Do the build correctly: keep things cool, efficient, and matched.`;
    }
  }

  return { maxPw, avgPw, spicyPct, commentary };
}

/**
 * Calculate total Crank Angle Duration (CAD) of injection event and end-of-injection relative to TDC.
 * CAD (degrees) = pulseWidth_ms * (RPM * 360) / (60 * 1000) = pulseWidth_ms * RPM * 0.006
 * End of injection = SOI (BTDC) - CAD  (positive = still BTDC, negative = ATDC)
 * Fuel pressure affects atomization quality at these timings.
 */
function getCADAnalysis(
  pulseWidth: number[],
  timing: number[],
  rpm: number[],
  railPressure: number[],
): { commentary: string; peakCadDeg: number; eoi: number } {
  const len = Math.min(pulseWidth.length, timing.length, rpm.length);
  if (len < 10) return { commentary: '', peakCadDeg: 0, eoi: 0 };

  let peakCadDeg = 0;
  let peakEoi = 0;
  let peakRpm = 0;
  let peakPw = 0;
  let peakSoi = 0;
  let peakRail = 0;

  // Find the sample with the highest CAD (worst case for piston loading)
  for (let i = 0; i < len; i++) {
    const pw = pulseWidth[i];
    const soi = timing[i];
    const r = rpm[i];
    if (pw <= 0 || soi <= 0 || r < 800) continue;

    // CAD = pulse_width_ms * RPM * 6 / 1000 = pw * rpm * 0.006
    const cad = pw * r * 0.006;
    if (cad > peakCadDeg) {
      peakCadDeg = cad;
      peakEoi = soi - cad; // positive = BTDC, negative = ATDC
      peakRpm = r;
      peakPw = pw;
      peakSoi = soi;
      peakRail = i < railPressure.length ? railPressure[i] : 0;
    }
  }

  if (peakCadDeg < 1) return { commentary: '', peakCadDeg: 0, eoi: 0 };

  const eoiLabel = peakEoi >= 0
    ? `${peakEoi.toFixed(1)}° BTDC (injection ends before TDC)`
    : `${Math.abs(peakEoi).toFixed(1)}° ATDC (injection extends past TDC)`;

  let commentary = `Crank Angle Duration (CAD) Analysis (approximate): At ${peakRpm.toFixed(0)} RPM with a ${peakPw.toFixed(2)}ms pulse width and ${peakSoi.toFixed(1)}° BTDC start-of-injection, the total injection event spans approximately ${peakCadDeg.toFixed(1)} crank degrees. End of injection lands at ${eoiLabel}.`;

  if (peakRail > 0) {
    commentary += ` At ${peakRail.toFixed(0)} PSI rail pressure, fuel atomization quality is ${peakRail > 25000 ? 'excellent — high pressure means finer droplets and more complete combustion' : peakRail > 18000 ? 'good — adequate pressure for clean combustion at this pulse width' : 'moderate — lower rail pressure means coarser atomization, which can lead to incomplete combustion and higher soot production'}.`;
  }

  if (peakCadDeg > 30) {
    commentary += ` A ${peakCadDeg.toFixed(1)}° injection window is wide — the injector is open for a significant portion of the combustion stroke. This is where matched injectors become critical: shorter pulse at higher flow rate achieves the same fueling with less crank angle exposure, reducing piston thermal loading.`;
  } else if (peakCadDeg > 20) {
    commentary += ` The injection window is in the performance range. The ECM is using a reasonable amount of crank angle to deliver the fuel charge.`;
  } else {
    commentary += ` The injection window is compact — the fuel charge is delivered quickly, which is ideal for combustion efficiency and piston longevity.`;
  }

  if (peakEoi < -5) {
    commentary += ` Note: injection extending ${Math.abs(peakEoi).toFixed(1)}° past TDC means fuel is still being injected as the piston moves down the bore. Late injection burns hotter, raises EGTs, and reduces thermal efficiency. This is a byproduct of long pulse widths at high RPM.`;
  }

  return { commentary, peakCadDeg, eoi: peakEoi };
}

function getTimingAnalysis(
  timing: number[],
  pulseWidth?: number[],
  rpm?: number[],
  isPiezo?: boolean,
): { maxTiming: number; avgTiming: number; commentary: string } {
  const valid = timing.filter(v => v > 0);
  if (valid.length === 0) return { maxTiming: 0, avgTiming: 0, commentary: '' };

  const maxTiming = Math.max(...valid);
  const avgTiming = valid.reduce((a, b) => a + b, 0) / valid.length;

  let commentary = '';
  if (maxTiming < 20) {
    commentary = `Injection timing peaked at ${maxTiming.toFixed(1)}° BTDC — conservative and safe. The tune isn't pushing timing aggressively, which keeps cylinder pressures manageable.`;
  } else if (maxTiming < 27) {
    commentary = `Timing peaked at ${maxTiming.toFixed(1)}° BTDC, averaging ${avgTiming.toFixed(1)}°. Getting into the performance range but still within reason. High timing makes power but also makes cylinder pressure — it's a balancing act.`;
  } else {
    commentary = `Timing hit ${maxTiming.toFixed(1)}° BTDC — that's spicy. Past 27° on a diesel, cylinder pressures climb fast. High pulse width calls for high timing to burn the fuel efficiently, but this is where you need everything else to be right: injectors matched to power level, turbo sized correctly, and the bottom end built to handle it. This isn't a "run it and forget it" setup.`;
  }

  // ── Low timing at high pulse width warning ──
  // When PW is high (big tune territory), the injector is open a long time and the
  // spray pattern is wide. You NEED enough timing to actually burn all that fuel
  // before the exhaust valve opens. Low timing + high PW = late burn, high EGTs,
  // wasted energy going out the exhaust. At 2500μs+ PW, you want 27°+ timing
  // depending on RPM — either you're making power or you're wasting it as heat.
  if (pulseWidth && rpm && pulseWidth.length > 10) {
    const spicyThreshold = isPiezo ? 1.5 : 2.5; // ms
    // Find samples where PW is high and RPM is above idle
    let lowTimingHighPwCount = 0;
    let worstPw = 0;
    let worstTiming = 0;
    let worstRpm = 0;
    const len = Math.min(timing.length, pulseWidth.length, rpm?.length ?? timing.length);
    for (let i = 0; i < len; i++) {
      const pw = pulseWidth[i];
      const r = rpm ? rpm[i] : 0;
      const t = timing[i];
      if (pw <= 0 || t <= 0 || r < 1500) continue;

      // At high PW (>= spicy threshold), a pulse that high does better at 27°+
      // of timing depending on RPM. We don't want to spray that much fuel if
      // it's not going to be used for power — either making power or wasting it
      // with heat. Higher RPM needs even more timing to complete combustion.
      const minExpectedTiming = r >= 3500 ? 29 : r >= 3000 ? 27 : r >= 2500 ? 25 : 22;
      if (pw >= spicyThreshold * 0.9 && r >= 2500 && t < minExpectedTiming) {
        lowTimingHighPwCount++;
        if (pw > worstPw) {
          worstPw = pw;
          worstTiming = t;
          worstRpm = r;
        }
      }
    }

    if (lowTimingHighPwCount > 5 && worstPw > 0) {
      const expectedMin = worstRpm >= 3500 ? 29 : worstRpm >= 3000 ? 27 : worstRpm >= 2500 ? 25 : 22;
      commentary += ` ⚠ Low timing at high pulse width: ${worstTiming.toFixed(1)}° at ${worstPw.toFixed(2)}ms PW and ${Math.round(worstRpm)} RPM. A pulse that high does better at ${expectedMin}°+ of timing at this RPM. We don't want to spray that much fuel if it's not going to be used for power — you're either making power or wasting it as heat. Low timing at high PW means the fuel charge isn't burning efficiently: energy goes out the exhaust instead of pushing the piston down. That's higher EGTs, reduced efficiency, and wasted fuel. The tune should be advancing timing to match the fuel delivery.`;
    }
  }

  return { maxTiming, avgTiming, commentary };
}

function getRailPressureAnalysis(
  actual: number[],
  desired: number[],
  pcv: number[],
  oemPeakPsi: number,
): { maxActual: number; maxDesired: number; maxPcv: number; overOemPct: number; commentary: string } {
  const validActual = actual.filter(v => v > 0);
  const validDesired = desired.filter(v => v > 0);
  const validPcv = pcv.filter(v => !isNaN(v));

  const maxActual = validActual.length > 0 ? Math.max(...validActual) : 0;
  const maxDesired = validDesired.length > 0 ? Math.max(...validDesired) : 0;
  const maxPcv = validPcv.length > 0 ? Math.max(...validPcv) : 0;
  const overOem = maxActual - oemPeakPsi;
  const overOemPct = oemPeakPsi > 0 ? (overOem / oemPeakPsi) * 100 : 0;

  let commentary = '';
  if (maxActual <= oemPeakPsi) {
    commentary = `Peak rail pressure of ${maxActual.toFixed(0)} PSI stayed at or below the OEM peak of ${oemPeakPsi.toFixed(0)} PSI. The fuel system isn't being pushed beyond factory spec.`;
  } else if (overOem <= 3000) {
    commentary = `Rail pressure peaked at ${maxActual.toFixed(0)} PSI — about ${overOem.toFixed(0)} PSI above the OEM peak of ${oemPeakPsi.toFixed(0)} PSI. Elevated, but within a reasonable range for a tuned truck. The high-pressure pump (HP4 on L5P, CP4.2 on LML, CP3 on older platforms) can handle this.`;
  } else {
    commentary = `Rail pressure hit ${maxActual.toFixed(0)} PSI — that's ${overOem.toFixed(0)} PSI above OEM peak (${oemPeakPsi.toFixed(0)} PSI). Getting spicy. Past 3,000 PSI above OEM, you're asking a lot of the high-pressure fuel pump and injector seals. If the PCV current (mA) is running high, the regulator is bypassing more fuel and the pump is working overtime to maintain these pressures.`;
  }

  if (maxPcv > 80) {
    commentary += ` PCV current hit ${maxPcv.toFixed(0)} mA — the Pressure Control Valve is commanding significant fuel bypass. Higher mA = more fuel bypassed (less rail pressure), lower mA = more fuel flowing to the rail. At ~400 mA the CP3 is receiving roughly 97% of available fuel. If PCV current stays very low under load, the pump may be at its limit trying to maintain commanded pressure.`;
  }

  // Check desired vs actual deviation
  if (validActual.length > 0 && validDesired.length > 0) {
    const len = Math.min(validActual.length, validDesired.length);
    let deviationCount = 0;
    for (let i = 0; i < len; i++) {
      if (validDesired[i] > 5000 && validActual[i] < validDesired[i] * 0.9) deviationCount++;
    }
    const devPct = (deviationCount / len) * 100;
    if (devPct > 10) {
      commentary += ` Actual rail pressure fell more than 10% below desired for ${devPct.toFixed(1)}% of the log under load — the pump may not be keeping up with demand.`;
    }
  }

  return { maxActual, maxDesired, maxPcv, overOemPct, commentary };
}

function getBoostVaneAnalysis(
  boost: number[],
  boostDesired: number[],
  vanePos: number[],
  vaneDesired: number[],
  rpm: number[],
  maf: number[],
): { commentary: string; leakSuspected: boolean } {
  const validBoost = boost.filter(v => !isNaN(v));
  const validDesired = boostDesired.filter(v => !isNaN(v) && v > 0);
  const validVane = vanePos.filter(v => !isNaN(v));

  if (validBoost.length < 10) return { commentary: '', leakSuspected: false };

  let commentary = '';
  let leakSuspected = false;

  // Check boost tracking
  if (validDesired.length > 10) {
    const len = Math.min(validBoost.length, validDesired.length);
    let underBoostCount = 0;
    for (let i = 0; i < len; i++) {
      if (validDesired[i] > 10 && validBoost[i] < validDesired[i] * 0.8) underBoostCount++;
    }
    const underPct = (underBoostCount / len) * 100;

    if (underPct < 5) {
      commentary += `Boost tracked desired pressure well — actual stayed within 20% of commanded for ${(100 - underPct).toFixed(0)}% of the log. The turbo is responding to what the ECM is asking for.`;
    } else if (underPct < 15) {
      commentary += `Boost fell more than 20% below desired for ${underPct.toFixed(1)}% of the log. Some lag is normal during transients, but if this is sustained, the turbo may be struggling to meet demand.`;
    } else {
      commentary += `Boost was significantly below desired for ${underPct.toFixed(1)}% of the log. The turbo is not delivering what the ECM is commanding. Could be a boost leak, worn turbo, or the vane actuator may not be responding correctly.`;
    }
  }

  // Vane position analysis
  if (validVane.length > 10) {
    const maxVane = Math.max(...validVane);
    const avgVane = validVane.reduce((a, b) => a + b, 0) / validVane.length;
    commentary += ` Turbo vane position peaked at ${maxVane.toFixed(1)}% (average ${avgVane.toFixed(1)}%).`;

    // Vane desired vs actual tracking
    const validVaneDesired = vaneDesired.filter(v => !isNaN(v) && v > 0);
    if (validVaneDesired.length > 10) {
      const vLen = Math.min(validVane.length, validVaneDesired.length);
      let vaneDevCount = 0;
      for (let i = 0; i < vLen; i++) {
        if (Math.abs(validVane[i] - validVaneDesired[i]) > 10) vaneDevCount++;
      }
      const vaneDevPct = (vaneDevCount / vLen) * 100;
      if (vaneDevPct > 15) {
        commentary += ` Vane position deviated more than 10% from desired for ${vaneDevPct.toFixed(1)}% of the log — the actuator may be slow or sticking.`;
      }
    }
  }

  // Boost leak detection: high MAF + vane >45% at 2900+ RPM + boost <33 PSI
  const len = Math.min(boost.length, rpm.length, maf.length, vanePos.length || Infinity);
  if (len > 10 && validVane.length > 10) {
    let leakSamples = 0;
    let totalHighRpmSamples = 0;
    for (let i = 0; i < len; i++) {
      if (rpm[i] >= 2900) {
        totalHighRpmSamples++;
        const vane = i < vanePos.length ? vanePos[i] : 0;
        const mafVal = i < maf.length ? maf[i] : 0;
        const boostVal = i < boost.length ? boost[i] : 0;
        // High MAF (>20 lb/min), vane past 45%, boost below 33 PSI at high RPM
        if (mafVal > 20 && vane > 45 && boostVal < 33) {
          leakSamples++;
        }
      }
    }
    if (totalHighRpmSamples > 20 && (leakSamples / totalHighRpmSamples) > 0.3) {
      leakSuspected = true;
      commentary += ` ATTENTION: At 2900+ RPM, we're seeing high airflow (MAF) with the vane past 45% but boost staying below 33 PSI. This pattern is consistent with a boost leak or a tune that needs revision. The turbo is moving air, but it's not building pressure — something is letting it escape. Check intercooler boots, clamps, and the charge pipe for leaks.`;
    }
  }

  return { commentary, leakSuspected };
}

function getMADAnalysis(
  boost: number[],
  intakeAirTemp: number[],
  barometric: number[],
): { madValues: number[]; maxMad: number; avgMad: number; commentary: string } {
  // Manifold Air Density = (boost_psi_absolute * 2.036) / (IAT_rankine)
  // Higher MAD = denser charge = more power potential
  // We use boost gauge + barometric for absolute pressure
  const baro = barometric.length > 0 ? barometric.filter(v => v > 10).reduce((a, b) => a + b, 0) / barometric.filter(v => v > 10).length : 14.7;

  const madValues: number[] = [];
  const len = Math.min(boost.length, intakeAirTemp.length);

  for (let i = 0; i < len; i++) {
    const boostAbs = boost[i] + baro; // psi absolute
    const iatF = intakeAirTemp[i];
    if (boostAbs > 0 && iatF > -40) {
      const iatRankine = iatF + 459.67;
      // Density proportional to P/T (ideal gas law simplified)
      const mad = (boostAbs * 2.036) / (iatRankine / 1000); // arbitrary units scaled for readability
      madValues.push(mad);
    }
  }

  if (madValues.length < 10) return { madValues: [], maxMad: 0, avgMad: 0, commentary: '' };

  const maxMad = Math.max(...madValues);
  const avgMad = madValues.reduce((a, b) => a + b, 0) / madValues.length;

  let commentary = `Manifold Air Density (MAD) is a derived metric that combines boost pressure and intake air temperature to estimate how much air mass is actually entering the engine. Higher MAD = denser charge = more oxygen for combustion = more power potential. `;
  commentary += `Peak MAD was ${maxMad.toFixed(1)}, averaging ${avgMad.toFixed(1)} over the log. `;

  if (maxMad > 120) {
    commentary += `That's a dense charge — this engine is getting fed well. Make sure the fuel system can keep up with the air it's swallowing.`;
  } else if (maxMad > 80) {
    commentary += `Solid air density numbers. The intercooler and turbo are working together to pack the cylinders efficiently.`;
  } else {
    commentary += `Air density is moderate. If you're chasing power, improving intercooler efficiency or reducing intake temps would help pack more air into each combustion event.`;
  }

  return { madValues, maxMad, avgMad, commentary };
}

function getBoostAirDensityAnalysis(
  boost: number[],
  maf: number[],
  rpm: number[],
): { densityValues: number[]; commentary: string } {
  // Volumetric efficiency proxy: MAF / (RPM * displacement_factor)
  // Higher values at same RPM = better breathing
  const densityValues: number[] = [];
  const len = Math.min(boost.length, maf.length, rpm.length);

  for (let i = 0; i < len; i++) {
    if (rpm[i] > 800 && maf[i] > 1 && boost[i] > 0) {
      // Normalize MAF by RPM to get efficiency-like metric
      const density = (maf[i] / (rpm[i] / 1000)) * (boost[i] / 10);
      densityValues.push(density);
    }
  }

  if (densityValues.length < 10) return { densityValues: [], commentary: '' };

  const maxDensity = Math.max(...densityValues);
  const avgDensity = densityValues.reduce((a, b) => a + b, 0) / densityValues.length;

  let commentary = `Boost Air Density combines airflow (MAF), engine speed (RPM), and boost pressure to estimate how efficiently the turbo system is converting boost into actual air mass. `;
  commentary += `Peak density index was ${maxDensity.toFixed(1)}, averaging ${avgDensity.toFixed(1)}. `;
  commentary += `A higher number at the same RPM means the turbo and intercooler are doing a better job of packing dense air into the cylinders. If this number drops at high RPM while boost stays up, the intercooler may be heat-soaking.`;

  return { densityValues, commentary };
}

function getConverterStallAnalysis(
  converterSlip: number[],
  rpm: number[],
  vehicleSpeed: number[],
): string {
  // Look for stall speed: high RPM + low/zero speed + high slip
  const len = Math.min(converterSlip.length, rpm.length, vehicleSpeed.length);
  let maxSlipAtLaunch = 0;
  let launchRpm = 0;

  for (let i = 0; i < len; i++) {
    if (vehicleSpeed[i] < 5 && rpm[i] > 1500 && Math.abs(converterSlip[i]) > maxSlipAtLaunch) {
      maxSlipAtLaunch = Math.abs(converterSlip[i]);
      launchRpm = rpm[i];
    }
  }

  if (maxSlipAtLaunch < 100) return '';

  return `Converter stall analysis: Maximum slip of ${maxSlipAtLaunch.toFixed(0)} RPM was observed at ${launchRpm.toFixed(0)} engine RPM during low-speed operation. As you increase power (especially with a larger turbo), the power curve shifts to the right — a converter with a stall speed matched to where peak torque now lives keeps the engine in the power band during launches and heavy pulls. A mismatched converter leaves power on the table or generates excessive heat.`;
}

// ── ECU Context Box ─────────────────────────────────────────────────────────

function renderEcuContextBox(
  observation: Parameters<typeof getCalibrationContext>[0],
  doc: jsPDF,
  margin: number,
  contentWidth: number,
  checkBreak: (space: number) => void,
  getY: () => number,
  setY: (y: number) => void,
): void {
  const insight = getCalibrationContext(observation);
  if (!insight || insight.subsystem === 'Unknown') return;

  checkBreak(22);
  const boxX = margin + 2;
  const boxW = contentWidth - 4;
  const y0 = getY();

  // Measure text height
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(insight.context, boxW - 6);
  const textH = lines.length * 3;
  const boxH = textH + 12;

  // Draw box
  doc.setFillColor(243, 244, 248);
  doc.setDrawColor(200, 205, 215);
  doc.setLineWidth(0.2);
  doc.roundedRect(boxX, y0, boxW, boxH, 1, 1, 'FD');

  // Header
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 90, 120);
  doc.text(`ECU REFERENCE: ${insight.title}`, boxX + 3, y0 + 4.5);

  // Subsystem tag
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120, 130, 150);
  doc.text(`Subsystem: ${insight.subsystem}`, boxX + 3, y0 + 8);

  // Context text
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 85, 95);
  doc.text(lines, boxX + 3, y0 + 11.5);

  setY(y0 + boxH + 2);
}

// ── Main Export ──────────────────────────────────────────────────────────────

export interface AdvancedAnalyticsResult {
  /** Whether any advanced graphs were rendered */
  hasContent: boolean;
}

/**
 * Render the advanced analytics section into an existing jsPDF document.
 * Call this from generateHealthReportPdf after the basic graphs.
 */
export function renderAdvancedAnalytics(
  doc: jsPDF,
  yStart: number,
  data: ProcessedMetrics,
  vehicleInfo: VehicleInfo | undefined,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  speedRef: number[] | undefined,
  addText: (text: string, size: number, weight: 'normal' | 'bold' | 'italic', color: [number, number, number], maxWidth?: number) => void,
  addWrappedText: (text: string, size: number, weight: 'normal' | 'bold' | 'italic', color: [number, number, number], lineSpacing?: number) => void,
  checkBreak: (space: number) => void,
  drawHR: (color?: [number, number, number]) => void,
  getY: () => number,
  setY: (newY: number) => void,
  rpmRef?: number[],
): AdvancedAnalyticsResult {
  let hasContent = false;

  const isPiezo = isPiezoInjector(vehicleInfo);
  const oemPeakRail = getOemPeakRailPsi(vehicleInfo);

  // Check if we have enough advanced data to render this section
  const hasInjector = hasRealData(data.injectorPulseWidth);
  const hasTiming = hasRealData(data.injectionTiming);
  const hasDesiredBoost = hasRealData(data.boostDesired);
  const hasVane = hasRealData(data.turboVanePosition);
  const hasVaneDesired = hasRealData(data.turboVaneDesired);
  const hasDesiredRail = hasRealData(data.railPressureDesired);
  const hasPcv = hasRealData(data.pcvDutyCycle);
  const hasMaf = hasRealData(data.maf);
  const hasIat = hasRealData(data.intakeAirTemp);

  if (!hasInjector && !hasTiming && !hasDesiredBoost && !hasVane && !hasDesiredRail && !hasPcv && !hasMaf) {
    return { hasContent: false };
  }

  // Section header
  checkBreak(20);
  addText('ADVANCED TUNING ANALYSIS', 12, 'bold', BLUE);
  drawHR([200, 210, 230]);
  addWrappedText(
    'This section digs deeper into the relationship between key engine parameters. These correlated views show how the fuel system, turbo, and ECM are working together — or fighting each other. The commentary is based on real-world tuning experience. As always: the more horsepower you increase, the harder it is on things. Do the build correctly, keep things cool, efficient, and matched.',
    8.5, 'normal', [100, 100, 110], 1.3,
  );
  setY(getY() + 2);
  hasContent = true;

  // ── 1. INJECTOR PULSE WIDTH & TIMING ──────────────────────────────────────
  if (hasInjector || hasTiming) {
    checkBreak(65);

    const injSeries: CorrelatedSeries[] = [];
    if (hasInjector) {
      injSeries.push({
        data: data.injectorPulseWidth,
        label: 'Pulse Width',
        unit: 'ms',
        color: ORANGE,
      });
    }
    if (hasTiming) {
      injSeries.push({
        data: data.injectionTiming,
        label: 'Timing',
        unit: '° BTDC',
        color: TEAL,
        dashed: true,
      });
    }

    const newY = drawCorrelatedGraph(
      doc, margin, getY(), contentWidth, 55,
      { title: 'INJECTOR PULSE WIDTH & TIMING', series: injSeries, speedData: speedRef, rpmData: rpmRef },
      margin, contentWidth,
    );
    setY(newY);

    // Injector commentary
    if (hasInjector) {
      const injAnalysis = getInjectorAnalysis(data.injectorPulseWidth, isPiezo, data.railPressureActual);
      if (injAnalysis.commentary) {
        addWrappedText(injAnalysis.commentary, 8, 'normal', TEXT_BODY, 1.3);
      }
    }

    // Timing commentary
    if (hasTiming) {
      const timingAnalysis = getTimingAnalysis(
        data.injectionTiming,
        hasInjector ? data.injectorPulseWidth : undefined,
        data.rpm,
        isPiezo,
      );
      if (timingAnalysis.commentary) {
        addWrappedText(timingAnalysis.commentary, 8, 'normal', TEXT_BODY, 1.3);
      }
    }

    // CAD / TDC Analysis (requires both pulse width, timing, and RPM)
    if (hasInjector && hasTiming) {
      const cadResult = getCADAnalysis(
        data.injectorPulseWidth, data.injectionTiming, data.rpm, data.railPressureActual,
      );
      if (cadResult.commentary) {
        addWrappedText(cadResult.commentary, 8, 'normal', TEXT_BODY, 1.3);
      }
    }

    // Combined insight — factor in rail pressure context
    if (hasInjector && hasTiming) {
      const maxPw = Math.max(...data.injectorPulseWidth.filter(v => v > 0));
      const maxTiming = Math.max(...data.injectionTiming.filter(v => v > 0));
      const spicyThreshold = isPiezo ? 1.5 : 2.5;
      // Find rail pressure at peak PW to determine actual severity
      let railAtMaxPw = 0;
      const hasRail = hasRealData(data.railPressureActual);
      if (hasRail) {
        for (let i = 0; i < data.injectorPulseWidth.length; i++) {
          if (Math.abs(data.injectorPulseWidth[i] - maxPw) < 0.001 && i < data.railPressureActual.length) {
            railAtMaxPw = data.railPressureActual[i];
            break;
          }
        }
      }
      const highPressureThreshold = isPiezo ? 20000 : 18000;
      const isLowPressure = railAtMaxPw > 0 && railAtMaxPw < highPressureThreshold;

      if (maxPw > spicyThreshold && maxTiming > 25 && !isLowPressure) {
        addWrappedText(
          `Both pulse width (${maxPw.toFixed(2)}ms) and timing (${maxTiming.toFixed(1)}°) are elevated${railAtMaxPw > 0 ? ` at ${Math.round(railAtMaxPw).toLocaleString()} PSI rail pressure` : ''}. High pulse width means wide spray patterns hitting the piston bowl walls, and high timing increases cylinder pressure — together, that's hard on the pistons and bottom end. The injectors themselves are fine; it's the downstream effect that matters. This is the big injector argument: matched injectors deliver the same fuel in less time with tighter spray patterns, reducing piston loading. OK for 1/4 mile bursts, but if you're doing this regularly, size your injectors to your target HP.`,
          8, 'italic', AMBER, 1.3,
        );
      } else if (maxPw > spicyThreshold && maxTiming > 25 && isLowPressure) {
        addWrappedText(
          `Pulse width (${maxPw.toFixed(2)}ms) and timing (${maxTiming.toFixed(1)}°) are both elevated, but rail pressure at peak PW was only ${Math.round(railAtMaxPw).toLocaleString()} PSI. At this lower pressure, the actual fuel volume per millisecond is significantly less than at full rail pressure — so while the duration is long, the piston loading and spray pattern impact are moderated. This is a different severity level than the same PW at ${isPiezo ? '25,000+' : '20,000+'} PSI.`,
          8, 'italic', TEXT_BODY, 1.3,
        );
      }
    }

    // ECU context for injector/timing
    if (hasInjector) {
      const maxPw = Math.max(...data.injectorPulseWidth.filter(v => v > 0));
      const spicyThreshold = isPiezo ? 1.5 : 2.5;
      if (maxPw > spicyThreshold * 0.8) {
        renderEcuContextBox('injector_pulse_high', doc, margin, contentWidth, checkBreak, getY, setY);
      }
    }
    if (hasTiming) {
      const maxTiming = Math.max(...data.injectionTiming.filter(v => v > 0));
      if (maxTiming > 22) {
        renderEcuContextBox('timing_aggressive', doc, margin, contentWidth, checkBreak, getY, setY);
      }
    }

    setY(getY() + 3);
  }

  // ── 2. DESIRED vs ACTUAL BOOST + VANE POSITION ────────────────────────────
  if (hasDesiredBoost || hasVane) {
    checkBreak(65);

    const boostSeries: CorrelatedSeries[] = [];
    if (data.boost.some(v => v > 0)) {
      boostSeries.push({
        data: data.boost,
        label: 'Actual Boost',
        unit: 'PSI',
        color: GREEN,
      });
    }
    if (hasDesiredBoost) {
      boostSeries.push({
        data: data.boostDesired,
        label: 'Desired Boost',
        unit: 'PSI',
        color: BLUE,
        dashed: true,
      });
    }
    if (hasVane) {
      boostSeries.push({
        data: data.turboVanePosition,
        label: 'Vane Position',
        unit: '%',
        color: PURPLE,
      });
    }

    if (boostSeries.length >= 2) {
      const newY = drawCorrelatedGraph(
        doc, margin, getY(), contentWidth, 55,
        { title: 'DESIRED vs ACTUAL BOOST + VANE POSITION', series: boostSeries, speedData: speedRef, rpmData: rpmRef },
        margin, contentWidth,
      );
      setY(newY);

      const boostVaneResult = getBoostVaneAnalysis(
        data.boost, data.boostDesired, data.turboVanePosition,
        data.turboVaneDesired, data.rpm, data.maf,
      );
      if (boostVaneResult.commentary) {
        const commentColor: [number, number, number] = boostVaneResult.leakSuspected ? PPEI_RED : TEXT_BODY;
        addWrappedText(boostVaneResult.commentary, 8, boostVaneResult.leakSuspected ? 'bold' : 'normal', commentColor, 1.3);
      }

      // ECU context for boost deviation
      if (hasDesiredBoost && data.boost.some(v => v > 0)) {
        const boostDiffs = data.boost.map((v, i) => Math.abs(v - (data.boostDesired[i] || 0))).filter(v => v > 3);
        if (boostDiffs.length > data.boost.length * 0.15) {
          renderEcuContextBox('boost_deviation', doc, margin, contentWidth, checkBreak, getY, setY);
        }
      }
      if (boostVaneResult.leakSuspected) {
        renderEcuContextBox('low_boost', doc, margin, contentWidth, checkBreak, getY, setY);
      }

      // Vane desired vs actual
      if (hasVane && hasVaneDesired) {
        checkBreak(60);
        const vaneSeries: CorrelatedSeries[] = [
          { data: data.turboVanePosition, label: 'Actual Vane', unit: '%', color: PURPLE },
          { data: data.turboVaneDesired, label: 'Desired Vane', unit: '%', color: TEAL, dashed: true },
        ];
        const vaneY = drawCorrelatedGraph(
          doc, margin, getY(), contentWidth, 50,
          { title: 'VANE POSITION: DESIRED vs ACTUAL', series: vaneSeries, speedData: speedRef, rpmData: rpmRef },
          margin, contentWidth,
        );
        setY(vaneY);
        addWrappedText(
          'This graph shows how well the variable geometry turbo (VGT) vane actuator is tracking the ECM\'s commands. When actual trails desired significantly, the actuator may be slow, sticking, or fighting soot buildup. A healthy VGT should track desired position within a few percent during steady-state operation.',
          8, 'normal', [100, 100, 110], 1.3,
        );
      }

      setY(getY() + 3);
    }
  }

  // ── 3. DESIRED vs ACTUAL RAIL PRESSURE + PCV ─────────────────────────────
  if (hasDesiredRail || hasPcv) {
    checkBreak(65);

    const railSeries: CorrelatedSeries[] = [];
    if (hasRealData(data.railPressureActual)) {
      railSeries.push({
        data: data.railPressureActual,
        label: 'Actual Rail',
        unit: 'PSI',
        color: PPEI_RED,
      });
    }
    if (hasDesiredRail) {
      railSeries.push({
        data: data.railPressureDesired,
        label: 'Desired Rail',
        unit: 'PSI',
        color: BLUE,
        dashed: true,
      });
    }
    if (hasPcv) {
      railSeries.push({
        data: data.pcvDutyCycle,
        label: 'PCV Current',
        unit: 'mA',
        color: AMBER,
      });
    }

    if (railSeries.length >= 2) {
      const newY = drawCorrelatedGraph(
        doc, margin, getY(), contentWidth, 55,
        { title: 'DESIRED vs ACTUAL FUEL RAIL PRESSURE + PCV', series: railSeries, speedData: speedRef, rpmData: rpmRef },
        margin, contentWidth,
      );
      setY(newY);

      const railResult = getRailPressureAnalysis(
        data.railPressureActual, data.railPressureDesired,
        data.pcvDutyCycle, oemPeakRail,
      );
      if (railResult.commentary) {
        addWrappedText(railResult.commentary, 8, 'normal', TEXT_BODY, 1.3);
      }

      // ECU context for rail pressure
      if (hasRealData(data.railPressureActual)) {
        const maxRail = Math.max(...data.railPressureActual.filter(v => v > 0));
        if (maxRail > oemPeakRail + 2000) {
          renderEcuContextBox('rail_pressure_high', doc, margin, contentWidth, checkBreak, getY, setY);
        }
        // Check for hunting
        const railDiffs: number[] = [];
        const railValid = data.railPressureActual.filter(v => v > 5000);
        for (let i = 1; i < railValid.length; i++) {
          railDiffs.push(Math.abs(railValid[i] - railValid[i - 1]));
        }
        const avgDiff = railDiffs.length > 0 ? railDiffs.reduce((a, b) => a + b, 0) / railDiffs.length : 0;
        if (avgDiff > 800) {
          renderEcuContextBox('rail_pressure_hunting', doc, margin, contentWidth, checkBreak, getY, setY);
        }
      }
      if (hasPcv) {
        const maxPcv = Math.max(...data.pcvDutyCycle.filter(v => v > 0));
        if (maxPcv > 90) {
          renderEcuContextBox('pcv_maxed', doc, margin, contentWidth, checkBreak, getY, setY);
        }
      }

      setY(getY() + 3);
    }
  }

  // ── 4. BOOST vs MAF vs VANE (Leak Detection) ─────────────────────────────
  if (hasMaf && hasVane && data.boost.some(v => v > 0)) {
    checkBreak(65);

    const leakSeries: CorrelatedSeries[] = [
      { data: data.boost, label: 'Boost', unit: 'PSI', color: GREEN },
      { data: data.maf, label: 'MAF', unit: 'lb/min', color: ORANGE },
      { data: data.turboVanePosition, label: 'Vane', unit: '%', color: PURPLE },
    ];

    const newY = drawCorrelatedGraph(
      doc, margin, getY(), contentWidth, 55,
      { title: 'BOOST vs MAF vs VANE POSITION (Leak Detection)', series: leakSeries, speedData: speedRef, rpmData: rpmRef },
      margin, contentWidth,
    );
    setY(newY);

    addWrappedText(
      'This correlation view is the boost leak detector. In a healthy system, when the vane closes past 45% and MAF is high at 2900+ RPM, boost should be above 33 PSI. If you see high airflow and aggressive vane position but low boost, air is escaping somewhere between the turbo and the intake manifold — or the tune may need revision. Check intercooler boots, charge pipe clamps, and the hot-side pipe for leaks.',
      8, 'normal', [100, 100, 110], 1.3,
    );

    setY(getY() + 3);
  }

  // ── Boost leak ECU context ────────────────────────────────────────────────
  // (Rendered after the boost/MAF/vane graph if leak is suspected)

  // ── 5. MANIFOLD AIR DENSITY (MAD) ────────────────────────────────────────
  if (data.boost.some(v => v > 0) && hasIat) {
    const madResult = getMADAnalysis(data.boost, data.intakeAirTemp, data.barometricPressure);

    if (madResult.madValues.length > 10) {
      checkBreak(65);

      const madSeries: CorrelatedSeries[] = [
        { data: madResult.madValues, label: 'MAD Index', unit: '', color: TEAL },
      ];
      if (hasRealData(data.intakeAirTemp)) {
        madSeries.push({
          data: data.intakeAirTemp,
          label: 'Intake Air Temp',
          unit: '°F',
          color: ORANGE,
          dashed: true,
        });
      }

      const newY = drawCorrelatedGraph(
        doc, margin, getY(), contentWidth, 55,
        { title: 'MANIFOLD AIR DENSITY (MAD)', series: madSeries, speedData: speedRef, rpmData: rpmRef },
        margin, contentWidth,
      );
      setY(newY);

      addWrappedText(madResult.commentary, 8, 'normal', TEXT_BODY, 1.3);
      setY(getY() + 3);
    }
  }

  // ── 6. BOOST AIR DENSITY ─────────────────────────────────────────────────
  if (hasMaf && data.boost.some(v => v > 0)) {
    const densityResult = getBoostAirDensityAnalysis(data.boost, data.maf, data.rpm);

    if (densityResult.densityValues.length > 10) {
      checkBreak(60);

      const densitySeries: CorrelatedSeries[] = [
        { data: densityResult.densityValues, label: 'Density Index', unit: '', color: BLUE },
      ];

      const newY = drawCorrelatedGraph(
        doc, margin, getY(), contentWidth, 50,
        { title: 'BOOST AIR DENSITY', series: densitySeries, speedData: speedRef, rpmData: rpmRef },
        margin, contentWidth,
      );
      setY(newY);

      addWrappedText(densityResult.commentary, 8, 'normal', TEXT_BODY, 1.3);
      setY(getY() + 3);
    }
  }

  // ── 7. CONVERTER STALL ANALYSIS ──────────────────────────────────────────
  if (hasRealData(data.converterSlip) && data.vehicleSpeed.length > 10) {
    const stallComment = getConverterStallAnalysis(data.converterSlip, data.rpm, data.vehicleSpeed);
    if (stallComment) {
      checkBreak(20);
      addWrappedText(stallComment, 8, 'normal', TEXT_BODY, 1.3);
      setY(getY() + 3);
    }
  }

  // ── EGT ECU context ──────────────────────────────────────────────────────
  if (hasRealData(data.exhaustGasTemp)) {
    const maxEgt = Math.max(...data.exhaustGasTemp.filter(v => v > 100));
    if (maxEgt > 1200) {
      renderEcuContextBox('high_egt', doc, margin, contentWidth, checkBreak, getY, setY);
    }
  }

  // ── TCC ECU context ──────────────────────────────────────────────────────
  if (hasRealData(data.converterSlip)) {
    const maxSlip = Math.max(...data.converterSlip.map(Math.abs));
    if (maxSlip > 100) {
      renderEcuContextBox('tcc_slip', doc, margin, contentWidth, checkBreak, getY, setY);
    }
  }

  // ── SUSTAINED HEAT WARNING ───────────────────────────────────────────────
  const egtValid = data.exhaustGasTemp.filter(v => v > 100);
  const coolantValid = data.coolantTemp.filter(v => v > 100);
  const transValid = data.transFluidTemp.filter(v => v > 100);

  let heatWarnings: string[] = [];

  if (egtValid.length > 50) {
    const highEgtCount = egtValid.filter(v => v > 1200).length;
    const highEgtPct = (highEgtCount / egtValid.length) * 100;
    if (highEgtPct > 15) {
      heatWarnings.push(`EGTs were above 1200°F for ${highEgtPct.toFixed(1)}% of the log.`);
    }
  }
  if (coolantValid.length > 50) {
    const highCoolant = coolantValid.filter(v => v > 220).length;
    if ((highCoolant / coolantValid.length) * 100 > 10) {
      heatWarnings.push(`Coolant was above 220°F for ${((highCoolant / coolantValid.length) * 100).toFixed(1)}% of the log.`);
    }
  }
  if (transValid.length > 50) {
    const highTrans = transValid.filter(v => v > 220).length;
    if ((highTrans / transValid.length) * 100 > 10) {
      heatWarnings.push(`Trans fluid was above 220°F for ${((highTrans / transValid.length) * 100).toFixed(1)}% of the log.`);
    }
  }

  if (heatWarnings.length > 0) {
    checkBreak(25);
    addText('SUSTAINED HEAT WARNING', 10, 'bold', PPEI_RED);
    addWrappedText(
      `${heatWarnings.join(' ')} Sustained high temperatures are the silent killer of diesel trucks. More horsepower means more heat — that's physics, not opinion. Don't sustain high temps for extended periods. If you're towing heavy or making repeated pulls, give the truck time to cool down. A good intercooler, properly functioning cooling system, and matched components go a long way toward keeping things alive.`,
      8, 'normal', TEXT_BODY, 1.3,
    );
    setY(getY() + 3);
  }

  return { hasContent };
}
