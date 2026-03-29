/**
 * K-Line Protocol Implementation
 * 
 * K-Line is a single-wire automotive communication protocol used by:
 * - Pre-2010 vehicles (OBD-II compliant)
 * - Legacy ECUs and engine management systems
 * - Bosch, Siemens, Denso, Delphi systems
 * - Some heavy-duty trucks and equipment
 * 
 * Specifications:
 * - ISO 9141-2 standard
 * - 10.4 kbaud baud rate (fixed)
 * - Single-wire communication (K-line)
 * - 5-baud wakeup initialization
 * - Request/Response protocol
 * - Supports OBD-II Modes 01-09
 * - Supports manufacturer-specific modes (22, 23, etc.)
 */

// ─── K-Line Protocol Constants ───────────────────────────────────────────────

export const KLINE_BAUD_RATE = 10400; // Fixed 10.4 kbaud
export const KLINE_WAKEUP_BAUD = 5;   // 5-baud for initialization
export const KLINE_TIMEOUT_MS = 1000; // Default timeout

// OBD-II Services
export enum KLineService {
  ShowCurrentData = 0x01,
  ShowFreezeFrameData = 0x02,
  ShowStoredDiagnosticTroubleCodes = 0x03,
  ClearDiagnosticTroubleCodesAndStoredValues = 0x04,
  ReadDiagnosticTroubleCodesAndStatus = 0x05,
  ReadExtendedDiagnosticTroubleCodes = 0x06,
  ReadPendingDiagnosticTroubleCodes = 0x07,
  ReadDiagnosticTroubleCodesWithStatus = 0x08,
  ReadVehicleInformation = 0x09,
  ReadDataByLocalDataIdentifier = 0x21,
  ReadDataByCommonDataIdentifier = 0x22,
  ReadMemoryByAddress = 0x23,
  ReadScaledAnalogIOValues = 0x24,
  ReadDiagnosticDataIdentifier = 0x2A,
  ReadExtendedDataRecordByDiagnosticDataIdentifier = 0x2C,
  WriteDiagnosticDataIdentifier = 0x2E,
  IOControlByCommonDataIdentifier = 0x2F,
  ReadDynamicallyDefineDataIdentifier = 0x2C,
  WriteMemoryByAddress = 0x3D,
  TesterPresent = 0x3E,
  AccessTimingParameter = 0x83,
  SecuredDataTransmission = 0x84,
  ControlDiagnosticDataTransmission = 0x85,
  ResponseOnEvent = 0x86,
  LinkControl = 0x87,
  ReadDataByIdentifier = 0x22,
  WriteDataByIdentifier = 0x2E,
  ReadMemory = 0x23,
  WriteMemory = 0x3D,
}

// K-Line Response Codes
export enum KLineResponseCode {
  PositiveResponse = 0x40,
  NegativeResponse = 0x7F,
  BusyRepeatRequest = 0x21,
  ConditionsNotCorrect = 0x22,
  RequestSequenceError = 0x24,
  RequestOutOfRange = 0x31,
  SecurityAccessDenied = 0x33,
  InvalidKey = 0x35,
  ExceededNumberOfAttempts = 0x36,
  RequiredTimeDelayNotExpired = 0x37,
  DownloadNotAccepted = 0x40,
  UploadNotAccepted = 0x41,
  TransferDataSuspended = 0x71,
  TransferDataAborted = 0x72,
  NegativeResponseReceived = 0x7F,
}

// ─── K-Line Message Types ───────────────────────────────────────────────────

export interface KLineMessage {
  service: number;
  data: number[];
  timestamp: number;
}

export interface KLineRequest extends KLineMessage {
  requestId?: number;
}

export interface KLineResponse extends KLineMessage {
  isPositive: boolean;
  errorCode?: number;
  errorDescription?: string;
}

export interface KLineParameter {
  pid: number;
  name: string;
  shortName: string;
  service: number;           // 0x01 (Mode 01), 0x22 (Mode 22), etc.
  dataIdentifier?: number;   // For Mode 22 (Read DID)
  unit: string;
  min: number;
  max: number;
  bytes: number;
  formula: (bytes: number[]) => number;
  manufacturer?: string;     // e.g., 'bosch', 'siemens', 'denso'
  category: string;
}

export interface KLineParameterReading {
  pid: number;
  name: string;
  shortName: string;
  value: number;
  unit: string;
  timestamp: number;
  service: number;
}

// ─── K-Line Standard PIDs (OBD-II Mode 01) ──────────────────────────────────

export const KLINE_STANDARD_PIDS: KLineParameter[] = [
  // Engine Core
  {
    pid: 0x00,
    name: 'PID Support (01-20)',
    shortName: 'PID_SUPPORT_1',
    service: 0x01,
    unit: 'bitmap',
    min: 0,
    max: 0xFFFFFFFF,
    bytes: 4,
    category: 'engine',
    formula: (bytes) => (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3],
  },
  {
    pid: 0x04,
    name: 'Calculated Engine Load',
    shortName: 'LOAD',
    service: 0x01,
    unit: '%',
    min: 0,
    max: 100,
    bytes: 1,
    category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  {
    pid: 0x05,
    name: 'Engine Coolant Temperature',
    shortName: 'ECT',
    service: 0x01,
    unit: '°C',
    min: -40,
    max: 215,
    bytes: 1,
    category: 'cooling',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x0B,
    name: 'Intake Manifold Pressure (MAP)',
    shortName: 'MAP',
    service: 0x01,
    unit: 'kPa',
    min: 0,
    max: 255,
    bytes: 1,
    category: 'intake',
    formula: ([a]) => a,
  },
  {
    pid: 0x0C,
    name: 'Engine RPM',
    shortName: 'RPM',
    service: 0x01,
    unit: 'rpm',
    min: 0,
    max: 16383.75,
    bytes: 2,
    category: 'engine',
    formula: ([a, b]) => ((a * 256) + b) / 4,
  },
  {
    pid: 0x0D,
    name: 'Vehicle Speed',
    shortName: 'VSS',
    service: 0x01,
    unit: 'km/h',
    min: 0,
    max: 255,
    bytes: 1,
    category: 'engine',
    formula: ([a]) => a,
  },
  {
    pid: 0x0E,
    name: 'Timing Advance',
    shortName: 'TIMING',
    service: 0x01,
    unit: '°BTDC',
    min: -64,
    max: 63.5,
    bytes: 1,
    category: 'ignition',
    formula: ([a]) => (a / 2) - 64,
  },
  {
    pid: 0x0F,
    name: 'Intake Air Temperature',
    shortName: 'IAT',
    service: 0x01,
    unit: '°C',
    min: -40,
    max: 215,
    bytes: 1,
    category: 'intake',
    formula: ([a]) => a - 40,
  },
  {
    pid: 0x10,
    name: 'Mass Air Flow Rate',
    shortName: 'MAF',
    service: 0x01,
    unit: 'g/s',
    min: 0,
    max: 655.35,
    bytes: 2,
    category: 'engine',
    formula: ([a, b]) => ((a * 256) + b) / 100,
  },
  {
    pid: 0x11,
    name: 'Throttle Position',
    shortName: 'TPS',
    service: 0x01,
    unit: '%',
    min: 0,
    max: 100,
    bytes: 1,
    category: 'engine',
    formula: ([a]) => (a * 100) / 255,
  },
  // Fuel System
  {
    pid: 0x03,
    name: 'Fuel System Status',
    shortName: 'FUEL_SYS',
    service: 0x01,
    unit: 'status',
    min: 0,
    max: 255,
    bytes: 2,
    category: 'fuel',
    formula: ([a]) => a,
  },
  {
    pid: 0x06,
    name: 'Short Term Fuel Trim (Bank 1)',
    shortName: 'STFT1',
    service: 0x01,
    unit: '%',
    min: -100,
    max: 99.2,
    bytes: 1,
    category: 'fuel',
    formula: ([a]) => ((a - 128) * 100) / 128,
  },
  {
    pid: 0x07,
    name: 'Long Term Fuel Trim (Bank 1)',
    shortName: 'LTFT1',
    service: 0x01,
    unit: '%',
    min: -100,
    max: 99.2,
    bytes: 1,
    category: 'fuel',
    formula: ([a]) => ((a - 128) * 100) / 128,
  },
  // Oxygen Sensors
  {
    pid: 0x14,
    name: 'O2 Sensor 1 (Bank 1, Sensor 1)',
    shortName: 'O2_1_1',
    service: 0x01,
    unit: 'V',
    min: 0,
    max: 1.275,
    bytes: 2,
    category: 'oxygen',
    formula: ([a, b]) => (a / 200) + ((b / 256) * 0.00390625),
  },
];

// ─── K-Line Initialization ──────────────────────────────────────────────────

export interface KLineInitConfig {
  port: SerialPort;
  baudRate?: number;
  timeoutMs?: number;
}

export interface KLineInitResponse {
  success: boolean;
  ecuId?: string;
  keywords?: number[];
  error?: string;
}

/**
 * K-Line 5-baud wakeup initialization
 * Sends 0x33 at 5 baud to wake up the ECU
 */
export function generateKLineWakeupSequence(): number[] {
  // 5-baud wakeup: send 0x33 at 5 baud
  // This is typically handled by the adapter
  return [0x33];
}

/**
 * Parse K-Line initialization response (K1 and K2 bytes)
 */
export function parseKLineInitResponse(data: number[]): { k1: number; k2: number } | null {
  if (data.length < 2) return null;
  return { k1: data[0], k2: data[1] };
}

/**
 * Create K-Line request message
 */
export function createKLineRequest(
  service: number,
  data: number[] = []
): number[] {
  return [service, ...data];
}

/**
 * Parse K-Line response
 */
export function parseKLineResponse(data: number[]): KLineResponse | null {
  if (data.length < 2) return null;

  const service = data[0];
  const isPositive = (service & 0x40) !== 0;

  if (!isPositive && service === 0x7F) {
    // Negative response
    const requestedService = data[1];
    const errorCode = data[2];
    return {
      service: requestedService,
      data: data.slice(3),
      timestamp: Date.now(),
      isPositive: false,
      errorCode,
      errorDescription: getKLineErrorDescription(errorCode),
    };
  }

  return {
    service,
    data: data.slice(1),
    timestamp: Date.now(),
    isPositive,
  };
}

/**
 * Get K-Line error description
 */
export function getKLineErrorDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0x10: 'General Reject',
    0x11: 'Service Not Supported',
    0x12: 'Sub-function Not Supported',
    0x13: 'Incorrect Message Length or Invalid Format',
    0x14: 'Response Too Long',
    0x21: 'Busy Repeat Request',
    0x22: 'Conditions Not Correct',
    0x24: 'Request Sequence Error',
    0x25: 'No Access To Requested Function',
    0x26: 'Access Denied',
    0x31: 'Request Out Of Range',
    0x33: 'Security Access Denied',
    0x35: 'Invalid Key',
    0x36: 'Exceeded Number Of Attempts',
    0x37: 'Required Time Delay Not Expired',
    0x40: 'Download Not Accepted',
    0x41: 'Upload Not Accepted',
    0x42: 'Transfer Data Suspended',
    0x50: 'Unexpected Add-On',
    0x62: 'Definite Component Temporary Not Available',
    0x63: 'Security Access Request In Progress',
    0x70: 'Upload Download Not Accepted',
    0x71: 'Transfer Data Suspended',
    0x72: 'Transfer Data Aborted',
    0x73: 'Illegal Address In Block Transfer',
    0x74: 'Illegal Byte Count In Block Transfer',
    0x75: 'Illegal Block Transfer Type',
    0x76: 'Block Transfer Data Checksum Error',
    0x77: 'Request Correctly Received Response Pending',
    0x78: 'Incorrect Byte Count During Block Transfer',
    0x7E: 'Sub-function Not Supported In Active Session',
    0x7F: 'Service Not Supported In Active Session',
  };
  return descriptions[code] || `Unknown Error (0x${code.toString(16).toUpperCase()})`;
}

/**
 * K-Line DTC (Diagnostic Trouble Code) parsing
 * Format: [SPN_MSB, SPN_LSB, FMI, OC]
 */
export interface KLineDTC {
  spn: number;               // Suspect Parameter Number (16-bit)
  fmi: number;               // Failure Mode Indicator (4-bit)
  oc: number;                // Occurrence Counter (4-bit)
  description: string;
}

export function parseKLineDTC(data: number[]): KLineDTC | null {
  if (data.length < 4) return null;

  const spn = (data[0] << 8) | data[1];
  const fmi = (data[2] >> 4) & 0x0F;
  const oc = data[2] & 0x0F;

  return {
    spn,
    fmi,
    oc,
    description: `SPN ${spn} - FMI ${fmi} - OC ${oc}`,
  };
}

/**
 * K-Line DTC severity levels
 */
export function getKLineDTCSeverity(fmi: number): 'critical' | 'warning' | 'info' {
  switch (fmi) {
    case 0:
      return 'info'; // Data Valid But Above Normal Operating Range
    case 1:
      return 'warning'; // Data Valid But Below Normal Operating Range
    case 2:
      return 'critical'; // Data Erratic, Intermittent, or Incorrect
    case 3:
      return 'critical'; // Voltage Above Normal or Shorted High
    case 4:
      return 'critical'; // Voltage Below Normal or Shorted Low
    case 5:
      return 'warning'; // Current Below Normal or Open Circuit
    case 6:
      return 'warning'; // Current Above Normal or Grounded Circuit
    case 7:
      return 'critical'; // Mechanical System Not Responding
    case 8:
      return 'warning'; // Auxiliary Output On Demand Features Not Responding
    case 9:
      return 'info'; // Device Reports Internal Errors
    case 10:
      return 'warning'; // Device Cannot Obtain Message
    case 11:
      return 'warning'; // Data Stuck at Last Commanded Value
    case 12:
      return 'warning'; // Network or Vehicle Bus Off
    case 13:
      return 'warning'; // Network or Vehicle Bus Passive Mode
    case 14:
      return 'info'; // Reserved for Future Expansion
    case 15:
      return 'info'; // Reserved for Future Expansion
    default:
      return 'info';
  }
}

/**
 * Get all K-Line standard PIDs
 */
export function getAllKLineStandardPIDs(): KLineParameter[] {
  return KLINE_STANDARD_PIDS;
}

/**
 * Find K-Line PID by number
 */
export function findKLinePID(pid: number, service: number = 0x01): KLineParameter | undefined {
  return KLINE_STANDARD_PIDS.find((p) => p.pid === pid && p.service === service);
}

/**
 * Get K-Line PIDs by category
 */
export function getKLinePIDsByCategory(category: string): KLineParameter[] {
  return KLINE_STANDARD_PIDS.filter((p) => p.category === category);
}
