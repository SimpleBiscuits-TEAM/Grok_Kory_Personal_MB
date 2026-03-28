/**
 * MapTableEditor — Professional calibration table editor
 *
 * Features:
 *  - Crisp, high-DPI heatmap colors (opaque, no transparency blending)
 *  - Clean monospace typography with proper sizing
 *  - Axis labels with units
 *  - Inline cell editing (double-click to edit, Enter to confirm)
 *  - Multi-cell selection (click+drag, Shift+click for range)
 *  - Percentage/absolute increment/decrement (+/- keys)
 *  - Modified cell highlighting (yellow text)
 *  - Keyboard shortcuts: Enter to edit, Delete to reset, Escape to cancel
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CalibrationMap, CompuMethod, rawToPhysical, physicalToRaw } from '@/lib/editorEngine';

interface MapTableEditorProps {
  map: CalibrationMap;
  compuMethod?: CompuMethod;
  onValuesChanged: (mapName: string, newPhysValues: number[]) => void;
  readOnly?: boolean;
}

/**
 * Opaque heatmap color — no alpha blending, so cells look crisp on dark backgrounds.
 * Blue (cold) → Cyan → Green → Yellow → Red (hot)
 */
function valueToColor(value: number, min: number, max: number): string {
  if (min === max) return '#1e3a5f';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

  let r: number, g: number, b: number;
  if (t < 0.25) {
    const s = t / 0.25;
    r = Math.round(18 + s * 0);
    g = Math.round(40 + s * 100);
    b = Math.round(120 + s * 20);
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = Math.round(18 + s * 40);
    g = Math.round(140 + s * 30);
    b = Math.round(140 - s * 80);
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(58 + s * 120);
    g = Math.round(170 - s * 30);
    b = Math.round(60 - s * 30);
  } else {
    const s = (t - 0.75) / 0.25;
    r = Math.round(178 + s * 60);
    g = Math.round(140 - s * 80);
    b = Math.round(30 - s * 10);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/** Text color that contrasts with the heatmap background */
function textColorForBg(value: number, min: number, max: number): string {
  if (min === max) return '#e4e4e7';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Lighter text for darker cells (cold end), darker for bright cells (hot end)
  return t < 0.6 ? '#e4e4e7' : '#1c1c1e';
}

function formatValue(v: number, precision: number = 2): string {
  if (Number.isInteger(v) && Math.abs(v) < 100000) return v.toString();
  if (Math.abs(v) >= 10000) return v.toFixed(1);
  if (Math.abs(v) >= 100) return v.toFixed(precision > 1 ? 1 : precision);
  return v.toFixed(precision);
}

export default function MapTableEditor({ map, compuMethod, onValuesChanged, readOnly = false }: MapTableEditorProps) {
  const [editingCell, setEditingCell] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const values = map.physValues || map.rawValues || [];
  const originalValues = map.rawValues || [];
  const modifiedValues = map.modifiedValues;
  const rows = map.rows || 1;
  const cols = map.cols || values.length;
  const axisX = map.axisXValues || [];
  const axisY = map.axisYValues || [];
  const unit = compuMethod?.unit || '';

  // Compute min/max for color scaling
  const { minVal, maxVal } = useMemo(() => {
    if (values.length === 0) return { minVal: 0, maxVal: 1 };
    let min = Infinity, max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { minVal: min, maxVal: max };
  }, [values]);

  // Focus input when editing
  useEffect(() => {
    if (editingCell !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const startEdit = useCallback((idx: number) => {
    if (readOnly) return;
    setEditingCell(idx);
    setEditValue(formatValue(values[idx]));
  }, [readOnly, values]);

  const commitEdit = useCallback(() => {
    if (editingCell === null) return;
    const newVal = parseFloat(editValue);
    if (!isNaN(newVal)) {
      const newValues = [...values];
      newValues[editingCell] = newVal;
      onValuesChanged(map.name, newValues);
    }
    setEditingCell(null);
  }, [editingCell, editValue, values, map.name, onValuesChanged]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Multi-cell selection
  const handleCellMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail === 2) {
      startEdit(idx);
      return;
    }
    setSelectionStart(idx);
    setIsDragging(true);
    if (e.shiftKey && selectedCells.size > 0) {
      const existing = Array.from(selectedCells);
      const minIdx = Math.min(...existing, idx);
      const maxIdx = Math.max(...existing, idx);
      const newSel = new Set<number>();
      for (let i = minIdx; i <= maxIdx; i++) newSel.add(i);
      setSelectedCells(newSel);
    } else {
      setSelectedCells(new Set([idx]));
    }
  }, [selectedCells, startEdit]);

  const handleCellMouseEnter = useCallback((idx: number) => {
    if (!isDragging || selectionStart === null) return;
    const startRow = Math.floor(selectionStart / cols);
    const startCol = selectionStart % cols;
    const endRow = Math.floor(idx / cols);
    const endCol = idx % cols;
    const r1 = Math.min(startRow, endRow);
    const r2 = Math.max(startRow, endRow);
    const c1 = Math.min(startCol, endCol);
    const c2 = Math.max(startCol, endCol);
    const newSel = new Set<number>();
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        newSel.add(r * cols + c);
      }
    }
    setSelectedCells(newSel);
  }, [isDragging, selectionStart, cols]);

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Keyboard shortcuts for selected cells
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCell !== null) return;
      if (selectedCells.size === 0) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (readOnly) return;
        const newValues = [...values];
        for (const idx of Array.from(selectedCells)) {
          if (idx < originalValues.length) {
            newValues[idx] = rawToPhysical(originalValues[idx], compuMethod);
          }
        }
        onValuesChanged(map.name, newValues);
      }

      if (e.key === '+' || e.key === '=') {
        if (readOnly) return;
        const newValues = [...values];
        const increment = e.shiftKey ? 0.01 : 1;
        for (const idx of Array.from(selectedCells)) {
          if (e.shiftKey) {
            newValues[idx] *= (1 + increment);
          } else {
            newValues[idx] += increment;
          }
        }
        onValuesChanged(map.name, newValues);
      }
      if (e.key === '-' || e.key === '_') {
        if (readOnly) return;
        const newValues = [...values];
        const decrement = e.shiftKey ? 0.01 : 1;
        for (const idx of Array.from(selectedCells)) {
          if (e.shiftKey) {
            newValues[idx] *= (1 - decrement);
          } else {
            newValues[idx] -= decrement;
          }
        }
        onValuesChanged(map.name, newValues);
      }

      if (e.key === 'Enter') {
        const first = Array.from(selectedCells)[0];
        if (first !== undefined) startEdit(first);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, selectedCells, readOnly, values, originalValues, compuMethod, map.name, onValuesChanged, startEdit]);

  // Check if a cell has been modified
  const isCellModified = useCallback((idx: number): boolean => {
    if (!modifiedValues || idx >= modifiedValues.length || idx >= originalValues.length) return false;
    return modifiedValues[idx] !== originalValues[idx];
  }, [modifiedValues, originalValues]);

  // Shared cell classes
  const cellBase = 'text-center cursor-pointer select-none font-mono tabular-nums transition-shadow duration-75';
  const cellSize = 'min-w-[64px] px-2 py-1';

  // Render a single data cell
  const renderCell = (idx: number, v: number) => {
    const isEditing = editingCell === idx;
    const isSelected = selectedCells.has(idx);
    const isModified = isCellModified(idx);
    const bgColor = valueToColor(v, minVal, maxVal);
    const fgColor = isModified ? '#fbbf24' : textColorForBg(v, minVal, maxVal);

    return (
      <td
        key={idx}
        className={`${cellBase} ${cellSize} border border-zinc-900/60 ${isSelected ? 'shadow-[inset_0_0_0_2px_rgba(239,68,68,0.7)]' : ''}`}
        style={{
          backgroundColor: bgColor,
          color: fgColor,
          fontWeight: isModified ? 600 : 400,
          fontSize: '12px',
          lineHeight: '1.4',
        }}
        onMouseDown={e => handleCellMouseDown(idx, e)}
        onMouseEnter={() => handleCellMouseEnter(idx)}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            className="bg-zinc-900 border border-red-500 text-white text-center w-full rounded-sm focus:outline-none text-xs font-mono"
            style={{ fontSize: '12px' }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
            onBlur={commitEdit}
          />
        ) : (
          formatValue(v)
        )}
      </td>
    );
  };

  // ── VALUE type: single value display ──
  if (map.type === 'VALUE') {
    const val = values[0] ?? 0;
    return (
      <div className="p-4">
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Value</span>
          {editingCell === 0 ? (
            <input
              ref={inputRef}
              className="bg-zinc-800 border border-red-500 text-white font-mono text-lg px-3 py-1.5 rounded w-40 focus:outline-none focus:ring-1 focus:ring-red-500"
              style={{ fontSize: '18px' }}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              onBlur={commitEdit}
            />
          ) : (
            <button
              className="bg-zinc-800 border border-zinc-700 text-white font-mono text-lg px-4 py-1.5 rounded hover:border-red-500/50 transition-colors"
              style={{ fontSize: '18px' }}
              onDoubleClick={() => startEdit(0)}
            >
              {formatValue(val)}
            </button>
          )}
          {unit && <span className="text-xs text-zinc-400 font-mono">{unit}</span>}
        </div>
      </div>
    );
  }

  // ── CURVE type: 1D table ──
  if (map.type === 'CURVE' || rows === 1) {
    return (
      <div ref={tableRef} className="overflow-auto p-3">
        <table className="border-collapse font-mono" style={{ fontSize: '12px' }}>
          {axisX.length > 0 && (
            <thead>
              <tr>
                <th
                  className="px-2 py-1.5 text-right border-b-2 border-r-2 border-zinc-700"
                  style={{ fontSize: '11px', color: '#71717a', minWidth: '64px' }}
                >
                  Axis →
                </th>
                {axisX.map((v, i) => (
                  <th
                    key={i}
                    className="px-2 py-1.5 text-center border-b-2 border-zinc-700"
                    style={{ fontSize: '11px', color: '#22d3ee', minWidth: '64px', fontWeight: 600 }}
                  >
                    {formatValue(v)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            <tr>
              <td
                className="px-2 py-1.5 text-right border-r-2 border-zinc-700"
                style={{ fontSize: '11px', color: '#71717a', minWidth: '64px' }}
              >
                {unit || 'Value'}
              </td>
              {values.map((v, i) => renderCell(i, v))}
            </tr>
          </tbody>
        </table>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-500 font-mono">
          <span>Double-click to edit</span>
          <span className="text-zinc-700">·</span>
          <span>+/- increment</span>
          <span className="text-zinc-700">·</span>
          <span>Shift+click range</span>
          {!readOnly && <><span className="text-zinc-700">·</span><span className="text-yellow-400">Yellow = modified</span></>}
        </div>
      </div>
    );
  }

  // ── MAP type: 2D table ──
  return (
    <div ref={tableRef} className="overflow-auto p-3">
      <table className="border-collapse font-mono" style={{ fontSize: '12px' }}>
        <thead>
          <tr>
            <th
              className="px-2 py-1.5 border-b-2 border-r-2 border-zinc-700 sticky left-0 z-10 bg-zinc-950"
              style={{ fontSize: '11px', color: '#71717a', minWidth: '64px' }}
            >
              {axisY.length > 0 ? 'Y↓ / X→' : ''}
            </th>
            {(axisX.length > 0 ? axisX : Array.from({ length: cols }, (_, i) => i)).map((v, i) => (
              <th
                key={i}
                className="px-2 py-1.5 text-center border-b-2 border-zinc-700"
                style={{ fontSize: '11px', color: '#22d3ee', minWidth: '64px', fontWeight: 600 }}
              >
                {formatValue(v as number)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              <td
                className="px-2 py-1.5 text-right border-r-2 border-zinc-700 sticky left-0 z-10 bg-zinc-950"
                style={{ fontSize: '11px', color: '#22d3ee', minWidth: '64px', fontWeight: 600 }}
              >
                {axisY[row] !== undefined ? formatValue(axisY[row]) : row}
              </td>
              {Array.from({ length: cols }).map((_, col) => {
                const idx = row * cols + col;
                const v = values[idx] ?? 0;
                return renderCell(idx, v);
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 text-[11px] text-zinc-500 font-mono">
        <span>Double-click to edit</span>
        <span className="text-zinc-700">·</span>
        <span>+/- increment</span>
        <span className="text-zinc-700">·</span>
        <span>Shift+click range</span>
        {!readOnly && <><span className="text-zinc-700">·</span><span className="text-yellow-400">Yellow = modified</span></>}
      </div>
    </div>
  );
}
