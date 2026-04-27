/**
 * Tests for updated diagnostic thresholds:
 * 1. EGT: 1475°F sustained >14 seconds, racing 1800°F >12 seconds
 * 2. Rail pressure surge: rapid overshoot detection
 * 3. Boost: loosened thresholds (15 psi abs, 40% relative, 20 sec)
 */
import { describe, it, expect } from 'vitest';
import { analyzeDiagnostics } from './diagnostics';

// Helper to build minimal ProcessedMetrics for diagnostics
function buildDiagData(overrides: Record<string, any> = {}) {
  const len = overrides.sampleCount || 200;
  return {
    railPressureActual: overrides.railActual || [],
    railPressureDesired: overrides.railDesired || [],
    pcvDutyCycle: overrides.pcv || Array(len).fill(50),
    boost: overrides.boost || [],
    boostDesired: overrides.boostDesired || [],
    turboVanePosition: overrides.vanePosition || [],
    turboVaneDesired: overrides.vaneDesired || [],
    exhaustGasTemp: overrides.egt || [],
    maf: overrides.maf || Array(len).fill(10),
    rpm: overrides.rpm || Array(len).fill(2000),
    converterSlip: [],
    converterDutyCycle: [],
    converterPressure: [],
    coolantTemp: overrides.coolantTemp || [],
    timeMinutes: Array.from({ length: len }, (_, i) => i * 0.01),
    currentGear: Array(len).fill(5),
    throttlePosition: overrides.throttle || Array(len).fill(50),
    exhaustPressure: [],
    vehicleSpeed: overrides.speed || Array(len).fill(40),
    boostActualAvailable: overrides.boostActualAvailable ?? false,
    vehicleMeta: overrides.vehicleMeta,
    fileFormat: 'hptuners',
  };
}

// ── EGT Threshold Tests ─────────────────────────────────────────────────────

describe('EGT Thresholds — Updated to 1475°F / 14 seconds', () => {
  it('does NOT flag EGT at 1450°F sustained (below new 1475 threshold)', () => {
    // 200 samples at 10Hz = 20 seconds — would have triggered old 1750/5s threshold
    const data = buildDiagData({
      sampleCount: 200,
      egt: Array(200).fill(1450),
    });
    const report = analyzeDiagnostics(data);
    const egtHigh = report.issues.filter(i => i.code === 'EGT-HIGH');
    expect(egtHigh).toHaveLength(0);
  });

  it('does NOT flag EGT at 1500°F for only 10 seconds (below 14s duration)', () => {
    // 100 samples at 10Hz = 10 seconds, below the 14-second threshold
    const data = buildDiagData({
      sampleCount: 200,
      egt: [...Array(100).fill(1500), ...Array(100).fill(1000)],
    });
    const report = analyzeDiagnostics(data);
    const egtHigh = report.issues.filter(i => i.code === 'EGT-HIGH');
    expect(egtHigh).toHaveLength(0);
  });

  it('DOES flag EGT at 1500°F sustained for 15+ seconds', () => {
    // Need 141+ consecutive samples above 1475°F at 10Hz = 14.1 seconds
    // Add slight variation to avoid stuck-sensor detection (which would set sensorFaulty=true
    // and skip the high-temp check). Stuck sensor triggers at 150+ samples with <1°F change.
    const egt: number[] = [];
    for (let i = 0; i < 200; i++) {
      // Oscillate between 1498-1502 to avoid stuck detection
      egt.push(1500 + (i % 3 === 0 ? 2 : i % 3 === 1 ? -2 : 0));
    }
    const data = buildDiagData({
      sampleCount: 200,
      egt,
    });
    const report = analyzeDiagnostics(data);
    const egtHigh = report.issues.filter(i => i.code === 'EGT-HIGH');
    expect(egtHigh.length).toBeGreaterThan(0);
    expect(egtHigh[0].description).toContain('1475');
    expect(egtHigh[0].description).toContain('14 seconds');
  });

  it('does NOT flag racing EGT at 1850°F for 10 seconds (below 12s racing threshold)', () => {
    // 100 samples at 10Hz = 10 seconds — acceptable racing spike
    const data = buildDiagData({
      sampleCount: 200,
      egt: [...Array(100).fill(1850), ...Array(100).fill(1000)],
    });
    const report = analyzeDiagnostics(data);
    const racingEgt = report.issues.filter(i => i.code === 'EGT-RACING-SUSTAINED');
    expect(racingEgt).toHaveLength(0);
  });

  it('DOES flag racing EGT at 1850°F sustained for 13+ seconds', () => {
    // 140 samples at 10Hz = 14 seconds, above the 12-second racing threshold
    const data = buildDiagData({
      sampleCount: 200,
      egt: [...Array(140).fill(1850), ...Array(60).fill(1000)],
    });
    const report = analyzeDiagnostics(data);
    const racingEgt = report.issues.filter(i => i.code === 'EGT-RACING-SUSTAINED');
    expect(racingEgt.length).toBeGreaterThan(0);
    expect(racingEgt[0].description).toContain('1800');
    expect(racingEgt[0].description).toContain('12 seconds');
  });
});

// ── Rail Pressure Surge Tests ───────────────────────────────────────────────

describe('Rail Pressure Surge Detection — New Check', () => {
  it('detects rapid rail pressure surge (actual overshoots desired by >2000 psi rapidly)', () => {
    // Simulate the L5P pattern: actual surges from 24-26k to 31k while desired holds at 28k
    // checkRailPressureSurge requires:
    //   overshoot > 2000 psi (actual - desired)
    //   rate > 30000 psi/sec = (actual[i] - actual[i-5]) * (10/5) > 30000
    //   So actual[i] - actual[i-5] > 15000 psi
    // The function also skips decel and throttle transients, so we need stable throttle
    const len = 400;
    const rpm = Array(len).fill(2500);
    const throttle = Array(len).fill(60);
    const desired = Array(len).fill(28000);
    const actual = Array(len).fill(27500); // baseline near desired

    // Surge event 1 at sample 50: actual jumps from 15k to 31k over 5 samples
    actual[45] = 15000; actual[46] = 15000; actual[47] = 15000;
    actual[48] = 15000; actual[49] = 15000;
    actual[50] = 31000; // overshoot = 3000, rate = (31000-15000)*2 = 32000 psi/sec
    actual[51] = 30500; actual[52] = 29000; actual[53] = 28500;

    // Surge event 2 at sample 150 (well past 20-sample cooldown)
    actual[145] = 14000; actual[146] = 14000; actual[147] = 14000;
    actual[148] = 14000; actual[149] = 14000;
    actual[150] = 31500; // overshoot = 3500, rate = (31500-14000)*2 = 35000 psi/sec
    actual[151] = 30000; actual[152] = 29000; actual[153] = 28500;

    // Surge event 3 at sample 250
    actual[245] = 13000; actual[246] = 13000; actual[247] = 13000;
    actual[248] = 13000; actual[249] = 13000;
    actual[250] = 32000; // overshoot = 4000, rate = (32000-13000)*2 = 38000 psi/sec
    actual[251] = 30000; actual[252] = 29000; actual[253] = 28500;

    const data = buildDiagData({
      sampleCount: len,
      railActual: actual,
      railDesired: desired,
      rpm,
      throttle,
    });

    const report = analyzeDiagnostics(data);
    const surgeIssues = report.issues.filter(i => i.code === 'RAIL-PRESSURE-SURGE');
    expect(surgeIssues.length).toBeGreaterThan(0);
    expect(surgeIssues[0].title).toContain('Surge');
  });

  it('does NOT flag normal rail pressure tracking (actual follows desired closely)', () => {
    const len = 300;
    const desired = Array(len).fill(28000);
    // Actual tracks desired within 500 psi — normal behavior
    const actual = desired.map(d => d + (Math.random() - 0.5) * 1000);
    const rpm = Array(len).fill(2500);
    const throttle = Array(len).fill(60);

    const data = buildDiagData({
      sampleCount: len,
      railActual: actual,
      railDesired: desired,
      rpm,
      throttle,
    });

    const report = analyzeDiagnostics(data);
    const surgeIssues = report.issues.filter(i => i.code === 'RAIL-PRESSURE-SURGE');
    expect(surgeIssues).toHaveLength(0);
  });
});

// ── Boost Threshold Tests ───────────────────────────────────────────────────

describe('Boost Thresholds — Loosened to 15 psi / 40%', () => {
  it('does NOT flag boost deviation of 12 psi / 35% (below new thresholds)', () => {
    // Old thresholds (10 psi / 30%) would have flagged this
    const len = 300;
    const boostDesired = Array(len).fill(35);
    // 12 psi below desired = ~34% deviation — below new 40% threshold
    const boostActual = Array(len).fill(23);
    const rpm = Array(len).fill(2500);
    const throttle = Array(len).fill(60);

    const data = buildDiagData({
      sampleCount: len,
      boost: boostActual,
      boostDesired,
      boostActualAvailable: true,
      rpm,
      throttle,
      maf: Array(len).fill(30),
      vanePosition: Array(len).fill(60),
    });

    const report = analyzeDiagnostics(data);
    const lowBoost = report.issues.filter(i =>
      i.code.includes('LOW-BOOST') || i.code.includes('UNDERBOOST')
    );
    expect(lowBoost).toHaveLength(0);
  });

  it('DOES flag severe boost deviation of 20 psi / 50%', () => {
    // 20 psi below desired at 40 psi target = 50% deviation — above new thresholds
    const len = 300;
    const boostDesired = Array(len).fill(40);
    const boostActual = Array(len).fill(20);
    const rpm = Array(len).fill(2500);
    const throttle = Array(len).fill(60);

    const data = buildDiagData({
      sampleCount: len,
      boost: boostActual,
      boostDesired,
      boostActualAvailable: true,
      rpm,
      throttle,
      maf: Array(len).fill(30),
      vanePosition: Array(len).fill(60),
    });

    const report = analyzeDiagnostics(data);
    const lowBoost = report.issues.filter(i =>
      i.code.includes('LOW-BOOST') || i.code.includes('UNDERBOOST')
    );
    expect(lowBoost.length).toBeGreaterThan(0);
  });
});
