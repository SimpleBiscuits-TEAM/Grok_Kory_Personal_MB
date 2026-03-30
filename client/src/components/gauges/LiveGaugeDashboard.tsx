/**
 * LiveGaugeDashboard — Configurable gauge grid for live datalogging
 * 
 * Features:
 * - Configurable grid layout (2x2, 3x2, 4x3, etc.)
 * - Drag-and-drop PID assignment from PID list to gauge slots
 * - Right-click context menu for PID selection on any gauge slot
 * - Mix of RadialGauge and BarGauge types per slot
 * - Layout persistence via localStorage
 * - Responsive grid that adapts to screen size
 */

import { useState, useCallback, useEffect } from 'react';
import RadialGauge, { type GaugeSize } from './RadialGauge';
import BarGauge from './BarGauge';
import PidContextMenu from './PidContextMenu';
import type { PIDDefinition, PIDReading } from '@/lib/obdConnection';

import { LayoutGrid, Plus, Minus, RotateCcw } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

export type GaugeType = 'radial' | 'bar';

export interface GaugeSlot {
  id: string;
  pidKey: string | null;  // `${service}-${pid}` or null for empty
  gaugeType: GaugeType;
  size: GaugeSize;
}

export interface DashboardLayout {
  name: string;
  columns: number;
  slots: GaugeSlot[];
}

export interface LiveGaugeDashboardProps {
  liveReadings: Map<number, PIDReading>;
  activePids: PIDDefinition[];
  allAvailablePids: PIDDefinition[];
  isLogging: boolean;
}

// ─── Storage ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ppei-gauge-layout';

function saveLayout(layout: DashboardLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch { /* ignore */ }
}

function loadLayout(): DashboardLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

// ─── Default Layouts ───────────────────────────────────────────────────────

/**
 * Resolve a PID key ("service-pid") to a PIDDefinition from a list.
 * Pure function, exported for testing.
 */
export function resolvePidFromKey(key: string | null, allPids: PIDDefinition[]): PIDDefinition | null {
  if (!key) return null;
  const [svc, pid] = key.split('-').map(Number);
  return allPids.find(p => (p.service ?? 0x01) === svc && p.pid === pid) || null;
}

/**
 * Populate empty slots in a layout with active PIDs.
 * Returns a new layout with filled slots. Pure function, exported for testing.
 */
export function populateEmptySlots(layout: DashboardLayout, activePids: PIDDefinition[]): DashboardLayout {
  const assigned = new Set(layout.slots.filter(s => s.pidKey).map(s => s.pidKey));
  const unassigned = activePids.filter(p => !assigned.has(`${p.service ?? 0x01}-${p.pid}`));
  if (unassigned.length === 0) return layout;

  const updated = { ...layout, slots: [...layout.slots] };
  let ui = 0;
  for (let i = 0; i < updated.slots.length && ui < unassigned.length; i++) {
    if (!updated.slots[i].pidKey) {
      updated.slots[i] = {
        ...updated.slots[i],
        pidKey: `${unassigned[ui].service ?? 0x01}-${unassigned[ui].pid}`,
      };
      ui++;
    }
  }
  return updated;
}

export function createDefaultLayout(columns: number, rows: number): DashboardLayout {
  const slots: GaugeSlot[] = [];
  for (let i = 0; i < columns * rows; i++) {
    slots.push({
      id: `slot-${i}`,
      pidKey: null,
      gaugeType: 'radial',
      size: columns <= 2 ? 'large' : columns <= 3 ? 'medium' : 'small',
    });
  }
  return { name: `${columns}x${rows}`, columns, slots };
}

const PRESET_LAYOUTS = [
  { label: '2x1', cols: 2, rows: 1 },
  { label: '2x2', cols: 2, rows: 2 },
  { label: '3x2', cols: 3, rows: 2 },
  { label: '4x2', cols: 4, rows: 2 },
  { label: '4x3', cols: 4, rows: 3 },
];

// ─── Styles ────────────────────────────────────────────────────────────────

const sFont = {
  heading: '"Bebas Neue", "Impact", sans-serif',
  body: '"Rajdhani", sans-serif',
  mono: '"Share Tech Mono", monospace',
};
const sColor = {
  bg: 'oklch(0.06 0.003 260)',
  bgCard: 'oklch(0.30 0.005 260)',
  border: 'oklch(0.22 0.008 260)',
  red: 'oklch(0.52 0.22 25)',
  cyan: 'oklch(0.70 0.14 200)',
  text: 'oklch(0.95 0.005 260)',
  textDim: 'oklch(0.68 0.010 260)',
  textMuted: 'oklch(0.55 0.008 260)',
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function LiveGaugeDashboard({
  liveReadings, activePids, allAvailablePids, isLogging,
}: LiveGaugeDashboardProps) {
  const [layout, setLayout] = useState<DashboardLayout>(() => {
    const saved = loadLayout();
    if (saved) return saved;
    // Default: auto-populate with active PIDs
    const def = createDefaultLayout(3, 2);
    activePids.slice(0, def.slots.length).forEach((pid, i) => {
      def.slots[i].pidKey = `${pid.service ?? 0x01}-${pid.pid}`;
    });
    return def;
  });

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; slotId: string;
  } | null>(null);

  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);

  // Auto-populate empty slots with active PIDs when logging starts
  useEffect(() => {
    if (!isLogging) return;
    setLayout(prev => {
      const assigned = new Set(prev.slots.filter(s => s.pidKey).map(s => s.pidKey));
      const unassigned = activePids.filter(p => !assigned.has(`${p.service ?? 0x01}-${p.pid}`));
      if (unassigned.length === 0) return prev;

      const updated = { ...prev, slots: [...prev.slots] };
      let ui = 0;
      for (let i = 0; i < updated.slots.length && ui < unassigned.length; i++) {
        if (!updated.slots[i].pidKey) {
          updated.slots[i] = {
            ...updated.slots[i],
            pidKey: `${unassigned[ui].service ?? 0x01}-${unassigned[ui].pid}`,
          };
          ui++;
        }
      }
      return updated;
    });
  }, [isLogging, activePids]);

  // Resolve PID from key
  const resolvePid = useCallback((key: string | null): PIDDefinition | null => {
    if (!key) return null;
    const [svc, pid] = key.split('-').map(Number);
    return allAvailablePids.find(p => (p.service ?? 0x01) === svc && p.pid === pid) || null;
  }, [allAvailablePids]);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleRightClick = useCallback((e: React.MouseEvent, slotId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, slotId });
  }, []);

  const handlePidSelect = useCallback((pid: PIDDefinition) => {
    if (!contextMenu) return;
    setLayout(prev => {
      const updated = { ...prev, slots: prev.slots.map(s =>
        s.id === contextMenu.slotId
          ? { ...s, pidKey: `${pid.service ?? 0x01}-${pid.pid}` }
          : s
      )};
      saveLayout(updated);
      return updated;
    });
    setContextMenu(null);
  }, [contextMenu]);

  const handlePidRemove = useCallback(() => {
    if (!contextMenu) return;
    setLayout(prev => {
      const updated = { ...prev, slots: prev.slots.map(s =>
        s.id === contextMenu.slotId ? { ...s, pidKey: null } : s
      )};
      saveLayout(updated);
      return updated;
    });
    setContextMenu(null);
  }, [contextMenu]);

  const handleDrop = useCallback((e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    setDragOverSlotId(null);
    const pidData = e.dataTransfer.getData('application/pid');
    if (!pidData) return;
    try {
      const { service, pid } = JSON.parse(pidData);
      setLayout(prev => {
        const updated = { ...prev, slots: prev.slots.map(s =>
          s.id === slotId ? { ...s, pidKey: `${service}-${pid}` } : s
        )};
        saveLayout(updated);
        return updated;
      });
    } catch { /* ignore */ }
  }, []);

  const handleLayoutChange = useCallback((cols: number, rows: number) => {
    setLayout(prev => {
      const newLayout = createDefaultLayout(cols, rows);
      // Preserve existing PID assignments
      prev.slots.forEach((oldSlot, i) => {
        if (i < newLayout.slots.length && oldSlot.pidKey) {
          newLayout.slots[i].pidKey = oldSlot.pidKey;
          newLayout.slots[i].gaugeType = oldSlot.gaugeType;
        }
      });
      saveLayout(newLayout);
      return newLayout;
    });
  }, []);

  const handleToggleGaugeType = useCallback((slotId: string) => {
    setLayout(prev => {
      const updated = { ...prev, slots: prev.slots.map(s =>
        s.id === slotId ? { ...s, gaugeType: (s.gaugeType === 'radial' ? 'bar' : 'radial') as GaugeType } : s
      )};
      saveLayout(updated);
      return updated;
    });
  }, []);

  const handleAddRow = useCallback(() => {
    setLayout(prev => {
      const currentRows = Math.ceil(prev.slots.length / prev.columns);
      const newLayout = createDefaultLayout(prev.columns, currentRows + 1);
      prev.slots.forEach((oldSlot, i) => {
        if (i < newLayout.slots.length) {
          newLayout.slots[i].pidKey = oldSlot.pidKey;
          newLayout.slots[i].gaugeType = oldSlot.gaugeType;
        }
      });
      saveLayout(newLayout);
      return newLayout;
    });
  }, []);

  const handleRemoveRow = useCallback(() => {
    setLayout(prev => {
      const currentRows = Math.ceil(prev.slots.length / prev.columns);
      if (currentRows <= 1) return prev;
      const newLayout = createDefaultLayout(prev.columns, currentRows - 1);
      prev.slots.forEach((oldSlot, i) => {
        if (i < newLayout.slots.length) {
          newLayout.slots[i].pidKey = oldSlot.pidKey;
          newLayout.slots[i].gaugeType = oldSlot.gaugeType;
        }
      });
      saveLayout(newLayout);
      return newLayout;
    });
  }, []);

  const handleReset = useCallback(() => {
    const def = createDefaultLayout(3, 2);
    activePids.slice(0, def.slots.length).forEach((pid, i) => {
      def.slots[i].pidKey = `${pid.service ?? 0x01}-${pid.pid}`;
    });
    saveLayout(def);
    setLayout(def);
  }, [activePids]);

  // Determine gauge size based on column count
  const gaugeSize: GaugeSize = layout.columns <= 2 ? 'large' : layout.columns <= 3 ? 'medium' : 'small';

  return (
    <div style={{ width: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <LayoutGrid style={{ width: 14, height: 14, color: sColor.cyan }} />
          <span style={{ fontFamily: sFont.heading, fontSize: '0.85rem', color: sColor.text, letterSpacing: '0.1em' }}>
            GAUGE DASHBOARD
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Layout presets */}
          {PRESET_LAYOUTS.map(p => (
            <button
              key={p.label}
              onClick={() => handleLayoutChange(p.cols, p.rows)}
              style={{
                padding: '3px 8px', borderRadius: '3px', cursor: 'pointer',
                fontFamily: sFont.mono, fontSize: '0.65rem', letterSpacing: '0.05em',
                border: `1px solid ${layout.name === p.label ? sColor.cyan : sColor.border}`,
                background: layout.name === p.label ? 'oklch(0.15 0.04 200 / 0.3)' : 'transparent',
                color: layout.name === p.label ? sColor.cyan : sColor.textDim,
              }}
            >
              {p.label}
            </button>
          ))}

          <div style={{ width: '1px', height: '16px', background: sColor.border, margin: '0 4px' }} />

          {/* Add/remove row */}
          <button onClick={handleAddRow} title="Add row" style={{
            padding: '3px 6px', background: 'transparent', border: `1px solid ${sColor.border}`,
            borderRadius: '3px', cursor: 'pointer', color: sColor.textDim,
          }}>
            <Plus style={{ width: 12, height: 12 }} />
          </button>
          <button onClick={handleRemoveRow} title="Remove row" style={{
            padding: '3px 6px', background: 'transparent', border: `1px solid ${sColor.border}`,
            borderRadius: '3px', cursor: 'pointer', color: sColor.textDim,
          }}>
            <Minus style={{ width: 12, height: 12 }} />
          </button>

          <button onClick={handleReset} title="Reset layout" style={{
            padding: '3px 6px', background: 'transparent', border: `1px solid ${sColor.border}`,
            borderRadius: '3px', cursor: 'pointer', color: sColor.textDim,
          }}>
            <RotateCcw style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {/* Hint */}
      <div style={{
        fontFamily: sFont.body, fontSize: '0.68rem', color: sColor.textMuted,
        marginBottom: '10px', lineHeight: 1.5,
      }}>
        Right-click any gauge to change PID. Drag PIDs from the list on the left and drop onto a gauge slot.
      </div>

      {/* Gauge Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
        gap: '12px',
        justifyItems: 'center',
        alignItems: 'center',
        background: sColor.bg,
        borderRadius: '6px',
        padding: '16px',
        border: `1px solid ${sColor.border}`,
        minHeight: '200px',
      }}>
        {layout.slots.map(slot => {
          const pid = resolvePid(slot.pidKey);
          const reading = pid ? (liveReadings.get(pid.pid) || null) : null;
          const isOver = dragOverSlotId === slot.id;

          if (slot.gaugeType === 'bar') {
            return (
              <div
                key={slot.id}
                style={{ width: '100%' }}
                onDragOver={(e) => { e.preventDefault(); setDragOverSlotId(slot.id); }}
                onDragLeave={() => setDragOverSlotId(null)}
              >
                <BarGauge
                  pid={pid}
                  reading={reading}
                  isEmpty={!pid}
                  isDragOver={isOver}
                  onRightClick={(e) => handleRightClick(e, slot.id)}
                  onDrop={(e) => handleDrop(e, slot.id)}
                />
              </div>
            );
          }

          return (
            <div
              key={slot.id}
              onDragOver={(e) => { e.preventDefault(); setDragOverSlotId(slot.id); }}
              onDragLeave={() => setDragOverSlotId(null)}
            >
              <RadialGauge
                pid={pid}
                reading={reading}
                size={gaugeSize}
                isEmpty={!pid}
                isDragOver={isOver}
                onRightClick={(e) => handleRightClick(e, slot.id)}
                onDrop={(e) => handleDrop(e, slot.id)}
              />
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <PidContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          availablePids={allAvailablePids}
          currentPid={resolvePid(
            layout.slots.find(s => s.id === contextMenu.slotId)?.pidKey || null
          )}
          onSelect={handlePidSelect}
          onRemove={handlePidRemove}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
