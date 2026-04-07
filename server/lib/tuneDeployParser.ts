/**
 * Heuristic calibration / OS metadata extraction from flash binaries.
 * Extend with OEM-specific decoders (GM DID, Bosch EPK, etc.) as you add coverage.
 */
import { Buffer } from "node:buffer";
import { CONTAINER_LAYOUT, getEcuConfig } from "../../shared/ecuDatabase";
import {
  extractEcuTypePrefixFromTuneFileName,
  extractGmFilenameOsAndPartNumbers,
  hasGmRawHeaderMagic,
  readGmOsAsciiAtOffset0x20,
  shouldInferGmRawFromFilename,
} from "../../shared/gmTuneBinaryHeuristics";
import { inferTuneFileStructureFamily } from "../../shared/tuneFileStructureFamilies";
import type { TuneDeployParsedMetadata } from "../../shared/tuneDeploySchemas";
import { extractOSNumber, extractBinaryMetadata } from "./osNumberExtractor";

const SCAN_CAP = 4 * 1024 * 1024;

function parseDevProgHeader(headerBytes: Uint8Array): Record<string, unknown> | null {
  try {
    let end = headerBytes.indexOf(0);
    if (end === -1) end = headerBytes.length;
    const jsonStr = new TextDecoder("ascii").decode(headerBytes.slice(0, end));
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function detectContainerFormat(data: Uint8Array): "PPEI" | "DEVPROG" | "GM_RAW" | "UNKNOWN" {
  // PPEI IPF magic: 0x49 0x50 0x46 ("IPF")
  if (data.length >= 3 && data[0] === 0x49 && data[1] === 0x50 && data[2] === 0x46) {
    return "PPEI";
  }
  // DevProg V2: JSON header at HEADER_OFFSET
  if (data.length >= CONTAINER_LAYOUT.HEADER_OFFSET + 100) {
    const headerSlice = data.slice(
      CONTAINER_LAYOUT.HEADER_OFFSET,
      CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE
    );
    const parsed = parseDevProgHeader(headerSlice);
    if (parsed && typeof parsed === "object" && ("ecu_type" in parsed || "block_count" in parsed)) {
      return "DEVPROG";
    }
  }
  if (data.length >= 0x30 && hasGmRawHeaderMagic(data)) {
    return "GM_RAW";
  }
  return "UNKNOWN";
}

function extractAsciiStrings(buf: Buffer, maxLen = SCAN_CAP): string {
  const slice = buf.subarray(0, Math.min(buf.length, maxLen));
  let out = "";
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i]!;
    if (b >= 0x20 && b <= 0x7e) {
      out += String.fromCharCode(b);
    } else {
      out += " ";
    }
  }
  return out;
}

function uniqueStrings(items: string[], max = 24): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (s.length < 4) continue;
    const key = s.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Known ECU tokens → folder + compatibility hints (expand over time). */
function inferVehicleFromEcu(ecuType: string | null | undefined): Pick<
  TuneDeployParsedMetadata,
  "vehicleFamily" | "vehicleSubType" | "vehicleCompatibilityLabel" | "modelYearStart" | "modelYearEnd" | "modelYear"
> {
  const t = (ecuType || "").toUpperCase();

  if (t.includes("L5P") || t.includes("CV9") || t.includes("E41")) {
    return {
      vehicleFamily: "Duramax",
      vehicleSubType: t.includes("L5P") ? "L5P" : "E41",
      vehicleCompatibilityLabel: "GM HD 6.6L L5P / related (typ. 2017–2024 — verify with VIN)",
      modelYear: null,
      modelYearStart: 2017,
      modelYearEnd: 2024,
    };
  }
  if (t.includes("MG1CA920") || t.includes("CA920")) {
    return {
      vehicleFamily: "Can-Am",
      vehicleSubType: "MG1CA920",
      vehicleCompatibilityLabel: "Can-Am / Rotax (year varies — use VIN decode when connected)",
      modelYear: null,
      modelYearStart: null,
      modelYearEnd: null,
    };
  }
  if (t.includes("LM2") || t.includes("LZ0")) {
    return {
      vehicleFamily: "GM",
      vehicleSubType: t.includes("LZ0") ? "LZ0" : "LM2",
      vehicleCompatibilityLabel: "GM 3.0L Duramax (LM2/LZ0 family — verify application)",
      modelYear: null,
      modelYearStart: 2020,
      modelYearEnd: null,
    };
  }

  return {
    vehicleFamily: "Unknown",
    vehicleSubType: ecuType?.slice(0, 32) || "general",
    vehicleCompatibilityLabel: ecuType
      ? `ECU type ${ecuType} — run VIN decode when vehicle is connected for Y/M/M/E.`
      : "Unknown vehicle — connect vehicle or add manual tags in a future revision.",
    modelYear: null,
    modelYearStart: null,
    modelYearEnd: null,
  };
}

function extractPartNumbersFromText(text: string): string[] {
  const found: string[] = [];
  // GM-style calibration IDs
  for (const m of text.matchAll(/\b126[0-9]{5}\b/g)) found.push(m[0]!);
  // Another common GM pattern
  for (const m of text.matchAll(/\b12[56][0-9]{6}\b/g)) found.push(m[0]!);
  // Bosch / VAG style (loose)
  for (const m of text.matchAll(/\b0[78][0-9]{7}\b/g)) found.push(m[0]!);
  // Alphanumeric tokens that look like PNs (conservative)
  for (const m of text.matchAll(/\b[A-Z0-9]{10,14}\b/g)) {
    const s = m[0]!;
    if (/[0-9]/.test(s) && /[A-Z]/.test(s)) found.push(s);
  }
  return uniqueStrings(found);
}

/**
 * Parse binary buffer and return structured metadata for storage & UI.
 */
export function parseTuneDeployBinary(buffer: Buffer, originalFileName: string): TuneDeployParsedMetadata {
  const warnings: string[] = [];
  const data = new Uint8Array(buffer);
  const hasGmRawMagic = hasGmRawHeaderMagic(data);
  let format = detectContainerFormat(data);
  if (format === "UNKNOWN" && shouldInferGmRawFromFilename(originalFileName, buffer.length)) {
    format = "GM_RAW";
  }

  let ecuType: string | null = null;
  let ecuHardwareId: string | null = null;
  let vin: string | null = null;
  let headerOsHint: string | null = null;

  if (format === "DEVPROG") {
    const headerSlice = data.slice(
      CONTAINER_LAYOUT.HEADER_OFFSET,
      CONTAINER_LAYOUT.HEADER_OFFSET + CONTAINER_LAYOUT.HEADER_SIZE
    );
    const header = parseDevProgHeader(headerSlice);
    if (header) {
      ecuType = String(header.ecu_type || "") || null;
      ecuHardwareId = String(header.hardware_number || "") || null;
      vin = String(header.vin || "") || null;
      const fid = String(header.file_id || "").trim();
      if (fid) headerOsHint = fid;
    } else {
      warnings.push("DevProg header region present but JSON parse failed.");
    }
  }

  if (format === "PPEI") {
    const ecuField = new TextDecoder("ascii").decode(data.slice(0x400, 0x440)).replace(/\0/g, "").trim();
    ecuType = ecuField || null;
  }

  // GM raw flash binary: extract OS from binary offset 0x20 and part numbers from filename
  if (format === "GM_RAW") {
    const binaryOs = readGmOsAsciiAtOffset0x20(data);
    const filenameParts = extractGmFilenameOsAndPartNumbers(originalFileName);
    const filenameEcu = extractEcuTypePrefixFromTuneFileName(originalFileName);

    // OS number: prefer binary offset 0x20, fallback to first filename PN
    headerOsHint = binaryOs || filenameParts.osNumber;

    // ECU type from filename (e.g. E41)
    if (filenameEcu && !ecuType) {
      ecuType = filenameEcu;
    }
  }

  const ecuConfig = ecuType ? getEcuConfig(ecuType) : undefined;

  const { osNumber } = extractBinaryMetadata(buffer);
  // For GM raw binaries, prefer the OS from offset 0x20 (headerOsHint) over
  // the generic extractBinaryMetadata which may pick up garbage ASCII.
  let osVersion = format === "GM_RAW"
    ? (headerOsHint || osNumber)
    : (osNumber || headerOsHint);

  const ascii = extractAsciiStrings(buffer);
  let calibrationPartNumbers = extractPartNumbersFromText(ascii);

  // For GM raw binaries, merge filename part numbers into the list
  if (format === "GM_RAW") {
    const filenameParts = extractGmFilenameOsAndPartNumbers(originalFileName);
    if (filenameParts.partNumbers.length > 0) {
      calibrationPartNumbers = uniqueStrings([...filenameParts.partNumbers, ...calibrationPartNumbers]);
    }
    // Ensure the OS from binary offset 0x20 is in the list
    const binaryOs = readGmOsAsciiAtOffset0x20(data);
    if (binaryOs) {
      calibrationPartNumbers = uniqueStrings([binaryOs, ...calibrationPartNumbers]);
      if (!osVersion) osVersion = binaryOs;
    }
  }

  if (headerOsHint && /^\d+$/.test(headerOsHint) && headerOsHint.length >= 8) {
    calibrationPartNumbers = uniqueStrings([headerOsHint, ...calibrationPartNumbers]);
  }

  const inferred = inferVehicleFromEcu(ecuType || ecuConfig?.ecuType);

  if (format === "GM_RAW" && !hasGmRawMagic) {
    warnings.push(
      "GM raw inferred from filename and GM 8-digit part numbers (file does not start with 0xAA55). Common for some EFI Live / third-party exports; verify before flash."
    );
  }

  if (format === "UNKNOWN") {
    warnings.push(
      "Container format not recognized as PPEI or DevProg; OS/part numbers are heuristic-only."
    );
  }
  if (!osVersion && calibrationPartNumbers.length === 0) {
    warnings.push("No OS string or part numbers detected — manual verification recommended.");
  }

  const structure = inferTuneFileStructureFamily(data, format, originalFileName);

  return {
    containerFormat: format === "UNKNOWN" ? "RAW" : format,
    fileStructureFamily: structure.family,
    fileStructureNotes: structure.notes,
    osVersion: osVersion || null,
    calibrationPartNumbers,
    ecuType: ecuType || ecuConfig?.ecuType || null,
    ecuHardwareId,
    vehicleFamily: inferred.vehicleFamily,
    vehicleSubType: inferred.vehicleSubType,
    modelYear: inferred.modelYear,
    modelYearStart: inferred.modelYearStart,
    modelYearEnd: inferred.modelYearEnd,
    vehicleCompatibilityLabel: inferred.vehicleCompatibilityLabel,
    vin: vin && vin.length >= 11 ? vin : null,
    warnings,
  };
}

export function buildTuneDeployObjectKey(meta: TuneDeployParsedMetadata, uniqueId: string, fileName: string): string {
  const slug = (s: string) =>
    s
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "unknown";
  const family = slug(meta.vehicleFamily);
  const sub = slug(meta.vehicleSubType);
  const year =
    meta.modelYear ??
    meta.modelYearStart ??
    meta.modelYearEnd ??
    "unknown";
  const safeName = slug(fileName.replace(/\.[^.]+$/, "")).slice(0, 80);
  return `tune-deploy/${family}/${sub}/${year}/${uniqueId}_${safeName}.bin`;
}
