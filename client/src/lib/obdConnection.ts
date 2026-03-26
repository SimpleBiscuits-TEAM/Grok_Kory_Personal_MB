/**
 * OBDLink EX WebSerial Communication Library
 * Implements ELM327/STN2xx command protocol for OBD-II datalogging.
 * 
 * Based on OBDLink Family Reference and Programming Manual (FRPM) Rev E.
 * Supports ISO 15765-4 CAN (11-bit/500k) for all OBD-II vehicles.
 * Universal PID database with standard Mode 01, manufacturer-specific Mode 22,
 * and automatic VIN-based vehicle identification.
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

export type PIDCategory = 
  | 'engine' | 'turbo' | 'transmission' | 'emissions' | 'fuel' | 'electrical'
  | 'exhaust' | 'def' | 'other'
  | 'oxygen' | 'catalyst' | 'evap' | 'ignition' | 'cooling' | 'intake';

export type PIDManufacturer = 'universal' | 'gm' | 'ford' | 'chrysler' | 'toyota' | 'honda' | 'nissan' | 'hyundai' | 'bmw';

export type FuelType = 'any' | 'gasoline' | 'diesel';

export interface PIDDefinition {
  pid: number;             // 1-byte PID for Mode 01, or 2-byte DID for Mode 22
  name: string;
  shortName: string;
  unit: string;
  min: number;
  max: number;
  formula: (bytes: number[]) => number;
  bytes: number;           // Expected response byte count (A, B, C, D)
  service?: number;        // Default: 0x01. Use 0x22 for extended PIDs
  category: PIDCategory;
  manufacturer?: PIDManufacturer;  // Default: 'universal' for Mode 01 PIDs
  fuelType?: FuelType;             // Default: 'any'. Helps filter gas vs diesel PIDs
  ecuHeader?: string;              // Custom ECU header for manufacturer-specific PIDs
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
  // Decoded VIN data
  make?: string;
  model?: string;
  year?: number;
  engineType?: string;
  fuelType?: FuelType;
  manufacturer?: PIDManufacturer;
  displacement?: string;
  cylinders?: number;
}

export type ConnectionEventType = 
  | 'stateChange' 
  | 'data' 
  | 'error' 
  | 'vehicleInfo' 
  | 'log'
  | 'scanProgress'
  | 'dtcRead'
  | 'dtcCleared';

export interface ConnectionEvent {
  type: ConnectionEventType;
  data?: unknown;
  message?: string;
  timestamp: number;
}

export interface ScanResult {
  pid: PIDDefinition;
  supported: boolean;
  sampleValue?: number;
  rawResponse?: string;
  error?: string;
}

export interface DIDScanReport {
  timestamp: number;
  duration: number;
  vehicleInfo?: VehicleInfo;
  standardSupported: ScanResult[];
  extendedSupported: ScanResult[];
  standardUnsupported: ScanResult[];
  extendedUnsupported: ScanResult[];
  totalScanned: number;
  totalSupported: number;
  autoPreset?: PIDPreset;
}

type EventCallback = (event: ConnectionEvent) => void;

// ─── PID Definitions ─────────────────────────────────────────────────────────

export const STANDARD_PIDS: PIDDefinition[] = [
  // ── Engine Core ──
  {
    pid: 0x04, name: 'Calculated Engine Load', shortName: 'LOAD',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT',
    unit: '°C', min: -40, max: 215, bytes: 1, category: 'cooling',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x0B, name: 'Intake Manifold Pressure (MAP)', shortName: 'MAP',
    unit: 'kPa', min: 0, max: 255, bytes: 1, category: 'intake',
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
    pid: 0x0E, name: 'Timing Advance', shortName: 'TIMING',
    unit: '°BTDC', min: -64, max: 63.5, bytes: 1, category: 'ignition',
    fuelType: 'gasoline',
    formula: ([a]) => (a / 2) - 64,
  },
  {
    pid: 0x0F, name: 'Intake Air Temperature', shortName: 'IAT',
    unit: '°C', min: -40, max: 215, bytes: 1, category: 'intake',
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
  {
    pid: 0x1C, name: 'OBD Standards Compliance', shortName: 'OBD_STD',
    unit: '', min: 0, max: 255, bytes: 1, category: 'other',
    formula: ([a]) => a,
  },
  {
    pid: 0x1F, name: 'Run Time Since Engine Start', shortName: 'RUN_TIME',
    unit: 's', min: 0, max: 65535, bytes: 2, category: 'engine',
    formula: ([a, b]) => (a * 256) + b,
  },
  {
    pid: 0x21, name: 'Distance with MIL On', shortName: 'MIL_DIST',
    unit: 'km', min: 0, max: 65535, bytes: 2, category: 'emissions',
    formula: ([a, b]) => (a * 256) + b,
  },
  // ── Fuel System ──
  {
    pid: 0x03, name: 'Fuel System Status', shortName: 'FUEL_SYS',
    unit: '', min: 0, max: 255, bytes: 2, category: 'fuel',
    formula: ([a]) => a,  // Bit-encoded: 1=OL, 2=CL, 4=OL-drive, 8=OL-fault, 16=CL-fault
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
    pid: 0x08, name: 'Short Term Fuel Trim (Bank 2)', shortName: 'STFT2',
    unit: '%', min: -100, max: 99.2, bytes: 1, category: 'fuel',
    fuelType: 'gasoline',
    formula: ([a]) => ((a - 128) * 100) / 128,
  },
  {
    pid: 0x09, name: 'Long Term Fuel Trim (Bank 2)', shortName: 'LTFT2',
    unit: '%', min: -100, max: 99.2, bytes: 1, category: 'fuel',
    fuelType: 'gasoline',
    formula: ([a]) => ((a - 128) * 100) / 128,
  },
  {
    pid: 0x0A, name: 'Fuel Pressure (gauge)', shortName: 'FP',
    unit: 'kPa', min: 0, max: 765, bytes: 1, category: 'fuel',
    formula: ([a]) => a * 3,
  },
  {
    pid: 0x22, name: 'Fuel Rail Pressure (relative)', shortName: 'FRP_R',
    unit: 'kPa', min: 0, max: 5177.265, bytes: 2, category: 'fuel',
    formula: ([a, b]) => ((a * 256) + b) * 0.079,
  },
  {
    pid: 0x23, name: 'Fuel Rail Gauge Pressure (diesel/GDI)', shortName: 'FRP',
    unit: 'kPa', min: 0, max: 655350, bytes: 2, category: 'fuel',
    formula: ([a, b]) => ((a * 256) + b) * 10,
  },
  {
    pid: 0x2E, name: 'Commanded EVAP Purge', shortName: 'EVAP_PCT',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'evap',
    fuelType: 'gasoline',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x2F, name: 'Fuel Tank Level Input', shortName: 'FUEL_LVL',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'fuel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x31, name: 'Distance Since Codes Cleared', shortName: 'CLR_DIST',
    unit: 'km', min: 0, max: 65535, bytes: 2, category: 'emissions',
    formula: ([a, b]) => (a * 256) + b,
  },
  {
    pid: 0x32, name: 'EVAP System Vapor Pressure', shortName: 'EVAP_VP',
    unit: 'Pa', min: -8192, max: 8191.75, bytes: 2, category: 'evap',
    fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.25,
  },
  // ── Intake / Turbo / Boost ──
  {
    pid: 0x33, name: 'Barometric Pressure', shortName: 'BARO',
    unit: 'kPa', min: 0, max: 255, bytes: 1, category: 'intake',
    formula: ([a]) => a,
  },
  {
    pid: 0x70, name: 'Boost Pressure Control', shortName: 'BOOST_CMD',
    unit: 'kPa', min: 0, max: 6513.75, bytes: 2, category: 'turbo',
    fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.03125,
  },
  // ── Oxygen Sensors (Gas Engine Essential) ──
  {
    pid: 0x14, name: 'O2 Sensor Voltage (Bank 1, Sensor 1)', shortName: 'O2_B1S1',
    unit: 'V', min: 0, max: 1.275, bytes: 2, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a]) => a / 200,  // First byte is voltage, second is STFT
  },
  {
    pid: 0x15, name: 'O2 Sensor Voltage (Bank 1, Sensor 2)', shortName: 'O2_B1S2',
    unit: 'V', min: 0, max: 1.275, bytes: 2, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a]) => a / 200,
  },
  {
    pid: 0x16, name: 'O2 Sensor Voltage (Bank 1, Sensor 3)', shortName: 'O2_B1S3',
    unit: 'V', min: 0, max: 1.275, bytes: 2, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a]) => a / 200,
  },
  {
    pid: 0x17, name: 'O2 Sensor Voltage (Bank 1, Sensor 4)', shortName: 'O2_B1S4',
    unit: 'V', min: 0, max: 1.275, bytes: 2, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a]) => a / 200,
  },
  {
    pid: 0x18, name: 'O2 Sensor Voltage (Bank 2, Sensor 1)', shortName: 'O2_B2S1',
    unit: 'V', min: 0, max: 1.275, bytes: 2, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a]) => a / 200,
  },
  {
    pid: 0x19, name: 'O2 Sensor Voltage (Bank 2, Sensor 2)', shortName: 'O2_B2S2',
    unit: 'V', min: 0, max: 1.275, bytes: 2, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a]) => a / 200,
  },
  {
    pid: 0x24, name: 'O2 Sensor Lambda (Bank 1, Sensor 1)', shortName: 'LAM_B1S1',
    unit: 'λ', min: 0, max: 2, bytes: 4, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a, b, c, d]) => ((a * 256 + b) * 2) / 65536,  // Equivalence ratio
  },
  {
    pid: 0x25, name: 'O2 Sensor Lambda (Bank 1, Sensor 2)', shortName: 'LAM_B1S2',
    unit: 'λ', min: 0, max: 2, bytes: 4, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a, b, c, d]) => ((a * 256 + b) * 2) / 65536,
  },
  {
    pid: 0x34, name: 'O2 Sensor Wideband (Bank 1, Sensor 1)', shortName: 'WB_B1S1',
    unit: 'λ', min: 0, max: 2, bytes: 4, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256 + b) * 2) / 65536,
  },
  {
    pid: 0x35, name: 'O2 Sensor Wideband (Bank 1, Sensor 2)', shortName: 'WB_B1S2',
    unit: 'λ', min: 0, max: 2, bytes: 4, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256 + b) * 2) / 65536,
  },
  {
    pid: 0x36, name: 'O2 Sensor Wideband (Bank 2, Sensor 1)', shortName: 'WB_B2S1',
    unit: 'λ', min: 0, max: 2, bytes: 4, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256 + b) * 2) / 65536,
  },
  {
    pid: 0x37, name: 'O2 Sensor Wideband (Bank 2, Sensor 2)', shortName: 'WB_B2S2',
    unit: 'λ', min: 0, max: 2, bytes: 4, category: 'oxygen',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256 + b) * 2) / 65536,
  },
  // ── Catalyst / Emissions ──
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
    pid: 0x3C, name: 'Catalyst Temperature (Bank 1, Sensor 1)', shortName: 'CAT_B1S1',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'catalyst',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
  {
    pid: 0x3D, name: 'Catalyst Temperature (Bank 2, Sensor 1)', shortName: 'CAT_B2S1',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'catalyst',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
  {
    pid: 0x3E, name: 'Catalyst Temperature (Bank 1, Sensor 2)', shortName: 'CAT_B1S2',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'catalyst',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
  {
    pid: 0x3F, name: 'Catalyst Temperature (Bank 2, Sensor 2)', shortName: 'CAT_B2S2',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'catalyst',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
  // ── Electrical ──
  {
    pid: 0x42, name: 'Control Module Voltage', shortName: 'VPWR',
    unit: 'V', min: 0, max: 65.535, bytes: 2, category: 'electrical',
    formula: ([a, b]) => ((a * 256) + b) / 1000,
  },
  {
    pid: 0x43, name: 'Absolute Load Value', shortName: 'ABS_LOAD',
    unit: '%', min: 0, max: 25700, bytes: 2, category: 'engine',
    formula: ([a, b]) => ((a * 256) + b) * 100 / 255,
  },
  {
    pid: 0x44, name: 'Commanded Equivalence Ratio', shortName: 'LAMBDA',
    unit: 'λ', min: 0, max: 2, bytes: 2, category: 'fuel',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) / 32768,
  },
  {
    pid: 0x45, name: 'Relative Throttle Position', shortName: 'REL_TPS',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x46, name: 'Ambient Air Temperature', shortName: 'AAT',
    unit: '°C', min: -40, max: 215, bytes: 1, category: 'intake',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x47, name: 'Absolute Throttle Position B', shortName: 'TPS_B',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x49, name: 'Accelerator Pedal Position D', shortName: 'APP_D',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x4A, name: 'Accelerator Pedal Position E', shortName: 'APP_E',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x4C, name: 'Commanded Throttle Actuator', shortName: 'TAC',
    unit: '%', min: 0, max: 100, bytes: 1, category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  // ── Transmission ──
  {
    pid: 0xA4, name: 'Transmission Actual Gear', shortName: 'GEAR',
    unit: '', min: 0, max: 10, bytes: 2, category: 'transmission',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
  },
  {
    pid: 0x5C, name: 'Engine Oil Temperature', shortName: 'EOT_STD',
    unit: '°C', min: -40, max: 210, bytes: 1, category: 'engine',
    formula: ([a]) => a - 40,
  },
  // ── Exhaust Gas Temperature (standard) ──
  {
    pid: 0x78, name: 'Exhaust Gas Temperature Bank 1', shortName: 'EGT1',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'exhaust',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
  {
    pid: 0x79, name: 'Exhaust Gas Temperature Bank 2', shortName: 'EGT2',
    unit: '°C', min: -40, max: 6513.5, bytes: 2, category: 'exhaust',
    fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) / 10 - 40,
  },
  // ── Misfire Monitoring (gas engine critical) ──
  {
    pid: 0x4D, name: 'Time Run with MIL On', shortName: 'MIL_TIME',
    unit: 'min', min: 0, max: 65535, bytes: 2, category: 'emissions',
    formula: ([a, b]) => (a * 256) + b,
  },
  {
    pid: 0x4E, name: 'Time Since Codes Cleared', shortName: 'CLR_TIME',
    unit: 'min', min: 0, max: 65535, bytes: 2, category: 'emissions',
    formula: ([a, b]) => (a * 256) + b,
  },
  // ── Secondary Air (gas engines) ──
  {
    pid: 0x12, name: 'Commanded Secondary Air Status', shortName: 'AIR_STAT',
    unit: '', min: 0, max: 255, bytes: 1, category: 'emissions',
    fuelType: 'gasoline',
    formula: ([a]) => a,  // Bit-encoded
  },
  // ── Fuel Injection Timing (diesel) ──
  {
    pid: 0x5D, name: 'Fuel Injection Timing', shortName: 'INJ_TMG_STD',
    unit: '°', min: -210, max: 301.992, bytes: 2, category: 'fuel',
    fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 26880) / 128,
  },
  {
    pid: 0x5E, name: 'Engine Fuel Rate', shortName: 'FUEL_RATE',
    unit: 'L/h', min: 0, max: 3276.75, bytes: 2, category: 'fuel',
    formula: ([a, b]) => ((a * 256) + b) * 0.05,
  },
];

// ─── PID Preset Groups ──────────────────────────────────────────────────────

export interface PIDPreset {
  id?: string;             // Unique ID for custom presets (undefined for built-in)
  name: string;
  description: string;
  pids: number[];
  isCustom?: boolean;      // true for user-created presets
  createdAt?: number;      // timestamp for custom presets
}

export const PID_PRESETS: PIDPreset[] = [
  // ── Universal Presets (work on any vehicle) ──
  {
    name: 'Engine Basics',
    description: 'RPM, Speed, Coolant, Load, Throttle',
    pids: [0x0C, 0x0D, 0x05, 0x04, 0x11],
  },
  {
    name: 'Fuel Trims',
    description: 'RPM, STFT/LTFT Bank 1 & 2, Lambda, Load',
    pids: [0x0C, 0x06, 0x07, 0x08, 0x09, 0x44, 0x04],
  },
  {
    name: 'Transmission',
    description: 'RPM, Speed, Gear, Coolant, Voltage',
    pids: [0x0C, 0x0D, 0xA4, 0x05, 0x42],
  },
  // ── Gas Engine Presets ──
  {
    name: 'Gas Engine Monitor',
    description: 'RPM, MAF, Timing, O2 B1S1, Fuel Trims, Load',
    pids: [0x0C, 0x10, 0x0E, 0x14, 0x06, 0x07, 0x04],
  },
  {
    name: 'O2 / Lambda Sensors',
    description: 'All O2 sensor voltages and wideband lambda',
    pids: [0x0C, 0x14, 0x15, 0x18, 0x19, 0x34, 0x35],
  },
  {
    name: 'Catalyst Efficiency',
    description: 'RPM, Catalyst temps, O2 pre/post cat, Lambda',
    pids: [0x0C, 0x3C, 0x3E, 0x14, 0x15, 0x44, 0x04],
  },
  {
    name: 'EVAP System',
    description: 'RPM, EVAP purge, vapor pressure, fuel level',
    pids: [0x0C, 0x2E, 0x32, 0x2F, 0x04],
  },
  // ── Diesel Engine Presets ──
  {
    name: 'Diesel Turbo/Boost',
    description: 'RPM, MAP/Boost, IAT, MAF, Barometric',
    pids: [0x0C, 0x0B, 0x0F, 0x10, 0x33],
  },
  {
    name: 'Diesel Fuel System',
    description: 'RPM, Fuel Rail Pressure, STFT, LTFT, Load',
    pids: [0x0C, 0x23, 0x06, 0x07, 0x04],
  },
  {
    name: 'Diesel Emissions',
    description: 'RPM, EGR Cmd, EGR Error, EGT, Catalyst Temp',
    pids: [0x0C, 0x2C, 0x2D, 0x78, 0x3C],
  },
  {
    name: 'Full Duramax',
    description: 'RPM, Boost, Rail Pressure, MAF, ECT, EGT, Load',
    pids: [0x0C, 0x0B, 0x23, 0x10, 0x05, 0x78, 0x04],
  },
  // ── Ford 6.2L Boss V8 (Raptor) Presets ──
  {
    name: 'Raptor 6.2L Boss Engine',
    description: 'RPM, Oil Temp/Press, CHT, Torque, Knock, VCT',
    pids: [0x0C, 0xF480, 0xF481, 0xF483, 0xF484, 0xF487, 0xF491],
  },
  {
    name: 'Raptor Knock & Misfire',
    description: 'RPM, Knock Retard Cyl 1-8, Misfire Counts',
    pids: [0x0C, 0xF489, 0xF48A, 0xF48B, 0xF48C, 0xF48D, 0xF48E, 0xF48F, 0xF490],
  },
  {
    name: 'Raptor 6R80 Transmission',
    description: 'RPM, Trans Temp, TC Slip, Gear, TCC Duty, Line Press',
    pids: [0x0C, 0xF4C0, 0xF4C1, 0xF4C5, 0xF4C7, 0xF4C4],
  },
  {
    name: 'Raptor VCT / Cam Timing',
    description: 'RPM, Intake/Exhaust Cam B1 & B2, Spark Advance',
    pids: [0x0C, 0xF491, 0xF492, 0xF493, 0xF494, 0xF486],
  },
  {
    name: 'Raptor Fuel System',
    description: 'RPM, Fuel Rail Press, Fuel Pump Duty, Pulse Width, ETC',
    pids: [0x0C, 0xF4B0, 0xF4B1, 0xF4B2, 0xF4B5, 0xF4B6],
  },
  // ── BMW XM Presets ──
  {
    name: 'BMW XM S68 Engine',
    description: 'RPM, Boost, Oil Temp/Press, Torque, VANOS, Knock',
    pids: [0xD00C, 0x11B1, 0x110A, 0x110B, 0x1124, 0x112C, 0x1140],
  },
  {
    name: 'BMW XM Hybrid System',
    description: 'HV SOC, HV Voltage/Current/Temp, Motor Torque/Speed, System Power',
    pids: [0x1400, 0x1401, 0x1402, 0x1403, 0x1405, 0x1406, 0x140B],
  },
  {
    name: 'BMW XM xDrive',
    description: 'Front/Rear Torque Split, Yaw Rate, Lat/Lon G, Steering Angle',
    pids: [0x1300, 0x1301, 0x1303, 0x1304, 0x1305, 0x130B],
  },
  {
    name: 'BMW XM ZF 8HP Trans',
    description: 'Trans Temp, TC Slip, Gear, Line Pressure, Mechatronic Temp',
    pids: [0x1200, 0x1201, 0x1205, 0x1204, 0x1207],
  },
  {
    name: 'BMW XM Suspension',
    description: 'Damper Currents FL/FR/RL/RR, Ride Heights, Roll/Pitch',
    pids: [0x1500, 0x1501, 0x1502, 0x1503, 0x1504, 0x1509, 0x150A],
  },
  {
    name: 'BMW XM Charging',
    description: 'SOC, Charging Status/Power, DC-DC Output, Cell Delta, EV Range',
    pids: [0x1400, 0x140D, 0x140E, 0x1408, 0x140F, 0x140C],
  },
];

// ─── GM Mode 22 Extended PIDs ─────────────────────────────────────────────
// These use UDS ReadDataByIdentifier (Service 0x22) with 2-byte DIDs.
// GM-specific parameters not available via standard OBD-II Mode 01.

export const GM_EXTENDED_PIDS: PIDDefinition[] = [
  // ── Fuel System (Diesel) ──
  {
    pid: 0x0564, name: 'Commanded Fuel Rail Pressure', shortName: 'FRP_CMD',
    unit: 'MPa', min: 0, max: 200, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.00390625,
  },
  {
    pid: 0x0565, name: 'Actual Fuel Rail Pressure', shortName: 'FRP_ACT',
    unit: 'MPa', min: 0, max: 200, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.00390625,
  },
  {
    pid: 0x054A, name: 'Fuel Rail Pressure Deviation', shortName: 'FRP_DEV',
    unit: 'MPa', min: -50, max: 50, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.00390625,
  },
  {
    pid: 0x056C, name: 'Fuel Injection Timing', shortName: 'INJ_TMG',
    unit: '°BTDC', min: -60, max: 60, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.0078125,
  },
  {
    pid: 0x056D, name: 'Fuel Injection Quantity', shortName: 'INJ_QTY',
    unit: 'mm³/stroke', min: 0, max: 200, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0x0549, name: 'Pressure Control Valve (PCV) Duty', shortName: 'PCV_DUTY',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x1940, name: 'Injector Balance Rate Cyl 1', shortName: 'IBR_1',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  {
    pid: 0x1941, name: 'Injector Balance Rate Cyl 2', shortName: 'IBR_2',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  {
    pid: 0x1942, name: 'Injector Balance Rate Cyl 3', shortName: 'IBR_3',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  {
    pid: 0x1943, name: 'Injector Balance Rate Cyl 4', shortName: 'IBR_4',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  {
    pid: 0x1944, name: 'Injector Balance Rate Cyl 5', shortName: 'IBR_5',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  {
    pid: 0x1945, name: 'Injector Balance Rate Cyl 6', shortName: 'IBR_6',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  {
    pid: 0x1946, name: 'Injector Balance Rate Cyl 7', shortName: 'IBR_7',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  {
    pid: 0x1947, name: 'Injector Balance Rate Cyl 8', shortName: 'IBR_8',
    unit: 'mm³', min: -10, max: 10, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
  },
  // ── Turbo / Boost ──
  {
    pid: 0x0572, name: 'Commanded Boost Pressure', shortName: 'BOOST_CMD',
    unit: 'kPa', min: 0, max: 400, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.0078125,
  },
  {
    pid: 0x0573, name: 'Actual Boost Pressure', shortName: 'BOOST_ACT',
    unit: 'kPa', min: 0, max: 400, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.0078125,
  },
  {
    pid: 0x0574, name: 'VGT Turbo Vane Position Commanded', shortName: 'VGT_CMD',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x0575, name: 'VGT Turbo Vane Position Actual', shortName: 'VGT_ACT',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x0576, name: 'Turbo Speed', shortName: 'TURBO_RPM',
    unit: 'rpm', min: 0, max: 300000, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 4,
  },
  {
    pid: 0x057A, name: 'Charge Air Cooler Outlet Temp', shortName: 'CAC_OUT',
    unit: '°C', min: -40, max: 215, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => a - 40,
  },
  // ── Exhaust / DPF ──
  {
    pid: 0x1A10, name: 'DPF Soot Load', shortName: 'DPF_SOOT',
    unit: 'g', min: 0, max: 100, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0x1A11, name: 'DPF Differential Pressure', shortName: 'DPF_DP',
    unit: 'kPa', min: 0, max: 100, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0x1A12, name: 'DPF Inlet Temperature', shortName: 'DPF_IN_T',
    unit: '°C', min: -40, max: 900, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
  },
  {
    pid: 0x1A13, name: 'DPF Outlet Temperature', shortName: 'DPF_OUT_T',
    unit: '°C', min: -40, max: 900, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
  },
  {
    pid: 0x1A14, name: 'DPF Regen Status', shortName: 'DPF_REGEN',
    unit: '', min: 0, max: 3, bytes: 1, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => a,  // 0=Not Active, 1=Requested, 2=Active, 3=Forced
  },
  {
    pid: 0x1A15, name: 'DPF Regen Count (lifetime)', shortName: 'DPF_REGEN_CT',
    unit: '', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (a * 256) + b,
  },
  {
    pid: 0x1A16, name: 'Distance Since Last DPF Regen', shortName: 'DPF_DIST',
    unit: 'km', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => (a * 256) + b,
  },
  {
    pid: 0x0580, name: 'EGT Bank 1 Sensor 1 (Pre-Turbo)', shortName: 'EGT_PRE',
    unit: '°C', min: -40, max: 900, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
  },
  {
    pid: 0x0581, name: 'EGT Bank 1 Sensor 2 (Post-Turbo)', shortName: 'EGT_POST',
    unit: '°C', min: -40, max: 900, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
  },
  // ── DEF / SCR ──
  {
    pid: 0x1A20, name: 'DEF Tank Level', shortName: 'DEF_LVL',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'def',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x1A21, name: 'DEF Tank Temperature', shortName: 'DEF_TEMP',
    unit: '°C', min: -40, max: 120, bytes: 1, service: 0x22, category: 'def',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x1A22, name: 'DEF Dosing Rate', shortName: 'DEF_DOSE',
    unit: 'mL/min', min: 0, max: 500, bytes: 2, service: 0x22, category: 'def',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0x1A23, name: 'SCR Inlet NOx', shortName: 'NOX_IN',
    unit: 'ppm', min: 0, max: 5000, bytes: 2, service: 0x22, category: 'def',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.05,
  },
  {
    pid: 0x1A24, name: 'SCR Outlet NOx', shortName: 'NOX_OUT',
    unit: 'ppm', min: 0, max: 5000, bytes: 2, service: 0x22, category: 'def',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.05,
  },
  {
    pid: 0x1A25, name: 'SCR Catalyst Temperature', shortName: 'SCR_TEMP',
    unit: '°C', min: -40, max: 900, bytes: 2, service: 0x22, category: 'def',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
  },
  {
    pid: 0x1A26, name: 'DEF Quality', shortName: 'DEF_QUAL',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'def',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  // ── EGR Extended ──
  {
    pid: 0x0590, name: 'EGR Mass Flow Rate', shortName: 'EGR_FLOW',
    unit: 'kg/h', min: 0, max: 500, bytes: 2, service: 0x22, category: 'emissions',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0x0591, name: 'EGR Cooler Bypass Position', shortName: 'EGR_BYP',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'emissions',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  // ── Transmission Extended ──
  {
    pid: 0x05A0, name: 'Transmission Fluid Temperature', shortName: 'TFT',
    unit: '°C', min: -40, max: 215, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x05A1, name: 'TCC Slip Speed', shortName: 'TCC_SLIP',
    unit: 'rpm', min: -1000, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768),
  },
  {
    pid: 0x05A2, name: 'Commanded TCC Pressure', shortName: 'TCC_CMD',
    unit: 'kPa', min: 0, max: 2500, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
  },
  {
    pid: 0x05A3, name: 'Transmission Output Speed', shortName: 'TRANS_OUT',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b),
  },
  {
    pid: 0x05A4, name: 'Transmission Input Speed', shortName: 'TRANS_IN',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b),
  },
  // ── Engine Extended ──
  {
    pid: 0x05B0, name: 'Engine Oil Temperature', shortName: 'EOT',
    unit: '°C', min: -40, max: 215, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x05B1, name: 'Engine Oil Pressure', shortName: 'EOP',
    unit: 'kPa', min: 0, max: 1000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
  },
  {
    pid: 0x05B2, name: 'Engine Oil Life Remaining', shortName: 'OIL_LIFE',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'gm', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x05B3, name: 'Fuel Filter Life Remaining', shortName: 'FUEL_FILT',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'gm', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
];

//// ─── Ford Mode 22 Extended PIDs ───────────────────────────────────────────
// Ford/Lincoln/Mercury vehicles (Powerstroke diesel + EcoBoost + Coyote/Modular)

export const FORD_EXTENDED_PIDS: PIDDefinition[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // Powerstroke Diesel (6.0L, 6.4L, 6.7L, 7.3L)
  // ══════════════════════════════════════════════════════════════════════════
  {
    pid: 0xF441, name: 'Injection Control Pressure', shortName: 'ICP',
    unit: 'psi', min: 0, max: 4000, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.0625,
  },
  {
    pid: 0xF442, name: 'Injection Pressure Regulator Duty', shortName: 'IPR_DUTY',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0xF443, name: 'Exhaust Back Pressure', shortName: 'EBP',
    unit: 'psi', min: 0, max: 100, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0xF444, name: 'Turbo Boost Pressure', shortName: 'BOOST_F',
    unit: 'psi', min: 0, max: 60, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0xF445, name: 'Turbo Vane Position', shortName: 'TVP',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0xF44A, name: 'DPF Soot Mass', shortName: 'DPF_SOOT_F',
    unit: 'g', min: 0, max: 100, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0xF44B, name: 'DPF Differential Pressure', shortName: 'DPF_DP_F',
    unit: 'kPa', min: 0, max: 100, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0xF44C, name: 'DEF Tank Level', shortName: 'DEF_LVL_F',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'def',
    manufacturer: 'ford', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  // ══════════════════════════════════════════════════════════════════════════
  // Ford 6.2L Boss V8 (2011-2014 F-150 Raptor, Super Duty)
  // PCM: 0x7E0/0x7E8, TCM: 0x7E1/0x7E9
  // ══════════════════════════════════════════════════════════════════════════
  // ── Engine Management ──
  {
    pid: 0xF480, name: 'Engine Oil Temperature (Boss)', shortName: 'EOT_BOSS',
    unit: '°C', min: -40, max: 215, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF481, name: 'Engine Oil Pressure (Boss)', shortName: 'EOP_BOSS',
    unit: 'psi', min: 0, max: 150, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.145038, // kPa to psi
    ecuHeader: '7E0',
  },
  {
    pid: 0xF482, name: 'Oil Pressure Control Duty Cycle', shortName: 'OPC_DUTY',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF483, name: 'Cylinder Head Temperature (Boss)', shortName: 'CHT_BOSS',
    unit: '°C', min: -40, max: 250, bytes: 2, service: 0x22, category: 'cooling',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF484, name: 'Calculated Engine Torque', shortName: 'TRQ_CALC',
    unit: 'Nm', min: 0, max: 800, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF485, name: 'Desired Engine Torque', shortName: 'TRQ_DES',
    unit: 'Nm', min: 0, max: 800, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF486, name: 'Spark Advance (Additional)', shortName: 'SPK_ADD',
    unit: '°', min: -20, max: 60, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a - 64,
    ecuHeader: '7E0',
  },
  // ── Knock Sensors (per-cylinder) ──
  {
    pid: 0xF487, name: 'Knock Sensor 1 (Boss)', shortName: 'KNK1_BOSS',
    unit: 'counts', min: 0, max: 255, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF488, name: 'Knock Sensor 2 (Boss)', shortName: 'KNK2_BOSS',
    unit: 'counts', min: 0, max: 255, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF489, name: 'Knock Retard Cyl 1', shortName: 'KR_C1',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF48A, name: 'Knock Retard Cyl 2', shortName: 'KR_C2',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF48B, name: 'Knock Retard Cyl 3', shortName: 'KR_C3',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF48C, name: 'Knock Retard Cyl 4', shortName: 'KR_C4',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF48D, name: 'Knock Retard Cyl 5', shortName: 'KR_C5',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF48E, name: 'Knock Retard Cyl 6', shortName: 'KR_C6',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF48F, name: 'Knock Retard Cyl 7', shortName: 'KR_C7',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF490, name: 'Knock Retard Cyl 8', shortName: 'KR_C8',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  // ── VCT (Variable Cam Timing) ──
  {
    pid: 0xF491, name: 'Intake Cam Position Bank 1', shortName: 'ICAM_B1',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF492, name: 'Intake Cam Position Bank 2', shortName: 'ICAM_B2',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF493, name: 'Exhaust Cam Position Bank 1', shortName: 'ECAM_B1',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF494, name: 'Exhaust Cam Position Bank 2', shortName: 'ECAM_B2',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  // ── Misfire Counters (per-cylinder) ──
  {
    pid: 0xF4A0, name: 'Misfire Count Cyl 1', shortName: 'MIS_C1',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4A1, name: 'Misfire Count Cyl 2', shortName: 'MIS_C2',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4A2, name: 'Misfire Count Cyl 3', shortName: 'MIS_C3',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4A3, name: 'Misfire Count Cyl 4', shortName: 'MIS_C4',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4A4, name: 'Misfire Count Cyl 5', shortName: 'MIS_C5',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4A5, name: 'Misfire Count Cyl 6', shortName: 'MIS_C6',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4A6, name: 'Misfire Count Cyl 7', shortName: 'MIS_C7',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4A7, name: 'Misfire Count Cyl 8', shortName: 'MIS_C8',
    unit: 'counts', min: 0, max: 65535, bytes: 2, service: 0x22, category: 'ignition',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  // ── Fuel System ──
  {
    pid: 0xF4B0, name: 'Commanded Fuel Rail Pressure (Boss)', shortName: 'FRP_CMD_B',
    unit: 'bar', min: 0, max: 200, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4B1, name: 'Fuel Pump Duty Cycle (Boss)', shortName: 'FP_DUTY_B',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4B2, name: 'Fuel Pulse Width Cyl 1', shortName: 'FPW_C1',
    unit: 'ms', min: 0, max: 50, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  // ── Throttle / ETC ──
  {
    pid: 0xF4B5, name: 'ETC Actual Position', shortName: 'ETC_ACT',
    unit: '%', min: 0, max: 100, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 100 / 65535,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4B6, name: 'ETC Desired Position', shortName: 'ETC_DES',
    unit: '%', min: 0, max: 100, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 100 / 65535,
    ecuHeader: '7E0',
  },
  // ── Transmission (6R80 in Raptor) ──
  {
    pid: 0xF4C0, name: 'Transmission Fluid Temp (6R80)', shortName: 'TFT_6R80',
    unit: '°C', min: -40, max: 215, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C1, name: 'Torque Converter Slip (6R80)', shortName: 'TCS_6R80',
    unit: 'rpm', min: -1000, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) - 32768,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C2, name: 'Turbine Shaft Speed', shortName: 'TSS_F',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C3, name: 'Output Shaft Speed', shortName: 'OSS_F',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C4, name: 'Line Pressure (6R80)', shortName: 'LP_6R80',
    unit: 'psi', min: 0, max: 400, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.145038,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C5, name: 'Current Gear (6R80)', shortName: 'GEAR_6R80',
    unit: '', min: 0, max: 6, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => a,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C6, name: 'Commanded Gear (6R80)', shortName: 'GCMD_6R80',
    unit: '', min: 0, max: 6, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => a,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C7, name: 'TCC Solenoid Duty Cycle', shortName: 'TCC_DUTY_F',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C8, name: 'Shift Solenoid A State', shortName: 'SS_A',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => a & 0x01,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4C9, name: 'Shift Solenoid B State', shortName: 'SS_B',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => a & 0x01,
    ecuHeader: '7E1',
  },
  {
    pid: 0xF4CA, name: 'Transmission Input Torque', shortName: 'TRQ_IN_F',
    unit: 'Nm', min: 0, max: 800, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E1',
  },
  // ── Electrical / Charging ──
  {
    pid: 0xF4D0, name: 'Alternator Field Duty Cycle', shortName: 'ALT_DUTY',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'electrical',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0xF4D1, name: 'Alternator Current', shortName: 'ALT_AMP',
    unit: 'A', min: 0, max: 250, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  // ── EcoBoost / Gas Turbo ──
  {
    pid: 0xF450, name: 'Boost Pressure (EcoBoost)', shortName: 'BOOST_EB',
    unit: 'psi', min: 0, max: 35, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0xF451, name: 'Wastegate Position', shortName: 'WG_POS',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0xF452, name: 'Direct Injection Fuel Pressure', shortName: 'DI_FP',
    unit: 'bar', min: 0, max: 200, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'ford', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  // ── Common Ford (all engines) ──
  {
    pid: 0xF460, name: 'Transmission Fluid Temp', shortName: 'TFT_F',
    unit: '°C', min: -40, max: 215, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0xF461, name: 'Transmission Torque Converter Slip', shortName: 'TC_SLIP_F',
    unit: 'rpm', min: -1000, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) - 32768,
  },
  {
    pid: 0xF470, name: 'Engine Oil Temperature', shortName: 'EOT_F',
    unit: '°C', min: -40, max: 215, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0xF471, name: 'Engine Oil Pressure', shortName: 'EOP_F',
    unit: 'kPa', min: 0, max: 1000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'ford', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
  },
];

// ─── Chrysler/Stellantis Mode 22 Extended PIDs ──────────────────────────
// Dodge/Ram/Jeep vehicles (Cummins diesel + HEMI gas)

export const CHRYSLER_EXTENDED_PIDS: PIDDefinition[] = [
  // ── Cummins Diesel ──
  {
    pid: 0xF101, name: 'Fuel Rail Pressure (Cummins)', shortName: 'FRP_CUM',
    unit: 'bar', min: 0, max: 2000, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'chrysler', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
  },
  {
    pid: 0xF102, name: 'Turbo Boost Pressure (Cummins)', shortName: 'BOOST_CUM',
    unit: 'psi', min: 0, max: 60, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'chrysler', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0xF103, name: 'DPF Soot Load (Cummins)', shortName: 'DPF_SOOT_C',
    unit: 'g', min: 0, max: 100, bytes: 2, service: 0x22, category: 'exhaust',
    manufacturer: 'chrysler', fuelType: 'diesel',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0xF104, name: 'DEF Tank Level (Cummins)', shortName: 'DEF_LVL_C',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'def',
    manufacturer: 'chrysler', fuelType: 'diesel',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0xF105, name: 'Exhaust Brake Status', shortName: 'EXH_BRK',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'exhaust',
    manufacturer: 'chrysler', fuelType: 'diesel',
    formula: ([a]) => a & 0x01,
  },
  // ── HEMI Gas ──
  {
    pid: 0xF110, name: 'MDS Cylinder Deactivation Status', shortName: 'MDS_STAT',
    unit: '', min: 0, max: 255, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'chrysler', fuelType: 'gasoline',
    formula: ([a]) => a,  // Bit-encoded: which cylinders are deactivated
  },
  {
    pid: 0xF111, name: 'Knock Retard (Bank 1)', shortName: 'KR_B1',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'chrysler', fuelType: 'gasoline',
    formula: ([a]) => a * 0.1,
  },
  {
    pid: 0xF112, name: 'Knock Retard (Bank 2)', shortName: 'KR_B2',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'chrysler', fuelType: 'gasoline',
    formula: ([a]) => a * 0.1,
  },
  {
    pid: 0xF120, name: 'Transmission Fluid Temp', shortName: 'TFT_C',
    unit: '°C', min: -40, max: 215, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'chrysler', fuelType: 'any',
    formula: ([a]) => a - 40,
  },
];

// ─── Toyota Mode 22 Extended PIDs ───────────────────────────────────────
// Toyota/Lexus vehicles (GR engines, hybrids, Tundra)

export const TOYOTA_EXTENDED_PIDS: PIDDefinition[] = [
  {
    pid: 0x2101, name: 'Knock Correction Advance', shortName: 'KCA',
    unit: '°', min: -20, max: 20, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'toyota', fuelType: 'gasoline',
    formula: ([a]) => (a - 128) * 0.5,
  },
  {
    pid: 0x2102, name: 'VVT-i Intake Cam Advance', shortName: 'VVT_IN',
    unit: '°CA', min: -50, max: 50, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'toyota', fuelType: 'gasoline',
    formula: ([a]) => (a - 128) * 0.5,
  },
  {
    pid: 0x2103, name: 'VVT-i Exhaust Cam Advance', shortName: 'VVT_EX',
    unit: '°CA', min: -50, max: 50, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'toyota', fuelType: 'gasoline',
    formula: ([a]) => (a - 128) * 0.5,
  },
  {
    pid: 0x2104, name: 'Ignition Timing Advance', shortName: 'IGN_ADV_T',
    unit: '°BTDC', min: -64, max: 63.5, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'toyota', fuelType: 'gasoline',
    formula: ([a]) => (a / 2) - 64,
  },
  {
    pid: 0x2110, name: 'A/F Sensor Current (Bank 1)', shortName: 'AFS_B1',
    unit: 'mA', min: -128, max: 128, bytes: 2, service: 0x22, category: 'oxygen',
    manufacturer: 'toyota', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
  },
  {
    pid: 0x2120, name: 'Hybrid Battery SOC', shortName: 'HV_SOC',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'electrical',
    manufacturer: 'toyota', fuelType: 'gasoline',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x2121, name: 'Hybrid Battery Voltage', shortName: 'HV_VOLT',
    unit: 'V', min: 0, max: 500, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'toyota', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
  },
];

// ─── Honda Mode 22 Extended PIDs ────────────────────────────────────────
// Honda/Acura vehicles (VTEC, i-VTEC, turbo)

export const HONDA_EXTENDED_PIDS: PIDDefinition[] = [
  {
    pid: 0x3001, name: 'VTEC Solenoid Status', shortName: 'VTEC',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'honda', fuelType: 'gasoline',
    formula: ([a]) => a & 0x01,
  },
  {
    pid: 0x3002, name: 'VTC Intake Cam Angle', shortName: 'VTC_IN',
    unit: '°CA', min: -50, max: 50, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'honda', fuelType: 'gasoline',
    formula: ([a]) => (a - 128) * 0.5,
  },
  {
    pid: 0x3003, name: 'Knock Retard', shortName: 'KR_H',
    unit: '°', min: 0, max: 25, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'honda', fuelType: 'gasoline',
    formula: ([a]) => a * 0.1,
  },
  {
    pid: 0x3010, name: 'Turbo Boost (1.5T/2.0T)', shortName: 'BOOST_H',
    unit: 'psi', min: 0, max: 30, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'honda', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
  },
  {
    pid: 0x3011, name: 'Wastegate Duty Cycle', shortName: 'WG_DUTY_H',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'honda', fuelType: 'gasoline',
    formula: ([a]) => (a * 100) / 255,
  },
];

// ─── BMW UDS Extended PIDs ────────────────────────────────────────────────
// BMW vehicles using UDS (Unified Diagnostic Services) protocol
// Multi-ECU addressing: DME/DDE (0x7E0), EGS (0x7E1), DSC (0x7B0),
// ICM (0x720), EME (0x7E2), SME (0x607)

export const BMW_EXTENDED_PIDS: PIDDefinition[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // DME/DDE Engine Management (ECU: 0x7E0/0x7E8)
  // S68 4.4L V8 Twin-Turbo (XM), B58 3.0L I6 (M340i), S58 (X3M/X4M)
  // ══════════════════════════════════════════════════════════════════════════
  {
    pid: 0xD004, name: 'Engine Load (BMW)', shortName: 'LOAD_BMW',
    unit: '%', min: 0, max: 100, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 100 / 65535,
    ecuHeader: '7E0',
  },
  {
    pid: 0xD005, name: 'Engine Coolant Temp (BMW)', shortName: 'ECT_BMW',
    unit: '°C', min: -40, max: 215, bytes: 1, service: 0x22, category: 'cooling',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a - 40,
    ecuHeader: '7E0',
  },
  {
    pid: 0xD00B, name: 'Intake Manifold Pressure (BMW)', shortName: 'MAP_BMW',
    unit: 'kPa', min: 0, max: 400, bytes: 2, service: 0x22, category: 'intake',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0xD00C, name: 'Engine RPM (BMW Enhanced)', shortName: 'RPM_BMW',
    unit: 'rpm', min: 0, max: 8000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) / 4,
    ecuHeader: '7E0',
  },
  {
    pid: 0xD00E, name: 'Ignition Timing Advance (BMW)', shortName: 'IGN_BMW',
    unit: '°', min: -20, max: 60, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a]) => (a / 2) - 64,
    ecuHeader: '7E0',
  },
  {
    pid: 0xD00F, name: 'Intake Air Temperature (BMW)', shortName: 'IAT_BMW',
    unit: '°C', min: -40, max: 100, bytes: 1, service: 0x22, category: 'intake',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a - 40,
    ecuHeader: '7E0',
  },
  {
    pid: 0xD010, name: 'Mass Air Flow (BMW)', shortName: 'MAF_BMW',
    unit: 'g/s', min: 0, max: 700, bytes: 2, service: 0x22, category: 'intake',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) / 100,
    ecuHeader: '7E0',
  },
  {
    pid: 0xD011, name: 'Throttle Position (BMW)', shortName: 'TPS_BMW',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7E0',
  },
  // ── Engine Oil & Cooling ──
  {
    pid: 0x110A, name: 'Engine Oil Temperature (BMW)', shortName: 'EOT_BMW',
    unit: '°C', min: -40, max: 200, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E0',
  },
  {
    pid: 0x110B, name: 'Engine Oil Pressure (BMW)', shortName: 'EOP_BMW',
    unit: 'bar', min: 0, max: 10, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x1109, name: 'Cylinder Head Temperature (BMW)', shortName: 'CHT_BMW',
    unit: '°C', min: -40, max: 250, bytes: 2, service: 0x22, category: 'cooling',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E0',
  },
  {
    pid: 0x1105, name: 'Engine Coolant Temp Enhanced (BMW)', shortName: 'ECT_ENH_BMW',
    unit: '°C', min: -40, max: 215, bytes: 2, service: 0x22, category: 'cooling',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E0',
  },
  // ── Torque ──
  {
    pid: 0x1124, name: 'Actual Engine Torque (BMW)', shortName: 'TRQ_ACT_BMW',
    unit: 'Nm', min: 0, max: 1000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0x1125, name: 'Desired Engine Torque (BMW)', shortName: 'TRQ_DES_BMW',
    unit: 'Nm', min: 0, max: 1000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  // ── VANOS (Variable Valve Timing) ──
  {
    pid: 0x112C, name: 'VANOS Intake Position Bank 1', shortName: 'VAN_IN_B1',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  {
    pid: 0x112D, name: 'VANOS Intake Position Bank 2', shortName: 'VAN_IN_B2',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  {
    pid: 0x112E, name: 'VANOS Exhaust Position Bank 1', shortName: 'VAN_EX_B1',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  {
    pid: 0x112F, name: 'VANOS Exhaust Position Bank 2', shortName: 'VAN_EX_B2',
    unit: '°CA', min: -50, max: 50, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.02,
    ecuHeader: '7E0',
  },
  // ── Valvetronic ──
  {
    pid: 0x11A0, name: 'Valvetronic Lift', shortName: 'VLIFT_BMW',
    unit: 'mm', min: 0, max: 10, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x11A1, name: 'Valvetronic Motor Position', shortName: 'VMOT_BMW',
    unit: 'steps', min: 0, max: 255, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a]) => a,
    ecuHeader: '7E0',
  },
  // ── Turbo (S68 Twin-Turbo / B58 Single-Turbo) ──
  {
    pid: 0x11B0, name: 'Wastegate Position (BMW)', shortName: 'WG_BMW',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x11B1, name: 'Actual Boost Pressure (BMW)', shortName: 'BOOST_ACT_BMW',
    unit: 'psi', min: 0, max: 35, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) * 0.296 - 1000) / 1000 * 14.5038,
    ecuHeader: '7E0',
  },
  {
    pid: 0x11B2, name: 'Target Boost Pressure (BMW)', shortName: 'BOOST_TGT_BMW',
    unit: 'psi', min: 0, max: 35, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) * 0.296 - 1000) / 1000 * 14.5038,
    ecuHeader: '7E0',
  },
  {
    pid: 0x11B3, name: 'Charge Air Cooler Temp (BMW)', shortName: 'CAC_BMW',
    unit: '°C', min: -40, max: 120, bytes: 1, service: 0x22, category: 'intake',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a - 40,
    ecuHeader: '7E0',
  },
  // ── Knock Sensors ──
  {
    pid: 0x1140, name: 'Knock Sensor 1 (BMW)', shortName: 'KNK1_BMW',
    unit: 'counts', min: 0, max: 255, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a]) => a,
    ecuHeader: '7E0',
  },
  {
    pid: 0x1141, name: 'Knock Sensor 2 (BMW)', shortName: 'KNK2_BMW',
    unit: 'counts', min: 0, max: 255, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a]) => a,
    ecuHeader: '7E0',
  },
  // ── Fuel System (Direct Injection) ──
  {
    pid: 0x1160, name: 'Fuel Rail Pressure (BMW)', shortName: 'FRP_BMW',
    unit: 'bar', min: 0, max: 350, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0x1161, name: 'Commanded Fuel Rail Pressure (BMW)', shortName: 'FRP_CMD_BMW',
    unit: 'bar', min: 0, max: 350, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0x1190, name: 'Fuel Pump Duty Cycle (BMW)', shortName: 'FP_DUTY_BMW',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x1170, name: 'Spark Advance (BMW)', shortName: 'SPK_BMW',
    unit: '°', min: -20, max: 60, bytes: 1, service: 0x22, category: 'ignition',
    manufacturer: 'bmw', fuelType: 'gasoline',
    formula: ([a]) => (a / 2) - 64,
    ecuHeader: '7E0',
  },
  // ── Ambient ──
  {
    pid: 0xD146, name: 'Ambient Air Temperature (BMW)', shortName: 'AAT_BMW',
    unit: '°C', min: -40, max: 60, bytes: 1, service: 0x22, category: 'intake',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a - 40,
    ecuHeader: '7E0',
  },
  // ══════════════════════════════════════════════════════════════════════════
  // EGS Transmission (ZF 8HP) (ECU: 0x7E1/0x7E9)
  // ══════════════════════════════════════════════════════════════════════════
  {
    pid: 0x1200, name: 'Transmission Fluid Temp (BMW)', shortName: 'TFT_BMW',
    unit: '°C', min: -40, max: 200, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1201, name: 'Torque Converter Slip (BMW)', shortName: 'TCS_BMW',
    unit: 'rpm', min: -1000, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) - 32768,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1202, name: 'Turbine Speed (BMW)', shortName: 'TSS_BMW',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1203, name: 'Output Shaft Speed (BMW)', shortName: 'OSS_BMW',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1204, name: 'Line Pressure (ZF 8HP)', shortName: 'LP_ZF8HP',
    unit: 'bar', min: 0, max: 30, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1205, name: 'Current Gear (BMW)', shortName: 'GEAR_BMW',
    unit: '', min: 0, max: 8, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1206, name: 'Target Gear (BMW)', shortName: 'GTGT_BMW',
    unit: '', min: 0, max: 8, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1207, name: 'Mechatronic Temperature (BMW)', shortName: 'MECH_T_BMW',
    unit: '°C', min: -40, max: 200, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E1',
  },
  {
    pid: 0x1208, name: 'Transmission Input Torque (BMW)', shortName: 'TRQ_IN_BMW',
    unit: 'Nm', min: 0, max: 1000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E1',
  },
  {
    pid: 0x120A, name: 'Adaptive Shift Quality Index', shortName: 'SQ_IDX_BMW',
    unit: '', min: 0, max: 100, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a,
    ecuHeader: '7E1',
  },
  // ══════════════════════════════════════════════════════════════════════════
  // DSC / xDrive (ECU: 0x7B0/0x7B8)
  // ══════════════════════════════════════════════════════════════════════════
  {
    pid: 0x1300, name: 'Front Axle Torque Distribution', shortName: 'FAXLE_TRQ',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1301, name: 'Rear Axle Torque Distribution', shortName: 'RAXLE_TRQ',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1302, name: 'Transfer Case Clutch Engagement', shortName: 'XFER_CLT',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => (a * 100) / 255,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1303, name: 'Yaw Rate (BMW)', shortName: 'YAW_BMW',
    unit: '°/s', min: -100, max: 100, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1304, name: 'Lateral Acceleration (BMW)', shortName: 'LAT_G_BMW',
    unit: 'g', min: -2, max: 2, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1305, name: 'Longitudinal Acceleration (BMW)', shortName: 'LON_G_BMW',
    unit: 'g', min: -2, max: 2, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.001,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1306, name: 'Wheel Speed FL (BMW)', shortName: 'WS_FL_BMW',
    unit: 'km/h', min: 0, max: 300, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1307, name: 'Wheel Speed FR (BMW)', shortName: 'WS_FR_BMW',
    unit: 'km/h', min: 0, max: 300, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1308, name: 'Wheel Speed RL (BMW)', shortName: 'WS_RL_BMW',
    unit: 'km/h', min: 0, max: 300, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1309, name: 'Wheel Speed RR (BMW)', shortName: 'WS_RR_BMW',
    unit: 'km/h', min: 0, max: 300, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7B0',
  },
  {
    pid: 0x130A, name: 'Brake Pressure (BMW)', shortName: 'BRK_P_BMW',
    unit: 'bar', min: 0, max: 200, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7B0',
  },
  {
    pid: 0x130B, name: 'Steering Angle (BMW)', shortName: 'STR_ANG_BMW',
    unit: '°', min: -720, max: 720, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '7B0',
  },
  // ══════════════════════════════════════════════════════════════════════════
  // EME/SME Hybrid System (XM PHEV) (ECU: 0x7E2/0x7EA, 0x607/0x60F)
  // ══════════════════════════════════════════════════════════════════════════
  {
    pid: 0x1400, name: 'HV Battery State of Charge', shortName: 'HV_SOC',
    unit: '%', min: 0, max: 100, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '607',
  },
  {
    pid: 0x1401, name: 'HV Battery Voltage', shortName: 'HV_VOLT_BMW',
    unit: 'V', min: 0, max: 500, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '607',
  },
  {
    pid: 0x1402, name: 'HV Battery Current', shortName: 'HV_AMP_BMW',
    unit: 'A', min: -500, max: 500, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '607',
  },
  {
    pid: 0x1403, name: 'HV Battery Temperature', shortName: 'HV_TEMP_BMW',
    unit: '°C', min: -40, max: 80, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '607',
  },
  {
    pid: 0x1404, name: 'Electric Motor Temperature', shortName: 'EMOT_T_BMW',
    unit: '°C', min: -40, max: 200, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E2',
  },
  {
    pid: 0x1405, name: 'Electric Motor Torque', shortName: 'EMOT_TRQ',
    unit: 'Nm', min: -500, max: 500, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '7E2',
  },
  {
    pid: 0x1406, name: 'Electric Motor Speed', shortName: 'EMOT_RPM',
    unit: 'rpm', min: 0, max: 20000, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E2',
  },
  {
    pid: 0x1407, name: 'Inverter Temperature', shortName: 'INV_T_BMW',
    unit: '°C', min: -40, max: 150, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 - 40,
    ecuHeader: '7E2',
  },
  {
    pid: 0x1408, name: 'DC-DC Converter Output Voltage', shortName: 'DCDC_V_BMW',
    unit: 'V', min: 0, max: 16, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '607',
  },
  {
    pid: 0x1409, name: 'DC-DC Converter Output Current', shortName: 'DCDC_A_BMW',
    unit: 'A', min: 0, max: 250, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '607',
  },
  {
    pid: 0x140A, name: 'Regenerative Braking Torque', shortName: 'REGEN_TRQ',
    unit: 'Nm', min: 0, max: 300, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E2',
  },
  {
    pid: 0x140B, name: 'Combined System Power', shortName: 'SYS_PWR_BMW',
    unit: 'kW', min: 0, max: 750, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E2',
  },
  {
    pid: 0x140C, name: 'Electric Range Remaining', shortName: 'EV_RANGE',
    unit: 'km', min: 0, max: 100, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '607',
  },
  {
    pid: 0x140D, name: 'Charging Status', shortName: 'CHG_STAT',
    unit: '', min: 0, max: 5, bytes: 1, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a]) => a,  // 0=Not charging, 1=AC L1, 2=AC L2, 3=DC Fast, 4=Complete
    ecuHeader: '607',
  },
  {
    pid: 0x140E, name: 'Charging Power', shortName: 'CHG_PWR',
    unit: 'kW', min: 0, max: 200, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '607',
  },
  {
    pid: 0x140F, name: 'Cell Voltage Min/Max Delta', shortName: 'CELL_DELTA',
    unit: 'mV', min: 0, max: 500, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '607',
  },
  // ══════════════════════════════════════════════════════════════════════════
  // Active Suspension (Adaptive M Suspension / Air Suspension)
  // ══════════════════════════════════════════════════════════════════════════
  {
    pid: 0x1500, name: 'Front Left Damper Current', shortName: 'DAMP_FL',
    unit: 'A', min: 0, max: 5, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1501, name: 'Front Right Damper Current', shortName: 'DAMP_FR',
    unit: 'A', min: 0, max: 5, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1502, name: 'Rear Left Damper Current', shortName: 'DAMP_RL',
    unit: 'A', min: 0, max: 5, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1503, name: 'Rear Right Damper Current', shortName: 'DAMP_RR',
    unit: 'A', min: 0, max: 5, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1504, name: 'Ride Height FL', shortName: 'RH_FL_BMW',
    unit: 'mm', min: -50, max: 50, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1505, name: 'Ride Height FR', shortName: 'RH_FR_BMW',
    unit: 'mm', min: -50, max: 50, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1506, name: 'Ride Height RL', shortName: 'RH_RL_BMW',
    unit: 'mm', min: -50, max: 50, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1507, name: 'Ride Height RR', shortName: 'RH_RR_BMW',
    unit: 'mm', min: -50, max: 50, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '7B0',
  },
  {
    pid: 0x1509, name: 'Body Roll Angle', shortName: 'ROLL_BMW',
    unit: '°', min: -10, max: 10, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7B0',
  },
  {
    pid: 0x150A, name: 'Body Pitch Angle', shortName: 'PITCH_BMW',
    unit: '°', min: -10, max: 10, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'bmw', fuelType: 'any',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7B0',
  },
];

// ─── Manufacturer PID Collections ─────────────────────────────────────

export const MANUFACTURER_PIDS: Record<PIDManufacturer, PIDDefinition[]> = {
  universal: [],  // Standard PIDs are universal
  gm: GM_EXTENDED_PIDS,
  ford: FORD_EXTENDED_PIDS,
  chrysler: CHRYSLER_EXTENDED_PIDS,
  toyota: TOYOTA_EXTENDED_PIDS,
  honda: HONDA_EXTENDED_PIDS,
  nissan: [],  // Placeholder for future expansion
  hyundai: [],  // Placeholder for future expansion
  bmw: BMW_EXTENDED_PIDS,
};

// ─── Combined PID List (all available PIDs) ───────────────────────────────

export const ALL_PIDS: PIDDefinition[] = [
  ...STANDARD_PIDS,
  ...GM_EXTENDED_PIDS,
  ...FORD_EXTENDED_PIDS,
  ...CHRYSLER_EXTENDED_PIDS,
  ...TOYOTA_EXTENDED_PIDS,
  ...HONDA_EXTENDED_PIDS,
  ...BMW_EXTENDED_PIDS,
];

// ─── Custom Preset Management ───────────────────────────────────────────────

const CUSTOM_PRESETS_KEY = 'ppei_custom_presets';

export function loadCustomPresets(): PIDPreset[] {
  try {
    const stored = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map((p: PIDPreset) => ({ ...p, isCustom: true })) : [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: PIDPreset[]): void {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

export function createCustomPreset(name: string, description: string, pids: number[]): PIDPreset {
  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name,
    description,
    pids,
    isCustom: true,
    createdAt: Date.now(),
  };
}

export function deleteCustomPreset(presets: PIDPreset[], presetId: string): PIDPreset[] {
  const updated = presets.filter(p => p.id !== presetId);
  saveCustomPresets(updated);
  return updated;
}

export function updateCustomPreset(
  presets: PIDPreset[],
  presetId: string,
  updates: Partial<Pick<PIDPreset, 'name' | 'description' | 'pids'>>
): PIDPreset[] {
  const updated = presets.map(p => {
    if (p.id !== presetId) return p;
    return { ...p, ...updates };
  });
  saveCustomPresets(updated);
  return updated;
}

export function getAllPresets(): PIDPreset[] {
  return [...PID_PRESETS, ...loadCustomPresets()];
}

// ─── PID Lookup Helpers ─────────────────────────────────────────────────────

export function findPidByNumber(pid: number): PIDDefinition | undefined {
  return ALL_PIDS.find(p => p.pid === pid);
}

export function getPidsByCategory(category: PIDDefinition['category']): PIDDefinition[] {
  return ALL_PIDS.filter(p => p.category === category);
}

export function getMode22Pids(): PIDDefinition[] {
  return ALL_PIDS.filter(p => (p.service ?? 0x01) === 0x22);
}

export function getMode01Pids(): PIDDefinition[] {
  return STANDARD_PIDS;
}

export function getPidsByManufacturer(manufacturer: PIDManufacturer): PIDDefinition[] {
  if (manufacturer === 'universal') return STANDARD_PIDS;
  return MANUFACTURER_PIDS[manufacturer] || [];
}

export function getPidsForVehicle(manufacturer: PIDManufacturer, fuelType: FuelType): PIDDefinition[] {
  // Standard PIDs filtered by fuel type
  const stdPids = STANDARD_PIDS.filter(p => {
    const pFuel = p.fuelType ?? 'any';
    if (pFuel === 'any') return true;
    if (fuelType === 'any') return true;
    return pFuel === fuelType;
  });

  // Manufacturer-specific extended PIDs filtered by fuel type
  const extPids = (MANUFACTURER_PIDS[manufacturer] || []).filter(p => {
    const pFuel = p.fuelType ?? 'any';
    if (pFuel === 'any') return true;
    if (fuelType === 'any') return true;
    return pFuel === fuelType;
  });

  return [...stdPids, ...extPids];
}

export function getPresetsForVehicle(manufacturer: PIDManufacturer, fuelType: FuelType): PIDPreset[] {
  return PID_PRESETS.filter(preset => {
    const name = preset.name.toLowerCase();
    // Universal presets always show
    if (name.includes('engine basics') || name.includes('transmission') || name.includes('fuel trims')) return true;
    // Manufacturer-specific presets
    if (manufacturer === 'ford' || manufacturer === 'universal') {
      if (name.includes('raptor')) return true;
    }
    if (manufacturer === 'bmw' || manufacturer === 'universal') {
      if (name.includes('bmw') || name.includes('xm')) return true;
    }
    if (manufacturer === 'gm' || manufacturer === 'universal') {
      if (name.includes('duramax')) return true;
    }
    // Gas-specific presets
    if (fuelType === 'gasoline' || fuelType === 'any') {
      if (name.includes('gas') || name.includes('o2') || name.includes('lambda') ||
          name.includes('catalyst') || name.includes('evap') || name.includes('fuel trim')) return true;
    }
    // Diesel-specific presets
    if (fuelType === 'diesel' || fuelType === 'any') {
      if (name.includes('diesel') || name.includes('duramax') || name.includes('dpf') ||
          name.includes('def') || name.includes('turbo')) return true;
    }
    return false;
  });
}

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

  // Baud rates to try during auto-detection.
  // OBDLink EX USB typically uses 115200 or 500000.
  // Other ELM327 clones may use 38400 or 9600.
  private static readonly BAUD_RATES = [115200, 500000, 38400, 9600, 230400, 1000000];

  async connect(): Promise<boolean> {
    if (!OBDConnection.isSupported()) {
      this.emit('error', null, 'WebSerial API is not supported in this browser. Use Chrome or Edge.');
      return false;
    }

    try {
      this.setState('connecting');
      this.emit('log', null, 'Requesting serial port... (select your OBDLink device)');

      // Show ALL available serial ports — no vendor ID filtering.
      this.port = await navigator.serial.requestPort();

      // Log USB device info if available for debugging
      const info = this.port.getInfo();
      if (info.usbVendorId !== undefined) {
        this.emit('log', null, `USB device: VID=0x${info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')} PID=0x${(info.usbProductId ?? 0).toString(16).toUpperCase().padStart(4, '0')}`);
      } else {
        this.emit('log', null, 'Serial port selected (no USB info — may be Bluetooth or platform port)');
      }

      // Try auto-detecting baud rate
      const baudOrder = [
        this.config.baudRate,
        ...OBDConnection.BAUD_RATES.filter(b => b !== this.config.baudRate)
      ];

      let connected = false;
      for (const baud of baudOrder) {
        this.emit('log', null, `Trying ${baud} baud...`);
        const ok = await this.tryBaudRate(baud);
        if (ok) {
          connected = true;
          break;
        }
      }

      if (!connected) {
        this.setState('error');
        this.emit('error', null, 'Could not communicate with device at any baud rate. Try: 1) Unplug and re-plug USB, 2) Turn ignition OFF then ON, 3) Close other apps using the port (OBDwiz, FORScan, etc.)');
        return false;
      }

      // Initialize the ELM327/STN device
      const initialized = await this.initialize();
      if (initialized) {
        this.setState('ready');
        this.emit('log', null, 'OBDLink device ready — connected and initialized successfully');
        return true;
      } else {
        this.setState('error');
        this.emit('error', null, 'Device did not respond to initialization commands. Ensure ignition is ON (engine running or KOEO).');
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown connection error';
      // User cancelled the port picker dialog
      if (msg.includes('No port selected') || msg.includes('user cancelled') || msg.includes('NotFoundError')) {
        this.emit('log', null, 'Connection cancelled — no port selected');
        this.setState('disconnected');
        return false;
      }
      this.emit('error', err, msg);
      this.setState('error');
      return false;
    }
  }

  /**
   * Attempt to open the port at a given baud rate, send a test command,
   * and check if we get a valid response. Returns true if the device talks.
   */
  private async tryBaudRate(baud: number): Promise<boolean> {
    // Close port if it was previously opened
    await this.closePort();

    try {
      await this.port!.open({
        baudRate: baud,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });
    } catch (openErr) {
      const openMsg = openErr instanceof Error ? openErr.message : String(openErr);
      if (openMsg.includes('already open') || openMsg.includes('already been opened')) {
        this.emit('log', null, `Port already open — reusing at ${baud} baud`);
      } else {
        this.emit('log', null, `Failed to open at ${baud}: ${openMsg}`);
        return false;
      }
    }

    // Set up reader/writer
    if (!this.port!.readable || !this.port!.writable) {
      this.emit('log', null, `Port not readable/writable at ${baud}`);
      return false;
    }

    this.reader = this.port!.readable.getReader();
    this.writer = this.port!.writable.getWriter();
    this.buffer = '';
    this.readLoopActive = true;

    // Start a temporary read loop with raw byte logging
    const rawChunks: string[] = [];
    let tempResolve: ((value: string) => void) | null = null;
    let tempTimeout: ReturnType<typeof setTimeout> | null = null;

    const tempReadLoop = async () => {
      while (this.readLoopActive && this.reader) {
        try {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            // Log raw bytes for debugging
            const hex = Array.from(value).map(b => b.toString(16).padStart(2, '0')).join(' ');
            const ascii = this.decoder.decode(value, { stream: true });
            rawChunks.push(ascii);
            this.emit('log', null, `[RAW ${baud}] hex: ${hex}`);
            this.emit('log', null, `[RAW ${baud}] ascii: ${JSON.stringify(ascii)}`);

            this.buffer += ascii;

            // Check for prompt character
            if (this.buffer.includes('>')) {
              const response = this.buffer.substring(0, this.buffer.indexOf('>')).replace(/[\r\n]+/g, '\n').trim();
              this.buffer = this.buffer.substring(this.buffer.indexOf('>') + 1);
              if (tempResolve) {
                if (tempTimeout) { clearTimeout(tempTimeout); tempTimeout = null; }
                tempResolve(response);
                tempResolve = null;
              }
            }
          }
        } catch {
          break;
        }
      }
    };

    const readPromise = tempReadLoop();

    // Helper to send a command and wait for response with raw logging
    const testCommand = (cmd: string, ms: number): Promise<string> => {
      return new Promise<string>((resolve, reject) => {
        tempResolve = resolve;
        tempTimeout = setTimeout(() => {
          tempResolve = null;
          reject(new Error(`Timeout at ${baud}`));
        }, ms);

        const data = this.encoder.encode(cmd + '\r');
        this.writer!.write(data).catch(reject);
      });
    };

    try {
      // Send a bare CR first to flush/wake the device
      await this.writer.write(this.encoder.encode('\r'));
      await new Promise(r => setTimeout(r, 300));
      this.buffer = '';

      // Try ATI first (lightweight identify, no full reset)
      let response = '';
      try {
        response = await testCommand('ATI', 4000);
      } catch {
        // ATI timed out — try a bare CR to see if we get a prompt
        this.buffer = '';
        try {
          response = await testCommand('', 3000);
        } catch {
          // Nothing at this baud rate
        }
      }

      this.emit('log', null, `Response at ${baud}: "${response}"`);

      // Check if we got a meaningful response
      const lower = response.toLowerCase();
      if (lower.includes('elm327') || lower.includes('stn') || lower.includes('obdlink') || lower.includes('v1.') || lower.includes('v2.') || lower.includes('ok')) {
        this.emit('log', null, `Device detected at ${baud} baud!`);
        // Stop the temp read loop and switch to the normal one
        this.readLoopActive = false;
        await this.cleanupReaderWriter();
        // Reopen with the working baud rate using the normal flow
        await this.closePort();
        await this.port!.open({
          baudRate: baud,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          flowControl: 'none',
        });
        this.reader = this.port!.readable!.getReader();
        this.writer = this.port!.writable!.getWriter();
        this.buffer = '';
        this.startReadLoop();
        this.emit('log', null, `Serial port opened at ${baud} baud`);
        return true;
      }

      // If we got raw garbage (baud mismatch), log it
      if (rawChunks.length > 0 && !response) {
        this.emit('log', null, `Got data at ${baud} but no valid response — likely baud mismatch`);
      } else if (rawChunks.length === 0) {
        this.emit('log', null, `No data received at ${baud}`);
      }

    } catch (err) {
      this.emit('log', null, `Error testing ${baud}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Clean up for next attempt
    this.readLoopActive = false;
    await this.cleanupReaderWriter();
    return false;
  }

  private async cleanupReaderWriter(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        this.reader.releaseLock();
        this.reader = null;
      }
    } catch { /* ignore */ }
    try {
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
    } catch { /* ignore */ }
  }

  private async closePort(): Promise<void> {
    await this.cleanupReaderWriter();
    try {
      if (this.port && this.port.readable !== null) {
        await this.port.close();
      }
    } catch { /* ignore close errors — port may not be open */ }
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
      // Step 0: Flush any stale data in the device buffer.
      // Send a bare carriage return to cancel any in-progress command,
      // then wait briefly for the device to settle.
      this.emit('log', null, 'Flushing device buffer...');
      try {
        const flush = this.encoder.encode('\r');
        await this.writer!.write(flush);
        await new Promise(r => setTimeout(r, 500));
        // Drain anything sitting in the read buffer
        this.buffer = '';
      } catch { /* ignore flush errors */ }

      // Step 1: Reset device — ATZ causes a full reset which takes time.
      // The OBDLink EX / STN chips can take 2-4 seconds to reset and
      // send back the "ELM327 v..." banner followed by the ">" prompt.
      this.emit('log', null, 'Resetting device (ATZ)...');
      let resetResponse = '';
      try {
        resetResponse = await this.sendCommand('ATZ', 12000);
      } catch (atzErr) {
        // ATZ timed out — the device may need a nudge.
        // Some OBDLink devices don't echo the > prompt after ATZ
        // until they receive another character. Send a bare CR and wait.
        this.emit('log', null, 'ATZ timed out, retrying with line break...');
        this.buffer = '';
        try {
          const nudge = this.encoder.encode('\r');
          await this.writer!.write(nudge);
          await new Promise(r => setTimeout(r, 2000));
          // Check if anything arrived in the buffer
          if (this.buffer.includes('>')) {
            resetResponse = this.buffer.substring(0, this.buffer.indexOf('>')).replace(/[\r\n]+/g, '\n').trim();
            this.buffer = this.buffer.substring(this.buffer.indexOf('>') + 1);
          }
        } catch { /* ignore */ }

        // Still nothing? Try sending ATZ again
        if (!resetResponse) {
          this.emit('log', null, 'Sending ATZ again...');
          try {
            resetResponse = await this.sendCommand('ATZ', 12000);
          } catch {
            // Last resort: try ATI (identify) instead of full reset
            this.emit('log', null, 'ATZ failed again, trying ATI...');
            try {
              resetResponse = await this.sendCommand('ATI', 5000);
            } catch {
              this.emit('error', null, 'Device not responding to any commands. Try: 1) Unplug and re-plug USB, 2) Turn ignition OFF then ON, 3) Close other apps using the port.');
              return false;
            }
          }
        }
      }

      this.emit('log', null, `Device response: ${resetResponse}`);

      // Accept ELM327 or STN identifiers (OBDLink uses STN chips that report as ELM327)
      const lowerResp = resetResponse.toLowerCase();
      if (!lowerResp.includes('elm327') && !lowerResp.includes('stn') && !lowerResp.includes('obdlink')) {
        // The device responded but didn't identify itself — might still work.
        // Log a warning but continue instead of failing hard.
        this.emit('log', null, `Warning: unexpected device ID: "${resetResponse}". Continuing anyway...`);
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

      // Try to get VIN and decode vehicle identity
      try {
        const vinResp = await this.sendCommand('0902', 8000);
        if (vinResp && !vinResp.includes('NO DATA') && !vinResp.includes('ERROR')) {
          const parsedVin = this.parseVin(vinResp);
          vehicleInfo.vin = parsedVin;

          // Quick local VIN decode for manufacturer/fuelType identification
          if (parsedVin && parsedVin.length === 17) {
            const { identifyVehicleFromVin } = await import('./universalVinDecoder');
            const identity = identifyVehicleFromVin(parsedVin);
            vehicleInfo.manufacturer = identity.manufacturer;
            vehicleInfo.fuelType = identity.fuelType;
            vehicleInfo.make = identity.make;
            vehicleInfo.year = identity.year;
            this.emit('log', null, `VIN decoded: ${identity.make} ${identity.year} | Manufacturer: ${identity.manufacturer} | Fuel: ${identity.fuelType}`);

            // Async NHTSA decode for full details (non-blocking)
            import('./universalVinDecoder').then(async ({ decodeVinNhtsa: nhtsaDecode }) => {
              try {
                const full = await nhtsaDecode(parsedVin);
                vehicleInfo.model = full.model;
                vehicleInfo.engineType = full.engineType;
                vehicleInfo.displacement = full.displacement;
                vehicleInfo.cylinders = full.cylinders;
                // Update fuel type if NHTSA gives a definitive answer
                if (full.nhtsaVerified && full.fuelType !== 'any') {
                  vehicleInfo.fuelType = full.fuelType;
                }
                this.emit('vehicleInfo', vehicleInfo);
                this.emit('log', null, `NHTSA verified: ${full.make} ${full.model} ${full.year} | ${full.engineType}`);
              } catch {
                // NHTSA failed, local decode is sufficient
              }
            });
          }
        }
      } catch {
        // VIN not available, that's ok — default to universal PIDs
        this.emit('log', null, 'VIN not available — using universal PID set');
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

  // Mode 22 PIDs are always "available" since we can't query support via Mode 01
  getAvailableExtendedPids(): PIDDefinition[] {
    return GM_EXTENDED_PIDS;
  }

  getAllAvailablePids(): PIDDefinition[] {
    return [...this.getAvailablePids(), ...this.getAvailableExtendedPids()];
  }

  // ─── Single PID Request ──────────────────────────────────────────────────

  async readPid(pid: PIDDefinition): Promise<PIDReading | null> {
    const service = pid.service ?? 0x01;
    // Mode 22 uses 2-byte DIDs, Mode 01 uses 1-byte PIDs
    const pidHexLen = service === 0x22 ? 4 : 2;
    const command = `${service.toString(16).padStart(2, '0')}${pid.pid.toString(16).padStart(pidHexLen, '0')}`;
    
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
    // Mode 22 PIDs must be requested individually (2-byte DID)
    const batches: PIDDefinition[][] = [];
    let currentBatch: PIDDefinition[] = [];
    
    for (const pid of pids) {
      if ((pid.service ?? 0x01) === 0x22) {
        // Mode 22 PIDs use 2-byte DIDs, request individually
        batches.push([pid]);
        continue;
      }
      if ((pid.service ?? 0x01) !== 0x01) {
        // Other non-service-01 PIDs also individually
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
    // Mode 22 response uses 2-byte DID (62 XXYY), Mode 01 uses 1-byte (41 XX)
    const pidHexLen = service === 0x22 ? 4 : 2;
    const pidHex = pid.pid.toString(16).padStart(pidHexLen, '0').toUpperCase();
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

  // ─── DTC (Diagnostic Trouble Code) Operations ──────────────────────────────

  /**
   * Read all DTCs from the vehicle.
   * Mode 03 = stored (confirmed) DTCs
   * Mode 07 = pending DTCs
   * Mode 0A = permanent DTCs
   * Also reads MIL status via Mode 01 PID 01.
   */
  async readDTCs(): Promise<import('./dtcReader').DTCReadResult> {
    const { parseModeDTCResponse, parseMILStatus } = await import('./dtcReader');

    if (this.state !== 'ready') {
      throw new Error('Device must be in ready state to read DTCs');
    }

    this.emit('log', null, 'Reading DTCs...');

    // Read MIL status first (Mode 01 PID 01)
    let milStatus = false;
    try {
      const milResp = await this.sendCommand('0101', 5000);
      const mil = parseMILStatus(milResp);
      milStatus = mil.milOn;
      this.emit('log', null, `MIL (Check Engine Light): ${mil.milOn ? 'ON' : 'OFF'}, DTC count: ${mil.dtcCount}`);
    } catch {
      this.emit('log', null, 'Could not read MIL status');
    }

    // Read stored DTCs (Mode 03)
    let stored: import('./dtcReader').DTCCode[] = [];
    try {
      const resp03 = await this.sendCommand('03', 8000);
      this.emit('log', null, `Mode 03 response: ${resp03}`);
      stored = parseModeDTCResponse(resp03, 'stored');
      this.emit('log', null, `Stored DTCs: ${stored.length}`);
    } catch {
      this.emit('log', null, 'Mode 03 (stored DTCs) not supported or timeout');
    }

    // Read pending DTCs (Mode 07)
    let pending: import('./dtcReader').DTCCode[] = [];
    try {
      const resp07 = await this.sendCommand('07', 8000);
      this.emit('log', null, `Mode 07 response: ${resp07}`);
      pending = parseModeDTCResponse(resp07, 'pending');
      this.emit('log', null, `Pending DTCs: ${pending.length}`);
    } catch {
      this.emit('log', null, 'Mode 07 (pending DTCs) not supported or timeout');
    }

    // Read permanent DTCs (Mode 0A)
    let permanent: import('./dtcReader').DTCCode[] = [];
    try {
      const resp0A = await this.sendCommand('0A', 8000);
      this.emit('log', null, `Mode 0A response: ${resp0A}`);
      permanent = parseModeDTCResponse(resp0A, 'permanent');
      this.emit('log', null, `Permanent DTCs: ${permanent.length}`);
    } catch {
      this.emit('log', null, 'Mode 0A (permanent DTCs) not supported or timeout');
    }

    // Deduplicate across types (a code can appear in stored AND pending)
    // Keep the most severe classification
    const result: import('./dtcReader').DTCReadResult = {
      stored,
      pending,
      permanent,
      totalCount: stored.length + pending.length + permanent.length,
      milStatus,
      readTimestamp: Date.now(),
    };

    this.emit('dtcRead', result, `Found ${result.totalCount} DTCs`);
    return result;
  }

  /**
   * Clear stored and pending DTCs (Mode 04).
   * WARNING: This clears the MIL (Check Engine Light) and resets monitors.
   * Permanent DTCs (Mode 0A) CANNOT be cleared — they require the fault to be repaired.
   */
  async clearDTCs(): Promise<boolean> {
    if (this.state !== 'ready') {
      throw new Error('Device must be in ready state to clear DTCs');
    }

    this.emit('log', null, 'Clearing DTCs (Mode 04)...');

    try {
      const response = await this.sendCommand('04', 10000);
      this.emit('log', null, `Mode 04 response: ${response}`);

      const cleaned = response.replace(/[\r\n\s]/g, '').toUpperCase();
      if (cleaned.includes('44') || cleaned.includes('OK')) {
        this.emit('log', null, 'DTCs cleared successfully');
        this.emit('dtcCleared', null, 'DTCs cleared');
        return true;
      } else if (cleaned.includes('NODATA') || cleaned.includes('ERROR')) {
        this.emit('log', null, 'Clear DTCs: No data or error response');
        return false;
      }

      // Some adapters just return the echo
      this.emit('log', null, 'Clear DTCs command sent (response may vary by adapter)');
      return true;
    } catch (err) {
      this.emit('error', err, 'Failed to clear DTCs');
      return false;
    }
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

    // Track per-PID failures so we can auto-prune unsupported PIDs
    const pidFailCount = new Map<number, number>();
    const pidDisabled = new Set<number>();
    const MAX_CONSECUTIVE_FAILS = 5;
    let activePids = [...pids];
    let loopCount = 0;

    // Logging loop
    const logLoop = async () => {
      while (this.loggingActive) {
        const startTime = Date.now();
        loopCount++;
        
        try {
          // Only poll PIDs that haven't been disabled
          const readings = await this.readPids(activePids);
          
          // Track which PIDs responded
          const respondedPids = new Set(readings.map(r => r.pid));
          
          // Store readings
          for (const reading of readings) {
            const arr = session.readings.get(reading.pid);
            if (arr) arr.push(reading);
            // Reset fail count on success
            pidFailCount.set(reading.pid, 0);
          }
          
          // Track failures for PIDs that didn't respond
          for (const pid of activePids) {
            if (!respondedPids.has(pid.pid)) {
              const fails = (pidFailCount.get(pid.pid) || 0) + 1;
              pidFailCount.set(pid.pid, fails);
              
              if (fails >= MAX_CONSECUTIVE_FAILS && !pidDisabled.has(pid.pid)) {
                pidDisabled.add(pid.pid);
                this.emit('log', null, `PID ${pid.shortName} (0x${pid.pid.toString(16)}) not responding — disabled after ${MAX_CONSECUTIVE_FAILS} failures`);
              }
            }
          }
          
          // Prune disabled PIDs from active list
          if (pidDisabled.size > 0) {
            activePids = activePids.filter(p => !pidDisabled.has(p.pid));
          }
          
          // Log status on first loop
          if (loopCount === 1) {
            this.emit('log', null, `First poll: ${readings.length}/${activePids.length + pidDisabled.size} PIDs responded`);
            if (readings.length > 0) {
              this.emit('log', null, `Active PIDs: ${readings.map(r => r.name).join(', ')}`);
            }
            if (pidDisabled.size > 0) {
              const disabledNames = pids.filter(p => pidDisabled.has(p.pid)).map(p => p.shortName);
              this.emit('log', null, `No response: ${disabledNames.join(', ')}`);
            }
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

  // ─── DID Discovery Scan ──────────────────────────────────────────────────

  async scanSupportedDIDs(options?: {
    includeStandard?: boolean;   // Also scan Mode 01 PIDs (default: true)
    includeExtended?: boolean;   // Scan Mode 22 PIDs (default: true)
    onProgress?: (current: number, total: number, pid: PIDDefinition, supported: boolean) => void;
    abortSignal?: AbortSignal;
  }): Promise<DIDScanReport> {
    const includeStandard = options?.includeStandard ?? true;
    const includeExtended = options?.includeExtended ?? true;
    const startTime = Date.now();

    const pidsToScan: PIDDefinition[] = [];
    if (includeStandard) pidsToScan.push(...STANDARD_PIDS);
    if (includeExtended) pidsToScan.push(...GM_EXTENDED_PIDS);

    const standardSupported: ScanResult[] = [];
    const extendedSupported: ScanResult[] = [];
    const standardUnsupported: ScanResult[] = [];
    const extendedUnsupported: ScanResult[] = [];

    this.emit('log', null, `Starting DID discovery scan (${pidsToScan.length} PIDs)...`);

    for (let i = 0; i < pidsToScan.length; i++) {
      // Check abort
      if (options?.abortSignal?.aborted) {
        this.emit('log', null, 'Scan aborted by user.');
        break;
      }

      const pid = pidsToScan[i];
      const service = pid.service ?? 0x01;
      const pidHexLen = service === 0x22 ? 4 : 2;
      const command = `${service.toString(16).padStart(2, '0')}${pid.pid.toString(16).padStart(pidHexLen, '0')}`;

      let supported = false;
      let sampleValue: number | undefined;
      let rawResponse: string | undefined;
      let error: string | undefined;

      try {
        const response = await this.sendCommand(command, 3000);
        rawResponse = response;

        // Check for negative responses
        const cleaned = response.replace(/[\r\n\s]/g, '').toUpperCase();
        if (
          cleaned.includes('NODATA') ||
          cleaned.includes('ERROR') ||
          cleaned.includes('UNABLE') ||
          cleaned.includes('?') ||
          cleaned.startsWith('7F')  // UDS negative response
        ) {
          supported = false;
        } else {
          // Try to parse a value
          const reading = this.parsePidResponse(pid, response);
          if (reading) {
            supported = true;
            sampleValue = reading.value;
          } else {
            // Got a response but couldn't parse — still might be supported
            // Check if the response prefix matches expected (41 for Mode 01, 62 for Mode 22)
            const expectedPrefix = service === 0x22 ? '62' : '41';
            supported = cleaned.includes(expectedPrefix.toUpperCase());
          }
        }
      } catch (err) {
        supported = false;
        error = err instanceof Error ? err.message : 'Timeout';
      }

      const result: ScanResult = { pid, supported, sampleValue, rawResponse, error };

      if (service === 0x22) {
        (supported ? extendedSupported : extendedUnsupported).push(result);
      } else {
        (supported ? standardSupported : standardUnsupported).push(result);
      }

      // Emit progress
      const progress = {
        current: i + 1,
        total: pidsToScan.length,
        pid,
        supported,
        sampleValue,
      };
      this.emit('scanProgress', progress);
      if (options?.onProgress) {
        options.onProgress(i + 1, pidsToScan.length, pid, supported);
      }

      // Small delay between requests to avoid overwhelming the ECU
      await new Promise(r => setTimeout(r, 50));
    }

    const duration = Date.now() - startTime;
    const totalSupported = standardSupported.length + extendedSupported.length;

    this.emit('log', null, `Scan complete: ${totalSupported}/${pidsToScan.length} PIDs supported (${(duration / 1000).toFixed(1)}s)`);

    // Auto-generate a vehicle-specific preset from discovered PIDs
    const supportedPidNumbers = [
      ...standardSupported.map(r => r.pid.pid),
      ...extendedSupported.map(r => r.pid.pid),
    ];

    let autoPreset: PIDPreset | undefined;
    if (supportedPidNumbers.length > 0) {
      const vehicleId = this.vehicleInfo?.vin
        ? this.vehicleInfo.vin.slice(-8)
        : `vehicle_${Date.now()}`;
      
      autoPreset = createCustomPreset(
        `Auto-Scan ${vehicleId}`,
        `Auto-discovered ${totalSupported} PIDs (${standardSupported.length} std + ${extendedSupported.length} ext) — ${new Date().toLocaleDateString()}`,
        supportedPidNumbers
      );
      autoPreset.id = `autoscan_${vehicleId}_${Date.now()}`;

      // Save to localStorage
      const existing = loadCustomPresets();
      // Remove any previous autoscan preset for this vehicle
      const filtered = existing.filter(p => !p.id?.startsWith(`autoscan_${vehicleId}`));
      filtered.push(autoPreset);
      saveCustomPresets(filtered);

      this.emit('log', null, `Auto-generated preset "${autoPreset.name}" with ${supportedPidNumbers.length} PIDs saved.`);
    }

    const report: DIDScanReport = {
      timestamp: startTime,
      duration,
      vehicleInfo: this.vehicleInfo,
      standardSupported,
      extendedSupported,
      standardUnsupported,
      extendedUnsupported,
      totalScanned: pidsToScan.length,
      totalSupported,
      autoPreset,
    };

    return report;
  }

  private vehicleInfo: VehicleInfo | undefined;

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

  // Collect ALL readings across all PIDs and sort by timestamp.
  // This handles the fact that PIDs are polled sequentially, so each
  // PID's readings arrive at slightly different timestamps.
  // We group readings into "samples" by rounding timestamps to the
  // nearest polling interval.
  interface SampleRow {
    timestamp: number;
    values: Map<number, number>; // pid -> value
  }

  const sampleMap = new Map<number, SampleRow>();
  const halfInterval = Math.max(session.sampleRate / 2, 100);

  for (const pid of pids) {
    const readings = session.readings.get(pid.pid) || [];
    for (const reading of readings) {
      // Round timestamp to nearest interval bucket
      const bucket = Math.round((reading.timestamp - session.startTime) / halfInterval) * halfInterval + session.startTime;
      
      let sample = sampleMap.get(bucket);
      if (!sample) {
        sample = { timestamp: reading.timestamp, values: new Map() };
        sampleMap.set(bucket, sample);
      }
      // Use the actual timestamp from the first reading in this bucket
      if (reading.timestamp < sample.timestamp) {
        sample.timestamp = reading.timestamp;
      }
      sample.values.set(pid.pid, reading.value);
    }
  }

  // Sort samples by timestamp
  const samples = Array.from(sampleMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  // Build rows with last-known-value fill for missing PIDs
  const lastKnown = new Map<number, number>();
  
  for (const sample of samples) {
    const values: (string | number)[] = [
      sample.timestamp,
      ((sample.timestamp - session.startTime) / 1000).toFixed(3),
    ];

    for (const pid of pids) {
      const val = sample.values.get(pid.pid);
      if (val !== undefined) {
        lastKnown.set(pid.pid, val);
        values.push(val);
      } else {
        // Use last known value if available, otherwise empty
        const last = lastKnown.get(pid.pid);
        values.push(last !== undefined ? last : '');
      }
    }

    rows.push(values.join(','));
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

  // Use the same timestamp-bucketing approach as exportSessionToCSV
  interface SampleRow {
    timestamp: number;
    values: Map<number, number>;
  }

  const sampleMap = new Map<number, SampleRow>();
  const halfInterval = Math.max(session.sampleRate / 2, 100);

  for (const pid of pids) {
    const readings = session.readings.get(pid.pid) || [];
    for (const reading of readings) {
      const bucket = Math.round((reading.timestamp - session.startTime) / halfInterval) * halfInterval + session.startTime;
      let sample = sampleMap.get(bucket);
      if (!sample) {
        sample = { timestamp: reading.timestamp, values: new Map() };
        sampleMap.set(bucket, sample);
      }
      if (reading.timestamp < sample.timestamp) {
        sample.timestamp = reading.timestamp;
      }
      sample.values.set(pid.pid, reading.value);
    }
  }

  const samples = Array.from(sampleMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  const lastKnown = new Map<number, number>();

  for (const sample of samples) {
    const values: (string | number)[] = [
      ((sample.timestamp - session.startTime) / 1000).toFixed(3),
    ];

    for (const pid of pids) {
      const val = sample.values.get(pid.pid);
      if (val !== undefined) {
        lastKnown.set(pid.pid, val);
        values.push(val);
      } else {
        const last = lastKnown.get(pid.pid);
        values.push(last !== undefined ? last : '');
      }
    }

    rows.push(values.join(','));
  }

  return rows.join('\n');
}
