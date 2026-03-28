/**
 * A2L Registry System
 * 
 * Manages A2L file storage and retrieval by ECU family.
 * Uses browser localStorage for persistence.
 */

export interface A2LRegistryEntry {
  family: string;
  filename: string;
  content: string; // A2L file content
  uploadedAt: number; // Timestamp
  size: number; // File size in bytes
  hash?: string; // Optional hash for integrity checking
}

const REGISTRY_KEY = 'a2l_registry';
const MAX_STORAGE_SIZE = 50 * 1024 * 1024; // 50MB limit

/**
 * Get all registered A2L files
 */
export function getAllA2LFiles(): A2LRegistryEntry[] {
  try {
    const stored = localStorage.getItem(REGISTRY_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load A2L registry:', e);
    return [];
  }
}

/**
 * Get A2L file for specific ECU family
 */
export function getA2LForFamily(family: string): A2LRegistryEntry | null {
  const entries = getAllA2LFiles();
  return entries.find(e => e.family === family) || null;
}

/**
 * Register/store A2L file for ECU family
 */
export function registerA2L(
  family: string,
  filename: string,
  content: string
): boolean {
  try {
    const entries = getAllA2LFiles();
    
    // Check storage size
    const newSize = new Blob([content]).size;
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0) + newSize;
    
    if (totalSize > MAX_STORAGE_SIZE) {
      console.warn(`A2L registry would exceed ${MAX_STORAGE_SIZE} bytes`);
      return false;
    }

    // Remove existing entry for this family
    const filtered = entries.filter(e => e.family !== family);

    // Add new entry
    const entry: A2LRegistryEntry = {
      family,
      filename,
      content,
      uploadedAt: Date.now(),
      size: newSize,
    };

    filtered.push(entry);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error('Failed to register A2L:', e);
    return false;
  }
}

/**
 * Remove A2L file for specific family
 */
export function removeA2L(family: string): boolean {
  try {
    const entries = getAllA2LFiles();
    const filtered = entries.filter(e => e.family !== family);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error('Failed to remove A2L:', e);
    return false;
  }
}

/**
 * Clear all A2L files
 */
export function clearAllA2Ls(): boolean {
  try {
    localStorage.removeItem(REGISTRY_KEY);
    return true;
  } catch (e) {
    console.error('Failed to clear A2L registry:', e);
    return false;
  }
}

/**
 * Get registry statistics
 */
export function getRegistryStats() {
  const entries = getAllA2LFiles();
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  
  return {
    count: entries.length,
    totalSize,
    maxSize: MAX_STORAGE_SIZE,
    usagePercent: (totalSize / MAX_STORAGE_SIZE) * 100,
    entries: entries.map(e => ({
      family: e.family,
      filename: e.filename,
      size: e.size,
      uploadedAt: new Date(e.uploadedAt).toLocaleString(),
    })),
  };
}

/**
 * Export A2L file as downloadable blob
 */
export function exportA2L(family: string): Blob | null {
  const entry = getA2LForFamily(family);
  if (!entry) return null;
  
  return new Blob([entry.content], { type: 'text/plain' });
}

/**
 * Import A2L file from blob/file
 */
export async function importA2L(
  family: string,
  file: File
): Promise<boolean> {
  try {
    const content = await file.text();
    return registerA2L(family, file.name, content);
  } catch (e) {
    console.error('Failed to import A2L:', e);
    return false;
  }
}
