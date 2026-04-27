/**
 * Field reference for 2021 Sierra/Silverado 6.2L (E90 ECM + matching T93 TCM) SPS/EFI Live
 * calibration layout and PT CAN sniff IDs.
 *
 * Good Gravy datalogging uses ISO-TP on 7E0/7E8 (ECM) + 7E2/7EA (TCM) via UDS $22.
 * CRITICAL: On 2019+ Global B trucks, TCM responds on 7E2/7EA, NOT 7E1/7E9.
 * 7E1/7E9 is the Allison/6L80 address used on older GMT900/K2XX platforms.
 *
 * Verified DID inventory (from BUSMASTER passive sniff + EFI Live V8 CSV export):
 * - ECM: 30 DIDs on 7E0 (20 standard J1979 + 10 GM-specific extended)
 * - TCM: 58 DIDs on 7E2 (T93 10L80/10L90 10-speed)
 * - Total: 88 unique DIDs polled per cycle
 * See obdConnection.ts GM_EXTENDED_PIDS for full definitions and formulas.
 *
 * **Tune Deploy / Flash library:** The same calibration binaries (SPS segments, EFI Live merged `E90-…` / `T93-…`
 * exports, GM 0xAA55 raw images) are ingested via `shared/tuneFileStructureFamilies.ts` + `server/lib/tuneDeployParser.ts`,
 * which infer **GM** + **E90** / **T93** metadata from filenames and embedded OS part numbers. Keep this file in sync
 * when you add OS or segment PNs for new model years.
 *
 * **A2L (future):** When an A2L exists for a given OS/cal combination, it can tie map addresses to human-readable
 * names and RAM for the editor / live patch path; CAN IDs below remain useful for bus captures independent of A2L.
 *
 * PT CAN list source: BUSMASTER passive sniff (KOER, no EFI polling).
 *
 * **Sniff → PID / periodic inference:** To align diagnostic traffic with changing periodic frames, use
 * `shared/canSniffObdInference.ts` (`inferFromCanSniffCsv`) on CSV exports where columns are
 * `timeMs,idHex,dlc,byte0,...`. It extracts Mode 01 / UDS $22 timing and suggests which PT-CAN IDs may embed
 * the same raw bytes as a known response (hints only — confirm with DBC/A2L).
 */
export const E90_PT_CAN_RX_IDS_OBSERVED_SORTED: readonly number[] = [
  0xaa, 0xbe, 0xc1, 0xc5, 0xc7, 0xc9, 0xd0, 0xd1, 0xd3, 0xf1, 0xf9, 0x120, 0x121, 0x124,
  0x12a, 0x130, 0x135, 0x137, 0x139, 0x140, 0x142, 0x148, 0x149, 0x14b, 0x160, 0x170, 0x17d,
  0x180, 0x182, 0x184, 0x189, 0x18e, 0x191, 0x197, 0x19d, 0x1a1, 0x1a3, 0x1a6, 0x1aa, 0x1af,
  0x1ba, 0x1c3, 0x1c4, 0x1c5, 0x1c6, 0x1c7, 0x1c8, 0x1cc, 0x1ce, 0x1cf, 0x1df, 0x1e1, 0x1e5,
  0x1e7, 0x1e9, 0x1ed, 0x1f1, 0x1f3, 0x1f4, 0x1f5, 0x1f8, 0x1fc, 0x210, 0x214, 0x216, 0x22a,
  0x230, 0x232, 0x233, 0x234, 0x235, 0x237, 0x239, 0x23d, 0x260, 0x261, 0x262, 0x263, 0x264,
  0x265, 0x287, 0x2c3, 0x2cb, 0x2cd, 0x2da, 0x2f9, 0x320, 0x321, 0x324, 0x32a, 0x348, 0x34a,
  0x34c, 0x350, 0x365, 0x370, 0x3c1, 0x3c7, 0x3c9, 0x3cf, 0x3d1, 0x3d3, 0x3d9, 0x3e9, 0x3ed,
  0x3f1, 0x3f3, 0x3f5, 0x3f9, 0x3fb, 0x3fc, 0x409, 0x40a, 0x40d, 0x451, 0x4a3, 0x4ab, 0x4c1,
  0x4c5, 0x4c7, 0x4c9, 0x4d1, 0x4d4, 0x4e1, 0x4e9, 0x4eb, 0x4ed, 0x4ef, 0x4f1, 0x4f3, 0x4f4,
  0x4f7, 0x4f9, 0x4ff, 0x500, 0x510, 0x514, 0x52a, 0x52b, 0x530, 0x589, 0x772, 0x773, 0x778,
  0x77a, 0x77e, 0x77f, 0x78a,
] as const;

/**
 * 2021 GMC Sierra 1500 (E90 ECM) — SPS / EFI Live style segment layout (April 2025 pull).
 * Full `.bin` images are large and stay outside the repo; this records part numbers and map
 * addresses for calibration tooling or docs. Datalogger behavior remains OBD/UDS-only unless
 * we add explicit bin parsing later.
 *
 * Typical local layout (user machine):
 * `...\2021 SIERRA 1500 E90 SPS FILES 4.1.25\ECM\BinFiles\`
 * - `01-12716900_Main Operating System.bin` (~6.75 MB) + `_sig.bin`
 * - `02-12704364_System.bin` … `06-12712524_Engine Operation.bin` + signatures
 * - `E90-12716900_EFILive_Editable.bin` (~8 MB merged)
 * - `E90-12716900_segment_map.txt` (Source/Bin/Chip/Length lines)
 */
export const E90_OS_CALIBRATION_ID = '12716900' as const;

/** SPS segment row (index + GM part number + label). Source/Bin/Chip/Length: see `*_segment_map.txt` beside bins. */
export interface GmSpsSegmentMeta {
  index: string;
  name: string;
  partNumber: string;
}

/** E90 ECM — order matches SPS segment index. */
export const E90_SPS_SEGMENTS_2021_SIERRA: readonly GmSpsSegmentMeta[] = [
  { index: '01', name: 'Main Operating System', partNumber: '12716900' },
  { index: '02', name: 'System', partNumber: '12704364' },
  { index: '03', name: 'Fuel System', partNumber: '12712577' },
  { index: '04', name: 'Speedometer', partNumber: '12692465' },
  { index: '05', name: 'Engine Diagnostic', partNumber: '12712575' },
  { index: '06', name: 'Engine Operation', partNumber: '12712524' },
] as const;

/**
 * T93 TCM — same 2021 Sierra 1500 6.2L SPS pull (`...\TCM\BinFiles\`).
 * - `01-24044027_Operating System.bin` (~3.75 MB) + `_sig.bin`
 * - `02-24054706_Transmission.bin` (~1.9 MB) + `_sig.bin`
 * - `T93-24044027_EFILive_Editable.bin` (~6.5 MB merged)
 * - `T93-24044027_segment_map.txt`
 */
export const T93_OS_CALIBRATION_ID = '24044027' as const;

export const T93_SPS_SEGMENTS_2021_SIERRA: readonly GmSpsSegmentMeta[] = [
  { index: '01', name: 'Operating System', partNumber: '24044027' },
  { index: '02', name: 'Transmission', partNumber: '24054706' },
] as const;

/**
 * Verified ECM DIDs observed on 7E0→7E8 during EFI Live V8 logging session.
 * Source: BUSMASTER passive sniff (BUSMASTERLogFile_efilog.log)
 * These are the exact DIDs EFI Live polls — 20 standard J1979 + 10 GM-specific.
 */
export const E90_ECM_DIDS_VERIFIED: readonly number[] = [
  // Standard J1979 PIDs (requested via UDS $22, not Mode 01)
  0x0004, 0x0005, 0x000B, 0x000C, 0x000D, 0x000E, 0x000F, 0x0010,
  0x0011, 0x0023, 0x0045, 0x0046, 0x0047, 0x0049, 0x004A, 0x004C,
  0x005C, 0x0061, 0x0062, 0x0063,
  // GM-specific extended DIDs
  0x119C, 0x12DA, 0x131F, 0x1470, 0x2012, 0x204D, 0x208A, 0x248B,
  0x308A, 0x328A,
] as const;

/** EFI Live CSV column names mapped to ECM DIDs (for log import/correlation). */
export const E90_ECM_DID_NAMES: Record<number, string> = {
  0x0004: 'ECM.LOAD_PCT',
  0x0005: 'ECM.ECT',
  0x000B: 'ECM.MAP',
  0x000C: 'ECM.RPM',
  0x000D: 'ECM.VSS',
  0x000E: 'ECM.SPARKADV',
  0x000F: 'ECM.IAT',
  0x0010: 'ECM.MAF',
  0x0011: 'ECM.TP',
  0x0023: 'ECM.FRP_C',
  0x0045: 'ECM.TTQRL',
  0x0046: 'ECM.AAT',
  0x0047: 'ECM.TP_B',
  0x0049: 'ECM.APP_D',
  0x004A: 'ECM.APP',
  0x004C: 'ECM.TAC_PCT',
  0x005C: 'ECM.EOT_B',
  0x0061: 'ECM.TQ_DD',
  0x0062: 'ECM.TQ_ACT',
  0x0063: 'ECM.TQ_REF',
  0x119C: 'ECM.ENGOILP',
  0x12DA: 'ECM.MAFFREQ2',
  0x131F: 'ECM.FRPDI',
  0x1470: 'ECM.MAPU',
  0x2012: 'ECM.TCDBPR',
  0x204D: 'ECM.APP_E',
  0x208A: 'ECM.TTQRET',
  0x248B: 'ECM.TP_R',
  0x308A: 'ECM.TCTQRLR',
  0x328A: 'ECM.AFMIR2',
} as const;

/**
 * Verified TCM DIDs observed on 7E2→7EA during EFI Live V8 logging session.
 * Source: BUSMASTER passive sniff (BUSMASTERLogFile_efilog.log)
 * T93 10-speed (10L80/10L90) — 58 DIDs total.
 */
export const T93_TCM_DIDS_VERIFIED: readonly number[] = [
  0x1940, 0x1941, 0x1942, 0x194C, 0x194F, 0x195B, 0x195D, 0x1124,
  0x197E, 0x1991, 0x1141, 0x1992, 0x1993, 0x1994, 0x1995, 0x199A,
  0x19A1, 0x19D4,
  // Shift timing
  0x1232, 0x1233, 0x1234, 0x1235, 0x1236, 0x1237,
  // Solenoid pressure control
  0x2809, 0x280A, 0x280C, 0x280F, 0x2810, 0x2811,
  // Solenoid on-state
  0x2812, 0x2813, 0x2814, 0x2815, 0x2816, 0x2817,
  // Current control
  0x2818, 0x2819, 0x281A,
  // Status / control
  0x281B, 0x281C, 0x2820, 0x2821, 0x2822, 0x2823, 0x2824,
  // Diagnostics
  0x1A01, 0x1A18, 0x1A1F, 0x1A26, 0x1A2D, 0x1A88,
  0x2804, 0x2805, 0x2806, 0x321B, 0x1238, 0x1239,
] as const;

/** EFI Live CSV column names mapped to TCM DIDs. */
export const T93_TCM_DID_NAMES: Record<number, string> = {
  0x1940: 'TCM.TFT',
  0x1941: 'TCM.TISS',
  0x1942: 'TCM.TOSS',
  0x194C: 'TCM.TCCSLIP',
  0x194F: 'TCM.TCCP',
  0x195B: 'TCM.TCSLIP',
  0x195D: 'TCM.TCCSERR',
  0x1124: 'TCM.GEAR',
  0x197E: 'TCM.TURBINE',
  0x1991: 'TCM.VOLTS',
  0x1141: 'TCM.PRNDL',
  0x1992: 'TCM.DTRATIO',
  0x1993: 'TCM.TCRATIO',
  0x1994: 'TCM.BOXRATIO',
  0x1995: 'TCM.MGRATIO',
  0x199A: 'TCM.TRQENG',
  0x19A1: 'TCM.TCSR',
  0x19D4: 'TCM.TCCRS',
  0x1232: 'TCM.SHIFT12',
  0x1233: 'TCM.SHIFT23',
  0x1234: 'TCM.SHIFT34',
  0x1235: 'TCM.SHIFT45',
  0x1236: 'TCM.SHIFT56',
  0x1237: 'TCM.SHIFTLAST',
  0x2809: 'TCM.PCS1CP',
  0x280A: 'TCM.PCS2CP',
  0x280C: 'TCM.PCS3CP',
  0x280F: 'TCM.PCS4CP',
  0x2810: 'TCM.PCS5CP',
  0x2811: 'TCM.TCCPCSCP',
  0x2812: 'TCM.PCS1OS',
  0x2813: 'TCM.PCS2OS',
  0x2814: 'TCM.PCS3OS',
  0x2815: 'TCM.PCS4OS',
  0x2816: 'TCM.PCS5OS',
  0x2817: 'TCM.TCCPCSOS',
  0x2818: 'TCM.HSD1CC',
  0x2819: 'TCM.HSD2CC',
  0x281A: 'TCM.TCCECC',
  0x281B: 'TCM.TCCS',
  0x281C: 'TCM.BRKR',
  0x2820: 'TCM.TBASEPAT',
  0x2821: 'TCM.ACCEP',
  0x2822: 'TCM.TPOC',
  0x2823: 'TCM.TFFFP',
  0x2824: 'TCM.TRVSS',
  0x1A01: 'TCM.TUDSTATE',
  0x1A18: 'TCM.WUEMPASS',
  0x1A1F: 'TCM.WUPASS',
  0x1A26: 'TCM.ODOCLR',
  0x1A2D: 'TCM.ODOFIRST',
  0x1A88: 'TCM.ODOLAST',
  0x2804: 'TCM.FFCOUNT',
  0x2805: 'TCM.FFPASS',
  0x2806: 'TCM.FFNOTRUN',
  0x321B: 'TCM.FASTLRN',
  0x1238: 'TCM.TCPS',
  0x1239: 'TCM.DISTTRV',
} as const;

/**
 * PT-CAN arbitration IDs that appear ONLY when EFI Live is actively polling.
 * These 19 IDs are absent from the KOER baseline and represent diagnostic + EFI Live traffic.
 * Useful for detecting whether an EFI Live session is active on the bus.
 */
export const E90_EFI_LIVE_ONLY_IDS: readonly number[] = [
  0x5E8, 0x5EA,  // High-rate EFI Live broadcast (~4000 frames each)
  0x641, 0x642, 0x643, 0x644, 0x645, 0x646, 0x647, 0x648,
  0x649, 0x64A, 0x64B, 0x64C, 0x64D, 0x64E, 0x64F,  // EFI Live init/config
  0x7E0, 0x7E2,  // Diagnostic request IDs (ECM + TCM)
] as const;
