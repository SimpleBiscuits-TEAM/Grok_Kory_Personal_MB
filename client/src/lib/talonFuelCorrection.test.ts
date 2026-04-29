/**
 * Tests for Honda Talon Fuel Table Correction Engine
 */
import { describe, it, expect } from 'vitest';
import {
  FuelMap, FuelMapState, CorrectionConfig,
  getNAAlphaNTargets, getNASpeedDensityTargets,
  getTurboStockMapTargets, getTurbo3BarMapTargets,
  getTurboAlphaNTargets, getTargetLambdaPreset,
  detectTurbo, computeCorrections, applyCorrectionToMap,
} from './talonFuelCorrection';
import { WP8ParseResult, WP8DataRow, WP8Channel } from './wp8Parser';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeFuelMap(opts: {
  rowAxis: number[];
  colAxis: number[];
  data: number[][];
  targetLambda?: number[];
  rowLabel?: string;
  colLabel?: string;
}): FuelMap {
  return {
    name: 'Test Map',
    description: 'Test',
    rowAxis: opts.rowAxis,
    colAxis: opts.colAxis,
    data: opts.data,
    targetLambda: opts.targetLambda || opts.colAxis.map(() => 0.85),
    rowLabel: opts.rowLabel || 'RPM',
    colLabel: opts.colLabel || 'TPS %',
    unit: 'ms',
  };
}

/** Build a minimal WP8ParseResult with specific channels and row data */
function makeWP8Data(opts: {
  channelNames: string[];
  rows: number[][];  // each inner array has one value per channel
}): WP8ParseResult {
  const channels: WP8Channel[] = opts.channelNames.map((name, i) => ({
    index: i,
    name,
    blockOffset: 0,
  }));

  const wp8Rows: WP8DataRow[] = opts.rows.map((vals, i) => ({
    timestamp: i * 100,
    values: new Float32Array(vals),
  }));

  return {
    magic: 0xFECEFACE,
    partNumber: '0801EB0401',
    channels,
    rows: wp8Rows,
    totalRows: wp8Rows.length,
    vehicleType: 'HONDA_TALON',
    rawSize: 1000,
  };
}

// ─── Target Lambda Preset Tests ─────────────────────────────────────────────

describe('Target Lambda Presets', () => {
  it('NA Alpha-N: 0-40 TPS = 0.95, 45 = 0.90, 50+ = 0.85', () => {
    const colAxis = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 100];
    const targets = getNAAlphaNTargets(colAxis);

    // 0-40 should be 0.95
    for (let i = 0; i <= 8; i++) {
      expect(targets[i]).toBe(0.95);
    }
    // 45 should be 0.90
    expect(targets[9]).toBe(0.90);
    // 50+ should be 0.85
    for (let i = 10; i < targets.length; i++) {
      expect(targets[i]).toBe(0.85);
    }
  });

  it('NA Speed Density: all columns = 0.95', () => {
    const colAxis = [20, 40, 60, 80, 100, 120, 140];
    const targets = getNASpeedDensityTargets(colAxis);
    targets.forEach(t => expect(t).toBe(0.95));
  });

  it('Turbo + Stock MAP: <100=0.95, 100-120=0.90, 120-145=0.85, >145=0.80', () => {
    const colAxis = [20, 40, 60, 80, 99, 100, 110, 120, 130, 145, 150, 200];
    const targets = getTurboStockMapTargets(colAxis);

    expect(targets[0]).toBe(0.95);  // 20
    expect(targets[1]).toBe(0.95);  // 40
    expect(targets[2]).toBe(0.95);  // 60
    expect(targets[3]).toBe(0.95);  // 80
    expect(targets[4]).toBe(0.95);  // 99
    expect(targets[5]).toBe(0.90);  // 100
    expect(targets[6]).toBe(0.90);  // 110
    expect(targets[7]).toBe(0.90);  // 120
    expect(targets[8]).toBe(0.85);  // 130
    expect(targets[9]).toBe(0.85);  // 145
    expect(targets[10]).toBe(0.80); // 150
    expect(targets[11]).toBe(0.80); // 200
  });

  it('Turbo + 3-Bar MAP: <60=0.95, 60-80=0.90, 80-90=0.85, >90=0.80', () => {
    const colAxis = [20, 40, 59, 60, 70, 80, 85, 90, 95, 100];
    const targets = getTurbo3BarMapTargets(colAxis);

    expect(targets[0]).toBe(0.95);  // 20
    expect(targets[1]).toBe(0.95);  // 40
    expect(targets[2]).toBe(0.95);  // 59
    expect(targets[3]).toBe(0.90);  // 60
    expect(targets[4]).toBe(0.90);  // 70
    expect(targets[5]).toBe(0.90);  // 80
    expect(targets[6]).toBe(0.85);  // 85
    expect(targets[7]).toBe(0.85);  // 90
    expect(targets[8]).toBe(0.80);  // 95
    expect(targets[9]).toBe(0.80);  // 100
  });

  it('Turbo Alpha-N: all columns = 0.95', () => {
    const colAxis = [0, 10, 20, 30, 40, 50, 60, 70, 80, 100];
    const targets = getTurboAlphaNTargets(colAxis);
    targets.forEach(t => expect(t).toBe(0.95));
  });

  it('getTargetLambdaPreset routes correctly for each mode/sensor combo', () => {
    const tpsAxis = [0, 10, 20, 30, 40, 45, 50, 60];
    const mapAxis = [20, 60, 100, 120, 145, 200];

    // NA Alpha-N
    const naAlpha = getTargetLambdaPreset('alphaN_cyl1', tpsAxis, { vehicleMode: 'na', mapSensor: 'stock' });
    expect(naAlpha[5]).toBe(0.90); // 45 TPS

    // NA SD
    const naSD = getTargetLambdaPreset('speedDensity_cyl1', mapAxis, { vehicleMode: 'na', mapSensor: 'stock' });
    naSD.forEach(t => expect(t).toBe(0.95));

    // Turbo + Stock MAP SD
    const turboStock = getTargetLambdaPreset('speedDensity_cyl2', mapAxis, { vehicleMode: 'turbo', mapSensor: 'stock' });
    expect(turboStock[0]).toBe(0.95);  // 20
    expect(turboStock[2]).toBe(0.90);  // 100
    expect(turboStock[4]).toBe(0.85);  // 145
    expect(turboStock[5]).toBe(0.80);  // 200

    // Turbo + 3-Bar MAP SD
    const turbo3bar = getTargetLambdaPreset('speedDensity_cyl1', [20, 60, 80, 90, 100], { vehicleMode: 'turbo', mapSensor: '3bar' });
    expect(turbo3bar[0]).toBe(0.95);  // 20
    expect(turbo3bar[1]).toBe(0.90);  // 60
    expect(turbo3bar[2]).toBe(0.90);  // 80
    expect(turbo3bar[3]).toBe(0.85);  // 90
    expect(turbo3bar[4]).toBe(0.80);  // 100
  });
});

// ─── Turbo Detection Tests ──────────────────────────────────────────────────

describe('Turbo Detection', () => {
  it('detects turbo when MAP > 100 kPa', () => {
    const wp8 = makeWP8Data({
      channelNames: ['Engine Speed', 'Manifold Absolute Pressure'],
      rows: [
        [3000, 80],
        [4000, 95],
        [5000, 105],  // > 100 kPa
        [6000, 90],
      ],
    });
    expect(detectTurbo(wp8)).toBe(true);
  });

  it('detects NA when MAP never exceeds 100 kPa', () => {
    const wp8 = makeWP8Data({
      channelNames: ['Engine Speed', 'Manifold Absolute Pressure'],
      rows: [
        [3000, 80],
        [4000, 95],
        [5000, 99],
        [6000, 90],
      ],
    });
    expect(detectTurbo(wp8)).toBe(false);
  });

  it('prefers MAP Corrected channel when available', () => {
    const wp8 = makeWP8Data({
      channelNames: ['Engine Speed', 'Manifold Absolute Pressure', 'Manifold Absolute Pressure Corrected'],
      rows: [
        [3000, 80, 110],  // raw MAP 80, corrected MAP 110 → turbo
      ],
    });
    expect(detectTurbo(wp8)).toBe(true);
  });

  it('returns false when no MAP channel exists', () => {
    const wp8 = makeWP8Data({
      channelNames: ['Engine Speed', 'Throttle Position'],
      rows: [[3000, 50]],
    });
    expect(detectTurbo(wp8)).toBe(false);
  });
});

// ─── Correction Engine Tests ────────────────────────────────────────────────

describe('Fuel Correction Engine', () => {
  // Simple 3x3 Alpha-N map
  const alphaNMap = makeFuelMap({
    rowAxis: [2000, 4000, 6000],
    colAxis: [20, 40, 60],
    data: [
      [5.0, 5.5, 6.0],
      [5.5, 6.0, 6.5],
      [6.0, 6.5, 7.0],
    ],
    targetLambda: [0.95, 0.95, 0.85],
    colLabel: 'TPS %',
  });

  // Simple 3x3 SD map
  const sdMap = makeFuelMap({
    rowAxis: [2000, 4000, 6000],
    colAxis: [40, 80, 120],
    data: [
      [4.0, 4.5, 5.0],
      [4.5, 5.0, 5.5],
      [5.0, 5.5, 6.0],
    ],
    targetLambda: [0.95, 0.95, 0.90],
    colLabel: 'MAP kPa',
  });

  it('corrects Alpha-N cells when Alpha N = 1', () => {
    // AFR = 14.7 → lambda = 1.0, target = 0.95 → factor = 1.0/0.95 = 1.0526
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // RPM, TPS, MAP, AFR1, AFR2, AlphaN, IPW
        [2000, 20, 80, 14.7, 14.7, 1, 5.0],   // Alpha-N active, cell [0][0]
        [2000, 20, 80, 14.7, 14.7, 1, 5.0],   // Same cell again
        [4000, 40, 80, 13.0, 13.5, 1, 6.0],   // Alpha-N active, cell [1][1]
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: alphaNMap,
      speedDensity_cyl1: sdMap,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.hasAfr1).toBe(true);
    expect(report.hasAfr2).toBe(true);
    expect(report.alphaNSamples).toBe(3);
    expect(report.sdSamples).toBe(0);

    // Alpha-N Cyl1 should have corrections
    const alphaCyl1 = report.results.find(r => r.mapKey === 'alphaN_cyl1');
    expect(alphaCyl1).toBeDefined();
    expect(alphaCyl1!.totalCellsCorrected).toBeGreaterThan(0);

    // Cell [0][0]: AFR1 = 14.7 → lambda = 1.0, target = 0.95, factor = 1.0/0.95
    const cell00 = alphaCyl1!.corrections.find(c => c.row === 0 && c.col === 0);
    expect(cell00).toBeDefined();
    expect(cell00!.sampleCount).toBe(2);
    expect(cell00!.avgActualLambda).toBeCloseTo(1.0, 2);
    expect(cell00!.correctionFactor).toBeCloseTo(1.0 / 0.95, 3);

    // SD maps should have NO corrections (all samples are Alpha-N)
    const sdCyl1 = report.results.find(r => r.mapKey === 'speedDensity_cyl1');
    expect(sdCyl1).toBeDefined();
    expect(sdCyl1!.totalCellsCorrected).toBe(0);
  });

  it('corrects SD cells when Alpha N ≠ 1', () => {
    // All samples in SD mode (alphaN = 0)
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        [2000, 20, 40, 14.0, 14.0, 0, 4.0],   // SD active, cell [0][0]
        [4000, 50, 80, 13.0, 13.0, 0, 5.0],   // SD active, cell [1][1]
        [6000, 70, 120, 12.5, 12.5, 0, 6.0],  // SD active, cell [2][2]
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: sdMap,
      speedDensity_cyl2: sdMap,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.sdSamples).toBe(3);
    expect(report.alphaNSamples).toBe(0);

    // SD Cyl1 should have corrections
    const sdCyl1 = report.results.find(r => r.mapKey === 'speedDensity_cyl1');
    expect(sdCyl1).toBeDefined();
    expect(sdCyl1!.totalCellsCorrected).toBe(3);

    // Alpha-N should have NO corrections
    const alphaCyl1 = report.results.find(r => r.mapKey === 'alphaN_cyl1');
    expect(alphaCyl1).toBeDefined();
    expect(alphaCyl1!.totalCellsCorrected).toBe(0);
  });

  it('AFR1 maps to Cyl1, AFR2 maps to Cyl2', () => {
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // AFR1 = 14.7 (lambda 1.0), AFR2 = 12.5 (lambda 0.85)
        [4000, 40, 80, 14.7, 12.5, 1, 6.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: alphaNMap,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const cyl1 = report.results.find(r => r.mapKey === 'alphaN_cyl1');
    const cyl2 = report.results.find(r => r.mapKey === 'alphaN_cyl2');

    // Cyl1 uses AFR1 = 14.7 → lambda 1.0
    const cyl1Cell = cyl1!.corrections[0];
    expect(cyl1Cell.avgActualLambda).toBeCloseTo(1.0, 2);

    // Cyl2 uses AFR2 = 12.5 → lambda 0.85
    const cyl2Cell = cyl2!.corrections[0];
    expect(cyl2Cell.avgActualLambda).toBeCloseTo(12.5 / 14.7, 2);
  });

  it('does not correct cells with no datalog samples', () => {
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // Only hits cell [0][0]
        [2000, 20, 80, 14.7, 14.7, 1, 5.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const result = report.results[0];
    // Only 1 cell should be corrected out of 9
    expect(result.totalCellsCorrected).toBe(1);
    expect(result.totalCellsInMap).toBe(9);
  });

  it('averages multiple samples per cell', () => {
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        [2000, 20, 80, 14.7, 14.7, 1, 5.0],  // lambda = 1.0
        [2000, 20, 80, 12.5, 12.5, 1, 5.0],  // lambda = 0.850
        [2000, 20, 80, 13.6, 13.6, 1, 5.0],  // lambda = 0.925
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const cell = report.results[0].corrections[0];
    expect(cell.sampleCount).toBe(3);
    // Average lambda = (1.0 + 0.850 + 0.925) / 3 ≈ 0.925
    const expectedAvg = (14.7 / 14.7 + 12.5 / 14.7 + 13.6 / 14.7) / 3;
    expect(cell.avgActualLambda).toBeCloseTo(expectedAvg, 3);
  });

  it('turbo mode uses desired injector pulsewidth for SD column lookup', () => {
    // SD Cyl1 map: row [1] (4000 RPM) has values [4.5, 5.0, 5.5]
    // If desired PW = 5.0, it should match column index 1 (MAP = 80 kPa)
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // RPM=4000, TPS=50, MAP=999 (should be ignored in turbo mode),
        // AFR1=14.7, AFR2=14.7, AlphaN=0, DesiredPW=5.0
        [4000, 50, 999, 14.7, 14.7, 0, 5.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: null,
      alphaN_cyl2: null,
      speedDensity_cyl1: sdMap,
      speedDensity_cyl2: sdMap,
    };

    const config: CorrectionConfig = { vehicleMode: 'turbo', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const sdCyl1 = report.results.find(r => r.mapKey === 'speedDensity_cyl1');
    expect(sdCyl1).toBeDefined();
    expect(sdCyl1!.totalCellsCorrected).toBe(1);

    // Should have matched row 1 (4000 RPM), col 1 (PW closest to 5.0)
    const cell = sdCyl1!.corrections[0];
    expect(cell.row).toBe(1);
    expect(cell.col).toBe(1);
  });
});

// ─── Apply Corrections Tests ────────────────────────────────────────────────

describe('Apply Corrections', () => {
  it('applies corrections to map data without modifying original', () => {
    const map = makeFuelMap({
      rowAxis: [2000, 4000],
      colAxis: [20, 40],
      data: [
        [5.0, 5.5],
        [5.5, 6.0],
      ],
    });

    const corrections = [
      {
        row: 0, col: 0,
        originalValue: 5.0, correctedValue: 5.25,
        correctionFactor: 1.05, sampleCount: 10,
        avgActualLambda: 0.89, targetLambda: 0.85,
      },
      {
        row: 1, col: 1,
        originalValue: 6.0, correctedValue: 5.7,
        correctionFactor: 0.95, sampleCount: 5,
        avgActualLambda: 0.81, targetLambda: 0.85,
      },
    ];

    const corrected = applyCorrectionToMap(map, corrections);

    // Corrected values applied
    expect(corrected.data[0][0]).toBe(5.25);
    expect(corrected.data[1][1]).toBe(5.7);

    // Uncorrected cells unchanged
    expect(corrected.data[0][1]).toBe(5.5);
    expect(corrected.data[1][0]).toBe(5.5);

    // Original map unchanged
    expect(map.data[0][0]).toBe(5.0);
    expect(map.data[1][1]).toBe(6.0);
  });
});

// ─── Deceleration Filter Tests ──────────────────────────────────────────────

describe('Deceleration Filter', () => {
  const alphaNMap = makeFuelMap({
    rowAxis: [2000, 4000, 6000],
    colAxis: [20, 40, 60],
    data: [
      [5.0, 5.5, 6.0],
      [5.5, 6.0, 6.5],
      [6.0, 6.5, 7.0],
    ],
    targetLambda: [0.95, 0.95, 0.85],
    colLabel: 'TPS %',
  });

  it('skips samples where TPS=0 and vehicle speed > 0 (deceleration) + post-decel buffer', () => {
    // Test data is sequential — after a decel event ends, the next 5 samples
    // (~0.5s at 10Hz) are also skipped due to AFR sensor transport delay.
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired', 'Vehicle Speed',
      ],
      rows: [
        // Normal sample: TPS=20, speed=30 → should be included
        [2000, 20, 80, 14.7, 14.7, 1, 5.0, 30],
        // Decel sample: TPS=0, speed=50 → SKIPPED (decel), buffer starts at 5
        [4000, 0, 80, 18.0, 18.0, 1, 6.0, 50],
        // Idle sample: TPS=0, speed=0 → NOT decel, but buffer=5 → SKIPPED (buffer)
        [2000, 0, 80, 14.7, 14.7, 1, 5.0, 0],
        // Another decel: TPS=0, speed=10 → SKIPPED (decel), buffer resets to 5
        [6000, 0, 80, 20.0, 20.0, 1, 7.0, 10],
        // Normal sample: TPS=40, speed=60 → buffer=5 → SKIPPED (buffer)
        [4000, 40, 80, 13.0, 13.0, 1, 6.0, 60],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    // 2 decel + 2 buffer = 4 total decel-skipped
    // (idle after decel is buffer-skipped, normal after 2nd decel is buffer-skipped)
    expect(report.decelSamplesSkipped).toBe(4);

    // Only 1 non-decel sample remains (the first normal sample before any decel)
    expect(report.alphaNSamples).toBe(1);

    // The Alpha-N map should only have corrections from the 1 valid sample
    const result = report.results[0];
    expect(result.totalSamplesUsed).toBe(1);
  });

  it('does not filter when vehicle speed channel is missing', () => {
    // No Vehicle Speed channel → decel filter cannot apply
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // TPS=0 but no speed channel → should NOT be filtered
        [2000, 0, 80, 14.7, 14.7, 1, 5.0],
        [4000, 20, 80, 13.0, 13.0, 1, 6.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.decelSamplesSkipped).toBe(0);
    expect(report.alphaNSamples).toBe(2);
  });
});

// ─── STFT Integration Tests ─────────────────────────────────────────────────

describe('STFT Integration', () => {
  const alphaNMap = makeFuelMap({
    rowAxis: [2000, 4000],
    colAxis: [20, 40],
    data: [
      [5.0, 5.5],
      [5.5, 6.0],
    ],
    targetLambda: [0.95, 0.95],
    colLabel: 'TPS %',
  });

  it('factors negative STFT into correction (ECU pulling fuel)', () => {
    // STFT = -10% means ECU is pulling 10% fuel
    // Measured AFR = 14.7, but without ECU correction it would have been:
    // true_afr = 14.7 / (1 + (-10)/100) = 14.7 / 0.9 = 16.33
    // true_lambda = 16.33 / 14.7 = 1.111
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired', 'Short Term Fuel Trim',
      ],
      rows: [
        [2000, 20, 80, 14.7, 14.7, 1, 5.0, -10],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.hasStft).toBe(true);

    const result = report.results[0];
    const cell = result.corrections[0];

    // true_afr = 14.7 / 0.9 = 16.333
    // true_lambda = 16.333 / 14.7 ≈ 1.111
    const expectedLambda = (14.7 / 0.9) / 14.7;
    expect(cell.avgActualLambda).toBeCloseTo(expectedLambda, 3);
    expect(cell.avgStft).toBe(-10);

    // Correction factor should be higher than without STFT
    // (table is too lean, needs more fuel)
    expect(cell.correctionFactor).toBeGreaterThan(1.0);
  });

  it('factors positive STFT into correction (ECU adding fuel)', () => {
    // STFT = +15% means ECU is adding 15% fuel
    // Measured AFR = 12.5, but without ECU correction:
    // true_afr = 12.5 / (1 + 15/100) = 12.5 / 1.15 = 10.87
    // true_lambda = 10.87 / 14.7 = 0.739
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired', 'Short Term Fuel Trim',
      ],
      rows: [
        [2000, 20, 80, 12.5, 12.5, 1, 5.0, 15],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const cell = report.results[0].corrections[0];

    const expectedLambda = (12.5 / 1.15) / 14.7;
    expect(cell.avgActualLambda).toBeCloseTo(expectedLambda, 3);
    expect(cell.avgStft).toBe(15);

    // Table is too rich, correction factor should be < 1
    expect(cell.correctionFactor).toBeLessThan(1.0);
  });

  it('works without STFT channel (no adjustment applied)', () => {
    // No STFT channel → correction should use raw AFR
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        [2000, 20, 80, 14.7, 14.7, 1, 5.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.hasStft).toBe(false);

    const cell = report.results[0].corrections[0];
    // Without STFT, lambda = 14.7 / 14.7 = 1.0
    expect(cell.avgActualLambda).toBeCloseTo(1.0, 3);
    expect(cell.avgStft).toBeUndefined();
  });

  it('averages STFT across multiple samples in same cell', () => {
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired', 'Short Term Fuel Trim',
      ],
      rows: [
        [2000, 20, 80, 14.7, 14.7, 1, 5.0, -5],   // STFT = -5%
        [2000, 20, 80, 14.7, 14.7, 1, 5.0, 10],    // STFT = +10%
        [2000, 20, 80, 14.7, 14.7, 1, 5.0, -3],    // STFT = -3%
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const cell = report.results[0].corrections[0];
    expect(cell.sampleCount).toBe(3);
    // Average STFT = (-5 + 10 + -3) / 3 = 0.667%
    expect(cell.avgStft).toBeCloseTo((-5 + 10 + -3) / 3, 2);
  });
});

// ─── Lambda Channel (Dyno Log) Tests ────────────────────────────────────────

describe('Lambda Channel Support (Dyno Logs)', () => {
  const alphaNMap = makeFuelMap({
    rowAxis: [2000, 4000, 6000],
    colAxis: [20, 40, 60],
    data: [
      [5.0, 5.5, 6.0],
      [5.5, 6.0, 6.5],
      [6.0, 6.5, 7.0],
    ],
    targetLambda: [0.95, 0.95, 0.85],
    colLabel: 'TPS %',
  });

  it('uses Lambda1/Lambda2 when AFR channels are absent (dyno log)', () => {
    // Dyno log: has Lambda1, Lambda2, Horsepower, Torque — no AFR channels
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Lambda 1', 'Lambda 2', 'Alpha N',
        'Injector Pulsewidth Desired', 'Horsepower', 'Torque',
      ],
      rows: [
        // Lambda1 = 1.0, Lambda2 = 0.85 (already lambda, no /14.7 needed)
        [4000, 40, 80, 1.0, 0.85, 1, 6.0, 150, 120],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: alphaNMap,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.lambdaSource).toBe('lambda');
    expect(report.isDynoLog).toBe(true);
    expect(report.hasLambda1).toBe(true);
    expect(report.hasLambda2).toBe(true);
    expect(report.hasAfr1).toBe(false);

    // Cyl1: Lambda1 = 1.0, target = 0.95, factor = 1.0/0.95
    const cyl1 = report.results.find(r => r.mapKey === 'alphaN_cyl1');
    expect(cyl1).toBeDefined();
    const cell1 = cyl1!.corrections[0];
    expect(cell1.avgActualLambda).toBeCloseTo(1.0, 3);
    expect(cell1.correctionFactor).toBeCloseTo(1.0 / 0.95, 3);

    // Cyl2: Lambda2 = 0.85, target = 0.95, factor = 0.85/0.95
    const cyl2 = report.results.find(r => r.mapKey === 'alphaN_cyl2');
    expect(cyl2).toBeDefined();
    const cell2 = cyl2!.corrections[0];
    expect(cell2.avgActualLambda).toBeCloseTo(0.85, 3);
    expect(cell2.correctionFactor).toBeCloseTo(0.85 / 0.95, 3);
  });

  it('does NOT divide lambda by 14.7 when using Lambda channels', () => {
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Lambda 1', 'Alpha N', 'Injector Pulsewidth Desired',
      ],
      rows: [
        // Lambda1 = 0.90 — should be used directly, NOT divided by 14.7
        [2000, 20, 80, 0.90, 1, 5.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const cell = report.results[0].corrections[0];
    // Should be 0.90, NOT 0.90/14.7 = 0.0612
    expect(cell.avgActualLambda).toBeCloseTo(0.90, 3);
  });

  it('prefers AFR over Lambda when both are present', () => {
    // If both AFR1 and Lambda1 exist, AFR1 takes priority
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Lambda 1', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // AFR1 = 14.7 (lambda 1.0), Lambda1 = 0.5 (should be ignored)
        [2000, 20, 80, 14.7, 0.5, 1, 5.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.lambdaSource).toBe('afr');
    const cell = report.results[0].corrections[0];
    // Should use AFR1: 14.7/14.7 = 1.0, NOT Lambda1 = 0.5
    expect(cell.avgActualLambda).toBeCloseTo(1.0, 3);
  });
});

// ─── Single-Sensor Fallback Tests ───────────────────────────────────────────

describe('Single-Sensor Fallback', () => {
  const alphaNMap = makeFuelMap({
    rowAxis: [2000, 4000],
    colAxis: [20, 40],
    data: [
      [5.0, 5.5],
      [5.5, 6.0],
    ],
    targetLambda: [0.95, 0.95],
    colLabel: 'TPS %',
  });

  it('uses AFR1 for both cylinders when AFR2 is missing', () => {
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Alpha N', 'Injector Pulsewidth Desired',
      ],
      rows: [
        // Only AFR1 = 14.7, no AFR2 channel at all
        [2000, 20, 80, 14.7, 1, 5.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: alphaNMap,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.hasAfr1).toBe(true);
    expect(report.hasAfr2).toBe(false);

    // Both cylinders should get corrections from AFR1
    const cyl1 = report.results.find(r => r.mapKey === 'alphaN_cyl1');
    const cyl2 = report.results.find(r => r.mapKey === 'alphaN_cyl2');
    expect(cyl1!.totalCellsCorrected).toBe(1);
    expect(cyl2!.totalCellsCorrected).toBe(1);

    // Both should have same lambda value (from AFR1)
    expect(cyl1!.corrections[0].avgActualLambda).toBeCloseTo(1.0, 3);
    expect(cyl2!.corrections[0].avgActualLambda).toBeCloseTo(1.0, 3);
  });

  it('uses Lambda1 for both cylinders when Lambda2 is missing (dyno log)', () => {
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Lambda 1', 'Alpha N', 'Injector Pulsewidth Desired',
        'Horsepower',
      ],
      rows: [
        // Only Lambda1 = 0.92, no Lambda2
        [2000, 20, 80, 0.92, 1, 5.0, 100],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: alphaNMap,
      alphaN_cyl2: alphaNMap,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    expect(report.lambdaSource).toBe('lambda');
    expect(report.hasLambda1).toBe(true);
    expect(report.hasLambda2).toBe(false);
    expect(report.isDynoLog).toBe(true);

    // Both cylinders should get corrections from Lambda1
    const cyl1 = report.results.find(r => r.mapKey === 'alphaN_cyl1');
    const cyl2 = report.results.find(r => r.mapKey === 'alphaN_cyl2');
    expect(cyl1!.totalCellsCorrected).toBe(1);
    expect(cyl2!.totalCellsCorrected).toBe(1);

    expect(cyl1!.corrections[0].avgActualLambda).toBeCloseTo(0.92, 3);
    expect(cyl2!.corrections[0].avgActualLambda).toBeCloseTo(0.92, 3);
  });
});

// ─── Tiered Correction Strategy Tests ─────────────────────────────────────────

describe('Tiered Correction Strategy', () => {
  // 5x5 map for testing neighbor patterns
  const bigMap = makeFuelMap({
    rowAxis: [2000, 3000, 4000, 5000, 6000],
    colAxis: [10, 20, 30, 40, 50],
    data: [
      [4.0, 4.5, 5.0, 5.5, 6.0],
      [4.5, 5.0, 5.5, 6.0, 6.5],
      [5.0, 5.5, 6.0, 6.5, 7.0],
      [5.5, 6.0, 6.5, 7.0, 7.5],
      [6.0, 6.5, 7.0, 7.5, 8.0],
    ],
    targetLambda: [0.95, 0.95, 0.95, 0.95, 0.95],
    colLabel: 'TPS %',
  });

  it('applies sandpaper (cell-by-cell) for errors ≤ 5%', () => {
    // AFR = 14.0 → lambda = 14.0/14.7 = 0.952, target = 0.95
    // Error = 0.952/0.95 - 1 = 0.002 = 0.2% → sandpaper
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        [3000, 20, 80, 14.0, 14.0, 1, 5.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: bigMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const result = report.results[0];
    expect(result.corrections.length).toBe(1);
    expect(result.corrections[0].tier).toBe('sandpaper');
    expect(result.tierCounts.sandpaper).toBe(1);
    expect(result.tierCounts.hammer_chisel).toBe(0);
    expect(result.tierCounts.outlier_capped).toBe(0);
  });

  it('applies hammer & chisel (regional averaging) for adjacent cells with >5% error', () => {
    // Create multiple samples hitting adjacent cells, all with ~10% lean error
    // AFR = 15.4 → lambda = 15.4/14.7 = 1.048, target = 0.95
    // Factor = 1.048/0.95 = 1.103 → 10.3% error → hammer & chisel
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // Cell [1,1] (3000 RPM, 20 TPS): 10% lean
        [3000, 20, 80, 15.4, 15.4, 1, 5.0],
        // Cell [1,2] (3000 RPM, 30 TPS): 12% lean
        [3000, 30, 80, 15.7, 15.7, 1, 5.5],
        // Cell [2,1] (4000 RPM, 20 TPS): 8% lean
        [4000, 20, 80, 15.1, 15.1, 1, 5.5],
        // Cell [2,2] (4000 RPM, 30 TPS): 11% lean
        [4000, 30, 80, 15.5, 15.5, 1, 6.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: bigMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const result = report.results[0];
    expect(result.corrections.length).toBe(4);

    // All should be hammer_chisel tier
    for (const corr of result.corrections) {
      expect(corr.tier).toBe('hammer_chisel');
    }
    expect(result.tierCounts.hammer_chisel).toBe(4);

    // All corrections in the group should have the SAME averaged factor
    const factors = result.corrections.map(c => c.correctionFactor);
    const avgFactor = factors.reduce((s, v) => s + v, 0) / factors.length;
    for (const f of factors) {
      expect(f).toBeCloseTo(avgFactor, 6);
    }

    // The raw factors should differ (they had different AFR values)
    const rawFactors = result.corrections.map(c => c.rawCorrectionFactor ?? c.correctionFactor);
    const uniqueRaw = new Set(rawFactors.map(f => f.toFixed(4)));
    expect(uniqueRaw.size).toBeGreaterThan(1);
  });

  it('caps outliers (>20% error, isolated) to neighbor average', () => {
    // One cell with extreme error surrounded by normal cells
    // Cell [2,2] (4000 RPM, 30 TPS): AFR = 18.0 → lambda = 1.224, factor = 1.289 → 28.9% lean
    // Neighbors: all normal (~0% error, factor ≈ 1.0)
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // Outlier cell [2,2]: extreme lean
        [4000, 30, 80, 18.0, 18.0, 1, 6.0],
        // Surrounding normal cells (AFR ≈ 14.0 → lambda ≈ 0.952 → factor ≈ 1.002)
        [3000, 20, 80, 14.0, 14.0, 1, 5.0],  // [1,1]
        [3000, 30, 80, 14.0, 14.0, 1, 5.5],  // [1,2]
        [3000, 40, 80, 14.0, 14.0, 1, 5.5],  // [1,3]
        [4000, 20, 80, 14.0, 14.0, 1, 5.5],  // [2,1]
        [4000, 40, 80, 14.0, 14.0, 1, 6.5],  // [2,3]
        [5000, 20, 80, 14.0, 14.0, 1, 6.0],  // [3,1]
        [5000, 30, 80, 14.0, 14.0, 1, 6.5],  // [3,2]
        [5000, 40, 80, 14.0, 14.0, 1, 6.5],  // [3,3]
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: bigMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const result = report.results[0];
    // Find the outlier cell [2,2]
    const outlierCell = result.corrections.find(c => c.row === 2 && c.col === 2);
    expect(outlierCell).toBeDefined();
    expect(outlierCell!.tier).toBe('outlier_capped');
    expect(outlierCell!.isOutlier).toBe(true);
    expect(outlierCell!.tierNote).toBeDefined();
    expect(outlierCell!.rawCorrectionFactor).toBeDefined();

    // Raw factor should be ~1.289 (28.9% lean)
    expect(outlierCell!.rawCorrectionFactor!).toBeGreaterThan(1.2);

    // Capped factor should be close to neighbor average (~1.002)
    expect(outlierCell!.correctionFactor).toBeLessThan(1.05);

    // Outlier note should exist
    expect(result.outlierNotes.length).toBeGreaterThan(0);
    const note = result.outlierNotes.find(n => n.row === 2 && n.col === 2);
    expect(note).toBeDefined();
    expect(note!.rawErrorPct).toBeGreaterThan(20);

    // Report-level outlier notes
    expect(report.outlierNotes.length).toBeGreaterThan(0);
  });

  it('does NOT cap cells with >20% error when neighbors show same pattern', () => {
    // All cells in a region are 25% lean → this is a real fueling issue, not an outlier
    // AFR = 17.5 → lambda = 1.190, factor = 1.253 → 25.3% lean
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // All cells in a 2x2 region are ~25% lean
        [3000, 20, 80, 17.5, 17.5, 1, 5.0],  // [1,1]
        [3000, 30, 80, 17.5, 17.5, 1, 5.5],  // [1,2]
        [4000, 20, 80, 17.5, 17.5, 1, 5.5],  // [2,1]
        [4000, 30, 80, 17.5, 17.5, 1, 6.0],  // [2,2]
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: bigMap,
      alphaN_cyl2: null,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const result = report.results[0];
    // None should be outlier_capped — they all agree, so it's hammer_chisel
    for (const corr of result.corrections) {
      expect(corr.tier).toBe('hammer_chisel');
      expect(corr.isOutlier).toBeFalsy();
    }
    expect(result.outlierNotes.length).toBe(0);
  });

  it('keeps cylinders independent (Cyl2 does not affect Cyl1 tiering)', () => {
    // Cyl1 has a single lean cell, Cyl2 has normal data in same position
    // The Cyl1 cell should still be evaluated independently
    const wp8 = makeWP8Data({
      channelNames: [
        'Engine Speed', 'Throttle Position', 'Manifold Absolute Pressure',
        'Air Fuel Ratio 1', 'Air Fuel Ratio 2', 'Alpha N',
        'Injector Pulsewidth Desired',
      ],
      rows: [
        // Cyl1 (AFR1) = 18.0 (extreme lean), Cyl2 (AFR2) = 14.0 (normal)
        [4000, 30, 80, 18.0, 14.0, 1, 6.0],
      ],
    });

    const fuelMaps: FuelMapState = {
      alphaN_cyl1: bigMap,
      alphaN_cyl2: bigMap,
      speedDensity_cyl1: null,
      speedDensity_cyl2: null,
    };

    const config: CorrectionConfig = { vehicleMode: 'na', mapSensor: 'stock' };
    const report = computeCorrections(fuelMaps, wp8, config);

    const cyl1 = report.results.find(r => r.mapKey === 'alphaN_cyl1');
    const cyl2 = report.results.find(r => r.mapKey === 'alphaN_cyl2');
    expect(cyl1).toBeDefined();
    expect(cyl2).toBeDefined();

    // Cyl1 has extreme error with no neighbors having data → can't fact-check
    // so it's treated as hammer_chisel (trusted, no capping)
    const cyl1Cell = cyl1!.corrections[0];
    expect(cyl1Cell.tier).toBe('hammer_chisel');

    // Cyl2 is normal → sandpaper
    const cyl2Cell = cyl2!.corrections[0];
    expect(cyl2Cell.tier).toBe('sandpaper');
  });
});
