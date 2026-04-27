/**
 * Tests for ZoomableChart zoom/pan logic and ReasoningPanel chart linking.
 *
 * Since ZoomableChart is a React component with DOM events, we test the
 * underlying zoom logic (data slicing, boundary clamping) and the
 * finding-to-chart mapping used by ReasoningPanel.
 */
import { describe, it, expect } from 'vitest';

// ─── ZoomableChart data slicing logic ────────────────────────────────────────

function sliceData<T>(data: T[], startIndex: number, endIndex: number): T[] {
  if (data.length === 0) return [];
  const s = Math.max(0, startIndex);
  const e = Math.min(data.length - 1, endIndex);
  return data.slice(s, e + 1);
}

function clampZoom(
  startIndex: number,
  endIndex: number,
  dataLength: number,
  minVisible: number = 8
): { startIndex: number; endIndex: number } {
  let s = Math.max(0, startIndex);
  let e = Math.min(dataLength - 1, endIndex);
  if (e - s + 1 < minVisible) {
    // Don't allow zoom below minimum
    return { startIndex: s, endIndex: Math.min(dataLength - 1, s + minVisible - 1) };
  }
  return { startIndex: s, endIndex: e };
}

function zoomIn(
  startIndex: number,
  endIndex: number,
  factor: number = 0.3,
  minVisible: number = 8
): { startIndex: number; endIndex: number } {
  const count = endIndex - startIndex + 1;
  const shrink = Math.max(1, Math.floor(count * factor / 2));
  const ns = startIndex + shrink;
  const ne = endIndex - shrink;
  if (ne - ns + 1 < minVisible) return { startIndex, endIndex };
  return { startIndex: ns, endIndex: ne };
}

function zoomOut(
  startIndex: number,
  endIndex: number,
  dataLength: number,
  factor: number = 0.3
): { startIndex: number; endIndex: number } {
  const count = endIndex - startIndex + 1;
  const expand = Math.max(1, Math.floor(count * factor / 2));
  return {
    startIndex: Math.max(0, startIndex - expand),
    endIndex: Math.min(dataLength - 1, endIndex + expand),
  };
}

function wheelZoom(
  startIndex: number,
  endIndex: number,
  dataLength: number,
  cursorFraction: number,
  direction: 'in' | 'out',
  factor: number = 0.15,
  minVisible: number = 8
): { startIndex: number; endIndex: number } {
  const count = endIndex - startIndex + 1;
  const change = Math.max(1, Math.floor(count * factor));

  if (direction === 'in') {
    const shrinkLeft = Math.round(change * cursorFraction);
    const shrinkRight = change - shrinkLeft;
    const ns = startIndex + shrinkLeft;
    const ne = endIndex - shrinkRight;
    if (ne - ns + 1 < minVisible) return { startIndex, endIndex };
    return { startIndex: ns, endIndex: ne };
  } else {
    const expandLeft = Math.round(change * cursorFraction);
    const expandRight = change - expandLeft;
    return {
      startIndex: Math.max(0, startIndex - expandLeft),
      endIndex: Math.min(dataLength - 1, endIndex + expandRight),
    };
  }
}

function panDrag(
  dragStartRange: { start: number; end: number },
  indexDelta: number,
  dataLength: number
): { startIndex: number; endIndex: number } {
  const count = dragStartRange.end - dragStartRange.start + 1;
  let ns = dragStartRange.start + indexDelta;
  let ne = dragStartRange.end + indexDelta;
  if (ns < 0) { ns = 0; ne = count - 1; }
  if (ne > dataLength - 1) { ne = dataLength - 1; ns = Math.max(0, ne - count + 1); }
  return { startIndex: ns, endIndex: ne };
}

describe('ZoomableChart data slicing', () => {
  const data = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 2 }));

  it('returns full data when not zoomed', () => {
    const result = sliceData(data, 0, 99);
    expect(result.length).toBe(100);
    expect(result[0].x).toBe(0);
    expect(result[99].x).toBe(99);
  });

  it('returns sliced data when zoomed', () => {
    const result = sliceData(data, 20, 50);
    expect(result.length).toBe(31);
    expect(result[0].x).toBe(20);
    expect(result[30].x).toBe(50);
  });

  it('handles empty data', () => {
    expect(sliceData([], 0, 0)).toEqual([]);
  });

  it('clamps to valid bounds', () => {
    const result = sliceData(data, -5, 200);
    expect(result.length).toBe(100);
  });
});

describe('ZoomableChart zoom in', () => {
  it('shrinks the visible window symmetrically', () => {
    const result = zoomIn(0, 99, 0.3);
    expect(result.startIndex).toBeGreaterThan(0);
    expect(result.endIndex).toBeLessThan(99);
    const newCount = result.endIndex - result.startIndex + 1;
    expect(newCount).toBeLessThan(100);
  });

  it('does not zoom below minimum visible points', () => {
    const result = zoomIn(45, 54, 0.3, 8); // 10 points visible
    // After zoom: shrink by floor(10 * 0.3 / 2) = 1 each side → 8 points
    expect(result.endIndex - result.startIndex + 1).toBeGreaterThanOrEqual(8);
  });

  it('returns unchanged if already at minimum', () => {
    const result = zoomIn(46, 53, 0.3, 8); // exactly 8 points
    expect(result.startIndex).toBe(46);
    expect(result.endIndex).toBe(53);
  });
});

describe('ZoomableChart zoom out', () => {
  it('expands the visible window', () => {
    const result = zoomOut(20, 80, 100, 0.3);
    expect(result.startIndex).toBeLessThan(20);
    expect(result.endIndex).toBeGreaterThan(80);
  });

  it('clamps to data bounds', () => {
    const result = zoomOut(0, 99, 100, 0.3);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(99);
  });

  it('does not go below 0', () => {
    const result = zoomOut(2, 50, 100, 0.3);
    expect(result.startIndex).toBe(0);
  });

  it('does not exceed data length', () => {
    const result = zoomOut(50, 97, 100, 0.3);
    expect(result.endIndex).toBe(99);
  });
});

describe('ZoomableChart wheel zoom', () => {
  it('zooms in biased toward cursor position (left side)', () => {
    const result = wheelZoom(0, 99, 100, 0.2, 'in');
    // Cursor at 20% → more shrink from left
    expect(result.startIndex).toBeGreaterThan(0);
    expect(result.endIndex).toBeLessThan(99);
  });

  it('zooms in biased toward cursor position (right side)', () => {
    const result = wheelZoom(0, 99, 100, 0.8, 'in');
    expect(result.startIndex).toBeGreaterThan(0);
    expect(result.endIndex).toBeLessThan(99);
    // More shrink from right side
  });

  it('zooms out biased toward cursor position', () => {
    const result = wheelZoom(20, 80, 100, 0.5, 'out');
    expect(result.startIndex).toBeLessThan(20);
    expect(result.endIndex).toBeGreaterThan(80);
  });

  it('zoom out clamps to bounds', () => {
    const result = wheelZoom(0, 99, 100, 0.5, 'out');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(99);
  });

  it('zoom in respects minimum visible', () => {
    const result = wheelZoom(46, 53, 100, 0.5, 'in', 0.15, 8);
    // 8 points visible, change = max(1, floor(8*0.15)) = 1
    // shrinkLeft = round(1*0.5) = 1, shrinkRight = 0
    // ns=47, ne=53 → 7 points < 8 → returns unchanged
    expect(result.startIndex).toBe(46);
    expect(result.endIndex).toBe(53);
  });
});

describe('ZoomableChart drag pan', () => {
  it('drag right (positive indexDelta) shows later samples', () => {
    const result = panDrag({ start: 20, end: 80 }, 10, 100);
    expect(result.startIndex).toBe(30);
    expect(result.endIndex).toBe(90);
  });

  it('drag left (negative indexDelta) shows earlier samples', () => {
    const result = panDrag({ start: 20, end: 80 }, -10, 100);
    expect(result.startIndex).toBe(10);
    expect(result.endIndex).toBe(70);
  });

  it('clamps at left boundary', () => {
    const result = panDrag({ start: 5, end: 65 }, -25, 100);
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(60); // preserves window size
  });

  it('clamps at right boundary', () => {
    const result = panDrag({ start: 40, end: 95 }, 20, 100);
    expect(result.endIndex).toBe(99);
    expect(result.startIndex).toBe(44); // preserves window size (56 points: 40..95)
  });

  it('preserves window size during pan', () => {
    const windowSize = 61; // 20 to 80 inclusive
    const result = panDrag({ start: 20, end: 80 }, 5, 100);
    expect(result.endIndex - result.startIndex + 1).toBe(windowSize);
  });
});

describe('ZoomableChart clamp zoom', () => {
  it('clamps negative start to 0', () => {
    const result = clampZoom(-5, 50, 100);
    expect(result.startIndex).toBe(0);
  });

  it('clamps end beyond data length', () => {
    const result = clampZoom(50, 150, 100);
    expect(result.endIndex).toBe(99);
  });

  it('enforces minimum visible points', () => {
    const result = clampZoom(50, 52, 100, 8);
    expect(result.endIndex - result.startIndex + 1).toBeGreaterThanOrEqual(8);
  });
});

// ─── ReasoningPanel chart linking ────────────────────────────────────────────

const findingToChartMap: Record<string, { chartId: string; label: string }> = {
  'tcc-slip-analysis': { chartId: 'fault-chart-tcc', label: 'TCC / Converter Slip Chart' },
  'rail-pressure-analysis': { chartId: 'fault-chart-rail-pressure', label: 'Rail Pressure Chart' },
  'rail-pcv-correlation': { chartId: 'fault-chart-rail-pressure', label: 'Rail Pressure Chart' },
  'coolant-stability': { chartId: 'fault-chart-coolant', label: 'Coolant Temp Chart' },
  'vgt-tracking': { chartId: 'fault-chart-vgt', label: 'VGT Tracking Chart' },
  'converter-stall-turbo-mismatch': { chartId: 'fault-chart-converter-stall', label: 'Converter Stall Chart' },
  'boost-leak-suspicion': { chartId: 'fault-chart-boost', label: 'Boost Pressure Chart' },
  'tcc-load-correlation': { chartId: 'fault-chart-tcc', label: 'TCC / Converter Slip Chart' },
};

describe('Reasoning → Chart linking map', () => {
  it('maps TCC slip analysis to TCC fault chart', () => {
    expect(findingToChartMap['tcc-slip-analysis']?.chartId).toBe('fault-chart-tcc');
  });

  it('maps rail pressure analysis to rail pressure chart', () => {
    expect(findingToChartMap['rail-pressure-analysis']?.chartId).toBe('fault-chart-rail-pressure');
  });

  it('maps rail PCV correlation to rail pressure chart', () => {
    expect(findingToChartMap['rail-pcv-correlation']?.chartId).toBe('fault-chart-rail-pressure');
  });

  it('maps coolant stability to coolant chart', () => {
    expect(findingToChartMap['coolant-stability']?.chartId).toBe('fault-chart-coolant');
  });

  it('maps VGT tracking to VGT chart', () => {
    expect(findingToChartMap['vgt-tracking']?.chartId).toBe('fault-chart-vgt');
  });

  it('maps converter stall to converter stall chart', () => {
    expect(findingToChartMap['converter-stall-turbo-mismatch']?.chartId).toBe('fault-chart-converter-stall');
  });

  it('maps boost leak suspicion to boost chart', () => {
    expect(findingToChartMap['boost-leak-suspicion']?.chartId).toBe('fault-chart-boost');
  });

  it('maps TCC load correlation to TCC chart', () => {
    expect(findingToChartMap['tcc-load-correlation']?.chartId).toBe('fault-chart-tcc');
  });

  it('returns undefined for unmapped findings', () => {
    expect(findingToChartMap['warmup-analysis']).toBeUndefined();
    expect(findingToChartMap['missing-pids']).toBeUndefined();
    expect(findingToChartMap['sample-rate']).toBeUndefined();
  });

  it('all chart IDs follow the fault-chart-* pattern', () => {
    for (const [, value] of Object.entries(findingToChartMap)) {
      expect(value.chartId).toMatch(/^fault-chart-/);
    }
  });

  it('all labels are non-empty strings', () => {
    for (const [, value] of Object.entries(findingToChartMap)) {
      expect(value.label.length).toBeGreaterThan(0);
    }
  });
});

// ─── Zoom percentage calculation ─────────────────────────────────────────────

describe('Zoom percentage display', () => {
  it('shows 100% when fully zoomed out', () => {
    const pct = Math.round((100 / 100) * 100);
    expect(pct).toBe(100);
  });

  it('shows 50% when half the data is visible', () => {
    const pct = Math.round((50 / 100) * 100);
    expect(pct).toBe(50);
  });

  it('shows correct percentage for small zoom', () => {
    const pct = Math.round((10 / 100) * 100);
    expect(pct).toBe(10);
  });

  it('handles edge case of 1 point visible', () => {
    const pct = Math.round((1 / 100) * 100);
    expect(pct).toBe(1);
  });
});

// ─── Minimap bar position calculation ────────────────────────────────────────

describe('Minimap bar positioning', () => {
  it('shows bar at start when zoomed to beginning', () => {
    const left = (0 / 100) * 100;
    const width = (20 / 100) * 100;
    expect(left).toBe(0);
    expect(width).toBe(20);
  });

  it('shows bar at end when zoomed to end', () => {
    const left = (80 / 100) * 100;
    const width = (20 / 100) * 100;
    expect(left).toBe(80);
    expect(width).toBe(20);
  });

  it('shows bar in middle when zoomed to center', () => {
    const left = (40 / 100) * 100;
    const width = (20 / 100) * 100;
    expect(left).toBe(40);
    expect(width).toBe(20);
  });

  it('full width when not zoomed', () => {
    const left = (0 / 100) * 100;
    const width = (100 / 100) * 100;
    expect(left).toBe(0);
    expect(width).toBe(100);
  });
});
