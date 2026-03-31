/**
 * DynoCharts.tsx
 * Dynojet-style HP/Torque chart + fault-specific PID vs desired charts.
 *
 * Design: Dark cockpit aesthetic matching Dynojet WinPEP software.
 * - Background: #0d0f14 (near-black)
 * - HP curve: #ff4d00 (Dynojet orange-red)
 * - Torque curve: #00c8ff (cyan)
 * - Desired/expected: #44ff88 (green)
 * - Actual (fault): #ff4444 (red)
 * - Delta shaded area: rgba(255,34,34,0.18)
 *
 * FAULT CHART GATING: Uses .startsWith() to match suffixed codes like
 * 'P0087-RAIL-MAXED', 'P0088-OSCILLATION', 'P0299-BOOST-LEAK', etc.
 */

import { useMemo, forwardRef, useState, useImperativeHandle, useRef, useEffect } from 'react';
import {
  ComposedChart,
  ScatterChart,
  Scatter,
  ZAxis,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Brush,
} from 'recharts';
import { ProcessedMetrics } from '@/lib/dataProcessor';
import { DiagnosticReport } from '@/lib/diagnostics';
import { AlertCircle } from 'lucide-react';
import { ZoomableChart } from './ZoomableChart';
import { decodeFuelingState } from '@/lib/cumminsFuelingStates';

export interface DynoChartHandle {
  jumpToTime: (startMin: number, endMin: number) => void;
}

interface DynoChartProps {
  data: ProcessedMetrics;
  binnedData?: any[];
}

interface FaultChartsProps {
  data: ProcessedMetrics;
  diagnostics: DiagnosticReport;
  binnedData?: any[];
  onJumpToTime?: (start: number, end: number) => void;
  reasoningReport?: { findings: Array<{ id: string; type: string; category: string }> } | null;
}

// ─── Custom Dynojet-style Tooltip ────────────────────────────────────────────
const DynoTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(13,15,20,0.97)',
      border: '1px solid #ff4d00',
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e0e0e0',
      boxShadow: '0 0 12px rgba(255,77,0,0.3)',
    }}>
      <div style={{ color: '#ff4d00', fontWeight: 'bold', marginBottom: 6 }}>
        {label ? `${Number(label).toFixed(0)} RPM` : ''}
      </div>
      {payload.map((p: any, i: number) => (
        p.value != null && (
          <div key={i} style={{ color: p.color, marginBottom: 2 }}>
            {p.name}: <span style={{ color: '#fff', fontWeight: 'bold' }}>{Number(p.value).toFixed(1)}</span>
          </div>
        )
      ))}
    </div>
  );
};

// ─── Custom Fault Tooltip ─────────────────────────────────────────────────────
const FaultTooltip = ({ active, payload, label, xLabel }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(13,15,20,0.97)',
      border: '1px solid #ff4444',
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e0e0e0',
      boxShadow: '0 0 10px rgba(255,68,68,0.25)',
      maxWidth: 220,
    }}>
      <div style={{ color: '#ff8888', fontWeight: 'bold', marginBottom: 5 }}>
        {xLabel || ''}: {typeof label === 'number' ? label.toFixed(2) : label}
      </div>
      {payload.map((p: any, i: number) => (
        p.value != null && p.value !== 0 && (
          <div key={i} style={{ color: p.color || '#ccc', marginBottom: 2 }}>
            {p.name}: <span style={{ color: '#fff', fontWeight: 'bold' }}>{Number(p.value).toFixed(2)}</span>
          </div>
        )
      ))}
    </div>
  );
};

// ─── Delta Badge ─────────────────────────────────────────────────────────────
const DeltaBadge = ({ label, actual, expected, delta, unit, isCritical }: {
  label: string; actual: string; expected: string; delta: string; unit: string; isCritical: boolean;
}) => (
  <div style={{
    background: isCritical ? 'rgba(255,34,34,0.1)' : 'rgba(255,153,0,0.08)',
    border: `1px solid ${isCritical ? 'rgba(255,34,34,0.3)' : 'rgba(255,153,0,0.25)'}`,
    borderRadius: 6,
    padding: '8px 12px',
    fontFamily: 'monospace',
    fontSize: 11,
    minWidth: 140,
  }}>
    <div style={{ color: '#888', fontSize: 10, marginBottom: 3 }}>{label}</div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: '#ff6666' }}>ACT: <strong>{actual}{unit}</strong></span>
      <span style={{ color: '#44ff88' }}>EXP: <strong>{expected}{unit}</strong></span>
    </div>
    <div style={{ color: isCritical ? '#ff4444' : '#ffaa44', marginTop: 3, fontWeight: 'bold' }}>
      Δ {delta}{unit}
    </div>
  </div>
);

// ─── Threshold Transparency Row ───────────────────────────────────────────────
const ThresholdRow = ({ rule }: { rule: string }) => (
  <div style={{
    marginTop: 10,
    padding: '8px 12px',
    background: 'rgba(68,136,255,0.06)',
    border: '1px solid rgba(68,136,255,0.18)',
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#7799cc',
    lineHeight: 1.6,
  }}>
    <span style={{ color: '#5588ff', fontWeight: 'bold' }}>RULE EVALUATED: </span>{rule}
  </div>
);

// ─── Fault Event Timestamp List ─────────────────────────────────────────────
interface FaultEvent {
  start: number;   // minutes
  end: number;     // minutes
  duration: number; // seconds
  peakDelta: number;
  unit: string;
}

/**
 * Scans an array of chart data points and groups consecutive violations
 * into discrete fault events with start/end timestamps and peak delta.
 */
function computeFaultEvents(
  points: Array<{ time: number; [key: string]: any }>,
  isViolation: (d: any) => boolean,
  getDelta: (d: any) => number,
  unit: string,
  minGapSec = 1.0   // merge windows separated by less than this
): FaultEvent[] {
  const events: FaultEvent[] = [];
  let inFault = false;
  let start = 0;
  let peakDelta = 0;
  let prevTime = 0;

  for (let i = 0; i < points.length; i++) {
    const d = points[i];
    const t = d.time as number;
    const violation = isViolation(d);

    if (violation && !inFault) {
      inFault = true;
      start = t;
      peakDelta = getDelta(d);
    } else if (violation && inFault) {
      peakDelta = Math.max(peakDelta, getDelta(d));
    } else if (!violation && inFault) {
      // Check if gap is small enough to merge
      const gapSec = (t - prevTime) * 60;
      if (gapSec < minGapSec && i < points.length - 1) {
        // Keep fault open through small gap
      } else {
        events.push({
          start,
          end: prevTime,
          duration: Math.round((prevTime - start) * 60),
          peakDelta,
          unit,
        });
        inFault = false;
        peakDelta = 0;
      }
    }
    prevTime = t;
  }
  if (inFault) {
    events.push({
      start,
      end: prevTime,
      duration: Math.round((prevTime - start) * 60),
      peakDelta,
      unit,
    });
  }
  return events;
}

const FaultEventList = ({ events, isCritical, onJumpToTime }: { events: FaultEvent[]; isCritical: boolean; onJumpToTime?: (start: number, end: number) => void }) => {
  if (events.length === 0) return null;
  const borderColor = isCritical ? 'rgba(255,34,34,0.25)' : 'rgba(255,153,0,0.25)';
  const headerColor = isCritical ? '#ff4444' : '#ffaa44';
  return (
    <div style={{
      marginTop: 14,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      overflow: 'hidden',
      fontFamily: 'monospace',
      fontSize: 11,
    }}>
      <div style={{
        background: isCritical ? 'rgba(255,34,34,0.12)' : 'rgba(255,153,0,0.1)',
        padding: '6px 12px',
        color: headerColor,
        fontWeight: 'bold',
        fontSize: 10,
        letterSpacing: 1,
        borderBottom: `1px solid ${borderColor}`,
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>FAULT EVENTS ({events.length})</span>
        <span style={{ color: '#555', fontWeight: 'normal' }}>sorted by time</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
            {['#', 'START', 'END', 'DURATION', 'PEAK DELTA', ...(onJumpToTime ? [''] : [])].map(h => (
              <th key={h} style={{
                padding: '5px 10px', textAlign: 'left', color: '#555',
                fontSize: 9, fontWeight: 'bold', letterSpacing: 1,
                borderBottom: `1px solid rgba(255,255,255,0.06)`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((ev, i) => (
            <tr key={i} style={{
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <td style={{ padding: '5px 10px', color: '#555', fontSize: 10 }}>{i + 1}</td>
              <td style={{ padding: '5px 10px', color: '#aaa', fontSize: 10 }}>{ev.start.toFixed(2)} min</td>
              <td style={{ padding: '5px 10px', color: '#aaa', fontSize: 10 }}>{ev.end.toFixed(2)} min</td>
              <td style={{ padding: '5px 10px', color: '#ccc', fontSize: 10, fontWeight: 'bold' }}>
                {ev.duration < 60 ? `${ev.duration}s` : `${(ev.duration / 60).toFixed(1)}m`}
              </td>
              <td style={{ padding: '5px 10px', color: headerColor, fontSize: 10, fontWeight: 'bold' }}>
                {ev.peakDelta.toFixed(ev.unit.includes('psi') ? 0 : 1)} {ev.unit}
              </td>
              {onJumpToTime && (
                <td style={{ padding: '5px 10px' }}>
                  <button
                    onClick={() => onJumpToTime(ev.start, ev.end)}
                    style={{
                      background: 'rgba(255,77,0,0.15)',
                      border: '1px solid rgba(255,77,0,0.4)',
                      borderRadius: 4,
                      color: '#ff8844',
                      fontSize: 9,
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      padding: '2px 7px',
                      cursor: 'pointer',
                      letterSpacing: 0.5,
                    }}
                    title={`Jump to ${ev.start.toFixed(2)}m–${ev.end.toFixed(2)}m in dyno chart`}
                  >
                    ▶ JUMP
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Fault chart wrapper ──────────────────────────────────────────────────────
const FaultChartWrapper = forwardRef<HTMLDivElement, {
  code: string;
  title: string;
  severity: string;
  description: string;
  recommendation: string;
  ruleEvaluated: string;
  children: React.ReactNode;
  badges?: React.ReactNode;
  chartId?: string;
}>(({ code, title, severity, description, recommendation, ruleEvaluated, children, badges, chartId }, ref) => {
  const borderColor = severity === 'critical' ? '#ff2222' : '#ff9900';
  const badgeColor = severity === 'critical' ? 'rgba(255,34,34,0.2)' : 'rgba(255,153,0,0.2)';
  const badgeText = severity === 'critical' ? '#ff6666' : '#ffcc44';

  return (
    <div ref={ref} id={chartId} style={{
      background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: `0 4px 24px rgba(${severity === 'critical' ? '255,34,34' : '255,153,0'},0.15)`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <AlertCircle size={18} color={borderColor} />
        <span style={{
          background: badgeColor, color: badgeText, padding: '2px 8px', borderRadius: 4,
          fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold', border: `1px solid ${borderColor}`,
        }}>POTENTIAL FAULT AREA</span>
        <span style={{ color: '#e0e0e0', fontWeight: 'bold', fontSize: 13, fontFamily: 'monospace', flex: 1 }}>{title}</span>
        <span style={{
          background: badgeColor, color: badgeText, padding: '2px 10px', borderRadius: 4,
          fontSize: 10, fontFamily: 'monospace', border: `1px solid ${borderColor}`, textTransform: 'uppercase',
        }}>{severity}</span>
      </div>

      {/* Description */}
      <div style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace', marginBottom: 12, lineHeight: 1.5 }}>
        {description}
      </div>

      {/* Chart */}
      {children}

      {/* Delta badges */}
      {badges && (
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          {badges}
        </div>
      )}

      {/* Threshold Transparency */}
      <ThresholdRow rule={ruleEvaluated} />

      {/* Recommendation */}
      <div style={{
        marginTop: 10, padding: '10px 14px',
        background: 'rgba(255,153,0,0.06)', border: '1px solid rgba(255,153,0,0.2)',
        borderRadius: 6, fontSize: 11, color: '#ccaa66', fontFamily: 'monospace', lineHeight: 1.6,
      }}>
        <span style={{ color: '#ffcc44', fontWeight: 'bold' }}>→ RECOMMENDATION: </span>
        {recommendation}
      </div>
    </div>
  );
});
FaultChartWrapper.displayName = 'FaultChartWrapper';

// ─── PID OVERLAY DEFINITIONS ─────────────────────────────────────────────────
// Complete registry of all ProcessedMetrics numeric channels.
// Grouped by category for the selector UI.
interface PidOverlayDef {
  key: keyof ProcessedMetrics;
  label: string;
  unit: string;
  color: string;
  category: string;
  domain?: [number, number];
}

const PID_OVERLAYS: PidOverlayDef[] = [
  // ── Engine / Performance ──
  { key: 'rpm',                label: 'RPM',              unit: 'rpm',       color: '#e2e8f0', category: 'Engine' },
  { key: 'hpTorque',           label: 'HP (Torque)',      unit: 'HP',        color: '#ff4d00', category: 'Engine' },
  { key: 'hpMaf',              label: 'HP (MAF)',         unit: 'HP',        color: '#ff8c42', category: 'Engine' },
  { key: 'hpAccel',            label: 'HP (Accel)',       unit: 'HP',        color: '#ff6b6b', category: 'Engine' },
  { key: 'maf',                label: 'MAF',              unit: 'lb/min',    color: '#34d399', category: 'Engine' },
  { key: 'throttlePosition',   label: 'Throttle Pos',    unit: '%',         color: '#c084fc', category: 'Engine', domain: [0, 100] },
  { key: 'vehicleSpeed',       label: 'Speed',            unit: 'mph',       color: '#38bdf8', category: 'Engine' },
  // ── Boost / Turbo ──
  { key: 'boost',              label: 'Boost',            unit: 'PSIG',      color: '#a78bfa', category: 'Boost' },
  { key: 'boostDesired',       label: 'Boost Desired',    unit: 'PSIG',      color: '#7c3aed', category: 'Boost' },
  { key: 'turboVanePosition',  label: 'Vane Pos',         unit: '%',         color: '#fb923c', category: 'Boost', domain: [0, 100] },
  { key: 'turboVaneDesired',   label: 'Vane Desired',     unit: '%',         color: '#d97706', category: 'Boost', domain: [0, 100] },
  { key: 'mapAbsolute',        label: 'MAP Absolute',     unit: 'psi',       color: '#818cf8', category: 'Boost' },
  { key: 'barometricPressure', label: 'Baro Pressure',    unit: 'psi',       color: '#94a3b8', category: 'Boost' },
  // ── Fuel System ──
  { key: 'railPressureActual', label: 'Rail Pressure',    unit: 'psi',       color: '#f59e0b', category: 'Fuel' },
  { key: 'railPressureDesired',label: 'Rail Desired',     unit: 'psi',       color: '#eab308', category: 'Fuel' },
  { key: 'pcvDutyCycle',       label: 'PCV Duty',         unit: 'mA',        color: '#fbbf24', category: 'Fuel' },
  { key: 'injectorPulseWidth', label: 'Inj Pulse Width',  unit: 'ms',        color: '#fcd34d', category: 'Fuel' },
  { key: 'injectionTiming',    label: 'Inj Timing',       unit: '°BTDC',     color: '#fde68a', category: 'Fuel' },
  { key: 'fuelQuantity',       label: 'Fuel Qty',         unit: 'mm³',       color: '#f0abfc', category: 'Fuel' },
  // ── Temperatures ──
  { key: 'exhaustGasTemp',     label: 'EGT',              unit: '°F',        color: '#ef4444', category: 'Temps' },
  { key: 'coolantTemp',        label: 'Coolant',          unit: '°F',        color: '#22d3ee', category: 'Temps' },
  { key: 'oilTemp',            label: 'Oil Temp',         unit: '°F',        color: '#f97316', category: 'Temps' },
  { key: 'transFluidTemp',     label: 'Trans Temp',       unit: '°F',        color: '#e879f9', category: 'Temps' },
  { key: 'intakeAirTemp',      label: 'IAT',              unit: '°F',        color: '#67e8f9', category: 'Temps' },
  // ── Pressures / Lubrication ──
  { key: 'oilPressure',        label: 'Oil Press',        unit: 'psi',       color: '#84cc16', category: 'Pressures' },
  { key: 'converterPressure',  label: 'Conv Pressure',    unit: 'psi',       color: '#a3e635', category: 'Pressures' },
  // ── Transmission ──
  { key: 'converterSlip',      label: 'Conv Slip',        unit: 'RPM',       color: '#fb7185', category: 'Trans' },
  { key: 'converterDutyCycle', label: 'Conv Duty',        unit: '%',         color: '#f472b6', category: 'Trans' },
  { key: 'currentGear',        label: 'Gear',             unit: '',          color: '#a78bfa', category: 'Trans' },
  { key: 'outputShaftRpm',     label: 'Output Shaft RPM', unit: 'rpm',       color: '#c084fc', category: 'Trans' },
  { key: 'turbineRpm',         label: 'Turbine RPM',      unit: 'rpm',       color: '#d946ef', category: 'Trans' },
  { key: 'transLinePressureDesired', label: 'Line Press Des', unit: 'psi',   color: '#e879f9', category: 'Trans' },
  { key: 'transLinePressureActual',  label: 'Line Press Act', unit: 'psi',   color: '#a855f7', category: 'Trans' },
  { key: 'transLinePressureDC',      label: 'Line Press DC',  unit: '%',     color: '#9333ea', category: 'Trans', domain: [0, 100] },
  // ── Cummins EGT Probes ──
  { key: 'egt2',              label: 'EGT Probe 2',      unit: '°F',        color: '#f87171', category: 'Temps' },
  { key: 'egt3',              label: 'EGT Probe 3',      unit: '°F',        color: '#fb923c', category: 'Temps' },
  { key: 'egt4',              label: 'EGT Probe 4',      unit: '°F',        color: '#fbbf24', category: 'Temps' },
  { key: 'egt5',              label: 'EGT Probe 5',      unit: '°F',        color: '#a3e635', category: 'Temps' },
  { key: 'egrTemp',           label: 'EGR Temp',          unit: '°F',        color: '#2dd4bf', category: 'Temps' },
  { key: 'intakeManifoldTemp',label: 'Intake Manifold',   unit: '°F',        color: '#38bdf8', category: 'Temps' },
  { key: 'chargeCoolerTemp',  label: 'Charge Cooler',     unit: '°F',        color: '#818cf8', category: 'Temps' },
  // ── Cummins Engine ──
  { key: 'turboSpeed',        label: 'Turbo Speed',       unit: 'rpm',       color: '#06b6d4', category: 'Boost' },
  { key: 'exhaustPressure',   label: 'Exhaust Press',     unit: 'psi',       color: '#f43f5e', category: 'Pressures' },
  { key: 'batteryVoltage',    label: 'Battery',           unit: 'V',         color: '#facc15', category: 'Engine' },
  { key: 'dpfSootLevel',      label: 'DPF Soot',          unit: 'g',         color: '#78716c', category: 'Engine' },
  { key: 'egrPosition',       label: 'EGR Pos',           unit: '%',         color: '#10b981', category: 'Engine', domain: [0, 100] },
  { key: 'intakeThrottlePosition', label: 'Intake Throttle', unit: '%',     color: '#14b8a6', category: 'Engine', domain: [0, 100] },
  { key: 'calcLoad',          label: 'Calc Load',         unit: '%',         color: '#8b5cf6', category: 'Engine', domain: [0, 100] },
  { key: 'driverDemandTorque', label: 'Driver Demand',    unit: '%',         color: '#ec4899', category: 'Engine', domain: [0, 100] },
  { key: 'actualEngineTorque', label: 'Actual Torque',    unit: '%',         color: '#f43f5e', category: 'Engine', domain: [0, 100] },
  { key: 'mainInjDuration',   label: 'Main Inj Duration', unit: 'µs',        color: '#d97706', category: 'Fuel' },
  { key: 'fuelRegCurrent',    label: 'Fuel Reg Current',  unit: 'A',         color: '#b45309', category: 'Fuel' },
  // ── Cummins Injection Detail ──
  { key: 'pilot1Qty',         label: 'Pilot 1 Qty',       unit: 'mm³',       color: '#6ee7b7', category: 'Fuel' },
  { key: 'pilot2Qty',         label: 'Pilot 2 Qty',       unit: 'mm³',       color: '#34d399', category: 'Fuel' },
  { key: 'post1Qty',          label: 'Post 1 Qty',        unit: 'mm³',       color: '#fca5a5', category: 'Fuel' },
  { key: 'post2Qty',          label: 'Post 2 Qty',        unit: 'mm³',       color: '#f87171', category: 'Fuel' },
  { key: 'post3Qty',          label: 'Post 3 Qty',        unit: 'mm³',       color: '#ef4444', category: 'Fuel' },
  { key: 'post4Qty',          label: 'Post 4 Qty',        unit: 'mm³',       color: '#dc2626', category: 'Fuel' },
  // ── Cummins State ──
  { key: 'regenState',        label: 'Regen State',        unit: '',          color: '#f59e0b', category: 'Engine' },
  { key: 'engineTorqueState', label: 'Torque State',       unit: '',          color: '#64748b', category: 'Engine' },
  { key: 'fuelControlMode',   label: 'Fuel Ctrl Mode',     unit: '',          color: '#475569', category: 'Engine' },
  { key: 'altitudeDensityHigh', label: 'Alt Density High', unit: '',          color: '#94a3b8', category: 'Engine' },
  { key: 'altitudeDensityLow',  label: 'Alt Density Low',  unit: '',          color: '#cbd5e1', category: 'Engine' },
  { key: 'cspTuneNumber',     label: 'CSP Tune #',         unit: '',          color: '#e2e8f0', category: 'Engine' },
];

// ─── MAIN DYNOJET-STYLE HP/TORQUE CHART ──────────────────────────────────────
export const DynoHPChart = forwardRef<DynoChartHandle, DynoChartProps>(({ data, binnedData }, ref) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [xMode, setXMode] = useState<'rpm' | 'time'>('rpm');
  const [brushIndices, setBrushIndices] = useState<{ startIndex?: number; endIndex?: number }>({});

  useImperativeHandle(ref, () => ({
    jumpToTime: (startMin: number, endMin: number) => {
      setXMode('time');
      // Resolve indices after timeData is built; store pending range as a sentinel
      // We use a small timeout to let the mode switch re-render first
      setTimeout(() => {
        setBrushIndices({ _startMin: startMin, _endMin: endMin } as any);
      }, 50);
      divRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  }));

  // Determine which PIDs have data in this log
  const availablePids = useMemo(() => {
    return PID_OVERLAYS.filter(p => {
      const arr = data[p.key] as number[] | undefined;
      if (!Array.isArray(arr) || arr.length === 0) return false;
      // Channel has data if it has any non-zero, non-NaN values
      // (some PIDs like injection timing can be negative)
      const nonEmpty = arr.filter(v => !isNaN(v) && v !== 0);
      return nonEmpty.length >= arr.length * 0.01; // at least 1% non-zero
    });
  }, [data]);

  const activePidDefs = useMemo(
    () => availablePids.filter(p => selectedPids.has(p.key as string)),
    [selectedPids, availablePids]
  );

  const togglePid = (key: string) => {
    setSelectedPids(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Determine if torque-based HP is available. If not, fall back to acceleration-based HP.
  const hasTorqueHP = useMemo(() => {
    return data.hpTorque.some(v => v > 10);
  }, [data.hpTorque]);

  const hasAccelHP = useMemo(() => {
    return data.hpAccel.some(v => v > 10);
  }, [data.hpAccel]);

  // Choose the best HP source: torque > accel > MAF
  const hpSource = hasTorqueHP ? 'torque' : hasAccelHP ? 'accel' : 'maf';

  const dynoData = useMemo(() => {
    // Build base dyno points binned by RPM
    let base: Array<Record<string, number | null>> = [];
    const bucketSize = 100;

    // Select HP array based on best available source
    const hpArr = hpSource === 'torque' ? data.hpTorque
                : hpSource === 'accel' ? data.hpAccel
                : data.hpMaf;

    if (!binnedData || binnedData.length === 0) {
      const step = Math.ceil(data.rpm.length / 80);
      base = data.rpm
        .map((rpm, i) => ({
          rpm: Math.round(rpm),
          hp: Math.round(hpArr[i] || 0),
          torque: rpm > 100 ? Math.round((hpArr[i] || 0) * 5252 / rpm) : 0,
        }))
        .filter((_, i) => i % step === 0)
        .filter(d => (d.rpm as number) > 600 && (d.hp as number) > 10 && (d.torque as number) > 0 && (d.torque as number) < 2500)
        .sort((a, b) => (a.rpm as number) - (b.rpm as number));
    } else {
      base = binnedData
        .filter(b => b.rpmBin > 600 && b.hpTorqueMean > 10)
        .map(b => ({
          rpm: Math.round(b.rpmBin),
          hp: Math.round(b.hpTorqueMean),
          torque: b.rpmBin > 100 ? Math.round(b.hpTorqueMean * 5252 / b.rpmBin) : 0,
        }))
        .filter(d => (d.torque as number) > 0 && (d.torque as number) < 2500);
    }

    // Build per-PID bucket maps for all selected PIDs
    const pidBuckets: Record<string, Record<number, { sum: number; count: number }>> = {};
    for (const pidDef of activePidDefs) {
      const pidArr = data[pidDef.key as keyof ProcessedMetrics] as number[];
      const bucketMap: Record<number, { sum: number; count: number }> = {};
      data.rpm.forEach((rpm, i) => {
        const pidVal = pidArr[i];
        if (!isNaN(pidVal) && pidVal !== 0 && rpm > 600) {
          const bucket = Math.round(rpm / bucketSize) * bucketSize;
          if (!bucketMap[bucket]) bucketMap[bucket] = { sum: 0, count: 0 };
          bucketMap[bucket].sum += pidVal;
          bucketMap[bucket].count++;
        }
      });
      pidBuckets[pidDef.key as string] = bucketMap;
    }

    return base.map(d => {
      const row: Record<string, number | null> = { ...d };
      for (const pidDef of activePidDefs) {
        const bucket = Math.round((d.rpm as number) / bucketSize) * bucketSize;
        const bkt = pidBuckets[pidDef.key as string]?.[bucket];
        row[`pid_${pidDef.key as string}`] = bkt ? bkt.sum / bkt.count : null;
      }
      return row;
    });
  }, [binnedData, data, activePidDefs]);

  // TIME-SERIES data: raw samples downsampled to ~300 points
  const timeData = useMemo(() => {
    const n = data.rpm.length;
    if (n === 0) return [];
    const step = Math.max(1, Math.ceil(n / 300));
    const rows: Array<Record<string, number | null>> = [];
    for (let i = 0; i < n; i += step) {
      const rpm = data.rpm[i] || 0;
      const hpArr2 = hpSource === 'torque' ? data.hpTorque
                   : hpSource === 'accel' ? data.hpAccel
                   : data.hpMaf;
      const hpVal = hpArr2[i] || 0;
      const row: Record<string, number | null> = {
        time: parseFloat((data.timeMinutes[i] || 0).toFixed(3)),
        rpm,
        hp: Math.round(hpVal),
        torque: rpm > 100 ? Math.round(hpVal * 5252 / rpm) : 0,
      };
      for (const pidDef of activePidDefs) {
        const pidArr = data[pidDef.key as keyof ProcessedMetrics] as number[];
        const v = pidArr[i];
        row[`pid_${pidDef.key as string}`] = (v != null && !isNaN(v) && v !== 0) ? v : null;
      }
      rows.push(row);
    }
    return rows;
  }, [data, activePidDefs]);

  // Resolve pending jump-to-time sentinel into real brush indices
  useEffect(() => {
    const b = brushIndices as any;
    if (typeof b._startMin === 'number' && timeData.length > 0) {
      const startIdx = timeData.findIndex(d => (d.time as number) >= b._startMin);
      const endIdx = timeData.findLastIndex(d => (d.time as number) <= b._endMin + 0.1);
      setBrushIndices({
        startIndex: Math.max(0, startIdx - 2),
        endIndex: Math.min(timeData.length - 1, endIdx + 2),
      });
    }
  }, [brushIndices, timeData]);

  const activeChartData = xMode === 'time' ? timeData : dynoData;

  const peakHp = dynoData.length ? dynoData.reduce((max, d) => (d.hp as number) > (max.hp as number) ? d : max, { rpm: 0, hp: 0, torque: 0 }) : { rpm: 0, hp: 0, torque: 0 };
  const peakTorque = dynoData.length ? dynoData.reduce((max, d) => (d.torque as number) > (max.torque as number) ? d : max, { rpm: 0, hp: 0, torque: 0 }) : { rpm: 0, hp: 0, torque: 0 };
  const maxY = dynoData.length ? Math.max(...dynoData.map(d => Math.max(d.hp as number, d.torque as number)), 500) * 1.12 : 700;

  // Build per-PID axis domains from raw data arrays (captures all spikes, not averaged buckets)
  const hasPids = activePidDefs.length > 0;
  const pidAxisDomains = useMemo(() => {
    const domains: Record<string, [number, number]> = {};
    for (const pidDef of activePidDefs) {
      if (pidDef.domain) {
        domains[pidDef.key as string] = pidDef.domain;
      } else {
        const rawArr = data[pidDef.key as keyof ProcessedMetrics] as number[];
        const vals = Array.isArray(rawArr) ? rawArr.filter(v => !isNaN(v) && v !== 0) : [];
        if (vals.length) {
          const mn = Math.min(...vals);
          const mx = Math.max(...vals);
          const pad = (mx - mn) * 0.12 || Math.abs(mx) * 0.12 || 1;
          domains[pidDef.key as string] = [mn >= 0 ? Math.max(0, mn - pad) : mn - pad, mx + pad * 1.5];
        } else {
          domains[pidDef.key as string] = [0, 100];
        }
      }
    }
    return domains;
  }, [activePidDefs, data]);
  // Right margin grows with number of PID axes (60px each)
  const rightMargin = hasPids ? Math.max(60, activePidDefs.length * 60) : 40;

  // If dyno data is insufficient but we have time-series data, auto-switch to time mode
  // instead of blocking the entire Log Details section
  const dynoInsufficient = dynoData.length < 3;
  const hasTimeData = timeData.length > 0;

  // Auto-switch to time mode when dyno data is insufficient but time data exists
  useEffect(() => {
    if (dynoInsufficient && hasTimeData && xMode === 'rpm') {
      setXMode('time');
    }
  }, [dynoInsufficient, hasTimeData, xMode]);

  // Only show the dead-end if we have NO data at all (no time series either)
  if (dynoInsufficient && !hasTimeData) {
    return (
      <div ref={divRef} style={{
        background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
        border: '1px solid #1e2330', borderRadius: '12px', padding: '40px 20px',
        textAlign: 'center', color: '#444', fontFamily: 'monospace', fontSize: 13,
      }}>
        <div style={{ color: '#ff4d00', fontSize: 16, fontWeight: 'bold', letterSpacing: 2, marginBottom: 8 }}>LOG DETAILS</div>
        <div>No PID data found in this log file.</div>
        <div style={{ fontSize: 11, marginTop: 6, color: '#333' }}>Upload a datalog with at least one engine PID channel.</div>
      </div>
    );
  }

  const chartContent = (
    <div ref={divRef} style={{
      background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
      border: fullscreen ? 'none' : '1px solid #1e2330',
      borderRadius: fullscreen ? 0 : '12px',
      padding: fullscreen ? '24px 28px' : '20px',
      boxShadow: fullscreen ? 'none' : '0 4px 32px rgba(0,0,0,0.6)',
      position: 'relative',
      height: fullscreen ? '100%' : undefined,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#ff4d00', fontWeight: 'bold', fontSize: 16, fontFamily: 'monospace', letterSpacing: 2 }}>
            LOG DETAILS
          </div>
          <div style={{ color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
            PID Data Explorer — Toggle channels to visualize
          </div>
          <div style={{
            color: '#665533', fontSize: 10, fontFamily: 'monospace', marginTop: 4,
            padding: '4px 8px', background: 'rgba(255,180,50,0.06)', borderRadius: 4,
            borderLeft: '2px solid #664400', lineHeight: 1.4, maxWidth: 500,
          }}>
            These numbers are calculated from the datalog and are heavily dependent on tuning configuration.
            They can be inaccurate vs. an actual chassis dyno. Use as a trend indicator, not bragging rights.
          </div>
          {hpSource !== 'torque' && !dynoInsufficient && (
            <div style={{
              color: '#ff8c42', fontSize: 10, fontFamily: 'monospace', marginTop: 4,
              padding: '4px 8px', background: 'rgba(255,140,66,0.08)', borderRadius: 4,
              borderLeft: '2px solid #ff8c42', lineHeight: 1.4, maxWidth: 500,
            }}>
              {hpSource === 'accel'
                ? 'HP Source: Vehicle Weight + Acceleration (torque PID unavailable). Assumes 7500 lb vehicle weight. Includes rolling resistance and aero drag estimates.'
                : 'HP Source: MAF-based estimate (torque and speed PIDs unavailable). Less accurate than torque or acceleration methods.'}
            </div>
          )}
          {dynoInsufficient && (
            <div style={{
              color: '#00c8ff', fontSize: 10, fontFamily: 'monospace', marginTop: 4,
              padding: '4px 8px', background: 'rgba(0,200,255,0.06)', borderRadius: 4,
              borderLeft: '2px solid #00c8ff', lineHeight: 1.4, maxWidth: 500,
            }}>
              Dyno curve unavailable (insufficient HP/torque data). Showing time-series view.
              Toggle PID channels below to explore available data.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #2a2e3a',
              borderRadius: 6,
              color: '#555',
              cursor: 'pointer',
              padding: '5px 9px',
              fontFamily: 'monospace',
              fontSize: 13,
              lineHeight: 1,
              transition: 'all 0.15s',
              alignSelf: 'center',
            }}
          >
            {fullscreen ? '✕' : '⛶'}
          </button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#ff4d00', fontSize: 32, fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 1 }}>
              {peakHp.hp}
            </div>
            <div style={{ color: '#ff4d00', fontSize: 10, fontFamily: 'monospace' }}>HP @ {peakHp.rpm} RPM</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#00c8ff', fontSize: 32, fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 1 }}>
              {peakTorque.torque}
            </div>
            <div style={{ color: '#00c8ff', fontSize: 10, fontFamily: 'monospace' }}>LB·FT @ {peakTorque.rpm} RPM</div>
          </div>
        </div>
      </div>

      {/* PID Channel Selector */}
      {availablePids.length > 0 && (
        <div style={{ marginBottom: 12, position: 'relative' }}>
          {/* Trigger button */}
          <button
            onClick={() => setDropdownOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 14px',
              background: dropdownOpen ? 'rgba(255,77,0,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${dropdownOpen ? '#ff4d0055' : '#1e2330'}`,
              borderRadius: 7,
              color: '#888',
              fontFamily: 'monospace',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: 0.5,
              transition: 'all 0.15s',
              width: '100%',
              justifyContent: 'space-between',
            }}
          >
            <span>
              <span style={{ color: '#444', marginRight: 6 }}>▶</span>
              PID CHANNELS
              <span style={{ color: '#444', marginLeft: 8, fontSize: 10 }}>
                {availablePids.length} available
              </span>
              {selectedPids.size > 0 && (
                <span style={{
                  marginLeft: 10, background: '#ff4d0033', color: '#ff4d00',
                  borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 'bold',
                }}>
                  {selectedPids.size} active
                </span>
              )}
            </span>
            <span style={{ color: '#444', fontSize: 10 }}>{dropdownOpen ? '▲' : '▼'}</span>
          </button>

          {/* Active PID chips shown below trigger */}
          {selectedPids.size > 0 && !dropdownOpen && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {activePidDefs.map(pid => (
                <span key={pid.key as string} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 5,
                  border: `1px solid ${pid.color}55`,
                  background: `${pid.color}18`,
                  color: pid.color, fontFamily: 'monospace', fontSize: 10,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: pid.color, display: 'inline-block' }} />
                  {pid.label} <span style={{ opacity: 0.6 }}>({pid.unit})</span>
                  <button onClick={() => togglePid(pid.key as string)} style={{
                    background: 'none', border: 'none', color: pid.color,
                    cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1,
                  }}>×</button>
                </span>
              ))}
              <button onClick={() => setSelectedPids(new Set())} style={{
                padding: '3px 9px', borderRadius: 5, border: '1px solid #333',
                background: 'transparent', color: '#444', fontFamily: 'monospace',
                fontSize: 10, cursor: 'pointer',
              }}>✕ clear all</button>
            </div>
          )}

          {/* Dropdown panel — category grouped */}
          {dropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              marginTop: 4,
              background: '#0d0f14',
              border: '1px solid #1e2330',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              padding: '10px 12px',
              maxHeight: 420,
              overflowY: 'auto',
            }}>
              {/* Header bar */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 8, position: 'sticky', top: 0, background: '#0d0f14', zIndex: 2, paddingBottom: 4,
              }}>
                <span style={{ color: '#444', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
                  SELECT PIDs TO DISPLAY — {availablePids.length} channels detected
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setSelectedPids(new Set(availablePids.map(p => p.key as string)))} style={{
                    padding: '2px 8px', borderRadius: 4, border: '1px solid #2a2e3a',
                    background: 'transparent', color: '#555', fontFamily: 'monospace', fontSize: 9, cursor: 'pointer',
                  }}>select all</button>
                  <button onClick={() => setSelectedPids(new Set())} style={{
                    padding: '2px 8px', borderRadius: 4, border: '1px solid #2a2e3a',
                    background: 'transparent', color: '#555', fontFamily: 'monospace', fontSize: 9, cursor: 'pointer',
                  }}>clear</button>
                  <button onClick={() => setDropdownOpen(false)} style={{
                    padding: '2px 8px', borderRadius: 4, border: '1px solid #2a2e3a',
                    background: 'transparent', color: '#555', fontFamily: 'monospace', fontSize: 9, cursor: 'pointer',
                  }}>close ▲</button>
                </div>
              </div>

              {/* Category-grouped PID list */}
              {(() => {
                const categories = Array.from(new Set(availablePids.map(p => p.category)));
                return categories.map(cat => {
                  const catPids = availablePids.filter(p => p.category === cat);
                  if (catPids.length === 0) return null;
                  const allChecked = catPids.every(p => selectedPids.has(p.key as string));
                  const someChecked = catPids.some(p => selectedPids.has(p.key as string));
                  return (
                    <div key={cat} style={{ marginBottom: 8 }}>
                      {/* Category header with toggle-all */}
                      <div
                        onClick={() => {
                          setSelectedPids(prev => {
                            const next = new Set(prev);
                            if (allChecked) {
                              catPids.forEach(p => next.delete(p.key as string));
                            } else {
                              catPids.forEach(p => next.add(p.key as string));
                            }
                            return next;
                          });
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 6px', cursor: 'pointer',
                          borderBottom: '1px solid #1a1d28', marginBottom: 4,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={allChecked}
                          ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                          readOnly
                          style={{ accentColor: '#ff4d00', width: 12, height: 12, cursor: 'pointer', pointerEvents: 'none' }}
                        />
                        <span style={{
                          color: someChecked ? '#ff4d00' : '#555',
                          fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold',
                          letterSpacing: 1.5, textTransform: 'uppercase',
                        }}>
                          {cat}
                        </span>
                        <span style={{ color: '#333', fontSize: 9, fontFamily: 'monospace' }}>
                          ({catPids.length})
                        </span>
                      </div>
                      {/* PIDs in this category */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 3, paddingLeft: 4 }}>
                        {catPids.map(pid => {
                          const checked = selectedPids.has(pid.key as string);
                          return (
                            <label
                              key={pid.key as string}
                              onClick={(e) => { e.preventDefault(); togglePid(pid.key as string); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '5px 8px', borderRadius: 5,
                                border: `1px solid ${checked ? pid.color + '55' : '#1a1d28'}`,
                                background: checked ? `${pid.color}12` : 'transparent',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                readOnly
                                style={{ accentColor: pid.color, width: 12, height: 12, cursor: 'pointer', pointerEvents: 'none' }}
                              />
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: pid.color, flexShrink: 0 }} />
                              <span style={{ fontFamily: 'monospace', fontSize: 10, color: checked ? pid.color : '#666', flex: 1 }}>
                                {pid.label}
                              </span>
                              <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#333' }}>
                                {pid.unit}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      {/* X-axis mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: '#444', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>X-AXIS:</span>
        {(['rpm', 'time'] as const).map(mode => {
          const disabled = mode === 'rpm' && dynoInsufficient;
          return (
            <button key={mode} onClick={() => !disabled && setXMode(mode)} style={{
              padding: '3px 10px', borderRadius: 4, fontFamily: 'monospace', fontSize: 10,
              cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: 1,
              opacity: disabled ? 0.35 : 1,
              background: xMode === mode ? (mode === 'rpm' ? '#ff4d00' : '#00c8ff') : 'rgba(255,255,255,0.04)',
              border: `1px solid ${xMode === mode ? (mode === 'rpm' ? '#ff4d00' : '#00c8ff') : '#2a2e3a'}`,
              color: xMode === mode ? '#0a0c10' : '#555',
              fontWeight: xMode === mode ? 'bold' : 'normal',
              transition: 'all 0.15s',
            }} title={disabled ? 'Insufficient HP/torque data for RPM view' : undefined}>{mode === 'rpm' ? 'RPM' : 'TIME'}</button>
          );
        })}
        {xMode === 'time' && (
          <span style={{ color: '#333', fontSize: 9, fontFamily: 'monospace', marginLeft: 4 }}>DRAG BRUSH BELOW TO ZOOM</span>
        )}
      </div>

      {/* Chart */}
      <ZoomableChart data={activeChartData} height={fullscreen ? 'calc(100vh - 300px)' : 380}>
        {(visibleData) => (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData} margin={{ top: 10, right: rightMargin, bottom: xMode === 'time' ? 50 : 30, left: 10 }}>
            <defs>
              <linearGradient id="hpGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff4d00" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#ff4d00" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="torqueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00c8ff" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#00c8ff" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 5" stroke="#1a1e2a" vertical={true} horizontal={true} />
            <XAxis
              dataKey={xMode === 'rpm' ? 'rpm' : 'time'}
              stroke="#333"
              tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
              tickFormatter={xMode === 'rpm'
                ? (v) => `${(v / 1000).toFixed(1)}k`
                : (v) => `${Number(v).toFixed(1)}m`
              }
              label={{
                value: xMode === 'rpm' ? 'ENGINE RPM' : 'TIME (min)',
                position: 'insideBottom',
                offset: xMode === 'time' ? -36 : -12,
                fill: '#555', fontSize: 10, fontFamily: 'monospace'
              }}
            />
            <YAxis
              yAxisId="left"
              stroke="#333"
              tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
              domain={[0, maxY]}
              label={{ value: 'HORSEPOWER', angle: -90, position: 'insideLeft', offset: 14, fill: '#ff4d00', fontSize: 10, fontFamily: 'monospace' }}
            />
            {/* Torque axis (shown only when no PIDs selected) */}
            {!hasPids && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#333"
                tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
                domain={[0, maxY]}
                label={{ value: 'TORQUE (LB·FT)', angle: 90, position: 'insideRight', offset: 14, fill: '#00c8ff', fontSize: 10, fontFamily: 'monospace' }}
              />
            )}
            {/* One Y-axis per selected PID, offset to the right */}
            {hasPids && activePidDefs.map((pidDef, idx) => (
              <YAxis
                key={`yaxis_${pidDef.key as string}`}
                yAxisId={`pid_axis_${pidDef.key as string}`}
                orientation="right"
                stroke={pidDef.color}
                tick={{ fill: pidDef.color, fontSize: 9, fontFamily: 'monospace' }}
                domain={pidAxisDomains[pidDef.key as string] ?? [0, 100]}
                width={55}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}
                label={{
                  value: `${pidDef.label} (${pidDef.unit})`,
                  angle: 90,
                  position: 'insideRight',
                  offset: idx * 60 + 14,
                  fill: pidDef.color,
                  fontSize: 9,
                  fontFamily: 'monospace',
                }}
              />
            ))}
            <Tooltip
              content={(props: any) => {
                const { active, payload, label } = props;
                if (!active || !payload?.length) return null;
                return (
                  <div style={{
                    background: 'rgba(13,15,20,0.97)', border: '1px solid #ff4d00',
                    borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace',
                    fontSize: 12, color: '#e0e0e0', boxShadow: '0 0 12px rgba(255,77,0,0.3)',
                  }}>
                    <div style={{ color: '#ff4d00', fontWeight: 'bold', marginBottom: 6 }}>
                      {label ? `${Number(label).toFixed(0)} RPM` : ''}
                    </div>
                    {payload.map((p: any, i: number) => {
                      if (p.value == null) return null;
                      // Decode fueling control state for Cummins datalogs
                      const isFuelCtrl = p.dataKey === 'fuelControlMode' || (p.name && p.name.toLowerCase().includes('fuel ctrl'));
                      const isEngineTorqueState = p.dataKey === 'engineTorqueState';
                      let displayValue = typeof p.value === 'number' ? p.value.toFixed(1) : p.value;
                      let decodedLabel = '';
                      if (isFuelCtrl && typeof p.value === 'number') {
                        const state = decodeFuelingState(Math.round(p.value));
                        if (state) decodedLabel = state.name;
                      }
                      if (isEngineTorqueState && typeof p.value === 'number') {
                        const torqueStates: Record<number, string> = {
                          0: 'No Request', 1: 'Accel Pedal', 2: 'Cruise Control',
                          3: 'PTO', 4: 'Road Speed Governor', 5: 'Engine Protection',
                        };
                        decodedLabel = torqueStates[Math.round(p.value)] || '';
                      }
                      return (
                        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
                          {p.name}: <span style={{ color: '#fff', fontWeight: 'bold' }}>
                            {displayValue}
                          </span>
                          {decodedLabel && (
                            <span style={{ color: '#ffaa00', fontSize: 10, marginLeft: 4 }}>
                              ({decodedLabel})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontFamily: 'monospace', fontSize: 11, paddingTop: 8 }}
              formatter={(value) => (
                <span style={{ color: value === 'Horsepower' ? '#ff4d00' : value === 'Torque (lb·ft)' ? '#00c8ff' : '#aaa' }}>
                  {value}
                </span>
              )}
            />
            <ReferenceLine yAxisId="left" y={445} stroke="#333" strokeDasharray="6 3"
              label={{ value: 'STOCK 445HP', position: 'insideTopRight', fill: '#444', fontSize: 9, fontFamily: 'monospace' }} />
            <Area yAxisId="left" type="monotone" dataKey="hp"
              stroke="#ff4d00" strokeWidth={3} fill="url(#hpGrad)"
              dot={false} isAnimationActive={false} name="Horsepower" />
            {!hasPids && (
              <Area yAxisId="right" type="monotone" dataKey="torque"
                stroke="#00c8ff" strokeWidth={2.5} fill="url(#torqueGrad)"
                dot={false} isAnimationActive={false} name="Torque (lb·ft)" />
            )}
            {/* Render one Line per selected PID, each on its own axis */}
            {activePidDefs.map(pidDef => (
              <Line
                key={pidDef.key as string}
                yAxisId={`pid_axis_${pidDef.key as string}`}
                type="monotone"
                dataKey={`pid_${pidDef.key as string}`}
                stroke={pidDef.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name={`${pidDef.label} (${pidDef.unit})`}
                connectNulls={true}
              />
            ))}
            {xMode === 'rpm' && (peakHp.rpm as number) > 0 && (
              <ReferenceLine yAxisId="left" x={peakHp.rpm as number} stroke="#ff4d00"
                strokeDasharray="4 4" strokeOpacity={0.4}
                label={{ value: `PEAK ${peakHp.hp}HP`, position: 'top', fill: '#ff4d00', fontSize: 9, fontFamily: 'monospace' }} />
            )}
            {xMode === 'time' && (
              <Brush
                dataKey="time"
                height={22}
                stroke="#ff4d00"
                fill="#0d0f14"
                travellerWidth={6}
                tickFormatter={(v) => `${Number(v).toFixed(1)}m`}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </ZoomableChart>

      <div style={{ textAlign: 'right', marginTop: 8, color: '#222', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>
        V-OP BY PPEI · OBD-II ESTIMATED
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <>
        {/* Fullscreen overlay portal */}
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#0a0c10',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
          onKeyDown={(e) => { if (e.key === 'Escape') setFullscreen(false); }}
          tabIndex={-1}
        >
          {chartContent}
        </div>
        {/* Placeholder in original location so layout doesn't collapse */}
        <div style={{ height: 0 }} />
      </>
    );
  }

  return chartContent;
});
DynoHPChart.displayName = 'DynoHPChart';

// ─── RAIL PRESSURE FAULT CHART ────────────────────────────────────────────────
export const RailPressureFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime, reasoningReport }, ref) => {
  // Match descriptive condition codes for rail pressure
  const lowRailIssue = diagnostics.issues.find(i => i.code.startsWith('LOW-RAIL-PRESSURE'));
  const highRailIssue = diagnostics.issues.find(i => i.code.startsWith('HIGH-RAIL') || i.code === 'RAIL-PRESSURE-OSCILLATION' || i.code === 'HIGH-IDLE-RAIL-PRESSURE');
  const issue = lowRailIssue || highRailIssue;
  // Also check reasoning engine for rail pressure findings (warning or fault)
  const reasoningRailFinding = reasoningReport?.findings?.find(
    f => f.id === 'rail-pressure-analysis' && (f.type === 'warning' || f.type === 'fault')
  );
  if (!issue && !reasoningRailFinding) return null;

  const isLow = !!lowRailIssue;
  const displayCode = isLow ? 'Low Rail Pressure' : 'High Rail Pressure';

  const hasRailData = (data.railPressureActual?.length ?? 0) > 0 && (data.railPressureDesired?.length ?? 0) > 0;

  const chartData = useMemo(() => {
    if (!hasRailData) return [];
    const step = Math.ceil(data.timeMinutes.length / 600);
    return data.timeMinutes
      .map((t, i) => {
        const actual = data.railPressureActual?.[i] ?? 0;
        const desired = data.railPressureDesired?.[i] ?? 0;
        return {
          time: parseFloat(t.toFixed(3)),
          actual: actual > 0 ? actual : null,
          desired: desired > 0 ? desired : null,
          deltaLow: (desired > 0 && actual > 0 && desired > actual) ? desired - actual : 0,
          deltaHigh: (desired > 0 && actual > 0 && actual > desired) ? actual - desired : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.actual !== null && d.desired !== null);
  }, [data, hasRailData]);

  const peakActual = chartData.length ? Math.max(...chartData.map(d => d.actual ?? 0)) : 0;
  const peakDesired = chartData.length ? Math.max(...chartData.map(d => d.desired ?? 0)) : 0;
  const maxDeltaLow = chartData.length ? Math.max(...chartData.map(d => d.deltaLow)) : 0;
  const maxDeltaHigh = chartData.length ? Math.max(...chartData.map(d => d.deltaHigh)) : 0;
  const avgActual = chartData.length ? chartData.reduce((s, d) => s + (d.actual ?? 0), 0) / chartData.length : 0;
  const avgDesired = chartData.length ? chartData.reduce((s, d) => s + (d.desired ?? 0), 0) / chartData.length : 0;

  // Fault zone: time range where delta exceeds threshold
  // Thresholds synced with diagnostics.ts: Low Rail=5000 psi, High Rail=3500 psi
  const CHART_THRESHOLD_LOW = 5000;
  const CHART_THRESHOLD_HIGH = 3500;
  const faultPoints = chartData.filter(d => isLow ? d.deltaLow > CHART_THRESHOLD_LOW : d.deltaHigh > CHART_THRESHOLD_HIGH);
  const faultTimeMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.time)) : 0;
  const faultTimeMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.time)) : 0;

  const ruleText = isLow
    ? `Low Rail Pressure: Actual rail pressure is ≥${CHART_THRESHOLD_LOW.toLocaleString()} psi BELOW desired for >10 consecutive seconds. Max observed delta: ${maxDeltaLow.toFixed(0)} psi. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min.`
    : `High Rail Pressure: Actual rail pressure is ≥${CHART_THRESHOLD_HIGH.toLocaleString()} psi ABOVE desired for >12 consecutive seconds (decel/transients excluded). Max observed delta: ${maxDeltaHigh.toFixed(0)} psi. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min.`;

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-rail-pressure"
      code={displayCode}
      title={issue?.title || 'Rail Pressure Analysis'}
      severity={issue?.severity || 'warning'}
      description={issue?.description || 'A rail pressure concern was detected. See the PPEI AI Reasoning section for details.'}
      recommendation={issue?.recommendation || 'Review the PPEI AI Reasoning findings for specific recommendations.'}
      ruleEvaluated={ruleText}
      badges={<>
        <DeltaBadge label="Peak Rail Pressure" actual={peakActual.toFixed(0)} expected={peakDesired.toFixed(0)} delta={(isLow ? peakDesired - peakActual : peakActual - peakDesired).toFixed(0)} unit=" psi" isCritical={true} />
        <DeltaBadge label="Avg Rail Pressure" actual={avgActual.toFixed(0)} expected={avgDesired.toFixed(0)} delta={(isLow ? avgDesired - avgActual : avgActual - avgDesired).toFixed(0)} unit=" psi" isCritical={false} />
        <DeltaBadge label="Max Fault Delta" actual="Detected" expected={isLow ? '<3,000' : '<1,500'} delta={(isLow ? maxDeltaLow : maxDeltaHigh).toFixed(0)} unit=" psi" isCritical={true} />
      </>}
    >
      {hasRailData && chartData.length > 0 ? (
        <ZoomableChart data={chartData} height={300}>
          {(visibleData) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <defs>
                <linearGradient id="deltaLowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff2222" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ff2222" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="deltaHighGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff9900" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ff9900" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke="#1a1e2a" />
              <XAxis dataKey="time" stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${Number(v).toFixed(1)}m`}
                label={{ value: 'TIME (min)', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                label={{ value: 'RAIL PRESSURE (PSI)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip xLabel="Time (min)" />} />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
                formatter={(v) => <span style={{ color: v === 'Desired PSI' ? '#44ff88' : v === 'Actual PSI' ? '#ff4444' : '#ff6622' }}>{v}</span>} />
              {faultTimeMin > 0 && (
                <ReferenceArea x1={faultTimeMin - 0.05} x2={faultTimeMax + 0.05}
                  fill="rgba(255,34,34,0.1)" stroke="#ff2222" strokeWidth={1.5} strokeDasharray="5 3"
                  label={{ value: '⚠ FAULT ZONE', position: 'insideTop', fill: '#ff4444', fontSize: 9, fontFamily: 'monospace' }} />
              )}
              <Line type="monotone" dataKey="desired" stroke="#44ff88" strokeWidth={2.5}
                dot={false} isAnimationActive={false} name="Desired PSI" />
              <Line type="monotone" dataKey="actual" stroke="#ff4444" strokeWidth={2.5}
                dot={false} isAnimationActive={false} name="Actual PSI" />
              {isLow && (
                <Area type="monotone" dataKey="deltaLow" stroke="none"
                  fill="url(#deltaLowGrad)" isAnimationActive={false} name="Δ Deficit (fault)" />
              )}
              {!isLow && (
                <Area type="monotone" dataKey="deltaHigh" stroke="none"
                  fill="url(#deltaHighGrad)" isAnimationActive={false} name="Δ Excess (fault)" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </ZoomableChart>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          Rail pressure channels not logged — fault detected via other indicators.
        </div>
      )}
      <FaultEventList
        isCritical={issue?.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => isLow ? (d.deltaLow ?? 0) > CHART_THRESHOLD_LOW : (d.deltaHigh ?? 0) > CHART_THRESHOLD_HIGH,
          d => isLow ? (d.deltaLow ?? 0) : (d.deltaHigh ?? 0),
          'psi'
        )}
        onJumpToTime={onJumpToTime}
      />
    </FaultChartWrapper>
  );
});
RailPressureFaultChart.displayName = 'RailPressureFaultChart';

// ─── BOOST PRESSURE FAULT CHART ───────────────────────────────────────────────
export const BoostFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime, reasoningReport }, ref) => {
  const issue = diagnostics.issues.find(i => i.code.startsWith('LOW-BOOST'));
  // Also check reasoning engine for boost-related findings (warning or fault)
  const reasoningBoostFinding = reasoningReport?.findings?.find(
    f => (f.id === 'boost-leak-suspicion' || f.id === 'converter-stall-turbo-mismatch') && (f.type === 'warning' || f.type === 'fault')
  );
  if (!issue && !reasoningBoostFinding) return null;

  const hasBoostData = (data.boost?.length ?? 0) > 0;

  const chartData = useMemo(() => {
    if (!hasBoostData) return [];
    const step = Math.ceil(data.timeMinutes.length / 600);
    return data.timeMinutes
      .map((t, i) => {
        const actual = data.boost?.[i] ?? 0;
        const desired = data.boostDesired?.[i] ?? 0;
        return {
          time: parseFloat(t.toFixed(3)),
          actual: actual > 0 ? actual : null,
          desired: desired > 0 ? desired : null,
          delta: (desired > 0 && actual > 0 && desired > actual) ? desired - actual : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.actual !== null);
  }, [data, hasBoostData]);

  const peakActual = chartData.length ? Math.max(...chartData.map(d => d.actual ?? 0)) : 0;
  const peakDesired = chartData.length ? Math.max(...chartData.map(d => d.desired ?? 0)) : 0;
  const maxDelta = chartData.length ? Math.max(...chartData.map(d => d.delta)) : 0;
  // Threshold synced with diagnostics.ts: 8 psi (was 5)
  const BOOST_FAULT_THRESHOLD = 8;
  const faultPoints = chartData.filter(d => ((d.desired ?? 0) - (d.actual ?? 0)) > BOOST_FAULT_THRESHOLD);
  const faultTimeMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.time)) : 0;
  const faultTimeMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.time)) : 0;

  const ruleText = `Low Boost: Actual boost is ≥${BOOST_FAULT_THRESHOLD} psi BELOW desired for >10 consecutive seconds. Max observed delta: ${maxDelta.toFixed(1)} psi. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min. Turbo vane >45% at >2800 RPM triggers boost leak check.`;

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-boost"
      code="Low Boost"
      title={issue?.title || 'Boost Pressure Analysis'}
      severity={issue?.severity || 'warning'}
      description={issue?.description || 'A boost-related concern was detected. See the PPEI AI Reasoning section for details.'}
      recommendation={issue?.recommendation || 'Review the PPEI AI Reasoning findings for specific recommendations.'}
      ruleEvaluated={ruleText}
      badges={<>
        <DeltaBadge label="Peak Boost" actual={peakActual.toFixed(1)} expected={peakDesired > 0 ? peakDesired.toFixed(1) : '48.0'} delta={(peakDesired > 0 ? peakDesired - peakActual : 48 - peakActual).toFixed(1)} unit=" psi" isCritical={true} />
        <DeltaBadge label="Max Fault Delta" actual="Detected" expected={`<${BOOST_FAULT_THRESHOLD} psi gap`} delta={maxDelta.toFixed(1)} unit=" psi" isCritical={true} />
        <DeltaBadge label="Fault Duration" actual={`${faultPoints.length} pts`} expected="0 pts" delta={`${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min`} unit="" isCritical={false} />
      </>}
    >
      {hasBoostData && chartData.length > 0 ? (
        <ZoomableChart data={chartData} height={300}>
          {(visibleData) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <defs>
                <linearGradient id="boostDeltaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff2222" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ff2222" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke="#1a1e2a" />
              <XAxis dataKey="time" stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${Number(v).toFixed(1)}m`}
                label={{ value: 'TIME (min)', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: 'BOOST PRESSURE (PSIG)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip xLabel="Time (min)" />} />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
                formatter={(v) => <span style={{ color: v === 'Desired PSIG' ? '#44ff88' : v === 'Actual PSIG' ? '#00c8ff' : '#ff2222' }}>{v}</span>} />
              {faultTimeMin > 0 && (
                <ReferenceArea x1={faultTimeMin - 0.05} x2={faultTimeMax + 0.05}
                  fill="rgba(255,34,34,0.1)" stroke="#ff2222" strokeWidth={1.5} strokeDasharray="5 3"
                  label={{ value: '⚠ FAULT ZONE', position: 'insideTop', fill: '#ff4444', fontSize: 9, fontFamily: 'monospace' }} />
              )}
              <ReferenceLine y={25} stroke="#ff9900" strokeDasharray="6 3"
                label={{ value: 'BOOST LEAK THRESHOLD (25 PSIG)', position: 'insideTopRight', fill: '#ff9900', fontSize: 9, fontFamily: 'monospace' }} />
              <Line type="monotone" dataKey="desired" stroke="#44ff88" strokeWidth={2.5}
                dot={false} isAnimationActive={false} name="Desired PSIG" />
              <Line type="monotone" dataKey="actual" stroke="#00c8ff" strokeWidth={2.5}
                dot={false} isAnimationActive={false} name="Actual PSIG" />
              <Area type="monotone" dataKey="delta" stroke="none"
                fill="url(#boostDeltaGrad)" isAnimationActive={false} name="Δ Underboost" />
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </ZoomableChart>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          Boost pressure channels not logged — fault detected via other indicators.
        </div>
      )}
      <FaultEventList
        isCritical={issue?.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => ((d.desired ?? 0) - (d.actual ?? 0)) > BOOST_FAULT_THRESHOLD,
          d => (d.desired ?? 0) - (d.actual ?? 0),
          'psi'
        )}
        onJumpToTime={onJumpToTime}
      />
    </FaultChartWrapper>
  );
});
BoostFaultChart.displayName = 'BoostFaultChart';

// ─── EGT FAULT CHART ──────────────────────────────────────────────────────────
export const EgtFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime }, ref) => {
  // Match all EGT condition codes: EGT-SENSOR-*, EGT-HIGH
  const issue = diagnostics.issues.find(i => i.code.startsWith('EGT-'));
  if (!issue) return null;

  const hasEgtData = (data.exhaustGasTemp?.length ?? 0) > 0;

  const chartData = useMemo(() => {
    if (!hasEgtData) return [];
    const step = Math.ceil(data.timeMinutes.length / 600);
    return data.timeMinutes
      .map((t, i) => {
        const egt = data.exhaustGasTemp?.[i] ?? 0;
        return {
          time: parseFloat(t.toFixed(3)),
          egt: egt > 0 ? egt : null,
          limit: 1475,
          delta: egt > 1475 ? egt - 1475 : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.egt !== null);
  }, [data, hasEgtData]);

  const maxEgt = chartData.length ? Math.max(...chartData.map(d => d.egt ?? 0)) : 0;
  const avgEgt = chartData.length ? chartData.reduce((s, d) => s + (d.egt ?? 0), 0) / chartData.length : 0;
  const faultPoints = chartData.filter(d => (d.egt ?? 0) > 1475);
  const faultTimeMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.time)) : 0;
  const faultTimeMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.time)) : 0;
  const faultDuration = faultPoints.length > 0 && data.timeMinutes.length > 1
    ? faultPoints.length * (data.timeMinutes[data.timeMinutes.length - 1] / data.timeMinutes.length) * 60
    : 0;

  const ruleText = issue.code === 'EGT-SENSOR-OUT-OF-RANGE'
    ? `EGT Sensor Out of Range: Reading above 1,800°F — sensor disconnected or out of service. Observed: ${maxEgt.toFixed(0)}°F.`
    : issue.code === 'EGT-SENSOR-STUCK'
    ? `EGT Sensor Stuck: Reading frozen (< 1°F change) for extended period.`
    : `EGT Sensor Erratic: Temperature readings are unstable. Max observed: ${maxEgt.toFixed(0)}°F. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min.`;

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-egt"
      code="EGT Sensor"
      title={issue.title}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated={ruleText}
      badges={<>
        <DeltaBadge label="Peak EGT" actual={maxEgt.toFixed(0)} expected="<1,475" delta={(maxEgt - 1475).toFixed(0)} unit="°F" isCritical={true} />
        <DeltaBadge label="Avg EGT" actual={avgEgt.toFixed(0)} expected="<1,200" delta={(avgEgt - 1200).toFixed(0)} unit="°F" isCritical={avgEgt > 1200} />
        <DeltaBadge label="Over-Limit Duration" actual={`${faultDuration.toFixed(1)}s`} expected="0s" delta={`${faultPoints.length} pts`} unit="" isCritical={true} />
      </>}
    >
      {hasEgtData && chartData.length > 0 ? (
        <ZoomableChart data={chartData} height={300}>
          {(visibleData) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <defs>
                <linearGradient id="egtDeltaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff2222" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#ff2222" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="egtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff9900" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff9900" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke="#1a1e2a" />
              <XAxis dataKey="time" stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${Number(v).toFixed(1)}m`}
                label={{ value: 'TIME (min)', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: 'EGT (°F)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip xLabel="Time (min)" />} />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
                formatter={(v) => <span style={{ color: v === 'EGT Limit (1475°F)' ? '#44ff88' : v === 'EGT (°F)' ? '#ff9900' : '#ff2222' }}>{v}</span>} />
              <ReferenceLine y={1475} stroke="#ff6600" strokeDasharray="6 3"
                label={{ value: 'WARN 1475°F', position: 'insideTopRight', fill: '#ff6600', fontSize: 9, fontFamily: 'monospace' }} />
              <ReferenceLine y={1800} stroke="#ff2222" strokeDasharray="4 2"
                label={{ value: 'SENSOR FAULT 1800°F', position: 'insideTopRight', fill: '#ff2222', fontSize: 9, fontFamily: 'monospace' }} />
              {faultTimeMin > 0 && (
                <ReferenceArea x1={faultTimeMin - 0.05} x2={faultTimeMax + 0.05}
                  fill="rgba(255,34,34,0.1)" stroke="#ff2222" strokeWidth={1.5} strokeDasharray="5 3"
                  label={{ value: '⚠ FAULT ZONE', position: 'insideTop', fill: '#ff4444', fontSize: 9, fontFamily: 'monospace' }} />
              )}
              <Area type="monotone" dataKey="egt" stroke="#ff9900" strokeWidth={2.5}
                fill="url(#egtGrad)" dot={false} isAnimationActive={false} name="EGT (°F)" />
              <Line type="monotone" dataKey="limit" stroke="#44ff88" strokeWidth={1.5}
                strokeDasharray="6 3" dot={false} isAnimationActive={false} name="EGT Limit (1475°F)" />
              <Area type="monotone" dataKey="delta" stroke="none"
                fill="url(#egtDeltaGrad)" isAnimationActive={false} name="Δ Over-Limit" />
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </ZoomableChart>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          EGT channels not logged — fault detected via other indicators.
        </div>
      )}
      <FaultEventList
        isCritical={issue.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => (d.egt ?? 0) > 1475,
          d => (d.egt ?? 0) - 1475,
          '°F'
        )}
        onJumpToTime={onJumpToTime}
      />
    </FaultChartWrapper>
  );
});
EgtFaultChart.displayName = 'EgtFaultChart';

// ─── MAF FAULT CHART ──────────────────────────────────────────────────────────
export const MafFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime }, ref) => {
  const issue = diagnostics.issues.find(i => i.code.endsWith('-IDLE-MAF'));
  if (!issue) return null;

  const hasMafData = (data.maf?.length ?? 0) > 0;

  const chartData = useMemo(() => {
    if (!hasMafData) return [];
    const step = Math.ceil(data.timeMinutes.length / 600);
    return data.timeMinutes
      .map((t, i) => {
        const maf = data.maf?.[i] ?? 0;
        const rpm = data.rpm?.[i] ?? 0;
        return {
          time: parseFloat(t.toFixed(3)),
          maf: maf > 0 ? maf : null,
          rpm,
          maxIdle: 6,
          minIdle: 2,
          deltaHigh: (rpm < 1000 && maf > 6) ? maf - 6 : 0,
          deltaLow: (rpm < 1000 && maf > 0 && maf < 2) ? 2 - maf : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.maf !== null && d.rpm < 1500);
  }, [data, hasMafData]);

  const idlePoints = chartData.filter(d => d.rpm > 400 && d.rpm < 900);
  const avgIdleMaf = idlePoints.length ? idlePoints.reduce((s, d) => s + (d.maf ?? 0), 0) / idlePoints.length : 0;
  const maxIdleMaf = idlePoints.length ? Math.max(...idlePoints.map(d => d.maf ?? 0)) : 0;
  const minIdleMaf = idlePoints.length ? Math.min(...idlePoints.map(d => d.maf ?? 0)) : 0;
  const isHigh = avgIdleMaf > 6;

  const ruleText = `MAF Idle Fault: MAF flow at idle (RPM <1000) is ${isHigh ? 'above 6.0 lb/min' : 'below 2.0 lb/min'} for >5 seconds. Avg idle MAF: ${avgIdleMaf.toFixed(2)} lb/min. Normal idle range: 2.0–6.0 lb/min.`;

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-maf"
      code="MAF Idle"
      title={issue.title}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated={ruleText}
      badges={<>
        <DeltaBadge label="Avg Idle MAF" actual={avgIdleMaf.toFixed(2)} expected={isHigh ? '≤6.00' : '≥2.00'} delta={(isHigh ? avgIdleMaf - 6 : 2 - avgIdleMaf).toFixed(2)} unit=" lb/min" isCritical={true} />
        <DeltaBadge label="Peak Idle MAF" actual={isHigh ? maxIdleMaf.toFixed(2) : minIdleMaf.toFixed(2)} expected={isHigh ? '6.00' : '2.00'} delta={(isHigh ? maxIdleMaf - 6 : 2 - minIdleMaf).toFixed(2)} unit=" lb/min" isCritical={true} />
        <DeltaBadge label="Fault Type" actual={isHigh ? 'HIGH' : 'LOW'} expected="2–6 lb/min" delta={isHigh ? 'Too High' : 'Too Low'} unit="" isCritical={true} />
      </>}
    >
      {hasMafData && chartData.length > 0 ? (
        <ZoomableChart data={chartData} height={300}>
          {(visibleData) => (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
              <defs>
                <linearGradient id="mafDeltaHighGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff2222" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ff2222" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="mafDeltaLowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff9900" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ff9900" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke="#1a1e2a" />
              <XAxis dataKey="time" stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${Number(v).toFixed(1)}m`}
                label={{ value: 'TIME (min)', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: 'MAF (lb/min)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip xLabel="Time (min)" />} />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
                formatter={(v) => <span style={{ color: v === 'Max Idle (6)' ? '#44ff88' : v === 'Min Idle (2)' ? '#44ff88' : v === 'MAF (lb/min)' ? '#ffaa00' : '#ff2222' }}>{v}</span>} />
              <ReferenceArea y1={2} y2={6} fill="rgba(68,255,136,0.05)" stroke="none" />
              <ReferenceLine y={6} stroke="#44ff88" strokeDasharray="6 3"
                label={{ value: 'MAX IDLE 6 lb/min', position: 'insideTopRight', fill: '#44ff88', fontSize: 9, fontFamily: 'monospace' }} />
              <ReferenceLine y={2} stroke="#44ff88" strokeDasharray="6 3"
                label={{ value: 'MIN IDLE 2 lb/min', position: 'insideTopRight', fill: '#44ff88', fontSize: 9, fontFamily: 'monospace' }} />
              <Line type="monotone" dataKey="maf" stroke="#ffaa00" strokeWidth={2.5}
                dot={false} isAnimationActive={false} name="MAF (lb/min)" />
              <Area type="monotone" dataKey="deltaHigh" stroke="none"
                fill="url(#mafDeltaHighGrad)" isAnimationActive={false} name="Δ High Fault" />
              <Area type="monotone" dataKey="deltaLow" stroke="none"
                fill="url(#mafDeltaLowGrad)" isAnimationActive={false} name="Δ Low Fault" />
            </ComposedChart>
          </ResponsiveContainer>
          )}
        </ZoomableChart>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          MAF channels not logged — fault detected via other indicators.
        </div>
      )}
      <FaultEventList
        isCritical={issue.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => (d.maf ?? 0) > 6 || ((d.maf ?? 0) > 0 && (d.maf ?? 0) < 2),
          d => (d.maf ?? 0) > 6 ? (d.maf ?? 0) - 6 : 2 - (d.maf ?? 0),
          'lb/min'
        )}
        onJumpToTime={onJumpToTime}
      />
    </FaultChartWrapper>
  );
});
MafFaultChart.displayName = 'MafFaultChart';

// ─── AIRFLOW OUTLOOK TABLE ──────────────────────────────────────────────────
// Replaces Boost Efficiency chart. Shows actual boost, desired boost,
// actual vane position, desired vane position, and MAF in a data table
// binned by RPM with color-coded delta indicators.
interface AirflowOutlookProps {
  data: ProcessedMetrics;
}

export const AirflowOutlookTable = forwardRef<HTMLDivElement, AirflowOutlookProps>(({ data }, ref) => {
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('graph');
  const hasBoost = data.boost.some(v => v > 0);
  const hasVane = data.turboVanePosition.some(v => v > 0);
  const hasMaf = data.maf.some(v => v > 0);
  const hasData = hasBoost || hasVane || hasMaf;
  const hasDesiredBoost = data.boostDesired.some(v => v > 0);
  const hasDesiredVane = data.turboVaneDesired.some(v => v > 0);

  // Bin by 250 RPM buckets above 600 RPM
  const tableData = useMemo(() => {
    if (!hasData) return [];
    const bucketSize = 250;
    type Bucket = {
      boostActSum: number; boostDesSum: number;
      vaneActSum: number; vaneDesSum: number;
      mafSum: number; count: number;
      boostActPeak: number; mafPeak: number;
    };
    const buckets: Record<number, Bucket> = {};
    for (let i = 0; i < data.rpm.length; i++) {
      const rpm = data.rpm[i];
      if (!rpm || rpm < 600) continue;
      const key = Math.round(rpm / bucketSize) * bucketSize;
      if (!buckets[key]) buckets[key] = {
        boostActSum: 0, boostDesSum: 0,
        vaneActSum: 0, vaneDesSum: 0,
        mafSum: 0, count: 0,
        boostActPeak: 0, mafPeak: 0,
      };
      const b = buckets[key];
      b.boostActSum += data.boost[i] || 0;
      b.boostDesSum += data.boostDesired[i] || 0;
      b.vaneActSum += data.turboVanePosition[i] || 0;
      b.vaneDesSum += data.turboVaneDesired[i] || 0;
      b.mafSum += data.maf[i] || 0;
      b.count++;
      if ((data.boost[i] || 0) > b.boostActPeak) b.boostActPeak = data.boost[i] || 0;
      if ((data.maf[i] || 0) > b.mafPeak) b.mafPeak = data.maf[i] || 0;
    }
    return Object.entries(buckets)
      .map(([rpmStr, b]) => {
        const boostAct = b.count > 0 ? b.boostActSum / b.count : 0;
        const boostDes = b.count > 0 ? b.boostDesSum / b.count : 0;
        const vaneAct = b.count > 0 ? b.vaneActSum / b.count : 0;
        const vaneDes = b.count > 0 ? b.vaneDesSum / b.count : 0;
        const mafAvg = b.count > 0 ? b.mafSum / b.count : 0;
        return {
          rpm: Number(rpmStr),
          boostAct, boostDes,
          boostDelta: boostDes > 0 ? boostAct - boostDes : null,
          vaneAct, vaneDes,
          vaneDelta: vaneDes > 0 ? vaneAct - vaneDes : null,
          mafAvg,
          boostPeak: b.boostActPeak,
          mafPeak: b.mafPeak,
          samples: b.count,
        };
      })
      .sort((a, b) => a.rpm - b.rpm);
  }, [data, hasData]);

  // Summary stats
  const peakBoostAct = tableData.length ? Math.max(...tableData.map(d => d.boostPeak)) : 0;
  const peakBoostDes = hasDesiredBoost && tableData.length ? Math.max(...tableData.map(d => d.boostDes)) : 0;
  const peakMaf = tableData.length ? Math.max(...tableData.map(d => d.mafPeak)) : 0;
  const peakVaneAct = hasVane && tableData.length ? Math.max(...tableData.map(d => d.vaneAct)) : 0;

  // Delta color helper
  const deltaColor = (delta: number | null, threshold: number) => {
    if (delta === null) return '#555';
    if (Math.abs(delta) < threshold) return '#4ade80'; // green — on target
    if (delta < 0) return '#f87171'; // red — under target
    return '#facc15'; // yellow — over target
  };

  const cellStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '6px 10px',
    fontFamily: 'monospace',
    fontSize: 11,
    textAlign: 'right' as const,
    borderBottom: '1px solid #1a1e2a',
    whiteSpace: 'nowrap' as const,
    ...extra,
  });

  const thStyle = (color: string): React.CSSProperties => ({
    ...cellStyle({ color, fontWeight: 'bold' }),
    position: 'sticky' as const,
    top: 0,
    background: '#0d0f14',
    zIndex: 1,
  });

  return (
    <div ref={ref} style={{
      background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
      border: '1px solid #1e2330',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: 16, fontFamily: 'monospace', letterSpacing: 2 }}>
            AIRFLOW OUTLOOK
          </div>
          <div style={{ color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
            Boost, VGT Vane Position &amp; MAF {viewMode === 'table' ? 'binned by RPM' : 'over time'}
          </div>
        </div>
        {/* Toggle switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: viewMode === 'graph' ? '#a78bfa' : '#555' }}>GRAPH</span>
          <button
            onClick={() => setViewMode(v => v === 'table' ? 'graph' : 'table')}
            style={{
              width: 40, height: 20, borderRadius: 10, border: '1px solid #333',
              background: viewMode === 'table' ? '#333' : '#7c3aed',
              position: 'relative', cursor: 'pointer', padding: 0,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 1,
              left: viewMode === 'graph' ? 2 : 21,
              transition: 'left 0.2s',
            }} />
          </button>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: viewMode === 'table' ? '#a78bfa' : '#555' }}>TABLE</span>
        </div>
      </div>

      {!hasData ? (
        <div style={{ color: '#444', fontFamily: 'monospace', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>
          Boost, vane position, or MAF data not logged in this file.
        </div>
      ) : viewMode === 'graph' ? (
        <AirflowLineGraph data={data} hasBoost={hasBoost} hasVane={hasVane} hasMaf={hasMaf}
          hasDesiredBoost={hasDesiredBoost} hasDesiredVane={hasDesiredVane} />
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Peak Boost', value: `${peakBoostAct.toFixed(1)} PSIG`, color: '#a78bfa' },
              hasDesiredBoost ? { label: 'Peak Desired', value: `${peakBoostDes.toFixed(1)} PSIG`, color: '#7c3aed' } : null,
              hasMaf ? { label: 'Peak MAF', value: `${peakMaf.toFixed(1)} g/s`, color: '#38bdf8' } : null,
              hasVane ? { label: 'Peak Vane', value: `${peakVaneAct.toFixed(1)}%`, color: '#fb923c' } : null,
            ].filter(Boolean).map((s: any) => (
              <div key={s.label} style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid #1e2330',
                borderRadius: 8,
                padding: '8px 14px',
                minWidth: 120,
              }}>
                <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>
                  {s.label}
                </div>
                <div style={{ color: s.color, fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Data table */}
          <div style={{ overflowX: 'auto', maxHeight: 420 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #2a2e3a' }}>
                  <th style={{ ...thStyle('#888'), textAlign: 'left' }}>RPM</th>
                  {hasBoost && <th style={thStyle('#a78bfa')}>Boost Act</th>}
                  {hasDesiredBoost && <th style={thStyle('#7c3aed')}>Boost Des</th>}
                  {hasDesiredBoost && <th style={thStyle('#888')}>Δ Boost</th>}
                  {hasVane && <th style={thStyle('#fb923c')}>Vane Act</th>}
                  {hasDesiredVane && <th style={thStyle('#fbbf24')}>Vane Des</th>}
                  {hasDesiredVane && <th style={thStyle('#888')}>Δ Vane</th>}
                  {hasMaf && <th style={thStyle('#38bdf8')}>MAF (g/s)</th>}
                  <th style={thStyle('#555')}>Samples</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row) => (
                  <tr key={row.rpm} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(167,139,250,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={cellStyle({ textAlign: 'left', color: '#ccc', fontWeight: 'bold' })}>
                      {row.rpm.toLocaleString()}
                    </td>
                    {hasBoost && (
                      <td style={cellStyle({ color: '#a78bfa' })}>
                        {row.boostAct.toFixed(1)}
                      </td>
                    )}
                    {hasDesiredBoost && (
                      <td style={cellStyle({ color: '#7c3aed' })}>
                        {row.boostDes.toFixed(1)}
                      </td>
                    )}
                    {hasDesiredBoost && (
                      <td style={cellStyle({ color: deltaColor(row.boostDelta, 1.5), fontWeight: 'bold' })}>
                        {row.boostDelta !== null ? `${row.boostDelta >= 0 ? '+' : ''}${row.boostDelta.toFixed(1)}` : '—'}
                      </td>
                    )}
                    {hasVane && (
                      <td style={cellStyle({ color: '#fb923c' })}>
                        {row.vaneAct.toFixed(1)}%
                      </td>
                    )}
                    {hasDesiredVane && (
                      <td style={cellStyle({ color: '#fbbf24' })}>
                        {row.vaneDes.toFixed(1)}%
                      </td>
                    )}
                    {hasDesiredVane && (
                      <td style={cellStyle({ color: deltaColor(row.vaneDelta, 3), fontWeight: 'bold' })}>
                        {row.vaneDelta !== null ? `${row.vaneDelta >= 0 ? '+' : ''}${row.vaneDelta.toFixed(1)}%` : '—'}
                      </td>
                    )}
                    {hasMaf && (
                      <td style={cellStyle({ color: '#38bdf8' })}>
                        {row.mafAvg.toFixed(1)}
                      </td>
                    )}
                    <td style={cellStyle({ color: '#444' })}>
                      {row.samples}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#555' }}>Delta:</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#4ade80' }}>● On target</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#f87171' }}>● Under target</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#facc15' }}>● Over target</span>
          </div>
        </>
      )}
    </div>
  );
});
AirflowOutlookTable.displayName = 'AirflowOutlookTable';

// ─── AIRFLOW LINE GRAPH (sub-component for graph view) ─────────────────────
function AirflowLineGraph({ data, hasBoost, hasVane, hasMaf, hasDesiredBoost, hasDesiredVane }: {
  data: ProcessedMetrics;
  hasBoost: boolean;
  hasVane: boolean;
  hasMaf: boolean;
  hasDesiredBoost: boolean;
  hasDesiredVane: boolean;
}) {
  const graphData = useMemo(() => {
    const n = data.rpm.length;
    const step = Math.max(1, Math.ceil(n / 400));
    const rows: Array<Record<string, number | null>> = [];
    for (let i = 0; i < n; i += step) {
      const row: Record<string, number | null> = {
        time: parseFloat((data.timeMinutes[i] || 0).toFixed(3)),
        rpm: data.rpm[i] || 0,
      };
      if (hasBoost) row.boost = data.boost[i] || 0;
      if (hasDesiredBoost) row.boostDesired = data.boostDesired[i] || 0;
      if (hasVane) row.vanePos = data.turboVanePosition[i] || 0;
      if (hasDesiredVane) row.vaneDesired = data.turboVaneDesired[i] || 0;
      if (hasMaf) row.maf = data.maf[i] || 0;
      rows.push(row);
    }
    return rows;
  }, [data, hasBoost, hasVane, hasMaf, hasDesiredBoost, hasDesiredVane]);

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={graphData} margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2330" />
          <XAxis dataKey="time" stroke="#555" tick={{ fontSize: 10, fill: '#666' }}
            label={{ value: 'Time (min)', position: 'insideBottom', offset: -2, style: { fill: '#555', fontSize: 10 } }} />
          <YAxis yAxisId="boost" stroke="#a78bfa" tick={{ fontSize: 10, fill: '#a78bfa' }}
            label={{ value: 'PSIG', angle: -90, position: 'insideLeft', style: { fill: '#a78bfa', fontSize: 10 } }} />
          {hasVane && (
            <YAxis yAxisId="vane" orientation="right" stroke="#fb923c" tick={{ fontSize: 10, fill: '#fb923c' }}
              domain={[0, 100]}
              label={{ value: '%', angle: 90, position: 'insideRight', style: { fill: '#fb923c', fontSize: 10 } }} />
          )}
          {hasMaf && (
            <YAxis yAxisId="maf" orientation="right" stroke="#38bdf8" tick={{ fontSize: 10, fill: '#38bdf8' }}
              label={{ value: 'lb/min', angle: 90, position: 'insideRight', offset: hasVane ? 40 : 0, style: { fill: '#38bdf8', fontSize: 10 } }} />
          )}
          <Tooltip
            contentStyle={{ background: '#0d0f14', border: '1px solid #333', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
            labelStyle={{ color: '#888' }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                boost: 'Boost Actual', boostDesired: 'Boost Desired',
                vanePos: 'Vane Actual', vaneDesired: 'Vane Desired',
                maf: 'MAF',
              };
              return [typeof value === 'number' ? value.toFixed(1) : value, labels[name] || name];
            }}
          />
          {hasBoost && <Line yAxisId="boost" type="monotone" dataKey="boost" stroke="#a78bfa" dot={false} strokeWidth={1.5} name="boost" isAnimationActive={false} />}
          {hasDesiredBoost && <Line yAxisId="boost" type="monotone" dataKey="boostDesired" stroke="#7c3aed" dot={false} strokeWidth={1} strokeDasharray="4 2" name="boostDesired" isAnimationActive={false} />}
          {hasVane && <Line yAxisId="vane" type="monotone" dataKey="vanePos" stroke="#fb923c" dot={false} strokeWidth={1.5} name="vanePos" isAnimationActive={false} />}
          {hasDesiredVane && <Line yAxisId="vane" type="monotone" dataKey="vaneDesired" stroke="#d97706" dot={false} strokeWidth={1} strokeDasharray="4 2" name="vaneDesired" isAnimationActive={false} />}
          {hasMaf && <Line yAxisId={hasVane ? 'maf' : 'boost'} type="monotone" dataKey="maf" stroke="#38bdf8" dot={false} strokeWidth={1.5} name="maf" isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Backward-compatible alias so existing imports still work
export const BoostEfficiencyChart = AirflowOutlookTable;

// ─── TCC SLIP FAULT CHART ────────────────────────────────────────────────────
export const TccFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime }, ref) => {
  // Match all TCC/converter slip codes
  const issue = diagnostics.issues.find(i =>
    i.code === 'TCC-STUCK-OFF' || i.code === 'TCC-STUCK-ON' ||
    i.code === 'CONVERTER-SLIP' || i.code === 'CONVERTER-SLIP-WARN' ||
    i.code === 'TCC-APPLY-LAG' || i.code === 'TCC-APPLY-LAG-WARN'
  );
  if (!issue) return null;

  // Determine whether to use duty cycle % or TCC line pressure psi as the lock signal
  const maxDuty = Math.max(...(data.converterDutyCycle || []).filter(v => v > 0));
  const maxPressure = Math.max(...(data.converterPressure || []).filter(v => v > 0));
  const usePressure = maxDuty < 5 && maxPressure > 10;

  const hasGear = data.currentGear && data.currentGear.some(v => v > 0);

  const chartData = data.timeMinutes.map((t, i) => ({
    time: parseFloat(t.toFixed(3)),
    slip: data.converterSlip[i] ?? 0,
    lockSignal: usePressure
      ? (data.converterPressure?.[i] ?? 0)
      : (data.converterDutyCycle?.[i] ?? 0),
    ...(hasGear ? { gear: data.currentGear[i] ?? 0 } : {}),
  }));

  const lockLabel = usePressure ? 'Line Pressure (psi)' : 'TCC Duty (%)';
  const lockColor = '#fbbf24';
  const lockDomain = usePressure ? [0, 160] : [0, 100];
  const lockThreshold = usePressure ? 80 : 90;
  const lockThresholdLabel = usePressure ? '80 psi (lock)' : '90% (lock)';

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-tcc"
      code={issue.code}
      title={issue.title}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated={usePressure
        ? 'TCC slip > 40 RPM while line pressure >= 80 psi for 15+ consecutive (or 40+ cumulative) locked samples, OR TCC apply lag > 3s'
        : 'TCC slip > 40 RPM while duty cycle > 90% for 15+ consecutive (or 40+ cumulative) locked samples, TCC apply lag > 3s, or slip < 7 RPM while duty cycle < 15% at RPM > 2000'}
      badges={undefined}
    >
      <FaultEventList
        isCritical={issue.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => Math.abs(d.slip) > 19.5,
          d => Math.abs(d.slip),
          'RPM'
        )}
        onJumpToTime={onJumpToTime}
      />
      <ZoomableChart data={chartData} height={220}>
        {(visibleData) => (
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} margin={{ top: 10, right: 70, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" stroke="#555" tick={{ fill: '#888', fontSize: 10 }}
            label={{ value: 'Time (min)', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 10 }} />
          <YAxis yAxisId="slip" stroke="#fb7185" tick={{ fill: '#fb7185', fontSize: 10 }}
            label={{ value: 'Slip (RPM)', angle: -90, position: 'insideLeft', fill: '#fb7185', fontSize: 10 }} />
          <YAxis yAxisId="lock" orientation="right" stroke={lockColor} tick={{ fill: lockColor, fontSize: 10 }}
            label={{ value: lockLabel, angle: 90, position: 'insideRight', fill: lockColor, fontSize: 10 }} domain={lockDomain} />
          {hasGear && (
            <YAxis yAxisId="gear" orientation="right" stroke="#4ade80" tick={{ fill: '#4ade80', fontSize: 10 }}
              label={{ value: 'Gear', angle: 90, position: 'insideRight', fill: '#4ade80', fontSize: 10, offset: 30 }} domain={[0, 10]} hide />
          )}
          <Tooltip content={<FaultTooltip xLabel="Time" />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
          <ReferenceLine yAxisId="slip" y={19.5} stroke="#ff4444" strokeDasharray="4 2"
            label={{ value: '+19.5 RPM', fill: '#ff4444', fontSize: 9, position: 'right' }} />
          <ReferenceLine yAxisId="slip" y={-19.5} stroke="#ff4444" strokeDasharray="4 2"
            label={{ value: '-19.5 RPM', fill: '#ff4444', fontSize: 9, position: 'right' }} />
          <ReferenceLine yAxisId="lock" y={lockThreshold} stroke="#fbbf24" strokeDasharray="4 2"
            label={{ value: lockThresholdLabel, fill: '#fbbf24', fontSize: 9, position: 'left' }} />
          <Line yAxisId="slip" type="monotone" dataKey="slip" stroke="#fb7185" dot={false} strokeWidth={1.5} name="Conv Slip (RPM)" />
          <Line yAxisId="lock" type="monotone" dataKey="lockSignal" stroke={lockColor} dot={false} strokeWidth={1} name={lockLabel} />
          {hasGear && (
            <Line yAxisId="gear" type="stepAfter" dataKey="gear" stroke="#4ade80" dot={false} strokeWidth={2} name="Current Gear" strokeDasharray="6 3" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
        )}
      </ZoomableChart>
    </FaultChartWrapper>
  );
});
TccFaultChart.displayName = 'TccFaultChart';

// ─── VGT TRACKING FAULT CHART ────────────────────────────────────────────────
export const VgtFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime }, ref) => {
  const issue = diagnostics.issues.find(i => i.code === 'VGT-TRACKING-ERROR');
  if (!issue) return null;

  const hasVaneDesired = data.turboVaneDesired.some(v => v > 0);

  const chartData = data.timeMinutes.map((t, i) => ({
    time: parseFloat(t.toFixed(3)),
    actual: data.turboVanePosition[i] ?? 0,
    desired: hasVaneDesired ? (data.turboVaneDesired[i] ?? 0) : null,
    delta: hasVaneDesired ? Math.abs((data.turboVaneDesired[i] ?? 0) - (data.turboVanePosition[i] ?? 0)) : null,
  }));

  const maxDelta = hasVaneDesired
    ? Math.max(...data.turboVanePosition.map((a, i) => Math.abs((data.turboVaneDesired[i] ?? 0) - a)))
    : 0;

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-vgt"
      code={issue.code}
      title={issue.title}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated="VGT vane position error > 19.5% for 3.9+ seconds at RPM > 1200"
      badges={undefined}
    >
      <FaultEventList
        isCritical={issue.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => (d.delta ?? 0) > 19.5,
          d => d.delta ?? 0,
          '%'
        )}
        onJumpToTime={onJumpToTime}
      />
      <ZoomableChart data={chartData} height={220}>
        {(visibleData) => (
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} margin={{ top: 10, right: 70, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" stroke="#555" tick={{ fill: '#888', fontSize: 10 }}
            label={{ value: 'Time (min)', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 10 }} />
          <YAxis yAxisId="vane" stroke="#fb923c" tick={{ fill: '#fb923c', fontSize: 10 }}
            label={{ value: 'Vane (%)', angle: -90, position: 'insideLeft', fill: '#fb923c', fontSize: 10 }} domain={[0, 100]} />
          <YAxis yAxisId="delta" orientation="right" stroke="#ff4444" tick={{ fill: '#ff4444', fontSize: 10 }}
            label={{ value: 'Error (%)', angle: 90, position: 'insideRight', fill: '#ff4444', fontSize: 10 }} domain={[0, 'auto']} />
          <Tooltip content={<FaultTooltip xLabel="Time" />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
          <ReferenceLine yAxisId="delta" y={19.5} stroke="#ff4444" strokeDasharray="4 2"
            label={{ value: '19.5% threshold', fill: '#ff4444', fontSize: 9 }} />
          <Line yAxisId="vane" type="monotone" dataKey="actual" stroke="#fb923c" dot={false} strokeWidth={1.5} name="Vane Actual (%)" />
          {hasVaneDesired && (
            <Line yAxisId="vane" type="monotone" dataKey="desired" stroke="#fde68a" dot={false} strokeWidth={1} strokeDasharray="4 2" name="Vane Desired (%)" />
          )}
          {hasVaneDesired && (
            <Line yAxisId="delta" type="monotone" dataKey="delta" stroke="#ff4444" dot={false} strokeWidth={1} name="Error (%)" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
        )}
      </ZoomableChart>
    </FaultChartWrapper>
  );
});
VgtFaultChart.displayName = 'VgtFaultChart';

// ─── FUEL PRESSURE REGULATOR FAULT CHART (P0089) ─────────────────────────────
export const RegulatorFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime }, ref) => {
  const issue = diagnostics.issues.find(i => i.code === 'FUEL-REGULATOR-HUNTING');
  if (!issue) return null;

  const chartData = data.timeMinutes.map((t, i) => ({
    time: parseFloat(t.toFixed(3)),
    actual: data.railPressureActual[i] ?? 0,
    desired: data.railPressureDesired[i] ?? 0,
    delta: (data.railPressureActual[i] ?? 0) - (data.railPressureDesired[i] ?? 0),
  }));

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-regulator"
      code={issue.code}
      title={issue.title}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated="Rail pressure swing > 2600 psi per sample while desired is stable, or > 26 direction reversals in session"
      badges={undefined}
    >
      <FaultEventList
        isCritical={issue.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => Math.abs(d.delta) > 2600,
          d => Math.abs(d.delta),
          'psi'
        )}
        onJumpToTime={onJumpToTime}
      />
      <ZoomableChart data={chartData} height={220}>
        {(visibleData) => (
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} margin={{ top: 10, right: 70, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" stroke="#555" tick={{ fill: '#888', fontSize: 10 }}
            label={{ value: 'Time (min)', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 10 }} />
          <YAxis yAxisId="psi" stroke="#f59e0b" tick={{ fill: '#f59e0b', fontSize: 10 }}
            label={{ value: 'Rail Pressure (psi)', angle: -90, position: 'insideLeft', fill: '#f59e0b', fontSize: 10 }} domain={['auto', 'auto']} />
          <YAxis yAxisId="delta" orientation="right" stroke="#ff4444" tick={{ fill: '#ff4444', fontSize: 10 }}
            label={{ value: 'Delta (psi)', angle: 90, position: 'insideRight', fill: '#ff4444', fontSize: 10 }} />
          <Tooltip content={<FaultTooltip xLabel="Time" />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
          <ReferenceLine yAxisId="delta" y={2600} stroke="#ff4444" strokeDasharray="4 2"
            label={{ value: '+2600 psi', fill: '#ff4444', fontSize: 9 }} />
          <ReferenceLine yAxisId="delta" y={-2600} stroke="#ff4444" strokeDasharray="4 2"
            label={{ value: '-2600 psi', fill: '#ff4444', fontSize: 9 }} />
          <Line yAxisId="psi" type="monotone" dataKey="actual" stroke="#f59e0b" dot={false} strokeWidth={1.5} name="Rail Actual (psi)" />
          <Line yAxisId="psi" type="monotone" dataKey="desired" stroke="#fde68a" dot={false} strokeWidth={1} strokeDasharray="4 2" name="Rail Desired (psi)" />
          <Line yAxisId="delta" type="monotone" dataKey="delta" stroke="#ff4444" dot={false} strokeWidth={1} name="Delta (psi)" />
        </ComposedChart>
      </ResponsiveContainer>
        )}
      </ZoomableChart>
    </FaultChartWrapper>
  );
});
RegulatorFaultChart.displayName = 'RegulatorFaultChart';

// ─── COOLANT TEMP FAULT CHART (P0116 / P0128) ────────────────────────────────
export const CoolantFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime }, ref) => {
  const issue = diagnostics.issues.find(i => i.code === 'COOLANT-SENSOR-ERRATIC' || i.code === 'COOLANT-LOW-TEMP');
  if (!issue) return null;

  const chartData = data.timeMinutes.map((t, i) => ({
    time: parseFloat(t.toFixed(3)),
    coolant: data.coolantTemp[i] ?? 0,
  }));

  const maxTemp = Math.max(...data.coolantTemp);
  const minTemp = Math.min(...data.coolantTemp.filter(v => v > 0));

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-coolant"
      code={issue.code}
      title={issue.title}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated="Coolant Low Temp: coolant never reaches 185°F after 6.5+ minutes. Coolant Sensor Erratic: coolant sensor jumps >26°F between samples."
      badges={undefined}
    >
      <FaultEventList
        isCritical={issue.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => d.coolant > 0 && d.coolant < 185,
          d => 185 - d.coolant,
          '°F'
        )}
        onJumpToTime={onJumpToTime}
      />
      <ZoomableChart data={chartData} height={220}>
        {(visibleData) => (
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" stroke="#555" tick={{ fill: '#888', fontSize: 10 }}
            label={{ value: 'Time (min)', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 10 }} />
          <YAxis stroke="#22d3ee" tick={{ fill: '#22d3ee', fontSize: 10 }}
            label={{ value: 'Coolant (°F)', angle: -90, position: 'insideLeft', fill: '#22d3ee', fontSize: 10 }} domain={['auto', 'auto']} />
          <Tooltip content={<FaultTooltip xLabel="Time" />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
          <ReferenceLine y={185} stroke="#ff9900" strokeDasharray="4 2"
            label={{ value: '185°F thermostat', fill: '#ff9900', fontSize: 9 }} />
          <ReferenceLine y={210} stroke="#ff4444" strokeDasharray="4 2"
            label={{ value: '210°F warning', fill: '#ff4444', fontSize: 9 }} />
          <Line type="monotone" dataKey="coolant" stroke="#22d3ee" dot={false} strokeWidth={1.5} name="Coolant Temp (°F)" />
        </ComposedChart>
      </ResponsiveContainer>
        )}
      </ZoomableChart>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontFamily: 'monospace', fontSize: 11 }}>
        <span style={{ color: '#888' }}>Max: <strong style={{ color: '#22d3ee' }}>{maxTemp.toFixed(0)}°F</strong></span>
        <span style={{ color: '#888' }}>Min: <strong style={{ color: '#38bdf8' }}>{minTemp.toFixed(0)}°F</strong></span>
      </div>
    </FaultChartWrapper>
  );
});
CoolantFaultChart.displayName = 'CoolantFaultChart';

// ─── IDLE RPM FAULT CHART (P0506 / P0507) ────────────────────────────────────
export const IdleRpmFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime }, ref) => {
  const issue = diagnostics.issues.find(i => i.code === 'IDLE-RPM-LOW' || i.code === 'IDLE-RPM-HIGH');
  if (!issue) return null;

  // Only show samples in the idle RPM range
  const chartData = data.timeMinutes
    .map((t, i) => ({ time: parseFloat(t.toFixed(3)), rpm: data.rpm[i] ?? 0 }))
    .filter(d => d.rpm > 400 && d.rpm < 1400);

  const minRpm = chartData.length ? Math.min(...chartData.map(d => d.rpm)) : 0;
  const maxRpm = chartData.length ? Math.max(...chartData.map(d => d.rpm)) : 0;

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-idle-rpm"
      code={issue.code}
      title={issue.title}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated="Idle RPM Low: idle RPM < 540 for 65+ samples. Idle RPM High: idle RPM > 1100 for 65+ samples."
      badges={undefined}
    >
      <FaultEventList
        isCritical={issue.severity === 'critical'}
        events={computeFaultEvents(
          chartData,
          d => d.rpm < 540 || d.rpm > 1100,
          d => d.rpm < 540 ? 540 - d.rpm : d.rpm - 1100,
          'RPM'
        )}
        onJumpToTime={onJumpToTime}
      />
      <ZoomableChart data={chartData} height={220}>
        {(visibleData) => (
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="time" stroke="#555" tick={{ fill: '#888', fontSize: 10 }}
            label={{ value: 'Time (min)', position: 'insideBottom', offset: -5, fill: '#888', fontSize: 10 }} />
          <YAxis stroke="#38bdf8" tick={{ fill: '#38bdf8', fontSize: 10 }}
            label={{ value: 'RPM', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 10 }} domain={[400, 1400]} />
          <Tooltip content={<FaultTooltip xLabel="Time" />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#aaa' }} />
          <ReferenceLine y={540} stroke="#ff4444" strokeDasharray="4 2"
            label={{ value: '540 RPM low', fill: '#ff4444', fontSize: 9 }} />
          <ReferenceLine y={1100} stroke="#ff9900" strokeDasharray="4 2"
            label={{ value: '1100 RPM high', fill: '#ff9900', fontSize: 9 }} />
          <Line type="monotone" dataKey="rpm" stroke="#38bdf8" dot={false} strokeWidth={1.5} name="Idle RPM" />
        </ComposedChart>
      </ResponsiveContainer>
        )}
      </ZoomableChart>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontFamily: 'monospace', fontSize: 11 }}>
        <span style={{ color: '#888' }}>Min Idle: <strong style={{ color: '#fb7185' }}>{minRpm} RPM</strong></span>
        <span style={{ color: '#888' }}>Max Idle: <strong style={{ color: '#fb7185' }}>{maxRpm} RPM</strong></span>
      </div>
    </FaultChartWrapper>
  );
});
IdleRpmFaultChart.displayName = 'IdleRpmFaultChart';


// ─── CONVERTER STALL / TURBO SPOOL CHART ────────────────────────────────────
/**
 * Visualizes WOT launch events showing RPM vs Boost to highlight the boost
 * build delay caused by a potential converter stall / turbo spool mismatch.
 *
 * Triggers when the reasoning engine detects 'converter-stall-turbo-mismatch'.
 * Shows each detected launch as a time-series with RPM on the left Y-axis and
 * boost on the right Y-axis, with the "lag zone" shaded from WOT to first
 * meaningful boost (>3 PSI).
 */
export const ConverterStallChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics, onJumpToTime, reasoningReport }, ref) => {
  // Only render when reasoning engine detected converter stall / turbo spool mismatch
  const stallFinding = reasoningReport?.findings?.find(
    f => f.id === 'converter-stall-turbo-mismatch' && (f.type === 'warning' || f.type === 'fault')
  );
  if (!stallFinding) return null;

  const rpm = data.rpm;
  const throttle = data.throttlePosition;
  const boost = data.boost;
  const gear = data.currentGear || [];
  const vss = data.vehicleSpeed;
  const timeMin = data.timeMinutes;

  // Detect WOT launch events (same logic as reasoning engine)
  const wotLaunches = useMemo(() => {
    if (rpm.length === 0 || throttle.length === 0 || boost.length === 0) return [];

    const launches: Array<{
      startIdx: number;
      endIdx: number;
      peakRpm: number;
      rpmAtFirstBoost: number;
      firstBoostIdx: number;
      boostBuildDelay: number;
    }> = [];

    let inWotLaunch = false;
    let launchStart = -1;
    let peakRpm = 0;
    let firstBoostIdx = -1;

    for (let i = 0; i < rpm.length; i++) {
      const isWot = throttle[i] > 85;
      const isLowGear = gear.length > 0 ? (gear[i] === 1 || gear[i] === 2) : true;
      const isLowSpeed = vss[i] < 15;

      if (isWot && isLowGear && isLowSpeed && !inWotLaunch) {
        inWotLaunch = true;
        launchStart = i;
        peakRpm = rpm[i];
        firstBoostIdx = -1;
      } else if (inWotLaunch) {
        if (!isWot || vss[i] > 30) {
          if (launchStart >= 0 && (i - launchStart) > 5) {
            launches.push({
              startIdx: launchStart,
              endIdx: i,
              peakRpm,
              rpmAtFirstBoost: firstBoostIdx >= 0 ? rpm[firstBoostIdx] : 0,
              firstBoostIdx: firstBoostIdx >= 0 ? firstBoostIdx : i,
              boostBuildDelay: firstBoostIdx >= 0 ? firstBoostIdx - launchStart : i - launchStart,
            });
          }
          inWotLaunch = false;
          launchStart = -1;
        } else {
          if (rpm[i] > peakRpm) peakRpm = rpm[i];
          if (firstBoostIdx < 0 && boost[i] > 3) firstBoostIdx = i;
        }
      }
    }
    return launches;
  }, [rpm, throttle, boost, gear, vss]);

  // Build chart data: for each launch, create a time-series of RPM + boost
  // We show the first (best) launch in detail, with summary stats for all
  const chartData = useMemo(() => {
    if (wotLaunches.length === 0) return [];

    // Use the first launch (typically the most representative)
    const launch = wotLaunches[0];
    const startTime = timeMin[launch.startIdx] || 0;
    const points: Array<{
      time: number;       // seconds from WOT start
      rpm: number;
      boost: number;
      inLagZone: boolean;
    }> = [];

    // Show up to 5 seconds of data from the launch start
    const maxSamples = Math.min(launch.endIdx, launch.startIdx + 80); // ~8s at 10Hz
    for (let i = launch.startIdx; i < maxSamples && i < rpm.length; i++) {
      const secFromStart = (timeMin[i] - startTime) * 60;
      points.push({
        time: parseFloat(secFromStart.toFixed(2)),
        rpm: rpm[i],
        boost: boost[i] > 0 ? boost[i] : 0,
        inLagZone: i < launch.firstBoostIdx,
      });
    }
    return points;
  }, [wotLaunches, rpm, boost, timeMin]);

  if (chartData.length === 0) return null;

  const sampleRate = 10; // assumed 10 Hz
  const launch = wotLaunches[0];
  const startRpm = rpm[launch.startIdx];
  const rpmAtFirstBoost = launch.rpmAtFirstBoost;
  const boostDelaySec = (launch.boostBuildDelay / sampleRate);
  const peakBoostInLaunch = Math.max(...chartData.map(d => d.boost));
  const peakRpmInLaunch = Math.max(...chartData.map(d => d.rpm));
  const lagZoneEnd = chartData.find(d => !d.inLagZone)?.time ?? chartData[chartData.length - 1].time;

  // Averages across all launches
  const avgStartRpm = wotLaunches.reduce((s, l) => s + rpm[l.startIdx], 0) / wotLaunches.length;
  const avgBoostDelay = wotLaunches.reduce((s, l) => s + l.boostBuildDelay / sampleRate, 0) / wotLaunches.length;

  const ruleText = `Converter Stall / Turbo Spool Analysis: ${wotLaunches.length} WOT launch event(s) detected. ` +
    `Average converter flash stall: ${avgStartRpm.toFixed(0)} RPM. ` +
    `Average boost build delay from WOT: ${avgBoostDelay.toFixed(1)}s. ` +
    `RPM at first meaningful boost (>3 PSI): ${rpmAtFirstBoost > 0 ? rpmAtFirstBoost.toFixed(0) + ' RPM' : 'boost never exceeded 3 PSI during stall'}. ` +
    `Trigger: reasoning engine detected extended boost build time from WOT launches.`;

  return (
    <FaultChartWrapper
      ref={ref}
      chartId="fault-chart-converter-stall"
      code="Converter Stall"
      title="Possible Converter Stall / Turbo Spool Mismatch — WOT Launch Analysis"
      severity="warning"
      description={
        `The PPEI AI Reasoning engine detected that boost takes an extended time to build during WOT launches from a stop. ` +
        `This chart shows RPM and boost pressure during the first detected WOT launch event. ` +
        `The shaded "lag zone" represents the time from WOT application to the first meaningful boost (>3 PSI). ` +
        `A longer lag zone may indicate the converter stall speed is not reaching the turbo's efficient spool range.`
      }
      recommendation={
        `Consider evaluating the torque converter stall speed relative to the turbocharger's effective spool range. ` +
        `Converter stall ratings (e.g. "2200 stall") are measured under specific conditions — actual flash stall from a dead stop ` +
        `can be significantly lower than the rated number. Also check for boost leaks that could compound the issue ` +
        `(pressurize the charge system to 40 PSI and watch for leakdown).`
      }
      ruleEvaluated={ruleText}
      badges={<>
        <DeltaBadge
          label="Flash Stall RPM"
          actual={startRpm.toFixed(0)}
          expected=">1800"
          delta={(1800 - startRpm).toFixed(0)}
          unit=" RPM"
          isCritical={startRpm < 1500}
        />
        <DeltaBadge
          label="Boost Build Delay"
          actual={`${boostDelaySec.toFixed(1)}s`}
          expected="<1.0s"
          delta={`${(boostDelaySec - 1.0).toFixed(1)}s`}
          unit=""
          isCritical={boostDelaySec > 1.5}
        />
        <DeltaBadge
          label="RPM at First Boost"
          actual={rpmAtFirstBoost > 0 ? rpmAtFirstBoost.toFixed(0) : 'N/A'}
          expected="<1800"
          delta={rpmAtFirstBoost > 0 ? (rpmAtFirstBoost - 1800).toFixed(0) : 'N/A'}
          unit={rpmAtFirstBoost > 0 ? ' RPM' : ''}
          isCritical={rpmAtFirstBoost > 2000}
        />
        <DeltaBadge
          label="WOT Launches"
          actual={`${wotLaunches.length}`}
          expected="—"
          delta={`Avg delay: ${avgBoostDelay.toFixed(1)}s`}
          unit=""
          isCritical={false}
        />
      </>}
    >
      <ZoomableChart data={chartData} height={340}>
        {(visibleData) => (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 35, left: 10 }}>
            <defs>
              <linearGradient id="stallLagGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff9900" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#ff9900" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="stallBoostGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4080FF" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#4080FF" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 5" stroke="#1a1e2a" />

            {/* Lag zone shading — from t=0 to first boost */}
            {lagZoneEnd > 0 && (
              <ReferenceArea
                x1={0}
                x2={lagZoneEnd}
                fill="rgba(255,153,0,0.08)"
                stroke="#ff9900"
                strokeWidth={1}
                strokeDasharray="5 3"
                label={{
                  value: `⚠ LAG ZONE (${lagZoneEnd.toFixed(1)}s)`,
                  position: 'insideTop',
                  fill: '#ff9900',
                  fontSize: 10,
                  fontFamily: 'monospace',
                }}
              />
            )}

            <XAxis
              dataKey="time"
              stroke="#333"
              tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(v) => `${Number(v).toFixed(1)}s`}
              label={{
                value: 'TIME FROM WOT (seconds)',
                position: 'insideBottom',
                offset: -15,
                fill: '#555',
                fontSize: 9,
                fontFamily: 'monospace',
              }}
            />

            <YAxis
              yAxisId="rpm"
              stroke="#ff4d00"
              tick={{ fill: '#ff8844', fontSize: 10, fontFamily: 'monospace' }}
              domain={[0, Math.ceil(peakRpmInLaunch / 500) * 500 + 500]}
              label={{
                value: 'RPM',
                angle: -90,
                position: 'insideLeft',
                offset: 14,
                fill: '#ff8844',
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            />

            <YAxis
              yAxisId="boost"
              orientation="right"
              stroke="#4080FF"
              tick={{ fill: '#57A9FB', fontSize: 10, fontFamily: 'monospace' }}
              domain={[0, Math.ceil(peakBoostInLaunch / 5) * 5 + 5]}
              label={{
                value: 'BOOST (PSIG)',
                angle: 90,
                position: 'insideRight',
                offset: 14,
                fill: '#57A9FB',
                fontSize: 10,
                fontFamily: 'monospace',
              }}
            />

            <Tooltip content={<FaultTooltip xLabel="Time from WOT (s)" />} />

            <Legend
              wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
              formatter={(v) => (
                <span style={{
                  color: v === 'RPM' ? '#ff4d00'
                    : v === 'Boost (PSIG)' ? '#4080FF'
                    : '#ff9900'
                }}>{v}</span>
              )}
            />

            {/* Reference lines */}
            <ReferenceLine
              yAxisId="rpm"
              y={1800}
              stroke="#ff9900"
              strokeDasharray="6 3"
              label={{
                value: 'TURBO SPOOL THRESHOLD (1800 RPM)',
                position: 'insideTopRight',
                fill: '#ff9900',
                fontSize: 9,
                fontFamily: 'monospace',
              }}
            />

            <ReferenceLine
              yAxisId="boost"
              y={3}
              stroke="#37D4CF"
              strokeDasharray="6 3"
              label={{
                value: 'FIRST BOOST (3 PSIG)',
                position: 'insideBottomRight',
                fill: '#37D4CF',
                fontSize: 9,
                fontFamily: 'monospace',
              }}
            />

            {/* RPM curve */}
            <Line
              yAxisId="rpm"
              type="monotone"
              dataKey="rpm"
              stroke="#ff4d00"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              name="RPM"
            />

            {/* Boost curve with fill */}
            <Area
              yAxisId="boost"
              type="monotone"
              dataKey="boost"
              stroke="#4080FF"
              strokeWidth={2.5}
              fill="url(#stallBoostGrad)"
              isAnimationActive={false}
              name="Boost (PSIG)"
            />
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </ZoomableChart>

      {/* Per-launch summary table */}
      {wotLaunches.length > 1 && (
        <div style={{
          marginTop: 14,
          border: '1px solid rgba(255,153,0,0.25)',
          borderRadius: 6,
          overflow: 'hidden',
          fontFamily: 'monospace',
          fontSize: 11,
        }}>
          <div style={{
            background: 'rgba(255,153,0,0.1)',
            padding: '6px 12px',
            color: '#ffaa44',
            fontWeight: 'bold',
            fontSize: 10,
            letterSpacing: 1,
            borderBottom: '1px solid rgba(255,153,0,0.25)',
          }}>
            ALL WOT LAUNCHES ({wotLaunches.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['#', 'TIME', 'STALL RPM', 'RPM @ 1ST BOOST', 'BOOST DELAY', 'PEAK RPM'].map(h => (
                  <th key={h} style={{
                    padding: '5px 10px', textAlign: 'left', color: '#555',
                    fontSize: 9, fontWeight: 'bold', letterSpacing: 1,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wotLaunches.map((l, i) => {
                const stallRpm = rpm[l.startIdx];
                const delaySec = l.boostBuildDelay / sampleRate;
                const launchTime = timeMin[l.startIdx];
                return (
                  <tr key={i} style={{
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <td style={{ padding: '5px 10px', color: '#555', fontSize: 10 }}>{i + 1}</td>
                    <td style={{ padding: '5px 10px', color: '#aaa', fontSize: 10 }}>{launchTime.toFixed(2)} min</td>
                    <td style={{ padding: '5px 10px', color: stallRpm < 1500 ? '#ff6666' : '#ffcc44', fontSize: 10, fontWeight: 'bold' }}>
                      {stallRpm.toFixed(0)} RPM
                    </td>
                    <td style={{ padding: '5px 10px', color: l.rpmAtFirstBoost > 2000 ? '#ff6666' : '#aaa', fontSize: 10 }}>
                      {l.rpmAtFirstBoost > 0 ? `${l.rpmAtFirstBoost.toFixed(0)} RPM` : '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: delaySec > 1.5 ? '#ff6666' : '#ffcc44', fontSize: 10, fontWeight: 'bold' }}>
                      {delaySec.toFixed(1)}s
                    </td>
                    <td style={{ padding: '5px 10px', color: '#aaa', fontSize: 10 }}>
                      {l.peakRpm.toFixed(0)} RPM
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </FaultChartWrapper>
  );
});
ConverterStallChart.displayName = 'ConverterStallChart';
