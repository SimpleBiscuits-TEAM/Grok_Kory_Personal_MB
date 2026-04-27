/**
 * InjectorTableComparison — Side-by-side heatmap comparison of stock vs.
 * modified injection duration tables with delta overlay and summary statistics.
 *
 * Three panels:
 *   1. STOCK heatmap (left)
 *   2. MODIFIED heatmap (right)
 *   3. DELTA overlay (below) — red = duration increased, green = decreased
 *
 * Color intensity is proportional to the duration value (cool→hot gradient)
 * so you can visually see the injection map shape at a glance.
 *
 * Summary stats: max change, avg change, affected cells, region analysis.
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  type EngineConfig,
  type PressureUnit,
  getPressureAxisInUnit,
} from '@/lib/duramaxInjectorData';
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Minus,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// ── Style tokens (shared with DieselInjectorFlowConverter) ─────────────────
const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};
const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgDark: 'oklch(0.08 0.004 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  purple: 'oklch(0.65 0.20 300)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
};

// ── Heatmap color functions ────────────────────────────────────────────────

/** 5-stop heatmap: deep navy → teal → emerald → amber → crimson */
function valueToHeatColor(value: number, min: number, max: number): string {
  if (value <= 0) return 'oklch(0.12 0.005 260)';
  const range = max - min || 1;
  const t = Math.max(0, Math.min(1, (value - min) / range));

  // 5 stops
  const stops = [
    { t: 0.0, l: 0.20, c: 0.08, h: 260 },  // deep navy
    { t: 0.25, l: 0.35, c: 0.12, h: 200 },  // teal
    { t: 0.50, l: 0.50, c: 0.16, h: 145 },  // emerald
    { t: 0.75, l: 0.65, c: 0.18, h: 60 },   // amber
    { t: 1.0, l: 0.52, c: 0.22, h: 25 },    // crimson
  ];

  let s0 = stops[0], s1 = stops[1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      s0 = stops[i];
      s1 = stops[i + 1];
      break;
    }
  }

  const localT = (t - s0.t) / (s1.t - s0.t || 1);
  const l = s0.l + (s1.l - s0.l) * localT;
  const c = s0.c + (s1.c - s0.c) * localT;
  const h = s0.h + (s1.h - s0.h) * localT;

  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/** Delta color: red for increase, green for decrease, intensity by magnitude */
function deltaToColor(delta: number, maxAbsDelta: number): string {
  if (delta === 0 || maxAbsDelta === 0) return 'transparent';
  const intensity = Math.min(1, Math.abs(delta) / maxAbsDelta);
  if (delta > 0) {
    // Red — duration increased
    const l = 0.20 + intensity * 0.32;
    const c = 0.05 + intensity * 0.17;
    return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 25)`;
  } else {
    // Green — duration decreased
    const l = 0.20 + intensity * 0.35;
    const c = 0.05 + intensity * 0.15;
    return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 145)`;
  }
}

/** Readable text color for a given background */
function textForBg(bgL: number): string {
  return bgL > 0.45 ? 'oklch(0.10 0.005 260)' : 'oklch(0.92 0.005 260)';
}

// ── Summary statistics ─────────────────────────────────────────────────────

interface ComparisonStats {
  totalCells: number;
  changedCells: number;
  unchangedCells: number;
  maxIncrease: number;
  maxDecrease: number;
  avgDelta: number;
  maxAbsDelta: number;
  /** Percentage of cells changed */
  changedPct: number;
  /** Region breakdown */
  idleRegion: { avgDelta: number; cells: number };
  midRegion: { avgDelta: number; cells: number };
  wotRegion: { avgDelta: number; cells: number };
}

function computeStats(
  stockTable: number[][],
  modifiedTable: number[][],
  quantityAxis: number[],
): ComparisonStats {
  let totalCells = 0;
  let changedCells = 0;
  let maxIncrease = 0;
  let maxDecrease = 0;
  let sumDelta = 0;
  let maxAbsDelta = 0;

  // Region accumulators
  const maxQty = Math.max(...quantityAxis);
  const idleThreshold = maxQty * 0.15;
  const wotThreshold = maxQty * 0.6;
  let idleSum = 0, idleCount = 0;
  let midSum = 0, midCount = 0;
  let wotSum = 0, wotCount = 0;

  for (let r = 0; r < stockTable.length && r < modifiedTable.length; r++) {
    const qty = quantityAxis[r] ?? 0;
    for (let c = 0; c < stockTable[r].length && c < modifiedTable[r].length; c++) {
      const stock = stockTable[r][c];
      const mod = modifiedTable[r][c];
      if (stock <= 0 && mod <= 0) continue;

      totalCells++;
      const delta = mod - stock;
      sumDelta += delta;

      if (Math.abs(delta) > 0.5) {
        changedCells++;
      }

      if (delta > maxIncrease) maxIncrease = delta;
      if (delta < maxDecrease) maxDecrease = delta;
      if (Math.abs(delta) > maxAbsDelta) maxAbsDelta = Math.abs(delta);

      // Region classification
      if (qty <= idleThreshold) {
        idleSum += delta;
        idleCount++;
      } else if (qty >= wotThreshold) {
        wotSum += delta;
        wotCount++;
      } else {
        midSum += delta;
        midCount++;
      }
    }
  }

  return {
    totalCells,
    changedCells,
    unchangedCells: totalCells - changedCells,
    maxIncrease,
    maxDecrease,
    avgDelta: totalCells > 0 ? sumDelta / totalCells : 0,
    maxAbsDelta,
    changedPct: totalCells > 0 ? (changedCells / totalCells) * 100 : 0,
    idleRegion: { avgDelta: idleCount > 0 ? idleSum / idleCount : 0, cells: idleCount },
    midRegion: { avgDelta: midCount > 0 ? midSum / midCount : 0, cells: midCount },
    wotRegion: { avgDelta: wotCount > 0 ? wotSum / wotCount : 0, cells: wotCount },
  };
}

// ── Props ──────────────────────────────────────────────────────────────────

interface InjectorTableComparisonProps {
  stockTable: number[][];
  modifiedTable: number[][];
  /** Optional OEM-matched table (before target fueling) */
  oemMatchedTable?: number[][];
  engine: EngineConfig;
  displayUnit: PressureUnit;
  injectorLabel: string;
  targetMm3?: number;
}

// ── Heatmap Table Sub-Component ────────────────────────────────────────────

function HeatmapTable({
  table,
  engine,
  displayUnit,
  label,
  globalMin,
  globalMax,
  scrollRef,
  onScroll,
  compact,
}: {
  table: number[][];
  engine: EngineConfig;
  displayUnit: PressureUnit;
  label: string;
  globalMin: number;
  globalMax: number;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  compact?: boolean;
}) {
  const pressureAxis = getPressureAxisInUnit(engine, displayUnit);
  const fontSize = compact ? '0.55rem' : '0.6rem';
  const cellPad = compact ? '2px 3px' : '3px 4px';
  const minW = compact ? '38px' : '44px';

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: '420px',
        border: `1px solid ${sColor.border}`,
        borderRadius: '4px',
      }}
    >
      <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{
              padding: cellPad, fontFamily: sFont.body, fontSize, fontWeight: 700,
              textAlign: 'center', background: sColor.bgDark, color: sColor.yellow,
              borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
              position: 'sticky', left: 0, top: 0, zIndex: 3, minWidth: '36px',
            }}>
              <span style={{ fontSize: '0.5rem', color: sColor.textMuted }}>{label}</span>
            </th>
            {pressureAxis.map((p, i) => (
              <th key={i} style={{
                padding: cellPad, fontFamily: sFont.body, fontSize: '0.55rem', fontWeight: 700,
                textAlign: 'center', background: sColor.bgCard, color: sColor.yellow,
                borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                position: 'sticky', top: 0, zIndex: 2, minWidth: minW,
              }}>
                {displayUnit === 'kPa' ? p.toFixed(0) : displayUnit === 'PSI' ? p.toFixed(0) : p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map((row, r) => (
            <tr key={r}>
              <td style={{
                padding: cellPad, fontFamily: sFont.body, fontSize, fontWeight: 700,
                textAlign: 'center', background: sColor.bgCard, color: sColor.green,
                borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                position: 'sticky', left: 0, zIndex: 1, minWidth: '36px',
              }}>
                {engine.quantityAxis[r]}
              </td>
              {row.map((val, c) => {
                const bg = valueToHeatColor(val, globalMin, globalMax);
                // Estimate lightness for text contrast
                const range = globalMax - globalMin || 1;
                const t = Math.max(0, Math.min(1, (val - globalMin) / range));
                const bgL = t < 0.5 ? 0.2 + t * 0.6 : 0.5 + (t - 0.5) * 0.04;
                return (
                  <td
                    key={c}
                    style={{
                      padding: cellPad, fontFamily: sFont.mono, fontSize,
                      textAlign: 'right', background: bg,
                      color: val <= 0 ? sColor.textMuted : textForBg(bgL),
                      borderRight: `1px solid oklch(0.15 0.005 260 / 0.3)`,
                      borderBottom: `1px solid oklch(0.15 0.005 260 / 0.3)`,
                      minWidth: minW, whiteSpace: 'nowrap',
                    }}
                    title={`${val.toFixed(1)} µs @ ${pressureAxis[c]} ${displayUnit}, ${engine.quantityAxis[r]} mm³`}
                  >
                    {val <= 0 ? '0' : val.toFixed(0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Delta Heatmap ──────────────────────────────────────────────────────────

function DeltaHeatmap({
  stockTable,
  modifiedTable,
  engine,
  displayUnit,
  maxAbsDelta,
  scrollRef,
  onScroll,
  compact,
}: {
  stockTable: number[][];
  modifiedTable: number[][];
  engine: EngineConfig;
  displayUnit: PressureUnit;
  maxAbsDelta: number;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  compact?: boolean;
}) {
  const pressureAxis = getPressureAxisInUnit(engine, displayUnit);
  const fontSize = compact ? '0.55rem' : '0.6rem';
  const cellPad = compact ? '2px 3px' : '3px 4px';
  const minW = compact ? '38px' : '44px';

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{
        overflowX: 'auto',
        overflowY: 'auto',
        maxHeight: '420px',
        border: `1px solid ${sColor.border}`,
        borderRadius: '4px',
      }}
    >
      <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{
              padding: cellPad, fontFamily: sFont.body, fontSize, fontWeight: 700,
              textAlign: 'center', background: sColor.bgDark, color: sColor.yellow,
              borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
              position: 'sticky', left: 0, top: 0, zIndex: 3, minWidth: '36px',
            }}>
              <span style={{ fontSize: '0.5rem', color: sColor.textMuted }}>Δ µs</span>
            </th>
            {pressureAxis.map((p, i) => (
              <th key={i} style={{
                padding: cellPad, fontFamily: sFont.body, fontSize: '0.55rem', fontWeight: 700,
                textAlign: 'center', background: sColor.bgCard, color: sColor.yellow,
                borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                position: 'sticky', top: 0, zIndex: 2, minWidth: minW,
              }}>
                {displayUnit === 'kPa' ? p.toFixed(0) : displayUnit === 'PSI' ? p.toFixed(0) : p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stockTable.map((row, r) => (
            <tr key={r}>
              <td style={{
                padding: cellPad, fontFamily: sFont.body, fontSize, fontWeight: 700,
                textAlign: 'center', background: sColor.bgCard, color: sColor.green,
                borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                position: 'sticky', left: 0, zIndex: 1, minWidth: '36px',
              }}>
                {engine.quantityAxis[r]}
              </td>
              {row.map((stockVal, c) => {
                const modVal = modifiedTable[r]?.[c] ?? 0;
                const delta = modVal - stockVal;
                const bg = (stockVal <= 0 && modVal <= 0) ? 'transparent' : deltaToColor(delta, maxAbsDelta);
                const txtColor = stockVal <= 0 && modVal <= 0
                  ? sColor.textMuted
                  : delta > 0 ? sColor.red : delta < 0 ? sColor.green : sColor.textDim;
                return (
                  <td
                    key={c}
                    style={{
                      padding: cellPad, fontFamily: sFont.mono, fontSize,
                      textAlign: 'right', background: bg, color: txtColor,
                      borderRight: `1px solid oklch(0.15 0.005 260 / 0.3)`,
                      borderBottom: `1px solid oklch(0.15 0.005 260 / 0.3)`,
                      minWidth: minW, whiteSpace: 'nowrap',
                    }}
                    title={`Stock: ${stockVal.toFixed(1)} → Modified: ${modVal.toFixed(1)} | Δ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} µs (${stockVal > 0 ? ((delta / stockVal) * 100).toFixed(1) : '—'}%)`}
                  >
                    {stockVal <= 0 && modVal <= 0 ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, subtext, color }: {
  label: string;
  value: string;
  subtext?: string;
  color: string;
}) {
  return (
    <div style={{
      padding: '10px 14px', background: sColor.bgDark, border: `1px solid ${sColor.border}`,
      borderRadius: '4px', flex: '1 1 140px', minWidth: '130px',
    }}>
      <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, letterSpacing: '0.05em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontFamily: sFont.mono, fontSize: '1.1rem', fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </div>
      {subtext && (
        <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim, marginTop: '2px' }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

// ── Region Bar ─────────────────────────────────────────────────────────────

function RegionBar({ label, avgDelta, cells, maxAbsDelta }: {
  label: string;
  avgDelta: number;
  cells: number;
  maxAbsDelta: number;
}) {
  const barWidth = maxAbsDelta > 0 ? Math.min(100, (Math.abs(avgDelta) / maxAbsDelta) * 100) : 0;
  const isPositive = avgDelta >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
      <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim, width: '80px', textAlign: 'right', flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '16px', background: 'oklch(0.14 0.005 260)', borderRadius: '2px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          [isPositive ? 'left' : 'right']: '50%',
          top: 0, bottom: 0,
          width: `${barWidth / 2}%`,
          background: isPositive ? 'oklch(0.42 0.18 25 / 0.7)' : 'oklch(0.50 0.16 145 / 0.7)',
          borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
        {/* Center line */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: '1px', background: sColor.textMuted,
        }} />
      </div>
      <span style={{
        fontFamily: sFont.mono, fontSize: '0.7rem', width: '90px', textAlign: 'right', flexShrink: 0,
        color: isPositive ? sColor.red : sColor.green,
      }}>
        {avgDelta >= 0 ? '+' : ''}{avgDelta.toFixed(1)} µs
      </span>
      <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, width: '50px', textAlign: 'right', flexShrink: 0 }}>
        {cells} cells
      </span>
    </div>
  );
}

// ── Gradient Legend ─────────────────────────────────────────────────────────

function HeatLegend({ min, max, type }: { min: number; max: number; type: 'heat' | 'delta' }) {
  const steps = 20;
  const colors: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (type === 'heat') {
      colors.push(valueToHeatColor(min + t * (max - min), min, max));
    } else {
      const delta = -max + t * (max * 2);
      colors.push(deltaToColor(delta, max));
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
      <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
        {type === 'heat' ? `${min.toFixed(0)}` : `−${max.toFixed(0)}`}
      </span>
      <div style={{
        display: 'flex', flex: 1, height: '10px', borderRadius: '2px', overflow: 'hidden',
        border: `1px solid ${sColor.borderLight}`,
      }}>
        {colors.map((c, i) => (
          <div key={i} style={{ flex: 1, background: c }} />
        ))}
      </div>
      <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
        {type === 'heat' ? `${max.toFixed(0)} µs` : `+${max.toFixed(0)} µs`}
      </span>
    </div>
  );
}

// ── Pressure-Slice Line Chart (canvas) ─────────────────────────────────────

function PressureSliceChart({
  stockTable,
  modifiedTable,
  engine,
  displayUnit,
  selectedCol,
}: {
  stockTable: number[][];
  modifiedTable: number[][];
  engine: EngineConfig;
  displayUnit: PressureUnit;
  selectedCol: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressureAxis = getPressureAxisInUnit(engine, displayUnit);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || selectedCol === null) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 20, right: 16, bottom: 30, left: 50 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    // Data
    const qAxis = engine.quantityAxis;
    const stockSlice = stockTable.map(row => row[selectedCol] ?? 0);
    const modSlice = modifiedTable.map(row => row[selectedCol] ?? 0);
    const allVals = [...stockSlice, ...modSlice].filter(v => v > 0);
    if (allVals.length === 0) return;

    const maxVal = Math.max(...allVals) * 1.1;
    const minVal = 0;
    const maxQ = Math.max(...qAxis);

    const toX = (q: number) => pad.left + (q / maxQ) * plotW;
    const toY = (v: number) => pad.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

    // Grid
    ctx.strokeStyle = 'oklch(0.22 0.005 260)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
    }

    // Draw lines
    function drawLine(slice: number[], color: string, dash: number[]) {
      if (!ctx) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < qAxis.length; i++) {
        if (slice[i] <= 0) continue;
        const x = toX(qAxis[i]);
        const y = toY(slice[i]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawLine(stockSlice, 'oklch(0.58 0.008 260)', [4, 4]);
    drawLine(modSlice, 'oklch(0.65 0.20 145)', []);

    // Labels
    ctx.fillStyle = 'oklch(0.58 0.008 260)';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`mm³/stroke →`, pad.left + plotW / 2, H - 4);
    ctx.textAlign = 'right';
    ctx.fillText('µs', pad.left - 6, pad.top + 4);

    // Y-axis values
    ctx.fillStyle = 'oklch(0.50 0.008 260)';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = minVal + ((maxVal - minVal) / 4) * (4 - i);
      const y = pad.top + (plotH / 4) * i;
      ctx.fillText(val.toFixed(0), pad.left - 6, y + 4);
    }

    // Title
    ctx.fillStyle = 'oklch(0.75 0.18 60)';
    ctx.font = 'bold 11px "Rajdhani", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Duration @ ${pressureAxis[selectedCol]?.toFixed(0) ?? '?'} ${displayUnit}`,
      pad.left + plotW / 2, 14,
    );

    // Legend
    ctx.fillStyle = 'oklch(0.58 0.008 260)';
    ctx.font = '9px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(W - 120, 10); ctx.lineTo(W - 100, 10); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText('Stock', W - 96, 13);
    ctx.strokeStyle = 'oklch(0.65 0.20 145)';
    ctx.beginPath(); ctx.moveTo(W - 120, 22); ctx.lineTo(W - 100, 22); ctx.stroke();
    ctx.fillStyle = 'oklch(0.65 0.20 145)';
    ctx.fillText('Modified', W - 96, 25);

  }, [stockTable, modifiedTable, engine, displayUnit, selectedCol]);

  if (selectedCol === null) {
    return (
      <div style={{
        padding: '20px', textAlign: 'center', fontFamily: sFont.body, fontSize: '0.8rem',
        color: sColor.textMuted, border: `1px dashed ${sColor.border}`, borderRadius: '4px',
      }}>
        Click a pressure column header in any table above to see a line chart comparison at that pressure.
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={200}
      style={{ width: '100%', maxWidth: '600px', height: 'auto', borderRadius: '4px', border: `1px solid ${sColor.border}` }}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function InjectorTableComparison({
  stockTable,
  modifiedTable,
  oemMatchedTable,
  engine,
  displayUnit,
  injectorLabel,
  targetMm3,
}: InjectorTableComparisonProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'delta' | 'overlay'>('side-by-side');
  const [expanded, setExpanded] = useState(false);
  const [selectedPressureCol, setSelectedPressureCol] = useState<number | null>(null);

  // Synchronized scrolling refs
  const stockScrollRef = useRef<HTMLDivElement>(null);
  const modScrollRef = useRef<HTMLDivElement>(null);
  const deltaScrollRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);

  const handleSyncScroll = (source: 'stock' | 'mod' | 'delta') => (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollingRef.current) return;
    scrollingRef.current = true;
    const target = e.currentTarget;
    const refs = [
      source !== 'stock' ? stockScrollRef : null,
      source !== 'mod' ? modScrollRef : null,
      source !== 'delta' ? deltaScrollRef : null,
    ].filter(Boolean);
    refs.forEach(ref => {
      if (ref?.current) {
        ref.current.scrollTop = target.scrollTop;
        ref.current.scrollLeft = target.scrollLeft;
      }
    });
    requestAnimationFrame(() => { scrollingRef.current = false; });
  };

  // Compute global min/max for consistent heatmap coloring
  const { globalMin, globalMax } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    const tables = [stockTable, modifiedTable];
    if (oemMatchedTable) tables.push(oemMatchedTable);
    for (const tbl of tables) {
      for (const row of tbl) {
        for (const val of row) {
          if (val > 0) {
            if (val < min) min = val;
            if (val > max) max = val;
          }
        }
      }
    }
    return { globalMin: min === Infinity ? 0 : min, globalMax: max === -Infinity ? 1 : max };
  }, [stockTable, modifiedTable, oemMatchedTable]);

  // Compute stats
  const stats = useMemo(
    () => computeStats(stockTable, modifiedTable, engine.quantityAxis),
    [stockTable, modifiedTable, engine.quantityAxis],
  );

  const pressureAxis = getPressureAxisInUnit(engine, displayUnit);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Header / View Toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {([
            { id: 'side-by-side' as const, label: 'SIDE-BY-SIDE' },
            { id: 'delta' as const, label: 'DELTA HEATMAP' },
            { id: 'overlay' as const, label: 'LINE CHART' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              style={{
                padding: '5px 12px', fontFamily: sFont.body, fontSize: '0.72rem', fontWeight: 700,
                letterSpacing: '0.04em',
                border: `1px solid ${viewMode === tab.id ? sColor.blue : sColor.border}`,
                borderRadius: '3px', cursor: 'pointer',
                background: viewMode === tab.id ? 'oklch(0.70 0.18 200 / 0.12)' : 'transparent',
                color: viewMode === tab.id ? sColor.blue : sColor.textDim,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '4px 10px', fontFamily: sFont.mono, fontSize: '0.65rem',
            border: `1px solid ${sColor.border}`, borderRadius: '3px',
            cursor: 'pointer', background: 'transparent', color: sColor.textDim,
          }}
        >
          {expanded ? <Minimize2 style={{ width: 12, height: 12 }} /> : <Maximize2 style={{ width: 12, height: 12 }} />}
          {expanded ? 'COMPACT' : 'EXPAND'}
        </button>
      </div>

      {/* ── Summary Stats Cards ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <StatCard
          label="CELLS CHANGED"
          value={`${stats.changedCells} / ${stats.totalCells}`}
          subtext={`${stats.changedPct.toFixed(1)}% of table`}
          color={sColor.blue}
        />
        <StatCard
          label="MAX INCREASE"
          value={stats.maxIncrease > 0 ? `+${stats.maxIncrease.toFixed(1)} µs` : '—'}
          color={sColor.red}
        />
        <StatCard
          label="MAX DECREASE"
          value={stats.maxDecrease < 0 ? `${stats.maxDecrease.toFixed(1)} µs` : '—'}
          color={sColor.green}
        />
        <StatCard
          label="AVG DELTA"
          value={`${stats.avgDelta >= 0 ? '+' : ''}${stats.avgDelta.toFixed(1)} µs`}
          color={stats.avgDelta >= 0 ? sColor.yellow : sColor.green}
        />
        {targetMm3 && (
          <StatCard
            label="TARGET FUELING"
            value={`${targetMm3} mm³`}
            subtext={`Stock max: ${Math.max(...engine.quantityAxis).toFixed(0)} mm³`}
            color={sColor.purple}
          />
        )}
      </div>

      {/* ── Region Breakdown ── */}
      <div style={{
        padding: '10px 14px', background: sColor.bgDark, border: `1px solid ${sColor.border}`,
        borderRadius: '4px',
      }}>
        <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textMuted, marginBottom: '8px', letterSpacing: '0.05em' }}>
          REGION ANALYSIS
        </div>
        <RegionBar label="IDLE" avgDelta={stats.idleRegion.avgDelta} cells={stats.idleRegion.cells} maxAbsDelta={stats.maxAbsDelta} />
        <RegionBar label="MID-RANGE" avgDelta={stats.midRegion.avgDelta} cells={stats.midRegion.cells} maxAbsDelta={stats.maxAbsDelta} />
        <RegionBar label="WOT / FULL" avgDelta={stats.wotRegion.avgDelta} cells={stats.wotRegion.cells} maxAbsDelta={stats.maxAbsDelta} />
      </div>

      {/* ── Side-by-Side View ── */}
      {viewMode === 'side-by-side' && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: expanded ? '1fr' : '1fr 1fr',
            gap: '8px',
          }}>
            {/* Stock */}
            <div>
              <div style={{
                fontFamily: sFont.body, fontSize: '0.8rem', fontWeight: 700, color: sColor.textMuted,
                marginBottom: '4px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <Minus style={{ width: 14, height: 14 }} />
                STOCK OEM — {engine.name}
              </div>
              <HeatmapTable
                table={stockTable}
                engine={engine}
                displayUnit={displayUnit}
                label="STOCK"
                globalMin={globalMin}
                globalMax={globalMax}
                scrollRef={stockScrollRef}
                onScroll={handleSyncScroll('stock')}
                compact={!expanded}
              />
            </div>

            {/* Modified */}
            <div>
              <div style={{
                fontFamily: sFont.body, fontSize: '0.8rem', fontWeight: 700, color: sColor.green,
                marginBottom: '4px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <ArrowRight style={{ width: 14, height: 14 }} />
                {injectorLabel || 'MODIFIED'} {targetMm3 ? `(TARGET ${targetMm3}mm³)` : ''}
              </div>
              <HeatmapTable
                table={modifiedTable}
                engine={engine}
                displayUnit={displayUnit}
                label="MODIFIED"
                globalMin={globalMin}
                globalMax={globalMax}
                scrollRef={modScrollRef}
                onScroll={handleSyncScroll('mod')}
                compact={!expanded}
              />
            </div>
          </div>

          {/* Shared legend */}
          <HeatLegend min={globalMin} max={globalMax} type="heat" />
        </div>
      )}

      {/* ── Delta Heatmap View ── */}
      {viewMode === 'delta' && (
        <div>
          <div style={{
            fontFamily: sFont.body, fontSize: '0.8rem', fontWeight: 700, color: sColor.yellow,
            marginBottom: '4px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <BarChart3 style={{ width: 14, height: 14 }} />
            DELTA — Modified vs. Stock (µs difference)
          </div>
          <DeltaHeatmap
            stockTable={stockTable}
            modifiedTable={modifiedTable}
            engine={engine}
            displayUnit={displayUnit}
            maxAbsDelta={stats.maxAbsDelta}
            scrollRef={deltaScrollRef}
            onScroll={handleSyncScroll('delta')}
            compact={!expanded}
          />
          <HeatLegend min={0} max={stats.maxAbsDelta} type="delta" />
          <div style={{ marginTop: '6px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp style={{ width: 12, height: 12, color: sColor.red }} />
              <span style={{ color: sColor.red }}>Red = Duration increased (longer pulse)</span>
            </span>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingDown style={{ width: 12, height: 12, color: sColor.green }} />
              <span style={{ color: sColor.green }}>Green = Duration decreased (shorter pulse)</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Line Chart View ── */}
      {viewMode === 'overlay' && (
        <div>
          <div style={{
            fontFamily: sFont.body, fontSize: '0.8rem', fontWeight: 700, color: sColor.purple,
            marginBottom: '8px', letterSpacing: '0.05em',
          }}>
            PRESSURE-SLICE LINE COMPARISON
          </div>

          {/* Pressure column selector */}
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {pressureAxis.map((p, i) => (
              <button
                key={i}
                onClick={() => setSelectedPressureCol(i)}
                style={{
                  padding: '3px 8px', fontFamily: sFont.mono, fontSize: '0.6rem',
                  border: `1px solid ${selectedPressureCol === i ? sColor.purple : sColor.borderLight}`,
                  borderRadius: '2px', cursor: 'pointer',
                  background: selectedPressureCol === i ? 'oklch(0.65 0.20 300 / 0.15)' : 'transparent',
                  color: selectedPressureCol === i ? sColor.purple : sColor.textMuted,
                }}
              >
                {displayUnit === 'kPa' ? p.toFixed(0) : displayUnit === 'PSI' ? p.toFixed(0) : p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)}
              </button>
            ))}
          </div>

          <PressureSliceChart
            stockTable={stockTable}
            modifiedTable={modifiedTable}
            engine={engine}
            displayUnit={displayUnit}
            selectedCol={selectedPressureCol}
          />
        </div>
      )}
    </div>
  );
}
