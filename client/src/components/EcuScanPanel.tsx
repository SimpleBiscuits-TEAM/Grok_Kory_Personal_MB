/**
 * EcuScanPanel — Pre-Flash Vehicle ECU Interrogation
 *
 * Scans all known CAN addresses, reads identifying DIDs,
 * calibration data from the ECU (GMLAN ReadDID / UDS as applicable). Compares against loaded container.
 * Supports PCAN-USB (WebSocket bridge) and V-OP USB2CAN (Web Serial).
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  loadEcuContainerSession,
  buildVehicleScanSnapshotV1,
} from '../lib/ecuContainerSessionStorage';
import {
  scoreContainerAgainstScan,
  rankContainerBinsByScan,
  extractContainerMatchParamsFromBin,
  type MatchScoreResult,
} from '../../../shared/ecuContainerMatch';
import {
  Search, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Cpu, Radio, Clock,
  Shield, Hash, FileCheck, Loader2, StopCircle,
  Usb, FolderOpen,
} from 'lucide-react';

export type EcuScanTransportChoice = 'pcan' | 'vop';

interface EcuScanPanelProps {
  pcanConnection: PCANConnection | null;
  vopConnection: VopCan2UsbConnection | null;
  vopSupported: boolean;
  containerHeader: ContainerFileHeader | null;
  bridgeAvailable: boolean;
  bridgeUrl: string | null;
}

export default function EcuScanPanel({
  pcanConnection,
  vopConnection,
  vopSupported,
  containerHeader,
  bridgeAvailable,
  bridgeUrl,
}: EcuScanPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<VehicleScanReport | null>(null);
  const [expandedEcu, setExpandedEcu] = useState<number | null>(null);
  const [comparison, setComparison] = useState<ContainerComparison | null>(null);
  const scannerRef = useRef<EcuScanner | null>(null);
  const [scanTransport, setScanTransport] = useState<EcuScanTransportChoice>('pcan');
  const [folderScanning, setFolderScanning] = useState(false);
  const [folderRanked, setFolderRanked] = useState<{ path: string; score: MatchScoreResult }[] | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);

  const respondingEcu = useMemo(
    () => (report?.ecus.find(e => e.responding) ?? null),
    [report],
  );

  /** Referenz-Container (localStorage / zuletzt eingelesen) vs. aktueller Scan */
  const sessionReferenceScore = useMemo(() => {
    if (!respondingEcu) return null;
    const session = loadEcuContainerSession();
    const ref = session?.referenceContainer;
    const mp = ref?.matchParams;
    if (!mp || !ref) return null;
    const scan = buildVehicleScanSnapshotV1(respondingEcu);
    return {
      score: scoreContainerAgainstScan(mp, scan),
      fileName: ref.fileName,
      absolutePath: ref.absolutePath,
    };
  }, [report, respondingEcu]);

  const scanFolderForContainers = useCallback(async () => {
    setFolderError(null);
    if (!respondingEcu) {
      setFolderError('Zuerst einen ECU-Scan ausführen.');
      return;
    }
    const w = window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };
    if (typeof w.showDirectoryPicker !== 'function') {
      setFolderError('Ordnerauswahl wird in diesem Browser nicht unterstützt (Chrome/Edge: File System Access API). Alternativ: npx tsx scripts/find-containers-for-ecu.ts …');
      return;
    }
    setFolderScanning(true);
    setFolderRanked(null);
    try {
      const root = await w.showDirectoryPicker();
      const candidates: { path: string; params: NonNullable<ReturnType<typeof extractContainerMatchParamsFromBin>> }[] = [];
      async function walk(dh: FileSystemDirectoryHandle, prefix: string): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const [name, handle] of (dh as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
          if (handle.kind === 'directory') {
            await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
          } else if (name.toLowerCase().endsWith('.bin')) {
            const fh = handle as FileSystemFileHandle;
            const file = await fh.getFile();
            const buf = await file.arrayBuffer();
            const params = extractContainerMatchParamsFromBin(new Uint8Array(buf));
            if (params) {
              candidates.push({ path: `${prefix}${name}`, params });
            }
          }
        }
      }
      await walk(root, '');
      const scan = buildVehicleScanSnapshotV1(respondingEcu);
      const ranked = rankContainerBinsByScan(candidates, scan);
      setFolderRanked(ranked);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setFolderError(null);
      } else {
        setFolderError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setFolderScanning(false);
    }
  }, [respondingEcu]);

  useEffect(() => {
    if (!bridgeAvailable && vopSupported) {
      setScanTransport('vop');
    }
  }, [bridgeAvailable, vopSupported]);

  // Run comparison when report or container changes
  useEffect(() => {
    if (report && containerHeader) {
      const ecu = report.ecus.find(e => e.responding);
      if (ecu) {
        setComparison(compareWithContainer(ecu, containerHeader));
        return;
      }
    }
    setComparison(null);
  }, [report, containerHeader]);

  const canStartPcan = bridgeAvailable && Boolean(pcanConnection || bridgeUrl);
  const canStartVop = vopSupported;
  const scanEnabled =
    scanTransport === 'pcan' ? canStartPcan : canStartVop;

  const startScan = useCallback(async () => {
    if (scanTransport === 'pcan' && !canStartPcan) return;
    if (scanTransport === 'vop' && !canStartVop) return;

    setScanning(true);
    setReport(null);
    setComparison(null);

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
      {/* Header */}
      <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Search className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-zinc-100">ECU Scanner</h3>
            <p className="text-[10px] text-zinc-500">
              Read ECU identification and calibration data on the vehicle. After you open a
              container below, results are compared to sw_c1–sw_c9 (from the header and Tune Deploy analysis when
              signed in).
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

          {/* Geladener Container (Flash-Tab) — alle Slots gleich? */}
          {comparison && containerHeader && (
            <div
              className={`p-3 rounded-lg border ${
                comparison.allMatch
                  ? 'bg-green-500/10 border-green-500/30'
                  : comparison.changedCount > 0
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-zinc-900/40 border-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                <FileCheck className="w-4 h-4 shrink-0 text-cyan-400" />
                Geöffneter Container vs. Fahrzeug
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Vergleich mit dem aktuell in der App geladenen Container (sw_c1–sw_c9).
              </p>
              {comparison.allMatch ? (
                <p className="text-sm text-green-400 mt-2 font-medium">
                  Alle Kalibrierungs-Slots stimmen mit dem ECU-Scan überein — dieser Container passt zum verbundenen Steuergerät.
                </p>
              ) : comparison.changedCount > 0 ? (
                <p className="text-sm text-amber-300/90 mt-2">
                  {comparison.changedCount} Slot(s) weichen vom Fahrzeug ab — anderer Container oder andere Kalibration.
                </p>
              ) : (
                <p className="text-[10px] text-zinc-500 mt-2">Kein vollständiger Slot-Vergleich möglich (fehlende Daten).</p>
              )}
            </div>
          )}

          {/* Session-Referenzcontainer (z. B. Bench-File / zuletzt eingelesen) */}
          {sessionReferenceScore && (
            <div
              className={`p-3 rounded-lg border ${
                sessionReferenceScore.score.confidence >= 0.85
                  ? 'bg-green-500/10 border-green-500/25'
                  : sessionReferenceScore.score.confidence >= 0.45
                    ? 'bg-cyan-500/10 border-cyan-500/25'
                    : 'bg-zinc-900/40 border-zinc-800/50'
              }`}
            >
              <div className="text-xs font-semibold text-zinc-200">Referenz-Container (Session)</div>
              <p className="text-[10px] text-zinc-500 mt-0.5 break-all">
                {sessionReferenceScore.fileName}
              </p>
              <p className="text-[9px] text-zinc-600 mt-0.5 break-all font-mono">
                {sessionReferenceScore.absolutePath}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span className="text-zinc-400">
                  Übereinstimmung:{' '}
                  <span className="text-zinc-100 font-mono">
                    {(sessionReferenceScore.score.confidence * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="text-zinc-400">
                  Slots:{' '}
                  <span className="text-zinc-100 font-mono">
                    {sessionReferenceScore.score.slotMatches}/{sessionReferenceScore.score.nonEmptyContainerSlots}
                  </span>
                </span>
                {sessionReferenceScore.score.ecuTypeMatch === true && (
                  <span className="text-emerald-400/90">ecu_type ✓</span>
                )}
                {sessionReferenceScore.score.hardwareMatch === true && (
                  <span className="text-emerald-400/90">hardware ✓</span>
                )}
              </div>
              {sessionReferenceScore.score.confidence >= 0.85 && (
                <p className="text-sm text-green-400/95 mt-2">
                  Referenz-Container passt sehr gut zum aktuellen ECU-Scan.
                </p>
              )}
              {sessionReferenceScore.score.notes.length > 0 && (
                <ul className="mt-2 text-[9px] text-zinc-500 list-disc pl-4 space-y-0.5">
                  {sessionReferenceScore.score.notes.slice(0, 6).map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Alle Container in einem Ordner (lokal) */}
          <div className="p-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-400/90" />
                  Container-Dateien im Ordner finden
                </div>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Wählt einen Ordner — alle <span className="font-mono">.bin</span> mit DevProg-Header werden gegen den letzten Scan gewertet und sortiert.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void scanFolderForContainers()}
                disabled={!respondingEcu || folderScanning}
                className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-medium hover:bg-amber-500/25 disabled:opacity-40"
              >
                {folderScanning ? 'Ordner wird gelesen…' : 'Ordner wählen…'}
              </button>
            </div>
            {folderError && (
              <p className="text-[10px] text-red-400/90 mt-2">{folderError}</p>
            )}
            {folderRanked && folderRanked.length > 0 && (
              <div className="mt-3 max-h-64 overflow-y-auto border border-zinc-800/60 rounded-lg">
                <table className="w-full text-[10px]">
                  <thead className="text-zinc-500 bg-zinc-900/80 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Datei / Pfad</th>
                      <th className="text-right p-2 font-mono">Match</th>
                      <th className="text-right p-2 font-mono">Slots</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folderRanked.map((row, i) => (
                      <tr
                        key={`${row.path}-${i}`}
                        className={
                          row.score.confidence >= 0.85
                            ? 'bg-green-500/5'
                            : row.score.confidence >= 0.45
                              ? 'bg-cyan-500/5'
                              : i % 2 === 0
                                ? 'bg-zinc-900/20'
                                : ''
                        }
                      >
                        <td className="p-2 font-mono text-zinc-300 break-all max-w-[min(100vw,28rem)]">
                          {row.path}
                        </td>
                        <td className="p-2 text-right text-zinc-200 font-mono">
                          {(row.score.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="p-2 text-right text-zinc-400 font-mono">
                          {row.score.slotMatches}/{row.score.nonEmptyContainerSlots || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {folderRanked && folderRanked.length === 0 && !folderScanning && (
              <p className="text-[10px] text-zinc-600 mt-2">Keine parsbaren DevProg-Container in diesem Ordner.</p>
            )}
          </div>

          {/* ECU Cards */}
          {report.ecus.map((ecu, idx) => (
            <EcuCard
              key={idx}
              ecu={ecu}
              expanded={expandedEcu === idx}
              onToggle={() => setExpandedEcu(expandedEcu === idx ? null : idx)}
              comparison={
                comparison && ecu.responding && containerHeader
                  ? comparison
                  : null
              }
            />
          ))}

          {/* Slot-Details: geöffneter Container */}
          {comparison && containerHeader && (
            <ContainerComparisonCard comparison={comparison} />
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
}: {
  ecu: EcuScanResult;
  expanded: boolean;
  onToggle: () => void;
  comparison: ContainerComparison | null;
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
      <div className="flex items-center gap-2 mb-2">
        {comparison.allMatch ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" />
        ) : comparison.changedCount > 0 ? (
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        ) : (
          <FileCheck className="w-4 h-4 text-zinc-400" />
        )}
        <span className="text-xs font-bold text-zinc-200">
          Slot-Vergleich (ECU ↔ Container)
        </span>
        {comparison.changedCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            {comparison.changedCount} changed
          </span>
        )}
      </div>

      {comparison.slots.length > 0 ? (
        <div className="space-y-1">
          {comparison.slots.map((slot) => (
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