/**
 * FlashContainerPanel — ECU Flash Container Analysis & Upload Tool
 * 
 * Features:
 * - Drag-and-drop binary upload (.bin, .hex, .cal)
 * - PPEI and DevProg V2 container header parsing and display
 * - Calibration Flash / Full Flash toggle
 * - Flash readiness checklist with pass/fail/warn indicators
 * - Hex viewer for binary inspection
 * - Flash sequence visualization with ECU-specific steps
 * - Upload-to-flasher (WiFi URL / BLE transfer prep)
 * - 50+ ECU platform support from shared ECU database
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import PreFlightChecklist from './PreFlightChecklist';
import FlashMissionControl from './FlashMissionControl';
import FlashDashboard from './FlashDashboard';
import {
  type FlashPlan,
  generateFlashPlan, formatBytes,
} from '../../../shared/pcanFlashOrchestrator';
import { type ContainerFileHeader as EcuContainerFileHeader } from '../../../shared/ecuDatabase';
import { PCANConnection } from '../lib/pcanConnection';
import {
  parsePpeiContainer,
  isPpeiContainer,
  type FlashContainerAnalysis,
  type FlashType,
} from '../lib/flashContainerParser';
import {
  Upload, FileCheck, Shield, Cpu, Zap, AlertTriangle,
  CheckCircle2, XCircle, Info, ChevronDown, ChevronRight,
  HardDrive, Binary, Wifi, Bluetooth, RotateCcw, Eye,
  Database, Clock, Lock, Radio, Activity, BarChart3,
} from 'lucide-react';

// ── Hex Viewer Sub-component ─────────────────────────────────────────────

function HexViewer({ data, startOffset = 0, maxRows = 32 }: {
  data: Uint8Array;
  startOffset?: number;
  maxRows?: number;
}) {
  const [viewOffset, setViewOffset] = useState(startOffset);
  const bytesPerRow = 16;
  const totalRows = Math.min(maxRows, Math.ceil((data.length - viewOffset) / bytesPerRow));

  return (
    <div className="font-mono text-xs bg-black/90 text-green-400 rounded-lg p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3 text-green-300/70">
        <span>OFFSET    00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F   ASCII</span>
        <div className="flex gap-2">
          <button
            onClick={() => setViewOffset(Math.max(0, viewOffset - bytesPerRow * maxRows))}
            disabled={viewOffset === 0}
            className="px-2 py-0.5 bg-green-900/30 rounded hover:bg-green-900/50 disabled:opacity-30"
          >▲</button>
          <button
            onClick={() => setViewOffset(Math.min(data.length - bytesPerRow, viewOffset + bytesPerRow * maxRows))}
            disabled={viewOffset + bytesPerRow * maxRows >= data.length}
            className="px-2 py-0.5 bg-green-900/30 rounded hover:bg-green-900/50 disabled:opacity-30"
          >▼</button>
        </div>
      </div>
      {Array.from({ length: totalRows }, (_, row) => {
        const off = viewOffset + row * bytesPerRow;
        const rowBytes = data.slice(off, off + bytesPerRow);
        const hex = Array.from(rowBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const hexParts = hex.split(' ');
        const hexFormatted = hexParts.slice(0, 8).join(' ') + '  ' + hexParts.slice(8).join(' ');
        const ascii = Array.from(rowBytes).map(b => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
        return (
          <div key={off} className="hover:bg-green-900/20">
            <span className="text-green-500/60">{off.toString(16).toUpperCase().padStart(8, '0')}</span>
            {'  '}
            <span>{hexFormatted.padEnd(49)}</span>
            {'  '}
            <span className="text-green-300">{ascii}</span>
          </div>
        );
      })}
      <div className="mt-2 text-green-500/50 text-[10px]">
        Showing offset 0x{viewOffset.toString(16).toUpperCase()} — {data.length.toLocaleString()} bytes total
      </div>
    </div>
  );
}

// ── Flash Sequence Viewer ────────────────────────────────────────────────

function FlashSequenceViewer({ steps, ecuFamily }: { steps: string[]; ecuFamily: string }) {
  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const [name, ...descParts] = step.split(' — ');
        const desc = descParts.join(' — ');
        return (
          <div key={i} className="flex items-start gap-3 group">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xs font-bold">
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className="w-px h-4 bg-amber-500/20" />}
            </div>
            <div className="pt-1">
              <span className="font-mono text-sm text-amber-300">{name}</span>
              {desc && <span className="text-zinc-400 text-xs ml-2">{desc}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Readiness Check Display ──────────────────────────────────────────────

function ReadinessChecklist({ checks }: { checks: FlashContainerAnalysis['readinessChecks'] }) {
  const statusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-400" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case 'pass': return 'border-green-500/20 bg-green-500/5';
      case 'fail': return 'border-red-500/20 bg-red-500/5';
      case 'warn': return 'border-amber-500/20 bg-amber-500/5';
      default: return 'border-blue-500/20 bg-blue-500/5';
    }
  };

  return (
    <div className="space-y-2">
      {checks.map(check => (
        <div key={check.id} className={`flex items-start gap-3 p-3 rounded-lg border ${statusBg(check.status)}`}>
          {statusIcon(check.status)}
          <div>
            <div className="text-sm font-medium text-zinc-200">{check.label}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{check.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function FlashContainerPanel() {
  const [analysis, setAnalysis] = useState<FlashContainerAnalysis | null>(null);
  const [rawData, setRawData] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [flashTypeOverride, setFlashTypeOverride] = useState<FlashType | null>(null);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'ready' | 'uploading' | 'done'>('idle');
  const [missionControlMode, setMissionControlMode] = useState<'simulator' | 'pcan' | null>(null);
  const [showPreFlight, setShowPreFlight] = useState(false);
  const [pendingMode, setPendingMode] = useState<'simulator' | 'pcan' | null>(null);
  const [fileHash, setFileHash] = useState<string>('');
  const [sessionUuid, setSessionUuid] = useState<string>('');
  const [pcanBridgeAvailable, setPcanBridgeAvailable] = useState<boolean | null>(null);
  const [pcanBridgeUrl, setPcanBridgeUrl] = useState<string | null>(null);
  const [checkingBridge, setCheckingBridge] = useState(false);
  const pcanConnectionRef = useRef<PCANConnection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSession = trpc.flash.createSession.useMutation();

  const effectiveFlashType: FlashType = flashTypeOverride ?? analysis?.flashType ?? 'unknown';

  // Auto-detect PCAN bridge — same method used by Datalogger and IntelliSpy
  const checkPcanBridge = useCallback(async () => {
    setCheckingBridge(true);
    try {
      const result = await PCANConnection.isBridgeAvailable();
      setPcanBridgeAvailable(result.available);
      if (result.available && result.url) {
        setPcanBridgeUrl(result.url);
        // Pre-create connection instance for real flash
        if (!pcanConnectionRef.current) {
          pcanConnectionRef.current = new PCANConnection({ bridgeUrl: result.url });
        }
      } else {
        setPcanBridgeUrl(null);
      }
    } catch {
      setPcanBridgeAvailable(false);
      setPcanBridgeUrl(null);
    } finally {
      setCheckingBridge(false);
    }
  }, []);

  // Check bridge when PCAN section becomes active
  useEffect(() => {
    if (activeSection === 'pcan' && pcanBridgeAvailable === null) {
      checkPcanBridge();
    }
  }, [activeSection, pcanBridgeAvailable, checkPcanBridge]);

  // Convert client-side analysis to ContainerFileHeader for generateFlashPlan
  const containerFileHeader = useMemo((): EcuContainerFileHeader | null => {
    if (!analysis) return null;
    const dp = analysis.devProgHeader;
    if (dp) {
      return {
        offset: '0', flashernumber: dp.flashernumber, udid: dp.udid,
        vin: dp.vin, seed: dp.seed, key: dp.key, file_id: dp.fileId,
        create_date: dp.createDate, expire_date: dp.expireDate,
        max_flash_count: dp.maxFlashCount, header_length: '0',
        block_count: dp.blockCount, block_boot: dp.blockBoot,
        block_erase: dp.blockErase, file_size: dp.fileSize.toString(16),
        comp_enc: dp.compEnc.toString(16), lzss: dp.lzss ? 'true' : 'false',
        xferSize: dp.xferSize.toString(16), ForceOS: dp.forceOS ? 'true' : 'false',
        block_struct: dp.blocks, ecu_type: dp.ecuType,
        hardware_number: dp.hardwareNumber,
      };
    }
    const h = analysis.header;
    if (h) {
      return {
        offset: '0', flashernumber: 0, udid: '', vin: '', seed: '', key: '',
        file_id: '', create_date: 0, expire_date: 0, max_flash_count: 0,
        header_length: '0', block_count: 1, block_boot: 0, block_erase: 0,
        file_size: analysis.totalSize.toString(16), comp_enc: '0',
        lzss: 'false', xferSize: '0', ForceOS: h.isFullFlash ? 'true' : 'false',
        block_struct: [{ block_id: 0, start_adresse: analysis.dataOffset.toString(16), end_adresse: (analysis.dataOffset + analysis.dataSize).toString(16), block_length: analysis.dataSize.toString(16), OS: h.isFullFlash ? 'true' : 'false' }],
        ecu_type: h.ecuType || analysis.ecuFamily, hardware_number: '',
      };
    }
    return null;
  }, [analysis]);

  // Generate flash plan from analysis
  const flashPlan = useMemo((): FlashPlan | null => {
    if (!containerFileHeader || !analysis) return null;
    const ecuType = analysis.ecuConfig?.ecuType || analysis.devProgHeader?.ecuType || analysis.ecuFamily;
    const mode = effectiveFlashType === 'fullflash' ? 'FULL_FLASH' : 'CALIBRATION';
    return generateFlashPlan(containerFileHeader, ecuType, mode);
  }, [containerFileHeader, analysis, effectiveFlashType]);

  // Compute file hash on upload
  const computeFileHash = useCallback(async (data: Uint8Array): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  // Handle launch (PCAN or Simulator)
  const handleLaunch = useCallback((mode: 'simulator' | 'pcan') => {
    setPendingMode(mode);
    setShowPreFlight(true);
  }, []);

  // After pre-flight passes, create session and launch MissionControl
  const handlePreFlightPassed = useCallback(async () => {
    if (!pendingMode || !analysis || !flashPlan) return;
    setShowPreFlight(false);
    try {
      const ecuType = analysis.ecuConfig?.ecuType || analysis.devProgHeader?.ecuType || analysis.ecuFamily;
      const uuid = crypto.randomUUID();
      const result = await createSession.mutateAsync({
        uuid, ecuType, connectionMode: pendingMode, fileName,
        fileHash: fileHash || undefined,
        flashMode: effectiveFlashType === 'fullflash' ? 'full_flash' : 'calibration',
        totalBlocks: flashPlan.totalBlocks, totalBytes: flashPlan.totalBytes,
      });
      setSessionUuid(result.uuid);
      setMissionControlMode(pendingMode);
    } catch (err) {
      console.error('Failed to create flash session:', err);
    }
  }, [pendingMode, analysis, flashPlan, fileName, fileHash, effectiveFlashType, createSession]);

  // Handle MissionControl completion
  const handleFlashComplete = useCallback((result: 'SUCCESS' | 'FAILED' | 'ABORTED') => {
    setMissionControlMode(null);
    setSessionUuid('');
    setPendingMode(null);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setRawData(bytes);

      // Compute file hash
      computeFileHash(bytes).then(h => setFileHash(h));

      if (isPpeiContainer(buffer)) {
        const result = parsePpeiContainer(buffer);
        setAnalysis(result);
        setFlashTypeOverride(null);
        setUploadStatus('ready');
      } else {
        setAnalysis({
          valid: false, containerFormat: 'UNKNOWN',
          header: null, devProgHeader: null, ecuFamily: 'UNKNOWN', ecuConfig: null,
          flashType: 'unknown', dataOffset: 0, dataSize: 0,
          totalSize: bytes.length,
          readinessChecks: [{
            id: 'format', label: 'Container Format',
            status: 'fail', detail: 'Not a recognized PPEI container format. Expected IPF magic header.',
          }],
          securityInfo: { seedKeyAlgorithm: 'UNKNOWN', requiresUnlockBox: false, protocol: 'UNKNOWN', seedLevel: 0, canTxAddr: 0, canRxAddr: 0 },
          flashSequence: [], errors: ['Unrecognized file format'],
        });
        setUploadStatus('idle');
      }
    } catch (err) {
      console.error('Failed to parse container:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const resetAll = () => {
    setAnalysis(null);
    setRawData(null);
    setFileName('');
    setFlashTypeOverride(null);
    setUploadStatus('idle');
    setActiveSection('overview');
    setMissionControlMode(null);
    setShowPreFlight(false);
    setPendingMode(null);
    setFileHash('');
    setSessionUuid('');
    setPcanBridgeAvailable(null);
    setPcanBridgeUrl(null);
  };

  // ── Upload Screen ──────────────────────────────────────────────────────

  if (!analysis) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">ECU Flash Container</h2>
            <p className="text-xs text-zinc-500">Upload a PPEI container binary for analysis and flash preparation</p>
          </div>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={() => setIsDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          className={`flex-1 min-h-[300px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-400">Parsing container...</span>
            </div>
          ) : (
            <>
              <Upload className={`w-12 h-12 mb-4 ${isDragOver ? 'text-amber-400' : 'text-zinc-600'}`} />
              <p className="text-zinc-300 font-medium">Drop ECU binary here</p>
              <p className="text-zinc-500 text-sm mt-1">or click to browse</p>
              <p className="text-zinc-600 text-xs mt-4">.bin, .hex, .cal — PPEI container format</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".bin,.hex,.cal,.Bin,.BIN"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      </div>
    );
  }

  // ── Analysis Display ───────────────────────────────────────────────────

  const h = analysis.header;
  const passCount = analysis.readinessChecks.filter(c => c.status === 'pass').length;
  const totalChecks = analysis.readinessChecks.length;

  const sections = [
    { id: 'overview', label: 'Overview', icon: FileCheck },
    { id: 'readiness', label: 'Readiness', icon: Shield },
    { id: 'sequence', label: 'Flash Sequence', icon: Zap },
    { id: 'hex', label: 'Hex Viewer', icon: Binary },
    { id: 'upload', label: 'Upload to Flasher', icon: Wifi },
    { id: 'pcan', label: 'PCAN Flash', icon: Radio },
    { id: 'simulator', label: 'Simulator', icon: Activity },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  ];

  // ── MissionControl overlay ──────────────────────────────────────────────
  if (missionControlMode && flashPlan && sessionUuid) {
    return (
      <div className="h-full flex flex-col">
        <FlashMissionControl
          plan={flashPlan}
          connectionMode={missionControlMode}
          sessionUuid={sessionUuid}
          onComplete={handleFlashComplete}
          onBack={() => { setMissionControlMode(null); setSessionUuid(''); }}
          pcanConnection={missionControlMode === 'pcan' ? pcanConnectionRef.current : null}
          containerData={rawData ? rawData.buffer as ArrayBuffer : null}
          containerHeader={containerFileHeader}
        />
      </div>
    );
  }

  // ── PreFlight overlay ──────────────────────────────────────────────────
  if (showPreFlight && pendingMode && analysis) {
    const ecuType = analysis.ecuConfig?.ecuType || analysis.devProgHeader?.ecuType || analysis.ecuFamily;
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Pre-Flight Diagnostics</h2>
            <p className="text-xs text-zinc-500">Validating ECU and container before {pendingMode.toUpperCase()} flash</p>
          </div>
        </div>
        <PreFlightChecklist
          ecuType={ecuType}
          fileHash={fileHash || undefined}
          connectionMode={pendingMode}
          onAllPassed={handlePreFlightPassed}
          onCancel={() => { setShowPreFlight(false); setPendingMode(null); }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            analysis.valid
              ? 'bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30'
              : 'bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30'
          }`}>
            {analysis.valid ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100 truncate max-w-[400px]">{fileName}</h2>
            <p className="text-xs text-zinc-500">
              {analysis.ecuConfig ? `${analysis.ecuConfig.name} (${analysis.ecuConfig.oem})` : h ? `${h.vehicleType} ${h.ecuType || analysis.ecuFamily}` : 'Unknown ECU'} — {(analysis.totalSize / 1024 / 1024).toFixed(2)} MB
              {analysis.containerFormat !== 'UNKNOWN' && <span className="ml-2 px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] text-zinc-400">{analysis.containerFormat}</span>}
            </p>
          </div>
        </div>
        <button onClick={resetAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors">
          <RotateCcw className="w-3 h-3" /> New File
        </button>
      </div>

      {/* Flash Type Toggle */}
      <div className="flex items-center gap-2 mb-4 p-3 bg-zinc-900/80 rounded-lg border border-zinc-800">
        <HardDrive className="w-4 h-4 text-zinc-400" />
        <span className="text-sm text-zinc-400 mr-2">Flash Type:</span>
        <button
          onClick={() => setFlashTypeOverride('calibration')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            effectiveFlashType === 'calibration'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
          }`}
        >
          CALIBRATION FLASH
        </button>
        <button
          onClick={() => setFlashTypeOverride('fullflash')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            effectiveFlashType === 'fullflash'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
          }`}
        >
          FULL FLASH
        </button>
        {flashTypeOverride && flashTypeOverride !== analysis.flashType && (
          <span className="text-[10px] text-amber-400 ml-2">
            ⚠ Override — container tagged as {analysis.flashType === 'fullflash' ? 'Full Flash' : 'Calibration'}
          </span>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 mb-4 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeSection === s.id
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <s.icon className="w-3.5 h-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Section Content */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === 'overview' && (h || analysis.devProgHeader) && (
          <div className="space-y-4">
            {/* Container Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'ECU Platform', value: analysis.ecuConfig ? `${analysis.ecuConfig.name}` : `${h?.ecuType || analysis.ecuFamily}` },
                { label: 'Protocol', value: analysis.ecuConfig ? `${analysis.ecuConfig.protocol} (CAN ${analysis.ecuConfig.canSpeed}kbps)` : analysis.securityInfo.protocol },
                { label: 'OEM', value: analysis.ecuConfig?.oem ?? (h?.vendor || 'Unknown') },
                { label: 'Controller Type', value: analysis.ecuConfig?.controllerType?.toUpperCase() ?? 'ECU' },
                { label: 'CAN TX / RX', value: analysis.ecuConfig ? `0x${analysis.ecuConfig.txAddr.toString(16).toUpperCase()} / 0x${analysis.ecuConfig.rxAddr.toString(16).toUpperCase()}` : 'N/A' },
                { label: 'Transfer Size', value: analysis.ecuConfig?.xferSize ? `0x${analysis.ecuConfig.xferSize.toString(16).toUpperCase()} (${analysis.ecuConfig.xferSize} bytes)` : 'Default' },
                { label: 'Seed Level', value: analysis.ecuConfig ? `0x${analysis.ecuConfig.seedLevel.toString(16).padStart(2, '0')}` : 'N/A' },
                { label: 'Data Size', value: `${(analysis.dataSize / 1024 / 1024).toFixed(2)} MB` },
                { label: 'Data Offset', value: `0x${analysis.dataOffset.toString(16).toUpperCase()}` },
                { label: 'Flash Type', value: (h?.isFullFlash || analysis.devProgHeader?.forceOS) ? 'Full Flash (OS + Cal)' : 'Calibration Only' },
                ...(analysis.devProgHeader ? [
                  { label: 'VIN', value: analysis.devProgHeader.vin || 'Not bound' },
                  { label: 'Blocks', value: `${analysis.devProgHeader.blockCount} blocks (${analysis.devProgHeader.lzss ? 'LZSS compressed' : 'raw'})` },
                  { label: 'Hardware #', value: analysis.devProgHeader.hardwareNumber || 'N/A' },
                  { label: 'Flasher #', value: `#${analysis.devProgHeader.flashernumber}` },
                ] : [
                  { label: 'Creator', value: h?.creator || 'Unknown' },
                  { label: 'Vendor', value: h?.vendor || 'Unknown' },
                  { label: 'Version', value: h ? `${h.version} (Build ${h.buildNumber})` : 'N/A' },
                  { label: 'Rescue Mode', value: h?.isRescue ? 'Supported' : 'Not tagged' },
                ]),
              ].map(item => (
                <div key={item.label} className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.label}</div>
                  <div className="text-sm text-zinc-200 font-medium mt-0.5">{item.value}</div>
                </div>
              ))}
            </div>

            {/* Part Numbers */}
            {h && h.partNumbers.length > 0 && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Part Numbers</div>
                <div className="flex flex-wrap gap-2">
                    {h?.partNumbers.map((pn, i) => (
                    <span key={i} className="px-2.5 py-1 bg-zinc-800 rounded-md text-sm font-mono text-zinc-300 border border-zinc-700">
                      {pn}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Flash Tags */}
            {h && h.flashTags.length > 0 && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Flash Tags</div>
                <div className="flex flex-wrap gap-2">
                  {h?.flashTags.map((tag, i) => (
                    <span key={i} className={`px-2.5 py-1 rounded-md text-xs font-mono border ${
                      tag === 'fullflash' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : tag === 'rescue' ? 'bg-green-500/10 text-green-300 border-green-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}>
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Security Info */}
            <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Security</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Seed/Key Algorithm</span>
                  <span className="text-zinc-200 font-mono text-xs">{analysis.securityInfo.seedKeyAlgorithm}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Unlock Box Required</span>
                  <span className={analysis.securityInfo.requiresUnlockBox ? 'text-amber-400' : 'text-green-400'}>
                    {analysis.securityInfo.requiresUnlockBox ? 'YES' : 'NO'}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            {h?.description && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Description</div>
                <div className="text-sm text-zinc-300">{h?.description}</div>
              </div>
            )}

            {/* Source Path */}
            {h?.sourceFilePath && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Source Path</div>
                <div className="text-xs text-zinc-400 font-mono break-all">{h?.sourceFilePath}</div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'readiness' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <span className="text-sm text-zinc-300">Flash Readiness Score</span>
              <span className={`text-lg font-bold ${
                passCount === totalChecks ? 'text-green-400' : passCount >= totalChecks * 0.7 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {passCount}/{totalChecks} checks passed
              </span>
            </div>
            <ReadinessChecklist checks={analysis.readinessChecks} />
          </div>
        )}

        {activeSection === 'sequence' && (
          <div className="space-y-4">
            <div className="p-3 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                {analysis.ecuFamily} Flash Sequence — {effectiveFlashType === 'fullflash' ? 'Full Flash' : 'Calibration Only'}
              </div>
              <div className="text-xs text-zinc-400">
                {effectiveFlashType === 'calibration'
                  ? 'OS blocks will be skipped — only calibration data blocks are transferred'
                  : 'All blocks transferred — Operating System + Calibration data'
                }
              </div>
            </div>
            {analysis.flashSequence.length > 0 ? (
              <FlashSequenceViewer steps={analysis.flashSequence} ecuFamily={analysis.ecuFamily} />
            ) : (
              <div className="text-center text-zinc-500 py-8">
                No flash sequence available for {analysis.ecuFamily}
              </div>
            )}
          </div>
        )}

        {activeSection === 'hex' && rawData && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveSection('hex')}
                className="px-3 py-1 text-xs bg-zinc-800 text-zinc-300 rounded border border-zinc-700"
              >
                <Eye className="w-3 h-3 inline mr-1" /> Header (0x000)
              </button>
              <button
                onClick={() => {
                  // Jump to data section
                  const dataOff = analysis.dataOffset || 0x1000;
                  setActiveSection('hex');
                }}
                className="px-3 py-1 text-xs bg-zinc-800 text-zinc-300 rounded border border-zinc-700"
              >
                <Binary className="w-3 h-3 inline mr-1" /> Data (0x{(analysis.dataOffset || 0x1000).toString(16).toUpperCase()})
              </button>
            </div>
            <HexViewer data={rawData} startOffset={0} maxRows={48} />
          </div>
        )}

        {activeSection === 'upload' && (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-200 mb-3">Upload to VOP 3.0 Flasher</h3>
              <p className="text-xs text-zinc-400 mb-4">
                Transfer the validated container to your VOP 3.0 hardware for ECU programming.
                {analysis.ecuConfig && ` Target: ${analysis.ecuConfig.name} via ${analysis.ecuConfig.protocol} at CAN ${analysis.ecuConfig.canSpeed}kbps.`}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  className="p-4 bg-zinc-800/80 rounded-lg border border-zinc-700 hover:border-amber-500/40 hover:bg-amber-500/5 transition-all text-left group"
                  onClick={() => setUploadStatus('uploading')}
                >
                  <Wifi className="w-6 h-6 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-zinc-200">WiFi Transfer</div>
                  <div className="text-[10px] text-zinc-500 mt-1">Upload via WiFi URL download to VOP 3.0</div>
                </button>
                <button
                  className="p-4 bg-zinc-800/80 rounded-lg border border-zinc-700 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all text-left group"
                  onClick={() => setUploadStatus('uploading')}
                >
                  <Bluetooth className="w-6 h-6 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                  <div className="text-sm font-medium text-zinc-200">BLE Transfer</div>
                  <div className="text-[10px] text-zinc-500 mt-1">Transfer via Bluetooth Low Energy</div>
                </button>
              </div>

              {uploadStatus === 'uploading' && (
                <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="flex items-center gap-2 text-amber-300 text-sm">
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Preparing container for transfer...
                  </div>
                  <div className="text-xs text-amber-400/60 mt-1">
                    Hardware bridge connection required — connect VOP 3.0 board via USB or WiFi
                  </div>
                </div>
              )}
            </div>

            {/* Transfer Requirements */}
            <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-200 mb-3">Transfer Requirements</h3>
              <div className="space-y-2 text-xs">
                {[
                  { ok: analysis.valid, text: 'Container validated and parsed successfully' },
                  { ok: analysis.ecuFamily !== 'UNKNOWN', text: `ECU platform identified: ${analysis.ecuFamily}` },
                  { ok: !!analysis.ecuConfig, text: analysis.ecuConfig ? `CAN bus: TX 0x${analysis.ecuConfig.txAddr.toString(16).toUpperCase()} / RX 0x${analysis.ecuConfig.rxAddr.toString(16).toUpperCase()} @ ${analysis.ecuConfig.canSpeed}kbps` : 'CAN bus parameters unknown' },
                  { ok: true, text: `Flash type: ${effectiveFlashType === 'fullflash' ? 'Full Flash (OS + Cal)' : 'Calibration Only'}` },
                  { ok: !analysis.securityInfo.requiresUnlockBox, text: analysis.securityInfo.requiresUnlockBox ? 'Hardware unlock box required — ensure connected' : `Standard security — seed level 0x${analysis.securityInfo.seedLevel.toString(16).padStart(2, '0')}` },
                  { ok: false, text: 'VOP 3.0 hardware bridge — not connected' },
                ].map((req, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {req.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    <span className={req.ok ? 'text-zinc-300' : 'text-zinc-500'}>{req.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Block Transfer Map (DevProg containers) */}
            {analysis.devProgHeader && analysis.devProgHeader.blocks.length > 0 && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-200 mb-3">
                  <Database className="w-4 h-4 inline mr-1.5 text-amber-400" />
                  Block Transfer Map
                </h3>
                <div className="space-y-1.5">
                  {analysis.devProgHeader.blocks.map((block, i) => {
                    const isOS = block.OS === 'true' || block.OS === 'patch' || block.OS === 'forcepatch';
                    const isPatch = block.OS === 'patch' || block.OS === 'forcepatch';
                    const willFlash = effectiveFlashType === 'fullflash' || !isOS;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-2 rounded-md border text-xs ${
                        !willFlash ? 'border-zinc-800 bg-zinc-900/30 opacity-50'
                        : isOS ? 'border-orange-500/20 bg-orange-500/5'
                        : 'border-emerald-500/20 bg-emerald-500/5'
                      }`}>
                        <div className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold ${
                          isOS ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {block.block_id}
                        </div>
                        <div className="flex-1">
                          <span className="font-mono text-zinc-300">
                            {block.start_adresse && block.end_adresse
                              ? `0x${block.start_adresse} → 0x${block.end_adresse}`
                              : `Block #${block.block_id}`
                            }
                          </span>
                          <span className="ml-2 text-zinc-500">
                            {isPatch ? 'PATCH' : isOS ? 'OS' : 'CAL'}
                            {block.LzssLen ? ` (LZSS: ${parseInt(block.LzssLen, 16).toLocaleString()} bytes)` : ''}
                            {block.block_length ? ` — ${parseInt(block.block_length, 16).toLocaleString()} bytes` : ''}
                          </span>
                        </div>
                        <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          willFlash ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'
                        }`}>
                          {willFlash ? 'FLASH' : 'SKIP'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Datalogger Bridge Note */}
            <div className="p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-blue-300">Datalogger Bridge</div>
                  <div className="text-xs text-blue-400/70 mt-1">
                    The VOP 3.0 datalogger can also serve as a flash bridge — connect via the same
                    WiFi/BLE channel used for live data logging. Flash container will be queued
                    after current logging session completes.
                  </div>
                </div>
              </div>
            </div>

            {/* DevProg Security Info */}
            {analysis.devProgHeader && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-200 mb-3">
                  <Lock className="w-4 h-4 inline mr-1.5 text-amber-400" />
                  Container Security
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-zinc-800/50 rounded">
                    <div className="text-zinc-500">File ID</div>
                    <div className="font-mono text-zinc-300 truncate">{analysis.devProgHeader.fileId || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-zinc-800/50 rounded">
                    <div className="text-zinc-500">UDID</div>
                    <div className="font-mono text-zinc-300 truncate">{analysis.devProgHeader.udid || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-zinc-800/50 rounded">
                    <div className="text-zinc-500">Seed</div>
                    <div className="font-mono text-zinc-300 truncate">{analysis.devProgHeader.seed || 'N/A'}</div>
                  </div>
                  <div className="p-2 bg-zinc-800/50 rounded">
                    <div className="text-zinc-500">Key</div>
                    <div className="font-mono text-zinc-300 truncate">{analysis.devProgHeader.key || 'N/A'}</div>
                  </div>
                  {analysis.devProgHeader.expireDate > 0 && (
                    <div className="p-2 bg-zinc-800/50 rounded col-span-2">
                      <div className="text-zinc-500">Expires</div>
                      <div className="font-mono text-zinc-300">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(analysis.devProgHeader.expireDate * 1000).toLocaleString()}
                        {analysis.devProgHeader.maxFlashCount > 0 && ` — ${analysis.devProgHeader.maxFlashCount} flash(es) remaining`}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PCAN Flash Section ── */}
        {activeSection === 'pcan' && (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">PCAN Hardware Flash</h3>
                  <p className="text-[10px] text-zinc-500">Flash ECU via PCAN-USB adapter — requires physical CAN bus connection</p>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                {[
                  { status: analysis.ecuConfig ? 'ok' : 'warn', text: analysis.ecuConfig ? `Target: ${analysis.ecuConfig.name} (${analysis.ecuConfig.protocol})` : 'ECU config not found — will use default CAN addresses' },
                  { status: analysis.valid ? 'ok' : 'fail', text: 'Container validated and CRC32 verified' },
                  { status: !flashPlan ? 'fail' : flashPlan.validationErrors.length > 0 ? 'fail' : 'ok', text: flashPlan ? `Flash plan: ${flashPlan.totalBlocks} blocks, ${formatBytes(flashPlan.totalBytes)}` : 'Flash plan generation failed' },
                  { status: pcanBridgeAvailable === true ? 'ok' : checkingBridge ? 'warn' : 'fail', text: checkingBridge ? 'Checking PCAN-USB bridge...' : pcanBridgeAvailable === true ? `PCAN-USB bridge detected${pcanBridgeUrl ? ` (${pcanBridgeUrl.startsWith('wss') ? 'secure' : 'standard'})` : ''}` : 'PCAN-USB bridge — not detected (ensure pcan_bridge.py is running)' },
                ].map((req, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {req.status === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : req.status === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    <span className={req.status === 'ok' ? 'text-zinc-300' : req.status === 'warn' ? 'text-amber-400/80' : 'text-zinc-500'}>{req.text}</span>
                  </div>
                ))}
                {flashPlan && flashPlan.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {flashPlan.warnings.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 pl-5">
                        <Info className="w-3 h-3 text-amber-400/60" />
                        <span className="text-amber-400/60 text-[10px]">{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleLaunch('pcan')}
                disabled={!flashPlan || flashPlan.validationErrors.length > 0 || !pcanBridgeAvailable}
                title={flashPlan?.validationErrors.length ? flashPlan.validationErrors.join(', ') : undefined}
                className="mt-4 w-full py-3 rounded-lg bg-gradient-to-r from-red-600 to-orange-600 text-white font-bold text-sm hover:from-red-500 hover:to-orange-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Radio className="w-4 h-4 inline mr-2" />
                Launch PCAN Flash
              </button>
              {pcanBridgeAvailable === false && (
                <button
                  onClick={checkPcanBridge}
                  disabled={checkingBridge}
                  className="mt-2 w-full py-2 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:border-zinc-600 hover:text-zinc-300 transition-all disabled:opacity-40"
                >
                  {checkingBridge ? 'Checking...' : '↻ Re-check PCAN Bridge Connection'}
                </button>
              )}
            </div>
            <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/20 text-xs text-amber-400/80">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              PCAN flash requires a physical PCAN-USB adapter connected to the vehicle's OBD-II port.
              Ensure ignition is ON and battery voltage is stable before proceeding.
            </div>
          </div>
        )}

        {/* ── Simulator Section ── */}
        {activeSection === 'simulator' && (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Flash Simulator</h3>
                  <p className="text-[10px] text-zinc-500">Simulate the full flash sequence without hardware — safe for testing and training</p>
                </div>
              </div>
              {flashPlan && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="p-2 bg-zinc-800/50 rounded text-center">
                    <div className="text-lg font-bold text-cyan-400">{flashPlan.totalBlocks}</div>
                    <div className="text-[10px] text-zinc-500">Blocks</div>
                  </div>
                  <div className="p-2 bg-zinc-800/50 rounded text-center">
                    <div className="text-lg font-bold text-cyan-400">{flashPlan.commands.length}</div>
                    <div className="text-[10px] text-zinc-500">Commands</div>
                  </div>
                  <div className="p-2 bg-zinc-800/50 rounded text-center">
                    <div className="text-lg font-bold text-cyan-400">{formatBytes(flashPlan.totalBytes)}</div>
                    <div className="text-[10px] text-zinc-500">Total Data</div>
                  </div>
                </div>
              )}
              <button
                onClick={() => handleLaunch('simulator')}
                disabled={!flashPlan || flashPlan.validationErrors.length > 0}
                title={flashPlan?.validationErrors.length ? flashPlan.validationErrors.join(', ') : undefined}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:from-cyan-500 hover:to-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Activity className="w-4 h-4 inline mr-2" />
                Launch Simulator
              </button>
            </div>
            <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20 text-xs text-blue-400/80">
              <Info className="w-3.5 h-3.5 inline mr-1.5" />
              The simulator runs the full flash sequence with realistic timing and CAN bus emulation.
              No hardware required — all events are logged to the session history.
            </div>
          </div>
        )}

        {/* ── Dashboard Section ── */}
        {activeSection === 'dashboard' && (
          <FlashDashboard />
        )}
      </div>
    </div>
  );
}
