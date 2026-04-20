/**
 * TalonLogViewer — HPTuners VCM Scanner / Dynojet hybrid log viewer
 *
 * Layout:
 *   ┌──────────────┬─────────────────────────────────────────────────┐
 *   │  CHANNELS    │  Section 1: up to 4 channels (RPM, Speed, ECT) │
 *   │  (left panel)│─────────────────────────────────────────────────│
 *   │  Name  Value │  Section 2: up to 4 channels (TPS, MAP, IAT)   │
 *   │  ──────────  │─────────────────────────────────────────────────│
 *   │  Engine RPM  │  Section 3: up to 4 channels (AFR1, AFR2)      │
 *   │  7,053 rpm   │─────────────────────────────────────────────────│
 *   │  Throttle    │  Section 4: up to 4 channels (IPW, Spark, STFT)│
 *   │  78.5 %      │─────────────────────────────────────────────────│
 *   │  ...         │  [Zoom minimap / time axis]                     │
 *   └──────────────┴─────────────────────────────────────────────────┘
 *
 * Features:
 *   - 4 stacked chart sections, each with up to 4 overlaid channels
 *   - Left panel shows all channels with live values at cursor position
 *   - Synced vertical crosshair across all 4 sections
 *   - Per-channel color coding with left/right Y-axis labels
 *   - Mouse wheel zoom + drag pan, synced across all sections
 *   - Channel assignment: click channel in left panel to add to active section
 *   - Dark theme inspired by HPTuners VCM Scanner
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Download, X, ChevronDown, ChevronRight, Search, Maximize2, Minimize2, Zap } from 'lucide-react';
import { WP8ParseResult, WP8Channel, getHondaTalonKeyChannels, wp8ToCSV } from '@/lib/wp8Parser';

// ─── Theme: HPTuners VCM Scanner dark blue ──────────────────────────────────
const T = {
  bg: '#0a0e1a',
  panelBg: '#0d1220',
  sectionBg: '#0a0e1a',
  gridLine: 'rgba(40, 60, 100, 0.35)',
  crosshair: 'rgba(200, 200, 200, 0.6)',
  border: '#1a2540',
  borderLight: '#243050',
  headerBg: '#0f1628',
  text: '#c8d0e0',
  textDim: '#5a6a8a',
  textBright: '#e8edf5',
  accent: '#3b82f6',
  accentDim: '#1e3a6e',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  cyan: '#06b6d4',
  white: '#ffffff',
};

// Channel trace colors (HPTuners style — vivid on dark)
const TRACE_COLORS = [
  '#ef4444', // red
  '#22c55e', // green
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#8b5cf6', // violet
  '#f43f5e', // rose
  '#84cc16', // lime
  '#0ea5e9', // sky
];

const FONT = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", "Consolas", monospace',
};

// ─── Section config ─────────────────────────────────────────────────────────
interface SectionConfig {
  id: number;
  channelIndices: number[];  // up to 4
  label: string;
}

const DEFAULT_SECTION_LABELS = ['Section 1', 'Section 2', 'Section 3', 'Section 4'];

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatValue(val: number, name: string): string {
  if (!Number.isFinite(val)) return '—';
  // Smart formatting based on channel name
  const n = name.toLowerCase();
  if (n.includes('rpm') || n.includes('speed') || n.includes('shaft')) return val.toFixed(0);
  if (n.includes('temperature') || n.includes('temp')) return val.toFixed(1);
  if (n.includes('pressure') || n.includes('map') || n.includes('baro')) return val.toFixed(1);
  if (n.includes('voltage') || n.includes('module')) return val.toFixed(2);
  if (n.includes('ratio') || n.includes('afr') || n.includes('lambda') || n.includes('alpha')) return val.toFixed(3);
  if (n.includes('duty') || n.includes('trim') || n.includes('throttle') || n.includes('position')) return val.toFixed(1);
  if (n.includes('pulse') || n.includes('width')) return val.toFixed(3);
  if (n.includes('timing') || n.includes('angle') || n.includes('ignition') || n.includes('spark')) return val.toFixed(1);
  if (n.includes('gear') || n.includes('commanded') || n.includes('status') || n.includes('launch')) return val.toFixed(0);
  if (n.includes('slip')) return val.toFixed(0);
  if (Math.abs(val) < 10) return val.toFixed(2);
  if (Math.abs(val) < 1000) return val.toFixed(1);
  return val.toFixed(0);
}

function getUnit(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('rpm') || n.includes('engine speed')) return 'rpm';
  if (n.includes('vehicle speed')) return 'mph';
  if (n.includes('shaft speed')) return 'rpm';
  if (n.includes('temperature') || n.includes('temp')) return '°F';
  if (n.includes('manifold') && n.includes('pressure')) return 'kPa';
  if (n.includes('baro') && n.includes('pressure')) return 'kPa';
  if (n.includes('clutch') && n.includes('pressure')) return 'kPa';
  if (n.includes('line pressure')) return 'kPa';
  if (n.includes('voltage') || n.includes('sensor voltage')) return 'V';
  if (n.includes('module voltage')) return 'V';
  if (n.includes('air fuel ratio') || n.includes('afr')) return 'λ';
  if (n === 'lambda 1' || n === 'lambda 2') return 'λ';
  if (n.includes('alpha')) return '';
  if (n.includes('throttle') || n.includes('duty cycle') || n.includes('trim')) return '%';
  if (n.includes('pulse') || n.includes('width')) return 'ms';
  if (n.includes('timing') || n.includes('angle') || n.includes('ignition') || n.includes('spark')) return '°';
  if (n.includes('gear') || n.includes('commanded gear')) return '';
  if (n.includes('slip')) return 'rpm';
  if (n.includes('launch')) return '';
  return '';
}

function getChannelColor(sectionIdx: number, channelSlot: number): string {
  return TRACE_COLORS[(sectionIdx * 4 + channelSlot) % TRACE_COLORS.length];
}

/**
 * Draw text with a dark background pill for readability over chart lines.
 * Returns the measured text width for layout purposes.
 */
function drawLabelWithBg(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign = 'left',
  fontSize = 11,
  paddingH = 4,
  paddingV = 3,
): number {
  ctx.font = `bold ${fontSize}px ${FONT.mono}`;
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const th = fontSize;
  // Compute box x based on alignment
  let bx = x - paddingH;
  if (align === 'right') bx = x - tw - paddingH;
  else if (align === 'center') bx = x - tw / 2 - paddingH;
  const by = y - th + 1 - paddingV;
  const bw = tw + paddingH * 2;
  const bh = th + paddingV * 2;
  // Dark background pill
  ctx.fillStyle = 'rgba(8, 12, 24, 0.88)';
  const r = 3;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  // Text
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  return tw;
}

// ─── AFR→Lambda conversion for chart traces ────────────────────────────────
function isAFRChannel(ch: WP8Channel): boolean {
  return ch.name.toLowerCase().includes('air fuel ratio');
}
function convertAFRValue(v: number, ch: WP8Channel): number {
  if (isAFRChannel(ch) && Number.isFinite(v) && v > 0) return v / 14.7;
  return v;
}

// ─── Canvas Chart Section ───────────────────────────────────────────────────
interface ChartSectionProps {
  sectionIdx: number;
  channels: WP8Channel[];
  channelIndices: number[];
  rows: { timestamp: number; values: Float32Array }[];
  startIdx: number;
  endIdx: number;
  cursorIdx: number | null;
  onCursorMove: (idx: number | null) => void;
  height: number;
  onRemoveChannel: (sectionIdx: number, channelIdx: number) => void;
}

function ChartSection({
  sectionIdx,
  channels,
  channelIndices,
  rows,
  startIdx,
  endIdx,
  cursorIdx,
  onCursorMove,
  height,
  onRemoveChannel,
}: ChartSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: height });

  // Margins for axis labels
  const marginLeft = 65;
  const marginRight = 65;
  const marginTop = 4;
  const marginBottom = 2;

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) setCanvasSize({ w: Math.floor(width), h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  // Compute min/max for each channel in visible range (AFR channels converted to Lambda)
  const channelRanges = useMemo(() => {
    const ranges: { min: number; max: number }[] = [];
    for (const ci of channelIndices) {
      let mn = Infinity, mx = -Infinity;
      const ch = channels[ci];
      for (let i = startIdx; i <= endIdx && i < rows.length; i++) {
        const raw = ci < rows[i].values.length ? rows[i].values[ci] : 0;
        const v = ch ? convertAFRValue(raw, ch) : raw;
        if (Number.isFinite(v)) {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      if (mn === Infinity) { mn = 0; mx = 1; }
      if (mn === mx) { mn -= 1; mx += 1; }
      // Add 5% padding
      const pad = (mx - mn) * 0.05;
      ranges.push({ min: mn - pad, max: mx + pad });
    }
    return ranges;
  }, [channelIndices, channels, rows, startIdx, endIdx]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    ctx.scale(dpr, dpr);

    const W = canvasSize.w;
    const H = canvasSize.h;
    const plotW = W - marginLeft - marginRight;
    const plotH = H - marginTop - marginBottom;

    // Background
    ctx.fillStyle = T.sectionBg;
    ctx.fillRect(0, 0, W, H);

    if (channelIndices.length === 0 || rows.length === 0) {
      ctx.fillStyle = T.textDim;
      ctx.font = `13px ${FONT.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText('Click a channel to add it to this section', W / 2, H / 2);
      return;
    }

    const visibleCount = endIdx - startIdx + 1;
    if (visibleCount < 2) return;

    // Grid lines (horizontal — 4 lines)
    ctx.strokeStyle = T.gridLine;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = marginTop + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(W - marginRight, y);
      ctx.stroke();
    }

    // Vertical grid lines (time divisions — ~8 lines)
    const timeDiv = Math.max(1, Math.floor(visibleCount / 8));
    for (let i = 0; i < visibleCount; i += timeDiv) {
      const x = marginLeft + (i / (visibleCount - 1)) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, marginTop);
      ctx.lineTo(x, H - marginBottom);
      ctx.stroke();
    }

    // Draw traces (AFR channels auto-converted to Lambda)
    channelIndices.forEach((ci, slot) => {
      if (slot >= channelRanges.length) return;
      const { min, max } = channelRanges[slot];
      const range = max - min;
      const color = getChannelColor(sectionIdx, slot);
      const ch = channels[ci];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < visibleCount; i++) {
        const rowIdx = startIdx + i;
        if (rowIdx >= rows.length) break;
        const raw = ci < rows[rowIdx].values.length ? rows[rowIdx].values[ci] : 0;
        const v = ch ? convertAFRValue(raw, ch) : raw;
        const x = marginLeft + (i / (visibleCount - 1)) * plotW;
        const y = marginTop + plotH - ((v - min) / range) * plotH;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    });

       // Y-axis labels (left side for first 2 channels, right side for last 2)
    channelIndices.forEach((ci, slot) => {
      if (slot >= channelRanges.length) return;
      const { min, max } = channelRanges[slot];
      const color = getChannelColor(sectionIdx, slot);
      const ch = channels[ci];
      const afrConv = ch && isAFRChannel(ch);
      const fmtName = afrConv ? 'lambda' : (ch?.name || '');
      const unit = afrConv ? 'λ' : getUnit(ch?.name || '');
      const isRight = slot >= 2;
      const alignDir: CanvasTextAlign = isRight ? 'left' : 'right';
      const xBase = isRight ? W - marginRight + 4 : marginLeft - 4;
      const yOffset = slot % 2 === 0 ? 0 : (plotH / 2);
      // Max value at top (with background)
      drawLabelWithBg(
        ctx,
        formatValue(max, fmtName) + (unit ? ' ' + unit : ''),
        xBase,
        marginTop + 10 + yOffset,
        color,
        alignDir,
        10,
      );
      // Min value at bottom (with background)
      drawLabelWithBg(
        ctx,
        formatValue(min, fmtName),
        xBase,
        marginTop + plotH / 2 - 2 + yOffset,
        color,
        alignDir,
        10,
      );
    });

    // Crosshair
    if (cursorIdx !== null && cursorIdx >= startIdx && cursorIdx <= endIdx) {
      const x = marginLeft + ((cursorIdx - startIdx) / (visibleCount - 1)) * plotW;
      ctx.strokeStyle = T.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, marginTop);
      ctx.lineTo(x, H - marginBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Value dots on crosshair (AFR→Lambda converted)
      // Collect all labels first, then resolve overlaps before drawing
      const dotLabels: { ci: number; slot: number; x: number; y: number; v: number; color: string; displayName: string }[] = [];
      channelIndices.forEach((ci, slot) => {
        if (slot >= channelRanges.length) return;
        const { min, max } = channelRanges[slot];
        const range = max - min;
        const ch = channels[ci];
        const raw = ci < rows[cursorIdx].values.length ? rows[cursorIdx].values[ci] : 0;
        const v = ch ? convertAFRValue(raw, ch) : raw;
        const y = marginTop + plotH - ((v - min) / range) * plotH;
        const color = getChannelColor(sectionIdx, slot);
        const displayName = ch && isAFRChannel(ch) ? 'lambda' : (ch?.name || '');
        dotLabels.push({ ci, slot, x, y, v, color, displayName });
      });

      // Sort by Y so we can push overlapping labels apart
      dotLabels.sort((a, b) => a.y - b.y);
      const labelH = 16; // min vertical spacing between labels
      for (let i = 1; i < dotLabels.length; i++) {
        const prev = dotLabels[i - 1];
        const curr = dotLabels[i];
        if (curr.y - prev.y < labelH) {
          // Push current label down to avoid overlap
          const mid = (prev.y + curr.y) / 2;
          dotLabels[i - 1] = { ...prev, y: mid - labelH / 2 };
          dotLabels[i] = { ...curr, y: mid + labelH / 2 };
        }
      }

      // Draw dots at original positions, labels at adjusted positions
      channelIndices.forEach((ci, slot) => {
        if (slot >= channelRanges.length) return;
        const { min, max } = channelRanges[slot];
        const range = max - min;
        const ch = channels[ci];
        const raw = ci < rows[cursorIdx].values.length ? rows[cursorIdx].values[ci] : 0;
        const v = ch ? convertAFRValue(raw, ch) : raw;
        const origY = marginTop + plotH - ((v - min) / range) * plotH;
        const color = getChannelColor(sectionIdx, slot);
        // Draw dot at true data position
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, origY, 4, 0, Math.PI * 2);
        ctx.fill();
        // Draw white ring around dot for visibility
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, origY, 5, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Draw value labels with background at adjusted Y positions
      for (const lbl of dotLabels) {
        // Place label to the right of crosshair, or left if near right edge
        const labelX = (lbl.x + 120 > W - marginRight) ? lbl.x - 10 : lbl.x + 10;
        const labelAlign: CanvasTextAlign = (lbl.x + 120 > W - marginRight) ? 'right' : 'left';
        drawLabelWithBg(
          ctx,
          formatValue(lbl.v, lbl.displayName),
          labelX,
          lbl.y + 4,
          lbl.color,
          labelAlign,
          12,
          5,
          3,
        );
      }
    }

  }, [canvasSize, channelIndices, channelRanges, rows, startIdx, endIdx, cursorIdx, sectionIdx, channels]);

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotW = canvasSize.w - marginLeft - marginRight;
    const frac = (x - marginLeft) / plotW;
    if (frac < 0 || frac > 1) {
      onCursorMove(null);
      return;
    }
    const visibleCount = endIdx - startIdx + 1;
    const idx = startIdx + Math.round(frac * (visibleCount - 1));
    onCursorMove(Math.max(startIdx, Math.min(endIdx, idx)));
  }, [canvasSize.w, startIdx, endIdx, onCursorMove]);

  const handleMouseLeave = useCallback(() => {
    onCursorMove(null);
  }, [onCursorMove]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height: `${height}px`,
        borderBottom: `1px solid ${T.border}`,
        overflow: 'hidden',
      }}
    >
      {/* Channel labels overlay (top-left) */}
      <div style={{
        position: 'absolute',
        top: 2,
        left: marginLeft + 4,
        display: 'flex',
        gap: 8,
        zIndex: 10,
        pointerEvents: 'auto',
      }}>
        {channelIndices.map((ci, slot) => {
          const ch = channels[ci];
          const color = getChannelColor(sectionIdx, slot);
          const unit = getUnit(ch?.name || '');
          return (
            <div
              key={ci}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                background: 'rgba(10, 14, 26, 0.85)',
                padding: '1px 6px',
                borderRadius: 2,
              }}
            >
              <span style={{ color, fontFamily: FONT.mono, fontSize: '10px', fontWeight: 'bold' }}>
                {ch?.name || `CH${ci}`}{unit ? ` (${unit})` : ''}
              </span>
              {cursorIdx !== null && cursorIdx < rows.length && (
                <span style={{ color, fontFamily: FONT.mono, fontSize: '11px', fontWeight: 'bold' }}>
                  {formatValue(ci < rows[cursorIdx].values.length ? rows[cursorIdx].values[ci] : 0, ch?.name || '')}
                </span>
              )}
              <button
                onClick={() => onRemoveChannel(sectionIdx, ci)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: T.textDim,
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: 12,
                  display: 'flex',
                }}
              >
                <X size={10} />
              </button>
            </div>
          );
        })}
      </div>

      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}

// ─── Main Log Viewer Component ──────────────────────────────────────────────
export interface TalonCursorData {
  rpm: number;
  tps: number;
  mapKpa: number;
  afr1: number;
  afr2: number;
  lambda1: number;
  lambda2: number;
  alphaN: number; // 1 = Alpha-N active, 0 = Speed Density active
  sampleIdx: number;
  timestamp: number;
}

export default function TalonLogViewer({ wp8Data, onCursorData }: { wp8Data: WP8ParseResult; onCursorData?: (data: TalonCursorData | null) => void }) {
  const keyChannels = useMemo(() => getHondaTalonKeyChannels(wp8Data), [wp8Data]);

  // Section channel assignments (4 sections, each up to 4 channels)
  const [sections, setSections] = useState<SectionConfig[]>(() => {
    // Default layout based on HPTuners screenshot
    const s1: number[] = [];
    const s2: number[] = [];
    const s3: number[] = [];
    const s4: number[] = [];

    // Section 1: RPM, Speed, ECT, Alpha-N
    if (keyChannels.engineSpeed >= 0) s1.push(keyChannels.engineSpeed);
    if (keyChannels.vehicleSpeed >= 0) s1.push(keyChannels.vehicleSpeed);
    if (keyChannels.coolantTemp >= 0) s1.push(keyChannels.coolantTemp);
    if (keyChannels.alphaN >= 0) s1.push(keyChannels.alphaN);

    // Section 2: Throttle, MAP, IAT, 3-bar MAP
    if (keyChannels.throttlePosition >= 0) s2.push(keyChannels.throttlePosition);
    if (keyChannels.map >= 0) s2.push(keyChannels.map);
    if (keyChannels.intakeAirTemp >= 0) s2.push(keyChannels.intakeAirTemp);
    if (keyChannels.mapCorrected >= 0) s2.push(keyChannels.mapCorrected);

    // Section 3: AFR1, AFR2
    if (keyChannels.afr1 >= 0) s3.push(keyChannels.afr1);
    if (keyChannels.afr2 >= 0) s3.push(keyChannels.afr2);

    // Section 4: IPW Desired, IPW Final, Spark, STFT
    if (keyChannels.injPwDesired >= 0) s4.push(keyChannels.injPwDesired);
    if (keyChannels.injPwFinal >= 0) s4.push(keyChannels.injPwFinal);
    if (keyChannels.ignitionTiming >= 0) s4.push(keyChannels.ignitionTiming);
    if (keyChannels.stft >= 0) s4.push(keyChannels.stft);

    return [
      { id: 0, channelIndices: s1.slice(0, 4), label: 'Section 1' },
      { id: 1, channelIndices: s2.slice(0, 4), label: 'Section 2' },
      { id: 2, channelIndices: s3.slice(0, 4), label: 'Section 3' },
      { id: 3, channelIndices: s4.slice(0, 4), label: 'Section 4' },
    ];
  });

  // Active section (for channel assignment)
  const [activeSection, setActiveSection] = useState(0);

  // Zoom/pan state (synced across all sections)
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(Math.max(0, wp8Data.rows.length - 1));

  // Cursor position (synced across all sections)
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);

  // Fire onCursorData callback whenever cursor moves
  useEffect(() => {
    if (!onCursorData) return;
    if (cursorIdx === null || cursorIdx >= wp8Data.rows.length) {
      onCursorData(null);
      return;
    }
    const row = wp8Data.rows[cursorIdx];
    const v = (idx: number) => idx >= 0 && idx < row.values.length ? row.values[idx] : 0;
    const afr1Raw = v(keyChannels.afr1);
    const afr2Raw = v(keyChannels.afr2);
    onCursorData({
      rpm: v(keyChannels.engineSpeed),
      tps: v(keyChannels.throttlePosition),
      mapKpa: v(keyChannels.map),
      afr1: afr1Raw,
      afr2: afr2Raw,
      lambda1: afr1Raw / 14.7,
      lambda2: afr2Raw / 14.7,
      alphaN: v(keyChannels.alphaN),
      sampleIdx: cursorIdx,
      timestamp: row.timestamp,
    });
  }, [cursorIdx, wp8Data, keyChannels, onCursorData]);

  // Channel search
  const [channelSearch, setChannelSearch] = useState('');

  // Expanded channel panel
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Reset zoom when data changes
  useEffect(() => {
    setStartIdx(0);
    setEndIdx(Math.max(0, wp8Data.rows.length - 1));
  }, [wp8Data.rows.length]);

  // Filtered channels for left panel
  const filteredChannels = useMemo(() => {
    if (!channelSearch.trim()) return wp8Data.channels;
    const q = channelSearch.toLowerCase();
    return wp8Data.channels.filter(ch => ch.name.toLowerCase().includes(q));
  }, [wp8Data.channels, channelSearch]);

  // Which section a channel is in (for highlighting)
  const channelSectionMap = useMemo(() => {
    const map = new Map<number, { sectionIdx: number; slot: number }>();
    sections.forEach((s, si) => {
      s.channelIndices.forEach((ci, slot) => {
        map.set(ci, { sectionIdx: si, slot });
      });
    });
    return map;
  }, [sections]);

  // Add channel to active section
  const addChannelToSection = useCallback((channelIdx: number) => {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, channelIndices: [...s.channelIndices] }));
      const sec = next[activeSection];
      // If already in this section, remove it
      const existIdx = sec.channelIndices.indexOf(channelIdx);
      if (existIdx >= 0) {
        sec.channelIndices.splice(existIdx, 1);
        return next;
      }
      // If in another section, remove from there first
      for (const s of next) {
        const idx = s.channelIndices.indexOf(channelIdx);
        if (idx >= 0) s.channelIndices.splice(idx, 1);
      }
      // Add to active section (max 4)
      if (sec.channelIndices.length < 4) {
        sec.channelIndices.push(channelIdx);
      }
      return next;
    });
  }, [activeSection]);

  // Remove channel from section
  const removeChannel = useCallback((sectionIdx: number, channelIdx: number) => {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, channelIndices: [...s.channelIndices] }));
      const sec = next[sectionIdx];
      sec.channelIndices = sec.channelIndices.filter(ci => ci !== channelIdx);
      return next;
    });
  }, []);

  // Zoom/pan handlers
  const chartAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (wp8Data.rows.length < 2) return;

      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const count = endIdx - startIdx + 1;
      const change = Math.max(1, Math.floor(count * 0.15));
      const delta = Math.sign(e.deltaY);

      if (delta < 0) {
        // Zoom in
        const shrinkLeft = Math.round(change * frac);
        const shrinkRight = change - shrinkLeft;
        const ns = startIdx + shrinkLeft;
        const ne = endIdx - shrinkRight;
        if (ne - ns + 1 < 8) return;
        setStartIdx(ns);
        setEndIdx(ne);
      } else {
        // Zoom out
        const expandLeft = Math.round(change * frac);
        const expandRight = change - expandLeft;
        setStartIdx(Math.max(0, startIdx - expandLeft));
        setEndIdx(Math.min(wp8Data.rows.length - 1, endIdx + expandRight));
      }
    };

    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [wp8Data.rows.length, startIdx, endIdx]);

  // Drag pan
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartRange = useRef({ start: 0, end: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartRange.current = { start: startIdx, end: endIdx };
  }, [startIdx, endIdx]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !chartAreaRef.current) return;
    const rect = chartAreaRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStartX.current;
    const count = dragStartRange.current.end - dragStartRange.current.start + 1;
    const indexDelta = Math.round((dx / rect.width) * count);
    if (indexDelta === 0) return;

    let ns = dragStartRange.current.start - indexDelta;
    let ne = dragStartRange.current.end - indexDelta;
    if (ns < 0) { ns = 0; ne = count - 1; }
    if (ne > wp8Data.rows.length - 1) { ne = wp8Data.rows.length - 1; ns = Math.max(0, ne - count + 1); }
    setStartIdx(ns);
    setEndIdx(ne);
  }, [wp8Data.rows.length]);

  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);

  useEffect(() => {
    const h = () => { isDragging.current = false; };
    window.addEventListener('mouseup', h);
    return () => window.removeEventListener('mouseup', h);
  }, []);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const csv = wp8ToCSV(wp8Data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `honda_talon_datalog_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [wp8Data]);

  // Zoom info
  const isZoomed = startIdx > 0 || endIdx < wp8Data.rows.length - 1;
  const visibleCount = endIdx - startIdx + 1;
  const zoomPct = wp8Data.rows.length > 0 ? Math.round((visibleCount / wp8Data.rows.length) * 100) : 100;

  // Time display
  const getTimeStr = (idx: number) => {
    if (idx < 0 || idx >= wp8Data.rows.length) return '0.000';
    const ts = wp8Data.rows[idx].timestamp;
    return (ts / 1000).toFixed(3) + 's';
  };

  // Section height
  const sectionHeight = 160;

  return (
    <div style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 4,
      overflow: 'hidden',
      fontFamily: FONT.mono,
    }}>
      {/* Top toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: T.headerBg,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: FONT.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: T.textBright }}>
            CHART VS. TIME
          </span>
          <span style={{ fontSize: '0.7rem', color: T.textDim }}>
            {wp8Data.channels.length} ch | {wp8Data.totalRows} samples | {(wp8Data.rawSize / 1024).toFixed(1)} KB
          </span>
          {wp8Data.partNumber && (
            <span style={{ fontSize: '0.65rem', color: T.accent, background: T.accentDim, padding: '1px 6px', borderRadius: 2 }}>
              {wp8Data.partNumber}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Zoom controls */}
          {isZoomed && (
            <span style={{ fontSize: '0.7rem', color: T.accent }}>
              Zoom: {zoomPct}% | {getTimeStr(startIdx)} – {getTimeStr(endIdx)}
            </span>
          )}
          <button
            onClick={() => { setStartIdx(0); setEndIdx(Math.max(0, wp8Data.rows.length - 1)); }}
            disabled={!isZoomed}
            style={{
              background: isZoomed ? T.accentDim : 'transparent',
              color: isZoomed ? T.accent : T.textDim,
              border: `1px solid ${isZoomed ? T.accent : T.border}`,
              borderRadius: 2,
              padding: '2px 8px',
              fontSize: '0.7rem',
              cursor: isZoomed ? 'pointer' : 'default',
            }}
          >
            RESET
          </button>
          <button
            onClick={handleExportCSV}
            style={{
              background: 'transparent',
              color: T.textDim,
              border: `1px solid ${T.border}`,
              borderRadius: 2,
              padding: '2px 8px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Download size={12} />CSV
          </button>
        </div>
      </div>

      {/* Main layout: left panel + chart area */}
      <div style={{ display: 'flex' }}>
        {/* Left channel panel */}
        <div style={{
          width: panelCollapsed ? 32 : 220,
          minWidth: panelCollapsed ? 32 : 220,
          background: T.panelBg,
          borderRight: `1px solid ${T.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s, min-width 0.2s',
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: panelCollapsed ? '6px 4px' : '6px 8px',
            borderBottom: `1px solid ${T.border}`,
            background: T.headerBg,
          }}>
            {!panelCollapsed && (
              <span style={{ fontSize: '0.75rem', color: T.textBright, fontWeight: 'bold' }}>Channels</span>
            )}
            <button
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              style={{ background: 'transparent', border: 'none', color: T.textDim, cursor: 'pointer', padding: 2 }}
            >
              {panelCollapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
          </div>

          {!panelCollapsed && (
            <>
              {/* Section selector tabs */}
              <div style={{
                display: 'flex',
                borderBottom: `1px solid ${T.border}`,
              }}>
                {[0, 1, 2, 3].map(si => (
                  <button
                    key={si}
                    onClick={() => setActiveSection(si)}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      fontSize: '0.65rem',
                      fontWeight: activeSection === si ? 'bold' : 'normal',
                      color: activeSection === si ? T.textBright : T.textDim,
                      background: activeSection === si ? T.accentDim : 'transparent',
                      border: 'none',
                      borderBottom: activeSection === si ? `2px solid ${T.accent}` : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    S{si + 1}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div style={{ padding: '4px 6px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 2,
                  padding: '2px 6px',
                }}>
                  <Search size={12} style={{ color: T.textDim, flexShrink: 0 }} />
                  <input
                    value={channelSearch}
                    onChange={e => setChannelSearch(e.target.value)}
                    placeholder="Filter..."
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: T.text,
                      fontSize: '0.7rem',
                      outline: 'none',
                      width: '100%',
                      fontFamily: FONT.mono,
                    }}
                  />
                </div>
              </div>

              {/* Channel list */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}>
                {/* Column headers */}
                <div style={{
                  display: 'flex',
                  padding: '3px 8px',
                  borderBottom: `1px solid ${T.border}`,
                  position: 'sticky',
                  top: 0,
                  background: T.panelBg,
                  zIndex: 1,
                }}>
                  <span style={{ flex: 1, fontSize: '0.6rem', color: T.textDim, fontWeight: 'bold' }}>Name</span>
                  <span style={{ width: 70, fontSize: '0.6rem', color: T.textDim, fontWeight: 'bold', textAlign: 'right' }}>Value</span>
                </div>

                {filteredChannels.map(ch => {
                  const assignment = channelSectionMap.get(ch.index);
                  const isAssigned = !!assignment;
                  const color = isAssigned
                    ? getChannelColor(assignment!.sectionIdx, assignment!.slot)
                    : undefined;
                  const isInActiveSection = assignment?.sectionIdx === activeSection;

                  // Get value at cursor (convert AFR→Lambda for AFR channels)
                  let val = '—';
                  let displayName = ch.name;
                  if (cursorIdx !== null && cursorIdx < wp8Data.rows.length) {
                    let v = ch.index < wp8Data.rows[cursorIdx].values.length
                      ? wp8Data.rows[cursorIdx].values[ch.index]
                      : 0;
                    // Convert AFR to Lambda (÷14.7)
                    const isAFR = ch.name.toLowerCase().includes('air fuel ratio');
                    if (isAFR && Number.isFinite(v) && v > 0) {
                      v = v / 14.7;
                      displayName = ch.name.replace(/Air Fuel Ratio/i, 'Lambda');
                    }
                    val = formatValue(v, isAFR ? 'lambda' : ch.name);
                  }

                  return (
                    <div
                      key={ch.index}
                      onClick={() => addChannelToSection(ch.index)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        cursor: 'pointer',
                        background: isInActiveSection
                          ? 'rgba(59, 130, 246, 0.12)'
                          : isAssigned
                          ? 'rgba(255,255,255,0.02)'
                          : 'transparent',
                        borderLeft: isAssigned ? `3px solid ${color}` : '3px solid transparent',
                        borderBottom: `1px solid rgba(255,255,255,0.02)`,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(59, 130, 246, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = isInActiveSection
                          ? 'rgba(59, 130, 246, 0.12)'
                          : isAssigned
                          ? 'rgba(255,255,255,0.02)'
                          : 'transparent';
                      }}
                    >
                      <span style={{
                        flex: 1,
                        fontSize: '0.68rem',
                        color: isAssigned ? color : T.text,
                        fontWeight: isAssigned ? 'bold' : 'normal',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {displayName}
                      </span>
                      <span style={{
                        width: 70,
                        fontSize: '0.7rem',
                        color: isAssigned ? color : T.textDim,
                        textAlign: 'right',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                      }}>
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Alpha-N Mode Indicator */}
              {(() => {
                if (cursorIdx === null || cursorIdx >= wp8Data.rows.length) return null;
                const alphaNIdx = keyChannels.alphaN;
                if (alphaNIdx < 0) return null;
                const alphaNVal = alphaNIdx < wp8Data.rows[cursorIdx].values.length
                  ? wp8Data.rows[cursorIdx].values[alphaNIdx] : 0;
                const isAlphaN = alphaNVal === 1;
                return (
                  <div style={{
                    padding: '4px 8px',
                    borderTop: `1px solid ${T.border}`,
                    background: isAlphaN ? 'rgba(234, 179, 8, 0.10)' : 'rgba(6, 182, 212, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <Zap size={12} style={{ color: isAlphaN ? T.yellow : T.cyan }} />
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 'bold',
                      color: isAlphaN ? T.yellow : T.cyan,
                      fontFamily: FONT.heading,
                      letterSpacing: '0.06em',
                    }}>
                      {isAlphaN ? 'ALPHA-N TABLES ACTIVE' : 'SPEED DENSITY TABLES ACTIVE'}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: T.textDim }}>
                      Alpha-N = {alphaNVal.toFixed(2)} | IPW from {isAlphaN ? 'Alpha-N Cyl 1 & 2' : 'Speed Density Cyl 1 & 2'}
                    </span>
                  </div>
                );
              })()}

              {/* Bottom info */}
              <div style={{
                padding: '4px 8px',
                borderTop: `1px solid ${T.border}`,
                fontSize: '0.6rem',
                color: T.textDim,
              }}>
                {cursorIdx !== null ? (
                  <span>Time: {getTimeStr(cursorIdx)} | Sample: {cursorIdx} | AFR shown as Lambda (÷14.7)</span>
                ) : (
                  <span>Hover chart to see values | AFR auto-converted to Lambda</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Chart area (4 stacked sections) */}
        <div
          ref={chartAreaRef}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            cursor: isZoomed ? 'grab' : 'crosshair',
            userSelect: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {sections.map((sec, si) => (
            <div
              key={sec.id}
              onClick={() => setActiveSection(si)}
              style={{
                position: 'relative',
                borderLeft: activeSection === si ? `2px solid ${T.accent}` : '2px solid transparent',
              }}
            >
              <ChartSection
                sectionIdx={si}
                channels={wp8Data.channels}
                channelIndices={sec.channelIndices}
                rows={wp8Data.rows}
                startIdx={startIdx}
                endIdx={endIdx}
                cursorIdx={cursorIdx}
                onCursorMove={setCursorIdx}
                height={sectionHeight}
                onRemoveChannel={removeChannel}
              />
            </div>
          ))}

          {/* Time axis / minimap at bottom */}
          <div style={{
            height: 28,
            background: T.headerBg,
            borderTop: `1px solid ${T.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 12,
          }}>
            <span style={{ fontSize: '0.65rem', color: T.textDim }}>
              Time (s)
            </span>
            {/* Minimap */}
            <div style={{
              flex: 1,
              height: 8,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 4,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute',
                left: wp8Data.rows.length > 0 ? `${(startIdx / wp8Data.rows.length) * 100}%` : '0%',
                width: wp8Data.rows.length > 0 ? `${Math.max(2, (visibleCount / wp8Data.rows.length) * 100)}%` : '100%',
                height: '100%',
                background: T.accent,
                opacity: 0.4,
                borderRadius: 4,
              }} />
            </div>
            <span style={{ fontSize: '0.65rem', color: T.textDim }}>
              {getTimeStr(startIdx)} – {getTimeStr(endIdx)}
            </span>
            <span style={{ fontSize: '0.6rem', color: T.textDim }}>
              Duration: {((wp8Data.rows[wp8Data.rows.length - 1]?.timestamp || 0) / 1000).toFixed(1)}s
            </span>
            <span style={{ fontSize: '0.6rem', color: T.textDim }}>
              Zoom: {isZoomed ? 'Scroll · Drag' : 'Scroll to zoom'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
