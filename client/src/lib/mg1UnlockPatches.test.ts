import { describe, it, expect } from 'vitest';
import {
  applyDynojettPatch,
  applyHPTunersPatch,
  isDynojettPatched,
  isHPTunersPatched,
  getUnlockStatus,
  removeUnlockPatches,
} from './mg1UnlockPatches';

describe('MG1 Unlock Patches', () => {
  // Create a mock MG1 binary with proper header
  function createMockMG1Binary(size: number = 0x200000): Uint8Array {
    const binary = new Uint8Array(size);
    
    // Add MG1C marker at 0x1000
    const marker = new TextEncoder().encode('MG1C400A1T2');
    binary.set(marker, 0x1000);
    
    // Initialize with 0xFF (erased state)
    for (let i = 0; i < binary.length; i++) {
      if (i < 0x1000 || i >= 0x1000 + marker.length) {
        binary[i] = 0xFF;
      }
    }
    
    return binary;
  }

  describe('Dynojet Patch Detection', () => {
    it('should detect unpatched binary', () => {
      const binary = createMockMG1Binary();
      expect(isDynojettPatched(binary)).toBe(false);
    });

    it('should detect Dynojet patched binary', () => {
      const binary = createMockMG1Binary();
      binary[0x030363] = 0x03; // Dynojet unlock flag
      expect(isDynojettPatched(binary)).toBe(true);
    });
  });

  describe('HPTuners Patch Detection', () => {
    it('should detect unpatched binary', () => {
      const binary = createMockMG1Binary();
      expect(isHPTunersPatched(binary)).toBe(false);
    });

    it('should detect HPTuners patched binary', () => {
      const binary = createMockMG1Binary();
      binary[0x018e06] = 0x36; // HPTuners version byte 1
      binary[0x018e07] = 0x39; // HPTuners version byte 2
      binary[0x018e08] = 0x01; // HPTuners unlock flag
      expect(isHPTunersPatched(binary)).toBe(true);
    });
  });

  describe('Dynojet Patch Application', () => {
    it('should apply Dynojet patch to unpatched binary', () => {
      const binary = createMockMG1Binary();
      const result = applyDynojettPatch(binary);
      
      expect(result.success).toBe(true);
      expect(result.patchedBinary).toBeDefined();
      expect(result.patchesApplied.length).toBeGreaterThan(0);
      expect(result.patchedBinary![0x030363]).toBe(0x03);
    });

    it('should not re-patch already patched binary', () => {
      const binary = createMockMG1Binary();
      binary[0x030363] = 0x03;
      
      const result = applyDynojettPatch(binary);
      expect(result.success).toBe(true);
      expect(result.patchesApplied.some(p => p.includes('already patched'))).toBe(true);
    });

    it('should reject invalid binary', () => {
      const binary = new Uint8Array(100); // Too small, no MG1C marker
      const result = applyDynojettPatch(binary);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not detect');
    });
  });

  describe('HPTuners Patch Application', () => {
    it('should apply HPTuners patch to unpatched binary', () => {
      const binary = createMockMG1Binary();
      const result = applyHPTunersPatch(binary);
      
      expect(result.success).toBe(true);
      expect(result.patchedBinary).toBeDefined();
      expect(result.patchesApplied.length).toBeGreaterThan(0);
      expect(result.patchedBinary![0x018e06]).toBe(0x36);
      expect(result.patchedBinary![0x018e07]).toBe(0x39);
    });

    it('should not re-patch already patched binary', () => {
      const binary = createMockMG1Binary();
      binary[0x018e06] = 0x36;
      binary[0x018e07] = 0x39;
      binary[0x018e08] = 0x01;
      
      const result = applyHPTunersPatch(binary);
      expect(result.success).toBe(true);
      expect(result.patchesApplied.some(p => p.includes('already patched'))).toBe(true);
    });
  });

  describe('Unlock Status Detection', () => {
    it('should report locked binary', () => {
      const binary = createMockMG1Binary();
      const status = getUnlockStatus(binary);
      
      expect(status.isLocked).toBe(true);
      expect(status.isDynojettPatched).toBe(false);
      expect(status.isHPTunersPatched).toBe(false);
    });

    it('should report Dynojet patched binary', () => {
      const binary = createMockMG1Binary();
      binary[0x030363] = 0x03;
      
      const status = getUnlockStatus(binary);
      expect(status.isDynojettPatched).toBe(true);
      expect(status.isLocked).toBe(false);
    });

    it('should report HPTuners patched binary', () => {
      const binary = createMockMG1Binary();
      binary[0x018e06] = 0x36;
      binary[0x018e07] = 0x39;
      binary[0x018e08] = 0x01;
      
      const status = getUnlockStatus(binary);
      expect(status.isHPTunersPatched).toBe(true);
      expect(status.isLocked).toBe(false);
    });

    it('should report dual patched binary', () => {
      const binary = createMockMG1Binary();
      binary[0x030363] = 0x03;
      binary[0x018e06] = 0x36;
      binary[0x018e07] = 0x39;
      binary[0x018e08] = 0x01;
      
      const status = getUnlockStatus(binary);
      expect(status.isDynojettPatched).toBe(true);
      expect(status.isHPTunersPatched).toBe(true);
      expect(status.isLocked).toBe(false);
    });
  });

  describe('Patch Removal', () => {
    it('should remove Dynojet patches', () => {
      const binary = createMockMG1Binary();
      binary[0x030363] = 0x03;
      
      const result = removeUnlockPatches(binary);
      expect(result.success).toBe(true);
      expect(result.patchedBinary![0x030363]).toBe(0x00);
    });

    it('should remove HPTuners patches', () => {
      const binary = createMockMG1Binary();
      binary[0x018e06] = 0x36;
      binary[0x018e07] = 0x39;
      
      const result = removeUnlockPatches(binary);
      expect(result.success).toBe(true);
      expect(result.patchedBinary![0x018e06]).toBe(0x00);
      expect(result.patchedBinary![0x018e07]).toBe(0x00);
    });

    it('should remove both patches', () => {
      const binary = createMockMG1Binary();
      binary[0x030363] = 0x03;
      binary[0x018e06] = 0x36;
      binary[0x018e07] = 0x39;
      
      const result = removeUnlockPatches(binary);
      expect(result.success).toBe(true);
      expect(result.patchesApplied.length).toBeGreaterThan(0);
    });
  });

  describe('Binary Integrity', () => {
    it('should preserve original data when patching', () => {
      const binary = createMockMG1Binary();
      const original = new Uint8Array(binary);
      
      const result = applyDynojettPatch(binary);
      expect(result.patchedBinary!.length).toBe(original.length);
      
      // Check that only patch locations changed
      let changedCount = 0;
      for (let i = 0; i < original.length; i++) {
        if (result.patchedBinary![i] !== original[i]) {
          changedCount++;
        }
      }
      expect(changedCount).toBeGreaterThan(0);
      expect(changedCount).toBeLessThan(10); // Should only change a few bytes
    });

    it('should handle binary size correctly', () => {
      const binary = createMockMG1Binary(0x200000);
      const result = applyDynojettPatch(binary);
      
      expect(result.patchedSize).toBe(0x200000);
      expect(result.originalSize).toBe(0x200000);
    });
  });
});
