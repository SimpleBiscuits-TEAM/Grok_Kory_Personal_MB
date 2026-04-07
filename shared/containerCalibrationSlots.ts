/**
 * Maps calibration part numbers into ContainerFileHeader sw_c1..sw_c9.
 * ECU scan / vehicle match (`compareWithContainer` in client/src/lib/ecuScanner.ts) reads these
 * slots to compare the loaded tune against live ECU calibration IDs — they must be populated for
 * automatic matching when a vehicle connects (same data path as WiFi/BLE cloud transfer prep).
 */
import type { ContainerFileHeader } from "./ecuDatabase";

const SW_KEYS = [
  "sw_c1",
  "sw_c2",
  "sw_c3",
  "sw_c4",
  "sw_c5",
  "sw_c6",
  "sw_c7",
  "sw_c8",
  "sw_c9",
] as const;

export type SwCalibrationKey = (typeof SW_KEYS)[number];

/** Set sw_c1.. from an ordered list (DevProg JSON sw_c* or PPEI header part numbers). */
export function calibrationListToSwFields(parts: string[]): Partial<Pick<ContainerFileHeader, SwCalibrationKey>> {
  const o: Partial<Record<SwCalibrationKey, string>> = {};
  for (let i = 0; i < Math.min(9, parts.length); i++) {
    const p = parts[i]?.trim();
    if (p) o[SW_KEYS[i]!] = p;
  }
  return o;
}

/**
 * Fill only empty sw_c slots using extra detected part numbers (e.g. Tune Deploy / server analyze).
 * Preserves explicit container values so manual tagging still wins.
 */
export function mergeDetectedCalibrationIntoHeader(
  header: ContainerFileHeader,
  detectedParts: string[],
  opts?: { osHintForEmptyFileId?: string | null }
): ContainerFileHeader {
  const out: ContainerFileHeader = { ...header };
  const extras = detectedParts.map((p) => p.trim()).filter((p) => p.length > 0);
  let ei = 0;
  for (const key of SW_KEYS) {
    if (ei >= extras.length) break;
    const cur = out[key];
    const filled = cur != null && String(cur).trim() !== "";
    if (filled) continue;
    (out as Record<string, string>)[key] = extras[ei]!;
    ei++;
  }
  const fid = out.file_id?.trim();
  if ((!fid || fid === "") && opts?.osHintForEmptyFileId?.trim()) {
    out.file_id = opts.osHintForEmptyFileId.trim();
  }
  return out;
}
