/**
 * Binary Signature Detection Engine
 * Identifies ECU families from raw binary files using pattern matching
 * against known Bosch/Motorola signatures
 */

export interface SignatureMatch {
  ecuFamily: string;
  confidence: number; // 0-1
  matchedPatterns: string[];
  offset: number;
  description: string;
}

export interface BinaryAnalysisResult {
  fileName: string;
  fileSize: number;
  detectedFamily: string | null;
  confidence: number;
  matches: SignatureMatch[];
  analysis: {
    hasDeadbeefMarker: boolean;
    hasMotorola32bitMarker: boolean;
    hasBoschSignature: boolean;
    estimatedArchitecture: string;
  };
}

/**
 * Known ECU signatures and patterns
 */
const ECU_SIGNATURES = {
  MG1C: {
    patterns: [
      { name: 'DEADBEEF_MARKER', hex: 'DEADBEEF', description: 'Motorola/Freescale ECU marker' },
      { name: 'MG1C_HEADER', hex: '08FF56F0', description: 'MG1C internal header' },
      { name: 'MG1C_POINTER', hex: '08FD8168', description: 'MG1C function pointer' },
    ],
    architecture: 'Motorola 68K',
    vendor: 'Bosch',
  },
  ME17: {
    patterns: [
      { name: 'ME17_SIGNATURE', hex: '4D453137', description: 'ME17 ASCII signature' },
      { name: 'ME17_HEADER', hex: '0000FFFF', description: 'ME17 memory header' },
      { name: 'ME17_CHECKSUM', hex: 'FFFFFFFF', description: 'ME17 checksum marker' },
    ],
    architecture: 'x86/ARM',
    vendor: 'Bosch',
  },
  MED17: {
    patterns: [
      { name: 'MED17_SIGNATURE', hex: '4D454431', description: 'MED17 ASCII signature' },
    ],
    architecture: 'x86/ARM',
    vendor: 'Bosch',
  },
  CANAM_MG1: {
    patterns: [
      { name: 'DEADBEEF_MARKER', hex: 'DEADBEEF', description: 'Can-Am MG1 marker' },
      { name: 'CANAM_HEADER', hex: '1E110195', description: 'Can-Am MG1 part number' },
    ],
    architecture: 'Motorola 68K',
    vendor: 'Bosch (Can-Am)',
  },
  CANAM_ME17: {
    patterns: [
      { name: 'ME17_SIGNATURE', hex: '4D453137', description: 'Can-Am ME17 ASCII signature' },
      { name: 'CANAM_ME17_PART', hex: 'VM7E270175', description: 'Can-Am ME17 part number' },
      { name: 'ROTAX_MARKER', hex: '524F544158', description: 'ROTAX engine marker' },
    ],
    architecture: 'x86/ARM',
    vendor: 'Bosch (Can-Am)',
  },
};

/**
 * Convert hex string to buffer for pattern matching
 */
function hexToBuffer(hexString: string): Buffer {
  return Buffer.from(hexString, 'hex');
}

/**
 * Search for pattern in binary buffer
 */
function findPattern(buffer: Buffer, pattern: Buffer, maxMatches = 10): number[] {
  const matches: number[] = [];
  let offset = 0;

  while (offset < buffer.length && matches.length < maxMatches) {
    const index = buffer.indexOf(pattern, offset);
    if (index === -1) break;
    matches.push(index);
    offset = index + 1;
  }

  return matches;
}

/**
 * Analyze binary file and detect ECU family
 */
export function analyzeBinary(binaryBuffer: Buffer, fileName: string): BinaryAnalysisResult {
  const result: BinaryAnalysisResult = {
    fileName,
    fileSize: binaryBuffer.length,
    detectedFamily: null,
    confidence: 0,
    matches: [],
    analysis: {
      hasDeadbeefMarker: false,
      hasMotorola32bitMarker: false,
      hasBoschSignature: false,
      estimatedArchitecture: 'Unknown',
    },
  };

  // Score each ECU family based on pattern matches
  const familyScores: Record<string, { score: number; matches: SignatureMatch[] }> = {};

  for (const [ecuFamily, config] of Object.entries(ECU_SIGNATURES)) {
    familyScores[ecuFamily] = { score: 0, matches: [] };

    for (const pattern of config.patterns) {
      const patternBuffer = hexToBuffer(pattern.hex);
      const offsets = findPattern(binaryBuffer, patternBuffer);

      if (offsets.length > 0) {
        // Each pattern match adds to the score
        const matchScore = Math.min(offsets.length * 0.3, 0.5); // Max 0.5 per pattern
        familyScores[ecuFamily].score += matchScore;

        // Track DEADBEEF marker
        if (pattern.name === 'DEADBEEF_MARKER') {
          result.analysis.hasDeadbeefMarker = true;
        }

        // Record all matches
        for (const offset of offsets) {
          familyScores[ecuFamily].matches.push({
            ecuFamily,
            confidence: matchScore,
            matchedPatterns: [pattern.name],
            offset,
            description: pattern.description,
          });
        }
      }
    }

    // Normalize score to 0-1 range
    familyScores[ecuFamily].score = Math.min(familyScores[ecuFamily].score, 1);
  }

  // Find best match
  let bestFamily: string | null = null;
  let bestScore = 0;

  for (const [ecuFamily, { score, matches }] of Object.entries(familyScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestFamily = ecuFamily;
      result.matches = matches;
    }
  }

  result.detectedFamily = bestFamily;
  result.confidence = bestScore;

  // Set analysis flags
  if (result.analysis.hasDeadbeefMarker) {
    result.analysis.estimatedArchitecture = 'Motorola 68K';
    result.analysis.hasBoschSignature = true;
  }

  return result;
}

/**
 * Analyze binary file from buffer and return confidence-ranked results
 */
export function detectECUFamily(
  binaryBuffer: Buffer,
  fileName: string,
  minConfidence = 0.3
): { family: string; confidence: number; details: BinaryAnalysisResult } | null {
  const analysis = analyzeBinary(binaryBuffer, fileName);

  if (analysis.detectedFamily && analysis.confidence >= minConfidence) {
    return {
      family: analysis.detectedFamily,
      confidence: analysis.confidence,
      details: analysis,
    };
  }

  return null;
}

/**
 * Get all available ECU families
 */
export function getAvailableFamilies(): Record<string, { architecture: string; vendor: string }> {
  const families: Record<string, { architecture: string; vendor: string }> = {};

  for (const [ecuFamily, config] of Object.entries(ECU_SIGNATURES)) {
    families[ecuFamily] = {
      architecture: config.architecture,
      vendor: config.vendor,
    };
  }

  return families;
}
