/**
 * PpeiDataloggerPanel — PPEI Team Sandbox Wrapper for Datalogger Tab
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PPEI TEAM SANDBOX — Safe to modify, experiment, and break!        ║
 * ║                                                                     ║
 * ║  MONKEY-PATCHES (applied at module load, before any render):        ║
 * ║  1. ensureGmLiveDataSessionForTx — HP Tuners approach (no 0x10 03) ║
 * ║  2. sendUDSviaRawCAN — diagnostic logging wrapper                  ║
 * ║  3. scanSupportedDIDs — increased timeouts for scan phase           ║
 * ║  4. onmessage — diagnostic logging for all WebSocket messages       ║
 * ║  5. readPids — batch_read_dids for fast multi-DID polling           ║
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

const NON_GM_MANUFACTURERS = new Set([
  'ford', 'chrysler', 'toyota', 'honda', 'nissan', 'hyundai', 'bmw',
  'canam', 'seadoo', 'polaris', 'kawasaki',
]);

/**
 * ── PATCH 1: ensureGmLiveDataSessionForTx ──
 * HP Tuners approach: TesterPresent only, NO extended session (0x10 0x03).
 */
async function ppeiEnsureGmLiveDataSession(this: any, ecmTx: number): Promise<void> {
  if (ecmTx !== 0x7e0 && ecmTx !== 0x7e1) return;
  const mfr = this.vehicleInfo?.manufacturer;
  if (mfr && NON_GM_MANUFACTURERS.has(mfr)) return;
  const now = Date.now();
  const last = this.gmLiveSessionAtByTx?.get(ecmTx) ?? 0;
  if (now - last < 12000) return;

  console.log(`${PPEI_TAG} Session setup for 0x${ecmTx.toString(16).toUpperCase()}: TesterPresent only (HP Tuners approach)`);

  try {
    await this.sendUDSRequest(0x3e, 0x00, [], ecmTx, 2500);
    console.log(`${PPEI_TAG} ✅ TesterPresent OK on 0x${ecmTx.toString(16).toUpperCase()}`);
  } catch (e: any) {
    console.warn(`${PPEI_TAG} ⚠️ TesterPresent failed on 0x${ecmTx.toString(16).toUpperCase()}: ${e?.message ?? e}`);
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
    console.log(`${PPEI_TAG} 📤 TX → ${txHex}: svc=${svcHex} sub=${subHex} data=[${dataHex}] timeout=${timeoutMs}ms`);
    
    const start = performance.now();
    try {
      const result = await original.call(this, service, subFunction, data, targetAddress, timeoutMs, responseArbIdOverride);
      const elapsed = (performance.now() - start).toFixed(1);
      if (result) {
        const posNeg = result.positiveResponse ? '✅ POSITIVE' : '❌ NEGATIVE';
        const respData = result.data?.map((b: number) => b.toString(16).padStart(2, '0')).join(' ') ?? 'no data';
        console.log(`${PPEI_TAG} 📥 RX ← ${txHex}: ${posNeg} (${elapsed}ms) data=[${respData}]`);
      } else {
        console.log(`${PPEI_TAG} 📥 RX ← ${txHex}: null response (${elapsed}ms)`);
      }
      return result;
    } catch (e: any) {
      const elapsed = (performance.now() - start).toFixed(1);
      console.warn(`${PPEI_TAG} 💥 ERR ← ${txHex}: ${e?.message ?? e} (${elapsed}ms)`);
      throw e;
    }
  };
}

/**
 * ── PATCH 3: readPid wrapper ──
 * Logs every PID read attempt and result during scan.
 */
function wrapReadPid(original: Function) {
  return async function(this: any, pid: any) {
    const mode = pid.service || 0x01;
    const pidHex = `0x${pid.pid.toString(16).toUpperCase()}`;
    const modeHex = `0x${mode.toString(16).padStart(2, '0').toUpperCase()}`;
    console.log(`${PPEI_TAG} 🔍 readPid: ${pid.shortName ?? pid.name} (mode=${modeHex} pid=${pidHex})`);
    
    const start = performance.now();
    try {
      const result = await original.call(this, pid);
      const elapsed = (performance.now() - start).toFixed(1);
      if (result) {
        console.log(`${PPEI_TAG} ✅ readPid OK: ${pid.shortName ?? pid.name} = ${result.value} ${result.unit ?? ''} (${elapsed}ms)`);
      } else {
        console.warn(`${PPEI_TAG} ❌ readPid FAIL: ${pid.shortName ?? pid.name} → null (${elapsed}ms) — marked UNSUPPORTED`);
      }
      return result;
    } catch (e: any) {
      const elapsed = (performance.now() - start).toFixed(1);
      console.warn(`${PPEI_TAG} 💥 readPid ERROR: ${pid.shortName ?? pid.name} → ${e?.message ?? e} (${elapsed}ms)`);
      return null; // Match original behavior: catch → return null
    }
  };
}

/**
 * ── PATCH 4: openWebSocket wrapper ──
 * Intercepts the WebSocket onmessage to log all incoming can_frame messages.
 */
function wrapOpenWebSocket(original: Function) {
  return async function(this: any) {
    await original.call(this);
    // After the original sets up ws.onmessage, wrap it to add logging
    if (this.ws) {
      const originalOnMessage = this.ws.onmessage;
      let frameCount = 0;
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'can_frame' || msg.type === 'bus_frame') {
            frameCount++;
            const arbHex = `0x${(msg.arb_id ?? msg.arbitration_id ?? 0).toString(16).toUpperCase()}`;
            const dataHex = Array.isArray(msg.data) ? msg.data.map((b: number) => b.toString(16).padStart(2, '0')).join(' ') : '?';
            // Log first 20 frames, then every 50th to avoid spam
            if (frameCount <= 20 || frameCount % 50 === 0) {
              console.log(`${PPEI_TAG} 📡 WS frame #${frameCount}: ${arbHex} [${dataHex}]`);
            }
          } else if (msg.type === 'tx_ack') {
            console.log(`${PPEI_TAG} 📡 WS tx_ack: id=${msg.id} ok=${msg.ok}`);
          }
        } catch { /* ignore */ }
        // Call original handler
        if (originalOnMessage) {
          originalOnMessage.call(this.ws, event);
        }
      };
      console.log(`${PPEI_TAG} 🔌 WebSocket onmessage interceptor installed`);
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
            // Find the matching PID definition
            const pidDef = txPids.find((p: any) => p.pid === result.did);
            if (!pidDef) continue;

            try {
              // result.data includes [DID_hi, DID_lo, ...value_bytes]
              // Our formulas expect value bytes only (like ELM parity)
              const rawData: number[] = result.data || [];
              const payload = rawData.length >= 2 ? rawData.slice(2) : rawData;
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
          console.log(
            `${PPEI_TAG} ⚡ batch_read_dids TX=0x${txId.toString(16).toUpperCase()}: ` +
            `${okCount}/${dids.length} decoded in ${elapsed}ms (bridge: ${response.elapsed_ms}ms)`
          );
        } else {
          // Unexpected response — fall back to sequential
          console.warn(`${PPEI_TAG} ⚠️ batch_read_dids unexpected response, falling back to sequential`);
          for (const pid of txPids) {
            try {
              const reading = await originalReadPid.call(this, pid);
              if (reading) readings.push(reading);
            } catch { /* ignore */ }
          }
        }
      } catch (e: any) {
        // Bridge doesn't support batch_read_dids — fall back gracefully
        console.warn(
          `${PPEI_TAG} ⚠️ batch_read_dids failed (${e?.message ?? e}), falling back to sequential for ${txPids.length} DIDs`
        );
        for (const pid of txPids) {
          try {
            const reading = await originalReadPid.call(this, pid);
            if (reading) readings.push(reading);
          } catch { /* ignore */ }
        }
      }
    }

    return readings;
  };
}
// ── Apply all patches at module scope ──
console.log(`${PPEI_TAG} 🔧 Module loaded — attempting to apply patches...`);
try {
  const proto = PCANConnection.prototype as any;
  
  if (proto._ppeiFullyPatched) {
    console.log(`${PPEI_TAG} Patches already applied — skipping`);
  } else {
    // Patch 1: Session management
    proto._originalEnsureGmLiveDataSession = proto.ensureGmLiveDataSessionForTx;
    proto.ensureGmLiveDataSessionForTx = ppeiEnsureGmLiveDataSession;
    console.log(`${PPEI_TAG} ✅ Patch 1: ensureGmLiveDataSessionForTx → HP Tuners approach`);
    // Patch 2: sendUDSviaRawCAN diagnostic logging
    proto._originalSendUDSviaRawCAN = proto.sendUDSviaRawCAN;
    proto.sendUDSviaRawCAN = wrapSendUDSviaRawCAN(proto._originalSendUDSviaRawCAN);
    console.log(`${PPEI_TAG} ✅ Patch 2: sendUDSviaRawCAN → diagnostic logging wrapper`);
    // Patch 3: readPid diagnostic logging
    proto._originalReadPid = proto.readPid;
    proto.readPid = wrapReadPid(proto._originalReadPid);
    console.log(`${PPEI_TAG} ✅ Patch 3: readPid → diagnostic logging wrapper`);
    // Patch 4: openWebSocket interceptor
    proto._originalOpenWebSocket = proto.openWebSocket;
    proto.openWebSocket = wrapOpenWebSocket(proto._originalOpenWebSocket);
    console.log(`${PPEI_TAG} ✅ Patch 4: openWebSocket → WS message interceptor`);
    // Patch 5: readPids → batch_read_dids (fast multi-DID polling)
    // Must use _originalReadPid (the unwrapped version) for fallback,
    // and wrap the original readPids (before Patch 3 wrapped readPid).
    proto._originalReadPids = proto.readPids;
    proto.readPids = wrapReadPids(proto._originalReadPids, proto._originalReadPid || proto.readPid);
    console.log(`${PPEI_TAG} ✅ Patch 5: readPids → batch_read_dids (fast multi-DID polling)`);
    proto._ppeiFullyPatched = true;
    console.log(`${PPEI_TAG} 🚀 All PPEI patches applied successfully`);
  }
} catch (err) {
  console.error(`${PPEI_TAG} ❌ PATCH FAILED:`, err);
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
                PPEI diagnostic patches active — check console (F12) for [PPEI-DIAG] messages
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
