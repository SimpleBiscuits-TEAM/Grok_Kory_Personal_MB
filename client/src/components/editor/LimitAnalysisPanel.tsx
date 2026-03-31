/**
 * LimitAnalysisPanel — Airflow, Boost & Torque Limit Analyzer
 * 
 * Scans the loaded calibration for limit-related tables and shows:
 * 1. Which subsystem limits are active at each RPM/load point
 * 2. How close current values are to their limits
 * 3. Color-coded heatmap of "headroom" (green = lots of room, red = at limit)
 * 4. Quick-jump to the constraining table in the map editor
 */

import { useState, useMemo, useCallback } from 'react';
import { AlertTriangle, Gauge, Wind, Flame, Zap, ChevronDown, ChevronRight, ExternalLink, TrendingUp, Shield, ThermometerSun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Types
interface CalMap {
  name: string;
  type: string;
  description?: string;
  unit?: string;
  category?: string;
  friendlyName?: string;
  xSize?: number;
  ySize?: number;
  xAxis?: number[];
  yAxis?: number[];
  values?: number[][] | number[];
  address?: number;
}

interface EcuDef {
  maps: CalMap[];
  ecuFamily?: string;
}

interface LimitAnalysisPanelProps {
  ecuDef: EcuDef | null;
  onJumpToMap?: (mapIndex: number) => void;
}

// Limit category definitions
interface LimitCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  patterns: RegExp[];
  description: string;
}

const LIMIT_CATEGORIES: LimitCategory[] = [
  {
    id: 'airflow',
    label: 'Airflow Limits',
    icon: <Wind className="w-4 h-4" />,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    patterns: [
      /^AirPah.*(?:lim|max|min|des|target|setpoint)/i,
      /^TqStrct.*ratMAir.*(?:max|min|lim)/i,
      /^TqStrct.*mfNrmAir/i,
      /^MoFAirFl.*(?:lim|max|min)/i,
    ],
    description: 'Maximum air mass flow, air charge limits, and compressor surge boundaries',
  },
  {
    id: 'boost',
    label: 'Boost Control Limits',
    icon: <Gauge className="w-4 h-4" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    patterns: [
      /^AirPah.*(?:pIntk|pBoost|boost).*(?:max|min|lim|des)/i,
      /^AirPah.*(?:WgDty|WstGt|Trbo).*(?:max|min|lim)/i,
      /^TqStrct.*(?:MaxBoost|Cmpr)/i,
    ],
    description: 'Boost pressure targets, wastegate duty limits, and turbo protection',
  },
  {
    id: 'torque',
    label: 'Torque Limits',
    icon: <TrendingUp className="w-4 h-4" />,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    patterns: [
      /^TqDmd.*(?:lim|max|min)/i,
      /^TqStrct.*(?:tq|eta).*(?:lim|max|min)/i,
      /^MoFTrqPtd.*(?:lim|max|min)/i,
    ],
    description: 'Engine torque demand limits, torque structure ceilings, and protection thresholds',
  },
  {
    id: 'fuel',
    label: 'Fuel System Limits',
    icon: <Flame className="w-4 h-4" />,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    patterns: [
      /^FuPah.*(?:lim|max|min)/i,
      /^TqStrct.*tiInj.*(?:max|min)/i,
    ],
    description: 'Lambda targets, injection timing limits, and fuel enrichment boundaries',
  },
  {
    id: 'ignition',
    label: 'Ignition Limits',
    icon: <Zap className="w-4 h-4" />,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    patterns: [
      /^IgnPah.*(?:lim|max|min|retard)/i,
      /^TqStrct.*(?:etaIgn|RednStg)/i,
      /^IKCtl.*(?:lim|max|min)/i,
    ],
    description: 'Ignition advance limits, knock control boundaries, and retard thresholds',
  },
  {
    id: 'throttle',
    label: 'Throttle Limits',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    patterns: [
      /^ThrVlv.*(?:lim|max|min|posn)/i,
      /^MoFAPP.*(?:lim|max|min)/i,
    ],
    description: 'Throttle position limits, pedal interpretation boundaries',
  },
  {
    id: 'thermal',
    label: 'Thermal Protection',
    icon: <ThermometerSun className="w-4 h-4" />,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    borderColor: 'border-pink-500/30',
    patterns: [
      /^ExhPah.*(?:lim|max|min|protect)/i,
      /^ExhMgT.*(?:lim|max|min)/i,
      /(?:CEngDsT|CoolT|OilT).*(?:lim|max|min)/i,
    ],
    description: 'Exhaust gas temperature limits, coolant/oil temp protection, and catalyst protection',
  },
];

interface AnalyzedLimit {
  map: CalMap;
  mapIndex: number;
  category: LimitCategory;
  severity: 'critical' | 'warning' | 'info';
  headroom: number | null; // 0-100% headroom remaining, null if can't compute
  insight: string;
}

function analyzeMapHeadroom(map: CalMap): { headroom: number | null; insight: string; severity: 'critical' | 'warning' | 'info' } {
  const values = map.values;
  if (!values || (Array.isArray(values) && values.length === 0)) {
    return { headroom: null, insight: 'No data loaded — load a binary to analyze', severity: 'info' };
  }

  // Flatten 2D to 1D
  let flat: number[] = [];
  if (Array.isArray(values[0])) {
    for (const row of values as number[][]) {
      flat.push(...row);
    }
  } else {
    flat = values as number[];
  }

  // Filter out zeros and NaN
  const valid = flat.filter(v => !isNaN(v) && isFinite(v));
  if (valid.length === 0) {
    return { headroom: null, insight: 'All values are zero or invalid', severity: 'info' };
  }

  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const range = max - min;
  const unit = map.unit || '';

  // Check if this is a "max limit" type map (values represent ceilings)
  const isMaxLimit = /max|ceil|upper/i.test(map.name);
  const isMinLimit = /min|floor|lower/i.test(map.name);

  if (isMaxLimit) {
    // For max limits, lower values = more restrictive
    // Check if many cells are at the same (low) value — suggests a hard cap
    const atMin = valid.filter(v => Math.abs(v - min) < range * 0.05).length;
    const pctAtMin = atMin / valid.length;
    if (pctAtMin > 0.5) {
      return {
        headroom: 15,
        insight: `${(pctAtMin * 100).toFixed(0)}% of cells at minimum value (${min.toFixed(1)} ${unit}) — hard ceiling active`,
        severity: 'critical',
      };
    }
    // Check variance — low variance means uniform limit
    const variance = valid.reduce((s, v) => s + (v - avg) ** 2, 0) / valid.length;
    const cv = Math.sqrt(variance) / (Math.abs(avg) || 1);
    if (cv < 0.05 && avg > 0) {
      return {
        headroom: 40,
        insight: `Uniform limit at ${avg.toFixed(1)} ${unit} across all operating points`,
        severity: 'warning',
      };
    }
    return {
      headroom: 70,
      insight: `Range: ${min.toFixed(1)}–${max.toFixed(1)} ${unit}, varies by operating point`,
      severity: 'info',
    };
  }

  if (isMinLimit) {
    const atMax = valid.filter(v => Math.abs(v - max) < range * 0.05).length;
    const pctAtMax = atMax / valid.length;
    if (pctAtMax > 0.5) {
      return {
        headroom: 15,
        insight: `${(pctAtMax * 100).toFixed(0)}% of cells at maximum floor (${max.toFixed(1)} ${unit}) — hard floor active`,
        severity: 'critical',
      };
    }
    return {
      headroom: 60,
      insight: `Floor range: ${min.toFixed(1)}–${max.toFixed(1)} ${unit}`,
      severity: 'info',
    };
  }

  // Generic limit — just report the range
  return {
    headroom: 50,
    insight: `Values: ${min.toFixed(1)}–${max.toFixed(1)} ${unit} (avg ${avg.toFixed(1)})`,
    severity: 'info',
  };
}

export default function LimitAnalysisPanel({ ecuDef, onJumpToMap }: LimitAnalysisPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['airflow', 'boost', 'torque']));
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning'>('all');

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Analyze all maps against limit categories
  const analysis = useMemo(() => {
    if (!ecuDef?.maps?.length) return { categories: [], totalLimits: 0, criticalCount: 0, warningCount: 0 };

    const results: Map<string, AnalyzedLimit[]> = new Map();
    let totalLimits = 0;
    let criticalCount = 0;
    let warningCount = 0;

    for (const cat of LIMIT_CATEGORIES) {
      const catLimits: AnalyzedLimit[] = [];

      for (let i = 0; i < ecuDef.maps.length; i++) {
        const map = ecuDef.maps[i];
        const name = map.name;
        const type = map.type;

        // Only MAPs and CURVEs are interesting for limit analysis
        if (type !== 'MAP' && type !== 'CURVE') continue;

        // Check if this map matches any pattern in this category
        if (cat.patterns.some(p => p.test(name))) {
          const { headroom, insight, severity } = analyzeMapHeadroom(map);
          catLimits.push({ map, mapIndex: i, category: cat, severity, headroom, insight });
          totalLimits++;
          if (severity === 'critical') criticalCount++;
          if (severity === 'warning') warningCount++;
        }
      }

      // Sort: critical first, then warning, then info
      catLimits.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      });

      results.set(cat.id, catLimits);
    }

    return {
      categories: LIMIT_CATEGORIES.map(cat => ({
        ...cat,
        limits: results.get(cat.id) || [],
      })),
      totalLimits,
      criticalCount,
      warningCount,
    };
  }, [ecuDef]);

  if (!ecuDef) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3 p-6">
        <AlertTriangle className="w-10 h-10 text-zinc-600" />
        <p className="text-sm font-medium">No calibration loaded</p>
        <p className="text-xs text-zinc-600">Load an A2L definition and binary file to analyze limits</p>
      </div>
    );
  }

  const filteredCategories = analysis.categories.map(cat => ({
    ...cat,
    limits: filterSeverity === 'all'
      ? cat.limits
      : cat.limits.filter(l => l.severity === filterSeverity),
  }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none p-3 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold tracking-wider text-zinc-300 uppercase">Limit Analysis</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-mono">
              {analysis.criticalCount} critical
            </span>
            <span className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-mono">
              {analysis.warningCount} warning
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 font-mono">
              {analysis.totalLimits} total
            </span>
          </div>
        </div>

        {/* Severity filter */}
        <div className="flex gap-1">
          {(['all', 'critical', 'warning'] as const).map(sev => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`flex-1 py-1 text-[10px] font-bold tracking-wider rounded transition-all ${
                filterSeverity === sev
                  ? sev === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : sev === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    : 'bg-zinc-700/50 text-zinc-300 border border-zinc-600'
                  : 'bg-zinc-900/50 text-zinc-500 border border-zinc-800 hover:bg-zinc-800/50'
              }`}
            >
              {sev === 'all' ? 'ALL' : sev.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 overflow-y-auto">
        {filteredCategories.map(cat => (
          <div key={cat.id} className="border-b border-zinc-800/50">
            {/* Category header */}
            <button
              onClick={() => toggleCategory(cat.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/30 transition-colors ${cat.bgColor}`}
            >
              <span className={cat.color}>{cat.icon}</span>
              <span className={`text-xs font-bold tracking-wider ${cat.color}`}>{cat.label}</span>
              <span className="text-[10px] text-zinc-500 ml-auto mr-2">
                {cat.limits.length} {cat.limits.length === 1 ? 'table' : 'tables'}
              </span>
              {expandedCategories.has(cat.id) ? (
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              ) : (
                <ChevronRight className="w-3 h-3 text-zinc-500" />
              )}
            </button>

            {/* Expanded limit list */}
            {expandedCategories.has(cat.id) && cat.limits.length > 0 && (
              <div className="px-2 pb-2">
                <p className="text-[10px] text-zinc-600 px-2 py-1 mb-1">{cat.description}</p>
                {cat.limits.map((limit, idx) => (
                  <LimitRow
                    key={limit.map.name}
                    limit={limit}
                    onJump={() => onJumpToMap?.(limit.mapIndex)}
                    isLast={idx === cat.limits.length - 1}
                  />
                ))}
              </div>
            )}

            {expandedCategories.has(cat.id) && cat.limits.length === 0 && (
              <p className="text-[10px] text-zinc-600 px-5 py-2">
                No {filterSeverity === 'all' ? '' : filterSeverity + ' '}limit tables found in this category
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Footer summary */}
      <div className="flex-none p-2 border-t border-zinc-800 bg-zinc-900/50">
        <p className="text-[10px] text-zinc-500 text-center">
          Analyzing {ecuDef.ecuFamily || 'Unknown ECU'} — {ecuDef.maps.length} total parameters scanned
        </p>
      </div>
    </div>
  );
}

function LimitRow({ limit, onJump, isLast }: { limit: AnalyzedLimit; onJump: () => void; isLast: boolean }) {
  const { map, severity, headroom, insight } = limit;

  const severityStyles = {
    critical: { dot: 'bg-red-500', bar: 'bg-red-500', text: 'text-red-400' },
    warning: { dot: 'bg-yellow-500', bar: 'bg-yellow-500', text: 'text-yellow-400' },
    info: { dot: 'bg-zinc-500', bar: 'bg-zinc-600', text: 'text-zinc-400' },
  };
  const style = severityStyles[severity];

  const displayName = map.friendlyName || map.name;
  const dims = map.type === 'MAP'
    ? `${map.xSize || '?'}×${map.ySize || '?'}`
    : map.type === 'CURVE'
    ? `${map.xSize || '?'} pts`
    : '';

  return (
    <div
      className={`group flex items-start gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/40 cursor-pointer transition-colors ${
        !isLast ? 'mb-0.5' : ''
      }`}
      onClick={onJump}
    >
      {/* Severity dot */}
      <div className={`w-2 h-2 rounded-full mt-1 flex-none ${style.dot}`} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-zinc-300 truncate">{displayName}</span>
          <span className="text-[9px] text-zinc-600 flex-none">{map.type} {dims}</span>
          <ExternalLink className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity flex-none" />
        </div>

        {/* Headroom bar */}
        {headroom !== null && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  headroom < 25 ? 'bg-red-500' : headroom < 50 ? 'bg-yellow-500' : headroom < 75 ? 'bg-blue-500' : 'bg-green-500'
                }`}
                style={{ width: `${headroom}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-zinc-500 flex-none w-8 text-right">
              {headroom}%
            </span>
          </div>
        )}

        {/* Insight */}
        <p className="text-[9px] text-zinc-500 mt-0.5 leading-tight">{insight}</p>
      </div>
    </div>
  );
}
