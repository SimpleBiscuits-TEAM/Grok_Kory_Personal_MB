import { describe, it, expect } from 'vitest';
import { computeTraceStats, filterReadingsByTimeWindow, computeVisibleRange, clampViewport, ViewportState } from './LiveChart';
import type { PIDReading } from '@/lib/obdConnection';

function makeReading(pid: number, value: number, timestamp: number): PIDReading {
  return { pid, value, timestamp, raw: '' };
}

// ─── computeTraceStats ────────────────────────────────────────────────────

describe('computeTraceStats', () => {
  it('returns zeros for empty readings', () => {
    const stats = computeTraceStats([]);
    expect(stats).toEqual({ min: 0, max: 0, avg: 0, current: 0 });
  });

  it('computes correct stats for a single reading', () => {
    const readings = [makeReading(0x0C, 2500, Date.now())];
    const stats = computeTraceStats(readings);
    expect(stats.min).toBe(2500);
    expect(stats.max).toBe(2500);
    expect(stats.avg).toBe(2500);
    expect(stats.current).toBe(2500);
  });

  it('computes correct stats for multiple readings', () => {
    const readings = [
      makeReading(0x0C, 1000, Date.now() - 3000),
      makeReading(0x0C, 2000, Date.now() - 2000),
      makeReading(0x0C, 3000, Date.now() - 1000),
      makeReading(0x0C, 4000, Date.now()),
    ];
    const stats = computeTraceStats(readings);
    expect(stats.min).toBe(1000);
    expect(stats.max).toBe(4000);
    expect(stats.avg).toBe(2500);
    expect(stats.current).toBe(4000);
  });

  it('handles negative values correctly', () => {
    const readings = [
      makeReading(0x06, -5.5, Date.now() - 1000),
      makeReading(0x06, 3.2, Date.now()),
    ];
    const stats = computeTraceStats(readings);
    expect(stats.min).toBe(-5.5);
    expect(stats.max).toBe(3.2);
    expect(stats.current).toBe(3.2);
  });

  it('uses last reading as current value', () => {
    const readings = [
      makeReading(0x0C, 5000, Date.now() - 2000),
      makeReading(0x0C, 3000, Date.now() - 1000),
      makeReading(0x0C, 750, Date.now()),
    ];
    const stats = computeTraceStats(readings);
    expect(stats.current).toBe(750);
  });
});

// ─── filterReadingsByTimeWindow ───────────────────────────────────────────

describe('filterReadingsByTimeWindow', () => {
  it('returns all readings when window is -1 (ALL)', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 1000, now - 600000),
      makeReading(0x0C, 2000, now - 300000),
      makeReading(0x0C, 3000, now - 1000),
    ];
    const filtered = filterReadingsByTimeWindow(readings, -1);
    expect(filtered.length).toBe(3);
  });

  it('returns empty array for empty input', () => {
    const filtered = filterReadingsByTimeWindow([], 30);
    expect(filtered.length).toBe(0);
  });

  it('filters readings within 10-second window', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 1000, now - 30000),
      makeReading(0x0C, 2000, now - 15000),
      makeReading(0x0C, 3000, now - 8000),
      makeReading(0x0C, 4000, now - 3000),
      makeReading(0x0C, 5000, now - 500),
    ];
    const filtered = filterReadingsByTimeWindow(readings, 10);
    expect(filtered.length).toBe(3);
    expect(filtered[0].value).toBe(3000);
    expect(filtered[2].value).toBe(5000);
  });

  it('filters readings within 30-second window', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 1000, now - 60000),
      makeReading(0x0C, 2000, now - 25000),
      makeReading(0x0C, 3000, now - 10000),
    ];
    const filtered = filterReadingsByTimeWindow(readings, 30);
    expect(filtered.length).toBe(2);
    expect(filtered[0].value).toBe(2000);
  });

  it('filters readings within 5-minute window', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 1000, now - 600000),
      makeReading(0x0C, 2000, now - 240000),
      makeReading(0x0C, 3000, now - 60000),
      makeReading(0x0C, 4000, now - 1000),
    ];
    const filtered = filterReadingsByTimeWindow(readings, 300);
    expect(filtered.length).toBe(3);
    expect(filtered[0].value).toBe(2000);
  });

  it('preserves reading order after filtering', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 100, now - 5000),
      makeReading(0x0C, 200, now - 4000),
      makeReading(0x0C, 300, now - 3000),
      makeReading(0x0C, 400, now - 2000),
      makeReading(0x0C, 500, now - 1000),
    ];
    const filtered = filterReadingsByTimeWindow(readings, 10);
    expect(filtered.length).toBe(5);
    for (let i = 1; i < filtered.length; i++) {
      expect(filtered[i].timestamp).toBeGreaterThan(filtered[i - 1].timestamp);
    }
  });
});

// ─── computeVisibleRange ──────────────────────────────────────────────────

describe('computeVisibleRange', () => {
  const dataMin = 1000;
  const dataMax = 11000; // 10s range

  it('returns full range at zoom 1.0 with autoScroll', () => {
    const vp: ViewportState = { zoomLevel: 1.0, panOffsetMs: 0, autoScroll: true };
    const [viewMin, viewMax] = computeVisibleRange(dataMin, dataMax, vp);
    expect(viewMin).toBe(1000);
    expect(viewMax).toBe(11000);
  });

  it('returns half range at zoom 2.0 with autoScroll (locked to right)', () => {
    const vp: ViewportState = { zoomLevel: 2.0, panOffsetMs: 0, autoScroll: true };
    const [viewMin, viewMax] = computeVisibleRange(dataMin, dataMax, vp);
    expect(viewMax).toBe(11000);
    expect(viewMax - viewMin).toBe(5000);
    expect(viewMin).toBe(6000);
  });

  it('applies pan offset when autoScroll is off', () => {
    const vp: ViewportState = { zoomLevel: 2.0, panOffsetMs: 2000, autoScroll: false };
    const [viewMin, viewMax] = computeVisibleRange(dataMin, dataMax, vp);
    expect(viewMax).toBe(9000);
    expect(viewMin).toBe(4000);
  });

  it('returns same range for zero-length data', () => {
    const vp: ViewportState = { zoomLevel: 2.0, panOffsetMs: 0, autoScroll: true };
    const [viewMin, viewMax] = computeVisibleRange(5000, 5000, vp);
    expect(viewMin).toBe(5000);
    expect(viewMax).toBe(5000);
  });

  it('zooms to 1/10th at zoom 10x', () => {
    const vp: ViewportState = { zoomLevel: 10.0, panOffsetMs: 0, autoScroll: true };
    const [viewMin, viewMax] = computeVisibleRange(dataMin, dataMax, vp);
    expect(viewMax).toBe(11000);
    expect(viewMax - viewMin).toBe(1000);
  });

  it('pan offset 0 with autoScroll off shows latest data', () => {
    const vp: ViewportState = { zoomLevel: 5.0, panOffsetMs: 0, autoScroll: false };
    const [viewMin, viewMax] = computeVisibleRange(dataMin, dataMax, vp);
    expect(viewMax).toBe(11000);
    expect(viewMax - viewMin).toBe(2000);
  });

  it('max pan offset shows earliest data', () => {
    // At zoom 2.0, visible = 5000ms, max pan = 10000 - 5000 = 5000
    const vp: ViewportState = { zoomLevel: 2.0, panOffsetMs: 5000, autoScroll: false };
    const [viewMin, viewMax] = computeVisibleRange(dataMin, dataMax, vp);
    expect(viewMax).toBe(6000);
    expect(viewMin).toBe(1000);
  });
});

// ─── clampViewport ────────────────────────────────────────────────────────

describe('clampViewport', () => {
  const dataMin = 0;
  const dataMax = 10000;

  it('clamps zoom below minimum to 1.0', () => {
    const vp: ViewportState = { zoomLevel: 0.5, panOffsetMs: 0, autoScroll: false };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.zoomLevel).toBe(1.0);
  });

  it('clamps zoom above maximum to 50.0', () => {
    const vp: ViewportState = { zoomLevel: 100, panOffsetMs: 0, autoScroll: false };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.zoomLevel).toBe(50.0);
  });

  it('clamps negative pan offset to 0', () => {
    const vp: ViewportState = { zoomLevel: 2.0, panOffsetMs: -5000, autoScroll: false };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.panOffsetMs).toBe(0);
  });

  it('clamps excessive pan offset to max allowed', () => {
    // At zoom 2.0, visible = 5000ms, max pan = 10000 - 5000 = 5000
    const vp: ViewportState = { zoomLevel: 2.0, panOffsetMs: 9000, autoScroll: false };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.panOffsetMs).toBe(5000);
  });

  it('preserves autoScroll flag', () => {
    const vp: ViewportState = { zoomLevel: 2.0, panOffsetMs: 0, autoScroll: true };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.autoScroll).toBe(true);
  });

  it('handles zero-range data gracefully', () => {
    const vp: ViewportState = { zoomLevel: 5.0, panOffsetMs: 1000, autoScroll: false };
    const result = clampViewport(vp, 5000, 5000);
    expect(result.zoomLevel).toBe(5.0);
    expect(result.panOffsetMs).toBe(1000);
  });

  it('at zoom 1.0 max pan is 0', () => {
    const vp: ViewportState = { zoomLevel: 1.0, panOffsetMs: 5000, autoScroll: false };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.panOffsetMs).toBe(0);
  });

  it('valid viewport passes through unchanged', () => {
    const vp: ViewportState = { zoomLevel: 3.0, panOffsetMs: 1000, autoScroll: false };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.zoomLevel).toBe(3.0);
    expect(result.panOffsetMs).toBe(1000);
    expect(result.autoScroll).toBe(false);
  });

  it('at high zoom, pan range is very small', () => {
    // At zoom 50.0, visible = 200ms, max pan = 10000 - 200 = 9800
    const vp: ViewportState = { zoomLevel: 50.0, panOffsetMs: 9800, autoScroll: false };
    const result = clampViewport(vp, dataMin, dataMax);
    expect(result.panOffsetMs).toBe(9800);
  });
});
