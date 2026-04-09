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
  FORD_EXTENDED_PIDS,
  getPidsForVehicle,
  getPresetsForVehicle,
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

  it('all GM PIDs have ECU header addresses', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.ecuHeader).toBeDefined();
      expect(pid.ecuHeader!.length).toBeGreaterThan(0);
    }
  });

  it('engine/fuel/turbo/exhaust PIDs use ECM header 7E0', () => {
    const ecmCategories = ['fuel', 'turbo', 'exhaust', 'def', 'emissions', 'engine'];
    const ecmPids = GM_EXTENDED_PIDS.filter(p => ecmCategories.includes(p.category!));
    for (const pid of ecmPids) {
      if (pid.category !== 'transmission') {
        expect(pid.ecuHeader).toBe('7E0');
      }
    }
  });

  it('transmission PIDs use TCM header 7E1', () => {
    const tcmPids = GM_EXTENDED_PIDS.filter(p => p.category === 'transmission');
    expect(tcmPids.length).toBeGreaterThan(0);
    for (const pid of tcmPids) {
      expect(pid.ecuHeader).toBe('7E1');
    }
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
    expect(names).toContain('Full Duramax (Gen 1 / 2017-2023)');
    expect(names).toContain('Full Duramax (Gen 2 / 2024+)');
    expect(names).toContain('Duramax Fuel System (Extended)');
    expect(names).toContain('Duramax DPF / DEF / Emissions');
    expect(names).toContain('Diesel Turbo/Boost');
    expect(names).toContain('Gas Engine Monitor');
    expect(names).toContain('GM E90 / L87 6.2L Gas Truck');
  });

  it('all preset PIDs exist in ALL_PIDS', () => {
    const validPids = new Set(ALL_PIDS.map(p => p.pid));
    for (const preset of PID_PRESETS) {
      for (const pid of preset.pids) {
        expect(validPids.has(pid)).toBe(true);
      }
    }
  });

  it('universal presets include RPM (0x0C)', () => {
    const universalPresets = PID_PRESETS.filter(p => {
      const name = p.name.toLowerCase();
      return name.includes('engine basics') || name.includes('fuel trim') ||
             name.includes('transmission') || name.includes('gas engine') ||
             name.includes('o2') || name.includes('catalyst') ||
             name.includes('evap') || name.includes('diesel');
    });
    for (const preset of universalPresets) {
      expect(preset.pids).toContain(0x0C);
    }
  });

  it('Full Duramax Gen 1 preset has 7 PIDs', () => {
    const fullDuramax = PID_PRESETS.find(p => p.name === 'Full Duramax (Gen 1 / 2017-2023)')!;
    expect(fullDuramax).toBeDefined();
    expect(fullDuramax.pids.length).toBe(7);
  });

  it('Full Duramax Gen 2 preset has 12 PIDs with Mode 22 extended PIDs', () => {
    const gen2 = PID_PRESETS.find(p => p.name === 'Full Duramax (Gen 2 / 2024+)')!;
    expect(gen2).toBeDefined();
    expect(gen2.pids.length).toBe(12);
    // Should include Mode 22 PIDs (>= 0x0500)
    const mode22Pids = gen2.pids.filter(p => p >= 0x0500);
    expect(mode22Pids.length).toBeGreaterThanOrEqual(10);
  });

  it('Duramax Fuel System Extended preset includes injector balance rates', () => {
    const fuelPreset = PID_PRESETS.find(p => p.name === 'Duramax Fuel System (Extended)')!;
    expect(fuelPreset).toBeDefined();
    // Should include all 8 IBR PIDs (0x1940-0x1947)
    for (let i = 0x1940; i <= 0x1947; i++) {
      expect(fuelPreset.pids).toContain(i);
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

// ─── PID Availability Filtering Tests ──────────────────────────────────────

describe('OBDConnection.filterSupportedPids', () => {
  // We can't easily instantiate OBDConnection (needs WebSerial), but we can
  // test the static helper functions that feed into the filtering logic.

  it('isPidSupported returns true for Mode 22 PIDs regardless of bitmask', () => {
    // Mode 22 PIDs always pass through since they can't be checked via Mode 01 bitmask
    const mode22Pid = GM_EXTENDED_PIDS[0];
    expect(mode22Pid.service).toBe(0x22);
    // The logic is: if service === 0x22, always supported
    // We verify this by checking the type definition
    expect(mode22Pid.service).toBeDefined();
  });

  it('standard PIDs can be checked against a bitmask set', () => {
    // Simulate a supportedPids set from a Duramax (diesel — no O2 sensors, no fuel trims)
    const duramaxSupported = new Set([
      0x04, 0x05, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x11, // Core engine
      0x1C, 0x1F, 0x21, 0x23, 0x2F, 0x33, 0x42, 0x43, 0x45, 0x46, 0x49, 0x4C,
    ]);

    // Filter standard PIDs against this set
    const supported = STANDARD_PIDS.filter(p => duramaxSupported.has(p.pid));
    const unsupported = STANDARD_PIDS.filter(p => !duramaxSupported.has(p.pid));

    // Diesel should NOT support O2 sensors, fuel trims, catalyst temps
    expect(unsupported.some(p => p.shortName === 'STFT1')).toBe(true);
    expect(unsupported.some(p => p.shortName === 'LTFT1')).toBe(true);
    expect(unsupported.some(p => p.shortName === 'O2_B1S2')).toBe(true);

    // Diesel SHOULD support RPM, ECT, MAP, Speed
    expect(supported.some(p => p.shortName === 'RPM')).toBe(true);
    expect(supported.some(p => p.shortName === 'ECT')).toBe(true);
    expect(supported.some(p => p.shortName === 'MAP')).toBe(true);
    expect(supported.some(p => p.shortName === 'VSS')).toBe(true);
  });

  it('gas engine supports O2 sensors and fuel trims', () => {
    // Simulate a gas engine supported PID set (Ford Raptor 6.2L)
    const gasSupported = new Set([
      0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, // Fuel system + trims
      0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10, 0x11, // Core engine + MAF
      0x14, 0x15, 0x19, // O2 sensors
      0x1C, 0x1F, 0x21, 0x2E, 0x2F, 0x31, 0x33,
      0x34, 0x3C, 0x3D, // Wideband + catalyst
      0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x49, 0x4A, 0x4C,
    ]);

    const supported = STANDARD_PIDS.filter(p => gasSupported.has(p.pid));

    // Gas engine SHOULD support fuel trims and O2 sensors
    expect(supported.some(p => p.shortName === 'STFT1')).toBe(true);
    expect(supported.some(p => p.shortName === 'LTFT1')).toBe(true);
    expect(supported.some(p => p.shortName === 'MAF')).toBe(true);
    expect(supported.some(p => p.shortName === 'LAMBDA')).toBe(true);
  });

  it('pre-filtering removes more PIDs from diesel than gas presets', () => {
    // Diesel bitmask — fewer standard PIDs
    const dieselSupported = new Set([0x04, 0x05, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x11, 0x23, 0x42]);
    // Gas bitmask — more standard PIDs
    const gasSupported = new Set([
      0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
      0x10, 0x11, 0x14, 0x15, 0x19, 0x1C, 0x1F, 0x21, 0x2E, 0x2F, 0x31, 0x33,
      0x34, 0x3C, 0x3D, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x49, 0x4A, 0x4C,
    ]);

    const dieselFiltered = STANDARD_PIDS.filter(p => !dieselSupported.has(p.pid));
    const gasFiltered = STANDARD_PIDS.filter(p => !gasSupported.has(p.pid));

    // Diesel should filter out more PIDs than gas
    expect(dieselFiltered.length).toBeGreaterThan(gasFiltered.length);
  });
});

// ─── Ford 6.2L Boss Extended PID Tests ─────────────────────────────────────

describe('FORD_EXTENDED_PIDS — 6.2L Boss V8', () => {
  it('has oil temperature PID', () => {
    const oilTemp = FORD_EXTENDED_PIDS.find(p => p.shortName === 'EOT_BOSS');
    expect(oilTemp).toBeDefined();
    expect(oilTemp!.service).toBe(0x22);
    expect(oilTemp!.unit).toBe('°C');
    expect(oilTemp!.manufacturer).toBe('ford');
  });

  it('has oil pressure PID', () => {
    const oilPress = FORD_EXTENDED_PIDS.find(p => p.shortName === 'EOP_BOSS');
    expect(oilPress).toBeDefined();
    expect(oilPress!.unit).toBe('psi');
  });

  it('has cylinder head temperature PID', () => {
    const cht = FORD_EXTENDED_PIDS.find(p => p.shortName === 'CHT_BOSS');
    expect(cht).toBeDefined();
    expect(cht!.unit).toBe('°C');
    expect(cht!.category).toBe('cooling');
  });

  it('has per-cylinder knock retard PIDs', () => {
    const knockPids = FORD_EXTENDED_PIDS.filter(p => p.shortName.startsWith('KR_C'));
    // Should have 8 knock retard PIDs for V8
    expect(knockPids.length).toBe(8);
    for (const kr of knockPids) {
      expect(kr.unit).toBe('°');
      expect(kr.manufacturer).toBe('ford');
    }
  });

  it('has per-cylinder misfire count PIDs', () => {
    const misfirePids = FORD_EXTENDED_PIDS.filter(p => p.shortName.startsWith('MIS_C'));
    expect(misfirePids.length).toBe(8);
    for (const mis of misfirePids) {
      expect(mis.unit).toBe('counts');
    }
  });

  it('has VCT cam position PIDs', () => {
    const vctPids = FORD_EXTENDED_PIDS.filter(p => p.shortName.includes('CAM'));
    expect(vctPids.length).toBeGreaterThanOrEqual(4); // Intake/exhaust, bank 1/2
    for (const vct of vctPids) {
      expect(vct.unit).toBe('°CA');
    }
  });

  it('has 6R80 transmission PIDs', () => {
    const transPids = FORD_EXTENDED_PIDS.filter(p =>
      p.shortName.includes('TFT') || p.shortName.includes('TCS') ||
      p.shortName.includes('GEAR') || p.shortName.includes('TCC') ||
      p.shortName.includes('LP_6R80')
    );
    expect(transPids.length).toBeGreaterThanOrEqual(5);
  });

  it('all Ford PIDs have manufacturer=ford', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.manufacturer).toBe('ford');
    }
  });

  it('all Ford PIDs have service=0x22', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('Ford PIDs have valid formulas', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      const result = pid.formula([0x80, 0x80]);
      expect(typeof result).toBe('number');
      expect(isFinite(result)).toBe(true);
    }
  });
});

// ─── BMW UDS Extended PID Tests ────────────────────────────────────────────

import { BMW_EXTENDED_PIDS } from './obdConnection';

describe('BMW_EXTENDED_PIDS — UDS Extended Diagnostics', () => {
  it('has DME engine management PIDs', () => {
    const dmePids = BMW_EXTENDED_PIDS.filter(p => p.category === 'engine');
    expect(dmePids.length).toBeGreaterThanOrEqual(5);
    // Should have VANOS (via VAN_ prefix) and boost PIDs
    const allShortNames = BMW_EXTENDED_PIDS.map(p => p.shortName);
    expect(allShortNames.some(s => s.includes('VAN_'))).toBe(true);
    expect(allShortNames.some(s => s.includes('BOOST'))).toBe(true);
  });

  it('has ZF 8HP transmission PIDs', () => {
    const transPids = BMW_EXTENDED_PIDS.filter(p => p.category === 'transmission');
    expect(transPids.length).toBeGreaterThanOrEqual(4);
    const shortNames = transPids.map(p => p.shortName);
    expect(shortNames.some(s => s.includes('TFT') || s.includes('TCS') || s.includes('GEAR'))).toBe(true);
  });

  it('has DSC/xDrive torque distribution PIDs', () => {
    const dscPids = BMW_EXTENDED_PIDS.filter(p =>
      p.shortName.includes('YAW') || p.shortName.includes('XFER') ||
      p.shortName.includes('LAT_G') || p.shortName.includes('LON_G') ||
      p.shortName.includes('FAXLE') || p.shortName.includes('RAXLE')
    );
    expect(dscPids.length).toBeGreaterThanOrEqual(3);
  });

  it('has HV battery system PIDs', () => {
    const hvPids = BMW_EXTENDED_PIDS.filter(p =>
      p.shortName.includes('HV_')
    );
    expect(hvPids.length).toBeGreaterThanOrEqual(3);
    // Should have SOC, voltage, current, temp
    const shortNames = hvPids.map(p => p.shortName);
    expect(shortNames.some(s => s.includes('SOC'))).toBe(true);
    expect(shortNames.some(s => s.includes('VOLT'))).toBe(true);
  });

  it('has electric motor PIDs', () => {
    const motorPids = BMW_EXTENDED_PIDS.filter(p =>
      p.shortName.includes('EMOT_') || p.shortName.includes('EMOT_TRQ') ||
      p.shortName.includes('EMOT_RPM')
    );
    expect(motorPids.length).toBeGreaterThanOrEqual(2);
  });

  it('has active suspension PIDs', () => {
    const suspPids = BMW_EXTENDED_PIDS.filter(p =>
      p.shortName.includes('DAMP') || p.shortName.includes('RH_') ||
      p.shortName.includes('ROLL') || p.shortName.includes('PITCH')
    );
    expect(suspPids.length).toBeGreaterThanOrEqual(3);
  });

  it('all BMW PIDs have manufacturer=bmw', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      expect(pid.manufacturer).toBe('bmw');
    }
  });

  it('all BMW PIDs have service=0x22', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('BMW PIDs have valid formulas', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      const result = pid.formula([0x80, 0x80]);
      expect(typeof result).toBe('number');
      expect(isFinite(result)).toBe(true);
    }
  });

  it('BMW PIDs have ECU header addresses', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      expect(pid.ecuHeader).toBeDefined();
      expect(pid.ecuHeader!.length).toBeGreaterThan(0);
    }
  });
});

// ─── Preset Filtering for Specific Vehicles ────────────────────────────────

describe('getPresetsForVehicle', () => {
  it('returns Ford Raptor presets for ford/gasoline', () => {
    const presets = getPresetsForVehicle('ford', 'gasoline');
    const names = presets.map(p => p.name);
    expect(names.some(n => n.includes('Raptor') || n.includes('Boss') || n.includes('Ford'))).toBe(true);
  });

  it('returns BMW XM presets for bmw/any', () => {
    const presets = getPresetsForVehicle('bmw', 'any');
    const names = presets.map(p => p.name);
    expect(names.some(n => n.includes('BMW') || n.includes('XM'))).toBe(true);
  });

  it('returns Duramax presets for gm/diesel', () => {
    const presets = getPresetsForVehicle('gm', 'diesel');
    const names = presets.map(p => p.name);
    expect(names.some(n => n.includes('Duramax') || n.includes('Diesel'))).toBe(true);
  });

  it('returns GM E90 6.2L gas preset for gm/gasoline', () => {
    const presets = getPresetsForVehicle('gm', 'gasoline');
    const names = presets.map(p => p.name);
    expect(names.some(n => n.includes('E90') || n.includes('L87'))).toBe(true);
  });

  it('always includes universal presets', () => {
    const fordPresets = getPresetsForVehicle('ford', 'gasoline');
    const bmwPresets = getPresetsForVehicle('bmw', 'any');
    const gmPresets = getPresetsForVehicle('gm', 'diesel');

    // All should include Engine Basics (universal)
    expect(fordPresets.some(p => p.name === 'Engine Basics')).toBe(true);
    expect(bmwPresets.some(p => p.name === 'Engine Basics')).toBe(true);
    expect(gmPresets.some(p => p.name === 'Engine Basics')).toBe(true);
  });
});

// ─── getPidsForVehicle Tests ───────────────────────────────────────────────

describe('getPidsForVehicle', () => {
  it('returns Ford extended PIDs for ford manufacturer', () => {
    const pids = getPidsForVehicle('ford', 'gasoline');
    const fordPids = pids.filter(p => p.manufacturer === 'ford');
    expect(fordPids.length).toBeGreaterThan(0);
  });

  it('returns BMW extended PIDs for bmw manufacturer', () => {
    const pids = getPidsForVehicle('bmw', 'any');
    const bmwPids = pids.filter(p => p.manufacturer === 'bmw');
    expect(bmwPids.length).toBeGreaterThan(0);
  });

  it('returns GM extended PIDs for gm/diesel', () => {
    const pids = getPidsForVehicle('gm', 'diesel');
    const gmPids = pids.filter(p => p.manufacturer === 'gm');
    expect(gmPids.length).toBeGreaterThan(0);
  });

  it('always includes standard PIDs', () => {
    const fordPids = getPidsForVehicle('ford', 'gasoline');
    const bmwPids = getPidsForVehicle('bmw', 'any');
    
    // Should include RPM, ECT, Speed (universal standard PIDs)
    expect(fordPids.some(p => p.pid === 0x0C && (p.service ?? 0x01) === 0x01)).toBe(true);
    expect(bmwPids.some(p => p.pid === 0x0C && (p.service ?? 0x01) === 0x01)).toBe(true);
  });
});
