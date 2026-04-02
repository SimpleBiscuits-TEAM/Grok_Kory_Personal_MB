/**
 * Map Smoothing and Blending Algorithms
 * 
 * Provides various smoothing techniques for calibration maps:
 * - Linear interpolation
 * - Cubic spline smoothing
 * - Exponential smoothing
 * - Gaussian blur
 * - Catmull-Rom spline
 * 
 * Preserves start and end points while smoothing intermediate values
 */

export type SmoothingMethod = 'linear' | 'spline' | 'exponential' | 'gaussian' | 'catmull-rom';

export interface SmoothingOptions {
  method: SmoothingMethod;
  strength: number; // 0-1, how aggressive the smoothing is
  preserveEndpoints: boolean; // Always true - never change start/end
  iterations?: number; // For iterative smoothing
}

export interface SmoothingResult {
  success: boolean;
  original: number[];
  smoothed: number[];
  changes: number[]; // Difference between original and smoothed
  maxChange: number;
  avgChange: number;
}

/**
 * Linear interpolation smoothing
 * Simple averaging between neighbors
 */
export function linearSmoothing(values: number[], strength: number = 0.5): number[] {
  if (values.length < 3) return [...values];

  const result = [...values];
  const window = Math.max(2, Math.ceil(strength * 5)); // 2-5 point window

  for (let i = 1; i < result.length - 1; i++) {
    let sum = 0;
    let count = 0;

    for (let j = Math.max(0, i - window); j <= Math.min(result.length - 1, i + window); j++) {
      if (j !== i) {
        sum += values[j];
        count++;
      }
    }

    result[i] = values[i] * (1 - strength) + (sum / count) * strength;
  }

  return result;
}

/**
 * Cubic spline smoothing
 * More sophisticated curve fitting
 */
export function cubicSplineSmoothing(values: number[], strength: number = 0.5): number[] {
  if (values.length < 4) return linearSmoothing(values, strength);

  const n = values.length;
  const h = new Array(n - 1);
  const alpha = new Array(n - 1);
  const l = new Array(n);
  const mu = new Array(n - 1);
  const z = new Array(n);
  const c = new Array(n);
  const b = new Array(n - 1);
  const d = new Array(n - 1);

  // Calculate differences
  for (let i = 0; i < n - 1; i++) {
    h[i] = 1; // Uniform spacing
  }

  // Tridiagonal matrix setup
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (values[i + 1] - values[i]) - (3 / h[i - 1]) * (values[i] - values[i - 1]);
  }

  l[0] = 1;
  mu[0] = 0;
  z[0] = 0;

  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (h[i - 1] + h[i]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  l[n - 1] = 1;
  z[n - 1] = 0;
  c[n - 1] = 0;

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (values[j + 1] - values[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  // Interpolate smoothed values
  const result = [...values];
  for (let i = 1; i < n - 1; i++) {
    const t = 0.5; // Mid-point interpolation
    result[i] = values[i] * (1 - strength) +
      (values[i] + b[i - 1] * t + c[i - 1] * t * t + d[i - 1] * t * t * t) * strength;
  }

  return result;
}

/**
 * Exponential smoothing (Holt-Winters style)
 * Weighted average giving more weight to recent values
 */
export function exponentialSmoothing(values: number[], strength: number = 0.5): number[] {
  if (values.length < 3) return [...values];

  const result = [...values];
  const alpha = strength; // Smoothing factor

  for (let i = 1; i < result.length - 1; i++) {
    const prevSmoothed = i === 1 ? values[0] : result[i - 1];
    result[i] = alpha * values[i] + (1 - alpha) * prevSmoothed;
  }

  // Reverse pass for bidirectional smoothing
  for (let i = result.length - 2; i > 0; i--) {
    const nextSmoothed = i === result.length - 2 ? values[result.length - 1] : result[i + 1];
    result[i] = (result[i] + nextSmoothed) / 2;
  }

  return result;
}

/**
 * Gaussian blur smoothing
 * Weighted average using Gaussian kernel
 */
export function gaussianSmoothing(values: number[], strength: number = 0.5): number[] {
  if (values.length < 3) return [...values];

  const result = [...values];
  const sigma = strength * 2 + 0.5; // 0.5 to 2.5
  const radius = Math.ceil(sigma * 2);

  for (let i = 1; i < result.length - 1; i++) {
    let sum = 0;
    let weightSum = 0;

    for (let j = Math.max(0, i - radius); j <= Math.min(result.length - 1, i + radius); j++) {
      const distance = Math.abs(i - j);
      const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      sum += values[j] * weight;
      weightSum += weight;
    }

    result[i] = sum / weightSum;
  }

  return result;
}

/**
 * Catmull-Rom spline smoothing
 * Smooth curve through control points
 */
export function catmullRomSmoothing(values: number[], strength: number = 0.5): number[] {
  if (values.length < 4) return linearSmoothing(values, strength);

  const result = [...values];
  const tension = strength;

  for (let i = 1; i < result.length - 1; i++) {
    const p0 = i > 1 ? values[i - 2] : values[i - 1];
    const p1 = values[i - 1];
    const p2 = values[i];
    const p3 = i < result.length - 2 ? values[i + 2] : values[i + 1];

    // Catmull-Rom basis at t=0.5
    const t = 0.5;
    const t2 = t * t;
    const t3 = t2 * t;

    const q = 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );

    result[i] = values[i] * (1 - strength) + q * strength;
  }

  return result;
}

/**
 * Apply smoothing with specified method
 */
export function applySmoothingMethod(
  values: number[],
  options: SmoothingOptions
): SmoothingResult {
  if (values.length < 3) {
    return {
      success: false,
      original: values,
      smoothed: values,
      changes: new Array(values.length).fill(0),
      maxChange: 0,
      avgChange: 0,
    };
  }

  let smoothed: number[];

  switch (options.method) {
    case 'linear':
      smoothed = linearSmoothing(values, options.strength);
      break;
    case 'spline':
      smoothed = cubicSplineSmoothing(values, options.strength);
      break;
    case 'exponential':
      smoothed = exponentialSmoothing(values, options.strength);
      break;
    case 'gaussian':
      smoothed = gaussianSmoothing(values, options.strength);
      break;
    case 'catmull-rom':
      smoothed = catmullRomSmoothing(values, options.strength);
      break;
    default:
      smoothed = [...values];
  }

  // Apply iterations if specified
  if (options.iterations && options.iterations > 1) {
    for (let i = 1; i < options.iterations; i++) {
      smoothed = applySmoothingMethod(smoothed, { ...options, iterations: 1 }).smoothed;
    }
  }

  // Preserve endpoints
  if (options.preserveEndpoints) {
    smoothed[0] = values[0];
    smoothed[smoothed.length - 1] = values[values.length - 1];
  }

  // Calculate statistics
  const changes = smoothed.map((v, i) => Math.abs(v - values[i]));
  const maxChange = Math.max(...changes);
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;

  return {
    success: true,
    original: values,
    smoothed,
    changes,
    maxChange,
    avgChange,
  };
}

/**
 * Smooth a specific range in an array, preserving endpoints
 */
export function smoothRange(
  values: number[],
  startIndex: number,
  endIndex: number,
  options: SmoothingOptions
): number[] {
  if (startIndex < 0 || endIndex >= values.length || startIndex >= endIndex) {
    return [...values];
  }

  // Extract range
  const range = values.slice(startIndex, endIndex + 1);

  // Apply smoothing
  const result = applySmoothingMethod(range, options);

  // Merge back
  const output = [...values];
  for (let i = 0; i < result.smoothed.length; i++) {
    output[startIndex + i] = result.smoothed[i];
  }

  return output;
}

/**
 * Smooth 2D map data (rows and columns)
 */
export function smooth2DMap(
  mapData: number[][],
  options: SmoothingOptions
): number[][] {
  if (!mapData || mapData.length === 0) return mapData;

  const result = mapData.map(row => [...row]);

  // Smooth rows
  for (let i = 0; i < result.length; i++) {
    const smoothed = applySmoothingMethod(result[i], options);
    result[i] = smoothed.smoothed;
  }

  // Smooth columns
  for (let j = 0; j < result[0].length; j++) {
    const column = result.map(row => row[j]);
    const smoothed = applySmoothingMethod(column, options);
    for (let i = 0; i < result.length; i++) {
      result[i][j] = smoothed.smoothed[i];
    }
  }

  return result;
}

/**
 * Get available smoothing methods with descriptions
 */
export function getSmoothingMethods(): Array<{
  id: SmoothingMethod;
  name: string;
  description: string;
  recommended: boolean;
}> {
  return [
    {
      id: 'linear',
      name: 'Linear',
      description: 'Simple averaging - fastest, good for gentle smoothing',
      recommended: true,
    },
    {
      id: 'spline',
      name: 'Cubic Spline',
      description: 'Smooth curves through points - best for most calibration work',
      recommended: true,
    },
    {
      id: 'exponential',
      name: 'Exponential',
      description: 'Weighted average - good for trending data',
      recommended: false,
    },
    {
      id: 'gaussian',
      name: 'Gaussian Blur',
      description: 'Bell curve weighting - smooth and natural',
      recommended: true,
    },
    {
      id: 'catmull-rom',
      name: 'Catmull-Rom',
      description: 'Advanced spline - excellent for smooth transitions',
      recommended: true,
    },
  ];
}
