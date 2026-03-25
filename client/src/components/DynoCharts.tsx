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

import { useMemo, forwardRef, useState } from 'react';
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

interface DynoChartProps {
  data: ProcessedMetrics;
  binnedData?: any[];
}

interface FaultChartsProps {
  data: ProcessedMetrics;
  diagnostics: DiagnosticReport;
  binnedData?: any[];
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
}>(({ code, title, severity, description, recommendation, ruleEvaluated, children, badges }, ref) => {
  const borderColor = severity === 'critical' ? '#ff2222' : '#ff9900';
  const badgeColor = severity === 'critical' ? 'rgba(255,34,34,0.2)' : 'rgba(255,153,0,0.2)';
  const badgeText = severity === 'critical' ? '#ff6666' : '#ffcc44';

  return (
    <div ref={ref} style={{
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
        }}>{code}</span>
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
const PID_OVERLAYS: Array<{
  key: keyof ProcessedMetrics;
  label: string;
  unit: string;
  color: string;
  domain?: [number, number];
}> = [
  { key: 'boost',              label: 'Boost',          unit: 'PSIG',    color: '#a78bfa' },
  { key: 'boostDesired',       label: 'Boost Desired',  unit: 'PSIG',    color: '#7c3aed' },
  { key: 'maf',                label: 'MAF',            unit: 'lb/min',  color: '#34d399' },
  { key: 'railPressureActual', label: 'Rail Pressure',  unit: 'psi',     color: '#f59e0b' },
  { key: 'turboVanePosition',  label: 'Vane Pos',       unit: '%',       color: '#fb923c', domain: [0, 100] },
  { key: 'exhaustGasTemp',     label: 'EGT',            unit: '°F',      color: '#ef4444' },
  { key: 'vehicleSpeed',       label: 'Speed',          unit: 'mph',     color: '#38bdf8' },
  { key: 'coolantTemp',        label: 'Coolant',        unit: '°F',      color: '#22d3ee' },
  { key: 'oilTemp',            label: 'Oil Temp',       unit: '°F',      color: '#f97316' },
  { key: 'oilPressure',        label: 'Oil Press',      unit: 'psi',     color: '#84cc16' },
  { key: 'transFluidTemp',     label: 'Trans Temp',     unit: '°F',      color: '#e879f9' },
  { key: 'converterSlip',      label: 'Conv Slip',      unit: 'RPM',     color: '#fb7185' },
  { key: 'pcvDutyCycle',       label: 'PCV Duty',       unit: 'mA',      color: '#fbbf24' },
];

// ─── MAIN DYNOJET-STYLE HP/TORQUE CHART ──────────────────────────────────────
export const DynoHPChart = forwardRef<HTMLDivElement, DynoChartProps>(({ data, binnedData }, ref) => {
  const [selectedPids, setSelectedPids] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [xMode, setXMode] = useState<'rpm' | 'time'>('rpm');

  // Determine which PIDs have data in this log
  const availablePids = useMemo(() => {
    return PID_OVERLAYS.filter(p => {
      const arr = data[p.key] as number[] | undefined;
      return Array.isArray(arr) && arr.some(v => v > 0);
    });
  }, [data]);

  const activePidDefs = useMemo(
    () => PID_OVERLAYS.filter(p => selectedPids.has(p.key as string)),
    [selectedPids]
  );

  const togglePid = (key: string) => {
    setSelectedPids(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const dynoData = useMemo(() => {
    // Build base dyno points binned by RPM
    let base: Array<Record<string, number | null>> = [];
    const bucketSize = 100;

    if (!binnedData || binnedData.length === 0) {
      const step = Math.ceil(data.rpm.length / 80);
      base = data.rpm
        .map((rpm, i) => ({
          rpm: Math.round(rpm),
          hp: Math.round(data.hpTorque[i] || 0),
          torque: rpm > 100 ? Math.round((data.hpTorque[i] || 0) * 5252 / rpm) : 0,
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
        if (pidVal > 0 && rpm > 600) {
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
      const hpVal = data.hpTorque[i] || 0;
      const row: Record<string, number | null> = {
        time: parseFloat((data.timeMinutes[i] || 0).toFixed(3)),
        rpm,
        hp: Math.round(hpVal),
        torque: rpm > 100 ? Math.round(hpVal * 5252 / rpm) : 0,
      };
      for (const pidDef of activePidDefs) {
        const pidArr = data[pidDef.key as keyof ProcessedMetrics] as number[];
        const v = pidArr[i];
        row[`pid_${pidDef.key as string}`] = (v != null && v > 0) ? v : null;
      }
      rows.push(row);
    }
    return rows;
  }, [data, activePidDefs]);

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
        const vals = Array.isArray(rawArr) ? rawArr.filter(v => v > 0) : [];
        if (vals.length) {
          const mn = Math.min(...vals);
          const mx = Math.max(...vals);
          const pad = (mx - mn) * 0.12 || mx * 0.12 || 1;
          domains[pidDef.key as string] = [Math.max(0, mn - pad), mx + pad * 1.5];
        } else {
          domains[pidDef.key as string] = [0, 100];
        }
      }
    }
    return domains;
  }, [activePidDefs, data]);
  // Right margin grows with number of PID axes (60px each)
  const rightMargin = hasPids ? Math.max(60, activePidDefs.length * 60) : 40;

  if (dynoData.length < 3) {
    return (
      <div ref={ref} style={{
        background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
        border: '1px solid #1e2330', borderRadius: '12px', padding: '40px 20px',
        textAlign: 'center', color: '#444', fontFamily: 'monospace', fontSize: 13,
      }}>
        <div style={{ color: '#ff4d00', fontSize: 16, fontWeight: 'bold', letterSpacing: 2, marginBottom: 8 }}>DYNO RESULTS</div>
        <div>Insufficient RPM/torque data to render dyno graph.</div>
        <div style={{ fontSize: 11, marginTop: 6, color: '#333' }}>Log must contain RPM and torque percentage channels.</div>
      </div>
    );
  }

  const chartContent = (
    <div ref={ref} style={{
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
            DYNO RESULTS
          </div>
          <div style={{ color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
            Duramax L5P 6.6L Diesel — Estimated from OBD-II Torque Data
          </div>
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

      {/* PID Overlay Dropdown */}
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
              OVERLAY PIDs
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

          {/* Dropdown panel */}
          {dropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              marginTop: 4,
              background: '#0d0f14',
              border: '1px solid #1e2330',
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              padding: '10px 12px',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 8,
              }}>
                <span style={{ color: '#444', fontSize: 9, fontFamily: 'monospace', letterSpacing: 1 }}>
                  SELECT PIDs TO OVERLAY — multiple allowed
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
                {availablePids.map(pid => {
                  const checked = selectedPids.has(pid.key as string);
                  return (
                    <label
                      key={pid.key as string}
                      onClick={(e) => { e.preventDefault(); togglePid(pid.key as string); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px', borderRadius: 6,
                        border: `1px solid ${checked ? pid.color + '55' : '#1e2330'}`,
                        background: checked ? `${pid.color}12` : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.12s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        style={{ accentColor: pid.color, width: 13, height: 13, cursor: 'pointer', pointerEvents: 'none' }}
                      />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: pid.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'monospace', fontSize: 10, color: checked ? pid.color : '#666' }}>
                        {pid.label}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: '#333', marginLeft: 'auto' }}>
                        {pid.unit}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* X-axis mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: '#444', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>X-AXIS:</span>
        {(['rpm', 'time'] as const).map(mode => (
          <button key={mode} onClick={() => setXMode(mode)} style={{
            padding: '3px 10px', borderRadius: 4, fontFamily: 'monospace', fontSize: 10,
            cursor: 'pointer', letterSpacing: 1,
            background: xMode === mode ? (mode === 'rpm' ? '#ff4d00' : '#00c8ff') : 'rgba(255,255,255,0.04)',
            border: `1px solid ${xMode === mode ? (mode === 'rpm' ? '#ff4d00' : '#00c8ff') : '#2a2e3a'}`,
            color: xMode === mode ? '#0a0c10' : '#555',
            fontWeight: xMode === mode ? 'bold' : 'normal',
            transition: 'all 0.15s',
          }}>{mode === 'rpm' ? 'RPM' : 'TIME'}</button>
        ))}
        {xMode === 'time' && (
          <span style={{ color: '#333', fontSize: 9, fontFamily: 'monospace', marginLeft: 4 }}>DRAG BRUSH BELOW TO ZOOM</span>
        )}
      </div>

      {/* Chart */}
      <div style={{ height: fullscreen ? 'calc(100vh - 300px)' : 380, flex: fullscreen ? '1 1 auto' : undefined }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={activeChartData} margin={{ top: 10, right: rightMargin, bottom: xMode === 'time' ? 50 : 30, left: 10 }}>
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
                    {payload.map((p: any, i: number) =>
                      p.value != null && (
                        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
                          {p.name}: <span style={{ color: '#fff', fontWeight: 'bold' }}>
                            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
                          </span>
                        </div>
                      )
                    )}
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
      </div>

      <div style={{ textAlign: 'right', marginTop: 8, color: '#222', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>
        DURAMAX PERFORMANCE ANALYZER · OBD-II ESTIMATED
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
export const RailPressureFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  // Match suffixed codes: P0087-RAIL-MAXED, P0087-RAIL-TUNING, P0087-RELIEF-VALVE, P0088-*, P0088-OSCILLATION
  const p0087Issue = diagnostics.issues.find(i => i.code.startsWith('P0087'));
  const p0088Issue = diagnostics.issues.find(i => i.code.startsWith('P0088'));
  const issue = p0087Issue || p0088Issue;
  if (!issue) return null;

  const isLow = !!p0087Issue;
  const displayCode = isLow ? 'P0087' : 'P0088';

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
  const faultPoints = chartData.filter(d => isLow ? d.deltaLow > 3000 : d.deltaHigh > 1500);
  const faultTimeMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.time)) : 0;
  const faultTimeMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.time)) : 0;

  const ruleText = isLow
    ? `P0087: Actual rail pressure is ≥3,000 psi BELOW desired for >5 consecutive seconds. Max observed delta: ${maxDeltaLow.toFixed(0)} psi. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min.`
    : `P0088: Actual rail pressure is ≥1,500 psi ABOVE desired for >5 consecutive seconds. Max observed delta: ${maxDeltaHigh.toFixed(0)} psi. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min.`;

  return (
    <FaultChartWrapper
      ref={ref}
      code={displayCode}
      title={`${displayCode} — ${issue.title}`}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated={ruleText}
      badges={<>
        <DeltaBadge label="Peak Rail Pressure" actual={peakActual.toFixed(0)} expected={peakDesired.toFixed(0)} delta={(isLow ? peakDesired - peakActual : peakActual - peakDesired).toFixed(0)} unit=" psi" isCritical={true} />
        <DeltaBadge label="Avg Rail Pressure" actual={avgActual.toFixed(0)} expected={avgDesired.toFixed(0)} delta={(isLow ? avgDesired - avgActual : avgActual - avgDesired).toFixed(0)} unit=" psi" isCritical={false} />
        <DeltaBadge label="Max Fault Delta" actual="Detected" expected={isLow ? '<3,000' : '<1,500'} delta={(isLow ? maxDeltaLow : maxDeltaHigh).toFixed(0)} unit=" psi" isCritical={true} />
      </>}
    >
      {hasRailData && chartData.length > 0 ? (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
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
        </div>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          Rail pressure channels not logged — fault detected via other indicators.
        </div>
      )}
    </FaultChartWrapper>
  );
});
RailPressureFaultChart.displayName = 'RailPressureFaultChart';

// ─── BOOST PRESSURE FAULT CHART ───────────────────────────────────────────────
export const BoostFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  const issue = diagnostics.issues.find(i => i.code.startsWith('P0299'));
  if (!issue) return null;

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
  const faultPoints = chartData.filter(d => ((d.desired ?? 0) - (d.actual ?? 0)) > 5);
  const faultTimeMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.time)) : 0;
  const faultTimeMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.time)) : 0;

  const ruleText = `P0299: Actual boost is ≥5 psi BELOW desired for >5 consecutive seconds. Max observed delta: ${maxDelta.toFixed(1)} psi. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min. Turbo vane >45% at >2800 RPM triggers boost leak check.`;

  return (
    <FaultChartWrapper
      ref={ref}
      code="P0299"
      title={`P0299 — ${issue.title}`}
      severity={issue.severity}
      description={issue.description}
      recommendation={issue.recommendation}
      ruleEvaluated={ruleText}
      badges={<>
        <DeltaBadge label="Peak Boost" actual={peakActual.toFixed(1)} expected={peakDesired > 0 ? peakDesired.toFixed(1) : '48.0'} delta={(peakDesired > 0 ? peakDesired - peakActual : 48 - peakActual).toFixed(1)} unit=" psi" isCritical={true} />
        <DeltaBadge label="Max Fault Delta" actual="Detected" expected="<5 psi gap" delta={maxDelta.toFixed(1)} unit=" psi" isCritical={true} />
        <DeltaBadge label="Fault Duration" actual={`${faultPoints.length} pts`} expected="0 pts" delta={`${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min`} unit="" isCritical={false} />
      </>}
    >
      {hasBoostData && chartData.length > 0 ? (
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
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
        </div>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          Boost pressure channels not logged — fault detected via other indicators.
        </div>
      )}
    </FaultChartWrapper>
  );
});
BoostFaultChart.displayName = 'BoostFaultChart';

// ─── EGT FAULT CHART ──────────────────────────────────────────────────────────
export const EgtFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  // Match suffixed codes: EGT-HIGH, EGT-SENSOR-FAULT
  const issue = diagnostics.issues.find(i => i.code.startsWith('EGT'));
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

  const ruleText = issue.code === 'EGT-SENSOR-FAULT'
    ? `EGT SENSOR FAULT: Reading stuck above 1,800°F — sensor disconnected or out of service. Observed: ${maxEgt.toFixed(0)}°F.`
    : `EGT HIGH: Temperature exceeded 1,475°F for >${faultDuration.toFixed(1)} seconds. Max observed: ${maxEgt.toFixed(0)}°F. Fault zone: ${faultTimeMin.toFixed(2)}–${faultTimeMax.toFixed(2)} min.`;

  return (
    <FaultChartWrapper
      ref={ref}
      code="EGT"
      title={`EGT — ${issue.title}`}
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
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
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
        </div>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          EGT channels not logged — fault detected via other indicators.
        </div>
      )}
    </FaultChartWrapper>
  );
});
EgtFaultChart.displayName = 'EgtFaultChart';

// ─── MAF FAULT CHART ──────────────────────────────────────────────────────────
export const MafFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  const issue = diagnostics.issues.find(i => i.code.startsWith('P0101'));
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

  const ruleText = `P0101: MAF flow at idle (RPM <1000) is ${isHigh ? 'above 6.0 lb/min' : 'below 2.0 lb/min'} for >5 seconds. Avg idle MAF: ${avgIdleMaf.toFixed(2)} lb/min. Normal idle range: 2.0–6.0 lb/min.`;

  return (
    <FaultChartWrapper
      ref={ref}
      code="P0101"
      title={`P0101 — ${issue.title}`}
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
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
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
        </div>
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          MAF channels not logged — fault detected via other indicators.
        </div>
      )}
    </FaultChartWrapper>
  );
});
MafFaultChart.displayName = 'MafFaultChart';

// ─── BOOST EFFICIENCY CHART ───────────────────────────────────────────────────
// Line graph: X = RPM, Left Y = Boost PSIG (actual + desired), Right Y = Vane % (actual + desired)
// Shows how efficiently the VGT builds boost across the RPM range.
interface BoostEfficiencyProps {
  data: ProcessedMetrics;
}

export const BoostEfficiencyChart = forwardRef<HTMLDivElement, BoostEfficiencyProps>(({ data }, ref) => {
  const hasBoost = data.boost.some(v => v > 0);
  const hasVane = data.turboVanePosition.some(v => v > 0);
  const hasData = hasBoost || hasVane;

  // Bin all 4 channels by RPM bucket (100 RPM bins), only above 600 RPM
  const chartData = useMemo(() => {
    if (!hasData) return [];
    const bucketSize = 100;
    type Bucket = { boostActualSum: number; boostDesiredSum: number; vaneActualSum: number; vaneDesiredSum: number; count: number };
    const map: Record<number, Bucket> = {};
    for (let i = 0; i < data.rpm.length; i++) {
      const rpm = data.rpm[i];
      if (!rpm || rpm < 600) continue;
      const bucket = Math.round(rpm / bucketSize) * bucketSize;
      if (!map[bucket]) map[bucket] = { boostActualSum: 0, boostDesiredSum: 0, vaneActualSum: 0, vaneDesiredSum: 0, count: 0 };
      map[bucket].boostActualSum += data.boost[i] || 0;
      map[bucket].boostDesiredSum += data.boostDesired[i] || 0;
      map[bucket].vaneActualSum += data.turboVanePosition[i] || 0;
      map[bucket].vaneDesiredSum += data.turboVaneDesired[i] || 0;
      map[bucket].count++;
    }
    return Object.entries(map)
      .map(([rpmStr, b]) => ({
        rpm: Number(rpmStr),
        boostActual: b.count > 0 ? b.boostActualSum / b.count : null,
        boostDesired: b.count > 0 && data.boostDesired.some(v => v > 0) ? b.boostDesiredSum / b.count : null,
        vaneActual: b.count > 0 && hasVane ? b.vaneActualSum / b.count : null,
        vaneDesired: b.count > 0 && data.turboVaneDesired.some(v => v > 0) ? b.vaneDesiredSum / b.count : null,
      }))
      .sort((a, b) => a.rpm - b.rpm);
  }, [data, hasData, hasVane]);

  const maxBoost = chartData.length
    ? Math.max(...chartData.map(d => Math.max(d.boostActual ?? 0, d.boostDesired ?? 0)), 10)
    : 50;
  const boostYMax = Math.ceil(maxBoost * 1.12 / 5) * 5;

  const hasDesiredBoost = data.boostDesired.some(v => v > 0);
  const hasDesiredVane = data.turboVaneDesired.some(v => v > 0);

  return (
    <div ref={ref} style={{
      background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
      border: '1px solid #1e2330',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: 16, fontFamily: 'monospace', letterSpacing: 2 }}>
          BOOST EFFICIENCY
        </div>
        <div style={{ color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
          Actual &amp; Desired Boost (PSIG) + Vane Position (%) vs Engine RPM — binned averages
        </div>
      </div>

      {!hasData ? (
        <div style={{ color: '#444', fontFamily: 'monospace', fontSize: 12, padding: '40px 0', textAlign: 'center' }}>
          Boost pressure or turbo vane position not logged in this file.
        </div>
      ) : (
        <>
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12 }}>
            {[
              { color: '#a78bfa', label: 'Boost Actual (PSIG)', show: hasBoost },
              { color: '#7c3aed', label: 'Boost Desired (PSIG)', show: hasDesiredBoost, dashed: true },
              { color: '#fb923c', label: 'Vane Actual (%)', show: hasVane },
              { color: '#fbbf24', label: 'Vane Desired (%)', show: hasDesiredVane, dashed: true },
            ].filter(l => l.show).map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="22" height="8">
                  <line x1="0" y1="4" x2="22" y2="4"
                    stroke={l.color} strokeWidth="2"
                    strokeDasharray={l.dashed ? '4 3' : undefined} />
                </svg>
                <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 10 }}>{l.label}</span>
              </div>
            ))}
          </div>

          <div style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 55, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="2 5" stroke="#1a1e2a" />
                <XAxis
                  dataKey="rpm"
                  stroke="#333"
                  tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                  label={{ value: 'ENGINE RPM', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 10, fontFamily: 'monospace' }}
                />
                {/* Left Y: Boost PSIG */}
                <YAxis
                  yAxisId="boost"
                  orientation="left"
                  stroke="#333"
                  tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                  domain={[0, boostYMax]}
                  label={{ value: 'BOOST (PSIG)', angle: -90, position: 'insideLeft', offset: 14, fill: '#a78bfa', fontSize: 10, fontFamily: 'monospace' }}
                />
                {/* Right Y: Vane % */}
                {hasVane && (
                  <YAxis
                    yAxisId="vane"
                    orientation="right"
                    stroke="#333"
                    tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    label={{ value: 'VANE POS (%)', angle: 90, position: 'insideRight', offset: 14, fill: '#fb923c', fontSize: 10, fontFamily: 'monospace' }}
                  />
                )}
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{
                        background: 'rgba(13,15,20,0.97)', border: '1px solid #a78bfa',
                        borderRadius: 6, padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: '#e0e0e0',
                      }}>
                        <div style={{ color: '#a78bfa', fontWeight: 'bold', marginBottom: 6 }}>
                          {label ? `${Number(label).toFixed(0)} RPM` : ''}
                        </div>
                        {payload.map((p: any, i: number) =>
                          p.value != null && (
                            <div key={i} style={{ color: p.color, marginBottom: 2 }}>
                              {p.name}: <span style={{ color: '#fff', fontWeight: 'bold' }}>
                                {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    );
                  }}
                />
                {/* Boost Actual */}
                {hasBoost && (
                  <Line yAxisId="boost" type="monotone" dataKey="boostActual"
                    stroke="#a78bfa" strokeWidth={2.5} dot={false} isAnimationActive={false}
                    name="Boost Actual (PSIG)" connectNulls />
                )}
                {/* Boost Desired */}
                {hasDesiredBoost && (
                  <Line yAxisId="boost" type="monotone" dataKey="boostDesired"
                    stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} isAnimationActive={false}
                    name="Boost Desired (PSIG)" connectNulls />
                )}
                {/* Vane Actual */}
                {hasVane && (
                  <Line yAxisId="vane" type="monotone" dataKey="vaneActual"
                    stroke="#fb923c" strokeWidth={2} dot={false} isAnimationActive={false}
                    name="Vane Actual (%)" connectNulls />
                )}
                {/* Vane Desired */}
                {hasDesiredVane && (
                  <Line yAxisId="vane" type="monotone" dataKey="vaneDesired"
                    stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} isAnimationActive={false}
                    name="Vane Desired (%)" connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Peak Boost Actual', value: `${Math.max(...chartData.map(d => d.boostActual ?? 0)).toFixed(1)} PSIG`, color: '#a78bfa' },
              hasDesiredBoost ? { label: 'Peak Boost Desired', value: `${Math.max(...chartData.map(d => d.boostDesired ?? 0)).toFixed(1)} PSIG`, color: '#7c3aed' } : null,
              hasVane ? { label: 'Max Vane Actual', value: `${Math.max(...chartData.map(d => d.vaneActual ?? 0)).toFixed(1)}%`, color: '#fb923c' } : null,
              hasDesiredVane ? { label: 'Max Vane Desired', value: `${Math.max(...chartData.map(d => d.vaneDesired ?? 0)).toFixed(1)}%`, color: '#fbbf24' } : null,
            ].filter(Boolean).map((s: any) => (
              <div key={s.label} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                <span style={{ color: '#444' }}>{s.label}: </span>
                <span style={{ color: s.color, fontWeight: 'bold' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
BoostEfficiencyChart.displayName = 'BoostEfficiencyChart';
