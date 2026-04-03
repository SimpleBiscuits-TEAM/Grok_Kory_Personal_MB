/**
 * EcuScanPanel — Pre-Flash Vehicle ECU Interrogation
 *
 * Scans all known CAN addresses, reads ECU identification data,
 * calibration part numbers, and CVNs. Compares against loaded container.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { PCANConnection } from '../lib/pcanConnection';
import {
  EcuScanner,
  compareWithContainer,
  type VehicleScanReport,
  type EcuScanResult,
  type ContainerComparison,
} from '../lib/ecuScanner';
import { type ContainerFileHeader } from '../../../shared/ecuDatabase';
import {
  Search, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronRight, Cpu, Radio, Clock, Wifi,
  Shield, Hash, FileCheck, Loader2, StopCircle,
} from 'lucide-react';

interface EcuScanPanelProps {
  pcanConnection: PCANConnection | null;
  containerHeader: ContainerFileHeader | null;
  bridgeAvailable: boolean;
  bridgeUrl: string | null;
}

export default function EcuScanPanel({
  pcanConnection,
  containerHeader,
  bridgeAvailable,
  bridgeUrl,
}: EcuScanPanelProps) {
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<VehicleScanReport | null>(null);
  const [expandedEcu, setExpandedEcu] = useState<number | null>(null);
  const [comparison, setComparison] = useState<ContainerComparison | null>(null);
  const scannerRef = useRef<EcuScanner | null>(null);

  // Run comparison when report or container changes
  useEffect(() => {
    if (report && containerHeader) {
      const respondingEcu = report.ecus.find(e => e.responding);
      if (respondingEcu) {
        const comp = compareWithContainer(respondingEcu, containerHeader);
        setComparison(comp);
      }
    }
  }, [report, containerHeader]);

  const startScan = useCallback(async () => {
    if (!pcanConnection && !bridgeUrl) return;

    setScanning(true);
    setReport(null);
    setComparison(null);

    try {
      // Create or reuse connection
      let conn = pcanConnection;
      if (!conn && bridgeUrl) {
        conn = new PCANConnection({ bridgeUrl, requestTimeout: 10000 });
      }
      if (!conn) return;

      // Ensure connected
      const state = conn.getState();
      if (state === 'disconnected' || state === 'error') {
        await conn.connect();
      }

      const scanner = new EcuScanner(conn, containerHeader ?? undefined);
      scannerRef.current = scanner;

      const result = await scanner.scanVehicle((progress) => {
        setReport({ ...progress });
      });

      setReport(result);

      // Auto-expand first responding ECU
      const firstResponding = result.ecus.findIndex(e => e.responding);
      if (firstResponding >= 0) {
        setExpandedEcu(firstResponding);
      }
    } catch (err) {
      console.error('[ECU Scan] Error:', err);
    } finally {
      setScanning(false);
      scannerRef.current = null;
    }
  }, [pcanConnection, bridgeUrl]);

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
              Read ECU identification, calibration part numbers, and CRC/CVN values
            </p>
          </div>
          {report && !scanning && (
            <div className="text-[10px] text-zinc-500">
              <Clock className="w-3 h-3 inline mr-1" />
              {(report.totalDurationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2 text-xs mb-3">
          {bridgeAvailable ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-green-400" />
              <span className="text-zinc-300">PCAN bridge connected</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-zinc-500">PCAN bridge not detected</span>
            </>
          )}
        </div>

        {/* Scan button */}
        <div className="flex gap-2">
          <button
            onClick={startScan}
            disabled={!bridgeAvailable || scanning}
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

          {/* ECU Cards */}
          {report.ecus.map((ecu, idx) => (
            <EcuCard
              key={idx}
              ecu={ecu}
              index={idx}
              expanded={expandedEcu === idx}
              onToggle={() => setExpandedEcu(expandedEcu === idx ? null : idx)}
              comparison={
                comparison && ecu.responding && containerHeader
                  ? comparison
                  : null
              }
            />
          ))}

          {/* Container Comparison */}
          {comparison && containerHeader && (
            <ContainerComparisonCard comparison={comparison} />
          )}
        </>
      )}

      {/* Empty state */}
      {!report && !scanning && (
        <div className="p-6 text-center text-zinc-600 text-xs">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Click "Scan ECUs" to read ECU information from the vehicle</p>
          <p className="mt-1 text-[10px] text-zinc-700">
            Reads VIN, calibration part numbers, CRC/CVN values, and programming state
          </p>
        </div>
      )}
    </div>
  );
}

// ── ECU Card ──────────────────────────────────────────────────────────────────

function EcuCard({
  ecu,
  index,
  expanded,
  onToggle,
  comparison,
}: {
  ecu: EcuScanResult;
  index: number;
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
  const protocolBadge = ecu.detectedProtocol === 'GMLAN'
    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    : ecu.detectedProtocol === 'UDS'
    ? 'bg-green-500/20 text-green-400 border-green-500/30'
    : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';

  return (
    <div className="bg-zinc-900/60 rounded-lg border border-zinc-800 overflow-hidden">
      {/* Header — always visible */}
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
          {ecu.calibrationPartNumbers.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {ecu.calibrationPartNumbers.length} cal{ecu.calibrationPartNumbers.length !== 1 ? 's' : ''}
            </span>
          )}
          {ecu.cvns.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
              {ecu.cvns.length} CVN{ecu.cvns.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          {/* Identity section */}
          <div>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
              ECU Identity
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <InfoRow label="VIN" value={ecu.vin || '—'} mono />
              <InfoRow label="Hardware ID" value={ecu.hardwareId || '—'} mono />
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

          {/* Calibration Part Numbers */}
          {ecu.calibrationPartNumbers.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <FileCheck className="w-3 h-3 inline mr-1" />
                Calibration Part Numbers ({ecu.calibrationPartNumbers.length})
              </h4>
              <div className="space-y-1">
                {ecu.calibrationPartNumbers.map((pn, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-600 w-6 text-right font-mono text-[10px]">#{i + 1}</span>
                    <span className="font-mono text-zinc-200 bg-zinc-800/50 px-2 py-0.5 rounded">
                      {pn}
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

          {/* CVNs / CRCs */}
          {ecu.cvns.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                <Shield className="w-3 h-3 inline mr-1" />
                Calibration Verification Numbers (CVN/CRC)
              </h4>
              <div className="grid grid-cols-3 gap-1">
                {ecu.cvns.map((cvn) => (
                  <div key={cvn.index} className="flex items-center gap-1.5 text-xs bg-zinc-800/30 px-2 py-1 rounded">
                    <span className="text-zinc-600 text-[10px] font-mono">
                      #{cvn.index}
                    </span>
                    <span className="font-mono text-purple-300 text-[10px]">
                      {cvn.hex}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security Access Status */}
          {ecu.securityAccessAttempted && (
            <div className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${
              ecu.securityAccessGranted
                ? 'bg-green-500/10 border border-green-500/20'
                : 'bg-amber-500/10 border border-amber-500/20'
            }`}>
              <Shield className={`w-3.5 h-3.5 ${
                ecu.securityAccessGranted ? 'text-green-400' : 'text-amber-400'
              }`} />
              <span className={ecu.securityAccessGranted ? 'text-green-400' : 'text-amber-400'}>
                {ecu.securityAccessGranted
                  ? 'Security Access Granted — ECU unlocked'
                  : 'Security Access Denied — requires key or hardware unlock'
                }
              </span>
            </div>
          )}

          {/* Notes */}
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

          {/* Raw DID Responses (collapsible) */}
          {ecu.rawResponses.length > 0 && (
            <RawResponsesSection responses={ecu.rawResponses} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────

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

// ── Raw Responses Section ─────────────────────────────────────────────────────

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

// ── Container Comparison Card ─────────────────────────────────────────────────

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
          Container Comparison
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
