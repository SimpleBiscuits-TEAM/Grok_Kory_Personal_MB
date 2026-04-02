/**
 * V-OP by PPEI — DiagnosticReport Component
 * Dark theme: black bg, red critical, amber warning, cyan info
 * Typography: Bebas Neue headings, Rajdhani body, Share Tech Mono for codes
 */

import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { DiagnosticIssue, DiagnosticReport } from '@/lib/diagnostics';

interface DiagnosticReportProps {
  report: DiagnosticReport;
}

export function DiagnosticReportComponent({ report }: DiagnosticReportProps) {
  const criticalIssues = report.issues.filter((i) => i.severity === 'critical');
  const warningIssues = report.issues.filter((i) => i.severity === 'warning');
  const infoIssues = report.issues.filter((i) => i.severity === 'info');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
