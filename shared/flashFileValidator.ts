/**
 * Flash File Validator — Container integrity checks, CRC32, format detection,
 * and pre-flight diagnostic checklist for ECU flashing.
 * 
 * CRC32 at offset 0x1000 is stored BIG-ENDIAN (confirmed by Arno + DevProg Array.Reverse).
 */

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export type DetectedFormat =
  | 'PPEI_CONTAINER'     // PPEI .bin with JSON header at 0x1004
  | 'DEVPROG_V2'         // DevProg V2 MAUI container
  | 'RAW_BINARY'         // Raw binary (no container)
  | 'INTEL_HEX'          // Intel HEX format
  | 'S_RECORD'           // Motorola S-Record
  | 'UNKNOWN';

export interface FormatDetectionResult {
  format: DetectedFormat;
  confidence: number;
  details: string;
  hasCrc: boolean;
  headerOffset?: number;
}

export function detectFileFormat(data: Uint8Array): FormatDetectionResult {
  if (data.length < 0x1010) {
    // Too small for container format — check for text formats
    const text = new TextDecoder('ascii', { fatal: false }).decode(data.slice(0, 20));
    if (text.startsWith(':')) return { format: 'INTEL_HEX', confidence: 0.9, details: 'Intel HEX header detected', hasCrc: false };
    if (text.startsWith('S0') || text.startsWith('S1')) return { format: 'S_RECORD', confidence: 0.9, details: 'S-Record header detected', hasCrc: false };
    return { format: 'RAW_BINARY', confidence: 0.5, details: 'File too small for container format', hasCrc: false };
  }

  // Check for JSON header at 0x1004 (PPEI/DevProg container)
  try {
    const headerSlice = data.slice(0x1004, 0x3000);
    const nullIdx = headerSlice.indexOf(0);
    const headerStr = new TextDecoder('ascii', { fatal: false }).decode(
      nullIdx > 0 ? headerSlice.slice(0, nullIdx) : headerSlice
    );
    if (headerStr.trim().startsWith('{')) {
      const parsed = JSON.parse(headerStr);
      if (parsed.flashernumber !== undefined || parsed.ecu_type) {
        return {
          format: 'PPEI_CONTAINER',
          confidence: 0.95,
          details: `PPEI container — ECU: ${parsed.ecu_type || 'unknown'}, blocks: ${parsed.block_count || 0}`,
          hasCrc: true,
          headerOffset: 0x1004,
        };
      }
      return {
        format: 'DEVPROG_V2',
        confidence: 0.85,
        details: 'DevProg V2 container with JSON header',
        hasCrc: true,
        headerOffset: 0x1004,
      };
    }
  } catch {
    // Not a JSON header
  }

  // Check for padding pattern (0xFF or 0x00 in first 0x1000 bytes)
  const firstKb = data.slice(0, 0x100);
  const allFF = firstKb.every(b => b === 0xFF);
  const allZero = firstKb.every(b => b === 0x00);
  if (allFF || allZero) {
    return { format: 'RAW_BINARY', confidence: 0.6, details: 'Padded binary — possible raw flash image', hasCrc: false };
  }

  return { format: 'UNKNOWN', confidence: 0.3, details: 'Unrecognized file format', hasCrc: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationSeverity = 'error' | 'warning' | 'info' | 'pass';

export interface ValidationCheck {
  id: string;
  label: string;
  severity: ValidationSeverity;
  message: string;
  details?: string;
}

export interface FileValidationResult {
  valid: boolean;
  format: DetectedFormat;
  checks: ValidationCheck[];
  crcStored?: number;
  crcComputed?: number;
  crcMatch?: boolean;
  fileSize: number;
  headerSize: number;
  dataSize: number;
}

export function validateFlashFile(data: Uint8Array): FileValidationResult {
  const checks: ValidationCheck[] = [];
  const format = detectFileFormat(data);

  // Size check
  if (data.length < 0x3000) {
    checks.push({
      id: 'size', label: 'File Size', severity: 'error',
      message: `File too small (${data.length} bytes) — minimum 12,288 bytes for container format`,
    });
    return { valid: false, format: format.format, checks, fileSize: data.length, headerSize: 0, dataSize: 0 };
  }
  checks.push({
    id: 'size', label: 'File Size', severity: 'pass',
    message: `${(data.length / 1024).toFixed(1)} KB — valid container size`,
  });

  // CRC32 check (big-endian at 0x1000)
  const storedCrc = readUint32BE(data, 0x1000);
  const computedCrc = crc32(data.slice(0x1004));
  const crcMatch = storedCrc === computedCrc;
  checks.push({
    id: 'crc', label: 'CRC32 Integrity', severity: crcMatch ? 'pass' : 'error',
    message: crcMatch
      ? `CRC32 verified: 0x${storedCrc.toString(16).toUpperCase().padStart(8, '0')}`
      : `CRC32 mismatch — stored: 0x${storedCrc.toString(16).toUpperCase().padStart(8, '0')}, computed: 0x${computedCrc.toString(16).toUpperCase().padStart(8, '0')}`,
    details: 'CRC32 is stored big-endian at offset 0x1000, covers 0x1004 to EOF',
  });

  // Header parse check
  let headerParsed = false;
  try {
    const headerSlice = data.slice(0x1004, 0x3000);
    const nullIdx = headerSlice.indexOf(0);
    const headerStr = new TextDecoder('ascii', { fatal: false }).decode(
      nullIdx > 0 ? headerSlice.slice(0, nullIdx) : headerSlice
    );
    JSON.parse(headerStr);
    headerParsed = true;
    checks.push({
      id: 'header', label: 'JSON Header', severity: 'pass',
      message: 'Header parsed successfully',
    });
  } catch {
    checks.push({
      id: 'header', label: 'JSON Header', severity: 'error',
      message: 'Failed to parse JSON header at offset 0x1004',
    });
  }

  // Padding check
  const padding = data.slice(0, 0x1000);
  const paddingClean = padding.every(b => b === 0x00 || b === 0xFF);
  checks.push({
    id: 'padding', label: 'Padding Region', severity: paddingClean ? 'pass' : 'warning',
    message: paddingClean
      ? 'Padding region (0x0000-0x0FFF) is clean'
      : 'Padding region contains unexpected data — may indicate corruption',
  });

  // Data region check
  const dataSize = data.length - 0x3000;
  if (dataSize > 0) {
    checks.push({
      id: 'data', label: 'Data Region', severity: 'pass',
      message: `${(dataSize / 1024).toFixed(1)} KB of block data starting at 0x3000`,
    });
  } else {
    checks.push({
      id: 'data', label: 'Data Region', severity: 'warning',
      message: 'No block data found after header',
    });
  }

  const valid = checks.every(c => c.severity !== 'error');
  return {
    valid,
    format: format.format,
    checks,
    crcStored: storedCrc,
    crcComputed: computedCrc,
    crcMatch,
    fileSize: data.length,
    headerSize: 0x1FFC,
    dataSize: Math.max(0, data.length - 0x3000),
  };
}

/** DevProg/PPEI container CRC32 at 0x1000 (big-endian), payload from 0x1004..EOF — see `fixContainerCrc`. */
export interface ContainerCrc32Status {
  applicable: boolean;
  /** null when not applicable */
  match: boolean | null;
  storedHex?: string;
  computedHex?: string;
  message: string;
}

/**
 * Lightweight CRC check for importers (Tune Deploy, etc.) without running the full `validateFlashFile` gate.
 */
export function getContainerCrc32Status(data: Uint8Array): ContainerCrc32Status {
  const det = detectFileFormat(data);
  if (data.length < 0x1008) {
    return {
      applicable: false,
      match: null,
      message: "File too small for container CRC32 field at offset 0x1000",
    };
  }
  if (!det.hasCrc) {
    return {
      applicable: false,
      match: null,
      message: `No container CRC slot — ${det.details}`,
    };
  }
  const storedCrc = readUint32BE(data, 0x1000);
  const computedCrc = crc32(data.slice(0x1004));
  const match = storedCrc === computedCrc;
  const hx = (n: number) => `0x${n.toString(16).toUpperCase().padStart(8, "0")}`;
  return {
    applicable: true,
    match,
    storedHex: hx(storedCrc),
    computedHex: hx(computedCrc),
    message: match
      ? `CRC32 verified ${hx(storedCrc)}`
      : `CRC32 mismatch — stored ${hx(storedCrc)}, computed ${hx(computedCrc)}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CRC32 (Standard IEEE 802.3)
// ═══════════════════════════════════════════════════════════════════════════

export function computeSimpleHash(data: Uint8Array): string {
  let hash = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function readUint32BE(data: Uint8Array, offset: number): number {
  // Big-endian: high byte first (confirmed by Arno + DevProg Array.Reverse)
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function writeUint32BE(data: Uint8Array, offset: number, value: number): void {
  // Big-endian: high byte first
  data[offset] = (value >> 24) & 0xFF;
  data[offset + 1] = (value >> 16) & 0xFF;
  data[offset + 2] = (value >> 8) & 0xFF;
  data[offset + 3] = value & 0xFF;
}

/**
 * Recompute and update the CRC32 in a container file.
 * Returns a new Uint8Array with the corrected CRC.
 */
export function fixContainerCrc(data: Uint8Array): Uint8Array {
  const fixed = new Uint8Array(data);
  const computedCrc = crc32(fixed.slice(0x1004));
  writeUint32BE(fixed, 0x1000, computedCrc);
  return fixed;
}

/**
 * CRC32 big-endian at 0x1000 over payload 0x1004..EOF — shared by DevProg and (typical) PPEI layouts.
 * Unlike `getContainerCrc32Status`, this does not consult `detectFileFormat`; use for strict upload checks.
 */
export function verifyStandardContainerSlotCrc32(data: Uint8Array): {
  ok: boolean;
  match: boolean;
  storedHex: string;
  computedHex: string;
  message: string;
} {
  if (data.length < 0x1008) {
    return {
      ok: false,
      match: false,
      storedHex: "",
      computedHex: "",
      message: "File too small for standard container CRC field at 0x1000 (need ≥ 0x1008 bytes).",
    };
  }
  const storedCrc = readUint32BE(data, 0x1000);
  const computedCrc = crc32(data.slice(0x1004));
  const match = storedCrc === computedCrc;
  const hx = (n: number) => `0x${n.toString(16).toUpperCase().padStart(8, "0")}`;
  return {
    ok: true,
    match,
    storedHex: hx(storedCrc),
    computedHex: hx(computedCrc),
    message: match
      ? `CRC32 verified ${hx(storedCrc)}`
      : `CRC32 mismatch — stored ${hx(storedCrc)}, computed ${hx(computedCrc)}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRE-FLIGHT DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

export type DiagnosticStatus = 'pass' | 'warning' | 'fail' | 'pending' | 'skipped';

export interface DiagnosticCheck {
  id: string;
  label: string;
  category: 'file' | 'ecu' | 'hardware' | 'safety';
  status: DiagnosticStatus;
  message: string;
  required: boolean;
}

export interface PreFlightDiagnostics {
  ecuType: string;
  checks: DiagnosticCheck[];
  allPassed: boolean;
  requiredPassed: boolean;
  timestamp: number;
}

export function createPreFlightChecklist(ecuType: string): PreFlightDiagnostics {
  const checks: DiagnosticCheck[] = [
    // File checks
    { id: 'file_format', label: 'Container Format', category: 'file', status: 'pending', message: 'Checking...', required: true },
    { id: 'file_crc', label: 'CRC32 Integrity', category: 'file', status: 'pending', message: 'Checking...', required: true },
    { id: 'file_header', label: 'Header Parsing', category: 'file', status: 'pending', message: 'Checking...', required: true },
    { id: 'file_blocks', label: 'Block Structure', category: 'file', status: 'pending', message: 'Checking...', required: true },
    { id: 'file_duplicate', label: 'Duplicate Check', category: 'file', status: 'pending', message: 'Checking...', required: false },
    // ECU checks
    { id: 'ecu_known', label: 'ECU Type Recognized', category: 'ecu', status: 'pending', message: 'Checking...', required: true },
    { id: 'ecu_sequence', label: 'Flash Sequence Valid', category: 'ecu', status: 'pending', message: 'Checking...', required: true },
    { id: 'ecu_security', label: 'Security Profile', category: 'ecu', status: 'pending', message: 'Checking...', required: true },
    // Hardware checks (simulator mode skips these)
    { id: 'hw_connection', label: 'PCAN Connection', category: 'hardware', status: 'pending', message: 'Checking...', required: false },
    { id: 'hw_voltage', label: 'Battery Voltage', category: 'hardware', status: 'pending', message: 'Checking...', required: false },
    // Safety checks
    { id: 'safety_backup', label: 'Backup Available', category: 'safety', status: 'pending', message: 'Checking...', required: false },
    { id: 'safety_expiry', label: 'File Not Expired', category: 'safety', status: 'pending', message: 'Checking...', required: true },
  ];

  return {
    ecuType,
    checks,
    allPassed: false,
    requiredPassed: false,
    timestamp: Date.now(),
  };
}

export function updateDiagnosticCheck(
  diagnostics: PreFlightDiagnostics,
  checkId: string,
  status: DiagnosticStatus,
  message: string,
): PreFlightDiagnostics {
  const checks = diagnostics.checks.map(c =>
    c.id === checkId ? { ...c, status, message } : c
  );
  const requiredPassed = checks
    .filter(c => c.required)
    .every(c => c.status === 'pass' || c.status === 'warning');
  const allPassed = checks.every(c => c.status === 'pass' || c.status === 'warning' || c.status === 'skipped');

  return { ...diagnostics, checks, allPassed, requiredPassed };
}

export function evaluateBatteryVoltage(voltage: number): { status: DiagnosticStatus; message: string } {
  if (voltage >= 12.4) return { status: 'pass', message: `${voltage.toFixed(1)}V — Good` };
  if (voltage >= 11.8) return { status: 'warning', message: `${voltage.toFixed(1)}V — Low, use battery charger` };
  return { status: 'fail', message: `${voltage.toFixed(1)}V — Too low for flashing` };
}
