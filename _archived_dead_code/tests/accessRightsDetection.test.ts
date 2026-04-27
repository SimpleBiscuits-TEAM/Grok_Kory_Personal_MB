/**
 * Tests for Access Rights Detection System
 */

import { describe, it, expect } from 'vitest';
import {
  detectAccessRights,
  testWriteCapabilityOBDII,
  getAccessBadge,
  getAccessBadgeColor,
  getAccessTooltip,
  detectAccessRightsBatch,
  getAccessStatistics,
  AccessRights,
} from './accessRightsDetection';
import { CalibrationMap, EcuDefinition } from './editorEngine';

describe('accessRightsDetection', () => {
  /**
   * Create a mock calibration map
   */
  function createMockMap(overrides?: Partial<CalibrationMap>): CalibrationMap {
    return {
      name: 'Test_Map',
      description: 'Test calibration map',
      type: 'MAP',
      address: 0x50000,
      recordLayout: 'UWORD_2D',
      compuMethod: 'IDENTITY',
      lowerLimit: 0,
      upperLimit: 65535,
      annotations: [],
      axes: [],
      rows: 16,
      cols: 16,
      rawValues: Array(256).fill(100),
      category: 'Fuel',
      level: 5,
      ...overrides,
    };
  }

  /**
   * Create a mock ECU definition
   */
  function createMockEcuDef(family: string = 'MG1CA920'): EcuDefinition {
    return {
      source: 'a2l',
      fileName: 'test.a2l',
      ecuFamily: family,
      moduleInfo: {
        name: 'Test ECU',
        comment: 'Test',
        byteOrder: 'MSB_LAST',
      },
      maps: [],
      measurements: [],
      compuMethods: new Map(),
      recordLayouts: new Map(),
      axisPts: new Map(),
      parseTime: Date.now(),
      errors: [],
      stats: { totalMaps: 0, totalMeasurements: 0, mapsByType: {} },
    };
  }

  describe('detectAccessRights', () => {
    it('should detect read-write access for RAM addresses', () => {
      const map = createMockMap({ address: 0x50000 });
      const ecuDef = createMockEcuDef('MG1CA920');

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(true);
      expect(rights.canLiveTune).toBe(true);
      expect(rights.source).toBe('memory_heuristics');
    });

    it('should detect read-only access for Flash addresses', () => {
      const map = createMockMap({ address: 0x200000 });
      const ecuDef = createMockEcuDef('MG1CA920');

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(false);
      expect(rights.canLiveTune).toBe(false);
      expect(rights.source).toBe('memory_heuristics');
    });

    it('should respect A2L metadata when present', () => {
      const map = createMockMap({
        address: 0x50000,
        annotations: ['READ_WRITE', 'Calibration'],
      });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(true);
      expect(rights.source).toBe('a2l_metadata');
      expect(rights.confidence).toBeGreaterThan(0.8);
    });

    it('should detect read-only from A2L metadata', () => {
      const map = createMockMap({
        address: 0x50000,
        annotations: ['READ_ONLY', 'Measurement'],
      });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(false);
      expect(rights.source).toBe('a2l_metadata');
    });

    it('should infer RW for calibration category', () => {
      const map = createMockMap({
        address: 0x50000,
        category: 'Calibration',
      });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.write).toBe(true);
      expect(rights.canLiveTune).toBe(true);
    });

    it('should handle different ECU families', () => {
      const map = createMockMap({ address: 0x50000 });

      const boschRights = detectAccessRights(map, createMockEcuDef('MED17'));
      const mg1Rights = detectAccessRights(map, createMockEcuDef('MG1CA920'));

      // Both should be RW for low addresses
      expect(boschRights.write).toBe(true);
      expect(mg1Rights.write).toBe(true);
    });

    it('should have confidence between 0 and 1', () => {
      const map = createMockMap();
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.confidence).toBeGreaterThanOrEqual(0);
      expect(rights.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Memory Region Detection', () => {
    it('should correctly identify internal RAM addresses', () => {
      const map = createMockMap({ address: 0x10000 });
      const ecuDef = createMockEcuDef('MG1CA920');

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(true);
      expect(rights.reasoning).toContain('Internal RAM');
    });

    it('should correctly identify calibration RAM addresses', () => {
      const map = createMockMap({ address: 0x150000 });
      const ecuDef = createMockEcuDef('MED17');

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.write).toBe(true);
      expect(rights.reasoning).toContain('Loadable');
    });

    it('should correctly identify Flash ROM addresses', () => {
      const map = createMockMap({ address: 0x300000 });
      const ecuDef = createMockEcuDef('MED17');

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(false);
      expect(rights.reasoning).toContain('Flash');
    });

    it('should correctly identify EEPROM addresses', () => {
      const map = createMockMap({ address: 0x800100 });
      const ecuDef = createMockEcuDef('MED17');

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.write).toBe(true);
      expect(rights.reasoning).toContain('EEPROM');
    });

    it('should handle unknown addresses conservatively', () => {
      const map = createMockMap({ address: 0xdeadbeef });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(false);
      expect(rights.confidence).toBeLessThan(0.5);
    });
  });

  describe('Access Badge Helpers', () => {
    it('should generate correct badge for read-write access', () => {
      const rights: AccessRights = {
        read: true,
        write: true,
        canLiveTune: true,
        confidence: 0.95,
        source: 'memory_heuristics',
        reasoning: 'Test',
      };

      const badge = getAccessBadge(rights);
      expect(badge).toContain('Read-Write');
      expect(badge).toContain('🔓');
    });

    it('should generate correct badge for read-only access', () => {
      const rights: AccessRights = {
        read: true,
        write: false,
        canLiveTune: false,
        confidence: 0.95,
        source: 'memory_heuristics',
        reasoning: 'Test',
      };

      const badge = getAccessBadge(rights);
      expect(badge).toContain('Read-Only');
      expect(badge).toContain('🔒');
    });

    it('should generate correct badge for no access', () => {
      const rights: AccessRights = {
        read: false,
        write: false,
        canLiveTune: false,
        confidence: 0.95,
        source: 'memory_heuristics',
        reasoning: 'Test',
      };

      const badge = getAccessBadge(rights);
      expect(badge).toContain('No Access');
      expect(badge).toContain('❌');
    });

    it('should generate correct color for read-write', () => {
      const rights: AccessRights = {
        read: true,
        write: true,
        canLiveTune: true,
        confidence: 0.95,
        source: 'memory_heuristics',
        reasoning: 'Test',
      };

      const color = getAccessBadgeColor(rights);
      expect(color).toContain('green');
    });

    it('should generate correct color for read-only', () => {
      const rights: AccessRights = {
        read: true,
        write: false,
        canLiveTune: false,
        confidence: 0.95,
        source: 'memory_heuristics',
        reasoning: 'Test',
      };

      const color = getAccessBadgeColor(rights);
      expect(color).toContain('blue');
    });

    it('should generate informative tooltip', () => {
      const rights: AccessRights = {
        read: true,
        write: true,
        canLiveTune: true,
        confidence: 0.95,
        source: 'memory_heuristics',
        reasoning: 'Test reason',
      };

      const tooltip = getAccessTooltip(rights);
      expect(tooltip).toContain('Read: ✓');
      expect(tooltip).toContain('Write: ✓');
      expect(tooltip).toContain('Live Tune: ✓');
      expect(tooltip).toContain('95%');
      expect(tooltip).toContain('memory_heuristics');
      expect(tooltip).toContain('Test reason');
    });
  });

  describe('Batch Access Detection', () => {
    it('should detect access rights for multiple maps', () => {
      const maps = [
        createMockMap({ name: 'Map1', address: 0x50000 }),
        createMockMap({ name: 'Map2', address: 0x200000 }),
        createMockMap({ name: 'Map3', address: 0x10000 }),
      ];
      const ecuDef = createMockEcuDef();

      const results = detectAccessRightsBatch(maps, ecuDef);

      expect(results.size).toBe(3);
      expect(results.has('Map1')).toBe(true);
      expect(results.has('Map2')).toBe(true);
      expect(results.has('Map3')).toBe(true);
    });

    it('should return different access rights for different addresses', () => {
      const maps = [
        createMockMap({ name: 'RAM_Map', address: 0x50000 }),
        createMockMap({ name: 'Flash_Map', address: 0x300000 }),
      ];
      const ecuDef = createMockEcuDef();

      const results = detectAccessRightsBatch(maps, ecuDef);

      const ramRights = results.get('RAM_Map')!;
      const flashRights = results.get('Flash_Map')!;

      expect(ramRights.write).toBe(true);
      expect(flashRights.write).toBe(false);
    });
  });

  describe('Access Statistics', () => {
    it('should calculate correct statistics', () => {
      const accessRights = new Map<string, AccessRights>([
        [
          'Map1',
          {
            read: true,
            write: true,
            canLiveTune: true,
            confidence: 0.95,
            source: 'memory_heuristics',
            reasoning: 'Test',
          },
        ],
        [
          'Map2',
          {
            read: true,
            write: false,
            canLiveTune: false,
            confidence: 0.95,
            source: 'memory_heuristics',
            reasoning: 'Test',
          },
        ],
        [
          'Map3',
          {
            read: true,
            write: true,
            canLiveTune: true,
            confidence: 0.95,
            source: 'memory_heuristics',
            reasoning: 'Test',
          },
        ],
      ]);

      const stats = getAccessStatistics(accessRights);

      expect(stats.total).toBe(3);
      expect(stats.readable).toBe(3);
      expect(stats.writable).toBe(2);
      expect(stats.liveTunable).toBe(2);
      expect(stats.percentWritable).toBeCloseTo(66.67, 1);
    });

    it('should handle empty access rights', () => {
      const accessRights = new Map<string, AccessRights>();

      const stats = getAccessStatistics(accessRights);

      expect(stats.total).toBe(0);
      expect(stats.readable).toBe(0);
      expect(stats.writable).toBe(0);
      expect(stats.percentWritable).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle maps with no category', () => {
      const map = createMockMap({ address: 0x50000, category: undefined });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.confidence).toBeGreaterThanOrEqual(0);
      expect(rights.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle maps with empty annotations', () => {
      const map = createMockMap({ address: 0x50000, annotations: [] });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should handle address 0x0', () => {
      const map = createMockMap({ address: 0x0 });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.read).toBe(true);
      expect(rights.write).toBe(true);
    });

    it('should handle very large addresses', () => {
      const map = createMockMap({ address: 0xffffffff });
      const ecuDef = createMockEcuDef();

      const rights = detectAccessRights(map, ecuDef);

      expect(rights.confidence).toBeGreaterThanOrEqual(0);
      expect(rights.confidence).toBeLessThanOrEqual(1);
    });
  });
});
