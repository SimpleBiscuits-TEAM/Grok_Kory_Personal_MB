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
 * From IntelliSpy correlation:
 *   FE frame: [FE b1 b2 b3 b4 b5 b6 b7]
 *     b1    = 0x42 constant (status)
 *     b6-b7 = FRP_ACT (little-endian uint16 × 0.1338 → PSI)
 *     b5-b6 = FP_SAE  (big-endian uint16 × 0.01868 → PSI)
 *   FD frame: [FD b1 b2 b3 b4 0 0 0]
 *     b2-b3-b4 = FRP_DES candidate (needs more correlation)
 */
const DDDI_FE_FRP_SCALE = 0.1338;
const DDDI_FE_FP_SAE_SCALE = 0.01868;


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
  /** DDDI periodic streaming state. */
  private dddiPeriodicActive = false;
  private dddiPeriodicUnsub: (() => void) | null = null;
  /** Latest DDDI periodic readings keyed by shortName. */
  private dddiPeriodicValues = new Map<string, PIDReading>();

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
    if (pdu.length > 7) {
      this.emit('log', null, 'ISO-TP SF request max 7B — use shorter OBD request');
      return null;
    }

    this.drainObdRxFrames();
    if (CAN_UDS_PRE_TX_SETTLE_MS > 0) {
      await new Promise(r => setTimeout(r, CAN_UDS_PRE_TX_SETTLE_MS));
    }

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
    if (this.dddiPeriodicActive) return;
    const now = Date.now();
    const last = this.dddiClearedAt.get(this.obdTxId) ?? 0;
    if (now - last < DDDI_CLEAR_INTERVAL_MS) return;

    this.emit('log', null, 'DDDI clear: unlocking Mode 22…');
    const t0 = Date.now();

    // Phase 1: Stop any existing periodic reads
    try {
      await this.isoTpRequest([0xAA, 0x04, 0x00], 500);
    } catch { /* NRC OK — nothing may be running */ }
    await new Promise(r => setTimeout(r, 10));

    // Phase 2: Clear all DDDI periodic definitions
    let okCount = 0;
    for (const pid of DDDI_CLEAR_PERIODIC_IDS) {
      try {
        const resp = await this.isoTpRequest([0x2C, 0xFE, 0x00, pid], 300);
        if (resp) okCount++;
      } catch { /* NRC 0x31 expected for some IDs */ }
      // HPT sends these ~6ms apart
      await new Promise(r => setTimeout(r, 6));
    }

    this.dddiClearedAt.set(this.obdTxId, Date.now());
    const elapsed = Date.now() - t0;
    this.emit('log', null, `DDDI clear done: ${okCount}/${DDDI_CLEAR_PERIODIC_IDS.length} OK in ${elapsed}ms`);
  }

  /** Short names of PIDs whose live data comes from DDDI periodic streaming, not direct Mode 22. */
  private static readonly DDDI_PERIODIC_SHORTNAMES = new Set(['FRP_ACT', 'FP_SAE']);

  async readPid(pid: PIDDefinition): Promise<PIDReading | null> {
    try {
      // If this PID is served by DDDI periodic streaming, return the latest periodic value
      if (this.dddiPeriodicActive && VopCan2UsbConnection.DDDI_PERIODIC_SHORTNAMES.has(pid.shortName)) {
        return this.getDddiPeriodicReading(pid.shortName);
      }

      const service = pid.service || 0x01;

      // Ensure DDDI clear before first Mode 22 read
      if (service === 0x22) {
        await this.ensureDddiClear();
      }

      const pdu =
        service === 0x22
          ? [0x22, (pid.pid >> 8) & 0xff, pid.pid & 0xff]
          : [service, pid.pid];

      const respTimeout = service === 0x22 ? CAN_LIVE_UDS_DID_TIMEOUT_MS : CAN_LIVE_OBD_MODE01_TIMEOUT_MS;
      const resp = await this.isoTpRequest(pdu, respTimeout);
      if (!resp || resp.length < 2) return null;

      const posResp = service + 0x40;
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
    const readings: PIDReading[] = [];
    for (const p of pids) {
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
      if (p.service === 0x22) return true;
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
    this.loggingActive = true;
    this.setState('logging');

    // Start TesterPresent keepalive (HPT sends 0x3E 0x00 every ~4s)
    this.stopTesterPresent();
    this.testerPresentTimer = setInterval(async () => {
      if (!this.loggingActive) return;
      try {
        await this.isoTpRequest([0x3E, 0x00], 500);
      } catch { /* ignore — non-critical keepalive */ }
    }, TESTER_PRESENT_INTERVAL_MS);

    // Start DDDI periodic streaming for fuel pressure if any DDDI PIDs are selected
    const hasDddiPids = filteredPids.some(p => VopCan2UsbConnection.DDDI_PERIODIC_SHORTNAMES.has(p.shortName));
    if (hasDddiPids) {
      const dddiOk = await this.startDddiPeriodicStreaming();
      if (!dddiOk) {
        this.emit('log', null, 'DDDI periodic setup failed — FRP/FP_SAE will use snapshot Mode 22 reads');
      }
    }

    const fail = new Map<number, number>();
    const pause = new Map<number, number>();
    const MAXF = 8;
    const RET = 20;
    let active = [...filteredPids];
    let loop = 0;

    const logLoop = async () => {
      while (this.loggingActive) {
        const t0 = Date.now();
        loop++;
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
          const readings = await this.readPids(active);
          const got = new Set(readings.map(r => r.pid));
          for (const r of readings) {
            session.readings.get(r.pid)?.push(r);
            fail.set(r.pid, 0);
          }
          const paused: string[] = [];
          for (const p of active) {
            if (!got.has(p.pid)) {
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
   * Set up DDDI periodic streaming for fuel pressure (and later other channels).
   * Replicates the exact HPT sequence from IntelliSpy:
   *   1. 0x2D FE 00 40 01 4F  (IOCTL — configure periodic ID 0xFE)
   *   2. 0x2C FD FE 01        (DDDI define FD from FE byte 1)
   *   3. 0xAA 04 FE FD        (start periodic for FE + FD)
   * ECU then pushes frames on 0x5E8 every ~25ms.
   */
  private async startDddiPeriodicStreaming(): Promise<boolean> {
    const mfr = this.vehicleInfo?.manufacturer;
    if (mfr && NON_GM_MANUFACTURERS.has(mfr)) return false;
    if (this.dddiPeriodicActive) return true;

    this.emit('log', null, 'DDDI periodic: setting up fuel pressure streaming…');

    try {
      // Step 1: IOCTL — InputOutputControlByIdentifier (0x2D)
      // Configures periodic ID 0xFE with fuel pressure source data
      const ioctlResp = await this.isoTpRequest([0x2D, 0xFE, 0x00, 0x40, 0x01, 0x4F], 1000);
      if (!ioctlResp || ioctlResp[0] !== 0x6D) {
        this.emit('log', null, `DDDI periodic: IOCTL failed (resp=${ioctlResp ? ioctlResp.map(b => b.toString(16)).join(' ') : 'null'})`);
        return false;
      }
      this.emit('log', null, 'DDDI periodic: IOCTL OK (0x6D FE)');
      await new Promise(r => setTimeout(r, 10));

      // Step 2: DDDI define FD from FE
      const dddiResp = await this.isoTpRequest([0x2C, 0xFD, 0xFE, 0x01], 1000);
      if (!dddiResp || dddiResp[0] !== 0x6C) {
        this.emit('log', null, `DDDI periodic: define FD failed (resp=${dddiResp ? dddiResp.map(b => b.toString(16)).join(' ') : 'null'})`);
        return false;
      }
      this.emit('log', null, 'DDDI periodic: define FD OK (0x6C FD)');
      await new Promise(r => setTimeout(r, 10));

      // Step 3: Start periodic for FE + FD
      const startResp = await this.isoTpRequest([0xAA, 0x04, 0xFE, 0xFD], 1000);
      if (!startResp) {
        this.emit('log', null, 'DDDI periodic: start command no response (may still work)');
      } else {
        this.emit('log', null, `DDDI periodic: start resp=${startResp.map(b => b.toString(16)).join(' ')}`);
      }

      // Step 4: Subscribe to 0x5E8 periodic frames via CAN monitor
      this.dddiPeriodicActive = true;
      this.dddiPeriodicUnsub = this.subscribeCanMonitor((arbId, _flags, data) => {
        if (arbId !== DDDI_PERIODIC_RX_ID || data.length < 7) return;
        const periodicId = data[0];
        const now = Date.now();

        if (periodicId === 0xFE) {
          // FRP_ACT: bytes 6-7 little-endian × 0.1338
          const frpRaw = (data[7] << 8) | data[6];
          const frpPsi = frpRaw * DDDI_FE_FRP_SCALE;
          this.dddiPeriodicValues.set('FRP_ACT', {
            pid: 0x328A,
            name: 'Fuel Rail Pressure Actual',
            shortName: 'FRP_ACT',
            value: Math.round(frpPsi * 100) / 100,
            unit: 'PSI',
            rawBytes: [data[6], data[7]],
            timestamp: now,
          });

          // FP_SAE: bytes 5-6 big-endian × 0.01868
          const fpSaeRaw = (data[5] << 8) | data[6];
          const fpSaePsi = fpSaeRaw * DDDI_FE_FP_SAE_SCALE;
          this.dddiPeriodicValues.set('FP_SAE', {
            pid: 0x208A,
            name: 'Fuel Pressure SAE (Low Feed)',
            shortName: 'FP_SAE',
            value: Math.round(fpSaePsi * 100) / 100,
            unit: 'PSI',
            rawBytes: [data[5], data[6]],
            timestamp: now,
          });
        }
        // FD frames could carry FRP_DES but correlation is weak (109% CV)
        // Skip FD parsing until we have better correlation data
      });

      this.emit('log', null, 'DDDI periodic: streaming active on 0x5E8');
      return true;
    } catch (e) {
      this.emit('log', null, `DDDI periodic setup failed: ${e}`);
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
      all.push(
        ...getPidsForVehicle(
          this.vehicleInfo.manufacturer || 'universal',
          this.vehicleInfo.fuelType || 'any'
        ).filter(p => (p.service || 0x01) === 0x22)
      );
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
