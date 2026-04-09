/**
 * V-OP Can2USB — Web Serial transport for **@Firmware** (`fimware-v3.0`) USB↔CAN bridge.
 *
 * Wire format matches:
 * - `fimware-v3.0/main/USBCanBridge/USBCanBridge.c`
 * - `fimware-v3.0/host_tools/can_usb_bridge_cli.py` / `can_usb_bridge_gui.py`
 *
 * **Binary frame (little-endian CAN id, CRC over type..data):**
 * `55 AA | type | flags | can_id u32 | dlc | data[0..dlc] | crc16`
 *
 * - `type`: CAN_TX=0x01, CAN_RX=0x02, CMD=0x10, ACK=0x11, NACK=0x12
 * - `flags`: bit0=EXT, bit1=RTR
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
} from './obdConnection';
import { decodeVinNhtsa } from './universalVinDecoder';
import { type UDSResponse, parseIsoTpDataToUdsResponse, parseUdsDiagnosticPayload } from './pcanConnection';
import type { FlashBridgeConnection } from './flashBridgeConnection';
import {
  CAN_ISO_TP_DEFAULT_TIMEOUT_MS,
  CAN_LIVE_OBD_MODE01_TIMEOUT_MS,
  CAN_LIVE_UDS_DID_TIMEOUT_MS,
  CAN_USB_BRIDGE_ACK_TIMEOUT_MS,
} from './canTransportTiming';

type EventCallback = (event: ConnectionEvent) => void;

const MAGIC0 = 0x55;
const MAGIC1 = 0xaa;

const TYPE_CAN_TX = 0x01;
const TYPE_CAN_RX = 0x02;
const TYPE_CMD = 0x10;
const TYPE_ACK = 0x11;
const TYPE_NACK = 0x12;

const FLAG_EXTD = 1 << 0;
const FLAG_RTR = 1 << 1;

/** Default addresses for physical OBD on ISO 15765 (GM / many ECUs). */
const OBD_TX_ID = 0x7e0;
const OBD_RX_ID = 0x7e8;


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

  private ackWaiters: Array<{ resolve: (ok: boolean) => void }> = [];
  private rxFrames: Array<{ id: number; data: Uint8Array }> = [];

  constructor(config: VopCan2UsbConnectionConfig = {}) {
    this.baudRate = config.baudRate ?? 115200;
    this.filters = config.filters;
    this.obdTxId = config.txId ?? OBD_TX_ID;
    this.obdRxId = config.rxId ?? OBD_RX_ID;
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
      await new Promise(r => setTimeout(r, 2));
    }
    return null;
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
      const data = await this.waitRxMatch(Math.max(5, end - Date.now()), (id, d) => id === this.obdRxId && d.length >= 1);
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
          const cf = await this.waitRxMatch(Math.max(5, end - Date.now()), (id, d) => id === this.obdRxId && d.length >= 1);
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

      await new Promise(r => setTimeout(r, 100));

      this.emit('log', null, 'Bridge ready (binary 55 AA protocol, @Firmware USBCanBridge).');

      if (options?.skipVehicleInit) {
        this.setState('ready');
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
      const vinRaw = await this.isoTpRequest([0x09, 0x02]);
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
    const bitmaskPids = [0x00, 0x20, 0x40, 0x60];
    for (const bitmaskPid of bitmaskPids) {
      try {
        const resp = await this.isoTpRequest([0x01, bitmaskPid]);
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

  async readPid(pid: PIDDefinition): Promise<PIDReading | null> {
    try {
      const service = pid.service || 0x01;
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
    intervalMs = 200,
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
    return {
      timestamp: Date.now(),
      duration: Date.now() - t0,
      vehicleInfo: this.vehicleInfo,
      standardSupported,
      extendedSupported,
      standardUnsupported,
      extendedUnsupported,
      totalScanned: cur,
      totalSupported: standardSupported.length + extendedSupported.length,
    };
  }

  getSupportedPids(): Set<number> {
    return new Set(this.supportedPids);
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

  async sendRawCanFrame(arbId: number, data: number[]): Promise<void> {
    if (!this.writer) throw new Error('USB CAN bridge not connected');
    const frame = new Uint8Array(8);
    for (let i = 0; i < 8; i++) frame[i] = data[i] ?? 0;
    const ok = await this.sendCanTx(arbId, false, frame, true);
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
      await new Promise(r => setTimeout(r, 100));
      this.setState('ready');
      return true;
    } catch {
      await this.cleanupPort();
      return false;
    }
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
  ): Promise<UDSResponse | null> {
    if (!this.writer) throw new Error('USB CAN bridge not connected');
    const udsPayload: number[] = [service];
    if (subFunction !== undefined) udsPayload.push(subFunction);
    if (data) udsPayload.push(...data);
    if (udsPayload.length > 7) {
      return this.vopSendUdsMultiFrame(service, subFunction, udsPayload, targetAddress, timeoutMs);
    }
    return this.vopSendUdsSingleFrame(service, subFunction, udsPayload, targetAddress, timeoutMs);
  }

  /** ISO-TP FF from ECU → Flow Control + consecutive frames (same as PCAN raw path). */
  private async vopReceiveIsoTpMultiFrameFromEcu(
    targetAddress: number,
    responseArbId: number,
    firstFrame: number[],
    timeoutMs: number,
  ): Promise<number[] | null> {
    const totalLen = ((firstFrame[0] & 0x0f) << 8) | firstFrame[1];
    if (totalLen < 1 || totalLen > 4095) return null;

    const out: number[] = [];
    for (let i = 2; i < 8 && out.length < totalLen; i++) {
      out.push(firstFrame[i] ?? 0);
    }
    if (out.length >= totalLen) {
      return out.slice(0, totalLen);
    }

    const deadline = Date.now() + timeoutMs;
    let expectedSeq = 1;

    const waitCf = (): Promise<number[] | null> =>
      new Promise((resolve) => {
        const t = setTimeout(() => {
          this.vopFlashUdsListener = null;
          resolve(null);
        }, Math.max(30, deadline - Date.now()));

        this.vopFlashUdsListener = (arbId, dataU8) => {
          if (arbId !== responseArbId) return;
          const fd = [...dataU8];
          if (fd.length === 0) return;
          const pci = (fd[0] >> 4) & 0x0f;
          if (pci !== 2) return;
          const seq = fd[0] & 0x0f;
          if (seq !== expectedSeq) return;
          clearTimeout(t);
          this.vopFlashUdsListener = null;
          resolve(fd);
        };
      });

    const fc = new Uint8Array([0x30, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const fcOk = await this.sendCanTx(targetAddress, false, fc, true);
    if (!fcOk) return null;

    while (out.length < totalLen) {
      if (Date.now() > deadline) return null;
      const cf = await waitCf();
      if (!cf) return null;
      for (let j = 1; j < 8 && out.length < totalLen; j++) {
        out.push(cf[j] ?? 0);
      }
      expectedSeq = (expectedSeq + 1) & 0x0f;
    }

    return out.slice(0, totalLen);
  }

  private async vopSendUdsSingleFrame(
    service: number,
    subFunction: number | undefined,
    udsPayload: number[],
    targetAddress: number,
    timeoutMs: number,
  ): Promise<UDSResponse | null> {
    const isFunctional = targetAddress === 0x7df;
    const responseArbId = isFunctional ? -1 : targetAddress + 0x08;

    const pciLength = udsPayload.length;
    const frame: number[] = [pciLength, ...udsPayload];
    while (frame.length < 8) frame.push(0x00);

    this.vopFlashUdsListener = null;
    await new Promise(r => setTimeout(r, 150));

    const responsePromise = new Promise<UDSResponse | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.vopFlashUdsListener = null;
        resolve(null);
      }, timeoutMs);

      this.vopFlashUdsListener = (arbId, dataU8) => {
        const frameData = [...dataU8];
        if (frameData.length === 0) return;

        const isMatch = isFunctional
          ? arbId >= 0x7e8 && arbId <= 0x7ef
          : arbId === responseArbId;

        if (!isMatch) return;

        const pciType = (frameData[0] >> 4) & 0x0f;

        if (pciType === 1) {
          if (responseArbId < 0) return;
          clearTimeout(timeout);
          this.vopFlashUdsListener = null;
          void (async () => {
            const assembled = await this.vopReceiveIsoTpMultiFrameFromEcu(
              targetAddress,
              responseArbId,
              frameData,
              timeoutMs,
            );
            if (!assembled || assembled.length === 0) {
              resolve(null);
              return;
            }
            resolve(parseUdsDiagnosticPayload(service, subFunction, assembled));
          })();
          return;
        }

        if (pciType !== 0) return;

        const respSvcId = frameData.length > 1 ? frameData[1] : 0;
        const expectedPositive = service + 0x40;
        const isNegative = respSvcId === 0x7f;
        const isPositiveMatch = respSvcId === expectedPositive;
        const isNegativeForUs = isNegative && frameData.length > 2 && frameData[2] === service;
        const isNegativeUnknown = isNegative && frameData.length <= 2;

        if (isPositiveMatch) {
          clearTimeout(timeout);
          this.vopFlashUdsListener = null;
          resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
        } else if (isNegativeForUs || isNegativeUnknown) {
          const nrc = frameData.length > 3 ? frameData[3] : 0;
          if (nrc === 0x78) return;
          clearTimeout(timeout);
          this.vopFlashUdsListener = null;
          resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
        }
      };
    });

    const u8 = new Uint8Array(frame.slice(0, 8));
    const ok = await this.sendCanTx(targetAddress, false, u8, true);
    if (!ok) {
      this.vopFlashUdsListener = null;
      throw new Error('CAN TX rejected by USB bridge');
    }

    const udsResult = await responsePromise;
    if (!udsResult) {
      throw new Error('Timeout waiting for CAN response');
    }
    return udsResult;
  }

  private async vopSendUdsMultiFrame(
    service: number,
    subFunction: number | undefined,
    udsPayload: number[],
    targetAddress: number,
    timeoutMs: number,
  ): Promise<UDSResponse | null> {
    if (!this.writer) throw new Error('USB CAN bridge not connected');

    const totalLength = udsPayload.length;
    const responseArbId = targetAddress + 0x08;

    this.vopFlashUdsListener = null;
    await new Promise(r => setTimeout(r, 150));

    const firstFrame: number[] = [
      0x10 | ((totalLength >> 8) & 0x0f),
      totalLength & 0xff,
      ...udsPayload.slice(0, 6),
    ];
    while (firstFrame.length < 8) firstFrame.push(0x00);

    const fcPromise = new Promise<{ blockSize: number; stMin: number } | null>((resolve) => {
      const fcTimeout = setTimeout(() => {
        this.vopFlashUdsListener = null;
        resolve(null);
      }, 5000);

      this.vopFlashUdsListener = (arbId, dataU8) => {
        if (arbId !== responseArbId) return;
        const frameData = [...dataU8];
        if (frameData.length === 0) return;
        const pciType = (frameData[0] >> 4) & 0x0f;
        if (pciType === 3) {
          const blockSize = frameData[1] || 0;
          const stMin = frameData[2] || 0;
          clearTimeout(fcTimeout);
          this.vopFlashUdsListener = null;
          resolve({ blockSize, stMin });
        } else if (pciType === 0) {
          const respSvc = frameData[1];
          if (respSvc === 0x7f) {
            clearTimeout(fcTimeout);
            this.vopFlashUdsListener = null;
            resolve(null);
          }
        }
      };
    });

    const ffOk = await this.sendCanTx(targetAddress, false, new Uint8Array(firstFrame.slice(0, 8)), true);
    if (!ffOk) {
      this.vopFlashUdsListener = null;
      throw new Error('CAN TX rejected by USB bridge');
    }

    const fc = await fcPromise;
    if (!fc) {
      throw new Error('No Flow Control received from ECU after First Frame');
    }

    let stMinMs = 0;
    if (fc.stMin <= 0x7f) {
      stMinMs = fc.stMin;
    } else if (fc.stMin >= 0xf1 && fc.stMin <= 0xf9) {
      stMinMs = 1;
    }
    stMinMs = Math.max(stMinMs, 1);

    let offset = 6;
    let seqNum = 1;
    let framesSentSinceFC = 0;

    while (offset < udsPayload.length) {
      if (fc.blockSize > 0 && framesSentSinceFC >= fc.blockSize) {
        const nextFcPromise = new Promise<boolean>((resolve) => {
          const fcTimeout = setTimeout(() => {
            this.vopFlashUdsListener = null;
            resolve(false);
          }, 5000);

          this.vopFlashUdsListener = (arbId, dataU8) => {
            if (arbId !== responseArbId) return;
            const frameData = [...dataU8];
            if (frameData.length > 0 && ((frameData[0] >> 4) & 0x0f) === 3) {
              clearTimeout(fcTimeout);
              this.vopFlashUdsListener = null;
              resolve(true);
            }
          };
        });
        const gotFC = await nextFcPromise;
        if (!gotFC) throw new Error('Flow Control timeout during consecutive frames');
        framesSentSinceFC = 0;
      }

      const chunk = udsPayload.slice(offset, offset + 7);
      const cf: number[] = [0x20 | (seqNum & 0x0f), ...chunk];
      while (cf.length < 8) cf.push(0x00);

      const cfOk = await this.sendCanTx(targetAddress, false, new Uint8Array(cf.slice(0, 8)), true);
      if (!cfOk) throw new Error('CAN TX rejected by USB bridge');

      offset += 7;
      seqNum++;
      framesSentSinceFC++;

      if (stMinMs > 0 && offset < udsPayload.length) {
        await new Promise(r => setTimeout(r, stMinMs));
      }
    }

    const mfTimeout = Math.min(Math.max(timeoutMs * 6, 30_000), 120_000);
    const responsePromise = new Promise<UDSResponse | null>((resolve) => {
      const respTimeout = setTimeout(() => {
        this.vopFlashUdsListener = null;
        resolve(null);
      }, mfTimeout);

      this.vopFlashUdsListener = (arbId, dataU8) => {
        if (arbId !== responseArbId) return;
        const frameData = [...dataU8];
        if (frameData.length === 0) return;
        const pciType = (frameData[0] >> 4) & 0x0f;

        if (pciType === 1) {
          clearTimeout(respTimeout);
          this.vopFlashUdsListener = null;
          void (async () => {
            const assembled = await this.vopReceiveIsoTpMultiFrameFromEcu(
              targetAddress,
              responseArbId,
              frameData,
              mfTimeout,
            );
            if (!assembled || assembled.length === 0) {
              resolve(null);
              return;
            }
            resolve(parseUdsDiagnosticPayload(service, subFunction, assembled));
          })();
          return;
        }

        if (pciType === 0) {
          const respSvc = frameData.length > 1 ? frameData[1] : 0;
          const expectedPositive = service + 0x40;
          const isNegativeForUs = respSvc === 0x7f && frameData.length > 2 && frameData[2] === service;
          const isPositiveMatch = respSvc === expectedPositive;

          if (isPositiveMatch) {
            clearTimeout(respTimeout);
            this.vopFlashUdsListener = null;
            resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
          } else if (isNegativeForUs) {
            const nrc = frameData.length > 3 ? frameData[3] : 0;
            if (nrc === 0x78) return;
            clearTimeout(respTimeout);
            this.vopFlashUdsListener = null;
            resolve(parseIsoTpDataToUdsResponse(service, subFunction, frameData));
          }
        }
      };
    });

    const udsResult = await responsePromise;
    if (!udsResult) {
      throw new Error('Timeout waiting for CAN response after multi-frame send');
    }
    return udsResult;
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
