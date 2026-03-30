/**
 * Protocol Detection and Adapter Management
 * 
 * Auto-detects which protocol (OBD-II, J1939, K-Line) is available
 * based on vehicle characteristics and adapter capabilities.
 */

import { VehicleInfo } from './obdConnection';

export type SupportedProtocol = 'obd2' | 'j1939' | 'kline' | 'vop';

export interface ProtocolCapability {
  protocol: SupportedProtocol;
  supported: boolean;
  confidence: number;        // 0-100
  reason: string;
  baudRate?: number;
  features: string[];
}

export interface ProtocolDetectionResult {
  primaryProtocol: SupportedProtocol;
  availableProtocols: ProtocolCapability[];
  vehicleInfo?: VehicleInfo;
  timestamp: number;
}

/**
 * Detect which protocols are supported based on vehicle info
 */
export function detectSupportedProtocols(vehicleInfo?: VehicleInfo): ProtocolCapability[] {
  const capabilities: ProtocolCapability[] = [];

  // OBD-II (Universal, all vehicles post-1996)
  capabilities.push({
    protocol: 'obd2',
    supported: true,
    confidence: 100,
    reason: 'OBD-II is standard on all post-1996 vehicles',
    baudRate: 10400,
    features: [
      'Standard PIDs (Mode 01)',
      'Extended PIDs (Mode 22)',
      'DTC Reading (Mode 03)',
      'DTC Clearing (Mode 04)',
      'VIN Reading (Mode 09)',
      'Live Tuning (UDS 0x2E/0x3D)',
    ],
  });

  if (!vehicleInfo) {
    return capabilities;
  }

  // J1939 (Heavy-duty trucks, 2007+)
  const isHeavyDuty = isHeavyDutyVehicle(vehicleInfo);
  const isJ1939Likely = !!(vehicleInfo.year && vehicleInfo.year >= 2007 && isHeavyDuty);

  capabilities.push({
    protocol: 'j1939',
    supported: isJ1939Likely,
    confidence: isJ1939Likely ? 85 : 20,
    reason: isJ1939Likely
      ? `${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.year}) likely uses J1939 (heavy-duty truck)`
      : 'J1939 is primarily for heavy-duty trucks (2007+)',
    baudRate: 250000,
    features: [
      'Engine Parameters (EEC1)',
      'Transmission Parameters (ETC1)',
      'Temperature Monitoring (ET1)',
      'Fuel Consumption (PGN 183296)',
      'Active Fault Codes (DM1)',
      'Previously Active Faults (DM2)',
      'Multi-packet Messages',
    ],
  });

  // K-Line (Pre-2010 vehicles, legacy systems)
  const isLegacy = !!(vehicleInfo.year && vehicleInfo.year < 2010);

  capabilities.push({
    protocol: 'kline',
    supported: isLegacy,
    confidence: isLegacy ? 75 : 10,
    reason: isLegacy
      ? `${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.year}) may use K-Line (legacy system)`
      : 'K-Line is primarily for pre-2010 vehicles',
    baudRate: 10400,
    features: [
      'OBD-II Modes (01-09)',
      'Manufacturer-specific Modes (22, 23)',
      'Single-wire Communication',
      '5-baud Wakeup',
      'DTC Reading',
      'DTC Clearing',
    ],
  });

  // V-OP (proprietary protocol — coming soon)
  capabilities.push({
    protocol: 'vop',
    supported: true,
    confidence: 50,
    reason: 'V-OP is a proprietary PPEI protocol for advanced vehicle optimization. Protocol implementation coming soon.',
    features: [
      'Proprietary PPEI Protocol',
      'Advanced Vehicle Optimization',
      'Deep ECU Integration',
      'Custom Parameter Access',
      'Real-time Calibration Sync',
      'Protocol details arriving next week',
    ],
  });

  // Sort by confidence
  return capabilities.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Determine if vehicle is likely heavy-duty (J1939)
 */
function isHeavyDutyVehicle(vehicleInfo: VehicleInfo): boolean {
  if (!vehicleInfo.make) return false;

  const heavyDutyMakes = [
    'Cummins',
    'Duramax',
    'Powerstroke',
    'Diesel',
    'Volvo',
    'Freightliner',
    'Peterbilt',
    'Kenworth',
    'Mack',
    'International',
    'Navistar',
    'CAT',
    'Caterpillar',
    'Detroit',
    'Isuzu',
    'Hino',
  ];

  const makeUpper = vehicleInfo.make.toUpperCase();
  return heavyDutyMakes.some((make) => makeUpper.includes(make.toUpperCase()));
}

/**
 * Determine primary protocol for a vehicle
 */
export function determinePrimaryProtocol(vehicleInfo?: VehicleInfo): SupportedProtocol {
  if (!vehicleInfo) return 'obd2';

  const capabilities = detectSupportedProtocols(vehicleInfo);
  const primary = capabilities[0];

  if (primary.protocol === 'j1939' && primary.confidence >= 70) {
    return 'j1939';
  }
  if (primary.protocol === 'kline' && primary.confidence >= 70) {
    return 'kline';
  }

  return 'obd2'; // Default fallback
}

/**
 * Get protocol-specific baud rate
 */
export function getProtocolBaudRate(protocol: SupportedProtocol): number {
  switch (protocol) {
    case 'j1939':
      return 250000;
    case 'kline':
      return 10400;
    case 'vop':
      return 500000; // V-OP proprietary — TBD
    case 'obd2':
    default:
      return 10400;
  }
}

/**
 * Check if protocol supports live tuning (write capability)
 */
export function supportsLiveTuning(protocol: SupportedProtocol): boolean {
  switch (protocol) {
    case 'obd2':
      return true; // UDS 0x2E/0x3D support
    case 'j1939':
      return false; // J1939 is read-only for most parameters
    case 'kline':
      return true; // Mode 0x2E/0x3D support
    case 'vop':
      return true; // V-OP supports full read/write
    default:
      return false;
  }
}

/**
 * Get protocol-specific features
 */
export function getProtocolFeatures(protocol: SupportedProtocol): string[] {
  const capabilities = {
    obd2: [
      'Standard PIDs (Mode 01)',
      'Extended PIDs (Mode 22)',
      'DTC Reading (Mode 03)',
      'DTC Clearing (Mode 04)',
      'VIN Reading (Mode 09)',
      'Live Tuning (UDS 0x2E/0x3D)',
      'Freeze Frame Data',
      'Pending DTCs',
    ],
    j1939: [
      'Engine Parameters (EEC1)',
      'Transmission Parameters (ETC1)',
      'Temperature Monitoring (ET1)',
      'Fuel Consumption (PGN 183296)',
      'Active Fault Codes (DM1)',
      'Previously Active Faults (DM2)',
      'Multi-packet Messages',
      'Broadcast Communication',
    ],
    kline: [
      'OBD-II Modes (01-09)',
      'Manufacturer-specific Modes',
      'Single-wire Communication',
      '5-baud Wakeup',
      'DTC Reading',
      'DTC Clearing',
      'Live Tuning (Mode 0x2E/0x3D)',
      'Legacy Vehicle Support',
    ],
    vop: [
      'Proprietary PPEI Protocol',
      'Advanced Vehicle Optimization',
      'Deep ECU Integration',
      'Custom Parameter Access',
      'Real-time Calibration Sync',
      'Full Read/Write Support',
    ],
  };

  return capabilities[protocol] || [];
}

/**
 * Get recommended adapter for protocol
 */
export function getRecommendedAdapter(protocol: SupportedProtocol): string {
  switch (protocol) {
    case 'j1939':
      return 'CAN adapter with 250kbps support (e.g., OBDLink EX with CAN mode)';
    case 'kline':
      return 'K-Line adapter (e.g., OBDLink EX, FTDI-based adapter)';
    case 'vop':
      return 'V-OP compatible adapter (protocol details coming soon)';
    case 'obd2':
    default:
      return 'OBD-II adapter (e.g., OBDLink EX, ELM327-compatible)';
  }
}

/**
 * Protocol compatibility matrix
 */
export interface ProtocolCompatibility {
  protocol: SupportedProtocol;
  minYear: number;
  maxYear?: number;
  regions: string[];
  commonMakes: string[];
  notes: string;
}

export const PROTOCOL_COMPATIBILITY: ProtocolCompatibility[] = [
  {
    protocol: 'obd2',
    minYear: 1996,
    regions: ['North America', 'Europe', 'Asia'],
    commonMakes: ['All'],
    notes: 'Universal standard for all post-1996 vehicles',
  },
  {
    protocol: 'j1939',
    minYear: 2007,
    regions: ['North America', 'Europe', 'Asia'],
    commonMakes: [
      'Cummins',
      'Duramax',
      'Powerstroke',
      'Volvo',
      'Freightliner',
      'Peterbilt',
      'Kenworth',
      'Mack',
    ],
    notes: 'Heavy-duty trucks and commercial vehicles',
  },
  {
    protocol: 'kline',
    minYear: 1996,
    maxYear: 2010,
    regions: ['Europe', 'Asia'],
    commonMakes: ['BMW', 'Audi', 'Mercedes', 'Volkswagen', 'Bosch', 'Siemens'],
    notes: 'Legacy protocol for pre-2010 European vehicles',
  },
  {
    protocol: 'vop',
    minYear: 1996,
    regions: ['North America', 'Europe', 'Asia'],
    commonMakes: ['All'],
    notes: 'Proprietary PPEI V-OP protocol for advanced vehicle optimization (coming soon)',
  },
];

/**
 * Check if a vehicle year/make combination likely uses a protocol
 */
export function isProtocolLikelyForVehicle(
  protocol: SupportedProtocol,
  year?: number,
  make?: string
): boolean {
  const compat = PROTOCOL_COMPATIBILITY.find((c) => c.protocol === protocol);
  if (!compat) return false;

  if (year && (year < compat.minYear || (compat.maxYear && year > compat.maxYear))) {
    return false;
  }

  if (make && !compat.commonMakes.includes('All')) {
    return compat.commonMakes.some((m) => make.toUpperCase().includes(m.toUpperCase()));
  }

  return true;
}

/**
 * Get all compatible protocols for a vehicle
 */
export function getCompatibleProtocols(year?: number, make?: string): SupportedProtocol[] {
  return (['obd2', 'j1939', 'kline', 'vop'] as const).filter((protocol) =>
    isProtocolLikelyForVehicle(protocol, year, make)
  );
}
