/**
 * LiveChart — High-performance real-time data visualization for the Datalogger
 * 
 * Uses HTML5 Canvas for smooth 60fps rendering of multiple PID traces.
 * Features:
 * - Multi-PID overlay with color-coded traces and independent Y-axis scaling
 * - Configurable time window (10s, 30s, 60s, 5min, all)
 * - PID toggle to show/hide individual traces
 * - Min/Max/Current value indicators per PID
 * - Crosshair cursor with value readout
 * - Mouse wheel zoom (zooms into cursor position on time axis)
 * - Click-drag pan (horizontal scrolling through time)
 * - Touch pinch-to-zoom and drag-to-pan gesture support
 * - Minimap overview bar showing full session with viewport indicator
 * - Auto-scroll pauses when zoomed/panned, resumes on reset
 * - Grid lines and time axis labels
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { PIDDefinition, PIDReading } from '@/lib/obdConnection';
import {
  Eye, EyeOff, Maximize2, Minimize2, Clock, TrendingUp,
  ZoomIn, ZoomOut, RotateCcw, Move, Lock, Unlock
} from 'lucide-react';

// ─── Styles ────────────────────────────────────────────────────────────────

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  orange: 'oklch(0.65 0.20 55)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
  purple: 'oklch(0.60 0.20 300)',
};

const TRACE_COLORS = [
  '#FF3B3B', '#00E676', '#40C4FF', '#FFD740',
  '#FF6EFF', '#00E5FF', '#FF9100', '#B388FF',
  '#76FF03', '#FF80AB', '#18FFFF', '#FFFF00',
  '#FF5252', '#69F0AE', '#448AFF', '#FFE57F',
];

// ─── Types ─────────────────────────────────────────────────────────────────

interface TraceData {
  pid: PIDDefinition;
  readings: PIDReading[];
  color: string;
  visible: boolean;
  min: number;
  max: number;
  current: number;
  avg: number;
}

type TimeWindow = 10 | 30 | 60 | 300 | -1;

interface LiveChartProps {
  pids: PIDDefinition[];
  readingHistory: Map<number, PIDReading[]>;
  liveReadings: Map<number, PIDReading>;
  isLogging: boolean;
}

/** Viewport state for zoom/pan — represents the visible time range */
export interface ViewportState {
  /** Zoom level: 1.0 = fit all data, >1 = zoomed in */
  zoomLevel: number;
  /** Pan offset in ms from the right edge (0 = showing latest data) */
  panOffsetMs: number;
  /** Whether auto-scroll is locked (follows latest data) */
  autoScroll: boolean;
}

const DEFAULT_VIEWPORT: ViewportState = {
  zoomLevel: 1.0,
  panOffsetMs: 0,
  autoScroll: true,
};

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 50.0;
const ZOOM_SENSITIVITY = 0.002;
const PAN_SENSITIVITY = 1.0;

// ─── Chart Data Manager ────────────────────────────────────────────────────

export function computeTraceStats(readings: PIDReading[]): { min: number; max: number; avg: number; current: number } {
  if (readings.length === 0) return { min: 0, max: 0, avg: 0, current: 0 };
  let min = Infinity, max = -Infinity, sum = 0;
  for (const r of readings) {
    if (r.value < min) min = r.value;
    if (r.value > max) max = r.value;
    sum += r.value;
  }
  return {
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    avg: sum / readings.length,
    current: readings[readings.length - 1].value,
  };
}

export function filterReadingsByTimeWindow(readings: PIDReading[], windowSeconds: TimeWindow): PIDReading[] {
  if (windowSeconds === -1 || readings.length === 0) return readings;
  const cutoff = Date.now() - windowSeconds * 1000;
  return readings.filter(r => r.timestamp >= cutoff);
}

/**
 * Compute the visible time range given a viewport state and the full data range.
 * Returns [viewMinTime, viewMaxTime] in ms.
 */
export function computeVisibleRange(
  dataMinTime: number,
  dataMaxTime: number,
  viewport: ViewportState,
): [number, number] {
  const fullRange = dataMaxTime - dataMinTime;
  if (fullRange <= 0) return [dataMinTime, dataMaxTime];

  const visibleDuration = fullRange / viewport.zoomLevel;

  if (viewport.autoScroll) {
    // Locked to latest data
    return [dataMaxTime - visibleDuration, dataMaxTime];
  }

  // Manual pan: offset from right edge
  const viewMax = dataMaxTime - viewport.panOffsetMs;
  const viewMin = viewMax - visibleDuration;
  return [viewMin, viewMax];
}

/**
 * Clamp viewport so it doesn't pan beyond data boundaries.
 */
export function clampViewport(viewport: ViewportState, dataMinTime: number, dataMaxTime: number): ViewportState {
  const fullRange = dataMaxTime - dataMinTime;
  if (fullRange <= 0) return viewport;

  const visibleDuration = fullRange / viewport.zoomLevel;
  const maxPan = Math.max(0, fullRange - visibleDuration);

  return {
    ...viewport,
    zoomLevel: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoomLevel)),
    panOffsetMs: Math.max(0, Math.min(maxPan, viewport.panOffsetMs)),
  };
}

// ─── Canvas Chart Renderer ─────────────────────────────────────────────────

function drawChart(
  canvas: HTMLCanvasElement,
  traces: TraceData[],
  viewport: ViewportState,
  mouseX: number | null,
  mouseY: number | null,
  expanded: boolean,
  isDragging: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 10, right: 16, bottom: 30, left: 60 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  // Clear
  ctx.fillStyle = '#0D0D0D';
  ctx.fillRect(0, 0, w, h);

  const visibleTraces = traces.filter(t => t.visible && t.readings.length > 0);
  if (visibleTraces.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '14px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No data to display', w / 2, h / 2);
    return;
  }

  // Compute full data range
  let dataMinTime = Infinity, dataMaxTime = -Infinity;
  for (const trace of visibleTraces) {
    for (const r of trace.readings) {
      if (r.timestamp < dataMinTime) dataMinTime = r.timestamp;
      if (r.timestamp > dataMaxTime) dataMaxTime = r.timestamp;
    }
  }
  if (dataMaxTime - dataMinTime < 2000) dataMinTime = dataMaxTime - 2000;

  // Apply viewport zoom/pan
  const [viewMinTime, viewMaxTime] = computeVisibleRange(dataMinTime, dataMaxTime, viewport);
  const viewRange = viewMaxTime - viewMinTime;

  // ─── Grid ─────────────────────────────────────────────────────────
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }

  const timeStepMs = viewRange < 5000 ? 1000 : viewRange < 15000 ? 2000 : viewRange < 60000 ? 5000 : viewRange < 180000 ? 15000 : 30000;
  const firstGridTime = Math.ceil(viewMinTime / timeStepMs) * timeStepMs;
  ctx.fillStyle = '#444';
  ctx.font = '10px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';

  for (let t = firstGridTime; t <= viewMaxTime; t += timeStepMs) {
    const x = padding.left + ((t - viewMinTime) / viewRange) * plotW;
    if (x < padding.left || x > padding.left + plotW) continue;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotH);
    ctx.stroke();

    const elapsed = (t - dataMinTime) / 1000;
    const label = elapsed >= 60 ? `${Math.floor(elapsed / 60)}:${(elapsed % 60).toFixed(0).padStart(2, '0')}` : `${elapsed.toFixed(1)}s`;
    ctx.fillText(label, x, padding.top + plotH + 16);
  }

  // ─── Draw traces (clipped to viewport) ────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(padding.left, padding.top, plotW, plotH);
  ctx.clip();

  for (const trace of visibleTraces) {
    if (trace.readings.length < 2) continue;

    const yMin = trace.min;
    const yMax = trace.max;
    const yRange = yMax - yMin || 1;
    // Calm down sensitivity: use at least 15% padding, and enforce a minimum Y range
    // based on the PID's defined range so small fluctuations don't fill the whole chart
    const pidFullRange = (trace.pid.max ?? 0) - (trace.pid.min ?? 0);
    const minRange = pidFullRange > 0 ? pidFullRange * 0.10 : Math.max(yRange * 3, 5);
    const displayRange = Math.max(yRange, minRange);
    const center = (yMin + yMax) / 2;
    const yPad = displayRange * 0.15;
    const effectiveMin = center - displayRange / 2 - yPad;
    const effectiveMax = center + displayRange / 2 + yPad;
    const effectiveRange = effectiveMax - effectiveMin;

    ctx.strokeStyle = trace.color;
    ctx.lineWidth = expanded ? 2 : 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    let started = false;
    for (const r of trace.readings) {
      const x = padding.left + ((r.timestamp - viewMinTime) / viewRange) * plotW;
      const y = padding.top + plotH - ((r.value - effectiveMin) / effectiveRange) * plotH;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Glow on most recent visible point
    const lastVisible = trace.readings.filter(r => r.timestamp >= viewMinTime && r.timestamp <= viewMaxTime);
    if (lastVisible.length > 0) {
      const last = lastVisible[lastVisible.length - 1];
      const lx = padding.left + ((last.timestamp - viewMinTime) / viewRange) * plotW;
      const ly = padding.top + plotH - ((last.value - effectiveMin) / effectiveRange) * plotH;

      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fillStyle = trace.color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(lx, ly, 8, 0, Math.PI * 2);
      ctx.fillStyle = trace.color + '33';
      ctx.fill();
    }
  }

  ctx.restore();

  // ─── Y-axis labels ────────────────────────────────────────────────
  if (visibleTraces.length > 0) {
    const pt = visibleTraces[0];
    const yRange = pt.max - pt.min || 1;
    const pidFullRangeLabel = (pt.pid.max ?? 0) - (pt.pid.min ?? 0);
    const minRangeLabel = pidFullRangeLabel > 0 ? pidFullRangeLabel * 0.10 : Math.max(yRange * 3, 5);
    const displayRangeLabel = Math.max(yRange, minRangeLabel);
    const centerLabel = (pt.min + pt.max) / 2;
    const yPadLabel = displayRangeLabel * 0.15;
    const eMin = centerLabel - displayRangeLabel / 2 - yPadLabel;
    const eMax = centerLabel + displayRangeLabel / 2 + yPadLabel;

    ctx.fillStyle = pt.color;
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const val = eMin + (eMax - eMin) * (1 - frac);
      const y = padding.top + plotH * frac;
      ctx.fillText(val.toFixed(val > 100 ? 0 : 1), padding.left - 6, y + 3);
    }

    ctx.save();
    ctx.translate(12, padding.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillText(pt.pid.unit, 0, 0);
    ctx.restore();
  }

  // ─── Crosshair on hover (not while dragging) ─────────────────────
  if (mouseX !== null && mouseY !== null && !isDragging &&
      mouseX >= padding.left && mouseX <= padding.left + plotW &&
      mouseY >= padding.top && mouseY <= padding.top + plotH) {
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    // Vertical
    ctx.beginPath();
    ctx.moveTo(mouseX, padding.top);
    ctx.lineTo(mouseX, padding.top + plotH);
    ctx.stroke();
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(padding.left, mouseY);
    ctx.lineTo(padding.left + plotW, mouseY);
    ctx.stroke();
    ctx.setLineDash([]);

    const cursorTime = viewMinTime + ((mouseX - padding.left) / plotW) * viewRange;

    let labelY = padding.top + 14;
    for (const trace of visibleTraces) {
      let closest: PIDReading | null = null;
      let closestDist = Infinity;
      for (const r of trace.readings) {
        const dist = Math.abs(r.timestamp - cursorTime);
        if (dist < closestDist) {
          closestDist = dist;
          closest = r;
        }
      }

      if (closest && closestDist < viewRange * 0.05) {
        const text = `${trace.pid.shortName}: ${closest.value.toFixed(1)} ${trace.pid.unit}`;
        const metrics = ctx.measureText(text);
        let boxX = mouseX + 10;
        // Flip label to left if too close to right edge
        if (boxX + metrics.width + 12 > padding.left + plotW) {
          boxX = mouseX - metrics.width - 16;
        }
        const boxY = labelY - 10;
        ctx.fillStyle = '#0D0D0DEE';
        ctx.fillRect(boxX - 4, boxY - 2, metrics.width + 12, 16);
        ctx.strokeStyle = trace.color + '66';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX - 4, boxY - 2, metrics.width + 12, 16);
        ctx.fillStyle = trace.color;
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(text, boxX + 2, labelY);
        labelY += 18;
      }
    }
  }

  // ─── Drag indicator ───────────────────────────────────────────────
  if (isDragging) {
    ctx.fillStyle = '#ffffff11';
    ctx.fillRect(padding.left, padding.top, plotW, plotH);
  }

  // ─── Border ───────────────────────────────────────────────────────
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding.left, padding.top, plotW, plotH);

  // ─── Minimap (overview bar at bottom of plot area) ────────────────
  if (viewport.zoomLevel > 1.05) {
    const mmH = 20;
    const mmY = padding.top + plotH - mmH - 4;
    const mmX = padding.left + 4;
    const mmW = plotW - 8;

    // Background
    ctx.fillStyle = '#0D0D0DCC';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    // Draw mini traces
    const fullRange = dataMaxTime - dataMinTime;
    for (const trace of visibleTraces) {
      if (trace.readings.length < 2) continue;
      const yRange = trace.max - trace.min || 1;
      ctx.strokeStyle = trace.color + '66';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let s = false;
      for (let i = 0; i < trace.readings.length; i += Math.max(1, Math.floor(trace.readings.length / mmW))) {
        const r = trace.readings[i];
        const mx = mmX + ((r.timestamp - dataMinTime) / fullRange) * mmW;
        const my = mmY + mmH - ((r.value - trace.min) / yRange) * (mmH - 4) - 2;
        if (!s) { ctx.moveTo(mx, my); s = true; } else { ctx.lineTo(mx, my); }
      }
      ctx.stroke();
    }

    // Viewport indicator rectangle
    const vpLeft = mmX + ((viewMinTime - dataMinTime) / fullRange) * mmW;
    const vpRight = mmX + ((viewMaxTime - dataMinTime) / fullRange) * mmW;
    const vpW = Math.max(4, vpRight - vpLeft);

    ctx.fillStyle = '#ffffff15';
    ctx.fillRect(vpLeft, mmY, vpW, mmH);
    ctx.strokeStyle = '#FF3B3B88';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vpLeft, mmY, vpW, mmH);

    // Label
    ctx.fillStyle = '#888';
    ctx.font = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${viewport.zoomLevel.toFixed(1)}x`, mmX + mmW / 2, mmY - 3);
  }
}

// ─── LiveChart Component ───────────────────────────────────────────────────

export default function LiveChart({ pids, readingHistory, liveReadings, isLogging }: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const mouseXRef = useRef<number | null>(null);
  const mouseYRef = useRef<number | null>(null);

  const [timeWindow, setTimeWindow] = useState<TimeWindow>(30);
  const [expanded, setExpanded] = useState(false);
  const [hiddenPids, setHiddenPids] = useState<Set<number>>(new Set());
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [isDragging, setIsDragging] = useState(false);

  // Refs for drag state (avoid re-renders during drag)
  const dragStartRef = useRef<{ x: number; panOffset: number } | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Touch state refs
  const touchStartRef = useRef<{ touches: { x: number; y: number }[]; pinchDist: number; panOffset: number; zoom: number } | null>(null);

  // Assign colors to PIDs
  const pidColors = useMemo(() => {
    const map = new Map<number, string>();
    pids.forEach((pid, i) => {
      map.set(pid.pid, TRACE_COLORS[i % TRACE_COLORS.length]);
    });
    return map;
  }, [pids]);

  // Compute full data time range (needed for zoom/pan calculations)
  const dataTimeRange = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const pid of pids) {
      const readings = readingHistory.get(pid.pid) || [];
      const windowed = filterReadingsByTimeWindow(readings, timeWindow);
      for (const r of windowed) {
        if (r.timestamp < min) min = r.timestamp;
        if (r.timestamp > max) max = r.timestamp;
      }
    }
    return { min: min === Infinity ? Date.now() - 2000 : min, max: max === -Infinity ? Date.now() : max };
  }, [pids, readingHistory, timeWindow]);

  // Build trace data
  const traces = useMemo((): TraceData[] => {
    return pids.map(pid => {
      const allReadings = readingHistory.get(pid.pid) || [];
      const windowedReadings = filterReadingsByTimeWindow(allReadings, timeWindow);
      const stats = computeTraceStats(windowedReadings);
      const live = liveReadings.get(pid.pid);

      return {
        pid,
        readings: windowedReadings,
        color: pidColors.get(pid.pid) || TRACE_COLORS[0],
        visible: !hiddenPids.has(pid.pid),
        min: stats.min,
        max: stats.max,
        current: live?.value ?? stats.current,
        avg: stats.avg,
      };
    });
  }, [pids, readingHistory, liveReadings, timeWindow, hiddenPids, pidColors]);

  // Toggle PID visibility
  const togglePid = useCallback((pidId: number) => {
    setHiddenPids(prev => {
      const next = new Set(prev);
      if (next.has(pidId)) next.delete(pidId);
      else next.add(pidId);
      return next;
    });
  }, []);

  // ─── Mouse wheel zoom ────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseXInPlot = e.clientX - rect.left;
    const padding = { left: 60, right: 16 };
    const plotW = rect.width - padding.left - padding.right;

    // Only zoom if mouse is within plot area
    if (mouseXInPlot < padding.left || mouseXInPlot > padding.left + plotW) return;

    const cursorFraction = (mouseXInPlot - padding.left) / plotW;

    setViewport(prev => {
      const fullRange = dataTimeRange.max - dataTimeRange.min;
      if (fullRange <= 0) return prev;

      // Compute zoom delta
      const zoomDelta = -e.deltaY * ZOOM_SENSITIVITY;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoomLevel * (1 + zoomDelta)));

      if (newZoom <= 1.01) {
        // Reset to default
        return { zoomLevel: 1.0, panOffsetMs: 0, autoScroll: true };
      }

      // Compute current visible range
      const oldVisibleDuration = fullRange / prev.zoomLevel;
      const newVisibleDuration = fullRange / newZoom;

      // The time at cursor position should stay at the same screen position
      const [oldViewMin] = computeVisibleRange(dataTimeRange.min, dataTimeRange.max, prev);
      const cursorTime = oldViewMin + cursorFraction * oldVisibleDuration;
      const newViewMin = cursorTime - cursorFraction * newVisibleDuration;
      const newViewMax = newViewMin + newVisibleDuration;
      const newPanOffset = dataTimeRange.max - newViewMax;

      const clamped = clampViewport(
        { zoomLevel: newZoom, panOffsetMs: newPanOffset, autoScroll: false },
        dataTimeRange.min,
        dataTimeRange.max,
      );
      return clamped;
    });
  }, [dataTimeRange]);

  // ─── Mouse drag pan ──────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const padding = { left: 60, right: 16 };
    const plotW = rect.width - padding.left - padding.right;
    if (mx < padding.left || mx > padding.left + plotW) return;

    // Only allow drag when zoomed in
    if (viewportRef.current.zoomLevel <= 1.01) return;

    dragStartRef.current = { x: e.clientX, panOffset: viewportRef.current.panOffsetMs };
    setIsDragging(true);
  }, []);

  const handleMouseMoveGlobal = useCallback((e: MouseEvent) => {
    if (!dragStartRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const padding = { left: 60, right: 16 };
    const plotW = rect.width - padding.left - padding.right;
    const fullRange = dataTimeRange.max - dataTimeRange.min;
    if (fullRange <= 0 || plotW <= 0) return;

    const dx = e.clientX - dragStartRef.current.x;
    const msPerPixel = (fullRange / viewportRef.current.zoomLevel) / plotW;
    const panDelta = dx * msPerPixel * PAN_SENSITIVITY;

    setViewport(prev => {
      const newPan = dragStartRef.current!.panOffset + panDelta;
      return clampViewport(
        { ...prev, panOffsetMs: newPan, autoScroll: false },
        dataTimeRange.min,
        dataTimeRange.max,
      );
    });
  }, [dataTimeRange]);

  const handleMouseUpGlobal = useCallback(() => {
    dragStartRef.current = null;
    setIsDragging(false);
  }, []);

  // ─── Touch gestures ──────────────────────────────────────────────
  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch = pan
      if (viewportRef.current.zoomLevel <= 1.01) return;
      const t = e.touches[0];
      touchStartRef.current = {
        touches: [{ x: t.clientX, y: t.clientY }],
        pinchDist: 0,
        panOffset: viewportRef.current.panOffsetMs,
        zoom: viewportRef.current.zoomLevel,
      };
    } else if (e.touches.length === 2) {
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      touchStartRef.current = {
        touches: [{ x: t0.clientX, y: t0.clientY }, { x: t1.clientX, y: t1.clientY }],
        pinchDist: dist,
        panOffset: viewportRef.current.panOffsetMs,
        zoom: viewportRef.current.zoomLevel,
      };
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;

    if (e.touches.length === 1 && touchStartRef.current.touches.length === 1) {
      // Single touch pan
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const padding = { left: 60, right: 16 };
      const plotW = rect.width - padding.left - padding.right;
      const fullRange = dataTimeRange.max - dataTimeRange.min;
      if (fullRange <= 0 || plotW <= 0) return;

      const dx = e.touches[0].clientX - touchStartRef.current.touches[0].x;
      const msPerPixel = (fullRange / viewportRef.current.zoomLevel) / plotW;
      const panDelta = dx * msPerPixel;

      setViewport(prev => clampViewport(
        { ...prev, panOffsetMs: touchStartRef.current!.panOffset + panDelta, autoScroll: false },
        dataTimeRange.min,
        dataTimeRange.max,
      ));
    } else if (e.touches.length === 2 && touchStartRef.current.pinchDist > 0) {
      // Pinch zoom
      e.preventDefault();
      const t0 = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const scale = dist / touchStartRef.current.pinchDist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, touchStartRef.current.zoom * scale));

      if (newZoom <= 1.01) {
        setViewport({ zoomLevel: 1.0, panOffsetMs: 0, autoScroll: true });
      } else {
        setViewport(prev => clampViewport(
          { ...prev, zoomLevel: newZoom, autoScroll: false },
          dataTimeRange.min,
          dataTimeRange.max,
        ));
      }
    }
  }, [dataTimeRange]);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  // ─── Register global mouse/touch listeners ────────────────────────
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMoveGlobal);
    document.addEventListener('mouseup', handleMouseUpGlobal);
    return () => {
      document.removeEventListener('mousemove', handleMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUpGlobal);
    };
  }, [handleMouseMoveGlobal, handleMouseUpGlobal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Mouse tracking for crosshair
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseXRef.current = e.clientX - rect.left;
    mouseYRef.current = e.clientY - rect.top;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseXRef.current = null;
    mouseYRef.current = null;
  }, []);

  // Reset viewport
  const resetViewport = useCallback(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, []);

  // Zoom in/out buttons
  const zoomIn = useCallback(() => {
    setViewport(prev => {
      const newZoom = Math.min(MAX_ZOOM, prev.zoomLevel * 1.5);
      return clampViewport(
        { ...prev, zoomLevel: newZoom, autoScroll: false },
        dataTimeRange.min,
        dataTimeRange.max,
      );
    });
  }, [dataTimeRange]);

  const zoomOut = useCallback(() => {
    setViewport(prev => {
      const newZoom = Math.max(MIN_ZOOM, prev.zoomLevel / 1.5);
      if (newZoom <= 1.01) return DEFAULT_VIEWPORT;
      return clampViewport(
        { ...prev, zoomLevel: newZoom },
        dataTimeRange.min,
        dataTimeRange.max,
      );
    });
  }, [dataTimeRange]);

  // Toggle auto-scroll
  const toggleAutoScroll = useCallback(() => {
    setViewport(prev => {
      if (prev.autoScroll) return prev; // Already on
      return { ...prev, panOffsetMs: 0, autoScroll: true };
    });
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let running = true;
    const render = () => {
      if (!running) return;
      drawChart(canvas, traces, viewportRef.current, mouseXRef.current, mouseYRef.current, expanded, isDragging);
      animFrameRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [traces, expanded, isDragging]);

  const chartHeight = expanded ? 500 : 280;
  const timeWindowOptions: { value: TimeWindow; label: string }[] = [
    { value: 10, label: '10s' },
    { value: 30, label: '30s' },
    { value: 60, label: '1m' },
    { value: 300, label: '5m' },
    { value: -1, label: 'ALL' },
  ];

  const hasData = traces.some(t => t.readings.length > 0);
  const isZoomed = viewport.zoomLevel > 1.05;

  return (
    <div ref={containerRef} style={{
      background: sColor.bgCard,
      border: `1px solid ${sColor.border}`,
      borderRadius: '3px',
      overflow: 'hidden',
    }}>
      {/* Chart Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '10px 16px', borderBottom: `1px solid ${sColor.borderLight}`,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp style={{ width: 16, height: 16, color: sColor.red }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.1em' }}>
            REAL-TIME CHART
          </span>
        </div>

        {/* Time Window Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
          <Clock style={{ width: 12, height: 12, color: sColor.textDim }} />
          {timeWindowOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setTimeWindow(opt.value); resetViewport(); }}
              style={{
                padding: '2px 8px',
                background: timeWindow === opt.value ? sColor.red : 'transparent',
                border: `1px solid ${timeWindow === opt.value ? sColor.red : sColor.borderLight}`,
                borderRadius: '2px',
                color: timeWindow === opt.value ? 'white' : sColor.textDim,
                fontFamily: sFont.mono, fontSize: '0.65rem',
                cursor: 'pointer', letterSpacing: '0.05em',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
          <button onClick={zoomOut} title="Zoom Out" style={{
            padding: '2px 6px', background: 'transparent',
            border: `1px solid ${sColor.borderLight}`, borderRadius: '2px',
            color: sColor.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <ZoomOut style={{ width: 12, height: 12 }} />
          </button>

          {/* Zoom level indicator */}
          <span style={{
            fontFamily: sFont.mono, fontSize: '0.6rem', minWidth: '36px', textAlign: 'center',
            color: isZoomed ? sColor.yellow : sColor.textMuted,
            fontWeight: isZoomed ? 700 : 400,
          }}>
            {viewport.zoomLevel.toFixed(1)}x
          </span>

          <button onClick={zoomIn} title="Zoom In" style={{
            padding: '2px 6px', background: 'transparent',
            border: `1px solid ${sColor.borderLight}`, borderRadius: '2px',
            color: sColor.textDim, cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <ZoomIn style={{ width: 12, height: 12 }} />
          </button>

          {/* Reset zoom */}
          {isZoomed && (
            <button onClick={resetViewport} title="Reset Zoom" style={{
              padding: '2px 6px', background: sColor.red + '33',
              border: `1px solid ${sColor.red}66`, borderRadius: '2px',
              color: sColor.red, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
              fontFamily: sFont.mono, fontSize: '0.6rem',
            }}>
              <RotateCcw style={{ width: 10, height: 10 }} />
              RESET
            </button>
          )}

          {/* Auto-scroll toggle */}
          {isZoomed && (
            <button onClick={toggleAutoScroll} title={viewport.autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF (click to follow latest)'} style={{
              padding: '2px 6px',
              background: viewport.autoScroll ? sColor.green + '22' : 'transparent',
              border: `1px solid ${viewport.autoScroll ? sColor.green + '66' : sColor.borderLight}`,
              borderRadius: '2px',
              color: viewport.autoScroll ? sColor.green : sColor.textMuted,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
              fontFamily: sFont.mono, fontSize: '0.6rem',
            }}>
              {viewport.autoScroll
                ? <Unlock style={{ width: 10, height: 10 }} />
                : <Lock style={{ width: 10, height: 10 }} />
              }
              {viewport.autoScroll ? 'LIVE' : 'PAUSED'}
            </button>
          )}
        </div>

        {/* Expand/Collapse */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', background: 'transparent',
            border: `1px solid ${sColor.borderLight}`, borderRadius: '2px',
            color: sColor.textDim, fontFamily: sFont.mono, fontSize: '0.65rem',
            cursor: 'pointer',
          }}
        >
          {expanded ? <Minimize2 style={{ width: 12, height: 12 }} /> : <Maximize2 style={{ width: 12, height: 12 }} />}
          {expanded ? 'COLLAPSE' : 'EXPAND'}
        </button>
      </div>

      {/* Zoom hint bar */}
      {hasData && !isZoomed && (
        <div style={{
          padding: '3px 16px', background: 'oklch(0.08 0.004 260)',
          borderBottom: `1px solid ${sColor.borderLight}`,
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Move style={{ width: 10, height: 10, color: sColor.textMuted }} />
          <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
            SCROLL TO ZOOM · DRAG TO PAN · PINCH ON TOUCH
          </span>
        </div>
      )}

      {/* Canvas Chart */}
      <div style={{ position: 'relative', height: `${chartHeight}px` }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            width: '100%', height: '100%',
            display: 'block',
            cursor: isDragging ? 'grabbing' : isZoomed ? 'grab' : 'crosshair',
            touchAction: 'none',
          }}
        />
        {!hasData && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '8px',
          }}>
            <TrendingUp style={{ width: 32, height: 32, color: sColor.textMuted }} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textMuted }}>
              {isLogging ? 'Waiting for data...' : 'Start logging to see real-time data'}
            </span>
          </div>
        )}
      </div>

      {/* PID Legend / Toggle Bar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '4px',
        padding: '8px 16px', borderTop: `1px solid ${sColor.borderLight}`,
        background: 'oklch(0.08 0.004 260)',
      }}>
        {traces.map(trace => {
          const isMode22 = (trace.pid.service ?? 0x01) === 0x22;
          return (
            <button
              key={`${trace.pid.service}-${trace.pid.pid}`}
              onClick={() => togglePid(trace.pid.pid)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px',
                background: trace.visible ? `${trace.color}15` : 'transparent',
                border: `1px solid ${trace.visible ? trace.color + '66' : sColor.borderLight}`,
                borderRadius: '3px',
                cursor: 'pointer',
                opacity: trace.visible ? 1 : 0.4,
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: trace.color, flexShrink: 0,
              }} />
              <span style={{
                fontFamily: sFont.mono, fontSize: '0.65rem',
                color: trace.visible ? sColor.text : sColor.textMuted,
              }}>
                {isMode22 && <span style={{ color: sColor.orange, marginRight: '3px' }}>M22</span>}
                {trace.pid.shortName}
              </span>
              {trace.visible && trace.readings.length > 0 && (
                <span style={{
                  fontFamily: sFont.mono, fontSize: '0.6rem', color: trace.color,
                  fontWeight: 700,
                }}>
                  {trace.current.toFixed(trace.current > 100 ? 0 : 1)}
                </span>
              )}
              {trace.visible
                ? <Eye style={{ width: 10, height: 10, color: sColor.textDim }} />
                : <EyeOff style={{ width: 10, height: 10, color: sColor.textMuted }} />
              }
            </button>
          );
        })}
      </div>

      {/* Stats Bar */}
      {hasData && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(traces.filter(t => t.visible).length, 6)}, 1fr)`,
          gap: '1px', background: sColor.borderLight,
          borderTop: `1px solid ${sColor.borderLight}`,
        }}>
          {traces.filter(t => t.visible && t.readings.length > 0).slice(0, 6).map(trace => {
            const isMode22 = (trace.pid.service ?? 0x01) === 0x22;
            return (
              <div
                key={`stat-${trace.pid.service}-${trace.pid.pid}`}
                style={{ background: 'oklch(0.08 0.004 260)', padding: '8px 12px' }}
              >
                <div style={{
                  fontFamily: sFont.mono, fontSize: '0.6rem',
                  color: trace.color, marginBottom: '4px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                }}>
                  <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: trace.color, flexShrink: 0,
                  }} />
                  {isMode22 && <span style={{ color: sColor.orange }}>M22</span>}
                  {trace.pid.shortName}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, letterSpacing: '0.05em' }}>MIN</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.blue }}>
                      {trace.min.toFixed(trace.min > 100 ? 0 : 1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, letterSpacing: '0.05em' }}>AVG</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.yellow }}>
                      {trace.avg.toFixed(trace.avg > 100 ? 0 : 1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, letterSpacing: '0.05em' }}>MAX</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.red }}>
                      {trace.max.toFixed(trace.max > 100 ? 0 : 1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, letterSpacing: '0.05em' }}>NOW</div>
                    <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text, fontWeight: 700 }}>
                      {trace.current.toFixed(trace.current > 100 ? 0 : 1)}
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted, marginTop: '2px' }}>
                  {trace.pid.unit}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
