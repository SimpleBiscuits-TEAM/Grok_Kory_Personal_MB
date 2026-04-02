/**
 * ECU Binary Segment Swapper
 * 
 * Full segment swap between two binaries:
 * 1. Parse both bins to find segment boundaries using PN anchors
 * 2. Verify OS compatibility (same OS PN = same segment layout)
 * 3. Hex-verify each segment's PN at the expected offset before copying
 * 4. Copy entire segment data block (header + PN + null + calibration data)
 * 5. Download the modified binary
 * 
 * Segment structure (from analysis of PPEI/EFILive bins):
 *   [16B header] [8B PN ASCII] [8B null] [calibration data...]
 *   - Header starts at PN_offset - 16
 *   - PN is 8 ASCII digits
 *   - 8 null bytes follow PN
 *   - Calibration data follows until the next segment's header
 *   - The part number is PART OF the segment — it comes along with the swap
 */

import type { BinaryAnalysis, FlashSegment } from './binaryParser';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SegmentInfo {
  /** Segment index (1-based) */
  index: number;
  /** Segment function label */
  label: string;
  /** 8-digit part number */
  partNumber: string;
  /** Byte offset of the 16B header (PN is at headerOffset + 16) */
  headerOffset: number;
  /** Byte offset of the PN within the binary */
  pnOffset: number;
  /** Start of calibration data (pnOffset + 16) */
  dataOffset: number;
  /** End of this segment (exclusive) = next segment's headerOffset, or estimated end */
  endOffset: number;
  /** Total segment size in bytes (header + PN + null + data) */
  totalSize: number;
  /** Whether the PN was hex-verified at this offset */
  verified: boolean;
}

export interface SwapPlan {
  /** Source segment info */
  source: SegmentInfo;
  /** Target segment info */
  target: SegmentInfo;
  /** Whether the swap can proceed */
  canSwap: boolean;
  /** Reason if swap cannot proceed */
  error?: string;
  /** Warnings */
  warnings: string[];
}

export interface SwapResult {
  success: boolean;
  /** The modified binary data */
  modifiedData?: ArrayBuffer;
  /** Segments that were swapped */
  swappedSegments: {
    index: number;
    label: string;
    sourcePN: string;
    targetPN: string;
    bytesWritten: number;
  }[];
  /** Warnings */
  warnings: string[];
  /** Error if failed */
  error?: string;
}

export interface BinaryPair {
  target: {
    data: Uint8Array;
    fileName: string;
    analysis: BinaryAnalysis;
    segments: SegmentInfo[];
    osPN: string;
  };
  source: {
    data: Uint8Array;
    fileName: string;
    analysis: BinaryAnalysis;
    segments: SegmentInfo[];
    osPN: string;
  };
  /** Whether the OS PNs match */
  osMatch: boolean;
  /** Segments that can be swapped (matched by index) */
  matchedSegments: { source: SegmentInfo; target: SegmentInfo }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toHex(n: number): string {
  return '0x' + n.toString(16).toUpperCase().padStart(6, '0');
}

/** Convert an ASCII string to a byte array */
function stringToBytes(str: string): number[] {
  return Array.from(str).map(c => c.charCodeAt(0));
}

/** Read ASCII string from binary at offset */
function readAscii(data: Uint8Array, offset: number, maxLen: number): string {
  let s = '';
  for (let i = 0; i < maxLen && offset + i < data.length; i++) {
    const b = data[offset + i];
    if (b === 0 || b === 0xFF) break;
    if (b >= 0x20 && b <= 0x7E) {
      s += String.fromCharCode(b);
    } else {
      break;
    }
  }
  return s;
}

/** Verify that the expected bytes exist at the given offset */
function verifyBytesAtOffset(data: Uint8Array, offset: number, expected: number[]): boolean {
  if (offset < 0 || offset + expected.length > data.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (data[offset + i] !== expected[i]) return false;
  }
  return true;
}

/** Scan the entire binary for a byte pattern, return all match offsets */
function findAllOccurrences(data: Uint8Array, pattern: number[]): number[] {
  const results: number[] = [];
  for (let i = 0; i <= data.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) results.push(i);
  }
  return results;
}

/** Check if 8 bytes at offset are all ASCII digits (0x30-0x39) */
function isAsciiDigits(data: Uint8Array, offset: number, count: number): boolean {
  if (offset + count > data.length) return false;
  for (let i = 0; i < count; i++) {
    const b = data[offset + i];
    if (b < 0x30 || b > 0x39) return false;
  }
  return true;
}

/** Check if 8 bytes at offset are all 0x00 */
function isNullBytes(data: Uint8Array, offset: number, count: number): boolean {
  if (offset + count > data.length) return false;
  for (let i = 0; i < count; i++) {
    if (data[offset + i] !== 0x00) return false;
  }
  return true;
}

// ── Segment Discovery ────────────────────────────────────────────────────

/**
 * Discover segments in a binary by scanning for the PN header pattern:
 *   [16B header] [8 ASCII digits] [8 null bytes]
 * 
 * This works regardless of file format — it finds segments by their
 * structural signature, not by hardcoded offsets.
 */
export function discoverSegments(data: Uint8Array, analysis: BinaryAnalysis): SegmentInfo[] {
  const segments: SegmentInfo[] = [];
  const seenOffsets = new Set<number>();

  // Strategy 1: Use the parser's known segment offsets and verify them
  for (const seg of analysis.segments) {
    const pnBytes = stringToBytes(seg.partNumber);
    let pnOffset = -1;

    // Check at the parser's reported offset + 0x10 (EFILive standard)
    if (verifyBytesAtOffset(data, seg.binOffset + 0x10, pnBytes)) {
      pnOffset = seg.binOffset + 0x10;
    }

    // If not found, do a pattern search in the vicinity
    if (pnOffset < 0) {
      const searchStart = Math.max(0, seg.binOffset - 0x10000);
      const searchEnd = Math.min(data.length, seg.binOffset + 0x10000);
      for (let off = searchStart; off < searchEnd; off++) {
        if (verifyBytesAtOffset(data, off, pnBytes) && isNullBytes(data, off + 8, 8)) {
          pnOffset = off;
          break;
        }
      }
    }

    // Fallback: full binary scan
    if (pnOffset < 0) {
      const allMatches = findAllOccurrences(data, pnBytes);
      for (const m of allMatches) {
        if (isNullBytes(data, m + 8, 8)) {
          pnOffset = m;
          break;
        }
      }
    }

    if (pnOffset >= 0 && !seenOffsets.has(pnOffset)) {
      seenOffsets.add(pnOffset);
      segments.push({
        index: seg.index,
        label: seg.function,
        partNumber: seg.partNumber,
        headerOffset: pnOffset - 16,
        pnOffset,
        dataOffset: pnOffset + 16,
        endOffset: 0, // computed below
        totalSize: 0,
        verified: true,
      });
    }
  }

  // Strategy 2: Scan for the [8 digits][8 nulls] pattern in calibration areas
  // This catches segments the parser might have missed
  // Covers both PPEI container (0x3F0000+) and EFILive (0x060000+, 0x200000+) layouts
  const scanRanges = [
    [0x030000, Math.min(0x0A0000, data.length)],  // EFILive cal segments
    [0x1F0000, Math.min(0x600000, data.length)],   // EFILive OS + PPEI segments
    [0x600000, Math.min(0x700000, data.length)],   // Extended area
  ];

  for (const [start, end] of scanRanges) {
    for (let off = start; off < end - 16; off++) {
      if (isAsciiDigits(data, off, 8) && isNullBytes(data, off + 8, 8)) {
        // Verify it looks like a segment header (not random data)
        const pn = readAscii(data, off, 8);
        if (pn.length !== 8) continue;
        // Skip if it's a known PN we already found
        if (seenOffsets.has(off)) continue;

        // Check the 16 bytes before — should have some structure (not all 0xFF or 0x00)
        const header = data.slice(off - 16, off);
        let allFF = true;
        let allZero = true;
        for (let i = 0; i < 16; i++) {
          if (header[i] !== 0xFF) allFF = false;
          if (header[i] !== 0x00) allZero = false;
        }
        if (allFF || allZero) continue;

        // Check if the PN starts with "12" (GM part number prefix)
        if (!pn.startsWith('12')) continue;

        seenOffsets.add(off);
        const existingIdx = segments.findIndex(s => s.partNumber === pn);
        if (existingIdx >= 0) continue; // Already have this PN

        segments.push({
          index: segments.length + 1,
          label: `Segment ${segments.length + 1}`,
          partNumber: pn,
          headerOffset: off - 16,
          pnOffset: off,
          dataOffset: off + 16,
          endOffset: 0,
          totalSize: 0,
          verified: true,
        });
      }
    }
  }

  // Sort by offset
  segments.sort((a, b) => a.pnOffset - b.pnOffset);

  // Re-index after sorting
  for (let i = 0; i < segments.length; i++) {
    segments[i].index = i + 1;
  }

  // Compute end offsets: each segment ends where the next one's header starts
  for (let i = 0; i < segments.length; i++) {
    if (i + 1 < segments.length) {
      segments[i].endOffset = segments[i + 1].headerOffset;
    } else {
      // Last segment — ends at signature area or file end
      // Signature blocks typically start at 0x800000
      const sigArea = 0x800000;
      if (segments[i].headerOffset < sigArea && sigArea < data.length) {
        // Check if there's actual signature data there
        if (isAsciiDigits(data, sigArea + 0x10, 8)) {
          segments[i].endOffset = sigArea;
        } else {
          segments[i].endOffset = data.length;
        }
      } else {
        segments[i].endOffset = data.length;
      }
    }
    segments[i].totalSize = segments[i].endOffset - segments[i].headerOffset;
  }

  return segments;
}

/**
 * Find the OS part number in a binary.
 * Typically at offset 0x000020 in PPEI containers, or from the parser's findings.
 */
export function findOsPN(data: Uint8Array, analysis: BinaryAnalysis): string {
  // Check the standard PPEI container location first (OS at 0x000020)
  if (isAsciiDigits(data, 0x20, 8) && isNullBytes(data, 0x28, 8)) {
    return readAscii(data, 0x20, 8);
  }

  // Check EFILive OS location (OS at 0x200020)
  if (isAsciiDigits(data, 0x200020, 8) && isNullBytes(data, 0x200028, 8)) {
    return readAscii(data, 0x200020, 8);
  }

  // Check the parser's findings for OS-related part numbers
  for (const f of analysis.findings) {
    if (f.category === 'part_number' && f.label.toLowerCase().includes('os')) {
      return f.value;
    }
  }

  // Check PPEI metadata
  if (analysis.ppeiMetadata) {
    for (const sp of analysis.ppeiMetadata.softwareParts) {
      if (sp.function?.toLowerCase().includes('operating system') || sp.key?.includes('os')) {
        return sp.partNumber;
      }
    }
  }

  // Fallback: first part number found
  if (analysis.partNumbers.length > 0) {
    return analysis.partNumbers[0];
  }

  return 'UNKNOWN';
}

// ── Binary Pair Setup ────────────────────────────────────────────────────

/**
 * Set up a binary pair for segment swapping.
 * Parses both files, discovers segments, checks OS compatibility.
 */
export function setupBinaryPair(
  targetData: Uint8Array,
  targetFileName: string,
  targetAnalysis: BinaryAnalysis,
  sourceData: Uint8Array,
  sourceFileName: string,
  sourceAnalysis: BinaryAnalysis
): BinaryPair {
  const targetSegments = discoverSegments(targetData, targetAnalysis);
  const sourceSegments = discoverSegments(sourceData, sourceAnalysis);

  const targetOS = findOsPN(targetData, targetAnalysis);
  const sourceOS = findOsPN(sourceData, sourceAnalysis);

  const osMatch = targetOS === sourceOS;

  // Match segments by index (same position in the segment map)
  const matchedSegments: BinaryPair['matchedSegments'] = [];
  for (const tSeg of targetSegments) {
    // Find matching source segment by index
    const sSeg = sourceSegments.find(s => s.index === tSeg.index);
    if (sSeg) {
      matchedSegments.push({ source: sSeg, target: tSeg });
    }
  }

  return {
    target: {
      data: targetData,
      fileName: targetFileName,
      analysis: targetAnalysis,
      segments: targetSegments,
      osPN: targetOS,
    },
    source: {
      data: sourceData,
      fileName: sourceFileName,
      analysis: sourceAnalysis,
      segments: sourceSegments,
      osPN: sourceOS,
    },
    osMatch,
    matchedSegments,
  };
}

// ── Swap Validation ─────────────────────────────────────────────────────

/**
 * Validate a single segment swap before executing it.
 */
export function validateSwap(
  pair: BinaryPair,
  segmentIndex: number
): SwapPlan {
  const match = pair.matchedSegments.find(m => m.target.index === segmentIndex);
  const warnings: string[] = [];

  if (!match) {
    return {
      source: {} as SegmentInfo,
      target: {} as SegmentInfo,
      canSwap: false,
      error: `Segment ${segmentIndex} not found in both binaries.`,
      warnings: [],
    };
  }

  const { source, target } = match;

  // Verify source PN is still at expected offset
  const srcPnBytes = stringToBytes(source.partNumber);
  if (!verifyBytesAtOffset(pair.source.data, source.pnOffset, srcPnBytes)) {
    return {
      source,
      target,
      canSwap: false,
      error: `Source segment ${segmentIndex} PN "${source.partNumber}" not verified at ${toHex(source.pnOffset)}. Binary may have been modified.`,
      warnings: [],
    };
  }

  // Verify target PN is still at expected offset
  const tgtPnBytes = stringToBytes(target.partNumber);
  if (!verifyBytesAtOffset(pair.target.data, target.pnOffset, tgtPnBytes)) {
    return {
      source,
      target,
      canSwap: false,
      error: `Target segment ${segmentIndex} PN "${target.partNumber}" not verified at ${toHex(target.pnOffset)}. Binary may have been modified.`,
      warnings: [],
    };
  }

  // Check size compatibility
  if (source.totalSize !== target.totalSize) {
    warnings.push(
      `Segment size mismatch: source is ${source.totalSize.toLocaleString()} bytes, ` +
      `target is ${target.totalSize.toLocaleString()} bytes. ` +
      `The swap will copy ${source.totalSize.toLocaleString()} bytes from source.`
    );
    // Size mismatch is a hard stop — different segment sizes means different layout
    if (Math.abs(source.totalSize - target.totalSize) > 16) {
      return {
        source,
        target,
        canSwap: false,
        error: `Segment ${segmentIndex} size mismatch is too large (${source.totalSize} vs ${target.totalSize} bytes). These binaries may have different segment layouts.`,
        warnings,
      };
    }
  }

  // Check OS compatibility
  if (!pair.osMatch) {
    warnings.push(
      `OS part numbers differ: target="${pair.target.osPN}", source="${pair.source.osPN}". ` +
      `Swapping segments between different OS versions may cause issues.`
    );
  }

  // Same PN = no change needed
  if (source.partNumber === target.partNumber) {
    warnings.push(`Both segments have the same part number (${source.partNumber}). No change needed.`);
  }

  return {
    source,
    target,
    canSwap: true,
    warnings,
  };
}

// ── Execute Swap ────────────────────────────────────────────────────────

/**
 * Execute segment swaps on the target binary.
 * Copies entire segment blocks from source to target.
 * Returns a new ArrayBuffer with the modified data.
 */
export function executeSegmentSwap(
  pair: BinaryPair,
  segmentIndices: number[]
): SwapResult {
  const warnings: string[] = [];
  const swappedSegments: SwapResult['swappedSegments'] = [];

  // Hard stop: OS must match for segment swap to proceed
  if (!pair.osMatch) {
    return {
      success: false,
      swappedSegments: [],
      warnings: [],
      error: `OS mismatch — segment swap blocked. Target OS: ${pair.target.osPN}, Source OS: ${pair.source.osPN}. ` +
        `Both binaries must share the same main operating system part number for segment swap to be safe.`,
    };
  }

  // Validate all swaps first
  for (const idx of segmentIndices) {
    const plan = validateSwap(pair, idx);
    if (!plan.canSwap) {
      return {
        success: false,
        swappedSegments: [],
        warnings: plan.warnings,
        error: plan.error,
      };
    }
    warnings.push(...plan.warnings);
  }

  // Create a copy of the target data
  const modified = new Uint8Array(pair.target.data.length);
  modified.set(pair.target.data);

  // Execute each swap
  for (const idx of segmentIndices) {
    const match = pair.matchedSegments.find(m => m.target.index === idx);
    if (!match) continue;

    const { source, target } = match;

    // Verify one more time before writing
    const srcPnBytes = stringToBytes(source.partNumber);
    if (!verifyBytesAtOffset(pair.source.data, source.pnOffset, srcPnBytes)) {
      return {
        success: false,
        swappedSegments,
        warnings,
        error: `Pre-write verification failed for segment ${idx}: source PN not at expected offset.`,
      };
    }

    const tgtPnBytes = stringToBytes(target.partNumber);
    if (!verifyBytesAtOffset(modified, target.pnOffset, tgtPnBytes)) {
      // If we already swapped this segment in a previous iteration, the PN will have changed
      // Check if the source PN is there instead (from a previous swap)
      if (!verifyBytesAtOffset(modified, target.pnOffset, srcPnBytes)) {
        return {
          success: false,
          swappedSegments,
          warnings,
          error: `Pre-write verification failed for segment ${idx}: target PN not at expected offset.`,
        };
      }
    }

    // Copy the entire segment from source to target
    // Full segment = headerOffset to endOffset
    const copySize = Math.min(source.totalSize, target.totalSize);
    const srcStart = source.headerOffset;
    const tgtStart = target.headerOffset;

    for (let i = 0; i < copySize; i++) {
      modified[tgtStart + i] = pair.source.data[srcStart + i];
    }

    swappedSegments.push({
      index: idx,
      label: target.label,
      sourcePN: source.partNumber,
      targetPN: target.partNumber,
      bytesWritten: copySize,
    });
  }

  // Also update PPEI JSON metadata if present
  if (pair.target.analysis.ppeiMetadata) {
    for (const swapped of swappedSegments) {
      // Find the old PN in JSON and replace with new PN
      const oldJsonPattern = stringToBytes(`"${swapped.targetPN}"`);
      const newJsonBytes = stringToBytes(`"${swapped.sourcePN}"`);
      
      if (oldJsonPattern.length === newJsonBytes.length) {
        const jsonMatches = findAllOccurrences(modified, oldJsonPattern);
        for (const jOff of jsonMatches) {
          for (let i = 0; i < newJsonBytes.length; i++) {
            modified[jOff + i] = newJsonBytes[i];
          }
          warnings.push(`Updated PPEI JSON metadata: ${swapped.targetPN} → ${swapped.sourcePN} at ${toHex(jOff)}`);
        }
      }
    }
  }

  // Verify the swaps by reading back the PNs
  for (const swapped of swappedSegments) {
    const match = pair.matchedSegments.find(m => m.target.index === swapped.index);
    if (!match) continue;
    
    const newPN = readAscii(modified, match.target.pnOffset, 8);
    if (newPN !== swapped.sourcePN) {
      return {
        success: false,
        swappedSegments,
        warnings,
        error: `Post-write verification failed for segment ${swapped.index}: expected PN "${swapped.sourcePN}" but found "${newPN}" at ${toHex(match.target.pnOffset)}.`,
      };
    }
  }

  return {
    success: true,
    modifiedData: modified.buffer,
    swappedSegments,
    warnings,
  };
}

// ── Download ────────────────────────────────────────────────────────────

/**
 * Trigger a browser download of the modified binary.
 */
export function downloadModifiedBinary(
  data: ArrayBuffer,
  originalFileName: string,
  swappedSegments: SwapResult['swappedSegments']
): void {
  const baseName = originalFileName.replace(/\.[^.]+$/, '');
  const ext = originalFileName.match(/\.[^.]+$/)?.[0] || '.bin';
  
  // Build filename with the new PNs
  const pnList = swappedSegments.map(s => s.sourcePN.slice(-4)).join('_');
  const newFileName = `${baseName}_seg_${pnList}${ext}`;

  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = newFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Hex Dump Utility ────────────────────────────────────────────────────

/**
 * Generate a hex dump of a region for display.
 */
export function hexDumpRegion(data: Uint8Array, start: number, length: number): string {
  const lines: string[] = [];
  const end = Math.min(start + length, data.length);
  for (let off = start; off < end; off += 16) {
    const bytes: string[] = [];
    const ascii: string[] = [];
    for (let i = 0; i < 16 && off + i < end; i++) {
      const b = data[off + i];
      bytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
    }
    lines.push(`${toHex(off)}: ${bytes.join(' ').padEnd(48)} | ${ascii.join('')}`);
  }
  return lines.join('\n');
}
