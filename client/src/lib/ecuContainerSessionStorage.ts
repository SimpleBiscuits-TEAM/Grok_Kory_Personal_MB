/**
 * Browser session cache: reference container path + match params + last ECU scan snapshot.
 * Stored in localStorage — not committed; use `scripts/ingest-reference-container.ts` for CLI JSON under `.data/`.
 */
import type { EcuScanResult } from './ecuScanner';
import {
  type ContainerMatchParams,
  type VehicleScanSnapshotV1,
  calibrationSlotsFromEcuScanLike,
  extractContainerMatchParamsFromBin,
} from '../../../shared/ecuContainerMatch';

const STORAGE_KEY = 'goodGravy.ecuContainerSession.v1';

/** Default bench reference (user-provided path on dev PC — update if you move files). */
export const DEFAULT_REFERENCE_CONTAINER_PATH =
  String.raw`c:\EDS\zeugs\GMLAN_STUFF\L5P_ECU_FLASH\Container\__MASTER_BENCHECU__12709844_12688366_12688360_12688387_12710348_12710336_E41_ORIGINAL_CHK__L5P66V8_E41___FULL_CONTAINER.Bin`;

export interface EcuContainerSessionV1 {
  version: 1;
  updatedAt: number;
  referenceContainer?: {
    absolutePath: string;
    fileName: string;
    matchParams: ContainerMatchParams | null;
    /** Set when user loaded file in app or ran ingest script */
    lastIngestedAt?: number;
  };
  lastVehicleScan?: VehicleScanSnapshotV1;
}

export function buildVehicleScanSnapshotV1(ecu: EcuScanResult): VehicleScanSnapshotV1 {
  return {
    version: 1,
    scannedAt: Date.now(),
    txAddr: ecu.txAddr,
    rxAddr: ecu.rxAddr,
    detectedProtocol: ecu.detectedProtocol,
    ecuConfigName: ecu.ecuConfig?.name,
    ecuTypeKey: ecu.ecuConfig?.ecuType,
    vin: ecu.vin,
    hardwareId: ecu.hardwareId,
    calibrationSlots: calibrationSlotsFromEcuScanLike(ecu),
  };
}

export function loadEcuContainerSession(): EcuContainerSessionV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as EcuContainerSessionV1;
    if (o?.version !== 1) return null;
    return o;
  } catch {
    return null;
  }
}

export function saveEcuContainerSession(session: EcuContainerSessionV1): void {
  session.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[ecuContainerSession] save failed', e);
  }
}

/** Merge or create session; seeds reference path once if empty. */
export function ensureSessionWithReferencePath(): EcuContainerSessionV1 {
  let s = loadEcuContainerSession();
  if (!s) {
    s = {
      version: 1,
      updatedAt: Date.now(),
      referenceContainer: {
        absolutePath: DEFAULT_REFERENCE_CONTAINER_PATH,
        fileName: DEFAULT_REFERENCE_CONTAINER_PATH.split(/[/\\]/).pop() ?? 'container.bin',
        matchParams: null,
      },
    };
    saveEcuContainerSession(s);
    return s;
  }
  if (!s.referenceContainer) {
    s.referenceContainer = {
      absolutePath: DEFAULT_REFERENCE_CONTAINER_PATH,
      fileName: DEFAULT_REFERENCE_CONTAINER_PATH.split(/[/\\]/).pop() ?? 'container.bin',
      matchParams: null,
    };
    saveEcuContainerSession(s);
  }
  return s;
}

/** Call after a successful vehicle scan (first responding ECU). */
export function persistLastVehicleScan(ecu: EcuScanResult): void {
  if (!ecu.responding) return;
  const session = ensureSessionWithReferencePath();
  session.lastVehicleScan = buildVehicleScanSnapshotV1(ecu);
  saveEcuContainerSession(session);
}

/** When user selects a container file in-app — pass ArrayBuffer bytes. */
export function ingestReferenceContainerFromBuffer(absolutePath: string, fileName: string, bytes: ArrayBuffer): void {
  const u8 = new Uint8Array(bytes);
  const matchParams = extractContainerMatchParamsFromBin(u8);
  const session = ensureSessionWithReferencePath();
  session.referenceContainer = {
    absolutePath,
    fileName,
    matchParams,
    lastIngestedAt: Date.now(),
  };
  saveEcuContainerSession(session);
}
