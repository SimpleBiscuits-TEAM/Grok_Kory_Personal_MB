/**
 * Tests for false-positive prevention in diagnostics.ts
 *
 * These tests verify that the diagnostic engine does NOT flag normal
 * operating conditions as faults — specifically:
 *  - Rail pressure transients during tip-in
 *  - Boost lag during turbo spool-up
 *  - TCC slip during ControlledOn (converging slip = normal torque multiplication)
 *  - TCC slip during gear shifts
 */

import { describe, it, expect } from 'vitest';
import { analyzeDiagnostics } from './diagnostics';

function makeData(overrides: Record<string, any> = {}) {
  const len = 500; // 50 seconds at 10 Hz
  return {
    railPressureActual: new Array(len).fill(20000),
    railPressureDesired: new Array(len).fill(20000),
    pcvDutyCycle: new Array(len).fill(800),
    boost: new Array(len).fill(30),
    boostDesired: new Array(len).fill(30),
    boostActualAvailable: true,
    turboVanePosition: new Array(len).fill(50),
    turboVaneDesired: new Array(len).fill(50),
    exhaustGasTemp: Array.from({ length: len }, (_, i) => 800 + (i % 3) * 2), // slight variation to avoid stuck-sensor false positive
    maf: new Array(len).fill(20),
    rpm: new Array(len).fill(2000),
    converterSlip: new Array(len).fill(0),
    converterDutyCycle: new Array(len).fill(1050), // full lock kPa
    converterPressure: new Array(len).fill(1050),
    coolantTemp: new Array(len).fill(200),
    timeMinutes: Array.from({ length: len }, (_, i) => i / 600), // 10 Hz
    currentGear: new Array(len).fill(6),
    throttlePosition: new Array(len).fill(50),
    vehicleSpeed: new Array(len).fill(60),
    fileFormat: 'hptuners',
    stats: { rpmMax: 3000, rpmAvg: 2000, rpmMin: 700 },
    ...overrides,
  };
}

describe('False Positive Prevention', () => {
  describe('Rail Pressure (P0087)', () => {
    it('should NOT flag rail pressure deviation during rapid throttle transient', () => {
      // Simulate tip-in: throttle jumps from 10% to 80% over 5 samples
      // Rail pressure lags behind desired by 6000 psi for 20 samples (2 seconds)
      const len = 500;
      const throttle = new Array(len).fill(50);
      const railActual = new Array(len).fill(20000);
      const railDesired = new Array(len).fill(20000);
      const rpm = new Array(len).fill(2000);

      // Simulate rapid throttle change at sample 100
      for (let i = 100; i < 105; i++) {
        throttle[i] = 10 + (80 - 10) * ((i - 100) / 5);
      }
      for (let i = 105; i < 200; i++) throttle[i] = 80;

      // Rail pressure lags for 20 samples after tip-in
      for (let i = 100; i < 120; i++) {
        railDesired[i] = 28000;
        railActual[i] = 22000; // 6000 psi deviation
      }
      for (let i = 120; i < 200; i++) {
        railDesired[i] = 28000;
        railActual[i] = 28000; // catches up
      }

      const data = makeData({ throttlePosition: throttle, railPressureActual: railActual, railPressureDesired: railDesired, rpm });
      const report = analyzeDiagnostics(data);
      const railFaults = report.issues.filter(i => i.code.includes('LOW-RAIL'));
      expect(railFaults.length).toBe(0);
    });

    it('should NOT flag rail pressure at low RPM (<1000)', () => {
      const len = 500;
      const rpm = new Array(len).fill(700); // idle
      const railActual = new Array(len).fill(3000);
      const railDesired = new Array(len).fill(10000); // 7000 psi deviation
      const throttle = new Array(len).fill(10);

      const data = makeData({ rpm, railPressureActual: railActual, railPressureDesired: railDesired, throttlePosition: throttle });
      const report = analyzeDiagnostics(data);
      const railFaults = report.issues.filter(i => i.code.includes('LOW-RAIL'));
      expect(railFaults.length).toBe(0);
    });

    it('should NOT flag rail pressure when throttle is below 30%', () => {
      const len = 500;
      const rpm = new Array(len).fill(2000);
      const railActual = new Array(len).fill(15000);
      const railDesired = new Array(len).fill(25000); // 10000 psi deviation
      const throttle = new Array(len).fill(20); // below 30%

      const data = makeData({ rpm, railPressureActual: railActual, railPressureDesired: railDesired, throttlePosition: throttle });
      const report = analyzeDiagnostics(data);
      const railFaults = report.issues.filter(i => i.code.includes('LOW-RAIL'));
      expect(railFaults.length).toBe(0);
    });

    it('should flag genuine sustained low rail pressure at steady state', () => {
      const len = 500;
      const rpm = new Array(len).fill(2500);
      const railActual = new Array(len).fill(15000);
      const railDesired = new Array(len).fill(25000); // 10000 psi sustained deviation
      const throttle = new Array(len).fill(60); // above 30%

      const data = makeData({ rpm, railPressureActual: railActual, railPressureDesired: railDesired, throttlePosition: throttle });
      const report = analyzeDiagnostics(data);
      const railFaults = report.issues.filter(i => i.code.includes('LOW-RAIL'));
      expect(railFaults.length).toBeGreaterThan(0);
    });
  });

  describe('Boost Pressure (P0299)', () => {
    it('should NOT flag boost deviation during rapid throttle transient', () => {
      const len = 500;
      const throttle = new Array(len).fill(50);
      const boostActual = new Array(len).fill(30);
      const boostDesired = new Array(len).fill(30);
      const rpm = new Array(len).fill(2500);

      // Simulate rapid throttle change at sample 100
      for (let i = 100; i < 105; i++) {
        throttle[i] = 10 + (80 - 10) * ((i - 100) / 5);
      }
      for (let i = 105; i < 200; i++) throttle[i] = 80;

      // Boost lags for 30 samples after tip-in
      for (let i = 100; i < 130; i++) {
        boostDesired[i] = 40;
        boostActual[i] = 25; // 15 psi deviation
      }
      for (let i = 130; i < 200; i++) {
        boostDesired[i] = 40;
        boostActual[i] = 40; // catches up
      }

      const data = makeData({ throttlePosition: throttle, boost: boostActual, boostDesired, rpm });
      const report = analyzeDiagnostics(data);
      const boostFaults = report.issues.filter(i => i.code.includes('LOW-BOOST'));
      expect(boostFaults.length).toBe(0);
    });

    it('should NOT flag boost deviation at low RPM (<1500)', () => {
      const len = 500;
      const rpm = new Array(len).fill(1200);
      const boostActual = new Array(len).fill(5);
      const boostDesired = new Array(len).fill(20); // 15 psi deviation
      const throttle = new Array(len).fill(50);

      const data = makeData({ rpm, boost: boostActual, boostDesired, throttlePosition: throttle });
      const report = analyzeDiagnostics(data);
      const boostFaults = report.issues.filter(i => i.code.includes('LOW-BOOST'));
      expect(boostFaults.length).toBe(0);
    });
  });

  describe('TCC Slip', () => {
    it('should NOT flag converging slip during ControlledOn (normal torque multiplication)', () => {
      const len = 500;
      const slip = new Array(len).fill(0);
      const duty = new Array(len).fill(0); // Start unlocked
      const gear = new Array(len).fill(6);
      const rpm = new Array(len).fill(2000);

      // Simulate real TCC apply sequence:
      // 0-99: TCC off (duty=0, slip=0)
      // 100-179: TCC commanded on with high converging slip (normal apply)
      // 180-500: TCC fully locked (low slip)
      for (let i = 100; i < 180; i++) {
        duty[i] = 1050; // Full lock commanded
        slip[i] = 700 * (1 - (i - 100) / 80); // 700 → 0 RPM over 80 samples
      }
      for (let i = 180; i < len; i++) {
        duty[i] = 1050; // Full lock
        slip[i] = 2 + Math.random() * 3; // Near-zero slip (normal locked)
      }

      const data = makeData({ converterSlip: slip, converterDutyCycle: duty, currentGear: gear, rpm });
      const report = analyzeDiagnostics(data);
      const tccFaults = report.issues.filter(i =>
        i.code.includes('TCC') || i.code.includes('CONVERTER')
      );
      // Should not flag as a fault — converging slip during apply is normal,
      // and the converter hasn't settled yet when the high slip occurs
      const criticalTccFaults = tccFaults.filter(i => i.severity === 'critical' || i.severity === 'warning');
      expect(criticalTccFaults.length).toBe(0);
    });

    it('should NOT flag slip during gear shifts', () => {
      const len = 500;
      const slip = new Array(len).fill(0);
      const duty = new Array(len).fill(1050);
      const gear = new Array(len).fill(5);
      const rpm = new Array(len).fill(2000);

      // Simulate gear shift at sample 200: gear 5 → 6
      for (let i = 200; i < len; i++) gear[i] = 6;
      // Slip spikes during shift
      for (let i = 195; i < 215; i++) {
        slip[i] = 100;
      }

      const data = makeData({ converterSlip: slip, converterDutyCycle: duty, currentGear: gear, rpm });
      const report = analyzeDiagnostics(data);
      const tccFaults = report.issues.filter(i =>
        i.code.includes('TCC') || i.code.includes('CONVERTER')
      );
      const criticalTccFaults = tccFaults.filter(i => i.severity === 'critical');
      expect(criticalTccFaults.length).toBe(0);
    });

    it('should NOT flag slip during lock/unlock transitions', () => {
      const len = 500;
      const slip = new Array(len).fill(0);
      const duty = new Array(len).fill(0); // unlocked
      const gear = new Array(len).fill(6);
      const rpm = new Array(len).fill(2000);

      // TCC locks at sample 200
      for (let i = 200; i < len; i++) duty[i] = 1050;
      // Slip during transition
      for (let i = 195; i < 225; i++) {
        slip[i] = 80;
      }

      const data = makeData({ converterSlip: slip, converterDutyCycle: duty, currentGear: gear, rpm });
      const report = analyzeDiagnostics(data);
      const tccFaults = report.issues.filter(i =>
        i.code.includes('TCC') || i.code.includes('CONVERTER')
      );
      const criticalTccFaults = tccFaults.filter(i => i.severity === 'critical');
      expect(criticalTccFaults.length).toBe(0);
    });
  });

  describe('Healthy data produces no faults', () => {
    it('should produce zero critical/warning issues for clean data', () => {
      const data = makeData();
      const report = analyzeDiagnostics(data);
      const seriousIssues = report.issues.filter(i => i.severity === 'critical' || i.severity === 'warning');
      if (seriousIssues.length > 0) {
        console.log('Unexpected serious issues:', JSON.stringify(seriousIssues, null, 2));
      }
      expect(seriousIssues.length).toBe(0);
    });
  });
});
