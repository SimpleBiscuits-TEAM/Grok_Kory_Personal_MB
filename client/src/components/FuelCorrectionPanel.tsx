/**
 * FuelCorrectionPanel — Honda Talon Fuel Table Correction UI
 *
 * Controls:
 *   - Turbo/NA toggle with auto-detection indicator
 *   - Stock MAP / 3-Bar MAP sub-switch (turbo only)
 *   - "Correct Fuel Tables" button
 *   - Correction preview table with per-cell diff
 *   - Apply / Revert controls
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Zap, Wind, Gauge, CheckCircle, AlertTriangle, RotateCcw,
  ChevronDown, ChevronRight, Wrench, Target, Info, Download
} from 'lucide-react';
import { WP8ParseResult } from '@/lib/wp8Parser';
import {
  FuelMapState, FuelMap, CorrectionConfig, CorrectionReport,
  MapCorrectionResult, CellCorrection, VehicleMode, MapSensor,
  computeCorrections, applyCorrectionToMap, blendCorrectedMap, detectTurbo,
  getTargetLambdaPreset,
} from '@/lib/talonFuelCorrection';

// ─── Style constants (matches PPEI motorsport dark) ─────────────────────────
const sColor = {
  bg: '#0a0a0a',
  card: 'oklch(0.33 0.006 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.68 0.20 25)',
  redBright: 'oklch(0.74 0.22 25)',
  text: 'white',
  textDim: 'oklch(0.68 0.010 260)',
  textMid: 'oklch(0.70 0.010 260)',
  green: 'oklch(0.65 0.20 145)',
  yellow: 'oklch(0.80 0.18 90)',
  blue: 'oklch(0.65 0.18 250)',
  cyan: 'oklch(0.72 0.14 200)',
  orange: 'oklch(0.72 0.18 55)',
};
const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};

// ─── Toggle Switch Component ────────────────────────────────────────────────
function ToggleSwitch({
  leftLabel,
  rightLabel,
  isRight,
  onChange,
  leftIcon,
  rightIcon,
  accentColor,
}: {
  leftLabel: string;
  rightLabel: string;
  isRight: boolean;
  onChange: (isRight: boolean) => void;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  accentColor?: string;
}) {
  const accent = accentColor || sColor.red;
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(false)}
        style={{
          background: !isRight ? accent : 'transparent',
          color: !isRight ? 'white' : sColor.textDim,
          border: `1px solid ${!isRight ? accent : sColor.border}`,
          borderRadius: '2px 0 0 2px',
          padding: '6px 14px',
          cursor: 'pointer',
          fontFamily: sFont.heading,
          fontSize: '0.85rem',
          letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', gap: '5px',
          transition: 'all 0.15s ease',
        }}
      >
        {leftIcon}{leftLabel}
      </button>
      <button
        onClick={() => onChange(true)}
        style={{
          background: isRight ? accent : 'transparent',
          color: isRight ? 'white' : sColor.textDim,
          border: `1px solid ${isRight ? accent : sColor.border}`,
          borderRadius: '0 2px 2px 0',
          padding: '6px 14px',
          cursor: 'pointer',
          fontFamily: sFont.heading,
          fontSize: '0.85rem',
          letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', gap: '5px',
          marginLeft: '-1px',
          transition: 'all 0.15s ease',
        }}
      >
        {rightIcon}{rightLabel}
      </button>
    </div>
  );
}

// ─── Correction Factor Color ────────────────────────────────────────────────
function getCorrectionColor(factor: number): string {
  const deviation = Math.abs(factor - 1);
  if (deviation < 0.02) return sColor.green;    // Within 2% — on target
  if (deviation < 0.05) return sColor.yellow;   // 2-5% — slight correction
  if (deviation < 0.10) return sColor.orange;   // 5-10% — moderate correction
  return sColor.red;                             // >10% — significant correction
}

// ─── Correction Preview Table ───────────────────────────────────────────────
function CorrectionPreviewTable({
  result,
  map,
}: {
  result: MapCorrectionResult;
  map: FuelMap;
}) {
  const [expanded, setExpanded] = useState(true);

  const configLabel = result.mapKey.replace('alphaN_', 'Alpha-N Cyl ').replace('speedDensity_', 'Speed Density Cyl ');

  // Build a lookup: [row][col] → CellCorrection
  const correctionMap = useMemo(() => {
    const m = new Map<string, CellCorrection>();
    for (const c of result.corrections) {
      m.set(`${c.row}-${c.col}`, c);
    }
    return m;
  }, [result.corrections]);

  // Stats
  const avgFactor = result.corrections.length > 0
    ? result.corrections.reduce((s, c) => s + c.correctionFactor, 0) / result.corrections.length
    : 1;
  const maxDeviation = result.corrections.length > 0
    ? Math.max(...result.corrections.map(c => Math.abs(c.correctionFactor - 1)))
    : 0;

  return (
    <div style={{
      background: 'oklch(0.14 0.008 260)',
      border: `1px solid ${sColor.border}`,
      borderRadius: '3px',
      marginBottom: '12px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
        style={{
          background: 'oklch(0.16 0.008 260)',
          padding: '10px 14px',
          border: 'none',
          cursor: 'pointer',
          color: 'white',
        }}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
          <span style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.06em' }}>
            {configLabel.toUpperCase()}
          </span>
          <span style={{
            fontFamily: sFont.mono, fontSize: '0.72rem',
            color: result.totalCellsCorrected > 0 ? sColor.green : sColor.textDim,
            background: result.totalCellsCorrected > 0 ? 'oklch(0.15 0.04 145)' : 'oklch(0.15 0.006 260)',
            padding: '2px 8px', borderRadius: '2px',
          }}>
            {result.totalCellsCorrected}/{result.totalCellsInMap} CELLS
          </span>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.textDim }}>
            {result.totalSamplesUsed} samples
          </span>
        </div>
        <div className="flex items-center gap-3" style={{ fontFamily: sFont.mono, fontSize: '0.72rem' }}>
          <span style={{ color: getCorrectionColor(avgFactor) }}>
            AVG: {avgFactor.toFixed(3)}x
          </span>
          <span style={{ color: getCorrectionColor(1 + maxDeviation) }}>
            MAX Δ: {(maxDeviation * 100).toFixed(1)}%
          </span>
        </div>
      </button>

      {/* Correction grid */}
      {expanded && result.corrections.length > 0 && (
        <div style={{ padding: '10px 14px', overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontFamily: sFont.mono, fontSize: '0.66rem', width: '100%' }}>
            <thead>
              <tr>
                <th style={{
                  padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                  fontSize: '0.70rem', position: 'sticky', top: 0, left: 0,
                  background: 'oklch(0.14 0.008 260)', zIndex: 3, textAlign: 'left',
                }}>
                  {map.rowLabel}\{map.colLabel}
                </th>
                {map.colAxis.map((v, i) => (
                  <th key={i} style={{
                    padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                    fontSize: '0.68rem', position: 'sticky', top: 0,
                    background: 'oklch(0.14 0.008 260)', zIndex: 2, textAlign: 'center',
                  }}>
                    {v}
                  </th>
                ))}
              </tr>
              {/* Target Lambda row */}
              <tr style={{ borderBottom: `2px solid ${sColor.cyan}` }}>
                <td style={{
                  padding: '3px 6px', color: sColor.cyan, fontFamily: sFont.heading,
                  fontSize: '0.68rem', position: 'sticky', left: 0,
                  background: 'oklch(0.12 0.04 200)', zIndex: 2,
                }}>
                  TARGET λ
                </td>
                {map.targetLambda.map((val, ci) => (
                  <td key={ci} style={{
                    padding: '2px 4px', textAlign: 'center',
                    background: 'oklch(0.12 0.04 200)',
                    color: sColor.cyan, fontSize: '0.66rem', fontWeight: 600,
                  }}>
                    {val.toFixed(3)}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {map.data.map((row, ri) => (
                <tr key={ri}>
                  <td style={{
                    padding: '3px 6px', color: sColor.red, fontFamily: sFont.heading,
                    fontSize: '0.68rem', position: 'sticky', left: 0,
                    background: 'oklch(0.14 0.008 260)', zIndex: 1,
                  }}>
                    {map.rowAxis[ri]}
                  </td>
                  {row.map((val, ci) => {
                    const corr = correctionMap.get(`${ri}-${ci}`);
                    const hasCorrection = !!corr;
                    const factor = corr?.correctionFactor ?? 1;
                    const correctedVal = corr?.correctedValue ?? val;

                    return (
                      <td
                        key={ci}
                        title={hasCorrection
                          ? `Original: ${val.toFixed(3)} → Corrected: ${correctedVal.toFixed(3)}\nFactor: ${factor.toFixed(3)}x | Avg λ: ${corr!.avgActualLambda.toFixed(3)} vs Target: ${corr!.targetLambda.toFixed(3)}\nSamples: ${corr!.sampleCount}`
                          : `${val.toFixed(3)} (no datalog samples)`
                        }
                        style={{
                          padding: '2px 4px',
                          textAlign: 'center',
                          background: hasCorrection ? getCorrectionColor(factor) + '33' : 'transparent',
                          color: hasCorrection ? 'white' : sColor.textDim,
                          fontSize: '0.64rem',
                          fontWeight: hasCorrection ? 600 : 400,
                          border: `1px solid oklch(0.22 0.006 260)`,
                          minWidth: '48px',
                        }}
                      >
                        {hasCorrection ? (
                          <div>
                            <div>{correctedVal.toFixed(3)}</div>
                            <div style={{
                              fontSize: '0.56rem',
                              color: getCorrectionColor(factor),
                              fontWeight: 700,
                            }}>
                              {factor > 1 ? '+' : ''}{((factor - 1) * 100).toFixed(1)}%
                            </div>
                          </div>
                        ) : (
                          val.toFixed(3)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No corrections message */}
      {expanded && result.corrections.length === 0 && (
        <div style={{
          padding: '20px 14px', textAlign: 'center',
          fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim,
        }}>
          No datalog samples matched this fuel table mode. No corrections to apply.
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────
export default function FuelCorrectionPanel({
  fuelMaps,
  wp8Data,
  onApplyCorrections,
  onUpdateTargetLambda,
}: {
  fuelMaps: FuelMapState;
  wp8Data: WP8ParseResult | null;
  onApplyCorrections: (correctedMaps: Partial<FuelMapState>, correctionResults?: MapCorrectionResult[]) => void;
  onUpdateTargetLambda: (mapKey: keyof FuelMapState, targets: number[]) => void;
}) {
  const [vehicleMode, setVehicleMode] = useState<VehicleMode>('na');
  const [mapSensor, setMapSensor] = useState<MapSensor>('stock');
  const [report, setReport] = useState<CorrectionReport | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [preApplyMaps, setPreApplyMaps] = useState<FuelMapState | null>(null);
  const [blendEnabled, setBlendEnabled] = useState(false);

  // Auto-detect turbo on mount / data change
  const isTurboDetected = useMemo(() => {
    if (!wp8Data) return false;
    return detectTurbo(wp8Data);
  }, [wp8Data]);

  // Check readiness
  const hasDatalog = !!wp8Data;
  const hasAnyMap = Object.values(fuelMaps).some(Boolean);
  const canCorrect = hasDatalog && hasAnyMap;

  // Run correction
  const handleCorrect = useCallback(() => {
    if (!wp8Data) return;
    const config: CorrectionConfig = { vehicleMode, mapSensor };
    const result = computeCorrections(fuelMaps, wp8Data, config);
    setReport(result);
    setHasApplied(false);
    setPreApplyMaps(null);
  }, [fuelMaps, wp8Data, vehicleMode, mapSensor]);

  // Apply corrections to fuel maps
  const handleApply = useCallback(() => {
    if (!report) return;
    // Save pre-apply state for revert
    setPreApplyMaps({ ...fuelMaps });

    const corrected: Partial<FuelMapState> = {};
    for (const result of report.results) {
      const map = fuelMaps[result.mapKey];
      if (map && result.corrections.length > 0) {
        if (blendEnabled) {
          corrected[result.mapKey] = blendCorrectedMap(map, result.corrections);
        } else {
          corrected[result.mapKey] = applyCorrectionToMap(map, result.corrections);
        }
      }
    }
    onApplyCorrections(corrected, report.results);
    setHasApplied(true);
  }, [report, fuelMaps, onApplyCorrections, blendEnabled]);

  // Revert corrections
  const handleRevert = useCallback(() => {
    if (preApplyMaps) {
      onApplyCorrections(preApplyMaps); // no correctionResults = clear highlights
      setHasApplied(false);
      setPreApplyMaps(null);
    }
  }, [preApplyMaps, onApplyCorrections]);

  // Apply target lambda presets when mode/sensor changes
  const handleApplyPresets = useCallback(() => {
    const config: CorrectionConfig = { vehicleMode, mapSensor };
    const mapKeys: (keyof FuelMapState)[] = [
      'alphaN_cyl1', 'alphaN_cyl2',
      'speedDensity_cyl1', 'speedDensity_cyl2',
    ];
    for (const key of mapKeys) {
      const map = fuelMaps[key];
      if (map) {
        const targets = getTargetLambdaPreset(key, map.colAxis, config);
        onUpdateTargetLambda(key, targets);
      }
    }
  }, [vehicleMode, mapSensor, fuelMaps, onUpdateTargetLambda]);

  return (
    <div style={{
      background: sColor.card,
      border: `1px solid ${sColor.border}`,
      borderRadius: '3px',
      padding: '16px',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Wrench style={{ width: 20, height: 20, color: sColor.red }} />
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.4rem', letterSpacing: '0.08em', color: 'white', margin: 0 }}>
            CORRECT FUEL TABLES
          </h3>
        </div>
        {isTurboDetected && (
          <div className="flex items-center gap-2" style={{
            background: 'oklch(0.18 0.06 55)',
            padding: '4px 10px', borderRadius: '2px',
            fontFamily: sFont.mono, fontSize: '0.72rem', color: sColor.orange,
          }}>
            <Zap style={{ width: 12, height: 12 }} />
            TURBO DETECTED IN LOG
          </div>
        )}
      </div>

      {/* Configuration row */}
      <div className="flex flex-wrap items-center gap-4 mb-4" style={{
        background: 'oklch(0.14 0.008 260)',
        border: `1px solid ${sColor.border}`,
        borderRadius: '3px',
        padding: '12px 16px',
      }}>
        {/* Turbo/NA Toggle */}
        <div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textDim, marginBottom: '4px' }}>
            VEHICLE TYPE
          </div>
          <ToggleSwitch
            leftLabel="N/A"
            rightLabel="TURBO"
            isRight={vehicleMode === 'turbo'}
            onChange={(isTurbo) => setVehicleMode(isTurbo ? 'turbo' : 'na')}
            leftIcon={<Wind style={{ width: 13, height: 13 }} />}
            rightIcon={<Zap style={{ width: 13, height: 13 }} />}
            accentColor={vehicleMode === 'turbo' ? sColor.orange : sColor.blue}
          />
        </div>

        {/* MAP Sensor Toggle (turbo only) */}
        {vehicleMode === 'turbo' && (
          <div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textDim, marginBottom: '4px' }}>
              MAP SENSOR
            </div>
            <ToggleSwitch
              leftLabel="STOCK"
              rightLabel="3-BAR"
              isRight={mapSensor === '3bar'}
              onChange={(is3bar) => setMapSensor(is3bar ? '3bar' : 'stock')}
              leftIcon={<Gauge style={{ width: 13, height: 13 }} />}
              rightIcon={<Gauge style={{ width: 13, height: 13 }} />}
              accentColor={sColor.cyan}
            />
          </div>
        )}

        {/* Apply Presets Button */}
        <div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textDim, marginBottom: '4px' }}>
            TARGET LAMBDA
          </div>
          <button
            onClick={handleApplyPresets}
            disabled={!hasAnyMap}
            style={{
              background: hasAnyMap ? sColor.cyan : 'oklch(0.20 0.006 260)',
              color: hasAnyMap ? 'white' : sColor.textDim,
              border: 'none',
              borderRadius: '2px',
              padding: '6px 14px',
              cursor: hasAnyMap ? 'pointer' : 'not-allowed',
              fontFamily: sFont.heading,
              fontSize: '0.85rem',
              letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <Target style={{ width: 13, height: 13 }} />
            APPLY PRESETS
          </button>
        </div>

        {/* Blend/Smooth Toggle */}
        <div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textDim, marginBottom: '4px' }}>
            BLEND
          </div>
          <button
            onClick={() => setBlendEnabled(!blendEnabled)}
            style={{
              background: blendEnabled ? sColor.green : 'transparent',
              color: blendEnabled ? 'white' : sColor.textDim,
              border: `1px solid ${blendEnabled ? sColor.green : sColor.border}`,
              borderRadius: '2px',
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: sFont.heading,
              fontSize: '0.85rem',
              letterSpacing: '0.06em',
              display: 'flex', alignItems: 'center', gap: '5px',
              transition: 'all 0.15s ease',
            }}
          >
            {blendEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Correct Button */}
        <div style={{ marginLeft: 'auto' }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textDim, marginBottom: '4px' }}>
            &nbsp;
          </div>
          <button
            onClick={handleCorrect}
            disabled={!canCorrect}
            style={{
              background: canCorrect ? sColor.red : 'oklch(0.20 0.006 260)',
              color: canCorrect ? 'white' : sColor.textDim,
              border: 'none',
              borderRadius: '2px',
              padding: '8px 20px',
              cursor: canCorrect ? 'pointer' : 'not-allowed',
              fontFamily: sFont.heading,
              fontSize: '1rem',
              letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            <Wrench style={{ width: 15, height: 15 }} />
            CORRECT FUEL TABLES
          </button>
        </div>
      </div>

      {/* Preset info */}
      <div className="flex items-start gap-2 mb-4" style={{
        fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.textDim,
        background: 'oklch(0.12 0.02 250)',
        border: `1px solid oklch(0.18 0.03 250)`,
        borderRadius: '3px', padding: '8px 12px',
      }}>
        <Info style={{ width: 14, height: 14, marginTop: '2px', flexShrink: 0, color: sColor.blue }} />
        <div>
          {vehicleMode === 'na' ? (
            <>
              <strong style={{ color: sColor.blue }}>NA Mode:</strong> SD targets = 0.95 all columns.
              Alpha-N targets = 0.95 (0-40° TPS), 0.90 (45°), 0.85 (50°+).
            </>
          ) : mapSensor === 'stock' ? (
            <>
              <strong style={{ color: sColor.orange }}>Turbo + Stock MAP:</strong> SD targets = 0.95 (&lt;100 kPa),
              0.90 (100-120), 0.85 (120-145), 0.80 (&gt;145). Alpha-N = 0.95 all columns.
              SD column lookup uses Desired Injector Pulsewidth interpolation.
            </>
          ) : (
            <>
              <strong style={{ color: sColor.orange }}>Turbo + 3-Bar MAP:</strong> SD targets = 0.95 (&lt;60 kPa),
              0.90 (60-80), 0.85 (80-90), 0.80 (&gt;90). Alpha-N = 0.95 all columns.
              SD column lookup uses Desired Injector Pulsewidth interpolation.
            </>
          )}
          <span style={{ color: sColor.textDim, marginLeft: '4px' }}>
            All targets are editable in the fuel map tables above.
          </span>
        </div>
      </div>

      {/* Requirements check */}
      {!canCorrect && (
        <div style={{
          background: 'oklch(0.14 0.04 55)',
          border: `1px solid oklch(0.22 0.06 55)`,
          borderRadius: '3px', padding: '12px 16px', marginBottom: '12px',
        }}>
          <div className="flex items-center gap-2 mb-2" style={{ fontFamily: sFont.heading, fontSize: '1rem', color: sColor.yellow, letterSpacing: '0.06em' }}>
            <AlertTriangle style={{ width: 16, height: 16 }} />
            REQUIREMENTS
          </div>
          <ul style={{ fontFamily: sFont.body, fontSize: '0.82rem', color: sColor.textDim, margin: 0, paddingLeft: '20px' }}>
            {!hasDatalog && <li style={{ color: sColor.yellow }}>Load a WP8 datalog with AFR channels</li>}
            {!hasAnyMap && <li style={{ color: sColor.yellow }}>Load at least one fuel table</li>}
          </ul>
        </div>
      )}

      {/* Correction Report */}
      {report && (
        <div>
          {/* Report summary */}
          <div className="flex flex-wrap items-center gap-4 mb-3" style={{
            background: 'oklch(0.14 0.008 260)',
            border: `1px solid ${sColor.border}`,
            borderRadius: '3px', padding: '10px 16px',
            fontFamily: sFont.mono, fontSize: '0.75rem',
          }}>
            <span style={{ color: sColor.green }}>
              {report.lambdaSource === 'lambda'
                ? `λ1: ${report.hasLambda1 ? 'YES' : 'NO'} | λ2: ${report.hasLambda2 ? 'YES' : 'NO'}`
                : `AFR1: ${report.hasAfr1 ? 'YES' : 'NO'} | AFR2: ${report.hasAfr2 ? 'YES' : 'NO'}`
              }
              {report.lambdaSource === 'lambda' && <span style={{ color: sColor.orange, marginLeft: 6 }}>[DYNO]</span>}
              {(!report.hasAfr2 && !report.hasLambda2) && <span style={{ color: sColor.yellow, marginLeft: 6 }}>[SINGLE SENSOR]</span>}
            </span>
            <span style={{ color: sColor.textDim }}>
              TOTAL: {report.totalSamples} samples
              {report.decelSamplesSkipped > 0 && ` (−${report.decelSamplesSkipped} decel)`}
              {report.transientSamplesSkipped > 0 && ` (−${report.transientSamplesSkipped} transient)`}
            </span>
            <span style={{ color: sColor.cyan }}>
              ALPHA-N: {report.alphaNSamples} | SD: {report.sdSamples}
            </span>
            <span style={{ color: report.isTurboDetected ? sColor.orange : sColor.blue }}>
              {report.isTurboDetected ? 'TURBO DETECTED' : 'NA DETECTED'}
            </span>
            {report.hasStft && (
              <span style={{ color: sColor.yellow }}>STFT APPLIED</span>
            )}
            {report.hasInjPwFinal && (
              <span style={{ color: sColor.cyan }}>TRANSIENT FILTER ON</span>
            )}
            {blendEnabled && (
              <span style={{ color: sColor.green }}>BLEND ON</span>
            )}
          </div>

          {/* Transient fueling tuner notes */}
          {report.transientNotes.length > 0 && (
            <div style={{
              marginTop: 8,
              padding: '10px 14px',
              background: 'oklch(0.18 0.008 260)',
              borderLeft: `3px solid ${sColor.orange}`,
            }}>
              <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.orange, marginBottom: 6 }}>
                TRANSIENT FUELING NOTES
              </div>
              {report.transientNotes.map((note, idx) => (
                <div key={idx} style={{
                  fontFamily: sFont.mono,
                  fontSize: '0.75rem',
                  color: note.severity === 'critical' ? 'oklch(0.70 0.22 25)' : sColor.yellow,
                  marginBottom: 4,
                  lineHeight: 1.4,
                }}>
                  {note.message}
                  <span style={{ color: sColor.textDim, marginLeft: 8 }}>
                    ({note.sampleCount} samples, RPM {note.rpmRange[0].toFixed(0)}–{note.rpmRange[1].toFixed(0)})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Per-map correction previews */}
          {report.results.map(result => {
            const map = fuelMaps[result.mapKey];
            if (!map) return null;
            return (
              <CorrectionPreviewTable
                key={result.mapKey}
                result={result}
                map={map}
              />
            );
          })}

          {/* Apply / Revert buttons */}
          <div className="flex items-center gap-3 mt-3">
            {!hasApplied ? (
              <button
                onClick={handleApply}
                disabled={report.results.every(r => r.corrections.length === 0)}
                style={{
                  background: report.results.some(r => r.corrections.length > 0) ? sColor.green : 'oklch(0.20 0.006 260)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '2px',
                  padding: '10px 24px',
                  cursor: report.results.some(r => r.corrections.length > 0) ? 'pointer' : 'not-allowed',
                  fontFamily: sFont.heading,
                  fontSize: '1.1rem',
                  letterSpacing: '0.08em',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <CheckCircle style={{ width: 16, height: 16 }} />
                APPLY CORRECTIONS
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2" style={{
                  fontFamily: sFont.mono, fontSize: '0.82rem', color: sColor.green,
                  background: 'oklch(0.15 0.04 145)',
                  padding: '8px 16px', borderRadius: '2px',
                }}>
                  <CheckCircle style={{ width: 14, height: 14 }} />
                  CORRECTIONS APPLIED
                </div>
                <button
                  onClick={handleRevert}
                  style={{
                    background: 'transparent',
                    color: sColor.yellow,
                    border: `1px solid ${sColor.yellow}`,
                    borderRadius: '2px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontFamily: sFont.heading,
                    fontSize: '0.9rem',
                    letterSpacing: '0.06em',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <RotateCcw style={{ width: 14, height: 14 }} />
                  REVERT
                </button>
                <button
                  onClick={() => {
                    // Export all corrected fuel maps as CSV files
                    for (const result of report.results) {
                      const map = fuelMaps[result.mapKey];
                      if (!map || result.corrections.length === 0) continue;
                      // Apply corrections to get the corrected map
                      const correctedMap = blendEnabled
                        ? blendCorrectedMap(map, result.corrections)
                        : applyCorrectionToMap(map, result.corrections);
                      // Build CSV
                      const lines: string[] = [];
                      lines.push([`${correctedMap.rowLabel}\\${correctedMap.colLabel}`, ...correctedMap.colAxis.map(v => v.toString())].join(','));
                      for (let ri = 0; ri < correctedMap.rowAxis.length; ri++) {
                        lines.push([correctedMap.rowAxis[ri].toString(), ...correctedMap.data[ri].map(v => v.toFixed(3))].join(','));
                      }
                      const csv = lines.join('\n') + '\n';
                      const safeName = result.mapKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, '_');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${safeName}_corrected.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }
                  }}
                  style={{
                    background: 'transparent',
                    color: sColor.cyan,
                    border: `1px solid ${sColor.cyan}`,
                    borderRadius: '2px',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontFamily: sFont.heading,
                    fontSize: '0.9rem',
                    letterSpacing: '0.06em',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <Download style={{ width: 14, height: 14 }} />
                  EXPORT ALL CSV
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
