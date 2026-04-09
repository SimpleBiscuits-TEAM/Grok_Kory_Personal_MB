/**
 * Shared GM tune / cal .bin heuristics for Tune Deploy (server) and Flash container (client).
 * Aligns detection with `server/lib/tuneDeployParser.ts` GM_RAW rules + filename fallback.
 */

export function hasGmRawHeaderMagic(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0xaa && data[1] === 0x55;
}

/** All 8-digit runs in the full path/filename (underscores OK). */
export function extractGmEightDigitIdsFromFileName(fileName: string): string[] {
  return [...fileName.matchAll(/(\d{8})/g)].map((m) => m[1]!);
}

export function extractGmFilenameOsAndPartNumbers(fileName: string): {
  osNumber: string | null;
  partNumbers: string[];
} {
  const partNumbers = extractGmEightDigitIdsFromFileName(fileName);
  if (partNumbers.length === 0) return { osNumber: null, partNumbers: [] };
  return { osNumber: partNumbers[0]!, partNumbers };
}

/** ECU token at start of basename, e.g. E41_STOCK_… → E41 (full paths OK). */
export function extractEcuTypePrefixFromTuneFileName(fileName: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() || fileName;
  const m = base.match(/^(E\d{1,3}|T\d{1,3}|P\d{1,3}|CV\d+|L5P|LM2|LZ0|MG1[A-Z0-9]*)/i);
  return m ? m[1]!.toUpperCase() : null;
}

/** Eight ASCII digits at 0x20..0x27 (GM raw convention in this codebase). */
export function readGmOsAsciiAtOffset0x20(data: Uint8Array): string | null {
  if (data.length < 0x28) return null;
  const pnStr = new TextDecoder("ascii", { fatal: false }).decode(data.slice(0x20, 0x28));
  return /^\d{8}$/.test(pnStr) ? pnStr : null;
}

/**
 * True when the file does not have V-OP IPF/DevProg layout but naming strongly suggests a GM stock/cal export.
 */
export function shouldInferGmRawFromFilename(fileName: string, byteLength: number): boolean {
  if (byteLength < 0x3000) return false;
  const base = (fileName.replace(/\\/g, "/").split("/").pop() || fileName).trim();
  if (!/\.bin$/i.test(base)) return false;
  const pns = extractGmEightDigitIdsFromFileName(fileName);
  if (pns.length < 2) return false;
  if (/^E\d{1,3}_STOCK_/i.test(base)) return true;
  if (/^E\d{1,3}_/i.test(base) && pns.length >= 4) return true;
  return false;
}

export function isGmRawTuneBinary(data: Uint8Array, fileName?: string): boolean {
  if (hasGmRawHeaderMagic(data)) return true;
  if (fileName && shouldInferGmRawFromFilename(fileName, data.length)) return true;
  return false;
}
