import { describe, it, expect } from 'vitest';
import { ALL_PIDS, GM_EXTENDED_PIDS } from './obdConnection';

describe('BOOST_DES_DDDI (0xDD07) formula fix', () => {
  const pid = ALL_PIDS.find(p => p.pid === 0xDD07);

  it('exists in ALL_PIDS', () => {
    expect(pid).toBeDefined();
  });

  it('has shortName BOOST_DES_DDDI', () => {
    expect(pid!.shortName).toBe('BOOST_DES_DDDI');
  });

  it('has category turbo', () => {
    expect(pid!.category).toBe('turbo');
  });

  it('formula accepts 2 bytes and returns gauge PSI (not absolute)', () => {
    // At idle: ECU returns ~10100 raw (101 kPa in ~10 Pa units)
    // 10100 * 0.00145038 = 14.649 PSI absolute
    // Gauge = 14.649 - 14.696 = -0.047 PSI ≈ 0 (near atmospheric)
    const raw = 10100; // [0x27, 0x74] = [39, 116]
    const idleValue = pid!.formula([Math.floor(raw / 256), raw % 256]);
    expect(idleValue).toBeCloseTo(-0.05, 0);
    // Should NOT be ~14.5 (the old absolute reading)
    expect(Math.abs(idleValue)).toBeLessThan(1);
  });

  it('formula returns positive gauge PSI under boost', () => {
    // Under boost: ~200 kPa = raw ~20000
    // 20000 * 0.00145038 = 29.008 - 14.696 = 14.312 PSI gauge
    const raw = 20000;
    const boostValue = pid!.formula([Math.floor(raw / 256), raw % 256]);
    expect(boostValue).toBeCloseTo(14.31, 1);
    expect(boostValue).toBeGreaterThan(10);
  });

  it('formula handles high raw values (>300 kPa)', () => {
    // 300 kPa = raw ~30000
    // 30000 * 0.00145038 = 43.511 - 14.696 = 28.815 PSI gauge
    const raw = 30000;
    const highBoost = pid!.formula([Math.floor(raw / 256), raw % 256]);
    expect(highBoost).toBeCloseTo(28.82, 1);
  });

  it('min is -15 (allows vacuum readings)', () => {
    expect(pid!.min).toBe(-15);
  });
});

describe('BOOST_VAC_DDDI (0xDD08) formula fix', () => {
  const pid = ALL_PIDS.find(p => p.pid === 0xDD08);

  it('exists in ALL_PIDS', () => {
    expect(pid).toBeDefined();
  });

  it('has shortName BOOST_VAC_DDDI', () => {
    expect(pid!.shortName).toBe('BOOST_VAC_DDDI');
  });

  it('formula converts raw absolute to gauge PSI', () => {
    // Same formula as BOOST_DES_DDDI — raw ~10100 at idle
    const raw = 10100;
    const idleValue = pid!.formula([Math.floor(raw / 256), raw % 256]);
    expect(Math.abs(idleValue)).toBeLessThan(1);
  });

  it('min is -15 (allows vacuum readings)', () => {
    expect(pid!.min).toBe(-15);
  });
});

describe('PID category assignments', () => {
  it('all GM extended PIDs have a category', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.category).toBeDefined();
      expect(pid.category.length).toBeGreaterThan(0);
    }
  });

  it('boost PIDs are in turbo category', () => {
    const boostPids = ALL_PIDS.filter(p => p.shortName.includes('BOOST'));
    expect(boostPids.length).toBeGreaterThan(0);
    for (const pid of boostPids) {
      expect(pid.category).toBe('turbo');
    }
  });

  it('EGT PIDs are in exhaust or turbo category', () => {
    const egtPids = ALL_PIDS.filter(p => p.shortName.includes('EGT'));
    expect(egtPids.length).toBeGreaterThan(0);
    for (const pid of egtPids) {
      expect(['exhaust', 'turbo']).toContain(pid.category);
    }
  });
});
