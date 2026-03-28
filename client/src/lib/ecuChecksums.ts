/**
 * ECU Checksum Calculation and Validation
 * 
 * Implements checksum algorithms for:
 * - Bosch MG1 (Polaris Spyder/Maverick)
 * - Bosch ME17 (Can-Am Rotax)
 * - Other Bosch ECUs
 */

export interface ChecksumResult {
  success: boolean;
  message: string;
  checksumLocations: ChecksumLocation[];
  checksumsBefore: Map<number, number>;
  checksumsAfter: Map<number, number>;
  patchedBinary?: Uint8Array;
}

export interface ChecksumLocation {
  offset: number;
  size: number;
  type: 'crc32' | 'sum8' | 'sum16' | 'sum32' | 'fletcher16' | 'fletcher32';
  description: string;
  blockStart?: number;
  blockEnd?: number;
}

/**
 * MG1 Checksum Locations
 * Based on Polaris MG1C400A1T2 structure
 */
const MG1_CHECKSUMS: ChecksumLocation[] = [
  {
    offset: 0x1FFC,
    size: 4,
    type: 'crc32',
    description: 'MG1 Main CRC32 at 0x1FFC',
    blockStart: 0x0000,
    blockEnd: 0x1FFB,
  },
  {
    offset: 0x1FF8,
    size: 4,
    type: 'sum32',
    description: 'MG1 Checksum at 0x1FF8',
    blockStart: 0x0000,
    blockEnd: 0x1FF7,
  },
];

/**
 * ME17 Checksum Locations
 * Based on Bosch ME17.8.5 structure
 */
const ME17_CHECKSUMS: ChecksumLocation[] = [
  {
    offset: 0x1FFFC,
    size: 4,
    type: 'crc32',
    description: 'ME17 Main CRC32 at 0x1FFFC',
    blockStart: 0x00000,
    blockEnd: 0x1FFFB,
  },
  {
    offset: 0x1FFF8,
    size: 4,
    type: 'sum32',
    description: 'ME17 Checksum at 0x1FFF8',
    blockStart: 0x00000,
    blockEnd: 0x1FFF7,
  },
];

/**
 * Calculate CRC32 (Ethernet polynomial)
 */
export function calculateCRC32(data: Uint8Array, start: number = 0, end: number = data.length): number {
  const CRC32_POLYNOMIAL = 0xEDB88320;
  let crc = 0xFFFFFFFF;

  for (let i = start; i < Math.min(end, data.length); i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? CRC32_POLYNOMIAL : 0);
    }
  }

  return (crc ^ 0xFFFFFFFF) >>> 0; // Ensure unsigned 32-bit
}

/**
 * Calculate 8-bit sum (simple byte sum)
 */
export function calculateSum8(data: Uint8Array, start: number = 0, end: number = data.length): number {
  let sum = 0;
  for (let i = start; i < Math.min(end, data.length); i++) {
    sum = (sum + data[i]) & 0xFF;
  }
  return sum;
}

/**
 * Calculate 16-bit sum
 */
export function calculateSum16(data: Uint8Array, start: number = 0, end: number = data.length): number {
  let sum = 0;
  for (let i = start; i < Math.min(end, data.length); i += 2) {
    if (i + 1 < Math.min(end, data.length)) {
      sum = (sum + (data[i] | (data[i + 1] << 8))) & 0xFFFF;
    } else {
      sum = (sum + data[i]) & 0xFFFF;
    }
  }
  return sum;
}

/**
 * Calculate 32-bit sum
 */
export function calculateSum32(data: Uint8Array, start: number = 0, end: number = data.length): number {
  let sum = 0;
  for (let i = start; i < Math.min(end, data.length); i += 4) {
    let val = 0;
    for (let j = 0; j < 4 && i + j < Math.min(end, data.length); j++) {
      val |= data[i + j] << (j * 8);
    }
    sum = (sum + val) >>> 0;
  }
  return sum >>> 0;
}

/**
 * Calculate Fletcher16 checksum
 */
export function calculateFletcher16(data: Uint8Array, start: number = 0, end: number = data.length): number {
  let sum1 = 0;
  let sum2 = 0;

  for (let i = start; i < Math.min(end, data.length); i++) {
    sum1 = (sum1 + data[i]) % 255;
    sum2 = (sum2 + sum1) % 255;
  }

  return ((sum2 << 8) | sum1) >>> 0;
}

/**
 * Calculate Fletcher32 checksum
 */
export function calculateFletcher32(data: Uint8Array, start: number = 0, end: number = data.length): number {
  let sum1 = 0xFFFF;
  let sum2 = 0xFFFF;

  for (let i = start; i < Math.min(end, data.length); i += 2) {
    const val = (i + 1 < Math.min(end, data.length))
      ? (data[i] | (data[i + 1] << 8))
      : data[i];
    sum1 = (sum1 + val) >>> 0;
    sum2 = (sum2 + sum1) >>> 0;
  }

  sum1 = (sum1 ^ 0xFFFF) >>> 0;
  sum2 = (sum2 ^ 0xFFFF) >>> 0;

  return ((sum2 << 16) | sum1) >>> 0;
}

/**
 * Calculate checksum based on type
 */
function calculateChecksum(data: Uint8Array, location: ChecksumLocation): number {
  const start = location.blockStart ?? 0;
  const end = location.blockEnd ?? data.length;

  switch (location.type) {
    case 'crc32':
      return calculateCRC32(data, start, end);
    case 'sum8':
      return calculateSum8(data, start, end);
    case 'sum16':
      return calculateSum16(data, start, end);
    case 'sum32':
      return calculateSum32(data, start, end);
    case 'fletcher16':
      return calculateFletcher16(data, start, end);
    case 'fletcher32':
      return calculateFletcher32(data, start, end);
    default:
      return 0;
  }
}

/**
 * Write value to binary at offset (little-endian)
 */
function writeValue(binary: Uint8Array, offset: number, value: number, size: number): void {
  for (let i = 0; i < size; i++) {
    binary[offset + i] = (value >> (i * 8)) & 0xFF;
  }
}

/**
 * Read value from binary at offset (little-endian)
 */
function readValue(binary: Uint8Array, offset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) {
    value |= binary[offset + i] << (i * 8);
  }
  return value >>> 0;
}

/**
 * Detect ECU family and get appropriate checksums
 */
function detectECUFamily(binary: Uint8Array): 'MG1' | 'ME17' | null {
  if (binary.length < 0x1012) return null;

  // Check for MG1C marker
  const ecuIdBytes = binary.slice(0x1000, 0x1012);
  const ecuId = new TextDecoder('ascii', { fatal: false }).decode(ecuIdBytes).trim();

  if (ecuId.startsWith('MG1C')) return 'MG1';
  if (ecuId.includes('ME17')) return 'ME17';

  // Default based on size
  if (binary.length === 0x200000) return 'MG1';
  if (binary.length === 0x200000) return 'ME17';

  return null;
}

/**
 * Recalculate all checksums for a binary
 */
export function recalculateChecksums(binary: Uint8Array): ChecksumResult {
  const family = detectECUFamily(binary);
  
  if (!family) {
    return {
      success: false,
      message: 'Could not detect ECU family. Binary may not be valid.',
      checksumLocations: [],
      checksumsBefore: new Map(),
      checksumsAfter: new Map(),
    };
  }

  const checksums = family === 'MG1' ? MG1_CHECKSUMS : ME17_CHECKSUMS;
  const patchedBinary = new Uint8Array(binary);
  const checksumsBefore = new Map<number, number>();
  const checksumsAfter = new Map<number, number>();
  const appliedChecksums: string[] = [];

  for (const location of checksums) {
    if (location.offset + location.size > patchedBinary.length) {
      return {
        success: false,
        message: `Checksum location 0x${location.offset.toString(16)} is outside binary bounds`,
        checksumLocations: checksums,
        checksumsBefore,
        checksumsAfter,
      };
    }

    // Read old checksum
    const oldChecksum = readValue(patchedBinary, location.offset, location.size);
    checksumsBefore.set(location.offset, oldChecksum);

    // Calculate new checksum
    const newChecksum = calculateChecksum(patchedBinary, location);
    checksumsAfter.set(location.offset, newChecksum);

    // Write new checksum
    writeValue(patchedBinary, location.offset, newChecksum, location.size);
    appliedChecksums.push(`${location.description}: 0x${oldChecksum.toString(16).padStart(8, '0')} → 0x${newChecksum.toString(16).padStart(8, '0')}`);
  }

  return {
    success: true,
    message: `Checksums recalculated for ${family} ECU`,
    checksumLocations: checksums,
    checksumsBefore,
    checksumsAfter,
    patchedBinary,
  };
}

/**
 * Validate checksums in a binary
 */
export function validateChecksums(binary: Uint8Array): {
  valid: boolean;
  family: string | null;
  results: Array<{
    location: ChecksumLocation;
    stored: number;
    calculated: number;
    valid: boolean;
  }>;
} {
  const family = detectECUFamily(binary);
  
  if (!family) {
    return {
      valid: false,
      family: null,
      results: [],
    };
  }

  const checksums = family === 'MG1' ? MG1_CHECKSUMS : ME17_CHECKSUMS;
  const results = [];
  let allValid = true;

  for (const location of checksums) {
    if (location.offset + location.size > binary.length) {
      allValid = false;
      continue;
    }

    const stored = readValue(binary, location.offset, location.size);
    const calculated = calculateChecksum(binary, location);
    const valid = stored === calculated;

    results.push({
      location,
      stored,
      calculated,
      valid,
    });

    if (!valid) allValid = false;
  }

  return {
    valid: allValid,
    family,
    results,
  };
}

/**
 * Get checksum status description
 */
export function getChecksumStatus(binary: Uint8Array): string {
  const validation = validateChecksums(binary);

  if (!validation.family) {
    return 'Unknown ECU family';
  }

  const validCount = validation.results.filter(r => r.valid).length;
  const totalCount = validation.results.length;

  if (validation.valid) {
    return `✓ All ${totalCount} checksums valid (${validation.family})`;
  } else {
    return `✗ ${totalCount - validCount}/${totalCount} checksums invalid (${validation.family})`;
  }
}
