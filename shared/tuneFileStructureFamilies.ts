import { detectFileFormat } from "./flashFileValidator";

/**
 * Calibration / flash file **layout families** — same vehicle can use different toolchains and on-disk layouts.
 *
 * V-OP flash stack today centers on **DevProg V2** (JSON @ 0x1004, CRC @ 0x1000) and **PPEI IPF** containers;
 * see `shared/knoxKnowledge.ts` and `shared/flashFileValidator.ts`.
 *
 * Other ecosystems (EFI Live, HP Tuners / .hpt, etc.) use different headers, checksum rules, and segment maps.
 * Tune Deploy **strict upload** currently validates only the V-OP container slot CRC + DevProg JSON checks; extend this
 * module with magic-byte sniffers and per-family validators as you add import support.
 */
export const TUNE_FILE_STRUCTURE_FAMILIES = [
  /** DevProg V2–style JSON header (often reported as PPEI_CONTAINER in `detectFileFormat` when flasher fields present). */
  "VOP_DEVPROG_V2",
  /** PPEI IPF magic at 0x0, binary header — same product line, different header than JSON DevProg. */
  "VOP_PPEI_IPF",
  /** Intel HEX — line-oriented; integrity is per-line / per-tool, not 0x1000 CRC. */
  "CAL_INTEL_HEX",
  /** Motorola S-record family. */
  "CAL_SRECORD",
  /** Unstructured or padded raw image — ECU-specific interpretation. */
  "RAW_BINARY",
  /** HP Tuners / VCM Suite style exports — placeholder until we add real signature checks. */
  "HP_TUNERS_HPT",
  /** EFI Live / EFILive / AutoCal style — placeholder until layout detection exists. */
  "EFI_LIVE_EFILIVE",
  /** Known third-party tuner dump not yet split into its own enum. */
  "OTHER_TUNER_TOOL",
  /** GM raw flash binary — 0xAA55 header, part numbers in binary, no V-OP container wrapper. */
  "GM_RAW_BINARY",
  /** Could not classify beyond heuristics. */
  "UNKNOWN",
] as const;

export type TuneFileStructureFamily = (typeof TUNE_FILE_STRUCTURE_FAMILIES)[number];

/** Human-readable map for UI / logs. */
export const TUNE_FILE_STRUCTURE_FAMILY_LABEL: Record<TuneFileStructureFamily, string> = {
  VOP_DEVPROG_V2: "V-OP / DevProg V2 (JSON container)",
  VOP_PPEI_IPF: "V-OP / PPEI IPF container",
  CAL_INTEL_HEX: "Intel HEX (generic)",
  CAL_SRECORD: "Motorola S-record",
  RAW_BINARY: "Raw binary / padded image",
  HP_TUNERS_HPT: "HP Tuners–style (.hpt / VCM — heuristic)",
  EFI_LIVE_EFILIVE: "EFI Live–style (heuristic)",
  OTHER_TUNER_TOOL: "Other tuner tool format",
  GM_RAW_BINARY: "GM raw flash binary (0xAA55)",
  UNKNOWN: "Unknown layout",
};

/**
 * Classify **on-disk layout** (toolchain / envelope). Same ECU/vehicle may use V-OP, EFI Live, HP Tuners, etc.
 * V-OP strict CRC rules apply only to `VOP_*` families; extend with real magic checks for .hpt / EFILive exports.
 */
export function inferTuneFileStructureFamily(
  data: Uint8Array,
  containerLayout: "PPEI" | "DEVPROG" | "GM_RAW" | "UNKNOWN",
  fileName: string
): { family: TuneFileStructureFamily; notes: string[] } {
  const notes: string[] = [];
  const low = fileName.toLowerCase();

  if (containerLayout === "DEVPROG") return { family: "VOP_DEVPROG_V2", notes };
  if (containerLayout === "PPEI") return { family: "VOP_PPEI_IPF", notes };
  if (containerLayout === "GM_RAW") {
    notes.push("GM raw flash binary detected (0xAA55 header). Part numbers extracted from binary content and filename.");
    return { family: "GM_RAW_BINARY", notes };
  }

  if (low.endsWith(".hpt")) {
    notes.push(
      "Filename suggests HP Tuners (.hpt). Layout differs from V-OP containers; add binary signatures before allowing library ingest."
    );
    return { family: "HP_TUNERS_HPT", notes };
  }
  if (/efilive|efi\.live|autocal/i.test(fileName)) {
    notes.push(
      "Filename may indicate EFI Live / AutoCal lineage; checksum and segment layout differ from V-OP DevProg/PPEI."
    );
    return { family: "EFI_LIVE_EFILIVE", notes };
  }

  const det = detectFileFormat(data);
  if (det.format === "INTEL_HEX") {
    notes.push("Intel HEX — use line/segment checksum rules for that toolchain, not container CRC @ 0x1000.");
    return { family: "CAL_INTEL_HEX", notes };
  }
  if (det.format === "S_RECORD") {
    return { family: "CAL_SRECORD", notes };
  }
  if (det.format === "PPEI_CONTAINER" || det.format === "DEVPROG_V2") {
    notes.push(
      "JSON-style container region at 0x1004 detected while primary classifier was ambiguous — treat as V-OP DevProg family for planning."
    );
    return { family: "VOP_DEVPROG_V2", notes };
  }
  if (det.format === 'GM_RAW_BINARY' as string) {
    notes.push(
      "GM raw flash binary detected (0xAA55 header). Part numbers extracted from binary content and filename."
    );
    return { family: "GM_RAW_BINARY", notes };
  }
  if (det.format === 'RAW_BINARY') {
    return { family: "RAW_BINARY", notes };
  }

  notes.push(
    "Same vehicle platforms are often tuned via EFI Live, HP Tuners, V-OP, or OEM tools — each uses a different file structure and checksum model."
  );
  return { family: "UNKNOWN", notes };
}

/** True when Tune Deploy **strict upload** (0x1000 CRC + DevProg JSON checks) is meaningful. */
export function isVopFlashContainerFamily(family: TuneFileStructureFamily): boolean {
  return family === "VOP_DEVPROG_V2" || family === "VOP_PPEI_IPF";
}

/** True when the file is a recognized format that can be ingested into the Tune Deploy library. */
export function isAcceptedForTuneDeployLibrary(family: TuneFileStructureFamily): boolean {
  return family === "VOP_DEVPROG_V2" || family === "VOP_PPEI_IPF" || family === "GM_RAW_BINARY";
}
