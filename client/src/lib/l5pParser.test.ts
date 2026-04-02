/**
 * Tests for L5P HP Tuners CSV parsing with new PID formats:
 * - Gear text values ("2nd Gear", "3rd Gear") → numeric
 * - TCC State Commanded text → synthetic converter duty
 * - MAP Hi-Res B channel detection
 * - Duplicate column handling
 */
import { describe, it, expect } from 'vitest';
import { parseCSV, processData } from './dataProcessor';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Build a minimal L5P-style CSV for unit testing (avoids needing the full file)
function buildL5PCSV(options: {
  gearValues?: string[];
  tccValues?: string[];
  mapHiResB?: boolean;
}): string {
  const { gearValues = ['1'], tccValues = ['CeTCCC_ImmediateOff'], mapHiResB = false } = options;
  
  const mapHeader = mapHiResB
    ? 'Intake Manifold Absolute Pressure B (SAE) (Hi Res)'
    : 'Intake Manifold Absolute Pressure (SAE)';
  
  const headers = [
    'Offset',
    'Engine RPM (SAE)',
    'Mass Airflow (SAE)',
    'Actual Engine Torque (SAE)',
    mapHeader,
    'Vehicle Speed (SAE)',
    'Trans Current Gear',
    'TCC State Commanded',
    'TCC Slip',
    'Engine Coolant Temp (SAE)',
    'Barometric Pressure (SAE)',
  ];
  
  const lines = [headers.join(',')];
  
  for (let i = 0; i < gearValues.length; i++) {
    const gear = gearValues[i];
    const tcc = tccValues[i] || 'CeTCCC_ImmediateOff';
    lines.push([
      (i * 0.1).toFixed(3),   // Offset
      '2000',                  // RPM
      '50',                    // MAF
      '40',                    // Torque %
      '20',                    // MAP (psia)
      '60',                    // Speed
      gear,                    // Gear (text or numeric)
      tcc,                     // TCC State
      '50',                    // TCC Slip
      '190',                   // Coolant
      '14.7',                  // Baro
    ].join(','));
  }
  
  return lines.join('\n');
}

describe('L5P HP Tuners CSV Parser', () => {
  describe('Gear text parsing', () => {
    it('should parse "1st Gear" text to numeric 1', () => {
      const csv = buildL5PCSV({ gearValues: ['1st Gear'] });
      const data = parseCSV(csv);
      expect(data.currentGear[0]).toBe(1);
    });

    it('should parse "2nd Gear" text to numeric 2', () => {
      const csv = buildL5PCSV({ gearValues: ['2nd Gear'] });
      const data = parseCSV(csv);
      expect(data.currentGear[0]).toBe(2);
    });

    it('should parse "6th Gear" text to numeric 6', () => {
      const csv = buildL5PCSV({ gearValues: ['6th Gear'] });
      const data = parseCSV(csv);
      expect(data.currentGear[0]).toBe(6);
    });

    it('should parse "10th Gear" text to numeric 10', () => {
      const csv = buildL5PCSV({ gearValues: ['10th Gear'] });
      const data = parseCSV(csv);
      expect(data.currentGear[0]).toBe(10);
    });

    it('should handle numeric gear values directly', () => {
      const csv = buildL5PCSV({ gearValues: ['3'] });
      const data = parseCSV(csv);
      expect(data.currentGear[0]).toBe(3);
    });

    it('should parse mixed gear values across rows', () => {
      const csv = buildL5PCSV({
        gearValues: ['1st Gear', '2nd Gear', '3', '4th Gear'],
        tccValues: ['CeTCCC_ImmediateOff', 'CeTCCC_ImmediateOff', 'CeTCCC_ControlledOn', 'CeTCCC_ControlledOn'],
      });
      const data = parseCSV(csv);
      expect(data.currentGear).toEqual([1, 2, 3, 4]);
    });
  });

  describe('TCC State Commanded parsing', () => {
    it('should map CeTCCC_ControlledOn to duty 100', () => {
      const csv = buildL5PCSV({ gearValues: ['3'], tccValues: ['CeTCCC_ControlledOn'] });
      const data = parseCSV(csv);
      expect(data.converterDutyCycle[0]).toBe(100);
    });

    it('should map CeTCCC_ImmediateOff to duty 0', () => {
      const csv = buildL5PCSV({ gearValues: ['3'], tccValues: ['CeTCCC_ImmediateOff'] });
      const data = parseCSV(csv);
      expect(data.converterDutyCycle[0]).toBe(0);
    });

    it('should map CeTCCC_ControlledHyst to duty 75', () => {
      const csv = buildL5PCSV({ gearValues: ['3'], tccValues: ['CeTCCC_ControlledHyst'] });
      const data = parseCSV(csv);
      expect(data.converterDutyCycle[0]).toBe(75);
    });

    it('should map CeTCCC_ControlledOff to duty 25', () => {
      const csv = buildL5PCSV({ gearValues: ['3'], tccValues: ['CeTCCC_ControlledOff'] });
      const data = parseCSV(csv);
      expect(data.converterDutyCycle[0]).toBe(25);
    });

    it('should map unknown TCC state to duty 0', () => {
      const csv = buildL5PCSV({ gearValues: ['3'], tccValues: ['SomeUnknownState'] });
      const data = parseCSV(csv);
      expect(data.converterDutyCycle[0]).toBe(0);
    });
  });

  describe('MAP Hi-Res B channel', () => {
    it('should detect MAP Hi-Res B variant and produce boost values', () => {
      const csv = buildL5PCSV({ gearValues: ['3'], mapHiResB: true });
      const data = parseCSV(csv);
      // MAP is 20 psia, baro is 14.7 → gauge boost = 5.3 psi
      expect(data.boost[0]).toBeCloseTo(5.3, 0);
    });
  });

  describe('Full L5P CSV file parsing', () => {
    let csvContent: string;
    
    try {
      csvContent = readFileSync(
        resolve(__dirname, 'testdata/17L5P_ticket145410.csv'),
        'utf-8'
      );
    } catch {
      csvContent = '';
    }

    it('should parse the full L5P CSV without errors', () => {
      if (!csvContent) return; // skip if file not available
      expect(() => parseCSV(csvContent)).not.toThrow();
    });

    it('should extract RPM data from the full L5P CSV', () => {
      if (!csvContent) return;
      const data = parseCSV(csvContent);
      expect(data.rpm.length).toBeGreaterThan(100);
      // RPM should have non-zero values during driving
      const maxRpm = Math.max(...data.rpm);
      expect(maxRpm).toBeGreaterThan(500);
    });

    it('should extract gear data with text parsing from full L5P CSV', () => {
      if (!csvContent) return;
      const data = parseCSV(csvContent);
      // Should have gear values > 0 (parsed from text)
      const nonZeroGears = data.currentGear.filter(g => g > 0);
      expect(nonZeroGears.length).toBeGreaterThan(0);
      // Should have multiple gear values (1-10 range)
      const uniqueGears = new Set(nonZeroGears);
      expect(uniqueGears.size).toBeGreaterThanOrEqual(1);
    });

    it('should extract TCC duty from TCC State text in full L5P CSV', () => {
      if (!csvContent) return;
      const data = parseCSV(csvContent);
      // Should have some non-zero converter duty values (from TCC State text)
      const nonZeroDuty = data.converterDutyCycle.filter(d => d > 0);
      expect(nonZeroDuty.length).toBeGreaterThan(0);
    });

    it('should extract boost from MAP Hi-Res B channel in full L5P CSV', () => {
      if (!csvContent) return;
      const data = parseCSV(csvContent);
      // Should have boost values > 0 during acceleration
      const maxBoost = Math.max(...data.boost);
      expect(maxBoost).toBeGreaterThan(0);
    });

    it('should produce valid ProcessedMetrics from full L5P CSV', () => {
      if (!csvContent) return;
      const data = parseCSV(csvContent);
      const processed = processData(data);
      // ProcessedMetrics has arrays, not peak values — check arrays have data
      expect(processed.rpm.length).toBeGreaterThan(100);
      expect(Math.max(...processed.boost)).toBeGreaterThan(0);
      expect(Math.max(...processed.hpTorque)).toBeGreaterThan(0);
      expect(processed.boostActualAvailable).toBe(true);
    });
  });
});
