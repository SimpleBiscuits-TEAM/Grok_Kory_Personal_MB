/**
 * PpeiDataloggerPanel — PPEI Team Sandbox Wrapper for Datalogger Tab
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PPEI TEAM SANDBOX — Safe to modify, experiment, and break!        ║
 * ║                                                                     ║
 * ║  MONKEY-PATCHES (applied at module load, before any render):        ║
 * ║  1. ensureGmLiveDataSessionForTx — DDDI setup + periodic streaming  ║
 * ║  2. sendUDSviaRawCAN — diagnostic logging wrapper                  ║
 * ║  3. readPid — diagnostic logging wrapper                            ║
 * ║  4. openWebSocket — WS interceptor + DDDI 0x5E8 periodic parser    ║
 * ║  5. readPids — batch_read_dids + DDDI periodic value injection      ║
 * ║                                                                     ║
 * ║  DO NOT modify Tobi's original files!                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * @module ppei-datalogger
 * @team PPEI Development Team
 * @sandbox true
 */
import { useState, useCallback } from 'react';
import DataloggerPanel, { type DataloggerPanelProps } from '@/components/DataloggerPanel';
import { PCANConnection } from '@/lib/pcanConnection';
import { Beaker, Shield, Download } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════
// MODULE-SCOPE MONKEY-PATCHES — applied ONCE when this module is imported
// ══════════════════════════════════════════════════════════════════════════

const PPEI_TAG = '[PPEI-DIAG]';

/**
 * Helper: log to both console AND the DEVICE CONSOLE panel.
 * `self` is the PCANConnection instance (from `this` in patched methods).
 * When called from module scope (no instance), only logs to console.
 */
function ppeiLog(self: any, msg: string): void {
  console.log(`${PPEI_TAG} ${msg}`);
  // emit is private but accessible at runtime — route to DEVICE CONSOLE
  if (self && typeof self.emit === 'function') {
    try { self.emit('log', null, `${PPEI_TAG} ${msg}`); } catch { /* ignore */ }
  }
}

function ppeiWarn(self: any, msg: string): void {
  console.warn(`${PPEI_TAG} ${msg}`);
  if (self && typeof self.emit === 'function') {
    try { self.emit('log', null, `${PPEI_TAG} ⚠ ${msg}`); } catch { /* ignore */ }
  }
}

const NON_GM_MANUFACTURERS = new Set([
  'ford', 'chrysler', 'toyota', 'honda', 'nissan', 'hyundai', 'bmw',
  'canam', 'seadoo', 'polaris', 'kawasaki',
]);

/**
 * ── PATCH 1: ensureGmLiveDataSessionForTx ──
 * Sends DDDI clear + define + start periodic streaming to the bridge.
 */
async function ppeiEnsureGmLiveDataSession(this: any, ecmTx: number): Promise<void> {
  if (ecmTx !== 0x7e0 && ecmTx !== 0x7e1) return;
  const mfr = this.vehicleInfo?.manufacturer;
  if (mfr && NON_GM_MANUFACTURERS.has(mfr)) return;
  const now = Date.now();
  const last = this.gmLiveSessionAtByTx?.get(ecmTx) ?? 0;
  // DDDI clear takes ~500ms, so only re-send every 30s
  if (now - last < 30000) return;
  const txHex = `0x${ecmTx.toString(16).toUpperCase()}`;

  // If DDDI periodic streaming is already active and we've received frames recently,
  // skip re-setup to avoid breaking the stream. Just refresh the session timer.
  if (_ppeiDddiStreamingActive && _ppeiPeriodicFrameCount > 0) {
    const lastPeriodicVal = _ppeiPeriodicValues.get(0x328A); // FRP_ACT
    const periodicAge = lastPeriodicVal ? (now - lastPeriodicVal.timestamp) : Infinity;
    if (periodicAge < 5000) {
      ppeiLog(this, `DDDI streaming still active (${_ppeiPeriodicFrameCount} frames, last ${periodicAge.toFixed(0)}ms ago) — skipping re-setup`);
      if (this.gmLiveSessionAtByTx) {
        this.gmLiveSessionAtByTx.set(ecmTx, Date.now());
      }
      return;
    } else {
      ppeiWarn(this, `DDDI streaming stale (last frame ${periodicAge.toFixed(0)}ms ago) — re-running setup`);
      _ppeiDddiStreamingActive = false;
    }
  }

  ppeiLog(this, `DDDI setup sequence for ${txHex} (clear + define + start periodic)`);
  
  try {
    // Send dddi_setup to the bridge — this does the full sequence
    const response = await (this as any).sendRequest({
      type: 'dddi_setup',
      tx_id: ecmTx,
    }, 60000); // 60s timeout — clearing 56 periodic IDs takes time
    
    if (response?.ok) {
      const streaming = response.streaming === true;
      const periodicIds = Array.isArray(response.periodic_ids)
        ? response.periodic_ids.map((id: number) => `0x${id.toString(16).toUpperCase()}`).join(', ')
        : 'none';
      ppeiLog(this,
        `DDDI setup OK on ${txHex}: ` +
        `cleared ${response.clear_ok ?? '?'} periodic IDs ` +
        `(${response.clear_nrc ?? '?'} NRC), ` +
        `IOCTL ${response.ioctl_ok ?? '?'}/2, DDDI ${response.dddi_ok ?? '?'}/2 ` +
        `in ${response.elapsed_ms ?? '?'}ms` +
        (streaming ? ` — PERIODIC STREAMING ACTIVE on 0x5E8 [${periodicIds}] (float32 MPa)` : '')
      );
      if (streaming) {
        _ppeiDddiStreamingActive = true;
        _ppeiPeriodicFrameCount = 0;
        ppeiLog(this, 'DDDI periodic streaming started — FRP_ACT/FRP_DES as float32 MPa from 0x5E8 frames');
      }
    } else {
      ppeiWarn(this, `DDDI setup partial/failed on ${txHex}: ${JSON.stringify(response)}`);
    }
  } catch (e: any) {
    ppeiWarn(this, `DDDI setup failed on ${txHex}: ${e?.message ?? e}`);
    // Fallback: try TesterPresent + Extended Session (may work on some ECUs)
    try {
      await this.sendUDSRequest(0x3e, 0x00, [], ecmTx, 2500);
      ppeiLog(this, `TesterPresent fallback OK on ${txHex}`);
    } catch { /* ignore */ }
    try {
      await this.sendUDSRequest(0x10, 0x03, [], ecmTx, 4000);
      ppeiLog(this, `Extended Session (0x10 0x03) fallback OK on ${txHex}`);
    } catch { /* ignore */ }
  }
  
  if (this.gmLiveSessionAtByTx) {
    this.gmLiveSessionAtByTx.set(ecmTx, Date.now());
  }
  await new Promise(r => setTimeout(r, 40));
}

/**
 * ── PATCH 2: sendUDSviaRawCAN wrapper ──
 * Wraps the original to log every CAN frame sent and every response received.
 */
function wrapSendUDSviaRawCAN(original: Function) {
  return async function(this: any, service: number, subFunction?: number, data?: number[], targetAddress = 0x7E0, timeoutMs = 5000, responseArbIdOverride?: number) {
    const svcHex = `0x${service.toString(16).toUpperCase()}`;
    const subHex = subFunction !== undefined ? `0x${subFunction.toString(16).toUpperCase()}` : 'none';
    const dataHex = data?.map((b: number) => b.toString(16).padStart(2, '0')).join(' ') ?? '';
    const txHex = `0x${targetAddress.toString(16).toUpperCase()}`;
    // Only log to console (too noisy for DEVICE CONSOLE)
    console.log(`${PPEI_TAG} TX → ${txHex}: svc=${svcHex} sub=${subHex} data=[${dataHex}] timeout=${timeoutMs}ms`);
    
    const start = performance.now();
    try {
      const result = await original.call(this, service, subFunction, data, targetAddress, timeoutMs, responseArbIdOverride);
      const elapsed = (performance.now() - start).toFixed(1);
      if (result) {
        const posNeg = result.positiveResponse ? 'POSITIVE' : 'NEGATIVE';
        const respData = result.data?.map((b: number) => b.toString(16).padStart(2, '0')).join(' ') ?? 'no data';
        console.log(`${PPEI_TAG} RX ← ${txHex}: ${posNeg} (${elapsed}ms) data=[${respData}]`);
      } else {
        console.log(`${PPEI_TAG} RX ← ${txHex}: null response (${elapsed}ms)`);
      }
      return result;
    } catch (e: any) {
      const elapsed = (performance.now() - start).toFixed(1);
      console.warn(`${PPEI_TAG} ERR ← ${txHex}: ${e?.message ?? e} (${elapsed}ms)`);
      throw e;
    }
  };
}

/**
 * ── PATCH 3: readPid wrapper ──
 * Logs every PID read attempt and result during scan.
 * Only logs to console (too noisy for DEVICE CONSOLE).
 */
function wrapReadPid(original: Function) {
  return async function(this: any, pid: any) {
    const mode = pid.service || 0x01;
    const pidHex = `0x${pid.pid.toString(16).toUpperCase()}`;
    const modeHex = `0x${mode.toString(16).padStart(2, '0').toUpperCase()}`;
    console.log(`${PPEI_TAG} readPid: ${pid.shortName ?? pid.name} (mode=${modeHex} pid=${pidHex})`);
    
    const start = performance.now();
    try {
      const result = await original.call(this, pid);
      const elapsed = (performance.now() - start).toFixed(1);
      if (result) {
        console.log(`${PPEI_TAG} readPid OK: ${pid.shortName ?? pid.name} = ${result.value} ${result.unit ?? ''} (${elapsed}ms)`);
      } else {
        console.warn(`${PPEI_TAG} readPid FAIL: ${pid.shortName ?? pid.name} → null (${elapsed}ms)`);
      }
      return result;
    } catch (e: any) {
      const elapsed = (performance.now() - start).toFixed(1);
      console.warn(`${PPEI_TAG} readPid ERROR: ${pid.shortName ?? pid.name} → ${e?.message ?? e} (${elapsed}ms)`);
      return null;
    }
  };
}

// ── DDDI Periodic Frame Parsing (HPT IOCTL approach) ──
// HP Tuners reads FRP as IEEE 754 float32 big-endian from ECU RAM via IOCTL 0x2D.
// Periodic ID 0xFE = FRP Actual (4 bytes float32 MPa from RAM 0x014F08)
// Periodic ID 0xFD = FRP Desired (4 bytes float32 MPa from RAM 0x0225D8)
// Formula: float32_BE(bytes[1..4]) * 145.038 = PSI
const DDDI_PERIODIC_ARB_ID = 0x5E8;
const MPA_TO_PSI = 145.038;

// Map periodic ID -> PID info for injection into readPids
const PERIODIC_ID_MAP: Record<number, { did: number; shortName: string; unit: string }> = {
  0xFE: { did: 0x328A, shortName: 'FRP_ACT', unit: 'PSI' },
  0xFD: { did: 0x131F, shortName: 'FRP_DES', unit: 'PSI' },
};

// Storage for latest periodic values (keyed by DID)
interface PeriodicValue {
  did: number;
  shortName: string;
  value: number;
  unit: string;
  rawBytes: number[];
  timestamp: number;
}
// Module-level map so both Patch 4 (writer) and Patch 5 (reader) can access it
const _ppeiPeriodicValues = new Map<number, PeriodicValue>();
let _ppeiPeriodicFrameCount = 0;
let _ppeiDddiStreamingActive = false;
// Store a reference to the connection instance so parseDddiPeriodicFrame can emit('log')
let _ppeiConnectionRef: any = null;

// Reusable DataView for float32 decoding
const _float32Buf = new ArrayBuffer(4);
const _float32View = new DataView(_float32Buf);
const _float32Bytes = new Uint8Array(_float32Buf);

function decodeFloat32BE(b0: number, b1: number, b2: number, b3: number): number {
  _float32Bytes[0] = b0;
  _float32Bytes[1] = b1;
  _float32Bytes[2] = b2;
  _float32Bytes[3] = b3;
  return _float32View.getFloat32(0, false); // big-endian
}

function parseDddiPeriodicFrame(data: number[]): void {
  if (!data || data.length < 5) return; // Need at least periodicID + 4 bytes float32
  const periodicId = data[0];
  const pidInfo = PERIODIC_ID_MAP[periodicId];
  if (!pidInfo) return; // Not a periodic ID we care about
  
  _ppeiPeriodicFrameCount++;
  _ppeiDddiStreamingActive = true;
  const now = Date.now();
  
  // Decode bytes 1-4 as IEEE 754 float32 big-endian (MPa)
  const mpa = decodeFloat32BE(data[1], data[2], data[3], data[4]);
  const psi = mpa * MPA_TO_PSI;
  
  if (typeof psi === 'number' && Number.isFinite(psi) && psi >= 0 && psi < 100000) {
    _ppeiPeriodicValues.set(pidInfo.did, {
      did: pidInfo.did,
      shortName: pidInfo.shortName,
      value: psi,
      unit: pidInfo.unit,
      rawBytes: data.slice(1, 5),
      timestamp: now,
    });
  }
  
  // Log first 10 frames and then every 100th to DEVICE CONSOLE
  if (_ppeiPeriodicFrameCount <= 10 || _ppeiPeriodicFrameCount % 100 === 0) {
    const frpAct = _ppeiPeriodicValues.get(0x328A);
    const frpDes = _ppeiPeriodicValues.get(0x131F);
    const hexStr = data.slice(0, 5).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const msg = `DDDI periodic #${_ppeiPeriodicFrameCount}: ` +
      `0x${periodicId.toString(16).toUpperCase()} [${hexStr}] ` +
      `${pidInfo.shortName}=${psi.toFixed(0)} PSI (${mpa.toFixed(2)} MPa) | ` +
      `FRP_ACT=${frpAct ? frpAct.value.toFixed(0) + ' PSI' : 'N/A'} ` +
      `FRP_DES=${frpDes ? frpDes.value.toFixed(0) + ' PSI' : 'N/A'}`;
    ppeiLog(_ppeiConnectionRef, msg);
  }
}

/**
 * ── PATCH 4: openWebSocket wrapper ──
 * Intercepts the WebSocket onmessage to:
 * 1. Log all incoming can_frame messages
 * 2. Parse 0x5E8 DDDI periodic frames and extract FRP_ACT, VSS, etc.
 */
function wrapOpenWebSocket(original: Function) {
  return async function(this: any) {
    await original.call(this);
    // Store connection reference so parseDddiPeriodicFrame can emit('log')
    _ppeiConnectionRef = this;
    // After the original sets up ws.onmessage, wrap it to add logging + DDDI parsing
    if (this.ws) {
      const originalOnMessage = this.ws.onmessage;
      const connRef = this; // capture for closure
      let frameCount = 0;
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'can_frame' || msg.type === 'bus_frame') {
            frameCount++;
            const arbId = msg.arb_id ?? msg.arbitration_id ?? 0;
            const dataArr: number[] = Array.isArray(msg.data) ? msg.data : [];

            // ── DDDI periodic frame parsing (0x5E8) ──
            if (arbId === DDDI_PERIODIC_ARB_ID && dataArr.length >= 2) {
              parseDddiPeriodicFrame(dataArr);
            }

            // Log first 5 frames to DEVICE CONSOLE, rest only to F12
            if (frameCount <= 5) {
              const arbHex = `0x${arbId.toString(16).toUpperCase()}`;
              const dataHex = dataArr.map((b: number) => b.toString(16).padStart(2, '0')).join(' ');
              ppeiLog(connRef, `WS frame #${frameCount}: ${arbHex} [${dataHex}]`);
            } else if (frameCount % 200 === 0) {
              console.log(`${PPEI_TAG} WS frame count: ${frameCount}`);
            }
          }
        } catch { /* ignore */ }
        // Call original handler
        if (originalOnMessage) {
          originalOnMessage.call(this.ws, event);
        }
      };
      ppeiLog(this, 'WebSocket interceptor installed (with DDDI 0x5E8 periodic parser)');
    }
  };
}


/**
 * ── PATCH 5: readPids → batch_read_dids ──
 * Instead of N sequential readPid calls (each with WS round-trip overhead),
 * sends a single "batch_read_dids" WebSocket message to the PPEI bridge.
 * The bridge fires all DID requests back-to-back on the CAN bus (~5ms/DID)
 * and returns all results in one response.
 *
 * Mode 01 PIDs still go through individual readPid (the bridge batch only
 * handles Mode 22 DIDs). Mode 01 PIDs are fast anyway (~1-2 per cycle).
 *
 * Falls back to sequential readPid if the bridge doesn't support batch_read_dids.
 */
function wrapReadPids(originalReadPids: Function, originalReadPid: Function) {
  return async function(this: any, pids: any[]): Promise<any[]> {
    // Split PIDs into Mode 01 (standard) and Mode 22 (extended)
    const mode01Pids: any[] = [];
    const mode22Pids: any[] = [];
    for (const pid of pids) {
      const mode = pid.service || 0x01;
      if (mode === 0x22) {
        mode22Pids.push(pid);
      } else {
        mode01Pids.push(pid);
      }
    }

    const readings: any[] = [];

    // ── Mode 01: sequential (fast, few PIDs, no batch needed) ──
    for (const pid of mode01Pids) {
      try {
        const reading = await originalReadPid.call(this, pid);
        if (reading) readings.push(reading);
      } catch { /* ignore */ }
    }

    // ── Mode 22: batch via bridge ──
    if (mode22Pids.length === 0) return readings;

    // Group by ECU TX address (most will be 0x7E0, some on 0x7E1 for TCM)
    const byTx = new Map<number, any[]>();
    for (const pid of mode22Pids) {
      const tx = pid.ecuHeader
        ? parseInt(pid.ecuHeader.trim().replace(/^0x/i, ''), 16) || 0x7E0
        : 0x7E0;
      if (!byTx.has(tx)) byTx.set(tx, []);
      byTx.get(tx)!.push(pid);
    }

    for (const [txId, txPids] of byTx) {
      // Ensure session is active for this ECU
      try {
        await this.ensureGmLiveDataSessionForTx(txId);
      } catch { /* ignore */ }

      const dids = txPids.map((p: any) => p.pid);
      const batchTimeout = Math.max(3000, txPids.length * 100); // ~100ms/DID budget

      try {
        // Use sendRequest (private but accessible at runtime via `this`)
        const response: any = await this.sendRequest(
          {
            type: 'batch_read_dids',
            dids,
            tx_id: txId,
            timeout_ms: 50, // per-DID timeout on bridge side
          },
          batchTimeout,
        );

        if (response.type === 'batch_did_results' && Array.isArray(response.results)) {
          const start = performance.now();
          let okCount = 0;
          for (const result of response.results) {
            if (!result.ok) continue;
            const pidDef = txPids.find((p: any) => p.pid === result.did);
            if (!pidDef) continue;

            try {
              const payload: number[] = result.data || [];
              if (payload.length === 0) continue;

              const value = pidDef.formula(payload);
              if (typeof value !== 'number' || !Number.isFinite(value)) continue;

              readings.push({
                pid: pidDef.pid,
                name: pidDef.name,
                shortName: pidDef.shortName,
                value,
                unit: pidDef.unit,
                rawBytes: payload,
                timestamp: Date.now(),
              });
              okCount++;
            } catch { /* formula error — skip */ }
          }
          const elapsed = (performance.now() - start).toFixed(1);
          // Log batch results to DEVICE CONSOLE (important diagnostic)
          ppeiLog(this,
            `batch_read_dids TX=0x${txId.toString(16).toUpperCase()}: ` +
            `${okCount}/${dids.length} decoded in ${elapsed}ms (bridge: ${response.elapsed_ms}ms)`
          );
        } else {
          ppeiWarn(this, `batch_read_dids unexpected response, falling back to sequential`);
          for (const pid of txPids) {
            try {
              const reading = await originalReadPid.call(this, pid);
              if (reading) readings.push(reading);
            } catch { /* ignore */ }
          }
        }
      } catch (e: any) {
        ppeiWarn(this,
          `batch_read_dids failed (${e?.message ?? e}), falling back to sequential for ${txPids.length} DIDs`
        );
        for (const pid of txPids) {
          try {
            const reading = await originalReadPid.call(this, pid);
            if (reading) readings.push(reading);
          } catch { /* ignore */ }
        }
      }
    }

    // ── Inject DDDI periodic values for PIDs that have fresh data ──
    const PERIODIC_MAX_AGE_MS = 2000; // Accept periodic values up to 2s old
    const now = Date.now();
    const injectedFromPeriodic: string[] = [];

    for (const pid of pids) {
      // Skip if we already got a reading for this PID from batch/sequential
      if (readings.some(r => r.pid === pid.pid)) continue;

      const periodic = _ppeiPeriodicValues.get(pid.pid);
      if (periodic && (now - periodic.timestamp) < PERIODIC_MAX_AGE_MS) {
        readings.push({
          pid: periodic.did,
          name: pid.name,
          shortName: periodic.shortName,
          value: periodic.value,
          unit: periodic.unit,
          rawBytes: periodic.rawBytes,
          timestamp: periodic.timestamp,
        });
        injectedFromPeriodic.push(`${periodic.shortName}=${periodic.value.toFixed(1)}`);
      }
    }

    if (injectedFromPeriodic.length > 0) {
      ppeiLog(this,
        `Injected ${injectedFromPeriodic.length} DDDI periodic value(s): ${injectedFromPeriodic.join(', ')}`
      );
    }

    return readings;
  };
}
// ── Apply all patches at module scope ──
console.log(`${PPEI_TAG} Module loaded — attempting to apply patches...`);
try {
  const proto = PCANConnection.prototype as any;
  
  if (proto._ppeiFullyPatched) {
    console.log(`${PPEI_TAG} Patches already applied — skipping`);
  } else {
    // Patch 1: Session management + DDDI setup
    proto._originalEnsureGmLiveDataSession = proto.ensureGmLiveDataSessionForTx;
    proto.ensureGmLiveDataSessionForTx = ppeiEnsureGmLiveDataSession;
    console.log(`${PPEI_TAG} Patch 1: ensureGmLiveDataSessionForTx → DDDI setup + periodic streaming`);
    // Patch 2: sendUDSviaRawCAN diagnostic logging
    proto._originalSendUDSviaRawCAN = proto.sendUDSviaRawCAN;
    proto.sendUDSviaRawCAN = wrapSendUDSviaRawCAN(proto._originalSendUDSviaRawCAN);
    console.log(`${PPEI_TAG} Patch 2: sendUDSviaRawCAN → diagnostic logging wrapper`);
    // Patch 3: readPid diagnostic logging
    proto._originalReadPid = proto.readPid;
    proto.readPid = wrapReadPid(proto._originalReadPid);
    console.log(`${PPEI_TAG} Patch 3: readPid → diagnostic logging wrapper`);
    // Patch 4: openWebSocket interceptor + DDDI 0x5E8 parser
    proto._originalOpenWebSocket = proto.openWebSocket;
    proto.openWebSocket = wrapOpenWebSocket(proto._originalOpenWebSocket);
    console.log(`${PPEI_TAG} Patch 4: openWebSocket → WS interceptor + DDDI 0x5E8 periodic parser`);
    // Patch 5: readPids → batch_read_dids + DDDI periodic injection
    proto._originalReadPids = proto.readPids;
    proto.readPids = wrapReadPids(proto._originalReadPids, proto._originalReadPid || proto.readPid);
    console.log(`${PPEI_TAG} Patch 5: readPids → batch_read_dids + DDDI periodic value injection`);
    proto._ppeiFullyPatched = true;
    console.log(`${PPEI_TAG} All PPEI patches applied successfully`);
  }
} catch (err) {
  console.error(`${PPEI_TAG} PATCH FAILED:`, err);
  console.error(`${PPEI_TAG} PCANConnection available:`, typeof PCANConnection);
  console.error(`${PPEI_TAG} PCANConnection.prototype:`, PCANConnection?.prototype);
}

// ══════════════════════════════════════════════════════════════════════════
// PPEI DATALOGGER WRAPPER COMPONENT
// ══════════════════════════════════════════════════════════════════════════

interface PpeiDataloggerPanelProps extends DataloggerPanelProps {}

export default function PpeiDataloggerPanel({
  onOpenInAnalyzer,
  injectedPids,
  ...rest
}: PpeiDataloggerPanelProps) {
  const [showSandboxBanner, setShowSandboxBanner] = useState(true);

  const handleOpenInAnalyzer = useCallback(
    (csvData: string, filename: string) => {
      onOpenInAnalyzer?.(csvData, filename);
    },
    [onOpenInAnalyzer],
  );

  const processedPids = injectedPids;

  return (
    <div className="relative h-full w-full">
      {showSandboxBanner && (
        <div
          className="rounded-lg mb-3 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, oklch(0.25 0.12 170 / 0.4), oklch(0.20 0.08 200 / 0.3))',
            border: '1px solid oklch(0.45 0.15 170 / 0.4)',
            fontFamily: '"Share Tech Mono", monospace',
          }}
        >
          {/* Top row: PPEI SANDBOX badge + status */}
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Beaker style={{ width: 16, height: 16, color: 'oklch(0.72 0.18 170)' }} />
                <span style={{ color: 'oklch(0.72 0.18 170)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em' }}>
                  PPEI SANDBOX
                </span>
              </div>
              <span style={{ color: 'oklch(0.65 0.01 260)', fontSize: '0.7rem' }}>
                PPEI diagnostic patches active — DDDI periodic streaming (HPT IOCTL float32 MPa) for FRP_ACT/FRP_DES
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1" style={{ color: 'oklch(0.55 0.15 145)', fontSize: '0.65rem' }}>
                <Shield style={{ width: 12, height: 12 }} />
                <span>TOBI'S CODE PROTECTED</span>
              </div>
              <button
                onClick={() => setShowSandboxBanner(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                style={{ fontSize: '0.7rem', padding: '2px 6px' }}
              >
                ✕
              </button>
            </div>
          </div>
          {/* PPEI Bridge download row */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-2"
            style={{
              borderTop: '1px solid oklch(0.35 0.08 170 / 0.3)',
              background: 'oklch(0.15 0.04 200 / 0.5)',
            }}
          >
            <div className="flex items-center gap-3">
              <span style={{ color: 'oklch(0.80 0.15 60)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                ⚠ PPEI BRIDGE REQUIRED FOR BUSY CAN BUSES
              </span>
              <span style={{ color: 'oklch(0.55 0.01 260)', fontSize: '0.68rem' }}>
                Fixes PCAN receive queue overflow on 2019+ trucks. Run this instead of pcan_bridge.py.
              </span>
            </div>
            <a
              href={`${import.meta.env.BASE_URL}ppei_pcan_bridge.py`}
              download="ppei_pcan_bridge.py"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all"
              style={{
                background: 'oklch(0.45 0.18 170)',
                color: 'oklch(0.98 0 0)',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'oklch(0.55 0.20 170)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'oklch(0.45 0.18 170)'; }}
            >
              <Download style={{ width: 14, height: 14 }} />
              ppei_pcan_bridge.py
            </a>
          </div>
        </div>
      )}

      <DataloggerPanel
        onOpenInAnalyzer={handleOpenInAnalyzer}
        injectedPids={processedPids}
      />
    </div>
  );
}
