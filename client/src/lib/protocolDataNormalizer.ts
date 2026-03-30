/**
 * Protocol Data Normalizer
 * 
 * Converts J1939, K-Line, and OBD-II readings into a unified format
 * so downstream systems (diagnostics, reasoning, fault detection) work
 * seamlessly across all protocols without duplication.
 */

import { J1939ParameterReading } from './j1939Protocol';
import { KLineParameterReading } from './klineProtocol';
import { PIDReading } from './obdConnection';

// ─── Unified Reading Format ────────────────────────────────────────────────

/**
 * Universal reading format that works for all protocols
 */
export interface NormalizedReading {
  // Protocol-agnostic identifiers
  id: string; // Unique identifier (e.g., "obd2_0x0c", "j1939_61444_0", "kline_0x0c")
  protocol: 'obd2' | 'j1939' | 'kline' | 'vop';
  timestamp: number;
  value: number;
  unit: string;

  // Metadata
  name: string; // Full parameter name
  shortName: string; // Short identifier (e.g., "RPM", "ECT")
  category: string; // e.g., "engine", "transmission", "emissions"

  // Protocol-specific fields (optional)
  pgn?: number; // J1939 only
  pid?: number; // OBD-II and K-Line
  sourceAddress?: number; // J1939 only
  service?: number; // K-Line only (0x01, 0x22, etc.)

  // Diagnostic hints
  min: number;
  max: number;
  resolution: number;
  isExtended?: boolean; // Mode 22 / Extended PID
  isFault?: boolean; // Is this a fault/DTC reading?
}

// ─── Normalization Functions ──────────────────────────────────────────────

/**
 * Normalize J1939 reading to universal format
 */
export function normalizeJ1939Reading(reading: J1939ParameterReading): NormalizedReading {
  const id = `j1939_${reading.pgn}_${reading.sourceAddress}`;

  return {
    id,
    protocol: 'j1939',
    timestamp: reading.timestamp,
    value: reading.value,
    unit: reading.unit,
    name: reading.parameter,
    shortName: reading.shortName,
    category: categorizeJ1939Parameter(reading.shortName),
    pgn: reading.pgn,
    sourceAddress: reading.sourceAddress,
    min: getJ1939ParameterMin(reading.shortName),
    max: getJ1939ParameterMax(reading.shortName),
    resolution: getJ1939ParameterResolution(reading.shortName),
  };
}

/**
 * Normalize K-Line reading to universal format
 */
export function normalizeKLineReading(reading: KLineParameterReading): NormalizedReading {
  const id = `kline_${reading.pid}`;

  return {
    id,
    protocol: 'kline',
    timestamp: reading.timestamp,
    value: reading.value,
    unit: reading.unit,
    name: reading.name,
    shortName: reading.shortName,
    category: categorizeOBDParameter(reading.shortName),
    pid: reading.pid,
    service: reading.service,
    min: getOBDParameterMin(reading.shortName),
    max: getOBDParameterMax(reading.shortName),
    resolution: getOBDParameterResolution(reading.shortName),
    isExtended: reading.service !== 0x01,
  };
}

/**
 * Normalize OBD-II reading to universal format
 */
export function normalizeOBDReading(reading: PIDReading): NormalizedReading {
  const id = `obd2_${reading.pid.toString(16)}`;

  return {
    id,
    protocol: 'obd2',
    timestamp: reading.timestamp,
    value: reading.value,
    unit: reading.unit,
    name: reading.name,
    shortName: reading.shortName,
    category: categorizeOBDParameter(reading.shortName),
    pid: reading.pid,
    min: getOBDParameterMin(reading.shortName),
    max: getOBDParameterMax(reading.shortName),
    resolution: getOBDParameterResolution(reading.shortName),
  };
}

/**
 * Normalize any protocol reading
 */
export function normalizeReading(
  reading: J1939ParameterReading | KLineParameterReading | PIDReading
): NormalizedReading {
  if ('pgn' in reading) {
    return normalizeJ1939Reading(reading);
  } else if ('service' in reading && 'pid' in reading) {
    return normalizeKLineReading(reading);
  } else {
    return normalizeOBDReading(reading);
  }
}

/**
 * Normalize batch of readings
 */
export function normalizeReadings(
  readings: (J1939ParameterReading | KLineParameterReading | PIDReading)[]
): NormalizedReading[] {
  return readings.map(normalizeReading);
}

// ─── Categorization ────────────────────────────────────────────────────────

function categorizeJ1939Parameter(shortName: string): string {
  const name = shortName.toLowerCase();

  if (name.includes('engine') || name.includes('rpm') || name.includes('speed')) return 'engine';
  if (name.includes('trans') || name.includes('gear') || name.includes('tcc')) return 'transmission';
  if (name.includes('boost') || name.includes('turbo') || name.includes('vgt')) return 'turbo';
  if (name.includes('temp') || name.includes('egt') || name.includes('coolant')) return 'exhaust';
  if (name.includes('pressure') || name.includes('rail') || name.includes('fuel')) return 'fuel';
  if (name.includes('fault') || name.includes('dtc') || name.includes('code')) return 'diagnostics';

  return 'other';
}

function categorizeOBDParameter(shortName: string): string {
  const name = shortName.toLowerCase();

  if (name.includes('rpm') || name.includes('load') || name.includes('speed')) return 'engine';
  if (name.includes('temp') || name.includes('coolant') || name.includes('iat')) return 'cooling';
  if (name.includes('pressure') || name.includes('map') || name.includes('fuel')) return 'fuel';
  if (name.includes('o2') || name.includes('lambda') || name.includes('sensor')) return 'oxygen';
  if (name.includes('catalyst') || name.includes('cat')) return 'catalyst';
  if (name.includes('evap')) return 'evap';
  if (name.includes('ignition') || name.includes('timing')) return 'ignition';
  if (name.includes('trans') || name.includes('gear')) return 'transmission';

  return 'other';
}

// ─── Parameter Ranges (for normalization) ──────────────────────────────────

function getJ1939ParameterMin(shortName: string): number {
  const name = shortName.toLowerCase();

  if (name.includes('rpm')) return 0;
  if (name.includes('speed')) return 0;
  if (name.includes('temp')) return -40;
  if (name.includes('pressure')) return 0;
  if (name.includes('load')) return 0;

  return 0;
}

function getJ1939ParameterMax(shortName: string): number {
  const name = shortName.toLowerCase();

  if (name.includes('rpm')) return 5000;
  if (name.includes('speed')) return 120;
  if (name.includes('temp')) return 150;
  if (name.includes('pressure')) return 200;
  if (name.includes('load')) return 100;

  return 100;
}

function getJ1939ParameterResolution(shortName: string): number {
  const name = shortName.toLowerCase();

  if (name.includes('rpm')) return 1;
  if (name.includes('temp')) return 0.1;
  if (name.includes('pressure')) return 0.5;

  return 1;
}

function getOBDParameterMin(shortName: string): number {
  const name = shortName.toLowerCase();

  if (name.includes('rpm')) return 0;
  if (name.includes('speed')) return 0;
  if (name.includes('temp')) return -40;
  if (name.includes('pressure')) return 0;
  if (name.includes('load')) return 0;

  return 0;
}

function getOBDParameterMax(shortName: string): number {
  const name = shortName.toLowerCase();

  if (name.includes('rpm')) return 8000;
  if (name.includes('speed')) return 255;
  if (name.includes('temp')) return 150;
  if (name.includes('pressure')) return 655;
  if (name.includes('load')) return 100;

  return 100;
}

function getOBDParameterResolution(shortName: string): number {
  const name = shortName.toLowerCase();

  if (name.includes('rpm')) return 0.25;
  if (name.includes('temp')) return 1;
  if (name.includes('pressure')) return 1;

  return 1;
}

// ─── Denormalization (convert back to protocol-specific format) ────────────

/**
 * Convert normalized reading back to OBD-II format
 */
export function denormalizeToOBD(reading: NormalizedReading): PIDReading {
  return {
    pid: reading.pid ?? 0,
    name: reading.name,
    shortName: reading.shortName,
    value: reading.value,
    unit: reading.unit,
    rawBytes: [],
    timestamp: reading.timestamp,
  };
}

/**
 * Convert normalized reading back to J1939 format
 */
export function denormalizeToJ1939(reading: NormalizedReading): J1939ParameterReading {
  return {
    pgn: reading.pgn ?? 0,
    pgnName: reading.name,
    parameter: reading.name,
    shortName: reading.shortName,
    value: reading.value,
    unit: reading.unit,
    timestamp: reading.timestamp,
    sourceAddress: reading.sourceAddress ?? 0,
  };
}

/**
 * Convert normalized reading back to K-Line format
 */
export function denormalizeToKLine(reading: NormalizedReading): KLineParameterReading {
  return {
    pid: reading.pid ?? 0,
    name: reading.name,
    shortName: reading.shortName,
    value: reading.value,
    unit: reading.unit,
    timestamp: reading.timestamp,
    service: reading.service ?? 0x01,
  };
}

// ─── Batch Operations ──────────────────────────────────────────────────────

/**
 * Group normalized readings by category
 */
export function groupByCategory(readings: NormalizedReading[]): Map<string, NormalizedReading[]> {
  const grouped = new Map<string, NormalizedReading[]>();

  for (const reading of readings) {
    const category = reading.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(reading);
  }

  return grouped;
}

/**
 * Group normalized readings by protocol
 */
export function groupByProtocol(readings: NormalizedReading[]): Map<string, NormalizedReading[]> {
  const grouped = new Map<string, NormalizedReading[]>();

  for (const reading of readings) {
    const protocol = reading.protocol;
    if (!grouped.has(protocol)) {
      grouped.set(protocol, []);
    }
    grouped.get(protocol)!.push(reading);
  }

  return grouped;
}

/**
 * Filter readings by protocol
 */
export function filterByProtocol(
  readings: NormalizedReading[],
  protocol: 'obd2' | 'j1939' | 'kline' | 'vop'
): NormalizedReading[] {
  return readings.filter(r => r.protocol === protocol);
}

/**
 * Filter readings by category
 */
export function filterByCategory(readings: NormalizedReading[], category: string): NormalizedReading[] {
  return readings.filter(r => r.category === category);
}

/**
 * Find reading by short name
 */
export function findByShortName(readings: NormalizedReading[], shortName: string): NormalizedReading | undefined {
  return readings.find(r => r.shortName.toUpperCase() === shortName.toUpperCase());
}

/**
 * Get latest reading for each unique parameter
 */
export function getLatestReadings(readings: NormalizedReading[]): Map<string, NormalizedReading> {
  const latest = new Map<string, NormalizedReading>();

  for (const reading of readings) {
    const existing = latest.get(reading.shortName);
    if (!existing || reading.timestamp > existing.timestamp) {
      latest.set(reading.shortName, reading);
    }
  }

  return latest;
}

// ─── Protocol Equivalence ──────────────────────────────────────────────────

/**
 * Map of equivalent parameters across protocols
 * Used for cross-protocol correlation and comparison
 */
export const PROTOCOL_EQUIVALENTS: Record<string, string[]> = {
  // Engine parameters
  RPM: ['RPM', 'ENGINE_SPEED', 'EEC1_ENGINE_SPEED'],
  ECT: ['ECT', 'COOLANT_TEMP', 'ET1_COOLANT_TEMP'],
  EGT: ['EGT', 'EXHAUST_TEMP', 'ET1_EXHAUST_TEMP'],
  MAP: ['MAP', 'BOOST_PRESSURE', 'EEC1_BOOST'],
  MAF: ['MAF', 'AIR_FLOW', 'EEC1_AIR_FLOW'],
  TPS: ['TPS', 'THROTTLE_POS', 'ACCELERATOR_PEDAL'],

  // Transmission parameters
  GEAR: ['GEAR', 'TRANSMISSION_GEAR', 'ETC1_GEAR'],
  TCC_SLIP: ['TCC_SLIP', 'CONVERTER_SLIP', 'TRANSMISSION_SLIP'],
  TRANS_TEMP: ['TRANS_TEMP', 'TRANSMISSION_TEMP', 'ETC1_TEMP'],

  // Fuel parameters
  FUEL_PRESSURE: ['FUEL_PRESSURE', 'RAIL_PRESSURE', 'EEC1_FUEL_PRESSURE'],
  FUEL_RATE: ['FUEL_RATE', 'FUEL_CONSUMPTION', 'EEC1_FUEL_RATE'],

  // Emissions parameters
  NOX: ['NOX', 'NOX_LEVEL', 'EMISSIONS_NOX'],
  DPF_PRESSURE: ['DPF_PRESSURE', 'DPF_DIFF_PRESSURE', 'EMISSIONS_DPF'],
};

/**
 * Find equivalent parameter names across protocols
 */
export function findEquivalentParameters(shortName: string): string[] {
  const normalized = shortName.toUpperCase();

  for (const [key, equivalents] of Object.entries(PROTOCOL_EQUIVALENTS)) {
    if (equivalents.some(e => e === normalized)) {
      return equivalents;
    }
  }

  return [normalized];
}

/**
 * Check if two readings represent the same parameter (across protocols)
 */
export function areEquivalentParameters(
  reading1: NormalizedReading,
  reading2: NormalizedReading
): boolean {
  const equiv1 = findEquivalentParameters(reading1.shortName);
  const equiv2 = findEquivalentParameters(reading2.shortName);

  return equiv1.some(e => equiv2.includes(e));
}
