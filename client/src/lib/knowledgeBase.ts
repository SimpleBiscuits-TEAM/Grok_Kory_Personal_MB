/**
 * PPEI Advanced Mode — Knowledge Base
 * Compiled from: SAE J1979-2002, SAE J1979-2-2021, OBD on UDS,
 * GM Mode 6 Data Definitions, Wikipedia OBD-II PIDs
 *
 * This module provides structured, searchable data for the Advanced Mode
 * document-aware search engine. All data is client-side TypeScript.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KBDocument {
  id: string;
  title: string;
  source: string;
  category: KBCategory;
  tags: string[];
  content: string;
  metadata?: Record<string, string>;
}

export type KBCategory =
  | 'pid'
  | 'mode6'
  | 'dtc'
  | 'standard'
  | 'protocol'
  | 'readiness'
  | 'freeze_frame'
  | 'uds'
  | 'formula'
  | 'monitor'
  | 'threshold';

export interface OBDPid {
  pidHex: string;
  pidDec: number;
  service: string;
  bytes: number;
  description: string;
  minValue?: string;
  maxValue?: string;
  units?: string;
  formula?: string;
  notes?: string;
}

export interface Mode6Monitor {
  obdmid: string;
  obdmidName: string;
  testId: string;
  uasid: string;
  description: string;
  range: string;
  resolution: string;
  notes?: string;
}

export interface UDSServiceMapping {
  classicMode: string;
  classicDesc: string;
  udsService: string;
  udsDesc: string;
  notes?: string;
}

// ─── OBD-II Standard PIDs (Service 01) ──────────────────────────────────────

export const OBD_PIDS: OBDPid[] = [
  { pidHex: '00', pidDec: 0, service: '01', bytes: 4, description: 'PIDs supported [$01-$20]', notes: 'Bit encoded [A7..D0] == [PID $01..PID $20]' },
  { pidHex: '01', pidDec: 1, service: '01', bytes: 4, description: 'Monitor status since DTCs cleared (MIL status, DTC count, readiness)', notes: 'Bit encoded' },
  { pidHex: '02', pidDec: 2, service: '01', bytes: 2, description: 'DTC that caused freeze frame to be stored' },
  { pidHex: '03', pidDec: 3, service: '01', bytes: 2, description: 'Fuel system status', notes: 'Bit encoded' },
  { pidHex: '04', pidDec: 4, service: '01', bytes: 1, description: 'Calculated engine load', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '05', pidDec: 5, service: '01', bytes: 1, description: 'Engine coolant temperature', minValue: '-40', maxValue: '215', units: '°C', formula: 'A-40' },
  { pidHex: '06', pidDec: 6, service: '01', bytes: 1, description: 'Short term fuel trim (STFT) — Bank 1', minValue: '-100', maxValue: '99.2', units: '%', formula: '(A-128)*100/128' },
  { pidHex: '07', pidDec: 7, service: '01', bytes: 1, description: 'Long term fuel trim (LTFT) — Bank 1', minValue: '-100', maxValue: '99.2', units: '%', formula: '(A-128)*100/128' },
  { pidHex: '08', pidDec: 8, service: '01', bytes: 1, description: 'Short term fuel trim (STFT) — Bank 2', minValue: '-100', maxValue: '99.2', units: '%', formula: '(A-128)*100/128' },
  { pidHex: '09', pidDec: 9, service: '01', bytes: 1, description: 'Long term fuel trim (LTFT) — Bank 2', minValue: '-100', maxValue: '99.2', units: '%', formula: '(A-128)*100/128' },
  { pidHex: '0A', pidDec: 10, service: '01', bytes: 1, description: 'Fuel pressure (gauge)', minValue: '0', maxValue: '765', units: 'kPa', formula: 'A*3' },
  { pidHex: '0B', pidDec: 11, service: '01', bytes: 1, description: 'Intake manifold absolute pressure (MAP)', minValue: '0', maxValue: '255', units: 'kPa', formula: 'A' },
  { pidHex: '0C', pidDec: 12, service: '01', bytes: 2, description: 'Engine speed (RPM)', minValue: '0', maxValue: '16383.75', units: 'rpm', formula: '((A*256)+B)/4' },
  { pidHex: '0D', pidDec: 13, service: '01', bytes: 1, description: 'Vehicle speed', minValue: '0', maxValue: '255', units: 'km/h', formula: 'A' },
  { pidHex: '0E', pidDec: 14, service: '01', bytes: 1, description: 'Timing advance', minValue: '-64', maxValue: '63.5', units: '° before TDC', formula: '(A-128)/2' },
  { pidHex: '0F', pidDec: 15, service: '01', bytes: 1, description: 'Intake air temperature (IAT)', minValue: '-40', maxValue: '215', units: '°C', formula: 'A-40' },
  { pidHex: '10', pidDec: 16, service: '01', bytes: 2, description: 'Mass air flow sensor (MAF) air flow rate', minValue: '0', maxValue: '655.35', units: 'g/s', formula: '((A*256)+B)/100' },
  { pidHex: '11', pidDec: 17, service: '01', bytes: 1, description: 'Throttle position', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '12', pidDec: 18, service: '01', bytes: 1, description: 'Commanded secondary air status', notes: 'Bit encoded' },
  { pidHex: '13', pidDec: 19, service: '01', bytes: 1, description: 'Oxygen sensors present (in 2 banks)', notes: '[A0..A3] = Bank 1, [A4..A7] = Bank 2' },
  { pidHex: '14', pidDec: 20, service: '01', bytes: 2, description: 'Oxygen Sensor 1: Voltage / Short term fuel trim', minValue: '0 / -100', maxValue: '1.275 / 99.2', units: 'V / %' },
  { pidHex: '1C', pidDec: 28, service: '01', bytes: 1, description: 'OBD standards this vehicle conforms to', notes: 'Enumerated value 1-250' },
  { pidHex: '1F', pidDec: 31, service: '01', bytes: 2, description: 'Run time since engine start', minValue: '0', maxValue: '65535', units: 'seconds', formula: '(A*256)+B' },
  { pidHex: '21', pidDec: 33, service: '01', bytes: 2, description: 'Distance traveled with MIL on', minValue: '0', maxValue: '65535', units: 'km', formula: '(A*256)+B' },
  { pidHex: '22', pidDec: 34, service: '01', bytes: 2, description: 'Fuel rail pressure (relative to manifold vacuum)', minValue: '0', maxValue: '5177.265', units: 'kPa', formula: '((A*256)+B)*0.079' },
  { pidHex: '23', pidDec: 35, service: '01', bytes: 2, description: 'Fuel rail gauge pressure (diesel/GDI)', minValue: '0', maxValue: '655350', units: 'kPa', formula: '((A*256)+B)*10' },
  { pidHex: '2C', pidDec: 44, service: '01', bytes: 1, description: 'Commanded EGR', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '2D', pidDec: 45, service: '01', bytes: 1, description: 'EGR Error', minValue: '-100', maxValue: '99.2', units: '%', formula: '(A-128)*100/128' },
  { pidHex: '2E', pidDec: 46, service: '01', bytes: 1, description: 'Commanded evaporative purge', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '2F', pidDec: 47, service: '01', bytes: 1, description: 'Fuel tank level input', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '30', pidDec: 48, service: '01', bytes: 1, description: 'Warm-ups since codes cleared', minValue: '0', maxValue: '255', units: 'count', formula: 'A' },
  { pidHex: '31', pidDec: 49, service: '01', bytes: 2, description: 'Distance traveled since codes cleared', minValue: '0', maxValue: '65535', units: 'km', formula: '(A*256)+B' },
  { pidHex: '33', pidDec: 51, service: '01', bytes: 1, description: 'Barometric pressure', minValue: '0', maxValue: '255', units: 'kPa', formula: 'A' },
  { pidHex: '3C', pidDec: 60, service: '01', bytes: 2, description: 'Catalyst Temperature: Bank 1, Sensor 1', minValue: '-40', maxValue: '6513.5', units: '°C', formula: '((A*256)+B)/10 - 40' },
  { pidHex: '3D', pidDec: 61, service: '01', bytes: 2, description: 'Catalyst Temperature: Bank 2, Sensor 1', minValue: '-40', maxValue: '6513.5', units: '°C', formula: '((A*256)+B)/10 - 40' },
  { pidHex: '3E', pidDec: 62, service: '01', bytes: 2, description: 'Catalyst Temperature: Bank 1, Sensor 2', minValue: '-40', maxValue: '6513.5', units: '°C', formula: '((A*256)+B)/10 - 40' },
  { pidHex: '3F', pidDec: 63, service: '01', bytes: 2, description: 'Catalyst Temperature: Bank 2, Sensor 2', minValue: '-40', maxValue: '6513.5', units: '°C', formula: '((A*256)+B)/10 - 40' },
  { pidHex: '42', pidDec: 66, service: '01', bytes: 2, description: 'Control module voltage', minValue: '0', maxValue: '65.535', units: 'V', formula: '((A*256)+B)/1000' },
  { pidHex: '43', pidDec: 67, service: '01', bytes: 2, description: 'Absolute load value', minValue: '0', maxValue: '25700', units: '%', formula: '((A*256)+B)*100/255' },
  { pidHex: '44', pidDec: 68, service: '01', bytes: 2, description: 'Commanded air-fuel equivalence ratio (lambda)', minValue: '0', maxValue: '2', units: 'ratio', formula: '((A*256)+B)/32768' },
  { pidHex: '45', pidDec: 69, service: '01', bytes: 1, description: 'Relative throttle position', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '46', pidDec: 70, service: '01', bytes: 1, description: 'Ambient air temperature', minValue: '-40', maxValue: '215', units: '°C', formula: 'A-40' },
  { pidHex: '47', pidDec: 71, service: '01', bytes: 1, description: 'Absolute throttle position B', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '49', pidDec: 73, service: '01', bytes: 1, description: 'Accelerator pedal position D', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '4A', pidDec: 74, service: '01', bytes: 1, description: 'Accelerator pedal position E', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '4C', pidDec: 76, service: '01', bytes: 1, description: 'Commanded throttle actuator', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '4D', pidDec: 77, service: '01', bytes: 2, description: 'Time run with MIL on', minValue: '0', maxValue: '65535', units: 'minutes', formula: '(A*256)+B' },
  { pidHex: '4E', pidDec: 78, service: '01', bytes: 2, description: 'Time since trouble codes cleared', minValue: '0', maxValue: '65535', units: 'minutes', formula: '(A*256)+B' },
  { pidHex: '51', pidDec: 81, service: '01', bytes: 1, description: 'Fuel type', notes: 'Enumerated: 0=N/A, 1=Gasoline, 2=Methanol, 3=Ethanol, 4=Diesel, 5=LPG, 6=CNG, 7=Propane, 8=Electric...' },
  { pidHex: '5A', pidDec: 90, service: '01', bytes: 1, description: 'Relative accelerator pedal position', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '5B', pidDec: 91, service: '01', bytes: 1, description: 'Hybrid battery pack remaining life', minValue: '0', maxValue: '100', units: '%', formula: 'A*100/255' },
  { pidHex: '5C', pidDec: 92, service: '01', bytes: 1, description: 'Engine oil temperature', minValue: '-40', maxValue: '210', units: '°C', formula: 'A-40' },
  { pidHex: '5D', pidDec: 93, service: '01', bytes: 2, description: 'Fuel injection timing', minValue: '-210', maxValue: '301.992', units: '°', formula: '(((A*256)+B)-26880)/128' },
  { pidHex: '5E', pidDec: 94, service: '01', bytes: 2, description: 'Engine fuel rate', minValue: '0', maxValue: '3276.75', units: 'L/h', formula: '((A*256)+B)*0.05' },
  { pidHex: '61', pidDec: 97, service: '01', bytes: 1, description: 'Driver demand engine torque', minValue: '-125', maxValue: '130', units: '%', formula: 'A-125' },
  { pidHex: '62', pidDec: 98, service: '01', bytes: 1, description: 'Actual engine torque', minValue: '-125', maxValue: '130', units: '%', formula: 'A-125' },
  { pidHex: '63', pidDec: 99, service: '01', bytes: 2, description: 'Engine reference torque', minValue: '0', maxValue: '65535', units: 'Nm', formula: '(A*256)+B' },
  { pidHex: '66', pidDec: 102, service: '01', bytes: 5, description: 'Mass air flow sensor (multiple sensors)', notes: 'Sensor A and B with support flags' },
  { pidHex: '67', pidDec: 103, service: '01', bytes: 3, description: 'Engine coolant temperature (multiple sensors)', notes: 'Sensor 1 and 2 with support flags' },
  { pidHex: '6B', pidDec: 107, service: '01', bytes: 5, description: 'Exhaust gas temperature (EGT) Bank 1', notes: 'Sensors 1-4 with support flags' },
  { pidHex: '6C', pidDec: 108, service: '01', bytes: 5, description: 'Exhaust gas temperature (EGT) Bank 2', notes: 'Sensors 1-4 with support flags' },
  { pidHex: '70', pidDec: 112, service: '01', bytes: 9, description: 'Boost pressure control', notes: 'Includes desired/actual boost, status' },
  { pidHex: '73', pidDec: 115, service: '01', bytes: 5, description: 'Exhaust pressure', notes: 'Sensor 1 and 2 with support flags' },
  { pidHex: '74', pidDec: 116, service: '01', bytes: 5, description: 'Turbocharger RPM', notes: 'Turbo A and B with support flags' },
  { pidHex: '75', pidDec: 117, service: '01', bytes: 7, description: 'Turbocharger temperature', notes: 'Turbo A and B inlet/outlet' },
  { pidHex: '7C', pidDec: 124, service: '01', bytes: 9, description: 'DPF temperature', notes: 'Inlet/outlet sensors Bank 1 and 2' },
  { pidHex: '7E', pidDec: 126, service: '01', bytes: 2, description: 'DPF differential pressure', notes: 'Sensor 1 and 2' },
  { pidHex: '7F', pidDec: 127, service: '01', bytes: 9, description: 'NOx sensor', notes: 'Corrected/uncorrected values, concentration' },
  { pidHex: '83', pidDec: 131, service: '01', bytes: 5, description: 'NOx reagent system (DEF/AdBlue)', notes: 'Tank level, consumption rate' },
  { pidHex: '84', pidDec: 132, service: '01', bytes: 5, description: 'Particulate matter (PM) sensor', notes: 'Bank 1 and 2' },
];

// ─── OBD-II Services / Modes ────────────────────────────────────────────────

export const OBD_SERVICES = [
  { mode: '01', hex: '$01', description: 'Show current data', detail: 'Request real-time sensor data from the vehicle. Returns PID values for engine parameters like RPM, coolant temp, MAF, boost pressure, etc.' },
  { mode: '02', hex: '$02', description: 'Show freeze frame data', detail: 'Snapshot of sensor data captured when a DTC was stored. Contains the same PIDs as Mode 01 but frozen at the moment of fault detection.' },
  { mode: '03', hex: '$03', description: 'Show stored Diagnostic Trouble Codes', detail: 'Returns all confirmed/stored DTCs. Each DTC is 2 bytes: first nibble encodes category (P/C/B/U), remaining 4 nibbles encode the specific fault.' },
  { mode: '04', hex: '$04', description: 'Clear DTCs and stored values', detail: 'Clears all stored DTCs, freeze frame data, and resets readiness monitors. MIL is turned off. Requires engine off or idle.' },
  { mode: '05', hex: '$05', description: 'Test results, oxygen sensor monitoring (non-CAN)', detail: 'Returns O2 sensor test results for non-CAN vehicles. Replaced by Mode 06 for CAN-equipped vehicles.' },
  { mode: '06', hex: '$06', description: 'Test results, other component/system monitoring', detail: 'Returns test results for on-board monitoring systems. For CAN vehicles, includes O2 sensor monitoring. Contains monitor IDs, test IDs, min/max thresholds, and actual test values.' },
  { mode: '07', hex: '$07', description: 'Show pending DTCs', detail: 'Returns DTCs detected during current or last driving cycle but not yet confirmed. These are "maturing" faults that may become confirmed DTCs.' },
  { mode: '08', hex: '$08', description: 'Control operation of on-board component/system', detail: 'Allows external test equipment to control on-board systems for testing. Manufacturer-specific implementation.' },
  { mode: '09', hex: '$09', description: 'Request vehicle information', detail: 'Returns VIN, calibration IDs, calibration verification numbers (CVN), ECU name, and in-use performance tracking data.' },
  { mode: '0A', hex: '$0A', description: 'Permanent DTCs (cleared DTCs)', detail: 'Returns permanent DTCs that cannot be cleared by Mode 04. These remain until the ECM verifies the fault condition no longer exists through normal driving.' },
];

// ─── GM Mode 6 Monitor Data ─────────────────────────────────────────────────

export const GM_MODE6_MONITORS: Mode6Monitor[] = [
  // Monitor 01: O2 Sensor B1S1
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '01', uasid: '0A', description: 'Rich to Lean Sensor Threshold Voltage', range: '0-7.99V', resolution: '0.122 mV/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '02', uasid: '0A', description: 'Lean to Rich Sensor Threshold Voltage', range: '0-7.99V', resolution: '0.122 mV/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '05', uasid: '10', description: 'Rich to Lean Sensor Switch Time', range: '0-65535 ms', resolution: '1 ms/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '06', uasid: '10', description: 'Lean to Rich Sensor Switch Time', range: '0-65535 ms', resolution: '1 ms/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '07', uasid: '0A', description: 'Minimum Sensor Voltage Achieved', range: '0-7.99V', resolution: '0.122 mV/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '08', uasid: '0A', description: 'Maximum Sensor Voltage Achieved', range: '0-7.99V', resolution: '0.122 mV/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '10', uasid: '06', description: 'B1S1 WRAF Slow Response', range: '0-19.99', resolution: '0.000305/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '80', uasid: '2B', description: 'Rich to Lean Switches Test Results', range: '0-65535 switches', resolution: '1 switch/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '81', uasid: '2B', description: 'Lean to Rich Switches Test Results', range: '0-65535 switches', resolution: '1 switch/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: '82', uasid: '20', description: 'Rich-Lean Response to Lean-Rich Response Ratio', range: '0-255.996', resolution: '0.0039062/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: 'D0', uasid: '24', description: 'O2 Value Plausibility Check During Overrun B1S1', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: 'D3', uasid: '86', description: 'NOx Sensor Performance - Signal High', range: '-9.994 to +9.994', resolution: '0.000305/bit' },
  { obdmid: '01', obdmidName: 'Oxygen Sensor Monitor Bank 1 Sensor 1', testId: 'D4', uasid: '86', description: 'NOx Sensor Performance - Signal Low', range: '-9.994 to +9.994', resolution: '0.000305/bit' },

  // Monitor 21: Catalyst B1
  { obdmid: '21', obdmidName: 'Catalyst Monitor Bank 1', testId: '80', uasid: '24', description: 'OSC Normalized Ratio', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '21', obdmidName: 'Catalyst Monitor Bank 1', testId: '81', uasid: '24', description: 'OSC Compensation', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '21', obdmidName: 'Catalyst Monitor Bank 1', testId: '82', uasid: '24', description: 'Catalyst Diagnostic B1', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '21', obdmidName: 'Catalyst Monitor Bank 1', testId: '83', uasid: '24', description: 'Catalyst DFCO Exit Test', range: '0-65535 counts', resolution: '1 count/bit' },

  // Monitor 31: EGR
  { obdmid: '31', obdmidName: 'EGR Monitor Bank 1', testId: 'A0', uasid: '2F', description: 'EGR Slow Response - Increasing Flow', range: '0-100%', resolution: '0.001526%/bit' },
  { obdmid: '31', obdmidName: 'EGR Monitor Bank 1', testId: 'A1', uasid: '2F', description: 'EGR Slow Response - Decreasing Flow', range: '0-100%', resolution: '0.001526%/bit' },
  { obdmid: '31', obdmidName: 'EGR Monitor Bank 1', testId: 'A2', uasid: '05', description: 'EGR Cooler Efficiency', range: '0-1.999', resolution: '0.0000305/bit' },
  { obdmid: '31', obdmidName: 'EGR Monitor Bank 1', testId: 'A3', uasid: '82', description: 'Excessive EGR', range: '-327.68 to +327.67', resolution: '0.01/bit' },
  { obdmid: '31', obdmidName: 'EGR Monitor Bank 1', testId: 'A4', uasid: '82', description: 'Insufficient EGR', range: '-327.68 to +327.67', resolution: '0.01/bit' },
  { obdmid: '31', obdmidName: 'EGR Monitor Bank 1', testId: 'AE', uasid: '24', description: 'Excessive EGR flow monitor', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '31', obdmidName: 'EGR Monitor Bank 1', testId: 'AF', uasid: '24', description: 'Insufficient EGR flow monitor', range: '0-65535 counts', resolution: '1 count/bit' },

  // Monitor 35: VVT B1
  { obdmid: '35', obdmidName: 'VVT Monitor Bank 1', testId: '9A', uasid: '9C', description: 'Exhaust Camshaft Slow Response', range: '-327.68 to +327.67°', resolution: '0.01°/bit' },
  { obdmid: '35', obdmidName: 'VVT Monitor Bank 1', testId: '9B', uasid: '9C', description: 'Exhaust Camshaft Target Error', range: '-327.68 to +327.67°', resolution: '0.01°/bit' },
  { obdmid: '35', obdmidName: 'VVT Monitor Bank 1', testId: '9D', uasid: '9C', description: 'Intake Camshaft Slow Response', range: '-327.68 to +327.67°', resolution: '0.01°/bit' },
  { obdmid: '35', obdmidName: 'VVT Monitor Bank 1', testId: '9E', uasid: '9C', description: 'Intake Camshaft Target Error', range: '-327.68 to +327.67°', resolution: '0.01°/bit' },

  // Monitor 39: EVAP Cap Off
  { obdmid: '39', obdmidName: 'EVAP Monitor (Cap Off)', testId: '39', uasid: 'FE', description: 'Cap Off/Gross Leak', range: '0-65535', resolution: 'varies' },
  { obdmid: '39', obdmidName: 'EVAP Monitor (Cap Off)', testId: '3A', uasid: '32', description: 'Large Leak', range: '0-65535', resolution: 'varies' },

  // Monitor 3C: EVAP 0.020"
  { obdmid: '3C', obdmidName: 'EVAP Monitor 0.020"', testId: 'C3', uasid: '32', description: 'EVPD NV 0.020 Test', range: '0-65535', resolution: 'varies' },
  { obdmid: '3C', obdmidName: 'EVAP Monitor 0.020"', testId: 'C8', uasid: 'FD', description: 'EONV NV 0.020 Test', range: '0-65535 kPa', resolution: 'varies' },
  { obdmid: '3C', obdmidName: 'EVAP Monitor 0.020"', testId: 'C9', uasid: 'FE', description: 'Canister Vent Valve Stuck Closed', range: '0-65535', resolution: 'varies' },
  { obdmid: '3C', obdmidName: 'EVAP Monitor 0.020"', testId: 'CB', uasid: 'FE', description: 'Canister Purge Valve Stuck Open', range: '0-65535', resolution: 'varies' },

  // Monitor 3D: Purge Flow
  { obdmid: '3D', obdmidName: 'Purge Flow Monitor', testId: '88', uasid: '81', description: 'Purge Valve Flow Test - Stuck Open / Leak', range: '-32768 to +32767', resolution: '1/bit' },
  { obdmid: '3D', obdmidName: 'Purge Flow Monitor', testId: '8C', uasid: '81', description: 'Canister Vent Valve Test - Stuck Closed / Restricted', range: '-32768 to +32767', resolution: '1/bit' },

  // Monitor 81: Fuel System B1
  { obdmid: '81', obdmidName: 'Fuel System Monitor Bank 1', testId: '90', uasid: '9C', description: 'Cylinder 1 Injection Timing Only Retarded', range: '-327.68 to 327.67°', resolution: '0.01°/bit' },
  { obdmid: '81', obdmidName: 'Fuel System Monitor Bank 1', testId: 'B1', uasid: '84', description: 'Air Fuel Imbalance Monitor Variance Ratio EWMA-Normal Mode Bank 1', range: '-32.768 to +32.767', resolution: '0.001/bit' },
  { obdmid: '81', obdmidName: 'Fuel System Monitor Bank 1', testId: 'E0', uasid: '24', description: 'A/F Ratio Deviation Max', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '81', obdmidName: 'Fuel System Monitor Bank 1', testId: 'F0', uasid: 'FB', description: 'Fuel Rail Pressure Positive Deviation', range: '-327680 to +327670 kPa', resolution: '10 kPa/bit' },
  { obdmid: '81', obdmidName: 'Fuel System Monitor Bank 1', testId: 'F1', uasid: 'FB', description: 'Fuel Rail Pressure Negative Deviation', range: '-327680 to +327670 kPa', resolution: '10 kPa/bit' },
  { obdmid: '81', obdmidName: 'Fuel System Monitor Bank 1', testId: 'F2', uasid: '24', description: 'Fuel Pressure Regulator 1 Exceeded Control Limits Too Low', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '81', obdmidName: 'Fuel System Monitor Bank 1', testId: 'F3', uasid: '24', description: 'Fuel Pressure Regulator 1 Exceeded Control Limits Too High', range: '0-65535 counts', resolution: '1 count/bit' },

  // Monitor 85: Boost Pressure Control
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B0', uasid: '30', description: 'Turbocharger Vane Position Slow Response - Increasing Position', range: '0-100%', resolution: '0.001526%/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B1', uasid: '30', description: 'Turbocharger Vane Position Slow Response - Decreasing Position', range: '0-100%', resolution: '0.001526%/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B2', uasid: '05', description: 'Charge Air Cooler Efficiency', range: '0-1.999', resolution: '0.0000305/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B3', uasid: '24', description: 'Monitoring for Underboost', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B4', uasid: '24', description: 'Monitoring for Overboost', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B5', uasid: 'AF', description: 'Turbocharger Vane Position Performance - Low Position', range: '-327.68 to +327.67%', resolution: '0.01%/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B6', uasid: 'AF', description: 'Turbocharger Vane Position Performance - High Position', range: '-327.68 to +327.67%', resolution: '0.01%/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B7', uasid: '17', description: 'Boost Pressure Slow Response - Increasing', range: '0-655.35 kPa', resolution: '0.01 kPa/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B8', uasid: '17', description: 'Boost Pressure Slow Response - Decreasing', range: '0-655.35 kPa', resolution: '0.01 kPa/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'B9', uasid: '24', description: 'Monitoring for Excessive Boost', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'BA', uasid: 'FC', description: 'Turbo/Super Charger Engine Underboost', range: '-327.68 to +327.67 kPa', resolution: '0.01 kPa/bit' },
  { obdmid: '85', obdmidName: 'Boost Pressure Control Monitor Bank 1', testId: 'BB', uasid: 'FC', description: 'Turbo/Super Charger Engine Overboost', range: '-327.68 to +327.67 kPa', resolution: '0.01 kPa/bit' },

  // Monitor 90: NOx Trap
  { obdmid: '90', obdmidName: 'NOx Trap Efficiency', testId: '80', uasid: '39', description: 'NOx Trap Efficiency Below Threshold Bank 1', range: '-327.68 to +327.67%', resolution: '0.01%/bit' },

  // Monitor 98: NOx Catalyst
  { obdmid: '98', obdmidName: 'NOx Catalyst Monitor Bank 1', testId: '90', uasid: '84', description: 'SCR NOx Efficiency', range: '-32.768 to +32.767', resolution: '0.001/bit' },
  { obdmid: '98', obdmidName: 'NOx Catalyst Monitor Bank 1', testId: '91', uasid: '84', description: 'Diesel Emission Fluid Quality', range: '-32.768 to +32.767', resolution: '0.001/bit' },
  { obdmid: '98', obdmidName: 'NOx Catalyst Monitor Bank 1', testId: '92', uasid: '03', description: 'Closed Loop Reductant Injection Control at Limit - Flow Too Low', range: '0-655.35', resolution: '0.01/bit' },
  { obdmid: '98', obdmidName: 'NOx Catalyst Monitor Bank 1', testId: '93', uasid: '03', description: 'Closed Loop Reductant Injection Control at Limit - Flow Too High', range: '0-655.35', resolution: '0.01/bit' },
  { obdmid: '98', obdmidName: 'NOx Catalyst Monitor Bank 1', testId: '94', uasid: '17', description: 'Reductant Delivery Performance Monitoring', range: '0-655.35 kPa', resolution: '0.01 kPa/bit' },
  { obdmid: '98', obdmidName: 'NOx Catalyst Monitor Bank 1', testId: '9A', uasid: '84', description: 'NOx Catalyst Efficiency Below Threshold During DPF Regen Bank 1 Cat 2', range: '-32.768 to +32.767', resolution: '0.001/bit' },

  // Monitor A2-A9: Misfire Cylinders 1-8
  { obdmid: 'A2', obdmidName: 'Misfire Cylinder 1 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A2', obdmidName: 'Misfire Cylinder 1 Data', testId: '0C', uasid: '24', description: 'Misfire counts for the last/current driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A3', obdmidName: 'Misfire Cylinder 2 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A4', obdmidName: 'Misfire Cylinder 3 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A5', obdmidName: 'Misfire Cylinder 4 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A6', obdmidName: 'Misfire Cylinder 5 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A7', obdmidName: 'Misfire Cylinder 6 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A8', obdmidName: 'Misfire Cylinder 7 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },
  { obdmid: 'A9', obdmidName: 'Misfire Cylinder 8 Data', testId: '0B', uasid: '24', description: 'EWMA misfire counts for the last 10 driving cycles', range: '0-65535 counts', resolution: '1 count/bit' },

  // O2 Sensor Heater Monitors
  { obdmid: '41', obdmidName: 'O2 Sensor Heater Monitor B1S1', testId: '81', uasid: '14', description: 'Sensor Element Impedance', range: '0-65535 Ohms', resolution: '1 Ohm/bit' },
  { obdmid: '41', obdmidName: 'O2 Sensor Heater Monitor B1S1', testId: 'D0', uasid: '11', description: 'Time to Activity Monitor', range: '0-6553.5 s', resolution: '100 ms/bit' },
  { obdmid: '41', obdmidName: 'O2 Sensor Heater Monitor B1S1', testId: 'D1', uasid: '0F', description: 'Current Feedback Amps Value Test', range: '0-655.35 A', resolution: '0.01 A/bit' },
  { obdmid: '41', obdmidName: 'O2 Sensor Heater Monitor B1S1', testId: 'D3', uasid: '84', description: 'Heater Resistance Error Test', range: '-32.768 to +32.767 Ohms', resolution: '0.001 Ohm/bit' },
];

// ─── UDS Service Mapping ────────────────────────────────────────────────────

export const UDS_SERVICE_MAPPING: UDSServiceMapping[] = [
  { classicMode: '$01', classicDesc: 'Show Current Data', udsService: '$22 ReadDataByIdentifier', udsDesc: 'Read real-time PIDs using Data Identifiers (DIDs)', notes: 'DIDs replace Mode 01 PIDs. DID F400-F4FF reserved for OBD.' },
  { classicMode: '$02', classicDesc: 'Freeze Frame Data', udsService: '$19/$22', udsDesc: 'Read freeze frame via ReadDTCInformation + ReadDataByIdentifier', notes: 'J1979-2 requires at least 5 DTCs with 2 frames each (1st occurrence + most recent).' },
  { classicMode: '$03', classicDesc: 'Read Stored DTCs', udsService: '$19 ReadDTCInformation', udsDesc: 'Read DTC information with sub-functions for different DTC types', notes: '3-byte DTCs in J1979-2 vs 2-byte in J1979. Significantly more fault codes available.' },
  { classicMode: '$04', classicDesc: 'Clear DTCs', udsService: '$14 ClearDTCInformation', udsDesc: 'Clear diagnostic information', notes: 'Same function, different service ID.' },
  { classicMode: '$06', classicDesc: 'Test Results / Monitoring', udsService: '$19 ReadDTCInformation', udsDesc: 'Monitor test results tied to specific DTCs', notes: 'Test results are now DTC-specific rather than just monitor-ID based.' },
  { classicMode: '$07', classicDesc: 'Pending DTCs', udsService: '$19 ReadDTCInformation', udsDesc: 'Read pending DTCs via sub-function', notes: 'Same concept, different protocol layer.' },
  { classicMode: '$09', classicDesc: 'Vehicle Information', udsService: '$22 ReadDataByIdentifier', udsDesc: 'VIN, calibration IDs via DIDs', notes: 'VIN = DID F190, Cal ID = DID F806.' },
  { classicMode: '$0A', classicDesc: 'Permanent DTCs', udsService: '$19 ReadDTCInformation', udsDesc: 'Read permanent DTCs via sub-function', notes: 'Cannot be cleared by scan tool. ECM must verify fault is gone.' },
];

// ─── Readiness Groups ───────────────────────────────────────────────────────

export const READINESS_GROUPS = {
  sparkIgnition: [
    { name: 'Misfire', description: 'Engine misfire detection monitoring' },
    { name: 'Fuel system', description: 'Fuel system monitoring including fuel trim and injector performance' },
    { name: 'Comprehensive component', description: 'Comprehensive component monitoring for input/output circuit checks' },
    { name: 'Catalyst', description: 'Catalytic converter efficiency monitoring' },
    { name: 'Heated catalyst', description: 'Heated catalytic converter monitoring' },
    { name: 'Evaporative system', description: 'EVAP system leak detection and purge flow monitoring' },
    { name: 'Secondary air system', description: 'Secondary air injection system monitoring' },
    { name: 'Oxygen sensor', description: 'O2 sensor response and performance monitoring' },
    { name: 'Oxygen sensor heater', description: 'O2 sensor heater circuit and performance monitoring' },
    { name: 'EGR and/or VVT system', description: 'Exhaust Gas Recirculation and Variable Valve Timing monitoring' },
  ],
  compressionIgnition: [
    { name: 'Misfire', description: 'Engine misfire detection monitoring' },
    { name: 'Fuel system', description: 'Fuel system monitoring including rail pressure and injector balance' },
    { name: 'Comprehensive component', description: 'Comprehensive component monitoring for input/output circuit checks' },
    { name: 'NMHC catalyst', description: 'Non-Methane Hydrocarbon catalyst monitoring (diesel oxidation catalyst)' },
    { name: 'NOx after treatment', description: 'NOx reduction system monitoring (SCR, DEF quality, dosing)' },
    { name: 'Boost pressure system', description: 'Turbocharger boost pressure control and VGT monitoring' },
    { name: 'Exhaust gas sensor', description: 'Exhaust gas temperature and NOx sensor monitoring' },
    { name: 'PM Filter', description: 'Diesel Particulate Filter (DPF) monitoring and regeneration' },
    { name: 'EGR and/or VVT system', description: 'Exhaust Gas Recirculation and Variable Valve Timing monitoring' },
  ],
  proposed: [
    'Catalyst', 'Heated Catalyst', 'Misfire', 'Evap System', 'Secondary Air System',
    'Fuel System', 'Exhaust Gas Sensor', 'EGR', 'PCV', 'Engine Cooling System',
    'Cold Start Emission Reduction Strategy', 'Variable Valve Timing',
    'Direct Ozone Reduction System', 'Other', 'Non-Methane Hydrocarbon Conv Catalyst',
    'Oxides of Nitrogen Converting Catalyst', 'Boost Pressure Control System',
    'NOx Absorber', 'Particulate Matter Filter',
  ],
};

// ─── Freeze Frame Required PIDs ─────────────────────────────────────────────

export const FREEZE_FRAME_REQUIRED_PIDS = [
  { pid: '$04', name: 'Calculated load value' },
  { pid: '$01', name: 'Number of stored confirmed fault codes / MIL status' },
  { pid: '$05', name: 'Engine coolant temperature' },
  { pid: '$0C', name: 'Engine speed (RPM)' },
  { pid: '$11', name: 'Absolute throttle position' },
  { pid: '$0D', name: 'Vehicle speed' },
  { pid: '$1C', name: 'OBD requirements vehicle certified to' },
  { pid: '$01', name: 'MIL status' },
];

// ─── Build full-text search documents ───────────────────────────────────────

export function buildSearchDocuments(): KBDocument[] {
  const docs: KBDocument[] = [];

  // PIDs
  for (const pid of OBD_PIDS) {
    docs.push({
      id: `pid-${pid.service}-${pid.pidHex}`,
      title: `PID $${pid.pidHex} (${pid.pidDec}): ${pid.description}`,
      source: 'SAE J1979 / Wikipedia OBD-II PIDs',
      category: 'pid',
      tags: ['pid', 'obd', 'service01', pid.units || '', pid.description.toLowerCase()],
      content: [
        `PID $${pid.pidHex} (decimal ${pid.pidDec}) - Service ${pid.service}`,
        `Description: ${pid.description}`,
        pid.formula ? `Formula: ${pid.formula}` : '',
        pid.units ? `Units: ${pid.units}` : '',
        pid.minValue ? `Range: ${pid.minValue} to ${pid.maxValue} ${pid.units || ''}` : '',
        pid.notes || '',
        `Data bytes returned: ${pid.bytes}`,
      ].filter(Boolean).join('\n'),
      metadata: {
        pidHex: pid.pidHex,
        service: pid.service,
        ...(pid.formula && { formula: pid.formula }),
        ...(pid.units && { units: pid.units }),
      },
    });
  }

  // OBD Services
  for (const svc of OBD_SERVICES) {
    docs.push({
      id: `service-${svc.mode}`,
      title: `Mode ${svc.hex}: ${svc.description}`,
      source: 'SAE J1979',
      category: 'standard',
      tags: ['mode', 'service', 'obd', svc.mode],
      content: `${svc.description}\n${svc.detail}`,
    });
  }

  // Mode 6 Monitors
  const monitorGroups = new Map<string, Mode6Monitor[]>();
  for (const m of GM_MODE6_MONITORS) {
    const key = m.obdmid;
    if (!monitorGroups.has(key)) monitorGroups.set(key, []);
    monitorGroups.get(key)!.push(m);
  }
  for (const [obdmid, monitors] of Array.from(monitorGroups.entries())) {
    const name = monitors[0].obdmidName;
    const testList = monitors.map((m: Mode6Monitor) =>
      `TID ${m.testId} (UASID ${m.uasid}): ${m.description} [${m.range}] @ ${m.resolution}`
    ).join('\n');
    docs.push({
      id: `mode6-${obdmid}`,
      title: `Mode 6 Monitor $${obdmid}: ${name}`,
      source: 'GM Mode $06 Data Definitions (GMLAN rev4)',
      category: 'mode6',
      tags: ['mode6', 'monitor', 'gm', obdmid, name.toLowerCase()],
      content: `OBD Monitor ID (OBDMID): $${obdmid}\nMonitor Name: ${name}\n\nTest IDs:\n${testList}`,
      metadata: { obdmid, monitorName: name, testCount: String(monitors.length) },
    });
  }

  // Individual Mode 6 tests (for granular search)
  for (const m of GM_MODE6_MONITORS) {
    docs.push({
      id: `mode6-${m.obdmid}-${m.testId}-${m.uasid}`,
      title: `${m.obdmidName} - TID $${m.testId}: ${m.description}`,
      source: 'GM Mode $06 Data Definitions',
      category: 'mode6',
      tags: ['mode6', 'test', 'tid', m.obdmid, m.testId, m.description.toLowerCase()],
      content: [
        `Monitor: ${m.obdmidName} (OBDMID $${m.obdmid})`,
        `Test ID: $${m.testId}`,
        `Units/Scaling ID: $${m.uasid}`,
        `Description: ${m.description}`,
        `Range: ${m.range}`,
        `Resolution: ${m.resolution}`,
        m.notes || '',
      ].filter(Boolean).join('\n'),
    });
  }

  // UDS Mapping
  for (const mapping of UDS_SERVICE_MAPPING) {
    docs.push({
      id: `uds-${mapping.classicMode}`,
      title: `UDS Mapping: ${mapping.classicMode} ${mapping.classicDesc} → ${mapping.udsService}`,
      source: 'SAE J1979-2 / OBD on UDS',
      category: 'uds',
      tags: ['uds', 'j1979-2', 'mapping', mapping.classicMode, mapping.udsService],
      content: [
        `Classic J1979 Mode: ${mapping.classicMode} - ${mapping.classicDesc}`,
        `UDS Service: ${mapping.udsService} - ${mapping.udsDesc}`,
        mapping.notes || '',
      ].filter(Boolean).join('\n'),
    });
  }

  // Readiness groups
  docs.push({
    id: 'readiness-spark',
    title: 'OBD Readiness Groups - Spark Ignition (Gasoline)',
    source: 'OBD on UDS / SAE J1979',
    category: 'readiness',
    tags: ['readiness', 'monitors', 'spark', 'gasoline', 'i/m'],
    content: READINESS_GROUPS.sparkIgnition.map(g => `${g.name}: ${g.description}`).join('\n'),
  });
  docs.push({
    id: 'readiness-compression',
    title: 'OBD Readiness Groups - Compression Ignition (Diesel)',
    source: 'OBD on UDS / SAE J1979',
    category: 'readiness',
    tags: ['readiness', 'monitors', 'compression', 'diesel', 'i/m'],
    content: READINESS_GROUPS.compressionIgnition.map(g => `${g.name}: ${g.description}`).join('\n'),
  });

  // Freeze frame
  docs.push({
    id: 'freeze-frame-required',
    title: 'Freeze Frame Required PIDs (CARB 1968.2(g)(4.2.1)(A))',
    source: 'OBD on UDS / CARB Title 13',
    category: 'freeze_frame',
    tags: ['freeze', 'frame', 'snapshot', 'dtc', 'required'],
    content: [
      'Required PIDs that must be stored in freeze frame when a DTC is set:',
      ...FREEZE_FRAME_REQUIRED_PIDS.map(p => `${p.pid}: ${p.name}`),
      '',
      'J1979-2 Enhancement: At least 5 DTCs, each with 2 frames (1st occurrence + most recent).',
      'Eliminates freeze frame priority requirements from classic J1979.',
    ].join('\n'),
  });

  // Protocol overview docs
  docs.push({
    id: 'protocol-j1979',
    title: 'SAE J1979 - OBD-II Diagnostic Standard',
    source: 'SAE J1979-2002',
    category: 'protocol',
    tags: ['j1979', 'sae', 'standard', 'obd', 'protocol'],
    content: [
      'SAE J1979 defines the standard OBD-II diagnostic services (modes) and parameter IDs (PIDs).',
      'All on-road vehicles sold in North America since 1996 must support a subset of these codes.',
      'Light duty vehicles (<8,500 lb) mandated since 1996.',
      'Medium duty vehicles (8,500-14,000 lb) mandated since 2005.',
      'Heavy duty vehicles (>14,000 lb) mandated since 2010.',
      'Communication via SAE J1962 standardized data link connector (DLC).',
      'Defines 10 diagnostic services ($01-$0A) for data access, DTC management, and testing.',
    ].join('\n'),
  });
  docs.push({
    id: 'protocol-j1979-2',
    title: 'SAE J1979-2 - OBD on UDS (2020+ Vehicles)',
    source: 'SAE J1979-2-2021 / OBD on UDS',
    category: 'protocol',
    tags: ['j1979-2', 'uds', 'iso14229', 'protocol', '2020'],
    content: [
      'SAE J1979-2 documents select ISO 14229-1 (UDS) services for OBD communication on CAN.',
      'Ports classic J1979 Modes $01-$0A to UDS services.',
      'Key improvements over J1979:',
      '- 3-byte DTCs (vs 2-byte), significantly more fault codes available',
      '- DTC-specific readiness information',
      '- Enhanced freeze frame: at least 5 DTCs, 2 frames each',
      '- IUMPR (In-Use Monitor Performance Ratio) accessible via generic scan tool',
      '- Test results tied to specific DTCs rather than just monitor IDs',
      '- Data Identifiers (DIDs) replace Mode 01 PIDs: DID F400-F4FF reserved for OBD',
      '',
      'Applies to 2020+ model year vehicles using UDS-based diagnostics.',
    ].join('\n'),
  });

  // ── Drag Racing Knowledge ──────────────────────────────────────────────────
  docs.push({
    id: 'drag-tcc-lockup',
    title: 'Drag Racing: Torque Converter Lockup Strategy',
    source: 'PPEI Performance Knowledge Base',
    category: 'formula',
    tags: ['drag', 'tcc', 'torque converter', 'lockup', 'slip', 'performance', 'racing'],
    content: [
      'TORQUE CONVERTER LOCKUP FOR DRAG RACING',
      '',
      'For maximum performance on the drag strip, the torque converter should be fully locked by 3rd gear.',
      'An unlocked converter wastes power as heat — that is torque NOT being transferred to the tires.',
      '3rd gear lock is better than stock, but there is still more left on the table.',
      '',
      'Converter slip is essentially drivetrain loss that is fixable in a calibration while racing.',
      'Accepting converter slip during a race is leaving time on the table.',
      '',
      'Key PIDs for TCC analysis:',
      '- TCC Commanded Pressure: Shows what the ECU is commanding',
      '- Converter Slip Speed: Difference between engine RPM and turbine RPM',
      '- TCC Duty Cycle: Percentage of TCC apply solenoid activation',
      '',
      'Per-gear analysis:',
      '- 1st gear: TCC typically unlocked (stall converter for launch)',
      '- 2nd gear: TCC should begin applying, some slip acceptable',
      '- 3rd gear: TCC MUST be fully locked (avg slip < 25 RPM, max < 50 RPM)',
      '- 4th+ gear: TCC must remain locked with zero slip',
      '',
      'Locked definition: Average slip < 25 RPM AND peak slip < 50 RPM (noise floor)',
      'Slip > 50 RPM = power lost as heat',
      'Slip > 150 RPM = significant power loss, tune review needed',
      'Slip > 200 RPM = severe, possible worn TCC clutch pack or low line pressure',
      '',
      'Torque loss estimation: slip_ratio = abs(slip_rpm) / engine_rpm',
      'At 100 RPM slip on 2000 RPM engine = 5% slip ratio = ~3-4% torque loss',
    ].join('\n'),
  });

  docs.push({
    id: 'drag-wheel-slip',
    title: 'Drag Racing: Wheel Slip Detection and Traction',
    source: 'PPEI Performance Knowledge Base',
    category: 'formula',
    tags: ['drag', 'wheel slip', 'traction', 'tire', 'launch', 'performance'],
    content: [
      'WHEEL SLIP DETECTION FOR DRAG RACING',
      '',
      'Detection Methods:',
      '1. GPS Speed vs ECU Vehicle Speed: If GPS PID is available and wheel speed PID is available,',
      '   compare them. GPS measures actual ground speed, wheel speed measures tire rotation.',
      '   Delta > 2 mph indicates rear wheel slip.',
      '',
      '2. Front vs Rear Wheel Speed: If front tire wheel speed is more than 2 mph lower than rear,',
      '   this indicates rear wheel slip (unless calibration mismatch between front and rear speed sensors).',
      '',
      '3. Output Shaft RPM vs Vehicle Speed Ratio: Calculate expected ratio from steady-state,',
      '   then detect anomalies during launch where output shaft spins faster than expected.',
      '',
      'Traction Tips:',
      '- Lower rear tire pressure to 18-22 psi for drag racing',
      '- Drag radials or slicks provide significantly better traction',
      '- 4WD: Ensure transfer case is locked',
      '- On prepped surface: traction compound on tires helps',
      '- Launch RPM: Target 1,400-1,800 RPM for 4WD launch',
      '- Too much wheel spin wastes energy as heat and tire wear',
      '',
      'Wheel slip threshold: > 2 mph delta = slip event',
      'Wheel slip > 5 mph = significant traction problem',
    ].join('\n'),
  });

  docs.push({
    id: 'drag-shift-optimization',
    title: 'Drag Racing: Shift Time Optimization',
    source: 'PPEI Performance Knowledge Base',
    category: 'formula',
    tags: ['drag', 'shift', 'transmission', 'gear', 'performance', 'racing'],
    content: [
      'SHIFT TIME OPTIMIZATION FOR DRAG RACING',
      '',
      'Shift detection: RPM drops > 300 RPM within 0.5 seconds while speed is increasing.',
      'Shift time = duration from RPM drop start to RPM recovery.',
      '',
      'Target shift times:',
      '- Stock Allison: 200-400ms per shift',
      '- Tuned Allison: 100-200ms per shift',
      '- Built Allison with shift kit: 50-100ms per shift',
      '',
      'Time lost per shift = shift_duration * (1 - 0.3) = ~70% of shift time is lost acceleration',
      'Total shift time lost = sum of all shift times * 0.7',
      '',
      'Optimization:',
      '- Aggressive shift firmness in tune reduces shift time',
      '- Reduced shift overlap time recovers ET',
      '- Shift pressure tuning via custom calibration',
      '- A PPEI custom drag tune optimizes shift points, TCC apply pressure, fuel rail targets, and boost curves',
      '- Street tunes are a compromise — a dedicated drag tune can recover 0.3-0.5 seconds',
    ].join('\n'),
  });

  docs.push({
    id: 'drag-60ft-analysis',
    title: 'Drag Racing: 60ft Time Analysis',
    source: 'PPEI Performance Knowledge Base',
    category: 'formula',
    tags: ['drag', '60ft', 'launch', 'traction', 'performance'],
    content: [
      '60FT TIME ANALYSIS',
      '',
      'The 60ft time is the single biggest factor in overall ET.',
      'A 0.1 second improvement in 60ft typically yields 0.22 second improvement in 1/4 mile ET.',
      '',
      'Target 60ft times for tuned Duramax:',
      '- Excellent: < 1.80s',
      '- Good: 1.80-2.00s',
      '- Average: 2.00-2.20s',
      '- Slow: > 2.20s',
      '',
      'Common causes of slow 60ft:',
      '- Wheel spin (reduce tire pressure, better tires)',
      '- Launch RPM too low or too high (target 1,400-1,800 RPM for 4WD)',
      '- TCC not applying quickly enough',
      '- Boost not building fast enough off the line',
      '',
      'Distance estimation from speed: d = 0.5 * a * t^2',
      'Using trapezoidal integration of speed over time for accuracy.',
    ].join('\n'),
  });

  docs.push({
    id: 'drag-dsp5-system',
    title: 'DSP5 Custom Operating System for EFILive',
    source: 'PPEI Performance Knowledge Base',
    category: 'standard',
    tags: ['dsp5', 'efilive', 'tune', 'selector', 'switch', 'operating system'],
    content: [
      'DSP5 CUSTOM OPERATING SYSTEM',
      '',
      'DSP5 is a custom operating system for EFILive tuned vehicles.',
      'It allows multiple tunes to be stored and selected via a tune selector switch.',
      '',
      'Tune Selector Mapping:',
      '- Non-DSP position = Tune Selection 1 (typically stock or economy)',
      '- DSP1 = Tune Selection 2',
      '- DSP2 = Tune Selection 3 (often tow tune)',
      '- DSP3 = Tune Selection 4',
      '- DSP4 = Tune Selection 5 (often max performance)',
      '- DSP5 = Tune Selection 6 (if available)',
      '',
      'Common tune configurations:',
      '- Tow tunes are generally in the lower tune levels (DSP1-DSP2)',
      '- Performance/drag tunes are in higher levels (DSP3-DSP5)',
      '- Tow tunes often include turbo braking feature',
      '',
      'DSP5 switch voltage PID can identify which tune is active.',
      'CSP tune number PID (ECM.CSP_TUNE) also identifies active tune.',
    ].join('\n'),
  });

  docs.push({
    id: 'drag-turbo-braking',
    title: 'Turbo Braking and Turbo Surge Diagnostics',
    source: 'PPEI Performance Knowledge Base',
    category: 'formula',
    tags: ['turbo', 'braking', 'surge', 'vgt', 'vane', 'decel', 'tow'],
    content: [
      'TURBO BRAKING AND TURBO SURGE',
      '',
      'Turbo braking is a feature in tow tunes that uses the VGT turbo to create engine braking.',
      'On deceleration, the ECU commands the VGT vanes to close (high % like 99%),',
      'creating exhaust restriction that slows the vehicle.',
      '',
      'Diagnostic Signature of Turbo Braking:',
      '1. Throttle at 0% (decel)',
      '2. Desired boost ELEVATED (well above atmospheric) — this is the command',
      '3. Vanes commanded to 99% — trying to achieve that desired boost',
      '4. Actual boost stays high — the result',
      '',
      'The desired boost being high on decel is the SMOKING GUN — it proves the ECU is',
      'intentionally commanding turbo braking, not a stuck vane or sensor issue.',
      '',
      'Turbo Surge Problem:',
      'When vanes go to 99% on decel, the turbo continues spooling from residual exhaust energy.',
      'Boost comes down initially, then when vanes hit 99%, boost comes BACK UP.',
      'This creates a surge feeling — the driver expects deceleration but gets a push.',
      '',
      'Differentiating Turbo Braking vs Stuck Vanes:',
      '- Turbo Braking: Desired boost is HIGH on decel (ECU wants it)',
      '- Stuck Vanes: Desired boost is LOW but actual vane position stays high (mechanical fault)',
      '',
      'Fix for turbo surge: Switch to a non-tow tune, or have the tow tune modified',
      'to reduce turbo braking aggressiveness or add a decel rate limiter.',
    ].join('\n'),
  });

  docs.push({
    id: 'drag-backpressure-analysis',
    title: 'Exhaust Backpressure vs Intake Boost Analysis',
    source: 'PPEI Performance Knowledge Base',
    category: 'formula',
    tags: ['backpressure', 'exhaust', 'boost', 'intake', 'restriction', 'dpf', 'filter'],
    content: [
      'EXHAUST BACKPRESSURE VS INTAKE BOOST ANALYSIS',
      '',
      'Exhaust backpressure and intake boost are two DIFFERENT measurements:',
      '- Boost (Manifold Absolute Pressure): Intake side pressure from turbo compressor',
      '- Exhaust Backpressure: Exhaust side pressure before turbine',
      '',
      'These must NEVER be confused or displayed as the same PID.',
      '',
      'Healthy Ratios (under load):',
      '- Backpressure:Boost ratio < 1.5:1 = Normal',
      '- Backpressure:Boost ratio 1.5-2.0:1 = Elevated, monitor',
      '- Backpressure:Boost ratio > 2.0:1 = Excessive restriction',
      '- Backpressure:Boost ratio > 3.0:1 = Critical, immediate attention needed',
      '',
      'Common causes of high backpressure:',
      '- Clogged DPF (soot loading)',
      '- Plugged catalytic converter',
      '- Restrictive exhaust system',
      '- Crushed or kinked exhaust pipe',
      '- Restrictive air filter (can affect turbo efficiency, increasing backpressure)',
      '',
      'Impact on performance:',
      '- High backpressure reduces turbo efficiency',
      '- Increases EGTs',
      '- Reduces power output',
      '- Can cause turbo surge on decel',
      '',
      'S&B Filter Analysis:',
      '- Removing the baffle from an S&B intake can change airflow dynamics',
      '- If removing baffle causes sluggish response, the ECU may be compensating',
      '  for the changed airflow characteristics (MAF recalibration may be needed)',
      '- Compare backpressure:boost ratio between baffle-in and baffle-out runs',
    ].join('\n'),
  });

  docs.push({
    id: 'p0089-idle-rail-pressure',
    title: 'P0089 Idle Rail Pressure Diagnostics — FCA Threshold Analysis',
    source: 'PPEI Diagnostic Knowledge Base',
    category: 'formula',
    tags: ['P0089', 'rail pressure', 'idle', 'FCA', 'PCV', 'regulator', 'lift pump', 'FASS', 'AirDog', 'LB7', 'LLY', 'LBZ', 'LMM'],
    content: [
      'P0089 IDLE RAIL PRESSURE DIAGNOSTICS',
      '',
      'When P0089 occurs at IDLE, the diagnostic approach is different from under-load conditions.',
      '',
      'Key Diagnostic Logic:',
      '- At idle, if actual rail pressure rises significantly above desired while FCA amperage is near its maximum,',
      '  the regulator is trying to bleed off excess pressure but cannot keep up.',
      '- This most commonly indicates a lift pump (FASS, AirDog, etc.) with supply pressure set too high.',
      '',
      'FCA Amperage Thresholds by Platform:',
      '- LB7 and LLY: Max FCA ~1500mA at idle. Near-max = regulator fully open.',
      '- LBZ and LMM: Max FCA ~1900mA at idle.',
      '',
      'Cross-Platform Regulator Swap Rules:',
      '- LBZ/LMM regulator installed on LB7/LLY needs roughly 16% more FCA amperage to stabilize.',
      '- If tuned for the swap: FCA will run higher than stock but pressure will stabilize.',
      '- If NOT tuned for the swap: rail pressure can shoot to 12,000-14,000 PSI very quickly at idle.',
      '  This rapid pressure rise at idle is the telltale indicator of a mismatched regulator without calibration.',
      '',
      'Diagnostic Decision Tree at Idle:',
      '1. FCA near max + pressure rising above desired = lift pump pressure too high (most common)',
      '2. FCA near max + pressure shoots to 12-14k PSI rapidly = regulator swap without tune adjustment',
      '3. FCA NOT near max + pressure rising = possible stuck/failed regulator or internal pump issue',
      '4. FCA fluctuating wildly + pressure unstable = air entrainment, clogged filter, or marginal pump',
      '',
      'Important: The PCV fluctuation analysis under load is a separate issue from idle pressure rise.',
      'At idle, focus on the absolute FCA amperage vs the platform max, and the rate of pressure rise.',
    ].join("\n"),
  });

  return docs;
}
