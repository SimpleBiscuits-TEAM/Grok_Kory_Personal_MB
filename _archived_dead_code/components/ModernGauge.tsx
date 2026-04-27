/**
 * Modern Gauge Component
 * Glassmorphic design with smooth animations
 * Optimized for mobile and desktop
 */

import React, { useMemo } from 'react';

export interface GaugeProps {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  color?: 'blue' | 'red' | 'green' | 'yellow' | 'orange' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  showTicks?: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
  trend?: 'up' | 'down' | 'stable';
}

const colorMap = {
  blue: 'from-blue-500 to-cyan-500',
  red: 'from-red-500 to-pink-500',
  green: 'from-green-500 to-emerald-500',
  yellow: 'from-yellow-500 to-amber-500',
  orange: 'from-orange-500 to-red-500',
  purple: 'from-purple-500 to-pink-500',
};

const sizeMap = {
  sm: { container: 'w-24 h-24', svg: 120, radius: 50, strokeWidth: 8 },
  md: { container: 'w-40 h-40', svg: 200, radius: 85, strokeWidth: 12 },
  lg: { container: 'w-56 h-56', svg: 280, radius: 120, strokeWidth: 16 },
};

export function ModernGauge({
  value,
  min,
  max,
  label,
  unit,
  color = 'blue',
  size = 'md',
  showTicks = true,
  warningThreshold,
  criticalThreshold,
  trend,
}: GaugeProps) {
  const sizeConfig = sizeMap[size];
  const colorGradient = colorMap[color];

  // Calculate rotation angle (0-270 degrees for gauge)
  const percentage = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const rotation = percentage * 270 - 135; // -135 to 135 degrees

  // Determine status color
  const getStatusColor = () => {
    if (criticalThreshold && value >= criticalThreshold) return 'text-red-500';
    if (warningThreshold && value >= warningThreshold) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Generate tick marks
  const ticks = useMemo(() => {
    if (!showTicks) return [];
    const tickCount = 9; // 9 ticks for even distribution
    const tickArray = [];
    for (let i = 0; i < tickCount; i++) {
      const angle = (i / (tickCount - 1)) * 270 - 135;
      const tickValue = min + (i / (tickCount - 1)) * (max - min);
      tickArray.push({ angle, value: tickValue });
    }
    return tickArray;
  }, [min, max, showTicks]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Gauge Container */}
      <div className={`relative ${sizeConfig.container} flex items-center justify-center`}>
        {/* Glassmorphic Background */}
        <div className="absolute inset-0 rounded-full bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl" />

        {/* SVG Gauge */}
        <svg
          width={sizeConfig.svg}
          height={sizeConfig.svg}
          viewBox={`0 0 ${sizeConfig.svg} ${sizeConfig.svg}`}
          className="relative z-10"
        >
          {/* Background Arc */}
          <circle
            cx={sizeConfig.svg / 2}
            cy={sizeConfig.svg / 2}
            r={sizeConfig.radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={sizeConfig.strokeWidth}
            strokeDasharray={`${(270 / 360) * 2 * Math.PI * sizeConfig.radius} ${2 * Math.PI * sizeConfig.radius}`}
            strokeDashoffset={`${(-135 / 360) * 2 * Math.PI * sizeConfig.radius}`}
            strokeLinecap="round"
          />

          {/* Value Arc */}
          <circle
            cx={sizeConfig.svg / 2}
            cy={sizeConfig.svg / 2}
            r={sizeConfig.radius}
            fill="none"
            stroke={`url(#gaugeGradient-${color})`}
            strokeWidth={sizeConfig.strokeWidth}
            strokeDasharray={`${percentage * (270 / 360) * 2 * Math.PI * sizeConfig.radius} ${2 * Math.PI * sizeConfig.radius}`}
            strokeDashoffset={`${(-135 / 360) * 2 * Math.PI * sizeConfig.radius}`}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />

          {/* Gradient Definition */}
          <defs>
            <linearGradient id={`gaugeGradient-${color}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color === 'blue' ? '#3b82f6' : color === 'red' ? '#ef4444' : color === 'green' ? '#10b981' : color === 'yellow' ? '#eab308' : color === 'orange' ? '#f97316' : '#a855f7'} />
              <stop offset="100%" stopColor={color === 'blue' ? '#06b6d4' : color === 'red' ? '#ec4899' : color === 'green' ? '#10b981' : color === 'yellow' ? '#f59e0b' : color === 'orange' ? '#dc2626' : '#ec4899'} />
            </linearGradient>
          </defs>

          {/* Tick Marks */}
          {ticks.map((tick, idx) => {
            const tickAngle = (tick.angle + 90) * (Math.PI / 180);
            const innerRadius = sizeConfig.radius - sizeConfig.strokeWidth / 2 - 8;
            const outerRadius = sizeConfig.radius + sizeConfig.strokeWidth / 2 + 8;
            const x1 = sizeConfig.svg / 2 + innerRadius * Math.cos(tickAngle);
            const y1 = sizeConfig.svg / 2 + innerRadius * Math.sin(tickAngle);
            const x2 = sizeConfig.svg / 2 + outerRadius * Math.cos(tickAngle);
            const y2 = sizeConfig.svg / 2 + outerRadius * Math.sin(tickAngle);

            return (
              <line
                key={idx}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            );
          })}

          {/* Center Dot */}
          <circle cx={sizeConfig.svg / 2} cy={sizeConfig.svg / 2} r="6" fill="rgba(255, 255, 255, 0.8)" />

          {/* Needle */}
          <g transform={`translate(${sizeConfig.svg / 2}, ${sizeConfig.svg / 2}) rotate(${rotation})`}>
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={-sizeConfig.radius + 20}
              stroke={`url(#gaugeGradient-${color})`}
              strokeWidth="4"
              strokeLinecap="round"
              className="transition-transform duration-300 ease-out drop-shadow-lg"
            />
            <circle cx="0" cy="0" r="8" fill="rgba(255, 255, 255, 0.9)" className="drop-shadow-lg" />
          </g>
        </svg>

        {/* Trend Indicator */}
        {trend && (
          <div className="absolute top-2 right-2 text-lg">
            {trend === 'up' && <span className="text-green-400">↗</span>}
            {trend === 'down' && <span className="text-red-400">↘</span>}
            {trend === 'stable' && <span className="text-blue-400">→</span>}
          </div>
        )}
      </div>

      {/* Value Display */}
      <div className="text-center">
        <div className={`text-2xl md:text-3xl font-bold ${getStatusColor()} transition-colors duration-300`}>
          {value.toFixed(1)}
          <span className="text-sm ml-1">{unit}</span>
        </div>
        <div className="text-xs md:text-sm text-gray-400 mt-1">{label}</div>
      </div>

      {/* Range Indicator */}
      <div className="text-xs text-gray-500 text-center">
        {min.toFixed(0)} — {max.toFixed(0)} {unit}
      </div>
    </div>
  );
}

/**
 * Compact Gauge - for mobile dashboards
 */
export function CompactGauge({
  value,
  min,
  max,
  label,
  unit,
  color = 'blue',
  warningThreshold,
  criticalThreshold,
}: Omit<GaugeProps, 'size' | 'showTicks'>) {
  const percentage = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const getStatusColor = () => {
    if (criticalThreshold && value >= criticalThreshold) return 'bg-red-500';
    if (warningThreshold && value >= warningThreshold) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const colorBg = {
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    purple: 'bg-purple-500',
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 backdrop-blur-md border border-white/10">
      {/* Label */}
      <div className="flex justify-between items-center">
        <span className="text-xs md:text-sm font-medium text-gray-300">{label}</span>
        <span className={`text-sm md:text-base font-bold ${getStatusColor() === 'bg-red-500' ? 'text-red-400' : getStatusColor() === 'bg-yellow-500' ? 'text-yellow-400' : 'text-green-400'}`}>
          {value.toFixed(1)} {unit}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorBg[color]} transition-all duration-300 ease-out rounded-full`}
          style={{ width: `${percentage * 100}%` }}
        />
      </div>

      {/* Range */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{min.toFixed(0)}</span>
        <span>{max.toFixed(0)}</span>
      </div>
    </div>
  );
}

/**
 * Gauge Grid - displays multiple gauges responsively
 */
export function GaugeGrid({
  gauges,
  columns = 2,
}: {
  gauges: GaugeProps[];
  columns?: number;
}) {
  return (
    <div
      className={`grid gap-4 md:gap-6 w-full`}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${columns === 1 ? '100%' : columns === 2 ? '200px' : '150px'}, 1fr))`,
      }}
    >
      {gauges.map((gauge, idx) => (
        <ModernGauge key={idx} {...gauge} size={columns === 1 ? 'lg' : columns === 2 ? 'md' : 'sm'} />
      ))}
    </div>
  );
}

/**
 * Compact Gauge Grid - for mobile dashboards
 */
export function CompactGaugeGrid({
  gauges,
  columns = 1,
}: {
  gauges: Omit<GaugeProps, 'size' | 'showTicks'>[];
  columns?: number;
}) {
  return (
    <div
      className={`grid gap-2 md:gap-3 w-full`}
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
      }}
    >
      {gauges.map((gauge, idx) => (
        <CompactGauge key={idx} {...gauge} />
      ))}
    </div>
  );
}
