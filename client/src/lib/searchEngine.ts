/**
 * PPEI Advanced Mode — Document-Aware Search Engine
 *
 * A client-side search engine with:
 * - TF-IDF-inspired relevance scoring
 * - Automotive/OBD synonym expansion
 * - Fuzzy matching for typos
 * - Category-aware boosting
 * - Query understanding (detects intent: PID lookup, DTC search, monitor search, etc.)
 */

import { KBDocument, KBCategory, buildSearchDocuments } from './knowledgeBase';
import { buildVehicleSearchDocuments } from './vehicleKnowledgeBase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  document: KBDocument;
  score: number;
  matchedTerms: string[];
  snippet: string;
  relevanceLabel: 'exact' | 'high' | 'medium' | 'low';
}

export interface QueryIntent {
  type: 'pid_lookup' | 'dtc_search' | 'mode6_search' | 'service_info' | 'formula' | 'general';
  extractedValue?: string;
  description: string;
}

// ─── Synonym Map ─────────────────────────────────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  // Engine parameters
  'rpm': ['engine speed', 'revolutions', 'tachometer', 'tach'],
  'coolant': ['ect', 'engine coolant temperature', 'water temp', 'antifreeze'],
  'maf': ['mass air flow', 'airflow', 'air flow sensor', 'mass airflow'],
  'map': ['manifold absolute pressure', 'intake manifold pressure', 'manifold pressure'],
  'boost': ['turbo pressure', 'turbocharger', 'boost pressure', 'supercharger', 'forced induction'],
  'egt': ['exhaust gas temperature', 'exhaust temp', 'pyro', 'pyrometer'],
  'dpf': ['diesel particulate filter', 'particulate filter', 'soot filter', 'pm filter'],
  'def': ['diesel exhaust fluid', 'adblue', 'urea', 'reductant', 'scr fluid'],
  'scr': ['selective catalytic reduction', 'nox catalyst', 'nox aftertreatment'],
  'egr': ['exhaust gas recirculation', 'egr valve', 'egr cooler'],
  'vgt': ['variable geometry turbo', 'variable vane', 'turbo vane', 'vnt'],
  'tcc': ['torque converter clutch', 'converter lockup', 'tcc slip', 'lockup clutch'],
  'pcv': ['pressure control valve', 'fuel pressure regulator', 'volume control valve'],
  'throttle': ['tps', 'throttle position', 'accelerator', 'pedal position', 'app'],
  'fuel': ['injection', 'injector', 'fuel rail', 'fuel pressure', 'fuel system'],
  'misfire': ['cylinder misfire', 'misfire count', 'misfire data', 'engine misfire'],
  'oxygen': ['o2', 'o2 sensor', 'lambda', 'air fuel ratio', 'wideband', 'narrowband'],
  'catalyst': ['catalytic converter', 'cat', 'three way catalyst', 'oxidation catalyst'],
  'evap': ['evaporative', 'evaporative system', 'purge', 'canister', 'fuel vapor'],
  'vvt': ['variable valve timing', 'cam phaser', 'camshaft timing', 'intake cam', 'exhaust cam'],
  'oil': ['engine oil', 'oil pressure', 'oil temperature', 'lubrication'],
  'trans': ['transmission', 'gearbox', 'tcm', 'automatic transmission', 'shift'],

  // Diagnostic concepts
  'dtc': ['diagnostic trouble code', 'fault code', 'error code', 'trouble code', 'p-code'],
  'freeze': ['freeze frame', 'snapshot', 'fault snapshot', 'stored data'],
  'readiness': ['i/m readiness', 'monitor readiness', 'inspection', 'emissions test'],
  'mil': ['check engine light', 'malfunction indicator lamp', 'cel', 'engine light', 'warning light'],
  'pid': ['parameter id', 'parameter identifier', 'obd parameter', 'sensor data'],
  'mode': ['service', 'obd mode', 'diagnostic service'],
  'uds': ['unified diagnostic services', 'iso 14229', 'j1979-2'],
  'can': ['controller area network', 'can bus', 'obd-ii bus'],
};

// ─── Stopwords ───────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'for', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
  'in', 'on', 'at', 'to', 'from', 'by', 'with', 'about', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
  'of', 'it', 'its', 'this', 'that', 'these', 'those', 'what', 'which',
  'who', 'whom', 'how', 'when', 'where', 'why',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
]);

// ─── Search Engine Class ─────────────────────────────────────────────────────

export class PPEISearchEngine {
  private documents: KBDocument[] = [];
  private invertedIndex: Map<string, Set<number>> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private documentTermCounts: Map<number, Map<string, number>> = new Map();
  private totalDocs = 0;

  constructor() {
    this.documents = [
      ...buildSearchDocuments(),
      ...buildVehicleSearchDocuments(),
    ];
    this.totalDocs = this.documents.length;
    this.buildIndex();
  }

  /** Add documents dynamically (e.g. from a2L uploads) and rebuild index */
  addDocuments(docs: KBDocument[]): void {
    this.documents.push(...docs);
    this.totalDocs = this.documents.length;
    this.invertedIndex.clear();
    this.documentFrequency.clear();
    this.documentTermCounts.clear();
    this.buildIndex();
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9$#\-/]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOPWORDS.has(t));
  }

  private buildIndex(): void {
    for (let i = 0; i < this.documents.length; i++) {
      const doc = this.documents[i];
      const allText = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`;
      const tokens = this.tokenize(allText);

      const termCounts = new Map<string, number>();
      for (const token of tokens) {
        termCounts.set(token, (termCounts.get(token) || 0) + 1);

        if (!this.invertedIndex.has(token)) {
          this.invertedIndex.set(token, new Set());
        }
        this.invertedIndex.get(token)!.add(i);
      }

      this.documentTermCounts.set(i, termCounts);
    }

    // Calculate document frequency
    for (const [term, docSet] of Array.from(this.invertedIndex.entries())) {
      this.documentFrequency.set(term, docSet.size);
    }
  }

  private expandQuery(tokens: string[]): string[] {
    const expanded = new Set(tokens);

    for (const token of tokens) {
      // Check if this token has synonyms
      if (SYNONYMS[token]) {
        for (const syn of SYNONYMS[token]) {
          for (const synToken of this.tokenize(syn)) {
            expanded.add(synToken);
          }
        }
      }

      // Check if this token appears in any synonym list
      for (const [key, syns] of Object.entries(SYNONYMS)) {
        const allSynTokens = syns.flatMap(s => this.tokenize(s));
        if (allSynTokens.includes(token)) {
          expanded.add(key);
          for (const syn of syns) {
            for (const synToken of this.tokenize(syn)) {
              expanded.add(synToken);
            }
          }
        }
      }
    }

    return Array.from(expanded);
  }

  private detectIntent(query: string): QueryIntent {
    const q = query.toLowerCase().trim();

    // PID lookup: "$0C", "PID 0C", "pid 12", "what is pid 05"
    const pidMatch = q.match(/(?:pid\s*)?(?:\$|0x)?([0-9a-f]{2})\b/i);
    if (pidMatch && (q.includes('pid') || q.startsWith('$') || q.startsWith('0x'))) {
      return { type: 'pid_lookup', extractedValue: pidMatch[1].toUpperCase(), description: `Looking up PID $${pidMatch[1].toUpperCase()}` };
    }

    // DTC search: "P0300", "P0741", "U0100"
    const dtcMatch = q.match(/\b([pcbu][0-9]{4})\b/i);
    if (dtcMatch) {
      return { type: 'dtc_search', extractedValue: dtcMatch[1].toUpperCase(), description: `Searching for DTC ${dtcMatch[1].toUpperCase()}` };
    }

    // Mode 6 search: "monitor 85", "OBDMID 01", "mode 6"
    if (q.includes('mode 6') || q.includes('mode6') || q.includes('monitor') || q.includes('obdmid') || q.includes('tid')) {
      const monMatch = q.match(/(?:monitor|obdmid)\s*(?:\$|0x)?([0-9a-f]{1,2})\b/i);
      return {
        type: 'mode6_search',
        extractedValue: monMatch ? monMatch[1].toUpperCase() : undefined,
        description: monMatch ? `Looking up Mode 6 Monitor $${monMatch[1].toUpperCase()}` : 'Searching Mode 6 data',
      };
    }

    // Service/mode info: "mode 01", "service 03", "what does mode 4 do"
    const modeMatch = q.match(/(?:mode|service)\s*(?:\$|0x)?([0-9a-f]{1,2})\b/i);
    if (modeMatch) {
      return { type: 'service_info', extractedValue: modeMatch[1].toUpperCase(), description: `Looking up OBD Service/Mode $${modeMatch[1].toUpperCase()}` };
    }

    // Formula search
    if (q.includes('formula') || q.includes('calculate') || q.includes('equation') || q.includes('convert')) {
      return { type: 'formula', description: 'Searching for formulas and calculations' };
    }

    return { type: 'general', description: 'General knowledge base search' };
  }

  private calculateTFIDF(termIdx: number, term: string): number {
    const termCount = this.documentTermCounts.get(termIdx)?.get(term) || 0;
    if (termCount === 0) return 0;

    const totalTerms = Array.from(this.documentTermCounts.get(termIdx)?.values() || [])
      .reduce((sum, c) => sum + c, 0);
    const tf = termCount / (totalTerms || 1);

    const df = this.documentFrequency.get(term) || 1;
    const idf = Math.log(1 + this.totalDocs / df);

    return tf * idf;
  }

  private fuzzyMatch(query: string, target: string): boolean {
    if (target.includes(query) || query.includes(target)) return true;
    if (query.length < 3) return false;

    // Simple edit distance check for short terms
    if (Math.abs(query.length - target.length) > 2) return false;

    let matches = 0;
    const shorter = query.length <= target.length ? query : target;
    const longer = query.length > target.length ? query : target;

    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }

    return matches / shorter.length > 0.75;
  }

  private generateSnippet(doc: KBDocument, matchedTerms: string[]): string {
    const content = doc.content;
    const lines = content.split('\n');

    // Find the line with the most matched terms
    let bestLine = '';
    let bestScore = 0;

    for (const line of lines) {
      const lower = line.toLowerCase();
      let score = 0;
      for (const term of matchedTerms) {
        if (lower.includes(term)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLine = line;
      }
    }

    if (bestLine.length > 200) {
      bestLine = bestLine.substring(0, 200) + '...';
    }

    return bestLine || lines[0]?.substring(0, 200) || doc.title;
  }

  search(query: string, maxResults = 20): { results: SearchResult[]; intent: QueryIntent } {
    if (!query.trim()) return { results: [], intent: { type: 'general', description: '' } };

    const intent = this.detectIntent(query);
    const queryTokens = this.tokenize(query);
    const expandedTokens = this.expandQuery(queryTokens);

    // Score each document
    const scores: Array<{ idx: number; score: number; matchedTerms: string[] }> = [];

    for (let i = 0; i < this.documents.length; i++) {
      const doc = this.documents[i];
      let score = 0;
      const matchedTerms: string[] = [];

      // TF-IDF scoring for expanded query terms
      for (const token of expandedTokens) {
        const tfidf = this.calculateTFIDF(i, token);
        if (tfidf > 0) {
          // Original query terms get 2x boost
          const boost = queryTokens.includes(token) ? 2.0 : 1.0;
          score += tfidf * boost;
          matchedTerms.push(token);
        }
      }

      // Exact phrase match in title (huge boost)
      const titleLower = doc.title.toLowerCase();
      const queryLower = query.toLowerCase();
      if (titleLower.includes(queryLower)) {
        score += 10.0;
      }

      // Exact phrase match in content
      if (doc.content.toLowerCase().includes(queryLower)) {
        score += 3.0;
      }

      // Intent-based boosting
      if (intent.type === 'pid_lookup' && doc.category === 'pid') {
        if (intent.extractedValue && doc.id.includes(intent.extractedValue.toLowerCase())) {
          score += 20.0; // Exact PID match
        }
        score += 2.0; // Category boost
      }
      if (intent.type === 'mode6_search' && doc.category === 'mode6') {
        if (intent.extractedValue && doc.id.includes(intent.extractedValue.toLowerCase())) {
          score += 20.0;
        }
        score += 2.0;
      }
      if (intent.type === 'service_info' && doc.category === 'standard') {
        if (intent.extractedValue && doc.id.includes(intent.extractedValue.toLowerCase())) {
          score += 20.0;
        }
        score += 2.0;
      }
      if (intent.type === 'formula' && doc.metadata?.formula) {
        score += 5.0;
      }

      // Fuzzy matching for remaining unmatched query tokens
      if (matchedTerms.length < queryTokens.length) {
        const docText = `${doc.title} ${doc.content}`.toLowerCase();
        for (const token of queryTokens) {
          if (!matchedTerms.includes(token)) {
            const docWords = docText.split(/\s+/);
            for (const word of docWords) {
              if (this.fuzzyMatch(token, word)) {
                score += 0.5;
                matchedTerms.push(token);
                break;
              }
            }
          }
        }
      }

      if (score > 0) {
        scores.push({ idx: i, score, matchedTerms });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Build results
    const results: SearchResult[] = scores.slice(0, maxResults).map(({ idx, score, matchedTerms }) => {
      const doc = this.documents[idx];
      const maxScore = scores[0]?.score || 1;
      const normalizedScore = score / maxScore;

      let relevanceLabel: SearchResult['relevanceLabel'];
      if (normalizedScore > 0.8) relevanceLabel = 'exact';
      else if (normalizedScore > 0.5) relevanceLabel = 'high';
      else if (normalizedScore > 0.25) relevanceLabel = 'medium';
      else relevanceLabel = 'low';

      return {
        document: doc,
        score,
        matchedTerms,
        snippet: this.generateSnippet(doc, matchedTerms),
        relevanceLabel,
      };
    });

    return { results, intent };
  }

  getDocumentsByCategory(category: KBCategory): KBDocument[] {
    return this.documents.filter(d => d.category === category);
  }

  getDocumentById(id: string): KBDocument | undefined {
    return this.documents.find(d => d.id === id);
  }

  getStats(): { totalDocuments: number; totalTerms: number; categories: Record<string, number> } {
    const categories: Record<string, number> = {};
    for (const doc of this.documents) {
      categories[doc.category] = (categories[doc.category] || 0) + 1;
    }
    return {
      totalDocuments: this.totalDocs,
      totalTerms: this.invertedIndex.size,
      categories,
    };
  }
}

// Singleton instance
let _engine: PPEISearchEngine | null = null;
export function getSearchEngine(): PPEISearchEngine {
  if (!_engine) _engine = new PPEISearchEngine();
  return _engine;
}
