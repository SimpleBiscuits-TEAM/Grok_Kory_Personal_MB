/**
 * DynoCharts.tsx
 * Dynojet-style HP/Torque chart + fault-annotated charts.
 *
 * Design philosophy: Dark cockpit aesthetic matching Dynojet WinPEP software.
 * - Background: #0d0f14 (near-black)
 * - Grid: subtle #1e2330 lines
 * - HP curve: #ff4d00 (Dynojet orange-red)
 * - Torque curve: #00c8ff (cyan)
 * - Fault highlight: #ff2222 circle annotation with pulsing glow
 * - Delta panel: side-by-side actual vs expected with red delta
 */

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Area,
} from 'recharts';
import { ProcessedMetrics } from '@/lib/dataProcessor';
import { DiagnosticReport } from '@/lib/diagnostics';
import { AlertCircle, TrendingDown, TrendingUp, Gauge, Wind, Thermometer, Activity } from 'lucide-react';

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
      background: 'rgba(13,15,20,0.95)',
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
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <span style={{ color: '#fff', fontWeight: 'bold' }}>{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Custom Fault Tooltip ─────────────────────────────────────────────────────
const FaultTooltip = ({ active, payload, label, faultLabel }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(13,15,20,0.95)',
      border: '1px solid #ff2222',
      borderRadius: '6px',
      padding: '10px 14px',
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e0e0e0',
      boxShadow: '0 0 12px rgba(255,34,34,0.3)',
    }}>
      <div style={{ color: '#ff6666', fontWeight: 'bold', marginBottom: 6 }}>
        {faultLabel || (label ? `${Number(label).toFixed(0)} RPM` : '')}
      </div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <span style={{ color: '#fff', fontWeight: 'bold' }}>{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Custom dot for fault zone annotation ────────────────────────────────────
const FaultAnnotationDot = (props: any) => {
  const { cx, cy, payload, faultMin, faultMax } = props;
  if (!payload || payload.rpm === undefined) return null;
  const inFault = payload.rpm >= faultMin && payload.rpm <= faultMax;
  if (!inFault) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="none" stroke="#ff2222" strokeWidth={2} opacity={0.9} />
      <circle cx={cx} cy={cy} r={10} fill="none" stroke="#ff2222" strokeWidth={1} opacity={0.4} />
    </g>
  );
};

// ─── Fault zone circle SVG overlay (drawn via recharts customized label) ─────
const FaultZoneLabel = ({ viewBox, label }: any) => {
  if (!viewBox) return null;
  const { x, y, width, height } = viewBox;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.max(Math.abs(width / 2) + 18, 28);
  return (
    <g>
      {/* Pulsing circle */}
      <circle cx={cx} cy={cy} r={r} fill="rgba(255,34,34,0.08)" stroke="#ff2222" strokeWidth={2} strokeDasharray="6 3" />
      <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke="#ff2222" strokeWidth={1} strokeDasharray="3 6" opacity={0.4} />
      {/* Arrow pointing down to fault zone */}
      <line x1={cx} y1={cy - r - 24} x2={cx} y2={cy - r - 4} stroke="#ff2222" strokeWidth={2} markerEnd="url(#arrowhead)" />
      {/* Label */}
      <rect x={cx - 44} y={cy - r - 44} width={88} height={20} rx={4} fill="rgba(255,34,34,0.85)" />
      <text x={cx} y={cy - r - 30} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="bold" fontFamily="monospace">
        ⚠ FAULT ZONE
      </text>
    </g>
  );
};

// ─── Delta comparison panel ───────────────────────────────────────────────────
function DeltaPanel({
  title,
  icon: Icon,
  iconColor,
  rows,
}: {
  title: string;
  icon: any;
  iconColor: string;
  rows: { label: string; actual: string; expected: string; delta: string; deltaColor: string }[];
}) {
  return (
    <div style={{
      background: '#0d0f14',
      border: '1px solid #2a2e3d',
      borderRadius: '8px',
      padding: '16px',
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon size={16} color={iconColor} />
        <span style={{ color: '#e0e0e0', fontWeight: 'bold', fontSize: 13 }}>{title}</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ color: '#666', textAlign: 'left', paddingBottom: 6, borderBottom: '1px solid #1e2330' }}>Parameter</th>
            <th style={{ color: '#ff4444', textAlign: 'right', paddingBottom: 6, borderBottom: '1px solid #1e2330' }}>Actual</th>
            <th style={{ color: '#44ff88', textAlign: 'right', paddingBottom: 6, borderBottom: '1px solid #1e2330' }}>Expected</th>
            <th style={{ color: '#ffaa00', textAlign: 'right', paddingBottom: 6, borderBottom: '1px solid #1e2330' }}>Δ Delta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ color: '#aaa', padding: '5px 0' }}>{r.label}</td>
              <td style={{ color: '#ff6666', textAlign: 'right', padding: '5px 0' }}>{r.actual}</td>
              <td style={{ color: '#66ff99', textAlign: 'right', padding: '5px 0' }}>{r.expected}</td>
              <td style={{ color: r.deltaColor, textAlign: 'right', padding: '5px 0', fontWeight: 'bold' }}>{r.delta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN DYNOJET-STYLE HP/TORQUE CHART ──────────────────────────────────────
export function DynoHPChart({ data, binnedData }: DynoChartProps) {
  // Build binned smooth curve data for dyno-style display
  const dynoData = useMemo(() => {
    if (!binnedData || binnedData.length === 0) return [];
    return binnedData
      .filter(b => b.rpmMid > 600 && b.hpTorqueMean > 0)
      .map(b => ({
        rpm: Math.round(b.rpmMid),
        hp: Math.round(b.hpTorqueMean),
        torque: Math.round(b.hpTorqueMean > 0 ? (b.hpTorqueMean * 5252) / b.rpmMid : 0),
        hpMaf: Math.round(b.hpMafMean || 0),
      }))
      .filter(d => d.hp > 0 && d.torque > 0 && d.torque < 2000);
  }, [binnedData]);

  const peakHp = dynoData.reduce((max, d) => d.hp > max.hp ? d : max, { rpm: 0, hp: 0, torque: 0, hpMaf: 0 });
  const peakTorque = dynoData.reduce((max, d) => d.torque > max.torque ? d : max, { rpm: 0, hp: 0, torque: 0, hpMaf: 0 });
  const maxY = Math.max(...dynoData.map(d => Math.max(d.hp, d.torque))) * 1.15;

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
      border: '1px solid #1e2330',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ color: '#ff4d00', fontWeight: 'bold', fontSize: 16, fontFamily: 'monospace', letterSpacing: 2 }}>
            DYNO RESULTS
          </div>
          <div style={{ color: '#666', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
            Duramax L5P 6.6L Diesel — Estimated from OBD-II Data
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#ff4d00', fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 1 }}>
              {peakHp.hp}
            </div>
            <div style={{ color: '#ff4d00', fontSize: 10, fontFamily: 'monospace' }}>HP @ {peakHp.rpm} RPM</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#00c8ff', fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace', lineHeight: 1 }}>
              {peakTorque.torque}
            </div>
            <div style={{ color: '#00c8ff', fontSize: 10, fontFamily: 'monospace' }}>LB·FT @ {peakTorque.rpm} RPM</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dynoData} margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
            <defs>
              <linearGradient id="hpGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff4d00" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff4d00" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="torqueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00c8ff" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#00c8ff" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#1e2330" vertical={true} horizontal={true} />
            <XAxis
              dataKey="rpm"
              stroke="#444"
              tick={{ fill: '#888', fontSize: 11, fontFamily: 'monospace' }}
              label={{ value: 'ENGINE RPM', position: 'insideBottom', offset: -8, fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            />
            <YAxis
              yAxisId="left"
              stroke="#444"
              tick={{ fill: '#888', fontSize: 11, fontFamily: 'monospace' }}
              label={{ value: 'HORSEPOWER', angle: -90, position: 'insideLeft', offset: 10, fill: '#ff4d00', fontSize: 10, fontFamily: 'monospace' }}
              domain={[0, maxY]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#444"
              tick={{ fill: '#888', fontSize: 11, fontFamily: 'monospace' }}
              label={{ value: 'TORQUE (LB·FT)', angle: 90, position: 'insideRight', offset: 10, fill: '#00c8ff', fontSize: 10, fontFamily: 'monospace' }}
              domain={[0, maxY]}
            />
            <Tooltip content={<DynoTooltip />} />
            <Legend
              wrapperStyle={{ fontFamily: 'monospace', fontSize: 11, color: '#888', paddingTop: 8 }}
              formatter={(value) => <span style={{ color: value === 'HP (Torque)' ? '#ff4d00' : value === 'Torque (lb·ft)' ? '#00c8ff' : '#888' }}>{value}</span>}
            />
            {/* Factory HP reference line */}
            <ReferenceLine yAxisId="left" y={445} stroke="#555" strokeDasharray="6 3"
              label={{ value: 'STOCK 445HP', position: 'insideTopRight', fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
            {/* HP area fill */}
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="hp"
              stroke="#ff4d00"
              strokeWidth={3}
              fill="url(#hpGrad)"
              dot={false}
              isAnimationActive={false}
              name="HP (Torque)"
            />
            {/* Torque area fill */}
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="torque"
              stroke="#00c8ff"
              strokeWidth={2.5}
              fill="url(#torqueGrad)"
              dot={false}
              isAnimationActive={false}
              name="Torque (lb·ft)"
            />
            {/* Peak HP marker */}
            {peakHp.rpm > 0 && (
              <ReferenceLine
                yAxisId="left"
                x={peakHp.rpm}
                stroke="#ff4d00"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
                label={{ value: `PEAK ${peakHp.hp}HP`, position: 'top', fill: '#ff4d00', fontSize: 9, fontFamily: 'monospace' }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer watermark */}
      <div style={{ textAlign: 'right', marginTop: 8, color: '#2a2e3d', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>
        DURAMAX PERFORMANCE ANALYZER · OBD-II ESTIMATED
      </div>
    </div>
  );
}

// ─── FAULT-SPECIFIC CHARTS ────────────────────────────────────────────────────

/** Rail Pressure fault chart — P0087 / P0088 */
export function RailPressureFaultChart({ data, diagnostics, binnedData }: FaultChartsProps) {
  const hasP0087 = diagnostics.issues.some(i => i.code === 'P0087');
  const hasP0088 = diagnostics.issues.some(i => i.code === 'P0088');
  if (!hasP0087 && !hasP0088) return null;

  const railData = useMemo(() => {
    const step = Math.ceil(data.rpm.length / 600);
    return data.rpm
      .map((rpm, i) => ({
        rpm,
        actual: data.railPressureActual[i] || 0,
        desired: data.railPressureDesired[i] || 0,
        delta: (data.railPressureDesired[i] || 0) - (data.railPressureActual[i] || 0),
      }))
      .filter((_, i) => i % step === 0)
      .filter(d => d.actual > 0 && d.desired > 0)
      .sort((a, b) => a.rpm - b.rpm);
  }, [data]);

  // Find fault zone RPM range
  const faultPoints = railData.filter(d =>
    hasP0087 ? (d.desired - d.actual) > 3000 : (d.actual - d.desired) > 1500
  );
  const faultRpmMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.rpm)) : 0;
  const faultRpmMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.rpm)) : 0;

  // Delta stats
  const avgActual = railData.length ? railData.reduce((s, d) => s + d.actual, 0) / railData.length : 0;
  const avgDesired = railData.length ? railData.reduce((s, d) => s + d.desired, 0) / railData.length : 0;
  const maxDelta = faultPoints.length ? Math.max(...faultPoints.map(d => Math.abs(d.delta))) : 0;
  const peakActual = Math.max(...railData.map(d => d.actual));
  const peakDesired = Math.max(...railData.map(d => d.desired));

  const issue = diagnostics.issues.find(i => i.code === 'P0087' || i.code === 'P0088')!;

  return (
    <FaultChartWrapper
      code={issue.code}
      title={`${issue.code} — ${issue.title}`}
      severity={issue.severity}
      recommendation={issue.recommendation}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        {/* Chart */}
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={railData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <defs>
                <linearGradient id="desiredGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#44ff88" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#44ff88" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e2330" />
              <XAxis dataKey="rpm" stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                label={{ value: 'RPM', position: 'insideBottom', offset: -8, fill: '#666', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: 'PSI', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip faultLabel="Rail Pressure" />} />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, color: '#888' }} />
              {/* Fault zone highlight */}
              {faultRpmMin > 0 && (
                <ReferenceArea
                  x1={faultRpmMin - 100}
                  x2={faultRpmMax + 100}
                  fill="rgba(255,34,34,0.12)"
                  stroke="#ff2222"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  label={<FaultZoneLabel />}
                />
              )}
              <Area type="monotone" dataKey="desired" stroke="#44ff88" strokeWidth={2}
                fill="url(#desiredGrad)" dot={false} isAnimationActive={false} name="Desired PSI" />
              <Line type="monotone" dataKey="actual" stroke="#ff4444" strokeWidth={2.5}
                dot={false} isAnimationActive={false} name="Actual PSI" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Delta panel */}
        <DeltaPanel
          title="Rail Pressure Analysis"
          icon={Gauge}
          iconColor="#ff4444"
          rows={[
            { label: 'Peak Actual', actual: `${peakActual.toFixed(0)} psi`, expected: `${peakDesired.toFixed(0)} psi`, delta: `${(peakDesired - peakActual).toFixed(0)} psi`, deltaColor: hasP0087 ? '#ff4444' : '#ffaa00' },
            { label: 'Avg Actual', actual: `${avgActual.toFixed(0)} psi`, expected: `${avgDesired.toFixed(0)} psi`, delta: `${(avgDesired - avgActual).toFixed(0)} psi`, deltaColor: '#ffaa00' },
            { label: 'Max Fault Δ', actual: '—', expected: `${hasP0087 ? '3,000' : '1,500'} psi`, delta: `${maxDelta.toFixed(0)} psi`, deltaColor: '#ff2222' },
            { label: 'Fault RPM', actual: `${faultRpmMin.toFixed(0)}`, expected: `${faultRpmMax.toFixed(0)}`, delta: 'Range', deltaColor: '#ff6666' },
          ]}
        />
      </div>
    </FaultChartWrapper>
  );
}

/** Boost pressure fault chart — P0299 Underboost */
export function BoostFaultChart({ data, diagnostics, binnedData }: FaultChartsProps) {
  const hasP0299 = diagnostics.issues.some(i => i.code === 'P0299');
  if (!hasP0299) return null;

  const boostData = useMemo(() => {
    const step = Math.ceil(data.rpm.length / 600);
    return data.rpm
      .map((rpm, i) => ({
        rpm,
        actual: data.boost[i] || 0,
        desired: data.boostDesired?.[i] || 0,
        maf: data.maf[i] || 0,
        vane: data.turboVanePosition?.[i] || 0,
      }))
      .filter((_, i) => i % step === 0)
      .filter(d => d.actual > 0)
      .sort((a, b) => a.rpm - b.rpm);
  }, [data]);

  const faultPoints = boostData.filter(d => d.maf > 55 && d.actual < 40);
  const faultRpmMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.rpm)) : 0;
  const faultRpmMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.rpm)) : 0;

  const peakBoost = Math.max(...boostData.map(d => d.actual));
  const avgBoostFault = faultPoints.length ? faultPoints.reduce((s, d) => s + d.actual, 0) / faultPoints.length : 0;
  const expectedBoost = 40;

  const issue = diagnostics.issues.find(i => i.code === 'P0299')!;

  return (
    <FaultChartWrapper
      code={issue.code}
      title={`P0299 — ${issue.title}`}
      severity={issue.severity}
      recommendation={issue.recommendation}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={boostData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <defs>
                <linearGradient id="boostGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00c8ff" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#00c8ff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e2330" />
              <XAxis dataKey="rpm" stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                label={{ value: 'RPM', position: 'insideBottom', offset: -8, fill: '#666', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: 'PSI', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip faultLabel="Boost Pressure" />} />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, color: '#888' }} />
              {/* Fault zone */}
              {faultRpmMin > 0 && (
                <ReferenceArea
                  x1={faultRpmMin - 100}
                  x2={faultRpmMax + 100}
                  fill="rgba(255,34,34,0.12)"
                  stroke="#ff2222"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  label={<FaultZoneLabel />}
                />
              )}
              {/* Expected minimum boost line */}
              <ReferenceLine y={40} stroke="#44ff88" strokeDasharray="6 3"
                label={{ value: 'MIN 40 PSI', position: 'insideTopRight', fill: '#44ff88', fontSize: 9, fontFamily: 'monospace' }} />
              <Area type="monotone" dataKey="actual" stroke="#00c8ff" strokeWidth={2.5}
                fill="url(#boostGrad)" dot={false} isAnimationActive={false} name="Boost (psi)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <DeltaPanel
          title="Boost Pressure Analysis"
          icon={Wind}
          iconColor="#00c8ff"
          rows={[
            { label: 'Peak Boost', actual: `${peakBoost.toFixed(1)} psi`, expected: '48 psi (stock)', delta: `${(48 - peakBoost).toFixed(1)} psi`, deltaColor: peakBoost < 40 ? '#ff4444' : '#44ff88' },
            { label: 'Fault Avg', actual: `${avgBoostFault.toFixed(1)} psi`, expected: `${expectedBoost} psi`, delta: `${(expectedBoost - avgBoostFault).toFixed(1)} psi`, deltaColor: '#ff2222' },
            { label: 'Fault RPM', actual: `${faultRpmMin.toFixed(0)}`, expected: `${faultRpmMax.toFixed(0)}`, delta: 'Range', deltaColor: '#ff6666' },
            { label: 'Fault Count', actual: `${faultPoints.length} pts`, expected: '0 pts', delta: `+${faultPoints.length}`, deltaColor: '#ff4444' },
          ]}
        />
      </div>
    </FaultChartWrapper>
  );
}

/** EGT fault chart */
export function EgtFaultChart({ data, diagnostics }: FaultChartsProps) {
  const hasEgtFault = diagnostics.issues.some(i => i.code === 'EGT_HIGH' || i.code === 'EGT_SENSOR');
  if (!hasEgtFault) return null;

  const egtData = useMemo(() => {
    const step = Math.ceil(data.timeMinutes.length / 600);
    return data.timeMinutes
      .map((t, i) => ({
        time: t,
        egt: data.exhaustGasTemp[i] || 0,
        rpm: data.rpm[i] || 0,
      }))
      .filter((_, i) => i % step === 0)
      .filter(d => d.egt > 0);
  }, [data]);

  const faultPoints = egtData.filter(d => d.egt > 1475);
  const faultTimeMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.time)) : 0;
  const faultTimeMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.time)) : 0;
  const maxEgt = Math.max(...egtData.map(d => d.egt));
  const avgEgt = egtData.reduce((s, d) => s + d.egt, 0) / egtData.length;

  const issue = diagnostics.issues.find(i => i.code === 'EGT_HIGH' || i.code === 'EGT_SENSOR')!;

  return (
    <FaultChartWrapper
      code="EGT"
      title="Exhaust Gas Temperature — High EGT Warning"
      severity={issue.severity}
      recommendation={issue.recommendation}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={egtData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <defs>
                <linearGradient id="egtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff9900" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff9900" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e2330" />
              <XAxis dataKey="time" stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                tickFormatter={(v) => `${v.toFixed(1)}m`}
                label={{ value: 'TIME (min)', position: 'insideBottom', offset: -8, fill: '#666', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: '°F', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip faultLabel="EGT" />} />
              {/* Fault zone */}
              {faultTimeMin > 0 && (
                <ReferenceArea
                  x1={faultTimeMin - 0.05}
                  x2={faultTimeMax + 0.05}
                  fill="rgba(255,34,34,0.15)"
                  stroke="#ff2222"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  label={<FaultZoneLabel />}
                />
              )}
              {/* Warning threshold line */}
              <ReferenceLine y={1475} stroke="#ff6600" strokeDasharray="6 3"
                label={{ value: 'WARN 1475°F', position: 'insideTopRight', fill: '#ff6600', fontSize: 9, fontFamily: 'monospace' }} />
              <ReferenceLine y={1800} stroke="#ff2222" strokeDasharray="4 2"
                label={{ value: 'SENSOR FAULT 1800°F', position: 'insideTopRight', fill: '#ff2222', fontSize: 9, fontFamily: 'monospace' }} />
              <Area type="monotone" dataKey="egt" stroke="#ff9900" strokeWidth={2.5}
                fill="url(#egtGrad)" dot={false} isAnimationActive={false} name="EGT (°F)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <DeltaPanel
          title="EGT Analysis"
          icon={Thermometer}
          iconColor="#ff9900"
          rows={[
            { label: 'Peak EGT', actual: `${maxEgt.toFixed(0)}°F`, expected: '<1475°F', delta: `+${(maxEgt - 1475).toFixed(0)}°F`, deltaColor: '#ff2222' },
            { label: 'Avg EGT', actual: `${avgEgt.toFixed(0)}°F`, expected: '<1200°F', delta: `+${(avgEgt - 1200).toFixed(0)}°F`, deltaColor: avgEgt > 1200 ? '#ffaa00' : '#44ff88' },
            { label: 'Fault Duration', actual: `${((faultTimeMax - faultTimeMin) * 60).toFixed(1)}s`, expected: '0s', delta: `+${((faultTimeMax - faultTimeMin) * 60).toFixed(1)}s`, deltaColor: '#ff4444' },
            { label: 'Fault Points', actual: `${faultPoints.length}`, expected: '0', delta: `+${faultPoints.length}`, deltaColor: '#ff4444' },
          ]}
        />
      </div>
    </FaultChartWrapper>
  );
}

/** MAF fault chart — P0101 */
export function MafFaultChart({ data, diagnostics }: FaultChartsProps) {
  const hasP0101 = diagnostics.issues.some(i => i.code === 'P0101');
  if (!hasP0101) return null;

  const mafData = useMemo(() => {
    const step = Math.ceil(data.rpm.length / 600);
    return data.rpm
      .map((rpm, i) => ({
        rpm,
        maf: data.maf[i] || 0,
      }))
      .filter((_, i) => i % step === 0)
      .filter(d => d.maf > 0 && d.rpm > 400 && d.rpm < 1000)
      .sort((a, b) => a.rpm - b.rpm);
  }, [data]);

  const idlePoints = mafData.filter(d => d.rpm > 500 && d.rpm < 900);
  const avgIdleMaf = idlePoints.length ? idlePoints.reduce((s, d) => s + d.maf, 0) / idlePoints.length : 0;
  const isHigh = avgIdleMaf > 6;
  const expectedIdle = isHigh ? 6 : 2;

  const issue = diagnostics.issues.find(i => i.code === 'P0101')!;

  return (
    <FaultChartWrapper
      code="P0101"
      title="P0101 — MAF Out of Range at Idle"
      severity={issue.severity}
      recommendation={issue.recommendation}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={mafData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1e2330" />
              <XAxis dataKey="rpm" stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: 'RPM', position: 'insideBottom', offset: -8, fill: '#666', fontSize: 9, fontFamily: 'monospace' }} />
              <YAxis stroke="#444" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }}
                label={{ value: 'lb/min', angle: -90, position: 'insideLeft', fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
              <Tooltip content={<FaultTooltip faultLabel="MAF Flow" />} />
              {/* Fault zone — idle RPM band */}
              <ReferenceArea
                x1={500}
                x2={900}
                fill="rgba(255,34,34,0.12)"
                stroke="#ff2222"
                strokeWidth={1}
                strokeDasharray="4 2"
                label={<FaultZoneLabel />}
              />
              {/* Normal range band */}
              <ReferenceArea y1={2} y2={6} fill="rgba(68,255,136,0.06)" stroke="#44ff88" strokeWidth={1} strokeDasharray="3 3" />
              <ReferenceLine y={6} stroke="#44ff88" strokeDasharray="6 3"
                label={{ value: 'MAX 6 lb/min', position: 'insideTopRight', fill: '#44ff88', fontSize: 9, fontFamily: 'monospace' }} />
              <ReferenceLine y={2} stroke="#44ff88" strokeDasharray="6 3"
                label={{ value: 'MIN 2 lb/min', position: 'insideTopRight', fill: '#44ff88', fontSize: 9, fontFamily: 'monospace' }} />
              <Line type="monotone" dataKey="maf" stroke="#ffaa00" strokeWidth={2.5}
                dot={false} isAnimationActive={false} name="MAF (lb/min)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <DeltaPanel
          title="MAF Idle Analysis"
          icon={Activity}
          iconColor="#ffaa00"
          rows={[
            { label: 'Avg Idle MAF', actual: `${avgIdleMaf.toFixed(2)} lb/min`, expected: `${expectedIdle} lb/min`, delta: `${(avgIdleMaf - expectedIdle).toFixed(2)} lb/min`, deltaColor: '#ff4444' },
            { label: 'Idle RPM Band', actual: '500–900 RPM', expected: '600–750 RPM', delta: 'Check', deltaColor: '#ffaa00' },
            { label: 'Fault Type', actual: isHigh ? 'HIGH MAF' : 'LOW MAF', expected: '2–6 lb/min', delta: isHigh ? 'Too High' : 'Too Low', deltaColor: '#ff4444' },
            { label: 'Idle Samples', actual: `${idlePoints.length}`, expected: '—', delta: 'analyzed', deltaColor: '#888' },
          ]}
        />
      </div>
    </FaultChartWrapper>
  );
}

// ─── Fault chart wrapper with header ─────────────────────────────────────────
function FaultChartWrapper({
  code,
  title,
  severity,
  recommendation,
  children,
}: {
  code: string;
  title: string;
  severity: string;
  recommendation: string;
  children: React.ReactNode;
}) {
  const borderColor = severity === 'critical' ? '#ff2222' : '#ff9900';
  const badgeColor = severity === 'critical' ? 'rgba(255,34,34,0.2)' : 'rgba(255,153,0,0.2)';
  const badgeText = severity === 'critical' ? '#ff6666' : '#ffcc44';

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
      border: `1px solid ${borderColor}`,
      borderRadius: '12px',
      padding: '20px',
      boxShadow: `0 4px 24px rgba(${severity === 'critical' ? '255,34,34' : '255,153,0'},0.15)`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <AlertCircle size={18} color={borderColor} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: badgeColor,
              color: badgeText,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              border: `1px solid ${borderColor}`,
            }}>{code}</span>
            <span style={{ color: '#e0e0e0', fontWeight: 'bold', fontSize: 13, fontFamily: 'monospace' }}>{title}</span>
          </div>
        </div>
        <span style={{
          background: badgeColor,
          color: badgeText,
          padding: '2px 10px',
          borderRadius: 4,
          fontSize: 10,
          fontFamily: 'monospace',
          border: `1px solid ${borderColor}`,
          textTransform: 'uppercase',
        }}>{severity}</span>
      </div>

      {/* Chart + Delta */}
      {children}

      {/* Recommendation */}
      <div style={{
        marginTop: 14,
        padding: '10px 14px',
        background: 'rgba(255,153,0,0.06)',
        border: '1px solid rgba(255,153,0,0.2)',
        borderRadius: 6,
        fontSize: 11,
        color: '#ccaa66',
        fontFamily: 'monospace',
        lineHeight: 1.5,
      }}>
        <span style={{ color: '#ffcc44', fontWeight: 'bold' }}>→ RECOMMENDATION: </span>
        {recommendation}
      </div>
    </div>
  );
}
