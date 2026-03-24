/**
 * ECU Reference Panel
 * Displays A2L-derived engine specifications, parameter definitions,
 * and DTC descriptions for the Duramax L5P ECU (ECM_E41 Series_11).
 */

import { useState } from 'react';
import { L5P_SPECS, ECU_PARAMETERS, DTC_DEFINITIONS, PARAM_TOOLTIPS } from '@/lib/ecuReference';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Cpu,
  Gauge,
  Zap,
  Thermometer,
  Wind,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Settings2,
} from 'lucide-react';

interface EcuReferencePanelProps {
  className?: string;
}

const categoryColors: Record<string, string> = {
  fuel_rail: 'bg-blue-100 text-blue-800 border-blue-200',
  boost_turbo: 'bg-orange-100 text-orange-800 border-orange-200',
  exhaust_thermal: 'bg-red-100 text-red-800 border-red-200',
  airflow: 'bg-teal-100 text-teal-800 border-teal-200',
  transmission: 'bg-purple-100 text-purple-800 border-purple-200',
  engine_speed: 'bg-green-100 text-green-800 border-green-200',
  engine_load: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  thermal: 'bg-pink-100 text-pink-800 border-pink-200',
};

const categoryLabels: Record<string, string> = {
  fuel_rail: 'Fuel Rail',
  boost_turbo: 'Boost/Turbo',
  exhaust_thermal: 'Exhaust',
  airflow: 'Airflow',
  transmission: 'Transmission',
  engine_speed: 'Engine Speed',
  engine_load: 'Engine Load',
  thermal: 'Thermal',
};

const severityColors = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  info: 'bg-blue-100 text-blue-800 border-blue-200',
};

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 font-medium w-40 shrink-0">{label}</span>
      <span className="text-xs text-gray-800 text-right font-mono">{value}</span>
    </div>
  );
}

function ParameterCard({ paramKey }: { paramKey: string }) {
  const param = ECU_PARAMETERS[paramKey];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:border-gray-300 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between p-3 bg-gray-50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${categoryColors[param.category]}`}
          >
            {categoryLabels[param.category]}
          </span>
          <span className="text-sm font-medium text-gray-800 truncate">{param.displayName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs text-gray-400 font-mono">{param.unit}</span>
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="p-3 bg-white border-t border-gray-100 space-y-3">
          <p className="text-xs text-gray-600 leading-relaxed">{param.description}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded p-2">
              <div className="text-xs text-gray-400 mb-1">A2L Variable</div>
              <div className="text-xs font-mono text-blue-700 break-all">{param.a2lName}</div>
            </div>
            {param.ecuAddress && (
              <div className="bg-gray-50 rounded p-2">
                <div className="text-xs text-gray-400 mb-1">ECU Address</div>
                <div className="text-xs font-mono text-gray-700">{param.ecuAddress}</div>
              </div>
            )}
          </div>
          {(param.normalMin !== undefined || param.normalMax !== undefined) && (
            <div className="grid grid-cols-3 gap-2">
              {param.normalMin !== undefined && (
                <div className="bg-green-50 rounded p-2 text-center">
                  <div className="text-xs text-green-600 font-medium">Normal Min</div>
                  <div className="text-sm font-bold text-green-700">{param.normalMin}</div>
                  <div className="text-xs text-green-500">{param.unit}</div>
                </div>
              )}
              {param.normalMax !== undefined && (
                <div className="bg-green-50 rounded p-2 text-center">
                  <div className="text-xs text-green-600 font-medium">Normal Max</div>
                  <div className="text-sm font-bold text-green-700">{param.normalMax}</div>
                  <div className="text-xs text-green-500">{param.unit}</div>
                </div>
              )}
              {param.critMax !== undefined && (
                <div className="bg-red-50 rounded p-2 text-center">
                  <div className="text-xs text-red-600 font-medium">Critical Max</div>
                  <div className="text-sm font-bold text-red-700">{param.critMax}</div>
                  <div className="text-xs text-red-500">{param.unit}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DtcCard({ dtc }: { dtc: (typeof DTC_DEFINITIONS)[0] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:border-gray-300 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between p-3 bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900 font-mono">{dtc.code}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${severityColors[dtc.severity]}`}
          >
            {dtc.severity}
          </span>
          <span className="text-xs text-gray-500">{dtc.system}</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </div>
      {expanded && (
        <div className="p-3 bg-white border-t border-gray-100 space-y-2">
          <p className="text-xs text-gray-600 leading-relaxed">{dtc.description}</p>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-xs text-gray-400 mb-1">A2L Fault ID</div>
            <div className="text-xs font-mono text-blue-700">{dtc.a2lId}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EcuReferencePanel({ className = '' }: EcuReferencePanelProps) {
  return (
    <Card className={`${className} border-gray-200 shadow-sm`}>
      <CardHeader className="pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <CardTitle className="text-base font-bold text-gray-900">ECU Reference Database</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">
              Sourced from A2L: ECM_E41 Series_11 — 57,215 measurements · 24,968 calibrations
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs defaultValue="specs" className="w-full">
          <TabsList className="w-full rounded-none border-b border-gray-100 bg-gray-50 h-auto p-0">
            <TabsTrigger
              value="specs"
              className="flex-1 rounded-none py-2.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              <Gauge className="w-3 h-3 mr-1.5" />
              Engine Specs
            </TabsTrigger>
            <TabsTrigger
              value="parameters"
              className="flex-1 rounded-none py-2.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              <Settings2 className="w-3 h-3 mr-1.5" />
              Parameters
            </TabsTrigger>
            <TabsTrigger
              value="dtcs"
              className="flex-1 rounded-none py-2.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              <AlertTriangle className="w-3 h-3 mr-1.5" />
              Fault Codes
            </TabsTrigger>
            <TabsTrigger
              value="subsystems"
              className="flex-1 rounded-none py-2.5 text-xs font-medium data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
            >
              <BookOpen className="w-3 h-3 mr-1.5" />
              Subsystems
            </TabsTrigger>
          </TabsList>

          {/* ENGINE SPECS TAB */}
          <TabsContent value="specs" className="p-4 space-y-4 mt-0">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-800">{L5P_SPECS.engine.name}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Engine Configuration</h4>
                <div className="bg-gray-50 rounded-lg p-3">
                  <SpecRow label="Displacement" value={L5P_SPECS.engine.displacement} />
                  <SpecRow label="Configuration" value={L5P_SPECS.engine.configuration} />
                  <SpecRow label="Bore × Stroke" value={`${L5P_SPECS.engine.bore} × ${L5P_SPECS.engine.stroke}`} />
                  <SpecRow label="Compression" value={L5P_SPECS.engine.compressionRatio} />
                  <SpecRow label="Injection" value={L5P_SPECS.engine.injectionSystem} />
                  <SpecRow label="Max Rail Pressure" value={L5P_SPECS.engine.maxRailPressure} />
                  <SpecRow label="Turbocharger" value={L5P_SPECS.engine.turbocharger} />
                  <SpecRow label="Intercooler" value={L5P_SPECS.engine.intercooler} />
                  <SpecRow label="Aftertreatment" value={L5P_SPECS.engine.aftertreatment} />
                  <SpecRow label="ECU Part" value={L5P_SPECS.engine.ecuPart} />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Performance (Stock)</h4>
                <div className="bg-gray-50 rounded-lg p-3">
                  <SpecRow label="Peak Horsepower" value={`${L5P_SPECS.performance.stockHp} HP @ ${L5P_SPECS.performance.peakHpRpm} RPM`} />
                  <SpecRow label="Peak Torque" value={`${L5P_SPECS.performance.stockTorque} lb·ft @ ${L5P_SPECS.performance.peakTorqueRpm} RPM`} />
                  <SpecRow label="Redline" value={`${L5P_SPECS.performance.redline} RPM`} />
                  <SpecRow label="Idle Speed" value={`${L5P_SPECS.performance.idleRpm} RPM (warm)`} />
                  <SpecRow label="Max Boost (Stock)" value={`~${L5P_SPECS.performance.maxBoostStock} psi`} />
                </div>

                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 mt-4">Operating Limits</h4>
                <div className="bg-gray-50 rounded-lg p-3">
                  <SpecRow label="EGT Warning" value={`>${L5P_SPECS.operatingLimits.maxEgt1_F}°F (sustained >5s)`} />
                  <SpecRow label="EGT Sensor Fail" value={`>${L5P_SPECS.operatingLimits.maxEgt1_stuck_F}°F (stuck = disconnected)`} />
                  <SpecRow label="Max Rail Pressure" value={`${L5P_SPECS.operatingLimits.maxRailPressure_psi.toLocaleString()} psi`} />
                  <SpecRow label="MAF at Idle" value={`${L5P_SPECS.operatingLimits.mafIdleMin_lbMin}–${L5P_SPECS.operatingLimits.mafIdleMax_lbMin} lb/min`} />
                  <SpecRow label="MAF at WOT (Stock)" value={`~${L5P_SPECS.operatingLimits.mafMaxLoad_lbMin} lb/min`} />
                  <SpecRow label="TCC Slip Warning" value={`>±${L5P_SPECS.operatingLimits.tccSlipWarning_rpm} RPM`} />
                </div>
              </div>
            </div>

            {/* Performance reference chart */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-800">A2L Source Note</span>
              </div>
              <p className="text-xs text-blue-700 leading-relaxed">
                All parameter definitions, operating limits, and diagnostic thresholds in this panel are derived
                directly from the Duramax ECU calibration file <strong>E41a182115101_D_quasi.a2l</strong> (ASAP2 v1.61,
                Series_11). This file contains the complete ECM software architecture for the 2017–2023 L5P Duramax,
                including 57,215 measurement variable definitions and 24,968 calibration constants.
              </p>
            </div>
          </TabsContent>

          {/* PARAMETERS TAB */}
          <TabsContent value="parameters" className="p-4 mt-0">
            <p className="text-xs text-gray-500 mb-3">
              Click any parameter to expand its A2L definition, ECU address, and operating thresholds.
            </p>
            <div className="space-y-2">
              {Object.keys(ECU_PARAMETERS).map((key) => (
                <ParameterCard key={key} paramKey={key} />
              ))}
            </div>
          </TabsContent>

          {/* FAULT CODES TAB */}
          <TabsContent value="dtcs" className="p-4 mt-0">
            <p className="text-xs text-gray-500 mb-3">
              Fault code definitions sourced from A2L <code className="bg-gray-100 px-1 rounded">KaDFIR_FaultInfo</code> characteristic blocks.
            </p>
            <div className="space-y-2">
              {DTC_DEFINITIONS.map((dtc) => (
                <DtcCard key={dtc.code} dtc={dtc} />
              ))}
            </div>
          </TabsContent>

          {/* SUBSYSTEMS TAB */}
          <TabsContent value="subsystems" className="p-4 mt-0">
            <p className="text-xs text-gray-500 mb-3">
              ECU software subsystem descriptions from A2L FUNCTION blocks.
            </p>
            <div className="space-y-3">
              {Object.entries(L5P_SPECS.subsystems).map(([key, desc]) => (
                <div key={key} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      {key}
                    </span>
                    <span className="text-xs font-semibold text-gray-700">
                      {key === 'FRPR' && 'Fuel Rail Pressure Regulation'}
                      {key === 'BSTR' && 'Boost Pressure Regulation'}
                      {key === 'EGTR' && 'Exhaust Gas Temperature Monitoring'}
                      {key === 'MAFR' && 'Mass Airflow Regulation'}
                      {key === 'SPDR' && 'Speed / Idle Control'}
                      {key === 'AICR' && 'Air Intake Control'}
                      {key === 'FULR' && 'Fuel Injection Control'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
