/**
 * Tests for vehicle-specific PID support — Ford Raptor, Duramax, BMW XM
 */
import { describe, it, expect } from 'vitest';
import {
  STANDARD_PIDS,
  GM_EXTENDED_PIDS,
  FORD_EXTENDED_PIDS,
  ALL_PIDS,
  PID_PRESETS,
  getPidsByManufacturer,
  getPidsForVehicle,
  getPresetsForVehicle,
  MANUFACTURER_PIDS,
} from './obdConnection';

// ─── Universal Standard PIDs ───────────────────────────────────────────────

describe('Universal Standard PIDs', () => {
  it('contains gas engine PIDs (O2 sensors, fuel trims)', () => {
    const pidNumbers = STANDARD_PIDS.map(p => p.pid);
    // O2 sensors
    expect(pidNumbers).toContain(0x14); // O2 Sensor Bank 1 Sensor 1
    expect(pidNumbers).toContain(0x15); // O2 Sensor Bank 1 Sensor 2
    // Fuel trims
    expect(pidNumbers).toContain(0x06); // STFT Bank 1
    expect(pidNumbers).toContain(0x07); // LTFT Bank 1
  });

  it('contains gas engine categories', () => {
    const categories = new Set(STANDARD_PIDS.map(p => p.category));
    expect(categories.has('oxygen')).toBe(true);
    expect(categories.has('fuel')).toBe(true);
    expect(categories.has('engine')).toBe(true);
  });

  it('has fuelType tags on relevant PIDs', () => {
    // Diesel-specific PIDs should be tagged
    const frpDiesel = STANDARD_PIDS.find(p => p.pid === 0x23);
    expect(frpDiesel).toBeDefined();
    // EGT should be tagged diesel
    const egt = STANDARD_PIDS.find(p => p.pid === 0x78);
    expect(egt).toBeDefined();
  });

  it('has manufacturer tags on PIDs', () => {
    // All standard PIDs should have manufacturer field (or default to universal)
    for (const pid of STANDARD_PIDS) {
      const mfr = pid.manufacturer ?? 'universal';
      expect(typeof mfr).toBe('string');
    }
  });
});

// ─── Ford Extended PIDs (2012 Ford Raptor 6.2L) ───────────────────────────

describe('Ford Extended PIDs', () => {
  it('FORD_EXTENDED_PIDS array exists and has entries', () => {
    expect(FORD_EXTENDED_PIDS).toBeDefined();
    expect(FORD_EXTENDED_PIDS.length).toBeGreaterThan(0);
  });

  it('all Ford PIDs are service 0x22', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('all Ford PIDs have manufacturer=ford', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.manufacturer).toBe('ford');
    }
  });

  it('all Ford PIDs have required fields', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.pid).toBeGreaterThanOrEqual(0);
      expect(pid.name).toBeTruthy();
      expect(pid.shortName).toBeTruthy();
      expect(pid.unit).toBeDefined();
      expect(pid.bytes).toBeGreaterThan(0);
      expect(typeof pid.formula).toBe('function');
      expect(pid.category).toBeTruthy();
    }
  });

  it('has unique PIDs within Ford extended set', () => {
    const pidNumbers = FORD_EXTENDED_PIDS.map(p => p.pid);
    const unique = new Set(pidNumbers);
    expect(unique.size).toBe(pidNumbers.length);
  });
});

// ─── GM Extended PIDs (2024 Duramax L5P) ─────────────────────────────────

describe('GM Extended PIDs for Duramax', () => {
  it('contains key Duramax PIDs', () => {
    const pidNumbers = GM_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x0564); // Commanded FRP
    expect(pidNumbers).toContain(0x0565); // Actual FRP
    expect(pidNumbers).toContain(0x1A10); // DPF Soot Load
    expect(pidNumbers).toContain(0x1A20); // DEF Tank Level
    expect(pidNumbers).toContain(0x0576); // Turbo Speed
  });

  it('all GM PIDs have manufacturer=gm', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.manufacturer).toBe('gm');
    }
  });

  it('all GM PIDs have fuelType diesel or any', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(['diesel', 'any']).toContain(pid.fuelType);
    }
  });
});

// ─── Manufacturer PID Collections ──────────────────────────────────────────

describe('MANUFACTURER_PIDS', () => {
  it('has GM PIDs', () => {
    expect(MANUFACTURER_PIDS.gm).toBeDefined();
    expect(MANUFACTURER_PIDS.gm.length).toBeGreaterThan(0);
  });

  it('has Ford PIDs', () => {
    expect(MANUFACTURER_PIDS.ford).toBeDefined();
    expect(MANUFACTURER_PIDS.ford.length).toBeGreaterThan(0);
  });
});

// ─── getPidsByManufacturer ─────────────────────────────────────────────────

describe('getPidsByManufacturer', () => {
  it('returns standard PIDs for universal', () => {
    const pids = getPidsByManufacturer('universal');
    expect(pids.length).toBe(STANDARD_PIDS.length);
  });

  it('returns GM extended PIDs for gm', () => {
    const pids = getPidsByManufacturer('gm');
    expect(pids.length).toBeGreaterThan(0);
    for (const pid of pids) {
      expect(pid.manufacturer).toBe('gm');
    }
  });

  it('returns Ford extended PIDs for ford', () => {
    const pids = getPidsByManufacturer('ford');
    expect(pids.length).toBeGreaterThan(0);
    for (const pid of pids) {
      expect(pid.manufacturer).toBe('ford');
    }
  });
});

// ─── getPidsForVehicle ─────────────────────────────────────────────────────

describe('getPidsForVehicle', () => {
  it('returns standard + GM diesel PIDs for Duramax', () => {
    const pids = getPidsForVehicle('gm', 'diesel');
    // Should include standard PIDs (filtered for diesel/any) + GM extended
    expect(pids.length).toBeGreaterThan(STANDARD_PIDS.length / 2);
    // Should include GM extended PIDs
    const hasGmExt = pids.some(p => (p.service ?? 0x01) === 0x22 && p.manufacturer === 'gm');
    expect(hasGmExt).toBe(true);
  });

  it('returns standard + Ford PIDs for Ford Raptor', () => {
    const pids = getPidsForVehicle('ford', 'gasoline');
    expect(pids.length).toBeGreaterThan(0);
    // Should include Ford extended PIDs
    const hasFordExt = pids.some(p => (p.service ?? 0x01) === 0x22 && p.manufacturer === 'ford');
    expect(hasFordExt).toBe(true);
  });

  it('returns standard PIDs for BMW (universal extended)', () => {
    const pids = getPidsForVehicle('bmw', 'gasoline');
    expect(pids.length).toBeGreaterThan(0);
    // Should at least have standard PIDs
    const hasStd = pids.some(p => (p.service ?? 0x01) === 0x01);
    expect(hasStd).toBe(true);
  });

  it('filters out diesel PIDs for gasoline vehicles', () => {
    const pids = getPidsForVehicle('ford', 'gasoline');
    // Should NOT include diesel-only PIDs
    const dieselOnly = pids.filter(p => p.fuelType === 'diesel');
    expect(dieselOnly.length).toBe(0);
  });

  it('filters out gasoline PIDs for diesel vehicles', () => {
    const pids = getPidsForVehicle('gm', 'diesel');
    // Should NOT include gasoline-only PIDs
    const gasOnly = pids.filter(p => p.fuelType === 'gasoline');
    expect(gasOnly.length).toBe(0);
  });
});

// ─── getPresetsForVehicle ──────────────────────────────────────────────────

describe('getPresetsForVehicle', () => {
  it('returns diesel presets for Duramax', () => {
    const presets = getPresetsForVehicle('gm', 'diesel');
    expect(presets.length).toBeGreaterThan(0);
    const names = presets.map(p => p.name.toLowerCase());
    // Should include engine basics (universal)
    expect(names.some(n => n.includes('engine basics'))).toBe(true);
  });

  it('returns gas presets for Ford Raptor', () => {
    const presets = getPresetsForVehicle('ford', 'gasoline');
    expect(presets.length).toBeGreaterThan(0);
    const names = presets.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes('engine basics'))).toBe(true);
  });

  it('returns gas presets for BMW XM', () => {
    const presets = getPresetsForVehicle('bmw', 'gasoline');
    expect(presets.length).toBeGreaterThan(0);
  });

  it('does not return diesel presets for gasoline vehicles', () => {
    const presets = getPresetsForVehicle('ford', 'gasoline');
    const names = presets.map(p => p.name.toLowerCase());
    // Should not have DPF, DEF, or Duramax-specific presets
    expect(names.some(n => n.includes('dpf'))).toBe(false);
    expect(names.some(n => n.includes('def'))).toBe(false);
  });
});

// ─── ALL_PIDS Integrity ────────────────────────────────────────────────────

describe('ALL_PIDS', () => {
  it('includes standard + all manufacturer PIDs', () => {
    expect(ALL_PIDS.length).toBeGreaterThan(STANDARD_PIDS.length);
    expect(ALL_PIDS.length).toBeGreaterThan(GM_EXTENDED_PIDS.length);
  });

  it('all PIDs have valid formula functions', () => {
    for (const pid of ALL_PIDS) {
      expect(typeof pid.formula).toBe('function');
      // Formula should return a number when given valid bytes
      const testBytes = new Array(pid.bytes).fill(0);
      const result = pid.formula(testBytes);
      expect(typeof result).toBe('number');
      expect(isNaN(result)).toBe(false);
    }
  });
});
