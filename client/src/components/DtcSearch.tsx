/**
 * PPEI Custom Tuning — DTC Code Search Component
 * Dark theme: black bg, red/amber/cyan severity indicators
 * Typography: Bebas Neue headings, Rajdhani body, Share Tech Mono for codes
 */

import { useState, useMemo } from 'react';
import { DTC_DEFINITIONS, DtcDefinition, ECU_PARAMETERS, EcuParameter } from '@/lib/ecuReference';
import { Search, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, X, Cpu, Gauge } from 'lucide-react';

const severityConfig = {
  critical: {
    borderColor: 'oklch(0.52 0.22 25)',
    badgeBg: 'oklch(0.52 0.22 25 / 0.15)',
    badgeBorder: 'oklch(0.52 0.22 25 / 0.4)',
    badgeColor: 'oklch(0.75 0.18 25)',
    icon: <AlertCircle style={{ width: '16px', height: '16px', color: 'oklch(0.52 0.22 25)' }} />,
    label: 'Critical',
  },
  warning: {
    borderColor: 'oklch(0.75 0.18 60)',
    badgeBg: 'oklch(0.75 0.18 60 / 0.15)',
    badgeBorder: 'oklch(0.75 0.18 60 / 0.4)',
    badgeColor: 'oklch(0.80 0.18 60)',
    icon: <AlertTriangle style={{ width: '16px', height: '16px', color: 'oklch(0.75 0.18 60)' }} />,
    label: 'Warning',
  },
  info: {
    borderColor: 'oklch(0.70 0.18 200)',
    badgeBg: 'oklch(0.70 0.18 200 / 0.15)',
    badgeBorder: 'oklch(0.70 0.18 200 / 0.4)',
    badgeColor: 'oklch(0.70 0.18 200)',
    icon: <Info style={{ width: '16px', height: '16px', color: 'oklch(0.70 0.18 200)' }} />,
    label: 'Info',
  },
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

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '2px',
      fontFamily: '"Rajdhani", sans-serif',
      fontSize: '0.72rem',
      fontWeight: 600,
      letterSpacing: '0.04em',
      background: `${color}22`,
      border: `1px solid ${color}44`,
      color
    }}>{label}</span>
  );
}

function DtcResult({ dtc, autoExpand = false }: { dtc: DtcDefinition; autoExpand?: boolean }) {
  const [expanded, setExpanded] = useState(autoExpand);
  const cfg = severityConfig[dtc.severity];

  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: `1px solid oklch(0.22 0.008 260)`,
      borderLeft: `3px solid ${cfg.borderColor}`,
      borderRadius: '3px',
      overflow: 'hidden',
      transition: 'all 0.15s'
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          cursor: 'pointer',
          background: expanded ? 'oklch(0.15 0.007 260)' : 'transparent'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {cfg.icon}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.95rem', fontWeight: 'bold', color: 'white' }}>{dtc.code}</span>
              <span style={{
                padding: '1px 8px',
                borderRadius: '2px',
                fontFamily: '"Rajdhani", sans-serif',
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.05em',
                background: cfg.badgeBg,
                border: `1px solid ${cfg.badgeBorder}`,
                color: cfg.badgeColor
              }}>{cfg.label.toUpperCase()}</span>
              <Pill label={dtc.system} color="oklch(0.70 0.18 200)" />
            </div>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', fontWeight: 600, color: 'oklch(0.75 0.010 260)', margin: 0, marginTop: '2px' }}>{dtc.title}</p>
          </div>
        </div>
        <div style={{ flexShrink: 0, marginLeft: '12px' }}>
          {expanded
            ? <ChevronDown style={{ width: '18px', height: '18px', color: 'oklch(0.50 0.010 260)' }} />
            : <ChevronRight style={{ width: '18px', height: '18px', color: 'oklch(0.50 0.010 260)' }} />
          }
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div style={{ background: 'oklch(0.11 0.005 260)', padding: '12px 14px', borderTop: '1px solid oklch(0.20 0.006 260)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.45 0.010 260)', margin: 0, marginBottom: '6px' }}>DESCRIPTION</h4>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.88rem', color: 'oklch(0.70 0.010 260)', margin: 0, lineHeight: 1.6 }}>{dtc.description}</p>
          </div>

          {dtc.thresholds && (
            <div style={{ background: 'oklch(0.70 0.18 200 / 0.08)', border: '1px solid oklch(0.70 0.18 200 / 0.25)', borderRadius: '2px', padding: '10px 12px' }}>
              <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.70 0.18 200)', margin: 0, marginBottom: '4px' }}>TRIGGER THRESHOLDS</h4>
              <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.8rem', color: 'oklch(0.75 0.010 260)', margin: 0 }}>{dtc.thresholds}</p>
            </div>
          )}

          {dtc.enableCriteria && (
            <div style={{ background: 'oklch(0.14 0.006 260)', border: '1px solid oklch(0.22 0.008 260)', borderRadius: '2px', padding: '10px 12px' }}>
              <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.50 0.010 260)', margin: 0, marginBottom: '4px' }}>ENABLE CRITERIA</h4>
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)', margin: 0 }}>{dtc.enableCriteria}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {dtc.causes && dtc.causes.length > 0 && (
              <div>
                <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.75 0.18 40)', margin: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle style={{ width: '12px', height: '12px' }} />
                  COMMON CAUSES
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {dtc.causes.map((cause, i) => (
                    <li key={i} style={{ display: 'flex', gap: '8px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)' }}>
                      <span style={{ color: 'oklch(0.75 0.18 40)', flexShrink: 0 }}>•</span>
                      <span>{cause}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {dtc.remedies && dtc.remedies.length > 0 && (
              <div>
                <h4 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.72rem', letterSpacing: '0.1em', color: 'oklch(0.65 0.20 145)', margin: 0, marginBottom: '8px' }}>
                  RECOMMENDED REMEDIES
                </h4>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {dtc.remedies.map((remedy, i) => (
                    <li key={i} style={{ display: 'flex', gap: '8px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.65 0.010 260)' }}>
                      <span style={{ color: 'oklch(0.65 0.20 145)', flexShrink: 0 }}>✓</span>
                      <span>{remedy}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {dtc.internalId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid oklch(0.20 0.006 260)' }}>
              <Cpu style={{ width: '12px', height: '12px', color: 'oklch(0.40 0.008 260)' }} />
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.40 0.008 260)' }}>ECU Fault ID: {dtc.internalId}</span>
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
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderLeft: '3px solid oklch(0.70 0.20 300)',
      borderRadius: '3px',
      overflow: 'hidden'
    }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', background: expanded ? 'oklch(0.15 0.007 260)' : 'transparent' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Gauge style={{ width: '16px', height: '16px', color: 'oklch(0.70 0.20 300)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.85rem', fontWeight: 'bold', color: 'white' }}>{param.internalName}</span>
              <Pill label={catLabel} color="oklch(0.70 0.20 300)" />
              <Pill label={param.unit} color="oklch(0.55 0.010 260)" />
            </div>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', fontWeight: 600, color: 'oklch(0.75 0.010 260)', margin: 0, marginTop: '2px' }}>{param.displayName}</p>
          </div>
        </div>
        <div style={{ flexShrink: 0, marginLeft: '12px' }}>
          {expanded
            ? <ChevronDown style={{ width: '18px', height: '18px', color: 'oklch(0.50 0.010 260)' }} />
            : <ChevronRight style={{ width: '18px', height: '18px', color: 'oklch(0.50 0.010 260)' }} />
          }
        </div>
      </div>

      {expanded && (
        <div style={{ background: 'oklch(0.11 0.005 260)', padding: '12px 14px', borderTop: '1px solid oklch(0.20 0.006 260)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.88rem', color: 'oklch(0.70 0.010 260)', margin: 0, lineHeight: 1.6 }}>{param.description}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {param.normalMin !== undefined && param.normalMax !== undefined && (
              <div style={{ background: 'oklch(0.65 0.20 145 / 0.1)', border: '1px solid oklch(0.65 0.20 145 / 0.3)', borderRadius: '2px', padding: '8px 10px' }}>
                <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.7rem', letterSpacing: '0.08em', color: 'oklch(0.65 0.20 145)', margin: 0, marginBottom: '4px' }}>NORMAL RANGE</p>
                <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.8rem', color: 'oklch(0.75 0.010 260)', margin: 0 }}>{param.normalMin} – {param.normalMax} {param.unit}</p>
              </div>
            )}
            {(param.warnMin !== undefined || param.warnMax !== undefined) && (
              <div style={{ background: 'oklch(0.75 0.18 60 / 0.1)', border: '1px solid oklch(0.75 0.18 60 / 0.3)', borderRadius: '2px', padding: '8px 10px' }}>
                <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.7rem', letterSpacing: '0.08em', color: 'oklch(0.75 0.18 60)', margin: 0, marginBottom: '4px' }}>WARNING</p>
                <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.8rem', color: 'oklch(0.75 0.010 260)', margin: 0 }}>
                  {param.warnMin !== undefined ? `${param.warnMin}` : '—'} / {param.warnMax !== undefined ? `${param.warnMax}` : '—'} {param.unit}
                </p>
              </div>
            )}
            {(param.critMin !== undefined || param.critMax !== undefined) && (
              <div style={{ background: 'oklch(0.52 0.22 25 / 0.1)', border: '1px solid oklch(0.52 0.22 25 / 0.3)', borderRadius: '2px', padding: '8px 10px' }}>
                <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.7rem', letterSpacing: '0.08em', color: 'oklch(0.75 0.18 25)', margin: 0, marginBottom: '4px' }}>CRITICAL</p>
                <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.8rem', color: 'oklch(0.75 0.010 260)', margin: 0 }}>
                  {param.critMin !== undefined ? `${param.critMin}` : '—'} / {param.critMax !== undefined ? `${param.critMax}` : '—'} {param.unit}
                </p>
              </div>
            )}
          </div>

          {param.ecuAddress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid oklch(0.20 0.006 260)' }}>
              <Cpu style={{ width: '12px', height: '12px', color: 'oklch(0.40 0.008 260)' }} />
              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.40 0.008 260)' }}>ECU Address: {param.ecuAddress}</span>
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

  const modeBtn = (mode: 'all' | 'dtc' | 'params', label: string) => (
    <button
      key={mode}
      onClick={() => setSearchMode(mode)}
      style={{
        padding: '5px 14px',
        borderRadius: '2px',
        fontFamily: '"Bebas Neue", "Impact", sans-serif',
        fontSize: '0.8rem',
        letterSpacing: '0.08em',
        border: `1px solid ${searchMode === mode ? 'oklch(0.52 0.22 25)' : 'oklch(0.28 0.008 260)'}`,
        background: searchMode === mode ? 'oklch(0.52 0.22 25)' : 'transparent',
        color: searchMode === mode ? 'white' : 'oklch(0.55 0.010 260)',
        cursor: 'pointer',
        transition: 'all 0.15s'
      }}
    >{label}</button>
  );

  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderRadius: '3px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid oklch(0.20 0.006 260)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          background: 'oklch(0.52 0.22 25)',
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Search style={{ width: '18px', height: '18px', color: 'white' }} />
        </div>
        <div>
          <h3 style={{ fontFamily: '"Bebas Neue", "Impact", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
            DIAGNOSTIC CODE LOOKUP
          </h3>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.50 0.010 260)', margin: 0 }}>
            Search by code (P0087), keyword (fuel rail, boost), or browse by system
          </p>
        </div>
      </div>

      <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Search Input */}
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: 'oklch(0.45 0.010 260)' }} />
          <input
            type="text"
            placeholder="Search by code (P0087), parameter name, or keyword (fuel rail, boost leak)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px',
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.85rem',
              background: 'oklch(0.10 0.005 260)',
              border: '1px solid oklch(0.28 0.008 260)',
              borderRadius: '3px',
              color: 'white',
              outline: 'none',
              boxSizing: 'border-box',
              letterSpacing: '0.03em'
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <X style={{ width: '16px', height: '16px', color: 'oklch(0.45 0.010 260)' }} />
            </button>
          )}
        </div>

        {/* Search Mode Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {modeBtn('all', 'ALL RESULTS')}
          {modeBtn('dtc', 'FAULT CODES')}
          {modeBtn('params', 'ECU PARAMETERS')}
        </div>

        {/* System Filter Pills */}
        {(searchMode === 'all' || searchMode === 'dtc') && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => setActiveSystem(null)}
              style={{
                padding: '3px 10px',
                borderRadius: '2px',
                fontFamily: '"Rajdhani", sans-serif',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: `1px solid ${!activeSystem ? 'oklch(0.52 0.22 25)' : 'oklch(0.28 0.008 260)'}`,
                background: !activeSystem ? 'oklch(0.52 0.22 25)' : 'transparent',
                color: !activeSystem ? 'white' : 'oklch(0.55 0.010 260)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >ALL SYSTEMS</button>
            {systems.map((sys) => (
              <button
                key={sys}
                onClick={() => setActiveSystem(activeSystem === sys ? null : sys)}
                style={{
                  padding: '3px 10px',
                  borderRadius: '2px',
                  fontFamily: '"Rajdhani", sans-serif',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${activeSystem === sys ? 'oklch(0.70 0.18 200)' : 'oklch(0.28 0.008 260)'}`,
                  background: activeSystem === sys ? 'oklch(0.70 0.18 200 / 0.15)' : 'transparent',
                  color: activeSystem === sys ? 'oklch(0.70 0.18 200)' : 'oklch(0.55 0.010 260)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >{sys}</button>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!hasQuery && (
          <div style={{ textAlign: 'center', padding: '2.5rem 0' }}>
            <Search style={{ width: '40px', height: '40px', margin: '0 auto 12px', color: 'oklch(0.30 0.008 260)' }} />
            <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'oklch(0.50 0.010 260)', margin: 0, marginBottom: '4px' }}>
              ENTER A CODE OR KEYWORD TO SEARCH
            </p>
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.40 0.008 260)', margin: 0 }}>
              Examples:{' '}
              <span style={{ fontFamily: '"Share Tech Mono", monospace', color: 'oklch(0.70 0.18 200)' }}>P0087</span>,{' '}
              <span style={{ fontFamily: '"Share Tech Mono", monospace', color: 'oklch(0.70 0.18 200)' }}>fuel rail</span>,{' '}
              <span style={{ fontFamily: '"Share Tech Mono", monospace', color: 'oklch(0.70 0.18 200)' }}>boost leak</span>,{' '}
              <span style={{ fontFamily: '"Share Tech Mono", monospace', color: 'oklch(0.70 0.18 200)' }}>VeFCBR</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
              {['P0087', 'P0088', 'P0299', 'P0101', 'P0234', 'P20EE'].map((code) => (
                <button
                  key={code}
                  onClick={() => setQuery(code)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '2px',
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.8rem',
                    background: 'oklch(0.16 0.007 260)',
                    border: '1px solid oklch(0.28 0.008 260)',
                    color: 'oklch(0.70 0.18 200)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'oklch(0.70 0.18 200)'; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'oklch(0.28 0.008 260)'; }}
                >{code}</button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {hasQuery && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'oklch(0.50 0.010 260)', margin: 0 }}>
                {totalResults === 0 ? 'NO RESULTS FOUND' : `${totalResults} RESULT${totalResults !== 1 ? 'S' : ''} FOUND`}
              </p>
              {(query || activeSystem) && (
                <button
                  onClick={() => { setQuery(''); setActiveSystem(null); }}
                  style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.8rem', letterSpacing: '0.06em', color: 'oklch(0.52 0.22 25)', background: 'none', border: 'none', cursor: 'pointer' }}
                >CLEAR</button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {totalResults === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <Search style={{ width: '32px', height: '32px', margin: '0 auto 8px', color: 'oklch(0.30 0.008 260)' }} />
                  <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1rem', letterSpacing: '0.06em', color: 'oklch(0.45 0.010 260)', margin: 0 }}>NO CODES OR PARAMETERS FOUND</p>
                  <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.40 0.008 260)', margin: 0 }}>Try a different code or keyword</p>
                </div>
              ) : (
                <>
                  {(searchMode === 'all' || searchMode === 'dtc') && dtcResults.length > 0 && (() => {
                    const grouped: Record<string, typeof dtcResults> = {};
                    dtcResults.forEach(dtc => {
                      if (!grouped[dtc.system]) grouped[dtc.system] = [];
                      grouped[dtc.system].push(dtc);
                    });
                    const systemOrder = ['Fuel System', 'Air System', 'EGT Sensors', 'EGR System', 'DPF System', 'SCR / DEF System'];
                    const sortedSystems = Object.keys(grouped).sort(
                      (a, b) => (systemOrder.indexOf(a) === -1 ? 99 : systemOrder.indexOf(a))
                               - (systemOrder.indexOf(b) === -1 ? 99 : systemOrder.indexOf(b))
                    );
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {searchMode === 'all' && paramResults.length > 0 && (
                          <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.45 0.010 260)', margin: 0 }}>
                            FAULT CODES ({dtcResults.length})
                          </p>
                        )}
                        {sortedSystems.map(sys => (
                          <div key={sys}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                              <span style={{
                                padding: '2px 10px',
                                borderRadius: '2px',
                                fontFamily: '"Rajdhani", sans-serif',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: 'oklch(0.70 0.18 200 / 0.15)',
                                border: '1px solid oklch(0.70 0.18 200 / 0.3)',
                                color: 'oklch(0.70 0.18 200)'
                              }}>{sys}</span>
                              <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: 'oklch(0.40 0.008 260)' }}>
                                {grouped[sys].length} code{grouped[sys].length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '4px' }}>
                              {grouped[sys].map(dtc => (
                                <DtcResult key={dtc.code} dtc={dtc} autoExpand={autoExpand} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {(searchMode === 'all' || searchMode === 'params') && paramResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {searchMode === 'all' && dtcResults.length > 0 && (
                        <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'oklch(0.45 0.010 260)', margin: 0 }}>
                          ECU PARAMETERS ({paramResults.length})
                        </p>
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
        <div style={{
          background: 'oklch(0.10 0.005 260)',
          border: '1px solid oklch(0.20 0.008 260)',
          borderRadius: '2px',
          padding: '10px 12px'
        }}>
          <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: 'oklch(0.40 0.008 260)', margin: 0, lineHeight: 1.6 }}>
            Covers 2017–2023 L5P 6.6L Duramax. Verify with live scan data before performing repairs.
          </p>
        </div>
      </div>
    </div>
  );
}
