/**
 * Subsystem Reference Panel — Searchable subsystem knowledge base
 * Dark theme: black bg, red/amber/cyan accents
 * Typography: Bebas Neue headings, Rajdhani body, Share Tech Mono for data
 */

import { useState, useMemo } from 'react';
import { L5P_SPECS } from '@/lib/ecuReference';
import { Search, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

interface EcuReferencePanelProps {
  className?: string;
}

// Category grouping for subsystems
const SUBSYSTEM_CATEGORIES: Record<string, { label: string; color: string; keys: string[] }> = {
  fuel: {
    label: 'Fuel System',
    color: 'oklch(0.70 0.18 200)',
    keys: ['FRPR', 'INJC', 'LPFP', 'FQUL'],
  },
  turbo_air: {
    label: 'Turbo & Air',
    color: 'oklch(0.75 0.18 40)',
    keys: ['BSTR', 'AICR', 'MAFR', 'ICLR', 'THTL'],
  },
  egr: {
    label: 'EGR System',
    color: 'oklch(0.65 0.20 145)',
    keys: ['EGRV', 'EGRC'],
  },
  exhaust_emissions: {
    label: 'Exhaust & Emissions',
    color: 'oklch(0.52 0.22 25)',
    keys: ['EGTR', 'DPFR', 'SCRR', 'NOXS', 'CATM'],
  },
  transmission: {
    label: 'Transmission',
    color: 'oklch(0.70 0.20 300)',
    keys: ['SPDR', 'TCCR', 'SHFT', 'TRNF', 'TRNG'],
  },
  cooling: {
    label: 'Cooling & Lubrication',
    color: 'oklch(0.70 0.18 200)',
    keys: ['COOL', 'OILM'],
  },
  electrical: {
    label: 'Electrical & Sensors',
    color: 'oklch(0.75 0.18 60)',
    keys: ['GLWP', 'BATT', 'CANS', 'CRKS'],
  },
  protection: {
    label: 'Engine Protection',
    color: 'oklch(0.52 0.22 25)',
    keys: ['ENGP', 'EXBK', 'DIAG'],
  },
};

// Friendly names for subsystem codes
const SUBSYSTEM_NAMES: Record<string, string> = {
  FRPR: 'Fuel Rail Pressure Regulation',
  INJC: 'Fuel Injection Control',
  LPFP: 'Low-Pressure Fuel System',
  FQUL: 'Fuel Quality Monitoring',
  BSTR: 'Boost Pressure Regulation',
  AICR: 'Air Intake Control',
  MAFR: 'Mass Airflow Regulation',
  ICLR: 'Intercooler System',
  THTL: 'Electronic Throttle Control',
  EGRV: 'EGR Valve Control',
  EGRC: 'EGR Cooler System',
  EGTR: 'Exhaust Gas Temperature Monitoring',
  DPFR: 'DPF Regeneration Control',
  SCRR: 'SCR / DEF System',
  NOXS: 'NOx Sensor Monitoring',
  CATM: 'Catalytic Converter Monitoring',
  SPDR: 'Speed / Idle Control',
  TCCR: 'Torque Converter Clutch Control',
  SHFT: 'Shift Control',
  TRNF: 'Transmission Fluid Monitoring',
  TRNG: 'Transmission Gear Ratio Monitoring',
  COOL: 'Engine Cooling System',
  OILM: 'Engine Oil Monitoring',
  GLWP: 'Glow Plug System',
  BATT: 'Battery & Charging System',
  CANS: 'CAN Bus Communication',
  CRKS: 'Crankshaft Position System',
  ENGP: 'Engine Protection System',
  EXBK: 'Exhaust Brake System',
  DIAG: 'On-Board Diagnostics (OBD-II)',
};

function SubsystemCard({ code, description, color, expanded, onToggle }: {
  code: string;
  description: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const name = SUBSYSTEM_NAMES[code] || code;
  // Extract the part after the " — " dash for the detail text
  const dashIdx = description.indexOf(' — ');
  const summary = dashIdx > 0 ? description.substring(dashIdx + 3) : description;

  return (
    <div
      style={{
        background: 'oklch(0.13 0.006 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderLeft: `3px solid ${color}`,
        borderRadius: '3px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onClick={onToggle}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: expanded ? 'oklch(0.15 0.007 260)' : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            color,
            background: `${color}18`,
            border: `1px solid ${color}40`,
            padding: '2px 8px',
            borderRadius: '2px',
            flexShrink: 0,
          }}>{code}</span>
          <span style={{
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'oklch(0.80 0.010 260)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{name}</span>
        </div>
        {expanded
          ? <ChevronDown style={{ width: '16px', height: '16px', color: 'oklch(0.60 0.010 260)', flexShrink: 0 }} />
          : <ChevronRight style={{ width: '16px', height: '16px', color: 'oklch(0.60 0.010 260)', flexShrink: 0 }} />
        }
      </div>
      {expanded && (
        <div style={{
          padding: '10px 12px',
          background: 'oklch(0.11 0.005 260)',
          borderTop: '1px solid oklch(0.20 0.006 260)',
        }}>
          <p style={{
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.85rem',
            color: 'oklch(0.65 0.010 260)',
            margin: 0,
            lineHeight: 1.7,
          }}>{summary}</p>
        </div>
      )}
    </div>
  );
}

export default function EcuReferencePanel({ className = '' }: EcuReferencePanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const allSubsystems = L5P_SPECS.subsystems as Record<string, string>;

  // Filter subsystems by search query
  const filteredCategories = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return SUBSYSTEM_CATEGORIES;

    const result: Record<string, { label: string; color: string; keys: string[] }> = {};
    for (const [catKey, cat] of Object.entries(SUBSYSTEM_CATEGORIES)) {
      const matchingKeys = cat.keys.filter(key => {
        const name = (SUBSYSTEM_NAMES[key] || '').toLowerCase();
        const desc = (allSubsystems[key] || '').toLowerCase();
        const code = key.toLowerCase();
        return name.includes(q) || desc.includes(q) || code.includes(q);
      });
      if (matchingKeys.length > 0) {
        result[catKey] = { ...cat, keys: matchingKeys };
      }
    }
    return result;
  }, [searchQuery, allSubsystems]);

  const totalResults = Object.values(filteredCategories).reduce((sum, cat) => sum + cat.keys.length, 0);

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderRadius: '3px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid oklch(0.20 0.006 260)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          background: 'oklch(0.70 0.18 200)',
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <BookOpen style={{ width: '18px', height: '18px', color: 'white' }} />
        </div>
        <div>
          <h3 style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '1rem',
            letterSpacing: '0.06em',
            color: 'white',
            margin: 0,
          }}>
            SUBSYSTEM REFERENCE
          </h3>
          <p style={{
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.8rem',
            color: 'oklch(0.63 0.010 260)',
            margin: 0,
          }}>
            Vehicle subsystem knowledge base &mdash; search by name, code, or keyword
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{
        padding: '0.75rem 1.25rem',
        borderBottom: '1px solid oklch(0.20 0.006 260)',
        background: 'oklch(0.11 0.005 260)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'oklch(0.14 0.006 260)',
          border: '1px solid oklch(0.25 0.008 260)',
          borderRadius: '3px',
          padding: '6px 12px',
        }}>
          <Search style={{ width: '16px', height: '16px', color: 'oklch(0.60 0.010 260)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subsystems... (e.g., fuel, turbo, DPF, TCC, P0087)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.85rem',
              color: 'oklch(0.80 0.010 260)',
            }}
          />
          {searchQuery && (
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.7rem',
              color: 'oklch(0.63 0.010 260)',
            }}>
              {totalResults} result{totalResults !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Subsystem List */}
      <div style={{ padding: '1rem 1.25rem', maxHeight: '600px', overflowY: 'auto' }}>
        {Object.keys(filteredCategories).length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '2rem',
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.9rem',
            color: 'oklch(0.60 0.010 260)',
          }}>
            No subsystems match &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          Object.entries(filteredCategories).map(([catKey, cat]) => (
            <div key={catKey} style={{ marginBottom: '1rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '0.5rem',
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: cat.color,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '0.8rem',
                  letterSpacing: '0.1em',
                  color: 'oklch(0.68 0.010 260)',
                }}>{cat.label.toUpperCase()}</span>
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.65rem',
                  color: 'oklch(0.58 0.010 260)',
                }}>({cat.keys.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {cat.keys.map(key => (
                  <SubsystemCard
                    key={key}
                    code={key}
                    description={allSubsystems[key] || ''}
                    color={cat.color}
                    expanded={expandedKeys.has(key)}
                    onToggle={() => toggleExpand(key)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
