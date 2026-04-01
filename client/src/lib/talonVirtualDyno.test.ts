/**
 * Tests for Honda Talon Virtual Dyno Engine
 */
import { describe, it, expect } from 'vitest';
import {
  detectInjectorType,
  detectFuelType,
  calculateFuelFlow,
  estimateHP,
  calculateTorque,
  smoothCurve,
  INJECTOR_FLOW_RATES,
  FUEL_PROFILES,
} from './talonVirtualDyno';

// ─── Injector Detection ──────────────────────────────────────────────────────

describe('detectInjectorType', () => {
  it('detects ID1050X from filename', () => {
    expect(detectInjectorType('Talon_ID1050_E85_Pull3.wp8', '')).toBe('id1050');
  });

  it('detects ID1300X from filename', () => {
    expect(detectInjectorType('Talon_ID1300X_dyno.wp8', '')).toBe('id1300');
  });

  it('detects ID1050 from part number', () => {
    expect(detectInjectorType('pull1.wp8', 'ID1050X-Honda')).toBe('id1050');
  });

  it('detects ID1300 from part number with cc suffix', () => {
    expect(detectInjectorType('pull1.wp8', '1300cc injectors')).toBe('id1300');
  });

  it('returns stock when no injector keywords found', () => {
    expect(detectInjectorType('Talon_Stock_Pull.wp8', '')).toBe('stock');
  });

  it('returns stock for empty strings', () => {
    expect(detectInjectorType('', '')).toBe('stock');
  });

  it('is case insensitive', () => {
    expect(detectInjectorType('talon_id1050x.wp8', '')).toBe('id1050');
    expect(detectInjectorType('TALON_ID1300X.wp8', '')).toBe('id1300');
  });
});

// ─── Fuel Detection ──────────────────────────────────────────────────────────

describe('detectFuelType', () => {
  it('detects E85 from filename', () => {
    expect(detectFuelType('Talon_E85_Pull.wp8', '')).toBe('e85');
  });

  it('detects E90 from filename', () => {
    expect(detectFuelType('Talon_E90_Dyno.wp8', '')).toBe('e90');
  });

  it('detects UTV96 from filename', () => {
    expect(detectFuelType('Talon_UTV96_Street.wp8', '')).toBe('utv96');
  });

  it('detects Ignite Red from filename', () => {
    expect(detectFuelType('Talon_Ignite Red_Pull.wp8', '')).toBe('ignite_red');
  });

  it('detects Ignite Red with underscore', () => {
    expect(detectFuelType('Talon_ignite_red_pull.wp8', '')).toBe('ignite_red');
  });

  it('detects fuel from part number', () => {
    expect(detectFuelType('pull1.wp8', 'E85 Tune')).toBe('e85');
  });

  it('returns pump gas when no fuel keywords found', () => {
    expect(detectFuelType('Talon_Pull.wp8', '')).toBe('pump');
  });

  it('returns pump gas for empty strings', () => {
    expect(detectFuelType('', '')).toBe('pump');
  });

  it('E90 takes priority over E85 when E90 is present', () => {
    // E90 check comes first in the function
    expect(detectFuelType('Talon_E90.wp8', '')).toBe('e90');
  });
});

// ─── Fuel Flow Calculation ───────────────────────────────────────────────────

describe('calculateFuelFlow', () => {
  it('returns 0 for zero RPM', () => {
    expect(calculateFuelFlow(5, 0, 310, 0.755)).toBe(0);
  });

  it('returns 0 for zero pulse width', () => {
    expect(calculateFuelFlow(0, 5000, 310, 0.755)).toBe(0);
  });

  it('returns 0 for negative RPM', () => {
    expect(calculateFuelFlow(5, -1000, 310, 0.755)).toBe(0);
  });

  it('calculates fuel flow for stock injectors at 5000 RPM', () => {
    // PW=5ms, RPM=5000, 310cc/min, 0.755 g/cc, 2 cylinders
    // Inj/sec per cyl = 5000/120 = 41.667
    // cc/injection = (5/1000) * (310/60) = 0.005 * 5.167 = 0.02583
    // Total g/s = 0.02583 * 41.667 * 2 * 0.755 = 1.625
    const flow = calculateFuelFlow(5, 5000, 310, 0.755, 2);
    expect(flow).toBeGreaterThan(1.5);
    expect(flow).toBeLessThan(2.0);
  });

  it('larger injectors produce more fuel flow at same PW', () => {
    const stockFlow = calculateFuelFlow(5, 5000, INJECTOR_FLOW_RATES.stock, 0.755);
    const id1050Flow = calculateFuelFlow(5, 5000, INJECTOR_FLOW_RATES.id1050, 0.755);
    const id1300Flow = calculateFuelFlow(5, 5000, INJECTOR_FLOW_RATES.id1300, 0.755);

    expect(id1050Flow).toBeGreaterThan(stockFlow);
    expect(id1300Flow).toBeGreaterThan(id1050Flow);
  });

  it('higher RPM produces more fuel flow at same PW', () => {
    const flow3000 = calculateFuelFlow(5, 3000, 310, 0.755);
    const flow6000 = calculateFuelFlow(5, 6000, 310, 0.755);

    expect(flow6000).toBeGreaterThan(flow3000);
    // Should be exactly 2x since RPM doubled
    expect(flow6000 / flow3000).toBeCloseTo(2, 5);
  });

  it('E85 density produces slightly more mass flow than pump gas', () => {
    const pumpFlow = calculateFuelFlow(5, 5000, 310, FUEL_PROFILES.pump.density);
    const e85Flow = calculateFuelFlow(5, 5000, 310, FUEL_PROFILES.e85.density);

    expect(e85Flow).toBeGreaterThan(pumpFlow);
  });
});

// ─── HP Estimation ───────────────────────────────────────────────────────────

describe('estimateHP', () => {
  it('returns 0 for zero fuel flow', () => {
    expect(estimateHP(0, 0.5)).toBe(0);
  });

  it('returns 0 for zero BSFC', () => {
    expect(estimateHP(5, 0)).toBe(0);
  });

  it('estimates reasonable HP for a Talon at WOT', () => {
    // ~3.5 g/s fuel flow on stock Talon at WOT
    // 3.5 g/s = 27.78 lb/hr
    // HP = 27.78 / 0.50 = ~55.6 HP (stock Talon makes ~100-110 HP)
    // This is per-cylinder estimate, so total would be higher
    const hp = estimateHP(3.5, FUEL_PROFILES.pump.bsfc);
    expect(hp).toBeGreaterThan(20);
    expect(hp).toBeLessThan(80);
  });

  it('lower BSFC (more efficient fuel) produces more HP per unit fuel', () => {
    const pumpHP = estimateHP(5, FUEL_PROFILES.pump.bsfc);
    const igniteHP = estimateHP(5, FUEL_PROFILES.ignite_red.bsfc);

    // Ignite Red has lower BSFC (0.47 vs 0.50) = more efficient
    expect(igniteHP).toBeGreaterThan(pumpHP);
  });

  it('E85 requires more fuel for same HP (higher BSFC)', () => {
    const pumpHP = estimateHP(5, FUEL_PROFILES.pump.bsfc);
    const e85HP = estimateHP(5, FUEL_PROFILES.e85.bsfc);

    // E85 has higher BSFC (0.62 vs 0.50) = needs more fuel per HP
    expect(e85HP).toBeLessThan(pumpHP);
  });
});

// ─── Torque Calculation ──────────────────────────────────────────────────────

describe('calculateTorque', () => {
  it('returns 0 for zero RPM', () => {
    expect(calculateTorque(100, 0)).toBe(0);
  });

  it('returns 0 for zero HP', () => {
    expect(calculateTorque(0, 5000)).toBe(0);
  });

  it('calculates torque correctly at 5252 RPM (HP = Torque crossover)', () => {
    // At 5252 RPM, HP = Torque
    const torque = calculateTorque(100, 5252);
    expect(torque).toBeCloseTo(100, 1);
  });

  it('torque is higher than HP below 5252 RPM', () => {
    const torque = calculateTorque(50, 3000);
    expect(torque).toBeGreaterThan(50);
  });

  it('torque is lower than HP above 5252 RPM', () => {
    const torque = calculateTorque(100, 8000);
    expect(torque).toBeLessThan(100);
  });
});

// ─── Curve Smoothing ─────────────────────────────────────────────────────────

describe('smoothCurve', () => {
  it('returns original curve if shorter than window', () => {
    const curve = [
      { rpm: 3000, hp: 50, torque: 60 },
      { rpm: 3500, hp: 55, torque: 58 },
    ];
    const result = smoothCurve(curve, 3);
    expect(result).toEqual(curve);
  });

  it('smooths a noisy curve', () => {
    const curve = [
      { rpm: 3000, hp: 50, torque: 60 },
      { rpm: 3250, hp: 70, torque: 65 }, // spike
      { rpm: 3500, hp: 55, torque: 62 },
      { rpm: 3750, hp: 80, torque: 70 }, // spike
      { rpm: 4000, hp: 60, torque: 65 },
    ];
    const smoothed = smoothCurve(curve, 3);

    // Middle point should be averaged with neighbors
    // Point at index 1: avg of 50, 70, 55 = 58.3
    expect(smoothed[1].hp).toBeCloseTo(58.3, 0);

    // RPM values should not change
    expect(smoothed.map(p => p.rpm)).toEqual(curve.map(p => p.rpm));
  });

  it('preserves curve length', () => {
    const curve = [
      { rpm: 3000, hp: 50, torque: 60 },
      { rpm: 3250, hp: 55, torque: 62 },
      { rpm: 3500, hp: 60, torque: 65 },
      { rpm: 3750, hp: 65, torque: 68 },
    ];
    const smoothed = smoothCurve(curve, 3);
    expect(smoothed.length).toBe(curve.length);
  });
});

// ─── Fuel Profile Sanity ─────────────────────────────────────────────────────

describe('FUEL_PROFILES', () => {
  it('all fuels have positive stoich AFR', () => {
    for (const [key, profile] of Object.entries(FUEL_PROFILES)) {
      expect(profile.stoichAFR).toBeGreaterThan(0);
    }
  });

  it('E85 has lower stoich AFR than pump gas', () => {
    expect(FUEL_PROFILES.e85.stoichAFR).toBeLessThan(FUEL_PROFILES.pump.stoichAFR);
  });

  it('E90 has lower stoich AFR than E85', () => {
    expect(FUEL_PROFILES.e90.stoichAFR).toBeLessThan(FUEL_PROFILES.e85.stoichAFR);
  });

  it('all fuels have BSFC between 0.3 and 1.0', () => {
    for (const [key, profile] of Object.entries(FUEL_PROFILES)) {
      expect(profile.bsfc).toBeGreaterThan(0.3);
      expect(profile.bsfc).toBeLessThan(1.0);
    }
  });

  it('E85/E90 have higher BSFC than pump gas (less energy per unit mass)', () => {
    expect(FUEL_PROFILES.e85.bsfc).toBeGreaterThan(FUEL_PROFILES.pump.bsfc);
    expect(FUEL_PROFILES.e90.bsfc).toBeGreaterThan(FUEL_PROFILES.pump.bsfc);
  });
});

// ─── Injector Flow Rate Sanity ───────────────────────────────────────────────

describe('INJECTOR_FLOW_RATES', () => {
  it('stock injectors are smallest', () => {
    expect(INJECTOR_FLOW_RATES.stock).toBeLessThan(INJECTOR_FLOW_RATES.id1050);
    expect(INJECTOR_FLOW_RATES.stock).toBeLessThan(INJECTOR_FLOW_RATES.id1300);
  });

  it('ID1300 is larger than ID1050', () => {
    expect(INJECTOR_FLOW_RATES.id1300).toBeGreaterThan(INJECTOR_FLOW_RATES.id1050);
  });

  it('all flow rates are positive', () => {
    for (const [key, rate] of Object.entries(INJECTOR_FLOW_RATES)) {
      expect(rate).toBeGreaterThan(0);
    }
  });
});
