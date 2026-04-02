/**
 * OS Number Extractor
 * Extracts the Operating System number from ECU binary files
 * OS numbers are typically ASCII strings embedded in the binary
 * Examples: 1G0100914SB3VUM8, 1E1102031SA2VLM4
 */

/**
 * Extract OS number from binary
 * Searches for ASCII patterns that match typical OS number formats
 * OS numbers are usually 16-17 character alphanumeric strings
 */
export function extractOSNumber(binary: Buffer): string | null {
  // Common OS number patterns:
  // - Starts with 1-9 (generation/variant)
  // - Followed by letters (manufacturer/platform)
  // - Mix of letters and numbers
  // - Typically 16-18 characters
  // - Often found in first 1MB of binary

  // Search for ASCII strings that look like OS numbers
  const osNumberPattern = /[1-9][A-Z0-9]{15,17}/g;
  
  // Extract ASCII strings from binary
  let asciiBuffer = '';
  for (let i = 0; i < binary.length; i++) {
    const byte = binary[i];
    // Keep printable ASCII (32-126) and null terminators
    if ((byte >= 32 && byte <= 126) || byte === 0) {
      if (byte === 0) {
        // Null terminator - check if we have a valid OS number
        const match = asciiBuffer.match(osNumberPattern);
        if (match) {
          for (const candidate of match) {
            // Validate OS number format
            if (isValidOSNumber(candidate)) {
              return candidate;
            }
          }
        }
        asciiBuffer = '';
      } else {
        asciiBuffer += String.fromCharCode(byte);
      }
    } else {
      // Non-ASCII byte - check accumulated buffer
      const match = asciiBuffer.match(osNumberPattern);
      if (match) {
        for (const candidate of match) {
          if (isValidOSNumber(candidate)) {
            return candidate;
          }
        }
      }
      asciiBuffer = '';
    }
  }

  // Check final buffer
  const match = asciiBuffer.match(osNumberPattern);
  if (match) {
    for (const candidate of match) {
      if (isValidOSNumber(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Validate OS number format
 * OS numbers typically have:
 * - First digit: generation (1-9)
 * - Next 1-2 letters: platform (e.g., G=Gasoline, D=Diesel, E=EDC, M=MG1)
 * - Numbers and letters mixed
 * - 16-18 total characters
 */
function isValidOSNumber(candidate: string): boolean {
  if (candidate.length < 16 || candidate.length > 18) {
    return false;
  }

  // Must start with digit 1-9
  if (!/^[1-9]/.test(candidate)) {
    return false;
  }

  // Must have mix of letters and numbers (not all one or the other)
  const hasLetters = /[A-Z]/.test(candidate);
  const hasNumbers = /[0-9]/.test(candidate);
  
  if (!hasLetters || !hasNumbers) {
    return false;
  }

  // Known OS number prefixes (can expand this list)
  const knownPrefixes = [
    '1G', '1E', '1D', '1M', // Common prefixes
    '2G', '2E', '2D', '2M',
    '3G', '3E', '3D', '3M',
    '4G', '4E', '4D', '4M',
    '5G', '5E', '5D', '5M',
  ];

  const hasKnownPrefix = knownPrefixes.some(prefix => candidate.startsWith(prefix));
  
  // If it doesn't match known prefix, still accept if it looks reasonable
  // (starts with digit, has mix of letters/numbers, right length)
  return true;
}

/**
 * Extract OS number and additional metadata from binary
 */
export function extractBinaryMetadata(binary: Buffer): {
  osNumber: string | null;
  fileSize: number;
  hasDeadbeef: boolean;
  estimatedArchitecture: string;
} {
  const osNumber = extractOSNumber(binary);
  
  // Check for DEADBEEF marker (Motorola/Freescale)
  const hasDeadbeef = binary.includes(Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]));
  
  // Estimate architecture based on markers
  let estimatedArchitecture = 'Unknown';
  if (hasDeadbeef) {
    estimatedArchitecture = 'Motorola 68K';
  } else if (binary.includes(Buffer.from([0x55, 0x8B, 0xEC]))) {
    // x86 prologue
    estimatedArchitecture = 'x86/ARM';
  }

  return {
    osNumber,
    fileSize: binary.length,
    hasDeadbeef,
    estimatedArchitecture,
  };
}
