/**
 * Session History — localStorage-based persistence for datalog sessions.
 *
 * Stores session metadata + compressed reading data so users can review
 * past datalogs without re-importing CSV files.
 *
 * Storage format:
 *   - `vop_session_index` → SessionMeta[] (lightweight list for the UI)
 *   - `vop_session_data_{id}` → serialized readings (one key per session)
 *
 * Limits:
 *   - Max 50 sessions (oldest auto-pruned)
 *   - Individual session data capped at ~2 MB serialized
 */

import type { LogSession, PIDDefinition, PIDReading, VehicleInfo } from './obdConnection';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionMeta {
  id: string;
  name?: string;
  startTime: number;
  endTime?: number;
  durationSec: number;
  sampleRate: number;
  channelCount: number;
  channelNames: string[];
  totalSamples: number;
  vin?: string;
  vehicle?: string;
  manufacturer?: string;
  fuelType?: string;
  createdAt: number;
}

interface SerializedSession {
  id: string;
  name?: string;
  startTime: number;
  endTime?: number;
  sampleRate: number;
  vehicleInfo?: VehicleInfo;
  pids: SerializedPID[];
  /** readings: Map<pid, PIDReading[]> serialized as [pid, readings[]][] */
  readings: [number, SerializedReading[]][];
}

interface SerializedPID {
  pid: number;
  name: string;
  shortName: string;
  unit: string;
  min: number;
  max: number;
  bytes: number;
  category: string;
  service?: number;
}

interface SerializedReading {
  v: number;      // value
  t: number;      // timestamp
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INDEX_KEY = 'vop_session_index';
const DATA_KEY_PREFIX = 'vop_session_data_';
const MAX_SESSIONS = 50;
const MAX_DATA_SIZE = 2 * 1024 * 1024; // 2 MB per session

// ─── Index operations ───────────────────────────────────────────────────────

export function loadSessionIndex(): SessionMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessionIndex(index: SessionMeta[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

// ─── Session CRUD ───────────────────────────────────────────────────────────

export function saveSession(session: LogSession): SessionMeta | null {
  try {
    // Build serialized data
    const serialized: SerializedSession = {
      id: session.id,
      name: session.name,
      startTime: session.startTime,
      endTime: session.endTime,
      sampleRate: session.sampleRate,
      vehicleInfo: session.vehicleInfo,
      pids: session.pids.map(p => ({
        pid: p.pid,
        name: p.name,
        shortName: p.shortName,
        unit: p.unit,
        min: p.min,
        max: p.max,
        bytes: p.bytes,
        category: p.category,
        service: (p as { service?: number }).service,
      })),
      readings: [],
    };

    // Serialize readings (compact format — only value + timestamp)
    let totalSamples = 0;
    session.readings.forEach((readings, pid) => {
      const compact: SerializedReading[] = readings.map(r => ({
        v: Math.round(r.value * 1000) / 1000, // 3 decimal precision
        t: r.timestamp,
      }));
      serialized.readings.push([pid, compact]);
      totalSamples += compact.length;
    });

    const dataStr = JSON.stringify(serialized);

    // Check size limit
    if (dataStr.length > MAX_DATA_SIZE) {
      console.warn(`[SessionHistory] Session too large (${(dataStr.length / 1024).toFixed(0)} KB), skipping save`);
      return null;
    }

    // Save data
    localStorage.setItem(DATA_KEY_PREFIX + session.id, dataStr);

    // Build meta
    const vi = session.vehicleInfo;
    const durationSec = ((session.endTime || Date.now()) - session.startTime) / 1000;
    const meta: SessionMeta = {
      id: session.id,
      name: session.name,
      startTime: session.startTime,
      endTime: session.endTime,
      durationSec,
      sampleRate: session.sampleRate,
      channelCount: session.pids.length,
      channelNames: session.pids.map(p => p.shortName),
      totalSamples,
      vin: vi?.vin,
      vehicle: (vi?.make || vi?.model || vi?.year)
        ? [vi.year, vi.make, vi.model].filter(Boolean).join(' ')
        : undefined,
      manufacturer: vi?.manufacturer,
      fuelType: vi?.fuelType,
      createdAt: Date.now(),
    };

    // Update index
    const index = loadSessionIndex();
    // Remove duplicate if re-saving
    const filtered = index.filter(m => m.id !== session.id);
    filtered.unshift(meta);

    // Prune oldest if over limit
    while (filtered.length > MAX_SESSIONS) {
      const removed = filtered.pop();
      if (removed) {
        localStorage.removeItem(DATA_KEY_PREFIX + removed.id);
      }
    }

    saveSessionIndex(filtered);
    return meta;
  } catch (err) {
    console.error('[SessionHistory] Failed to save session:', err);
    return null;
  }
}

export function loadSession(id: string): LogSession | null {
  try {
    const raw = localStorage.getItem(DATA_KEY_PREFIX + id);
    if (!raw) return null;

    const s: SerializedSession = JSON.parse(raw);

    // Rebuild PID definitions
    const pids: PIDDefinition[] = s.pids.map(sp => ({
      pid: sp.pid,
      name: sp.name,
      shortName: sp.shortName,
      unit: sp.unit,
      min: sp.min,
      max: sp.max,
      bytes: sp.bytes,
      category: sp.category,
      service: sp.service,
      formula: ([a]: number[]) => a, // placeholder — not needed for playback
    } as PIDDefinition));

    // Rebuild readings map
    const readings = new Map<number, PIDReading[]>();
    for (const [pid, compactReadings] of s.readings) {
      const pidDef = pids.find(p => p.pid === pid);
      readings.set(pid, compactReadings.map(cr => ({
        pid,
        name: pidDef?.name || '',
        shortName: pidDef?.shortName || '',
        value: cr.v,
        unit: pidDef?.unit || '',
        rawBytes: [],
        timestamp: cr.t,
      })));
    }

    return {
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      sampleRate: s.sampleRate,
      pids,
      readings,
      vehicleInfo: s.vehicleInfo,
    };
  } catch (err) {
    console.error('[SessionHistory] Failed to load session:', err);
    return null;
  }
}

export function deleteSession(id: string): void {
  localStorage.removeItem(DATA_KEY_PREFIX + id);
  const index = loadSessionIndex().filter(m => m.id !== id);
  saveSessionIndex(index);
}

export function updateSessionName(id: string, name: string): void {
  // Update index
  const index = loadSessionIndex();
  const meta = index.find(m => m.id === id);
  if (meta) {
    meta.name = name;
    saveSessionIndex(index);
  }

  // Update data
  try {
    const raw = localStorage.getItem(DATA_KEY_PREFIX + id);
    if (raw) {
      const s: SerializedSession = JSON.parse(raw);
      s.name = name;
      localStorage.setItem(DATA_KEY_PREFIX + id, JSON.stringify(s));
    }
  } catch {
    // Non-critical — index is the primary source for name
  }
}

export function clearAllSessions(): void {
  const index = loadSessionIndex();
  for (const meta of index) {
    localStorage.removeItem(DATA_KEY_PREFIX + meta.id);
  }
  localStorage.removeItem(INDEX_KEY);
}

/**
 * Get total localStorage usage for session history (approximate).
 */
export function getStorageUsage(): { count: number; sizeKB: number } {
  const index = loadSessionIndex();
  let totalSize = (localStorage.getItem(INDEX_KEY) || '').length;
  for (const meta of index) {
    totalSize += (localStorage.getItem(DATA_KEY_PREFIX + meta.id) || '').length;
  }
  return { count: index.length, sizeKB: Math.round(totalSize / 1024) };
}
