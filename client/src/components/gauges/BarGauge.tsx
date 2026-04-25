/**
 * BarGauge — Tesla-style horizontal bar gauge
 * 
 * Clean glass-card design with smooth gradient fill and subtle glow.
 * Good for: throttle position, duty cycles, percentages, temperatures
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
  if (pct < 0.3) return '#06b6d4';
  if (pct < 0.55) return '#22c55e';
  if (pct < 0.75) return '#eab308';
  if (pct < 0.88) return '#f97316';
  return '#ef4444';
}

function getBarGlow(pct: number): string {
  if (pct < 0.3) return 'rgba(6, 182, 212, 0.3)';
  if (pct < 0.55) return 'rgba(34, 197, 94, 0.3)';
  if (pct < 0.75) return 'rgba(234, 179, 8, 0.3)';
  if (pct < 0.88) return 'rgba(249, 115, 22, 0.3)';
  return 'rgba(239, 68, 68, 0.35)';
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
          border: `1px dashed ${isDragOver ? '#06b6d4' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '6px',
          background: isDragOver ? 'rgba(6, 182, 212, 0.05)' : 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem',
          color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em',
        }}>
          {isDragOver ? 'DROP PID' : '+ ADD PID'}
        </span>
      </div>
    );
  }

  const color = getBarColor(pct);
  const glow = getBarGlow(pct);

  return (
    <div
      onContextMenu={onRightClick}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDrop={onDrop}
      style={{
        width: '100%',
        background: 'rgba(12, 15, 28, 0.85)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderLeft: `3px solid ${color}`,
        borderRadius: '6px',
        padding: '10px 14px',
        cursor: 'context-menu',
        filter: isDragOver ? 'brightness(1.2)' : undefined,
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem',
          color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em',
        }}>
          {pid.shortName}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span style={{
            fontFamily: '"Share Tech Mono", monospace', fontSize: '1.25rem',
            fontWeight: 700, color: 'white', lineHeight: 1,
            filter: `drop-shadow(0 0 4px ${glow})`,
          }}>
            {reading ? (Number.isInteger(value) ? value.toString() : value.toFixed(1)) : '---'}
          </span>
          <span style={{
            fontFamily: '"Rajdhani", sans-serif', fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.35)',
          }}>
            {pid.unit}
          </span>
        </div>
      </div>

      {/* Smooth gradient bar */}
      <div style={{
        width: '100%', height: '6px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '3px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: `${pct * 100}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${getBarColor(0)}, ${color})`,
          borderRadius: '3px',
          boxShadow: `0 0 8px ${glow}`,
          transition: 'width 0.15s ease-out',
        }} />
      </div>

      {/* Min/Max labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)' }}>
          {min}
        </span>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)' }}>
          {max}
        </span>
      </div>
    </div>
  );
}
