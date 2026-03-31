/**
 * Cummins Parameter Database
 *
 * Comprehensive database of Cummins engine parameters, memory addresses, and scaling factors.
 * Based on Calterm ECFG/E2M file structures and community tuning knowledge.
 *
 * Supports:
 * - ISX CM871/CM870 (Heavy duty)
 * - ISB CM850 (Medium duty)
 * - ISL CM850/CM2350 (Light duty)
 * - CM2100/CM2150/CM2200 (Dodge RAM 6.7L)
 * - CM2350B (Dodge RAM 6.7L 2013-2018, BDC product ID)
 * - CM2450 (Newer Dodge RAM)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type CumminsECUType = 'ISX_CM871' | 'ISX_CM870' | 'ISB_CM850' | 'ISL_CM850' | 'ISL_CM2350' | 'CM2100' | 'CM2150' | 'CM2200' | 'CM2350B' | 'CM2450';

export type ParameterCategory = 'fuel' | 'timing' | 'boost' | 'egr' | 'dpf' | 'limiter' | 'vehicle' | 'diagnostic';

export interface CumminsParameter {
  name: string;
  description: string;
  category: ParameterCategory;
  address: number; // RAM address
  length: number; // bytes
  dataType: 'uint8' | 'uint16' | 'uint32' | 'int8' | 'int16' | 'int32' | 'float32';
  scale: number; // Multiply raw value by this to get physical units
  offset: number; // Add this to scaled value
  min: number; // Minimum allowed value (physical units)
  max: number; // Maximum allowed value (physical units)
  unit: string; // Physical unit (PSI, mg/stroke, °BTDC, etc.)
  writable: boolean; // Can be written via OBD-II Mode 3D
  persistent: boolean; // Persists after ECU reboot
  ecuTypes: CumminsECUType[]; // Which ECU types support this parameter
  notes?: string;
}

export interface CumminsECUDefinition {
  type: CumminsECUType;
  productId: string; // BAC, ECB, ECC, etc.
  moduleName: string; // CM871, CM2100, etc.
  marketingName: string; // ISX CM871, etc.
  ramStart: number;
  ramEnd: number;
  flashStart: number;
  flashEnd: number;
  parameters: CumminsParameter[];
}

// ─── Cummins Parameter Database ──────────────────────────────────────────────

/**
 * Comprehensive Cummins parameter database
 * Based on Calterm ECFG/E2M structures and community tuning knowledge
 */
export const CUMMINS_PARAMETERS: CumminsParameter[] = [
  // ─── Fuel Parameters ─────────────────────────────────────────────────────
  {
    name: 'Fuel Injection Quantity',
    description: 'Amount of fuel injected per stroke (mg/stroke)',
    category: 'fuel',
    address: 0x0050,
    length: 2,
    dataType: 'uint16',
    scale: 0.01,
    offset: 0,
    min: 0,
    max: 500,
    unit: 'mg/stroke',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Primary tuning parameter for power output. Affects emissions.',
  },

  {
    name: 'Fuel Injection Timing',
    description: 'Injection timing relative to TDC (degrees BTDC)',
    category: 'timing',
    address: 0x0052,
    length: 2,
    dataType: 'int16',
    scale: 0.1,
    offset: 0,
    min: -20,
    max: 30,
    unit: '°BTDC',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Advanced timing increases power but increases NOx. Retarded timing reduces emissions.',
  },

  {
    name: 'Fuel Rail Pressure Target',
    description: 'Target fuel rail pressure (PSI)',
    category: 'fuel',
    address: 0x0054,
    length: 2,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    min: 15000,
    max: 30000,
    unit: 'PSI',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Higher pressure improves atomization and power. Typical range 20000-26000 PSI.',
  },

  // ─── Boost Parameters ────────────────────────────────────────────────────
  {
    name: 'Boost Pressure Target',
    description: 'Target boost pressure (PSI)',
    category: 'boost',
    address: 0x0060,
    length: 2,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    min: 0,
    max: 50,
    unit: 'PSI',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'VGT turbo target. Stock typically 15-25 PSI. Higher = more power but more stress.',
  },

  {
    name: 'VGT Vane Position Target',
    description: 'Target VGT vane position (0-100%)',
    category: 'boost',
    address: 0x0062,
    length: 1,
    dataType: 'uint8',
    scale: 1,
    offset: 0,
    min: 0,
    max: 100,
    unit: '%',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Directly controls turbo vane position. Lower % = more boost.',
  },

  // ─── EGR Parameters ─────────────────────────────────────────────────────
  {
    name: 'EGR Enable',
    description: 'Enable/disable EGR system (0=disabled, 1=enabled)',
    category: 'egr',
    address: 0x0070,
    length: 1,
    dataType: 'uint8',
    scale: 1,
    offset: 0,
    min: 0,
    max: 1,
    unit: 'boolean',
    writable: true,
    persistent: true,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Disabling EGR improves power but increases emissions. Requires DPF delete.',
  },

  {
    name: 'EGR Flow Rate',
    description: 'EGR flow rate (0-100%)',
    category: 'egr',
    address: 0x0071,
    length: 1,
    dataType: 'uint8',
    scale: 1,
    offset: 0,
    min: 0,
    max: 100,
    unit: '%',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Controls how much exhaust is recirculated. Lower = more power.',
  },

  // ─── DPF Parameters ─────────────────────────────────────────────────────
  {
    name: 'DPF Enable',
    description: 'Enable/disable DPF system (0=disabled, 1=enabled)',
    category: 'dpf',
    address: 0x0080,
    length: 1,
    dataType: 'uint8',
    scale: 1,
    offset: 0,
    min: 0,
    max: 1,
    unit: 'boolean',
    writable: true,
    persistent: true,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Disabling DPF improves power and fuel economy. Increases emissions.',
  },

  {
    name: 'DPF Regeneration Temperature',
    description: 'Target temperature for DPF regen (°F)',
    category: 'dpf',
    address: 0x0081,
    length: 2,
    dataType: 'uint16',
    scale: 1,
    offset: 32,
    min: 600,
    max: 1200,
    unit: '°F',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Higher temp = faster regen but more fuel consumption.',
  },

  // ─── Limiter Parameters ──────────────────────────────────────────────────
  {
    name: 'Speed Limiter',
    description: 'Maximum vehicle speed (MPH)',
    category: 'limiter',
    address: 0x0090,
    length: 1,
    dataType: 'uint8',
    scale: 1,
    offset: 0,
    min: 0,
    max: 120,
    unit: 'MPH',
    writable: true,
    persistent: true,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Electronic speed limiter. Stock typically 65-75 MPH.',
  },

  {
    name: 'Torque Limiter',
    description: 'Maximum engine torque (lb-ft)',
    category: 'limiter',
    address: 0x0091,
    length: 2,
    dataType: 'uint16',
    scale: 1,
    offset: 0,
    min: 500,
    max: 1000,
    unit: 'lb-ft',
    writable: true,
    persistent: false,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Protects drivetrain. Stock typically 600-800 lb-ft.',
  },

  // ─── Vehicle Parameters ──────────────────────────────────────────────────
  {
    name: 'Tire Size',
    description: 'Tire diameter (inches)',
    category: 'vehicle',
    address: 0x00A0,
    length: 2,
    dataType: 'uint16',
    scale: 0.1,
    offset: 0,
    min: 20,
    max: 40,
    unit: 'inches',
    writable: true,
    persistent: true,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Affects speedometer calibration. Must match actual tire size.',
  },

  {
    name: 'Fuel Tank Size',
    description: 'Fuel tank capacity (gallons)',
    category: 'vehicle',
    address: 0x00A2,
    length: 1,
    dataType: 'uint8',
    scale: 1,
    offset: 0,
    min: 10,
    max: 50,
    unit: 'gallons',
    writable: true,
    persistent: true,
    ecuTypes: ['CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Affects fuel gauge calibration. Common sizes: 25, 32, 40 gallons.',
  },

  // ─── Diagnostic Parameters ──────────────────────────────────────────────
  {
    name: 'Engine Hours',
    description: 'Total engine operating hours',
    category: 'diagnostic',
    address: 0x00B0,
    length: 4,
    dataType: 'uint32',
    scale: 0.1,
    offset: 0,
    min: 0,
    max: 1000000,
    unit: 'hours',
    writable: true,
    persistent: true,
    ecuTypes: ['ISX_CM871', 'ISX_CM870', 'ISB_CM850', 'ISL_CM850', 'CM2100', 'CM2150', 'CM2200', 'CM2350B', 'CM2450'],
    notes: 'Can be adjusted for warranty purposes (use with caution).',
  },
];

// ─── ECU Definitions ─────────────────────────────────────────────────────────

/**
 * ECU definitions for different Cummins engines
 */
export const CUMMINS_ECU_DEFINITIONS: Map<CumminsECUType, CumminsECUDefinition> = new Map([
  [
    'ISX_CM871',
    {
      type: 'ISX_CM871',
      productId: 'BAC',
      moduleName: 'CM871',
      marketingName: 'ISX CM871',
      ramStart: 0x0,
      ramEnd: 0xfffff,
      flashStart: 0x100000,
      flashEnd: 0x3fffff,
      parameters: CUMMINS_PARAMETERS.filter(p => p.ecuTypes.includes('ISX_CM871')),
    },
  ],
  [
    'CM2100',
    {
      type: 'CM2100',
      productId: 'CMC',
      moduleName: 'CM2100',
      marketingName: 'Dodge RAM 6.7L (2007-2009)',
      ramStart: 0x0,
      ramEnd: 0xfffff,
      flashStart: 0x100000,
      flashEnd: 0x3fffff,
      parameters: CUMMINS_PARAMETERS.filter(p => p.ecuTypes.includes('CM2100')),
    },
  ],
  [
    'CM2200',
    {
      type: 'CM2200',
      productId: 'CMD',
      moduleName: 'CM2200',
      marketingName: 'Dodge RAM 6.7L (2010-2012)',
      ramStart: 0x0,
      ramEnd: 0xfffff,
      flashStart: 0x100000,
      flashEnd: 0x3fffff,
      parameters: CUMMINS_PARAMETERS.filter(p => p.ecuTypes.includes('CM2200')),
    },
  ],
  [
    'CM2350B',
    {
      type: 'CM2350B',
      productId: 'BDC',
      moduleName: 'CM2350B',
      marketingName: 'Dodge RAM 6.7L ISB (2013-2018)',
      ramStart: 0x0,
      ramEnd: 0xfffff,
      flashStart: 0x100000,
      flashEnd: 0x3fffff,
      parameters: CUMMINS_PARAMETERS.filter(p => p.ecuTypes.includes('CM2350B')),
    },
  ],
  [
    'CM2450',
    {
      type: 'CM2450',
      productId: 'CME',
      moduleName: 'CM2450',
      marketingName: 'Dodge RAM 6.7L (2019+)',
      ramStart: 0x0,
      ramEnd: 0xfffff,
      flashStart: 0x100000,
      flashEnd: 0x3fffff,
      parameters: CUMMINS_PARAMETERS.filter(p => p.ecuTypes.includes('CM2450')),
    },
  ],
]);

// ─── Database Functions ──────────────────────────────────────────────────────

/**
 * Get parameter by name
 */
export function getParameterByName(name: string): CumminsParameter | undefined {
  return CUMMINS_PARAMETERS.find(p => p.name === name);
}

/**
 * Get parameters by category
 */
export function getParametersByCategory(category: ParameterCategory): CumminsParameter[] {
  return CUMMINS_PARAMETERS.filter(p => p.category === category);
}

/**
 * Get parameters for a specific ECU type
 */
export function getParametersForECU(ecuType: CumminsECUType): CumminsParameter[] {
  return CUMMINS_PARAMETERS.filter(p => p.ecuTypes.includes(ecuType));
}

/**
 * Get writable parameters for a specific ECU type
 */
export function getWritableParametersForECU(ecuType: CumminsECUType): CumminsParameter[] {
  return getParametersForECU(ecuType).filter(p => p.writable);
}

/**
 * Convert raw value to physical units
 */
export function rawToPhysical(parameter: CumminsParameter, rawValue: number): number {
  return rawValue * parameter.scale + parameter.offset;
}

/**
 * Convert physical value to raw
 */
export function physicalToRaw(parameter: CumminsParameter, physicalValue: number): number {
  return Math.round((physicalValue - parameter.offset) / parameter.scale);
}

/**
 * Validate if a physical value is within allowed range
 */
export function validateParameterValue(parameter: CumminsParameter, physicalValue: number): boolean {
  return physicalValue >= parameter.min && physicalValue <= parameter.max;
}

/**
 * Get validation error message if value is out of range
 */
export function getValidationError(parameter: CumminsParameter, physicalValue: number): string | null {
  if (physicalValue < parameter.min) {
    return `Value ${physicalValue} ${parameter.unit} is below minimum ${parameter.min} ${parameter.unit}`;
  }
  if (physicalValue > parameter.max) {
    return `Value ${physicalValue} ${parameter.unit} is above maximum ${parameter.max} ${parameter.unit}`;
  }
  return null;
}

/**
 * Get ECU definition by type
 */
export function getECUDefinition(ecuType: CumminsECUType): CumminsECUDefinition | undefined {
  return CUMMINS_ECU_DEFINITIONS.get(ecuType);
}

/**
 * Detect ECU type from product ID
 */
export function detectECUTypeFromProductId(productId: string): CumminsECUType | undefined {
  for (const [type, def] of Array.from(CUMMINS_ECU_DEFINITIONS.entries())) {
    if (def.productId === productId) {
      return type;
    }
  }
  return undefined;
}

/**
 * Get all available ECU types
 */
export function getAllECUTypes(): CumminsECUType[] {
  return Array.from(CUMMINS_ECU_DEFINITIONS.keys());
}

/**
 * Get statistics on parameter database
 */
export function getDatabaseStatistics() {
  const stats = {
    totalParameters: CUMMINS_PARAMETERS.length,
    writableParameters: CUMMINS_PARAMETERS.filter(p => p.writable).length,
    persistentParameters: CUMMINS_PARAMETERS.filter(p => p.persistent).length,
    byCategory: {} as Record<ParameterCategory, number>,
    byECU: {} as Record<CumminsECUType, number>,
  };

  // Count by category
  for (const category of ['fuel', 'timing', 'boost', 'egr', 'dpf', 'limiter', 'vehicle', 'diagnostic'] as ParameterCategory[]) {
    stats.byCategory[category] = getParametersByCategory(category).length;
  }

  // Count by ECU
  const ecuTypes = getAllECUTypes();
  for (const ecuType of ecuTypes) {
    stats.byECU[ecuType] = getParametersForECU(ecuType).length;
  }

  return stats;
}
