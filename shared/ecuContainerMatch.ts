/**
 * Match live ECU scan data to DevProg / header calibration fields (sw_c1..sw_c9).
 * Search uses **container-provided** parameters only — the ECU may expose more DIDs than the envelope stores.
 *
 * Per-controller **software slot masks** (`ecuSoftwareSlotMask.ts`): only C-slots listed in the DevProg
 * table (non-`xff`) participate in the match % — not VIN/HW bonuses.
 */
import { tryParseDevProgContainerRecord } from './devProgContainerJson';
import type { ContainerFileHeader } from './ecuDatabase';
import { activeSoftwareSlotIndices } from './ecuSoftwareSlotMask';

const SW_KEYS = ['sw_c1', 'sw_c2', 'sw_c3', 'sw_c4', 'sw_c5', 'sw_c6', 'sw_c7', 'sw_c8', 'sw_c9'] as const;

function strField(r: Record<string, unknown>, key: string): string {
  const v = r[key];
  if (v == null) return '';
  return String(v).trim();
}

/** Parameters taken from a parsed container (DevProg JSON / ContainerFileHeader) for lookup & scoring. */
export interface ContainerMatchParams {
  ecu_type: string;
  hardware_number: string;
  udid: string;
  vin: string;
  /** Index 0 = sw_c1 … index 8 = sw_c9 — decimal strings as in header */
  swSlots: (string | null)[];
}

export interface VehicleScanSnapshotV1 {
  version: 1;
  scannedAt: number;
  txAddr: number;
  rxAddr: number;
  detectedProtocol: string;
  ecuConfigName?: string;
  ecuTypeKey?: string;
  vin?: string;
  hardwareId?: string;
  /** Nine calibration slot strings (empty if unknown) — aligns with sw_c1..sw_c9 */
  calibrationSlots: string[];
}

export interface MatchScoreResult {
  /** How many non-empty container slots equal the scan slot (same index) */
  slotMatches: number;
  /** Denominator for %: profile-relevant container slots compared, or all non-empty slots in fallback mode */
  nonEmptyContainerSlots: number;
  ecuTypeMatch: boolean | null;
  hardwareMatch: boolean | null;
  vinMatch: boolean | null;
  /** 0–1 — ratio of matching software part numbers on compared slots (identity), not VIN/HW-weighted */
  confidence: number;
  notes: string[];
}

function strRecord(r: unknown): Record<string, unknown> | null {
  return r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
}

/** Read sw_c1..sw_c9 + identity fields from DevProg JSON record (same keys as parseDevProgContainer). */
export function containerMatchParamsFromDevProgRecord(record: Record<string, unknown>): ContainerMatchParams {
  const swSlots: (string | null)[] = Array(9).fill(null);
  for (let i = 0; i < 9; i++) {
    const v = strField(record, SW_KEYS[i]!);
    swSlots[i] = v.length > 0 ? normalizeCalPartToken(v) : null;
  }
  return {
    ecu_type: strField(record, 'ecu_type').toUpperCase(),
    hardware_number: normalizeCalPartToken(strField(record, 'hardware_number')),
    udid: strField(record, 'udid').trim(),
    vin: strField(record, 'vin').trim().toUpperCase(),
    swSlots,
  };
}

export function containerMatchParamsFromContainerFileHeader(h: ContainerFileHeader): ContainerMatchParams {
  const swSlots: (string | null)[] = Array(9).fill(null);
  for (let i = 0; i < 9; i++) {
    const key = SW_KEYS[i]!;
    const raw = h[key as keyof ContainerFileHeader];
    const v = raw != null && String(raw).trim() !== '' ? normalizeCalPartToken(String(raw)) : '';
    swSlots[i] = v.length > 0 ? v : null;
  }
  return {
    ecu_type: String(h.ecu_type ?? '').trim().toUpperCase(),
    hardware_number: normalizeCalPartToken(String(h.hardware_number ?? '')),
    udid: String(h.udid ?? '').trim(),
    vin: String(h.vin ?? '').trim().toUpperCase(),
    swSlots,
  };
}

/** Parse binary container and extract match params (DevProg JSON @ 0x1004). */
export function extractContainerMatchParamsFromBin(data: Uint8Array): ContainerMatchParams | null {
  const record = tryParseDevProgContainerRecord(data);
  const o = strRecord(record);
  if (!o) return null;
  return containerMatchParamsFromDevProgRecord(o);
}

export function normalizeCalPartToken(s: string): string {
  return s.trim().replace(/^0+(?=\d)/, '') || s.trim();
}

/** Build nine slot strings from ECU scan (GMLAN C1–C9 preferred). */
export function calibrationSlotsFromEcuScanLike(cal: {
  gmSoftwarePartSlots?: { label: string; decimal: number }[];
  calibrationPartNumbers: string[];
}): string[] {
  const out: string[] = Array(9).fill('');
  if (cal.gmSoftwarePartSlots && cal.gmSoftwarePartSlots.length > 0) {
    for (const s of cal.gmSoftwarePartSlots) {
      const idx = parseInt(s.label.replace(/^C/i, ''), 10) - 1;
      if (idx >= 0 && idx < 9) {
        out[idx] = String(s.decimal);
      }
    }
    return out;
  }
  const src = cal.calibrationPartNumbers || [];
  for (let i = 0; i < Math.min(9, src.length); i++) {
    const t = src[i]?.trim();
    if (t) out[i] = normalizeCalPartToken(t);
  }
  return out;
}

/** Long digit groups in bench-style filenames (e.g. __MASTER_…__12709844_12688366…). */
export function extractFilenameCalibrationTokens(fileName: string): string[] {
  const base = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName;
  const matches = base.match(/\d{7,12}/g);
  if (!matches) return [];
  return [...new Set(matches.map(normalizeCalPartToken))];
}

/**
 * Which ECU key drives `ecuSoftwareSlotMask` when scoring a **file** vs a **scan**.
 * Prefer the **container’s** `ecu_type` (the tune declares what C-slots mean). Using the scan’s
 * guess first caused wrong masks / false `ecuTypeMatch` when auto-detection disagreed with the file.
 */
export function ecuTypeKeyForSlotProfile(container: ContainerMatchParams, scan: VehicleScanSnapshotV1): string {
  const fromFile = container.ecu_type?.trim();
  if (fromFile) return fromFile;
  return scan.ecuTypeKey?.trim() ?? '';
}

/** Score container params against a live scan snapshot. */
export function scoreContainerAgainstScan(
  container: ContainerMatchParams,
  scan: VehicleScanSnapshotV1,
): MatchScoreResult {
  const notes: string[] = [];
  const ecuKey = ecuTypeKeyForSlotProfile(container, scan);
  const profileIx = activeSoftwareSlotIndices(ecuKey.length > 0 ? ecuKey : null);

  let slotMatches = 0;
  let compared = 0;

  const runSlot = (i: number) => {
    const c = container.swSlots[i];
    const s = scan.calibrationSlots[i]?.trim();
    if (c == null || c === '') return;
    compared++;
    if (!s) {
      notes.push(`sw_c${i + 1}=${c} in container; scan slot empty`);
      return;
    }
    if (normalizeCalPartToken(c) === normalizeCalPartToken(s)) {
      slotMatches++;
    } else {
      notes.push(`sw_c${i + 1} container ${c} vs scan ${s}`);
    }
  };

  if (profileIx && profileIx.length > 0) {
    for (const i of profileIx) {
      runSlot(i);
    }
  } else {
    for (let i = 0; i < 9; i++) {
      runSlot(i);
    }
  }

  let ecuTypeMatch: boolean | null = null;
  if (container.ecu_type && scan.ecuTypeKey) {
    ecuTypeMatch = container.ecu_type === scan.ecuTypeKey.toUpperCase();
  } else if (container.ecu_type && scan.ecuConfigName) {
    ecuTypeMatch =
      scan.ecuConfigName.toUpperCase().includes(container.ecu_type)
      || container.ecu_type.includes(scan.ecuConfigName.toUpperCase().replace(/\s+/g, ''));
  }

  let hardwareMatch: boolean | null = null;
  if (container.hardware_number && scan.hardwareId) {
    hardwareMatch = normalizeCalPartToken(container.hardware_number) === normalizeCalPartToken(scan.hardwareId);
  }

  let vinMatch: boolean | null = null;
  if (container.vin && container.vin.length >= 11 && scan.vin && scan.vin.length >= 11) {
    vinMatch = container.vin === scan.vin.toUpperCase();
  }

  const confidence = compared > 0 ? slotMatches / compared : 0;

  return {
    slotMatches,
    nonEmptyContainerSlots: compared,
    ecuTypeMatch,
    hardwareMatch,
    vinMatch,
    confidence: Math.min(1, confidence),
    notes,
  };
}

/**
 * True when every **compared** calibration slot matches the scan (identity on software part numbers).
 * ECU-type line in the header is informational: auto-detected `ecuTypeKey` can disagree with the file;
 * use {@link hasEcuTypeConflict} for a separate warning in the UI.
 */
export function isContainerMatchAcceptable(score: MatchScoreResult): boolean {
  if (score.nonEmptyContainerSlots === 0) return false;
  return score.slotMatches === score.nonEmptyContainerSlots;
}

/** Scan vs file `ecu_type` disagree — show as a warning, not a hard fail, when slots match. */
export function hasEcuTypeConflict(score: MatchScoreResult): boolean {
  return score.ecuTypeMatch === false;
}

/** Rank candidate files by score (higher first). Uses only container header params vs scan. */
export function rankContainerBinsByScan(
  candidates: { path: string; params: ContainerMatchParams }[],
  scan: VehicleScanSnapshotV1,
): { path: string; score: MatchScoreResult }[] {
  return candidates
    .map(c => ({ path: c.path, score: scoreContainerAgainstScan(c.params, scan) }))
    .sort((a, b) => b.score.confidence - a.score.confidence);
}
