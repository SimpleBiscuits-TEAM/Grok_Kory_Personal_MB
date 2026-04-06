import type { KnoxDomain } from "./knoxReconciler";

export type DiagnosticIntent = {
  domain: KnoxDomain;
  label: string;
  confidence: "high" | "medium" | "low";
  matchedKeywords: string[];
};

const DOMAIN_RULES: Array<{ domain: KnoxDomain; label: string; keywords: string[] }> = [
  {
    domain: "flash",
    label: "flash/programming",
    keywords: ["flash", "reflash", "write", "program", "seed key", "unlock", "bootloader", "checksum", "ipf", "devprog"],
  },
  {
    domain: "intellispy",
    label: "intellispy/can",
    keywords: ["can bus", "intellispy", "frame", "arbitration", "pid scan", "pcan", "kvaser", "j1939", "k-line"],
  },
  {
    domain: "coding",
    label: "coding/config",
    keywords: ["coding", "variant", "feature enable", "module coding", "vin write", "adaptation"],
  },
  {
    domain: "fleet",
    label: "fleet",
    keywords: ["fleet", "driver score", "trip", "maintenance schedule", "vehicle group", "org", "organization"],
  },
  {
    domain: "drag",
    label: "drag/performance",
    keywords: ["drag", "timeslip", "60ft", "quarter mile", "launch", "trap speed"],
  },
  {
    domain: "editor",
    label: "calibration/editor",
    keywords: ["a2l", "map", "axis", "table", "calibration", "winols", "offset", "binary compare"],
  },
  {
    domain: "diagnostics",
    label: "diagnostics",
    keywords: ["dtc", "p0", "p1", "pid", "mode 6", "rail pressure", "boost", "maf", "egt", "tcc", "misfire", "limp mode"],
  },
];

export function classifyIntent(question: string): DiagnosticIntent {
  const q = (question || "").toLowerCase();
  let best: DiagnosticIntent = {
    domain: "diagnostics",
    label: "diagnostics",
    confidence: "low",
    matchedKeywords: [],
  };

  for (const rule of DOMAIN_RULES) {
    const matched = rule.keywords.filter((k) => q.includes(k));
    if (matched.length === 0) continue;
    if (matched.length > best.matchedKeywords.length) {
      best = {
        domain: rule.domain,
        label: rule.label,
        confidence: matched.length >= 3 ? "high" : "medium",
        matchedKeywords: matched,
      };
    }
  }

  return best;
}
