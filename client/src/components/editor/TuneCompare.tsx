/**
 * TuneCompare — Multi-tune comparison and calibration diff
 * 
 * Features:
 * - Load multiple binary files for side-by-side comparison
 * - Byte-level hex diff with highlighted differences
 * - Calibration diff showing only maps that changed between tunes
 * - Per-map diff with color-coded cells (green=increased, red=decreased)
 * - Diff summary with statistics
 * - Copy values between tunes
 * - Export diff report
 */

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Upload, FileDown, ArrowLeftRight, ChevronDown, ChevronRight,
  Copy, Search, BarChart3, Diff, FileText, X
} from 'lucide-react';
import type { EcuDefinition, CalibrationMap, AlignmentResult } from '@/lib/editorEngine';
import { extractBinaryData, alignOffsets, populateMapValues, readValue, resolveDataType } from '@/lib/editorEngine';

interface TuneFile {
  name: string;
  data: Uint8Array;
  baseAddress: number;
  format: string;
}

interface MapDiff {
  mapIndex: number;
  map: CalibrationMap;
  changedCells: number;
  totalCells: number;
  valuesA: number[];
  valuesB: number[];
  maxIncrease: number;
  maxDecrease: number;
}

interface TuneCompareProps {
  ecuDef: EcuDefinition | null;
  alignment: AlignmentResult | null;
  primaryBinary: Uint8Array | null;
  primaryFileName: string;
}

export default function TuneCompare({ ecuDef, alignment, primaryBinary, primaryFileName }: TuneCompareProps) {
  const [compareBinary, setCompareBinary] = useState<TuneFile | null>(null);
  const [viewMode, setViewMode] = useState<'maps' | 'hex'>('maps');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMaps, setExpandedMaps] = useState<Set<number>>(new Set());
  const [hexPage, setHexPage] = useState(0);

  const BYTES_PER_PAGE = 512;
  const BYTES_PER_ROW = 16;

  // ── Load compare file ──
  const handleCompareLoad = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Try to extract binary data (handles S-Record, Intel HEX, etc.)
    let extracted: Uint8Array;
    let baseAddr = 0;
    let fmt = 'raw';

    try {
      const text = new TextDecoder('ascii', { fatal: true }).decode(bytes.slice(0, 100));
      if (text.startsWith('S0') || text.startsWith('S1') || text.startsWith('S2') || text.startsWith('S3')) {
        const result = extractBinaryData(buffer, file.name, text);
        extracted = result.data;
        baseAddr = result.baseAddress;
        fmt = 'srec';
      } else if (text.startsWith(':')) {
        const result = extractBinaryData(buffer, file.name, text);
        extracted = result.data;
        baseAddr = result.baseAddress;
        fmt = 'ihex';
      } else {
        extracted = bytes;
      }
    } catch {
      extracted = bytes;
    }

    setCompareBinary({
      name: file.name,
      data: extracted,
      baseAddress: baseAddr,
      format: fmt
    });
    setHexPage(0);
  }, []);

  // ── Compute map diffs ──
  const mapDiffs = useMemo((): MapDiff[] => {
    if (!ecuDef || !primaryBinary || !compareBinary || !alignment) return [];

    const diffs: MapDiff[] = [];
    const offsetA = alignment.offset;
    // For compare binary, try same offset
    const offsetB = offsetA;

    ecuDef.maps.forEach((map, idx) => {
      if (map.address === undefined) return;
      const dataType = resolveDataType(map.recordLayout, ecuDef.recordLayouts);
      if (!dataType) return;

      const byteSize = dataType.size;
      const totalCells = (map.rows || 1) * (map.cols || 1);
      if (totalCells < 1 || totalCells > 10000) return;

      const valuesA: number[] = [];
      const valuesB: number[] = [];
      let changedCells = 0;
      let maxIncrease = 0;
      let maxDecrease = 0;

      for (let i = 0; i < totalCells; i++) {
        const addrA = map.address - offsetA + i * byteSize;
        const addrB = map.address - offsetB + i * byteSize;

        if (addrA < 0 || addrA + byteSize > primaryBinary.length) { valuesA.push(0); valuesB.push(0); continue; }
        if (addrB < 0 || addrB + byteSize > compareBinary.data.length) { valuesA.push(0); valuesB.push(0); continue; }

        const isBigEndian = (ecuDef.moduleInfo.byteOrder || 'MSB_LAST') === 'MSB_FIRST';
        const vA = readValue(primaryBinary, addrA, dataType, isBigEndian);
        const vB = readValue(compareBinary.data, addrB, dataType, isBigEndian);

        valuesA.push(vA);
        valuesB.push(vB);

        if (vA !== vB) {
          changedCells++;
          const diff = vB - vA;
          if (diff > maxIncrease) maxIncrease = diff;
          if (diff < maxDecrease) maxDecrease = diff;
        }
      }

      if (changedCells > 0) {
        diffs.push({ mapIndex: idx, map, changedCells, totalCells, valuesA, valuesB, maxIncrease, maxDecrease });
      }
    });

    return diffs;
  }, [ecuDef, primaryBinary, compareBinary, alignment]);

  // ── Compute byte-level diff ──
  const byteDiffs = useMemo(() => {
    if (!primaryBinary || !compareBinary) return { total: 0, positions: new Set<number>() };
    const minLen = Math.min(primaryBinary.length, compareBinary.data.length);
    const positions = new Set<number>();
    for (let i = 0; i < minLen; i++) {
      if (primaryBinary[i] !== compareBinary.data[i]) positions.add(i);
    }
    // Count extra bytes in longer file as diffs
    const maxLen = Math.max(primaryBinary.length, compareBinary.data.length);
    for (let i = minLen; i < maxLen; i++) positions.add(i);
    return { total: positions.size, positions };
  }, [primaryBinary, compareBinary]);

  // ── Filtered diffs ──
  const filteredDiffs = useMemo(() => {
    if (!searchQuery) return mapDiffs;
    const q = searchQuery.toLowerCase();
    return mapDiffs.filter(d =>
      d.map.name.toLowerCase().includes(q) ||
      d.map.category?.toLowerCase().includes(q) ||
      d.map.description?.toLowerCase().includes(q)
    );
  }, [mapDiffs, searchQuery]);

  // ── Export diff report ──
  const exportDiffReport = useCallback(() => {
    if (mapDiffs.length === 0) return;

    let report = `# Calibration Diff Report\n\n`;
    report += `**File A:** ${primaryFileName}\n`;
    report += `**File B:** ${compareBinary?.name || 'Unknown'}\n`;
    report += `**Total byte differences:** ${byteDiffs.total.toLocaleString()}\n`;
    report += `**Maps with changes:** ${mapDiffs.length}\n\n`;
    report += `---\n\n`;

    for (const diff of mapDiffs) {
      report += `## ${diff.map.name}\n`;
      report += `Category: ${diff.map.category || 'Unknown'}\n`;
      report += `Changed cells: ${diff.changedCells}/${diff.totalCells}\n`;
      if (diff.map.description) report += `Description: ${diff.map.description}\n`;
      report += `\n`;

      // Show changed values
      const cols = diff.map.cols || diff.totalCells;
      report += `| Cell | File A | File B | Diff |\n`;
      report += `|------|--------|--------|------|\n`;
      for (let i = 0; i < diff.totalCells; i++) {
        if (diff.valuesA[i] !== diff.valuesB[i]) {
          const d = diff.valuesB[i] - diff.valuesA[i];
          report += `| [${Math.floor(i / cols)},${i % cols}] | ${diff.valuesA[i]} | ${diff.valuesB[i]} | ${d > 0 ? '+' : ''}${d} |\n`;
        }
      }
      report += `\n`;
    }

    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diff_${primaryFileName}_vs_${compareBinary?.name || 'compare'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mapDiffs, byteDiffs, primaryFileName, compareBinary]);

  // ── Toggle expanded map ──
  const toggleExpanded = useCallback((idx: number) => {
    setExpandedMaps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-300">
      {/* ── Header ── */}
      <div className="p-3 border-b border-zinc-800 space-y-2">
        <div className="flex items-center gap-2">
          <Diff className="w-4 h-4 text-red-500" />
          <span className="text-sm font-bold text-white">TUNE COMPARE</span>
        </div>

        <div className="flex items-center gap-2">
          {/* File A */}
          <div className="flex-1 px-2 py-1.5 bg-zinc-900 rounded border border-zinc-800 text-[11px]">
            <span className="text-zinc-500">A:</span>{' '}
            <span className="text-cyan-400 font-mono">{primaryFileName || 'No file loaded'}</span>
            {primaryBinary && (
              <span className="text-zinc-600 ml-1">({(primaryBinary.length / 1024).toFixed(0)} KB)</span>
            )}
          </div>

          <ArrowLeftRight className="w-4 h-4 text-zinc-600 shrink-0" />

          {/* File B */}
          <div className="flex-1">
            {compareBinary ? (
              <div className="flex items-center gap-1 px-2 py-1.5 bg-zinc-900 rounded border border-zinc-800 text-[11px]">
                <span className="text-zinc-500">B:</span>{' '}
                <span className="text-amber-400 font-mono">{compareBinary.name}</span>
                <span className="text-zinc-600 ml-1">({(compareBinary.data.length / 1024).toFixed(0)} KB)</span>
                <button className="ml-auto text-zinc-500 hover:text-red-400" onClick={() => setCompareBinary(null)}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-1 px-2 py-1.5 bg-zinc-900 rounded border border-dashed border-zinc-700 text-[11px] cursor-pointer hover:border-red-800 transition-colors">
                <Upload className="w-3 h-3 text-zinc-500" />
                <span className="text-zinc-500">Load compare file...</span>
                <input type="file" className="hidden" accept=".bin,.ptp,.srec,.hex,.s19,.s28,.s37,.ihex,.BIN,.PTP" onChange={handleCompareLoad} />
              </label>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {compareBinary && (
          <div className="flex items-center gap-4 text-[10px]">
            <span className="text-zinc-500">
              Byte diffs: <span className="text-amber-400 font-mono">{byteDiffs.total.toLocaleString()}</span>
            </span>
            <span className="text-zinc-500">
              Changed maps: <span className="text-red-400 font-mono">{mapDiffs.length}</span>
            </span>
            <span className="text-zinc-500">
              Size A: <span className="text-zinc-400">{primaryBinary?.length.toLocaleString()}</span>
              {' '}B: <span className="text-zinc-400">{compareBinary.data.length.toLocaleString()}</span>
              {primaryBinary && primaryBinary.length !== compareBinary.data.length && (
                <span className="text-yellow-500 ml-1">(size mismatch!)</span>
              )}
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={exportDiffReport} disabled={mapDiffs.length === 0}>
              <FileDown className="w-3 h-3 mr-1" /> Export Report
            </Button>
          </div>
        )}
      </div>

      {/* ── View mode toggle ── */}
      {compareBinary && (
        <div className="flex items-center gap-1 px-3 py-1 border-b border-zinc-800">
          <button
            className={`px-2 py-0.5 rounded text-[10px] ${viewMode === 'maps' ? 'bg-red-900/50 text-red-400' : 'text-zinc-500 hover:bg-zinc-800'}`}
            onClick={() => setViewMode('maps')}
          >
            <BarChart3 className="w-3 h-3 inline mr-1" />Map Diff ({mapDiffs.length})
          </button>
          <button
            className={`px-2 py-0.5 rounded text-[10px] ${viewMode === 'hex' ? 'bg-red-900/50 text-red-400' : 'text-zinc-500 hover:bg-zinc-800'}`}
            onClick={() => setViewMode('hex')}
          >
            <FileText className="w-3 h-3 inline mr-1" />Hex Diff
          </button>
          {viewMode === 'maps' && (
            <div className="flex-1 ml-2">
              <Input
                className="h-6 text-[10px] bg-zinc-900 border-zinc-800 font-mono"
                placeholder="Search changed maps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        {!compareBinary ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
            <ArrowLeftRight className="w-8 h-8" />
            <span className="text-xs">Load a compare file to see differences</span>
            <span className="text-[10px] text-zinc-700">Supports .bin, .ptp, .srec, .hex formats</span>
          </div>
        ) : viewMode === 'maps' ? (
          /* ── Map Diff View ── */
          <div className="divide-y divide-zinc-800/50">
            {filteredDiffs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
                {mapDiffs.length === 0 ? 'No map differences found (files may be identical or no A2L loaded)' : 'No matches for search'}
              </div>
            ) : filteredDiffs.map(diff => {
              const isExpanded = expandedMaps.has(diff.mapIndex);
              const cols = diff.map.cols || diff.totalCells;
              const rows = Math.ceil(diff.totalCells / cols);
              const pctChanged = ((diff.changedCells / diff.totalCells) * 100).toFixed(1);

              return (
                <div key={diff.mapIndex} className="hover:bg-zinc-900/30">
                  {/* Summary row */}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    onClick={() => toggleExpanded(diff.mapIndex)}
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                    <span className="text-[11px] font-mono text-white flex-1 truncate">{diff.map.name}</span>
                    <span className="text-[10px] text-zinc-500">{diff.map.category}</span>
                    <span className="text-[10px] text-amber-400 font-mono">{diff.changedCells}/{diff.totalCells}</span>
                    <span className="text-[10px] text-zinc-600">({pctChanged}%)</span>
                    {diff.maxIncrease > 0 && <span className="text-[10px] text-emerald-500">+{diff.maxIncrease}</span>}
                    {diff.maxDecrease < 0 && <span className="text-[10px] text-red-500">{diff.maxDecrease}</span>}
                  </button>

                  {/* Expanded diff table */}
                  {isExpanded && (
                    <div className="px-3 pb-3 overflow-x-auto">
                      <table className="border-collapse text-[10px] font-mono">
                        <tbody>
                          {Array.from({ length: rows }, (_, r) => (
                            <tr key={r}>
                              <td className="px-1 py-0.5 text-zinc-600 border-r border-zinc-800">{r}</td>
                              {Array.from({ length: cols }, (_, c) => {
                                const i = r * cols + c;
                                if (i >= diff.totalCells) return <td key={c} />;
                                const vA = diff.valuesA[i];
                                const vB = diff.valuesB[i];
                                const changed = vA !== vB;
                                const delta = vB - vA;

                                return (
                                  <td
                                    key={c}
                                    className="px-1.5 py-0.5 text-center border border-zinc-800/30"
                                    style={{
                                      background: changed
                                        ? delta > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'
                                        : 'transparent',
                                      color: changed
                                        ? delta > 0 ? '#4ade80' : '#f87171'
                                        : '#6b7280'
                                    }}
                                    title={changed ? `A: ${vA} → B: ${vB} (${delta > 0 ? '+' : ''}${delta})` : `${vA} (unchanged)`}
                                  >
                                    {changed ? (
                                      <span>
                                        <span className="text-zinc-600 line-through">{vA}</span>
                                        <span className="mx-0.5">→</span>
                                        {vB}
                                      </span>
                                    ) : vA}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Hex Diff View ── */
          <div className="font-mono text-[10px]">
            {/* Column headers */}
            <div className="flex px-2 py-1 bg-[#0d0d0d] border-b border-zinc-800 text-zinc-600 sticky top-0">
              <span className="w-[80px] shrink-0">OFFSET</span>
              <span className="flex-1 text-center text-cyan-800">FILE A</span>
              <span className="w-[20px]" />
              <span className="flex-1 text-center text-amber-800">FILE B</span>
            </div>

            {/* Hex rows */}
            {Array.from({ length: Math.ceil(BYTES_PER_PAGE / BYTES_PER_ROW) }, (_, rowIdx) => {
              const rowOffset = hexPage * BYTES_PER_PAGE + rowIdx * BYTES_PER_ROW;
              if (rowOffset >= (primaryBinary?.length || 0) && rowOffset >= (compareBinary?.data.length || 0)) return null;

              return (
                <div key={rowIdx} className="flex px-2 hover:bg-zinc-900/30" style={{ height: 20 }}>
                  <span className="w-[80px] shrink-0 text-zinc-600 leading-[20px]">
                    {rowOffset.toString(16).toUpperCase().padStart(8, '0')}
                  </span>

                  {/* File A bytes */}
                  <span className="flex-1 leading-[20px]">
                    {Array.from({ length: BYTES_PER_ROW }, (_, i) => {
                      const off = rowOffset + i;
                      if (!primaryBinary || off >= primaryBinary.length) return <span key={i} className="inline-block w-[18px] text-center">  </span>;
                      const isDiff = byteDiffs.positions.has(off);
                      return (
                        <span
                          key={i}
                          className="inline-block w-[18px] text-center"
                          style={{
                            color: isDiff ? '#f87171' : '#6b7280',
                            background: isDiff ? 'rgba(239,68,68,0.15)' : 'transparent',
                            fontWeight: isDiff ? 'bold' : 'normal'
                          }}
                        >
                          {primaryBinary[off].toString(16).padStart(2, '0').toUpperCase()}
                        </span>
                      );
                    })}
                  </span>

                  <span className="w-[20px] text-center text-zinc-800 leading-[20px]">│</span>

                  {/* File B bytes */}
                  <span className="flex-1 leading-[20px]">
                    {Array.from({ length: BYTES_PER_ROW }, (_, i) => {
                      const off = rowOffset + i;
                      if (off >= compareBinary.data.length) return <span key={i} className="inline-block w-[18px] text-center">  </span>;
                      const isDiff = byteDiffs.positions.has(off);
                      return (
                        <span
                          key={i}
                          className="inline-block w-[18px] text-center"
                          style={{
                            color: isDiff ? '#4ade80' : '#6b7280',
                            background: isDiff ? 'rgba(34,197,94,0.15)' : 'transparent',
                            fontWeight: isDiff ? 'bold' : 'normal'
                          }}
                        >
                          {compareBinary.data[off].toString(16).padStart(2, '0').toUpperCase()}
                        </span>
                      );
                    })}
                  </span>
                </div>
              );
            })}

            {/* Pagination */}
            <div className="flex items-center gap-2 p-2 border-t border-zinc-800 sticky bottom-0 bg-[#0a0a0a]">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                onClick={() => setHexPage(p => Math.max(0, p - 1))} disabled={hexPage === 0}>
                ← Prev
              </Button>
              <span className="text-[10px] text-zinc-500">
                Page {hexPage + 1} / {Math.ceil(Math.max(primaryBinary?.length || 0, compareBinary?.data.length || 0) / BYTES_PER_PAGE)}
              </span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                onClick={() => setHexPage(p => p + 1)}
                disabled={hexPage >= Math.ceil(Math.max(primaryBinary?.length || 0, compareBinary?.data.length || 0) / BYTES_PER_PAGE) - 1}>
                Next →
              </Button>
              <div className="flex-1" />
              <span className="text-[10px] text-zinc-600">
                {byteDiffs.total.toLocaleString()} different bytes
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
