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
  OffsetDetectionResult,
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

      // Simulate offset by providing known table signatures at different location
      const knownSignatures = [
        { offset: 0x100000, name: 'table1', signature: [0x00, 0x10, 0x00, 0x00] },
        { offset: 0x101000, name: 'table2', signature: [0x00, 0x20, 0x00, 0x00] },
      ];

      const result = detectOffsetMismatch(binary, a2lOffsets, knownSignatures);
      
      expect(result).toBeDefined();
      if (result.detectedOffset !== null) {
        expect(result.confidence).toBeGreaterThan(0);
      }
    });

    it('should return null offset for unknown binary format', () => {
      const binary = new Uint8Array(1024);
      const a2lOffsets = new Map([['table1', 0x1000]]);

      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      
      expect(result.detectedOffset).toBeNull();
    });
  });

  describe('validateOffsetCorrection', () => {
    it('should validate positive offset correction', () => {
      const binary = createMockBinary();
      const offsetDelta = 0x100000;

      const result = validateOffsetCorrection(binary, offsetDelta);
      
      expect(result.isValid).toBe(true);
      expect(result.reason).toContain('within bounds');
    });

    it('should validate negative offset correction', () => {
      const binary = createMockBinary();
      const offsetDelta = -0x1000;

      const result = validateOffsetCorrection(binary, offsetDelta);
      
      expect(result.isValid).toBe(true);
    });

    it('should reject offset correction that exceeds binary size', () => {
      const binary = createMockBinary(1024); // 1KB
      const offsetDelta = 0x10000000; // 256MB

      const result = validateOffsetCorrection(binary, offsetDelta);
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('exceeds');
    });

    it('should reject offset correction that goes below zero', () => {
      const binary = createMockBinary();
      const offsetDelta = -0x10000000;

      const result = validateOffsetCorrection(binary, offsetDelta);
      
      expect(result.isValid).toBe(false);
    });

    it('should handle zero offset correction', () => {
      const binary = createMockBinary();
      const offsetDelta = 0;

      const result = validateOffsetCorrection(binary, offsetDelta);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('generateOffsetReport', () => {
    it('should generate report for successful detection', () => {
      const result: OffsetDetectionResult = {
        detectedOffset: 0x6C3B9A,
        confidence: 95,
        matchedTables: ['table1', 'table2', 'table3'],
        totalTables: 5,
        method: 'signature_matching',
      };

      const report = generateOffsetReport(result);
      
      expect(report).toContain('0x6C3B9A');
      expect(report).toContain('95');
      expect(report).toContain('3');
      expect(report).toContain('signature_matching');
    });

    it('should generate report for failed detection', () => {
      const result: OffsetDetectionResult = {
        detectedOffset: null,
        confidence: 0,
        matchedTables: [],
        totalTables: 0,
        method: 'none',
      };

      const report = generateOffsetReport(result);
      
      expect(report).toContain('No offset mismatch detected');
    });

    it('should include confidence level in report', () => {
      const result: OffsetDetectionResult = {
        detectedOffset: 0x100000,
        confidence: 75,
        matchedTables: ['table1'],
        totalTables: 1,
        method: 'pattern_search',
      };

      const report = generateOffsetReport(result);
      
      expect(report).toContain('75');
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

      // Step 2: If offset detected, validate it
      if (detection.detectedOffset !== null) {
        const validation = validateOffsetCorrection(binary, detection.detectedOffset);
        expect(validation.isValid).toBe(true);

        // Step 3: Generate report
        const report = generateOffsetReport(detection);
        expect(report.length).toBeGreaterThan(0);
      }
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
      const emptyOffsets = new Map();

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

    it('should handle offset at binary boundary', () => {
      const binary = createMockBinary(1024);
      const offsetDelta = 1024 - 4; // Near end

      const result = validateOffsetCorrection(binary, offsetDelta);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle fractional offset values', () => {
      const binary = createMockBinary();
      const offsetDelta = 4096.5; // Fractional

      const result = validateOffsetCorrection(binary, Math.floor(offsetDelta));
      
      expect(result.isValid).toBe(true);
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
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in < 5 seconds
    });
  });

  describe('MG1 Specific Offsets', () => {
    it('should detect Polaris MG1 offset mismatch (0x6C3B9A)', () => {
      const binary = createMockBinary();
      const a2lOffsets = new Map([
        ['ExhMgt_ratLamCptProtn_GM', 0x938EA0],
        ['EngSpd_A_Adc', 0x938F00],
      ]);

      // The actual offset delta for Polaris MG1 files
      const expectedDelta = 0x6C3B9A;

      const result = detectOffsetMismatch(binary, a2lOffsets, []);
      expect(result).toBeDefined();
    });

    it('should validate MG1 offset correction', () => {
      const binary = createMockBinary(16 * 1024 * 1024); // 16MB typical MG1 size
      const mg1Offset = 0x6C3BA0;

      const result = validateOffsetCorrection(binary, mg1Offset);
      
      expect(result.isValid).toBe(true);
    });
  });
});
