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
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  MONKEY-PATCH: ensureGmLiveDataSessionForTx                        │
 * │                                                                      │
 * │  Root cause: Tobi's code sends DiagnosticSessionControl 0x10 0x03   │
 * │  (extended session) before Mode 22 reads. The 2019 L5P E41 OS       │
 * │  rejects this, causing all subsequent DID reads to fail (zero PIDs).│
 * │                                                                      │
 * │  HP Tuners (proven via BUSMASTER capture) does NOT send 0x10 0x03.  │
 * │  It uses only TesterPresent (0x3E) + direct Mode 22 reads.          │
 * │                                                                      │
 * │  The patch is SCOPED to this tab's lifecycle:                        │
 * │  - Applied when PpeiDataloggerPanel mounts                          │
 * │  - Reverted when PpeiDataloggerPanel unmounts                       │
 * │  - Tobi's original Datalogger tab is NEVER affected                 │
 * │                                                                      │
 * │  To disable: remove the useEffect block with applyPpeiSessionPatch  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * @module ppei-datalogger
 * @team PPEI Development Team
 * @sandbox true
 */
import { useState, useCallback, useEffect } from 'react';
import DataloggerPanel, { type DataloggerPanelProps } from '@/components/DataloggerPanel';
import { PCANConnection } from '@/lib/pcanConnection';
import { Beaker, Shield } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════
// MONKEY-PATCH: HP Tuners-style session management for 2019+ L5P E41
// ══════════════════════════════════════════════════════════════════════════

/**
 * Non-GM manufacturers that should skip GM-style session setup entirely.
 * Mirrors the NON_GM_FOR_GMLAN_SESSION set in Tobi's pcanConnection.ts.
 */
const NON_GM_MANUFACTURERS = new Set([
  'ford', 'chrysler', 'toyota', 'honda', 'nissan', 'hyundai', 'bmw',
  'canam', 'seadoo', 'polaris', 'kawasaki',
]);

/** Saved reference to Tobi's original method for clean revert. */
let _originalMethod: Function | null = null;

/**
 * PPEI replacement for PCANConnection.ensureGmLiveDataSessionForTx.
 *
 * Matches HP Tuners' proven approach from BUSMASTER capture on 2019 L5P E41:
 *   1. TesterPresent (0x3E) with sub-function 0x00 — keeps session alive
 *   2. NO DiagnosticSessionControl (0x10 0x03) — avoids breaking the ECU state
 *   3. Direct Mode 22 reads work immediately after TesterPresent
 *
 * The 12-second cache is preserved so we don't spam TesterPresent on every PID read.
 *
 * Context: `this` is the PCANConnection instance (called via prototype).
 */
async function ppeiEnsureGmLiveDataSession(this: any, ecmTx: number): Promise<void> {
  // Only applies to ECM physical addresses (0x7E0, 0x7E1)
  if (ecmTx !== 0x7e0 && ecmTx !== 0x7e1) return;

  // Skip for non-GM vehicles
  const mfr = this.vehicleInfo?.manufacturer;
  if (mfr && NON_GM_MANUFACTURERS.has(mfr)) return;

  // 12-second cache — don't re-send TesterPresent if we just did
  const now = Date.now();
  const last = this.gmLiveSessionAtByTx?.get(ecmTx) ?? 0;
  if (now - last < 12000) return;

  console.log(
    `[PPEI Patch] ensureGmLiveDataSession: sending TesterPresent (0x3E) to 0x${ecmTx.toString(16).toUpperCase()} — NO extended session (HP Tuners approach)`,
  );

  // ── TesterPresent (0x3E 0x00) — keeps default session alive ──
  try {
    await this.sendUDSRequest(0x3e, 0x00, [], ecmTx, 2500);
    console.log(`[PPEI Patch] TesterPresent OK on 0x${ecmTx.toString(16).toUpperCase()}`);
  } catch (e: any) {
    // TesterPresent failure is non-fatal — some ECUs don't respond to it
    // but still accept Mode 22 reads in default session
    console.warn(
      `[PPEI Patch] TesterPresent failed on 0x${ecmTx.toString(16).toUpperCase()}: ${e?.message ?? e}`,
    );
  }

  // ── NO DiagnosticSessionControl (0x10 0x03) ──
  // This is the critical difference from Tobi's original.
  // HP Tuners does NOT send extended session control before Mode 22 reads.
  // The 2019 E41 OS supports Mode 22 in the default diagnostic session.
  // Sending 0x10 0x03 can put the ECU into a state that rejects subsequent reads.

  // Update the cache timestamp
  if (this.gmLiveSessionAtByTx) {
    this.gmLiveSessionAtByTx.set(ecmTx, Date.now());
  }

  // Short settle after TesterPresent (40ms, same as Tobi's post-session settle)
  await new Promise(r => setTimeout(r, 40));
}

/**
 * Apply the PPEI session patch to PCANConnection.prototype.
 * Returns a cleanup function that reverts the patch.
 */
function applyPpeiSessionPatch(): () => void {
  const proto = PCANConnection.prototype as any;

  // Save original (only if not already saved from a previous mount)
  if (!_originalMethod) {
    _originalMethod = proto.ensureGmLiveDataSessionForTx;
  }

  // Apply the patch
  proto.ensureGmLiveDataSessionForTx = ppeiEnsureGmLiveDataSession;

  console.log(
    '[PPEI Patch] ✅ ensureGmLiveDataSessionForTx APPLIED — HP Tuners approach (TesterPresent only, no 0x10 0x03)',
  );

  // Return cleanup function
  return () => {
    if (_originalMethod) {
      proto.ensureGmLiveDataSessionForTx = _originalMethod;
      console.log('[PPEI Patch] ⏪ ensureGmLiveDataSessionForTx REVERTED to Tobi\'s original');
    }
  };
}

// ══════════════════════════════════════════════════════════════════════════
// TEAM OVERRIDE ZONE — Add your custom hooks, state, and logic here
// ══════════════════════════════════════════════════════════════════════════

function usePpeiDataloggerOverrides() {
  const [sandboxNotes, setSandboxNotes] = useState('');
  return {
    sandboxNotes,
    setSandboxNotes,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PPEI DATALOGGER WRAPPER COMPONENT
// ══════════════════════════════════════════════════════════════════════════

interface PpeiDataloggerPanelProps extends DataloggerPanelProps {
  // ── ADD PPEI-SPECIFIC PROPS HERE ──
}

export default function PpeiDataloggerPanel({
  onOpenInAnalyzer,
  injectedPids,
  ...rest
}: PpeiDataloggerPanelProps) {
  const overrides = usePpeiDataloggerOverrides();
  const [showSandboxBanner, setShowSandboxBanner] = useState(true);

  // ══════════════════════════════════════════════════════════════════
  // SCOPED MONKEY-PATCH — applied on mount, reverted on unmount
  // ══════════════════════════════════════════════════════════════════
  useEffect(() => {
    const revert = applyPpeiSessionPatch();
    return revert; // cleanup on unmount → restores Tobi's original
  }, []);

  // ══════════════════════════════════════════════════════════════════
  // TEAM PROP INTERCEPTORS
  // ══════════════════════════════════════════════════════════════════

  const handleOpenInAnalyzer = useCallback(
    (csvData: string, filename: string) => {
      onOpenInAnalyzer?.(csvData, filename);
    },
    [onOpenInAnalyzer],
  );

  const processedPids = injectedPids;

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
       * ══════════════════════════════════════════════════════════════════ */}

      {/* ── Tobi's Datalogger Panel (imported directly — auto-updates) ── */}
      <DataloggerPanel
        onOpenInAnalyzer={handleOpenInAnalyzer}
        injectedPids={processedPids}
      />

      {/* ══════════════════════════════════════════════════════════════════
       * TEAM POST-DATALOGGER ZONE — Add custom UI BELOW the datalogger here
       * ══════════════════════════════════════════════════════════════════ */}
    </div>
  );
}
