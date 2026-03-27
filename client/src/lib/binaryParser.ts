/**
 * ECU Binary Parser — Extracts part numbers, calibration IDs, OS IDs,
 * VIN, module names, and flash block structure from GM ECU calibration files.
 * Returns all findings with hex offsets for display.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface BinaryFinding {
  label: string;
  value: string;
  offset: string;        // hex offset e.g. "0x121A48"
  offsetNum: number;     // numeric offset for sorting
  category: 'part_number' | 'calibration' | 'module' | 'vin' | 'flash_block' | 'metadata' | 'string';
  description?: string;
  hexDump?: string;      // surrounding hex bytes for context
}

export interface CalibrationIdDecoded {
  raw: string;
  prefix: string;        // "C!GM" or similar
  platform: string;      // "E2015" etc
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

export interface BinaryAnalysis {
  fileName: string;
  fileSize: number;
  findings: BinaryFinding[];
  calibrationId: CalibrationIdDecoded | null;
  partNumbers: string[];
  moduleNames: string[];
  flashBlocks: FlashBlock[];
  vinFound: string | null;
  ecuPlatform: string | null;
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

  // ── 1. Find GM Calibration ID strings (C!GM_...) ──────────────────────
  const calIdPattern = [0x43, 0x21, 0x47, 0x4D, 0x5F]; // "C!GM_"
  const calIdOffsets = findPattern(data, calIdPattern);
  for (const off of calIdOffsets) {
    const raw = readAsciiString(data, off, 80);
    if (raw.length > 8) {
      // Decode: C!GM_E2015G5136011_P2B
      const parts = raw.replace('C!GM_', '').split('_');
      const platformMatch = parts[0]?.match(/^([A-Z]\d{4})/);
      const softwareMatch = parts[0]?.match(/[A-Z]\d{4}([A-Z]\d{7})/);
      const variant = parts[1] || '';

      calibrationId = {
        raw,
        prefix: 'C!GM',
        platform: platformMatch ? platformMatch[1] : parts[0] || '',
        softwareNumber: softwareMatch ? softwareMatch[1] : '',
        variant,
      };

      ecuPlatform = calibrationId.platform;

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

  // ── 2. Find 8-digit GM Part Numbers ────────────────────────────────────
  // GM part numbers are typically 8 digits starting with 1 (e.g., 12680381)
  const partNumRegex = /\b(1[2-9]\d{6})\b/;
  for (let i = 0; i < data.length - 8; i++) {
    // Check if we have 8 consecutive ASCII digits
    let isDigits = true;
    for (let j = 0; j < 8; j++) {
      const b = data[i + j];
      if (b < 0x30 || b > 0x39) { isDigits = false; break; }
    }
    if (!isDigits) continue;

    // Check byte before and after aren't also digits (avoid matching inside larger numbers)
    if (i > 0 && data[i - 1] >= 0x30 && data[i - 1] <= 0x39) continue;
    if (i + 8 < data.length && data[i + 8] >= 0x30 && data[i + 8] <= 0x39) continue;

    const numStr = readAsciiString(data, i, 8);
    if (partNumRegex.test(numStr) && !partNumbers.includes(numStr)) {
      partNumbers.push(numStr);
      findings.push({
        label: 'GM Part Number',
        value: numStr,
        offset: toHex(i),
        offsetNum: i,
        category: 'part_number',
        description: 'GM 8-digit service part number',
        hexDump: hexDumpRegion(data, Math.max(0, i - 16), 64),
      });

      hexRegions.push({
        label: `Part Number: ${numStr}`,
        offset: Math.max(0, i - 32),
        offsetHex: toHex(Math.max(0, i - 32)),
        bytes: data.slice(Math.max(0, i - 32), i + 48),
      });
    }
  }

  // ── 3. Find ECU Module Name Strings ────────────────────────────────────
  // Pattern: 4-letter code + dash + descriptive name (e.g., "FPCM-FuelPumpCtrl")
  const modulePattern = /^[A-Z]{3,4}[0-9]?-[A-Za-z]{4,}/;
  for (let i = 0; i < data.length - 10; i++) {
    // Quick check: uppercase letter followed by more uppercase
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

  // ── 4. Find VIN (17-character alphanumeric) ────────────────────────────
  // VIN: 17 chars, no I/O/Q, starts with 1/2/3/4/5 for North America
  const vinPattern = /^[1-5][A-HJ-NPR-Z0-9]{16}$/;
  for (let i = 0; i < data.length - 17; i++) {
    let isAlnum = true;
    for (let j = 0; j < 17; j++) {
      const b = data[i + j];
      const isUpper = b >= 0x41 && b <= 0x5A;
      const isDigit = b >= 0x30 && b <= 0x39;
      if (!isUpper && !isDigit) { isAlnum = false; break; }
    }
    if (!isAlnum) continue;

    // Check boundaries
    const before = i > 0 ? data[i - 1] : 0;
    const after = i + 17 < data.length ? data[i + 17] : 0;
    const beforeIsAlnum = (before >= 0x41 && before <= 0x5A) || (before >= 0x30 && before <= 0x39);
    const afterIsAlnum = (after >= 0x41 && after <= 0x5A) || (after >= 0x30 && after <= 0x39);
    if (beforeIsAlnum || afterIsAlnum) continue;

    const candidate = readAsciiString(data, i, 17);
    if (vinPattern.test(candidate)) {
      vinFound = candidate;
      findings.push({
        label: 'Vehicle Identification Number (VIN)',
        value: candidate,
        offset: toHex(i),
        offsetNum: i,
        category: 'vin',
        description: 'VIN found in binary — can be used for NHTSA decode and TIS2Web lookup',
        hexDump: hexDumpRegion(data, Math.max(0, i - 16), 64),
      });

      hexRegions.push({
        label: 'VIN Storage',
        offset: Math.max(0, i - 16),
        offsetHex: toHex(Math.max(0, i - 16)),
        bytes: data.slice(Math.max(0, i - 16), i + 48),
      });
      break; // Only need first VIN
    }
  }

  // ── 5. Find Flash Block Markers (AA55 / 55AA) ─────────────────────────
  const aa55Offsets = findBytes(data, 0xAA, 0x55);
  const _55aaOffsets = findBytes(data, 0x55, 0xAA);

  // Only report markers that are at aligned positions or near block boundaries
  const significantMarkers: { offset: number; type: string }[] = [];

  for (const off of aa55Offsets) {
    // Filter: must be at a somewhat aligned offset or near other data
    if (off % 4 === 0 || off < 0x100) {
      significantMarkers.push({ offset: off, type: 'AA55 (block start)' });
    }
  }
  for (const off of _55aaOffsets) {
    if (off % 4 === 0 || off > data.length - 0x100) {
      significantMarkers.push({ offset: off, type: '55AA (block end)' });
    }
  }

  // Limit to most significant markers (near beginning, end, and around part number blocks)
  const keyMarkers = significantMarkers.filter(m => {
    return m.offset < 0x100 ||
           m.offset > data.length - 0x100 ||
           Math.abs(m.offset - 0x10B3B4) < 0x20 ||
           Math.abs(m.offset - 0x121A08) < 0x40 ||
           Math.abs(m.offset - 0x121A28) < 0x40 ||
           Math.abs(m.offset - 0x3C1A00) < 0x20 ||
           // Near any found part number
           partNumbers.length > 0;
  }).slice(0, 20); // Cap at 20 markers

  for (const m of keyMarkers) {
    findings.push({
      label: `Flash Block Marker: ${m.type}`,
      value: m.type,
      offset: toHex(m.offset),
      offsetNum: m.offset,
      category: 'flash_block',
      description: 'Flash memory block boundary marker',
      hexDump: hexDumpRegion(data, m.offset, 32),
    });
  }

  // ── 6. Find Flash Validation Patterns ──────────────────────────────────
  // 33 CC EE 11 F0 0F pattern = flash validation signature
  const flashValPattern = [0x33, 0xCC, 0xEE, 0x11, 0xF0, 0x0F];
  const flashValOffsets = findPattern(data, flashValPattern);
  for (const off of flashValOffsets) {
    findings.push({
      label: 'Flash Validation Signature',
      value: '33 CC EE 11 F0 0F',
      offset: toHex(off),
      offsetNum: off,
      category: 'metadata',
      description: 'Flash programming validation pattern — confirms valid flash write',
      hexDump: hexDumpRegion(data, Math.max(0, off - 8), 48),
    });
  }

  // ── 7. Find additional ASCII strings of interest ───────────────────────
  // Look for strings like "DTC", "DIAG", "SEED", "KEY", version strings, etc.
  const interestingPatterns: { search: string; label: string; desc: string }[] = [
    { search: 'SEED', label: 'Seed/Key Reference', desc: 'Security access seed/key area' },
    { search: 'DIAG', label: 'Diagnostic Reference', desc: 'Diagnostic mode reference' },
    { search: 'BOOT', label: 'Bootloader Reference', desc: 'Bootloader identification' },
    { search: 'FLASH', label: 'Flash Reference', desc: 'Flash programming reference' },
    { search: 'CAL_', label: 'Calibration Label', desc: 'Calibration data label' },
    { search: 'DID_', label: 'DID Reference', desc: 'Diagnostic ID reference' },
  ];

  for (const pat of interestingPatterns) {
    const searchBytes = Array.from(pat.search).map(c => c.charCodeAt(0));
    const offsets = findPattern(data, searchBytes);
    for (const off of offsets.slice(0, 3)) { // Max 3 per pattern
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

  // ── 8. Detect GM software/OS strings ───────────────────────────────────
  // Look for patterns like "SW:" or software version strings
  const swPatterns = [
    [0x53, 0x57, 0x3A], // "SW:"
    [0x48, 0x57, 0x3A], // "HW:"
    [0x4F, 0x53, 0x3A], // "OS:"
  ];
  for (const pat of swPatterns) {
    const offsets = findPattern(data, pat);
    for (const off of offsets.slice(0, 3)) {
      const str = readAsciiString(data, off, 40);
      if (str.length > 3) {
        findings.push({
          label: str.startsWith('SW') ? 'Software Version' : str.startsWith('HW') ? 'Hardware Version' : 'OS Version',
          value: str,
          offset: toHex(off),
          offsetNum: off,
          category: 'metadata',
          description: 'Version identification string',
          hexDump: hexDumpRegion(data, off, 48),
        });
      }
    }
  }

  // ── 9. Build flash block map ───────────────────────────────────────────
  // Estimate flash blocks from AA55/55AA markers
  const allMarkers = [
    ...aa55Offsets.filter(o => o % 4 === 0 || o < 0x100).map(o => ({ offset: o, type: 'start' as const })),
    ..._55aaOffsets.filter(o => o % 4 === 0 || o > data.length - 0x100).map(o => ({ offset: o, type: 'end' as const })),
  ].sort((a, b) => a.offset - b.offset);

  // Build rough block structure
  if (allMarkers.length >= 2) {
    // File header block
    flashBlocks.push({
      startOffset: 0,
      endOffset: Math.min(allMarkers.length > 1 ? allMarkers[1].offset : data.length, data.length),
      startHex: toHex(0),
      endHex: toHex(Math.min(allMarkers.length > 1 ? allMarkers[1].offset : data.length, data.length)),
      size: Math.min(allMarkers.length > 1 ? allMarkers[1].offset : data.length, data.length),
      description: 'Calibration Data Tables',
    });
  }

  // Add the full file as a block for reference
  flashBlocks.push({
    startOffset: 0,
    endOffset: data.length,
    startHex: toHex(0),
    endHex: toHex(data.length),
    size: data.length,
    description: `Full Binary (${(data.length / 1024).toFixed(1)} KB)`,
  });

  // ── 10. Add hex regions for key areas ──────────────────────────────────
  // File header
  hexRegions.push({
    label: 'File Header',
    offset: 0,
    offsetHex: toHex(0),
    bytes: data.slice(0, 128),
  });

  // File tail
  const tailStart = Math.max(0, data.length - 128);
  hexRegions.push({
    label: 'File Tail',
    offset: tailStart,
    offsetHex: toHex(tailStart),
    bytes: data.slice(tailStart),
  });

  // Module name table region (if found)
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
    findings,
    calibrationId,
    partNumbers,
    moduleNames,
    flashBlocks,
    vinFound,
    ecuPlatform,
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
  '12680381': {
    number: '12680381',
    description: 'Engine Control Module (ECM)',
    application: '2015-2016 GM 6.6L Duramax LML',
    notes: 'E41 platform ECM, commonly used with Allison 1000 transmission',
  },
  '12677687': {
    number: '12677687',
    description: 'Engine Control Module (ECM)',
    application: '2011-2014 GM 6.6L Duramax LML',
    notes: 'E41 platform ECM',
  },
  '12654075': {
    number: '12654075',
    description: 'Engine Control Module (ECM)',
    application: '2011-2012 GM 6.6L Duramax LML',
    notes: 'Earlier E41 platform revision',
  },
  '12680382': {
    number: '12680382',
    description: 'Engine Control Module (ECM)',
    application: '2015-2016 GM 6.6L Duramax LML (alternate)',
    notes: 'E41 platform ECM variant',
  },
  '12680383': {
    number: '12680383',
    description: 'Engine Control Module (ECM)',
    application: '2015-2016 GM 6.6L Duramax LML (alternate)',
    notes: 'E41 platform ECM variant',
  },
};

export function lookupPartNumber(partNum: string): PartNumberInfo | null {
  return KNOWN_GM_PARTS[partNum] || null;
}
