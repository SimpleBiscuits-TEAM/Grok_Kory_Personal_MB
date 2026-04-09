/**
 * CAN sniff → OBD/UDS inference helpers
 * =====================================
 * Parses tabular text logs (Busmaster / EFI Live–style CSV exports, generic comma-separated hex)
 * and extracts **when** Mode 01 / UDS $22 traffic occurred, **decoded values** where formulas are known,
 * and **weak hints** for which periodic PT-CAN arbitration IDs might carry similar raw bytes.
 *
 * This is the programmatic counterpart to “look at EFI + Busmaster sniffs, see requests and changes,
 * cross-check our PID database / J1979, then reason about reverse engineering.”
 *
 * - **Ground truth for names/scaling:** extend `MODE01_J1979_DECODE` or pass richer defs from `obdConnection` on the client.
 * - **Online:** this module stays deterministic; a Knox/LLM layer can consume `SniffInferenceReport` JSON.
 *
 * @see `client/src/lib/gmE90SilveradoSniffReference.ts` — field PT-CAN ID list (pass into correlation).
 */

export interface ParsedSniffFrame {
  /** Monotonic ms if parsed from first column; else line index × 1 */
  timeMs: number;
  canId: number;
  dlc: number;
  data: number[];
  lineIndex: number;
}

export type DiagEventKind = 'mode01_request' | 'mode01_response' | 'uds22_request' | 'uds22_response';

export interface DiagEvent {
  kind: DiagEventKind;
  timeMs: number;
  lineIndex: number;
  canId: number;
  /** Mode 01 PID (1 byte) or UDS DID (2 bytes) */
  pid?: number;
  did?: number;
  /** Raw PCI + payload (ISO-TP single frame style) */
  raw: number[];
  /** Human label when known */
  label?: string;
  /** Decoded scalar when J1979 helper knows this PID */
  decodedValue?: number;
  decodedUnit?: string;
}

export interface PeriodicCorrelationHint {
  arbId: number;
  byteOffset: number;
  widthBytes: 1 | 2;
  endian: 'be' | 'le';
  diagKind: 'mode01' | 'uds22';
  pidOrDid: number;
  /** How often raw bytes matched a recent diagnostic payload within the time window */
  matchCount: number;
  confidence: 'low' | 'medium';
}

export interface SniffInferenceReport {
  framesParsed: number;
  framesSkipped: number;
  diagEvents: DiagEvent[];
  periodicHints: PeriodicCorrelationHint[];
  notes: string[];
}

/** Minimal J1979 Mode 01 decode — expand as needed. */
const MODE01_J1979_DECODE: Record<
  number,
  { label: string; unit: string; decode: (a: number, b?: number) => number }
> = {
  0x05: { label: 'Coolant Temp', unit: '°C', decode: (a) => a - 40 },
  0x0b: { label: 'MAP', unit: 'kPa', decode: (a) => a },
  0x0c: {
    label: 'Engine RPM',
    unit: 'rpm',
    decode: (a, b = 0) => ((a << 8) | b) / 4,
  },
  0x0d: { label: 'Vehicle Speed', unit: 'km/h', decode: (a) => a },
  0x0f: { label: 'IAT', unit: '°C', decode: (a) => a - 40 },
  0x11: { label: 'Throttle Position', unit: '%', decode: (a) => (100 * a) / 255 },
};

function pciIsSingleFrame(pci: number): boolean {
  return (pci >> 4) === 0;
}

function normalizeHexToken(t: string): string {
  return t.replace(/^0x/i, '').trim();
}

/**
 * Parse one line from typical **CSV** exports: `timeMs,canIdHex,dlc,byte0,byte1,...`
 * Also accepts: `timeMs,0x7E8,8,04,41,0C,...`
 */
export function parseCanSniffCsvLine(line: string, lineIndex: number): ParsedSniffFrame | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 4) return null;

  const ts = Number(parts[0]);
  if (Number.isNaN(ts)) return null;

  const idStr = normalizeHexToken(parts[1]!);
  const canId = parseInt(idStr, 16);
  if (Number.isNaN(canId)) return null;

  const dlc = parseInt(parts[2]!, 10);
  if (Number.isNaN(dlc) || dlc < 0 || dlc > 64) return null;

  const data: number[] = [];
  for (let i = 3; i < parts.length && data.length < dlc; i++) {
    const b = parseInt(normalizeHexToken(parts[i]!), 16);
    if (Number.isNaN(b) || b < 0 || b > 255) return null;
    data.push(b);
  }

  return {
    timeMs: ts,
    canId,
    dlc: data.length,
    data,
    lineIndex,
  };
}

/** Parse full file: CSV lines only (skip non-matching). */
export function parseCanSniffCsv(text: string): { frames: ParsedSniffFrame[]; skipped: number } {
  const lines = text.split(/\r?\n/);
  const frames: ParsedSniffFrame[] = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const f = parseCanSniffCsvLine(lines[i]!, i);
    if (f) frames.push(f);
    else skipped++;
  }
  return { frames, skipped };
}

const GM_ECM_TX = 0x7e0;
const GM_ECM_RX = 0x7e8;
// Legacy TCM address (GMT900/K2XX, Allison/6L80)
const GM_TCM_TX_LEGACY = 0x7e1;
const GM_TCM_RX_LEGACY = 0x7e9;
// Global B TCM address (2019+ T87/T93 10-speed, verified via BUSMASTER sniff)
const GM_TCM_TX_GLOBALB = 0x7e2;
const GM_TCM_RX_GLOBALB = 0x7ea;
const OBD_FUNC = 0x7df;

function isEcuRxId(id: number): boolean {
  return id === GM_ECM_RX || id === GM_TCM_RX_LEGACY || id === GM_TCM_RX_GLOBALB;
}
function isEcuTxId(id: number): boolean {
  return id === GM_ECM_TX || id === GM_TCM_TX_LEGACY || id === GM_TCM_TX_GLOBALB || id === OBD_FUNC;
}

function decodeMode01FromResponse(data: number[], lineIndex: number, timeMs: number, canId: number): DiagEvent | null {
  if (data.length < 4) return null;
  const pci = data[0]!;
  if (!pciIsSingleFrame(pci) || data.length < pci + 1) return null;
  const resp = data[1]!;
  if (resp !== 0x41) return null;
  const pid = data[2]!;
  const payload = data.slice(3, 1 + pci);
  const def = MODE01_J1979_DECODE[pid];
  let decodedValue: number | undefined;
  let decodedUnit: string | undefined;
  let label: string | undefined;
  if (def) {
    label = def.label;
    decodedUnit = def.unit;
    decodedValue =
      payload.length >= 2 ? def.decode(payload[0]!, payload[1]) : def.decode(payload[0]!);
  }
  return {
    kind: 'mode01_response',
    timeMs,
    lineIndex,
    canId,
    pid,
    raw: data.slice(0, 8),
    label,
    decodedValue,
    decodedUnit,
  };
}

function decodeMode01Request(data: number[], lineIndex: number, timeMs: number, canId: number): DiagEvent | null {
  if (data.length < 3) return null;
  const pci = data[0]!;
  if (!pciIsSingleFrame(pci)) return null;
  if (pci < 2 || data[1] !== 0x01) return null;
  const pid = data[2]!;
  const def = MODE01_J1979_DECODE[pid];
  return {
    kind: 'mode01_request',
    timeMs,
    lineIndex,
    canId,
    pid,
    raw: data.slice(0, 8),
    label: def?.label,
  };
}

function decodeUds22Request(data: number[], lineIndex: number, timeMs: number, canId: number): DiagEvent | null {
  if (data.length < 4) return null;
  const pci = data[0]!;
  if (!pciIsSingleFrame(pci) || pci < 3 || data[1] !== 0x22) return null;
  const did = (data[2]! << 8) | data[3]!;
  return {
    kind: 'uds22_request',
    timeMs,
    lineIndex,
    canId,
    did,
    raw: data.slice(0, 8),
    label: `UDS $22 DID 0x${did.toString(16).toUpperCase().padStart(4, '0')}`,
  };
}

function decodeUds22Response(data: number[], lineIndex: number, timeMs: number, canId: number): DiagEvent | null {
  if (data.length < 4) return null;
  const pci = data[0]!;
  if (!pciIsSingleFrame(pci)) return null;
  if (data[1] !== 0x62) return null;
  const did = (data[2]! << 8) | data[3]!;
  return {
    kind: 'uds22_response',
    timeMs,
    lineIndex,
    canId,
    did,
    raw: data.slice(0, 8),
    label: `UDS $22 +resp DID 0x${did.toString(16).toUpperCase().padStart(4, '0')}`,
  };
}

/** Extract diagnostic-style events from parsed frames (single-frame ISO-TP assumption). */
export function extractDiagEvents(frames: ParsedSniffFrame[]): DiagEvent[] {
  const out: DiagEvent[] = [];
  for (const f of frames) {
    const { data, lineIndex, timeMs, canId } = f;
    if (data.length === 0) continue;

    if (isEcuTxId(canId)) {
      const m1 = decodeMode01Request(data, lineIndex, timeMs, canId);
      if (m1) {
        out.push(m1);
        continue;
      }
      const u22 = decodeUds22Request(data, lineIndex, timeMs, canId);
      if (u22) {
        out.push(u22);
        continue;
      }
    }
    if (isEcuRxId(canId)) {
      const m1r = decodeMode01FromResponse(data, lineIndex, timeMs, canId);
      if (m1r) {
        out.push(m1r);
        continue;
      }
      const u22r = decodeUds22Response(data, lineIndex, timeMs, canId);
      if (u22r) {
        out.push(u22r);
        continue;
      }
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs || a.lineIndex - b.lineIndex);
  return out;
}

function bytesMatchAt(
  haystack: number[],
  offset: number,
  needle: number[],
  width: number
): boolean {
  if (offset + width > haystack.length) return false;
  for (let i = 0; i < width; i++) {
    if (haystack[offset + i] !== needle[i]) return false;
  }
  return true;
}

/**
 * For each Mode 01 / $22 **response**, search other frames within ±`windowMs` for the same raw value bytes
 * embedded at some offset (endian variants). Produces **hints only** — OEMs may scale or endian-flip differently.
 */
export function correlatePeriodicWithDiagResponses(
  frames: ParsedSniffFrame[],
  diagEvents: DiagEvent[],
  opts?: { windowMs?: number; excludeIds?: Set<number> }
): PeriodicCorrelationHint[] {
  const windowMs = opts?.windowMs ?? 100;
  const exclude =
    opts?.excludeIds ??
    new Set([GM_ECM_TX, GM_ECM_RX, GM_TCM_TX_LEGACY, GM_TCM_RX_LEGACY, GM_TCM_TX_GLOBALB, GM_TCM_RX_GLOBALB, OBD_FUNC, 0x101]);

  const responses = diagEvents.filter(
    (e) => e.kind === 'mode01_response' || e.kind === 'uds22_response'
  );
  const scored = new Map<string, PeriodicCorrelationHint>();

  for (const ev of responses) {
    const pci = ev.raw[0] ?? 0;
    if (!pciIsSingleFrame(pci)) continue;
    const payloadStart = ev.kind === 'mode01_response' ? 3 : 4;
    const payloadLen = Math.max(0, pci - (ev.kind === 'mode01_response' ? 2 : 3));
    if (payloadLen <= 0 || payloadStart + payloadLen > ev.raw.length) continue;
    const payload = ev.raw.slice(payloadStart, payloadStart + payloadLen);
    const widthCandidates: { w: 1 | 2; needle: number[]; endian: 'be' | 'le' }[] = [];
    if (payload.length >= 1) widthCandidates.push({ w: 1, needle: [payload[0]!], endian: 'be' });
    if (payload.length >= 2) {
      widthCandidates.push({
        w: 2,
        needle: [payload[0]!, payload[1]!],
        endian: 'be',
      });
      widthCandidates.push({
        w: 2,
        needle: [payload[1]!, payload[0]!],
        endian: 'le',
      });
    }

    for (const f of frames) {
      if (exclude.has(f.canId)) continue;
      if (Math.abs(f.timeMs - ev.timeMs) > windowMs) continue;
      for (const { w, needle, endian } of widthCandidates) {
        for (let off = 0; off <= f.data.length - w; off++) {
          if (!bytesMatchAt(f.data, off, needle, w)) continue;
          const pidOrDid = ev.kind === 'mode01_response' ? (ev.pid ?? 0) : (ev.did ?? 0);
          const key = `${f.canId}:${off}:${w}:${endian}:${ev.kind === 'mode01_response' ? 'm1' : 'u22'}:${pidOrDid}`;
          const prev = scored.get(key);
          if (prev) {
            prev.matchCount += 1;
          } else {
            scored.set(key, {
              arbId: f.canId,
              byteOffset: off,
              widthBytes: w,
              endian,
              diagKind: ev.kind === 'mode01_response' ? 'mode01' : 'uds22',
              pidOrDid,
              matchCount: 1,
              confidence: 'low',
            });
          }
        }
      }
    }
  }

  const hints = [...scored.values()].filter((h) => h.matchCount >= 2);
  for (const h of hints) {
    if (h.matchCount >= 5) h.confidence = 'medium';
  }
  return hints.sort((a, b) => b.matchCount - a.matchCount);
}

/** Full pass: parse CSV text → events → correlation hints. */
export function inferFromCanSniffCsv(
  text: string,
  opts?: { windowMs?: number; excludeIds?: Set<number> }
): SniffInferenceReport {
  const notes: string[] = [
    'Assumes ISO-TP **single-frame** OBD on 7E0/7E8, 7E1/7E9 (legacy TCM), and 7E2/7EA (Global B TCM). Multi-frame VIN / long $22 not reassembled here.',
    'Periodic correlation uses raw byte equality in a time window — verify with A2L/DBC before treating as ground truth.',
  ];
  const { frames, skipped } = parseCanSniffCsv(text);
  const diagEvents = extractDiagEvents(frames);
  const periodicHints = correlatePeriodicWithDiagResponses(frames, diagEvents, opts);
  return {
    framesParsed: frames.length,
    framesSkipped: skipped,
    diagEvents,
    periodicHints,
    notes,
  };
}
