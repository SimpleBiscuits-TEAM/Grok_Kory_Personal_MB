/**
 * Universal DTC (Diagnostic Trouble Code) Reader
 * 
 * Supports:
 * - Mode 03: Read stored (confirmed) DTCs
 * - Mode 07: Read pending DTCs
 * - Mode 0A: Read permanent DTCs
 * - Mode 04: Clear DTCs (stored + pending, NOT permanent)
 * 
 * DTC format: XNNNN where X = P/C/B/U, NNNN = 4-digit hex
 * OBD-II encodes DTCs as 2 bytes per code.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type DTCType = 'stored' | 'pending' | 'permanent';
export type DTCSeverity = 'critical' | 'warning' | 'info';
export type DTCSystem = 
  | 'fuel_air' | 'fuel_air_aux' | 'ignition' | 'emissions_aux'
  | 'speed_idle' | 'computer' | 'transmission' | 'chassis'
  | 'body' | 'network' | 'hybrid' | 'unknown';

export interface DTCCode {
  code: string;           // e.g., "P0300"
  type: DTCType;          // stored, pending, permanent
  description: string;    // Human-readable description
  severity: DTCSeverity;  // critical, warning, info
  system: DTCSystem;      // Which system is affected
  possibleCauses: string[];
  rawBytes: [number, number]; // Original 2-byte encoding
}

export interface DTCReadResult {
  stored: DTCCode[];
  pending: DTCCode[];
  permanent: DTCCode[];
  totalCount: number;
  milStatus: boolean;     // Malfunction Indicator Lamp (Check Engine Light)
  readTimestamp: number;
}

// ─── DTC Byte Parsing ────────────────────────────────────────────────────────

/**
 * Parse 2 raw bytes into a DTC string.
 * Byte 1 bits 7-6: category (P/C/B/U)
 * Byte 1 bits 5-4: second digit
 * Byte 1 bits 3-0: third digit
 * Byte 2 bits 7-4: fourth digit
 * Byte 2 bits 3-0: fifth digit
 */
export function parseDTCBytes(byte1: number, byte2: number): string {
  const categoryBits = (byte1 >> 6) & 0x03;
  const categories = ['P', 'C', 'B', 'U'];
  const category = categories[categoryBits];

  const digit2 = (byte1 >> 4) & 0x03;
  const digit3 = byte1 & 0x0F;
  const digit4 = (byte2 >> 4) & 0x0F;
  const digit5 = byte2 & 0x0F;

  return `${category}${digit2}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}${digit5.toString(16).toUpperCase()}`;
}

/**
 * Parse a Mode 03/07/0A response string into DTC codes.
 * Response format: "43 XX YY XX YY ..." (Mode 03)
 *                  "47 XX YY XX YY ..." (Mode 07)
 *                  "4A XX YY XX YY ..." (Mode 0A)
 * 
 * The first byte is the response service ID (request + 0x40).
 * Second byte is the DTC count.
 * Then pairs of bytes for each DTC.
 */
export function parseModeDTCResponse(response: string, type: DTCType): DTCCode[] {
  const cleaned = response.replace(/[\r\n\s]/g, '');
  if (!cleaned || cleaned.includes('NODATA') || cleaned.includes('ERROR')) return [];

  // Handle multi-line responses (multiple ECU responses)
  const lines = response.split(/[\r\n]+/).filter(l => l.trim().length > 0);
  const allCodes: DTCCode[] = [];
  const seenCodes = new Set<string>();

  for (const line of lines) {
    const hex = line.replace(/[\s]/g, '');
    if (hex.length < 4) continue;

    // Response header: 43 for Mode 03, 47 for Mode 07, 4A for Mode 0A
    const header = hex.substring(0, 2).toUpperCase();
    if (!['43', '47', '4A'].includes(header)) continue;

    // Skip the header byte and count byte, parse DTC pairs
    let offset = 2;
    // Some ECUs include a count byte, some don't. Check if first pair makes sense.
    const remaining = hex.substring(offset);
    
    // Parse pairs of bytes (2 hex chars = 1 byte, so 4 hex chars = 2 bytes = 1 DTC)
    for (let i = 0; i < remaining.length - 3; i += 4) {
      const b1 = parseInt(remaining.substring(i, i + 2), 16);
      const b2 = parseInt(remaining.substring(i + 2, i + 4), 16);

      if (isNaN(b1) || isNaN(b2)) continue;
      if (b1 === 0 && b2 === 0) continue; // Skip padding

      const code = parseDTCBytes(b1, b2);
      if (seenCodes.has(code)) continue; // Prevent duplicates
      seenCodes.add(code);

      const info = lookupDTC(code);
      allCodes.push({
        code,
        type,
        description: info.description,
        severity: info.severity,
        system: info.system,
        possibleCauses: info.possibleCauses,
        rawBytes: [b1, b2],
      });
    }
  }

  return allCodes;
}

/**
 * Parse Mode 01 PID 01 response to get MIL status.
 * Response: "4101 XX YY ZZ WW"
 * Bit A7 of byte A = MIL status (1 = on, 0 = off)
 */
export function parseMILStatus(response: string): { milOn: boolean; dtcCount: number } {
  const cleaned = response.replace(/[\r\n\s]/g, '');
  if (cleaned.length < 8) return { milOn: false, dtcCount: 0 };

  const header = cleaned.substring(0, 4).toUpperCase();
  if (header !== '4101') return { milOn: false, dtcCount: 0 };

  const byteA = parseInt(cleaned.substring(4, 6), 16);
  if (isNaN(byteA)) return { milOn: false, dtcCount: 0 };

  const milOn = (byteA & 0x80) !== 0;
  const dtcCount = byteA & 0x7F;

  return { milOn, dtcCount };
}

// ─── DTC Database ────────────────────────────────────────────────────────────
// Comprehensive database of common OBD-II DTCs with descriptions and severity

interface DTCInfo {
  description: string;
  severity: DTCSeverity;
  system: DTCSystem;
  possibleCauses: string[];
}

const DTC_DATABASE: Record<string, DTCInfo> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // P0xxx — Generic Powertrain
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Fuel & Air Metering (P00xx) ──
  'P0001': { description: 'Fuel Volume Regulator Control Circuit/Open', severity: 'warning', system: 'fuel_air', possibleCauses: ['Faulty fuel volume regulator', 'Wiring issue', 'ECM failure'] },
  'P0002': { description: 'Fuel Volume Regulator Control Circuit Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['Fuel volume regulator malfunction', 'Fuel pressure sensor', 'Wiring'] },
  'P0003': { description: 'Fuel Volume Regulator Control Circuit Low', severity: 'warning', system: 'fuel_air', possibleCauses: ['Short circuit', 'Faulty regulator', 'ECM'] },
  'P0004': { description: 'Fuel Volume Regulator Control Circuit High', severity: 'warning', system: 'fuel_air', possibleCauses: ['Open circuit', 'Faulty regulator', 'ECM'] },
  'P0010': { description: 'Intake Camshaft Position Actuator Circuit (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid failure', 'Wiring/connector', 'Low oil pressure', 'ECM'] },
  'P0011': { description: 'Intake Camshaft Position Timing Over-Advanced (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid stuck', 'Oil viscosity', 'Timing chain stretch', 'Oil control valve'] },
  'P0012': { description: 'Intake Camshaft Position Timing Over-Retarded (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid stuck', 'Oil viscosity', 'Timing chain stretch', 'Oil control valve'] },
  'P0013': { description: 'Exhaust Camshaft Position Actuator Circuit (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid failure', 'Wiring/connector', 'Low oil pressure'] },
  'P0014': { description: 'Exhaust Camshaft Position Timing Over-Advanced (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid stuck', 'Oil viscosity', 'Timing chain'] },
  'P0016': { description: 'Crankshaft/Camshaft Position Correlation (Bank 1 Sensor A)', severity: 'critical', system: 'fuel_air', possibleCauses: ['Timing chain stretched/jumped', 'CKP/CMP sensor', 'VVT actuator', 'Tone ring damage'] },
  'P0017': { description: 'Crankshaft/Camshaft Position Correlation (Bank 1 Sensor B)', severity: 'critical', system: 'fuel_air', possibleCauses: ['Timing chain stretched/jumped', 'CKP/CMP sensor', 'VVT actuator'] },
  'P0020': { description: 'Intake Camshaft Position Actuator Circuit (Bank 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid failure', 'Wiring/connector', 'Low oil pressure'] },
  'P0021': { description: 'Intake Camshaft Position Timing Over-Advanced (Bank 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid stuck', 'Oil viscosity', 'Timing chain stretch'] },
  'P0022': { description: 'Intake Camshaft Position Timing Over-Retarded (Bank 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['VVT solenoid stuck', 'Oil viscosity', 'Timing chain stretch'] },

  // ── Fuel & Air Metering (P01xx) ──
  'P0100': { description: 'Mass Air Flow (MAF) Circuit Malfunction', severity: 'warning', system: 'fuel_air', possibleCauses: ['Dirty/failed MAF sensor', 'Air leak', 'Wiring', 'ECM'] },
  'P0101': { description: 'Mass Air Flow (MAF) Circuit Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['Dirty MAF sensor', 'Vacuum leak', 'Air filter restriction', 'Exhaust leak'] },
  'P0102': { description: 'Mass Air Flow (MAF) Circuit Low Input', severity: 'warning', system: 'fuel_air', possibleCauses: ['MAF sensor failure', 'Wiring short to ground', 'Air leak before MAF'] },
  'P0103': { description: 'Mass Air Flow (MAF) Circuit High Input', severity: 'warning', system: 'fuel_air', possibleCauses: ['MAF sensor failure', 'Wiring short to power', 'Contaminated sensor'] },
  'P0106': { description: 'Manifold Absolute Pressure (MAP) Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['MAP sensor failure', 'Vacuum leak', 'Hose disconnected'] },
  'P0107': { description: 'Manifold Absolute Pressure (MAP) Circuit Low', severity: 'warning', system: 'fuel_air', possibleCauses: ['MAP sensor failure', 'Wiring short to ground', 'Vacuum hose'] },
  'P0108': { description: 'Manifold Absolute Pressure (MAP) Circuit High', severity: 'warning', system: 'fuel_air', possibleCauses: ['MAP sensor failure', 'Wiring short to power', 'Vacuum leak'] },
  'P0110': { description: 'Intake Air Temperature (IAT) Circuit Malfunction', severity: 'info', system: 'fuel_air', possibleCauses: ['IAT sensor failure', 'Wiring', 'Connector corrosion'] },
  'P0111': { description: 'Intake Air Temperature (IAT) Range/Performance', severity: 'info', system: 'fuel_air', possibleCauses: ['IAT sensor failure', 'Sensor location', 'Heat soak'] },
  'P0112': { description: 'Intake Air Temperature (IAT) Circuit Low', severity: 'info', system: 'fuel_air', possibleCauses: ['IAT sensor short', 'Wiring short to ground'] },
  'P0113': { description: 'Intake Air Temperature (IAT) Circuit High', severity: 'info', system: 'fuel_air', possibleCauses: ['IAT sensor open', 'Wiring open', 'Connector'] },
  'P0115': { description: 'Engine Coolant Temperature (ECT) Circuit Malfunction', severity: 'warning', system: 'fuel_air', possibleCauses: ['ECT sensor failure', 'Wiring', 'Thermostat'] },
  'P0116': { description: 'Engine Coolant Temperature (ECT) Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['Thermostat stuck', 'ECT sensor', 'Cooling system issue'] },
  'P0117': { description: 'Engine Coolant Temperature (ECT) Circuit Low', severity: 'warning', system: 'fuel_air', possibleCauses: ['ECT sensor short', 'Wiring short to ground'] },
  'P0118': { description: 'Engine Coolant Temperature (ECT) Circuit High', severity: 'warning', system: 'fuel_air', possibleCauses: ['ECT sensor open', 'Wiring open', 'Connector'] },
  'P0120': { description: 'Throttle Position Sensor (TPS) Circuit Malfunction', severity: 'critical', system: 'fuel_air', possibleCauses: ['TPS failure', 'Wiring', 'Throttle body', 'ECM'] },
  'P0121': { description: 'Throttle Position Sensor (TPS) Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['TPS failure', 'Throttle body carbon buildup', 'Wiring'] },
  'P0122': { description: 'Throttle Position Sensor (TPS) Circuit Low', severity: 'critical', system: 'fuel_air', possibleCauses: ['TPS short to ground', 'Wiring', 'Connector'] },
  'P0123': { description: 'Throttle Position Sensor (TPS) Circuit High', severity: 'critical', system: 'fuel_air', possibleCauses: ['TPS short to power', 'Wiring', 'Connector'] },
  'P0125': { description: 'Insufficient Coolant Temperature for Closed Loop', severity: 'info', system: 'fuel_air', possibleCauses: ['Thermostat stuck open', 'ECT sensor', 'Low coolant'] },
  'P0128': { description: 'Coolant Thermostat Below Regulating Temperature', severity: 'info', system: 'fuel_air', possibleCauses: ['Thermostat stuck open', 'ECT sensor', 'Cooling fan always on'] },
  'P0130': { description: 'O2 Sensor Circuit Malfunction (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Wiring', 'Exhaust leak', 'ECM'] },
  'P0131': { description: 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Vacuum leak', 'Fuel pressure low'] },
  'P0132': { description: 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Short to power', 'Rich condition'] },
  'P0133': { description: 'O2 Sensor Slow Response (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor aging', 'Exhaust leak', 'Fuel contamination'] },
  'P0134': { description: 'O2 Sensor No Activity Detected (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Heater circuit', 'Wiring open'] },
  'P0135': { description: 'O2 Sensor Heater Circuit Malfunction (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 heater failure', 'Fuse', 'Wiring', 'Relay'] },
  'P0136': { description: 'O2 Sensor Circuit Malfunction (Bank 1 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Wiring', 'Catalytic converter'] },
  'P0137': { description: 'O2 Sensor Circuit Low Voltage (Bank 1 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Exhaust leak', 'Catalyst issue'] },
  'P0138': { description: 'O2 Sensor Circuit High Voltage (Bank 1 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Short to power', 'Catalyst issue'] },
  'P0140': { description: 'O2 Sensor No Activity Detected (Bank 1 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Heater circuit', 'Catalyst'] },
  'P0141': { description: 'O2 Sensor Heater Circuit Malfunction (Bank 1 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 heater failure', 'Fuse', 'Wiring'] },
  'P0150': { description: 'O2 Sensor Circuit Malfunction (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Wiring', 'Exhaust leak'] },
  'P0151': { description: 'O2 Sensor Circuit Low Voltage (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Vacuum leak', 'Fuel pressure'] },
  'P0152': { description: 'O2 Sensor Circuit High Voltage (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Short to power', 'Rich condition'] },
  'P0153': { description: 'O2 Sensor Slow Response (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor aging', 'Exhaust leak'] },
  'P0154': { description: 'O2 Sensor No Activity Detected (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Heater circuit'] },
  'P0155': { description: 'O2 Sensor Heater Circuit Malfunction (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 heater failure', 'Fuse', 'Wiring'] },
  'P0156': { description: 'O2 Sensor Circuit Malfunction (Bank 2 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Wiring', 'Catalyst'] },
  'P0157': { description: 'O2 Sensor Circuit Low Voltage (Bank 2 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Exhaust leak'] },
  'P0158': { description: 'O2 Sensor Circuit High Voltage (Bank 2 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Short to power'] },
  'P0160': { description: 'O2 Sensor No Activity Detected (Bank 2 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Heater circuit'] },
  'P0161': { description: 'O2 Sensor Heater Circuit Malfunction (Bank 2 Sensor 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 heater failure', 'Fuse', 'Wiring'] },
  'P0170': { description: 'Fuel Trim Malfunction (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['Vacuum leak', 'Fuel pressure', 'MAF sensor', 'Injector issue'] },
  'P0171': { description: 'System Too Lean (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['Vacuum leak', 'Low fuel pressure', 'Dirty MAF', 'Exhaust leak', 'Injector clogged'] },
  'P0172': { description: 'System Too Rich (Bank 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['Leaking injector', 'High fuel pressure', 'Faulty O2 sensor', 'EVAP purge stuck open'] },
  'P0173': { description: 'Fuel Trim Malfunction (Bank 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['Vacuum leak', 'Fuel pressure', 'MAF sensor'] },
  'P0174': { description: 'System Too Lean (Bank 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['Vacuum leak', 'Low fuel pressure', 'Dirty MAF', 'Intake manifold gasket'] },
  'P0175': { description: 'System Too Rich (Bank 2)', severity: 'warning', system: 'fuel_air', possibleCauses: ['Leaking injector', 'High fuel pressure', 'Faulty O2 sensor'] },

  // ── Fuel & Air Metering Injector Circuit (P02xx) ──
  'P0200': { description: 'Injector Circuit Malfunction', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector failure', 'Wiring', 'ECM driver'] },
  'P0201': { description: 'Injector Circuit Malfunction - Cylinder 1', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 1 failure', 'Wiring', 'ECM'] },
  'P0202': { description: 'Injector Circuit Malfunction - Cylinder 2', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 2 failure', 'Wiring', 'ECM'] },
  'P0203': { description: 'Injector Circuit Malfunction - Cylinder 3', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 3 failure', 'Wiring', 'ECM'] },
  'P0204': { description: 'Injector Circuit Malfunction - Cylinder 4', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 4 failure', 'Wiring', 'ECM'] },
  'P0205': { description: 'Injector Circuit Malfunction - Cylinder 5', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 5 failure', 'Wiring', 'ECM'] },
  'P0206': { description: 'Injector Circuit Malfunction - Cylinder 6', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 6 failure', 'Wiring', 'ECM'] },
  'P0207': { description: 'Injector Circuit Malfunction - Cylinder 7', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 7 failure', 'Wiring', 'ECM'] },
  'P0208': { description: 'Injector Circuit Malfunction - Cylinder 8', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 8 failure', 'Wiring', 'ECM'] },
  'P0217': { description: 'Engine Overtemperature Condition', severity: 'critical', system: 'fuel_air', possibleCauses: ['Cooling system failure', 'Thermostat', 'Water pump', 'Head gasket'] },
  'P0219': { description: 'Engine Overspeed Condition', severity: 'critical', system: 'fuel_air', possibleCauses: ['Transmission slip', 'Downshift error', 'Speed sensor'] },
  'P0220': { description: 'Throttle/Pedal Position Sensor B Circuit Malfunction', severity: 'critical', system: 'fuel_air', possibleCauses: ['TPS B failure', 'APP sensor', 'Wiring'] },
  'P0221': { description: 'Throttle/Pedal Position Sensor B Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['TPS B failure', 'Throttle body', 'Wiring'] },
  'P0222': { description: 'Throttle/Pedal Position Sensor B Circuit Low', severity: 'critical', system: 'fuel_air', possibleCauses: ['TPS B short to ground', 'Wiring'] },
  'P0223': { description: 'Throttle/Pedal Position Sensor B Circuit High', severity: 'critical', system: 'fuel_air', possibleCauses: ['TPS B short to power', 'Wiring'] },
  'P0230': { description: 'Fuel Pump Primary Circuit Malfunction', severity: 'critical', system: 'fuel_air', possibleCauses: ['Fuel pump relay', 'Fuel pump failure', 'Wiring', 'Fuse'] },
  'P0234': { description: 'Turbocharger/Supercharger Overboost Condition', severity: 'critical', system: 'fuel_air', possibleCauses: ['Wastegate stuck', 'Boost control solenoid', 'Boost leak'] },
  'P0235': { description: 'Turbocharger Boost Sensor A Circuit Malfunction', severity: 'warning', system: 'fuel_air', possibleCauses: ['Boost pressure sensor', 'Wiring', 'Vacuum hose'] },
  'P0236': { description: 'Turbocharger Boost Sensor A Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['Boost pressure sensor', 'Boost leak', 'Wastegate'] },
  'P0237': { description: 'Turbocharger Boost Sensor A Circuit Low', severity: 'warning', system: 'fuel_air', possibleCauses: ['Sensor short to ground', 'Wiring'] },
  'P0238': { description: 'Turbocharger Boost Sensor A Circuit High', severity: 'warning', system: 'fuel_air', possibleCauses: ['Sensor short to power', 'Wiring'] },
  'P0243': { description: 'Turbocharger Wastegate Solenoid A Malfunction', severity: 'warning', system: 'fuel_air', possibleCauses: ['Wastegate solenoid', 'Wiring', 'ECM'] },
  'P0244': { description: 'Turbocharger Wastegate Solenoid A Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['Wastegate solenoid', 'Mechanical binding'] },
  'P0251': { description: 'Injection Pump Fuel Metering Control A (Diesel)', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injection pump', 'Fuel metering valve', 'Wiring'] },
  'P0252': { description: 'Injection Pump Fuel Metering Control A Range/Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['Injection pump wear', 'Fuel quality', 'Metering valve'] },
  'P0261': { description: 'Cylinder 1 Injector Circuit Low', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 1 short', 'Wiring', 'ECM driver'] },
  'P0262': { description: 'Cylinder 1 Injector Circuit High', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector 1 open', 'Wiring', 'ECM driver'] },

  // ── Ignition System (P03xx) ──
  'P0300': { description: 'Random/Multiple Cylinder Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plugs', 'Ignition coils', 'Fuel injectors', 'Vacuum leak', 'Low compression', 'Fuel pressure'] },
  'P0301': { description: 'Cylinder 1 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 1', 'Ignition coil 1', 'Injector 1', 'Compression', 'Valve'] },
  'P0302': { description: 'Cylinder 2 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 2', 'Ignition coil 2', 'Injector 2', 'Compression'] },
  'P0303': { description: 'Cylinder 3 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 3', 'Ignition coil 3', 'Injector 3', 'Compression'] },
  'P0304': { description: 'Cylinder 4 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 4', 'Ignition coil 4', 'Injector 4', 'Compression'] },
  'P0305': { description: 'Cylinder 5 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 5', 'Ignition coil 5', 'Injector 5', 'Compression'] },
  'P0306': { description: 'Cylinder 6 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 6', 'Ignition coil 6', 'Injector 6', 'Compression'] },
  'P0307': { description: 'Cylinder 7 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 7', 'Ignition coil 7', 'Injector 7', 'Compression'] },
  'P0308': { description: 'Cylinder 8 Misfire Detected', severity: 'critical', system: 'ignition', possibleCauses: ['Spark plug 8', 'Ignition coil 8', 'Injector 8', 'Compression'] },
  'P0315': { description: 'Crankshaft Position System Variation Not Learned', severity: 'info', system: 'ignition', possibleCauses: ['CKP variation relearn needed', 'CKP sensor', 'Tone ring'] },
  'P0316': { description: 'Misfire Detected on Startup (First 1000 Revolutions)', severity: 'warning', system: 'ignition', possibleCauses: ['Spark plugs', 'Fuel pressure', 'Injector', 'Compression'] },
  'P0325': { description: 'Knock Sensor 1 Circuit Malfunction (Bank 1)', severity: 'warning', system: 'ignition', possibleCauses: ['Knock sensor failure', 'Wiring', 'Connector corrosion', 'ECM'] },
  'P0326': { description: 'Knock Sensor 1 Circuit Range/Performance (Bank 1)', severity: 'warning', system: 'ignition', possibleCauses: ['Knock sensor', 'Engine mechanical noise', 'Wiring'] },
  'P0327': { description: 'Knock Sensor 1 Circuit Low (Bank 1)', severity: 'warning', system: 'ignition', possibleCauses: ['Knock sensor short', 'Wiring', 'Torque'] },
  'P0328': { description: 'Knock Sensor 1 Circuit High (Bank 1)', severity: 'warning', system: 'ignition', possibleCauses: ['Knock sensor open', 'Wiring', 'Engine noise'] },
  'P0330': { description: 'Knock Sensor 2 Circuit Malfunction (Bank 2)', severity: 'warning', system: 'ignition', possibleCauses: ['Knock sensor 2 failure', 'Wiring'] },
  'P0332': { description: 'Knock Sensor 2 Circuit Low (Bank 2)', severity: 'warning', system: 'ignition', possibleCauses: ['Knock sensor 2 short', 'Wiring'] },
  'P0335': { description: 'Crankshaft Position Sensor A Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['CKP sensor failure', 'Wiring', 'Tone ring damage', 'ECM'] },
  'P0336': { description: 'Crankshaft Position Sensor A Range/Performance', severity: 'critical', system: 'ignition', possibleCauses: ['CKP sensor', 'Tone ring', 'Air gap', 'Wiring'] },
  'P0340': { description: 'Camshaft Position Sensor A Circuit Malfunction (Bank 1)', severity: 'critical', system: 'ignition', possibleCauses: ['CMP sensor failure', 'Wiring', 'Timing chain', 'ECM'] },
  'P0341': { description: 'Camshaft Position Sensor A Range/Performance (Bank 1)', severity: 'warning', system: 'ignition', possibleCauses: ['CMP sensor', 'Timing chain stretch', 'Tone ring'] },
  'P0345': { description: 'Camshaft Position Sensor A Circuit Malfunction (Bank 2)', severity: 'critical', system: 'ignition', possibleCauses: ['CMP sensor failure', 'Wiring', 'Timing chain'] },
  'P0351': { description: 'Ignition Coil A Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 1', 'Spark plug 1', 'Wiring', 'ECM driver'] },
  'P0352': { description: 'Ignition Coil B Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 2', 'Spark plug 2', 'Wiring'] },
  'P0353': { description: 'Ignition Coil C Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 3', 'Spark plug 3', 'Wiring'] },
  'P0354': { description: 'Ignition Coil D Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 4', 'Spark plug 4', 'Wiring'] },
  'P0355': { description: 'Ignition Coil E Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 5', 'Spark plug 5', 'Wiring'] },
  'P0356': { description: 'Ignition Coil F Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 6', 'Spark plug 6', 'Wiring'] },
  'P0357': { description: 'Ignition Coil G Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 7', 'Spark plug 7', 'Wiring'] },
  'P0358': { description: 'Ignition Coil H Primary/Secondary Circuit Malfunction', severity: 'critical', system: 'ignition', possibleCauses: ['Ignition coil 8', 'Spark plug 8', 'Wiring'] },

  // ── Emissions Auxiliary (P04xx) ──
  'P0400': { description: 'Exhaust Gas Recirculation (EGR) Flow Malfunction', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGR valve stuck', 'Carbon buildup', 'EGR passages clogged', 'Vacuum supply'] },
  'P0401': { description: 'Exhaust Gas Recirculation (EGR) Insufficient Flow', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGR passages clogged', 'EGR valve stuck closed', 'DPFE sensor'] },
  'P0402': { description: 'Exhaust Gas Recirculation (EGR) Excessive Flow', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGR valve stuck open', 'DPFE sensor', 'Vacuum leak'] },
  'P0403': { description: 'Exhaust Gas Recirculation (EGR) Circuit Malfunction', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGR solenoid', 'Wiring', 'ECM'] },
  'P0404': { description: 'Exhaust Gas Recirculation (EGR) Range/Performance', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGR valve', 'Carbon buildup', 'Position sensor'] },
  'P0405': { description: 'Exhaust Gas Recirculation (EGR) Sensor A Circuit Low', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGR position sensor', 'Wiring short'] },
  'P0406': { description: 'Exhaust Gas Recirculation (EGR) Sensor A Circuit High', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGR position sensor', 'Wiring open'] },
  'P0410': { description: 'Secondary Air Injection System Malfunction', severity: 'info', system: 'emissions_aux', possibleCauses: ['AIR pump failure', 'Check valve', 'Relay', 'Wiring'] },
  'P0411': { description: 'Secondary Air Injection System Incorrect Flow', severity: 'info', system: 'emissions_aux', possibleCauses: ['AIR pump weak', 'Hose leak', 'Check valve'] },
  'P0420': { description: 'Catalyst System Efficiency Below Threshold (Bank 1)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['Catalytic converter degraded', 'O2 sensor', 'Exhaust leak', 'Engine misfire', 'Oil consumption'] },
  'P0421': { description: 'Warm Up Catalyst Efficiency Below Threshold (Bank 1)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['Catalytic converter', 'O2 sensor', 'Exhaust leak'] },
  'P0430': { description: 'Catalyst System Efficiency Below Threshold (Bank 2)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['Catalytic converter degraded', 'O2 sensor', 'Exhaust leak', 'Engine misfire'] },
  'P0440': { description: 'Evaporative Emission Control System Malfunction', severity: 'info', system: 'emissions_aux', possibleCauses: ['Gas cap loose/missing', 'EVAP canister', 'Purge valve', 'Vent valve', 'Hose leak'] },
  'P0441': { description: 'Evaporative Emission Control System Incorrect Purge Flow', severity: 'info', system: 'emissions_aux', possibleCauses: ['Purge valve stuck', 'Vacuum hose', 'EVAP canister'] },
  'P0442': { description: 'Evaporative Emission Control System Small Leak Detected', severity: 'info', system: 'emissions_aux', possibleCauses: ['Gas cap seal', 'EVAP hose crack', 'Canister', 'Filler neck'] },
  'P0443': { description: 'Evaporative Emission Control System Purge Control Valve Circuit', severity: 'info', system: 'emissions_aux', possibleCauses: ['Purge solenoid', 'Wiring', 'ECM'] },
  'P0446': { description: 'Evaporative Emission Control System Vent Control Circuit', severity: 'info', system: 'emissions_aux', possibleCauses: ['Vent solenoid', 'Wiring', 'Canister'] },
  'P0449': { description: 'Evaporative Emission Control System Vent Valve/Solenoid Circuit', severity: 'info', system: 'emissions_aux', possibleCauses: ['Vent valve solenoid', 'Wiring', 'Connector'] },
  'P0451': { description: 'Evaporative Emission Control System Pressure Sensor Range/Performance', severity: 'info', system: 'emissions_aux', possibleCauses: ['FTP sensor', 'Wiring', 'Gas cap'] },
  'P0452': { description: 'Evaporative Emission Control System Pressure Sensor Low', severity: 'info', system: 'emissions_aux', possibleCauses: ['FTP sensor short', 'Wiring'] },
  'P0453': { description: 'Evaporative Emission Control System Pressure Sensor High', severity: 'info', system: 'emissions_aux', possibleCauses: ['FTP sensor open', 'Wiring'] },
  'P0455': { description: 'Evaporative Emission Control System Large Leak Detected', severity: 'warning', system: 'emissions_aux', possibleCauses: ['Gas cap missing/loose', 'EVAP hose disconnected', 'Canister crack', 'Purge valve stuck open'] },
  'P0456': { description: 'Evaporative Emission Control System Very Small Leak Detected', severity: 'info', system: 'emissions_aux', possibleCauses: ['Gas cap seal', 'EVAP hose', 'O-ring', 'Canister'] },

  // ── Speed/Idle Control (P05xx) ──
  'P0500': { description: 'Vehicle Speed Sensor Malfunction', severity: 'warning', system: 'speed_idle', possibleCauses: ['VSS failure', 'Wiring', 'Transmission output shaft sensor', 'ABS module'] },
  'P0501': { description: 'Vehicle Speed Sensor Range/Performance', severity: 'warning', system: 'speed_idle', possibleCauses: ['VSS', 'Tire size change', 'Wiring'] },
  'P0505': { description: 'Idle Air Control System Malfunction', severity: 'warning', system: 'speed_idle', possibleCauses: ['IAC valve', 'Vacuum leak', 'Throttle body carbon', 'Wiring'] },
  'P0506': { description: 'Idle Air Control System RPM Lower Than Expected', severity: 'info', system: 'speed_idle', possibleCauses: ['Vacuum leak', 'IAC valve', 'Throttle body dirty', 'PCV valve'] },
  'P0507': { description: 'Idle Air Control System RPM Higher Than Expected', severity: 'info', system: 'speed_idle', possibleCauses: ['Vacuum leak', 'IAC valve', 'Throttle body', 'Air leak after MAF'] },
  'P0520': { description: 'Engine Oil Pressure Sensor/Switch Circuit Malfunction', severity: 'critical', system: 'speed_idle', possibleCauses: ['Oil pressure sensor', 'Wiring', 'Low oil', 'Oil pump'] },
  'P0521': { description: 'Engine Oil Pressure Sensor/Switch Range/Performance', severity: 'warning', system: 'speed_idle', possibleCauses: ['Oil pressure sensor', 'Oil viscosity', 'Oil pump wear'] },
  'P0522': { description: 'Engine Oil Pressure Sensor/Switch Circuit Low', severity: 'critical', system: 'speed_idle', possibleCauses: ['Low oil pressure', 'Oil pump failure', 'Sensor', 'Wiring'] },
  'P0523': { description: 'Engine Oil Pressure Sensor/Switch Circuit High', severity: 'warning', system: 'speed_idle', possibleCauses: ['Oil pressure sensor', 'Wiring short to power'] },
  'P0562': { description: 'System Voltage Low', severity: 'warning', system: 'speed_idle', possibleCauses: ['Battery weak', 'Alternator', 'Wiring', 'Parasitic drain'] },
  'P0563': { description: 'System Voltage High', severity: 'warning', system: 'speed_idle', possibleCauses: ['Alternator overcharging', 'Voltage regulator', 'Battery'] },

  // ── Computer Output Circuit (P06xx) ──
  'P0600': { description: 'Serial Communication Link Malfunction', severity: 'critical', system: 'computer', possibleCauses: ['ECM internal failure', 'CAN bus wiring', 'Module communication'] },
  'P0601': { description: 'Internal Control Module Memory Check Sum Error', severity: 'critical', system: 'computer', possibleCauses: ['ECM failure', 'Software corruption', 'ECM needs replacement'] },
  'P0602': { description: 'Control Module Programming Error', severity: 'critical', system: 'computer', possibleCauses: ['ECM needs reprogramming', 'Software update needed'] },
  'P0603': { description: 'Internal Control Module KAM Error', severity: 'warning', system: 'computer', possibleCauses: ['Battery disconnected', 'ECM', 'Wiring'] },
  'P0604': { description: 'Internal Control Module RAM Error', severity: 'critical', system: 'computer', possibleCauses: ['ECM failure', 'ECM needs replacement'] },
  'P0606': { description: 'ECM/PCM Processor Fault', severity: 'critical', system: 'computer', possibleCauses: ['ECM internal failure', 'ECM needs replacement'] },

  // ── Transmission (P07xx) ──
  'P0700': { description: 'Transmission Control System Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['TCM fault', 'Transmission wiring', 'Solenoid', 'Internal failure'] },
  'P0705': { description: 'Transmission Range Sensor Circuit Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['TRS/PRNDL sensor', 'Wiring', 'Connector'] },
  'P0710': { description: 'Transmission Fluid Temperature Sensor Circuit Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['TFT sensor', 'Wiring', 'Connector'] },
  'P0711': { description: 'Transmission Fluid Temperature Sensor Range/Performance', severity: 'info', system: 'transmission', possibleCauses: ['TFT sensor', 'Fluid level', 'Cooling system'] },
  'P0715': { description: 'Input/Turbine Speed Sensor Circuit Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['Input speed sensor', 'Wiring', 'Connector', 'Torque converter'] },
  'P0720': { description: 'Output Speed Sensor Circuit Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['Output speed sensor', 'Wiring', 'Connector'] },
  'P0725': { description: 'Engine Speed Input Circuit Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['CKP sensor signal to TCM', 'Wiring', 'ECM/TCM communication'] },
  'P0730': { description: 'Incorrect Gear Ratio', severity: 'critical', system: 'transmission', possibleCauses: ['Transmission internal failure', 'Solenoid', 'Fluid level', 'Clutch wear'] },
  'P0731': { description: 'Gear 1 Incorrect Ratio', severity: 'critical', system: 'transmission', possibleCauses: ['1st gear clutch', 'Solenoid', 'Fluid', 'Internal damage'] },
  'P0732': { description: 'Gear 2 Incorrect Ratio', severity: 'critical', system: 'transmission', possibleCauses: ['2nd gear clutch', 'Solenoid', 'Fluid', 'Internal damage'] },
  'P0733': { description: 'Gear 3 Incorrect Ratio', severity: 'critical', system: 'transmission', possibleCauses: ['3rd gear clutch', 'Solenoid', 'Fluid'] },
  'P0734': { description: 'Gear 4 Incorrect Ratio', severity: 'critical', system: 'transmission', possibleCauses: ['4th gear clutch', 'Solenoid', 'Fluid'] },
  'P0740': { description: 'Torque Converter Clutch Circuit Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['TCC solenoid', 'Wiring', 'Torque converter', 'Fluid'] },
  'P0741': { description: 'Torque Converter Clutch Circuit Performance/Stuck Off', severity: 'warning', system: 'transmission', possibleCauses: ['TCC solenoid', 'Torque converter', 'Fluid contamination'] },
  'P0742': { description: 'Torque Converter Clutch Circuit Stuck On', severity: 'warning', system: 'transmission', possibleCauses: ['TCC solenoid stuck', 'Valve body', 'Wiring'] },
  'P0748': { description: 'Pressure Control Solenoid A Electrical', severity: 'warning', system: 'transmission', possibleCauses: ['Pressure solenoid A', 'Wiring', 'TCM'] },
  'P0750': { description: 'Shift Solenoid A Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['Shift solenoid A', 'Wiring', 'TCM', 'Valve body'] },
  'P0751': { description: 'Shift Solenoid A Performance/Stuck Off', severity: 'warning', system: 'transmission', possibleCauses: ['Shift solenoid A', 'Valve body', 'Fluid'] },
  'P0755': { description: 'Shift Solenoid B Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['Shift solenoid B', 'Wiring', 'TCM'] },
  'P0756': { description: 'Shift Solenoid B Performance/Stuck Off', severity: 'warning', system: 'transmission', possibleCauses: ['Shift solenoid B', 'Valve body', 'Fluid'] },
  'P0760': { description: 'Shift Solenoid C Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['Shift solenoid C', 'Wiring', 'TCM'] },
  'P0765': { description: 'Shift Solenoid D Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['Shift solenoid D', 'Wiring', 'TCM'] },
  'P0770': { description: 'Shift Solenoid E Malfunction', severity: 'warning', system: 'transmission', possibleCauses: ['Shift solenoid E', 'Wiring', 'TCM'] },
  'P0780': { description: 'Shift Malfunction', severity: 'critical', system: 'transmission', possibleCauses: ['Transmission internal', 'Solenoid pack', 'Valve body', 'Fluid'] },

  // ── Diesel-Specific (P2xxx) ──
  'P2002': { description: 'Diesel Particulate Filter Efficiency Below Threshold (Bank 1)', severity: 'critical', system: 'emissions_aux', possibleCauses: ['DPF clogged', 'DPF cracked', 'Regen failure', 'Soot sensor'] },
  'P2003': { description: 'Diesel Particulate Filter Efficiency Below Threshold (Bank 2)', severity: 'critical', system: 'emissions_aux', possibleCauses: ['DPF clogged', 'DPF cracked', 'Regen failure'] },
  'P200A': { description: 'Intake Manifold Air Flow Control Actuator Position Stuck', severity: 'warning', system: 'fuel_air', possibleCauses: ['Intake throttle actuator', 'Carbon buildup', 'Wiring'] },
  'P2031': { description: 'Exhaust Gas Temperature Sensor 1 Circuit (Bank 1)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGT sensor 1', 'Wiring', 'Connector'] },
  'P2032': { description: 'Exhaust Gas Temperature Sensor 1 Circuit Low (Bank 1)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGT sensor 1 short', 'Wiring'] },
  'P2033': { description: 'Exhaust Gas Temperature Sensor 1 Circuit High (Bank 1)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['EGT sensor 1 open', 'Wiring'] },
  'P2047': { description: 'Reductant Injector Circuit/Open (Bank 1 Unit 1)', severity: 'critical', system: 'emissions_aux', possibleCauses: ['DEF injector', 'Wiring', 'DEF quality', 'DEF pump'] },
  'P2048': { description: 'Reductant Injector Circuit Low (Bank 1 Unit 1)', severity: 'critical', system: 'emissions_aux', possibleCauses: ['DEF injector short', 'Wiring'] },
  'P2049': { description: 'Reductant Injector Circuit High (Bank 1 Unit 1)', severity: 'critical', system: 'emissions_aux', possibleCauses: ['DEF injector open', 'Wiring'] },
  'P2096': { description: 'Post Catalyst Fuel Trim System Too Lean (Bank 1)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['Catalytic converter', 'O2 sensor', 'Exhaust leak'] },
  'P2097': { description: 'Post Catalyst Fuel Trim System Too Rich (Bank 1)', severity: 'warning', system: 'emissions_aux', possibleCauses: ['Catalytic converter', 'O2 sensor', 'Injector leak'] },
  'P2100': { description: 'Throttle Actuator Control Motor Circuit/Open', severity: 'critical', system: 'fuel_air', possibleCauses: ['Electronic throttle body', 'Wiring', 'ECM'] },
  'P2101': { description: 'Throttle Actuator Control Motor Range/Performance', severity: 'critical', system: 'fuel_air', possibleCauses: ['Throttle body', 'Carbon buildup', 'Wiring'] },
  'P2111': { description: 'Throttle Actuator Control System Stuck Open', severity: 'critical', system: 'fuel_air', possibleCauses: ['Throttle body stuck', 'Carbon buildup', 'Motor failure'] },
  'P2112': { description: 'Throttle Actuator Control System Stuck Closed', severity: 'critical', system: 'fuel_air', possibleCauses: ['Throttle body stuck', 'Carbon buildup', 'Motor failure'] },
  'P2135': { description: 'Throttle/Pedal Position Sensor Voltage Correlation', severity: 'critical', system: 'fuel_air', possibleCauses: ['TPS A/B mismatch', 'APP sensor', 'Wiring', 'Throttle body'] },
  'P2138': { description: 'Throttle/Pedal Position Sensor D/E Voltage Correlation', severity: 'critical', system: 'fuel_air', possibleCauses: ['APP sensor', 'Wiring', 'Connector'] },
  'P2146': { description: 'Fuel Injector Group A Supply Voltage Circuit/Open', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector power supply', 'Fuse', 'Relay', 'Wiring'] },
  'P2149': { description: 'Fuel Injector Group B Supply Voltage Circuit/Open', severity: 'critical', system: 'fuel_air', possibleCauses: ['Injector power supply', 'Fuse', 'Relay', 'Wiring'] },
  'P2196': { description: 'O2 Sensor Signal Biased/Stuck Rich (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Fuel pressure high', 'Injector leak'] },
  'P2197': { description: 'O2 Sensor Signal Biased/Stuck Lean (Bank 1 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Vacuum leak', 'Fuel pressure low'] },
  'P2198': { description: 'O2 Sensor Signal Biased/Stuck Rich (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Fuel pressure high'] },
  'P2199': { description: 'O2 Sensor Signal Biased/Stuck Lean (Bank 2 Sensor 1)', severity: 'warning', system: 'fuel_air', possibleCauses: ['O2 sensor failure', 'Vacuum leak'] },
  'P2263': { description: 'Turbocharger/Supercharger Boost System Performance', severity: 'warning', system: 'fuel_air', possibleCauses: ['Turbo failure', 'Boost leak', 'Wastegate', 'VGT actuator'] },
  'P2291': { description: 'Injector Control Pressure Too Low - Engine Cranking', severity: 'critical', system: 'fuel_air', possibleCauses: ['High pressure oil pump', 'IPR valve', 'Oil leak', 'Low oil'] },
  'P2BAE': { description: 'NOx Exceedance - SCR NOx Catalyst Efficiency Below Threshold', severity: 'critical', system: 'emissions_aux', possibleCauses: ['SCR catalyst degraded', 'DEF quality', 'DEF injector', 'NOx sensor'] },

  // ── Chassis (C0xxx) ──
  'C0035': { description: 'Left Front Wheel Speed Sensor Circuit', severity: 'warning', system: 'chassis', possibleCauses: ['Wheel speed sensor', 'Tone ring', 'Wiring', 'ABS module'] },
  'C0040': { description: 'Right Front Wheel Speed Sensor Circuit', severity: 'warning', system: 'chassis', possibleCauses: ['Wheel speed sensor', 'Tone ring', 'Wiring'] },
  'C0045': { description: 'Left Rear Wheel Speed Sensor Circuit', severity: 'warning', system: 'chassis', possibleCauses: ['Wheel speed sensor', 'Tone ring', 'Wiring'] },
  'C0050': { description: 'Right Rear Wheel Speed Sensor Circuit', severity: 'warning', system: 'chassis', possibleCauses: ['Wheel speed sensor', 'Tone ring', 'Wiring'] },
  'C0110': { description: 'Pump Motor Circuit Malfunction', severity: 'critical', system: 'chassis', possibleCauses: ['ABS pump motor', 'Relay', 'Wiring', 'ABS module'] },
  'C0265': { description: 'EBCM Motor Relay Circuit', severity: 'critical', system: 'chassis', possibleCauses: ['ABS relay', 'EBCM module', 'Wiring'] },
  'C0300': { description: 'Rear Speed Sensor Malfunction', severity: 'warning', system: 'chassis', possibleCauses: ['Rear wheel speed sensor', 'Tone ring', 'Wiring'] },

  // ── Body (B0xxx) ──
  'B0001': { description: 'Driver Frontal Stage 1 Deployment Control', severity: 'critical', system: 'body', possibleCauses: ['Airbag module', 'Clockspring', 'Wiring', 'SRS module'] },
  'B0010': { description: 'Front Passenger Frontal Stage 1 Deployment Control', severity: 'critical', system: 'body', possibleCauses: ['Passenger airbag', 'Wiring', 'SRS module'] },
  'B0051': { description: 'Driver Frontal Deployment Loop Resistance High', severity: 'critical', system: 'body', possibleCauses: ['Clockspring', 'Airbag connector', 'Wiring'] },
  'B0100': { description: 'Electronic Frontal Sensor 1 Malfunction', severity: 'critical', system: 'body', possibleCauses: ['Impact sensor', 'Wiring', 'SRS module'] },
  'B1000': { description: 'ECU Malfunction (Internal)', severity: 'critical', system: 'body', possibleCauses: ['Body control module failure', 'Software', 'Power supply'] },
  'B1001': { description: 'Option Configuration Error', severity: 'info', system: 'body', possibleCauses: ['BCM programming', 'Module configuration'] },
  'B1015': { description: 'Battery Voltage Out of Range', severity: 'warning', system: 'body', possibleCauses: ['Battery', 'Alternator', 'Wiring'] },
  'B1325': { description: 'Driver Door Ajar Circuit Failure', severity: 'info', system: 'body', possibleCauses: ['Door ajar switch', 'Wiring', 'BCM'] },

  // ── Network Communication (U0xxx) ──
  'U0001': { description: 'High Speed CAN Communication Bus', severity: 'critical', system: 'network', possibleCauses: ['CAN bus wiring', 'Terminating resistor', 'Module failure', 'Short circuit'] },
  'U0073': { description: 'Control Module Communication Bus A Off', severity: 'critical', system: 'network', possibleCauses: ['CAN bus failure', 'Module power supply', 'Wiring'] },
  'U0100': { description: 'Lost Communication with ECM/PCM', severity: 'critical', system: 'network', possibleCauses: ['ECM failure', 'CAN bus wiring', 'Power/ground to ECM'] },
  'U0101': { description: 'Lost Communication with TCM', severity: 'critical', system: 'network', possibleCauses: ['TCM failure', 'CAN bus wiring', 'Power/ground to TCM'] },
  'U0107': { description: 'Lost Communication with Throttle Actuator Control Module', severity: 'critical', system: 'network', possibleCauses: ['TAC module', 'CAN bus', 'Wiring'] },
  'U0121': { description: 'Lost Communication with ABS Control Module', severity: 'warning', system: 'network', possibleCauses: ['ABS module', 'CAN bus', 'Wiring', 'Fuse'] },
  'U0140': { description: 'Lost Communication with Body Control Module', severity: 'warning', system: 'network', possibleCauses: ['BCM failure', 'CAN bus', 'Wiring'] },
  'U0151': { description: 'Lost Communication with Restraints Control Module', severity: 'critical', system: 'network', possibleCauses: ['SRS module', 'CAN bus', 'Wiring'] },
  'U0155': { description: 'Lost Communication with Instrument Panel Cluster', severity: 'info', system: 'network', possibleCauses: ['IPC module', 'CAN bus', 'Wiring'] },
  'U0164': { description: 'Lost Communication with HVAC Control Module', severity: 'info', system: 'network', possibleCauses: ['HVAC module', 'CAN bus', 'Wiring'] },
  'U0293': { description: 'Hybrid Powertrain Control Module Requested MIL Illumination', severity: 'warning', system: 'hybrid', possibleCauses: ['Hybrid system fault', 'Battery management', 'Inverter'] },
  'U0401': { description: 'Invalid Data Received from ECM/PCM', severity: 'warning', system: 'network', possibleCauses: ['ECM software', 'CAN bus noise', 'Module incompatibility'] },
};

// ─── DTC Lookup ──────────────────────────────────────────────────────────────

export function lookupDTC(code: string): DTCInfo {
  const upper = code.toUpperCase();
  
  // Direct lookup
  if (DTC_DATABASE[upper]) return DTC_DATABASE[upper];

  // Generate a generic description based on code pattern
  return generateGenericDTCInfo(upper);
}

function generateGenericDTCInfo(code: string): DTCInfo {
  const prefix = code[0];
  const digit2 = parseInt(code[1], 10);
  const range = parseInt(code.substring(2, 4), 16);

  let system: DTCSystem = 'unknown';
  let severity: DTCSeverity = 'warning';
  let description = `${code} - `;

  switch (prefix) {
    case 'P':
      if (digit2 === 0) {
        // P0xxx - Generic powertrain
        if (range <= 0x0F) { description += 'Fuel and Air Metering'; system = 'fuel_air'; }
        else if (range <= 0x1F) { description += 'Fuel and Air Metering (Injector)'; system = 'fuel_air'; }
        else if (range <= 0x2F) { description += 'Ignition System or Misfire'; system = 'ignition'; severity = 'critical'; }
        else if (range <= 0x3F) { description += 'Auxiliary Emissions Controls'; system = 'emissions_aux'; }
        else if (range <= 0x4F) { description += 'Vehicle Speed/Idle Control'; system = 'speed_idle'; }
        else if (range <= 0x5F) { description += 'Computer Output Circuit'; system = 'computer'; }
        else if (range <= 0x6F) { description += 'Transmission'; system = 'transmission'; }
        else { description += 'Powertrain'; system = 'fuel_air'; }
      } else if (digit2 === 1) {
        description += 'Manufacturer-Specific Powertrain'; system = 'fuel_air';
      } else if (digit2 === 2) {
        description += 'Generic Powertrain (SAE Reserved)'; system = 'fuel_air';
      } else {
        description += 'Powertrain'; system = 'fuel_air';
      }
      break;
    case 'C':
      description += 'Chassis'; system = 'chassis';
      break;
    case 'B':
      description += 'Body'; system = 'body'; severity = 'info';
      break;
    case 'U':
      description += 'Network Communication'; system = 'network'; severity = 'critical';
      break;
  }

  return {
    description,
    severity,
    system,
    possibleCauses: ['Refer to vehicle-specific service manual for detailed diagnosis'],
  };
}

// ─── DTC System Labels ──────────────────────────────────────────────────────

export const DTC_SYSTEM_LABELS: Record<DTCSystem, string> = {
  fuel_air: 'Fuel & Air Metering',
  fuel_air_aux: 'Fuel & Air (Auxiliary)',
  ignition: 'Ignition System',
  emissions_aux: 'Emissions Control',
  speed_idle: 'Speed & Idle Control',
  computer: 'Computer / ECM',
  transmission: 'Transmission',
  chassis: 'Chassis / ABS',
  body: 'Body Control',
  network: 'Network / CAN Bus',
  hybrid: 'Hybrid / EV System',
  unknown: 'Unknown System',
};

export const DTC_SEVERITY_LABELS: Record<DTCSeverity, { label: string; color: string }> = {
  critical: { label: 'CRITICAL', color: 'oklch(0.52 0.22 25)' },
  warning: { label: 'WARNING', color: 'oklch(0.75 0.18 60)' },
  info: { label: 'INFO', color: 'oklch(0.70 0.18 200)' },
};

// ─── Exported Helpers ────────────────────────────────────────────────────────

export function getDTCDatabaseSize(): number {
  return Object.keys(DTC_DATABASE).length;
}

export function searchDTCDatabase(query: string): Array<{ code: string } & DTCInfo> {
  const q = query.toLowerCase();
  return Object.entries(DTC_DATABASE)
    .filter(([code, info]) =>
      code.toLowerCase().includes(q) ||
      info.description.toLowerCase().includes(q) ||
      info.system.toLowerCase().includes(q) ||
      info.possibleCauses.some(c => c.toLowerCase().includes(q))
    )
    .map(([code, info]) => ({ code, ...info }));
}
