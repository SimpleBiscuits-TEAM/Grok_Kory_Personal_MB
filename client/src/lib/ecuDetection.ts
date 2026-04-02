/**
 * ECU Family Detection Engine
 * 
 * Detects ECU family from binary file signatures and patterns.
 * Supports: MG1CA920 (Can-Am), MG1C400A1T2 (Polaris), and other Bosch platforms.
 */

export interface ECUDetectionResult {
  family: string;
  variant?: string;
  confidence: number; // 0-1
  signatures: string[];
  baseAddress?: number;
  description: string;
}

// ECU signature patterns
const ECU_SIGNATURES: Record<string, Array<{
  pattern: string | RegExp;
  offset?: number;
  description: string;
  family: string;
  variant?: string;
  baseAddress?: number;
}>> = {
  MG1CA920: [
    {
      pattern: /MG1CA920/,
      description: 'Can-Am Duramax MG1CA920 ECU',
      family: 'MG1CA920',
      baseAddress: 0x08FD8000,
    },
    {
      pattern: 'MG1C',
      offset: 0x1000,
      description: 'MG1C family marker',
      family: 'MG1C',
    },
  ],
  MG1C400A1T2: [
    {
      pattern: /MG1C400A1T2/,
      description: 'Polaris MG1C400A1T2 ECU',
      family: 'MG1C400A1T2',
      variant: 'Polaris',
    },
    {
      pattern: 'MG1C',
      offset: 0x1000,
      description: 'MG1C family marker',
      family: 'MG1C',
    },
  ],
};

// Binary signature patterns (hex strings or byte sequences)
const BINARY_SIGNATURES: Array<{
  name: string;
  family: string;
  variant?: string;
  pattern: Uint8Array;
  offset?: number;
  confidence: number;
  description: string;
}> = [
  {
    name: 'MG1CA920 Dynojet Unlock Flag',
    family: 'MG1CA920',
    pattern: new Uint8Array([0x03]), // Dynojet-patched value at 0x030363
    offset: 0x030363,
    confidence: 0.7,
    description: 'Dynojet unlock flag present',
  },
  {
    name: 'MG1CA920 HPTuners Unlock Flag',
    family: 'MG1CA920',
    pattern: new Uint8Array([0x36, 0x39]), // HPTuners version bytes
    offset: 0x018e06,
    confidence: 0.6,
    description: 'HPTuners unlock signature',
  },
  {
    name: 'MG1C400A1T2 Polaris Marker',
    family: 'MG1C400A1T2',
    variant: 'Polaris',
    pattern: new Uint8Array([0x4D, 0x47, 0x31, 0x43]), // "MG1C" ASCII
    offset: 0x1000,
    confidence: 0.9,
    description: 'Polaris MG1C marker',
  },
];

/**
 * Detect ECU family from binary file
 */
export function detectECUFamily(binary: Uint8Array): ECUDetectionResult | null {
  const results: ECUDetectionResult[] = [];

  // Search for text patterns (ASCII strings)
  const textContent = new TextDecoder('utf-8', { fatal: false }).decode(binary);
  
  for (const [familyKey, signatures] of Object.entries(ECU_SIGNATURES)) {
    for (const sig of signatures) {
      if (typeof sig.pattern === 'string') {
        if (textContent.includes(sig.pattern)) {
          results.push({
            family: sig.family,
            variant: sig.variant,
            confidence: 0.95,
            signatures: [sig.description],
            baseAddress: sig.baseAddress,
            description: sig.description,
          });
        }
      } else if (sig.pattern instanceof RegExp) {
        if (sig.pattern.test(textContent)) {
          results.push({
            family: sig.family,
            variant: sig.variant,
            confidence: 0.95,
            signatures: [sig.description],
            baseAddress: sig.baseAddress,
            description: sig.description,
          });
        }
      }
    }
  }

  // Search for binary signatures (byte patterns)
  for (const sig of BINARY_SIGNATURES) {
    const offset = sig.offset || 0;
    if (offset + sig.pattern.length <= binary.length) {
      let match = true;
      for (let i = 0; i < sig.pattern.length; i++) {
        if (binary[offset + i] !== sig.pattern[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        results.push({
          family: sig.family,
          variant: sig.variant,
          confidence: sig.confidence,
          signatures: [sig.name],
          description: sig.description,
        });
      }
    }
  }

  // Return best match
  if (results.length === 0) return null;

  // Combine results by family
  const familyScores: Record<string, ECUDetectionResult> = {};
  for (const result of results) {
    const key = result.family;
    if (!familyScores[key]) {
      familyScores[key] = {
        ...result,
        confidence: 0,
        signatures: [],
      };
    }
    // Average confidence and combine signatures
    familyScores[key].confidence = Math.max(
      familyScores[key].confidence,
      result.confidence
    );
    familyScores[key].signatures.push(...result.signatures);
  }

  // Return best match by confidence
  return Object.values(familyScores).sort(
    (a, b) => b.confidence - a.confidence
  )[0] || null;
}

/**
 * Get base address for ECU family
 */
export function getBaseAddressForFamily(family: string): number | null {
  const knownBases: Record<string, number> = {
    MG1CA920: 0x08FD8000,
    MG1C400A1T2: 0x08000000, // Placeholder - needs verification
    MG1C: 0x08000000,
  };
  return knownBases[family] || null;
}

/**
 * Get known A2L filename for ECU family
 */
export function getA2LFilenameForFamily(family: string): string | null {
  const knownA2Ls: Record<string, string> = {
    MG1CA920: '1E1101953.a2l',
    MG1C400A1T2: 'MG1C400A1T2_groups_34.a2l',
    MG1C: 'MG1C_generic.a2l',
  };
  return knownA2Ls[family] || null;
}

/**
 * Confidence level description
 */
export function getConfidenceDescription(confidence: number): string {
  if (confidence >= 0.9) return 'Very High';
  if (confidence >= 0.7) return 'High';
  if (confidence >= 0.5) return 'Medium';
  if (confidence >= 0.3) return 'Low';
  return 'Very Low';
}
