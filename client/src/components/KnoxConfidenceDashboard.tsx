/**
 * KnoxConfidenceDashboard — Quad-Agent Confidence & Agreement Visualizer
 * ======================================================================
 * Shows the confidence level, agreement status, and per-agent breakdown
 * from the Knox quad-agent pipeline (Alpha, Beta, Gamma, Delta).
 *
 * Used in:
 *  - Editor KnoxChat (after each assistant response)
 *  - IntelliSpy Knox Chat
 *  - DiagnosticAgent responses
 *
 * Only renders when pipeline metadata is available (Level 2/3 responses).
 * Level 1 (Monica) responses have no agent details.
 */

import { useState } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Database,
  BookOpen,
  MessageSquareWarning,
  Archive,
  Clock,
  Zap,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentDetail {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  // Alpha-specific
  sources?: string[];
  evidence?: string[];
  gaps?: string[];
  // Beta-specific
  references?: string[];
  protocolDetails?: string[];
  uncertainties?: string[];
  // Gamma-specific
  verdict?: 'agrees' | 'partially_disagrees' | 'disagrees' | 'insufficient_data';
  challenges?: string[];
  gotchas?: string[];
  practicalAdvice?: string[];
  knowledgeSources?: string[];
  // Delta-specific
  confirmed?: string[];
  contradicted?: string[];
  relatedCases?: Array<{
    type: string;
    id: number;
    summary: string;
    relevance: 'high' | 'medium' | 'low';
  }>;
}

export interface KnoxMetadata {
  pipeline?: 'monica' | 'knox_filtered' | 'knox_full' | 'fallback' | 'error';
  confidence?: 'high' | 'medium' | 'low';
  agreement?: 'unanimous' | 'majority' | 'split' | 'single_agent';
  durationMs?: number;
  agentDetails?: {
    alpha?: AgentDetail;
    beta?: AgentDetail;
    gamma?: AgentDetail;
    delta?: AgentDetail;
  };
}

interface KnoxConfidenceDashboardProps {
  metadata: KnoxMetadata;
  /** Compact mode shows just the confidence badge inline */
  compact?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CONFIDENCE_CONFIG = {
  high: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/30',
    icon: ShieldCheck,
    label: 'High Confidence',
  },
  medium: {
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/30',
    icon: Shield,
    label: 'Medium Confidence',
  },
  low: {
    color: 'text-red-400',
    bg: 'bg-red-400/10',
    border: 'border-red-400/30',
    icon: ShieldAlert,
    label: 'Low Confidence',
  },
};

const AGREEMENT_CONFIG = {
  unanimous: { color: 'text-emerald-400', icon: CheckCircle2, label: 'Unanimous' },
  majority: { color: 'text-cyan-400', icon: Users, label: 'Majority' },
  split: { color: 'text-amber-400', icon: AlertTriangle, label: 'Split' },
  single_agent: { color: 'text-zinc-400', icon: MinusCircle, label: 'Single Agent' },
};

const AGENT_CONFIG = {
  alpha: { name: 'Alpha', subtitle: 'Data Agent', icon: Database, color: 'text-cyan-400', borderColor: 'border-cyan-400/30' },
  beta: { name: 'Beta', subtitle: 'Spec Agent', icon: BookOpen, color: 'text-blue-400', borderColor: 'border-blue-400/30' },
  gamma: { name: 'Gamma', subtitle: 'Skeptic', icon: MessageSquareWarning, color: 'text-amber-400', borderColor: 'border-amber-400/30' },
  delta: { name: 'Delta', subtitle: 'Archivist', icon: Archive, color: 'text-purple-400', borderColor: 'border-purple-400/30' },
};

function getVerdictDisplay(verdict?: string) {
  switch (verdict) {
    case 'agrees': return { label: 'Agrees', color: 'text-emerald-400', icon: CheckCircle2 };
    case 'partially_disagrees': return { label: 'Partially Disagrees', color: 'text-amber-400', icon: AlertTriangle };
    case 'disagrees': return { label: 'Disagrees', color: 'text-red-400', icon: XCircle };
    case 'insufficient_data': return { label: 'Insufficient Data', color: 'text-zinc-500', icon: MinusCircle };
    default: return null;
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KnoxConfidenceDashboard({ metadata, compact = false }: KnoxConfidenceDashboardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { pipeline, confidence, agreement, durationMs, agentDetails } = metadata;

  // Don't render for Monica (Level 1) or fallback/error responses
  if (!pipeline || pipeline === 'monica' || pipeline === 'fallback' || pipeline === 'error') {
    return null;
  }

  // Must have at least confidence to show anything
  if (!confidence) return null;

  const conf = CONFIDENCE_CONFIG[confidence];
  const ConfIcon = conf.icon;
  const agr = agreement ? AGREEMENT_CONFIG[agreement] : null;
  const AgrIcon = agr?.icon;
  const hasDetails = agentDetails && pipeline === 'knox_full';

  // ── Compact Mode: inline badge ──────────────────────────────────────────
  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 mt-1">
        <ConfIcon className={`w-3 h-3 ${conf.color}`} />
        <span className={`text-[10px] font-mono ${conf.color}`}>{confidence}</span>
        {agr && AgrIcon && (
          <>
            <span className="text-zinc-600">·</span>
            <AgrIcon className={`w-3 h-3 ${agr.color}`} />
            <span className={`text-[10px] font-mono ${agr.color}`}>{agr.label}</span>
          </>
        )}
        {durationMs && (
          <>
            <span className="text-zinc-600">·</span>
            <Clock className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-mono text-zinc-500">{(durationMs / 1000).toFixed(1)}s</span>
          </>
        )}
      </div>
    );
  }

  // ── Full Mode: expandable dashboard ─────────────────────────────────────
  return (
    <div className={`mt-2 rounded-lg border ${conf.border} ${conf.bg} overflow-hidden`}>
      {/* Summary Bar */}
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <ConfIcon className={`w-4 h-4 ${conf.color}`} />
          <span className={`text-[11px] font-semibold ${conf.color}`}>{conf.label}</span>

          {agr && AgrIcon && (
            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-zinc-700/50">
              <AgrIcon className={`w-3.5 h-3.5 ${agr.color}`} />
              <span className={`text-[10px] font-mono ${agr.color}`}>{agr.label}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {durationMs && (
            <div className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] font-mono text-zinc-500">{(durationMs / 1000).toFixed(1)}s</span>
            </div>
          )}

          {pipeline === 'knox_full' && (
            <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded">
              FULL FORCE
            </span>
          )}
          {pipeline === 'knox_filtered' && (
            <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded">
              FILTERED
            </span>
          )}

          {hasDetails && (
            isExpanded
              ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
              : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Agent Details (Level 3 only) */}
      {isExpanded && hasDetails && agentDetails && (
        <div className="border-t border-zinc-800/50 px-3 py-2 space-y-2">
          {/* Agent Cards */}
          {(Object.keys(AGENT_CONFIG) as Array<keyof typeof AGENT_CONFIG>).map((agentKey) => {
            const detail = agentDetails[agentKey];
            if (!detail) return null;

            const agentConf = AGENT_CONFIG[agentKey];
            const AgentIcon = agentConf.icon;
            const detailConfidence = detail.confidence ? CONFIDENCE_CONFIG[detail.confidence] : null;

            return (
              <AgentCard
                key={agentKey}
                agentKey={agentKey}
                detail={detail}
                agentConf={agentConf}
                AgentIcon={AgentIcon}
                detailConfidence={detailConfidence}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Agent Card Sub-Component ─────────────────────────────────────────────────

function AgentCard({
  agentKey,
  detail,
  agentConf,
  AgentIcon,
  detailConfidence,
}: {
  agentKey: string;
  detail: AgentDetail;
  agentConf: typeof AGENT_CONFIG[keyof typeof AGENT_CONFIG];
  AgentIcon: typeof Database;
  detailConfidence: typeof CONFIDENCE_CONFIG[keyof typeof CONFIDENCE_CONFIG] | null;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const verdict = agentKey === 'gamma' ? getVerdictDisplay(detail.verdict) : null;

  return (
    <div className={`rounded border ${agentConf.borderColor} bg-zinc-900/50 overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-white/5 transition-colors"
        onClick={() => setShowDetail(!showDetail)}
      >
        <div className="flex items-center gap-2">
          <AgentIcon className={`w-3.5 h-3.5 ${agentConf.color}`} />
          <span className={`text-[11px] font-bold ${agentConf.color}`}>{agentConf.name}</span>
          <span className="text-[9px] text-zinc-500">{agentConf.subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Gamma verdict */}
          {verdict && (
            <div className="flex items-center gap-1">
              <verdict.icon className={`w-3 h-3 ${verdict.color}`} />
              <span className={`text-[9px] font-mono ${verdict.color}`}>{verdict.label}</span>
            </div>
          )}
          {/* Confidence badge */}
          {detailConfidence && (
            <span className={`text-[9px] font-mono ${detailConfidence.color}`}>
              {detail.confidence}
            </span>
          )}
          {showDetail ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
        </div>
      </button>

      {showDetail && (
        <div className="border-t border-zinc-800/50 px-2.5 py-2 space-y-1.5 text-[10px]">
          {/* Answer summary */}
          <p className="text-zinc-300 leading-relaxed">{detail.answer}</p>

          {/* Alpha: sources + evidence */}
          {detail.sources && detail.sources.length > 0 && (
            <DetailList label="Sources" items={detail.sources} color="text-cyan-400/70" />
          )}
          {detail.evidence && detail.evidence.length > 0 && (
            <DetailList label="Evidence" items={detail.evidence} color="text-emerald-400/70" />
          )}

          {/* Beta: references + protocol details */}
          {detail.references && detail.references.length > 0 && (
            <DetailList label="References" items={detail.references} color="text-blue-400/70" />
          )}
          {detail.protocolDetails && detail.protocolDetails.length > 0 && (
            <DetailList label="Protocol" items={detail.protocolDetails} color="text-blue-300/70" />
          )}

          {/* Gamma: challenges + gotchas + practical advice */}
          {detail.challenges && detail.challenges.length > 0 && (
            <DetailList label="Challenges" items={detail.challenges} color="text-amber-400/70" />
          )}
          {detail.gotchas && detail.gotchas.length > 0 && (
            <DetailList label="Gotchas" items={detail.gotchas} color="text-red-400/70" />
          )}
          {detail.practicalAdvice && detail.practicalAdvice.length > 0 && (
            <DetailList label="Practical Advice" items={detail.practicalAdvice} color="text-emerald-400/70" />
          )}

          {/* Delta: confirmed + contradicted + related cases */}
          {detail.confirmed && detail.confirmed.length > 0 && (
            <DetailList label="Confirmed" items={detail.confirmed} color="text-emerald-400/70" />
          )}
          {detail.contradicted && detail.contradicted.length > 0 && (
            <DetailList label="Contradicted" items={detail.contradicted} color="text-red-400/70" />
          )}
          {detail.relatedCases && detail.relatedCases.length > 0 && (
            <div>
              <span className="text-purple-400/70 font-semibold">Related Cases:</span>
              <ul className="mt-0.5 space-y-0.5 ml-2">
                {detail.relatedCases.map((c, i) => (
                  <li key={i} className="text-zinc-400">
                    <span className="text-purple-300/60">[{c.type}#{c.id}]</span> {c.summary}
                    <span className={`ml-1 ${c.relevance === 'high' ? 'text-emerald-400/60' : c.relevance === 'medium' ? 'text-amber-400/60' : 'text-zinc-500'}`}>
                      ({c.relevance})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gaps / Uncertainties */}
          {detail.gaps && detail.gaps.length > 0 && (
            <DetailList label="Gaps" items={detail.gaps} color="text-zinc-500" />
          )}
          {detail.uncertainties && detail.uncertainties.length > 0 && (
            <DetailList label="Uncertainties" items={detail.uncertainties} color="text-zinc-500" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail List Helper ───────────────────────────────────────────────────────

function DetailList({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div>
      <span className={`${color} font-semibold`}>{label}:</span>
      <ul className="mt-0.5 space-y-0.5 ml-2">
        {items.slice(0, 5).map((item, i) => (
          <li key={i} className="text-zinc-400">• {item}</li>
        ))}
        {items.length > 5 && (
          <li className="text-zinc-600">... and {items.length - 5} more</li>
        )}
      </ul>
    </div>
  );
}
