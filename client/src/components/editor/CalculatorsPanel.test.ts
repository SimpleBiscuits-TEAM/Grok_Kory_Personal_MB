/**
 * Tests for PPEI Calculator formulas
 * Validates the core math used in CalculatorsPanel
 */
import { describe, it, expect } from 'vitest';

// ─── Tire / Gear / Speed formulas ───────────────────────────────────────────

describe('Tire / Gear / Speed Calculator', () => {
  const calcSpeed = (rpm: number, tireHeight: number, gearRatio: number, axleRatio: number) => {
    const tireCirc = Math.PI * tireHeight;
    return (rpm * tireCirc) / (gearRatio * axleRatio * 1056);
  };

  const calcRPM = (speed: number, tireHeight: number, gearRatio: number, axleRatio: number) => {
    const tireCirc = Math.PI * tireHeight;
    return (speed * gearRatio * axleRatio * 1056) / tireCirc;
  };

  it('calculates speed at RPM for Allison 6th gear', () => {
    // 3000 RPM, 31.5" tires, 0.61 ratio, 3.73 axle
    const speed = calcSpeed(3000, 31.5, 0.61, 3.73);
    // Should be around 123 MPH
    expect(speed).toBeGreaterThan(120);
    expect(speed).toBeLessThan(130);
  });

  it('calculates speed at RPM for Allison 1st gear', () => {
    // 3000 RPM, 31.5" tires, 3.10 ratio, 3.73 axle
    const speed = calcSpeed(3000, 31.5, 3.10, 3.73);
    // Should be around 24 MPH
    expect(speed).toBeGreaterThan(22);
    expect(speed).toBeLessThan(26);
  });

  it('RPM and speed are inverse operations', () => {
    const rpm = 2500;
    const tireHeight = 33;
    const gearRatio = 1.41;
    const axleRatio = 3.73;
    const speed = calcSpeed(rpm, tireHeight, gearRatio, axleRatio);
    const backRpm = calcRPM(speed, tireHeight, gearRatio, axleRatio);
    expect(backRpm).toBeCloseTo(rpm, 5);
  });

  it('tire circumference calculation', () => {
    const tireCirc = Math.PI * 31.5;
    expect(tireCirc).toBeCloseTo(98.96, 1);
  });

  it('tire revolutions per mile', () => {
    const tireCirc = Math.PI * 31.5;
    const revsPerMile = 63360 / tireCirc;
    expect(revsPerMile).toBeCloseTo(640, 0);
  });
});

// ─── MAP Sensor formulas ────────────────────────────────────────────────────

describe('MAP Sensor Calculator', () => {
  it('calculates slope and offset for GM 3-bar', () => {
    const minV = 0.4, maxV = 4.65, minkPa = 20, maxkPa = 300;
    const slope = (maxkPa - minkPa) / (maxV - minV);
    const offset = minkPa - slope * minV;
    expect(slope).toBeCloseTo(65.88, 1);
    expect(offset).toBeCloseTo(-6.35, 1);
  });

  it('converts voltage to kPa correctly', () => {
    const slope = 65.88;
    const offset = -6.35;
    const kpa = slope * 2.5 + offset;
    expect(kpa).toBeCloseTo(158.35, 0);
  });

  it('converts kPa to PSI correctly', () => {
    const kpa = 200;
    const psi = kpa * 0.145038;
    expect(psi).toBeCloseTo(29.01, 1);
  });

  it('converts kPa to inHg correctly', () => {
    const kpa = 101.325; // 1 atm
    const inhg = kpa / 3.386;
    expect(inhg).toBeCloseTo(29.92, 1);
  });

  it('Bosch 10-bar preset', () => {
    const minV = 0.25, maxV = 4.85, minkPa = 50, maxkPa = 1000;
    const slope = (maxkPa - minkPa) / (maxV - minV);
    expect(slope).toBeCloseTo(206.52, 1);
    // At 5V should read ~1031 kPa
    const kpaAt5V = slope * 5 + (minkPa - slope * minV);
    expect(kpaAt5V).toBeCloseTo(1031, 0);
  });
});

// ─── Injector Sizing formulas ───────────────────────────────────────────────

describe('Injector Sizing Calculator', () => {
  it('calculates required flow rate', () => {
    const hp = 500, bsfc = 0.5, cylinders = 8, safety = 0.1;
    const required = (hp * bsfc) / (cylinders * (1 - safety));
    expect(required).toBeCloseTo(34.72, 1);
  });

  it('flow rate pressure conversion (Q2 = Q1 * sqrt(P2/P1))', () => {
    const q1 = 34, p1 = 39.15, p2 = 58;
    const q2 = q1 * Math.sqrt(p2 / p1);
    expect(q2).toBeCloseTo(41.38, 1);
  });

  it('converts lb/hr to g/s', () => {
    const lbhr = 34;
    const gs = lbhr / 7.936;
    expect(gs).toBeCloseTo(4.28, 1);
  });
});

// ─── Equivalence Ratio / AFR formulas ───────────────────────────────────────

describe('Equivalence Ratio Calculator', () => {
  it('calculates fuel mass flow', () => {
    const iq = 50, density = 0.85, rpm = 2500, cyl = 8;
    const fuelFlow = (iq * density * rpm * cyl) / (2 * 60 * 1000);
    expect(fuelFlow).toBeCloseTo(7.08, 1);
  });

  it('calculates lambda from AFR', () => {
    const stoichAFR = 14.395;
    const actualAFR = 20;
    const lambda = actualAFR / stoichAFR;
    expect(lambda).toBeCloseTo(1.389, 2);
  });

  it('phi is inverse of lambda', () => {
    const lambda = 1.3;
    const phi = 1 / lambda;
    expect(phi).toBeCloseTo(0.769, 2);
  });

  it('lambda < 1.1 indicates smoke zone for diesel', () => {
    const stoichAFR = 14.395;
    const richAFR = 14; // slightly rich
    const lambda = richAFR / stoichAFR;
    expect(lambda).toBeLessThan(1.1);
  });
});

// ─── Engine Conversion formulas ─────────────────────────────────────────────

describe('Engine Conversion Tool', () => {
  it('HP to kW', () => {
    expect(500 * 0.7457).toBeCloseTo(372.85, 1);
  });

  it('lb·ft to N·m', () => {
    expect(900 * 1.3558).toBeCloseTo(1220.2, 0);
  });

  it('PSI to bar', () => {
    expect(14.7 * 0.06895).toBeCloseTo(1.0136, 3);
  });

  it('°F to °C', () => {
    expect((212 - 32) * 5 / 9).toBeCloseTo(100, 5);
    expect((32 - 32) * 5 / 9).toBeCloseTo(0, 5);
  });

  it('L to CI', () => {
    expect(6.6 * 61.024).toBeCloseTo(402.76, 0);
  });

  it('displacement calculation (L5P)', () => {
    const bore = 4.055, stroke = 3.898, cyl = 8;
    const ci = bore * bore * stroke * 0.7854 * cyl;
    expect(ci).toBeCloseTo(402.7, 0);
    expect(ci / 61.024).toBeCloseTo(6.6, 1);
  });
});

// ─── BMEP / Performance formulas ────────────────────────────────────────────

describe('BMEP / Performance Calculator', () => {
  it('calculates BMEP', () => {
    const torque = 900, displacement = 403;
    const bmep = (torque * 75.4) / displacement;
    expect(bmep).toBeCloseTo(168.4, 0);
  });

  it('HP = (Torque × RPM) / 5252', () => {
    const torque = 900, rpm = 3000;
    const hp = (torque * rpm) / 5252;
    expect(hp).toBeCloseTo(514.1, 0);
  });

  it('Torque = (HP × 5252) / RPM', () => {
    const hp = 500, rpm = 3000;
    const torque = (hp * 5252) / rpm;
    expect(torque).toBeCloseTo(875.3, 0);
  });

  it('HP and Torque are consistent at 5252 RPM', () => {
    const torque = 500;
    const rpm = 5252;
    const hp = (torque * rpm) / 5252;
    expect(hp).toBeCloseTo(torque, 5);
  });
});

// ─── Shift Point scaling ────────────────────────────────────────────────────

describe('Shift Point Calculator', () => {
  it('scale factor is 1.0 for reference tire/axle', () => {
    const refCirc = Math.PI * 31.5;
    const tireCirc = Math.PI * 31.5;
    const scaleFactor = (tireCirc / refCirc) * (3.73 / 3.73);
    expect(scaleFactor).toBeCloseTo(1.0, 10);
  });

  it('larger tires increase shift speeds', () => {
    const refCirc = Math.PI * 31.5;
    const tireCirc = Math.PI * 35; // bigger tires
    const scaleFactor = (tireCirc / refCirc) * (3.73 / 3.73);
    expect(scaleFactor).toBeGreaterThan(1.0);
  });

  it('higher axle ratio decreases shift speeds', () => {
    const refCirc = Math.PI * 31.5;
    const tireCirc = Math.PI * 31.5;
    const scaleFactor = (tireCirc / refCirc) * (3.73 / 4.10); // higher axle ratio
    expect(scaleFactor).toBeLessThan(1.0);
  });
});
