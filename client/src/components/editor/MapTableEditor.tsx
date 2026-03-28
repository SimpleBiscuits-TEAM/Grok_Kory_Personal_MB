/**
 * MapTableEditor — Professional 2D/3D calibration table editor
 *
 * Features:
 *  - Color-coded cells (blue→green→yellow→red heat map)
 *  - Axis labels with units
 *  - Inline cell editing (click to edit, Enter to confirm)
 *  - Multi-cell selection (click+drag)
 *  - Percentage/absolute increment/decrement
 *  - Modified cell highlighting
 *  - Copy/paste support
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CalibrationMap, CompuMethod, rawToPhysical, physicalToRaw } from '@/lib/editorEngine';

interface MapTableEditorProps {
  map: CalibrationMap;
  compuMethod?: CompuMethod;
  onValuesChanged: (mapName: string, newPhysValues: number[]) => void;
  readOnly?: boolean;
}

// Color interpolation for heat map
function valueToColor(value: number, min: number, max: number): string {
  if (min === max) return 'rgba(59, 130, 246, 0.3)';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

  // Blue (cold) → Cyan → Green → Yellow → Red (hot)
  if (t < 0.25) {
    const s = t / 0.25;
    return `rgba(${Math.round(30 + s * 0)}, ${Math.round(60 + s * 140)}, ${Math.round(200 - s * 0)}, 0.35)`;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return `rgba(${Math.round(30 + s * 70)}, ${Math.round(200 - s * 10)}, ${Math.round(200 - s * 140)}, 0.35)`;
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return `rgba(${Math.round(100 + s * 155)}, ${Math.round(190 - s * 50)}, ${Math.round(60 - s * 30)}, 0.35)`;
  } else {
    const s = (t - 0.75) / 0.25;
    return `rgba(${Math.round(255)}, ${Math.round(140 - s * 100)}, ${Math.round(30 - s * 30)}, 0.4)`;
  }
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
      // Extend selection
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
    // Build rectangular selection
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
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Keyboard shortcuts for selected cells
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingCell !== null) return;
      if (selectedCells.size === 0) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Reset selected cells to original values
        if (readOnly) return;
        const newValues = [...values];
        for (const idx of Array.from(selectedCells)) {
          if (idx < originalValues.length) {
            const cm = compuMethod;
            newValues[idx] = rawToPhysical(originalValues[idx], cm);
          }
        }
        onValuesChanged(map.name, newValues);
      }

      // +/- for increment/decrement
      if (e.key === '+' || e.key === '=') {
        if (readOnly) return;
        const newValues = [...values];
        const increment = e.shiftKey ? 0.01 : 1; // Shift = percentage mode (1%)
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

      // Enter to start editing first selected cell
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

  // ── VALUE type: single value display ──
  if (map.type === 'VALUE') {
    const val = values[0] ?? 0;
    return (
      <div className="p-4">
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500 font-mono uppercase">Value</span>
          {editingCell === 0 ? (
            <input
              ref={inputRef}
              className="bg-zinc-800 border border-ppei-red/50 text-white font-mono text-lg px-3 py-1 rounded w-40 focus:outline-none focus:ring-1 focus:ring-ppei-red"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
              onBlur={commitEdit}
            />
          ) : (
            <button
              className="bg-zinc-800/80 border border-zinc-700 text-white font-mono text-lg px-4 py-1 rounded hover:border-ppei-red/50 transition-colors"
              onDoubleClick={() => startEdit(0)}
            >
              {formatValue(val)}
            </button>
          )}
          {unit && <span className="text-xs text-zinc-400">{unit}</span>}
        </div>
      </div>
    );
  }

  // ── CURVE type: 1D table ──
  if (map.type === 'CURVE' || rows === 1) {
    return (
      <div ref={tableRef} className="overflow-auto p-2">
        <table className="border-collapse font-mono text-xs">
          {axisX.length > 0 && (
            <thead>
              <tr>
                <th className="px-1 py-0.5 text-[10px] text-zinc-500 text-right border-b border-zinc-700/50 min-w-[60px]">
                  Axis →
                </th>
                {axisX.map((v, i) => (
                  <th key={i} className="px-2 py-0.5 text-[10px] text-cyan-400/80 text-center border-b border-zinc-700/50 min-w-[60px]">
                    {formatValue(v)}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            <tr>
              <td className="px-1 py-0.5 text-[10px] text-zinc-500 text-right border-r border-zinc-700/50">
                {unit || 'Value'}
              </td>
              {values.map((v, i) => {
                const isEditing = editingCell === i;
                const isSelected = selectedCells.has(i);
                const isModified = isCellModified(i);
                return (
                  <td
                    key={i}
                    className={`px-2 py-1 text-center cursor-pointer select-none min-w-[60px] border border-zinc-800/50 transition-colors
                      ${isSelected ? 'ring-1 ring-ppei-red' : ''}
                      ${isModified ? 'text-yellow-300' : 'text-zinc-200'}
                    `}
                    style={{ backgroundColor: valueToColor(v, minVal, maxVal) }}
                    onMouseDown={e => handleCellMouseDown(i, e)}
                    onMouseEnter={() => handleCellMouseEnter(i)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        className="bg-transparent border-b border-ppei-red text-white text-center w-full focus:outline-none"
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
              })}
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  // ── MAP type: 2D table ──
  return (
    <div ref={tableRef} className="overflow-auto p-2">
      <table className="border-collapse font-mono text-xs">
        <thead>
          <tr>
            <th className="px-1 py-0.5 text-[10px] text-zinc-500 border-b border-r border-zinc-700/50 min-w-[60px]">
              {axisY.length > 0 ? 'Y↓ / X→' : ''}
            </th>
            {(axisX.length > 0 ? axisX : Array.from({ length: cols }, (_, i) => i)).map((v, i) => (
              <th key={i} className="px-2 py-0.5 text-[10px] text-cyan-400/80 text-center border-b border-zinc-700/50 min-w-[54px]">
                {formatValue(v as number)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              <td className="px-1 py-0.5 text-[10px] text-cyan-400/80 text-right border-r border-zinc-700/50 sticky left-0 bg-zinc-900/95">
                {axisY[row] !== undefined ? formatValue(axisY[row]) : row}
              </td>
              {Array.from({ length: cols }).map((_, col) => {
                const idx = row * cols + col;
                const v = values[idx] ?? 0;
                const isEditing = editingCell === idx;
                const isSelected = selectedCells.has(idx);
                const isModified = isCellModified(idx);
                return (
                  <td
                    key={col}
                    className={`px-1.5 py-0.5 text-center cursor-pointer select-none min-w-[54px] border border-zinc-800/30 transition-colors
                      ${isSelected ? 'ring-1 ring-ppei-red ring-inset' : ''}
                      ${isModified ? 'text-yellow-300 font-semibold' : 'text-zinc-200'}
                    `}
                    style={{ backgroundColor: valueToColor(v, minVal, maxVal) }}
                    onMouseDown={e => handleCellMouseDown(idx, e)}
                    onMouseEnter={() => handleCellMouseEnter(idx)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        className="bg-transparent border-b border-ppei-red text-white text-center w-full focus:outline-none text-xs"
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
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
        <span>Double-click to edit</span>
        <span>•</span>
        <span>+/- to increment/decrement</span>
        <span>•</span>
        <span>Shift+click for range select</span>
        {!readOnly && <><span>•</span><span className="text-yellow-400">Yellow = modified</span></>}
      </div>
    </div>
  );
}
