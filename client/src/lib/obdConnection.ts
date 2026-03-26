/**
 * OBDLink EX WebSerial Communication Library
 * Implements ELM327/STN2xx command protocol for OBD-II datalogging.
 * 
 * Based on OBDLink Family Reference and Programming Manual (FRPM) Rev E.
 * Supports ISO 15765-4 CAN (11-bit/500k) for GM/Duramax vehicles.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConnectionState = 'disconnected' | 'connecting' | 'initializing' | 'ready' | 'logging' | 'error';

export interface OBDConnectionConfig {
  baudRate?: number;       // Default: 115200 for USB OBDLink EX
  protocol?: string;       // Default: '6' (ISO 15765-4 CAN 11bit/500k)
  adaptiveTiming?: number; // 0=off, 1=auto1, 2=auto2 (aggressive)
  echo?: boolean;          // Default: false
  headers?: boolean;       // Default: false for simple parsing
  spaces?: boolean;        // Default: false for compact responses
  lineFeeds?: boolean;     // Default: false
}

export interface PIDDefinition {
  pid: number;
  name: string;
  shortName: string;
  unit: string;
  min: number;
  max: number;
  formula: (bytes: number[]) => number;
  bytes: number;           // Expected response byte count (A, B, C, D)
  service?: number;        // Default: 0x01
  category: 'engine' | 'turbo' | 'transmission' | 'emissions' | 'fuel' | 'electrical' | 'other';
}

export interface PIDReading {
  pid: number;
  name: string;
  shortName: string;
  value: number;
  unit: string;
  rawBytes: number[];
  timestamp: number;
}

export interface LogSession {
  id: string;
  startTime: number;
  endTime?: number;
  sampleRate: number;
  pids: PIDDefinition[];
  readings: Map<number, PIDReading[]>;  // pid -> readings over time
  vehicleInfo?: VehicleInfo;
}

export interface VehicleInfo {
  vin?: string;
  protocol?: string;
  protocolNumber?: string;
  voltage?: string;
  ecuCount?: number;
}

export type ConnectionEventType = 
  | 'stateChange' 
  | 'data' 
  | 'error' 
  | 'vehicleInfo' 
  | 'log';

export interface ConnectionEvent {
  type: ConnectionEventType;
  data?: unknown;
  message?: string;
  timestamp: number;
}

type EventCallback = (event: ConnectionEvent) => void;

// ─── PID Definitions ─────────────────────────────────────────────────────────

export const STANDARD_PIDS: PIDDefinition[] = [
  // Engine
  {
    pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT',
    unit: '°C', min: -40, max: 215, bytes: 1, category: 'engine',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x0B, name: 'Intake Manifold Pressure (MAP)', shortName: 'MAP',
    unit: 'kPa', min: 0, max: 255, bytes: 1, category: 'turbo',
    formula: ([a]) => a,
  },
  {
    pid: 0x0C, name: 'Engine RPM', shortName: 'RPM',
    unit: 'rpm', min: 0, max: 16383.75, bytes: 2, category: 'engine',
    formula: ([a, b]) => ((a * 256) + b) / 4,
  },
  {
    pid: 0x0D, name: 'Vehicle Speed', shortName: 'VSS',
    unit: 'km/h', min: 0, max: 255, bytes: 1, category: 'engine',
    formula: ([a]) => a,
  },
  {
    pid: 0x0F, name: 'Intake Air Temperature', shortName: 'IAT',
    unit: '°C', min: -40, max: 215, bytes: 1, category: 'engine',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x10, name: 'Mass Air Flow Rate', shortName: 'MAF',
    unit: 'g/s', min: 0, max: 655.35, bytes: 2, category: 'engine',
    formula: ([a, b]) => ((a * 256) + b) / 100,
  },
  {
    pid: 0x11, name: 'Throttle Position', shortName: 'TPS',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  // Fuel
  {
    pid: 0x04, name: 'Calculated Engine Load', shortName: 'LOAD',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x06, name: 'Short Term Fuel Trim (Bank 1)', shortName: 'STFT1',
    unit: '%', min: -100, max: 99.2, bytes: 1, category: 'fuel',
    formula: ([a]) => ((a - 128) * 100) / 128,
  },
  {
    pid: 0x07, name: 'Long Term Fuel Trim (Bank 1)', shortName: 'LTFT1',
    unit: '%', min: -100, max: 99.2, bytes: 1, category: 'fuel',
    formula: ([a]) => ((a - 128) * 100) / 128,
  },
  {
    pid: 0x23, name: 'Fuel Rail Gauge Pressure (diesel)', shortName: 'FRP',
    unit: 'kPa', min: 0, max: 655350, bytes: 2, category: 'fuel',
    formula: ([a, b]) => ((a * 256) + b) * 10,
  },
  {
    pid: 0x22, name: 'Fuel Rail Pressure (relative)', shortName: 'FRP_R',
    unit: 'kPa', min: 0, max: 5177.265, bytes: 2, category: 'fuel',
    formula: ([a, b]) => ((a * 256) + b) * 0.079,
  },
  // Turbo / Boost
  {
    pid: 0x33, name: 'Barometric Pressure', shortName: 'BARO',
    unit: 'kPa', min: 0, max: 255, bytes: 1, category: 'turbo',
    formula: ([a]) => a,
  },
  {
    pid: 0x70, name: 'Boost Pressure Control', shortName: 'BOOST_CMD',
    unit: 'kPa', min: 0, max: 6513.75, bytes: 2, category: 'turbo',
    formula: ([a, b]) => ((a * 256) + b) * 0.03125,
  },
  // Transmission
  {
    pid: 0xA4, name: 'Transmission Actual Gear', shortName: 'GEAR',
    unit: '', min: 0, max: 10, bytes: 2, category: 'transmission',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
  },
  // Emissions
  {
    pid: 0x2C, name: 'Commanded EGR', shortName: 'EGR_CMD',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'emissions',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x2D, name: 'EGR Error', shortName: 'EGR_ERR',
    unit: '%', min: -100, max: 99.2, bytes: 1, category: 'emissions',
    formula: ([a]) => ((a - 128) * 100) / 128,
  },
  {
    pid: 0x3C, name: 'Catalyst Temperature (Bank 1, Sensor 1)', shortName: 'CAT_T',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'emissions',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
  // Electrical
  {
    pid: 0x42, name: 'Control Module Voltage', shortName: 'VPWR',
    unit: 'V', min: 0, max: 65.535, bytes: 2, category: 'electrical',
    formula: ([a, b]) => ((a * 256) + b) / 1000,
  },
  // EGT (Exhaust Gas Temperature)
  {
    pid: 0x78, name: 'Exhaust Gas Temperature Bank 1', shortName: 'EGT1',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'emissions',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
];

// ─── PID Preset Groups ──────────────────────────────────────────────────────

export interface PIDPreset {
  name: string;
  description: string;
  pids: number[];
}

export const PID_PRESETS: PIDPreset[] = [
  {
    name: 'Engine Basics',
    description: 'RPM, Speed, Coolant, Load, Throttle',
    pids: [0x0C, 0x0D, 0x05, 0x04, 0x11],
  },
  {
    name: 'Duramax Turbo',
    description: 'RPM, MAP/Boost, IAT, MAF, Barometric',
    pids: [0x0C, 0x0B, 0x0F, 0x10, 0x33],
  },
  {
    name: 'Fuel System',
    description: 'RPM, Fuel Rail Pressure, STFT, LTFT, Load',
    pids: [0x0C, 0x23, 0x06, 0x07, 0x04],
  },
  {
    name: 'Emissions',
    description: 'RPM, EGR Cmd, EGR Error, EGT, Catalyst Temp',
    pids: [0x0C, 0x2C, 0x2D, 0x78, 0x3C],
  },
  {
    name: 'Full Duramax',
    description: 'RPM, Boost, Rail Pressure, MAF, ECT, EGT, Load',
    pids: [0x0C, 0x0B, 0x23, 0x10, 0x05, 0x78, 0x04],
  },
  {
    name: 'Transmission',
    description: 'RPM, Speed, Gear, Coolant, Voltage',
    pids: [0x0C, 0x0D, 0xA4, 0x05, 0x42],
  },
];

// ─── OBD Connection Class ────────────────────────────────────────────────────

export class OBDConnection {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private buffer = '';
  private state: ConnectionState = 'disconnected';
  private config: Required<OBDConnectionConfig>;
  private listeners: Map<ConnectionEventType, EventCallback[]> = new Map();
  private loggingActive = false;
  private currentSession: LogSession | null = null;
  private supportedPids: Set<number> = new Set();
  private readLoopActive = false;
  private responseResolve: ((value: string) => void) | null = null;
  private responseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: OBDConnectionConfig = {}) {
    this.config = {
      baudRate: config.baudRate ?? 115200,
      protocol: config.protocol ?? '6',
      adaptiveTiming: config.adaptiveTiming ?? 2,
      echo: config.echo ?? false,
      headers: config.headers ?? false,
      spaces: config.spaces ?? false,
      lineFeeds: config.lineFeeds ?? false,
    };
  }

  // ─── Event System ────────────────────────────────────────────────────────

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

  // ─── WebSerial Connection ────────────────────────────────────────────────

  static isSupported(): boolean {
    return 'serial' in navigator;
  }

  async connect(): Promise<boolean> {
    if (!OBDConnection.isSupported()) {
      this.emit('error', null, 'WebSerial API is not supported in this browser. Use Chrome or Edge.');
      return false;
    }

    try {
      this.setState('connecting');
      this.emit('log', null, 'Requesting serial port...');

      // Request port with OBDLink USB vendor/product IDs
      this.port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x0403 },  // FTDI (common for OBDLink)
          { usbVendorId: 0x1A86 },  // CH340
          { usbVendorId: 0x10C4 },  // Silicon Labs CP210x
        ],
      });

      await this.port.open({
        baudRate: this.config.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });

      this.emit('log', null, `Serial port opened at ${this.config.baudRate} baud`);

      // Set up reader and writer
      if (this.port.readable && this.port.writable) {
        this.reader = this.port.readable.getReader();
        this.writer = this.port.writable.getWriter();
        this.startReadLoop();
      } else {
        throw new Error('Port is not readable/writable');
      }

      // Initialize the ELM327/STN device
      const initialized = await this.initialize();
      if (initialized) {
        this.setState('ready');
        this.emit('log', null, 'OBDLink device ready');
        return true;
      } else {
        this.setState('error');
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown connection error';
      this.emit('error', err, msg);
      this.setState('error');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.loggingActive = false;
    this.readLoopActive = false;

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      // Ignore close errors
    }

    this.buffer = '';
    this.setState('disconnected');
    this.emit('log', null, 'Disconnected');
  }

  // ─── Read Loop ───────────────────────────────────────────────────────────

  private startReadLoop(): void {
    this.readLoopActive = true;
    this.readLoop();
  }

  private async readLoop(): Promise<void> {
    while (this.readLoopActive && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) {
          this.readLoopActive = false;
          break;
        }
        if (value) {
          const text = this.decoder.decode(value, { stream: true });
          this.buffer += text;

          // Check if we have a complete response (ends with ">")
          if (this.buffer.includes('>')) {
            const response = this.buffer.substring(0, this.buffer.indexOf('>'));
            this.buffer = this.buffer.substring(this.buffer.indexOf('>') + 1);

            // Clean up the response
            const cleaned = response.replace(/[\r\n]+/g, '\n').trim();

            if (this.responseResolve) {
              if (this.responseTimeout) {
                clearTimeout(this.responseTimeout);
                this.responseTimeout = null;
              }
              this.responseResolve(cleaned);
              this.responseResolve = null;
            }
          }
        }
      } catch (err) {
        if (this.readLoopActive) {
          this.emit('error', err, 'Read error');
        }
        break;
      }
    }
  }

  // ─── Command Interface ───────────────────────────────────────────────────

  private async sendCommand(command: string, timeout = 5000): Promise<string> {
    if (!this.writer) throw new Error('Not connected');

    return new Promise<string>((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseTimeout = setTimeout(() => {
        this.responseResolve = null;
        reject(new Error(`Command timeout: ${command}`));
      }, timeout);

      const data = this.encoder.encode(command + '\r');
      this.writer!.write(data).catch(reject);
    });
  }

  private async sendAT(command: string, timeout = 3000): Promise<string> {
    const response = await this.sendCommand(command, timeout);
    // Strip echo if present
    const lines = response.split('\n').filter(l => l.trim().length > 0);
    // Remove the echo line (first line that matches the command)
    const result = lines.filter(l => !l.trim().startsWith(command.replace(/\s/g, ''))).join('\n');
    return result.trim() || lines[lines.length - 1]?.trim() || '';
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  private async initialize(): Promise<boolean> {
    this.setState('initializing');

    try {
      // Step 1: Reset device
      this.emit('log', null, 'Resetting device (ATZ)...');
      const resetResponse = await this.sendCommand('ATZ', 8000);
      this.emit('log', null, `Device: ${resetResponse}`);

      if (!resetResponse.toLowerCase().includes('elm327')) {
        this.emit('error', null, 'Device did not respond with ELM327 identifier');
        return false;
      }

      // Step 2: Echo off
      await this.sendAT('ATE0');
      this.emit('log', null, 'Echo off');

      // Step 3: Line feeds off
      await this.sendAT('ATL0');

      // Step 4: Spaces off (compact hex responses)
      await this.sendAT('ATS0');

      // Step 5: Headers off (simple response parsing)
      const headerCmd = this.config.headers ? 'ATH1' : 'ATH0';
      await this.sendAT(headerCmd);

      // Step 6: Adaptive timing
      await this.sendAT(`ATAT${this.config.adaptiveTiming}`);
      this.emit('log', null, `Adaptive timing: mode ${this.config.adaptiveTiming}`);

      // Step 7: Set protocol
      await this.sendAT(`ATSP${this.config.protocol}`);
      this.emit('log', null, `Protocol set to ${this.config.protocol}`);

      // Step 8: Get device info
      const deviceDesc = await this.sendAT('AT@1');
      this.emit('log', null, `Device: ${deviceDesc}`);

      // Step 9: Read voltage
      const voltage = await this.sendAT('ATRV');
      this.emit('log', null, `Battery voltage: ${voltage}`);

      // Step 10: Test connection - request supported PIDs
      this.emit('log', null, 'Testing vehicle connection...');
      const pidResponse = await this.sendCommand('0100', 10000);
      
      if (pidResponse.includes('UNABLE TO CONNECT') || pidResponse.includes('NO DATA')) {
        this.emit('error', null, 'Unable to connect to vehicle. Check ignition is ON.');
        return false;
      }

      if (pidResponse.includes('SEARCHING')) {
        this.emit('log', null, 'Auto-detecting protocol...');
      }

      // Parse supported PIDs from response
      this.parseSupportedPids(pidResponse, 0x00);

      // Request additional PID ranges if supported
      if (this.supportedPids.has(0x20)) {
        const resp20 = await this.sendCommand('0120', 5000);
        this.parseSupportedPids(resp20, 0x20);
      }
      if (this.supportedPids.has(0x40)) {
        const resp40 = await this.sendCommand('0140', 5000);
        this.parseSupportedPids(resp40, 0x40);
      }
      if (this.supportedPids.has(0x60)) {
        const resp60 = await this.sendCommand('0160', 5000);
        this.parseSupportedPids(resp60, 0x60);
      }

      // Get protocol description
      const protocolDesc = await this.sendAT('ATDPN');

      // Build vehicle info
      const vehicleInfo: VehicleInfo = {
        protocol: protocolDesc,
        protocolNumber: this.config.protocol,
        voltage: voltage,
        ecuCount: 1,
      };

      // Try to get VIN
      try {
        const vinResp = await this.sendCommand('0902', 8000);
        if (vinResp && !vinResp.includes('NO DATA') && !vinResp.includes('ERROR')) {
          vehicleInfo.vin = this.parseVin(vinResp);
        }
      } catch {
        // VIN not available, that's ok
      }

      this.emit('vehicleInfo', vehicleInfo);
      this.emit('log', null, `Supported PIDs: ${this.supportedPids.size}`);

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Initialization failed';
      this.emit('error', err, msg);
      return false;
    }
  }

  // ─── PID Parsing ─────────────────────────────────────────────────────────

  private parseSupportedPids(response: string, baseOffset: number): void {
    // Response format: "4100XXXXXXXX" (no spaces, no headers)
    const cleaned = response.replace(/[\r\n\s]/g, '');
    
    // Find the response data (after "41XX" where XX is the PID)
    const pidHex = baseOffset.toString(16).padStart(2, '0').toUpperCase();
    const marker = `41${pidHex}`;
    const idx = cleaned.indexOf(marker);
    
    if (idx === -1) return;
    
    const hexData = cleaned.substring(idx + marker.length, idx + marker.length + 8);
    if (hexData.length < 8) return;

    // Convert 4 hex bytes to 32 bits
    const bits = parseInt(hexData, 16);
    
    for (let i = 0; i < 32; i++) {
      if (bits & (1 << (31 - i))) {
        this.supportedPids.add(baseOffset + i + 1);
      }
    }
  }

  private parseVin(response: string): string {
    // VIN response can be multi-line for ISO 15765
    const cleaned = response.replace(/[\r\n\s]/g, '');
    // Remove "4902" prefix and count byte, extract ASCII
    const match = cleaned.match(/4902[0-9A-Fa-f]{2}([0-9A-Fa-f]+)/);
    if (!match) return '';
    
    const hexStr = match[1];
    let vin = '';
    for (let i = 0; i < hexStr.length; i += 2) {
      const charCode = parseInt(hexStr.substring(i, i + 2), 16);
      if (charCode >= 32 && charCode <= 126) {
        vin += String.fromCharCode(charCode);
      }
    }
    return vin;
  }

  getSupportedPids(): Set<number> {
    return new Set(this.supportedPids);
  }

  getAvailablePids(): PIDDefinition[] {
    return STANDARD_PIDS.filter(p => this.supportedPids.has(p.pid));
  }

  // ─── Single PID Request ──────────────────────────────────────────────────

  async readPid(pid: PIDDefinition): Promise<PIDReading | null> {
    const service = pid.service ?? 0x01;
    const command = `${service.toString(16).padStart(2, '0')}${pid.pid.toString(16).padStart(2, '0')}`;
    
    try {
      const response = await this.sendCommand(command, 3000);
      return this.parsePidResponse(pid, response);
    } catch {
      return null;
    }
  }

  // ─── Multi-PID Request (batch for speed) ─────────────────────────────────

  async readPids(pids: PIDDefinition[]): Promise<PIDReading[]> {
    const results: PIDReading[] = [];
    
    // CAN supports up to 6 PIDs per request in Service 01
    // Batch them for maximum throughput
    const batches: PIDDefinition[][] = [];
    let currentBatch: PIDDefinition[] = [];
    
    for (const pid of pids) {
      if ((pid.service ?? 0x01) !== 0x01) {
        // Non-service-01 PIDs must be requested individually
        batches.push([pid]);
        continue;
      }
      currentBatch.push(pid);
      if (currentBatch.length >= 6) {
        batches.push(currentBatch);
        currentBatch = [];
      }
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    for (const batch of batches) {
      if (batch.length === 1) {
        const reading = await this.readPid(batch[0]);
        if (reading) results.push(reading);
      } else {
        // Multi-PID request: "01 0C 0D 05 ..."
        const command = '01' + batch.map(p => p.pid.toString(16).padStart(2, '0')).join('');
        try {
          const response = await this.sendCommand(command, 5000);
          const readings = this.parseMultiPidResponse(batch, response);
          results.push(...readings);
        } catch {
          // Fall back to individual requests
          for (const pid of batch) {
            const reading = await this.readPid(pid);
            if (reading) results.push(reading);
          }
        }
      }
    }

    return results;
  }

  // ─── Response Parsing ────────────────────────────────────────────────────

  private parsePidResponse(pid: PIDDefinition, response: string): PIDReading | null {
    const cleaned = response.replace(/[\r\n\s]/g, '');
    
    if (cleaned.includes('NODATA') || cleaned.includes('ERROR')) {
      return null;
    }

    const service = pid.service ?? 0x01;
    const responseService = (service + 0x40).toString(16).padStart(2, '0').toUpperCase();
    const pidHex = pid.pid.toString(16).padStart(2, '0').toUpperCase();
    const marker = `${responseService}${pidHex}`;
    
    const idx = cleaned.toUpperCase().indexOf(marker);
    if (idx === -1) return null;

    const dataStart = idx + marker.length;
    const dataHex = cleaned.substring(dataStart, dataStart + pid.bytes * 2);
    
    if (dataHex.length < pid.bytes * 2) return null;

    const bytes: number[] = [];
    for (let i = 0; i < pid.bytes; i++) {
      bytes.push(parseInt(dataHex.substring(i * 2, i * 2 + 2), 16));
    }

    const value = pid.formula(bytes);

    return {
      pid: pid.pid,
      name: pid.name,
      shortName: pid.shortName,
      value: Math.round(value * 100) / 100,
      unit: pid.unit,
      rawBytes: bytes,
      timestamp: Date.now(),
    };
  }

  private parseMultiPidResponse(pids: PIDDefinition[], response: string): PIDReading[] {
    const results: PIDReading[] = [];
    
    // Multi-PID responses come as separate "41XX..." segments
    for (const pid of pids) {
      const reading = this.parsePidResponse(pid, response);
      if (reading) results.push(reading);
    }

    return results;
  }

  // ─── Datalogging ─────────────────────────────────────────────────────────

  async startLogging(
    pids: PIDDefinition[],
    intervalMs = 200,
    onData?: (readings: PIDReading[]) => void
  ): Promise<LogSession> {
    if (this.state !== 'ready') {
      throw new Error('Device must be in ready state to start logging');
    }

    const session: LogSession = {
      id: `log_${Date.now()}`,
      startTime: Date.now(),
      sampleRate: intervalMs,
      pids: [...pids],
      readings: new Map(),
    };

    // Initialize reading arrays
    for (const pid of pids) {
      session.readings.set(pid.pid, []);
    }

    this.currentSession = session;
    this.loggingActive = true;
    this.setState('logging');
    this.emit('log', null, `Logging started: ${pids.map(p => p.shortName).join(', ')} @ ${intervalMs}ms`);

    // Logging loop
    const logLoop = async () => {
      while (this.loggingActive) {
        const startTime = Date.now();
        
        try {
          const readings = await this.readPids(pids);
          
          // Store readings
          for (const reading of readings) {
            const arr = session.readings.get(reading.pid);
            if (arr) arr.push(reading);
          }

          // Emit data event
          this.emit('data', readings);
          if (onData) onData(readings);
        } catch (err) {
          this.emit('error', err, 'Logging read error');
        }

        // Wait for next interval
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, intervalMs - elapsed);
        if (waitTime > 0 && this.loggingActive) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
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

  // ─── DTC Reading ─────────────────────────────────────────────────────────

  async readDTCs(): Promise<string[]> {
    try {
      const response = await this.sendCommand('03', 10000);
      return this.parseDTCs(response);
    } catch {
      return [];
    }
  }

  async clearDTCs(): Promise<boolean> {
    try {
      const response = await this.sendCommand('04', 5000);
      return response.includes('44') || response.toUpperCase().includes('OK');
    } catch {
      return false;
    }
  }

  private parseDTCs(response: string): string[] {
    const cleaned = response.replace(/[\r\n\s]/g, '');
    const dtcs: string[] = [];

    if (cleaned.includes('NODATA')) return dtcs;

    // Remove "43" prefix
    const data = cleaned.replace(/43/g, '');
    
    // Each DTC is 2 bytes (4 hex chars)
    for (let i = 0; i < data.length - 3; i += 4) {
      const dtcHex = data.substring(i, i + 4);
      if (dtcHex === '0000') continue;
      
      const firstByte = parseInt(dtcHex.substring(0, 2), 16);
      const secondByte = parseInt(dtcHex.substring(2, 4), 16);
      
      // Decode DTC type
      const typeMap = ['P', 'C', 'B', 'U'];
      const type = typeMap[(firstByte >> 6) & 0x03];
      const digit1 = (firstByte >> 4) & 0x03;
      const digit2 = firstByte & 0x0F;
      const digit3 = (secondByte >> 4) & 0x0F;
      const digit4 = secondByte & 0x0F;
      
      dtcs.push(`${type}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`);
    }

    return dtcs;
  }

  // ─── Raw Command (for advanced users) ────────────────────────────────────

  async sendRawCommand(command: string, timeout = 5000): Promise<string> {
    return this.sendCommand(command, timeout);
  }
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

export function exportSessionToCSV(session: LogSession): string {
  const pids = session.pids;
  
  // Build header
  const header = ['Timestamp (ms)', 'Elapsed (s)', ...pids.map(p => `${p.shortName} (${p.unit})`)];
  const rows: string[] = [header.join(',')];

  // Find the maximum number of samples
  let maxSamples = 0;
  for (const pid of pids) {
    const readings = session.readings.get(pid.pid) || [];
    maxSamples = Math.max(maxSamples, readings.length);
  }

  // Build rows - align by sample index
  for (let i = 0; i < maxSamples; i++) {
    const values: (string | number)[] = [];
    let timestamp = 0;

    for (const pid of pids) {
      const readings = session.readings.get(pid.pid) || [];
      const reading = readings[i];
      if (reading) {
        if (values.length === 0) {
          timestamp = reading.timestamp;
          values.push(timestamp);
          values.push(((timestamp - session.startTime) / 1000).toFixed(3));
        }
        values.push(reading.value);
      } else {
        if (values.length === 0) {
          values.push('');
          values.push('');
        }
        values.push('');
      }
    }

    if (values.length > 0) {
      rows.push(values.join(','));
    }
  }

  return rows.join('\n');
}

// ─── Session to Analyzer Format ──────────────────────────────────────────────

export function sessionToAnalyzerCSV(session: LogSession): string {
  // Convert to HP Tuners-compatible CSV format for the existing analyzer
  const pids = session.pids;
  
  // HP Tuners format header
  const header = ['Time', ...pids.map(p => p.name)];
  const unitRow = ['s', ...pids.map(p => p.unit)];
  const rows: string[] = [header.join(','), unitRow.join(',')];

  let maxSamples = 0;
  for (const pid of pids) {
    const readings = session.readings.get(pid.pid) || [];
    maxSamples = Math.max(maxSamples, readings.length);
  }

  for (let i = 0; i < maxSamples; i++) {
    const values: (string | number)[] = [];
    let hasTimestamp = false;

    for (const pid of pids) {
      const readings = session.readings.get(pid.pid) || [];
      const reading = readings[i];
      if (reading && !hasTimestamp) {
        values.push(((reading.timestamp - session.startTime) / 1000).toFixed(3));
        hasTimestamp = true;
      }
      values.push(reading ? reading.value : '');
    }

    if (!hasTimestamp) {
      values.unshift(((i * session.sampleRate) / 1000).toFixed(3));
    }

    rows.push(values.join(','));
  }

  return rows.join('\n');
}
