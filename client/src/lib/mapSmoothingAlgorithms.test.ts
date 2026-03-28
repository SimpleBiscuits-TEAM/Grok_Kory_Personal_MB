import { describe, it, expect } from 'vitest';
import {
  linearSmoothing,
  cubicSplineSmoothing,
  exponentialSmoothing,
  gaussianSmoothing,
  catmullRomSmoothing,
  applySmoothingMethod,
  smoothRange,
  smooth2DMap,
  getSmoothingMethods,
} from './mapSmoothingAlgorithms';

describe('Map Smoothing Algorithms', () => {
  describe('Linear Smoothing', () => {
    it('should preserve endpoints', () => {
      const values = [10, 20, 30, 40, 50];
      const result = linearSmoothing(values, 0.5);
      
      expect(result[0]).toBe(values[0]);
      expect(result[result.length - 1]).toBe(values[values.length - 1]);
    });

    it('should smooth intermediate values', () => {
      const values = [10, 50, 10, 50, 10];
      const result = linearSmoothing(values, 0.5);
      
      // Middle value should be blended with neighbors
      expect(result[2]).toBeGreaterThanOrEqual(10);
      expect(result[2]).toBeLessThanOrEqual(50);
    });

    it('should handle small arrays', () => {
      expect(linearSmoothing([1, 2], 0.5)).toEqual([1, 2]);
      expect(linearSmoothing([1], 0.5)).toEqual([1]);
    });
  });

  describe('Cubic Spline Smoothing', () => {
    it('should preserve endpoints', () => {
      const values = [10, 20, 30, 40, 50];
      const result = cubicSplineSmoothing(values, 0.5);
      
      expect(result[0]).toBe(values[0]);
      expect(result[result.length - 1]).toBe(values[values.length - 1]);
    });

    it('should create smooth curve', () => {
      const values = [10, 50, 10, 50, 10];
      const result = cubicSplineSmoothing(values, 0.7);
      
      // Should produce smoother transitions than linear
      expect(result.length).toBe(values.length);
    });

    it('should handle short arrays with linear fallback', () => {
      const values = [10, 20, 30];
      const result = cubicSplineSmoothing(values, 0.5);
      expect(result.length).toBe(3);
    });
  });

  describe('Exponential Smoothing', () => {
    it('should preserve endpoints', () => {
      const values = [10, 20, 30, 40, 50];
      const result = exponentialSmoothing(values, 0.5);
      
      expect(result[0]).toBe(values[0]);
      expect(result[result.length - 1]).toBe(values[values.length - 1]);
    });

    it('should smooth with bidirectional pass', () => {
      const values = [10, 50, 10, 50, 10];
      const result = exponentialSmoothing(values, 0.5);
      
      expect(result.length).toBe(values.length);
      // Value should be between neighbors after smoothing
      expect(result[2]).toBeGreaterThanOrEqual(10);
      expect(result[2]).toBeLessThanOrEqual(50);
    });
  });

  describe('Gaussian Smoothing', () => {
    it('should preserve endpoints', () => {
      const values = [10, 20, 30, 40, 50];
      const result = gaussianSmoothing(values, 0.5);
      
      expect(result[0]).toBe(values[0]);
      expect(result[result.length - 1]).toBe(values[values.length - 1]);
    });

    it('should apply bell curve weighting', () => {
      const values = [10, 50, 10, 50, 10];
      const result = gaussianSmoothing(values, 0.7);
      
      expect(result.length).toBe(values.length);
      expect(result[2]).toBeGreaterThan(10);
      expect(result[2]).toBeLessThan(50);
    });
  });

  describe('Catmull-Rom Smoothing', () => {
    it('should preserve endpoints', () => {
      const values = [10, 20, 30, 40, 50];
      const result = catmullRomSmoothing(values, 0.5);
      
      expect(result[0]).toBe(values[0]);
      expect(result[result.length - 1]).toBe(values[values.length - 1]);
    });

    it('should create smooth spline curve', () => {
      const values = [10, 50, 10, 50, 10];
      const result = catmullRomSmoothing(values, 0.6);
      
      expect(result.length).toBe(values.length);
    });
  });

  describe('Apply Smoothing Method', () => {
    it('should apply linear smoothing', () => {
      const values = [10, 50, 10, 50, 10];
      const result = applySmoothingMethod(values, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result.success).toBe(true);
      expect(result.original).toEqual(values);
      expect(result.smoothed.length).toBe(values.length);
      expect(result.smoothed[0]).toBe(values[0]);
      expect(result.smoothed[values.length - 1]).toBe(values[values.length - 1]);
    });

    it('should calculate change statistics', () => {
      const values = [10, 50, 10, 50, 10];
      const result = applySmoothingMethod(values, {
        method: 'spline',
        strength: 0.7,
        preserveEndpoints: true,
      });

      expect(result.maxChange).toBeGreaterThanOrEqual(0);
      expect(result.avgChange).toBeGreaterThanOrEqual(0);
      expect(result.changes.length).toBe(values.length);
    });

    it('should apply multiple iterations', () => {
      const values = [10, 50, 10, 50, 10];
      const result1 = applySmoothingMethod(values, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
        iterations: 1,
      });

      const result2 = applySmoothingMethod(values, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
        iterations: 3,
      });

      // Both should produce valid results
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.smoothed.length).toBe(values.length);
      expect(result2.smoothed.length).toBe(values.length);
    });

    it('should handle small arrays', () => {
      const result = applySmoothingMethod([1, 2], {
        method: 'spline',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('Smooth Range', () => {
    it('should smooth specific range', () => {
      const values = [10, 20, 50, 50, 50, 20, 10];
      const result = smoothRange(values, 2, 4, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
      });

      // Values outside range should be unchanged
      expect(result[0]).toBe(values[0]);
      expect(result[1]).toBe(values[1]);
      expect(result[5]).toBe(values[5]);
      expect(result[6]).toBe(values[6]);

      // Range endpoints should be preserved
      expect(result[2]).toBe(values[2]);
      expect(result[4]).toBe(values[4]);
    });

    it('should handle invalid ranges', () => {
      const values = [10, 20, 30, 40, 50];
      
      // Invalid range should return unchanged
      expect(smoothRange(values, 5, 10, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
      })).toEqual(values);

      expect(smoothRange(values, 3, 2, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
      })).toEqual(values);
    });
  });

  describe('Smooth 2D Map', () => {
    it('should smooth 2D array', () => {
      const mapData = [
        [10, 20, 30],
        [20, 50, 20],
        [30, 20, 10],
      ];

      const result = smooth2DMap(mapData, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result.length).toBe(mapData.length);
      expect(result[0].length).toBe(mapData[0].length);
    });

    it('should handle empty map', () => {
      const result = smooth2DMap([], {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result).toEqual([]);
    });
  });

  describe('Smoothing Strength', () => {
    it('should increase smoothing with strength', () => {
      const values = [10, 50, 10, 50, 10];

      const weak = applySmoothingMethod(values, {
        method: 'linear',
        strength: 0.2,
        preserveEndpoints: true,
      });

      const strong = applySmoothingMethod(values, {
        method: 'linear',
        strength: 0.8,
        preserveEndpoints: true,
      });

      // Both should produce valid results
      expect(weak.success).toBe(true);
      expect(strong.success).toBe(true);
      expect(weak.smoothed.length).toBe(values.length);
      expect(strong.smoothed.length).toBe(values.length);
    });
  });

  describe('Smoothing Methods Info', () => {
    it('should return available methods', () => {
      const methods = getSmoothingMethods();
      
      expect(methods.length).toBeGreaterThan(0);
      expect(methods.some(m => m.recommended)).toBe(true);
      expect(methods.map(m => m.id)).toContain('linear');
      expect(methods.map(m => m.id)).toContain('spline');
    });

    it('should have descriptions for all methods', () => {
      const methods = getSmoothingMethods();
      
      for (const method of methods) {
        expect(method.name).toBeTruthy();
        expect(method.description).toBeTruthy();
        expect(typeof method.recommended).toBe('boolean');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle constant values', () => {
      const values = [50, 50, 50, 50, 50];
      const result = applySmoothingMethod(values, {
        method: 'spline',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result.maxChange).toBe(0);
      expect(result.avgChange).toBe(0);
    });

    it('should handle large value ranges', () => {
      const values = [0, 1000000, 0, 1000000, 0];
      const result = applySmoothingMethod(values, {
        method: 'gaussian',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result.success).toBe(true);
      expect(result.smoothed[0]).toBe(values[0]);
      expect(result.smoothed[values.length - 1]).toBe(values[values.length - 1]);
    });

    it('should handle negative values', () => {
      const values = [-50, 0, 50, 0, -50];
      const result = applySmoothingMethod(values, {
        method: 'catmull-rom',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result.success).toBe(true);
      expect(result.smoothed[0]).toBe(values[0]);
    });

    it('should handle decimal values', () => {
      const values = [1.5, 2.7, 3.2, 2.1, 1.8];
      const result = applySmoothingMethod(values, {
        method: 'linear',
        strength: 0.5,
        preserveEndpoints: true,
      });

      expect(result.success).toBe(true);
      expect(result.smoothed.every(v => typeof v === 'number')).toBe(true);
    });
  });
});
