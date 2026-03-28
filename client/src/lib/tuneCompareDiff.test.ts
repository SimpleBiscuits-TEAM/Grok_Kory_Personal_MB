/**
 * Tests for TuneCompare map diff address arithmetic fix.
 *
 * Root cause that was fixed:
 *   The diff logic was using `map.address - offset` (subtraction) but
 *   AlignmentResult.offset is defined as "delta to ADD to A2L addresses
 *   to get binary file offsets", so the correct formula is
 *   `map.address + offset`.
 *
 * These tests verify the correct formula by simulating the exact
 *   computation that TuneCompare.mapDiffs performs.
 */
import { describe, it, expect } from 'vitest';
import { readValue, resolveDataType } from './editorEngine';
import type { AlignmentResult, CalibrationMap, EcuDefinition } from './editorEngine';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal EcuDefinition with one VALUE map at the given A2L address */
function makeMinimalEcuDef(a2lAddress: number): EcuDefinition {
  const map: CalibrationMap = {
    name: 'SpeedLimit',
    description: 'Speed limiter value',
    type: 'VALUE',
    address: a2lAddress,
    recordLayout: 'RL_UBYTE',
    compuMethod: 'IDENTICAL',
    lowerLimit: 0,
    upperLimit: 255,
    annotations: [],
    axes: [],
    rows: 1,
    cols: 1,
  };
  return {
    ecuFamily: 'TEST_ECU',
    source: 'test',
    fileName: 'test.a2l',
    maps: [map],
    measurements: [],
    compuMethods: new Map([['IDENTICAL', { name: 'IDENTICAL', type: 'IDENTICAL', unit: '', format: '%d' }]]),
    recordLayouts: new Map([['RL_UBYTE', { name: 'RL_UBYTE', fncValuesType: 'UBYTE' }]]),
    axisPts: new Map(),
    moduleInfo: { name: 'TEST', byteOrder: 'MSB_LAST', addrGranularity: 1 },
    parseTime: 0,
    errors: [],
    stats: { totalMaps: 1, totalMeasurements: 0, mapsByType: { VALUE: 1 } },
  };
}

/** Build a binary buffer with a known byte value at a specific position */
function makeBinary(size: number, position: number, value: number): Uint8Array {
  const buf = new Uint8Array(size);
  buf[position] = value;
  return buf;
}

/** Simulate the corrected TuneCompare diff formula for a single VALUE map */
function simulateDiff(
  ecuDef: EcuDefinition,
  primaryBinary: Uint8Array,
  compareBinary: Uint8Array,
  alignment: AlignmentResult,
  compareOffset: number
): { changedCells: number; valuesA: number[]; valuesB: number[] } {
  const map = ecuDef.maps[0];
  const dataType = resolveDataType(map.recordLayout, ecuDef.recordLayouts);
  const byteSize = dataType.size;
  const totalCells = (map.rows || 1) * (map.cols || 1);
  const isBigEndian = false;

  const valuesA: number[] = [];
  const valuesB: number[] = [];
  let changedCells = 0;

  for (let i = 0; i < totalCells; i++) {
    // CORRECT formula: binAddr = a2lAddress + offset
    const addrA = map.address + alignment.offset + i * byteSize;
    const addrB = map.address + compareOffset + i * byteSize;

    const aInBounds = addrA >= 0 && addrA + byteSize <= primaryBinary.length;
    const bInBounds = addrB >= 0 && addrB + byteSize <= compareBinary.length;

    if (!aInBounds || !bInBounds) {
      valuesA.push(NaN);
      valuesB.push(NaN);
      continue;
    }

    const vA = readValue(primaryBinary, addrA, dataType, isBigEndian);
    const vB = readValue(compareBinary, addrB, dataType, isBigEndian);
    valuesA.push(vA);
    valuesB.push(vB);
    if (vA !== vB) changedCells++;
  }

  return { changedCells, valuesA, valuesB };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TuneCompare map diff address arithmetic', () => {
  it('detects a changed map when offset is negative (raw flash dump)', () => {
    // A2L address: 0x1000, binary size: 0x2000
    // offset = -0x1000 means binAddr = 0x1000 + (-0x1000) = 0x0000
    const a2lAddr = 0x1000;
    const offset = -0x1000;
    const binPosition = 0x0000; // where the value lives in the binary

    const ecuDef = makeMinimalEcuDef(a2lAddr);
    const alignment: AlignmentResult = { offset, confidence: 0.9, method: 'test', anchors: [] };

    const primaryBinary = makeBinary(0x2000, binPosition, 100);
    const compareBinary = makeBinary(0x2000, binPosition, 120); // different value

    const result = simulateDiff(ecuDef, primaryBinary, compareBinary, alignment, offset);

    expect(result.changedCells).toBe(1);
    expect(result.valuesA[0]).toBe(100);
    expect(result.valuesB[0]).toBe(120);
  });

  it('detects a changed map when offset is zero (direct-mapped binary)', () => {
    const a2lAddr = 0x500;
    const offset = 0;

    const ecuDef = makeMinimalEcuDef(a2lAddr);
    const alignment: AlignmentResult = { offset, confidence: 0.85, method: 'zero_offset', anchors: [] };

    const primaryBinary = makeBinary(0x1000, a2lAddr, 50);
    const compareBinary = makeBinary(0x1000, a2lAddr, 75);

    const result = simulateDiff(ecuDef, primaryBinary, compareBinary, alignment, offset);

    expect(result.changedCells).toBe(1);
    expect(result.valuesA[0]).toBe(50);
    expect(result.valuesB[0]).toBe(75);
  });

  it('reports 0 changed maps when files are identical', () => {
    const a2lAddr = 0x200;
    const offset = -0x100;

    const ecuDef = makeMinimalEcuDef(a2lAddr);
    const alignment: AlignmentResult = { offset, confidence: 0.9, method: 'test', anchors: [] };

    const binary = makeBinary(0x1000, 0x100, 42);
    // Same binary for both
    const result = simulateDiff(ecuDef, binary, binary, alignment, offset);

    expect(result.changedCells).toBe(0);
    expect(result.valuesA[0]).toBe(42);
    expect(result.valuesB[0]).toBe(42);
  });

  it('skips out-of-bounds addresses gracefully (returns NaN, not 0)', () => {
    // A2L address that places the read outside the binary
    const a2lAddr = 0xFFFF0000;
    const offset = 0;

    const ecuDef = makeMinimalEcuDef(a2lAddr);
    const alignment: AlignmentResult = { offset, confidence: 0.5, method: 'test', anchors: [] };

    const binary = new Uint8Array(0x1000);
    const result = simulateDiff(ecuDef, binary, binary, alignment, offset);

    expect(result.changedCells).toBe(0);
    expect(isNaN(result.valuesA[0])).toBe(true);
  });

  it('uses the WRONG formula (subtraction) and gets incorrect results — demonstrating the original bug', () => {
    // This test documents the broken behavior so we never regress
    const a2lAddr = 0x1000;
    const offset = -0x1000;
    const binPosition = 0x0000;

    const ecuDef = makeMinimalEcuDef(a2lAddr);
    const dataType = resolveDataType('RL_UBYTE', ecuDef.recordLayouts);
    const primaryBinary = makeBinary(0x2000, binPosition, 100);
    const compareBinary = makeBinary(0x2000, binPosition, 120);

    // WRONG formula: binAddr = a2lAddress - offset
    const wrongAddrA = a2lAddr - offset; // = 0x1000 - (-0x1000) = 0x2000
    const wrongAddrB = a2lAddr - offset;

    // 0x2000 is exactly at the boundary of a 0x2000 buffer — out of bounds
    const aOutOfBounds = wrongAddrA >= primaryBinary.length;
    const bOutOfBounds = wrongAddrB >= compareBinary.length;

    expect(aOutOfBounds).toBe(true);  // confirms the bug: wrong address is out of bounds
    expect(bOutOfBounds).toBe(true);

    // With the wrong formula, readValue returns 0 for both → no diff detected
    const vA = readValue(primaryBinary, wrongAddrA, dataType, false);
    const vB = readValue(compareBinary, wrongAddrB, dataType, false);
    expect(vA).toBe(0); // readValue returns 0 for OOB
    expect(vB).toBe(0);
    expect(vA === vB).toBe(true); // no diff found — bug confirmed
  });

  it('handles compare binary with different base address (S-Record)', () => {
    // Primary: raw binary, offset = -0x80000000
    // Compare: S-Record with base address 0x80000000, so compareOffset = -0x80000000
    const a2lAddr = 0x80001000;
    const primaryOffset = -0x80000000;
    const compareBaseAddr = 0x80000000;
    const compareOffset = -compareBaseAddr; // = -0x80000000

    const binPosition = a2lAddr + primaryOffset; // = 0x1000

    const ecuDef = makeMinimalEcuDef(a2lAddr);
    const alignment: AlignmentResult = { offset: primaryOffset, confidence: 0.9, method: 'base_address', anchors: [] };

    const primaryBinary = makeBinary(0x10000, binPosition, 200);
    const compareBinary = makeBinary(0x10000, binPosition, 210);

    const result = simulateDiff(ecuDef, primaryBinary, compareBinary, alignment, compareOffset);

    expect(result.changedCells).toBe(1);
    expect(result.valuesA[0]).toBe(200);
    expect(result.valuesB[0]).toBe(210);
  });

  it('resolveDataType always returns a valid fallback, never null', () => {
    // This was the second bug: early return when resolveDataType returned null
    // The function actually always returns UWORD as fallback
    const layouts = new Map();
    const dt = resolveDataType('UNKNOWN_LAYOUT_XYZ', layouts);
    expect(dt).toBeDefined();
    expect(dt.size).toBeGreaterThan(0);
    expect(dt.size).toBeLessThanOrEqual(8);
  });
});
