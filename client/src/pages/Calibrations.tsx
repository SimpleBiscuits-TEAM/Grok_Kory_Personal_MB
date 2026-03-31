/**
 * FCA Calibration Supersession Database — Search & Lookup
 * 17,912 calibration records from Stellantis (August 2025)
 * Covers PCM, TCM, ECM, BCM, ABS, IPC, HVAC, ORC, EPS, PM modules
 * 126,734 old part numbers, 44,246 TSBs, 11,240 recalls
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import PpeiHeader from '@/components/PpeiHeader';
import { Search, Database, Filter, ChevronDown, ChevronUp, ExternalLink, Hash, Calendar, Cpu, FileText, AlertTriangle, ArrowRight, X, Loader2, Info } from 'lucide-react';

const sFont = {
  heading: '"Bebas Neue", "Impact", "Arial Black", sans-serif',
  body: '"Rajdhani", "Segoe UI", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

const sColor = {
  red: 'oklch(0.52 0.22 25)',
  bg: '#0a0a0a',
  panelBg: 'oklch(0.12 0.005 260)',
  border: 'oklch(0.20 0.008 260)',
  textDim: 'oklch(0.60 0.010 260)',
  textMuted: 'oklch(0.50 0.010 260)',
  accent: 'oklch(0.52 0.22 25)',
  accentDim: 'oklch(0.52 0.22 25 / 0.15)',
  green: 'oklch(0.72 0.19 145)',
  yellow: 'oklch(0.80 0.18 85)',
  blue: 'oklch(0.65 0.15 250)',
};

// Module type badge colors
const moduleColors: Record<string, string> = {
  PCM: 'oklch(0.52 0.22 25)',
  TCM: 'oklch(0.65 0.15 250)',
  ECM: 'oklch(0.72 0.19 145)',
  BCM: 'oklch(0.70 0.15 60)',
  ABS: 'oklch(0.65 0.18 330)',
  IPC: 'oklch(0.60 0.15 200)',
  HVAC: 'oklch(0.55 0.12 180)',
  ORC: 'oklch(0.60 0.20 50)',
  EPS: 'oklch(0.58 0.15 290)',
  PM: 'oklch(0.65 0.12 100)',
};

function ModuleBadge({ type }: { type: string }) {
  const color = moduleColors[type] || sColor.textDim;
  return (
    <span style={{
      fontFamily: sFont.mono,
      fontSize: '0.65rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: color,
      background: `color-mix(in oklch, ${color} 15%, transparent)`,
      border: `1px solid color-mix(in oklch, ${color} 30%, transparent)`,
      padding: '2px 8px',
      borderRadius: '3px',
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div style={{
      background: sColor.panelBg,
      border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${color}`,
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    }}>
      <Icon size={22} style={{ color, flexShrink: 0 }} />
      <div>
        <div style={{
          fontFamily: sFont.mono,
          fontSize: '1.3rem',
          color: 'white',
          fontWeight: 700,
          lineHeight: 1.1,
        }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div style={{
          fontFamily: sFont.body,
          fontSize: '0.72rem',
          color: sColor.textDim,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginTop: '2px',
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

interface CalibrationRecord {
  id: number;
  calibration: string;
  moduleType: string;
  newPartNumber: string;
  oldPartNumbers: string[];
  tsbs: string[];
  recalls: string[];
  yearStart: number | null;
  yearEnd: number | null;
  platformCodes: string | null;
}

function CalibrationRow({ record, expanded, onToggle }: { record: CalibrationRecord; expanded: boolean; onToggle: () => void }) {
  const oldParts = Array.isArray(record.oldPartNumbers) ? record.oldPartNumbers : [];
  const tsbs = Array.isArray(record.tsbs) ? record.tsbs : [];
  const recalls = Array.isArray(record.recalls) ? record.recalls : [];
  const yearRange = record.yearStart && record.yearEnd
    ? record.yearStart === record.yearEnd
      ? `${record.yearStart}`
      : `${record.yearStart}-${record.yearEnd}`
    : null;

  return (
    <div style={{
      background: expanded ? 'oklch(0.14 0.008 260)' : sColor.panelBg,
      border: `1px solid ${expanded ? sColor.accent : sColor.border}`,
      borderLeft: `3px solid ${expanded ? sColor.accent : moduleColors[record.moduleType] || sColor.border}`,
      marginBottom: '6px',
      transition: 'all 0.15s ease',
    }}>
      {/* Summary row */}
      <div
        onClick={onToggle}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <ModuleBadge type={record.moduleType} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: sFont.mono,
            fontSize: '0.82rem',
            color: 'white',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: expanded ? 'normal' : 'nowrap',
          }}>
            {record.newPartNumber}
          </div>
          <div style={{
            fontFamily: sFont.body,
            fontSize: '0.72rem',
            color: sColor.textDim,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: expanded ? 'normal' : 'nowrap',
            marginTop: '2px',
          }}>
            {record.calibration}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {yearRange && (
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.65rem',
              color: sColor.blue,
              background: 'oklch(0.65 0.15 250 / 0.12)',
              padding: '2px 6px',
              borderRadius: '2px',
            }}>
              {yearRange}
            </span>
          )}
          {oldParts.length > 0 && (
            <span style={{
              fontFamily: sFont.mono,
              fontSize: '0.6rem',
              color: sColor.textMuted,
            }}>
              {oldParts.length} old PN{oldParts.length !== 1 ? 's' : ''}
            </span>
          )}
          {recalls.length > 0 && (
            <AlertTriangle size={14} style={{ color: sColor.yellow }} />
          )}
          {expanded ? <ChevronUp size={16} style={{ color: sColor.textDim }} /> : <ChevronDown size={16} style={{ color: sColor.textDim }} />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          padding: '0 16px 16px',
          borderTop: `1px solid ${sColor.border}`,
          paddingTop: '12px',
        }}>
          {/* Supersession chain */}
          {oldParts.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                fontFamily: sFont.mono,
                fontSize: '0.65rem',
                color: sColor.accent,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}>
                SUPERSESSION CHAIN ({oldParts.length} part{oldParts.length !== 1 ? 's' : ''})
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                alignItems: 'center',
              }}>
                {oldParts.map((pn, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      fontFamily: sFont.mono,
                      fontSize: '0.7rem',
                      color: sColor.textDim,
                      background: 'oklch(0.18 0.005 260)',
                      padding: '2px 6px',
                      borderRadius: '2px',
                      border: `1px solid ${sColor.border}`,
                    }}>
                      {pn}
                    </span>
                    {i < oldParts.length - 1 && (
                      <ArrowRight size={10} style={{ color: sColor.textMuted }} />
                    )}
                  </span>
                ))}
                <ArrowRight size={12} style={{ color: sColor.accent }} />
                <span style={{
                  fontFamily: sFont.mono,
                  fontSize: '0.72rem',
                  color: sColor.green,
                  fontWeight: 700,
                  background: 'oklch(0.72 0.19 145 / 0.12)',
                  padding: '2px 8px',
                  borderRadius: '2px',
                  border: `1px solid oklch(0.72 0.19 145 / 0.3)`,
                }}>
                  {record.newPartNumber} (CURRENT)
                </span>
              </div>
            </div>
          )}

          {/* TSBs */}
          {tsbs.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{
                fontFamily: sFont.mono,
                fontSize: '0.65rem',
                color: sColor.yellow,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}>
                TECHNICAL SERVICE BULLETINS ({tsbs.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {tsbs.slice(0, 20).map((tsb, i) => (
                  <span key={i} style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                    color: sColor.yellow,
                    background: 'oklch(0.80 0.18 85 / 0.1)',
                    padding: '1px 5px',
                    borderRadius: '2px',
                    border: '1px solid oklch(0.80 0.18 85 / 0.2)',
                  }}>
                    {tsb}
                  </span>
                ))}
                {tsbs.length > 20 && (
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted }}>
                    +{tsbs.length - 20} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Recalls */}
          {recalls.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{
                fontFamily: sFont.mono,
                fontSize: '0.65rem',
                color: sColor.accent,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}>
                RECALL CAMPAIGNS ({recalls.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {recalls.map((recall, i) => (
                  <span key={i} style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                    color: sColor.accent,
                    background: sColor.accentDim,
                    padding: '1px 5px',
                    borderRadius: '2px',
                    border: `1px solid oklch(0.52 0.22 25 / 0.3)`,
                  }}>
                    {recall}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Platform codes */}
          {record.platformCodes && (
            <div>
              <div style={{
                fontFamily: sFont.mono,
                fontSize: '0.65rem',
                color: sColor.textMuted,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}>
                PLATFORM CODES
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {record.platformCodes.split(',').map((code, i) => (
                  <span key={i} style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                    color: sColor.textDim,
                    background: 'oklch(0.16 0.005 260)',
                    padding: '1px 5px',
                    borderRadius: '2px',
                    border: `1px solid ${sColor.border}`,
                  }}>
                    {code.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Calibrations() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [yearStart, setYearStart] = useState('');
  const [yearEnd, setYearEnd] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [partNumberLookup, setPartNumberLookup] = useState('');
  const [lookupMode, setLookupMode] = useState(false);
  const PAGE_SIZE = 50;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [debouncedQuery, moduleFilter, yearStart, yearEnd]);

  const { data: filterOptions } = trpc.calibrations.filterOptions.useQuery();

  const searchInput = useMemo(() => ({
    query: debouncedQuery || undefined,
    moduleType: moduleFilter || undefined,
    yearStart: yearStart ? parseInt(yearStart) : undefined,
    yearEnd: yearEnd ? parseInt(yearEnd) : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [debouncedQuery, moduleFilter, yearStart, yearEnd, page]);

  const { data: searchResults, isLoading } = trpc.calibrations.search.useQuery(searchInput);

  const { data: lookupResults, isLoading: lookupLoading } = trpc.calibrations.lookupPartNumber.useQuery(
    { partNumber: partNumberLookup },
    { enabled: lookupMode && partNumberLookup.length >= 3 }
  );

  const totalPages = searchResults ? Math.ceil(searchResults.total / PAGE_SIZE) : 0;

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setModuleFilter('');
    setYearStart('');
    setYearEnd('');
    setPage(0);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: sColor.bg, color: 'white' }}>
      <PpeiHeader />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Title */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Database size={28} style={{ color: sColor.accent }} />
            <h1 style={{
              fontFamily: sFont.heading,
              fontSize: '2rem',
              letterSpacing: '0.06em',
              color: 'white',
              margin: 0,
            }}>
              FCA CALIBRATION DATABASE
            </h1>
          </div>
          <p style={{
            fontFamily: sFont.body,
            fontSize: '0.85rem',
            color: sColor.textDim,
            margin: 0,
            maxWidth: '700px',
          }}>
            Stellantis calibration supersession database (August 2025). Search {filterOptions?.totalRecords?.toLocaleString() || '17,912'} calibration records
            covering PCM, TCM, ECM, BCM, and more. Find current part numbers, supersession chains, TSBs, and recall campaigns.
          </p>
        </div>

        {/* Stats row */}
        {filterOptions && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '8px',
            marginBottom: '20px',
          }}>
            <StatCard label="Total Calibrations" value={filterOptions.totalRecords} icon={Database} color={sColor.accent} />
            <StatCard label="Module Types" value={filterOptions.moduleTypes.length} icon={Cpu} color={sColor.blue} />
            <StatCard
              label="Year Range"
              value={filterOptions.yearRange.min && filterOptions.yearRange.max ? `${filterOptions.yearRange.min}-${filterOptions.yearRange.max}` : 'N/A'}
              icon={Calendar}
              color={sColor.green}
            />
            <StatCard label="PCM Records" value={filterOptions.moduleTypes.find(m => m.type === 'PCM')?.count || 0} icon={FileText} color={sColor.yellow} />
          </div>
        )}

        {/* Mode toggle: Search vs Part Number Lookup */}
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: '16px',
        }}>
          <button
            onClick={() => setLookupMode(false)}
            style={{
              fontFamily: sFont.mono,
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              padding: '8px 20px',
              background: !lookupMode ? sColor.accent : 'transparent',
              color: !lookupMode ? 'white' : sColor.textDim,
              border: `1px solid ${!lookupMode ? sColor.accent : sColor.border}`,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            SEARCH DATABASE
          </button>
          <button
            onClick={() => setLookupMode(true)}
            style={{
              fontFamily: sFont.mono,
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              padding: '8px 20px',
              background: lookupMode ? sColor.accent : 'transparent',
              color: lookupMode ? 'white' : sColor.textDim,
              border: `1px solid ${lookupMode ? sColor.accent : sColor.border}`,
              borderLeft: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            PART NUMBER LOOKUP
          </button>
        </div>

        {/* Part Number Lookup Mode */}
        {lookupMode && (
          <div style={{
            background: sColor.panelBg,
            border: `1px solid ${sColor.border}`,
            borderLeft: `3px solid ${sColor.accent}`,
            padding: '20px',
            marginBottom: '20px',
          }}>
            <div style={{
              fontFamily: sFont.mono,
              fontSize: '0.7rem',
              color: sColor.accent,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}>
              ENTER PART NUMBER TO FIND SUPERSESSION CHAIN
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Hash size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sColor.textMuted }} />
                <input
                  type="text"
                  value={partNumberLookup}
                  onChange={(e) => setPartNumberLookup(e.target.value.toUpperCase())}
                  placeholder="e.g. 68312345AA"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    fontFamily: sFont.mono,
                    fontSize: '0.85rem',
                    background: 'oklch(0.10 0.005 260)',
                    border: `1px solid ${sColor.border}`,
                    color: 'white',
                    outline: 'none',
                  }}
                />
              </div>
              {partNumberLookup && (
                <button
                  onClick={() => setPartNumberLookup('')}
                  style={{
                    padding: '0 12px',
                    background: 'transparent',
                    border: `1px solid ${sColor.border}`,
                    color: sColor.textDim,
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {lookupLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                <Loader2 size={16} style={{ color: sColor.accent, animation: 'spin 1s linear infinite' }} />
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>Searching...</span>
              </div>
            )}

            {lookupResults && lookupResults.length === 0 && partNumberLookup.length >= 3 && !lookupLoading && (
              <div style={{
                marginTop: '12px',
                fontFamily: sFont.body,
                fontSize: '0.8rem',
                color: sColor.textMuted,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <Info size={14} />
                No calibration records found for part number "{partNumberLookup}"
              </div>
            )}

            {lookupResults && lookupResults.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  fontFamily: sFont.mono,
                  fontSize: '0.65rem',
                  color: sColor.green,
                  letterSpacing: '0.08em',
                  marginBottom: '8px',
                }}>
                  FOUND {lookupResults.length} MATCHING RECORD{lookupResults.length !== 1 ? 'S' : ''}
                </div>
                {(lookupResults as CalibrationRecord[]).map((r) => (
                  <CalibrationRow
                    key={r.id}
                    record={r}
                    expanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search Mode */}
        {!lookupMode && (
          <>
            {/* Search bar */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '12px',
            }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: sColor.textMuted }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by description, part number, or keyword..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    fontFamily: sFont.body,
                    fontSize: '0.85rem',
                    background: sColor.panelBg,
                    border: `1px solid ${sColor.border}`,
                    color: 'white',
                    outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 16px',
                  fontFamily: sFont.mono,
                  fontSize: '0.7rem',
                  letterSpacing: '0.08em',
                  background: showFilters ? sColor.accentDim : 'transparent',
                  border: `1px solid ${showFilters ? sColor.accent : sColor.border}`,
                  color: showFilters ? sColor.accent : sColor.textDim,
                  cursor: 'pointer',
                }}
              >
                <Filter size={14} />
                FILTERS
              </button>
              {(moduleFilter || yearStart || yearEnd) && (
                <button
                  onClick={handleClearFilters}
                  style={{
                    padding: '0 12px',
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                    background: 'transparent',
                    border: `1px solid ${sColor.border}`,
                    color: sColor.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  CLEAR
                </button>
              )}
            </div>

            {/* Filter panel */}
            {showFilters && (
              <div style={{
                background: sColor.panelBg,
                border: `1px solid ${sColor.border}`,
                padding: '16px',
                marginBottom: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
              }}>
                {/* Module type */}
                <div>
                  <label style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.6rem',
                    color: sColor.textMuted,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '4px',
                  }}>
                    MODULE TYPE
                  </label>
                  <select
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontFamily: sFont.mono,
                      fontSize: '0.75rem',
                      background: 'oklch(0.10 0.005 260)',
                      border: `1px solid ${sColor.border}`,
                      color: 'white',
                      outline: 'none',
                    }}
                  >
                    <option value="">All Types</option>
                    {filterOptions?.moduleTypes.map((m) => (
                      <option key={m.type} value={m.type}>
                        {m.type} ({m.count.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year range */}
                <div>
                  <label style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.6rem',
                    color: sColor.textMuted,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '4px',
                  }}>
                    YEAR RANGE
                  </label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={yearStart}
                      onChange={(e) => setYearStart(e.target.value)}
                      placeholder="From"
                      min={1990}
                      max={2030}
                      style={{
                        width: '80px',
                        padding: '8px',
                        fontFamily: sFont.mono,
                        fontSize: '0.75rem',
                        background: 'oklch(0.10 0.005 260)',
                        border: `1px solid ${sColor.border}`,
                        color: 'white',
                        outline: 'none',
                      }}
                    />
                    <span style={{ color: sColor.textMuted, fontFamily: sFont.mono, fontSize: '0.7rem' }}>to</span>
                    <input
                      type="number"
                      value={yearEnd}
                      onChange={(e) => setYearEnd(e.target.value)}
                      placeholder="To"
                      min={1990}
                      max={2030}
                      style={{
                        width: '80px',
                        padding: '8px',
                        fontFamily: sFont.mono,
                        fontSize: '0.75rem',
                        background: 'oklch(0.10 0.005 260)',
                        border: `1px solid ${sColor.border}`,
                        color: 'white',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Results header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}>
              <span style={{
                fontFamily: sFont.mono,
                fontSize: '0.68rem',
                color: sColor.textMuted,
                letterSpacing: '0.06em',
              }}>
                {isLoading ? 'Searching...' : `${searchResults?.total.toLocaleString() || 0} results`}
                {debouncedQuery && ` for "${debouncedQuery}"`}
                {moduleFilter && ` | ${moduleFilter}`}
              </span>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    style={{
                      padding: '4px 10px',
                      fontFamily: sFont.mono,
                      fontSize: '0.65rem',
                      background: 'transparent',
                      border: `1px solid ${sColor.border}`,
                      color: page === 0 ? sColor.textMuted : sColor.textDim,
                      cursor: page === 0 ? 'default' : 'pointer',
                      opacity: page === 0 ? 0.5 : 1,
                    }}
                  >
                    PREV
                  </button>
                  <span style={{
                    fontFamily: sFont.mono,
                    fontSize: '0.65rem',
                    color: sColor.textDim,
                    padding: '0 8px',
                  }}>
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page >= totalPages - 1}
                    style={{
                      padding: '4px 10px',
                      fontFamily: sFont.mono,
                      fontSize: '0.65rem',
                      background: 'transparent',
                      border: `1px solid ${sColor.border}`,
                      color: page >= totalPages - 1 ? sColor.textMuted : sColor.textDim,
                      cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                      opacity: page >= totalPages - 1 ? 0.5 : 1,
                    }}
                  >
                    NEXT
                  </button>
                </div>
              )}
            </div>

            {/* Loading state */}
            {isLoading && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '40px',
              }}>
                <Loader2 size={20} style={{ color: sColor.accent, animation: 'spin 1s linear infinite' }} />
                <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim }}>
                  Searching {filterOptions?.totalRecords?.toLocaleString() || '17,912'} calibrations...
                </span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {/* Results list */}
            {!isLoading && searchResults?.results && (
              <div>
                {searchResults.results.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px',
                    fontFamily: sFont.body,
                    color: sColor.textMuted,
                  }}>
                    <Database size={32} style={{ color: sColor.border, marginBottom: '12px' }} />
                    <div style={{ fontSize: '0.9rem' }}>No calibrations found</div>
                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Try adjusting your search terms or filters</div>
                  </div>
                ) : (
                  (searchResults.results as CalibrationRecord[]).map((record) => (
                    <CalibrationRow
                      key={record.id}
                      record={record}
                      expanded={expandedId === record.id}
                      onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    />
                  ))
                )}
              </div>
            )}

            {/* Bottom pagination */}
            {totalPages > 1 && !isLoading && (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '4px',
                marginTop: '16px',
                paddingBottom: '32px',
              }}>
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  style={{
                    padding: '6px 16px',
                    fontFamily: sFont.mono,
                    fontSize: '0.7rem',
                    background: 'transparent',
                    border: `1px solid ${sColor.border}`,
                    color: page === 0 ? sColor.textMuted : sColor.textDim,
                    cursor: page === 0 ? 'default' : 'pointer',
                    opacity: page === 0 ? 0.5 : 1,
                  }}
                >
                  PREV
                </button>
                <span style={{
                  fontFamily: sFont.mono,
                  fontSize: '0.7rem',
                  color: sColor.textDim,
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  PAGE {page + 1} OF {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  style={{
                    padding: '6px 16px',
                    fontFamily: sFont.mono,
                    fontSize: '0.7rem',
                    background: 'transparent',
                    border: `1px solid ${sColor.border}`,
                    color: page >= totalPages - 1 ? sColor.textMuted : sColor.textDim,
                    cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                    opacity: page >= totalPages - 1 ? 0.5 : 1,
                  }}
                >
                  NEXT
                </button>
              </div>
            )}
          </>
        )}

        {/* Source attribution */}
        <div style={{
          marginTop: '24px',
          padding: '12px 16px',
          background: sColor.panelBg,
          border: `1px solid ${sColor.border}`,
          fontFamily: sFont.mono,
          fontSize: '0.6rem',
          color: sColor.textMuted,
          letterSpacing: '0.04em',
        }}>
          Source: Stellantis FCA Calibration Supersession Report (August 8, 2025) | 1,855 pages parsed |
          {' '}{filterOptions?.totalRecords?.toLocaleString() || '17,912'} calibration records |
          {' '}126,734 old part numbers | 44,246 TSBs | 11,240 recalls
        </div>
      </div>
    </div>
  );
}
