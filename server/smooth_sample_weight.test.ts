import { describe, it, expect } from 'vitest';
import { smoothCorrectedMap, FuelMap, CellCorrection } from '../client/src/lib/talonFuelCorrection';

describe('smoothCorrectedMap sample-weighted neighbor influence', () => {
  // Create a 5x5 map where center cell has neighbors with DIFFERENT values
  // This lets us test whether high-sample neighbors pull the center more
  const asymmetricMap: FuelMap = {
    name: 'test',
    description: 'test',
    rowAxis: [1000, 1100, 1200, 1300, 1400],
    colAxis: [40, 50, 60, 70, 80],
    data: [
      [1.5, 1.5, 1.5, 1.5, 1.5],
      [1.5, 1.5, 1.2, 1.5, 1.5],  // [1,2] = 1.2 (low value neighbor)
      [1.5, 1.5, 1.8, 1.5, 1.5],  // [2,2] = 1.8 (center cell to smooth)
      [1.5, 1.5, 1.9, 1.5, 1.5],  // [3,2] = 1.9 (high value neighbor)
      [1.5, 1.5, 1.5, 1.5, 1.5],
    ],
    targetLambda: [0.95, 0.95, 0.95, 0.95, 0.95],
    rowLabel: 'RPM',
    colLabel: 'MAP (kPa)',
    unit: 'ms',
  };

  it('high-sample neighbors should exert MORE influence on expected value', () => {
    // Scenario A: The LOW neighbor [1,2]=1.2 has HIGH samples (500)
    //             The HIGH neighbor [3,2]=1.9 has LOW samples (10)
    // Expected: center pulled MORE toward 1.2 (low value) because that neighbor is more trusted
    const lowNeighborHighSamples: CellCorrection[] = [
      { row: 2, col: 2, originalValue: 1.5, correctedValue: 1.8, correctionFactor: 1.8/1.5, sampleCount: 50, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 1, col: 2, originalValue: 1.5, correctedValue: 1.2, correctionFactor: 1.2/1.5, sampleCount: 500, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 3, col: 2, originalValue: 1.5, correctedValue: 1.9, correctionFactor: 1.9/1.5, sampleCount: 10, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      // Side neighbors at 1.5 with moderate samples
      { row: 2, col: 1, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 50, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 3, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 50, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    // Scenario B: The LOW neighbor [1,2]=1.2 has LOW samples (10)
    //             The HIGH neighbor [3,2]=1.9 has HIGH samples (500)
    // Expected: center pulled MORE toward 1.9 (high value) because that neighbor is more trusted
    const highNeighborHighSamples: CellCorrection[] = [
      { row: 2, col: 2, originalValue: 1.5, correctedValue: 1.8, correctionFactor: 1.8/1.5, sampleCount: 50, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 1, col: 2, originalValue: 1.5, correctedValue: 1.2, correctionFactor: 1.2/1.5, sampleCount: 10, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 3, col: 2, originalValue: 1.5, correctedValue: 1.9, correctionFactor: 1.9/1.5, sampleCount: 500, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      // Side neighbors at 1.5 with moderate samples
      { row: 2, col: 1, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 50, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 3, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 50, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    const opts = { iterations: 1, deviationThreshold: 0.01, smoothingStrength: 0.6, smoothBlended: false };

    const resultA = smoothCorrectedMap(asymmetricMap, lowNeighborHighSamples, opts);
    const resultB = smoothCorrectedMap(asymmetricMap, highNeighborHighSamples, opts);

    const smoothedA = resultA.data[2][2];
    const smoothedB = resultB.data[2][2];

    console.log(`Scenario A (low neighbor=1.2 has 500 samples): center smoothed to ${smoothedA.toFixed(4)}`);
    console.log(`Scenario B (high neighbor=1.9 has 500 samples): center smoothed to ${smoothedB.toFixed(4)}`);

    // In scenario A, the 1.2 neighbor has more weight → expectedVal is pulled lower → center is pulled lower
    // In scenario B, the 1.9 neighbor has more weight → expectedVal is pulled higher → center stays higher
    expect(smoothedA).toBeLessThan(smoothedB);
  });

  it('should NOT smooth cells with >= 2x average sample count (high confidence protection)', () => {
    const uniformMap: FuelMap = {
      name: 'test', description: 'test',
      rowAxis: [1000, 1100, 1200, 1300, 1400],
      colAxis: [40, 50, 60, 70, 80],
      data: [
        [1.5, 1.5, 1.5, 1.5, 1.5],
        [1.5, 1.5, 1.5, 1.5, 1.5],
        [1.5, 1.5, 1.8, 1.5, 1.5],
        [1.5, 1.5, 1.5, 1.5, 1.5],
        [1.5, 1.5, 1.5, 1.5, 1.5],
      ],
      targetLambda: [0.95, 0.95, 0.95, 0.95, 0.95],
      rowLabel: 'RPM', colLabel: 'MAP (kPa)', unit: 'ms',
    };

    // Center cell has 1000 samples, neighbors have 100 each
    // avg = (1000+100+100+100+100)/5 = 280. Center has 1000 >= 280*2=560 → not smoothable
    const corrections: CellCorrection[] = [
      { row: 2, col: 2, originalValue: 1.5, correctedValue: 1.8, correctionFactor: 1.8/1.5, sampleCount: 1000, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 1, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 3, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 1, col: 2, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 3, col: 2, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    const result = smoothCorrectedMap(uniformMap, corrections, {
      iterations: 3,
      deviationThreshold: 0.01,
      smoothingStrength: 1.0,
      smoothBlended: false,
    });

    // Center cell should NOT be smoothed (too many samples = high confidence)
    expect(result.data[2][2]).toBe(1.8);
    expect(result.smoothedCells.has('2:2')).toBe(false);
  });

  it('cells with no sample data (blended/interpolated) should get reduced neighbor influence', () => {
    // Map where center deviates and neighbors are a mix of corrected (with samples) and uncorrected
    const mixedMap: FuelMap = {
      name: 'test', description: 'test',
      rowAxis: [1000, 1100, 1200, 1300, 1400],
      colAxis: [40, 50, 60, 70, 80],
      data: [
        [1.5, 1.5, 1.5, 1.5, 1.5],
        [1.5, 1.5, 1.4, 1.5, 1.5],  // [1,2] = 1.4 (corrected neighbor with samples)
        [1.5, 1.4, 1.8, 1.4, 1.5],  // [2,1] and [2,3] = 1.4 (no samples - blended)
        [1.5, 1.5, 1.4, 1.5, 1.5],  // [3,2] = 1.4 (corrected neighbor with samples)
        [1.5, 1.5, 1.5, 1.5, 1.5],
      ],
      targetLambda: [0.95, 0.95, 0.95, 0.95, 0.95],
      rowLabel: 'RPM', colLabel: 'MAP (kPa)', unit: 'ms',
    };

    // Only center and cardinal neighbors are corrected; side neighbors [2,1] and [2,3] have no correction entry
    // (they are blended cells with no sample count data)
    const withSampledNeighbors: CellCorrection[] = [
      { row: 2, col: 2, originalValue: 1.5, correctedValue: 1.8, correctionFactor: 1.8/1.5, sampleCount: 50, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 1, col: 2, originalValue: 1.5, correctedValue: 1.4, correctionFactor: 1.4/1.5, sampleCount: 200, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 3, col: 2, originalValue: 1.5, correctedValue: 1.4, correctionFactor: 1.4/1.5, sampleCount: 200, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    // All cardinal neighbors are corrected with high samples
    const allSampledNeighbors: CellCorrection[] = [
      { row: 2, col: 2, originalValue: 1.5, correctedValue: 1.8, correctionFactor: 1.8/1.5, sampleCount: 50, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 1, col: 2, originalValue: 1.5, correctedValue: 1.4, correctionFactor: 1.4/1.5, sampleCount: 200, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 3, col: 2, originalValue: 1.5, correctedValue: 1.4, correctionFactor: 1.4/1.5, sampleCount: 200, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 1, originalValue: 1.5, correctedValue: 1.4, correctionFactor: 1.4/1.5, sampleCount: 200, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 3, originalValue: 1.5, correctedValue: 1.4, correctionFactor: 1.4/1.5, sampleCount: 200, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    const opts = { iterations: 1, deviationThreshold: 0.01, smoothingStrength: 0.6, smoothBlended: false };

    const resultPartial = smoothCorrectedMap(mixedMap, withSampledNeighbors, opts);
    const resultFull = smoothCorrectedMap(mixedMap, allSampledNeighbors, opts);

    const smoothedPartial = resultPartial.data[2][2];
    const smoothedFull = resultFull.data[2][2];

    console.log(`Partial sampled neighbors: center smoothed to ${smoothedPartial.toFixed(4)}`);
    console.log(`All sampled neighbors: center smoothed to ${smoothedFull.toFixed(4)}`);

    // Both should be smoothed down from 1.8
    expect(smoothedPartial).toBeLessThan(1.8);
    expect(smoothedFull).toBeLessThan(1.8);

    // With all neighbors having high samples, the expected value is more strongly defined
    // so the center should be pulled more aggressively
    expect(smoothedFull).toBeLessThan(smoothedPartial);
  });

  it('center cell effective strength scales with its own sample ratio', () => {
    const uniformMap: FuelMap = {
      name: 'test', description: 'test',
      rowAxis: [1000, 1100, 1200, 1300, 1400],
      colAxis: [40, 50, 60, 70, 80],
      data: [
        [1.5, 1.5, 1.5, 1.5, 1.5],
        [1.5, 1.5, 1.5, 1.5, 1.5],
        [1.5, 1.5, 1.8, 1.5, 1.5],
        [1.5, 1.5, 1.5, 1.5, 1.5],
        [1.5, 1.5, 1.5, 1.5, 1.5],
      ],
      targetLambda: [0.95, 0.95, 0.95, 0.95, 0.95],
      rowLabel: 'RPM', colLabel: 'MAP (kPa)', unit: 'ms',
    };

    // Center has 150 samples (1.5x avg), neighbors have 100 each
    // avg = (150+100*4)/5 = 130. Center ratio = 150/130 = 1.15
    // effectiveStrength = 0.6 * min(1, max(0, 1-(1.15-1))) = 0.6 * 0.85 = 0.51
    const moderateCenter: CellCorrection[] = [
      { row: 2, col: 2, originalValue: 1.5, correctedValue: 1.8, correctionFactor: 1.8/1.5, sampleCount: 150, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 1, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 3, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 1, col: 2, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 3, col: 2, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    // Center has 50 samples (below avg), neighbors have 100 each
    // avg = (50+100*4)/5 = 90. Center ratio = 50/90 = 0.56
    // effectiveStrength = 0.6 * min(1, max(0, 1-(0.56-1))) = 0.6 * min(1, 1.44) = 0.6
    const lowCenter: CellCorrection[] = [
      { row: 2, col: 2, originalValue: 1.5, correctedValue: 1.8, correctionFactor: 1.8/1.5, sampleCount: 50, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 1, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 3, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 1, col: 2, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 3, col: 2, originalValue: 1.5, correctedValue: 1.5, correctionFactor: 1.0, sampleCount: 100, avgActualLambda: 0.95, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    const opts = { iterations: 1, deviationThreshold: 0.01, smoothingStrength: 0.6, smoothBlended: false };

    const resultModerate = smoothCorrectedMap(uniformMap, moderateCenter, opts);
    const resultLow = smoothCorrectedMap(uniformMap, lowCenter, opts);

    const smoothedModerate = resultModerate.data[2][2];
    const smoothedLow = resultLow.data[2][2];

    console.log(`Center 150 samples (above avg): smoothed to ${smoothedModerate.toFixed(4)}`);
    console.log(`Center 50 samples (below avg): smoothed to ${smoothedLow.toFixed(4)}`);

    // Center with more samples should resist smoothing more (stay closer to 1.8)
    // Center with fewer samples should be smoothed more (pulled closer to 1.5)
    expect(smoothedModerate).toBeGreaterThan(smoothedLow);

    // Both should be between 1.5 and 1.8
    expect(smoothedModerate).toBeLessThan(1.8);
    expect(smoothedModerate).toBeGreaterThan(1.5);
    expect(smoothedLow).toBeLessThan(1.8);
    expect(smoothedLow).toBeGreaterThan(1.5);
  });
});
