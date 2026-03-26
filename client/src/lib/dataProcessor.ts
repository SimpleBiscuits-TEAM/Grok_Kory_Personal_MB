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
  oilPressure: number[];
  coolantTemp: number[];
  oilTemp: number[];
  transFluidTemp: number[];
  barometricPressure: number[];
  boostSource: 'direct' | 'map_derived' | 'none'; // how boost was obtained
  boostActualAvailable: boolean; // false when MAP is all N/A — suppresses boost fault checks
  throttlePosition: number[];  // APP / TPS for drag detection
  pidSubstitutions: import('./pidSubstitution').PidSubstitution[]; // audit trail
  pidsMissing: string[];       // channels that had no valid substitute
  timestamp: string;
  duration: number;
  fileFormat: 'hptuners' | 'efilive' | 'bankspower';
  boostCalibration: BoostCalibrationInfo; // atmospheric correction audit
}

export interface ProcessedMetrics {
  rpm: number[];
  maf: number[];
  boost: number[];
  mapAbsolute: number[];      // Raw MAP psi absolute (for reference)
  hpTorque: number[];
  hpMaf: number[];
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
  oilPressure: number[];
  coolantTemp: number[];
  oilTemp: number[];
  transFluidTemp: number[];
  barometricPressure: number[];
  boostSource: 'direct' | 'map_derived' | 'none'; // provenance label for UI
  boostActualAvailable: boolean; // false when MAP was all N/A — suppresses boost fault checks
  throttlePosition: number[];  // APP / TPS for drag detection
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
    boostMax: number;
    duration: number;
  };
  fileFormat: 'hptuners' | 'efilive' | 'bankspower';
}

/**
 * Detect file format and parse accordingly
 */
export function parseCSV(content: string): DuramaxData {
  // Try to detect format
  const lines = content.split('\n').map(line => line.trim());
  
  // Check for Banks Power format (has "Horsepower ECU", "Torque ECU", "DYNO" columns)
  const isBanksPower = lines.some(line => 
    line.includes('Horsepower ECU') || 
    line.includes('DYNO - WHP') || 
    line.includes('Transmission Slip')
  );
  
  // EFILIVE format starts with "Frame", "Time", "Flags" and has "ECM.RPM", "ECM.MAF"
  const isEFILive = lines.some(line => line.includes('ECM.RPM') || line.includes('ECM.MAF'));
  
  if (isBanksPower) {
    return parseBanksPowerCSV(content);
  } else if (isEFILive) {
    return parseEFILiveCSV(content);
  } else {
    return parseHPTunersCSV(content);
  }
}

/**
 * Parse HP Tuners CSV format
 */
function parseHPTunersCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());
  
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Offset') && lines[i].includes('Mass Airflow')) {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    throw new Error('Could not find CSV header in HP Tuners log file');
  }
  
  const headers = lines[headerIndex].split(',').map(h => h.trim());
  
  const getColumnIndex = (keywords: string[]): number => {
    for (const keyword of keywords) {
      const idx = headers.findIndex(h => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  
  const offsetIdx = getColumnIndex(['Offset']);
  const mafIdx = getColumnIndex(['Mass Airflow']);
  // HP Tuners: 'Intake Manifold Absolute Pressure' is MAP in PSIA
  // Also try 'Boost Pressure' (PSIG) as a direct boost column
  const boostGaugePsigIdx = getColumnIndex(['Boost Pressure', 'Boost (psi)']);
  const boostIdx = getColumnIndex(['Intake Manifold Absolute Pressure', 'MAP']);
  const rpmIdx = getColumnIndex(['Engine RPM']);
  const torqueIdx = getColumnIndex(['Actual Engine Torque']);
  const maxTorqueIdx = getColumnIndex(['Maximum Engine Torque']);
  const speedIdx = getColumnIndex(['Vehicle Speed']);
  const fuelRateIdx = getColumnIndex(['Engine Fuel Rate']);
  const railActualIdx = getColumnIndex(['Fuel Rail Pressure']);
  const railDesiredIdx = getColumnIndex(['Desired Fuel Pressure']);
  const pcvIdx = getColumnIndex(['PCV', 'Pressure Regulator']);
  const boostDesiredIdx = getColumnIndex(['Desired Boost']);
  const turboVaneIdx = getColumnIndex(['Turbo Vane Position', 'Turbo A Vane Position']);
  const turboVaneDesiredIdx = getColumnIndex(['Desired Turbo Vane Position', 'Turbo Vane Desired', 'Turbo A Vane Desired']);
  const egtIdx = getColumnIndex(['Exhaust Gas Temperature', 'EGT']);
  const converterSlipIdx = getColumnIndex(['Converter Slip', 'TCM.TCSLIP']);
  const converterDutyIdx = getColumnIndex(['Converter Duty', 'Converter PWM']);
  const converterPressureIdx = getColumnIndex(['Converter Pressure', 'TCC Pressure']);
  const oilPressureIdx = getColumnIndex(['Engine Oil Pressure', 'Oil Pressure']);
  const coolantTempIdx = getColumnIndex(['Engine Coolant Temp', 'Coolant Temperature', 'ECT']);
  const oilTempIdx = getColumnIndex(['Engine Oil Temp', 'Oil Temperature', 'EOT']);
  const transFluidTempIdx = getColumnIndex(['Transmission Fluid Temp', 'Trans Fluid Temp', 'Trans Temp']);
  const baroIdx = getColumnIndex(['Barometric Pressure', 'Baro Pressure', 'Ambient Pressure']);
  const throttleIdx = getColumnIndex(['Accelerator Pedal Position', 'Throttle Position', 'Pedal Position', 'APP', 'Accel Pedal']);
  
  if (rpmIdx === -1 || mafIdx === -1 || torqueIdx === -1) {
    throw new Error('Missing required columns: RPM, MAF, or Torque');
  }
  
  const dataStart = headerIndex + 4;
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const throttlePosition: number[] = [];
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
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  const barometricPressure: number[] = [];
  
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('[')) break;
    
    const values = line.split(',').map(v => {
      const num = parseFloat(v.trim());
      return isNaN(num) ? 0 : num;
    });
    
    if (values.length < Math.max(rpmIdx, mafIdx, torqueIdx) + 1) continue;
    
    const baroVal = baroIdx !== -1 ? (values[baroIdx] || 14.7) : 14.7;
    const mapPsia = boostIdx !== -1 ? values[boostIdx] : 0;
    
    rpm.push(values[rpmIdx] || 0);
    maf.push(values[mafIdx] || 0);
    // HP Tuners 'Intake Manifold Absolute Pressure' is PSIA; store raw for fallback
    mapAbsolute.push(mapPsia);
    // If a direct gauge boost PID exists, use it; otherwise MAP - baro = gauge
    if (boostGaugePsigIdx !== -1) {
      boost.push(Math.max(0, values[boostGaugePsigIdx]));
    } else if (boostIdx !== -1) {
      boost.push(Math.max(0, mapPsia - baroVal));
    } else {
      boost.push(0);
    }
    torquePercent.push(values[torqueIdx] || 0);
    maxTorque.push(maxTorqueIdx !== -1 ? values[maxTorqueIdx] : 879.174);
    vehicleSpeed.push(speedIdx !== -1 ? values[speedIdx] : 0);
    fuelRate.push(fuelRateIdx !== -1 ? values[fuelRateIdx] : 0);
    offset.push(offsetIdx !== -1 ? values[offsetIdx] : i - dataStart);
    railPressureActual.push(railActualIdx !== -1 ? values[railActualIdx] : 0);
    railPressureDesired.push(railDesiredIdx !== -1 ? values[railDesiredIdx] : 0);
    pcvDutyCycle.push(pcvIdx !== -1 ? values[pcvIdx] : 0);
    boostDesired.push(boostDesiredIdx !== -1 ? values[boostDesiredIdx] : 0);
    turboVanePosition.push(turboVaneIdx !== -1 ? values[turboVaneIdx] : 0);
    turboVaneDesired.push(turboVaneDesiredIdx !== -1 ? values[turboVaneDesiredIdx] : 0);
    exhaustGasTemp.push(egtIdx !== -1 ? values[egtIdx] : 0);
    converterSlip.push(converterSlipIdx !== -1 ? values[converterSlipIdx] : 0);
    converterDutyCycle.push(converterDutyIdx !== -1 ? values[converterDutyIdx] : 0);
    converterPressure.push(converterPressureIdx !== -1 ? values[converterPressureIdx] : 0);
    oilPressure.push(oilPressureIdx !== -1 ? values[oilPressureIdx] : 0);
    coolantTemp.push(coolantTempIdx !== -1 ? values[coolantTempIdx] : 0);
    oilTemp.push(oilTempIdx !== -1 ? values[oilTempIdx] : 0);
    transFluidTemp.push(transFluidTempIdx !== -1 ? values[transFluidTempIdx] : 0);
    barometricPressure.push(baroVal);
    throttlePosition.push(throttleIdx !== -1 ? values[throttleIdx] : 0);
  }
  
  if (rpm.length === 0) {
    throw new Error('No valid data rows found in CSV');
  }
  
  const duration = offset[offset.length - 1] - offset[0];
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
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    boostSource: hpBoostSource,
    // HP Tuners: boost is direct or MAP-derived; actual is available if any non-zero values exist
    boostActualAvailable: boost.some(v => v > 0),
    pidSubstitutions: [],
    pidsMissing: [],
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
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

  // ── Core engine PIDs ──────────────────────────────────────────────────────
  const timeIdx          = getColumnIndex(['Time']);
  const rpmIdx           = getColumnIndex(['ECM.RPM']);
  const mafIdx           = getColumnIndex(['ECM.MAF']);
  // MAP (Manifold Absolute Pressure) used as boost proxy for LML/L5P
  const mapIdx           = getColumnIndex(['ECM.MAP']);
  // Boost desired: LML uses ECM.TCDBPR (Turbocharger Desired Boost Pressure)
  const boostDesiredIdx  = getColumnIndex(['ECM.TCDBPR', 'ECM.DESTQ', 'ECM.MAPDES']);
  // Torque: LML logs ECM.TQ_DD (Driver Demanded) or ECM.TQ_ACT
  const torqueIdx        = getColumnIndex(['ECM.TQ_ACT', 'ECM.TQ_DD']);
  const maxTorqueIdx     = getColumnIndex(['ECM.TQ_REF']);
  const speedIdx         = getColumnIndex(['ECM.VSS']);
  const fuelRateIdx      = getColumnIndex(['ECM.FUEL_RATE', 'ECM.FUELRCALC']);

  // ── Fuel rail PIDs ────────────────────────────────────────────────────────
  const railActualIdx    = getColumnIndex(['ECM.FRP_A']);
  const railDesiredIdx   = getColumnIndex(['ECM.FRPDI']);
  // PCV desired current (mA) — what the ECM commands the PCV solenoid
  const pcvIdx           = getColumnIndex(['ECM.FRPVDC']);
  // PCV measured current (mA) — actual solenoid feedback
  const pcvMeasIdx       = getColumnIndex(['ECM.FRPVAC']);

  // ── Turbo / VGT PIDs ─────────────────────────────────────────────────────
  const turboVaneIdx         = getColumnIndex(['ECM.TCVPOS']);
  const turboVaneDesiredIdx  = getColumnIndex(['ECM.TCVDES', 'ECM.TCVCMD']);

  // ── EGT PIDs — LML has up to 5 sensors ───────────────────────────────────
  // Use EGTS1 (pre-DPF) as primary; fall back to any EGTS
  const egtIdx = getColumnIndex(['ECM.EGTS1']);

  // ── Transmission / TCC PIDs ───────────────────────────────────────────────
  // TCM.TCCSLIP = actual TCC slip in RPM (the real slip value)
  // TCM.TCSLIP  = TCC reference slip target (what the TCM wants)
  // TCM.TCCPCSCP = TCC PCS commanded pressure (kPa) — 1050 kPa = full lock
  // TCM.TCCP    = TCC commanded pressure (older naming)
  const tccActualSlipIdx   = getColumnIndex(['TCM.TCCSLIP']);
  const tccRefSlipIdx      = getColumnIndex(['TCM.TCSLIP']);
  const tccPcsIdx          = getColumnIndex(['TCM.TCCPCSCP']);
  const tccPressureIdx     = getColumnIndex(['TCM.TCCP']);
  // Use TCCPCSCP as the primary duty/pressure signal; fall back to TCCP
  const converterDutyIdx   = tccPcsIdx !== -1 ? tccPcsIdx : tccPressureIdx;
  // Actual slip = TCCSLIP; reference slip = TCSLIP (used as fallback)
  const converterSlipIdx   = tccActualSlipIdx !== -1 ? tccActualSlipIdx : tccRefSlipIdx;

  // ── Other sensor PIDs ────────────────────────────────────────────────────
  const oilPressureIdx    = getColumnIndex(['ECM.OILP']);
  const coolantTempIdx    = getColumnIndex(['ECM.ECT']);
  const oilTempIdx        = getColumnIndex(['ECM.EOT']);
  const transFluidTempIdx = getColumnIndex(['TCM.TFT']);
  const baroIdx           = getColumnIndex(['ECM.BARO']);
  const throttleIdx       = getColumnIndex(['ECM.TPS', 'ECM.THROTTLE', 'ECM.APP', 'Accelerator Pedal Position', 'Throttle Position']);

  // ── Validate required columns ────────────────────────────────────────────
  // For LML EFILive logs, torque may not be present (e.g. transmission-only logs)
  // so we only require RPM and MAF as hard requirements.
  if (rpmIdx === -1 || mafIdx === -1) {
    throw new Error(
      'Missing required EFILive columns: ECM.RPM and/or ECM.MAF. ' +
      'Ensure your EFILive scan tool logged these PIDs.'
    );
  }

  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const throttlePosition: number[] = [];
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
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  const barometricPressure: number[] = [];

  // EFILive data starts at row 3 (after PID codes, descriptions, units)
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

    const rpmVal = parseVal(rpmIdx);
    if (isNaN(rpmVal)) continue; // skip rows with no RPM data

    rpm.push(rpmVal);
    // ECM.MAF is in g/s — convert to lb/min (imperial) for consistency with HP Tuners
    // 1 g/s = 0.132277 lb/min
    const mafGps = parseVal(mafIdx);
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

    // Rail pressure: EFILive logs in kPa; convert to psi
    // 1 kPa = 0.145038 psi
    const railActKpa = parseVal(railActualIdx);
    const railDesKpa = parseVal(railDesiredIdx);
    railPressureActual.push(isNaN(railActKpa) ? 0 : railActKpa * 0.145038);
    railPressureDesired.push(isNaN(railDesKpa) ? 0 : railDesKpa * 0.145038);

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
  }

  if (rpm.length === 0) {
    throw new Error('No valid data rows found in EFILive CSV. Check that the file is a valid EFILive datalog export.');
  }

  const duration = offset[offset.length - 1] - offset[0];

  return {
    rpm,
    maf,
    boost,
    mapAbsolute,
    throttlePosition,
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
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    boostSource: mapIdx !== -1 ? 'map_derived' : 'none',
    // EFILive: MAP is the actual boost source. If MAP was all N/A the boost array is all zeros.
    // Detect this by checking if any boost value is non-zero AND mapIdx was found.
    // A log where MAP is not in the scan list will have mapIdx === -1 OR all-zero boost.
    boostActualAvailable: mapIdx !== -1 && boost.some(v => v > 0),
    pidSubstitutions: [],
    pidsMissing: [],
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
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
  const timeIdx = getColumnIndex(['TIME']);
  const rpmIdx = getColumnIndex(['Engine RPM']);
  const mafIdx = getColumnIndex(['Mass Air Flow']);
  // Use 'Boost Pressure' (gauge, PSIG) if available; fall back to MAP absolute
  const boostGaugeIdx = getColumnIndex(['Boost Pressure']);
  const mapIdx = getColumnIndex(['Manifold Absolute Pressure']);
  const torqueIdx = getColumnIndex(['Torque ECU']);
  const hpIdx = getColumnIndex(['Horsepower ECU']);
  const speedIdx = getColumnIndex(['Vehicle Speed']);
  const fuelRateIdx = getColumnIndex(['Fuel Flow Rate', 'Cylinder Fuel Rate']);
  const railActualIdx = getColumnIndex(['Fuel Rail Pressure']);
  const railDesiredIdx = getColumnIndex(['FRP Commanded']);
  const pcvIdx = -1; // Banks Power does not log PCV duty cycle — leave unmapped
  // MAP Commanded is absolute (PSIA); subtract ambient to get gauge
  const mapCommandedIdx = getColumnIndex(['MAP Commanded']);
  const ambientIdx = getColumnIndex(['Ambient Air Pressure', 'B-Bus Ambient Air Pressure']);
  const turboVaneIdx = getColumnIndex(['Turbo Vane Position']);
  const turboVaneDesiredIdx = getColumnIndex(['Turbo Vane Position Desired', 'Desired Turbo Vane Position', 'Turbo Vane Desired']);
  const egtIdx = getColumnIndex(['EGT1 - Diesel Oxidization CAT (DOC) Inlet', 'EGT1 - Diesel Oxidization CAT', 'EGT - Turbo Inlet Temperature']);
  const converterSlipIdx = getColumnIndex(['Transmission Slip']);
  const converterDutyIdx = getColumnIndex(['Torque Converter Status']);
  const converterPressureIdx = getColumnIndex(['Trans Line 1 Pressure']);
  const oilPressureIdx = getColumnIndex(['Engine Oil Pressure', 'Oil Pressure']);
  const coolantTempIdx = getColumnIndex(['Engine Coolant Temp', 'Coolant Temp']);
  const oilTempIdx = getColumnIndex(['Engine Oil Temp', 'Oil Temp']);
  const transFluidTempIdx = getColumnIndex(['Transmission Fluid Temp', 'Trans Fluid Temp']);
  const throttleIdx = getColumnIndex(['Accelerator Pedal Position', 'Throttle Position', 'Pedal Position', 'APP', 'Accel Pedal']);
  
  if (rpmIdx === -1 || mafIdx === -1) {
    throw new Error('Missing required columns in Banks Power format: Engine RPM or Mass Air Flow');
  }
  
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const mapAbsolute: number[] = [];
  const throttlePosition: number[] = [];
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
    
    // Banks Power provides actual torque and HP, not percentages
    // Convert torque to percentage if we have max torque reference
    if (torqueIdx !== -1 && hpIdx !== -1) {
      // Use torque directly, assume 879 lb-ft reference
      torquePercent.push((values[torqueIdx] / 879.174) * 100);
      maxTorque.push(879.174);
    } else {
      torquePercent.push(0);
      maxTorque.push(879.174);
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
    exhaustGasTemp.push(egtIdx !== -1 ? values[egtIdx] : 0);
    converterSlip.push(converterSlipIdx !== -1 ? values[converterSlipIdx] : 0);
    converterDutyCycle.push(converterDutyIdx !== -1 ? values[converterDutyIdx] : 0);
    converterPressure.push(converterPressureIdx !== -1 ? values[converterPressureIdx] : 0);
    oilPressure.push(oilPressureIdx !== -1 ? values[oilPressureIdx] : 0);
    coolantTemp.push(coolantTempIdx !== -1 ? values[coolantTempIdx] : 0);
    oilTemp.push(oilTempIdx !== -1 ? values[oilTempIdx] : 0);
    transFluidTemp.push(transFluidTempIdx !== -1 ? values[transFluidTempIdx] : 0);
    barometricPressure.push(ambientVal);
    throttlePosition.push(throttleIdx !== -1 ? values[throttleIdx] : 0);
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
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    barometricPressure,
    mapAbsolute,
    throttlePosition,
    boostSource: boostGaugeIdx !== -1 ? 'direct' : mapIdx !== -1 ? 'map_derived' : 'none',
    boostActualAvailable: boost.some(v => v > 0),
    pidSubstitutions: [],
    pidsMissing: [],
    boostCalibration: { corrected: false, atmosphericOffsetPsi: 0, method: 'none', idleBaselinePsia: 0, idleSampleCount: 0, desiredAlreadyGauge: true },
    timestamp: new Date().toLocaleString(),
    duration,
    fileFormat: 'bankspower',
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

  const stats = {
    rpmMin: Math.min(...rawData.rpm),
    rpmMax: Math.max(...rawData.rpm),
    rpmMean: rawData.rpm.reduce((a, b) => a + b, 0) / rawData.rpm.length,
    mafMin: Math.min(...rawData.maf),
    mafMax: Math.max(...rawData.maf),
    mafMean: rawData.maf.reduce((a, b) => a + b, 0) / rawData.maf.length,
    hpTorqueMax: Math.max(...hpTorque),
    hpMafMax: Math.max(...hpMaf),
    boostMax: Math.max(...boost),
    duration: rawData.duration,
  };
  
  return {
    rpm: rawData.rpm,
    maf: rawData.maf,
    boost,
    mapAbsolute: rawData.mapAbsolute,
    hpTorque,
    hpMaf,
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
    oilPressure: rawData.oilPressure,
    coolantTemp: rawData.coolantTemp,
    oilTemp: rawData.oilTemp,
    transFluidTemp: rawData.transFluidTemp,
    barometricPressure: rawData.barometricPressure,
    boostSource: rawData.boostSource,
    boostActualAvailable: rawData.boostActualAvailable,
    throttlePosition: rawData.throttlePosition,
    pidSubstitutions: rawData.pidSubstitutions,
    pidsMissing: rawData.pidsMissing,
    boostCalibration,
    stats,
    fileFormat: rawData.fileFormat,
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
    oilPressure: downsample(data.oilPressure),
    coolantTemp: downsample(data.coolantTemp),
    oilTemp: downsample(data.oilTemp),
    transFluidTemp: downsample(data.transFluidTemp),
    barometricPressure: downsample(data.barometricPressure),
  };
}

/**
 * Create binned data for trend lines
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
