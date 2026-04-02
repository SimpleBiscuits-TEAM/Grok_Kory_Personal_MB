/**
 * MapTableEditor — Modern Professional Calibration Table Editor
 *
 * Features:
 *  - Refined 5-stop heatmap gradient (navy > teal > emerald > amber > crimson)
 *  - Right-click context menu with smoothing, math ops, selection, edit actions
 *  - Inline cell editing (double-click to edit, Enter to confirm)
 *  - Multi-cell selection (click+drag, Shift+click for range)
 *  - Axis header click to select row/column, corner click to select all
 *  - Editable axis values (when not readOnly)
 *  - Undo/Redo stack (Ctrl+Z / Ctrl+Y)
 *  - Copy/Paste, Interpolate, Mirror, Flatten, Reset
 *  - Modified cell highlighting with gold left accent bar
 *  - Selection status bar with count, min, max, avg, sum
 *  - Color legend bar with gradient scale
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CalibrationMap, CompuMethod, rawToPhysical } from '@/lib/editorEngine';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
  ContextMenuSeparator, ContextMenuLabel, ContextMenuShortcut,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { smoothRange, type SmoothingMethod } from '@/lib/mapSmoothingAlgorithms';

interface MapTableEditorProps {
  map: CalibrationMap;
  compuMethod?: CompuMethod;
  onValuesChanged: (mapName: string, newPhysValues: number[]) => void;
  readOnly?: boolean;
}

/* ── Color Science ── */
function valueToColor(value: number, min: number, max: number): string {
  if (min === max) return 'rgb(20, 42, 72)';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = [
    { t: 0.00, r: 16, g: 32, b: 78 },
    { t: 0.25, r: 12, g: 92, b: 108 },
    { t: 0.50, r: 22, g: 138, b: 82 },
    { t: 0.75, r: 204, g: 156, b: 28 },
    { t: 1.00, r: 180, g: 36, b: 36 },
  ];
  let i = 0;
  for (let s = 1; s < stops.length; s++) { if (t <= stops[s].t) { i = s - 1; break; } }
  if (t >= 1) i = stops.length - 2;
  const s0 = stops[i], s1 = stops[i + 1];
  const lt = (t - s0.t) / (s1.t - s0.t);
  const st = lt * lt * (3 - 2 * lt); // smoothstep
  return `rgb(${Math.round(s0.r + (s1.r - s0.r) * st)}, ${Math.round(s0.g + (s1.g - s0.g) * st)}, ${Math.round(s0.b + (s1.b - s0.b) * st)})`;
}

function textColorForBg(value: number, min: number, max: number): string {
  if (min === max) return '#e4e4e7';
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t < 0.55 ? '#e4e4e7' : '#1c1c1e';
}

function formatValue(v: number, precision: number = 2): string {
  if (Number.isInteger(v) && Math.abs(v) < 100000) return v.toString();
  if (Math.abs(v) >= 10000) return v.toFixed(1);
  if (Math.abs(v) >= 100) return v.toFixed(precision > 1 ? 1 : precision);
  return v.toFixed(precision);
}

interface UndoEntry { values: number[]; label: string; }

export default function MapTableEditor({ map, compuMethod, onValuesChanged, readOnly = false }: MapTableEditorProps) {
  const [editingCell, setEditingCell] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<number | null>(null);
  const [editingAxisX, setEditingAxisX] = useState<number | null>(null);
  const [editingAxisY, setEditingAxisY] = useState<number | null>(null);
  const [editAxisValue, setEditAxisValue] = useState('');
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [mathDialogOpen, setMathDialogOpen] = useState(false);
  const [mathOp, setMathOp] = useState<'add' | 'subtract' | 'multiply' | 'divide' | 'percentage' | 'fill'>('add');
  const [mathValue, setMathValue] = useState('0');
  const [smoothDialogOpen, setSmoothDialogOpen] = useState(false);
  const [smoothMethod, setSmoothMethod] = useState<SmoothingMethod>('spline');
  const [smoothStrength, setSmoothStrength] = useState(0.5);
  const [smoothIterations, setSmoothIterations] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const axisInputRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const values = map
.physValues || map.rawValues || [];
  const originalValues = map.rawValues || [];
  const modifiedValues = map.modifiedValues;
  const rows = map.rows || 1;
  const cols = map.cols || values.length;
  const axisX = map.axisXValues || [];
  const axisY = map.axisYValues || [];
  const unit = compuMethod?.unit || '';

  const { minVal, maxVal } = useMemo(() => {
    if (values.length === 0) return { minVal: 0, maxVal: 1 };
    let mn = Infinity, mx = -Infinity;
    for (const v of values) { if (v < mn) mn = v; if (v > mx) mx = v; }
    return { minVal: mn, maxVal: mx };
  }, [values]);

  const selectionStats = useMemo(() => {
    if (selectedCells.size === 0) return null;
    const arr = Array.from(selectedCells).map(i => values[i]).filter(v => v !== undefined);
    if (arr.length === 0) return null;
    const mn = Math.min(...arr), mx = Math.max(...arr);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sum = arr.reduce((a, b) => a + b, 0);
    return { count: arr.length, min: mn, max: mx, avg, sum };
  }, [selectedCells, values]);

  useEffect(() => {
    if (editingCell !== null && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editingCell]);

  useEffect(() => {
    if ((editingAxisX !== null || editingAxisY !== null) && axisInputRef.current) { axisInputRef.current.focus(); axisInputRef.current.select(); }
  }, [editingAxisX, editingAxisY]);

  /* ── Undo/Redo ── */
  const pushUndo = useCallback((label: string) => {
    setUndoStack(prev => [...prev.slice(-49), { values: [...values], label }]);
    setRedoStack([]);
  }, [values]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, { values: [...values], label: 'redo' }]);
    setUndoStack(prev => prev.slice(0, -1));
    onValuesChanged(map.name, entry.values);
  }, [undoStack, values, map.name, onValuesChanged]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, { values: [...values], label: 'undo' }]);
    setRedoStack(prev => prev.slice(0, -1));
    onValuesChanged(map.name, entry.values);
  }, [redoStack, values, map.name, onValuesChanged]);

  /* ── Cell editing ── */
  const startEdit = useCallback((idx: number) => {
    if (readOnly) return;
    setEditingCell(idx);
    setEditValue(formatValue(values[idx]));
  }, [readOnly, values]);

  const commitEdit = useCallback(() => {
    if (editingCell === null) return;
    const newVal = parseFloat(editValue);
    if (!isNaN(newVal)) {
      pushUndo('edit cell');
      const nv = [...values]; nv[editingCell] = newVal;
      onValuesChanged(map.name, nv);
    }
    setEditingCell(null);
  }, [editingCell, editValue, values, map.name, onValuesChanged, pushUndo]);

  const cancelEdit = useCallback(() => { setEditingCell(null); }, []);

  /* ── Axis editing ── */
  const startAxisXEdit = useCallback((idx: number) => {
    if (readOnly) return;
    setEditingAxisX(idx); setEditAxisValue(formatValue(axisX[idx]));
  }, [readOnly, axisX]);

  const startAxisYEdit = useCallback((idx: number) => {
    if (readOnly) return;
    setEditingAxisY(idx); setEditAxisValue(formatValue(axisY[idx]));
  }, [readOnly, axisY]);

  const commitAxisEdit = useCallback(() => {
    setEditingAxisX(null); setEditingAxisY(null);
  }, []);

  /* ── Selection ── */
  const handleCellMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail === 2) { startEdit(idx); return; }
    setSelectionStart(idx); setIsDragging(true);
    if (e.shiftKey && selectedCells.size > 0) {
      const existing = Array.from(selectedCells);
      const lo = Math.min(...existing, idx), hi = Math.max(...existing, idx);
      const ns = new Set<number>();
      for (let i = lo; i <= hi; i++) ns.add(i);
      setSelectedCells(ns);
    } else {
      setSelectedCells(new Set([idx]));
    }
  }, [selectedCells, startEdit]);

  const handleCellMouseEnter = useCallback((idx: number) => {
    setHoveredCell(idx);
    if (!isDragging || selectionStart === null) return;
    const sr = Math.floor(selectionStart / cols), sc = selectionStart % cols;
    const er = Math.floor(idx / cols), ec = idx % cols;
    const r1 = Math.min(sr, er), r2 = Math.max(sr, er);
    const c1 = Math.min(sc, ec), c2 = Math.max(sc, ec);
    const ns = new Set<number>();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ns.add(r * cols + c);
    setSelectedCells(ns);
  }, [isDragging, selectionStart, cols]);

  const selectRow = useCallback((row: number) => {
    const ns = new Set<number>(); for (let c = 0; c < cols; c++) ns.add(row * cols + c); setSelectedCells(ns);
  }, [cols]);

  const selectColumn = useCallback((col: number) => {
    const ns = new Set<number>(); for (let r = 0; r < rows; r++) ns.add(r * cols + col); setSelectedCells(ns);
  }, [rows, cols]);

  const selectAllCells = useCallback(() => {
    const ns = new Set<number>(); for (let i = 0; i < values.length; i++) ns.add(i); setSelectedCells(ns);
  }, [values.length]);

  const invertSelection = useCallback(() => {
    const ns = new Set<number>(); for (let i = 0; i < values.length; i++) { if (!selectedCells.has(i)) ns.add(i); } setSelectedCells(ns);
  }, [selectedCells, values.length]);

  const clearSelection = useCallback(() => { setSelectedCells(new Set()); }, []);

  /* ── Math operations ── */
  const applyMathOp = useCallback((op: string, val: number) => {
    if (readOnly || selectedCells.size === 0) return;
    pushUndo(op);
    const nv = [...values];
    for (const idx of Array.from(selectedCells)) {
      const cur = nv[idx];
      switch (op) {
        case 'add': nv[idx] = cur + val; break;
        case 'subtract': nv[idx] = cur - val; break;
        case 'multiply': nv[idx] = cur * val; break;
        case 'divide': if (val !== 0) nv[idx] = cur / val; break;
        case 'percentage': nv[idx] = cur * (1 + val / 100); break;
        case 'fill': nv[idx] = val; break;
      }
    }
    onValuesChanged(map.name, nv);
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  /* ── Quick operations ── */
  const flattenToAvg = useCallback(() => {
    if (readOnly || selectedCells.size === 0) return;
    const arr = Array.from(selectedCells).map(i => values[i]);
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    pushUndo('flatten'); const nv = [...values];
    for (const idx of Array.from(selectedCells)) nv[idx] = avg;
    onValuesChanged(map.name, nv);
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  const setToMin = useCallback(() => {
    if (readOnly || selectedCells.size === 0) return;
    const mn = Math.min(...Array.from(selectedCells).map(i => values[i]));
    pushUndo('set min'); const nv = [...values];
    for (const idx of Array.from(selectedCells)) nv[idx] = mn;
    onValuesChanged(map.name, nv);
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  const setToMax = useCallback(() => {
    if (readOnly || selectedCells.size === 0) return;
    const mx = Math.max(...Array.from(selectedCells).map(i => values[i]));
    pushUndo('set max'); const nv = [...values];
    for (const idx of Array.from(selectedCells)) nv[idx] = mx;
    onValuesChanged(map.name, nv);
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  const interpolateSelection = useCallback(() => {
    if (readOnly || selectedCells.size < 3) return;
    const sorted = Array.from(selectedCells).sort((a, b) => a - b);
    const first = values[sorted[0]], last = values[sorted[sorted.length - 1]];
    pushUndo('interpolate'); const nv = [...values];
    for (let i = 0; i < sorted.length; i++) {
      const t = i / (sorted.length - 1);
      nv[sorted[i]] = first + (last - first) * t;
    }
    onValuesChanged(map.name, nv);
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  const mirrorSelection = useCallback(() => {
    if (readOnly || selectedCells.size < 2) return;
    const sorted = Array.from(selectedCells).sort((a, b) => a - b);
    pushUndo('mirror'); const nv = [...values];
    const half = Math.floor(sorted.length / 2);
    for (let i = 0; i < half; i++) {
      const mi = sorted.length - 1 - i;
      const tmp = nv[sorted[i]]; nv[sorted[i]] = nv[sorted[mi]]; nv[sorted[mi]] = tmp;
    }
    onValuesChanged(map.name, nv);
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  const resetSelection = useCallback(() => {
    if (readOnly || selectedCells.size === 0) return;
    pushUndo('reset'); const nv = [...values];
    for (const idx of Array.from(selectedCells)) {
      if (idx < originalValues.length) nv[idx] = rawToPhysical(originalValues[idx], compuMethod);
    }
    onValuesChanged(map.name, nv);
  }, [selectedCells, values, originalValues, readOnly, compuMethod, map.name, onValuesChanged, pushUndo]);

  /* ── Copy/Paste ── */
  const copySelection = useCallback(() => {
    if (selectedCells.size === 0) return;
    const sorted = Array.from(selectedCells).sort((a, b) => a - b);
    navigator.clipboard.writeText(sorted.map(i => formatValue(values[i])).join('\t')).catch(() => {});
  }, [selectedCells, values]);

  const pasteValues = useCallback(async () => {
    if (readOnly || selectedCells.size === 0) return;
    try {
      const text = await navigator.clipboard.readText();
      const pasted = text.split(/[\t\n,]/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
      if (pasted.length === 0) return;
      pushUndo('paste');
      const sorted = Array.from(selectedCells).sort((a, b) => a - b);
      const nv = [...values];
      for (let i = 0; i < sorted.length && i < pasted.length; i++) nv[sorted[i]] = pasted[i];
      onValuesChanged(map.name, nv);
    } catch { /* clipboard denied */ }
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  /* ── Smoothing ── */
  const applySmoothing = useCallback((method: SmoothingMethod, strength: number, iterations: number) => {
    if (readOnly || selectedCells.size < 3) return;
    const sorted = Array.from(selectedCells).sort((a, b) => a - b);
    pushUndo(`smooth (${method})`);
    const smoothed = smoothRange(values, sorted[0], sorted[sorted.length - 1], {
      method, strength, preserveEndpoints: true, iterations,
    });
    onValuesChanged(map.name, smoothed);
  }, [selectedCells, values, readOnly, map.name, onValuesChanged, pushUndo]);

  /* ── Export for parent ── */
  const mathOperations = {
    add: (v: number) => applyMathOp('add', v),
    subtract: (v: number) => applyMathOp('subtract', v),
    multiply: (v: number) => applyMathOp('multiply', v),
    divide: (v: number) => applyMathOp('divide', v),
    percentage: (v: number) => applyMathOp('percentage', v),
    selectRow, selectColumn, selectAllCells,
  };
  (window as any).__mapTableMethods = mathOperations;

  useEffect(() => {
    const h = () => setIsDragging(false);
    window.addEventListener('mouseup', h);
    return () => window.removeEventListener('mouseup', h);
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { copySelection(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { pasteValues(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAllCells(); return; }
      if (editingCell !== null) return;
      if (selectedCells.size === 0) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (!readOnly) resetSelection(); }
      if (e.key === '+' || e.key === '=') {
        if (readOnly) return;
        pushUndo('incr'); const nv = [...values]; const inc = e.shiftKey ? 0.01 : 1;
        for (const idx of Array.from(selectedCells)) { nv[idx] = e.shiftKey ? nv[idx] * (1 + inc) : nv[idx] + inc; }
        onValuesChanged(map.name, nv);
      }
      if (e.key === '-' || e.key === '_') {
        if (readOnly) return;
        pushUndo('decr'); const nv = [...values]; const dec = e.shiftKey ? 0.01 : 1;
        for (const idx of Array.from(selectedCells)) { nv[idx] = e.shiftKey ? nv[idx] * (1 - dec) : nv[idx] - dec; }
        onValuesChanged(map.name, nv);
      }
      if (e.key === 'Enter') { const first = Array.from(selectedCells)[0]; if (first !== undefined) startEdit(first); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, selectedCells, readOnly, values, originalValues, compuMethod, map.name, onValuesChanged, startEdit, undo, redo, copySelection, pasteValues, selectAllCells, resetSelection, pushUndo]);

  const isCellModified = useCallback((idx: number): boolean => {
    if (!modifiedValues || idx >= modifiedValues.length || idx >= originalValues.length) return false;
    return modifiedValues[idx] !== originalValues[idx];
  }, [modifiedValues, originalValues]);

  /* ── Render cell ── */
  const renderCell = (idx: number, v: number) => {
    const isEditing = editingCell === idx;
    const isSelected = selectedCells.has(idx);
    const isModified = isCellModified(idx);
    const isHovered = hoveredCell === idx;
    const bgColor = valueToColor(v, minVal, maxVal);
    const fgColor = isModified ? '#fbbf24' : textColorForBg(v, minVal, maxVal);

    return (
      <td
        key={idx}
        className="text-center cursor-pointer select-none font-mono tabular-nums relative"
        style={{
          backgroundColor: bgColor,
          color: fgColor,
          fontWeight: isModified ? 600 : 400,
          fontSize: '12px',
          lineHeight: '1.5',
          minWidth: '62px',
          padding: '3px 6px',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: isSelected ? 'rgba(239,68,68,0.8)' : isHovered ? 'rgba(255,255,255,0.2)' : 'rgba(30,30,35,0.6)',
          boxShadow: isSelected
            ? 'inset 0 0 0 1.5px rgba(239,68,68,0.7), 0 0 6px rgba(239,68,68,0.15)'
            : isHovered ? 'inset 0 0 8px rgba(255,255,255,0.06)' : 'inset 0 1px 2px rgba(0,0,0,0.15)',
          transition: 'box-shadow 0.1s ease, border-color 0.1s ease',
        }}
        onMouseDown={e => handleCellMouseDown(idx, e)}
        onMouseEnter={() => handleCellMouseEnter(idx)}
        onMouseLeave={() => setHoveredCell(null)}
      >
        {isModified && (
          <span style={{ position: 'absolute', left: 0, top: '15%', bottom: '15%', width: '2.5px', backgroundColor: '#fbbf24', borderRadius: '0 2px 2px 0' }} />
        )}
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
        ) : formatValue(v)}
      </td>
    );
  };

  /* ── Context Menu Items ── */
  const renderContextMenuItems = () => (
    <>
      <ContextMenuLabel className="text-[10px] text-zinc-500 uppercase tracking-wider">
        {selectedCells.size > 0 ? `${selectedCells.size} cell${selectedCells.size > 1 ? 's' : ''} selected` : 'No selection'}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={readOnly || selectedCells.size < 3} className="text-xs">Smooth Selection</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">
          <ContextMenuLabel className="text-[10px] text-zinc-500">Quick Smooth</ContextMenuLabel>
          {(['linear', 'spline', 'exponential', 'gaussian', 'catmull-rom'] as SmoothingMethod[]).map(m => (
            <ContextMenuSub key={m}>
              <ContextMenuSubTrigger className="text-xs capitalize">{m.replace('-', ' ')}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem className="text-xs" onClick={() => applySmoothing(m, 0.25, 1)}>Light (25%)</ContextMenuItem>
                <ContextMenuItem className="text-xs" onClick={() => applySmoothing(m, 0.5, 1)}>Medium (50%)</ContextMenuItem>
                <ContextMenuItem className="text-xs" onClick={() => applySmoothing(m, 0.75, 1)}>Heavy (75%)</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem className="text-xs" onClick={() => setSmoothDialogOpen(true)}>Custom Smooth...</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={readOnly || selectedCells.size === 0} className="text-xs">Math Operations</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          <ContextMenuItem className="text-xs" onClick={() => { setMathOp('add'); setMathDialogOpen(true); }}>Add Value <ContextMenuShortcut>+</ContextMenuShortcut></ContextMenuItem>
          <ContextMenuItem className="text-xs" onClick={() => { setMathOp('subtract'); setMathDialogOpen(true); }}>Subtract Value <ContextMenuShortcut>-</ContextMenuShortcut></ContextMenuItem>
          <ContextMenuItem className="text-xs" onClick={() => { setMathOp('multiply'); setMathDialogOpen(true); }}>Multiply By</ContextMenuItem>
          <ContextMenuItem className="text-xs" onClick={() => { setMathOp('divide'); setMathDialogOpen(true); }}>Divide By</ContextMenuItem>
          <ContextMenuItem className="text-xs" onClick={() => { setMathOp('percentage'); setMathDialogOpen(true); }}>Percentage Change</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-xs" onClick={() => { setMathOp('fill'); setMathDialogOpen(true); }}>Fill with Value</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem className="text-xs" disabled={readOnly || selectedCells.size < 3} onClick={interpolateSelection}>Interpolate</ContextMenuItem>
      <ContextMenuItem className="text-xs" disabled={readOnly || selectedCells.size === 0} onClick={flattenToAvg}>Flatten to Average</ContextMenuItem>
      <ContextMenuItem className="text-xs" disabled={readOnly || selectedCells.size === 0} onClick={setToMin}>Set to Min</ContextMenuItem>
      <ContextMenuItem className="text-xs" disabled={readOnly || selectedCells.size === 0} onClick={setToMax}>Set to Max</ContextMenuItem>
      <ContextMenuItem className="text-xs" disabled={readOnly || selectedCells.size < 2} onClick={mirrorSelection}>Mirror Selection</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className="text-xs" onClick={copySelection}>Copy <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem className="text-xs" disabled={readOnly} onClick={pasteValues}>Paste <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem className="text-xs" disabled={readOnly || selectedCells.size === 0} onClick={resetSelection}>Reset to Original <ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger className="text-xs">Selection</ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          <ContextMenuItem className="text-xs" onClick={selectAllCells}>Select All <ContextMenuShortcut>Ctrl+A</ContextMenuShortcut></ContextMenuItem>
          <ContextMenuItem className="text-xs" onClick={invertSelection}>Invert Selection</ContextMenuItem>
          <ContextMenuItem className="text-xs" onClick={clearSelection}>Clear Selection</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem className="text-xs" disabled={undoStack.length === 0} onClick={undo}>Undo <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem className="text-xs" disabled={redoStack.length === 0} onClick={redo}>Redo <ContextMenuShortcut>Ctrl+Y</ContextMenuShortcut></ContextMenuItem>
    </>
  );

  /* ── Legend bar ── */
  const renderLegend = () => {
    const steps = 20;
    return (
      <div className="flex items-center gap-2 mt-3">
        <span className="text-[10px] font-mono text-zinc-500">{formatValue(minVal)}</span>
        <div className="flex h-3 flex-1 rounded-sm overflow-hidden" style={{ maxWidth: '200px' }}>
          {Array.from({ length: steps }).map((_, i) => {
            const t = i / (steps - 1);
            const v = minVal + (maxVal - minVal) * t;
            return <div key={i} className="flex-1" style={{ backgroundColor: valueToColor(v, minVal, maxVal) }} />;
          })}
        </div>
        <span className="text-[10px] font-mono text-zinc-500">{formatValue(maxVal)}</span>
        {unit && <span className="text-[10px] font-mono text-zinc-600 ml-1">{unit}</span>}
      </div>
    );
  };

  /* ── Status bar ── */
  const renderStatusBar = () => (
    <div className="flex items-center gap-4 mt-2.5 text-[10px] font-mono text-zinc-500 flex-wrap">
      <div className="flex items-center gap-2">
        <span>Dbl-click edit</span>
        <span className="text-zinc-700">|</span>
        <span>+/- incr</span>
        <span className="text-zinc-700">|</span>
        <span>Shift+click range</span>
        <span className="text-zinc-700">|</span>
        <span>Right-click menu</span>
        <span className="text-zinc-700">|</span>
        <span>Ctrl+Z undo</span>
      </div>
      {!readOnly && (
        <span className="text-yellow-400/80 flex items-center gap-1">
          <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#fbbf24', borderRadius: '2px' }} />
          Modified
        </span>
      )}
      {selectionStats && (
        <div className="flex items-center gap-2 ml-auto bg-zinc-800/60 px-2.5 py-1 rounded border border-zinc-700/50">
          <span className="text-red-400">{selectionStats.count} sel</span>
          <span className="text-zinc-600">|</span>
          <span>Min: <span className="text-zinc-300">{formatValue(selectionStats.min)}</span></span>
          <span>Max: <span className="text-zinc-300">{formatValue(selectionStats.max)}</span></span>
          <span>Avg: <span className="text-zinc-300">{formatValue(selectionStats.avg)}</span></span>
          <span>Sum: <span className="text-zinc-300">{formatValue(selectionStats.sum)}</span></span>
        </div>
      )}
      {undoStack.length > 0 && <span className="text-zinc-600">({undoStack.length} undo)</span>}
    </div>
  );

  /* ── Axis header rendering ── */
  const renderAxisXHeader = (v: number, i: number) => (
    <th
      key={i}
      className="px-2 py-1.5 text-center border-b-2 border-zinc-700/80 cursor-pointer hover:bg-cyan-900/20 transition-colors"
      style={{ fontSize: '11px', color: '#22d3ee', minWidth: '62px', fontWeight: 600 }}
      onClick={() => selectColumn(i)}
      onDoubleClick={() => startAxisXEdit(i)}
    >
      {editingAxisX === i ? (
        <input
          ref={axisInputRef}
          className="bg-zinc-900 border border-cyan-500 text-cyan-300 text-center w-full rounded-sm focus:outline-none text-xs font-mono"
          style={{ fontSize: '11px' }}
          value={editAxisValue}
          onChange={e => setEditAxisValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitAxisEdit(); }}
          onBlur={commitAxisEdit}
        />
      ) : formatValue(v)}
    </th>
  );

  const renderAxisYHeader = (v: number, i: number) => (
    <td
      key={`y-${i}`}
      className="px-2 py-1.5 text-right border-r-2 border-zinc-700/80 sticky left-0 z-10 bg-zinc-950 cursor-pointer hover:bg-cyan-900/20 transition-colors"
      style={{ fontSize: '11px', color: '#22d3ee', minWidth: '62px', fontWeight: 600 }}
      onClick={() => selectRow(i)}
      onDoubleClick={() => startAxisYEdit(i)}
    >
      {editingAxisY === i ? (
        <input
          ref={axisInputRef}
          className="bg-zinc-900 border border-cyan-500 text-cyan-300 text-center w-full rounded-sm focus:outline-none text-xs font-mono"
          style={{ fontSize: '11px' }}
          value={editAxisValue}
          onChange={e => setEditAxisValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitAxisEdit(); }}
          onBlur={commitAxisEdit}
        />
      ) : formatValue(v)}
    </td>
  );

  /* ── Math Dialog ── */
  const renderMathDialog = () => (
    <Dialog open={mathDialogOpen} onOpenChange={setMathDialogOpen}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono capitalize">{mathOp} — {selectedCells.size} cells</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 mt-2">
          <Input
            className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
            type="number"
            step="any"
            value={mathValue}
            onChange={e => setMathValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = parseFloat(mathValue);
                if (!isNaN(v)) { applyMathOp(mathOp, v); setMathDialogOpen(false); }
              }
            }}
            autoFocus
          />
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white font-mono text-xs"
            onClick={() => {
              const v = parseFloat(mathValue);
              if (!isNaN(v)) { applyMathOp(mathOp, v); setMathDialogOpen(false); }
            }}
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  /* ── Smooth Dialog ── */
  const renderSmoothDialog = () => (
    <Dialog open={smoothDialogOpen} onOpenChange={setSmoothDialogOpen}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-mono">Custom Smoothing — {selectedCells.size} cells</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs text-zinc-400 font-mono mb-1 block">Method</label>
            <Select value={smoothMethod} onValueChange={v => setSmoothMethod(v as SmoothingMethod)}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white text-xs font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="linear">Linear</SelectItem>
                <SelectItem value="spline">Cubic Spline</SelectItem>
                <SelectItem value="exponential">Exponential</SelectItem>
                <SelectItem value="gaussian">Gaussian</SelectItem>
                <SelectItem value="catmull-rom">Catmull-Rom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 font-mono mb-1 block">Strength: {Math.round(smoothStrength * 100)}%</label>
            <Slider value={[smoothStrength]} onValueChange={([v]) => setSmoothStrength(v)} min={0.05} max={1} step={0.05} className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 font-mono mb-1 block">Iterations: {smoothIterations}</label>
            <Slider value={[smoothIterations]} onValueChange={([v]) => setSmoothIterations(v)} min={1} max={5} step={1} className="mt-1" />
          </div>
          <Button
            className="w-full bg-red-600 hover:bg-red-700 text-white font-mono text-xs"
            onClick={() => { applySmoothing(smoothMethod, smoothStrength, smoothIterations); setSmoothDialogOpen(false); }}
          >
            Apply Smoothing
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  /* ── VALUE type ── */
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

  /* ── CURVE type ── */
  if (map.type === 'CURVE' || rows === 1) {
    return (
      <div ref={tableRef} className="overflow-auto p-3">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <table className="border-collapse font-mono" style={{ fontSize: '12px' }}>
              {axisX.length > 0 && (
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-right border-b-2 border-r-2 border-zinc-700/80" style={{ fontSize: '11px', color: '#71717a', minWidth: '62px' }}>Axis</th>
                    {axisX.map((v, i) => renderAxisXHeader(v, i))}
                  </tr>
                </thead>
              )}
              <tbody>
                <tr>
                  <td className="px-2 py-1.5 text-right border-r-2 border-zinc-700/80" style={{ fontSize: '11px', color: '#71717a', minWidth: '62px' }}>{unit || 'Value'}</td>
                  {values.map((v, i) => renderCell(i, v))}
                </tr>
              </tbody>
            </table>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56 bg-zinc-900 border-zinc-700">{renderContextMenuItems()}</ContextMenuContent>
        </ContextMenu>
        {renderLegend()}
        {renderStatusBar()}
        {renderMathDialog()}
        {renderSmoothDialog()}
      </div>
    );
  }

  /* ── MAP type ── */
  return (
    <div ref={tableRef} className="overflow-auto p-3">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <table className="border-collapse font-mono" style={{ fontSize: '12px' }}>
            <thead>
              <tr>
                <th
                  className="px-2 py-1.5 border-b-2 border-r-2 border-zinc-700/80 sticky left-0 z-10 bg-zinc-950 cursor-pointer hover:bg-red-900/20 transition-colors"
                  style={{ fontSize: '11px', color: '#71717a', minWidth: '62px' }}
                  onClick={selectAllCells}
                  title="Click to select all cells"
                >
                  {axisY.length > 0 ? 'Y / X' : ''}
                </th>
                {(axisX.length > 0 ? axisX : Array.from({ length: cols }, (_, i) => i)).map((v, i) => renderAxisXHeader(v as number, i))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, row) => (
                <tr key={row}>
                  {axisY[row] !== undefined ? renderAxisYHeader(axisY[row], row) : (
                    <td
                      className="px-2 py-1.5 text-right border-r-2 border-zinc-700/80 sticky left-0 z-10 bg-zinc-950 cursor-pointer hover:bg-cyan-900/20 transition-colors"
                      style={{ fontSize: '11px', color: '#22d3ee', minWidth: '62px', fontWeight: 600 }}
                      onClick={() => selectRow(row)}
                    >
                      {row}
                    </td>
                  )}
                  {Array.from({ length: cols }).map((_, col) => {
                    const idx = row * cols + col;
                    return renderCell(idx, values[idx] ?? 0);
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56 bg-zinc-900 border-zinc-700">{renderContextMenuItems()}</ContextMenuContent>
      </ContextMenu>
      {renderLegend()}
      {renderStatusBar()}
      {renderMathDialog()}
      {renderSmoothDialog()}
    </div>
  );
}
