/**
 * FlashContainerPanel — ECU Flash Container Analysis & Upload Tool
 *
 * Features:
 * - PPEI and DevProg V2 container header parsing and display
 * - Calibration Flash / Full Flash toggle
 * - Flash readiness checklist with pass/fail/warn indicators
 * - Hex viewer for binary inspection
 * - Flash sequence visualization with ECU-specific steps
 * - Upload-to-flasher (WiFi URL / BLE transfer prep) — `flash.prepareForTransfer` → object storage
 * - 50+ ECU platform support from shared ECU database
 *
 * Flash tab entry: **ECU Scan** (vehicle first) or **Tune Deploy** (library). Open container after scan when you know which file matches.
 *
 * Vehicle / cloud matching:
 * - ECU Scan compares live ECU cal part numbers to ContainerFileHeader `sw_c1`..`sw_c9` (see `compareWithContainer`).
 * - DevProg `softwareNumbers` / PPEI `partNumbers` map into those slots as parsed — empty slots stay empty (no Tune Deploy backfill into the header).
 * - **Tune Deploy** tab: same parser + team library (R2) for cal binaries — optional analyze still reports detected tokens in the UI only.
 */

import { useState, useCallback, useRef, useMemo, useEffect, type MutableRefObject } from 'react';
import { trpc } from '@/lib/trpc';
import PreFlightChecklist from './PreFlightChecklist';
import FlashMissionControl from './FlashMissionControl';
import FlashDashboard from './FlashDashboard';
import EcuScanPanel from './EcuScanPanel';
import {
  type FlashPlan,
  generateFlashPlan, formatBytes,
} from '../../../shared/pcanFlashOrchestrator';
import { type ContainerFileHeader as EcuContainerFileHeader } from '../../../shared/ecuDatabase';
import { WebsocketCanBridgeConnection } from '../lib/websocketCanBridgeConnection';
import { VopCan2UsbConnection, getSharedVopCan2UsbConnection } from '../lib/vopCan2UsbConnection';
import type { FlashBridgeConnection } from '../lib/flashBridgeConnection';
import {
  parsePpeiContainer,
  type FlashContainerAnalysis,
  type FlashType,
} from '../lib/flashContainerParser';
import { calibrationListToSwFields } from '@shared/containerCalibrationSlots';
import type { TuneDeployParsedMetadata } from '@shared/tuneDeploySchemas';
import { GUEST_OPEN_ID } from '@shared/guestUser';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import {
  Upload, FileCheck, Shield, Cpu, Zap, AlertTriangle,
  CheckCircle2, XCircle, Info, ChevronDown, ChevronRight,
  HardDrive, Binary, Wifi, Bluetooth, RotateCcw, Eye,
  Database, Clock, Lock, Activity, BarChart3, Search,
  Layers, Radio, Usb,
} from 'lucide-react';
import TuneDeployWorkspace from '@/components/tune-deploy/TuneDeployWorkspace';
import {
  loadEcuContainerSession,
  type StoredEcuScanTransport,
} from '../lib/ecuContainerSessionStorage';
import { saveFlashRescueMeta, loadFlashRescueMeta } from '../lib/flashRescueMeta';

type FlashConnectionMode = 'simulator' | 'pcan' | 'vop_usb';

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
  const { user } = useAuth();
  const signedInForTuneDeploy = Boolean(user && user.openId !== GUEST_OPEN_ID);
  /** Dev server allows analyze without OAuth; library/upload still needs real sign-in. */
  const canRunTuneDeployAnalyze = signedInForTuneDeploy || import.meta.env.DEV;

  /** Tune Deploy = calibration library / R2 pipeline; ECU Scan = connect to vehicle first, then open container */
  const [flashWorkspace, setFlashWorkspace] = useState<'ecuScan' | 'tuneDeploy'>('ecuScan');
  const [analysis, setAnalysis] = useState<FlashContainerAnalysis | null>(null);
  /** Tune Deploy analyze — informational only (UI); not merged into ContainerFileHeader */
  const [autoIdentifiedMeta, setAutoIdentifiedMeta] = useState<TuneDeployParsedMetadata | null>(null);
  const [rawData, setRawData] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [flashTypeOverride, setFlashTypeOverride] = useState<FlashType | null>(null);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'ready' | 'uploading' | 'done'>('idle');
  const [missionControlMode, setMissionControlMode] = useState<FlashConnectionMode | null>(null);
  const [showPreFlight, setShowPreFlight] = useState(false);
  const [pendingMode, setPendingMode] = useState<FlashConnectionMode | null>(null);
  const [dryRunMode, setDryRunMode] = useState(false);
  const [fileHash, setFileHash] = useState<string>('');
  const [sessionUuid, setSessionUuid] = useState<string>('');
  const [localBridgeAvailable, setLocalBridgeAvailable] = useState<boolean | null>(null);
  const [localBridgeUrl, setLocalBridgeUrl] = useState<string | null>(null);
  const [checkingBridge, setCheckingBridge] = useState(false);
  const wsBridgeConnectionRef = useRef<WebsocketCanBridgeConnection | null>(null);
  /** URL used for `wsBridgeConnectionRef` — reuse instance when unchanged, avoid stale sockets. */
  const lastWsBridgeFlashUrlRef = useRef<string | null>(null);
  const vopConnectionRef = useRef<VopCan2UsbConnection | null>(null);
  const [vopUsbIdentity, setVopUsbIdentity] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vopUsbSupported = useMemo(
    () => typeof window !== 'undefined' && VopCan2UsbConnection.isSupported(),
    [],
  );

  // Keep a live snapshot of the V-OP USB bridge identity for header UI (ref changes do not re-render).
  useEffect(() => {
    const v = getSharedVopCan2UsbConnection();
    const sync = () => {
      const vi = v.getVehicleInfo();
      const id = [vi.vopDeviceName, vi.vopDeviceSerial].filter(Boolean).join(' · ') || vi.vopDeviceIdentity || '';
      setVopUsbIdentity(id || null);
    };
    const onVehicle = () => sync();
    const onState = (e: unknown) => {
      // `stateChange` emits the raw state string as data; clear on disconnect.
      if (e === 'disconnected') setVopUsbIdentity(null);
    };
    v.on('vehicleInfo', onVehicle);
    v.on('stateChange', onState as any);
    sync();
    return () => {
      v.off('vehicleInfo', onVehicle);
      v.off('stateChange', onState as any);
    };
  }, []);

  /** Transport last chosen on ECU Scan (local bridge vs V-OP) — drives live flash hardware. */
  const [flashScanTransport, setFlashScanTransport] = useState<StoredEcuScanTransport | null>(null);

  useEffect(() => {
    const read = () => {
      const t = loadEcuContainerSession()?.lastScanTransport;
      setFlashScanTransport(t === 'bridge' || t === 'vop' ? t : null);
    };
    read();
    const onTransport = (e: Event) => {
      const d = (e as CustomEvent<StoredEcuScanTransport>).detail;
      if (d === 'bridge' || d === 'vop') setFlashScanTransport(d);
    };
    window.addEventListener('goodGravy:ecuScanTransport', onTransport);
    return () => window.removeEventListener('goodGravy:ecuScanTransport', onTransport);
  }, []);

  useEffect(() => {
    const t = loadEcuContainerSession()?.lastScanTransport;
    setFlashScanTransport(t === 'bridge' || t === 'vop' ? t : null);
  }, [analysis, flashWorkspace]);

  const resolvedLiveFlashMode = useMemo((): FlashConnectionMode => {
    if (flashScanTransport === 'vop') return 'vop_usb';
    if (flashScanTransport === 'bridge') return 'pcan';
    if (localBridgeAvailable === true) return 'pcan';
    if (vopUsbSupported) return 'vop_usb';
    return 'pcan';
  }, [flashScanTransport, localBridgeAvailable, vopUsbSupported]);

  const createSession = trpc.flash.createSession.useMutation();

  const effectiveFlashType: FlashType = flashTypeOverride ?? analysis?.flashType ?? 'unknown';

  // Probe local python WebSocket bridge (UI only). Does not open a transport — availability must not imply selection.
  const checkLocalBridge = useCallback(async () => {
    setCheckingBridge(true);
    try {
      const result = await WebsocketCanBridgeConnection.isBridgeAvailable();
      setLocalBridgeAvailable(result.available);
      if (result.available && result.url) {
        setLocalBridgeUrl(result.url);
      } else {
        setLocalBridgeUrl(null);
      }
    } catch {
      setLocalBridgeAvailable(false);
      setLocalBridgeUrl(null);
    } finally {
      setCheckingBridge(false);
    }
  }, []);

  /** Create/reuse WebSocket bridge client when the user commits to live flash after pre-flight (session API still uses connectionMode `pcan`). */
  const ensureWsBridgeForFlash = useCallback(async () => {
    setCheckingBridge(true);
    try {
      const result = await WebsocketCanBridgeConnection.isBridgeAvailable();
      setLocalBridgeAvailable(result.available);
      setLocalBridgeUrl(result.available ? result.url : null);
      if (!result.available || !result.url) {
        throw new Error('Local CAN bridge not detected — run the Python bridge with your adapter connected.');
      }
      const url = result.url;
      if (wsBridgeConnectionRef.current && lastWsBridgeFlashUrlRef.current === url) {
        return;
      }
      if (wsBridgeConnectionRef.current) {
        await wsBridgeConnectionRef.current.disconnect();
        wsBridgeConnectionRef.current = null;
      }
      wsBridgeConnectionRef.current = new WebsocketCanBridgeConnection({ bridgeUrl: url, requestTimeout: 30000 });
      lastWsBridgeFlashUrlRef.current = url;
    } finally {
      setCheckingBridge(false);
    }
  }, []);

  // Check bridge when ECU Scan workspace is shown or a container is loaded (Flash now)
  useEffect(() => {
    if (
      (flashWorkspace === 'ecuScan' || analysis)
      && localBridgeAvailable === null
    ) {
      checkLocalBridge();
    }
  }, [flashWorkspace, analysis, localBridgeAvailable, checkLocalBridge]);

  // Removed tabs: migrate stale section ids from older UI state
  useEffect(() => {
    if (activeSection === 'ecuscan' || activeSection === 'hardware_flash') {
      setActiveSection('overview');
    }
  }, [activeSection]);

  /**
   * Tune Deploy analyze API — same heuristics as the library uploader.
   * Does not modify the parsed container header — see Auto-ID line in Overview.
   */
  useEffect(() => {
    if (!rawData || !canRunTuneDeployAnalyze || !fileName) {
      setAutoIdentifiedMeta(null);
      return;
    }
    const ac = new AbortController();
    const run = async () => {
      try {
        const blob = new Blob([new Uint8Array(rawData)], { type: 'application/octet-stream' });
        const res = await fetch('/api/tune-deploy/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(fileName),
          },
          body: blob,
          credentials: 'include',
          signal: ac.signal,
        });
        const j = (await res.json()) as { ok?: boolean; meta?: TuneDeployParsedMetadata };
        if (ac.signal.aborted) return;
        if (j.ok && j.meta) setAutoIdentifiedMeta(j.meta);
        else setAutoIdentifiedMeta(null);
      } catch {
        if (!ac.signal.aborted) setAutoIdentifiedMeta(null);
      }
    };
    void run();
    return () => ac.abort();
  }, [rawData, canRunTuneDeployAnalyze, fileName]);

  // ContainerFileHeader for flash plan, ECU scan (`compareWithContainer`), and WiFi/BLE transfer prep
  const containerFileHeader = useMemo((): EcuContainerFileHeader | null => {
    if (!analysis) return null;
    const dp = analysis.devProgHeader;
    if (dp) {
      let h: EcuContainerFileHeader = {
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
        ...calibrationListToSwFields(dp.softwareNumbers),
        verify: dp.verify ? {
          controller_type: dp.verify.controllerType,
          canspeed: dp.verify.canSpeed,
          txadr: dp.verify.txAddr,
          rxadr: dp.verify.rxAddr,
          txprefix: dp.verify.txprefix,
          rxprefix: dp.verify.rxprefix,
        } : undefined,
      };
      return h;
    }
    const hHdr = analysis.header;
    if (hHdr) {
      let h: EcuContainerFileHeader = {
        offset: '0', flashernumber: 0, udid: '', vin: '', seed: '', key: '',
        file_id: '', create_date: 0, expire_date: 0, max_flash_count: 0,
        header_length: '0', block_count: 1, block_boot: 0, block_erase: 0,
        file_size: analysis.totalSize.toString(16), comp_enc: '0',
        lzss: 'false', xferSize: '0', ForceOS: hHdr.isFullFlash ? 'true' : 'false',
        block_struct: [{ block_id: 0, start_adresse: analysis.dataOffset.toString(16), end_adresse: (analysis.dataOffset + analysis.dataSize).toString(16), block_length: analysis.dataSize.toString(16), OS: hHdr.isFullFlash ? 'true' : 'false' }],
        ecu_type: hHdr.ecuType || analysis.ecuFamily, hardware_number: '',
        ...calibrationListToSwFields(hHdr.partNumbers),
      };
      return h;
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
    const hashBuffer = await crypto.subtle.digest('SHA-256', data.slice());
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  const handleLaunch = useCallback((mode: FlashConnectionMode, isDryRun = false) => {
    setPendingMode(mode);
    setDryRunMode(isDryRun);
    setShowPreFlight(true);
  }, []);

  // After pre-flight passes, create session and launch MissionControl
  const handlePreFlightPassed = useCallback(async () => {
    if (!pendingMode || !analysis || !flashPlan) return;
    setShowPreFlight(false);
    try {
      if (pendingMode === 'pcan') {
        await ensureWsBridgeForFlash();
        void vopConnectionRef.current?.disconnect();
        vopConnectionRef.current = null;
      } else if (pendingMode === 'vop_usb') {
        if (wsBridgeConnectionRef.current) {
          await wsBridgeConnectionRef.current.disconnect();
          wsBridgeConnectionRef.current = null;
        }
        lastWsBridgeFlashUrlRef.current = null;
        if (!vopConnectionRef.current) {
          vopConnectionRef.current = getSharedVopCan2UsbConnection();
        }
      }
      const ecuType = analysis.ecuConfig?.ecuType || analysis.devProgHeader?.ecuType || analysis.ecuFamily;
      const uuid = crypto.randomUUID();
      const result = await createSession.mutateAsync({
        uuid, ecuType, connectionMode: pendingMode, fileName,
        fileHash: fileHash || undefined,
        flashMode: effectiveFlashType === 'fullflash' ? 'full_flash' : 'calibration',
        totalBlocks: flashPlan.totalBlocks, totalBytes: flashPlan.totalBytes,
      });
      if (fileHash) {
        saveFlashRescueMeta({ fileName, fileHash, ecuType });
      }
      setSessionUuid(result.uuid);
      setMissionControlMode(pendingMode);
    } catch (err) {
      console.error('Failed to create flash session:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setShowPreFlight(true);
    }
  }, [pendingMode, analysis, flashPlan, fileName, fileHash, effectiveFlashType, createSession, ensureWsBridgeForFlash]);

  // Handle MissionControl completion
  const handleFlashComplete = useCallback((result: 'SUCCESS' | 'FAILED' | 'ABORTED') => {
    setMissionControlMode(null);
    setSessionUuid('');
    setPendingMode(null);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setFileError(null);
    setFileName(file.name);
    // Prevent Tune Deploy metadata / merged headers from the previous file affecting this parse
    setAutoIdentifiedMeta(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setRawData(bytes);

      // Compute file hash
      computeFileHash(bytes).then(h => setFileHash(h));

      // Always run the full parser — `isPpeiContainer()` was a separate gate and could disagree
      // with `parsePpeiContainer()` (same bytes, different accept/reject).
      const result = parsePpeiContainer(buffer, file.name);
      setAnalysis(result);
      setFlashTypeOverride(null);
      setUploadStatus(result.valid ? 'ready' : 'idle');
      setActiveSection(result.valid ? 'overview' : 'readiness');
      if (result.valid) {
        toast.success('Container loaded', {
          description: 'Review Readiness and Hardware Flash when you are ready to program.',
        });
      } else {
        toast.message('Container parsed with issues', {
          description: 'Open the Readiness tab for details before flashing.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to parse container:', err);
      setFileError(msg);
      setRawData(null);
      setAnalysis(null);
    } finally {
      setIsLoading(false);
    }
  }, [computeFileHash]);

  const onContainerFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  /** Opens the OS file picker after the current frame (works after closing Radix dialogs). */
  const triggerPickContainerFile = useCallback(() => {
    requestAnimationFrame(() => {
      fileInputRef.current?.click();
    });
  }, []);

  /** Hidden file input — mounted on every Flash-tab branch so the ref works from ECU Scan / overlays. */
  const containerFileInputEl = (
    <input
      key="flash-container-file"
      ref={fileInputRef}
      type="file"
      accept=".bin,.hex,.cal,.Bin,.BIN"
      className="hidden"
      onChange={onContainerFileInputChange}
    />
  );

  /** Pick another container file and re-run parse — keeps ECU Scan workspace (no full reset). */
  const openReplaceFilePicker = useCallback(() => {
    setMissionControlMode(null);
    setShowPreFlight(false);
    setPendingMode(null);
    setDryRunMode(false);
    setSessionUuid('');
    setFileError(null);
    triggerPickContainerFile();
  }, [triggerPickContainerFile]);

  const workspaceToggle = (
    <div className="flex items-center justify-between gap-2 mb-4 p-1 rounded-xl bg-zinc-900/60 border border-zinc-800">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFlashWorkspace('ecuScan')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
            flashWorkspace === 'ecuScan'
              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
              : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          ECU SCAN
        </button>
        <button
          type="button"
          onClick={() => setFlashWorkspace('tuneDeploy')}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
            flashWorkspace === 'tuneDeploy'
              ? 'bg-red-500/20 text-red-200 border border-red-500/40'
              : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          TUNE DEPLOY
        </button>
      </div>
      {vopUsbIdentity && (
        <div
          className="hidden sm:flex items-center gap-1.5 pr-2 text-[10px] font-['Share_Tech_Mono',monospace] text-zinc-500 max-w-[40%] truncate"
          title={vopUsbIdentity}
        >
          <Usb className="w-3.5 h-3.5 text-violet-300/70" />
          <span className="truncate">{vopUsbIdentity}</span>
        </div>
      )}
    </div>
  );

  if (flashWorkspace === 'tuneDeploy') {
    return (
      <>
        {containerFileInputEl}
        <div className="h-full flex flex-col min-h-0">
          {workspaceToggle}
          <div className="flex-1 min-h-0 overflow-auto">
            <TuneDeployWorkspace />
          </div>
        </div>
      </>
    );
  }

  const resetAll = () => {
    setAnalysis(null);
    setRawData(null);
    setAutoIdentifiedMeta(null);
    setFileError(null);
    setFileName('');
    setFlashTypeOverride(null);
    setUploadStatus('idle');
    setActiveSection('overview');
    setMissionControlMode(null);
    setShowPreFlight(false);
    setPendingMode(null);
    setFileHash('');
    setSessionUuid('');
    setLocalBridgeAvailable(null);
    setLocalBridgeUrl(null);
    void wsBridgeConnectionRef.current?.disconnect();
    wsBridgeConnectionRef.current = null;
    lastWsBridgeFlashUrlRef.current = null;
    void vopConnectionRef.current?.disconnect();
    vopConnectionRef.current = null;
  };

  // ── ECU Scan first: connect & read DIDs, then open matching container ─────

  if (!analysis) {
    return (
      <>
        {containerFileInputEl}
        <div className="h-full flex flex-col min-h-0 relative">
          {isLoading && (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/70 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <Cpu className="w-8 h-8 text-cyan-400 animate-pulse" />
              <p className="text-xs font-mono text-zinc-200">Reading container…</p>
            </div>
          )}
          {workspaceToggle}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
            <EcuScanPanel
              wsBridgeConnection={wsBridgeConnectionRef.current}
              vopConnection={vopConnectionRef.current}
              vopSupported={vopUsbSupported}
              containerHeader={null}
              bridgeAvailable={localBridgeAvailable === true}
              bridgeUrl={localBridgeUrl}
              onVerifiedContainerLoad={handleFile}
              onRequestPickContainer={triggerPickContainerFile}
              lastFlashRescueMeta={loadFlashRescueMeta()}
            />

            <p className="text-[11px] text-zinc-500 leading-relaxed border border-zinc-800/80 rounded-lg px-3 py-2 bg-zinc-900/40">
            Open a matching PPEI / DevProg container when the scan reports a good match — use{' '}
            <span className="text-zinc-400">Load verified match</span> on the scan results. After a container is loaded, use{' '}
            <span className="text-zinc-400">Load different file</span> in the header to replace it.
          </p>
            {fileError && (
              <p className="text-[11px] text-red-400/95 mt-2">{fileError}</p>
            )}
          </div>
        </div>
      </>
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
    { id: 'simulator', label: 'Simulator', icon: Activity },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  ];

  const liveFlashBridgeDisabled =
    !flashPlan ||
    flashPlan.validationErrors.length > 0 ||
    localBridgeAvailable !== true;
  const liveFlashVopDisabled =
    !flashPlan ||
    flashPlan.validationErrors.length > 0 ||
    !vopUsbSupported;
  const liveFlashStartDisabled =
    resolvedLiveFlashMode === 'pcan' ? liveFlashBridgeDisabled : liveFlashVopDisabled;
  const liveFlashPlanTitle = !flashPlan
    ? 'Build flash plan first'
    : flashPlan.validationErrors.length > 0
      ? flashPlan.validationErrors.join('; ')
      : undefined;

  // ── MissionControl overlay ──────────────────────────────────────────────
  if (missionControlMode && flashPlan && sessionUuid) {
    return (
      <>
        {containerFileInputEl}
        <div className="h-full flex flex-col">
          <FlashMissionControl
          plan={flashPlan}
          connectionMode={missionControlMode}
          sessionUuid={sessionUuid}
          onComplete={handleFlashComplete}
          onBack={() => { setMissionControlMode(null); setSessionUuid(''); setDryRunMode(false); }}
          flashBridge={
            missionControlMode === 'pcan' && wsBridgeConnectionRef.current
              ? (wsBridgeConnectionRef.current as unknown as FlashBridgeConnection)
              : missionControlMode === 'vop_usb' && vopConnectionRef.current
                ? (vopConnectionRef.current as FlashBridgeConnection)
                : null
          }
          flashBridgeRef={
            missionControlMode === 'pcan'
              ? (wsBridgeConnectionRef as MutableRefObject<FlashBridgeConnection | null>)
              : missionControlMode === 'vop_usb'
                ? (vopConnectionRef as MutableRefObject<FlashBridgeConnection | null>)
                : undefined
          }
          containerData={rawData ? new Uint8Array(rawData).buffer : null}
          containerHeader={containerFileHeader}
          dryRun={dryRunMode}
        />
        </div>
      </>
    );
  }

  // ── PreFlight overlay ──────────────────────────────────────────────────
  if (showPreFlight && pendingMode && analysis) {
    const ecuType = analysis.ecuConfig?.ecuType || analysis.devProgHeader?.ecuType || analysis.ecuFamily;
    return (
      <>
        {containerFileInputEl}
        <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Pre-Flight Diagnostics</h2>
            <p className="text-xs text-zinc-500">
              Validating ECU and container before{' '}
              {pendingMode === 'vop_usb' ? 'V-OP USB2CAN' : pendingMode === 'pcan' ? 'Local WebSocket bridge' : pendingMode.toUpperCase()} flash
            </p>
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
      </>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {workspaceToggle}
      {containerFileInputEl}
      {analysis.errors.length > 0 && (
        <div className="mb-3 p-3 rounded-lg bg-red-950/50 border border-red-500/35 text-xs text-red-100/95 space-y-1">
          {analysis.errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openReplaceFilePicker}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-lg border border-orange-500/50 shadow-sm transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Load different file
          </button>
          <button
            type="button"
            onClick={resetAll}
            title="Clear container and return to ECU Scan"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset workspace
          </button>
        </div>
      </div>

      {/* Flash type + Flash now — only for recognized containers */}
      {analysis.valid && (
      <div className="mb-4 p-3 bg-zinc-900/80 rounded-lg border border-zinc-800 space-y-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <HardDrive className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="text-sm text-zinc-400 shrink-0">Flash type</span>
            <button
              type="button"
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
              type="button"
              onClick={() => setFlashTypeOverride('fullflash')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                effectiveFlashType === 'fullflash'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300'
              }`}
            >
              FULL FLASH
            </button>
          </div>
          <div className="flex flex-col gap-2 shrink-0 min-w-[min(100%,280px)]">
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => handleLaunch(resolvedLiveFlashMode, false)}
                disabled={liveFlashStartDisabled}
                title={
                  liveFlashPlanTitle
                  ?? (resolvedLiveFlashMode === 'pcan'
                    ? 'Live flash via local WebSocket bridge (same transport as ECU Scan when the bridge was selected)'
                    : 'Live flash via V-OP USB2CAN (same transport as ECU Scan when V-OP was selected)')
                }
                className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-white text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  resolvedLiveFlashMode === 'pcan'
                    ? 'bg-gradient-to-r from-red-600 to-orange-600 border-orange-500/50 hover:from-red-500 hover:to-orange-500'
                    : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 border-violet-500/40 hover:from-violet-500 hover:to-fuchsia-500'
                }`}
              >
                {resolvedLiveFlashMode === 'pcan'
                  ? <Radio className="w-3.5 h-3.5 shrink-0" />
                  : <Usb className="w-3.5 h-3.5 shrink-0" />}
                Start flash
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 text-right leading-snug">
              {flashScanTransport
                ? `Uses the same hardware as your last ECU Scan (${flashScanTransport === 'bridge' ? 'local bridge' : 'V-OP USB'}).`
                : 'Run ECU Scan and pick the local bridge or V-OP — that choice is used here. If none saved, the bridge is preferred when it is running, otherwise V-OP.'}
            </p>
          </div>
        </div>
        {flashTypeOverride && flashTypeOverride !== analysis.flashType && (
          <div className="text-[10px] text-amber-400">
            Override — container tagged as {analysis.flashType === 'fullflash' ? 'Full Flash' : 'Calibration'}
          </div>
        )}
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          {localBridgeAvailable !== true && !vopUsbSupported
            ? 'No local WebSocket bridge detected and Web Serial unavailable — use Simulator or run the Python bridge / Chrome (desktop).'
            : 'Dry run without hardware: Simulator tab. ECU Scan has its own adapter toggle — independent of Live flash here.'}
        </p>
      </div>
      )}

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
        {activeSection === 'overview' && !analysis.valid && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-red-500/40 bg-red-950/25">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-2 min-w-0">
                  <h3 className="text-sm font-semibold text-red-100">Container not recognized</h3>
                  <p className="text-xs text-red-200/85 leading-relaxed">
                    This file is not a supported V-OP / PPEI / DevProg flash container. Load a PPEI IPF, DevProg JSON @ 0x1004, or supported GM raw container.
                  </p>
                  {analysis.errors.length > 0 && (
                    <ul className="text-xs text-red-300/90 list-disc pl-4 space-y-1">
                      {analysis.errors.map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={openReplaceFilePicker}
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 border border-orange-500/50"
                  >
                    <Upload className="w-4 h-4" /> Load a different file
                  </button>
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800 text-xs text-zinc-500">
              Readiness tab lists the failed checks. Hex viewer can still inspect raw bytes if you need to confirm the file type.
            </div>
          </div>
        )}

        {activeSection === 'overview' && analysis.valid && (h || analysis.devProgHeader) && (
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

            {/* Tune Deploy ↔ ECU Scan / cloud transfer (sw_c1..9) */}
            <div className="p-4 rounded-lg border border-cyan-500/25 bg-cyan-950/30">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-300 space-y-2">
                  <p>
                    <span className="text-cyan-300 font-semibold">Vehicle match keys</span>
                    {' — ECU Scan compares your connected ECU to this file using '}
                    <code className="text-cyan-200/90 bg-zinc-900/80 px-1 rounded">sw_c1</code>
                    …
                    <code className="text-cyan-200/90 bg-zinc-900/80 px-1 rounded">sw_c9</code>
                    {' (same fields the old workflow required you to type by hand). Values come only from the parsed container; empty slots stay empty. When signed in, '}
                    <span className="text-cyan-200">Tune Deploy binary analysis</span>
                    {' may report extra tokens below for reference — they are not written into the header.'}
                  </p>
                  {!canRunTuneDeployAnalyze && (
                    <p className="text-amber-200/90">Sign in to run automatic binary analysis on this upload.</p>
                  )}
                  {canRunTuneDeployAnalyze && autoIdentifiedMeta && (
                    <p className="text-zinc-400">
                      Auto-ID: {autoIdentifiedMeta.calibrationPartNumbers.length} calibration token(s) detected
                      {autoIdentifiedMeta.osVersion ? ` · OS hint ${autoIdentifiedMeta.osVersion}` : ''}.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setFlashWorkspace('tuneDeploy')}
                    className="text-left text-cyan-400 hover:text-cyan-300 underline-offset-2 hover:underline font-medium"
                  >
                    Open Tune Deploy — index this tune in the team library (R2) for search & future auto-match
                  </button>
                </div>
              </div>
            </div>

            {containerFileHeader && [1, 2, 3, 4, 5, 6, 7, 8, 9].some((i) => {
              const v = containerFileHeader[`sw_c${i}` as keyof EcuContainerFileHeader];
              return typeof v === 'string' && v.trim().length > 0;
            }) && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
                  Match keys sent to ECU Scan / flasher cloud pipeline (sw_c1–sw_c9)
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
                    const v = containerFileHeader[`sw_c${i}` as keyof EcuContainerFileHeader];
                    if (typeof v !== 'string' || !v.trim()) return null;
                    return (
                      <span
                        key={i}
                        className="px-2.5 py-1 bg-cyan-950/50 rounded-md text-sm font-mono text-cyan-200 border border-cyan-800/50"
                      >
                        sw_c{i}: {v}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Part Numbers — PPEI header extraction; not the same as slot-by-slot sw_c match */}
            {h && h.partNumbers.length > 0 && (
              <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Part Numbers</div>
                <p className="text-[10px] text-zinc-500 mb-2 leading-relaxed">
                  From the PPEI header (unique 7–8 digit IDs). Vehicle match uses{' '}
                  <span className="text-zinc-400">sw_c1…sw_c9</span> above — same index as ECU C1…C9, not “number appears anywhere”.
                </p>
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
                Transfer the validated container to your VOP 3.0 hardware for ECU programming
                (server uploads payload via <code className="text-zinc-500">flash.prepareForTransfer</code> — same object storage path family as Tune Deploy).
                ECU Scan and the flasher use the populated <code className="text-zinc-500">sw_c1–sw_c9</code> keys from Overview so a connected vehicle can be matched to this tune without re-typing cal IDs.
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
