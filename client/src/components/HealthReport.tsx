import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { HealthReportData } from "@/lib/healthReport";

interface HealthReportProps {
  report: HealthReportData;
}

export default function HealthReport({ report }: HealthReportProps) {
  const getStatusColor = (status: string) => {
    if (status.includes('Excellent')) return 'bg-green-100 text-green-800';
    if (status.includes('Good')) return 'bg-blue-100 text-blue-800';
    if (status.includes('Fair')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getOverallStatusColor = (status: string) => {
    if (status === 'excellent') return 'bg-green-50 border-green-200';
    if (status === 'good') return 'bg-blue-50 border-blue-200';
    if (status === 'fair') return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Overall Health Summary */}
      <Card className={`border-2 ${getOverallStatusColor(report.overallStatus)}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Vehicle Health Report</CardTitle>
              <CardDescription>Comprehensive diagnostic assessment</CardDescription>
            </div>
            <div className="text-right">
              <div className={`text-4xl font-bold ${getScoreColor(report.overallScore)}`}>
                {report.overallScore}
              </div>
              <div className="text-sm text-gray-600">Overall Score</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {report.overallStatus === 'excellent' && (
              <CheckCircle className="w-12 h-12 text-green-600" />
            )}
            {report.overallStatus === 'good' && (
              <CheckCircle className="w-12 h-12 text-blue-600" />
            )}
            {report.overallStatus === 'fair' && (
              <AlertTriangle className="w-12 h-12 text-yellow-600" />
            )}
            {report.overallStatus === 'poor' && (
              <AlertCircle className="w-12 h-12 text-red-600" />
            )}
            <div>
              <Badge className={getStatusColor(report.overallStatus)}>
                {report.overallStatus.toUpperCase()}
              </Badge>
              <p className="text-sm text-gray-600 mt-2">
                {report.overallStatus === 'excellent' && 'All systems operating optimally'}
                {report.overallStatus === 'good' && 'Minor issues detected, monitor closely'}
                {report.overallStatus === 'fair' && 'Service recommended soon'}
                {report.overallStatus === 'poor' && 'Immediate service required'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Scores Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SystemScoreCard
          title="Engine"
          score={report.engineHealth.score}
          status={report.engineHealth.status}
        />
        <SystemScoreCard
          title="Fuel System"
          score={report.fuelSystem.score}
          status={report.fuelSystem.status}
        />
        <SystemScoreCard
          title="Transmission"
          score={report.transmission.score}
          status={report.transmission.status}
        />
        <SystemScoreCard
          title="Thermal Mgmt"
          score={report.thermalManagement.score}
          status={report.thermalManagement.status}
        />
      </div>

      {/* Engine Health Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Engine Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusItem label="Turbocharger" status={report.engineHealth.turbochargerStatus} />
            <StatusItem label="EGT Status" status={report.engineHealth.egtStatus} />
            <StatusItem label="MAF Status" status={report.engineHealth.mafStatus} />
          </div>
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Findings:</h4>
            <ul className="space-y-1">
              {report.engineHealth.findings.map((finding, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600">•</span>
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Fuel System Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fuel System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusItem label="Pressure Regulation" status={report.fuelSystem.pressureRegulation} />
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Findings:</h4>
            <ul className="space-y-1">
              {report.fuelSystem.findings.map((finding, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600">•</span>
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Transmission Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transmission</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusItem label="Converter Slip" status={report.transmission.converterSlipStatus} />
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Findings:</h4>
            <ul className="space-y-1">
              {report.transmission.findings.map((finding, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600">•</span>
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Thermal Management Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Thermal Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatusItem label="Oil System" status={report.thermalManagement.oilSystemStatus} />
            <StatusItem label="Cooling System" status={report.thermalManagement.coolingSystemStatus} />
          </div>
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Findings:</h4>
            <ul className="space-y-1">
              {report.thermalManagement.findings.map((finding, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600">•</span>
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Maintenance Recommendations */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg">Maintenance Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-blue-600 font-bold">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Report Footer */}
      <div className="text-xs text-gray-500 text-center">
        Report generated: {report.timestamp.toLocaleString()}
      </div>
    </div>
  );
}

function SystemScoreCard({
  title,
  score,
  status,
}: {
  title: string;
  score: number;
  status: string;
}) {
  const getColor = (s: number) => {
    if (s >= 90) return 'bg-green-100 text-green-900 border-green-300';
    if (s >= 75) return 'bg-blue-100 text-blue-900 border-blue-300';
    if (s >= 60) return 'bg-yellow-100 text-yellow-900 border-yellow-300';
    return 'bg-red-100 text-red-900 border-red-300';
  };

  return (
    <Card className={`border-2 ${getColor(score)}`}>
      <CardContent className="pt-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{score}</div>
          <div className="text-xs font-semibold mt-1">{title}</div>
          <div className="text-xs mt-1 opacity-75">{status}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, status }: { label: string; status: string }) {
  const getStatusIcon = () => {
    if (status.includes('✓')) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (status.includes('⚠')) return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    return <AlertCircle className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className="flex items-center gap-2">
      {getStatusIcon()}
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-gray-600">{status}</div>
      </div>
    </div>
  );
}
