/**
 * Protocol-Specific Preset Groups
 * 
 * Pre-configured PID/parameter groups optimized for each protocol.
 * Automatically suggested based on detected protocol.
 */

import { PIDPreset } from './obdConnection';

// ─── J1939 Presets ────────────────────────────────────────────────────────

export const J1939_PRESETS: PIDPreset[] = [
  {
    name: 'Heavy Duty Truck Monitoring',
    description: 'Essential parameters for heavy-duty truck diagnostics (Cummins, Duramax, Volvo)',
    pids: [61444, 61443, 110592, 65226, 65248], // EEC1, ETC1, ET1, EFL/P1, Fuel Consumption
  },
  {
    name: 'Engine Focus (J1939)',
    description: 'Engine-specific parameters: RPM, load, torque, temperatures',
    pids: [61444, 110592], // EEC1, ET1
  },
  {
    name: 'Transmission Focus (J1939)',
    description: 'Transmission diagnostics: gear, slip, pressure, temperature',
    pids: [61443], // ETC1
  },
  {
    name: 'Emissions Monitoring (J1939)',
    description: 'DPF, DEF, NOx, and emissions system parameters',
    pids: [65227], // DM1 (Diagnostic Messages)
  },
  {
    name: 'Fuel System (J1939)',
    description: 'Fuel pressure, consumption, and injection parameters',
    pids: [65226, 65248], // EFL/P1, Fuel Consumption
  },
];

// ─── K-Line Presets ───────────────────────────────────────────────────────

export const KLINE_PRESETS: PIDPreset[] = [
  {
    name: 'Legacy Vehicle Diagnostics',
    description: 'Standard OBD-II PIDs for pre-2010 vehicles via K-Line (ISO 9141-2)',
    pids: [0x0c, 0x0d, 0x05, 0x0b, 0x10, 0x0f, 0x46, 0x15, 0x04, 0x06, 0x08, 0x11],
  },
  {
    name: 'European Legacy Cars',
    description: 'K-Line parameters for European vehicles (BMW, Mercedes, Audi, VW)',
    pids: [0x0c, 0x0d, 0x05, 0x0b, 0x10, 0x0f, 0x15, 0x04, 0x11],
  },
  {
    name: 'Japanese Legacy Cars',
    description: 'K-Line parameters for Japanese vehicles (Toyota, Honda, Nissan)',
    pids: [0x0c, 0x0d, 0x05, 0x0b, 0x10, 0x0f, 0x15, 0x04, 0x06, 0x08, 0x11],
  },
  {
    name: 'Ford Legacy Vehicles',
    description: 'K-Line parameters for Ford vehicles (2000-2010)',
    pids: [0x0c, 0x0d, 0x05, 0x0b, 0x10, 0x0f, 0x15, 0x04, 0x06, 0x08, 0x11],
  },
  {
    name: 'Engine Basics (K-Line)',
    description: 'Core engine parameters: RPM, speed, temperature, load',
    pids: [0x0c, 0x0d, 0x05, 0x04],
  },
  {
    name: 'Fuel System (K-Line)',
    description: 'Fuel pressure, trim, and consumption parameters',
    pids: [0x0b, 0x10, 0x06, 0x08],
  },
  {
    name: 'Emissions (K-Line)',
    description: 'O2 sensors, catalytic converter, EVAP system',
    pids: [0x15, 0x14, 0x1f],
  },
];

// ─── OBD-II Presets (Enhanced) ────────────────────────────────────────────

export const OBDII_PRESETS: PIDPreset[] = [
  {
    name: 'Universal OBD-II',
    description: 'Standard Mode 01 PIDs supported by all vehicles',
    pids: [0x0c, 0x0d, 0x05, 0x0b, 0x10, 0x0f, 0x04, 0x11],
  },
  {
    name: 'Diesel Performance',
    description: 'Diesel-specific parameters: rail pressure, turbo, EGT, DPF',
    pids: [0x0c, 0x0d, 0x05, 0x0b, 0x10, 0x0f, 0x04],
  },
  {
    name: 'Gasoline Performance',
    description: 'Gasoline-specific parameters: fuel trims, O2 sensors, ignition',
    pids: [0x0c, 0x0d, 0x05, 0x0b, 0x10, 0x0f, 0x04, 0x06, 0x08, 0x15],
  },
  {
    name: 'Transmission Diagnostics',
    description: 'Transmission-focused parameters: gear, slip, temperature',
    pids: [0x0c, 0x0d, 0x05],
  },
  {
    name: 'Emissions Focus',
    description: 'Emissions system: O2 sensors, catalyst, EVAP, NOx',
    pids: [0x15, 0x14, 0x1f, 0x04],
  },
];

// ─── Preset Selection Logic ────────────────────────────────────────────────

/**
 * Get presets for detected protocol
 */
export function getPresetsForProtocol(protocol: 'obd2' | 'j1939' | 'kline'): PIDPreset[] {
  switch (protocol) {
    case 'j1939':
      return J1939_PRESETS;
    case 'kline':
      return KLINE_PRESETS;
    case 'obd2':
    default:
      return OBDII_PRESETS;
  }
}

/**
 * Get recommended preset for protocol and vehicle type
 */
export function getRecommendedPreset(
  protocol: 'obd2' | 'j1939' | 'kline',
  vehicleType?: string
): PIDPreset | null {
  const presets = getPresetsForProtocol(protocol);

  if (!vehicleType) {
    return presets[0] || null;
  }

  const vehicleTypeLower = vehicleType.toLowerCase();

  // Match by vehicle type
  for (const preset of presets) {
    const presetNameLower = preset.name.toLowerCase();
    if (
      presetNameLower.includes(vehicleTypeLower) ||
      vehicleTypeLower.includes(presetNameLower.split('(')[0].trim())
    ) {
      return preset;
    }
  }

  return presets[0] || null;
}

/**
 * Get preset by name
 */
export function getPresetByName(name: string, protocol: 'obd2' | 'j1939' | 'kline'): PIDPreset | null {
  const presets = getPresetsForProtocol(protocol);
  return presets.find(p => p.name === name) || null;
}

// ─── Preset Metadata ──────────────────────────────────────────────────────

export interface PresetMetadata {
  protocol: 'obd2' | 'j1939' | 'kline';
  sampleRate: number; // ms
  complexity: 'basic' | 'intermediate' | 'advanced';
  vehicleTypes: string[];
  description: string;
}

/**
 * Get metadata for a preset
 */
export function getPresetMetadata(preset: PIDPreset, protocol: 'obd2' | 'j1939' | 'kline' = 'obd2'): PresetMetadata {

  let sampleRate = 100;
  let complexity: 'basic' | 'intermediate' | 'advanced' = 'basic';
  let vehicleTypes: string[] = [];

  if (preset.name.includes('Heavy Duty')) {
    sampleRate = 50;
    complexity = 'advanced';
    vehicleTypes = ['Cummins', 'Duramax', 'Volvo', 'Freightliner'];
  } else if (preset.name.includes('Legacy')) {
    sampleRate = 200;
    complexity = 'intermediate';
    vehicleTypes = ['Pre-2010 vehicles', 'European cars', 'Japanese cars'];
  } else if (preset.name.includes('Performance')) {
    sampleRate = 50;
    complexity = 'advanced';
    vehicleTypes = ['Diesel', 'Gasoline'];
  } else if (preset.name.includes('Diagnostics')) {
    sampleRate = 100;
    complexity = 'intermediate';
    vehicleTypes = ['All vehicles'];
  } else {
    sampleRate = 100;
    complexity = 'basic';
    vehicleTypes = ['All vehicles'];
  }

  return {
    protocol,
    sampleRate,
    complexity,
    vehicleTypes,
    description: preset.description,
  };
}

// ─── Preset Comparison ────────────────────────────────────────────────────

/**
 * Compare two presets
 */
export function comparePresets(preset1: PIDPreset, preset2: PIDPreset): {
  common: number[];
  unique1: number[];
  unique2: number[];
  similarity: number;
} {
  const set1 = new Set(preset1.pids);
  const set2 = new Set(preset2.pids);

  const common = Array.from(set1).filter(pid => set2.has(pid));
  const unique1 = Array.from(set1).filter(pid => !set2.has(pid));
  const unique2 = Array.from(set2).filter(pid => !set1.has(pid));

  const totalUnique = new Set([...preset1.pids, ...preset2.pids]).size;
  const similarity = totalUnique > 0 ? common.length / totalUnique : 0;

  return {
    common,
    unique1,
    unique2,
    similarity,
  };
}

/**
 * Merge multiple presets
 */
export function mergePresets(presets: PIDPreset[], name: string, description: string): PIDPreset {
  const pidSet = new Set<number>();

  for (const preset of presets) {
    for (const pid of preset.pids) {
      pidSet.add(pid);
    }
  }

  return {
    name,
    description,
    pids: Array.from(pidSet),
  };
}

// ─── Preset Filtering ────────────────────────────────────────────────────

/**
 * Filter presets by complexity
 */
export function filterPresetsByComplexity(
  presets: PIDPreset[],
  complexity: 'basic' | 'intermediate' | 'advanced'
): PIDPreset[] {
  return presets.filter(preset => {
    const metadata = getPresetMetadata(preset);
    return metadata.complexity === complexity;
  });
}

/**
 * Filter presets by vehicle type
 */
export function filterPresetsByVehicleType(presets: PIDPreset[], vehicleType: string): PIDPreset[] {
  const vehicleTypeLower = vehicleType.toLowerCase();
  return presets.filter(preset => {
    const metadata = getPresetMetadata(preset);
    return metadata.vehicleTypes.some(vt => vt.toLowerCase().includes(vehicleTypeLower));
  });
}

/**
 * Get presets with minimum PID count
 */
export function filterPresetsByPIDCount(presets: PIDPreset[], minCount: number, maxCount?: number): PIDPreset[] {
  return presets.filter(preset => {
    const count = preset.pids.length;
    return count >= minCount && (!maxCount || count <= maxCount);
  });
}
