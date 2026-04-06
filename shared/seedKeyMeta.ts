import type { EcuSecurityProfile } from './seedKeyAlgorithms';

/** Public ECU security metadata (no AES secrets) — safe for browser bundles. */
export type EcuSecurityProfileMeta = Omit<EcuSecurityProfile, 'aesKeyHex'>;

export const ECU_SECURITY_META: Record<string, EcuSecurityProfileMeta> = {

  // -- GM Delco ECUs (AES-128 + DLL dual mode) --
  'E41': {
    ecuType: 'E41', name: 'Bosch MG1CS111 (L5P Duramax)',
    manufacturer: 'GM', algorithmType: 'GM_5B_AES',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'AES-128 ECB. 5-byte seed padded to 16 bytes (0xFF fill, seed at offset 0x0B-0x0F), encrypted with ECU-specific AES key, truncated to 5 bytes. Uses GMLAN protocol with seed level 1 (0x27 0x01 / 0x27 0x02).',
    seedSubFunction: 0x01, keySubFunction: 0x02,
  },
  'E88': {
    ecuType: 'E88', name: 'GM-DELCO E88',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL-based for 2-byte seeds. GMLAN protocol with standard security access.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E90': {
    ecuType: 'E90', name: 'GM-DELCO E90',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL-based for 2-byte seeds. Shares AES key with E88/E99.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E99': {
    ecuType: 'E99', name: 'GM-DELCO E99',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: shares AES key with E88/E90. GMLAN protocol.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E92': {
    ecuType: 'E92', name: 'GM-DELCO E92',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x401 for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x401, invertSeed2B: true, invertKey2B: true,
  },
  'E98': {
    ecuType: 'E98', name: 'GM-DELCO E98',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x42B for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x42B, invertSeed2B: true, invertKey2B: true,
  },
  'E80': {
    ecuType: 'E80', name: 'GM-DELCO E80',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x43D for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x43D, invertSeed2B: true, invertKey2B: true,
  },
  'E83': {
    ecuType: 'E83', name: 'GM-DELCO E83',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x3DE for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x3DE, invertSeed2B: true, invertKey2B: true,
  },
  'E78': {
    ecuType: 'E78', name: 'GM-DELCO E78',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x3DB for 2-byte seeds. Shares AES key with E83.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
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
    dllAlgoId: 0xDB, invertSeed2B: true, invertKey2B: true,
  },
  'E46': {
    ecuType: 'E46', name: 'GM-DELCO E46',
    manufacturer: 'GM', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL-based for 2-byte seeds.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
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

  // -- Allison TCM --
  'T87': {
    ecuType: 'T87', name: 'Allison TCM T87',
    manufacturer: 'Allison', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: AES-128 ECB for 5-byte seeds, DLL algo 0x439 for 2-byte seeds. EFILive lock detection with alternate key computation.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
    dllAlgoId: 0x439, invertSeed2B: true, invertKey2B: true,
  },
  'T87A': {
    ecuType: 'T87A', name: 'Allison TCM T87A',
    manufacturer: 'Allison', algorithmType: 'GM_DUAL',
    seedLength: 5, keyLength: 5, securityLevel: 'standard',
    protocol: 'GMLAN', requiresUnlockBox: false,
    description: 'Dual-mode: shares security profile with T87.',
    seedSubFunction: 0x01, keySubFunction: 0x02,
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

  // -- Ford / Bosch ECUs --
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

  // -- Cummins ECUs --
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

export function getSecurityProfileMeta(ecuType: string): EcuSecurityProfileMeta | undefined {
  return ECU_SECURITY_META[ecuType.toUpperCase()];
}

/** True when the app can request a GM AES-derived key from the server (Ford still uses container pri_key or future server secrets). */
export function ecuSupportsServerKeyDerivation(meta: EcuSecurityProfileMeta | undefined): boolean {
  if (!meta || meta.requiresUnlockBox) return false;
  if (meta.algorithmType === 'GM_5B_AES') return true;
  if (meta.algorithmType === 'GM_DUAL' && meta.seedLength === 5) return true;
  return false;
}
