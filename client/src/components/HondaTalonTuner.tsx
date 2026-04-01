/**
 * Honda Talon Tuner — WP8 Datalog Viewer + Fuel Map Editor
 *
 * Features:
 *   - WP8 datalog table & chart view with all 58 channels
 *   - Four fuel map upload cards (Alpha-N Cyl 1 & 2, Speed Density Cyl 1 & 2)
 *   - Heat-map grid editor for each fuel map
 *   - CSV paste/upload support for fuel tables from C3 Tuning Software
 *   - Screenshot OCR upload — snap a picture of C3 table, AI extracts all values
 *   - Target Lambda row above RPM axis for future log-based fuel tuning
 *
 * Design: Matches PPEI motorsport dark theme
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Upload, Loader2, Table2, LineChart, Download, Trash2,
  ChevronDown, ChevronRight, AlertCircle, CheckCircle,
  Fuel, Gauge, Thermometer, Activity, Camera, ImageIcon,
  GitCompare, ArrowRight, Wrench
} from 'lucide-react';
import { WP8ParseResult, WP8Channel, getHondaTalonKeyChannels, wp8ToCSV } from '@/lib/wp8Parser';
import TalonLogViewer, { TalonCursorData } from '@/components/TalonLogViewer';
import { trpc } from '@/lib/trpc';
import FuelCorrectionPanel from '@/components/FuelCorrectionPanel';
import { FuelMapState as CorrectionFuelMapState, MapCorrectionResult } from '@/lib/talonFuelCorrection';

/** Tracks which cells were corrected per fuel map, keyed by mapKey */
export type CorrectedCellsMap = Record<string, Set<string>>;

// ─── Style constants (matches PPEI motorsport dark) ─────────────────────────
const sColor = {
  bg: '#0a0a0a',
  card: 'oklch(0.33 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.68 0.20 25)',        // brightened from 0.52 for readability on dark bg
  redBright: 'oklch(0.74 0.22 25)',   // brightened from 0.60
  text: 'white',
  textDim: 'oklch(0.68 0.010 260)',
  textMid: 'oklch(0.70 0.010 260)',
  green: 'oklch(0.65 0.20 145)',
  yellow: 'oklch(0.80 0.18 90)',
  blue: 'oklch(0.65 0.18 250)',
  cyan: 'oklch(0.72 0.14 200)',
};
const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

// ─── Fuel Map Types ─────────────────────────────────────────────────────────
interface FuelMap {
  name: string;
  description: string;
  rowAxis: number[];  // RPM axis
  colAxis: number[];  // TPS or MAP axis
  data: number[][];   // 2D fuel values
  targetLambda: number[];  // Target Lambda row (one per column)
  rowLabel: string;
  colLabel: string;
  unit: string;
}

interface FuelMapState {
  alphaN_cyl1: FuelMap | null;
  alphaN_cyl2: FuelMap | null;
  speedDensity_cyl1: FuelMap | null;
  speedDensity_cyl2: FuelMap | null;
}

const FUEL_MAP_CONFIGS = [
  { key: 'alphaN_cyl1' as const, label: 'Alpha-N Cylinder 1', desc: 'TPS-based fueling for Cylinder 1', rowLabel: 'RPM', colLabel: 'TPS %' },
  { key: 'alphaN_cyl2' as const, label: 'Alpha-N Cylinder 2', desc: 'TPS-based fueling for Cylinder 2', rowLabel: 'RPM', colLabel: 'TPS %' },
  { key: 'speedDensity_cyl1' as const, label: 'Speed Density Cylinder 1', desc: 'MAP-based fueling for Cylinder 1', rowLabel: 'RPM', colLabel: 'MAP kPa' },
  { key: 'speedDensity_cyl2' as const, label: 'Speed Density Cylinder 2', desc: 'MAP-based fueling for Cylinder 2', rowLabel: 'RPM', colLabel: 'MAP kPa' },
];

// ─── CSV Fuel Table Parser ──────────────────────────────────────────────────
function parseFuelTableCSV(text: string): FuelMap | null {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 3) return null;

  // First row: header with axis values (first cell is label, rest are column axis)
  const headerCells = lines[0].split(/[,\t]/).map(c => c.trim());
  const colLabel = headerCells[0] || 'Axis';
  const colAxis = headerCells.slice(1).map(Number).filter(n => !isNaN(n));
  if (colAxis.length === 0) return null;

  const rowAxis: number[] = [];
  const data: number[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(/[,\t]/).map(c => c.trim());
    const rowVal = Number(cells[0]);
    if (isNaN(rowVal)) continue;
    rowAxis.push(rowVal);
    const rowData = cells.slice(1, colAxis.length + 1).map(c => {
      const n = Number(c);
      return isNaN(n) ? 0 : n;
    });
    // Pad if needed
    while (rowData.length < colAxis.length) rowData.push(0);
    data.push(rowData);
  }

  if (rowAxis.length === 0 || data.length === 0) return null;

  return {
    name: '',
    description: '',
    rowAxis,
    colAxis,
    data,
    targetLambda: colAxis.map(() => 0.85), // Default target lambda
    rowLabel: 'RPM',
    colLabel,
    unit: '%',
  };
}

// ─── Heat Map Color ─────────────────────────────────────────────────────────
function getHeatColor(value: number, min: number, max: number): string {
  if (max === min) return 'oklch(0.45 0.15 145)'; // green
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Green (low) → Yellow (mid) → Orange-Red (high)
  // Higher lightness range (0.38–0.52) ensures white text stays readable
  if (t < 0.5) {
    const s = t * 2;
    const l = 0.38 + s * 0.14;  // 0.38 → 0.52 (brighter greens/yellows)
    const c = 0.14 + s * 0.06;  // slightly more saturated
    const h = 145 - s * 55;     // green → yellow
    return `oklch(${l} ${c} ${h})`;
  } else {
    const s = (t - 0.5) * 2;
    const l = 0.52 - s * 0.10;  // 0.52 → 0.42 (reds stay brighter, min 0.42)
    const c = 0.18 + s * 0.04;
    const h = 90 - s * 55;      // yellow → orange-red (stops at hue 35, not 25)
    return `oklch(${l} ${c} ${h})`;
  }
}

// ─── Fact-check: detect table type from OCR-extracted title ────────────────
function detectTableType(tableName: string): { mode: 'alphaN' | 'speedDensity' | null; cylinder: 1 | 2 | null } {
  const lower = tableName.toLowerCase();
  const mode = lower.includes('alpha') ? 'alphaN' as const
    : (lower.includes('speed') && lower.includes('density')) ? 'speedDensity' as const
    : null;
  const cyl = lower.includes('cyl 1') || lower.includes('cylinder 1') ? 1 as const
    : lower.includes('cyl 2') || lower.includes('cylinder 2') ? 2 as const
    : null;
  return { mode, cylinder: cyl };
}

function getExpectedTableType(key: string): { mode: 'alphaN' | 'speedDensity'; cylinder: 1 | 2 } {
  if (key === 'alphaN_cyl1') return { mode: 'alphaN', cylinder: 1 };
  if (key === 'alphaN_cyl2') return { mode: 'alphaN', cylinder: 2 };
  if (key === 'speedDensity_cyl1') return { mode: 'speedDensity', cylinder: 1 };
  return { mode: 'speedDensity', cylinder: 2 };
}

// ─── Fuel Map Card Component ────────────────────────────────────────────────
// ─── Overlay: find nearest cell in a fuel map for given RPM + axis value ─────
interface CellOverlay {
  row: number;       // nearest RPM row index
  col: number;       // nearest TPS/MAP column index
  lambda1: number;   // actual Lambda for Cyl 1
  lambda2: number;   // actual Lambda for Cyl 2
  targetLambda: number; // target Lambda for this column
  deviation1: number;   // lambda1 - targetLambda
  deviation2: number;   // lambda2 - targetLambda
  isActive: boolean;    // true if this map's mode matches the current Alpha-N state
}

function findNearestIdx(axis: number[], value: number): number {
  if (axis.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(axis[0] - value);
  for (let i = 1; i < axis.length; i++) {
    const d = Math.abs(axis[i] - value);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function computeCellOverlay(
  map: FuelMap | null,
  cursor: TalonCursorData | null,
  mapKey: string,
): CellOverlay | null {
  if (!map || !cursor) return null;
  const isAlphaN = mapKey.startsWith('alphaN');
  const isActive = isAlphaN ? cursor.alphaN === 1 : cursor.alphaN !== 1;
  const axisVal = isAlphaN ? cursor.tps : cursor.mapKpa;
  const row = findNearestIdx(map.rowAxis, cursor.rpm);
  const col = findNearestIdx(map.colAxis, axisVal);
  const tgt = col < map.targetLambda.length ? map.targetLambda[col] : 0.85;
  return {
    row, col,
    lambda1: cursor.lambda1,
    lambda2: cursor.lambda2,
    targetLambda: tgt,
    deviation1: cursor.lambda1 - tgt,
    deviation2: cursor.lambda2 - tgt,
    isActive,
  };
}

function getDeviationColor(deviation: number): string {
  const abs = Math.abs(deviation);
  if (abs <= 0.02) return 'oklch(0.65 0.20 145)'; // green — on target
  if (abs <= 0.05) return 'oklch(0.80 0.18 90)';  // yellow — slight deviation
  return 'oklch(0.55 0.24 25)';                    // red — significant deviation
}

function FuelMapCard({
  config,
  map,
  onLoad,
  onClear,
  onCellEdit,
  onTargetLambdaEdit,
  overlay,
  correctedCells,
}: {
  config: typeof FUEL_MAP_CONFIGS[number];
  map: FuelMap | null;
  onLoad: (map: FuelMap) => void;
  onClear: () => void;
  onCellEdit: (row: number, col: number, value: number) => void;
  onTargetLambdaEdit: (col: number, value: number) => void;
  overlay?: CellOverlay | null;
  correctedCells?: Set<string> | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLInputElement>(null);
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editingLambda, setEditingLambda] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [pasteZoneFocused, setPasteZoneFocused] = useState(false);
  const [pastedPreview, setPastedPreview] = useState<string | null>(null);
  const [factCheckWarning, setFactCheckWarning] = useState<string | null>(null);

  const extractMutation = trpc.talonOcr.extractFuelTable.useMutation();

  const handleFile = useCallback((file: File) => {
    file.text().then(text => {
      const parsed = parseFuelTableCSV(text);
      if (parsed) {
        parsed.name = config.label;
        parsed.description = config.desc;
        parsed.rowLabel = config.rowLabel;
        parsed.colLabel = config.colLabel;
        onLoad(parsed);
      }
    });
  }, [config, onLoad]);

  const processImageForOCR = useCallback(async (blob: Blob, mimeType: string) => {
    setOcrLoading(true);
    setOcrError(null);
    setFactCheckWarning(null);
    setPastedPreview(null);
    try {
      // Show preview
      const previewUrl = URL.createObjectURL(blob);
      setPastedPreview(previewUrl);

      // Convert to base64
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const result = await extractMutation.mutateAsync({
        imageBase64: base64,
        mimeType: mimeType || 'image/png',
        tableName: config.label,
      });

      if (result.success) {
        // === FACT-CHECK: Verify screenshot matches this card ===
        const detected = detectTableType(result.tableName || '');
        const expected = getExpectedTableType(config.key);
        let warning: string | null = null;

        if (detected.mode && detected.mode !== expected.mode) {
          warning = `Screenshot appears to be ${detected.mode === 'alphaN' ? 'Alpha-N' : 'Speed Density'} but this card is ${expected.mode === 'alphaN' ? 'Alpha-N' : 'Speed Density'}. Loaded anyway \u2014 verify this is correct.`;
        }
        if (detected.cylinder && detected.cylinder !== expected.cylinder) {
          const cylWarn = `Screenshot appears to be Cylinder ${detected.cylinder} but this card is Cylinder ${expected.cylinder}.`;
          warning = warning ? `${warning} ${cylWarn}` : `${cylWarn} Loaded anyway \u2014 verify this is correct.`;
        }
        setFactCheckWarning(warning);

        const fuelMap: FuelMap = {
          name: result.tableName || config.label,
          description: config.desc,
          rowAxis: result.rowAxis,
          colAxis: result.colAxis,
          data: result.data,
          targetLambda: result.colAxis.map(() => 0.85),
          rowLabel: result.rowAxisLabel?.includes('RPM') ? 'RPM' : config.rowLabel,
          colLabel: result.colAxisLabel || config.colLabel,
          unit: result.unit || 'ms',
        };
        onLoad(fuelMap);
        setPastedPreview(null);
      }
    } catch (err: any) {
      setOcrError(err?.message || 'Failed to extract fuel table from screenshot');
    } finally {
      setOcrLoading(false);
    }
  }, [config, onLoad, extractMutation]);

  const handleScreenshotUpload = useCallback(async (file: File) => {
    await processImageForOCR(file, file.type || 'image/png');
  }, [processImageForOCR]);

  // Clipboard paste handler — Ctrl+V from snipping tool
  const handleClipboardPaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          await processImageForOCR(blob, item.type);
        }
        return;
      }
    }
  }, [processImageForOCR]);

  const handlePaste = useCallback(() => {
    const parsed = parseFuelTableCSV(pasteText);
    if (parsed) {
      parsed.name = config.label;
      parsed.description = config.desc;
      parsed.rowLabel = config.rowLabel;
      parsed.colLabel = config.colLabel;
      onLoad(parsed);
      setShowPaste(false);
      setPasteText('');
    }
  }, [pasteText, config, onLoad]);

  const startEdit = (row: number, col: number) => {
    if (!map) return;
    setEditingCell({ row, col });
    setEditingLambda(null);
    setEditValue(map.data[row][col].toFixed(3));
  };

  const startLambdaEdit = (col: number) => {
    if (!map) return;
    setEditingLambda(col);
    setEditingCell(null);
    setEditValue(map.targetLambda[col].toFixed(3));
  };

  const commitEdit = () => {
    if (editingCell && map) {
      const val = parseFloat(editValue);
      if (!isNaN(val)) {
        onCellEdit(editingCell.row, editingCell.col, val);
      }
      setEditingCell(null);
    }
    if (editingLambda !== null && map) {
      const val = parseFloat(editValue);
      if (!isNaN(val)) {
        onTargetLambdaEdit(editingLambda, val);
      }
      setEditingLambda(null);
    }
  };

  // Find min/max for heat map
  const { min, max } = useMemo(() => {
    if (!map) return { min: 0, max: 100 };
    let mn = Infinity, mx = -Infinity;
    for (const row of map.data) {
      for (const v of row) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    return { min: mn, max: mx };
  }, [map]);

  return (
    <div style={{
      background: sColor.card,
      border: `1px solid ${sColor.border}`,
      borderLeft: `3px solid ${map ? sColor.green : sColor.red}`,
      borderRadius: '3px',
      padding: '16px',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 style={{ fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em', color: 'white' }}>
            {config.label.toUpperCase()}
          </h4>
          <p style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim }}>{config.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          {map ? (
            <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.green, background: 'oklch(0.15 0.04 145)', padding: '2px 8px', borderRadius: '2px' }}>
              <CheckCircle style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />LOADED
            </span>
          ) : (
            <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, background: 'oklch(0.15 0.006 260)', padding: '2px 8px', borderRadius: '2px' }}>
              EMPTY
            </span>
          )}
        </div>
      </div>

      {/* Upload controls */}
      {!map && (
        <div className="flex flex-col gap-3">
          {/* ═══ PRIMARY: Clipboard Paste Zone ═══ */}
          <div
            ref={pasteZoneRef}
            tabIndex={0}
            onPaste={handleClipboardPaste}
            onFocus={() => setPasteZoneFocused(true)}
            onBlur={() => setPasteZoneFocused(false)}
            onClick={() => pasteZoneRef.current?.focus()}
            style={{
              background: pasteZoneFocused ? 'oklch(0.14 0.06 200)' : 'oklch(0.11 0.02 200)',
              border: `2px dashed ${pasteZoneFocused ? sColor.cyan : 'oklch(0.30 0.04 200)'}`,
              borderRadius: '4px',
              padding: '24px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {ocrLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 style={{ width: 28, height: 28, color: sColor.cyan, animation: 'spin 1s linear infinite' }} />
                <span style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em', color: sColor.cyan }}>
                  AI IS READING YOUR FUEL TABLE...
                </span>
                <span style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim }}>
                  Extracting values, axes, and table structure — 10-20 seconds
                </span>
                {pastedPreview && (
                  <img src={pastedPreview} alt="Pasted screenshot" style={{
                    maxWidth: '100%', maxHeight: '120px', marginTop: '8px',
                    border: `1px solid ${sColor.cyan}`, borderRadius: '3px', opacity: 0.7,
                  }} />
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: pasteZoneFocused ? 'oklch(0.20 0.08 200)' : 'oklch(0.16 0.04 200)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}>
                  <Camera style={{ width: 24, height: 24, color: pasteZoneFocused ? sColor.cyan : 'oklch(0.55 0.08 200)' }} />
                </div>
                <span style={{
                  fontFamily: sFont.heading, fontSize: '1.1rem', letterSpacing: '0.06em',
                  color: pasteZoneFocused ? sColor.cyan : 'white',
                }}>
                  {pasteZoneFocused ? 'READY — PRESS CTRL+V TO PASTE' : 'CLICK HERE, THEN CTRL+V TO PASTE SCREENSHOT'}
                </span>
                <span style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim }}>
                  Use Snipping Tool (Win+Shift+S) to capture your C3 fuel table, then paste here
                </span>
                <div style={{
                  display: 'flex', gap: '6px', marginTop: '4px',
                  fontFamily: sFont.mono, fontSize: '0.7rem', color: 'oklch(0.50 0.04 200)',
                }}>
                  <span style={{
                    background: 'oklch(0.18 0.03 200)', padding: '2px 8px',
                    borderRadius: '2px', border: '1px solid oklch(0.25 0.04 200)',
                  }}>Win+Shift+S</span>
                  <span style={{ lineHeight: '1.8' }}>→</span>
                  <span style={{
                    background: 'oklch(0.18 0.03 200)', padding: '2px 8px',
                    borderRadius: '2px', border: '1px solid oklch(0.25 0.04 200)',
                  }}>Click here</span>
                  <span style={{ lineHeight: '1.8' }}>→</span>
                  <span style={{
                    background: 'oklch(0.18 0.03 200)', padding: '2px 8px',
                    borderRadius: '2px', border: '1px solid oklch(0.25 0.04 200)',
                  }}>Ctrl+V</span>
                </div>
              </div>
            )}
          </div>

          {/* OCR Error */}
          {ocrError && (
            <div style={{
              background: 'oklch(0.15 0.06 25)',
              border: `1px solid ${sColor.red}`,
              borderRadius: '2px',
              padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <AlertCircle style={{ width: 16, height: 16, color: sColor.red }} />
              <span style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.redBright }}>
                {ocrError}
              </span>
            </div>
          )}

          {/* ═══ SECONDARY: Other upload methods ═══ */}
          <div style={{
            borderTop: `1px solid ${sColor.border}`,
            paddingTop: '10px',
          }}>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '8px' }}>
              OTHER IMPORT OPTIONS:
            </span>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  background: 'oklch(0.16 0.006 260)', color: sColor.textMid,
                  fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
                  padding: '5px 14px', border: `1px solid ${sColor.border}`,
                  borderRadius: '2px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}
              >
                <Upload style={{ width: 12, height: 12 }} />UPLOAD CSV
              </button>
              <button
                onClick={() => setShowPaste(!showPaste)}
                style={{
                  background: 'oklch(0.16 0.006 260)', color: sColor.textMid,
                  fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
                  padding: '5px 14px', border: `1px solid ${sColor.border}`,
                  borderRadius: '2px', cursor: 'pointer',
                }}
              >
                PASTE CSV TEXT
              </button>
              <input
                ref={screenshotRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshotUpload(f); }}
                className="hidden"
              />
              <button
                onClick={() => screenshotRef.current?.click()}
                disabled={ocrLoading}
                style={{
                  background: 'oklch(0.16 0.006 260)', color: sColor.textMid,
                  fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
                  padding: '5px 14px', border: `1px solid ${sColor.border}`,
                  borderRadius: '2px', cursor: ocrLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '5px',
                }}
              >
                <ImageIcon style={{ width: 12, height: 12 }} />UPLOAD IMAGE FILE
              </button>
            </div>
          </div>

          {showPaste && (
            <div className="flex flex-col gap-2">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste fuel table from C3 Tuning Software (CSV or tab-separated)..."
                style={{
                  background: 'oklch(0.10 0.004 260)', color: 'white',
                  fontFamily: sFont.mono, fontSize: '0.75rem',
                  border: `1px solid ${sColor.border}`, borderRadius: '2px',
                  padding: '8px', minHeight: '100px', resize: 'vertical',
                }}
              />
              <button
                onClick={handlePaste}
                disabled={!pasteText.trim()}
                style={{
                  background: pasteText.trim() ? sColor.green : 'oklch(0.25 0.010 260)',
                  color: 'white', fontFamily: sFont.heading, fontSize: '0.85rem',
                  letterSpacing: '0.08em', padding: '6px 16px', border: 'none',
                  borderRadius: '2px', cursor: pasteText.trim() ? 'pointer' : 'not-allowed',
                  alignSelf: 'flex-start',
                }}
              >
                LOAD TABLE
              </button>
            </div>
          )}
        </div>
      )}

      {/* Heat map grid with Target Lambda row */}
      {map && (
        <div tabIndex={0} onPaste={handleClipboardPaste} style={{ outline: 'none' }}>
          <div className="flex items-center justify-between mb-2">
            <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
              {map.rowAxis.length}×{map.colAxis.length} | Min: {min.toFixed(2)} | Max: {max.toFixed(2)} | Avg: {(map.data.flat().reduce((a, b) => a + b, 0) / map.data.flat().length).toFixed(2)}
            </div>
            <div className="flex items-center gap-3">
              {/* Re-upload screenshot button when map is loaded */}
              <button
                onClick={() => {
                  const inp = document.createElement('input');
                  inp.type = 'file';
                  inp.accept = 'image/png,image/jpeg,image/jpg,image/webp';
                  inp.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleScreenshotUpload(f);
                  };
                  inp.click();
                }}
                disabled={ocrLoading}
                style={{
                  background: 'transparent', color: sColor.cyan, border: 'none',
                  cursor: ocrLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontFamily: sFont.mono, fontSize: '0.7rem',
                }}
              >
                <Camera style={{ width: 12, height: 12 }} />{ocrLoading ? 'EXTRACTING...' : 'RE-SCAN'}
              </button>
              <button onClick={onClear} style={{
                background: 'transparent', color: sColor.textDim, border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                fontFamily: sFont.mono, fontSize: '0.7rem',
              }}>
                <Trash2 style={{ width: 12, height: 12 }} />CLEAR
              </button>
            </div>
          </div>

          {/* Fact-check warning */}
          {factCheckWarning && (
            <div style={{
              background: 'oklch(0.18 0.10 90)',
              border: `1px solid ${sColor.yellow}`,
              borderRadius: '2px',
              padding: '8px 12px',
              marginBottom: '8px',
              display: 'flex', alignItems: 'flex-start', gap: '8px',
            }}>
              <AlertCircle style={{ width: 16, height: 16, color: sColor.yellow, flexShrink: 0, marginTop: 2 }} />
              <div>
                <span style={{ fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.yellow, letterSpacing: '0.04em' }}>
                  TABLE MISMATCH WARNING
                </span>
                <p style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.yellow, margin: '2px 0 0' }}>
                  {factCheckWarning}
                </p>
              </div>
            </div>
          )}

          {ocrLoading && (
            <div style={{
              background: 'oklch(0.15 0.06 200)',
              border: `1px solid ${sColor.cyan}`,
              borderRadius: '2px',
              padding: '8px 12px',
              marginBottom: '8px',
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Loader2 style={{ width: 14, height: 14, color: sColor.cyan, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.cyan }}>
                Re-scanning screenshot...
              </span>
            </div>
          )}

          <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.7rem' }}>
              <thead>
                {/* Column axis header */}
                <tr>
                  <th style={{
                    padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                    fontSize: '0.75rem', position: 'sticky', top: 0, left: 0,
                    background: sColor.card, zIndex: 3,
                  }}>
                    {map.rowLabel}\{map.colLabel}
                  </th>
                  {map.colAxis.map((v, i) => (
                    <th key={i} style={{
                      padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                      fontSize: '0.72rem', position: 'sticky', top: 0,
                      background: sColor.card, zIndex: 2, textAlign: 'center',
                    }}>
                      {v}
                    </th>
                  ))}
                </tr>

                {/* ═══ TARGET LAMBDA ROW ═══ */}
                <tr style={{ borderBottom: `2px solid ${sColor.cyan}` }}>
                  <td style={{
                    padding: '3px 6px', color: sColor.cyan, fontFamily: sFont.heading,
                    fontSize: '0.72rem', position: 'sticky', left: 0,
                    background: 'oklch(0.14 0.04 200)', zIndex: 2,
                    whiteSpace: 'nowrap', letterSpacing: '0.04em',
                  }}>
                    TARGET λ
                  </td>
                  {map.targetLambda.map((val, ci) => {
                    const isEditing = editingLambda === ci;
                    return (
                      <td
                        key={ci}
                        onDoubleClick={() => startLambdaEdit(ci)}
                        style={{
                          padding: '2px 4px',
                          textAlign: 'center',
                          background: 'oklch(0.14 0.04 200)',
                          color: sColor.cyan,
                          cursor: 'pointer',
                          minWidth: '40px',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          border: isEditing ? `2px solid ${sColor.cyan}` : '1px solid oklch(0.20 0.03 200)',
                        }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingLambda(null); }}
                            style={{
                              width: '40px', background: 'transparent', color: sColor.cyan,
                              border: 'none', textAlign: 'center', fontFamily: sFont.mono,
                              fontSize: '0.68rem', outline: 'none', fontWeight: 600,
                            }}
                          />
                        ) : (
                          val.toFixed(3)
                        )}
                      </td>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {map.data.map((row, ri) => (
                  <tr key={ri}>
                    <td style={{
                      padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                      fontSize: '0.72rem', position: 'sticky', left: 0,
                      background: sColor.card, zIndex: 1,
                    }}>
                      {map.rowAxis[ri]}
                    </td>
                    {row.map((val, ci) => {
                      const isEditing = editingCell?.row === ri && editingCell?.col === ci;
                      return (
                        <td
                          key={ci}
                          onDoubleClick={() => startEdit(ri, ci)}
                          style={{
                            padding: '2px 4px',
                            textAlign: 'center',
                            background: (overlay?.isActive && overlay.row === ri && overlay.col === ci)
                              ? getDeviationColor(config.key.includes('cyl1') ? overlay.deviation1 : overlay.deviation2)
                              : getHeatColor(val, min, max),
                            color: 'white',
                            textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                            cursor: 'pointer',
                            minWidth: '40px',
                            fontSize: '0.68rem',
                            border: (overlay?.isActive && overlay.row === ri && overlay.col === ci)
                              ? '3px solid white'
                              : isEditing ? `2px solid ${sColor.redBright}`
                              : correctedCells?.has(`${ri}:${ci}`) ? '2px solid oklch(0.75 0.18 145)'
                              : '1px solid oklch(0.40 0.006 260)',
                            boxShadow: (overlay?.isActive && overlay.row === ri && overlay.col === ci)
                              ? '0 0 8px rgba(255,255,255,0.5)'
                              : correctedCells?.has(`${ri}:${ci}`) ? '0 0 6px oklch(0.65 0.18 145 / 0.5)'
                              : 'none',
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingCell(null); }}
                              style={{
                                width: '40px', background: 'transparent', color: 'white',
                                border: 'none', textAlign: 'center', fontFamily: sFont.mono,
                                fontSize: '0.68rem', outline: 'none',
                              }}
                            />
                          ) : (
                            val.toFixed(3)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 mt-2" style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
            <div style={{ width: 60, height: 8, background: 'linear-gradient(to right, oklch(0.35 0.12 145), oklch(0.50 0.18 90), oklch(0.35 0.22 25))', borderRadius: 2 }} />
            <span>{min.toFixed(3)}</span>
            <span style={{ flex: 1, textAlign: 'center' }}>
              Dbl-click to edit | <span style={{ color: sColor.cyan }}>TARGET λ</span> = log-based tuning reference
              {overlay?.isActive && (
                <span style={{ marginLeft: 8, color: getDeviationColor(config.key.includes('cyl1') ? overlay.deviation1 : overlay.deviation2), fontWeight: 700 }}>
                  | LIVE: λ={config.key.includes('cyl1') ? overlay.lambda1.toFixed(3) : overlay.lambda2.toFixed(3)}
                  {' '}vs Target={overlay.targetLambda.toFixed(3)}
                  {' '}(Δ={(config.key.includes('cyl1') ? overlay.deviation1 : overlay.deviation2) > 0 ? '+' : ''}{(config.key.includes('cyl1') ? overlay.deviation1 : overlay.deviation2).toFixed(3)})
                </span>
              )}
            </span>
            <span>{max.toFixed(3)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Fuel Map Compare Section ──────────────────────────────────────────────
function getDiffColor(delta: number, maxAbs: number): string {
  if (delta === 0) return 'transparent';
  const norm = maxAbs > 0 ? Math.min(Math.abs(delta) / maxAbs, 1) : 0;
  if (delta > 0) {
    // Increase: green
    const l = 0.20 + norm * 0.25;
    return `oklch(${l} ${norm * 0.18} 145)`;
  } else {
    // Decrease: red
    const l = 0.20 + norm * 0.25;
    return `oklch(${l} ${norm * 0.22} 25)`;
  }
}

function FuelMapCompareSection({
  fuelMaps,
  compareMaps,
  onCompareLoad,
  onCompareClear,
}: {
  fuelMaps: FuelMapState;
  compareMaps: FuelMapState;
  onCompareLoad: (key: keyof FuelMapState, map: FuelMap) => void;
  onCompareClear: (key: keyof FuelMapState) => void;
}) {
  const [selectedMap, setSelectedMap] = useState<keyof FuelMapState>('alphaN_cyl1');
  const [displayMode, setDisplayMode] = useState<'diff' | 'original' | 'compare'>('diff');
  const ocrMutation = trpc.talonOcr.extractFuelTable.useMutation();
  const pasteZoneRef = useRef<HTMLDivElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const stockMap = fuelMaps[selectedMap];
  const modMap = compareMaps[selectedMap];

  // Compute diff data
  const diffData = useMemo(() => {
    if (!stockMap || !modMap) return null;
    const rows = Math.min(stockMap.data.length, modMap.data.length);
    const cols = rows > 0 ? Math.min(stockMap.data[0].length, modMap.data[0].length) : 0;
    const deltas: number[][] = [];
    let maxAbs = 0;
    let totalChanged = 0;
    let maxIncrease = 0;
    let maxDecrease = 0;
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const d = modMap.data[r][c] - stockMap.data[r][c];
        row.push(d);
        if (d !== 0) totalChanged++;
        if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d);
        if (d > maxIncrease) maxIncrease = d;
        if (d < maxDecrease) maxDecrease = d;
      }
      deltas.push(row);
    }
    return { deltas, maxAbs, totalChanged, totalCells: rows * cols, maxIncrease, maxDecrease, rows, cols };
  }, [stockMap, modMap]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;
        setOcrLoading(true);
        try {
          const buffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          const base64 = btoa(binary);
          const result = await ocrMutation.mutateAsync({
            imageBase64: base64,
            mimeType: blob.type,
            tableName: FUEL_MAP_CONFIGS.find(c => c.key === selectedMap)?.label,
          });
          if (result.success && result.data && result.rowAxis && result.colAxis) {
            const map: FuelMap = {
              name: result.tableName || 'Compare Table',
              description: 'Imported via screenshot compare',
              rowAxis: result.rowAxis,
              colAxis: result.colAxis,
              data: result.data,
              targetLambda: result.colAxis.map(() => 0.85),
              rowLabel: result.rowAxisLabel || 'RPM',
              colLabel: result.colAxisLabel || 'Axis',
              unit: result.unit || 'ms',
            };
            onCompareLoad(selectedMap, map);
          }
        } catch (err) {
          console.error('OCR compare failed:', err);
        } finally {
          setOcrLoading(false);
        }
        return;
      }
    }
  }, [ocrMutation, selectedMap, onCompareLoad]);

  const configLabel = FUEL_MAP_CONFIGS.find(c => c.key === selectedMap)?.label || selectedMap;

  return (
    <div>
      {/* Map selector + mode toggle */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {FUEL_MAP_CONFIGS.map(cfg => (
          <button
            key={cfg.key}
            onClick={() => setSelectedMap(cfg.key)}
            style={{
              background: selectedMap === cfg.key ? 'oklch(0.20 0.06 25)' : 'oklch(0.15 0.006 260)',
              color: selectedMap === cfg.key ? sColor.redBright : sColor.textDim,
              border: `1px solid ${selectedMap === cfg.key ? sColor.red : sColor.border}`,
              borderRadius: '2px', padding: '6px 14px', cursor: 'pointer',
              fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
            }}
          >
            {cfg.label.replace('Cylinder', 'CYL')}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['diff', 'original', 'compare'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setDisplayMode(mode)}
              style={{
                background: displayMode === mode ? 'oklch(0.22 0.008 260)' : 'transparent',
                color: displayMode === mode ? 'white' : sColor.textDim,
                border: `1px solid ${displayMode === mode ? sColor.cyan : sColor.border}`,
                borderRadius: '2px', padding: '4px 12px', cursor: 'pointer',
                fontFamily: sFont.mono, fontSize: '0.7rem', textTransform: 'uppercase',
              }}
            >
              {mode === 'diff' ? 'Δ DIFF' : mode === 'original' ? 'STOCK' : 'MODIFIED'}
            </button>
          ))}
        </div>
      </div>

      {/* Two-panel layout: Stock (from fuel maps) vs Modified (paste compare) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Stock panel */}
        <div style={{
          background: sColor.card, border: `1px solid ${sColor.border}`,
          borderRadius: '3px', padding: '12px',
        }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.green, letterSpacing: '0.06em' }}>
              STOCK (FROM FUEL MAPS TAB)
            </span>
          </div>
          {stockMap ? (
            <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMid }}>
              <span style={{ color: sColor.green }}>✓</span> {configLabel} loaded — {stockMap.data.length} rows × {stockMap.colAxis.length} cols
            </div>
          ) : (
            <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, padding: '20px 0', textAlign: 'center' }}>
              Load this map in the FUEL MAPS tab first
            </div>
          )}
        </div>

        {/* Modified panel — paste zone */}
        <div
          ref={pasteZoneRef}
          tabIndex={0}
          onPaste={handlePaste}
          style={{
            background: modMap ? sColor.card : 'oklch(0.12 0.02 25)',
            border: `2px ${modMap ? 'solid' : 'dashed'} ${modMap ? sColor.border : sColor.red}`,
            borderRadius: '3px', padding: '12px', cursor: 'pointer',
            outline: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = sColor.cyan; }}
          onBlur={e => { e.currentTarget.style.borderColor = modMap ? sColor.border : sColor.red; }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.redBright, letterSpacing: '0.06em' }}>
              MODIFIED (PASTE SCREENSHOT)
            </span>
            {modMap && (
              <button
                onClick={() => onCompareClear(selectedMap)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: sColor.textDim, cursor: 'pointer', fontSize: '0.7rem' }}
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>
          {ocrLoading ? (
            <div className="flex items-center gap-2" style={{ padding: '16px 0' }}>
              <Loader2 style={{ width: 16, height: 16, color: sColor.cyan, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.cyan }}>Extracting table from screenshot...</span>
            </div>
          ) : modMap ? (
            <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textMid }}>
              <span style={{ color: sColor.redBright }}>✓</span> Modified table loaded — {modMap.data.length} rows × {modMap.colAxis.length} cols
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <Camera style={{ width: 24, height: 24, color: sColor.red, margin: '0 auto 6px' }} />
              <p style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.redBright, letterSpacing: '0.06em' }}>
                CLICK HERE, THEN CTRL+V
              </p>
              <p style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim }}>
                Paste a screenshot of the modified fuel table from C3 Tuning Software
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Diff summary */}
      {diffData && (
        <div style={{
          background: 'oklch(0.14 0.008 260)', border: `1px solid ${sColor.border}`,
          borderRadius: '3px', padding: '10px 16px', marginBottom: '12px',
          display: 'flex', gap: '24px', flexWrap: 'wrap',
          fontFamily: sFont.mono, fontSize: '0.75rem',
        }}>
          <span style={{ color: sColor.yellow }}>
            CHANGED: {diffData.totalChanged}/{diffData.totalCells} cells ({((diffData.totalChanged / diffData.totalCells) * 100).toFixed(1)}%)
          </span>
          <span style={{ color: sColor.green }}>
            MAX INCREASE: +{diffData.maxIncrease.toFixed(3)}
          </span>
          <span style={{ color: sColor.red }}>
            MAX DECREASE: {diffData.maxDecrease.toFixed(3)}
          </span>
        </div>
      )}

      {/* Diff table */}
      {stockMap && modMap && diffData && (
        <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.68rem' }}>
            <thead>
              <tr>
                <th style={{
                  padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                  fontSize: '0.72rem', position: 'sticky', top: 0, left: 0,
                  background: sColor.card, zIndex: 3,
                }}>
                  {stockMap.rowLabel}\{stockMap.colLabel}
                </th>
                {stockMap.colAxis.slice(0, diffData.cols).map((v, i) => (
                  <th key={i} style={{
                    padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                    fontSize: '0.70rem', position: 'sticky', top: 0,
                    background: sColor.card, zIndex: 2, textAlign: 'center',
                  }}>
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diffData.deltas.map((row, ri) => (
                <tr key={ri}>
                  <td style={{
                    padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                    fontSize: '0.70rem', position: 'sticky', left: 0,
                    background: sColor.card, zIndex: 1,
                  }}>
                    {stockMap.rowAxis[ri]}
                  </td>
                  {row.map((delta, ci) => {
                    const stockVal = stockMap.data[ri][ci];
                    const modVal = modMap.data[ri]?.[ci] ?? stockVal;
                    let cellText = '';
                    let cellBg = 'transparent';
                    let cellColor = 'white';

                    if (displayMode === 'diff') {
                      cellText = delta === 0 ? stockVal.toFixed(3) : `${delta > 0 ? '+' : ''}${delta.toFixed(3)}`;
                      cellBg = getDiffColor(delta, diffData.maxAbs);
                      cellColor = delta === 0 ? sColor.textDim : 'white';
                    } else if (displayMode === 'original') {
                      cellText = stockVal.toFixed(3);
                      cellBg = delta !== 0 ? 'oklch(0.18 0.04 200)' : 'transparent';
                      cellColor = delta !== 0 ? sColor.cyan : sColor.textDim;
                    } else {
                      cellText = modVal.toFixed(3);
                      cellBg = delta !== 0 ? 'oklch(0.18 0.04 200)' : 'transparent';
                      cellColor = delta !== 0 ? sColor.yellow : sColor.textDim;
                    }

                    return (
                      <td
                        key={ci}
                        title={`Stock: ${stockVal.toFixed(3)} | Mod: ${modVal.toFixed(3)} | Δ: ${delta > 0 ? '+' : ''}${delta.toFixed(3)}`}
                        style={{
                          padding: '2px 4px',
                          textAlign: 'center',
                          background: cellBg,
                          color: cellColor,
                          minWidth: '42px',
                          fontSize: '0.66rem',
                          border: `1px solid oklch(0.25 0.006 260)`,
                          fontWeight: delta !== 0 ? 600 : 400,
                        }}
                      >
                        {cellText}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No data message */}
      {(!stockMap || !modMap) && !ocrLoading && (
        <div style={{
          background: sColor.card, border: `1px solid ${sColor.border}`,
          borderRadius: '3px', padding: '32px', textAlign: 'center',
        }}>
          <GitCompare style={{ width: 32, height: 32, color: sColor.textDim, margin: '0 auto 8px' }} />
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: 'white', letterSpacing: '0.06em', marginBottom: '6px' }}>
            FUEL TABLE DIFF / COMPARE
          </h3>
          <p style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim, maxWidth: '500px', margin: '0 auto' }}>
            {!stockMap
              ? `Load the ${configLabel} in the FUEL MAPS tab first (stock values), then paste a modified screenshot here.`
              : `Paste a screenshot of the modified ${configLabel} from C3 Tuning Software above to see the diff.`
            }
          </p>
          <div className="flex items-center justify-center gap-3 mt-4" style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim }}>
            <span style={{ color: sColor.green }}>STOCK (Fuel Maps tab)</span>
            <ArrowRight style={{ width: 14, height: 14 }} />
            <span style={{ color: sColor.redBright }}>MODIFIED (Paste here)</span>
            <ArrowRight style={{ width: 14, height: 14 }} />
            <span style={{ color: sColor.yellow }}>COLOR-CODED DIFF</span>
          </div>
        </div>
      )}

      {/* Legend */}
      {diffData && (
        <div className="flex items-center gap-4 mt-3" style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
          <div className="flex items-center gap-1">
            <div style={{ width: 12, height: 12, background: 'oklch(0.35 0.18 145)', borderRadius: 1 }} />
            <span>Increase</span>
          </div>
          <div className="flex items-center gap-1">
            <div style={{ width: 12, height: 12, background: 'oklch(0.35 0.22 25)', borderRadius: 1 }} />
            <span>Decrease</span>
          </div>
          <div className="flex items-center gap-1">
            <div style={{ width: 12, height: 12, background: 'transparent', border: '1px solid oklch(0.25 0.006 260)', borderRadius: 1 }} />
            <span>No change</span>
          </div>
          <span style={{ marginLeft: 'auto' }}>Hover cells for Stock → Mod → Δ tooltip</span>
        </div>
      )}
    </div>
  );
}

// ─── WP8 Datalog Viewer — now uses the HPTuners/Dynojet hybrid TalonLogViewer ─
function WP8DatalogViewer({ wp8Data, onCursorData }: { wp8Data: WP8ParseResult; onCursorData?: (data: TalonCursorData | null) => void }) {
  return <TalonLogViewer wp8Data={wp8Data} onCursorData={onCursorData} />;
}

// ─── Main Honda Talon Tuner Component ───────────────────────────────────────
export default function HondaTalonTuner({
  wp8Data,
  onBack,
}: {
  wp8Data?: WP8ParseResult | null;
  onBack?: () => void;
}) {
  const [localWP8, setLocalWP8] = useState<WP8ParseResult | null>(wp8Data || null);
  const [fuelMaps, setFuelMaps] = useState<FuelMapState>({
    alphaN_cyl1: null,
    alphaN_cyl2: null,
    speedDensity_cyl1: null,
    speedDensity_cyl2: null,
  });
  const [activeSection, setActiveSection] = useState<'datalog' | 'fuelmaps' | 'compare' | 'correct'>('fuelmaps');
  const [cursorData, setCursorData] = useState<TalonCursorData | null>(null);

  // Track which cells were corrected (for highlighting in fuel map editor)
  const [correctedCells, setCorrectedCells] = useState<CorrectedCellsMap>({});

  // Compare state: stock vs modified for each map slot
  const [compareMaps, setCompareMaps] = useState<FuelMapState>({
    alphaN_cyl1: null, alphaN_cyl2: null,
    speedDensity_cyl1: null, speedDensity_cyl2: null,
  });
  const handleCompareMapLoad = useCallback((key: keyof FuelMapState, map: FuelMap) => {
    setCompareMaps(prev => ({ ...prev, [key]: map }));
  }, []);
  const handleCompareMapClear = useCallback((key: keyof FuelMapState) => {
    setCompareMaps(prev => ({ ...prev, [key]: null }));
  }, []);
  const wp8FileRef = useRef<HTMLInputElement>(null);

  // Update if parent passes new data
  useEffect(() => {
    if (wp8Data) setLocalWP8(wp8Data);
  }, [wp8Data]);

  const handleWP8Upload = useCallback(async (file: File) => {
    const { parseWP8 } = await import('@/lib/wp8Parser');
    const buffer = await file.arrayBuffer();
    const result = parseWP8(buffer);
    setLocalWP8(result);
    setActiveSection('datalog');
  }, []);

  const handleFuelMapLoad = useCallback((key: keyof FuelMapState, map: FuelMap) => {
    setFuelMaps(prev => ({ ...prev, [key]: map }));
  }, []);

  const handleFuelMapClear = useCallback((key: keyof FuelMapState) => {
    setFuelMaps(prev => ({ ...prev, [key]: null }));
  }, []);

  const handleCellEdit = useCallback((key: keyof FuelMapState, row: number, col: number, value: number) => {
    setFuelMaps(prev => {
      const map = prev[key];
      if (!map) return prev;
      const newData = map.data.map(r => [...r]);
      newData[row][col] = value;
      return { ...prev, [key]: { ...map, data: newData } };
    });
  }, []);

  // Shared Target Lambda: Cyl 1 & 2 share within same mode (Alpha-N or Speed Density)
  // Editing Alpha-N Cyl 1 Target Lambda also updates Alpha-N Cyl 2, and vice versa.
  // Speed Density Cyl 1 & 2 share separately.
  const handleTargetLambdaEdit = useCallback((key: keyof FuelMapState, col: number, value: number) => {
    setFuelMaps(prev => {
      const next = { ...prev };

      // Determine the sibling key (same mode, other cylinder)
      let siblingKey: keyof FuelMapState | null = null;
      if (key === 'alphaN_cyl1') siblingKey = 'alphaN_cyl2';
      else if (key === 'alphaN_cyl2') siblingKey = 'alphaN_cyl1';
      else if (key === 'speedDensity_cyl1') siblingKey = 'speedDensity_cyl2';
      else if (key === 'speedDensity_cyl2') siblingKey = 'speedDensity_cyl1';

      // Update the primary map
      const map = next[key];
      if (map) {
        const newLambda = [...map.targetLambda];
        newLambda[col] = value;
        next[key] = { ...map, targetLambda: newLambda };
      }

      // Sync to sibling (same mode, other cylinder)
      if (siblingKey) {
        const sibling = next[siblingKey];
        if (sibling && col < sibling.targetLambda.length) {
          const sibLambda = [...sibling.targetLambda];
          sibLambda[col] = value;
          next[siblingKey] = { ...sibling, targetLambda: sibLambda };
        }
      }

      return next;
    });
  }, []);

  // ─── Fuel Correction Handlers ────────────────────────────────────────────
  const handleApplyCorrections = useCallback((
    correctedMaps: Partial<FuelMapState>,
    correctionResults?: MapCorrectionResult[],
  ) => {
    setFuelMaps(prev => {
      const next = { ...prev };
      for (const [key, map] of Object.entries(correctedMaps)) {
        if (map) (next as any)[key] = map;
      }
      return next;
    });

    // Build corrected cells map for highlighting
    if (correctionResults) {
      const cellsMap: CorrectedCellsMap = {};
      for (const result of correctionResults) {
        const cellSet = new Set<string>();
        for (const corr of result.corrections) {
          cellSet.add(`${corr.row}:${corr.col}`);
        }
        cellsMap[result.mapKey] = cellSet;
      }
      setCorrectedCells(cellsMap);
    } else {
      // Revert: clear all highlights
      setCorrectedCells({});
    }
  }, []);

  const handleUpdateTargetLambda = useCallback((mapKey: keyof FuelMapState, targets: number[]) => {
    setFuelMaps(prev => {
      const next = { ...prev };
      const map = next[mapKey];
      if (map) {
        next[mapKey] = { ...map, targetLambda: targets };
      }
      // Sync to sibling (same mode, other cylinder)
      let siblingKey: keyof FuelMapState | null = null;
      if (mapKey === 'alphaN_cyl1') siblingKey = 'alphaN_cyl2';
      else if (mapKey === 'alphaN_cyl2') siblingKey = 'alphaN_cyl1';
      else if (mapKey === 'speedDensity_cyl1') siblingKey = 'speedDensity_cyl2';
      else if (mapKey === 'speedDensity_cyl2') siblingKey = 'speedDensity_cyl1';
      if (siblingKey) {
        const sibling = next[siblingKey];
        if (sibling) {
          next[siblingKey] = { ...sibling, targetLambda: [...targets] };
        }
      }
      return next;
    });
  }, []);

  const loadedCount = Object.values(fuelMaps).filter(Boolean).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontFamily: sFont.heading, fontSize: '1.8rem', letterSpacing: '0.08em', color: 'white' }}>
            <span style={{ color: sColor.red }}>HONDA TALON</span> TUNER
          </h2>
          <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim }}>
            Fuel map editor + WP8 datalog analysis for Honda Talon 1000R/X
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Status badges */}
          <div className="flex items-center gap-2">
            <span style={{
              fontFamily: sFont.mono, fontSize: '0.7rem',
              color: localWP8 ? sColor.green : sColor.textDim,
              background: localWP8 ? 'oklch(0.15 0.04 145)' : 'oklch(0.15 0.006 260)',
              padding: '3px 10px', borderRadius: '2px',
            }}>
              DATALOG: {localWP8 ? 'LOADED' : 'EMPTY'}
            </span>
            <span style={{
              fontFamily: sFont.mono, fontSize: '0.7rem',
              color: loadedCount > 0 ? sColor.yellow : sColor.textDim,
              background: loadedCount > 0 ? 'oklch(0.18 0.06 90)' : 'oklch(0.15 0.006 260)',
              padding: '3px 10px', borderRadius: '2px',
            }}>
              MAPS: {loadedCount}/4
            </span>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveSection('fuelmaps')}
          style={{
            background: activeSection === 'fuelmaps' ? 'oklch(0.18 0.008 260)' : 'transparent',
            color: activeSection === 'fuelmaps' ? 'white' : sColor.textDim,
            border: `1px solid ${activeSection === 'fuelmaps' ? sColor.red : sColor.border}`,
            borderRadius: '2px', padding: '8px 20px', cursor: 'pointer',
            fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Fuel style={{ width: 16, height: 16 }} />FUEL MAPS
        </button>
        <button
          onClick={() => setActiveSection('datalog')}
          style={{
            background: activeSection === 'datalog' ? 'oklch(0.18 0.008 260)' : 'transparent',
            color: activeSection === 'datalog' ? 'white' : sColor.textDim,
            border: `1px solid ${activeSection === 'datalog' ? sColor.red : sColor.border}`,
            borderRadius: '2px', padding: '8px 20px', cursor: 'pointer',
            fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Activity style={{ width: 16, height: 16 }} />DATALOG {localWP8 && `(${localWP8.totalRows})`}
        </button>
        <button
          onClick={() => setActiveSection('compare')}
          style={{
            background: activeSection === 'compare' ? 'oklch(0.18 0.008 260)' : 'transparent',
            color: activeSection === 'compare' ? 'white' : sColor.textDim,
            border: `1px solid ${activeSection === 'compare' ? sColor.red : sColor.border}`,
            borderRadius: '2px', padding: '8px 20px', cursor: 'pointer',
            fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <GitCompare style={{ width: 16, height: 16 }} />COMPARE
        </button>
        <button
          onClick={() => setActiveSection('correct')}
          style={{
            background: activeSection === 'correct' ? 'oklch(0.18 0.008 260)' : 'transparent',
            color: activeSection === 'correct' ? 'white' : sColor.textDim,
            border: `1px solid ${activeSection === 'correct' ? sColor.red : sColor.border}`,
            borderRadius: '2px', padding: '8px 20px', cursor: 'pointer',
            fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.08em',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Wrench style={{ width: 16, height: 16 }} />CORRECT
        </button>
      </div>

      {/* Fuel Maps Section */}
      {activeSection === 'fuelmaps' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {FUEL_MAP_CONFIGS.map(config => (
            <FuelMapCard
              key={config.key}
              config={config}
              map={fuelMaps[config.key]}
              onLoad={(map) => handleFuelMapLoad(config.key, map)}
              onClear={() => handleFuelMapClear(config.key)}
              onCellEdit={(row, col, val) => handleCellEdit(config.key, row, col, val)}
              onTargetLambdaEdit={(col, val) => handleTargetLambdaEdit(config.key, col, val)}
              overlay={computeCellOverlay(fuelMaps[config.key], cursorData, config.key)}
              correctedCells={correctedCells[config.key] || null}
            />
          ))}
        </div>
      )}

      {/* Compare Section */}
      {activeSection === 'compare' && (
        <FuelMapCompareSection
          fuelMaps={fuelMaps}
          compareMaps={compareMaps}
          onCompareLoad={handleCompareMapLoad}
          onCompareClear={handleCompareMapClear}
        />
      )}

      {/* Correct Section */}
      {activeSection === 'correct' && (
        <FuelCorrectionPanel
          fuelMaps={fuelMaps as unknown as CorrectionFuelMapState}
          wp8Data={localWP8}
          onApplyCorrections={(corrected, results) => handleApplyCorrections(corrected as Partial<FuelMapState>, results)}
          onUpdateTargetLambda={(key, targets) => handleUpdateTargetLambda(key as keyof FuelMapState, targets)}
        />
      )}

      {/* Datalog Section */}
      {activeSection === 'datalog' && (
        <>
          {localWP8 ? (
            <WP8DatalogViewer wp8Data={localWP8} onCursorData={setCursorData} />
          ) : (
            <div style={{
              background: sColor.card,
              border: `2px dashed ${sColor.border}`,
              borderRadius: '3px',
              padding: '48px',
              textAlign: 'center',
            }}>
              <Upload style={{ width: 36, height: 36, color: sColor.textDim, margin: '0 auto 12px' }} />
              <h3 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.06em', color: 'white', marginBottom: '8px' }}>
                UPLOAD WP8 DATALOG
              </h3>
              <p style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, marginBottom: '16px' }}>
                Upload a Dynojet Power Vision .wp8 datalog file from your Honda Talon
              </p>
              <input ref={wp8FileRef} type="file" accept=".wp8,.WP8" onChange={e => { const f = e.target.files?.[0]; if (f) handleWP8Upload(f); }} className="hidden" />
              <button
                onClick={() => wp8FileRef.current?.click()}
                style={{
                  background: sColor.red, color: 'white', fontFamily: sFont.heading,
                  fontSize: '1rem', letterSpacing: '0.1em', padding: '10px 28px',
                  border: 'none', borderRadius: '3px', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                }}
              >
                <Upload style={{ width: 16, height: 16 }} />SELECT WP8 FILE
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
