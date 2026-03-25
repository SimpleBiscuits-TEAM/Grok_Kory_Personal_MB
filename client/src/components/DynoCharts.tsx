/**
 * DynoCharts.tsx
 * Dynojet-style HP/Torque chart + fault-annotated charts.
 *
 * Design: Dark cockpit aesthetic matching Dynojet WinPEP software.
 * - Background: #0d0f14 (near-black)
 * - HP curve: #ff4d00 (Dynojet orange-red)
 * - Torque curve: #00c8ff (cyan)
 * - Desired/expected: #44ff88 (green)
 * - Actual (fault): #ff4444 (red)
 * - Delta shaded area: rgba(255,34,34,0.15)
 */

import { useMemo, forwardRef } from 'react';
import {
  ComposedChart,
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
} from 'recharts';
import { ProcessedMetrics } from '@/lib/dataProcessor';
import { DiagnosticReport } from '@/lib/diagnostics';
import { AlertCircle, Gauge, Wind, Thermometer, Activity } from 'lucide-react';

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
      fontSize: '12px',
      color: '#e0e0e0',
      boxShadow: '0 0 12px rgba(255,68,68,0.3)',
    }}>
      <div style={{ color: '#ff8888', fontWeight: 'bold', marginBottom: 6 }}>
        {xLabel || (label ? `${Number(label).toFixed(0)} RPM` : '')}
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

// ─── Delta stat badge ─────────────────────────────────────────────────────────
function DeltaBadge({ label, actual, expected, delta, unit, isCritical }: {
  label: string; actual: string; expected: string; delta: string; unit: string; isCritical: boolean;
}) {
  return (
    <div style={{
      background: '#111520',
      border: `1px solid ${isCritical ? '#ff2222' : '#ff9900'}`,
      borderRadius: 8,
      padding: '12px 16px',
      fontFamily: 'monospace',
      minWidth: 140,
    }}>
      <div style={{ color: '#888', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#ff6666', fontSize: 11 }}>Actual</span>
          <span style={{ color: '#ff6666', fontWeight: 'bold', fontSize: 13 }}>{actual} <span style={{ fontSize: 10 }}>{unit}</span></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: '#44ff88', fontSize: 11 }}>Expected</span>
          <span style={{ color: '#44ff88', fontWeight: 'bold', fontSize: 13 }}>{expected} <span style={{ fontSize: 10 }}>{unit}</span></span>
        </div>
        <div style={{ borderTop: '1px solid #1e2330', paddingTop: 4, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#ffaa00', fontSize: 11 }}>Δ Delta</span>
          <span style={{ color: isCritical ? '#ff2222' : '#ffaa00', fontWeight: 'bold', fontSize: 14 }}>{delta} <span style={{ fontSize: 10 }}>{unit}</span></span>
        </div>
      </div>
    </div>
  );
}

// ─── Fault chart wrapper ──────────────────────────────────────────────────────
const FaultChartWrapper = forwardRef<HTMLDivElement, {
  code: string;
  title: string;
  severity: string;
  recommendation: string;
  children: React.ReactNode;
  badges?: React.ReactNode;
}>(({ code, title, severity, recommendation, children, badges }, ref) => {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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

      {/* Chart */}
      {children}

      {/* Delta badges */}
      {badges && (
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          {badges}
        </div>
      )}

      {/* Recommendation */}
      <div style={{
        marginTop: 14, padding: '10px 14px',
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

// ─── MAIN DYNOJET-STYLE HP/TORQUE CHART ──────────────────────────────────────
export const DynoHPChart = forwardRef<HTMLDivElement, DynoChartProps>(({ data, binnedData }, ref) => {
  const dynoData = useMemo(() => {
    if (!binnedData || binnedData.length === 0) {
      // Fallback: build from raw data if no binned data
      const step = Math.ceil(data.rpm.length / 80);
      const raw = data.rpm
        .map((rpm, i) => ({
          rpm: Math.round(rpm),
          hp: Math.round(data.hpTorque[i] || 0),
          torque: rpm > 100 ? Math.round((data.hpTorque[i] || 0) * 5252 / rpm) : 0,
        }))
        .filter((_, i) => i % step === 0)
        .filter(d => d.rpm > 600 && d.hp > 10 && d.torque > 0 && d.torque < 2500)
        .sort((a, b) => a.rpm - b.rpm);
      return raw;
    }
    return binnedData
      .filter(b => b.rpmBin > 600 && b.hpTorqueMean > 10)
      .map(b => ({
        rpm: Math.round(b.rpmBin),
        hp: Math.round(b.hpTorqueMean),
        torque: b.rpmBin > 100 ? Math.round(b.hpTorqueMean * 5252 / b.rpmBin) : 0,
      }))
      .filter(d => d.torque > 0 && d.torque < 2500);
  }, [binnedData, data]);

  const peakHp = dynoData.reduce((max, d) => d.hp > max.hp ? d : max, { rpm: 0, hp: 0, torque: 0 });
  const peakTorque = dynoData.reduce((max, d) => d.torque > max.torque ? d : max, { rpm: 0, hp: 0, torque: 0 });
  const maxY = Math.max(...dynoData.map(d => Math.max(d.hp, d.torque)), 500) * 1.12;

  return (
    <div ref={ref} style={{
      background: 'linear-gradient(180deg, #0d0f14 0%, #111520 100%)',
      border: '1px solid #1e2330',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#ff4d00', fontWeight: 'bold', fontSize: 16, fontFamily: 'monospace', letterSpacing: 2 }}>
            DYNO RESULTS
          </div>
          <div style={{ color: '#555', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>
            Duramax L5P 6.6L Diesel — Estimated from OBD-II Torque Data
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
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

      {/* Chart */}
      <div style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dynoData} margin={{ top: 10, right: 40, bottom: 30, left: 10 }}>
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
              dataKey="rpm"
              stroke="#333"
              tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              label={{ value: 'ENGINE RPM', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 10, fontFamily: 'monospace' }}
            />
            <YAxis
              yAxisId="left"
              stroke="#333"
              tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
              domain={[0, maxY]}
              label={{ value: 'HORSEPOWER', angle: -90, position: 'insideLeft', offset: 14, fill: '#ff4d00', fontSize: 10, fontFamily: 'monospace' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#333"
              tick={{ fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
              domain={[0, maxY]}
              label={{ value: 'TORQUE (LB·FT)', angle: 90, position: 'insideRight', offset: 14, fill: '#00c8ff', fontSize: 10, fontFamily: 'monospace' }}
            />
            <Tooltip content={<DynoTooltip />} />
            <Legend
              wrapperStyle={{ fontFamily: 'monospace', fontSize: 11, paddingTop: 8 }}
              formatter={(value) => (
                <span style={{ color: value === 'Horsepower' ? '#ff4d00' : '#00c8ff' }}>{value}</span>
              )}
            />
            {/* Factory HP reference */}
            <ReferenceLine yAxisId="left" y={445} stroke="#333" strokeDasharray="6 3"
              label={{ value: 'STOCK 445HP', position: 'insideTopRight', fill: '#444', fontSize: 9, fontFamily: 'monospace' }} />
            {/* HP area */}
            <Area yAxisId="left" type="monotone" dataKey="hp"
              stroke="#ff4d00" strokeWidth={3} fill="url(#hpGrad)"
              dot={false} isAnimationActive={false} name="Horsepower" />
            {/* Torque area */}
            <Area yAxisId="right" type="monotone" dataKey="torque"
              stroke="#00c8ff" strokeWidth={2.5} fill="url(#torqueGrad)"
              dot={false} isAnimationActive={false} name="Torque (lb·ft)" />
            {/* Peak HP marker */}
            {peakHp.rpm > 0 && (
              <ReferenceLine yAxisId="left" x={peakHp.rpm} stroke="#ff4d00"
                strokeDasharray="4 4" strokeOpacity={0.4}
                label={{ value: `PEAK ${peakHp.hp}HP`, position: 'top', fill: '#ff4d00', fontSize: 9, fontFamily: 'monospace' }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'right', marginTop: 8, color: '#222', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1 }}>
        DURAMAX PERFORMANCE ANALYZER · OBD-II ESTIMATED
      </div>
    </div>
  );
});
DynoHPChart.displayName = 'DynoHPChart';

// ─── RAIL PRESSURE FAULT CHART ────────────────────────────────────────────────
export const RailPressureFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  const hasP0087 = diagnostics.issues.some(i => i.code === 'P0087');
  const hasP0088 = diagnostics.issues.some(i => i.code === 'P0088');
  if (!hasP0087 && !hasP0088) return null;

  const chartData = useMemo(() => {
    const step = Math.ceil(data.rpm.length / 500);
    return data.rpm
      .map((rpm, i) => {
        const actual = data.railPressureActual?.[i] ?? 0;
        const desired = data.railPressureDesired?.[i] ?? 0;
        return {
          rpm: Math.round(rpm),
          actual: actual > 0 ? actual : null,
          desired: desired > 0 ? desired : null,
          // delta: positive means actual is BELOW desired (P0087), negative means above (P0088)
          deltaLow: (desired > 0 && actual > 0 && desired > actual) ? desired - actual : 0,
          deltaHigh: (desired > 0 && actual > 0 && actual > desired) ? actual - desired : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.actual !== null && d.desired !== null)
      .sort((a, b) => a.rpm - b.rpm);
  }, [data]);

  const peakActual = Math.max(...chartData.map(d => d.actual ?? 0));
  const peakDesired = Math.max(...chartData.map(d => d.desired ?? 0));
  const maxDeltaLow = Math.max(...chartData.map(d => d.deltaLow));
  const maxDeltaHigh = Math.max(...chartData.map(d => d.deltaHigh));
  const avgActual = chartData.reduce((s, d) => s + (d.actual ?? 0), 0) / chartData.length;
  const avgDesired = chartData.reduce((s, d) => s + (d.desired ?? 0), 0) / chartData.length;

  // Find fault zone
  const faultPoints = chartData.filter(d =>
    hasP0087 ? (d.deltaLow > 3000) : (d.deltaHigh > 1500)
  );
  const faultRpmMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.rpm)) : 0;
  const faultRpmMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.rpm)) : 0;

  const issue = diagnostics.issues.find(i => i.code === 'P0087' || i.code === 'P0088')!;
  const code = hasP0087 ? 'P0087' : 'P0088';
  const maxDelta = hasP0087 ? maxDeltaLow : maxDeltaHigh;

  return (
    <FaultChartWrapper
      ref={ref}
      code={code}
      title={`${code} — ${issue.title}`}
      severity={issue.severity}
      recommendation={issue.recommendation}
      badges={<>
        <DeltaBadge label="Peak Rail Pressure" actual={peakActual.toFixed(0)} expected={peakDesired.toFixed(0)} delta={(hasP0087 ? peakDesired - peakActual : peakActual - peakDesired).toFixed(0)} unit="psi" isCritical={true} />
        <DeltaBadge label="Avg Rail Pressure" actual={avgActual.toFixed(0)} expected={avgDesired.toFixed(0)} delta={(hasP0087 ? avgDesired - avgActual : avgActual - avgDesired).toFixed(0)} unit="psi" isCritical={false} />
        <DeltaBadge label="Max Fault Delta" actual="Detected" expected={hasP0087 ? '<3,000' : '<1,500'} delta={maxDelta.toFixed(0)} unit="psi" isCritical={true} />
      </>}
    >
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
            <XAxis dataKey="rpm" stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              label={{ value: 'ENGINE RPM', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
            <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              label={{ value: 'RAIL PRESSURE (PSI)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
            <Tooltip content={<FaultTooltip xLabel="Rail Pressure vs RPM" />} />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
              formatter={(v) => <span style={{ color: v === 'Desired PSI' ? '#44ff88' : v === 'Actual PSI' ? '#ff4444' : v.includes('Low') ? '#ff2222' : '#ff9900' }}>{v}</span>} />
            {/* Fault zone highlight */}
            {faultRpmMin > 0 && (
              <ReferenceArea x1={faultRpmMin - 50} x2={faultRpmMax + 50}
                fill="rgba(255,34,34,0.08)" stroke="#ff2222" strokeWidth={1.5} strokeDasharray="5 3" />
            )}
            {/* Desired (green) */}
            <Line type="monotone" dataKey="desired" stroke="#44ff88" strokeWidth={2.5}
              dot={false} isAnimationActive={false} name="Desired PSI" />
            {/* Actual (red) */}
            <Line type="monotone" dataKey="actual" stroke="#ff4444" strokeWidth={2.5}
              dot={false} isAnimationActive={false} name="Actual PSI" />
            {/* Delta shaded area — fills the gap between actual and desired */}
            {hasP0087 && (
              <Area type="monotone" dataKey="deltaLow" stroke="none"
                fill="url(#deltaLowGrad)" isAnimationActive={false} name="Δ Low Delta (fault)" />
            )}
            {hasP0088 && (
              <Area type="monotone" dataKey="deltaHigh" stroke="none"
                fill="url(#deltaHighGrad)" isAnimationActive={false} name="Δ High Delta (fault)" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </FaultChartWrapper>
  );
});
RailPressureFaultChart.displayName = 'RailPressureFaultChart';

// ─── BOOST PRESSURE FAULT CHART ───────────────────────────────────────────────
export const BoostFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  const hasP0299 = diagnostics.issues.some(i => i.code === 'P0299');
  if (!hasP0299) return null;

  const chartData = useMemo(() => {
    const step = Math.ceil(data.rpm.length / 500);
    return data.rpm
      .map((rpm, i) => {
        const actual = data.boost?.[i] ?? 0;
        const desired = data.boostDesired?.[i] ?? 0;
        return {
          rpm: Math.round(rpm),
          actual: actual > 0 ? actual : null,
          desired: desired > 0 ? desired : null,
          delta: (desired > 0 && actual > 0 && desired > actual) ? desired - actual : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.actual !== null)
      .sort((a, b) => a.rpm - b.rpm);
  }, [data]);

  const peakActual = Math.max(...chartData.map(d => d.actual ?? 0));
  const peakDesired = Math.max(...chartData.map(d => d.desired ?? 0));
  const maxDelta = Math.max(...chartData.map(d => d.delta));
  const faultPoints = chartData.filter(d => (d.desired ?? 0) - (d.actual ?? 0) > 5);
  const faultRpmMin = faultPoints.length ? Math.min(...faultPoints.map(d => d.rpm)) : 0;
  const faultRpmMax = faultPoints.length ? Math.max(...faultPoints.map(d => d.rpm)) : 0;

  const issue = diagnostics.issues.find(i => i.code === 'P0299')!;

  return (
    <FaultChartWrapper
      ref={ref}
      code="P0299"
      title={`P0299 — ${issue.title}`}
      severity={issue.severity}
      recommendation={issue.recommendation}
      badges={<>
        <DeltaBadge label="Peak Boost" actual={peakActual.toFixed(1)} expected={peakDesired > 0 ? peakDesired.toFixed(1) : '48.0'} delta={(peakDesired > 0 ? peakDesired - peakActual : 48 - peakActual).toFixed(1)} unit="psi" isCritical={true} />
        <DeltaBadge label="Max Fault Delta" actual="Detected" expected="<5 psi" delta={maxDelta.toFixed(1)} unit="psi" isCritical={true} />
        <DeltaBadge label="Fault RPM Range" actual={`${faultRpmMin}`} expected={`${faultRpmMax}`} delta={`${faultPoints.length} pts`} unit="" isCritical={false} />
      </>}
    >
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
            <XAxis dataKey="rpm" stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
              label={{ value: 'ENGINE RPM', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
            <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              label={{ value: 'BOOST PRESSURE (PSI)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
            <Tooltip content={<FaultTooltip xLabel="Boost Pressure vs RPM" />} />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
              formatter={(v) => <span style={{ color: v === 'Desired PSI' ? '#44ff88' : v === 'Actual PSI' ? '#00c8ff' : '#ff2222' }}>{v}</span>} />
            {faultRpmMin > 0 && (
              <ReferenceArea x1={faultRpmMin - 50} x2={faultRpmMax + 50}
                fill="rgba(255,34,34,0.08)" stroke="#ff2222" strokeWidth={1.5} strokeDasharray="5 3" />
            )}
            <ReferenceLine y={40} stroke="#ff9900" strokeDasharray="6 3"
              label={{ value: 'MIN 40 PSI', position: 'insideTopRight', fill: '#ff9900', fontSize: 9, fontFamily: 'monospace' }} />
            <Line type="monotone" dataKey="desired" stroke="#44ff88" strokeWidth={2.5}
              dot={false} isAnimationActive={false} name="Desired PSI" />
            <Line type="monotone" dataKey="actual" stroke="#00c8ff" strokeWidth={2.5}
              dot={false} isAnimationActive={false} name="Actual PSI" />
            <Area type="monotone" dataKey="delta" stroke="none"
              fill="url(#boostDeltaGrad)" isAnimationActive={false} name="Δ Underboost Delta" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </FaultChartWrapper>
  );
});
BoostFaultChart.displayName = 'BoostFaultChart';

// ─── EGT FAULT CHART ──────────────────────────────────────────────────────────
export const EgtFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  const hasEgtFault = diagnostics.issues.some(i => i.code === 'EGT_HIGH' || i.code === 'EGT_SENSOR');
  if (!hasEgtFault) return null;

  const chartData = useMemo(() => {
    const step = Math.ceil(data.timeMinutes.length / 500);
    return data.timeMinutes
      .map((t, i) => {
        const egt = data.exhaustGasTemp?.[i] ?? 0;
        return {
          time: parseFloat(t.toFixed(2)),
          egt: egt > 0 ? egt : null,
          limit: 1475,
          delta: egt > 1475 ? egt - 1475 : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.egt !== null);
  }, [data]);

  const maxEgt = Math.max(...chartData.map(d => d.egt ?? 0));
  const avgEgt = chartData.reduce((s, d) => s + (d.egt ?? 0), 0) / chartData.length;
  const faultPoints = chartData.filter(d => (d.egt ?? 0) > 1475);
  const faultDuration = faultPoints.length * (data.timeMinutes[data.timeMinutes.length - 1] / data.timeMinutes.length) * 60;

  const issue = diagnostics.issues.find(i => i.code === 'EGT_HIGH' || i.code === 'EGT_SENSOR')!;

  return (
    <FaultChartWrapper
      ref={ref}
      code="EGT"
      title="Exhaust Gas Temperature — High EGT Warning"
      severity={issue.severity}
      recommendation={issue.recommendation}
      badges={<>
        <DeltaBadge label="Peak EGT" actual={maxEgt.toFixed(0)} expected="<1475" delta={(maxEgt - 1475).toFixed(0)} unit="°F" isCritical={true} />
        <DeltaBadge label="Avg EGT" actual={avgEgt.toFixed(0)} expected="<1200" delta={(avgEgt - 1200).toFixed(0)} unit="°F" isCritical={avgEgt > 1200} />
        <DeltaBadge label="Fault Duration" actual={faultDuration.toFixed(1)} expected="0" delta={`+${faultDuration.toFixed(1)}`} unit="sec" isCritical={true} />
      </>}
    >
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
              tickFormatter={(v) => `${v.toFixed(1)}m`}
              label={{ value: 'TIME (min)', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
            <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              label={{ value: 'EGT (°F)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
            <Tooltip content={<FaultTooltip xLabel="Exhaust Gas Temp" />} />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
              formatter={(v) => <span style={{ color: v === 'EGT Limit (1475°F)' ? '#44ff88' : v === 'EGT (°F)' ? '#ff9900' : '#ff2222' }}>{v}</span>} />
            <ReferenceLine y={1475} stroke="#ff6600" strokeDasharray="6 3"
              label={{ value: 'WARN 1475°F', position: 'insideTopRight', fill: '#ff6600', fontSize: 9, fontFamily: 'monospace' }} />
            <ReferenceLine y={1800} stroke="#ff2222" strokeDasharray="4 2"
              label={{ value: 'SENSOR FAULT 1800°F', position: 'insideTopRight', fill: '#ff2222', fontSize: 9, fontFamily: 'monospace' }} />
            <Area type="monotone" dataKey="egt" stroke="#ff9900" strokeWidth={2.5}
              fill="url(#egtGrad)" dot={false} isAnimationActive={false} name="EGT (°F)" />
            <Line type="monotone" dataKey="limit" stroke="#44ff88" strokeWidth={1.5}
              strokeDasharray="6 3" dot={false} isAnimationActive={false} name="EGT Limit (1475°F)" />
            <Area type="monotone" dataKey="delta" stroke="none"
              fill="url(#egtDeltaGrad)" isAnimationActive={false} name="Δ Over-Limit Delta" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </FaultChartWrapper>
  );
});
EgtFaultChart.displayName = 'EgtFaultChart';

// ─── MAF FAULT CHART ──────────────────────────────────────────────────────────
export const MafFaultChart = forwardRef<HTMLDivElement, FaultChartsProps>(({ data, diagnostics }, ref) => {
  const hasP0101 = diagnostics.issues.some(i => i.code === 'P0101');
  if (!hasP0101) return null;

  const chartData = useMemo(() => {
    const step = Math.ceil(data.rpm.length / 500);
    return data.rpm
      .map((rpm, i) => {
        const maf = data.maf?.[i] ?? 0;
        return {
          rpm: Math.round(rpm),
          maf: maf > 0 ? maf : null,
          maxIdle: 6,
          minIdle: 2,
          deltaHigh: (rpm < 1000 && maf > 6) ? maf - 6 : 0,
          deltaLow: (rpm < 1000 && maf > 0 && maf < 2) ? 2 - maf : 0,
        };
      })
      .filter((_, i) => i % step === 0)
      .filter(d => d.maf !== null && d.rpm < 1500)
      .sort((a, b) => a.rpm - b.rpm);
  }, [data]);

  const idlePoints = chartData.filter(d => d.rpm > 500 && d.rpm < 900);
  const avgIdleMaf = idlePoints.length ? idlePoints.reduce((s, d) => s + (d.maf ?? 0), 0) / idlePoints.length : 0;
  const isHigh = avgIdleMaf > 6;

  const issue = diagnostics.issues.find(i => i.code === 'P0101')!;

  return (
    <FaultChartWrapper
      ref={ref}
      code="P0101"
      title="P0101 — MAF Sensor Out of Range at Idle"
      severity={issue.severity}
      recommendation={issue.recommendation}
      badges={<>
        <DeltaBadge label="Avg Idle MAF" actual={avgIdleMaf.toFixed(2)} expected={isHigh ? '≤6.00' : '≥2.00'} delta={(isHigh ? avgIdleMaf - 6 : 2 - avgIdleMaf).toFixed(2)} unit="lb/min" isCritical={true} />
        <DeltaBadge label="Fault Type" actual={isHigh ? 'HIGH' : 'LOW'} expected="2–6 lb/min" delta={isHigh ? 'Too High' : 'Too Low'} unit="" isCritical={true} />
      </>}
    >
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
            <XAxis dataKey="rpm" stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              label={{ value: 'ENGINE RPM', position: 'insideBottom', offset: -12, fill: '#555', fontSize: 9, fontFamily: 'monospace' }} />
            <YAxis stroke="#333" tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
              label={{ value: 'MAF (lb/min)', angle: -90, position: 'insideLeft', offset: 14, fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
            <Tooltip content={<FaultTooltip xLabel="MAF Flow vs RPM" />} />
            <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 10, paddingTop: 8 }}
              formatter={(v) => <span style={{ color: v === 'Max Idle (6)' ? '#44ff88' : v === 'Min Idle (2)' ? '#44ff88' : v === 'MAF (lb/min)' ? '#ffaa00' : '#ff2222' }}>{v}</span>} />
            {/* Normal band */}
            <ReferenceArea y1={2} y2={6} fill="rgba(68,255,136,0.05)" stroke="none" />
            <ReferenceLine y={6} stroke="#44ff88" strokeDasharray="6 3"
              label={{ value: 'MAX IDLE 6 lb/min', position: 'insideTopRight', fill: '#44ff88', fontSize: 9, fontFamily: 'monospace' }} />
            <ReferenceLine y={2} stroke="#44ff88" strokeDasharray="6 3"
              label={{ value: 'MIN IDLE 2 lb/min', position: 'insideTopRight', fill: '#44ff88', fontSize: 9, fontFamily: 'monospace' }} />
            <Line type="monotone" dataKey="maf" stroke="#ffaa00" strokeWidth={2.5}
              dot={false} isAnimationActive={false} name="MAF (lb/min)" />
            <Area type="monotone" dataKey="deltaHigh" stroke="none"
              fill="url(#mafDeltaHighGrad)" isAnimationActive={false} name="Δ High Fault Delta" />
            <Area type="monotone" dataKey="deltaLow" stroke="none"
              fill="url(#mafDeltaLowGrad)" isAnimationActive={false} name="Δ Low Fault Delta" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </FaultChartWrapper>
  );
});
MafFaultChart.displayName = 'MafFaultChart';
