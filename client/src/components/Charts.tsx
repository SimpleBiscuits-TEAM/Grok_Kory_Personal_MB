import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { ProcessedMetrics } from '@/lib/dataProcessor';
import { useMemo, useState, useCallback } from 'react';
import { ZoomableChart } from '@/components/ZoomableChart';
import { assignDistinctSeriesColors } from '@/lib/chartSeriesColors';

interface ChartProps {
  data: ProcessedMetrics;
  binnedData?: any[];
}

/* ── shared PPEI dark-theme tokens ── */
const theme = {
  bg: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  grid: 'oklch(0.20 0.006 260)',
  axis: 'oklch(0.55 0.008 260)',
  title: 'white',
  titleFont: '"Bebas Neue", "Impact", sans-serif',
  labelFont: '"Share Tech Mono", monospace',
  tooltipBg: 'oklch(0.16 0.006 260)',
  tooltipBorder: 'oklch(0.28 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  blue: 'oklch(0.70 0.18 200)',
  cyan: 'oklch(0.72 0.16 195)',
  green: 'oklch(0.65 0.20 145)',
  amber: 'oklch(0.75 0.18 60)',
  orange: 'oklch(0.75 0.18 40)',
};

const tooltipStyle = {
  backgroundColor: theme.tooltipBg,
  border: `1px solid ${theme.tooltipBorder}`,
  borderRadius: '4px',
  padding: '8px 12px',
  fontFamily: theme.labelFont,
  fontSize: '0.75rem',
  color: 'white',
};

/** Per-series Y domain so unrelated units (RPM vs lb/min, PSIG vs HP) are not forced onto one scale. */
function paddedYExtent(values: number[], opts?: { padRatio?: number; floorZero?: boolean }): [number, number] {
  const padRatio = opts?.padRatio ?? 0.06;
  const floorZero = opts?.floorZero ?? false;
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (xs.length === 0) return [0, 1];
  let lo = Math.min(...xs);
  let hi = Math.max(...xs);
  if (floorZero) lo = Math.min(0, lo);
  if (hi <= lo) hi = lo + (Math.abs(lo) > 1e-6 ? Math.abs(lo) * 0.05 + 0.5 : 1);
  const span = hi - lo;
  const pad = Math.max(span * padRatio, 1e-6);
  return [lo - pad, hi + pad];
}

/**
 * Mean MAF per integer RPM so the X axis has no duplicates — Recharts monotone lines
 * fail when many steady-state samples share the same RPM.
 */
function lineDataMeanMafPerRpm(points: { rpm: number; maf: number }[]): { rpm: number; maf: number }[] {
  const map = new Map<number, { sum: number; n: number }>();
  for (const p of points) {
    if (typeof p.rpm !== 'number' || !Number.isFinite(p.rpm)) continue;
    if (typeof p.maf !== 'number' || !Number.isFinite(p.maf)) continue;
    const k = Math.round(p.rpm);
    const e = map.get(k) ?? { sum: 0, n: 0 };
    e.sum += p.maf;
    e.n += 1;
    map.set(k, e);
  }
  return Array.from(map.entries())
    .map(([rpm, { sum, n }]) => ({ rpm, maf: sum / n }))
    .sort((a, b) => a.rpm - b.rpm);
}

/**
 * RPM vs MAF Flow — line chart sorted by RPM, with optional mean trend
 */
function formatTooltipNumber(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(2);
  return '—';
}

/** Hex stroke — Recharts + some SVG paths handle oklch inconsistently. */
const MAF_LINE_STROKE = '#38bdf8';

export function RPMvMAFChart({ data, binnedData }: ChartProps) {
  const chartData = useMemo(() => {
    const n = Math.min(data.rpm.length, data.maf?.length ?? 0);
    const raw: { rpm: number; maf: number }[] = [];
    for (let i = 0; i < n; i++) {
      const rpm = data.rpm[i];
      const v = data.maf[i];
      if (typeof rpm !== 'number' || !Number.isFinite(rpm)) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      raw.push({ rpm, maf: v });
    }
    const step = Math.max(1, Math.ceil(raw.length / 800));
    return raw.filter((_, i) => i % step === 0);
  }, [data]);

  const hasAnyMaf = chartData.some(d => d.maf > 0);

  return (
    <div style={{ width: '100%', height: '24rem', background: theme.bg, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${theme.blue}`, borderRadius: '3px', padding: '1rem' }}>
      <h3 style={{ fontFamily: theme.titleFont, fontSize: '1.15rem', letterSpacing: '0.06em', color: theme.title, margin: '0 0 0.75rem 0' }}>
        RPM vs MASS AIRFLOW (MAF)
      </h3>
      {!hasAnyMaf && chartData.length > 0 && (
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: theme.axis, fontFamily: theme.labelFont }}>
          MAF channel is zero or missing in this log — chart needs a logged mass airflow column.
        </p>
      )}
      <ZoomableChart data={chartData} height={280}>
        {(visibleData) => {
          const lineData = lineDataMeanMafPerRpm(visibleData);
          const rpms = visibleData.map(d => d.rpm).filter(Number.isFinite);
          const rmin = rpms.length ? Math.min(...rpms) : 0;
          const rmax = rpms.length ? Math.max(...rpms) : 0;
          const mafs = lineData.map(d => d.maf).filter(v => Number.isFinite(v));
          let yMin = 0;
          let yMax = 1;
          if (mafs.length > 0) {
            yMin = Math.min(...mafs);
            yMax = Math.max(...mafs);
            const pad = Math.max(0.15, (yMax - yMin) * 0.12);
            yMin = Math.max(0, yMin - pad);
            yMax = yMax + pad;
            if (yMax - yMin < 0.5) {
              yMax = yMin + 0.5;
            }
          }
          const binnedSlice = (binnedData as Array<{ rpm: number; mafMean?: number }> | undefined)?.filter(
            b => b.rpm >= rmin && b.rpm <= rmax,
          );
          return (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={lineData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis
                  dataKey="rpm"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  stroke={theme.axis}
                  style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
                  label={{ value: 'Engine RPM', position: 'insideBottomRight', offset: -10, fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
                />
                <YAxis
                  dataKey="maf"
                  type="number"
                  domain={[yMin, yMax]}
                  allowDecimals
                  stroke={theme.axis}
                  style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
                  label={{ value: 'MAF (lb/min)', angle: -90, position: 'insideLeft', fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: any) => formatTooltipNumber(v)}
                  labelFormatter={(_l: any, payload: any[]) => {
                    const rpm = payload?.[0]?.payload?.rpm;
                    return rpm != null && Number.isFinite(rpm) ? `RPM: ${Number(rpm).toFixed(0)}` : '';
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="maf"
                  name="MAF Flow"
                  stroke={MAF_LINE_STROKE}
                  strokeWidth={1.75}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                {binnedSlice && binnedSlice.length > 0 && (
                  <Line
                    type="linear"
                    dataKey="mafMean"
                    data={[...binnedSlice].sort((a, b) => a.rpm - b.rpm)}
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name="Mean MAF Trend"
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          );
        }}
      </ZoomableChart>
    </div>
  );
}

/**
 * Estimated Horsepower vs RPM — dual-method line chart
 */
export function HPvsRPMChart({ data, binnedData }: ChartProps) {
  const chartData = useMemo(() => {
    const raw = data.rpm.map((rpm, i) => ({ rpm, hpTorque: data.hpTorque[i], hpMaf: data.hpMaf[i] }));
    raw.sort((a, b) => a.rpm - b.rpm);
    const step = Math.max(1, Math.ceil(raw.length / 600));
    return raw.filter((_, i) => i % step === 0);
  }, [data]);

  return (
    <div style={{ width: '100%', height: '24rem', background: theme.bg, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${theme.green}`, borderRadius: '3px', padding: '1rem' }}>
      <h3 style={{ fontFamily: theme.titleFont, fontSize: '1.15rem', letterSpacing: '0.06em', color: theme.title, margin: '0 0 0.75rem 0' }}>
        ESTIMATED HORSEPOWER vs RPM
      </h3>
      <ZoomableChart data={chartData} height={280}>
        {(visibleData) => {
          const rpms = visibleData.map(d => d.rpm).filter(Number.isFinite);
          const rmin = rpms.length ? Math.min(...rpms) : 0;
          const rmax = rpms.length ? Math.max(...rpms) : 0;
          const binnedSlice = (binnedData as Array<{ rpm: number; hpTorqueMean?: number; hpMafMean?: number }> | undefined)?.filter(
            b => b.rpm >= rmin && b.rpm <= rmax,
          );
          const hpSeriesKeys =
            binnedSlice && binnedSlice.length > 0
              ? ['hpTorque', 'hpMaf', 'hpTorqueMean', 'hpMafMean']
              : ['hpTorque', 'hpMaf'];
          const hpStrokes = assignDistinctSeriesColors(hpSeriesKeys, {
            hpTorque: '#38bdf8',
            hpMaf: '#f97316',
            hpTorqueMean: '#ef4444',
            hpMafMean: '#a3e635',
          });
          const [stTorque, stMaf, stMeanTorque = '#ef4444', stMeanMaf = '#a3e635'] = hpStrokes;
          return (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={visibleData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis
                  dataKey="rpm"
                  type="number"
                  stroke={theme.axis}
                  style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
                  label={{ value: 'Engine RPM', position: 'insideBottomRight', offset: -10, fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
                />
                <YAxis
                  stroke={theme.axis}
                  style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
                  label={{ value: 'Horsepower', angle: -90, position: 'insideLeft', fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatTooltipNumber(v)} labelFormatter={(v: any) => `RPM: ${Number(v).toFixed(0)}`} />
                <Legend wrapperStyle={{ fontFamily: theme.labelFont, fontSize: '0.72rem', color: theme.axis }} />
                <Line
                  type="monotone"
                  dataKey="hpTorque"
                  stroke={stTorque}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  name="HP (Torque method)"
                />
                <Line
                  type="monotone"
                  dataKey="hpMaf"
                  stroke={stMaf}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  name="HP (MAF method)"
                />
                {binnedSlice && binnedSlice.length > 0 && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="hpTorqueMean"
                      data={binnedSlice}
                      stroke={stMeanTorque}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                      name="Mean HP (Torque)"
                    />
                    <Line
                      type="monotone"
                      dataKey="hpMafMean"
                      data={binnedSlice}
                      stroke={stMeanMaf}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                      name="Mean HP (MAF)"
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          );
        }}
      </ZoomableChart>
    </div>
  );
}

/**
 * Time-series overview — RPM, MAF, Boost, HP over time
 */
export function TimeSeriesChart({ data }: ChartProps) {
  const chartData = useMemo(() => {
    const raw = data.rpm.map((_, i) => ({
      time: data.timeMinutes[i],
      rpm: data.rpm[i],
      maf: data.maf[i],
      boost: data.boost[i],
      hp: data.hpTorque[i],
    }));
    // Downsample for performance (max 600 points)
    const step = Math.max(1, Math.ceil(raw.length / 600));
    return raw.filter((_, i) => i % step === 0);
  }, [data]);

  // External tooltip state — renders ABOVE the chart, never covering data
  const [hoverData, setHoverData] = useState<{time: number; rpm: number; maf: number; boost: number; hp: number} | null>(null);

  const handleMouseMove = useCallback((state: any) => {
    if (state?.activePayload?.length) {
      const p = state.activePayload[0].payload;
      setHoverData({ time: p.time, rpm: p.rpm, maf: p.maf, boost: p.boost, hp: p.hp });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverData(null);
  }, []);

  return (
    <div style={{ width: '100%', height: '26rem', background: theme.bg, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${theme.amber}`, borderRadius: '3px', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 0.5rem 0' }}>
        <h3 style={{ fontFamily: theme.titleFont, fontSize: '1.15rem', letterSpacing: '0.06em', color: theme.title, margin: 0 }}>
          TIME-SERIES OVERVIEW
        </h3>
        {/* External tooltip bar — sits in the header row, never covers the chart */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          fontFamily: theme.labelFont,
          fontSize: '0.72rem',
          color: 'oklch(0.60 0.008 260)',
          minHeight: '1.4rem',
          opacity: hoverData ? 1 : 0.4,
          transition: 'opacity 0.15s',
        }}>
          {hoverData ? (
            <>
              <span style={{ color: theme.axis }}>t: <b style={{ color: 'white' }}>{hoverData.time.toFixed(3)}</b></span>
              <span style={{ color: theme.blue }}>RPM: <b style={{ color: 'white' }}>{hoverData.rpm.toFixed(1)}</b></span>
              <span style={{ color: theme.orange }}>MAF: <b style={{ color: 'white' }}>{hoverData.maf.toFixed(1)}</b></span>
              <span style={{ color: theme.amber }}>Boost: <b style={{ color: 'white' }}>{hoverData.boost.toFixed(1)}</b></span>
              <span style={{ color: theme.green }}>HP: <b style={{ color: 'white' }}>{hoverData.hp.toFixed(1)}</b></span>
            </>
          ) : (
            <span>Hover chart for values</span>
          )}
        </div>
      </div>
      <ZoomableChart data={chartData} height={300}>
        {(visibleData) => {
          const [rpmLo, rpmHi] = paddedYExtent(visibleData.map((d) => d.rpm), { padRatio: 0.04, floorZero: false });
          const [mafLo, mafHi] = paddedYExtent(visibleData.map((d) => d.maf), { padRatio: 0.08, floorZero: true });
          const [boostLo, boostHi] = paddedYExtent(visibleData.map((d) => d.boost), { padRatio: 0.1, floorZero: true });
          const [hpLo, hpHi] = paddedYExtent(visibleData.map((d) => d.hp), { padRatio: 0.05, floorZero: false });
          const axisTick = { fontSize: 10, fontFamily: theme.labelFont };
          return (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={visibleData}
                margin={{ top: 10, right: 56, bottom: 22, left: 56 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                <XAxis
                  dataKey="time"
                  stroke={theme.axis}
                  style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
                  label={{ value: 'Time (min)', position: 'insideBottomRight', offset: -10, fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
                />
                <YAxis
                  yAxisId="rpm"
                  orientation="left"
                  domain={[rpmLo, rpmHi]}
                  stroke={theme.blue}
                  tick={{ ...axisTick, fill: theme.blue }}
                  width={44}
                  label={{ value: 'RPM', angle: -90, position: 'insideLeft', fill: theme.blue, fontSize: '0.65rem', fontFamily: theme.labelFont }}
                />
                <YAxis
                  yAxisId="maf"
                  orientation="left"
                  offset={48}
                  domain={[mafLo, mafHi]}
                  allowDecimals
                  stroke={theme.orange}
                  tick={{ ...axisTick, fill: theme.orange }}
                  width={44}
                  label={{ value: 'MAF lb/min', angle: -90, position: 'insideLeft', fill: theme.orange, fontSize: '0.65rem', fontFamily: theme.labelFont }}
                />
                <YAxis
                  yAxisId="boost"
                  orientation="right"
                  domain={[boostLo, boostHi]}
                  allowDecimals
                  stroke={theme.amber}
                  tick={{ ...axisTick, fill: theme.amber }}
                  width={44}
                  label={{ value: 'Boost PSIG', angle: 90, position: 'insideRight', fill: theme.amber, fontSize: '0.65rem', fontFamily: theme.labelFont }}
                />
                <YAxis
                  yAxisId="hp"
                  orientation="right"
                  offset={48}
                  domain={[hpLo, hpHi]}
                  allowDecimals
                  stroke={theme.green}
                  tick={{ ...axisTick, fill: theme.green }}
                  width={44}
                  label={{ value: 'HP / TQ', angle: 90, position: 'insideRight', fill: theme.green, fontSize: '0.65rem', fontFamily: theme.labelFont }}
                />
                <Tooltip content={() => null} />
                <Legend wrapperStyle={{ fontFamily: theme.labelFont, fontSize: '0.72rem', color: theme.axis }} />
                <Area
                  yAxisId="rpm"
                  type="monotone"
                  dataKey="rpm"
                  fill={theme.blue}
                  stroke={theme.blue}
                  fillOpacity={0.12}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  name="RPM"
                />
                <Line
                  yAxisId="maf"
                  type="monotone"
                  dataKey="maf"
                  stroke={theme.orange}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  name="MAF (lb/min)"
                />
                <Line
                  yAxisId="boost"
                  type="monotone"
                  dataKey="boost"
                  stroke={theme.amber}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name="Boost (psi)"
                />
                <Line
                  yAxisId="hp"
                  type="monotone"
                  dataKey="hp"
                  stroke={theme.green}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  name="HP (Torque)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          );
        }}
      </ZoomableChart>
    </div>
  );
}

/**
 * Statistics summary card — PPEI dark theme
 */
export function StatsSummary({ data }: ChartProps) {
  const { stats } = data;
  const durationMin = (stats.duration / 60).toFixed(1);

  // Build stat cards — always show RPM, MAF, Boost, and conditionally EGT
  const statCards: { label: string; value: string; unit?: string; sub: string; accent: string }[] = [
    {
      label: 'RPM RANGE',
      value: `${stats.rpmMin.toFixed(0)} – ${stats.rpmMax.toFixed(0)}`,
      sub: `Mean: ${stats.rpmMean.toFixed(0)} RPM`,
      accent: 'oklch(0.52 0.22 25)',
    },
    {
      label: 'MAF (LB/MIN)',
      value: `${stats.mafMin.toFixed(1)} – ${stats.mafMax.toFixed(1)}`,
      sub: `Mean: ${stats.mafMean.toFixed(1)} lb/min`,
      accent: 'oklch(0.75 0.18 40)',
    },
    {
      label: 'MAX BOOST',
      value: stats.boostMax.toFixed(1),
      unit: 'PSIG',
      sub: 'Gauge pressure (above atmospheric)',
      accent: 'oklch(0.70 0.18 200)',
    },
  ];

  // Add EGT card if available and not flatlined
  if (stats.egtAvailable && !stats.egtFlatlined) {
    statCards.push({
      label: 'PEAK EGT',
      value: stats.egtMax.toFixed(0),
      unit: '°F',
      sub: stats.egtMax > 1400 ? 'Elevated — monitor closely' : stats.egtMax > 1200 ? 'Normal operating range' : 'Low / warming up',
      accent: stats.egtMax > 1400 ? 'oklch(0.52 0.22 25)' : 'oklch(0.75 0.18 60)',
    });
  }

  // Always add session duration last
  statCards.push({
    label: 'SESSION DURATION',
    value: durationMin,
    unit: 'MIN',
    sub: `Max Boost: ${stats.boostMax.toFixed(1)} PSIG`,
    accent: 'oklch(0.65 0.20 145)',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(statCards.length, 5)}, 1fr)`, gap: '0.75rem' }}>
      {statCards.map((card) => (
        <div key={card.label} style={{
          background: 'oklch(0.13 0.006 260)',
          border: '1px solid oklch(0.22 0.008 260)',
          borderTop: `3px solid ${card.accent}`,
          borderRadius: '3px',
          padding: '1rem',
        }}>
          <p style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '0.72rem',
            letterSpacing: '0.1em',
            color: 'oklch(0.63 0.010 260)',
            margin: 0,
            marginBottom: '6px'
          }}>{card.label}</p>
          <p style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '1.6rem',
            color: 'white',
            margin: 0,
            lineHeight: 1.1
          }}>
            {card.value}
            {card.unit && <span style={{ fontSize: '0.9rem', color: card.accent, marginLeft: '4px' }}>{card.unit}</span>}
          </p>
          <p style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.7rem',
            color: 'oklch(0.60 0.008 260)',
            margin: 0,
            marginTop: '4px'
          }}>{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
