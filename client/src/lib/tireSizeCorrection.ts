/**
 * Tire Size / Speedometer Correction Calculator
 * ===============================================
 * Calculates corrected axle ratio and tire circumference values
 * for ECM binary calibration to fix speedometer accuracy.
 *
 * Two modes:
 *  1. Manual — user provides old/new axle ratio + tire circumference
 *  2. Auto-Correct — user provides ECM speed vs GPS speed while driving
 *
 * The ECM calculates displayed speed as:
 *   Displayed_Speed ∝ (Wheel_Speed × Tire_Circumference) / Axle_Ratio
 *
 * Binary address fields are placeholders — wired later per vehicle protocol.
 * GM = ECM flash. Ford/RAM may use UDS or binary depending on platform.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ManualInputs {
  oldAxleRatio: number;        // Current ECM value (e.g. 3.73)
  oldTireCircumference: number; // Current ECM value in inches (e.g. 108)
  newAxleRatio: number;        // Actual new gears (e.g. 4.88), or same as old
  newTireCircumference: number; // Measured loaded circumference in inches (e.g. 126)
}

export interface AutoCorrectInputs {
  ecmSpeed: number;            // What the dash/ECM shows (mph)
  gpsSpeed: number;            // True GPS speed (mph)
  oldAxleRatio: number;        // Current ECM axle ratio value
  oldTireCircumference: number; // Current ECM tire circumference value (inches)
}

export interface CorrectionResult {
  method: 'recommended' | 'tire_only' | 'axle_only';
  label: string;
  description: string;
  axleRatioToWrite: number;
  tireCircumferenceToWrite: number;
  correctionFactor?: number;
  speedoErrorPercent?: number;
}

export interface AutoCorrectResult {
  correctionFactor: number;
  speedoErrorPercent: number;    // positive = reading high, negative = reading low
  errorDirection: 'high' | 'low' | 'accurate';
  description: string;
  corrections: CorrectionResult[];
}

export interface SavedAutoCorrectData {
  timestamp: number;
  ecmSpeed: number;
  gpsSpeed: number;
  correctionFactor: number;
  speedoErrorPercent: number;
  oldAxleRatio: number;
  oldTireCircumference: number;
  recommendedAxleRatio: number;
  recommendedTireCircumference: number;
}

// ─── Binary Address Placeholders ────────────────────────────────────────────

export interface BinaryAddress {
  name: string;
  offset: string;       // hex offset in binary — TBD
  length: number;       // bytes
  encoding: string;     // e.g. "IEEE754_float", "uint16_x100", etc.
  description: string;
}

/** Placeholder addresses — to be wired per vehicle/ECM type */
export const GM_BINARY_ADDRESSES: Record<string, BinaryAddress> = {
  axleRatio: {
    name: 'Axle Ratio',
    offset: 'TBD',
    length: 4,
    encoding: 'IEEE754_float',
    description: 'Final drive / axle ratio value in ECM calibration',
  },
  tireCircumference: {
    name: 'Tire Circumference',
    offset: 'TBD',
    length: 4,
    encoding: 'IEEE754_float',
    description: 'Tire circumference in inches stored in ECM calibration',
  },
  tireRevsPerMile: {
    name: 'Tire Revolutions Per Mile',
    offset: 'TBD',
    length: 2,
    encoding: 'uint16',
    description: 'Tire revolutions per mile (alternative to circumference on some ECMs)',
  },
};

// ─── PCAN Bridge / UDS Pre-Population ──────────────────────────────────────

/**
 * GM ECM DIDs for tire/axle calibration data.
 * These are read via UDS $22 (ReadDataByIdentifier) through the PCAN bridge.
 * DID values vary by ECM type — these are common GM E38/E67/E41/E42 DIDs.
 */
export const GM_TIRE_AXLE_DIDS: Record<string, {
  did: number;
  name: string;
  ecuHeader: string;
  parse: (bytes: number[]) => number;
  unit: string;
}> = {
  axleRatio: {
    did: 0xFD30,
    name: 'Final Drive Axle Ratio',
    ecuHeader: '7E0', // ECM
    parse: (bytes: number[]) => {
      // IEEE754 float (4 bytes big-endian)
      if (bytes.length < 4) return 0;
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      bytes.slice(0, 4).forEach((b, i) => view.setUint8(i, b));
      return Math.round(view.getFloat32(0) * 1000) / 1000;
    },
    unit: ':1',
  },
  tireCircumference: {
    did: 0xFD31,
    name: 'Tire Circumference',
    ecuHeader: '7E0', // ECM
    parse: (bytes: number[]) => {
      // IEEE754 float (4 bytes big-endian) — inches
      if (bytes.length < 4) return 0;
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      bytes.slice(0, 4).forEach((b, i) => view.setUint8(i, b));
      return Math.round(view.getFloat32(0) * 100) / 100;
    },
    unit: 'in',
  },
  tireRevsPerMile: {
    did: 0xFD32,
    name: 'Tire Revolutions Per Mile',
    ecuHeader: '7E0', // ECM
    parse: (bytes: number[]) => {
      // uint16 big-endian
      if (bytes.length < 2) return 0;
      return (bytes[0] << 8) | bytes[1];
    },
    unit: 'rev/mi',
  },
  ipcSpeedoFactor: {
    did: 0xFD40,
    name: 'IPC Speedometer Correction Factor',
    ecuHeader: '7C0', // IPC (Instrument Panel Cluster)
    parse: (bytes: number[]) => {
      // uint16 × 0.001 (scaling factor, 1.000 = stock)
      if (bytes.length < 2) return 1.0;
      return ((bytes[0] << 8) | bytes[1]) * 0.001;
    },
    unit: 'factor',
  },
};

/**
 * Result from scanning vehicle for current tire/axle calibration values.
 */
export interface VehicleScanResult {
  success: boolean;
  axleRatio: number | null;
  tireCircumference: number | null;
  tireRevsPerMile: number | null;
  ipcSpeedoFactor: number | null;
  errors: string[];
  scannedAt: number;
}

/**
 * Scan the vehicle for current tire/axle calibration values via PCAN bridge.
 * Requires an active UDSTransport connection to the ECM.
 *
 * @param udsTransport - Active UDS transport instance connected via PCAN bridge
 * @returns Scanned calibration values
 */
export async function scanVehicleTireAxleValues(
  udsTransport: { readDataByIdentifier: (did: number) => Promise<{ success: boolean; data?: number[] }> },
): Promise<VehicleScanResult> {
  const result: VehicleScanResult = {
    success: false,
    axleRatio: null,
    tireCircumference: null,
    tireRevsPerMile: null,
    ipcSpeedoFactor: null,
    errors: [],
    scannedAt: Date.now(),
  };

  const dids = GM_TIRE_AXLE_DIDS;

  // Read axle ratio
  try {
    const resp = await udsTransport.readDataByIdentifier(dids.axleRatio.did);
    if (resp.success && resp.data) {
      result.axleRatio = dids.axleRatio.parse(resp.data);
    } else {
      result.errors.push('Axle ratio DID not supported or no response');
    }
  } catch {
    result.errors.push('Failed to read axle ratio from ECM');
  }

  // Read tire circumference
  try {
    const resp = await udsTransport.readDataByIdentifier(dids.tireCircumference.did);
    if (resp.success && resp.data) {
      result.tireCircumference = dids.tireCircumference.parse(resp.data);
    } else {
      result.errors.push('Tire circumference DID not supported or no response');
    }
  } catch {
    result.errors.push('Failed to read tire circumference from ECM');
  }

  // Read tire revs per mile
  try {
    const resp = await udsTransport.readDataByIdentifier(dids.tireRevsPerMile.did);
    if (resp.success && resp.data) {
      result.tireRevsPerMile = dids.tireRevsPerMile.parse(resp.data);
    } else {
      result.errors.push('Tire revs/mile DID not supported or no response');
    }
  } catch {
    result.errors.push('Failed to read tire revs/mile from ECM');
  }

  // Read IPC speedo factor (optional — many vehicles don't expose this)
  try {
    const resp = await udsTransport.readDataByIdentifier(dids.ipcSpeedoFactor.did);
    if (resp.success && resp.data) {
      result.ipcSpeedoFactor = dids.ipcSpeedoFactor.parse(resp.data);
    }
    // Don't log error — this DID is optional
  } catch {
    // IPC speedo factor is optional, ignore failures
  }

  // Success if we got at least axle ratio or tire circumference
  result.success = result.axleRatio !== null || result.tireCircumference !== null;

  return result;
}

/**
 * Write corrected tire/axle values back to the ECM via UDS.
 * Requires security access (seed/key) to be completed first.
 * 
 * NOTE: This is a placeholder — actual write-back requires the binary flash
 * pipeline to be wired. UDS $2E writes are only valid for DID-writable
 * parameters, not flash-calibration values on most GM ECMs.
 */
export async function writeVehicleTireAxleValues(
  _udsTransport: { writeDataByIdentifier: (did: number, data: number[]) => Promise<{ success: boolean }> },
  _values: { axleRatio?: number; tireCircumference?: number },
): Promise<{ success: boolean; errors: string[] }> {
  // Placeholder — binary flash pipeline not yet wired
  return {
    success: false,
    errors: ['Write-back requires binary flash pipeline (not yet wired). Use ECM flash tool to apply corrected values.'],
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const INCHES_PER_MILE = 63360;

/** Common tire sizes with approximate loaded circumference */
export const COMMON_TIRE_CIRCUMFERENCES: Array<{
  label: string;
  diameter: number;
  circumference: number;
}> = [
  { label: '265/70R17 (31.6")', diameter: 31.6, circumference: 99.3 },
  { label: '275/70R18 (33.2")', diameter: 33.2, circumference: 104.3 },
  { label: '285/75R16 (32.8")', diameter: 32.8, circumference: 103.1 },
  { label: '285/75R17 (33.8")', diameter: 33.8, circumference: 106.2 },
  { label: '285/65R18 (32.5")', diameter: 32.5, circumference: 102.1 },
  { label: '295/70R18 (34.3")', diameter: 34.3, circumference: 107.7 },
  { label: '305/70R18 (34.8")', diameter: 34.8, circumference: 109.3 },
  { label: '35x12.50R17 (35.0")', diameter: 35.0, circumference: 110.0 },
  { label: '35x12.50R18 (35.0")', diameter: 35.0, circumference: 110.0 },
  { label: '35x12.50R20 (35.0")', diameter: 35.0, circumference: 110.0 },
  { label: '37x12.50R17 (37.0")', diameter: 37.0, circumference: 116.2 },
  { label: '37x13.50R18 (37.0")', diameter: 37.0, circumference: 116.2 },
  { label: '37x12.50R20 (37.0")', diameter: 37.0, circumference: 116.2 },
  { label: '38x13.50R18 (38.0")', diameter: 38.0, circumference: 119.4 },
  { label: '40x13.50R17 (40.0")', diameter: 40.0, circumference: 125.7 },
  { label: '40x15.50R20 (40.0")', diameter: 40.0, circumference: 125.7 },
];

// ─── Manual Calculation ─────────────────────────────────────────────────────

/**
 * Calculate corrected ECM values for manual tire/gear change.
 * Returns three options: recommended (both), tire-only, axle-only.
 */
export function calculateManualCorrection(inputs: ManualInputs): CorrectionResult[] {
  const { oldAxleRatio, oldTireCircumference, newAxleRatio, newTireCircumference } = inputs;

  const results: CorrectionResult[] = [];

  // Option 1: Recommended — write both real values
  results.push({
    method: 'recommended',
    label: 'Best Accuracy — Write Both Values',
    description: 'Write the actual new axle ratio and measured tire circumference. Most accurate method.',
    axleRatioToWrite: round3(newAxleRatio),
    tireCircumferenceToWrite: round1(newTireCircumference),
  });

  // Option 2: Tire circumference only (keep old axle ratio in ECM)
  // Compensate for gear change by adjusting circumference
  const tireOnlyCirc = oldTireCircumference * (newAxleRatio / oldAxleRatio);
  // But also account for actual tire change
  const tireOnlyFinal = tireOnlyCirc * (newTireCircumference / oldTireCircumference);
  // Simplified: New_Tire_Circ_to_write = Old_Tire_Circ × (New_Axle / Old_Axle)
  // But if tire also changed, we need the full ratio
  const tireOnlyWrite = oldTireCircumference * (newTireCircumference / oldTireCircumference) * (newAxleRatio / oldAxleRatio);

  results.push({
    method: 'tire_only',
    label: 'Tire Circumference Only — Keep Axle Ratio',
    description: `Axle ratio stays at ${oldAxleRatio.toFixed(3)} in ECM. Tire circumference absorbs the full correction.`,
    axleRatioToWrite: round3(oldAxleRatio),
    tireCircumferenceToWrite: round1(tireOnlyWrite),
  });

  // Option 3: Axle ratio only (keep old tire circumference in ECM)
  const axleOnlyWrite = oldAxleRatio * (oldTireCircumference / newTireCircumference) * (newAxleRatio / oldAxleRatio);

  results.push({
    method: 'axle_only',
    label: 'Axle Ratio Only — Keep Tire Circumference',
    description: `Tire circumference stays at ${oldTireCircumference.toFixed(1)}" in ECM. Axle ratio absorbs the full correction.`,
    axleRatioToWrite: round3(axleOnlyWrite),
    tireCircumferenceToWrite: round1(oldTireCircumference),
  });

  return results;
}

// ─── Auto-Correct Calculation ───────────────────────────────────────────────

/**
 * Calculate correction from live ECM speed vs GPS speed.
 * User drives at steady speed (60-70 mph recommended).
 */
export function calculateAutoCorrect(inputs: AutoCorrectInputs): AutoCorrectResult {
  const { ecmSpeed, gpsSpeed, oldAxleRatio, oldTireCircumference } = inputs;

  const correctionFactor = gpsSpeed / ecmSpeed;
  const speedoErrorPercent = ((ecmSpeed - gpsSpeed) / gpsSpeed) * 100;

  let errorDirection: 'high' | 'low' | 'accurate';
  let description: string;

  if (Math.abs(speedoErrorPercent) < 1) {
    errorDirection = 'accurate';
    description = `Your speedometer is within 1% — reading ${ecmSpeed} mph vs ${gpsSpeed} mph GPS. No correction needed.`;
  } else if (speedoErrorPercent > 0) {
    errorDirection = 'high';
    description = `Your ECM is reading ${Math.abs(speedoErrorPercent).toFixed(1)}% HIGH — showing ${ecmSpeed} mph when actual speed is ${gpsSpeed} mph. Correction factor: ${correctionFactor.toFixed(4)}`;
  } else {
    errorDirection = 'low';
    description = `Your ECM is reading ${Math.abs(speedoErrorPercent).toFixed(1)}% LOW — showing ${ecmSpeed} mph when actual speed is ${gpsSpeed} mph. Correction factor: ${correctionFactor.toFixed(4)}`;
  }

  const corrections: CorrectionResult[] = [];

  // Option 1: Correct via tire circumference only
  const newTireCirc = oldTireCircumference * correctionFactor;
  corrections.push({
    method: 'tire_only',
    label: 'Correct via Tire Circumference',
    description: `Multiply current circumference by ${correctionFactor.toFixed(4)}: ${oldTireCircumference.toFixed(1)}" → ${newTireCirc.toFixed(1)}"`,
    axleRatioToWrite: round3(oldAxleRatio),
    tireCircumferenceToWrite: round1(newTireCirc),
    correctionFactor,
    speedoErrorPercent,
  });

  // Option 2: Correct via axle ratio only (note: division, not multiplication)
  const newAxleRatio = oldAxleRatio / correctionFactor;
  corrections.push({
    method: 'axle_only',
    label: 'Correct via Axle Ratio',
    description: `Divide current ratio by ${correctionFactor.toFixed(4)}: ${oldAxleRatio.toFixed(3)} → ${newAxleRatio.toFixed(3)}`,
    axleRatioToWrite: round3(newAxleRatio),
    tireCircumferenceToWrite: round1(oldTireCircumference),
    correctionFactor,
    speedoErrorPercent,
  });

  return {
    correctionFactor,
    speedoErrorPercent,
    errorDirection,
    description,
    corrections,
  };
}

// ─── Saved Data Helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = 'vop_tire_autocorrect_history';

/** Save an auto-correct session for later use (when binary flashing is wired) */
export function saveAutoCorrectData(data: SavedAutoCorrectData): void {
  try {
    const existing = getAutoCorrectHistory();
    existing.push(data);
    // Keep last 20 entries
    const trimmed = existing.slice(-20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be unavailable
  }
}

/** Get saved auto-correct history */
export function getAutoCorrectHistory(): SavedAutoCorrectData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Clear auto-correct history */
export function clearAutoCorrectHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Circumference from tire diameter */
export function circumferenceFromDiameter(diameter: number): number {
  return Math.PI * diameter;
}

/** Revolutions per mile from circumference (inches) */
export function revsPerMile(circumferenceInches: number): number {
  return INCHES_PER_MILE / circumferenceInches;
}

/** Circumference from revolutions per mile */
export function circumferenceFromRevs(revs: number): number {
  return INCHES_PER_MILE / revs;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
