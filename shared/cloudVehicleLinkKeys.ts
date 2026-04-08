/**
 * Normalize hardware identifiers for matching cloud enrollments to Tune Deploy devices.
 * Used on client (MY VEHICLE filter) and can mirror server-side SQL normalization.
 */
export function normalizeHardwareSerialKey(s: string | null | undefined): string | null {
  if (!s?.trim()) return null;
  const t = s.replace(/\s/g, "").toUpperCase();
  return t.length > 0 ? t : null;
}

export function normalizeVinKey(v: string | null | undefined): string {
  return (v ?? "").replace(/\s/g, "").toUpperCase();
}
