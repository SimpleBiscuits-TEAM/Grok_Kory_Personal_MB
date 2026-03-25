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
 * Statistics summary card
 */
export function StatsSummary({ data }: ChartProps) {
  const { stats } = data;
  const durationMin = (stats.duration / 60).toFixed(1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-600 mb-1">RPM Range</p>
        <p className="text-2xl font-bold text-gray-900">
          {stats.rpmMin.toFixed(0)} - {stats.rpmMax.toFixed(0)}
        </p>
        <p className="text-xs text-gray-500 mt-1">Mean: {stats.rpmMean.toFixed(0)}</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-600 mb-1">MAF (lb/min)</p>
        <p className="text-2xl font-bold text-gray-900">
          {stats.mafMin.toFixed(1)} - {stats.mafMax.toFixed(1)}
        </p>
        <p className="text-xs text-gray-500 mt-1">Mean: {stats.mafMean.toFixed(1)}</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-600 mb-1">Max Boost</p>
        <p className="text-2xl font-bold text-gray-900">
          {stats.boostMax.toFixed(1)} psi
        </p>
        <p className="text-xs text-gray-500 mt-1">Peak HP/Torque shown in dyno chart</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-600 mb-1">Session Duration</p>
        <p className="text-2xl font-bold text-gray-900">{durationMin} min</p>
        <p className="text-xs text-gray-500 mt-1">Max Boost: {stats.boostMax.toFixed(1)} psi</p>
      </div>
    </div>
  );
}
