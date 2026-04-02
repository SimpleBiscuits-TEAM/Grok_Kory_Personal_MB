import { describe, expect, it } from 'vitest';
import { parseCSV, processData } from './dataProcessor';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CSV_PATH = resolve(__dirname, '../../../test-fixtures/ezlynk-ram-67l.csv');

describe('EZLynk CSV Parser — 2014 Ram 6.7L Cummins', () => {
  const csvContent = readFileSync(CSV_PATH, 'utf-8');

  it('should detect the file as EZLynk format', () => {
    const raw = parseCSV(csvContent);
    expect(raw.fileFormat).toBe('ezlynk');
  });

  it('should parse all rows (forward-fill sparse data)', () => {
    const raw = parseCSV(csvContent);
    // The CSV has 937 data rows; with forward-fill, most should be kept
    expect(raw.rpm.length).toBeGreaterThan(100);
    expect(raw.offset.length).toBe(raw.rpm.length);
  });

  it('should correctly map Engine RPM', () => {
    const raw = parseCSV(csvContent);
    // First data row: RPM = 707
    expect(raw.rpm[0]).toBe(707);
    // Should have non-zero RPM values throughout
    const nonZeroRpm = raw.rpm.filter(v => v > 0);
    expect(nonZeroRpm.length).toBeGreaterThan(50);
  });

  it('should correctly map Boost Pressure (gauge PSI)', () => {
    const raw = parseCSV(csvContent);
    // Boost should be in gauge PSI (not absolute)
    const nonZeroBoost = raw.boost.filter(v => v > 0);
    expect(nonZeroBoost.length).toBeGreaterThan(0);
    // Gauge PSI should be reasonable (0-60 PSI for a Cummins)
    const maxBoost = Math.max(...raw.boost);
    expect(maxBoost).toBeLessThan(80);
    expect(maxBoost).toBeGreaterThan(0);
  });

  it('should correctly map Est. Engine Torque(A) (Ft-lbf) to torquePercent', () => {
    const raw = parseCSV(csvContent);
    // The CSV has "Est. Engine Torque(A) (Ft-lbf)" column
    // First row value is 86 ft-lbf, which should be converted to percentage
    // torquePercent = (86 / 800) * 100 = 10.75%
    const nonZeroTorque = raw.torquePercent.filter(v => v !== 0);
    expect(nonZeroTorque.length).toBeGreaterThan(0);
    // The first data row has torque = 86 ft-lbf
    expect(raw.torquePercent[0]).toBeCloseTo((86 / 800) * 100, 1);
  });

  it('should correctly map Turbo Vane Position(A) and (D)', () => {
    const raw = parseCSV(csvContent);
    // The CSV has "Turbo Vane Position(A) (%)" and "Turbo Vane Position(D) (%)"
    const nonZeroVane = raw.turboVanePosition.filter(v => v > 0);
    expect(nonZeroVane.length).toBeGreaterThan(0);
    // Vane position should be 0-100%
    const maxVane = Math.max(...raw.turboVanePosition);
    expect(maxVane).toBeLessThanOrEqual(100);
    expect(maxVane).toBeGreaterThan(0);
  });

  it('should correctly map Mass Air Flow (g/s)', () => {
    const raw = parseCSV(csvContent);
    // First row: MAF = 15 g/s
    expect(raw.maf[0]).toBe(15);
  });

  it('should correctly map Throttle Position (%)', () => {
    const raw = parseCSV(csvContent);
    // First row: Throttle = 0%
    expect(raw.throttlePosition[0]).toBe(0);
    // Should have some non-zero throttle values
    const nonZero = raw.throttlePosition.filter(v => v > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it('should correctly map Gear', () => {
    const raw = parseCSV(csvContent);
    // First row: Gear = 65 (EZLynk gear encoding)
    expect(raw.currentGear[0]).toBe(65);
  });

  it('should correctly map TQ Conv. Status to converter duty cycle', () => {
    const raw = parseCSV(csvContent);
    // First row: TCC status = 0 (off), so duty = 0
    expect(raw.converterDutyCycle[0]).toBe(0);
    // Should have some non-zero duty cycle values
    const nonZero = raw.converterDutyCycle.filter(v => v > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it('should forward-fill sparse values correctly', () => {
    const raw = parseCSV(csvContent);
    // EZLynk only logs values when they change.
    // After forward-fill, consecutive rows should have the same value
    // when the original was empty (not a new value).
    // Check that RPM doesn't have long runs of 0 in the middle
    let maxConsecutiveZero = 0;
    let currentZeroRun = 0;
    for (const r of raw.rpm) {
      if (r === 0) { currentZeroRun++; maxConsecutiveZero = Math.max(maxConsecutiveZero, currentZeroRun); }
      else { currentZeroRun = 0; }
    }
    // With forward-fill, we shouldn't have more than a few consecutive zeros
    // (only at the very start before first RPM value)
    expect(maxConsecutiveZero).toBeLessThan(10);
  });

  it('should produce valid ProcessedMetrics with HP calculations', () => {
    const raw = parseCSV(csvContent);
    const processed = processData(raw);
    
    // Should have hpTorque values since we have torque data
    expect(processed.hpTorque.length).toBe(raw.rpm.length);
    const nonZeroHp = processed.hpTorque.filter(v => v > 10);
    expect(nonZeroHp.length).toBeGreaterThan(0);
    
    // Peak HP should be reasonable for a tuned 6.7L Cummins
    const peakHp = Math.max(...processed.hpTorque);
    expect(peakHp).toBeGreaterThan(50);
    expect(peakHp).toBeLessThan(1500); // Sanity check
  });

  it('should have correct time offsets', () => {
    const raw = parseCSV(csvContent);
    // First offset should be 0
    expect(raw.offset[0]).toBe(0);
    // Last offset should be ~44 seconds (the log duration)
    const lastOffset = raw.offset[raw.offset.length - 1];
    expect(lastOffset).toBeGreaterThan(30);
    expect(lastOffset).toBeLessThan(60);
    // Offsets should be monotonically non-decreasing
    for (let i = 1; i < raw.offset.length; i++) {
      expect(raw.offset[i]).toBeGreaterThanOrEqual(raw.offset[i - 1]);
    }
  });

  it('should not have missing PIDs for columns present in the CSV', () => {
    const raw = parseCSV(csvContent);
    // Engine RPM and MAF are present, so they shouldn't be in pidsMissing
    expect(raw.pidsMissing).not.toContain('Engine RPM');
    // MAF is present in this file
    expect(raw.pidsMissing).not.toContain('Mass Air Flow');
  });
});

describe('EZLynk CSV Parser — edge cases', () => {
  it('should handle a minimal EZLynk CSV with only RPM', () => {
    const csv = `Time,Engine RPM (RPM)
0,700
1,800
2,900
3,1000`;
    const raw = parseCSV(csv);
    expect(raw.fileFormat).toBe('ezlynk');
    expect(raw.rpm.length).toBe(4);
    expect(raw.rpm).toEqual([700, 800, 900, 1000]);
  });

  it('should handle EZLynk CSV with only Boost Pressure', () => {
    const csv = `Time,Boost Pressure (PSI),Injection Pressure(A) (kPSI)
0,5,10
1,10,15
2,15,20`;
    const raw = parseCSV(csv);
    expect(raw.fileFormat).toBe('ezlynk');
    expect(raw.boost).toEqual([5, 10, 15]);
    expect(raw.railPressureActual).toEqual([10000, 15000, 20000]); // kPSI * 1000
  });

  it('should forward-fill when values are sparse', () => {
    const csv = `Time,Engine RPM (RPM),Boost Pressure (PSI)
0,700,5
1,,10
2,800,
3,,`;
    const raw = parseCSV(csv);
    expect(raw.rpm).toEqual([700, 700, 800, 800]); // forward-filled
    expect(raw.boost).toEqual([5, 10, 10, 10]); // forward-filled
  });
});
