/**
 * erikaMapSearch — Client-side RAG for A2L calibration maps
 *
 * Builds a lightweight inverted index over map names, descriptions, categories,
 * and subcategories. Given a user query, returns the top-N most relevant maps
 * using TF-IDF-style scoring with domain-specific boosting.
 *
 * This eliminates the truncation problem: instead of stuffing all maps into
 * context, we retrieve only the maps relevant to the user's question.
 */

import type { CalibrationMap } from './editorEngine';

// ─── Domain keyword synonyms ────────────────────────────────────────────────
// Maps common tuning terms to their A2L equivalents so "boost" finds VGT maps,
// "fuel" finds DFIR maps, etc.
const DOMAIN_SYNONYMS: Record<string, string[]> = {
  boost: ['boost', 'turbo', 'vgt', 'wastegate', 'compressor', 'charge', 'ladedr', 'ladedruck', 'atl', 'tcharger'],
  fuel: ['fuel', 'injection', 'injector', 'rail', 'dfir', 'einspritz', 'kraftstoff', 'inj', 'fuelqty', 'fuelpr'],
  torque: ['torque', 'drehmoment', 'trq', 'moment', 'tqe', 'tqi', 'tqmon', 'torq'],
  timing: ['timing', 'ignition', 'spark', 'zuend', 'zw', 'advance', 'retard', 'knock', 'klopf'],
  transmission: ['transmission', 'trans', 'shift', 'tcc', 'converter', 'gear', 'getriebe', 'schalt', 'clutch'],
  egr: ['egr', 'exhaust', 'recirculation', 'agr', 'abgasrueck'],
  dpf: ['dpf', 'particulate', 'filter', 'regen', 'soot', 'partikel', 'russ'],
  def: ['def', 'scr', 'urea', 'adblue', 'nox', 'denox', 'harnstoff'],
  egt: ['egt', 'exhaust', 'temperature', 'abgastemp', 'exhtemp', 'pyrometer'],
  coolant: ['coolant', 'water', 'temp', 'kuehlmittel', 'tmot', 'tco'],
  idle: ['idle', 'leerlauf', 'llr', 'idlespd'],
  launch: ['launch', 'start', 'antilag', 'limiter', 'rev', 'drehzahl'],
  speed: ['speed', 'geschwindigkeit', 'vfzg', 'vmax', 'velocity'],
  air: ['air', 'maf', 'map', 'intake', 'luft', 'ansaug', 'airflow', 'massflow'],
  dtc: ['dtc', 'fault', 'diagnostic', 'fehler', 'error', 'monitor', 'mil', 'obd'],
  oil: ['oil', 'oel', 'oiltemp', 'oilpres'],
  lambda: ['lambda', 'o2', 'oxygen', 'wideband', 'afr', 'stoich'],
  can: ['can', 'bus', 'message', 'signal', 'botschaft'],
  security: ['security', 'seed', 'key', 'immobilizer', 'wegfahrsperre', 'access'],
  pressure: ['pressure', 'druck', 'pres', 'bar', 'kpa', 'psi'],
};

// ─── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

/** Split CamelCase and underscore_names into sub-tokens */
function splitIdentifier(name: string): string[] {
  const tokens: string[] = [];
  // Split on underscores
  const parts = name.split('_');
  for (const part of parts) {
    if (!part) continue;
    tokens.push(part.toLowerCase());
    // Split CamelCase
    const camelParts = part.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    for (const cp of camelParts) {
      if (cp.length > 1) tokens.push(cp.toLowerCase());
    }
  }
  return tokens;
}

// ─── Index ──────────────────────────────────────────────────────────────────

interface IndexEntry {
  mapIndex: number;
  tokens: string[];
  nameTokens: string[];
}

export interface MapSearchIndex {
  entries: IndexEntry[];
  idf: Map<string, number>;
  totalDocs: number;
}

/**
 * Build a search index over the given maps.
 * Call once when A2L is loaded; reuse for all queries.
 */
export function buildMapSearchIndex(maps: CalibrationMap[]): MapSearchIndex {
  const entries: IndexEntry[] = [];
  const docFreq = new Map<string, number>();

  for (let i = 0; i < maps.length; i++) {
    const m = maps[i];
    const nameTokens = splitIdentifier(m.name);
    const descTokens = tokenize(m.description || '');
    const catTokens = tokenize(m.category || '');
    const subTokens = tokenize(m.subcategory || '');
    const unitTokens = tokenize(m.unit || '');

    const allTokens = [...nameTokens, ...descTokens, ...catTokens, ...subTokens, ...unitTokens];
    const uniqueTokens = new Set(allTokens);

    entries.push({ mapIndex: i, tokens: allTokens, nameTokens });

    uniqueTokens.forEach(t => {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    });
  }

  const idf = new Map<string, number>();
  const N = maps.length || 1;
  for (const [token, df] of Array.from(docFreq.entries())) {
    idf.set(token, Math.log(N / (df + 1)) + 1);
  }

  return { entries, idf, totalDocs: maps.length };
}

/**
 * Search for maps relevant to the given query.
 * Returns indices into the original maps array, sorted by relevance.
 */
export function searchMaps(
  index: MapSearchIndex,
  query: string,
  maps: CalibrationMap[],
  topN = 20
): { mapIndex: number; score: number; map: CalibrationMap }[] {
  const queryTokens = tokenize(query);

  // Expand query with domain synonyms
  const expandedTokens = new Set(queryTokens);
  for (const qt of queryTokens) {
    for (const [_domain, synonyms] of Object.entries(DOMAIN_SYNONYMS)) {
      if (synonyms.includes(qt)) {
        for (const syn of synonyms) {
          expandedTokens.add(syn);
        }
      }
    }
  }

  const queryTokenArray: string[] = [];
  expandedTokens.forEach(t => queryTokenArray.push(t));
  const scores: { mapIndex: number; score: number }[] = [];

  for (const entry of index.entries) {
    let score = 0;
    const tokenSet = new Set(entry.tokens);
    const nameTokenSet = new Set(entry.nameTokens);

    for (const qt of queryTokenArray) {
      if (!tokenSet.has(qt)) continue;

      const idfVal = index.idf.get(qt) || 1;

      // Count term frequency
      let tf = 0;
      for (const t of entry.tokens) {
        if (t === qt) tf++;
      }

      // Name match gets 3x boost
      const nameBoost = nameTokenSet.has(qt) ? 3 : 1;

      // Exact substring match in original name gets 5x boost
      const exactBoost = maps[entry.mapIndex].name.toLowerCase().includes(qt) ? 5 : 1;

      score += tf * idfVal * nameBoost * exactBoost;
    }

    // Partial match bonus: if query token is a prefix of a map token
    for (const qt of queryTokenArray) {
      if (qt.length < 3) continue;
      for (const t of entry.nameTokens) {
        if (t.startsWith(qt) && t !== qt) {
          score += (index.idf.get(t) || 1) * 1.5;
        }
      }
    }

    if (score > 0) {
      scores.push({ mapIndex: entry.mapIndex, score });
    }
  }

  // Sort by score descending, take top N
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topN).map(s => ({
    mapIndex: s.mapIndex,
    score: s.score,
    map: maps[s.mapIndex],
  }));
}

/**
 * Format search results as context string for the LLM.
 * Includes full map details for top results.
 */
export function formatSearchResultsForContext(
  results: { mapIndex: number; score: number; map: CalibrationMap }[],
  query: string
): string {
  if (results.length === 0) return '';

  const parts: string[] = [];
  parts.push(`\n--- MAPS RELEVANT TO "${query}" (RAG retrieval, ${results.length} results) ---`);

  for (const r of results) {
    const m = r.map;
    let entry = `  ${m.name} [${m.type}] addr:0x${m.address.toString(16).toUpperCase()}`;
    if (m.description) entry += ` - ${m.description}`;
    if (m.category) entry += ` (${m.category}/${m.subcategory || ''})`;
    if (m.unit) entry += ` [${m.unit}]`;
    if (m.rows && m.cols) entry += ` ${m.rows}x${m.cols}`;
    parts.push(entry);

    // For top 5 results, include values if available
    if (results.indexOf(r) < 5 && m.physValues) {
      const vals = m.physValues.slice(0, 50);
      parts.push(`    Values: ${vals.map(v => v.toFixed(2)).join(', ')}${m.physValues.length > 50 ? '...' : ''}`);
      if (m.axisXValues) {
        parts.push(`    X Axis: ${m.axisXValues.map(v => v.toFixed(2)).join(', ')}`);
      }
      if (m.axisYValues) {
        parts.push(`    Y Axis: ${m.axisYValues.map(v => v.toFixed(2)).join(', ')}`);
      }
    }
  }

  return parts.join('\n');
}
