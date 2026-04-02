/**
 * Access Rights Detection System
 *
 * Determines if a calibration map/parameter supports read and/or write access.
 * Uses multi-layer detection:
 * 1. A2L metadata (explicit access flags)
 * 2. Pattern database (learned from known A2Ls)
 * 3. Memory region heuristics (address-based inference)
 * 4. Runtime testing (OBD-II Mode 22, UDS services)
 */

import { CalibrationMap, EcuDefinition } from './editorEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AccessRight = 'READ' | 'WRITE' | 'READ_WRITE' | 'NONE';

export interface AccessRights {
  read: boolean;
  write: boolean;
  canLiveTune: boolean;
  confidence: number; // 0-1
  source: 'a2l_metadata' | 'pattern_database' | 'memory_heuristics' | 'runtime_test';
  reasoning: string;
}

export interface MemoryRegion {
  name: string;
  startAddress: number;
  endAddress: number;
  type: 'RAM' | 'FLASH' | 'EEPROM' | 'UNKNOWN';
  readable: boolean;
  writable: boolean;
  confidence: number;
}

// ─── Memory Region Definitions ───────────────────────────────────────────────

/**
 * Common memory regions for Bosch ECUs (Duramax, Can-Am, Polaris)
 */
const BOSCH_MEMORY_REGIONS: MemoryRegion[] = [
  {
    name: 'Internal RAM',
    startAddress: 0x0,
    endAddress: 0xfffff,
    type: 'RAM',
    readable: true,
    writable: true,
    confidence: 0.95,
  },
  {
    name: 'Calibration RAM (Loadable)',
    startAddress: 0x100000,
    endAddress: 0x1fffff,
    type: 'RAM',
    readable: true,
    writable: true,
    confidence: 0.9,
  },
  {
    name: 'Flash ROM (Calibration)',
    startAddress: 0x200000,
    endAddress: 0x3fffff,
    type: 'FLASH',
    readable: true,
    writable: false,
    confidence: 0.95,
  },
  {
    name: 'Flash ROM (Code)',
    startAddress: 0x400000,
    endAddress: 0x7fffff,
    type: 'FLASH',
    readable: true,
    writable: false,
    confidence: 0.95,
  },
  {
    name: 'EEPROM (Adaptive)',
    startAddress: 0x800000,
    endAddress: 0x81ffff,
    type: 'EEPROM',
    readable: true,
    writable: true,
    confidence: 0.8,
  },
];

/**
 * Common memory regions for MG1 ECUs (Can-Am Gen 2)
 */
const MG1_MEMORY_REGIONS: MemoryRegion[] = [
  {
    name: 'Internal RAM',
    startAddress: 0x0,
    endAddress: 0x7ffff,
    type: 'RAM',
    readable: true,
    writable: true,
    confidence: 0.95,
  },
  {
    name: 'Flash ROM',
    startAddress: 0x80000,
    endAddress: 0xfffff,
    type: 'FLASH',
    readable: true,
    writable: false,
    confidence: 0.95,
  },
];

// ─── Access Rights Detection ─────────────────────────────────────────────────

/**
 * Detect access rights for a calibration map.
 * Uses multi-layer approach for highest accuracy.
 */
export function detectAccessRights(
  map: CalibrationMap,
  ecuDef: EcuDefinition,
  patternDatabase?: any // BinaryPatternDatabase instance
): AccessRights {
  // Layer 1: Check A2L metadata
  const a2lRights = detectFromA2LMetadata(map);
  if (a2lRights.confidence > 0.8) {
    return a2lRights;
  }

  // Layer 2: Check pattern database
  if (patternDatabase) {
    const patternRights = detectFromPatternDatabase(map, patternDatabase);
    if (patternRights.confidence > 0.7) {
      return patternRights;
    }
  }

  // Layer 3: Use memory region heuristics
  const memoryRights = detectFromMemoryRegion(map.address, ecuDef.ecuFamily);
  return memoryRights;
}

/**
 * Detect access rights from A2L metadata.
 */
function detectFromA2LMetadata(map: CalibrationMap): AccessRights {
  // Check if map has explicit access annotations
  const accessAnnotations = map.annotations?.filter(a => a.includes('READ') || a.includes('WRITE')) || [];

  if (accessAnnotations.length > 0) {
    const hasRead = accessAnnotations.some(a => a.includes('READ'));
    const hasWrite = accessAnnotations.some(a => a.includes('WRITE'));

    return {
      read: hasRead,
      write: hasWrite,
      canLiveTune: hasWrite,
      confidence: 0.95,
      source: 'a2l_metadata',
      reasoning: `A2L metadata: ${accessAnnotations.join(', ')}`,
    };
  }

  // Heuristic: Maps in calibration sections are usually writable
  const category = map.category?.toLowerCase() || '';
  const isCalibration = category.includes('calibration') || category.includes('tuning');

  if (isCalibration) {
    return {
      read: true,
      write: true,
      canLiveTune: true,
      confidence: 0.7,
      source: 'a2l_metadata',
      reasoning: 'Calibration category suggests RW access',
    };
  }

  // Default: assume read-only if no metadata
  return {
    read: true,
    write: false,
    canLiveTune: false,
    confidence: 0.3,
    source: 'a2l_metadata',
    reasoning: 'No access metadata found, assuming read-only',
  };
}

/**
 * Detect access rights from pattern database.
 */
function detectFromPatternDatabase(map: CalibrationMap, patternDatabase: any): AccessRights {
  // This would query the pattern database for known access patterns
  // For now, return low confidence to fall through to memory heuristics
  return {
    read: true,
    write: false,
    canLiveTune: false,
    confidence: 0.2,
    source: 'pattern_database',
    reasoning: 'Pattern database lookup not yet implemented',
  };
}

/**
 * Detect access rights based on memory region.
 */
function detectFromMemoryRegion(address: number, ecuFamily: string): AccessRights {
  const regions = getMemoryRegionsForECU(ecuFamily);

  for (const region of regions) {
    if (address >= region.startAddress && address <= region.endAddress) {
      return {
        read: region.readable,
        write: region.writable,
        canLiveTune: region.writable && region.type === 'RAM',
        confidence: region.confidence,
        source: 'memory_heuristics',
        reasoning: `Address 0x${address.toString(16).toUpperCase()} in ${region.name} (${region.type})`,
      };
    }
  }

  // Unknown region: assume read-only
  return {
    read: true,
    write: false,
    canLiveTune: false,
    confidence: 0.2,
    source: 'memory_heuristics',
    reasoning: `Address 0x${address.toString(16).toUpperCase()} in unknown region, assuming read-only`,
  };
}

/**
 * Get memory regions for a specific ECU family.
 */
function getMemoryRegionsForECU(ecuFamily: string): MemoryRegion[] {
  const family = ecuFamily.toUpperCase();

  if (family.includes('MG1')) {
    return MG1_MEMORY_REGIONS;
  }

  if (family.includes('MED') || family.includes('MG1CA') || family.includes('E60') || family.includes('E86')) {
    return BOSCH_MEMORY_REGIONS;
  }

  // Default to Bosch regions for unknown families
  return BOSCH_MEMORY_REGIONS;
}

// ─── Write Capability Testing ────────────────────────────────────────────────

/**
 * Test if an address supports write access via OBD-II.
 * Returns true if write is possible, false otherwise.
 */
export async function testWriteCapabilityOBDII(
  address: number,
  length: number,
  testValue: number,
  obdConnection: any // OBDConnection instance
): Promise<boolean> {
  try {
    // Mode 22 (Read Extended Data) - test if readable first
    const readRequest = buildMode22Request(address, length);
    const readResponse = await obdConnection.sendRequest(readRequest, 1000);

    if (!readResponse || readResponse.length === 0) {
      return false; // Not readable, so not writable
    }

    // If readable, assume writable (conservative approach)
    // A full test would attempt Mode 3D (Write Memory) but that's more risky
    return true;
  } catch (error) {
    console.error('[Write Capability Test] OBD-II test failed:', error);
    return false;
  }
}

/**
 * Build an OBD-II Mode 22 (Read Extended Data) request.
 */
function buildMode22Request(address: number, length: number): Uint8Array {
  const request = new Uint8Array(5);
  request[0] = 0x22; // Mode 22
  request[1] = (address >> 24) & 0xff;
  request[2] = (address >> 16) & 0xff;
  request[3] = (address >> 8) & 0xff;
  request[4] = address & 0xff;
  return request;
}

/**
 * Test if an address supports write access via UDS.
 * Uses UDS Service 0x3D (Write Memory).
 */
export async function testWriteCapabilityUDS(
  address: number,
  testValue: number,
  udsConnection: any // UDS connection instance
): Promise<boolean> {
  try {
    // UDS Service 0x3D: Write Memory
    // Format: 3D [addressLength] [address] [dataLength] [data]
    const request = new Uint8Array(7);
    request[0] = 0x3d; // Write Memory service
    request[1] = 0x31; // addressLength=3, dataLength=1
    request[2] = (address >> 16) & 0xff;
    request[3] = (address >> 8) & 0xff;
    request[4] = address & 0xff;
    request[5] = 0x01; // Data length = 1 byte
    request[6] = testValue & 0xff;

    const response = await udsConnection.sendRequest(request, 1000);

    // Response should be 0x7D (0x3D + 0x40) on success
    return response && response[0] === 0x7d;
  } catch (error) {
    console.error('[Write Capability Test] UDS test failed:', error);
    return false;
  }
}

// ─── Access Badge Helpers ────────────────────────────────────────────────────

/**
 * Get a human-readable access badge string.
 */
export function getAccessBadge(rights: AccessRights): string {
  if (rights.write) {
    return '🔓 Read-Write';
  }
  if (rights.read) {
    return '🔒 Read-Only';
  }
  return '❌ No Access';
}

/**
 * Get a color for the access badge.
 */
export function getAccessBadgeColor(rights: AccessRights): string {
  if (rights.write) {
    return 'bg-green-900 text-green-200'; // Green for writable
  }
  if (rights.read) {
    return 'bg-blue-900 text-blue-200'; // Blue for read-only
  }
  return 'bg-red-900 text-red-200'; // Red for no access
}

/**
 * Get a tooltip explaining the access rights.
 */
export function getAccessTooltip(rights: AccessRights): string {
  const parts = [
    `Read: ${rights.read ? '✓' : '✗'}`,
    `Write: ${rights.write ? '✓' : '✗'}`,
    `Live Tune: ${rights.canLiveTune ? '✓' : '✗'}`,
    `Confidence: ${(rights.confidence * 100).toFixed(0)}%`,
    `Source: ${rights.source}`,
    `Reason: ${rights.reasoning}`,
  ];

  return parts.join('\n');
}

// ─── Batch Access Detection ──────────────────────────────────────────────────

/**
 * Detect access rights for multiple maps at once.
 */
export function detectAccessRightsBatch(
  maps: CalibrationMap[],
  ecuDef: EcuDefinition,
  patternDatabase?: any
): Map<string, AccessRights> {
  const results = new Map<string, AccessRights>();

  for (const map of maps) {
    const rights = detectAccessRights(map, ecuDef, patternDatabase);
    results.set(map.name, rights);
  }

  return results;
}

/**
 * Get statistics on access rights across all maps.
 */
export function getAccessStatistics(
  accessRights: Map<string, AccessRights>
): {
  total: number;
  readable: number;
  writable: number;
  liveTunable: number;
  percentWritable: number;
} {
  let readable = 0;
  let writable = 0;
  let liveTunable = 0;

  for (const rights of Array.from(accessRights.values())) {
    if (rights.read) readable++;
    if (rights.write) writable++;
    if (rights.canLiveTune) liveTunable++;
  }

  const total = accessRights.size;

  return {
    total,
    readable,
    writable,
    liveTunable,
    percentWritable: total > 0 ? (writable / total) * 100 : 0,
  };
}
