/**
 * Honda Talon Tuner — WP8 Datalog Viewer + Fuel Map Editor
 *
 * Features:
 *   - WP8 datalog table & chart view with all 58 channels
 *   - Four fuel map upload cards (Alpha-N Cyl 1 & 2, Speed Density Cyl 1 & 2)
 *   - Heat-map grid editor for each fuel map
 *   - CSV paste/upload support for fuel tables from C3 Tuning Software
 *
 * Design: Matches PPEI motorsport dark theme
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  Upload, Loader2, Table2, LineChart, Download, Trash2,
  ChevronDown, ChevronRight, AlertCircle, CheckCircle,
  Fuel, Gauge, Thermometer, Activity
} from 'lucide-react';
import { WP8ParseResult, WP8Channel, getHondaTalonKeyChannels, wp8ToCSV } from '@/lib/wp8Parser';

// ─── Style constants (matches PPEI motorsport dark) ─────────────────────────
const sColor = {
  bg: '#0a0a0a',
  card: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  redBright: 'oklch(0.60 0.24 25)',
  text: 'white',
  textDim: 'oklch(0.55 0.010 260)',
  textMid: 'oklch(0.70 0.010 260)',
  green: 'oklch(0.65 0.20 145)',
  yellow: 'oklch(0.80 0.18 90)',
  blue: 'oklch(0.65 0.18 250)',
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
    rowLabel: 'RPM',
    colLabel,
    unit: '%',
  };
}

// ─── Heat Map Color ─────────────────────────────────────────────────────────
function getHeatColor(value: number, min: number, max: number): string {
  if (max === min) return 'oklch(0.45 0.15 145)'; // green
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Green (low) → Yellow (mid) → Red (high)
  if (t < 0.5) {
    const s = t * 2;
    const l = 0.35 + s * 0.15;
    const c = 0.12 + s * 0.06;
    const h = 145 - s * 55; // green → yellow
    return `oklch(${l} ${c} ${h})`;
  } else {
    const s = (t - 0.5) * 2;
    const l = 0.50 - s * 0.15;
    const c = 0.18 + s * 0.04;
    const h = 90 - s * 65; // yellow → red
    return `oklch(${l} ${c} ${h})`;
  }
}

// ─── Fuel Map Card Component ────────────────────────────────────────────────
function FuelMapCard({
  config,
  map,
  onLoad,
  onClear,
  onCellEdit,
}: {
  config: typeof FUEL_MAP_CONFIGS[number];
  map: FuelMap | null;
  onLoad: (map: FuelMap) => void;
  onClear: () => void;
  onCellEdit: (row: number, col: number, value: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');

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
    setEditValue(map.data[row][col].toFixed(2));
  };

  const commitEdit = () => {
    if (!editingCell || !map) return;
    const val = parseFloat(editValue);
    if (!isNaN(val)) {
      onCellEdit(editingCell.row, editingCell.col, val);
    }
    setEditingCell(null);
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
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                background: sColor.red, color: 'white', fontFamily: sFont.heading,
                fontSize: '0.85rem', letterSpacing: '0.08em', padding: '6px 16px',
                border: 'none', borderRadius: '2px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <Upload style={{ width: 14, height: 14 }} />UPLOAD CSV
            </button>
            <button
              onClick={() => setShowPaste(!showPaste)}
              style={{
                background: 'oklch(0.18 0.008 260)', color: sColor.textMid,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.08em',
                padding: '6px 16px', border: `1px solid ${sColor.border}`,
                borderRadius: '2px', cursor: 'pointer',
              }}
            >
              PASTE TABLE
            </button>
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

      {/* Heat map grid */}
      {map && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
              {map.rowAxis.length}×{map.colAxis.length} | Min: {min.toFixed(2)} | Max: {max.toFixed(2)} | Avg: {(map.data.flat().reduce((a, b) => a + b, 0) / map.data.flat().length).toFixed(2)}
            </div>
            <button onClick={onClear} style={{
              background: 'transparent', color: sColor.textDim, border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              fontFamily: sFont.mono, fontSize: '0.7rem',
            }}>
              <Trash2 style={{ width: 12, height: 12 }} />CLEAR
            </button>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.7rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.75rem', position: 'sticky', top: 0, left: 0, background: sColor.card, zIndex: 2 }}>
                    {map.rowLabel}\{map.colLabel}
                  </th>
                  {map.colAxis.map((v, i) => (
                    <th key={i} style={{ padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.72rem', position: 'sticky', top: 0, background: sColor.card, zIndex: 1, textAlign: 'center' }}>
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {map.data.map((row, ri) => (
                  <tr key={ri}>
                    <td style={{ padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.72rem', position: 'sticky', left: 0, background: sColor.card, zIndex: 1 }}>
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
                            background: getHeatColor(val, min, max),
                            color: 'white',
                            cursor: 'pointer',
                            minWidth: '40px',
                            fontSize: '0.68rem',
                            border: isEditing ? `2px solid ${sColor.redBright}` : '1px solid oklch(0.20 0.006 260)',
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
                            val.toFixed(1)
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
            <span>{min.toFixed(1)}</span>
            <span style={{ flex: 1, textAlign: 'center' }}>Dbl-click to edit</span>
            <span>{max.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WP8 Datalog Viewer ─────────────────────────────────────────────────────
function WP8DatalogViewer({ wp8Data }: { wp8Data: WP8ParseResult }) {
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);
  const [visibleRows, setVisibleRows] = useState(200);
  const keyChannels = useMemo(() => getHondaTalonKeyChannels(wp8Data), [wp8Data]);

  // Default selected channels
  useEffect(() => {
    const defaults = [
      keyChannels.engineSpeed,
      keyChannels.throttlePosition,
      keyChannels.afr1,
      keyChannels.afr2,
      keyChannels.map,
    ].filter(i => i >= 0);
    setSelectedChannels(defaults);
  }, [keyChannels]);

  const toggleChannel = (idx: number) => {
    setSelectedChannels(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  const handleExportCSV = useCallback(() => {
    const csv = wp8ToCSV(wp8Data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `honda_talon_datalog_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [wp8Data]);

  return (
    <div style={{
      background: sColor.card,
      border: `1px solid ${sColor.border}`,
      borderTop: `3px solid ${sColor.red}`,
      borderRadius: '3px',
      padding: '16px',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', letterSpacing: '0.08em', color: 'white' }}>
            WP8 DATALOG — HONDA TALON
          </h3>
          <p style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.textDim }}>
            Part: {wp8Data.partNumber} | {wp8Data.channels.length} channels | {wp8Data.totalRows} samples | {(wp8Data.rawSize / 1024).toFixed(1)} KB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('table')}
            style={{
              background: viewMode === 'table' ? 'oklch(0.18 0.008 260)' : 'transparent',
              color: viewMode === 'table' ? 'white' : sColor.textDim,
              border: `1px solid ${viewMode === 'table' ? sColor.red : sColor.border}`,
              borderRadius: '2px', padding: '4px 10px', cursor: 'pointer',
              fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <Table2 style={{ width: 14, height: 14 }} />TABLE
          </button>
          <button
            onClick={() => setViewMode('chart')}
            style={{
              background: viewMode === 'chart' ? 'oklch(0.18 0.008 260)' : 'transparent',
              color: viewMode === 'chart' ? 'white' : sColor.textDim,
              border: `1px solid ${viewMode === 'chart' ? sColor.red : sColor.border}`,
              borderRadius: '2px', padding: '4px 10px', cursor: 'pointer',
              fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <LineChart style={{ width: 14, height: 14 }} />CHART
          </button>
          <button
            onClick={handleExportCSV}
            style={{
              background: 'oklch(0.18 0.008 260)', color: sColor.textMid,
              border: `1px solid ${sColor.border}`, borderRadius: '2px',
              padding: '4px 10px', cursor: 'pointer',
              fontFamily: sFont.heading, fontSize: '0.8rem', letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <Download style={{ width: 14, height: 14 }} />EXPORT CSV
          </button>
        </div>
      </div>

      {/* Channel selector */}
      <div className="mb-3" style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {wp8Data.channels.map(ch => (
          <button
            key={ch.index}
            onClick={() => toggleChannel(ch.index)}
            style={{
              background: selectedChannels.includes(ch.index) ? 'oklch(0.20 0.04 25)' : 'oklch(0.12 0.004 260)',
              color: selectedChannels.includes(ch.index) ? sColor.redBright : sColor.textDim,
              border: `1px solid ${selectedChannels.includes(ch.index) ? sColor.red : 'oklch(0.20 0.006 260)'}`,
              borderRadius: '2px', padding: '2px 8px', cursor: 'pointer',
              fontFamily: sFont.mono, fontSize: '0.65rem',
            }}
          >
            {ch.name}
          </button>
        ))}
      </div>

      {/* Table view */}
      {viewMode === 'table' && (
        <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.7rem', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.75rem', position: 'sticky', top: 0, background: sColor.card, zIndex: 1, textAlign: 'left' }}>
                  #
                </th>
                {selectedChannels.map(idx => (
                  <th key={idx} style={{ padding: '4px 8px', color: sColor.red, fontFamily: sFont.heading, fontSize: '0.72rem', position: 'sticky', top: 0, background: sColor.card, zIndex: 1, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {wp8Data.channels[idx]?.name || `CH${idx}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wp8Data.rows.slice(0, visibleRows).map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid oklch(0.16 0.006 260)' }}>
                  <td style={{ padding: '3px 8px', color: sColor.textDim }}>{ri}</td>
                  {selectedChannels.map(idx => (
                    <td key={idx} style={{ padding: '3px 8px', color: 'white', textAlign: 'right' }}>
                      {idx < row.values.length ? row.values[idx].toFixed(2) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows < wp8Data.totalRows && (
            <button
              onClick={() => setVisibleRows(v => Math.min(v + 500, wp8Data.totalRows))}
              style={{
                width: '100%', padding: '8px', background: 'oklch(0.15 0.006 260)',
                color: sColor.textMid, border: `1px solid ${sColor.border}`,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.06em',
                cursor: 'pointer', marginTop: '4px',
              }}
            >
              LOAD MORE ({visibleRows}/{wp8Data.totalRows})
            </button>
          )}
        </div>
      )}

      {/* Chart view */}
      {viewMode === 'chart' && (
        <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: sColor.textDim, fontFamily: sFont.body }}>
          <div className="text-center">
            <LineChart style={{ width: 48, height: 48, margin: '0 auto 12px', opacity: 0.4 }} />
            <p>Chart view — select channels above to visualize</p>
            <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              {selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''} selected | {wp8Data.totalRows} data points
            </p>
            <p style={{ fontSize: '0.75rem', marginTop: '8px', color: sColor.red }}>
              Export to CSV and use the main Analyzer for full chart support
            </p>
          </div>
        </div>
      )}
    </div>
  );
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
  const [activeSection, setActiveSection] = useState<'datalog' | 'fuelmaps'>('fuelmaps');
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
            />
          ))}
        </div>
      )}

      {/* Datalog Section */}
      {activeSection === 'datalog' && (
        <>
          {localWP8 ? (
            <WP8DatalogViewer wp8Data={localWP8} />
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
