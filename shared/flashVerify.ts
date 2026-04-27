/**
 * Container `verify` metadata helpers (CAN IDs, J1939 hints) — shared by client flash engine and tests.
 */

/** ISO 11898-1: 11-bit standard or 29-bit extended (mask 0x1FFFFFFF). */
export const CAN_ID_MAX_29BIT = 0x1fffffff;

export function parseHexCanId(v?: string): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const cleaned = s.replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 16);
  if (!Number.isFinite(n) || n < 0 || n > CAN_ID_MAX_29BIT) return null;
  return n;
}

export function isTruthyVerifyFlag(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'on' || s === '1';
}

export function inferProtocolFromVerify(
  j1939?: unknown,
  txAddr?: number | null,
  rxAddr?: number | null
): 'GMLAN' | 'UDS' | null {
  if (isTruthyVerifyFlag(j1939)) return 'UDS';
  if ((txAddr ?? 0) > 0x7ff || (rxAddr ?? 0) > 0x7ff) return 'UDS';
  return null;
}
