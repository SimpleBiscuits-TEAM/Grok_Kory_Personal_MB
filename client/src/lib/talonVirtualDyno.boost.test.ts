/**
 * Test: Virtual Dyno turbo BSFC correction for Honda Talon
 *
 * Calibrated from real Dynojet dyno runs:
 *   JR pump gas:    21 runs → turbo factor = 1.40
 *   JR ethanol:      2 runs → turbo factor = 1.83 (conservative timing)
 *   FP ethanol:     19 runs → turbo factor = 1.64 (proper timing)
 *   KW:             placeholder → estimated between JR and FP
 *
 * The correction is purely BSFC-based — no MAP multiplier needed because
 * the injector PW already reflects the actual fuel delivered under boost.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { parseWP8, getHondaTalonKeyChannels } from './wp8Parser';
import {
  calculateFuelFlow,
  estimateHP,
  estimateHPWithBoost,
  calculateTorque,
  computeVirtualDyno,
  detectTurboType,
  VirtualDynoConfig,
  FUEL_PROFILES,
  INJECTOR_FLOW_RATES,
  FuelType,
  TurboType,
} from './talonVirtualDyno';

// ─── Unit tests for estimateHPWithBoost ────────────────────────────────────

describe('estimateHPWithBoost', () => {
  const bsfc = 0.45; // pump gas NA BSFC

  it('returns same as estimateHP when turboType=na', () => {
    const fuelFlow = 5.0; // g/s
    const hpBase = estimateHP(fuelFlow, bsfc);
    const hpBoost = estimateHPWithBoost(fuelFlow, bsfc, 'na', 150);
    expect(hpBoost).toBeCloseTo(hpBase, 1);
  });

  it('returns LOWER HP when turboType=jr for pump gas (factor 1.40)', () => {
    const fuelFlow = 5.0;
    const hpNA = estimateHPWithBoost(fuelFlow, bsfc, 'na', 95, 'pump');
    const hpTurbo = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 170, 'pump');
    // Turbo HP should be ~71% of NA HP (1/1.40 = 0.714)
    expect(hpTurbo).toBeLessThan(hpNA);
    expect(hpTurbo).toBeCloseTo(hpNA / 1.40, 0);
  });

  it('returns LOWER HP when turboType=jr for E85 (factor 1.76)', () => {
    const fuelFlow = 5.0;
    const e85Bsfc = FUEL_PROFILES.e85.bsfc;
    const hpNA = estimateHPWithBoost(fuelFlow, e85Bsfc, 'na', 95, 'e85');
    const hpTurbo = estimateHPWithBoost(fuelFlow, e85Bsfc, 'jr', 170, 'e85');
    expect(hpTurbo).toBeLessThan(hpNA);
    expect(hpTurbo).toBeCloseTo(hpNA / 1.76, 0);
  });

  it('FP turbo has lower ethanol factor than JR (more efficient on ethanol)', () => {
    const fuelFlow = 5.0;
    const e85Bsfc = FUEL_PROFILES.e85.bsfc;
    const hpJR = estimateHPWithBoost(fuelFlow, e85Bsfc, 'jr', 150, 'e85');
    const hpFP = estimateHPWithBoost(fuelFlow, e85Bsfc, 'fp', 150, 'e85');
    // FP ethanol factor (1.64) < JR ethanol factor (1.76)
    // Lower factor = more HP per unit fuel flow = more efficient
    expect(hpFP).toBeGreaterThan(hpJR);
  });

  it('on pump gas, JR is more efficient than FP (lower pump factor)', () => {
    const fuelFlow = 5.0;
    const hpJR = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 150, 'pump');
    const hpFP = estimateHPWithBoost(fuelFlow, bsfc, 'fp', 150, 'pump');
    // JR pump factor (1.40) < FP pump factor (1.60)
    // This is because FP pump factor is estimated (no pump gas data yet)
    expect(hpJR).toBeGreaterThan(hpFP);
  });

  it('KW turbo factor falls between JR and FP', () => {
    const fuelFlow = 5.0;
    const hpJR = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 150, 'pump');
    const hpKW = estimateHPWithBoost(fuelFlow, bsfc, 'kw', 150, 'pump');
    const hpFP = estimateHPWithBoost(fuelFlow, bsfc, 'fp', 150, 'pump');
    // Higher BSFC factor = lower HP per unit fuel flow
    // JR (1.40) gives highest HP, FP (1.60) gives lowest HP, KW (1.50) in between
    expect(hpKW).toBeLessThan(hpJR);    // KW less efficient than JR on pump
    expect(hpKW).toBeGreaterThan(hpFP); // KW more efficient than FP on pump
  });

  it('E85 turbo factor is higher than pump gas turbo factor', () => {
    const fuelFlow = 5.0;
    const hpPumpTurbo = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 150, 'pump');
    const hpE85Turbo = estimateHPWithBoost(fuelFlow, FUEL_PROFILES.e85.bsfc, 'jr', 150, 'e85');
    // E85 turbo should produce less HP per unit fuel flow than pump gas turbo
    // because E85 has lower energy density AND higher turbo factor
    expect(hpE85Turbo).toBeLessThan(hpPumpTurbo);
  });

  it('IGNITE RED uses same turbo factor as E90 (both are ethanol)', () => {
    const fuelFlow = 5.0;
    const hpE90 = estimateHPWithBoost(fuelFlow, FUEL_PROFILES.e90.bsfc, 'jr', 150, 'e90');
    const hpIR = estimateHPWithBoost(fuelFlow, FUEL_PROFILES.ignite_red.bsfc, 'jr', 150, 'ignite_red');
    // IGNITE RED and E90 should produce identical results (same fuel profile + same turbo factor)
    expect(hpIR).toBeCloseTo(hpE90, 5);
  });

  it('turbo correction is independent of MAP (BSFC-only)', () => {
    const fuelFlow = 5.0;
    const hpAt100 = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 100, 'pump');
    const hpAt150 = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 150, 'pump');
    const hpAt200 = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 200, 'pump');
    expect(hpAt100).toBeCloseTo(hpAt150, 2);
    expect(hpAt150).toBeCloseTo(hpAt200, 2);
  });

  it('returns 0 for zero fuel flow', () => {
    expect(estimateHPWithBoost(0, bsfc, 'jr', 200)).toBe(0);
  });

  it('returns 0 for zero BSFC', () => {
    expect(estimateHPWithBoost(5.0, 0, 'jr', 200)).toBe(0);
  });

  it('JR pump gas turbo BSFC ratio matches calibration data (~1.40×)', () => {
    const fuelFlow = 5.0;
    const hpNA = estimateHPWithBoost(fuelFlow, bsfc, 'na', 100, 'pump');
    const hpTurbo = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 100, 'pump');
    const ratio = hpNA / hpTurbo;
    expect(ratio).toBeCloseTo(1.40, 1);
  });

  it('JR E85 turbo BSFC ratio matches calibration data (~1.76×)', () => {
    const fuelFlow = 5.0;
    const e85Bsfc = FUEL_PROFILES.e85.bsfc;
    const hpNA = estimateHPWithBoost(fuelFlow, e85Bsfc, 'na', 100, 'e85');
    const hpTurbo = estimateHPWithBoost(fuelFlow, e85Bsfc, 'jr', 100, 'e85');
    const ratio = hpNA / hpTurbo;
    expect(ratio).toBeCloseTo(1.76, 1);
  });

  it('FP ethanol turbo BSFC ratio matches calibration data (~1.64×)', () => {
    const fuelFlow = 5.0;
    const e85Bsfc = FUEL_PROFILES.e85.bsfc;
    const hpNA = estimateHPWithBoost(fuelFlow, e85Bsfc, 'na', 100, 'e85');
    const hpTurbo = estimateHPWithBoost(fuelFlow, e85Bsfc, 'fp', 100, 'e85');
    const ratio = hpNA / hpTurbo;
    expect(ratio).toBeCloseTo(1.64, 1);
  });

  it('default fuelType parameter uses pump gas factor', () => {
    const fuelFlow = 5.0;
    // Call without fuelType param (should default to pump)
    const hpDefault = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 150);
    const hpPump = estimateHPWithBoost(fuelFlow, bsfc, 'jr', 150, 'pump');
    expect(hpDefault).toBeCloseTo(hpPump, 5);
  });
});

// ─── detectTurboType tests ────────────────────────────────────────────────

describe('detectTurboType', () => {
  it('detects JR from filename with underscore separator', () => {
    expect(detectTurboType('PPEI_JR_ID1050s_93oct.wp8', '')).toBe('jr');
  });

  it('detects JR from filename with mixed case', () => {
    expect(detectTurboType('Kory_JR_IgniteRed.wp8', '')).toBe('jr');
  });

  it('detects JR from Jackson Racing in filename', () => {
    expect(detectTurboType('JacksonRacing_turbo.wp8', '')).toBe('jr');
  });

  it('detects FP from FPTurbo in filename', () => {
    expect(detectTurboType('FPTurbo_IgniteRed_ID1300s.wp8', '')).toBe('fp');
  });

  it('detects KW from Kraftwerks in filename', () => {
    expect(detectTurboType('Kraftwerks_pump_ID1050.wp8', '')).toBe('kw');
  });

  it('detects KW from KW abbreviation', () => {
    expect(detectTurboType('test_KW_turbo.wp8', '')).toBe('kw');
  });

  it('returns na for stock filename', () => {
    expect(detectTurboType('stock_talon_log.wp8', '')).toBe('na');
  });

  it('does not false-positive on partial matches', () => {
    // 'jr' inside a longer word should not match
    expect(detectTurboType('major_update.wp8', '')).toBe('na');
  });
});

// ─── IGNITE RED fuel profile tests ──────────────────────────────────────────

describe('IGNITE RED fuel profile', () => {
  it('IGNITE RED has same stoich AFR as E90 (ethanol, not gasoline)', () => {
    expect(FUEL_PROFILES.ignite_red.stoichAFR).toBe(FUEL_PROFILES.e90.stoichAFR);
  });

  it('IGNITE RED has same density as E90', () => {
    expect(FUEL_PROFILES.ignite_red.density).toBe(FUEL_PROFILES.e90.density);
  });

  it('IGNITE RED has same BSFC as E90', () => {
    expect(FUEL_PROFILES.ignite_red.bsfc).toBe(FUEL_PROFILES.e90.bsfc);
  });

  it('IGNITE RED stoich AFR is NOT gasoline range (must be < 10)', () => {
    // IGNITE RED is E90 — stoich should be ~9.5, NOT 14.0-14.7
    expect(FUEL_PROFILES.ignite_red.stoichAFR).toBeLessThan(10);
  });

  it('all ethanol fuels have stoich AFR below 10', () => {
    const ethanolFuels: FuelType[] = ['e85', 'e90', 'ignite_red'];
    for (const fuel of ethanolFuels) {
      expect(FUEL_PROFILES[fuel].stoichAFR).toBeLessThan(10);
    }
  });

  it('all gasoline fuels have stoich AFR above 14', () => {
    const gasFuels: FuelType[] = ['pump', 'utv96'];
    for (const fuel of gasFuels) {
      expect(FUEL_PROFILES[fuel].stoichAFR).toBeGreaterThan(14);
    }
  });
});

// ─── Integration test with real WP8 file ──────────────────────────────────

const TURBO_WP8_PATH = '/home/ubuntu/upload/PPEI_JR_ID1050s_93oct_Rev_0_7_0804580401_LOG_1.wp8';
const hasTurboFile = fs.existsSync(TURBO_WP8_PATH);

describe.skipIf(!hasTurboFile)('Turbo Talon ID1050 - real WP8 file', () => {
  let wp8: ReturnType<typeof parseWP8>;

  it('parses the WP8 file successfully', () => {
    const buffer = fs.readFileSync(TURBO_WP8_PATH);
    wp8 = parseWP8(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    expect(wp8).not.toBeNull();
    expect(wp8!.rows.length).toBeGreaterThan(100);
  });

  it('detects key channels', () => {
    expect(wp8).not.toBeNull();
    const keys = getHondaTalonKeyChannels(wp8!);
    expect(keys.engineSpeed).toBeGreaterThanOrEqual(0);
    expect(keys.throttlePosition).toBeGreaterThanOrEqual(0);
    expect(keys.injPwDesired >= 0 || keys.injPwFinal >= 0).toBe(true);
    expect(keys.map >= 0 || keys.mapCorrected >= 0).toBe(true);
  });

  it('computes virtual dyno with JR turbo+ID1050 config and gets realistic HP', () => {
    expect(wp8).not.toBeNull();

    const config: VirtualDynoConfig = {
      injectorType: 'id1050',
      fuelType: 'pump',
      isTurbo: true,
      turboType: 'jr',
      dynoCalibrationFactor: 1.0,
    };

    const result = computeVirtualDyno(wp8!, config, 'PPEI_JR_ID1050s_93oct_Rev_0_7_0804580401_LOG_1.wp8');

    console.log('Peak HP:', result.peakHP, '@ RPM:', result.peakHPRpm);
    console.log('Peak Torque:', result.peakTorque, '@ RPM:', result.peakTorqueRpm);

    // A JR turbo Talon with ID1050s on pump gas should make 130-200 HP
    expect(result.peakHP).toBeGreaterThan(100);
    expect(result.peakHP).toBeLessThan(250);
    // Specifically, this file makes ~165.8 HP on the dyno
    expect(result.peakHP).toBeGreaterThan(165.8 * 0.85);
    expect(result.peakHP).toBeLessThan(165.8 * 1.15);
  });

  it('NA config produces HIGHER HP than JR turbo for same fuel flow', () => {
    expect(wp8).not.toBeNull();

    const naConfig: VirtualDynoConfig = {
      injectorType: 'id1050',
      fuelType: 'pump',
      isTurbo: false,
      dynoCalibrationFactor: 1.0,
    };

    const turboConfig: VirtualDynoConfig = {
      injectorType: 'id1050',
      fuelType: 'pump',
      isTurbo: true,
      turboType: 'jr',
      dynoCalibrationFactor: 1.0,
    };

    const naResult = computeVirtualDyno(wp8!, naConfig, 'test.wp8');
    const turboResult = computeVirtualDyno(wp8!, turboConfig, 'test.wp8');

    // NA will show inflated numbers because it uses a lower BSFC
    expect(naResult.peakHP).toBeGreaterThan(turboResult.peakHP);
    // Turbo result should be in realistic range
    expect(turboResult.peakHP).toBeGreaterThan(100);
    expect(turboResult.peakHP).toBeLessThan(250);
  });
});

// ─── E85 reference file integration test ────────────────────────────────────

const E85_WP8_PATH = '/home/ubuntu/Kory_Talon_e85_JR_3bar_BRR_ID1050_Rev_1_3_Run_3.wp8';
const hasE85File = fs.existsSync(E85_WP8_PATH);

describe.skipIf(!hasE85File)('E85 Turbo Talon - real WP8 file', () => {
  let wp8: ReturnType<typeof parseWP8>;

  it('parses the E85 WP8 file', () => {
    const buffer = fs.readFileSync(E85_WP8_PATH);
    wp8 = parseWP8(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    expect(wp8.rows.length).toBeGreaterThan(100);
  });

  it('estimates HP within 15% of actual dyno peak (170.7 HP)', () => {
    const config: VirtualDynoConfig = {
      injectorType: 'id1050',
      fuelType: 'e85',
      isTurbo: true,
      turboType: 'jr',
      dynoCalibrationFactor: 1.0,
    };
    const result = computeVirtualDyno(wp8, config, 'Kory_Talon_e85_JR_3bar_BRR_ID1050_Rev_1_3_Run_3.wp8');
    console.log('E85 Estimated Peak HP:', result.peakHP, '(actual: 170.7)');
    // Actual dyno peak is 170.7 HP — allow 15% tolerance
    expect(result.peakHP).toBeGreaterThan(170.7 * 0.85);
    expect(result.peakHP).toBeLessThan(170.7 * 1.15);
  });
});

// ─── IGNITE RED reference file integration test ─────────────────────────────

const IR_WP8_PATH = '/home/ubuntu/Kory_JR_IgniteRed_ID1050_GravesSARemoved_Rev_1_8_Run_1.wp8';
const hasIRFile = fs.existsSync(IR_WP8_PATH);

describe.skipIf(!hasIRFile)('IGNITE RED Turbo Talon - real WP8 file', () => {
  let wp8: ReturnType<typeof parseWP8>;

  it('parses the IGNITE RED WP8 file', () => {
    const buffer = fs.readFileSync(IR_WP8_PATH);
    wp8 = parseWP8(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    expect(wp8.rows.length).toBeGreaterThan(100);
  });

  it('estimates HP within 15% of actual dyno peak (146.8 HP)', () => {
    const config: VirtualDynoConfig = {
      injectorType: 'id1050',
      fuelType: 'ignite_red',
      isTurbo: true,
      turboType: 'jr',
      dynoCalibrationFactor: 1.0,
    };
    const result = computeVirtualDyno(wp8, config, 'Kory_JR_IgniteRed_ID1050_GravesSARemoved_Rev_1_8_Run_1.wp8');
    console.log('IGNITE RED Estimated Peak HP:', result.peakHP, '(actual: 146.8)');
    // Actual dyno peak is 146.8 HP — allow 15% tolerance
    expect(result.peakHP).toBeGreaterThan(146.8 * 0.85);
    expect(result.peakHP).toBeLessThan(146.8 * 1.15);
  });
});
