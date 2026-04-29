/**
 * V-OP Can2USB — Web Serial transport for **@Firmware** (`fimware-v3.0`) USB↔CAN bridge.
 *
 * Wire format is the single source documented in **`bridge/bridge_protocol.py`** (same as legacy
 * `fimware-v3.0/host_tools` references where applicable).
 *
 * **Binary frame (little-endian CAN id, CRC over type..data):**
 * `55 AA | type | flags | can_id u32 | dlc | data[0..dlc] | crc16`
 *
 * - `type`: CAN_TX=0x01, CAN_RX=0x02, CMD=0x10, ACK=0x11, NACK=0x12; identity/efuse 0x30–0x35
 * - `flags`: EXT, RTR, EFUSE_SIMULATE, IDENTITY_WINBOND, IDENTITY_CRC_OK (see `bridge_protocol.py`)
 *
 * Host sends **CAN_TX** and waits **ACK/NACK**. Device pushes **CAN_RX** for bus traffic.
 * OBD-II is built in this file as **ISO-TP** on **0x7E0 / 0x7E8** (11-bit), same as typical GM ECU.
 *
 * **Baud:** pyserial default in CLI is **115200** (often irrelevant for USB CDC; Web Serial still sets it).
 */

import {
  ConnectionState,
  ConnectionEventType,
  ConnectionEvent,
  PIDDefinition,
  PIDReading,
  LogSession,
  VehicleInfo,
  ScanResult,
  DIDScanReport,
  STANDARD_PIDS,
  getPidsForVehicle,
  buildPersistedScanAutoPreset,
} from './obdConnection';
import { decodeVinNhtsa } from './universalVinDecoder';
import { type UDSResponse } from './pcanConnection';
import type { FlashBridgeConnection } from './flashBridgeConnection';
import { createVopStyleUdsLayer, type VopStyleUdsLayer } from './vopStyleUdsCore';
import {
  CAN_DATALOGGER_BITMASK_TIMEOUT_MS,
  CAN_DATALOGGER_VIN_TIMEOUT_MS,
  CAN_ISO_TP_DEFAULT_TIMEOUT_MS,
  CAN_ISO_TP_RX_POLL_MS,
  CAN_ISO_TP_RX_WAIT_FLOOR_MS,
  CAN_LIVE_OBD_MODE01_TIMEOUT_MS,
  CAN_LIVE_UDS_DID_TIMEOUT_MS,
  CAN_UDS_PRE_TX_SETTLE_MS,
  CAN_USB_BRIDGE_ACK_TIMEOUT_MS,
  CAN_USB_SERIAL_BRIDGE_SETTLE_MS,
} from './canTransportTiming';
import { DATALOGGER_STANDARD_BITMASK_PIDS } from './dataloggerVehicleScanProtocol';

type EventCallback = (event: ConnectionEvent) => void;

const MAGIC0 = 0x55;
const MAGIC1 = 0xaa;

const TYPE_CAN_TX = 0x01;
const TYPE_CAN_RX = 0x02;
const TYPE_CMD = 0x10;
const TYPE_ACK = 0x11;
const TYPE_NACK = 0x12;

const TYPE_IDENTITY_READ_REQ = 0x32;
const TYPE_IDENTITY_READ_DATA = 0x33;

const FLAG_EXTD = 1 << 0;
const FLAG_RTR = 1 << 1;
const FLAG_IDENTITY_WINBOND = 1 << 3;
const FLAG_IDENTITY_CRC_OK = 1 << 4;

/** Winbond-style identity blob size from `bridge/bridge_protocol.py`. */
const W25_IDENTITY_STRUCT_BYTES = 68;
/** Device-name field size from `bridge/bridge_protocol.py` (EFUSE_NAME_BYTES). */
const EFUSE_NAME_BYTES = 24;

/** Default addresses for physical OBD on ISO 15765 (GM / many ECUs). */
const OBD_TX_ID = 0x7e0;
const OBD_RX_ID = 0x7e8;

/** DDDI periodic IDs that HPT clears before Mode 22 reads (from IntelliSpy capture). */
const DDDI_CLEAR_PERIODIC_IDS = [
  0x01, 0x04, 0x07, 0x08, 0x0F, 0x12, 0x13, 0x14, 0x18, 0x1B,
  0x1E, 0x21, 0x27, 0x29, 0x2C, 0x2E, 0x30, 0x34, 0x35, 0x36,
  0x3A, 0x3B, 0x3E, 0x41, 0x42, 0x46, 0x4A, 0x4C, 0x4F, 0x50,
  0x52, 0x54, 0x5A, 0x5B, 0x5C, 0x61, 0x63, 0x64, 0x67, 0x68,
  0x69, 0x6A, 0x71, 0x72, 0x75, 0x77, 0x78, 0x7A, 0x7B, 0x87,
  0x88, 0x8B, 0x98, 0xB1, 0xE5, 0xFD,
];
/** Non-GM manufacturers that don't need DDDI clear. */
const NON_GM_MANUFACTURERS = new Set([
  'ford', 'chrysler', 'toyota', 'honda', 'nissan', 'hyundai', 'bmw',
  'canam', 'seadoo', 'polaris', 'kawasaki',
]);
/** Re-send DDDI clear every 30s (it's idempotent). */
const DDDI_CLEAR_INTERVAL_MS = 30_000;
/** TesterPresent keepalive interval — HPT sends every ~4s. */
const TESTER_PRESENT_INTERVAL_MS = 4_000;

/** Arb ID where ECU pushes DDDI periodic frames. */
const DDDI_PERIODIC_RX_ID = 0x5E8;

/**
 * DDDI periodic frame byte→channel mapping.
 * A2L-verified (E41_a171711502_quasi.a2l):
 *
 *   FE frame: [FE b1 b2 b3 b4 b5 b6 b7]
 *     bytes[1:4] = FRP_ACT — IEEE 754 FLOAT32 big-endian, unit MPa
 *                  A2L: VeFHPR_p_FuelRail at RAM 0x40014398, FLOAT32_IEEE, CM_T_p_MPa
 *                  Convert MPa → PSI: value × 145.038
 *     bytes[5:6] = FP_SAE  — uint16 big-endian × 0.01868 → PSI
 *
 *   FD frame: [FD b1 b2 b3 b4 0 0 0]
 *     b2-b3-b4 = FRP_DES candidate (needs more correlation)
 *
 * Previous (WRONG): b67_LE × 0.1338 — wrong data type (uint16 vs float32) and wrong byte positions
 */
const DDDI_FE_MPA_TO_PSI = 145.038;
const DDDI_FE_FP_SAE_SCALE = 0.4356; // byte5 × 0.4356 = PSI (BUSMASTER verified)


function crc16Ccitt(data: Uint8Array, off: number, len: number): number {
  let crc = 0xffff;
  for (let i = 0; i < len; i++) {
    crc ^= data[off + i] << 8;
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

function buildBridgePacket(pktType: number, flags: number, canId: number, data: Uint8Array): Uint8Array {
  const dlc = Math.min(data.length, 8);
  const idx = 2 + 1 + 1 + 4 + 1 + dlc + 2;
  const pkt = new Uint8Array(idx);
  let o = 0;
  pkt[o++] = MAGIC0;
  pkt[o++] = MAGIC1;
  pkt[o++] = pktType & 0xff;
  pkt[o++] = flags & 0xff;
  pkt[o++] = canId & 0xff;
  pkt[o++] = (canId >>> 8) & 0xff;
  pkt[o++] = (canId >>> 16) & 0xff;
  pkt[o++] = (canId >>> 24) & 0xff;
  pkt[o++] = dlc;
  for (let i = 0; i < dlc; i++) pkt[o++] = data[i];
  const crc = crc16Ccitt(pkt, 2, o - 2);
  pkt[o++] = crc & 0xff;
  pkt[o++] = (crc >>> 8) & 0xff;
  return pkt;
}

export interface VopCan2UsbConnectionConfig {
  baudRate?: number;
  txId?: number;
  rxId?: number;
  filters?: SerialPortRequestOptions['filters'];
}

type ParsedFrame = { type: number; flags: number; canId: number; data: Uint8Array };

export class VopCan2UsbConnection implements FlashBridgeConnection {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readActive = false;
  private rxBuf = new Uint8Array(0);

  private vopFlashUdsListener: ((arbId: number, data: Uint8Array) => void) | null = null;
  /** Reject for the in-flight {@link sendUDSRequest} wait (emergency abort). */
  private vopUdsInFlightReject: ((err: Error) => void) | null = null;
  private canRxMonitorCallbacks = new Set<(arbId: number, flags: number, data: Uint8Array) => void>();

  private state: ConnectionState = 'disconnected';
  private listeners: Map<ConnectionEventType, EventCallback[]> = new Map();
  private loggingActive = false;
  private currentSession: LogSession | null = null;
  supportedPids = new Set<number>();
  private vehicleInfo: VehicleInfo = {};
  private baudRate: number;
  private filters?: SerialPortRequestOptions['filters'];
  private obdTxId: number;
  private obdRxId: number;

  private readonly udsLayer: VopStyleUdsLayer;

  private ackWaiters: Array<{ resolve: (ok: boolean) => void }> = [];
  private rxFrames: Array<{ id: number; data: Uint8Array }> = [];

  /** In-flight reassembly for TYPE_IDENTITY_READ_DATA (0x33) frames from the device. */
  private bridgeIdentityAccumulator = new Uint8Array(0);
  private bridgeIdentityLastFlags = 0;
  /** Timestamp of last successful DDDI clear (per TX arb ID). */
  private dddiClearedAt = new Map<number, number>();
  /** TesterPresent keepalive interval handle. */
  private testerPresentTimer: ReturnType<typeof setInterval> | null = null;
  /** DDDI periodic streaming state (E41 ECM — 0x5E8 frames). */
  private dddiPeriodicActive = false;
  private dddiPeriodicUnsub: (() => void) | null = null;
  /** Latest DDDI periodic readings keyed by shortName (E41 ECM). */
  private dddiPeriodicValues = new Map<string, PIDReading>();
  /** T87A TCM DDDI streaming state (0x5EA frames, Service 0x2D RAM streaming). */
  private tcmDddiActive = false;
  private tcmDddiUnsub: (() => void) | null = null;
  private tcmDddiFrameCount = 0;
  private tcmDddiLastLogTime = 0;
  /** Latest T87A TCM DDDI periodic readings keyed by shortName. */
  private tcmDddiValues = new Map<string, PIDReading>();

  constructor(config: VopCan2UsbConnectionConfig = {}) {
    this.baudRate = config.baudRate ?? 115200;
    this.filters = config.filters;
    this.obdTxId = config.txId ?? OBD_TX_ID;
    this.obdRxId = config.rxId ?? OBD_RX_ID;
    this.udsLayer = createVopStyleUdsLayer({
      sendCanTx: (a, e, d, w) => this.sendCanTx(a, e, d, w),
      setFlashUdsListener: cb => {
        this.vopFlashUdsListener = cb;
      },
      setUdsInFlightReject: r => {
        this.vopUdsInFlightReject = r;
      },
      isTransportReady: () => this.writer !== null,
      abortAckWaiters: () => {
        for (const w of this.ackWaiters) w.resolve(false);
        this.ackWaiters.length = 0;
      },
      transportNotReadyMessage: 'USB CAN bridge not connected',
    });
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  on(type: ConnectionEventType, callback: EventCallback): void {
    const list = this.listeners.get(type) || [];
    list.push(callback);
    this.listeners.set(type, list);
  }

  off(type: ConnectionEventType, callback: EventCallback): void {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter(cb => cb !== callback));
  }

  /** Drop all event listeners (e.g. before re-binding UI when reusing the shared connection). */
  clearEventListeners(): void {
    this.listeners.clear();
  }

  private emit(type: ConnectionEventType, data?: unknown, message?: string): void {
    const event: ConnectionEvent = { type, data, message, timestamp: Date.now() };
    this.listeners.get(type)?.forEach(cb => cb(event));
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    this.emit('stateChange', s);
  }

  getState(): ConnectionState {
    return this.state;
  }

  private appendRxBuf(chunk: Uint8Array): void {
    const n = new Uint8Array(this.rxBuf.length + chunk.length);
    n.set(this.rxBuf, 0);
    n.set(chunk, this.rxBuf.length);
    this.rxBuf = n;
  }

  private tryParseFrames(): ParsedFrame[] {
    const out: ParsedFrame[] = [];
    let buf = this.rxBuf;

    while (buf.length >= 2) {
      const mi = buf.indexOf(MAGIC0);
      if (mi < 0) {
        buf = new Uint8Array(0);
        break;
      }
      if (mi > 0) buf = buf.subarray(mi);
      if (buf.length < 9) break;

      const type = buf[2];
      const flags = buf[3];
      const canId =
        buf[4] | (buf[5] << 8) | (buf[6] << 16) | (buf[7] << 24);
      let dlc = buf[8];
      if (dlc > 8) dlc = 8;
      const frameLen = 9 + dlc + 2;
      if (buf.length < frameLen) break;

      const frame = buf.subarray(0, frameLen);
      buf = buf.subarray(frameLen);

      const rxCrc = frame[frameLen - 2] | (frame[frameLen - 1] << 8);
      const calc = crc16Ccitt(frame, 2, frameLen - 2 - 2);
      if (rxCrc !== calc) {
        this.emit('log', null, `Bridge CRC mismatch rx=0x${rxCrc.toString(16)}`);
        continue;
      }

      const data = frame.subarray(9, 9 + dlc);
      out.push({ type, flags, canId, data: new Uint8Array(data) });
    }
    this.rxBuf = buf;
    return out;
  }

  private dispatchParsed(f: ParsedFrame): void {
    if (f.type === TYPE_IDENTITY_READ_DATA) {
      const n = new Uint8Array(this.bridgeIdentityAccumulator.length + f.data.length);
      n.set(this.bridgeIdentityAccumulator, 0);
      n.set(f.data, this.bridgeIdentityAccumulator.length);
      this.bridgeIdentityAccumulator = n;
      this.bridgeIdentityLastFlags = f.flags;
      return;
    }
    if (f.type === TYPE_ACK) {
      const w = this.ackWaiters.shift();
      if (w) w.resolve(true);
      return;
    }
    if (f.type === TYPE_NACK) {
      const w = this.ackWaiters.shift();
      if (w) w.resolve(false);
      return;
    }
    if (f.type === TYPE_CAN_RX) {
      const data = new Uint8Array(f.data);
      if (this.vopFlashUdsListener) {
        this.vopFlashUdsListener(f.canId, data);
      }
      for (const cb of this.canRxMonitorCallbacks) {
        try {
          cb(f.canId, f.flags, data);
        } catch {
          /* ignore */
        }
      }
      this.rxFrames.push({ id: f.canId, data: new Uint8Array(f.data) });
    }
  }

  /**
   * Live CAN RX for IntelliSpy (binary bridge {@link TYPE_CAN_RX}).
   * @returns unsubscribe
   */
  subscribeCanMonitor(handler: (arbId: number, flags: number, data: Uint8Array) => void): () => void {
    this.canRxMonitorCallbacks.add(handler);
    return () => {
      this.canRxMonitorCallbacks.delete(handler);
    };
  }

  /** Use container verify / ECU DB TX and RX for UDS (ISO-TP) before flash {@link connect}. */
  setFlashCanIds(tx: number, rx: number): void {
    this.obdTxId = tx;
    this.obdRxId = rx;
  }

  /** Drop queued ECU RX for this session so a stale 0x7E8 frame cannot pair with a new request. */
  private drainObdRxFrames(): void {
    this.rxFrames = this.rxFrames.filter(p => p.id !== this.obdRxId);
  }

  private async waitRxMatch(deadlineMs: number, pred: (id: number, d: Uint8Array) => boolean): Promise<Uint8Array | null> {
    const end = Date.now() + deadlineMs;
    while (Date.now() < end) {
      const idx = this.rxFrames.findIndex(p => pred(p.id, p.data));
      if (idx >= 0) {
        const hit = this.rxFrames.splice(idx, 1)[0];
        return hit.data;
      }
      await new Promise(r => setTimeout(r, CAN_ISO_TP_RX_POLL_MS));
    }
    return null;
  }

  private parseBridgeDeviceIdentity(raw: Uint8Array, flags: number): { name?: string; serial?: string; summary?: string } {
    // The identity payload is device-oriented (name + serial), not a flash chip JEDEC ID.
    // Firmware may include extra binary fields, so we extract printable ASCII tokens.
    const decodeAsciiField = (bytes: Uint8Array): string => {
      const out: number[] = [];
      let started = false;
      for (const b of bytes) {
        if (!started) {
          // Skip leading padding / non-ASCII until we hit the first printable char.
          if (b < 0x20 || b > 0x7e) continue;
          started = true;
        }
        // After we started, treat NUL as terminator.
        if (b === 0x00) break;
        if (b < 0x20 || b > 0x7e) continue;
        out.push(b);
      }
      return String.fromCharCode(...out).trim().replace(/\s+/g, ' ');
    };

    // First try fixed-field parsing: [name(24)] [serial(?) ...]
    // This matches the protocol constant EFUSE_NAME_BYTES and yields stable UI.
    const fixedName = decodeAsciiField(raw.subarray(0, Math.min(EFUSE_NAME_BYTES, raw.length)));
    const fixedTail = raw.length > EFUSE_NAME_BYTES ? raw.subarray(EFUSE_NAME_BYTES) : new Uint8Array(0);
    const fixedSerial = decodeAsciiField(fixedTail);

    const strings: string[] = [];
    let cur: number[] = [];
    const flush = () => {
      if (cur.length >= 3) strings.push(String.fromCharCode(...cur));
      cur = [];
    };
    for (const b of raw) {
      if (b >= 0x20 && b <= 0x7e) cur.push(b);
      else flush();
    }
    flush();

    const norm = (s: string) => s.trim().replace(/\s+/g, ' ');
    const tokens = strings.map(norm).filter(Boolean);

    const looksLikeSerial = (s: string) =>
      /^[A-Z0-9][A-Z0-9\-_.:]{5,}$/i.test(s) && !/^[A-F0-9]{6,}$/i.test(s); // avoid treating pure hex dumps as serials

    let name: string | undefined = fixedName || undefined;
    let serial: string | undefined = fixedSerial || undefined;

    // Prefer explicit patterns if firmware prints them.
    for (const t of tokens) {
      const mName = t.match(/^(?:device|name)\s*[:=]\s*(.+)$/i);
      if (mName && !name) name = norm(mName[1]);
      const mSer = t.match(/^(?:serial|sn)\s*[:=]\s*(.+)$/i);
      if (mSer && !serial) serial = norm(mSer[1]);
    }

    if (!name) name = tokens.find(t => !looksLikeSerial(t));
    if (!serial) serial = tokens.find(t => looksLikeSerial(t) && t !== name);

    // If we only got one token, decide if it's a name or serial.
    if (!serial && tokens.length === 1 && looksLikeSerial(tokens[0])) {
      serial = tokens[0];
      name = undefined;
    }

    const hints: string[] = [];
    if (flags & FLAG_IDENTITY_WINBOND) hints.push('flash');
    if (flags & FLAG_IDENTITY_CRC_OK) hints.push('crc ok');

    const core = [name, serial].filter(Boolean).join(' · ');
    const summary = hints.length && core ? `${core} (${hints.join(', ')})` : core || undefined;
    return { name, serial, summary };
  }

  /**
   * Reads optional flash identity from the bridge (TYPE_IDENTITY_READ_REQ → TYPE_IDENTITY_READ_DATA).
   * No-op if the firmware does not implement the command.
   */
  private async readBridgeDeviceIdentityIfSupported(): Promise<void> {
    if (!this.writer) return;
    delete this.vehicleInfo.vopDeviceName;
    delete this.vehicleInfo.vopDeviceSerial;
    delete this.vehicleInfo.vopDeviceIdentity;
    this.bridgeIdentityAccumulator = new Uint8Array(0);
    this.bridgeIdentityLastFlags = 0;
    try {
      const pkt = buildBridgePacket(TYPE_IDENTITY_READ_REQ, 0, 0, new Uint8Array(0));
      await this.writer.write(pkt);
      const t0 = Date.now();
      const deadline = t0 + 2500;
      let lastLen = 0;
      let idleMs = 0;
      while (Date.now() < deadline) {
        const len = this.bridgeIdentityAccumulator.length;
        if (len >= W25_IDENTITY_STRUCT_BYTES) break;
        if (len === 0 && Date.now() - t0 > 450) break;
        if (len === lastLen) idleMs += 12;
        else {
          lastLen = len;
          idleMs = 0;
        }
        if (len > 0 && idleMs >= 400) break;
        await new Promise(r => setTimeout(r, 12));
      }
      if (this.bridgeIdentityAccumulator.length === 0) return;
      const raw =
        this.bridgeIdentityAccumulator.length > W25_IDENTITY_STRUCT_BYTES
          ? this.bridgeIdentityAccumulator.slice(0, W25_IDENTITY_STRUCT_BYTES)
          : this.bridgeIdentityAccumulator;
      const parsed = this.parseBridgeDeviceIdentity(raw, this.bridgeIdentityLastFlags);
      if (parsed.name) this.vehicleInfo.vopDeviceName = parsed.name;
      if (parsed.serial) this.vehicleInfo.vopDeviceSerial = parsed.serial;
      if (parsed.summary) this.vehicleInfo.vopDeviceIdentity = parsed.summary;
    } catch {
      /* Older bridge / firmware without identity */
    }
  }

  private async sendCanTx(canId: number, ext: boolean, data: Uint8Array, waitAck: boolean): Promise<boolean> {
    if (!this.writer) return false;
    let flags = 0;
    if (ext) flags |= FLAG_EXTD;
    const pkt = buildBridgePacket(TYPE_CAN_TX, flags, canId, data.subarray(0, Math.min(8, data.length)));
    await this.writer.write(pkt);

    if (!waitAck) return true;
    return new Promise<boolean>(resolve => {
      this.ackWaiters.push({ resolve });
      window.setTimeout(() => {
        const i = this.ackWaiters.findIndex(w => w.resolve === resolve);
        if (i >= 0) {
          this.ackWaiters.splice(i, 1);
          resolve(false);
        }
      }, CAN_USB_BRIDGE_ACK_TIMEOUT_MS);
    });
  }

  private async isoTpRequest(pdu: number[], responseTimeoutMs = CAN_ISO_TP_DEFAULT_TIMEOUT_MS): Promise<number[] | null> {
    this.drainObdRxFrames();
    if (CAN_UDS_PRE_TX_SETTLE_MS > 0) {
      await new Promise(r => setTimeout(r, CAN_UDS_PRE_TX_SETTLE_MS));
    }

    // --- Single Frame path (payload <= 7 bytes) ---
    if (pdu.length <= 7) {
      const used = 1 + pdu.length;
      const canPdu = new Uint8Array(used);
      canPdu[0] = pdu.length & 0x0f;
      for (let i = 0; i < pdu.length; i++) canPdu[i + 1] = pdu[i] & 0xff;

      const ok = await this.sendCanTx(this.obdTxId, false, canPdu, true);
      if (!ok) {
        this.emit('log', null, 'CAN TX NACK/timeout from bridge');
        return null;
      }

      return this.readIsoTpResponse(responseTimeoutMs);
    }

    // --- Multi-Frame TX path (payload > 7 bytes, e.g. 8-byte IOCTL) ---
    // Uses callback-based FC listener (same proven pattern as vopStyleUdsCore)
    const totalLen = pdu.length;
    const ff = new Uint8Array(8);
    ff[0] = 0x10 | ((totalLen >> 8) & 0x0f);
    ff[1] = totalLen & 0xff;
    for (let i = 0; i < 6 && i < pdu.length; i++) ff[i + 2] = pdu[i] & 0xff;

    console.log(`[ISO-TP-MF] TX First Frame: ${Array.from(ff).map(b => b.toString(16).padStart(2,'0')).join(' ')}`);

    // Set up callback-based FC listener BEFORE sending FF
    const rxId = this.obdRxId;
    const fcPromise = new Promise<{ blockSize: number; stMin: number } | null>((resolve) => {
      const fcTimeout = setTimeout(() => {
        this.vopFlashUdsListener = null;
        resolve(null);
      }, Math.min(responseTimeoutMs, 5000));

      this.vopFlashUdsListener = (arbId: number, dataU8: Uint8Array) => {
        if (arbId !== rxId) return;
        if (dataU8.length === 0) return;
        const pciType = (dataU8[0] >> 4) & 0x0f;
        if (pciType === 3) {
          clearTimeout(fcTimeout);
          this.vopFlashUdsListener = null;
          resolve({ blockSize: dataU8[1] || 0, stMin: dataU8[2] || 0 });
        } else if (pciType === 0 && dataU8.length > 1 && dataU8[1] === 0x7f) {
          clearTimeout(fcTimeout);
          this.vopFlashUdsListener = null;
          resolve(null);
        }
      };
    });

    const ffOk = await this.sendCanTx(this.obdTxId, false, ff, true);
    if (!ffOk) {
      this.vopFlashUdsListener = null;
      this.emit('log', null, 'CAN TX NACK on First Frame');
      return null;
    }

    const fc = await fcPromise;
    if (!fc) {
      console.warn('[ISO-TP-MF] No Flow Control received from ECU');
      return null;
    }
    let stMinMs = fc.stMin <= 0x7f ? fc.stMin : 1;
    stMinMs = Math.max(stMinMs, 1);
    console.log(`[ISO-TP-MF] RX Flow Control: BS=${fc.blockSize} STmin=${fc.stMin} (${stMinMs}ms)`);

    // Send Continuation Frames via sendCanTx (proven path)
    let offset = 6; // first 6 bytes already sent in FF
    let seqNum = 1;
    while (offset < pdu.length) {
      const cf = new Uint8Array(8);
      cf[0] = 0x20 | (seqNum & 0x0f);
      for (let i = 0; i < 7 && (offset + i) < pdu.length; i++) {
        cf[i + 1] = pdu[offset + i] & 0xff;
      }
      console.log(`[ISO-TP-MF] TX CF seq=${seqNum}: ${Array.from(cf).map(b => b.toString(16).padStart(2,'0')).join(' ')}`);
      const cfOk = await this.sendCanTx(this.obdTxId, false, cf, true);
      if (!cfOk) {
        this.emit('log', null, 'CAN TX NACK on Continuation Frame');
        return null;
      }
      offset += 7;
      seqNum = (seqNum + 1) & 0x0f;
      if (stMinMs > 0 && offset < pdu.length) {
        await new Promise(r => setTimeout(r, stMinMs));
      }
    }

    return this.readIsoTpResponse(responseTimeoutMs);
  }

  /** Receive ISO-TP message from ECU (SF or FF+CF). */
  private async readIsoTpResponse(timeoutMs: number): Promise<number[] | null> {
    const end = Date.now() + timeoutMs;
    const out: number[] = [];
    let need = 0;
    let seq = 0;

    while (Date.now() < end) {
      const data = await this.waitRxMatch(
        Math.max(CAN_ISO_TP_RX_WAIT_FLOOR_MS, end - Date.now()),
        (id, d) => id === this.obdRxId && d.length >= 1,
      );
      if (!data || data.length < 1) return out.length ? out : null;

      const pci = data[0];

      if ((pci & 0xf0) === 0) {
        const l = pci & 0x0f;
        for (let i = 1; i <= l && i < data.length; i++) out.push(data[i]);
        return out;
      }

      if ((pci & 0xf0) === 0x10) {
        need = ((pci & 0x0f) << 8) | data[1];
        out.length = 0;
        for (let i = 2; i < 8 && out.length < need; i++) out.push(data[i]);
        const fc = new Uint8Array([0x30, 0x00, 0x08]);
        const fcOk = await this.sendCanTx(this.obdTxId, false, fc, true);
        if (!fcOk) return null;
        seq = 1;
        while (out.length < need && Date.now() < end) {
          const cf = await this.waitRxMatch(
            Math.max(CAN_ISO_TP_RX_WAIT_FLOOR_MS, end - Date.now()),
            (id, d) => id === this.obdRxId && d.length >= 1,
          );
          if (!cf) break;
          if ((cf[0] & 0xf0) !== 0x20) continue;
          const sn = cf[0] & 0x0f;
          if (sn !== (seq & 0x0f)) continue;
          for (let i = 1; i < 8 && out.length < need; i++) out.push(cf[i]);
          seq = (seq + 1) & 0x0f;
        }
        return out.length >= need ? out.slice(0, need) : out;
      }
    }
    return null;
  }

  private async pumpReader(): Promise<void> {
    if (!this.reader) return;
    const dec = new TextDecoder();
    try {
      while (this.readActive) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value?.length) {
          this.appendRxBuf(value);
          const frames = this.tryParseFrames();
          for (const f of frames) this.dispatchParsed(f);
        }
      }
    } catch {
      if (this.readActive) this.emit('error', null, 'Serial read ended');
    }
  }

  async connect(options?: { skipVehicleInit?: boolean }): Promise<boolean> {
    try {
      if (!VopCan2UsbConnection.isSupported()) {
        this.emit('error', null, 'Web Serial not available (use Chrome/Edge desktop).');
        return false;
      }

      // One SerialPort per device: a second open() throws "The port is already open".
      // Reuse when this instance already holds the port (e.g. shared singleton: Flash tab + Datalogger).
      if (this.isFlashTransportOpen()) {
        this.emit('log', null, 'USB CAN bridge already open — reusing connection.');
        if (options?.skipVehicleInit) {
          this.setState('ready');
          await this.readBridgeDeviceIdentityIfSupported();
          this.emit('vehicleInfo', this.vehicleInfo);
          return true;
        }
        if (this.supportedPids.size > 0) {
          this.setState('ready');
          this.emit('vehicleInfo', this.vehicleInfo);
          this.emit('pidAvailability', {
            supported: this.getAllAvailablePids(),
            unsupported: [],
          });
          return true;
        }
        this.setState('initializing');
        await this.initialize();
        this.setState('ready');
        this.emit('log', null, 'V-OP Can2USB ready.');
        return true;
      }

      this.setState('connecting');
      this.emit('log', null, 'Select V-OP Can2USB (USB Serial/JTAG COM port)…');
      this.port = await navigator.serial.requestPort({
        filters: this.filters?.length ? this.filters : undefined,
      });
      await this.port.open({ baudRate: this.baudRate });
      this.writer = this.port.writable!.getWriter();
      this.reader = this.port.readable!.getReader();
      this.rxBuf = new Uint8Array(0);
      this.rxFrames.length = 0;
      this.ackWaiters.length = 0;
      this.readActive = true;
      void this.pumpReader();

      await new Promise(r => setTimeout(r, CAN_USB_SERIAL_BRIDGE_SETTLE_MS));

      await this.readBridgeDeviceIdentityIfSupported();

      this.emit('log', null, 'Bridge ready (binary 55 AA protocol, @Firmware USBCanBridge).');

      if (options?.skipVehicleInit) {
        this.setState('ready');
        this.emit('vehicleInfo', this.vehicleInfo);
        this.emit('log', null, 'USB CAN bridge ready.');
        return true;
      }

      this.setState('initializing');
      await this.initialize();

      this.setState('ready');
      this.emit('log', null, 'V-OP Can2USB ready.');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('error', null, `Connect failed: ${msg}`);
      this.setState('error');
      await this.cleanupPort();
      return false;
    }
  }

  private async initialize(): Promise<void> {
    this.emit('log', null, 'Reading VIN (ISO-TP 7E0/7E8)…');
    try {
      const vinRaw = await this.isoTpRequest([0x09, 0x02], CAN_DATALOGGER_VIN_TIMEOUT_MS);
      if (vinRaw && vinRaw.length >= 3 + 17 && vinRaw[0] === 0x49 && vinRaw[1] === 0x02) {
        const vinChars = vinRaw.slice(3, 3 + 17);
        if (vinChars.length >= 17) {
          const vin = String.fromCharCode(...vinChars);
          this.vehicleInfo.vin = vin;
          this.emit('log', null, `VIN: ${vin}`);
          try {
            const decoded = await decodeVinNhtsa(vin);
            if (decoded) {
              this.vehicleInfo.make = decoded.make;
              this.vehicleInfo.model = decoded.model;
              this.vehicleInfo.year = decoded.year;
              this.vehicleInfo.engineType = decoded.engineType;
              this.vehicleInfo.displacement = decoded.displacement;
              this.vehicleInfo.cylinders = decoded.cylinders;
              this.vehicleInfo.manufacturer = decoded.manufacturer;
              if (decoded.nhtsaVerified && decoded.fuelType !== 'any') {
                this.vehicleInfo.fuelType = decoded.fuelType;
              }
              this.emit(
                'log',
                null,
                `Vehicle: ${decoded.year || ''} ${decoded.make || ''} ${decoded.model || ''}`
              );
            }
          } catch {
            this.emit('log', null, 'VIN decode failed — continuing');
          }
        }
      } else {
        this.emit('log', null, 'VIN not available (check ignition / address 7E0)');
      }
    } catch {
      this.emit('log', null, 'VIN read failed — continuing');
    }

    this.vehicleInfo.protocol = 'ISO 15765 CAN (V-OP @Firmware bridge)';
    this.vehicleInfo.protocolNumber = '6';
    this.emit('vehicleInfo', this.vehicleInfo);

    this.emit('log', null, 'Scanning supported PIDs…');
    await this.scanSupportedStandardPids();
    this.emit('pidAvailability', {
      supported: this.getAllAvailablePids(),
      unsupported: [],
    });
  }

  private async scanSupportedStandardPids(): Promise<void> {
    for (const bitmaskPid of DATALOGGER_STANDARD_BITMASK_PIDS) {
      try {
        const resp = await this.isoTpRequest([0x01, bitmaskPid], CAN_DATALOGGER_BITMASK_TIMEOUT_MS);
        if (resp && resp.length >= 2 && resp[0] === 0x41) {
          const pidByte = resp[1];
          if (pidByte !== bitmaskPid) continue;
          const bytes = resp.slice(2);
          if (bytes.length < 4) continue;
          for (let byteIdx = 0; byteIdx < 4; byteIdx++) {
            for (let bit = 7; bit >= 0; bit--) {
              if (bytes[byteIdx] & (1 << bit)) {
                const pid = bitmaskPid + byteIdx * 8 + (7 - bit) + 1;
                this.supportedPids.add(pid);
              }
            }
          }
        }
      } catch {
        break;
      }
    }
  }

  /**
   * DDDI clear sequence — unlocks Mode 22 on GM E41 ECU.
   * Sends: 1) Stop periodic reads (0xAA 0x04 0x00)
   *        2) Clear all 56 DDDI periodic definitions (0x2C 0xFE 0x00 XX)
   * NRC responses are expected and OK — some IDs may not be defined.
   */
  private async ensureDddiClear(): Promise<void> {
    const mfr = this.vehicleInfo?.manufacturer;
    if (mfr && NON_GM_MANUFACTURERS.has(mfr)) return;
    // Don't re-clear while DDDI periodic streaming is active — it would kill the stream
    if (this.dddiPeriodicActive) {
      console.log('[DDDI-CLEAR] Skipped — periodic streaming is active');
      return;
    }
    // During active logging, skip the full clear sequence — it sends 56 commands
    // that eat ~400ms of bus time. The clear was already done at session start.
    if (this.loggingActive) {
      return;
    }
    const now = Date.now();
    const last = this.dddiClearedAt.get(this.obdTxId) ?? 0;
    if (now - last < DDDI_CLEAR_INTERVAL_MS) return;

    this.emit('log', null, '[DDDI-CLEAR] Unlocking Mode 22…');
    console.log('[DDDI-CLEAR] === STARTING DDDI CLEAR SEQUENCE ===');
    const t0 = Date.now();

    // Phase 1: Stop any existing periodic reads
    try {
      const stopResp = await this.isoTpRequest([0xAA, 0x04, 0x00], 500);
      console.log(`[DDDI-CLEAR] AA stop resp: ${stopResp ? stopResp.map(b => b.toString(16).padStart(2,'0')).join(' ') : 'null/timeout'}`);
    } catch { /* NRC OK — nothing may be running */ }
    await new Promise(r => setTimeout(r, 10));

    // Phase 2: Clear all DDDI periodic definitions
    let okCount = 0;
    let nrcCount = 0;
    for (const pid of DDDI_CLEAR_PERIODIC_IDS) {
      try {
        const resp = await this.isoTpRequest([0x2C, 0xFE, 0x00, pid], 300);
        if (resp) {
          okCount++;
          if (resp[0] === 0x7F) nrcCount++;
        }
      } catch { /* NRC 0x31 expected for some IDs */ }
      // HPT sends these ~6ms apart
      await new Promise(r => setTimeout(r, 6));
    }

    this.dddiClearedAt.set(this.obdTxId, Date.now());
    const elapsed = Date.now() - t0;
    console.log(`[DDDI-CLEAR] Done: ${okCount}/${DDDI_CLEAR_PERIODIC_IDS.length} OK, ${nrcCount} NRC, ${elapsed}ms`);
    this.emit('log', null, `[DDDI-CLEAR] Done: ${okCount}/${DDDI_CLEAR_PERIODIC_IDS.length} OK in ${elapsed}ms`);
  }

  /** Short names of PIDs whose live data comes from DDDI periodic streaming (E41 ECM), not direct Mode 22. */
  private static readonly DDDI_PERIODIC_SHORTNAMES = new Set(['FRP_ACT', 'FP_SAE']);
  /** Short names of PIDs whose live data comes from T87A TCM DDDI streaming (0x5EA), not direct Mode 22. */
  private static readonly TCM_DDDI_SHORTNAMES = new Set(['TCCP_DDDI', 'TCCS_DDDI', 'TURB_RPM_DDDI', 'TFT_DDDI']);

  async readPid(pid: PIDDefinition): Promise<PIDReading | null> {
    try {
      // If this PID is served by T87A TCM DDDI streaming, handle it exclusively here.
      // These PIDs have no real Mode 22 DID — NEVER fall through to Mode 22 polling.
      if (VopCan2UsbConnection.TCM_DDDI_SHORTNAMES.has(pid.shortName)) {
        if (!this.tcmDddiActive) {
          // Streaming not yet active — return null (gauge shows ---) rather than
          // attempting a Mode 22 request that will always fail for synthetic 0xDExx PIDs.
          return null;
        }
        const tcmReading = this.getTcmDddiReading(pid.shortName);
        if (tcmReading) {
          if (Date.now() - this.tcmDddiLastLogTime > 2000) {
            console.log(`[TCM-DDDI-READ] ${pid.shortName} = ${tcmReading.value} ${tcmReading.unit} (from 0x5EA stream, age=${Date.now() - tcmReading.timestamp}ms)`);
          }
          return tcmReading;
        }
        // Streaming active but no frame yet — return null, not a Mode 22 fallback.
        return null;
      }
      // If this PID is served by DDDI periodic streaming, return the latest periodic value
      if (this.dddiPeriodicActive && VopCan2UsbConnection.DDDI_PERIODIC_SHORTNAMES.has(pid.shortName)) {
        const periodic = this.getDddiPeriodicReading(pid.shortName);
        if (periodic) {
          // Log periodic value every 2 seconds for debugging
          if (Date.now() - this.dddiPeriodicLastLogTime > 2000) {
            console.log(`[DDDI-READ] ${pid.shortName} = ${periodic.value} ${periodic.unit} (from periodic stream, age=${Date.now() - periodic.timestamp}ms)`);
          }
          return periodic;
        }
        // Periodic not available yet — fall through to Mode 22
        console.log(`[DDDI-READ] ${pid.shortName}: no periodic data yet, falling back to Mode 22`);
      }

      const service = pid.service || 0x01;

      // Ensure DDDI clear before first Mode 22 read
      if (service === 0x22) {
        await this.ensureDddiClear();
      }

      // Route Mode 22 requests to the correct ECU based on ecuHeader.
      // Default is 0x7E0 (ECM/PCM). TCM PIDs use 0x7E2 on 2019+ GM trucks.
      let savedTx: number | null = null;
      let savedRx: number | null = null;
      if (service === 0x22 && pid.ecuHeader) {
        const targetTx = parseInt(pid.ecuHeader.replace(/^0x/i, ''), 16);
        if (Number.isFinite(targetTx) && targetTx !== this.obdTxId) {
          savedTx = this.obdTxId;
          savedRx = this.obdRxId;
          this.obdTxId = targetTx;
          this.obdRxId = targetTx + 0x08; // Standard GM response offset
          this.drainObdRxFrames(); // Clear stale frames from previous ECU
        }
      }

      const pdu =
        service === 0x22
          ? [0x22, (pid.pid >> 8) & 0xff, pid.pid & 0xff]
          : [service, pid.pid];

      const respTimeout = service === 0x22 ? CAN_LIVE_UDS_DID_TIMEOUT_MS : CAN_LIVE_OBD_MODE01_TIMEOUT_MS;
      let resp: number[] | null;
      try {
        resp = await this.isoTpRequest(pdu, respTimeout);
      } finally {
        // Restore original TX/RX IDs after the request
        if (savedTx !== null && savedRx !== null) {
          this.obdTxId = savedTx;
          this.obdRxId = savedRx;
        }
      }
      if (!resp || resp.length < 2) return null;

      const posResp = service + 0x40;
      if (resp[0] === 0x7F && resp.length >= 3) {
        // NRC (Negative Response Code) — ECU rejected this request
        const nrc = resp[2];
        console.log(`[POLL-NRC] ${pid.shortName} (0x${pid.pid.toString(16)}) → NRC 0x${nrc.toString(16).toUpperCase()}`);
        // Return NRC info so monitoring loop can permanently blacklist unsupported DIDs
        return {
          pid: pid.pid, name: pid.name, shortName: pid.shortName,
          value: NaN, unit: pid.unit, rawBytes: [], timestamp: Date.now(),
          nrc,
        };
      }
      if (resp[0] !== posResp) return null;
      if (service === 0x22) {
        if (resp[1] !== ((pid.pid >> 8) & 0xff) || resp[2] !== (pid.pid & 0xff)) return null;
        const rawBytes = resp.slice(3);
        if (rawBytes.length === 0) return null;
        const value = pid.formula([...rawBytes]);
        return {
          pid: pid.pid,
          name: pid.name,
          shortName: pid.shortName,
          value,
          unit: pid.unit,
          rawBytes: [...rawBytes],
          timestamp: Date.now(),
        };
      }
      if (resp[1] !== pid.pid) return null;
      const rawBytes = resp.slice(2);
      if (rawBytes.length === 0) return null;
      const value = pid.formula([...rawBytes]);
      return {
        pid: pid.pid,
        name: pid.name,
        shortName: pid.shortName,
        value,
        unit: pid.unit,
        rawBytes: [...rawBytes],
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  }

  async readPids(pids: PIDDefinition[]): Promise<PIDReading[]> {
    // Sort by ecuHeader to minimize TX/RX address switches between ECM (7E0) and TCM (7E2).
    // ECM PIDs first, then TCM PIDs, then broadcast (Mode 01).
    const sorted = [...pids].sort((a, b) => {
      const hA = a.ecuHeader ?? '7DF';
      const hB = b.ecuHeader ?? '7DF';
      if (hA < hB) return -1;
      if (hA > hB) return 1;
      return 0;
    });
    const readings: PIDReading[] = [];
    for (const p of sorted) {
      const r = await this.readPid(p);
      if (r) readings.push(r);
    }
    return readings;
  }

  async readDTCs(): Promise<{ codes: string[]; pending: string[]; permanent: string[] }> {
    const result = { codes: [] as string[], pending: [] as string[], permanent: [] as string[] };
    try {
      const resp = await this.isoTpRequest([0x03]);
      if (resp && resp[0] === 0x43) result.codes = this.decodeDTCs(resp.slice(1));
    } catch {
      this.emit('log', null, 'Stored DTC read failed');
    }
    try {
      const resp = await this.isoTpRequest([0x07]);
      if (resp && resp[0] === 0x47) result.pending = this.decodeDTCs(resp.slice(1));
    } catch {
      /* optional */
    }
    return result;
  }

  private decodeDTCs(data: number[]): string[] {
    const codes: string[] = [];
    const prefixes = ['P', 'C', 'B', 'U'];
    for (let i = 0; i < data.length - 1; i += 2) {
      const b1 = data[i];
      const b2 = data[i + 1];
      if (b1 === 0 && b2 === 0) continue;
      const prefix = prefixes[(b1 >> 6) & 0x03];
      const d1 = (b1 >> 4) & 0x03;
      const d2 = b1 & 0x0f;
      const d3 = (b2 >> 4) & 0x0f;
      const d4 = b2 & 0x0f;
      codes.push(
        `${prefix}${d1}${d2.toString(16)}${d3.toString(16)}${d4.toString(16)}`.toUpperCase()
      );
    }
    return codes;
  }

  async clearDTCs(): Promise<boolean> {
    try {
      const r = await this.isoTpRequest([0x04]);
      if (r && r[0] === 0x44) {
        this.emit('dtcCleared');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async startLogging(
    pids: PIDDefinition[],
    intervalMs = 0,
    onData?: (readings: PIDReading[]) => void
  ): Promise<LogSession> {
    if (this.state !== 'ready') throw new Error('Device must be ready');

    const filteredPids = pids.filter(p => {
      if (p.service === 0x22) return true;  // Mode 22 always pass through
      if (p.service === 0x2D) return true;  // DDDI streaming PIDs — never in OBD bitmask, handled by streaming engine
      return this.supportedPids.has(p.pid);
    });
    const removed = pids.filter(p => !filteredPids.includes(p));
    if (removed.length > 0) {
      this.emit('log', null, `Pre-filtered ${removed.length} unsupported`);
      this.emit('pidAvailability', { supported: filteredPids, unsupported: removed });
    }
    if (filteredPids.length === 0) throw new Error('No supported PIDs to log');

    const session: LogSession = {
      id: `vop_log_${Date.now()}`,
      startTime: Date.now(),
      sampleRate: intervalMs,
      pids: [...filteredPids],
      readings: new Map(),
      vehicleInfo: this.vehicleInfo,
    };
    for (const p of filteredPids) session.readings.set(p.pid, []);

    this.currentSession = session;

    // One-time DDDI clear BEFORE we set loggingActive, so Mode 22 reads work immediately.
    // During the logging loop itself, ensureDddiClear is skipped to save bus time.
    await this.ensureDddiClear();

    this.loggingActive = true;
    this.setState('logging');

    // Detect if any selected PIDs target the TCM (0x7E2) so we can open an extended session
    // and send TesterPresent keepalives to both ECM and TCM.
    const hasTcmPids = filteredPids.some(p => p.ecuHeader === '7E2');
    if (hasTcmPids) {
      this.emit('log', null, '[TCM] TCM PIDs selected — opening extended diagnostic session on 0x7E2...');
      const origTx = this.obdTxId;
      const origRx = this.obdRxId;
      this.obdTxId = 0x7E2;
      this.obdRxId = 0x7EA;
      this.drainObdRxFrames();
      try {
        // TesterPresent first
        await this.isoTpRequest([0x3E, 0x00], 2500);
        // Extended Diagnostic Session (0x10 0x03)
        const sessResp = await this.isoTpRequest([0x10, 0x03], 4000);
        if (sessResp && sessResp[0] === 0x50) {
          this.emit('log', null, '[TCM] Extended diagnostic session opened on 0x7E2');
        } else {
          this.emit('log', null, '[TCM] Extended session request to 0x7E2 did not get positive response — falling back to default session');
          await this.isoTpRequest([0x10, 0x01], 3000);
        }
      } catch {
        this.emit('log', null, '[TCM] Failed to open extended session on 0x7E2 — TCM PIDs may return NRC');
      }
      // Restore ECM address
      this.obdTxId = origTx;
      this.obdRxId = origRx;
    }

    // Start TesterPresent keepalive (HPT sends 0x3E 0x00 every ~4s)
    // When TCM PIDs are active, also send TesterPresent to 0x7E2.
    this.stopTesterPresent();
    this.testerPresentTimer = setInterval(async () => {
      if (!this.loggingActive) return;
      try {
        await this.isoTpRequest([0x3E, 0x00], 500);
      } catch { /* ignore — non-critical keepalive */ }
      if (hasTcmPids) {
        const origTx = this.obdTxId;
        const origRx = this.obdRxId;
        this.obdTxId = 0x7E2;
        this.obdRxId = 0x7EA;
        try {
          await this.isoTpRequest([0x3E, 0x00], 500);
        } catch { /* ignore — non-critical keepalive */ }
        this.obdTxId = origTx;
        this.obdRxId = origRx;
      }
    }, TESTER_PRESENT_INTERVAL_MS);

    // Start DDDI periodic streaming for fuel pressure if any DDDI PIDs are selected
    const dddiShortNames = filteredPids.filter(p => VopCan2UsbConnection.DDDI_PERIODIC_SHORTNAMES.has(p.shortName)).map(p => p.shortName);
    const hasDddiPids = dddiShortNames.length > 0;
    this.emit('log', null, `[DDDI] hasDddiPids=${hasDddiPids} (matched: ${dddiShortNames.join(', ') || 'none'}) out of ${filteredPids.length} PIDs`);
    console.log(`[DDDI] hasDddiPids=${hasDddiPids}, matched shortNames: [${dddiShortNames.join(', ')}], all shortNames: [${filteredPids.map(p=>p.shortName).join(', ')}]`);
    if (hasDddiPids) {
      this.emit('log', null, '[DDDI] Starting DDDI periodic streaming setup...');
      const dddiOk = await this.startDddiPeriodicStreaming();
      if (!dddiOk) {
        this.emit('log', null, 'DDDI periodic setup failed — FRP/FP_SAE will use snapshot Mode 22 reads');
      } else {
        this.emit('log', null, '[DDDI] Periodic streaming setup completed successfully');
      }
    } else {
      this.emit('log', null, '[DDDI] No DDDI PIDs selected — skipping periodic streaming');
    }

    // Start T87A TCM DDDI streaming if any TCM DDDI PIDs are selected
    const tcmDddiShortNames = filteredPids.filter(p => VopCan2UsbConnection.TCM_DDDI_SHORTNAMES.has(p.shortName)).map(p => p.shortName);
    const hasTcmDddiPids = tcmDddiShortNames.length > 0;
    this.emit('log', null, `[TCM-DDDI] hasTcmDddiPids=${hasTcmDddiPids} (matched: ${tcmDddiShortNames.join(', ') || 'none'})`);
    if (hasTcmDddiPids) {
      this.emit('log', null, '[TCM-DDDI] Starting T87A TCM DDDI streaming setup...');
      const tcmDddiOk = await this.startTcmDddiStreaming();
      if (!tcmDddiOk) {
        this.emit('log', null, '[TCM-DDDI] TCM DDDI setup failed — T87A channels will use Mode 22 fallback');
      } else {
        this.emit('log', null, '[TCM-DDDI] T87A TCM DDDI streaming active — 0x5EA frames incoming');
      }
    } else {
      this.emit('log', null, '[TCM-DDDI] No T87A TCM DDDI PIDs selected — skipping TCM DDDI setup');
    }

    const fail = new Map<number, number>();
    const pause = new Map<number, number>();
    // MAXF: pause a DID after this many consecutive failures (was 8, reduced to 2
    // so unsupported DIDs get removed from rotation within 2 cycles instead of 8)
    const MAXF = 2;
    // RET: number of cycles before retrying a paused DID (was 20, increased to 50
    // so paused DIDs stay out of rotation for ~5 minutes)
    const RET = 50;
    const nrcCount = new Map<number, number>(); // Track NRC responses for permanent blacklisting
    const blacklisted = new Set<number>(); // Permanently blacklisted DIDs (NRC 0x31)
    const NRC_BL = 2; // Blacklist after 2 NRC responses
    let active = [...filteredPids];
    let loop = 0;

    // Priority PIDs: these get polled every 2nd cycle for faster update rate
    // when DDDI periodic streaming is not active (Mode 22 fallback).
    // This ensures FRP_ACT updates every ~2 cycles instead of waiting for
    // the full DID rotation (which can be 40+ DIDs = ~6 second gap).
    const PRIORITY_SHORTNAMES = new Set(['FRP_ACT', 'FP_SAE']);
    const priorityPids = filteredPids.filter(p => PRIORITY_SHORTNAMES.has(p.shortName));
    if (priorityPids.length > 0) {
      this.emit('log', null, `[POLL] Priority PIDs: ${priorityPids.map(p=>p.shortName).join(', ')} (polled every 2nd cycle)`);
    }

    const logLoop = async () => {
      while (this.loggingActive) {
        const t0 = Date.now();
        loop++;
        // Log cycle stats every 10 loops
        if (loop % 10 === 1) {
          console.log(`[POLL] Cycle ${loop}: ${active.length} active DIDs, ${pause.size} paused, dddiActive=${this.dddiPeriodicActive}`);
        }
        for (const [pid, at] of pause) {
          if (loop >= at) {
            const d = filteredPids.find(x => x.pid === pid);
            if (d && !active.find(x => x.pid === pid)) {
              active.push(d);
              fail.set(pid, 0);
              pause.delete(pid);
            }
          }
        }
        try {
          // Priority polling: on even cycles, poll priority PIDs first
          // (only when DDDI is not active — if DDDI works, readPid returns
          // the periodic value instantly without a bus request)
          if (loop % 2 === 0 && priorityPids.length > 0 && !this.dddiPeriodicActive) {
            const priorityReadings = await this.readPids(priorityPids);
            for (const r of priorityReadings) {
              session.readings.get(r.pid)?.push(r);
              fail.set(r.pid, 0);
            }
            if (onData && priorityReadings.length) onData(priorityReadings);
          }

          const allReadings = await this.readPids(active);
          // Separate NRC responses from valid data
          const readings: PIDReading[] = [];
          const nrcHits: PIDReading[] = [];
          for (const r of allReadings) {
            if (r.nrc) nrcHits.push(r);
            else readings.push(r);
          }
          const got = new Set(readings.map(r => r.pid));
          for (const r of readings) {
            session.readings.get(r.pid)?.push(r);
            fail.set(r.pid, 0);
            nrcCount.set(r.pid, 0);
          }
          // Permanently blacklist DIDs with NRC 0x31 (Request Out Of Range)
          const newBl: string[] = [];
          for (const r of nrcHits) {
            const n = (nrcCount.get(r.pid) || 0) + 1;
            nrcCount.set(r.pid, n);
            if (n >= NRC_BL && !blacklisted.has(r.pid)) {
              blacklisted.add(r.pid);
              const d = active.find(p => p.pid === r.pid);
              newBl.push(`${d?.shortName || '0x' + r.pid.toString(16)} (NRC 0x${(r.nrc||0).toString(16)})`);
            }
          }
          if (newBl.length) {
            active = active.filter(p => !blacklisted.has(p.pid));
            console.log(`[POLL] Blacklisted ${newBl.length} unsupported DIDs: ${newBl.join(', ')}`);
            this.emit('log', null, `Blacklisted: ${newBl.join(', ')}`);
          }
          const paused: string[] = [];
          for (const p of active) {
            if (!got.has(p.pid) && !nrcHits.find(r => r.pid === p.pid)) {
              const f = (fail.get(p.pid) || 0) + 1;
              fail.set(p.pid, f);
              if (f >= MAXF && !pause.has(p.pid)) {
                pause.set(p.pid, loop + RET);
                paused.push(p.shortName);
              }
            }
          }
          if (paused.length) {
            active = active.filter(p => !pause.has(p.pid));
            console.log(`[POLL] Paused ${paused.length} failing DIDs: ${paused.join(', ')} | Active: ${active.length} remaining`);
            this.emit('log', null, `Paused: ${paused.join(', ')}`);
          }
          if (onData && readings.length) onData(readings);
        } catch (e) {
          if (this.loggingActive) this.emit('log', null, String(e));
        }
        const w = Math.max(0, intervalMs - (Date.now() - t0));
        if (w > 0 && this.loggingActive) await new Promise(r => setTimeout(r, w));
      }
    };
    void logLoop();
    return session;
  }

  stopLogging(): LogSession | null {
    this.loggingActive = false;
    this.stopTesterPresent();
    void this.stopDddiPeriodicStreaming();
    void this.stopTcmDddiStreaming();
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      const s = this.currentSession;
      this.currentSession = null;
      this.setState('ready');
      return s;
    }
    this.setState('ready');
    return null;
  }

  private stopTesterPresent(): void {
    if (this.testerPresentTimer) {
      clearInterval(this.testerPresentTimer);
      this.testerPresentTimer = null;
    }
  }

  /**
   * Set up DDDI periodic streaming for fuel pressure.
   * Replicates the EXACT HPT sequence from BUSMASTER capture (2026-04-23):
   *
   *   HPT Timing (from BUSMASTER):
   *   1. AA 04 00                          → Stop all periodic (NRC 0x31 OK)
   *   2. Wait 3200ms                       → ECU settling time
   *   3. 2D FE 00 40 01 4F 08 04           → IOCTL define FE00 (RAM 0x40014F08, 4 bytes)
   *   4. 2C FE FE 00 00 0A 00              → DDDI composite FE = [FE00]
   *   5. 2D FE 01 40 02 25 D8 04           → IOCTL define FE01 (RAM 0x400225D8, 4 bytes)
   *   6. 2C FD FE 01 00 00 00              → DDDI composite FD = [FE01]
   *   7. AA 04 FE FD                       → Start periodic for FE + FD at fast rate
   *
   *   Result: 0x5E8 frames at ~12.5ms (80 Hz)
   *     FE frame: [FE] [FLOAT32_BE MPa] [FP_SAE_byte] [00] [00]
   *     FD frame: [FD] [FLOAT32_BE MPa] [00] [00] [00]
   */
  private dddiPeriodicFrameCount = 0;
  private dddiPeriodicLastLogTime = 0;

  private async startDddiPeriodicStreaming(): Promise<boolean> {
    const mfr = this.vehicleInfo?.manufacturer;
    if (mfr && NON_GM_MANUFACTURERS.has(mfr)) return false;
    if (this.dddiPeriodicActive) return true;

    this.dddiPeriodicFrameCount = 0;
    this.dddiPeriodicLastLogTime = 0;

    const hex = (arr: number[]) => arr.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const logResp = (label: string, resp: number[] | null) =>
      console.log(`[DDDI-STREAM] RX ${label}: ${resp ? hex(resp) : 'NULL/TIMEOUT'}`);

    this.emit('log', null, '[DDDI-STREAM] Setting up fuel pressure periodic streaming…');
    console.log('[DDDI-STREAM] === STARTING DDDI PERIODIC SETUP (HPT-matched) ===');

    try {
      // ── Step 1: Stop any existing periodic reads ──
      // HPT sends: AA 04 00 (NRC 0x31 expected if nothing running)
      const stopCmd = [0xAA, 0x04, 0x00];
      console.log(`[DDDI-STREAM] TX AA stop: ${hex(stopCmd)}`);
      try {
        const stopResp = await this.isoTpRequest(stopCmd, 2000);
        logResp('AA stop', stopResp);
      } catch { /* NRC OK */ }

      // ── Step 2: Wait 3200ms for ECU to settle ──
      // HPT waits exactly 3201ms between AA stop and first IOCTL.
      // This is critical — without it the ECU ignores the defines.
      console.log('[DDDI-STREAM] Waiting 3200ms for ECU to settle (HPT-matched)…');
      this.emit('log', null, '[DDDI-STREAM] Waiting 3.2s for ECU settle…');
      await new Promise(r => setTimeout(r, 3200));

      // ── Step 3: IOCTL define FE00 — FRP_ACT (RAM 0x40014F08, 4 bytes) ──
      // HPT sends: 2D FE 00 40 01 4F 08 04 (8 bytes, multi-frame ISO-TP)
      //   FF: 10 08 2D FE 00 40 01 4F
      //   FC: 30 xx xx (from ECU)
      //   CF: 21 08 04 00 00 00 00 00
      //   Resp: 04 6D FE 00 00 (positive)
      //
      // APPROACH: Use callback-based FC listener (same pattern as proven vopStyleUdsCore
      // sendUdsMultiFrame which works for flashing). Previous approaches that failed:
      //   1. isoTpRequest multi-frame — silently dropped on hardware
      //   2. sendUDSRequest (vopStyleUdsCore) — silently failed
      //   3. Raw sendCanTx FF + waitRxMatch FC + raw writer.write CF — CF never reached ECU
      // The key difference: vopStyleUdsCore uses setFlashUdsListener (callback) for FC,
      // then sends CF via sendCanTx with waitAck=true. The raw writer.write approach
      // bypassed the bridge protocol's ACK mechanism.
      const sendIoctlMultiFrame = async (label: string, payload: number[]): Promise<boolean> => {
        // payload = [2D, FE, 00, 40, 01, 4F, 08, 04] (8 bytes)
        const totalLen = payload.length; // 8
        // First Frame: [10 | (len>>8), len & 0xFF, first 6 payload bytes]
        const ff = new Uint8Array(8);
        ff[0] = 0x10 | ((totalLen >> 8) & 0x0F);
        ff[1] = totalLen & 0xFF;
        for (let i = 0; i < 6 && i < payload.length; i++) ff[i + 2] = payload[i];

        // Drain any stale 0x7E8 frames before we start
        this.drainObdRxFrames();

        const ffHex = Array.from(ff).map(b=>b.toString(16).padStart(2,'0')).join(' ');
        console.log(`[DDDI-STREAM] TX ${label} FF: ${ffHex}`);
        this.emit('log', null, `[DDDI-STREAM] TX ${label} FF: ${ffHex}`);
        const ffTs = Date.now();

        // Use callback-based FC listener (proven pattern from vopStyleUdsCore)
        const fcPromise = new Promise<{ blockSize: number; stMin: number } | null>((resolve) => {
          const fcTimeout = setTimeout(() => {
            this.vopFlashUdsListener = null;
            resolve(null);
          }, 3000);

          this.vopFlashUdsListener = (arbId: number, dataU8: Uint8Array) => {
            if (arbId !== 0x7E8) return;
            if (dataU8.length === 0) return;
            const pciType = (dataU8[0] >> 4) & 0x0f;
            if (pciType === 3) {
              // Flow Control received!
              const blockSize = dataU8[1] || 0;
              const stMin = dataU8[2] || 0;
              clearTimeout(fcTimeout);
              this.vopFlashUdsListener = null;
              resolve({ blockSize, stMin });
            } else if (pciType === 0) {
              // Single frame response (could be NRC)
              const respSvc = dataU8.length > 1 ? dataU8[1] : 0;
              if (respSvc === 0x7f) {
                clearTimeout(fcTimeout);
                this.vopFlashUdsListener = null;
                resolve(null);
              }
            }
          };
        });

        const ffOk = await this.sendCanTx(0x7E0, false, ff, true);
        if (!ffOk) {
          this.vopFlashUdsListener = null;
          console.error(`[DDDI-STREAM] ${label} FF TX NACK`);
          this.emit('log', null, `[DDDI-STREAM] ${label} FF NACK from bridge`);
          return false;
        }

        const fc = await fcPromise;
        const fcTs = Date.now();
        if (!fc) {
          console.error(`[DDDI-STREAM] ${label} FC timeout — ECU did not respond to FF (${fcTs - ffTs}ms)`);
          this.emit('log', null, `[DDDI-STREAM] ${label} FC timeout after ${fcTs - ffTs}ms`);
          return false;
        }
        console.log(`[DDDI-STREAM] RX ${label} FC: BS=${fc.blockSize} STmin=${fc.stMin} (${fcTs - ffTs}ms after FF)`);
        this.emit('log', null, `[DDDI-STREAM] ${label} FC received in ${fcTs - ffTs}ms`);

        // Continuation Frame: [21, remaining payload bytes, padded with 00]
        const cf = new Uint8Array(8);
        cf[0] = 0x21; // seq=1
        for (let i = 6; i < payload.length; i++) cf[1 + (i - 6)] = payload[i];
        // rest stays 0x00 (padding)

        // Send CF via sendCanTx with waitAck=true — the PROVEN path.
        // vopStyleUdsCore.sendUdsMultiFrame does exactly this for flashing and it works.
        // Previous approach wrote directly to this.writer bypassing ACK — that failed.
        const cfHex = Array.from(cf).map(b=>b.toString(16).padStart(2,'0')).join(' ');
        console.log(`[DDDI-STREAM] TX ${label} CF: ${cfHex} (via sendCanTx with ACK)`);
        this.emit('log', null, `[DDDI-STREAM] TX ${label} CF: ${cfHex}`);
        const cfOk = await this.sendCanTx(0x7E0, false, cf, true);
        const cfTs = Date.now();
        if (!cfOk) {
          console.error(`[DDDI-STREAM] ${label} CF TX NACK (${cfTs - fcTs}ms after FC)`);
          this.emit('log', null, `[DDDI-STREAM] ${label} CF NACK from bridge`);
          return false;
        }
        console.log(`[DDDI-STREAM] ${label} CF ACK received (${cfTs - fcTs}ms after FC)`);

        // Wait for positive response (0x6D) or NRC (0x7F)
        const resp = await this.waitRxMatch(3000, (id, d) =>
          id === 0x7E8 && d.length > 1 && ((d[0] & 0xF0) === 0x00) // single frame
        );
        if (resp) {
          const respHex = Array.from(resp).map(b=>b.toString(16).padStart(2,'0')).join(' ');
          console.log(`[DDDI-STREAM] RX ${label} resp: ${respHex}`);
          // Check for positive (0x6D) or negative (0x7F)
          if (resp[1] === 0x6D) {
            this.emit('log', null, `[DDDI-STREAM] ${label} OK → 0x6D positive response`);
            return true;
          } else if (resp[1] === 0x7F) {
            const nrc = resp[3];
            console.warn(`[DDDI-STREAM] ${label} NRC=0x${nrc?.toString(16)}`);
            this.emit('log', null, `[DDDI-STREAM] ${label} NRC=0x${nrc?.toString(16)}`);
            return false;
          }
        } else {
          console.warn(`[DDDI-STREAM] ${label} response timeout (3s)`);
          this.emit('log', null, `[DDDI-STREAM] ${label} no response after 3s`);
        }
        return false;
      };

      // IOCTL FE00: 2D FE 00 40 01 4F 08 04
      const ioctl1Ok = await sendIoctlMultiFrame('IOCTL_FE00', [0x2D, 0xFE, 0x00, 0x40, 0x01, 0x4F, 0x08, 0x04]);
      await new Promise(r => setTimeout(r, 15));

      // ── Step 4: DDDI composite for FE ──
      // HPT sends: 2C FE FE 00 00 0A 00 (7 bytes)
      //   0x2C = DynamicallyDefineDataIdentifier
      //   FE = subfunction (clearAndDefine for periodic ID 0xFE)
      //   FE 00 = source parameter ID
      //   00 = position in record
      //   0A = size of data (10 bytes? includes padding)
      //   00 = padding/reserved
      const dddi1 = [0x2C, 0xFE, 0xFE, 0x00, 0x00, 0x0A, 0x00];
      console.log(`[DDDI-STREAM] TX DDDI FE: ${hex(dddi1)}`);
      this.emit('log', null, `[DDDI-STREAM] TX DDDI FE: ${hex(dddi1)}`);
      const dddi1Resp = await this.isoTpRequest(dddi1, 2000);
      logResp('DDDI FE', dddi1Resp);
      if (dddi1Resp && dddi1Resp[0] === 0x7F) {
        console.warn(`[DDDI-STREAM] DDDI FE NRC=0x${dddi1Resp[2]?.toString(16)} — continuing`);
      } else if (dddi1Resp && dddi1Resp[0] === 0x6C) {
        this.emit('log', null, '[DDDI-STREAM] DDDI FE OK → 0x6C');
      }
      await new Promise(r => setTimeout(r, 10));

      // ── Step 5: IOCTL define FE01 — FRP_DES (RAM 0x400225D8, 4 bytes) ──
      // HPT sends: 2D FE 01 40 02 25 D8 04 (8 bytes, multi-frame ISO-TP)
      // Using same raw CAN multi-frame approach as IOCTL FE00
      const ioctl2Ok = await sendIoctlMultiFrame('IOCTL_FE01', [0x2D, 0xFE, 0x01, 0x40, 0x02, 0x25, 0xD8, 0x04]);
      await new Promise(r => setTimeout(r, 15));

      // ── Step 6: DDDI composite for FD ──
      // HPT sends: 2C FD FE 01 00 00 00 (7 bytes)
      //   0x2C = DynamicallyDefineDataIdentifier
      //   FD = subfunction (clearAndDefine for periodic ID 0xFD)
      //   FE 01 = source parameter ID
      //   00 00 00 = position/size/reserved
      const dddi2 = [0x2C, 0xFD, 0xFE, 0x01, 0x00, 0x00, 0x00];
      console.log(`[DDDI-STREAM] TX DDDI FD: ${hex(dddi2)}`);
      this.emit('log', null, `[DDDI-STREAM] TX DDDI FD: ${hex(dddi2)}`);
      const dddi2Resp = await this.isoTpRequest(dddi2, 2000);
      logResp('DDDI FD', dddi2Resp);
      if (dddi2Resp && dddi2Resp[0] === 0x7F) {
        console.warn(`[DDDI-STREAM] DDDI FD NRC=0x${dddi2Resp[2]?.toString(16)} — continuing`);
      } else if (dddi2Resp && dddi2Resp[0] === 0x6C) {
        this.emit('log', null, '[DDDI-STREAM] DDDI FD OK → 0x6C');
      }
      await new Promise(r => setTimeout(r, 15));

      // ── Step 7: Start periodic for FE + FD at fast rate ──
      // HPT sends: AA 04 FE FD
      //   0xAA = ReadDataByPeriodicIdentifier
      //   0x04 = fast rate (~12.5ms)
      //   FE, FD = periodic IDs to start
      const startCmd = [0xAA, 0x04, 0xFE, 0xFD];
      console.log(`[DDDI-STREAM] TX AA start: ${hex(startCmd)}`);
      this.emit('log', null, `[DDDI-STREAM] TX AA start: ${hex(startCmd)}`);
      const startResp = await this.isoTpRequest(startCmd, 2000);
      logResp('AA start', startResp);
      if (startResp && startResp[0] === 0x7F) {
        const nrc = startResp[2];
        console.warn(`[DDDI-STREAM] AA start NRC=0x${nrc?.toString(16)} — will check for frames anyway`);
        this.emit('log', null, `[DDDI-STREAM] AA start NRC=0x${nrc?.toString(16)} — checking for frames…`);
      } else if (startResp) {
        this.emit('log', null, `[DDDI-STREAM] AA start resp: ${hex(startResp)}`);
      } else {
        this.emit('log', null, '[DDDI-STREAM] AA start: no response (may still work)');
      }

      // Step 4: Subscribe to 0x5E8 periodic frames via CAN monitor
      // Log EVERY frame for the first 50 frames, then summary every 2 seconds
      this.dddiPeriodicActive = true;
      console.log('[DDDI-STREAM] Subscribing to 0x5E8 periodic frames…');
      this.dddiPeriodicUnsub = this.subscribeCanMonitor((arbId, _flags, data) => {
        // Log ALL frames near 0x5E8 range for debugging (0x5E0-0x5EF)
        if (arbId >= 0x5E0 && arbId <= 0x5EF) {
          this.dddiPeriodicFrameCount++;
          const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
          // Log every frame for first 50, then every 2 seconds
          if (this.dddiPeriodicFrameCount <= 50 || (Date.now() - this.dddiPeriodicLastLogTime > 2000)) {
            console.log(`[DDDI-RX] #${this.dddiPeriodicFrameCount} arbId=0x${arbId.toString(16)} len=${data.length} data=[${hex}]`);
            this.dddiPeriodicLastLogTime = Date.now();
          }
        }

        if (arbId !== DDDI_PERIODIC_RX_ID || data.length < 2) return;
        const periodicId = data[0];
        const now = Date.now();
        const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');

        if (periodicId === 0xFE && data.length >= 8) {
          // ============================================================
          // FE frame byte layout (BUSMASTER + A2L verified):
          //   [0]=0xFE  [1..4]=FRP_ACT (FLOAT32 BE, MPa)  [5]=FP_SAE (byte × 0.4356)  [6..7]=00
          //
          // A2L: VeFHPR_p_FuelRail at RAM 0x40014F08 = FLOAT32_IEEE, CM_T_p_MPa
          //   DDDI reads raw RAM → bytes are IEEE 754 float, big-endian, value in MPa
          //   Convert: MPa × 145.038 = PSI
          //
          // Verified: FE 42 02 34 00 89 00 00 → float32 = 32.5508 MPa = 4721.1 PSI (HPT exact match)
          // FP_SAE: byte[5] × 0.4356 = PSI (e.g. 0x89=137 × 0.4356 = 59.7 PSI, HPT shows 59.6)
          // ============================================================

          // --- Parse FRP_ACT as IEEE 754 FLOAT32 big-endian (bytes 1-4) ---
          const frpBuf = new DataView(new Uint8Array([data[1], data[2], data[3], data[4]]).buffer);
          const frpMpa = frpBuf.getFloat32(0, false); // false = big-endian
          const frpPsi = frpMpa * DDDI_FE_MPA_TO_PSI;

          // --- Parse FP_SAE as single byte (byte 5) × 0.4356 ---
          // BUSMASTER verified: byte 5 of FE frame × 0.4356 matches HPT FP_SAE exactly
          // e.g. 0x89=137 × 0.4356 = 59.7 PSI (HPT shows 59.6)
          const fpSaeRaw = data[5];
          const fpSaePsi = fpSaeRaw * DDDI_FE_FP_SAE_SCALE;

          // --- Heavy debug logging (first 50 frames, then every 2s) ---
          if (this.dddiPeriodicFrameCount <= 50 || (Date.now() - this.dddiPeriodicLastLogTime > 2000)) {
            console.log(`[DDDI-FE] raw=[${hex}] ts=${now}`);
            console.log(`[DDDI-FE]   FLOAT32_BE(bytes[1:4]) = ${frpMpa.toFixed(4)} MPa = ${frpPsi.toFixed(1)} PSI`);
            console.log(`[DDDI-FE]   FP_SAE byte[5] = 0x${data[5].toString(16).padStart(2,'0')}=${fpSaeRaw} × 0.4356 = ${fpSaePsi.toFixed(1)} PSI`);
            // Also log legacy byte combos for cross-reference during truck test
            const b67_LE = (data[7] << 8) | data[6];
            const b67_BE = (data[6] << 8) | data[7];
            console.log(`[DDDI-FE]   (legacy) b67_LE=${b67_LE} ×0.1338=${(b67_LE*0.1338).toFixed(1)} | b67_BE=${b67_BE} ×0.4712=${(b67_BE*0.4712).toFixed(1)}`);
            console.log(`[DDDI-FE]   byte[7]=0x${data[7].toString(16).padStart(2,'0')} — unknown/padding`);
          }

          // Store FRP_ACT (FLOAT32 MPa → PSI)
          this.dddiPeriodicValues.set('FRP_ACT', {
            pid: 0x328A,
            name: 'Fuel Rail Pressure Actual',
            shortName: 'FRP_ACT',
            value: Math.round(frpPsi * 100) / 100,
            unit: 'PSI',
            rawBytes: [data[1], data[2], data[3], data[4]],
            timestamp: now,
          });

          // Store FP_SAE (byte[5] × 0.4356)
          this.dddiPeriodicValues.set('FP_SAE', {
            pid: 0x208A,
            name: 'Fuel Pressure SAE (Low Feed)',
            shortName: 'FP_SAE',
            value: Math.round(fpSaePsi * 100) / 100,
            unit: 'PSI',
            rawBytes: [data[5]],
            timestamp: now,
          });
        }

        if (periodicId === 0xFD && data.length >= 5) {
          // FD frame = FRP Desired (FLOAT32 BE, MPa)
          // BUSMASTER verified: bytes[1:4] = IEEE 754 float, same as FE frame
          const desBuf = new DataView(new Uint8Array([data[1], data[2], data[3], data[4]]).buffer);
          const desMpa = desBuf.getFloat32(0, false);
          const desPsi = desMpa * DDDI_FE_MPA_TO_PSI;

          if (this.dddiPeriodicFrameCount <= 50 || (Date.now() - this.dddiPeriodicLastLogTime > 2000)) {
            console.log(`[DDDI-FD] raw=[${hex}] FLOAT32_BE = ${desMpa.toFixed(4)} MPa = ${desPsi.toFixed(1)} PSI`);
          }

          // Store FRP_DES
          this.dddiPeriodicValues.set('FRP_DES', {
            pid: 0x30BC,
            name: 'Fuel Rail Pressure Desired',
            shortName: 'FRP_DES',
            value: Math.round(desPsi * 100) / 100,
            unit: 'PSI',
            rawBytes: [data[1], data[2], data[3], data[4]],
            timestamp: now,
          });
        }
      });

      // Check after 2 seconds: if no 0x5E8 frames arrived, DEACTIVATE periodic
      // so FRP_ACT/FP_SAE fall through to normal Mode 22 polling.
      setTimeout(() => {
        if (this.dddiPeriodicFrameCount === 0 && this.dddiPeriodicActive) {
          console.warn('[DDDI-STREAM] ⚠️ NO 0x5E8 frames after 2s — DEACTIVATING periodic, falling back to Mode 22');
          this.emit('log', null, '[DDDI-STREAM] No periodic frames — falling back to Mode 22 for FRP/FP_SAE');
          // CRITICAL: Set dddiPeriodicActive = false so readPid() stops trying
          // the dead periodic stream and uses Mode 22 instead.
          this.dddiPeriodicActive = false;
          // Clean up the CAN monitor subscription
          if (this.dddiPeriodicUnsub) {
            this.dddiPeriodicUnsub();
            this.dddiPeriodicUnsub = null;
          }
          this.dddiPeriodicValues.clear();
        } else if (this.dddiPeriodicActive) {
          console.log(`[DDDI-STREAM] ✓ Received ${this.dddiPeriodicFrameCount} periodic frames in first 2 seconds`);
          this.emit('log', null, `[DDDI-STREAM] Periodic streaming confirmed: ${this.dddiPeriodicFrameCount} frames/2s`);
        }
      }, 2000);

      this.emit('log', null, '[DDDI-STREAM] Setup complete — listening for 0x5E8 periodic frames');
      return true;
    } catch (e) {
      this.emit('log', null, `[DDDI-STREAM] Setup FAILED: ${e}`);
      console.error('[DDDI-STREAM] Setup exception:', e);
      return false;
    }
  }

  /** Stop DDDI periodic streaming and clean up. */
  private async stopDddiPeriodicStreaming(): Promise<void> {
    if (this.dddiPeriodicUnsub) {
      this.dddiPeriodicUnsub();
      this.dddiPeriodicUnsub = null;
    }
    this.dddiPeriodicActive = false;
    this.dddiPeriodicValues.clear();
    // Tell ECU to stop periodic reads
    try {
      await this.isoTpRequest([0xAA, 0x04, 0x00], 500);
    } catch { /* ignore */ }
  }

  /**
   * Get the latest DDDI periodic reading for a given shortName.
   * Returns null if no periodic data available or data is stale (>500ms).
   */
  getDddiPeriodicReading(shortName: string): PIDReading | null {
    const reading = this.dddiPeriodicValues.get(shortName);
    if (!reading) return null;
    // Stale check: periodic frames come every ~25ms, so 500ms means 20 missed frames
    if (Date.now() - reading.timestamp > 500) return null;
    return reading;
  }

  // ───────────────────────────────────────────────────────────────────────────────
  // T87A TCM DDDI Streaming (0x5EA periodic broadcast, Service 0x2D)
  // Confirmed from HP Tuners BusMaster capture on 2019 L5P Duramax (Allison 1000 6-speed)
  // ───────────────────────────────────────────────────────────────────────────────

  /**
   * Start T87A TCM DDDI streaming via Service 0x2D (RAM address reads).
   *
   * The T87A TCM (Allison 1000 6-speed, 2017-2019 L5P Duramax) responds to
   * Service 0x2D DDDI setup by broadcasting 0x5EA frames at ~40Hz.
   *
   * DDDI channel mapping (confirmed from HP Tuners BusMaster capture 4/29/26):
   *   FE00 → RAM 0x40014682 — TCC Desired Pressure (2 bytes, ×0.018 = PSI)
   *   FE01 → RAM 0x40014DB4 — TCC Slip Speed (2 bytes, signed offset 32768, ×0.125 = rpm)
   *   FE02 → RAM 0x400143C2 — Turbine RPM (2 bytes — formula TBD, pending truck verification)
   *   FE03 → RAM 0x40014CC0 — Trans Fluid Temp (2 bytes — formula TBD, pending truck verification)
   *
   * 0x5EA frame decode (FE sub-frame, confirmed):
   *   [FE][b1][b2][b3][b4][b5][b6][b7]
   *   TCC Desired Pressure: (b1<<8|b2) × 0.018 = PSI
   *   TCC Slip Speed:       ((b3<<8|b4) - 32768) × 0.125 = rpm (signed offset)
   *
   * @returns true if streaming started successfully, false if TCM not present
   */
  async startTcmDddiStreaming(): Promise<boolean> {
    if (this.tcmDddiActive) return true;
    this.tcmDddiFrameCount = 0;
    this.tcmDddiLastLogTime = 0;

    const savedTxId = this.obdTxId;
    const savedRxId = this.obdRxId;
    const TCM_TX_ID = 0x7E2;
    const TCM_RX_ID = 0x7EA;
    const TCM_BROADCAST_ID = 0x5EA;

    try {
      // Switch ISO-TP to TCM address
      this.obdTxId = TCM_TX_ID;
      this.obdRxId = TCM_RX_ID;

      this.emit('log', null, '[TCM-DDDI] Starting T87A TCM DDDI streaming setup (0x7E2→0x7EA)...');

      // Step 1: Extended diagnostic session on TCM
      const sessResp = await this.isoTpRequest([0x10, 0x03], 3000);
      if (!sessResp || sessResp[0] !== 0x50) {
        this.emit('log', null, `[TCM-DDDI] Extended session failed: ${sessResp ? sessResp.map(b => b.toString(16)).join(' ') : 'no response'}`);
        this.obdTxId = savedTxId;
        this.obdRxId = savedRxId;
        return false;
      }
      this.emit('log', null, '[TCM-DDDI] Extended session OK');

      // Step 2: TesterPresent keepalive for TCM
      await this.isoTpRequest([0x3E, 0x00], 500);

      // Step 3: Define DDDI FE00 → RAM 0x40014682 (TCC Desired Pressure, 2 bytes)
      // Service 0x2D: [2D FE 00 03 40 01 46 82 02]
      // 03 = memory address type (4-byte addr, 1-byte length)
      const dddi0Resp = await this.isoTpRequest([0x2D, 0xFE, 0x00, 0x03, 0x40, 0x01, 0x46, 0x82, 0x02], 2000);
      if (!dddi0Resp || dddi0Resp[0] !== 0x6D) {
        this.emit('log', null, `[TCM-DDDI] DDDI FE00 define failed: ${dddi0Resp ? dddi0Resp.map(b => b.toString(16)).join(' ') : 'no response'}`);
        this.obdTxId = savedTxId;
        this.obdRxId = savedRxId;
        return false;
      }
      this.emit('log', null, '[TCM-DDDI] DDDI FE00 (TCC Desired Pressure) defined OK');

      // Step 4: Define DDDI FE01 → RAM 0x40014DB4 (TCC Slip Speed, 2 bytes)
      const dddi1Resp = await this.isoTpRequest([0x2D, 0xFE, 0x01, 0x03, 0x40, 0x01, 0x4D, 0xB4, 0x02], 2000);
      if (!dddi1Resp || dddi1Resp[0] !== 0x6D) {
        this.emit('log', null, `[TCM-DDDI] DDDI FE01 define failed: ${dddi1Resp ? dddi1Resp.map(b => b.toString(16)).join(' ') : 'no response'}`);
        // Non-fatal: continue with FE00 only
        this.emit('log', null, '[TCM-DDDI] Continuing with FE00 only');
      } else {
        this.emit('log', null, '[TCM-DDDI] DDDI FE01 (TCC Slip Speed) defined OK');
      }

      // Step 5: Define DDDI FE02 → RAM 0x400143C2 (Turbine RPM, 2 bytes)
      const dddi2Resp = await this.isoTpRequest([0x2D, 0xFE, 0x02, 0x03, 0x40, 0x01, 0x43, 0xC2, 0x02], 2000);
      if (dddi2Resp && dddi2Resp[0] === 0x6D) {
        this.emit('log', null, '[TCM-DDDI] DDDI FE02 (Turbine RPM) defined OK');
      } else {
        this.emit('log', null, '[TCM-DDDI] DDDI FE02 (Turbine RPM) not supported — skipping');
      }

      // Step 6: Define DDDI FE03 → RAM 0x40014CC0 (Trans Fluid Temp, 2 bytes)
      const dddi3Resp = await this.isoTpRequest([0x2D, 0xFE, 0x03, 0x03, 0x40, 0x01, 0x4C, 0xC0, 0x02], 2000);
      if (dddi3Resp && dddi3Resp[0] === 0x6D) {
        this.emit('log', null, '[TCM-DDDI] DDDI FE03 (Trans Fluid Temp) defined OK');
      } else {
        this.emit('log', null, '[TCM-DDDI] DDDI FE03 (Trans Fluid Temp) not supported — skipping');
      }

      // Step 7: Start periodic transmission of all defined DDDIs
      // [AA 03 00] = start periodic reads (same pattern as E41 ECM)
      const startResp = await this.isoTpRequest([0xAA, 0x03, 0x00], 2000);
      if (!startResp || startResp[0] !== 0xEA) {
        // Some TCM firmware versions respond with 0x6A or 0xEA — accept both
        if (!startResp || (startResp[0] !== 0x6A && startResp[0] !== 0xEA)) {
          this.emit('log', null, `[TCM-DDDI] Start periodic failed: ${startResp ? startResp.map(b => b.toString(16)).join(' ') : 'no response'}`);
          this.obdTxId = savedTxId;
          this.obdRxId = savedRxId;
          return false;
        }
      }
      this.emit('log', null, '[TCM-DDDI] Periodic streaming started — listening for 0x5EA frames...');

      // Step 8: Subscribe to 0x5EA broadcast frames
      this.tcmDddiUnsub = this.subscribeCanMonitor((arbId, _flags, data) => {
        if (arbId !== TCM_BROADCAST_ID || data.length < 2) return;
        this.tcmDddiFrameCount++;
        const subFrame = data[0];
        const now = Date.now();

        if (this.tcmDddiFrameCount <= 50 || (now - this.tcmDddiLastLogTime > 2000)) {
          const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`[TCM-DDDI-RX] #${this.tcmDddiFrameCount} sub=0x${subFrame.toString(16)} data=[${hex}]`);
          this.tcmDddiLastLogTime = now;
        }

        if (subFrame === 0xFE && data.length >= 5) {
          // FE sub-frame: TCC Desired Pressure (b1:b2) + TCC Slip Speed (b3:b4)
          // Confirmed: (b1<<8|b2) × 0.018 = PSI, ((b3<<8|b4) - 32768) × 0.125 = rpm
          const rawPressure = (data[1] << 8) | data[2];
          const tccPressure = rawPressure * 0.018;
          this.tcmDddiValues.set('TCCP_DDDI', {
            pid: 0xDE00, name: 'TCC Desired Pressure (DDDI)', shortName: 'TCCP_DDDI',
            value: Math.round(tccPressure * 10) / 10, unit: 'PSI',
            rawBytes: [data[1], data[2]], timestamp: now,
          });

          if (data.length >= 5) {
            const rawSlip = (data[3] << 8) | data[4];
            const tccSlip = (rawSlip - 32768) * 0.125;
            this.tcmDddiValues.set('TCCS_DDDI', {
              pid: 0xDE01, name: 'TCC Slip Speed (DDDI)', shortName: 'TCCS_DDDI',
              value: Math.round(tccSlip * 10) / 10, unit: 'rpm',
              rawBytes: [data[3], data[4]], timestamp: now,
            });
          }
        } else if (subFrame === 0xFD && data.length >= 5) {
          // FD sub-frame: Turbine RPM (b1:b2) + Trans Fluid Temp (b3:b4)
          // Formula TBD — pending truck verification of RAM addresses
          // Using placeholder scaling until confirmed on truck
          const rawTurbine = (data[1] << 8) | data[2];
          // Tentative: same 0.125 scaling as turbine speed channels on similar TCMs
          const turbineRpm = rawTurbine * 0.125;
          this.tcmDddiValues.set('TURB_RPM_DDDI', {
            pid: 0xDE02, name: 'Turbine RPM (DDDI)', shortName: 'TURB_RPM_DDDI',
            value: Math.round(turbineRpm), unit: 'rpm',
            rawBytes: [data[1], data[2]], timestamp: now,
          });

          if (data.length >= 5) {
            const rawTemp = (data[3] << 8) | data[4];
            // Tentative: linear scaling TBD — raw value logged for calibration
            this.tcmDddiValues.set('TFT_DDDI', {
              pid: 0xDE03, name: 'Trans Fluid Temp (DDDI)', shortName: 'TFT_DDDI',
              value: rawTemp, unit: 'raw',
              rawBytes: [data[3], data[4]], timestamp: now,
            });
          }
        }
      });

      // Step 9: Verify frames arrive within 2 seconds
      await new Promise<void>(resolve => setTimeout(resolve, 2000));
      if (this.tcmDddiFrameCount === 0) {
        this.emit('log', null, '[TCM-DDDI] No 0x5EA frames received in 2s — TCM DDDI not active');
        if (this.tcmDddiUnsub) { this.tcmDddiUnsub(); this.tcmDddiUnsub = null; }
        this.obdTxId = savedTxId;
        this.obdRxId = savedRxId;
        return false;
      }

      this.tcmDddiActive = true;
      this.emit('log', null, `[TCM-DDDI] ✓ Streaming confirmed: ${this.tcmDddiFrameCount} frames in 2s`);
      this.obdTxId = savedTxId;
      this.obdRxId = savedRxId;
      return true;

    } catch (err) {
      this.emit('log', null, `[TCM-DDDI] Setup error: ${err}`);
      this.obdTxId = savedTxId;
      this.obdRxId = savedRxId;
      return false;
    }
  }

  /** Stop T87A TCM DDDI streaming and clean up. */
  private async stopTcmDddiStreaming(): Promise<void> {
    if (this.tcmDddiUnsub) {
      this.tcmDddiUnsub();
      this.tcmDddiUnsub = null;
    }
    this.tcmDddiActive = false;
    this.tcmDddiValues.clear();
    // Tell TCM to stop periodic reads
    const savedTxId = this.obdTxId;
    const savedRxId = this.obdRxId;
    try {
      this.obdTxId = 0x7E2;
      this.obdRxId = 0x7EA;
      await this.isoTpRequest([0xAA, 0x04, 0x00], 500);
    } catch { /* ignore */ } finally {
      this.obdTxId = savedTxId;
      this.obdRxId = savedRxId;
    }
  }

  /**
   * Get the latest T87A TCM DDDI reading for a given shortName.
   * Returns null if no TCM DDDI data available or data is stale (>500ms).
   */
  getTcmDddiReading(shortName: string): PIDReading | null {
    const reading = this.tcmDddiValues.get(shortName);
    if (!reading) return null;
    // Stale check: 0x5EA frames come at ~40Hz, so 500ms = 20 missed frames
    if (Date.now() - reading.timestamp > 500) return null;
    return reading;
  }

  async scanSupportedDIDs(options?: {
    includeStandard?: boolean;
    includeExtended?: boolean;
    onProgress?: (current: number, total: number, pid: PIDDefinition, supported: boolean) => void;
    abortSignal?: AbortSignal;
  }): Promise<DIDScanReport> {
    const incS = options?.includeStandard ?? true;
    const incE = options?.includeExtended ?? true;
    const t0 = Date.now();
    const standardSupported: ScanResult[] = [];
    const extendedSupported: ScanResult[] = [];
    const standardUnsupported: ScanResult[] = [];
    const extendedUnsupported: ScanResult[] = [];

    const all: PIDDefinition[] = [];
    if (incS) {
      all.push(...STANDARD_PIDS.filter(p => p.pid > 0x00 && p.pid !== 0x20 && p.pid !== 0x40 && p.pid !== 0x60));
    }
    if (incE) {
      // Sort extended PIDs by ecuHeader to minimize TX/RX address switches during scan
      const extPids = getPidsForVehicle(
        this.vehicleInfo.manufacturer || 'universal',
        this.vehicleInfo.fuelType || 'any'
      ).filter(p => (p.service || 0x01) === 0x22)
       .sort((a, b) => (a.ecuHeader ?? '7DF').localeCompare(b.ecuHeader ?? '7DF'));
      all.push(...extPids);
    }
    let cur = 0;
    const tot = all.length;
    for (const pid of all) {
      if (options?.abortSignal?.aborted) break;
      cur++;
      const reading = await this.readPid(pid);
      const isExt = (pid.service || 0x01) === 0x22;
      if (reading) {
        const r: ScanResult = { pid, supported: true, sampleValue: reading.value };
        if (isExt) extendedSupported.push(r);
        else standardSupported.push(r);
        this.supportedPids.add(pid.pid);
      } else {
        const r: ScanResult = { pid, supported: false };
        if (isExt) extendedUnsupported.push(r);
        else standardUnsupported.push(r);
      }
      options?.onProgress?.(cur, tot, pid, !!reading);
    }

    const duration = Date.now() - t0;
    const autoPreset = buildPersistedScanAutoPreset(
      this.vehicleInfo,
      standardSupported,
      extendedSupported,
    );
    if (autoPreset) {
      this.emit(
        'log',
        null,
        `Auto-generated preset "${autoPreset.name}" with ${autoPreset.pids.length} PIDs saved.`,
      );
    }

    return {
      timestamp: t0,
      duration,
      vehicleInfo: this.vehicleInfo,
      standardSupported,
      extendedSupported,
      standardUnsupported,
      extendedUnsupported,
      totalScanned: cur,
      totalSupported: standardSupported.length + extendedSupported.length,
      autoPreset,
    };
  }

  getSupportedPids(): Set<number> {
    return new Set(this.supportedPids);
  }

  getVehicleInfo(): VehicleInfo {
    return { ...this.vehicleInfo };
  }

  getAvailablePids(): PIDDefinition[] {
    return STANDARD_PIDS.filter(p => this.supportedPids.has(p.pid));
  }

  getAvailableExtendedPids(): PIDDefinition[] {
    return getPidsForVehicle(
      this.vehicleInfo.manufacturer || 'universal',
      this.vehicleInfo.fuelType || 'any'
    ).filter(p => (p.service || 0x01) === 0x22);
  }

  getAllAvailablePids(): PIDDefinition[] {
    return [...this.getAvailablePids(), ...this.getAvailableExtendedPids()];
  }

  filterSupportedPids(pids: PIDDefinition[]): { supported: PIDDefinition[]; unsupported: PIDDefinition[] } {
    const supported: PIDDefinition[] = [];
    const unsupported: PIDDefinition[] = [];
    for (const p of pids) {
      if (p.service === 0x22 || this.supportedPids.has(p.pid)) supported.push(p);
      else unsupported.push(p);
    }
    return { supported, unsupported };
  }

  // ── Flash bridge (same UDS/ISO-TP behaviour as PCAN WebSocket `can_send` path) ──

  isFlashTransportOpen(): boolean {
    return this.writer !== null && this.port !== null && this.readActive;
  }

  /**
   * Fire-and-forget CAN TX (flash keepalive / GMLAN UUDT). Matches {@link FlashBridgeConnection.sendRawCanFrame}:
   * do **not** wait for a USB ACK — the bridge still transmits; ACK-wait would stack delays (~800ms+ each)
   * when the host fires many frames quickly (SESSION_OPEN + 500ms TesterPresent).
   */
  async sendRawCanFrame(arbId: number, data: number[]): Promise<void> {
    if (!this.writer) throw new Error('USB CAN bridge not connected');
    const frame = new Uint8Array(8);
    for (let i = 0; i < 8; i++) frame[i] = data[i] ?? 0;
    const ok = await this.sendCanTx(arbId, false, frame, false);
    if (!ok) throw new Error('CAN TX rejected by USB bridge');
  }

  async reconnectForFlash(): Promise<boolean> {
    if (this.isFlashTransportOpen()) return true;
    if (!VopCan2UsbConnection.isSupported()) return false;
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length === 0) return false;
      this.port = ports[0];
      await this.port.open({ baudRate: this.baudRate });
      this.writer = this.port.writable!.getWriter();
      this.reader = this.port.readable!.getReader();
      this.rxBuf = new Uint8Array(0);
      this.rxFrames.length = 0;
      this.ackWaiters.length = 0;
      this.readActive = true;
      void this.pumpReader();
      await new Promise(r => setTimeout(r, CAN_USB_SERIAL_BRIDGE_SETTLE_MS));
      await this.readBridgeDeviceIdentityIfSupported();
      this.setState('ready');
      return true;
    } catch {
      await this.cleanupPort();
      return false;
    }
  }

  /** Stops UDS listeners and rejects the active {@link sendUDSRequest} wait (emergency user abort). */
  cancelInFlightDiagnostics(): void {
    this.udsLayer.cancelInFlightDiagnostics();
  }

  async setUDSSession(sessionType: 'default' | 'programming' | 'extended'): Promise<boolean> {
    const sessionMap = { default: 0x01, programming: 0x02, extended: 0x03 };
    try {
      const response = await this.sendUDSRequest(0x10, sessionMap[sessionType]);
      return response?.positiveResponse || false;
    } catch {
      return false;
    }
  }

  async sendUDSRequest(
    service: number,
    subFunction?: number,
    data?: number[],
    targetAddress = 0x7e0,
    timeoutMs = 5000,
    responseArbIdOverride?: number,
  ): Promise<UDSResponse | null> {
    if (!this.writer) throw new Error('USB CAN bridge not connected');
    return this.udsLayer.sendUDSRequest(
      service,
      subFunction,
      data,
      targetAddress,
      timeoutMs,
      responseArbIdOverride,
    );
  }

  private async cleanupPort(): Promise<void> {
    this.readActive = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      this.reader?.releaseLock();
    } catch {
      /* ignore */
    }
    this.reader = null;
    try {
      await this.writer?.close();
    } catch {
      /* ignore */
    }
    this.writer = null;
    try {
      await this.port?.close();
    } catch {
      /* ignore */
    }
    this.port = null;
    for (const w of this.ackWaiters) w.resolve(false);
    this.ackWaiters.length = 0;
    if (this.vopUdsInFlightReject) {
      const r = this.vopUdsInFlightReject;
      this.vopUdsInFlightReject = null;
      r(new Error('Disconnected'));
    }
  }

  async disconnect(): Promise<void> {
    this.loggingActive = false;
    await this.cleanupPort();
    this.supportedPids.clear();
    this.vehicleInfo = {};
    this.currentSession = null;
    this.setState('disconnected');
    this.emit('log', null, 'Disconnected');
  }
}

let sharedVopInstance: VopCan2UsbConnection | null = null;

/**
 * Single Web Serial owner for the V-OP bridge. Multiple tabs/panels must not each `new` + `open()`
 * the same COM port — Chrome throws "The port is already open".
 */
export function getSharedVopCan2UsbConnection(config?: VopCan2UsbConnectionConfig): VopCan2UsbConnection {
  if (!sharedVopInstance) {
    sharedVopInstance = new VopCan2UsbConnection(config);
  }
  return sharedVopInstance;
}
