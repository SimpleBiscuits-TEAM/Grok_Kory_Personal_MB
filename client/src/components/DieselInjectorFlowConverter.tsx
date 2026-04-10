/**
 * DieselInjectorFlowConverter — Upload-driven workflow for converting stock OEM
 * injector duration tables to work with aftermarket injectors.
 *
 * Flow: Select Engine → Upload Flow Sheet (or manual entry) → Review → Export
 * Currently supports: Duramax > LB7
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  LB7_PRESSURE_AXIS_MPA,
  LB7_QUANTITY_AXIS_MM3,
  LB7_STOCK_DURATION_TABLE,
} from '@/lib/lb7InjectorData';
import {
  generateCorrectedTable,
  formatTableForExport,
  formatTableAsCSV,
  type FlowTestPoint,
  type CorrectionPoint,
} from '@/lib/injectorFlowConverter';
import { trpc } from '@/lib/trpc';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Check,
  Info,
  Fuel,
  Gauge,
  ArrowRight,
  Table2,
  BarChart3,
  Upload,
  Camera,
  Pencil,
  Loader2,
  AlertCircle,
  Trash2,
  Plus,
  RotateCcw,
} from 'lucide-react';

// ── Shared style tokens (match Advanced.tsx) ────────────────────────────────
const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};
const sColor = {
  bg: 'oklch(0.10 0.005 260)',
  bgDark: 'oklch(0.08 0.004 260)',
  bgCard: 'oklch(0.33 0.006 260)',
  bgInput: 'oklch(0.30 0.005 260)',
  border: 'oklch(0.22 0.008 260)',
  borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)',
  green: 'oklch(0.65 0.20 145)',
  blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)',
  purple: 'oklch(0.65 0.20 300)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)',
};

// ── Types ───────────────────────────────────────────────────────────────────
type Step = 'select-engine' | 'upload' | 'review' | 'results';

interface ExtractedData {
  brand: string;
  injectorModel: string;
  baseEngine: string;
  injectorType: string;
  date: string;
  injectorCount: number;
  testPoints: Array<{
    testPointNumber: number;
    pressureMPa: number;
    durationMicroseconds: number;
    averageQuantityMm3: number;
    variancePercent: number;
    perInjectorQuantities: number[];
  }>;
  testConditions: {
    fluid: string;
    temperature: string;
    speed: string;
    bench: string;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function getDeltaColor(stockVal: number, correctedVal: number): string {
  if (stockVal <= 0) return 'transparent';
  const pctChange = ((correctedVal - stockVal) / stockVal) * 100;
  if (pctChange > 15) return 'oklch(0.35 0.15 25 / 0.5)';
  if (pctChange > 5) return 'oklch(0.35 0.12 25 / 0.35)';
  if (pctChange > 1) return 'oklch(0.35 0.08 60 / 0.25)';
  if (pctChange < -15) return 'oklch(0.35 0.15 145 / 0.5)';
  if (pctChange < -5) return 'oklch(0.35 0.12 145 / 0.35)';
  if (pctChange < -1) return 'oklch(0.35 0.08 200 / 0.25)';
  return 'transparent';
}

function formatDelta(stockVal: number, correctedVal: number): string {
  if (stockVal <= 0) return '';
  const delta = correctedVal - stockVal;
  const pct = (delta / stockVal) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)} (${sign}${pct.toFixed(1)}%)`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:image/...;base64, prefix
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Collapsible Section ─────────────────────────────────────────────────────
function Section({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
          padding: '10px 14px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
          borderRadius: '4px', cursor: 'pointer', color: sColor.text,
          fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
        }}
      >
        {icon}
        {title}
        <span style={{ marginLeft: 'auto' }}>
          {open ? <ChevronDown style={{ width: 16, height: 16 }} /> : <ChevronRight style={{ width: 16, height: 16 }} />}
        </span>
      </button>
      {open && (
        <div style={{ padding: '12px 0 0 0' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Duration Table Component ────────────────────────────────────────────────
function DurationTable({
  table,
  stockTable,
  label,
  showDelta = false,
}: {
  table: number[][];
  stockTable?: number[][];
  label: string;
  showDelta?: boolean;
}) {
  const cellStyle: React.CSSProperties = {
    padding: '3px 5px',
    fontFamily: sFont.mono,
    fontSize: '0.65rem',
    textAlign: 'right',
    borderRight: `1px solid ${sColor.borderLight}`,
    borderBottom: `1px solid ${sColor.borderLight}`,
    whiteSpace: 'nowrap',
    minWidth: '48px',
  };

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontFamily: sFont.body,
    fontWeight: 700,
    fontSize: '0.7rem',
    textAlign: 'center',
    background: sColor.bgCard,
    color: sColor.yellow,
    position: 'sticky' as const,
    top: 0,
    zIndex: 2,
  };

  const rowHeaderStyle: React.CSSProperties = {
    ...cellStyle,
    fontFamily: sFont.body,
    fontWeight: 700,
    fontSize: '0.7rem',
    textAlign: 'center',
    background: sColor.bgCard,
    color: sColor.green,
    position: 'sticky' as const,
    left: 0,
    zIndex: 1,
    minWidth: '40px',
  };

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '500px', border: `1px solid ${sColor.border}`, borderRadius: '4px' }}>
      <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, position: 'sticky', left: 0, zIndex: 3, background: sColor.bgDark }}>
              <span style={{ fontSize: '0.6rem', color: sColor.textMuted }}>{label}</span>
            </th>
            {LB7_PRESSURE_AXIS_MPA.map((mpa) => (
              <th key={mpa} style={headerStyle}>{mpa}</th>
            ))}
          </tr>
          <tr>
            <th style={{ ...headerStyle, position: 'sticky', left: 0, zIndex: 3, background: sColor.bgDark, fontSize: '0.55rem', color: sColor.textMuted }}>
              mm³\MPa
            </th>
            {LB7_PRESSURE_AXIS_MPA.map((mpa) => (
              <th key={`u-${mpa}`} style={{ ...headerStyle, fontSize: '0.55rem', color: sColor.textMuted }}>MPa</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.map((row, r) => (
            <tr key={r}>
              <td style={rowHeaderStyle}>{LB7_QUANTITY_AXIS_MM3[r]}</td>
              {row.map((val, c) => {
                const bg = showDelta && stockTable
                  ? getDeltaColor(stockTable[r][c], val)
                  : 'transparent';
                return (
                  <td
                    key={c}
                    style={{
                      ...cellStyle,
                      background: bg,
                      color: val <= 0 ? sColor.textMuted : sColor.text,
                    }}
                    title={showDelta && stockTable && stockTable[r][c] > 0
                      ? `Stock: ${stockTable[r][c].toFixed(1)} → Corrected: ${val.toFixed(1)}\n${formatDelta(stockTable[r][c], val)}`
                      : `${val.toFixed(1)} µs`
                    }
                  >
                    {val.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Manual Entry Row ────────────────────────────────────────────────────────
function ManualTestPointRow({
  index,
  point,
  onChange,
  onRemove,
}: {
  index: number;
  point: FlowTestPoint;
  onChange: (updated: FlowTestPoint) => void;
  onRemove: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    padding: '6px 8px',
    fontFamily: sFont.mono,
    fontSize: '0.8rem',
    background: sColor.bgInput,
    border: `1px solid ${sColor.borderLight}`,
    borderRadius: '3px',
    color: sColor.text,
    width: '90px',
    textAlign: 'center',
  };

  return (
    <tr>
      <td style={{ padding: '4px 8px', fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.yellow, textAlign: 'center' }}>
        {index + 1}
      </td>
      <td style={{ padding: '4px' }}>
        <input
          type="number"
          value={point.pressureMPa || ''}
          onChange={(e) => onChange({ ...point, pressureMPa: parseFloat(e.target.value) || 0 })}
          placeholder="160"
          style={inputStyle}
        />
      </td>
      <td style={{ padding: '4px' }}>
        <input
          type="number"
          value={point.durationUs || ''}
          onChange={(e) => onChange({ ...point, durationUs: parseFloat(e.target.value) || 0 })}
          placeholder="1700"
          style={inputStyle}
        />
      </td>
      <td style={{ padding: '4px' }}>
        <input
          type="number"
          step="0.1"
          value={point.avgFlowMm3 || ''}
          onChange={(e) => onChange({ ...point, avgFlowMm3: parseFloat(e.target.value) || 0 })}
          placeholder="127"
          style={inputStyle}
        />
      </td>
      <td style={{ padding: '4px', textAlign: 'center' }}>
        <button
          onClick={onRemove}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: sColor.textMuted, padding: '4px',
          }}
          title="Remove test point"
        >
          <Trash2 style={{ width: 14, height: 14 }} />
        </button>
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function DieselInjectorFlowConverter() {
  // ── State ──
  const [step, setStep] = useState<Step>('select-engine');
  const [engine, setEngine] = useState('');
  const [variant, setVariant] = useState('');
  const [entryMode, setEntryMode] = useState<'upload' | 'manual'>('upload');

  // Upload state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Extracted / manual data
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [testPoints, setTestPoints] = useState<FlowTestPoint[]>([
    { pressureMPa: 160, durationUs: 1700, avgFlowMm3: 0 },
    { pressureMPa: 160, durationUs: 1350, avgFlowMm3: 0 },
    { pressureMPa: 60, durationUs: 700, avgFlowMm3: 0 },
    { pressureMPa: 30, durationUs: 800, avgFlowMm3: 0 },
  ]);
  const [injectorLabel, setInjectorLabel] = useState('');

  // Results state
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<'corrected' | 'stock' | 'delta'>('corrected');

  // ── tRPC mutation ──
  const ocrMutation = trpc.injectorOcr.extractFlowSheet.useMutation();

  // ── Computed result ──
  const validTestPoints = testPoints.filter(
    (tp) => tp.pressureMPa > 0 && tp.durationUs > 0 && tp.avgFlowMm3 > 0
  );

  const result = useMemo(() => {
    if (step !== 'results' || validTestPoints.length < 2) return null;
    try {
      return generateCorrectedTable(validTestPoints);
    } catch {
      return null;
    }
  }, [step, validTestPoints]);

  // ── Handlers ──
  const handleEngineSelect = useCallback((eng: string, vari: string) => {
    setEngine(eng);
    setVariant(vari);
    setStep('upload');
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setImageFile(file);
    setOcrError(null);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleUploadAndExtract = useCallback(async () => {
    if (!imageFile) return;
    setOcrError(null);
    try {
      const base64 = await fileToBase64(imageFile);
      const res = await ocrMutation.mutateAsync({
        imageBase64: base64,
        mimeType: imageFile.type,
      });

      if (res.success && res.data) {
        const data = res.data as ExtractedData;
        setExtractedData(data);
        setInjectorLabel(`${data.brand} ${data.injectorModel}`);

        // Convert extracted test points to FlowTestPoint format
        const points: FlowTestPoint[] = data.testPoints.map((tp) => ({
          pressureMPa: tp.pressureMPa,
          durationUs: tp.durationMicroseconds,
          avgFlowMm3: tp.averageQuantityMm3,
        }));
        setTestPoints(points);
        setStep('review');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OCR extraction failed';
      setOcrError(msg);
    }
  }, [imageFile, ocrMutation]);

  const handleManualProceed = useCallback(() => {
    if (validTestPoints.length < 2) return;
    setStep('review');
  }, [validTestPoints]);

  const handleGenerateTable = useCallback(() => {
    if (validTestPoints.length < 2) return;
    setStep('results');
  }, [validTestPoints]);

  const handleCopyTSV = useCallback(() => {
    if (!result) return;
    const tsv = formatTableForExport(result.table);
    navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [result]);

  const handleDownloadCSV = useCallback(() => {
    if (!result) return;
    const csv = formatTableAsCSV(result.table);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${variant}_${injectorLabel.replace(/\s+/g, '_')}_corrected_duration.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, variant, injectorLabel]);

  const handleStartOver = useCallback(() => {
    setStep('select-engine');
    setEngine('');
    setVariant('');
    setImageFile(null);
    setImagePreview(null);
    setOcrError(null);
    setExtractedData(null);
    setTestPoints([
      { pressureMPa: 160, durationUs: 1700, avgFlowMm3: 0 },
      { pressureMPa: 160, durationUs: 1350, avgFlowMm3: 0 },
      { pressureMPa: 60, durationUs: 700, avgFlowMm3: 0 },
      { pressureMPa: 30, durationUs: 800, avgFlowMm3: 0 },
    ]);
    setInjectorLabel('');
    setCopied(false);
    setActiveView('corrected');
  }, []);

  const addTestPoint = useCallback(() => {
    setTestPoints((prev) => [...prev, { pressureMPa: 0, durationUs: 0, avgFlowMm3: 0 }]);
  }, []);

  const updateTestPoint = useCallback((index: number, updated: FlowTestPoint) => {
    setTestPoints((prev) => prev.map((tp, i) => (i === index ? updated : tp)));
  }, []);

  const removeTestPoint = useCallback((index: number) => {
    setTestPoints((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Step indicator ──
  const steps: { id: Step; label: string }[] = [
    { id: 'select-engine', label: '1. SELECT ENGINE' },
    { id: 'upload', label: '2. FLOW SHEET' },
    { id: 'review', label: '3. REVIEW DATA' },
    { id: 'results', label: '4. RESULTS' },
  ];

  return (
    <div style={{ padding: '1rem', maxWidth: '100%', color: sColor.text }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Fuel style={{ width: 28, height: 28, color: sColor.red }} />
        <div>
          <h1 style={{ fontFamily: sFont.heading, fontSize: '1.6rem', letterSpacing: '0.1em', color: 'white', margin: 0, lineHeight: 1 }}>
            DIESEL INJECTOR FLOW CONVERTER
          </h1>
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, margin: '2px 0 0 0' }}>
            Convert stock OEM duration tables for aftermarket injectors
          </p>
        </div>
        {step !== 'select-engine' && (
          <button
            onClick={handleStartOver}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px', fontFamily: sFont.body, fontSize: '0.8rem', fontWeight: 700,
              border: `1px solid ${sColor.border}`, borderRadius: '3px', cursor: 'pointer',
              background: 'transparent', color: sColor.textDim,
            }}
          >
            <RotateCcw style={{ width: 14, height: 14 }} />
            START OVER
          </button>
        )}
      </div>

      {/* ── Step Indicator ── */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '1.5rem', padding: '4px',
        background: sColor.bgDark, borderRadius: '4px', border: `1px solid ${sColor.borderLight}`,
      }}>
        {steps.map((s) => {
          const isActive = s.id === step;
          const stepIndex = steps.findIndex((x) => x.id === step);
          const thisIndex = steps.findIndex((x) => x.id === s.id);
          const isCompleted = thisIndex < stepIndex;
          return (
            <div
              key={s.id}
              style={{
                flex: 1, padding: '8px 12px', textAlign: 'center',
                fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 700,
                letterSpacing: '0.05em', borderRadius: '3px',
                background: isActive ? 'oklch(0.52 0.22 25 / 0.2)' : isCompleted ? 'oklch(0.65 0.20 145 / 0.1)' : 'transparent',
                color: isActive ? sColor.red : isCompleted ? sColor.green : sColor.textMuted,
                border: isActive ? `1px solid ${sColor.red}` : '1px solid transparent',
              }}
            >
              {isCompleted && <Check style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />}
              {s.label}
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 1: SELECT ENGINE                                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'select-engine' && (
        <div>
          <h2 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.08em', color: sColor.yellow, marginBottom: '1rem' }}>
            SELECT YOUR ENGINE PLATFORM
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
            {/* Duramax LB7 */}
            <button
              onClick={() => handleEngineSelect('Duramax', 'LB7')}
              style={{
                padding: '20px', background: sColor.bgCard, border: `1px solid ${sColor.border}`,
                borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = sColor.red)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = sColor.border)}
            >
              <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: sColor.text }}>
                DURAMAX
              </div>
              <div style={{ fontFamily: sFont.body, fontSize: '1rem', color: sColor.green, fontWeight: 700 }}>
                LB7
              </div>
              <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textMuted, marginTop: '4px' }}>
                2001–2004 · 6.6L V8 · {'{'}B0720{'}'} Main Injection Pulse
              </div>
            </button>

            {/* Placeholder for future engines */}
            {['LLY', 'LBZ', 'LMM', 'LML', 'L5P'].map((eng) => (
              <div
                key={eng}
                style={{
                  padding: '20px', background: sColor.bgDark, border: `1px dashed ${sColor.borderLight}`,
                  borderRadius: '6px', textAlign: 'left', opacity: 0.4,
                }}
              >
                <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: sColor.textMuted }}>
                  DURAMAX
                </div>
                <div style={{ fontFamily: sFont.body, fontSize: '1rem', color: sColor.textMuted, fontWeight: 700 }}>
                  {eng}
                </div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textMuted, marginTop: '4px' }}>
                  Coming soon
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 2: UPLOAD FLOW SHEET OR MANUAL ENTRY                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <div>
          {/* Engine badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
            background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '4px',
            marginBottom: '1rem',
          }}>
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.yellow }}>{engine}</span>
            <ArrowRight style={{ width: 14, height: 14, color: sColor.textMuted }} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.green }}>{variant}</span>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '1rem' }}>
            <button
              onClick={() => setEntryMode('upload')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700,
                border: `1px solid ${entryMode === 'upload' ? sColor.red : sColor.border}`,
                borderRadius: '3px', cursor: 'pointer',
                background: entryMode === 'upload' ? 'oklch(0.52 0.22 25 / 0.15)' : 'transparent',
                color: entryMode === 'upload' ? sColor.red : sColor.textDim,
              }}
            >
              <Camera style={{ width: 16, height: 16 }} />
              UPLOAD FLOW SHEET
            </button>
            <button
              onClick={() => setEntryMode('manual')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700,
                border: `1px solid ${entryMode === 'manual' ? sColor.blue : sColor.border}`,
                borderRadius: '3px', cursor: 'pointer',
                background: entryMode === 'manual' ? 'oklch(0.70 0.18 200 / 0.15)' : 'transparent',
                color: entryMode === 'manual' ? sColor.blue : sColor.textDim,
              }}
            >
              <Pencil style={{ width: 16, height: 16 }} />
              MANUAL ENTRY
            </button>
          </div>

          {/* Upload mode */}
          {entryMode === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />

              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '40px 20px', textAlign: 'center',
                  border: `2px dashed ${imagePreview ? sColor.green : sColor.border}`,
                  borderRadius: '8px', cursor: 'pointer',
                  background: imagePreview ? 'oklch(0.65 0.20 145 / 0.05)' : sColor.bgDark,
                  transition: 'border-color 0.2s',
                }}
              >
                {imagePreview ? (
                  <div>
                    <img
                      src={imagePreview}
                      alt="Flow sheet preview"
                      style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px', marginBottom: '12px' }}
                    />
                    <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.green, margin: 0 }}>
                      <Check style={{ width: 14, height: 14, display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                      {imageFile?.name} — Click to change
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload style={{ width: 40, height: 40, color: sColor.textMuted, margin: '0 auto 12px' }} />
                    <p style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.08em', color: sColor.text, margin: '0 0 4px 0' }}>
                      DROP FLOW SHEET IMAGE HERE
                    </p>
                    <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textMuted, margin: 0 }}>
                      or click to browse — supports JPG, PNG, WEBP
                    </p>
                  </div>
                )}
              </div>

              {/* OCR error */}
              {ocrError && (
                <div style={{
                  marginTop: '10px', padding: '10px 14px', background: 'oklch(0.52 0.22 25 / 0.1)',
                  border: `1px solid ${sColor.red}`, borderRadius: '4px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <AlertCircle style={{ width: 16, height: 16, color: sColor.red, flexShrink: 0 }} />
                  <span style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.red }}>{ocrError}</span>
                </div>
              )}

              {/* Extract button */}
              {imageFile && (
                <button
                  onClick={handleUploadAndExtract}
                  disabled={ocrMutation.isPending}
                  style={{
                    marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '12px 24px', fontFamily: sFont.heading, fontSize: '1rem',
                    letterSpacing: '0.08em', border: `1px solid ${sColor.red}`,
                    borderRadius: '4px', cursor: ocrMutation.isPending ? 'wait' : 'pointer',
                    background: 'oklch(0.52 0.22 25 / 0.15)', color: sColor.red,
                    opacity: ocrMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {ocrMutation.isPending ? (
                    <>
                      <Loader2 style={{ width: 18, height: 18, animation: 'spin 1s linear infinite' }} />
                      EXTRACTING DATA...
                    </>
                  ) : (
                    <>
                      <BarChart3 style={{ width: 18, height: 18 }} />
                      EXTRACT FLOW DATA
                    </>
                  )}
                </button>
              )}

              <p style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textMuted, marginTop: '10px' }}>
                Upload a photo or scan of your aftermarket injector flow sheet (S&S Diesel, Exergy, Industrial Injection, etc.).
                The tool will read the test points automatically. You can edit the values after extraction if needed.
              </p>
            </div>
          )}

          {/* Manual entry mode */}
          {entryMode === 'manual' && (
            <div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
                  Injector Name / Model (optional)
                </label>
                <input
                  type="text"
                  value={injectorLabel}
                  onChange={(e) => setInjectorLabel(e.target.value)}
                  placeholder="e.g., S&S SAC00, Exergy 60% Over"
                  style={{
                    padding: '8px 12px', fontFamily: sFont.body, fontSize: '0.85rem',
                    background: sColor.bgInput, border: `1px solid ${sColor.borderLight}`,
                    borderRadius: '3px', color: sColor.text, width: '100%', maxWidth: '400px',
                  }}
                />
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['#', 'Pressure (MPa)', 'Duration (µs)', 'Avg Flow (mm³/stroke)', ''].map((h) => (
                        <th key={h} style={{
                          padding: '6px 10px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 700,
                          textAlign: 'center', color: sColor.yellow, borderBottom: `1px solid ${sColor.border}`,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {testPoints.map((tp, i) => (
                      <ManualTestPointRow
                        key={i}
                        index={i}
                        point={tp}
                        onChange={(updated) => updateTestPoint(i, updated)}
                        onRemove={() => removeTestPoint(i)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={addTestPoint}
                style={{
                  marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 14px', fontFamily: sFont.body, fontSize: '0.8rem',
                  border: `1px solid ${sColor.borderLight}`, borderRadius: '3px',
                  cursor: 'pointer', background: 'transparent', color: sColor.textDim,
                }}
              >
                <Plus style={{ width: 14, height: 14 }} />
                ADD TEST POINT
              </button>

              <button
                onClick={handleManualProceed}
                disabled={validTestPoints.length < 2}
                style={{
                  marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', fontFamily: sFont.heading, fontSize: '1rem',
                  letterSpacing: '0.08em', border: `1px solid ${validTestPoints.length >= 2 ? sColor.red : sColor.border}`,
                  borderRadius: '4px', cursor: validTestPoints.length >= 2 ? 'pointer' : 'not-allowed',
                  background: validTestPoints.length >= 2 ? 'oklch(0.52 0.22 25 / 0.15)' : 'transparent',
                  color: validTestPoints.length >= 2 ? sColor.red : sColor.textMuted,
                }}
              >
                <ArrowRight style={{ width: 18, height: 18 }} />
                REVIEW & GENERATE
              </button>

              <p style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textMuted, marginTop: '10px' }}>
                Enter the test points from your injector flow sheet. You need at least 2 test points at different pressures.
                The standard 4 test points are pre-filled — just enter the average flow (mm³/stroke) for each.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 3: REVIEW EXTRACTED DATA                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'review' && (
        <div>
          {/* Engine + injector badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
            background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '4px',
            marginBottom: '1rem', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.yellow }}>{engine}</span>
            <ArrowRight style={{ width: 14, height: 14, color: sColor.textMuted }} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.green }}>{variant}</span>
            {injectorLabel && (
              <>
                <ArrowRight style={{ width: 14, height: 14, color: sColor.textMuted }} />
                <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.blue }}>{injectorLabel}</span>
              </>
            )}
          </div>

          {/* Extracted metadata */}
          {extractedData && (
            <div style={{
              padding: '10px 14px', background: 'oklch(0.15 0.008 260)', borderRadius: '4px',
              border: `1px solid ${sColor.borderLight}`, marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', fontFamily: sFont.body, fontSize: '0.8rem' }}>
                <span><strong style={{ color: sColor.yellow }}>Brand:</strong> <span style={{ color: sColor.text }}>{extractedData.brand}</span></span>
                <span><strong style={{ color: sColor.yellow }}>Model:</strong> <span style={{ color: sColor.text }}>{extractedData.injectorModel}</span></span>
                <span><strong style={{ color: sColor.yellow }}>Type:</strong> <span style={{ color: sColor.text }}>{extractedData.injectorType}</span></span>
                <span><strong style={{ color: sColor.yellow }}>Date:</strong> <span style={{ color: sColor.text }}>{extractedData.date}</span></span>
                <span><strong style={{ color: sColor.yellow }}>Injectors:</strong> <span style={{ color: sColor.text }}>{extractedData.injectorCount}</span></span>
              </div>
            </div>
          )}

          <h3 style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em', color: sColor.text, marginBottom: '8px' }}>
            REVIEW TEST POINTS
          </h3>
          <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, marginBottom: '10px' }}>
            Verify the extracted data below. You can edit any values before generating the corrected table.
          </p>

          {/* Editable test points table */}
          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['#', 'Pressure (MPa)', 'Duration (µs)', 'Avg Flow (mm³/stroke)', ''].map((h) => (
                    <th key={h} style={{
                      padding: '6px 10px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 700,
                      textAlign: 'center', color: sColor.yellow, borderBottom: `1px solid ${sColor.border}`,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testPoints.map((tp, i) => (
                  <ManualTestPointRow
                    key={i}
                    index={i}
                    point={tp}
                    onChange={(updated) => updateTestPoint(i, updated)}
                    onRemove={() => removeTestPoint(i)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={addTestPoint}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', fontFamily: sFont.body, fontSize: '0.8rem',
                border: `1px solid ${sColor.borderLight}`, borderRadius: '3px',
                cursor: 'pointer', background: 'transparent', color: sColor.textDim,
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              ADD TEST POINT
            </button>

            <button
              onClick={handleGenerateTable}
              disabled={validTestPoints.length < 2}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 24px', fontFamily: sFont.heading, fontSize: '1rem',
                letterSpacing: '0.08em', border: `1px solid ${validTestPoints.length >= 2 ? sColor.red : sColor.border}`,
                borderRadius: '4px', cursor: validTestPoints.length >= 2 ? 'pointer' : 'not-allowed',
                background: validTestPoints.length >= 2 ? 'oklch(0.52 0.22 25 / 0.15)' : 'transparent',
                color: validTestPoints.length >= 2 ? sColor.red : sColor.textMuted,
              }}
            >
              <Table2 style={{ width: 18, height: 18 }} />
              GENERATE CORRECTED TABLE
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 4: RESULTS                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'results' && result && (
        <div>
          {/* Engine + injector badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
            background: sColor.bgCard, border: `1px solid ${sColor.border}`, borderRadius: '4px',
            marginBottom: '1rem', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.yellow }}>{engine}</span>
            <ArrowRight style={{ width: 14, height: 14, color: sColor.textMuted }} />
            <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.green }}>{variant}</span>
            {injectorLabel && (
              <>
                <ArrowRight style={{ width: 14, height: 14, color: sColor.textMuted }} />
                <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700, color: sColor.blue }}>{injectorLabel}</span>
              </>
            )}
            <span style={{
              marginLeft: 'auto', fontFamily: sFont.mono, fontSize: '0.7rem',
              padding: '2px 8px', borderRadius: '2px',
              background: 'oklch(0.52 0.22 25 / 0.15)', border: '1px solid oklch(0.52 0.22 25 / 0.3)',
              color: sColor.red,
            }}>
              {'{'} B0720 {'}'} MAIN INJECTION PULSE
            </span>
          </div>

          {/* Correction Points Summary */}
          <Section
            title={`${injectorLabel || 'AFTERMARKET'} FLOW CORRECTION ANALYSIS`}
            icon={<BarChart3 style={{ width: 16, height: 16, color: sColor.blue }} />}
            defaultOpen={false}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '700px' }}>
                <thead>
                  <tr>
                    {['#', 'MPa', 'µSec', 'Aftermarket (mm³)', 'Stock (mm³)', 'Correction'].map((h) => (
                      <th key={h} style={{
                        padding: '6px 10px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 700,
                        textAlign: 'center', color: sColor.yellow, background: sColor.bgCard,
                        borderBottom: `1px solid ${sColor.border}`,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.correctionPoints.map((cp: CorrectionPoint, i: number) => {
                    const factorPct = ((1 / cp.correctionFactor - 1) * 100);
                    const factorColor = factorPct > 0 ? sColor.green : sColor.red;
                    return (
                      <tr key={i}>
                        <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.text, borderBottom: `1px solid ${sColor.borderLight}` }}>
                          {i + 1}
                        </td>
                        <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.text, borderBottom: `1px solid ${sColor.borderLight}` }}>
                          {cp.pressureMPa}
                        </td>
                        <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.text, borderBottom: `1px solid ${sColor.borderLight}` }}>
                          {cp.durationUs}
                        </td>
                        <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.blue, fontWeight: 700, borderBottom: `1px solid ${sColor.borderLight}` }}>
                          {cp.aftermarketMm3.toFixed(1)}
                        </td>
                        <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: sColor.textDim, borderBottom: `1px solid ${sColor.borderLight}` }}>
                          {cp.stockMm3.toFixed(1)}
                        </td>
                        <td style={{ padding: '5px 10px', fontFamily: sFont.mono, fontSize: '0.75rem', textAlign: 'center', color: factorColor, fontWeight: 700, borderBottom: `1px solid ${sColor.borderLight}` }}>
                          {cp.correctionFactor.toFixed(3)}x ({factorPct > 0 ? '+' : ''}{factorPct.toFixed(1)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '8px', padding: '8px 12px', background: 'oklch(0.15 0.008 260)', borderRadius: '4px', border: `1px solid ${sColor.borderLight}` }}>
              <p style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim, margin: 0, lineHeight: 1.6 }}>
                <Info style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                <strong style={{ color: sColor.text }}>How it works:</strong> The correction factor adjusts the pulse width so the ECM delivers the same fuel quantity as the stock calibration expects.
                Factor {'>'} 1.0 = longer pulse (aftermarket flows less). Factor {'<'} 1.0 = shorter pulse (aftermarket flows more).
              </p>
            </div>
          </Section>

          {/* Correction Curve */}
          <Section
            title="PRESSURE-BASED CORRECTION CURVE"
            icon={<Gauge style={{ width: 16, height: 16, color: sColor.purple }} />}
            defaultOpen={false}
          >
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px', padding: '0 4px' }}>
                {result.correctionCurve.map((pt) => {
                  if (pt.pressureMPa === 0) return null;
                  const maxFactor = Math.max(...result.correctionCurve.filter(p => p.pressureMPa > 0).map(p => p.factor));
                  const minFactor = Math.min(...result.correctionCurve.filter(p => p.pressureMPa > 0).map(p => p.factor));
                  const range = maxFactor - minFactor || 1;
                  const height = ((pt.factor - minFactor) / range) * 90 + 10;
                  const barColor = pt.factor > 1.0
                    ? `oklch(0.52 0.22 25 / ${0.3 + (pt.factor - 1) * 2})`
                    : `oklch(0.65 0.20 145 / ${0.3 + (1 - pt.factor) * 3})`;
                  return (
                    <div
                      key={pt.pressureMPa}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '30px' }}
                      title={`${pt.pressureMPa} MPa → ${pt.factor.toFixed(3)}x`}
                    >
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim, marginBottom: '2px' }}>
                        {pt.factor.toFixed(2)}
                      </span>
                      <div style={{
                        width: '100%', maxWidth: '28px', height: `${height}%`,
                        background: barColor, borderRadius: '2px 2px 0 0',
                        border: `1px solid ${pt.factor > 1 ? 'oklch(0.52 0.22 25 / 0.4)' : 'oklch(0.65 0.20 145 / 0.4)'}`,
                      }} />
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted, marginTop: '2px' }}>
                        {pt.pressureMPa}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'center', fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, marginTop: '4px' }}>
                Fuel Rail Pressure (MPa) → Correction Factor
              </div>
            </div>
          </Section>

          {/* Duration Table */}
          <Section
            title="DURATION TABLE"
            icon={<Table2 style={{ width: 16, height: 16, color: sColor.green }} />}
            defaultOpen={true}
          >
            <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
              {([
                { id: 'corrected' as const, label: `CORRECTED (${injectorLabel || 'AFTERMARKET'})`, color: sColor.green },
                { id: 'stock' as const, label: 'STOCK OEM', color: sColor.textMuted },
                { id: 'delta' as const, label: 'DELTA VIEW', color: sColor.yellow },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(tab.id)}
                  style={{
                    padding: '6px 14px', fontFamily: sFont.body, fontSize: '0.75rem', fontWeight: 700,
                    letterSpacing: '0.05em', border: `1px solid ${activeView === tab.id ? tab.color : sColor.border}`,
                    borderRadius: '3px', cursor: 'pointer',
                    background: activeView === tab.id ? `${tab.color}22` : 'transparent',
                    color: activeView === tab.id ? tab.color : sColor.textDim,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeView === 'corrected' && (
              <DurationTable table={result.table} stockTable={LB7_STOCK_DURATION_TABLE} label={`${injectorLabel || 'Corrected'} (µs)`} showDelta />
            )}
            {activeView === 'stock' && (
              <DurationTable table={LB7_STOCK_DURATION_TABLE} label="Stock OEM LB7 (µs)" />
            )}
            {activeView === 'delta' && (
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '500px', border: `1px solid ${sColor.border}`, borderRadius: '4px' }}>
                <table style={{ borderCollapse: 'collapse', width: 'max-content' }}>
                  <thead>
                    <tr>
                      <th style={{
                        padding: '3px 5px', fontFamily: sFont.body, fontSize: '0.7rem', fontWeight: 700,
                        textAlign: 'center', background: sColor.bgDark, color: sColor.yellow,
                        borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                        position: 'sticky', left: 0, top: 0, zIndex: 3,
                      }}>
                        Δ µs
                      </th>
                      {LB7_PRESSURE_AXIS_MPA.map((mpa) => (
                        <th key={mpa} style={{
                          padding: '3px 5px', fontFamily: sFont.body, fontSize: '0.7rem', fontWeight: 700,
                          textAlign: 'center', background: sColor.bgCard, color: sColor.yellow,
                          borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                          position: 'sticky', top: 0, zIndex: 2,
                        }}>
                          {mpa}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.table.map((row, r) => (
                      <tr key={r}>
                        <td style={{
                          padding: '3px 5px', fontFamily: sFont.body, fontSize: '0.7rem', fontWeight: 700,
                          textAlign: 'center', background: sColor.bgCard, color: sColor.green,
                          borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                          position: 'sticky', left: 0, zIndex: 1,
                        }}>
                          {LB7_QUANTITY_AXIS_MM3[r]}
                        </td>
                        {row.map((val, c) => {
                          const stock = LB7_STOCK_DURATION_TABLE[r][c];
                          const delta = val - stock;
                          const bg = getDeltaColor(stock, val);
                          return (
                            <td key={c} style={{
                              padding: '3px 5px', fontFamily: sFont.mono, fontSize: '0.65rem',
                              textAlign: 'right', background: bg,
                              color: stock <= 0 ? sColor.textMuted : delta > 0 ? sColor.red : delta < 0 ? sColor.green : sColor.textDim,
                              borderRight: `1px solid ${sColor.borderLight}`, borderBottom: `1px solid ${sColor.borderLight}`,
                              minWidth: '48px',
                            }}>
                              {stock <= 0 ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.red }}>
                ■ Red cells = Duration increased (needs longer pulse)
              </span>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.green }}>
                ■ Green cells = Duration decreased (needs shorter pulse)
              </span>
            </div>
          </Section>

          {/* Export Section */}
          <Section
            title="EXPORT CORRECTED TABLE"
            icon={<Download style={{ width: 16, height: 16, color: sColor.yellow }} />}
            defaultOpen={true}
          >
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={handleCopyTSV}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 20px', fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700,
                  letterSpacing: '0.05em', border: `1px solid ${copied ? sColor.green : sColor.red}`,
                  borderRadius: '4px', cursor: 'pointer',
                  background: copied ? 'oklch(0.65 0.20 145 / 0.15)' : 'oklch(0.52 0.22 25 / 0.15)',
                  color: copied ? sColor.green : sColor.red,
                  transition: 'all 0.2s',
                }}
              >
                {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
                {copied ? 'COPIED TO CLIPBOARD' : 'COPY TABLE (TAB-SEPARATED)'}
              </button>

              <button
                onClick={handleDownloadCSV}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 20px', fontFamily: sFont.body, fontSize: '0.85rem', fontWeight: 700,
                  letterSpacing: '0.05em', border: `1px solid ${sColor.border}`,
                  borderRadius: '4px', cursor: 'pointer',
                  background: 'transparent', color: sColor.textDim,
                }}
              >
                <Download style={{ width: 16, height: 16 }} />
                DOWNLOAD CSV
              </button>
            </div>

            <div style={{ marginTop: '10px', padding: '8px 12px', background: 'oklch(0.15 0.008 260)', borderRadius: '4px', border: `1px solid ${sColor.borderLight}` }}>
              <p style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim, margin: 0, lineHeight: 1.6 }}>
                <Info style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                <strong style={{ color: sColor.text }}>Paste into calibration:</strong> Use "Copy Table" for tab-separated format compatible with HP Tuners and EFILive paste operations.
                Select the entire {'{'}B0720{'}'} Main Injection Pulse table in your calibration software, then paste the copied data to replace all values.
              </p>
            </div>
          </Section>
        </div>
      )}

      {/* Spin animation for loader */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
