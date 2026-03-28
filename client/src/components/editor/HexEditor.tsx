/**
 * WinOLS-Style Hex Editor
 * Full byte-level editing with dual-pane hex/ASCII display,
 * selectable regions, go-to-address, find/replace, color-coded A2L regions,
 * bookmarks, undo/redo, and map detection from hex selection.
 */

import { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Replace, Bookmark, BookmarkPlus, Undo2, Redo2,
  MapPin, Copy, ClipboardPaste, ArrowDown, ArrowUp, Hash
} from 'lucide-react';
import type { CalibrationMap, EcuDefinition } from '@/lib/editorEngine';

// ── Types ──
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

// ── Hex Editor Component ──
export default function HexEditor({
  data, ecuDef, alignment, baseAddress = 0, onDataChange, onMapDetected, onNavigateToMap
}: HexEditorProps) {
  // State
  const [scrollOffset, setScrollOffset] = useState(0);
  const [cursorOffset, setCursorOffset] = useState(0);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [editMode, setEditMode] = useState<'hex' | 'ascii'>('hex');
  const [editNibble, setEditNibble] = useState<'high' | 'low'>('high');
  const [showSearch, setShowSearch] = useState(false);
  const [searchHex, setSearchHex] = useState('');
  const [replaceHex, setReplaceHex] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [goToAddress, setGoToAddress] = useState('');
  const [showGoTo, setShowGoTo] = useState(false);
  const [bookmarks, setBookmarks] = useState<HexBookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [undoStack, setUndoStack] = useState<HexEdit[][]>([]);
  const [redoStack, setRedoStack] = useState<HexEdit[][]>([]);
  const [modifiedBytes, setModifiedBytes] = useState<Set<number>>(new Set());
  const [byteGrouping, setByteGrouping] = useState<ByteGrouping>(1);
  const [endianness, setEndianness] = useState<Endianness>('LE');
  const [showMapDetect, setShowMapDetect] = useState(false);
  const [mapDetectRows, setMapDetectRows] = useState(1);
  const [mapDetectCols, setMapDetectCols] = useState(1);
  const [mapDetectDataType, setMapDetectDataType] = useState<'uint8' | 'uint16' | 'int16' | 'float32'>('uint16');

  const containerRef = useRef<HTMLDivElement>(null);
  const hexAreaRef = useRef<HTMLDivElement>(null);

  const totalRows = Math.ceil(data.length / BYTES_PER_ROW);
  const maxScroll = Math.max(0, totalRows - VISIBLE_ROWS);

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

  // ── Selection helpers ──
  const selMin = selectionStart !== null && selectionEnd !== null
    ? Math.min(selectionStart, selectionEnd) : null;
  const selMax = selectionStart !== null && selectionEnd !== null
    ? Math.max(selectionStart, selectionEnd) : null;

  const isSelected = useCallback((offset: number) => {
    if (selMin === null || selMax === null) return false;
    return offset >= selMin && offset <= selMax;
  }, [selMin, selMax]);

  const selectionSize = selMin !== null && selMax !== null ? selMax - selMin + 1 : 0;

  // ── Edit operations ──
  const applyEdit = useCallback((offset: number, newValue: number) => {
    if (offset < 0 || offset >= data.length) return;
    const oldValue = data[offset];
    if (oldValue === newValue) return;

    const edit: HexEdit = { offset, oldValue, newValue };
    data[offset] = newValue;

    setUndoStack(prev => [...prev, [edit]]);
    setRedoStack([]);
    setModifiedBytes(prev => new Set(prev).add(offset));
    onDataChange?.(data);
  }, [data, onDataChange]);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const edits = prev[prev.length - 1];
      for (const edit of edits.reverse()) {
        data[edit.offset] = edit.oldValue;
      }
      setRedoStack(r => [...r, edits]);
      setModifiedBytes(m => {
        const next = new Set(m);
        for (const edit of edits) next.delete(edit.offset);
        return next;
      });
      onDataChange?.(data);
      return prev.slice(0, -1);
    });
  }, [data, onDataChange]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const edits = prev[prev.length - 1];
      for (const edit of edits) {
        data[edit.offset] = edit.newValue;
      }
      setUndoStack(u => [...u, edits]);
      setModifiedBytes(m => {
        const next = new Set(m);
        for (const edit of edits) next.add(edit.offset);
        return next;
      });
      onDataChange?.(data);
      return prev.slice(0, -1);
    });
  }, [data, onDataChange]);

  // ── Search ──
  const doSearch = useCallback(() => {
    const hexStr = searchHex.replace(/\s/g, '');
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

    setSearchResults(results);
    setSearchIndex(0);
    if (results.length > 0) {
      navigateToOffset(results[0]);
    }
  }, [searchHex, data]);

  const doReplace = useCallback(() => {
    if (searchResults.length === 0) return;
    const replStr = replaceHex.replace(/\s/g, '');
    if (replStr.length === 0 || replStr.length % 2 !== 0) return;

    const offset = searchResults[searchIndex];
    const edits: HexEdit[] = [];
    for (let i = 0; i < replStr.length / 2 && offset + i < data.length; i++) {
      const newVal = parseInt(replStr.substring(i * 2, i * 2 + 2), 16);
      edits.push({ offset: offset + i, oldValue: data[offset + i], newValue: newVal });
      data[offset + i] = newVal;
    }

    setUndoStack(prev => [...prev, edits]);
    setRedoStack([]);
    setModifiedBytes(prev => {
      const next = new Set(prev);
      edits.forEach(e => next.add(e.offset));
      return next;
    });
    onDataChange?.(data);
    doSearch(); // refresh results
  }, [searchResults, searchIndex, replaceHex, data, onDataChange, doSearch]);

  // ── Navigation ──
  const navigateToOffset = useCallback((offset: number) => {
    const row = Math.floor(offset / BYTES_PER_ROW);
    const targetScroll = Math.max(0, Math.min(row - Math.floor(VISIBLE_ROWS / 2), maxScroll));
    setScrollOffset(targetScroll);
    setCursorOffset(offset);
  }, [maxScroll]);

  const handleGoTo = useCallback(() => {
    const addr = parseInt(goToAddress.replace(/^0x/i, ''), 16);
    if (!isNaN(addr)) {
      const offset = addr - baseAddress;
      if (offset >= 0 && offset < data.length) {
        navigateToOffset(offset);
      }
    }
    setShowGoTo(false);
  }, [goToAddress, baseAddress, data.length, navigateToOffset]);

  // ── Bookmarks ──
  const addBookmark = useCallback(() => {
    const label = `Bookmark ${bookmarks.length + 1}`;
    const color = BOOKMARK_COLORS[bookmarks.length % BOOKMARK_COLORS.length];
    setBookmarks(prev => [...prev, { offset: cursorOffset, label, color }]);
  }, [cursorOffset, bookmarks.length]);

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
      for (let i = 0; i < hexStr.length / 2 && cursorOffset + i < data.length; i++) {
        const newVal = parseInt(hexStr.substring(i * 2, i * 2 + 2), 16);
        edits.push({ offset: cursorOffset + i, oldValue: data[cursorOffset + i], newValue: newVal });
        data[cursorOffset + i] = newVal;
      }

      setUndoStack(prev => [...prev, edits]);
      setRedoStack([]);
      setModifiedBytes(prev => {
        const next = new Set(prev);
        edits.forEach(e => next.add(e.offset));
        return next;
      });
      onDataChange?.(data);
    } catch { /* clipboard access denied */ }
  }, [cursorOffset, data, onDataChange]);

  // ── Map Detection from Selection ──
  const detectMapFromSelection = useCallback(() => {
    if (selMin === null || selMax === null) return;
    const size = selMax - selMin + 1;
    const bytesPerElement = mapDetectDataType === 'float32' ? 4 : mapDetectDataType === 'uint8' ? 1 : 2;
    const totalElements = Math.floor(size / bytesPerElement);

    if (totalElements < 1) return;

    // Auto-detect rows/cols if not set
    let rows = mapDetectRows;
    let cols = mapDetectCols;
    if (rows * cols !== totalElements) {
      // Try to find best rectangular fit
      for (let r = Math.floor(Math.sqrt(totalElements)); r >= 1; r--) {
        if (totalElements % r === 0) {
          rows = r;
          cols = totalElements / r;
          break;
        }
      }
    }

    const values: number[][] = [];
    let byteIdx = 0;
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      for (let c = 0; c < cols; c++) {
        const off = selMin + byteIdx;
        let val = 0;
        if (mapDetectDataType === 'uint8') {
          val = data[off];
          byteIdx += 1;
        } else if (mapDetectDataType === 'uint16') {
          val = endianness === 'LE'
            ? data[off] | (data[off + 1] << 8)
            : (data[off] << 8) | data[off + 1];
          byteIdx += 2;
        } else if (mapDetectDataType === 'int16') {
          val = endianness === 'LE'
            ? data[off] | (data[off + 1] << 8)
            : (data[off] << 8) | data[off + 1];
          if (val > 32767) val -= 65536;
          byteIdx += 2;
        } else if (mapDetectDataType === 'float32') {
          const buf = new ArrayBuffer(4);
          const view = new DataView(buf);
          for (let i = 0; i < 4; i++) view.setUint8(i, data[off + i]);
          val = endianness === 'LE' ? view.getFloat32(0, true) : view.getFloat32(0, false);
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
      description: `User-defined map at 0x${(selMin + baseAddress).toString(16).toUpperCase()}, ${rows}x${cols} ${mapDetectDataType}`,
      rawValues: flatValues,
      physValues: flatValues,
      rows,
      cols,
      axisXValues: Array.from({ length: cols }, (_, i) => i),
      axisYValues: rows > 1 ? Array.from({ length: rows }, (_, i) => i) : undefined,
    };

    onMapDetected?.(detectedMap);
    setShowMapDetect(false);
  }, [selMin, selMax, mapDetectRows, mapDetectCols, mapDetectDataType, endianness, data, baseAddress, onMapDetected]);

  // ── Scroll handling ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * 3;
    setScrollOffset(prev => Math.max(0, Math.min(prev + delta, maxScroll)));
  }, [maxScroll]);

  // ── Keyboard handling ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'c') { e.preventDefault(); copySelection(); return; }
      if (e.key === 'v') { e.preventDefault(); pasteAtCursor(); return; }
      if (e.key === 'f') { e.preventDefault(); setShowSearch(true); return; }
      if (e.key === 'g') { e.preventDefault(); setShowGoTo(true); return; }
      if (e.key === 'b') { e.preventDefault(); addBookmark(); return; }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setCursorOffset(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setCursorOffset(prev => Math.min(data.length - 1, prev + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setCursorOffset(prev => Math.max(0, prev - BYTES_PER_ROW));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setCursorOffset(prev => Math.min(data.length - 1, prev + BYTES_PER_ROW));
        break;
      case 'Home':
        e.preventDefault();
        setCursorOffset(prev => prev - (prev % BYTES_PER_ROW));
        break;
      case 'End':
        e.preventDefault();
        setCursorOffset(prev => Math.min(data.length - 1, prev - (prev % BYTES_PER_ROW) + BYTES_PER_ROW - 1));
        break;
      case 'PageUp':
        e.preventDefault();
        setCursorOffset(prev => Math.max(0, prev - BYTES_PER_ROW * VISIBLE_ROWS));
        setScrollOffset(prev => Math.max(0, prev - VISIBLE_ROWS));
        break;
      case 'PageDown':
        e.preventDefault();
        setCursorOffset(prev => Math.min(data.length - 1, prev + BYTES_PER_ROW * VISIBLE_ROWS));
        setScrollOffset(prev => Math.min(maxScroll, prev + VISIBLE_ROWS));
        break;
      case 'Escape':
        setSelectionStart(null);
        setSelectionEnd(null);
        setShowSearch(false);
        setShowGoTo(false);
        setShowMapDetect(false);
        break;
      default:
        // Hex input
        if (editMode === 'hex' && /^[0-9a-fA-F]$/.test(e.key)) {
          e.preventDefault();
          const nibbleVal = parseInt(e.key, 16);
          const current = data[cursorOffset];
          let newVal: number;
          if (editNibble === 'high') {
            newVal = (nibbleVal << 4) | (current & 0x0F);
            setEditNibble('low');
          } else {
            newVal = (current & 0xF0) | nibbleVal;
            setEditNibble('high');
            setCursorOffset(prev => Math.min(data.length - 1, prev + 1));
          }
          applyEdit(cursorOffset, newVal);
        }
        // ASCII input
        else if (editMode === 'ascii' && e.key.length === 1 && e.key.charCodeAt(0) >= 32 && e.key.charCodeAt(0) <= 126) {
          e.preventDefault();
          applyEdit(cursorOffset, e.key.charCodeAt(0));
          setCursorOffset(prev => Math.min(data.length - 1, prev + 1));
        }
        break;
    }
  }, [editMode, editNibble, cursorOffset, data, maxScroll, applyEdit, undo, redo, copySelection, pasteAtCursor, addBookmark]);

  // Keep cursor in view
  useEffect(() => {
    const cursorRow = Math.floor(cursorOffset / BYTES_PER_ROW);
    if (cursorRow < scrollOffset) setScrollOffset(cursorRow);
    else if (cursorRow >= scrollOffset + VISIBLE_ROWS) setScrollOffset(cursorRow - VISIBLE_ROWS + 1);
  }, [cursorOffset, scrollOffset]);

  // ── Render visible rows ──
  const visibleRows = useMemo(() => {
    const rows: { offset: number; bytes: number[] }[] = [];
    for (let r = 0; r < VISIBLE_ROWS && (scrollOffset + r) < totalRows; r++) {
      const rowOffset = (scrollOffset + r) * BYTES_PER_ROW;
      const bytes: number[] = [];
      for (let c = 0; c < BYTES_PER_ROW && rowOffset + c < data.length; c++) {
        bytes.push(data[rowOffset + c]);
      }
      rows.push({ offset: rowOffset, bytes });
    }
    return rows;
  }, [scrollOffset, totalRows, data, modifiedBytes]); // eslint-disable-line

  // ── Value preview at cursor ──
  const cursorPreview = useMemo(() => {
    if (cursorOffset >= data.length) return null;
    const u8 = data[cursorOffset];
    const i8 = u8 > 127 ? u8 - 256 : u8;

    let u16 = 0, i16 = 0, u32 = 0, f32 = 0;
    if (cursorOffset + 1 < data.length) {
      u16 = endianness === 'LE'
        ? data[cursorOffset] | (data[cursorOffset + 1] << 8)
        : (data[cursorOffset] << 8) | data[cursorOffset + 1];
      i16 = u16 > 32767 ? u16 - 65536 : u16;
    }
    if (cursorOffset + 3 < data.length) {
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      for (let i = 0; i < 4; i++) view.setUint8(i, data[cursorOffset + i]);
      u32 = endianness === 'LE' ? view.getUint32(0, true) : view.getUint32(0, false);
      f32 = endianness === 'LE' ? view.getFloat32(0, true) : view.getFloat32(0, false);
    }

    return { u8, i8, u16, i16, u32, f32 };
  }, [cursorOffset, data, endianness, modifiedBytes]); // eslint-disable-line

  // ── Mouse handlers ──
  const handleByteMouseDown = useCallback((offset: number, e: React.MouseEvent) => {
    if (e.shiftKey && selectionStart !== null) {
      setSelectionEnd(offset);
    } else {
      setSelectionStart(offset);
      setSelectionEnd(offset);
      setIsSelecting(true);
    }
    setCursorOffset(offset);
    setEditNibble('high');
  }, [selectionStart]);

  const handleByteMouseEnter = useCallback((offset: number) => {
    if (isSelecting) {
      setSelectionEnd(offset);
    }
  }, [isSelecting]);

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
  }, []);

  // ── Render a single byte cell ──
  const renderByte = useCallback((offset: number, value: number) => {
    const isCursor = offset === cursorOffset;
    const isSel = isSelected(offset);
    const isMod = modifiedBytes.has(offset);
    const region = mappedRegions.get(offset);
    const isSearchHit = searchResults.includes(offset);
    const bookmark = bookmarks.find(b => b.offset === offset);

    let bg = 'transparent';
    if (isCursor) bg = 'rgba(239,68,68,0.6)';
    else if (isSel) bg = 'rgba(59,130,246,0.35)';
    else if (isSearchHit) bg = 'rgba(245,158,11,0.4)';
    else if (region) bg = region.color;

    let textColor = '#9ca3af'; // default gray
    if (isMod) textColor = '#22c55e'; // green for modified
    if (value === 0x00) textColor = '#4b5563'; // dim for zero
    if (value === 0xFF) textColor = '#f59e0b'; // amber for FF

    const borderLeft = bookmark ? `2px solid ${bookmark.color}` : undefined;

    return (
      <span
        key={offset}
        className="inline-block cursor-pointer select-none font-mono text-xs leading-[22px] px-[1px]"
        style={{ background: bg, color: textColor, borderLeft, minWidth: '20px', textAlign: 'center' }}
        onMouseDown={(e) => handleByteMouseDown(offset, e)}
        onMouseEnter={() => handleByteMouseEnter(offset)}
        onDoubleClick={() => {
          if (region && onNavigateToMap) onNavigateToMap(region.mapIndex);
        }}
        title={region ? `${region.name} (double-click to open)` : `0x${(offset + baseAddress).toString(16).toUpperCase()}`}
      >
        {value.toString(16).padStart(2, '0').toUpperCase()}
      </span>
    );
  }, [cursorOffset, isSelected, modifiedBytes, mappedRegions, searchResults, bookmarks, baseAddress, handleByteMouseDown, handleByteMouseEnter, onNavigateToMap]);

  // ── Render ASCII character ──
  const renderAscii = useCallback((offset: number, value: number) => {
    const isCursor = offset === cursorOffset;
    const isSel = isSelected(offset);
    const isMod = modifiedBytes.has(offset);
    const ch = value >= 32 && value <= 126 ? String.fromCharCode(value) : '.';

    let bg = 'transparent';
    if (isCursor) bg = 'rgba(239,68,68,0.6)';
    else if (isSel) bg = 'rgba(59,130,246,0.35)';

    return (
      <span
        key={offset}
        className="inline-block cursor-pointer select-none font-mono text-xs leading-[22px]"
        style={{ background: bg, color: isMod ? '#22c55e' : '#6b7280', minWidth: '8px', textAlign: 'center' }}
        onMouseDown={(e) => { setEditMode('ascii'); handleByteMouseDown(offset, e); }}
        onMouseEnter={() => handleByteMouseEnter(offset)}
      >
        {ch}
      </span>
    );
  }, [cursorOffset, isSelected, modifiedBytes, handleByteMouseDown, handleByteMouseEnter]);

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
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowGoTo(!showGoTo)}>
          <MapPin className="w-3 h-3 mr-1" /> Go To
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowSearch(!showSearch)}>
          <Search className="w-3 h-3 mr-1" /> Find
        </Button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={undo} disabled={undoStack.length === 0}>
          <Undo2 className="w-3 h-3 mr-1" /> Undo
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={redo} disabled={redoStack.length === 0}>
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
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowBookmarks(!showBookmarks)}>
          <Bookmark className="w-3 h-3 mr-1" /> {bookmarks.length}
        </Button>
        <div className="w-px h-5 bg-gray-700 mx-1" />
        <Button
          variant="ghost" size="sm" className="h-7 px-2 text-xs"
          onClick={() => setShowMapDetect(!showMapDetect)}
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
              className={`px-1.5 py-0.5 rounded ${byteGrouping === g ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
              onClick={() => setByteGrouping(g)}
            >
              {g === 1 ? '8b' : g === 2 ? '16b' : '32b'}
            </button>
          ))}
          <button
            className={`px-1.5 py-0.5 rounded ${endianness === 'LE' ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
            onClick={() => setEndianness(endianness === 'LE' ? 'BE' : 'LE')}
          >
            {endianness}
          </button>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-gray-500 ml-2">
          <span>Edit:</span>
          <button
            className={`px-1.5 py-0.5 rounded ${editMode === 'hex' ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
            onClick={() => setEditMode('hex')}
          >
            HEX
          </button>
          <button
            className={`px-1.5 py-0.5 rounded ${editMode === 'ascii' ? 'bg-red-900/50 text-red-400' : 'hover:bg-gray-800'}`}
            onClick={() => setEditMode('ascii')}
          >
            ASCII
          </button>
        </div>
      </div>

      {/* ── Go To Address ── */}
      {showGoTo && (
        <div className="flex items-center gap-2 px-2 py-1 bg-[#111] border-b border-gray-800">
          <span className="text-xs text-gray-500">Address:</span>
          <Input
            className="h-6 w-32 text-xs font-mono bg-[#0a0a0a] border-gray-700"
            placeholder="0x00000000"
            value={goToAddress}
            onChange={(e) => setGoToAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGoTo(); }}
            autoFocus
          />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleGoTo}>Go</Button>
        </div>
      )}

      {/* ── Search/Replace ── */}
      {showSearch && (
        <div className="flex items-center gap-2 px-2 py-1 bg-[#111] border-b border-gray-800 flex-wrap">
          <Search className="w-3 h-3 text-gray-500" />
          <Input
            className="h-6 w-40 text-xs font-mono bg-[#0a0a0a] border-gray-700"
            placeholder="hex bytes (e.g. FF 00 A5)"
            value={searchHex}
            onChange={(e) => setSearchHex(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
            autoFocus
          />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={doSearch}>Find</Button>
          {searchResults.length > 0 && (
            <>
              <span className="text-[10px] text-gray-500">{searchIndex + 1}/{searchResults.length}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                const next = (searchIndex + 1) % searchResults.length;
                setSearchIndex(next);
                navigateToOffset(searchResults[next]);
              }}><ArrowDown className="w-3 h-3" /></Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                const prev = (searchIndex - 1 + searchResults.length) % searchResults.length;
                setSearchIndex(prev);
                navigateToOffset(searchResults[prev]);
              }}><ArrowUp className="w-3 h-3" /></Button>
            </>
          )}
          <div className="w-px h-5 bg-gray-700" />
          <Replace className="w-3 h-3 text-gray-500" />
          <Input
            className="h-6 w-40 text-xs font-mono bg-[#0a0a0a] border-gray-700"
            placeholder="replace with"
            value={replaceHex}
            onChange={(e) => setReplaceHex(e.target.value)}
          />
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={doReplace}>Replace</Button>
        </div>
      )}

      {/* ── Bookmarks ── */}
      {showBookmarks && bookmarks.length > 0 && (
        <div className="px-2 py-1 bg-[#111] border-b border-gray-800 flex flex-wrap gap-1">
          {bookmarks.map((bm, i) => (
            <button
              key={i}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] hover:bg-gray-800"
              style={{ borderLeft: `3px solid ${bm.color}` }}
              onClick={() => navigateToOffset(bm.offset)}
            >
              0x{(bm.offset + baseAddress).toString(16).toUpperCase()} — {bm.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Map Detection Panel ── */}
      {showMapDetect && selMin !== null && (
        <div className="px-2 py-2 bg-[#111] border-b border-gray-800 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Define Map from Selection ({selectionSize} bytes):</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">Type:</span>
            <select
              className="h-6 text-xs bg-[#0a0a0a] border border-gray-700 rounded px-1 text-gray-300"
              value={mapDetectDataType}
              onChange={(e) => setMapDetectDataType(e.target.value as any)}
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
              value={mapDetectRows} onChange={(e) => setMapDetectRows(parseInt(e.target.value) || 1)} />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">Cols:</span>
            <Input className="h-6 w-12 text-xs bg-[#0a0a0a] border-gray-700" type="number" min={1}
              value={mapDetectCols} onChange={(e) => setMapDetectCols(parseInt(e.target.value) || 1)} />
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
              {row.bytes.map((byte, i) => renderByte(row.offset + i, byte))}
              {/* Pad if last row is short */}
              {row.bytes.length < BYTES_PER_ROW && Array.from({ length: BYTES_PER_ROW - row.bytes.length }, (_, i) =>
                <span key={`pad-${i}`} className="inline-block" style={{ minWidth: '20px' }}>&nbsp;&nbsp;</span>
              )}
            </span>

            {/* ASCII */}
            <span className="w-[140px] shrink-0 leading-[22px] text-center">
              {row.bytes.map((byte, i) => renderAscii(row.offset + i, byte))}
            </span>
          </div>
        ))}
      </div>

      {/* ── Status Bar ── */}
      <div className="flex items-center gap-4 px-2 py-1 bg-[#111] border-t border-gray-800 text-[10px] text-gray-500">
        <span>
          Cursor: <span className="text-gray-300 font-mono">0x{(cursorOffset + baseAddress).toString(16).toUpperCase().padStart(8, '0')}</span>
          {' '}(offset {cursorOffset})
        </span>
        {selectionSize > 0 && (
          <span>
            Selection: <span className="text-blue-400">{selectionSize} bytes</span>
            {' '}(0x{(selMin! + baseAddress).toString(16).toUpperCase()} → 0x{(selMax! + baseAddress).toString(16).toUpperCase()})
          </span>
        )}
        {modifiedBytes.size > 0 && (
          <span className="text-green-400">{modifiedBytes.size} modified</span>
        )}
        {cursorPreview && (
          <span className="ml-auto">
            u8={cursorPreview.u8} i8={cursorPreview.i8} u16={cursorPreview.u16} i16={cursorPreview.i16} u32={cursorPreview.u32} f32={cursorPreview.f32.toFixed(4)}
          </span>
        )}
        <span className="ml-auto text-gray-600">
          {data.length.toLocaleString()} bytes | {editMode.toUpperCase()} mode | {endianness}
        </span>
      </div>
    </div>
  );
}
