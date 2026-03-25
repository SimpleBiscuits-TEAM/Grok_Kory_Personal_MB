/**
 * Duramax ECU Reference Data
 * Source: ECM_E41 Series_11 calibration database (2017–2023 L5P 6.6L Diesel)
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
    description: 'Sensed absolute fuel rail pressure from the high-pressure fuel rail sensor (FRP sensor). Used by the ECM for closed-loop fuel pressure control via the PCV solenoid. Denso CP4.2 pump system; sensitive to fuel quality.',
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
    description: 'ECM-commanded fuel rail pressure target. Calculated based on engine load, RPM, and fuel quantity demand tables. The PCV solenoid duty cycle is modulated to achieve this target.',
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
      'Contaminated or bad fuel quality (Denso CP4.2 system is more sensitive than older Bosch)',
      'Clogged fuel filter (replace every 15–20k miles)',
      'Weak or failing lift pump',
      'Failing Denso high-pressure CP4.2 pump',
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
      'Worn high-pressure pump (CP4.2)',
      'Stuck fuel pressure regulator',
      'Severe fuel contamination',
    ],
    remedies: [
      'Evaluate high-pressure pump output',
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
    injectionSystem: 'Denso CP4.2 High-Pressure Common Rail',
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
    maxEgt1_F: 1475,
    maxEgt1_stuck_F: 1800,
    maxRailPressure_psi: 29000,
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
    FRPR: 'Fuel Rail Pressure Regulation — Closed-loop control of high-pressure fuel rail via PCV solenoid. The Denso CP4.2 pump generates up to 29,000 psi. The PCV (Pressure Control Valve) modulates flow back to the low-pressure side. The L5P Denso system is more sensitive to fuel quality than older Bosch systems.',
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
