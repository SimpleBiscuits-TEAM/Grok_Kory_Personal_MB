/**
 * PpeiDataloggerPanel — PPEI Team Sandbox Wrapper for Datalogger Tab
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PPEI TEAM SANDBOX — Safe to modify, experiment, and break!        ║
 * ║                                                                     ║
 * ║  This wrapper imports Tobi's DataloggerPanel as the base.           ║
 * ║  When Tobi pushes updates, they automatically flow through here.    ║
 * ║  The team can override behavior by intercepting props, adding       ║
 * ║  pre/post processing, or wrapping with additional UI.               ║
 * ║                                                                     ║
 * ║  DO NOT modify Tobi's original DataloggerPanel.tsx!                 ║
 * ║  Instead, add your customizations in this file.                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Architecture: Option A — Thin Wrapper
 * - Imports Tobi's original DataloggerPanel directly
 * - Renders it inside a sandbox frame with team branding
 * - Provides hook points for team overrides (see TEAM OVERRIDE sections)
 * - Breaking this wrapper does NOT break Tobi's production DATALOGGER tab
 *
 * @module ppei-datalogger
 * @team PPEI Development Team
 * @sandbox true
 */

import { useState, useCallback } from 'react';
import DataloggerPanel, { type DataloggerPanelProps } from '@/components/DataloggerPanel';
import { Beaker, Shield, Activity } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════
// TEAM OVERRIDE ZONE — Add your custom hooks, state, and logic here
// ══════════════════════════════════════════════════════════════════════════

/**
 * usePpeiDataloggerOverrides — Custom hook for team-specific datalogger behavior.
 *
 * Examples of what you can add here:
 * - Custom PID filtering or injection
 * - Additional data processing pipelines
 * - Team-specific logging / telemetry
 * - Custom adapter selection logic
 * - Pre/post recording hooks
 */
function usePpeiDataloggerOverrides() {
  const [sandboxNotes, setSandboxNotes] = useState('');

  // ── ADD YOUR CUSTOM HOOKS HERE ──
  // const [customPidFilter, setCustomPidFilter] = useState<string[]>([]);
  // const [customAdapterPreference, setCustomAdapterPreference] = useState<string>('auto');

  return {
    sandboxNotes,
    setSandboxNotes,
    // ...spread your custom values here
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PPEI DATALOGGER WRAPPER COMPONENT
// ══════════════════════════════════════════════════════════════════════════

interface PpeiDataloggerPanelProps extends DataloggerPanelProps {
  // ── ADD PPEI-SPECIFIC PROPS HERE ──
  // customPidPreset?: string;
  // enableExperimentalFeatures?: boolean;
}

export default function PpeiDataloggerPanel({
  onOpenInAnalyzer,
  injectedPids,
  ...rest
}: PpeiDataloggerPanelProps) {
  const overrides = usePpeiDataloggerOverrides();
  const [showSandboxBanner, setShowSandboxBanner] = useState(true);

  // ══════════════════════════════════════════════════════════════════
  // TEAM PROP INTERCEPTORS — Modify props before passing to Tobi's component
  // ══════════════════════════════════════════════════════════════════

  /**
   * Override the onOpenInAnalyzer callback to add team-specific behavior.
   * Currently passes through to the original — add your logic here.
   */
  const handleOpenInAnalyzer = useCallback(
    (csvData: string, filename: string) => {
      // ── TEAM OVERRIDE: Add pre-processing before opening in analyzer ──
      // Example: console.log('[PPEI Sandbox] Opening datalog in analyzer:', filename);
      // Example: csvData = addCustomColumns(csvData);

      onOpenInAnalyzer?.(csvData, filename);
    },
    [onOpenInAnalyzer],
  );

  /**
   * Override injected PIDs to add team-specific PIDs.
   * Currently passes through — add your custom PIDs here.
   */
  const processedPids = injectedPids;
  // ── TEAM OVERRIDE: Add custom PIDs ──
  // const processedPids = useMemo(() => {
  //   const teamPids = [{ pid: 0xFF01, service: 0x22, name: 'Custom PPEI PID', shortName: 'PPEI1' }];
  //   return [...(injectedPids || []), ...teamPids];
  // }, [injectedPids]);

  return (
    <div className="relative h-full w-full">
      {/* ── Sandbox Indicator Banner ── */}
      {showSandboxBanner && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg mb-3"
          style={{
            background: 'linear-gradient(135deg, oklch(0.25 0.12 170 / 0.4), oklch(0.20 0.08 200 / 0.3))',
            border: '1px solid oklch(0.45 0.15 170 / 0.4)',
            fontFamily: '"Share Tech Mono", monospace',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Beaker style={{ width: 16, height: 16, color: 'oklch(0.72 0.18 170)' }} />
              <span style={{ color: 'oklch(0.72 0.18 170)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em' }}>
                PPEI SANDBOX
              </span>
            </div>
            <span style={{ color: 'oklch(0.65 0.01 260)', fontSize: '0.7rem' }}>
              Team experimentation zone — changes here do NOT affect Tobi's production Datalogger tab
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1" style={{ color: 'oklch(0.55 0.15 145)', fontSize: '0.65rem' }}>
              <Shield style={{ width: 12, height: 12 }} />
              <span>TOBI'S CODE PROTECTED</span>
            </div>
            <button
              onClick={() => setShowSandboxBanner(false)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
       * TEAM PRE-DATALOGGER ZONE — Add custom UI ABOVE the datalogger here
       * Examples: custom PID presets, team recording profiles, experiment toggles
       * ══════════════════════════════════════════════════════════════════ */}

      {/* ── Tobi's Datalogger Panel (imported directly — auto-updates) ── */}
      <DataloggerPanel
        onOpenInAnalyzer={handleOpenInAnalyzer}
        injectedPids={processedPids}
      />

      {/* ══════════════════════════════════════════════════════════════════
       * TEAM POST-DATALOGGER ZONE — Add custom UI BELOW the datalogger here
       * Examples: custom data export, team analysis tools, experiment results
       * ══════════════════════════════════════════════════════════════════ */}
    </div>
  );
}
