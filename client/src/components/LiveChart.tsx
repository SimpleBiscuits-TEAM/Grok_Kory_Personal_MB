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
 * - Auto-scrolling with pause on hover
 * - Grid lines and time axis labels
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { PIDDefinition, PIDReading } from '@/lib/obdConnection';
import { Eye, EyeOff, Maximize2, Minimize2, Clock, TrendingUp } from 'lucide-react';

// ─── Styles ────────────────────────────────────────────────────────────────

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgCard: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  orange: 'oklch(0.65 0.20 55)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.55 0.010 260)',
  textMuted: 'oklch(0.45 0.008 260)',
  purple: 'oklch(0.60 0.20 300)',
};

// Color palette for PID traces — high contrast on dark background
const TRACE_COLORS = [
  '#FF3B3B', // red
  '#00E676', // green
  '#40C4FF', // blue
  '#FFD740', // amber
  '#FF6EFF', // magenta
  '#00E5FF', // cyan
  '#FF9100', // orange
  '#B388FF', // purple
  '#76FF03', // lime
  '#FF80AB', // pink
  '#18FFFF', // teal
  '#FFFF00', // yellow
  '#FF5252', // light red
  '#69F0AE', // light green
  '#448AFF', // light blue
  '#FFE57F', // light amber
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

// ─── Canvas Chart Renderer ─────────────────────────────────────────────────

function drawChart(
  canvas: HTMLCanvasElement,
  traces: TraceData[],
  timeWindow: TimeWindow,
  mouseX: number | null,
  expanded: boolean,
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

  // Find global time range
  const visibleTraces = traces.filter(t => t.visible && t.readings.length > 0);
  if (visibleTraces.length === 0) {
    ctx.fillStyle = '#555';
    ctx.font = '14px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No data to display', w / 2, h / 2);
    return;
  }

  let globalMinTime = Infinity, globalMaxTime = -Infinity;
  for (const trace of visibleTraces) {
    for (const r of trace.readings) {
      if (r.timestamp < globalMinTime) globalMinTime = r.timestamp;
      if (r.timestamp > globalMaxTime) globalMaxTime = r.timestamp;
    }
  }

  // Ensure minimum time range of 2 seconds
  if (globalMaxTime - globalMinTime < 2000) {
    globalMinTime = globalMaxTime - 2000;
  }

  const timeRange = globalMaxTime - globalMinTime;

  // ─── Grid ─────────────────────────────────────────────────────────
  ctx.strokeStyle = '#1A1A1A';
  ctx.lineWidth = 1;

  // Horizontal grid lines (5 lines)
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + plotW, y);
    ctx.stroke();
  }

  // Vertical grid lines (time-based)
  const timeStepMs = timeRange < 15000 ? 2000 : timeRange < 60000 ? 5000 : timeRange < 180000 ? 15000 : 30000;
  const firstGridTime = Math.ceil(globalMinTime / timeStepMs) * timeStepMs;
  ctx.fillStyle = '#444';
  ctx.font = '10px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';

  for (let t = firstGridTime; t <= globalMaxTime; t += timeStepMs) {
    const x = padding.left + ((t - globalMinTime) / timeRange) * plotW;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + plotH);
    ctx.stroke();

    // Time label
    const elapsed = (t - globalMinTime) / 1000;
    const label = elapsed >= 60 ? `${Math.floor(elapsed / 60)}:${(elapsed % 60).toFixed(0).padStart(2, '0')}` : `${elapsed.toFixed(0)}s`;
    ctx.fillText(label, x, padding.top + plotH + 16);
  }

  // ─── Draw traces ──────────────────────────────────────────────────
  for (const trace of visibleTraces) {
    if (trace.readings.length < 2) continue;

    // Compute Y range with 5% padding
    const yMin = trace.min;
    const yMax = trace.max;
    const yRange = yMax - yMin || 1;
    const yPad = yRange * 0.05;
    const effectiveMin = yMin - yPad;
    const effectiveMax = yMax + yPad;
    const effectiveRange = effectiveMax - effectiveMin;

    ctx.strokeStyle = trace.color;
    ctx.lineWidth = expanded ? 2 : 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    let started = false;
    for (const r of trace.readings) {
      const x = padding.left + ((r.timestamp - globalMinTime) / timeRange) * plotW;
      const y = padding.top + plotH - ((r.value - effectiveMin) / effectiveRange) * plotH;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw glow effect for the most recent point
    const lastReading = trace.readings[trace.readings.length - 1];
    const lastX = padding.left + ((lastReading.timestamp - globalMinTime) / timeRange) * plotW;
    const lastY = padding.top + plotH - ((lastReading.value - effectiveMin) / effectiveRange) * plotH;

    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = trace.color;
    ctx.fill();

    // Glow
    ctx.beginPath();
    ctx.arc(lastX, lastY, 8, 0, Math.PI * 2);
    ctx.fillStyle = trace.color + '33';
    ctx.fill();
  }

  // ─── Y-axis labels (use first visible trace's scale) ──────────────
  if (visibleTraces.length > 0) {
    const primaryTrace = visibleTraces[0];
    const yMin = primaryTrace.min;
    const yMax = primaryTrace.max;
    const yRange = yMax - yMin || 1;
    const yPad = yRange * 0.05;
    const effectiveMin = yMin - yPad;
    const effectiveMax = yMax + yPad;

    ctx.fillStyle = primaryTrace.color;
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 4; i++) {
      const frac = i / 4;
      const val = effectiveMin + (effectiveMax - effectiveMin) * (1 - frac);
      const y = padding.top + plotH * frac;
      ctx.fillText(val.toFixed(val > 100 ? 0 : 1), padding.left - 6, y + 3);
    }

    // Unit label
    ctx.save();
    ctx.translate(12, padding.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillText(primaryTrace.pid.unit, 0, 0);
    ctx.restore();
  }

  // ─── Crosshair on hover ───────────────────────────────────────────
  if (mouseX !== null && mouseX >= padding.left && mouseX <= padding.left + plotW) {
    // Vertical crosshair line
    ctx.strokeStyle = '#ffffff44';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(mouseX, padding.top);
    ctx.lineTo(mouseX, padding.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Find time at cursor
    const cursorTime = globalMinTime + ((mouseX - padding.left) / plotW) * timeRange;

    // Draw value labels at crosshair
    let labelY = padding.top + 14;
    for (const trace of visibleTraces) {
      // Find closest reading
      let closest: PIDReading | null = null;
      let closestDist = Infinity;
      for (const r of trace.readings) {
        const dist = Math.abs(r.timestamp - cursorTime);
        if (dist < closestDist) {
          closestDist = dist;
          closest = r;
        }
      }

      if (closest && closestDist < timeRange * 0.05) {
        ctx.fillStyle = '#0D0D0DCC';
        const text = `${trace.pid.shortName}: ${closest.value.toFixed(1)} ${trace.pid.unit}`;
        const metrics = ctx.measureText(text);
        const boxX = mouseX + 8;
        const boxY = labelY - 10;
        ctx.fillRect(boxX - 2, boxY - 2, metrics.width + 8, 16);
        ctx.fillStyle = trace.color;
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(text, boxX + 2, labelY);
        labelY += 16;
      }
    }
  }

  // ─── Border ───────────────────────────────────────────────────────
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding.left, padding.top, plotW, plotH);
}

// ─── LiveChart Component ───────────────────────────────────────────────────

export default function LiveChart({ pids, readingHistory, liveReadings, isLogging }: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const mouseXRef = useRef<number | null>(null);

  const [timeWindow, setTimeWindow] = useState<TimeWindow>(30);
  const [expanded, setExpanded] = useState(false);
  const [hiddenPids, setHiddenPids] = useState<Set<number>>(new Set());

  // Assign colors to PIDs
  const pidColors = useMemo(() => {
    const map = new Map<number, string>();
    pids.forEach((pid, i) => {
      map.set(pid.pid, TRACE_COLORS[i % TRACE_COLORS.length]);
    });
    return map;
  }, [pids]);

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

  // Mouse tracking for crosshair
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseXRef.current = e.clientX - rect.left;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseXRef.current = null;
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let running = true;

    const render = () => {
      if (!running) return;
      drawChart(canvas, traces, timeWindow, mouseXRef.current, expanded);
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [traces, timeWindow, expanded]);

  const chartHeight = expanded ? 500 : 280;
  const timeWindowOptions: { value: TimeWindow; label: string }[] = [
    { value: 10, label: '10s' },
    { value: 30, label: '30s' },
    { value: 60, label: '1m' },
    { value: 300, label: '5m' },
    { value: -1, label: 'ALL' },
  ];

  const hasData = traces.some(t => t.readings.length > 0);

  return (
    <div style={{
      background: sColor.bgCard,
      border: `1px solid ${sColor.border}`,
      borderRadius: '3px',
      overflow: 'hidden',
    }}>
      {/* Chart Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '8px' }}>
          <Clock style={{ width: 12, height: 12, color: sColor.textDim }} />
          {timeWindowOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setTimeWindow(opt.value)}
              style={{
                padding: '2px 8px',
                background: timeWindow === opt.value ? sColor.red : 'transparent',
                border: `1px solid ${timeWindow === opt.value ? sColor.red : sColor.borderLight}`,
                borderRadius: '2px',
                color: timeWindow === opt.value ? 'white' : sColor.textDim,
                fontFamily: sFont.mono, fontSize: '0.65rem',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
            >
              {opt.label}
            </button>
          ))}
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

      {/* Canvas Chart */}
      <div style={{ position: 'relative', height: `${chartHeight}px` }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            width: '100%', height: '100%',
            display: 'block', cursor: 'crosshair',
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
              {/* Color dot */}
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: trace.color, flexShrink: 0,
              }} />
              {/* PID name */}
              <span style={{
                fontFamily: sFont.mono, fontSize: '0.65rem',
                color: trace.visible ? sColor.text : sColor.textMuted,
              }}>
                {isMode22 && <span style={{ color: sColor.orange, marginRight: '3px' }}>M22</span>}
                {trace.pid.shortName}
              </span>
              {/* Current value */}
              {trace.visible && trace.readings.length > 0 && (
                <span style={{
                  fontFamily: sFont.mono, fontSize: '0.6rem', color: trace.color,
                  fontWeight: 700,
                }}>
                  {trace.current.toFixed(trace.current > 100 ? 0 : 1)}
                </span>
              )}
              {/* Visibility icon */}
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
                style={{
                  background: 'oklch(0.08 0.004 260)',
                  padding: '8px 12px',
                }}
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
