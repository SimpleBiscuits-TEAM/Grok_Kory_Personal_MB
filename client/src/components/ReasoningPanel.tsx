/**
 * PPEI Custom Tuning — AI Reasoning Panel
 * Displays the output of the PPEI AI reasoning engine:
 * - Operating context (warmup detection, format, etc.)
 * - Context-aware findings with evidence chains
 * - Beta improvement suggestions
 */

import { useState } from 'react';
import { Brain, ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info, Lightbulb, Wrench, Zap, ThumbsUp } from 'lucide-react';
import type { ReasoningReport, ReasoningFinding, BetaImprovement } from '@/lib/reasoningEngine';

interface ReasoningPanelProps {
  report: ReasoningReport;
}

const categoryColors: Record<string, string> = {
  transmission: 'oklch(0.65 0.18 200)',
  fuel_system: 'oklch(0.70 0.18 60)',
  thermal: 'oklch(0.65 0.18 140)',
  boost: 'oklch(0.65 0.18 280)',
  general: 'oklch(0.65 0.010 260)',
};

const categoryLabels: Record<string, string> = {
  transmission: 'TRANSMISSION',
  fuel_system: 'FUEL SYSTEM',
  thermal: 'THERMAL',
  boost: 'BOOST / VGT',
  general: 'GENERAL',
};

const typeIcons: Record<string, React.ReactNode> = {
  fault: <AlertCircle style={{ width: '15px', height: '15px', color: 'oklch(0.52 0.22 25)', flexShrink: 0 }} />,
  warning: <AlertTriangle style={{ width: '15px', height: '15px', color: 'oklch(0.75 0.18 60)', flexShrink: 0 }} />,
  improvement: <Lightbulb style={{ width: '15px', height: '15px', color: 'oklch(0.70 0.18 200)', flexShrink: 0 }} />,
  info: <Info style={{ width: '15px', height: '15px', color: 'oklch(0.65 0.010 260)', flexShrink: 0 }} />,
};

const typeBorderColors: Record<string, string> = {
  fault: 'oklch(0.52 0.22 25)',
  warning: 'oklch(0.75 0.18 60)',
  improvement: 'oklch(0.70 0.18 200)',
  info: 'oklch(0.45 0.010 260)',
};

const confidenceBadge: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'oklch(0.15 0.05 140)', text: 'oklch(0.65 0.18 140)', label: 'HIGH CONFIDENCE' },
  medium: { bg: 'oklch(0.15 0.05 60)', text: 'oklch(0.75 0.18 60)', label: 'MEDIUM CONFIDENCE' },
  low: { bg: 'oklch(0.15 0.010 260)', text: 'oklch(0.55 0.010 260)', label: 'LOW CONFIDENCE' },
};

function FindingCard({ finding }: { finding: ReasoningFinding }) {
  const [expanded, setExpanded] = useState(finding.type === 'fault' || finding.type === 'warning');
  const borderColor = typeBorderColors[finding.type];
  const catColor = categoryColors[finding.category];
  const conf = confidenceBadge[finding.confidence];

  return (
    <div style={{
      background: 'oklch(0.11 0.006 260)',
      border: `1px solid oklch(0.20 0.008 260)`,
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: '3px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '0.75rem 1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {typeIcons[finding.type]}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '0.95rem',
              letterSpacing: '0.05em',
              color: 'white',
            }}>{finding.title}</span>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.62rem',
              padding: '1px 6px',
              borderRadius: '2px',
              background: `oklch(0.15 0.03 ${finding.category === 'transmission' ? '200' : finding.category === 'fuel_system' ? '60' : '260'})`,
              color: catColor,
              letterSpacing: '0.08em',
            }}>{categoryLabels[finding.category]}</span>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.62rem',
              padding: '1px 6px',
              borderRadius: '2px',
              background: conf.bg,
              color: conf.text,
              letterSpacing: '0.08em',
            }}>{conf.label}</span>
          </div>
        </div>
        {expanded
          ? <ChevronDown style={{ width: '14px', height: '14px', color: 'oklch(0.45 0.008 260)', flexShrink: 0 }} />
          : <ChevronRight style={{ width: '14px', height: '14px', color: 'oklch(0.45 0.008 260)', flexShrink: 0 }} />
        }
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Reasoning */}
          <div>
            <p style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.875rem',
              color: 'oklch(0.75 0.010 260)',
              lineHeight: 1.6,
              margin: 0,
            }}>{finding.reasoning}</p>
          </div>

          {/* Evidence chain */}
          {finding.evidence.length > 0 && (
            <div style={{
              background: 'oklch(0.08 0.004 260)',
              border: '1px solid oklch(0.18 0.006 260)',
              borderRadius: '2px',
              padding: '0.6rem 0.75rem',
            }}>
              <p style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.65rem',
                color: 'oklch(0.50 0.010 260)',
                letterSpacing: '0.08em',
                margin: '0 0 6px 0',
              }}>EVIDENCE CHAIN</p>
              {finding.evidence.map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.45 0.010 260)', flexShrink: 0 }}>▸</span>
                  <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.65 0.010 260)', lineHeight: 1.5 }}>{e}</span>
                </div>
              ))}
            </div>
          )}

          {/* Suggestion */}
          {finding.suggestion && (
            <div style={{
              background: 'oklch(0.10 0.03 140)',
              border: '1px solid oklch(0.20 0.06 140)',
              borderRadius: '2px',
              padding: '0.6rem 0.75rem',
              display: 'flex',
              gap: '8px',
            }}>
              <Wrench style={{ width: '13px', height: '13px', color: 'oklch(0.65 0.18 140)', flexShrink: 0, marginTop: '2px' }} />
              <p style={{
                fontFamily: '"Rajdhani", sans-serif',
                fontSize: '0.82rem',
                color: 'oklch(0.70 0.10 140)',
                margin: 0,
                lineHeight: 1.5,
              }}>{finding.suggestion}</p>
            </div>
          )}

          {/* Beta note */}
          {finding.betaNote && (
            <div style={{
              background: 'oklch(0.09 0.02 280)',
              border: '1px solid oklch(0.18 0.04 280)',
              borderRadius: '2px',
              padding: '0.5rem 0.75rem',
              display: 'flex',
              gap: '8px',
            }}>
              <Zap style={{ width: '12px', height: '12px', color: 'oklch(0.60 0.15 280)', flexShrink: 0, marginTop: '2px' }} />
              <p style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.65rem',
                color: 'oklch(0.55 0.10 280)',
                margin: 0,
                lineHeight: 1.5,
              }}>{finding.betaNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BetaImprovementCard({ improvement }: { improvement: BetaImprovement }) {
  const [expanded, setExpanded] = useState(improvement.priority === 'high');
  const priorityColor = improvement.priority === 'high'
    ? 'oklch(0.52 0.22 25)'
    : improvement.priority === 'medium'
    ? 'oklch(0.75 0.18 60)'
    : 'oklch(0.65 0.010 260)';

  return (
    <div style={{
      background: 'oklch(0.11 0.006 260)',
      border: '1px solid oklch(0.20 0.008 260)',
      borderLeft: `3px solid ${priorityColor}`,
      borderRadius: '3px',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '0.65rem 1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Lightbulb style={{ width: '13px', height: '13px', color: priorityColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'oklch(0.80 0.010 260)',
            }}>{improvement.area}</span>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.60rem',
              padding: '1px 5px',
              borderRadius: '2px',
              background: `oklch(0.13 0.03 25)`,
              color: priorityColor,
              letterSpacing: '0.08em',
            }}>{improvement.priority.toUpperCase()} PRIORITY</span>
          </div>
        </div>
        {expanded
          ? <ChevronDown style={{ width: '13px', height: '13px', color: 'oklch(0.40 0.008 260)', flexShrink: 0 }} />
          : <ChevronRight style={{ width: '13px', height: '13px', color: 'oklch(0.40 0.008 260)', flexShrink: 0 }} />
        }
      </button>

      {expanded && (
        <div style={{ padding: '0 1rem 0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.65 0.010 260)', margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: 'oklch(0.75 0.010 260)' }}>Observation:</strong> {improvement.observation}
          </p>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.82rem', color: 'oklch(0.65 0.010 260)', margin: 0, lineHeight: 1.5 }}>
            <strong style={{ color: 'oklch(0.75 0.010 260)' }}>Suggestion:</strong> {improvement.suggestion}
          </p>
        </div>
      )}
    </div>
  );
}

export function ReasoningPanel({ report }: ReasoningPanelProps) {
  const [showBeta, setShowBeta] = useState(false);
  const ctx = report.operatingContext;

  const faultFindings = report.findings.filter(f => f.type === 'fault');
  const warningFindings = report.findings.filter(f => f.type === 'warning');
  const infoFindings = report.findings.filter(f => f.type === 'info' || f.type === 'improvement');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid oklch(0.18 0.006 260)',
      }}>
        <Brain style={{ width: '20px', height: '20px', color: 'oklch(0.52 0.22 25)' }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '1.1rem',
              letterSpacing: '0.06em',
              color: 'white',
              margin: 0,
            }}>PPEI Ai Reasoning</h3>
            <span style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.55rem',
              fontWeight: 'bold',
              letterSpacing: '0.08em',
              color: 'oklch(0.52 0.22 25)',
              background: 'rgba(255,77,0,0.12)',
              border: '1px solid rgba(255,77,0,0.3)',
              borderRadius: '3px',
              padding: '1px 5px',
              lineHeight: 1.4,
            }}>BETA</span>
          </div>
          <p style={{
            fontFamily: '"Share Tech Mono", monospace',
            fontSize: '0.65rem',
            color: 'oklch(0.45 0.010 260)',
            margin: 0,
          }}>{report.engineVersion} — Context-Aware Analysis</p>
        </div>
      </div>

      {/* Summary */}
      <div style={{
        background: 'oklch(0.10 0.02 25)',
        border: '1px solid oklch(0.20 0.05 25)',
        borderRadius: '3px',
        padding: '0.75rem 1rem',
      }}>
        <p style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '0.9rem',
          color: 'oklch(0.80 0.010 260)',
          margin: 0,
          lineHeight: 1.6,
        }}>{report.summary}</p>
      </div>

      {/* Operating Context Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <ContextBadge
          label="FORMAT"
          value={ctx.fileFormat.toUpperCase()}
          color="oklch(0.65 0.18 200)"
        />
        <ContextBadge
          label="TCC SIGNAL"
          value={ctx.tccPressureFormat === 'kpa_pcs' ? 'kPa (TCCPCSCP)' : '% DUTY'}
          color="oklch(0.65 0.18 200)"
        />
        {ctx.warmupPhaseDetected && (
          <ContextBadge
            label="COLD START"
            value={`DETECTED — ${(ctx.warmupCompletedAt / 60).toFixed(1)}min WARMUP`}
            color="oklch(0.65 0.18 140)"
          />
        )}
        <ContextBadge
          label="MAX ECT"
          value={`${ctx.maxCoolantTempF.toFixed(0)}°F`}
          color={ctx.operatingTempReached ? 'oklch(0.65 0.18 140)' : 'oklch(0.75 0.18 60)'}
        />
        {ctx.tccFullLockDetected && (
          <ContextBadge
            label="TCC FULL LOCK"
            value={`${ctx.tccFullLockSamples} SAMPLES`}
            color="oklch(0.65 0.18 200)"
          />
        )}
        <ContextBadge
          label="MAX RPM"
          value={`${ctx.maxRpmObserved.toFixed(0)} RPM`}
          color="oklch(0.65 0.010 260)"
        />
        <ContextBadge
          label="MAX SPEED"
          value={`${ctx.maxVehicleSpeedMph.toFixed(0)} MPH`}
          color="oklch(0.65 0.010 260)"
        />
      </div>

      {/* Fault Findings */}
      {faultFindings.length > 0 && (
        <div>
          <SectionHeader icon={<AlertCircle style={{ width: '14px', height: '14px', color: 'oklch(0.52 0.22 25)' }} />} label="CONFIRMED FAULTS" count={faultFindings.length} color="oklch(0.52 0.22 25)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {faultFindings.map(f => <FindingCard key={f.id} finding={f} />)}
          </div>
        </div>
      )}

      {/* Warning Findings */}
      {warningFindings.length > 0 && (
        <div>
          <SectionHeader icon={<AlertTriangle style={{ width: '14px', height: '14px', color: 'oklch(0.75 0.18 60)' }} />} label="WARNINGS" count={warningFindings.length} color="oklch(0.75 0.18 60)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {warningFindings.map(f => <FindingCard key={f.id} finding={f} />)}
          </div>
        </div>
      )}

      {/* Info / Improvement Findings */}
      {infoFindings.length > 0 && (
        <div>
          <SectionHeader icon={<Info style={{ width: '14px', height: '14px', color: 'oklch(0.65 0.010 260)' }} />} label="ANALYSIS NOTES" count={infoFindings.length} color="oklch(0.65 0.010 260)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {infoFindings.map(f => <FindingCard key={f.id} finding={f} />)}
          </div>
        </div>
      )}

      {/* No findings */}
      {report.findings.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '1rem',
          background: 'oklch(0.10 0.02 140)',
          border: '1px solid oklch(0.20 0.05 140)',
          borderRadius: '3px',
        }}>
          <ThumbsUp style={{ width: '16px', height: '16px', color: 'oklch(0.65 0.18 140)' }} />
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.70 0.10 140)', margin: 0 }}>
            No issues detected. All analyzed parameters appear within normal operating ranges.
          </p>
        </div>
      )}

      {/* Beta Improvement Suggestions */}
      {report.betaImprovements.length > 0 && (
        <div>
          <button
            onClick={() => setShowBeta(!showBeta)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0.5rem 0',
              width: '100%',
            }}
          >
            <Zap style={{ width: '14px', height: '14px', color: 'oklch(0.60 0.15 280)' }} />
            <span style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '0.9rem',
              letterSpacing: '0.06em',
              color: 'oklch(0.60 0.15 280)',
            }}>BETA IMPROVEMENT SUGGESTIONS ({report.betaImprovements.length})</span>
            {showBeta
              ? <ChevronDown style={{ width: '13px', height: '13px', color: 'oklch(0.45 0.010 260)', marginLeft: 'auto' }} />
              : <ChevronRight style={{ width: '13px', height: '13px', color: 'oklch(0.45 0.010 260)', marginLeft: 'auto' }} />
            }
          </button>

          {showBeta && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{
                fontFamily: '"Share Tech Mono", monospace',
                fontSize: '0.65rem',
                color: 'oklch(0.45 0.010 260)',
                margin: '0 0 4px 0',
                lineHeight: 1.5,
              }}>
                These suggestions are generated by the PPEI AI Beta engine based on patterns in your datalog.
                They are not faults — they are recommendations to improve diagnostic coverage and data quality.
              </p>
              {report.betaImprovements.map(imp => (
                <BetaImprovementCard key={imp.id} improvement={imp} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContextBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      background: 'oklch(0.10 0.005 260)',
      border: '1px solid oklch(0.18 0.006 260)',
      borderRadius: '2px',
      padding: '2px 8px',
    }}>
      <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.60rem', color: 'oklch(0.40 0.008 260)', letterSpacing: '0.08em' }}>{label}:</span>
      <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.65rem', color, letterSpacing: '0.04em' }}>{value}</span>
    </div>
  );
}

function SectionHeader({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {icon}
      <span style={{
        fontFamily: '"Bebas Neue", "Impact", sans-serif',
        fontSize: '0.9rem',
        letterSpacing: '0.06em',
        color,
      }}>{label}</span>
      <span style={{
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '0.65rem',
        background: 'oklch(0.15 0.005 260)',
        color: 'oklch(0.50 0.010 260)',
        padding: '1px 6px',
        borderRadius: '2px',
      }}>{count}</span>
    </div>
  );
}
