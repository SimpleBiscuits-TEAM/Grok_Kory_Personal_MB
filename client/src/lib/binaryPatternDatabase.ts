/**
 * Binary Pattern Database & Cross-Reference Reasoning
 *
 * Learns from uploaded A2L files to build a database of map signatures.
 * When analyzing a binary without A2L, matches hex patterns and infers map purposes
 * with confidence scoring.
 *
 * Pattern types:
 * 1. Structural signature: (rows, cols, axis types, data type) → map structure
 * 2. Hex pattern: First N bytes of map data → unique fingerprint
 * 3. Axis pattern: (axis_x_range, axis_y_range) → likely purpose (RPM×TPS, RPM×Boost, etc.)
 * 4. Offset pattern: Relative distance between maps → common layout patterns
 */

import { EcuDefinition, CalibrationMap } from './editorEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MapSignature {
  name: string;
  description: string;
  rows: number;
  cols: number;
  axisXType: string;
  axisYType: string;
  dataType: string;
  // Hex fingerprint of first 32 bytes of data
  hexFingerprint: string;
  // Axis value ranges (for matching)
  axisXRange: { min: number; max: number };
  axisYRange: { min: number; max: number };
  // ECU families this map appears in
  ecuFamilies: string[];
  // Confidence (0-1) based on how many A2Ls have this exact signature
  frequency: number;
}

export interface PatternMatch {
  signature: MapSignature;
  matchType: 'hex_exact' | 'hex_partial' | 'structural' | 'axis_pattern';
  confidence: number; // 0-1
  reasoning: string;
}

export interface CrossReferenceResult {
  mapName: string;
  mapDescription: string;
  primaryMatch?: PatternMatch;
  alternativeMatches: PatternMatch[];
  overallConfidence: number;
  reasoning: string[];
}

// ─── Pattern Database ────────────────────────────────────────────────────────

class BinaryPatternDatabase {
  private signatures: Map<string, MapSignature> = new Map();
  private hexIndex: Map<string, MapSignature[]> = new Map(); // hex fingerprint → signatures
  private structuralIndex: Map<string, MapSignature[]> = new Map(); // structural key → signatures
  private ecuFamilyIndex: Map<string, MapSignature[]> = new Map(); // ECU family → signatures

  /**
   * Learn map signatures from an A2L-based EcuDefinition.
   * Called when user uploads an A2L file.
   */
  learnFromEcuDefinition(ecuDef: EcuDefinition, binaryData: Uint8Array): void {
    for (const map of ecuDef.maps) {
      if (!map.rawValues || map.rawValues.length === 0) continue;

      const signature = this.extractSignature(map, ecuDef, binaryData);
      if (signature) {
        this.registerSignature(signature);
      }
    }
  }

  /**
   * Extract a signature from a map and its binary data.
   */
  private extractSignature(
    map: CalibrationMap,
    ecuDef: EcuDefinition,
    binaryData: Uint8Array
  ): MapSignature | null {
    if (!map.rawValues || map.rawValues.length === 0) return null;

    // Generate hex fingerprint from first 32 bytes of map data
    const hexFingerprint = this.generateHexFingerprint(binaryData, map.address, 32);

    // Generate structural key
    const structuralKey = `${map.rows}x${map.cols}`;

    // Determine axis ranges
    const axisXRange = map.axisXValues
      ? { min: Math.min(...map.axisXValues), max: Math.max(...map.axisXValues) }
      : { min: 0, max: 0 };

    const axisYRange = map.axisYValues
      ? { min: Math.min(...map.axisYValues), max: Math.max(...map.axisYValues) }
      : { min: 0, max: 0 };

    return {
      name: map.name,
      description: map.description,
      rows: map.rows || 1,
      cols: map.cols || 1,
      axisXType: map.axes[0]?.inputQuantity || 'UNKNOWN',
      axisYType: map.axes[1]?.inputQuantity || 'UNKNOWN',
      dataType: 'UWORD', // Simplified; could be more detailed
      hexFingerprint,
      axisXRange,
      axisYRange,
      ecuFamilies: [ecuDef.ecuFamily],
      frequency: 1,
    };
  }

  /**
   * Register a signature in the database.
   */
  private registerSignature(signature: MapSignature): void {
    const key = `${signature.name}|${signature.ecuFamilies[0]}`;

    // Check if we already have this signature
    const existing = this.signatures.get(key);
    if (existing) {
      // Merge ECU families and increase frequency
      existing.ecuFamilies = [...new Set([...existing.ecuFamilies, ...signature.ecuFamilies])];
      existing.frequency = Math.min(1, existing.frequency + 0.1);
    } else {
      this.signatures.set(key, signature);
    }

    // Index by hex fingerprint
    if (!this.hexIndex.has(signature.hexFingerprint)) {
      this.hexIndex.set(signature.hexFingerprint, []);
    }
    this.hexIndex.get(signature.hexFingerprint)!.push(signature);

    // Index by structural key
    const structuralKey = `${signature.rows}x${signature.cols}`;
    if (!this.structuralIndex.has(structuralKey)) {
      this.structuralIndex.set(structuralKey, []);
    }
    this.structuralIndex.get(structuralKey)!.push(signature);

    // Index by ECU family
    for (const family of signature.ecuFamilies) {
      if (!this.ecuFamilyIndex.has(family)) {
        this.ecuFamilyIndex.set(family, []);
      }
      this.ecuFamilyIndex.get(family)!.push(signature);
    }
  }

  /**
   * Generate a hex fingerprint from binary data.
   */
  private generateHexFingerprint(data: Uint8Array, offset: number, length: number): string {
    const bytes: string[] = [];
    for (let i = 0; i < Math.min(length, data.length - offset); i++) {
      bytes.push(data[offset + i].toString(16).padStart(2, '0'));
    }
    return bytes.join('');
  }

  /**
   * Find cross-reference matches for a candidate map.
   */
  findMatches(
    rows: number,
    cols: number,
    hexFingerprint: string,
    axisXRange: { min: number; max: number },
    axisYRange: { min: number; max: number },
    ecuFamily: string
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Strategy 1: Exact hex match (highest confidence)
    const hexMatches = this.hexIndex.get(hexFingerprint) || [];
    for (const sig of hexMatches) {
      matches.push({
        signature: sig,
        matchType: 'hex_exact',
        confidence: 0.95 * sig.frequency,
        reasoning: `Exact hex fingerprint match in ${sig.ecuFamilies.join(', ')}`,
      });
    }

    // Strategy 2: Structural match (same dimensions)
    const structuralKey = `${rows}x${cols}`;
    const structMatches = this.structuralIndex.get(structuralKey) || [];
    for (const sig of structMatches) {
      if (hexMatches.includes(sig)) continue; // Already matched

      // Bonus if ECU family matches
      const familyBonus = sig.ecuFamilies.includes(ecuFamily) ? 0.15 : 0;

      matches.push({
        signature: sig,
        matchType: 'structural',
        confidence: (0.6 + familyBonus) * sig.frequency,
        reasoning: `Structural match: ${rows}×${cols} table in ${sig.ecuFamilies.join(', ')}`,
      });
    }

    // Strategy 3: Axis pattern match (same axis types and ranges)
    const axisKey = `${this.classifyAxisRange(axisXRange)}|${this.classifyAxisRange(axisYRange)}`;
    for (const [, sigs] of this.ecuFamilyIndex) {
      for (const sig of sigs) {
        if (hexMatches.includes(sig) || structMatches.includes(sig)) continue;

        const axisXMatch = this.rangesOverlap(axisXRange, sig.axisXRange);
        const axisYMatch = this.rangesOverlap(axisYRange, sig.axisYRange);

        if (axisXMatch && axisYMatch) {
          matches.push({
            signature: sig,
            matchType: 'axis_pattern',
            confidence: (0.5 + (sig.ecuFamilies.includes(ecuFamily) ? 0.1 : 0)) * sig.frequency,
            reasoning: `Axis pattern match: ${sig.axisXType}×${sig.axisYType}`,
          });
        }
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Classify an axis range into a category.
   */
  private classifyAxisRange(range: { min: number; max: number }): string {
    const { min, max } = range;
    const span = max - min;

    if (min >= 400 && max <= 10000 && span > 1000) return 'RPM';
    if (min >= -10 && max <= 110 && span > 50) return 'TPS';
    if (min >= -5 && max <= 60 && span > 10) return 'BOOST';
    if (min >= -50 && max <= 1500 && span > 100) return 'MAF';
    if (min >= -50 && max <= 150 && span > 50) return 'COOLANT';

    return 'UNKNOWN';
  }

  /**
   * Check if two ranges overlap significantly.
   */
  private rangesOverlap(range1: { min: number; max: number }, range2: { min: number; max: number }): boolean {
    // Ranges overlap if they share at least 50% of their span
    const overlap = Math.min(range1.max, range2.max) - Math.max(range1.min, range2.min);
    const span1 = range1.max - range1.min;
    const span2 = range2.max - range2.min;

    return overlap > Math.min(span1, span2) * 0.5;
  }

  /**
   * Get database statistics.
   */
  getStats(): { totalSignatures: number; ecuFamilies: string[]; structuralPatterns: string[] } {
    return {
      totalSignatures: this.signatures.size,
      ecuFamilies: Array.from(this.ecuFamilyIndex.keys()),
      structuralPatterns: Array.from(this.structuralIndex.keys()),
    };
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let databaseInstance: BinaryPatternDatabase | null = null;

export function getPatternDatabase(): BinaryPatternDatabase {
  if (!databaseInstance) {
    databaseInstance = new BinaryPatternDatabase();
  }
  return databaseInstance;
}

export function resetPatternDatabase(): void {
  databaseInstance = null;
}

// ─── Cross-Reference Reasoning ───────────────────────────────────────────────

/**
 * Apply cross-reference reasoning to a candidate map.
 * Combines pattern matching with axis analysis to infer map purpose.
 */
export function applyReasoningToCandidate(
  rows: number,
  cols: number,
  hexFingerprint: string,
  axisXRange: { min: number; max: number },
  axisYRange: { min: number; max: number },
  axisXValues?: number[],
  axisYValues?: number[],
  ecuFamily: string = 'UNKNOWN'
): CrossReferenceResult {
  const db = getPatternDatabase();
  const matches = db.findMatches(rows, cols, hexFingerprint, axisXRange, axisYRange, ecuFamily);

  const reasoning: string[] = [];
  let mapName = `Map_${rows}x${cols}`;
  let mapDescription = `${rows}×${cols} calibration table`;
  let overallConfidence = 0;

  if (matches.length > 0) {
    const primaryMatch = matches[0];
    mapName = primaryMatch.signature.name;
    mapDescription = primaryMatch.signature.description;
    overallConfidence = primaryMatch.confidence;

    reasoning.push(`Primary match: ${primaryMatch.signature.name} (${(primaryMatch.confidence * 100).toFixed(0)}% confidence)`);
    reasoning.push(`Match type: ${primaryMatch.matchType}`);
    reasoning.push(`Reasoning: ${primaryMatch.reasoning}`);

    if (matches.length > 1) {
      reasoning.push(`\nAlternative matches:`);
      for (let i = 1; i < Math.min(3, matches.length); i++) {
        const alt = matches[i];
        reasoning.push(`  ${i}. ${alt.signature.name} (${(alt.confidence * 100).toFixed(0)}%)`);
      }
    }
  } else {
    reasoning.push('No pattern matches found in database');
    reasoning.push(`Axis analysis: X=${classifyAxis(axisXValues || [])} Y=${classifyAxis(axisYValues || [])}`);
    overallConfidence = 0.3; // Low confidence without pattern match
  }

  return {
    mapName,
    mapDescription,
    primaryMatch: matches.length > 0 ? matches[0] : undefined,
    alternativeMatches: matches.slice(1),
    overallConfidence,
    reasoning,
  };
}

/**
 * Classify an axis based on its values.
 */
function classifyAxis(values: number[]): string {
  if (values.length === 0) return 'UNKNOWN';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  if (min >= 400 && max <= 10000 && range > 1000) return 'RPM';
  if (min >= -10 && max <= 110 && range > 50) return 'TPS';
  if (min >= -5 && max <= 60 && range > 10) return 'BOOST';
  if (min >= -50 && max <= 1500 && range > 100) return 'MAF';
  if (min >= -50 && max <= 150 && range > 50) return 'COOLANT';

  return 'UNKNOWN';
}
