/**
 * DevProg container `block_struct` JSON uses inconsistent property casings
 * (`rc36` vs `Rc_36`, `block_id` vs `Block_id`). JSON.parse is case-sensitive,
 * so we normalize lookup and optionally copy canonical fields when parsing.
 */

import type { ContainerBlockStruct } from './ecuDatabase';

export function normalizeDevProgJsonKey(key: string): string {
  return key.toLowerCase().replace(/_/g, '').replace(/\s+/g, '');
}

function toNonEmptyString(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/**
 * Find hex string template (rc34 / rc36) on a block using exact + fuzzy key names.
 */
export function getHexTemplateFromDevProgBlock(
  block: ContainerBlockStruct,
  kind: 'rc34' | 'rc36',
): string | undefined {
  const want = kind;
  const o = block as unknown as Record<string, unknown>;
  if (kind === 'rc34') {
    const s = toNonEmptyString(o.rc34 ?? o.Rc_34);
    if (s) return s;
  } else {
    const s = toNonEmptyString(o.rc36 ?? o.Rc_36);
    if (s) return s;
  }
  for (const key of Object.keys(o)) {
    if (normalizeDevProgJsonKey(key) === want) {
      const s = toNonEmptyString(o[key]);
      if (s) return s;
    }
  }
  return undefined;
}

/** Raw PrgByAdr value as in JSON (string, number, or boolean). */
export function getPrgByAdrRawFromDevProgBlock(block: ContainerBlockStruct): unknown {
  const o = block as unknown as Record<string, unknown>;
  for (const k of ['PrgByAdr', 'prgbyadr', 'Prgbyadr', 'PRGBYADR', 'prg_by_adr'] as const) {
    if (k in o && o[k] != null && String(o[k]).trim() !== '') return o[k];
  }
  for (const key of Object.keys(o)) {
    if (normalizeDevProgJsonKey(key) === 'prgbyadr') {
      const v = o[key];
      if (v != null && String(v).trim() !== '') return v;
    }
  }
  return undefined;
}

/** GMLAN: many containers repeat the same rc36 on every block — use any match. */
export function resolveRc36TemplateForBlock(
  block: ContainerBlockStruct,
  allBlocks: ContainerBlockStruct[],
): string | undefined {
  const own = getHexTemplateFromDevProgBlock(block, 'rc36');
  if (own) return own;
  for (const b of allBlocks) {
    const t = getHexTemplateFromDevProgBlock(b, 'rc36');
    if (t) return t;
  }
  return undefined;
}

export function normalizeDevProgContainerBlock(raw: unknown): ContainerBlockStruct {
  if (!raw || typeof raw !== 'object') {
    return raw as ContainerBlockStruct;
  }
  const o = { ...(raw as Record<string, unknown>) };

  const bid = o.block_id ?? o.Block_id ?? o.blockId ?? o.BlockId;
  if (bid != null && bid !== '') o.block_id = Number(bid);

  const asBlock = o as unknown as ContainerBlockStruct;
  const rc36 = getHexTemplateFromDevProgBlock(asBlock, 'rc36');
  const rc34 = getHexTemplateFromDevProgBlock(asBlock, 'rc34');
  if (rc36) o.rc36 = rc36;
  if (rc34) o.rc34 = rc34;

  const prg = getPrgByAdrRawFromDevProgBlock(asBlock);
  if (prg != null && String(prg).trim() !== '') o.PrgByAdr = String(prg).trim();

  return o as unknown as ContainerBlockStruct;
}
