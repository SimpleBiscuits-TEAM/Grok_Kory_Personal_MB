/**
 * Seed/Key Security Algorithms for ECU Flash Authentication
 *
 * Ported from C# reference implementation (Seed_key.cs / dllsecurity.dll / FordSeedKeyDll.dll)
 *
 * Algorithms:
 * - GM_5B: AES-128 ECB encryption with 5-byte seed → 5-byte key (GM Delco ECUs)
 * - GM_2B: DLL-based 2-byte seed/key via CSecurity::SetSeedAndGetKey (legacy GM)
 * - Ford_3B: 3-byte LFSR-based seed/key with 5-byte secret (Ford/Bosch Ecoboost)
 * - Ford_Long: 16-byte seed with DLL-based computation (Ford MD1/TCU)
 *
 * Security: ECU profiles that contain AES secrets live in ../server/seedKeyProfiles.ts.
 * Use ../server/seedKeyService.ts for getSecurityProfile / getSecuritySummary on the server.
 * The browser uses shared/seedKeyMeta.ts (generated JSON) for non-secret metadata.
 */

import { ECU_SECURITY_META } from './seedKeyMeta';

// ── Types ──────────────────────────────────────────────────────────────────

export type SeedKeyAlgorithmType =
  | 'GM_5B_AES'    // AES-128 ECB, 5-byte seed → 5-byte key
  | 'GM_2B_DLL'    // Legacy DLL-based 2-byte computation
  | 'GM_DUAL'      // Supports both 5B (AES) and 2B (DLL) depending on seed length
  | 'FORD_3B'      // Ford 3-byte LFSR with 5-byte secret
  | 'FORD_LONG'    // Ford 16-byte seed via FordSeedKeyDll.dll
  | 'POLARIS'      // Polaris-specific algorithm
  | 'CUMMINS'      // Cummins CM2xxx specific
  | 'CANAM'        // Can-Am specific
  | 'NONE'         // No security / not implemented
  | 'UNKNOWN';

export type EcuSecurityLevel = 'standard' | 'enhanced' | 'hardware_required';

export interface EcuSecurityProfile {
  ecuType: string;
  name: string;
  manufacturer: 'GM' | 'Ford' | 'Bosch' | 'Cummins' | 'Polaris' | 'CanAm' | 'Allison';
  algorithmType: SeedKeyAlgorithmType;
  seedLength: number;        // bytes
  keyLength: number;         // bytes
  securityLevel: EcuSecurityLevel;
  protocol: 'GMLAN' | 'UDS' | 'KWP2000';
  requiresUnlockBox: boolean;
  /** Human-readable description of the security mechanism */
  description: string;
  /** UDS Security Access sub-function for seed request */
  seedSubFunction?: number;
  /** UDS Security Access sub-function for key response */
  keySubFunction?: number;
  /** AES-128 key for GM_5B computation (hex string, 32 chars = 16 bytes) */
  aesKeyHex?: string;
  /** DLL algorithm ID for GM_2B (passed to SetSeedAndGetKey) */
  dllAlgoId?: number;
  /** Whether to reverse seed bytes before 2B computation */
  invertSeed2B?: boolean;
  /** Whether to reverse key bytes after 2B computation */
  invertKey2B?: boolean;
}

// ── Algorithm Descriptions (for Knox AI and UI display) ────────────────────

export const ALGORITHM_DESCRIPTIONS: Record<SeedKeyAlgorithmType, string> = {
  'GM_5B_AES': 'GM 5-byte AES-128 ECB: Seed (5 bytes) is placed at offset 0x0B-0x0F in a 16-byte buffer filled with 0xFF, then AES-128 ECB encrypted with the ECU-specific key. Result truncated to 5 bytes.',
  'GM_2B_DLL': 'GM 2-byte DLL: Seed (2 bytes, optionally byte-reversed) is passed to CSecurity::SetSeedAndGetKey with an algorithm ID. The DLL performs a proprietary computation and returns a 2-byte key.',
  'GM_DUAL': 'GM Dual-mode: If seed is 5 bytes, uses AES-128 ECB (same as GM_5B_AES). If seed is 2 bytes, falls back to DLL-based computation (same as GM_2B_DLL). ECU determines which mode based on security access level.',
  'FORD_3B': 'Ford 3-byte LFSR: Seed (3 bytes) is combined with a 5-byte secret through a 24-bit Linear Feedback Shift Register with specific tap positions. Two rounds of 32 iterations each produce a 3-byte key.',
  'FORD_LONG': 'Ford Long: Seed (16 bytes) is processed by FordSeedKeyDll.dll with a 12-byte fixed secret. The DLL performs a proprietary computation and returns an 18-byte key response.',
  'POLARIS': 'Polaris-specific: 4-byte seed processed through a custom multiplication and LFSR algorithm with rotating secret pairs.',
  'CUMMINS': 'Cummins-specific: Custom seed/key algorithm for CM2xxx series ECUs.',
  'CANAM': 'Can-Am specific: Custom seed/key algorithm for BRP/Can-Am vehicles.',
  'NONE': 'No security access required for this ECU.',
  'UNKNOWN': 'Security algorithm not yet identified.',
};

// ── GM 5B AES-128 ECB Implementation ───────────────────────────────────────
// Used on the server and in tests. Production browsers obtain keys via flash.computeSecurityKey.

/**
 * GM_5B seed/key computation using AES-128 ECB
 */
export async function computeGM5B(seed: Uint8Array, aesKey: Uint8Array): Promise<Uint8Array> {
  if (seed.length !== 5) throw new Error(`Invalid seed length: ${seed.length}, expected 5`);
  if (aesKey.length !== 16) throw new Error(`Invalid AES key length: ${aesKey.length}, expected 16`);

  const saltedSeed = new Uint8Array(16);
  saltedSeed.fill(0xFF);
  saltedSeed[0x0B] = seed[0];
  saltedSeed[0x0C] = seed[1];
  saltedSeed[0x0D] = seed[2];
  saltedSeed[0x0E] = seed[3];
  saltedSeed[0x0F] = seed[4];

  const cryptoKey = await crypto.subtle.importKey(
    'raw', aesKey.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['encrypt']
  );

  const iv = new Uint8Array(16);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv }, cryptoKey, saltedSeed.buffer as ArrayBuffer
  );

  return new Uint8Array(encrypted).slice(0, 5);
}

/**
 * Ford 3-byte LFSR seed/key computation
 */
export function computeFord3B(seed: Uint8Array, secret: Uint8Array): Uint8Array {
  if (seed.length !== 3) throw new Error(`Invalid seed length: ${seed.length}, expected 3`);
  if (secret.length !== 5) throw new Error(`Invalid secret length: ${secret.length}, expected 5`);

  const seedInt = (seed[0] << 16) | (seed[1] << 8) | seed[2];

  const s1 = secret[0];
  const s2 = secret[1];
  const s3 = secret[2];
  const s4 = secret[3];
  const s5 = secret[4];

  const orEdSeed = (((seedInt & 0xFF0000) >> 16) | (seedInt & 0xFF00) | (s1 << 24) | ((seedInt & 0xFF) << 16)) >>> 0;

  let muckedValue = 0xC541A9;

  for (let i = 0; i < 32; i++) {
    const aBit = ((((orEdSeed >>> i) & 1) ^ (muckedValue & 1)) << 23) >>> 0;
    const v8 = (aBit | (muckedValue >>> 1)) >>> 0;
    muckedValue = (
      (v8 & 0xEF6FD7) |
      (((((v8 & 0x100000) >>> 20) ^ ((v8 & 0x800000) >>> 23)) << 20) >>> 0) |
      (((((muckedValue >>> 1) & 0x8000) >>> 15) ^ ((v8 & 0x800000) >>> 23)) << 15) |
      (((((muckedValue >>> 1) & 0x1000) >>> 12) ^ ((v8 & 0x800000) >>> 23)) << 12) |
      (32 * ((((muckedValue >>> 1) & 0x20) >>> 5) ^ ((v8 & 0x800000) >>> 23))) |
      (8 * ((((muckedValue >>> 1) & 8) >>> 3) ^ ((v8 & 0x800000) >>> 23)))
    ) >>> 0;
  }

  const secretWord = ((s5 << 24) | (s4 << 16) | s2 | (s3 << 8)) >>> 0;
  for (let j = 0; j < 32; j++) {
    const aBit = ((((secretWord >>> j) & 1) ^ (muckedValue & 1)) << 23) >>> 0;
    const v12 = (aBit | (muckedValue >>> 1)) >>> 0;
    muckedValue = (
      (v12 & 0xEF6FD7) |
      (((((v12 & 0x100000) >>> 20) ^ ((v12 & 0x800000) >>> 23)) << 20) >>> 0) |
      (((((muckedValue >>> 1) & 0x8000) >>> 15) ^ ((v12 & 0x800000) >>> 23)) << 15) |
      (((((muckedValue >>> 1) & 0x1000) >>> 12) ^ ((v12 & 0x800000) >>> 23)) << 12) |
      (32 * ((((muckedValue >>> 1) & 0x20) >>> 5) ^ ((v12 & 0x800000) >>> 23))) |
      (8 * ((((muckedValue >>> 1) & 8) >>> 3) ^ ((v12 & 0x800000) >>> 23)))
    ) >>> 0;
  }

  const key2 = (
    ((muckedValue & 0xF0000) >>> 16) |
    (16 * (muckedValue & 0xF)) |
    ((((muckedValue & 0xF00000) >>> 20) | ((muckedValue & 0xF000) >>> 8)) << 8) |
    (((muckedValue & 0xFF0) >>> 4) << 16)
  ) >>> 0;

  const key = new Uint8Array(3);
  key[0] = (key2 >>> 16) & 0xFF;
  key[1] = (key2 >>> 8) & 0xFF;
  key[2] = key2 & 0xFF;
  return key;
}

/**
 * Utility: convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/0x/gi, '').replace(/[\s,]/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Utility: convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array, separator = ' '): string {
  return Array.from(bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(separator);
}

// ── Client-safe security profile lookup ───────────────────────────────────
// Returns metadata + a placeholder aesKeyHex (32-char string) for ECUs whose
// real AES key lives in server/seedKeyProfiles.ts. This lets Tobi's readiness
// check (`secProfile?.aesKeyHex?.length === 32`) work on the client without
// ever shipping the actual key hex to the browser.
//
// NOTE: seedKeyMeta.ts only uses `import type` from this file, so the
// circular reference is type-only and erased at runtime — no real cycle.

/** ECU types that have a hardcoded AES key in server/seedKeyProfiles.ts */
const ECU_TYPES_WITH_AES_KEY: ReadonlySet<string> = new Set([
  'E41', 'E88', 'E90', 'E99', 'E92', 'E98', 'E80', 'E83', 'E78',
  'E67', 'E39', 'E46', 'E45',
  'T87', 'T87A',
]);

/**
 * Client-safe security profile lookup.
 *
 * Returns the ECU security metadata from seedKeyMeta plus a 32-char
 * placeholder `aesKeyHex` when the server holds the real key.
 * The actual key hex never leaves the server.
 */
export function getSecurityProfile(
  ecuType: string,
): (Omit<EcuSecurityProfile, 'aesKeyHex'> & { aesKeyHex?: string }) | undefined {
  const upper = ecuType.toUpperCase();
  const meta = ECU_SECURITY_META[upper];
  if (!meta) return undefined;
  return {
    ...meta,
    // 32-char placeholder so `.aesKeyHex.length === 32` evaluates true
    aesKeyHex: ECU_TYPES_WITH_AES_KEY.has(upper)
      ? '00000000000000000000000000000000'
      : undefined,
  };
}
