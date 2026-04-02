/**
 * PPEI AI — Universal PID Substitution Engine
 *
 * When a primary PID is missing from a datalog (column absent, all-zero, or
 * all-NaN), this engine automatically selects the best available substitute
 * and records every substitution so the UI can display a transparent audit
 * trail to the user.
 *
 * Substitution rules are defined per logical channel. Each rule lists:
 *   - primary:      the preferred PID / column keyword
 *   - substitutes:  ordered fallback list (first valid one wins)
 *   - transform:    optional function to convert substitute units → primary units
 *   - reason:       human-readable explanation shown in the UI
 */

export interface PidSubstitution {
  channel: string;          // logical name, e.g. "Boost Pressure"
  primaryAttempted: string; // what we looked for first
  usedPid: string;          // what we actually ended up using
  transform: string;        // description of any unit conversion applied
  reason: string;           // why the substitution was needed
  confidence: 'high' | 'medium' | 'low';
}

export interface PidResolutionResult {
  /** Resolved numeric arrays, keyed by logical channel name */
  channels: Record<string, number[]>;
  /** All substitutions that were applied */
  substitutions: PidSubstitution[];
  /** Channels that could not be resolved even with substitution */
  missing: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns true if an array is "empty" — all zeros, all NaN, or length 0 */
function isFlat(arr: number[]): boolean {
  if (arr.length === 0) return true;
  const nonZero = arr.filter(v => !isNaN(v) && v !== 0);
  // Flat if fewer than 2% of samples have non-zero values
  return nonZero.length < arr.length * 0.02;
}

/** Compute idle baseline (first 15 s at RPM < 900) for absolute-pressure PIDs */
function idleBaseline(rpm: number[], values: number[], offsets: number[]): number {
  const start = offsets[0] ?? 0;
  const samples = values.filter((v, i) =>
    v > 0 && !isNaN(v) && rpm[i] < 900 && rpm[i] > 0 && (offsets[i] - start) <= 15
  );
  if (samples.length >= 3) return samples.reduce((a, b) => a + b, 0) / samples.length;
  // Fallback: median of all low-RPM samples
  const low = values
    .filter((v, i) => v > 0 && !isNaN(v) && rpm[i] > 0 && rpm[i] < 800)
    .sort((a, b) => a - b);
  return low.length > 0 ? low[Math.floor(low.length / 2)] : 14.696;
}

// ─── Column finder helpers ───────────────────────────────────────────────────

type HeaderFinder = (keywords: string[], exclude?: (h: string) => boolean) => number;

function makeColumnFinder(headers: string[]): HeaderFinder {
  return (keywords: string[], exclude?: (h: string) => boolean) => {
    for (const kw of keywords) {
      const exact = headers.findIndex((h, _i) => h === kw && (!exclude || !exclude(h)));
      if (exact !== -1) return exact;
    }
    for (const kw of keywords) {
      const sub = headers.findIndex(h => h.toLowerCase().includes(kw.toLowerCase()) && (!exclude || !exclude(h)));
      if (sub !== -1) return sub;
    }
    return -1;
  };
}

function extractColumn(rows: number[][], idx: number): number[] {
  if (idx === -1) return [];
  return rows.map(r => (idx < r.length ? r[idx] : NaN));
}

// ─── Main resolution function ────────────────────────────────────────────────

/**
 * Resolve all logical channels from a parsed CSV.
 *
 * @param headers  Array of column header strings (already cleaned/trimmed)
 * @param rows     2D array of numeric values (NaN for unparseable cells)
 * @param rpm      Pre-extracted RPM array (needed for baseline calculations)
 * @param offsets  Pre-extracted time/offset array
 * @param format   File format hint for format-specific PID names
 */
export function resolvePids(
  headers: string[],
  rows: number[][],
  rpm: number[],
  offsets: number[],
  format: 'hptuners' | 'efilive' | 'bankspower' | 'ezlynk'
): PidResolutionResult {
  const find = makeColumnFinder(headers);
  const col = (idx: number) => extractColumn(rows, idx);

  const channels: Record<string, number[]> = {};
  const substitutions: PidSubstitution[] = [];
  const missing: string[] = [];

  // ─── Boost Pressure ──────────────────────────────────────────────────────
  // Priority: direct gauge PID → MAP absolute (subtract idle baseline) → zero
  {
    const directIdx = find(['Boost Pressure', 'Boost (psi)', 'Boost (PSI)', 'ECM.BOOST', 'PCM.BOOST_M']);
    // IMPORTANT: Exclude exhaust-side headers ("Exhaust MAP", "Exhaust Manifold Absolute Pressure")
    // which are backpressure, NOT intake boost.
    const isExhaust = (h: string) => /exhaust/i.test(h);
    const mapAbsIdx = find([
      'ECM.MAP', 'PCM.MAP',               // EFILive absolute kPa
      'Intake Manifold Absolute Pressure', // HP Tuners absolute PSIA
      'Manifold Absolute Pressure',
      'MAP',
    ], isExhaust);
    const baroIdx = find([
      'ECM.BARO', 'PCM.BARO', 'Barometric Pressure', 'Baro Pressure', 'Ambient Air Pressure',
      'B-Bus Ambient Air Pressure',
    ]);

    const directArr = directIdx !== -1 ? col(directIdx) : [];
    const mapArr = mapAbsIdx !== -1 ? col(mapAbsIdx) : [];
    const baroArr = baroIdx !== -1 ? col(baroIdx) : [];

    if (directIdx !== -1 && !isFlat(directArr)) {
      // Direct gauge boost PID — use as-is
      channels['boost'] = directArr.map(v => Math.max(0, isNaN(v) ? 0 : v));
    } else if (mapAbsIdx !== -1 && !isFlat(mapArr)) {
      // Determine if MAP is in kPa (EFILive) or PSIA (HP Tuners / Banks)
      const maxMap = Math.max(...mapArr.filter(v => !isNaN(v)));
      let mapPsia: number[];

      if (maxMap > 50) {
        // kPa range — convert to PSIA first
        mapPsia = mapArr.map(v => isNaN(v) ? 0 : v * 0.145038);
        const baroKpa = baroArr.length > 0 && !isFlat(baroArr)
          ? baroArr.filter(v => !isNaN(v) && v > 0).reduce((a, b) => a + b, 0) /
            baroArr.filter(v => !isNaN(v) && v > 0).length
          : 101.325;
        const baroPsia = baroKpa * 0.145038;
        const baseline = idleBaseline(rpm, mapPsia, offsets);
        const ref = Math.min(baseline, baroPsia);
        channels['boost'] = mapPsia.map(v => Math.max(0, v - ref));

        substitutions.push({
          channel: 'Boost Pressure',
          primaryAttempted: directIdx !== -1 ? headers[directIdx] : 'Boost Pressure PID',
          usedPid: headers[mapAbsIdx],
          transform: `MAP kPa → PSIA → subtract idle baseline (${ref.toFixed(2)} psia) → PSIG`,
          reason: directIdx === -1
            ? 'No direct boost gauge PID found in this log. MAP (absolute) was used and zero-referenced to idle.'
            : 'Direct boost PID was present but reading flat/zero. MAP substituted.',
          confidence: 'high',
        });
      } else {
        // Already PSIA (HP Tuners range ~14–50 psia)
        mapPsia = mapArr.map(v => isNaN(v) ? 0 : v);
        const baseline = idleBaseline(rpm, mapPsia, offsets);
        channels['boost'] = mapPsia.map(v => Math.max(0, v - baseline));

        substitutions.push({
          channel: 'Boost Pressure',
          primaryAttempted: directIdx !== -1 ? headers[directIdx] : 'Boost Pressure PID',
          usedPid: headers[mapAbsIdx],
          transform: `MAP PSIA − idle baseline (${baseline.toFixed(2)} psia) → PSIG`,
          reason: directIdx === -1
            ? 'No direct boost gauge PID found. MAP (absolute PSIA) was zero-referenced to idle to derive gauge pressure.'
            : 'Direct boost PID was flat. MAP substituted.',
          confidence: 'high',
        });
      }
    } else {
      channels['boost'] = new Array(rpm.length).fill(0);
      missing.push('Boost Pressure');
    }
  }

  // ─── Boost Desired ────────────────────────────────────────────────────────
  {
    const desIdx = find([
      'ECM.TCDBPR', 'ECM.MAPDES', 'PCM.TCDBPR', 'PCM.MAPDES',
      'Desired Boost', 'MAP Commanded', 'Boost Desired', 'Boost Target',
    ]);
    const baroIdx = find(['ECM.BARO', 'Barometric Pressure', 'Baro Pressure', 'Ambient Air Pressure']);
    const desArr = desIdx !== -1 ? col(desIdx) : [];
    const baroArr = baroIdx !== -1 ? col(baroIdx) : [];

    if (desIdx !== -1 && !isFlat(desArr)) {
      const maxDes = Math.max(...desArr.filter(v => !isNaN(v)));
      if (maxDes > 50) {
        // kPa absolute
        const baroKpa = baroArr.length > 0 && !isFlat(baroArr)
          ? baroArr.filter(v => !isNaN(v) && v > 0).reduce((a, b) => a + b, 0) /
            baroArr.filter(v => !isNaN(v) && v > 0).length
          : 101.325;
        channels['boostDesired'] = desArr.map(v =>
          isNaN(v) ? 0 : Math.max(0, (v - baroKpa) * 0.145038)
        );
      } else if (maxDes > 14) {
        // PSIA
        const baseline = idleBaseline(rpm, desArr.map(v => isNaN(v) ? 0 : v), offsets);
        channels['boostDesired'] = desArr.map(v => isNaN(v) ? 0 : Math.max(0, v - baseline));
      } else {
        // Already PSIG
        channels['boostDesired'] = desArr.map(v => isNaN(v) ? 0 : Math.max(0, v));
      }
    } else {
      channels['boostDesired'] = new Array(rpm.length).fill(0);
      if (desIdx === -1) missing.push('Boost Desired');
    }
  }

  // ─── Rail Pressure Actual ─────────────────────────────────────────────────
  {
    const railIdx = find([
      'ECM.FRP_A', 'PCM.FRPACT', 'PCM.FRP_C',
      'Fuel Rail Pressure', 'Rail Pressure', 'FRP Actual',
    ]);
    const railArr = railIdx !== -1 ? col(railIdx) : [];

    if (railIdx !== -1 && !isFlat(railArr)) {
      const maxRail = Math.max(...railArr.filter(v => !isNaN(v)));
      const railHeader = headers[railIdx].toUpperCase();
      // LB7 FRPACT/FRPDES in MPa (typical peak ~180 MPa); LML/L5P in kPa (~180000 kPa)
      if (maxRail < 500 && (railHeader.includes('FRPACT') || railHeader.includes('FRPDES'))) {
        // MPa → PSI (1 MPa = 145.038 PSI)
        channels['railPressureActual'] = railArr.map(v => isNaN(v) ? 0 : v * 145.038);
        substitutions.push({
          channel: 'Rail Pressure Actual',
          primaryAttempted: headers[railIdx],
          usedPid: headers[railIdx],
          transform: 'MPa × 145.038 → PSI',
          reason: 'LB7 EFILive logs rail pressure in MPa. Converted to PSI for consistency.',
          confidence: 'high',
        });
      } else if (maxRail > 5000) {
        channels['railPressureActual'] = railArr.map(v => isNaN(v) ? 0 : v * 0.145038);
        substitutions.push({
          channel: 'Rail Pressure Actual',
          primaryAttempted: headers[railIdx],
          usedPid: headers[railIdx],
          transform: 'kPa × 0.145038 → PSI',
          reason: 'EFILive logs rail pressure in kPa. Converted to PSI for consistency.',
          confidence: 'high',
        });
      } else {
        channels['railPressureActual'] = railArr.map(v => isNaN(v) ? 0 : v);
      }
    } else {
      channels['railPressureActual'] = new Array(rpm.length).fill(0);
      missing.push('Rail Pressure Actual');
    }
  }

  // ─── Rail Pressure Desired ────────────────────────────────────────────────
  {
    const desIdx = find([
      'ECM.FRPDI', 'PCM.FRPDES',
      'Desired Fuel Pressure', 'FRP Commanded', 'Rail Pressure Desired',
    ]);
    const desArr = desIdx !== -1 ? col(desIdx) : [];

    if (desIdx !== -1 && !isFlat(desArr)) {
      const maxDes = Math.max(...desArr.filter(v => !isNaN(v)));
      const desHeader = headers[desIdx].toUpperCase();
      if (maxDes < 500 && (desHeader.includes('FRPACT') || desHeader.includes('FRPDES'))) {
        // MPa → PSI
        channels['railPressureDesired'] = desArr.map(v => isNaN(v) ? 0 : v * 145.038);
      } else {
        channels['railPressureDesired'] = desArr.map(v =>
          isNaN(v) ? 0 : maxDes > 5000 ? v * 0.145038 : v
        );
      }
    } else {
      channels['railPressureDesired'] = new Array(rpm.length).fill(0);
    }
  }

  // ─── PCV / Fuel Pressure Regulator ───────────────────────────────────────
  // Primary: PCV measured current (mA). Fallback: PCV desired current or duty %
  {
    const pcvMeasIdx = find(['ECM.FRPVAC', 'PCM.FRPACOM', 'PCV Measured', 'PCV Current Actual']);
    const pcvDesIdx  = find(['ECM.FRPVDC', 'PCM.FRPACOM', 'PCV', 'Pressure Regulator', 'PCV Duty']);
    const pcvMeasArr = pcvMeasIdx !== -1 ? col(pcvMeasIdx) : [];
    const pcvDesArr  = pcvDesIdx  !== -1 ? col(pcvDesIdx)  : [];

    if (pcvMeasIdx !== -1 && !isFlat(pcvMeasArr)) {
      channels['pcvDutyCycle'] = pcvMeasArr.map(v => isNaN(v) ? 0 : v);
    } else if (pcvDesIdx !== -1 && !isFlat(pcvDesArr)) {
      channels['pcvDutyCycle'] = pcvDesArr.map(v => isNaN(v) ? 0 : v);
      if (pcvMeasIdx !== -1) {
        substitutions.push({
          channel: 'PCV Current',
          primaryAttempted: headers[pcvMeasIdx],
          usedPid: headers[pcvDesIdx],
          transform: 'none (same units)',
          reason: 'PCV measured current was flat. Using PCV desired current as proxy. Deviation analysis may be limited.',
          confidence: 'medium',
        });
      }
    } else {
      channels['pcvDutyCycle'] = new Array(rpm.length).fill(0);
    }
  }

  // ─── MAF ─────────────────────────────────────────────────────────────────
  {
    const mafIdx = find(['ECM.MAF', 'PCM.MAF', 'Mass Airflow', 'Mass Air Flow', 'MAF']);
    const mafArr = mafIdx !== -1 ? col(mafIdx) : [];
    channels['maf'] = mafIdx !== -1 ? mafArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
    if (mafIdx === -1) missing.push('MAF');
  }

  // ─── Vehicle Speed ────────────────────────────────────────────────────────
  {
    const speedIdx = find(['ECM.VSS', 'PCM.VSS', 'Vehicle Speed', 'Speed (MPH)', 'Speed']);
    const speedArr = speedIdx !== -1 ? col(speedIdx) : [];
    channels['vehicleSpeed'] = speedIdx !== -1 ? speedArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
  }

  // ─── Coolant Temp ─────────────────────────────────────────────────────────
  // EFILive: °C → convert to °F. HP Tuners: already °F
  {
    const ectIdx = find(['ECM.ECT', 'PCM.ECT', 'Engine Coolant Temp', 'Coolant Temperature', 'ECT', 'Coolant Temp']);
    const ectArr = ectIdx !== -1 ? col(ectIdx) : [];

    if (ectIdx !== -1 && !isFlat(ectArr)) {
      const maxEct = Math.max(...ectArr.filter(v => !isNaN(v)));
      if (maxEct < 150 && format === 'efilive') {
        // Celsius — convert to Fahrenheit
        channels['coolantTemp'] = ectArr.map(v =>
          isNaN(v) || v <= -40 ? 0 : (v * 9 / 5) + 32
        );
        substitutions.push({
          channel: 'Coolant Temp',
          primaryAttempted: headers[ectIdx],
          usedPid: headers[ectIdx],
          transform: '°C × 9/5 + 32 → °F',
          reason: 'EFILive logs coolant temp in Celsius. Converted to Fahrenheit.',
          confidence: 'high',
        });
      } else {
        channels['coolantTemp'] = ectArr.map(v => isNaN(v) || v <= -40 ? 0 : v);
      }
    } else {
      channels['coolantTemp'] = new Array(rpm.length).fill(0);
    }
  }

  // ─── Oil Temp ─────────────────────────────────────────────────────────────
  {
    const eotIdx = find(['ECM.EOT', 'PCM.EOT', 'Engine Oil Temp', 'Oil Temperature', 'EOT', 'Oil Temp']);
    const eotArr = eotIdx !== -1 ? col(eotIdx) : [];
    if (eotIdx !== -1 && !isFlat(eotArr)) {
      const maxEot = Math.max(...eotArr.filter(v => !isNaN(v)));
      channels['oilTemp'] = eotArr.map(v =>
        isNaN(v) || v <= -40 ? 0 : (maxEot < 150 && format === 'efilive') ? (v * 9 / 5) + 32 : v
      );
    } else {
      channels['oilTemp'] = new Array(rpm.length).fill(0);
    }
  }

  // ─── Trans Fluid Temp ─────────────────────────────────────────────────────
  {
    const tftIdx = find(['TCM.TFT', 'Transmission Fluid Temp', 'Trans Fluid Temp', 'Trans Temp']);
    const tftArr = tftIdx !== -1 ? col(tftIdx) : [];
    if (tftIdx !== -1 && !isFlat(tftArr)) {
      const maxTft = Math.max(...tftArr.filter(v => !isNaN(v)));
      channels['transFluidTemp'] = tftArr.map(v =>
        isNaN(v) || v <= -40 ? 0 : (maxTft < 150 && format === 'efilive') ? (v * 9 / 5) + 32 : v
      );
    } else {
      channels['transFluidTemp'] = new Array(rpm.length).fill(0);
    }
  }  // ─── EGT ───────────────────────────────────────────────────────────────────────
  // Scan ALL EGT-matching columns and pick the one with the highest peak reading.
  {
    const egtKeywords = [
      'ECM.EGTS1', 'ECM.EGTS2', 'ECM.EGTS3', 'ECM.EGTS4', 'ECM.EGTS5', 'ECM.EGTS', 'ECM.EGT',
      'PCM.EGTS1', 'PCM.EGTS2', 'PCM.EGTS', 'PCM.EGT',
      'Exhaust Gas Temperature', 'EGT1 - Diesel Oxidization CAT (DOC) Inlet',
      'EGT1 - Diesel Oxidization CAT', 'EGT - Turbo Inlet Temperature', 'EGT',
    ];
    // Find ALL matching EGT column indices
    const egtCandidateIdxs: number[] = [];
    for (const kw of egtKeywords) {
      for (let hi = 0; hi < headers.length; hi++) {
        if (headers[hi] === kw || headers[hi].toLowerCase().includes(kw.toLowerCase())) {
          if (!egtCandidateIdxs.includes(hi)) egtCandidateIdxs.push(hi);
        }
      }
    }
    // Pick the candidate with the highest peak value
    let bestArr: number[] = [];
    let bestPeak = -Infinity;
    for (const idx of egtCandidateIdxs) {
      const arr = col(idx);
      if (isFlat(arr)) continue;
      const peak = Math.max(...arr.filter(v => !isNaN(v)));
      if (peak > bestPeak) { bestPeak = peak; bestArr = arr; }
    }
    if (bestArr.length > 0 && !isFlat(bestArr)) {
      const maxEgt = Math.max(...bestArr.filter(v => !isNaN(v)));
      channels['exhaustGasTemp'] = bestArr.map(v =>
        isNaN(v) || v <= -40 ? 0 : (maxEgt < 800 && format === 'efilive') ? (v * 9 / 5) + 32 : v
      );
    } else {
      channels['exhaustGasTemp'] = new Array(rpm.length).fill(0);
    }
  }// ─── TCC Slip ─────────────────────────────────────────────────────────────
  {
    const slipIdx = find(['TCM.TCCSLIP', 'TCM.TCSLIP', 'Converter Slip', 'Transmission Slip', 'TCC Slip']);
    const slipArr = slipIdx !== -1 ? col(slipIdx) : [];
    channels['converterSlip'] = slipIdx !== -1 ? slipArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
  }

  // ─── TCC Commanded Pressure / Duty ────────────────────────────────────────
  {
    const tccPcsIdx = find(['TCM.TCCPCSCP', 'TCM.TCCP', 'TCM.TCCDC', 'Converter Duty', 'Converter PWM', 'TCC Pressure', 'Torque Converter Status']);
    const tccArr = tccPcsIdx !== -1 ? col(tccPcsIdx) : [];
    channels['converterDutyCycle'] = tccPcsIdx !== -1 ? tccArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
  }

  // ─── Turbo Vane Position ──────────────────────────────────────────────────
  {
    const vaneIdx = find(['ECM.TCVPOS', 'PCM.TCVPOS', 'Turbo Vane Position', 'Turbo A Vane Position']);
    const vaneDesIdx = find(['ECM.TCVDES', 'ECM.TCVCMD', 'PCM.TCVDES', 'Desired Turbo Vane Position', 'Turbo Vane Desired', 'Turbo Vane Position Desired']);
    const vaneArr = vaneIdx !== -1 ? col(vaneIdx) : [];
    const vaneDesArr = vaneDesIdx !== -1 ? col(vaneDesIdx) : [];
    channels['turboVanePosition'] = vaneIdx !== -1 ? vaneArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
    channels['turboVaneDesired'] = vaneDesIdx !== -1 ? vaneDesArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
  }

  // ─── Oil Pressure ─────────────────────────────────────────────────────────
  {
    const oilIdx = find(['ECM.OILP', 'PCM.OILP', 'Engine Oil Pressure', 'Oil Pressure']);
    const oilArr = oilIdx !== -1 ? col(oilIdx) : [];
    channels['oilPressure'] = oilIdx !== -1 ? oilArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
  }

  // ─── Barometric Pressure ──────────────────────────────────────────────────
  {
    const baroIdx = find(['ECM.BARO', 'PCM.BARO', 'Barometric Pressure', 'Baro Pressure', 'Ambient Air Pressure', 'B-Bus Ambient Air Pressure']);
    const baroArr = baroIdx !== -1 ? col(baroIdx) : [];
    if (baroIdx !== -1 && !isFlat(baroArr)) {
      const maxBaro = Math.max(...baroArr.filter(v => !isNaN(v)));
      // EFILive kPa → PSI
      channels['barometricPressure'] = baroArr.map(v =>
        isNaN(v) ? 14.696 : maxBaro > 50 ? v * 0.145038 : v
      );
    } else {
      channels['barometricPressure'] = new Array(rpm.length).fill(14.696);
    }
  }

  // ─── Fuel Rate ────────────────────────────────────────────────────────────
  {
    const fuelIdx = find(['ECM.FUEL_RATE', 'ECM.FUELRCALC', 'PCM.FUEL_RATE', 'Engine Fuel Rate', 'Fuel Flow Rate', 'Cylinder Fuel Rate']);
    const fuelArr = fuelIdx !== -1 ? col(fuelIdx) : [];
    channels['fuelRate'] = fuelIdx !== -1 ? fuelArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
  }

  // ─── Torque Percent ───────────────────────────────────────────────────────
  // EFILive: ECM.TQ_ACT or ECM.TQ_DD (Nm) → convert to %; HP Tuners: direct %
  {
    const torqIdx = find(['ECM.TQ_ACT', 'ECM.TQ_DD', 'TCM.TRQENG_B', 'Actual Engine Torque', 'Torque ECU']);
    const maxTorqIdx = find(['ECM.TQ_REF', 'Maximum Engine Torque']);
    const torqArr = torqIdx !== -1 ? col(torqIdx) : [];
    const maxTorqArr = maxTorqIdx !== -1 ? col(maxTorqIdx) : [];

    if (torqIdx !== -1 && !isFlat(torqArr)) {
      const maxVal = Math.max(...torqArr.filter(v => !isNaN(v)));
      if (maxVal > 200) {
        // Nm — convert to % using reference torque (or 1200 Nm default)
        channels['torquePercent'] = torqArr.map((v, i) => {
          if (isNaN(v)) return 0;
          const ref = maxTorqArr[i] && !isNaN(maxTorqArr[i]) && maxTorqArr[i] > 0
            ? maxTorqArr[i] : 1200;
          return (v / ref) * 100;
        });
        channels['maxTorque'] = maxTorqArr.map(v =>
          isNaN(v) || v <= 0 ? 879.174 : v * 0.737562 // Nm → lb-ft
        );
        substitutions.push({
          channel: 'Torque',
          primaryAttempted: headers[torqIdx],
          usedPid: headers[torqIdx],
          transform: 'Nm ÷ reference Nm × 100 → %; Nm × 0.7376 → lb-ft',
          reason: 'EFILive logs torque in Newton-meters. Converted to % and lb-ft for HP calculation.',
          confidence: 'high',
        });
      } else {
        channels['torquePercent'] = torqArr.map(v => isNaN(v) ? 0 : v);
        channels['maxTorque'] = maxTorqArr.map(v => isNaN(v) || v <= 0 ? 879.174 : v);
      }
    } else {
      channels['torquePercent'] = new Array(rpm.length).fill(0);
      channels['maxTorque'] = new Array(rpm.length).fill(879.174);
    }
  }

  // ─── Throttle Position (needed for drag run detection) ────────────────────
  {
    const tpsIdx = find([
      'ECM.TPS', 'ECM.THROTTLE', 'PCM.TP_A', 'PCM.TPS',
      'Accelerator Pedal Position', 'Throttle Position', 'Pedal Position', 'APP', 'Accel Pedal',
    ]);
    const tpsArr = tpsIdx !== -1 ? col(tpsIdx) : [];
    channels['throttlePosition'] = tpsIdx !== -1 ? tpsArr.map(v => isNaN(v) ? 0 : v) : new Array(rpm.length).fill(0);
    if (tpsIdx === -1) {
      // Soft-missing: not critical for most diagnostics but needed for drag detection
      // Don't add to hard missing list
    }
  }

  return { channels, substitutions, missing };
}
