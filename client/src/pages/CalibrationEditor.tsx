/**
 * CalibrationEditor — Professional ECU Calibration Editor
 *
 * EFILive-style calibration editor with:
 *  - A2L / CSV definition loading
 *  - Binary file loading with auto-offset alignment
 *  - Map tree browser (searchable, categorized)
 *  - 2D table editor with color-coded cells
 *  - 3D surface visualization
 *  - Hex view (from existing BinaryUploadPanel)
 *  - Erika AI calibration assistant
 *  - File export (download modified binary)
 *  - Side-by-side compare (stock vs modified)
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload, FileDown, Sparkles, FolderOpen, Binary, Table2, AlertCircle,
  CheckCircle, Loader2, Settings2, RotateCcw, Save, FileText, HardDrive,
  ChevronLeft, ChevronRight, Diff, Cpu, Info
} from 'lucide-react';
import {
  parseA2LForEditor, parseCumminsCSV, extractBinaryData, alignOffsets,
  populateMapValues, EcuDefinition, CalibrationMap, AlignmentResult,
  physicalToRaw, resolveDataType, writeValue, readValue, rawToPhysical
} from '@/lib/editorEngine';
import MapTreeBrowser from '@/components/editor/MapTreeBrowser';
import MapDetailPanel from '@/components/editor/MapDetailPanel';
import ErikaChat from '@/components/editor/ErikaChat';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

const PPEI_LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/PPEI Logo _b0d26c0f.png';

export default function CalibrationEditor() {
  // ── State ──
  const [ecuDef, setEcuDef] = useState<EcuDefinition | null>(null);
  const [binaryData, setBinaryData] = useState<Uint8Array | null>(null);
  const [binaryFileName, setBinaryFileName] = useState<string>('');
  const [binaryFormat, setBinaryFormat] = useState<string>('');
  const [binaryBaseAddress, setBinaryBaseAddress] = useState<number>(0);
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
  const [selectedMapIndex, setSelectedMapIndex] = useState<number | null>(null);
  const [modifiedMaps, setModifiedMaps] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showErika, setShowErika] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('maps');
  const [hexViewOffset, setHexViewOffset] = useState(0);

  const a2lInputRef = useRef<HTMLInputElement>(null);
  const binInputRef = useRef<HTMLInputElement>(null);

  const storeA2LMutation = trpc.editor.storeA2L.useMutation();

  const selectedMap = useMemo(() => {
    if (ecuDef && selectedMapIndex !== null && selectedMapIndex < ecuDef.maps.length) {
      return ecuDef.maps[selectedMapIndex];
    }
    return null;
  }, [ecuDef, selectedMapIndex]);

  // ── A2L / CSV Loading ──
  const handleDefinitionLoad = useCallback(async (file: File) => {
    setIsLoading(true);
    setLoadingMessage(`Parsing ${file.name}...`);

    try {
      const text = await file.text();
      let def: EcuDefinition;

      if (file.name.toLowerCase().endsWith('.csv')) {
        def = parseCumminsCSV(text, file.name);
      } else {
        def = parseA2LForEditor(text, file.name);
      }

      setEcuDef(def);
      setSelectedMapIndex(null);
      setModifiedMaps(new Set());

      toast.success('Definition Loaded', { description: `${def.ecuFamily}: ${def.stats.totalMaps} maps, ${def.stats.totalMeasurements} measurements (${def.parseTime.toFixed(0)}ms)` });

      // If binary is already loaded, try alignment
      if (binaryData) {
        setLoadingMessage('Aligning offsets...');
        const align = alignOffsets(def, binaryData, binaryBaseAddress);
        setAlignment(align);

        if (align.confidence > 0.3) {
          setLoadingMessage('Populating map values...');
          for (const map of def.maps) {
            populateMapValues(map, def, binaryData, align.offset);
          }
          setEcuDef({ ...def }); // trigger re-render
          toast.success('Offset Alignment', { description: `Aligned with ${(align.confidence * 100).toFixed(0)}% confidence (${align.method})` });
        }
      }

      // Store A2L to S3 for future matching
      if (def.source === 'a2l') {
        try {
          await storeA2LMutation.mutateAsync({
            fileName: file.name,
            ecuFamily: def.ecuFamily,
            content: text,
            mapCount: def.stats.totalMaps,
            measurementCount: def.stats.totalMeasurements,
          });
        } catch {
          // Non-critical
          console.warn('Failed to store A2L to S3');
        }
      }
    } catch (err: any) {
      toast.error('Parse Error', { description: err.message || 'Failed to parse definition file' });
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [binaryData, binaryBaseAddress, toast, storeA2LMutation]);

  // ── Binary Loading ──
  const handleBinaryLoad = useCallback(async (file: File) => {
    setIsLoading(true);
    setLoadingMessage(`Loading ${file.name}...`);

    try {
      const buffer = await file.arrayBuffer();

      // Try to read as text for S-Record/Intel HEX detection
      let textContent: string | undefined;
      try {
        const text = await file.text();
        if (text.startsWith('S0') || text.startsWith('S2') || text.startsWith('S3') || text.startsWith(':')) {
          textContent = text;
        }
      } catch { /* not text */ }

      const { data, baseAddress, format } = extractBinaryData(buffer, file.name, textContent);
      setBinaryData(data);
      setBinaryFileName(file.name);
      setBinaryFormat(format);
      setBinaryBaseAddress(baseAddress);

      toast.success('Binary Loaded', { description: `${file.name}: ${(data.length / 1024).toFixed(1)} KB (${format}${baseAddress > 0 ? `, base: 0x${baseAddress.toString(16).toUpperCase()}` : ''})` });

      // If definition is loaded, try alignment
      if (ecuDef) {
        setLoadingMessage('Aligning offsets...');
        const align = alignOffsets(ecuDef, data, baseAddress);
        setAlignment(align);

        if (align.confidence > 0.3) {
          setLoadingMessage('Populating map values...');
          for (const map of ecuDef.maps) {
            populateMapValues(map, ecuDef, data, align.offset);
          }
          setEcuDef({ ...ecuDef }); // trigger re-render
          toast.success('Offset Alignment', { description: `Aligned with ${(align.confidence * 100).toFixed(0)}% confidence (${align.method})` });
        } else {
          toast.error('Alignment Warning', { description: `Low confidence alignment (${(align.confidence * 100).toFixed(0)}%). Offsets may need manual adjustment.` });
        }
      }
    } catch (err: any) {
      toast.error('Load Error', { description: err.message || 'Failed to load binary file' });
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [ecuDef, toast]);

  // ── Value Changes ──
  const handleValuesChanged = useCallback((mapName: string, newPhysValues: number[]) => {
    if (!ecuDef) return;
    const idx = ecuDef.maps.findIndex(m => m.name === mapName);
    if (idx === -1) return;

    const map = ecuDef.maps[idx];
    map.physValues = newPhysValues;
    map.modified = true;

    // Convert physical values back to raw
    const cm = ecuDef.compuMethods.get(map.compuMethod);
    map.modifiedValues = newPhysValues.map(v => Math.round(physicalToRaw(v, cm)));

    setModifiedMaps(prev => {
      const next = new Set(Array.from(prev));
      next.add(idx);
      return next;
    });
    setEcuDef({ ...ecuDef });
  }, [ecuDef]);

  const handleResetMap = useCallback((mapName: string) => {
    if (!ecuDef || !binaryData || !alignment) return;
    const idx = ecuDef.maps.findIndex(m => m.name === mapName);
    if (idx === -1) return;

    const map = ecuDef.maps[idx];
    populateMapValues(map, ecuDef, binaryData, alignment.offset);
    map.modified = false;
    map.modifiedValues = undefined;

    setModifiedMaps(prev => {
      const next = new Set(Array.from(prev));
      next.delete(idx);
      return next;
    });
    setEcuDef({ ...ecuDef });
  }, [ecuDef, binaryData, alignment]);

  // ── Export Modified Binary ──
  const handleExport = useCallback(() => {
    if (!binaryData || !ecuDef || !alignment) return;

    const exportData = new Uint8Array(binaryData);
    const bigEndian = ecuDef.moduleInfo.byteOrder === 'MSB_FIRST';
    let changesWritten = 0;

    for (const idx of Array.from(modifiedMaps)) {
      const map = ecuDef.maps[idx];
      if (!map.modifiedValues) continue;

      const dt = resolveDataType(map.recordLayout, ecuDef.recordLayouts);
      const binAddr = map.address + alignment.offset;

      for (let i = 0; i < map.modifiedValues.length; i++) {
        const offset = binAddr + i * dt.size;
        if (offset >= 0 && offset + dt.size <= exportData.length) {
          writeValue(exportData, offset, map.modifiedValues[i], dt, bigEndian);
          changesWritten++;
        }
      }
    }

    // Create download
    const blob = new Blob([exportData], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = binaryFileName.replace(/(\.[^.]+)$/, '_modified$1') || 'modified.bin';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Binary Exported', { description: `${changesWritten} values written to ${a.download}` });
  }, [binaryData, ecuDef, alignment, modifiedMaps, binaryFileName, toast]);

  // ── Hex View ──
  const hexViewContent = useMemo(() => {
    if (!binaryData) return null;
    const start = hexViewOffset;
    const end = Math.min(start + 512, binaryData.length);
    const lines: string[] = [];

    for (let i = start; i < end; i += 16) {
      const addr = i.toString(16).toUpperCase().padStart(8, '0');
      const hexParts: string[] = [];
      let ascii = '';

      for (let j = 0; j < 16; j++) {
        if (i + j < binaryData.length) {
          hexParts.push(binaryData[i + j].toString(16).toUpperCase().padStart(2, '0'));
          const b = binaryData[i + j];
          ascii += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
        } else {
          hexParts.push('  ');
          ascii += ' ';
        }
      }

      lines.push(`${addr}  ${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}  |${ascii}|`);
    }

    return lines.join('\n');
  }, [binaryData, hexViewOffset]);

  // ── File drop handlers ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.a2l') || name.endsWith('.csv')) {
        handleDefinitionLoad(file);
      } else {
        handleBinaryLoad(file);
      }
    }
  }, [handleDefinitionLoad, handleBinaryLoad]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // ── Render ──
  return (
    <div
      className="flex flex-col h-full bg-zinc-950 text-white"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0 bg-zinc-900/80">
        <img src={PPEI_LOGO_URL} alt="PPEI" className="h-5 w-5 rounded" />
        <span className="text-xs font-bold text-white tracking-wider">CALIBRATION EDITOR</span>

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* File buttons */}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5 border-zinc-700 bg-transparent hover:bg-zinc-800"
          onClick={() => a2lInputRef.current?.click()}
        >
          <FileText className="w-3.5 h-3.5" />
          Load A2L/CSV
        </Button>
        <input
          ref={a2lInputRef}
          type="file"
          accept=".a2l,.csv,.A2L,.CSV"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleDefinitionLoad(file);
            e.target.value = '';
          }}
        />

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5 border-zinc-700 bg-transparent hover:bg-zinc-800"
          onClick={() => binInputRef.current?.click()}
        >
          <HardDrive className="w-3.5 h-3.5" />
          Load Binary
        </Button>
        <input
          ref={binInputRef}
          type="file"
          accept=".bin,.ptp,.srec,.hex,.s19,.s28,.s37,.ihex,.BIN,.PTP,.SREC,.HEX"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleBinaryLoad(file);
            e.target.value = '';
          }}
        />

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* Status indicators */}
        {ecuDef && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span className="text-zinc-400">{ecuDef.ecuFamily}</span>
            <span className="text-zinc-600">|</span>
            <span className="text-zinc-400">{ecuDef.stats.totalMaps} maps</span>
          </div>
        )}
        {binaryData && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <Binary className="w-3 h-3 text-cyan-500" />
            <span className="text-zinc-400">{(binaryData.length / 1024).toFixed(0)}KB</span>
            <span className="text-zinc-500">({binaryFormat})</span>
          </div>
        )}
        {alignment && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className={`${alignment.confidence > 0.7 ? 'text-emerald-400' : alignment.confidence > 0.3 ? 'text-yellow-400' : 'text-red-400'}`}>
              Align: {(alignment.confidence * 100).toFixed(0)}%
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Right side actions */}
        {modifiedMaps.size > 0 && (
          <span className="text-[10px] text-yellow-400 font-mono">
            {modifiedMaps.size} modified
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5 border-zinc-700 bg-transparent hover:bg-zinc-800"
          onClick={handleExport}
          disabled={!binaryData || modifiedMaps.size === 0}
        >
          <FileDown className="w-3.5 h-3.5" />
          Export
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-[11px] gap-1.5 border-zinc-700 ${showErika ? 'bg-ppei-red/20 text-ppei-red border-ppei-red/30' : 'bg-transparent hover:bg-zinc-800'}`}
          onClick={() => setShowErika(!showErika)}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Erika
        </Button>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ppei-red/10 border-b border-ppei-red/20">
          <Loader2 className="w-3.5 h-3.5 text-ppei-red animate-spin" />
          <span className="text-xs text-ppei-red">{loadingMessage}</span>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Map tree or upload */}
        {leftPanelOpen && (
          <div className="w-72 border-r border-zinc-800 flex flex-col shrink-0">
            {ecuDef ? (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                <TabsList className="shrink-0 mx-2 mt-2">
                  <TabsTrigger value="maps" className="text-[11px]">Maps</TabsTrigger>
                  <TabsTrigger value="hex" className="text-[11px]">Hex</TabsTrigger>
                  <TabsTrigger value="info" className="text-[11px]">Info</TabsTrigger>
                </TabsList>

                <TabsContent value="maps" className="flex-1 overflow-hidden mt-0">
                  <MapTreeBrowser
                    maps={ecuDef.maps}
                    selectedMapIndex={selectedMapIndex}
                    onSelectMap={setSelectedMapIndex}
                    modifiedMaps={modifiedMaps}
                  />
                </TabsContent>

                <TabsContent value="hex" className="flex-1 overflow-hidden mt-0">
                  {binaryData ? (
                    <div className="flex flex-col h-full">
                      <div className="p-2 border-b border-zinc-800 flex items-center gap-2">
                        <input
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-ppei-red/50"
                          placeholder="Go to offset (hex)..."
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const val = parseInt((e.target as HTMLInputElement).value, 16);
                              if (!isNaN(val)) setHexViewOffset(Math.max(0, Math.min(val, binaryData.length - 512)));
                            }
                          }}
                        />
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {hexViewOffset.toString(16).toUpperCase().padStart(8, '0')}
                        </span>
                      </div>
                      <div className="flex-1 overflow-auto p-2">
                        <pre className="text-[10px] font-mono text-zinc-400 leading-relaxed whitespace-pre">
                          {hexViewContent}
                        </pre>
                      </div>
                      <div className="p-2 border-t border-zinc-800 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => setHexViewOffset(Math.max(0, hexViewOffset - 512))}
                          disabled={hexViewOffset === 0}
                        >
                          ← Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => setHexViewOffset(Math.min(binaryData.length - 512, hexViewOffset + 512))}
                          disabled={hexViewOffset >= binaryData.length - 512}
                        >
                          Next →
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-zinc-500">
                      Load a binary file to view hex
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="info" className="flex-1 overflow-auto mt-0 p-3">
                  <div className="space-y-2 text-xs font-mono">
                    <div className="text-zinc-500">ECU Family: <span className="text-white">{ecuDef.ecuFamily}</span></div>
                    <div className="text-zinc-500">Source: <span className="text-zinc-300">{ecuDef.source} ({ecuDef.fileName})</span></div>
                    <div className="text-zinc-500">Module: <span className="text-zinc-300">{ecuDef.moduleInfo.name}</span></div>
                    {ecuDef.moduleInfo.cpuType && (
                      <div className="text-zinc-500">CPU: <span className="text-zinc-300">{ecuDef.moduleInfo.cpuType}</span></div>
                    )}
                    {ecuDef.moduleInfo.byteOrder && (
                      <div className="text-zinc-500">Byte Order: <span className="text-zinc-300">{ecuDef.moduleInfo.byteOrder}</span></div>
                    )}
                    <div className="text-zinc-500">Maps: <span className="text-white">{ecuDef.stats.totalMaps}</span></div>
                    <div className="text-zinc-500">Measurements: <span className="text-white">{ecuDef.stats.totalMeasurements}</span></div>
                    <div className="text-zinc-500">Parse Time: <span className="text-zinc-300">{ecuDef.parseTime.toFixed(0)}ms</span></div>
                    <div className="mt-3 text-zinc-500">Map Types:</div>
                    {Object.entries(ecuDef.stats.mapsByType).map(([type, count]) => (
                      <div key={type} className="pl-3 text-zinc-400">
                        {type}: <span className="text-zinc-300">{count}</span>
                      </div>
                    ))}
                    {alignment && (
                      <>
                        <div className="mt-3 text-zinc-500 border-t border-zinc-800 pt-2">Alignment:</div>
                        <div className="pl-3 text-zinc-400">
                          Method: <span className="text-zinc-300">{alignment.method}</span>
                        </div>
                        <div className="pl-3 text-zinc-400">
                          Confidence: <span className={alignment.confidence > 0.7 ? 'text-emerald-400' : 'text-yellow-400'}>
                            {(alignment.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="pl-3 text-zinc-400">
                          Offset: <span className="text-cyan-400">0x{Math.abs(alignment.offset).toString(16).toUpperCase()}</span>
                        </div>
                        {alignment.anchors.length > 0 && (
                          <>
                            <div className="pl-3 text-zinc-500 mt-1">Anchor points:</div>
                            {alignment.anchors.map((a, i) => (
                              <div key={i} className="pl-6 text-[10px] text-zinc-500">
                                {a.name}: 0x{a.a2lAddr.toString(16).toUpperCase()} → 0x{a.binOffset.toString(16).toUpperCase()}
                              </div>
                            ))}
                          </>
                        )}
                      </>
                    )}
                    {ecuDef.errors.length > 0 && (
                      <>
                        <div className="mt-3 text-red-400">Errors ({ecuDef.errors.length}):</div>
                        {ecuDef.errors.slice(0, 10).map((e, i) => (
                          <div key={i} className="pl-3 text-[10px] text-red-400/70">{e}</div>
                        ))}
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              /* Upload prompt */
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Cpu className="w-10 h-10 text-zinc-600 mb-3" />
                <h3 className="text-sm font-semibold text-zinc-300 mb-1">Load ECU Definition</h3>
                <p className="text-[11px] text-zinc-500 mb-4">
                  Drop an A2L or CSV file here, or use the toolbar buttons above.
                </p>
                <div className="space-y-2 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-[11px] gap-2 border-zinc-700 bg-transparent"
                    onClick={() => a2lInputRef.current?.click()}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Load A2L / CSV Definition
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-[11px] gap-2 border-zinc-700 bg-transparent"
                    onClick={() => binInputRef.current?.click()}
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    Load Binary File
                  </Button>
                </div>
                <div className="mt-4 text-[10px] text-zinc-600 space-y-0.5">
                  <div>Supported definitions: .a2l, .csv (Cummins format)</div>
                  <div>Supported binaries: .bin, .ptp, .srec, .hex, .s19</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Left panel toggle */}
        <button
          className="w-5 flex items-center justify-center border-r border-zinc-800 hover:bg-zinc-800/50 transition-colors shrink-0"
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
        >
          {leftPanelOpen ? (
            <ChevronLeft className="w-3 h-3 text-zinc-500" />
          ) : (
            <ChevronRight className="w-3 h-3 text-zinc-500" />
          )}
        </button>

        {/* Center: Map detail / editor */}
        <div className="flex-1 overflow-hidden">
          {selectedMap ? (
            <MapDetailPanel
              map={selectedMap}
              ecuDef={ecuDef!}
              onValuesChanged={handleValuesChanged}
              onResetMap={handleResetMap}
              readOnly={!binaryData}
            />
          ) : ecuDef ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Table2 className="w-12 h-12 text-zinc-700 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-400 mb-1">Select a Map</h3>
              <p className="text-[11px] text-zinc-500 max-w-md">
                Use the map tree on the left to browse calibration maps by category,
                or search by name. Click a map to view and edit its values.
              </p>
              {!binaryData && (
                <div className="mt-4 flex items-center gap-2 text-[11px] text-yellow-400/70">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Load a binary file to enable value reading and editing</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="relative mb-4">
                <img src={PPEI_LOGO_URL} alt="PPEI" className="w-16 h-16 rounded-lg opacity-30" />
              </div>
              <h2 className="text-lg font-bold text-zinc-400 mb-2 tracking-wider">CALIBRATION EDITOR</h2>
              <p className="text-xs text-zinc-500 max-w-lg mb-6">
                Professional ECU calibration editor. Load an A2L definition file and a matching binary
                to view, edit, and export calibration maps. Supports GM E-series, Bosch MG1C,
                Cummins, and Allison platforms.
              </p>
              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <Card className="p-3 bg-zinc-900/50 border-zinc-800 text-center">
                  <FileText className="w-5 h-5 text-cyan-500 mx-auto mb-1" />
                  <div className="text-[10px] text-zinc-400">A2L / CSV</div>
                  <div className="text-[9px] text-zinc-600">Map definitions</div>
                </Card>
                <Card className="p-3 bg-zinc-900/50 border-zinc-800 text-center">
                  <HardDrive className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                  <div className="text-[10px] text-zinc-400">Binary</div>
                  <div className="text-[9px] text-zinc-600">.bin .ptp .hex .srec</div>
                </Card>
                <Card className="p-3 bg-zinc-900/50 border-zinc-800 text-center">
                  <Table2 className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                  <div className="text-[10px] text-zinc-400">Edit Maps</div>
                  <div className="text-[9px] text-zinc-600">2D tables, 3D surfaces</div>
                </Card>
                <Card className="p-3 bg-zinc-900/50 border-zinc-800 text-center">
                  <Sparkles className="w-5 h-5 text-ppei-red mx-auto mb-1" />
                  <div className="text-[10px] text-zinc-400">Erika AI</div>
                  <div className="text-[9px] text-zinc-600">Calibration assistant</div>
                </Card>
              </div>
              <p className="text-[10px] text-zinc-600 mt-4">
                Drag & drop files anywhere to load
              </p>
            </div>
          )}
        </div>

        {/* Right panel: Erika chat */}
        {showErika && (
          <div className="w-80 shrink-0">
            <ErikaChat
              ecuDef={ecuDef}
              selectedMap={selectedMap}
              onNavigateToMap={(name) => {
                if (!ecuDef) return;
                const idx = ecuDef.maps.findIndex(m => m.name === name);
                if (idx !== -1) setSelectedMapIndex(idx);
              }}
              isOpen={showErika}
              onToggle={() => setShowErika(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
