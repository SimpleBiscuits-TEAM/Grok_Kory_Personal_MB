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
    // At idle: ECU returns ~100 kPa absolute (bytes [0, 100])
    // 100 kPa * 0.145038 = 14.5038 PSI absolute
    // Gauge = 14.5038 - 14.696 = -0.1922 PSI ≈ 0 (near atmospheric)
    const idleValue = pid!.formula([0, 100]);
    expect(idleValue).toBeCloseTo(-0.192, 1);
    // Should NOT be ~14.5 (the old absolute reading)
    expect(Math.abs(idleValue)).toBeLessThan(1);
  });

  it('formula returns positive gauge PSI under boost', () => {
    // Under boost: ~200 kPa absolute (bytes [0, 200])
    // 200 * 0.145038 = 29.0076 - 14.696 = 14.3116 PSI gauge
    const boostValue = pid!.formula([0, 200]);
    expect(boostValue).toBeCloseTo(14.31, 1);
    expect(boostValue).toBeGreaterThan(10);
  });

  it('formula handles high-byte values (>255 kPa)', () => {
    // 300 kPa = bytes [1, 44] (1*256 + 44 = 300)
    // 300 * 0.145038 = 43.5114 - 14.696 = 28.8154 PSI gauge
    const highBoost = pid!.formula([1, 44]);
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

  it('formula converts kPa absolute to gauge PSI', () => {
    // Same formula as BOOST_DES_DDDI
    const idleValue = pid!.formula([0, 100]);
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
