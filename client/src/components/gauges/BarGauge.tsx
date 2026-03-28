/**
 * BarGauge — Horizontal bar-style gauge for linear values
 * 
 * Good for: throttle position, duty cycles, percentages, temperatures
 * Features: segmented LED-style fill, color zones, digital readout
 */

import type { PIDDefinition, PIDReading } from '@/lib/obdConnection';

export interface BarGaugeProps {
  pid: PIDDefinition | null;
  reading: PIDReading | null;
  onRightClick?: (e: React.MouseEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
  isEmpty?: boolean;
}

function getBarColor(pct: number): string {
  if (pct < 0.25) return 'oklch(0.65 0.18 220)';
  if (pct < 0.55) return 'oklch(0.70 0.20 155)';
  if (pct < 0.78) return 'oklch(0.75 0.18 70)';
  return 'oklch(0.58 0.22 25)';
}

export default function BarGauge({
  pid, reading, onRightClick, onDrop, isDragOver, isEmpty,
}: BarGaugeProps) {
  const value = reading?.value ?? 0;
  const min = pid?.min ?? 0;
  const max = pid?.max ?? 100;
  const range = max - min || 1;
  const pct = Math.max(0, Math.min(1, (value - min) / range));

  if (isEmpty || !pid) {
    return (
      <div
        onContextMenu={onRightClick}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={onDrop}
        style={{
          width: '100%', height: '64px',
          border: `1px dashed ${isDragOver ? 'oklch(0.65 0.18 220)' : 'oklch(0.25 0.008 260)'}`,
          borderRadius: '4px',
          background: isDragOver ? 'oklch(0.12 0.02 220 / 0.3)' : 'oklch(0.08 0.004 260)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s ease',
        }}
      >
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem',
          color: 'oklch(0.35 0.008 260)', letterSpacing: '0.1em',
        }}>
          {isDragOver ? 'DROP PID' : '+ ADD PID'}
        </span>
      </div>
    );
  }

  const segmentCount = 30;
  const filledSegments = Math.round(pct * segmentCount);

  return (
    <div
      onContextMenu={onRightClick}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={onDrop}
      style={{
        width: '100%',
        background: 'oklch(0.10 0.005 260)',
        border: `1px solid oklch(0.22 0.008 260)`,
        borderLeft: `3px solid ${getBarColor(pct)}`,
        borderRadius: '4px',
        padding: '8px 12px',
        cursor: 'context-menu',
        filter: isDragOver ? 'brightness(1.2)' : undefined,
        transition: 'filter 0.2s ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.7rem',
          color: 'oklch(0.55 0.010 260)', letterSpacing: '0.1em',
        }}>
          {pid.shortName}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{
            fontFamily: '"Share Tech Mono", monospace', fontSize: '1.2rem',
            fontWeight: 700, color: 'oklch(0.95 0.005 260)', lineHeight: 1,
          }}>
            {reading ? (Number.isInteger(value) ? value.toString() : value.toFixed(1)) : '---'}
          </span>
          <span style={{
            fontFamily: '"Rajdhani", sans-serif', fontSize: '0.65rem',
            color: 'oklch(0.45 0.008 260)',
          }}>
            {pid.unit}
          </span>
        </div>
      </div>

      {/* Segmented bar */}
      <div style={{ display: 'flex', gap: '1.5px', height: '8px' }}>
        {Array.from({ length: segmentCount }, (_, i) => {
          const segPct = i / segmentCount;
          const isFilled = i < filledSegments;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: '100%',
                borderRadius: '1px',
                background: isFilled ? getBarColor(segPct) : 'oklch(0.15 0.004 260)',
                opacity: isFilled ? 1 : 0.4,
                transition: 'background 0.1s ease',
              }}
            />
          );
        })}
      </div>

      {/* Min/Max labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.5rem', color: 'oklch(0.35 0.006 260)' }}>
          {min}
        </span>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.5rem', color: 'oklch(0.35 0.006 260)' }}>
          {max}
        </span>
      </div>
    </div>
  );
}
