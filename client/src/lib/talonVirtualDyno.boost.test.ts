/**
 * Test: Virtual Dyno turbo BSFC correction for Honda Talon with ID1050 injectors
 *
 * BSFC calibrated from 21 real Dynojet dyno runs (58,351 data points):
 *   - Turbo BSFC = 0.905 (median), NA BSFC = 0.45
 *   - Ratio = 2.01× (turbo engines burn more fuel per HP due to rich AFR targets)
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
  VirtualDynoConfig,
  FUEL_PROFILES,
  INJECTOR_FLOW_RATES,
} from './talonVirtualDyno';

// ─── Unit tests for estimateHPWithBoost ────────────────────────────────────

describe('estimateHPWithBoost', () => {
  const bsfc = 0.45; // pump gas NA BSFC

  it('returns same as estimateHP when isTurbo=false', () => {
    const fuelFlow = 5.0; // g/s
    const hpBase = estimateHP(fuelFlow, bsfc);
    const hpBoost = estimateHPWithBoost(fuelFlow, bsfc, false, 150);
    expect(hpBoost).toBeCloseTo(hpBase, 1);
  });

  it('returns LOWER HP when isTurbo=true (higher effective BSFC)', () => {
    // Turbo BSFC is 2.01× NA BSFC, so for the SAME fuel flow, turbo
    // produces LESS estimated HP. This is correct because turbo engines
    // burn more fuel per HP (rich AFR for cooling).
    const fuelFlow = 5.0;
    const hpNA = estimateHPWithBoost(fuelFlow, bsfc, false, 95);
    const hpTurbo = estimateHPWithBoost(fuelFlow, bsfc, true, 170);
    // Turbo HP should be about half of NA HP for same fuel flow
    // because BSFC is ~2× higher
    expect(hpTurbo).toBeLessThan(hpNA);
    expect(hpTurbo).toBeCloseTo(hpNA / 2.01, 0);
  });

  it('turbo correction is independent of MAP (BSFC-only)', () => {
    const fuelFlow = 5.0;
    const hpAt100 = estimateHPWithBoost(fuelFlow, bsfc, true, 100);
    const hpAt150 = estimateHPWithBoost(fuelFlow, bsfc, true, 150);
    const hpAt200 = estimateHPWithBoost(fuelFlow, bsfc, true, 200);
    // All should be the same — MAP doesn't affect the calculation
    expect(hpAt100).toBeCloseTo(hpAt150, 2);
    expect(hpAt150).toBeCloseTo(hpAt200, 2);
  });

  it('returns 0 for zero fuel flow', () => {
    expect(estimateHPWithBoost(0, bsfc, true, 200)).toBe(0);
  });

  it('returns 0 for zero BSFC', () => {
    expect(estimateHPWithBoost(5.0, 0, true, 200)).toBe(0);
  });

  it('turbo BSFC ratio matches calibration data (~2.01×)', () => {
    const fuelFlow = 5.0;
    const hpNA = estimateHPWithBoost(fuelFlow, bsfc, false, 100);
    const hpTurbo = estimateHPWithBoost(fuelFlow, bsfc, true, 100);
    const ratio = hpNA / hpTurbo;
    expect(ratio).toBeCloseTo(2.01, 1);
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

  it('computes virtual dyno with turbo+ID1050 config and gets realistic HP', () => {
    expect(wp8).not.toBeNull();

    const config: VirtualDynoConfig = {
      injectorType: 'id1050',
      fuelType: 'pump',
      isTurbo: true,
      dynoCalibrationFactor: 1.0,
    };

    const result = computeVirtualDyno(wp8!, config, 'PPEI_JR_ID1050s_93oct_Rev_0_7_0804580401_LOG_1.wp8');

    console.log('Peak HP:', result.peakHP, '@ RPM:', result.peakHPRpm);
    console.log('Peak Torque:', result.peakTorque, '@ RPM:', result.peakTorqueRpm);
    console.log('Warnings:', result.warnings);
    console.log('Confidence:', result.confidence);
    console.log('Data points:', result.dataPoints.length);

    // A turbo Talon with ID1050s should make 100-200 HP
    // Reference: 21 real dyno runs show 107-156 HP peak
    expect(result.peakHP).toBeGreaterThan(80);
    expect(result.peakHP).toBeLessThan(250);
  });

  it('NA config produces HIGHER HP than turbo for same fuel flow (higher BSFC = lower HP)', () => {
    expect(wp8).not.toBeNull();

    // With the same fuel flow data, NA config (lower BSFC) will estimate
    // higher HP than turbo config (higher BSFC). This is mathematically
    // correct: HP = FuelFlow / BSFC, so higher BSFC = lower HP.
    //
    // In reality, the turbo engine IS making more power — but the fuel
    // flow is also much higher (rich AFR + more air). The BSFC correction
    // accounts for the fact that turbo engines waste more fuel per HP.
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
      dynoCalibrationFactor: 1.0,
    };

    const naResult = computeVirtualDyno(wp8!, naConfig, 'test.wp8');
    const turboResult = computeVirtualDyno(wp8!, turboConfig, 'test.wp8');

    console.log('NA Peak HP (wrong for turbo data):', naResult.peakHP);
    console.log('Turbo Peak HP (correct BSFC):', turboResult.peakHP);

    // NA will show inflated numbers because it uses a lower BSFC
    expect(naResult.peakHP).toBeGreaterThan(turboResult.peakHP);
    // Turbo result should be in realistic range
    expect(turboResult.peakHP).toBeGreaterThan(80);
    expect(turboResult.peakHP).toBeLessThan(200);
  });
});
