/**
 * Tests for Binary-to-Definition Engine
 */

import { describe, it, expect } from 'vitest';
import {
  scanBinaryForMaps,
  generateEcuDefinitionFromBinary,
  MapCandidate,
} from './binaryDefinitionEngine';
import { DATA_TYPES } from './editorEngine';

describe('binaryDefinitionEngine', () => {
  /**
   * Create a synthetic binary with a known 2D map structure
   */
  function createSynthetic2DMapBinary(): Uint8Array {
    const buffer = new ArrayBuffer(1000);
    const view = new DataView(buffer);
    const data = new Uint8Array(buffer);

    // Offset 100: Create a 4×4 2D map
    // [rows=4][cols=4][RPM axis][Load axis][data...]
    let offset = 100;

    // Dimension bytes
    data[offset++] = 4; // rows
    data[offset++] = 4; // cols

    // RPM axis (4 values): 1000, 2000, 3000, 4000
    view.setUint16(offset, 1000, true);
    offset += 2;
    view.setUint16(offset, 2000, true);
    offset += 2;
    view.setUint16(offset, 3000, true);
    offset += 2;
    view.setUint16(offset, 4000, true);
    offset += 2;

    // Load axis (4 values): 0, 25, 50, 75
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 25, true);
    offset += 2;
    view.setUint16(offset, 50, true);
    offset += 2;
    view.setUint16(offset, 75, true);
    offset += 2;

    // Data values (4×4 = 16 values), ranging from 100-500
    for (let i = 0; i < 16; i++) {
      view.setUint16(offset, 100 + i * 25, true);
      offset += 2;
    }

    return data;
  }

  /**
   * Create a synthetic binary with a known 1D curve
   */
  function createSynthetic1DCurveBinary(): Uint8Array {
    const buffer = new ArrayBuffer(500);
    const view = new DataView(buffer);
    const data = new Uint8Array(buffer);

    // Offset 50: Create a 1D curve
    // [count=8][axis values...][data...]
    let offset = 50;

    // Count
    data[offset++] = 8;

    // Axis (8 values): 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000
    const axisValues = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000];
    for (const val of axisValues) {
      view.setUint16(offset, val, true);
      offset += 2;
    }

    // Data values (8 values)
    for (let i = 0; i < 8; i++) {
      view.setUint16(offset, 200 + i * 50, true);
      offset += 2;
    }

    return data;
  }

  describe('scanBinaryForMaps', () => {
    it('should find a 2D map in synthetic binary', () => {
      const binary = createSynthetic2DMapBinary();
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      expect(result.candidates.length).toBeGreaterThan(0);
      const map2d = result.candidates.find(c => c.rows === 4 && c.cols === 4);
      expect(map2d).toBeDefined();
      expect(map2d?.confidence).toBeGreaterThan(0.5);
    });

    it('should find a 1D curve in synthetic binary', () => {
      const binary = createSynthetic1DCurveBinary();
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      expect(result.candidates.length).toBeGreaterThan(0);
      const curve1d = result.candidates.find(c => c.cols === 1 && c.rows === 8);
      expect(curve1d).toBeDefined();
      expect(curve1d?.confidence).toBeGreaterThan(0.5);
    });

    it('should detect monotonically increasing axes', () => {
      const binary = createSynthetic2DMapBinary();
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      const map = result.candidates.find(c => c.rows === 4 && c.cols === 4);
      expect(map?.axisXValues).toBeDefined();
      expect(map?.axisYValues).toBeDefined();

      // Check RPM axis is monotonic
      if (map?.axisXValues) {
        for (let i = 1; i < map.axisXValues.length; i++) {
          expect(map.axisXValues[i]).toBeGreaterThan(map.axisXValues[i - 1]);
        }
      }
    });

    it('should extract correct data values from 2D map', () => {
      const binary = createSynthetic2DMapBinary();
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      const map = result.candidates.find(c => c.rows === 4 && c.cols === 4);
      expect(map?.dataValues).toBeDefined();
      expect(map?.dataValues?.length).toBe(16);

      // Check data range (100-500)
      if (map?.dataValues) {
        const min = Math.min(...map.dataValues);
        const max = Math.max(...map.dataValues);
        expect(min).toBeGreaterThanOrEqual(100);
        expect(max).toBeLessThanOrEqual(500);
      }
    });

    it('should return analysis metadata', () => {
      const binary = createSynthetic2DMapBinary();
      const result = scanBinaryForMaps(binary, 'MG1CA920', 'MSB_LAST');

      expect(result.ecuFamily).toBe('MG1CA920');
      expect(result.byteOrder).toBe('MSB_LAST');
      expect(result.log.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('generateEcuDefinitionFromBinary', () => {
    it('should generate valid EcuDefinition from candidates', () => {
      const binary = createSynthetic2DMapBinary();
      const analysis = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');
      const definition = generateEcuDefinitionFromBinary(binary, analysis, 'test.bin');

      expect(definition.maps.length).toBeGreaterThan(0);
      expect(definition.ecuFamily).toBe('TEST');
      expect(definition.fileName).toBe('test.bin');
      expect(definition.stats.totalMaps).toBe(definition.maps.length);
    });

    it('should create maps with correct types', () => {
      const binary = createSynthetic2DMapBinary();
      const analysis = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');
      const definition = generateEcuDefinitionFromBinary(binary, analysis, 'test.bin');

      const map2d = definition.maps.find(m => m.cols && m.cols > 1);
      const map1d = definition.maps.find(m => !m.cols || m.cols === 1);

      expect(map2d?.type).toBe('MAP');
      if (map1d) {
        expect(map1d.type).toBe('CURVE');
      }
    });

    it('should populate map values from analysis', () => {
      const binary = createSynthetic2DMapBinary();
      const analysis = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');
      const definition = generateEcuDefinitionFromBinary(binary, analysis, 'test.bin');

      const map = definition.maps[0];
      expect(map.rawValues).toBeDefined();
      expect(map.rawValues?.length).toBeGreaterThan(0);
    });

    it('should create axis descriptors for multi-dimensional maps', () => {
      const binary = createSynthetic2DMapBinary();
      const analysis = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');
      const definition = generateEcuDefinitionFromBinary(binary, analysis, 'test.bin');

      const map2d = definition.maps.find(m => m.cols && m.cols > 1);
      expect(map2d?.axes.length).toBeGreaterThanOrEqual(2);
    });

    it('should set correct record layouts', () => {
      const binary = createSynthetic2DMapBinary();
      const analysis = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');
      const definition = generateEcuDefinitionFromBinary(binary, analysis, 'test.bin');

      const map2d = definition.maps.find(m => m.cols && m.cols > 1);
      expect(map2d?.recordLayout).toBe('UWORD_2D');

      const map1d = definition.maps.find(m => !m.cols || m.cols === 1);
      if (map1d) {
        expect(map1d.recordLayout).toBe('UWORD_1D');
      }
    });

    it('should include auto-discovery annotations', () => {
      const binary = createSynthetic2DMapBinary();
      const analysis = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');
      const definition = generateEcuDefinitionFromBinary(binary, analysis, 'test.bin');

      const map = definition.maps[0];
      expect(map.annotations.some(a => a.includes('Auto-discovered'))).toBe(true);
      expect(map.annotations.some(a => a.includes('Confidence'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty binary gracefully', () => {
      const binary = new Uint8Array(10);
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      expect(result.candidates).toBeDefined();
      expect(Array.isArray(result.candidates)).toBe(true);
    });

    it('should handle very large binary without crashing', () => {
      // Create a 10MB binary (just zeros)
      const binary = new Uint8Array(10 * 1024 * 1024);
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      expect(result.candidates).toBeDefined();
      expect(result.log.length).toBeGreaterThan(0);
    });

    it('should not crash on malformed dimension bytes', () => {
      const binary = new Uint8Array(100);
      // Set invalid dimension bytes (>32)
      binary[0] = 255;
      binary[1] = 255;

      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');
      expect(result.candidates).toBeDefined();
    });
  });

  describe('confidence scoring', () => {
    it('should score valid maps higher than invalid ones', () => {
      const binary = createSynthetic2DMapBinary();
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      const validMap = result.candidates.find(c => c.rows === 4 && c.cols === 4);
      const otherMaps = result.candidates.filter(c => !(c.rows === 4 && c.cols === 4));

      if (validMap && otherMaps.length > 0) {
        expect(validMap.confidence).toBeGreaterThanOrEqual(
          Math.max(...otherMaps.map(m => m.confidence))
        );
      }
    });

    it('should have confidence between 0 and 1', () => {
      const binary = createSynthetic2DMapBinary();
      const result = scanBinaryForMaps(binary, 'TEST', 'MSB_LAST');

      for (const candidate of result.candidates) {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});
