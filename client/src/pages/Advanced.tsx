/**
 * PPEI Advanced Mode — Document-Aware Search & Knowledge Base
 * Design: Industrial Performance / Motorsport Dark (same as main app)
 * Access: Requires code "PPEIROCKS" to unlock
 * Features: Full-text search across SAE J1979, J1979-2, GM Mode 6, OBD-II PIDs
 * Future: a2L file support, datalog execution, multi-vehicle support
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Link } from 'wouter';
import {
  Search, Lock, Unlock, ArrowLeft, Database, BookOpen,
  Gauge, Terminal, ChevronDown, ChevronRight, X, Zap,
  Shield, FileText, Cpu, Activity, AlertCircle, Hash,
  Layers, Eye, EyeOff, Info
} from 'lucide-react';
import { getSearchEngine, SearchResult, QueryIntent } from '@/lib/searchEngine';
import {
  OBD_PIDS, OBD_SERVICES, GM_MODE6_MONITORS, UDS_SERVICE_MAPPING,
  READINESS_GROUPS, KBCategory
} from '@/lib/knowledgeBase';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';
const ACCESS_CODE = 'PPEIROCKS';
const STORAGE_KEY = 'ppei_advanced_unlocked';

// ─── Access Code Gate ────────────────────────────────────────────────────────

function AccessGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (code.toUpperCase() === ACCESS_CODE) {
      localStorage.setItem(STORAGE_KEY, 'true');
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'oklch(0.08 0.004 260)' }}>
      <div
        className={`ppei-anim-scale-in ${shake ? 'ppei-shake' : ''}`}
        style={{
          background: 'oklch(0.12 0.006 260)',
          border: '1px solid oklch(0.22 0.008 260)',
          borderTop: '3px solid oklch(0.52 0.22 25)',
          padding: '3rem 2.5rem',
          maxWidth: '440px',
          width: '100%',
          margin: '0 1rem',
        }}
      >
        {/* Lock icon */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '1.5rem',
        }}>
          <div style={{
            background: 'oklch(0.52 0.22 25 / 0.12)',
            border: '1px solid oklch(0.52 0.22 25 / 0.3)',
            borderRadius: '50%',
            padding: '1rem',
          }}>
            <Lock style={{ width: '32px', height: '32px', color: 'oklch(0.52 0.22 25)' }} />
          </div>
        </div>

        <h1 style={{
          fontFamily: '"Bebas Neue", "Impact", sans-serif',
          fontSize: '1.8rem',
          letterSpacing: '0.1em',
          color: 'white',
          textAlign: 'center',
          margin: 0,
          marginBottom: '0.5rem',
        }}>
          ADVANCED MODE
        </h1>
        <p style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '0.85rem',
          color: 'oklch(0.55 0.010 260)',
          textAlign: 'center',
          marginBottom: '2rem',
        }}>
          Enter access code to unlock the advanced diagnostic knowledge base
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <input
            ref={inputRef}
            type="password"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="Access Code"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '1.1rem',
              letterSpacing: '0.15em',
              textAlign: 'center',
              background: 'oklch(0.08 0.004 260)',
              border: `2px solid ${error ? 'oklch(0.52 0.22 25)' : 'oklch(0.25 0.008 260)'}`,
              borderRadius: '3px',
              color: 'white',
              outline: 'none',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => {
              if (!error) (e.target as HTMLInputElement).style.borderColor = 'oklch(0.52 0.22 25)';
            }}
            onBlur={(e) => {
              if (!error) (e.target as HTMLInputElement).style.borderColor = 'oklch(0.25 0.008 260)';
            }}
          />
        </div>

        {error && (
          <p style={{
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.8rem',
            color: 'oklch(0.52 0.22 25)',
            textAlign: 'center',
            marginBottom: '1rem',
          }}>
            Invalid access code. Try again.
          </p>
        )}

        <button
          onClick={handleSubmit}
          className="ppei-btn-red ppei-btn-hover"
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '1.1rem',
            border: 'none',
          }}
        >
          UNLOCK
        </button>

        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link href="/" style={{
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.8rem',
            color: 'oklch(0.50 0.010 260)',
            textDecoration: 'none',
          }}>
            Back to Analyzer
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Category Config ─────────────────────────────────────────────────────────

const categoryConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pid: { label: 'PID', color: 'oklch(0.70 0.18 200)', icon: <Hash style={{ width: 14, height: 14 }} /> },
  mode6: { label: 'Mode 6', color: 'oklch(0.65 0.20 145)', icon: <Activity style={{ width: 14, height: 14 }} /> },
  standard: { label: 'Standard', color: 'oklch(0.75 0.18 60)', icon: <BookOpen style={{ width: 14, height: 14 }} /> },
  protocol: { label: 'Protocol', color: 'oklch(0.70 0.20 300)', icon: <Layers style={{ width: 14, height: 14 }} /> },
  uds: { label: 'UDS', color: 'oklch(0.65 0.18 170)', icon: <Terminal style={{ width: 14, height: 14 }} /> },
  readiness: { label: 'Readiness', color: 'oklch(0.75 0.18 25)', icon: <Shield style={{ width: 14, height: 14 }} /> },
  freeze_frame: { label: 'Freeze Frame', color: 'oklch(0.70 0.18 200)', icon: <FileText style={{ width: 14, height: 14 }} /> },
  monitor: { label: 'Monitor', color: 'oklch(0.65 0.20 145)', icon: <Gauge style={{ width: 14, height: 14 }} /> },
  threshold: { label: 'Threshold', color: 'oklch(0.80 0.18 60)', icon: <AlertCircle style={{ width: 14, height: 14 }} /> },
  formula: { label: 'Formula', color: 'oklch(0.70 0.20 300)', icon: <Cpu style={{ width: 14, height: 14 }} /> },
  dtc: { label: 'DTC', color: 'oklch(0.52 0.22 25)', icon: <AlertCircle style={{ width: 14, height: 14 }} /> },
};

const relevanceColors: Record<string, string> = {
  exact: 'oklch(0.65 0.20 145)',
  high: 'oklch(0.70 0.18 200)',
  medium: 'oklch(0.75 0.18 60)',
  low: 'oklch(0.50 0.010 260)',
};

// ─── Search Result Card ──────────────────────────────────────────────────────

function ResultCard({ result, isExpanded, onToggle }: {
  result: SearchResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const doc = result.document;
  const cat = categoryConfig[doc.category] || categoryConfig.standard;

  return (
    <div
      className="ppei-card-hover"
      style={{
        background: 'oklch(0.13 0.006 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderLeft: `4px solid ${cat.color}`,
        borderRadius: '3px',
        marginBottom: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onClick={onToggle}
    >
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ marginTop: '2px', flexShrink: 0 }}>
          {isExpanded
            ? <ChevronDown style={{ width: 16, height: 16, color: 'oklch(0.55 0.010 260)' }} />
            : <ChevronRight style={{ width: 16, height: 16, color: 'oklch(0.55 0.010 260)' }} />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {/* Category pill */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '2px',
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              background: `${cat.color}22`,
              border: `1px solid ${cat.color}44`,
              color: cat.color,
            }}>
              {cat.icon}
              {cat.label.toUpperCase()}
            </span>
            {/* Relevance pill */}
            <span style={{
              padding: '2px 6px',
              borderRadius: '2px',
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.65rem',
              background: `${relevanceColors[result.relevanceLabel]}22`,
              border: `1px solid ${relevanceColors[result.relevanceLabel]}44`,
              color: relevanceColors[result.relevanceLabel],
            }}>
              {result.relevanceLabel.toUpperCase()}
            </span>
          </div>
          <h3 style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '1rem',
            letterSpacing: '0.05em',
            color: 'white',
            margin: 0,
            lineHeight: 1.3,
          }}>
            {doc.title}
          </h3>
          {!isExpanded && (
            <p style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.8rem',
              color: 'oklch(0.55 0.010 260)',
              margin: '4px 0 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {result.snippet}
            </p>
          )}
        </div>
        {/* Score */}
        <div style={{
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.7rem',
          color: 'oklch(0.45 0.008 260)',
          flexShrink: 0,
        }}>
          {result.score.toFixed(1)}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{
          borderTop: '1px solid oklch(0.20 0.008 260)',
          padding: '16px',
          background: 'oklch(0.11 0.005 260)',
        }}>
          <div style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.8rem',
            color: 'oklch(0.75 0.010 260)',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {doc.content}
          </div>
          <div style={{
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid oklch(0.18 0.006 260)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.72rem',
              color: 'oklch(0.45 0.008 260)',
            }}>
              Source: {doc.source}
            </span>
            {doc.metadata && Object.entries(doc.metadata).map(([key, val]) => (
              <span key={key} style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.65rem',
                padding: '1px 6px',
                background: 'oklch(0.16 0.006 260)',
                border: '1px solid oklch(0.22 0.008 260)',
                borderRadius: '2px',
                color: 'oklch(0.60 0.010 260)',
              }}>
                {key}: {val}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick Reference Panels ──────────────────────────────────────────────────

function PidReferencePanel() {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    if (!filter) return OBD_PIDS;
    const q = filter.toLowerCase();
    return OBD_PIDS.filter(p =>
      p.description.toLowerCase().includes(q) ||
      p.pidHex.toLowerCase().includes(q) ||
      (p.units || '').toLowerCase().includes(q) ||
      (p.formula || '').toLowerCase().includes(q)
    );
  }, [filter]);

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter PIDs..."
        style={{
          width: '100%',
          padding: '10px 14px',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.85rem',
          background: 'oklch(0.10 0.005 260)',
          border: '1px solid oklch(0.25 0.008 260)',
          borderRadius: '3px',
          color: 'white',
          outline: 'none',
          marginBottom: '12px',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"Share Tech Mono", monospace', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid oklch(0.25 0.008 260)' }}>
              <th style={{ padding: '8px', textAlign: 'left', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.06em', fontSize: '0.85rem' }}>PID</th>
              <th style={{ padding: '8px', textAlign: 'left', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.06em', fontSize: '0.85rem' }}>DESCRIPTION</th>
              <th style={{ padding: '8px', textAlign: 'left', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.06em', fontSize: '0.85rem' }}>RANGE</th>
              <th style={{ padding: '8px', textAlign: 'left', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.06em', fontSize: '0.85rem' }}>FORMULA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pid) => (
              <tr key={pid.pidHex} style={{ borderBottom: '1px solid oklch(0.18 0.006 260)' }}>
                <td style={{ padding: '6px 8px', color: 'oklch(0.70 0.18 200)', fontWeight: 600 }}>${pid.pidHex}</td>
                <td style={{ padding: '6px 8px', color: 'oklch(0.80 0.010 260)', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem' }}>{pid.description}</td>
                <td style={{ padding: '6px 8px', color: 'oklch(0.60 0.010 260)', whiteSpace: 'nowrap' }}>
                  {pid.minValue && pid.maxValue ? `${pid.minValue}..${pid.maxValue} ${pid.units || ''}` : pid.notes ? pid.notes.substring(0, 30) : '-'}
                </td>
                <td style={{ padding: '6px 8px', color: 'oklch(0.65 0.20 145)' }}>{pid.formula || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'oklch(0.45 0.008 260)', fontFamily: '"Rajdhani", sans-serif' }}>
            No PIDs match your filter
          </p>
        )}
      </div>
    </div>
  );
}

function Mode6Panel() {
  const [filter, setFilter] = useState('');
  const grouped = useMemo(() => {
    const groups: Record<string, typeof GM_MODE6_MONITORS> = {};
    for (const m of GM_MODE6_MONITORS) {
      const key = `${m.obdmid}-${m.obdmidName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    if (!filter) return groups;
    const q = filter.toLowerCase();
    const filtered: Record<string, typeof GM_MODE6_MONITORS> = {};
    for (const [key, monitors] of Object.entries(groups)) {
      const matching = monitors.filter(m =>
        m.description.toLowerCase().includes(q) ||
        m.obdmid.toLowerCase().includes(q) ||
        m.obdmidName.toLowerCase().includes(q) ||
        m.testId.toLowerCase().includes(q)
      );
      if (matching.length > 0) filtered[key] = matching;
    }
    return filtered;
  }, [filter]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter monitors (e.g. boost, EGR, misfire, 85)..."
        style={{
          width: '100%',
          padding: '10px 14px',
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.85rem',
          background: 'oklch(0.10 0.005 260)',
          border: '1px solid oklch(0.25 0.008 260)',
          borderRadius: '3px',
          color: 'white',
          outline: 'none',
          marginBottom: '12px',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {Object.entries(grouped).map(([key, monitors]) => {
          const isOpen = expanded.has(key);
          const first = monitors[0];
          return (
            <div key={key} style={{
              background: 'oklch(0.11 0.005 260)',
              border: '1px solid oklch(0.20 0.008 260)',
              borderLeft: '3px solid oklch(0.65 0.20 145)',
              borderRadius: '3px',
              marginBottom: '6px',
            }}>
              <div
                onClick={() => toggleGroup(key)}
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                {isOpen
                  ? <ChevronDown style={{ width: 14, height: 14, color: 'oklch(0.55 0.010 260)', flexShrink: 0 }} />
                  : <ChevronRight style={{ width: 14, height: 14, color: 'oklch(0.55 0.010 260)', flexShrink: 0 }} />
                }
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.8rem',
                  color: 'oklch(0.65 0.20 145)',
                  fontWeight: 600,
                }}>
                  ${first.obdmid}
                </span>
                <span style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '0.9rem',
                  letterSpacing: '0.04em',
                  color: 'white',
                  flex: 1,
                }}>
                  {first.obdmidName}
                </span>
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.7rem',
                  color: 'oklch(0.45 0.008 260)',
                }}>
                  {monitors.length} tests
                </span>
              </div>
              {isOpen && (
                <div style={{ borderTop: '1px solid oklch(0.18 0.006 260)', padding: '8px 14px 12px' }}>
                  {monitors.map((m, idx) => (
                    <div key={idx} style={{
                      padding: '6px 0',
                      borderBottom: idx < monitors.length - 1 ? '1px solid oklch(0.16 0.006 260)' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'oklch(0.70 0.18 200)' }}>
                          TID ${m.testId}
                        </span>
                        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.65rem', color: 'oklch(0.45 0.008 260)' }}>
                          UASID ${m.uasid}
                        </span>
                      </div>
                      <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.80 0.010 260)', margin: 0 }}>
                        {m.description}
                      </p>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '2px' }}>
                        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.50 0.010 260)' }}>
                          Range: {m.range}
                        </span>
                        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.50 0.010 260)' }}>
                          Res: {m.resolution}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {Object.keys(grouped).length === 0 && (
          <p style={{ textAlign: 'center', padding: '2rem', color: 'oklch(0.45 0.008 260)', fontFamily: '"Rajdhani", sans-serif' }}>
            No monitors match your filter
          </p>
        )}
      </div>
    </div>
  );
}

function UDSPanel() {
  return (
    <div>
      <div style={{
        background: 'oklch(0.11 0.005 260)',
        border: '1px solid oklch(0.20 0.008 260)',
        borderLeft: '3px solid oklch(0.65 0.18 170)',
        borderRadius: '3px',
        padding: '14px',
        marginBottom: '16px',
      }}>
        <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.70 0.010 260)', margin: 0 }}>
          SAE J1979-2 maps classic OBD-II modes to ISO 14229-1 (UDS) services for 2020+ model year vehicles.
          Key improvements include 3-byte DTCs, DTC-specific readiness, enhanced freeze frames, and IUMPR access.
        </p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"Share Tech Mono", monospace', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid oklch(0.25 0.008 260)' }}>
            <th style={{ padding: '8px', textAlign: 'left', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.06em', fontSize: '0.85rem' }}>CLASSIC</th>
            <th style={{ padding: '8px', textAlign: 'left', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.06em', fontSize: '0.85rem' }}>UDS SERVICE</th>
            <th style={{ padding: '8px', textAlign: 'left', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.06em', fontSize: '0.85rem' }}>NOTES</th>
          </tr>
        </thead>
        <tbody>
          {UDS_SERVICE_MAPPING.map((m) => (
            <tr key={m.classicMode} style={{ borderBottom: '1px solid oklch(0.18 0.006 260)' }}>
              <td style={{ padding: '8px', verticalAlign: 'top' }}>
                <div style={{ color: 'oklch(0.70 0.18 200)', fontWeight: 600 }}>{m.classicMode}</div>
                <div style={{ color: 'oklch(0.55 0.010 260)', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.78rem' }}>{m.classicDesc}</div>
              </td>
              <td style={{ padding: '8px', verticalAlign: 'top' }}>
                <div style={{ color: 'oklch(0.65 0.18 170)', fontWeight: 600 }}>{m.udsService}</div>
                <div style={{ color: 'oklch(0.55 0.010 260)', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.78rem' }}>{m.udsDesc}</div>
              </td>
              <td style={{ padding: '8px', color: 'oklch(0.55 0.010 260)', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.78rem', verticalAlign: 'top' }}>
                {m.notes || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Readiness Groups */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: '1.1rem',
          letterSpacing: '0.06em',
          color: 'white',
          borderLeft: '3px solid oklch(0.52 0.22 25)',
          paddingLeft: '10px',
          marginBottom: '12px',
        }}>
          READINESS GROUPS
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{
            background: 'oklch(0.11 0.005 260)',
            border: '1px solid oklch(0.20 0.008 260)',
            borderRadius: '3px',
            padding: '14px',
          }}>
            <h4 style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '0.9rem',
              letterSpacing: '0.05em',
              color: 'oklch(0.75 0.18 60)',
              marginBottom: '8px',
            }}>
              SPARK IGNITION (GASOLINE)
            </h4>
            {READINESS_GROUPS.sparkIgnition.map((g) => (
              <div key={g.name} style={{ padding: '4px 0', borderBottom: '1px solid oklch(0.16 0.006 260)' }}>
                <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.80 0.010 260)', fontWeight: 600 }}>
                  {g.name}
                </span>
              </div>
            ))}
          </div>
          <div style={{
            background: 'oklch(0.11 0.005 260)',
            border: '1px solid oklch(0.20 0.008 260)',
            borderRadius: '3px',
            padding: '14px',
          }}>
            <h4 style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '0.9rem',
              letterSpacing: '0.05em',
              color: 'oklch(0.70 0.18 200)',
              marginBottom: '8px',
            }}>
              COMPRESSION IGNITION (DIESEL)
            </h4>
            {READINESS_GROUPS.compressionIgnition.map((g) => (
              <div key={g.name} style={{ padding: '4px 0', borderBottom: '1px solid oklch(0.16 0.006 260)' }}>
                <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.80 0.010 260)', fontWeight: 600 }}>
                  {g.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function OBDServicesPanel() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
      {OBD_SERVICES.map((svc) => (
        <div key={svc.mode} style={{
          background: 'oklch(0.11 0.005 260)',
          border: '1px solid oklch(0.20 0.008 260)',
          borderTop: '3px solid oklch(0.75 0.18 60)',
          borderRadius: '3px',
          padding: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.85rem',
              color: 'oklch(0.75 0.18 60)',
              fontWeight: 700,
            }}>
              {svc.hex}
            </span>
            <span style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '0.9rem',
              letterSpacing: '0.04em',
              color: 'white',
            }}>
              {svc.description.toUpperCase()}
            </span>
          </div>
          <p style={{
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.8rem',
            color: 'oklch(0.60 0.010 260)',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {svc.detail}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Advanced Page ──────────────────────────────────────────────────────

type TabId = 'search' | 'pids' | 'mode6' | 'uds' | 'services';

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'search', label: 'SEARCH', icon: <Search style={{ width: 16, height: 16 }} /> },
  { id: 'pids', label: 'PID REFERENCE', icon: <Hash style={{ width: 16, height: 16 }} /> },
  { id: 'mode6', label: 'MODE 6', icon: <Activity style={{ width: 16, height: 16 }} /> },
  { id: 'uds', label: 'UDS / J1979-2', icon: <Terminal style={{ width: 16, height: 16 }} /> },
  { id: 'services', label: 'OBD SERVICES', icon: <BookOpen style={{ width: 16, height: 16 }} /> },
];

function AdvancedDashboard({ onLock }: { onLock: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>('search');
  const [query, setQuery] = useState('');
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<KBCategory | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const engine = useMemo(() => getSearchEngine(), []);
  const stats = useMemo(() => engine.getStats(), [engine]);

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const { results, intent } = engine.search(query);
    const filtered = categoryFilter === 'all'
      ? results
      : results.filter(r => r.document.category === categoryFilter);
    return { results: filtered, intent };
  }, [query, engine, categoryFilter]);

  const toggleResult = useCallback((id: string) => {
    setExpandedResults(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'oklch(0.10 0.005 260)', color: 'oklch(0.95 0.005 260)' }}>
      {/* Header */}
      <header style={{
        background: 'oklch(0.08 0.004 260)',
        borderBottom: '1px solid oklch(0.20 0.008 260)',
        boxShadow: '0 2px 20px oklch(0 0 0 / 0.5)',
      }}>
        <div className="ppei-accent-animated" style={{ height: '3px' }} />
        <div className="container mx-auto px-4 py-3">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <Link href="/">
                <img
                  src={PPEI_LOGO_URL}
                  alt="PPEI Custom Tuning"
                  className="ppei-logo"
                  style={{ height: '48px', width: 'auto', objectFit: 'contain', cursor: 'pointer' }}
                />
              </Link>
              <div style={{ borderLeft: '3px solid oklch(0.52 0.22 25)', paddingLeft: '12px' }}>
                <h1 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1.3rem',
                  letterSpacing: '0.08em',
                  color: 'white',
                  lineHeight: 1.1,
                  margin: 0,
                }}>
                  ADVANCED MODE
                </h1>
                <p style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  fontSize: '0.72rem',
                  color: 'oklch(0.55 0.010 260)',
                  letterSpacing: '0.04em',
                  margin: 0,
                }}>
                  SAE J1979 / J1979-2 / GM MODE 6 / OBD-II KNOWLEDGE BASE
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Stats badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: 'oklch(0.65 0.20 145 / 0.12)',
                border: '1px solid oklch(0.65 0.20 145 / 0.3)',
                borderRadius: '2px',
              }}>
                <Database style={{ width: 12, height: 12, color: 'oklch(0.65 0.20 145)' }} />
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.7rem',
                  color: 'oklch(0.65 0.20 145)',
                }}>
                  {stats.totalDocuments} DOCS
                </span>
              </div>
              {/* Lock button */}
              <button
                onClick={onLock}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'oklch(0.52 0.22 25 / 0.12)',
                  border: '1px solid oklch(0.52 0.22 25 / 0.3)',
                  borderRadius: '2px',
                  color: 'oklch(0.52 0.22 25)',
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '0.8rem',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'oklch(0.52 0.22 25 / 0.25)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'oklch(0.52 0.22 25 / 0.12)';
                }}
              >
                <Lock style={{ width: 14, height: 14 }} />
                LOCK
              </button>
              {/* Back to analyzer */}
              <Link href="/" style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'oklch(0.18 0.006 260)',
                  border: '1px solid oklch(0.25 0.008 260)',
                  borderRadius: '2px',
                  color: 'oklch(0.70 0.010 260)',
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '0.8rem',
                  letterSpacing: '0.08em',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <ArrowLeft style={{ width: 14, height: 14 }} />
                  ANALYZER
                </div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Tab navigation */}
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '20px',
          borderBottom: '1px solid oklch(0.20 0.008 260)',
          paddingBottom: '0',
          overflowX: 'auto',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: '0.9rem',
                letterSpacing: '0.06em',
                color: activeTab === tab.id ? 'white' : 'oklch(0.50 0.010 260)',
                background: activeTab === tab.id ? 'oklch(0.16 0.008 260)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid oklch(0.52 0.22 25)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search tab */}
        {activeTab === 'search' && (
          <div className="ppei-anim-fade-up">
            {/* Search input */}
            <div style={{
              background: 'oklch(0.12 0.006 260)',
              border: '1px solid oklch(0.22 0.008 260)',
              borderRadius: '3px',
              padding: '20px',
              marginBottom: '16px',
            }}>
              <div style={{ position: 'relative' }}>
                <Search style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '18px',
                  height: '18px',
                  color: 'oklch(0.45 0.008 260)',
                }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Search knowledge base (e.g. "boost pressure PID", "mode 6 EGR", "$0C formula", "P0299")'
                  style={{
                    width: '100%',
                    padding: '14px 14px 14px 44px',
                    fontFamily: '"Share Tech Mono", monospace',
                    fontSize: '0.95rem',
                    background: 'oklch(0.08 0.004 260)',
                    border: '2px solid oklch(0.25 0.008 260)',
                    borderRadius: '3px',
                    color: 'white',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                  }}
                  onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = 'oklch(0.52 0.22 25)'; }}
                  onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = 'oklch(0.25 0.008 260)'; }}
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}
                    style={{
                      position: 'absolute',
                      right: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    <X style={{ width: 16, height: 16, color: 'oklch(0.50 0.010 260)' }} />
                  </button>
                )}
              </div>

              {/* Category filters */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setCategoryFilter('all')}
                  style={{
                    padding: '4px 10px',
                    fontFamily: '"Rajdhani", sans-serif',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.03em',
                    background: categoryFilter === 'all' ? 'oklch(0.52 0.22 25 / 0.2)' : 'oklch(0.16 0.006 260)',
                    border: `1px solid ${categoryFilter === 'all' ? 'oklch(0.52 0.22 25 / 0.5)' : 'oklch(0.22 0.008 260)'}`,
                    borderRadius: '2px',
                    color: categoryFilter === 'all' ? 'oklch(0.52 0.22 25)' : 'oklch(0.55 0.010 260)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  ALL
                </button>
                {Object.entries(categoryConfig).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setCategoryFilter(key as KBCategory)}
                    style={{
                      padding: '4px 10px',
                      fontFamily: '"Rajdhani", sans-serif',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                      background: categoryFilter === key ? `${cfg.color}33` : 'oklch(0.16 0.006 260)',
                      border: `1px solid ${categoryFilter === key ? `${cfg.color}66` : 'oklch(0.22 0.008 260)'}`,
                      borderRadius: '2px',
                      color: categoryFilter === key ? cfg.color : 'oklch(0.55 0.010 260)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {cfg.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Intent indicator */}
            {searchResults?.intent && searchResults.intent.description && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                background: 'oklch(0.65 0.20 145 / 0.08)',
                border: '1px solid oklch(0.65 0.20 145 / 0.2)',
                borderRadius: '3px',
                marginBottom: '12px',
              }}>
                <Zap style={{ width: 14, height: 14, color: 'oklch(0.65 0.20 145)' }} />
                <span style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  fontSize: '0.82rem',
                  color: 'oklch(0.65 0.20 145)',
                }}>
                  {searchResults.intent.description}
                </span>
                <span style={{
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.7rem',
                  color: 'oklch(0.50 0.010 260)',
                  marginLeft: 'auto',
                }}>
                  {searchResults.results.length} results
                </span>
              </div>
            )}

            {/* Results */}
            {searchResults && searchResults.results.length > 0 && (
              <div>
                {searchResults.results.map((result) => (
                  <ResultCard
                    key={result.document.id}
                    result={result}
                    isExpanded={expandedResults.has(result.document.id)}
                    onToggle={() => toggleResult(result.document.id)}
                  />
                ))}
              </div>
            )}

            {/* No results */}
            {searchResults && searchResults.results.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'oklch(0.12 0.006 260)',
                border: '1px solid oklch(0.20 0.008 260)',
                borderRadius: '3px',
              }}>
                <Search style={{ width: 32, height: 32, color: 'oklch(0.30 0.008 260)', margin: '0 auto 12px' }} />
                <p style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '1.1rem',
                  letterSpacing: '0.06em',
                  color: 'oklch(0.50 0.010 260)',
                }}>
                  NO RESULTS FOUND
                </p>
                <p style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  fontSize: '0.82rem',
                  color: 'oklch(0.40 0.008 260)',
                }}>
                  Try different keywords or check the reference tabs
                </p>
              </div>
            )}

            {/* Empty state */}
            {!searchResults && (
              <div style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'oklch(0.12 0.006 260)',
                border: '1px solid oklch(0.20 0.008 260)',
                borderRadius: '3px',
              }}>
                <Database style={{ width: 40, height: 40, color: 'oklch(0.25 0.008 260)', margin: '0 auto 16px' }} />
                <p style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '1.3rem',
                  letterSpacing: '0.08em',
                  color: 'oklch(0.50 0.010 260)',
                  marginBottom: '8px',
                }}>
                  KNOWLEDGE BASE READY
                </p>
                <p style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  fontSize: '0.85rem',
                  color: 'oklch(0.40 0.008 260)',
                  marginBottom: '20px',
                  maxWidth: '500px',
                  margin: '0 auto',
                }}>
                  Search across SAE J1979, J1979-2, GM Mode 6 definitions, and OBD-II PID specifications.
                  Try queries like "boost pressure formula", "mode 6 EGR", or "$0C".
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '8px',
                  marginTop: '24px',
                  maxWidth: '600px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}>
                  {Object.entries(stats.categories).map(([cat, count]) => {
                    const cfg = categoryConfig[cat] || categoryConfig.standard;
                    return (
                      <div key={cat} style={{
                        padding: '10px',
                        background: 'oklch(0.11 0.005 260)',
                        border: '1px solid oklch(0.18 0.006 260)',
                        borderTop: `2px solid ${cfg.color}`,
                        borderRadius: '3px',
                        textAlign: 'center',
                      }}>
                        <div style={{
                          fontFamily: '"Share Tech Mono", monospace',
                          fontSize: '1.2rem',
                          color: cfg.color,
                          fontWeight: 700,
                        }}>
                          {count}
                        </div>
                        <div style={{
                          fontFamily: '"Rajdhani", sans-serif',
                          fontSize: '0.72rem',
                          color: 'oklch(0.50 0.010 260)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>
                          {cfg.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PID Reference tab */}
        {activeTab === 'pids' && (
          <div className="ppei-anim-fade-up">
            <PidReferencePanel />
          </div>
        )}

        {/* Mode 6 tab */}
        {activeTab === 'mode6' && (
          <div className="ppei-anim-fade-up">
            <Mode6Panel />
          </div>
        )}

        {/* UDS tab */}
        {activeTab === 'uds' && (
          <div className="ppei-anim-fade-up">
            <UDSPanel />
          </div>
        )}

        {/* OBD Services tab */}
        {activeTab === 'services' && (
          <div className="ppei-anim-fade-up">
            <OBDServicesPanel />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid oklch(0.18 0.006 260)',
        marginTop: '3rem',
        padding: '1.5rem 0',
      }}>
        <div style={{
          height: '2px',
          background: 'linear-gradient(90deg, oklch(0.52 0.22 25) 0%, oklch(0.65 0.20 40) 40%, oklch(0.70 0.18 60) 60%, oklch(0.65 0.20 145) 80%, oklch(0.70 0.18 200) 100%)',
          marginBottom: '1rem',
        }} />
        <div className="container mx-auto px-4 text-center">
          <p style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '0.85rem',
            letterSpacing: '0.12em',
            color: 'oklch(0.35 0.008 260)',
          }}>
            PPEI CUSTOM TUNING · ADVANCED DIAGNOSTICS · PPEI.COM
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function Advanced() {
  const [unlocked, setUnlocked] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const handleLock = () => {
    localStorage.removeItem(STORAGE_KEY);
    setUnlocked(false);
  };

  if (!unlocked) {
    return <AccessGate onUnlock={() => setUnlocked(true)} />;
  }

  return <AdvancedDashboard onLock={handleLock} />;
}
