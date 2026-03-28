/**
 * Tests for DatalogLinker - parseDatalogSummary function
 */
import { describe, it, expect } from 'vitest';
import { parseDatalogSummary } from './DatalogLinker';

describe('parseDatalogSummary', () => {
  it('should parse basic CSV with headers and data', () => {
    const csv = 'Time,RPM,Boost,Coolant\n0,800,0,180\n1,1200,5,185\n2,3500,22,190\n3,5000,30,195';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.fileName).toBe('test.csv');
    expect(result.totalRows).toBe(4);
    expect(result.totalColumns).toBe(4);
    expect(result.pidNames).toContain('RPM');
    expect(result.pidNames).toContain('Boost');
    expect(result.pidNames).toContain('Coolant');
    // Time is filtered from pidNames
    expect(result.pidNames).not.toContain('Time');
  });

  it('should calculate duration from time column', () => {
    const csv = 'Time,RPM\n0,800\n1,1200\n2,1500\n3,2000\n4,2500\n5,3000';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.durationSeconds).toBe(5);
    expect(result.sampleRateHz).toBeGreaterThan(0);
  });

  it('should extract max RPM metric', () => {
    const csv = 'Time,RPM\n0,800\n1,3500\n2,5200\n3,4800';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.keyMetrics.maxRpm).toBe(5200);
  });

  it('should extract max boost metric', () => {
    const csv = 'Time,Boost\n0,0\n1,15\n2,28.5\n3,22';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.keyMetrics.maxBoost).toBe(28.5);
  });

  it('should extract max EGT metric', () => {
    const csv = 'Time,EGT\n0,400\n1,800\n2,1250\n3,1100';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.keyMetrics.maxEgt).toBe(1250);
  });

  it('should extract max coolant temp metric', () => {
    const csv = 'Time,Coolant Temp\n0,120\n1,180\n2,210\n3,205';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.keyMetrics.maxCoolantTemp).toBe(210);
  });

  it('should extract vehicle metadata from comment headers', () => {
    const csv = '# VIN: 1GCGG25K071234567\n# Make: Chevrolet\n# Model: Silverado\n# Year: 2007\n# Engine: LBZ\nTime,RPM\n0,800\n1,1200';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.vehicleMeta).toBeDefined();
    expect(result.vehicleMeta?.vin).toBe('1GCGG25K071234567');
    expect(result.vehicleMeta?.make).toBe('Chevrolet');
    expect(result.vehicleMeta?.model).toBe('Silverado');
    expect(result.vehicleMeta?.year).toBe('2007');
    expect(result.vehicleMeta?.engine).toBe('LBZ');
  });

  it('should handle empty CSV gracefully', () => {
    const csv = '';
    const result = parseDatalogSummary(csv, 'empty.csv');

    expect(result.totalRows).toBe(0);
    expect(result.pidNames).toHaveLength(0);
  });

  it('should handle CSV with only headers', () => {
    const csv = 'Time,RPM,Boost';
    const result = parseDatalogSummary(csv, 'headers_only.csv');

    expect(result.totalRows).toBe(0);
  });

  it('should handle HP Tuners format with units row', () => {
    // HP Tuners has a units row after headers
    const csv = 'Time,Engine Speed,Boost Pressure\ns,RPM,psi\n0,800,0\n1,3500,22\n2,5000,30';
    const result = parseDatalogSummary(csv, 'hptuners.csv');

    // Should detect units row and skip it
    expect(result.totalRows).toBe(3);
    expect(result.pidNames).toContain('Engine Speed');
    expect(result.pidNames).toContain('Boost Pressure');
  });

  it('should handle EFILive format timestamps', () => {
    const csv = 'Elapsed,Engine RPM,Rail Pressure Desired,Rail Pressure Actual\n0.00,750,5000,4980\n0.10,780,5000,4990\n0.20,800,5000,5010\n10.00,3500,18000,17800';
    const result = parseDatalogSummary(csv, 'efilive.csv');

    expect(result.durationSeconds).toBe(10);
    expect(result.totalRows).toBe(4);
  });

  it('should extract rail pressure metrics', () => {
    const csv = 'Time,Rail Pressure\n0,5000\n1,12000\n2,26000\n3,22000';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.keyMetrics.maxRailPressure).toBe(26000);
  });

  it('should extract vehicle speed metrics', () => {
    const csv = 'Time,Vehicle Speed\n0,0\n1,35\n2,72\n3,65';
    const result = parseDatalogSummary(csv, 'test.csv');

    expect(result.keyMetrics.maxSpeed).toBe(72);
  });

  it('should handle quoted CSV fields', () => {
    const csv = '"Time","Engine RPM","Boost"\n"0","800","0"\n"1","3500","22"';
    const result = parseDatalogSummary(csv, 'quoted.csv');

    expect(result.totalRows).toBe(2);
    expect(result.pidNames).toContain('Engine RPM');
  });
});
