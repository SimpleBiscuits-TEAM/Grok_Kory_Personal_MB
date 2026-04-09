/**
 * Field reference for 2021 Sierra/Silverado 6.2L (E90 ECM + matching T93 TCM) SPS/EFI Live
 * calibration layout and PT CAN sniff IDs.
 *
 * Good Gravy datalogging uses ISO-TP on 7E0/7E1 (OBD-II Mode 01 + GM UDS Mode 22), not bin
 * parsing or raw periodic decode unless we add that later.
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
