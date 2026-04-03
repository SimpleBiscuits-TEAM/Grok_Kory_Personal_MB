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
 * Security Note: AES keys and algorithm secrets are stored server-side only.
 * The client receives only the algorithm TYPE identifier, never the actual keys.
 */

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

// ── ECU Security Database ──────────────────────────────────────────────────

export const ECU_SECURITY_PROFILES: Record<string, EcuSecurityProfile> = {
  // ── GM Delco ECUs (AES-128 + DLL dual mode) ──────────────────────────
  'E41': {
    ecuType: 'E41', name: 'Bosch MG1CS111 (L5P Duramax)',
    manufacturer: 'GM', algorithmType: 'GM_5B_AES',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'AES-128 ECB. 5-byte seed padded to 16 bytes (0xFF fill, seed at offset 0x0B-0x0F), encrypted with ECU-specific AES key, truncated to 5 bytes. Uses GMLAN protocol with seed level 1 (0x27 0x01 / 0x27 0x02).',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '45AE6BA2CB81F5656B05072D74FF47E0',
  },
  'E88': {
    ecuType: 'E88', name: 'GM-DELCO E88',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL-based for 2-byte seeds. GMLAN protocol with standard security access.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '324385D3A0704DA2926220B3F9CCE00A',
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E90': {
    ecuType: 'E90', name: 'GM-DELCO E90',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL-based for 2-byte seeds. Shares AES key with E88/E99.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '324385D3A0704DA2926220B3F9CCE00A',
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E99': {
    ecuType: 'E99', name: 'GM-DELCO E99',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: shares AES key with E88/E90. GMLAN protocol.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '324385D3A0704DA2926220B3F9CCE00A',
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E92': {
    ecuType: 'E92', name: 'GM-DELCO E92',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x401 for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '8F1D7E62A7D6CF4EA6071C3A32A420F0',
    dllAlgoId: 0x401, invertSeed2B: true, invertKey2B: true,
  },
  'E98': {
    ecuType: 'E98', name: 'GM-DELCO E98',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x42B for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '7DFB2444A24606193D2C679F0DD442AD',
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E80': {
    ecuType: 'E80', name: 'GM-DELCO E80',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x43D for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: 'E1CAF8B2A19060A5EA211F130AC2C215',
    dllAlgoId: 0x43D, invertSeed2B: true, invertKey2B: true,
  },
  'E83': {
    ecuType: 'E83', name: 'GM-DELCO E83',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x3DE for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '1FFA31259411A0E6F2CA9DC69814DB97',
    dllAlgoId: 0x3DE, invertSeed2B: true, invertKey2B: true,
  },
  'E78': {
    ecuType: 'E78', name: 'GM-DELCO E78',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x3DB for 2-byte seeds. Shares AES key with E83.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: '1FFA31259411A0E6F2CA9DC69814DB97',
    dllAlgoId: 0x3DB, invertSeed2B: true, invertKey2B: true,
  },
  'E86': {
    ecuType: 'E86', name: 'GM-DELCO E86',
    manufacturer: 'GM', algorithmType: 'GM_2B_DLL',
    seedLength: 2, keyLength: 2, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: '2-byte DLL-based seed/key only. Algo 0x402.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x402, invertSeed2B: true, invertKey2B: true,
  },
  'E35': {
    ecuType: 'E35', name: 'GM-DELCO E35',
    manufacturer: 'GM', algorithmType: 'GM_2B_DLL',
    seedLength: 2, keyLength: 2, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: '2-byte DLL-based seed/key. Algo 0x376.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x376, invertSeed2B: true, invertKey2B: true,
  },
  'E67': {
    ecuType: 'E67', name: 'GM-DELCO E67',
    manufacturer: 'GM', algorithmType: 'GM_2B_DLL',
    seedLength: 2, keyLength: 2, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: '2-byte DLL-based seed/key. Algo 0x389. No byte inversion.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x389, invertSeed2B: false, invertKey2B: false,
  },
  'E39': {
    ecuType: 'E39', name: 'GM-DELCO E39',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0xDB for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: 'F456F416AADE191524518475134E010E',
    dllAlgoId: 0xDB, invertSeed2B: true, invertKey2B: true,
  },
  'E46': {
    ecuType: 'E46', name: 'GM-DELCO E46',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL-based for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: 'CBFE2A306953F8F932AAF7AC6828A5D7',
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E45': {
    ecuType: 'E45', name: 'GM-DELCO E45',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL-based for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
  },

  // ── Allison TCM ──────────────────────────────────────────────────────
  'T87': {
    ecuType: 'T87', name: 'Allison TCM T87',
    manufacturer: 'Allison', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x439 for 2-byte seeds. EFILive lock detection with alternate key computation.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: 'DF7F64D2DDDAC1A18F1B4D4A191610F9',
    dllAlgoId: 0x439, invertSeed2B: true, invertKey2B: true,
  },
  'T87A': {
    ecuType: 'T87A', name: 'Allison TCM T87A',
    manufacturer: 'Allison', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: shares security profile with T87.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    aesKeyHex: 'DF7F64D2DDDAC1A18F1B4D4A191610F9',
    dllAlgoId: 0x439, invertSeed2B: true, invertKey2B: true,
  },
  'T76': {
    ecuType: 'T76', name: 'Allison TCM T76',
    manufacturer: 'Allison', algorithmType: 'GM_2B_DLL',
    seedLength: 2, keyLength: 2, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: '2-byte DLL-based seed/key. Algo 0xC5.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0xC5, invertSeed2B: true, invertKey2B: false,
  },

  // ── Ford / Bosch ECUs ────────────────────────────────────────────────
  'MG1CS015': {
    ecuType: 'MG1CS015', name: 'Bosch MG1CS015 (Ford Ecoboost)',
    manufacturer: 'Ford', algorithmType: 'FORD_3B',
    seedLength: 3, keyLength: 3, securityLevel: 'standard',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 3-byte LFSR seed/key with 5-byte secret constant. Used on Ecoboost engines.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
  },
  'MG1CS018': {
    ecuType: 'MG1CS018', name: 'Bosch MG1CS018 (Ford)',
    manufacturer: 'Ford', algorithmType: 'FORD_3B',
    seedLength: 3, keyLength: 3, securityLevel: 'standard',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 3-byte LFSR seed/key. Shares secret with MG1CS015.',
  },
  'MG1CS019': {
    ecuType: 'MG1CS019', name: 'Bosch MG1CS019 (Ford)',
    manufacturer: 'Ford', algorithmType: 'FORD_3B',
    seedLength: 3, keyLength: 3, securityLevel: 'standard',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 3-byte LFSR seed/key. Shares secret with MG1CS015.',
  },
  'MEDG17': {
    ecuType: 'MEDG17', name: 'Bosch MEDG17 (Ford Ecoboost)',
    manufacturer: 'Ford', algorithmType: 'FORD_3B',
    seedLength: 3, keyLength: 3, securityLevel: 'standard',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 3-byte LFSR seed/key. Ecoboost variant.',
  },
  'EDC17CP05': {
    ecuType: 'EDC17CP05', name: 'Bosch EDC17CP05 (Ford Diesel)',
    manufacturer: 'Ford', algorithmType: 'FORD_3B',
    seedLength: 3, keyLength: 3, securityLevel: 'standard',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 3-byte LFSR seed/key with different secret constant from MG1 series.',
  },
  'EDC17CP65': {
    ecuType: 'EDC17CP65', name: 'Bosch EDC17CP65 (Ford Diesel)',
    manufacturer: 'Ford', algorithmType: 'FORD_3B',
    seedLength: 3, keyLength: 3, securityLevel: 'standard',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 3-byte LFSR seed/key. Shares secret with EDC17CP05.',
  },
  'MD1CP006': {
    ecuType: 'MD1CP006', name: 'Bosch MD1CP006 (Ford)',
    manufacturer: 'Ford', algorithmType: 'FORD_LONG',
    seedLength: 16, keyLength: 18, securityLevel: 'enhanced',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 16-byte seed with DLL-based computation via FordSeedKeyDll.dll. Uses 12-byte fixed secret.',
  },
  'MD1CP062': {
    ecuType: 'MD1CP062', name: 'Bosch MD1CP062 (Ford)',
    manufacturer: 'Ford', algorithmType: 'FORD_LONG',
    seedLength: 16, keyLength: 18, securityLevel: 'enhanced',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford 16-byte seed with DLL-based computation. Different fixed secret from MD1CP006.',
  },
  'TCU10R80': {
    ecuType: 'TCU10R80', name: 'Ford TCU 10R80',
    manufacturer: 'Ford', algorithmType: 'FORD_LONG',
    seedLength: 16, keyLength: 18, securityLevel: 'enhanced',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Ford TCU 16-byte seed with DLL-based computation.',
  },

  // ── Cummins ECUs ─────────────────────────────────────────────────────
  'CM2350B': {
    ecuType: 'CM2350B', name: 'Cummins CM2350B',
    manufacturer: 'Cummins', algorithmType: 'CUMMINS',
    seedLength: 4, keyLength: 4, securityLevel: 'enhanced',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Cummins-specific seed/key algorithm (CM2350 variant).',
  },
  'CM2450B': {
    ecuType: 'CM2450B', name: 'Cummins CM2450B',
    manufacturer: 'Cummins', algorithmType: 'CUMMINS',
    seedLength: 4, keyLength: 4, securityLevel: 'enhanced',
    protocol: 'UDS', requiresUnlockBox: false,
    description: 'Cummins-specific seed/key algorithm (CM2450 variant).',
  },
};

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
// NOTE: This runs SERVER-SIDE ONLY. AES keys must never be exposed to the client.

/**
 * GM_5B seed/key computation using AES-128 ECB
 * 
 * Algorithm:
 * 1. Create 16-byte buffer filled with 0xFF
 * 2. Place 5-byte seed at offsets 0x0B through 0x0F
 * 3. AES-128 ECB encrypt with the ECU-specific key
 * 4. Return first 5 bytes of the encrypted result
 * 
 * @param seed - 5-byte seed from ECU
 * @param aesKey - 16-byte AES key specific to the ECU type
 * @returns 5-byte key response
 */
export async function computeGM5B(seed: Uint8Array, aesKey: Uint8Array): Promise<Uint8Array> {
  if (seed.length !== 5) throw new Error(`Invalid seed length: ${seed.length}, expected 5`);
  if (aesKey.length !== 16) throw new Error(`Invalid AES key length: ${aesKey.length}, expected 16`);

  // Build salted seed: 16 bytes of 0xFF with seed at offset 0x0B
  const saltedSeed = new Uint8Array(16);
  saltedSeed.fill(0xFF);
  saltedSeed[0x0B] = seed[0];
  saltedSeed[0x0C] = seed[1];
  saltedSeed[0x0D] = seed[2];
  saltedSeed[0x0E] = seed[3];
  saltedSeed[0x0F] = seed[4];

  // AES-128 ECB encrypt
  // Web Crypto API doesn't directly support ECB, so we use CBC with zero IV
  // For a single 16-byte block, CBC with zero IV is equivalent to ECB
  const cryptoKey = await crypto.subtle.importKey(
    'raw', aesKey.buffer as ArrayBuffer, { name: 'AES-CBC' }, false, ['encrypt']
  );

  const iv = new Uint8Array(16); // zero IV
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv }, cryptoKey, saltedSeed.buffer as ArrayBuffer
  );

  // Return first 5 bytes
  return new Uint8Array(encrypted).slice(0, 5);
}

/**
 * Ford 3-byte LFSR seed/key computation
 * 
 * Algorithm:
 * 1. Combine 3-byte seed with first byte of 5-byte secret
 * 2. Initialize 24-bit LFSR with 0xC541A9
 * 3. Run 32 iterations XORing seed bits into LFSR with specific taps
 * 4. Run 32 more iterations XORing secret bits into LFSR
 * 5. Extract 3-byte key from LFSR state
 * 
 * @param seed - 3-byte seed from ECU
 * @param secret - 5-byte secret constant as Uint8Array [s1, s2, s3, s4, s5]
 * @returns 3-byte key response
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

  // First round: 32 iterations with or_ed_seed
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

  // Second round: 32 iterations with secret bytes
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

  // Extract key from LFSR state
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
 * Get the security profile for an ECU type
 */
export function getSecurityProfile(ecuType: string): EcuSecurityProfile | undefined {
  return ECU_SECURITY_PROFILES[ecuType.toUpperCase()];
}

/**
 * Get a human-readable security summary for display
 */
export function getSecuritySummary(ecuType: string): string {
  const profile = getSecurityProfile(ecuType);
  if (!profile) return `Unknown ECU type: ${ecuType}`;

  const lines = [
    `${profile.name} (${profile.manufacturer})`,
    `Algorithm: ${profile.algorithmType} — ${ALGORITHM_DESCRIPTIONS[profile.algorithmType]}`,
    `Protocol: ${profile.protocol}`,
    `Seed: ${profile.seedLength} bytes → Key: ${profile.keyLength} bytes`,
    `Security Level: ${profile.securityLevel}`,
    profile.requiresUnlockBox ? '⚠ Hardware unlock box REQUIRED' : '✓ Standard security access',
  ];
  return lines.join('\n');
}

/**
 * Utility: convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[\s,0x]/g, '');
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
