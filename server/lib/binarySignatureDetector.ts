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
 * Note: All hex strings must be valid hex (0-9, A-F only). Invalid hex produces empty buffers
 * which match everything.
 */
const ECU_SIGNATURES = {
  MG1C: {
    patterns: [
      { name: 'DEADBEEF_MARKER', hex: 'DEADBEEF', description: 'Motorola/Freescale ECU marker', weight: 0.8 },
      { name: 'MG1C_HEADER', hex: '08FF56F0', description: 'MG1C internal header', weight: 1.0 },
      { name: 'MG1C_POINTER', hex: '08FD8168', description: 'MG1C function pointer', weight: 1.0 },
    ],
    architecture: 'Motorola 68K',
    vendor: 'Bosch',
    priority: 10,
  },
  ME17: {
    patterns: [
      { name: 'ME17_SIGNATURE', hex: '4D453137', description: 'ME17 ASCII signature', weight: 1.0 },
      { name: 'ME17_HEADER', hex: '0000FFFF', description: 'ME17 memory header', weight: 0.1 },
      { name: 'ME17_CHECKSUM', hex: 'FFFFFFFF', description: 'ME17 checksum marker', weight: 0.05 },
    ],
    architecture: 'x86/ARM',
    vendor: 'Bosch',
    priority: 5,
  },
  MED17: {
    patterns: [
      { name: 'MED17_SIGNATURE', hex: '4D454431', description: 'MED17 ASCII signature', weight: 1.0 },
    ],
    architecture: 'x86/ARM',
    vendor: 'Bosch',
    priority: 5,
  },
  CANAM_MG1: {
    patterns: [
      { name: 'DEADBEEF_MARKER', hex: 'DEADBEEF', description: 'Can-Am MG1 marker', weight: 0.8 },
      { name: 'CANAM_HEADER', hex: '1E110195', description: 'Can-Am MG1 part number', weight: 1.0 },
    ],
    architecture: 'Motorola 68K',
    vendor: 'Bosch (Can-Am)',
    priority: 9,
  },
  CANAM_ME17: {
    patterns: [
      { name: 'ME17_SIGNATURE', hex: '4D453137', description: 'Can-Am ME17 ASCII signature', weight: 0.9 },
      { name: 'CANAM_ME17_PART', hex: '564D3745323730313735', description: 'Can-Am ME17 part number (VM7E270175 ASCII)', weight: 1.0 },
      { name: 'ROTAX_MARKER', hex: '524F544158', description: 'ROTAX engine marker', weight: 1.0 },
    ],
    architecture: 'x86/ARM',
    vendor: 'Bosch (Can-Am)',
    priority: 8,
  },
};

/**
 * Convert hex string to buffer for pattern matching
 * Returns null if the hex string is invalid or produces an empty buffer
 */
function hexToBuffer(hexString: string): Buffer | null {
  // Validate hex string: must be non-empty, even length, and only valid hex chars
  if (!hexString || hexString.length === 0 || hexString.length % 2 !== 0) {
    return null;
  }
  if (!/^[0-9A-Fa-f]+$/.test(hexString)) {
    return null;
  }
  const buf = Buffer.from(hexString, 'hex');
  if (buf.length === 0) {
    return null;
  }
  return buf;
}

/**
 * Search for pattern in binary buffer
 */
function findPattern(buffer: Buffer, pattern: Buffer, maxMatches = 10): number[] {
  const matches: number[] = [];
  if (buffer.length === 0 || pattern.length === 0) return matches;

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

  // Don't attempt detection on empty or tiny buffers
  if (binaryBuffer.length === 0) {
    return result;
  }

  // Score each ECU family based on pattern matches
  const familyScores: Record<string, { score: number; matches: SignatureMatch[] }> = {};

  for (const [ecuFamily, config] of Object.entries(ECU_SIGNATURES)) {
    familyScores[ecuFamily] = { score: 0, matches: [] };

    for (const pattern of config.patterns) {
      const patternBuffer = hexToBuffer(pattern.hex);
      if (!patternBuffer) continue; // Skip invalid patterns

      const offsets = findPattern(binaryBuffer, patternBuffer);

      if (offsets.length > 0) {
        // Weight-based scoring: specific patterns worth more than generic ones
        const weight = pattern.weight || 0.5;
        const matchScore = Math.min(offsets.length * 0.2, 1.0) * weight;
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

  // Find best match (with priority-based tie-breaking)
  let bestFamily: string | null = null;
  let bestScore = 0;
  let bestPriority = -1;

  for (const [ecuFamily, { score, matches }] of Object.entries(familyScores)) {
    const priority = (ECU_SIGNATURES[ecuFamily as keyof typeof ECU_SIGNATURES] as any).priority || 0;

    // Only consider families that actually matched something (score > 0)
    if (score <= 0) continue;

    // Choose family if: score is higher, OR score is equal but priority is higher
    if (score > bestScore || (score === bestScore && priority > bestPriority)) {
      bestScore = score;
      bestFamily = ecuFamily;
      bestPriority = priority;
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
