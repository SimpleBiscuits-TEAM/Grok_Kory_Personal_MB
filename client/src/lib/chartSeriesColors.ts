/**
 * Ensures every simultaneous series on a chart gets a visually distinct stroke color.
 * Preferred colors (from PID defs) are kept when unique; duplicates are reassigned
 * from a fixed high-contrast palette.
 */

const norm = (h: string) => h.trim().toLowerCase();

/** OKLCH-friendly distinct hues on dark backgrounds (no two neighbors too close). */
export const DISTINCT_SERIES_PALETTE: string[] = [
  '#ff4d00', '#00c8ff', '#a3e635', '#e879f9', '#fbbf24', '#38bdf8', '#fb7185',
  '#c084fc', '#2dd4bf', '#f97316', '#22d3ee', '#a78bfa', '#facc15', '#4ade80',
  '#f472b6', '#818cf8', '#fb923c', '#5eead4', '#ef4444', '#84cc16', '#d946ef',
  '#06b6d4', '#fcd34d', '#64748b', '#ec4899', '#14b8a6', '#eab308', '#8b5cf6',
];

/**
 * @param keys — stable series ids in render order (e.g. PID keys)
 * @param preferredHexByKey — map key → default color from config (may collide)
 */
export function assignDistinctSeriesColors(
  keys: string[],
  preferredHexByKey: Record<string, string>,
): string[] {
  const used = new Set<string>();
  let pi = 0;

  return keys.map((key) => {
    let c = preferredHexByKey[key];
    if (!c || !/^#[0-9a-f]{6}$/i.test(c)) {
      c = DISTINCT_SERIES_PALETTE[pi % DISTINCT_SERIES_PALETTE.length];
      pi++;
    }
    let cn = norm(c);
    while (used.has(cn)) {
      c = DISTINCT_SERIES_PALETTE[pi % DISTINCT_SERIES_PALETTE.length];
      cn = norm(c);
      pi++;
    }
    used.add(cn);
    return c;
  });
}
