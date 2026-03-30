/**
 * DragTimeslip — V-OP Beta
 *
 * Displays drag racing analysis results in a timeslip-style card
 * matching the aesthetic of a real drag strip timing slip.
 */

import { DragAnalysis, DragRun, DragTip } from '@/lib/dragAnalyzer';
import { AlertTriangle, CheckCircle2, Flag, Gauge, Zap, TrendingDown, Clock, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useState } from 'react';

interface DragTimeslipProps {
  analysis: DragAnalysis;
}

const severityConfig = {
  critical: { color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30', icon: AlertTriangle },
  warning:  { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', icon: AlertTriangle },
  info:     { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30', icon: Info },
};

const categoryLabels: Record<DragTip['category'], string> = {
  launch: 'LAUNCH',
  tcc: 'CONVERTER',
  fuel: 'FUEL SYSTEM',
  boost: 'BOOST',
  shift: 'SHIFT TIMING',
  general: 'GENERAL',
};

const qualityColors = {
  excellent: 'text-green-400 border-green-400/50 bg-green-400/10',
  good: 'text-blue-400 border-blue-400/50 bg-blue-400/10',
  fair: 'text-yellow-400 border-yellow-400/50 bg-yellow-400/10',
  poor: 'text-red-400 border-red-400/50 bg-red-400/10',
};

function TimeslipCard({ run, runIndex, isBest }: { run: DragRun; runIndex: number; isBest: boolean }) {
  const has14 = run.time1320ft !== null;
  const has18 = run.time660ft !== null;

  return (
    <div style={{
      background: 'oklch(0.10 0.005 260)',
      border: `1px solid ${isBest ? 'oklch(0.52 0.22 25)' : 'oklch(0.22 0.008 260)'}`,
      borderLeft: `4px solid ${isBest ? 'oklch(0.52 0.22 25)' : 'oklch(0.30 0.008 260)'}`,
      borderRadius: '3px',
      overflow: 'hidden',
      fontFamily: '"Share Tech Mono", monospace',
    }}>
      {/* Timeslip header */}
      <div style={{
        background: isBest ? 'oklch(0.52 0.22 25 / 0.15)' : 'oklch(0.13 0.006 260)',
        borderBottom: '1px solid oklch(0.22 0.008 260)',
        padding: '0.6rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Flag style={{ width: '14px', height: '14px', color: isBest ? 'oklch(0.52 0.22 25)' : 'oklch(0.55 0.010 260)' }} />
          <span style={{ fontSize: '0.75rem', letterSpacing: '0.08em', color: 'oklch(0.70 0.010 260)' }}>
            RUN {runIndex + 1}
          </span>
          {isBest && (
            <span style={{
              fontSize: '0.65rem',
              background: 'oklch(0.52 0.22 25)',
              color: 'white',
              padding: '1px 6px',
              borderRadius: '2px',
              letterSpacing: '0.06em',
            }}>BEST</span>
          )}
        </div>
        <span className={`text-xs border px-2 py-0.5 rounded-sm ${qualityColors[run.runQuality]}`} style={{ letterSpacing: '0.06em', fontSize: '0.65rem' }}>
          {run.runQuality.toUpperCase()}
        </span>
      </div>

      {/* Timeslip grid — mimics real drag strip slip */}
      <div style={{ padding: '0.75rem 1rem' }}>
        {/* Main timing grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1px',
          background: 'oklch(0.18 0.006 260)',
          border: '1px solid oklch(0.18 0.006 260)',
          borderRadius: '2px',
          overflow: 'hidden',
          marginBottom: '0.75rem',
        }}>
          {[
            { label: '60 FT', value: run.time60ft, unit: 's', highlight: true },
            { label: '330 FT', value: run.time330ft, unit: 's', highlight: false },
            { label: '1/8 MILE', value: run.time660ft, unit: 's', highlight: has18 },
            { label: '1/4 MILE', value: run.time1320ft, unit: 's', highlight: has14 },
          ].map(({ label, value, unit, highlight }) => (
            <div key={label} style={{
              background: highlight ? 'oklch(0.13 0.006 260)' : 'oklch(0.11 0.005 260)',
              padding: '0.6rem 0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '0.6rem', color: 'oklch(0.45 0.010 260)', letterSpacing: '0.06em', marginBottom: '3px' }}>
                {label}
              </div>
              <div style={{
                fontSize: value !== null ? '1.1rem' : '0.85rem',
                color: value !== null ? (highlight ? 'white' : 'oklch(0.70 0.010 260)') : 'oklch(0.35 0.008 260)',
                fontWeight: highlight ? 700 : 400,
              }}>
                {value !== null ? value.toFixed(3) : '---'}
              </div>
              {value !== null && (
                <div style={{ fontSize: '0.55rem', color: 'oklch(0.40 0.008 260)', marginTop: '1px' }}>{unit}</div>
              )}
            </div>
          ))}
        </div>

        {/* Trap speeds */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1px',
          background: 'oklch(0.18 0.006 260)',
          border: '1px solid oklch(0.18 0.006 260)',
          borderRadius: '2px',
          overflow: 'hidden',
          marginBottom: '0.75rem',
        }}>
          {[
            { label: '1/8 TRAP', value: run.speed660ft },
            { label: '1/4 TRAP', value: run.speed1320ft },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'oklch(0.11 0.005 260)', padding: '0.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'oklch(0.45 0.010 260)', letterSpacing: '0.06em', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '1rem', color: value !== null ? 'white' : 'oklch(0.35 0.008 260)' }}>
                {value !== null ? `${value.toFixed(1)} mph` : '---'}
              </div>
            </div>
          ))}
        </div>

        {/* Launch + peak stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginBottom: '0.75rem',
        }}>
          {[
            { label: 'LAUNCH RPM', value: run.launchRpm.toFixed(0), icon: <Gauge style={{ width: '11px', height: '11px' }} /> },
            { label: 'PEAK BOOST', value: run.peakBoost > 0 ? `${run.peakBoost.toFixed(1)} psi` : '---', icon: <Zap style={{ width: '11px', height: '11px' }} /> },
            { label: 'PEAK RPM', value: run.peakRpm.toFixed(0), icon: <TrendingDown style={{ width: '11px', height: '11px' }} /> },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{
              background: 'oklch(0.13 0.006 260)',
              border: '1px solid oklch(0.20 0.006 260)',
              borderRadius: '2px',
              padding: '0.4rem 0.5rem',
              textAlign: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', marginBottom: '2px', color: 'oklch(0.45 0.010 260)', fontSize: '0.6rem', letterSpacing: '0.05em' }}>
                {icon} {label}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'white' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Fault indicators */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {run.maxTccSlip > 75 && (
            <span style={{ fontSize: '0.65rem', background: 'oklch(0.52 0.22 25 / 0.15)', border: '1px solid oklch(0.52 0.22 25 / 0.4)', color: 'oklch(0.75 0.18 25)', padding: '2px 7px', borderRadius: '2px', letterSpacing: '0.04em' }}>
              TCC SLIP {run.maxTccSlip.toFixed(0)} RPM
            </span>
          )}
          {run.railPressureDropPct > 5 && (
            <span style={{ fontSize: '0.65rem', background: 'oklch(0.70 0.18 60 / 0.15)', border: '1px solid oklch(0.70 0.18 60 / 0.4)', color: 'oklch(0.80 0.15 60)', padding: '2px 7px', borderRadius: '2px', letterSpacing: '0.04em' }}>
              RAIL DROP {run.railPressureDropPct.toFixed(1)}%
            </span>
          )}
          {run.boostDropPct > 10 && (
            <span style={{ fontSize: '0.65rem', background: 'oklch(0.70 0.18 200 / 0.15)', border: '1px solid oklch(0.70 0.18 200 / 0.4)', color: 'oklch(0.75 0.15 200)', padding: '2px 7px', borderRadius: '2px', letterSpacing: '0.04em' }}>
              BOOST DROP {run.boostDropPct.toFixed(1)}%
            </span>
          )}
          {run.tccSlipTorqueLoss > 2 && (
            <span style={{ fontSize: '0.65rem', background: 'oklch(0.65 0.20 145 / 0.15)', border: '1px solid oklch(0.65 0.20 145 / 0.4)', color: 'oklch(0.70 0.18 145)', padding: '2px 7px', borderRadius: '2px', letterSpacing: '0.04em' }}>
              ~{run.tccSlipTorqueLoss.toFixed(1)}% TORQUE LOST
            </span>
          )}
          {run.estimatedEtGain > 0.05 && (
            <span style={{ fontSize: '0.65rem', background: 'oklch(0.52 0.22 25 / 0.10)', border: '1px solid oklch(0.52 0.22 25 / 0.35)', color: 'oklch(0.75 0.18 25)', padding: '2px 7px', borderRadius: '2px', letterSpacing: '0.04em' }}>
              ~{run.estimatedEtGain.toFixed(2)}s RECOVERABLE
            </span>
          )}
        </div>

        {/* Gear shifts */}
        {run.shifts.length > 0 && (
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid oklch(0.20 0.006 260)', paddingTop: '0.6rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'oklch(0.45 0.010 260)', letterSpacing: '0.06em', marginBottom: '5px' }}>GEAR SHIFTS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {run.shifts.map((shift, idx) => (
                <div key={idx} style={{
                  background: 'oklch(0.13 0.006 260)',
                  border: '1px solid oklch(0.20 0.006 260)',
                  borderRadius: '2px',
                  padding: '3px 7px',
                  fontSize: '0.65rem',
                  color: 'oklch(0.65 0.010 260)',
                }}>
                  <span style={{ color: 'white' }}>{shift.gear - 1}→{shift.gear}</span>
                  {' '}@{shift.timeFromLaunch.toFixed(2)}s
                  {' '}<span style={{ color: 'oklch(0.52 0.22 25)' }}>-{shift.rpmDrop.toFixed(0)}rpm</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DragTimeslip({ analysis }: DragTimeslipProps) {
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [expandedTip, setExpandedTip] = useState<number | null>(null);

  if (analysis.runsDetected === 0 && analysis.tips.length === 1) {
    // No runs and only the "no runs detected" tip
    return (
      <div style={{
        background: 'oklch(0.13 0.006 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderLeft: '4px solid oklch(0.70 0.18 200)',
        borderRadius: '3px',
        padding: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem' }}>
          <Flag style={{ width: '18px', height: '18px', color: 'oklch(0.70 0.18 200)' }} />
          <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.1rem', letterSpacing: '0.08em', color: 'white' }}>
            DRAG RACING ANALYZER
          </span>
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.52 0.22 25)', background: 'oklch(0.52 0.22 25 / 0.15)', border: '1px solid oklch(0.52 0.22 25 / 0.4)', padding: '1px 6px', borderRadius: '2px' }}>BETA</span>
        </div>
        <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.95rem', color: 'oklch(0.65 0.010 260)', lineHeight: 1.6 }}>
          {analysis.tips[0]?.detail ?? 'No drag runs detected in this datalog.'}
        </p>
      </div>
    );
  }

  const displayRuns = showAllRuns ? analysis.runs : analysis.runs.slice(0, 3);

  return (
    <div style={{ fontFamily: '"Rajdhani", sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Flag style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />
          <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.2rem', letterSpacing: '0.08em', color: 'white' }}>
            {analysis.runsDetected} DRAG RUN{analysis.runsDetected !== 1 ? 'S' : ''} DETECTED
          </span>
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.52 0.22 25)', background: 'oklch(0.52 0.22 25 / 0.15)', border: '1px solid oklch(0.52 0.22 25 / 0.4)', padding: '1px 6px', borderRadius: '2px' }}>BETA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: analysis.dataQuality === 'full' ? 'oklch(0.65 0.20 145)' : analysis.dataQuality === 'partial' ? 'oklch(0.75 0.18 60)' : 'oklch(0.65 0.18 25)', letterSpacing: '0.05em' }}>
            {analysis.dataQuality.toUpperCase()} DATA
          </span>
        </div>
      </div>

      {/* Timeslip cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1.25rem' }}>
        {displayRuns.map((run, idx) => (
          <TimeslipCard
            key={idx}
            run={run}
            runIndex={idx}
            isBest={run === analysis.bestRun}
          />
        ))}
      </div>

      {analysis.runs.length > 3 && (
        <button
          onClick={() => setShowAllRuns(v => !v)}
          style={{
            width: '100%',
            padding: '8px',
            background: 'oklch(0.13 0.006 260)',
            border: '1px solid oklch(0.22 0.008 260)',
            borderRadius: '3px',
            color: 'oklch(0.60 0.010 260)',
            fontFamily: '"Rajdhani", sans-serif',
            fontSize: '0.85rem',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginBottom: '1.25rem',
          }}
        >
          {showAllRuns ? <ChevronUp style={{ width: '14px', height: '14px' }} /> : <ChevronDown style={{ width: '14px', height: '14px' }} />}
          {showAllRuns ? 'SHOW LESS' : `SHOW ALL ${analysis.runs.length} RUNS`}
        </button>
      )}

      {/* Performance tips */}
      {analysis.tips.length > 0 && (
        <div>
          <div style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '1rem',
            letterSpacing: '0.08em',
            color: 'white',
            marginBottom: '0.75rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid oklch(0.22 0.008 260)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Zap style={{ width: '15px', height: '15px', color: 'oklch(0.52 0.22 25)' }} />
            PERFORMANCE RECOMMENDATIONS
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {analysis.tips.map((tip, idx) => {
              const cfg = severityConfig[tip.severity];
              const Icon = cfg.icon;
              const isExpanded = expandedTip === idx;

              return (
                <div key={idx} className={`border rounded-sm overflow-hidden ${cfg.bg}`}>
                  <button
                    onClick={() => setExpandedTip(isExpanded ? null : idx)}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${cfg.color}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.6rem', color: 'oklch(0.50 0.010 260)', letterSpacing: '0.06em' }}>
                          {categoryLabels[tip.category]}
                        </span>
                        <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'white', fontWeight: 600 }}>
                          {tip.title}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {tip.estimatedGain !== 'N/A' && tip.estimatedGain !== 'Already optimized' && (
                        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.65rem', color: 'oklch(0.65 0.20 145)', background: 'oklch(0.65 0.20 145 / 0.10)', border: '1px solid oklch(0.65 0.20 145 / 0.30)', padding: '1px 6px', borderRadius: '2px' }}>
                          +{tip.estimatedGain}
                        </span>
                      )}
                      {isExpanded
                        ? <ChevronUp style={{ width: '14px', height: '14px', color: 'oklch(0.50 0.010 260)' }} />
                        : <ChevronDown style={{ width: '14px', height: '14px', color: 'oklch(0.50 0.010 260)' }} />
                      }
                    </div>
                  </button>
                  {isExpanded && (
                    <div style={{ padding: '0 0.75rem 0.75rem 2.25rem', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.72 0.010 260)', lineHeight: 1.6 }}>
                      {tip.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
