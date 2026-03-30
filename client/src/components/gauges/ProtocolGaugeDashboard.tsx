/**
 * Protocol-Specific Gauge Dashboard
 * 
 * Real-time gauge display for J1939, K-Line, and OBD-II parameters.
 * Glassmorphic design with color-coded ranges.
 */

import { useMemo } from 'react';
import { J1939ParameterReading } from '@/lib/j1939Protocol';
import { KLineParameterReading } from '@/lib/klineProtocol';
import { PIDReading } from '@/lib/obdConnection';

export type ProtocolReading = J1939ParameterReading | KLineParameterReading | PIDReading;

export interface ProtocolGaugeDashboardProps {
  readings: ProtocolReading[];
  protocol: 'j1939' | 'kline' | 'obd2';
  maxGauges?: number;
}

// ─── Styling ────────────────────────────────────────────────────────────────

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

// ─── Gauge Component ────────────────────────────────────────────────────────

interface GaugeProps {
  reading: ProtocolReading;
  min: number;
  max: number;
  unit: string;
  protocol: 'j1939' | 'kline' | 'obd2';
}

function ProtocolGauge({ reading, min, max, unit, protocol }: GaugeProps) {
  const value = reading.value;
  const range = max - min;
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100));

  const getColor = (p: number) => {
    if (p < 25) return sColor.blue;
    if (p < 50) return sColor.green;
    if (p < 75) return sColor.yellow;
    return sColor.red;
  };

  const getLabel = (reading: ProtocolReading) => {
    if ('shortName' in reading) {
      return (reading as J1939ParameterReading | KLineParameterReading | PIDReading).shortName;
    }
    return 'PARAM';
  };

  const getName = (reading: ProtocolReading) => {
    if ('parameter' in reading) {
      return (reading as J1939ParameterReading).parameter;
    }
    if ('name' in reading) {
      return (reading as KLineParameterReading | PIDReading).name;
    }
    return 'Unknown';
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '14px',
        minWidth: '160px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span
          style={{
            fontFamily: sFont.mono,
            fontSize: '0.5rem',
            color:
              protocol === 'j1939'
                ? sColor.purple
                : protocol === 'kline'
                  ? sColor.orange
                  : sColor.blue,
            background:
              protocol === 'j1939'
                ? 'rgba(153,102,255,0.2)'
                : protocol === 'kline'
                  ? 'rgba(255,127,0,0.2)'
                  : 'rgba(112,178,255,0.2)',
            padding: '2px 6px',
            borderRadius: '3px',
            fontWeight: 700,
          }}
        >
          {protocol === 'j1939' ? 'J1939' : protocol === 'kline' ? 'K-LINE' : 'OBD2'}
        </span>
        <span
          style={{
            fontFamily: sFont.body,
            fontSize: '0.65rem',
            color: sColor.textDim,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          {getLabel(reading)}
        </span>
      </div>

      {/* Value Display */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '10px' }}>
        <span
          style={{
            fontFamily: sFont.mono,
            fontSize: '1.9rem',
            fontWeight: 700,
            color: getColor(pct),
            lineHeight: 1,
            transition: 'color 0.3s ease-out',
          }}
        >
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </span>
        <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim }}>
          {unit}
        </span>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '6px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
          marginBottom: '8px',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: getColor(pct),
            transition: 'width 0.2s ease-out',
            borderRadius: '3px',
            boxShadow: `0 0 12px ${getColor(pct)}80`,
          }}
        />
      </div>

      {/* Min/Max Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
          {min}
        </span>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
          {max}
        </span>
      </div>

      {/* Parameter Name (tooltip-like) */}
      <div
        style={{
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: `1px solid rgba(255,255,255,0.1)`,
          fontSize: '0.6rem',
          color: sColor.textMuted,
          fontFamily: sFont.body,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {getName(reading)}
      </div>
    </div>
  );
}

// ─── Dashboard Component ────────────────────────────────────────────────────

export function ProtocolGaugeDashboard({
  readings,
  protocol,
  maxGauges = 8,
}: ProtocolGaugeDashboardProps) {
  // Get gauge ranges based on protocol
  const getGaugeRange = (reading: ProtocolReading) => {
    const unit = reading.unit.toLowerCase();

    // Temperature ranges
    if (unit.includes('°c') || unit.includes('°f')) {
      return { min: 0, max: 150 };
    }

    // Pressure ranges
    if (unit.includes('psi') || unit.includes('bar') || unit.includes('kpa')) {
      return { min: 0, max: 200 };
    }

    // RPM
    if (unit.includes('rpm')) {
      return { min: 0, max: 5000 };
    }

    // Speed
    if (unit.includes('mph') || unit.includes('km/h')) {
      return { min: 0, max: 120 };
    }

    // Percentage
    if (unit === '%') {
      return { min: 0, max: 100 };
    }

    // Voltage
    if (unit.includes('v')) {
      return { min: 0, max: 5 };
    }

    // Default
    return { min: 0, max: 100 };
  };

  // Sort readings by importance (RPM, Speed, Temperature first)
  const sortedReadings = useMemo(() => {
    const priority: Record<string, number> = {
      rpm: 0,
      speed: 1,
      ect: 2,
      egt: 3,
      boost: 4,
      'rail pressure': 5,
      'fuel pressure': 6,
    };

    return [...readings].sort((a, b) => {
      const aLabel = 'shortName' in a ? a.shortName.toLowerCase() : 'unknown';
      const bLabel = 'shortName' in b ? b.shortName.toLowerCase() : 'unknown';

      const aPriority = Object.entries(priority).find(([key]) => aLabel.includes(key))?.[1] ?? 999;
      const bPriority = Object.entries(priority).find(([key]) => bLabel.includes(key))?.[1] ?? 999;

      return aPriority - bPriority;
    });
  }, [readings]);

  const displayReadings = sortedReadings.slice(0, maxGauges);

  if (displayReadings.length === 0) {
    return (
      <div
        style={{
          padding: '20px',
          textAlign: 'center',
          color: sColor.textMuted,
          fontFamily: sFont.body,
        }}
      >
        No readings available
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px',
        padding: '12px',
      }}
    >
      {displayReadings.map((reading, idx) => {
        const range = getGaugeRange(reading);
        return (
          <ProtocolGauge
            key={idx}
            reading={reading}
            min={range.min}
            max={range.max}
            unit={reading.unit}
            protocol={protocol}
          />
        );
      })}
    </div>
  );
}

// ─── Compact Gauge Row (for sidebar/header) ─────────────────────────────────

export function CompactProtocolGauges({
  readings,
  protocol,
  maxGauges = 4,
}: ProtocolGaugeDashboardProps) {
  const displayReadings = readings.slice(0, maxGauges);

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        padding: '8px',
        background: `linear-gradient(90deg, ${sColor.bgCard}00 0%, ${sColor.bgCard}80 50%, ${sColor.bgCard}00 100%)`,
      }}
    >
      {displayReadings.map((reading, idx) => {
        const value = reading.value;
        const label = 'shortName' in reading ? reading.shortName : 'PARAM';

        return (
          <div
            key={idx}
            style={{
              flex: '0 0 auto',
              padding: '6px 10px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              fontSize: '0.7rem',
              fontFamily: sFont.mono,
              whiteSpace: 'nowrap',
              color: sColor.text,
            }}
          >
            <span style={{ color: sColor.textDim }}>{label}:</span> {Number.isInteger(value) ? value : value.toFixed(1)}{' '}
            {reading.unit}
          </div>
        );
      })}
    </div>
  );
}
