/**
 * EcuScanPanel — Pre-Flash Vehicle ECU Interrogation
 *
 * Scans all known CAN addresses, reads identifying DIDs,
 * calibration data from the ECU (GMLAN ReadDID / UDS as applicable). Per-ECU file/folder match; Flash-tab container vs first ECU.
 * Supports PCAN-USB (WebSocket bridge) and V-OP USB2CAN (Web Serial).
 */

import { useState, useCallback, useRef, useEffect, useMemo, type ChangeEvent } from 'react';
import { PCANConnection } from '../lib/pcanConnection';
import { VopCan2UsbConnection, getSharedVopCan2UsbConnection } from '../lib/vopCan2UsbConnection';
import {
  EcuScanner,
  compareWithContainer,
  type VehicleScanReport,
  type EcuScanResult,
  type ContainerComparison,
} from '../lib/ecuScanner';
import { type ContainerFileHeader } from '../../../shared/ecuDatabase';
import { gmCan2000DidShortName } from '../lib/gmCan2000DidReference';
import {
  persistLastVehicleScan,
  buildVehicleScanSnapshotV1,
} from '../lib/ecuContainerSessionStorage';
import {
  extractContainerMatchParamsFromBin,
  scoreContainerAgainstScan,
  isContainerMatchAcceptable,
  hasEcuTypeConflict,
  type MatchScoreResult,
} from '../../../shared/ecuContainerMatch';
import {
  Search, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Cpu, Radio, Clock,
  Shield, Hash, FileCheck, Loader2, StopCircle,
  Usb, Cloud, Upload,
} from 'lucide-react';

export type EcuScanTransportChoice = 'pcan' | 'vop';

interface EcuScanPanelProps {
  pcanConnection: PCANConnection | null;
  vopConnection: VopCan2UsbConnection | null;
  vopSupported: boolean;
  containerHeader: ContainerFileHeader | null;
  bridgeAvailable: boolean;
  bridgeUrl: string | null;
  /** After a successful match check, load this file into the Flash workspace (same as Open container). */
  onVerifiedContainerLoad?: (file: File) => void | Promise<void>;
}

export default function EcuScanPanel({
  pcanConnection,
  vopConnection,
  vopSupported,
  containerHeader,
  bridgeAvailable,
  bridgeUrl,
  onVerifiedContainerLoad,
}: EcuScanPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<VehicleScanReport | null>(null);
  const [expandedEcu, setExpandedEcu] = useState<number | null>(null);
  const scannerRef = useRef<EcuScanner | null>(null);
  const [scanTransport, setScanTransport] = useState<EcuScanTransportChoice>('pcan');
  type EcuLocalOpenState = {
    loading: boolean;
    probe: {
      fileName: string;
      score: MatchScoreResult | null;
      parseError: string | null;
      compatible: boolean;
    } | null;
    error: string | null;
  };
  const emptyLocalOpen = (): EcuLocalOpenState => ({
    loading: false,
    probe: null,
    error: null,
  });
  const [localOpenByEcu, setLocalOpenByEcu] = useState<Record<number, EcuLocalOpenState>>({});
  const fileInputEcuIdxRef = useRef<number | null>(null);
  const containerFileInputRef = useRef<HTMLInputElement>(null);

  const comparisonsWithFlashContainer = useMemo(() => {
    if (!report || !containerHeader) return null;
    return report.ecus.map(ecu =>
      ecu.responding ? compareWithContainer(ecu, containerHeader) : null,
    );
  }, [report, containerHeader]);

  const flashContainerComparison = useMemo(() => {
    if (!comparisonsWithFlashContainer || !report) return null;
    const idx = report.ecus.findIndex(e => e.responding);
    return idx >= 0 ? comparisonsWithFlashContainer[idx] : null;
  }, [comparisonsWithFlashContainer, report]);

  const processLocalContainerFileForEcu = useCallback(
    (ecuIdx: number, file: File) => {
      const ecu = report?.ecus[ecuIdx];
      if (!report || !ecu?.responding) {
        setLocalOpenByEcu(prev => ({
          ...prev,
          [ecuIdx]: {
            ...emptyLocalOpen(),
            error: 'Run an ECU scan and expand this ECU row before opening a container file.',
          },
        }));
        return;
      }

      setLocalOpenByEcu(prev => ({
        ...prev,
        [ecuIdx]: { ...emptyLocalOpen(), loading: true },
      }));

      void file
        .arrayBuffer()
        .then(buf => {
          const params = extractContainerMatchParamsFromBin(new Uint8Array(buf));
          if (!params) {
            setLocalOpenByEcu(prev => ({
              ...prev,
              [ecuIdx]: {
                loading: false,
                probe: {
                  fileName: file.name,
                  score: null,
                  parseError:
                    'Not a DevProg container (no JSON metadata at 0x1004). Expected V-OP / DevProg envelope.',
                  compatible: false,
                },
                error: null,
              },
            }));
            return;
          }
          const scan = buildVehicleScanSnapshotV1(ecu);
          const score = scoreContainerAgainstScan(params, scan);
          const compatible = isContainerMatchAcceptable(score);
          setLocalOpenByEcu(prev => ({
            ...prev,
            [ecuIdx]: {
              loading: false,
              probe: { fileName: file.name, score, parseError: null, compatible },
              error: null,
            },
          }));
          if (compatible && onVerifiedContainerLoad) {
            void Promise.resolve(onVerifiedContainerLoad(file)).catch(err => {
              console.error('[ECU Scan] load verified container failed', err);
            });
          }
        })
        .catch(err => {
          setLocalOpenByEcu(prev => ({
            ...prev,
            [ecuIdx]: {
              loading: false,
              probe: null,
              error: err instanceof Error ? err.message : String(err),
            },
          }));
        });
    },
    [report, onVerifiedContainerLoad],
  );

  const onOpenLocalContainerClick = useCallback((ecuIdx: number) => {
    fileInputEcuIdxRef.current = ecuIdx;
    containerFileInputRef.current?.click();
  }, []);

  const onContainerFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const idx = fileInputEcuIdxRef.current;
      e.target.value = '';
      if (!file || idx == null) return;
      processLocalContainerFileForEcu(idx, file);
    },
    [processLocalContainerFileForEcu],
  );

  useEffect(() => {
    if (!bridgeAvailable && vopSupported) {
      setScanTransport('vop');
    }
  }, [bridgeAvailable, vopSupported]);

  const canStartPcan = bridgeAvailable && Boolean(pcanConnection || bridgeUrl);
  const canStartVop = vopSupported;
  const scanEnabled =
    scanTransport === 'pcan' ? canStartPcan : canStartVop;

  const startScan = useCallback(async () => {
    if (scanTransport === 'pcan' && !canStartPcan) return;
    if (scanTransport === 'vop' && !canStartVop) return;

    setScanning(true);
    setReport(null);
    setLocalOpenByEcu({});

    try {
      if (scanTransport === 'pcan') {
        let conn = pcanConnection;
        if (!conn && bridgeUrl) {
          conn = new PCANConnection({ bridgeUrl, requestTimeout: 10000 });
        }
        if (!conn) return;

        const state = conn.getState();
        if (state === 'disconnected' || state === 'error') {
          await conn.connect({ skipVehicleInit: true });
        }

        const scanner = new EcuScanner(conn, containerHeader ?? undefined, { skipVehicleInit: true });
        scannerRef.current = scanner;

        const result = await scanner.scanVehicle((progress) => {
          setReport({ ...progress });
        });

        setReport(result);

        const firstResponding = result.ecus.findIndex(e => e.responding);
        if (firstResponding >= 0) {
          setExpandedEcu(firstResponding);
          persistLastVehicleScan(result.ecus[firstResponding]!);
        }
        return;
      }

      const v = vopConnection ?? getSharedVopCan2UsbConnection();
      const state = v.getState();
      if (state === 'disconnected' || state === 'error') {
        const ok = await v.connect({ skipVehicleInit: true });
        if (!ok) return;
      }

      const scanner = new EcuScanner(v, containerHeader ?? undefined, { skipVehicleInit: true });
      scannerRef.current = scanner;

      const result = await scanner.scanVehicle((progress) => {
        setReport({ ...progress });
      });

      setReport(result);

      const firstResponding = result.ecus.findIndex(e => e.responding);
      if (firstResponding >= 0) {
        setExpandedEcu(firstResponding);
        persistLastVehicleScan(result.ecus[firstResponding]!);
      }
    } catch (err) {
      console.error('[ECU Scan] Error:', err);
    } finally {
      setScanning(false);
      scannerRef.current = null;
    }
  }, [
    scanTransport,
    canStartPcan,
    canStartVop,
    pcanConnection,
    bridgeUrl,
    vopConnection,
    containerHeader,
  ]);

  const abortScan = useCallback(() => {
    scannerRef.current?.abort();
  }, []);

  return (
    <div className="space-y-4">
      {/* Always mounted so ref is valid before first scan completes (fixes no-op file picker). */}
      <input
        ref={containerFileInputRef}
        type="file"
        accept=".bin,application/octet-stream"
        className="hidden"
        onChange={onContainerFileInputChange}
      />

      {/* Header */}
      <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Search className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-zinc-100">ECU Scanner</h3>
            <p className="text-[10px] text-zinc-500">
              Read ECU identification and calibration data on the vehicle. After a scan, open a matching local{' '}
              <span className="font-mono">.bin</span> per ECU — we verify calibration slots, then load the container for
              flashing. The container opened on the Flash tab is compared to the{' '}
              <span className="text-zinc-400">first responding</span> ECU.
            </p>
          </div>
          {report && !scanning && (
            <div className="text-[10px] text-zinc-500">
              <Clock className="w-3 h-3 inline mr-1" />
              {(report.totalDurationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {/* Adapter selection — same hardware options as Hardware Flash */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setScanTransport('pcan')}
            className={`text-left rounded-lg border p-3 transition-colors ${
              scanTransport === 'pcan'
                ? 'border-red-500/50 bg-red-500/10'
                : 'border-zinc-700/80 bg-black/20 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Radio className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-xs font-bold text-zinc-200">PCAN-USB</span>
            </div>
            <p className="text-[10px] text-zinc-500">
              Local WebSocket bridge (pcan_bridge.py). ECU Scan skips full VIN/PID init for speed.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px]">
              {bridgeAvailable ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  <span className="text-zinc-400">Bridge detected</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3 text-red-400" />
                  <span className="text-zinc-500">Bridge not detected</span>
                </>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setScanTransport('vop')}
            className={`text-left rounded-lg border p-3 transition-colors ${
              scanTransport === 'vop'
                ? 'border-violet-500/50 bg-violet-500/10'
                : 'border-zinc-700/80 bg-black/20 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Usb className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="text-xs font-bold text-zinc-200">V-OP USB2CAN</span>
            </div>
            <p className="text-[10px] text-zinc-500">
              Web Serial (Chrome / Edge). You will pick the COM port when the scan connects.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px]">
              {vopSupported ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                  <span className="text-zinc-400">Web Serial available</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3 text-red-400" />
                  <span className="text-zinc-500">Use desktop Chrome or Edge</span>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Scan button */}
        <div className="flex gap-2">
          <button
            onClick={startScan}
            disabled={!scanEnabled || scanning}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:from-cyan-500 hover:to-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {scanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                {report ? 'Re-Scan ECUs' : 'Scan ECUs'}
              </>
            )}
          </button>
          {scanning && (
            <button
              onClick={abortScan}
              className="px-4 py-2.5 rounded-lg border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition-all flex items-center gap-1.5"
            >
              <StopCircle className="w-4 h-4" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Scan Progress */}
      {scanning && report && (
        <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/50">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>
              Scanned {report.ecus.length} address{report.ecus.length !== 1 ? 'es' : ''} —{' '}
              {report.respondingCount} ECU{report.respondingCount !== 1 ? 's' : ''} found
            </span>
          </div>
        </div>
      )}

      {/* Results */}
      {report && !scanning && (
        <>
          {/* Summary */}
          <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-zinc-300 font-medium">
                  {report.respondingCount} ECU{report.respondingCount !== 1 ? 's' : ''} detected
                </span>
              </div>
              {report.vehicleVin && (
                <div className="text-[10px] text-zinc-500 font-mono">
                  VIN: {report.vehicleVin}
                </div>
              )}
            </div>
          </div>

          {flashContainerComparison && containerHeader && (
            <div
              className={`p-3 rounded-lg border ${
                flashContainerComparison.allMatch
                  ? 'bg-green-500/10 border-green-500/30'
                  : flashContainerComparison.changedCount > 0
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-zinc-900/40 border-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <FileCheck className="w-4 h-4 shrink-0 text-cyan-400" />
                Open Flash-tab container vs vehicle
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Comparison with the container loaded in the Flash tab (sw_c1–sw_c9), <span className="text-zinc-400">first responding ECU</span>.
              </p>
              {flashContainerComparison.allMatch ? (
                <p className="text-sm text-green-400 mt-2 font-medium">
                  All calibration slots match the ECU scan — this container matches the connected module.
                </p>
              ) : flashContainerComparison.changedCount > 0 ? (
                <p className="text-sm text-amber-300/90 mt-2">
                  {flashContainerComparison.changedCount} slot(s) differ from the vehicle — different container or calibration.
                </p>
              ) : (
                <p className="text-[10px] text-zinc-500 mt-2">Cannot complete slot comparison (missing data).</p>
              )}
            </div>
          )}

          {/* ECU Cards */}
          {report.ecus.map((ecu, idx) => (
            <EcuCard
              key={idx}
              ecu={ecu}
              expanded={expandedEcu === idx}
              onToggle={() => setExpandedEcu(expandedEcu === idx ? null : idx)}
              comparison={
                comparisonsWithFlashContainer && ecu.responding && containerHeader
                  ? comparisonsWithFlashContainer[idx] ?? null
                  : null
              }
              localOpen={localOpenByEcu[idx] ?? emptyLocalOpen()}
              onOpenLocalContainer={() => onOpenLocalContainerClick(idx)}
            />
          ))}

          {/* Slot-level: Flash-tab container vs first responding ECU */}
          {flashContainerComparison && containerHeader && (
            <ContainerComparisonCard comparison={flashContainerComparison} />
          )}
        </>
      )}

      {/* Empty state */}
      {!report && !scanning && (
        <div className="p-6 text-center text-zinc-600 text-xs">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Choose PCAN-USB or V-OP USB2CAN above, then click &quot;Scan ECUs&quot;</p>
          <p className="mt-1 text-[10px] text-zinc-700">
            Reads VIN, calibration slots, programming state, and tuning lock (where supported)
          </p>
        </div>
      )}
    </div>
  );
}

// ── ECU Card ──────────────────────────────────────────────────────────────────

function EcuCard({
  ecu,
  expanded,
  onToggle,
  comparison,
  localOpen,
  onOpenLocalContainer,
}: {
  ecu: EcuScanResult;
  expanded: boolean;
  onToggle: () => void;
  comparison: ContainerComparison | null;
  localOpen: {
    loading: boolean;
    probe: {
      fileName: string;
      score: MatchScoreResult | null;
      parseError: string | null;
      compatible: boolean;
    } | null;
    error: string | null;
  };
  onOpenLocalContainer: () => void;
}) {
  if (!ecu.responding) {
    return (
      <div className="p-3 bg-zinc-900/20 rounded-lg border border-zinc-800/30 opacity-50">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <XCircle className="w-3.5 h-3.5" />
          <span className="font-mono">
            0x{ecu.txAddr.toString(16).toUpperCase()}
          </span>
          <span>— No response</span>
        </div>
      </div>
    );
  }

  const ecuName = ecu.ecuConfig?.name || `ECU @ 0x${ecu.txAddr.toString(16).toUpperCase()}`;
  const tuningLockDidName = gmCan2000DidShortName(0xd0);
  /** OBD Mode 9 PID 0x06 vs UDS DID F111 */
  const cvnSourceDid = ecu.cvns[0]?.did;
  const cvnBadgeLabel =
    cvnSourceDid === 0x06
      ? 'PID 06'
      : cvnSourceDid === 0xf111
        ? 'F111'
        : 'OBD';
  const hasGmCalDetails = Boolean(ecu.gmSoftwarePartSlots && ecu.gmSoftwarePartSlots.length > 0);
  const hasObdCalDetails = ecu.cvns.length > 0;
  const obdCalSubtitle =
    cvnSourceDid === 0x06
      ? 'OBD Mode 9 — PID 0x06'
      : cvnSourceDid === 0xf111
        ? 'UDS — DID 0xF111'
        : 'OBD / UDS';
  const protocolBadge = ecu.detectedProtocol === 'GMLAN'
    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    : ecu.detectedProtocol === 'UDS'
    ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';

  return (
    <div className="bg-zinc-900/60 rounded-lg border border-zinc-800 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 hover:bg-zinc-800/30 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
        )}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
          <Cpu className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-zinc-100 truncate">{ecuName}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${protocolBadge}`}>
              {ecu.detectedProtocol}
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
            TX: 0x{ecu.txAddr.toString(16).toUpperCase()} / RX: 0x{ecu.rxAddr.toString(16).toUpperCase()}
            {ecu.vin && <span className="ml-2 text-zinc-400">VIN: {ecu.vin}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(() => {
            const n = ecu.gmSoftwarePartSlots?.length ?? ecu.calibrationPartNumbers.filter(Boolean).length;
            return n > 0 ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {n} software/cal slot{n !== 1 ? 's' : ''}
              </span>
            ) : null;
          })()}
          {ecu.cvns.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200 border border-violet-500/25 font-medium">
              {cvnBadgeLabel} ×{ecu.cvns.length}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-3">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Match container to this ECU
            </div>
            <p className="text-[10px] text-zinc-600 leading-snug">
              Open one local <span className="font-mono">.bin</span>. We compare software calibration slots to{' '}
              <span className="text-zinc-400">this</span> ECU (TX{' '}
              <span className="font-mono">0x{ecu.txAddr.toString(16).toUpperCase()}</span>). If the check passes, the
              container is loaded for flash (Overview, Readiness, Hardware Flash). CAN adapter type does not affect the
              check.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <button
                type="button"
                disabled
                title="Library / cloud — not connected yet"
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-zinc-700/50 bg-zinc-900/50 text-zinc-500 text-xs font-medium cursor-not-allowed"
              >
                <Cloud className="w-3.5 h-3.5 shrink-0 opacity-50" />
                From library / cloud…
              </button>
              <button
                type="button"
                onClick={onOpenLocalContainer}
                disabled={localOpen.loading}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-200 text-xs font-medium hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                {localOpen.loading ? 'Reading…' : 'Open local container file…'}
              </button>
            </div>
            {localOpen.error && (
              <p className="text-[10px] text-red-400/90">{localOpen.error}</p>
            )}
            {localOpen.probe && (
              <div
                className={`rounded-md border p-2 text-[10px] ${
                  localOpen.probe.compatible
                    ? 'border-green-500/35 bg-green-500/5 text-green-300'
                    : 'border-red-500/35 bg-red-500/10 text-red-200/95'
                }`}
              >
                <div className="font-medium text-zinc-200 break-all">{localOpen.probe.fileName}</div>
                {localOpen.probe.parseError ? (
                  <p className="mt-1 text-red-300/95">{localOpen.probe.parseError}</p>
                ) : localOpen.probe.score ? (
                  <>
                    <p className="mt-1 text-zinc-400">
                      Match:{' '}
                      <span className="font-mono text-zinc-200">
                        {(localOpen.probe.score.confidence * 100).toFixed(0)}% · Slots{' '}
                        {localOpen.probe.score.slotMatches}/{localOpen.probe.score.nonEmptyContainerSlots}
                      </span>
                    </p>
                    {localOpen.probe.compatible ? (
                      <>
                        <p className="mt-1 text-green-400/95">
                          File matches this ECU — loading container for flash…
                        </p>
                        {hasEcuTypeConflict(localOpen.probe.score) && (
                          <p className="mt-1 text-amber-200/95 text-[10px]">
                            Note: file <span className="font-mono">ecu_type</span> does not match the scan guess — verify
                            the correct module.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 font-medium text-amber-200">
                        Warning: not compatible with this vehicle / ECU (calibration mismatch or missing slots on scan).
                      </p>
                    )}
                    {localOpen.probe.score.notes.length > 0 && (
                      <ul className="mt-1.5 text-zinc-500 list-disc pl-4 space-y-0.5">
                        {localOpen.probe.score.notes.slice(0, 8).map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
              ECU Identity
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <InfoRow label="VIN" value={ecu.vin || '—'} mono />
              <InfoRow
                label={ecu.detectedProtocol === 'GMLAN' ? 'Hardware ID (DID 0xCC)' : 'Hardware ID'}
                value={ecu.hardwareId || '—'}
                mono
              />
              <InfoRow label="Software #" value={ecu.softwareNumber || '—'} mono />
              <InfoRow
                label="Programming State"
                value={ecu.programmingState || '—'}
                color={
                  ecu.programmingState === 'Fully Programmed'
                    ? 'text-green-400'
                    : ecu.programmingState === 'Partially Programmed'
                    ? 'text-amber-400'
                    : undefined
                }
              />
            </div>
          </div>

          {(hasGmCalDetails || hasObdCalDetails) && (
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <FileCheck className="w-3 h-3 inline mr-1" />
                Calibration details
                {hasGmCalDetails && (
                  <span className="ml-1 font-normal normal-case text-zinc-600">
                    · C1–C9 · GMLAN ReadDID 0x1A
                  </span>
                )}
              </h4>
              {hasObdCalDetails && !hasGmCalDetails && (
                <p className="text-[10px] text-zinc-600 mb-2">{obdCalSubtitle}</p>
              )}
              <div className="space-y-3">
                {hasGmCalDetails &&
                  ecu.gmSoftwarePartSlots!.map((slot) => {
                    const idx = parseInt(slot.label.replace(/^C/i, ''), 10) - 1;
                    const cmp = comparison && idx >= 0 ? comparison.slots[idx] : null;
                    const didName = gmCan2000DidShortName(slot.did);
                    const rowTitle = [
                      `DID 0x${slot.did.toString(16).toUpperCase()}`,
                      didName ? `${didName} (CAN2000)` : '',
                    ]
                      .filter(Boolean)
                      .join(' — ');
                    return (
                      <div key={slot.label} title={rowTitle} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-zinc-600">
                          {slot.label}
                          {didName ? ` · ${didName}` : ''}
                        </span>
                        <span className="text-xs font-mono text-zinc-300 tabular-nums">
                          {formatCalInt(slot.decimal)}
                        </span>
                        {cmp && (cmp.match || cmp.changed) && (
                          <span
                            className={`text-[9px] ${cmp.match ? 'text-emerald-400' : cmp.changed ? 'text-amber-400' : 'text-zinc-600'}`}
                          >
                            {cmp.match ? '✓ match' : cmp.changed ? `→ container ${cmp.containerPart}` : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                {hasObdCalDetails && hasGmCalDetails && (
                  <p className="text-[10px] text-zinc-600 pt-1">{obdCalSubtitle}</p>
                )}
                {hasObdCalDetails &&
                  ecu.cvns.map((cvn) => (
                    <div key={`${cvn.index}-${cvn.did}`} className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-zinc-600">C{cvn.index}</span>
                      <span className="text-xs font-mono text-zinc-300 tabular-nums">
                        {formatCalInt(cvn.value)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {(!ecu.gmSoftwarePartSlots || ecu.gmSoftwarePartSlots.length === 0) && ecu.calibrationPartNumbers.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <FileCheck className="w-3 h-3 inline mr-1" />
                Calibration part numbers
              </h4>
              <div className="space-y-1">
                {ecu.calibrationPartNumbers.map((pn, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-600 w-6 text-right font-mono text-[10px]">#{i + 1}</span>
                    <span className="font-mono text-zinc-200 bg-zinc-800/50 px-2 py-0.5 rounded">
                      {pn || '—'}
                    </span>
                    {comparison && comparison.slots[i] && (
                      <span className={`text-[9px] ${comparison.slots[i].match ? 'text-green-400' : comparison.slots[i].changed ? 'text-amber-400' : 'text-zinc-600'}`}>
                        {comparison.slots[i].match ? '✓ match' : comparison.slots[i].changed ? `→ ${comparison.slots[i].containerPart}` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ecu.tuningUnlock && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                ecu.tuningUnlock.unlocked
                  ? 'bg-green-500/10 border-green-500/25 text-green-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              <div
                className="font-semibold text-[10px] uppercase tracking-wide text-zinc-400 mb-1"
                title={tuningLockDidName ? `${tuningLockDidName} (CAN2000)` : undefined}
              >
                Tuning lock (DID 0xD0)
                {tuningLockDidName && (
                  <span className="block font-normal normal-case text-zinc-500 mt-0.5">
                    {tuningLockDidName}
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px]">ASCII: {ecu.tuningUnlock.ascii || '(empty)'}</div>
              {ecu.tuningUnlock.unlocked ? (
                <p className="mt-1 text-[10px] text-green-400/90">Unlocked — &quot;UL&quot; (ready for tune flash).</p>
              ) : (
                <p className="mt-1 text-[10px] text-amber-200/95">
                  Warning: ECU must be unlocked before flashing a tune. Expected &quot;UL&quot; when unlocked.
                </p>
              )}
            </div>
          )}

          {ecu.securityAccessAttempted && (
            <div className={`flex flex-col gap-1 text-xs px-2 py-1.5 rounded border ${
              ecu.securityAccessGranted
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-amber-500/10 border-amber-500/25'
            }`}>
              <div className="flex items-center gap-2">
                <Shield className={`w-3.5 h-3.5 shrink-0 ${
                  ecu.securityAccessGranted ? 'text-green-400' : 'text-amber-400'
                }`} />
                <span className={ecu.securityAccessGranted ? 'text-green-400' : 'text-amber-200'}>
                  {ecu.securityAccessGranted
                    ? 'UDS security access (seed/key) — OK for protected DID reads'
                    : 'UDS security access (seed/key) — not accepted (wrong/missing key or level)'}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 pl-6 leading-snug">
                This is diagnostic authentication, not tune flash &quot;unlock&quot;. Tune unlock is separate (e.g. DID 0xD0 / vendor-specific).
              </p>
            </div>
          )}

          {ecu.notes && ecu.notes.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Notes
              </h4>
              {ecu.notes.map((note, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-500">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-500/60" />
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}

          {ecu.rawResponses.length > 0 && (
            <RawResponsesSection responses={ecu.rawResponses} />
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-zinc-600">{label}</span>
      <span className={`text-xs ${mono ? 'font-mono' : ''} ${color || 'text-zinc-300'} truncate`}>
        {value}
      </span>
    </div>
  );
}

/** Unsigned calibration integers, no thousands separators — same size as VIN (`text-xs`) */
function formatCalInt(n: number): string {
  if (!Number.isFinite(n)) return '';
  return String(n < 0 ? n >>> 0 : Math.trunc(n));
}

function RawResponsesSection({ responses }: { responses: EcuScanResult['rawResponses'] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Hash className="w-3 h-3" />
        Raw DID Responses ({responses.length})
      </button>
      {expanded && (
        <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
          {responses.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-[10px] font-mono px-2 py-0.5 rounded ${
                r.positive ? 'bg-green-500/5 text-green-400/80' : 'bg-red-500/5 text-red-400/60'
              }`}
            >
              <span className="text-zinc-600 w-10">
                0x{r.service.toString(16).toUpperCase()}
              </span>
              <span className="text-zinc-500 w-12">{r.didHex}</span>
              <span className={r.positive ? 'text-green-400' : 'text-red-400'}>
                {r.positive ? '✓' : `NRC 0x${(r.nrc ?? 0).toString(16)}`}
              </span>
              <span className="text-zinc-600 truncate flex-1">
                {r.dataHex || '(empty)'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContainerComparisonCard({ comparison }: { comparison: ContainerComparison }) {
  return (
    <div className={`p-3 rounded-lg border ${
      comparison.allMatch
        ? 'bg-green-500/5 border-green-500/20'
        : comparison.changedCount > 0
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-zinc-900/40 border-zinc-800/50'
    }`}>
      <div className="mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {comparison.allMatch ? (
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          ) : comparison.changedCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          ) : (
            <FileCheck className="w-4 h-4 text-zinc-400" />
          )}
          <span className="text-xs font-bold text-zinc-200">
            Slot comparison (ECU ↔ Flash-tab container)
          </span>
          {comparison.changedCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {comparison.changedCount} changed
            </span>
          )}
        </div>
        <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
          Per index: GM C1…C9 (scan) vs sw_c1…sw_c9 (file). Same part in another slot does not count as a match.
        </p>
      </div>

      {comparison.slots.length > 0 ? (
        <div className="space-y-1">
          {comparison.slots.filter(s => s.profileRelevant !== false).map((slot) => (
            <div key={slot.index} className="flex items-center gap-2 text-[10px]">
              <span className="text-zinc-600 w-5 text-right font-mono">#{slot.index}</span>
              <span className="font-mono text-zinc-400 w-28 truncate" title={slot.ecuPart || '—'}>
                {slot.ecuPart || '—'}
              </span>
              <span className={`${
                slot.match ? 'text-green-400' : slot.changed ? 'text-amber-400' : 'text-zinc-600'
              }`}>
                {slot.match ? '=' : slot.changed ? '→' : '—'}
              </span>
              <span className={`font-mono w-28 truncate ${
                slot.match ? 'text-green-400' : slot.changed ? 'text-amber-400' : 'text-zinc-600'
              }`} title={slot.containerPart || '—'}>
                {slot.containerPart || '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-zinc-600">
          No calibration data available for comparison
        </p>
      )}
    </div>
  );
}