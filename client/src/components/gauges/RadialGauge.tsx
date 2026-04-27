/**
 * RadialGauge — Tesla-style modern circular gauge
 * 
 * Features:
 * - Clean minimal SVG arc with smooth gradient transitions
 * - Large digital readout with subtle glow
 * - No bezel/chrome — dark glass card appearance
 * - Thin elegant arc with color zones
 * - Animated needle with soft glow
 * - Configurable size (large, medium, small)
 */
import { useMemo } from 'react';
import type { PIDDefinition, PIDReading } from '@/lib/obdConnection';

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

const SIZE_CONFIG: Record<GaugeSize, {
  diameter: number; fontSize: number; unitSize: number; labelSize: number;
  arcWidth: number; needleWidth: number; tickLength: number;
}> = {
  large:  { diameter: 220, fontSize: 36, unitSize: 11, labelSize: 10, arcWidth: 8, needleWidth: 2.5, tickLength: 10 },
  medium: { diameter: 170, fontSize: 28, unitSize: 9,  labelSize: 8,  arcWidth: 6, needleWidth: 2,   tickLength: 8 },
  small:  { diameter: 130, fontSize: 20, unitSize: 7,  labelSize: 7,  arcWidth: 5, needleWidth: 1.5, tickLength: 6 },
};

const START_ANGLE = 225;
const SWEEP = 270;

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

/** Smooth color interpolation across the arc */
function getZoneColor(pct: number): string {
  if (pct < 0.3) return '#06b6d4';   // cyan
  if (pct < 0.55) return '#22c55e';  // green
  if (pct < 0.75) return '#eab308';  // amber
  if (pct < 0.88) return '#f97316';  // orange
  return '#ef4444';                    // red
}

function getGlowColor(pct: number): string {
  if (pct < 0.3) return 'rgba(6, 182, 212, 0.4)';
  if (pct < 0.55) return 'rgba(34, 197, 94, 0.4)';
  if (pct < 0.75) return 'rgba(234, 179, 8, 0.4)';
  if (pct < 0.88) return 'rgba(249, 115, 22, 0.4)';
  return 'rgba(239, 68, 68, 0.5)';
}

function formatLabel(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 10000) return `${(val / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return Math.round(val).toString();
}

export default function RadialGauge({
  pid, reading, size = 'medium', onRightClick, onDrop, isDragOver, isEmpty,
}: RadialGaugeProps) {
  const cfg = SIZE_CONFIG[size];
  const r = cfg.diameter / 2;
  const cx = r;
  const cy = r;
  const arcR = r - 18;
  const tickOuterR = arcR - 2;
  const tickInnerR = tickOuterR - cfg.tickLength;
  const labelR = tickInnerR - (size === 'small' ? 7 : 10);

  const value = reading?.value ?? 0;
  const min = pid?.min ?? 0;
  const max = pid?.max ?? 100;
  const range = max - min || 1;
  const pct = Math.max(0, Math.min(1, (value - min) / range));
  const needleAngle = START_ANGLE - pct * SWEEP;
  const color = getZoneColor(pct);
  const glowColor = getGlowColor(pct);

  const needleEnd = polarToCartesian(cx, cy, arcR - 8, needleAngle);
  const needleTail = polarToCartesian(cx, cy, 12, needleAngle + 180);

  // Generate tick marks — minimal style
  const ticks = useMemo(() => {
    const majorCount = size === 'small' ? 5 : size === 'medium' ? 6 : 8;
    const minorPerMajor = size === 'small' ? 1 : 2;
    const result: { angle: number; isMajor: boolean; label?: string }[] = [];
    for (let i = 0; i <= majorCount; i++) {
      const frac = i / majorCount;
      const angle = START_ANGLE - frac * SWEEP;
      const val = min + frac * range;
      result.push({ angle, isMajor: true, label: formatLabel(val) });
      if (i < majorCount) {
        for (let j = 1; j <= minorPerMajor; j++) {
          const mFrac = (i + j / (minorPerMajor + 1)) / majorCount;
          result.push({ angle: START_ANGLE - mFrac * SWEEP, isMajor: false });
        }
      }
    }
    return result;
  }, [min, range, size]);

  // Build gradient arc segments
  const arcSegments = useMemo(() => {
    const segs = 36;
    const result: { startAngle: number; endAngle: number; color: string }[] = [];
    for (let i = 0; i < segs; i++) {
      const f1 = i / segs;
      const f2 = (i + 1) / segs;
      result.push({
        startAngle: START_ANGLE - f1 * SWEEP,
        endAngle: START_ANGLE - f2 * SWEEP,
        color: getZoneColor(f1),
      });
    }
    return result;
  }, []);

  const uid = `rg-${size}-${pid?.pid ?? 'empty'}`;

  // Empty slot
  if (isEmpty || !pid) {
    return (
      <div
        onContextMenu={onRightClick}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        style={{
          width: cfg.diameter, height: cfg.diameter,
          borderRadius: '50%',
          border: `2px dashed ${isDragOver ? '#06b6d4' : 'rgba(255,255,255,0.08)'}`,
          background: isDragOver ? 'rgba(6, 182, 212, 0.05)' : 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif', fontSize: size === 'large' ? '1rem' : '0.75rem',
          color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em',
        }}>
          {isDragOver ? 'DROP PID' : '+ ADD PID'}
        </span>
        <span style={{
          fontFamily: '"Rajdhani", sans-serif', fontSize: '0.6rem',
          color: 'rgba(255,255,255,0.15)', marginTop: '4px',
        }}>
          Drag or right-click
        </span>
      </div>
    );
  }

  return (
    <div
      onContextMenu={onRightClick}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={onDrop}
      style={{
        position: 'relative', cursor: 'context-menu',
        filter: isDragOver ? 'brightness(1.2)' : undefined,
        transition: 'filter 0.2s',
      }}
    >
      <svg width={cfg.diameter} height={cfg.diameter} viewBox={`0 0 ${cfg.diameter} ${cfg.diameter}`}>
        <defs>
          {/* Subtle radial gradient background */}
          <radialGradient id={`bg-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(20, 25, 40, 0.9)" />
            <stop offset="100%" stopColor="rgba(8, 10, 18, 0.95)" />
          </radialGradient>
          {/* Glow filter for active arc */}
          <filter id={`arc-glow-${uid}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Needle glow */}
          <filter id={`needle-glow-${uid}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle */}
        <circle cx={cx} cy={cy} r={r - 2} fill={`url(#bg-${uid})`} />
        {/* Subtle outer ring */}
        <circle cx={cx} cy={cy} r={r - 2} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        {/* Background arc track (dim) */}
        <path
          d={describeArc(cx, cy, arcR, START_ANGLE, START_ANGLE - SWEEP)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={cfg.arcWidth}
          strokeLinecap="round"
        />

        {/* Color gradient arc segments (dim background showing full range) */}
        {arcSegments.map((seg, i) => (
          <path
            key={i}
            d={describeArc(cx, cy, arcR, seg.startAngle, seg.endAngle)}
            fill="none"
            stroke={seg.color}
            strokeWidth={cfg.arcWidth}
            strokeLinecap="butt"
            opacity={0.12}
          />
        ))}

        {/* Active arc (filled portion with glow) */}
        {pct > 0.005 && (
          <path
            d={describeArc(cx, cy, arcR, START_ANGLE, needleAngle)}
            fill="none"
            stroke={color}
            strokeWidth={cfg.arcWidth + 1}
            strokeLinecap="round"
            filter={`url(#arc-glow-${uid})`}
            style={{ transition: 'all 0.15s ease-out' }}
          />
        )}

        {/* Tick marks — thin and subtle */}
        {ticks.map((tick, i) => {
          const outer = polarToCartesian(cx, cy, tickOuterR, tick.angle);
          const inner = polarToCartesian(cx, cy, tick.isMajor ? tickInnerR : tickInnerR + cfg.tickLength * 0.5, tick.angle);
          return (
            <g key={i}>
              <line
                x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
                stroke={tick.isMajor ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}
                strokeWidth={tick.isMajor ? 1.2 : 0.6}
              />
              {tick.isMajor && tick.label && size !== 'small' && (
                <text
                  x={polarToCartesian(cx, cy, labelR, tick.angle).x}
                  y={polarToCartesian(cx, cy, labelR, tick.angle).y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="rgba(255,255,255,0.3)"
                  fontSize={cfg.labelSize}
                  fontFamily='"Share Tech Mono", monospace'
                >
                  {tick.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Needle — thin elegant line */}
        <line
          x1={needleTail.x} y1={needleTail.y}
          x2={needleEnd.x} y2={needleEnd.y}
          stroke={color}
          strokeWidth={cfg.needleWidth}
          strokeLinecap="round"
          filter={`url(#needle-glow-${uid})`}
          style={{ transition: 'all 0.15s ease-out' }}
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={size === 'small' ? 4 : 5} fill="rgba(255,255,255,0.15)" />
        <circle cx={cx} cy={cy} r={size === 'small' ? 2 : 3} fill={color} style={{ transition: 'fill 0.3s' }} />

        {/* Digital readout */}
        <text
          x={cx}
          y={cy + (size === 'large' ? 36 : size === 'medium' ? 28 : 20)}
          textAnchor="middle"
          fill="white"
          fontSize={cfg.fontSize}
          fontFamily='"Share Tech Mono", monospace'
          fontWeight="700"
          style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
        >
          {reading ? (Number.isInteger(value) ? value.toString() : value.toFixed(1)) : '---'}
        </text>

        {/* Unit label */}
        <text
          x={cx}
          y={cy + (size === 'large' ? 52 : size === 'medium' ? 42 : 32)}
          textAnchor="middle"
          fill="rgba(255,255,255,0.35)"
          fontSize={cfg.unitSize}
          fontFamily='"Rajdhani", sans-serif'
          letterSpacing="0.1em"
        >
          {pid.unit}
        </text>

        {/* PID name at bottom */}
        <text
          x={cx}
          y={cfg.diameter - (size === 'small' ? 8 : 12)}
          textAnchor="middle"
          fill="rgba(255,255,255,0.45)"
          fontSize={size === 'small' ? 7 : 9}
          fontFamily='"Bebas Neue", sans-serif'
          letterSpacing="0.15em"
        >
          {pid.shortName}
        </text>
      </svg>
    </div>
  );
}
