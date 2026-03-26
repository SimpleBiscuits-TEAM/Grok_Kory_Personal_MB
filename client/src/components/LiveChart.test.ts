import { describe, it, expect } from 'vitest';
import { computeTraceStats, filterReadingsByTimeWindow } from './LiveChart';
import type { PIDReading } from '@/lib/obdConnection';

function makeReading(pid: number, value: number, timestamp: number): PIDReading {
  return { pid, value, timestamp, raw: '' };
}

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

describe('filterReadingsByTimeWindow', () => {
  it('returns all readings when window is -1 (ALL)', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 1000, now - 600000), // 10 min ago
      makeReading(0x0C, 2000, now - 300000), // 5 min ago
      makeReading(0x0C, 3000, now - 1000),   // 1 sec ago
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
      makeReading(0x0C, 1000, now - 30000), // 30s ago - excluded
      makeReading(0x0C, 2000, now - 15000), // 15s ago - excluded
      makeReading(0x0C, 3000, now - 8000),  // 8s ago - included
      makeReading(0x0C, 4000, now - 3000),  // 3s ago - included
      makeReading(0x0C, 5000, now - 500),   // 0.5s ago - included
    ];
    const filtered = filterReadingsByTimeWindow(readings, 10);
    expect(filtered.length).toBe(3);
    expect(filtered[0].value).toBe(3000);
    expect(filtered[2].value).toBe(5000);
  });

  it('filters readings within 30-second window', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 1000, now - 60000), // 60s ago - excluded
      makeReading(0x0C, 2000, now - 25000), // 25s ago - included
      makeReading(0x0C, 3000, now - 10000), // 10s ago - included
    ];
    const filtered = filterReadingsByTimeWindow(readings, 30);
    expect(filtered.length).toBe(2);
    expect(filtered[0].value).toBe(2000);
  });

  it('filters readings within 5-minute window', () => {
    const now = Date.now();
    const readings = [
      makeReading(0x0C, 1000, now - 600000), // 10 min ago - excluded
      makeReading(0x0C, 2000, now - 240000), // 4 min ago - included
      makeReading(0x0C, 3000, now - 60000),  // 1 min ago - included
      makeReading(0x0C, 4000, now - 1000),   // 1s ago - included
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
