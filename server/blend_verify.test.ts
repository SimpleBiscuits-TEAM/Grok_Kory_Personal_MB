import { describe, it, expect } from 'vitest';
import { blendCorrectedMap, FuelMap, CellCorrection } from '../client/src/lib/talonFuelCorrection';

describe('blendCorrectedMap corrected cell stability', () => {
  it('should NOT change corrected cell values when blend is applied', () => {
    const map: FuelMap = {
      name: 'test',
      description: 'test',
      rowAxis: [1000, 1100, 1200, 1300, 1400],
      colAxis: [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90],
      data: [
        [1.296, 1.296, 1.296, 1.296, 1.296, 1.296, 1.296, 1.418, 1.540, 1.655, 1.805, 1.959, 2.113, 2.507],
        [1.296, 1.296, 1.296, 1.296, 1.296, 1.296, 1.296, 1.418, 1.540, 1.635, 1.787, 1.946, 2.401, 2.583],
        [1.248, 1.248, 1.248, 1.248, 1.248, 1.248, 1.248, 1.382, 1.516, 1.626, 1.762, 1.888, 2.250, 2.490],
        [1.215, 1.215, 1.215, 1.215, 1.215, 1.215, 1.215, 1.365, 1.493, 1.603, 1.738, 1.862, 2.050, 2.200],
        [1.180, 1.180, 1.180, 1.180, 1.180, 1.180, 1.190, 1.343, 1.490, 1.603, 1.713, 1.906, 2.007, 2.256],
      ],
      targetLambda: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
      rowLabel: 'RPM',
      colLabel: 'MAP (kPa)',
      unit: 'ms',
    };

    const corrections: CellCorrection[] = [
      { row: 1, col: 12, originalValue: 2.401, correctedValue: 2.269, correctionFactor: 2.269/2.401, sampleCount: 100, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 12, originalValue: 2.250, correctedValue: 2.128, correctionFactor: 2.128/2.250, sampleCount: 80, avgActualLambda: 0.9, targetLambda: 0.95, tier: 'sandpaper' },
      { row: 2, col: 13, originalValue: 2.490, correctedValue: 2.416, correctionFactor: 2.416/2.490, sampleCount: 60, avgActualLambda: 0.92, targetLambda: 0.95, tier: 'sandpaper' },
    ];

    const blended = blendCorrectedMap(map, corrections);

    for (const c of corrections) {
      const blendedVal = blended.data[c.row][c.col];
      const expectedVal = map.data[c.row][c.col] * c.correctionFactor;
      console.log(`[${c.row},${c.col}] correctedValue=${c.correctedValue.toFixed(4)} blendedVal=${blendedVal.toFixed(4)} expected(map*factor)=${expectedVal.toFixed(4)}`);
      // The blended value for a corrected cell should equal originalMapValue * correctionFactor
      expect(Math.abs(blendedVal - expectedVal)).toBeLessThan(0.0001);
    }
  });
});
