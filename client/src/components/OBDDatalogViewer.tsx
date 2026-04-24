/**
 * OBDDatalogViewer — HPTuners VCM Scanner-style multi-section chart viewer
 * Adapted from TalonLogViewer for OBD PID data (live readingHistory).
 *
 * Layout:
 *   ┌──────────────┬─────────────────────────────────────────────────┐
 *   │  CHANNELS    │  Section 1: up to 4 channels (RPM, Speed, ECT) │
 *   │  (left panel)│─────────────────────────────────────────────────│
 *   │  Name  Value │  Section 2: up to 4 channels (Boost, MAP, IAT) │
 *   │  ──────────  │─────────────────────────────────────────────────│
 *   │  Engine RPM  │  Section 3: up to 4 channels (Fuel, Injection) │
 *   │  2,450 rpm   │─────────────────────────────────────────────────│
 *   │  Boost       │  Section 4: up to 4 channels (Turbo, Exhaust)  │
 *   │  22.3 psi    │─────────────────────────────────────────────────│
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
import { X, Search, Maximize2, Minimize2 } from 'lucide-react';
import type { PIDDefinition, PIDReading } from '@/lib/obdConnection';

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

const TRACE_COLORS = [
  '#ef4444', '#22c55e', '#06b6d4', '#eab308',
  '#a855f7', '#f97316', '#ec4899', '#14b8a6',
  '#8b5cf6', '#f43f5e', '#84cc16', '#0ea5e9',
];

const FONT = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", "Consolas", monospace',
};

// ─── Types ──────────────────────────────────────────────────────────────────
interface SectionConfig {
  id: number;
  channelIndices: number[];
  label: string;
}

interface DataRow {
  timestamp: number;
  values: number[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatValue(val: number, pid: PIDDefinition): string {
  if (!Number.isFinite(val)) return '—';
  if (pid.unit === 'rpm' || pid.unit === 'RPM') return val.toFixed(0);
  if (pid.unit === '°F' || pid.unit === '°C') return val.toFixed(1);
  if (pid.unit === 'PSI' || pid.unit === 'psi') return val.toFixed(1);
  if (pid.unit === 'V') return val.toFixed(2);
  if (pid.unit === '%') return val.toFixed(1);
  if (pid.unit === 'ms') return val.toFixed(3);
  if (pid.unit === '°' || pid.unit === '°BTDC') return val.toFixed(1);
  if (pid.unit === 'g/s' || pid.unit === 'lb/min') return val.toFixed(2);
  if (pid.unit === 'MPH' || pid.unit === 'mph') return val.toFixed(0);
  if (Math.abs(val) < 10) return val.toFixed(2);
  if (Math.abs(val) < 1000) return val.toFixed(1);
  return val.toFixed(0);
}

function getChannelColor(sectionIdx: number, channelSlot: number): string {
  return TRACE_COLORS[(sectionIdx * 4 + channelSlot) % TRACE_COLORS.length];
}

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
  let bx = x - paddingH;
  if (align === 'right') bx = x - tw - paddingH;
  else if (align === 'center') bx = x - tw / 2 - paddingH;
  const by = y - th + 1 - paddingV;
  const bw = tw + paddingH * 2;
  const bh = th + paddingV * 2;
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
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  return tw;
}

// ─── Canvas Chart Section ───────────────────────────────────────────────────
interface ChartSectionProps {
  sectionIdx: number;
  pids: PIDDefinition[];
  channelIndices: number[];
  rows: DataRow[];
  startIdx: number;
  endIdx: number;
  cursorIdx: number | null;
  onCursorMove: (idx: number | null) => void;
  height: number;
  onRemoveChannel: (sectionIdx: number, channelIdx: number) => void;
}

function ChartSection({
  sectionIdx, pids, channelIndices, rows, startIdx, endIdx,
  cursorIdx, onCursorMove, height, onRemoveChannel,
}: ChartSectionProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: height });
  const marginLeft = 65;
  const marginRight = 65;
  const marginTop = 22;
  const marginBottom = 2;

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

  // Compute per-channel ranges
  const channelRanges = useMemo(() => {
    const ranges: { min: number; max: number }[] = [];
    for (const ci of channelIndices) {
      const pid = pids[ci];
      let mn = Infinity, mx = -Infinity;
      for (let i = startIdx; i <= endIdx && i < rows.length; i++) {
        const v = rows[i].values[ci];
        if (Number.isFinite(v)) {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      if (mn === Infinity) { mn = 0; mx = 1; }
      if (mn === mx) { mn -= 1; mx += 1; }
      // Enforce minimum range (15% of PID full range) for visual stability
      if (pid) {
        const pidRange = pid.max - pid.min;
        const minRange = pidRange * 0.15;
        const dataRange = mx - mn;
        if (dataRange < minRange) {
          const center = (mn + mx) / 2;
          mn = center - minRange / 2;
          mx = center + minRange / 2;
        }
      }
      // 15% padding for breathing room
      const pad = (mx - mn) * 0.15;
      mn -= pad;
      mx += pad;
      // Round to nice numbers for cleaner axis labels
      const step = Math.pow(10, Math.floor(Math.log10(mx - mn)) - 1);
      if (step > 0) {
        mn = Math.floor(mn / step) * step;
        mx = Math.ceil(mx / step) * step;
      }
      ranges.push({ min: mn, max: mx });
    }
    return ranges;
  }, [channelIndices, pids, rows, startIdx, endIdx]);

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

    ctx.fillStyle = T.sectionBg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(13, 18, 32, 0.95)';
    ctx.fillRect(marginLeft, 0, plotW, marginTop);
    ctx.strokeStyle = T.borderLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginLeft, marginTop);
    ctx.lineTo(W - marginRight, marginTop);
    ctx.stroke();

    if (channelIndices.length === 0 || rows.length === 0) {
      ctx.fillStyle = T.textDim;
      ctx.font = `13px ${FONT.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText('Click a channel to add it here', W / 2, H / 2);
      return;
    }

    const visibleCount = endIdx - startIdx + 1;
    if (visibleCount < 2) return;

    // Grid lines
    ctx.strokeStyle = T.gridLine;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = marginTop + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(W - marginRight, y);
      ctx.stroke();
    }
    const timeDiv = Math.max(1, Math.floor(visibleCount / 8));
    for (let i = 0; i < visibleCount; i += timeDiv) {
      const x = marginLeft + (i / (visibleCount - 1)) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, marginTop);
      ctx.lineTo(x, H - marginBottom);
      ctx.stroke();
    }

    // Draw traces with EMA smoothing + Catmull-Rom spline interpolation
    channelIndices.forEach((ci, slot) => {
      if (slot >= channelRanges.length) return;
      const { min, max } = channelRanges[slot];
      const range = max - min;
      const color = getChannelColor(sectionIdx, slot);

      // Collect raw data points
      const pts: { x: number; y: number }[] = [];
      // EMA smoothing factor — higher = smoother (0.0–1.0)
      // Adapt based on visible density: more points = more smoothing
      const alpha = visibleCount > 500 ? 0.15 : visibleCount > 200 ? 0.25 : 0.4;
      let ema: number | null = null;
      for (let i = startIdx; i <= endIdx && i < rows.length; i++) {
        const v = rows[i].values[ci];
        if (!Number.isFinite(v)) continue;
        // Apply EMA filter
        if (ema === null) ema = v;
        else ema = alpha * v + (1 - alpha) * ema;
        const x = marginLeft + ((i - startIdx) / (visibleCount - 1)) * plotW;
        const y = marginTop + plotH - ((ema - min) / range) * plotH;
        pts.push({ x, y });
      }

      if (pts.length < 2) return;

      // Draw with Catmull-Rom spline for smooth curves
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
      } else {
        // Catmull-Rom to cubic bezier conversion (tension = 0.5)
        const tension = 0.5;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
          const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
          const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
          const cp2y = p2.y - (p3.y - p1.y) * tension / 3;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
      }
      ctx.stroke();
    });

    // Y-axis labels (left for slot 0, right for slot 1, etc.)
    channelIndices.forEach((ci, slot) => {
      if (slot >= channelRanges.length) return;
      const { min, max } = channelRanges[slot];
      const color = getChannelColor(sectionIdx, slot);
      const isLeft = slot % 2 === 0;
      const align: CanvasTextAlign = isLeft ? 'right' : 'left';
      const x = isLeft ? marginLeft - 4 : W - marginRight + 4;
      // Top and bottom labels
      drawLabelWithBg(ctx, max.toFixed(1), x, marginTop + 12, color, align, 9);
      drawLabelWithBg(ctx, min.toFixed(1), x, H - marginBottom - 2, color, align, 9);
      // Mid label
      const mid = (min + max) / 2;
      drawLabelWithBg(ctx, mid.toFixed(1), x, marginTop + plotH / 2 + 4, color, align, 9);
    });

    // Cursor crosshair
    if (cursorIdx !== null && cursorIdx >= startIdx && cursorIdx <= endIdx) {
      const cx = marginLeft + ((cursorIdx - startIdx) / (visibleCount - 1)) * plotW;
      ctx.strokeStyle = T.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, marginTop);
      ctx.lineTo(cx, H - marginBottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw dots at cursor position
      channelIndices.forEach((ci, slot) => {
        if (slot >= channelRanges.length) return;
        const { min, max } = channelRanges[slot];
        const range = max - min;
        const v = rows[cursorIdx]?.values[ci];
        if (!Number.isFinite(v)) return;
        const y = marginTop + plotH - ((v - min) / range) * plotH;
        const color = getChannelColor(sectionIdx, slot);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = T.white;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Header readout at cursor
      let hx = marginLeft + 8;
      channelIndices.forEach((ci, slot) => {
        const pid = pids[ci];
        if (!pid) return;
        const color = getChannelColor(sectionIdx, slot);
        const v = rows[cursorIdx]?.values[ci];
        const valStr = Number.isFinite(v) ? formatValue(v, pid) : '—';
        const label = `${pid.shortName}: ${valStr} ${pid.unit}`;
        const tw = drawLabelWithBg(ctx, label, hx, marginTop - 5, color, 'left', 10);
        hx += tw + 16;
      });
    }
  }, [canvasSize, channelIndices, pids, rows, startIdx, endIdx, cursorIdx, channelRanges, sectionIdx]);

  // Mouse handling
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const plotW = canvasSize.w - marginLeft - marginRight;
    const visibleCount = endIdx - startIdx + 1;
    if (x < marginLeft || x > canvasSize.w - marginRight || visibleCount < 2) {
      onCursorMove(null);
      return;
    }
    const frac = (x - marginLeft) / plotW;
    const idx = startIdx + Math.round(frac * (visibleCount - 1));
    onCursorMove(Math.max(startIdx, Math.min(endIdx, idx)));
  }, [canvasSize, startIdx, endIdx, onCursorMove]);

  const handleMouseLeave = useCallback(() => onCursorMove(null), [onCursorMove]);

  return (
    <div ref={containerRef} style={{ position: 'relative', height, borderBottom: `1px solid ${T.border}` }}>
      {/* Channel badges in header */}
      <div style={{
        position: 'absolute', top: 0, left: marginLeft, right: marginRight,
        height: marginTop, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 8px', zIndex: 2, pointerEvents: 'auto',
      }}>
        {channelIndices.map((ci, slot) => {
          const pid = pids[ci];
          if (!pid) return null;
          const color = getChannelColor(sectionIdx, slot);
          return (
            <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
              <span style={{ fontSize: '0.6rem', color, fontFamily: FONT.mono, fontWeight: 'bold' }}>
                {pid.shortName}
              </span>
              <button
                onClick={() => onRemoveChannel(sectionIdx, ci)}
                style={{ background: 'transparent', border: 'none', color: T.textDim, cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 10, display: 'flex' }}
              >
                <X size={9} />
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

// ─── Main OBD Datalog Viewer ────────────────────────────────────────────────
interface OBDDatalogViewerProps {
  pids: PIDDefinition[];
  readingHistory: Map<number, PIDReading[]>;
  liveReadings: Map<number, PIDReading>;
  isLogging: boolean;
}

export default function OBDDatalogViewer({ pids, readingHistory, liveReadings, isLogging }: OBDDatalogViewerProps) {
  // Build unified row data from readingHistory
  const { rows, pidList } = useMemo(() => {
    const activePids = pids.filter(p => readingHistory.has(p.pid) && (readingHistory.get(p.pid)?.length ?? 0) > 0);
    if (activePids.length === 0) return { rows: [] as DataRow[], pidList: pids };

    // Collect all unique timestamps
    const tsSet = new Set<number>();
    for (const pid of activePids) {
      const readings = readingHistory.get(pid.pid) || [];
      for (const r of readings) tsSet.add(r.timestamp);
    }
    const timestamps = Array.from(tsSet).sort((a, b) => a - b);

    // Build lookup: pid -> timestamp -> value
    const pidValueMaps = new Map<number, Map<number, number>>();
    for (const pid of activePids) {
      const readings = readingHistory.get(pid.pid) || [];
      const map = new Map<number, number>();
      for (const r of readings) map.set(r.timestamp, r.value);
      pidValueMaps.set(pid.pid, map);
    }

    // Build rows with forward-fill for missing values
    const dataRows: DataRow[] = [];
    const lastKnown = new Map<number, number>();
    for (const ts of timestamps) {
      const values: number[] = [];
      for (const pid of activePids) {
        const map = pidValueMaps.get(pid.pid);
        const v = map?.get(ts);
        if (v !== undefined) {
          lastKnown.set(pid.pid, v);
          values.push(v);
        } else {
          values.push(lastKnown.get(pid.pid) ?? 0);
        }
      }
      dataRows.push({ timestamp: ts, values });
    }

    return { rows: dataRows, pidList: activePids };
  }, [pids, readingHistory]);

  // Section channel assignments
  const [sections, setSections] = useState<SectionConfig[]>([
    { id: 0, channelIndices: [], label: 'Section 1' },
    { id: 1, channelIndices: [], label: 'Section 2' },
    { id: 2, channelIndices: [], label: 'Section 3' },
    { id: 3, channelIndices: [], label: 'Section 4' },
  ]);

  // Auto-assign channels to sections on first data
  const hasAutoAssigned = useRef(false);
  useEffect(() => {
    if (hasAutoAssigned.current || pidList.length === 0) return;
    hasAutoAssigned.current = true;

    // Smart auto-assignment based on category
    const catGroups: Record<string, number[]> = {};
    pidList.forEach((pid, idx) => {
      const cat = pid.category || 'other';
      if (!catGroups[cat]) catGroups[cat] = [];
      catGroups[cat].push(idx);
    });

    const s1: number[] = []; // Engine: RPM, Speed, Load
    const s2: number[] = []; // Turbo/Boost: Boost, MAP, Vane
    const s3: number[] = []; // Fuel: Injection, Fuel Rate, Rail Pressure
    const s4: number[] = []; // Temps/Other: ECT, IAT, EGT

    const enginePids = catGroups['engine'] || [];
    const turboPids = catGroups['turbo'] || [];
    const fuelPids = catGroups['fuel'] || [];
    const tempPids = [...(catGroups['exhaust'] || []), ...(catGroups['cooling'] || []), ...(catGroups['intake'] || [])];

    s1.push(...enginePids.slice(0, 4));
    s2.push(...turboPids.slice(0, 4));
    s3.push(...fuelPids.slice(0, 4));
    s4.push(...tempPids.slice(0, 4));

    // Fill remaining slots from unassigned PIDs
    const assigned = new Set([...s1, ...s2, ...s3, ...s4]);
    const unassigned = pidList.map((_, i) => i).filter(i => !assigned.has(i));
    const secs = [s1, s2, s3, s4];
    let ui = 0;
    for (const sec of secs) {
      while (sec.length < 4 && ui < unassigned.length) {
        sec.push(unassigned[ui++]);
      }
    }

    setSections([
      { id: 0, channelIndices: s1.slice(0, 4), label: 'Section 1' },
      { id: 1, channelIndices: s2.slice(0, 4), label: 'Section 2' },
      { id: 2, channelIndices: s3.slice(0, 4), label: 'Section 3' },
      { id: 3, channelIndices: s4.slice(0, 4), label: 'Section 4' },
    ]);
  }, [pidList]);

  const [activeSection, setActiveSection] = useState(0);
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const [channelSearch, setChannelSearch] = useState('');
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Auto-follow latest data when logging
  const prevRowCount = useRef(0);
  useEffect(() => {
    if (rows.length === 0) return;
    if (isLogging || rows.length !== prevRowCount.current) {
      // If we were at the end, keep following
      const wasAtEnd = endIdx >= prevRowCount.current - 2 || prevRowCount.current === 0;
      if (wasAtEnd || prevRowCount.current === 0) {
        const visibleCount = endIdx - startIdx + 1;
        const newEnd = rows.length - 1;
        const newStart = Math.max(0, newEnd - Math.max(visibleCount - 1, 200));
        setStartIdx(newStart);
        setEndIdx(newEnd);
      }
      prevRowCount.current = rows.length;
    }
  }, [rows.length, isLogging, startIdx, endIdx]);

  // Channel assignment map
  const channelAssignment = useMemo(() => {
    const map = new Map<number, { sectionIdx: number; slot: number }>();
    sections.forEach((s, si) => {
      s.channelIndices.forEach((ci, slot) => {
        map.set(ci, { sectionIdx: si, slot });
      });
    });
    return map;
  }, [sections]);

  const addChannelToSection = useCallback((channelIdx: number) => {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, channelIndices: [...s.channelIndices] }));
      const sec = next[activeSection];
      const existIdx = sec.channelIndices.indexOf(channelIdx);
      if (existIdx >= 0) {
        sec.channelIndices.splice(existIdx, 1);
        return next;
      }
      for (const s of next) {
        const idx = s.channelIndices.indexOf(channelIdx);
        if (idx >= 0) s.channelIndices.splice(idx, 1);
      }
      if (sec.channelIndices.length < 4) {
        sec.channelIndices.push(channelIdx);
      }
      return next;
    });
  }, [activeSection]);

  const removeChannel = useCallback((sectionIdx: number, channelIdx: number) => {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, channelIndices: [...s.channelIndices] }));
      next[sectionIdx].channelIndices = next[sectionIdx].channelIndices.filter(ci => ci !== channelIdx);
      return next;
    });
  }, []);

  // Zoom/pan
  const chartAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (rows.length < 2) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const count = endIdx - startIdx + 1;
      const change = Math.max(1, Math.floor(count * 0.15));
      const delta = Math.sign(e.deltaY);
      if (delta < 0) {
        const shrinkLeft = Math.round(change * frac);
        const shrinkRight = change - shrinkLeft;
        const ns = startIdx + shrinkLeft;
        const ne = endIdx - shrinkRight;
        if (ne - ns + 1 < 8) return;
        setStartIdx(ns);
        setEndIdx(ne);
      } else {
        const expandLeft = Math.round(change * frac);
        const expandRight = change - expandLeft;
        setStartIdx(Math.max(0, startIdx - expandLeft));
        setEndIdx(Math.min(rows.length - 1, endIdx + expandRight));
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [rows.length, startIdx, endIdx]);

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
    if (ne > rows.length - 1) { ne = rows.length - 1; ns = Math.max(0, ne - count + 1); }
    setStartIdx(ns);
    setEndIdx(ne);
  }, [rows.length]);
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
  useEffect(() => {
    const h = () => { isDragging.current = false; };
    window.addEventListener('mouseup', h);
    return () => window.removeEventListener('mouseup', h);
  }, []);

  // Filtered channels for left panel
  const filteredChannels = useMemo(() => {
    if (!channelSearch.trim()) return pidList.map((p, i) => ({ pid: p, index: i }));
    const q = channelSearch.toLowerCase();
    return pidList.map((p, i) => ({ pid: p, index: i })).filter(({ pid }) =>
      pid.name.toLowerCase().includes(q) ||
      pid.shortName.toLowerCase().includes(q) ||
      (pid.category || '').toLowerCase().includes(q) ||
      pid.unit.toLowerCase().includes(q)
    );
  }, [pidList, channelSearch]);

  // Zoom info
  const isZoomed = startIdx > 0 || endIdx < rows.length - 1;
  const visibleCount = endIdx - startIdx + 1;
  const zoomPct = rows.length > 0 ? Math.round((visibleCount / rows.length) * 100) : 100;
  const getTimeStr = (idx: number) => {
    if (idx < 0 || idx >= rows.length) return '0.000';
    const firstTs = rows[0]?.timestamp || 0;
    return ((rows[idx].timestamp - firstTs) / 1000).toFixed(1) + 's';
  };

  const sectionHeight = 140;

  if (rows.length < 2) {
    return (
      <div style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4,
        padding: '20px', textAlign: 'center', color: T.textDim,
        fontFamily: FONT.mono, fontSize: '0.8rem',
      }}>
        Waiting for data... ({pidList.length} channels configured)
      </div>
    );
  }

  return (
    <div style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 4,
      overflow: 'hidden',
      fontFamily: FONT.body,
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 12px', background: T.headerBg, borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: FONT.heading, fontSize: '0.85rem', letterSpacing: '0.1em', color: T.textBright }}>
            DATALOG VIEWER
          </span>
          <span style={{ fontSize: '0.7rem', color: T.textDim }}>
            {pidList.length} ch | {rows.length} samples
          </span>
          {isLogging && (
            <span style={{ fontSize: '0.6rem', color: T.red, fontWeight: 'bold', animation: 'pulse 1s infinite' }}>
              ● LIVE
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isZoomed && (
            <span style={{ fontSize: '0.7rem', color: T.accent }}>
              {zoomPct}% | {getTimeStr(startIdx)} – {getTimeStr(endIdx)}
            </span>
          )}
          <button
            onClick={() => { setStartIdx(0); setEndIdx(Math.max(0, rows.length - 1)); }}
            disabled={!isZoomed}
            style={{
              background: isZoomed ? T.accentDim : 'transparent',
              color: isZoomed ? T.accent : T.textDim,
              border: `1px solid ${isZoomed ? T.accent : T.border}`,
              borderRadius: 2, padding: '2px 8px', fontSize: '0.65rem',
              cursor: isZoomed ? 'pointer' : 'default',
            }}
          >
            RESET
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex' }}>
        {/* Left channel panel */}
        <div style={{
          width: panelCollapsed ? 32 : 200,
          minWidth: panelCollapsed ? 32 : 200,
          background: T.panelBg,
          borderRight: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s, min-width 0.2s',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: panelCollapsed ? '4px 4px' : '4px 8px',
            borderBottom: `1px solid ${T.border}`, background: T.headerBg,
          }}>
            {!panelCollapsed && (
              <span style={{ fontSize: '0.7rem', color: T.textBright, fontWeight: 'bold' }}>Channels</span>
            )}
            <button
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              style={{ background: 'transparent', border: 'none', color: T.textDim, cursor: 'pointer', padding: 2 }}
            >
              {panelCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
            </button>
          </div>
          {!panelCollapsed && (
            <>
              {/* Section tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                {[0, 1, 2, 3].map(si => (
                  <button
                    key={si}
                    onClick={() => setActiveSection(si)}
                    style={{
                      flex: 1, padding: '3px 0', fontSize: '0.6rem',
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
              <div style={{ padding: '3px 6px', borderBottom: `1px solid ${T.border}` }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.03)', borderRadius: 2, padding: '2px 6px',
                }}>
                  <Search size={11} style={{ color: T.textDim, flexShrink: 0 }} />
                  <input
                    value={channelSearch}
                    onChange={e => setChannelSearch(e.target.value)}
                    placeholder="Filter..."
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      color: T.text, fontSize: '0.65rem', fontFamily: FONT.mono,
                    }}
                  />
                </div>
              </div>
              {/* Channel list */}
              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {filteredChannels.map(({ pid, index }) => {
                  const assignment = channelAssignment.get(index);
                  const isAssigned = !!assignment;
                  const isInActiveSection = assignment?.sectionIdx === activeSection;
                  const color = isAssigned
                    ? getChannelColor(assignment!.sectionIdx, assignment!.slot)
                    : T.text;

                  let val = '—';
                  if (cursorIdx !== null && cursorIdx < rows.length) {
                    const v = rows[cursorIdx].values[index];
                    if (Number.isFinite(v)) val = formatValue(v, pid);
                  } else {
                    // Show live value
                    const live = liveReadings.get(pid.pid);
                    if (live) val = formatValue(live.value, pid);
                  }

                  return (
                    <div
                      key={index}
                      onClick={() => addChannelToSection(index)}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '2px 6px',
                        cursor: 'pointer',
                        background: isInActiveSection ? 'rgba(59,130,246,0.12)' : isAssigned ? 'rgba(255,255,255,0.02)' : 'transparent',
                        borderLeft: isAssigned ? `3px solid ${color}` : '3px solid transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.02)',
                      }}
                    >
                      <span style={{
                        flex: 1, fontSize: '0.62rem', color: isAssigned ? color : T.text,
                        fontWeight: isAssigned ? 'bold' : 'normal',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {pid.shortName}
                      </span>
                      <span style={{
                        width: 55, fontSize: '0.65rem', color: isAssigned ? color : T.textDim,
                        textAlign: 'right', fontWeight: 'bold', fontFamily: FONT.mono,
                        whiteSpace: 'nowrap',
                      }}>
                        {val}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Info */}
              <div style={{
                padding: '3px 6px', borderTop: `1px solid ${T.border}`,
                fontSize: '0.55rem', color: T.textDim,
              }}>
                {cursorIdx !== null ? (
                  <span>Time: {getTimeStr(cursorIdx)} | Sample: {cursorIdx}</span>
                ) : (
                  <span>Hover chart to see values | Scroll to zoom</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Chart area */}
        <div
          ref={chartAreaRef}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            cursor: isZoomed ? 'grab' : 'crosshair', userSelect: 'none',
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
                pids={pidList}
                channelIndices={sec.channelIndices}
                rows={rows}
                startIdx={startIdx}
                endIdx={endIdx}
                cursorIdx={cursorIdx}
                onCursorMove={setCursorIdx}
                height={sectionHeight}
                onRemoveChannel={removeChannel}
              />
            </div>
          ))}
          {/* Time axis / minimap */}
          <div style={{
            height: 24, background: T.headerBg, borderTop: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10,
          }}>
            <span style={{ fontSize: '0.6rem', color: T.textDim }}>Time</span>
            <div style={{
              flex: 1, height: 6, background: 'rgba(255,255,255,0.03)',
              borderRadius: 3, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute',
                left: rows.length > 0 ? `${(startIdx / rows.length) * 100}%` : '0%',
                width: rows.length > 0 ? `${Math.max(2, (visibleCount / rows.length) * 100)}%` : '100%',
                height: '100%', background: T.accent, opacity: 0.4, borderRadius: 3,
              }} />
            </div>
            <span style={{ fontSize: '0.6rem', color: T.textDim }}>
              {getTimeStr(startIdx)} – {getTimeStr(endIdx)}
            </span>
            <span style={{ fontSize: '0.55rem', color: T.textDim }}>
              {isZoomed ? 'Scroll · Drag' : 'Scroll to zoom'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
