/**
 * ECU Reference Data — Derived from Duramax A2L Calibration File
 * Source: E41a182115101_D_quasi.a2l (Series_11, ECM_E41, ASAP2 v1.61)
 * Covers: 2017–2023 Duramax L5P 6.6L Diesel
 *
 * This module contains:
 * - Official ECU measurement variable definitions (57,215 total in A2L)
 * - Calibration constants and diagnostic thresholds
 * - Parameter descriptions extracted directly from A2L ANNOTATION blocks
 * - Unit conversions and valid operating ranges
 */

// ─── ECU MEASUREMENT DEFINITIONS ─────────────────────────────────────────────
// Each entry maps a human-readable name to its A2L variable name, unit, and description

export interface EcuParameter {
  a2lName: string;
  displayName: string;
  unit: string;
  description: string;
  normalMin?: number;
  normalMax?: number;
  warnMin?: number;
  warnMax?: number;
  critMin?: number;
  critMax?: number;
  category: EcuCategory;
  ecuAddress?: string;
}

export type EcuCategory =
  | 'fuel_rail'
  | 'boost_turbo'
  | 'exhaust_thermal'
  | 'airflow'
  | 'transmission'
  | 'engine_speed'
  | 'engine_load'
  | 'thermal';

/**
 * Official ECU parameter definitions extracted from A2L MEASUREMENT blocks.
 * Thresholds are derived from A2L CHARACTERISTIC calibration constants and
 * GM service documentation for the L5P Duramax.
 */
export const ECU_PARAMETERS: Record<string, EcuParameter> = {

  // ── FUEL RAIL PRESSURE ──────────────────────────────────────────────────────
  fuelRailActual: {
    a2lName: 'VeFCBR_p_SnsdFuelPresAbs',
    displayName: 'Fuel Rail Pressure (Actual)',
    unit: 'psi',
    description: 'Sensed absolute fuel rail pressure. Measured by the high-pressure fuel rail sensor (FRP sensor). Used by ECM for closed-loop fuel pressure control via the PCV solenoid.',
    normalMin: 3000,
    normalMax: 26000,
    warnMin: 1500,
    warnMax: 28000,
    critMin: 500,
    critMax: 30000,
    category: 'fuel_rail',
    ecuAddress: '0x40014560',
  },
  fuelRailDesired: {
    a2lName: 'VeFCBR_p_FuelRailRequest',
    displayName: 'Fuel Rail Pressure (Desired)',
    unit: 'psi',
    description: 'ECM-commanded fuel rail pressure target. The ECM calculates this based on engine load, RPM, and fuel quantity demand tables. The PCV solenoid duty cycle is modulated to achieve this target.',
    normalMin: 3000,
    normalMax: 26000,
    category: 'fuel_rail',
  },
  fuelRailError: {
    a2lName: 'VeFCBR_p_FuelPresErr',
    displayName: 'Fuel Rail Pressure Error',
    unit: 'psi',
    description: 'Difference between desired and actual fuel rail pressure (Desired − Actual). Positive = actual is below desired (low rail). Negative = actual is above desired (high rail). P0087 triggers when error exceeds ~3000 psi for >2 seconds.',
    normalMin: -1000,
    normalMax: 1000,
    warnMin: -2000,
    warnMax: 2000,
    critMin: -3000,
    critMax: 3000,
    category: 'fuel_rail',
  },
  fuelRailMaxPres: {
    a2lName: 'DeFHPD_p_FuelRailMaxPres',
    displayName: 'Fuel Rail Max Pressure (Overpressure Event)',
    unit: 'MPa',
    description: 'Maximum pressure value recorded when an overpressure event occurs. Logged by the ECM when rail pressure exceeds the pressure relief valve threshold (~29,000 psi / 200 MPa). If this value is non-zero, the pressure relief valve has opened.',
    category: 'fuel_rail',
    ecuAddress: '0x4000401C',
  },

  // ── BOOST / TURBO ───────────────────────────────────────────────────────────
  boostActual: {
    a2lName: 'VeBSTR_p_EngInBoostPressure',
    displayName: 'Intake Manifold Boost Pressure',
    unit: 'psi',
    description: 'Boost pressure sent to Engine Intake Pressure Indication. Measured by the MAP sensor downstream of the intercooler. This is the actual charge air pressure entering the engine.',
    normalMin: 0,
    normalMax: 50,
    warnMax: 55,
    critMax: 60,
    category: 'boost_turbo',
    ecuAddress: '0x40010E90',
  },
  vgtVanePosition: {
    a2lName: 'VeAICR_Pct_VGT_PstnReq',
    displayName: 'VGT Vane Position (Requested)',
    unit: '%',
    description: 'Variable Geometry Turbocharger (VGT) requested vane position as a percentage. 0% = fully open (low boost, low backpressure). 100% = fully closed (maximum boost, maximum backpressure). Values above 45% at RPM >2800 with insufficient boost indicate a boost leak or turbo issue.',
    normalMin: 0,
    normalMax: 100,
    warnMax: 90,
    category: 'boost_turbo',
    ecuAddress: '0x40011450',
  },
  boostPercent: {
    a2lName: 'VeAICR_Pct_BoostPressure',
    displayName: 'Boost Pressure Indication (%)',
    unit: '%',
    description: 'Percent boost pressure used for engine boost pressure indication. Scaled 0–200% relative to atmospheric. Used in OBD PID $0B (Intake Manifold Absolute Pressure).',
    normalMin: 0,
    normalMax: 200,
    category: 'boost_turbo',
    ecuAddress: '0x40014998',
  },
  boostError: {
    a2lName: 'VeAICC_p_BoostError',
    displayName: 'Boost Pressure Error',
    unit: 'kPa',
    description: 'Difference between desired and actual boost pressure. Used by the VGT PID controller to adjust vane position. Large persistent errors indicate turbo mechanical issues or boost leaks.',
    normalMin: -20,
    normalMax: 20,
    warnMin: -35,
    warnMax: 35,
    category: 'boost_turbo',
  },

  // ── EXHAUST GAS TEMPERATURE ─────────────────────────────────────────────────
  egt1: {
    a2lName: 'VeEGTR_T_ExhGas1',
    displayName: 'Exhaust Gas Temp — EGT1 (Pre-Turbo)',
    unit: '°F',
    description: 'Temperature read from EGT sensor 1, located upstream of the turbocharger. This is the primary exhaust temperature measurement for engine health monitoring. Sustained temperatures above 1,475°F indicate excessive fueling, timing issues, or boost problems.',
    normalMin: 200,
    normalMax: 1200,
    warnMax: 1350,
    critMax: 1475,
    category: 'exhaust_thermal',
    ecuAddress: '0x40014920',
  },
  egtTurbineDown: {
    a2lName: 'VeEGTR_T_SnsrTurbDwn',
    displayName: 'Exhaust Gas Temp — Turbine Downstream',
    unit: '°F',
    description: 'Temperature downstream of the turbine, read from a sensor. This sensor monitors the temperature entering the aftertreatment system (DPF, SCR). Values above 1,300°F downstream indicate potential DPF regeneration or excessive load.',
    normalMin: 150,
    normalMax: 1100,
    warnMax: 1300,
    critMax: 1475,
    category: 'exhaust_thermal',
    ecuAddress: '0x40011C80',
  },
  egtDiagModel: {
    a2lName: 'VeEGTR_T_EGT1_DiagMdl',
    displayName: 'EGT1 Diagnostic Model Temperature',
    unit: '°C',
    description: 'Temperature estimation for EGT1 used for Dynamic Rationality Diagnosis. The ECM computes a model-based EGT estimate and compares it to the sensor reading to detect sensor faults. Large deviations between model and sensor trigger P0544 (EGT sensor circuit).',
    category: 'exhaust_thermal',
    ecuAddress: '0x40014810',
  },

  // ── MASS AIRFLOW ────────────────────────────────────────────────────────────
  mafFiltered: {
    a2lName: 'VeMAFR_dm_EngAirFlowFlt',
    displayName: 'Mass Airflow — Filtered (g/s)',
    unit: 'g/s',
    description: 'Airflow through MAF sensor corrected for heat-up effects and disturbances. This is the primary airflow signal used for fueling calculations. At idle, normal range is 8–25 g/s (4–12 lb/min). At WOT, the L5P can flow up to 130+ g/s (65+ lb/min).',
    normalMin: 8,
    normalMax: 130,
    warnMin: 4,
    warnMax: 145,
    category: 'airflow',
    ecuAddress: '0x40014564',
  },
  mafRaw: {
    a2lName: 'VeMAFR_dm_EngArflUnfiltd',
    displayName: 'Mass Airflow — Unfiltered (g/s)',
    unit: 'g/s',
    description: 'Raw, unfiltered mass airflow reading directly from the MAF sensor. Comparing this to the filtered value reveals sensor noise or rapid airflow transients. Spikes in this signal that do not appear in the filtered signal are normal during transient throttle events.',
    category: 'airflow',
  },
  mafAirPerCyl: {
    a2lName: 'VeMAFR_m_AirPerCylAhead1',
    displayName: 'Air Mass Per Cylinder',
    unit: 'mg/stroke',
    description: 'Calculated air mass delivered to each cylinder per combustion event. Used by the ECM to compute the correct fuel injection quantity for the target air-fuel ratio. Higher values indicate better volumetric efficiency (better breathing).',
    category: 'airflow',
  },

  // ── TRANSMISSION / TORQUE CONVERTER ────────────────────────────────────────
  tccSlip: {
    a2lName: 'VeSPDR_n_TCC_Slip',
    displayName: 'Torque Converter Clutch Slip',
    unit: 'RPM',
    description: 'For automatic transmission: floating-point version of TCC slip (engine RPM minus turbine RPM). For manual transmission: equals engine RPM minus turbine speed. Near-zero values indicate a fully locked converter. Values exceeding ±15 RPM under lock-up conditions indicate converter wear or hydraulic issues.',
    normalMin: -15,
    normalMax: 15,
    warnMin: -50,
    warnMax: 50,
    critMin: -200,
    critMax: 200,
    category: 'transmission',
    ecuAddress: '0x40011B64',
  },
  turbineSpeed: {
    a2lName: 'VeSPDR_n_TurbineSpeed',
    displayName: 'Transmission Turbine Speed',
    unit: 'RPM',
    description: 'Slightly filtered turbine speed using a 4-point moving average. For automatic transmission, this is the input shaft speed of the transmission. Comparing this to engine RPM gives TCC slip. For manual transmission, equals raw turbine speed.',
    category: 'transmission',
    ecuAddress: '0x400110B0',
  },

  // ── ENGINE SPEED ────────────────────────────────────────────────────────────
  engineRpm: {
    a2lName: 'VeSPDR_n_Eng',
    displayName: 'Engine Speed (RPM)',
    unit: 'RPM',
    description: 'Current engine crankshaft speed. The L5P Duramax redline is 3,500 RPM. Peak torque occurs at 1,600 RPM (910 lb·ft stock) and peak horsepower at 3,000 RPM (445 HP stock). The ECM limits fuel delivery above the programmed rev limiter.',
    normalMin: 600,
    normalMax: 3500,
    warnMax: 3400,
    critMax: 3600,
    category: 'engine_speed',
  },
  engineRpmDesired: {
    a2lName: 'VeSPDR_n_EngDsrd',
    displayName: 'Engine Speed — Desired',
    unit: 'RPM',
    description: 'ECM-desired engine speed. At idle, this is the target idle speed (typically 650–750 RPM warm). Under load, this reflects the driver demand translated to a speed target. Used by the idle speed controller and cruise control.',
    category: 'engine_speed',
  },

  // ── ENGINE LOAD / TORQUE ────────────────────────────────────────────────────
  injectionQuantity: {
    a2lName: 'VeFULR_m_FuelReq',
    displayName: 'Fuel Injection Quantity (mg/stroke)',
    unit: 'mg/stroke',
    description: 'Total fuel quantity requested per injection event per cylinder. This is the sum of all injection pulses (pilot, main, post). At idle, typical values are 5–15 mg/stroke. At full load, the L5P can inject up to 200+ mg/stroke.',
    normalMin: 0,
    normalMax: 200,
    warnMax: 220,
    category: 'engine_load',
  },
  fuelCutoff: {
    a2lName: 'VeFULR_b_FuelCutoffActive',
    displayName: 'Fuel Cutoff Active',
    unit: 'boolean',
    description: 'Flag indicating fuel injection has been cut off. Active during deceleration fuel cutoff (DFCO) when the driver releases the throttle at speed. Also active during engine protection shutdowns. When active, no fuel is injected.',
    category: 'engine_load',
  },
};

// ─── DIAGNOSTIC FAULT CODES FROM A2L ─────────────────────────────────────────
// These are the actual DTC identifiers from the A2L CHARACTERISTIC KaDFIR_FaultInfo blocks

export interface DtcDefinition {
  code: string;
  a2lId: string;
  description: string;
  system: string;
  severity: 'critical' | 'warning' | 'info';
}

export const DTC_DEFINITIONS: DtcDefinition[] = [
  // Fuel Rail Pressure
  {
    code: 'P0087',
    a2lId: 'CeDFIR_e_FRP_TooLo',
    description: 'Fuel Rail Pressure Too Low — Actual rail pressure is more than 3,000 psi below desired for more than 2 seconds. Check PCV duty cycle; if below 500 mA, the high-pressure pump is maxed out.',
    system: 'Fuel Rail',
    severity: 'critical',
  },
  {
    code: 'P0088',
    a2lId: 'CeDFIR_e_FRP_TooHi',
    description: 'Fuel Rail Pressure Too High — Actual rail pressure is more than 1,500 psi above desired for more than 2 seconds. May indicate a stuck-open PCV or pressure relief valve issue.',
    system: 'Fuel Rail',
    severity: 'critical',
  },
  {
    code: 'P0191',
    a2lId: 'CeDFIR_e_FRP_SnsrPerf',
    description: 'Fuel Rail Pressure Sensor Performance — Sensor signal is within range but does not correlate with expected values. Check sensor wiring and connector.',
    system: 'Fuel Rail',
    severity: 'warning',
  },
  {
    code: 'P0192',
    a2lId: 'CeDFIR_e_FRP_SnsrCktLo',
    description: 'Fuel Rail Pressure Sensor Circuit Low — Sensor signal voltage is below the minimum threshold. Check for short to ground in sensor wiring.',
    system: 'Fuel Rail',
    severity: 'warning',
  },
  {
    code: 'P0193',
    a2lId: 'CeDFIR_e_FRP_SnsrCktHi',
    description: 'Fuel Rail Pressure Sensor Circuit High — Sensor signal voltage is above the maximum threshold. Check for open circuit or short to voltage in sensor wiring.',
    system: 'Fuel Rail',
    severity: 'warning',
  },
  {
    code: 'P0001',
    a2lId: 'CeDFIR_e_FuelPresReg1Perf',
    description: 'Fuel Volume Regulator Control Circuit/Open — PCV solenoid performance issue. The ECM cannot achieve the desired fuel pressure through normal PCV duty cycle adjustment.',
    system: 'Fuel Rail',
    severity: 'warning',
  },
  {
    code: 'P0002',
    a2lId: 'CeDFIR_e_FuelPresReg1PresTooLo',
    description: 'Fuel Volume Regulator Control Circuit Range/Performance Low — Fuel pressure regulator 1 is commanding maximum flow but pressure is still too low.',
    system: 'Fuel Rail',
    severity: 'warning',
  },
  {
    code: 'P0003',
    a2lId: 'CeDFIR_e_FuelPresReg1PresTooHi',
    description: 'Fuel Volume Regulator Control Circuit Low — Fuel pressure regulator 1 is commanding minimum flow but pressure is still too high.',
    system: 'Fuel Rail',
    severity: 'warning',
  },
  // Boost / Turbo
  {
    code: 'P0299',
    a2lId: 'CiDFIR_BoostPresMonitor',
    description: 'Turbocharger/Supercharger Underboost — Actual boost pressure is more than 5 psi below desired for more than 3 seconds. Check VGT vane position, intake system for leaks, and intercooler connections.',
    system: 'Boost/Turbo',
    severity: 'critical',
  },
  {
    code: 'P0234',
    a2lId: 'CiDFIR_BoostPres_A_Monitor',
    description: 'Turbocharger/Supercharger Overboost — Actual boost pressure exceeds the maximum calibrated limit. May indicate a stuck VGT vane or boost control solenoid failure.',
    system: 'Boost/Turbo',
    severity: 'critical',
  },
  // MAF
  {
    code: 'P0101',
    a2lId: 'CeXOYR_e_MAFR_Ahead1vs2FinalFlt',
    description: 'Mass Air Flow Sensor Performance — MAF reading does not correlate with expected values based on RPM, boost, and throttle position. At idle, MAF should be 8–25 g/s. Check sensor and intake for leaks.',
    system: 'Airflow',
    severity: 'warning',
  },
  {
    code: 'P0102',
    a2lId: 'VeMAFR_b_MAF_SnsrCktLoTPTKO',
    description: 'Mass Air Flow Sensor Circuit Low — MAF signal is below minimum threshold. Check for sensor failure, damaged wiring, or contaminated sensor element.',
    system: 'Airflow',
    severity: 'warning',
  },
  // EGT
  {
    code: 'P0544',
    a2lId: 'VeEGTR_b_ExhGas1_Flt',
    description: 'Exhaust Gas Temperature Sensor Circuit Bank 1 Sensor 1 — EGT1 sensor signal is out of range or does not match the ECM thermal model. If EGT reads above 1,800°F (982°C) and is stuck, the sensor is likely disconnected or failed.',
    system: 'Exhaust Thermal',
    severity: 'warning',
  },
];

// ─── ENGINE SPECIFICATIONS (L5P DURAMAX) ─────────────────────────────────────
// From A2L project metadata and GM engineering documentation

export const L5P_SPECS = {
  engine: {
    name: 'Duramax L5P 6.6L Turbodiesel V8',
    displacement: '6.6L (402 cu in)',
    configuration: 'V8, 90° bank angle',
    bore: '103 mm (4.06 in)',
    stroke: '99 mm (3.90 in)',
    compressionRatio: '15.0:1',
    injectionSystem: 'Bosch CP4.2 High-Pressure Common Rail',
    maxRailPressure: '29,000 psi (200 MPa)',
    turbocharger: 'Garrett Variable Geometry Turbocharger (VGT)',
    intercooler: 'Air-to-Air Charge Air Cooler (CAC)',
    aftertreatment: 'DPF + SCR (DEF) + DOC',
    ecuPart: 'ECM_E41 Series_11',
  },
  performance: {
    stockHp: 445,
    stockTorque: 910,
    stockTorqueUnit: 'lb·ft',
    peakTorqueRpm: 1600,
    peakHpRpm: 3000,
    redline: 3500,
    idleRpm: 700,
    maxBoostStock: 42, // psi
  },
  operatingLimits: {
    maxEgt1_F: 1475,          // °F — sustained limit (>5 sec triggers tuner review)
    maxEgt1_stuck_F: 1800,    // °F — sensor disconnected/failed if stuck here
    maxRailPressure_psi: 29000,
    maxBoost_psi: 55,
    mafIdleMin_lbMin: 2.0,    // lb/min
    mafIdleMax_lbMin: 6.0,    // lb/min
    mafMaxLoad_lbMin: 65.0,   // lb/min (stock)
    tccSlipWarning_rpm: 50,   // RPM
    tccSlipCritical_rpm: 200, // RPM
  },
  // A2L-derived subsystem descriptions
  subsystems: {
    FRPR: 'Fuel Rail Pressure Regulation — Closed-loop control of high-pressure fuel rail via PCV solenoid. The CP4.2 pump generates up to 29,000 psi. The PCV (Pressure Control Valve) modulates flow back to the low-pressure side.',
    BSTR: 'Boost Pressure Regulation — Variable Geometry Turbocharger (VGT) with electronically controlled vane position. The ECM uses a PID controller comparing MAP sensor reading to the boost pressure target table.',
    EGTR: 'Exhaust Gas Temperature Monitoring — Up to 5 EGT sensors in the exhaust path (pre-turbo, post-turbo, DPF upstream/downstream, SCR). The ECM uses these for aftertreatment control and engine protection.',
    MAFR: 'Mass Airflow Regulation — Hot-film MAF sensor with LIN protocol communication option. The ECM uses filtered MAF for fueling, and compares two MAF signals for rationality diagnostics (P0101).',
    SPDR: 'Speed/Idle Control — Manages engine idle speed, TCC slip monitoring, and turbine speed calculation. TCC slip is computed as engine RPM minus turbine RPM.',
    AICR: 'Air Intake Control — Manages VGT vane position, EGR valve, and throttle position for optimal air charge. The VGT position request (0–100%) is the primary boost actuator command.',
    FULR: 'Fuel Injection Control — Manages injection timing, quantity, and pattern for all 8 cylinders. Supports pilot, main, and post injection events. Injection quantity is in mg/stroke.',
  },
};

// ─── PARAMETER TOOLTIP DESCRIPTIONS ──────────────────────────────────────────
// Short descriptions for chart tooltips and UI labels

export const PARAM_TOOLTIPS: Record<string, string> = {
  rpm: 'Engine crankshaft speed (RPM). L5P peak HP at 3,000 RPM, peak torque at 1,600 RPM.',
  maf: 'Mass Air Flow in lb/min. Idle: 2–6 lb/min. WOT: up to 65+ lb/min on stock L5P.',
  boost: 'Intake manifold boost pressure (psi above atmospheric). Stock L5P max: ~42 psi.',
  egt: 'Exhaust Gas Temperature (°F). Sustained >1,475°F requires tuner review.',
  railActual: 'Actual high-pressure fuel rail pressure (psi). Normal range: 3,000–26,000 psi.',
  railDesired: 'ECM-commanded fuel rail pressure target (psi).',
  railDelta: 'Difference between desired and actual rail pressure. >3,000 psi for >2 sec = P0087 risk.',
  pcv: 'PCV solenoid current (mA). <500 mA = pump maxed out. >1,600 mA at idle = high pressure issue.',
  vgtPosition: 'VGT vane position (%). 0% = open (low boost). 100% = closed (max boost). >45% at 2,800+ RPM with low boost = boost leak.',
  tccSlip: 'Torque converter clutch slip (RPM). Near-zero = locked. >±50 RPM = possible wear.',
  hp: 'Estimated horsepower. Calculated via HP = Torque × RPM / 5,252 (torque method) or MAF-based BSFC method.',
  torque: 'Estimated engine torque (lb·ft). Derived from ECM actual torque percentage × reference torque.',
  oilPressure: 'Engine oil pressure (psi). Normal: 25–80 psi. <10 psi at idle = critical.',
  coolantTemp: 'Engine coolant temperature (°F). Normal operating: 180–210°F.',
};

// ─── UNIT CONVERSION HELPERS ──────────────────────────────────────────────────

export const unitConvert = {
  celsiusToFahrenheit: (c: number) => (c * 9) / 5 + 32,
  fahrenheitToCelsius: (f: number) => ((f - 32) * 5) / 9,
  mpaToKpsi: (mpa: number) => mpa * 0.14503773773,
  kpsiToMpa: (kpsi: number) => kpsi / 0.14503773773,
  gramsPerSecToLbsPerMin: (gs: number) => gs * 0.13227736,
  lbsPerMinToGramsPerSec: (lbm: number) => lbm / 0.13227736,
  kpaToKpsi: (kpa: number) => kpa * 0.000145038,
  kpsiToKpa: (kpsi: number) => kpsi / 0.000145038,
  kpaToPsi: (kpa: number) => kpa * 0.14503773773,
  psiToKpa: (psi: number) => psi / 0.14503773773,
  nmToLbFt: (nm: number) => nm * 0.7375621,
  lbFtToNm: (lbft: number) => lbft / 0.7375621,
};

// ─── HEALTH SCORING WEIGHTS ───────────────────────────────────────────────────
// Weights for overall health score calculation (must sum to 1.0)

export const HEALTH_WEIGHTS = {
  fuelRail: 0.25,      // Critical system — directly affects engine operation
  boost: 0.20,         // Major performance and efficiency impact
  exhaust: 0.20,       // Thermal management and aftertreatment health
  airflow: 0.15,       // Engine breathing efficiency
  transmission: 0.10,  // Drivetrain health
  thermal: 0.10,       // Engine cooling and lubrication
};
