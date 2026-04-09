import { describe, expect, it } from 'vitest';
import {
  extractColumnTokensForCombustionInference,
  extractObdPidNumbersFromText,
  formatCombustionInferenceSummary,
  getCombustionFamilyFromProcessedVehicleMeta,
  inferCombustionFromColumnTokens,
  inferCombustionFromObdPids,
  resolveCombustionFromLogContext,
  shouldApplyDieselAnalyzerRules,
} from './combustionInference';

describe('combustionInference', () => {
  it('uses # FuelType metadata when present', () => {
    const r = resolveCombustionFromLogContext({ fuelType: 'diesel' }, ['STFT1', 'O2 B1S1'], [0x06]);
    expect(r.family).toBe('diesel');
    expect(r.source).toBe('metadata');
    expect(r.confidence).toBe('high');
  });

  it('classifies gasoline metadata as spark', () => {
    const r = resolveCombustionFromLogContext({ fuelType: 'gasoline' }, ['DPF_SOOT'], [0x0564]);
    expect(r.family).toBe('spark');
    expect(r.source).toBe('metadata');
  });

  it('infers diesel from column tokens', () => {
    const r = inferCombustionFromColumnTokens([
      'Engine RPM',
      'DPF Soot Load',
      'VGT_POS',
      'Injector Balance Cyl 1',
    ]);
    expect(r.family).toBe('diesel');
    expect(r.dieselHints.length).toBeGreaterThan(0);
  });

  it('infers spark from column tokens', () => {
    const r = inferCombustionFromColumnTokens([
      'STFT Bank 1',
      'LTFT Bank 1',
      'O2 Sensor 1 (B1S1)',
      'Spark Advance',
    ]);
    expect(r.family).toBe('spark');
    expect(r.sparkHints.length).toBeGreaterThan(0);
  });

  it('infers diesel from Mode 22 PIDs', () => {
    const r = inferCombustionFromObdPids([0x0564, 0x0565, 0x1a10]);
    expect(r.family).toBe('diesel');
  });

  it('infers spark from Mode 01 trim/O2 PIDs', () => {
    const r = inferCombustionFromObdPids([0x06, 0x07, 0x14]);
    expect(r.family).toBe('spark');
  });

  it('merges columns and PIDs when no metadata', () => {
    const cols = extractColumnTokensForCombustionInference(
      '# VIN: X\nTime (s),DPF Soot (g)\n0,0\n'
    );
    const pids = extractObdPidNumbersFromText(',0x1940,');
    const r = resolveCombustionFromLogContext(undefined, cols, pids);
    expect(r.source).toBe('merged');
    expect(r.family).toBe('diesel');
  });

  it('extracts hex PIDs from text', () => {
    expect(extractObdPidNumbersFromText('foo 0x564 bar 0x06')).toEqual([0x564, 0x06]);
  });

  it('extracts datalogger-style column tokens', () => {
    const csv = `# FuelType: gasoline
Timestamp (ms),Elapsed (s),RPM (rpm),STFT1 (%)
`;
    const t = extractColumnTokensForCombustionInference(csv);
    expect(t.some((x) => /stft1/i.test(x))).toBe(true);
  });

  it('formats summary strings', () => {
    expect(formatCombustionInferenceSummary({
      family: 'diesel',
      score: 8,
      confidence: 'medium',
      dieselHints: [],
      sparkHints: [],
      source: 'columns',
    })).toContain('diesel');
  });

  it('shouldApplyDieselAnalyzerRules respects spark inference and explicit fuelType', () => {
    expect(shouldApplyDieselAnalyzerRules({ combustionInference: { family: 'spark', score: -8, confidence: 'medium', dieselHints: [], sparkHints: [], source: 'columns' } })).toBe(false);
    expect(shouldApplyDieselAnalyzerRules({ combustionInference: { family: 'diesel', score: 12, confidence: 'high', dieselHints: [], sparkHints: [], source: 'columns' } })).toBe(true);
    expect(shouldApplyDieselAnalyzerRules({ fuelType: 'gasoline' })).toBe(false);
    expect(shouldApplyDieselAnalyzerRules({ fuelType: 'diesel' })).toBe(true);
    expect(shouldApplyDieselAnalyzerRules(undefined)).toBe(true);
  });

  it('getCombustionFamilyFromProcessedVehicleMeta prefers metadata then inference', () => {
    expect(
      getCombustionFamilyFromProcessedVehicleMeta({
        fuelType: 'diesel',
        combustionInference: { family: 'spark', score: -9, confidence: 'high', dieselHints: [], sparkHints: [], source: 'columns' },
      })
    ).toBe('diesel');
    expect(
      getCombustionFamilyFromProcessedVehicleMeta({
        combustionInference: { family: 'spark', score: -9, confidence: 'high', dieselHints: [], sparkHints: [], source: 'columns' },
      })
    ).toBe('spark');
  });
});
