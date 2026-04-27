/**
 * Browser session: last ECU scan snapshot for optional persistence (localStorage).
 */
import type { EcuScanResult } from './ecuScanner';
import {
  type VehicleScanSnapshotV1,
  calibrationSlotsFromEcuScanLike,
} from '../../../shared/ecuContainerMatch';

const STORAGE_KEY = 'goodGravy.ecuContainerSession.v1';

/** ECU Scan adapter: local WebSocket bridge vs V-OP USB (Flash tab follows last scan). */
export type StoredEcuScanTransport = 'bridge' | 'vop';

export interface EcuContainerSessionV1 {
  version: 1;
  updatedAt: number;
  lastVehicleScan?: VehicleScanSnapshotV1;
  /** Last transport used for a successful ECU Scan (drives live flash hardware). */
  lastScanTransport?: StoredEcuScanTransport;
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
    const o = JSON.parse(raw) as EcuContainerSessionV1 & { lastScanTransport?: string };
    if (o?.version !== 1) return null;
    if (o.lastScanTransport === 'pcan') {
      (o as EcuContainerSessionV1).lastScanTransport = 'bridge';
    }
    return o as EcuContainerSessionV1;
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

function ensureEcuContainerSession(): EcuContainerSessionV1 {
  let s = loadEcuContainerSession();
  if (!s) {
    s = { version: 1, updatedAt: Date.now() };
    saveEcuContainerSession(s);
    return s;
  }
  return s;
}

/** Call after a successful vehicle scan (first responding ECU). */
export function persistLastVehicleScan(ecu: EcuScanResult): void {
  if (!ecu.responding) return;
  const session = ensureEcuContainerSession();
  session.lastVehicleScan = buildVehicleScanSnapshotV1(ecu);
  saveEcuContainerSession(session);
}

/** Persist which adapter was used for ECU Scan so Flash uses the same transport. */
export function persistEcuScanTransport(choice: StoredEcuScanTransport): void {
  const session = ensureEcuContainerSession();
  session.lastScanTransport = choice;
  saveEcuContainerSession(session);
  try {
    window.dispatchEvent(new CustomEvent('goodGravy:ecuScanTransport', { detail: choice }));
  } catch {
    /* ignore */
  }
}
