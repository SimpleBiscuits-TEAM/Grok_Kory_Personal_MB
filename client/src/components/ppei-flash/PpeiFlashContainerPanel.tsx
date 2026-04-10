/**
 * PpeiFlashContainerPanel — PPEI Team Sandbox Wrapper for Flash Tab
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  PPEI TEAM SANDBOX — Safe to modify, experiment, and break!        ║
 * ║                                                                     ║
 * ║  This wrapper imports Tobi's FlashContainerPanel as the base.       ║
 * ║  When Tobi pushes updates, they automatically flow through here.    ║
 * ║  The team can override behavior by intercepting props, adding       ║
 * ║  pre/post processing, or wrapping with additional UI.               ║
 * ║                                                                     ║
 * ║  DO NOT modify Tobi's original FlashContainerPanel.tsx!             ║
 * ║  Instead, add your customizations in this file.                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Architecture: Option A — Thin Wrapper
 * - Imports Tobi's original component directly
 * - Renders it inside a sandbox frame with team branding
 * - Provides hook points for team overrides (see TEAM OVERRIDE sections)
 * - Breaking this wrapper does NOT break Tobi's production FLASH tab
 *
 * @module ppei-flash
 * @team PPEI Development Team
 * @sandbox true
 */

import { useState, useCallback } from 'react';
import FlashContainerPanel from '@/components/FlashContainerPanel';
import { Beaker, AlertTriangle, Zap, Shield } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════
// TEAM OVERRIDE ZONE — Add your custom hooks, state, and logic here
// ══════════════════════════════════════════════════════════════════════════

/**
 * usePpeiFlashOverrides — Custom hook for team-specific flash behavior.
 *
 * Examples of what you can add here:
 * - Custom file validation before flash
 * - Additional logging / telemetry
 * - Team-specific UI state
 * - Pre-flash checks or warnings
 * - Custom connection handling
 */
function usePpeiFlashOverrides() {
  const [sandboxNotes, setSandboxNotes] = useState('');

  // ── ADD YOUR CUSTOM HOOKS HERE ──
  // const [myCustomState, setMyCustomState] = useState(...);
  // const myCustomCallback = useCallback(() => { ... }, []);

  return {
    sandboxNotes,
    setSandboxNotes,
    // ...spread your custom values here
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PPEI FLASH WRAPPER COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export default function PpeiFlashContainerPanel() {
  const overrides = usePpeiFlashOverrides();
  const [showSandboxBanner, setShowSandboxBanner] = useState(true);

  return (
    <div className="relative h-full w-full">
      {/* ── Sandbox Indicator Banner ── */}
      {showSandboxBanner && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 rounded-lg mb-3"
          style={{
            background: 'linear-gradient(135deg, oklch(0.25 0.12 280 / 0.4), oklch(0.20 0.08 200 / 0.3))',
            border: '1px solid oklch(0.45 0.15 280 / 0.4)',
            fontFamily: '"Share Tech Mono", monospace',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Beaker style={{ width: 16, height: 16, color: 'oklch(0.72 0.18 280)' }} />
              <span style={{ color: 'oklch(0.72 0.18 280)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em' }}>
                PPEI SANDBOX
              </span>
            </div>
            <span style={{ color: 'oklch(0.65 0.01 260)', fontSize: '0.7rem' }}>
              Team experimentation zone — changes here do NOT affect Tobi's production Flash tab
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
       * TEAM PRE-FLASH ZONE — Add custom UI ABOVE the flash panel here
       * Examples: custom file validators, team notes, experiment toggles
       * ══════════════════════════════════════════════════════════════════ */}

      {/* ── Tobi's Flash Container (imported directly — auto-updates) ── */}
      <FlashContainerPanel />

      {/* ══════════════════════════════════════════════════════════════════
       * TEAM POST-FLASH ZONE — Add custom UI BELOW the flash panel here
       * Examples: custom result analysis, team logging, experiment results
       * ══════════════════════════════════════════════════════════════════ */}
    </div>
  );
}
