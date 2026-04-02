/**
 * Data processing utilities for Duramax OBD-II logs
 * Handles CSV parsing for both HP Tuners and EFILIVE formats
 */

/**
 * Audit record for the boost absolute-vs-gauge calibration pass.
 * Stored on every processed log so the UI can explain what was corrected.
 */
export interface BoostCalibrationInfo {
  /** Whether a correction was applied */
  corrected: boolean;
  /** Detected atmospheric offset subtracted from desired boost (psi) */
  atmosphericOffsetPsi: number;
  /** Method used to detect the offset */
  method: 'idle_map_baseline' | 'barometric_pid' | 'none';
  /** Idle MAP baseline value used (psia) */
  idleBaselinePsia: number;
  /** Number of idle samples used to compute baseline */
  idleSampleCount: number;
  /** Whether desired boost was already in gauge pressure (no correction needed) */
  desiredAlreadyGauge: boolean;
}

/**
 * Vehicle metadata extracted from CSV comment headers (# VIN: ..., # FuelType: ..., etc.)
 * or inferred from VIN embedded in filename.
 */
export interface VehicleMeta {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  engineType?: string;
  manufacturer?: string;  // 'gm' | 'ford' | 'bmw' | 'universal'
  fuelType?: string;      // 'diesel' | 'gasoline' | 'hybrid' | 'any'
  displacement?: string;
  protocol?: string;
}

export interface DuramaxData {
  rpm: number[];
  maf: number[];
  boost: number[];
  mapAbsolute: number[];      // Raw MAP in psi absolute (for fallback use)
  torquePercent: number[];
  maxTorque: number[];
  vehicleSpeed: number[];
  fuelRate: number[];
  offset: number[];
  railPressureActual: number[];
  railPressureDesired: number[];
  pcvDutyCycle: number[];
  boostDesired: number[];
  turboVanePosition: number[];
  turboVaneDesired: number[];
  exhaustGasTemp: number[];
  converterSlip: number[];
  converterDutyCycle: number[];
  converterPressure: number[];
  currentGear: number[];        // Trans current gear (1-10)
  oilPressure: number[];
  coolantTemp: number[];
  oilTemp: number[];
  transFluidTemp: number[];
  barometricPressure: number[];
  boostSource: 'direct' | 'map_derived' | 'none'; // how boost was obtained
  boostActualAvailable: boolean; // false when MAP is all N/A — suppresses boost fault checks
  throttlePosition: number[];  // APP / TPS for drag detection
  injectorPulseWidth: number[];  // Injector pulse width (ms)
  injectionTiming: number[];     // Injection timing / SOI (degrees BTDC)
  intakeAirTemp: number[];       // Intake air temperature (°F)
  fuelQuantity: number[];         // Fuel quantity per injection (mm3/stroke)
  // ── Cummins-specific channels ──────────────────────────────────────────
  turboSpeed: number[];            // Turbo shaft speed (rpm) — Cummins only
  exhaustPressure: number[];       // Exhaust back pressure (psi) — Cummins only
  batteryVoltage: number[];        // Battery voltage (V)
  dpfSootLevel: number[];          // DPF soot loading (g) — Cummins only
  egrPosition: number[];           // EGR valve position (%)
  egrTemp: number[];               // EGR temperature (°F)
  intakeThrottlePosition: number[];// Intake throttle position (%) — separate from pedal
  intakeManifoldTemp: number[];    // Intake manifold temp (°F) — Cummins only
  chargeCoolerTemp: number[];      // Charge air cooler outlet temp (°F) — Cummins only
  pilot1Qty: number[];             // Pilot 1 injection quantity (mm3)
  pilot2Qty: number[];             // Pilot 2 injection quantity (mm3)
  pilot1Timing: number[];          // Pilot 1 injection timing (°)
  pilot2Timing: number[];          // Pilot 2 injection timing (°)
  post1Qty: number[];              // Post 1 injection quantity (mm3)
  post2Qty: number[];              // Post 2 injection quantity (mm3)
  post1Timing: number[];           // Post 1 injection timing (°)
  post2Timing: number[];           // Post 2 injection timing (°)
  regenState: number[];            // DPF regen state — Cummins only
  cspTuneNumber: number[];         // CSP5 tune number — Cummins only
  fuelRegCurrent: number[];        // Fuel pressure regulator current (A) — Cummins only
  egt2: number[];                    // EGT probe 2 (°F) — Cummins 5-probe
  egt3: number[];                    // EGT probe 3 (°F) — Cummins 5-probe
  egt4: number[];                    // EGT probe 4 (°F) — Cummins 5-probe
  egt5: number[];                    // EGT probe 5 (°F) — Cummins 5-probe
  altitudeDensityHigh: number[];     // Altitude adjust table select high (count)
  altitudeDensityLow: number[];      // Altitude adjust table select low (count)
  compressorDensity: number[];       // Compressor inlet density (kg/m3)
  engineTorqueState: number[];       // Engine torque control state
  fuelControlMode: number[];         // Fuel control mode
  mainInjDuration: number[];           // Main injection duration (µs) — Cummins only
  calcLoad: number[];                  // Calculated load value (%) — Cummins only
  outputShaftRpm: number[];            // Trans output shaft speed (rpm)
  turbineRpm: number[];                // Torque converter turbine speed (rpm)
  transLinePressureDesired: number[];  // Trans line pressure desired (psi)
  transLinePressureActual: number[];   // Trans line pressure actual (psi)
  transLinePressureDC: number[];       // Trans line pressure duty cycle (%)
  driverDemandTorque: number[];        // Driver demanded engine torque (%)
  actualEngineTorque: number[];        // Actual engine torque (%)
  post3Qty: number[];                  // Post 3 injection quantity (mm3)
  post4Qty: number[];                  // Post 4 injection quantity (mm3)
  // ── End Cummins-specific ───────────────────────────────────────────────
  pidSubstitutions: import('./pidSubstitution').PidSubstitution[]; // audit trail
  pidsMissing: string[];       // channels that had no valid substitute
  timestamp: string;
  duration: number;
  fileFormat: 'hptuners' | 'efilive' | 'bankspower' | 'ezlynk';
  boostCalibration: BoostCalibrationInfo; // atmospheric correction audit
  vehicleMeta?: VehicleMeta; // VIN-based vehicle identification from CSV metadata
}

export interface ProcessedMetrics {
  rpm: number[];
  maf: number[];
  boost: number[];
  mapAbsolute: number[];      // Raw MAP psi absolute (for reference)
  hpTorque: number[];
  hpMaf: number[];
  hpAccel: number[];  // HP estimated from vehicle weight + acceleration (fallback when torque unavailable)
  vehicleSpeed: number[];
  timeMinutes: number[];
  railPressureActual: number[];
  railPressureDesired: number[];
  pcvDutyCycle: number[];
  boostDesired: number[];
  turboVanePosition: number[];
  turboVaneDesired: number[];
  exhaustGasTemp: number[];
  converterSlip: number[];
  converterDutyCycle: number[];
  converterPressure: number[];
  currentGear: number[];        // Trans current gear (1-10)
  oilPressure: number[];
  coolantTemp: number[];
  oilTemp: number[];
  transFluidTemp: number[];
  barometricPressure: number[];
  boostSource: 'direct' | 'map_derived' | 'none'; // provenance label for UI
  boostActualAvailable: boolean; // false when MAP was all N/A — suppresses boost fault checks
  throttlePosition: number[];  // APP / TPS for drag detection
  injectorPulseWidth: number[];  // Injector pulse width (ms)
  injectionTiming: number[];     // Injection timing / SOI (degrees BTDC)
  intakeAirTemp: number[];       // Intake air temperature (°F)
  fuelQuantity: number[];         // Fuel quantity per injection (mm3/stroke)
  // ── Cummins-specific channels ──────────────────────────────────────────
  turboSpeed: number[];            // Turbo shaft speed (rpm)
  exhaustPressure: number[];       // Exhaust back pressure (psi)
  batteryVoltage: number[];        // Battery voltage (V)
  dpfSootLevel: number[];          // DPF soot loading (g)
  egrPosition: number[];           // EGR valve position (%)
  egrTemp: number[];               // EGR temperature (°F)
  intakeThrottlePosition: number[];// Intake throttle position (%)
  intakeManifoldTemp: number[];    // Intake manifold temp (°F)
  chargeCoolerTemp: number[];      // Charge air cooler outlet temp (°F)
  pilot1Qty: number[];             // Pilot 1 injection quantity (mm3)
  pilot2Qty: number[];             // Pilot 2 injection quantity (mm3)
  pilot1Timing: number[];          // Pilot 1 injection timing (°)
  pilot2Timing: number[];          // Pilot 2 injection timing (°)
  post1Qty: number[];              // Post 1 injection quantity (mm3)
  post2Qty: number[];              // Post 2 injection quantity (mm3)
  post1Timing: number[];           // Post 1 injection timing (°)
  post2Timing: number[];           // Post 2 injection timing (°)
  regenState: number[];            // DPF regen state
  cspTuneNumber: number[];         // CSP5 tune number
  fuelRegCurrent: number[];        // Fuel pressure regulator current (A)
  egt2: number[];                    // EGT probe 2 (°F)
  egt3: number[];                    // EGT probe 3 (°F)
  egt4: number[];                    // EGT probe 4 (°F)
  egt5: number[];                    // EGT probe 5 (°F)
  altitudeDensityHigh: number[];     // Altitude adjust table select high
  altitudeDensityLow: number[];      // Altitude adjust table select low
  compressorDensity: number[];       // Compressor inlet density (kg/m3)
  engineTorqueState: number[];       // Engine torque control state
  fuelControlMode: number[];         // Fuel control mode
  mainInjDuration: number[];           // Main injection duration (µs)
  calcLoad: number[];                  // Calculated load value (%)
  outputShaftRpm: number[];            // Trans output shaft speed (rpm)
  turbineRpm: number[];                // Torque converter turbine speed (rpm)
  transLinePressureDesired: number[];  // Trans line pressure desired (psi)
  transLinePressureActual: number[];   // Trans line pressure actual (psi)
  transLinePressureDC: number[];       // Trans line pressure duty cycle (%)
  driverDemandTorque: number[];        // Driver demanded engine torque (%)
  actualEngineTorque: number[];        // Actual engine torque (%)
  post3Qty: number[];                  // Post 3 injection quantity (mm3)
  post4Qty: number[];                  // Post 4 injection quantity (mm3)
  // ── End Cummins-specific ───────────────────────────────────────────────
  pidSubstitutions: import('./pidSubstitution').PidSubstitution[];
  pidsMissing: string[];
  boostCalibration: BoostCalibrationInfo; // atmospheric correction audit
  stats: {
    rpmMin: number;
    rpmMax: number;
    rpmMean: number;
    mafMin: number;
    mafMax: number;
    mafMean: number;
    hpTorqueMax: number;
    hpMafMax: number;
    hpAccelMax: number;
    boostMax: number;
    egtMax: number;
    egtAvailable: boolean;
    egtFlatlined: boolean;
    duration: number;
  };
  fileFormat: 'hptuners' | 'efilive' | 'bankspower' | 'ezlynk';
  vehicleMeta?: VehicleMeta; // VIN-based vehicle identification
}

/**
 * Detect file format and parse accordingly
 */
/**
 * Extract vehicle metadata from CSV comment headers.
 * Lines starting with # are treated as metadata:
 *   # VIN: 1GCUYDED5RZ123456
 *   # Vehicle: 2024 Chevrolet Silverado 2500 HD
 *   # FuelType: diesel
 */
function extractVehicleMeta(lines: string[]): VehicleMeta | undefined {
  const meta: VehicleMeta = {};
  let found = false;

  for (const line of lines) {
    if (!line.startsWith('#')) break; // metadata is always at the top
    found = true;
    const match = line.match(/^#\s*(\w+):\s*(.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    const v = value.trim();
    switch (key.toLowerCase()) {
      case 'vin': meta.vin = v; break;
      case 'vehicle': {
        // Parse "2024 Chevrolet Silverado 2500 HD" → year + make + model
        const parts = v.match(/^(\d{4})\s+(.+)$/);
        if (parts) {
          meta.year = parseInt(parts[1], 10);
          const rest = parts[2].trim();
          const spaceIdx = rest.indexOf(' ');
          if (spaceIdx > 0) {
            meta.make = rest.slice(0, spaceIdx);
            meta.model = rest.slice(spaceIdx + 1);
          } else {
            meta.make = rest;
          }
        }
        break;
      }
      case 'engine': meta.engineType = v; break;
      case 'manufacturer': meta.manufacturer = v; break;
      case 'fueltype': meta.fuelType = v; break;
      case 'displacement': meta.displacement = v; break;
      case 'protocol': meta.protocol = v; break;
    }
  }

  return found ? meta : undefined;
}

/**
 * Strip metadata comment lines from CSV content so parsers only see data.
 */
function stripMetaLines(content: string): string {
  const lines = content.split('\n');
  const firstDataLine = lines.findIndex(l => !l.trim().startsWith('#'));
  if (firstDataLine <= 0) return content;
  return lines.slice(firstDataLine).join('\n');
}

export function parseCSV(content: string): DuramaxData {
  // Try to detect format
  const lines = content.split('\n').map(line => line.trim());

  // Extract vehicle metadata from # comment headers (if present)
  const vehicleMeta = extractVehicleMeta(lines);

  // Strip metadata lines so downstream parsers don't choke on them
  const cleanContent = stripMetaLines(content);
  const cleanLines = cleanContent.split('\n').map(line => line.trim());
  
  // Check for PPEI Datalogger format (our own live-capture export)
  // Detected by "Timestamp (ms)" or "Elapsed (s)" in the first row
  const isDatalogger = cleanLines.length > 0 && (
    cleanLines[0].includes('Timestamp (ms)') ||
    cleanLines[0].includes('Elapsed (s)')
  );

  // Check for Banks Power / iDash format
  // Pattern 1: Legacy Banks dyno logs with "Horsepower ECU", "DYNO", "Transmission Slip"
  // Pattern 2: Banks iDash 4-row header — row 0 starts with "TIME,Engine RPM" and row 1 has hex PIDs ("0x")
  const isBanksPower = cleanLines.some(line => 
    line.includes('Horsepower ECU') || 
    line.includes('DYNO - WHP') || 
    line.includes('Transmission Slip')
  ) || (
    cleanLines.length >= 4 &&
    cleanLines[0].startsWith('TIME,') &&
    cleanLines[0].includes('Engine RPM') &&
    cleanLines[1].includes('0x')
  );
  
  // EFILIVE format starts with "Frame", "Time", "Flags" and has "ECM.RPM", "ECM.MAF"
  // LB7/LLY EFILive logs use PCM.RPM / PCM.MAF instead of ECM prefix
  // Cummins 6.7L EFILive (CMF) logs use ECM.RPM_F, ECM.MAF_CM_F, ECM.BOOSTG_F, etc.
  const isEFILive = cleanLines.some(line =>
    line.includes('ECM.RPM') || line.includes('ECM.MAF') ||
    line.includes('PCM.RPM') || line.includes('PCM.MAF') ||
    line.includes('ECM.RPM_F') || line.includes('ECM.MAF_CM_F') ||
    line.includes('ECM.BOOSTG_F') || line.includes('ECM.ENGTRQA_F')
  );

  // EZ Lynk format: single header row with human-readable names + units in parentheses
  // Detected by "Engine RPM (RPM)" or "Boost Pressure (PSI)" or "Injection Pressure(A)" in header
  const isEZLynk = cleanLines.length > 0 && (
    cleanLines[0].includes('Engine RPM (RPM)') ||
    (cleanLines[0].includes('Boost Pressure (PSI)') && cleanLines[0].includes('Injection Pressure'))
  );
  
  let result: DuramaxData;
  if (isDatalogger) {
    result = parseDataloggerCSV(cleanContent);
  } else if (isBanksPower) {
    result = parseBanksPowerCSV(cleanContent);
  } else if (isEZLynk) {
    result = parseEZLynkCSV(cleanContent);
  } else if (isEFILive) {
    result = parseEFILiveCSV(cleanContent);
  } else {
    result = parseHPTunersCSV(cleanContent);
  }

  // Attach vehicle metadata if extracted
  if (vehicleMeta) {
    result.vehicleMeta = vehicleMeta;
  }

  return result;
}

/**
 * Datalogger shortName → logical channel mapping.
 * Maps the shortName used in our live datalogger CSV export to the
 * internal DuramaxData channel names. The datalogger header format is:
 *   SHORTNAME (unit)  — e.g. "RPM (rpm)", "ECT (°C)", "LOAD (%)"
 * We strip the unit suffix and match on the shortName.
 */
const DATALOGGER_CHANNEL_MAP: Record<string, string> = {
  // Core engine
  'RPM': 'rpm',
  'LOAD': 'torquePercent',
  'ECT': 'coolantTemp',
  'MAP': 'boost',
  'MAF': 'maf',
  'TPS': 'throttlePosition',
  'TIMING': '_timing',
  'IAT': '_iat',
  'SPEED': 'vehicleSpeed',
  'VSS': 'vehicleSpeed',
  // Fuel system
  'FRP': 'railPressureActual',
  'FRP_CMD': 'railPressureDesired',
  'FRP_ACT': 'railPressureActual',
  'FUEL_RATE': 'fuelRate',
  // Turbo / boost
  'BOOST': 'boost',
  'BOOST_DES': 'boostDesired',
  'VGT_POS': 'turboVanePosition',
  'VGT_DES': 'turboVaneDesired',
  // Exhaust
  'EGT': 'exhaustGasTemp',
  'EGT_B1S1': 'exhaustGasTemp',
  // Transmission
  'TCC_SLIP': 'converterSlip',
  'TCC_DUTY': 'converterDutyCycle',
  'TCC_PRESS': 'converterPressure',
  'GEAR': 'currentGear',
  'TRANS_GEAR': 'currentGear',
  // Oil / temps
  'OIL_P': 'oilPressure',
  'OIL_T': 'oilTemp',
  'EOT': 'oilTemp',
  'TFT': 'transFluidTemp',
  'BARO': 'barometricPressure',
  // Voltage
  'VPWR': '_voltage',
  // Fuel trims (gas engines)
  'STFT1': '_stft1',
  'LTFT1': '_ltft1',
  'STFT2': '_stft2',
  'LTFT2': '_ltft2',
  // O2 sensors
  'O2_B1S2': '_o2b1s2',
  'O2_B2S2': '_o2b2s2',
  'WB_B1S1': '_wb_b1s1',
  // Catalyst
  'CAT_B1S1': '_catb1s1',
  'CAT_B2S1': '_catb2s1',
  // EVAP
  'EVAP_PCT': '_evap_pct',
  'EVAP_VP': '_evap_vp',
  // Other
  'FUEL_LVL': '_fuel_lvl',
  'FUEL_SYS': '_fuel_sys',
  'ABS_LOAD': '_abs_load',
  'LAMBDA': '_lambda',
  'REL_TPS': '_rel_tps',
  'AAT': '_aat',
  'TPS_B': '_tps_b',
  'APP_D': 'throttlePosition',
  'APP_E': '_app_e',
  'TAC': '_tac',
  'OBD_STD': '_obd_std',
  'RUN_TIME': '_run_time',
  'MIL_DIST': '_mil_dist',
  'CLR_DIST': '_clr_dist',
  'INJ_TMG': '_inj_tmg',
  'EGR_FLOW': '_egr_flow',
  // GM extended PIDs (Mode 22)
  'DPF_SOOT': '_dpf_soot',
  'DPF_REGEN': '_dpf_regen',
  'DEF_LVL': '_def_lvl',
  'DEF_RATE': '_def_rate',
  'DEF_QUAL': '_def_qual',
  'PCV_DC': 'pcvDutyCycle',
  'PCV_ACT': 'pcvDutyCycle',
  'FUEL_QTY': 'fuelQuantity',
  'INJ_QTY': 'fuelQuantity',
};

/**
 * Parse our own datalogger CSV export format.
 * Header: "Timestamp (ms),Elapsed (s),SHORTNAME (unit),..."
 * Data rows: numeric values with empty cells for PIDs that haven't responded yet.
 */
function parseDataloggerCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());
  if (lines.length < 2) throw new Error('Datalogger CSV has no data rows');

  // Parse header — extract shortName and unit from "SHORTNAME (unit)" format
  const rawHeaders = lines[0].split(',').map(h => h.trim());
  const shortNames: string[] = [];
  const headerUnits: string[] = [];
  for (const h of rawHeaders) {
    const match = h.match(/^([^(]+?)\s*\(([^)]+)\)/);
    if (match) {
      shortNames.push(match[1].trim());
      headerUnits.push(match[2].trim().toLowerCase());
    } else {
      shortNames.push(h.trim());
      headerUnits.push('');
    }
  }

  // Build unit conversion functions based on detected header units.
  // OBD-II standard PIDs output in metric; we convert to imperial for consistency.
  const unitConverters: Record<number, (v: number) => number> = {};
  for (let i = 0; i < headerUnits.length; i++) {
    const u = headerUnits[i];
    if (u === '°c' || u === 'c' || u === 'celsius') {
      // Celsius → Fahrenheit
      unitConverters[i] = (v: number) => v <= -40 ? 0 : (v * 9 / 5) + 32;
    } else if (u === 'km/h' || u === 'kph') {
      // km/h → mph
      unitConverters[i] = (v: number) => v * 0.621371;
    } else if (u === 'g/s') {
      // grams/sec → lb/min
      unitConverters[i] = (v: number) => v * 0.132277;
    } else if (u === 'l/h' || u === 'lph') {
      // liters/hour → gallons/hour
      unitConverters[i] = (v: number) => v * 0.264172;
    } else if (u === 'kpa') {
      // kPa → psi (for rail pressure, oil pressure, etc.)
      unitConverters[i] = (v: number) => v * 0.145038;
    } else if (u === 'bar') {
      // bar → psi
      unitConverters[i] = (v: number) => v * 14.5038;
    } else if (u === 'nm' || u === 'n·m') {
      // Newton-meters → lb-ft
      unitConverters[i] = (v: number) => v * 0.737562;
    } else if (u === 'kg/h') {
      // kg/h → lb/min
      unitConverters[i] = (v: number) => v * 0.03674;
    }
  }

  // Find time column
  const elapsedIdx = shortNames.indexOf('Elapsed');
  const timestampIdx = shortNames.indexOf('Timestamp');
  if (elapsedIdx === -1 && timestampIdx === -1) {
    throw new Error('Datalogger CSV missing Elapsed or Timestamp column');
  }

  // Build channel → column index mapping
  const channelColumns: Record<string, number> = {};
  for (let i = 0; i < shortNames.length; i++) {
    const sn = shortNames[i];
    const channel = DATALOGGER_CHANNEL_MAP[sn];
    if (channel && !channel.startsWith('_')) {
      // Only map to DuramaxData channels (skip underscore-prefixed internal ones)
      if (!channelColumns[channel]) {
        channelColumns[channel] = i;
      }
    }
  }

  // Parse data rows
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const throttlePosition: number[] = [];
  const injectorPulseWidth: number[] = [];
  const injectionTiming: number[] = [];
  const intakeAirTemp: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const turboVaneDesired: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const currentGear: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  const barometricPressure: number[] = [];

  const getVal = (values: number[], channel: string): number => {
    const idx = channelColumns[channel];
    if (idx === undefined || idx >= values.length) return 0;
    const v = values[idx];
    if (isNaN(v)) return 0;
    // Apply unit conversion if the header unit is metric
    const converter = unitConverters[idx];
    return converter ? converter(v) : v;
  };

  // Track last known values for sparse data (datalogger fills progressively)
  const lastKnown: Record<string, number> = {};
  const getValWithFill = (values: number[], channel: string): number => {
    const idx = channelColumns[channel];
    if (idx === undefined || idx >= values.length) return lastKnown[channel] ?? 0;
    const raw = values[idx];
    if (isNaN(raw) || raw === undefined) return lastKnown[channel] ?? 0;
    // Apply unit conversion if the header unit is metric
    const converter = unitConverters[idx];
    const converted = converter ? converter(raw) : raw;
    lastKnown[channel] = converted;
    return converted;
  };

  let startTime = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const values = line.split(',').map(v => {
      const num = parseFloat(v.trim());
      return isNaN(num) ? NaN : num;
    });

    // Get elapsed time in seconds
    let elapsed: number;
    if (elapsedIdx !== -1 && !isNaN(values[elapsedIdx])) {
      elapsed = values[elapsedIdx];
    } else if (timestampIdx !== -1 && !isNaN(values[timestampIdx])) {
      if (startTime === 0) startTime = values[timestampIdx];
      elapsed = (values[timestampIdx] - startTime) / 1000;
    } else {
      continue; // skip rows without valid time
    }

    // Only include rows that have at least RPM or LOAD data
    const rpmVal = getValWithFill(values, 'rpm');
    const loadVal = getValWithFill(values, 'torquePercent');
    if (rpmVal === 0 && loadVal === 0 && elapsed < 0.5) continue;
    // Skip data glitch rows: RPM=0 with impossible sensor values (key-cycle noise)
    // These occur when the ECM is powering down and sensors report garbage values
    if (rpmVal === 0 && elapsed > 1) continue;

    offset.push(elapsed);
    rpm.push(rpmVal);
    maf.push(getValWithFill(values, 'maf'));
    // MAP/BARO: auto-converter already handles kPa→psi if header says (kPa).
    // After conversion, values are in psi absolute. Derive gauge boost from MAP-BARO.
    const mapPsia = getValWithFill(values, 'boost');
    const baroVal = getValWithFill(values, 'barometricPressure');
    const baroPsia = baroVal > 0 ? baroVal : 14.696;
    mapAbsolute.push(mapPsia);
    // If MAP > baro, there's positive boost (gauge pressure)
    boost.push(Math.max(0, mapPsia - baroPsia));
    torquePercent.push(loadVal);
    maxTorque.push(879.174); // Default Duramax max torque lb-ft
    vehicleSpeed.push(getValWithFill(values, 'vehicleSpeed'));
    fuelRate.push(getValWithFill(values, 'fuelRate'));
    railPressureActual.push(getValWithFill(values, 'railPressureActual'));
    railPressureDesired.push(getValWithFill(values, 'railPressureDesired'));
    pcvDutyCycle.push(getValWithFill(values, 'pcvDutyCycle'));
    boostDesired.push(getValWithFill(values, 'boostDesired'));
    turboVanePosition.push(getValWithFill(values, 'turboVanePosition'));
    turboVaneDesired.push(getValWithFill(values, 'turboVaneDesired'));
    exhaustGasTemp.push(getValWithFill(values, 'exhaustGasTemp'));
    converterSlip.push(getValWithFill(values, 'converterSlip'));
    converterDutyCycle.push(getValWithFill(values, 'converterDutyCycle'));
    converterPressure.push(getValWithFill(values, 'converterPressure'));
    currentGear.push(getValWithFill(values, 'currentGear'));
    oilPressure.push(getValWithFill(values, 'oilPressure'));
    coolantTemp.push(getValWithFill(values, 'coolantTemp'));
    oilTemp.push(getValWithFill(values, 'oilTemp'));
    transFluidTemp.push(getValWithFill(values, 'transFluidTemp'));
    barometricPressure.push(baroPsia); // already in psi from auto-converter or default 14.696
    throttlePosition.push(getValWithFill(values, 'throttlePosition'));
  }

  if (rpm.length === 0) {
    throw new Error('No valid data rows found in datalogger CSV');
  }

  // Fuel quantity: use fuelQuantity channel if available, otherwise empty
  const fuelQuantity: number[] = channelColumns['fuelQuantity'] !== undefined
    ? rpm.map((_, i) => {
        const idx = channelColumns['fuelQuantity'];
        if (idx === undefined) return 0;
        const line = lines[i + 1]; // +1 for header offset
        if (!line) return 0;
        const vals = line.split(',');
        const raw = parseFloat(vals[idx]?.trim());
        return isNaN(raw) ? 0 : raw;
      })
    : new Array(rpm.length).fill(0);

  const duration = offset.length > 0 ? offset[offset.length - 1] - offset[0] : 0;

  return {
    rpm,
    maf,
    boost,
    mapAbsolute,
    throttlePosition,
    injectorPulseWidth,
    injectionTiming,
    intakeAirTemp,
    torquePercent,
    maxTorque,
    vehicleSpeed,
    fuelRate,
    offset,
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    turboVaneDesired,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    currentGear,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    fuelQuantity,
    boostSource: channelColumns['boost'] !== undefined ? 'map_derived' : 'none',
    boostActualAvailable: boost.some(v => v > 0),
    pidSubstitutions: [],
    pidsMissing: [],
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
    // Cummins-specific (defaults for non-Cummins formats)
    turboSpeed: [],
    exhaustPressure: [],
    batteryVoltage: [],
    dpfSootLevel: [],
    egrPosition: [],
    egrTemp: [],
    intakeThrottlePosition: [],
    intakeManifoldTemp: [],
    chargeCoolerTemp: [],
    pilot1Qty: [],
    pilot2Qty: [],
    pilot1Timing: [],
    pilot2Timing: [],
    post1Qty: [],
    post2Qty: [],
    post1Timing: [],
    post2Timing: [],
    regenState: [],
    cspTuneNumber: [],
    fuelRegCurrent: [],
    egt2: [],
    egt3: [],
    egt4: [],
    egt5: [],
    altitudeDensityHigh: [],
    altitudeDensityLow: [],
    compressorDensity: [],
    engineTorqueState: [],
    fuelControlMode: [],
    mainInjDuration: [],
    calcLoad: [],
    outputShaftRpm: [],
    turbineRpm: [],
    transLinePressureDesired: [],
    transLinePressureActual: [],
    transLinePressureDC: [],
    driverDemandTorque: [],
    actualEngineTorque: [],
    post3Qty: [],
    post4Qty: [],
    fileFormat: 'hptuners', // Use hptuners format for downstream compatibility
  };
}

/**
 * Parse HP Tuners CSV format
 */
function parseHPTunersCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());

  // ── Header row detection ──────────────────────────────────────────────────
  // HP Tuners logs have a metadata block at the top before the column headers.
  // The header row contains 'Offset' (time column) and an RPM-related column.
  // We look for 'Offset' + ('Engine RPM' OR 'Mass Airflow' OR 'RPM') to be flexible.
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const l = lines[i];
    if (l.includes('Offset') && (l.includes('Engine RPM') || l.includes('Mass Airflow') || l.includes('RPM'))) {
      headerIndex = i;
      break;
    }
  }
  // Fallback: find the first row with 10+ comma-separated fields that starts with 'Offset'
  if (headerIndex === -1) {
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const parts = lines[i].split(',');
      if (parts.length > 10 && parts[0].trim() === 'Offset') {
        headerIndex = i;
        break;
      }
    }
  }

  if (headerIndex === -1) {
    throw new Error('Could not find CSV header in HP Tuners log file');
  }

  const headers = lines[headerIndex].split(',').map(h => h.trim());

  // ── Column index helper — exact match first, then substring ──────────────
  const getColumnIndex = (keywords: string[]): number => {
    // Exact match pass
    for (const keyword of keywords) {
      const idx = headers.findIndex(h => h === keyword);
      if (idx !== -1) return idx;
    }
    // Substring match pass
    for (const keyword of keywords) {
      const idx = headers.findIndex(h => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // ── Column mapping ────────────────────────────────────────────────────────
  const offsetIdx = getColumnIndex(['Offset']);
  const rpmIdx    = getColumnIndex(['Engine RPM (SAE)', 'Engine RPM', 'RPM']);

  // MAF: prefer the SAE lb/min channel; avoid raw Hz frequency channels
  // 'Mass Airflow (SAE)' = lb/min (correct)
  // 'Mass Airflow Sensor' = Hz (wrong — raw sensor frequency)
  const mafIdx = (() => {
    // Priority 1: exact SAE lb/min channel
    const sae = headers.findIndex(h => h === 'Mass Airflow (SAE)');
    if (sae !== -1) return sae;
    // Priority 2: any column with 'Mass Airflow' that is NOT 'Sensor' (Hz)
    const nonSensor = headers.findIndex(h => h.includes('Mass Airflow') && !h.includes('Sensor'));
    if (nonSensor !== -1) return nonSensor;
    // Priority 3: fallback to any Mass Airflow column
    return headers.findIndex(h => h.includes('Mass Airflow'));
  })();

  // Boost actual: prefer direct gauge psi channels
  // 'Boost/Vacuum' = gauge psi (HP Tuners full-description export)
  // 'Boost Pressure' = gauge psi (HP Tuners short-name export)
  const boostGaugePsigIdx = getColumnIndex(['Boost/Vacuum', 'Boost Pressure', 'Boost (psi)', 'Boost Gauge']);

  // MAP absolute: used as fallback when no direct boost gauge channel exists
  // Prefer Hi-Res A/B channel, then standard SAE MAP.
  // IMPORTANT: Some logs include a Hi-Res column in the header but leave it empty.
  // We must verify the column actually has numeric data before selecting it.
  const boostIdx = (() => {
    // Helper: check if a column index has at least one non-empty numeric value
    // in the first few data rows after the header.
    const colHasData = (colIdx: number): boolean => {
      if (colIdx === -1) return false;
      // Find the first data row (skip units row / blanks)
      let sampleStart = headerIndex + 1;
      for (let s = headerIndex + 1; s < Math.min(headerIndex + 6, lines.length); s++) {
        const fv = parseFloat(lines[s].split(',')[0]);
        if (!isNaN(fv)) { sampleStart = s; break; }
      }
      // Check up to 5 data rows for a non-empty numeric value
      for (let s = sampleStart; s < Math.min(sampleStart + 5, lines.length); s++) {
        const cols = lines[s].split(',');
        if (colIdx < cols.length) {
          const val = cols[colIdx].trim();
          if (val !== '' && !isNaN(parseFloat(val))) return true;
        }
      }
      return false;
    };

    const hiResA = headers.findIndex(h => h === 'Intake Manifold Absolute Pressure A (SAE) (Hi Res)');
    if (hiResA !== -1 && colHasData(hiResA)) return hiResA;
    // L5P logs use "B" variant for the high-resolution MAP channel
    const hiResB = headers.findIndex(h => h === 'Intake Manifold Absolute Pressure B (SAE) (Hi Res)');
    if (hiResB !== -1 && colHasData(hiResB)) return hiResB;
    // Generic Hi-Res fallback (any variant letter)
    const hiResAny = headers.findIndex(h => h.includes('Intake Manifold Absolute Pressure') && h.includes('Hi Res'));
    if (hiResAny !== -1 && colHasData(hiResAny)) return hiResAny;
    const sae = headers.findIndex(h => h === 'Intake Manifold Absolute Pressure (SAE)');
    if (sae !== -1) return sae;
    // IMPORTANT: Exclude exhaust-side pressure columns ("Exhaust MAP", "Exhaust Manifold Absolute Pressure")
    // which are backpressure, NOT intake boost. Only match intake-side MAP.
    const isExhaust = (h: string) => /exhaust/i.test(h);
    const intakeMap = headers.findIndex(h => h.includes('Intake Manifold Absolute Pressure') && !isExhaust(h));
    if (intakeMap !== -1) return intakeMap;
    // Generic 'MAP' fallback -- but NEVER match exhaust headers
    return headers.findIndex(h => h.includes('MAP') && !isExhaust(h));
  })();

  const torqueIdx         = getColumnIndex(['Actual Engine Torque (SAE)', 'Actual Engine Torque']);
  const maxTorqueIdx      = getColumnIndex(['Maximum Engine Torque']);
  const speedIdx          = getColumnIndex(['Vehicle Speed (SAE)', 'Vehicle Speed']);
  const fuelRateIdx       = getColumnIndex(['Engine Fuel Rate (SAE)', 'Engine Fuel Rate']);
  const railActualIdx     = getColumnIndex(['Fuel Rail Pressure (SAE)', 'Fuel Rail Pressure', 'Fuel Pressure (SAE)']);
  const railDesiredIdx    = getColumnIndex(['Desired Fuel Pressure']);
  const pcvIdx            = getColumnIndex(['PCV', 'Pressure Regulator', 'High Pressure Fuel Pump Hold DC']);
  const boostDesiredIdx   = getColumnIndex(['Desired Boost']);
  const turboVaneIdx      = getColumnIndex(['Turbo A Vane Position (SAE)', 'Turbo Vane Position', 'Turbo A Vane Position']);
  const turboVaneDesiredIdx = getColumnIndex(['Desired Turbo Vane Position', 'Commanded Turbo A Vane Position (SAE)', 'Turbo Vane Desired', 'Turbo A Vane Desired']);
  // EGT: scan ALL EGT-matching columns and pick the one with the highest peak reading
  // HP Tuners may log B1S1, B1S2, B1S3, etc. — use the hottest one for diagnostics
  const egtIdx = (() => {
    const egtCandidates = headers
      .map((h, i) => ({ header: h, idx: i }))
      .filter(({ header }) => /Exhaust Gas Temp|\bEGT\b/i.test(header));
    if (egtCandidates.length === 0) return -1;
    if (egtCandidates.length === 1) return egtCandidates[0].idx;
    // Parse data rows to find which EGT column has the highest peak
    // Use headerIndex + 2 as a safe data start (skip header + potential units row)
    const egtScanStart = headerIndex + 2;
    let bestIdx = egtCandidates[0].idx;
    let bestPeak = -Infinity;
    for (const { idx } of egtCandidates) {
      let peak = 0;
      for (let r = egtScanStart; r < lines.length; r++) {
        if (!lines[r]) continue;
        const val = parseFloat(lines[r].split(',')[idx]?.trim());
        if (!isNaN(val) && val > peak) peak = val;
      }
      if (peak > bestPeak) { bestPeak = peak; bestIdx = idx; }
    }
    return bestIdx;
  })();
  // TCC Slip: 'TCC Slip' (HP Tuners full-description) or legacy names
  const converterSlipIdx  = getColumnIndex(['TCC Slip', 'Converter Slip', 'TCM.TCSLIP']);
  const converterDutyIdx  = getColumnIndex(['Converter Duty', 'Converter PWM']);
  // TCC State Commanded: L5P uses text values like 'CeTCCC_ControlledOn', 'CeTCCC_ImmediateOff'
  // We derive a synthetic duty cycle from this when no numeric duty column exists
  const tccStateIdx = getColumnIndex(['TCC State Commanded']);
  const converterPressureIdx = getColumnIndex(['TCC Line Pressure', 'Converter Pressure', 'TCC Pressure']);
  const currentGearIdx = getColumnIndex(['Trans Current Gear', 'Current Gear', 'Gear', 'Transmission Gear']);
  const oilPressureIdx    = getColumnIndex(['Engine Oil Pressure', 'Oil Pressure']);
  const coolantTempIdx    = getColumnIndex(['Engine Coolant Temp (SAE)', 'Engine Coolant Temp', 'Coolant Temperature', 'ECT']);
  const oilTempIdx        = getColumnIndex(['Engine Oil Temp', 'Oil Temperature', 'EOT']);
  const transFluidTempIdx = getColumnIndex(['Trans Fluid Temp', 'Transmission Fluid Temp', 'Trans Temp']);
  const baroIdx           = getColumnIndex(['Barometric Pressure (SAE)', 'Barometric Pressure', 'Baro Pressure', 'Ambient Pressure']);
  const throttleIdx       = getColumnIndex(['Accelerator Position D (SAE)', 'Accelerator Pedal Position', 'Throttle Position', 'Pedal Position', 'APP', 'Accel Pedal']);
  const injPulseWidthIdx  = getColumnIndex(['Injector Pulse Width', 'Inj Pulse Width', 'Fuel Pulse Width', 'Injector PW', 'INJPW', 'Fuel Injection Pulse Width']);
  const injTimingIdx      = getColumnIndex(['Injection Timing', 'Timing Advance', 'SOI', 'Start of Injection', 'Injection Angle', 'Fuel Timing']);
  const iatIdx            = getColumnIndex(['Intake Air Temp (SAE)', 'Intake Air Temp', 'Intake Air Temperature', 'IAT', 'Charge Air Temp', 'Charge Air Temperature']);
  const fuelQuantityIdx   = getColumnIndex(['Fuel Mass Desired', 'Main Fuel Rate', 'Injection Quantity All', 'Fuel Quantity', 'Cylinder Fuel Rate']);

  // ── Exhaust Backpressure / Exhaust MAP (Ford Powerstroke, etc.) ──────────
  // These are EXHAUST SIDE pressures — NOT intake boost. Must be differentiated.
  const exhaustBackpressureIdx = getColumnIndex(['Exhaust Backpressure', 'Exhaust Back Pressure', 'Exhaust Pressure']);
  const exhaustMapIdx          = getColumnIndex(['Exhaust MAP', 'Exhaust Manifold Absolute Pressure']);

  // ── Absolute Load fallback for throttle ──────────────────────────────────
  // Ford Powerstroke "Accelerator Pedal Position" may read 0% even under load.
  // Use Absolute Load (SAE) as a fallback indicator of engine load.
  const absoluteLoadIdx = getColumnIndex(['Absolute Load (SAE)', 'Absolute Load', 'Calculated Load', 'Engine Load']);

  if (rpmIdx === -1 || mafIdx === -1) {
    throw new Error('Missing required columns: RPM or MAF');
  }

  // ── Data start: skip units row, blank lines, and section markers ──────────
  // After the header row there may be: units row, blank line, '[Channel Data]' marker.
  // Scan forward from headerIndex+1 to find the first row that looks like numeric data.
  // Also capture the units row for metric-to-imperial conversion.
  let dataStart = headerIndex + 1;
  let hptUnits: string[] = [];
  for (let i = headerIndex + 1; i < Math.min(headerIndex + 6, lines.length); i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const firstVal = parseFloat(cols[0]);
    if (!isNaN(firstVal)) {
      dataStart = i;
      break;
    }
    // Units row: contains unit strings like 's', 'rpm', '°F', 'L/h', 'kPa', etc.
    // Heuristic: row has at least 3 cols and contains known unit strings
    if (cols.length >= 3 && cols.some(c => /^(s|rpm|%|°[FC]|psi|kPa|mph|km\/h|lb\/min|g\/s|L\/h|V|ms|lb·ft|Nm|gal|mi)$/i.test(c))) {
      hptUnits = cols.map(c => c.toLowerCase());
    }
  }

  // Build per-column metric→imperial converters from the HP Tuners units row.
  // Most HP Tuners logs are already in imperial, but some columns may be metric
  // (e.g., Engine Fuel Rate in L/h, temps in °C, pressures in kPa).
  const hptConverters: Record<number, (v: number) => number> = {};
  if (hptUnits.length > 0) {
    for (let i = 0; i < hptUnits.length; i++) {
      const u = hptUnits[i];
      if (u === '°c' || u === 'c' || u === 'celsius') {
        hptConverters[i] = (v: number) => v <= -40 ? 0 : (v * 9 / 5) + 32;
      } else if (u === 'km/h' || u === 'kph') {
        hptConverters[i] = (v: number) => v * 0.621371;
      } else if (u === 'g/s') {
        hptConverters[i] = (v: number) => v * 0.132277;
      } else if (u === 'l/h' || u === 'lph') {
        hptConverters[i] = (v: number) => v * 0.264172;
      } else if (u === 'kpa') {
        hptConverters[i] = (v: number) => v * 0.145038;
      } else if (u === 'bar') {
        hptConverters[i] = (v: number) => v * 14.5038;
      } else if (u === 'nm' || u === 'n·m') {
        hptConverters[i] = (v: number) => v * 0.737562;
      } else if (u === 'kg/h') {
        hptConverters[i] = (v: number) => v * 0.03674;
      }
    }
  }

  // Helper: apply HP Tuners unit conversion for a column index
  const hptConvert = (idx: number, v: number): number => {
    const conv = hptConverters[idx];
    return conv ? conv(v) : v;
  };
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const throttlePosition: number[] = [];
  const injectorPulseWidth: number[] = [];
  const injectionTiming: number[] = [];
  const intakeAirTemp: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const turboVaneDesired: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const currentGear: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  const barometricPressure: number[] = [];
  
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('[')) break;
    
    // Keep raw string values for text columns (gear, TCC state)
    const rawCols = line.split(',').map(v => v.trim());
    const values = rawCols.map(v => {
      const num = parseFloat(v);
      return isNaN(num) ? 0 : num;
    });
    
    if (values.length < Math.max(rpmIdx, mafIdx, torqueIdx) + 1) continue;
    
    const baroVal = baroIdx !== -1 ? hptConvert(baroIdx, values[baroIdx] || 14.7) : 14.7;
    const mapPsia = boostIdx !== -1 ? hptConvert(boostIdx, values[boostIdx]) : 0;
    
    rpm.push(values[rpmIdx] || 0);
    maf.push(hptConvert(mafIdx, values[mafIdx] || 0));
    // HP Tuners MAP — hptConvert handles kPa→psi if units row says kPa
    mapAbsolute.push(mapPsia);
    // If a direct gauge boost PID exists, use it; otherwise MAP - baro = gauge
    if (boostGaugePsigIdx !== -1) {
      boost.push(Math.max(0, hptConvert(boostGaugePsigIdx, values[boostGaugePsigIdx])));
    } else if (boostIdx !== -1) {
      boost.push(Math.max(0, mapPsia - baroVal));
    } else {
      boost.push(0);
    }
    torquePercent.push(values[torqueIdx] || 0);
    maxTorque.push(maxTorqueIdx !== -1 ? hptConvert(maxTorqueIdx, values[maxTorqueIdx]) : 879.174);
    vehicleSpeed.push(speedIdx !== -1 ? hptConvert(speedIdx, values[speedIdx]) : 0);
    fuelRate.push(fuelRateIdx !== -1 ? hptConvert(fuelRateIdx, values[fuelRateIdx]) : 0);
    offset.push(offsetIdx !== -1 ? values[offsetIdx] : i - dataStart);
    railPressureActual.push(railActualIdx !== -1 ? hptConvert(railActualIdx, values[railActualIdx]) : 0);
    railPressureDesired.push(railDesiredIdx !== -1 ? hptConvert(railDesiredIdx, values[railDesiredIdx]) : 0);
    pcvDutyCycle.push(pcvIdx !== -1 ? values[pcvIdx] : 0);
    boostDesired.push(boostDesiredIdx !== -1 ? hptConvert(boostDesiredIdx, values[boostDesiredIdx]) : 0);
    turboVanePosition.push(turboVaneIdx !== -1 ? values[turboVaneIdx] : 0);
    turboVaneDesired.push(turboVaneDesiredIdx !== -1 ? values[turboVaneDesiredIdx] : 0);
    exhaustGasTemp.push(egtIdx !== -1 ? hptConvert(egtIdx, values[egtIdx]) : 0);
    converterSlip.push(converterSlipIdx !== -1 ? values[converterSlipIdx] : 0);
    // Converter duty: prefer numeric column; fall back to TCC State text -> synthetic duty
    if (converterDutyIdx !== -1) {
      converterDutyCycle.push(values[converterDutyIdx]);
    } else if (tccStateIdx !== -1 && tccStateIdx < rawCols.length) {
      const tccState = rawCols[tccStateIdx].toLowerCase();
      if (tccState.includes('controlledon')) {
        converterDutyCycle.push(100);
      } else if (tccState.includes('controlledhyst')) {
        converterDutyCycle.push(75);
      } else if (tccState.includes('controlledoff')) {
        converterDutyCycle.push(25);
      } else if (tccState.includes('immediateoff')) {
        converterDutyCycle.push(0);
      } else {
        converterDutyCycle.push(0);
      }
    } else {
      converterDutyCycle.push(0);
    }
    converterPressure.push(converterPressureIdx !== -1 ? values[converterPressureIdx] : 0);
    // Gear: prefer numeric value; fall back to parsing text like '2nd Gear', '3rd Gear'
    if (currentGearIdx !== -1) {
      let gearVal = values[currentGearIdx];
      if (gearVal === 0 && currentGearIdx < rawCols.length) {
        const gearText = rawCols[currentGearIdx];
        const gearMatch = gearText.match(/(\d+)/);
        if (gearMatch) gearVal = parseInt(gearMatch[1], 10);
      }
      currentGear.push(gearVal);
    } else {
      currentGear.push(0);
    }
    oilPressure.push(oilPressureIdx !== -1 ? hptConvert(oilPressureIdx, values[oilPressureIdx]) : 0);
    coolantTemp.push(coolantTempIdx !== -1 ? hptConvert(coolantTempIdx, values[coolantTempIdx]) : 0);
    oilTemp.push(oilTempIdx !== -1 ? hptConvert(oilTempIdx, values[oilTempIdx]) : 0);
    transFluidTemp.push(transFluidTempIdx !== -1 ? hptConvert(transFluidTempIdx, values[transFluidTempIdx]) : 0);
    barometricPressure.push(baroVal);
    // Throttle: use Accelerator Pedal Position; if it reads 0 but Absolute Load > 50%,
    // the pedal PID is likely broken (common on Ford Powerstroke). Use Absolute Load as proxy.
    let throttleVal = throttleIdx !== -1 ? values[throttleIdx] : 0;
    throttlePosition.push(throttleVal);
    injectorPulseWidth.push(injPulseWidthIdx !== -1 ? hptConvert(injPulseWidthIdx, values[injPulseWidthIdx]) : 0);
    injectionTiming.push(injTimingIdx !== -1 ? hptConvert(injTimingIdx, values[injTimingIdx]) : 0);
    intakeAirTemp.push(iatIdx !== -1 ? hptConvert(iatIdx, values[iatIdx]) : 0);
  }

  // Fuel quantity: parse from Fuel Mass Desired (mg) or Main Fuel Rate (mm3)
  // HP Tuners hptConvert handles unit conversion if needed
  const fuelQuantity: number[] = [];
  if (fuelQuantityIdx !== -1) {
    // Re-parse from the data to get fuel quantity values
    for (let i = dataStart; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('[')) break;
      const values = line.split(',').map(v => { const n = parseFloat(v.trim()); return isNaN(n) ? 0 : n; });
      if (values.length < Math.max(rpmIdx, mafIdx, torqueIdx) + 1) continue;
      fuelQuantity.push(hptConvert(fuelQuantityIdx, values[fuelQuantityIdx]));
    }
  }
  // Ensure fuelQuantity matches rpm length
  while (fuelQuantity.length < rpm.length) fuelQuantity.push(0);
  if (fuelQuantity.length > rpm.length) fuelQuantity.length = rpm.length;
  
  if (rpm.length === 0) {
    throw new Error('No valid data rows found in CSV');
  }
  
  const duration = offset[offset.length - 1] - offset[0];

  // ── Exhaust Backpressure: parse from dedicated exhaust columns ─────────────
  // Ford Powerstroke logs have "Exhaust Backpressure" and "Exhaust MAP" which are
  // EXHAUST SIDE pressures, NOT intake boost. Parse them into exhaustPressure[].
  const exhaustPressure: number[] = [];
  if (exhaustBackpressureIdx !== -1 || exhaustMapIdx !== -1) {
    const exhIdx = exhaustBackpressureIdx !== -1 ? exhaustBackpressureIdx : exhaustMapIdx;
    for (let i = dataStart; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('[')) break;
      const values = line.split(',').map(v => { const n = parseFloat(v.trim()); return isNaN(n) ? 0 : n; });
      if (values.length < Math.max(rpmIdx, mafIdx, torqueIdx) + 1) continue;
      exhaustPressure.push(hptConvert(exhIdx, values[exhIdx]));
    }
  }
  // Ensure exhaustPressure matches rpm length
  while (exhaustPressure.length < rpm.length) exhaustPressure.push(0);
  if (exhaustPressure.length > rpm.length) exhaustPressure.length = rpm.length;

  // ── Throttle fallback: if pedal position is always near 0 but Absolute Load
  // shows significant values, the pedal PID is broken. Use Absolute Load as proxy.
  const maxThrottle = Math.max(...throttlePosition);
  const pidSubstitutions: import('./pidSubstitution').PidSubstitution[] = [];
  if (maxThrottle < 5 && absoluteLoadIdx !== -1) {
    // Check if Absolute Load has meaningful variation
    // Re-parse Absolute Load values
    const absLoadValues: number[] = [];
    let parseIdx = 0;
    for (let i = dataStart; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('[')) break;
      const values = line.split(',').map(v => { const n = parseFloat(v.trim()); return isNaN(n) ? 0 : n; });
      if (values.length < Math.max(rpmIdx, mafIdx, torqueIdx) + 1) continue;
      absLoadValues.push(values[absoluteLoadIdx]);
      parseIdx++;
    }
    const maxAbsLoad = Math.max(...absLoadValues);
    if (maxAbsLoad > 50) {
      // Absolute Load has meaningful data — use it as throttle proxy
      // Scale: Absolute Load 0-200% → Throttle 0-100%
      for (let k = 0; k < Math.min(absLoadValues.length, throttlePosition.length); k++) {
        throttlePosition[k] = Math.min(100, absLoadValues[k] / 2);
      }
      pidSubstitutions.push({
        channel: 'Throttle Position',
        primaryAttempted: 'Accelerator Pedal Position',
        usedPid: 'Absolute Load (SAE)',
        transform: 'Absolute Load 0-200% scaled to Throttle 0-100% (value / 2)',
        reason: 'Accelerator Pedal Position PID reads 0% throughout the log. Absolute Load used as proxy.',
        confidence: 'medium',
      });
    }
  }

  // Determine boost source for HP Tuners
  const hpBoostSource: DuramaxData['boostSource'] =
    boostGaugePsigIdx !== -1 ? 'direct' :
    boostIdx !== -1 ? 'map_derived' : 'none';
  
  return {
    rpm,
    maf,
    boost,
    mapAbsolute,
    throttlePosition,
    injectorPulseWidth,
    injectionTiming,
    intakeAirTemp,
    torquePercent,
    maxTorque,
    vehicleSpeed,
    fuelRate,
    offset,
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    turboVaneDesired,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    currentGear,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    fuelQuantity,
    boostSource: hpBoostSource,
    // HP Tuners: boost is direct or MAP-derived; actual is available if any non-zero values exist
    boostActualAvailable: boost.some(v => v > 0),
    pidSubstitutions,
    pidsMissing: [],
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
    // Exhaust pressure parsed from Exhaust Backpressure / Exhaust MAP columns (Ford, etc.)
    turboSpeed: [],
    exhaustPressure,
    batteryVoltage: [],
    dpfSootLevel: [],
    egrPosition: [],
    egrTemp: [],
    intakeThrottlePosition: [],
    intakeManifoldTemp: [],
    chargeCoolerTemp: [],
    pilot1Qty: [],
    pilot2Qty: [],
    pilot1Timing: [],
    pilot2Timing: [],
    post1Qty: [],
    post2Qty: [],
    post1Timing: [],
    post2Timing: [],
    regenState: [],
    cspTuneNumber: [],
    fuelRegCurrent: [],
    egt2: [],
    egt3: [],
    egt4: [],
    egt5: [],
    altitudeDensityHigh: [],
    altitudeDensityLow: [],
    compressorDensity: [],
    engineTorqueState: [],
    fuelControlMode: [],
    mainInjDuration: [],
    calcLoad: [],
    outputShaftRpm: [],
    turbineRpm: [],
    transLinePressureDesired: [],
    transLinePressureActual: [],
    transLinePressureDC: [],
    driverDemandTorque: [],
    actualEngineTorque: [],
    post3Qty: [],
    post4Qty: [],
    fileFormat: 'hptuners',
  };
}

/**
 * Parse EFILIVE CSV format
 *
 * EFILive exports have a 3-row header:
 *   Row 0: PID codes  (e.g. "ECM.RPM", "TCM.TCCSLIP")  ← authoritative
 *   Row 1: Descriptions (human-readable labels)          ← informational
 *   Row 2: Units       (e.g. "rpm", "kPa")               ← informational
 *   Row 3+: Data rows
 *
 * IMPORTANT: The description row (row 1) is offset by 3 columns from the PID
 * row because EFILive inserts Frame/Time/Flags as the first 3 columns with no
 * description. Always use PID codes (row 0) for column mapping, never descriptions.
 */
function parseEFILiveCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());

  if (lines.length < 4) {
    throw new Error('Invalid EFILive CSV: expected at least 4 rows (PID codes, descriptions, units, data)');
  }

  // Row 0 = PID codes (authoritative column identifiers)
  const pidHeaders = lines[0].split(',').map(h => h.trim());
  // Row 2 = Units row (e.g. "rpm", "kPa", "MPa", "us", "°C") — used for smart conversions
  const unitsRow = lines[2] ? lines[2].split(',').map(u => u.trim().toLowerCase()) : [];

  // Detect LB7/LLY prefix: older Duramax EFILive logs use PCM.* instead of ECM.*
  const isLB7Style = pidHeaders.some(h => h.startsWith('PCM.'));
  // Detect Cummins 6.7L: uses _F suffix PIDs (ECM.RPM_F, ECM.BOOSTG_F, etc.)
  const isCummins = pidHeaders.some(h => /^ECM\.[A-Z]+_F$/.test(h));

  /**
   * Find column index by exact PID code match first, then fallback to substring.
   * This prevents false matches (e.g. "ECM.EGTS1" matching "ECM.EGTS").
   */
  const getColumnIndex = (candidates: string[]): number => {
    for (const candidate of candidates) {
      // Exact match first
      const exact = pidHeaders.indexOf(candidate);
      if (exact !== -1) return exact;
    }
    for (const candidate of candidates) {
      // Substring fallback
      const sub = pidHeaders.findIndex(h => h.includes(candidate));
      if (sub !== -1) return sub;
    }
    return -1;
  };

  /** Get the unit string for a column index from the units row */
  const getUnit = (idx: number): string => {
    if (idx < 0 || idx >= unitsRow.length) return '';
    return unitsRow[idx];
  };

  // ── Core engine PIDs ──────────────────────────────────────────────────────
  // Each lookup includes both ECM.* (LML/L5P) and PCM.* (LB7/LLY) variants
  // Some EFILive logs (e.g. diagnostic state dumps) may not include ECM.RPM or ECM.MAF.
  // We fall back to related PIDs and treat missing channels as optional.
  const timeIdx          = getColumnIndex(['Time']);
  const rpmIdx           = (() => {
    const primary = getColumnIndex(['ECM.RPM', 'PCM.RPM', 'ECM.RPM_F']);
    if (primary !== -1) return primary;
    // Fallback: ECM.IDLERPM (desired idle speed) or ECM.TOS (trans output speed)
    // These aren't true engine RPM but allow partial analysis
    return getColumnIndex(['ECM.IDLERPM', 'ECM.TOS']);
  })();
  const rpmIsFallback    = getColumnIndex(['ECM.RPM', 'PCM.RPM', 'ECM.RPM_F']) === -1 && rpmIdx !== -1;
  const mafIdx           = getColumnIndex(['ECM.MAF', 'PCM.MAF', 'ECM.MAF_CM_F']);
  // MAP / Boost: LML uses ECM.MAP; LB7 uses PCM.BOOST_M (kPa absolute)
  const mapIdx           = getColumnIndex(['ECM.MAP', 'PCM.BOOST_M', 'PCM.MAP', 'ECM.BOOSTG_F']);
  // Boost desired: LML uses ECM.TCDBPR; LB7 may not have a direct desired boost PID
  const boostDesiredIdx  = getColumnIndex(['ECM.TCDBPR', 'ECM.DESTQ', 'ECM.MAPDES', 'PCM.MAPDES']);
  // Cummins: exhaust back pressure (kPa) — unique to Cummins platform
  const exhaustPressureIdx = getColumnIndex(['ECM.EXHPRS_F']);
  // Cummins: turbo shaft speed (rpm) — unique to Cummins platform
  const turboSpeedIdx      = getColumnIndex(['ECM.TURBOSPD_F']);
  // Cummins: compressor inlet density and pressure
  const compressorDensityIdx  = getColumnIndex(['ECM.CMPDENS_F']);
  const compressorPressureIdx = getColumnIndex(['ECM.CMPPRS_F']);
  // Cummins: fuel pressure regulator current (A)
  const fuelRegCurrentIdx     = getColumnIndex(['ECM.FRCURR_F']);
  // Cummins: intake manifold temp (separate from IAT/CAT)
  const intakeManifoldTempIdx = getColumnIndex(['ECM.INTMT_F']);
  // Cummins: charge cooler (intercooler) outlet temp
  const chargeCoolerTempIdx   = getColumnIndex(['ECM.CACT_F']);
  // Cummins: pilot injection quantities and timing
  const pilot1QtyIdx   = getColumnIndex(['ECM.PILINJ1Q_F']);
  const pilot2QtyIdx   = getColumnIndex(['ECM.PILINJ2Q_F']);
  const pilot1TimIdx   = getColumnIndex(['ECM.PILINJ1T_F']);
  const pilot2TimIdx   = getColumnIndex(['ECM.PILINJ2T_F']);
  // Cummins: post injection quantities and timing
  const post1QtyIdx    = getColumnIndex(['ECM.POSTINJ1Q_F']);
  const post2QtyIdx    = getColumnIndex(['ECM.POSTINJ2Q_F']);
  const post1TimIdx    = getColumnIndex(['ECM.POSTINJ1T_F']);
  const post2TimIdx    = getColumnIndex(['ECM.POSTINJ2T_F']);
  // Cummins: regen state, fuel control, SCR pump, CSP tune number
  const regenStateIdx  = getColumnIndex(['ECM.REGENST_F']);
  const cspTuneIdx     = getColumnIndex(['ECM.CSPTUN_F']);
  // Cummins: battery voltage
  const batteryVoltageIdx = getColumnIndex(['ECM.BATTV_F']);
  // Cummins: DPF soot level (g)
  const dpfSootIdx        = getColumnIndex(['ECM.DPFSOOT_F']);
  // Cummins: EGR position (%) and EGR temperature
  const egrPositionIdx    = getColumnIndex(['ECM.EGRPOS_F']);
  const egrTempIdx        = getColumnIndex(['ECM.EGRT_F']);
  // Cummins: intake throttle position (separate from pedal/APP)
  const intakeThrottleIdx = getColumnIndex(['ECM.INTTHR_F']);
  // Cummins: post injection 3 & 4 (2014 Ram has 4 post events)
  const post3QtyIdx       = getColumnIndex(['ECM.POSTINJ3Q_F']);
  const post4QtyIdx       = getColumnIndex(['ECM.POSTINJ4Q_F']);
  // Cummins: individual EGT probes 2-5 (probe 1 is the primary egtIdx above)
  const egt2Idx = getColumnIndex(['ECM.EGT2_F', 'ECM.EGTS2']);
  const egt3Idx = getColumnIndex(['ECM.EGT3_F', 'ECM.EGTS3']);
  const egt4Idx = getColumnIndex(['ECM.EGT4_F', 'ECM.EGTS4']);
  const egt5Idx = getColumnIndex(['ECM.EGT5_F', 'ECM.EGTS5']);
  // Cummins: altitude density table selects
  const altDensHighIdx = getColumnIndex(['ECM.AIRDENH_F', 'ECM.AIRDENSC_F']);
  const altDensLowIdx  = getColumnIndex(['ECM.AIRDENL_F']);
  // Cummins: engine torque control state & fuel control mode
  const engTorqueStateIdx = getColumnIndex(['ECM.ENGTRST_F']);
  const fuelControlModeIdx = getColumnIndex(['ECM.FUELCTRL_F']);
  // Cummins: main injection duration (µs) — distinct from pulse width
  const mainInjDurationIdx = getColumnIndex(['ECM.MAININJD_F']);
  // Cummins: calculated load (%)
  const calcLoadIdx = getColumnIndex(['ECM.CALCLOAD_F', 'ECM.LOAD_F']);
  // Cummins/GM: output shaft RPM
  const outputShaftRpmIdx = getColumnIndex(['TCM.OSS', 'ECM.TOS', 'TCM.TOSS']);
  // Cummins/GM: trans line pressure
  const transLinePressDesIdx = getColumnIndex(['TCM.LINEPRS_D', 'TCM.LINEPRSD']);
  const transLinePressActIdx = getColumnIndex(['TCM.LINEPRS_A', 'TCM.LINEPRSA']);
  const transLinePressureDCIdx = getColumnIndex(['TCM.LINEPRSDC']);
  // Cummins: driver demand torque (%) and actual engine torque (%)
  const driverDemandTorqueIdx = getColumnIndex(['ECM.DRVDEMTQ_F', 'ECM.DRVDEMTQ']);
  const actualEngineTorqueIdx = getColumnIndex(['ECM.ACTTRQ_F', 'ECM.ACTTRQ']);
  // Torque: LML logs ECM.TQ_DD / ECM.TQ_ACT; LB7 uses TCM.TRQENG_B (Nm)
  const torqueIdx        = getColumnIndex(['ECM.TQ_ACT', 'ECM.TQ_DD', 'TCM.TRQENG_B', 'PCM.TQ_ACT', 'ECM.ENGTRQA_F']);
  const maxTorqueIdx     = getColumnIndex(['ECM.TQ_REF', 'PCM.TQ_REF', 'ECM.ENGTRQD_F']);
  const speedIdx         = getColumnIndex(['ECM.VSS', 'PCM.VSS', 'ECM.VSS_F']);
  const fuelRateIdx      = getColumnIndex(['ECM.FUEL_RATE', 'ECM.FUELRCALC', 'PCM.FUEL_RATE']);

  // ── Fuel rail PIDs ────────────────────────────────────────────────────────
  // LB7: PCM.FRPACT (MPa), PCM.FRP_C (kPa), PCM.FRPDES (MPa)
  // LML/L5P: ECM.FRP_A (kPa), ECM.FRPDI (kPa)
  const railActualIdx    = getColumnIndex(['ECM.FRP_A', 'PCM.FRPACT', 'PCM.FRP_C', 'ECM.FPA_F']);
  const railDesiredIdx   = getColumnIndex(['ECM.FRPDI', 'PCM.FRPDES', 'ECM.FPD_F']);
  // PCV desired current (mA) — what the ECM commands the PCV solenoid
  // LB7: PCM.FRPACOM (mA)
  const pcvIdx           = getColumnIndex(['ECM.FRPVDC', 'PCM.FRPACOM']);
  // PCV measured current (mA) — actual solenoid feedback
  const pcvMeasIdx       = getColumnIndex(['ECM.FRPVAC', 'PCM.FRPVAC']);

  // ── Turbo / VGT PIDs ─────────────────────────────────────────────────────
  // LB7 has a fixed-geometry turbo (no VGT) — these will be -1 for LB7 logs
  const turboVaneIdx         = getColumnIndex(['ECM.TCVPOS', 'PCM.TCVPOS', 'ECM.VGTACT', 'ECM.TURBOAPOS_F']);
  const turboVaneDesiredIdx  = getColumnIndex(['ECM.TCVDES', 'ECM.TCVCMD', 'PCM.TCVDES', 'ECM.VGTCMD2', 'ECM.TURBODPOS_F']);

  // ── EGT PIDs — LML has up to 5 sensors ───────────────────────────────────
  // Scan ALL EGT-matching columns and pick the one with the highest peak reading.
  // LML/L5P may have EGTS1 through EGTS5; LB7 may have PCM.EGT or PCM.EGTS*
  const egtIdx = (() => {
    const egtCandidates = pidHeaders
      .map((h, i) => ({ header: h, idx: i }))
      .filter(({ header }) =>
        /^ECM\.EGTS\d?$/i.test(header) || /^ECM\.EGT$/i.test(header) ||
        /^PCM\.EGTS?\d?$/i.test(header) || /^PCM\.EGT$/i.test(header) ||
        /^ECM\.EGT\d_F$/i.test(header)
      );
    if (egtCandidates.length === 0) return -1;
    if (egtCandidates.length === 1) return egtCandidates[0].idx;
    // Parse data rows (start at row 3) to find which EGT column has the highest peak
    let bestIdx = egtCandidates[0].idx;
    let bestPeak = -Infinity;
    for (const { idx } of egtCandidates) {
      let peak = 0;
      for (let r = 3; r < lines.length; r++) {
        if (!lines[r]) continue;
        const val = parseFloat(lines[r].split(',')[idx]?.trim());
        if (!isNaN(val) && val > peak) peak = val;
      }
      if (peak > bestPeak) { bestPeak = peak; bestIdx = idx; }
    }
    return bestIdx;
  })();

  // ── Transmission / TCC PIDs ───────────────────────────────────────────────
  // TCM.TCCSLIP = actual TCC slip in RPM (the real slip value)
  // TCM.TCSLIP  = TCC reference slip target (what the TCM wants)
  // TCM.TCCPCSCP = TCC PCS commanded pressure (kPa) — 1050 kPa = full lock
  // TCM.TCCP    = TCC commanded pressure (older naming)
  // LB7: TCM.TCCSLIP (same name), TCM.TCCDC (duty cycle %)
  const tccActualSlipIdx   = getColumnIndex(['TCM.TCCSLIP']);
  const tccRefSlipIdx      = getColumnIndex(['TCM.TCSLIP']);
  const tccPcsIdx          = getColumnIndex(['TCM.TCCPCSCP']);
  const tccPressureIdx     = getColumnIndex(['TCM.TCCP']);
  // LB7 TCC duty cycle (%) — direct percentage, not pressure
  const tccDcIdx           = getColumnIndex(['TCM.TCCDC']);
  // Use TCCPCSCP as the primary duty/pressure signal; fall back to TCCP, then TCCDC
  const converterDutyIdx   = tccPcsIdx !== -1 ? tccPcsIdx : (tccPressureIdx !== -1 ? tccPressureIdx : tccDcIdx);
  // Actual slip = TCCSLIP; reference slip = TCSLIP (used as fallback)
  const converterSlipIdx   = tccActualSlipIdx !== -1 ? tccActualSlipIdx : tccRefSlipIdx;
  // LB7 turbine speed: TCM.TURBINE (rpm) — used for converter stall analysis
  const turbineSpeedIdx    = getColumnIndex(['TCM.TURBINE']);
  // Gear: LB7 uses TCM.GEAR with text values ("First", "Second", etc.)
  const currentGearIdx    = getColumnIndex(['TCM.CURGEAR', 'TCM.GEAR', 'TCM.CG', 'TCM.CMDGEAR', 'ECM.TRANSG_F']);

  // ── Other sensor PIDs ────────────────────────────────────────────────────────────────────────
  const oilPressureIdx    = getColumnIndex(['ECM.OILP', 'PCM.OILP', 'ECM.OILPRS_F']);
  const coolantTempIdx    = getColumnIndex(['ECM.ECT', 'PCM.ECT', 'ECM.ECT_F']);
  const oilTempIdx        = getColumnIndex(['ECM.EOT', 'PCM.EOT']);
  const transFluidTempIdx = getColumnIndex(['TCM.TFT']);
  const baroIdx           = getColumnIndex(['ECM.BARO', 'PCM.BARO', 'ECM.AAP_F', 'ECM.CMPPRS_F']);
  const throttleIdx       = getColumnIndex(['ECM.TPS', 'ECM.THROTTLE', 'ECM.APP', 'PCM.TP_A', 'PCM.TPS', 'PCM.APP', 'Accelerator Pedal Position', 'Throttle Position', 'ECM.TP_F']);
  // LB7: PCM.MAINBPW (microseconds); LML/L5P: ECM.INJPW (ms)
  const injPulseWidthIdx  = getColumnIndex(['ECM.INJPW', 'ECM.IPW', 'ECM.INJPW1', 'ECM.FPW', 'PCM.MAINBPW', 'ECM.MAININJD_F']);
  // LB7: PCM.MNINJTIM (degrees)
  const injTimingIdx      = getColumnIndex(['ECM.TIMING', 'ECM.SOI', 'ECM.INJTMG', 'ECM.INJTIMING', 'PCM.MNINJTIM', 'ECM.MAININJT_F']);
  const iatIdx            = getColumnIndex(['ECM.IAT', 'ECM.INTAKEAIRTEMP', 'ECM.CAT', 'PCM.IAT', 'PCM.INTAKEAIRTEMP', 'ECM.AAT_F', 'ECM.CACT_F']);
  // LB7: PCM.FUEL_MAIN_M (mm3)
  const fuelQuantityIdx   = getColumnIndex(['ECM.INJQNTALL', 'Injection Quantity All', 'ECM.FUELQTY', 'Fuel Mass Desired', 'Main Fuel Rate', 'PCM.FUEL_MAIN_M', 'ECM.MAININJQ_F']);

  // ── Validate required columns ────────────────────────────────────────
  // Many EFILive logs are diagnostic state dumps that don't include ECM.RPM or ECM.MAF.
  // We now parse whatever data is available instead of rejecting the file.
  // At minimum we need a Time column or Frame column to sequence the data.
  const hasRpm = rpmIdx !== -1;
  const hasMaf = mafIdx !== -1;

  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const throttlePosition: number[] = [];
  const injectorPulseWidth: number[] = [];
  const injectionTiming: number[] = [];
  const intakeAirTemp: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const turboVaneDesired: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const currentGear: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  const barometricPressure: number[] = [];
  const fuelQuantity: number[] = [];
  // Cummins-specific arrays
  const turboSpeed: number[] = [];
  const exhaustPressure: number[] = [];
  const batteryVoltage: number[] = [];
  const dpfSootLevel: number[] = [];
  const egrPosition: number[] = [];
  const egrTemp: number[] = [];
  const intakeThrottlePosition: number[] = [];
  const intakeManifoldTemp: number[] = [];
  const chargeCoolerTemp: number[] = [];
  const pilot1Qty: number[] = [];
  const pilot2Qty: number[] = [];
  const pilot1Timing: number[] = [];
  const pilot2Timing: number[] = [];
  const post1Qty: number[] = [];
  const post2Qty: number[] = [];
  const post1Timing: number[] = [];
  const post2Timing: number[] = [];
  const regenState: number[] = [];
  const cspTuneNumber: number[] = [];
  const fuelRegCurrent: number[] = [];
  // New Cummins-specific arrays (EGT probes, altitude density, torque state, etc.)
  const egt2: number[] = [];
  const egt3: number[] = [];
  const egt4: number[] = [];
  const egt5: number[] = [];
  const altitudeDensityHigh: number[] = [];
  const altitudeDensityLow: number[] = [];
  const engineTorqueState: number[] = [];
  const fuelControlMode: number[] = [];
  const mainInjDuration: number[] = [];
  const calcLoad: number[] = [];
  const outputShaftRpm: number[] = [];
  const turbineRpm: number[] = [];
  const transLinePressureDesired: number[] = [];
  const transLinePressureActual: number[] = [];
  const transLinePressureDC: number[] = [];
  const driverDemandTorque: number[] = [];
  const actualEngineTorque: number[] = [];
  const post3Qty: number[] = [];
  const post4Qty: number[] = [];
  // EFILive data starts at row 3 (after PID codes, descriptions, units))
  const dataStartRow = 3;

  for (let i = dataStartRow; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const rawCols = line.split(',');

    // Skip non-data rows (description/unit rows that slipped through)
    const firstVal = rawCols[0]?.trim();
    // Frame column is always a non-negative integer; skip if not numeric
    if (firstVal && isNaN(Number(firstVal))) continue;

    /**
     * Smart value parser:
     * - Returns the numeric value for numeric strings
     * - Returns NaN for "N/A", "None", empty, or non-numeric strings
     *   so callers can distinguish "not logged" from a real zero.
     */
    const parseVal = (idx: number): number => {
      if (idx === -1 || idx >= rawCols.length) return NaN;
      const raw = rawCols[idx].trim();
      if (raw === '' || raw === 'N/A' || raw === 'None' || raw === 'N/A\r') return NaN;
      const n = parseFloat(raw);
      return isNaN(n) ? NaN : n;
    };

    const rpmVal = hasRpm ? parseVal(rpmIdx) : NaN;
    if (hasRpm && isNaN(rpmVal)) continue; // skip rows with no RPM data (only if RPM column exists)
    // Skip data glitch rows: RPM=0 with impossible sensor values (key-cycle noise)
    // These occur when the ECM is powering down and sensors report garbage values.
    // Only skip after the first few rows to allow initial idle data through.
    if (hasRpm && rpmVal === 0 && i > dataStartRow + 5) continue;

    rpm.push(hasRpm ? rpmVal : 0);
    // ECM.MAF / PCM.MAF is in g/s — convert to lb/min (imperial) for consistency with HP Tuners
    // 1 g/s = 0.132277 lb/min
    const mafGps = hasMaf ? parseVal(mafIdx) : NaN;
    maf.push(isNaN(mafGps) ? 0 : mafGps * 0.132277);

    // MAP for LML is in kPa absolute; convert to PSIG gauge for consistency with HP Tuners
    // Standard atmosphere = 101.325 kPa; 1 kPa = 0.145038 psi
    const mapKpa = parseVal(mapIdx);
    const baroKpa = isNaN(parseVal(baroIdx)) ? 101.325 : parseVal(baroIdx);
    const mapPsia = isNaN(mapKpa) ? 0 : mapKpa * 0.145038;
    mapAbsolute.push(mapPsia);
    const boostPsig = isNaN(mapKpa) ? 0 : Math.max(0, (mapKpa - baroKpa) * 0.145038);
    boost.push(boostPsig);

    // Boost desired: ECM.TCDBPR is in kPa absolute
    const boostDesKpa = parseVal(boostDesiredIdx);
    const boostDesPsig = isNaN(boostDesKpa) ? 0 : Math.max(0, (boostDesKpa - baroKpa) * 0.145038);
    boostDesired.push(boostDesPsig);

    // Torque: ECM.TQ_ACT / ECM.TQ_DD are in % (0-100)
    // ECM.TQ_REF is the reference torque in Nm — convert to lb-ft for HP calc
    // 1 Nm = 0.737562 lb-ft
    const torqueVal = parseVal(torqueIdx);
    if (!isNaN(torqueVal)) {
      // If value > 200 it's likely Nm, convert to %
      if (torqueVal > 200) {
        torquePercent.push((torqueVal / 1200) * 100);
      } else {
        torquePercent.push(torqueVal);
      }
    } else {
      torquePercent.push(0);
    }
    // ECM.TQ_REF in Nm — convert to lb-ft for HP calculation
    const maxTqNm = parseVal(maxTorqueIdx);
    maxTorque.push(isNaN(maxTqNm) ? 648.5 : maxTqNm * 0.737562); // 879 Nm = 648.5 lb-ft

    // ECM.VSS is in km/h — convert to mph
    const speedKmh = parseVal(speedIdx);
    vehicleSpeed.push(isNaN(speedKmh) ? 0 : speedKmh * 0.621371);
    // ECM.FUEL_RATE is in l/h — convert to gal/hr
    const fuelLph = parseVal(fuelRateIdx);
    fuelRate.push(isNaN(fuelLph) ? 0 : fuelLph * 0.264172);
    // EFILive Time column is in milliseconds — convert to seconds
    const timeMs = parseVal(timeIdx);
    offset.push(isNaN(timeMs) ? i - dataStartRow : timeMs / 1000);

    // Rail pressure: LML/L5P logs in kPa; LB7 logs in MPa (FRPACT/FRPDES) or kPa (FRP_C)
    // Detect unit from the units row or from the PID name
    const railActRaw = parseVal(railActualIdx);
    const railDesRaw = parseVal(railDesiredIdx);
    const railActUnit = getUnit(railActualIdx);
    const railDesUnit = getUnit(railDesiredIdx);
    // MPa → PSI: 1 MPa = 145.038 PSI; kPa → PSI: 1 kPa = 0.145038 PSI
    const railActPsi = isNaN(railActRaw) ? 0 : (
      railActUnit.includes('mpa') || (isLB7Style && pidHeaders[railActualIdx]?.includes('FRPACT'))
        ? railActRaw * 145.038
        : railActRaw * 0.145038
    );
    const railDesPsi = isNaN(railDesRaw) ? 0 : (
      railDesUnit.includes('mpa') || (isLB7Style && pidHeaders[railDesiredIdx]?.includes('FRPDES'))
        ? railDesRaw * 145.038
        : railDesRaw * 0.145038
    );
    railPressureActual.push(railActPsi);
    railPressureDesired.push(railDesPsi);

    // PCV: EFILive logs in mA; store raw mA (diagnostics engine handles unit awareness)
    pcvDutyCycle.push(isNaN(parseVal(pcvIdx)) ? 0 : parseVal(pcvIdx));

    turboVanePosition.push(isNaN(parseVal(turboVaneIdx)) ? 0 : parseVal(turboVaneIdx));
    turboVaneDesired.push(isNaN(parseVal(turboVaneDesiredIdx)) ? 0 : parseVal(turboVaneDesiredIdx));

    // EGT: EFILive logs in °C; convert to °F for consistency with HP Tuners
    const egtC = parseVal(egtIdx);
    exhaustGasTemp.push(isNaN(egtC) || egtC <= -40 ? 0 : (egtC * 9/5) + 32);

    // TCC slip: EFILive TCM.TCCSLIP is in RPM (positive = engine faster than turbine = slipping)
    const slipVal = parseVal(converterSlipIdx);
    converterSlip.push(isNaN(slipVal) ? 0 : slipVal);

    // TCC PCS commanded pressure in kPa (1050 kPa = full lock command on LML/L5P)
    const tccPcsVal = parseVal(converterDutyIdx);
    converterDutyCycle.push(isNaN(tccPcsVal) ? 0 : tccPcsVal);

    // TCC pressure (legacy field — use PCS pressure if available)
    const tccPresVal = parseVal(tccPressureIdx);
    converterPressure.push(isNaN(tccPresVal) ? (isNaN(tccPcsVal) ? 0 : tccPcsVal) : tccPresVal);
    // Gear: LML/L5P is numeric; LB7 TCM.GEAR uses text ("First", "Second", etc.)
    let gearVal = parseVal(currentGearIdx);
    if (isNaN(gearVal) && currentGearIdx !== -1 && currentGearIdx < rawCols.length) {
      const gearText = rawCols[currentGearIdx]?.trim().toLowerCase();
      const gearMap: Record<string, number> = {
        'park': 0, 'p': 0, 'neutral': 0, 'n': 0,
        'reverse': -1, 'r': -1, 'rev': -1,
        'first': 1, '1st': 1, 'second': 2, '2nd': 2,
        'third': 3, '3rd': 3, 'fourth': 4, '4th': 4,
        'fifth': 5, '5th': 5, 'sixth': 6, '6th': 6,
      };
      gearVal = gearMap[gearText] ?? 0;
    }
    currentGear.push(isNaN(gearVal) ? 0 : gearVal);

    // Oil pressure: EFILive may log in kPa — convert to psi if value looks like kPa (>100)
    const oilPresRaw = parseVal(oilPressureIdx);
    const oilPresPsi = isNaN(oilPresRaw) ? 0 : (oilPresRaw > 100 ? oilPresRaw * 0.145038 : oilPresRaw);
    oilPressure.push(oilPresPsi);

    // Coolant temp: EFILive logs in °C; convert to °F
    // -40°C is the sensor default/startup value — treat as "not yet valid"
    const ectC = parseVal(coolantTempIdx);
    coolantTemp.push(isNaN(ectC) || ectC <= -40 ? 0 : (ectC * 9/5) + 32);

    const eotC = parseVal(oilTempIdx);
    oilTemp.push(isNaN(eotC) || eotC <= -40 ? 0 : (eotC * 9/5) + 32);

    const tftC = parseVal(transFluidTempIdx);
    transFluidTemp.push(isNaN(tftC) || tftC <= -40 ? 0 : (tftC * 9/5) + 32);

    barometricPressure.push(isNaN(baroKpa) ? 14.7 : baroKpa * 0.145038);
    throttlePosition.push(isNaN(parseVal(throttleIdx)) ? 0 : parseVal(throttleIdx));
    // Injector pulse width: LML/L5P in ms; LB7 PCM.MAINBPW in microseconds (µs)
    const ipwRaw = parseVal(injPulseWidthIdx);
    const ipwUnit = getUnit(injPulseWidthIdx);
    const ipwMs = isNaN(ipwRaw) ? 0 : (
      ipwUnit.includes('us') || ipwUnit.includes('µs') || ipwUnit.includes('usec') ||
      (isLB7Style && pidHeaders[injPulseWidthIdx]?.includes('MAINBPW'))
        ? ipwRaw / 1000  // µs → ms
        : ipwRaw
    );
    injectorPulseWidth.push(ipwMs);
    // Injection timing (degrees) — EFILive logs in degrees BTDC
    const itmVal = parseVal(injTimingIdx);
    injectionTiming.push(isNaN(itmVal) ? 0 : itmVal);
    // Intake air temp — EFILive logs in °C, convert to °F
    const iatC = parseVal(iatIdx);
    intakeAirTemp.push(isNaN(iatC) || iatC <= -40 ? 0 : (iatC * 9/5) + 32);
    // Fuel quantity: ECM.INJQNTALL / PCM.FUEL_MAIN_M is in mm3/stroke
    // LB7: can be negative (-512) when engine off — clamp to 0
    const fqVal = parseVal(fuelQuantityIdx);
    fuelQuantity.push(isNaN(fqVal) ? 0 : Math.max(0, fqVal));

    // ── Cummins-specific data extraction ──────────────────────────────────
    // Turbo speed (rpm) — direct
    turboSpeed.push(turboSpeedIdx !== -1 ? (isNaN(parseVal(turboSpeedIdx)) ? 0 : parseVal(turboSpeedIdx)) : 0);
    // Exhaust back pressure: kPa → psi
    const exhPrsKpa = parseVal(exhaustPressureIdx);
    exhaustPressure.push(exhaustPressureIdx !== -1 && !isNaN(exhPrsKpa) ? exhPrsKpa * 0.145038 : 0);
    // Battery voltage (V) — direct
    batteryVoltage.push(batteryVoltageIdx !== -1 ? (isNaN(parseVal(batteryVoltageIdx)) ? 0 : parseVal(batteryVoltageIdx)) : 0);
    // DPF soot level (g) — direct
    dpfSootLevel.push(dpfSootIdx !== -1 ? (isNaN(parseVal(dpfSootIdx)) ? 0 : parseVal(dpfSootIdx)) : 0);
    // EGR position (%) — direct
    egrPosition.push(egrPositionIdx !== -1 ? (isNaN(parseVal(egrPositionIdx)) ? 0 : parseVal(egrPositionIdx)) : 0);
    // EGR temperature: °C → °F
    const egrtC = parseVal(egrTempIdx);
    egrTemp.push(egrTempIdx !== -1 && !isNaN(egrtC) ? (egrtC * 9/5) + 32 : 0);
    // Intake throttle position (%) — direct
    intakeThrottlePosition.push(intakeThrottleIdx !== -1 ? (isNaN(parseVal(intakeThrottleIdx)) ? 0 : parseVal(intakeThrottleIdx)) : 0);
    // Intake manifold temp: °C → °F
    const imtC = parseVal(intakeManifoldTempIdx);
    intakeManifoldTemp.push(intakeManifoldTempIdx !== -1 && !isNaN(imtC) ? (imtC * 9/5) + 32 : 0);
    // Charge cooler temp: °C → °F
    const cactC = parseVal(chargeCoolerTempIdx);
    chargeCoolerTemp.push(chargeCoolerTempIdx !== -1 && !isNaN(cactC) ? (cactC * 9/5) + 32 : 0);
    // Pilot injection quantities (mm3) — direct
    pilot1Qty.push(pilot1QtyIdx !== -1 ? (isNaN(parseVal(pilot1QtyIdx)) ? 0 : parseVal(pilot1QtyIdx)) : 0);
    pilot2Qty.push(pilot2QtyIdx !== -1 ? (isNaN(parseVal(pilot2QtyIdx)) ? 0 : parseVal(pilot2QtyIdx)) : 0);
    // Pilot injection timing (°) — direct
    pilot1Timing.push(pilot1TimIdx !== -1 ? (isNaN(parseVal(pilot1TimIdx)) ? 0 : parseVal(pilot1TimIdx)) : 0);
    pilot2Timing.push(pilot2TimIdx !== -1 ? (isNaN(parseVal(pilot2TimIdx)) ? 0 : parseVal(pilot2TimIdx)) : 0);
    // Post injection quantities (mm3) — direct
    post1Qty.push(post1QtyIdx !== -1 ? (isNaN(parseVal(post1QtyIdx)) ? 0 : parseVal(post1QtyIdx)) : 0);
    post2Qty.push(post2QtyIdx !== -1 ? (isNaN(parseVal(post2QtyIdx)) ? 0 : parseVal(post2QtyIdx)) : 0);
    // Post injection timing (°) — direct
    post1Timing.push(post1TimIdx !== -1 ? (isNaN(parseVal(post1TimIdx)) ? 0 : parseVal(post1TimIdx)) : 0);
    post2Timing.push(post2TimIdx !== -1 ? (isNaN(parseVal(post2TimIdx)) ? 0 : parseVal(post2TimIdx)) : 0);
    // Regen state — direct
    regenState.push(regenStateIdx !== -1 ? (isNaN(parseVal(regenStateIdx)) ? 0 : parseVal(regenStateIdx)) : 0);
    // CSP5 tune number — direct
    cspTuneNumber.push(cspTuneIdx !== -1 ? (isNaN(parseVal(cspTuneIdx)) ? 0 : parseVal(cspTuneIdx)) : 0);
    // Fuel pressure regulator current (A) — direct
    fuelRegCurrent.push(fuelRegCurrentIdx !== -1 ? (isNaN(parseVal(fuelRegCurrentIdx)) ? 0 : parseVal(fuelRegCurrentIdx)) : 0);
    // EGT probes 2-5: °C → °F
    const egt2C = parseVal(egt2Idx);
    egt2.push(egt2Idx !== -1 && !isNaN(egt2C) && egt2C > -40 ? (egt2C * 9/5) + 32 : 0);
    const egt3C = parseVal(egt3Idx);
    egt3.push(egt3Idx !== -1 && !isNaN(egt3C) && egt3C > -40 ? (egt3C * 9/5) + 32 : 0);
    const egt4C = parseVal(egt4Idx);
    egt4.push(egt4Idx !== -1 && !isNaN(egt4C) && egt4C > -40 ? (egt4C * 9/5) + 32 : 0);
    const egt5C = parseVal(egt5Idx);
    egt5.push(egt5Idx !== -1 && !isNaN(egt5C) && egt5C > -40 ? (egt5C * 9/5) + 32 : 0);
    // Altitude density table selects — direct
    altitudeDensityHigh.push(altDensHighIdx !== -1 ? (isNaN(parseVal(altDensHighIdx)) ? 0 : parseVal(altDensHighIdx)) : 0);
    altitudeDensityLow.push(altDensLowIdx !== -1 ? (isNaN(parseVal(altDensLowIdx)) ? 0 : parseVal(altDensLowIdx)) : 0);
    // Engine torque control state — direct
    engineTorqueState.push(engTorqueStateIdx !== -1 ? (isNaN(parseVal(engTorqueStateIdx)) ? 0 : parseVal(engTorqueStateIdx)) : 0);
    // Fuel control mode — direct
    fuelControlMode.push(fuelControlModeIdx !== -1 ? (isNaN(parseVal(fuelControlModeIdx)) ? 0 : parseVal(fuelControlModeIdx)) : 0);
    // Main injection duration (µs) — direct (distinct from injector pulse width)
    mainInjDuration.push(mainInjDurationIdx !== -1 ? (isNaN(parseVal(mainInjDurationIdx)) ? 0 : parseVal(mainInjDurationIdx)) : 0);
    // Calculated load (%) — direct
    calcLoad.push(calcLoadIdx !== -1 ? (isNaN(parseVal(calcLoadIdx)) ? 0 : parseVal(calcLoadIdx)) : 0);
    // Output shaft RPM — direct
    outputShaftRpm.push(outputShaftRpmIdx !== -1 ? (isNaN(parseVal(outputShaftRpmIdx)) ? 0 : parseVal(outputShaftRpmIdx)) : 0);
    // Turbine RPM — use turbineSpeedIdx from earlier if available
    turbineRpm.push(turbineSpeedIdx !== -1 ? (isNaN(parseVal(turbineSpeedIdx)) ? 0 : parseVal(turbineSpeedIdx)) : 0);
    // Trans line pressure desired: kPa → psi
    const tlpDesKpa = parseVal(transLinePressDesIdx);
    transLinePressureDesired.push(transLinePressDesIdx !== -1 && !isNaN(tlpDesKpa) ? tlpDesKpa * 0.145038 : 0);
    // Trans line pressure actual: kPa → psi
    const tlpActKpa = parseVal(transLinePressActIdx);
    transLinePressureActual.push(transLinePressActIdx !== -1 && !isNaN(tlpActKpa) ? tlpActKpa * 0.145038 : 0);
    // Trans line pressure duty cycle (%) — direct
    transLinePressureDC.push(transLinePressureDCIdx !== -1 ? (isNaN(parseVal(transLinePressureDCIdx)) ? 0 : parseVal(transLinePressureDCIdx)) : 0);
    // Driver demand torque (%) — direct
    driverDemandTorque.push(driverDemandTorqueIdx !== -1 ? (isNaN(parseVal(driverDemandTorqueIdx)) ? 0 : parseVal(driverDemandTorqueIdx)) : 0);
    // Actual engine torque (%) — direct
    actualEngineTorque.push(actualEngineTorqueIdx !== -1 ? (isNaN(parseVal(actualEngineTorqueIdx)) ? 0 : parseVal(actualEngineTorqueIdx)) : 0);
    // Post injection 3 & 4 quantities (mm3) — direct
    post3Qty.push(post3QtyIdx !== -1 ? (isNaN(parseVal(post3QtyIdx)) ? 0 : Math.max(0, parseVal(post3QtyIdx))) : 0);
    post4Qty.push(post4QtyIdx !== -1 ? (isNaN(parseVal(post4QtyIdx)) ? 0 : Math.max(0, parseVal(post4QtyIdx))) : 0);
    // ── End Cummins-specific ─────────────────────────────────────────────
  }
  if (rpm.length === 0) {
    // If we have no rows at all, the file may be truly empty or all rows were filtered
    throw new Error('No valid data rows found in EFILive CSV. Check that the file is a valid EFILive datalog export.');
  }

  // Track missing PIDs for UI display
  const pidsMissing: string[] = [];
  if (!hasRpm && !rpmIsFallback) pidsMissing.push('RPM (ECM.RPM)');
  if (rpmIsFallback) pidsMissing.push('RPM (using fallback: ' + pidHeaders[rpmIdx] + ')');
  if (!hasMaf) pidsMissing.push('MAF (ECM.MAF)');

  const duration = offset[offset.length - 1] - offset[0];

  return {
    rpm,
    maf,
    boost,
    mapAbsolute,
    throttlePosition,
    injectorPulseWidth,
    injectionTiming,
    intakeAirTemp,
    torquePercent,
    maxTorque,
    vehicleSpeed,
    fuelRate,
    offset,
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    turboVaneDesired,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    currentGear,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    fuelQuantity,
    boostSource: mapIdx !== -1 ? 'map_derived' : 'none',
    // EFILive: MAP is the actual boost source. If MAP was all N/A the boost array is all zeros.
    // Detect this by checking if any boost value is non-zero AND mapIdx was found.
    // A log where MAP is not in the scan list will have mapIdx === -1 OR all-zero boost.
    boostActualAvailable: mapIdx !== -1 && boost.some(v => v > 0),
    pidSubstitutions: [],
    pidsMissing,
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
    // Cummins-specific channels (populated from EFILive Cummins PIDs)
    turboSpeed,
    exhaustPressure,
    batteryVoltage,
    dpfSootLevel,
    egrPosition,
    egrTemp,
    intakeThrottlePosition,
    intakeManifoldTemp,
    chargeCoolerTemp,
    pilot1Qty,
    pilot2Qty,
    pilot1Timing,
    pilot2Timing,
    post1Qty,
    post2Qty,
    post1Timing,
    post2Timing,
    regenState,
    cspTuneNumber,
    fuelRegCurrent,
    egt2,
    egt3,
    egt4,
    egt5,
    altitudeDensityHigh,
    altitudeDensityLow,
    compressorDensity: compressorDensityIdx !== -1 ? [] : [],  // populated below if needed
    engineTorqueState,
    fuelControlMode,
    mainInjDuration,
    calcLoad,
    outputShaftRpm,
    turbineRpm,
    transLinePressureDesired,
    transLinePressureActual,
    transLinePressureDC,
    driverDemandTorque,
    actualEngineTorque,
    post3Qty,
    post4Qty,
    fileFormat: 'efilive',
  };
}

/**
 * Parse Banks Power CSV format
 */
function parseBanksPowerCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('Invalid Banks Power CSV format');
  }
  
  // Banks Power format: first line is header
  const headers = lines[0].split(',').map(h => h.trim());
  
  const getColumnIndex = (keywords: string[]): number => {
    for (const keyword of keywords) {
      const idx = headers.findIndex(h => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  
  // Banks Power column mappings
  // Handles both legacy Banks dyno format and 2024+ iDash 4-row header format
  const timeIdx = getColumnIndex(['TIME']);
  const rpmIdx = getColumnIndex(['Engine RPM']);
  const mafIdx = getColumnIndex(['Mass Air Flow']);
  // Use 'Boost Pressure' (gauge, PSIG) if available; fall back to MAP absolute
  const boostGaugeIdx = getColumnIndex(['Boost Pressure']);
  // MAP: iDash uses 'Manifold Pressure A' or 'Manifold Absolute Pressure A'
  const mapIdx = getColumnIndex(['Manifold Pressure A', 'Manifold Absolute Pressure A', 'Manifold Absolute Pressure']);
  // Torque: iDash 2024 uses 'Torque % Actual' (percentage) instead of 'Torque ECU' (ft-lb)
  const torqueIdx = getColumnIndex(['Torque ECU', 'Torque % Actual']);
  const torqueCmdIdx = getColumnIndex(['Torque % Commanded']);
  const hpIdx = getColumnIndex(['Horsepower ECU']);
  // Engine Reference Torque: iDash provides this in ft-lb for converting % to actual
  const refTorqueIdx = getColumnIndex(['Engine Reference Torque']);
  const speedIdx = getColumnIndex(['Vehicle Speed']);
  const fuelRateIdx = getColumnIndex(['Fuel Flow Rate', 'Cylinder Fuel Rate']);
  const railActualIdx = getColumnIndex(['Fuel Rail Pressure']);
  const railDesiredIdx = getColumnIndex(['FRP Commanded']);
  const pcvIdx = -1; // Banks Power does not log PCV duty cycle — leave unmapped
  // MAP Commanded is absolute (PSIA); subtract ambient to get gauge
  const mapCommandedIdx = getColumnIndex(['MAP Commanded']);
  const ambientIdx = getColumnIndex(['Ambient Air Pressure', 'B-Bus Ambient Air Pressure']);
  const turboVaneIdx = getColumnIndex(['Turbo Vane Position']);
  const turboVaneDesiredIdx = getColumnIndex(['Turbo Vane Position Desired', 'Desired Turbo Vane Position', 'Turbo Vane Desired', 'Turbo Vane Command']);
  // EGT: scan ALL EGT-matching columns and pick the one with the highest peak reading
  // Banks Power may log multiple EGT sensors (DOC inlet, turbo inlet, DPF outlet, etc.)
  const egtIdx = (() => {
    const egtCandidates = headers
      .map((h, i) => ({ header: h, idx: i }))
      .filter(({ header }) => /EGT|Exhaust Gas Temp/i.test(header));
    if (egtCandidates.length === 0) return -1;
    if (egtCandidates.length === 1) return egtCandidates[0].idx;
    // Parse a sample of data rows to find which EGT column has the highest peak
    const dataRows = lines.slice(4).filter(l => l && !isNaN(parseFloat(l.split(',')[0]?.trim())));
    let bestIdx = egtCandidates[0].idx;
    let bestPeak = -Infinity;
    for (const { idx } of egtCandidates) {
      let peak = 0;
      for (const row of dataRows) {
        const val = parseFloat(row.split(',')[idx]?.trim());
        if (!isNaN(val) && val > peak) peak = val;
      }
      if (peak > bestPeak) { bestPeak = peak; bestIdx = idx; }
    }
    return bestIdx;
  })();
  const converterSlipIdx = getColumnIndex(['Transmission Slip']);
  const converterDutyIdx = getColumnIndex(['Torque Converter Status']);
  const converterPressureIdx = getColumnIndex(['Trans Line 1 Pressure']);
  const currentGearIdx = getColumnIndex(['Trans Current Gear', 'Current Gear', 'Gear', 'Transmission Gear']);
  const oilPressureIdx = getColumnIndex(['Engine Oil Pressure', 'Oil Pressure']);
  const coolantTempIdx = getColumnIndex(['Engine Coolant Temp', 'Coolant Temp']);
  const oilTempIdx = getColumnIndex(['Engine Oil Temp', 'Oil Temp']);
  const transFluidTempIdx = getColumnIndex(['Transmission Fluid Temp', 'Trans Fluid Temp']);
  // Throttle: iDash 2024 uses 'Throttle Position' (actual) and 'Accelerator Pedal D'/'Accelerator Pedal E'
  const throttleIdx = getColumnIndex(['Accelerator Pedal D', 'Accelerator Pedal E', 'Accelerator Pedal Position', 'Throttle Position', 'Pedal Position', 'APP', 'Accel Pedal']);
  const injPulseWidthIdx = getColumnIndex(['Injector Pulse Width', 'Inj Pulse Width', 'Fuel Pulse Width']);
  // iDash 2024 uses 'Injection Timing Advance'
  const injTimingIdx = getColumnIndex(['Injection Timing Advance', 'Injection Timing', 'Timing Advance', 'SOI', 'Start of Injection']);
  // iDash 2024 uses 'IAT Bank 1 Sensor 1/2/3' and 'CAC Temp Bank 1 Sensor 1/2'
  const iatIdx = getColumnIndex(['IAT Bank 1 Sensor 1', 'IAT Bank 1', 'Intake Air Temp', 'Intake Air Temperature', 'IAT', 'Charge Air Temp', 'Charge Air Temperature']);
  // iDash 2024 additional channels
  const calcLoadIdx = getColumnIndex(['Calculated Engine Load', 'Absolute Engine Load']);
  const battVoltIdx = getColumnIndex(['ECU Battery Voltage', 'B-Bus Battery Voltage']);
  const egrCmdIdx = getColumnIndex(['EGR Duty Cycle Commanded']);
  const egrActIdx = getColumnIndex(['EGR Duty Cycle Actual']);
  const cylFuelRateIdx = getColumnIndex(['Cylinder Fuel Rate']);
  const defLevelIdx = getColumnIndex(['DEF Fluid Level', 'DEF Tank Level']);
  const dpfDeltaPressIdx = getColumnIndex(['DPF Delta Press']);
  const dpfRegenStatusIdx = getColumnIndex(['Dpf Regen Status']);
  const liftPumpIdx = getColumnIndex(['Lift Pump Fuel Pressure']);
  const fuelTankIdx = getColumnIndex(['Fuel Tank Level']);
  const exhaustFlowIdx = getColumnIndex(['Engine Exhaust Flow Rate']);
  
  if (rpmIdx === -1 || mafIdx === -1) {
    throw new Error('Missing required columns in Banks Power format: Engine RPM or Mass Air Flow');
  }
  
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const throttlePosition: number[] = [];
  const injectorPulseWidth: number[] = [];
  const injectionTiming: number[] = [];
  const intakeAirTemp: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const turboVaneDesired: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const currentGear: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  const barometricPressure: number[] = [];
  
  // Banks Power CSV has 4 header rows:
  //   Row 0: column names (e.g. "FRP Commanded")
  //   Row 1: hex addresses (e.g. "0x0144")
  //   Row 2: short names (e.g. "FRPCMD")
  //   Row 3: units (e.g. "PSIA") — was previously parsed as data causing zero-value contamination
  // Data starts at row 4 (index 4)
  for (let i = 4; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    // Skip any row that starts with non-numeric content (extra metadata rows)
    const firstVal = line.split(',')[0].trim();
    if (isNaN(parseFloat(firstVal)) && firstVal !== '') continue;
    
    const values = line.split(',').map(v => {
      const num = parseFloat(v.trim());
      return isNaN(num) ? 0 : num;
    });
    
    if (values.length < Math.max(rpmIdx, mafIdx) + 1) continue;
    
    rpm.push(values[rpmIdx] || 0);
    maf.push(values[mafIdx] || 0);
    // Use Boost Pressure (gauge, PSIG) if available; otherwise subtract ambient from MAP
    const ambientVal = ambientIdx !== -1 ? (values[ambientIdx] || 14.7) : 14.7;
    const bpMapPsia = mapIdx !== -1 ? values[mapIdx] : 0;
    mapAbsolute.push(bpMapPsia);
    if (boostGaugeIdx !== -1) {
      boost.push(Math.max(0, values[boostGaugeIdx]));
    } else if (mapIdx !== -1) {
      boost.push(Math.max(0, bpMapPsia - ambientVal));
    } else {
      boost.push(0);
    }
    
    // Banks Power torque handling:
    // Legacy format: 'Torque ECU' is ft-lb, 'Horsepower ECU' is HP → convert to %
    // iDash 2024: 'Torque % Actual' is already %, 'Engine Reference Torque' is ft-lb
    const refTorqueVal = refTorqueIdx !== -1 ? values[refTorqueIdx] : 0;
    if (torqueIdx !== -1) {
      const torqueVal = values[torqueIdx];
      if (refTorqueVal > 0) {
        // iDash format: torque is already %, reference torque gives us the ft-lb base
        torquePercent.push(torqueVal);
        maxTorque.push(refTorqueVal);
      } else if (hpIdx !== -1) {
        // Legacy format: torque is ft-lb, assume 879 lb-ft reference
        torquePercent.push((torqueVal / 879.174) * 100);
        maxTorque.push(879.174);
      } else {
        // Torque value exists but no reference — treat as percentage
        torquePercent.push(torqueVal);
        maxTorque.push(879.174);
      }
    } else {
      torquePercent.push(0);
      maxTorque.push(refTorqueVal > 0 ? refTorqueVal : 879.174);
    }
    
    vehicleSpeed.push(speedIdx !== -1 ? values[speedIdx] : 0);
    fuelRate.push(fuelRateIdx !== -1 ? values[fuelRateIdx] : 0);
    offset.push(timeIdx !== -1 ? values[timeIdx] : i);
    railPressureActual.push(railActualIdx !== -1 ? values[railActualIdx] : 0);
    railPressureDesired.push(railDesiredIdx !== -1 ? values[railDesiredIdx] : 0);
    pcvDutyCycle.push(pcvIdx !== -1 ? values[pcvIdx] : 0);
    // MAP Commanded is absolute (PSIA); subtract ambient to get gauge (PSIG)
    const mapCmdVal = mapCommandedIdx !== -1 ? values[mapCommandedIdx] : 0;
    boostDesired.push(mapCmdVal > 0 ? Math.max(0, mapCmdVal - ambientVal) : 0);
    turboVanePosition.push(turboVaneIdx !== -1 ? values[turboVaneIdx] : 0);
    turboVaneDesired.push(turboVaneDesiredIdx !== -1 ? values[turboVaneDesiredIdx] : 0);
    // Filter EGT/CAT sentinel values: -1740.6, -531.7 = sensor not connected on iDash
    const rawEgt = egtIdx !== -1 ? values[egtIdx] : 0;
    exhaustGasTemp.push(rawEgt < -100 ? 0 : rawEgt);
    converterSlip.push(converterSlipIdx !== -1 ? values[converterSlipIdx] : 0);
    converterDutyCycle.push(converterDutyIdx !== -1 ? values[converterDutyIdx] : 0);
    converterPressure.push(converterPressureIdx !== -1 ? values[converterPressureIdx] : 0);
    currentGear.push(currentGearIdx !== -1 ? values[currentGearIdx] : 0);
    oilPressure.push(oilPressureIdx !== -1 ? values[oilPressureIdx] : 0);
    // Filter temp sentinel values (< -100°F = sensor not connected)
    const rawCoolant = coolantTempIdx !== -1 ? values[coolantTempIdx] : 0;
    coolantTemp.push(rawCoolant < -100 ? 0 : rawCoolant);
    const rawOilT = oilTempIdx !== -1 ? values[oilTempIdx] : 0;
    oilTemp.push(rawOilT < -100 ? 0 : rawOilT);
    transFluidTemp.push(transFluidTempIdx !== -1 ? values[transFluidTempIdx] : 0);
    barometricPressure.push(ambientVal);
    throttlePosition.push(throttleIdx !== -1 ? values[throttleIdx] : 0);
    injectorPulseWidth.push(injPulseWidthIdx !== -1 ? values[injPulseWidthIdx] : 0);
    injectionTiming.push(injTimingIdx !== -1 ? values[injTimingIdx] : 0);
    // Filter IAT sentinel values
    const rawIat = iatIdx !== -1 ? values[iatIdx] : 0;
    intakeAirTemp.push(rawIat < -100 ? 0 : rawIat);
  }
  
  if (rpm.length === 0) {
    throw new Error('No valid data rows found in Banks Power CSV');
  }
  
  const duration = offset[offset.length - 1] - offset[0];
  
  return {
    rpm,
    maf,
    boost,
    torquePercent,
    maxTorque,
    vehicleSpeed,
    fuelRate,
    offset,
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    turboVaneDesired,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    currentGear,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    mapAbsolute,
    throttlePosition,
    injectorPulseWidth,
    injectionTiming,
    intakeAirTemp,
    fuelQuantity: new Array(rpm.length).fill(0), // Banks Power doesn't log fuel quantity
    boostSource: boostGaugeIdx !== -1 ? 'direct' : mapIdx !== -1 ? 'map_derived' : 'none',
    boostActualAvailable: boost.some(v => v > 0),
    pidSubstitutions: [],
    pidsMissing: [],
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
    // Cummins-specific (defaults for non-Cummins formats)
    turboSpeed: [],
    exhaustPressure: [],
    batteryVoltage: [],
    dpfSootLevel: [],
    egrPosition: [],
    egrTemp: [],
    intakeThrottlePosition: [],
    intakeManifoldTemp: [],
    chargeCoolerTemp: [],
    pilot1Qty: [],
    pilot2Qty: [],
    pilot1Timing: [],
    pilot2Timing: [],
    post1Qty: [],
    post2Qty: [],
    post1Timing: [],
    post2Timing: [],
    regenState: [],
    cspTuneNumber: [],
    fuelRegCurrent: [],
    egt2: [],
    egt3: [],
    egt4: [],
    egt5: [],
    altitudeDensityHigh: [],
    altitudeDensityLow: [],
    compressorDensity: [],
    engineTorqueState: [],
    fuelControlMode: [],
    mainInjDuration: [],
    calcLoad: [],
    outputShaftRpm: [],
    turbineRpm: [],
    transLinePressureDesired: [],
    transLinePressureActual: [],
    transLinePressureDC: [],
    driverDemandTorque: [],
    actualEngineTorque: [],
    post3Qty: [],
    post4Qty: [],
    fileFormat: 'bankspower',
  };
}

/**
 * Parse EZ Lynk CSV format
 * Single header row with human-readable column names + units in parentheses.
 * Data rows are comma-separated, sparse (many rows only have Time + GPS).
 * Units: RPM in RPM, Boost in PSI (gauge), Rail Pressure in kPSI, Temps in °F,
 *        MAF in g/s, Speed in MPH, Timing in °BTDC, Fuel Qty in mm³.
 */
function parseEZLynkCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) throw new Error('EZ Lynk CSV has no data rows');

  const headers = lines[0].split(',').map(h => h.trim());

  // Column finder: case-insensitive partial match
  const findCol = (patterns: string[]): number => {
    for (const pat of patterns) {
      const lp = pat.toLowerCase();
      const idx = headers.findIndex(h => h.toLowerCase().includes(lp));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Map EZ Lynk columns to our data model
  const timeIdx = findCol(['Time']);
  const rpmIdx = findCol(['Engine RPM']);
  const mafIdx = findCol(['Mass Air Flow']);
  const boostIdx = findCol(['Boost Pressure']);
  const throttleIdx = findCol(['Throttle Position']);
  const timingIdx = findCol(['Main Injection Timing', 'Injection Timing']);
  const coolantIdx = findCol(['Eng. Coolant Temp', 'Engine Coolant Temp', 'Coolant Temp']);
  const transIdx = findCol(['Transmission Temp']);
  const loadIdx = findCol(['Engine Load']);
  // Torque: EZLynk may have "Est. Engine Torque(A)" in Ft-lbf (actual torque, not percentage)
  const torqueActualIdx = findCol(['Est. Engine Torque(A)', 'Engine Torque(A)', 'Actual Torque']);
  const torqueDesiredIdx = findCol(['Est. Engine Torque(D)', 'Engine Torque(D)', 'Desired Torque']);
  const railActualIdx = findCol(['Injection Pressure(A)', 'Fuel Pressure(A)', 'Rail Pressure(A)']);
  const railDesiredIdx = findCol(['Injection Pressure(D)', 'Fuel Pressure(D)', 'Rail Pressure(D)']);
  const speedIdx = findCol(['Vehicle Speed']);
  const gpsSpeedIdx = findCol(['GPS Speed']);
  const dpfSootIdx = findCol(['DPF Soot']);
  const turbineRpmIdx = findCol(['Trans. Turbine RPM', 'Turbine RPM']);
  const slipIdx = findCol(['Torque Converter Slip', 'TQ Conv. Slip', 'Converter Slip']);
  const fuelQtyIdx = findCol(['Injection Quantity(D)', 'Fuel Quantity']);
  const pcvActualIdx = findCol(['Fuel Pres. Reg. Cur.(A)', 'FPR Current(A)']);
  const pcvDesiredIdx = findCol(['Fuel Pres. Reg. Cur.(D)', 'FPR Current(D)']);
  const gearIdx = findCol(['Gear']);
  const tccStatusIdx = findCol(['TQ Conv. Status', 'TCC Status', 'Torque Converter Status']);
  const turboVaneActualIdx = findCol(['Turbo Vane Position(A)', 'VGT Position(A)']);
  const turboVaneDesiredIdx = findCol(['Turbo Vane Position(D)', 'VGT Position(D)']);
  const iatIdx = findCol(['Intake Air Temp', 'IAT']);
  const egtIdx = findCol(['Exhaust Gas Temp', 'EGT']);
  const dpfSootLevelIdx = findCol(['DPF Soot Load', 'DPF Soot']);
  const batteryIdx = findCol(['Battery Voltage', 'Module Voltage']);

  if (rpmIdx === -1 && mafIdx === -1 && boostIdx === -1) {
    throw new Error('EZ Lynk CSV: Cannot find Engine RPM, MAF, or Boost columns. Ensure this is a valid EZ Lynk datalog.');
  }

  // ── EZLynk sparse data: forward-fill last known values ──────────────────
  // EZLynk only logs a value when it changes, leaving cells empty otherwise.
  // We must forward-fill to reconstruct continuous time-series data.
  const lastKnown: Record<number, number> = {};
  const valFF = (cols: string[], idx: number): number => {
    if (idx === -1 || idx >= cols.length) return lastKnown[idx] ?? NaN;
    const v = cols[idx].trim();
    if (v === '') return lastKnown[idx] ?? NaN;
    const n = parseFloat(v);
    if (!isNaN(n)) lastKnown[idx] = n;
    return n;
  };

  // Parse data rows
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const turboVaneDesired: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const currentGear: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  const barometricPressure: number[] = [];
  const throttlePosition: number[] = [];
  const injectorPulseWidth: number[] = [];
  const injectionTiming: number[] = [];
  const intakeAirTemp: number[] = [];
  const fuelQuantity: number[] = [];
  const driverDemandTorque: number[] = [];
  const actualEngineTorque: number[] = [];
  const dpfSootLevel: number[] = [];
  const batteryVoltage: number[] = [];

  const pidsMissing: string[] = [];
  if (rpmIdx === -1) pidsMissing.push('Engine RPM');
  if (mafIdx === -1) pidsMissing.push('Mass Air Flow');

  // Detect if torque column is in Ft-lbf (actual) vs percentage
  // Check header for "Ft-lbf" or "ft-lbf" to determine
  const torqueIsAbsolute = torqueActualIdx !== -1 &&
    headers[torqueActualIdx].toLowerCase().includes('ft-lbf');
  // Cummins 6.7L max torque: 800 ft-lbf for 2013-2017 68RFE
  const cumminsMaxTorqueFtLbf = 800;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');

    // Read time first — every row should have a timestamp
    const timeVal = valFF(cols, timeIdx);

    // Forward-fill all channel values
    const rpmVal = valFF(cols, rpmIdx);
    const boostVal = valFF(cols, boostIdx);
    const railVal = valFF(cols, railActualIdx);
    const mafVal = valFF(cols, mafIdx);
    const tpVal = valFF(cols, throttleIdx);
    const gearVal = valFF(cols, gearIdx);
    const tccVal = valFF(cols, tccStatusIdx);
    const turboVAVal = valFF(cols, turboVaneActualIdx);
    const turboVDVal = valFF(cols, turboVaneDesiredIdx);
    const torqueAVal = valFF(cols, torqueActualIdx);
    const torqueDVal = valFF(cols, torqueDesiredIdx);
    const loadVal = valFF(cols, loadIdx);
    const coolantVal = valFF(cols, coolantIdx);
    const transVal = valFF(cols, transIdx);
    const spdVal = valFF(cols, speedIdx);
    const gpsSpdVal = valFF(cols, gpsSpeedIdx);
    const rpActual = valFF(cols, railActualIdx);
    const rpDesired = valFF(cols, railDesiredIdx);
    const pcvA = valFF(cols, pcvActualIdx);
    const slipVal = valFF(cols, slipIdx);
    const timingVal = valFF(cols, timingIdx);
    const fqVal = valFF(cols, fuelQtyIdx);
    const iatVal = valFF(cols, iatIdx);
    const egtVal = valFF(cols, egtIdx);
    const dpfVal = valFF(cols, dpfSootLevelIdx);
    const battVal = valFF(cols, batteryIdx);

    // Skip rows where ALL channels are empty (no forward-fill available yet)
    // Only skip if we have zero data at all — not just missing some channels
    const hasAnyData = !isNaN(rpmVal) || !isNaN(boostVal) || !isNaN(mafVal) ||
      !isNaN(tpVal) || !isNaN(gearVal) || !isNaN(turboVAVal) || !isNaN(torqueAVal);
    if (!hasAnyData && rpm.length === 0) continue; // skip leading empty rows
    if (!hasAnyData) continue; // skip rows with no data at all

    rpm.push(!isNaN(rpmVal) ? rpmVal : 0);
    maf.push(!isNaN(mafVal) ? mafVal : 0);
    // EZ Lynk boost is already gauge PSI
    boost.push(!isNaN(boostVal) ? Math.max(0, boostVal) : 0);
    mapAbsolute.push(!isNaN(boostVal) ? boostVal + 14.696 : 14.696);

    // Torque handling:
    // 1. If "Est. Engine Torque(A) (Ft-lbf)" is present → actual torque in ft-lbf
    //    Convert to percentage: (torque_ftlbf / maxTorque) * 100
    // 2. If "Engine Load" is present → already percentage
    // 3. Otherwise → 0
    if (torqueIsAbsolute && !isNaN(torqueAVal)) {
      // Convert ft-lbf to percentage for the HP calculation pipeline
      torquePercent.push((torqueAVal / cumminsMaxTorqueFtLbf) * 100);
      actualEngineTorque.push(torqueAVal);
    } else if (!isNaN(loadVal)) {
      torquePercent.push(loadVal);
      actualEngineTorque.push(0);
    } else {
      torquePercent.push(0);
      actualEngineTorque.push(0);
    }
    maxTorque.push(cumminsMaxTorqueFtLbf);

    // Desired torque
    driverDemandTorque.push(!isNaN(torqueDVal) ? torqueDVal : 0);

    // Speed: prefer vehicle speed, fall back to GPS speed
    vehicleSpeed.push(!isNaN(spdVal) ? spdVal : (!isNaN(gpsSpdVal) ? gpsSpdVal : 0));

    fuelRate.push(0); // Not available in EZ Lynk
    offset.push(!isNaN(timeVal) ? timeVal : (rpm.length - 1) * 0.1);

    // Rail pressure: EZ Lynk uses kPSI, convert to PSI (* 1000)
    railPressureActual.push(!isNaN(rpActual) ? rpActual * 1000 : 0);
    railPressureDesired.push(!isNaN(rpDesired) ? rpDesired * 1000 : 0);

    // PCV: use actual current (mA)
    pcvDutyCycle.push(!isNaN(pcvA) ? pcvA : 0);

    boostDesired.push(0);
    turboVanePosition.push(!isNaN(turboVAVal) ? turboVAVal : 0);
    turboVaneDesired.push(!isNaN(turboVDVal) ? turboVDVal : 0);
    exhaustGasTemp.push(!isNaN(egtVal) ? egtVal : 0);

    converterSlip.push(!isNaN(slipVal) ? slipVal : 0);

    // TCC status to duty cycle
    if (!isNaN(tccVal)) {
      // EZ Lynk TCC status is numeric: 0=off, 67=controlled, 98=locked
      converterDutyCycle.push(tccVal > 90 ? 100 : tccVal > 50 ? 75 : tccVal > 0 ? 25 : 0);
    } else {
      converterDutyCycle.push(0);
    }
    converterPressure.push(0);

    currentGear.push(!isNaN(gearVal) ? gearVal : 0);

    oilPressure.push(0);
    coolantTemp.push(!isNaN(coolantVal) ? coolantVal : 0);
    oilTemp.push(0);
    transFluidTemp.push(!isNaN(transVal) ? transVal : 0);
    barometricPressure.push(14.696);

    throttlePosition.push(!isNaN(tpVal) ? tpVal : 0);
    injectorPulseWidth.push(0);
    injectionTiming.push(!isNaN(timingVal) ? timingVal : 0);
    intakeAirTemp.push(!isNaN(iatVal) ? iatVal : 0);

    fuelQuantity.push(!isNaN(fqVal) ? fqVal : 0);
    dpfSootLevel.push(!isNaN(dpfVal) ? dpfVal : 0);
    batteryVoltage.push(!isNaN(battVal) ? battVal : 0);
  }

  if (rpm.length === 0) {
    throw new Error('EZ Lynk CSV: No valid data rows found. The file may contain only GPS data.');
  }

  const duration = offset.length > 1 ? offset[offset.length - 1] - offset[0] : 0;

  return {
    rpm,
    maf,
    boost,
    mapAbsolute,
    throttlePosition,
    injectorPulseWidth,
    injectionTiming,
    intakeAirTemp,
    torquePercent,
    maxTorque,
    vehicleSpeed,
    fuelRate,
    offset,
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    turboVaneDesired,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    currentGear,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    fuelQuantity,
    boostSource: boostIdx !== -1 ? 'direct' : 'none',
    boostActualAvailable: boost.some(v => v > 0),
    pidSubstitutions: [],
    pidsMissing,
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
    // Cummins-specific
    turboSpeed: [],
    exhaustPressure: [],
    batteryVoltage,
    dpfSootLevel,
    egrPosition: [],
    egrTemp: [],
    intakeThrottlePosition: [],
    intakeManifoldTemp: [],
    chargeCoolerTemp: [],
    pilot1Qty: [],
    pilot2Qty: [],
    pilot1Timing: [],
    pilot2Timing: [],
    post1Qty: [],
    post2Qty: [],
    post1Timing: [],
    post2Timing: [],
    regenState: [],
    cspTuneNumber: [],
    fuelRegCurrent: [],
    egt2: [],
    egt3: [],
    egt4: [],
    egt5: [],
    altitudeDensityHigh: [],
    altitudeDensityLow: [],
    compressorDensity: [],
    engineTorqueState: [],
    fuelControlMode: [],
    mainInjDuration: [],
    calcLoad: [],
    outputShaftRpm: [],
    turbineRpm: [],
    transLinePressureDesired: [],
    transLinePressureActual: [],
    transLinePressureDC: [],
    driverDemandTorque,
    actualEngineTorque,
    post3Qty: [],
    post4Qty: [],
    fileFormat: 'ezlynk',
  };
}

/**
 * Calculate horsepower from torque and RPM
 */
function calculateHPFromTorque(torquePercent: number[], maxTorque: number[], rpm: number[]): number[] {
  return torquePercent.map((pct, i) => {
    const torqueLbFt = (pct / 100) * maxTorque[i];
    return (torqueLbFt * rpm[i]) / 5252;
  });
}

/**
 * Calculate horsepower from MAF
 */
function calculateHPFromMAF(maf: number[]): number[] {
  const BSFC = 0.35; // Brake Specific Fuel Consumption for diesel
  const AFR = 19; // Air-Fuel Ratio for diesel
  
  return maf.map(m => {
    return (m * 60) / (BSFC * AFR);
  });
}

/**
 * Calculate horsepower from vehicle weight + acceleration (fallback method).
 * Uses F = m * a, then P = F * v, converted to HP.
 *
 * This is the fallback when torque PID is not available in the datalog.
 * Requires vehicle speed (mph) and time (seconds) to compute acceleration.
 *
 * Default vehicle weight: 7500 lbs (typical Duramax truck curb weight + driver).
 * This can be overridden by vehicle metadata if available.
 *
 * HP = (weight_lbs * accel_g * speed_mph) / 375
 * where accel_g = delta_speed_mph / (delta_time_sec * 21.937)
 *       375 = conversion factor for lb * mph to HP
 */
function calculateHPFromAcceleration(
  vehicleSpeed: number[],
  timeMinutes: number[],
  vehicleWeightLbs: number = 7500
): number[] {
  if (vehicleSpeed.length < 3) return vehicleSpeed.map(() => 0);

  const hp: number[] = new Array(vehicleSpeed.length).fill(0);

  // Use a 5-sample moving window for smoothing (reduces noise from speed sensor)
  const WINDOW = 5;
  for (let i = WINDOW; i < vehicleSpeed.length; i++) {
    const dt = (timeMinutes[i] - timeMinutes[i - WINDOW]) * 60; // seconds
    if (dt <= 0.01) continue; // avoid division by zero

    const dv = vehicleSpeed[i] - vehicleSpeed[i - WINDOW]; // mph
    const accelMph2 = dv / dt; // mph/s
    const accelFtS2 = accelMph2 * 1.467; // convert mph/s to ft/s^2
    const speedFtS = vehicleSpeed[i] * 1.467; // mph to ft/s

    // Force = mass * acceleration (mass = weight / 32.174 ft/s^2)
    const massSlug = vehicleWeightLbs / 32.174;
    const force = massSlug * accelFtS2; // lbs-force

    // Power = Force * velocity (ft-lbs/s), convert to HP (1 HP = 550 ft-lbs/s)
    const powerHP = (force * speedFtS) / 550;

    // Add rolling resistance estimate (~1.5% of vehicle weight at speed)
    const rollingResistanceHP = (vehicleWeightLbs * 0.015 * speedFtS) / 550;

    // Add aerodynamic drag estimate (Cd=0.45, A=35sqft for a truck)
    const speedMs = vehicleSpeed[i] * 0.44704;
    const aeroDragN = 0.5 * 1.225 * 0.45 * 3.252 * speedMs * speedMs; // Newtons
    const aeroDragHP = (aeroDragN * speedMs) / 745.7;

    hp[i] = Math.max(0, powerHP + rollingResistanceHP + aeroDragHP);
  }

  return hp;
}

/**
 * Compute the atmospheric (idle) baseline for boost pressure calibration.
 *
 * Priority order:
 *   1. Idle MAP samples (RPM 400-900, first 30s of log) → method: 'idle_map_baseline'
 *   2. Barometric pressure PID if available and non-zero → method: 'barometric_pid'
 *   3. Fallback: median of lowest-RPM MAP samples → method: 'idle_map_baseline'
 *   4. Hard fallback: 14.696 psia (sea level)
 */
function computeBoostBaseline(
  rpm: number[],
  mapAbsolute: number[],
  barometricPressure: number[],
  offset: number[]
): { baseline: number; sampleCount: number; method: BoostCalibrationInfo['method'] } {
  const logStart = offset[0] ?? 0;

  // Try idle MAP samples first (most accurate for this specific log)
  const idleSamples: number[] = [];
  for (let i = 0; i < rpm.length; i++) {
    if ((offset[i] - logStart) <= 30 && rpm[i] > 400 && rpm[i] < 900 && mapAbsolute[i] > 5) {
      idleSamples.push(mapAbsolute[i]);
    }
  }
  if (idleSamples.length >= 3) {
    const baseline = idleSamples.reduce((a, b) => a + b, 0) / idleSamples.length;
    return { baseline, sampleCount: idleSamples.length, method: 'idle_map_baseline' };
  }

  // Try barometric pressure PID
  const validBaro = barometricPressure.filter(b => b > 10 && b < 16);
  if (validBaro.length >= 5) {
    const baseline = validBaro.reduce((a, b) => a + b, 0) / validBaro.length;
    return { baseline, sampleCount: validBaro.length, method: 'barometric_pid' };
  }

  // Fallback: median of lowest-RPM MAP samples across entire log
  const lowRpmMap = rpm
    .map((r, i) => ({ r, m: mapAbsolute[i] }))
    .filter(x => x.r > 400 && x.r < 800 && x.m > 5)
    .map(x => x.m);
  if (lowRpmMap.length > 0) {
    lowRpmMap.sort((a, b) => a - b);
    const baseline = lowRpmMap[Math.floor(lowRpmMap.length / 2)];
    return { baseline, sampleCount: lowRpmMap.length, method: 'idle_map_baseline' };
  }

  return { baseline: 14.696, sampleCount: 0, method: 'none' };
}

/**
 * Process raw data into metrics
 */
export function processData(rawData: DuramaxData): ProcessedMetrics {
  const hpTorque = calculateHPFromTorque(
    rawData.torquePercent,
    rawData.maxTorque,
    rawData.rpm
  );
  
  const hpMaf = calculateHPFromMAF(rawData.maf);

  const timeMinutes = rawData.offset.map(o => o / 60);

  // Acceleration-based HP fallback (works when torque PID is unavailable)
  // Uses vehicle speed + time to estimate HP from F=ma physics.
  // Default weight: 7500 lbs for a typical Duramax truck.
  const vehicleWeightLbs = 7500; // TODO: allow user to set this
  const hpAccel = calculateHPFromAcceleration(rawData.vehicleSpeed, timeMinutes, vehicleWeightLbs);

  // ── Universal boost absolute-vs-gauge calibration pass ──────────────────
  // Runs on EVERY format. Detects whether boostDesired contains atmospheric
  // pressure (absolute) or is already gauge pressure, then corrects both
  // boost actual and boost desired to true gauge (psig).
  let boost = rawData.boost;
  let boostDesired = rawData.boostDesired;
  let boostCalibration: BoostCalibrationInfo = rawData.boostCalibration;

  // Step 1: Compute idle MAP/baro baseline (psia) from the log itself
  const { baseline: idleBaselinePsia, sampleCount: idleSampleCount, method: baselineMethod } =
    computeBoostBaseline(rawData.rpm, rawData.mapAbsolute, rawData.barometricPressure, rawData.offset);

  // Step 2: Correct actual boost if it came from MAP absolute
  if (rawData.boostSource === 'map_derived' && rawData.mapAbsolute.length > 0) {
    boost = rawData.mapAbsolute.map(m => m > 0 ? Math.max(0, m - idleBaselinePsia) : 0);
  }

  // Step 3: Detect if boostDesired is absolute (contains atmospheric).
  // Heuristic: sample idle rows (RPM < 900). If desired boost at idle is
  // consistently above 10 psi, it almost certainly has atmospheric in it.
  const idleDesiredSamples: number[] = [];
  for (let i = 0; i < rawData.rpm.length; i++) {
    if (rawData.rpm[i] > 400 && rawData.rpm[i] < 900 && boostDesired[i] > 0) {
      idleDesiredSamples.push(boostDesired[i]);
      if (idleDesiredSamples.length >= 30) break;
    }
  }
  const avgIdleDesired = idleDesiredSamples.length > 0
    ? idleDesiredSamples.reduce((a, b) => a + b, 0) / idleDesiredSamples.length
    : 0;

  // If average desired boost at idle is above 10 psi, it contains atmospheric
  const desiredHasAtmospheric = avgIdleDesired > 10;

  if (desiredHasAtmospheric && idleBaselinePsia > 0) {
    boostDesired = boostDesired.map(d => d > 0 ? Math.max(0, d - idleBaselinePsia) : 0);
    boostCalibration = {
      corrected: true,
      atmosphericOffsetPsi: idleBaselinePsia,
      method: baselineMethod,
      idleBaselinePsia,
      idleSampleCount,
      desiredAlreadyGauge: false,
    };
  } else {
    boostCalibration = {
      corrected: rawData.boostSource === 'map_derived',
      atmosphericOffsetPsi: rawData.boostSource === 'map_derived' ? idleBaselinePsia : 0,
      method: rawData.boostSource === 'map_derived' ? baselineMethod : 'none',
      idleBaselinePsia,
      idleSampleCount,
      desiredAlreadyGauge: true,
    };
  }

  // EGT analysis for quick stats
  const egtData = rawData.exhaustGasTemp;
  const egtNonZero = egtData.filter(v => v > 0);
  const egtAvailable = egtNonZero.length > 10; // need meaningful data
  const egtMax = egtAvailable ? Math.max(...egtNonZero) : 0;
  // Flatline detection: if EGT is stuck at a constant value (±5°F) for >90% of samples,
  // or stuck past 1800°F, the sensor is likely not working
  let egtFlatlined = false;
  if (egtAvailable) {
    const egtMean = egtNonZero.reduce((a, b) => a + b, 0) / egtNonZero.length;
    const egtStdDev = Math.sqrt(egtNonZero.reduce((sum, v) => sum + (v - egtMean) ** 2, 0) / egtNonZero.length);
    // Flatlined if standard deviation < 5°F (basically constant) or stuck past 1800°F
    if (egtStdDev < 5 || (egtMax > 1800 && egtStdDev < 10)) {
      egtFlatlined = true;
    }
  }

  const stats = {
    rpmMin: Math.min(...rawData.rpm),
    rpmMax: Math.max(...rawData.rpm),
    rpmMean: rawData.rpm.reduce((a, b) => a + b, 0) / rawData.rpm.length,
    mafMin: Math.min(...rawData.maf),
    mafMax: Math.max(...rawData.maf),
    mafMean: rawData.maf.reduce((a, b) => a + b, 0) / rawData.maf.length,
    hpTorqueMax: Math.max(...hpTorque),
    hpMafMax: Math.max(...hpMaf),
    hpAccelMax: Math.max(...hpAccel),
    boostMax: Math.max(...boost),
    egtMax,
    egtAvailable,
    egtFlatlined,
    duration: rawData.duration,
  };
  
  return {
    rpm: rawData.rpm,
    maf: rawData.maf,
    boost,
    mapAbsolute: rawData.mapAbsolute,
    hpTorque,
    hpMaf,
    hpAccel,
    vehicleSpeed: rawData.vehicleSpeed,
    timeMinutes,
    railPressureActual: rawData.railPressureActual,
    railPressureDesired: rawData.railPressureDesired,
    pcvDutyCycle: rawData.pcvDutyCycle,
    boostDesired,
    turboVanePosition: rawData.turboVanePosition,
    turboVaneDesired: rawData.turboVaneDesired,
    exhaustGasTemp: rawData.exhaustGasTemp,
    converterSlip: rawData.converterSlip,
    converterDutyCycle: rawData.converterDutyCycle,
    converterPressure: rawData.converterPressure,
    currentGear: rawData.currentGear,
    oilPressure: rawData.oilPressure,
    coolantTemp: rawData.coolantTemp,
    oilTemp: rawData.oilTemp,
    transFluidTemp: rawData.transFluidTemp,
    barometricPressure: rawData.barometricPressure,
    boostSource: rawData.boostSource,
    boostActualAvailable: rawData.boostActualAvailable,
    throttlePosition: rawData.throttlePosition,
    injectorPulseWidth: rawData.injectorPulseWidth,
    injectionTiming: rawData.injectionTiming,
    intakeAirTemp: rawData.intakeAirTemp,
    fuelQuantity: rawData.fuelQuantity,
    pidSubstitutions: rawData.pidSubstitutions,
    pidsMissing: rawData.pidsMissing,
    boostCalibration,
    stats,
    // Cummins-specific channels (pass through from raw data)
    turboSpeed: rawData.turboSpeed || [],
    exhaustPressure: rawData.exhaustPressure || [],
    batteryVoltage: rawData.batteryVoltage || [],
    dpfSootLevel: rawData.dpfSootLevel || [],
    egrPosition: rawData.egrPosition || [],
    egrTemp: rawData.egrTemp || [],
    intakeThrottlePosition: rawData.intakeThrottlePosition || [],
    intakeManifoldTemp: rawData.intakeManifoldTemp || [],
    chargeCoolerTemp: rawData.chargeCoolerTemp || [],
    pilot1Qty: rawData.pilot1Qty || [],
    pilot2Qty: rawData.pilot2Qty || [],
    pilot1Timing: rawData.pilot1Timing || [],
    pilot2Timing: rawData.pilot2Timing || [],
    post1Qty: rawData.post1Qty || [],
    post2Qty: rawData.post2Qty || [],
    post1Timing: rawData.post1Timing || [],
    post2Timing: rawData.post2Timing || [],
    regenState: rawData.regenState || [],
    cspTuneNumber: rawData.cspTuneNumber || [],
    fuelRegCurrent: rawData.fuelRegCurrent || [],
    egt2: rawData.egt2 || [],
    egt3: rawData.egt3 || [],
    egt4: rawData.egt4 || [],
    egt5: rawData.egt5 || [],
    altitudeDensityHigh: rawData.altitudeDensityHigh || [],
    altitudeDensityLow: rawData.altitudeDensityLow || [],
    compressorDensity: rawData.compressorDensity || [],
    engineTorqueState: rawData.engineTorqueState || [],
    fuelControlMode: rawData.fuelControlMode || [],
    mainInjDuration: rawData.mainInjDuration || [],
    calcLoad: rawData.calcLoad || [],
    outputShaftRpm: rawData.outputShaftRpm || [],
    turbineRpm: rawData.turbineRpm || [],
    transLinePressureDesired: rawData.transLinePressureDesired || [],
    transLinePressureActual: rawData.transLinePressureActual || [],
    transLinePressureDC: rawData.transLinePressureDC || [],
    driverDemandTorque: rawData.driverDemandTorque || [],
    actualEngineTorque: rawData.actualEngineTorque || [],
    post3Qty: rawData.post3Qty || [],
    post4Qty: rawData.post4Qty || [],
    fileFormat: rawData.fileFormat,
    vehicleMeta: rawData.vehicleMeta,
  };
}

/**
 * Downsample data for performance
 */
export function downsampleData(data: ProcessedMetrics, targetPoints: number = 1000): ProcessedMetrics {
  if (data.rpm.length <= targetPoints) return data;
  
  const factor = Math.ceil(data.rpm.length / targetPoints);
  const downsample = (arr: number[]) => arr.filter((_, i) => i % factor === 0);
  
  return {
    ...data,
    rpm: downsample(data.rpm),
    maf: downsample(data.maf),
    boost: downsample(data.boost),
    mapAbsolute: downsample(data.mapAbsolute),
    hpTorque: downsample(data.hpTorque),
    hpMaf: downsample(data.hpMaf),
    hpAccel: downsample(data.hpAccel),
    vehicleSpeed: downsample(data.vehicleSpeed),
    timeMinutes: downsample(data.timeMinutes),
    railPressureActual: downsample(data.railPressureActual),
    railPressureDesired: downsample(data.railPressureDesired),
    pcvDutyCycle: downsample(data.pcvDutyCycle),
    boostDesired: downsample(data.boostDesired),
    turboVanePosition: downsample(data.turboVanePosition),
    turboVaneDesired: downsample(data.turboVaneDesired),
    exhaustGasTemp: downsample(data.exhaustGasTemp),
    converterSlip: downsample(data.converterSlip),
    converterDutyCycle: downsample(data.converterDutyCycle),
    converterPressure: downsample(data.converterPressure),
    currentGear: downsample(data.currentGear),
    oilPressure: downsample(data.oilPressure),
    coolantTemp: downsample(data.coolantTemp),
    oilTemp: downsample(data.oilTemp),
    transFluidTemp: downsample(data.transFluidTemp),
    barometricPressure: downsample(data.barometricPressure),
    throttlePosition: downsample(data.throttlePosition),
    fuelQuantity: downsample(data.fuelQuantity),
    // Cummins-specific channels
    turboSpeed: downsample(data.turboSpeed || []),
    exhaustPressure: downsample(data.exhaustPressure || []),
    batteryVoltage: downsample(data.batteryVoltage || []),
    dpfSootLevel: downsample(data.dpfSootLevel || []),
    egrPosition: downsample(data.egrPosition || []),
    egrTemp: downsample(data.egrTemp || []),
    intakeThrottlePosition: downsample(data.intakeThrottlePosition || []),
    intakeManifoldTemp: downsample(data.intakeManifoldTemp || []),
    chargeCoolerTemp: downsample(data.chargeCoolerTemp || []),
    pilot1Qty: downsample(data.pilot1Qty || []),
    pilot2Qty: downsample(data.pilot2Qty || []),
    pilot1Timing: downsample(data.pilot1Timing || []),
    pilot2Timing: downsample(data.pilot2Timing || []),
    post1Qty: downsample(data.post1Qty || []),
    post2Qty: downsample(data.post2Qty || []),
    post1Timing: downsample(data.post1Timing || []),
    post2Timing: downsample(data.post2Timing || []),
    regenState: downsample(data.regenState || []),
    cspTuneNumber: downsample(data.cspTuneNumber || []),
    fuelRegCurrent: downsample(data.fuelRegCurrent || []),
  };
}
/**
 * Create binned data for trend liness
 */
export function createBinnedData(
  data: ProcessedMetrics,
  binCount: number = 30
): Array<{
  rpmBin: number;
  mafMean: number;
  hpTorqueMean: number;
  hpMafMean: number;
  boostMean: number;
  count: number;
}> {
  const rpmMin = data.stats.rpmMin;
  const rpmMax = data.stats.rpmMax;
  const binSize = (rpmMax - rpmMin) / binCount;
  
  const bins: Map<number, { maf: number[]; hpTorque: number[]; hpMaf: number[]; boost: number[] }> = new Map();
  
  for (let i = 0; i < data.rpm.length; i++) {
    const binIndex = Math.floor((data.rpm[i] - rpmMin) / binSize);
    const binKey = rpmMin + binIndex * binSize + binSize / 2;
    
    if (!bins.has(binKey)) {
      bins.set(binKey, { maf: [], hpTorque: [], hpMaf: [], boost: [] });
    }
    
    const bin = bins.get(binKey)!;
    bin.maf.push(data.maf[i]);
    bin.hpTorque.push(data.hpTorque[i]);
    bin.hpMaf.push(data.hpMaf[i]);
    bin.boost.push(data.boost[i]);
  }
  
  return Array.from(bins.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rpmBin, values]) => ({
      rpmBin,
      mafMean: values.maf.reduce((a, b) => a + b, 0) / values.maf.length,
      hpTorqueMean: values.hpTorque.reduce((a, b) => a + b, 0) / values.hpTorque.length,
      hpMafMean: values.hpMaf.reduce((a, b) => a + b, 0) / values.hpMaf.length,
      boostMean: values.boost.reduce((a, b) => a + b, 0) / values.boost.length,
      count: values.maf.length,
    }));
}
