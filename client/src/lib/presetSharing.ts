/**
 * Preset Sharing — Export/Import PID presets as JSON files.
 *
 * Allows users to share custom PID presets between devices/users.
 * Format: JSON file with preset metadata + PID hex IDs.
 */

import type { PIDPreset } from './obdConnection';
import { createCustomPreset, loadCustomPresets, saveCustomPresets } from './obdConnection';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExportedPreset {
  _format: 'vop-preset-v1';
  name: string;
  description: string;
  pids: number[];
  pidHexIds: string[];  // human-readable hex IDs for reference
  vehicleType?: string;
  exportedAt: number;
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function exportPresetToJSON(preset: PIDPreset): string {
  const exported: ExportedPreset = {
    _format: 'vop-preset-v1',
    name: preset.name,
    description: preset.description,
    pids: preset.pids,
    pidHexIds: preset.pids.map(p => `0x${p.toString(16).toUpperCase().padStart(2, '0')}`),
    exportedAt: Date.now(),
  };
  return JSON.stringify(exported, null, 2);
}

export function downloadPresetAsJSON(preset: PIDPreset): void {
  const json = exportPresetToJSON(preset);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vop-preset_${preset.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import ─────────────────────────────────────────────────────────────────

export function parsePresetJSON(jsonStr: string): ExportedPreset | null {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed._format !== 'vop-preset-v1') {
      // Try to handle raw preset format (just name + pids)
      if (parsed.name && Array.isArray(parsed.pids)) {
        return {
          _format: 'vop-preset-v1',
          name: parsed.name,
          description: parsed.description || '',
          pids: parsed.pids,
          pidHexIds: parsed.pids.map((p: number) => `0x${p.toString(16).toUpperCase()}`),
          exportedAt: parsed.exportedAt || Date.now(),
        };
      }
      return null;
    }
    if (!parsed.name || !Array.isArray(parsed.pids) || parsed.pids.length === 0) {
      return null;
    }
    return parsed as ExportedPreset;
  } catch {
    return null;
  }
}

export function importPresetFromJSON(jsonStr: string): PIDPreset | null {
  const exported = parsePresetJSON(jsonStr);
  if (!exported) return null;

  // Create a new custom preset from the imported data
  const newPreset = createCustomPreset(
    exported.name,
    exported.description,
  exported.pids
  );

  // Save to localStorage
  const existing = loadCustomPresets();
  existing.push(newPreset);
  saveCustomPresets(existing);

  return newPreset;
}

/**
 * Import preset from a File object (for file input handling).
 * Returns the imported preset or null on failure.
 */
export function importPresetFromFile(file: File): Promise<PIDPreset | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(importPresetFromJSON(text));
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/**
 * Copy preset JSON to clipboard for quick sharing.
 */
export async function copyPresetToClipboard(preset: PIDPreset): Promise<boolean> {
  try {
    const json = exportPresetToJSON(preset);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Import preset from clipboard text.
 */
export async function importPresetFromClipboard(): Promise<PIDPreset | null> {
  try {
    const text = await navigator.clipboard.readText();
    return importPresetFromJSON(text);
  } catch {
    return null;
  }
}
