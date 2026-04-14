/**
 * Last successful flash container metadata for rescue UX (reuse same file / hash hint).
 * Stored in localStorage — not the binary (too large).
 */

const STORAGE_KEY = 'goodGravy.flashRescueMeta.v1';

export interface FlashRescueMetaV1 {
  version: 1;
  savedAt: number;
  fileName: string;
  fileHash: string;
  ecuType: string;
}

export function saveFlashRescueMeta(meta: Omit<FlashRescueMetaV1, 'version' | 'savedAt'>): void {
  try {
    const payload: FlashRescueMetaV1 = {
      version: 1,
      savedAt: Date.now(),
      ...meta,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function loadFlashRescueMeta(): FlashRescueMetaV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as FlashRescueMetaV1;
    if (o?.version !== 1 || !o.fileName || !o.fileHash) return null;
    return o;
  } catch {
    return null;
  }
}
