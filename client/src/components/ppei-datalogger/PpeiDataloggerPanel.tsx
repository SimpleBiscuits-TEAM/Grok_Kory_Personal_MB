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
 * ║  5. readPids — hybrid batch_read_dids + DDDI periodic FRP injection  ║
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
    // Check staleness based on active mode
    const staleCheckDid = _ppeiDddiMode === 'hpt_common' ? 0x245D : _ppeiDddiMode === 'fuel_rate' ? 0x245D : 0x328A;
    const lastPeriodicVal = _ppeiPeriodicValues.get(staleCheckDid); // FRP_ACT or FUEL_INJ_QTY
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
    // Determine DDDI mode from _desiredDddiMode (set by wrapReadPids based on selected PIDs)
    const dddiMode = (this as any)._desiredDddiMode || 'frp';
    ppeiLog(this, `DDDI mode: ${dddiMode}`);

    // Send dddi_setup to the bridge — this does the full sequence
    const response = await (this as any).sendRequest({
      type: 'dddi_setup',
      tx_id: ecmTx,
      dddi_mode: dddiMode,
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
        // Track which DDDI mode the bridge is running
        const activeMode = response.dddi_mode || dddiMode || 'frp';
        _ppeiDddiMode = activeMode as DddiMode;
        const modeDesc = activeMode === 'hpt_common'
          ? 'HPT_COMMON: 8 DPIDs (F7-FE) streaming 34 channels @ 20Hz'
          : activeMode === 'fuel_rate'
            ? 'FUEL_RATE: RPM + fuel mm³/stroke from DPID 0xFE'
            : 'FRP: FRP_ACT/FRP_DES as float32 MPa';
        ppeiLog(this, `DDDI periodic streaming started — ${modeDesc} from 0x5E8 frames`);
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

// ── DDDI Periodic Frame Parsing (supports FRP mode + fuel_rate mode) ──
// Mode 'frp' (default): HP Tuners IOCTL approach
//   Periodic ID 0xFE = FRP Actual (4 bytes float32 MPa from RAM 0x014F08)
//   Periodic ID 0xFD = FRP Desired (4 bytes float32 MPa from RAM 0x0225D8)
//   Formula: float32_BE(bytes[1..4]) * 145.038 = PSI
// Mode 'fuel_rate': HPT fuel rate DDDI (from IntelliSpy capture 2026-04-24)
//   DPID 0xFE layout: byte0=0xFE, bytes1-2=RPM (uint16 ×0.25), byte3=fuel_rate (uint8 mm³/stroke)
//   No IOCTL needed. Default session only. Verified: idle=6 mm³, elevated=8-14 mm³.
const DDDI_PERIODIC_ARB_ID = 0x5E8;
const MPA_TO_PSI = 145.038;

// DDDI mode tracking — set by dddi_setup response
type DddiMode = 'frp' | 'fuel_rate' | 'hpt_common';
let _ppeiDddiMode: DddiMode = 'frp';

// ── Virtual DID IDs for IOCTL-only channels (no Mode 22 equivalent) ──
// These are synthetic DIDs used only in the periodic value map to identify
// channels that come exclusively from IOCTL RAM addresses via DDDI streaming.
const VDID_METERING_VALVE = 0xDD00;  // IOCTL slot 0: Metering Unit Valve Current (A)
const VDID_FRP_FLOAT32 = 0xDD01;     // IOCTL slot 1: Fuel Rail Pressure (MPa, float32)
const VDID_LAMBDA_SMOKE = 0xDD02;    // IOCTL slot 2: Lambda Smoke Limit
const VDID_INJ_PULSE_WIDTH = 0xDD03; // IOCTL slot 3: Injector Pulse Width Cyl 1 (µs)
const VDID_CYL_AIRMASS = 0xDD04;    // IOCTL slot 4: Cylinder Airmass (mg)
const VDID_UNKNOWN_SLOT5 = 0xDD05;   // IOCTL slot 5: Unknown (0 at stationary)
const VDID_DES_FRP_FLOAT32 = 0xDD06; // IOCTL slot 6: Desired FRP (MPa, float32)
const VDID_BOOST_VACUUM = 0xDD08;    // DID 0x20E3 in DDDI = Boost/Vacuum (gauge PSI)

// Map periodic ID -> PID info for FRP mode
const PERIODIC_ID_MAP_FRP: Record<number, { did: number; shortName: string; unit: string }> = {
  0xFE: { did: 0x328A, shortName: 'FRP_ACT', unit: 'PSI' },
  0xFD: { did: 0x131F, shortName: 'FRP_DES', unit: 'PSI' },
};
// Map periodic ID -> PID info for fuel_rate mode
// DPID 0xFE contains BOTH RPM and fuel rate in a single frame
const FUEL_RATE_DPID_FE = {
  rpm: { did: 0x000C, shortName: 'RPM_DDDI', unit: 'RPM' },
  fuelRate: { did: 0x245D, shortName: 'FUEL_INJ_QTY', unit: 'mm³' },
};

// ── Module-level state for DDDI periodic streaming ──
let _ppeiDddiStreamingActive = false;
let _ppeiPeriodicFrameCount = 0;
let _ppeiConnectionRef: any = null;
const _ppeiPeriodicValues = new Map<number, {
  did: number;
  shortName: string;
  value: number;
  unit: string;
  rawBytes: number[];
  timestamp: number;
}>();

// ═══════════════════════════════════════════════════════════════════════════
// T87A TCM DDDI STREAMING (0x5EA) — Allison 1000 6-speed (2017-2019 L5P)
// ═══════════════════════════════════════════════════════════════════════════
// The T87A TCM broadcasts 0x5EA frames at ~40Hz after DDDI setup via Service 0x2D.
// RAM addresses verified from HP Tuners DDDI source analysis:
//   FE00 → RAM 0x40014682 (TCC Desired Pressure, 2 bytes, ×0.018 = PSI)
//   FE01 → RAM 0x40014DB4 (TCC Slip, 2 bytes, signed offset 32768, ×0.125 = rpm)
//   FE02 → RAM 0x400143C2 (Turbine RPM, 2 bytes — formula TBD)
//   FE03 → RAM 0x40014CC0 (Trans Fluid Temp, 2 bytes — formula TBD)
const TCM_DDDI_PERIODIC_ARB_ID = 0x5EA;
const TCM_TX_ID = 0x7E2;
const TCM_RX_ID = 0x7EA;

// Module-level state for TCM DDDI streaming
let _tcmDddiStreamingActive = false;
let _tcmDddiFrameCount = 0;
let _tcmDddiSetupInProgress = false;
const _tcmDddiPeriodicValues = new Map<number, {
  did: number;
  shortName: string;
  value: number;
  unit: string;
  rawBytes: number[];
  timestamp: number;
}>();

// TCM DDDI virtual PID IDs (match obdConnection.ts definitions)
const TCM_VDID_TCC_PRESSURE = 0xDE00;
const TCM_VDID_TCC_SLIP = 0xDE01;
const TCM_VDID_TURBINE_RPM = 0xDE02;
const TCM_VDID_TRANS_TEMP = 0xDE03;

/**
 * Parse a 0x5EA TCM DDDI periodic frame.
 * Frame format: [sub_frame_id, b1, b2, b3, b4, ...]
 *   FE sub-frame: TCC Desired Pressure (b1:b2) + TCC Slip Speed (b3:b4)
 *   FD sub-frame: Turbine RPM (b1:b2) + Trans Fluid Temp (b3:b4)
 */
function parseTcmDddiPeriodicFrame(data: number[]): void {
  if (!data || data.length < 3) return;
  const subFrame = data[0];
  const now = Date.now();

  _tcmDddiFrameCount++;
  _tcmDddiStreamingActive = true;

  if (_tcmDddiFrameCount <= 50 || _tcmDddiFrameCount % 200 === 0) {
    const hex = data.slice(0, Math.min(8, data.length)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`${PPEI_TAG} [TCM-DDDI-RX] #${_tcmDddiFrameCount} sub=0x${subFrame.toString(16).toUpperCase()} [${hex}]`);
  }

  if (subFrame === 0xFE && data.length >= 5) {
    // FE sub-frame: TCC Desired Pressure (b1<<8|b2) × 0.018 = PSI
    const rawPressure = (data[1] << 8) | data[2];
    const tccPressure = rawPressure * 0.018;
    if (Number.isFinite(tccPressure) && tccPressure >= 0 && tccPressure < 500) {
      _tcmDddiPeriodicValues.set(TCM_VDID_TCC_PRESSURE, {
        did: TCM_VDID_TCC_PRESSURE,
        shortName: 'TCCP_DDDI',
        value: Math.round(tccPressure * 10) / 10,
        unit: 'PSI',
        rawBytes: [data[1], data[2]],
        timestamp: now,
      });
    }

    // TCC Slip Speed: ((b3<<8|b4) - 32768) × 0.125 = rpm (signed offset)
    if (data.length >= 5) {
      const rawSlip = (data[3] << 8) | data[4];
      const tccSlip = (rawSlip - 32768) * 0.125;
      if (Number.isFinite(tccSlip) && Math.abs(tccSlip) < 5000) {
        _tcmDddiPeriodicValues.set(TCM_VDID_TCC_SLIP, {
          did: TCM_VDID_TCC_SLIP,
          shortName: 'TCCS_DDDI',
          value: Math.round(tccSlip * 10) / 10,
          unit: 'rpm',
          rawBytes: [data[3], data[4]],
          timestamp: now,
        });
      }
    }
  } else if (subFrame === 0xFD && data.length >= 5) {
    // FD sub-frame: Turbine RPM (b1:b2) + Trans Fluid Temp (b3:b4)
    const rawTurbine = (data[1] << 8) | data[2];
    // Tentative: same 0.125 scaling as turbine speed channels on similar TCMs
    const turbineRpm = rawTurbine * 0.125;
    if (Number.isFinite(turbineRpm) && turbineRpm >= 0 && turbineRpm < 15000) {
      _tcmDddiPeriodicValues.set(TCM_VDID_TURBINE_RPM, {
        did: TCM_VDID_TURBINE_RPM,
        shortName: 'TURB_RPM_DDDI',
        value: Math.round(turbineRpm),
        unit: 'rpm',
        rawBytes: [data[1], data[2]],
        timestamp: now,
      });
    }

    if (data.length >= 5) {
      const rawTemp = (data[3] << 8) | data[4];
      // Tentative: raw value logged for calibration (formula TBD)
      _tcmDddiPeriodicValues.set(TCM_VDID_TRANS_TEMP, {
        did: TCM_VDID_TRANS_TEMP,
        shortName: 'TFT_DDDI',
        value: rawTemp,
        unit: 'raw',
        rawBytes: [data[3], data[4]],
        timestamp: now,
      });
    }
  }
}

/**
 * Start T87A TCM DDDI streaming via the PCAN bridge.
 * Sends UDS commands to TCM (0x7E2→0x7EA): extended session, DDDI defines, start periodic.
 * After setup, 0x5EA frames will arrive passively on the CAN bus.
 */
async function startTcmDddiStreaming(conn: any): Promise<boolean> {
  if (_tcmDddiStreamingActive) return true;
  if (_tcmDddiSetupInProgress) return false;
  _tcmDddiSetupInProgress = true;
  _tcmDddiFrameCount = 0;

  try {
    ppeiLog(conn, '[TCM-DDDI] Starting T87A TCM DDDI streaming setup (0x7E2→0x7EA)...');

    // Step 0: Ensure 0x5EA is in the bridge's CAN filter so periodic frames reach the WebSocket
    try {
      await conn.sendRequest(
        { type: 'set_filter', arb_ids: [0x5E8, 0x5EA] },
        2000
      );
      ppeiLog(conn, '[TCM-DDDI] Bridge filter updated: 0x5E8 + 0x5EA added');
    } catch (e: any) {
      ppeiLog(conn, `[TCM-DDDI] Filter update failed (${e?.message}) — 0x5EA may already be in filter`);
    }

    // Step 1: Extended diagnostic session on TCM
    const sessResp = await conn.sendUDSRequest(0x10, 0x03, [], TCM_TX_ID, 3000, TCM_RX_ID);
    if (!sessResp || !sessResp.positiveResponse) {
      ppeiLog(conn, `[TCM-DDDI] Extended session failed on TCM — TCM may not be T87A`);
      _tcmDddiSetupInProgress = false;
      return false;
    }
    ppeiLog(conn, '[TCM-DDDI] Extended session OK on TCM (0x7E2)');

    // Step 2: TesterPresent keepalive
    await conn.sendUDSRequest(0x3E, 0x00, [], TCM_TX_ID, 500, TCM_RX_ID);

    // Step 3: Define DDDI FE00 → RAM 0x40014682 (TCC Desired Pressure, 2 bytes)
    // Service 0x2D: [2D FE 00 03 40 01 46 82 02]
    const dddi0Resp = await conn.sendUDSRequest(
      0x2D, undefined, [0xFE, 0x00, 0x03, 0x40, 0x01, 0x46, 0x82, 0x02],
      TCM_TX_ID, 2000, TCM_RX_ID
    );
    if (!dddi0Resp || !dddi0Resp.positiveResponse) {
      ppeiLog(conn, `[TCM-DDDI] DDDI FE00 define failed — TCM doesn't support DDDI`);
      _tcmDddiSetupInProgress = false;
      return false;
    }
    ppeiLog(conn, '[TCM-DDDI] DDDI FE00 (TCC Desired Pressure) defined OK');

    // Step 4: Define DDDI FE01 → RAM 0x40014DB4 (TCC Slip Speed, 2 bytes)
    const dddi1Resp = await conn.sendUDSRequest(
      0x2D, undefined, [0xFE, 0x01, 0x03, 0x40, 0x01, 0x4D, 0xB4, 0x02],
      TCM_TX_ID, 2000, TCM_RX_ID
    );
    if (dddi1Resp?.positiveResponse) {
      ppeiLog(conn, '[TCM-DDDI] DDDI FE01 (TCC Slip Speed) defined OK');
    } else {
      ppeiLog(conn, '[TCM-DDDI] DDDI FE01 not supported — continuing with FE00 only');
    }

    // Step 5: Define DDDI FE02 → RAM 0x400143C2 (Turbine RPM, 2 bytes)
    const dddi2Resp = await conn.sendUDSRequest(
      0x2D, undefined, [0xFE, 0x02, 0x03, 0x40, 0x01, 0x43, 0xC2, 0x02],
      TCM_TX_ID, 2000, TCM_RX_ID
    );
    if (dddi2Resp?.positiveResponse) {
      ppeiLog(conn, '[TCM-DDDI] DDDI FE02 (Turbine RPM) defined OK');
    } else {
      ppeiLog(conn, '[TCM-DDDI] DDDI FE02 not supported — skipping');
    }

    // Step 6: Define DDDI FE03 → RAM 0x40014CC0 (Trans Fluid Temp, 2 bytes)
    const dddi3Resp = await conn.sendUDSRequest(
      0x2D, undefined, [0xFE, 0x03, 0x03, 0x40, 0x01, 0x4C, 0xC0, 0x02],
      TCM_TX_ID, 2000, TCM_RX_ID
    );
    if (dddi3Resp?.positiveResponse) {
      ppeiLog(conn, '[TCM-DDDI] DDDI FE03 (Trans Fluid Temp) defined OK');
    } else {
      ppeiLog(conn, '[TCM-DDDI] DDDI FE03 not supported — skipping');
    }

    // Step 7: Start periodic transmission
    // [AA 03 00] = start periodic reads (same pattern as E41 ECM)
    const startResp = await conn.sendUDSRequest(
      0xAA, 0x03, [0x00],
      TCM_TX_ID, 2000, TCM_RX_ID
    );
    if (!startResp || (!startResp.positiveResponse && !(startResp.data && startResp.data[0] === 0xEA))) {
      ppeiLog(conn, `[TCM-DDDI] Start periodic failed: ${JSON.stringify(startResp)}`);
      _tcmDddiSetupInProgress = false;
      return false;
    }
    ppeiLog(conn, '[TCM-DDDI] Periodic streaming started — listening for 0x5EA frames...');

    // Step 8: Wait 2 seconds to verify frames arrive
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (_tcmDddiFrameCount === 0) {
      ppeiLog(conn, '[TCM-DDDI] No 0x5EA frames received in 2s — TCM DDDI not active');
      _tcmDddiSetupInProgress = false;
      return false;
    }

    ppeiLog(conn, `[TCM-DDDI] ✓ Streaming confirmed: ${_tcmDddiFrameCount} frames in 2s`);
    _tcmDddiSetupInProgress = false;
    return true;

  } catch (err) {
    ppeiLog(conn, `[TCM-DDDI] Setup error: ${err}`);
    _tcmDddiSetupInProgress = false;
    return false;
  }
}

/**
 * Decode 4 bytes as a big-endian IEEE 754 float32.
 * Used for IOCTL RAM values (FRP, Cylinder Airmass, Inj Pulse Width, etc.)
 */
function decodeFloat32BE(b0: number, b1: number, b2: number, b3: number): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint8(0, b0);
  view.setUint8(1, b1);
  view.setUint8(2, b2);
  view.setUint8(3, b3);
  return view.getFloat32(0, false); // big-endian
}

function parseDddiPeriodicFrame(data: number[]): void {
  if (!data || data.length < 4) return;
  const periodicId = data[0];
  
  _ppeiPeriodicFrameCount++;
  _ppeiDddiStreamingActive = true;
  const now = Date.now();

  // ══════════════════════════════════════════════════════════════════════════
  // HPT COMMON MODE: 8 DPIDs (0xF7-0xFE) streaming 34 channels @ 20Hz
  // Each DPID carries 7 data bytes: bytes data[1] through data[7]
  // ══════════════════════════════════════════════════════════════════════════
  if (_ppeiDddiMode === 'hpt_common') {
    if (data.length < 8) return; // Need DPID + 7 data bytes

    const storeVal = (did: number, shortName: string, value: number, unit: string, raw: number[]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        _ppeiPeriodicValues.set(did, { did, shortName, value, unit, rawBytes: raw, timestamp: now });
      }
    };

    switch (periodicId) {
      case 0xFE: {
        // DPID 0xFE: IOCTL[0](f32) + 0x30AA(2B filler) + DID 0x245D(1B)
        // bytes[1:5] = Metering Unit Valve Current (A, float32 BE)
        // bytes[5:7] = constant 0x28A0 (filler, ignored)
        // byte[7]    = Main Fuel Rate (mm³/stroke, uint8)
        const meteringValve = decodeFloat32BE(data[1], data[2], data[3], data[4]);
        const fuelRate = data[7];
        storeVal(VDID_METERING_VALVE, 'METER_VALVE', meteringValve, 'A', [data[1], data[2], data[3], data[4]]);
        storeVal(0x245D, 'FUEL_INJ_QTY', fuelRate, 'mm³', [data[7]]);
        break;
      }
      case 0xFD: {
        // DPID 0xFD: IOCTL[1](f32) + 0x30A9(2B filler) + DID 0x1543(1B)
        // bytes[1:5] = Fuel Rail Pressure (MPa, float32 BE) -> * 145.038 = PSI
        // bytes[5:7] = constant 0x28A0 (filler, ignored)
        // byte[7]    = Turbo Vane Position (uint8 * 100/255 = %)
        const frpMpa = decodeFloat32BE(data[1], data[2], data[3], data[4]);
        const frpPsi = frpMpa * MPA_TO_PSI;
        const turboVane = (data[7] * 100) / 255;
        storeVal(VDID_FRP_FLOAT32, 'FRP_ACT', frpPsi, 'PSI', [data[1], data[2], data[3], data[4]]);
        storeVal(0x328A, 'FRP_ACT', frpPsi, 'PSI', [data[1], data[2], data[3], data[4]]);
        storeVal(0x1543, 'ACT_VANE', turboVane, '%', [data[7]]);
        break;
      }
      case 0xFC: {
        // DPID 0xFC: IOCTL[2](f32) + 0x303B(2B filler) + DID 0x1540(1B)
        // bytes[1:5] = Lambda Smoke Limit (dimensionless, float32 BE)
        // bytes[5:7] = constant 0x28A0 (filler, ignored)
        // byte[7]    = Desired Turbo Vane Position (uint8 * 100/255 = %)
        const lambdaSmoke = decodeFloat32BE(data[1], data[2], data[3], data[4]);
        const desTurboVane = (data[7] * 100) / 255;
        storeVal(VDID_LAMBDA_SMOKE, 'LAMBDA_SMOKE', lambdaSmoke, '', [data[1], data[2], data[3], data[4]]);
        storeVal(0x1540, 'DES_VANE', desTurboVane, '%', [data[7]]);
        break;
      }
      case 0xFB: {
        // DPID 0xFB: IOCTL[3](f32) + 0x303A(2B filler) + PID 0x0B(1B)
        // bytes[1:5] = Injector Pulse Width Cyl 1 (µs, float32 BE) -> / 1000 = ms
        // bytes[5:7] = constant 0x28A0 (filler, ignored)
        // byte[7]    = Intake MAP (uint8) — OBD PID 0x0B in DDDI context
        //   DDDI returns non-standard scaling: 1 count = 1.6862 kPa = 0.244574 psi
        //   (validated: HPT idle=14.19psi @ byte=58, peak=17.85psi @ byte=73, ratio=0.244573 at both)
        const injPwUs = decodeFloat32BE(data[1], data[2], data[3], data[4]);
        const injPwMs = injPwUs / 1000;
        const mapRaw = data[7];
        const mapPsi = mapRaw * 0.244574;
        storeVal(VDID_INJ_PULSE_WIDTH, 'INJ_PW', injPwMs, 'ms', [data[1], data[2], data[3], data[4]]);
        storeVal(0x000B, 'MAP', mapPsi, 'PSI', [data[7]]);
        break;
      }
      case 0xFA: {
        // DPID 0xFA: IOCTL[4](f32) + IOCTL[5](2B) + PID 0x0D(1B)
        // bytes[1:5] = Cylinder Airmass (mg, float32 BE) -> / 1000 = grams
        // bytes[5:7] = IOCTL slot 5 (uint16, unknown — 0 at stationary)
        // byte[7]    = Vehicle Speed (km/h -> mph, uint8) — OBD PID 0x0D
        const cylAirmassMg = decodeFloat32BE(data[1], data[2], data[3], data[4]);
        const cylAirmassG = cylAirmassMg / 1000;
        const slot5 = (data[5] << 8) | data[6];
        const vssKmh = data[7];
        const vssMph = vssKmh * 0.621371;
        storeVal(VDID_CYL_AIRMASS, 'CYL_AIRMASS', cylAirmassG, 'g', [data[1], data[2], data[3], data[4]]);
        storeVal(VDID_UNKNOWN_SLOT5, 'IOCTL_SLOT5', slot5, '', [data[5], data[6]]);
        storeVal(0x000D, 'VSS', vssMph, 'MPH', [data[7]]);
        break;
      }
      case 0xF9: {
        // DPID 0xF9: IOCTL[6](f32) + DID 0x20B4(2B) + PID 0x2C(1B)
        // bytes[1:5] = Desired Fuel Rail Pressure (MPa, float32 BE) -> * 145.038 = PSI
        // bytes[5:7] = Commanded EGR A (DID 0x20B4, uint16 — complex scaling)
        // byte[7]    = Commanded EGR (PID 0x2C, uint8 * 100/255 = %)
        const desFrpMpa = decodeFloat32BE(data[1], data[2], data[3], data[4]);
        const desFrpPsi = desFrpMpa * MPA_TO_PSI;
        const egrCmdRaw = (data[5] << 8) | data[6];
        const egrCmd = (data[7] * 100) / 255;
        storeVal(VDID_DES_FRP_FLOAT32, 'FRP_DES', desFrpPsi, 'PSI', [data[1], data[2], data[3], data[4]]);
        storeVal(0x131F, 'FRP_DES', desFrpPsi, 'PSI', [data[1], data[2], data[3], data[4]]);
        storeVal(0x20B4, 'EGR_A_CMD', egrCmdRaw, '', [data[5], data[6]]);
        storeVal(0x002C, 'EGR_CMD', egrCmd, '%', [data[7]]);
        break;
      }
      case 0xF8: {
        // DPID 0xF8: DID 0x30AB(2B filler) + PID 0x5D(2B) + PID 0x10(2B) + PID 0x0F(1B)
        // bytes[1:3] = constant 0x28A0 (DID 0x30AB filler, ignored)
        // bytes[3:5] = Fuel Injection Timing (uint16 / 128 - 210 = degrees)
        // bytes[5:7] = Mass Airflow (uint16 / 100 = g/s)
        // byte[7]    = Intake Air Temp (uint8 - 40 = °C -> °F)
        const injTimingRaw = (data[3] << 8) | data[4];
        const injTimingDeg = (injTimingRaw / 128) - 210;
        const mafRaw = (data[5] << 8) | data[6];
        const mafGs = mafRaw / 100;
        const mafLbMin = mafGs * 0.132277;
        const iatC = data[7] - 40;
        const iatF = (iatC * 9 / 5) + 32;
        storeVal(0x005D, 'INJ_TMG', injTimingDeg, '°', [data[3], data[4]]);
        storeVal(0x0010, 'MAF', mafLbMin, 'lb/min', [data[5], data[6]]);
        storeVal(0x000F, 'IAT', iatF, '°F', [data[7]]);
        break;
      }
      case 0xF7: {
        // DPID 0xF7: DID 0x20E3(2B) + PID 0x0C(2B) + DID 0x328A(2B) + padding(1B)
        // bytes[1:3] = Boost/Vacuum (uint16 / 100 = kPa gauge -> * 0.145038 = PSI)
        // bytes[3:5] = Engine RPM (uint16 / 4 = RPM)
        // bytes[5:7] = Desired Boost (uint16 / 100 = kPa absolute -> * 0.145038 = PSI)
        // byte[7]    = always 0 (padding)
        const boostRaw = (data[1] << 8) | data[2];
        const boostPsi = (boostRaw / 100) * 0.145038;
        const rpmRaw = (data[3] << 8) | data[4];
        const rpm = rpmRaw / 4;
        const desBoostRaw = (data[5] << 8) | data[6];
        const desBoostPsi = (desBoostRaw / 100) * 0.145038;
        storeVal(VDID_BOOST_VACUUM, 'BOOST_VAC', boostPsi, 'PSI', [data[1], data[2]]);
        storeVal(0x000C, 'RPM', rpm, 'RPM', [data[3], data[4]]);
        // Use a virtual DID for Desired Boost to avoid collision with 0x328A (FRP_ACT in Mode 22)
        // In hpt_common mode, 0x328A on DPID 0xF7 is Desired Boost, not FRP
        storeVal(0xDD07, 'BOOST_DES', desBoostPsi, 'PSI', [data[5], data[6]]);
        break;
      }
    }

    // Log first 10 frames and every 500th
    if (_ppeiPeriodicFrameCount <= 10 || _ppeiPeriodicFrameCount % 500 === 0) {
      const hexStr = data.slice(0, 8).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      const vals: string[] = [];
      for (const [, pv] of _ppeiPeriodicValues) {
        if (now - pv.timestamp < 100) { // Only show recently updated values
          vals.push(`${pv.shortName}=${pv.value.toFixed(1)}${pv.unit}`);
        }
      }
      const msg = `DDDI hpt_common #${_ppeiPeriodicFrameCount}: 0x${periodicId.toString(16).toUpperCase()} [${hexStr}]` +
        (vals.length > 0 ? ` | ${vals.join(', ')}` : '');
      ppeiLog(_ppeiConnectionRef, msg);
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FUEL RATE MODE: DPID 0xFE = RPM (uint16 ×0.25) + fuel_rate (uint8 mm³/stroke)
  // ══════════════════════════════════════════════════════════════════════════
  if (_ppeiDddiMode === 'fuel_rate' && periodicId === 0xFE) {
    if (data.length < 4) return;
    const rpmRaw = (data[1] << 8) | data[2];
    const rpm = rpmRaw * 0.25;
    const fuelRate = data[3];
    if (Number.isFinite(rpm) && rpm >= 0 && rpm < 10000) {
      _ppeiPeriodicValues.set(FUEL_RATE_DPID_FE.rpm.did, {
        did: FUEL_RATE_DPID_FE.rpm.did,
        shortName: FUEL_RATE_DPID_FE.rpm.shortName,
        value: rpm,
        unit: FUEL_RATE_DPID_FE.rpm.unit,
        rawBytes: [data[1], data[2]],
        timestamp: now,
      });
    }
    if (fuelRate >= 0 && fuelRate <= 255) {
      _ppeiPeriodicValues.set(FUEL_RATE_DPID_FE.fuelRate.did, {
        did: FUEL_RATE_DPID_FE.fuelRate.did,
        shortName: FUEL_RATE_DPID_FE.fuelRate.shortName,
        value: fuelRate,
        unit: FUEL_RATE_DPID_FE.fuelRate.unit,
        rawBytes: [data[3]],
        timestamp: now,
      });
    }
    if (_ppeiPeriodicFrameCount <= 10 || _ppeiPeriodicFrameCount % 100 === 0) {
      const hexStr = data.slice(0, 5).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      const msg = `DDDI fuel_rate #${_ppeiPeriodicFrameCount}: [${hexStr}] ` +
        `RPM=${rpm.toFixed(0)} | FUEL_INJ_QTY=${fuelRate} mm³/stroke`;
      ppeiLog(_ppeiConnectionRef, msg);
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FRP MODE: standard float32 decode (original behavior)
  // ══════════════════════════════════════════════════════════════════════════
  if (data.length < 5) return;
  const pidInfo = PERIODIC_ID_MAP_FRP[periodicId];
  if (!pidInfo) return;
  
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
  
  if (_ppeiPeriodicFrameCount <= 10 || _ppeiPeriodicFrameCount % 100 === 0) {
    const frpAct = _ppeiPeriodicValues.get(0x328A);
    const frpDes = _ppeiPeriodicValues.get(0x131F);
    const hexStr = data.slice(0, 5).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const msg = `DDDI periodic #${_ppeiPeriodicFrameCount}: ` +
      `0x${periodicId.toString(16).toUpperCase()} [${hexStr}] ` +
      `MPa=${mpa.toFixed(3)} PSI=${psi.toFixed(0)} | ` +
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

            // ── DDDI periodic frame parsing (0x5E8 ECM + 0x5EA TCM) ──
            if (arbId === DDDI_PERIODIC_ARB_ID && dataArr.length >= 2) {
              parseDddiPeriodicFrame(dataArr);
            }
            if (arbId === TCM_DDDI_PERIODIC_ARB_ID && dataArr.length >= 3) {
              parseTcmDddiPeriodicFrame(dataArr);
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
      ppeiLog(this, 'WebSocket interceptor installed (with DDDI 0x5E8 + 0x5EA periodic parsers)');
    }
  };
}


/**
 * ── PATCH 5: readPids → HYBRID batch_read_dids + DDDI periodic ──
 * HYBRID MODE: When DDDI periodic streaming is active on 0x5E8:
 *   - FRP_ACT (0x328A) and FRP_DES (0x131F) come from periodic frames
 *   - All OTHER PIDs use batch_read_dids (Mode 22) as normal
 *   - Bridge re-sends 0xAA 04 FE FD after each batch to keep stream alive
 *
 * NORMAL MODE: When no DDDI streaming:
 *   - All PIDs use batch_read_dids (Mode 22)
 *   - Mode 01 PIDs use batch_read_mode01 (up to 6 PIDs per CAN frame)
 *
 * Falls back to sequential readPid if the bridge doesn't support batch_read_dids.
 */
function wrapReadPids(originalReadPids: Function, originalReadPid: Function) {
  return async function(this: any, pids: any[]): Promise<any[]> {
    // Split PIDs into Mode 01 (standard), Mode 22 (extended), and DDDI (0x2D, handled separately)
    const mode01Pids: any[] = [];
    const mode22Pids: any[] = [];
    for (const pid of pids) {
      const mode = pid.service || 0x01;
      if (mode === 0x22) {
        mode22Pids.push(pid);
      } else if (mode === 0x2D) {
        // DDDI PIDs (0xDE00+) are handled by TCM DDDI periodic injection below — 
        // never send them to batch_read_mode01 (PID values > 0xFF overflow a byte)
        continue;
      } else {
        mode01Pids.push(pid);
      }
    }
    const readings: any[] = [];
    // Store desired DDDI mode on the connection instance so ensureGmLiveDataSession can read it
    // Detect desired DDDI mode based on selected PIDs
    // hpt_common: when 3+ HPT-streamable PIDs are selected (covers most common logging scenarios)
    // fuel_rate: when only fuel injection qty PID is selected
    // frp: default FRP-only mode
    const HPT_COMMON_DIDS = new Set([
      0x328A, 0x131F, 0x245D, 0x1543, 0x1540, 0x20B4, 0x20E3,
      // Standard OBD PIDs that HPT streams via DDDI (Mode 01 equivalents)
      0x000B, 0x000C, 0x000D, 0x000F, 0x0010, 0x002C, 0x005D,
    ]);
    const hptStreamablePids = pids.filter((p: any) => HPT_COMMON_DIDS.has(p.pid));
    const hasFuelRatePid = pids.some((p: any) => p.pid === 0x245D);
    let desiredMode: DddiMode;
    if (hptStreamablePids.length >= 3) {
      desiredMode = 'hpt_common';
    } else if (hasFuelRatePid) {
      desiredMode = 'fuel_rate';
    } else {
      desiredMode = 'frp';
    }
    (this as any)._desiredDddiMode = desiredMode;

    // ══════════════════════════════════════════════════════════════════════
    // HYBRID MODE: When DDDI periodic streaming is active, FRP_ACT and
    // FRP_DES come from the periodic 0x5E8 frames (high-speed float32).
    // All OTHER PIDs still use batch_read_dids (Mode 22) as normal.
    // The bridge re-sends 0xAA 04 FE FD after each batch to keep the
    // periodic stream alive.
    //
    // DIDs excluded from batch when streaming: 0x328A (FRP_ACT), 0x131F (FRP_DES)
    // ══════════════════════════════════════════════════════════════════════
    const isStreaming = _ppeiDddiStreamingActive && _ppeiPeriodicFrameCount > 0;
    // PIDs that come from DDDI periodic frames — exclude from batch reads
    // FRP mode: 0x328A (FRP_ACT), 0x131F (FRP_DES)
    // Fuel rate mode: 0x245D (FUEL_INJ_QTY) — RPM (0x000C) still comes from Mode 01
    // In hpt_common mode, ALL channels come from periodic frames — exclude from batch reads
    const DDDI_PERIODIC_DIDS = _ppeiDddiMode === 'hpt_common'
      ? new Set([
          // IOCTL float32 channels (no Mode 22 DID equivalent)
          0xDD00, 0xDD01, 0xDD02, 0xDD03, 0xDD04, 0xDD05, 0xDD06, 0xDD07, 0xDD08,
          // Standard DIDs that HPT packs into DPIDs
          0x245D, 0x1543, 0x1540, 0x20E3, 0x20B4,
          // FRP comes from IOCTL float32 in hpt_common (higher precision than Mode 22)
          0x328A, 0x131F,
          // Standard OBD PIDs streamed via DDDI (Mode 01 equivalents)
          0x000B, 0x000C, 0x000D, 0x000F, 0x0010, 0x002C, 0x005D,
        ])
      : _ppeiDddiMode === 'fuel_rate'
        ? new Set([0x245D])
        : new Set([0x328A, 0x131F]);

    // Filter out DDDI PIDs from Mode 22 batch when streaming
    const batchMode22Pids = isStreaming
      ? mode22Pids.filter((p: any) => !DDDI_PERIODIC_DIDS.has(p.pid))
      : mode22Pids;

    if (isStreaming && mode22Pids.length !== batchMode22Pids.length) {
      const excluded = mode22Pids
        .filter((p: any) => DDDI_PERIODIC_DIDS.has(p.pid))
        .map((p: any) => p.shortName || `0x${p.pid.toString(16).toUpperCase()}`);
      ppeiLog(this,
        `HYBRID MODE: ${excluded.join(', ')} from DDDI periodic, ` +
        `${batchMode22Pids.length} other PIDs via batch_read_dids`
      );
    }

    // ── Mode 01: batched via bridge (up to 6 PIDs per CAN frame) ──
    // Filter out Mode 01 PIDs that are streamed via DDDI periodic frames
    const batchMode01Pids = isStreaming
      ? mode01Pids.filter((p: any) => !DDDI_PERIODIC_DIDS.has(p.pid))
      : mode01Pids;
    if (isStreaming && mode01Pids.length !== batchMode01Pids.length) {
      const excluded = mode01Pids
        .filter((p: any) => DDDI_PERIODIC_DIDS.has(p.pid))
        .map((p: any) => p.shortName || `0x${p.pid.toString(16).toUpperCase()}`);
      ppeiLog(this,
        `HYBRID MODE: Mode 01 PIDs from DDDI: ${excluded.join(', ')}`
      );
    }
    if (batchMode01Pids.length > 0) {
      // Build PID list with byte counts for the bridge
      const mode01PidList = batchMode01Pids.map((p: any) => ({
        pid: p.pid,
        bytes: p.bytes || 1,
      }));
      const mode01Timeout = Math.max(500, Math.ceil(batchMode01Pids.length / 6) * 250);
      try {
        const response: any = await this.sendRequest(
          {
            type: 'batch_read_mode01',
            pids: mode01PidList,
            tx_id: 0x7E0,
            timeout_ms: 200, // per-batch timeout (up to 6 PIDs per batch)
          },
          mode01Timeout,
        );
        if (response.type === 'batch_mode01_results' && Array.isArray(response.results)) {
          let okCount = 0;
          for (const result of response.results) {
            if (!result.ok) continue;
            const pidDef = batchMode01Pids.find((p: any) => p.pid === result.pid);
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
          ppeiLog(this,
            `batch_read_mode01: ${okCount}/${batchMode01Pids.length} decoded ` +
            `(${Math.ceil(batchMode01Pids.length / 6)} batches, bridge: ${response.elapsed_ms}ms)`
          );
        } else {
          // Fallback to sequential if bridge doesn't support batch_read_mode01
          ppeiWarn(this, 'batch_read_mode01 unsupported, falling back to sequential');
          for (const pid of batchMode01Pids) {
            try {
              const reading = await originalReadPid.call(this, pid);
              if (reading) readings.push(reading);
            } catch { /* ignore */ }
          }
        }
      } catch (e: any) {
        ppeiWarn(this, `batch_read_mode01 failed (${e?.message ?? e}), falling back to sequential`);
        for (const pid of mode01Pids) {
          try {
            const reading = await originalReadPid.call(this, pid);
            if (reading) readings.push(reading);
          } catch { /* ignore */ }
        }
      }
    }
    // ── Mode 22: batch via bridge ──
    if (batchMode22Pids.length === 0 && !isStreaming) return readings;
    // When streaming with NO batch PIDs (only FRP_ACT/FRPDI selected),
    // send a lightweight keepalive to the bridge to keep the DDDI periodic
    // stream alive. Without this, the ECU stops sending 0x5E8 frames after ~5s
    // because there's no batch_read_dids to trigger the periodic restart.
    if (batchMode22Pids.length === 0 && isStreaming) {
      try {
        await this.sendRequest(
          { type: 'dddi_keepalive', tx_id: 0x7E0 },
          2000,
        );
        ppeiLog(this, '⚡ DDDI keepalive sent (no batch PIDs, periodic-only mode)');
      } catch { /* ignore keepalive failures */ }
      // Skip to periodic injection below — no batch reads needed
    }
    // Group by ECU TX address (most will be 0x7E0, some on 0x7E1 for TCM)
    const byTx = new Map<number, any[]>();
    for (const pid of batchMode22Pids) {
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
      // Tight timeout: 500ms base + 200ms per DID (was max(3000, n*100) — too slow)
      const batchTimeout = Math.max(500, txPids.length * 200);
      try {
        const response: any = await this.sendRequest(
          {
            type: 'batch_read_dids',
            dids,
            tx_id: txId,
            timeout_ms: 150, // was 50 — too tight for busy CAN bus
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
    // ── Inject DDDI periodic values (FRP_ACT, FRP_DES from 0x5E8 frames) ──
    // Use generous max age for periodic values — during stream re-setup (stale detection
    // at 5s), we still want to show the last known periodic value rather than falling
    // back to batch-polled Mode 01 values which may have different scaling on diesel ECUs.
    const PERIODIC_MAX_AGE_MS = 15000;
    const now = Date.now();
    const injectedFromPeriodic: string[] = [];
    for (const pid of pids) {
      // If this PID already has a batch reading AND it's also a DDDI periodic PID,
      // prefer the periodic value (higher accuracy on diesel ECUs)
      const hasBatchReading = readings.some((r: any) => r.pid === pid.pid);
      const periodic = _ppeiPeriodicValues.get(pid.pid);
      const periodicFresh = periodic && (now - periodic.timestamp) < PERIODIC_MAX_AGE_MS;
      if (hasBatchReading && periodicFresh && DDDI_PERIODIC_DIDS.has(pid.pid)) {
        // Replace batch reading with periodic value (DDDI is more accurate)
        const idx = readings.findIndex((r: any) => r.pid === pid.pid);
        if (idx >= 0) {
          readings[idx] = {
            pid: periodic.did,
            name: pid.name,
            shortName: periodic.shortName,
            value: periodic.value,
            unit: periodic.unit,
            rawBytes: periodic.rawBytes,
            timestamp: periodic.timestamp,
          };
          injectedFromPeriodic.push(`${periodic.shortName}=${periodic.value.toFixed(1)}(replaced)`);
        }
        continue;
      }
      if (hasBatchReading) continue;
      if (periodicFresh) {
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
        `⚡ DDDI periodic: ${injectedFromPeriodic.join(', ')}`
      );
    }

    // ── Inject TCM DDDI periodic values (0x5EA frames: TCC Pressure, Slip, Turbine RPM, TFT) ──
    const tcmDddiPids = pids.filter((p: any) => p.service === 0x2D);
    if (tcmDddiPids.length > 0) {
      // Trigger TCM DDDI setup if not already streaming
      if (!_tcmDddiStreamingActive && !_tcmDddiSetupInProgress) {
        ppeiLog(this, `[TCM-DDDI] Detected ${tcmDddiPids.length} service 0x2D PIDs — initiating TCM DDDI setup...`);
        // Fire-and-forget: setup runs in background, frames will start arriving
        startTcmDddiStreaming(this).then(ok => {
          if (ok) {
            ppeiLog(this, '[TCM-DDDI] ✓ TCM DDDI streaming active — values will appear next cycle');
          } else {
            ppeiLog(this, '[TCM-DDDI] TCM DDDI setup failed — T87A TCM may not be present');
          }
        });
      }

      // Inject cached TCM DDDI values into readings
      const TCM_PERIODIC_MAX_AGE_MS = 5000;
      const injectedFromTcm: string[] = [];
      for (const pid of tcmDddiPids) {
        const tcmVal = _tcmDddiPeriodicValues.get(pid.pid);
        if (tcmVal && (now - tcmVal.timestamp) < TCM_PERIODIC_MAX_AGE_MS) {
          // Don't duplicate if already in readings
          const existing = readings.findIndex((r: any) => r.pid === pid.pid);
          if (existing >= 0) {
            readings[existing] = {
              pid: tcmVal.did,
              name: pid.name,
              shortName: tcmVal.shortName,
              value: tcmVal.value,
              unit: tcmVal.unit,
              rawBytes: tcmVal.rawBytes,
              timestamp: tcmVal.timestamp,
            };
          } else {
            readings.push({
              pid: tcmVal.did,
              name: pid.name,
              shortName: tcmVal.shortName,
              value: tcmVal.value,
              unit: tcmVal.unit,
              rawBytes: tcmVal.rawBytes,
              timestamp: tcmVal.timestamp,
            });
          }
          injectedFromTcm.push(`${tcmVal.shortName}=${tcmVal.value}`);
        }
      }
      if (injectedFromTcm.length > 0 && (_tcmDddiFrameCount <= 20 || _tcmDddiFrameCount % 50 === 0)) {
        ppeiLog(this,
          `⚡ TCM-DDDI periodic: ${injectedFromTcm.join(', ')}`
        );
      }
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
    console.log(`${PPEI_TAG} Patch 5: readPids → HYBRID batch_read_dids + DDDI periodic FRP injection`);
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
                Hybrid mode: DDDI periodic streaming for FRP + batch polling for all other PIDs
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
          {/* Advanced: Future SID 0x23 note */}
          <details
            style={{
              borderTop: '1px solid oklch(0.30 0.06 260 / 0.3)',
              background: 'oklch(0.12 0.02 260 / 0.4)',
            }}
          >
            <summary
              className="cursor-pointer px-4 py-1.5 select-none"
              style={{ color: 'oklch(0.55 0.08 260)', fontSize: '0.68rem', letterSpacing: '0.05em' }}
            >
              ADVANCED: Future SID 0x23 Full Polling (click to expand)
            </summary>
            <div className="px-4 pb-2" style={{ color: 'oklch(0.50 0.02 260)', fontSize: '0.65rem', lineHeight: '1.5' }}>
              <p style={{ marginBottom: '0.3rem' }}>
                <strong style={{ color: 'oklch(0.65 0.10 60)' }}>Current approach:</strong>{' '}
                FRP_ACT and FRP_DES use DDDI periodic streaming (IOCTL 0x2D + 0x2C + 0xAA) for high-speed float32 reads
                from ECU RAM. All other PIDs use standard Mode 22 batch polling.
              </p>
              <p style={{ marginBottom: '0.3rem' }}>
                <strong style={{ color: 'oklch(0.65 0.10 60)' }}>HPT full PID approach:</strong>{' '}
                HP Tuners uses NO DDDI periodic streaming in full PID mode. Instead, it sets up 6 IOCTL virtual DIDs
                (FE00-FE05) mapped to ECU RAM addresses, then interleaves Mode 22 DID reads with SID 0x23
                (ReadMemoryByAddress) RAM reads at ~200ms cycle time. No TesterPresent needed — session kept alive
                by continuous reads.
              </p>
              <p>
                <strong style={{ color: 'oklch(0.65 0.10 60)' }}>Future enhancement:</strong>{' '}
                Implement SID 0x23 polling for additional RAM-based PIDs (boost, injection timing, etc.)
                alongside the existing Mode 22 batch reads. This would match HPT's full PID protocol exactly.
                See <code style={{ color: 'oklch(0.60 0.12 170)' }}>docs/hpt-full-pid-analysis.md</code> for
                the complete protocol analysis including all IOCTL RAM addresses and SID 0x23 targets.
              </p>
            </div>
          </details>
        </div>
      )}

      <DataloggerPanel
        onOpenInAnalyzer={handleOpenInAnalyzer}
        injectedPids={processedPids}
      />
    </div>
  );
}
