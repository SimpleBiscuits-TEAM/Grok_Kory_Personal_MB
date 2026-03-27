/**
 * ECU Binary Parser — Multi-format parser for GM ECU calibration files.
 * Supports: WinOLS raw dumps (E41), PPEI/EFILive containers (E46), EFILive editable bins (E90+)
 * Extracts: part numbers, calibration IDs, OS IDs, VIN, module names, flash segments,
 *           PPEI metadata, segment headers, and signature blocks.
 * Returns all findings with hex offsets for display.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type FindingCategory = 'part_number' | 'calibration' | 'module' | 'vin' |
  'flash_block' | 'metadata' | 'string' | 'segment' | 'ppei' | 'signature';

export interface BinaryFinding {
  label: string;
  value: string;
  offset: string;        // hex offset e.g. "0x121A48"
  offsetNum: number;     // numeric offset for sorting
  category: FindingCategory;
  description?: string;
  hexDump?: string;      // surrounding hex bytes for context
}

export interface CalibrationIdDecoded {
  raw: string;
  prefix: string;        // "C!GM" or "GM"
  platform: string;      // "E2015", "E46", "E90" etc
  softwareNumber: string; // "G5136011" etc
  variant: string;       // "P2B" etc
}

export interface FlashBlock {
  startOffset: number;
  endOffset: number;
  startHex: string;
  endHex: string;
  size: number;
  description: string;
}

/** Decoded segment from EFILive editable bin */
export interface FlashSegment {
  index: number;         // 1-6 typically
  partNumber: string;
  function: string;      // "Main Operating System", "Fuel System", etc.
  binOffset: number;
  binOffsetHex: string;
  chipAddress: number;
  chipAddressHex: string;
  length: number;
  lengthHex: string;
  cvn?: string;          // Calibration Verification Number
}

/** PPEI container metadata from JSON block */
export interface PpeiMetadata {
  author?: string;
  tuner?: string;
  version?: string;
  canAddress?: string;
  softwareParts: { key: string; partNumber: string; function?: string }[];
  flashBlocks: { address: string; length: string }[];
  raw: Record<string, unknown>;
}

export interface BinaryAnalysis {
  fileName: string;
  fileSize: number;
  fileFormat: 'winols_raw' | 'ppei_container' | 'efilive_editable' | 'efilive_flashfile' | 'unknown';
  formatDescription: string;
  findings: BinaryFinding[];
  calibrationId: CalibrationIdDecoded | null;
  partNumbers: string[];
  moduleNames: string[];
  flashBlocks: FlashBlock[];
  segments: FlashSegment[];
  ppeiMetadata: PpeiMetadata | null;
  vinFound: string | null;
  ecuPlatform: string | null;
  platformFromFilename: string | null;
  hexRegions: HexRegion[];
}

export interface HexRegion {
  label: string;
  offset: number;
  offsetHex: string;
  bytes: Uint8Array;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toHex(n: number): string {
  return '0x' + n.toString(16).toUpperCase().padStart(6, '0');
}

function hexDumpLine(data: Uint8Array, offset: number, len: number = 16): string {
  const bytes: string[] = [];
  const ascii: string[] = [];
  for (let i = 0; i < len && offset + i < data.length; i++) {
    const b = data[offset + i];
    bytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
    ascii.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
  }
  return `${toHex(offset)}: ${bytes.join(' ').padEnd(48)} | ${ascii.join('')}`;
}

function hexDumpRegion(data: Uint8Array, start: number, length: number): string {
  const lines: string[] = [];
  const end = Math.min(start + length, data.length);
  for (let off = start; off < end; off += 16) {
    lines.push(hexDumpLine(data, off));
  }
  return lines.join('\n');
}

function readAsciiString(data: Uint8Array, offset: number, maxLen: number = 64): string {
  let str = '';
  for (let i = 0; i < maxLen && offset + i < data.length; i++) {
    const b = data[offset + i];
    if (b === 0 || b === 0xFF) break;
    if (b >= 0x20 && b <= 0x7E) {
      str += String.fromCharCode(b);
    } else {
      break;
    }
  }
  return str;
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function findPattern(data: Uint8Array, pattern: number[]): number[] {
  const results: number[] = [];
  for (let i = 0; i <= data.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (pattern[j] !== -1 && data[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) results.push(i);
  }
  return results;
}

function findBytes(data: Uint8Array, b1: number, b2: number): number[] {
  const results: number[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === b1 && data[i + 1] === b2) {
      results.push(i);
    }
  }
  return results;
}

// ── Segment Function Labels ──────────────────────────────────────────────

const SEGMENT_FUNCTIONS: Record<number, string> = {
  1: 'Main Operating System',
  2: 'System',
  3: 'Fuel System',
  4: 'Speedometer',
  5: 'Engine Diagnostic',
  6: 'Engine Operation',
};

// ── Platform Detection from Filename ─────────────────────────────────────

function detectPlatformFromFilename(fileName: string): string | null {
  const upper = fileName.toUpperCase();
  // Match E41, E46, E90, E88, E92, etc.
  const match = upper.match(/\b(E\d{2})\b/);
  return match ? match[1] : null;
}

function detectOsPartFromFilename(fileName: string): string | null {
  // Match 8-digit part numbers in filename
  const match = fileName.match(/\b(1[2-9]\d{6})\b/);
  return match ? match[1] : null;
}

// ── Format Detection ─────────────────────────────────────────────────────

type FileFormat = BinaryAnalysis['fileFormat'];

function detectFormat(data: Uint8Array, fileName: string): { format: FileFormat; description: string } {
  const upper = fileName.toUpperCase();

  // Check for PPEI container: has JSON metadata block with "sw_c1" or "author"
  if (hasJsonMetadata(data)) {
    return {
      format: 'ppei_container',
      description: 'PPEI EFILive Container — Encrypted flash file with JSON metadata header',
    };
  }

  // Check for EFILive editable: has structured segment headers with part numbers at known offsets
  if (hasSegmentHeaders(data)) {
    if (upper.includes('FLASHFILE')) {
      return {
        format: 'efilive_flashfile',
        description: 'EFILive Raw Flash Dump — Full ECU flash image with segment headers',
      };
    }
    return {
      format: 'efilive_editable',
      description: 'EFILive Editable Bin — Calibration file with structured segment headers',
    };
  }

  // Check for WinOLS raw: has C!GM_ calibration ID strings
  const calIdPattern = [0x43, 0x21, 0x47, 0x4D, 0x5F]; // "C!GM_"
  if (findPattern(data, calIdPattern).length > 0) {
    return {
      format: 'winols_raw',
      description: 'WinOLS Raw Dump — Unstructured binary with embedded calibration strings',
    };
  }

  return {
    format: 'unknown',
    description: 'Unknown format — generic binary analysis applied',
  };
}

function hasJsonMetadata(data: Uint8Array): boolean {
  // Look for JSON blocks containing "sw_c" or "author" or "tuner"
  const searchStr = '"sw_c1"';
  const searchBytes = Array.from(searchStr).map(c => c.charCodeAt(0));
  if (findPattern(data, searchBytes).length > 0) return true;

  const searchStr2 = '"author"';
  const searchBytes2 = Array.from(searchStr2).map(c => c.charCodeAt(0));
  if (findPattern(data, searchBytes2).length > 0) return true;

  return false;
}

function hasSegmentHeaders(data: Uint8Array): boolean {
  // EFILive editable bins have segment headers at known offsets
  // Each header has a part number (8 ASCII digits) at offset +0x10
  const checkOffsets = [0x040000, 0x045000, 0x04A000, 0x04C000, 0x078000];
  let found = 0;
  for (const off of checkOffsets) {
    if (off + 0x18 >= data.length) continue;
    // Check if there's an 8-digit part number at +0x10
    let isDigits = true;
    for (let j = 0; j < 8; j++) {
      const b = data[off + 0x10 + j];
      if (b < 0x30 || b > 0x39) { isDigits = false; break; }
    }
    if (isDigits) found++;
  }
  return found >= 2;
}

// ── PPEI JSON Metadata Extraction ────────────────────────────────────────

function extractPpeiMetadata(data: Uint8Array): PpeiMetadata | null {
  // Find JSON blocks containing flash descriptor data
  // Look for the pattern: {"sw_c1": or {"author":
  let jsonStart = -1;
  let jsonEnd = -1;

  for (let i = 0; i < data.length - 10; i++) {
    if (data[i] === 0x7B) { // '{'
      // Try to find matching closing brace
      let depth = 0;
      let isJson = false;
      for (let j = i; j < Math.min(i + 10000, data.length); j++) {
        if (data[j] === 0x7B) depth++;
        if (data[j] === 0x7D) depth--;
        if (depth === 0) {
          // Verify it's actual JSON by checking for quotes
          const snippet = String.fromCharCode(...Array.from(data.slice(i, Math.min(i + 20, j))));
          if (snippet.includes('"sw_c') || snippet.includes('"author') || snippet.includes('"tuner') || snippet.includes('"can_addr')) {
            jsonStart = i;
            jsonEnd = j + 1;
            isJson = true;
          }
          break;
        }
      }
      if (isJson) break;
    }
  }

  if (jsonStart < 0) return null;

  try {
    const jsonStr = String.fromCharCode(...Array.from(data.slice(jsonStart, jsonEnd)));
    const parsed = JSON.parse(jsonStr);

    const softwareParts: PpeiMetadata['softwareParts'] = [];
    for (let i = 1; i <= 8; i++) {
      const key = `sw_c${i}`;
      if (parsed[key]) {
        softwareParts.push({
          key,
          partNumber: String(parsed[key]),
          function: SEGMENT_FUNCTIONS[i] || `Segment ${i}`,
        });
      }
    }

    const flashBlocks: PpeiMetadata['flashBlocks'] = [];
    if (Array.isArray(parsed.flash_blocks)) {
      for (const block of parsed.flash_blocks) {
        flashBlocks.push({
          address: block.address || block.addr || '',
          length: block.length || block.len || '',
        });
      }
    }

    return {
      author: parsed.author || undefined,
      tuner: parsed.tuner || undefined,
      version: parsed.version || parsed.ver || undefined,
      canAddress: parsed.can_addr || parsed.canAddress || undefined,
      softwareParts,
      flashBlocks,
      raw: parsed,
    };
  } catch {
    return null;
  }
}

// ── EFILive Segment Header Parsing ───────────────────────────────────────

function parseSegmentHeaders(data: Uint8Array): FlashSegment[] {
  const segments: FlashSegment[] = [];

  // Known segment header offsets for EFILive editable bins
  // These come from the segment_map.txt files
  const segmentCandidates = [
    // E46 layout
    { binOff: 0x040000, chipOff: 0x00840000 },
    { binOff: 0x045000, chipOff: 0x00845000 },
    { binOff: 0x04A000, chipOff: 0x0084A000 },
    { binOff: 0x04C000, chipOff: 0x0084C000 },
    { binOff: 0x078000, chipOff: 0x00878000 },
    { binOff: 0x140000, chipOff: 0x00940000 },
    // E46 alternate layout (larger calibrations)
    { binOff: 0x600000, chipOff: 0x00E00000 },
    { binOff: 0x605000, chipOff: 0x00E05000 },
    { binOff: 0x60B000, chipOff: 0x00E0B000 },
    { binOff: 0x60D000, chipOff: 0x00E0D000 },
    { binOff: 0x623130, chipOff: 0x00E23130 },
    // E90 layout (same as first set but different segment sizes)
    { binOff: 0x300000, chipOff: 0x00B00000 },
  ];

  for (const candidate of segmentCandidates) {
    const off = candidate.binOff;
    if (off + 0x20 >= data.length) continue;

    // Check if there's an 8-digit part number at +0x10
    let isDigits = true;
    for (let j = 0; j < 8; j++) {
      const b = data[off + 0x10 + j];
      if (b < 0x30 || b > 0x39) { isDigits = false; break; }
    }
    if (!isDigits) continue;

    const partNumber = readAsciiString(data, off + 0x10, 8);
    if (!partNumber || partNumber.length !== 8) continue;

    // Read segment index from header byte at +0x04
    const segIdx = data[off + 0x04] || 0;
    // Read the segment index from +0x03 if +0x04 doesn't look right
    const segIdxAlt = data[off + 0x03] || 0;
    const index = (segIdx >= 1 && segIdx <= 8) ? segIdx : (segIdxAlt >= 1 && segIdxAlt <= 8) ? segIdxAlt : segments.length + 1;

    // Try to read CVN from +0x20 area
    const cvnBytes = data.slice(off + 0x20, off + 0x24);
    const cvn = Array.from(cvnBytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');

    segments.push({
      index,
      partNumber,
      function: SEGMENT_FUNCTIONS[index] || `Segment ${index}`,
      binOffset: off,
      binOffsetHex: toHex(off),
      chipAddress: candidate.chipOff,
      chipAddressHex: '0x' + candidate.chipOff.toString(16).toUpperCase().padStart(8, '0'),
      length: 0, // Will be estimated
      lengthHex: '0x000000',
      cvn: cvn !== '00000000' && cvn !== 'FFFFFFFF' ? cvn : undefined,
    });
  }

  // Sort by bin offset
  segments.sort((a, b) => a.binOffset - b.binOffset);

  // Estimate lengths based on gaps between segments
  for (let i = 0; i < segments.length; i++) {
    if (i + 1 < segments.length) {
      segments[i].length = segments[i + 1].binOffset - segments[i].binOffset;
    } else {
      // Last segment — estimate from signature area or file end
      const sigAreaStart = 0x800000;
      if (segments[i].binOffset < sigAreaStart && sigAreaStart < data.length) {
        segments[i].length = sigAreaStart - segments[i].binOffset;
      } else {
        segments[i].length = data.length - segments[i].binOffset;
      }
    }
    segments[i].lengthHex = '0x' + segments[i].length.toString(16).toUpperCase().padStart(6, '0');
  }

  return segments;
}

// ── Signature Block Parsing ──────────────────────────────────────────────

function parseSignatureBlocks(data: Uint8Array, findings: BinaryFinding[], hexRegions: HexRegion[]): string | null {
  const sigBase = 0x800000;
  if (sigBase + 0x100 >= data.length) return null;

  let platformFromSig: string | null = null;

  for (let i = 0; i < 6; i++) {
    const sigOff = sigBase + (i * 0x400);
    if (sigOff + 0x80 >= data.length) break;

    // Check if this signature block has content (not all 0xFF or 0x00)
    let hasContent = false;
    for (let j = 0; j < 0x40; j++) {
      if (data[sigOff + j] !== 0xFF && data[sigOff + j] !== 0x00) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) continue;

    // Extract platform string (e.g., "E88_9099" at offset +0x06)
    const platStr = readAsciiString(data, sigOff + 0x06, 20);
    if (platStr.length > 2 && !platformFromSig) {
      platformFromSig = platStr;
    }

    // Look for module name (e.g., "Engine" at offset ~+0x40)
    const moduleName = readAsciiString(data, sigOff + 0x40, 20);

    findings.push({
      label: `Signature Block ${i + 1}`,
      value: platStr ? `Platform: ${platStr}` : `Block ${i + 1}`,
      offset: toHex(sigOff),
      offsetNum: sigOff,
      category: 'signature',
      description: `Segment ${i + 1} signature${moduleName ? ` — Module: ${moduleName}` : ''}${platStr ? ` — Platform: ${platStr}` : ''}`,
      hexDump: hexDumpRegion(data, sigOff, 64),
    });

    if (i === 0) {
      hexRegions.push({
        label: 'Signature Area',
        offset: sigOff,
        offsetHex: toHex(sigOff),
        bytes: data.slice(sigOff, Math.min(sigOff + 256, data.length)),
      });
    }
  }

  return platformFromSig;
}

// ── Main Parser ────────────────────────────────────────────────────────────

export function parseEcuBinary(buffer: ArrayBuffer, fileName: string): BinaryAnalysis {
  const data = new Uint8Array(buffer);
  const findings: BinaryFinding[] = [];
  const partNumbers: string[] = [];
  const moduleNames: string[] = [];
  const flashBlocks: FlashBlock[] = [];
  const hexRegions: HexRegion[] = [];
  let calibrationId: CalibrationIdDecoded | null = null;
  let vinFound: string | null = null;
  let ecuPlatform: string | null = null;

  // ── 0. Detect file format ──────────────────────────────────────────────
  const { format, description: formatDescription } = detectFormat(data, fileName);
  const platformFromFilename = detectPlatformFromFilename(fileName);
  const osPartFromFilename = detectOsPartFromFilename(fileName);

  // Add format detection finding
  findings.push({
    label: 'File Format Detected',
    value: format.replace(/_/g, ' ').toUpperCase(),
    offset: toHex(0),
    offsetNum: -1, // Sort first
    category: 'metadata',
    description: formatDescription,
  });

  if (platformFromFilename) {
    findings.push({
      label: 'Platform (from filename)',
      value: platformFromFilename,
      offset: toHex(0),
      offsetNum: -1,
      category: 'metadata',
      description: `ECU platform identifier extracted from filename: ${fileName}`,
    });
    ecuPlatform = platformFromFilename;
  }

  if (osPartFromFilename) {
    findings.push({
      label: 'OS Part Number (from filename)',
      value: osPartFromFilename,
      offset: toHex(0),
      offsetNum: -1,
      category: 'metadata',
      description: `Operating system part number extracted from filename`,
    });
  }

  // ── 1. PPEI Container: Extract JSON metadata ──────────────────────────
  let ppeiMetadata: PpeiMetadata | null = null;
  if (format === 'ppei_container') {
    ppeiMetadata = extractPpeiMetadata(data);
    if (ppeiMetadata) {
      if (ppeiMetadata.author) {
        findings.push({
          label: 'PPEI Author',
          value: ppeiMetadata.author,
          offset: toHex(0),
          offsetNum: 0,
          category: 'ppei',
          description: 'Calibration file author',
        });
      }
      if (ppeiMetadata.tuner) {
        findings.push({
          label: 'PPEI Tuner',
          value: ppeiMetadata.tuner,
          offset: toHex(0),
          offsetNum: 0,
          category: 'ppei',
          description: 'Tuning company or brand',
        });
      }
      if (ppeiMetadata.version) {
        findings.push({
          label: 'PPEI Version',
          value: ppeiMetadata.version,
          offset: toHex(0),
          offsetNum: 0,
          category: 'ppei',
          description: 'Calibration version',
        });
      }
      if (ppeiMetadata.canAddress) {
        findings.push({
          label: 'CAN Address',
          value: ppeiMetadata.canAddress,
          offset: toHex(0),
          offsetNum: 0,
          category: 'ppei',
          description: 'ECU CAN bus diagnostic address',
        });
      }
      for (const sp of ppeiMetadata.softwareParts) {
        if (!partNumbers.includes(sp.partNumber)) {
          partNumbers.push(sp.partNumber);
        }
        findings.push({
          label: `Software Calibration (${sp.key})`,
          value: sp.partNumber,
          offset: toHex(0),
          offsetNum: 0,
          category: 'part_number',
          description: `${sp.function || sp.key} — from PPEI flash descriptor`,
        });
      }
      for (let bi = 0; bi < ppeiMetadata.flashBlocks.length; bi++) {
        const fb = ppeiMetadata.flashBlocks[bi];
        findings.push({
          label: `Flash Block ${bi + 1}`,
          value: `Address: ${fb.address}, Length: ${fb.length}`,
          offset: toHex(0),
          offsetNum: 0,
          category: 'flash_block',
          description: 'Flash programming block from PPEI descriptor',
        });
      }
    }
  }

  // ── 2. EFILive Editable: Parse segment headers ────────────────────────
  const segments: FlashSegment[] = [];
  if (format === 'efilive_editable' || format === 'efilive_flashfile') {
    const parsedSegments = parseSegmentHeaders(data);
    segments.push(...parsedSegments);

    for (const seg of parsedSegments) {
      if (!partNumbers.includes(seg.partNumber)) {
        partNumbers.push(seg.partNumber);
      }
      findings.push({
        label: `Segment ${seg.index}: ${seg.function}`,
        value: seg.partNumber,
        offset: seg.binOffsetHex,
        offsetNum: seg.binOffset,
        category: 'segment',
        description: `Part: ${seg.partNumber} | Bin: ${seg.binOffsetHex} | Chip: ${seg.chipAddressHex} | Size: ${(seg.length / 1024).toFixed(1)} KB${seg.cvn ? ` | CVN: ${seg.cvn}` : ''}`,
        hexDump: hexDumpRegion(data, seg.binOffset, 64),
      });

      hexRegions.push({
        label: `Segment ${seg.index}: ${seg.function} (${seg.partNumber})`,
        offset: seg.binOffset,
        offsetHex: seg.binOffsetHex,
        bytes: data.slice(seg.binOffset, Math.min(seg.binOffset + 128, data.length)),
      });
    }
  }

  // ── 2b. PPEI Container / Any format: Discover segments via pattern scan ──
  // If no segments were found by the EFILive parser, scan for the structural
  // pattern [8 ASCII digits][8 null bytes] which identifies segment headers
  // in PPEI containers and other formats.
  if (segments.length === 0 && data.length > 0x40000) {
    const partNumRegexSeg = /^1[2-9]\d{6}$/;
    const seenPnOffsets = new Set<number>();

    // Scan ranges covering PPEI container (0x3F0000+) and EFILive (0x030000+) layouts
    const scanRanges: [number, number][] = [
      [0x030000, Math.min(0x0A0000, data.length)],
      [0x1F0000, Math.min(0x600000, data.length)],
      [0x600000, Math.min(0x700000, data.length)],
    ];

    for (const [start, end] of scanRanges) {
      for (let off = start; off < end - 16; off++) {
        // Check for 8 ASCII digits
        let isDigits = true;
        for (let j = 0; j < 8; j++) {
          const b = data[off + j];
          if (b < 0x30 || b > 0x39) { isDigits = false; break; }
        }
        if (!isDigits) continue;

        // Check for 8 null bytes following the digits
        let isNulls = true;
        for (let j = 0; j < 8; j++) {
          if (data[off + 8 + j] !== 0x00) { isNulls = false; break; }
        }
        if (!isNulls) continue;

        const pn = readAsciiString(data, off, 8);
        if (pn.length !== 8 || !partNumRegexSeg.test(pn)) continue;

        // Check the 16 bytes before — should have some structure (not all 0xFF or 0x00)
        if (off < 16) continue;
        const header = data.slice(off - 16, off);
        let allFF = true;
        let allZero = true;
        for (let i = 0; i < 16; i++) {
          if (header[i] !== 0xFF) allFF = false;
          if (header[i] !== 0x00) allZero = false;
        }
        if (allFF || allZero) continue;

        // Skip duplicate PNs at the same offset
        if (seenPnOffsets.has(off)) continue;
        seenPnOffsets.add(off);

        // Skip if we already have this exact PN (avoid double-counting)
        if (segments.some(s => s.partNumber === pn)) continue;

        const segIndex = segments.length + 1;
        segments.push({
          index: segIndex,
          partNumber: pn,
          function: SEGMENT_FUNCTIONS[segIndex] || `Segment ${segIndex}`,
          binOffset: off - 16, // header starts 16 bytes before PN
          binOffsetHex: toHex(off - 16),
          chipAddress: 0,
          chipAddressHex: '0x00000000',
          length: 0,
          lengthHex: '0x000000',
        });
      }
    }

    // Sort by bin offset and re-index
    if (segments.length > 0) {
      segments.sort((a, b) => a.binOffset - b.binOffset);
      for (let i = 0; i < segments.length; i++) {
        segments[i].index = i + 1;
        segments[i].function = SEGMENT_FUNCTIONS[i + 1] || `Segment ${i + 1}`;
      }

      // Estimate lengths based on gaps between segments
      for (let i = 0; i < segments.length; i++) {
        if (i + 1 < segments.length) {
          segments[i].length = segments[i + 1].binOffset - segments[i].binOffset;
        } else {
          const sigAreaStart = 0x800000;
          if (segments[i].binOffset < sigAreaStart && sigAreaStart < data.length) {
            segments[i].length = sigAreaStart - segments[i].binOffset;
          } else {
            segments[i].length = data.length - segments[i].binOffset;
          }
        }
        segments[i].lengthHex = '0x' + segments[i].length.toString(16).toUpperCase().padStart(6, '0');
      }

      // Add findings and hex regions for discovered segments
      for (const seg of segments) {
        if (!partNumbers.includes(seg.partNumber)) {
          partNumbers.push(seg.partNumber);
        }
        findings.push({
          label: `Segment ${seg.index}: ${seg.function}`,
          value: seg.partNumber,
          offset: seg.binOffsetHex,
          offsetNum: seg.binOffset,
          category: 'segment',
          description: `Part: ${seg.partNumber} | Bin: ${seg.binOffsetHex} | Size: ${seg.length > 1024 * 1024 ? (seg.length / 1024 / 1024).toFixed(2) + ' MB' : (seg.length / 1024).toFixed(1) + ' KB'} (discovered via pattern scan)`,
          hexDump: hexDumpRegion(data, seg.binOffset, 64),
        });

        hexRegions.push({
          label: `Segment ${seg.index}: ${seg.function} (${seg.partNumber})`,
          offset: seg.binOffset,
          offsetHex: seg.binOffsetHex,
          bytes: data.slice(seg.binOffset, Math.min(seg.binOffset + 128, data.length)),
        });
      }
    }
  }

  // ── 3. Parse signature blocks ─────────────────────────────────────────
  const platformFromSig = parseSignatureBlocks(data, findings, hexRegions);
  if (platformFromSig && !ecuPlatform) {
    ecuPlatform = platformFromSig;
  }

  // ── 4. Find GM Calibration ID strings (C!GM_... or GM_E...) ───────────
  // Pattern: "C!GM_"
  const calIdPattern = [0x43, 0x21, 0x47, 0x4D, 0x5F]; // "C!GM_"
  const calIdOffsets = findPattern(data, calIdPattern);
  for (const off of calIdOffsets) {
    const raw = readAsciiString(data, off, 80);
    if (raw.length > 8) {
      const parts = raw.replace('C!GM_', '').split('_');
      const platformMatch = parts[0]?.match(/^([A-Z]\d{2,5})/);
      const softwareMatch = parts[0]?.match(/[A-Z]\d{2,5}([A-Z]\d{7})/);
      const variant = parts[1] || '';

      calibrationId = {
        raw,
        prefix: 'C!GM',
        platform: platformMatch ? platformMatch[1] : parts[0] || '',
        softwareNumber: softwareMatch ? softwareMatch[1] : '',
        variant,
      };

      if (!ecuPlatform) ecuPlatform = calibrationId.platform;

      findings.push({
        label: 'GM Calibration ID',
        value: raw,
        offset: toHex(off),
        offsetNum: off,
        category: 'calibration',
        description: `Platform: ${calibrationId.platform}, Software: ${calibrationId.softwareNumber}, Variant: ${calibrationId.variant}`,
        hexDump: hexDumpRegion(data, off - 16, 64),
      });

      hexRegions.push({
        label: 'Calibration ID Block',
        offset: Math.max(0, off - 16),
        offsetHex: toHex(Math.max(0, off - 16)),
        bytes: data.slice(Math.max(0, off - 16), off + 64),
      });
    }
  }

  // Also check for "GM_E" pattern (without C! prefix, found in raw flash dumps)
  const gmEPattern = [0x47, 0x4D, 0x5F, 0x45]; // "GM_E"
  const gmEOffsets = findPattern(data, gmEPattern);
  for (const off of gmEOffsets) {
    const raw = readAsciiString(data, off, 80);
    if (raw.length > 10 && !calibrationId) {
      const parts = raw.replace('GM_', '').split('_');
      const platformMatch = parts[0]?.match(/^([A-Z]\d{2,5})/);

      calibrationId = {
        raw,
        prefix: 'GM',
        platform: platformMatch ? platformMatch[1] : parts[0] || '',
        softwareNumber: parts[1] || '',
        variant: parts[2] || '',
      };

      if (!ecuPlatform) ecuPlatform = calibrationId.platform;

      findings.push({
        label: 'GM Calibration ID',
        value: raw,
        offset: toHex(off),
        offsetNum: off,
        category: 'calibration',
        description: `Platform: ${calibrationId.platform}`,
        hexDump: hexDumpRegion(data, off - 16, 64),
      });
    }
  }

  // ── 5. Find 8-digit GM Part Numbers ────────────────────────────────────
  const partNumRegex = /^1[2-9]\d{6}$/;
  const foundPartOffsets = new Set<string>(); // Avoid duplicates at same offset
  for (let i = 0; i < data.length - 8; i++) {
    // Check if we have 8 consecutive ASCII digits
    let isDigits = true;
    for (let j = 0; j < 8; j++) {
      const b = data[i + j];
      if (b < 0x30 || b > 0x39) { isDigits = false; break; }
    }
    if (!isDigits) continue;

    // Check byte before and after aren't also digits
    if (i > 0 && data[i - 1] >= 0x30 && data[i - 1] <= 0x39) continue;
    if (i + 8 < data.length && data[i + 8] >= 0x30 && data[i + 8] <= 0x39) continue;

    const numStr = readAsciiString(data, i, 8);
    if (!partNumRegex.test(numStr)) continue;

    // Skip if this part number was already found at a segment header (avoid double-reporting)
    const key = numStr;
    if (!foundPartOffsets.has(key)) {
      foundPartOffsets.add(key);
      if (!partNumbers.includes(numStr)) {
        partNumbers.push(numStr);
      }

      // Only add as a finding if not already reported by segment parser
      const alreadyReported = findings.some(f => f.category === 'segment' && f.value === numStr);
      if (!alreadyReported) {
        const lookup = lookupPartNumber(numStr);
        findings.push({
          label: 'GM Part Number',
          value: numStr,
          offset: toHex(i),
          offsetNum: i,
          category: 'part_number',
          description: lookup
            ? `${lookup.description} — ${lookup.application}`
            : 'GM 8-digit service part number',
          hexDump: hexDumpRegion(data, Math.max(0, i - 16), 64),
        });

        if (!segments.some(s => s.partNumber === numStr)) {
          hexRegions.push({
            label: `Part Number: ${numStr}`,
            offset: Math.max(0, i - 32),
            offsetHex: toHex(Math.max(0, i - 32)),
            bytes: data.slice(Math.max(0, i - 32), i + 48),
          });
        }
      }
    }
  }

  // ── 6. Find ECU Module Name Strings ────────────────────────────────────
  const modulePattern = /^[A-Z]{3,4}[0-9]?-[A-Za-z]{4,}/;
  for (let i = 0; i < data.length - 10; i++) {
    if (data[i] < 0x41 || data[i] > 0x5A) continue;
    if (data[i + 1] < 0x41 || data[i + 1] > 0x5A) continue;

    const str = readAsciiString(data, i, 40);
    if (str.length > 8 && modulePattern.test(str) && !moduleNames.includes(str)) {
      moduleNames.push(str);
      findings.push({
        label: 'ECU Module Name',
        value: str,
        offset: toHex(i),
        offsetNum: i,
        category: 'module',
        description: `Controller: ${str.split('-')[0]}, Function: ${str.split('-')[1] || ''}`,
      });
    }
  }

  // ── 7. Find VIN (17-character alphanumeric) ────────────────────────────
  const vinRegex = /^[1-5][A-HJ-NPR-Z0-9]{16}$/;
  for (let i = 0; i < data.length - 17; i++) {
    let isAlnum = true;
    for (let j = 0; j < 17; j++) {
      const b = data[i + j];
      const isUpper = b >= 0x41 && b <= 0x5A;
      const isDigit = b >= 0x30 && b <= 0x39;
      if (!isUpper && !isDigit) { isAlnum = false; break; }
    }
    if (!isAlnum) continue;

    const before = i > 0 ? data[i - 1] : 0;
    const after = i + 17 < data.length ? data[i + 17] : 0;
    const beforeIsAlnum = (before >= 0x41 && before <= 0x5A) || (before >= 0x30 && before <= 0x39);
    const afterIsAlnum = (after >= 0x41 && after <= 0x5A) || (after >= 0x30 && after <= 0x39);
    if (beforeIsAlnum || afterIsAlnum) continue;

    const candidate = readAsciiString(data, i, 17);
    if (vinRegex.test(candidate)) {
      vinFound = candidate;
      findings.push({
        label: 'Vehicle Identification Number (VIN)',
        value: candidate,
        offset: toHex(i),
        offsetNum: i,
        category: 'vin',
        description: 'VIN found in binary — auto-decoded via NHTSA',
        hexDump: hexDumpRegion(data, Math.max(0, i - 16), 64),
      });

      hexRegions.push({
        label: 'VIN Storage',
        offset: Math.max(0, i - 16),
        offsetHex: toHex(Math.max(0, i - 16)),
        bytes: data.slice(Math.max(0, i - 16), i + 48),
      });
      break;
    }
  }

  // ── 8. Find Flash Block Markers (AA55 / 55AA) ─────────────────────────
  const aa55Offsets = findBytes(data, 0xAA, 0x55);

  // Only report aligned AA55 markers
  const significantAA55 = aa55Offsets.filter(off => off % 0x1000 === 0 || off % 0x10000 === 0);
  for (const off of significantAA55.slice(0, 15)) {
    findings.push({
      label: 'Flash Block Marker: AA55',
      value: 'AA55 (block start)',
      offset: toHex(off),
      offsetNum: off,
      category: 'flash_block',
      description: 'Flash memory block boundary marker',
      hexDump: hexDumpRegion(data, off, 32),
    });
  }

  // ── 9. Find additional metadata strings ────────────────────────────────
  const interestingPatterns: { search: string; label: string; desc: string }[] = [
    { search: 'BOOT', label: 'Bootloader Reference', desc: 'Bootloader identification' },
    { search: 'CAL_', label: 'Calibration Label', desc: 'Calibration data label' },
    { search: 'DID_', label: 'DID Reference', desc: 'Diagnostic ID reference' },
    { search: 'SW:', label: 'Software Version', desc: 'Software version string' },
    { search: 'HW:', label: 'Hardware Version', desc: 'Hardware version string' },
    { search: 'OS:', label: 'OS Version', desc: 'Operating system version string' },
  ];

  for (const pat of interestingPatterns) {
    const searchBytes = Array.from(pat.search).map(c => c.charCodeAt(0));
    const offsets = findPattern(data, searchBytes);
    for (const off of offsets.slice(0, 3)) {
      const context = readAsciiString(data, off, 40);
      if (context.length > pat.search.length) {
        findings.push({
          label: pat.label,
          value: context,
          offset: toHex(off),
          offsetNum: off,
          category: 'string',
          description: pat.desc,
        });
      }
    }
  }

  // ── 10. Build flash block map ──────────────────────────────────────────
  if (segments.length > 0) {
    for (const seg of segments) {
      flashBlocks.push({
        startOffset: seg.binOffset,
        endOffset: seg.binOffset + seg.length,
        startHex: seg.binOffsetHex,
        endHex: toHex(seg.binOffset + seg.length),
        size: seg.length,
        description: `${seg.function} (${seg.partNumber})`,
      });
    }
  }

  // Always add full file block
  flashBlocks.push({
    startOffset: 0,
    endOffset: data.length,
    startHex: toHex(0),
    endHex: toHex(data.length),
    size: data.length,
    description: `Full Binary (${(data.length / 1024 / 1024).toFixed(2)} MB)`,
  });

  // ── 11. Add hex regions for key areas ──────────────────────────────────
  hexRegions.push({
    label: 'File Header',
    offset: 0,
    offsetHex: toHex(0),
    bytes: data.slice(0, 128),
  });

  const tailStart = Math.max(0, data.length - 128);
  hexRegions.push({
    label: 'File Tail',
    offset: tailStart,
    offsetHex: toHex(tailStart),
    bytes: data.slice(tailStart),
  });

  if (moduleNames.length > 0) {
    const firstModuleFinding = findings.find(f => f.category === 'module');
    if (firstModuleFinding) {
      const modStart = firstModuleFinding.offsetNum;
      hexRegions.push({
        label: 'Module Name Table',
        offset: modStart,
        offsetHex: toHex(modStart),
        bytes: data.slice(modStart, Math.min(modStart + 256, data.length)),
      });
    }
  }

  // Sort findings by offset
  findings.sort((a, b) => a.offsetNum - b.offsetNum);

  return {
    fileName,
    fileSize: data.length,
    fileFormat: format,
    formatDescription,
    findings,
    calibrationId,
    partNumbers,
    moduleNames,
    flashBlocks,
    segments,
    ppeiMetadata,
    vinFound,
    ecuPlatform,
    platformFromFilename,
    hexRegions,
  };
}

// ── NHTSA VIN Decode ───────────────────────────────────────────────────────

export interface NhtsaVehicleInfo {
  make: string;
  model: string;
  year: string;
  engine: string;
  displacement: string;
  fuelType: string;
  transmission: string;
  driveType: string;
  bodyClass: string;
  plantCity: string;
  plantCountry: string;
  gvwr: string;
  errorCode: string;
  allFields: Record<string, string>;
}

export async function decodeVinNhtsa(vin: string): Promise<NhtsaVehicleInfo | null> {
  try {
    const resp = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
    const json = await resp.json();
    const result = json.Results?.[0];
    if (!result) return null;

    const allFields: Record<string, string> = {};
    for (const [key, val] of Object.entries(result)) {
      if (val && typeof val === 'string' && val.trim() !== '' && val !== 'Not Applicable') {
        allFields[key] = val;
      }
    }

    return {
      make: result.Make || '',
      model: result.Model || '',
      year: result.ModelYear || '',
      engine: result.EngineModel || '',
      displacement: result.DisplacementL ? `${result.DisplacementL}L` : '',
      fuelType: result.FuelTypePrimary || '',
      transmission: result.TransmissionStyle || '',
      driveType: result.DriveType || '',
      bodyClass: result.BodyClass || '',
      plantCity: result.PlantCity || '',
      plantCountry: result.PlantCountry || '',
      gvwr: result.GVWR || '',
      errorCode: result.ErrorCode || '',
      allFields,
    };
  } catch {
    return null;
  }
}

// ── GM Part Number Lookup (known database) ─────────────────────────────────

interface PartNumberInfo {
  number: string;
  description: string;
  application: string;
  notes: string;
}

const KNOWN_GM_PARTS: Record<string, PartNumberInfo> = {
  // ── E41 Platform (6.6L Duramax LML) ──
  '12680381': { number: '12680381', description: 'Engine Control Module (ECM)', application: '2015-2016 GM 6.6L Duramax LML', notes: 'E41 platform ECM' },
  '12677687': { number: '12677687', description: 'Engine Control Module (ECM)', application: '2011-2014 GM 6.6L Duramax LML', notes: 'E41 platform ECM' },
  '12654075': { number: '12654075', description: 'Engine Control Module (ECM)', application: '2011-2012 GM 6.6L Duramax LML', notes: 'Earlier E41 revision' },
  '12680382': { number: '12680382', description: 'Engine Control Module (ECM)', application: '2015-2016 GM 6.6L Duramax LML', notes: 'E41 variant' },
  '12680383': { number: '12680383', description: 'Engine Control Module (ECM)', application: '2015-2016 GM 6.6L Duramax LML', notes: 'E41 variant' },

  // ── E46 Platform (3.0L Duramax LM2) ──
  '12714133': { number: '12714133', description: 'Main Operating System', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 platform ECM OS' },
  '12713062': { number: '12713062', description: 'System Calibration', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 system parameters' },
  '12713056': { number: '12713056', description: 'Fuel System Calibration', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 fuel injection tables' },
  '12713066': { number: '12713066', description: 'Speedometer Calibration', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 speed/gear calibration' },
  '12729025': { number: '12729025', description: 'Engine Diagnostic Calibration', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 DTC thresholds and monitors' },
  '12729020': { number: '12729020', description: 'Engine Operation Calibration', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 main tuning tables (largest segment)' },
  '12713051': { number: '12713051', description: 'Engine Diagnostic Calibration', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 alternate diagnostic cal' },
  '12713046': { number: '12713046', description: 'Engine Operation Calibration', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 alternate operation cal' },
  '24000103': { number: '24000103', description: 'ECM Hardware', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 ECM hardware part number' },
  '24000425': { number: '24000425', description: 'ECM Software', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'E46 ECM software/OS' },
  '55496499': { number: '55496499', description: 'Utility/Bootstrap Module', application: '2020-2023 GM 3.0L Duramax LM2', notes: 'SPS programming utility file' },

  // ── E90/E88 Platform (EcoTec3 V8 Gasoline) ──
  '12719161': { number: '12719161', description: 'Main Operating System', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 platform ECM OS' },
  '12703283': { number: '12703283', description: 'System Calibration', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 system parameters' },
  '12682660': { number: '12682660', description: 'Fuel System Calibration', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 fuel injection tables' },
  '12682681': { number: '12682681', description: 'Speedometer Calibration', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 speed/gear calibration' },
  '12719267': { number: '12719267', description: 'Engine Diagnostic Calibration', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 DTC thresholds and monitors' },
  '12719258': { number: '12719258', description: 'Engine Operation Calibration', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 main tuning tables' },
  '12700913': { number: '12700913', description: 'System Calibration (prior)', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 previous system cal' },
  '12701449': { number: '12701449', description: 'Engine Diagnostic (prior)', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 previous diagnostic cal' },
  '12700940': { number: '12700940', description: 'Engine Operation (prior)', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 previous operation cal' },
  '12695569': { number: '12695569', description: 'ECM Hardware', application: '2019-2022 GM 5.3L/6.2L EcoTec3', notes: 'E90 ECM hardware part number' },

  // ── Common Cross-Platform Parts ──
  '84937089': { number: '84937089', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in VIT1 part list' },
  '84983712': { number: '84983712', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in VIT1 part list' },
  '13533486': { number: '13533486', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in VIT1 part list' },
  '13526562': { number: '13526562', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Common across platforms' },
  '13533375': { number: '13533375', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in VIT1 part list' },
  '13533491': { number: '13533491', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in VIT1 part list' },
  '13532117': { number: '13532117', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in E90 VIT1' },
  '13529267': { number: '13529267', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in E90 VIT1' },
  '13533370': { number: '13533370', description: 'Unknown Module', application: 'GM Trucks/SUVs', notes: 'Found in E90 VIT1' },
};

export function lookupPartNumber(partNum: string): PartNumberInfo | null {
  return KNOWN_GM_PARTS[partNum] || null;
}
