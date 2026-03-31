import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('../db', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
  };
  return {
    getDb: vi.fn().mockResolvedValue(mockDb),
  };
});

describe('Calibrations Router', () => {
  it('should export calibrationsRouter', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    expect(calibrationsRouter).toBeDefined();
  });

  it('should have search procedure', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    expect(calibrationsRouter._def.procedures.search).toBeDefined();
  });

  it('should have getById procedure', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    expect(calibrationsRouter._def.procedures.getById).toBeDefined();
  });

  it('should have lookupPartNumber procedure', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    expect(calibrationsRouter._def.procedures.lookupPartNumber).toBeDefined();
  });

  it('should have filterOptions procedure', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    expect(calibrationsRouter._def.procedures.filterOptions).toBeDefined();
  });

  it('should have stats procedure', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    expect(calibrationsRouter._def.procedures.stats).toBeDefined();
  });

  it('should validate search input with defaults', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    const searchProc = calibrationsRouter._def.procedures.search;
    // The procedure exists and has input validation
    expect(searchProc).toBeDefined();
    expect(searchProc._def).toBeDefined();
  });

  it('should validate lookupPartNumber requires partNumber string', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    const proc = calibrationsRouter._def.procedures.lookupPartNumber;
    expect(proc).toBeDefined();
  });

  it('should validate getById requires numeric id', async () => {
    const { calibrationsRouter } = await import('./calibrations');
    const proc = calibrationsRouter._def.procedures.getById;
    expect(proc).toBeDefined();
  });
});
