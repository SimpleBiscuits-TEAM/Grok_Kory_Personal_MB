/**
 * DTC Code Search Component
 * Allows users to search for any DTC code and get a full description,
 * causes, and remedies sourced from GM OBD documentation and Duramax engine management data.
 */

import { useState, useMemo } from 'react';
import { DTC_DEFINITIONS, DtcDefinition, ECU_PARAMETERS, EcuParameter, L5P_SPECS } from '@/lib/ecuReference';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, X, Cpu, Gauge } from 'lucide-react';

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

const categoryLabels: Record<string, string> = {
  fuel_rail: 'Fuel Rail',
  boost_turbo: 'Boost / VGT',
  exhaust_thermal: 'Exhaust / EGT',
  airflow: 'Mass Airflow',
  transmission: 'Transmission',
  engine_speed: 'Engine Speed',
  engine_load: 'Engine Load',
  thermal: 'Thermal',
};

function DtcResult({ dtc, autoExpand = false }: { dtc: DtcDefinition; autoExpand?: boolean }) {
  const [expanded, setExpanded] = useState(autoExpand);
  const cfg = severityConfig[dtc.severity];

  return (
    <div className={`rounded-xl border-2 ${cfg.border} overflow-hidden transition-all duration-200`}>
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
          {expanded ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="bg-white p-4 space-y-4 border-t border-gray-100">
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Description</h4>
            <p className="text-sm text-gray-700 leading-relaxed">{dtc.description}</p>
          </div>

          {dtc.thresholds && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5">Trigger Thresholds</h4>
              <p className="text-sm text-blue-800">{dtc.thresholds}</p>
            </div>
          )}

          {dtc.enableCriteria && (
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Enable Criteria</h4>
              <p className="text-sm text-gray-700">{dtc.enableCriteria}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
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

          {/* ECU Internal ID */}
          {dtc.internalId && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <Cpu className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-400 font-mono">ECU Fault ID: {dtc.internalId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EcuParamResult({ param }: { param: EcuParameter }) {
  const [expanded, setExpanded] = useState(false);
  const catLabel = categoryLabels[param.category] || param.category;

  return (
    <div className="rounded-xl border-2 border-indigo-200 overflow-hidden transition-all duration-200">
      <div
        className="flex items-center justify-between p-4 cursor-pointer bg-indigo-50 hover:brightness-95 transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Gauge className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900 font-mono">{param.internalName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                {catLabel}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                {param.unit}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{param.displayName}</p>
          </div>
        </div>
        <div className="shrink-0 ml-3">
          {expanded ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <div className="bg-white p-4 space-y-3 border-t border-gray-100">
          <p className="text-sm text-gray-700 leading-relaxed">{param.description}</p>

          {/* Operating Ranges */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {param.normalMin !== undefined && param.normalMax !== undefined && (
              <div className="bg-green-50 rounded-lg p-2.5 border border-green-100">
                <p className="text-xs font-bold text-green-700 mb-0.5">Normal Range</p>
                <p className="text-sm text-green-800 font-mono">{param.normalMin} – {param.normalMax} {param.unit}</p>
              </div>
            )}
            {(param.warnMin !== undefined || param.warnMax !== undefined) && (
              <div className="bg-yellow-50 rounded-lg p-2.5 border border-yellow-100">
                <p className="text-xs font-bold text-yellow-700 mb-0.5">Warning Threshold</p>
                <p className="text-sm text-yellow-800 font-mono">
                  {param.warnMin !== undefined ? `${param.warnMin}` : '—'} / {param.warnMax !== undefined ? `${param.warnMax}` : '—'} {param.unit}
                </p>
              </div>
            )}
            {(param.critMin !== undefined || param.critMax !== undefined) && (
              <div className="bg-red-50 rounded-lg p-2.5 border border-red-100">
                <p className="text-xs font-bold text-red-700 mb-0.5">Critical Threshold</p>
                <p className="text-sm text-red-800 font-mono">
                  {param.critMin !== undefined ? `${param.critMin}` : '—'} / {param.critMax !== undefined ? `${param.critMax}` : '—'} {param.unit}
                </p>
              </div>
            )}
          </div>

          {param.ecuAddress && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
              <Cpu className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-400 font-mono">ECU Address: {param.ecuAddress}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DtcSearch({ prefilledCode }: { prefilledCode?: string }) {
  const [query, setQuery] = useState(prefilledCode || '');
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'dtc' | 'params' | 'all'>('all');

  const systems = useMemo(
    () => Array.from(new Set(DTC_DEFINITIONS.map((d) => d.system))),
    []
  );

  const ecuParams = useMemo(() => Object.values(ECU_PARAMETERS), []);

  const dtcResults = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return DTC_DEFINITIONS.filter((dtc) => {
      const matchesQuery =
        dtc.code.includes(q) ||
        dtc.title.toUpperCase().includes(q) ||
        dtc.description.toUpperCase().includes(q) ||
        dtc.system.toUpperCase().includes(q) ||
        (dtc.internalId || '').toUpperCase().includes(q) ||
        (dtc.causes || []).some((c) => c.toUpperCase().includes(q)) ||
        (dtc.remedies || []).some((r) => r.toUpperCase().includes(q));
      const matchesSystem = !activeSystem || dtc.system === activeSystem;
      return matchesQuery && matchesSystem;
    });
  }, [query, activeSystem]);

  const paramResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ecuParams.filter((p) =>
      p.internalName.toLowerCase().includes(q) ||
      p.displayName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.unit.toLowerCase().includes(q) ||
      categoryLabels[p.category]?.toLowerCase().includes(q)
    );
  }, [query, ecuParams]);

  const autoExpand = query.trim().length >= 4 && (dtcResults.length + paramResults.length) <= 3;
  const hasQuery = query.trim().length >= 2;
  const totalResults = dtcResults.length + paramResults.length;

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
              Search by fault code (P0087), keyword (fuel rail, boost), or browse by system
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
            placeholder="Search by code (P0087), parameter name, or keyword (fuel rail, boost leak)..."
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

        {/* Search Mode Tabs */}
        <div className="flex gap-2">
          {(['all', 'dtc', 'params'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSearchMode(mode)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                searchMode === mode
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {mode === 'all' ? 'All Results' : mode === 'dtc' ? 'Fault Codes Only' : 'ECU Parameters Only'}
            </button>
          ))}
        </div>

        {/* System Filter Pills (only for DTC mode) */}
        {(searchMode === 'all' || searchMode === 'dtc') && (
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
        )}

        {/* Empty State — prompt user to type */}
        {!hasQuery && (
          <div className="text-center py-10 text-gray-400">
            <Search className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="font-medium text-gray-500">Enter a fault code or keyword to search</p>
            <p className="text-sm mt-1">Examples: <span className="font-mono text-blue-500">P0087</span>, <span className="font-mono text-blue-500">fuel rail</span>, <span className="font-mono text-blue-500">boost leak</span>, <span className="font-mono text-blue-500">VeFCBR</span></p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['P0087', 'P0088', 'P0299', 'P0101', 'P0234', 'P20EE'].map((code) => (
                <button
                  key={code}
                  onClick={() => setQuery(code)}
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 font-mono transition-colors"
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {hasQuery && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {totalResults === 0 ? 'No results found' : `${totalResults} result${totalResults !== 1 ? 's' : ''} found`}
              </p>
              {(query || activeSystem) && (
                <button
                  onClick={() => { setQuery(''); setActiveSystem(null); }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="space-y-4">
              {totalResults === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="font-medium">No codes or parameters found</p>
                  <p className="text-sm mt-1">Try a different code or keyword</p>
                </div>
              ) : (
                <>
                  {/* DTC Results — grouped by subsystem */}
                  {(searchMode === 'all' || searchMode === 'dtc') && dtcResults.length > 0 && (() => {
                    // Group by system
                    const grouped: Record<string, typeof dtcResults> = {};
                    dtcResults.forEach(dtc => {
                      if (!grouped[dtc.system]) grouped[dtc.system] = [];
                      grouped[dtc.system].push(dtc);
                    });
                    const systemOrder = [
                      'Fuel System', 'Air System', 'EGT Sensors', 'EGR System',
                      'DPF System', 'SCR / DEF System',
                    ];
                    const sortedSystems = Object.keys(grouped).sort(
                      (a, b) => (systemOrder.indexOf(a) === -1 ? 99 : systemOrder.indexOf(a))
                               - (systemOrder.indexOf(b) === -1 ? 99 : systemOrder.indexOf(b))
                    );
                    return (
                      <div className="space-y-5">
                        {searchMode === 'all' && paramResults.length > 0 && (
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fault Codes ({dtcResults.length})</p>
                        )}
                        {sortedSystems.map(sys => (
                          <div key={sys}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${systemColors[sys] || 'bg-gray-100 text-gray-700'}`}>{sys}</span>
                              <span className="text-xs text-gray-400">{grouped[sys].length} code{grouped[sys].length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="space-y-2 pl-1">
                              {grouped[sys].map(dtc => (
                                <DtcResult key={dtc.code} dtc={dtc} autoExpand={autoExpand} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* ECU Parameter Results */}
                  {(searchMode === 'all' || searchMode === 'params') && paramResults.length > 0 && (
                    <div className="space-y-3">
                      {searchMode === 'all' && dtcResults.length > 0 && (
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-4">ECU Parameters ({paramResults.length})</p>
                      )}
                      {paramResults.map((param) => (
                        <EcuParamResult key={param.internalName} param={param} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Disclaimer */}
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mt-2">
          <p className="text-xs text-gray-500 leading-relaxed">
            Covers 2017–2023 L5P 6.6L Duramax. Verify with live scan data before performing repairs.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
