/**
 * GM CAN2000 Read DID reference (GMLAN service 0x1A ReadDataByIdentifier).
 * Used for labels/tooltips in ECU scan — not exhaustive runtime decoding.
 *
 * Conversion types (from OEM table):
 * 0 = ASCII, 1 = BCD, 2 = HEX, 3 = SpecialB6, 4 = Unsigned decimal,
 * 5 = IMA-Codes, 6 = Special Cx, 7 = Signed decimal, default = HEX
 *
 * Full DID list (verbatim reference):
 * ---------------------------------------------------------------------------
 * #################################################################
 * #                     DID table for CAN2000                     #
 * #################################################################
 * # Format description:
 * # DID;name ;conversion type
 * # hex;ascii;decimal
 * # conversion type description:
 * # 0 = ASCII
 * # 1 = BCD
 * # 2 = HEX
 * # 3 = SpecialB6
 * # 4 = Unsigned decimal
 * # 5 = IMA-Codes
 * # 6 = special Cx
 * # 7 = signed decimal
 * # default = HEX
 *
 * (See project history / user-provided OEM table for the complete line-by-line DID listing.)
 * ---------------------------------------------------------------------------
 */

/** Conversion type index from CAN2000 table */
export type GmCan2000ConversionType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface GmDidRefEntry {
  did: number;
  name: string;
  conversion: GmCan2000ConversionType | 'default';
}

/**
 * DIDs touched by {@link ../ecuScanner.ts} GMLAN scan — names match CAN2000 table.
 * C1–CA/C0/CB/CC/D0 follow MEMR/CANR naming; CB/CC are unsigned decimal per table;
 * C1–CA are “special Cx” (type 6); D0 is ASCII (MAIN BOOT AlphaCode).
 */
export const GM_ECUSCAN_DID_REF: Record<number, GmDidRefEntry> = {
  0x90: { did: 0x90, name: 'VINR VIN', conversion: 0 },
  0xb0: { did: 0xb0, name: 'CANR ECU diagnostic address', conversion: 2 },
  0xa0: { did: 0xa0, name: 'OSAR Manufacturers enable counter', conversion: 2 },
  0xc0: { did: 0xc0, name: 'MEMR MAIN BOOT', conversion: 6 },
  0xc1: { did: 0xc1, name: 'MEMR MAIN SOFTWARE', conversion: 6 },
  0xc2: { did: 0xc2, name: 'MEMR VEH SYS Calibration', conversion: 6 },
  0xc3: { did: 0xc3, name: 'MEMR FUEL SYS Calibration', conversion: 6 },
  0xc4: { did: 0xc4, name: 'MEMR VEH SPD Calibration', conversion: 6 },
  0xc5: { did: 0xc5, name: 'MEMR ENG DIAG Calibration', conversion: 6 },
  0xc6: { did: 0xc6, name: 'MEMR ENG Calibration', conversion: 6 },
  0xc7: { did: 0xc7, name: 'MEMR Software module identifier 07', conversion: 6 },
  0xc8: { did: 0xc8, name: 'MEMR Software module identifier 08', conversion: 6 },
  0xc9: { did: 0xc9, name: 'MEMR MPM SOFTWARE', conversion: 6 },
  0xca: { did: 0xca, name: 'MEMR MPM Calibration', conversion: 6 },
  0xcb: { did: 0xcb, name: 'MEMR End model part number', conversion: 4 },
  0xcc: { did: 0xcc, name: 'MEMR Base model part number', conversion: 4 },
  0xd0: { did: 0xd0, name: 'MEMR MAIN BOOT AlphaCode', conversion: 0 },
};

export function gmCan2000DidShortName(did: number): string | undefined {
  return GM_ECUSCAN_DID_REF[did]?.name;
}
