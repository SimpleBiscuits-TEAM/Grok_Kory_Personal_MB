type ChatMessage = { role: "user" | "assistant"; content: string };
type RankedSection = { section: string; score: number };

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "to", "of", "on", "in",
  "at", "by", "with", "from", "as", "is", "are", "was", "were", "be", "been", "being", "it",
  "this", "that", "these", "those", "i", "you", "we", "they", "he", "she", "them", "our",
  "your", "their", "my", "me", "do", "does", "did", "can", "could", "should", "would", "will",
  "just", "about", "into", "over", "under", "than", "too", "very", "also",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.$-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function splitSections(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return normalized
    .split(/\n(?=#{1,3}\s)|\n-{3,}\n|\n(?=\d+\.\s)/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildRelevantContextPack(opts: {
  question: string;
  sources: Array<string | undefined>;
  maxChars?: number;
  maxChunks?: number;
}): { context: string; citations: string[] } {
  const { question, sources } = opts;
  const maxChars = opts.maxChars ?? 5000;
  const maxChunks = opts.maxChunks ?? 12;
  const questionTokens = new Set(tokenize(question));

  const sections: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    sections.push(...splitSections(src));
  }

  if (sections.length === 0) return { context: "", citations: [] };

  const scored: RankedSection[] = sections.map((section) => {
    const tokens = tokenize(section);
    let score = 0;
    for (const t of tokens) {
      if (questionTokens.has(t)) score += 2;
    }
    // Boost for common diagnostic markers and explicit code mentions
    if (/\b(P\d{4}|U\d{4}|B\d{4}|C\d{4}|PID|Mode 6|UDS|rail|boost|egt|maf|tcc)\b/i.test(section)) {
      score += 1;
    }
    if (section.length < 140) score -= 1;
    return { section, score };
  });

  const selected = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .filter((s) => s.score > 0)
    .map((s) => s.section.trim());

  // Fallback if no positive-score chunks
  const candidates = selected.length > 0 ? selected : sections.slice(0, 4).map((s) => s.trim());

  let total = 0;
  const out: string[] = [];
  const citations: string[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (total + c.length + 2 > maxChars) break;
    const tag = `[C${i + 1}]`;
    out.push(`${tag} ${c}`);
    citations.push(`${tag} ${c.slice(0, 160).replace(/\s+/g, " ")}${c.length > 160 ? "..." : ""}`);
    total += c.length + 2;
  }
  return { context: out.join("\n\n"), citations };
}

export function buildRelevantContext(opts: {
  question: string;
  sources: Array<string | undefined>;
  maxChars?: number;
  maxChunks?: number;
}): string {
  return buildRelevantContextPack(opts).context;
}

export function trimHistory(
  history: ChatMessage[] | undefined,
  opts?: { maxTurns?: number; maxChars?: number }
): ChatMessage[] {
  if (!history || history.length === 0) return [];
  const maxTurns = opts?.maxTurns ?? 10;
  const maxChars = opts?.maxChars ?? 6000;
  const sliced = history.slice(-maxTurns);

  const reversed = [...sliced].reverse();
  const kept: ChatMessage[] = [];
  let used = 0;
  for (const msg of reversed) {
    if (used + msg.content.length > maxChars) break;
    kept.push(msg);
    used += msg.content.length;
  }
  return kept.reverse();
}

export function normalizeCacheKey(parts: string[]): string {
  return parts
    .map((p) => (p || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 1200))
    .join("::");
}
