import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  STANDARD_PIDS,
  GM_EXTENDED_PIDS,
  ALL_PIDS,
  PID_PRESETS,
  exportSessionToCSV,
  sessionToAnalyzerCSV,
  LogSession,
  PIDDefinition,
  PIDReading,
  loadCustomPresets,
  saveCustomPresets,
  createCustomPreset,
  deleteCustomPreset,
  updateCustomPreset,
  getAllPresets,
  findPidByNumber,
  getPidsByCategory,
  getMode22Pids,
  getMode01Pids,
} from './obdConnection';

// ─── PID Formula Tests ──────────────────────────────────────────────────────

describe('STANDARD_PIDS', () => {
  it('contains expected core PIDs', () => {
    const pidNumbers = STANDARD_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x05); // ECT
    expect(pidNumbers).toContain(0x0C); // RPM
    expect(pidNumbers).toContain(0x0D); // Speed
    expect(pidNumbers).toContain(0x0B); // MAP
    expect(pidNumbers).toContain(0x10); // MAF
    expect(pidNumbers).toContain(0x23); // FRP diesel
    expect(pidNumbers).toContain(0x78); // EGT
    expect(pidNumbers).toContain(0x42); // Voltage
  });

  it('has unique PIDs', () => {
    const pidNumbers = STANDARD_PIDS.map(p => p.pid);
    const unique = new Set(pidNumbers);
    expect(unique.size).toBe(pidNumbers.length);
  });

  it('all PIDs have required fields', () => {
    for (const pid of STANDARD_PIDS) {
      expect(pid.pid).toBeGreaterThanOrEqual(0);
      expect(pid.name).toBeTruthy();
      expect(pid.shortName).toBeTruthy();
      expect(pid.unit).toBeDefined();
      expect(pid.bytes).toBeGreaterThan(0);
      expect(typeof pid.formula).toBe('function');
      expect(pid.category).toBeTruthy();
    }
  });

  it('all standard PIDs default to service 0x01', () => {
    for (const pid of STANDARD_PIDS) {
      expect(pid.service ?? 0x01).toBe(0x01);
    }
  });
});

describe('PID formulas', () => {
  const findPid = (id: number) => STANDARD_PIDS.find(p => p.pid === id)!;

  it('ECT (0x05): A - 40', () => {
    const pid = findPid(0x05);
    expect(pid.formula([0])).toBe(-40);
    expect(pid.formula([40])).toBe(0);
    expect(pid.formula([140])).toBe(100);
    expect(pid.formula([255])).toBe(215);
  });

  it('RPM (0x0C): ((A*256)+B)/4', () => {
    const pid = findPid(0x0C);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x1A, 0xF8])).toBe(1726);
    expect(pid.formula([0xFF, 0xFF])).toBeCloseTo(16383.75);
  });

  it('Vehicle Speed (0x0D): A', () => {
    const pid = findPid(0x0D);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([100])).toBe(100);
    expect(pid.formula([255])).toBe(255);
  });

  it('MAP (0x0B): A (kPa)', () => {
    const pid = findPid(0x0B);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([101])).toBe(101);
    expect(pid.formula([255])).toBe(255);
  });

  it('MAF (0x10): ((A*256)+B)/100', () => {
    const pid = findPid(0x10);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([1, 0])).toBe(2.56);
    expect(pid.formula([0xFF, 0xFF])).toBeCloseTo(655.35);
  });

  it('Throttle (0x11): (A*100)/255', () => {
    const pid = findPid(0x11);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
    expect(pid.formula([128])).toBeCloseTo(50.2, 0);
  });

  it('Load (0x04): (A*100)/255', () => {
    const pid = findPid(0x04);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
  });

  it('STFT (0x06): ((A-128)*100)/128', () => {
    const pid = findPid(0x06);
    expect(pid.formula([128])).toBe(0);
    expect(pid.formula([0])).toBe(-100);
    expect(pid.formula([255])).toBeCloseTo(99.2, 0);
  });

  it('Fuel Rail Pressure diesel (0x23): ((A*256)+B)*10', () => {
    const pid = findPid(0x23);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0xFF, 0xFF])).toBe(655350);
  });

  it('Barometric (0x33): A', () => {
    const pid = findPid(0x33);
    expect(pid.formula([101])).toBe(101);
  });

  it('Catalyst Temp (0x3C): ((A*256)+B)/10 - 40', () => {
    const pid = findPid(0x3C);
    expect(pid.formula([0, 0])).toBe(-40);
    expect(pid.formula([0x01, 0x90])).toBe(0);
  });

  it('Module Voltage (0x42): ((A*256)+B)/1000', () => {
    const pid = findPid(0x42);
    expect(pid.formula([0x37, 0xDC])).toBeCloseTo(14.3, 0);
  });
});

// ─── GM Mode 22 Extended PID Tests ─────────────────────────────────────────

describe('GM_EXTENDED_PIDS', () => {
  it('contains expected diesel-specific PIDs', () => {
    const pidNumbers = GM_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x0564); // Commanded FRP
    expect(pidNumbers).toContain(0x0565); // Actual FRP
    expect(pidNumbers).toContain(0x1A10); // DPF Soot Load
    expect(pidNumbers).toContain(0x1A20); // DEF Tank Level
    expect(pidNumbers).toContain(0x0576); // Turbo Speed
    expect(pidNumbers).toContain(0x0574); // VGT Commanded
    expect(pidNumbers).toContain(0x1940); // IBR Cyl 1
  });

  it('all Mode 22 PIDs have service 0x22', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('has unique PIDs within Mode 22', () => {
    const pidNumbers = GM_EXTENDED_PIDS.map(p => p.pid);
    const unique = new Set(pidNumbers);
    expect(unique.size).toBe(pidNumbers.length);
  });

  it('all PIDs have required fields', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.pid).toBeGreaterThanOrEqual(0);
      expect(pid.name).toBeTruthy();
      expect(pid.shortName).toBeTruthy();
      expect(pid.unit).toBeDefined();
      expect(pid.bytes).toBeGreaterThan(0);
      expect(typeof pid.formula).toBe('function');
      expect(pid.category).toBeTruthy();
    }
  });

  it('covers key diesel categories', () => {
    const categories = new Set(GM_EXTENDED_PIDS.map(p => p.category));
    expect(categories.has('fuel')).toBe(true);
    expect(categories.has('turbo')).toBe(true);
    expect(categories.has('exhaust')).toBe(true);
    expect(categories.has('def')).toBe(true);
    expect(categories.has('transmission')).toBe(true);
    expect(categories.has('engine')).toBe(true);
  });

  it('has all 8 injector balance rates', () => {
    const ibrs = GM_EXTENDED_PIDS.filter(p => p.shortName.startsWith('IBR_'));
    expect(ibrs.length).toBe(8);
    for (let i = 1; i <= 8; i++) {
      expect(ibrs.some(p => p.shortName === `IBR_${i}`)).toBe(true);
    }
  });
});

describe('GM Mode 22 formulas', () => {
  const findExtPid = (id: number) => GM_EXTENDED_PIDS.find(p => p.pid === id)!;

  it('Commanded FRP (0x0564): ((A*256)+B)*0.00390625 MPa', () => {
    const pid = findExtPid(0x0564);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x64, 0x00])).toBeCloseTo(100 * 0.00390625 * 256, 1); // 100 MPa
  });

  it('FRP Deviation (0x054A): signed offset', () => {
    const pid = findExtPid(0x054A);
    expect(pid.formula([128, 0])).toBeCloseTo(0, 0); // ~0 deviation at midpoint
    expect(pid.formula([0, 0])).toBeLessThan(0); // negative deviation
    expect(pid.formula([255, 255])).toBeGreaterThan(0); // positive deviation
  });

  it('DPF Soot Load (0x1A10): ((A*256)+B)*0.01 grams', () => {
    const pid = findExtPid(0x1A10);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x0A, 0x00])).toBeCloseTo(25.6, 1); // 2560 * 0.01
  });

  it('DEF Tank Level (0x1A20): (A*100)/255 percent', () => {
    const pid = findExtPid(0x1A20);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
    expect(pid.formula([128])).toBeCloseTo(50.2, 0);
  });

  it('Turbo Speed (0x0576): ((A*256)+B)*4 rpm', () => {
    const pid = findExtPid(0x0576);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x4E, 0x20])).toBe(80000); // 20000 * 4
  });

  it('VGT Commanded (0x0574): (A*100)/255 percent', () => {
    const pid = findExtPid(0x0574);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
  });

  it('DPF Inlet Temp (0x1A12): ((A*256)+B)*0.1 - 40 degrees C', () => {
    const pid = findExtPid(0x1A12);
    expect(pid.formula([0, 0])).toBe(-40);
    expect(pid.formula([0x01, 0x90])).toBeCloseTo(0, 0); // 400*0.1 - 40 = 0
  });

  it('IBR Cyl 1 (0x1940): signed mm3', () => {
    const pid = findExtPid(0x1940);
    expect(pid.formula([128, 0])).toBeCloseTo(0, 0); // midpoint ~0
    expect(pid.formula([0, 0])).toBeLessThan(0); // negative
    expect(pid.formula([255, 255])).toBeGreaterThan(0); // positive
  });

  it('TCC Slip Speed (0x05A1): signed rpm', () => {
    const pid = findExtPid(0x05A1);
    expect(pid.formula([128, 0])).toBe(0); // midpoint = 0
    expect(pid.formula([0, 0])).toBe(-32768); // max negative
    expect(pid.formula([255, 255])).toBe(32767); // max positive
  });

  it('SCR Inlet NOx (0x1A23): ((A*256)+B)*0.05 ppm', () => {
    const pid = findExtPid(0x1A23);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x27, 0x10])).toBeCloseTo(500, 0); // 10000 * 0.05
  });
});

// ─── ALL_PIDS Combined Tests ──────────────────────────────────────────────

describe('ALL_PIDS', () => {
  it('contains both standard and extended PIDs', () => {
    // ALL_PIDS now includes standard + GM + Ford + Chrysler + Toyota + Honda extended PIDs
    expect(ALL_PIDS.length).toBeGreaterThan(STANDARD_PIDS.length + GM_EXTENDED_PIDS.length);
  });

  it('no PID collisions between standard and extended (different services)', () => {
    // PIDs can share the same number if they have different services
    const keys = ALL_PIDS.map(p => `${p.service ?? 0x01}-${p.pid}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });
});

// ─── PID Lookup Helper Tests ──────────────────────────────────────────────

describe('PID lookup helpers', () => {
  it('findPidByNumber finds standard PIDs', () => {
    const rpm = findPidByNumber(0x0C);
    expect(rpm).toBeDefined();
    expect(rpm!.shortName).toBe('RPM');
  });

  it('findPidByNumber finds Mode 22 PIDs', () => {
    const dpfSoot = findPidByNumber(0x1A10);
    expect(dpfSoot).toBeDefined();
    expect(dpfSoot!.shortName).toBe('DPF_SOOT');
  });

  it('getPidsByCategory returns correct PIDs', () => {
    const fuelPids = getPidsByCategory('fuel');
    expect(fuelPids.length).toBeGreaterThan(0);
    for (const pid of fuelPids) {
      expect(pid.category).toBe('fuel');
    }
  });

  it('getPidsByCategory includes both standard and extended', () => {
    const fuelPids = getPidsByCategory('fuel');
    const hasStd = fuelPids.some(p => (p.service ?? 0x01) === 0x01);
    const hasExt = fuelPids.some(p => (p.service ?? 0x01) === 0x22);
    expect(hasStd).toBe(true);
    expect(hasExt).toBe(true);
  });

  it('getMode22Pids returns only extended PIDs', () => {
    const pids = getMode22Pids();
    // Now includes GM + Ford + Chrysler + Toyota + Honda extended PIDs
    expect(pids.length).toBeGreaterThanOrEqual(GM_EXTENDED_PIDS.length);
    for (const pid of pids) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('getMode01Pids returns only standard PIDs', () => {
    const pids = getMode01Pids();
    expect(pids.length).toBe(STANDARD_PIDS.length);
    for (const pid of pids) {
      expect(pid.service ?? 0x01).toBe(0x01);
    }
  });
});

// ─── PID Presets Tests ──────────────────────────────────────────────────────

describe('PID_PRESETS', () => {
  it('has expected preset names', () => {
    const names = PID_PRESETS.map(p => p.name);
    expect(names).toContain('Engine Basics');
    expect(names).toContain('Fuel Trims');
    expect(names).toContain('Transmission');
    expect(names).toContain('Full Duramax');
    expect(names).toContain('Diesel Turbo/Boost');
    expect(names).toContain('Gas Engine Monitor');
  });

  it('all preset PIDs exist in STANDARD_PIDS', () => {
    const validPids = new Set(STANDARD_PIDS.map(p => p.pid));
    for (const preset of PID_PRESETS) {
      for (const pid of preset.pids) {
        expect(validPids.has(pid)).toBe(true);
      }
    }
  });

  it('all presets include RPM (0x0C)', () => {
    for (const preset of PID_PRESETS) {
      expect(preset.pids).toContain(0x0C);
    }
  });

  it('Full Duramax preset has the most PIDs', () => {
    const fullDuramax = PID_PRESETS.find(p => p.name === 'Full Duramax')!;
    for (const preset of PID_PRESETS) {
      if (preset.name !== 'Full Duramax') {
        expect(fullDuramax.pids.length).toBeGreaterThanOrEqual(preset.pids.length);
      }
    }
  });
});

// ─── Custom Preset Tests ──────────────────────────────────────────────────

describe('Custom Preset Management', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    // Mock localStorage for Node environment
    mockStorage = {};
    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
      length: 0,
      key: (_index: number) => null as string | null,
    };
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loadCustomPresets returns empty array when no presets stored', () => {
    const presets = loadCustomPresets();
    expect(presets).toEqual([]);
  });

  it('createCustomPreset creates a valid preset', () => {
    const preset = createCustomPreset('My Tune', 'FRP + Boost', [0x0C, 0x0564, 0x0572]);
    expect(preset.name).toBe('My Tune');
    expect(preset.description).toBe('FRP + Boost');
    expect(preset.pids).toEqual([0x0C, 0x0564, 0x0572]);
    expect(preset.isCustom).toBe(true);
    expect(preset.id).toBeTruthy();
    expect(preset.createdAt).toBeGreaterThan(0);
  });

  it('saveCustomPresets and loadCustomPresets round-trip', () => {
    const preset1 = createCustomPreset('Preset A', 'Desc A', [0x0C, 0x0D]);
    const preset2 = createCustomPreset('Preset B', 'Desc B', [0x0564, 0x1A10]);
    saveCustomPresets([preset1, preset2]);

    const loaded = loadCustomPresets();
    expect(loaded.length).toBe(2);
    expect(loaded[0].name).toBe('Preset A');
    expect(loaded[1].name).toBe('Preset B');
    expect(loaded[0].isCustom).toBe(true);
    expect(loaded[1].isCustom).toBe(true);
  });

  it('deleteCustomPreset removes the correct preset', () => {
    const preset1 = createCustomPreset('Keep', 'Keep this', [0x0C]);
    const preset2 = createCustomPreset('Delete', 'Delete this', [0x0D]);
    saveCustomPresets([preset1, preset2]);

    const updated = deleteCustomPreset([preset1, preset2], preset2.id!);
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('Keep');
  });

  it('updateCustomPreset modifies the correct preset', () => {
    const preset1 = createCustomPreset('Original', 'Original desc', [0x0C]);
    saveCustomPresets([preset1]);

    const updated = updateCustomPreset([preset1], preset1.id!, {
      name: 'Updated',
      description: 'Updated desc',
      pids: [0x0C, 0x0D, 0x0564],
    });
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('Updated');
    expect(updated[0].description).toBe('Updated desc');
    expect(updated[0].pids).toEqual([0x0C, 0x0D, 0x0564]);
  });

  it('getAllPresets includes both built-in and custom presets', () => {
    const custom = createCustomPreset('Custom', 'Custom desc', [0x0C]);
    saveCustomPresets([custom]);

    const all = getAllPresets();
    expect(all.length).toBe(PID_PRESETS.length + 1);
    expect(all.some(p => p.name === 'Custom')).toBe(true);
    expect(all.some(p => p.name === 'Engine Basics')).toBe(true);
  });

  it('custom presets can include Mode 22 PIDs', () => {
    const preset = createCustomPreset('Diesel Deep', 'FRP + DPF + DEF', [0x0564, 0x0565, 0x1A10, 0x1A20]);
    expect(preset.pids).toContain(0x0564);
    expect(preset.pids).toContain(0x1A10);
    expect(preset.pids).toContain(0x1A20);
  });
});

// ─── CSV Export Tests ───────────────────────────────────────────────────────

function createMockSession(): LogSession {
  const rpmPid: PIDDefinition = STANDARD_PIDS.find(p => p.pid === 0x0C)!;
  const ectPid: PIDDefinition = STANDARD_PIDS.find(p => p.pid === 0x05)!;

  const readings = new Map<number, PIDReading[]>();
  readings.set(0x0C, [
    { pid: 0x0C, name: 'Engine RPM', shortName: 'RPM', value: 800, unit: 'rpm', rawBytes: [0x0C, 0x80], timestamp: 1000 },
    { pid: 0x0C, name: 'Engine RPM', shortName: 'RPM', value: 1200, unit: 'rpm', rawBytes: [0x12, 0xC0], timestamp: 1200 },
    { pid: 0x0C, name: 'Engine RPM', shortName: 'RPM', value: 2500, unit: 'rpm', rawBytes: [0x27, 0x10], timestamp: 1400 },
  ]);
  readings.set(0x05, [
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 85, unit: '\u00b0C', rawBytes: [0x7D], timestamp: 1000 },
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 87, unit: '\u00b0C', rawBytes: [0x7F], timestamp: 1200 },
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 90, unit: '\u00b0C', rawBytes: [0x82], timestamp: 1400 },
  ]);

  return {
    id: 'test-session-1',
    startTime: 1000,
    endTime: 1400,
    sampleRate: 200,
    pids: [rpmPid, ectPid],
    readings,
  };
}

function createMockMode22Session(): LogSession {
  const frpPid = GM_EXTENDED_PIDS.find(p => p.pid === 0x0564)!;
  const dpfPid = GM_EXTENDED_PIDS.find(p => p.pid === 0x1A10)!;

  const readings = new Map<number, PIDReading[]>();
  readings.set(0x0564, [
    { pid: 0x0564, name: 'Commanded Fuel Rail Pressure', shortName: 'FRP_CMD', value: 30.5, unit: 'MPa', rawBytes: [0x1E, 0x80], timestamp: 2000 },
    { pid: 0x0564, name: 'Commanded Fuel Rail Pressure', shortName: 'FRP_CMD', value: 45.2, unit: 'MPa', rawBytes: [0x2D, 0x33], timestamp: 2200 },
  ]);
  readings.set(0x1A10, [
    { pid: 0x1A10, name: 'DPF Soot Load', shortName: 'DPF_SOOT', value: 12.5, unit: 'g', rawBytes: [0x04, 0xE2], timestamp: 2000 },
    { pid: 0x1A10, name: 'DPF Soot Load', shortName: 'DPF_SOOT', value: 12.8, unit: 'g', rawBytes: [0x05, 0x00], timestamp: 2200 },
  ]);

  return {
    id: 'test-session-mode22',
    startTime: 2000,
    endTime: 2200,
    sampleRate: 200,
    pids: [frpPid, dpfPid],
    readings,
  };
}

describe('exportSessionToCSV', () => {
  it('generates valid CSV with headers', () => {
    const session = createMockSession();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toContain('Timestamp (ms)');
    expect(lines[0]).toContain('Elapsed (s)');
    expect(lines[0]).toContain('RPM (rpm)');
    expect(lines[0]).toContain('ECT');
  });

  it('has correct number of data rows', () => {
    const session = createMockSession();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');
    expect(lines.length).toBe(4); // Header + 3 data rows
  });

  it('contains correct values', () => {
    const session = createMockSession();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('800');
    expect(lines[1]).toContain('85');
  });

  it('handles Mode 22 sessions', () => {
    const session = createMockMode22Session();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');

    expect(lines[0]).toContain('FRP_CMD');
    expect(lines[0]).toContain('DPF_SOOT');
    expect(lines.length).toBe(3); // Header + 2 data rows
  });
});

describe('sessionToAnalyzerCSV', () => {
  it('generates HP Tuners compatible format with unit row', () => {
    const session = createMockSession();
    const csv = sessionToAnalyzerCSV(session);
    const lines = csv.split('\n');

    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0]).toContain('Time');
    expect(lines[0]).toContain('Engine RPM');
    expect(lines[0]).toContain('Engine Coolant Temperature');
    expect(lines[1]).toContain('s');
    expect(lines[1]).toContain('rpm');
  });

  it('has elapsed time in seconds', () => {
    const session = createMockSession();
    const csv = sessionToAnalyzerCSV(session);
    const lines = csv.split('\n');
    const firstDataRow = lines[2].split(',');
    expect(firstDataRow[0]).toBe('0.000');
  });

  it('handles Mode 22 sessions in analyzer format', () => {
    const session = createMockMode22Session();
    const csv = sessionToAnalyzerCSV(session);
    const lines = csv.split('\n');

    expect(lines[0]).toContain('Commanded Fuel Rail Pressure');
    expect(lines[0]).toContain('DPF Soot Load');
    expect(lines[1]).toContain('MPa');
    expect(lines[1]).toContain('g');
  });
});
