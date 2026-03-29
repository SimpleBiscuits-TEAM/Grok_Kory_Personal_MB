/**
 * MG1 File Detection Utility
 * 
 * Detects if a binary file is a Polaris MG1 ECU file
 * Supports both .bin and .bdc formats
 */

/**
 * Check if a file is a Polaris MG1 binary
 */
export function isMG1File(
  fileName: string,
  fileData?: Uint8Array
): boolean {
  const lowerName = fileName.toLowerCase();
  const extension = lowerName.split('.').pop() || '';

  // Check file extension
  if (!['bin', 'bdc', 's19', 'hex'].includes(extension)) {
    return false;
  }

  // Check filename for MG1 or Polaris indicators
  const hasMG1Indicator = lowerName.includes('mg1') || lowerName.includes('polaris');

  if (!hasMG1Indicator) {
    return false;
  }

  // If we have file data, check for MG1 marker bytes
  if (fileData && fileData.length > 0) {
    return hasMG1Marker(fileData);
  }

  // If only filename matches, assume it's MG1
  return true;
}

/**
 * Search for MG1 marker in binary data
 */
function hasMG1Marker(data: Uint8Array): boolean {
  const mg1Bytes = [0x4D, 0x47, 0x31]; // 'MG1' in ASCII
  const commonOffsets = [0x0000, 0x1000, 0x8000, 0x10000, 0x20000];

  // Check common offsets first
  for (const offset of commonOffsets) {
    if (offset + 3 <= data.length) {
      if (
        data[offset] === mg1Bytes[0] &&
        data[offset + 1] === mg1Bytes[1] &&
        data[offset + 2] === mg1Bytes[2]
      ) {
        return true;
      }
    }
  }

  // Search entire file if not found at common offsets
  for (let i = 0; i < data.length - 2; i++) {
    if (
      data[i] === mg1Bytes[0] &&
      data[i + 1] === mg1Bytes[1] &&
      data[i + 2] === mg1Bytes[2]
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get MG1 variant information if available
 */
export function getMG1Variant(data: Uint8Array): string {
  const variants = [
    { marker: 'MG1C400A1T2', name: 'MG1C400A1T2' },
    { marker: 'MG1CA920', name: 'MG1CA920' },
    { marker: 'MG1', name: 'MG1 (Unknown Variant)' }
  ];

  for (const variant of variants) {
    const bytes = variant.marker.split('').map(c => c.charCodeAt(0));
    for (let i = 0; i < data.length - bytes.length; i++) {
      let match = true;
      for (let j = 0; j < bytes.length; j++) {
        if (data[i + j] !== bytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return variant.name;
      }
    }
  }

  return 'MG1 (Unknown)';
}

/**
 * Check if file supports Dynojet patching
 */
export function canApplyDynojePatch(fileName: string, fileData?: Uint8Array): boolean {
  return isMG1File(fileName, fileData);
}

/**
 * Check if file supports HPTuners patching
 */
export function canApplyHPTunersPatch(fileName: string, fileData?: Uint8Array): boolean {
  return isMG1File(fileName, fileData);
}
