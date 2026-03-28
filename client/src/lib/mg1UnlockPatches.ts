/**
 * Polaris MG1 Unlock Patches
 * 
 * Implements unlock patches for Dynojet and HPTuners on Polaris MG1 ECUs
 * Supports: MG1C400A1T2 (Polaris Spyder/Maverick)
 */

export interface UnlockPatchResult {
  success: boolean;
  message: string;
  patchedBinary?: Uint8Array;
  patchesApplied: string[];
  originalSize: number;
  patchedSize: number;
}

export interface PatchLocation {
  offset: number;
  originalValue: Uint8Array;
  patchValue: Uint8Array;
  description: string;
}

/**
 * Dynojet unlock patches for MG1 ECUs
 */
const DYNOJET_PATCHES: Record<string, PatchLocation[]> = {
  'MG1C400A1T2': [
    {
      offset: 0x030363,
      originalValue: new Uint8Array([0x00]),
      patchValue: new Uint8Array([0x03]),
      description: 'Dynojet unlock flag at 0x030363',
    },
    {
      offset: 0x030364,
      originalValue: new Uint8Array([0x00]),
      patchValue: new Uint8Array([0x00]),
      description: 'Dynojet security byte at 0x030364',
    },
  ],
  'MG1CA920': [
    {
      offset: 0x030363,
      originalValue: new Uint8Array([0x00]),
      patchValue: new Uint8Array([0x03]),
      description: 'Dynojet unlock flag at 0x030363',
    },
  ],
};

/**
 * HPTuners unlock patches for MG1 ECUs
 */
const HPTUNERS_PATCHES: Record<string, PatchLocation[]> = {
  'MG1C400A1T2': [
    {
      offset: 0x018e06,
      originalValue: new Uint8Array([0x00, 0x00]),
      patchValue: new Uint8Array([0x36, 0x39]),
      description: 'HPTuners version signature at 0x018e06',
    },
    {
      offset: 0x018e08,
      originalValue: new Uint8Array([0x00]),
      patchValue: new Uint8Array([0x01]),
      description: 'HPTuners unlock flag at 0x018e08',
    },
  ],
  'MG1CA920': [
    {
      offset: 0x018e06,
      originalValue: new Uint8Array([0x00, 0x00]),
      patchValue: new Uint8Array([0x36, 0x39]),
      description: 'HPTuners version signature at 0x018e06',
    },
  ],
};

/**
 * Detect ECU family from binary
 */
function detectECUFamily(binary: Uint8Array): string | null {
  // Look for MG1C marker
  const marker = binary.slice(0x1000, 0x1004);
  const markerStr = new TextDecoder('ascii').decode(marker);
  
  if (markerStr.startsWith('MG1C')) {
    // Extract full ECU ID (typically at 0x1000-0x1012)
    const ecuIdBytes = binary.slice(0x1000, 0x1012);
    const ecuId = new TextDecoder('ascii', { fatal: false }).decode(ecuIdBytes).trim();
    
    // Return the family based on full ID
    if (ecuId.includes('MG1C400A1T2')) return 'MG1C400A1T2';
    if (ecuId.includes('MG1CA920')) return 'MG1CA920';
    
    // Fallback to MG1C400A1T2 if just MG1C marker is present
    return 'MG1C400A1T2';
  }
  
  return null;
}

/**
 * Check if binary is already patched with Dynojet unlock
 */
export function isDynojettPatched(binary: Uint8Array): boolean {
  const family = detectECUFamily(binary);
  if (!family || !DYNOJET_PATCHES[family]) return false;
  
  const patches = DYNOJET_PATCHES[family];
  // Check if the primary unlock flag is set (first patch)
  const primaryPatch = patches[0];
  if (primaryPatch.offset + primaryPatch.patchValue.length > binary.length) return false;
  
  const actual = binary.slice(primaryPatch.offset, primaryPatch.offset + primaryPatch.patchValue.length);
  return arraysEqual(actual, primaryPatch.patchValue);
}

/**
 * Check if binary is already patched with HPTuners unlock
 */
export function isHPTunersPatched(binary: Uint8Array): boolean {
  const family = detectECUFamily(binary);
  if (!family || !HPTUNERS_PATCHES[family]) return false;
  
  const patches = HPTUNERS_PATCHES[family];
  // Check if the primary unlock signature is set (first patch)
  const primaryPatch = patches[0];
  if (primaryPatch.offset + primaryPatch.patchValue.length > binary.length) return false;
  
  const actual = binary.slice(primaryPatch.offset, primaryPatch.offset + primaryPatch.patchValue.length);
  return arraysEqual(actual, primaryPatch.patchValue);
}

/**
 * Apply Dynojet unlock patch to MG1 binary
 */
export function applyDynojettPatch(binary: Uint8Array): UnlockPatchResult {
  const family = detectECUFamily(binary);
  
  if (!family) {
    return {
      success: false,
      message: 'Could not detect MG1 ECU family. Binary may not be a valid Polaris MG1 file.',
      patchesApplied: [],
      originalSize: binary.length,
      patchedSize: binary.length,
    };
  }
  
  if (!DYNOJET_PATCHES[family]) {
    return {
      success: false,
      message: `Dynojet unlock patches not available for ECU family: ${family}`,
      patchesApplied: [],
      originalSize: binary.length,
      patchedSize: binary.length,
    };
  }
  
  // Create a copy to patch
  const patched = new Uint8Array(binary);
  const patches = DYNOJET_PATCHES[family];
  const appliedPatches: string[] = [];
  
  for (const patch of patches) {
    if (patch.offset + patch.patchValue.length > patched.length) {
      return {
        success: false,
        message: `Patch offset 0x${patch.offset.toString(16)} is outside binary bounds`,
        patchesApplied: appliedPatches,
        originalSize: binary.length,
        patchedSize: patched.length,
      };
    }
    
    // Check if already patched
    const current = patched.slice(patch.offset, patch.offset + patch.patchValue.length);
    if (arraysEqual(current, patch.patchValue)) {
      appliedPatches.push(`${patch.description} (already patched)`);
      continue;
    }
    
    // Apply patch
    patched.set(patch.patchValue, patch.offset);
    appliedPatches.push(patch.description);
  }
  
  return {
    success: true,
    message: `Dynojet unlock successfully applied to ${family}`,
    patchedBinary: patched,
    patchesApplied: appliedPatches,
    originalSize: binary.length,
    patchedSize: patched.length,
  };
}

/**
 * Apply HPTuners unlock patch to MG1 binary
 */
export function applyHPTunersPatch(binary: Uint8Array): UnlockPatchResult {
  const family = detectECUFamily(binary);
  
  if (!family) {
    return {
      success: false,
      message: 'Could not detect MG1 ECU family. Binary may not be a valid Polaris MG1 file.',
      patchesApplied: [],
      originalSize: binary.length,
      patchedSize: binary.length,
    };
  }
  
  if (!HPTUNERS_PATCHES[family]) {
    return {
      success: false,
      message: `HPTuners unlock patches not available for ECU family: ${family}`,
      patchesApplied: [],
      originalSize: binary.length,
      patchedSize: binary.length,
    };
  }
  
  // Create a copy to patch
  const patched = new Uint8Array(binary);
  const patches = HPTUNERS_PATCHES[family];
  const appliedPatches: string[] = [];
  
  for (const patch of patches) {
    if (patch.offset + patch.patchValue.length > patched.length) {
      return {
        success: false,
        message: `Patch offset 0x${patch.offset.toString(16)} is outside binary bounds`,
        patchesApplied: appliedPatches,
        originalSize: binary.length,
        patchedSize: patched.length,
      };
    }
    
    // Check if already patched
    const current = patched.slice(patch.offset, patch.offset + patch.patchValue.length);
    if (arraysEqual(current, patch.patchValue)) {
      appliedPatches.push(`${patch.description} (already patched)`);
      continue;
    }
    
    // Apply patch
    patched.set(patch.patchValue, patch.offset);
    appliedPatches.push(patch.description);
  }
  
  return {
    success: true,
    message: `HPTuners unlock successfully applied to ${family}`,
    patchedBinary: patched,
    patchesApplied: appliedPatches,
    originalSize: binary.length,
    patchedSize: patched.length,
  };
}

/**
 * Remove unlock patches and restore original binary
 */
export function removeUnlockPatches(binary: Uint8Array): UnlockPatchResult {
  const family = detectECUFamily(binary);
  
  if (!family) {
    return {
      success: false,
      message: 'Could not detect MG1 ECU family.',
      patchesApplied: [],
      originalSize: binary.length,
      patchedSize: binary.length,
    };
  }
  
  const restored = new Uint8Array(binary);
  const removedPatches: string[] = [];
  
  // Remove Dynojet patches
  const dynoPatches = DYNOJET_PATCHES[family] || [];
  for (const patch of dynoPatches) {
    if (patch.offset + patch.originalValue.length <= restored.length) {
      restored.set(patch.originalValue, patch.offset);
      removedPatches.push(`Removed: ${patch.description}`);
    }
  }
  
  // Remove HPTuners patches
  const hpPatches = HPTUNERS_PATCHES[family] || [];
  for (const patch of hpPatches) {
    if (patch.offset + patch.originalValue.length <= restored.length) {
      restored.set(patch.originalValue, patch.offset);
      removedPatches.push(`Removed: ${patch.description}`);
    }
  }
  
  return {
    success: true,
    message: 'Unlock patches removed',
    patchedBinary: restored,
    patchesApplied: removedPatches,
    originalSize: binary.length,
    patchedSize: restored.length,
  };
}

/**
 * Get unlock status of binary
 */
export function getUnlockStatus(binary: Uint8Array): {
  family: string | null;
  isDynojettPatched: boolean;
  isHPTunersPatched: boolean;
  isLocked: boolean;
} {
  const family = detectECUFamily(binary);
  const dynoPatched = isDynojettPatched(binary);
  const hpPatched = isHPTunersPatched(binary);
  
  return {
    family,
    isDynojettPatched: dynoPatched,
    isHPTunersPatched: hpPatched,
    isLocked: !dynoPatched && !hpPatched,
  };
}

/**
 * Helper: Compare two Uint8Arrays
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Export patched binary as file
 */
export function exportPatchedBinary(binary: Uint8Array, fileName: string): void {
  const blob = new Blob([new Uint8Array(binary)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
