/**
 * VirtualDynoPanel — Honda Talon Virtual Dyno UI
 *
 * Displays estimated HP/Torque curves from WP8 datalogs.
 * Supports injector/fuel type selection, dyno calibration, and fullscreen chart.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Gauge, Zap, Fuel, AlertTriangle, Maximize2, Minimize2,
  TrendingUp, Settings2, Info, ChevronDown,
} from 'lucide-react';
import { WP8ParseResult } from '@/lib/wp8Parser';
import {
  VirtualDynoConfig, VirtualDynoResult, InjectorType, FuelType, TurboType,
  INJECTOR_FLOW_RATES, FUEL_PROFILES,
  computeVirtualDyno, smoothCurve, isDynoLog,
  detectInjectorType, detectFuelType, detectTurboType,
} from '@/lib/talonVirtualDyno';

// ─── Style constants (matches PPEI motorsport dark) ─────────────────────────
const sColor = {
  bg: '#0a0a0a',
  card: 'oklch(0.15 0.006 260)',
  cardBorder: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.68 0.20 25)',
  redBright: 'oklch(0.74 0.22 25)',
  green: 'oklch(0.75 0.18 145)',
  blue: 'oklch(0.65 0.18 250)',
  yellow: 'oklch(0.80 0.18 90)',
  textWhite: '#ffffff',
  textDim: 'oklch(0.55 0.008 260)',
  border: 'oklch(0.22 0.008 260)',
};

const sFont = {
  heading: "'Bebas Neue', sans-serif",
  body: "'Rajdhani', sans-serif",
  mono: "'Share Tech Mono', monospace",
};

// ─── Chart Component ──────────────────────────────────────────────────────────

function DynoChart({
  result,
  smoothed,
  isFullscreen,
  onToggleFullscreen,
}: {
  result: VirtualDynoResult;
  smoothed: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const curve = smoothed ? smoothCurve(result.hpCurve, 3) : result.hpCurve;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || curve.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 40, right: 70, bottom: 50, left: 60 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Clear
    ctx.fillStyle = sColor.bg;
    ctx.fillRect(0, 0, W, H);

    // Data ranges
    const rpms = curve.map(p => p.rpm);
    const hps = curve.map(p => p.hp);
    const torques = curve.map(p => p.torque);
    const minRPM = Math.min(...rpms);
    const maxRPM = Math.max(...rpms);
    const maxHP = Math.max(...hps) * 1.1;
    const maxTorque = Math.max(...torques) * 1.1;

    const xScale = (rpm: number) => PAD.left + ((rpm - minRPM) / (maxRPM - minRPM)) * plotW;
    const yScaleHP = (hp: number) => PAD.top + plotH - (hp / maxHP) * plotH;
    const yScaleTorque = (tq: number) => PAD.top + plotH - (tq / maxTorque) * plotH;

    // Grid lines
    ctx.strokeStyle = 'oklch(0.20 0.006 260)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = PAD.top + (plotH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
    }

    // RPM grid
    const rpmStep = Math.ceil((maxRPM - minRPM) / 8 / 500) * 500;
    for (let rpm = Math.ceil(minRPM / rpmStep) * rpmStep; rpm <= maxRPM; rpm += rpmStep) {
      const x = xScale(rpm);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();

      // RPM label
      ctx.fillStyle = sColor.textDim;
      ctx.font = `11px ${sFont.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(rpm.toString(), x, PAD.top + plotH + 20);
    }

    // Y-axis labels — HP (left)
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const val = Math.round((maxHP / 5) * (5 - i));
      const y = PAD.top + (plotH / 5) * i;
      ctx.fillStyle = sColor.redBright;
      ctx.fillText(val.toString(), PAD.left - 8, y + 4);
    }

    // Y-axis labels — Torque (right)
    ctx.textAlign = 'left';
    for (let i = 0; i <= 5; i++) {
      const val = Math.round((maxTorque / 5) * (5 - i));
      const y = PAD.top + (plotH / 5) * i;
      ctx.fillStyle = sColor.blue;
      ctx.fillText(val.toString(), W - PAD.right + 8, y + 4);
    }

    // Draw HP curve
    ctx.strokeStyle = sColor.redBright;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    curve.forEach((pt, i) => {
      const x = xScale(pt.rpm);
      const y = yScaleHP(pt.hp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // HP fill
    ctx.fillStyle = 'oklch(0.74 0.22 25 / 0.08)';
    ctx.beginPath();
    ctx.moveTo(xScale(curve[0].rpm), PAD.top + plotH);
    curve.forEach(pt => ctx.lineTo(xScale(pt.rpm), yScaleHP(pt.hp)));
    ctx.lineTo(xScale(curve[curve.length - 1].rpm), PAD.top + plotH);
    ctx.closePath();
    ctx.fill();

    // Draw Torque curve
    ctx.strokeStyle = sColor.blue;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    curve.forEach((pt, i) => {
      const x = xScale(pt.rpm);
      const y = yScaleTorque(pt.torque);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Torque fill
    ctx.fillStyle = 'oklch(0.65 0.18 250 / 0.08)';
    ctx.beginPath();
    ctx.moveTo(xScale(curve[0].rpm), PAD.top + plotH);
    curve.forEach(pt => ctx.lineTo(xScale(pt.rpm), yScaleTorque(pt.torque)));
    ctx.lineTo(xScale(curve[curve.length - 1].rpm), PAD.top + plotH);
    ctx.closePath();
    ctx.fill();

    // Peak markers
    const peakHPPt = curve.find(p => p.hp === Math.max(...hps));
    const peakTqPt = curve.find(p => p.torque === Math.max(...torques));

    if (peakHPPt) {
      const x = xScale(peakHPPt.rpm);
      const y = yScaleHP(peakHPPt.hp);
      ctx.fillStyle = sColor.redBright;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `bold 12px ${sFont.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${peakHPPt.hp} HP`, x, y - 12);
    }

    if (peakTqPt) {
      const x = xScale(peakTqPt.rpm);
      const y = yScaleTorque(peakTqPt.torque);
      ctx.fillStyle = sColor.blue;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `bold 12px ${sFont.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${peakTqPt.torque} ft-lb`, x, y - 12);
    }

    // Axis titles
    ctx.fillStyle = sColor.textDim;
    ctx.font = `13px ${sFont.body}`;
    ctx.textAlign = 'center';
    ctx.fillText('RPM', PAD.left + plotW / 2, H - 8);

    // Legend
    ctx.font = `12px ${sFont.body}`;
    const legendY = 18;
    ctx.fillStyle = sColor.redBright;
    ctx.fillRect(PAD.left, legendY - 8, 14, 3);
    ctx.fillText('HP', PAD.left + 28, legendY);
    ctx.fillStyle = sColor.blue;
    ctx.fillRect(PAD.left + 60, legendY - 8, 14, 3);
    ctx.fillText('TORQUE (ft-lb)', PAD.left + 130, legendY);

    // Dyno badge
    if (result.isDynoLog) {
      ctx.fillStyle = sColor.green;
      ctx.font = `bold 11px ${sFont.mono}`;
      ctx.textAlign = 'right';
      ctx.fillText('[DYNO DATA]', W - PAD.right, legendY);
    } else {
      ctx.fillStyle = sColor.yellow;
      ctx.font = `bold 11px ${sFont.mono}`;
      ctx.textAlign = 'right';
      ctx.fillText('[VIRTUAL ESTIMATE]', W - PAD.right, legendY);
    }

  }, [curve, result, isFullscreen]);

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: isFullscreen ? 'calc(100vh - 200px)' : '340px',
          display: 'block',
          borderRadius: '2px',
          border: `1px solid ${sColor.cardBorder}`,
        }}
      />
      <button
        onClick={onToggleFullscreen}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'oklch(0.15 0.006 260 / 0.8)',
          border: `1px solid ${sColor.border}`,
          color: sColor.textWhite, cursor: 'pointer',
          padding: '4px 8px', borderRadius: '2px',
          display: 'flex', alignItems: 'center', gap: '4px',
          fontFamily: sFont.mono, fontSize: '0.7rem',
        }}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        {isFullscreen ? 'EXIT' : 'FULLSCREEN'}
      </button>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function VirtualDynoPanel({
  wp8Data,
  fileName,
}: {
  wp8Data: WP8ParseResult | null;
  fileName: string;
}) {
  // Auto-detect from filename
  const autoInjector = useMemo(() => detectInjectorType(fileName, wp8Data?.partNumber || ''), [fileName, wp8Data]);
  const autoFuel = useMemo(() => detectFuelType(fileName, wp8Data?.partNumber || ''), [fileName, wp8Data]);
  const autoTurboType = useMemo((): TurboType => {
    const fromName = detectTurboType(fileName, wp8Data?.partNumber || '');
    if (fromName !== 'na') return fromName;
    // No MAP-based fallback in this panel (no channel access here)
    return 'na';
  }, [fileName, wp8Data]);

  const [injectorType, setInjectorType] = useState<InjectorType>(autoInjector);
  const [fuelType, setFuelType] = useState<FuelType>(autoFuel);
  const [turboType, setTurboType] = useState<TurboType>(autoTurboType);
  const [calibrationFactor, setCalibrationFactor] = useState(1.0);
  const [smoothed, setSmoothed] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Update auto-detected values when file changes
  useEffect(() => {
    setInjectorType(autoInjector);
    setFuelType(autoFuel);
    setTurboType(autoTurboType);
  }, [autoInjector, autoFuel, autoTurboType]);

  // Compute virtual dyno
  const result = useMemo<VirtualDynoResult | null>(() => {
    if (!wp8Data) return null;

    const config: VirtualDynoConfig = {
      injectorType,
      fuelType,
      isTurbo: turboType !== 'na',
      turboType,
      dynoCalibrationFactor: calibrationFactor,
    };

    return computeVirtualDyno(wp8Data, config, fileName);
  }, [wp8Data, injectorType, fuelType, turboType, calibrationFactor, fileName]);

  // Learn calibration from dyno log
  useEffect(() => {
    if (result && result.isDynoLog && result.calibrationFactor !== calibrationFactor) {
      setCalibrationFactor(result.calibrationFactor);
    }
  }, [result?.isDynoLog, result?.calibrationFactor]);

  if (!wp8Data) {
    return (
      <div style={{
        background: sColor.card, border: `1px solid ${sColor.cardBorder}`,
        padding: '40px', textAlign: 'center', borderRadius: '2px',
      }}>
        <Gauge style={{ width: 48, height: 48, color: sColor.textDim, margin: '0 auto 16px' }} />
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: sColor.textWhite, letterSpacing: '0.1em' }}>
          VIRTUAL DYNO
        </h3>
        <p style={{ fontFamily: sFont.body, color: sColor.textDim, fontSize: '0.85rem', marginTop: '8px' }}>
          Upload a WP8 datalog to estimate HP and Torque curves
        </p>
      </div>
    );
  }

  if (!result || result.hpCurve.length < 3) {
    return (
      <div style={{
        background: sColor.card, border: `1px solid ${sColor.cardBorder}`,
        padding: '40px', textAlign: 'center', borderRadius: '2px',
      }}>
        <AlertTriangle style={{ width: 48, height: 48, color: sColor.yellow, margin: '0 auto 16px' }} />
        <h3 style={{ fontFamily: sFont.heading, fontSize: '1.2rem', color: sColor.textWhite, letterSpacing: '0.1em' }}>
          INSUFFICIENT DATA
        </h3>
        <p style={{ fontFamily: sFont.body, color: sColor.textDim, fontSize: '0.85rem', marginTop: '8px' }}>
          Not enough data points to generate a dyno curve. Need WOT pulls with RPM above 1500.
        </p>
        {result?.warnings.map((w, i) => (
          <p key={i} style={{ fontFamily: sFont.mono, color: sColor.yellow, fontSize: '0.75rem', marginTop: '4px' }}>
            {w}
          </p>
        ))}
      </div>
    );
  }

  const confidenceColor = result.confidence === 'high' ? sColor.green
    : result.confidence === 'medium' ? sColor.yellow : sColor.red;

  const injectorLabel: Record<InjectorType, string> = {
    stock: 'Stock (~310cc)',
    kw800: 'FIC 800cc (KW)',
    id1050: 'ID1050X (1050cc)',
    id1300: 'ID1300X (1300cc)',
  };

  return (
    <div style={{
      ...(isFullscreen ? {
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 9999, background: sColor.bg, padding: '16px', overflow: 'auto',
      } : {}),
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ fontFamily: sFont.heading, fontSize: '1.3rem', color: sColor.textWhite, letterSpacing: '0.1em', margin: 0 }}>
            <Gauge style={{ width: 20, height: 20, display: 'inline', marginRight: 8, verticalAlign: 'text-bottom' }} />
            VIRTUAL DYNO
          </h3>
          {result.isDynoLog && (
            <span style={{
              fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.green,
              background: 'oklch(0.75 0.18 145 / 0.15)', padding: '2px 8px',
              border: `1px solid oklch(0.75 0.18 145 / 0.3)`, borderRadius: '2px',
            }}>
              DYNO LOG
            </span>
          )}
          <span style={{
            fontFamily: sFont.mono, fontSize: '0.7rem', color: confidenceColor,
            background: `color-mix(in oklch, ${confidenceColor} 15%, transparent)`,
            padding: '2px 8px', border: `1px solid color-mix(in oklch, ${confidenceColor} 30%, transparent)`,
            borderRadius: '2px',
          }}>
            {result.confidence.toUpperCase()} CONFIDENCE
          </span>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: 'transparent', border: `1px solid ${sColor.border}`,
            color: sColor.textDim, cursor: 'pointer', padding: '4px 12px',
            fontFamily: sFont.mono, fontSize: '0.75rem', borderRadius: '2px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}
        >
          <Settings2 size={14} />
          CONFIG
          <ChevronDown size={12} style={{ transform: showSettings ? 'rotate(180deg)' : 'none' }} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={{
          background: sColor.card, border: `1px solid ${sColor.cardBorder}`,
          padding: '16px', marginBottom: '12px', borderRadius: '2px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px',
        }}>
          {/* Injector Type */}
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
              INJECTOR TYPE {autoInjector !== 'stock' && <span style={{ color: sColor.green }}>(AUTO-DETECTED)</span>}
            </label>
            <select
              value={injectorType}
              onChange={e => setInjectorType(e.target.value as InjectorType)}
              style={{
                width: '100%', background: sColor.bg, color: sColor.textWhite,
                border: `1px solid ${sColor.border}`, padding: '6px 8px',
                fontFamily: sFont.mono, fontSize: '0.8rem', borderRadius: '2px',
              }}
            >
              <option value="stock">Stock (~310cc)</option>
              <option value="id1050">ID1050X (1050cc)</option>
              <option value="id1300">ID1300X (1300cc)</option>
            </select>
          </div>

          {/* Fuel Type */}
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
              FUEL TYPE {autoFuel !== 'pump' && <span style={{ color: sColor.green }}>(AUTO-DETECTED)</span>}
            </label>
            <select
              value={fuelType}
              onChange={e => setFuelType(e.target.value as FuelType)}
              style={{
                width: '100%', background: sColor.bg, color: sColor.textWhite,
                border: `1px solid ${sColor.border}`, padding: '6px 8px',
                fontFamily: sFont.mono, fontSize: '0.8rem', borderRadius: '2px',
              }}
            >
              {Object.entries(FUEL_PROFILES).map(([key, profile]) => (
                <option key={key} value={key}>{profile.name}</option>
              ))}
            </select>
          </div>

          {/* Turbo Kit Selector */}
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
              TURBO KIT {autoTurboType !== 'na' && <span style={{ color: sColor.green }}>(AUTO)</span>}
            </label>
            <select
              value={turboType}
              onChange={e => setTurboType(e.target.value as TurboType)}
              style={{
                width: '100%', background: sColor.bg, color: sColor.textWhite,
                border: `1px solid ${sColor.border}`, padding: '6px 8px',
                fontFamily: sFont.mono, fontSize: '0.8rem', borderRadius: '2px',
              }}
            >
              <option value="na">NA (No Turbo)</option>
              <option value="jr">Jackson Racing (JR)</option>
              <option value="kw">Kraftwerks (KW)</option>
              <option value="fp">Full Performance (FP)</option>
              <option value="generic_turbo">Turbo (Generic)</option>
            </select>
          </div>

          {/* Calibration Factor */}
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
              CALIBRATION FACTOR {result.isDynoLog && <span style={{ color: sColor.green }}>(LEARNED)</span>}
            </label>
            <input
              type="number"
              value={calibrationFactor}
              onChange={e => setCalibrationFactor(parseFloat(e.target.value) || 1.0)}
              step={0.01}
              min={0.5}
              max={2.0}
              style={{
                width: '100%', background: sColor.bg, color: sColor.textWhite,
                border: `1px solid ${sColor.border}`, padding: '6px 8px',
                fontFamily: sFont.mono, fontSize: '0.8rem', borderRadius: '2px',
              }}
            />
          </div>

          {/* Smooth Toggle */}
          <div>
            <label style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, display: 'block', marginBottom: '4px' }}>
              CURVE SMOOTHING
            </label>
            <button
              onClick={() => setSmoothed(!smoothed)}
              style={{
                width: '100%', padding: '6px', fontFamily: sFont.mono, fontSize: '0.8rem',
                background: smoothed ? sColor.green : 'transparent',
                color: smoothed ? sColor.bg : sColor.textDim,
                border: `1px solid ${smoothed ? sColor.green : sColor.border}`,
                cursor: 'pointer', borderRadius: '2px',
              }}
            >
              {smoothed ? 'SMOOTHED' : 'RAW'}
            </button>
          </div>
        </div>
      )}

      {/* Peak Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '8px', marginBottom: '12px',
      }}>
        <div style={{
          background: sColor.card, border: `1px solid ${sColor.cardBorder}`,
          padding: '12px', borderRadius: '2px', textAlign: 'center',
          borderLeft: `3px solid ${sColor.redBright}`,
        }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, letterSpacing: '0.1em' }}>
            PEAK HP
          </div>
          <div style={{ fontFamily: sFont.heading, fontSize: '2rem', color: sColor.redBright, lineHeight: 1 }}>
            {result.peakHP}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
            @ {result.peakHPRpm} RPM
          </div>
        </div>

        <div style={{
          background: sColor.card, border: `1px solid ${sColor.cardBorder}`,
          padding: '12px', borderRadius: '2px', textAlign: 'center',
          borderLeft: `3px solid ${sColor.blue}`,
        }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, letterSpacing: '0.1em' }}>
            PEAK TORQUE
          </div>
          <div style={{ fontFamily: sFont.heading, fontSize: '2rem', color: sColor.blue, lineHeight: 1 }}>
            {result.peakTorque}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
            @ {result.peakTorqueRpm} RPM · ft-lb
          </div>
        </div>

        <div style={{
          background: sColor.card, border: `1px solid ${sColor.cardBorder}`,
          padding: '12px', borderRadius: '2px', textAlign: 'center',
          borderLeft: `3px solid ${sColor.green}`,
        }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, letterSpacing: '0.1em' }}>
            INJECTORS
          </div>
          <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.green, lineHeight: 1.2, marginTop: '4px' }}>
            {injectorLabel[injectorType]}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
            {INJECTOR_FLOW_RATES[injectorType]} cc/min
          </div>
        </div>

        <div style={{
          background: sColor.card, border: `1px solid ${sColor.cardBorder}`,
          padding: '12px', borderRadius: '2px', textAlign: 'center',
          borderLeft: `3px solid ${sColor.yellow}`,
        }}>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim, letterSpacing: '0.1em' }}>
            FUEL
          </div>
          <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.yellow, lineHeight: 1.2, marginTop: '4px' }}>
            {FUEL_PROFILES[fuelType].name}
          </div>
          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>
            Stoich: {FUEL_PROFILES[fuelType].stoichAFR}:1
          </div>
        </div>
      </div>

      {/* Dyno Chart */}
      <DynoChart
        result={result}
        smoothed={smoothed}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
      />

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div style={{
          marginTop: '8px', padding: '8px 12px',
          background: 'oklch(0.80 0.18 90 / 0.08)',
          border: `1px solid oklch(0.80 0.18 90 / 0.2)`,
          borderRadius: '2px',
        }}>
          {result.warnings.map((w, i) => (
            <div key={i} style={{
              fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.yellow,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <AlertTriangle size={12} /> {w}
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{
        marginTop: '8px', padding: '8px 12px',
        background: 'oklch(0.15 0.006 260 / 0.5)',
        border: `1px solid ${sColor.border}`,
        borderRadius: '2px',
        display: 'flex', alignItems: 'flex-start', gap: '8px',
      }}>
        <Info size={14} style={{ color: sColor.textDim, flexShrink: 0, marginTop: '2px' }} />
        <p style={{
          fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim,
          margin: 0, lineHeight: 1.5,
        }}>
          Virtual dyno estimates are approximations based on fuel flow calculations and may not reflect
          actual wheel horsepower. Results depend on injector size, fuel type, atmospheric conditions,
          and sensor accuracy. For accurate measurements, use a chassis dynamometer.
          {result.isDynoLog && ` Calibration factor: ${calibrationFactor.toFixed(3)} (learned from dyno data).`}
        </p>
      </div>

      {/* Data point count */}
      <div style={{
        marginTop: '4px', fontFamily: sFont.mono, fontSize: '0.65rem',
        color: sColor.textDim, textAlign: 'right',
      }}>
        {result.dataPoints.length} data points · {result.hpCurve.length} RPM bins · Cal: {calibrationFactor.toFixed(3)}
      </div>
    </div>
  );
}
