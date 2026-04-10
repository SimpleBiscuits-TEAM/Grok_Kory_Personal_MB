/**
 * PCAN-USB WebSocket Bridge Connection
 * =====================================
 * 
 * Implements the same interface as OBDConnection but communicates with
 * the vehicle through a local Python WebSocket bridge (pcan_bridge.py)
 * instead of WebSerial.
 * 
 * The bridge runs locally and talks to the PCAN-USB adapter via python-can,
 * then relays raw CAN frames as JSON over WebSocket.
 * 
 * This class is a drop-in replacement for OBDConnection — the DataloggerPanel
 * can use either class and get identical PID data output.
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
  GM_EXTENDED_PIDS,
  getPidsForVehicle,
  buildPersistedScanAutoPreset,
  type FuelType,
  type PIDManufacturer,
} from './obdConnection';
import { parseOBDResponse } from 'obd-utils';
import { getMode01ProbePidOrder, getStandardPidsMatchingElmCatalog } from './obdElmCorePids';
import { decodeVinLocal, decodeVinNhtsa } from './universalVinDecoder';
import { type SupportedProtocol, ALL_PROTOCOLS, UDS_SERVICES, J1939_PGNS } from './protocolDetection';
import {
  CAN_BRIDGE_DEFAULT_REQUEST_TIMEOUT_MS,
  CAN_LIVE_OBD_MODE01_TIMEOUT_MS,
  CAN_LIVE_UDS_DID_TIMEOUT_MS,
} from './canTransportTiming';

type EventCallback = (event: ConnectionEvent) => void;

/** Swap localhost ↔ 127.0.0.1 so we can try both (Windows often prefers ::1 for "localhost"). */
function alternateLocalhostBridgeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost') {
      u.hostname = '127.0.0.1';
    } else if (u.hostname === '127.0.0.1') {
      u.hostname = 'localhost';
    } else {
      return null;
    }
    // Avoid trailing slash from URL serialization (breaks WebSocket string equality)
    return `${u.protocol}//${u.host}`;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Default bridge WebSocket URLs. Prefer 127.0.0.1 first: on some Windows setups
 * `localhost` resolves to IPv6 while the bridge listens on IPv4 only, so wss/ws
 * to "localhost" never connects and live data / PID lists do not populate.
 */
export function defaultBridgeWebSocketCandidates(
  secure = 'wss://127.0.0.1:8766',
  insecure = 'ws://127.0.0.1:8765'
): string[] {
  const out: string[] = [];
  for (const base of [secure, insecure]) {
    if (!out.includes(base)) out.push(base);
    const alt = alternateLocalhostBridgeUrl(base);
    if (alt && !out.includes(alt)) out.push(alt);
  }
  return out;
}

// ─── Bridge Protocol Types ──────────────────────────────────────────────────

interface BridgeMessage {
  type: string;
  id?: string;
  [key: string]: unknown;
}

interface BridgeOBDResponse {
  type: 'obd_response';
  id: string;
  mode: number;
  pid: number;
  data: number[];
}

interface BridgeConnected {
  type: 'connected';
  adapter: string;
  channel: string;
  bitrate: number;
  version: string;
}

interface BridgeError {
  type: 'error';
  id?: string;
  message: string;
}

/**
 * NHTSA sometimes labels HD diesels as gasoline; WMI + engine text still identify diesel.
 */
function applyPcanDieselFuelReconciliation(info: VehicleInfo): void {
  const vin = info.vin;
  if (vin && vin.length === 17) {
    const local = decodeVinLocal(vin);
    if (local.fuelType === 'diesel') {
      info.fuelType = 'diesel';
    }
  }
  const blob = `${info.engineType ?? ''} ${info.model ?? ''} ${info.make ?? ''}`.toLowerCase();
  if (/duramax|\bdiesel\b|\bl5p\b|\blml\b|\bl5d\b|\blz0\b|\blm2\b/.test(blob)) {
    info.fuelType = 'diesel';
  }
}

/**
 * Mode 0x22 catalog for PCAN: must not rely on `universal` alone (no extended PIDs) or on a
 * single wrong fuel filter that drops all GM diesel DIDs.
 */
function extendedMode22PidsForPcanVehicle(info: VehicleInfo): PIDDefinition[] {
  const vin = info.vin;
  let mfr: PIDManufacturer = info.manufacturer ?? 'universal';
  let fuel: FuelType = info.fuelType ?? 'any';

  if (vin && vin.length === 17) {
    const local = decodeVinLocal(vin);
    if (mfr === 'universal' && local.manufacturer !== 'universal') {
      mfr = local.manufacturer;
    }
    if (local.fuelType === 'diesel') {
      fuel = 'diesel';
    }
  }

  const text = `${info.make ?? ''} ${info.model ?? ''} ${info.engineType ?? ''}`.toLowerCase();
  if (mfr === 'universal' && /chev|gmc|cadillac|buick|silverado|sierra/.test(text)) {
    mfr = 'gm';
  }
  if (/duramax|\bdiesel\b|\bl5p\b|\blml\b|\bl5d\b|\blz0\b|\blm2\b/.test(text)) {
    fuel = 'diesel';
  }

  let list = getPidsForVehicle(mfr, fuel).filter((p) => (p.service ?? 0x01) === 0x22);
  if (mfr === 'gm' && list.length < 12 && fuel !== 'any') {
    list = getPidsForVehicle('gm', 'any').filter((p) => (p.service ?? 0x01) === 0x22);
  }
  if (list.length === 0 && vin && vin.length === 17 && decodeVinLocal(vin).manufacturer === 'gm') {
    list = getPidsForVehicle('gm', 'any').filter((p) => (p.service ?? 0x01) === 0x22);
  }
  return list;
}

/** GM_EXTENDED_PIDS `ecuHeader` (e.g. "7E0") → physical CAN TX id for UDS. */
function parsePidEcuTxId(header?: string): number {
  if (!header?.trim()) return 0x7e0;
  const n = parseInt(header.trim().replace(/^0x/i, ''), 16);
  return Number.isFinite(n) && n > 0 ? n : 0x7e0;
}

/** Do not send GM E41-style 0x10 0x03 on 0x7E0 when we already know the vehicle is non-GM. */
const NON_GM_FOR_GMLAN_SESSION = new Set<PIDManufacturer>([
  'ford', 'chrysler', 'toyota', 'honda', 'nissan', 'hyundai', 'bmw',
  'canam', 'seadoo', 'polaris', 'kawasaki',
]);

/** True when vehicle metadata points at a GM ECM (L5P / Duramax / Chevy GMC truck). */
function isVehicleInfoGmLikely(info: VehicleInfo): boolean {
  if (info.manufacturer === 'gm') return true;
  if (info.vin && info.vin.length === 17 && decodeVinLocal(info.vin).manufacturer === 'gm') return true;
  const t = `${info.make ?? ''} ${info.model ?? ''} ${info.engineType ?? ''}`.toLowerCase();
  if (/chev|gmc|buick|cadillac|silverado|sierra|duramax|\bl5p\b|\blml\b|2500|3500|\bl87\b|\bl86\b/.test(t)) {
    return true;
  }
  // NHTSA/VIN decode can miss make but still describe the diesel (E41 / 6.6L).
  return /\be41\b|6\.6.*diesel|duramax|l5p/.test(t);
}

// ─── PCAN Connection Class ──────────────────────────────────────────────────

// ─── Multi-Protocol Types ────────────────────────────────────────────────────

export interface J1939Reading {
  pgn: number;
  pgnName: string;
  source: number;
  priority: number;
  data: number[];
  decoded?: Record<string, { value: number; unit: string; description: string }>;
  timestamp: number;
}

export interface UDSResponse {
  service: number;
  serviceName: string;
  subFunction?: number;
  did?: number;
  data: number[];
  positiveResponse: boolean;
  nrc?: number;
  nrcName?: string;
  isFlashRelated: boolean;
  timestamp: number;
}

const UDS_NRC_CODES: Record<number, string> = {
  0x10: 'General Reject',
  0x11: 'Service Not Supported',
  0x12: 'Sub-Function Not Supported',
  0x13: 'Incorrect Message Length / Invalid Format',
  0x14: 'Response Too Long',
  0x21: 'Busy — Repeat Request',
  0x22: 'Conditions Not Correct',
  0x24: 'Request Sequence Error',
  0x25: 'No Response From Sub-Net Component',
  0x26: 'Failure Prevents Execution',
  0x31: 'Request Out Of Range',
  0x33: 'Security Access Denied',
  0x35: 'Invalid Key',
  0x36: 'Exceeded Number Of Attempts',
  0x37: 'Required Time Delay Not Expired',
  0x70: 'Upload/Download Not Accepted',
  0x71: 'Transfer Data Suspended',
  0x72: 'General Programming Failure',
  0x73: 'Wrong Block Sequence Counter',
  0x78: 'Request Correctly Received — Response Pending',
  0x7e: 'Sub-Function Not Supported In Active Session',
  0x7f: 'Service Not Supported In Active Session',
};

function decodeNRC(nrc: number): string {
  return UDS_NRC_CODES[nrc] || `Unknown NRC (0x${nrc.toString(16).toUpperCase()})`;
}

/** ISO-TP first-frame → {@link UDSResponse} (shared by PCAN bridge and V-OP USB bridge). */
export function parseIsoTpDataToUdsResponse(
  service: number,
  subFunction: number | undefined,
  rawData: number[],
): UDSResponse | null {
  const pciType = (rawData[0] >> 4) & 0x0f;
  let payload: number[];

  if (pciType === 0) {
    const length = rawData[0] & 0x0f;
    payload = rawData.slice(1, 1 + length);
  } else if (pciType === 1) {
    const totalLen = ((rawData[0] & 0x0f) << 8) | rawData[1];
    payload = rawData.slice(2);
    console.log(`[UDS] Multi-frame response (${totalLen} bytes) — partial first frame`);
  } else {
    payload = rawData.slice(1);
  }

  if (payload.length === 0) return null;

  const responseServiceId = payload[0];

  if (responseServiceId === 0x7f) {
    const rejectedService = payload.length > 1 ? payload[1] : service;
    const nrc = payload.length > 2 ? payload[2] : 0;
    return {
      service: rejectedService,
      serviceName: UDS_SERVICES[rejectedService]?.name || `Service 0x${rejectedService.toString(16)}`,
      subFunction,
      data: payload,
      positiveResponse: false,
      nrc,
      nrcName: decodeNRC(nrc),
      isFlashRelated: UDS_SERVICES[rejectedService]?.isFlashRelated || false,
      timestamp: Date.now(),
    };
  }

  if (responseServiceId === service + 0x40) {
    return {
      service,
      serviceName: UDS_SERVICES[service]?.name || `Service 0x${service.toString(16)}`,
      subFunction,
      data: payload.slice(1),
      positiveResponse: true,
      isFlashRelated: UDS_SERVICES[service]?.isFlashRelated || false,
      timestamp: Date.now(),
    };
  }

  if (responseServiceId >= 0x40 && responseServiceId !== 0x7f) {
    const actualService = responseServiceId - 0x40;
    console.log(
      `[UDS] parseIsoTpDataToUdsResponse: positive 0x${responseServiceId.toString(16)} for svc 0x${actualService.toString(16)} (expected 0x${service.toString(16)})`,
    );
    return {
      service: actualService,
      serviceName: UDS_SERVICES[actualService]?.name || `Service 0x${actualService.toString(16)}`,
      subFunction,
      data: payload.slice(1),
      positiveResponse: true,
      isFlashRelated: UDS_SERVICES[actualService]?.isFlashRelated || false,
      timestamp: Date.now(),
    };
  }

  console.log(
    `[UDS] parseIsoTpDataToUdsResponse: unexpected 0x${responseServiceId.toString(16)} for svc 0x${service.toString(16)} — raw: [${payload.map(b => b.toString(16).padStart(2, '0')).join(' ')}]`,
  );
  return {
    service,
    serviceName: UDS_SERVICES[service]?.name || `Service 0x${service.toString(16)}`,
    subFunction,
    data: payload,
    positiveResponse: false,
    nrc: undefined,
    nrcName: 'unparseable response',
    isFlashRelated: UDS_SERVICES[service]?.isFlashRelated || false,
    timestamp: Date.now(),
  };
}

/** Parse a full reassembled UDS payload (no ISO-TP PCI) — used after multi-frame ISO-TP RX from ECU. */
export function parseUdsDiagnosticPayload(
  service: number,
  subFunction: number | undefined,
  payload: number[],
): UDSResponse | null {
  if (payload.length === 0) return null;

  const responseServiceId = payload[0];

  if (responseServiceId === 0x7f) {
    const rejectedService = payload.length > 1 ? payload[1] : service;
    const nrc = payload.length > 2 ? payload[2] : 0;
    return {
      service: rejectedService,
      serviceName: UDS_SERVICES[rejectedService]?.name || `Service 0x${rejectedService.toString(16)}`,
      subFunction,
      data: payload,
      positiveResponse: false,
      nrc,
      nrcName: decodeNRC(nrc),
      isFlashRelated: UDS_SERVICES[rejectedService]?.isFlashRelated || false,
      timestamp: Date.now(),
    };
  }

  if (responseServiceId === service + 0x40) {
    return {
      service,
      serviceName: UDS_SERVICES[service]?.name || `Service 0x${service.toString(16)}`,
      subFunction,
      data: payload.slice(1),
      positiveResponse: true,
      isFlashRelated: UDS_SERVICES[service]?.isFlashRelated || false,
      timestamp: Date.now(),
    };
  }

  if (responseServiceId >= 0x40 && responseServiceId !== 0x7f) {
    const actualService = responseServiceId - 0x40;
    return {
      service: actualService,
      serviceName: UDS_SERVICES[actualService]?.name || `Service 0x${actualService.toString(16)}`,
      subFunction,
      data: payload.slice(1),
      positiveResponse: true,
      isFlashRelated: UDS_SERVICES[actualService]?.isFlashRelated || false,
      timestamp: Date.now(),
    };
  }

  return {
    service,
    serviceName: UDS_SERVICES[service]?.name || `Service 0x${service.toString(16)}`,
    subFunction,
    data: payload,
    positiveResponse: false,
    nrc: undefined,
    nrcName: 'unparseable response',
    isFlashRelated: UDS_SERVICES[service]?.isFlashRelated || false,
    timestamp: Date.now(),
  };
}

export interface BusMonitorFrame {
  arbId: number;
  arbIdHex: string;
  data: number[];
  dataHex: string;
  isExtended: boolean;
  dlc: number;
  timestamp: number;
  /** Decoded protocol info (if recognized) */
  decoded?: {
    protocol: 'obd2' | 'j1939' | 'uds' | 'raw';
    description: string;
    module?: string;
    service?: string;
    parameters?: Record<string, string | number>;
  };
}

export interface PCANConnectionConfig {
  bridgeUrl?: string;       // Tried first; then wss/ws candidates (127.0.0.1 before localhost)
  bridgeUrlSecure?: string; // Default: wss://127.0.0.1:8766
  bridgeUrlInsecure?: string; // Default: ws://127.0.0.1:8765
  reconnectAttempts?: number; // Default: 3
  requestTimeout?: number;   // Default: CAN_BRIDGE_DEFAULT_REQUEST_TIMEOUT_MS
}

export class PCANConnection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private listeners: Map<ConnectionEventType, EventCallback[]> = new Map();
  private loggingActive = false;
  private currentSession: LogSession | null = null;
  private supportedPids: Set<number> = new Set();
  private vehicleInfo: VehicleInfo = {};
  private bridgeUrl: string;
  private bridgeUrlSecure: string;
  private bridgeUrlInsecure: string;
  /** When set, connect() tries this URL before secure/insecure candidates. */
  private userSpecifiedBridgeUrl: string | null;
  private reconnectAttempts: number;
  private requestTimeout: number;
  private requestId = 0;
  private pendingRequests: Map<string, {
    resolve: (data: BridgeMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private currentProtocol: SupportedProtocol = 'obd2';
  private monitorActive = false;
  private monitorCallback: ((frame: BusMonitorFrame) => void) | null = null;
  private monitorFrameHandler: ((event: MessageEvent) => void) | null = null;
  private udsResponseListener: ((msg: Record<string, unknown>) => void) | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  /** Per ECM TX: last time we sent 0x10 extended session for GM live UDS 0x22 */
  private gmLiveSessionAtByTx = new Map<number, number>();

  constructor(config: PCANConnectionConfig = {}) {
    this.bridgeUrlSecure = config.bridgeUrlSecure ?? 'wss://127.0.0.1:8766';
    this.bridgeUrlInsecure = config.bridgeUrlInsecure ?? 'ws://127.0.0.1:8765';
    this.userSpecifiedBridgeUrl = config.bridgeUrl ?? null;
    this.bridgeUrl = this.userSpecifiedBridgeUrl ?? this.bridgeUrlSecure;
    this.reconnectAttempts = config.reconnectAttempts ?? 3;
    this.requestTimeout = config.requestTimeout ?? CAN_BRIDGE_DEFAULT_REQUEST_TIMEOUT_MS;
  }

  // ─── Event System (identical to OBDConnection) ────────────────────────────

  on(type: ConnectionEventType, callback: EventCallback): void {
    const list = this.listeners.get(type) || [];
    list.push(callback);
    this.listeners.set(type, list);
  }

  off(type: ConnectionEventType, callback: EventCallback): void {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter(cb => cb !== callback));
  }

  private emit(type: ConnectionEventType, data?: unknown, message?: string): void {
    const event: ConnectionEvent = { type, data, message, timestamp: Date.now() };
    const list = this.listeners.get(type) || [];
    list.forEach(cb => cb(event));
  }

  private setState(newState: ConnectionState): void {
    this.state = newState;
    this.emit('stateChange', newState);
  }

  getState(): ConnectionState {
    return this.state;
  }

  // ─── Bridge Detection ─────────────────────────────────────────────────────

  /**
   * Check if the PCAN bridge is running.
   * Tries wss:// on 127.0.0.1 and localhost, then ws:// (same hosts).
   * Returns { available, url } with the working URL.
   */
  static async isBridgeAvailable(
    secureUrl = 'wss://127.0.0.1:8766',
    insecureUrl = 'ws://127.0.0.1:8765'
  ): Promise<{ available: boolean; url: string }> {
    const tryUrl = (url: string): Promise<boolean> => {
      return new Promise((resolve) => {
        try {
          const ws = new WebSocket(url);
          const timer = setTimeout(() => {
            ws.close();
            resolve(false);
          }, 2000);

          ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'ping' }));
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'pong' || msg.type === 'connected') {
                clearTimeout(timer);
                ws.close();
                resolve(true);
              }
            } catch {
              // ignore parse errors
            }
          };

          ws.onerror = () => {
            clearTimeout(timer);
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      });
    };

    const candidates = defaultBridgeWebSocketCandidates(secureUrl, insecureUrl);
    for (const url of candidates) {
      if (await tryUrl(url)) {
        return { available: true, url };
      }
    }
    return { available: false, url: insecureUrl };
  }

  // ─── WebSocket Connection ─────────────────────────────────────────────────

  async connect(options?: { skipVehicleInit?: boolean }): Promise<boolean> {
    try {
      this.setState('connecting');
      this.emit('log', null, 'Connecting to PCAN-USB bridge...');

      // Try user URL first, then wss/ws with 127.0.0.1 before localhost (Windows IPv6 localhost)
      const candidates = defaultBridgeWebSocketCandidates(this.bridgeUrlSecure, this.bridgeUrlInsecure);
      const urlsToTry = this.userSpecifiedBridgeUrl
        ? [...new Set([this.userSpecifiedBridgeUrl, ...candidates])]
        : candidates;
      let connected = false;

      for (const url of urlsToTry) {
        this.bridgeUrl = url;
        const proto = url.startsWith('wss') ? 'wss (secure)' : 'ws (insecure)';
        this.emit('log', null, `Trying ${proto}: ${url}...`);

        for (let attempt = 1; attempt <= this.reconnectAttempts; attempt++) {
          try {
            await this.openWebSocket();
            connected = true;
            this.emit('log', null, `Connected via ${proto}`);
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (attempt === this.reconnectAttempts) {
              this.emit('log', null, `${proto} failed after ${this.reconnectAttempts} attempts: ${msg}`);
            }
            if (attempt < this.reconnectAttempts) {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
        if (connected) break;
      }

      if (!connected) {
        this.emit('error', null, 
          'Could not connect to PCAN-USB bridge.\n\n' +
          'Make sure the bridge script is running:\n' +
          '  python pcan_bridge.py\n\n' +
          'Install requirements:\n' +
          '  pip install python-can websockets\n\n' +
          'The bridge must be running before you click Connect.\n\n' +
          'HTTPS Mixed Content: If the bridge IS running, your browser\n' +
          'may be blocking the connection. The bridge needs TLS support:\n' +
          '  pip install cryptography\n' +
          '  (then restart the bridge — it auto-generates a certificate)\n\n' +
          'First time with TLS? Accept the certificate:\n' +
          '  1. Open https://127.0.0.1:8766 (or https://localhost:8766) in Chrome\n' +
          '  2. Click Advanced → Proceed\n' +
          '  3. Then retry connecting here'
        );
        this.setState('disconnected');
        return false;
      }

      this.emit('log', null, 'Bridge connected. Initializing vehicle communication...');
      this.setState('initializing');

      if (options?.skipVehicleInit) {
        this.setState('ready');
        this.emit('log', null, 'PCAN-USB bridge ready (vehicle init skipped — use ECU Scan or Datalogger to identify vehicle).');
        return true;
      }

      // Initialize: read VIN, detect vehicle, scan supported PIDs
      await this.initialize();

      this.setState('ready');
      this.emit('log', null, 'PCAN-USB connection ready. Vehicle identified.');
      return true;

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('error', null, `Connection failed: ${msg}`);
      this.setState('error');
      return false;
    }
  }

  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.bridgeUrl);

        const timer = setTimeout(() => {
          this.ws?.close();
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        this.ws.onopen = () => {
          // Wait for the 'connected' message from bridge
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: BridgeMessage = JSON.parse(event.data);
            
            if (msg.type === 'connected') {
              clearTimeout(timer);
              const info = msg as unknown as BridgeConnected;
              this.emit('log', null, 
                `Bridge connected: ${info.adapter} on ${info.channel} @ ${info.bitrate} bps (v${info.version})`
              );
              // Start application-level heartbeat (backup for protocol-level ping/pong)
              this.startHeartbeat();
              resolve();
              return;
            }

            // Route responses to pending requests
            if (msg.id && this.pendingRequests.has(msg.id)) {
              const pending = this.pendingRequests.get(msg.id)!;
              clearTimeout(pending.timer);
              this.pendingRequests.delete(msg.id);
              
              if (msg.type === 'error') {
                pending.reject(new Error((msg as unknown as BridgeError).message));
              } else {
                pending.resolve(msg);
              }
            }

            // Route ALL messages to UDS response listener (for sendUDSviaRawCAN)
            // The listener itself filters for can_frame/bus_frame with matching arb_id
            if (this.udsResponseListener) {
              this.udsResponseListener(msg as Record<string, unknown>);
            }
          } catch {
            // ignore parse errors
          }
        };

        this.ws.onerror = (event) => {
          clearTimeout(timer);
          reject(new Error('WebSocket error — is the bridge running?'));
        };

        this.ws.onclose = () => {
          this.stopHeartbeat();
          // If we were connected and logging, emit an error
          if (this.state === 'logging' || this.state === 'ready') {
            this.emit('error', null, 'Bridge connection lost. Reconnect to continue.');
            this.setState('error');
            this.loggingActive = false;
          }
        };

      } catch (e) {
        reject(e);
      }
    });
  }

  private nextRequestId(): string {
    return `req_${++this.requestId}`;
  }

  private sendRequest(msg: BridgeMessage, timeoutOverrideMs?: number): Promise<BridgeMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = msg.id || this.nextRequestId();
      msg.id = id;

      const deadlineMs = timeoutOverrideMs ?? this.requestTimeout;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${msg.type}`));
      }, deadlineMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(msg));
    });
  }

  // ─── Vehicle Initialization ───────────────────────────────────────────────

  private async initialize(): Promise<void> {
    // 1. Read VIN
    this.emit('log', null, 'Reading VIN...');
    try {
      const vinResponse = await this.sendRequest({
        type: 'obd_request',
        mode: 0x09,
        pid: 0x02,
      }) as unknown as BridgeOBDResponse;

      const vin = this.parseVinFromMode0902(vinResponse.data);
      if (vin) {
        this.vehicleInfo.vin = vin;
        this.emit('log', null, `VIN: ${vin}`);

        // Always seed from local WMI so a failed NHTSA fetch does not leave manufacturer unset.
        const localVin = decodeVinLocal(vin);
        this.vehicleInfo.manufacturer = localVin.manufacturer;
        this.vehicleInfo.make = localVin.make;
        this.vehicleInfo.year = localVin.year;
        if (localVin.fuelType !== 'any') {
          this.vehicleInfo.fuelType = localVin.fuelType;
        }

        // Decode VIN via NHTSA (richer model/engine; may mis-label fuel on some HD trucks)
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
            this.emit('log', null, 
              `Vehicle: ${decoded.year || ''} ${decoded.make || ''} ${decoded.model || ''} ${decoded.engineType || ''}`
            );
          }
        } catch {
          this.emit('log', null, 'VIN decode failed — continuing with basic info');
        }

        applyPcanDieselFuelReconciliation(this.vehicleInfo);

        // E41 / L5P: UDS 0x22 live data typically needs extended session (0x10 0x03) on 0x7E0.
        if (isVehicleInfoGmLikely(this.vehicleInfo)) {
          this.emit('log', null, 'GM vehicle — opening extended diagnostic session on ECM (0x7E0) for live DIDs...');
          await this.ensureGmLiveDataSessionForTx(0x7e0);
        }
      }
    } catch (e) {
      this.emit('log', null, 'VIN read failed — vehicle may not support Mode 09. Continuing...');
    }

    this.vehicleInfo.protocol = 'CAN 11-bit 500kbps (PCAN-USB)';
    this.vehicleInfo.protocolNumber = '6';
    this.emit('vehicleInfo', this.vehicleInfo);

    // 2. Scan supported standard PIDs using Mode 01 PID 00/20/40/60
    this.emit('log', null, 'Scanning supported PIDs...');
    await this.scanSupportedStandardPids();
    this.seedChevroletGmCatalogPids();

    const stdCount = this.getAvailablePids().length;
    const extCount = this.getAvailableExtendedPids().length;
    this.emit('log', null, `Found ${stdCount} standard + ${extCount} extended PIDs available`);
    this.emit('pidAvailability', {
      supported: this.getAllAvailablePids(),
      unsupported: [],
    });
  }

  private async scanSupportedStandardPids(): Promise<void> {
    // Read the PID support bitmasks: PIDs 0x00, 0x20, 0x40, 0x60
    const bitmaskPids = [0x00, 0x20, 0x40, 0x60];

    for (const bitmaskPid of bitmaskPids) {
      try {
        const response = await this.sendRequest({
          type: 'obd_request',
          mode: 0x01,
          pid: bitmaskPid,
        }) as unknown as BridgeOBDResponse;

        if (response.data && response.data.length >= 4) {
          // Decode 4-byte bitmask
          const bytes = response.data;
          for (let byteIdx = 0; byteIdx < 4; byteIdx++) {
            for (let bit = 7; bit >= 0; bit--) {
              if (bytes[byteIdx] & (1 << bit)) {
                const pid = bitmaskPid + (byteIdx * 8) + (7 - bit) + 1;
                this.supportedPids.add(pid);
              }
            }
          }
        }
      } catch {
        // Try remaining bitmask PIDs — some ECUs NACK $00 but answer $20/$40/$60
        continue;
      }
    }

    // Always probe common live PIDs and merge — bitmasks are often wrong/empty on EU gateways
    // while RPM/speed/etc. still respond (matches ELM parseVin skipping non-printable count byte).
    await this.probeGenericMode01Pids();
  }

  /**
   * J1979 Mode 09 PID 02: data is [count][17× ASCII VIN]. Count is usually 0x01.
   * Skip non-printable / count bytes so position 1 is WMI (e.g. 1, 4, 5, W…).
   */
  private parseVinFromMode0902(data: number[] | undefined): string | null {
    if (!data?.length) return null;
    let i = 0;
    while (i < data.length && (data[i] < 0x20 || data[i] > 0x7e)) {
      i++;
    }
    if (data.length - i < 17) return null;
    return String.fromCharCode(...data.slice(i, i + 17));
  }

  /**
   * Chevrolet / GM: pre-enable Mode 01 PIDs that exist in both our STANDARD_PIDS and the
   * `obd-utils` ELM catalog so datalogging can start even when bitmask/probes miss (common on some CAN setups).
   */
  private seedChevroletGmCatalogPids(): void {
    const vin = this.vehicleInfo.vin;
    if (!vin || vin.length !== 17) return;
    const { manufacturer } = decodeVinLocal(vin);
    if (manufacturer !== 'gm') return;

    const defs = getStandardPidsMatchingElmCatalog();
    let added = 0;
    for (const p of defs) {
      if (!this.supportedPids.has(p.pid)) {
        this.supportedPids.add(p.pid);
        added++;
      }
    }
    if (added > 0) {
      this.emit(
        'log',
        null,
        `Chevrolet/GM: pre-enabled ${added} Mode 01 PIDs from ELM/OBD-II catalog — start logging and the bus will skip any the ECU NACKs.`
      );
    }
  }

  /** Discover Mode 01 PIDs using `obd-utils` ELM catalog order; merge successes into supportedPids. */
  private async probeGenericMode01Pids(): Promise<void> {
    this.emit('log', null, 'Probing Mode 01 PIDs (obd-utils / ELM327 catalog)...');
    const probes = getMode01ProbePidOrder(48);
    for (const pid of probes) {
      try {
        const response = (await this.sendRequest({
          type: 'obd_request',
          mode: 0x01,
          pid,
        })) as unknown as BridgeOBDResponse;
        if (response.data && response.data.length > 0) {
          this.supportedPids.add(pid);
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * GM E41 / L5P: extended diagnostic session on the physical ECM is usually required before
   * UDS ReadDataByIdentifier (0x22) returns live parameters. Cached ~8s per request address.
   */
  private async ensureGmLiveDataSessionForTx(ecmTx: number): Promise<void> {
    if (ecmTx !== 0x7e0 && ecmTx !== 0x7e1) return;
    const mfr = this.vehicleInfo.manufacturer;
    if (mfr && NON_GM_FOR_GMLAN_SESSION.has(mfr)) return;
    const now = Date.now();
    const last = this.gmLiveSessionAtByTx.get(ecmTx) ?? 0;
    if (now - last < 12000) return;

    try {
      await this.sendUDSRequest(0x3e, 0x00, [], ecmTx, 2500);
    } catch {
      // ignore
    }
    let extendedOk = false;
    try {
      const r = await this.sendUDSRequest(0x10, 0x03, [], ecmTx, 4000);
      extendedOk = !!r?.positiveResponse;
    } catch {
      // ignore
    }
    if (!extendedOk) {
      try {
        await this.sendUDSRequest(0x10, 0x01, [], ecmTx, 3000);
      } catch {
        // ignore
      }
    }
    this.gmLiveSessionAtByTx.set(ecmTx, Date.now());
    await new Promise(r => setTimeout(r, 60));
  }

  // ─── PID Reading ──────────────────────────────────────────────────────────

  /** ELM327-style hex parse (`obd-utils`) when our formula fails or returns non-finite. */
  private decodePidWithElmUtils(mode: number, pidNum: number, data: number[]): number | null {
    if (mode !== 0x01 || !data.length) return null;
    const svc = (mode + 0x40).toString(16).padStart(2, '0');
    const p = pidNum.toString(16).padStart(2, '0');
    const body = data.map((b) => b.toString(16).padStart(2, '0')).join('');
    const parsed = parseOBDResponse(svc + p + body);
    const v = parsed.value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return null;
  }

  async readPid(pid: PIDDefinition): Promise<PIDReading | null> {
    try {
      const mode = pid.service || 0x01;
      // Mode 0x22 = UDS ReadDataByIdentifier — must use UDS/ISO-TP path (`uds_request` / raw CAN).
      // `obd_request` is for SAE J1979 modes 01/03/09; many bridges mishandle 0x22 there.
      if (mode === 0x22) {
        const tx = parsePidEcuTxId(pid.ecuHeader);
        await this.ensureGmLiveDataSessionForTx(tx);
        const uds = await this.readUDSDID(pid.pid, tx);
        if (!uds?.positiveResponse || !uds.data?.length) {
          // Fallback: bridges that only implement OBD framing (fixed reference bridge strips 2-byte DID).
          try {
            const response = await this.sendRequest(
              {
                type: 'obd_request',
                mode: 0x22,
                pid: pid.pid,
              },
              CAN_LIVE_UDS_DID_TIMEOUT_MS,
            ) as unknown as BridgeOBDResponse;
            if (response.data && response.data.length > 0) {
              const value = pid.formula(response.data);
              return {
                pid: pid.pid,
                name: pid.name,
                shortName: pid.shortName,
                value,
                unit: pid.unit,
                rawBytes: response.data,
                timestamp: Date.now(),
              };
            }
          } catch {
            // ignore
          }
          return null;
        }
        // Positive 0x62: [DID_hi, DID_lo, ...value] — formulas expect value bytes only (ELM parity).
        const payload = uds.data.length >= 2 ? uds.data.slice(2) : uds.data;
        if (payload.length === 0) return null;
        const value = pid.formula(payload);
        return {
          pid: pid.pid,
          name: pid.name,
          shortName: pid.shortName,
          value,
          unit: pid.unit,
          rawBytes: payload,
          timestamp: Date.now(),
        };
      }

      const response = await this.sendRequest(
        {
          type: 'obd_request',
          mode,
          pid: pid.pid,
        },
        CAN_LIVE_OBD_MODE01_TIMEOUT_MS,
      ) as unknown as BridgeOBDResponse;

      const raw = response.data;
      if (!raw?.length) return null;
      // ISO 15765 negative response passed through as data
      if (raw[0] === 0x7f) return null;

      try {
        const value = pid.formula(raw);
        if (typeof value === 'number' && !Number.isFinite(value)) {
          const alt = this.decodePidWithElmUtils(mode, pid.pid, raw);
          if (alt === null) return null;
          return {
            pid: pid.pid,
            name: pid.name,
            shortName: pid.shortName,
            value: alt,
            unit: pid.unit,
            rawBytes: raw,
            timestamp: Date.now(),
          };
        }
        return {
          pid: pid.pid,
          name: pid.name,
          shortName: pid.shortName,
          value,
          unit: pid.unit,
          rawBytes: raw,
          timestamp: Date.now(),
        };
      } catch {
        const alt = mode === 0x01 ? this.decodePidWithElmUtils(mode, pid.pid, raw) : null;
        if (alt === null) return null;
        return {
          pid: pid.pid,
          name: pid.name,
          shortName: pid.shortName,
          value: alt,
          unit: pid.unit,
          rawBytes: raw,
          timestamp: Date.now(),
        };
      }
    } catch {
      return null;
    }
  }

  async readPids(pids: PIDDefinition[]): Promise<PIDReading[]> {
    // PCAN bridge doesn't support batch requests like ELM327,
    // so we send individual requests sequentially.
    // This is actually fine because CAN bus is fast (~1ms per request/response).
    const readings: PIDReading[] = [];

    for (const pid of pids) {
      const reading = await this.readPid(pid);
      if (reading) {
        readings.push(reading);
      }
    }

    return readings;
  }

  // ─── DTC Reading ──────────────────────────────────────────────────────────

  async readDTCs(): Promise<{ codes: string[]; pending: string[]; permanent: string[] }> {
    const result = { codes: [] as string[], pending: [] as string[], permanent: [] as string[] };

    // Mode 03: Stored DTCs
    try {
      const response = await this.sendRequest({
        type: 'obd_request',
        mode: 0x03,
        pid: 0x00,
      }) as unknown as BridgeOBDResponse;

      if (response.data) {
        result.codes = this.decodeDTCs(response.data);
      }
    } catch {
      this.emit('log', null, 'Failed to read stored DTCs');
    }

    // Mode 07: Pending DTCs
    try {
      const response = await this.sendRequest({
        type: 'obd_request',
        mode: 0x07,
        pid: 0x00,
      }) as unknown as BridgeOBDResponse;

      if (response.data) {
        result.pending = this.decodeDTCs(response.data);
      }
    } catch {
      // Pending DTCs not supported on all vehicles
    }

    return result;
  }

  private decodeDTCs(data: number[]): string[] {
    const codes: string[] = [];
    const prefixes = ['P', 'C', 'B', 'U'];

    for (let i = 0; i < data.length - 1; i += 2) {
      const byte1 = data[i];
      const byte2 = data[i + 1];
      if (byte1 === 0 && byte2 === 0) continue;

      const prefix = prefixes[(byte1 >> 6) & 0x03];
      const digit1 = (byte1 >> 4) & 0x03;
      const digit2 = byte1 & 0x0F;
      const digit3 = (byte2 >> 4) & 0x0F;
      const digit4 = byte2 & 0x0F;

      codes.push(`${prefix}${digit1}${digit2.toString(16)}${digit3.toString(16)}${digit4.toString(16)}`.toUpperCase());
    }

    return codes;
  }

  async clearDTCs(): Promise<boolean> {
    try {
      await this.sendRequest({
        type: 'obd_request',
        mode: 0x04,
        pid: 0x00,
      });
      this.emit('log', null, 'DTCs cleared successfully');
      this.emit('dtcCleared');
      return true;
    } catch {
      this.emit('error', null, 'Failed to clear DTCs');
      return false;
    }
  }

  // ─── Logging ──────────────────────────────────────────────────────────────

  async startLogging(
    pids: PIDDefinition[],
    intervalMs = 200,
    onData?: (readings: PIDReading[]) => void
  ): Promise<LogSession> {
    if (this.state !== 'ready') {
      throw new Error('Device must be in ready state to start logging');
    }

    // Pre-filter: remove standard PIDs the vehicle doesn't support
    const filteredPids = pids.filter(p => {
      if (p.service === 0x22) return true; // Extended PIDs aren't in the bitmask
      return this.supportedPids.has(p.pid);
    });

    const removedPids = pids.filter(p => !filteredPids.includes(p));
    if (removedPids.length > 0) {
      this.emit('log', null, `Pre-filtered ${removedPids.length} unsupported PID(s): ${removedPids.map(p => `${p.shortName} (0x${p.pid.toString(16)})`).join(', ')}`);
      this.emit('pidAvailability', { supported: filteredPids, unsupported: removedPids });
    }

    if (filteredPids.length === 0) {
      this.emit('error', null, 'None of the selected PIDs are supported by this vehicle.');
      throw new Error('No supported PIDs to log');
    }

    const session: LogSession = {
      id: `pcan_log_${Date.now()}`,
      startTime: Date.now(),
      sampleRate: intervalMs,
      pids: [...filteredPids],
      readings: new Map(),
      vehicleInfo: this.vehicleInfo,
    };

    for (const pid of filteredPids) {
      session.readings.set(pid.pid, []);
    }

    this.currentSession = session;
    this.loggingActive = true;
    this.setState('logging');
    this.emit('log', null, `Logging started: ${filteredPids.map(p => p.shortName).join(', ')} @ ${intervalMs}ms (${filteredPids.length}/${pids.length} PIDs)`);

    // Failure tracking with soft-disable
    const pidFailCount = new Map<number, number>();
    const pidPausedUntilLoop = new Map<number, number>();
    const MAX_CONSECUTIVE_FAILS = 8;
    const RETRY_INTERVAL = 20;
    let activePids = [...filteredPids];
    let loopCount = 0;

    const logLoop = async () => {
      while (this.loggingActive) {
        const startTime = Date.now();
        loopCount++;

        // Re-add paused PIDs due for retry
        for (const [pidId, retryAt] of Array.from(pidPausedUntilLoop.entries())) {
          if (loopCount >= retryAt) {
            const pidDef = filteredPids.find(p => p.pid === pidId);
            if (pidDef && !activePids.find(p => p.pid === pidId)) {
              activePids.push(pidDef);
              pidFailCount.set(pidId, 0);
              pidPausedUntilLoop.delete(pidId);
            }
          }
        }

        try {
          const readings = await this.readPids(activePids);
          const respondedPids = new Set(readings.map(r => r.pid));

          for (const reading of readings) {
            const arr = session.readings.get(reading.pid);
            if (arr) arr.push(reading);
            pidFailCount.set(reading.pid, 0);
          }

          // Track failures
          const newlyPaused: string[] = [];
          for (const pid of activePids) {
            if (!respondedPids.has(pid.pid)) {
              const fails = (pidFailCount.get(pid.pid) || 0) + 1;
              pidFailCount.set(pid.pid, fails);

              if (fails >= MAX_CONSECUTIVE_FAILS && !pidPausedUntilLoop.has(pid.pid)) {
                pidPausedUntilLoop.set(pid.pid, loopCount + RETRY_INTERVAL);
                newlyPaused.push(pid.shortName);
              }
            }
          }

          if (newlyPaused.length > 0) {
            activePids = activePids.filter(p => !pidPausedUntilLoop.has(p.pid));
            this.emit('log', null, `Paused non-responding PIDs: ${newlyPaused.join(', ')} (will retry)`);
          }

          if (onData && readings.length > 0) {
            onData(readings);
          }
        } catch (e) {
          if (this.loggingActive) {
            this.emit('log', null, `Poll error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Wait for remaining interval time
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, intervalMs - elapsed);
        if (waitTime > 0 && this.loggingActive) {
          await new Promise(r => setTimeout(r, waitTime));
        }
      }
    };

    logLoop();
    return session;
  }

  stopLogging(): LogSession | null {
    this.loggingActive = false;

    if (this.currentSession) {
      this.currentSession.endTime = Date.now();
      const session = this.currentSession;
      this.currentSession = null;
      this.setState('ready');
      this.emit('log', null, 'Logging stopped');
      return session;
    }

    this.setState('ready');
    return null;
  }

  isLogging(): boolean {
    return this.loggingActive;
  }

  getCurrentSession(): LogSession | null {
    return this.currentSession;
  }

  // ─── DID Discovery Scan ───────────────────────────────────────────────────

  async scanSupportedDIDs(options?: {
    includeStandard?: boolean;
    includeExtended?: boolean;
    onProgress?: (current: number, total: number, pid: PIDDefinition, supported: boolean) => void;
    abortSignal?: AbortSignal;
  }): Promise<DIDScanReport> {
    const includeStandard = options?.includeStandard ?? true;
    const includeExtended = options?.includeExtended ?? true;
    const startTime = Date.now();

    const standardSupported: ScanResult[] = [];
    const extendedSupported: ScanResult[] = [];
    const standardUnsupported: ScanResult[] = [];
    const extendedUnsupported: ScanResult[] = [];

    const allPids: PIDDefinition[] = [];
    if (includeStandard) {
      allPids.push(...STANDARD_PIDS.filter(p => p.pid > 0x00 && p.pid !== 0x20 && p.pid !== 0x40 && p.pid !== 0x60));
    }
    let extPids: PIDDefinition[] = [];
    if (includeExtended) {
      extPids = extendedMode22PidsForPcanVehicle(this.vehicleInfo);
      allPids.push(...extPids);
    }

    // Open GM ECM session(s) before scanning Mode 22 so the first DID does not time out cold.
    if (extPids.length > 0) {
      const addrs = new Set(extPids.map(p => parsePidEcuTxId(p.ecuHeader)));
      for (const addr of addrs) {
        if (options?.abortSignal?.aborted) break;
        await this.ensureGmLiveDataSessionForTx(addr);
      }
    }

    let current = 0;
    const total = allPids.length;

    for (const pid of allPids) {
      if (options?.abortSignal?.aborted) break;

      current++;
      const reading = await this.readPid(pid);
      const isExtended = (pid.service || 0x01) === 0x22;

      if (reading) {
        const result: ScanResult = {
          pid,
          supported: true,
          sampleValue: reading.value,
        };
        if (isExtended) extendedSupported.push(result);
        else standardSupported.push(result);
        this.supportedPids.add(pid.pid);
      } else {
        const result: ScanResult = { pid, supported: false };
        if (isExtended) extendedUnsupported.push(result);
        else standardUnsupported.push(result);
      }

      options?.onProgress?.(current, total, pid, !!reading);
    }

    const duration = Date.now() - startTime;
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
      timestamp: startTime,
      duration,
      vehicleInfo: this.vehicleInfo,
      standardSupported,
      extendedSupported,
      standardUnsupported,
      extendedUnsupported,
      totalScanned: current,
      totalSupported: standardSupported.length + extendedSupported.length,
      autoPreset,
    };
  }

  // ─── PID Availability ─────────────────────────────────────────────────────

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
    return extendedMode22PidsForPcanVehicle(this.vehicleInfo);
  }

  getAllAvailablePids(): PIDDefinition[] {
    return [...this.getAvailablePids(), ...this.getAvailableExtendedPids()];
  }

  // ─── Protocol Switching ───────────────────────────────────────────────────

  /**
   * Switch the active protocol on the PCAN bridge.
   * This reinitializes the CAN bus with the appropriate bitrate and settings.
   * All protocols work with both Datalogger AND IntelliSpy.
   */
  async setProtocol(protocol: SupportedProtocol): Promise<boolean> {
    const protocolInfo = ALL_PROTOCOLS[protocol];
    if (!protocolInfo) {
      this.emit('error', null, `Unknown protocol: ${protocol}`);
      return false;
    }

    this.emit('log', null, `Switching to ${protocolInfo.name} (${protocolInfo.defaultBitrate} bps)...`);

    try {
      const response = await this.sendRequest({
        type: 'set_protocol',
        protocol,
        bitrate: protocolInfo.defaultBitrate,
        extended_ids: protocolInfo.extendedIds,
        fd: protocol === 'canfd',
      });

      if (response.type === 'protocol_set') {
        this.currentProtocol = protocol;
        this.emit('log', null, `Protocol switched to ${protocolInfo.name}`);
        this.emit('protocolChange', { protocol, name: protocolInfo.name });
        return true;
      }
      return false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('error', null, `Protocol switch failed: ${msg}`);
      return false;
    }
  }

  getCurrentProtocol(): SupportedProtocol {
    return this.currentProtocol;
  }

  // ─── J1939 Operations ────────────────────────────────────────────────────

  /**
   * Send a J1939 PGN request and receive the response.
   * Automatically switches to J1939 protocol if not already active.
   */
  async requestJ1939PGN(pgn: number, destinationAddress = 0xFF): Promise<J1939Reading | null> {
    if (this.currentProtocol !== 'j1939') {
      await this.setProtocol('j1939');
    }

    try {
      const response = await this.sendRequest({
        type: 'j1939_request',
        pgn,
        da: destinationAddress,
      });

      if (response.type === 'j1939_response' && response.data) {
        const pgnInfo = J1939_PGNS[pgn];
        return {
          pgn,
          pgnName: pgnInfo?.name || `PGN ${pgn}`,
          source: (response.source as number) || 0,
          priority: (response.priority as number) || 6,
          data: response.data as number[],
          timestamp: Date.now(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Read common J1939 engine parameters (EEC1, EEC2, ET1, etc.)
   */
  async readJ1939EngineParams(): Promise<J1939Reading[]> {
    const readings: J1939Reading[] = [];
    const commonPGNs = [61444, 61443, 65262, 65263, 65265, 65266, 65270, 65271];

    for (const pgn of commonPGNs) {
      const reading = await this.requestJ1939PGN(pgn);
      if (reading) readings.push(reading);
    }

    return readings;
  }

  // ─── UDS Operations ──────────────────────────────────────────────────────

  /**
   * Send a UDS service request.
   * Used for diagnostics, flash monitoring, and parameter read/write.
   *
   * Transport strategy for UDS commands:
   * 1. Try native uds_request (bridge may support it natively)
   * 2. Try raw CAN (can_send) with ISO-TP single-frame framing
   * 3. Fall back to obd_request (only works for standard OBD modes)
   *
   * The raw CAN approach matches udsTransport.ts which is proven to work.
   * The bridge's obd_request handler does NOT translate non-OBD service IDs
   * (0x3E, 0x10, 0x22, 0x27, etc.) into CAN frames — it only handles
   * standard OBD-II modes (0x01, 0x03, 0x09).
   */
  private udsNativeSupported = true;
  private udsRawCanSupported = true;

  async sendUDSRequest(
    service: number,
    subFunction?: number,
    data?: number[],
    targetAddress = 0x7E0,
    timeoutMs = 5000
  ): Promise<UDSResponse | null> {
    const svcHex = `0x${service.toString(16)}`;
    const subHex = subFunction !== undefined ? `0x${subFunction.toString(16)}` : 'none';
    console.log(`[UDS] sendUDSRequest svc=${svcHex} sub=${subHex} addr=0x${targetAddress.toString(16)} native=${this.udsNativeSupported} rawCan=${this.udsRawCanSupported}`);

    // Strategy 1: Try native uds_request first (if bridge supports it)
    if (this.udsNativeSupported) {
      try {
        const response = await this.sendRequest(
          {
            type: 'uds_request',
            service,
            sub: subFunction,
            data: data || [],
            target: targetAddress,
          },
          timeoutMs,
        );

        console.log(`[UDS] uds_request response type=${response.type}`, JSON.stringify(response).slice(0, 200));

        if (response.type === 'uds_response') {
          console.log(`[UDS] ✓ Native UDS worked for svc=${svcHex}`);
          return this.parseUDSResponse(service, subFunction, response);
        }
        if (response.type === 'error') {
          this.udsNativeSupported = false;
          console.log(`[UDS] Native UDS returned error — disabling`);
        } else {
          // Unexpected response type — might be obd_response or something else
          // Try to parse it anyway
          console.log(`[UDS] Native UDS returned unexpected type=${response.type} — trying to parse`);
          // Check if the response has data that looks like a UDS response
          const respData = response.data as number[] | undefined;
          if (respData && respData.length > 0) {
            console.log(`[UDS] Response has data: [${respData.map(b => typeof b === 'number' ? b.toString(16).padStart(2, '0') : b).join(' ')}]`);
            // Parse as raw UDS response
            return this.parseISOTPResponse(service, subFunction, respData);
          }
          this.udsNativeSupported = false;
          console.log(`[UDS] No usable data in response — disabling native UDS`);
        }
      } catch (err) {
        this.udsNativeSupported = false;
        console.log(`[UDS] uds_request threw: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Strategy 2: Raw CAN with ISO-TP framing (proven approach from udsTransport.ts)
    if (this.udsRawCanSupported) {
      try {
        console.log(`[UDS] Trying raw CAN for svc=${svcHex}`);
        return await this.sendUDSviaRawCAN(service, subFunction, data, targetAddress, timeoutMs);
      } catch (err) {
        // If can_send itself errors (not timeout), bridge may not support it
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[UDS] Raw CAN threw: ${msg}`);
        if (msg.includes('unknown') || msg.includes('unsupported') || msg.includes('not supported')) {
          this.udsRawCanSupported = false;
        } else {
          // Timeout or no ECU response — this is expected, don't disable raw CAN
          throw err;
        }
      }
    }

    // Strategy 3: Last resort — obd_request (only works for standard OBD modes)
    console.log(`[UDS] Falling back to OBD transport for svc=${svcHex}`);
    return this.sendUDSviaOBD(service, subFunction, data, targetAddress, timeoutMs);
  }

  /**
   * Track whether UDS monitor mode has been started.
   * We start it once and leave it running for the duration of the session.
   */
  private udsMonitorStarted = false;

  /**
   * Send UDS command via raw CAN frames with ISO-TP single-frame framing.
   *
   * The bridge's can_send handler is fire-and-forget — it sends the CAN frame
   * but does NOT relay the ECU's response back via WebSocket. To capture the
   * response, we intercept the bus monitor's frame callback (which is PROVEN
   * to receive can_frame messages) and filter for the response CAN ID.
   *
   * If no bus monitor is running, we start one with our own handler.
   */
  /**
   * ECU sent ISO-TP First Frame (PCI 0x1*) — send Flow Control and reassemble consecutive frames.
   * Required for long GMLAN responses (e.g. ReadDID 0x1A 0x90 → 0x10 0x13 FF then CFs).
   */
  private async receiveIsoTpMultiFrameFromEcu(
    targetAddress: number,
    responseArbId: number,
    firstFrame: number[],
    timeoutMs: number,
  ): Promise<number[] | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;

    const totalLen = ((firstFrame[0] & 0x0f) << 8) | firstFrame[1];
    if (totalLen < 1 || totalLen > 4095) {
      console.log(`[ISO-TP RX] invalid total length ${totalLen}`);
      return null;
    }

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
          this.udsResponseListener = null;
          resolve(null);
        }, Math.max(30, deadline - Date.now()));

        this.udsResponseListener = (msg: Record<string, unknown>) => {
          const msgType = msg.type as string;
          if (msgType !== 'can_frame' && msgType !== 'bus_frame') return;

          const rawArbId = msg.arb_id ?? msg.arbitration_id;
          const arbId = typeof rawArbId === 'string'
            ? (rawArbId.startsWith('0x') ? parseInt(rawArbId, 16) : parseInt(rawArbId, 10))
            : Number(rawArbId);
          if (arbId !== responseArbId) return;

          const fd = (msg.data as number[]) || [];
          if (fd.length === 0) return;
          const pci = (fd[0] >> 4) & 0x0f;
          if (pci !== 2) return;
          const seq = fd[0] & 0x0f;
          if (seq !== expectedSeq) {
            console.log(`[ISO-TP RX] sequence mismatch: want ${expectedSeq}, got ${seq}`);
            return;
          }
          clearTimeout(t);
          this.udsResponseListener = null;
          resolve(fd);
        };
      });

    const fc = [0x30, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    this.ws.send(
      JSON.stringify({
        type: 'can_send',
        id: this.nextRequestId(),
        arb_id: targetAddress,
        data: fc,
      }),
    );

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

  private async sendUDSviaRawCAN(
    service: number,
    subFunction?: number,
    data?: number[],
    targetAddress = 0x7E0,
    timeoutMs = 5000
  ): Promise<UDSResponse | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    // Ensure bus monitor is running so we can capture ECU responses.
    // The key insight: the bus monitor's addEventListener handler IS proven
    // to receive can_frame messages. We need to inject our udsResponseListener
    // into that same handler.
    if (!this.monitorActive) {
      // No monitor running — start one with a handler that routes to udsResponseListener
      this.monitorActive = true;
      this.monitorCallback = () => {}; // no-op

      // Replace or create the frame handler to include UDS routing
      if (this.monitorFrameHandler) {
        this.ws.removeEventListener('message', this.monitorFrameHandler);
      }
      this.monitorFrameHandler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if ((msg.type === 'can_frame' || msg.type === 'bus_frame') && this.monitorActive) {
            if (this.udsResponseListener) {
              this.udsResponseListener(msg);
            }
          }
        } catch { /* ignore */ }
      };
      this.ws.addEventListener('message', this.monitorFrameHandler);

      // Tell bridge to start streaming
      try {
        await this.sendRequest({ type: 'start_monitor', filter_ids: [], arb_ids: [] });
        await new Promise(r => setTimeout(r, 100));
      } catch {
        // Monitor might already be running on bridge side
      }
    } else {
      // Monitor IS already running (IntelliSpy started it).
      // The existing monitorFrameHandler doesn't know about udsResponseListener.
      // Wrap it: save the old handler, replace with one that also routes to UDS.
      const oldHandler = this.monitorFrameHandler;
      if (oldHandler && !this.udsMonitorStarted) {
        this.ws.removeEventListener('message', oldHandler);
        this.monitorFrameHandler = (event: MessageEvent) => {
          // Call original handler first (for IntelliSpy)
          oldHandler(event);
          // Also route to UDS response listener
          try {
            const msg = JSON.parse(event.data);
            if ((msg.type === 'can_frame' || msg.type === 'bus_frame') && this.udsResponseListener) {
              this.udsResponseListener(msg);
            }
          } catch { /* ignore */ }
        };
        this.ws.addEventListener('message', this.monitorFrameHandler);
      }
    }
    this.udsMonitorStarted = true;

    // Build UDS payload: [service, subFunction?, ...data]
    const udsPayload: number[] = [service];
    if (subFunction !== undefined) udsPayload.push(subFunction);
    if (data) udsPayload.push(...data);

    // Route to multi-frame if payload exceeds single-frame capacity (7 bytes)
    if (udsPayload.length > 7) {
      return this.sendUDSMultiFrame(service, subFunction, udsPayload, targetAddress);
    }

    // Build ISO-TP single frame: [PCI_length, ...udsPayload, 0x00 padding]
    const pciLength = udsPayload.length;
    const frame: number[] = [pciLength, ...udsPayload];
    while (frame.length < 8) frame.push(0x00);

    // Response arbitration ID: physical = request + 0x08
    // Functional addressing (0x7DF) gets responses from any ECU on its physical ID.
    // For GM ECUs, responses come on 0x7E8 regardless of whether request was on 0x7E0 or 0x7DF.
    const isFunctional = targetAddress === 0x7DF;
    const responseArbId = isFunctional ? -1 : (targetAddress + 0x08);

    // Drain any stale frames from the bus monitor before setting up our listener.
    // Set a temporary drain listener that discards frames for a brief period.
    // Increased from 50ms to 150ms — dry run #8 showed DID 0x90 returning DID 0xC1 data,
    // indicating stale frames from previous requests weren't fully drained.
    this.udsResponseListener = null; // Clear any previous listener
    await new Promise(r => setTimeout(r, 150)); // Drain period for stale frames

    // Track when we send so we can reject suspiciously fast responses (stale buffer)
    const sendTimestamp = Date.now();

    // Set up response capture via udsResponseListener.
    // The existing monitorFrameHandler (whether ours or IntelliSpy's) will call
    // this.udsResponseListener for every can_frame/bus_frame.
    const responsePromise = new Promise<UDSResponse | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.udsResponseListener = null;
        resolve(null);
      }, timeoutMs);

      this.udsResponseListener = (msg: Record<string, unknown>) => {
        const msgType = msg.type as string;
        // Only process CAN frame messages
        if (msgType !== 'can_frame' && msgType !== 'bus_frame') return;

        const rawArbId = msg.arb_id ?? msg.arbitration_id;
        const arbId = typeof rawArbId === 'string'
          ? ((rawArbId as string).startsWith('0x') ? parseInt(rawArbId as string, 16) : parseInt(rawArbId as string, 10))
          : Number(rawArbId);

        // For functional addressing, accept any standard OBD-II response range (0x7E8-0x7EF)
        const isMatch = isFunctional
          ? (arbId >= 0x7E8 && arbId <= 0x7EF)
          : (arbId === responseArbId);

        if (!isMatch) return;

        const frameData: number[] = (msg.data as number[]) || [];
        if (frameData.length === 0) return;

        const pciType = (frameData[0] >> 4) & 0x0f;

        // ISO-TP First Frame from ECU — send Flow Control and reassemble (GMLAN long ReadDID, etc.)
        if (pciType === 1) {
          clearTimeout(timeout);
          this.udsResponseListener = null;
          void (async () => {
            try {
              const assembled = await this.receiveIsoTpMultiFrameFromEcu(
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
            } catch {
              resolve(null);
            }
          })();
          return;
        }

        if (pciType !== 0) {
          console.log(`[UDS] Ignoring unexpected PCI type ${pciType} (not SF)`);
          return;
        }

        const respSvcId = frameData.length > 1 ? frameData[1] : 0;
        const expectedPositive = service + 0x40;
        const isNegative = respSvcId === 0x7F;
        const isPositiveMatch = respSvcId === expectedPositive;
        const isNegativeForUs = isNegative && frameData.length > 2 && frameData[2] === service;
        const isNegativeUnknown = isNegative && (frameData.length <= 2);

        if (isPositiveMatch) {
          clearTimeout(timeout);
          this.udsResponseListener = null;
          resolve(this.parseISOTPResponse(service, subFunction, frameData));
        } else if (isNegativeForUs || isNegativeUnknown) {
          const nrc = frameData.length > 3 ? frameData[3] : 0;
          if (nrc === 0x78) {
            console.log(`[UDS] NRC 0x78 (responsePending) — ECU processing, waiting for real response...`);
            return;
          }
          clearTimeout(timeout);
          this.udsResponseListener = null;
          resolve(this.parseISOTPResponse(service, subFunction, frameData));
        } else {
          const reason = isNegative
            ? `NRC for svc=0x${(frameData[2] ?? 0).toString(16)}, we sent svc=0x${service.toString(16)}`
            : `positive svc=0x${respSvcId.toString(16)}, expected=0x${expectedPositive.toString(16)}`;
          console.log(`[UDS] Discarding non-matching frame: arb=0x${arbId.toString(16)} ${reason} data=[${frameData.map(b => b.toString(16)).join(',')}]`);
        }
      };
    });

    // Send the CAN frame fire-and-forget
    this.ws.send(JSON.stringify({
      type: 'can_send',
      id: this.nextRequestId(),
      arb_id: targetAddress,
      data: frame,
    }));

    const udsResult = await responsePromise;
    if (!udsResult) {
      throw new Error('Timeout waiting for CAN response');
    }

    return udsResult;
  }

  /**
   * Parse an ISO-TP CAN frame into a UDSResponse.
   */
  private parseISOTPResponse(
    service: number,
    subFunction: number | undefined,
    rawData: number[]
  ): UDSResponse | null {
    const r = parseIsoTpDataToUdsResponse(service, subFunction, rawData);
    if (r && rawData.length > 0) {
      const pciType = (rawData[0] >> 4) & 0x0f;
      if (pciType === 1) {
        const totalLen = ((rawData[0] & 0x0f) << 8) | rawData[1];
        this.emit('log', null, `Multi-frame response (${totalLen} bytes) — partial data extracted`);
      }
    }
    return r;
  }

  /**
   * Send a UDS command using ISO-TP multi-frame transport.
   * Used when the UDS payload exceeds 7 bytes (single-frame limit).
   *
   * ISO-TP multi-frame protocol:
   * 1. Send First Frame (FF): announces total payload length, contains first 6 bytes
   * 2. Wait for Flow Control (FC) from ECU: [0x30, BlockSize, STmin]
   * 3. Send Consecutive Frames (CF): remaining data in 7-byte chunks
   * 4. Wait for ECU response (positive or negative)
   *
   * BUSMASTER analysis confirms ECU flow control: 30 00 F1
   *   - BlockSize=0 (unlimited), STmin=0xF1 (241μs)
   */
  private async sendUDSMultiFrame(
    service: number,
    subFunction: number | undefined,
    udsPayload: number[],
    targetAddress: number
  ): Promise<UDSResponse | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const totalLength = udsPayload.length;
    const responseArbId = targetAddress + 0x08;

    console.log(`[UDS-MF] Multi-frame TX: svc=0x${service.toString(16)} total=${totalLength} bytes on 0x${targetAddress.toString(16)}`);

    // Drain stale frames
    this.udsResponseListener = null;
    await new Promise(r => setTimeout(r, 150));

    // Step 1: Build and send First Frame (FF)
    // FF format: [0x1H, 0xLL, data0..data5] where 0x1HLL = total length
    const firstFrame: number[] = [
      0x10 | ((totalLength >> 8) & 0x0F),
      totalLength & 0xFF,
      ...udsPayload.slice(0, 6),
    ];
    while (firstFrame.length < 8) firstFrame.push(0x00);

    // Step 2: Set up Flow Control listener BEFORE sending FF
    const fcPromise = new Promise<{ blockSize: number; stMin: number } | null>((resolve) => {
      const fcTimeout = setTimeout(() => {
        this.udsResponseListener = null;
        console.log('[UDS-MF] Flow Control timeout — no FC received');
        resolve(null);
      }, 5000);

      this.udsResponseListener = (msg: Record<string, unknown>) => {
        const msgType = msg.type as string;
        if (msgType !== 'can_frame' && msgType !== 'bus_frame') return;

        const rawArbId = msg.arb_id ?? msg.arbitration_id;
        const arbId = typeof rawArbId === 'string'
          ? ((rawArbId as string).startsWith('0x') ? parseInt(rawArbId as string, 16) : parseInt(rawArbId as string, 10))
          : Number(rawArbId);

        if (arbId === responseArbId) {
          const frameData: number[] = (msg.data as number[]) || [];
          if (frameData.length === 0) return;

          const pciType = (frameData[0] >> 4) & 0x0F;

          if (pciType === 3) {
            // Flow Control frame: [0x30, BlockSize, STmin, ...]
            const blockSize = frameData[1] || 0;
            const stMin = frameData[2] || 0;
            console.log(`[UDS-MF] FC received: BS=${blockSize} STmin=0x${stMin.toString(16)} (${stMin > 0x80 ? ((stMin - 0xF0) * 100) + 'μs' : stMin + 'ms'})`);
            clearTimeout(fcTimeout);
            this.udsResponseListener = null;
            resolve({ blockSize, stMin });
          } else if (pciType === 0) {
            // Single frame response (could be NRC) — handle it
            const respSvc = frameData[1];
            if (respSvc === 0x7F) {
              // Negative response before FC
              clearTimeout(fcTimeout);
              this.udsResponseListener = null;
              resolve(null);
            }
          }
        }
      };
    });

    // Send First Frame
    this.ws.send(JSON.stringify({
      type: 'can_send',
      id: this.nextRequestId(),
      arb_id: targetAddress,
      data: firstFrame,
    }));
    console.log(`[UDS-MF] FF sent: [${firstFrame.map(b => b.toString(16).padStart(2, '0')).join(' ')}]`);

    // Wait for Flow Control
    const fc = await fcPromise;
    if (!fc) {
      console.log('[UDS-MF] No Flow Control — checking if ECU sent a response instead');
      // Try to read a response (ECU may have responded with NRC immediately)
      throw new Error('No Flow Control received from ECU after First Frame');
    }

    // Step 3: Send Consecutive Frames (CF)
    // Calculate inter-frame delay from STmin
    // 0x00-0x7F = 0-127ms, 0xF1-0xF9 = 100-900μs
    let stMinMs = 0;
    if (fc.stMin <= 0x7F) {
      stMinMs = fc.stMin;
    } else if (fc.stMin >= 0xF1 && fc.stMin <= 0xF9) {
      stMinMs = 1; // Sub-millisecond — use 1ms minimum (JS can't do μs accurately)
    }
    // Minimum 1ms to avoid flooding the CAN bus
    stMinMs = Math.max(stMinMs, 1);

    let offset = 6; // First 6 bytes already sent in FF
    let seqNum = 1;
    let framesSentSinceFC = 0;

    while (offset < udsPayload.length) {
      // Check BlockSize — if non-zero, wait for another FC after sending BS frames
      if (fc.blockSize > 0 && framesSentSinceFC >= fc.blockSize) {
        // Wait for next FC
        const nextFcPromise = new Promise<boolean>((resolve) => {
          const fcTimeout = setTimeout(() => {
            this.udsResponseListener = null;
            resolve(false);
          }, 5000);

          this.udsResponseListener = (msg: Record<string, unknown>) => {
            const msgType = msg.type as string;
            if (msgType !== 'can_frame' && msgType !== 'bus_frame') return;
            const rawArbId = msg.arb_id ?? msg.arbitration_id;
            const arbId = typeof rawArbId === 'string'
              ? parseInt(rawArbId as string, 16)
              : Number(rawArbId);
            if (arbId === responseArbId) {
              const frameData: number[] = (msg.data as number[]) || [];
              if (frameData.length > 0 && ((frameData[0] >> 4) & 0x0F) === 3) {
                clearTimeout(fcTimeout);
                this.udsResponseListener = null;
                resolve(true);
              }
            }
          };
        });
        const gotFC = await nextFcPromise;
        if (!gotFC) throw new Error('Flow Control timeout during consecutive frames');
        framesSentSinceFC = 0;
      }

      const chunk = udsPayload.slice(offset, offset + 7);
      const cf: number[] = [0x20 | (seqNum & 0x0F), ...chunk];
      while (cf.length < 8) cf.push(0x00);

      // Fire-and-forget for consecutive frames
      this.ws.send(JSON.stringify({
        type: 'can_send',
        id: this.nextRequestId(),
        arb_id: targetAddress,
        data: cf,
      }));

      offset += 7;
      seqNum++;
      framesSentSinceFC++;

      // Inter-frame delay
      if (stMinMs > 0 && offset < udsPayload.length) {
        await new Promise(r => setTimeout(r, stMinMs));
      }
    }

    console.log(`[UDS-MF] All ${seqNum} frames sent (${totalLength} bytes). Waiting for response...`);

    // Step 4: Wait for ECU response (positive or negative)
    // BUSMASTER analysis: After TransferData, ECU sends NRC 0x78 (responsePending = writing to flash)
    // followed by 0x76 (positive). NRC 0x78 is NOT an error — it means "data received, writing."
    // We must keep listening past NRC 0x78 until we get the actual positive/negative response.
    // First chunk after erase can take ~22s; normal chunks take ~20ms.
    const MF_RESPONSE_TIMEOUT = 30000; // 30s to handle first-chunk-after-erase scenario
    const responsePromise = new Promise<UDSResponse | null>((resolve) => {
      const respTimeout = setTimeout(() => {
        this.udsResponseListener = null;
        resolve(null);
      }, MF_RESPONSE_TIMEOUT);

      this.udsResponseListener = (msg: Record<string, unknown>) => {
        const msgType = msg.type as string;
        if (msgType !== 'can_frame' && msgType !== 'bus_frame') return;

        const rawArbId = msg.arb_id ?? msg.arbitration_id;
        const arbId = typeof rawArbId === 'string'
          ? ((rawArbId as string).startsWith('0x') ? parseInt(rawArbId as string, 16) : parseInt(rawArbId as string, 10))
          : Number(rawArbId);

        if (arbId !== responseArbId) return;

        const frameData: number[] = (msg.data as number[]) || [];
        if (frameData.length === 0) return;

        const pciType = (frameData[0] >> 4) & 0x0f;

        if (pciType === 1) {
          clearTimeout(respTimeout);
          this.udsResponseListener = null;
          void (async () => {
            try {
              const assembled = await this.receiveIsoTpMultiFrameFromEcu(
                targetAddress,
                responseArbId,
                frameData,
                MF_RESPONSE_TIMEOUT,
              );
              if (!assembled || assembled.length === 0) {
                resolve(null);
                return;
              }
              resolve(parseUdsDiagnosticPayload(service, subFunction, assembled));
            } catch {
              resolve(null);
            }
          })();
          return;
        }

        if (pciType === 0) {
          const respSvc = frameData.length > 1 ? frameData[1] : 0;
          const expectedPositive = service + 0x40;
          const isNegativeForUs = respSvc === 0x7F && frameData.length > 2 && frameData[2] === service;
          const isPositiveMatch = respSvc === expectedPositive;

          if (isPositiveMatch) {
            clearTimeout(respTimeout);
            this.udsResponseListener = null;
            resolve(this.parseISOTPResponse(service, subFunction, frameData));
          } else if (isNegativeForUs) {
            const nrc = frameData.length > 3 ? frameData[3] : 0;
            if (nrc === 0x78) {
              console.log(`[UDS-MF] NRC 0x78 (responsePending) — ECU writing, waiting for positive response...`);
              return;
            }
            clearTimeout(respTimeout);
            this.udsResponseListener = null;
            resolve(this.parseISOTPResponse(service, subFunction, frameData));
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

  private async sendUDSviaOBD(
    service: number,
    subFunction?: number,
    data?: number[],
    targetAddress = 0x7E0,
    timeoutMs = 5000,
  ): Promise<UDSResponse | null> {
    try {
      // Build the payload: [service, subFunction?, ...data]
      const payload: number[] = [];
      if (subFunction !== undefined) payload.push(subFunction);
      if (data) payload.push(...data);

      const response = await this.sendRequest(
        {
          type: 'obd_request',
          mode: service,
          pid: subFunction ?? 0x00,
          data: payload,
          target: targetAddress,
        },
        timeoutMs,
      ) as unknown as BridgeOBDResponse;

      // Parse the OBD response as a UDS response
      // OBD response data contains the raw response bytes after the service+0x40 byte
      if (response.data) {
        const responseData = response.data;
        // Check for negative response: first byte is 0x7F
        if (responseData.length >= 2 && responseData[0] === 0x7F) {
          const nrc = responseData.length >= 3 ? responseData[2] : 0;
          return {
            service,
            serviceName: UDS_SERVICES[service]?.name || `Service 0x${service.toString(16)}`,
            subFunction,
            data: responseData,
            positiveResponse: false,
            nrc,
            nrcName: decodeNRC(nrc),
            isFlashRelated: UDS_SERVICES[service]?.isFlashRelated || false,
            timestamp: Date.now(),
          };
        }

        // Positive response
        return {
          service,
          serviceName: UDS_SERVICES[service]?.name || `Service 0x${service.toString(16)}`,
          subFunction,
          data: responseData,
          positiveResponse: true,
          isFlashRelated: UDS_SERVICES[service]?.isFlashRelated || false,
          timestamp: Date.now(),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseUDSResponse(
    service: number,
    subFunction: number | undefined,
    response: BridgeMessage
  ): UDSResponse {
    const serviceInfo = UDS_SERVICES[service];
    const isPositive = !response.nrc;
    return {
      service,
      serviceName: serviceInfo?.name || `Service 0x${service.toString(16)}`,
      subFunction,
      did: (response.did as number) || undefined,
      data: (response.data as number[]) || [],
      positiveResponse: isPositive,
      nrc: (response.nrc as number) || undefined,
      nrcName: response.nrc ? decodeNRC(response.nrc as number) : undefined,
      isFlashRelated: serviceInfo?.isFlashRelated || false,
      timestamp: Date.now(),
    };
  }

  /**
   * Read a UDS DID (Data Identifier) — ReadDataByIdentifier (0x22)
   */
  async readUDSDID(did: number, targetAddress = 0x7E0): Promise<UDSResponse | null> {
    try {
      return await this.sendUDSRequest(
        0x22,
        undefined,
        [(did >> 8) & 0xff, did & 0xff],
        targetAddress,
        CAN_LIVE_UDS_DID_TIMEOUT_MS,
      );
    } catch {
      return null;
    }
  }

  /**
   * Switch UDS diagnostic session — DiagnosticSessionControl (0x10)
   */
  async setUDSSession(sessionType: 'default' | 'programming' | 'extended'): Promise<boolean> {
    const sessionMap = { default: 0x01, programming: 0x02, extended: 0x03 };
    try {
      const response = await this.sendUDSRequest(0x10, sessionMap[sessionType]);
      return response?.positiveResponse || false;
    } catch {
      return false;
    }
  }

  // ─── Bus Monitor (IntelliSpy) ────────────────────────────────────────────

  /**
   * Start bus monitoring mode for IntelliSpy.
   * Receives all CAN frames on the bus and decodes them based on active protocol.
   * Can monitor flash operations in real-time.
   */
  async startBusMonitor(
    onFrame: (frame: BusMonitorFrame) => void,
    options?: {
      protocol?: SupportedProtocol;
      filterIds?: number[];
      decodeFlash?: boolean;
    }
  ): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', null, 'WebSocket not connected');
      return false;
    }

    // Switch protocol if requested
    if (options?.protocol && options.protocol !== this.currentProtocol) {
      await this.setProtocol(options.protocol);
    }

    this.monitorActive = true;
    this.monitorCallback = onFrame;

    // Set up frame handler on the WebSocket
    this.monitorFrameHandler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if ((msg.type === 'can_frame' || msg.type === 'bus_frame') && this.monitorActive && this.monitorCallback) {
          const frame = this.decodeBusFrame(msg, options?.decodeFlash);

          // Apply ID filter if specified
          if (options?.filterIds && options.filterIds.length > 0) {
            if (!options.filterIds.includes(frame.arbId)) return;
          }

          this.monitorCallback(frame);
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.addEventListener('message', this.monitorFrameHandler);

    // Tell bridge to start monitor mode
    try {
      await this.sendRequest({
        type: 'start_monitor',
        filter_ids: options?.filterIds || [],
        arb_ids: options?.filterIds || [],
      });
      this.emit('log', null, `Bus monitor started (${ALL_PROTOCOLS[this.currentProtocol].name})`);
      return true;
    } catch (e) {
      this.monitorActive = false;
      this.monitorCallback = null;
      if (this.monitorFrameHandler) {
        this.ws.removeEventListener('message', this.monitorFrameHandler);
        this.monitorFrameHandler = null;
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.emit('error', null, `Monitor start failed: ${msg}`);
      return false;
    }
  }

  /**
   * Stop bus monitoring mode.
   */
  async stopBusMonitor(): Promise<void> {
    this.monitorActive = false;
    this.monitorCallback = null;

    if (this.monitorFrameHandler && this.ws) {
      this.ws.removeEventListener('message', this.monitorFrameHandler);
      this.monitorFrameHandler = null;
    }

    try {
      await this.sendRequest({ type: 'stop_monitor' });
    } catch {
      // ignore errors during stop
    }

    this.emit('log', null, 'Bus monitor stopped');
  }

  isMonitoring(): boolean {
    return this.monitorActive;
  }

  /**
   * Decode a raw CAN frame from the bridge into a structured BusMonitorFrame.
   * Identifies OBD-II, J1939, UDS, and flash-related frames.
   */
  private decodeBusFrame(msg: BridgeMessage, decodeFlash = true): BusMonitorFrame {
    const rawArb = msg.arb_id ?? msg.arbitration_id;
    const arbId =
      typeof rawArb === 'number' && Number.isFinite(rawArb)
        ? rawArb >>> 0
        : typeof rawArb === 'string'
          ? (() => {
              const s = rawArb.trim();
              const n = /^0x/i.test(s) ? parseInt(s, 16) : parseInt(s, 10);
              return Number.isFinite(n) ? (n >>> 0) : 0;
            })()
          : 0;
    const rawData = msg.data;
    const data = Array.isArray(rawData)
      ? rawData.map((x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x & 0xff : 0))
      : [];
    const isExtended = (msg.is_extended as boolean) || arbId > 0x7FF;

    const frame: BusMonitorFrame = {
      arbId,
      arbIdHex: `0x${arbId.toString(16).toUpperCase().padStart(isExtended ? 8 : 3, '0')}`,
      data,
      dataHex: data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '),
      isExtended,
      dlc: data.length,
      timestamp: Date.now(),
    };

    // --- Decode based on protocol context ---

    // J1939 frame decoding (29-bit extended IDs)
    if (isExtended && this.currentProtocol === 'j1939') {
      const pgn = (arbId >> 8) & 0x3FFFF;
      const source = arbId & 0xFF;
      const pgnInfo = J1939_PGNS[pgn];
      if (pgnInfo) {
        frame.decoded = {
          protocol: 'j1939',
          description: `${pgnInfo.name} — ${pgnInfo.description}`,
          module: pgnInfo.source,
          service: `PGN ${pgn} (0x${pgn.toString(16).toUpperCase()})`,
          parameters: { source, pgn },
        };
      }
    }

    // OBD-II / UDS response decoding (standard 11-bit IDs 0x7E0-0x7EF)
    if (!isExtended && arbId >= 0x7E0 && arbId <= 0x7EF && data.length >= 2) {
      const serviceId = data[1];

      // UDS positive response (service + 0x40)
      if (serviceId >= 0x50 && decodeFlash) {
        const requestService = serviceId - 0x40;
        const serviceInfo = UDS_SERVICES[requestService];
        if (serviceInfo) {
          frame.decoded = {
            protocol: 'uds',
            description: `${serviceInfo.name} — ${serviceInfo.description}`,
            module: `ECU 0x${(arbId - 8).toString(16).toUpperCase()}`,
            service: `0x${requestService.toString(16).toUpperCase()} ${serviceInfo.name}`,
            parameters: {},
          };

          // Decode flash-related parameters
          if (serviceInfo.isFlashRelated) {
            if (requestService === 0x2E && data.length >= 4) {
              const did = (data[2] << 8) | data[3];
              frame.decoded.parameters = {
                ...frame.decoded.parameters,
                did: `0x${did.toString(16).toUpperCase()}`,
                operation: 'WRITE DID (calibration parameter)',
              };
            } else if (requestService === 0x34 && data.length >= 3) {
              frame.decoded.parameters = {
                ...frame.decoded.parameters,
                operation: 'FLASH DOWNLOAD INITIATED',
                dataFormat: data[2],
              };
            } else if (requestService === 0x36) {
              frame.decoded.parameters = {
                ...frame.decoded.parameters,
                operation: 'FLASH DATA TRANSFER',
                blockSequence: data[2],
                payloadSize: data.length - 3,
              };
            } else if (requestService === 0x37) {
              frame.decoded.parameters = {
                ...frame.decoded.parameters,
                operation: 'FLASH TRANSFER COMPLETE',
              };
            } else if (requestService === 0x31 && data.length >= 4) {
              const routineId = (data[3] << 8) | (data[4] || 0);
              frame.decoded.parameters = {
                ...frame.decoded.parameters,
                routineId: `0x${routineId.toString(16).toUpperCase()}`,
                subFunction: data[2] === 0x01 ? 'START' : data[2] === 0x02 ? 'STOP' : 'RESULTS',
              };
            } else if (requestService === 0x27) {
              frame.decoded.parameters = {
                ...frame.decoded.parameters,
                operation: data[2] % 2 === 1 ? 'SECURITY SEED REQUEST' : 'SECURITY KEY RESPONSE',
                accessLevel: Math.ceil(data[2] / 2),
              };
            } else if (requestService === 0x10) {
              const sessions: Record<number, string> = { 1: 'Default', 2: 'Programming', 3: 'Extended' };
              frame.decoded.parameters = {
                ...frame.decoded.parameters,
                session: sessions[data[2]] || `Custom (0x${data[2]?.toString(16)})`,
              };
            }
          }
        }
      }

      // OBD-II response (Mode 41, 62, etc.)
      if (serviceId === 0x41 || serviceId === 0x42) {
        frame.decoded = {
          protocol: 'obd2',
          description: `OBD-II Mode ${(serviceId - 0x40).toString(16)} Response`,
          module: `ECU 0x${(arbId - 8).toString(16).toUpperCase()}`,
          service: `Mode 0x${(serviceId - 0x40).toString(16).toUpperCase()}`,
          parameters: { pid: data[2] },
        };
      }
      if (serviceId === 0x62) {
        const did = data.length >= 4 ? (data[2] << 8) | data[3] : data[2];
        frame.decoded = {
          protocol: 'obd2',
          description: `Extended PID Response (Mode 22)`,
          module: `ECU 0x${(arbId - 8).toString(16).toUpperCase()}`,
          service: 'Mode 0x22 ReadDID',
          parameters: { did: `0x${did.toString(16).toUpperCase()}` },
        };
      }
    }

    // UDS negative response (0x7F)
    if (!isExtended && data.length >= 3 && data[1] === 0x7F) {
      const rejectedService = data[2];
      const nrc = data[3];
      const serviceInfo = UDS_SERVICES[rejectedService];
      frame.decoded = {
        protocol: 'uds',
        description: `NEGATIVE RESPONSE — ${serviceInfo?.name || `Service 0x${rejectedService.toString(16)}`}: ${decodeNRC(nrc)}`,
        module: `ECU 0x${(arbId - 8).toString(16).toUpperCase()}`,
        service: `0x${rejectedService.toString(16).toUpperCase()} (REJECTED)`,
        parameters: { nrc: `0x${nrc.toString(16).toUpperCase()}`, nrcName: decodeNRC(nrc) },
      };
    }

    return frame;
  }

  // ─── Raw Command (not applicable for PCAN, but needed for interface) ──────

  async sendRawCommand(command: string, _timeout = 5000): Promise<string> {
    // PCAN doesn't support ELM327 AT commands.
    // Parse the command to see if it's a hex CAN frame.
    const hexBytes = command.replace(/\s/g, '').match(/.{1,2}/g);
    if (hexBytes && hexBytes.length >= 2) {
      // Treat as raw CAN data to send on 0x7E0
      const data = hexBytes.map(h => parseInt(h, 16));
      const response = await this.sendRequest({
        type: 'can_send',
        arb_id: 0x7E0,
        data,
      });
      return JSON.stringify(response);
    }
    return 'AT commands not supported on PCAN-USB bridge';
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────

  /**
   * Start application-level heartbeat ping every 15s.
   * This supplements the WebSocket protocol-level ping/pong from the bridge (v2.1+).
   * If the bridge doesn't respond within 10s, the ping is silently dropped.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', id: `hb_${Date.now()}` }));
        } catch {
          // ignore — onclose will handle cleanup
        }
      }
    }, 15_000);
  }

  /**
   * Stop the application-level heartbeat.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Reconnect WebSocket only — no VIN read, no PID scan, no protocol switch.
   * 
   * This avoids the VIN read + PID scan that connect() does, which would
   * fail during a flash session (ECU is in programming mode).
   */
  async reconnectForFlash(): Promise<boolean> {    // Clean up old WebSocket
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }

    // Reset UDS monitor state so sendUDSviaRawCAN re-attaches listeners
    this.udsMonitorStarted = false;
    this.monitorActive = false;
    this.monitorCallback = null;
    if (this.monitorFrameHandler) {
      this.monitorFrameHandler = null;
    }
    this.udsResponseListener = null;

    // Cancel pending requests
    for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Reconnecting'));
    }
    this.pendingRequests.clear();

    const expanded = defaultBridgeWebSocketCandidates(this.bridgeUrlSecure, this.bridgeUrlInsecure);
    const urlsToTry = this.bridgeUrl ? [this.bridgeUrl, ...expanded] : expanded;
    const uniqueUrls = [...new Set(urlsToTry)];

    for (const url of uniqueUrls) {
      this.bridgeUrl = url;
      try {
        await this.openWebSocket();
        this.setState('ready');
        return true;
      } catch {
        // Try next URL
      }
    }

    this.setState('error');
    return false;
  }

  /** Used by {@link PCANFlashEngine} for transport health checks. */
  isFlashTransportOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Clears raw-CAN UDS listeners and rejects pending {@link sendUDSRequest} waits so
   * {@link PCANFlashEngine.abort} stops CAN traffic immediately.
   */
  cancelInFlightDiagnostics(): void {
    this.udsResponseListener = null;
    for (const [, pending] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Aborted'));
    }
    this.pendingRequests.clear();
  }

  /** Fire-and-forget CAN TX (8 bytes, zero-padded) for keepalive / UUDT. */
  async sendRawCanFrame(arbId: number, data: number[]): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    const frame = [...data];
    while (frame.length < 8) frame.push(0x00);
    this.ws.send(JSON.stringify({
      type: 'can_send',
      id: `raw_${Date.now()}`,
      arb_id: arbId,
      data: frame.slice(0, 8),
    }));
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.loggingActive = false;
    if (this.monitorActive) {
      await this.stopBusMonitor();
    }

    // Cancel all pending requests
    for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ type: 'disconnect', id: this.nextRequestId() }));
      } catch {
        // ignore send errors during disconnect
      }
      this.ws.close();
      this.ws = null;
    }

    this.supportedPids.clear();
    this.gmLiveSessionAtByTx.clear();
    this.vehicleInfo = {};
    this.currentSession = null;
    this.setState('disconnected');
    this.emit('log', null, 'Disconnected from PCAN-USB bridge');
  }
}
