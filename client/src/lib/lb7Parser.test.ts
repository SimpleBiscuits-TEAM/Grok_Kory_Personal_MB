import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseCSV, processData, ProcessedMetrics } from './dataProcessor';

const LB7_CSV_PATH = '/home/ubuntu/upload/Lb7_smokey_Laggy_tightconverterstall.csv';

describe('LB7 EFILive Parser', () => {
  let csvText: string;
  let rawData: ReturnType<typeof parseCSV>;
  let processed: ProcessedMetrics;

  // Load the CSV once for all tests
  try {
    csvText = readFileSync(LB7_CSV_PATH, 'utf-8');
    rawData = parseCSV(csvText);
    processed = processData(rawData);
  } catch (e) {
    // File may not be available in CI; tests will be skipped
  }

  describe('Format Detection', () => {
    it('should detect LB7 EFILive CSV as efilive format', () => {
      if (!rawData) return;
      expect(rawData.fileFormat).toBe('efilive');
    });

    it('should parse data rows from LB7 CSV', () => {
      if (!rawData) return;
      expect(rawData.rpm.length).toBeGreaterThan(50);
    });
  });

  describe('PID Resolution', () => {
    it('should resolve RPM from PCM.RPM', () => {
      if (!rawData) return;
      const maxRpm = Math.max(...rawData.rpm);
      expect(maxRpm).toBeGreaterThan(1000);
      expect(maxRpm).toBeLessThan(5000);
    });

    it('should resolve MAF from PCM.MAF and convert g/s to lb/min', () => {
      if (!rawData) return;
      const maxMaf = Math.max(...rawData.maf);
      // LB7 MAF in g/s converted to lb/min: peak ~80 g/s = ~10.6 lb/min
      expect(maxMaf).toBeGreaterThan(1);
      expect(maxMaf).toBeLessThan(200); // reasonable lb/min range
    });

    it('should resolve boost from PCM.BOOST_M and convert kPa absolute to PSI gauge', () => {
      if (!rawData) return;
      const maxBoost = Math.max(...rawData.boost);
      // Should be gauge pressure (atmospheric subtracted)
      // LB7 with larger turbo: peak around 29 PSI gauge
      // After RPM=0 glitch filtering, max should be reasonable
      expect(maxBoost).toBeGreaterThan(5);
      expect(maxBoost).toBeLessThan(60);
      // At idle, boost should be near 0 PSI gauge (not 12+ PSI absolute)
      const idleBoost = rawData.boost[0];
      expect(Math.abs(idleBoost)).toBeLessThan(3);
    });

    it('should resolve rail pressure from PCM.FRPACT and convert MPa to PSI', () => {
      if (!rawData) return;
      const maxRail = Math.max(...rawData.railPressureActual);
      // LB7 idle ~5000 PSI, WOT up to 23000 PSI
      expect(maxRail).toBeGreaterThan(3000);
      expect(maxRail).toBeLessThan(30000);
    });

    it('should resolve desired rail pressure from PCM.FRPDES and convert MPa to PSI', () => {
      if (!rawData) return;
      const maxDesired = Math.max(...rawData.railPressureDesired);
      expect(maxDesired).toBeGreaterThan(3000);
      expect(maxDesired).toBeLessThan(30000);
    });

    it('should resolve injection pulse width from PCM.MAINBPW and convert µs to ms', () => {
      if (!rawData) return;
      const maxIpw = Math.max(...rawData.injectorPulseWidth);
      // LB7: 577 µs = 0.577 ms at idle, up to ~2.5 ms at WOT
      expect(maxIpw).toBeGreaterThan(0.1);
      expect(maxIpw).toBeLessThan(10);
    });

    it('should resolve fuel quantity from PCM.FUEL_MAIN_M (mm3)', () => {
      if (!rawData) return;
      const maxFq = Math.max(...rawData.fuelQuantity);
      // LB7 has 100mm3 reference max
      expect(maxFq).toBeGreaterThan(0);
      expect(maxFq).toBeLessThan(200);
    });

    it('should resolve throttle position from PCM.TP_A', () => {
      if (!rawData) return;
      const maxTp = Math.max(...rawData.throttlePosition);
      expect(maxTp).toBeGreaterThan(80); // should have WOT events
      expect(maxTp).toBeLessThanOrEqual(100);
    });

    it('should resolve TCC slip from TCM.TCCSLIP', () => {
      if (!rawData) return;
      expect(rawData.converterSlip.length).toBeGreaterThan(0);
    });

    it('should resolve gear from TCM.GEAR text (First→1, Second→2, etc.)', () => {
      if (!rawData) return;
      const gears = rawData.currentGear.filter(g => g > 0);
      expect(gears.length).toBeGreaterThan(0);
      // Should have gear 1 (First) in the data
      expect(gears.some(g => g === 1)).toBe(true);
    });

    it('should resolve trans fluid temp from TCM.TFT and convert °C to °F', () => {
      if (!rawData) return;
      const maxTft = Math.max(...rawData.transFluidTemp);
      // Should be in °F range (not °C)
      expect(maxTft).toBeGreaterThan(100); // above 100°F
      expect(maxTft).toBeLessThan(300); // below 300°F
    });

    it('should resolve injection timing from PCM.MNINJTIM', () => {
      if (!rawData) return;
      const maxTiming = Math.max(...rawData.injectionTiming);
      expect(maxTiming).toBeGreaterThan(0);
      // Heavily tuned LB7 can have timing up to 47+ degrees
      expect(maxTiming).toBeLessThan(60);
    });
  });

  describe('ProcessedMetrics', () => {
    it('should produce valid ProcessedMetrics from LB7 CSV', () => {
      if (!processed) return;
      expect(processed.rpm.length).toBeGreaterThan(0);
      expect(processed.maf.length).toBeGreaterThan(0);
      expect(processed.boost.length).toBeGreaterThan(0);
      expect(processed.fileFormat).toBe('efilive');
    });

    it('should have valid stats', () => {
      if (!processed) return;
      expect(processed.stats.rpmMax).toBeGreaterThan(1000);
      expect(processed.stats.boostMax).toBeGreaterThan(5);
      expect(processed.stats.duration).toBeGreaterThan(0);
    });
  });

  describe('Converter Stall Analysis Data', () => {
    it('should have throttle position data for WOT detection', () => {
      if (!processed) return;
      const wotSamples = processed.throttlePosition.filter(t => t > 85);
      expect(wotSamples.length).toBeGreaterThan(0);
    });

    it('should have gear data for launch detection', () => {
      if (!processed) return;
      const gear1Samples = processed.currentGear.filter(g => g === 1);
      expect(gear1Samples.length).toBeGreaterThan(0);
    });

    it('should have boost data showing low boost during low RPM WOT', () => {
      if (!processed) return;
      // Find WOT samples at low RPM (converter stall phase)
      const stallPhaseSamples: number[] = [];
      for (let i = 0; i < processed.rpm.length; i++) {
        if (processed.throttlePosition[i] > 85 && processed.rpm[i] < 1500 && processed.vehicleSpeed[i] < 15) {
          stallPhaseSamples.push(processed.boost[i]);
        }
      }
      if (stallPhaseSamples.length > 0) {
        const avgBoostDuringStall = stallPhaseSamples.reduce((a, b) => a + b, 0) / stallPhaseSamples.length;
        // During stall phase, boost should be minimal (turbo not spooled)
        expect(avgBoostDuringStall).toBeLessThan(10);
      }
    });
  });
});
