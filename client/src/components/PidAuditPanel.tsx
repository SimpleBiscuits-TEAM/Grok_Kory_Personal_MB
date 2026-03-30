/**
 * PidAuditPanel — V-OP Beta
 *
 * Displays the PID substitution audit trail AND the boost pressure
 * calibration result so users can see exactly what was adjusted and why.
 */

import { BoostCalibrationInfo } from '@/lib/dataProcessor';
import { PidSubstitution } from '@/lib/pidSubstitution';
import { AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp, Gauge } from 'lucide-react';
import { useState } from 'react';

interface PidAuditPanelProps {
  substitutions: PidSubstitution[];
  missing: string[];
  fileFormat: string;
  boostCalibration?: BoostCalibrationInfo;
}

const confidenceConfig = {
  high:   { color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/30',  icon: CheckCircle2, label: 'High Confidence' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', icon: AlertTriangle, label: 'Medium Confidence' },
  low:    { color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/30',       icon: AlertTriangle, label: 'Low Confidence' },
};

const methodLabel: Record<BoostCalibrationInfo['method'], string> = {
  idle_map_baseline: 'Idle MAP Baseline',
  barometric_pid:    'Barometric Pressure PID',
  none:              'Default (14.696 psia sea level)',
};

export default function PidAuditPanel({ substitutions, missing, fileFormat, boostCalibration }: PidAuditPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const hasCalibration = boostCalibration && (boostCalibration.corrected || boostCalibration.idleBaselinePsia > 0);
  const hasSubstitutions = substitutions.length > 0 || missing.length > 0;

  // Always show if there's anything to report
  if (!hasCalibration && !hasSubstitutions) return null;

  const boostCorrected = boostCalibration?.corrected && !boostCalibration.desiredAlreadyGauge;

  return (
    <div className="border border-zinc-700/60 rounded-sm overflow-hidden mt-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/80 hover:bg-zinc-800/80 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="font-rajdhani font-semibold text-sm text-zinc-200 tracking-wide uppercase">
            PID Resolution &amp; Calibration Audit
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            {fileFormat.toUpperCase()}
          </span>
          {boostCorrected && (
            <span className="text-xs bg-orange-400/15 text-orange-300 border border-orange-400/30 px-2 py-0.5 rounded-sm font-mono">
              Boost Pressure Corrected
            </span>
          )}
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

          {/* ── Boost Calibration Section ── */}
          {hasCalibration && boostCalibration && (
            <div className={`border rounded-sm p-3 ${boostCorrected ? 'bg-orange-400/8 border-orange-400/30' : 'bg-green-400/8 border-green-400/30'}`}>
              <div className="flex items-start gap-2">
                <Gauge className={`w-4 h-4 mt-0.5 shrink-0 ${boostCorrected ? 'text-orange-400' : 'text-green-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-rajdhani font-bold text-sm mb-1.5 ${boostCorrected ? 'text-orange-300' : 'text-green-300'}`}>
                    {boostCorrected
                      ? 'Boost Desired — Atmospheric Offset Detected and Removed'
                      : 'Boost Pressure — Already in Gauge Pressure (No Correction Needed)'}
                  </p>
                  <div className="grid grid-cols-1 gap-1 text-xs font-mono">
                    <div className="flex gap-2">
                      <span className="text-zinc-500 shrink-0 w-36">Detection Method:</span>
                      <span className="text-zinc-300">{methodLabel[boostCalibration.method]}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-zinc-500 shrink-0 w-36">Idle Baseline:</span>
                      <span className="text-zinc-300">
                        {boostCalibration.idleBaselinePsia > 0
                          ? `${boostCalibration.idleBaselinePsia.toFixed(2)} psia (${boostCalibration.idleSampleCount} idle samples)`
                          : 'Not detected'}
                      </span>
                    </div>
                    {boostCorrected && (
                      <div className="flex gap-2">
                        <span className="text-zinc-500 shrink-0 w-36">Offset Removed:</span>
                        <span className="text-orange-300 font-semibold">
                          {boostCalibration.atmosphericOffsetPsi.toFixed(2)} psi subtracted from desired boost
                        </span>
                      </div>
                    )}
                    <div className="flex gap-2 mt-1">
                      <span className="text-zinc-500 shrink-0 w-36">Why this matters:</span>
                      <span className="text-zinc-400 leading-relaxed">
                        {boostCorrected
                          ? `The desired boost PID in this log contained atmospheric pressure (~${boostCalibration.atmosphericOffsetPsi.toFixed(1)} psi). Without correction, the analyzer would compare gauge actual vs. absolute desired and falsely report an underboost condition. The offset has been removed from desired boost so both channels are now in true gauge pressure (psig).`
                          : 'Both actual and desired boost are already in gauge pressure (psig). No atmospheric correction was needed.'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PID Substitutions ── */}
          {hasSubstitutions && (
            <>
              <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                The analyzer automatically detects missing or flat PIDs and substitutes the best available
                equivalent. All substitutions are listed below with their confidence level and the unit
                conversion applied.
              </p>

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
                        Add these parameters to your {fileFormat === 'bankspower' ? 'Banks Power iDash' : fileFormat === 'efilive' ? 'EFILive' : 'datalog tool'} configuration for more complete analysis.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* All good notice */}
          {!boostCorrected && substitutions.length === 0 && missing.length === 0 && (
            <div className="flex items-center gap-2 text-green-400 text-xs font-mono">
              <CheckCircle2 className="w-4 h-4" />
              All primary PIDs resolved successfully. No substitutions or corrections needed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
