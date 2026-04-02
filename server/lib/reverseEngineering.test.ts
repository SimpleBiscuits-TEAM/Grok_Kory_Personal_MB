/**
 * Reverse Engineering Pipeline Tests
 * Tests the full pipeline: detect -> discover -> generate -> validate
 * using the Can-Am MG1 binary test file
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { analyzeBinary, detectECUFamily, getAvailableFamilies } from './binarySignatureDetector';
import { discoverMapsInBinary, generateA2L, validateA2L } from './a2lGenerator';

const TEST_BINARY_PATH = resolve(__dirname, '../../test_files/1E1101953SA2VLMJMG1CA920.bin');
const hasBinary = existsSync(TEST_BINARY_PATH);

describe('Binary Signature Detection', () => {
  it('should list available ECU families', () => {
    const families = getAvailableFamilies();
    expect(families).toBeDefined();
    expect(Object.keys(families).length).toBeGreaterThan(0);
    expect(families['MG1C']).toBeDefined();
    expect(families['ME17']).toBeDefined();
  });

  it.skipIf(!hasBinary)('should detect MG1C family from Can-Am binary', () => {
    const binary = readFileSync(TEST_BINARY_PATH);
    const result = analyzeBinary(binary, '1E1101953SA2VLMJMG1CA920.bin');

    expect(result).toBeDefined();
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.analysis.hasDeadbeefMarker).toBe(true);
    expect(result.detectedFamily).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it.skipIf(!hasBinary)('should detect ECU family with confidence threshold', () => {
    const binary = readFileSync(TEST_BINARY_PATH);
    const result = detectECUFamily(binary, '1E1101953SA2VLMJMG1CA920.bin', 0.1);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.family).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0.1);
    }
  });
});

describe('Calibration Map Discovery', () => {
  it.skipIf(!hasBinary)('should discover maps in Can-Am MG1 binary', () => {
    const binary = readFileSync(TEST_BINARY_PATH);
    const maps = discoverMapsInBinary(binary, 'MG1C', { minMapSize: 8 });

    expect(maps).toBeDefined();
    expect(Array.isArray(maps)).toBe(true);
    expect(maps.length).toBeGreaterThan(0);

    // Each map should have required fields
    for (const map of maps.slice(0, 5)) {
      expect(map.name).toBeTruthy();
      expect(map.address).toBeGreaterThanOrEqual(0);
      expect(map.size).toBeGreaterThan(0);
      expect(map.dataType).toBeTruthy();
      expect(map.dimensions).toMatch(/^(1D|2D|3D)$/);
      expect(map.confidence).toBeGreaterThan(0);
    }
  });

  it.skipIf(!hasBinary)('should categorize discovered maps', () => {
    const binary = readFileSync(TEST_BINARY_PATH);
    const maps = discoverMapsInBinary(binary, 'MG1C');

    const categories = new Set(maps.map(m => m.category));
    expect(categories.size).toBeGreaterThan(0);
  });
});

describe('A2L Generation', () => {
  it.skipIf(!hasBinary)('should generate valid A2L from discovered maps', () => {
    const binary = readFileSync(TEST_BINARY_PATH);
    const maps = discoverMapsInBinary(binary, 'MG1C');

    const a2l = generateA2L(maps, {
      projectName: 'CANAM_MG1_TEST',
      ecuFamily: 'MG1C',
      version: '1.0.0',
    });

    expect(a2l).toBeTruthy();
    expect(a2l).toContain('ASAP2_VERSION');
    expect(a2l).toContain('/begin PROJECT');
    expect(a2l).toContain('/end PROJECT');
    expect(a2l).toContain('/begin CHARACTERISTIC');
    expect(a2l).toContain('/end CHARACTERISTIC');
    expect(a2l).toContain('CANAM_MG1_TEST');
  });

  it.skipIf(!hasBinary)('should validate generated A2L', () => {
    const binary = readFileSync(TEST_BINARY_PATH);
    const maps = discoverMapsInBinary(binary, 'MG1C');
    const validation = validateA2L(maps);

    expect(validation).toBeDefined();
    expect(validation.stats.characteristicCount).toBe(maps.length);
    expect(validation.stats.totalSize).toBeGreaterThan(0);
    // Duplicate names should be 0 since we generate unique names
    expect(validation.stats.duplicateNames).toBe(0);
  });
});

describe('Full Pipeline', () => {
  it.skipIf(!hasBinary)('should complete full reverse engineering pipeline', () => {
    const binary = readFileSync(TEST_BINARY_PATH);
    const fileName = '1E1101953SA2VLMJMG1CA920.bin';

    // Step 1: Detect
    const detection = detectECUFamily(binary, fileName);
    expect(detection).not.toBeNull();
    const ecuFamily = detection?.family || 'MG1C';

    // Step 2: Analyze
    const analysis = analyzeBinary(binary, fileName);
    expect(analysis.fileSize).toBe(binary.length);

    // Step 3: Discover
    const maps = discoverMapsInBinary(binary, ecuFamily);
    expect(maps.length).toBeGreaterThan(0);

    // Step 4: Generate
    const a2l = generateA2L(maps, {
      projectName: 'CANAM_MG1',
      ecuFamily,
      version: '1.0.0',
    });
    expect(a2l.length).toBeGreaterThan(100);

    // Step 5: Validate
    const validation = validateA2L(maps);
    expect(validation.stats.duplicateNames).toBe(0);

    console.log(`Pipeline complete: ${ecuFamily} detected, ${maps.length} maps discovered, ${a2l.length} byte A2L generated`);
  });
});
