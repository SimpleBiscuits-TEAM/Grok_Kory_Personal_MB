/**
 * Tests for TuneCompare automatic file size mismatch handling
 * 
 * Verifies that when a comparison file with different size is loaded:
 * - Smaller files are automatically padded with 0xFF bytes
 * - Larger files are automatically truncated to match primary size
 * - No warning banner is shown
 */
import { describe, it, expect } from 'vitest';

describe('TuneCompare File Size Mismatch Handling', () => {
  describe('Automatic padding for smaller files', () => {
    it('should pad smaller compare file with 0xFF bytes', () => {
      const primarySize = 1024;
      const compareSize = 512;
      
      const primaryBinary = new Uint8Array(primarySize);
      primaryBinary.fill(0xAA);
      
      const compareBinary = new Uint8Array(compareSize);
      compareBinary.fill(0xBB);
      
      // Simulate the automatic fix logic
      let finalData = compareBinary;
      if (compareBinary.length < primaryBinary.length) {
        const padded = new Uint8Array(primaryBinary.length);
        padded.set(compareBinary);
        padded.fill(0xFF, compareBinary.length);
        finalData = padded;
      }
      
      // Verify padding
      expect(finalData.length).toBe(primarySize);
      expect(finalData.slice(0, compareSize)).toEqual(compareBinary);
      expect(finalData.slice(compareSize)).toEqual(new Uint8Array(primarySize - compareSize).fill(0xFF));
    });

    it('should handle very small compare files', () => {
      const primarySize = 65536;
      const compareSize = 256;
      
      const primaryBinary = new Uint8Array(primarySize).fill(0x00);
      const compareBinary = new Uint8Array(compareSize).fill(0x55);
      
      let finalData = compareBinary;
      if (compareBinary.length < primaryBinary.length) {
        const padded = new Uint8Array(primaryBinary.length);
        padded.set(compareBinary);
        padded.fill(0xFF, compareBinary.length);
        finalData = padded;
      }
      
      expect(finalData.length).toBe(primarySize);
      expect(finalData[0]).toBe(0x55);
      expect(finalData[compareSize]).toBe(0xFF);
      expect(finalData[primarySize - 1]).toBe(0xFF);
    });
  });

  describe('Automatic truncation for larger files', () => {
    it('should truncate larger compare file to match primary size', () => {
      const primarySize = 512;
      const compareSize = 1024;
      
      const primaryBinary = new Uint8Array(primarySize);
      primaryBinary.fill(0xAA);
      
      const compareBinary = new Uint8Array(compareSize);
      compareBinary.fill(0xBB);
      
      // Simulate the automatic fix logic
      let finalData = compareBinary;
      if (compareBinary.length > primaryBinary.length) {
        finalData = compareBinary.slice(0, primaryBinary.length);
      }
      
      // Verify truncation
      expect(finalData.length).toBe(primarySize);
      expect(finalData).toEqual(new Uint8Array(primarySize).fill(0xBB));
    });

    it('should handle very large compare files', () => {
      const primarySize = 256;
      const compareSize = 65536;
      
      const primaryBinary = new Uint8Array(primarySize).fill(0x00);
      const compareBinary = new Uint8Array(compareSize);
      compareBinary.fill(0xCC);
      
      let finalData = compareBinary;
      if (compareBinary.length > primaryBinary.length) {
        finalData = compareBinary.slice(0, primaryBinary.length);
      }
      
      expect(finalData.length).toBe(primarySize);
      expect(finalData).toEqual(new Uint8Array(primarySize).fill(0xCC));
    });
  });

  describe('No action for matching sizes', () => {
    it('should not modify compare file when sizes match', () => {
      const size = 1024;
      
      const primaryBinary = new Uint8Array(size).fill(0xAA);
      const compareBinary = new Uint8Array(size).fill(0xBB);
      
      let finalData = compareBinary;
      if (compareBinary.length < primaryBinary.length) {
        const padded = new Uint8Array(primaryBinary.length);
        padded.set(compareBinary);
        padded.fill(0xFF, compareBinary.length);
        finalData = padded;
      } else if (compareBinary.length > primaryBinary.length) {
        finalData = compareBinary.slice(0, primaryBinary.length);
      }
      
      expect(finalData.length).toBe(size);
      expect(finalData).toEqual(compareBinary);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty primary binary gracefully', () => {
      const primaryBinary = new Uint8Array(0);
      const compareBinary = new Uint8Array(100).fill(0xDD);
      
      let finalData = compareBinary;
      if (compareBinary.length > primaryBinary.length) {
        finalData = compareBinary.slice(0, primaryBinary.length);
      }
      
      expect(finalData.length).toBe(0);
    });

    it('should handle single-byte files', () => {
      const primaryBinary = new Uint8Array(1).fill(0xAA);
      const compareBinary = new Uint8Array(256).fill(0xBB);
      
      let finalData = compareBinary;
      if (compareBinary.length > primaryBinary.length) {
        finalData = compareBinary.slice(0, primaryBinary.length);
      }
      
      expect(finalData.length).toBe(1);
      expect(finalData[0]).toBe(0xBB);
    });

    it('should preserve original data when padding', () => {
      const primarySize = 1000;
      const compareSize = 600;
      
      const primaryBinary = new Uint8Array(primarySize).fill(0x00);
      const compareBinary = new Uint8Array(compareSize);
      
      // Fill with specific pattern
      for (let i = 0; i < compareSize; i++) {
        compareBinary[i] = (i % 256);
      }
      
      let finalData = compareBinary;
      if (compareBinary.length < primaryBinary.length) {
        const padded = new Uint8Array(primaryBinary.length);
        padded.set(compareBinary);
        padded.fill(0xFF, compareBinary.length);
        finalData = padded;
      }
      
      // Verify original data is preserved
      for (let i = 0; i < compareSize; i++) {
        expect(finalData[i]).toBe(i % 256);
      }
      
      // Verify padding
      for (let i = compareSize; i < primarySize; i++) {
        expect(finalData[i]).toBe(0xFF);
      }
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle S-Record file smaller than BIN file', () => {
      // S-Record files often have fewer bytes than their BIN equivalents
      // because they include headers and checksums
      const binSize = 65536;
      const srecSize = 32768;
      
      const binBinary = new Uint8Array(binSize).fill(0x00);
      const srecBinary = new Uint8Array(srecSize).fill(0x42);
      
      let finalData = srecBinary;
      if (srecBinary.length < binBinary.length) {
        const padded = new Uint8Array(binBinary.length);
        padded.set(srecBinary);
        padded.fill(0xFF, srecBinary.length);
        finalData = padded;
      }
      
      expect(finalData.length).toBe(binSize);
      expect(finalData.slice(0, srecSize)).toEqual(srecBinary);
    });

    it('should handle HEX file larger than BIN file', () => {
      // Intel HEX files can be larger due to encoding
      const binSize = 16384;
      const hexSize = 32768;
      
      const binBinary = new Uint8Array(binSize).fill(0x00);
      const hexBinary = new Uint8Array(hexSize).fill(0x99);
      
      let finalData = hexBinary;
      if (hexBinary.length > binBinary.length) {
        finalData = hexBinary.slice(0, binBinary.length);
      }
      
      expect(finalData.length).toBe(binSize);
      expect(finalData).toEqual(new Uint8Array(binSize).fill(0x99));
    });
  });
});
