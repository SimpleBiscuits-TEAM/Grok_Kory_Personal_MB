import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DiagnosticIssue, DiagnosticReport } from '@/lib/diagnostics';

interface DiagnosticReportProps {
  report: DiagnosticReport;
}

export function DiagnosticReportComponent({ report }: DiagnosticReportProps) {
  const criticalIssues = report.issues.filter((i) => i.severity === 'critical');
  const warningIssues = report.issues.filter((i) => i.severity === 'warning');
  const infoIssues = report.issues.filter((i) => i.severity === 'info');

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="p-6 border-l-4 border-l-blue-600 bg-blue-50">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Diagnostic Summary</h3>
            <p className="text-sm text-gray-700">{report.summary}</p>
            <p className="text-xs text-gray-500 mt-2">
              Generated: {report.timestamp.toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {/* Critical Issues */}
      {criticalIssues.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h4 className="font-semibold text-gray-900">
              Critical Issues ({criticalIssues.length})
            </h4>
          </div>
          <div className="space-y-3">
            {criticalIssues.map((issue) => (
              <IssueCard key={issue.code} issue={issue} />
            ))}
          </div>
        </div>
      )}

      {/* Warning Issues */}
      {warningIssues.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <h4 className="font-semibold text-gray-900">
              Warnings ({warningIssues.length})
            </h4>
          </div>
          <div className="space-y-3">
            {warningIssues.map((issue) => (
              <IssueCard key={issue.code} issue={issue} />
            ))}
          </div>
        </div>
      )}

      {/* Info Issues */}
      {infoIssues.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-gray-900">
              Information ({infoIssues.length})
            </h4>
          </div>
          <div className="space-y-3">
            {infoIssues.map((issue) => (
              <IssueCard key={issue.code} issue={issue} />
            ))}
          </div>
        </div>
      )}

      {/* No Issues */}
      {report.issues.length === 0 && (
        <Card className="p-6 border-l-4 border-l-green-600 bg-green-50">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">All Systems Normal</h3>
              <p className="text-sm text-gray-700">
                No diagnostic issues detected. Engine parameters are within normal ranges.
              </p>
            </div>
          </div>
        </Card>
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
      bg: 'bg-red-50',
      border: 'border-l-red-600',
      icon: AlertCircle,
      iconColor: 'text-red-600',
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-l-yellow-600',
      icon: AlertTriangle,
      iconColor: 'text-yellow-600',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-l-blue-600',
      icon: Info,
      iconColor: 'text-blue-600',
    },
  };

  const config = severityConfig[issue.severity];
  const Icon = config.icon;

  return (
    <Card className={`p-4 border-l-4 ${config.border} ${config.bg}`}>
      <div className="flex gap-3">
        <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h5 className="font-semibold text-gray-900">{issue.title}</h5>
              <p className="text-xs text-gray-500 font-mono">{issue.code}</p>
            </div>
          </div>

          <p className="text-sm text-gray-700 mb-3">{issue.description}</p>

          <div className="bg-white rounded p-3 border border-gray-200">
            <p className="text-xs font-semibold text-gray-600 mb-1">Recommendation:</p>
            <p className="text-sm text-gray-700">{issue.recommendation}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Exportable diagnostic report for PDF
 */
export function DiagnosticReportForPDF({ report }: DiagnosticReportProps) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-bold text-base mb-2">Diagnostic Analysis</h3>
        <p className="text-gray-700 mb-4">{report.summary}</p>
      </div>

      {report.issues.map((issue) => (
        <div key={issue.code} className="border-l-4 pl-3 py-2">
          <p className="font-bold text-gray-900">{issue.title}</p>
          <p className="text-xs text-gray-500 mb-1">{issue.code}</p>
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
