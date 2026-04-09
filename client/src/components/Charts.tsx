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

/**
 * RPM vs MAF Flow — line chart sorted by RPM, with optional mean trend
 */
export function RPMvMAFChart({ data, binnedData }: ChartProps) {
  const chartData = useMemo(() => {
    const raw = data.rpm.map((rpm, i) => ({ rpm, maf: data.maf[i] }));
    // Sort by RPM for a clean left-to-right line
    raw.sort((a, b) => a.rpm - b.rpm);
    // Downsample for performance (max 600 points)
    const step = Math.max(1, Math.ceil(raw.length / 600));
    return raw.filter((_, i) => i % step === 0);
  }, [data]);

  return (
    <div style={{ width: '100%', height: '24rem', background: theme.bg, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${theme.blue}`, borderRadius: '3px', padding: '1rem' }}>
      <h3 style={{ fontFamily: theme.titleFont, fontSize: '1.15rem', letterSpacing: '0.06em', color: theme.title, margin: '0 0 0.75rem 0' }}>
        RPM vs MASS AIRFLOW (MAF)
      </h3>
      <ResponsiveContainer width="100%" height="85%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis
            dataKey="rpm"
            type="number"
            stroke={theme.axis}
            style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
            label={{ value: 'Engine RPM', position: 'insideBottomRight', offset: -10, fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
          />
          <YAxis
            dataKey="maf"
            type="number"
            stroke={theme.axis}
            style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
            label={{ value: 'MAF (lb/min)', angle: -90, position: 'insideLeft', fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
          />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => v.toFixed(2)} labelFormatter={(v: any) => `RPM: ${Number(v).toFixed(0)}`} />
          <Line
            type="monotone"
            dataKey="maf"
            stroke={theme.blue}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="MAF Flow"
          />
          {binnedData && (
            <Line
              type="monotone"
              dataKey="mafMean"
              data={binnedData}
              stroke={theme.red}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              name="Mean MAF Trend"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
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
      <ResponsiveContainer width="100%" height="85%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
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
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => v.toFixed(1)} labelFormatter={(v: any) => `RPM: ${Number(v).toFixed(0)}`} />
          <Legend wrapperStyle={{ fontFamily: theme.labelFont, fontSize: '0.72rem', color: theme.axis }} />
          <Line
            type="monotone"
            dataKey="hpTorque"
            stroke={theme.blue}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="HP (Torque method)"
          />
          <Line
            type="monotone"
            dataKey="hpMaf"
            stroke={theme.cyan}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="HP (MAF method)"
          />
          {binnedData && (
            <>
              <Line
                type="monotone"
                dataKey="hpTorqueMean"
                data={binnedData}
                stroke={theme.red}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                name="Mean HP (Torque)"
              />
              <Line
                type="monotone"
                dataKey="hpMafMean"
                data={binnedData}
                stroke={theme.amber}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                name="Mean HP (MAF)"
              />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
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
              <span style={{ color: theme.cyan }}>MAF: <b style={{ color: 'white' }}>{hoverData.maf.toFixed(1)}</b></span>
              <span style={{ color: theme.amber }}>Boost: <b style={{ color: 'white' }}>{hoverData.boost.toFixed(1)}</b></span>
              <span style={{ color: theme.green }}>HP: <b style={{ color: 'white' }}>{hoverData.hp.toFixed(1)}</b></span>
            </>
          ) : (
            <span>Hover chart for values</span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height="88%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis
            dataKey="time"
            stroke={theme.axis}
            style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
            label={{ value: 'Time (min)', position: 'insideBottomRight', offset: -10, fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
          />
          <YAxis
            yAxisId="left"
            stroke={theme.blue}
            style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
            label={{ value: 'RPM / MAF', angle: -90, position: 'insideLeft', fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke={theme.amber}
            style={{ fontSize: '0.7rem', fontFamily: theme.labelFont }}
            label={{ value: 'Boost (psi) / HP', angle: 90, position: 'insideRight', fill: theme.axis, fontSize: '0.7rem', fontFamily: theme.labelFont }}
          />
          {/* Hidden tooltip — we use the external bar instead */}
          <Tooltip content={() => null} />
          <Legend wrapperStyle={{ fontFamily: theme.labelFont, fontSize: '0.72rem', color: theme.axis }} />
          <Area
            yAxisId="left"
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
            yAxisId="left"
            type="monotone"
            dataKey="maf"
            stroke={theme.cyan}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="MAF (lb/min)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="boost"
            stroke={theme.amber}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name="Boost (psi)"
          />
          <Line
            yAxisId="right"
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
