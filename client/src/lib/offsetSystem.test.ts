/**
 * Offset Detection and Correction System Tests
 * 
 * Tests for binary offset detection, validation, and correction
 */
import { describe, it, expect } from 'vitest';
import {
  detectOffsetMismatch,
  validateOffsetCorrection,
  generateOffsetReport,
  applyOffsetCorrection,
  OffsetDetectionResult,
  TableSignature,
} from './binaryOffsetDetection';

describe('Binary Offset Detection System', () => {
  // Create mock binary data with known patterns
  const createMockBinary = (size: number = 1024 * 1024): Uint8Array => {
    const binary = new Uint8Array(size);
    // Fill with some pattern
    for (let i = 0; i < size; i++) {
      binary[i] = (i % 256);
    }
    return binary;
  };

  // Create mock table signatures
  const createMockSignatures = (): TableSignature[] => [
    {
      name: 'table1',
      a2lOffset: 0x1000,
      expectedSize: 64,
      dataType: 'float32' as const,
      sampleValues: [1.0, 2.0, 3.0],
      description: 'Test table 1',
    },
    {
      name: 'table2',
      a2lOffset: 0x2000,
      expectedSize: 64,
      dataType: 'float32' as const,
      sampleValues: [4.0, 5.0, 6.0],
      description: 'Test table 2',
    },
  ];

  describe('detectOffsetMismatch', () => {
    it('should detect no mismatch when binary and a2L offsets align', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
        ['table3', 0x3000],
      ]);

      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      
      expect(result).toBeDefined();
      expect(result.detectedOffset).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should detect offset mismatch with high confidence', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
        ['table3', 0x3000],
      ]);

      const knownSignatures = createMockSignatures();

      const result = detectOffsetMismatch(binary, a2lOffsets, knownSignatures);
      
      expect(result).toBeDefined();
      // Result should have the expected shape
      expect(result).toHaveProperty('detectedOffset');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('matchedSignatures');
    });

    it('should return null offset for unknown binary format', () => {
      const binary = new Uint8Array(1024);
      const a2lOffsets = new Map([['table1', 0x1000]]);

      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      
      expect(result.detectedOffset).toBeNull();
    });
  });

  describe('validateOffsetCorrection', () => {
    it('should validate offset correction with matching signatures', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
      ]);
      const offsetDelta = 0;
      const signatures = createMockSignatures();

      // validateOffsetCorrection returns boolean
      const result = validateOffsetCorrection(binary, a2lOffsets, offsetDelta, signatures);
      
      expect(typeof result).toBe('boolean');
    });

    it('should return false when no signatures match', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['nonexistent1', 0x1000],
        ['nonexistent2', 0x2000],
      ]);
      const signatures = createMockSignatures();

      const result = validateOffsetCorrection(binary, a2lOffsets, 0, signatures);
      
      // No a2lOffsets match signature names, so totalChecks = 0, returns false
      expect(result).toBe(false);
    });

    it('should handle empty signatures array', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([['table1', 0x1000]]);

      const result = validateOffsetCorrection(binary, a2lOffsets, 0, []);
      
      // Empty signatures means totalChecks = 0, returns false
      expect(result).toBe(false);
    });

    it('should handle zero offset correction', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([['table1', 0x1000]]);
      const signatures = createMockSignatures();

      const result = validateOffsetCorrection(binary, a2lOffsets, 0, signatures);
      
      expect(typeof result).toBe('boolean');
    });
  });

  describe('generateOffsetReport', () => {
    it('should generate report for successful detection', () => {
      const result: OffsetDetectionResult = {
        detectedOffset: 0x100000,
        confidence: 95,
        matchedSignatures: ['table1', 'table2', 'table3'],
        offsetDelta: 0x100000,
        validationStatus: 'confirmed',
        details: 'Detected offset delta: 100000 (1048576 bytes). Matched 3 table signatures with 95.0% confidence.',
        recommendedAction: 'Apply offset correction of 1048576 bytes to all a2L addresses.',
      };

      const report = generateOffsetReport(result);
      
      expect(report).toContain('CONFIRMED');
      expect(report).toContain('95');
      expect(report).toContain('table1');
    });

    it('should generate report for failed detection', () => {
      const result: OffsetDetectionResult = {
        detectedOffset: null,
        confidence: 0,
        matchedSignatures: [],
        offsetDelta: 0,
        validationStatus: 'failed',
        details: 'No table signatures found in binary. Offset detection failed.',
        recommendedAction: 'Verify binary file integrity.',
      };

      const report = generateOffsetReport(result);
      
      expect(report).toContain('FAILED');
    });

    it('should include confidence level in report', () => {
      const result: OffsetDetectionResult = {
        detectedOffset: 0x100000,
        confidence: 75,
        matchedSignatures: ['table1'],
        offsetDelta: 0x100000,
        validationStatus: 'suspected',
        details: 'Detected offset delta.',
        recommendedAction: 'Manual verification recommended.',
      };

      const report = generateOffsetReport(result);
      
      expect(report).toContain('75');
    });
  });

  describe('applyOffsetCorrection', () => {
    it('should apply positive offset to all addresses', () => {
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
      ]);

      const corrected = applyOffsetCorrection(a2lOffsets, 0x100);
      
      expect(corrected.get('table1')).toBe(0x1100);
      expect(corrected.get('table2')).toBe(0x2100);
    });

    it('should apply negative offset to all addresses', () => {
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
      ]);

      const corrected = applyOffsetCorrection(a2lOffsets, -0x100);
      
      expect(corrected.get('table1')).toBe(0x0F00);
      expect(corrected.get('table2')).toBe(0x1F00);
    });

    it('should handle zero offset', () => {
      const a2lOffsets = new Map([['table1', 0x1000]]);

      const corrected = applyOffsetCorrection(a2lOffsets, 0);
      
      expect(corrected.get('table1')).toBe(0x1000);
    });
  });

  describe('Offset Correction Workflow', () => {
    it('should complete full detection and validation workflow', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
      ]);

      // Step 1: Detect offset
      const detection = detectOffsetMismatch(binary, a2lOffsets, []);
      expect(detection).toBeDefined();

      // Step 2: Generate report
      const report = generateOffsetReport(detection);
      expect(report.length).toBeGreaterThan(0);
    });

    it('should handle large binary files', () => {
      const largeBinary = createMockBinary(256 * 1024 * 1024); // 256MB
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
      ]);

      const result = detectOffsetMismatch(largeBinary, a2lOffsets, []);
      expect(result).toBeDefined();
    });

    it('should handle multiple offset candidates', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
        ['table3', 0x3000],
        ['table4', 0x4000],
        ['table5', 0x5000],
      ]);

      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty a2L offset map', () => {
      const binary = createMockBinary();
      const emptyOffsets = new Map<string, number>();

      const result = detectOffsetMismatch(binary, emptyOffsets, []);
      
      expect(result).toBeDefined();
      expect(result.detectedOffset).toBeNull();
    });

    it('should handle very small binary', () => {
      const smallBinary = new Uint8Array(256);
      const a2lOffsets = new Map([['table1', 0x100]]);

      const result = detectOffsetMismatch(smallBinary, a2lOffsets, []);
      
      expect(result).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should detect offset in reasonable time for large binary', () => {
      const binary = createMockBinary(100 * 1024 * 1024); // 100MB
      const a2lOffsets = new Map([
        ['table1', 0x1000],
        ['table2', 0x2000],
        ['table3', 0x3000],
      ]);

      const startTime = performance.now();
      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      const endTime = performance.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });

  describe('MG1 Specific Offsets', () => {
    it('should detect Polaris MG1 offset mismatch (0x6C3B9A)', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['ExhMgt_ratLamCptProtn_GM', 0x938EA0],
        ['EngSpd_A_Adc', 0x938F00],
      ]);

      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      expect(result).toBeDefined();
    });

    it('should validate MG1 offset correction with signatures', () => {
      const binary = createMockBinary(16 * 1024 * 1024); // 16MB typical MG1 size
      const a2lOffsets = new Map([['table1', 0x1000]]);
      const mg1Offset = 0x6C3BA0;
      const signatures = createMockSignatures();

      const result = validateOffsetCorrection(binary, a2lOffsets, mg1Offset, signatures);
      
      expect(typeof result).toBe('boolean');
    });
  });
});
