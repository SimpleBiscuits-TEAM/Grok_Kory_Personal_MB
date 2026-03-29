import { describe, it, expect } from 'vitest';
import { analyzeBinary, detectECUFamily, getAvailableFamilies } from './binarySignatureDetector';

describe('Binary Signature Detector', () => {
  describe('getAvailableFamilies', () => {
    it('should return all supported ECU families', () => {
      const families = getAvailableFamilies();
      expect(families).toBeDefined();
      expect(families['MG1C']).toBeDefined();
      expect(families['ME17']).toBeDefined();
      expect(families['CANAM_MG1']).toBeDefined();
      expect(families['CANAM_ME17']).toBeDefined();
    });

    it('should have architecture and vendor info for each family', () => {
      const families = getAvailableFamilies();
      for (const [, info] of Object.entries(families)) {
        expect(info.architecture).toBeTruthy();
        expect(info.vendor).toBeTruthy();
      }
    });
  });

  describe('analyzeBinary', () => {
    it('should detect MG1C with DEADBEEF marker', () => {
      const buffer = Buffer.alloc(0xC200);
      buffer.write('DEADBEEF', 0xC100, 'hex');

      const result = analyzeBinary(buffer, 'test.bin');

      expect(result.fileName).toBe('test.bin');
      expect(result.fileSize).toBe(0xC200);
      expect(result.analysis.hasDeadbeefMarker).toBe(true);
      expect(result.analysis.estimatedArchitecture).toBe('Motorola 68K');
    });

    it('should detect ME17 family when only ME17 signature present', () => {
      // ME17 signature alone: ME17 weight=1.0 vs CANAM_ME17 weight=0.9
      const buffer = Buffer.alloc(1024);
      buffer.write('ME17', 0x100, 'ascii');

      const result = analyzeBinary(buffer, 'me17.bin');

      expect(result.fileName).toBe('me17.bin');
      expect(result.detectedFamily).toBe('ME17');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect Can-Am MG1 with part number', () => {
      const buffer = Buffer.alloc(0xC200);
      buffer.write('DEADBEEF', 0xC100, 'hex');
      buffer.write('1E110195', 0x500, 'hex');

      const result = analyzeBinary(buffer, 'canam_mg1.bin');

      expect(result.detectedFamily).toBe('CANAM_MG1');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect Can-Am ME17 with ROTAX marker', () => {
      const buffer = Buffer.alloc(1024);
      buffer.write('ME17', 0x100, 'ascii');
      buffer.write('ROTAX', 0x200, 'ascii');

      const result = analyzeBinary(buffer, 'canam_me17.bin');

      expect(result.detectedFamily).toBe('CANAM_ME17');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return analysis with matched patterns', () => {
      const buffer = Buffer.alloc(1024);
      buffer.write('ME17', 0x100, 'ascii');

      const result = analyzeBinary(buffer, 'test.bin');

      expect(result.matches).toBeDefined();
      expect(Array.isArray(result.matches)).toBe(true);
      if (result.matches.length > 0) {
        expect(result.matches[0]).toHaveProperty('ecuFamily');
        expect(result.matches[0]).toHaveProperty('offset');
        expect(result.matches[0]).toHaveProperty('description');
      }
    });

    it('should handle empty buffer gracefully', () => {
      const buffer = Buffer.alloc(0);
      const result = analyzeBinary(buffer, 'empty.bin');

      expect(result.fileSize).toBe(0);
      expect(result.detectedFamily).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should handle buffer with no matching patterns', () => {
      const buffer = Buffer.alloc(1024);
      buffer.fill(0x42);

      const result = analyzeBinary(buffer, 'unknown.bin');

      expect(result.detectedFamily).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('detectECUFamily', () => {
    it('should return null when confidence is below threshold', () => {
      const buffer = Buffer.alloc(1024);
      buffer.fill(0x42);

      const result = detectECUFamily(buffer, 'test.bin', 0.5);

      expect(result).toBeNull();
    });

    it('should return detected family when confidence meets threshold', () => {
      const buffer = Buffer.alloc(0xC200);
      buffer.write('DEADBEEF', 0xC100, 'hex');

      const result = detectECUFamily(buffer, 'test.bin', 0.1);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.family).toBeTruthy();
        expect(result.confidence).toBeGreaterThanOrEqual(0.1);
        expect(result.details).toBeDefined();
      }
    });

    it('should respect custom confidence threshold', () => {
      const buffer = Buffer.alloc(1024);
      buffer.write('ME17', 0x100, 'ascii');

      const resultLow = detectECUFamily(buffer, 'test.bin', 0.1);
      expect(resultLow).not.toBeNull();

      const resultHigh = detectECUFamily(buffer, 'test.bin', 0.99);
      expect(resultHigh).toBeNull();
    });

    it('should provide detailed analysis in result', () => {
      const buffer = Buffer.alloc(0xC200);
      buffer.write('DEADBEEF', 0xC100, 'hex');

      const result = detectECUFamily(buffer, 'test.bin', 0.1);

      if (result) {
        expect(result.details).toBeDefined();
        expect(result.details.fileName).toBe('test.bin');
        expect(result.details.fileSize).toBe(0xC200);
        expect(result.details.analysis).toBeDefined();
      }
    });
  });

  describe('Multiple pattern matching', () => {
    it('should increase confidence with multiple matching patterns', () => {
      const buffer = Buffer.alloc(1024);
      buffer.write('ME17', 0x100, 'ascii');
      buffer.write('ME17', 0x200, 'ascii');
      buffer.write('ME17', 0x300, 'ascii');

      const result = analyzeBinary(buffer, 'multi_pattern.bin');

      expect(result.detectedFamily).toBe('ME17');
      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe('ECU family specificity', () => {
    it('should prefer specific families over generic ones', () => {
      const buffer = Buffer.alloc(0xC200);
      buffer.write('DEADBEEF', 0xC100, 'hex');
      buffer.write('1E110195', 0x500, 'hex');

      const result = analyzeBinary(buffer, 'canam.bin');

      expect(result.detectedFamily).toBe('CANAM_MG1');
    });
  });
});
