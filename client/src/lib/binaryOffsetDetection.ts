/**
 * Binary Offset Detection Engine
 * 
 * Detects offset mismatches between a2L files and binary files by:
 * 1. Extracting table signatures from a2L metadata
 * 2. Scanning binary for matching data patterns
 * 3. Computing offset deltas
 * 4. Validating corrections against known thresholds
 */

export interface TableSignature {
  name: string;
  a2lOffset: number;
  expectedSize: number;
  dataType: 'float32' | 'float64' | 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32';
  sampleValues: number[];
  description: string;
}

export interface OffsetDetectionResult {
  detectedOffset: number | null;
  confidence: number; // 0-100
  matchedSignatures: string[];
  offsetDelta: number;
  validationStatus: 'confirmed' | 'suspected' | 'failed';
  details: string;
  recommendedAction: string;
}

export interface OffsetCorrectionProfile {
  ecuId: string;
  vehicleType: string;
  offsetDelta: number;
  detectedAt: number;
  confirmedBy: string | null;
  tableSignaturesMatched: string[];
  notes: string;
}

/**
 * Extract table signatures from a2L metadata
 * These are known reference points in the binary
 */
export function extractTableSignatures(a2lMetadata: any): TableSignature[] {
  const signatures: TableSignature[] = [];

  // Common Polaris/Duramax table signatures
  const commonTables = [
    {
      name: 'ExhMgt_ratLamCptProtn_GM',
      pattern: [1.0, 0.975, 0.975, 0.9, 0.9, 0.9, 0.9],
      dataType: 'float32' as const,
      description: 'Exhaust management lambda component protection',
    },
    {
      name: 'EngSpd_RPMGov',
      pattern: [500, 1000, 1500, 2000, 2500, 3000],
      dataType: 'uint16' as const,
      description: 'Engine speed RPM governor',
    },
    {
      name: 'CoolantTemp_Threshold',
      pattern: [85, 90, 95, 100, 105, 110],
      dataType: 'int8' as const,
      description: 'Coolant temperature thresholds',
    },
    {
      name: 'FuelPressure_Target',
      pattern: [1000, 1200, 1400, 1600, 1800, 2000],
      dataType: 'uint16' as const,
      description: 'Fuel pressure target values',
    },
    {
      name: 'BoostPressure_Limit',
      pattern: [20, 25, 30, 35, 40, 45],
      dataType: 'int8' as const,
      description: 'Boost pressure limit table',
    },
  ];

  for (const table of commonTables) {
    signatures.push({
      name: table.name,
      a2lOffset: 0, // Will be populated from a2L metadata
      expectedSize: table.pattern.length * 4, // Assume 4 bytes per value
      dataType: table.dataType,
      sampleValues: table.pattern,
      description: table.description,
    });
  }

  return signatures;
}

/**
 * Scan binary for a specific data pattern
 * Returns all potential offsets where pattern is found
 */
export function scanBinaryForPattern(
  binary: Uint8Array,
  pattern: number[],
  dataType: 'float32' | 'float64' | 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32'
): number[] {
  const matches: number[] = [];
  const bytesPerValue = getDataTypeSize(dataType);
  const patternBytes = convertPatternToBytes(pattern, dataType);

  // Scan through binary looking for pattern
  for (let i = 0; i < binary.length - patternBytes.length; i += bytesPerValue) {
    let isMatch = true;
    for (let j = 0; j < patternBytes.length; j++) {
      if (binary[i + j] !== patternBytes[j]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      matches.push(i);
    }
  }

  return matches;
}

/**
 * Detect offset mismatch by comparing a2L offsets with actual binary locations
 */
export function detectOffsetMismatch(
  binary: Uint8Array,
  a2lOffsets: Map<string, number>,
  signatures: TableSignature[]
): OffsetDetectionResult {
  const offsetDeltas: number[] = [];
  const matchedSignatures: string[] = [];
  let highestConfidence = 0;

  // For each known table, try to find it in the binary
  for (const sig of signatures) {
    const a2lOffset = a2lOffsets.get(sig.name);
    if (!a2lOffset) continue;

    // Scan for this pattern in the binary
    const foundOffsets = scanBinaryForPattern(binary, sig.sampleValues, sig.dataType);

    if (foundOffsets.length > 0) {
      // Calculate offset delta for each match
      for (const foundOffset of foundOffsets) {
        const delta = foundOffset - a2lOffset;
        offsetDeltas.push(delta);
        matchedSignatures.push(sig.name);
      }
    }
  }

  if (offsetDeltas.length === 0) {
    return {
      detectedOffset: null,
      confidence: 0,
      matchedSignatures: [],
      offsetDelta: 0,
      validationStatus: 'failed',
      details: 'No table signatures found in binary. Offset detection failed.',
      recommendedAction: 'Verify binary file integrity. Try uploading a different binary version.',
    };
  }

  // Find the most common offset delta (mode)
  const deltaFrequency = new Map<number, number>();
  for (const delta of offsetDeltas) {
    deltaFrequency.set(delta, (deltaFrequency.get(delta) || 0) + 1);
  }

  let mostCommonDelta = 0;
  let maxFrequency = 0;
  deltaFrequency.forEach((freq, delta) => {
    if (freq > maxFrequency) {
      maxFrequency = freq;
      mostCommonDelta = delta;
    }
  });

  // Calculate confidence based on consistency
  const confidence = Math.min(100, (maxFrequency / matchedSignatures.length) * 100);
  const validationStatus = confidence > 80 ? 'confirmed' : confidence > 50 ? 'suspected' : 'failed';

  return {
    detectedOffset: mostCommonDelta !== 0 ? mostCommonDelta : null,
    confidence,
    matchedSignatures,
    offsetDelta: mostCommonDelta,
    validationStatus,
    details: `Detected offset delta: ${mostCommonDelta.toString(16)} (${mostCommonDelta} bytes). Matched ${matchedSignatures.length} table signatures with ${confidence.toFixed(1)}% confidence.`,
    recommendedAction:
      validationStatus === 'confirmed'
        ? `Apply offset correction of ${mostCommonDelta} bytes to all a2L addresses.`
        : validationStatus === 'suspected'
          ? `Offset correction suspected but not fully confirmed. Manual verification recommended.`
          : `Offset detection failed. Manual offset entry required.`,
  };
}

/**
 * Validate offset correction by verifying corrected addresses
 */
export function validateOffsetCorrection(
  binary: Uint8Array,
  a2lOffsets: Map<string, number>,
  offsetDelta: number,
  signatures: TableSignature[]
): boolean {
  let validatedCount = 0;
  let totalChecks = 0;

  for (const sig of signatures) {
    const a2lOffset = a2lOffsets.get(sig.name);
    if (!a2lOffset) continue;

    totalChecks++;
    const correctedOffset = a2lOffset + offsetDelta;

    // Verify data at corrected offset matches expected pattern
    if (verifyDataAtOffset(binary, correctedOffset, sig.sampleValues, sig.dataType)) {
      validatedCount++;
    }
  }

  // At least 70% of checks must pass
  return totalChecks > 0 && validatedCount / totalChecks >= 0.7;
}

/**
 * Verify that data at a specific offset matches expected values
 */
function verifyDataAtOffset(
  binary: Uint8Array,
  offset: number,
  expectedValues: number[],
  dataType: string
): boolean {
  if (offset < 0 || offset + expectedValues.length * 4 > binary.length) {
    return false;
  }

  const view = new DataView(binary.buffer, offset);
  const bytesPerValue = getDataTypeSize(dataType as any);

  for (let i = 0; i < expectedValues.length; i++) {
    const readValue = readValueFromView(view, i * bytesPerValue, dataType as any);
    // Allow 5% tolerance for floating point comparisons
    const tolerance = Math.abs(expectedValues[i] * 0.05);
    if (Math.abs(readValue - expectedValues[i]) > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Get size in bytes for a data type
 */
function getDataTypeSize(
  dataType: 'float32' | 'float64' | 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32'
): number {
  switch (dataType) {
    case 'int8':
    case 'uint8':
      return 1;
    case 'int16':
    case 'uint16':
      return 2;
    case 'int32':
    case 'uint32':
    case 'float32':
      return 4;
    case 'float64':
      return 8;
    default:
      return 4;
  }
}

/**
 * Convert pattern values to bytes
 */
function convertPatternToBytes(
  pattern: number[],
  dataType: 'float32' | 'float64' | 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32'
): Uint8Array {
  const bytesPerValue = getDataTypeSize(dataType);
  const buffer = new ArrayBuffer(pattern.length * bytesPerValue);
  const view = new DataView(buffer);

  for (let i = 0; i < pattern.length; i++) {
    writeValueToView(view, i * bytesPerValue, pattern[i], dataType);
  }

  return new Uint8Array(buffer);
}

/**
 * Read value from DataView
 */
function readValueFromView(
  view: DataView,
  offset: number,
  dataType: 'float32' | 'float64' | 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32'
): number {
  try {
    switch (dataType) {
      case 'int8':
        return view.getInt8(offset);
      case 'uint8':
        return view.getUint8(offset);
      case 'int16':
        return view.getInt16(offset, true);
      case 'uint16':
        return view.getUint16(offset, true);
      case 'int32':
        return view.getInt32(offset, true);
      case 'uint32':
        return view.getUint32(offset, true);
      case 'float32':
        return view.getFloat32(offset, true);
      case 'float64':
        return view.getFloat64(offset, true);
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

/**
 * Write value to DataView
 */
function writeValueToView(
  view: DataView,
  offset: number,
  value: number,
  dataType: 'float32' | 'float64' | 'int8' | 'int16' | 'int32' | 'uint8' | 'uint16' | 'uint32'
): void {
  try {
    switch (dataType) {
      case 'int8':
        view.setInt8(offset, value);
        break;
      case 'uint8':
        view.setUint8(offset, value);
        break;
      case 'int16':
        view.setInt16(offset, value, true);
        break;
      case 'uint16':
        view.setUint16(offset, value, true);
        break;
      case 'int32':
        view.setInt32(offset, value, true);
        break;
      case 'uint32':
        view.setUint32(offset, value, true);
        break;
      case 'float32':
        view.setFloat32(offset, value, true);
        break;
      case 'float64':
        view.setFloat64(offset, value, true);
        break;
    }
  } catch {
    // Silently fail on write errors
  }
}

/**
 * Apply offset correction to a2L addresses
 */
export function applyOffsetCorrection(
  a2lOffsets: Map<string, number>,
  offsetDelta: number
): Map<string, number> {
  const corrected = new Map<string, number>();
  a2lOffsets.forEach((offset, key) => {
    corrected.set(key, offset + offsetDelta);
  });
  return corrected;
}

/**
 * Generate offset correction report
 */
export function generateOffsetReport(result: OffsetDetectionResult): string {
  const lines = [
    '═══════════════════════════════════════════',
    'BINARY OFFSET DETECTION REPORT',
    '═══════════════════════════════════════════',
    '',
    `Detection Status: ${result.validationStatus.toUpperCase()}`,
    `Confidence: ${result.confidence.toFixed(1)}%`,
    `Offset Delta: ${result.offsetDelta} bytes (0x${result.offsetDelta.toString(16).toUpperCase()})`,
    `Matched Signatures: ${result.matchedSignatures.length}`,
    '',
    'Matched Tables:',
    ...result.matchedSignatures.map(sig => `  • ${sig}`),
    '',
    `Details: ${result.details}`,
    '',
    `Recommended Action: ${result.recommendedAction}`,
    '═══════════════════════════════════════════',
  ];

  return lines.join('\n');
}
