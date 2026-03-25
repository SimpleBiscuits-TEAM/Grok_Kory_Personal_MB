/**
 * DTC Code Search Component
 * Allows users to search for any DTC code and get a full description,
 * causes, and remedies sourced from the Duramax engine calibration database.
 */

import { useState, useMemo } from 'react';
import { DTC_DEFINITIONS, DtcDefinition } from '@/lib/ecuReference';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, X } from 'lucide-react';

const severityConfig = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-800 border-red-200',
    icon: <AlertCircle className="w-4 h-4 text-red-600" />,
    label: 'Critical',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
    label: 'Warning',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: <Info className="w-4 h-4 text-blue-600" />,
    label: 'Info',
  },
};

const systemColors: Record<string, string> = {
  'Fuel System': 'bg-blue-100 text-blue-700',
  'Air System': 'bg-teal-100 text-teal-700',
  'DPF System': 'bg-orange-100 text-orange-700',
  'SCR / DEF System': 'bg-green-100 text-green-700',
  'EGR System': 'bg-purple-100 text-purple-700',
  'EGT Sensors': 'bg-red-100 text-red-700',
};

function DtcResult({ dtc, autoExpand = false }: { dtc: DtcDefinition; autoExpand?: boolean }) {
  const [expanded, setExpanded] = useState(autoExpand);
  const cfg = severityConfig[dtc.severity];

  return (
    <div
      className={`rounded-xl border-2 ${cfg.border} overflow-hidden transition-all duration-200`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between p-4 cursor-pointer ${cfg.bg} hover:brightness-95 transition-all`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {cfg.icon}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-gray-900 font-mono">{dtc.code}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.badge}`}>
                {cfg.label}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${systemColors[dtc.system] || 'bg-gray-100 text-gray-700'}`}>
                {dtc.system}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{dtc.title}</p>
          </div>
        </div>
        <div className="shrink-0 ml-3">
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="bg-white p-4 space-y-4 border-t border-gray-100">
          {/* Description */}
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Description</h4>
            <p className="text-sm text-gray-700 leading-relaxed">{dtc.description}</p>
          </div>

          {/* Thresholds */}
          {dtc.thresholds && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">Trigger Thresholds</h4>
              <p className="text-sm text-blue-800">{dtc.thresholds}</p>
            </div>
          )}

          {/* Enable Criteria */}
          {dtc.enableCriteria && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Enable Criteria</h4>
              <p className="text-sm text-gray-700">{dtc.enableCriteria}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* Causes */}
            {dtc.causes && dtc.causes.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-orange-500" />
                  Common Causes
                </h4>
                <ul className="space-y-1.5">
                  {dtc.causes.map((cause, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-orange-400 shrink-0 mt-0.5">•</span>
                      <span>{cause}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Remedies */}
            {dtc.remedies && dtc.remedies.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="text-green-500">✓</span>
                  Recommended Remedies
                </h4>
                <ul className="space-y-1.5">
                  {dtc.remedies.map((remedy, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                      <span>{remedy}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DtcSearch() {
  const [query, setQuery] = useState('');
  const [activeSystem, setActiveSystem] = useState<string | null>(null);

  const systems = useMemo(
    () => Array.from(new Set(DTC_DEFINITIONS.map((d) => d.system))),
    []
  );

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    return DTC_DEFINITIONS.filter((dtc) => {
      const matchesQuery =
        !q ||
        dtc.code.includes(q) ||
        dtc.title.toUpperCase().includes(q) ||
        dtc.description.toUpperCase().includes(q) ||
        dtc.system.toUpperCase().includes(q) ||
        (dtc.causes || []).some((c) => c.toUpperCase().includes(q)) ||
        (dtc.remedies || []).some((r) => r.toUpperCase().includes(q));

      const matchesSystem = !activeSystem || dtc.system === activeSystem;

      return matchesQuery && matchesSystem;
    });
  }, [query, activeSystem]);

  const autoExpand = query.trim().length >= 4 && results.length <= 3;

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Search className="w-4 h-4 text-white" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-gray-900">Diagnostic Code Lookup</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Search any DTC code for descriptions, causes, and step-by-step remedies
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by code (e.g. P0087), keyword (e.g. fuel rail), or symptom..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9 h-11 text-sm border-gray-300 focus:border-blue-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* System Filter Pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSystem(null)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              !activeSystem
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            All Systems
          </button>
          {systems.map((sys) => (
            <button
              key={sys}
              onClick={() => setActiveSystem(activeSystem === sys ? null : sys)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                activeSystem === sys
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {sys}
            </button>
          ))}
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {results.length === DTC_DEFINITIONS.length
              ? `Showing all ${DTC_DEFINITIONS.length} codes`
              : `${results.length} result${results.length !== 1 ? 's' : ''} found`}
          </p>
          {(query || activeSystem) && (
            <button
              onClick={() => { setQuery(''); setActiveSystem(null); }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Results */}
        <div className="space-y-3">
          {results.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No codes found</p>
              <p className="text-sm mt-1">Try a different code or keyword</p>
            </div>
          ) : (
            results.map((dtc) => (
              <DtcResult key={dtc.code} dtc={dtc} autoExpand={autoExpand} />
            ))
          )}
        </div>

        {/* Footer Note */}
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mt-2">
          <p className="text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-600">Note:</strong> Thresholds and enable criteria are based on observed real-world data from 2017–2023 L5P trucks,
            GM TechLink bulletins, and GDS2 service information. Exact ECM calibration values may vary by
            model year and software revision. Always verify with a scan tool and live data.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
