/**
 * Mode 01 PID list derived from the `obd-utils` catalog (ELM327-style OBD-II table).
 * Used to drive PCAN bridge probes and GM/Chevrolet pre-enablement when ECU discovery is flaky.
 */
import { getAllPIDs } from 'obd-utils';
import { STANDARD_PIDS, type PIDDefinition } from './obdConnection';

/** Bitmask / support PIDs — not live data. */
const MODE01_SKIP = new Set(
  ['00', '20', '40', '60', '80', 'a0', 'c0', 'e0'].map((s) => s.toLowerCase())
);

/**
 * All Mode 01 *data* PID numbers from obd-utils (hex → number), excluding support bitmasks.
 */
export function getElmCatalogMode01Pids(): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const d of getAllPIDs()) {
    if (d.mode !== '01' || !d.pid) continue;
    const p = d.pid.toLowerCase();
    if (MODE01_SKIP.has(p)) continue;
    const n = parseInt(p, 16);
    if (Number.isNaN(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * `STANDARD_PIDS` entries that appear in the ELM catalog — safe to read with existing formulas.
 */
export function getStandardPidsMatchingElmCatalog(): PIDDefinition[] {
  const catalog = new Set(getElmCatalogMode01Pids());
  return STANDARD_PIDS.filter(
    (p) => (p.service || 0x01) === 0x01 && catalog.has(p.pid)
  );
}

const PROBE_FIRST = [0x0c, 0x0d, 0x05, 0x04, 0x0f, 0x11, 0x0a, 0x10, 0x5c, 0x46, 0x0b, 0x21, 0x31, 0x42];

/** Probe order: live parameters first, then rest of ELM catalog (capped for connect time). */
export function getMode01ProbePidOrder(max = 42): number[] {
  const all = getElmCatalogMode01Pids();
  const set = new Set(all);
  const head = PROBE_FIRST.filter((p) => set.has(p));
  const tail = all.filter((p) => !PROBE_FIRST.includes(p));
  return [...head, ...tail].slice(0, max);
}
