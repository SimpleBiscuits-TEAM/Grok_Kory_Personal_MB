/**
 * Protocol-Specific CSV Export Utilities
 * 
 * Exports J1939, K-Line, and OBD-II datalogs to CSV format with proper headers and unit conversion.
 */

import { J1939ParameterReading } from './j1939Protocol';
import { KLineParameterReading } from './klineProtocol';
import { PIDReading, VehicleInfo } from './obdConnection';

// ─── J1939 CSV Export ───────────────────────────────────────────────────────

export interface J1939CSVExportOptions {
  vehicleInfo?: VehicleInfo;
  vin?: string;
  startTime?: number;
  includeMetadata?: boolean;
}

/**
 * Export J1939 readings to CSV format
 */
export function exportJ1939ToCSV(
  readings: J1939ParameterReading[],
  options: J1939CSVExportOptions = {}
): string {
  const lines: string[] = [];

  // Metadata header
  if (options.includeMetadata) {
    lines.push('# J1939 Protocol Datalog Export');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    if (options.vin) lines.push(`# VIN: ${options.vin}`);
    if (options.vehicleInfo) {
      lines.push(
        `# Vehicle: ${options.vehicleInfo.year} ${options.vehicleInfo.make} ${options.vehicleInfo.model}`
      );
      lines.push(`# Engine: ${options.vehicleInfo.engineType}`);
      lines.push(`# Fuel: ${options.vehicleInfo.fuelType}`);
    }
    if (options.startTime) {
      lines.push(`# Start Time: ${new Date(options.startTime).toISOString()}`);
    }
    lines.push('');
  }

  // CSV Header
  lines.push(
    'Timestamp (ms),Timestamp (ISO),PGN,PGN Name,Parameter,Short Name,Value,Unit,Source Address'
  );

  // Data rows
  if (readings.length === 0) {
    return lines.join('\n');
  }

  const baseTime = options.startTime || readings[0].timestamp;

  for (const reading of readings) {
    const relativeTime = reading.timestamp - baseTime;
    const isoTime = new Date(reading.timestamp).toISOString();
    const pgnName = getPGNName(reading.pgn);

    const row = [
      relativeTime,
      isoTime,
      `0x${reading.pgn.toString(16).toUpperCase().padStart(5, '0')}`,
      pgnName,
      reading.parameter,
      reading.shortName,
      reading.value.toFixed(2),
      reading.unit,
      `0x${(reading.sourceAddress ?? 0).toString(16).toUpperCase().padStart(2, '0')}`,
    ];

    lines.push(row.map(escapeCSV).join(','));
  }

  return lines.join('\n');
}

/**
 * Get human-readable PGN name
 */
function getPGNName(pgn: number): string {
  const pgnNames: Record<number, string> = {
    61444: 'EEC1 (Engine Electronic Controller 1)',
    61443: 'ETC1 (Electronic Transmission Controller 1)',
    110592: 'ET1 (Engine Temperature 1)',
    65226: 'EFL/P1 (Engine Fuel Rate/Pressure)',
    65248: 'Fuel Consumption (Liquid)',
    65227: 'DM1 (Active Diagnostic Trouble Codes)',
  };
  return pgnNames[pgn] || `PGN ${pgn}`;
}

// ─── K-Line CSV Export ──────────────────────────────────────────────────────

export interface KLineCSVExportOptions {
  vehicleInfo?: VehicleInfo;
  vin?: string;
  startTime?: number;
  includeMetadata?: boolean;
}

/**
 * Export K-Line readings to CSV format
 */
export function exportKLineToCSV(
  readings: KLineParameterReading[],
  options: KLineCSVExportOptions = {}
): string {
  const lines: string[] = [];

  // Metadata header
  if (options.includeMetadata) {
    lines.push('# K-Line Protocol Datalog Export (ISO 9141-2)');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    if (options.vin) lines.push(`# VIN: ${options.vin}`);
    if (options.vehicleInfo) {
      lines.push(
        `# Vehicle: ${options.vehicleInfo.year} ${options.vehicleInfo.make} ${options.vehicleInfo.model}`
      );
      lines.push(`# Engine: ${options.vehicleInfo.engineType}`);
      lines.push(`# Fuel: ${options.vehicleInfo.fuelType}`);
    }
    if (options.startTime) {
      lines.push(`# Start Time: ${new Date(options.startTime).toISOString()}`);
    }
    lines.push('');
  }

  // CSV Header
  lines.push(
    'Timestamp (ms),Timestamp (ISO),PID,PID Name,Parameter,Short Name,Value,Unit,Service Mode'
  );

  // Data rows
  if (readings.length === 0) {
    return lines.join('\n');
  }

  const baseTime = options.startTime || readings[0].timestamp;

  for (const reading of readings) {
    const relativeTime = reading.timestamp - baseTime;
    const isoTime = new Date(reading.timestamp).toISOString();
    const pidName = getPIDNameKLine(reading.pid);
    const serviceMode = `Mode 0x${(reading.service ?? 0x01).toString(16).toUpperCase().padStart(2, '0')}`;

    const row = [
      relativeTime,
      isoTime,
      `0x${reading.pid.toString(16).toUpperCase().padStart(2, '0')}`,
      pidName,
      reading.name,
      reading.shortName,
      reading.value.toFixed(2),
      reading.unit,
      serviceMode,
    ];

    lines.push(row.map(escapeCSV).join(','));
  }

  return lines.join('\n');
}

/**
 * Get human-readable PID name (K-Line)
 */
function getPIDNameKLine(pid: number): string {
  const pidNames: Record<number, string> = {
    0x0c: 'Engine RPM',
    0x0d: 'Vehicle Speed',
    0x05: 'Engine Coolant Temperature',
    0x0b: 'Intake Manifold Absolute Pressure',
    0x10: 'Mass Air Flow',
    0x0f: 'Intake Air Temperature',
    0x46: 'Ambient Air Temperature',
    0x15: 'O2 Sensor Voltage (Bank 1, Sensor 1)',
    0x14: 'O2 Sensor Voltage (Bank 1, Sensor 1)',
    0x04: 'Calculated Engine Load',
    0x06: 'Short Term Fuel Trim (Bank 1)',
    0x08: 'Long Term Fuel Trim (Bank 1)',
    0x11: 'Throttle Position',
  };
  return pidNames[pid] || `PID 0x${pid.toString(16).toUpperCase().padStart(2, '0')}`;
}

// ─── OBD-II CSV Export (Enhanced) ───────────────────────────────────────────

export interface OBDCSVExportOptions {
  vehicleInfo?: VehicleInfo;
  vin?: string;
  startTime?: number;
  includeMetadata?: boolean;
}

/**
 * Export OBD-II readings to CSV format
 */
export function exportOBDToCSV(
  readings: PIDReading[],
  options: OBDCSVExportOptions = {}
): string {
  const lines: string[] = [];

  // Metadata header
  if (options.includeMetadata) {
    lines.push('# OBD-II Protocol Datalog Export');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    if (options.vin) lines.push(`# VIN: ${options.vin}`);
    if (options.vehicleInfo) {
      lines.push(
        `# Vehicle: ${options.vehicleInfo.year} ${options.vehicleInfo.make} ${options.vehicleInfo.model}`
      );
      lines.push(`# Engine: ${options.vehicleInfo.engineType}`);
      lines.push(`# Fuel: ${options.vehicleInfo.fuelType}`);
    }
    if (options.startTime) {
      lines.push(`# Start Time: ${new Date(options.startTime).toISOString()}`);
    }
    lines.push('');
  }

  // CSV Header
  lines.push(
    'Timestamp (ms),Timestamp (ISO),PID,PID Name,Parameter,Short Name,Value,Unit,Service Mode'
  );

  // Data rows
  if (readings.length === 0) {
    return lines.join('\n');
  }

  const baseTime = options.startTime || readings[0].timestamp;

  for (const reading of readings) {
    const relativeTime = reading.timestamp - baseTime;
    const isoTime = new Date(reading.timestamp).toISOString();
    const pidName = getPIDNameOBD(reading.pid);
    const serviceMode = 'Mode 0x01';

    const row = [
      relativeTime,
      isoTime,
      `0x${reading.pid.toString(16).toUpperCase().padStart(2, '0')}`,
      pidName,
      reading.name,
      reading.shortName,
      reading.value.toFixed(2),
      reading.unit,
      serviceMode,
    ];

    lines.push(row.map(escapeCSV).join(','));
  }

  return lines.join('\n');
}

/**
 * Get human-readable PID name (OBD-II)
 */
function getPIDNameOBD(pid: number): string {
  const pidNames: Record<number, string> = {
    0x0c: 'Engine RPM',
    0x0d: 'Vehicle Speed',
    0x05: 'Engine Coolant Temperature',
    0x0b: 'Intake Manifold Absolute Pressure',
    0x10: 'Mass Air Flow',
    0x0f: 'Intake Air Temperature',
    0x46: 'Ambient Air Temperature',
    0x15: 'O2 Sensor Voltage (Bank 1, Sensor 1)',
    0x14: 'O2 Sensor Voltage (Bank 1, Sensor 1)',
    0x04: 'Calculated Engine Load',
    0x06: 'Short Term Fuel Trim (Bank 1)',
    0x08: 'Long Term Fuel Trim (Bank 1)',
    0x11: 'Throttle Position',
  };
  return pidNames[pid] || `PID 0x${pid.toString(16).toUpperCase().padStart(2, '0')}`;
}

// ─── Unified Export ─────────────────────────────────────────────────────────

export type ProtocolReading = J1939ParameterReading | KLineParameterReading | PIDReading;

export interface UnifiedCSVExportOptions {
  protocol: 'j1939' | 'kline' | 'obd2' | 'vop';
  vehicleInfo?: VehicleInfo;
  vin?: string;
  startTime?: number;
  includeMetadata?: boolean;
}

/**
 * Export any protocol readings to CSV
 */
export function exportProtocolToCSV(
  readings: ProtocolReading[],
  options: UnifiedCSVExportOptions
): string {
  switch (options.protocol) {
    case 'j1939':
      return exportJ1939ToCSV(readings as J1939ParameterReading[], options);
    case 'kline':
      return exportKLineToCSV(readings as KLineParameterReading[], options);
    case 'vop':
    case 'obd2':
    default:
      return exportOBDToCSV(readings as PIDReading[], options);
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Escape CSV field value
 */
function escapeCSV(value: string | number | boolean): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Generate filename with timestamp
 */
export function generateCSVFilename(protocol: 'j1939' | 'kline' | 'obd2' | 'vop', vin?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const protocolName = protocol === 'obd2' ? 'obd2' : protocol === 'vop' ? 'vop' : protocol.toUpperCase();
  const vinPart = vin ? `-${vin.slice(-8)}` : '';
  return `datalog-${protocolName}${vinPart}-${timestamp}.csv`;
}
