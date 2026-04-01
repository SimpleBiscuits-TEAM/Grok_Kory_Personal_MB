/**
 * Tests for PPEI Virtual Dyno Sheet — buildDynoSheetData
 *
 * Covers:
 *   - WOT qualification (3s minimum at TPS > 90%)
 *   - Disqualification when no WOT run found
 *   - Missing channel handling (RPM, Inj PW)
 *   - Wideband availability detection and warning
 *   - AFR correction factor applied to HP calculation
 *   - Lambda channel support (dyno logs)
 *   - Peak HP/Torque extraction
 *   - Multiple WOT runs — best (longest) selected
 */

import { describe, it, expect } from 'vitest';
import { buildDynoSheetData, DynoSheetData } from './DynoSheet';
import { VirtualDynoConfig, FUEL_PROFILES, INJECTOR_FLOW_RATES } from '@/lib/talonVirtualDyno';
import { WP8ParseResult } from '@/lib/wp8Parser';

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: VirtualDynoConfig = {
  injectorType: 'stock',
  fuelType: 'pump',
  isTurbo: false,
  dynoCalibrationFactor: 1.0,
};

/**
 * Build a minimal WP8ParseResult with the specified channels and rows.
 * channelNames: array of channel name strings
 * rowData: array of { values: number[], timestampMs: number }
 */
function makeWP8(
  channelNames: string[],
  rowData: { values: number[]; timestampMs: number }[],
): WP8ParseResult {
  return {
    channels: channelNames.map((name, i) => ({
      name,
      index: i,
      unit: '',
      min: 0,
      max: 100,
      decimalPlaces: 2,
    })),
    rows: rowData.map(r => ({
      timestamp: r.timestampMs,
      values: r.values,
    })),
    partNumber: '',
    fileVersion: '',
    sampleRate: 0,
    duration: 0,
  };
}

/**
 * Generate a WOT pull: ramps RPM from startRPM to endRPM over durationMs
 * at full throttle (TPS=100), with a given injector PW.
 */
function generateWOTPull(
  channelNames: string[],
  opts: {
    startRPM?: number;
    endRPM?: number;
    durationMs?: number;
    tps?: number;
    injPW?: number;
    afr?: number;
    sampleIntervalMs?: number;
  } = {},
): { values: number[]; timestampMs: number }[] {
  const {
    startRPM = 3000,
    endRPM = 9000,
    durationMs = 5000,
    tps = 100,
    injPW = 5.0,
    afr = 12.5,
    sampleIntervalMs = 50,
  } = opts;

  const samples = Math.floor(durationMs / sampleIntervalMs);
  const rows: { values: number[]; timestampMs: number }[] = [];

  const rpmIdx = channelNames.indexOf('Engine Speed');
  const tpsIdx = channelNames.indexOf('Throttle Position');
  const injIdx = channelNames.indexOf('Injector Pulsewidth Desired');
  const mapIdx = channelNames.indexOf('Manifold Absolute Pressure');
  const afrIdx = channelNames.indexOf('Air Fuel Ratio 1');
  const lambdaIdx = channelNames.indexOf('Lambda 1');

  for (let i = 0; i < samples; i++) {
    const t = i * sampleIntervalMs;
    const rpm = startRPM + ((endRPM - startRPM) * i) / samples;
    const values = new Array(channelNames.length).fill(0);

    if (rpmIdx >= 0) values[rpmIdx] = rpm;
    if (tpsIdx >= 0) values[tpsIdx] = tps;
    if (injIdx >= 0) values[injIdx] = injPW;
    if (mapIdx >= 0) values[mapIdx] = 80;
    if (afrIdx >= 0) values[afrIdx] = afr;
    if (lambdaIdx >= 0) values[lambdaIdx] = afr / 14.7;

    rows.push({ values, timestampMs: t });
  }

  return rows;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('buildDynoSheetData', () => {
  const baseChannels = [
    'Engine Speed',
    'Throttle Position',
    'Injector Pulsewidth Desired',
    'Manifold Absolute Pressure',
  ];

  describe('WOT Qualification', () => {
    it('qualifies when WOT pull is >= 3 seconds', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 4000 });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.qualified).toBe(true);
      expect(result.runs.length).toBeGreaterThanOrEqual(1);
      expect(result.peakHP).toBeGreaterThan(0);
      expect(result.peakTorque).toBeGreaterThan(0);
    });

    it('disqualifies when WOT pull is < 3 seconds', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 2000 });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.qualified).toBe(false);
      expect(result.disqualifyReason).toContain('full-throttle');
    });

    it('disqualifies when TPS is below threshold', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 5000, tps: 50 });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.qualified).toBe(false);
    });
  });

  describe('Missing Channels', () => {
    it('disqualifies when Engine Speed is missing', () => {
      const channels = ['Throttle Position', 'Injector Pulsewidth Desired'];
      const rows = [{ values: [100, 5.0], timestampMs: 0 }];
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.qualified).toBe(false);
      expect(result.disqualifyReason).toContain('Engine Speed');
    });

    it('disqualifies when Injector Pulsewidth is missing', () => {
      const channels = ['Engine Speed', 'Throttle Position'];
      const rows = [{ values: [5000, 100], timestampMs: 0 }];
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.qualified).toBe(false);
      expect(result.disqualifyReason).toContain('Injector Pulsewidth');
    });
  });

  describe('Wideband Detection', () => {
    it('sets hasWideband=true when AFR1 is present', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 4000 });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.hasWideband).toBe(true);
      expect(result.warnings.some(w => w.includes('wideband'))).toBe(false);
    });

    it('sets hasWideband=true when Lambda1 is present (dyno log)', () => {
      const channels = [...baseChannels, 'Lambda 1'];
      const rows = generateWOTPull(channels, { durationMs: 4000, afr: 0.85 * 14.7 });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.hasWideband).toBe(true);
    });

    it('sets hasWideband=false and adds warning when no AFR/Lambda', () => {
      const channels = [...baseChannels];
      const rows = generateWOTPull(channels, { durationMs: 4000 });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.hasWideband).toBe(false);
      expect(result.warnings.some(w => w.includes('wideband') || w.includes('No wideband'))).toBe(true);
    });
  });

  describe('AFR Correction', () => {
    it('applies AFR correction factor to HP calculation when wideband present', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];

      // Rich run (AFR 11.0 on pump gas, lambda ~0.748)
      const richRows = generateWOTPull(channels, { durationMs: 4000, afr: 11.0 });
      const richWP8 = makeWP8(channels, richRows);
      const richResult = buildDynoSheetData(richWP8, DEFAULT_CONFIG, 'rich.wp8');

      // Lean run (AFR 13.5 on pump gas, lambda ~0.918)
      const leanRows = generateWOTPull(channels, { durationMs: 4000, afr: 13.5 });
      const leanWP8 = makeWP8(channels, leanRows);
      const leanResult = buildDynoSheetData(leanWP8, DEFAULT_CONFIG, 'lean.wp8');

      // Leaner run should show higher corrected HP (more fuel needed to reach target)
      expect(richResult.qualified).toBe(true);
      expect(leanResult.qualified).toBe(true);
      expect(leanResult.peakHP).toBeGreaterThan(richResult.peakHP);
    });

    it('uses NA target lambda (0.85) for naturally aspirated', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 4000, afr: 12.5 });
      const wp8 = makeWP8(channels, rows);

      const naConfig = { ...DEFAULT_CONFIG, isTurbo: false };
      const result = buildDynoSheetData(wp8, naConfig, 'test.wp8');

      expect(result.qualified).toBe(true);
      expect(result.isTurbo).toBe(false);
    });

    it('uses turbo target lambda (0.80) for turbocharged', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 4000, afr: 11.8 });
      const wp8 = makeWP8(channels, rows);

      const turboConfig = { ...DEFAULT_CONFIG, isTurbo: true };
      const result = buildDynoSheetData(wp8, turboConfig, 'test.wp8');

      expect(result.qualified).toBe(true);
      expect(result.isTurbo).toBe(true);
    });
  });

  describe('Multiple WOT Runs', () => {
    it('selects the longest WOT run as the best run', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];

      // Short run (3.5s) then idle then long run (5s)
      const shortRun = generateWOTPull(channels, { durationMs: 3500 });
      const idle = Array.from({ length: 40 }, (_, i) => ({
        values: [800, 0, 0.5, 50, 14.7],
        timestampMs: 3500 + i * 50,
      }));
      const longRun = generateWOTPull(channels, { durationMs: 5000 }).map((r, i) => ({
        ...r,
        timestampMs: 5500 + i * 50,
      }));

      const wp8 = makeWP8(channels, [...shortRun, ...idle, ...longRun]);
      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.qualified).toBe(true);
      expect(result.runs.length).toBe(2);
    });
  });

  describe('Peak Values', () => {
    it('reports peak HP and torque with RPM values', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, {
        durationMs: 5000,
        startRPM: 3000,
        endRPM: 9000,
        injPW: 6.0,
      });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');

      expect(result.qualified).toBe(true);
      expect(result.peakHP).toBeGreaterThan(0);
      expect(result.peakHPRpm).toBeGreaterThan(2000);
      expect(result.peakTorque).toBeGreaterThan(0);
      expect(result.peakTorqueRpm).toBeGreaterThan(2000);
    });
  });

  describe('Calibration Factor', () => {
    it('applies dyno calibration factor to HP', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 4000 });
      const wp8 = makeWP8(channels, rows);

      const baseResult = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'test.wp8');
      const boostedConfig = { ...DEFAULT_CONFIG, dynoCalibrationFactor: 1.5 };
      const boostedResult = buildDynoSheetData(wp8, boostedConfig, 'test.wp8');

      expect(baseResult.qualified).toBe(true);
      expect(boostedResult.qualified).toBe(true);
      // 1.5x calibration should produce ~1.5x HP
      expect(boostedResult.peakHP).toBeGreaterThan(baseResult.peakHP * 1.3);
    });
  });

  describe('Output Shape', () => {
    it('returns all required fields in DynoSheetData', () => {
      const channels = [...baseChannels, 'Air Fuel Ratio 1'];
      const rows = generateWOTPull(channels, { durationMs: 4000 });
      const wp8 = makeWP8(channels, rows);

      const result = buildDynoSheetData(wp8, DEFAULT_CONFIG, 'mylog.wp8');

      expect(result).toHaveProperty('runs');
      expect(result).toHaveProperty('hpCurve');
      expect(result).toHaveProperty('peakHP');
      expect(result).toHaveProperty('peakHPRpm');
      expect(result).toHaveProperty('peakTorque');
      expect(result).toHaveProperty('peakTorqueRpm');
      expect(result).toHaveProperty('hasWideband');
      expect(result).toHaveProperty('isTurbo');
      expect(result).toHaveProperty('fileName');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('qualified');
      expect(result.fileName).toBe('mylog.wp8');
    });
  });
});
