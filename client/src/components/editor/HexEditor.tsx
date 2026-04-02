/**
 * WinOLS-Style Hex Editor (Optimized)
 *
 * Refactored to use useReducer for centralized state management.
 * All features preserved: dual-pane hex/ASCII, selectable regions,
 * go-to-address, find/replace, color-coded A2L regions, bookmarks,
 * undo/redo, map detection, cursor value preview, nibble editing,
 * ASCII editing, byte grouping, endianness toggle.
 */

import { useReducer, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Replace, Bookmark, BookmarkPlus, Undo2, Redo2,
  MapPin, Copy, ClipboardPaste, ArrowDown, ArrowUp, Hash
} from 'lucide-react';
import type { CalibrationMap, EcuDefinition } from '@/lib/editorEngine';

// ── Types ──────────────────────────────────────────────────────────────────────

interface HexEdit {
  offset: number;
  oldValue: number;
  newValue: number;
}

interface HexBookmark {
  offset: number;
  label: string;
  color: string;
}

type ByteGrouping = 1 | 2 | 4;
type Endianness = 'LE' | 'BE';

interface HexEditorProps {
  data: Uint8Array;
  ecuDef?: EcuDefinition | null;
  alignment?: { offset: number; confidence: number } | null;
  baseAddress?: number;
  onDataChange?: (newData: Uint8Array) => void;
  onMapDetected?: (map: Partial<CalibrationMap>) => void;
  onNavigateToMap?: (mapIndex: number) => void;
}

const BYTES_PER_ROW = 16;
const VISIBLE_ROWS = 32;
const ROW_HEIGHT = 22;
const BOOKMARK_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

// ── Reducer ────────────────────────────────────────────────────────────────────

interface EditorState {
  scrollOffset: number;
  cursorOffset: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  isSelecting: boolean;
  editMode: 'hex' | 'ascii';
  editNibble: 'high' | 'low';
  showSearch: boolean;
  searchHex: string;
  replaceHex: string;
  searchResults: number[];
  searchIndex: number;
  goToAddress: string;
  showGoTo: boolean;
  bookmarks: HexBookmark[];
  showBookmarks: boolean;
  undoStack: HexEdit[][];
  redoStack: HexEdit[][];
  modifiedBytes: Set<number>;
  byteGrouping: ByteGrouping;
  endianness: Endianness;
  showMapDetect: boolean;
  mapDetectRows: number;
  mapDetectCols: number;
  mapDetectDataType: 'uint8' | 'uint16' | 'int16' | 'float32';
}

type EditorAction =
  | { type: 'SET_SCROLL'; offset: number }
  | { type: 'SET_CURSOR'; offset: number }
  | { type: 'SET_SELECTION'; start: number | null; end: number | null }
  | { type: 'SET_SELECTING'; value: boolean }
  | { type: 'SET_EDIT_MODE'; mode: 'hex' | 'ascii' }
  | { type: 'SET_EDIT_NIBBLE'; nibble: 'high' | 'low' }
  | { type: 'TOGGLE_SEARCH' }
  | { type: 'SET_SEARCH_HEX'; value: string }
  | { type: 'SET_REPLACE_HEX'; value: string }
  | { type: 'SET_SEARCH_RESULTS'; results: number[]; index: number }
  | { type: 'SET_SEARCH_INDEX'; index: number }
  | { type: 'TOGGLE_GOTO' }
  | { type: 'SET_GOTO_ADDRESS'; value: string }
  | { type: 'TOGGLE_BOOKMARKS' }
  | { type: 'ADD_BOOKMARK'; bookmark: HexBookmark }
  | { type: 'APPLY_EDIT'; edits: HexEdit[] }
  | { type: 'UNDO'; data: Uint8Array }
  | { type: 'REDO'; data: Uint8Array }
  | { type: 'SET_BYTE_GROUPING'; grouping: ByteGrouping }
  | { type: 'SET_ENDIANNESS'; endianness: Endianness }
  | { type: 'TOGGLE_MAP_DETECT' }
  | { type: 'SET_MAP_DETECT_ROWS'; value: number }
  | { type: 'SET_MAP_DETECT_COLS'; value: number }
  | { type: 'SET_MAP_DETECT_TYPE'; value: 'uint8' | 'uint16' | 'int16' | 'float32' }
  | { type: 'NAVIGATE_TO'; offset: number; maxScroll: number }
  | { type: 'CLEAR_OVERLAYS' }
  | { type: 'SET_MODIFIED_BYTES'; bytes: Set<number> };

function createInitialState(): EditorState {
  return {
    scrollOffset: 0,
    cursorOffset: 0,
    selectionStart: null,
    selectionEnd: null,
    isSelecting: false,
    editMode: 'hex',
    editNibble: 'high',
    showSearch: false,
    searchHex: '',
    replaceHex: '',
    searchResults: [],
    searchIndex: 0,
    goToAddress: '',
    showGoTo: false,
    bookmarks: [],
    showBookmarks: false,
    undoStack: [],
    redoStack: [],
    modifiedBytes: new Set(),
    byteGrouping: 1,
    endianness: 'LE',
    showMapDetect: false,
    mapDetectRows: 1,
    mapDetectCols: 1,
    mapDetectDataType: 'uint16',
  };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_SCROLL':
      return { ...state, scrollOffset: action.offset };
    case 'SET_CURSOR':
      return { ...state, cursorOffset: action.offset, editNibble: 'high' };
    case 'SET_SELECTION':
      return { ...state, selectionStart: action.start, selectionEnd: action.end, editNibble: 'high' };
    case 'SET_SELECTING':
      return { ...state, isSelecting: action.value };
    case 'SET_EDIT_MODE':
      return { ...state, editMode: action.mode };
    case 'SET_EDIT_NIBBLE':
      return { ...state, editNibble: action.nibble };
    case 'TOGGLE_SEARCH':
      return { ...state, showSearch: !state.showSearch };
    case 'SET_SEARCH_HEX':
      return { ...state, searchHex: action.value };
    case 'SET_REPLACE_HEX':
      return { ...state, replaceHex: action.value };
    case 'SET_SEARCH_RESULTS':
      return { ...state, searchResults: action.results, searchIndex: action.index };
    case 'SET_SEARCH_INDEX':
      return { ...state, searchIndex: action.index };
    case 'TOGGLE_GOTO':
      return { ...state, showGoTo: !state.showGoTo };
    case 'SET_GOTO_ADDRESS':
      return { ...state, goToAddress: action.value };
    case 'TOGGLE_BOOKMARKS':
      return { ...state, showBookmarks: !state.showBookmarks };
    case 'ADD_BOOKMARK':
      return { ...state, bookmarks: [...state.bookmarks, action.bookmark] };

    case 'APPLY_EDIT': {
      // Track which offsets have EVER been modified across all batches
      const newModified = new Set(state.modifiedBytes);
      for (const e of action.edits) newModified.add(e.offset);
      return {
        ...state,
        undoStack: [...state.undoStack, action.edits],
        redoStack: [],
        modifiedBytes: newModified,
      };
    }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const edits = state.undoStack[state.undoStack.length - 1];
      // Apply reverse edits to actual data
      for (const edit of [...edits].reverse()) {
        action.data[edit.offset] = edit.oldValue;
      }
      // Rebuild modifiedBytes from remaining undo stack (correct multi-batch tracking)
      const remainingStack = state.undoStack.slice(0, -1);
      const rebuiltModified = new Set<number>();
      for (const batch of remainingStack) {
        for (const e of batch) rebuiltModified.add(e.offset);
      }
      return {
        ...state,
        undoStack: remainingStack,
        redoStack: [...state.redoStack, edits],
        modifiedBytes: rebuiltModified,
      };
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const edits = state.redoStack[state.redoStack.length - 1];
      // Apply forward edits to actual data
      for (const edit of edits) {
        action.data[edit.offset] = edit.newValue;
      }
      const newModified = new Set(state.modifiedBytes);
      for (const e of edits) newModified.add(e.offset);
      return {
        ...state,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, edits],
        modifiedBytes: newModified,
      };
    }

    case 'SET_BYTE_GROUPING':
      return { ...state, byteGrouping: action.grouping };
    case 'SET_ENDIANNESS':
      return { ...state, endianness: action.endianness };
    case 'TOGGLE_MAP_DETECT':
      return { ...state, showMapDetect: !state.showMapDetect };
    case 'SET_MAP_DETECT_ROWS':
      return { ...state, mapDetectRows: action.value };
    case 'SET_MAP_DETECT_COLS':
      return { ...state, mapDetectCols: action.value };
    case 'SET_MAP_DETECT_TYPE':
      return { ...state, mapDetectDataType: action.value };
    case 'NAVIGATE_TO': {
      const row = Math.floor(action.offset / BYTES_PER_ROW);
      const targetScroll = Math.max(0, Math.min(row - Math.floor(VISIBLE_ROWS / 2), action.maxScroll));
      return { ...state, scrollOffset: targetScroll, cursorOffset: action.offset };
    }
    case 'CLEAR_OVERLAYS':
      return { ...state, selectionStart: null, selectionEnd: null, showSearch: false, showGoTo: false, showMapDetect: false };
    case 'SET_MODIFIED_BYTES':
      return { ...state, modifiedBytes: action.bytes };
    default:
      return state;
  }
}

// ── Memoized Sub-Components ────────────────────────────────────────────────────

interface HexByteProps {
  offset: number;
  value: number;
  isCursor: boolean;
  isSelected: boolean;
  isModified: boolean;
  isSearchHit: boolean;
  regionColor: string | null;
  regionName: string | null;
  regionMapIndex: number | null;
  bookmarkColor: string | null;
  baseAddress: number;
  onMouseDown: (offset: number, e: React.MouseEvent) => void;
  onMouseEnter: (offset: number) => void;
  onNavigateToMap?: (mapIndex: number) => void;
}

const HexByte = memo(function HexByte({
  offset, value, isCursor, isSelected, isModified, isSearchHit,
  regionColor, regionName, regionMapIndex, bookmarkColor,
  baseAddress, onMouseDown, onMouseEnter, onNavigateToMap,
}: HexByteProps) {
  let bg = 'transparent';
  if (isCursor) bg = 'rgba(239,68,68,0.6)';
  else if (isSelected) bg = 'rgba(59,130,246,0.35)';
  else if (isSearchHit) bg = 'rgba(245,158,11,0.4)';
  else if (regionColor) bg = regionColor;

  let textColor = '#9ca3af';
  if (isModified) textColor = '#22c55e';
  if (value === 0x00) textColor = '#4b5563';
  if (value === 0xFF) textColor = '#f59e0b';

  const borderLeft = bookmarkColor ? `2px solid ${bookmarkColor}` : undefined;

  return (
    <span
      className="inline-block cursor-pointer select-none font-mono text-xs leading-[22px] px-[1px]"
      style={{ background: bg, color: textColor, borderLeft, minWidth: '20px', textAlign: 'center' }}
      onMouseDown={(e) => onMouseDown(offset, e)}
      onMouseEnter={() => onMouseEnter(offset)}
      onDoubleClick={() => {
        if (regionMapIndex !== null && onNavigateToMap) onNavigateToMap(regionMapIndex);
      }}
      title={regionName ? `${regionName} (double-click to open)` : `0x${(offset + baseAddress).toString(16).toUpperCase()}`}
    >
      {value.toString(16).padStart(2, '0').toUpperCase()}
    </span>
  );
});

interface AsciiBytePr {
  offset: number;
  value: number;
  isCursor: boolean;
  isSelected: boolean;
  isModified: boolean;
  onMouseDown: (offset: number, e: React.MouseEvent) => void;
  onMouseEnter: (offset: number) => void;
  setAsciiMode: () => void;
}

const AsciiByte = memo(function AsciiByte({
  offset, value, isCursor, isSelected, isModified,
  onMouseDown, onMouseEnter, setAsciiMode,
}: AsciiBytePr) {
  const ch = value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';
  let bg = 'transparent';
  if (isCursor) bg = 'rgba(239,68,68,0.6)';
  else if (isSelected) bg = 'rgba(59,130,246,0.35)';

  return (
    <span
      className="inline-block cursor-pointer select-none font-mono text-xs leading-[22px]"
      style={{ background: bg, color: isModified ? '#22c55e' : '#6b7280', minWidth: '8px', textAlign: 'center' }}
      onMouseDown={(e) => { setAsciiMode(); onMouseDown(offset, e); }}
      onMouseEnter={() => onMouseEnter(offset)}
    >
      {ch}
    </span>
  );
});

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HexEditor({
  data, ecuDef, alignment, baseAddress = 0, onDataChange, onMapDetected, onNavigateToMap,
}: HexEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, undefined, createInitialState);
  const containerRef = useRef<HTMLDivElement>(null);
  const hexAreaRef = useRef<HTMLDivElement>(null);

  const totalRows = Math.ceil(data.length / BYTES_PER_ROW);
  const maxScroll = Math.max(0, totalRows - VISIBLE_ROWS);

  // ── Derived values ──
  const selMin = state.selectionStart !== null && state.selectionEnd !== null
    ? Math.min(state.selectionStart, state.selectionEnd) : null;
  const selMax = state.selectionStart !== null && state.selectionEnd !== null
    ? Math.max(state.selectionStart, state.selectionEnd) : null;
  const selectionSize = selMin !== null && selMax !== null ? selMax - selMin + 1 : 0;

  // ── A2L Region Map (for color coding) ──
  const mappedRegions = useMemo(() => {
    if (!ecuDef || !alignment) return new Map<number, { mapIndex: number; name: string; color: string }>();
    const regions = new Map<number, { mapIndex: number; name: string; color: string }>();
    const colors = ['rgba(59,130,246,0.25)', 'rgba(168,85,247,0.25)', 'rgba(34,197,94,0.25)',
      'rgba(245,158,11,0.25)', 'rgba(236,72,153,0.25)', 'rgba(6,182,212,0.25)'];

    ecuDef.maps.forEach((map, idx) => {
      if (map.address === undefined) return;
      const addr = map.address - (alignment.offset || 0);
      if (addr < 0 || addr >= data.length) return;

      const dataSize = map.type === 'VALUE' ? (map.recordLayout?.includes('32') || map.recordLayout?.includes('FLOAT') ? 4 : 2)
        : map.type === 'CURVE' ? (map.cols || map.axisXValues?.length || 1) * 2
        : map.type === 'MAP' ? (map.cols || map.axisXValues?.length || 1) * (map.rows || map.axisYValues?.length || 1) * 2
        : 2;

      for (let i = 0; i < dataSize && (addr + i) < data.length; i++) {
        regions.set(addr + i, { mapIndex: idx, name: map.name, color: colors[idx % colors.length] });
      }
    });

    return regions;
  }, [ecuDef, alignment, data.length]);

  // ── Selection helper ──
  const isSelected = useCallback((offset: number) => {
    if (selMin === null || selMax === null) return false;
    return offset >= selMin && offset <= selMax;
  }, [selMin, selMax]);

  // ── Navigation ──
  const navigateToOffset = useCallback((offset: number) => {
    dispatch({ type: 'NAVIGATE_TO', offset, maxScroll });
  }, [maxScroll]);

  // ── Edit operations ──
  const applyEdit = useCallback((offset: number, newValue: number) => {
    if (offset < 0 || offset >= data.length) return;
    const oldValue = data[offset];
    if (oldValue === newValue) return;
    const edit: HexEdit = { offset, oldValue, newValue };
    data[offset] = newValue;
    dispatch({ type: 'APPLY_EDIT', edits: [edit] });
    onDataChange?.(data);
  }, [data, onDataChange]);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO', data });
    onDataChange?.(data);
  }, [data, onDataChange]);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO', data });
    onDataChange?.(data);
  }, [data, onDataChange]);

  // ── Search ──
  const doSearch = useCallback(() => {
    const hexStr = state.searchHex.replace(/\s/g, '');
    if (hexStr.length === 0 || hexStr.length % 2 !== 0) return;

    const pattern: number[] = [];
    for (let i = 0; i < hexStr.length; i += 2) {
      pattern.push(parseInt(hexStr.substring(i, i + 2), 16));
    }

    const results: number[] = [];
    for (let i = 0; i <= data.length - pattern.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (data[i + j] !== pattern[j]) { match = false; break; }
      }
      if (match) results.push(i);
    }

    dispatch({ type: 'SET_SEARCH_RESULTS', results, index: 0 });
    if (results.length > 0) navigateToOffset(results[0]);
  }, [state.searchHex, data, navigateToOffset]);

  const doReplace = useCallback(() => {
    if (state.searchResults.length === 0) return;
    const replStr = state.replaceHex.replace(/\s/g, '');
    if (replStr.length === 0 || replStr.length % 2 !== 0) return;

    const offset = state.searchResults[state.searchIndex];
    const edits: HexEdit[] = [];
    for (let i = 0; i < replStr.length / 2 && offset + i < data.length; i++) {
      const newVal = parseInt(replStr.substring(i * 2, i * 2 + 2), 16);
      edits.push({ offset: offset + i, oldValue: data[offset + i], newValue: newVal });
      data[offset + i] = newVal;
    }

    dispatch({ type: 'APPLY_EDIT', edits });
    onDataChange?.(data);
    // Re-run search to refresh results
    setTimeout(doSearch, 0);
  }, [state.searchResults, state.searchIndex, state.replaceHex, data, onDataChange, doSearch]);

  // ── Bookmarks ──
  const addBookmark = useCallback(() => {
    const label = `Bookmark ${state.bookmarks.length + 1}`;
    const color = BOOKMARK_COLORS[state.bookmarks.length % BOOKMARK_COLORS.length];
    dispatch({ type: 'ADD_BOOKMARK', bookmark: { offset: state.cursorOffset, label, color } });
  }, [state.cursorOffset, state.bookmarks.length]);

  // ── Copy/Paste ──
  const copySelection = useCallback(async () => {
    if (selMin === null || selMax === null) return;
    const bytes = Array.from(data.slice(selMin, selMax + 1));
    const hexStr = bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    await navigator.clipboard.writeText(hexStr);
  }, [selMin, selMax, data]);

  const pasteAtCursor = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const hexStr = text.replace(/\s/g, '');
      if (hexStr.length % 2 !== 0) return;

      const edits: HexEdit[] = [];
      for (let i = 0; i < hexStr.length / 2 && state.cursorOffset + i < data.length; i++) {
        const newVal = parseInt(hexStr.substring(i * 2, i * 2 + 2), 16);
        edits.push({ offset: state.cursorOffset + i, oldValue: data[state.cursorOffset + i], newValue: newVal });
        data[state.cursorOffset + i] = newVal;
      }

      dispatch({ type: 'APPLY_EDIT', edits });
      onDataChange?.(data);
    } catch { /* clipboard access denied */ }
  }, [state.cursorOffset, data, onDataChange]);

  // ── Map Detection from Selection ──
  const detectMapFromSelection = useCallback(() => {
    if (selMin === null || selMax === null) return;
    const size = selMax - selMin + 1;
    const bytesPerElement = state.mapDetectDataType === 'float32' ? 4 : state.mapDetectDataType === 'uint8' ? 1 : 2;
    const totalElements = Math.floor(size / bytesPerElement);
    if (totalElements < 1) return;

    let rows = state.mapDetectRows;
    let cols = state.mapDetectCols;
    if (rows * cols !== totalElements) {
      for (let r = Math.floor(Math.sqrt(totalElements)); r >= 1; r--) {
        if (totalElements % r === 0) { rows = r; cols = totalElements / r; break; }
      }
    }

    const values: number[][] = [];
    let byteIdx = 0;
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const off = selMin + byteIdx;
        let val = 0;
        if (state.mapDetectDataType === 'uint8') {
          val = data[off]; byteIdx += 1;
        } else if (state.mapDetectDataType === 'uint16') {
          val = state.endianness === 'LE' ? data[off] | (data[off + 1] << 8) : (data[off] << 8) | data[off + 1];
          byteIdx += 2;
        } else if (state.mapDetectDataType === 'int16') {
          val = state.endianness === 'LE' ? data[off] | (data[off + 1] << 8) : (data[off] << 8) | data[off + 1];
          if (val > 32767) val -= 65536;
          byteIdx += 2;
        } else if (state.mapDetectDataType === 'float32') {
          const buf = new ArrayBuffer(4);
          const view = new DataView(buf);
          for (let i = 0; i < 4; i++) view.setUint8(i, data[off + i]);
          val = state.endianness === 'LE' ? view.getFloat32(0, true) : view.getFloat32(0, false);
          byteIdx += 4;
        }
        row.push(val);
      }
      values.push(row);
    }

    const flatValues = values.flat();
    const detectedMap: Partial<CalibrationMap> = {
      name: `UserDefined_0x${(selMin + baseAddress).toString(16).toUpperCase()}`,
      type: rows > 1 ? 'MAP' : 'CURVE',
      address: selMin + baseAddress,
      category: 'User Defined',
      description: `User-defined map at 0x${(selMin + baseAddress).toString(16).toUpperCase()}, ${rows}x${cols} ${state.mapDetectDataType}`,
      rawValues: flatValues,
      physValues: flatValues,
      rows,
      cols,
      axisXValues: Array.from({ length: cols }, (_, i) => i),
      axisYValues: rows > 1 ? Array.from({ length: rows }, (_, i) => i) : undefined,
    };

    onMapDetected?.(detectedMap);
    dispatch({ type: 'TOGGLE_MAP_DETECT' });
  }, [selMin, selMax, state.mapDetectRows, state.mapDetectCols, state.mapDetectDataType, state.endianness, data, baseAddress, onMapDetected]);

  // ── Scroll handling ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * 3;
    dispatch({ type: 'SET_SCROLL', offset: Math.max(0, Math.min(state.scrollOffset + delta, maxScroll)) });
  }, [state.scrollOffset, maxScroll]);

  // ── Mouse handlers ──
  const handleByteMouseDown = useCallback((offset: number, e: React.MouseEvent) => {
    if (e.shiftKey && state.selectionStart !== null) {
      dispatch({ type: 'SET_SELECTION', start: state.selectionStart, end: offset });
    } else {
      dispatch({ type: 'SET_SELECTION', start: offset, end: offset });
      dispatch({ type: 'SET_SELECTING', value: true });
    }
    dispatch({ type: 'SET_CURSOR', offset });
  }, [state.selectionStart]);

  const handleByteMouseEnter = useCallback((offset: number) => {
    if (state.isSelecting) {
      dispatch({ type: 'SET_SELECTION', start: state.selectionStart, end: offset });
    }
  }, [state.isSelecting, state.selectionStart]);

  const handleMouseUp = useCallback(() => {
    dispatch({ type: 'SET_SELECTING', value: false });
  }, []);

  const setAsciiMode = useCallback(() => {
    dispatch({ type: 'SET_EDIT_MODE', mode: 'ascii' });
  }, []);

  // ── Keyboard handling ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'c') { e.preventDefault(); copySelection(); return; }
      if (e.key === 'v') { e.preventDefault(); pasteAtCursor(); return; }
      if (e.key === 'f') { e.preventDefault(); dispatch({ type: 'TOGGLE_SEARCH' }); return; }
      if (e.key === 'g') { e.preventDefault(); dispatch({ type: 'TOGGLE_GOTO' }); return; }
      if (e.key === 'b') { e.preventDefault(); addBookmark(); return; }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: Math.max(0, state.cursorOffset - 1) });
        break;
      case 'ArrowRight':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: Math.min(data.length - 1, state.cursorOffset + 1) });
        break;
      case 'ArrowUp':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: Math.max(0, state.cursorOffset - BYTES_PER_ROW) });
        break;
      case 'ArrowDown':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: Math.min(data.length - 1, state.cursorOffset + BYTES_PER_ROW) });
        break;
      case 'Home':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: state.cursorOffset - (state.cursorOffset % BYTES_PER_ROW) });
        break;
      case 'End':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: Math.min(data.length - 1, state.cursorOffset - (state.cursorOffset % BYTES_PER_ROW) + BYTES_PER_ROW - 1) });
        break;
      case 'PageUp':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: Math.max(0, state.cursorOffset - BYTES_PER_ROW * VISIBLE_ROWS) });
        dispatch({ type: 'SET_SCROLL', offset: Math.max(0, state.scrollOffset - VISIBLE_ROWS) });
        break;
      case 'PageDown':
        e.preventDefault();
        dispatch({ type: 'SET_CURSOR', offset: Math.min(data.length - 1, state.cursorOffset + BYTES_PER_ROW * VISIBLE_ROWS) });
        dispatch({ type: 'SET_SCROLL', offset: Math.min(maxScroll, state.scrollOffset + VISIBLE_ROWS) });
        break;
      case 'Escape':
        dispatch({ type: 'CLEAR_OVERLAYS' });
        break;
      default:
        // Hex input
        if (state.editMode === 'hex' && /^[0-9a-fA-F]$/.test(e.key)) {
          e.preventDefault();
          const nibbleVal = parseInt(e.key, 16);
          const current = data[state.cursorOffset];
          let newVal: number;
          if (state.editNibble === 'high') {
            newVal = (nibbleVal << 4) | (current & 0x0F);
            dispatch({ type: 'SET_EDIT_NIBBLE', nibble: 'low' });
          } else {
            newVal = (current & 0xF0) | nibbleVal;
            dispatch({ type: 'SET_EDIT_NIBBLE', nibble: 'high' });
            dispatch({ type: 'SET_CURSOR', offset: Math.min(data.length - 1, state.cursorOffset + 1) });
          }
          applyEdit(state.cursorOffset, newVal);
        }
        // ASCII input
        else if (state.editMode === 'ascii' && e.key.length === 1 && e.key.charCodeAt(0) >= 32 && e.key.charCodeAt(0) <= 126) {
          e.preventDefault();
          applyEdit(state.cursorOffset, e.key.charCodeAt(0));
          dispatch({ type: 'SET_CURSOR', offset: Math.min(data.length - 1, state.cursorOffset + 1) });
        }
        break;
    }
  }, [state.editMode, state.editNibble, state.cursorOffset, state.scrollOffset, data, maxScroll, applyEdit, undo, redo, copySelection, pasteAtCursor, addBookmark]);

  // ── Go To Address ──
  const handleGoTo = useCallback(() => {
    const addr = parseInt(state.goToAddress.replace(/^0x/i, ''), 16);
    if (!isNaN(addr)) {
      const offset = addr - baseAddress;
      if (offset >= 0 && offset < data.length) navigateToOffset(offset);
    }
    dispatch({ type: 'TOGGLE_GOTO' });
  }, [state.goToAddress, baseAddress, data.length, navigateToOffset]);

  // Keep cursor in view
  useEffect(() => {
    const cursorRow = Math.floor(state.cursorOffset / BYTES_PER_ROW);
    if (cursorRow < state.scrollOffset) dispatch({ type: 'SET_SCROLL', offset: cursorRow });
    else if (cursorRow >= state.scrollOffset + VISIBLE_ROWS) dispatch({ type: 'SET_SCROLL', offset: cursorRow - VISIBLE_ROWS + 1 });
  }, [state.cursorOffset, state.scrollOffset]);

  // ── Visible rows (virtualized) ──
  const visibleRows = useMemo(() => {
    const rows: { offset: number; bytes: number[] }[] = [];
    for (let r = 0; r < VISIBLE_ROWS && (state.scrollOffset + r) < totalRows; r++) {
      const rowOffset = (state.scrollOffset + r) * BYTES_PER_ROW;
      const bytes: number[] = [];
      for (let c = 0; c < BYTES_PER_ROW && rowOffset + c < data.length; c++) {
        bytes.push(data[rowOffset + c]);
      }
      rows.push({ offset: rowOffset, bytes });
    }
    return rows;
  }, [state.scrollOffset, totalRows, data, state.modifiedBytes]); // eslint-disable-line

  // ── Value preview at cursor ──
  const cursorPreview = useMemo(() => {
    if (state.cursorOffset >= data.length) return null;
    const u8 = data[state.cursorOffset];
    const i8 = u8 > 127 ? u8 - 256 : u8;

    let u16 = 0, i16 = 0, u32 = 0, f32 = 0;
    if (state.cursorOffset + 1 < data.length) {
      u16 = state.endianness === 'LE'
        ? data[state.cursorOffset] | (data[state.cursorOffset + 1] << 8)
        : (data[state.cursorOffset] << 8) | data[state.cursorOffset + 1];
      i16 = u16 > 32767 ? u16 - 65536 : u16;
    }
    if (state.cursorOffset + 3 < data.length) {
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      for (let i = 0; i < 4; i++) view.setUint8(i, data[state.cursorOffset + i]);
      u32 = state.endianness === 'LE' ? view.getUint32(0, true) : view.getUint32(0, false);
      f32 = state.endianness === 'LE' ? view.getFloat32(0, true) : view.getFloat32(0, false);
    }

    return { u8, i8, u16, i16, u32, f32 };
  }, [state.cursorOffset, data, state.endianness, state.modifiedBytes]); // eslint-disable-line

  // ── Search navigation helpers ──
  const searchNext = useCallback(() => {
    if (state.searchResults.length === 0) return;
    const next = (state.searchIndex + 1) % state.searchResults.length;
    dispatch({ type: 'SET_SEARCH_INDEX', index: next });
    navigateToOffset(state.searchResults[next]);
  }, [state.searchResults, state.searchIndex, navigateToOffset]);

  const searchPrev = useCallback(() => {
    if (state.searchResults.length === 0) return;
    const prev = (state.searchIndex - 1 + state.searchResults.length) % state.searchResults.length;
    dispatch({ type: 'SET_SEARCH_INDEX', index: prev });
    navigateToOffset(state.searchResults[prev]);
  }, [state.searchResults, state.searchIndex, navigateToOffset]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full bg-[#0a0a0a] text-gray-300 select-none"
      onMouseUp={handleMouseUp}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      ref={containerRef}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#111] border-b border-gray-800 flex-wrap">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => dispatch({ type: 'TOGGLE_GOTO' })}>
          <MapPin className="w-3 h-3 mr-1" /> Go To
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => dispatch({ type: 'TOGGLE_SEARCH' })}>
          <Search className="w-3 h-3 mr-1" /> Find
        </Button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={undo} disabled={state.undoStack.length === 0}>
          <Undo2 className="w-3 h-3 mr-1" /> Undo
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={redo} disabled={state.redoStack.length === 0}>
          <Redo2 className="w-3 h-3 mr-1" /> Redo
        </Button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={copySelection} disabled={selMin === null}>
          <Copy className="w-3 h-3 mr-1" /> Copy
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={pasteAtCursor}>
          <ClipboardPaste className="w-3 h-3 mr-1" /> Paste
        </Button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={addBookmark}>
          <BookmarkPlus className="w-3 h-3 mr-1" /> Mark
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => dispatch({ type: 'TOGGLE_BOOKMARKS' })}>
          <Bookmark className="w-3 h-3 mr-1" /> {state.bookmarks.length}
        </Button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <Button
          variant="ghost" size="sm" className="h-7 px-2 text-xs"
          onClick={() => dispatch({ type: 'TOGGLE_MAP_DETECT' })}
          disabled={selMin === null}
        >
          <Hash className="w-3 h-3 mr-1" /> Define Map
        </Button>
        <div className="flex-1" />
        {/* Byte grouping */}
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <span>Group:</span>
          {([1, 2, 4] as ByteGrouping[]).map(g => (
            <button
              key={g}
              className={`px-1.5 py-0.5 rounded ${state.byteGrouping === g ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
              onClick={() => dispatch({ type: 'SET_BYTE_GROUPING', grouping: g })}
            >
              {g === 1 ? '8b' : g === 2 ? '16b' : '32b'}
            </button>
          ))}
          <button
            className={`px-1.5 py-0.5 rounded ${state.endianness === 'LE' ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
            onClick={() => dispatch({ type: 'SET_ENDIANNESS', endianness: state.endianness === 'LE' ? 'BE' : 'LE' })}
          >
            {state.endianness}
          </button>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-gray-500 ml-2">
          <span>Edit:</span>
          <button
            className={`px-1.5 py-0.5 rounded ${state.editMode === 'hex' ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
            onClick={() => dispatch({ type: 'SET_EDIT_MODE', mode: 'hex' })}
          >
            HEX
          </button>
          <button
            className={`px-1.5 py-0.5 rounded ${state.editMode === 'ascii' ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
            onClick={() => dispatch({ type: 'SET_EDIT_MODE', mode: 'ascii' })}
          >
            ASCII
          </button>
        </div>
      </div>

      {/* ── Go To Address ── */}
      {state.showGoTo && (
        <div className="flex items-center gap-2 px-2 py-1 bg-[#111] border-b border-gray-800">
          <span className="text-xs text-gray-500">Address:</span>
          <Input
            className="h-6 w-32 text-xs font-mono bg-[#0a0a0a] border-gray-700"
            placeholder="0x00000000"
            value={state.goToAddress}
            onChange={(e) => dispatch({ type: 'SET_GOTO_ADDRESS', value: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGoTo(); }}
            autoFocus
          />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleGoTo}>Go</Button>
        </div>
      )}

      {/* ── Search/Replace ── */}
      {state.showSearch && (
        <div className="flex items-center gap-2 px-2 py-1 bg-[#111] border-b border-gray-800 flex-wrap">
          <Search className="w-3 h-3 text-gray-500" />
          <Input
            className="h-6 w-40 text-xs font-mono bg-[#0a0a0a] border-gray-700"
            placeholder="hex bytes (e.g. FF 00 A5)"
            value={state.searchHex}
            onChange={(e) => dispatch({ type: 'SET_SEARCH_HEX', value: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            autoFocus
          />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={doSearch}>Find</Button>
          {state.searchResults.length > 0 && (
            <>
              <span className="text-[10px] text-gray-500">{state.searchIndex + 1}/{state.searchResults.length}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={searchNext}><ArrowDown className="w-3 h-3" /></Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={searchPrev}><ArrowUp className="w-3 h-3" /></Button>
            </>
          )}
          <div className="w-px h-5 bg-gray-700" />
          <Replace className="w-3 h-3 text-gray-500" />
          <Input
            className="h-6 w-40 text-xs font-mono bg-[#0a0a0a] border-gray-700"
            placeholder="replace with"
            value={state.replaceHex}
            onChange={(e) => dispatch({ type: 'SET_REPLACE_HEX', value: e.target.value })}
          />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={doReplace}>Replace</Button>
        </div>
      )}

      {/* ── Bookmarks ── */}
      {state.showBookmarks && state.bookmarks.length > 0 && (
        <div className="px-2 py-1 bg-[#111] border-b border-gray-800 flex flex-wrap gap-1">
          {state.bookmarks.map((bm, i) => (
            <button
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] hover:bg-gray-800"
              style={{ borderLeft: `3px solid ${bm.color}` }}
              onClick={() => navigateToOffset(bm.offset)}
            >
              0x{(bm.offset + baseAddress).toString(16).toUpperCase()} - {bm.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Map Detection Panel ── */}
      {state.showMapDetect && selMin !== null && (
        <div className="px-2 py-2 bg-[#111] border-b border-gray-800 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Define Map from Selection ({selectionSize} bytes):</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">Type:</span>
            <select
              className="h-6 text-xs bg-[#0a0a0a] border border-gray-700 rounded px-1 text-gray-300"
              value={state.mapDetectDataType}
              onChange={(e) => dispatch({ type: 'SET_MAP_DETECT_TYPE', value: e.target.value as any })}
            >
              <option value="uint8">uint8</option>
              <option value="uint16">uint16</option>
              <option value="int16">int16</option>
              <option value="float32">float32</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">Rows:</span>
            <Input className="h-6 w-12 text-xs bg-[#0a0a0a] border-gray-700" type="number" min={1}
              value={state.mapDetectRows} onChange={(e) => dispatch({ type: 'SET_MAP_DETECT_ROWS', value: parseInt(e.target.value) || 1 })} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">Cols:</span>
            <Input className="h-6 w-12 text-xs bg-[#0a0a0a] border-gray-700" type="number" min={1}
              value={state.mapDetectCols} onChange={(e) => dispatch({ type: 'SET_MAP_DETECT_COLS', value: parseInt(e.target.value) || 1 })} />
          </div>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs border-red-800 text-red-400" onClick={detectMapFromSelection}>
            Create Map
          </Button>
        </div>
      )}

      {/* ── Hex Grid ── */}
      <div
        className="flex-1 overflow-hidden font-mono text-xs"
        onWheel={handleWheel}
        ref={hexAreaRef}
      >
        {/* Column headers */}
        <div className="flex px-2 py-1 bg-[#0d0d0d] border-b border-gray-800 text-gray-600 text-[10px]">
          <span className="w-[90px] shrink-0">OFFSET</span>
          <span className="flex-1">
            {Array.from({ length: BYTES_PER_ROW }, (_, i) =>
              <span key={i} className="inline-block" style={{ minWidth: '20px', textAlign: 'center', padding: '0 1px' }}>
                {i.toString(16).toUpperCase().padStart(2, '0')}
              </span>
            )}
          </span>
          <span className="w-[140px] shrink-0 text-center">ASCII</span>
        </div>

        {/* Data rows */}
        {visibleRows.map(row => (
          <div key={row.offset} className="flex px-2 hover:bg-[#111]" style={{ height: ROW_HEIGHT }}>
            {/* Address */}
            <span
              className="w-[90px] shrink-0 text-gray-600 text-[10px] leading-[22px] cursor-pointer hover:text-red-400"
              onClick={() => navigateToOffset(row.offset)}
            >
              {(row.offset + baseAddress).toString(16).toUpperCase().padStart(8, '0')}
            </span>

            {/* Hex bytes */}
            <span className="flex-1 leading-[22px]">
              {row.bytes.map((byte, i) => {
                const offset = row.offset + i;
                const region = mappedRegions.get(offset);
                const bookmark = state.bookmarks.find(b => b.offset === offset);
                return (
                  <HexByte
                    key={offset}
                    offset={offset}
                    value={byte}
                    isCursor={offset === state.cursorOffset}
                    isSelected={isSelected(offset)}
                    isModified={state.modifiedBytes.has(offset)}
                    isSearchHit={state.searchResults.includes(offset)}
                    regionColor={region?.color || null}
                    regionName={region?.name || null}
                    regionMapIndex={region?.mapIndex ?? null}
                    bookmarkColor={bookmark?.color || null}
                    baseAddress={baseAddress}
                    onMouseDown={handleByteMouseDown}
                    onMouseEnter={handleByteMouseEnter}
                    onNavigateToMap={onNavigateToMap}
                  />
                );
              })}
              {/* Pad if last row is short */}
              {row.bytes.length < BYTES_PER_ROW && Array.from({ length: BYTES_PER_ROW - row.bytes.length }, (_, i) =>
                <span key={`pad-${i}`} className="inline-block" style={{ minWidth: '20px' }}>&nbsp;&nbsp;</span>
              )}
            </span>

            {/* ASCII */}
            <span className="w-[140px] shrink-0 leading-[22px] text-center">
              {row.bytes.map((byte, i) => {
                const offset = row.offset + i;
                return (
                  <AsciiByte
                    key={offset}
                    offset={offset}
                    value={byte}
                    isCursor={offset === state.cursorOffset}
                    isSelected={isSelected(offset)}
                    isModified={state.modifiedBytes.has(offset)}
                    onMouseDown={handleByteMouseDown}
                    onMouseEnter={handleByteMouseEnter}
                    setAsciiMode={setAsciiMode}
                  />
                );
              })}
            </span>
          </div>
        ))}
      </div>

      {/* ── Status Bar ── */}
      <div className="flex items-center gap-4 px-2 py-1 bg-[#111] border-t border-gray-800 text-[10px] text-gray-500">
        <span>
          Cursor: <span className="text-gray-300 font-mono">0x{(state.cursorOffset + baseAddress).toString(16).toUpperCase().padStart(8, '0')}</span>
          {' '}(offset {state.cursorOffset})
        </span>
        {selectionSize > 0 && (
          <span>
            Selection: <span className="text-blue-400">{selectionSize} bytes</span>
            {' '}(0x{(selMin! + baseAddress).toString(16).toUpperCase()} &rarr; 0x{(selMax! + baseAddress).toString(16).toUpperCase()})
          </span>
        )}
        {state.modifiedBytes.size > 0 && (
          <span className="text-green-400">{state.modifiedBytes.size} modified</span>
        )}
        {cursorPreview && (
          <span className="ml-auto">
            u8={cursorPreview.u8} i8={cursorPreview.i8} u16={cursorPreview.u16} i16={cursorPreview.i16} u32={cursorPreview.u32} f32={cursorPreview.f32.toFixed(4)}
          </span>
        )}
        <span className="ml-auto text-gray-600">
          {data.length.toLocaleString()} bytes | {state.editMode.toUpperCase()} mode | {state.endianness}
        </span>
      </div>
    </div>
  );
}
