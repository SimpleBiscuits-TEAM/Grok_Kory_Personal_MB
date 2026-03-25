/**
 * PidAuditPanel — PPEI AI Beta
 *
 * Displays the PID substitution audit trail so users can see exactly
 * which PIDs were used, what was substituted, and why.
 */

import { PidSubstitution } from '@/lib/pidSubstitution';
import { AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface PidAuditPanelProps {
  substitutions: PidSubstitution[];
  missing: string[];
  fileFormat: string;
}

const confidenceConfig = {
  high:   { color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/30',  icon: CheckCircle2, label: 'High Confidence' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', icon: AlertTriangle, label: 'Medium Confidence' },
  low:    { color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/30',       icon: AlertTriangle, label: 'Low Confidence' },
};

export default function PidAuditPanel({ substitutions, missing, fileFormat }: PidAuditPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (substitutions.length === 0 && missing.length === 0) return null;

  const hasIssues = missing.length > 0 || substitutions.some(s => s.confidence !== 'high');

  return (
    <div className="border border-zinc-700/60 rounded-sm overflow-hidden mt-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/80 hover:bg-zinc-800/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-rajdhani font-semibold text-sm text-zinc-200 tracking-wide uppercase">
            PID Resolution Audit
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            {fileFormat.toUpperCase()}
          </span>
          {substitutions.length > 0 && (
            <span className="text-xs bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 px-2 py-0.5 rounded-sm font-mono">
              {substitutions.length} substitution{substitutions.length !== 1 ? 's' : ''}
            </span>
          )}
          {missing.length > 0 && (
            <span className="text-xs bg-red-400/15 text-red-300 border border-red-400/30 px-2 py-0.5 rounded-sm font-mono">
              {missing.length} missing
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-zinc-500" />
          : <ChevronDown className="w-4 h-4 text-zinc-500" />
        }
      </button>

      {/* Body */}
      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-zinc-950/60">
          {/* Intro */}
          <p className="text-xs text-zinc-400 font-mono leading-relaxed">
            The analyzer automatically detects missing or flat PIDs and substitutes the best available
            equivalent. All substitutions are listed below with their confidence level and the unit
            conversion applied. This ensures accurate analysis even when a datalog is missing specific channels.
          </p>

          {/* Substitutions */}
          {substitutions.map((sub, idx) => {
            const cfg = confidenceConfig[sub.confidence];
            const Icon = cfg.icon;
            return (
              <div key={idx} className={`border rounded-sm p-3 ${cfg.bg}`}>
                <div className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-rajdhani font-bold text-sm text-zinc-100">
                        {sub.channel}
                      </span>
                      <span className={`text-xs font-mono ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-1 gap-1 text-xs font-mono">
                      <div className="flex gap-2">
                        <span className="text-zinc-500 shrink-0 w-20">Attempted:</span>
                        <span className="text-zinc-400 line-through">{sub.primaryAttempted}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-zinc-500 shrink-0 w-20">Using:</span>
                        <span className="text-green-300 font-semibold">{sub.usedPid}</span>
                      </div>
                      {sub.transform !== 'none (same units)' && (
                        <div className="flex gap-2">
                          <span className="text-zinc-500 shrink-0 w-20">Transform:</span>
                          <span className="text-blue-300">{sub.transform}</span>
                        </div>
                      )}
                      <div className="flex gap-2 mt-1">
                        <span className="text-zinc-500 shrink-0 w-20">Reason:</span>
                        <span className="text-zinc-300">{sub.reason}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Missing channels */}
          {missing.length > 0 && (
            <div className="border border-red-400/30 rounded-sm p-3 bg-red-400/5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                <div>
                  <p className="font-rajdhani font-bold text-sm text-red-300 mb-1">
                    Channels Not Found — No Substitute Available
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {missing.map(m => (
                      <span key={m} className="text-xs font-mono bg-red-400/10 text-red-300 border border-red-400/20 px-2 py-0.5 rounded-sm">
                        {m}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-400 font-mono mt-2">
                    Add these PIDs to your EFILive or HP Tuners scan list for more complete analysis.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* All good notice */}
          {substitutions.length === 0 && missing.length === 0 && (
            <div className="flex items-center gap-2 text-green-400 text-xs font-mono">
              <CheckCircle2 className="w-4 h-4" />
              All primary PIDs resolved successfully. No substitutions needed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
