import { describe, it, expect } from 'vitest';
import {
  createDefaultLayout,
  resolvePidFromKey,
  populateEmptySlots,
  type DashboardLayout,
  type GaugeSlot,
} from './LiveGaugeDashboard';
import type { PIDDefinition } from '@/lib/obdConnection';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makePid(pid: number, name: string, service = 0x01): PIDDefinition {
  return {
    pid,
    name,
    shortName: name.slice(0, 6).toUpperCase(),
    unit: 'RPM',
    min: 0,
    max: 8000,
    formula: (bytes: number[]) => bytes[0],
    bytes: 2,
    service,
    category: 'engine',
  };
}

// ─── createDefaultLayout ──────────────────────────────────────────────────

describe('createDefaultLayout', () => {
  it('creates correct number of slots for 2x2', () => {
    const layout = createDefaultLayout(2, 2);
    expect(layout.slots).toHaveLength(4);
    expect(layout.columns).toBe(2);
    expect(layout.name).toBe('2x2');
  });

  it('creates correct number of slots for 4x3', () => {
    const layout = createDefaultLayout(4, 3);
    expect(layout.slots).toHaveLength(12);
    expect(layout.columns).toBe(4);
  });

  it('all slots start empty', () => {
    const layout = createDefaultLayout(3, 2);
    for (const slot of layout.slots) {
      expect(slot.pidKey).toBeNull();
      expect(slot.gaugeType).toBe('radial');
    }
  });

  it('assigns large size for 2 columns or fewer', () => {
    const layout = createDefaultLayout(2, 1);
    expect(layout.slots[0].size).toBe('large');
  });

  it('assigns medium size for 3 columns', () => {
    const layout = createDefaultLayout(3, 2);
    expect(layout.slots[0].size).toBe('medium');
  });

  it('assigns small size for 4+ columns', () => {
    const layout = createDefaultLayout(4, 2);
    expect(layout.slots[0].size).toBe('small');
  });

  it('creates unique slot IDs', () => {
    const layout = createDefaultLayout(3, 3);
    const ids = layout.slots.map(s => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('handles 1x1 layout', () => {
    const layout = createDefaultLayout(1, 1);
    expect(layout.slots).toHaveLength(1);
    expect(layout.columns).toBe(1);
    expect(layout.name).toBe('1x1');
  });
});

// ─── resolvePidFromKey ────────────────────────────────────────────────────

describe('resolvePidFromKey', () => {
  const pids = [
    makePid(0x0C, 'RPM'),
    makePid(0x0D, 'Speed'),
    makePid(0x05, 'Coolant Temp'),
    makePid(0xF00A, 'Rail Pressure', 0x22),
  ];

  it('returns null for null key', () => {
    expect(resolvePidFromKey(null, pids)).toBeNull();
  });

  it('resolves a standard PID key', () => {
    const result = resolvePidFromKey('1-12', pids); // service 1, pid 0x0C = 12
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(0x0C);
  });

  it('resolves a Mode 22 PID key', () => {
    const result = resolvePidFromKey('34-61450', pids); // service 0x22 = 34, pid 0xF00A = 61450
    expect(result).not.toBeNull();
    expect(result!.pid).toBe(0xF00A);
    expect(result!.service).toBe(0x22);
  });

  it('returns null for non-existent PID', () => {
    const result = resolvePidFromKey('1-999', pids);
    expect(result).toBeNull();
  });

  it('returns null for empty string key', () => {
    const result = resolvePidFromKey('', pids);
    expect(result).toBeNull();
  });
});

// ─── populateEmptySlots ───────────────────────────────────────────────────

describe('populateEmptySlots', () => {
  const pids = [
    makePid(0x0C, 'RPM'),
    makePid(0x0D, 'Speed'),
    makePid(0x05, 'Coolant Temp'),
  ];

  it('fills empty slots with active PIDs', () => {
    const layout = createDefaultLayout(3, 1);
    const filled = populateEmptySlots(layout, pids);
    expect(filled.slots[0].pidKey).toBe('1-12');
    expect(filled.slots[1].pidKey).toBe('1-13');
    expect(filled.slots[2].pidKey).toBe('1-5');
  });

  it('does not overwrite already-assigned slots', () => {
    const layout = createDefaultLayout(3, 1);
    layout.slots[0].pidKey = '1-12'; // RPM already assigned
    const filled = populateEmptySlots(layout, pids);
    expect(filled.slots[0].pidKey).toBe('1-12'); // unchanged
    expect(filled.slots[1].pidKey).toBe('1-13'); // Speed fills next empty
    expect(filled.slots[2].pidKey).toBe('1-5');  // Coolant fills next
  });

  it('does not duplicate already-assigned PIDs', () => {
    const layout = createDefaultLayout(3, 1);
    layout.slots[0].pidKey = '1-12'; // RPM already assigned
    const filled = populateEmptySlots(layout, pids);
    // RPM should NOT appear in slot 1 or 2 since it's already in slot 0
    const pidKeys = filled.slots.map(s => s.pidKey);
    const rpmCount = pidKeys.filter(k => k === '1-12').length;
    expect(rpmCount).toBe(1);
  });

  it('returns same layout when no empty slots', () => {
    const layout = createDefaultLayout(2, 1);
    layout.slots[0].pidKey = '1-12';
    layout.slots[1].pidKey = '1-13';
    const filled = populateEmptySlots(layout, pids);
    expect(filled.slots[0].pidKey).toBe('1-12');
    expect(filled.slots[1].pidKey).toBe('1-13');
  });

  it('returns same layout when no unassigned PIDs', () => {
    const layout = createDefaultLayout(3, 1);
    layout.slots[0].pidKey = '1-12';
    layout.slots[1].pidKey = '1-13';
    layout.slots[2].pidKey = '1-5';
    const filled = populateEmptySlots(layout, pids);
    expect(filled).toBe(layout); // exact same reference — no changes
  });

  it('handles more slots than PIDs', () => {
    const layout = createDefaultLayout(4, 2); // 8 slots
    const filled = populateEmptySlots(layout, pids); // only 3 PIDs
    const assigned = filled.slots.filter(s => s.pidKey !== null);
    expect(assigned).toHaveLength(3);
    const empty = filled.slots.filter(s => s.pidKey === null);
    expect(empty).toHaveLength(5);
  });

  it('handles more PIDs than slots', () => {
    const layout = createDefaultLayout(2, 1); // 2 slots
    const filled = populateEmptySlots(layout, pids); // 3 PIDs
    expect(filled.slots[0].pidKey).toBe('1-12');
    expect(filled.slots[1].pidKey).toBe('1-13');
    // 3rd PID has no slot
  });

  it('handles empty PID list', () => {
    const layout = createDefaultLayout(3, 1);
    const filled = populateEmptySlots(layout, []);
    expect(filled).toBe(layout); // no changes
  });

  it('preserves gaugeType when filling', () => {
    const layout = createDefaultLayout(2, 1);
    layout.slots[0].gaugeType = 'bar';
    const filled = populateEmptySlots(layout, pids);
    expect(filled.slots[0].gaugeType).toBe('bar');
    expect(filled.slots[0].pidKey).toBe('1-12');
  });

  it('handles Mode 22 PIDs correctly', () => {
    const extPids = [makePid(0xF00A, 'Rail Pressure', 0x22)];
    const layout = createDefaultLayout(2, 1);
    const filled = populateEmptySlots(layout, extPids);
    expect(filled.slots[0].pidKey).toBe('34-61450'); // 0x22=34, 0xF00A=61450
  });
});
