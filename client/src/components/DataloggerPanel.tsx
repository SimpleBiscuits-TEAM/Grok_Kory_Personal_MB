/**
 * DataloggerPanel — Live OBD-II Datalogger
 * 
 * Features:
 * - WebSerial: ELM327 adapters (OBDLink EX, MX+, SX, STN2xx)
 * - Raw CAN: PCAN-USB via local Python WebSocket bridge; V-OP Can2USB USB–CAN bridge (Web Serial)
 * - Standard Mode 01 + GM Mode 22 extended PIDs (diesel-specific)
 * - PID selection with built-in and user-customizable preset groups
 * - Real-time gauge display with live values
 * - Real-time scrolling chart
 * - Session recording with CSV export
 * - Direct handoff to Analyzer tab
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import {
  Wifi, WifiOff, Play, Square, Download, BarChart3,
  Settings, AlertCircle, CheckCircle, Loader2, Gauge,
  Activity, Zap, ChevronDown, ChevronRight, RefreshCw,
  Trash2, Terminal, Radio, Cpu, Plus, Edit2, Save, X,
  Flame, Droplets, Wind, Thermometer, Star,
  Search, Radar, ShieldAlert, ShieldCheck, ShieldX, Info, Eraser
} from 'lucide-react';
import type { DTCReadResult, DTCCode, DTCSeverity } from '@/lib/dtcReader';
import { PCANConnection } from '@/lib/pcanConnection';
import { VopCan2UsbConnection } from '@/lib/vopCan2UsbConnection';
import { DTC_SYSTEM_LABELS, DTC_SEVERITY_LABELS } from '@/lib/dtcReader';
import LiveChart from '@/components/LiveChart';
import LiveGaugeDashboard from '@/components/gauges/LiveGaugeDashboard';
import {
  OBDConnection, ConnectionState, PIDDefinition, PIDReading,
  LogSession, STANDARD_PIDS, GM_EXTENDED_PIDS, ALL_PIDS,
  PID_PRESETS, PIDPreset, DIDScanReport, ScanResult,
  exportSessionToCSV, sessionToAnalyzerCSV,
  loadCustomPresets, saveCustomPresets, createCustomPreset,
  deleteCustomPreset, updateCustomPreset, getAllPresets,
  VehicleInfo, PIDManufacturer, FuelType,
  FORD_EXTENDED_PIDS, CHRYSLER_EXTENDED_PIDS, TOYOTA_EXTENDED_PIDS, HONDA_EXTENDED_PIDS,
  MANUFACTURER_PIDS, getPidsForVehicle, getPresetsForVehicle,
} from '@/lib/obdConnection';

// ─── Styles ────────────────────────────────────────────────────────────────

const sFont = { heading: '"Bebas Neue", "Impact", sans-serif', body: '"Rajdhani", sans-serif', mono: '"Share Tech Mono", monospace' };
const sColor = {
  bg: 'oklch(0.10 0.005 260)', bgCard: 'oklch(0.13 0.006 260)',
  border: 'oklch(0.22 0.008 260)', borderLight: 'oklch(0.18 0.006 260)',
  red: 'oklch(0.52 0.22 25)', green: 'oklch(0.65 0.20 145)', blue: 'oklch(0.70 0.18 200)',
  yellow: 'oklch(0.75 0.18 60)', orange: 'oklch(0.65 0.20 55)',
  text: 'oklch(0.95 0.005 260)', textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.58 0.008 260)', purple: 'oklch(0.60 0.20 300)',
};

// ─── Gauge Component ───────────────────────────────────────────────────────

function LiveGauge({ reading, pid }: { reading: PIDReading | null; pid: PIDDefinition }) {
  const value = reading?.value ?? 0;
  const range = pid.max - pid.min;
  const pct = Math.max(0, Math.min(100, ((value - pid.min) / range) * 100));
  const isMode22 = (pid.service ?? 0x01) === 0x22;
  
  const getColor = (p: number) => {
    if (p < 25) return sColor.blue;
    if (p < 50) return sColor.green;
    if (p < 75) return sColor.yellow;
    return sColor.red;
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '12px',
      padding: '14px',
      minWidth: '160px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        {isMode22 && (
          <span style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.orange, background: 'rgba(255,127,0,0.2)', padding: '2px 6px', borderRadius: '3px', fontWeight: 700 }}>
            M22
          </span>
        )}
        <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, letterSpacing: '0.08em', textTransform: 'uppercase', flex: 1 }}>
          {pid.shortName}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '10px' }}>
        <span style={{ fontFamily: sFont.mono, fontSize: '1.9rem', fontWeight: 700, color: getColor(pct), lineHeight: 1, transition: 'color 0.3s ease-out' }}>
          {reading ? (Number.isInteger(value) ? value : value.toFixed(1)) : '---'}
        </span>
        <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim }}>
          {pid.unit}
        </span>
      </div>
      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: getColor(pct), transition: 'width 0.2s ease-out', borderRadius: '3px', boxShadow: `0 0 12px ${getColor(pct)}80` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>{pid.min}</span>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>{pid.max}</span>
      </div>
    </div>
  );
}

// ─── Mini Chart (last N readings) ──────────────────────────────────────────

function MiniChart({ readings, pid, maxPoints = 100 }: { readings: PIDReading[]; pid: PIDDefinition; maxPoints?: number }) {
  const recent = readings.slice(-maxPoints);
  if (recent.length < 2) return null;

  const values = recent.map(r => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 300;
  const height = 60;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const isMode22 = (pid.service ?? 0x01) === 0x22;

  return (
    <div style={{ background: 'oklch(0.08 0.004 260)', borderRadius: '3px', padding: '4px', overflow: 'hidden' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <polyline points={points} fill="none" stroke={isMode22 ? sColor.orange : sColor.red} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px 0' }}>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
          min: {min.toFixed(1)}
        </span>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: isMode22 ? sColor.orange : sColor.textDim }}>
          {pid.shortName}
        </span>
        <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted }}>
          max: {max.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ─── Connection Status Badge ───────────────────────────────────────────────

function StatusBadge({ state }: { state: ConnectionState }) {
  const config: Record<ConnectionState, { color: string; icon: React.ReactNode; label: string }> = {
    disconnected: { color: sColor.textMuted, icon: <WifiOff style={{ width: 14, height: 14 }} />, label: 'DISCONNECTED' },
    connecting: { color: sColor.yellow, icon: <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />, label: 'CONNECTING...' },
    initializing: { color: sColor.yellow, icon: <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />, label: 'INITIALIZING...' },
    ready: { color: sColor.green, icon: <CheckCircle style={{ width: 14, height: 14 }} />, label: 'READY' },
    logging: { color: sColor.red, icon: <Radio style={{ width: 14, height: 14 }} />, label: 'LOGGING' },
    error: { color: 'oklch(0.60 0.20 25)', icon: <AlertCircle style={{ width: 14, height: 14 }} />, label: 'ERROR' },
  };

  const c = config[state];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: c.color, fontFamily: sFont.mono, fontSize: '0.75rem', letterSpacing: '0.08em' }}>
      {c.icon} {c.label}
    </div>
  );
}

// ─── Custom Preset Dialog ─────────────────────────────────────────────────

function CustomPresetDialog({
  open, onClose, onSave, editPreset, selectedPids
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, pids: number[]) => void;
  editPreset?: PIDPreset | null;
  selectedPids: Set<number>;
}) {
  const [name, setName] = useState(editPreset?.name || '');
  const [description, setDescription] = useState(editPreset?.description || '');
  const [presetPids, setPresetPids] = useState<Set<number>>(
    new Set(editPreset?.pids || Array.from(selectedPids))
  );
  const [pidFilter, setPidFilter] = useState('');
  const [pidSource, setPidSource] = useState<'all' | 'mode01' | 'mode22'>('all');

  useEffect(() => {
    if (open) {
      setName(editPreset?.name || '');
      setDescription(editPreset?.description || '');
      setPresetPids(new Set(editPreset?.pids || Array.from(selectedPids)));
      setPidFilter('');
    }
  }, [open, editPreset, selectedPids]);

  if (!open) return null;

  const filteredPids = ALL_PIDS.filter(p => {
    if (pidSource === 'mode01' && (p.service ?? 0x01) !== 0x01) return false;
    if (pidSource === 'mode22' && (p.service ?? 0x01) !== 0x22) return false;
    if (pidFilter) {
      const q = pidFilter.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.shortName.toLowerCase().includes(q) ||
             p.category.toLowerCase().includes(q) || p.unit.toLowerCase().includes(q) ||
             `0x${p.pid.toString(16)}`.toLowerCase().includes(q);
    }
    return true;
  });

  const groupedPids = new Map<string, PIDDefinition[]>();
  for (const p of filteredPids) {
    const key = p.category;
    const list = groupedPids.get(key) || [];
    list.push(p);
    groupedPids.set(key, list);
  }

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), description.trim(), Array.from(presetPids));
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <div
        style={{
          background: sColor.bg, border: `1px solid ${sColor.border}`,
          borderRadius: '6px', width: '100%', maxWidth: '700px', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${sColor.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.text, letterSpacing: '0.1em' }}>
            {editPreset ? 'EDIT PRESET' : 'CREATE CUSTOM PRESET'}
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: sColor.textDim, cursor: 'pointer' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${sColor.border}` }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
                Preset Name *
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Vehicle Session"
                style={{
                  width: '100%', padding: '8px 12px', background: 'oklch(0.08 0.004 260)',
                  border: `1px solid ${sColor.border}`, borderRadius: '3px',
                  fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.text,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
                Description
              </label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="FRP + Boost + EGT monitoring"
                style={{
                  width: '100%', padding: '8px 12px', background: 'oklch(0.08 0.004 260)',
                  border: `1px solid ${sColor.border}`, borderRadius: '3px',
                  fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.text,
                  outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* PID Selector */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${sColor.borderLight}`, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              value={pidFilter}
              onChange={e => setPidFilter(e.target.value)}
              placeholder="Search PIDs..."
              style={{
                flex: 1, padding: '6px 10px', background: 'oklch(0.08 0.004 260)',
                border: `1px solid ${sColor.border}`, borderRadius: '3px',
                fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.text, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['all', 'mode01', 'mode22'] as const).map(src => (
                <button
                  key={src}
                  onClick={() => setPidSource(src)}
                  style={{
                    padding: '4px 8px', borderRadius: '3px',
                    fontFamily: sFont.mono, fontSize: '0.65rem',
                    background: pidSource === src ? (src === 'mode22' ? 'oklch(0.20 0.02 55 / 0.5)' : 'oklch(0.40 0.01 260)') : 'transparent',
                    border: `1px solid ${pidSource === src ? (src === 'mode22' ? sColor.orange : sColor.red) : sColor.border}`,
                    color: pidSource === src ? sColor.text : sColor.textDim,
                    cursor: 'pointer',
                  }}
                >
                  {src === 'all' ? 'ALL' : src === 'mode01' ? 'STD' : 'GM EXT'}
                </button>
              ))}
            </div>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.red }}>
              {presetPids.size} selected
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
            {Array.from(groupedPids.entries()).map(([category, pids]) => (
              <div key={category} style={{ marginBottom: '8px' }}>
                <div style={{
                  fontFamily: sFont.heading, fontSize: '0.75rem', color: sColor.textDim,
                  letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px',
                  borderBottom: `1px solid ${sColor.borderLight}`, paddingBottom: '2px',
                }}>
                  {category} ({pids.filter(p => presetPids.has(p.pid)).length}/{pids.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {pids.map(pid => {
                    const isMode22 = (pid.service ?? 0x01) === 0x22;
                    const isSelected = presetPids.has(pid.pid);
                    return (
                      <label
                        key={`${pid.service}-${pid.pid}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 6px',
                          cursor: 'pointer', borderRadius: '2px',
                          background: isSelected ? 'oklch(0.15 0.01 25 / 0.3)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const next = new Set(presetPids);
                            if (next.has(pid.pid)) next.delete(pid.pid);
                            else next.add(pid.pid);
                            setPresetPids(next);
                          }}
                          style={{ accentColor: isMode22 ? sColor.orange : sColor.red }}
                        />
                        {isMode22 && (
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.orange, background: 'oklch(0.15 0.02 55 / 0.4)', padding: '1px 3px', borderRadius: '2px' }}>
                            M22
                          </span>
                        )}
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, minWidth: '40px' }}>
                          0x{pid.pid.toString(16).toUpperCase().padStart(isMode22 ? 4 : 2, '0')}
                        </span>
                        <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.text, flex: 1 }}>
                          {pid.name}
                        </span>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textDim }}>
                          {pid.unit}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: `1px solid ${sColor.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
            {presetPids.size} PIDs ({Array.from(presetPids).filter(p => ALL_PIDS.some(e => e.pid === p && (e.service ?? 0x01) === 0x22)).length} Extended)
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', background: 'oklch(0.15 0.008 260)',
                border: `1px solid ${sColor.border}`, borderRadius: '3px',
                color: sColor.text, fontFamily: sFont.body, fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim() || presetPids.size === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', background: sColor.red, border: 'none',
                borderRadius: '3px', color: 'white',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.08em',
                cursor: name.trim() && presetPids.size > 0 ? 'pointer' : 'not-allowed',
                opacity: name.trim() && presetPids.size > 0 ? 1 : 0.5,
              }}
            >
              <Save style={{ width: 14, height: 14 }} />
              {editPreset ? 'UPDATE' : 'SAVE PRESET'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PID Selector (with Mode 22 + Custom Presets) ──────────────────────────

function PIDSelector({
  selectedPids, onTogglePid, onApplyPreset, supportedPids, disabled,
  customPresets, onCreatePreset, onEditPreset, onDeletePreset,
  manufacturer, fuelType
}: {
  selectedPids: Set<number>;
  onTogglePid: (pid: number) => void;
  onApplyPreset: (preset: PIDPreset) => void;
  supportedPids: Set<number> | null;
  disabled: boolean;
  customPresets: PIDPreset[];
  onCreatePreset: () => void;
  onEditPreset: (preset: PIDPreset) => void;
  onDeletePreset: (presetId: string) => void;
  manufacturer: PIDManufacturer;
  fuelType: FuelType;
}) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>('engine');
  const [pidSource, setPidSource] = useState<'all' | 'mode01' | 'extended' | 'vehicle'>('vehicle');

  // Get vehicle-specific PIDs
  const vehiclePids = useMemo(() => getPidsForVehicle(manufacturer, fuelType), [manufacturer, fuelType]);
  const vehiclePresets = useMemo(() => getPresetsForVehicle(manufacturer, fuelType), [manufacturer, fuelType]);

  // Get manufacturer-specific extended PIDs
  const extendedPids = useMemo(() => MANUFACTURER_PIDS[manufacturer] || [], [manufacturer]);

  const mfgLabel = manufacturer === 'universal' ? 'EXT' : manufacturer.toUpperCase();

  const categories = useMemo(() => {
    const cats = new Map<string, PIDDefinition[]>();
    let pidsToShow: PIDDefinition[];
    switch (pidSource) {
      case 'mode01': pidsToShow = STANDARD_PIDS; break;
      case 'extended': pidsToShow = extendedPids; break;
      case 'vehicle': pidsToShow = vehiclePids; break;
      default: pidsToShow = ALL_PIDS; break;
    }
    for (const pid of pidsToShow) {
      const list = cats.get(pid.category) || [];
      list.push(pid);
      cats.set(pid.category, list);
    }
    return cats;
  }, [pidSource, vehiclePids, extendedPids]);

  const categoryIcons: Record<string, React.ReactNode> = {
    engine: <Cpu style={{ width: 14, height: 14 }} />,
    turbo: <Wind style={{ width: 14, height: 14 }} />,
    fuel: <Flame style={{ width: 14, height: 14 }} />,
    emissions: <AlertCircle style={{ width: 14, height: 14 }} />,
    transmission: <Settings style={{ width: 14, height: 14 }} />,
    electrical: <Zap style={{ width: 14, height: 14 }} />,
    exhaust: <Thermometer style={{ width: 14, height: 14 }} />,
    def: <Droplets style={{ width: 14, height: 14 }} />,
    oxygen: <Activity style={{ width: 14, height: 14 }} />,
    catalyst: <Thermometer style={{ width: 14, height: 14 }} />,
    evap: <Wind style={{ width: 14, height: 14 }} />,
    ignition: <Zap style={{ width: 14, height: 14 }} />,
    cooling: <Thermometer style={{ width: 14, height: 14 }} />,
    intake: <Wind style={{ width: 14, height: 14 }} />,
    other: <BarChart3 style={{ width: 14, height: 14 }} />,
  };

  return (
    <div>
      {/* Vehicle Info Badge */}
      {manufacturer !== 'universal' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px',
          padding: '6px 10px', background: 'oklch(0.15 0.02 55 / 0.3)',
          border: `1px solid ${sColor.orange}`, borderRadius: '3px',
        }}>
          <Cpu style={{ width: 12, height: 12, color: sColor.orange }} />
          <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.orange, letterSpacing: '0.05em' }}>
            {manufacturer.toUpperCase()} {fuelType !== 'any' ? `· ${fuelType.toUpperCase()}` : ''}
          </span>
          <span style={{ fontFamily: sFont.body, fontSize: '0.6rem', color: sColor.textDim, marginLeft: 'auto' }}>
            {vehiclePids.length} PIDs available
          </span>
        </div>
      )}

      {/* Source Filter */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {(['vehicle', 'all', 'mode01', 'extended'] as const).map(src => (
          <button
            key={src}
            onClick={() => setPidSource(src)}
            style={{
              flex: 1, padding: '4px 6px', borderRadius: '3px',
              fontFamily: sFont.mono, fontSize: '0.6rem', letterSpacing: '0.05em',
              background: pidSource === src ? (src === 'extended' ? 'oklch(0.20 0.02 55 / 0.5)' : 'oklch(0.40 0.01 260)') : 'transparent',
              border: `1px solid ${pidSource === src ? (src === 'extended' ? sColor.orange : sColor.red) : sColor.borderLight}`,
              color: pidSource === src ? sColor.text : sColor.textMuted,
              cursor: 'pointer',
            }}
          >
            {src === 'vehicle' ? 'VEHICLE' : src === 'all' ? 'ALL' : src === 'mode01' ? 'STD (01)' : `${mfgLabel} (22)`}
          </button>
        ))}
      </div>

      {/* Built-in Presets (filtered by vehicle type) */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontFamily: sFont.heading, fontSize: '0.75rem', color: sColor.textDim, letterSpacing: '0.1em', marginBottom: '6px' }}>
          {manufacturer !== 'universal' ? `${manufacturer.toUpperCase()} PRESETS` : 'BUILT-IN PRESETS'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {vehiclePresets.map(preset => (
            <button
              key={preset.name}
              onClick={() => onApplyPreset(preset)}
              disabled={disabled}
              style={{
                fontFamily: sFont.body, fontSize: '0.7rem', padding: '3px 8px',
                background: 'oklch(0.15 0.008 260)', border: `1px solid ${sColor.border}`,
                borderRadius: '3px', color: sColor.text, cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!disabled) { (e.target as HTMLElement).style.borderColor = sColor.red; } }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = sColor.border; }}
              title={preset.description}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Presets */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontFamily: sFont.heading, fontSize: '0.75rem', color: sColor.orange, letterSpacing: '0.1em' }}>
            MY PRESETS
          </span>
          <button
            onClick={onCreatePreset}
            disabled={disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: '3px',
              padding: '2px 6px', background: 'oklch(0.15 0.02 55 / 0.3)',
              border: `1px solid ${sColor.orange}`, borderRadius: '3px',
              color: sColor.orange, fontFamily: sFont.mono, fontSize: '0.6rem',
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
            }}
          >
            <Plus style={{ width: 10, height: 10 }} /> NEW
          </button>
        </div>
        {customPresets.length === 0 ? (
          <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, padding: '6px 0' }}>
            No custom presets yet. Click + NEW to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {customPresets.map(preset => (
              <div
                key={preset.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
                  background: 'oklch(0.12 0.01 55 / 0.15)', border: `1px solid ${sColor.borderLight}`,
                  borderRadius: '3px',
                }}
              >
                <Star style={{ width: 12, height: 12, color: sColor.orange, flexShrink: 0 }} />
                <button
                  onClick={() => onApplyPreset(preset)}
                  disabled={disabled}
                  style={{
                    flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
                    color: sColor.text, fontFamily: sFont.body, fontSize: '0.75rem',
                    cursor: disabled ? 'not-allowed' : 'pointer', padding: 0,
                  }}
                  title={preset.description || `${preset.pids.length} PIDs`}
                >
                  {preset.name}
                  <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted, marginLeft: '6px' }}>
                    ({preset.pids.length})
                  </span>
                </button>
                <button
                  onClick={() => onEditPreset(preset)}
                  style={{ background: 'transparent', border: 'none', color: sColor.textDim, cursor: 'pointer', padding: '2px' }}
                  title="Edit preset"
                >
                  <Edit2 style={{ width: 11, height: 11 }} />
                </button>
                <button
                  onClick={() => { if (preset.id) onDeletePreset(preset.id); }}
                  style={{ background: 'transparent', border: 'none', color: sColor.textMuted, cursor: 'pointer', padding: '2px' }}
                  title="Delete preset"
                >
                  <Trash2 style={{ width: 11, height: 11 }} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category groups */}
      {Array.from(categories.entries()).map(([category, pids]) => (
        <div key={category} style={{ marginBottom: '4px' }}>
          <button
            onClick={() => setExpandedCategory(expandedCategory === category ? null : category)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
              padding: '5px 6px', background: 'transparent', border: 'none',
              color: sColor.text, cursor: 'pointer', fontFamily: sFont.body, fontSize: '0.75rem',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            {expandedCategory === category ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
            {categoryIcons[category] || null}
            {category}
            <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, marginLeft: 'auto' }}>
              {pids.filter(p => selectedPids.has(p.pid)).length}/{pids.length}
            </span>
          </button>
          {expandedCategory === category && (
            <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {pids.map(pid => {
                const isMode22 = (pid.service ?? 0x01) === 0x22;
                const isSupported = isMode22 || supportedPids === null || supportedPids.has(pid.pid);
                const isSelected = selectedPids.has(pid.pid);
                return (
                  <label
                    key={`${pid.service}-${pid.pid}`}
                    draggable={isSelected && !disabled}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/pid', JSON.stringify({ service: pid.service ?? 0x01, pid: pid.pid }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px',
                      cursor: disabled ? 'not-allowed' : (isSelected ? 'grab' : 'pointer'),
                      opacity: isSupported ? 1 : 0.4,
                      borderRadius: '2px', background: isSelected ? 'oklch(0.15 0.01 25 / 0.3)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onTogglePid(pid.pid)}
                      disabled={disabled || !isSupported}
                      style={{ accentColor: isMode22 ? sColor.orange : sColor.red }}
                    />
                    {isMode22 && (
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.45rem', color: sColor.orange, background: 'oklch(0.15 0.02 55 / 0.4)', padding: '0px 3px', borderRadius: '2px' }}>
                        M22
                      </span>
                    )}
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, minWidth: isMode22 ? '40px' : '28px' }}>
                      0x{pid.pid.toString(16).toUpperCase().padStart(isMode22 ? 4 : 2, '0')}
                    </span>
                    <span style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: sColor.text, flex: 1 }}>
                      {pid.name}
                    </span>
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textDim }}>
                      {pid.unit}
                    </span>
                    {!isSupported && (
                      <span style={{ fontFamily: sFont.mono, fontSize: '0.5rem', color: sColor.textMuted }}>N/A</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Console Log ───────────────────────────────────────────────────────────

function ConsoleLog({ logs }: { logs: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      ref={scrollRef}
      style={{
        background: 'oklch(0.06 0.003 260)', border: `1px solid ${sColor.borderLight}`,
        borderRadius: '3px', padding: '8px', maxHeight: '150px', overflowY: 'auto',
        fontFamily: sFont.mono, fontSize: '0.65rem', lineHeight: 1.6, color: sColor.textDim,
      }}
    >
      {logs.length === 0 ? (
        <span style={{ color: sColor.textMuted }}>No log entries yet. Connect to a device to begin.</span>
      ) : (
        logs.map((log, i) => {
          const isError = log.includes('ERROR') || log.includes('error');
          const isIncompatible = log.includes('INCOMPATIBLE ADAPTER');
          const isSuccess = log.includes('ready') || log.includes('Ready') || log.includes('OK');
          const color = isError ? 'oklch(0.60 0.20 25)' : isSuccess ? sColor.green : sColor.textDim;
          return (
            <div key={i} style={{
              color,
              ...(isIncompatible ? {
                background: 'oklch(0.12 0.04 25 / 0.3)',
                border: '1px solid oklch(0.35 0.12 25)',
                borderRadius: '3px',
                padding: '8px 10px',
                margin: '4px 0',
                whiteSpace: 'pre-wrap' as const,
              } : {}),
            }}>
              <span style={{ color: sColor.textMuted }}>[{new Date().toLocaleTimeString()}]</span> {log}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Completed Sessions List ───────────────────────────────────────────────

function SessionList({
  sessions, onExportCSV, onOpenInAnalyzer, onDelete
}: {
  sessions: LogSession[];
  onExportCSV: (session: LogSession) => void;
  onOpenInAnalyzer: (session: LogSession) => void;
  onDelete: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
        RECORDED SESSIONS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sessions.map(session => {
          const duration = ((session.endTime || Date.now()) - session.startTime) / 1000;
          let totalSamples = 0;
          session.readings.forEach(arr => { totalSamples += arr.length; });
          const hasMode22 = session.pids.some(p => (p.service ?? 0x01) === 0x22);

          return (
            <div key={session.id} style={{
              background: sColor.bgCard, border: `1px solid ${sColor.border}`,
              borderLeft: hasMode22 ? `3px solid ${sColor.orange}` : undefined,
              borderRadius: '3px', padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.text }}>
                  {new Date(session.startTime).toLocaleString()}
                </div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, marginTop: '2px' }}>
                  {session.pids.map(p => p.shortName).join(', ')} · {duration.toFixed(1)}s · {totalSamples} samples
                  {hasMode22 && <span style={{ color: sColor.orange, marginLeft: '4px' }}>(+Mode 22)</span>}
                </div>
              </div>
              <button
                onClick={() => onOpenInAnalyzer(session)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', background: 'oklch(0.15 0.01 25 / 0.4)',
                  border: `1px solid ${sColor.red}`, borderRadius: '3px',
                  color: sColor.red, fontFamily: sFont.body, fontSize: '0.7rem',
                  cursor: 'pointer', letterSpacing: '0.06em',
                }}
                title="Open in Analyzer"
              >
                <BarChart3 style={{ width: 12, height: 12 }} /> ANALYZE
              </button>
              <button
                onClick={() => onExportCSV(session)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px', background: 'oklch(0.15 0.008 260)',
                  border: `1px solid ${sColor.border}`, borderRadius: '3px',
                  color: sColor.text, fontFamily: sFont.body, fontSize: '0.7rem',
                  cursor: 'pointer',
                }}
                title="Export CSV"
              >
                <Download style={{ width: 12, height: 12 }} /> CSV
              </button>
              <button
                onClick={() => onDelete(session.id)}
                style={{
                  padding: '4px 6px', background: 'transparent', border: 'none',
                  color: sColor.textMuted, cursor: 'pointer',
                }}
                title="Delete session"
              >
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Datalogger Panel ─────────────────────────────────────────────────

export interface DataloggerPanelProps {
  onOpenInAnalyzer?: (csvData: string, filename: string) => void;
  injectedPids?: { pid: number; service: number; name: string; shortName: string }[];
}

/** UI order: PCAN-USB (WS bridge) → V-OP Can2USB (USB CAN bridge) → ELM327 (WebSerial AT). */
export type DataloggerAdapterType = 'pcan' | 'can2usb' | 'elm327';

export default function DataloggerPanel({ onOpenInAnalyzer, injectedPids }: DataloggerPanelProps) {
  const isDefaultQuickSelection = (pids: Set<number>) => (
    pids.size === 5 &&
    pids.has(0x0C) &&
    pids.has(0x0D) &&
    pids.has(0x05) &&
    pids.has(0x04) &&
    pids.has(0x11)
  );

  const isE42DuramaxVehicle = (info: VehicleInfo | null) => {
    if (!info?.year || info.year < 2024) return false;
    const make = (info.make || '').toLowerCase();
    const model = (info.model || '').toLowerCase();
    const engine = (info.engineType || '').toLowerCase();
    return (
      info.manufacturer === 'gm' &&
      info.fuelType === 'diesel' &&
      (
        engine.includes('duramax') ||
        engine.includes('l5p') ||
        model.includes('2500') ||
        model.includes('3500') ||
        make.includes('chevrolet') ||
        make.includes('gmc')
      )
    );
  };

  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);
  const [detectedManufacturer, setDetectedManufacturer] = useState<PIDManufacturer>('universal');
  const [detectedFuelType, setDetectedFuelType] = useState<FuelType>('any');
  const [supportedPids, setSupportedPids] = useState<Set<number> | null>(null);
  const connectionRef = useRef<OBDConnection | PCANConnection | VopCan2UsbConnection | null>(null);
  const [adapterType, setAdapterType] = useState<DataloggerAdapterType>('can2usb');
  const usesWebSerial = adapterType === 'elm327' || adapterType === 'can2usb';
  const usesOrangeAdapterUi = adapterType === 'pcan' || adapterType === 'can2usb';
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);
  const [checkingBridge, setCheckingBridge] = useState(false);

  // PID selection
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set([0x0C, 0x0D, 0x05, 0x04, 0x11]));
  const autoAppliedE42PresetRef = useRef(false);

  // Handle PIDs injected from Knox Diagnostic Agent
  useEffect(() => {
    if (injectedPids && injectedPids.length > 0) {
      setSelectedPids(prev => {
        const next = new Set(prev);
        injectedPids.forEach(p => next.add(p.pid));
        return next;
      });
    }
  }, [injectedPids]);

  // Custom presets
  const [customPresets, setCustomPresets] = useState<PIDPreset[]>(() => loadCustomPresets());
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PIDPreset | null>(null);

  // Logging state
  const [isLogging, setIsLogging] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);  // Live view without recording
  const [isRecording, setIsRecording] = useState(false);    // Actively capturing data for saving
  const [liveReadings, setLiveReadings] = useState<Map<number, PIDReading>>(new Map());
  const [readingHistory, setReadingHistory] = useState<Map<number, PIDReading[]>>(new Map());
  const [recordedReadings, setRecordedReadings] = useState<Map<number, PIDReading[]>>(new Map()); // Only captured during recording
  const [sampleCount, setSampleCount] = useState(0);
  const [recordSampleCount, setRecordSampleCount] = useState(0);
  const [logDuration, setLogDuration] = useState(0);
  const [recordDuration, setRecordDuration] = useState(0);
  const logStartRef = useRef<number>(0);
  const recordStartRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ECU Communication Loss Detection
  const [ecuLostReason, setEcuLostReason] = useState<string | null>(null);
  const consecutiveFailsRef = useRef(0);
  const ECU_FAIL_THRESHOLD = 5; // consecutive failed polls before declaring ECU lost

  // AI Auto-Naming
  const [isAutoNaming, setIsAutoNaming] = useState(false);
  const autoNameMutation = trpc.datalogNaming.autoName.useMutation();

  // Sample rate
  const [sampleRateMs, setSampleRateMs] = useState(200);

  // Console logs
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  // Completed sessions
  const [completedSessions, setCompletedSessions] = useState<LogSession[]>([]);

  // UI state
  const [showConsole, setShowConsole] = useState(true);
  const [showPidSelector, setShowPidSelector] = useState(true);
  const [liveViewMode, setLiveViewMode] = useState<'list' | 'gauges'>('list');

  // DID Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; pid?: string; supported?: boolean } | null>(null);
  const [scanReport, setScanReport] = useState<DIDScanReport | null>(null);
  const [showScanResults, setShowScanResults] = useState(false);
  const scanAbortRef = useRef<AbortController | null>(null);

  // DTC state
  const [dtcResult, setDtcResult] = useState<DTCReadResult | null>(null);
  const [isReadingDTCs, setIsReadingDTCs] = useState(false);
  const [isClearingDTCs, setIsClearingDTCs] = useState(false);
  const [showDTCPanel, setShowDTCPanel] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // WebSerial support check
  const isWebSerialSupported = useMemo(() => OBDConnection.isSupported(), []);

  // ─── Connection handlers ──────────────────────────────────────────────

  const addLog = useCallback((msg: string) => {
    setConsoleLogs(prev => [...prev.slice(-200), msg]);
  }, []);

  // Auto-apply a known-good E42 preset once per connection so 2024+ Duramax
  // sessions start with directed-addressing-safe Mode 22 channels.
  // (Must run after addLog is defined — not above with other effects.)
  useEffect(() => {
    if (!isE42DuramaxVehicle(vehicleInfo)) return;
    if (autoAppliedE42PresetRef.current) return;

    const e42Preset = getPresetsForVehicle('gm', 'diesel').find((p) =>
      p.name.toLowerCase().includes('2024-2026 l5p banks idash full')
    );
    if (!e42Preset) return;

    setSelectedPids((prev) => {
      if (!isDefaultQuickSelection(prev)) return prev;
      autoAppliedE42PresetRef.current = true;
      addLog(`Auto-applied E42 preset: ${e42Preset.name}`);
      return new Set(e42Preset.pids);
    });
  }, [vehicleInfo, addLog]);

  const [detectedBridgeUrl, setDetectedBridgeUrl] = useState<string | null>(null);

  const handleCheckBridge = useCallback(async () => {
    setCheckingBridge(true);
    try {
      const result = await PCANConnection.isBridgeAvailable();
      setBridgeAvailable(result.available);
      if (result.available) {
        setDetectedBridgeUrl(result.url);
        const proto = result.url.startsWith('wss') ? 'wss (secure)' : 'ws';
        addLog(`PCAN-USB bridge detected via ${proto}: ${result.url}`);
      } else {
        setDetectedBridgeUrl(null);
        addLog('PCAN-USB bridge not detected. Make sure pcan_bridge.py is running.');
        addLog('If bridge IS running, you may need to accept the TLS certificate:');
        addLog('  Open https://localhost:8766 in Chrome → Advanced → Proceed');
      }
    } catch {
      setBridgeAvailable(false);
      setDetectedBridgeUrl(null);
    } finally {
      setCheckingBridge(false);
    }
  }, [addLog]);

  const handleConnect = useCallback(async () => {
    let conn: OBDConnection | PCANConnection | VopCan2UsbConnection;

    if (adapterType === 'pcan') {
      conn = new PCANConnection(detectedBridgeUrl ? { bridgeUrl: detectedBridgeUrl } : {});
      addLog('Connecting via PCAN-USB WebSocket bridge...');
    } else if (adapterType === 'can2usb') {
      conn = new VopCan2UsbConnection();
      addLog('Connecting to V-OP Can2USB (USB–CAN bridge)…');
    } else {
      conn = new OBDConnection({
        protocol: '6',
        adaptiveTiming: 2,
        echo: false,
        headers: false,
        spaces: false,
      });
      addLog('Connecting to ELM327-compatible adapter...');
      addLog('NOTE: In ELM mode, pick your OBD adapter in the port list. For PCAN-USB use the PCAN tab; for V-OP Can2USB use the V-OP tab.');
    }

    conn.on('stateChange', (e) => {
      setConnectionState(e.data as ConnectionState);
    });

    conn.on('log', (e) => {
      if (e.message) addLog(e.message);
    });

    conn.on('error', (e) => {
      if (e.message) addLog(`ERROR: ${e.message}`);
    });

    conn.on('vehicleInfo', (e) => {
      const info = e.data as VehicleInfo;
      setVehicleInfo(info);
      if (info.manufacturer) setDetectedManufacturer(info.manufacturer);
      if (info.fuelType) setDetectedFuelType(info.fuelType);
      const makeModel = [info.make, info.model, info.year].filter(Boolean).join(' ');
      addLog(`Vehicle: ${makeModel || 'Unknown'} | VIN=${info.vin || 'N/A'} | Protocol=${info.protocol || 'N/A'} | Voltage=${info.voltage || 'N/A'}`);
      if (info.manufacturer && info.manufacturer !== 'universal') {
        addLog(`Auto-detected: ${info.manufacturer.toUpperCase()} ${info.fuelType || 'any'} — loading manufacturer-specific PIDs`);
      }
    });

    conn.on('pidAvailability', (e) => {
      const { supported, unsupported } = e.data as { supported: PIDDefinition[]; unsupported: PIDDefinition[] };
      addLog(`PID availability: ${supported.length} supported, ${unsupported.length} filtered out`);
      if (unsupported.length > 0) {
        addLog(`Filtered: ${unsupported.map(p => p.shortName).join(', ')}`);
      }
    });

    connectionRef.current = conn;

    const success = await conn.connect();
    if (success) {
      setSupportedPids(conn.getSupportedPids());
      const stdCount = conn.getAvailablePids().length;
      const extPids = MANUFACTURER_PIDS[detectedManufacturer] || [];
      const extCount = extPids.length;
      const mfgLabel = detectedManufacturer === 'universal' ? 'universal' : detectedManufacturer.toUpperCase();
      const via =
        adapterType === 'pcan'
          ? 'PCAN-USB bridge'
          : adapterType === 'can2usb'
            ? 'V-OP Can2USB'
            : 'ELM327 WebSerial';
      addLog(`Connected via ${via}! ${stdCount} standard PIDs + ${extCount} ${mfgLabel} extended PIDs available`);
    }
  }, [addLog, adapterType, detectedBridgeUrl]);

  const handleDisconnect = useCallback(async () => {
    if (isLogging) {
      handleStopLogging();
    }
    if (connectionRef.current) {
      await connectionRef.current.disconnect();
      connectionRef.current = null;
    }
    setVehicleInfo(null);
    autoAppliedE42PresetRef.current = false;
    setSupportedPids(null);
    addLog('Disconnected');
  }, [isLogging, addLog]);

  // ─── Logging handlers ────────────────────────────────────────────────

  // Helper: prepare PIDs and force-add unsupported ones
  const preparePidsForLogging = useCallback(() => {
    const conn = connectionRef.current;
    if (!conn) return null;

    const pidsToLog = ALL_PIDS.filter(p => selectedPids.has(p.pid));
    if (pidsToLog.length === 0) {
      addLog('ERROR: No PIDs selected. Select at least one PID from the list below.');
      return null;
    }

    // Force-add unsupported PIDs to bypass bitmask filter
    if ('filterSupportedPids' in conn && typeof (conn as any).filterSupportedPids === 'function') {
      const { supported, unsupported } = (conn as any).filterSupportedPids(pidsToLog);
      if (supported.length === 0 && unsupported.length > 0) {
        addLog(`WARNING: All ${unsupported.length} selected PIDs marked unsupported — bypassing bitmask filter.`);
        if ('supportedPids' in conn) {
          for (const pid of unsupported) (conn as any).supportedPids.add(pid.pid);
        }
      } else if (unsupported.length > 0) {
        addLog(`Note: ${unsupported.length} PID(s) not in bitmask — will still attempt.`);
        if ('supportedPids' in conn) {
          for (const pid of unsupported) (conn as any).supportedPids.add(pid.pid);
        }
      }
    }
    return pidsToLog;
  }, [selectedPids, addLog]);

  // ─── MONITOR: Start live data view WITHOUT recording ─────────────────
  const handleStartMonitoring = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn || connectionState !== 'ready') {
      addLog('ERROR: Cannot start — device not in ready state. Reconnect and try again.');
      return;
    }

    const pidsToLog = preparePidsForLogging();
    if (!pidsToLog) return;

    const mode22Count = pidsToLog.filter(p => (p.service ?? 0x01) === 0x22).length;
    const mode01Count = pidsToLog.length - mode22Count;
    addLog(`Starting live monitor: ${pidsToLog.length} PIDs (${mode01Count} std + ${mode22Count} ext) @ ${sampleRateMs}ms`);

    // Reset live data
    setLiveReadings(new Map());
    setReadingHistory(new Map());
    setSampleCount(0);
    setLogDuration(0);
    setEcuLostReason(null);
    consecutiveFailsRef.current = 0;
    logStartRef.current = Date.now();

    // Start duration timer
    durationIntervalRef.current = setInterval(() => {
      setLogDuration(Math.floor((Date.now() - logStartRef.current) / 1000));
    }, 1000);

    setIsLogging(true);
    setIsMonitoring(true);

    try {
      await conn.startLogging(pidsToLog, sampleRateMs, (readings) => {
        // ECU communication loss detection
        if (!readings || readings.length === 0) {
          consecutiveFailsRef.current++;
          if (consecutiveFailsRef.current >= ECU_FAIL_THRESHOLD && !ecuLostReason) {
            const reason = 'ECU stopped responding — possible causes: vehicle ignition turned off, adapter disconnected, CAN bus error, or ECU entered sleep mode.';
            setEcuLostReason(reason);
            addLog(`⚠ ECU COMMUNICATION LOST: ${reason}`);
          }
          return;
        }
        // Reset fail counter on successful read
        if (consecutiveFailsRef.current > 0) {
          if (ecuLostReason) {
            addLog('✓ ECU communication restored.');
            setEcuLostReason(null);
          }
          consecutiveFailsRef.current = 0;
        }

        const newLive = new Map<number, PIDReading>();
        for (const r of readings) newLive.set(r.pid, r);
        setLiveReadings(newLive);

        setReadingHistory(prev => {
          const next = new Map(prev);
          for (const r of readings) {
            const arr = next.get(r.pid) || [];
            arr.push(r);
            if (arr.length > 1000) arr.shift();
            next.set(r.pid, [...arr]);
          }
          return next;
        });

        setSampleCount(prev => prev + 1);

        // If recording, also capture into recorded readings
        if (isRecording) {
          setRecordedReadings(prev => {
            const next = new Map(prev);
            for (const r of readings) {
              const arr = next.get(r.pid) || [];
              arr.push(r);
              next.set(r.pid, [...arr]);
            }
            return next;
          });
          setRecordSampleCount(prev => prev + 1);
        }
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to start monitoring';
      addLog(`ERROR: ${errMsg}`);
      if (errMsg.includes('No supported PIDs')) {
        addLog('TIP: Try selecting different PIDs, or run "Scan Vehicle" first.');
      }
      setIsLogging(false);
      setIsMonitoring(false);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
  }, [connectionState, preparePidsForLogging, sampleRateMs, addLog, isRecording, ecuLostReason]);

  // ─── RECORD: Start capturing data for saving (while monitoring) ──────
  const handleStartRecording = useCallback(() => {
    setRecordedReadings(new Map());
    setRecordSampleCount(0);
    setRecordDuration(0);
    recordStartRef.current = Date.now();
    recordIntervalRef.current = setInterval(() => {
      setRecordDuration(Math.floor((Date.now() - recordStartRef.current) / 1000));
    }, 1000);
    setIsRecording(true);
    addLog('⏺ RECORDING STARTED — capturing data for session save');
  }, [addLog]);

  // ─── STOP RECORD: Save session + AI auto-name ───────────────────────
  const handleStopRecording = useCallback(async () => {
    setIsRecording(false);
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }

    const endTime = Date.now();
    const duration = (endTime - recordStartRef.current) / 1000;
    const pidsToLog = ALL_PIDS.filter(p => selectedPids.has(p.pid));

    // Build session from recorded readings
    const session: LogSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startTime: recordStartRef.current,
      endTime,
      sampleRate: sampleRateMs,
      pids: pidsToLog,
      readings: new Map(recordedReadings),
      vehicleInfo: vehicleInfo || undefined,
    };

    setCompletedSessions(prev => [session, ...prev]);
    addLog(`⏹ Recording stopped: ${duration.toFixed(1)}s · ${recordSampleCount} samples`);

    // AI Auto-Name the session
    try {
      setIsAutoNaming(true);
      // Compute summary stats for AI naming
      const rpmReadings = session.readings.get(0x0C) || []; // Engine RPM
      const speedReadings = session.readings.get(0x0D) || []; // Vehicle Speed
      const boostReadings = session.readings.get(0x0B) || []; // MAP (boost proxy)
      const throttleReadings = session.readings.get(0x11) || []; // Throttle
      const egtReadings = session.readings.get(0x220078) || session.readings.get(0x2200A0) || []; // EGT
      const railReadings = session.readings.get(0x220023) || []; // Rail pressure

      const getMax = (arr: PIDReading[]) => arr.length ? Math.max(...arr.map(r => r.value)) : undefined;
      const getAvg = (arr: PIDReading[]) => arr.length ? arr.reduce((s, r) => s + r.value, 0) / arr.length : undefined;

      const summary = {
        durationSeconds: Math.round(duration),
        sampleCount: recordSampleCount,
        peakRpm: getMax(rpmReadings) ?? 0,
        avgRpm: getAvg(rpmReadings) ? Math.round(getAvg(rpmReadings)!) : 0,
        peakSpeedMph: getMax(speedReadings) ?? 0,
        avgSpeedMph: getAvg(speedReadings) ? Math.round(getAvg(speedReadings)!) : 0,
        peakBoostPsi: boostReadings.length ? Math.max(...boostReadings.map(r => (r.value * 0.145038) - 14.696)) : 0,
        maxThrottle: getMax(throttleReadings) ?? 0,
        maxEgt: getMax(egtReadings),
        maxRailPressure: getMax(railReadings),
        hadWotEvent: throttleReadings.some(r => r.value > 80),
        hadIdlePeriod: rpmReadings.some(r => r.value < 900),
        vehicleInfo: vehicleInfo ? `${vehicleInfo.year ?? ''} ${vehicleInfo.make ?? ''} ${vehicleInfo.model ?? ''}`.trim() : undefined,
      };

      const result = await autoNameMutation.mutateAsync(summary);
      if (result.name) {
        session.name = result.name;
        // Update the session in state
        setCompletedSessions(prev => prev.map(s => s.id === session.id ? { ...s, name: result.name } : s));
        addLog(`🤖 AI named session: "${result.name}"`);
      }
    } catch (err) {
      addLog(`AI naming skipped: ${err instanceof Error ? err.message : 'unavailable'}`);
    } finally {
      setIsAutoNaming(false);
    }
  }, [selectedPids, sampleRateMs, recordedReadings, recordSampleCount, vehicleInfo, addLog, autoNameMutation]);

  // ─── STOP MONITOR: Stop all polling ─────────────────────────────────
  const handleStopMonitoring = useCallback(() => {
    // If recording, stop that first
    if (isRecording) {
      handleStopRecording();
    }

    const conn = connectionRef.current;
    if (conn) conn.stopLogging();

    setIsLogging(false);
    setIsMonitoring(false);
    setEcuLostReason(null);
    consecutiveFailsRef.current = 0;

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    addLog('Monitor stopped.');
  }, [isRecording, handleStopRecording, addLog]);

  // Legacy aliases for backward compatibility
  const handleStartLogging = handleStartMonitoring;
  const handleStopLogging = handleStopMonitoring;

  // ─── PID selection handlers ──────────────────────────────────────────

  const handleTogglePid = useCallback((pid: number) => {
    setSelectedPids(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }, []);

  const handleApplyPreset = useCallback((preset: PIDPreset) => {
    setSelectedPids(new Set(preset.pids));
    addLog(`Applied preset: ${preset.name}`);
  }, [addLog]);

  // ─── Custom Preset handlers ─────────────────────────────────────────

  const handleCreatePreset = useCallback(() => {
    setEditingPreset(null);
    setPresetDialogOpen(true);
  }, []);

  const handleEditPreset = useCallback((preset: PIDPreset) => {
    setEditingPreset(preset);
    setPresetDialogOpen(true);
  }, []);

  const handleDeletePreset = useCallback((presetId: string) => {
    const updated = deleteCustomPreset(customPresets, presetId);
    setCustomPresets(updated);
    addLog(`Deleted custom preset`);
  }, [customPresets, addLog]);

  const handleSavePreset = useCallback((name: string, description: string, pids: number[]) => {
    if (editingPreset?.id) {
      const updated = updateCustomPreset(customPresets, editingPreset.id, { name, description, pids });
      setCustomPresets(updated);
      addLog(`Updated preset: ${name}`);
    } else {
      const newPreset = createCustomPreset(name, description, pids);
      const updated = [...customPresets, newPreset];
      saveCustomPresets(updated);
      setCustomPresets(updated);
      addLog(`Created preset: ${name} (${pids.length} PIDs)`);
    }
    setPresetDialogOpen(false);
    setEditingPreset(null);
  }, [editingPreset, customPresets, addLog]);

  // ─── DID Scan handlers ──────────────────────────────────────────────

  const handleStartScan = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn || connectionState !== 'ready') return;

    setIsScanning(true);
    setScanProgress({ current: 0, total: STANDARD_PIDS.length + GM_EXTENDED_PIDS.length });
    setScanReport(null);
    setShowScanResults(true);

    const abortController = new AbortController();
    scanAbortRef.current = abortController;

    addLog('Starting DID discovery scan...');

    try {
      const report = await conn.scanSupportedDIDs({
        includeStandard: true,
        includeExtended: true,
        abortSignal: abortController.signal,
        onProgress: (current, total, pid, supported) => {
          setScanProgress({ current, total, pid: pid.shortName, supported });
        },
      });

      setScanReport(report);

      // Auto-apply the generated preset
      if (report.autoPreset) {
        setCustomPresets(loadCustomPresets());
        const newPids = new Set(report.autoPreset.pids);
        setSelectedPids(newPids);
        addLog(`Auto-preset "${report.autoPreset.name}" applied with ${report.totalSupported} PIDs`);
      }

      addLog(`Scan complete: ${report.totalSupported} supported / ${report.totalScanned} scanned (${(report.duration / 1000).toFixed(1)}s)`);
    } catch (err) {
      addLog(`Scan error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
      setScanProgress(null);
      scanAbortRef.current = null;
    }
  }, [connectionState, addLog]);

  const handleAbortScan = useCallback(() => {
    if (scanAbortRef.current) {
      scanAbortRef.current.abort();
      addLog('Scan abort requested...');
    }
  }, [addLog]);

  // ─── DTC handlers ───────────────────────────────────────────────────────

  const handleReadDTCs = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn || connectionState !== 'ready') return;

    setIsReadingDTCs(true);
    setShowDTCPanel(true);
    addLog('Reading DTCs from vehicle...');

    try {
      const rawResult = await conn.readDTCs();
      // Normalize: OBDConnection returns DTCReadResult, PCANConnection returns simpler format
      const result: DTCReadResult = 'totalCount' in rawResult ? rawResult as DTCReadResult : {
        stored: (rawResult.codes || []).map((code: string) => ({ code, type: 'stored' as const, system: 'unknown' as const, severity: 'unknown' as DTCSeverity, description: '', possibleCauses: [] as string[], rawBytes: [0, 0] as [number, number] })),
        pending: (rawResult.pending || []).map((code: string) => ({ code, type: 'pending' as const, system: 'unknown' as const, severity: 'unknown' as DTCSeverity, description: '', possibleCauses: [] as string[], rawBytes: [0, 0] as [number, number] })),
        permanent: (rawResult.permanent || []).map((code: string) => ({ code, type: 'permanent' as const, system: 'unknown' as const, severity: 'unknown' as DTCSeverity, description: '', possibleCauses: [] as string[], rawBytes: [0, 0] as [number, number] })),
        totalCount: (rawResult.codes || []).length + (rawResult.pending || []).length + (rawResult.permanent || []).length,
        milStatus: false,
        readTimestamp: Date.now(),
      };
      setDtcResult(result);
      if (result.totalCount === 0) {
        addLog('No DTCs found — vehicle is clean!');
      } else {
        addLog(`Found ${result.stored.length} stored, ${result.pending.length} pending, ${result.permanent.length} permanent DTCs`);
      }
    } catch (err) {
      addLog(`ERROR reading DTCs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsReadingDTCs(false);
    }
  }, [connectionState, addLog]);

  const handleClearDTCs = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn || connectionState !== 'ready') return;

    setIsClearingDTCs(true);
    setShowClearConfirm(false);
    addLog('Clearing DTCs (Mode 04)...');

    try {
      const success = await conn.clearDTCs();
      if (success) {
        addLog('DTCs cleared successfully! MIL (Check Engine Light) reset.');
        // Re-read to confirm
        const rawResult = await conn.readDTCs();
        const result: DTCReadResult = 'totalCount' in rawResult ? rawResult as DTCReadResult : {
          stored: (rawResult.codes || []).map((code: string) => ({ code, type: 'stored' as const, system: 'unknown' as const, severity: 'unknown' as DTCSeverity, description: '', possibleCauses: [] as string[], rawBytes: [0, 0] as [number, number] })),
          pending: (rawResult.pending || []).map((code: string) => ({ code, type: 'pending' as const, system: 'unknown' as const, severity: 'unknown' as DTCSeverity, description: '', possibleCauses: [] as string[], rawBytes: [0, 0] as [number, number] })),
          permanent: (rawResult.permanent || []).map((code: string) => ({ code, type: 'permanent' as const, system: 'unknown' as const, severity: 'unknown' as DTCSeverity, description: '', possibleCauses: [] as string[], rawBytes: [0, 0] as [number, number] })),
          totalCount: (rawResult.codes || []).length + (rawResult.pending || []).length + (rawResult.permanent || []).length,
          milStatus: false,
          readTimestamp: Date.now(),
        };
        setDtcResult(result);
      } else {
        addLog('WARNING: Clear DTCs command may not have been accepted');
      }
    } catch (err) {
      addLog(`ERROR clearing DTCs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsClearingDTCs(false);
    }
  }, [connectionState, addLog]);

  // ─── Export handlers ─────────────────────────────────────────────────────

  const handleExportCSV = useCallback((session: LogSession) => {
    const csv = exportSessionToCSV(session);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datalog_${new Date(session.startTime).toISOString().replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('CSV exported');
  }, [addLog]);

  const handleOpenInAnalyzer = useCallback((session: LogSession) => {
    const csv = sessionToAnalyzerCSV(session);
    const filename = `datalog_${new Date(session.startTime).toISOString().replace(/[:.]/g, '-')}.csv`;
    if (onOpenInAnalyzer) {
      onOpenInAnalyzer(csv, filename);
    } else {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    addLog('Session sent to Analyzer');
  }, [onOpenInAnalyzer, addLog]);

  const handleDeleteSession = useCallback((id: string) => {
    setCompletedSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  // ─── Cleanup ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (connectionRef.current) {
        connectionRef.current.disconnect();
      }
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────

  const activePids = ALL_PIDS.filter(p => selectedPids.has(p.pid));

  return (
    <div>
      {/* Custom Preset Dialog */}
      <CustomPresetDialog
        open={presetDialogOpen}
        onClose={() => { setPresetDialogOpen(false); setEditingPreset(null); }}
        onSave={handleSavePreset}
        editPreset={editingPreset}
        selectedPids={selectedPids}
      />

      {/* Header Bar */}
      <div style={{
        background: sColor.bgCard, border: `1px solid ${sColor.border}`,
        borderRadius: '3px', padding: '16px 20px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Gauge style={{ width: 20, height: 20, color: sColor.red }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '1.2rem', letterSpacing: '0.12em', color: sColor.text }}>
            LIVE DATALOGGER
          </span>
        </div>

        <StatusBadge state={connectionState} />

        {/* Mode 22 indicator */}
        {activePids.some(p => (p.service ?? 0x01) === 0x22) && (
          <span style={{
            fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.orange,
            background: 'oklch(0.15 0.02 55 / 0.3)', padding: '2px 6px', borderRadius: '3px',
            border: `1px solid oklch(0.30 0.10 55)`,
          }}>
            GM MODE 22 ACTIVE
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Sample Rate */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>RATE:</span>
            <select
              value={sampleRateMs}
              onChange={e => setSampleRateMs(Number(e.target.value))}
              disabled={isLogging}
              style={{
                fontFamily: sFont.mono, fontSize: '0.7rem', padding: '2px 6px',
                background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.border}`,
                borderRadius: '2px', color: sColor.text,
              }}
            >
              <option value={100}>100ms (10Hz)</option>
              <option value={200}>200ms (5Hz)</option>
              <option value={500}>500ms (2Hz)</option>
              <option value={1000}>1000ms (1Hz)</option>
            </select>
          </div>

          {/* Adapter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>ADAPTER:</span>
            <select
              value={adapterType}
              onChange={e => setAdapterType(e.target.value as DataloggerAdapterType)}
              disabled={connectionState !== 'disconnected' && connectionState !== 'error'}
              style={{
                fontFamily: sFont.mono, fontSize: '0.7rem', padding: '2px 6px',
                background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.border}`,
                borderRadius: '2px', color: usesOrangeAdapterUi ? sColor.orange : sColor.text,
              }}
            >
              <option value="pcan">PCAN-USB (WS bridge)</option>
              <option value="can2usb">V-OP Can2USB</option>
              <option value="elm327">ELM327 (WebSerial)</option>
            </select>
          </div>

          {/* Connect/Disconnect */}
          {connectionState === 'disconnected' || connectionState === 'error' ? (
            <button
              onClick={handleConnect}
              disabled={usesWebSerial ? !isWebSerialSupported : false}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: sColor.green, border: 'none',
                borderRadius: '3px', color: 'oklch(0.10 0.005 260)',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: (usesWebSerial && !isWebSerialSupported) ? 'not-allowed' : 'pointer',
                opacity: (usesWebSerial && !isWebSerialSupported) ? 0.5 : 1,
              }}
            >
              <Wifi style={{ width: 14, height: 14 }} /> CONNECT
            </button>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={connectionState === 'connecting' || connectionState === 'initializing'}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: 'oklch(0.20 0.008 260)', border: `1px solid ${sColor.border}`,
                borderRadius: '3px', color: sColor.text,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              <WifiOff style={{ width: 14, height: 14 }} /> DISCONNECT
            </button>
          )}

          {/* Scan Vehicle */}
          {connectionState === 'ready' && !isLogging && !isScanning && (
            <button
              onClick={handleStartScan}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: sColor.purple, border: 'none',
                borderRadius: '3px', color: 'white',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              <Radar style={{ width: 14, height: 14 }} /> SCAN VEHICLE
            </button>
          )}
          {isScanning && (
            <button
              onClick={handleAbortScan}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: 'oklch(0.20 0.01 300)',
                border: `2px solid ${sColor.purple}`, borderRadius: '3px', color: sColor.purple,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer', animation: 'pulse 2s infinite',
              }}
            >
              <Square style={{ width: 14, height: 14 }} /> ABORT SCAN
              {scanProgress && ` · ${scanProgress.current}/${scanProgress.total}`}
            </button>
          )}

          {/* MONITOR: Start live data view */}
          {connectionState === 'ready' && !isMonitoring && !isScanning && (
            <button
              onClick={handleStartMonitoring}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: sColor.green, border: 'none',
                borderRadius: '3px', color: 'oklch(0.10 0.005 260)',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              <Activity style={{ width: 14, height: 14 }} /> MONITOR
            </button>
          )}
          {/* STOP MONITOR */}
          {isMonitoring && (
            <button
              onClick={handleStopMonitoring}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: 'oklch(0.20 0.01 145)',
                border: `2px solid ${sColor.green}`, borderRadius: '3px', color: sColor.green,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              <Square style={{ width: 14, height: 14 }} /> STOP · {logDuration}s · {sampleCount} polls
            </button>
          )}
          {/* RECORD: Start capturing data (only while monitoring) */}
          {isMonitoring && !isRecording && (
            <button
              onClick={handleStartRecording}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: sColor.red, border: 'none',
                borderRadius: '3px', color: 'white',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'white', display: 'inline-block' }} /> RECORD
            </button>
          )}
          {/* STOP RECORD */}
          {isRecording && (
            <button
              onClick={handleStopRecording}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: 'oklch(0.20 0.01 25)',
                border: `2px solid ${sColor.red}`, borderRadius: '3px', color: sColor.red,
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: 'pointer', animation: 'pulse 2s infinite',
              }}
            >
              <Square style={{ width: 14, height: 14 }} /> STOP REC · {recordDuration}s · {recordSampleCount} samples
            </button>
          )}
          {/* AI Auto-Naming indicator */}
          {isAutoNaming && (
            <span style={{
              fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.blue,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> AI NAMING...
            </span>
          )}

          {/* Read DTCs */}
          {connectionState === 'ready' && !isLogging && !isScanning && (
            <button
              onClick={handleReadDTCs}
              disabled={isReadingDTCs}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', background: sColor.orange, border: 'none',
                borderRadius: '3px', color: 'white',
                fontFamily: sFont.heading, fontSize: '0.85rem', letterSpacing: '0.1em',
                cursor: isReadingDTCs ? 'wait' : 'pointer',
                opacity: isReadingDTCs ? 0.7 : 1,
              }}
            >
              {isReadingDTCs ? (
                <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> READING DTCs...</>
              ) : (
                <><ShieldAlert style={{ width: 14, height: 14 }} /> READ DTCs</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* WebSerial Not Supported Warning */}
      {!isWebSerialSupported && (
        <div style={{
          background: 'oklch(0.15 0.02 25 / 0.3)', border: `1px solid oklch(0.40 0.15 25)`,
          borderRadius: '3px', padding: '16px 20px', marginBottom: '16px',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
        }}>
          <AlertCircle style={{ width: 20, height: 20, color: 'oklch(0.60 0.20 25)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.text, letterSpacing: '0.08em', marginBottom: '4px' }}>
              WEBSERIAL NOT SUPPORTED
            </div>
            <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, lineHeight: 1.5 }}>
              Your browser does not support the WebSerial API. Please use <strong style={{ color: sColor.text }}>Google Chrome</strong> or <strong style={{ color: sColor.text }}>Microsoft Edge</strong> on desktop to connect to an ELM327-compatible OBD-II adapter. Safari and Firefox do not support WebSerial.
            </div>
          </div>
        </div>
      )}

      {/* ECU Communication Lost Banner */}
      {ecuLostReason && (
        <div style={{
          background: 'oklch(0.15 0.03 25 / 0.5)', border: `2px solid ${sColor.red}`,
          borderRadius: '3px', padding: '16px 20px', marginBottom: '16px',
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          animation: 'pulse 2s infinite',
        }}>
          <AlertCircle style={{ width: 24, height: 24, color: sColor.red, flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontFamily: sFont.heading, fontSize: '1rem', color: sColor.red, letterSpacing: '0.1em', marginBottom: '6px' }}>
              ⚠ ECU COMMUNICATION LOST
            </div>
            <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.textDim, lineHeight: 1.6 }}>
              {ecuLostReason}
            </div>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim, marginTop: '8px', lineHeight: 1.5 }}>
              <strong style={{ color: sColor.text }}>Troubleshooting:</strong><br />
              • Check that the vehicle ignition is ON (not just ACC)<br />
              • Verify the OBD-II adapter is firmly seated in the port<br />
              • Check the USB cable connection to your computer<br />
              • Try power-cycling the adapter (unplug and replug)<br />
              • If the issue persists, disconnect and reconnect
            </div>
          </div>
        </div>
      )}

      {/* DTC Results Panel */}
      {showDTCPanel && (
        <div style={{
          background: sColor.bgCard, border: `1px solid ${dtcResult && dtcResult.totalCount > 0 ? sColor.orange : sColor.border}`,
          borderRadius: '3px', padding: '16px 20px', marginBottom: '16px',
        }}>
          {/* DTC Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert style={{ width: 18, height: 18, color: dtcResult?.milStatus ? sColor.red : sColor.orange }} />
              <span style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.1em', color: sColor.text }}>
                DIAGNOSTIC TROUBLE CODES
              </span>
              {dtcResult?.milStatus && (
                <span style={{
                  fontFamily: sFont.mono, fontSize: '0.65rem', padding: '2px 8px',
                  background: 'oklch(0.20 0.08 25)', border: `1px solid ${sColor.red}`,
                  borderRadius: '2px', color: sColor.red, letterSpacing: '0.05em',
                }}>
                  MIL ON (CHECK ENGINE)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Clear DTCs Button */}
              {dtcResult && dtcResult.totalCount > 0 && connectionState === 'ready' && (
                showClearConfirm ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.red }}>Clear all DTCs?</span>
                    <button
                      onClick={handleClearDTCs}
                      disabled={isClearingDTCs}
                      style={{
                        fontFamily: sFont.heading, fontSize: '0.7rem', padding: '3px 10px',
                        background: sColor.red, border: 'none', borderRadius: '2px',
                        color: 'white', cursor: 'pointer', letterSpacing: '0.08em',
                      }}
                    >
                      {isClearingDTCs ? 'CLEARING...' : 'YES, CLEAR'}
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      style={{
                        fontFamily: sFont.heading, fontSize: '0.7rem', padding: '3px 10px',
                        background: 'transparent', border: `1px solid ${sColor.border}`, borderRadius: '2px',
                        color: sColor.textDim, cursor: 'pointer', letterSpacing: '0.08em',
                      }}
                    >
                      CANCEL
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontFamily: sFont.heading, fontSize: '0.7rem', padding: '3px 10px',
                      background: 'oklch(0.18 0.02 25)', border: `1px solid oklch(0.35 0.10 25)`,
                      borderRadius: '2px', color: sColor.red, cursor: 'pointer', letterSpacing: '0.08em',
                    }}
                  >
                    <Eraser style={{ width: 12, height: 12 }} /> CLEAR DTCs
                  </button>
                )
              )}
              {/* Refresh */}
              {connectionState === 'ready' && (
                <button
                  onClick={handleReadDTCs}
                  disabled={isReadingDTCs}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    fontFamily: sFont.heading, fontSize: '0.7rem', padding: '3px 10px',
                    background: 'transparent', border: `1px solid ${sColor.border}`,
                    borderRadius: '2px', color: sColor.textDim, cursor: 'pointer', letterSpacing: '0.08em',
                  }}
                >
                  <RefreshCw style={{ width: 12, height: 12 }} /> REFRESH
                </button>
              )}
              {/* Close */}
              <button onClick={() => setShowDTCPanel(false)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', color: sColor.textDim, padding: '4px',
              }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isReadingDTCs && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
              <Loader2 style={{ width: 18, height: 18, color: sColor.orange, animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim }}>Reading DTCs from vehicle ECU...</span>
            </div>
          )}

          {/* No DTCs */}
          {dtcResult && dtcResult.totalCount === 0 && !isReadingDTCs && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '16px',
              background: 'oklch(0.12 0.02 145 / 0.3)', border: `1px solid oklch(0.30 0.10 145)`,
              borderRadius: '3px',
            }}>
              <ShieldCheck style={{ width: 24, height: 24, color: sColor.green }} />
              <div>
                <div style={{ fontFamily: sFont.heading, fontSize: '0.9rem', color: sColor.green, letterSpacing: '0.08em' }}>
                  NO TROUBLE CODES FOUND
                </div>
                <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim, marginTop: '2px' }}>
                  Vehicle is clean. MIL is OFF. No stored, pending, or permanent DTCs detected.
                </div>
              </div>
            </div>
          )}

          {/* DTC List */}
          {dtcResult && dtcResult.totalCount > 0 && !isReadingDTCs && (
            <div>
              {/* Summary Bar */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {dtcResult.stored.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px',
                    background: 'oklch(0.15 0.02 25 / 0.5)', border: `1px solid oklch(0.35 0.10 25)`,
                    borderRadius: '2px',
                  }}>
                    <ShieldX style={{ width: 14, height: 14, color: sColor.red }} />
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.red }}>
                      {dtcResult.stored.length} STORED
                    </span>
                  </div>
                )}
                {dtcResult.pending.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px',
                    background: 'oklch(0.15 0.02 55 / 0.5)', border: `1px solid oklch(0.40 0.12 55)`,
                    borderRadius: '2px',
                  }}>
                    <AlertCircle style={{ width: 14, height: 14, color: sColor.yellow }} />
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.yellow }}>
                      {dtcResult.pending.length} PENDING
                    </span>
                  </div>
                )}
                {dtcResult.permanent.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px',
                    background: 'oklch(0.15 0.02 300 / 0.5)', border: `1px solid oklch(0.35 0.12 300)`,
                    borderRadius: '2px',
                  }}>
                    <ShieldAlert style={{ width: 14, height: 14, color: sColor.purple }} />
                    <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.purple }}>
                      {dtcResult.permanent.length} PERMANENT
                    </span>
                  </div>
                )}
              </div>

              {/* DTC Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Render all DTCs grouped by type */}
                {(['stored', 'pending', 'permanent'] as const).map(dtcType => {
                  const dtcs = dtcResult[dtcType];
                  if (dtcs.length === 0) return null;
                  const typeColor = dtcType === 'stored' ? sColor.red : dtcType === 'pending' ? sColor.yellow : sColor.purple;
                  const typeLabel = dtcType.toUpperCase();
                  return dtcs.map((dtc: DTCCode, idx: number) => (
                    <div
                      key={`${dtcType}-${dtc.code}-${idx}`}
                      style={{
                        display: 'flex', gap: '12px', padding: '10px 14px',
                        background: sColor.bg, border: `1px solid ${sColor.border}`,
                        borderLeft: `3px solid ${typeColor}`, borderRadius: '3px',
                      }}
                    >
                      {/* Code */}
                      <div style={{ minWidth: '70px' }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.95rem', color: typeColor, fontWeight: 700 }}>
                          {dtc.code}
                        </div>
                        <div style={{
                          fontFamily: sFont.mono, fontSize: '0.55rem', color: typeColor, opacity: 0.7,
                          marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                          {typeLabel}
                        </div>
                      </div>
                      {/* Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: sFont.body, fontSize: '0.8rem', color: sColor.text, lineHeight: 1.4 }}>
                          {dtc.description}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                          {dtc.severity && (
                            <span style={{
                              fontFamily: sFont.mono, fontSize: '0.55rem', padding: '1px 6px',
                              background: dtc.severity === 'critical' ? 'oklch(0.18 0.05 25)' : dtc.severity === 'warning' ? 'oklch(0.38 0.04 55)' : 'oklch(0.35 0.01 260)',
                              border: `1px solid ${dtc.severity === 'critical' ? 'oklch(0.35 0.10 25)' : dtc.severity === 'warning' ? 'oklch(0.55 0.08 55)' : sColor.border}`,
                              borderRadius: '2px', color: dtc.severity === 'critical' ? sColor.red : dtc.severity === 'warning' ? sColor.yellow : sColor.textDim,
                              textTransform: 'uppercase',
                            }}>
                              {dtc.severity}
                            </span>
                          )}
                          {dtc.system && (
                            <span style={{
                              fontFamily: sFont.mono, fontSize: '0.55rem', padding: '1px 6px',
                              background: 'oklch(0.14 0.005 260)', border: `1px solid ${sColor.border}`,
                              borderRadius: '2px', color: sColor.textDim, textTransform: 'uppercase',
                            }}>
                              {dtc.system.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        {/* Possible Causes */}
                        {dtc.possibleCauses && dtc.possibleCauses.length > 0 && (
                          <div style={{ marginTop: '6px' }}>
                            <span style={{ fontFamily: sFont.mono, fontSize: '0.55rem', color: sColor.textMuted, letterSpacing: '0.05em' }}>POSSIBLE CAUSES: </span>
                            <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim }}>
                              {dtc.possibleCauses.join(' · ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ));
                })}
              </div>

              {/* Clear Warning */}
              {dtcResult.permanent.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '12px',
                  padding: '10px 14px', background: 'oklch(0.12 0.01 300 / 0.3)',
                  border: `1px solid oklch(0.30 0.08 300)`, borderRadius: '3px',
                }}>
                  <Info style={{ width: 14, height: 14, color: sColor.purple, flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim, lineHeight: 1.5 }}>
                    <strong style={{ color: sColor.purple }}>Permanent DTCs</strong> cannot be cleared with Mode 04. They require the underlying fault to be repaired and the vehicle to complete a drive cycle before the ECU will remove them.
                  </span>
                </div>
              )}

              {/* Timestamp */}
              {dtcResult.readTimestamp && (
                <div style={{ marginTop: '8px', fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted }}>
                  Read at {new Date(dtcResult.readTimestamp).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DID Scan Progress & Results */}
      {(isScanning || showScanResults) && (
        <div style={{
          background: sColor.bgCard, border: `1px solid ${isScanning ? sColor.purple : sColor.border}`,
          borderRadius: '3px', padding: '16px 20px', marginBottom: '16px',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radar style={{ width: 18, height: 18, color: sColor.purple }} />
              <span style={{ fontFamily: sFont.heading, fontSize: '1rem', letterSpacing: '0.1em', color: sColor.text }}>
                {isScanning ? 'SCANNING VEHICLE...' : 'SCAN RESULTS'}
              </span>
            </div>
            {!isScanning && (
              <button onClick={() => setShowScanResults(false)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', color: sColor.textDim, padding: '4px',
              }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            )}
          </div>

          {/* Progress Bar */}
          {isScanning && scanProgress && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.textDim }}>
                  Testing: {scanProgress.pid || '...'}
                </span>
                <span style={{ fontFamily: sFont.mono, fontSize: '0.7rem', color: sColor.text }}>
                  {scanProgress.current}/{scanProgress.total} ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
                </span>
              </div>
              <div style={{
                width: '100%', height: '8px', background: 'oklch(0.15 0.005 260)',
                borderRadius: '4px', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                  height: '100%', background: sColor.purple, borderRadius: '4px',
                  transition: 'width 0.2s ease',
                }} />
              </div>
              {scanProgress.supported !== undefined && (
                <div style={{
                  fontFamily: sFont.mono, fontSize: '0.65rem', marginTop: '4px',
                  color: scanProgress.supported ? sColor.green : sColor.textMuted,
                }}>
                  {scanProgress.pid}: {scanProgress.supported ? '✓ SUPPORTED' : '✗ Not supported'}
                </div>
              )}
            </div>
          )}

          {/* Scan Results */}
          {scanReport && !isScanning && (
            <div>
              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'oklch(0.12 0.01 145 / 0.2)', borderRadius: '3px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: sFont.mono, fontSize: '1.4rem', color: sColor.green, fontWeight: 'bold' }}>
                    {scanReport.totalSupported}
                  </div>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Supported
                  </div>
                </div>
                <div style={{ background: 'oklch(0.12 0.01 260 / 0.2)', borderRadius: '3px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: sFont.mono, fontSize: '1.4rem', color: sColor.blue, fontWeight: 'bold' }}>
                    {scanReport.standardSupported.length}
                  </div>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Standard (01)
                  </div>
                </div>
                <div style={{ background: 'oklch(0.12 0.02 55 / 0.2)', borderRadius: '3px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: sFont.mono, fontSize: '1.4rem', color: sColor.orange, fontWeight: 'bold' }}>
                    {scanReport.extendedSupported.length}
                  </div>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    GM Extended (22)
                  </div>
                </div>
                <div style={{ background: 'oklch(0.12 0.01 25 / 0.2)', borderRadius: '3px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: sFont.mono, fontSize: '1.4rem', color: sColor.textDim, fontWeight: 'bold' }}>
                    {scanReport.totalScanned - scanReport.totalSupported}
                  </div>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Unsupported
                  </div>
                </div>
                <div style={{ background: 'oklch(0.12 0.005 260 / 0.2)', borderRadius: '3px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: sFont.mono, fontSize: '1.4rem', color: sColor.text, fontWeight: 'bold' }}>
                    {(scanReport.duration / 1000).toFixed(1)}s
                  </div>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Scan Time
                  </div>
                </div>
              </div>

              {/* Auto-Preset Badge */}
              {scanReport.autoPreset && (
                <div style={{
                  background: 'oklch(0.15 0.02 300 / 0.3)', border: `1px solid oklch(0.40 0.15 300)`,
                  borderRadius: '3px', padding: '10px 14px', marginBottom: '16px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <Star style={{ width: 16, height: 16, color: sColor.purple, fill: sColor.purple }} />
                  <div>
                    <div style={{ fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.text, letterSpacing: '0.08em' }}>
                      AUTO-PRESET CREATED: "{scanReport.autoPreset.name}"
                    </div>
                    <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim }}>
                      {scanReport.autoPreset.pids.length} PIDs auto-selected and saved. This preset is available in your custom presets.
                    </div>
                  </div>
                </div>
              )}

              {/* Supported PIDs List */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.green, letterSpacing: '0.08em', marginBottom: '8px' }}>
                  SUPPORTED PIDs ({scanReport.totalSupported})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {[...scanReport.standardSupported, ...scanReport.extendedSupported].map((r) => (
                    <span key={`${r.pid.service ?? 1}-${r.pid.pid}`} style={{
                      fontFamily: sFont.mono, fontSize: '0.6rem',
                      padding: '2px 6px', borderRadius: '2px',
                      background: (r.pid.service ?? 0x01) === 0x22 ? 'oklch(0.15 0.02 55 / 0.4)' : 'oklch(0.15 0.01 145 / 0.4)',
                      color: (r.pid.service ?? 0x01) === 0x22 ? sColor.orange : sColor.green,
                      border: `1px solid ${(r.pid.service ?? 0x01) === 0x22 ? 'oklch(0.30 0.10 55)' : 'oklch(0.50 0.10 145)'}`,
                    }}>
                      {r.pid.shortName}
                      {r.sampleValue !== undefined && (
                        <span style={{ color: sColor.textDim, marginLeft: '4px' }}>
                          ({r.sampleValue.toFixed(1)})
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Unsupported PIDs (collapsed) */}
              {(scanReport.standardUnsupported.length + scanReport.extendedUnsupported.length) > 0 && (
                <details>
                  <summary style={{
                    fontFamily: sFont.heading, fontSize: '0.75rem', color: sColor.textMuted,
                    letterSpacing: '0.08em', cursor: 'pointer', marginBottom: '6px',
                  }}>
                    UNSUPPORTED PIDs ({scanReport.standardUnsupported.length + scanReport.extendedUnsupported.length})
                  </summary>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {[...scanReport.standardUnsupported, ...scanReport.extendedUnsupported].map((r) => (
                      <span key={`${r.pid.service ?? 1}-${r.pid.pid}`} style={{
                        fontFamily: sFont.mono, fontSize: '0.6rem',
                        padding: '2px 6px', borderRadius: '2px',
                        background: 'oklch(0.12 0.005 260)', color: sColor.textMuted,
                        border: `1px solid oklch(0.18 0.005 260)`,
                        textDecoration: 'line-through',
                      }}>
                        {r.pid.shortName}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* Vehicle Info Bar */}
      {vehicleInfo && (
        <div style={{
          background: 'oklch(0.12 0.01 145 / 0.2)', border: `1px solid oklch(0.30 0.10 145)`,
          borderRadius: '3px', padding: '10px 16px', marginBottom: '16px',
          display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start',
        }}>
          {/* Vehicle Identity */}
          {(vehicleInfo.make || vehicleInfo.model) && (
            <div>
              <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vehicle</span>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text }}>
                {[vehicleInfo.year, vehicleInfo.make, vehicleInfo.model].filter(Boolean).join(' ')}
              </div>
            </div>
          )}
          {vehicleInfo.vin && (
            <div>
              <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>VIN</span>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.text }}>{vehicleInfo.vin}</div>
            </div>
          )}
          {/* Manufacturer & Fuel Type */}
          {vehicleInfo.manufacturer && vehicleInfo.manufacturer !== 'universal' && (
            <div>
              <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.orange, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Platform</span>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.orange }}>
                {vehicleInfo.manufacturer.toUpperCase()}
                {vehicleInfo.fuelType && vehicleInfo.fuelType !== 'any' ? ` · ${vehicleInfo.fuelType.toUpperCase()}` : ''}
              </div>
            </div>
          )}
          {vehicleInfo.engineType && (
            <div>
              <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Engine</span>
              <div style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.text }}>{vehicleInfo.engineType}</div>
            </div>
          )}
          <div>
            <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Protocol</span>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text }}>{vehicleInfo.protocol || 'Auto'}</div>
          </div>
          <div>
            <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Voltage</span>
            <div style={{
              fontFamily: sFont.mono, fontSize: '0.8rem',
              color: (() => {
                const v = vehicleInfo.voltage;
                if (!v) return sColor.textDim;
                const num = parseFloat(v.replace(/[^0-9.]/g, ''));
                if (isNaN(num) || num < 0.5) return sColor.red; // 0V = problem
                if (num < 11.5) return sColor.orange; // low voltage warning
                return sColor.text;
              })()
            }}>
              {vehicleInfo.voltage || '---'}
              {vehicleInfo.voltage && parseFloat(vehicleInfo.voltage.replace(/[^0-9.]/g, '')) < 0.5 && (
                <span style={{ fontSize: '0.6rem', color: sColor.red, marginLeft: 4 }} title="Adapter not receiving 12V power from OBD port pin 16. Check connection.">⚠ NO PWR</span>
              )}
            </div>
          </div>
          <div>
            <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.textDim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Standard PIDs</span>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.text }}>{supportedPids?.size || 0}</div>
          </div>
          <div>
            <span style={{ fontFamily: sFont.body, fontSize: '0.65rem', color: sColor.orange, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {detectedManufacturer !== 'universal' ? `${detectedManufacturer.toUpperCase()} Extended` : 'Extended PIDs'}
            </span>
            <div style={{ fontFamily: sFont.mono, fontSize: '0.8rem', color: sColor.orange }}>
              {(MANUFACTURER_PIDS[detectedManufacturer] || []).length}
            </div>
          </div>
        </div>
      )}

      {/* Main Content: PID Selector + Live Data */}
      <div style={{ display: 'grid', gridTemplateColumns: showPidSelector ? '300px 1fr' : '1fr', gap: '16px' }}>
        {/* Left: PID Selector */}
        {showPidSelector && (
          <div style={{
            background: sColor.bgCard, border: `1px solid ${sColor.border}`,
            borderRadius: '3px', padding: '12px', maxHeight: '700px', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.text, letterSpacing: '0.1em' }}>
                PID SELECTION
              </span>
              <span style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.red }}>
                {selectedPids.size} selected
              </span>
            </div>
            <PIDSelector
              selectedPids={selectedPids}
              onTogglePid={handleTogglePid}
              onApplyPreset={handleApplyPreset}
              supportedPids={supportedPids}
              disabled={isLogging}
              customPresets={customPresets}
              onCreatePreset={handleCreatePreset}
              onEditPreset={handleEditPreset}
              onDeletePreset={handleDeletePreset}
              manufacturer={detectedManufacturer}
              fuelType={detectedFuelType}
            />
          </div>
        )}

        {/* Right: Live Data */}
        <div>
          {/* Toolbar: PID panel toggle + View mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => setShowPidSelector(!showPidSelector)}
              style={{
                fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textDim,
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <Settings style={{ width: 12, height: 12 }} />
              {showPidSelector ? 'Hide PID Panel' : 'Show PID Panel'}
            </button>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', gap: '0' }}>
              <button
                onClick={() => setLiveViewMode('list')}
                style={{
                  padding: '4px 10px', borderRadius: '3px 0 0 3px', cursor: 'pointer',
                  fontFamily: sFont.heading, fontSize: '0.7rem', letterSpacing: '0.08em',
                  border: `1px solid ${liveViewMode === 'list' ? sColor.red : sColor.border}`,
                  background: liveViewMode === 'list' ? 'oklch(0.18 0.04 25 / 0.3)' : 'transparent',
                  color: liveViewMode === 'list' ? sColor.red : sColor.textDim,
                }}
              >
                LIST VIEW
              </button>
              <button
                onClick={() => setLiveViewMode('gauges')}
                style={{
                  padding: '4px 10px', borderRadius: '0 3px 3px 0', cursor: 'pointer',
                  fontFamily: sFont.heading, fontSize: '0.7rem', letterSpacing: '0.08em',
                  border: `1px solid ${liveViewMode === 'gauges' ? 'oklch(0.70 0.14 200)' : sColor.border}`,
                  borderLeft: 'none',
                  background: liveViewMode === 'gauges' ? 'oklch(0.15 0.04 200 / 0.3)' : 'transparent',
                  color: liveViewMode === 'gauges' ? 'oklch(0.70 0.14 200)' : sColor.textDim,
                }}
              >
                GAUGE VIEW
              </button>
            </div>
          </div>

          {/* === LIST VIEW (original layout) === */}
          {liveViewMode === 'list' && (
            <>
              {/* Live Gauges */}
              {(isLogging || liveReadings.size > 0) && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
                    LIVE DATA
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {activePids.map(pid => (
                      <LiveGauge key={`${pid.service}-${pid.pid}`} pid={pid} reading={liveReadings.get(pid.pid) || null} />
                    ))}
                  </div>
                </div>
              )}

              {/* Real-Time Chart */}
              {(isLogging || readingHistory.size > 0) && (
                <div style={{ marginBottom: '16px' }}>
                  <LiveChart
                    pids={activePids}
                    readingHistory={readingHistory}
                    liveReadings={liveReadings}
                    isLogging={isLogging}
                  />
                </div>
              )}
            </>
          )}

          {/* === GAUGE VIEW (motorsport dashboard) === */}
          {liveViewMode === 'gauges' && (
            <div style={{ marginBottom: '16px' }}>
              <LiveGaugeDashboard
                liveReadings={liveReadings}
                activePids={activePids}
                allAvailablePids={ALL_PIDS}
                isLogging={isLogging}
              />
              {/* Still show the chart below gauges */}
              {(isLogging || readingHistory.size > 0) && (
                <div style={{ marginTop: '16px' }}>
                  <LiveChart
                    pids={activePids}
                    readingHistory={readingHistory}
                    liveReadings={liveReadings}
                    isLogging={isLogging}
                  />
                </div>
              )}
            </div>
          )}

          {/* Idle state */}
          {connectionState === 'disconnected' && !isLogging && liveReadings.size === 0 && (
            <div style={{
              background: sColor.bgCard, border: `1px solid ${sColor.border}`,
              borderRadius: '3px', padding: '40px 20px', textAlign: 'center',
            }}>
              <Gauge style={{ width: 48, height: 48, color: sColor.textMuted, margin: '0 auto 16px' }} />
              <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
                CONNECT YOUR OBD-II ADAPTER
              </div>

              {/* Adapter Mode Tabs — order: PCAN-USB, V-OP Can2USB, ELM327 */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '20px', maxWidth: '720px', margin: '0 auto 20px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAdapterType('pcan')}
                  style={{
                    flex: '1 1 160px', padding: '10px 12px', border: `1px solid ${adapterType === 'pcan' ? sColor.orange : sColor.border}`,
                    borderRadius: '3px', cursor: 'pointer',
                    background: adapterType === 'pcan' ? 'oklch(0.12 0.04 55 / 0.4)' : 'oklch(0.28 0.005 260)',
                    fontFamily: sFont.heading, fontSize: '0.75rem', letterSpacing: '0.06em',
                    color: adapterType === 'pcan' ? sColor.orange : sColor.textDim,
                  }}
                >
                  <div>PCAN-USB</div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, marginTop: '2px' }}>Python bridge (WS)</div>
                </button>
                <button
                  onClick={() => setAdapterType('can2usb')}
                  style={{
                    flex: '1 1 160px', padding: '10px 12px', border: `1px solid ${adapterType === 'can2usb' ? sColor.orange : sColor.border}`,
                    borderRadius: '3px', cursor: 'pointer',
                    background: adapterType === 'can2usb' ? 'oklch(0.12 0.04 55 / 0.4)' : 'oklch(0.28 0.005 260)',
                    fontFamily: sFont.heading, fontSize: '0.75rem', letterSpacing: '0.06em',
                    color: adapterType === 'can2usb' ? sColor.orange : sColor.textDim,
                  }}
                >
                  <div>V-OP Can2USB</div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, marginTop: '2px' }}>USB CAN bridge</div>
                </button>
                <button
                  onClick={() => setAdapterType('elm327')}
                  style={{
                    flex: '1 1 160px', padding: '10px 12px', border: `1px solid ${adapterType === 'elm327' ? sColor.green : sColor.border}`,
                    borderRadius: '3px', cursor: 'pointer',
                    background: adapterType === 'elm327' ? 'oklch(0.12 0.03 145 / 0.4)' : 'oklch(0.28 0.005 260)',
                    fontFamily: sFont.heading, fontSize: '0.75rem', letterSpacing: '0.06em',
                    color: adapterType === 'elm327' ? sColor.green : sColor.textDim,
                  }}
                >
                  <div>ELM327 / OBDLINK</div>
                  <div style={{ fontFamily: sFont.mono, fontSize: '0.6rem', color: sColor.textMuted, marginTop: '2px' }}>WebSerial AT</div>
                </button>
              </div>

              {/* ELM327 Mode Instructions */}
              {adapterType === 'elm327' && (
                <>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, lineHeight: 1.6, maxWidth: '500px', margin: '0 auto' }}>
                    Plug your ELM327-compatible adapter into your vehicle's OBD-II port, connect it to your computer via USB, turn the ignition to ON (engine running or KOEO), then click <strong style={{ color: sColor.green }}>CONNECT</strong> above.
                  </div>

                  <div style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: sColor.textMuted, marginTop: '16px', lineHeight: 1.6, maxWidth: '520px', margin: '16px auto 0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left' }}>
                      <div style={{ padding: '8px 10px', background: 'oklch(0.12 0.02 145 / 0.2)', border: '1px solid oklch(0.25 0.06 145)', borderRadius: '3px' }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.green, marginBottom: '4px', letterSpacing: '0.06em' }}>SUPPORTED</div>
                        <div>OBDLink EX <span style={{ color: sColor.orange }}>(recommended)</span></div>
                        <div>OBDLink MX+ / SX</div>
                        <div>ELM327 v1.5+ USB</div>
                        <div>STN1110 / STN2120</div>
                      </div>
                      <div style={{ padding: '8px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px' }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textMuted, marginBottom: '4px', letterSpacing: '0.06em' }}>REQUIREMENTS</div>
                        <div>Chrome or Edge browser</div>
                        <div>USB connection to PC</div>
                        <div>Vehicle ignition ON</div>
                        <div>No other apps using port</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      Protocol: ISO 15765-4 CAN 11-bit/500k (default). Auto-detect available.
                      <br /><span style={{ color: sColor.orange }}>GM Mode 22 extended PIDs enabled for diesel-specific parameters.</span>
                    </div>
                  </div>

                  <div style={{ fontFamily: sFont.body, fontSize: '0.7rem', color: sColor.textMuted, marginTop: '12px', lineHeight: 1.5, padding: '10px', border: `1px solid ${sColor.borderLight}`, borderRadius: '3px', textAlign: 'left', maxWidth: '520px', margin: '12px auto 0' }}>
                    <strong style={{ color: sColor.yellow }}>TROUBLESHOOTING:</strong>
                    <br />{'•'} Close any other apps using the device (OBDwiz, FORScan, PCAN-View, etc.)
                    <br />{'•'} Try unplugging and re-plugging the USB cable
                    <br />{'•'} Select your device from the list — it may appear as "USB Serial Device" or "COM port"
                    <br />{'•'} On Windows, check Device Manager {'→'} Ports (COM & LPT) to confirm the device is recognized
                    <br />{'•'} <strong style={{ color: sColor.orange }}>Raw CAN on USB?</strong> Use the <strong>PCAN-USB</strong> or <strong>V-OP Can2USB</strong> tab above (not ELM327).
                  </div>
                </>
              )}

              {/* PCAN-USB — WebSocket bridge only */}
              {adapterType === 'pcan' && (
                <>
                  <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, lineHeight: 1.6, maxWidth: '520px', margin: '0 auto' }}>
                    <strong style={{ color: sColor.text }}>PCAN-USB</strong> uses the <strong style={{ color: sColor.orange }}>local Python bridge</strong> (WebSocket). It translates raw CAN to OBD-II. Run the VOP Bridge installer or <code style={{ fontSize: '0.8em' }}>pcan_bridge.py</code> on your PC first — not the V-OP Can2USB serial path.
                  </div>

                  {/* Bridge Status */}
                  <div style={{ maxWidth: '520px', margin: '16px auto 0' }}>
                    <div style={{
                      padding: '12px 16px', borderRadius: '3px', textAlign: 'left',
                      background: bridgeAvailable === true ? 'oklch(0.12 0.03 145 / 0.3)' : bridgeAvailable === false ? 'oklch(0.12 0.04 25 / 0.3)' : 'oklch(0.30 0.005 260)',
                      border: `1px solid ${bridgeAvailable === true ? 'oklch(0.30 0.10 145)' : bridgeAvailable === false ? 'oklch(0.30 0.12 25)' : sColor.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: bridgeAvailable === true ? sColor.green : bridgeAvailable === false ? sColor.red : sColor.textMuted,
                            boxShadow: bridgeAvailable === true ? `0 0 6px ${sColor.green}` : 'none',
                          }} />
                          <span style={{ fontFamily: sFont.mono, fontSize: '0.75rem', color: sColor.text, letterSpacing: '0.06em' }}>
                            BRIDGE STATUS: {bridgeAvailable === true ? 'CONNECTED' : bridgeAvailable === false ? 'NOT DETECTED' : 'UNKNOWN'}
                          </span>
                        </div>
                        <button
                          onClick={handleCheckBridge}
                          disabled={checkingBridge}
                          style={{
                            fontFamily: sFont.mono, fontSize: '0.65rem', padding: '3px 10px',
                            background: 'transparent', border: `1px solid ${sColor.border}`,
                            borderRadius: '2px', color: sColor.textDim, cursor: 'pointer',
                            letterSpacing: '0.06em',
                          }}
                        >
                          {checkingBridge ? 'CHECKING...' : 'CHECK'}
                        </button>
                      </div>
                      {bridgeAvailable === true && (
                        <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.green, marginTop: '6px' }}>
                          Bridge detected and ready. Click <strong>CONNECT</strong> above to start.
                        </div>
                      )}
                      {bridgeAvailable === false && (
                        <div style={{ fontFamily: sFont.body, fontSize: '0.75rem', color: sColor.textDim, marginTop: '6px' }}>
                          Bridge not found. <strong style={{ color: sColor.text }}>Download the VOP Bridge installer below</strong> to get started.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* VOP Bridge Installer — One-Click Setup */}
                  <div style={{ fontFamily: sFont.body, fontSize: '0.72rem', color: sColor.textMuted, marginTop: '16px', lineHeight: 1.6, maxWidth: '560px', margin: '16px auto 0', textAlign: 'left' }}>
                    {/* Download CTA */}
                    <div style={{
                      padding: '16px 20px',
                      background: 'linear-gradient(135deg, oklch(0.14 0.04 25 / 0.4), oklch(0.10 0.005 260))',
                      border: `2px solid oklch(0.35 0.15 25)`,
                      borderRadius: '4px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '4px',
                          background: 'oklch(0.52 0.22 25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.2rem', fontWeight: 700, color: 'white',
                          fontFamily: sFont.heading, letterSpacing: '0.05em',
                        }}>VOP</div>
                        <div>
                          <div style={{ fontFamily: sFont.heading, fontSize: '1rem', color: 'white', letterSpacing: '0.08em' }}>VOP BRIDGE INSTALLER</div>
                          <div style={{ fontFamily: sFont.mono, fontSize: '0.65rem', color: sColor.textDim }}>v2.0 — Windows 10/11 (64-bit)</div>
                        </div>
                      </div>
                      <div style={{ fontFamily: sFont.body, fontSize: '0.78rem', color: sColor.text, marginBottom: '12px', lineHeight: 1.6 }}>
                        One-click installer that sets up everything automatically — Python, PCAN drivers, and the bridge service. No command prompt needed.
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <a
                          href="https://d2xsxph8kpxj0f.cloudfront.net/310519663472908899/S5fEZ6uPndYXxpVXwwyEPy/VOP_Bridge_v2.0_7d80eafb.zip"
                          download="VOP_Bridge_v2.0.zip"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 20px', background: 'oklch(0.52 0.22 25)',
                            border: 'none', borderRadius: '3px', color: 'white',
                            fontFamily: sFont.heading, fontSize: '0.9rem', letterSpacing: '0.1em',
                            textDecoration: 'none', cursor: 'pointer',
                          }}
                        >
                          ⬇ DOWNLOAD BRIDGE
                        </a>
                        <a
                          href="https://d2xsxph8kpxj0f.cloudfront.net/310519663499288273/VRRqdUTMemLPozZ853E4Du/pcan_bridge_v2.1_a588f943.py"
                          download="pcan_bridge.py"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px', background: 'transparent',
                            border: `1px solid ${sColor.border}`, borderRadius: '3px', color: sColor.text,
                            fontFamily: sFont.mono, fontSize: '0.72rem',
                            textDecoration: 'none', cursor: 'pointer',
                          }}
                        >
                          .py only
                        </a>
                        <span style={{ fontFamily: sFont.mono, fontSize: '0.62rem', color: sColor.textDim }}>ZIP: bridge + quickstart + installer · 17 KB</span>
                      </div>
                    </div>

                    {/* Quick Steps */}
                    <div style={{ marginTop: '14px', padding: '12px 16px', background: 'oklch(0.08 0.005 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px' }}>
                      <div style={{ fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.text, letterSpacing: '0.08em', marginBottom: '10px' }}>SETUP — 3 EASY STEPS</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '6px 10px', alignItems: 'start' }}>
                        <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'oklch(0.52 0.22 25)', textAlign: 'center' }}>1</div>
                        <div style={{ fontFamily: sFont.body, fontSize: '0.76rem', color: sColor.text, paddingTop: '2px' }}>
                          <strong>Download & run</strong> the VOP Bridge installer above
                          <div style={{ fontSize: '0.68rem', color: sColor.textDim }}>Installs Python, PCAN drivers, and bridge — all automatic</div>
                        </div>
                        <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'oklch(0.52 0.22 25)', textAlign: 'center' }}>2</div>
                        <div style={{ fontFamily: sFont.body, fontSize: '0.76rem', color: sColor.text, paddingTop: '2px' }}>
                          <strong>Plug in</strong> your PCAN-USB adapter and double-click the VOP Bridge shortcut
                          <div style={{ fontSize: '0.68rem', color: sColor.textDim }}>Bridge starts automatically if you enabled auto-start during install</div>
                        </div>
                        <div style={{ fontFamily: sFont.heading, fontSize: '1.1rem', color: 'oklch(0.52 0.22 25)', textAlign: 'center' }}>3</div>
                        <div style={{ fontFamily: sFont.body, fontSize: '0.76rem', color: sColor.text, paddingTop: '2px' }}>
                          <strong>Click CHECK</strong> above, then <strong>CONNECT</strong> — you're live!
                          <div style={{ fontSize: '0.68rem', color: sColor.textDim }}>First time? Accept the certificate at <strong style={{ color: sColor.text }}>https://localhost:8766</strong></div>
                        </div>
                      </div>
                    </div>

                    {/* Supported Adapters + Advanced */}
                    <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{ padding: '8px 10px', background: 'oklch(0.12 0.02 55 / 0.2)', border: '1px solid oklch(0.25 0.08 55)', borderRadius: '3px' }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.orange, marginBottom: '4px', letterSpacing: '0.06em' }}>SUPPORTED ADAPTERS</div>
                        <div>PCAN-USB</div>
                        <div>PCAN-USB FD</div>
                        <div>PCAN-USB Pro</div>
                        <div>Any python-can adapter</div>
                      </div>
                      <div style={{ padding: '8px 10px', background: 'oklch(0.10 0.005 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px' }}>
                        <div style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textMuted, marginBottom: '4px', letterSpacing: '0.06em' }}>WHAT'S INCLUDED</div>
                        <div>Python 3.11 (embedded)</div>
                        <div>PEAK PCAN drivers</div>
                        <div>Auto-start on login</div>
                        <div>System tray icon</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '0.68rem' }}>
                      Protocol: Raw CAN {'→'} ISO 15765-4 (ISO-TP) via bridge. 500 kbit/s default.
                      <br /><span style={{ color: sColor.orange }}>GM Mode 22 extended PIDs supported through raw CAN frame construction.</span>
                    </div>

                    {/* Advanced / Manual setup collapsible */}
                    <details style={{ marginTop: '10px' }}>
                      <summary style={{ fontFamily: sFont.mono, fontSize: '0.68rem', color: sColor.textDim, cursor: 'pointer', letterSpacing: '0.04em' }}>ADVANCED: Manual setup (for developers)</summary>
                      <div style={{ padding: '10px 12px', marginTop: '6px', background: 'oklch(0.08 0.005 260)', border: `1px solid ${sColor.border}`, borderRadius: '3px', fontFamily: sFont.mono, fontSize: '0.7rem' }}>
                        <div style={{ color: sColor.textMuted, marginBottom: '4px' }}># 1. Install dependencies (one-time)</div>
                        <div style={{ color: sColor.green }}>pip install python-can websockets</div>
                        <div style={{ color: sColor.textMuted, marginTop: '8px', marginBottom: '4px' }}># 2. Plug in USB-CAN adapter, then run the bridge</div>
                        <div style={{ color: sColor.green }}>python pcan_bridge.py</div>
                        <div style={{ color: sColor.textMuted, marginTop: '8px', marginBottom: '4px' }}># 3. Click CHECK above to verify, then CONNECT</div>
                      </div>
                    </details>
                  </div>
                </>
              )}

              {adapterType === 'can2usb' && (
                <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, lineHeight: 1.6, maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
                  <strong style={{ color: sColor.text }}>V-OP Can2USB</strong> is a <strong style={{ color: sColor.orange }}>USB–CAN bridge</strong>. Connect it to your PC, turn the vehicle ignition <strong>ON</strong>, then click <strong style={{ color: sColor.green }}>CONNECT</strong> and pick the device when the browser asks (Chrome or Edge).
                </div>
              )}
            </div>
          )}

          {/* Ready state */}
          {connectionState === 'ready' && !isLogging && liveReadings.size === 0 && (
            <div style={{
              background: 'oklch(0.12 0.01 145 / 0.15)', border: `1px solid oklch(0.30 0.10 145)`,
              borderRadius: '3px', padding: '24px 20px', textAlign: 'center',
            }}>
              <CheckCircle style={{ width: 36, height: 36, color: sColor.green, margin: '0 auto 12px' }} />
              <div style={{ fontFamily: sFont.heading, fontSize: '1rem', color: sColor.text, letterSpacing: '0.1em', marginBottom: '8px' }}>
                DEVICE READY
              </div>
              <div style={{ fontFamily: sFont.body, fontSize: '0.85rem', color: sColor.textDim, lineHeight: 1.5 }}>
                Select your PIDs from the panel on the left (or use a preset), then click <strong style={{ color: sColor.red }}>START LOG</strong> to begin recording.
                <br /><span style={{ color: sColor.orange }}>Tip: Use the GM EXT (22) filter to see diesel-specific parameters like FRP, DPF soot, DEF level, and turbo vane position.</span>
              </div>
            </div>
          )}

          {/* Completed Sessions */}
          <SessionList
            sessions={completedSessions}
            onExportCSV={handleExportCSV}
            onOpenInAnalyzer={handleOpenInAnalyzer}
            onDelete={handleDeleteSession}
          />
        </div>
      </div>

      {/* Console */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={() => setShowConsole(!showConsole)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            fontFamily: sFont.heading, fontSize: '0.8rem', color: sColor.textDim,
            letterSpacing: '0.1em', background: 'transparent', border: 'none',
            cursor: 'pointer', marginBottom: '6px',
          }}
        >
          <Terminal style={{ width: 14, height: 14 }} />
          DEVICE CONSOLE
          {showConsole ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
        </button>
        {showConsole && <ConsoleLog logs={consoleLogs} />}
      </div>
    </div>
  );
}
