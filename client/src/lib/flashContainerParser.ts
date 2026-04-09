/**
 * Flash Container Parser — Parses PPEI binary container format
 * AND DevProg V2 container format for ECU flash preparation,
 * validation, and readiness checking.
 * 
 * Supports: All ECU types from shared/ecuDatabase (50+ platforms)
 * Extracts: header metadata, part numbers, flash tags, data blocks,
 *           ECU type detection, flash type (calibration vs full flash),
 *           DevProg JSON header, block structures, LZSS compression info
 */

import {
  ECU_DATABASE, getEcuConfig, FLASH_STEP_DESCRIPTIONS,
  CONTAINER_LAYOUT,
  type EcuConfig, type ContainerBlockStruct,
} from '../../../shared/ecuDatabase';
import { tryParseDevProgContainerRecord } from '../../../shared/devProgContainerJson';
import { normalizeDevProgContainerBlock } from '../../../shared/containerBlockJson';
import { getSecurityProfileMeta, ecuSupportsServerKeyDerivation } from '../../../shared/seedKeyMeta';

// ── Types ──────────────────────────────────────────────────────────────────

export type FlashType = 'calibration' | 'fullflash' | 'unknown';
export type EcuFamily = string;

export interface PpeiContainerHeader {
  magic: string;
  structType: string;
  creator: string;
  dataStartOffset: number;
  dataBlockSize: number;
  version: string;
  vendor: string;
  buildNumber: string;
  sourceFilePath: string;
  description: string;
  ecuType: string;
  vehicleType: string;
  partNumbers: string[];
  flashTags: string[];
  isFullFlash: boolean;
  isRescue: boolean;
  isGmCrypt: boolean;
}

export interface DevProgContainerHeader {
  flashernumber: number;
  udid: string;
  vin: string;
  seed: string;
  key: string;
  fileId: string;
  createDate: number;
  expireDate: number;
  maxFlashCount: number;
  blockCount: number;
  blockBoot: number;
  blockErase: number;
  fileSize: number;
  compEnc: number;
  lzss: boolean;
  xferSize: number;
  forceOS: boolean;
  ecuType: string;
  hardwareNumber: string;
  softwareNumbers: string[];
  blocks: ContainerBlockStruct[];
  verify?: {
    controllerType?: string;
    canSpeed?: string;
    txAddr?: string;
    rxAddr?: string;
    pri_key?: string[];
    pri_request?: string[];
    request?: string[];
    key?: string[];
    txprefix?: string[];
    rxprefix?: string[];
  };
}

export interface FlashReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn' | 'info';
  detail: string;
}

export interface FlashContainerAnalysis {
  valid: boolean;
  containerFormat: 'PPEI' | 'DEVPROG' | 'UNKNOWN';
  header: PpeiContainerHeader | null;
  devProgHeader: DevProgContainerHeader | null;
  ecuFamily: EcuFamily;
  ecuConfig: EcuConfig | null;
  flashType: FlashType;
  dataOffset: number;
  dataSize: number;
  totalSize: number;
  readinessChecks: FlashReadinessCheck[];
  securityInfo: {
    seedKeyAlgorithm: string;
    requiresUnlockBox: boolean;
    protocol: 'GMLAN' | 'UDS' | 'UNKNOWN';
    seedLevel: number;
    canTxAddr: number;
    canRxAddr: number;
  };
  flashSequence: string[];
  errors: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function readAsciiField(data: Uint8Array, offset: number, length: number): string {
  const bytes = data.slice(offset, offset + length);
  let end = bytes.indexOf(0);
  if (end === -1) end = length;
  const str = new TextDecoder('ascii').decode(bytes.slice(0, end));
  return str.replace(/[\x00-\x1F]/g, '').trim();
}

function parseHexAscii(str: string): number {
  const cleaned = str.replace(/[^0-9a-fA-F]/g, '');
  return parseInt(cleaned, 16) || 0;
}

function detectEcuFamily(ecuTypeField: string, sourceFilePath: string, vehicleType: string): string {
  const fields = [ecuTypeField, sourceFilePath, vehicleType].join(' ').toUpperCase();
  const allTypes = Object.keys(ECU_DATABASE).sort((a, b) => b.length - a.length);
  for (const type of allTypes) {
    if (fields.includes(type.toUpperCase())) return type;
  }
  if (fields.includes('L5P') || fields.includes('DURAMAX') || fields.includes('MG1CS111')) return 'E41';
  if (fields.includes('ALLISON')) {
    if (fields.includes('T87A')) return 'T87A';
    if (fields.includes('T87')) return 'T87';
    if (fields.includes('T76')) return 'T76';
  }
  if (fields.includes('CUMMINS') || fields.includes('CM2350')) return 'CM2350B';
  if (fields.includes('10R80')) return 'TCU10R80';
  if (fields.includes('6R140')) return 'TCU6R140';
  if (fields.includes('CAN-AM') || fields.includes('CANAM')) return 'MG1CA920';
  if (fields.includes('POLARIS')) return 'MG1CA007';
  return 'UNKNOWN';
}

function buildFlashSequenceStrings(config: EcuConfig, isFullFlash: boolean): string[] {
  const steps: string[] = [];
  if (config.patchNecessary && isFullFlash) {
    steps.push('── PATCH SEQUENCE (OS Update) ──');
    for (const step of config.patchSequence) {
      steps.push(`${step} — ${FLASH_STEP_DESCRIPTIONS[step] ?? 'Unknown step'}`);
    }
    steps.push('── MAIN FLASH SEQUENCE ──');
  }
  for (const step of config.flashSequence) {
    steps.push(`${step} — ${FLASH_STEP_DESCRIPTIONS[step] ?? 'Unknown step'}`);
  }
  return steps;
}

function isDevProgContainer(data: Uint8Array): boolean {
  if (data.length < CONTAINER_LAYOUT.HEADER_OFFSET + 100) return false;
  const headerStart = CONTAINER_LAYOUT.HEADER_OFFSET;
  for (let i = headerStart; i < headerStart + 16; i++) {
    if (data[i] === 0x7B) return true;
    if (data[i] !== 0x00 && data[i] !== 0x20) break;
  }
  return false;
}

function strField(r: Record<string, unknown>, key: string, fallback = ''): string {
  const v = r[key];
  if (v == null) return fallback;
  return String(v).trim();
}

/** DevProg JSON at 0x1004 — length from `header_length` at 0x1000 (see shared/devProgContainerJson). */
function parseDevProgContainer(data: Uint8Array): DevProgContainerHeader | null {
  const record = tryParseDevProgContainerRecord(data);
  if (!record || typeof record !== 'object') return null;

  const json = record as Record<string, unknown>;
  const rawBlocks = json.block_struct;
  if (!Array.isArray(rawBlocks)) return null;

  const blocks: ContainerBlockStruct[] = rawBlocks.map((b) => normalizeDevProgContainerBlock(b));

  const softwareNumbers: string[] = [];
  for (let i = 1; i <= 9; i++) {
    const sw = strField(json, `sw_c${i}`);
    if (sw) softwareNumbers.push(sw);
  }

  const hexOrSize = (key: string): number => {
    const v = json[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    return parseHexAscii(strField(json, key, '0'));
  };

  const verifyRaw = json.verify;
  const verify =
    verifyRaw && typeof verifyRaw === 'object'
      ? (() => {
          const v = verifyRaw as Record<string, unknown>;
          const arr = (x: unknown): string[] | undefined =>
            Array.isArray(x) ? x.map(String) : undefined;
          return {
            controllerType: strField(v, 'controller_type') || strField(v, 'Controller_type'),
            canSpeed: strField(v, 'canspeed') || strField(v, 'Canspeed'),
            txAddr: strField(v, 'txadr') || strField(v, 'Txadr'),
            rxAddr: strField(v, 'rxadr') || strField(v, 'Rxadr'),
            pri_key: arr(v.pri_key) ?? arr(v.Pri_key),
            pri_request: arr(v.pri_request),
            request: arr(v.request),
            key: arr(v.key),
            txprefix: arr(v.txprefix) as string[] | undefined,
            rxprefix: arr(v.rxprefix) as string[] | undefined,
          };
        })()
      : undefined;

  return {
    flashernumber: Number(json.flashernumber) || 0,
    udid: strField(json, 'udid'),
    vin: strField(json, 'vin'),
    seed: strField(json, 'seed'),
    key: strField(json, 'key'),
    fileId: strField(json, 'file_id'),
    createDate: Number(json.create_date) || 0,
    expireDate: Number(json.expire_date) || 0,
    maxFlashCount: Number(json.max_flash_count) || 0,
    blockCount: Number(json.block_count) || blocks.length,
    blockBoot: Number(json.block_boot) || 0,
    blockErase: Number(json.block_erase) || 0,
    fileSize: hexOrSize('file_size') || data.length,
    compEnc: hexOrSize('comp_enc'),
    lzss: String(json.lzss ?? '').toLowerCase() === 'true',
    xferSize: hexOrSize('xferSize'),
    forceOS: String(json.ForceOS ?? '').toLowerCase() === 'true',
    ecuType: strField(json, 'ecu_type'),
    hardwareNumber: strField(json, 'hardware_number'),
    softwareNumbers,
    blocks,
    verify,
  };
}

// ── Main Parser ────────────────────────────────────────────────────────────

export function parsePpeiContainer(data: ArrayBuffer): FlashContainerAnalysis {
  const bytes = new Uint8Array(data);
  const errors: string[] = [];
  const checks: FlashReadinessCheck[] = [];

  if (bytes.length < 0x700) {
    return {
      valid: false, containerFormat: 'UNKNOWN',
      header: null, devProgHeader: null, ecuFamily: 'UNKNOWN', ecuConfig: null,
      flashType: 'unknown', dataOffset: 0, dataSize: 0,
      totalSize: bytes.length, readinessChecks: [],
      securityInfo: {
        seedKeyAlgorithm: 'UNKNOWN', requiresUnlockBox: false,
        protocol: 'UNKNOWN', seedLevel: 0, canTxAddr: 0, canRxAddr: 0,
      },
      flashSequence: [], errors: ['File too small to be a valid container (< 1792 bytes)'],
    };
  }

  let devProgHeader: DevProgContainerHeader | null = null;
  let containerFormat: 'PPEI' | 'DEVPROG' | 'UNKNOWN' = 'UNKNOWN';

  if (isDevProgContainer(bytes)) {
    devProgHeader = parseDevProgContainer(bytes);
    if (devProgHeader) containerFormat = 'DEVPROG';
  }

  const magic = readAsciiField(bytes, 0x000, 16);
  const structType = readAsciiField(bytes, 0x00E, 18);
  const creator = readAsciiField(bytes, 0x020, 16);
  const dataStartStr = readAsciiField(bytes, 0x090, 16);
  const dataBlockSizeStr = readAsciiField(bytes, 0x0A0, 16);
  const version = readAsciiField(bytes, 0x0B0, 16);
  const vendor = readAsciiField(bytes, 0x0C0, 16);
  const buildNumber = readAsciiField(bytes, 0x0D0, 16);
  const sourceFilePath = readAsciiField(bytes, 0x100, 512);
  const description = readAsciiField(bytes, 0x300, 256);
  const ecuTypeField = readAsciiField(bytes, 0x440, 32);
  const vehicleType = readAsciiField(bytes, 0x460, 32);

  const partNumbers: string[] = [];
  for (let i = 0; i < 6; i++) {
    const pn = readAsciiField(bytes, 0x480 + i * 0x20, 32);
    if (pn && /^\d{7,8}$/.test(pn)) partNumbers.push(pn);
  }

  const flashTagStr = readAsciiField(bytes, 0x600, 64);
  const flashTags = flashTagStr.split('#').filter(t => t.length > 0);
  const dataStartOffset = parseHexAscii(dataStartStr);
  const dataBlockSize = parseHexAscii(dataBlockSizeStr);

  if (magic.includes('IPF') && containerFormat === 'UNKNOWN') {
    containerFormat = 'PPEI';
  }

  const isFullFlash = flashTags.includes('fullflash')
    || description.toLowerCase().includes('full-flash')
    || description.toLowerCase().includes('full flash')
    || (devProgHeader?.forceOS === true);
  const isRescue = flashTags.includes('rescue');
  const isGmCrypt = description.toLowerCase().includes('gmcrypt') || flashTags.includes('gmcrypt');

  const header: PpeiContainerHeader = {
    magic, structType, creator, dataStartOffset, dataBlockSize,
    version, vendor, buildNumber, sourceFilePath, description,
    ecuType: ecuTypeField, vehicleType, partNumbers, flashTags,
    isFullFlash, isRescue, isGmCrypt,
  };

  let ecuFamily: string;
  if (devProgHeader?.ecuType) {
    ecuFamily = devProgHeader.ecuType.toUpperCase();
    if (!getEcuConfig(ecuFamily)) {
      ecuFamily = detectEcuFamily(devProgHeader.ecuType, sourceFilePath, vehicleType);
    }
  } else {
    ecuFamily = detectEcuFamily(ecuTypeField, sourceFilePath, vehicleType);
  }

  const ecuConfig = getEcuConfig(ecuFamily) ?? null;
  const secMeta = getSecurityProfileMeta(ecuFamily);
  const flashType: FlashType = isFullFlash ? 'fullflash' : 'calibration';

  // ── Readiness Checks ──────────────────────────────────────────────────

  checks.push({
    id: 'container_format', label: 'Container Format',
    status: containerFormat !== 'UNKNOWN' ? 'pass' : 'fail',
    detail: containerFormat === 'PPEI'
      ? `Valid PPEI container header detected: ${magic}`
      : containerFormat === 'DEVPROG'
        ? `DevProg V2 container — JSON header parsed, ${devProgHeader?.blockCount ?? 0} blocks`
        : `Unrecognized container format (magic: ${magic})`,
  });

  checks.push({
    id: 'vendor', label: 'Vendor Signature',
    status: (vendor === 'PPEI' || containerFormat === 'DEVPROG') ? 'pass' : 'warn',
    detail: vendor === 'PPEI' ? 'PPEI vendor confirmed'
      : containerFormat === 'DEVPROG' ? 'DevProg V2 container (EDS/PPEI compatible)'
        : `Vendor: ${vendor || 'UNKNOWN'}`,
  });

  checks.push({
    id: 'ecu_type', label: 'ECU Platform',
    status: ecuConfig ? 'pass' : (ecuFamily !== 'UNKNOWN' ? 'warn' : 'fail'),
    detail: ecuConfig
      ? `${ecuConfig.name} — ${ecuConfig.protocol} protocol, ${ecuConfig.oem} OEM`
      : ecuFamily !== 'UNKNOWN'
        ? `ECU type "${ecuFamily}" detected but not in configuration database`
        : `Could not identify ECU platform from: type=${ecuTypeField}, vehicle=${vehicleType}`,
  });

  if (containerFormat === 'DEVPROG' && devProgHeader) {
    const expectedSize = devProgHeader.fileSize;
    const sizeDiff = Math.abs(bytes.length - expectedSize);
    checks.push({
      id: 'data_integrity', label: 'Data Block Integrity',
      status: sizeDiff < 256 ? 'pass' : 'warn',
      detail: sizeDiff < 256
        ? `Container size matches header: ${(bytes.length / 1024 / 1024).toFixed(2)} MB, ${devProgHeader.blockCount} blocks`
        : `Size mismatch: header says ${expectedSize.toLocaleString()} bytes, file is ${bytes.length.toLocaleString()} bytes`,
    });
  } else {
    const expectedEnd = dataStartOffset + dataBlockSize;
    const sizeMatch = Math.abs(bytes.length - expectedEnd) < 256;
    checks.push({
      id: 'data_integrity', label: 'Data Block Integrity',
      status: sizeMatch ? 'pass' : 'warn',
      detail: sizeMatch
        ? `Data block: ${(dataBlockSize / 1024 / 1024).toFixed(2)} MB at offset 0x${dataStartOffset.toString(16).toUpperCase()}`
        : `Size mismatch: expected ${expectedEnd.toLocaleString()} bytes, got ${bytes.length.toLocaleString()} bytes`,
    });
  }

  checks.push({
    id: 'part_numbers', label: 'Part Numbers',
    status: partNumbers.length >= 3 ? 'pass' : (devProgHeader?.hardwareNumber ? 'pass' : 'warn'),
    detail: devProgHeader?.hardwareNumber
      ? `HW: ${devProgHeader.hardwareNumber}, SW: ${devProgHeader.softwareNumbers.join(', ')}`
      : partNumbers.length > 0
        ? `${partNumbers.length} part numbers found: ${partNumbers.join(', ')}`
        : 'No part numbers detected in container header',
  });

  checks.push({
    id: 'flash_type', label: 'Flash Type', status: 'info',
    detail: isFullFlash
      ? 'FULL FLASH — Operating System + Calibration data (all blocks)'
      : 'CALIBRATION ONLY — Data blocks only (OS blocks skipped)',
  });

  if (ecuConfig) {
    const needsUnlockBox = secMeta?.requiresUnlockBox ?? false;
    checks.push({
      id: 'security', label: 'Security Requirements',
      status: needsUnlockBox ? 'warn' : 'pass',
      detail: needsUnlockBox
        ? `${ecuFamily} requires hardware unlock box (CMAC-based authentication)`
        : `${ecuFamily} uses ${secMeta?.algorithmType ?? 'standard'} seed/key (level 0x${ecuConfig.seedLevel.toString(16).padStart(2, '0')})`,
    });

    // Check if AES key is available from Seed_key.cs hardcoded profiles
    const hasHardcodedKey = ecuSupportsServerKeyDerivation(secMeta);
    checks.push({
      id: 'seed_key', label: 'Security Key (Seed_key.cs)',
      status: hasHardcodedKey ? 'pass' : needsUnlockBox ? 'info' : 'warn',
      detail: hasHardcodedKey
        ? `✅ AES key available (Seed_key.cs — ${ecuFamily}) — seed/key computation ready`
        : needsUnlockBox
          ? 'Hardware unlock box handles security'
          : `No Seed_key.cs entry for ${ecuFamily} — will use dummy key (only works on unlocked ECUs)`,
    });

    checks.push({
      id: 'protocol', label: 'Communication Protocol', status: 'info',
      detail: ecuConfig.protocol === 'UDS'
        ? `UDS (Unified Diagnostic Services) — ISO 14229, CAN ${ecuConfig.canSpeed}kbps`
        : ecuConfig.protocol === 'GMLAN'
          ? `GMLAN (GM Local Area Network) — CAN ${ecuConfig.canSpeed}kbps`
          : `${ecuConfig.protocol} — CAN ${ecuConfig.canSpeed}kbps`,
    });

    checks.push({
      id: 'can_addressing', label: 'CAN Bus Addressing', status: 'info',
      detail: `TX: 0x${ecuConfig.txAddr.toString(16).toUpperCase()}, RX: 0x${ecuConfig.rxAddr.toString(16).toUpperCase()}, Transfer: ${ecuConfig.xferSize ? `0x${ecuConfig.xferSize.toString(16).toUpperCase()} (${ecuConfig.xferSize} bytes/block)` : 'Default'}`,
    });
  }

  if (devProgHeader) {
    checks.push({
      id: 'vin', label: 'VIN Binding',
      status: devProgHeader.vin && devProgHeader.vin.length >= 17 ? 'pass' : 'warn',
      detail: devProgHeader.vin
        ? `Container bound to VIN: ${devProgHeader.vin}`
        : 'No VIN binding — container may be used on any vehicle',
    });

    if (devProgHeader.expireDate > 0) {
      const now = Date.now() / 1000;
      const expired = now > devProgHeader.expireDate;
      checks.push({
        id: 'expiration', label: 'Container Expiration',
        status: expired ? 'fail' : 'pass',
        detail: expired
          ? `Container EXPIRED on ${new Date(devProgHeader.expireDate * 1000).toLocaleDateString()}`
          : `Valid until ${new Date(devProgHeader.expireDate * 1000).toLocaleDateString()}`,
      });
    }

    if (devProgHeader.maxFlashCount > 0) {
      checks.push({
        id: 'flash_count', label: 'Flash Count Limit', status: 'info',
        detail: `Maximum ${devProgHeader.maxFlashCount} flash attempts allowed`,
      });
    }

    checks.push({
      id: 'compression', label: 'Data Compression', status: 'info',
      detail: devProgHeader.lzss
        ? 'LZSS compressed — blocks will be decompressed during transfer'
        : 'Uncompressed — raw block data',
    });

    const osBlocks = devProgHeader.blocks.filter(
      b => b.OS === 'true' || b.OS === 'patch' || b.OS === 'forcepatch'
    );
    const calBlocks = devProgHeader.blocks.filter(b => !b.OS || b.OS === 'false');
    checks.push({
      id: 'block_structure', label: 'Block Structure', status: 'pass',
      detail: `${devProgHeader.blockCount} total blocks: ${osBlocks.length} OS, ${calBlocks.length} calibration, boot=${devProgHeader.blockBoot}, erase=${devProgHeader.blockErase}`,
    });
  }

  checks.push({
    id: 'creator', label: 'Creator Verification',
    status: creator ? 'pass' : (devProgHeader ? 'pass' : 'warn'),
    detail: creator
      ? `Container created by: ${creator}`
      : devProgHeader
        ? `DevProg flasher #${devProgHeader.flashernumber}, UDID: ${devProgHeader.udid}`
        : 'No creator information in header',
  });

  const securityInfo = {
    seedKeyAlgorithm: secMeta
      ? `${secMeta.algorithmType} (${secMeta.description})`
      : ecuConfig
        ? `Standard ${ecuConfig.protocol} security (seed level 0x${ecuConfig.seedLevel.toString(16).padStart(2, '0')})`
        : 'UNKNOWN',
    requiresUnlockBox: secMeta?.requiresUnlockBox ?? false,
    protocol: (ecuConfig?.protocol ?? 'UNKNOWN') as 'GMLAN' | 'UDS' | 'UNKNOWN',
    seedLevel: ecuConfig?.seedLevel ?? 0,
    canTxAddr: ecuConfig?.txAddr ?? 0,
    canRxAddr: ecuConfig?.rxAddr ?? 0,
  };

  const flashSequence = ecuConfig
    ? buildFlashSequenceStrings(ecuConfig, isFullFlash)
    : [];

  return {
    valid: checks.filter(c => c.status === 'fail').length === 0,
    containerFormat,
    header,
    devProgHeader,
    ecuFamily,
    ecuConfig,
    flashType,
    dataOffset: devProgHeader ? CONTAINER_LAYOUT.DATA_OFFSET : dataStartOffset,
    dataSize: devProgHeader ? (bytes.length - CONTAINER_LAYOUT.DATA_OFFSET) : dataBlockSize,
    totalSize: bytes.length,
    readinessChecks: checks,
    securityInfo,
    flashSequence,
    errors,
  };
}

export function isPpeiContainer(data: ArrayBuffer): boolean {
  if (data.byteLength < 256) return false;
  const bytes = new Uint8Array(data);
  const magic = readAsciiField(bytes, 0, 16);
  if (magic.includes('IPF')) return true;
  if (data.byteLength > CONTAINER_LAYOUT.HEADER_OFFSET + 100) {
    if (isDevProgContainer(bytes)) return true;
  }
  return false;
}

export function getContainerSummary(analysis: FlashContainerAnalysis): string {
  if (!analysis.valid) return 'Invalid or unrecognized container';
  const lines: string[] = [];
  if (analysis.devProgHeader) {
    const dp = analysis.devProgHeader;
    lines.push(`${dp.ecuType} — ${analysis.flashType === 'fullflash' ? 'Full Flash' : 'Calibration Only'} [DevProg V2]`);
    lines.push(`VIN: ${dp.vin || 'N/A'}`);
    lines.push(`HW: ${dp.hardwareNumber}`);
    lines.push(`Blocks: ${dp.blockCount} (${dp.lzss ? 'LZSS compressed' : 'raw'})`);
    lines.push(`Protocol: ${analysis.securityInfo.protocol}`);
  } else if (analysis.header) {
    const h = analysis.header;
    lines.push(`${h.vehicleType} ${h.ecuType || analysis.ecuFamily} — ${analysis.flashType === 'fullflash' ? 'Full Flash' : 'Calibration Only'}`);
    lines.push(`Version: ${h.version} (Build ${h.buildNumber})`);
    lines.push(`Data: ${(analysis.dataSize / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`Parts: ${h.partNumbers.join(', ')}`);
    lines.push(`Protocol: ${analysis.securityInfo.protocol}`);
  }
  if (analysis.ecuConfig) {
    lines.push(`CAN: TX=0x${analysis.ecuConfig.txAddr.toString(16).toUpperCase()} RX=0x${analysis.ecuConfig.rxAddr.toString(16).toUpperCase()}`);
  }
  return lines.join('\n');
}
