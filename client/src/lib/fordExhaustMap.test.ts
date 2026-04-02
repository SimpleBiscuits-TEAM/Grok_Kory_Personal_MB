/**
 * Regression test: Ford Powerstroke "Exhaust MAP" must NOT be used as intake boost.
 *
 * Ford 6.7L Powerstroke logs from HP Tuners often contain:
 *   - "Exhaust MAP" or "Exhaust Manifold Absolute Pressure" (exhaust backpressure)
 *   - "Exhaust Backpressure" (same thing, different name)
 *
 * These are EXHAUST SIDE pressures and must never be confused with intake MAP/boost.
 * The parser must:
 *   1. NOT select "Exhaust MAP" as the boost source
 *   2. Correctly parse "Exhaust MAP" into exhaustPressure[] instead
 *   3. When no intake MAP column exists, boost should be zero (not backpressure)
 *   4. When both intake MAP and Exhaust MAP exist, only intake MAP feeds boost
 */
import { describe, it, expect } from 'vitest';
import { parseCSV } from './dataProcessor';
import { resolvePids } from './pidSubstitution';

/**
 * Build a minimal Ford Powerstroke HP Tuners CSV.
 * Can include or exclude intake MAP to test both scenarios.
 */
function buildFordCSV(options: {
  includeIntakeMap?: boolean;
  exhaustHeader?: string;
}): string {
  const {
    includeIntakeMap = false,
    exhaustHeader = 'Exhaust MAP',
  } = options;

  const headers = [
    'Offset',
    'Engine RPM (SAE)',
    'Mass Airflow (SAE)',
    'Actual Engine Torque (SAE)',
    ...(includeIntakeMap ? ['Intake Manifold Absolute Pressure (SAE)'] : []),
    exhaustHeader,
    'Vehicle Speed (SAE)',
    'Barometric Pressure (SAE)',
    'Engine Coolant Temp (SAE)',
  ];

  const lines = [headers.join(',')];

  // Generate 20 rows of data simulating a Ford log
  for (let i = 0; i < 20; i++) {
    const rpm = 800 + i * 100;
    const intakeMapPsia = includeIntakeMap ? (14.7 + i * 1.5) : null; // 14.7 to 43.2 psia
    const exhaustMapPsia = 15 + i * 2.5; // 15 to 62.5 psia (exhaust backpressure)

    const row = [
      (i * 0.5).toFixed(3),    // Offset
      rpm.toString(),           // RPM
      (20 + i * 3).toString(),  // MAF
      (30 + i).toString(),      // Torque %
      ...(includeIntakeMap ? [intakeMapPsia!.toFixed(1)] : []),
      exhaustMapPsia.toFixed(1), // Exhaust MAP (backpressure)
      (30 + i * 2).toString(),  // Speed
      '14.7',                   // Baro
      '190',                    // Coolant
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

describe('Ford Powerstroke Exhaust MAP vs Boost', () => {
  describe('dataProcessor.ts - HP Tuners parser', () => {
    it('should NOT use "Exhaust MAP" as boost when no intake MAP exists', () => {
      const csv = buildFordCSV({ includeIntakeMap: false, exhaustHeader: 'Exhaust MAP' });
      const data = parseCSV(csv);

      // Boost should be zero or near-zero since there's no intake MAP column
      const maxBoost = Math.max(...data.boost);
      expect(maxBoost).toBeLessThan(1); // Should be 0, definitely not 47+ psi of backpressure

      // Exhaust pressure should be populated from the Exhaust MAP column
      const maxExhaust = Math.max(...data.exhaustPressure);
      expect(maxExhaust).toBeGreaterThan(10); // Should have real exhaust backpressure data
    });

    it('should NOT use "Exhaust Manifold Absolute Pressure" as boost', () => {
      const csv = buildFordCSV({
        includeIntakeMap: false,
        exhaustHeader: 'Exhaust Manifold Absolute Pressure',
      });
      const data = parseCSV(csv);

      const maxBoost = Math.max(...data.boost);
      expect(maxBoost).toBeLessThan(1);
    });

    it('should NOT use "Exhaust Back Pressure" as boost', () => {
      const csv = buildFordCSV({
        includeIntakeMap: false,
        exhaustHeader: 'Exhaust Back Pressure',
      });
      const data = parseCSV(csv);

      const maxBoost = Math.max(...data.boost);
      expect(maxBoost).toBeLessThan(1);
    });

    it('should correctly derive boost from intake MAP when both intake and exhaust MAP exist', () => {
      const csv = buildFordCSV({ includeIntakeMap: true, exhaustHeader: 'Exhaust MAP' });
      const data = parseCSV(csv);

      // Boost should come from intake MAP minus baro (14.7)
      // Intake MAP goes from 14.7 to 43.2, so max gauge boost ~ 28.5 psi
      const maxBoost = Math.max(...data.boost);
      expect(maxBoost).toBeGreaterThan(10);  // Real boost from intake MAP
      expect(maxBoost).toBeLessThan(35);     // Not exhaust backpressure (62.5 psi)

      // Exhaust pressure should still be populated separately
      const maxExhaust = Math.max(...data.exhaustPressure);
      expect(maxExhaust).toBeGreaterThan(10);
    });

    it('boost source should be "none" when only exhaust MAP exists', () => {
      const csv = buildFordCSV({ includeIntakeMap: false, exhaustHeader: 'Exhaust MAP' });
      const data = parseCSV(csv);
      expect(data.boostSource).toBe('none');
    });

    it('boost source should be "map_derived" when intake MAP exists', () => {
      const csv = buildFordCSV({ includeIntakeMap: true, exhaustHeader: 'Exhaust MAP' });
      const data = parseCSV(csv);
      expect(data.boostSource).toBe('map_derived');
    });
  });

  describe('pidSubstitution.ts - resolvePids', () => {
    it('should NOT resolve "Exhaust MAP" as boost in PID substitution', () => {
      // Simulate headers that only have Exhaust MAP, no intake MAP
      const headers = ['Engine RPM', 'Mass Air Flow', 'Exhaust MAP', 'Barometric Pressure'];
      const rows: number[][] = [];
      for (let i = 0; i < 20; i++) {
        rows.push([
          800 + i * 100,   // RPM
          20 + i * 3,      // MAF
          15 + i * 2.5,    // Exhaust MAP (backpressure)
          14.7,            // Baro
        ]);
      }
      const rpm = rows.map(r => r[0]);
      const offsets = rows.map((_, i) => i * 0.5);

      const result = resolvePids(headers, rows, rpm, offsets, 'hptuners');

      // Boost should be zero since Exhaust MAP should NOT be used
      const maxBoost = Math.max(...result.channels['boost']);
      expect(maxBoost).toBeLessThanOrEqual(0);
    });

    it('should resolve intake MAP as boost when both exist in PID substitution', () => {
      const headers = ['Engine RPM', 'Mass Air Flow', 'Intake Manifold Absolute Pressure', 'Exhaust MAP', 'Barometric Pressure'];
      const rows: number[][] = [];
      for (let i = 0; i < 20; i++) {
        rows.push([
          800 + i * 100,       // RPM
          20 + i * 3,          // MAF
          14.7 + i * 1.5,      // Intake MAP (psia)
          15 + i * 2.5,        // Exhaust MAP (backpressure)
          14.7,                // Baro
        ]);
      }
      const rpm = rows.map(r => r[0]);
      const offsets = rows.map((_, i) => i * 0.5);

      const result = resolvePids(headers, rows, rpm, offsets, 'hptuners');

      // Boost should come from intake MAP, not exhaust
      const maxBoost = Math.max(...result.channels['boost']);
      expect(maxBoost).toBeGreaterThan(5);   // Real boost from intake MAP
      expect(maxBoost).toBeLessThan(35);     // Not exhaust backpressure
    });
  });
});
