/**
 * J1939 Protocol Implementation
 * 
 * J1939 is a heavy-duty vehicle communication protocol used by:
 * - Cummins ISX, ISB, ISL engines
 * - Duramax diesel engines
 * - Volvo, Freightliner, Peterbilt trucks
 * - Agricultural and construction equipment
 * 
 * Specifications:
 * - 29-bit CAN identifiers (extended CAN)
 * - 250 kbps baud rate (standard for J1939)
 * - PGN-based addressing (Parameter Group Number)
 * - Multi-packet messages for large data
 * - Broadcast and peer-to-peer communication
 */

// ─── J1939 PGN Database ──────────────────────────────────────────────────────

export interface J1939PGN {
  pgn: number;                    // Parameter Group Number (0-262143)
  name: string;
  description: string;
  priority: number;               // 0-7 (lower = higher priority)
  pduFormat: number;              // 240-255 for broadcast, 0-239 for peer-to-peer
  pduSpecific: number;            // PS field (destination or group extension)
  dataLength: number;             // Bytes in message (1-8 for single frame, variable for multi-frame)
  transmissionRate?: string;      // e.g., "100ms", "1000ms", "on change"
  parameters: J1939Parameter[];
}

export interface J1939Parameter {
  name: string;
  shortName: string;
  startByte: number;              // 0-7
  startBit: number;               // 0-7 within byte
  length: number;                 // bits (1-64)
  byteOrder: 'motorola' | 'intel'; // Big-endian or little-endian
  scale: number;                  // Multiplier
  offset: number;                 // Additive offset
  unit: string;
  min: number;
  max: number;
  resolution: number;             // Precision (e.g., 0.1, 1, 10)
}

export interface J1939Message {
  pgn: number;
  priority: number;
  sourceAddress: number;          // 0-255 (node address)
  destinationAddress?: number;    // For peer-to-peer (0-255), undefined for broadcast
  data: number[];                 // 0-8 bytes for single frame
  timestamp: number;
  isMultiPacket?: boolean;        // True if this is part of multi-packet message
}

export interface J1939ParameterReading {
  pgn: number;
  pgnName: string;
  parameter: string;
  shortName: string;
  value: number;
  unit: string;
  timestamp: number;
  sourceAddress: number;
}

// ─── Common J1939 PGNs ────────────────────────────────────────────────────────

/**
 * Electronic Engine Controller 1 (EEC1)
 * PGN 61444 (0xF004)
 * Broadcast every 50ms
 * Contains: Engine torque, percent load, engine speed, accelerator pedal position
 */
export const PGN_EEC1: J1939PGN = {
  pgn: 61444,
  name: 'Electronic Engine Controller 1',
  description: 'Engine speed, torque, load, and accelerator pedal position',
  priority: 3,
  pduFormat: 240,
  pduSpecific: 4,
  dataLength: 8,
  transmissionRate: '50ms',
  parameters: [
    {
      name: 'Engine Torque (Fractional)',
      shortName: 'ENG_TRQ_FRAC',
      startByte: 0,
      startBit: 0,
      length: 4,
      byteOrder: 'motorola',
      scale: 1,
      offset: 0,
      unit: '%',
      min: 0,
      max: 100,
      resolution: 6.25,
    },
    {
      name: 'Engine Torque (Actual)',
      shortName: 'ENG_TRQ_ACT',
      startByte: 0,
      startBit: 4,
      length: 16,
      byteOrder: 'motorola',
      scale: 1,
      offset: -125,
      unit: '%',
      min: -125,
      max: 125,
      resolution: 1,
    },
    {
      name: 'Engine Speed',
      shortName: 'ENG_SPD',
      startByte: 3,
      startBit: 0,
      length: 16,
      byteOrder: 'motorola',
      scale: 0.125,
      offset: 0,
      unit: 'rpm',
      min: 0,
      max: 8031.875,
      resolution: 0.125,
    },
    {
      name: 'Accelerator Pedal Position 1',
      shortName: 'APP1',
      startByte: 5,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 0.4,
      offset: 0,
      unit: '%',
      min: 0,
      max: 100,
      resolution: 0.4,
    },
    {
      name: 'Engine Percent Load',
      shortName: 'ENG_LOAD',
      startByte: 6,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 0.4,
      offset: 0,
      unit: '%',
      min: 0,
      max: 100,
      resolution: 0.4,
    },
  ],
};

/**
 * Electronic Transmission Controller 1 (ETC1)
 * PGN 61443 (0xF003)
 * Broadcast every 100ms
 * Contains: Transmission gear, torque converter lockup, transmission temperature
 */
export const PGN_ETC1: J1939PGN = {
  pgn: 61443,
  name: 'Electronic Transmission Controller 1',
  description: 'Transmission gear, lockup status, and temperature',
  priority: 3,
  pduFormat: 240,
  pduSpecific: 3,
  dataLength: 8,
  transmissionRate: '100ms',
  parameters: [
    {
      name: 'Transmission Output Shaft Speed',
      shortName: 'TRANS_OUT_SPD',
      startByte: 0,
      startBit: 0,
      length: 16,
      byteOrder: 'motorola',
      scale: 0.125,
      offset: 0,
      unit: 'rpm',
      min: 0,
      max: 8031.875,
      resolution: 0.125,
    },
    {
      name: 'Transmission Current Gear',
      shortName: 'TRANS_GEAR',
      startByte: 2,
      startBit: 0,
      length: 4,
      byteOrder: 'motorola',
      scale: 1,
      offset: 0,
      unit: 'gear',
      min: 0,
      max: 15,
      resolution: 1,
    },
    {
      name: 'Transmission Fluid Temperature',
      shortName: 'TRANS_TEMP',
      startByte: 3,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 1,
      offset: -40,
      unit: '°C',
      min: -40,
      max: 215,
      resolution: 1,
    },
    {
      name: 'Torque Converter Lockup Status',
      shortName: 'TCC_STATUS',
      startByte: 4,
      startBit: 0,
      length: 2,
      byteOrder: 'motorola',
      scale: 1,
      offset: 0,
      unit: 'status',
      min: 0,
      max: 3,
      resolution: 1,
    },
  ],
};

/**
 * Engine Temperature 1 (ET1)
 * PGN 110592 (0x1F200)
 * Broadcast every 1000ms
 * Contains: Coolant temperature, oil temperature, turbo inlet/outlet temps
 */
export const PGN_ET1: J1939PGN = {
  pgn: 110592,
  name: 'Engine Temperature 1',
  description: 'Coolant, oil, and turbo temperatures',
  priority: 6,
  pduFormat: 241,
  pduSpecific: 32,
  dataLength: 8,
  transmissionRate: '1000ms',
  parameters: [
    {
      name: 'Engine Coolant Temperature',
      shortName: 'ECT',
      startByte: 0,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 1,
      offset: -40,
      unit: '°C',
      min: -40,
      max: 215,
      resolution: 1,
    },
    {
      name: 'Engine Oil Temperature',
      shortName: 'OIL_TEMP',
      startByte: 1,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 1,
      offset: -40,
      unit: '°C',
      min: -40,
      max: 215,
      resolution: 1,
    },
    {
      name: 'Turbo Compressor Inlet Temperature',
      shortName: 'TURBO_INLET_TEMP',
      startByte: 2,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 1,
      offset: -40,
      unit: '°C',
      min: -40,
      max: 215,
      resolution: 1,
    },
    {
      name: 'Turbo Compressor Outlet Temperature',
      shortName: 'TURBO_OUTLET_TEMP',
      startByte: 3,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 1,
      offset: -40,
      unit: '°C',
      min: -40,
      max: 215,
      resolution: 1,
    },
  ],
};

/**
 * Engine Fluid Level/Pressure 1 (EFL/P1)
 * PGN 98816 (0x18200)
 * Broadcast every 1000ms
 * Contains: Fuel level, oil pressure, coolant level
 */
export const PGN_EFL_P1: J1939PGN = {
  pgn: 98816,
  name: 'Engine Fluid Level/Pressure 1',
  description: 'Fuel level, oil pressure, and coolant level',
  priority: 6,
  pduFormat: 241,
  pduSpecific: 0,
  dataLength: 8,
  transmissionRate: '1000ms',
  parameters: [
    {
      name: 'Fuel Level',
      shortName: 'FUEL_LEVEL',
      startByte: 0,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 0.4,
      offset: 0,
      unit: '%',
      min: 0,
      max: 100,
      resolution: 0.4,
    },
    {
      name: 'Engine Oil Pressure',
      shortName: 'OIL_PRES',
      startByte: 1,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 4,
      offset: 0,
      unit: 'kPa',
      min: 0,
      max: 1020,
      resolution: 4,
    },
    {
      name: 'Engine Coolant Level',
      shortName: 'COOLANT_LEVEL',
      startByte: 2,
      startBit: 0,
      length: 8,
      byteOrder: 'motorola',
      scale: 0.4,
      offset: 0,
      unit: '%',
      min: 0,
      max: 100,
      resolution: 0.4,
    },
  ],
};

/**
 * Fuel Consumption (Liquid)
 * PGN 183296 (0x2C700)
 * Broadcast every 1000ms
 * Contains: Fuel consumption rate, total fuel used
 */
export const PGN_FUEL_CONS: J1939PGN = {
  pgn: 183296,
  name: 'Fuel Consumption (Liquid)',
  description: 'Fuel consumption rate and total fuel used',
  priority: 6,
  pduFormat: 241,
  pduSpecific: 199,
  dataLength: 8,
  transmissionRate: '1000ms',
  parameters: [
    {
      name: 'Fuel Consumption Rate',
      shortName: 'FUEL_RATE',
      startByte: 0,
      startBit: 0,
      length: 16,
      byteOrder: 'motorola',
      scale: 0.05,
      offset: 0,
      unit: 'L/h',
      min: 0,
      max: 3276.75,
      resolution: 0.05,
    },
    {
      name: 'Total Fuel Used',
      shortName: 'TOTAL_FUEL',
      startByte: 2,
      startBit: 0,
      length: 32,
      byteOrder: 'motorola',
      scale: 0.5,
      offset: 0,
      unit: 'L',
      min: 0,
      max: 2147483647,
      resolution: 0.5,
    },
  ],
};

/**
 * Diagnostic Message 1 (DM1)
 * PGN 65226 (0xFECA)
 * Broadcast every 100ms
 * Contains: Active fault codes (Suspect Parameter Numbers)
 */
export const PGN_DM1: J1939PGN = {
  pgn: 65226,
  name: 'Diagnostic Message 1 (Active Faults)',
  description: 'Active fault codes and lamp status',
  priority: 6,
  pduFormat: 254,
  pduSpecific: 202,
  dataLength: 8,
  transmissionRate: '100ms',
  parameters: [
    {
      name: 'Malfunction Indicator Lamp Status',
      shortName: 'MIL_STATUS',
      startByte: 0,
      startBit: 0,
      length: 2,
      byteOrder: 'motorola',
      scale: 1,
      offset: 0,
      unit: 'status',
      min: 0,
      max: 3,
      resolution: 1,
    },
    {
      name: 'Red Stop Lamp Status',
      shortName: 'STOP_LAMP',
      startByte: 0,
      startBit: 2,
      length: 2,
      byteOrder: 'motorola',
      scale: 1,
      offset: 0,
      unit: 'status',
      min: 0,
      max: 3,
      resolution: 1,
    },
    {
      name: 'Amber Warning Lamp Status',
      shortName: 'AMBER_LAMP',
      startByte: 0,
      startBit: 4,
      length: 2,
      byteOrder: 'motorola',
      scale: 1,
      offset: 0,
      unit: 'status',
      min: 0,
      max: 3,
      resolution: 1,
    },
  ],
};

// ─── J1939 Message Parsing ───────────────────────────────────────────────────

/**
 * Extract PGN from 29-bit CAN ID
 * CAN ID format: [P P P P P P P P P P P P P P P P P P P D D D D D D D D D]
 * P = PGN bits (18 bits), D = destination address (8 bits)
 */
export function extractPGN(canId: number): number {
  return (canId >> 8) & 0x3FFFF;
}

/**
 * Extract priority from 29-bit CAN ID
 * CAN ID format: [P P P P P P P P P P P P P P P P P P P D D D D D D D D D]
 * Priority is in bits 26-28 (3 bits)
 */
export function extractPriority(canId: number): number {
  return (canId >> 26) & 0x07;
}

/**
 * Extract source address from 29-bit CAN ID
 * CAN ID format: [P P P P P P P P P P P P P P P P P P P D D D D D D D D D]
 * Source address is in bits 0-7 (8 bits)
 */
export function extractSourceAddress(canId: number): number {
  return canId & 0xFF;
}

/**
 * Extract destination address from 29-bit CAN ID (for peer-to-peer)
 * Only valid if PGN < 240 (PDU1 format)
 */
export function extractDestinationAddress(canId: number): number | undefined {
  const pgn = extractPGN(canId);
  if (pgn >= 240) return undefined; // Broadcast message
  return (canId >> 8) & 0xFF;
}

/**
 * Parse J1939 parameter value from message data
 */
export function parseJ1939Parameter(
  data: number[],
  param: J1939Parameter
): number {
  let value = 0;

  if (param.byteOrder === 'motorola') {
    // Big-endian (Motorola)
    for (let i = 0; i < Math.ceil(param.length / 8); i++) {
      if (param.startByte + i < data.length) {
        value = (value << 8) | data[param.startByte + i];
      }
    }
  } else {
    // Little-endian (Intel)
    for (let i = Math.ceil(param.length / 8) - 1; i >= 0; i--) {
      if (param.startByte + i < data.length) {
        value = (value << 8) | data[param.startByte + i];
      }
    }
  }

  // Extract bits
  const mask = (1 << param.length) - 1;
  value = (value >> param.startBit) & mask;

  // Apply scale and offset
  return value * param.scale + param.offset;
}

/**
 * Get all J1939 PGNs as a database
 */
export const J1939_PGNS: Record<number, J1939PGN> = {
  [PGN_EEC1.pgn]: PGN_EEC1,
  [PGN_ETC1.pgn]: PGN_ETC1,
  [PGN_ET1.pgn]: PGN_ET1,
  [PGN_EFL_P1.pgn]: PGN_EFL_P1,
  [PGN_FUEL_CONS.pgn]: PGN_FUEL_CONS,
  [PGN_DM1.pgn]: PGN_DM1,
};

/**
 * Find PGN by number
 */
export function findJ1939PGN(pgn: number): J1939PGN | undefined {
  return J1939_PGNS[pgn];
}

/**
 * Get all parameters for a PGN
 */
export function getJ1939Parameters(pgn: number): J1939Parameter[] {
  const pgnDef = findJ1939PGN(pgn);
  return pgnDef?.parameters ?? [];
}

/**
 * Create J1939 CAN ID from components
 */
export function createJ1939CanId(
  priority: number,
  pgn: number,
  sourceAddress: number,
  destinationAddress?: number
): number {
  let canId = 0;
  canId |= (priority & 0x07) << 26;
  canId |= (pgn & 0x3FFFF) << 8;
  if (destinationAddress !== undefined && pgn < 240) {
    canId |= (destinationAddress & 0xFF) << 8;
  }
  canId |= sourceAddress & 0xFF;
  return canId;
}
