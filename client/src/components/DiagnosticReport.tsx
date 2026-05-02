/**
 * V-OP by PPEI — DiagnosticReport Component
 * Dark theme: black bg, red critical, amber warning, cyan info
 * Typography: Bebas Neue headings, Rajdhani body, Share Tech Mono for codes
 * Features: Full detailed view + "Quick Rundown" simplified summary toggle
 */

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Gauge, Wrench } from 'lucide-react';
import { DiagnosticIssue, DiagnosticReport } from '@/lib/diagnostics';

interface DiagnosticReportProps {
  report: DiagnosticReport;
}

/* ── Quick Rundown: plain-English diagnostic summary ── */
function DiagnosticQuickRundown({ report }: { report: DiagnosticReport }) {
  const criticalCount = report.issues.filter(i => i.severity === 'critical').length;
  const warningCount = report.issues.filter(i => i.severity === 'warning').length;
  const infoCount = report.issues.filter(i => i.severity === 'info').length;
  const total = report.issues.length;

  const getVerdict = () => {
    if (total === 0) return "Clean bill of health — no fault conditions found in this log. Your truck's behaving.";
    if (criticalCount > 0) return `Found ${criticalCount} critical condition${criticalCount > 1 ? 's' : ''} that need${criticalCount === 1 ? 's' : ''} attention right away. Don't ignore these — they can leave you on the side of the road.`;
    if (warningCount > 0) return `Nothing critical, but ${warningCount} warning${warningCount > 1 ? 's' : ''} worth watching. Keep an eye on these before your next long haul or heavy tow.`;
    return `Just ${infoCount} informational note${infoCount > 1 ? 's' : ''} — nothing to lose sleep over. Good shape overall.`;
  };

  const severityColor = (s: string) => {
    if (s === 'critical') return 'oklch(0.52 0.22 25)';
    if (s === 'warning') return 'oklch(0.75 0.18 60)';
    return 'oklch(0.70 0.18 200)';
  };

  const borderColor = total === 0 ? 'oklch(0.65 0.20 145)' : criticalCount > 0 ? 'oklch(0.52 0.22 25)' : warningCount > 0 ? 'oklch(0.75 0.18 60)' : 'oklch(0.70 0.18 200)';

  return (
    <div style={{
      background: 'linear-gradient(135deg, oklch(0.12 0.008 260) 0%, oklch(0.14 0.006 260) 100%)',
      border: `1px solid ${borderColor}44`,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: '3px',
      padding: '1.25rem 1.5rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
        <Gauge style={{ width: '22px', height: '22px', color: borderColor }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white', margin: 0 }}>
            QUICK RUNDOWN
          </h3>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.78rem', color: 'oklch(0.58 0.008 260)', margin: 0 }}>
            The short version — no jargon, just what matters
          </p>
        </div>
        {/* Severity counter badges */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {criticalCount > 0 && (
            <div style={{ background: 'oklch(0.52 0.22 25 / 0.15)', border: '1px solid oklch(0.52 0.22 25 / 0.4)', borderRadius: '2px', padding: '2px 10px', fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.06em', color: 'oklch(0.75 0.18 25)' }}>
              {criticalCount} CRITICAL
            </div>
          )}
          {warningCount > 0 && (
            <div style={{ background: 'oklch(0.75 0.18 60 / 0.12)', border: '1px solid oklch(0.75 0.18 60 / 0.35)', borderRadius: '2px', padding: '2px 10px', fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.06em', color: 'oklch(0.80 0.18 60)' }}>
              {warningCount} WARNING
            </div>
          )}
          {infoCount > 0 && (
            <div style={{ background: 'oklch(0.70 0.18 200 / 0.12)', border: '1px solid oklch(0.70 0.18 200 / 0.35)', borderRadius: '2px', padding: '2px 10px', fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.06em', color: 'oklch(0.70 0.18 200)' }}>
              {infoCount} INFO
            </div>
          )}
        </div>
      </div>

      {/* Plain English Verdict */}
      <div style={{
        background: 'oklch(0.10 0.005 260)',
        border: '1px solid oklch(0.20 0.008 260)',
        borderRadius: '2px',
        padding: '12px 14px',
        marginBottom: '1rem',
      }}>
        <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.95rem', color: 'oklch(0.80 0.010 260)', margin: 0, lineHeight: 1.5 }}>
          {getVerdict()}
        </p>
      </div>

      {/* Issue one-liners (max 5) */}
      {total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {report.issues.slice(0, 5).map((issue, i) => (
            <div key={`${issue.code}-${i}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              background: 'oklch(0.10 0.005 260)',
              border: `1px solid ${severityColor(issue.severity)}22`,
              borderLeft: `3px solid ${severityColor(issue.severity)}`,
              borderRadius: '2px',
            }}>
              <div style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: severityColor(issue.severity), flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.88rem', fontWeight: 600, color: 'oklch(0.80 0.010 260)' }}>
                  {issue.title}
                </span>
                <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.7rem', color: 'oklch(0.55 0.008 260)', marginLeft: '8px' }}>
                  {issue.code.replace(/-/g, ' ')}
                </span>
              </div>
              <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.78rem', color: severityColor(issue.severity), textTransform: 'uppercase', fontWeight: 600, flexShrink: 0 }}>
                {issue.severity}
              </span>
            </div>
          ))}
          {total > 5 && (
            <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.55 0.008 260)', margin: 0, paddingLeft: '20px' }}>
              + {total - 5} more in full report
            </p>
          )}
        </div>
      )}

      {/* Top recommendations (max 2) */}
      {total > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: '0.75rem', letterSpacing: '0.08em', color: 'oklch(0.55 0.008 260)', marginBottom: '6px' }}>
            TOP ACTIONS:
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {report.issues.filter(i => i.severity === 'critical' || i.severity === 'warning').slice(0, 2).map((issue, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontFamily: '"Rajdhani", sans-serif', fontSize: '0.85rem', color: 'oklch(0.70 0.010 260)' }}>
                <span style={{ color: 'oklch(0.70 0.18 200)', fontWeight: 'bold', flexShrink: 0 }}>→</span>{issue.recommendation}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DiagnosticReportComponent({ report }: DiagnosticReportProps) {
  const [basicMode, setBasicMode] = useState(true);
  const criticalIssues = report.issues.filter((i) => i.severity === 'critical');
  const warningIssues = report.issues.filter((i) => i.severity === 'warning');
  const infoIssues = report.issues.filter((i) => i.severity === 'info');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── BASIC BREAKDOWN / FULL REPORT TOGGLE ── */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderRadius: '4px',
        overflow: 'hidden',
        border: '1px solid oklch(0.28 0.010 260)',
        alignSelf: 'stretch',
      }}>
        <button
          onClick={() => setBasicMode(true)}
          style={{
            flex: 1,
            background: basicMode ? 'oklch(0.52 0.22 25)' : 'oklch(0.14 0.006 260)',
            color: basicMode ? 'white' : 'oklch(0.55 0.010 260)',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.95rem',
            letterSpacing: '0.08em',
            padding: '10px 20px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Gauge style={{ width: '15px', height: '15px' }} />
          BASIC BREAKDOWN
        </button>
        <button
          onClick={() => setBasicMode(false)}
          style={{
            flex: 1,
            background: !basicMode ? 'oklch(0.70 0.18 200)' : 'oklch(0.14 0.006 260)',
            color: !basicMode ? 'white' : 'oklch(0.55 0.010 260)',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.95rem',
            letterSpacing: '0.08em',
            padding: '10px 20px',
            border: 'none',
            borderLeft: '1px solid oklch(0.22 0.008 260)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Wrench style={{ width: '15px', height: '15px' }} />
          FULL DETAILED REPORT
        </button>
      </div>

      {basicMode ? (
        <DiagnosticQuickRundown report={report} />
      ) : (
        <>
          {/* Summary Card */}
          <div style={{
            background: 'oklch(0.13 0.006 260)',
            border: '1px solid oklch(0.22 0.008 260)',
            borderLeft: '4px solid oklch(0.70 0.18 200)',
            borderRadius: '3px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <CheckCircle2 style={{ width: '20px', height: '20px', color: 'oklch(0.70 0.18 200)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h3 style={{
                fontFamily: '"Bebas Neue", "Impact", sans-serif',
                fontSize: '1rem',
                letterSpacing: '0.06em',
                color: 'white',
                margin: 0,
                marginBottom: '4px'
              }}>DIAGNOSTIC SUMMARY</h3>
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.75 0.010 260)', margin: 0 }}>
                {report.summary}
              </p>
              <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.72rem', color: 'oklch(0.60 0.008 260)', margin: 0, marginTop: '6px' }}>
                Generated: {report.timestamp.toLocaleString()}
              </p>
            </div>
          </div>

          {/* DTCs from vehicle */}
          {report.dtcs && report.dtcs.total > 0 && (
            <div style={{
              background: 'oklch(0.13 0.006 260)',
              border: '1px solid oklch(0.22 0.008 260)',
              borderLeft: '4px solid oklch(0.52 0.22 25)',
              borderRadius: '3px',
              padding: '1rem 1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <AlertCircle style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)' }} />
                <h3 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.06em',
                  color: 'oklch(0.75 0.18 25)',
                  margin: 0,
                }}>DIAGNOSTIC TROUBLE CODES ({report.dtcs.total})</h3>
              </div>
              {report.dtcs.stored.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.60 0.010 260)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stored DTCs</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {report.dtcs.stored.map((code, i) => (
                      <span key={`stored-${i}`} style={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: '0.85rem',
                        background: 'oklch(0.18 0.015 25)',
                        color: 'oklch(0.80 0.15 25)',
                        padding: '3px 10px',
                        borderRadius: '2px',
                        border: '1px solid oklch(0.30 0.06 25)',
                      }}>{code}</span>
                    ))}
                  </div>
                </div>
              )}
              {report.dtcs.pending.length > 0 && (
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.60 0.010 260)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending DTCs</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {report.dtcs.pending.map((code, i) => (
                      <span key={`pending-${i}`} style={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: '0.85rem',
                        background: 'oklch(0.18 0.015 60)',
                        color: 'oklch(0.80 0.15 60)',
                        padding: '3px 10px',
                        borderRadius: '2px',
                        border: '1px solid oklch(0.30 0.06 60)',
                      }}>{code}</span>
                    ))}
                  </div>
                </div>
              )}
              {report.dtcs.permanent.length > 0 && (
                <div>
                  <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.8rem', color: 'oklch(0.60 0.010 260)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Permanent DTCs</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {report.dtcs.permanent.map((code, i) => (
                      <span key={`perm-${i}`} style={{
                        fontFamily: '"Share Tech Mono", monospace',
                        fontSize: '0.85rem',
                        background: 'oklch(0.18 0.015 0)',
                        color: 'oklch(0.75 0.20 0)',
                        padding: '3px 10px',
                        borderRadius: '2px',
                        border: '1px solid oklch(0.30 0.10 0)',
                      }}>{code}</span>
                    ))}
                  </div>
                </div>
              )}
              <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.78rem', color: 'oklch(0.50 0.008 260)', margin: 0, marginTop: '10px' }}>
                DTCs were captured at the start of the datalog session. These codes provide context for the diagnostic analysis.
              </p>
            </div>
          )}

          {/* Critical Issues */}
          {criticalIssues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <AlertCircle style={{ width: '16px', height: '16px', color: 'oklch(0.52 0.22 25)' }} />
                <h4 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.06em',
                  color: 'oklch(0.75 0.18 25)',
                  margin: 0
                }}>
                    CRITICAL CONDITIONS DETECTED ({criticalIssues.length})
                </h4>
              </div>
              {criticalIssues.map((issue, i) => (
                <IssueCard key={`${issue.code}-${i}`} issue={issue} />
              ))}
            </div>
          )}

          {/* Warning Issues */}
          {warningIssues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <AlertTriangle style={{ width: '16px', height: '16px', color: 'oklch(0.75 0.18 60)' }} />
                <h4 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.06em',
                  color: 'oklch(0.80 0.18 60)',
                  margin: 0
                }}>
                  WARNING CONDITIONS ({warningIssues.length})
                </h4>
              </div>
              {warningIssues.map((issue, i) => (
                <IssueCard key={`${issue.code}-${i}`} issue={issue} />
              ))}
            </div>
          )}

          {/* Info Issues */}
          {infoIssues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <Info style={{ width: '16px', height: '16px', color: 'oklch(0.70 0.18 200)' }} />
                <h4 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.06em',
                  color: 'oklch(0.70 0.18 200)',
                  margin: 0
                }}>
                  INFORMATIONAL CONDITIONS ({infoIssues.length})
                </h4>
              </div>
              {infoIssues.map((issue, i) => (
                <IssueCard key={`${issue.code}-${i}`} issue={issue} />
              ))}
            </div>
          )}

          {/* No Issues */}
          {report.issues.length === 0 && (
            <div style={{
              background: 'oklch(0.13 0.006 260)',
              border: '1px solid oklch(0.22 0.008 260)',
              borderLeft: '4px solid oklch(0.65 0.20 145)',
              borderRadius: '3px',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <CheckCircle2 style={{ width: '20px', height: '20px', color: 'oklch(0.65 0.20 145)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h3 style={{
                  fontFamily: '"Bebas Neue", "Impact", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.06em',
                  color: 'white',
                  margin: 0,
                  marginBottom: '4px'
                }}>ALL SYSTEMS NORMAL</h3>
                <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.65 0.010 260)', margin: 0 }}>
                  No potential fault areas detected. Engine parameters are within normal operating ranges.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface IssueCardProps {
  issue: DiagnosticIssue;
}

function IssueCard({ issue }: IssueCardProps) {
  const severityConfig = {
    critical: {
      borderColor: 'oklch(0.52 0.22 25)',
      iconColor: 'oklch(0.52 0.22 25)',
      codeColor: 'oklch(0.75 0.18 25)',
      icon: AlertCircle,
    },
    warning: {
      borderColor: 'oklch(0.75 0.18 60)',
      iconColor: 'oklch(0.75 0.18 60)',
      codeColor: 'oklch(0.80 0.18 60)',
      icon: AlertTriangle,
    },
    info: {
      borderColor: 'oklch(0.70 0.18 200)',
      iconColor: 'oklch(0.70 0.18 200)',
      codeColor: 'oklch(0.70 0.18 200)',
      icon: Info,
    },
  };

  const config = severityConfig[issue.severity];
  const Icon = config.icon;

  return (
    <div style={{
      background: 'oklch(0.13 0.006 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderLeft: `4px solid ${config.borderColor}`,
      borderRadius: '3px',
      padding: '1rem 1.25rem',
      display: 'flex',
      gap: '12px'
    }}>
      <Icon style={{ width: '18px', height: '18px', color: config.iconColor, flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <div>
            <h5 style={{
              fontFamily: '"Bebas Neue", "Impact", sans-serif',
              fontSize: '1rem',
              letterSpacing: '0.05em',
              color: 'white',
              margin: 0
            }}>{issue.title}</h5>
            <p style={{
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.72rem',
              color: config.codeColor,
              margin: 0,
              letterSpacing: '0.05em'
            }}>POTENTIAL FAULT AREA: {issue.code.replace(/-/g, ' ')}</p>
          </div>
        </div>

        <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.70 0.010 260)', margin: 0, marginBottom: '10px' }}>
          {issue.description}
        </p>

        <div style={{
          background: 'oklch(0.10 0.005 260)',
          border: '1px solid oklch(0.20 0.008 260)',
          borderRadius: '2px',
          padding: '10px 12px'
        }}>
          <p style={{
            fontFamily: '"Bebas Neue", "Impact", sans-serif',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            color: 'oklch(0.63 0.010 260)',
            margin: 0,
            marginBottom: '4px'
          }}>RECOMMENDATION:</p>
          <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.88rem', color: 'oklch(0.75 0.010 260)', margin: 0 }}>
            {issue.recommendation}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Exportable diagnostic report for PDF — keeps light styling for print
 */
export function DiagnosticReportForPDF({ report }: DiagnosticReportProps) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-bold text-base mb-2">Potential Fault Area Analysis</h3>
        <p className="text-gray-700 mb-4">{report.summary}</p>
      </div>

      {report.issues.map((issue, i) => (
        <div key={`${issue.code}-${i}`} className="border-l-4 pl-3 py-2">
          <p className="font-bold text-gray-900">{issue.title}</p>
          <p className="text-xs text-gray-500 mb-1">Potential Fault Area: {issue.code.replace(/-/g, ' ')}</p>
          <p className="text-gray-700 mb-2">{issue.description}</p>
          <p className="text-gray-700 bg-gray-100 p-2 rounded">
            <span className="font-semibold">Recommendation: </span>
            {issue.recommendation}
          </p>
        </div>
      ))}
    </div>
  );
}
