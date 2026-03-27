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
  type FuelType,
  type PIDManufacturer,
} from './obdConnection';
import { decodeVinNhtsa } from './universalVinDecoder';

type EventCallback = (event: ConnectionEvent) => void;

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

// ─── PCAN Connection Class ──────────────────────────────────────────────────

export interface PCANConnectionConfig {
  bridgeUrl?: string;       // Default: auto-detect (wss://localhost:8766 then ws://localhost:8765)
  bridgeUrlSecure?: string; // Default: wss://localhost:8766
  bridgeUrlInsecure?: string; // Default: ws://localhost:8765
  reconnectAttempts?: number; // Default: 3
  requestTimeout?: number;   // Default: 3000ms
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
  private reconnectAttempts: number;
  private requestTimeout: number;
  private requestId = 0;
  private pendingRequests: Map<string, {
    resolve: (data: BridgeMessage) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();

  constructor(config: PCANConnectionConfig = {}) {
    this.bridgeUrlSecure = config.bridgeUrlSecure ?? 'wss://localhost:8766';
    this.bridgeUrlInsecure = config.bridgeUrlInsecure ?? 'ws://localhost:8765';
    this.bridgeUrl = config.bridgeUrl ?? this.bridgeUrlSecure; // Start with secure
    this.reconnectAttempts = config.reconnectAttempts ?? 3;
    this.requestTimeout = config.requestTimeout ?? 3000;
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
   * Tries wss://localhost:8766 first (works from HTTPS pages),
   * then falls back to ws://localhost:8765.
   * Returns { available, url } with the working URL.
   */
  static async isBridgeAvailable(
    secureUrl = 'wss://localhost:8766',
    insecureUrl = 'ws://localhost:8765'
  ): Promise<{ available: boolean; url: string }> {
    // Try secure first (works from HTTPS pages without mixed content issues)
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

    // Try wss:// first
    if (await tryUrl(secureUrl)) {
      return { available: true, url: secureUrl };
    }
    // Fall back to ws://
    if (await tryUrl(insecureUrl)) {
      return { available: true, url: insecureUrl };
    }
    return { available: false, url: insecureUrl };
  }

  // ─── WebSocket Connection ─────────────────────────────────────────────────

  async connect(): Promise<boolean> {
    try {
      this.setState('connecting');
      this.emit('log', null, 'Connecting to PCAN-USB bridge...');

      // Try wss:// (secure) first, then ws:// (insecure)
      // HTTPS pages block ws:// due to mixed content, so wss:// is preferred
      const urlsToTry = [this.bridgeUrlSecure, this.bridgeUrlInsecure];
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
          '  1. Open https://localhost:8766 in Chrome\n' +
          '  2. Click Advanced → Proceed to localhost\n' +
          '  3. Then retry connecting here'
        );
        this.setState('disconnected');
        return false;
      }

      this.emit('log', null, 'Bridge connected. Initializing vehicle communication...');
      this.setState('initializing');

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
          } catch {
            // ignore parse errors
          }
        };

        this.ws.onerror = (event) => {
          clearTimeout(timer);
          reject(new Error('WebSocket error — is the bridge running?'));
        };

        this.ws.onclose = () => {
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

  private sendRequest(msg: BridgeMessage): Promise<BridgeMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const id = msg.id || this.nextRequestId();
      msg.id = id;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${msg.type}`));
      }, this.requestTimeout);

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

      if (vinResponse.data && vinResponse.data.length >= 17) {
        const vin = String.fromCharCode(...vinResponse.data.slice(0, 17));
        this.vehicleInfo.vin = vin;
        this.emit('log', null, `VIN: ${vin}`);

        // Decode VIN via NHTSA
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
        // If a bitmask PID fails, just skip it
        break;
      }
    }
  }

  // ─── PID Reading ──────────────────────────────────────────────────────────

  async readPid(pid: PIDDefinition): Promise<PIDReading | null> {
    try {
      const mode = pid.service || 0x01;
      const response = await this.sendRequest({
        type: 'obd_request',
        mode,
        pid: pid.pid,
      }) as unknown as BridgeOBDResponse;

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
      return null;
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
    if (includeExtended) {
      const extPids = getPidsForVehicle(
        this.vehicleInfo.manufacturer || 'universal',
        this.vehicleInfo.fuelType || 'any'
      ).filter(p => (p.service || 0x01) === 0x22);
      allPids.push(...extPids);
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

    return {
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      vehicleInfo: this.vehicleInfo,
      standardSupported,
      extendedSupported,
      standardUnsupported,
      extendedUnsupported,
      totalScanned: current,
      totalSupported: standardSupported.length + extendedSupported.length,
    };
  }

  // ─── PID Availability ─────────────────────────────────────────────────────

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

  async disconnect(): Promise<void> {
    this.loggingActive = false;

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
    this.vehicleInfo = {};
    this.currentSession = null;
    this.setState('disconnected');
    this.emit('log', null, 'Disconnected from PCAN-USB bridge');
  }
}
