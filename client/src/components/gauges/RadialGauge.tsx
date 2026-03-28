/**
 * RadialGauge — Motorsport-style circular gauge with animated needle
 * 
 * Features:
 * - SVG-based circular gauge with tick marks and arc segments
 * - Animated needle with smooth transitions
 * - Carbon fiber texture background
 * - Chrome bezel ring
 * - Color-coded zones (blue → green → yellow → red)
 * - Digital readout with unit display
 * - Configurable size (large primary, medium, small secondary)
 */

import { useMemo } from 'react';
import type { PIDDefinition, PIDReading } from '@/lib/obdConnection';

// ─── Types ─────────────────────────────────────────────────────────────────

export type GaugeSize = 'large' | 'medium' | 'small';

export interface RadialGaugeProps {
  pid: PIDDefinition | null;
  reading: PIDReading | null;
  size?: GaugeSize;
  onRightClick?: (e: React.MouseEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
  isEmpty?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const SIZE_CONFIG: Record<GaugeSize, { diameter: number; fontSize: number; labelSize: number; unitSize: number; tickLength: number; needleWidth: number }> = {
  large:  { diameter: 220, fontSize: 32, labelSize: 11, unitSize: 10, tickLength: 14, needleWidth: 3 },
  medium: { diameter: 170, fontSize: 24, labelSize: 9,  unitSize: 8,  tickLength: 10, needleWidth: 2.5 },
  small:  { diameter: 130, fontSize: 18, labelSize: 7,  unitSize: 7,  tickLength: 8,  needleWidth: 2 },
};

const START_ANGLE = 225;  // degrees (7 o'clock position)
const END_ANGLE = -45;    // degrees (5 o'clock position)
const SWEEP = 270;        // total sweep in degrees

// ─── Helpers ───────────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const sweep = startAngle - endAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function getZoneColor(pct: number): string {
  if (pct < 0.25) return 'oklch(0.65 0.18 220)';   // cool blue
  if (pct < 0.55) return 'oklch(0.70 0.20 155)';   // green
  if (pct < 0.78) return 'oklch(0.75 0.18 70)';    // yellow/amber
  return 'oklch(0.58 0.22 25)';                      // red
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function RadialGauge({
  pid, reading, size = 'medium', onRightClick, onDrop, isDragOver, isEmpty,
}: RadialGaugeProps) {
  const cfg = SIZE_CONFIG[size];
  const r = cfg.diameter / 2;
  const cx = r;
  const cy = r;
  const outerR = r - 6;
  const arcR = r - 20;
  const tickOuterR = r - 12;
  const tickInnerR = tickOuterR - cfg.tickLength;
  const labelR = tickInnerR - (size === 'small' ? 8 : 12);

  const value = reading?.value ?? 0;
  const min = pid?.min ?? 0;
  const max = pid?.max ?? 100;
  const range = max - min || 1;
  const pct = Math.max(0, Math.min(1, (value - min) / range));

  // Needle angle: from START_ANGLE sweeping clockwise by pct * SWEEP
  const needleAngle = START_ANGLE - pct * SWEEP;

  // Generate tick marks
  const ticks = useMemo(() => {
    const majorCount = size === 'small' ? 5 : size === 'medium' ? 8 : 10;
    const minorPerMajor = size === 'small' ? 2 : 4;
    const result: { angle: number; isMajor: boolean; label?: string }[] = [];

    for (let i = 0; i <= majorCount; i++) {
      const frac = i / majorCount;
      const angle = START_ANGLE - frac * SWEEP;
      const val = min + frac * range;
      result.push({
        angle,
        isMajor: true,
        label: val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : Math.round(val).toString(),
      });

      if (i < majorCount) {
        for (let j = 1; j < minorPerMajor; j++) {
          const minorFrac = frac + (j / minorPerMajor) / majorCount;
          result.push({ angle: START_ANGLE - minorFrac * SWEEP, isMajor: false });
        }
      }
    }
    return result;
  }, [min, max, range, size]);

  // Color arc segments
  const arcSegments = useMemo(() => {
    const segments: { startAngle: number; endAngle: number; color: string }[] = [];
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const f1 = i / steps;
      const f2 = (i + 1) / steps;
      segments.push({
        startAngle: START_ANGLE - f1 * SWEEP,
        endAngle: START_ANGLE - f2 * SWEEP,
        color: getZoneColor(f1),
      });
    }
    return segments;
  }, []);

  // Empty slot placeholder
  if (isEmpty || !pid) {
    return (
      <div
        onContextMenu={onRightClick}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={onDrop}
        style={{
          width: cfg.diameter, height: cfg.diameter,
          borderRadius: '50%',
          border: `2px dashed ${isDragOver ? 'oklch(0.65 0.18 220)' : 'oklch(0.25 0.008 260)'}`,
          background: isDragOver ? 'oklch(0.12 0.02 220 / 0.3)' : 'oklch(0.08 0.004 260)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif', fontSize: size === 'large' ? '1rem' : '0.75rem',
          color: 'oklch(0.35 0.008 260)', letterSpacing: '0.1em',
        }}>
          {isDragOver ? 'DROP PID' : '+ ADD PID'}
        </span>
        <span style={{
          fontFamily: '"Rajdhani", sans-serif', fontSize: '0.6rem',
          color: 'oklch(0.30 0.006 260)', marginTop: '4px',
        }}>
          Drag or right-click
        </span>
      </div>
    );
  }

  const needleEnd = polarToCartesian(cx, cy, arcR - 8, needleAngle);
  const needleTail = polarToCartesian(cx, cy, 12, needleAngle + 180);

  return (
    <div
      onContextMenu={onRightClick}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={onDrop}
      style={{
        width: cfg.diameter, height: cfg.diameter,
        position: 'relative', cursor: 'context-menu',
        filter: isDragOver ? 'brightness(1.2)' : undefined,
        transition: 'filter 0.2s ease',
      }}
    >
      <svg width={cfg.diameter} height={cfg.diameter} viewBox={`0 0 ${cfg.diameter} ${cfg.diameter}`}>
        <defs>
          {/* Carbon fiber pattern */}
          <pattern id={`cf-${size}`} width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="oklch(0.10 0.005 260)" />
            <rect width="2" height="2" fill="oklch(0.12 0.006 260)" />
            <rect x="2" y="2" width="2" height="2" fill="oklch(0.12 0.006 260)" />
          </pattern>
          {/* Bezel gradient */}
          <linearGradient id={`bezel-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.45 0.005 260)" />
            <stop offset="30%" stopColor="oklch(0.25 0.004 260)" />
            <stop offset="70%" stopColor="oklch(0.35 0.005 260)" />
            <stop offset="100%" stopColor="oklch(0.20 0.003 260)" />
          </linearGradient>
          {/* Glow filter for needle */}
          <filter id={`glow-${size}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer bezel ring */}
        <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke={`url(#bezel-${size})`} strokeWidth="4" />

        {/* Carbon fiber background */}
        <circle cx={cx} cy={cy} r={outerR} fill={`url(#cf-${size})`} />

        {/* Dark inner circle */}
        <circle cx={cx} cy={cy} r={arcR + 4} fill="oklch(0.07 0.003 260)" opacity="0.6" />

        {/* Color arc segments */}
        {arcSegments.map((seg, i) => (
          <path
            key={i}
            d={describeArc(cx, cy, arcR, seg.startAngle, seg.endAngle)}
            fill="none"
            stroke={seg.color}
            strokeWidth={size === 'small' ? 4 : 6}
            strokeLinecap="butt"
            opacity={0.7}
          />
        ))}

        {/* Active arc (filled portion) */}
        {pct > 0.005 && (
          <path
            d={describeArc(cx, cy, arcR, START_ANGLE, needleAngle)}
            fill="none"
            stroke={getZoneColor(pct)}
            strokeWidth={size === 'small' ? 5 : 7}
            strokeLinecap="butt"
            opacity={1}
          />
        )}

        {/* Tick marks */}
        {ticks.map((tick, i) => {
          const outer = polarToCartesian(cx, cy, tickOuterR, tick.angle);
          const inner = polarToCartesian(cx, cy, tick.isMajor ? tickInnerR : tickInnerR + cfg.tickLength * 0.5, tick.angle);
          return (
            <g key={i}>
              <line
                x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
                stroke={tick.isMajor ? 'oklch(0.70 0.005 260)' : 'oklch(0.35 0.004 260)'}
                strokeWidth={tick.isMajor ? 1.5 : 0.8}
              />
              {tick.isMajor && tick.label && size !== 'small' && (
                <text
                  x={polarToCartesian(cx, cy, labelR, tick.angle).x}
                  y={polarToCartesian(cx, cy, labelR, tick.angle).y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="oklch(0.55 0.008 260)"
                  fontSize={cfg.labelSize}
                  fontFamily='"Share Tech Mono", monospace'
                >
                  {tick.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Needle */}
        <line
          x1={needleTail.x} y1={needleTail.y}
          x2={needleEnd.x} y2={needleEnd.y}
          stroke="oklch(0.58 0.22 25)"
          strokeWidth={cfg.needleWidth}
          strokeLinecap="round"
          filter={`url(#glow-${size})`}
          style={{ transition: 'all 0.15s ease-out' }}
        />

        {/* Center cap */}
        <circle cx={cx} cy={cy} r={size === 'small' ? 6 : 8} fill="oklch(0.20 0.005 260)" stroke="oklch(0.35 0.005 260)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={size === 'small' ? 3 : 4} fill="oklch(0.55 0.20 25)" />

        {/* Digital readout */}
        <text
          x={cx}
          y={cy + (size === 'large' ? 38 : size === 'medium' ? 30 : 22)}
          textAnchor="middle"
          fill="oklch(0.95 0.005 260)"
          fontSize={cfg.fontSize}
          fontFamily='"Share Tech Mono", monospace'
          fontWeight="700"
        >
          {reading ? (Number.isInteger(value) ? value.toString() : value.toFixed(1)) : '---'}
        </text>

        {/* Unit label */}
        <text
          x={cx}
          y={cy + (size === 'large' ? 54 : size === 'medium' ? 44 : 34)}
          textAnchor="middle"
          fill="oklch(0.50 0.010 260)"
          fontSize={cfg.unitSize}
          fontFamily='"Rajdhani", sans-serif'
          letterSpacing="0.08em"
        >
          {pid.unit}
        </text>

        {/* PID name at bottom */}
        <text
          x={cx}
          y={cfg.diameter - (size === 'small' ? 10 : 14)}
          textAnchor="middle"
          fill="oklch(0.60 0.010 260)"
          fontSize={size === 'small' ? 7 : 9}
          fontFamily='"Bebas Neue", sans-serif'
          letterSpacing="0.12em"
        >
          {pid.shortName}
        </text>
      </svg>
    </div>
  );
}
