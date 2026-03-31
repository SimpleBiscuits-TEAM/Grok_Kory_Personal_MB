/**
 * Protocol Detection and Adapter Management
 * 
 * Auto-detects which protocol (OBD-II, J1939, UDS, CAN FD, K-Line) is available
 * based on vehicle characteristics and adapter capabilities.
 * 
 * KEY PRINCIPLE: All protocols that work with the Datalogger also work with
 * IntelliSpy, and vice versa. The PCAN-USB Pro bridge supports runtime
 * protocol switching — the browser sends {"type":"set_protocol","protocol":"j1939"}
 * and the bridge reinitializes the CAN bus at the correct bitrate.
 */

import { VehicleInfo } from './obdConnection';

export type SupportedProtocol = 'obd2' | 'j1939' | 'uds' | 'canfd' | 'kline' | 'raw';

export interface ProtocolCapability {
  protocol: SupportedProtocol;
  supported: boolean;
  confidence: number;        // 0-100
  reason: string;
  baudRate?: number;
  features: string[];
  /** Whether this protocol is available in IntelliSpy bus monitor */
  intelliSpySupported: boolean;
  /** Whether this protocol is available in the Datalogger */
  dataloggerSupported: boolean;
}

export interface ProtocolDetectionResult {
  primaryProtocol: SupportedProtocol;
  availableProtocols: ProtocolCapability[];
  vehicleInfo?: VehicleInfo;
  timestamp: number;
}

/**
 * All protocols supported by the PCAN-USB Pro bridge.
 * Every protocol works with both Datalogger AND IntelliSpy.
 */
export const ALL_PROTOCOLS: Record<SupportedProtocol, {
  name: string;
  description: string;
  defaultBitrate: number;
  extendedIds: boolean;
  maxPayload: number;
}> = {
  obd2: {
    name: 'OBD-II over CAN',
    description: 'ISO 15765-4 — Standard diagnostic protocol for all post-1996 vehicles. Uses 11-bit CAN IDs at 500kbps.',
    defaultBitrate: 500000,
    extendedIds: false,
    maxPayload: 8,
  },
  j1939: {
    name: 'SAE J1939',
    description: 'Heavy-duty truck protocol using 29-bit extended CAN IDs at 250kbps. PGN-based parameter addressing.',
    defaultBitrate: 250000,
    extendedIds: true,
    maxPayload: 8,
  },
  uds: {
    name: 'UDS (ISO 14229)',
    description: 'Unified Diagnostic Services over ISO-TP. Full read/write access to ECU DIDs, security access, flash programming.',
    defaultBitrate: 500000,
    extendedIds: false,
    maxPayload: 4095, // ISO-TP multi-frame
  },
  canfd: {
    name: 'CAN FD',
    description: 'CAN with Flexible Data Rate. Supports up to 64-byte payloads with higher data bitrate (2Mbps+).',
    defaultBitrate: 500000,
    extendedIds: false,
    maxPayload: 64,
  },
  kline: {
    name: 'K-Line (ISO 9141-2)',
    description: 'Legacy single-wire serial protocol for pre-2010 European vehicles. 10.4kbps with 5-baud wakeup.',
    defaultBitrate: 10400,
    extendedIds: false,
    maxPayload: 255,
  },
  raw: {
    name: 'Raw CAN',
    description: 'Direct CAN frame send/receive with no protocol interpretation. Useful for reverse engineering and custom protocols.',
    defaultBitrate: 500000,
    extendedIds: false,
    maxPayload: 8,
  },
};

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
    baudRate: 500000,
    features: [
      'Standard PIDs (Mode 01)',
      'Extended PIDs (Mode 22 — GM, Cummins, Ford)',
      'DTC Reading (Mode 03)',
      'DTC Clearing (Mode 04)',
      'VIN Reading (Mode 09)',
      'Mode 06 Test Results',
      'Freeze Frame Data',
      'Pending DTCs',
    ],
    intelliSpySupported: true,
    dataloggerSupported: true,
  });

  // UDS (Available on all modern vehicles with CAN)
  const isModern = !vehicleInfo || !vehicleInfo.year || vehicleInfo.year >= 2008;
  capabilities.push({
    protocol: 'uds',
    supported: true,
    confidence: isModern ? 95 : 60,
    reason: isModern
      ? 'UDS is supported on virtually all modern vehicles (2008+)'
      : 'UDS may be available on older vehicles with CAN bus',
    baudRate: 500000,
    features: [
      'DiagnosticSessionControl (0x10) — default, programming, extended',
      'ECUReset (0x11) — hard, key-off-on, soft reset',
      'ReadDataByIdentifier (0x22) — read any DID',
      'SecurityAccess (0x27) — seed/key authentication',
      'WriteDataByIdentifier (0x2E) — write DIDs (calibration)',
      'RoutineControl (0x31) — start/stop/request results',
      'RequestDownload (0x34) — initiate flash download',
      'TransferData (0x36) — send flash data blocks',
      'RequestTransferExit (0x37) — finalize flash',
      'TesterPresent (0x3E) — keep session alive',
      'Live Flash Parameter Monitoring',
    ],
    intelliSpySupported: true,
    dataloggerSupported: true,
  });

  // CAN FD (2020+ vehicles increasingly use CAN FD)
  const isCandFdLikely = !!(vehicleInfo?.year && vehicleInfo.year >= 2020);
  capabilities.push({
    protocol: 'canfd',
    supported: true,
    confidence: isCandFdLikely ? 80 : 30,
    reason: isCandFdLikely
      ? `${vehicleInfo?.year || ''} model likely supports CAN FD`
      : 'CAN FD is available on 2020+ vehicles. Requires PCAN-USB FD or PCAN-USB Pro.',
    baudRate: 500000,
    features: [
      'Up to 64-byte payloads (vs 8 bytes for classic CAN)',
      'Higher data bitrate (2Mbps+ for data phase)',
      'Backward compatible with classic CAN',
      'Faster ECU flash programming',
      'Higher throughput datalogging',
    ],
    intelliSpySupported: true,
    dataloggerSupported: true,
  });

  if (!vehicleInfo) {
    // Add J1939, K-Line, and Raw with defaults
    capabilities.push({
      protocol: 'j1939',
      supported: true,
      confidence: 30,
      reason: 'J1939 is primarily for heavy-duty trucks and Cummins-equipped vehicles',
      baudRate: 250000,
      features: getProtocolFeatures('j1939'),
      intelliSpySupported: true,
      dataloggerSupported: true,
    });
    capabilities.push({
      protocol: 'kline',
      supported: true,
      confidence: 20,
      reason: 'K-Line is primarily for pre-2010 European vehicles',
      baudRate: 10400,
      features: getProtocolFeatures('kline'),
      intelliSpySupported: false, // K-Line doesn't support bus monitoring
      dataloggerSupported: true,
    });
    capabilities.push({
      protocol: 'raw',
      supported: true,
      confidence: 100,
      reason: 'Raw CAN is always available for direct frame access',
      baudRate: 500000,
      features: getProtocolFeatures('raw'),
      intelliSpySupported: true,
      dataloggerSupported: true,
    });
    return capabilities.sort((a, b) => b.confidence - a.confidence);
  }

  // J1939 (Heavy-duty trucks, Cummins, 2007+)
  const isHeavyDuty = isHeavyDutyVehicle(vehicleInfo);
  const isCummins = isCumminsVehicle(vehicleInfo);
  const isJ1939Likely = !!(vehicleInfo.year && vehicleInfo.year >= 2007 && (isHeavyDuty || isCummins));

  capabilities.push({
    protocol: 'j1939',
    supported: isJ1939Likely,
    confidence: isJ1939Likely ? (isCummins ? 95 : 85) : 20,
    reason: isJ1939Likely
      ? `${vehicleInfo.make} ${vehicleInfo.model} (${vehicleInfo.year}) uses J1939${isCummins ? ' (Cummins ISB/ISX)' : ' (heavy-duty)'}`
      : 'J1939 is primarily for heavy-duty trucks and Cummins-equipped vehicles (2007+)',
    baudRate: 250000,
    features: [
      'Engine Parameters — EEC1 (RPM, torque), EEC2 (accel pedal, load)',
      'Temperature Monitoring — ET1 (coolant, fuel, oil)',
      'Fuel Economy — FE (fuel rate, instantaneous economy)',
      'Inlet/Exhaust — IC1 (boost, intake temp, EGT)',
      'Transmission — ETC1 (gear, output shaft RPM)',
      'Active Fault Codes — DM1 (real-time DTCs)',
      'Previously Active Faults — DM2 (stored DTCs)',
      'Emissions DTCs — DM12',
      'Multi-packet Transport Protocol (BAM/RTS-CTS)',
      'PGN-based Parameter Addressing',
    ],
    intelliSpySupported: true,
    dataloggerSupported: true,
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
    features: getProtocolFeatures('kline'),
    intelliSpySupported: false,
    dataloggerSupported: true,
  });

  // Raw CAN (always available)
  capabilities.push({
    protocol: 'raw',
    supported: true,
    confidence: 100,
    reason: 'Raw CAN is always available for direct frame access and reverse engineering',
    baudRate: 500000,
    features: getProtocolFeatures('raw'),
    intelliSpySupported: true,
    dataloggerSupported: true,
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
    'Volvo', 'Freightliner', 'Peterbilt', 'Kenworth', 'Mack',
    'International', 'Navistar', 'CAT', 'Caterpillar', 'Detroit',
    'Isuzu', 'Hino', 'Western Star', 'Autocar', 'Oshkosh',
  ];

  const makeUpper = vehicleInfo.make.toUpperCase();
  return heavyDutyMakes.some((make) => makeUpper.includes(make.toUpperCase()));
}

/**
 * Determine if vehicle has a Cummins engine (J1939 + OBD-II dual-protocol)
 */
function isCumminsVehicle(vehicleInfo: VehicleInfo): boolean {
  if (!vehicleInfo.make && !vehicleInfo.model) return false;
  const combined = `${vehicleInfo.make || ''} ${vehicleInfo.model || ''}`.toUpperCase();
  
  // Ram trucks with Cummins 6.7L ISB
  if (combined.includes('RAM') && (combined.includes('2500') || combined.includes('3500') || combined.includes('4500') || combined.includes('5500'))) {
    return true;
  }
  // Direct Cummins references
  if (combined.includes('CUMMINS') || combined.includes('ISB') || combined.includes('ISX') || combined.includes('ISL')) {
    return true;
  }
  return false;
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
  return ALL_PROTOCOLS[protocol]?.defaultBitrate ?? 500000;
}

/**
 * Check if protocol supports live tuning (write capability)
 */
export function supportsLiveTuning(protocol: SupportedProtocol): boolean {
  switch (protocol) {
    case 'obd2':
      return true; // UDS 0x2E/0x3D support
    case 'uds':
      return true; // Full read/write DID access
    case 'j1939':
      return false; // J1939 is primarily read-only
    case 'canfd':
      return true; // CAN FD supports UDS
    case 'kline':
      return true; // Mode 0x2E/0x3D support
    case 'raw':
      return true; // Direct frame access
    default:
      return false;
  }
}

/**
 * Check if protocol supports flash monitoring (IntelliSpy live flash decode)
 */
export function supportsFlashMonitoring(protocol: SupportedProtocol): boolean {
  return protocol === 'uds' || protocol === 'obd2' || protocol === 'canfd' || protocol === 'raw';
}

/**
 * Get protocol-specific features
 */
export function getProtocolFeatures(protocol: SupportedProtocol): string[] {
  const capabilities: Record<SupportedProtocol, string[]> = {
    obd2: [
      'Standard PIDs (Mode 01)',
      'Extended PIDs (Mode 22 — GM, Cummins, Ford)',
      'DTC Reading (Mode 03)',
      'DTC Clearing (Mode 04)',
      'VIN Reading (Mode 09)',
      'Mode 06 Test Results',
      'Live Tuning (UDS 0x2E/0x3D)',
      'Freeze Frame Data',
      'Pending DTCs',
    ],
    j1939: [
      'Engine Parameters — EEC1 (RPM, torque)',
      'Engine Parameters — EEC2 (accel pedal, load)',
      'Temperature Monitoring — ET1 (coolant, fuel, oil)',
      'Fuel Economy — FE (fuel rate, economy)',
      'Inlet/Exhaust — IC1 (boost, intake temp, EGT)',
      'Transmission — ETC1 (gear, output shaft RPM)',
      'Active Fault Codes — DM1',
      'Previously Active Faults — DM2',
      'Emissions DTCs — DM12',
      'Multi-packet Transport Protocol (BAM/RTS-CTS)',
      'PGN-based Parameter Addressing',
      'Broadcast Communication',
    ],
    uds: [
      'DiagnosticSessionControl (0x10)',
      'ECUReset (0x11)',
      'ReadDataByIdentifier (0x22)',
      'SecurityAccess (0x27)',
      'WriteDataByIdentifier (0x2E)',
      'RoutineControl (0x31)',
      'RequestDownload (0x34)',
      'RequestUpload (0x35)',
      'TransferData (0x36)',
      'RequestTransferExit (0x37)',
      'TesterPresent (0x3E)',
      'Live Flash Parameter Monitoring',
    ],
    canfd: [
      'Up to 64-byte payloads',
      'Higher data bitrate (2Mbps+)',
      'Backward compatible with classic CAN',
      'Faster ECU flash programming',
      'Higher throughput datalogging',
      'All OBD-II/UDS services over FD frames',
    ],
    kline: [
      'OBD-II Modes (01-09)',
      'Manufacturer-specific Modes (22, 23)',
      'Single-wire Communication',
      '5-baud Wakeup',
      'DTC Reading',
      'DTC Clearing',
      'Live Tuning (Mode 0x2E/0x3D)',
      'Legacy Vehicle Support',
    ],
    raw: [
      'Direct CAN frame send/receive',
      'No protocol interpretation',
      'Custom arbitration IDs',
      'Extended (29-bit) and standard (11-bit) IDs',
      'Bus reverse engineering',
      'Protocol sniffing',
      'Custom diagnostic sequences',
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
      return 'PCAN-USB Pro (recommended) or OBDLink EX with CAN mode — 250kbps, 29-bit extended IDs';
    case 'uds':
      return 'PCAN-USB Pro (recommended) or OBDLink EX — full UDS service support';
    case 'canfd':
      return 'PCAN-USB FD or PCAN-USB Pro FD — required for CAN FD (64-byte payloads)';
    case 'kline':
      return 'K-Line adapter (e.g., OBDLink EX, FTDI-based adapter)';
    case 'raw':
      return 'PCAN-USB Pro (recommended) — direct CAN frame access';
    case 'obd2':
    default:
      return 'OBDLink EX (recommended), PCAN-USB Pro, or any ELM327-compatible adapter';
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
    notes: 'Universal standard for all post-1996 vehicles. Works with Datalogger and IntelliSpy.',
  },
  {
    protocol: 'uds',
    minYear: 2008,
    regions: ['North America', 'Europe', 'Asia'],
    commonMakes: ['All'],
    notes: 'Unified Diagnostic Services — available on all modern vehicles with CAN. Full read/write DID access, flash programming, security access. Works with Datalogger and IntelliSpy.',
  },
  {
    protocol: 'j1939',
    minYear: 2007,
    regions: ['North America', 'Europe', 'Asia'],
    commonMakes: [
      'Cummins', 'Ram', 'Duramax', 'Powerstroke',
      'Volvo', 'Freightliner', 'Peterbilt', 'Kenworth',
      'Mack', 'International', 'Detroit', 'CAT',
    ],
    notes: 'Heavy-duty trucks, commercial vehicles, and Cummins-equipped Ram trucks. PGN-based addressing at 250kbps. Works with Datalogger and IntelliSpy.',
  },
  {
    protocol: 'canfd',
    minYear: 2020,
    regions: ['North America', 'Europe'],
    commonMakes: ['BMW', 'Audi', 'Mercedes', 'Volkswagen', 'Ford', 'GM'],
    notes: 'CAN with Flexible Data Rate — 64-byte payloads, higher throughput. Requires PCAN-USB FD adapter. Works with Datalogger and IntelliSpy.',
  },
  {
    protocol: 'kline',
    minYear: 1996,
    maxYear: 2010,
    regions: ['Europe', 'Asia'],
    commonMakes: ['BMW', 'Audi', 'Mercedes', 'Volkswagen', 'Bosch', 'Siemens'],
    notes: 'Legacy protocol for pre-2010 European vehicles. Works with Datalogger only (no bus monitor).',
  },
  {
    protocol: 'raw',
    minYear: 1996,
    regions: ['North America', 'Europe', 'Asia'],
    commonMakes: ['All'],
    notes: 'Direct CAN frame access for reverse engineering and custom protocols. Works with Datalogger and IntelliSpy.',
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
  return (['obd2', 'j1939', 'uds', 'canfd', 'kline', 'raw'] as const).filter((protocol) =>
    isProtocolLikelyForVehicle(protocol, year, make)
  );
}

/**
 * UDS Service Definitions — used by IntelliSpy to decode flash operations
 */
export const UDS_SERVICES: Record<number, { name: string; description: string; isFlashRelated: boolean }> = {
  0x10: { name: 'DiagnosticSessionControl', description: 'Switch diagnostic session (default/programming/extended)', isFlashRelated: true },
  0x11: { name: 'ECUReset', description: 'Reset the ECU (hard/key-off-on/soft)', isFlashRelated: true },
  0x14: { name: 'ClearDiagnosticInformation', description: 'Clear stored DTCs', isFlashRelated: false },
  0x19: { name: 'ReadDTCInformation', description: 'Read diagnostic trouble codes', isFlashRelated: false },
  0x22: { name: 'ReadDataByIdentifier', description: 'Read a DID value from ECU', isFlashRelated: false },
  0x23: { name: 'ReadMemoryByAddress', description: 'Read ECU memory at specific address', isFlashRelated: true },
  0x27: { name: 'SecurityAccess', description: 'Seed/key authentication for protected operations', isFlashRelated: true },
  0x28: { name: 'CommunicationControl', description: 'Enable/disable ECU communication', isFlashRelated: true },
  0x2E: { name: 'WriteDataByIdentifier', description: 'Write a DID value to ECU (calibration parameter)', isFlashRelated: true },
  0x2F: { name: 'InputOutputControlByIdentifier', description: 'Control ECU I/O (actuator test)', isFlashRelated: false },
  0x31: { name: 'RoutineControl', description: 'Start/stop/request results of ECU routine', isFlashRelated: true },
  0x34: { name: 'RequestDownload', description: 'Initiate flash download to ECU', isFlashRelated: true },
  0x35: { name: 'RequestUpload', description: 'Initiate flash upload from ECU', isFlashRelated: true },
  0x36: { name: 'TransferData', description: 'Transfer flash data block', isFlashRelated: true },
  0x37: { name: 'RequestTransferExit', description: 'Finalize flash transfer', isFlashRelated: true },
  0x3E: { name: 'TesterPresent', description: 'Keep diagnostic session alive', isFlashRelated: false },
  0x85: { name: 'ControlDTCSetting', description: 'Enable/disable DTC storage', isFlashRelated: true },
};

/**
 * J1939 Common PGN Definitions — used by IntelliSpy to decode J1939 frames
 */
export const J1939_PGNS: Record<number, { name: string; description: string; source: string }> = {
  61444: { name: 'EEC1', description: 'Electronic Engine Controller 1 — RPM, driver demand torque, actual torque', source: 'Engine ECU' },
  61443: { name: 'EEC2', description: 'Electronic Engine Controller 2 — accelerator pedal, engine load', source: 'Engine ECU' },
  65247: { name: 'EEC3', description: 'Electronic Engine Controller 3 — nominal friction torque', source: 'Engine ECU' },
  65262: { name: 'ET1', description: 'Engine Temperature 1 — coolant temp, fuel temp, oil temp', source: 'Engine ECU' },
  65263: { name: 'EFL/P1', description: 'Engine Fluid Level/Pressure 1 — oil pressure, coolant level, fuel delivery pressure', source: 'Engine ECU' },
  65265: { name: 'CCVS1', description: 'Cruise Control/Vehicle Speed 1 — vehicle speed, cruise state', source: 'Engine ECU' },
  65266: { name: 'LFE1', description: 'Fuel Economy — fuel rate, instantaneous fuel economy', source: 'Engine ECU' },
  65270: { name: 'IC1', description: 'Inlet/Exhaust Conditions 1 — boost pressure, intake manifold temp, EGT', source: 'Engine ECU' },
  65271: { name: 'VEP1', description: 'Vehicle Electrical Power 1 — battery voltage, alternator current', source: 'Engine ECU' },
  65272: { name: 'TF1', description: 'Transmission Fluids 1 — trans oil temp, trans oil pressure', source: 'Transmission ECU' },
  65257: { name: 'FC1', description: 'Fuel Consumption — total fuel used, trip fuel', source: 'Engine ECU' },
  65269: { name: 'AMB', description: 'Ambient Conditions — ambient air temp, barometric pressure', source: 'Engine ECU' },
  65226: { name: 'DM1', description: 'Active Diagnostic Trouble Codes', source: 'Any ECU' },
  65227: { name: 'DM2', description: 'Previously Active Diagnostic Trouble Codes', source: 'Any ECU' },
  65228: { name: 'DM3', description: 'Diagnostic Data Clear/Reset', source: 'Service Tool' },
  65229: { name: 'DM4', description: 'Freeze Frame Parameters', source: 'Any ECU' },
  65230: { name: 'DM5', description: 'Diagnostic Readiness 1', source: 'Engine ECU' },
  65235: { name: 'DM12', description: 'Emissions-Related Active DTCs', source: 'Engine ECU' },
  65253: { name: 'HRS', description: 'Engine Hours/Revolutions — total engine hours', source: 'Engine ECU' },
  65260: { name: 'VIN', description: 'Vehicle Identification Number', source: 'Engine ECU' },
  65261: { name: 'SOFT', description: 'Software Identification', source: 'Any ECU' },
  65242: { name: 'SOFT2', description: 'Software Identification 2', source: 'Any ECU' },
  64892: { name: 'AT1IG1', description: 'Aftertreatment 1 Intake Gas 1 — DPF inlet temp, pressure', source: 'Aftertreatment ECU' },
  64891: { name: 'AT1OG1', description: 'Aftertreatment 1 Outlet Gas 1 — DPF outlet temp', source: 'Aftertreatment ECU' },
  64948: { name: 'AT1HIS1', description: 'Aftertreatment 1 Historical Info — soot load, regen count', source: 'Aftertreatment ECU' },
};
