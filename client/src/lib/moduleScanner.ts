/**
 * Module Scanner & Vehicle Coding Library
 * ========================================
 * Scans all ECU module addresses on the CAN bus, reads identification DIDs,
 * and builds a complete module map. Provides as-built data read/write for
 * Ford (FORScan-style) and RAM (AlphaOBD-style) vehicle coding.
 *
 * Key Features:
 *   - Full bus scan (0x700–0x7FF) to discover all responding modules
 *   - Module identification (part number, SW version, HW version, VIN)
 *   - As-Built data read/write for Ford IPC/PCM/BCM
 *   - Fuel tank size coding (Ford + RAM)
 *   - Tire size / speedometer correction (Ford + RAM)
 *   - Checksum calculation for Ford as-built blocks
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ModuleInfo {
  address: number;         // CAN arbitration ID (e.g., 0x720)
  responseAddress: number; // Response address (typically address + 8)
  name: string;            // Human-readable name
  acronym: string;         // Short acronym (e.g., "IPC", "PCM")
  partNumber?: string;     // Ford part number (e.g., "LC3T-14F642-AE")
  swVersion?: string;      // Software version
  hwVersion?: string;      // Hardware version
  calibration?: string;    // Calibration ID
  strategy?: string;       // Strategy code
  vin?: string;            // VIN stored in this module
  responding: boolean;     // Whether module responded to scan
  asBuiltBlocks?: AsBuiltBlock[];  // Raw as-built data blocks
}

export interface AsBuiltBlock {
  blockId: string;         // e.g., "720-01-01"
  moduleAddress: number;
  section: number;         // 1 or 2
  row: number;             // 1-based row within section
  rawHex: string;          // Raw hex string (e.g., "2120 6047 394A")
  words: number[];         // Parsed 16-bit words
  checksum: number;        // Last byte (auto-calculated)
  decoded?: DecodedField[];
}

export interface DecodedField {
  name: string;
  description: string;
  byteOffset: number;
  bitOffset: number;
  bitLength: number;
  rawValue: number;
  displayValue: string;
  unit?: string;
  editable: boolean;
  options?: { value: number; label: string }[];
}

export interface ScanProgress {
  currentAddress: number;
  totalAddresses: number;
  modulesFound: number;
  status: 'scanning' | 'reading' | 'complete' | 'error';
  message: string;
}

export type ScanProgressCallback = (progress: ScanProgress) => void;

// ═══════════════════════════════════════════════════════════════════════════
// Ford Module Database
// ═══════════════════════════════════════════════════════════════════════════

export interface KnownModule {
  address: number;
  responseAddress: number;
  name: string;
  acronym: string;
  manufacturer: 'ford' | 'ram' | 'gm' | 'universal';
}

export const FORD_MODULES: KnownModule[] = [
  { address: 0x700, responseAddress: 0x708, name: 'Fuel Injection Control Module', acronym: 'FICM', manufacturer: 'ford' },
  { address: 0x701, responseAddress: 0x709, name: 'Fuel Injection Pump', acronym: 'FIP', manufacturer: 'ford' },
  { address: 0x706, responseAddress: 0x70E, name: 'Rear Air Suspension Module', acronym: 'RASM', manufacturer: 'ford' },
  { address: 0x710, responseAddress: 0x718, name: 'Rear Body Control Module', acronym: 'R_BCM', manufacturer: 'ford' },
  { address: 0x716, responseAddress: 0x71E, name: 'Gateway Module', acronym: 'GWM', manufacturer: 'ford' },
  { address: 0x720, responseAddress: 0x728, name: 'Instrument Panel Cluster', acronym: 'IPC', manufacturer: 'ford' },
  { address: 0x726, responseAddress: 0x72E, name: 'Body Control Module', acronym: 'BCM', manufacturer: 'ford' },
  { address: 0x727, responseAddress: 0x72F, name: 'Body Control Module B', acronym: 'BCMB', manufacturer: 'ford' },
  { address: 0x730, responseAddress: 0x738, name: 'Power Steering Control Module', acronym: 'PSCM', manufacturer: 'ford' },
  { address: 0x731, responseAddress: 0x739, name: 'Steering Angle Sensor Module', acronym: 'SASM', manufacturer: 'ford' },
  { address: 0x733, responseAddress: 0x73B, name: 'Steering Column Control Module', acronym: 'SCCM', manufacturer: 'ford' },
  { address: 0x736, responseAddress: 0x73E, name: 'Front Electronic Module', acronym: 'FEM', manufacturer: 'ford' },
  { address: 0x737, responseAddress: 0x73F, name: 'Restraint Control Module', acronym: 'RCM', manufacturer: 'ford' },
  { address: 0x740, responseAddress: 0x748, name: 'Headlamp Control Module', acronym: 'HCM', manufacturer: 'ford' },
  { address: 0x741, responseAddress: 0x749, name: 'Headlamp Control Module 2', acronym: 'HCM2', manufacturer: 'ford' },
  { address: 0x744, responseAddress: 0x74C, name: 'Fuel Fired Coolant Heater', acronym: 'FFH', manufacturer: 'ford' },
  { address: 0x750, responseAddress: 0x758, name: 'Tire Pressure Monitor', acronym: 'RTM', manufacturer: 'ford' },
  { address: 0x754, responseAddress: 0x75C, name: 'Parking Aid Module', acronym: 'PAM', manufacturer: 'ford' },
  { address: 0x760, responseAddress: 0x768, name: 'Anti-Lock Brake System', acronym: 'ABS', manufacturer: 'ford' },
  { address: 0x764, responseAddress: 0x76C, name: 'Electronic Parking Brake', acronym: 'EPB', manufacturer: 'ford' },
  { address: 0x765, responseAddress: 0x76D, name: 'Trailer Brake Control Module', acronym: 'TBC', manufacturer: 'ford' },
  { address: 0x770, responseAddress: 0x778, name: 'Air Conditioning Control Module', acronym: 'ACCM', manufacturer: 'ford' },
  { address: 0x775, responseAddress: 0x77D, name: 'Heated Steering Wheel Module', acronym: 'HSWM', manufacturer: 'ford' },
  { address: 0x776, responseAddress: 0x77E, name: 'Driver Climate Seat Module', acronym: 'DCSM', manufacturer: 'ford' },
  { address: 0x777, responseAddress: 0x77F, name: 'Passenger Climate Seat Module', acronym: 'PCSM', manufacturer: 'ford' },
  { address: 0x780, responseAddress: 0x788, name: 'Transfer Case Control Module', acronym: 'TCCM', manufacturer: 'ford' },
  { address: 0x783, responseAddress: 0x78B, name: 'All Wheel Drive Module', acronym: 'AWD', manufacturer: 'ford' },
  { address: 0x790, responseAddress: 0x798, name: 'Image Processing Module A', acronym: 'IPMA', manufacturer: 'ford' },
  { address: 0x791, responseAddress: 0x799, name: 'Image Processing Module B', acronym: 'IPMB', manufacturer: 'ford' },
  { address: 0x793, responseAddress: 0x79B, name: 'Front Distance Sensing Module', acronym: 'FDSM', manufacturer: 'ford' },
  { address: 0x794, responseAddress: 0x79C, name: 'Blind Spot Monitor Left', acronym: 'BSML', manufacturer: 'ford' },
  { address: 0x795, responseAddress: 0x79D, name: 'Blind Spot Monitor Right', acronym: 'BSMR', manufacturer: 'ford' },
  { address: 0x7A0, responseAddress: 0x7A8, name: 'Audio Control Module', acronym: 'ACM', manufacturer: 'ford' },
  { address: 0x7A5, responseAddress: 0x7AD, name: 'Amplifier Module', acronym: 'AM', manufacturer: 'ford' },
  { address: 0x7A6, responseAddress: 0x7AE, name: 'Satellite Digital Audio Receiver', acronym: 'SDARS', manufacturer: 'ford' },
  { address: 0x7B0, responseAddress: 0x7B8, name: 'Drivers Door Module', acronym: 'DDM', manufacturer: 'ford' },
  { address: 0x7B1, responseAddress: 0x7B9, name: 'Passenger Door Module', acronym: 'PDM', manufacturer: 'ford' },
  { address: 0x7B2, responseAddress: 0x7BA, name: 'Rear Left Door Module', acronym: 'RLDM', manufacturer: 'ford' },
  { address: 0x7B3, responseAddress: 0x7BB, name: 'Rear Right Door Module', acronym: 'RRDM', manufacturer: 'ford' },
  { address: 0x7B5, responseAddress: 0x7BD, name: 'Liftgate/Trunk Module', acronym: 'LTM', manufacturer: 'ford' },
  { address: 0x7C0, responseAddress: 0x7C8, name: 'Driver Seat Module', acronym: 'DSM', manufacturer: 'ford' },
  { address: 0x7C1, responseAddress: 0x7C9, name: 'Passenger Seat Module', acronym: 'PSM', manufacturer: 'ford' },
  { address: 0x7C4, responseAddress: 0x7CC, name: 'Remote Function Actuator', acronym: 'RFA', manufacturer: 'ford' },
  { address: 0x7D0, responseAddress: 0x7D8, name: 'Accessory Protocol Interface Module', acronym: 'APIM', manufacturer: 'ford' },
  { address: 0x7D2, responseAddress: 0x7DA, name: 'Head Up Display', acronym: 'HUD', manufacturer: 'ford' },
  { address: 0x7E0, responseAddress: 0x7E8, name: 'Powertrain Control Module', acronym: 'PCM', manufacturer: 'ford' },
  { address: 0x7E1, responseAddress: 0x7E9, name: 'Transmission Control Module', acronym: 'TCM', manufacturer: 'ford' },
  { address: 0x7E2, responseAddress: 0x7EA, name: 'Reductant Control Module', acronym: 'DCU', manufacturer: 'ford' },
  { address: 0x7E5, responseAddress: 0x7ED, name: 'Fuel Additive Control Module', acronym: 'FACM', manufacturer: 'ford' },
];

export const RAM_MODULES: KnownModule[] = [
  { address: 0x7E0, responseAddress: 0x7E8, name: 'Engine Control Module', acronym: 'ECM', manufacturer: 'ram' },
  { address: 0x7E1, responseAddress: 0x7E9, name: 'Transmission Control Module', acronym: 'TCM', manufacturer: 'ram' },
  { address: 0x7E2, responseAddress: 0x7EA, name: 'Anti-Lock Brake System', acronym: 'ABS', manufacturer: 'ram' },
  { address: 0x720, responseAddress: 0x728, name: 'Instrument Panel Cluster', acronym: 'IPC', manufacturer: 'ram' },
  { address: 0x740, responseAddress: 0x748, name: 'Body Control Module', acronym: 'BCM', manufacturer: 'ram' },
  { address: 0x742, responseAddress: 0x74A, name: 'Totally Integrated Power Module', acronym: 'TIPM', manufacturer: 'ram' },
  { address: 0x744, responseAddress: 0x74C, name: 'Radio/Head Unit', acronym: 'RFH', manufacturer: 'ram' },
  { address: 0x746, responseAddress: 0x74E, name: 'HVAC Control Module', acronym: 'HVAC', manufacturer: 'ram' },
  { address: 0x748, responseAddress: 0x750, name: 'Security Gateway Module', acronym: 'SGW', manufacturer: 'ram' },
  { address: 0x760, responseAddress: 0x768, name: 'Electronic Stability Control', acronym: 'ESC', manufacturer: 'ram' },
  { address: 0x762, responseAddress: 0x76A, name: 'Occupant Classification System', acronym: 'OCS', manufacturer: 'ram' },
  { address: 0x763, responseAddress: 0x76B, name: 'Occupant Restraint Controller', acronym: 'ORC', manufacturer: 'ram' },
  { address: 0x764, responseAddress: 0x76C, name: 'Electronic Parking Brake', acronym: 'EPB', manufacturer: 'ram' },
  { address: 0x770, responseAddress: 0x778, name: 'Air Conditioning Module', acronym: 'A/C', manufacturer: 'ram' },
  { address: 0x780, responseAddress: 0x788, name: 'Transfer Case Module', acronym: 'DTCM', manufacturer: 'ram' },
  { address: 0x790, responseAddress: 0x798, name: 'Blind Spot Monitor', acronym: 'BSM', manufacturer: 'ram' },
  { address: 0x7A0, responseAddress: 0x7A8, name: 'Amplifier Module', acronym: 'AMP', manufacturer: 'ram' },
  { address: 0x7B0, responseAddress: 0x7B8, name: 'Driver Door Module', acronym: 'DDM', manufacturer: 'ram' },
  { address: 0x7B1, responseAddress: 0x7B9, name: 'Passenger Door Module', acronym: 'PDM', manufacturer: 'ram' },
  { address: 0x7C0, responseAddress: 0x7C8, name: 'Seat Control Module', acronym: 'SCM', manufacturer: 'ram' },
  { address: 0x7D0, responseAddress: 0x7D8, name: 'Uconnect Module', acronym: 'UCM', manufacturer: 'ram' },
];

export const GM_MODULES: KnownModule[] = [
  { address: 0x7E0, responseAddress: 0x7E8, name: 'Engine Control Module', acronym: 'ECM', manufacturer: 'gm' },
  { address: 0x7E1, responseAddress: 0x7E9, name: 'Transmission Control Module', acronym: 'TCM', manufacturer: 'gm' },
  { address: 0x7E2, responseAddress: 0x7EA, name: 'ABS/Stability Control', acronym: 'EBCM', manufacturer: 'gm' },
  { address: 0x720, responseAddress: 0x728, name: 'Instrument Panel Cluster', acronym: 'IPC', manufacturer: 'gm' },
  { address: 0x740, responseAddress: 0x748, name: 'Body Control Module', acronym: 'BCM', manufacturer: 'gm' },
  { address: 0x744, responseAddress: 0x74C, name: 'Radio Module', acronym: 'RAD', manufacturer: 'gm' },
  { address: 0x750, responseAddress: 0x758, name: 'Tire Pressure Monitor', acronym: 'TPM', manufacturer: 'gm' },
  { address: 0x760, responseAddress: 0x768, name: 'Chassis Control Module', acronym: 'CCM', manufacturer: 'gm' },
  { address: 0x7C0, responseAddress: 0x7C8, name: 'Seat Memory Module', acronym: 'SMM', manufacturer: 'gm' },
  { address: 0x7D0, responseAddress: 0x7D8, name: 'OnStar Module', acronym: 'VTD', manufacturer: 'gm' },
  { address: 0x7E5, responseAddress: 0x7ED, name: 'Diesel Exhaust Fluid Module', acronym: 'DEF', manufacturer: 'gm' },
];

// ═══════════════════════════════════════════════════════════════════════════
// UDS Identification DIDs
// ═══════════════════════════════════════════════════════════════════════════

export const IDENTIFICATION_DIDS = {
  VIN:                    0xF190,  // Vehicle Identification Number
  ECU_PART_NUMBER:        0xF187,  // ECU Manufacturing Part Number
  ECU_SW_VERSION:         0xF189,  // ECU Software Version
  ECU_HW_VERSION:         0xF191,  // ECU Hardware Version
  ECU_SERIAL:             0xF18C,  // ECU Serial Number
  SYSTEM_NAME:            0xF197,  // System Name or Engine Type
  CALIBRATION_ID:         0xF188,  // Calibration Identification
  CALIBRATION_VERIFY:     0xF195,  // Calibration Verification Numbers
  PROGRAMMING_DATE:       0xF199,  // Programming Date
  SUPPLIER_ID:            0xF18A,  // System Supplier Identifier
  ECU_MANUFACTURING_DATE: 0xF18B,  // ECU Manufacturing Date
  STRATEGY:               0xF193,  // System Supplier ECU Software Number
};

// ═══════════════════════════════════════════════════════════════════════════
// Ford As-Built Data Definitions — Fuel Tank & Tire Size
// ═══════════════════════════════════════════════════════════════════════════

/** Ford IPC As-Built DID mapping (DE00 series) */
export const FORD_ASBUILT_DIDS = {
  IPC_BLOCK_01_01: 0xDE01,
  IPC_BLOCK_01_02: 0xDE02,
  IPC_BLOCK_01_03: 0xDE03,
  IPC_BLOCK_01_04: 0xDE04,
  IPC_BLOCK_02_01: 0xDE05,
  IPC_BLOCK_02_02: 0xDE06,
};

/**
 * Ford fuel tank size values (in liters × 10)
 * Used in IPC block 720-01-01, first 12 bits
 */
export const FORD_FUEL_TANK_SIZES: { gallons: number; liters: number; hexValue: number; label: string }[] = [
  { gallons: 23.0, liters: 87.1, hexValue: 871, label: '23 gal (F-150 SWB)' },
  { gallons: 26.0, liters: 98.4, hexValue: 984, label: '26 gal (F-150 LWB)' },
  { gallons: 30.0, liters: 113.6, hexValue: 1136, label: '30 gal (F-150 Extended Range)' },
  { gallons: 34.0, liters: 128.7, hexValue: 1287, label: '34 gal (Super Duty SWB)' },
  { gallons: 36.0, liters: 136.3, hexValue: 1363, label: '36 gal (F-150 Extended Range)' },
  { gallons: 40.0, liters: 151.4, hexValue: 1514, label: '40 gal (Aftermarket)' },
  { gallons: 48.0, liters: 181.7, hexValue: 1817, label: '48 gal (Super Duty LWB)' },
  { gallons: 50.0, liters: 189.3, hexValue: 1893, label: '50 gal (Titan Tank SWB)' },
  { gallons: 55.0, liters: 208.2, hexValue: 2082, label: '55 gal (Aftermarket)' },
  { gallons: 60.0, liters: 227.1, hexValue: 2271, label: '60 gal (S&B / Titan Tank)' },
  { gallons: 65.0, liters: 246.1, hexValue: 2461, label: '65 gal (Titan XXL)' },
  { gallons: 70.0, liters: 265.0, hexValue: 2650, label: '70 gal (Transfer Flow)' },
  { gallons: 75.0, liters: 283.9, hexValue: 2839, label: '75 gal (Transfer Flow)' },
  { gallons: 80.0, liters: 302.8, hexValue: 3028, label: '80 gal (Aftermarket Max)' },
];

/**
 * Common tire sizes with revolutions per mile for speedometer correction
 */
export const COMMON_TIRE_SIZES: { size: string; revsPerMile: number; circumference_mm: number; diameter_in: number }[] = [
  // Stock Super Duty sizes
  { size: 'LT245/75R17', revsPerMile: 673, circumference_mm: 2393, diameter_in: 31.5 },
  { size: 'LT275/70R18', revsPerMile: 654, circumference_mm: 2461, diameter_in: 33.2 },
  { size: 'LT275/65R18', revsPerMile: 672, circumference_mm: 2395, diameter_in: 32.1 },
  { size: 'LT275/65R20', revsPerMile: 643, circumference_mm: 2504, diameter_in: 34.1 },
  // Common upgrades
  { size: '285/75R16', revsPerMile: 651, circumference_mm: 2472, diameter_in: 32.8 },
  { size: '285/70R17', revsPerMile: 652, circumference_mm: 2469, diameter_in: 32.7 },
  { size: '285/75R17', revsPerMile: 631, circumference_mm: 2551, diameter_in: 33.8 },
  { size: '295/70R17', revsPerMile: 641, circumference_mm: 2512, diameter_in: 33.3 },
  { size: '295/70R18', revsPerMile: 630, circumference_mm: 2555, diameter_in: 34.3 },
  { size: '305/70R17', revsPerMile: 631, circumference_mm: 2551, diameter_in: 33.8 },
  // 35" tires
  { size: '35x12.50R17', revsPerMile: 601, circumference_mm: 2679, diameter_in: 35.0 },
  { size: '35x12.50R18', revsPerMile: 601, circumference_mm: 2679, diameter_in: 35.0 },
  { size: '35x12.50R20', revsPerMile: 601, circumference_mm: 2679, diameter_in: 35.0 },
  { size: '315/70R17', revsPerMile: 611, circumference_mm: 2635, diameter_in: 34.4 },
  // 37" tires
  { size: '37x12.50R17', revsPerMile: 571, circumference_mm: 2821, diameter_in: 37.0 },
  { size: '37x12.50R18', revsPerMile: 571, circumference_mm: 2821, diameter_in: 37.0 },
  { size: '37x12.50R20', revsPerMile: 571, circumference_mm: 2821, diameter_in: 37.0 },
  { size: '37x13.50R17', revsPerMile: 571, circumference_mm: 2821, diameter_in: 37.0 },
  // 38" tires
  { size: '38x13.50R17', revsPerMile: 556, circumference_mm: 2896, diameter_in: 38.0 },
  { size: '38x15.50R20', revsPerMile: 556, circumference_mm: 2896, diameter_in: 38.0 },
  // 40" tires
  { size: '40x13.50R17', revsPerMile: 527, circumference_mm: 3055, diameter_in: 40.0 },
  // Stock F-150 sizes
  { size: 'P265/70R17', revsPerMile: 679, circumference_mm: 2371, diameter_in: 31.6 },
  { size: 'P275/65R18', revsPerMile: 672, circumference_mm: 2395, diameter_in: 32.1 },
  { size: 'P275/60R20', revsPerMile: 681, circumference_mm: 2364, diameter_in: 33.0 },
  // Stock RAM sizes
  { size: 'LT275/70R18 (RAM)', revsPerMile: 654, circumference_mm: 2461, diameter_in: 33.2 },
  { size: 'LT285/60R20 (RAM)', revsPerMile: 660, circumference_mm: 2439, diameter_in: 33.5 },
];

// ═══════════════════════════════════════════════════════════════════════════
// RAM As-Built / Configuration Definitions
// ═══════════════════════════════════════════════════════════════════════════

/** RAM BCM configuration DIDs for fuel tank and tire size */
export const RAM_CONFIG_DIDS = {
  FUEL_TANK_CAPACITY: 0x0120,    // BCM DID for fuel tank capacity (liters)
  TIRE_CIRCUMFERENCE: 0x0121,    // PCM DID for tire circumference (mm)
  TIRE_REVS_PER_KM: 0x0122,     // PCM DID for tire revolutions per km
  AXLE_RATIO: 0x0123,            // PCM DID for axle ratio
  SPEED_LIMITER: 0x0130,         // PCM DID for max speed limiter
  TPMS_PRESSURE_FL: 0x0140,     // TPMS front left pressure threshold
  TPMS_PRESSURE_FR: 0x0141,     // TPMS front right pressure threshold
  TPMS_PRESSURE_RL: 0x0142,     // TPMS rear left pressure threshold
  TPMS_PRESSURE_RR: 0x0143,     // TPMS rear right pressure threshold
};

export const RAM_FUEL_TANK_SIZES: { gallons: number; liters: number; label: string }[] = [
  { gallons: 26.0, liters: 98.4, label: '26 gal (1500 SWB)' },
  { gallons: 32.0, liters: 121.1, label: '32 gal (1500 LWB)' },
  { gallons: 33.0, liters: 124.9, label: '33 gal (2500/3500 SWB)' },
  { gallons: 52.0, liters: 196.8, label: '52 gal (2500/3500 LWB)' },
  { gallons: 55.0, liters: 208.2, label: '55 gal (Aftermarket)' },
  { gallons: 60.0, liters: 227.1, label: '60 gal (Titan / S&B)' },
  { gallons: 65.0, liters: 246.1, label: '65 gal (Titan XXL)' },
  { gallons: 70.0, liters: 265.0, label: '70 gal (Transfer Flow)' },
  { gallons: 80.0, liters: 302.8, label: '80 gal (Transfer Flow 80)' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Ford As-Built Checksum Calculator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Ford as-built block checksum.
 * The checksum is the last byte of the block — it's the XOR of all preceding bytes.
 */
export function calculateFordChecksum(blockBytes: number[]): number {
  // Checksum = XOR of all bytes except the last one
  let checksum = 0;
  for (let i = 0; i < blockBytes.length - 1; i++) {
    checksum ^= blockBytes[i];
  }
  return checksum & 0xFF;
}

/**
 * Parse a Ford as-built hex string into words and bytes
 * Input: "2120 6047 394A" → words: [0x2120, 0x6047, 0x394A]
 */
export function parseAsBuiltHex(hexStr: string): { words: number[]; bytes: number[] } {
  const cleanHex = hexStr.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
  }
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      words.push((bytes[i] << 8) | bytes[i + 1]);
    }
  }
  return { words, bytes };
}

/**
 * Encode words back to hex string with spaces between words
 */
export function encodeAsBuiltHex(words: number[]): string {
  return words.map(w => w.toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// Ford Fuel Tank Size Codec
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decode fuel tank capacity from Ford IPC block 720-01-01
 * The capacity is stored in the first 12 bits as liters × 10
 */
export function decodeFordFuelTankSize(block01_01_hex: string): { liters: number; gallons: number } {
  const { bytes } = parseAsBuiltHex(block01_01_hex);
  // First 12 bits: bytes[0] (8 bits) + bytes[1] upper 4 bits
  const rawValue = (bytes[0] << 4) | ((bytes[1] >> 4) & 0x0F);
  const liters = rawValue / 10;
  const gallons = liters * 0.264172;
  return { liters: Math.round(liters * 10) / 10, gallons: Math.round(gallons * 10) / 10 };
}

/**
 * Encode fuel tank capacity into Ford IPC block 720-01-01
 * Returns the modified first two bytes (preserving lower 4 bits of byte 2)
 */
export function encodeFordFuelTankSize(
  block01_01_hex: string,
  newGallons: number
): { modifiedHex: string; newLiters: number } {
  const { bytes } = parseAsBuiltHex(block01_01_hex);
  const newLiters = newGallons / 0.264172;
  const rawValue = Math.round(newLiters * 10);

  // Encode into first 12 bits
  bytes[0] = (rawValue >> 4) & 0xFF;
  bytes[1] = ((rawValue & 0x0F) << 4) | (bytes[1] & 0x0F);

  // Recalculate checksum (last byte)
  bytes[bytes.length - 1] = calculateFordChecksum(bytes);

  // Rebuild hex string
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 2) {
    words.push((bytes[i] << 8) | (bytes[i + 1] || 0));
  }

  return {
    modifiedHex: encodeAsBuiltHex(words),
    newLiters: Math.round(newLiters * 10) / 10,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tire Size Codec (Universal)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate speedometer correction factor for tire size change
 */
export function calculateSpeedoCorrection(
  stockRevsPerMile: number,
  newRevsPerMile: number
): { correctionFactor: number; speedoError: number; description: string } {
  const correctionFactor = stockRevsPerMile / newRevsPerMile;
  const speedoError = ((correctionFactor - 1) * 100);

  let description: string;
  if (Math.abs(speedoError) < 0.5) {
    description = 'No correction needed — within 0.5% of stock';
  } else if (speedoError > 0) {
    description = `Speedometer reads ${Math.abs(speedoError).toFixed(1)}% LOW (actual speed is faster than displayed)`;
  } else {
    description = `Speedometer reads ${Math.abs(speedoError).toFixed(1)}% HIGH (actual speed is slower than displayed)`;
  }

  return {
    correctionFactor: Math.round(correctionFactor * 10000) / 10000,
    speedoError: Math.round(speedoError * 10) / 10,
    description,
  };
}

/**
 * Calculate tire circumference from size string
 * Supports formats: "LT275/70R18", "35x12.50R17", "P265/70R17"
 */
export function parseTireSize(sizeStr: string): { diameter_in: number; circumference_mm: number; revsPerMile: number } | null {
  // Try metric format: (LT|P)?(\d+)/(\d+)R(\d+)
  const metricMatch = sizeStr.match(/(?:LT|P)?(\d+)\/(\d+)R(\d+)/i);
  if (metricMatch) {
    const width_mm = parseInt(metricMatch[1]);
    const aspect = parseInt(metricMatch[2]);
    const rim_in = parseInt(metricMatch[3]);

    const sidewall_mm = width_mm * (aspect / 100);
    const diameter_mm = (rim_in * 25.4) + (2 * sidewall_mm);
    const diameter_in = diameter_mm / 25.4;
    const circumference_mm = Math.PI * diameter_mm;
    const revsPerMile = Math.round(1609344 / circumference_mm);

    return { diameter_in: Math.round(diameter_in * 10) / 10, circumference_mm: Math.round(circumference_mm), revsPerMile };
  }

  // Try inch format: (\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)R(\d+)
  const inchMatch = sizeStr.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)R(\d+)/i);
  if (inchMatch) {
    const diameter_in = parseFloat(inchMatch[1]);
    const diameter_mm = diameter_in * 25.4;
    const circumference_mm = Math.PI * diameter_mm;
    const revsPerMile = Math.round(1609344 / circumference_mm);

    return { diameter_in, circumference_mm: Math.round(circumference_mm), revsPerMile };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Module Scanner Engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the known module database for a manufacturer
 */
export function getModulesForManufacturer(manufacturer: 'ford' | 'ram' | 'gm'): KnownModule[] {
  switch (manufacturer) {
    case 'ford': return FORD_MODULES;
    case 'ram': return RAM_MODULES;
    case 'gm': return GM_MODULES;
    default: return [];
  }
}

/**
 * Look up a module by address across all databases
 */
export function lookupModule(address: number): KnownModule | null {
  const allModules = [...FORD_MODULES, ...RAM_MODULES, ...GM_MODULES];
  return allModules.find(m => m.address === address) || null;
}

/**
 * Get all scan addresses for a full bus scan
 * Returns addresses in priority order (known modules first, then unknowns)
 */
export function getScanAddresses(manufacturer?: 'ford' | 'ram' | 'gm'): number[] {
  const known = manufacturer ? getModulesForManufacturer(manufacturer) : [];
  const knownAddresses = new Set(known.map(m => m.address));

  // Priority: known modules first
  const addresses: number[] = known.map(m => m.address);

  // Then scan remaining 0x700-0x7FF range
  for (let addr = 0x700; addr <= 0x7FF; addr++) {
    if (!knownAddresses.has(addr)) {
      addresses.push(addr);
    }
  }

  return addresses;
}

/**
 * Decode a UDS identification DID response to a string
 */
export function decodeIdentificationDID(did: number, data: number[]): string {
  if (!data || data.length === 0) return '';

  // Most identification DIDs are ASCII strings
  if (did === IDENTIFICATION_DIDS.VIN ||
      did === IDENTIFICATION_DIDS.ECU_PART_NUMBER ||
      did === IDENTIFICATION_DIDS.ECU_SW_VERSION ||
      did === IDENTIFICATION_DIDS.ECU_HW_VERSION ||
      did === IDENTIFICATION_DIDS.ECU_SERIAL ||
      did === IDENTIFICATION_DIDS.SYSTEM_NAME ||
      did === IDENTIFICATION_DIDS.CALIBRATION_ID ||
      did === IDENTIFICATION_DIDS.STRATEGY ||
      did === IDENTIFICATION_DIDS.SUPPLIER_ID) {
    return data.map(b => String.fromCharCode(b)).join('').replace(/[\x00-\x1F]/g, '').trim();
  }

  // Programming date: BCD encoded YYYY-MM-DD
  if (did === IDENTIFICATION_DIDS.PROGRAMMING_DATE && data.length >= 4) {
    const year = (data[0] << 8) | data[1];
    const month = data[2];
    const day = data[3];
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }

  // Default: hex string
  return data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// Ford IPC Block Decoder — Fuel Tank & Tire Size Fields
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decode all known fields from Ford IPC block 720-01-01
 */
export function decodeFordIPCBlock01(hexStr: string): DecodedField[] {
  const { bytes } = parseAsBuiltHex(hexStr);
  if (bytes.length < 6) return [];

  const fields: DecodedField[] = [];

  // Fuel tank capacity (first 12 bits)
  const tankRaw = (bytes[0] << 4) | ((bytes[1] >> 4) & 0x0F);
  const tankLiters = tankRaw / 10;
  const tankGallons = tankLiters * 0.264172;
  fields.push({
    name: 'Fuel Tank Capacity',
    description: 'Fuel tank size used for Distance-to-Empty calculation',
    byteOffset: 0, bitOffset: 0, bitLength: 12,
    rawValue: tankRaw,
    displayValue: `${Math.round(tankGallons * 10) / 10} gal (${Math.round(tankLiters * 10) / 10} L)`,
    unit: 'gallons',
    editable: true,
  });

  // Second fuel sender (byte 1, bit 3)
  const secondSender = (bytes[1] >> 3) & 0x01;
  fields.push({
    name: 'Second Fuel Sender',
    description: 'Enable second fuel level sender (dual tank)',
    byteOffset: 1, bitOffset: 3, bitLength: 1,
    rawValue: secondSender,
    displayValue: secondSender ? '2 Senders' : '1 Sender',
    editable: true,
    options: [{ value: 0, label: '1 Sender' }, { value: 1, label: '2 Senders' }],
  });

  // Second fuel tank (byte 1, bit 2)
  const secondTank = (bytes[1] >> 2) & 0x01;
  fields.push({
    name: 'Second Fuel Tank',
    description: 'Enable second fuel tank',
    byteOffset: 1, bitOffset: 2, bitLength: 1,
    rawValue: secondTank,
    displayValue: secondTank ? '2 Tanks' : '1 Tank',
    editable: true,
    options: [{ value: 0, label: '1 Tank' }, { value: 1, label: '2 Tanks' }],
  });

  // Flex Fuel (byte 1, bit 1)
  const flexFuel = (bytes[1] >> 1) & 0x01;
  fields.push({
    name: 'Flex Fuel',
    description: 'Enable Flex Fuel capability',
    byteOffset: 1, bitOffset: 1, bitLength: 1,
    rawValue: flexFuel,
    displayValue: flexFuel ? 'Enabled' : 'Disabled',
    editable: true,
    options: [{ value: 0, label: 'Disabled' }, { value: 1, label: 'Enabled' }],
  });

  // Transmission Type (byte 1, bit 0)
  const transType = bytes[1] & 0x01;
  fields.push({
    name: 'Transmission Type',
    description: 'Manual or Automatic transmission display',
    byteOffset: 1, bitOffset: 0, bitLength: 1,
    rawValue: transType,
    displayValue: transType ? 'Manual' : 'Automatic',
    editable: true,
    options: [{ value: 0, label: 'Automatic' }, { value: 1, label: 'Manual' }],
  });

  // Eco Cruise (byte 2, bit 6)
  const ecoCruise = (bytes[2] >> 6) & 0x01;
  fields.push({
    name: 'Eco Cruise',
    description: 'Enable Eco Speed / Eco Cruise setting',
    byteOffset: 2, bitOffset: 6, bitLength: 1,
    rawValue: ecoCruise,
    displayValue: ecoCruise ? 'Enabled' : 'Disabled',
    editable: true,
    options: [{ value: 0, label: 'Disabled' }, { value: 1, label: 'Enabled' }],
  });

  // TPMS (byte 3, bit 4)
  const tpms = (bytes[3] >> 4) & 0x01;
  fields.push({
    name: 'TPMS',
    description: 'Tire Pressure Monitoring System',
    byteOffset: 3, bitOffset: 4, bitLength: 1,
    rawValue: tpms,
    displayValue: tpms ? 'Enabled' : 'Disabled',
    editable: true,
    options: [{ value: 0, label: 'Disabled' }, { value: 1, label: 'Enabled' }],
  });

  return fields;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_KNOWN_MODULES = [...FORD_MODULES, ...RAM_MODULES, ...GM_MODULES];
