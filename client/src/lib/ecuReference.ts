/**
 * Duramax ECU Reference Data
 * Source: GM OBD Documentation & Duramax engine management data (2017–2023 L5P 6.6L Diesel)
 * Cross-referenced with GM TechLink bulletins, TSBs, GDS2 service data,
 * DuramaxForum real-world scan logs, and iDash PID lists.
 *
 * This module contains:
 * - Official ECU measurement variable definitions
 * - Calibration constants and diagnostic thresholds
 * - Parameter descriptions from ECU calibration annotations
 * - Unit conversions and valid operating ranges
 */

// ─── ECU MEASUREMENT DEFINITIONS ─────────────────────────────────────────────

export interface EcuParameter {
  internalName: string;
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

export const ECU_PARAMETERS: Record<string, EcuParameter> = {

  // ── FUEL RAIL PRESSURE ──────────────────────────────────────────────────────
  fuelRailActual: {
    internalName: 'VeFCBR_p_SnsdFuelPresAbs',
    displayName: 'Fuel Rail Pressure (Actual)',
    unit: 'psi',
    description: 'Sensed absolute fuel rail pressure from the high-pressure fuel rail sensor (FRP sensor). Used by the ECM for closed-loop fuel pressure control via the PCV solenoid. HP4 high-pressure pump system; sensitive to fuel quality and filter condition.',
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
    internalName: 'VeFCBR_p_FuelRailRequest',
    displayName: 'Fuel Rail Pressure (Desired)',
    unit: 'psi',
    description: 'ECM-commanded fuel rail pressure target. Calculated based on engine load, RPM, and fuel quantity demand tables. The HP4 pump PCV solenoid duty cycle is modulated to achieve this target.',
    normalMin: 3000,
    normalMax: 26000,
    category: 'fuel_rail',
  },
  fuelRailError: {
    internalName: 'VeFCBR_p_FuelPresErr',
    displayName: 'Fuel Rail Pressure Error',
    unit: 'psi',
    description: 'Difference between desired and actual fuel rail pressure (Desired − Actual). Positive = actual is below desired (low rail). Negative = actual is above desired (high rail). P0087 triggers when error exceeds ~3,000 psi for >2 seconds.',
    normalMin: -1000,
    normalMax: 1000,
    warnMin: -2000,
    warnMax: 2000,
    critMin: -3000,
    critMax: 3000,
    category: 'fuel_rail',
  },
  fuelRailMaxPres: {
    internalName: 'DeFHPD_p_FuelRailMaxPres',
    displayName: 'Fuel Rail Max Pressure (Overpressure Event)',
    unit: 'MPa',
    description: 'Maximum pressure recorded when an overpressure event occurs. Logged by the ECM when rail pressure exceeds the pressure relief valve threshold (~29,000 psi / 200 MPa). A non-zero value means the pressure relief valve has opened.',
    category: 'fuel_rail',
    ecuAddress: '0x4000401C',
  },

  // ── BOOST / TURBO ───────────────────────────────────────────────────────────
  boostActual: {
    internalName: 'VeBSTR_p_EngInBoostPressure',
    displayName: 'Intake Manifold Boost Pressure',
    unit: 'psi',
    description: 'Boost pressure measured by the MAP sensor downstream of the intercooler. This is the actual charge air pressure entering the engine. Stock L5P maximum is approximately 42 psi.',
    normalMin: 0,
    normalMax: 50,
    warnMax: 55,
    critMax: 60,
    category: 'boost_turbo',
    ecuAddress: '0x40010E90',
  },
  vgtVanePosition: {
    internalName: 'VeAICR_Pct_VGT_PstnReq',
    displayName: 'VGT Vane Position (Requested)',
    unit: '%',
    description: 'Variable Geometry Turbocharger (VGT) requested vane position. 0% = fully open (low boost). 100% = fully closed (maximum boost). Values above 45% at RPM >2,800 with insufficient boost indicate a boost leak or turbo issue.',
    normalMin: 0,
    normalMax: 100,
    warnMax: 90,
    category: 'boost_turbo',
    ecuAddress: '0x40011450',
  },
  boostPercent: {
    internalName: 'VeAICR_Pct_BoostPressure',
    displayName: 'Boost Pressure Indication (%)',
    unit: '%',
    description: 'Percent boost pressure used for engine boost pressure indication. Scaled 0–200% relative to atmospheric. Used in OBD PID $0B (Intake Manifold Absolute Pressure).',
    normalMin: 0,
    normalMax: 200,
    category: 'boost_turbo',
    ecuAddress: '0x40014998',
  },
  boostError: {
    internalName: 'VeAICC_p_BoostError',
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
    internalName: 'VeEGTR_T_ExhGas1',
    displayName: 'Exhaust Gas Temp — EGT1 (Pre-Turbo)',
    unit: '°F',
    description: 'Temperature from EGT sensor 1, upstream of the turbocharger. Primary exhaust temperature measurement for engine health monitoring. Sustained temperatures above 1,475°F indicate excessive fueling, timing issues, or boost problems.',
    normalMin: 200,
    normalMax: 1200,
    warnMax: 1350,
    critMax: 1475,
    category: 'exhaust_thermal',
    ecuAddress: '0x40014920',
  },
  egtTurbineDown: {
    internalName: 'VeEGTR_T_SnsrTurbDwn',
    displayName: 'Exhaust Gas Temp — Turbine Downstream',
    unit: '°F',
    description: 'Temperature downstream of the turbine, entering the aftertreatment system (DPF, SCR). Values above 1,300°F downstream indicate potential DPF regeneration or excessive load.',
    normalMin: 150,
    normalMax: 1100,
    warnMax: 1300,
    critMax: 1475,
    category: 'exhaust_thermal',
    ecuAddress: '0x40011C80',
  },

  // ── MASS AIRFLOW ────────────────────────────────────────────────────────────
  mafFiltered: {
    internalName: 'VeMAFR_dm_EngAirFlowFlt',
    displayName: 'Mass Airflow — Filtered (g/s)',
    unit: 'g/s',
    description: 'Airflow through MAF sensor corrected for heat-up effects and disturbances. Primary airflow signal for fueling calculations. At idle, normal range is 17–18 g/s with a clean filter. At WOT, the L5P can flow 130+ g/s.',
    normalMin: 8,
    normalMax: 130,
    warnMin: 4,
    warnMax: 145,
    category: 'airflow',
    ecuAddress: '0x40014564',
  },
  mafRaw: {
    internalName: 'VeMAFR_dm_EngArflUnfiltd',
    displayName: 'Mass Airflow — Unfiltered (g/s)',
    unit: 'g/s',
    description: 'Raw, unfiltered mass airflow reading directly from the MAF sensor. Comparing to the filtered value reveals sensor noise or rapid airflow transients.',
    category: 'airflow',
  },

  // ── TRANSMISSION / TORQUE CONVERTER ────────────────────────────────────────
  tccSlip: {
    internalName: 'VeSPDR_n_TCC_Slip',
    displayName: 'Torque Converter Clutch Slip',
    unit: 'RPM',
    description: 'TCC slip = engine RPM minus turbine RPM. Near-zero = fully locked converter. Values exceeding ±15 RPM under lock-up conditions indicate converter wear or hydraulic issues.',
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
    internalName: 'VeSPDR_n_TurbineSpeed',
    displayName: 'Transmission Turbine Speed',
    unit: 'RPM',
    description: 'Slightly filtered turbine speed using a 4-point moving average. For automatic transmission, this is the input shaft speed. Comparing to engine RPM gives TCC slip.',
    category: 'transmission',
    ecuAddress: '0x400110B0',
  },

  // ── ENGINE SPEED ────────────────────────────────────────────────────────────
  engineRpm: {
    internalName: 'VeSPDR_n_Eng',
    displayName: 'Engine Speed (RPM)',
    unit: 'RPM',
    description: 'Current engine crankshaft speed. The L5P Duramax redline is 3,500 RPM. Peak torque at 1,600 RPM (910 lb·ft stock), peak horsepower at 3,000 RPM (445 HP stock).',
    normalMin: 600,
    normalMax: 3500,
    warnMax: 3400,
    critMax: 3600,
    category: 'engine_speed',
  },

  // ── ENGINE LOAD / TORQUE ────────────────────────────────────────────────────
  injectionQuantity: {
    internalName: 'VeFULR_m_FuelReq',
    displayName: 'Fuel Injection Quantity (mg/stroke)',
    unit: 'mg/stroke',
    description: 'Total fuel quantity requested per injection event per cylinder. Sum of all injection pulses (pilot, main, post). At idle: 5–15 mg/stroke. At full load: up to 200+ mg/stroke.',
    normalMin: 0,
    normalMax: 200,
    warnMax: 220,
    category: 'engine_load',
  },
};

// ─── COMPREHENSIVE DTC DATABASE ───────────────────────────────────────────────
// Sourced from GM TechLink, GDS2 service data, TSBs, and real-world scan logs

export interface DtcDefinition {
  code: string;
  internalId: string;
  title: string;
  system: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  causes: string[];
  remedies: string[];
  thresholds?: string;
  enableCriteria?: string;
}

export const DTC_DEFINITIONS: DtcDefinition[] = [

  // ── FUEL SYSTEM ─────────────────────────────────────────────────────────────
  {
    code: 'P0087',
    internalId: 'FRP_TooLo',
    title: 'Fuel Rail Pressure Too Low',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Actual fuel rail pressure is significantly below the commanded target. Typical observed deviation is 1,000–2,000+ PSI below commanded, or absolute pressure below ~5,000 PSI under load, sustained for several seconds. Sets limp mode / reduced power quickly.',
    thresholds: 'Actual FRP ~1,000–2,000+ PSI below commanded (or absolute <5,000 PSI under load) for sustained seconds',
    enableCriteria: 'Runs continuously above idle; no active related DTCs required for some conditions',
    causes: [
      'Contaminated or bad fuel quality (HP4 pump is sensitive to clean, lubricated diesel fuel)',
      'Clogged fuel filter (replace every 15–20k miles)',
      'Weak or failing lift pump',
      'Failing HP4 high-pressure pump',
      'Leaking or worn fuel injectors',
      'Wiring or connector corrosion on rail pressure sensors (very common)',
      'Air in fuel lines',
      'Fuel pressure regulator (FPR) issues',
      'Short trips and low fuel level exacerbate the problem',
    ],
    remedies: [
      'Replace fuel filter every 15–20k miles (prime system after change)',
      'Test lift pump pressure; replace if low',
      'Scan commanded vs. actual FRP live data to isolate the deviation',
      'Clean or replace rail pressure sensors #1 (passenger rail) and #2; inspect wiring',
      'Program new injectors with IQA codes if injectors are replaced',
      'Use quality diesel fuel and add a cetane boost additive',
      'Perform full fuel system flush if contamination is suspected',
    ],
  },
  {
    code: 'P0088',
    internalId: 'FRP_TooHi',
    title: 'Fuel Rail Pressure Too High',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Actual fuel rail pressure exceeds the commanded target. Even brief spikes of 1–4k PSI over commanded can trigger this code. The ECM responds immediately to protect the fuel system. May indicate a stuck-open PCV or pressure relief valve issue.',
    thresholds: 'Actual FRP 1,500–4,000+ PSI above commanded, even briefly',
    enableCriteria: 'Continuous monitoring; ECM responds immediately',
    causes: [
      'Stuck-open or faulty pressure control valve (PCV/FPR solenoid)',
      'Pressure relief valve on the fuel rail stuck open or leaking',
      'Faulty rail pressure sensor giving incorrect high reading',
      'Tuning calibration issue causing incorrect pressure targets',
      'Rapid load changes causing pressure spikes',
    ],
    remedies: [
      'Check PCV solenoid current (mA) — if above 1,600 mA at idle, tuning adjustment may be needed',
      'Inspect and test the pressure relief valve on the fuel rail',
      'Verify rail pressure sensor accuracy with known-good sensor',
      'If rail desires under 5,000 PSI but actual is 12,000–14,000 PSI, check PCV solenoid',
      'Contact tuner if rail pressure is jumping rapidly ±2,500 PSI from desired — likely a regulator calibration issue',
    ],
  },
  {
    code: 'P0191',
    internalId: 'FRP_SnsrPerf',
    title: 'Fuel Rail Pressure Sensor Range/Performance',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel rail pressure sensor voltage is out of expected range. KOEO typical: Sensor 1 ~0.5V, Sensor 2 ~4.5V. Deviation triggers immediately. Sensor signal is within range but does not correlate with expected values.',
    thresholds: 'Sensor voltage outside expected range (Sensor 1: ~0.5V KOEO, Sensor 2: ~4.5V KOEO)',
    causes: [
      'Corroded or damaged sensor connector (very common on L5P)',
      'Failed rail pressure sensor',
      'Wiring damage or chafing',
      'Contaminated fuel affecting sensor element',
    ],
    remedies: [
      'Inspect and clean sensor connectors; apply dielectric grease',
      'Replace fuel rail pressure sensor',
      'Check wiring harness for damage or corrosion',
    ],
  },
  {
    code: 'P228C',
    internalId: 'FuelPresReg_PerfLo',
    title: 'Fuel Pressure Regulator Performance — Low',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel pressure regulator current or pressure deviates from desired. Real-world: sustained mismatch during decel or load (e.g., rail bounces 3–4k PSI vs. commanded 10k+).',
    thresholds: 'Sustained regulator current/pressure mismatch during decel or load conditions',
    causes: [
      'Failing fuel pressure regulator (FPR) solenoid',
      'Wiring issue to FPR',
      'Contaminated fuel affecting regulator operation',
      'High-pressure pump wear',
    ],
    remedies: [
      'Check FPR solenoid resistance and current draw',
      'Inspect wiring and connector to FPR',
      'Replace FPR solenoid if out of spec',
      'Evaluate high-pressure pump condition',
    ],
  },
  {
    code: 'P0093',
    internalId: 'FuelLeak',
    title: 'Fuel System Leak Detected — Large',
    system: 'Fuel System',
    severity: 'critical',
    description: 'ECM detects a large fuel leak based on the difference between commanded and actual fuel rail pressure drop rate. Can indicate a cracked high-pressure line, failed injector return, or pump seal failure.',
    causes: [
      'Cracked or damaged high-pressure fuel line',
      'Failed injector return fitting or seal',
      'High-pressure pump seal failure',
      'Loose fuel rail fitting',
    ],
    remedies: [
      'Inspect all high-pressure fuel lines and connections for leaks',
      'Perform injector return flow test',
      'Check pump inlet and outlet fittings',
      'Do NOT run engine if active fuel leak is suspected',
    ],
  },

  // ── AIR SYSTEM ───────────────────────────────────────────────────────────────
  {
    code: 'P0101',
    internalId: 'MAF_Perf',
    title: 'Mass Air Flow Sensor Performance',
    system: 'Air System',
    severity: 'warning',
    description: 'MAF reading is outside the expected range compared to the ECM model. Normal idle MAF with clean filter and no leaks is approximately 17–18 g/s. Observed low readings of 7–12 g/s trigger this code.',
    thresholds: 'MAF reading outside model-expected range; idle normal: 17–18 g/s; low trigger: ~7–12 g/s',
    enableCriteria: 'Continuous monitoring',
    causes: [
      'Dirty or restricted air filter (can trigger within 500 miles in dusty conditions)',
      'Contaminated MAF sensor element (soot from EGR)',
      'Intake air leak between MAF sensor and turbo inlet',
      'Faulty MAF sensor',
      'Short-trip idling with high EGR builds soot on sensor quickly',
    ],
    remedies: [
      'Replace or clean air filter; inspect for damage',
      'Clean MAF sensor with electronic cleaner (do not touch element)',
      'Inspect all intake boots and couplers for cracks or loose clamps',
      'Replace MAF sensor if cleaning does not resolve',
      'Update ECM software if applicable TSB exists',
    ],
  },
  {
    code: 'P0102',
    internalId: 'MAF_CktLo',
    title: 'Mass Air Flow Sensor Circuit Low',
    system: 'Air System',
    severity: 'warning',
    description: 'MAF sensor signal voltage is below the minimum threshold. Check for sensor failure, damaged wiring, or contaminated sensor element.',
    causes: [
      'Failed MAF sensor',
      'Short to ground in MAF signal wire',
      'Damaged wiring harness',
      'Poor connector contact',
    ],
    remedies: [
      'Check MAF sensor connector and wiring for damage',
      'Test sensor voltage at connector',
      'Replace MAF sensor if wiring checks out',
    ],
  },
  {
    code: 'P0299',
    internalId: 'TurboUnderboost',
    title: 'Turbocharger Underboost — P0299',
    system: 'Air System',
    severity: 'critical',
    description: 'Measured MAP is more than ~39 kPa (~5–6 PSI) below expected for approximately 10 seconds with engine RPM between 800–3,000. Indicates the turbocharger is not producing sufficient boost pressure.',
    thresholds: 'MAP >39 kPa (~5–6 PSI) below expected for ~10 seconds; RPM 800–3,000',
    enableCriteria: 'Continuous monitoring; requires ~10 second sustained deviation',
    causes: [
      'Boost leak in intercooler (CAC) boots, pipes, or connections',
      'Turbo VGT vane position stuck or restricted',
      'Dirty or restricted air filter reducing turbo inlet pressure',
      'TMAP sensor fouling with soot/carbon giving false low readings',
      'Exhaust leak upstream of turbo affecting drive pressure',
      'Turbo actuator failure',
    ],
    remedies: [
      'Perform boost leak smoke test on entire intake system',
      'Inspect CAC boots and intercooler connections for cracks',
      'Check turbo VGT actuator operation and vane movement',
      'Clean TMAP sensor with electronic cleaner',
      'Replace air filter; inspect for restrictions',
      'Force DPF regen if DPF backpressure is contributing',
      'Update ECM software if applicable TSB exists',
    ],
  },
  {
    code: 'P0106',
    internalId: 'MAP_Perf',
    title: 'Manifold Absolute Pressure Sensor Performance',
    system: 'Air System',
    severity: 'warning',
    description: 'MAP/TMAP sensor reading is skewed — for example, stuck at BARO or 40 kPa off expected. Common cause is TMAP sensor fouling with soot and carbon buildup from EGR.',
    causes: [
      'TMAP sensor fouled with soot and carbon (very common on L5P)',
      'Sensor stuck or slow to respond',
      'Vacuum line to sensor cracked or disconnected',
      'Failed MAP/TMAP sensor',
    ],
    remedies: [
      'Clean TMAP sensor with electronic cleaner; allow to dry before reinstalling',
      'Inspect vacuum/pressure port for blockage',
      'Replace TMAP sensor if cleaning does not resolve',
      'Check for intake leaks that could affect MAP reading',
    ],
  },
  {
    code: 'P0108',
    internalId: 'MAP_CktHi',
    title: 'Manifold Absolute Pressure Sensor Circuit High',
    system: 'Air System',
    severity: 'warning',
    description: 'MAP sensor signal voltage is above the maximum threshold. Can indicate a short to voltage in sensor wiring or a failed sensor.',
    causes: [
      'Short to voltage in MAP signal wire',
      'Failed MAP/TMAP sensor',
      'Damaged wiring harness',
    ],
    remedies: [
      'Inspect MAP sensor wiring for shorts',
      'Test sensor voltage at connector',
      'Replace MAP/TMAP sensor if wiring is intact',
    ],
  },

  // ── DPF SYSTEM ───────────────────────────────────────────────────────────────
  {
    code: 'P2463',
    internalId: 'DPF_SootAccum',
    title: 'Diesel Particulate Filter — Soot Accumulation',
    system: 'DPF System',
    severity: 'critical',
    description: 'DPF soot accumulation has reached 140% — no more passive regens are possible. Requires a service regen (forced regen via scan tool) or dealer service. Regen trigger starts at ~100% soot. "Continue Driving" message appears at 115%.',
    thresholds: 'Soot accumulation: Regen trigger ~100%, Continue Driving message ~115%, P2463 sets at ~140%',
    enableCriteria: 'Regen after ~36 gal fuel / ~800 miles / set engine hours; requires: Drive, BARO >51 kPa, RPM 500–4,000, EGT1 100–725°C, ECT 50–140°C, VSS 0–160 km/h, no active EGR/boost DTCs',
    causes: [
      'Ignoring "Continue Driving" messages (do not stop during active regen)',
      'Excessive idling or stop-and-go traffic (prevents passive regen)',
      'Short trips that never allow engine to reach regen temperature',
      'Intake or exhaust leaks affecting regen conditions',
      'Bad fuel quality',
      'Restricted air filter or CAC leaks',
      'Skewed EGT, DPF differential pressure, or MAF sensors',
      'Improperly routed DPF differential pressure lines (must have downward gradient, no kinks)',
    ],
    remedies: [
      'Drive at steady highway speeds (cruise control, Tow/Haul mode on hills) for 20–30+ minutes to complete passive regen',
      'Use scan tool for forced/service regen (requires: >¼ tank fuel, stationary, warm engine)',
      'Fix any intake/exhaust leaks and repair faulty sensors before regen',
      'Clean or replace air filter; inspect DPF differential pressure lines for kinks',
      'Replace DPF if cracked or contaminated (rare, but possible after repeated failed regens)',
    ],
  },
  {
    code: 'P242F',
    internalId: 'DPF_Restricted',
    title: 'Diesel Particulate Filter — Restriction',
    system: 'DPF System',
    severity: 'critical',
    description: 'DPF differential pressure indicates the filter is restricted beyond normal soot loading. May indicate a damaged or failed DPF substrate.',
    causes: [
      'Failed DPF substrate (cracked or melted)',
      'Excessive oil consumption fouling the DPF',
      'Repeated incomplete regens',
      'Contaminated DPF from coolant or fuel',
    ],
    remedies: [
      'Perform service regen and recheck differential pressure',
      'Inspect DPF for physical damage',
      'Check for oil consumption or coolant leaks',
      'Replace DPF if restriction remains after regen',
    ],
  },

  // ── SCR / DEF SYSTEM ─────────────────────────────────────────────────────────
  {
    code: 'P20EE',
    internalId: 'SCR_NOx_Eff',
    title: 'SCR NOx Catalyst Efficiency Below Threshold',
    system: 'SCR / DEF System',
    severity: 'critical',
    description: 'SCR NOx reduction efficiency is below ~85–90%. Federal spec requires ~85 ppm tailpipe NOx. Observed trigger: NOx inlet ~400 ppm → outlet >40–90 ppm. Requires drive cycle with regen to complete monitor.',
    thresholds: 'NOx reduction efficiency <85–90%; inlet ~400 ppm → outlet >40–90 ppm',
    enableCriteria: 'Continuous or after drive cycle; NOx monitor requires regen cycle',
    causes: [
      'Bad or contaminated DEF (crystallized, old, or wrong concentration)',
      'Failed DEF injector not spraying correctly',
      'Clogged DEF lines or injector tip',
      'Faulty NOx sensor #2 (post-SCR) — very common at 80–100k miles',
      'SCR catalyst degradation or poisoning',
      'Low DEF level',
    ],
    remedies: [
      'Use fresh, quality DEF (fill at truck stops if possible; avoid bulk or old DEF)',
      'Drain and refill DEF tank if contamination is suspected',
      'Test DEF concentration and pressure with scan tool',
      'Replace DEF pump, injector, or lines as needed',
      'Replace NOx sensor #2 (post-SCR) if failed',
      'Perform SCR reset/adaptation with scan tool after repairs',
      'Verify ~90% NOx reduction with tailpipe test after repair',
    ],
  },
  {
    code: 'P20E8',
    internalId: 'DEF_Pressure',
    title: 'Reductant Pressure Too Low',
    system: 'SCR / DEF System',
    severity: 'warning',
    description: 'DEF system fails to build adequate pressure. Observed trigger: system fails to build >~51 PSI within ~45 seconds.',
    thresholds: 'Fails to build >~51 PSI within ~45 seconds',
    causes: [
      'Failed DEF pump',
      'Clogged DEF filter or strainer',
      'Frozen DEF lines (cold weather)',
      'Failed pressure sensor',
    ],
    remedies: [
      'Check DEF pump operation and pressure output',
      'Inspect and clean DEF filter/strainer',
      'Allow vehicle to warm up if DEF lines may be frozen',
      'Replace DEF pump if pressure cannot be achieved',
    ],
  },

  // ── EGR SYSTEM ───────────────────────────────────────────────────────────────
  {
    code: 'P0401',
    internalId: 'EGR_FlowInsuff',
    title: 'EGR Flow Insufficient',
    system: 'EGR System',
    severity: 'warning',
    description: 'EGR flow is below the model-expected value. Detected via MAF delta method — actual MAF is higher than expected when EGR should be flowing. Valve position error above threshold triggers quickly when valve is sticking.',
    enableCriteria: 'Continuous or during specific drive cycles; EGR monitor requires many miles of city/highway mix',
    causes: [
      'Carbon and soot buildup on EGR valve (very common on L5P)',
      'Stuck EGR valve (stuck closed)',
      'Faulty EGR position sensor',
      'Clogged EGR cooler',
      'Wiring issues to EGR valve',
      'Short trips with high EGR use accelerate carbon buildup',
    ],
    remedies: [
      'Clean EGR valve, sensor, and cooler (DIY cleaning with electronic cleaner and brush)',
      'Replace EGR valve if stuck or warped',
      'Replace EGR cooler if leaking or severely clogged',
      'Inspect EGR gaskets for leaks',
      'Update ECM software per applicable TSB',
      'Monitor EGR duty cycle live data to confirm proper operation after repair',
    ],
  },
  {
    code: 'P0402',
    internalId: 'EGR_FlowExcessive',
    title: 'EGR Flow Excessive',
    system: 'EGR System',
    severity: 'warning',
    description: 'EGR flow exceeds the model-expected value. Actual MAF is lower than expected, indicating too much exhaust gas is being recirculated.',
    causes: [
      'Stuck-open EGR valve',
      'Faulty EGR position sensor giving incorrect reading',
      'EGR valve control circuit issue',
    ],
    remedies: [
      'Inspect EGR valve for stuck-open condition',
      'Test EGR position sensor',
      'Check EGR valve control wiring',
      'Replace EGR valve if stuck open',
    ],
  },
  {
    code: 'P0404',
    internalId: 'EGR_CktPerf',
    title: 'EGR Circuit Range/Performance',
    system: 'EGR System',
    severity: 'warning',
    description: 'EGR valve position sensor is outside the expected percentage range. Common cause is carbon buildup on the position sensor affecting its reading.',
    causes: [
      'Carbon buildup on EGR position sensor',
      'Failed EGR position sensor',
      'Wiring issue to position sensor',
      'Mechanical binding of EGR valve',
    ],
    remedies: [
      'Clean EGR valve and position sensor',
      'Test position sensor voltage range',
      'Replace EGR valve assembly if sensor is integrated and cannot be cleaned',
    ],
  },

  // ── EGT SENSORS ──────────────────────────────────────────────────────────────
  {
    code: 'P0544',
    internalId: 'EGT1_Circuit',
    title: 'Exhaust Gas Temperature Sensor Circuit — Bank 1 Sensor 1',
    system: 'EGT Sensors',
    severity: 'warning',
    description: 'EGT1 sensor signal is out of range or does not match the ECM thermal model. On cold start, all EGT sensors should read near-ambient temperature. If EGT reads above 1,800°F and is stuck, the sensor is likely disconnected or failed.',
    thresholds: 'Cold start: all sensors should read near-ambient; stuck above 1,800°F = sensor disconnected or failed',
    causes: [
      'Failed EGT sensor (common after high heat cycles)',
      'Disconnected or damaged sensor connector',
      'Wiring damage from heat',
      'Sensor reading stuck at maximum value (open circuit)',
    ],
    remedies: [
      'Inspect EGT sensor connector and wiring for heat damage',
      'Test sensor resistance at ambient temperature',
      'Replace EGT sensor if out of spec or stuck',
      'Ensure connector is fully seated and locked',
    ],
  },

  // ── GENERAL / MISC ────────────────────────────────────────────────────────────
  {
    code: 'P0001',
    internalId: 'FuelPresReg1_Perf',
    title: 'Fuel Volume Regulator Control Circuit/Open',
    system: 'Fuel System',
    severity: 'warning',
    description: 'PCV solenoid performance issue. The ECM cannot achieve the desired fuel pressure through normal PCV duty cycle adjustment.',
    causes: [
      'Failed PCV solenoid',
      'Open circuit in PCV wiring',
      'High-pressure pump wear reducing controllable range',
    ],
    remedies: [
      'Test PCV solenoid resistance and current draw',
      'Inspect wiring to PCV solenoid',
      'Replace PCV solenoid if out of spec',
    ],
  },
  {
    code: 'P0002',
    internalId: 'FuelPresReg1_PresTooLo',
    title: 'Fuel Volume Regulator Control Circuit Range/Performance Low',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel pressure regulator 1 is commanding maximum flow but pressure is still too low. Indicates the high-pressure pump may be worn or the regulator is stuck.',
    causes: [
      'Worn HP4 high-pressure pump',
      'Stuck fuel pressure regulator',
      'Severe fuel contamination',
    ],
    remedies: [
      'Evaluate HP4 high-pressure pump output',
      'Check fuel quality and filter condition',
      'Replace pump or regulator as indicated',
    ],
  },
  {
    code: 'P0003',
    internalId: 'FuelPresReg1_PresTooHi',
    title: 'Fuel Volume Regulator Control Circuit Low',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel pressure regulator 1 is commanding minimum flow but pressure is still too high. Indicates a stuck-open regulator or pressure relief valve issue.',
    causes: [
      'Stuck-open fuel pressure regulator',
      'Pressure relief valve stuck open',
      'Faulty rail pressure sensor',
    ],
    remedies: [
      'Test and replace fuel pressure regulator',
      'Inspect pressure relief valve',
      'Verify rail pressure sensor accuracy',
    ],
  },
  {
    code: 'P0234',
    internalId: 'TurboOverboost',
    title: 'Turbocharger/Supercharger Overboost',
    system: 'Air System',
    severity: 'critical',
    description: 'Actual boost pressure exceeds the maximum calibrated limit. May indicate a stuck VGT vane, boost control solenoid failure, or tuning issue.',
    causes: [
      'Stuck VGT vane (stuck closed = too much boost)',
      'Boost control solenoid failure',
      'Tuning calibration error',
      'Wastegate failure (if equipped)',
    ],
    remedies: [
      'Check VGT actuator and vane movement',
      'Test boost control solenoid',
      'Verify tuning calibration if recently tuned',
      'Inspect for any boost system modifications',
    ],
  },

  // ── GM HD OBD SPEC (2024 24OBDG06C HD) - 280 ADDITIONAL CODES ─────────────────────────
  {
    code: 'P0016',
    internalId: 'GM_0016',
    title: 'Crankshaft/Camshaft Position Correlation Bank 1 Sensor A',
    system: 'Engine - Timing',
    severity: 'critical',
    description: 'Detects cam to crank misalignment by monitoring if cam sensor A occurs during the incorrect crank position. 4 cam sensor pulses less than or greater than nominal position in one cam revolution.',
    causes: [
    'Stretched or worn timing chain',
    'Damaged cam or crank reluctor wheel',
    'Faulty cam or crank position sensor',
    'Incorrect engine timing after service'
  ],
    remedies: [
    'Inspect timing chain for stretch/wear',
    'Replace cam/crank sensors if faulty',
    'Verify timing marks alignment',
    'Check reluctor wheel for damage'
  ],
    thresholds: '-10.0 to 10.0 Crank Degrees',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0046',
    internalId: 'GM_0046',
    title: 'Turbocharger Boost Control Solenoid Circuit Performance',
    system: 'Air System',
    severity: 'warning',
    description: 'Detects failures in the boost control solenoid circuit. The actual boost pressure does not respond correctly to the commanded boost control duty cycle.',
    causes: [
    'Sticking VGT vane actuator',
    'Faulty boost control solenoid',
    'Carbon buildup on VGT vanes',
    'Turbo actuator rod binding'
  ],
    remedies: [
    'Clean VGT vanes with approved cleaner',
    'Test/replace boost control solenoid',
    'Inspect actuator rod for binding',
    'Perform VGT learn procedure after repair'
  ],
    thresholds: 'Boost pressure tracking error',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0071',
    internalId: 'GM_0071',
    title: 'Outside Air Temperature (OAT) Sensor Circuit Performance',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'Detects an OAT sensor stuck in range. If IAT >= OAT: IAT - OAT > 20.0 deg C. If IAT < OAT: OAT - IAT > 20.0 deg C.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: '20.0 deg C delta between IAT and OAT',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0072',
    internalId: 'GM_0072',
    title: 'Outside Air Temperature Sensor Circuit Low',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'OAT sensor circuit voltage below threshold. Sensor output < 0.1V indicating short to ground.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V sensor output',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0073',
    internalId: 'GM_0073',
    title: 'Outside Air Temperature Sensor Circuit High',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'OAT sensor circuit voltage above threshold. Sensor output > 4.9V indicating open circuit or short to voltage.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V sensor output',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0074',
    internalId: 'GM_0074',
    title: 'Outside Air Temperature Sensor Circuit Intermittent',
    system: 'Engine - Sensors',
    severity: 'info',
    description: 'Intermittent OAT sensor circuit fault detected.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0089',
    internalId: 'GM_0089',
    title: 'Fuel Pressure Regulator Performance',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel pressure regulator is not controlling rail pressure within expected range. The regulator is not responding correctly to commanded pressure changes.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Rail pressure oscillation > 1,500 psi amplitude',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0090',
    internalId: 'GM_0090',
    title: 'Fuel Pressure Regulator Control Circuit',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Open or short in the fuel pressure regulator (PCV) control circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0091',
    internalId: 'GM_0091',
    title: 'Fuel Pressure Regulator Control Circuit Low',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel pressure regulator control circuit voltage is too low (short to ground).',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 5% duty cycle when commanded higher',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0092',
    internalId: 'GM_0092',
    title: 'Fuel Pressure Regulator Control Circuit High',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel pressure regulator control circuit voltage is too high (short to voltage).',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 95% duty cycle when commanded lower',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0096',
    internalId: 'GM_0096',
    title: 'Intake Air Temperature Sensor 2 Circuit Performance',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'Intake air temperature sensor 2 (charge air cooler outlet) performance fault. IAT2 does not correlate with expected values.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'IAT2 deviation > 20 deg C from expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0097',
    internalId: 'GM_0097',
    title: 'Intake Air Temperature Sensor 2 Circuit Low',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'IAT2 sensor circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0098',
    internalId: 'GM_0098',
    title: 'Intake Air Temperature Sensor 2 Circuit High',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'IAT2 sensor circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0099',
    internalId: 'GM_0099',
    title: 'Intake Air Temperature Sensor 2 Circuit Intermittent',
    system: 'Engine - Sensors',
    severity: 'info',
    description: 'Intermittent IAT2 sensor fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0103',
    internalId: 'GM_0103',
    title: 'Mass Air Flow Sensor Circuit High',
    system: 'Engine - Air',
    severity: 'critical',
    description: 'MAF sensor circuit voltage too high. Sensor output above maximum threshold.',
    causes: [
    'MAF sensor wiring open or short to voltage',
    'Faulty MAF sensor',
    'Damaged connector pins'
  ],
    remedies: [
    'Test MAF sensor voltage output',
    'Inspect wiring for opens',
    'Replace MAF sensor'
  ],
    thresholds: '> 4.9V sensor output',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0107',
    internalId: 'GM_0107',
    title: 'MAP Sensor Circuit Low',
    system: 'Engine - Air',
    severity: 'critical',
    description: 'MAP sensor circuit voltage too low.',
    causes: [
    'MAP sensor wiring short to ground',
    'Faulty MAP sensor',
    'Damaged connector'
  ],
    remedies: [
    'Test MAP sensor voltage',
    'Inspect wiring for shorts',
    'Replace MAP sensor'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0111',
    internalId: 'GM_0111',
    title: 'Intake Air Temperature Sensor Circuit Performance',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'IAT sensor performance fault. IAT does not change as expected with engine operation.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'IAT deviation from expected > 20 deg C',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0112',
    internalId: 'GM_0112',
    title: 'Intake Air Temperature Sensor Circuit Low',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'IAT sensor circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0113',
    internalId: 'GM_0113',
    title: 'Intake Air Temperature Sensor Circuit High',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'IAT sensor circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0114',
    internalId: 'GM_0114',
    title: 'Intake Air Temperature Sensor Circuit Intermittent',
    system: 'Engine - Sensors',
    severity: 'info',
    description: 'Intermittent IAT sensor fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0116',
    internalId: 'GM_0116',
    title: 'Engine Coolant Temperature Sensor Circuit Performance',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'ECT sensor performance fault. Coolant temperature does not warm up at expected rate or stays at implausible value.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'ECT < 60 deg C after 20 min of operation',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0117',
    internalId: 'GM_0117',
    title: 'Engine Coolant Temperature Sensor Circuit Low',
    system: 'Engine - Cooling',
    severity: 'critical',
    description: 'ECT sensor circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V (> 150 deg C indicated)',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0118',
    internalId: 'GM_0118',
    title: 'Engine Coolant Temperature Sensor Circuit High',
    system: 'Engine - Cooling',
    severity: 'critical',
    description: 'ECT sensor circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V (< -40 deg C indicated)',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0119',
    internalId: 'GM_0119',
    title: 'Engine Coolant Temperature Sensor Circuit Intermittent',
    system: 'Engine - Cooling',
    severity: 'info',
    description: 'Intermittent ECT sensor fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0128',
    internalId: 'GM_0128',
    title: 'Coolant Temperature Below Thermostat Regulating Temperature',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Engine coolant temperature does not reach normal operating temperature. Indicates a stuck-open thermostat or thermostat failure. Coolant should reach at least 75-80 deg C within 20 minutes of operation.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'ECT < 75 deg C after 20 min of operation',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0171',
    internalId: 'GM_0171',
    title: 'System Too Lean (Bank 1)',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Long-term fuel trim correction is at maximum lean limit. Indicates insufficient fuel delivery, air leak, or MAF sensor under-reading. On Duramax, often indicates a boost leak, air intake leak, or failing lift pump.',
    causes: [
    'VGT vane sticking or carbon buildup',
    'Boost control solenoid fault',
    'Turbo actuator malfunction',
    'Boost leak in charge air system'
  ],
    remedies: [
    'Clean VGT vanes',
    'Test boost control solenoid',
    'Pressure test charge air system',
    'Inspect turbo actuator'
  ],
    thresholds: 'Long-term fuel trim at maximum lean correction limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0172',
    internalId: 'GM_0172',
    title: 'System Too Rich (Bank 1)',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Long-term fuel trim correction is at maximum rich limit. Indicates excessive fuel delivery or air restriction.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Long-term fuel trim at maximum rich correction limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0181',
    internalId: 'GM_0181',
    title: 'Fuel Temperature Sensor A Circuit Range/Performance',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel temperature sensor performance fault. Fuel temperature does not correlate with expected values based on coolant temperature and ambient conditions.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Fuel temp deviation > 20 deg C from expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0182',
    internalId: 'GM_0182',
    title: 'Fuel Temperature Sensor A Circuit Low',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel temperature sensor circuit voltage too low.',
    causes: [
    'Thermostat stuck open',
    'Faulty temperature sensor',
    'Coolant leak',
    'Cold ambient conditions'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0183',
    internalId: 'GM_0183',
    title: 'Fuel Temperature Sensor A Circuit High',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel temperature sensor circuit voltage too high.',
    causes: [
    'Cooling system restriction',
    'Low coolant level',
    'Thermostat stuck closed',
    'Excessive engine load'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0184',
    internalId: 'GM_0184',
    title: 'Fuel Temperature Sensor A Circuit Intermittent',
    system: 'Fuel System',
    severity: 'info',
    description: 'Intermittent fuel temperature sensor fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0186',
    internalId: 'GM_0186',
    title: 'Fuel Temperature Sensor B Circuit Range/Performance',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel temperature sensor B (secondary) performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Deviation > 20 deg C from expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0192',
    internalId: 'GM_0192',
    title: 'Fuel Rail Pressure Sensor Circuit Low',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel rail pressure sensor circuit voltage too low (< 4.0% of supply voltage). Short to ground or open circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 4.0% of supply voltage',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0193',
    internalId: 'GM_0193',
    title: 'Fuel Rail Pressure Sensor Circuit High',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel rail pressure sensor circuit voltage too high (> 96.0% of supply voltage). Short to voltage.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 96.0% of supply voltage',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0194',
    internalId: 'GM_0194',
    title: 'Fuel Rail Pressure Sensor Circuit Intermittent',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Intermittent fuel rail pressure sensor fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0201',
    internalId: 'GM_0201',
    title: 'Injector Circuit/Open - Cylinder 1',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 1 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0202',
    internalId: 'GM_0202',
    title: 'Injector Circuit/Open - Cylinder 2',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 2 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0203',
    internalId: 'GM_0203',
    title: 'Injector Circuit/Open - Cylinder 3',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 3 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0204',
    internalId: 'GM_0204',
    title: 'Injector Circuit/Open - Cylinder 4',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 4 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0205',
    internalId: 'GM_0205',
    title: 'Injector Circuit/Open - Cylinder 5',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 5 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0206',
    internalId: 'GM_0206',
    title: 'Injector Circuit/Open - Cylinder 6',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 6 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0207',
    internalId: 'GM_0207',
    title: 'Injector Circuit/Open - Cylinder 7',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 7 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0208',
    internalId: 'GM_0208',
    title: 'Injector Circuit/Open - Cylinder 8',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Open circuit detected in cylinder 8 injector circuit.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0216',
    internalId: 'GM_0216',
    title: 'Injection Timing Control Circuit',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injection timing control circuit fault. Timing is not responding correctly to commanded values.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Timing deviation > calibration limit',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0261',
    internalId: 'GM_0261',
    title: 'Cylinder 1 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 1 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0262',
    internalId: 'GM_0262',
    title: 'Cylinder 1 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 1 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0264',
    internalId: 'GM_0264',
    title: 'Cylinder 2 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 2 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0265',
    internalId: 'GM_0265',
    title: 'Cylinder 2 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 2 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0267',
    internalId: 'GM_0267',
    title: 'Cylinder 3 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 3 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0268',
    internalId: 'GM_0268',
    title: 'Cylinder 3 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 3 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0270',
    internalId: 'GM_0270',
    title: 'Cylinder 4 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 4 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0271',
    internalId: 'GM_0271',
    title: 'Cylinder 4 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 4 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0273',
    internalId: 'GM_0273',
    title: 'Cylinder 5 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 5 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0274',
    internalId: 'GM_0274',
    title: 'Cylinder 5 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 5 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0276',
    internalId: 'GM_0276',
    title: 'Cylinder 6 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 6 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0277',
    internalId: 'GM_0277',
    title: 'Cylinder 6 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 6 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0279',
    internalId: 'GM_0279',
    title: 'Cylinder 7 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 7 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0280',
    internalId: 'GM_0280',
    title: 'Cylinder 7 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 7 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0282',
    internalId: 'GM_0282',
    title: 'Cylinder 8 Injector Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 8 injector circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0283',
    internalId: 'GM_0283',
    title: 'Cylinder 8 Injector Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Cylinder 8 injector circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0300',
    internalId: 'GM_0300',
    title: 'Random/Multiple Cylinder Misfire Detected',
    system: 'Engine - Combustion',
    severity: 'critical',
    description: 'Random misfires detected across multiple cylinders. On the Duramax, this can indicate injector issues, low compression, air/fuel delivery problems, or glow plug failures.',
    causes: [
    'Worn or clogged injector',
    'Injector return flow out of spec',
    'Injector driver circuit fault',
    'Contaminated fuel'
  ],
    remedies: [
    'Test injector return flow',
    'Clean or replace injectors',
    'Check injector driver circuit',
    'Use quality fuel'
  ],
    thresholds: 'Misfire rate exceeds calibration threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0301',
    internalId: 'GM_0301',
    title: 'Cylinder 1 Misfire Detected',
    system: 'Engine - Combustion',
    severity: 'critical',
    description: 'Misfire detected in cylinder 1.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Misfire rate > calibration threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0302',
    internalId: 'GM_0302',
    title: 'Cylinder 2 Misfire Detected',
    system: 'Engine - Combustion',
    severity: 'critical',
    description: 'Misfire detected in cylinder 2.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Misfire rate > calibration threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0303',
    internalId: 'GM_0303',
    title: 'Cylinder 3 Misfire Detected',
    system: 'Engine - Combustion',
    severity: 'critical',
    description: 'Misfire detected in cylinder 3.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Misfire rate > calibration threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0308',
    internalId: 'GM_0308',
    title: 'Cylinder 8 Misfire Detected',
    system: 'Engine - Combustion',
    severity: 'critical',
    description: 'Misfire detected in cylinder 8.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Misfire rate > calibration threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0315',
    internalId: 'GM_0315',
    title: 'Crankshaft Position System Variation Not Learned',
    system: 'Engine - Timing',
    severity: 'warning',
    description: 'Crankshaft position sensor variation values have not been learned. Requires a relearn procedure.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Variation values not stored',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0335',
    internalId: 'GM_0335',
    title: 'Crankshaft Position Sensor A Circuit',
    system: 'Engine - Timing',
    severity: 'critical',
    description: 'No signal from crankshaft position sensor A.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'No signal detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0336',
    internalId: 'GM_0336',
    title: 'Crankshaft Position Sensor A Circuit Range/Performance',
    system: 'Engine - Timing',
    severity: 'critical',
    description: 'CKP sensor A signal is erratic or out of range.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Signal error rate > calibration limit',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0340',
    internalId: 'GM_0340',
    title: 'Camshaft Position Sensor A Circuit (Bank 1)',
    system: 'Engine - Timing',
    severity: 'critical',
    description: 'No signal from camshaft position sensor A Bank 1.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'No signal detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0341',
    internalId: 'GM_0341',
    title: 'Camshaft Position Sensor A Circuit Range/Performance (Bank 1)',
    system: 'Engine - Timing',
    severity: 'critical',
    description: 'CMP sensor A Bank 1 signal is erratic or out of range.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Signal error rate > calibration limit',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0381',
    internalId: 'GM_0381',
    title: 'Glow Plug/Heater Indicator Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Glow plug indicator circuit fault. Glow plug system not functioning correctly.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0403',
    internalId: 'GM_0403',
    title: 'Exhaust Gas Recirculation Control Circuit',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR control circuit fault.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0405',
    internalId: 'GM_0405',
    title: 'Exhaust Gas Recirculation Sensor A Circuit Low',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR position sensor circuit voltage too low.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0406',
    internalId: 'GM_0406',
    title: 'Exhaust Gas Recirculation Sensor A Circuit High',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR position sensor circuit voltage too high.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0421',
    internalId: 'GM_0421',
    title: 'Warm Up Catalyst Efficiency Below Threshold (Bank 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'Catalyst efficiency below threshold after warm-up.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Catalyst efficiency < calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0480',
    internalId: 'GM_0480',
    title: 'Cooling Fan 1 Control Circuit',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Cooling fan 1 control circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0483',
    internalId: 'GM_0483',
    title: 'Cooling Fan Rationality Check',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Cooling fan operation does not match expected behavior based on coolant temperature.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Fan speed vs temperature rationality error',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0489',
    internalId: 'GM_0489',
    title: 'Exhaust Gas Recirculation Control Circuit Low',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR control circuit voltage too low.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0490',
    internalId: 'GM_0490',
    title: 'Exhaust Gas Recirculation Control Circuit High',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR control circuit voltage too high.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: '> maximum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0495',
    internalId: 'GM_0495',
    title: 'Cooling Fan Speed High',
    system: 'Engine - Cooling',
    severity: 'info',
    description: 'Cooling fan speed is higher than expected for current conditions.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Fan speed > expected for coolant temp',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0506',
    internalId: 'GM_0506',
    title: 'Idle Control System RPM Too Low',
    system: 'Engine - Idle',
    severity: 'warning',
    description: 'Engine idle speed is lower than the desired idle RPM. Indicates a vacuum leak, throttle body deposit, or idle control system issue.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Actual idle RPM < desired idle RPM - 100 RPM for > 10 seconds',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0507',
    internalId: 'GM_0507',
    title: 'Idle Control System RPM Too High',
    system: 'Engine - Idle',
    severity: 'warning',
    description: 'Engine idle speed is higher than the desired idle RPM. Indicates a sticking throttle, vacuum leak, or idle control system issue.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Actual idle RPM > desired idle RPM + 200 RPM for > 10 seconds',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0545',
    internalId: 'GM_0545',
    title: 'Exhaust Gas Temperature Sensor Circuit Low (Bank 1 Sensor 1)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0546',
    internalId: 'GM_0546',
    title: 'Exhaust Gas Temperature Sensor Circuit High (Bank 1 Sensor 1)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0562',
    internalId: 'GM_0562',
    title: 'System Voltage Low',
    system: 'Electrical',
    severity: 'critical',
    description: 'System voltage is below minimum threshold. Indicates a failing alternator, battery, or charging system issue.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 11.0V for > 10 seconds',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0563',
    internalId: 'GM_0563',
    title: 'System Voltage High',
    system: 'Electrical',
    severity: 'critical',
    description: 'System voltage is above maximum threshold. Indicates a faulty voltage regulator or alternator.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 16.0V for > 10 seconds',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0600',
    internalId: 'GM_0600',
    title: 'Serial Communication Link',
    system: 'ECM',
    severity: 'critical',
    description: 'Serial communication link fault between ECM and other modules.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Communication error detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0615',
    internalId: 'GM_0615',
    title: 'Starter Relay Circuit',
    system: 'Electrical',
    severity: 'warning',
    description: 'Starter relay circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0616',
    internalId: 'GM_0616',
    title: 'Starter Relay Circuit Low',
    system: 'Electrical',
    severity: 'warning',
    description: 'Starter relay circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0617',
    internalId: 'GM_0617',
    title: 'Starter Relay Circuit High',
    system: 'Electrical',
    severity: 'warning',
    description: 'Starter relay circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0641',
    internalId: 'GM_0641',
    title: 'Sensor Reference Voltage A Circuit/Open',
    system: 'ECM',
    severity: 'critical',
    description: '5V reference voltage A circuit is open or out of range. Multiple sensors share this reference voltage.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Reference voltage < 4.5V or > 5.5V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0651',
    internalId: 'GM_0651',
    title: 'Sensor Reference Voltage B Circuit/Open',
    system: 'ECM',
    severity: 'critical',
    description: '5V reference voltage B circuit is open or out of range.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Reference voltage < 4.5V or > 5.5V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0652',
    internalId: 'GM_0652',
    title: 'Sensor Reference Voltage B Circuit Low',
    system: 'ECM',
    severity: 'critical',
    description: '5V reference voltage B circuit too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 4.5V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0657',
    internalId: 'GM_0657',
    title: 'Actuator Supply Voltage A Circuit/Open',
    system: 'ECM',
    severity: 'critical',
    description: 'Actuator supply voltage A circuit open or out of range.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0658',
    internalId: 'GM_0658',
    title: 'Actuator Supply Voltage A Circuit Low',
    system: 'ECM',
    severity: 'critical',
    description: 'Actuator supply voltage A circuit too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0659',
    internalId: 'GM_0659',
    title: 'Actuator Supply Voltage A Circuit High',
    system: 'ECM',
    severity: 'critical',
    description: 'Actuator supply voltage A circuit too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0671',
    internalId: 'GM_0671',
    title: 'Cylinder 1 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 1 glow plug circuit fault. Open or short detected.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0672',
    internalId: 'GM_0672',
    title: 'Cylinder 2 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 2 glow plug circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0673',
    internalId: 'GM_0673',
    title: 'Cylinder 3 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 3 glow plug circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0674',
    internalId: 'GM_0674',
    title: 'Cylinder 4 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 4 glow plug circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0675',
    internalId: 'GM_0675',
    title: 'Cylinder 5 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 5 glow plug circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0676',
    internalId: 'GM_0676',
    title: 'Cylinder 6 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 6 glow plug circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0677',
    internalId: 'GM_0677',
    title: 'Cylinder 7 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 7 glow plug circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0678',
    internalId: 'GM_0678',
    title: 'Cylinder 8 Glow Plug Circuit',
    system: 'Engine - Starting',
    severity: 'warning',
    description: 'Cylinder 8 glow plug circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit resistance out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0685',
    internalId: 'GM_0685',
    title: 'ECM/PCM Power Relay Control Circuit/Open',
    system: 'Electrical',
    severity: 'critical',
    description: 'ECM power relay control circuit open.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0686',
    internalId: 'GM_0686',
    title: 'ECM/PCM Power Relay Control Circuit Low',
    system: 'Electrical',
    severity: 'critical',
    description: 'ECM power relay control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0687',
    internalId: 'GM_0687',
    title: 'ECM/PCM Power Relay Control Circuit High',
    system: 'Electrical',
    severity: 'critical',
    description: 'ECM power relay control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0689',
    internalId: 'GM_0689',
    title: 'ECM/PCM Power Relay Sense Circuit Low',
    system: 'Electrical',
    severity: 'critical',
    description: 'ECM power relay sense circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0690',
    internalId: 'GM_0690',
    title: 'ECM/PCM Power Relay Sense Circuit High',
    system: 'Electrical',
    severity: 'critical',
    description: 'ECM power relay sense circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0691',
    internalId: 'GM_0691',
    title: 'Cooling Fan 1 Control Circuit Low',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Cooling fan 1 control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0692',
    internalId: 'GM_0692',
    title: 'Cooling Fan 1 Control Circuit High',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Cooling fan 1 control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0697',
    internalId: 'GM_0697',
    title: 'Sensor Reference Voltage C Circuit/Open',
    system: 'ECM',
    severity: 'critical',
    description: '5V reference voltage C circuit open or out of range.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Reference voltage < 4.5V or > 5.5V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0703',
    internalId: 'GM_0703',
    title: 'Brake Switch B Circuit',
    system: 'Transmission',
    severity: 'warning',
    description: 'Brake switch B circuit fault. Brake switch signal does not correlate with expected operation.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0706',
    internalId: 'GM_0706',
    title: 'Transmission Range Sensor Circuit Range/Performance',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission range sensor (PRNDL) signal does not match expected values.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Range sensor error',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0708',
    internalId: 'GM_0708',
    title: 'Transmission Range Sensor Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission range sensor circuit voltage too high.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0711',
    internalId: 'GM_0711',
    title: 'Transmission Fluid Temperature Sensor A Circuit Range/Performance',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid temperature sensor performance fault. TFT does not correlate with expected values.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'TFT deviation > 20 deg C from expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0712',
    internalId: 'GM_0712',
    title: 'Transmission Fluid Temperature Sensor A Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'TFT sensor circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V (> 150 deg C indicated)',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0713',
    internalId: 'GM_0713',
    title: 'Transmission Fluid Temperature Sensor A Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'TFT sensor circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V (< -40 deg C indicated)',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0715',
    internalId: 'GM_0715',
    title: 'Input/Turbine Speed Sensor A Circuit',
    system: 'Transmission',
    severity: 'critical',
    description: 'Transmission input speed sensor circuit fault.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'No signal or erratic signal',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0716',
    internalId: 'GM_0716',
    title: 'Input/Turbine Speed Sensor A Circuit Range/Performance',
    system: 'Transmission',
    severity: 'critical',
    description: 'Transmission input speed sensor signal is erratic.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Signal error rate > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0717',
    internalId: 'GM_0717',
    title: 'Input/Turbine Speed Sensor A Circuit No Signal',
    system: 'Transmission',
    severity: 'critical',
    description: 'No signal from transmission input speed sensor.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'No signal detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0720',
    internalId: 'GM_0720',
    title: 'Output Speed Sensor Circuit',
    system: 'Transmission',
    severity: 'critical',
    description: 'Transmission output speed sensor circuit fault.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'No signal or erratic signal',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0721',
    internalId: 'GM_0721',
    title: 'Output Speed Sensor Circuit Range/Performance',
    system: 'Transmission',
    severity: 'critical',
    description: 'Transmission output speed sensor signal is erratic.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Signal error rate > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0722',
    internalId: 'GM_0722',
    title: 'Output Speed Sensor Circuit No Signal',
    system: 'Transmission',
    severity: 'critical',
    description: 'No signal from transmission output speed sensor.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'No signal detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0729',
    internalId: 'GM_0729',
    title: 'Gear 6 Incorrect Ratio',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission gear ratio in 6th gear does not match expected ratio.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Ratio error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0731',
    internalId: 'GM_0731',
    title: 'Gear 1 Incorrect Ratio',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission gear ratio in 1st gear does not match expected ratio.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Ratio error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0732',
    internalId: 'GM_0732',
    title: 'Gear 2 Incorrect Ratio',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission gear ratio in 2nd gear does not match expected ratio.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Ratio error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0733',
    internalId: 'GM_0733',
    title: 'Gear 3 Incorrect Ratio',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission gear ratio in 3rd gear does not match expected ratio.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Ratio error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0734',
    internalId: 'GM_0734',
    title: 'Gear 4 Incorrect Ratio',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission gear ratio in 4th gear does not match expected ratio.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Ratio error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0735',
    internalId: 'GM_0735',
    title: 'Gear 5 Incorrect Ratio',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission gear ratio in 5th gear does not match expected ratio.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Ratio error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0736',
    internalId: 'GM_0736',
    title: 'Reverse Incorrect Ratio',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission gear ratio in reverse does not match expected ratio.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Ratio error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0741',
    internalId: 'GM_0741',
    title: 'Torque Converter Clutch (TCC) System Stuck Off',
    system: 'Transmission',
    severity: 'critical',
    description: 'The torque converter clutch is not engaging when commanded. TCC slip >= 80 RPM for >= 15 seconds when TCC should be locked. Indicates a worn TCC, low transmission fluid, or TCC solenoid failure. On the Allison transmission, excessive TCC slip causes heat buildup and accelerated fluid degradation.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: 'TCC slip >= 80 RPM for >= 15 seconds when TCC commanded on',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0742',
    internalId: 'GM_0742',
    title: 'Torque Converter Clutch (TCC) System Stuck On',
    system: 'Transmission',
    severity: 'critical',
    description: 'The torque converter clutch is engaging when it should not be. TCC is locked at low speed or when not commanded. Indicates a stuck TCC solenoid or valve body issue.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'TCC slip < -20 RPM when TCC commanded off',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0751',
    internalId: 'GM_0751',
    title: 'Shift Solenoid A Performance or Stuck Off',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid A is not performing correctly or is stuck in the off position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Gear ratio error when solenoid A commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0752',
    internalId: 'GM_0752',
    title: 'Shift Solenoid A Stuck On',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid A is stuck in the on position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Gear ratio error when solenoid A not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0756',
    internalId: 'GM_0756',
    title: 'Shift Solenoid B Performance or Stuck Off',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid B is not performing correctly or is stuck off.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Gear ratio error when solenoid B commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0757',
    internalId: 'GM_0757',
    title: 'Shift Solenoid B Stuck On',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid B is stuck in the on position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Gear ratio error when solenoid B not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0761',
    internalId: 'GM_0761',
    title: 'Shift Solenoid C Performance or Stuck Off',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid C is not performing correctly or is stuck off.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Gear ratio error when solenoid C commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0762',
    internalId: 'GM_0762',
    title: 'Shift Solenoid C Stuck On',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid C is stuck in the on position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Gear ratio error when solenoid C not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0776',
    internalId: 'GM_0776',
    title: 'Pressure Control Solenoid B Performance or Stuck Off',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid B performance fault or stuck off.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Pressure error when solenoid B commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0777',
    internalId: 'GM_0777',
    title: 'Pressure Control Solenoid B Stuck On',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid B stuck in on position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Pressure error when solenoid B not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0842',
    internalId: 'GM_0842',
    title: 'Transmission Fluid Pressure Sensor/Switch A Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor A circuit voltage too low.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0843',
    internalId: 'GM_0843',
    title: 'Transmission Fluid Pressure Sensor/Switch A Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor A circuit voltage too high.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0847',
    internalId: 'GM_0847',
    title: 'Transmission Fluid Pressure Sensor/Switch B Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor B circuit voltage too low.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0848',
    internalId: 'GM_0848',
    title: 'Transmission Fluid Pressure Sensor/Switch B Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor B circuit voltage too high.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0872',
    internalId: 'GM_0872',
    title: 'Transmission Fluid Pressure Sensor/Switch C Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor C circuit voltage too low.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0873',
    internalId: 'GM_0873',
    title: 'Transmission Fluid Pressure Sensor/Switch C Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor C circuit voltage too high.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0877',
    internalId: 'GM_0877',
    title: 'Transmission Fluid Pressure Sensor/Switch D Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor D circuit voltage too low.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0878',
    internalId: 'GM_0878',
    title: 'Transmission Fluid Pressure Sensor/Switch D Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission fluid pressure sensor D circuit voltage too high.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0960',
    internalId: 'GM_0960',
    title: 'Pressure Control Solenoid A Control Circuit/Open',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid A control circuit open.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0961',
    internalId: 'GM_0961',
    title: 'Pressure Control Solenoid A Control Circuit Range/Performance',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid A performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Solenoid response out of range',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0962',
    internalId: 'GM_0962',
    title: 'Pressure Control Solenoid A Control Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid A circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0963',
    internalId: 'GM_0963',
    title: 'Pressure Control Solenoid A Control Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid A circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0964',
    internalId: 'GM_0964',
    title: 'Pressure Control Solenoid B Control Circuit/Open',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid B control circuit open.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0965',
    internalId: 'GM_0965',
    title: 'Pressure Control Solenoid B Control Circuit Range/Performance',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid B performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Solenoid response out of range',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P0966',
    internalId: 'GM_0966',
    title: 'Pressure Control Solenoid B Control Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid B circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0967',
    internalId: 'GM_0967',
    title: 'Pressure Control Solenoid B Control Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid B circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0973',
    internalId: 'GM_0973',
    title: 'Shift Solenoid A Control Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid A control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0974',
    internalId: 'GM_0974',
    title: 'Shift Solenoid A Control Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid A control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0976',
    internalId: 'GM_0976',
    title: 'Shift Solenoid B Control Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid B control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0977',
    internalId: 'GM_0977',
    title: 'Shift Solenoid B Control Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid B control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0979',
    internalId: 'GM_0979',
    title: 'Shift Solenoid C Control Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid C control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P0980',
    internalId: 'GM_0980',
    title: 'Shift Solenoid C Control Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid C control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1002',
    internalId: 'GM_1002',
    title: 'Fuel Delivery System Performance',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel delivery system performance fault. Fuel pressure does not respond correctly to commanded changes.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Fuel pressure response error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1007',
    internalId: 'GM_1007',
    title: 'Fuel Rail Pressure Too Low During Engine Start',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel rail pressure is too low during engine cranking/start. Indicates a failing lift pump, clogged fuel filter, or high-pressure pump issue.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Rail pressure < minimum start threshold during cranking',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1048',
    internalId: 'GM_1048',
    title: 'Turbocharger Boost Pressure Sensor A Circuit Low',
    system: 'Air System',
    severity: 'warning',
    description: 'Boost pressure sensor A circuit voltage too low.',
    causes: [
    'VGT vane sticking or carbon buildup',
    'Boost control solenoid fault',
    'Turbo actuator malfunction',
    'Boost leak in charge air system'
  ],
    remedies: [
    'Clean VGT vanes',
    'Test boost control solenoid',
    'Pressure test charge air system',
    'Inspect turbo actuator'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1049',
    internalId: 'GM_1049',
    title: 'Turbocharger Boost Pressure Sensor A Circuit High',
    system: 'Air System',
    severity: 'warning',
    description: 'Boost pressure sensor A circuit voltage too high.',
    causes: [
    'VGT vane sticking or carbon buildup',
    'Boost control solenoid fault',
    'Turbo actuator malfunction',
    'Boost leak in charge air system'
  ],
    remedies: [
    'Clean VGT vanes',
    'Test boost control solenoid',
    'Pressure test charge air system',
    'Inspect turbo actuator'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1089',
    internalId: 'GM_1089',
    title: 'Fuel Rail Pressure High During Deceleration',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel rail pressure is higher than expected during deceleration fuel cut. Indicates a stuck-open high-pressure pump or faulty pressure relief valve.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Rail pressure > maximum decel threshold',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1103',
    internalId: 'GM_1103',
    title: 'Mass Air Flow Sensor Performance - High',
    system: 'Engine - Air',
    severity: 'warning',
    description: 'MAF sensor reading is higher than expected based on speed density model. Indicates a contaminated MAF sensor or air leak downstream of the MAF.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'MAF > speed density model + calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1160',
    internalId: 'GM_1160',
    title: 'NOx Sensor Upstream Circuit',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor upstream of SCR catalyst circuit fault.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1192',
    internalId: 'GM_1192',
    title: 'Fuel Rail Pressure Sensor Circuit Low (Alternate)',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel rail pressure sensor circuit voltage too low (alternate circuit).',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 4.0% of supply voltage',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1193',
    internalId: 'GM_1193',
    title: 'Fuel Rail Pressure Sensor Circuit High (Alternate)',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel rail pressure sensor circuit voltage too high (alternate circuit).',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 96.0% of supply voltage',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1194',
    internalId: 'GM_1194',
    title: 'Fuel Rail Pressure Sensor Performance (Alternate)',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Alternate fuel rail pressure sensor performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Sensor drift > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1196',
    internalId: 'GM_1196',
    title: 'Fuel Rail Pressure Sensor Correlation',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel rail pressure sensors A and B do not correlate. Indicates a failing sensor or wiring issue.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Sensor A vs B delta > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1197',
    internalId: 'GM_1197',
    title: 'Fuel Rail Pressure Too Low (Extended)',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Extended fuel rail pressure too low condition. Rail pressure is below desired for an extended period beyond P0087 threshold.',
    causes: [
    'Restriction in supply circuit',
    'Failing pump or actuator',
    'Leak in system',
    'Clogged filter'
  ],
    remedies: [
    'Check for restrictions in supply circuit',
    'Test pump output',
    'Inspect for leaks',
    'Replace filter if clogged'
  ],
    thresholds: 'Rail pressure < desired for extended duration',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1198',
    internalId: 'GM_1198',
    title: 'Fuel Rail Pressure Too High (Extended)',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Extended fuel rail pressure too high condition.',
    causes: [
    'Stuck regulator or relief valve',
    'Blocked return circuit',
    'Faulty pressure control solenoid',
    'Sensor fault'
  ],
    remedies: [
    'Test pressure regulator operation',
    'Inspect relief valve',
    'Check pressure control solenoid',
    'Verify sensor accuracy'
  ],
    thresholds: 'Rail pressure > desired for extended duration',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1199',
    internalId: 'GM_1199',
    title: 'Fuel Rail Pressure Sensor Stuck',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel rail pressure sensor output is stuck (not changing with engine operation).',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Sensor output change < minimum expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1248',
    internalId: 'GM_1248',
    title: 'Injection Pump Fuel Metering Control A High',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel metering control A is at maximum high position. Indicates maximum fuel delivery demand.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Metering control at maximum',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1249',
    internalId: 'GM_1249',
    title: 'Injection Pump Fuel Metering Control A Low',
    system: 'Fuel System',
    severity: 'warning',
    description: 'Fuel metering control A is at minimum position. Indicates minimum fuel delivery.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Metering control at minimum',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1402',
    internalId: 'GM_1402',
    title: 'EGR System Performance - Stuck Open',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR valve is stuck in the open position. Causes rough idle, excessive smoke, and reduced power.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'EGR position > commanded when commanded closed',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1407',
    internalId: 'GM_1407',
    title: 'EGR Temperature Sensor Circuit',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR temperature sensor circuit fault.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1413',
    internalId: 'GM_1413',
    title: 'Secondary Air Injection System Monitor Circuit Low',
    system: 'Emissions',
    severity: 'warning',
    description: 'Secondary air injection monitor circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1414',
    internalId: 'GM_1414',
    title: 'Secondary Air Injection System Monitor Circuit High',
    system: 'Emissions',
    severity: 'warning',
    description: 'Secondary air injection monitor circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1425',
    internalId: 'GM_1425',
    title: 'EVAP System Leak Detection Pump Circuit',
    system: 'Emissions',
    severity: 'warning',
    description: 'EVAP leak detection pump circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1428',
    internalId: 'GM_1428',
    title: 'EVAP System Leak Detection Pump Sense Circuit',
    system: 'Emissions',
    severity: 'warning',
    description: 'EVAP leak detection pump sense circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1438',
    internalId: 'GM_1438',
    title: 'EVAP System Flow During Non-Purge',
    system: 'Emissions',
    severity: 'warning',
    description: 'EVAP system flow detected when purge should not be active.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Flow detected when not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1473',
    internalId: 'GM_1473',
    title: 'Fan Secondary High with Fan Off',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Secondary cooling fan is on when it should be off.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Fan speed > 0 when commanded off',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1475',
    internalId: 'GM_1475',
    title: 'Auxiliary 5-Volt Reference Circuit',
    system: 'ECM',
    severity: 'critical',
    description: 'Auxiliary 5V reference circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Reference voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1476',
    internalId: 'GM_1476',
    title: 'Too Little Secondary Air',
    system: 'Emissions',
    severity: 'warning',
    description: 'Secondary air injection flow is less than expected.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Flow < minimum expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1477',
    internalId: 'GM_1477',
    title: 'Too Much Secondary Air',
    system: 'Emissions',
    severity: 'warning',
    description: 'Secondary air injection flow is more than expected.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Flow > maximum expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P1478',
    internalId: 'GM_1478',
    title: 'Cooling Fan Clutch Solenoid Circuit',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Cooling fan clutch solenoid circuit fault.',
    causes: [
    'Worn clutch packs or solenoids',
    'Low transmission fluid',
    'Faulty transmission control solenoid',
    'Torque converter wear'
  ],
    remedies: [
    'Check transmission fluid level and condition',
    'Test solenoid operation',
    'Inspect clutch packs',
    'Perform transmission service'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1497',
    internalId: 'GM_1497',
    title: 'Turbocharger Vane Control Solenoid Circuit Low',
    system: 'Air System',
    severity: 'critical',
    description: 'VGT vane control solenoid circuit voltage too low. Indicates a short to ground or open circuit in the VGT solenoid wiring.',
    causes: [
    'VGT vane sticking or carbon buildup',
    'Boost control solenoid fault',
    'Turbo actuator malfunction',
    'Boost leak in charge air system'
  ],
    remedies: [
    'Clean VGT vanes',
    'Test boost control solenoid',
    'Pressure test charge air system',
    'Inspect turbo actuator'
  ],
    thresholds: '< minimum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1498',
    internalId: 'GM_1498',
    title: 'Turbocharger Vane Control Solenoid Circuit High',
    system: 'Air System',
    severity: 'critical',
    description: 'VGT vane control solenoid circuit voltage too high. Indicates a short to voltage in the VGT solenoid wiring.',
    causes: [
    'VGT vane sticking or carbon buildup',
    'Boost control solenoid fault',
    'Turbo actuator malfunction',
    'Boost leak in charge air system'
  ],
    remedies: [
    'Clean VGT vanes',
    'Test boost control solenoid',
    'Pressure test charge air system',
    'Inspect turbo actuator'
  ],
    thresholds: '> maximum voltage threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P1682',
    internalId: 'GM_1682',
    title: 'Ignition 1 Switch Circuit 2',
    system: 'Electrical',
    severity: 'warning',
    description: 'Ignition 1 switch circuit 2 fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2002',
    internalId: 'GM_2002',
    title: 'Diesel Particulate Filter Efficiency Below Threshold (Bank 1)',
    system: 'Emissions - DPF',
    severity: 'critical',
    description: 'DPF filtration efficiency is below minimum threshold. Indicates a cracked, missing, or melted DPF substrate. On the Duramax, this is often triggered after a failed regeneration or DPF removal.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: 'DPF efficiency < minimum threshold',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2032',
    internalId: 'GM_2032',
    title: 'Exhaust Gas Temperature Sensor Circuit Low (Bank 1 Sensor 2)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor 2 (post-DPF) circuit voltage too low.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2033',
    internalId: 'GM_2033',
    title: 'Exhaust Gas Temperature Sensor Circuit High (Bank 1 Sensor 2)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor 2 (post-DPF) circuit voltage too high.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2047',
    internalId: 'GM_2047',
    title: 'Reductant Injector Circuit/Open (Bank 1 Unit 1)',
    system: 'Emissions - DEF',
    severity: 'critical',
    description: 'DEF injector circuit open. No DEF injection possible.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2048',
    internalId: 'GM_2048',
    title: 'Reductant Injector Circuit Low (Bank 1 Unit 1)',
    system: 'Emissions - DEF',
    severity: 'critical',
    description: 'DEF injector circuit voltage too low.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2049',
    internalId: 'GM_2049',
    title: 'Reductant Injector Circuit High (Bank 1 Unit 1)',
    system: 'Emissions - DEF',
    severity: 'critical',
    description: 'DEF injector circuit voltage too high.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2080',
    internalId: 'GM_2080',
    title: 'Exhaust Gas Temperature Sensor Circuit Range/Performance (Bank 1 Sensor 1)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor 1 performance fault. Temperature does not correlate with expected values.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'EGT deviation > calibration limit from expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2081',
    internalId: 'GM_2081',
    title: 'Exhaust Gas Temperature Sensor Circuit Intermittent (Bank 1 Sensor 1)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'Intermittent EGT sensor 1 fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2084',
    internalId: 'GM_2084',
    title: 'Exhaust Gas Temperature Sensor Circuit Range/Performance (Bank 1 Sensor 2)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor 2 performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'EGT deviation > calibration limit from expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2085',
    internalId: 'GM_2085',
    title: 'Exhaust Gas Temperature Sensor Circuit Intermittent (Bank 1 Sensor 2)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'Intermittent EGT sensor 2 fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2122',
    internalId: 'GM_2122',
    title: 'Throttle/Pedal Position Sensor/Switch D Circuit Low',
    system: 'Engine - Throttle',
    severity: 'critical',
    description: 'Accelerator pedal position sensor D circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.2V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2123',
    internalId: 'GM_2123',
    title: 'Throttle/Pedal Position Sensor/Switch D Circuit High',
    system: 'Engine - Throttle',
    severity: 'critical',
    description: 'Accelerator pedal position sensor D circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.8V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2127',
    internalId: 'GM_2127',
    title: 'Throttle/Pedal Position Sensor/Switch E Circuit Low',
    system: 'Engine - Throttle',
    severity: 'critical',
    description: 'Accelerator pedal position sensor E circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.2V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2128',
    internalId: 'GM_2128',
    title: 'Throttle/Pedal Position Sensor/Switch E Circuit High',
    system: 'Engine - Throttle',
    severity: 'critical',
    description: 'Accelerator pedal position sensor E circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.8V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2138',
    internalId: 'GM_2138',
    title: 'Throttle/Pedal Position Sensor/Switch D/E Voltage Correlation',
    system: 'Engine - Throttle',
    severity: 'critical',
    description: 'Accelerator pedal position sensors D and E do not correlate. Indicates a failing pedal position sensor.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Sensor D vs E delta > 0.5V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2147',
    internalId: 'GM_2147',
    title: 'Fuel Injector Group A Supply Voltage Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank A supply voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2148',
    internalId: 'GM_2148',
    title: 'Fuel Injector Group A Supply Voltage Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank A supply voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2150',
    internalId: 'GM_2150',
    title: 'Fuel Injector Group B Supply Voltage Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank B supply voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2151',
    internalId: 'GM_2151',
    title: 'Fuel Injector Group B Supply Voltage Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank B supply voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2153',
    internalId: 'GM_2153',
    title: 'Fuel Injector Group C Supply Voltage Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank C supply voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2154',
    internalId: 'GM_2154',
    title: 'Fuel Injector Group C Supply Voltage Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank C supply voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2156',
    internalId: 'GM_2156',
    title: 'Fuel Injector Group D Supply Voltage Circuit Low',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank D supply voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2157',
    internalId: 'GM_2157',
    title: 'Fuel Injector Group D Supply Voltage Circuit High',
    system: 'Fuel - Injectors',
    severity: 'critical',
    description: 'Injector bank D supply voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2201',
    internalId: 'GM_2201',
    title: 'NOx Sensor Circuit Range/Performance (Bank 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor Bank 1 performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'NOx sensor deviation > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2202',
    internalId: 'GM_2202',
    title: 'NOx Sensor Circuit Low (Bank 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor Bank 1 circuit voltage too low.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2203',
    internalId: 'GM_2203',
    title: 'NOx Sensor Circuit High (Bank 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor Bank 1 circuit voltage too high.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2205',
    internalId: 'GM_2205',
    title: 'NOx Sensor Heater Control Circuit/Open (Bank 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor heater Bank 1 circuit open.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2206',
    internalId: 'GM_2206',
    title: 'NOx Sensor Heater Control Circuit Low (Bank 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor heater Bank 1 circuit voltage too low.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2207',
    internalId: 'GM_2207',
    title: 'NOx Sensor Heater Control Circuit High (Bank 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor heater Bank 1 circuit voltage too high.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2208',
    internalId: 'GM_2208',
    title: 'NOx Sensor Circuit Range/Performance (Bank 2)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor Bank 2 performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'NOx sensor deviation > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2209',
    internalId: 'GM_2209',
    title: 'NOx Sensor Circuit Low (Bank 2)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor Bank 2 circuit voltage too low.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2210',
    internalId: 'GM_2210',
    title: 'NOx Sensor Circuit High (Bank 2)',
    system: 'Emissions',
    severity: 'warning',
    description: 'NOx sensor Bank 2 circuit voltage too high.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2211',
    internalId: 'GM_2211',
    title: 'NOx Sensor Circuit Intermittent (Bank 2)',
    system: 'Emissions',
    severity: 'warning',
    description: 'Intermittent NOx sensor Bank 2 fault.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2227',
    internalId: 'GM_2227',
    title: 'Barometric Pressure Sensor A Circuit Range/Performance',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'Barometric pressure sensor performance fault. Baro does not correlate with expected values.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Baro deviation > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2228',
    internalId: 'GM_2228',
    title: 'Barometric Pressure Sensor A Circuit Low',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'Barometric pressure sensor circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2229',
    internalId: 'GM_2229',
    title: 'Barometric Pressure Sensor A Circuit High',
    system: 'Engine - Sensors',
    severity: 'warning',
    description: 'Barometric pressure sensor circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2230',
    internalId: 'GM_2230',
    title: 'Barometric Pressure Sensor A Circuit Intermittent',
    system: 'Engine - Sensors',
    severity: 'info',
    description: 'Intermittent barometric pressure sensor fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2293',
    internalId: 'GM_2293',
    title: 'Fuel Pressure Regulator 2 Performance',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel pressure regulator 2 performance fault. Regulator is not controlling pressure within expected range.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Pressure error > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2294',
    internalId: 'GM_2294',
    title: 'Fuel Pressure Regulator 2 Control Circuit/Open',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel pressure regulator 2 control circuit open.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2295',
    internalId: 'GM_2295',
    title: 'Fuel Pressure Regulator 2 Control Circuit Low',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel pressure regulator 2 control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2296',
    internalId: 'GM_2296',
    title: 'Fuel Pressure Regulator 2 Control Circuit High',
    system: 'Fuel System',
    severity: 'critical',
    description: 'Fuel pressure regulator 2 control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2297',
    internalId: 'GM_2297',
    title: 'O2 Sensor Out of Range During Deceleration (Bank 1 Sensor 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'O2 sensor reading is out of expected range during deceleration fuel cut.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'O2 sensor out of range during decel',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2452',
    internalId: 'GM_2452',
    title: 'Diesel Particulate Filter Pressure Sensor A Circuit',
    system: 'Emissions - DPF',
    severity: 'warning',
    description: 'DPF differential pressure sensor A circuit fault.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2453',
    internalId: 'GM_2453',
    title: 'Diesel Particulate Filter Pressure Sensor A Circuit Range/Performance',
    system: 'Emissions - DPF',
    severity: 'warning',
    description: 'DPF differential pressure sensor A performance fault. Pressure does not correlate with expected soot load.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Pressure deviation > calibration limit',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2454',
    internalId: 'GM_2454',
    title: 'Diesel Particulate Filter Pressure Sensor A Circuit Low',
    system: 'Emissions - DPF',
    severity: 'warning',
    description: 'DPF pressure sensor A circuit voltage too low.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2455',
    internalId: 'GM_2455',
    title: 'Diesel Particulate Filter Pressure Sensor A Circuit High',
    system: 'Emissions - DPF',
    severity: 'warning',
    description: 'DPF pressure sensor A circuit voltage too high.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2456',
    internalId: 'GM_2456',
    title: 'Diesel Particulate Filter Pressure Sensor A Circuit Intermittent',
    system: 'Emissions - DPF',
    severity: 'info',
    description: 'Intermittent DPF pressure sensor A fault.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: 'Intermittent signal',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2457',
    internalId: 'GM_2457',
    title: 'Exhaust Gas Recirculation Cooling System Performance',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR cooler performance fault. EGR coolant temperature does not drop as expected through the cooler.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'EGR cooler delta T < minimum expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2459',
    internalId: 'GM_2459',
    title: 'Diesel Particulate Filter Regeneration Frequency',
    system: 'Emissions - DPF',
    severity: 'warning',
    description: 'DPF regeneration is occurring too frequently. Indicates excessive soot loading, oil consumption, or short trip driving.',
    causes: [
    'DPF loaded beyond capacity',
    'Failed regeneration',
    'Faulty differential pressure sensor',
    'Excessive short-trip driving'
  ],
    remedies: [
    'Perform forced DPF regeneration',
    'Inspect differential pressure sensor',
    'Check regen system',
    'Replace DPF if necessary'
  ],
    thresholds: 'Regen interval < minimum expected',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2470',
    internalId: 'GM_2470',
    title: 'Exhaust Gas Temperature Sensor Circuit (Bank 1 Sensor 3)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor 3 circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2471',
    internalId: 'GM_2471',
    title: 'Exhaust Gas Temperature Sensor Circuit Low (Bank 1 Sensor 3)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor 3 circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2472',
    internalId: 'GM_2472',
    title: 'Exhaust Gas Temperature Sensor Circuit High (Bank 1 Sensor 3)',
    system: 'Exhaust',
    severity: 'warning',
    description: 'EGT sensor 3 circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2481',
    internalId: 'GM_2481',
    title: 'Coolant Temperature Sensor Circuit (Alternate)',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Alternate coolant temperature sensor circuit fault.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Circuit voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2482',
    internalId: 'GM_2482',
    title: 'Coolant Temperature Sensor Circuit Low (Alternate)',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Alternate coolant temperature sensor circuit voltage too low.',
    causes: [
    'Thermostat stuck open',
    'Faulty temperature sensor',
    'Coolant leak',
    'Cold ambient conditions'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< 0.1V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2484',
    internalId: 'GM_2484',
    title: 'Coolant Temperature Sensor Circuit High (Alternate)',
    system: 'Engine - Cooling',
    severity: 'warning',
    description: 'Alternate coolant temperature sensor circuit voltage too high.',
    causes: [
    'Cooling system restriction',
    'Low coolant level',
    'Thermostat stuck closed',
    'Excessive engine load'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> 4.9V',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2494',
    internalId: 'GM_2494',
    title: 'Exhaust Gas Recirculation Flow Insufficient - Cold',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR flow is insufficient during cold engine operation.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: 'EGR flow < minimum during cold operation',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2495',
    internalId: 'GM_2495',
    title: 'Exhaust Gas Recirculation Flow Excessive - Cold',
    system: 'EGR',
    severity: 'warning',
    description: 'EGR flow is excessive during cold engine operation.',
    causes: [
    'EGR valve stuck or carbon fouled',
    'EGR cooler clogged',
    'EGR position sensor fault',
    'Wiring fault to EGR system'
  ],
    remedies: [
    'Clean EGR valve and passages',
    'Test EGR valve operation',
    'Inspect EGR cooler',
    'Replace EGR valve if faulty'
  ],
    thresholds: 'EGR flow > maximum during cold operation',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2534',
    internalId: 'GM_2534',
    title: 'Ignition Switch Run/Start Position Circuit Low',
    system: 'Electrical',
    severity: 'warning',
    description: 'Ignition switch run/start position circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2627',
    internalId: 'GM_2627',
    title: 'O2 Sensor Pumping Current Trim Circuit/Open (Bank 1 Sensor 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'O2 sensor pumping current trim circuit open.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2628',
    internalId: 'GM_2628',
    title: 'O2 Sensor Pumping Current Trim Circuit Low (Bank 1 Sensor 1)',
    system: 'Emissions',
    severity: 'warning',
    description: 'O2 sensor pumping current trim circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2669',
    internalId: 'GM_2669',
    title: 'Actuator Supply Voltage B Circuit/Open',
    system: 'ECM',
    severity: 'critical',
    description: 'Actuator supply voltage B circuit open or out of range.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Voltage out of range',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2670',
    internalId: 'GM_2670',
    title: 'Actuator Supply Voltage B Circuit Low',
    system: 'ECM',
    severity: 'critical',
    description: 'Actuator supply voltage B circuit too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2671',
    internalId: 'GM_2671',
    title: 'Actuator Supply Voltage B Circuit High',
    system: 'ECM',
    severity: 'critical',
    description: 'Actuator supply voltage B circuit too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2690',
    internalId: 'GM_2690',
    title: 'Shift Solenoid D Control Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid D control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2691',
    internalId: 'GM_2691',
    title: 'Shift Solenoid D Control Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid D control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2692',
    internalId: 'GM_2692',
    title: 'Shift Solenoid E Control Circuit Low',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid E control circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2693',
    internalId: 'GM_2693',
    title: 'Shift Solenoid E Control Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Shift solenoid E control circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2723',
    internalId: 'GM_2723',
    title: 'Pressure Control Solenoid E Performance or Stuck Off',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid E performance fault or stuck off.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Pressure error when solenoid E commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2724',
    internalId: 'GM_2724',
    title: 'Pressure Control Solenoid E Stuck On',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid E stuck in on position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Pressure error when solenoid E not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2727',
    internalId: 'GM_2727',
    title: 'Pressure Control Solenoid F Performance or Stuck Off',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid F performance fault or stuck off.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Pressure error when solenoid F commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2728',
    internalId: 'GM_2728',
    title: 'Pressure Control Solenoid F Stuck On',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid F stuck in on position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Pressure error when solenoid F not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2729',
    internalId: 'GM_2729',
    title: 'Pressure Control Solenoid G Performance or Stuck Off',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid G performance fault or stuck off.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Pressure error when solenoid G commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2730',
    internalId: 'GM_2730',
    title: 'Pressure Control Solenoid G Stuck On',
    system: 'Transmission',
    severity: 'warning',
    description: 'Pressure control solenoid G stuck in on position.',
    causes: [
    'Mechanical binding or carbon buildup',
    'Faulty actuator',
    'Control circuit fault',
    'Contamination'
  ],
    remedies: [
    'Clean actuator and passages',
    'Test actuator operation',
    'Replace actuator if mechanically failed',
    'Check control circuit'
  ],
    thresholds: 'Pressure error when solenoid G not commanded',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2761',
    internalId: 'GM_2761',
    title: 'Torque Converter Clutch Pressure Control Solenoid Control Circuit/Open',
    system: 'Transmission',
    severity: 'critical',
    description: 'TCC pressure control solenoid circuit open. No TCC engagement possible.',
    causes: [
    'Open circuit in wiring harness',
    'Damaged connector',
    'Faulty sensor',
    'Corroded terminals'
  ],
    remedies: [
    'Inspect wiring harness for opens',
    'Test connector continuity',
    'Repair or replace damaged wiring',
    'Replace sensor if faulty'
  ],
    thresholds: 'Circuit open detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2762',
    internalId: 'GM_2762',
    title: 'Torque Converter Clutch Pressure Control Solenoid Control Circuit Range/Performance',
    system: 'Transmission',
    severity: 'critical',
    description: 'TCC pressure control solenoid performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Solenoid response out of range',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2763',
    internalId: 'GM_2763',
    title: 'Torque Converter Clutch Pressure Control Solenoid Control Circuit High',
    system: 'Transmission',
    severity: 'critical',
    description: 'TCC pressure control solenoid circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2764',
    internalId: 'GM_2764',
    title: 'Torque Converter Clutch Pressure Control Solenoid Control Circuit Low',
    system: 'Transmission',
    severity: 'critical',
    description: 'TCC pressure control solenoid circuit voltage too low.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '< minimum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'P2771',
    internalId: 'GM_2771',
    title: 'Four Wheel Drive (4WD) Low Switch Circuit High',
    system: 'Drivetrain',
    severity: 'info',
    description: '4WD low switch circuit voltage too high.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2957',
    internalId: 'GM_2957',
    title: 'Transmission Range Sensor B Circuit Range/Performance',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission range sensor B performance fault.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: 'Range sensor error',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'P2958',
    internalId: 'GM_2958',
    title: 'Transmission Range Sensor B Circuit High',
    system: 'Transmission',
    severity: 'warning',
    description: 'Transmission range sensor B circuit voltage too high.',
    causes: [
    'Sensor out of calibration',
    'Contaminated or damaged sensor',
    'Wiring intermittent fault',
    'Mechanical issue affecting sensor reading'
  ],
    remedies: [
    'Clean or replace sensor',
    'Verify sensor installation',
    'Check for mechanical issues affecting reading',
    'Replace sensor if out of calibration'
  ],
    thresholds: '> maximum threshold',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'U0074',
    internalId: 'UN_0074',
    title: 'Control Module Communication Bus A Off',
    system: 'Network',
    severity: 'critical',
    description: 'CAN bus A communication fault. Multiple modules may be affected.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'Bus off condition detected',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'U0100',
    internalId: 'UN_0100',
    title: 'Lost Communication With ECM/PCM A',
    system: 'Network',
    severity: 'critical',
    description: 'Lost CAN communication with the ECM/PCM. Indicates a wiring fault, module failure, or power supply issue.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'No communication for > calibration time',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'U0601',
    internalId: 'UN_0601',
    title: 'Lost Communication With Fuel Injector Control Module',
    system: 'Network',
    severity: 'critical',
    description: 'Lost communication with the fuel injector control module.',
    causes: [
    'Worn or clogged injector',
    'Injector return flow out of spec',
    'Injector driver circuit fault',
    'Contaminated fuel'
  ],
    remedies: [
    'Test injector return flow',
    'Clean or replace injectors',
    'Check injector driver circuit',
    'Use quality fuel'
  ],
    thresholds: 'No communication for > calibration time',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'U0620',
    internalId: 'UN_0620',
    title: 'Lost Communication With Fuel Pump Control Module',
    system: 'Network',
    severity: 'critical',
    description: 'Lost communication with the fuel pump control module.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'No communication for > calibration time',
    enableCriteria: 'MIL: Type A, 1 Trip',
  },
  {
    code: 'U0654',
    internalId: 'UN_0654',
    title: 'Lost Communication With Barometric Pressure Sensor Module',
    system: 'Network',
    severity: 'warning',
    description: 'Lost communication with the barometric pressure sensor module.',
    causes: [
    'Sensor or actuator fault',
    'Wiring harness damage',
    'Connector corrosion',
    'Mechanical system issue'
  ],
    remedies: [
    'Diagnose with scan tool live data',
    'Inspect sensor/actuator and wiring',
    'Replace faulty component',
    'Clear code and verify repair'
  ],
    thresholds: 'No communication for > calibration time',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
  {
    code: 'U0696',
    internalId: 'UN_0696',
    title: 'Lost Communication With Diesel Exhaust Fluid Control Module',
    system: 'Network',
    severity: 'warning',
    description: 'Lost communication with the DEF control module.',
    causes: [
    'Low or contaminated DEF',
    'Faulty NOx sensor',
    'SCR catalyst degradation',
    'DEF dosing system fault'
  ],
    remedies: [
    'Check DEF level and quality',
    'Test NOx sensors',
    'Inspect DEF dosing system',
    'Evaluate SCR catalyst condition'
  ],
    thresholds: 'No communication for > calibration time',
    enableCriteria: 'MIL: Type B, 2 Trips',
  },
];

// ─── ENGINE SPECIFICATIONS (L5P DURAMAX) ─────────────────────────────────────

export const L5P_SPECS = {
  engine: {
    name: 'Duramax L5P 6.6L Turbodiesel V8',
    displacement: '6.6L (402 cu in)',
    configuration: 'V8, 90° bank angle',
    bore: '103 mm (4.06 in)',
    stroke: '99 mm (3.90 in)',
    compressionRatio: '15.0:1',
    injectionSystem: 'Denso HP4 High-Pressure Common Rail (4-piston design)',
    maxRailPressure: '29,000 psi (200 MPa) Gen 1 / 32,000 psi (220 MPa) Gen 2',
    turbocharger: 'Garrett Variable Geometry Turbocharger (VGT)',
    intercooler: 'Air-to-Air Charge Air Cooler (CAC)',
    aftertreatment: 'DPF + SCR (DEF) + DOC',
    ecuPart: 'E41 (2017-2023 Gen 1) / E42 Global B (2024+ Gen 2)',
  },
  performance: {
    // Gen 1 (2017-2023) values; Gen 2 (2024+): 470 hp, 975 lb-ft
    stockHp: 445,
    stockHpGen2: 470,
    stockTorque: 910,
    stockTorqueGen2: 975,
    stockTorqueUnit: 'lb·ft',
    peakTorqueRpm: 1600,
    peakHpRpm: 3000,
    peakHpRpmGen2: 2800,
    redline: 3500,
    idleRpm: 700,
    maxBoostStock: 42, // psi
  },
  operatingLimits: {
    maxEgt1_F: 1475,
    maxEgt1_stuck_F: 1800,
    maxRailPressure_psi: 29000,
    maxRailPressure_psi_gen2: 32000,
    maxBoost_psi: 55,
    mafIdleMin_lbMin: 2.0,
    mafIdleMax_lbMin: 6.0,
    mafIdleNormal_gs: 17, // g/s (clean filter, no leaks)
    mafMaxLoad_lbMin: 65.0,
    tccSlipWarning_rpm: 50,
    tccSlipCritical_rpm: 200,
    dpfRegenTrigger_pct: 100,
    dpfContinueDriving_pct: 115,
    dpfServiceRegen_pct: 140,
  },
  subsystems: {
    FRPR: 'Fuel Rail Pressure Regulation — Closed-loop control of high-pressure fuel rail via PCV solenoid. The Denso HP4 (4-piston) pump generates up to 29,000 psi (Gen 1) or 32,000 psi (Gen 2, 2024+). The PCV (Pressure Control Valve) modulates flow back to the low-pressure side. Gen 2 has thicker fuel rails (26.3mm vs 24.5mm) for the higher pressure safety margin.',
    BSTR: 'Boost Pressure Regulation — Variable Geometry Turbocharger (VGT) with electronically controlled vane position. The ECM uses a PID controller comparing MAP sensor reading to the boost pressure target table. VGT position 0% = open (low boost), 100% = closed (max boost).',
    EGTR: 'Exhaust Gas Temperature Monitoring — Up to 5 EGT sensors in the exhaust path (pre-turbo, post-turbo, DPF upstream/downstream, SCR). The ECM uses these for aftertreatment control and engine protection. Cold start: all sensors should read near-ambient.',
    MAFR: 'Mass Airflow Regulation — Hot-film MAF sensor. Normal idle MAF with clean filter: 17–18 g/s. The ECM compares two MAF signals for rationality diagnostics. Short-trip idling with EGR builds soot on the sensor quickly.',
    SPDR: 'Speed/Idle Control — Manages engine idle speed, TCC slip monitoring, and turbine speed calculation. TCC slip = engine RPM minus turbine RPM. Near-zero under lock-up = healthy converter.',
    AICR: 'Air Intake Control — Manages VGT vane position, EGR valve, and throttle position for optimal air charge. The VGT position request (0–100%) is the primary boost actuator command.',
    DPFR: 'DPF Regeneration Control — Monitors soot accumulation via differential pressure sensor and engine data model. Regen triggers at ~100% soot. Requires: Drive, BARO >51 kPa, RPM 500–4,000, EGT1 100–725°C, ECT 50–140°C, VSS 0–160 km/h.',
    SCRR: 'SCR/DEF System — Selective Catalytic Reduction using DEF (Diesel Exhaust Fluid). Monitors NOx inlet/outlet sensors for >85–90% NOx reduction efficiency. DEF quality sensor runs after 8h key-off. NOx sensor #2 failures are common at 80–100k miles.',
  },
};

// ─── PARAMETER TOOLTIP DESCRIPTIONS ──────────────────────────────────────────

export const PARAM_TOOLTIPS: Record<string, string> = {
  rpm: 'Engine crankshaft speed (RPM). L5P peak HP at 3,000 RPM, peak torque at 1,600 RPM.',
  maf: 'Mass Air Flow in lb/min. Idle normal: ~17–18 g/s (clean filter). WOT: up to 65+ lb/min on stock L5P.',
  boost: 'Intake manifold boost pressure (psi above atmospheric). Stock L5P max: ~42 psi.',
  egt: 'Exhaust Gas Temperature (°F). Sustained >1,475°F requires tuner review. Stuck >1,800°F = sensor disconnected.',
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
  kpaToPsi: (kpa: number) => kpa * 0.14503773773,
  psiToKpa: (psi: number) => psi / 0.14503773773,
  nmToLbFt: (nm: number) => nm * 0.7375621,
  lbFtToNm: (lbft: number) => lbft / 0.7375621,
};

// ─── HEALTH SCORING WEIGHTS ───────────────────────────────────────────────────

export const HEALTH_WEIGHTS = {
  fuelRail: 0.25,
  boost: 0.20,
  exhaust: 0.20,
  airflow: 0.15,
  transmission: 0.10,
  thermal: 0.10,
};
