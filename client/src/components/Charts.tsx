import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { ProcessedMetrics } from '@/lib/dataProcessor';

interface ChartProps {
  data: ProcessedMetrics;
  binnedData?: any[];
}

/**
 * RPM vs MAF Flow chart with vehicle speed overlay
 */
export function RPMvMAFChart({ data, binnedData }: ChartProps) {
  const chartData = data.rpm.map((rpm, i) => ({
    rpm,
    maf: data.maf[i],
    vehicleSpeed: data.vehicleSpeed[i],
  }));

  return (
    <div className="w-full h-96 bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">RPM vs Mass Airflow (MAF)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            dataKey="rpm"
            name="Engine RPM"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            type="number"
            dataKey="maf"
            name="MAF (lb/min)"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '8px',
            }}
            formatter={(value: any) => value.toFixed(1)}
            labelFormatter={(value: any) => `RPM: ${value.toFixed(0)}`}
          />
          <Scatter
            name="MAF Flow"
            data={chartData}
            fill="#3b82f6"
            fillOpacity={0.3}
            isAnimationActive={false}
          />
          {binnedData && (
            <Line
              type="monotone"
              dataKey="mafMean"
              data={binnedData}
              stroke="#1e40af"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              name="Mean MAF Trend"
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Estimated Horsepower vs RPM chart with dual methods
 */
export function HPvsRPMChart({ data, binnedData }: ChartProps) {
  const chartData = data.rpm.map((rpm, i) => ({
    rpm,
    hpTorque: data.hpTorque[i],
    hpMaf: data.hpMaf[i],
  }));

  return (
    <div className="w-full h-96 bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Estimated Horsepower vs RPM</h3>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            type="number"
            dataKey="rpm"
            name="Engine RPM"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <YAxis
            type="number"
            dataKey="hpTorque"
            name="HP"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '8px',
            }}
            formatter={(value: any) => value.toFixed(1)}
            labelFormatter={(value: any) => `RPM: ${value.toFixed(0)}`}
          />
          <Scatter
            name="HP (Torque method)"
            data={chartData}
            fill="#3b82f6"
            fillOpacity={0.2}
            isAnimationActive={false}
          />
          <Scatter
            name="HP (MAF method)"
            data={chartData}
            dataKey="hpMaf"
            fill="#06b6d4"
            fillOpacity={0.2}
            isAnimationActive={false}
          />
          {binnedData && (
            <>
              <Line
                type="monotone"
                dataKey="hpTorqueMean"
                data={binnedData}
                stroke="#1e40af"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Mean HP (Torque)"
              />
              <Line
                type="monotone"
                dataKey="hpMafMean"
                data={binnedData}
                stroke="#0891b2"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="Mean HP (MAF)"
              />
            </>
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Time-series overview with multiple channels
 */
export function TimeSeriesChart({ data }: ChartProps) {
  const chartData = data.rpm.map((_, i) => ({
    time: data.timeMinutes[i],
    rpm: data.rpm[i],
    maf: data.maf[i],
    boost: data.boost[i],
    hp: data.hpTorque[i],
  }));

  // Downsample for performance
  const downsampledData = chartData.filter((_, i) => i % Math.ceil(chartData.length / 500) === 0);

  return (
    <div className="w-full h-96 bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Time-Series Overview</h3>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={downsampledData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="time"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            label={{ value: 'Time (min)', position: 'insideBottomRight', offset: -10 }}
          />
          <YAxis
            yAxisId="left"
            stroke="#3b82f6"
            style={{ fontSize: '12px' }}
            label={{ value: 'RPM / MAF', angle: -90, position: 'insideLeft' }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#f59e0b"
            style={{ fontSize: '12px' }}
            label={{ value: 'Boost (psi) / HP', angle: 90, position: 'insideRight' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '8px',
            }}
            formatter={(value: any) => value.toFixed(1)}
          />
          <Legend />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="rpm"
            fill="#3b82f6"
            stroke="#1e40af"
            fillOpacity={0.2}
            isAnimationActive={false}
            name="RPM"
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="maf"
            fill="#06b6d4"
            stroke="#0891b2"
            fillOpacity={0.2}
            isAnimationActive={false}
            name="MAF (lb/min)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="boost"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name="Boost (psi)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="hp"
            stroke="#10b981"
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
            color: 'oklch(0.50 0.010 260)',
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
            color: 'oklch(0.45 0.008 260)',
            margin: 0,
            marginTop: '4px'
          }}>{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
