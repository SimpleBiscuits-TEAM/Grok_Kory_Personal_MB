/**
 * Container JSON extraction — parity with **`DevProgFlashFile.Create` (CONTAINER branch)** in
 * **@devprog** → `C:\Users\Tobi2\source\repos\EDS_DevProg_V2_MAUI\EDS_DevProg_V2_MAUI\Models\App\DevProgFlashFile.cs`.
 *
 * Behavior mirrored from that C# project:
 * - CRC32: 4 bytes at **0x1000** (big-endian on disk after `Array.Reverse` in C#)
 * - `header_length`: first **0x30** bytes from **0x1000**, ASCII, NUL-stripped, find `header_length":"`,
 *   then **10** character hex substring (`Utils\Utilities.GetIndexOfStringEnd`)
 * - JSON payload: **header_length − 4** bytes from **0x1004**
 * - Deserialize like DevProg `JsonSerializerOptions`: case-insensitive names, allow trailing commas
 *
 * Extra JS fallbacks (regex / wider scan / `stripTrailingCommasLooseJson`) only if the strict
 * DevProg-sized window does not contain `header_length`.
 */

import { CONTAINER_LAYOUT } from './ecuDatabase';

/** Same probe size as @devprog `DevProgFlashFile.Create` (`tmpbuf` at 0x1000). */
const DEVPROG_HEADER_LENGTH_PROBE = 0x30;

/** Backend download path uses 0x200 for the same search — fallback after strict probe. */
const HEADER_LENGTH_SCAN_MAX = 0x200;

/** Exact token in @devprog `DevProgFlashFile` + `Utilities.GetIndexOfStringEnd` (same repo). */
const DEVPROG_HEADER_LENGTH_KEY = 'header_length":"';

export function stripDevProgJsonNulPadding(s: string): string {
  return s.replace(/\0/g, '');
}

export function stripTrailingCommasLooseJson(s: string): string {
  let out = s;
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/,(\s*)([}\]])/g, '$1$2');
  }
  return out;
}

function parseDevProgHeaderLengthTenCharHex(tmplenstr: string, indexAfterKey: number): number | null {
  if (indexAfterKey < 0 || indexAfterKey + 10 > tmplenstr.length) return null;
  const ten = tmplenstr.substring(indexAfterKey, indexAfterKey + 10).trim();
  const v = parseInt(ten.replace(/^0x/i, ''), 16);
  if (!Number.isFinite(v)) return null;
  return v;
}

function readDevProgHeaderTotalLengthRegexFallback(data: Uint8Array): number | null {
  if (data.length < CONTAINER_LAYOUT.HEADER_OFFSET) return null;
  const scanEnd = Math.min(data.length, CONTAINER_LAYOUT.CRC32_OFFSET + HEADER_LENGTH_SCAN_MAX);
  const chunk = data.subarray(CONTAINER_LAYOUT.CRC32_OFFSET, scanEnd);
  const s = new TextDecoder('latin1', { fatal: false }).decode(chunk).replace(/\0/g, '');
  const m = s.match(/"header_length"\s*:\s*"(0[xX][0-9a-fA-F]+)"/);
  if (!m) return null;
  const v = parseInt(m[1].replace(/^0x/i, ''), 16);
  if (!Number.isFinite(v) || v < CONTAINER_LAYOUT.HEADER_OFFSET) return null;
  if (v > data.length) return null;
  return v;
}

/**
 * Total span from 0x1000 through end of header slot (includes 4-byte CRC) = JSON `header_length`.
 * See @devprog `DevProgFlashFile.Create(FileResult?, ECU)` CONTAINER branch (path in file header above).
 */
export function readDevProgHeaderTotalLengthFrom0x1000(data: Uint8Array): number | null {
  if (data.length < CONTAINER_LAYOUT.CRC32_OFFSET + DEVPROG_HEADER_LENGTH_PROBE) return null;

  const strictChunk = data.subarray(
    CONTAINER_LAYOUT.CRC32_OFFSET,
    CONTAINER_LAYOUT.CRC32_OFFSET + DEVPROG_HEADER_LENGTH_PROBE,
  );
  const tmplenstr = new TextDecoder('latin1', { fatal: false }).decode(strictChunk).replace(/\0/g, '');
  const keyAt = tmplenstr.indexOf(DEVPROG_HEADER_LENGTH_KEY);
  const indexAfterKey = keyAt >= 0 ? keyAt + DEVPROG_HEADER_LENGTH_KEY.length : -1;
  let v = indexAfterKey >= 0 ? parseDevProgHeaderLengthTenCharHex(tmplenstr, indexAfterKey) : null;

  if (v == null || !Number.isFinite(v)) {
    v = readDevProgHeaderTotalLengthRegexFallback(data);
  }

  if (v == null || !Number.isFinite(v) || v < CONTAINER_LAYOUT.HEADER_OFFSET) return null;
  if (v > data.length) return null;
  return v;
}

/** First `{` in range — skip UTF-8 BOM / garbage before JSON. */
function subarrayFromFirstBrace(data: Uint8Array, start: number, end: number): Uint8Array {
  const slice = data.subarray(start, Math.min(data.length, end));
  const brace = slice.indexOf(0x7b);
  if (brace <= 0) return slice;
  return slice.subarray(brace);
}

function prepareContainerJsonText(rawBytes: Uint8Array): string | null {
  let s = new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
  s = stripDevProgJsonNulPadding(s);
  s = stripTrailingCommasLooseJson(s);
  const t = s.trim();
  if (!t.startsWith('{')) return null;
  return s;
}

/**
 * DevProg: read `header_length - 4` bytes from 0x1004; if unknown, use full 0x1FFC window.
 */
export function extractDevProgContainerJsonText(data: Uint8Array): string | null {
  if (data.length < CONTAINER_LAYOUT.HEADER_OFFSET + 8) return null;

  const totalFrom1000 = readDevProgHeaderTotalLengthFrom0x1000(data);
  const jsonByteLen = totalFrom1000 != null
    ? totalFrom1000 - CONTAINER_LAYOUT.CRC32_SIZE
    : CONTAINER_LAYOUT.HEADER_SIZE;

  const start = CONTAINER_LAYOUT.HEADER_OFFSET;
  const end = start + Math.min(jsonByteLen, Math.max(0, data.length - start));
  const raw = subarrayFromFirstBrace(data, start, end);
  return prepareContainerJsonText(raw);
}

/** If primary extract fails, scan 0x1004..0x3000 for `{` and take until capacity (DevProg max slot). */
export function extractDevProgContainerJsonTextFallback(data: Uint8Array): string | null {
  if (data.length < CONTAINER_LAYOUT.HEADER_OFFSET + 4) return null;
  const start = CONTAINER_LAYOUT.HEADER_OFFSET;
  const cap = Math.min(
    CONTAINER_LAYOUT.DATA_OFFSET - start,
    data.length - start,
    CONTAINER_LAYOUT.HEADER_SIZE + 0x100,
  );
  const raw = subarrayFromFirstBrace(data, start, start + cap);
  return prepareContainerJsonText(raw);
}

export function tryParseDevProgContainerRecord(data: Uint8Array): Record<string, unknown> | null {
  const attempts = [
    () => extractDevProgContainerJsonText(data),
    () => extractDevProgContainerJsonTextFallback(data),
  ];
  for (const get of attempts) {
    const text = get();
    if (!text) continue;
    try {
      return JSON.parse(text.trim()) as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}
