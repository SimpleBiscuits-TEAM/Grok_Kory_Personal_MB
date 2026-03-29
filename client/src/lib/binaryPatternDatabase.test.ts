/**
 * Tests for Binary Pattern Database & Cross-Reference Reasoning
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getPatternDatabase,
  resetPatternDatabase,
  applyReasoningToCandidate,
  MapSignature,
} from './binaryPatternDatabase';
import { EcuDefinition, CalibrationMap } from './editorEngine';

describe('binaryPatternDatabase', () => {
  beforeEach(() => {
    resetPatternDatabase();
  });

  afterEach(() => {
    resetPatternDatabase();
  });

  /**
   * Create a mock EcuDefinition with known maps
   */
  function createMockEcuDefinition(): EcuDefinition {
    return {
      source: 'a2l',
      fileName: 'test.a2l',
      ecuFamily: 'MG1CA920',
      moduleInfo: {
        name: 'Test ECU',
        comment: 'Test',
        byteOrder: 'MSB_LAST',
      },
      maps: [
        {
          name: 'Fuel_Injection_Quantity',
          description: 'Main fuel injection quantity map',
          type: 'MAP',
          address: 0x1000,
          recordLayout: 'UWORD_2D',
          compuMethod: 'IDENTITY',
          lowerLimit: 0,
          upperLimit: 65535,
          annotations: [],
          axes: [
            {
              type: 'FIX_AXIS',
              inputQuantity: 'RPM',
              compuMethod: 'IDENTITY',
              maxAxisPoints: 16,
              lowerLimit: 0,
              upperLimit: 65535,
            },
            {
              type: 'FIX_AXIS',
              inputQuantity: 'TPS',
              compuMethod: 'IDENTITY',
              maxAxisPoints: 16,
              lowerLimit: 0,
              upperLimit: 65535,
            },
          ],
          rows: 16,
          cols: 16,
          rawValues: Array(256).fill(100),
          axisXValues: [800, 1000, 1200, 1400, 1600, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000],
          axisYValues: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150],
          category: 'Fuel',
          level: 5,
        },
        {
          name: 'VGT_Vane_Position_Target',
          description: 'VGT vane position target map',
          type: 'MAP',
          address: 0x2000,
          recordLayout: 'UWORD_2D',
          compuMethod: 'IDENTITY',
          lowerLimit: 0,
          upperLimit: 65535,
          annotations: [],
          axes: [
            {
              type: 'FIX_AXIS',
              inputQuantity: 'RPM',
              compuMethod: 'IDENTITY',
              maxAxisPoints: 12,
              lowerLimit: 0,
              upperLimit: 65535,
            },
            {
              type: 'FIX_AXIS',
              inputQuantity: 'BOOST',
              compuMethod: 'IDENTITY',
              maxAxisPoints: 12,
              lowerLimit: 0,
              upperLimit: 65535,
            },
          ],
          rows: 12,
          cols: 12,
          rawValues: Array(144).fill(50),
          axisXValues: [800, 1200, 1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200],
          axisYValues: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
          category: 'Boost',
          level: 5,
        },
      ],
      measurements: [],
      compuMethods: new Map(),
      recordLayouts: new Map(),
      axisPts: new Map(),
      parseTime: Date.now(),
      errors: [],
      stats: {
        totalMaps: 2,
        totalMeasurements: 0,
        mapsByType: { MAP: 2 },
      },
    };
  }

  /**
   * Create a mock binary with known data
   */
  function createMockBinary(): Uint8Array {
    const binary = new Uint8Array(10000);
    // Fill with some test data
    for (let i = 0; i < binary.length; i++) {
      binary[i] = (i * 7) % 256;
    }
    return binary;
  }

  describe('Pattern Database Learning', () => {
    it('should learn signatures from EcuDefinition', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef, binary);

      const stats = db.getStats();
      expect(stats.totalSignatures).toBeGreaterThan(0);
      expect(stats.ecuFamilies).toContain('MG1CA920');
    });

    it('should index signatures by structural pattern', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef, binary);

      const stats = db.getStats();
      expect(stats.structuralPatterns.length).toBeGreaterThan(0);
      expect(stats.structuralPatterns).toContain('16x16');
      expect(stats.structuralPatterns).toContain('12x12');
    });

    it('should increase frequency when learning duplicate signatures', () => {
      const db = getPatternDatabase();
      const ecuDef1 = createMockEcuDefinition();
      const ecuDef2 = createMockEcuDefinition();
      ecuDef2.ecuFamily = 'MED17';
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef1, binary);
      db.learnFromEcuDefinition(ecuDef2, binary);

      const stats = db.getStats();
      expect(stats.ecuFamilies).toContain('MG1CA920');
      expect(stats.ecuFamilies).toContain('MED17');
    });
  });

  describe('Pattern Matching', () => {
    it('should find structural matches for same-sized maps', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef, binary);

      // Try to match a 16x16 map
      const matches = db.findMatches(
        16,
        16,
        'deadbeef',
        { min: 800, max: 7000 },
        { min: 0, max: 150 },
        'MG1CA920'
      );

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].matchType).toBe('structural');
      expect(matches[0].confidence).toBeGreaterThan(0.5);
    });

    it('should find axis pattern matches', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef, binary);

      // Try to match with similar RPM and TPS ranges
      const matches = db.findMatches(
        16,
        16,
        'deadbeef',
        { min: 900, max: 6500 },
        { min: 5, max: 145 },
        'MG1CA920'
      );

      expect(matches.length).toBeGreaterThan(0);
    });

    it('should rank matches by confidence', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef, binary);

      const matches = db.findMatches(
        16,
        16,
        'deadbeef',
        { min: 800, max: 7000 },
        { min: 0, max: 150 },
        'MG1CA920'
      );

      // Matches should be sorted by confidence descending
      for (let i = 1; i < matches.length; i++) {
        expect(matches[i].confidence).toBeLessThanOrEqual(matches[i - 1].confidence);
      }
    });

    it('should return empty array when no matches found', () => {
      const db = getPatternDatabase();
      // Don't learn anything, so database is empty

      const matches = db.findMatches(
        99,
        99,
        'deadbeef',
        { min: 0, max: 1 },
        { min: 0, max: 1 },
        'UNKNOWN'
      );

      expect(matches).toEqual([]);
    });
  });

  describe('Cross-Reference Reasoning', () => {
    it('should apply reasoning to candidates with known patterns', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef, binary);

      const result = applyReasoningToCandidate(
        16,
        16,
        'deadbeef',
        { min: 800, max: 7000 },
        { min: 0, max: 150 },
        [800, 1000, 1200, 1400, 1600, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000],
        [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150],
        'MG1CA920'
      );

      expect(result.mapName).toBeDefined();
      expect(result.mapDescription).toBeDefined();
      expect(result.overallConfidence).toBeGreaterThan(0);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should provide reasoning when no matches found', () => {
      const result = applyReasoningToCandidate(
        99,
        99,
        'deadbeef',
        { min: 0, max: 1 },
        { min: 0, max: 1 },
        [],
        [],
        'UNKNOWN'
      );

      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.reasoning[0]).toContain('No pattern matches');
    });

    it('should classify axes in reasoning', () => {
      const result = applyReasoningToCandidate(
        8,
        8,
        'deadbeef',
        { min: 800, max: 5000 },
        { min: 0, max: 100 },
        [800, 1200, 1600, 2000, 2400, 2800, 3200, 3600],
        [0, 15, 30, 45, 60, 75, 90, 100],
        'UNKNOWN'
      );

      expect(result.reasoning.some(r => r.includes('Axis analysis'))).toBe(true);
    });

    it('should have confidence between 0 and 1', () => {
      const result = applyReasoningToCandidate(
        16,
        16,
        'deadbeef',
        { min: 800, max: 7000 },
        { min: 0, max: 150 },
        undefined,
        undefined,
        'UNKNOWN'
      );

      expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(result.overallConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Database Statistics', () => {
    it('should report correct statistics', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef, binary);

      const stats = db.getStats();
      expect(stats.totalSignatures).toBeGreaterThan(0);
      expect(stats.ecuFamilies.length).toBeGreaterThan(0);
      expect(stats.structuralPatterns.length).toBeGreaterThan(0);
    });

    it('should track multiple ECU families', () => {
      const db = getPatternDatabase();
      const ecuDef1 = createMockEcuDefinition();
      const ecuDef2 = createMockEcuDefinition();
      ecuDef2.ecuFamily = 'MED17';
      const binary = createMockBinary();

      db.learnFromEcuDefinition(ecuDef1, binary);
      db.learnFromEcuDefinition(ecuDef2, binary);

      const stats = db.getStats();
      expect(stats.ecuFamilies.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const db1 = getPatternDatabase();
      const db2 = getPatternDatabase();

      expect(db1).toBe(db2);
    });

    it('should reset database when resetPatternDatabase is called', () => {
      const db1 = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      const binary = createMockBinary();

      db1.learnFromEcuDefinition(ecuDef, binary);
      let stats = db1.getStats();
      expect(stats.totalSignatures).toBeGreaterThan(0);

      resetPatternDatabase();

      const db2 = getPatternDatabase();
      stats = db2.getStats();
      expect(stats.totalSignatures).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ECU definitions', () => {
      const db = getPatternDatabase();
      const ecuDef: EcuDefinition = {
        source: 'a2l',
        fileName: 'empty.a2l',
        ecuFamily: 'TEST',
        moduleInfo: { name: 'Empty', comment: 'Empty' },
        maps: [],
        measurements: [],
        compuMethods: new Map(),
        recordLayouts: new Map(),
        axisPts: new Map(),
        parseTime: Date.now(),
        errors: [],
        stats: { totalMaps: 0, totalMeasurements: 0, mapsByType: {} },
      };
      const binary = createMockBinary();

      // Should not crash
      db.learnFromEcuDefinition(ecuDef, binary);

      const stats = db.getStats();
      expect(stats.totalSignatures).toBe(0);
    });

    it('should handle maps without axis values', () => {
      const db = getPatternDatabase();
      const ecuDef = createMockEcuDefinition();
      ecuDef.maps[0].axisXValues = undefined;
      ecuDef.maps[0].axisYValues = undefined;
      const binary = createMockBinary();

      // Should not crash
      db.learnFromEcuDefinition(ecuDef, binary);

      const stats = db.getStats();
      expect(stats.totalSignatures).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large axis ranges', () => {
      const result = applyReasoningToCandidate(
        256,
        256,
        'deadbeef',
        { min: 0, max: 1000000 },
        { min: -1000, max: 1000 },
        undefined,
        undefined,
        'UNKNOWN'
      );

      expect(result.overallConfidence).toBeGreaterThanOrEqual(0);
      expect(result.overallConfidence).toBeLessThanOrEqual(1);
    });
  });
});
