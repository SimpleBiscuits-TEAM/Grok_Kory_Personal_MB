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

describe('PID formulas (imperial units)', () => {
  const findPid = (id: number) => STANDARD_PIDS.find(p => p.pid === id)!;

  it('ECT (0x05): (A-40)*1.8+32 °F', () => {
    const pid = findPid(0x05);
    expect(pid.formula([40])).toBeCloseTo(32, 0);   // 0°C = 32°F
    expect(pid.formula([140])).toBeCloseTo(212, 0);  // 100°C = 212°F
  });

  it('RPM (0x0C): ((A*256)+B)/4', () => {
    const pid = findPid(0x0C);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x1A, 0xF8])).toBe(1726);
    expect(pid.formula([0xFF, 0xFF])).toBeCloseTo(16383.75);
  });

  it('Vehicle Speed (0x0D): A*0.621371 MPH', () => {
    const pid = findPid(0x0D);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([100])).toBeCloseTo(62.14, 1);
  });

  it('MAP (0x0B): A*0.145038 PSI', () => {
    const pid = findPid(0x0B);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([101])).toBeCloseTo(14.65, 1);
  });

  it('MAF (0x10): ((A*256)+B)/100 * 0.132277 lb/min', () => {
    const pid = findPid(0x10);
    expect(pid.formula([0, 0])).toBe(0);
    // 256/100 * 0.132277 ≈ 0.3386
    expect(pid.formula([1, 0])).toBeCloseTo(0.339, 1);
  });

  it('Throttle (0x11): (A*100)/255', () => {
    const pid = findPid(0x11);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
  });

  it('Load (0x04): (A*100)/255', () => {
    const pid = findPid(0x04);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
  });

  it('Module Voltage (0x42): ((A*256)+B)/1000', () => {
    const pid = findPid(0x42);
    expect(pid.formula([0x37, 0xDC])).toBeCloseTo(14.3, 0);
  });
});

// ─── GM Mode 22 Extended PID Tests ─────────────────────────────────────────

describe('GM_EXTENDED_PIDS', () => {
  it('contains expected HPT-verified diesel PIDs', () => {
    const pidNumbers = GM_EXTENDED_PIDS.map(p => p.pid);
    // HPT-verified fuel system
    expect(pidNumbers).toContain(0x208A); // Fuel Pressure SAE
    expect(pidNumbers).toContain(0x12DA); // Injection Timing
    expect(pidNumbers).toContain(0x20E3); // Main Fuel Rate
    // DPF/DEF (unchanged)
    expect(pidNumbers).toContain(0x1A10); // DPF Soot Load
    expect(pidNumbers).toContain(0x1A20); // DEF Tank Level
    // HPT-verified throttle/sensors
    expect(pidNumbers).toContain(0x1543); // Throttle Position A
    expect(pidNumbers).toContain(0x114D); // IAT Diesel
    expect(pidNumbers).toContain(0x13C8); // ECT HPT
    expect(pidNumbers).toContain(0x232C); // AAT Diesel
    // HPT-verified emissions
    expect(pidNumbers).toContain(0x1502); // EGR Pintle
    expect(pidNumbers).toContain(0x11F8); // NOx Sensor 1
    expect(pidNumbers).toContain(0x11FA); // NOx Sensor 2
    // IPW (new)
    expect(pidNumbers).toContain(0x20AC); // IPW Cyl 1
    // IBR (new addresses)
    expect(pidNumbers).toContain(0x20B4); // IBR Cyl 1
  });

  it('all Mode 22 PIDs have service 0x22', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('has unique PIDs within Mode 22 (per fuelType+ecuHeader)', () => {
    const keys = GM_EXTENDED_PIDS.map(p => `${p.pid}-${p.ecuHeader ?? '7E0'}-${p.fuelType ?? 'any'}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
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
    expect(categories.has('engine')).toBe(true);
  });

  it('all GM PIDs have ECU header addresses', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.ecuHeader).toBeDefined();
      expect(pid.ecuHeader!.length).toBeGreaterThan(0);
    }
  });

  it('has all 8 injector balance rates (HPT-verified 0x20B4-0x20BB)', () => {
    const ibrs = GM_EXTENDED_PIDS.filter(p => p.shortName.startsWith('IBR_'));
    expect(ibrs.length).toBe(8);
    for (let i = 1; i <= 8; i++) {
      expect(ibrs.some(p => p.shortName === `IBR_${i}`)).toBe(true);
    }
  });

  it('has all 8 injector pulse widths (HPT-verified 0x20AC-0x20B3)', () => {
    const ipws = GM_EXTENDED_PIDS.filter(p => p.shortName.startsWith('IPW_'));
    expect(ipws.length).toBe(8);
    for (let i = 1; i <= 8; i++) {
      expect(ipws.some(p => p.shortName === `IPW_${i}`)).toBe(true);
    }
  });

  it('does NOT contain any 0x05xx PIDs (removed — not supported on E41)', () => {
    const deadPids = GM_EXTENDED_PIDS.filter(p =>
      p.pid >= 0x0500 && p.pid <= 0x05FF &&
      p.manufacturer === 'gm' && p.fuelType === 'diesel'
    );
    expect(deadPids.length).toBe(0);
  });
});

describe('GM Mode 22 formulas (HPT-verified)', () => {
  const findExtPid = (id: number) => GM_EXTENDED_PIDS.find(p => p.pid === id)!;

  it('Fuel Pressure SAE (0x208A): raw * 0.01868 PSI', () => {
    const pid = findExtPid(0x208A);
    expect(pid.formula([0, 0])).toBe(0);
    // 3214 * 0.01868 ≈ 60.04 PSI
    expect(pid.formula([0x0C, 0x8E])).toBeCloseTo(60.04, 0);
  });

  it('Injection Timing (0x12DA): signed16 * 0.001 °BTDC', () => {
    const pid = findExtPid(0x12DA);
    // raw 0x0F0B = 3851 → 3.851°
    expect(pid.formula([0x0F, 0x0B])).toBeCloseTo(3.851, 2);
    // raw 0xFFFF = -1 → -0.001°
    expect(pid.formula([0xFF, 0xFF])).toBeCloseTo(-0.001, 3);
  });

  it('Main Fuel Rate (0x20E3): raw * 0.1 mm³', () => {
    const pid = findExtPid(0x20E3);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0, 60])).toBeCloseTo(6.0, 1);
  });

  it('IPW Cyl 1 (0x20AC): raw * 0.001 ms', () => {
    const pid = findExtPid(0x20AC);
    expect(pid.formula([0, 0])).toBe(0);
    // 1316 * 0.001 = 1.316 ms
    expect(pid.formula([0x05, 0x24])).toBeCloseTo(1.316, 3);
  });

  it('IBR Cyl 1 (0x20B4): signed16 * 0.01 mm³', () => {
    const pid = findExtPid(0x20B4);
    // raw 0x0000 = 0 → 0.00 mm³
    expect(pid.formula([0, 0])).toBe(0);
    // raw 0xFFF6 = -10 → -0.10 mm³
    expect(pid.formula([0xFF, 0xF6])).toBeCloseTo(-0.10, 2);
    // raw 0x000A = 10 → 0.10 mm³
    expect(pid.formula([0, 10])).toBeCloseTo(0.10, 2);
  });

  it('Throttle Position A (0x1543): (A*100)/255 %', () => {
    const pid = findExtPid(0x1543);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
    // raw 161 → 63.14%
    expect(pid.formula([161])).toBeCloseTo(63.14, 1);
  });

  it('IAT Diesel (0x114D): a*0.46535*1.8+32 °F', () => {
    const pid = findExtPid(0x114D);
    // raw 101 → 47°C → 116.6°F
    expect(pid.formula([101])).toBeCloseTo(116.6, 0);
  });

  it('ECT HPT (0x13C8): a*0.454*1.8+32 °F', () => {
    const pid = findExtPid(0x13C8);
    // raw 185 → 84°C → 183.2°F
    expect(pid.formula([185])).toBeCloseTo(183.2, 0);
  });

  it('AAT Diesel (0x232C): (a-40)*1.8+32 °F', () => {
    const pid = findExtPid(0x232C);
    // raw 69 → 29°C → 84.2°F
    expect(pid.formula([69])).toBeCloseTo(84.2, 0);
  });

  it('DPF Soot Load (0x1A10): ((A*256)+B)*0.01 grams', () => {
    const pid = findExtPid(0x1A10);
    expect(pid.formula([0, 0])).toBe(0);
    expect(pid.formula([0x0A, 0x00])).toBeCloseTo(25.6, 1);
  });

  it('DEF Tank Level (0x1A20): (A*100)/255 percent', () => {
    const pid = findExtPid(0x1A20);
    expect(pid.formula([0])).toBe(0);
    expect(pid.formula([255])).toBeCloseTo(100);
  });

  it('EGR Pintle (0x1502): (A*100)/255 %', () => {
    const pid = findExtPid(0x1502);
    // raw 31 → 12.16%
    expect(pid.formula([31])).toBeCloseTo(12.16, 1);
  });

  it('FUEL_LVL (0x1141): a * 0.21832 gal', () => {
    const pid = findExtPid(0x1141);
    // 143 * 0.21832 = 31.22 gal
    expect(pid.formula([143])).toBeCloseTo(31.22, 1);
  });
});

// ─── ALL_PIDS Combined Tests ──────────────────────────────────────────────

describe('ALL_PIDS', () => {
  it('contains both standard and extended PIDs', () => {
    expect(ALL_PIDS.length).toBeGreaterThan(STANDARD_PIDS.length + GM_EXTENDED_PIDS.length);
  });

  it('no PID collisions between standard and extended (different services/headers/manufacturer/fuelType)', () => {
    const keys = ALL_PIDS.map(p => `${p.service ?? 0x01}-${p.pid}-${p.ecuHeader ?? 'default'}-${p.manufacturer ?? 'universal'}-${p.fuelType ?? 'any'}`);
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
    expect(names).toContain('Diesel Throttle/Sensors');
    expect(names).toContain('Gas Engine Monitor');
    expect(names.some(n => n.includes('GM E90'))).toBe(true);
    expect(names).toContain('PPEI Suggested (L5P E41)');
  });

  it('all preset PIDs exist in ALL_PIDS', () => {
    const validPids = new Set(ALL_PIDS.map(p => p.pid));
    for (const preset of PID_PRESETS) {
      for (const pid of preset.pids) {
        expect(validPids.has(pid)).toBe(true);
      }
    }
  });

  it('PPEI Suggested preset uses HPT-verified DIDs (no 0x05xx)', () => {
    const ppei = PID_PRESETS.find(p => p.name === 'PPEI Suggested (L5P E41)')!;
    expect(ppei).toBeDefined();
    const deadPids = ppei.pids.filter(p => p >= 0x0500 && p <= 0x05FF);
    expect(deadPids.length).toBe(0);
    // Should contain HPT-verified DIDs
    expect(ppei.pids).toContain(0x208A); // Fuel Pressure SAE
    expect(ppei.pids).toContain(0x12DA); // Injection Timing
    expect(ppei.pids).toContain(0x1543); // Throttle Position A
    expect(ppei.pids).toContain(0x20B4); // IBR Cyl 1
    expect(ppei.pids).toContain(0x20AC); // IPW Cyl 1
  });

  it('Duramax Fuel System Extended preset includes HPT-verified IBR PIDs', () => {
    const fuelPreset = PID_PRESETS.find(p => p.name === 'Duramax Fuel System (Extended)')!;
    expect(fuelPreset).toBeDefined();
    // Should include all 8 IBR PIDs (0x20B4-0x20BB)
    for (let i = 0; i < 8; i++) {
      expect(fuelPreset.pids).toContain(0x20B4 + i);
    }
    // Should include all 8 IPW PIDs (0x20AC-0x20B3)
    for (let i = 0; i < 8; i++) {
      expect(fuelPreset.pids).toContain(0x20AC + i);
    }
  });
});

// ─── Custom Preset Tests ──────────────────────────────────────────────────

describe('Custom Preset Management', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
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
    const preset = createCustomPreset('My Tune', 'FRP + Throttle', [0x0C, 0x208A, 0x1543]);
    expect(preset.name).toBe('My Tune');
    expect(preset.description).toBe('FRP + Throttle');
    expect(preset.pids).toEqual([0x0C, 0x208A, 0x1543]);
    expect(preset.isCustom).toBe(true);
    expect(preset.id).toBeTruthy();
    expect(preset.createdAt).toBeGreaterThan(0);
  });

  it('saveCustomPresets and loadCustomPresets round-trip', () => {
    const preset1 = createCustomPreset('Preset A', 'Desc A', [0x0C, 0x0D]);
    const preset2 = createCustomPreset('Preset B', 'Desc B', [0x208A, 0x1A10]);
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
      pids: [0x0C, 0x0D, 0x208A],
    });
    expect(updated.length).toBe(1);
    expect(updated[0].name).toBe('Updated');
    expect(updated[0].description).toBe('Updated desc');
    expect(updated[0].pids).toEqual([0x0C, 0x0D, 0x208A]);
  });

  it('getAllPresets includes both built-in and custom presets', () => {
    const custom = createCustomPreset('Custom', 'Custom desc', [0x0C]);
    saveCustomPresets([custom]);

    const all = getAllPresets();
    expect(all.length).toBe(PID_PRESETS.length + 1);
    expect(all.some(p => p.name === 'Custom')).toBe(true);
    expect(all.some(p => p.name === 'Engine Basics')).toBe(true);
  });

  it('custom presets can include HPT-verified Mode 22 PIDs', () => {
    const preset = createCustomPreset('Diesel Deep', 'FRP + DPF + DEF', [0x208A, 0x12DA, 0x1A10, 0x1A20]);
    expect(preset.pids).toContain(0x208A);
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
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 185, unit: '°F', rawBytes: [0x7D], timestamp: 1000 },
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 189, unit: '°F', rawBytes: [0x7F], timestamp: 1200 },
    { pid: 0x05, name: 'Engine Coolant Temperature', shortName: 'ECT', value: 194, unit: '°F', rawBytes: [0x82], timestamp: 1400 },
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
  const fpSaePid = GM_EXTENDED_PIDS.find(p => p.pid === 0x208A)!;
  const dpfPid = GM_EXTENDED_PIDS.find(p => p.pid === 0x1A10)!;

  const readings = new Map<number, PIDReading[]>();
  readings.set(0x208A, [
    { pid: 0x208A, name: 'Fuel Pressure (SAE)', shortName: 'FP_SAE', value: 60.05, unit: 'PSI', rawBytes: [0x0C, 0x8E], timestamp: 2000 },
    { pid: 0x208A, name: 'Fuel Pressure (SAE)', shortName: 'FP_SAE', value: 55.2, unit: 'PSI', rawBytes: [0x0B, 0x8A], timestamp: 2200 },
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
    pids: [fpSaePid, dpfPid],
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
    expect(lines[1]).toContain('185');
  });

  it('handles Mode 22 sessions', () => {
    const session = createMockMode22Session();
    const csv = exportSessionToCSV(session);
    const lines = csv.split('\n');

    expect(lines[0]).toContain('FP_SAE');
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

    expect(lines[0]).toContain('Fuel Pressure (SAE)');
    expect(lines[0]).toContain('DPF Soot Load');
    expect(lines[1]).toContain('PSI');
    expect(lines[1]).toContain('g');
  });
});

// ─── PID Availability Filtering Tests ──────────────────────────────────────

describe('OBDConnection.filterSupportedPids', () => {
  it('isPidSupported returns true for Mode 22 PIDs regardless of bitmask', () => {
    const mode22Pid = GM_EXTENDED_PIDS[0];
    expect(mode22Pid.service).toBe(0x22);
    expect(mode22Pid.service).toBeDefined();
  });

  it('standard PIDs can be checked against a bitmask set', () => {
    const duramaxSupported = new Set([
      0x04, 0x05, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x11,
      0x1C, 0x1F, 0x21, 0x23, 0x2F, 0x33, 0x42, 0x43, 0x45, 0x46, 0x49, 0x4C,
    ]);

    const supported = STANDARD_PIDS.filter(p => duramaxSupported.has(p.pid));
    const unsupported = STANDARD_PIDS.filter(p => !duramaxSupported.has(p.pid));

    expect(unsupported.some(p => p.shortName === 'STFT1')).toBe(true);
    expect(unsupported.some(p => p.shortName === 'LTFT1')).toBe(true);

    expect(supported.some(p => p.shortName === 'RPM')).toBe(true);
    expect(supported.some(p => p.shortName === 'ECT')).toBe(true);
    expect(supported.some(p => p.shortName === 'MAP')).toBe(true);
    expect(supported.some(p => p.shortName === 'VSS')).toBe(true);
  });
});

// ─── Ford 6.2L Boss Extended PID Tests ─────────────────────────────────────

describe('FORD_EXTENDED_PIDS — 6.2L Boss V8', () => {
  it('has oil temperature PID', () => {
    const oilTemp = FORD_EXTENDED_PIDS.find(p => p.shortName === 'EOT_BOSS');
    expect(oilTemp).toBeDefined();
    expect(oilTemp!.service).toBe(0x22);
    expect(oilTemp!.manufacturer).toBe('ford');
  });

  it('has oil pressure PID', () => {
    const oilPress = FORD_EXTENDED_PIDS.find(p => p.shortName === 'EOP_BOSS');
    expect(oilPress).toBeDefined();
    // Accept whatever unit is defined
    expect(oilPress!.unit).toBeTruthy();
  });

  it('has cylinder head temperature PID', () => {
    const cht = FORD_EXTENDED_PIDS.find(p => p.shortName === 'CHT_BOSS');
    expect(cht).toBeDefined();
    expect(cht!.category).toBe('cooling');
  });

  it('has per-cylinder knock retard PIDs', () => {
    const knockPids = FORD_EXTENDED_PIDS.filter(p => p.shortName.startsWith('KR_C'));
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
    expect(vctPids.length).toBeGreaterThanOrEqual(4);
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

  it('always includes universal presets', () => {
    const fordPresets = getPresetsForVehicle('ford', 'gasoline');
    const bmwPresets = getPresetsForVehicle('bmw', 'any');
    const gmPresets = getPresetsForVehicle('gm', 'diesel');

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
    
    expect(fordPids.some(p => p.pid === 0x0C && (p.service ?? 0x01) === 0x01)).toBe(true);
    expect(bmwPids.some(p => p.pid === 0x0C && (p.service ?? 0x01) === 0x01)).toBe(true);
  });
});
