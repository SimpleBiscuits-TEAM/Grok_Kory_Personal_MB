/**
 * Which software calibration slots (C1 = sw_c1 … C9 = sw_c9) participate in tune vs vehicle match.
 * Derived from DevProg-style controller table: `xff` = slot not used; otherwise a DID token is listed.
 * hw_id / VIN / boot / seed columns are not used here — only sw1_id…sw9_id semantics.
 *
 * Encoded as 9-char strings: '1' = compare this slot when present on the container, '0' = ignore.
 */
export const ECU_SOFTWARE_SLOT_MASK: Record<string, string> = {
  // GM Delco-style C1–C6 (GMLAN 0xC1–0xC6), C7–C9 not used
  E41: '111111000',
  E45: '111111000',
  E46: '111111000',
  E88: '111111000',
  E90: '111111000',
  E92: '111111000',
  E98: '111111000',
  E99: '111111000',
  E83: '111111000',
  E80: '111111000',
  E78: '111111000',
  E86: '111111000',
  E67: '111111000',
  E87: '111111000',
  E39: '111111000',
  E39A: '111111000',
  E01: '111111000',

  E35A: '111111111',
  E35B: '111111111',

  DELCO52: '111111000',
  DELPHI1: '110000000',
  DENSO100: '111000000',

  // Bosch / Cummins / Ford (table rows — slot count varies)
  CM2350B: '100000000',
  CM2450B: '100000000',
  EDC17CP05: '100000000',
  EDC17CP65: '100000000',
  EMS24XX: '100000000',
  MD1CP006: '100000000',
  MD1CP062: '100000000',
  MEDG17: '100000000',
  MED17810: '100000000',
  MG1CS015: '100000000',
  MG1CS018: '100000000',
  MG1CS019: '100000000',
  MG1CA007: '110000000',
  MG1CA920: '110000000',

  EDC16C39: '111100000',
  EDC16C9: '111100000',
  EDC16C39A: '110000000',
  EDC16C39B: '110000000',

  EDC17C19: '111000000',
  EDC17C59: '111000000',
  EDC17CP47: '111000000',
  EDC17C18: '111000000',

  ME155: '111100000',
  ME17CA1: '100000000',
  ME311: '111000000',
  ME761: '111000000',
  ME762: '111000000',
  ME763: '111000000',
  ME764: '111000000',
  ME799: '111000000',
  ME91: '111000000',
  ME96: '111000000',
  ME961: '110000000',
  ME962: '110000000',

  SIMTEC71: '111100000',
  SIMTEC75A: '111100000',
  SIMTEC75B: '111100000',
  SIMTEC76: '111000000',
  SIMTEC_CAN: '111100000',
  TRIONIC8: '111100000',

  VME17P1: '100000000',
  MIT21175: '100000000',

  // Allison / TCU — software columns from table (where not xff)
  TCUT14: '110000000',
  /** Table + app DB both use T87 / T87A / TCUT87* for Allison */
  TCUT87: '111100000',
  TCUT87A: '111100000',
  T87: '111100000',
  T87A: '111100000',
  TCUAS69RC: '100000000',
};

/** Map alternate `ecu_type` strings to mask keys above. */
const ECU_TYPE_ALIASES: Record<string, string> = {
  ALLISON_T87: 'T87',
};

function normalizeEcuTypeKey(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Returns 9 booleans — true means this C-slot is relevant for identity match for this controller.
 * `null` = unknown profile; caller may fall back to “all non-empty container slots”.
 */
export function softwareSlotMaskForEcuType(ecuType: string | null | undefined): boolean[] | null {
  if (ecuType == null || ecuType === '') return null;
  let key = normalizeEcuTypeKey(ecuType);
  const alias = ECU_TYPE_ALIASES[key];
  if (alias) key = alias;

  let mask = ECU_SOFTWARE_SLOT_MASK[key];
  if (!mask && key.includes('(')) {
    const short = key.replace(/\([^)]*\)/g, '').trim();
    mask = ECU_SOFTWARE_SLOT_MASK[short];
  }
  if (!mask) return null;
  if (mask.length !== 9) return null;
  return [...mask].map(c => c === '1');
}

export function activeSoftwareSlotIndices(ecuType: string | null | undefined): number[] | null {
  const m = softwareSlotMaskForEcuType(ecuType);
  if (!m) return null;
  const ix: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (m[i]) ix.push(i);
  }
  return ix.length > 0 ? ix : null;
}
