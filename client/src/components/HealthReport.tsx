import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, AlertTriangle, Car, Cpu, Wrench, Fuel, Shield, MapPin, Hash, Zap } from "lucide-react";
import { HealthReportData } from "@/lib/healthReport";

interface HealthReportProps {
  report: HealthReportData;
}

function VinRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 font-medium w-44 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 text-right font-mono">{value}</span>
    </div>
  );
}

export default function HealthReport({ report }: HealthReportProps) {
  const getStatusColor = (status: string) => {
    if (status === 'excellent' || status.toLowerCase().includes('excellent')) return 'bg-green-100 text-green-800';
    if (status === 'good' || status.toLowerCase().includes('good')) return 'bg-blue-100 text-blue-800';
    if (status === 'fair' || status.toLowerCase().includes('fair')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getOverallStatusColor = (status: string) => {
    if (status === 'excellent') return 'bg-green-50 border-green-300';
    if (status === 'good') return 'bg-blue-50 border-blue-300';
    if (status === 'fair') return 'bg-yellow-50 border-yellow-300';
    return 'bg-red-50 border-red-300';
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const v = report.vehicleInfo;

  return (
    <div className="space-y-6">

      {/* ── VEHICLE IDENTITY CARD ─────────────────────────────────────────── */}
      {v && (
        <Card className="border-2 border-blue-200 overflow-hidden">
          {/* Header banner */}
          <div className="bg-gradient-to-r from-blue-700 to-blue-900 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Car className="w-8 h-8 text-blue-200" />
              <div>
                <div className="text-white font-bold text-xl">{v.year} {v.make} {v.model}</div>
                <div className="text-blue-200 text-sm">{v.series} · {v.trim} · {v.bodyStyle}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-blue-200 text-xs mb-1">VIN</div>
              <div className="text-white font-mono text-sm tracking-widest">{v.vin}</div>
            </div>
          </div>

          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">

              {/* Engine & Drivetrain */}
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Engine & Drivetrain</span>
                </div>
                <VinRow label="Engine" value={v.engine} />
                <VinRow label="Engine Code" value={v.engineCode} />
                <VinRow label="Displacement" value={v.displacement} />
                <VinRow label="Cylinders" value={`${v.cylinders}-cylinder V8`} />
                <VinRow label="Fuel Type" value={v.fuelType} />
                <VinRow label="Injection System" value={v.injectionSystem} />
                <VinRow label="Max Rail Pressure" value={v.maxRailPressure} />
                <VinRow label="Turbocharger" value={v.turbocharger} />
                <VinRow label="Aftertreatment" value={v.aftertreatment} />
                <VinRow label="Transmission" value={v.transmission} />
                <VinRow label="Trans. Code" value={v.transmissionCode} />
                <VinRow label="Drive Type" value={v.driveType} />
              </div>

              {/* Performance & Capacities */}
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <Fuel className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Performance & Capacities</span>
                </div>
                <VinRow label="Factory Horsepower" value={`${v.factoryHp} HP @ ${v.peakHpRpm} RPM`} />
                <VinRow label="Factory Torque" value={`${v.factoryTorque} lb·ft @ ${v.peakTorqueRpm} RPM`} />
                <VinRow label="Redline" value={`${v.redline} RPM`} />
                <VinRow label="GVWR" value={v.gvwr} />
                <VinRow label="Towing Capacity" value={v.towingCapacity} />
                <VinRow label="Payload Capacity" value={v.payloadCapacity} />
                <VinRow label="Fuel Tank" value={v.fuelTankCapacity} />
                <VinRow label="Oil Capacity" value={v.oilCapacity} />
                <VinRow label="Coolant Capacity" value={v.coolantCapacity} />
                <VinRow label="DEF Tank" value={v.defTankCapacity} />
              </div>

              {/* VIN Decode Breakdown */}
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">VIN Position Breakdown</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <div className="text-xs text-gray-500 mb-1">World Manufacturer Identifier (WMI)</div>
                  <div className="font-mono text-sm font-bold text-blue-700">{v.wmi}</div>
                  <div className="text-xs text-gray-600">{v.manufacturer}</div>
                </div>
                <VinRow label="Pos 1 — Country" value={v.pos1_country} />
                <VinRow label="Pos 2 — Make" value={v.pos2_make} />
                <VinRow label="Pos 3 — Vehicle Type" value={v.pos3_vehicleType} />
                <VinRow label="Pos 4 — GVWR Class" value={v.pos4_gvwr} />
                <VinRow label="Pos 5 — Series" value={v.pos5_series} />
                <VinRow label="Pos 6 — Body Style" value={v.pos6_body} />
                <VinRow label="Pos 7 — Restraint" value={v.pos7_restraint} />
                <VinRow label="Pos 8 — Engine" value={v.pos8_engine} />
                <VinRow label="Pos 9 — Check Digit" value={v.pos9_check} />
                <VinRow label="Pos 10 — Model Year" value={v.pos10_year} />
                <VinRow label="Pos 11 — Plant" value={v.pos11_plant} />
                <VinRow label="Pos 12–17 — Sequence" value={v.pos12_17_sequence} />
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                  <MapPin className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-500">Assembly Plant: {v.plant}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── OVERALL HEALTH SUMMARY ────────────────────────────────────────── */}
      <Card className={`border-2 ${getOverallStatusColor(report.overallStatus)}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Vehicle Health Assessment</CardTitle>
              <CardDescription>Based on datalog analysis — {report.timestamp.toLocaleString()}</CardDescription>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-bold ${getScoreColor(report.overallScore)}`}>
                {report.overallScore}
              </div>
              <div className="text-sm text-gray-500">/ 100</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {report.overallStatus === 'excellent' && <CheckCircle className="w-12 h-12 text-green-600 shrink-0" />}
            {report.overallStatus === 'good' && <CheckCircle className="w-12 h-12 text-blue-600 shrink-0" />}
            {report.overallStatus === 'fair' && <AlertTriangle className="w-12 h-12 text-yellow-600 shrink-0" />}
            {report.overallStatus === 'poor' && <AlertCircle className="w-12 h-12 text-red-600 shrink-0" />}
            <div>
              <Badge className={`${getStatusColor(report.overallStatus)} text-sm px-3 py-1`}>
                {report.overallStatus.toUpperCase()}
              </Badge>
              <p className="text-sm text-gray-600 mt-2">
                {report.overallStatus === 'excellent' && 'All systems operating optimally. No immediate service required.'}
                {report.overallStatus === 'good' && 'Minor issues detected. Monitor closely and schedule service soon.'}
                {report.overallStatus === 'fair' && 'Service recommended. Address findings before next heavy use.'}
                {report.overallStatus === 'poor' && 'Immediate service required. Do not operate under heavy load.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SYSTEM SCORES GRID ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SystemScoreCard title="Engine" score={report.engineHealth.score} status={report.engineHealth.status} />
        <SystemScoreCard title="Fuel System" score={report.fuelSystem.score} status={report.fuelSystem.status} />
        <SystemScoreCard title="Transmission" score={report.transmission.score} status={report.transmission.status} />
        <SystemScoreCard title="Thermal Mgmt" score={report.thermalManagement.score} status={report.thermalManagement.status} />
      </div>

      {/* ── ENGINE HEALTH ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">Engine Health</CardTitle>
          </div>
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
              {report.engineHealth.findings.map((f, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600 shrink-0">•</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ── FUEL SYSTEM ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Fuel className="w-5 h-5 text-orange-500" />
            <CardTitle className="text-lg">Fuel System</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusItem label="Pressure Regulation" status={report.fuelSystem.pressureRegulation} />
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Findings:</h4>
            <ul className="space-y-1">
              {report.fuelSystem.findings.map((f, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600 shrink-0">•</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ── TRANSMISSION ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-purple-600" />
            <CardTitle className="text-lg">Transmission</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusItem label="Converter Slip" status={report.transmission.converterSlipStatus} />
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Findings:</h4>
            <ul className="space-y-1">
              {report.transmission.findings.map((f, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600 shrink-0">•</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ── THERMAL MANAGEMENT ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal-600" />
            <CardTitle className="text-lg">Thermal Management</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatusItem label="Oil System" status={report.thermalManagement.oilSystemStatus} />
            <StatusItem label="Cooling System" status={report.thermalManagement.coolingSystemStatus} />
          </div>
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Findings:</h4>
            <ul className="space-y-1">
              {report.thermalManagement.findings.map((f, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-green-600 shrink-0">•</span>{f}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ── DIAGNOSTIC FAULT SUMMARY (only shown when faults detected) ──── */}
      {report.diagnosticSummary.anyFaultDetected && (
        <Card className="border-2 border-red-200 bg-red-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <CardTitle className="text-lg text-red-800">Fault Code Summary</CardTitle>
              <Badge className="bg-red-100 text-red-800 ml-auto">
                {report.diagnosticSummary.detectedCodes.length} Fault{report.diagnosticSummary.detectedCodes.length > 1 ? 's' : ''} Detected
              </Badge>
            </div>
            <CardDescription className="text-red-700">
              The following conditions were detected in the datalog. Use the Diagnostic Code Lookup below for full remedies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.diagnosticSummary.p0087Status.includes('DETECTED') && (
                <FaultItem code="P0087" status={report.diagnosticSummary.p0087Status} />
              )}
              {report.diagnosticSummary.p0088Status.includes('DETECTED') && (
                <FaultItem code="P0088" status={report.diagnosticSummary.p0088Status} />
              )}
              {report.diagnosticSummary.p0299Status.includes('DETECTED') && (
                <FaultItem code="P0299" status={report.diagnosticSummary.p0299Status} />
              )}
              {(report.diagnosticSummary.egtStatus.includes('DETECTED') || report.diagnosticSummary.egtStatus.includes('WARNING')) && (
                <FaultItem code="EGT" status={report.diagnosticSummary.egtStatus} />
              )}
              {report.diagnosticSummary.p0101Status.includes('DETECTED') && (
                <FaultItem code="P0101" status={report.diagnosticSummary.p0101Status} />
              )}
              {(report.diagnosticSummary.converterSlipStatus.includes('DETECTED') || report.diagnosticSummary.converterSlipStatus.includes('WARNING')) && (
                <FaultItem code="TCC Slip" status={report.diagnosticSummary.converterSlipStatus} />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── RECOMMENDATIONS ───────────────────────────────────────────────── */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-lg">Maintenance Recommendations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {report.recommendations.map((rec, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-blue-600 font-bold shrink-0">→</span>{rec}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemScoreCard({ title, score, status }: { title: string; score: number; status: string }) {
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
          <div className="text-3xl font-bold">{score}</div>
          <div className="text-xs font-semibold mt-1">{title}</div>
          <div className="text-xs mt-1 opacity-75">{status}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, status }: { label: string; status: string }) {
  const isNotLogged = status.startsWith('—');
  const isGood = !isNotLogged && (status.includes('✓') || status.toLowerCase().includes('normal') || status.toLowerCase().includes('optimal'));
  const isWarn = status.includes('⚠') || status.toLowerCase().includes('warning');
  return (
    <div className="flex items-start gap-2">
      {isNotLogged ? (
        <span className="w-4 h-4 shrink-0 mt-0.5 text-gray-400 text-sm font-bold">—</span>
      ) : isGood ? (
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
      ) : isWarn ? (
        <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      )}
      <div>
        <div className={`text-sm font-semibold ${isNotLogged ? 'text-gray-400' : ''}`}>{label}</div>
        <div className={`text-xs ${isNotLogged ? 'text-gray-400 italic' : 'text-gray-600'}`}>{status}</div>
      </div>
    </div>
  );
}

function FaultItem({ code, status }: { code: string; status: string }) {
  const isCritical = status.includes('✗');
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      isCritical ? 'bg-red-100 border-red-300' : 'bg-yellow-50 border-yellow-300'
    }`}>
      {isCritical ? (
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
      )}
      <div>
        <div className={`text-sm font-bold font-mono ${isCritical ? 'text-red-800' : 'text-yellow-800'}`}>{code}</div>
        <div className={`text-xs mt-0.5 ${isCritical ? 'text-red-700' : 'text-yellow-700'}`}>
          {status.replace('✗ DETECTED — ', '').replace('⚠ WARNING — ', '')}
        </div>
      </div>
    </div>
  );
}
