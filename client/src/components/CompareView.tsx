/**
 * CompareView — Side-by-side datalog comparison UI
 * 
 * Allows uploading two CSV datalogs, runs the comparison engine to pair
 * similar operating conditions, and displays delta analysis with optional
 * LLM-powered commentary.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { Upload, Loader2, AlertTriangle, CheckCircle, ArrowRight, ArrowUp, ArrowDown, Minus, MessageSquare, Sparkles, X, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import { parseCSV, processData, downsampleData, ProcessedMetrics } from '@/lib/dataProcessor';
import { compareDatasets, buildComparisonContext, ComparisonReport, EventComparison, PidDelta } from '@/lib/compareEngine';
import { trpc } from '@/lib/trpc';
import { Streamdown } from 'streamdown';

interface CompareViewProps {
  onBack: () => void;
}

interface LogSlot {
  file: File | null;
  fileName: string | null;
  data: ProcessedMetrics | null;
  loading: boolean;
  error: string | null;
}

const emptySlot: LogSlot = { file: null, fileName: null, data: null, loading: false, error: null };

export default function CompareView({ onBack }: CompareViewProps) {
  const [logA, setLogA] = useState<LogSlot>({ ...emptySlot });
  const [logB, setLogB] = useState<LogSlot>({ ...emptySlot });
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [userContext, setUserContext] = useState('');
  const [showContextChat, setShowContextChat] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);
  const [dragOverA, setDragOverA] = useState(false);
  const [dragOverB, setDragOverB] = useState(false);

  const analyzeMutation = trpc.compare.analyze.useMutation();

  const processLogFile = useCallback(async (file: File, slot: 'A' | 'B') => {
    const setter = slot === 'A' ? setLogA : setLogB;
    setter({ file, fileName: file.name, data: null, loading: true, error: null });

    try {
      const content = await file.text();
      const rawData = parseCSV(content);
      const processed = processData(rawData);
      const downsampled = downsampleData(processed, 2000);
      setter({ file, fileName: file.name, data: downsampled, loading: false, error: null });
    } catch (err) {
      setter({ file, fileName: file.name, data: null, loading: false, error: 'Failed to parse CSV file' });
    }
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent, slot: 'A' | 'B') => {
    e.preventDefault();
    if (slot === 'A') setDragOverA(false);
    else setDragOverB(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processLogFile(file, slot);
    }
  }, [processLogFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, slot: 'A' | 'B') => {
    const file = e.target.files?.[0];
    if (file) processLogFile(file, slot);
    e.target.value = '';
  }, [processLogFile]);

  const runComparison = useCallback(async () => {
    if (!logA.data || !logB.data) return;
    setComparing(true);
    setAiAnalysis(null);

    try {
      // Run client-side comparison engine
      const compReport = compareDatasets(logA.data, logB.data, logA.fileName || 'Log A', logB.fileName || 'Log B');
      setReport(compReport);

      // Run LLM analysis
      const context = buildComparisonContext(compReport, userContext || undefined);
      const result = await analyzeMutation.mutateAsync({
        comparisonContext: context,
        userContext: userContext || undefined,
      });
      setAiAnalysis(result.analysis);
    } catch (err) {
      console.error('Comparison error:', err);
    } finally {
      setComparing(false);
    }
  }, [logA, logB, userContext, analyzeMutation]);

  const toggleEvent = (id: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bothReady = logA.data && logB.data;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'transparent',
          color: 'oklch(0.68 0.010 260)',
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: '0.9rem',
          letterSpacing: '0.08em',
          padding: '6px 0',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '1rem',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'white')}
        onMouseLeave={e => (e.currentTarget.style.color = 'oklch(0.68 0.010 260)')}
      >
        ← BACK TO ANALYZER
      </button>

      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="ppei-gradient-text" style={{
          fontFamily: '"Bebas Neue", "Impact", sans-serif',
          fontSize: '2.5rem',
          letterSpacing: '0.1em',
          marginBottom: '0.4rem'
        }}>
          DATALOG COMPARISON
        </h2>
        <p style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '0.95rem',
          color: 'oklch(0.68 0.010 260)',
          letterSpacing: '0.03em'
        }}>
          Upload two datalogs to compare tune changes, tuner differences, or before/after modifications
        </p>
      </div>

      {/* Upload area — two side-by-side drop zones */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Log A */}
        <DropZone
          label="LOG A"
          sublabel="BASELINE / BEFORE"
          slot={logA}
          isDragOver={dragOverA}
          onDragOver={(e) => { e.preventDefault(); setDragOverA(true); }}
          onDragLeave={() => setDragOverA(false)}
          onDrop={(e) => handleFileDrop(e, 'A')}
          onClick={() => fileInputARef.current?.click()}
          onClear={() => { setLogA({ ...emptySlot }); setReport(null); setAiAnalysis(null); }}
          accentColor="oklch(0.70 0.18 200)"
        />
        <input ref={fileInputARef} type="file" accept="*" className="hidden" onChange={(e) => handleFileSelect(e, 'A')} />

        {/* Log B */}
        <DropZone
          label="LOG B"
          sublabel="REVISED / AFTER"
          slot={logB}
          isDragOver={dragOverB}
          onDragOver={(e) => { e.preventDefault(); setDragOverB(true); }}
          onDragLeave={() => setDragOverB(false)}
          onDrop={(e) => handleFileDrop(e, 'B')}
          onClick={() => fileInputBRef.current?.click()}
          onClear={() => { setLogB({ ...emptySlot }); setReport(null); setAiAnalysis(null); }}
          accentColor="oklch(0.52 0.22 25)"
        />
        <input ref={fileInputBRef} type="file" accept="*" className="hidden" onChange={(e) => handleFileSelect(e, 'B')} />
      </div>

      {/* Optional context chat */}
      <div style={{
        background: 'oklch(0.11 0.005 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderRadius: '4px',
        marginBottom: '1rem',
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setShowContextChat(!showContextChat)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            color: 'oklch(0.60 0.010 260)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'white')}
          onMouseLeave={e => (e.currentTarget.style.color = 'oklch(0.60 0.010 260)')}
        >
          <MessageSquare style={{ width: '16px', height: '16px', color: 'oklch(0.52 0.22 25)' }} />
          <span style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.95rem',
            letterSpacing: '0.06em',
          }}>
            DESCRIBE WHAT CHANGED (OPTIONAL)
          </span>
          {showContextChat
            ? <ChevronDown style={{ width: '14px', height: '14px', marginLeft: 'auto' }} />
            : <ChevronRight style={{ width: '14px', height: '14px', marginLeft: 'auto' }} />
          }
        </button>
        {showContextChat && (
          <div style={{ padding: '0 1rem 1rem 1rem' }}>
            <p style={{
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.8rem',
              color: 'oklch(0.63 0.010 260)',
              marginBottom: '0.5rem',
            }}>
              Tell the AI what you changed between tests — tune revision, turbo swap, injector upgrade, etc. This helps generate smarter analysis.
            </p>
            <textarea
              value={userContext}
              onChange={(e) => setUserContext(e.target.value)}
              placeholder='e.g. "Went from stock tune to PPEI 100HP tune" or "Swapped stock turbo to S475, same tune" or "Comparing PPEI vs competitor tune"'
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontFamily: '"Rajdhani", sans-serif',
                fontSize: '0.9rem',
                background: 'oklch(0.08 0.004 260)',
                border: '1px solid oklch(0.25 0.008 260)',
                borderRadius: '3px',
                color: 'white',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
          </div>
        )}
      </div>

      {/* Compare button */}
      <button
        onClick={runComparison}
        disabled={!bothReady || comparing}
        style={{
          width: '100%',
          background: bothReady && !comparing ? 'oklch(0.52 0.22 25)' : 'oklch(0.25 0.008 260)',
          color: 'white',
          fontFamily: '"Bebas Neue", "Impact", sans-serif',
          fontSize: '1.2rem',
          letterSpacing: '0.1em',
          padding: '14px 32px',
          borderRadius: '3px',
          border: 'none',
          cursor: bothReady && !comparing ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          transition: 'background 0.15s',
          marginBottom: '2rem',
        }}
      >
        {comparing ? (
          <><Loader2 style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} />ANALYZING COMPARISON...</>
        ) : (
          <><Sparkles style={{ width: '20px', height: '20px' }} />RUN COMPARISON ANALYSIS</>
        )}
      </button>

      {/* Results */}
      {report && (
        <div className="space-y-6">
          {/* Warnings */}
          {report.warnings.length > 0 && (
            <div style={{
              background: 'oklch(0.15 0.04 60)',
              border: '1px solid oklch(0.50 0.15 60)',
              borderLeft: '4px solid oklch(0.75 0.18 60)',
              borderRadius: '3px',
              padding: '1rem 1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
                <AlertTriangle style={{ width: '18px', height: '18px', color: 'oklch(0.75 0.18 60)' }} />
                <span style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: '1rem',
                  letterSpacing: '0.06em',
                  color: 'oklch(0.85 0.12 60)',
                }}>WARNINGS</span>
              </div>
              {report.warnings.map((w, i) => (
                <p key={i} style={{
                  fontFamily: '"Rajdhani", sans-serif',
                  fontSize: '0.85rem',
                  color: 'oklch(0.75 0.08 60)',
                  margin: '4px 0',
                }}>{w}</p>
              ))}
            </div>
          )}

          {/* Overall Summary Cards */}
          <div>
            <SectionHeader title="OVERALL COMPARISON" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <DeltaCard label="PEAK HP" aVal={report.overallSummary.peakHpA} bVal={report.overallSummary.peakHpB} delta={report.overallSummary.hpDelta} unit="HP" precision={0} />
              <DeltaCard label="PEAK BOOST" aVal={report.overallSummary.peakBoostA} bVal={report.overallSummary.peakBoostB} delta={report.overallSummary.boostDelta} unit="PSI" precision={1} />
              <DeltaCard label="PEAK RAIL" aVal={report.overallSummary.peakRailA} bVal={report.overallSummary.peakRailB} delta={report.overallSummary.railDelta} unit="PSI" precision={0} />
              <DeltaCard label="PEAK EGT" aVal={report.overallSummary.peakEgtA} bVal={report.overallSummary.peakEgtB} delta={report.overallSummary.egtDelta} unit="°F" precision={0} invertColor />
              <DeltaCard label="PEAK TIMING" aVal={report.overallSummary.peakTimingA} bVal={report.overallSummary.peakTimingB} delta={report.overallSummary.timingDelta} unit="°" precision={1} />
              <DeltaCard label="PEAK PW" aVal={report.overallSummary.peakPwA} bVal={report.overallSummary.peakPwB} delta={report.overallSummary.pwDelta} unit="ms" precision={2} invertColor />
              <DeltaCard label="PEAK MAF" aVal={report.overallSummary.peakMafA} bVal={report.overallSummary.peakMafB} delta={report.overallSummary.mafDelta} unit="g/s" precision={0} />
            </div>
          </div>

          {/* Overlay Charts */}
          {logA.data && logB.data && (
            <CompareCharts
              dataA={logA.data}
              dataB={logB.data}
              labelA={logA.fileName || 'Log A'}
              labelB={logB.fileName || 'Log B'}
            />
          )}

          {/* PID Coverage */}
          {(report.pidCoverage.aOnlyPids.length > 0 || report.pidCoverage.bOnlyPids.length > 0) && (
            <div style={{
              background: 'oklch(0.12 0.005 260)',
              border: '1px solid oklch(0.22 0.008 260)',
              borderRadius: '3px',
              padding: '1rem',
            }}>
              <span style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: '0.9rem',
                letterSpacing: '0.06em',
                color: 'oklch(0.68 0.010 260)',
              }}>PID COVERAGE: </span>
              <span style={{
                fontFamily: '"Rajdhani", sans-serif',
                fontSize: '0.85rem',
                color: 'oklch(0.63 0.010 260)',
              }}>
                {report.pidCoverage.commonPids.length} common PIDs
                {report.pidCoverage.aOnlyPids.length > 0 && ` · ${report.pidCoverage.aOnlyPids.length} only in Log A`}
                {report.pidCoverage.bOnlyPids.length > 0 && ` · ${report.pidCoverage.bOnlyPids.length} only in Log B`}
              </span>
            </div>
          )}

          {/* Event-by-Event Comparison */}
          {report.events.length > 0 && (
            <div>
              <SectionHeader title={`MATCHED EVENTS (${report.events.length})`} />
              <div className="space-y-2">
                {report.events.map((ec) => (
                  <EventCard
                    key={ec.event.id}
                    ec={ec}
                    expanded={expandedEvents.has(ec.event.id)}
                    onToggle={() => toggleEvent(ec.event.id)}
                    labelA={logA.fileName || 'Log A'}
                    labelB={logB.fileName || 'Log B'}
                  />
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          {(aiAnalysis || analyzeMutation.isPending) && (
            <div>
              <SectionHeader title="AI COMPARISON ANALYSIS" />
              <div style={{
                background: 'oklch(0.12 0.005 260)',
                border: '1px solid oklch(0.22 0.008 260)',
                borderLeft: '4px solid oklch(0.52 0.22 25)',
                borderRadius: '3px',
                padding: '1.5rem',
              }}>
                {analyzeMutation.isPending ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Loader2 style={{ width: '18px', height: '18px', color: 'oklch(0.52 0.22 25)', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontFamily: '"Rajdhani", sans-serif', color: 'oklch(0.68 0.010 260)' }}>
                      AI is analyzing the comparison...
                    </span>
                  </div>
                ) : aiAnalysis ? (
                  <div style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.9rem', color: 'oklch(0.80 0.005 260)', lineHeight: 1.7 }}>
                    <Streamdown>{aiAnalysis}</Streamdown>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Compare Charts ──────────────────────────────────────────────────────────

interface PidOption {
  key: string;
  label: string;
  unit: string;
  getA: (d: ProcessedMetrics) => number[];
  getB: (d: ProcessedMetrics) => number[];
}

const ALL_PID_OPTIONS: PidOption[] = [
  { key: 'rpm', label: 'RPM', unit: 'RPM', getA: d => d.rpm, getB: d => d.rpm },
  { key: 'boost', label: 'Boost', unit: 'PSI', getA: d => d.boost, getB: d => d.boost },
  { key: 'vehicleSpeed', label: 'Vehicle Speed', unit: 'MPH', getA: d => d.vehicleSpeed, getB: d => d.vehicleSpeed },
  { key: 'railPressureActual', label: 'Rail Pressure (Actual)', unit: 'PSI', getA: d => d.railPressureActual, getB: d => d.railPressureActual },
  { key: 'railPressureDesired', label: 'Rail Pressure (Desired)', unit: 'PSI', getA: d => d.railPressureDesired, getB: d => d.railPressureDesired },
  { key: 'exhaustGasTemp', label: 'EGT', unit: '°F', getA: d => d.exhaustGasTemp, getB: d => d.exhaustGasTemp },
  { key: 'maf', label: 'MAF', unit: 'g/s', getA: d => d.maf, getB: d => d.maf },
  { key: 'hpTorque', label: 'HP (Torque)', unit: 'HP', getA: d => d.hpTorque, getB: d => d.hpTorque },
  { key: 'boostDesired', label: 'Boost (Desired)', unit: 'PSI', getA: d => d.boostDesired, getB: d => d.boostDesired },
  { key: 'turboVanePosition', label: 'Turbo Vane Position', unit: '%', getA: d => d.turboVanePosition, getB: d => d.turboVanePosition },
  { key: 'converterSlip', label: 'Converter Slip', unit: 'RPM', getA: d => d.converterSlip, getB: d => d.converterSlip },
  { key: 'converterPressure', label: 'TCC Pressure', unit: 'kPa', getA: d => d.converterPressure, getB: d => d.converterPressure },
  { key: 'coolantTemp', label: 'Coolant Temp', unit: '°F', getA: d => d.coolantTemp, getB: d => d.coolantTemp },
  { key: 'oilTemp', label: 'Oil Temp', unit: '°F', getA: d => d.oilTemp, getB: d => d.oilTemp },
  { key: 'transFluidTemp', label: 'Trans Fluid Temp', unit: '°F', getA: d => d.transFluidTemp, getB: d => d.transFluidTemp },
  { key: 'throttlePosition', label: 'Throttle Position', unit: '%', getA: d => d.throttlePosition, getB: d => d.throttlePosition },
  { key: 'injectorPulseWidth', label: 'Injector Pulse Width', unit: 'ms', getA: d => d.injectorPulseWidth, getB: d => d.injectorPulseWidth },
  { key: 'injectionTiming', label: 'Injection Timing', unit: '°BTDC', getA: d => d.injectionTiming, getB: d => d.injectionTiming },
  { key: 'intakeAirTemp', label: 'Intake Air Temp', unit: '°F', getA: d => d.intakeAirTemp, getB: d => d.intakeAirTemp },
  { key: 'fuelQuantity', label: 'Fuel Quantity', unit: 'mm³', getA: d => d.fuelQuantity, getB: d => d.fuelQuantity },
  { key: 'oilPressure', label: 'Oil Pressure', unit: 'PSI', getA: d => d.oilPressure, getB: d => d.oilPressure },
  { key: 'batteryVoltage', label: 'Battery Voltage', unit: 'V', getA: d => d.batteryVoltage, getB: d => d.batteryVoltage },
  { key: 'currentGear', label: 'Current Gear', unit: '', getA: d => d.currentGear, getB: d => d.currentGear },
  { key: 'exhaustPressure', label: 'Exhaust Backpressure', unit: 'PSI', getA: d => d.exhaustPressure, getB: d => d.exhaustPressure },
  { key: 'barometricPressure', label: 'Barometric Pressure', unit: 'PSI', getA: d => d.barometricPressure, getB: d => d.barometricPressure },
  { key: 'pcvDutyCycle', label: 'PCV Duty Cycle', unit: '%', getA: d => d.pcvDutyCycle, getB: d => d.pcvDutyCycle },
  { key: 'turboSpeed', label: 'Turbo Speed', unit: 'RPM', getA: d => d.turboSpeed, getB: d => d.turboSpeed },
  { key: 'egrPosition', label: 'EGR Position', unit: '%', getA: d => d.egrPosition, getB: d => d.egrPosition },
  { key: 'calcLoad', label: 'Calculated Load', unit: '%', getA: d => d.calcLoad, getB: d => d.calcLoad },
  { key: 'converterDutyCycle', label: 'TCC Duty Cycle', unit: '%', getA: d => d.converterDutyCycle, getB: d => d.converterDutyCycle },
];

function CompareCharts({ dataA, dataB, labelA, labelB }: {
  dataA: ProcessedMetrics;
  dataB: ProcessedMetrics;
  labelA: string;
  labelB: string;
}) {
  const [selectedPids, setSelectedPids] = useState<string[]>(['boost', 'rpm']);
  const [showPidPicker, setShowPidPicker] = useState(false);

  // Filter to PIDs that have data in at least one log
  const availablePids = useMemo(() => {
    return ALL_PID_OPTIONS.filter(p => {
      const aData = p.getA(dataA);
      const bData = p.getB(dataB);
      return (aData.some(v => v !== 0) || bData.some(v => v !== 0));
    });
  }, [dataA, dataB]);

  const togglePid = (key: string) => {
    setSelectedPids(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Build overlay chart data — time-aligned
  const chartDataSets = useMemo(() => {
    return selectedPids.map(pidKey => {
      const pidOpt = ALL_PID_OPTIONS.find(p => p.key === pidKey);
      if (!pidOpt) return null;
      const aVals = pidOpt.getA(dataA);
      const bVals = pidOpt.getB(dataB);
      const maxLen = Math.max(aVals.length, bVals.length);
      // Downsample to max 500 points for performance
      const step = Math.max(1, Math.floor(maxLen / 500));
      const points: { time: number; a: number | null; b: number | null }[] = [];
      for (let i = 0; i < maxLen; i += step) {
        const timeA = i < dataA.timeMinutes.length ? dataA.timeMinutes[i] * 60 : null;
        const timeB = i < dataB.timeMinutes.length ? dataB.timeMinutes[i] * 60 : null;
        points.push({
          time: (timeA ?? timeB ?? i) as number,
          a: i < aVals.length ? aVals[i] : null,
          b: i < bVals.length ? bVals[i] : null,
        });
      }
      return { pidKey, label: pidOpt.label, unit: pidOpt.unit, points };
    }).filter(Boolean) as { pidKey: string; label: string; unit: string; points: { time: number; a: number | null; b: number | null }[] }[];
  }, [selectedPids, dataA, dataB]);

  // Bar chart data for peak comparison
  const barData = useMemo(() => {
    return availablePids.slice(0, 12).map(p => {
      const aVals = p.getA(dataA).filter(v => v !== 0);
      const bVals = p.getB(dataB).filter(v => v !== 0);
      const peakA = aVals.length > 0 ? Math.max(...aVals) : 0;
      const peakB = bVals.length > 0 ? Math.max(...bVals) : 0;
      return { name: p.label, peakA, peakB, unit: p.unit };
    }).filter(d => d.peakA > 0 || d.peakB > 0);
  }, [availablePids, dataA, dataB]);

  const PPEI_RED = 'oklch(0.52 0.22 25)';
  const CYAN = 'oklch(0.72 0.15 200)';

  return (
    <div>
      <SectionHeader title="OVERLAY CHARTS" />

      {/* PID Selector */}
      <div style={{
        background: 'oklch(0.12 0.005 260)',
        border: '1px solid oklch(0.22 0.008 260)',
        borderRadius: '3px',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.85rem',
            letterSpacing: '0.06em',
            color: 'oklch(0.68 0.010 260)',
          }}>
            <BarChart3 style={{ width: '14px', height: '14px', display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            SELECT PIDs TO OVERLAY ({selectedPids.length} selected)
          </span>
          <button
            onClick={() => setShowPidPicker(!showPidPicker)}
            style={{
              background: 'oklch(0.18 0.005 260)',
              border: '1px solid oklch(0.30 0.008 260)',
              borderRadius: '3px',
              color: 'oklch(0.75 0.010 260)',
              fontFamily: '"Rajdhani", sans-serif',
              fontSize: '0.8rem',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            {showPidPicker ? 'CLOSE' : 'ADD / REMOVE PIDs'}
          </button>
        </div>

        {/* Selected PID tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {selectedPids.map(key => {
            const opt = ALL_PID_OPTIONS.find(p => p.key === key);
            return opt ? (
              <span
                key={key}
                onClick={() => togglePid(key)}
                style={{
                  fontSize: '0.7rem',
                  fontFamily: '"Share Tech Mono", monospace',
                  background: 'oklch(0.52 0.22 25 / 0.15)',
                  border: '1px solid oklch(0.52 0.22 25 / 0.4)',
                  color: 'oklch(0.80 0.15 25)',
                  padding: '2px 8px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
              >
                {opt.label} × 
              </span>
            ) : null;
          })}
        </div>

        {/* PID picker grid */}
        {showPidPicker && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '4px',
            marginTop: '0.75rem',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '0.5rem',
            background: 'oklch(0.09 0.004 260)',
            borderRadius: '3px',
          }}>
            {availablePids.map(p => (
              <label
                key={p.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  fontFamily: '"Rajdhani", sans-serif',
                  color: selectedPids.includes(p.key) ? 'oklch(0.85 0.15 25)' : 'oklch(0.65 0.010 260)',
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: '2px',
                  background: selectedPids.includes(p.key) ? 'oklch(0.52 0.22 25 / 0.10)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPids.includes(p.key)}
                  onChange={() => togglePid(p.key)}
                  style={{ accentColor: 'oklch(0.52 0.22 25)' }}
                />
                {p.label} {p.unit && `(${p.unit})`}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Overlay Line Charts */}
      {chartDataSets.map(ds => (
        <div key={ds.pidKey} style={{
          background: 'oklch(0.10 0.004 260)',
          border: '1px solid oklch(0.22 0.008 260)',
          borderRadius: '3px',
          padding: '1rem',
          marginBottom: '0.75rem',
        }}>
          <div style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.9rem',
            letterSpacing: '0.06em',
            color: 'oklch(0.75 0.010 260)',
            marginBottom: '0.5rem',
          }}>
            {ds.label} {ds.unit && `(${ds.unit})`}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={ds.points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.005 260)" />
              <XAxis
                dataKey="time"
                tickFormatter={(v: number) => `${v.toFixed(0)}s`}
                stroke="oklch(0.50 0.005 260)"
                tick={{ fontSize: 10, fontFamily: '"Share Tech Mono", monospace' }}
              />
              <YAxis
                stroke="oklch(0.50 0.005 260)"
                tick={{ fontSize: 10, fontFamily: '"Share Tech Mono", monospace' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'oklch(0.12 0.005 260)',
                  border: '1px solid oklch(0.30 0.008 260)',
                  borderRadius: '3px',
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.75rem',
                }}
                labelFormatter={(v: number) => `Time: ${Number(v).toFixed(1)}s`}
                formatter={(value: number, name: string) => [
                  `${value?.toFixed(2)} ${ds.unit}`,
                  name === 'a' ? labelA : labelB,
                ]}
              />
              <Legend
                formatter={(value: string) => value === 'a' ? labelA : labelB}
                wrapperStyle={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem' }}
              />
              <Line type="monotone" dataKey="a" stroke={PPEI_RED} strokeWidth={2} dot={false} name="a" connectNulls />
              <Line type="monotone" dataKey="b" stroke={CYAN} strokeWidth={2} dot={false} name="b" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}

      {/* Peak Comparison Bar Chart */}
      {barData.length > 0 && (
        <div style={{
          background: 'oklch(0.10 0.004 260)',
          border: '1px solid oklch(0.22 0.008 260)',
          borderRadius: '3px',
          padding: '1rem',
          marginTop: '1rem',
        }}>
          <div style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: '0.9rem',
            letterSpacing: '0.06em',
            color: 'oklch(0.75 0.010 260)',
            marginBottom: '0.5rem',
          }}>
            PEAK VALUES COMPARISON
          </div>
          <ResponsiveContainer width="100%" height={Math.max(250, barData.length * 35)}>
            <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0.005 260)" />
              <XAxis type="number" stroke="oklch(0.50 0.005 260)" tick={{ fontSize: 10, fontFamily: '"Share Tech Mono", monospace' }} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="oklch(0.50 0.005 260)"
                tick={{ fontSize: 10, fontFamily: '"Rajdhani", sans-serif' }}
                width={95}
              />
              <Tooltip
                contentStyle={{
                  background: 'oklch(0.12 0.005 260)',
                  border: '1px solid oklch(0.30 0.008 260)',
                  borderRadius: '3px',
                  fontFamily: '"Share Tech Mono", monospace',
                  fontSize: '0.75rem',
                }}
                formatter={(value: number, name: string) => [
                  value.toFixed(1),
                  name === 'peakA' ? labelA : labelB,
                ]}
              />
              <Legend
                formatter={(value: string) => value === 'peakA' ? labelA : labelB}
                wrapperStyle={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.75rem' }}
              />
              <Bar dataKey="peakA" fill={PPEI_RED} name="peakA" barSize={12} />
              <Bar dataKey="peakB" fill={CYAN} name="peakB" barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DropZone({ label, sublabel, slot, isDragOver, onDragOver, onDragLeave, onDrop, onClick, onClear, accentColor }: {
  label: string;
  sublabel: string;
  slot: LogSlot;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onClear: () => void;
  accentColor: string;
}) {
  if (slot.data) {
    // Loaded state
    return (
      <div style={{
        background: 'oklch(0.12 0.005 260)',
        border: `1px solid oklch(0.25 0.008 260)`,
        borderTop: `3px solid ${accentColor}`,
        borderRadius: '4px',
        padding: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle style={{ width: '16px', height: '16px', color: 'oklch(0.65 0.20 145)' }} />
            <span style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: '0.85rem',
              letterSpacing: '0.06em',
              color: accentColor,
            }}>{label}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'oklch(0.60 0.010 260)',
              padding: '2px',
            }}
          >
            <X style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
        <p style={{
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.8rem',
          color: 'white',
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{slot.fileName}</p>
        <p style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '0.75rem',
          color: 'oklch(0.63 0.010 260)',
          margin: '4px 0 0 0',
        }}>
          {slot.data.stats.duration.toFixed(1)}s · {slot.data.rpm.length.toLocaleString()} samples · {slot.data.fileFormat}
        </p>
        {/* Quick stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px',
          marginTop: '0.5rem',
          padding: '0.5rem',
          background: 'oklch(0.09 0.004 260)',
          borderRadius: '3px',
        }}>
          <MiniStat label="Peak HP" value={slot.data.stats.hpTorqueMax.toFixed(0)} />
          <MiniStat label="Peak Boost" value={slot.data.stats.boostMax.toFixed(1) + ' PSI'} />
          <MiniStat label="Peak RPM" value={slot.data.stats.rpmMax.toFixed(0)} />
          <MiniStat label="Peak EGT" value={Math.max(...(slot.data.exhaustGasTemp.length > 0 ? slot.data.exhaustGasTemp : [0])).toFixed(0) + '°F'} />
        </div>
      </div>
    );
  }

  // Empty / loading state
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !slot.loading && onClick()}
      style={{
        border: isDragOver ? `2px dashed ${accentColor}` : '2px dashed oklch(0.48 0.008 260)',
        background: isDragOver ? `oklch(0.14 0.012 25)` : 'oklch(0.11 0.005 260)',
        borderRadius: '4px',
        transition: 'all 0.2s',
        cursor: slot.loading ? 'not-allowed' : 'pointer',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '4px',
        background: isDragOver ? `${accentColor}33` : 'oklch(0.16 0.008 260)',
        border: `1px solid ${isDragOver ? accentColor : 'oklch(0.28 0.008 260)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 0.75rem auto',
        transition: 'all 0.2s',
      }}>
        {slot.loading ? (
          <Loader2 style={{ width: '24px', height: '24px', color: accentColor, animation: 'spin 1s linear infinite' }} />
        ) : (
          <Upload style={{ width: '24px', height: '24px', color: isDragOver ? accentColor : 'oklch(0.63 0.010 260)' }} />
        )}
      </div>
      <p style={{
        fontFamily: '"Bebas Neue", sans-serif',
        fontSize: '1.1rem',
        letterSpacing: '0.06em',
        color: accentColor,
        marginBottom: '2px',
      }}>{label}</p>
      <p style={{
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '0.8rem',
        color: 'oklch(0.63 0.010 260)',
        letterSpacing: '0.04em',
        marginBottom: '0.5rem',
      }}>{sublabel}</p>
      <p style={{
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '0.8rem',
        color: 'oklch(0.58 0.008 260)',
      }}>
        {slot.loading ? 'Processing...' : 'Drop CSV or click to browse'}
      </p>
      <p style={{
        fontFamily: '"Share Tech Mono", monospace',
        fontSize: '0.65rem',
        color: 'oklch(0.58 0.010 260)',
        marginTop: '0.35rem',
        letterSpacing: '0.05em',
      }}>CURRENTLY ONLY CSV SUPPORTED</p>
      {slot.error && (
        <p style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '0.8rem',
          color: 'oklch(0.65 0.18 25)',
          marginTop: '0.5rem',
        }}>{slot.error}</p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.65rem', color: 'oklch(0.60 0.010 260)', margin: 0 }}>{label}</p>
      <p style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.75rem', color: 'white', margin: 0 }}>{value}</p>
    </div>
  );
}

function DeltaCard({ label, aVal, bVal, delta, unit, precision, invertColor }: {
  label: string;
  aVal: number;
  bVal: number;
  delta: number;
  unit: string;
  precision: number;
  invertColor?: boolean;
}) {
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const isNeutral = Math.abs(delta) < 0.01;

  // For most metrics, positive = good (green). For EGT and PW, positive = bad (red).
  let deltaColor = 'oklch(0.68 0.010 260)';
  if (!isNeutral) {
    if (invertColor) {
      deltaColor = isPositive ? 'oklch(0.65 0.18 25)' : 'oklch(0.65 0.20 145)';
    } else {
      deltaColor = isPositive ? 'oklch(0.65 0.20 145)' : 'oklch(0.65 0.18 25)';
    }
  }

  const DeltaIcon = isNeutral ? Minus : isPositive ? ArrowUp : ArrowDown;

  return (
    <div style={{
      background: 'oklch(0.12 0.005 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderRadius: '3px',
      padding: '0.75rem',
    }}>
      <p style={{
        fontFamily: '"Bebas Neue", sans-serif',
        fontSize: '0.75rem',
        letterSpacing: '0.06em',
        color: 'oklch(0.63 0.010 260)',
        margin: '0 0 6px 0',
      }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.8rem', color: 'oklch(0.70 0.18 200)' }}>
          {aVal.toFixed(precision)}
        </span>
        <ArrowRight style={{ width: '12px', height: '12px', color: 'oklch(0.58 0.008 260)' }} />
        <span style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: '0.8rem', color: 'oklch(0.52 0.22 25)' }}>
          {bVal.toFixed(precision)}
        </span>
        <span style={{ fontFamily: '"Rajdhani", sans-serif', fontSize: '0.7rem', color: 'oklch(0.58 0.008 260)' }}>{unit}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <DeltaIcon style={{ width: '12px', height: '12px', color: deltaColor }} />
        <span style={{
          fontFamily: '"Share Tech Mono", monospace',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: deltaColor,
        }}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(precision)} {unit}
        </span>
      </div>
    </div>
  );
}

function EventCard({ ec, expanded, onToggle, labelA, labelB }: {
  ec: EventComparison;
  expanded: boolean;
  onToggle: () => void;
  labelA: string;
  labelB: string;
}) {
  // Find key deltas for the summary line
  const hp = ec.deltas.find(d => d.pid === 'hpTorque' && d.available === 'both');
  const boost = ec.deltas.find(d => d.pid === 'boost' && d.available === 'both');

  return (
    <div style={{
      background: 'oklch(0.12 0.005 260)',
      border: '1px solid oklch(0.22 0.008 260)',
      borderRadius: '3px',
      overflow: 'hidden',
    }}>
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          color: 'white',
          textAlign: 'left',
        }}
      >
        {expanded
          ? <ChevronDown style={{ width: '14px', height: '14px', color: 'oklch(0.52 0.22 25)', flexShrink: 0 }} />
          : <ChevronRight style={{ width: '14px', height: '14px', color: 'oklch(0.60 0.010 260)', flexShrink: 0 }} />
        }
        <span style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: '0.9rem',
          letterSpacing: '0.05em',
          color: 'white',
        }}>{ec.event.description}</span>
        <span style={{
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '0.8rem',
          color: 'oklch(0.63 0.010 260)',
          marginLeft: 'auto',
          whiteSpace: 'nowrap',
        }}>
          {hp ? `${hp.deltaMax >= 0 ? '+' : ''}${hp.deltaMax.toFixed(0)} HP` : ''}
          {hp && boost ? ' · ' : ''}
          {boost ? `${boost.deltaMax >= 0 ? '+' : ''}${boost.deltaMax.toFixed(1)} PSI` : ''}
        </span>
      </button>

      {/* Expanded detail table */}
      {expanded && (
        <div style={{ padding: '0 1rem 1rem 1rem' }}>
          <div style={{
            overflowX: 'auto',
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: '"Share Tech Mono", monospace',
              fontSize: '0.75rem',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid oklch(0.25 0.008 260)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'oklch(0.63 0.010 260)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em', fontSize: '0.75rem' }}>PID</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'oklch(0.70 0.18 200)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em', fontSize: '0.75rem' }}>A (AVG)</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'oklch(0.52 0.22 25)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em', fontSize: '0.75rem' }}>B (AVG)</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'oklch(0.63 0.010 260)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em', fontSize: '0.75rem' }}>DELTA</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'oklch(0.63 0.010 260)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em', fontSize: '0.75rem' }}>A (PEAK)</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'oklch(0.63 0.010 260)', fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.05em', fontSize: '0.75rem' }}>B (PEAK)</th>
                </tr>
              </thead>
              <tbody>
                {ec.deltas.filter(d => d.available === 'both').map((d) => {
                  const isEgtOrPw = d.pid === 'exhaustGasTemp' || d.pid === 'injectorPulseWidth';
                  let deltaColor = 'oklch(0.68 0.010 260)';
                  if (Math.abs(d.delta) > 0.01) {
                    if (isEgtOrPw) {
                      deltaColor = d.delta > 0 ? 'oklch(0.65 0.18 25)' : 'oklch(0.65 0.20 145)';
                    } else {
                      deltaColor = d.delta > 0 ? 'oklch(0.65 0.20 145)' : 'oklch(0.65 0.18 25)';
                    }
                  }
                  return (
                    <tr key={d.pid} style={{ borderBottom: '1px solid oklch(0.18 0.005 260)' }}>
                      <td style={{ padding: '5px 8px', color: 'oklch(0.70 0.005 260)' }}>{d.label}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'oklch(0.70 0.18 200)' }}>{d.aAvg.toFixed(1)} {d.unit}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'oklch(0.52 0.22 25)' }}>{d.bAvg.toFixed(1)} {d.unit}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: deltaColor, fontWeight: 600 }}>
                        {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(1)} ({d.deltaPct >= 0 ? '+' : ''}{d.deltaPct.toFixed(1)}%)
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'oklch(0.68 0.010 260)' }}>{d.aMax.toFixed(1)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'oklch(0.68 0.010 260)' }}>{d.bMax.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      paddingLeft: '1rem',
      borderLeft: '4px solid oklch(0.52 0.22 25)',
      marginBottom: '1rem',
    }}>
      <h2 style={{
        fontFamily: '"Bebas Neue", "Impact", sans-serif',
        fontSize: '1.3rem',
        letterSpacing: '0.08em',
        color: 'white',
        margin: 0,
      }}>{title}</h2>
    </div>
  );
}
