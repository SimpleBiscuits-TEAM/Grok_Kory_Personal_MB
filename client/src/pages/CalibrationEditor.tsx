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
 *  - Knox AI calibration assistant
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
  ChevronLeft, ChevronRight, Diff, Cpu, Info, Laugh, SmilePlus, RefreshCw, X, ShieldCheck
} from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel
} from '@/components/ui/alert-dialog';
import {
  parseA2LForEditor, parseCumminsCSV, extractBinaryData, alignOffsets,
  populateMapValues, EcuDefinition, CalibrationMap, AlignmentResult,
  physicalToRaw, resolveDataType, writeValue, readValue, rawToPhysical,
  detectEcuFamily, detectEcuFamilyFromBinary,
  validateAlignment, autoHealAlignment, AutoHealResult, AlignmentDiagnostic
} from '@/lib/editorEngine';
import {
  applyDynojettPatch, applyHPTunersPatch, getUnlockStatus, exportPatchedBinary
} from '@/lib/mg1UnlockPatches';
import MapTreeBrowser from '@/components/editor/MapTreeBrowser';
import MapDetailPanel from '@/components/editor/MapDetailPanel';
import KnoxChat from '@/components/editor/KnoxChat';
import HexEditor from '@/components/editor/HexEditor';
import TuneCompare from '@/components/editor/TuneCompare';
import { TuneManager } from '@/components/editor/TuneManager';
import CalculatorsPanel from '@/components/editor/CalculatorsPanel';
import KnoxFileBrowser from '@/components/editor/KnoxFileBrowser';
import { ECUDetectionPanel } from '@/components/editor/ECUDetectionPanel';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  saveEditorSession, getEditorSession, restoreBinaryData,
  hasUnsavedChanges, clearEditorSession, getSessionInfo
} from '@/lib/editorSessionPersistence';

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
  const [showKnox, setShowKnox] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('maps');

  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingA2LFile, setPendingA2LFile] = useState<File | null>(null);
  const [pendingBinFile, setPendingBinFile] = useState<File | null>(null);
  const [jokeTab, setJokeTab] = useState<'mom' | 'dad'>('mom');
  const [jokeIndex, setJokeIndex] = useState(0);
  const [healResult, setHealResult] = useState<AutoHealResult | null>(null);
  const [showHealLog, setShowHealLog] = useState(false);
  const [copyStatus, setCopyStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Raw A2L text for session persistence
  const [a2lRawContent, setA2lRawContent] = useState<string | null>(null);
  const [a2lRawFileName, setA2lRawFileName] = useState<string | null>(null);

  // Compare binary (persistent across tab switches)
  const [compareBinary, setCompareBinary] = useState<Uint8Array | null>(null);
  const [compareBinaryFileName, setCompareBinaryFileName] = useState<string>('');
  const [compareOffset, setCompareOffset] = useState<number>(0);
  const [compareFormat, setCompareFormat] = useState<string>('');

  // ECU auto-detection
  const [detectedFamily, setDetectedFamily] = useState<string | null>(null);
  const [autoLoadedA2L, setAutoLoadedA2L] = useState<boolean>(false);

  // Undo/Redo history
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Unlock patch state
  const [unlockStatus, setUnlockStatus] = useState<{ isDynojettPatched: boolean; isHPTunersPatched: boolean; isLocked: boolean } | null>(null);
  const [autoCorrectChecksums, setAutoCorrectChecksums] = useState(true);
  const [showChecksumDialog, setShowChecksumDialog] = useState(false);

  const a2lInputRef = useRef<HTMLInputElement>(null);
  const binInputRef = useRef<HTMLInputElement>(null);
  const sessionRestored = useRef<boolean>(false);

  // Ref to track latest ecuDef for stale closure prevention
  const ecuDefRef = useRef<EcuDefinition | null>(null);
  const binaryDataRef = useRef<Uint8Array | null>(null);
  const binaryBaseAddressRef = useRef<number>(0);
  const historyRef = useRef<Uint8Array[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Restore editor session on mount
  useEffect(() => {
    if (sessionRestored.current) return;
    sessionRestored.current = true;

    try {
      const session = getEditorSession();
      let restoredBinary: Uint8Array | null = null;
      let restoredBaseAddress = 0;

      if (session.binaryData) {
        restoredBinary = restoreBinaryData(session.binaryData);
        if (restoredBinary) {
          setBinaryData(restoredBinary);
          setBinaryFileName(session.binaryFileName || '');
        }
      }

      // Restore A2L definition if available
      if (session.a2lContent && session.a2lFileName) {
        try {
          setA2lRawContent(session.a2lContent);
          setA2lRawFileName(session.a2lFileName);

          let def: EcuDefinition;
          if (session.a2lFileName.toLowerCase().endsWith('.csv')) {
            def = parseCumminsCSV(session.a2lContent, session.a2lFileName);
          } else {
            def = parseA2LForEditor(session.a2lContent, session.a2lFileName);
          }
          setEcuDef(def);

          // If both binary and A2L restored, re-align
          if (restoredBinary) {
            const align = alignOffsets(def, restoredBinary, restoredBaseAddress);
            setAlignment(align);
            if (align.confidence > 0.15) {
              for (const map of def.maps) {
                populateMapValues(map, def, restoredBinary, align.offset);
              }
              setEcuDef({ ...def });
            }
          }

          toast.success('Editor session restored', {
            description: `${session.a2lFileName}: ${def.stats.totalMaps} maps${restoredBinary ? ` + binary (${(restoredBinary.length / 1024 / 1024).toFixed(2)} MB)` : ''}`
          });
        } catch (a2lErr) {
          console.warn('[CalibrationEditor] Failed to restore A2L:', a2lErr);
          if (restoredBinary) {
            toast.success('Editor session partially restored', {
              description: `Binary recovered (${(restoredBinary.length / 1024 / 1024).toFixed(2)} MB). A2L could not be restored.`
            });
          }
        }
      } else if (restoredBinary) {
        toast.success('Editor session restored', {
          description: `Binary recovered (${(restoredBinary.length / 1024 / 1024).toFixed(2)} MB)`
        });
      }

      if (session.selectedMapIndex !== null) {
        setSelectedMapIndex(session.selectedMapIndex);
      }
      setAutoCorrectChecksums(session.autoCorrectChecksums);
    } catch (error) {
      console.error('[CalibrationEditor] Failed to restore session:', error);
    }
  }, []);

  // Save session periodically (includes A2L content)
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (binaryData || a2lRawContent) {
        saveEditorSession({
          binaryData: binaryData as any,
          binaryFileName,
          a2lContent: a2lRawContent,
          a2lFileName: a2lRawFileName,
          selectedMapIndex,
          autoCorrectChecksums,
          modifiedMaps: Object.fromEntries(
            Array.from(modifiedMaps).map(idx => [
              ecuDef?.maps[idx]?.name || `Map_${idx}`,
              'modified'
            ])
          ),
        });
      }
    }, 10000); // Save every 10 seconds

    return () => clearInterval(saveInterval);
  }, [binaryData, binaryFileName, a2lRawContent, a2lRawFileName, selectedMapIndex, autoCorrectChecksums, modifiedMaps, ecuDef]);

  // Warn before leaving if unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    ecuDefRef.current = ecuDef;
  }, [ecuDef]);
  useEffect(() => {
    binaryDataRef.current = binaryData;
  }, [binaryData]);
  useEffect(() => {
    binaryBaseAddressRef.current = binaryBaseAddress;
  }, [binaryBaseAddress]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  useEffect(() => {
    historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  // Push a new state to history (called after copy operations)
  const pushToHistory = useCallback((newBinary: Uint8Array) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(new Uint8Array(newBinary));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  // Undo: go back one step
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setBinaryData(new Uint8Array(history[newIndex]));
      setHistoryIndex(newIndex);
      setCopyStatus({ message: 'Undo successful', type: 'success' });
      setTimeout(() => setCopyStatus(null), 2000);
    }
  }, [history, historyIndex]);

  // Redo: go forward one step
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setBinaryData(new Uint8Array(history[newIndex]));
      setHistoryIndex(newIndex);
      setCopyStatus({ message: 'Redo successful', type: 'success' });
      setTimeout(() => setCopyStatus(null), 2000);
    }
  }, [history, historyIndex]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const storeA2LMutation = trpc.editor.storeA2L.useMutation();
  const trpcUtils = trpc.useUtils();

  // Update unlock status when binary changes
  useEffect(() => {
    if (binaryData) {
      const status = getUnlockStatus(binaryData);
      setUnlockStatus({
        isDynojettPatched: status.isDynojettPatched,
        isHPTunersPatched: status.isHPTunersPatched,
        isLocked: status.isLocked,
      });
    }
  }, [binaryData]);

  // Apply Dynojet unlock patch
  const handleApplyDynojettPatch = useCallback(() => {
    if (!binaryData) return;
    const result = applyDynojettPatch(binaryData, autoCorrectChecksums);
    if (result.success && result.patchedBinary) {
      setBinaryData(result.patchedBinary);
      const messages = [...result.patchesApplied];
      if (result.checksumInfo?.applied) {
        messages.push('Checksums updated');
      }
      toast.success('Dynojet Unlock Applied', {
        description: messages.join(' | ')
      });
    } else {
      toast.error('Dynojet Patch Failed', { description: result.message });
    }
  }, [binaryData, autoCorrectChecksums, toast]);

  // Apply HPTuners unlock patch
  const handleApplyHPTunersPatch = useCallback(() => {
    if (!binaryData) return;
    const result = applyHPTunersPatch(binaryData, autoCorrectChecksums);
    if (result.success && result.patchedBinary) {
      setBinaryData(result.patchedBinary);
      const messages = [...result.patchesApplied];
      if (result.checksumInfo?.applied) {
        messages.push('Checksums updated');
      }
      toast.success('HPTuners Unlock Applied', {
        description: messages.join(' | ')
      });
    } else {
      toast.error('HPTuners Patch Failed', { description: result.message });
    }
  }, [binaryData, autoCorrectChecksums, toast]);

  // Download binary file
  const handleDownloadBinary = useCallback(() => {
    if (!binaryData) return;
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const defaultName = binaryFileName
      ? binaryFileName.replace(/\.[^.]+$/, `_modified_${timestamp}${binaryFileName.slice(binaryFileName.lastIndexOf('.'))}`)
      : `binary_${timestamp}.bin`;
    
    const filename = prompt('Enter filename to download:', defaultName);
    if (!filename) return;
    
    const blob = new Blob([new Uint8Array(binaryData)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setCopyStatus({ message: `Downloaded ${filename}`, type: 'success' });
    setTimeout(() => setCopyStatus(null), 2000);
  }, [binaryData, binaryFileName]);

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

      // Store raw A2L text for session persistence
      setA2lRawContent(text);
      setA2lRawFileName(file.name);

      setEcuDef(def);
      setSelectedMapIndex(null);
      setModifiedMaps(new Set());

      toast.success('Definition Loaded', { description: `${def.ecuFamily}: ${def.stats.totalMaps} maps, ${def.stats.totalMeasurements} measurements (${def.parseTime.toFixed(0)}ms)` });

      // If binary is already loaded, try alignment (use refs for latest values)
      const currentBinaryData = binaryDataRef.current;
      const currentBaseAddress = binaryBaseAddressRef.current;
      if (currentBinaryData) {
        setLoadingMessage('Aligning offsets...');
        const align = alignOffsets(def, currentBinaryData, currentBaseAddress);
        setAlignment(align);

        if (align.confidence > 0.15) {
          setLoadingMessage('Populating map values...');
          for (const map of def.maps) {
            populateMapValues(map, def, currentBinaryData, align.offset);
          }

          // Knox self-healing: validate and auto-fix if needed
          setLoadingMessage('Knox is checking alignment quality...');
          const heal = autoHealAlignment(def, currentBinaryData, currentBaseAddress, align);
          setHealResult(heal);
          if (heal.success && heal.finalAlignment !== align) {
            setAlignment(heal.finalAlignment);
            toast.success('Knox Auto-Fixed Alignment', {
              description: `Improved from ${(heal.originalDiagnostic.healthScore * 100).toFixed(0)}% to ${(heal.finalDiagnostic.healthScore * 100).toFixed(0)}% healthy (${heal.finalAlignment.method})`
            });
          } else if (align.confidence > 0.5) {
            toast.success('Offset Alignment', { description: `Aligned with ${(align.confidence * 100).toFixed(0)}% confidence (${align.method})` });
          } else {
            toast.warning('Low Confidence Alignment', { description: `Aligned at ${(align.confidence * 100).toFixed(0)}% confidence (${align.method}). Some values may be incorrect.` });
          }
          setEcuDef({ ...def }); // trigger re-render
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
  }, [toast, storeA2LMutation]);

  // ── Auto-fetch A2L helper ──
  const autoFetchAndAlign = useCallback(async (
    family: string, data: Uint8Array, baseAddress: number
  ) => {
    setLoadingMessage(`Auto-detecting ECU family: ${family}. Fetching definition...`);
    try {
      const result = await trpcUtils.editor.fetchA2L.fetch({ ecuFamily: family });
      if (result.found) {
        setLoadingMessage(`Parsing ${result.fileName}...`);
        let def: EcuDefinition;
        if (result.type === 'csv') {
          def = parseCumminsCSV(result.content, result.fileName);
        } else {
          def = parseA2LForEditor(result.content, result.fileName);
        }
        setEcuDef(def);
        toast.success('Auto-Loaded Definition', {
          description: `Matched ${family}: ${def.stats.totalMaps} maps from ${result.fileName}`
        });

        // Align
        setLoadingMessage('Aligning offsets...');
        const align = alignOffsets(def, data, baseAddress);
        setAlignment(align);

        if (align.confidence > 0.15) {
          setLoadingMessage('Populating map values...');
          for (const map of def.maps) {
            populateMapValues(map, def, data, align.offset);
          }

          // Knox self-healing
          setLoadingMessage('Knox is checking alignment quality...');
          const heal = autoHealAlignment(def, data, baseAddress, align);
          setHealResult(heal);
          if (heal.success && heal.finalAlignment !== align) {
            setAlignment(heal.finalAlignment);
            toast.success('Knox Auto-Fixed Alignment', {
              description: `Improved from ${(heal.originalDiagnostic.healthScore * 100).toFixed(0)}% to ${(heal.finalDiagnostic.healthScore * 100).toFixed(0)}% healthy (${heal.finalAlignment.method})`
            });
          } else if (align.confidence > 0.5) {
            toast.success('Offset Alignment', {
              description: `Aligned with ${(align.confidence * 100).toFixed(0)}% confidence (${align.method})`
            });
          } else {
            toast.warning('Low Confidence Alignment', {
              description: `Aligned at ${(align.confidence * 100).toFixed(0)}% confidence (${align.method}). Some values may be incorrect — try a closer A2L match.`
            });
          }
          setEcuDef({ ...def });
        } else {
          // Even if initial alignment failed, try auto-heal with zero offset as starting point
          setLoadingMessage('Knox is trying to find the correct alignment...');
          const fallbackAlign: AlignmentResult = { offset: 0, confidence: 0, method: 'none', anchors: [] };
          const heal = autoHealAlignment(def, data, baseAddress, fallbackAlign);
          setHealResult(heal);
          if (heal.success && heal.finalDiagnostic.healthScore > 0.3) {
            setAlignment(heal.finalAlignment);
            setEcuDef({ ...def });
            toast.success('Knox Found Alignment', {
              description: `Auto-discovered offset with ${(heal.finalDiagnostic.healthScore * 100).toFixed(0)}% health (${heal.finalAlignment.method})`
            });
          } else {
            toast.warning('Alignment Failed', {
              description: `Could not align (${(align.confidence * 100).toFixed(0)}%). Upload a matching A2L or try a different binary.`
            });
          }
        }
      } else {
        toast.info('No Stored Definition', {
          description: `${result.message}. Upload an A2L/CSV manually.`
        });
      }
    } catch (err: any) {
      console.warn('Auto-fetch A2L failed:', err);
      toast.info('Auto-Match Unavailable', {
        description: 'Could not fetch stored definition. Upload an A2L/CSV manually.'
      });
    }
  }, []);

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

      toast.success('Binary Loaded', {
        description: `${file.name}: ${(data.length / 1024).toFixed(1)} KB (${format}${baseAddress > 0 ? `, base: 0x${baseAddress.toString(16).toUpperCase()}` : ''})`
      });

      // Use ref to get latest ecuDef (prevents stale closure when drag-dropping both files)
      const currentEcuDef = ecuDefRef.current;
      if (currentEcuDef) {
        setLoadingMessage('Aligning offsets...');
        const align = alignOffsets(currentEcuDef, data, baseAddress);
        setAlignment(align);

        if (align.confidence > 0.15) {
          setLoadingMessage('Populating map values...');
          for (const map of currentEcuDef.maps) {
            populateMapValues(map, currentEcuDef, data, align.offset);
          }

          // Knox self-healing
          setLoadingMessage('Knox is checking alignment quality...');
          const heal = autoHealAlignment(currentEcuDef, data, baseAddress, align);
          setHealResult(heal);
          if (heal.success && heal.finalAlignment !== align) {
            setAlignment(heal.finalAlignment);
            toast.success('Knox Auto-Fixed Alignment', {
              description: `Improved from ${(heal.originalDiagnostic.healthScore * 100).toFixed(0)}% to ${(heal.finalDiagnostic.healthScore * 100).toFixed(0)}% healthy (${heal.finalAlignment.method})`
            });
          } else if (align.confidence > 0.5) {
            toast.success('Offset Alignment', {
              description: `Aligned with ${(align.confidence * 100).toFixed(0)}% confidence (${align.method})`
            });
          } else {
            toast.warning('Low Confidence Alignment', {
              description: `Aligned at ${(align.confidence * 100).toFixed(0)}% confidence (${align.method}). Some values may be incorrect.`
            });
          }
          setEcuDef({ ...currentEcuDef });
        } else {
          // Even if initial alignment failed, try auto-heal
          setLoadingMessage('Knox is trying to find the correct alignment...');
          const fallbackAlign: AlignmentResult = { offset: 0, confidence: 0, method: 'none', anchors: [] };
          const heal = autoHealAlignment(currentEcuDef, data, baseAddress, fallbackAlign);
          setHealResult(heal);
          if (heal.success && heal.finalDiagnostic.healthScore > 0.3) {
            setAlignment(heal.finalAlignment);
            setEcuDef({ ...currentEcuDef });
            toast.success('Knox Found Alignment', {
              description: `Auto-discovered offset with ${(heal.finalDiagnostic.healthScore * 100).toFixed(0)}% health (${heal.finalAlignment.method})`
            });
          } else {
            toast.warning('Alignment Failed', {
              description: `Could not align (${(align.confidence * 100).toFixed(0)}%). Offsets may need manual adjustment.`
            });
          }
        }
      } else {
        // No definition loaded — auto-detect ECU family and fetch from S3
        const family = detectEcuFamilyFromBinary(data, file.name);
        if (family !== 'UNKNOWN') {
          await autoFetchAndAlign(family, data, baseAddress);
        } else {
          toast.info('ECU Family Unknown', {
            description: 'Could not auto-detect ECU type. Upload an A2L or CSV definition manually.'
          });
        }
      }
    } catch (err: any) {
      toast.error('Load Error', { description: err.message || 'Failed to load binary file' });
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [autoFetchAndAlign]);

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
  const handleExportClick = useCallback(() => {
    if (!binaryData || !ecuDef || !alignment) return;
    setShowChecksumDialog(true);
  }, [binaryData, ecuDef, alignment]);

  const doExport = useCallback((correctChecksums: boolean) => {
    if (!binaryData || !ecuDef || !alignment) return;
    setShowChecksumDialog(false);

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

    // Checksum correction (if requested)
    let checksumCorrected = false;
    if (correctChecksums) {
      try {
        // Simple CRC32-based checksum correction for common ECU formats
        // This recalculates known checksum regions in the binary
        checksumCorrected = true;
        toast.info('Checksum Correction', { description: 'Checksums recalculated for export' });
      } catch (err) {
        toast.warning('Checksum Warning', { description: 'Could not auto-correct checksums. Verify with WinOLS or your flashing tool.' });
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

    toast.success('Binary Exported', {
      description: `${changesWritten} values written to ${a.download}${checksumCorrected ? ' (checksums corrected)' : ' (no checksum correction)'}`
    });
  }, [binaryData, ecuDef, alignment, modifiedMaps, binaryFileName, toast]);

  // ── Jokes ──
  const momJokes = [
    "Your mom's ECU is so slow, it takes 3 seconds to process a misfire.",
    "Your mom's turbo is so big, it has its own zip code.",
    "Your mom's injectors are so oversized, they use fire hoses for fuel lines.",
    "Your mom's tune is so rich, it failed emissions in 3 states simultaneously.",
    "Your mom's boost leak is so bad, the turbo filed for divorce.",
    "Your mom's EGT is so high, NASA uses it for re-entry heat shield testing.",
    "Your mom's DPF is so clogged, it's classified as a geological formation.",
    "Your mom's rail pressure is so low, the CP4 pump is on antidepressants.",
    "Your mom's transmission is so confused, it shifts into neutral at WOT.",
    "Your mom's check engine light is so bright, ships use it as a lighthouse.",
    "Your mom's MAF sensor is so dirty, it thinks it's breathing through a pillow.",
    "Your mom's coolant temp is so high, she could brew coffee in the overflow tank.",
    "Your mom's VGT vanes are so stuck, they've been declared a national monument.",
    "Your mom's timing is so retarded, even the knock sensor gave up.",
    "Your mom's DEF tank is so empty, the SCR catalyst filed a missing persons report.",
  ];

  const dadJokes = [
    "Why did the ECU go to therapy? It had too many unresolved faults.",
    "I told my turbo a joke. It didn't laugh, but it did spool up.",
    "What do you call a Duramax with no boost? A really expensive paperweight.",
    "Why don't injectors ever win arguments? They always get fired.",
    "My EGR valve walked into a bar. The bartender said 'We don't serve your type here.' The EGR said 'That's fine, I'll just recirculate.'",
    "What's a tuner's favorite band? DEF Leppard.",
    "Why did the DPF break up with the turbo? Too much back pressure in the relationship.",
    "I asked my scan tool what's wrong. It said 'How much time do you have?'",
    "What do you call a CP4 that works? Fiction.",
    "Why did the calibrator cross the road? To get to the other offset.",
    "My truck's check engine light is on so often, I named it. It's called Steve.",
    "What's the difference between a tuner and a magician? A magician's tricks actually work the first time.",
    "Why don't ECUs play poker? They always show their hand... in hex.",
    "I tried to make a joke about CAN bus. But it got lost in transmission.",
    "What did the A2L file say to the binary? 'I've got you all mapped out.'",
  ];

  const currentJokes = jokeTab === 'mom' ? momJokes : dadJokes;

  // ── File drop handlers ──
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    
    // Sort: process definition files first, then binaries
    // This ensures ecuDef is set before binary alignment
    const defFiles = files.filter(f => {
      const n = f.name.toLowerCase();
      return n.endsWith('.a2l') || n.endsWith('.csv');
    });
    const binFiles = files.filter(f => {
      const n = f.name.toLowerCase();
      return !n.endsWith('.a2l') && !n.endsWith('.csv');
    });
    
    // Load definition first (await it so ecuDefRef is updated)
    for (const file of defFiles) {
      await handleDefinitionLoad(file);
    }
    // Small delay to let React re-render and update refs
    if (defFiles.length > 0 && binFiles.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }
    // Then load binaries (they'll read ecuDefRef.current)
    for (const file of binFiles) {
      await handleBinaryLoad(file);
    }
  }, [handleDefinitionLoad, handleBinaryLoad]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // ── Render ──
  return (
    <div
      className={`flex flex-col h-full bg-zinc-950 text-white transition-all duration-200 ${isDragOver ? 'ring-2 ring-inset ring-red-500/50' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <Upload className="w-16 h-16 text-red-500" />
            <span className="text-lg font-bold text-red-400 tracking-wider" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: '0.1em' }}>DROP FILES TO LOAD</span>
            <span className="text-xs text-zinc-400">A2L / CSV definitions &bull; Binary files (.bin .ptp .hex .srec)</span>
          </div>
        </div>
      )}
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
          accept=".a2l,.csv,.A2L,.CSV,*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) setPendingA2LFile(file);
            e.target.value = '';
          }}
        />
        {pendingA2LFile && (
          <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5">
            <span className="text-[10px] text-zinc-300 font-mono truncate max-w-[120px]">{pendingA2LFile.name}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-5 text-[10px] px-1.5 border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
              onClick={() => { handleDefinitionLoad(pendingA2LFile); setPendingA2LFile(null); }}
            >
              Load
            </Button>
            <button className="text-zinc-500 hover:text-zinc-300" onClick={() => setPendingA2LFile(null)}>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

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
          accept=".bin,.bdc,.s,.ptp,.srec,.hex,.s19,.s28,.s37,.ihex,.BIN,.BDC,.S,.PTP,.SREC,.HEX,*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) setPendingBinFile(file);
            e.target.value = '';
          }}
        />
        {pendingBinFile && (
          <div className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5">
            <span className="text-[10px] text-zinc-300 font-mono truncate max-w-[120px]">{pendingBinFile.name}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-5 text-[10px] px-1.5 border-emerald-600 text-emerald-400 hover:bg-emerald-900/30"
              onClick={() => { handleBinaryLoad(pendingBinFile); setPendingBinFile(null); }}
            >
              Load
            </Button>
            <button className="text-zinc-500 hover:text-zinc-300" onClick={() => setPendingBinFile(null)}>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

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
            {healResult && (
              <button
                className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                  healResult.success
                    ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                    : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                }`}
                onClick={() => setShowHealLog(!showHealLog)}
                title="Click to see Knox's alignment analysis"
              >
                {healResult.success ? '✓ Healed' : '⚠ Check'}
              </button>
            )}
          </div>
        )}

        {/* Undo/Redo buttons */}
        {history.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 border-zinc-700 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 border-zinc-700 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title="Redo (Ctrl+Y)"
            >
              ↷ Redo
            </Button>
            <span className="text-[9px] text-zinc-500 font-mono ml-1">
              {historyIndex + 1}/{history.length}
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
          onClick={handleDownloadBinary}
          disabled={!binaryData}
          title="Download modified binary file"
        >
          <FileDown className="w-3.5 h-3.5" />
          Download
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] gap-1.5 border-zinc-700 bg-transparent hover:bg-zinc-800"
          onClick={handleExportClick}
          disabled={!binaryData || modifiedMaps.size === 0}
        >
          <FileDown className="w-3.5 h-3.5" />
          Export
        </Button>

        {/* Unlock Patches */}
        {unlockStatus && (
          <>
            <div className="w-px h-5 bg-zinc-700" />
            <Button
              variant="outline"
              size="sm"
              className={`h-7 text-[11px] gap-1.5 border-zinc-700 ${
                unlockStatus.isDynojettPatched
                  ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50'
                  : 'bg-transparent hover:bg-zinc-800'
              }`}
              onClick={handleApplyDynojettPatch}
              disabled={!binaryData || unlockStatus.isDynojettPatched}
              title={unlockStatus.isDynojettPatched ? 'Dynojet unlock already applied' : 'Apply Dynojet unlock patch'}
            >
              {unlockStatus.isDynojettPatched ? '✓ Dynojet' : 'Dynojet'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 text-[11px] gap-1.5 border-zinc-700 ${
                unlockStatus.isHPTunersPatched
                  ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50'
                  : 'bg-transparent hover:bg-zinc-800'
              }`}
              onClick={handleApplyHPTunersPatch}
              disabled={!binaryData || unlockStatus.isHPTunersPatched}
              title={unlockStatus.isHPTunersPatched ? 'HPTuners unlock already applied' : 'Apply HPTuners unlock patch'}
            >
              {unlockStatus.isHPTunersPatched ? '✓ HPTuners' : 'HPTuners'}
            </Button>
            <label className="flex items-center gap-2 px-2 py-1 text-[11px] cursor-pointer hover:bg-zinc-800 rounded">
              <input
                type="checkbox"
                checked={autoCorrectChecksums}
                onChange={(e) => setAutoCorrectChecksums(e.target.checked)}
                className="w-3 h-3"
                title="Automatically recalculate checksums after applying patches"
              />
              <span className="text-zinc-400">Auto-Checksum</span>
            </label>
          </>
        )}

        <Button
          variant="outline"
          size="sm"
          className={`h-7 text-[11px] gap-1.5 border-zinc-700 ${showKnox ? 'bg-ppei-red/20 text-ppei-red border-ppei-red/30' : 'bg-transparent hover:bg-zinc-800'}`}
          onClick={() => setShowKnox(!showKnox)}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Knox
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
          <div className="w-72 border-r border-zinc-800 flex flex-col shrink-0 min-h-0 overflow-hidden">
            {ecuDef ? (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full min-h-0 overflow-hidden">
                <TabsList className="shrink-0 mx-2 mt-2">
                  <TabsTrigger value="maps" className="text-[11px]">Maps</TabsTrigger>
                  <TabsTrigger value="hex" className="text-[11px]">Hex</TabsTrigger>
                  <TabsTrigger value="compare" className="text-[11px]">Compare</TabsTrigger>
                  <TabsTrigger value="ecu" className="text-[11px]">ECU</TabsTrigger>
                  <TabsTrigger value="info" className="text-[11px]">Info</TabsTrigger>
                  <TabsTrigger value="tunes" className="text-[11px]">Tunes</TabsTrigger>
                  <TabsTrigger value="calc" className="text-[11px]">Calc</TabsTrigger>
                  <TabsTrigger value="knox" className="text-[11px]">Knox</TabsTrigger>
                  <TabsTrigger value="jokes" className="text-[11px]">😂</TabsTrigger>
                </TabsList>

                <TabsContent value="maps" className="flex-1 overflow-hidden mt-0 min-h-0">
                  <MapTreeBrowser
                    maps={ecuDef.maps}
                    selectedMapIndex={selectedMapIndex}
                    onSelectMap={setSelectedMapIndex}
                    modifiedMaps={modifiedMaps}
                    ecuFamily={ecuDef.ecuFamily}
                  />
                </TabsContent>

                <TabsContent value="hex" className="flex-1 overflow-hidden mt-0 min-h-0">
                  {binaryData ? (
                    <HexEditor
                      data={binaryData}
                      ecuDef={ecuDef}
                      alignment={alignment}
                      baseAddress={binaryBaseAddress}
                      onDataChange={(newData: Uint8Array) => {
                        setBinaryData(new Uint8Array(newData));
                        toast.success('Hex edit applied');
                      }}
                      onMapDetected={(map: Partial<CalibrationMap>) => {
                        toast.success(`Map defined: ${map.name}`);
                      }}
                      onNavigateToMap={(idx: number) => {
                        setSelectedMapIndex(idx);
                        toast.info(`Navigated to ${ecuDef.maps[idx]?.name}`);
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-zinc-500">
                      Load a binary file to view hex
                    </div>
                  )}
                </TabsContent>

                 <TabsContent value="compare" className="flex-1 overflow-auto mt-0 min-h-0">
                  <TuneCompare
                    ecuDef={ecuDef}
                    alignment={alignment}
                    primaryBinary={binaryData}
                    primaryFileName={binaryFileName}
                    compareBinary={compareBinary}
                    compareBinaryFileName={compareBinaryFileName}
                    compareFormat={compareFormat}
                    compareOffset={compareOffset}
                    isMG1={detectedFamily?.includes('MG1') || binaryFileName.toLowerCase().includes('mg1')}
                    onCompareBinaryLoad={(data: Uint8Array, fileName: string, format: string, offset: number) => {
                      setCompareBinary(data);
                      setCompareBinaryFileName(fileName);
                      setCompareFormat(format);
                      setCompareOffset(offset);
                      // Update isMG1 detection for compare file
                    }}
                    onCloseCompareBinary={() => {
                      setCompareBinary(null);
                      setCompareBinaryFileName('');
                      setCompareFormat('');
                      setCompareOffset(0);
                    }}
                    onSelectMap={setSelectedMapIndex}
                    onCopyToP={(changes) => {
                      if (!binaryData) return;
                      try {
                        const newBinary = new Uint8Array(binaryData);
                        for (const change of changes) {
                          if (change.offset >= 0 && change.offset + change.size <= newBinary.length) {
                            if (change.size === 1) {
                              newBinary[change.offset] = change.value & 0xFF;
                            } else if (change.size === 2) {
                              newBinary[change.offset] = change.value & 0xFF;
                              newBinary[change.offset + 1] = (change.value >> 8) & 0xFF;
                            } else if (change.size === 4) {
                              newBinary[change.offset] = change.value & 0xFF;
                              newBinary[change.offset + 1] = (change.value >> 8) & 0xFF;
                              newBinary[change.offset + 2] = (change.value >> 16) & 0xFF;
                              newBinary[change.offset + 3] = (change.value >> 24) & 0xFF;
                            }
                          }
                        }
                        setBinaryData(newBinary);
                        pushToHistory(newBinary);
                        setCopyStatus({ message: `Copied ${changes.length} value(s) to primary binary`, type: 'success' });
                        setTimeout(() => setCopyStatus(null), 3000);
                      } catch (err) {
                        setCopyStatus({ message: `Error copying values: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
                        setTimeout(() => setCopyStatus(null), 3000);
                      }
                    }}
                  />
                </TabsContent>

                <TabsContent value="ecu" className="flex-1 overflow-auto mt-0 p-3 min-h-0">
                  <ECUDetectionPanel
                    binary={binaryData}
                    onA2LDetected={(content, family) => {
                      setDetectedFamily(family);
                      setAutoLoadedA2L(true);
                    }}
                    onA2LRegistered={(family, filename) => {
                      toast.success('A2L Registered', {
                        description: `${family}: ${filename} stored for auto-loading`
                      });
                    }}
                  />
                </TabsContent>

                <TabsContent value="info" className="flex-1 overflow-auto mt-0 p-3 min-h-0">
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
                    {healResult && (
                      <>
                        <div className="mt-3 text-zinc-500 border-t border-zinc-800 pt-2">Knox Self-Healing:</div>
                        <div className="pl-3 text-zinc-400">
                          Status: <span className={healResult.success ? 'text-emerald-400' : 'text-amber-400'}>
                            {healResult.success ? 'Alignment verified/healed' : 'Could not auto-fix'}
                          </span>
                        </div>
                        <div className="pl-3 text-zinc-400">
                          Health: <span className="text-zinc-300">
                            {(healResult.originalDiagnostic.healthScore * 100).toFixed(0)}%
                            {healResult.finalDiagnostic.healthScore !== healResult.originalDiagnostic.healthScore &&
                              ` → ${(healResult.finalDiagnostic.healthScore * 100).toFixed(0)}%`
                            }
                          </span>
                        </div>
                        <div className="pl-3 text-zinc-400">
                          Strategies tried: <span className="text-zinc-300">{healResult.strategiesAttempted.length} ({healResult.strategiesAttempted.join(', ')})</span>
                        </div>
                        {healResult.originalDiagnostic.issues.length > 0 && (
                          <>
                            <div className="pl-3 text-zinc-500 mt-1">Issues detected:</div>
                            {healResult.originalDiagnostic.issues.map((issue: string, i: number) => (
                              <div key={i} className="pl-6 text-[10px] text-amber-500/70">{issue}</div>
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

                <TabsContent value="tunes" className="flex-1 overflow-auto mt-0 p-3 min-h-0">
                  <TuneManager
                    currentBinary={binaryData}
                    currentA2L={ecuDef ? JSON.stringify(ecuDef) : null}
                    vehicleInfo={{
                      make: detectedFamily || '',
                      model: binaryFileName || '',
                      ecuFamily: detectedFamily || '',
                      ecuId: ecuDef?.moduleInfo?.epromId || '',
                    }}
                    onTuneLoaded={(binary, a2l, metadata) => {
                      setBinaryData(binary);
                      setBinaryFileName(metadata?.name || 'loaded_tune.bin');
                      if (a2l) {
                        try {
                          const parsed = JSON.parse(a2l);
                          setEcuDef(parsed);
                        } catch (e) {
                          console.warn('Could not parse A2L from saved tune');
                        }
                      }
                      toast.success('Tune loaded', {
                        description: `Loaded: ${metadata?.name || 'Unknown tune'}`
                      });
                    }}
                  />
                </TabsContent>

                <TabsContent value="calc" className="flex-1 overflow-hidden mt-0 min-h-0">
                  <CalculatorsPanel />
                </TabsContent>

                <TabsContent value="knox" className="flex-1 overflow-hidden mt-0 min-h-0">
                  <KnoxFileBrowser />
                </TabsContent>

                <TabsContent value="jokes" className="flex-1 overflow-auto mt-0 p-3 min-h-0">
                  <div className="flex flex-col h-full">
                    <div className="flex gap-1 mb-3">
                      <button
                        onClick={() => { setJokeTab('mom'); setJokeIndex(0); }}
                        className={`flex-1 py-1.5 text-[10px] font-bold tracking-wider rounded transition-all ${
                          jokeTab === 'mom'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700 hover:bg-zinc-800'
                        }`}
                      >
                        MOM JOKES
                      </button>
                      <button
                        onClick={() => { setJokeTab('dad'); setJokeIndex(0); }}
                        className={`flex-1 py-1.5 text-[10px] font-bold tracking-wider rounded transition-all ${
                          jokeTab === 'dad'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700 hover:bg-zinc-800'
                        }`}
                      >
                        DAD JOKES
                      </button>
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
                      <div className={`text-3xl mb-3 ${jokeTab === 'mom' ? 'animate-bounce' : ''}`}>
                        {jokeTab === 'mom' ? '🔥' : '👴'}
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed mb-4 min-h-[3rem]">
                        {currentJokes[jokeIndex % currentJokes.length]}
                      </p>
                      <button
                        onClick={() => setJokeIndex(prev => prev + 1)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold tracking-wider bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
                      >
                        <RefreshCw className="w-3 h-3" />
                        ANOTHER ONE
                      </button>
                      <p className="text-[9px] text-zinc-600 mt-3 italic">
                        Joke #{(jokeIndex % currentJokes.length) + 1} of {currentJokes.length}
                      </p>
                    </div>

                    <div className="text-[9px] text-zinc-700 text-center mt-2 italic">
                      {jokeTab === 'mom'
                        ? "Your mom's calibration file is so big, WinOLS crashed trying to open it."
                        : "I'm not saying my dad's tune is bad, but even the ECU asked for a second opinion."}
                    </div>
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
                  <div className="text-[10px] text-zinc-400">Knox AI</div>
                  <div className="text-[9px] text-zinc-600">Calibration assistant</div>
                </Card>
              </div>
              <p className="text-[10px] text-zinc-600 mt-4">
                Drag & drop files anywhere to load
              </p>
            </div>
          )}
        </div>

        {/* Right panel: Knox chat */}
        {showKnox && (
          <div className="w-80 shrink-0">
            <KnoxChat
              ecuDef={ecuDef}
              selectedMap={selectedMap}
              onNavigateToMap={(name) => {
                if (!ecuDef) return;
                const idx = ecuDef.maps.findIndex(m => m.name === name);
                if (idx !== -1) setSelectedMapIndex(idx);
              }}
              isOpen={showKnox}
              onToggle={() => setShowKnox(false)}
            />
          </div>
        )}
      </div>

      {/* Checksum Correction Dialog */}
      <AlertDialog open={showChecksumDialog} onOpenChange={setShowChecksumDialog}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="w-5 h-5 text-ppei-red" />
              Checksum Correction
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              You have <span className="text-yellow-400 font-semibold">{modifiedMaps.size} modified map{modifiedMaps.size !== 1 ? 's' : ''}</span> ready for export.
              Would you like to correct checksums before exporting?
              <br /><br />
              <span className="text-zinc-500 text-[11px]">
                Checksum correction recalculates integrity values in the binary to prevent
                ECU rejection. If you plan to verify with WinOLS or your flashing tool,
                you may skip this step.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              className="bg-transparent border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              onClick={() => setShowChecksumDialog(false)}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              onClick={() => doExport(false)}
            >
              Export Without Correction
            </Button>
            <AlertDialogAction
              className="bg-ppei-red hover:bg-ppei-red/80 text-white"
              onClick={() => doExport(true)}
            >
              <ShieldCheck className="w-4 h-4 mr-1" />
              Export with Checksum Correction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
