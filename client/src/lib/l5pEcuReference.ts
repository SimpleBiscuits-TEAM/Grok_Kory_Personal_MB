/**
 * L5P ECU Reference Module — E41 Controller Knowledge Base
 *
 * Full quasi-A2L for 2017 L5P (ECM_E41): `test_files/E41_L5P_2017/E41_a171711502_quasi.a2l`
 * (extracted from `E41_a171711502_quasi_2017 L5P a2L.zip`; companion: `E41_a171711502_L5P_150227_1.ptp`).
 *
 * Built from the E41 A2L calibration definition (71,246 unique parameters).
 * Maps GM internal naming conventions to human-readable descriptions and
 * provides calibration structure context for smarter diagnostic analysis.
 * 
 * Naming Convention:
 *   Prefix: Ka = array, Kt = table, Ke = scalar, De = default, Be = boolean
 *   Subsystem: 4-letter code (AICC, FHPC, FULC, etc.)
 *   Suffix: describes the parameter function
 * 
 * Table Dimensions: rows x cols = RPM breakpoints x load/fuel/pressure breakpoints
 */

// ─── Subsystem Definitions ───────────────────────────────────────────────────

export interface SubsystemInfo {
  code: string;
  name: string;
  description: string;
  paramCount: number;
  tableCount: number;
  keyTables: string[];
  relevantPids: string[];  // datalog PIDs this subsystem controls
}

export const L5P_SUBSYSTEMS: Record<string, SubsystemInfo> = {
  AICC: {
    code: 'AICC',
    name: 'Air Intake & Boost Control',
    description: 'Controls turbocharger boost pressure via VGT vane position. Contains boost setpoint tables (20x21 RPM×load), VGT feedforward maps, PID controller gains, and altitude/temperature compensation. This is the brain behind desired boost — when you see desired vs actual boost diverge, AICC is the subsystem making the call.',
    paramCount: 1600,
    tableCount: 719,
    keyTables: [
      'BstSetPt (20×21) — Boost pressure setpoint vs RPM and load. Multiple variants for altitude: Lo (high altitude), Mid, Sea (sea level). This is THE table that determines how much boost the ECM wants.',
      'VGT_FF (feedforward) — Pre-calculated vane position based on airflow demand. Gets the turbo close to target before PID takes over.',
      'PID Gains (Prop/Intgl/Deriv) — How aggressively the ECM chases the boost setpoint. Higher gains = faster response but risk overshoot.',
    ],
    relevantPids: ['boostPressure', 'boostDesired', 'turboVanePosition', 'turboVaneDesired', 'maf', 'barometricPressure'],
  },

  AICD: {
    code: 'AICD',
    name: 'Air Intake & Boost Diagnostics',
    description: 'Monitors boost system health. Watches for excessive deviation between desired and actual boost, EGR system performance, and turbo response times. Contains the thresholds that trigger boost-related DTCs.',
    paramCount: 500,
    tableCount: 56,
    keyTables: [
      'BstDevPos/Neg — Positive and negative boost deviation thresholds by RPM. How far off actual can be from desired before the ECM flags it.',
      'EGR_SysPerfAirThrsh (16×15) — EGR system performance air threshold table.',
      'BstSysPerf — Boost system performance monitoring thresholds.',
    ],
    relevantPids: ['boostPressure', 'boostDesired', 'turboVanePosition'],
  },

  FHPC: {
    code: 'FHPC',
    name: 'Fuel High Pressure Control',
    description: 'Controls the Denso HP4 high-pressure fuel pump and rail pressure regulation. Contains rail pressure setpoint tables (15×16 RPM×fuel quantity), PID gains for the pressure regulator valve (PRV) and metering unit (MU), and pump efficiency maps. When you see rail pressure hunting or deviation, this is the subsystem responsible.',
    paramCount: 587,
    tableCount: 287,
    keyTables: [
      'PresSetPt (15×16) — Desired rail pressure vs RPM and fuel quantity. Multiple altitude variants. This determines what rail pressure the ECM targets for any given operating condition.',
      'GovnProp/Intgl/Deriv — PID gains for the pressure regulator. Controls how the ECM adjusts PCV duty cycle to hit the target.',
      'PmpEff (5×8) — Pump efficiency map. The ECM uses this to predict how much pump drive is needed.',
      'MaxFuelSysPresCmd (33×1) — Absolute maximum commanded rail pressure by RPM. The hard ceiling.',
    ],
    relevantPids: ['railPressure', 'railPressureDesired', 'pcvDutyCycle'],
  },

  FCBR: {
    code: 'FCBR',
    name: 'Fuel Control & Low-Pressure Pump',
    description: 'Controls the fuel transfer pump (low-pressure side), fuel temperature compensation, and fuel filter monitoring. Contains open-loop pump duty cycle maps and fuel density corrections.',
    paramCount: 395,
    tableCount: 178,
    keyTables: [
      'OpenLoopFuelPumpDC (9×33) — Base fuel pump duty cycle vs RPM and fuel demand.',
      'MinFuelPumpDC (9×17) — Minimum pump duty cycle to maintain rail fill.',
      'FuelTempDensityMult — Fuel density correction for temperature.',
      'MaxFuelSysPresCmd (33×1) — Maximum fuel system pressure command.',
    ],
    relevantPids: ['railPressure', 'pcvDutyCycle'],
  },

  FULC: {
    code: 'FULC',
    name: 'Fuel Injection Control',
    description: 'The largest tuning subsystem (3,766 parameters). Controls Start of Injection (SOI) timing, injection quantity, pilot/main/post injection events, and combustion mode transitions. Contains the main injection timing tables (22×20 RPM×fuel quantity) that determine when fuel enters the cylinder relative to TDC.',
    paramCount: 3766,
    tableCount: 1921,
    keyTables: [
      'SOI_M (Start of Injection Main) — Main injection timing tables. Multiple variants for different combustion modes (CC=conventional, CV=conventional variant, AD=advanced, etc.). 12×1 to 12×7 dimensions.',
      'ET_InjTbl (22×20) — Energizing Time injection tables. These are the actual injector pulse width commands. The big ones.',
      'K_SOI_M_Ptn1 — Pattern 1 SOI multipliers for various operating conditions.',
      'FC21 (7×8) — Fuel correction tables for injection quantity.',
    ],
    relevantPids: ['injectorPulseWidth', 'injectionTiming', 'rpm'],
  },

  FADC: {
    code: 'FADC',
    name: 'Fuel Adaptive Control (Injector Learning)',
    description: 'Handles injector offset learning per cylinder. The ECM monitors crankshaft acceleration patterns to detect cylinder-to-cylinder fuel delivery variations and adapts individual injector trim values. Contains learning maps, correction limits, and the closed-loop balance engine (CBE) that listens to the crankshaft.',
    paramCount: 2967,
    tableCount: 392,
    keyTables: [
      'FSA_LrnMap (10×10) — Fuel system adaptation learned values per operating point.',
      'FSA_FuelMax/Min (10×8) — Maximum and minimum fuel correction limits.',
      'SQO/SQC — Injector quantity offset learning (open/closed loop).',
      'CBE (Crank Balance Engine) — Crankshaft-based combustion analysis for per-cylinder learning.',
    ],
    relevantPids: ['injectorPulseWidth', 'rpm'],
  },

  ETQC: {
    code: 'ETQC',
    name: 'Engine Torque Control',
    description: 'Converts driver demand into fuel quantity. Contains the torque-to-fuel conversion tables (16×15 RPM×torque), engine friction torque maps, and the fundamental relationship between what the driver asks for and what the engine delivers.',
    paramCount: 209,
    tableCount: 133,
    keyTables: [
      'TorqToFuel (16×15) — Torque-to-fuel conversion. Multiple altitude variants (Lo/Mid/Sea). This is how the ECM translates Nm of torque request into mm³ of fuel.',
      'NomEngFrictionTorque (16×16) — Baseline engine friction by RPM and coolant temp.',
    ],
    relevantPids: ['rpm', 'injectorPulseWidth'],
  },

  EGTC: {
    code: 'EGTC',
    name: 'Exhaust Gas Temperature Control',
    description: 'Manages EGT across 5 sensor positions (B1S1 pre-turbo through B1S5 tailpipe). Contains catalyst heating setpoints for DPF regeneration, EGT protection limits, and air management strategies to control exhaust temperature.',
    paramCount: 474,
    tableCount: 138,
    keyTables: [
      'CatHtSetPt (15×16) — Catalyst heating temperature setpoints for regen. Variants for ambient temp (Lo/Mid/Sea) and regen type (Base/RGN/Engine).',
      'CatHtAirCntrlMax — Maximum air control authority during cat heating.',
      'EGT protection thresholds — Limits that trigger torque reduction to protect components.',
    ],
    relevantPids: ['exhaustGasTemp'],
  },

  EGTD: {
    code: 'EGTD',
    name: 'EGT Diagnostics',
    description: 'Monitors EGT sensor health and exhaust system integrity. Contains rationality checks between EGT sensor positions, response time thresholds, and the enable conditions for EGT-related DTCs.',
    paramCount: 399,
    tableCount: 3,
    keyTables: [
      'CatHtEngineEnbl (8×9) — Enable conditions for catalyst heating EGT monitoring.',
      'Sensor correlation thresholds — Expected temperature relationships between sensor positions.',
    ],
    relevantPids: ['exhaustGasTemp'],
  },

  DPFC: {
    code: 'DPFC',
    name: 'DPF Control & Regeneration',
    description: 'Controls the Diesel Particulate Filter regeneration process. Contains soot loading models, regen initiation thresholds, fuel quantity limits during regen, and the priority system that decides when and how aggressively to regenerate.',
    paramCount: 1121,
    tableCount: 293,
    keyTables: [
      'RgnActvReq/DeactvReq (17×19) — Regen activation/deactivation request matrices by mission profile and priority.',
      'ModFlowRes (18×17) — DPF flow resistance model for soot loading estimation.',
      'FuelQntyMax — Maximum fuel quantity during regen profiles.',
    ],
    relevantPids: ['exhaustGasTemp', 'rpm'],
  },

  EOPC: {
    code: 'EOPC',
    name: 'Engine Oil Pressure Control',
    description: 'Monitors engine oil pressure against RPM-dependent minimum thresholds. Contains the minimum oil pressure curve and warning lamp delay timers.',
    paramCount: 32,
    tableCount: 2,
    keyTables: [
      'EngOilPresMin (17×1) — Minimum acceptable oil pressure by RPM.',
      'OilPresLoWarningLmpDly (9×1) — Delay before low oil pressure warning activates.',
    ],
    relevantPids: ['oilPressure'],
  },

  CSSD: {
    code: 'CSSD',
    name: 'Converter Slip & Speed Diagnostics',
    description: 'Monitors torque converter performance including turbine speed, pump performance, and slip conditions. Contains the transmission gear ratios and converter clutch performance thresholds.',
    paramCount: 110,
    tableCount: 8,
    keyTables: [
      'TransRatios (6×1) — Transmission gear ratios for speed calculations.',
      'TurbSpdPassThsh/FailThsh (5×5) — Turbine speed pass/fail thresholds for converter performance.',
      'PmpPerfFailThd — Pump performance failure thresholds.',
    ],
    relevantPids: ['tccSlipSpeed', 'tccDutyCycle', 'rpm'],
  },

  EXMC: {
    code: 'EXMC',
    name: 'Exhaust Management Control',
    description: 'Controls exhaust flow management including VGT position during non-boost conditions, exhaust brake functionality, and exhaust thermal management. Contains SOI expansion tables for exhaust heating.',
    paramCount: 477,
    tableCount: 227,
    keyTables: [
      'ExpFunc_SOI — SOI expansion function for exhaust thermal management.',
      'Norm_SOI_Max/Min (7×10) — Normal SOI operating range limits.',
    ],
    relevantPids: ['turboVanePosition', 'exhaustGasTemp', 'injectionTiming'],
  },

  CMBC: {
    code: 'CMBC',
    name: 'Combustion Mode Control',
    description: 'Manages transitions between combustion modes (conventional, low-temperature combustion, HCCI-like modes). The L5P uses 22 combustion modes. Contains mode priority matrices and transition setpoint groups.',
    paramCount: 84,
    tableCount: 28,
    keyTables: [
      'ModePriority (22×22) — Priority matrix for combustion mode transitions.',
      'TrnstnSetPtGrp (22×22) — Transition setpoint groups for mode switching.',
    ],
    relevantPids: ['injectorPulseWidth', 'injectionTiming', 'rpm'],
  },

  SCRC: {
    code: 'SCRC',
    name: 'SCR (Selective Catalytic Reduction) Control',
    description: 'Controls DEF (Diesel Exhaust Fluid) injection for NOx reduction. Contains dosing maps, catalyst efficiency models, and temperature management strategies.',
    paramCount: 1547,
    tableCount: 547,
    keyTables: [
      'DEF dosing maps — Urea injection quantity vs exhaust flow and NOx.',
      'Catalyst efficiency models — SCR conversion efficiency by temperature.',
    ],
    relevantPids: ['exhaustGasTemp'],
  },

  DFIR: {
    code: 'DFIR',
    name: 'DTC Fault Info Registry',
    description: 'The master DTC database. Contains 1,253 unique fault definitions with enable/disable conditions, debounce timers, MIL illumination rules, and fault dependency chains. Every DTC the L5P can set is defined here.',
    paramCount: 3813,
    tableCount: 1,
    keyTables: [
      'DTC_Depend_Table (4×13) — Fault dependency chain. Determines which DTCs can mask or enable other DTCs.',
      'FaultInfo — Per-DTC configuration: severity, MIL behavior, freeze frame requirements.',
    ],
    relevantPids: [],
  },
};

// ─── DTC Mapping (GM Internal → Human-Readable) ─────────────────────────────

export interface DtcDefinition {
  gmCode: string;
  description: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  relatedSubsystem: string;
  whatItMeans: string;
}

/**
 * Key L5P DTCs mapped from GM internal names to human-readable descriptions.
 * These are the most commonly encountered codes in tuned vehicles.
 */
export const L5P_KEY_DTCS: DtcDefinition[] = [
  // Fuel System
  { gmCode: 'FRP_TooLo', description: 'Fuel Rail Pressure Too Low', category: 'Fuel System', severity: 'critical', relatedSubsystem: 'FHPC', whatItMeans: 'Rail pressure dropped below the minimum threshold. Could indicate a weak HP4 pump, failing pressure relief valve, fuel supply restriction, or the tune is commanding more fuel than the pump can deliver.' },
  { gmCode: 'FRP_TooHi', description: 'Fuel Rail Pressure Too High', category: 'Fuel System', severity: 'critical', relatedSubsystem: 'FHPC', whatItMeans: 'Rail pressure exceeded the maximum threshold. Could indicate a stuck pressure control valve, faulty rail pressure sensor, or calibration issue commanding excessive pressure.' },
  { gmCode: 'FuelPresReg1Perf', description: 'Fuel Pressure Regulator Performance', category: 'Fuel System', severity: 'warning', relatedSubsystem: 'FHPC', whatItMeans: 'The pressure regulator (PCV) is not maintaining commanded pressure within tolerance. Often seen when PCV duty cycle is maxed out or hunting.' },
  { gmCode: 'FuelInjQuantLoExptd', description: 'Fuel Injection Quantity Lower Than Expected', category: 'Fuel System', severity: 'warning', relatedSubsystem: 'FULC', whatItMeans: 'The ECM detected less fuel being delivered than commanded. Could indicate worn injectors, low rail pressure, or injector learning at its limit.' },
  { gmCode: 'FuelInjQuantHiExptd', description: 'Fuel Injection Quantity Higher Than Expected', category: 'Fuel System', severity: 'warning', relatedSubsystem: 'FULC', whatItMeans: 'More fuel delivered than commanded. Could indicate leaking injectors or injector learning compensation maxed out in the positive direction.' },
  { gmCode: 'FuelOvrPresVlvAct', description: 'Fuel Over-Pressure Valve Activated', category: 'Fuel System', severity: 'critical', relatedSubsystem: 'FHPC', whatItMeans: 'The mechanical over-pressure relief valve opened. Rail pressure exceeded the hardware safety limit. This is a last-resort protection — something is seriously wrong with pressure control.' },

  // Per-Cylinder Injector Learning
  { gmCode: 'Cyl1FuelInjOfstLrnMin', description: 'Cylinder 1 Injector Offset Learning at Minimum', category: 'Fuel System', severity: 'warning', relatedSubsystem: 'FADC', whatItMeans: 'Cylinder 1 injector trim has hit its minimum correction limit. The injector is delivering more fuel than expected and the ECM can no longer compensate. Injector may be worn or leaking.' },
  { gmCode: 'Cyl1FuelInjOfstLrnMax', description: 'Cylinder 1 Injector Offset Learning at Maximum', category: 'Fuel System', severity: 'warning', relatedSubsystem: 'FADC', whatItMeans: 'Cylinder 1 injector trim has hit its maximum correction limit. The injector is delivering less fuel than expected. Could be partially clogged or electrically degraded.' },

  // Boost/Air
  { gmCode: 'BstCntlPstnAExcdLrnLim', description: 'Boost Control Position Exceeded Learn Limit', category: 'Boost/Air', severity: 'warning', relatedSubsystem: 'AICC', whatItMeans: 'The VGT vane position learning has hit its limit. The turbo is not responding as expected to commanded positions. Could indicate carbon buildup on vanes, actuator wear, or a boost leak making the ECM over-command the turbo.' },
  { gmCode: 'BstCntrlSlndPerf', description: 'Boost Control Solenoid Performance', category: 'Boost/Air', severity: 'warning', relatedSubsystem: 'AICC', whatItMeans: 'The boost control solenoid (VGT actuator) is not performing within specification. Could be electrical or mechanical.' },
  { gmCode: 'TrboChrgBstCntlA_Perf', description: 'Turbocharger Boost Control A Performance', category: 'Boost/Air', severity: 'warning', relatedSubsystem: 'AICD', whatItMeans: 'Boost system performance fault. The ECM detected sustained deviation between desired and actual boost. On tuned trucks, this often means the turbo is being asked for more than it can deliver, or there is a boost leak.' },
  { gmCode: 'MAF_SnsrPerf', description: 'MAF Sensor Performance', category: 'Boost/Air', severity: 'warning', relatedSubsystem: 'AICD', whatItMeans: 'Mass Air Flow sensor reading is outside expected range for current conditions. On tuned trucks with larger turbos, the MAF may be maxed out.' },

  // EGT
  { gmCode: 'EGT_SnsrCktLoB1S1', description: 'EGT Sensor Circuit Low Bank 1 Sensor 1', category: 'EGT', severity: 'warning', relatedSubsystem: 'EGTD', whatItMeans: 'EGT sensor 1 (pre-turbo) reading below expected range. Could be a wiring issue or failed sensor.' },
  { gmCode: 'EGT_SnsrCorrB1S1', description: 'EGT Sensor Correlation Bank 1 Sensor 1', category: 'EGT', severity: 'warning', relatedSubsystem: 'EGTD', whatItMeans: 'EGT sensor 1 does not correlate with other temperature sensors. The ECM cross-checks EGT readings against each other and against coolant temp at startup.' },

  // Coolant
  { gmCode: 'ECT_BelowThstRegTemp', description: 'Engine Coolant Below Thermostat Regulating Temperature', category: 'Coolant', severity: 'info', relatedSubsystem: 'EGTC', whatItMeans: 'Coolant temperature is not reaching thermostat opening temperature. Could indicate a stuck-open thermostat. Common in cold climates or after thermostat replacement.' },
  { gmCode: 'EngCoolFlowInsuf', description: 'Engine Coolant Flow Insufficient', category: 'Coolant', severity: 'critical', relatedSubsystem: 'EGTC', whatItMeans: 'The ECM detected insufficient coolant flow. Could indicate a failing water pump, air in the cooling system, or blocked passages.' },

  // Oil
  { gmCode: 'EngOilPresCktPerf', description: 'Engine Oil Pressure Circuit Performance', category: 'Oil', severity: 'critical', relatedSubsystem: 'EOPC', whatItMeans: 'Oil pressure reading is outside expected range for current RPM. The EOPC subsystem has a 17-point RPM-based minimum oil pressure curve. Falling below it triggers this code.' },
  { gmCode: 'EngOilDeterForcLmtPwr', description: 'Engine Oil Deterioration Forced Limited Power', category: 'Oil', severity: 'critical', relatedSubsystem: 'EOPC', whatItMeans: 'Oil quality has deteriorated enough to trigger a power reduction. The ECM monitors oil life and can force reduced power to protect the engine.' },

  // Transmission
  { gmCode: 'TorqMgntForcEngShtdwn', description: 'Torque Management Forced Engine Shutdown', category: 'Transmission', severity: 'critical', relatedSubsystem: 'ETMC', whatItMeans: 'The torque management system forced an engine shutdown. This is a last-resort protection when torque exceeds safe limits for the drivetrain.' },

  // DPF
  { gmCode: 'DPF_SootAccumHi', description: 'DPF Soot Accumulation High', category: 'DPF/Emissions', severity: 'warning', relatedSubsystem: 'DPFC', whatItMeans: 'DPF soot loading has exceeded the normal regen threshold. The ECM uses a flow resistance model (18×17 table) to estimate soot loading. Could indicate failed regens or excessive idle time.' },
];

// ─── Calibration Table Context ───────────────────────────────────────────────

export interface CalibrationContext {
  parameter: string;
  humanName: string;
  dimensions: string;
  axisDescription: string;
  tuningRelevance: string;
}

/**
 * Key calibration tables that provide context for datalog analysis.
 * When the analyzer sees certain behaviors, these explain WHY the ECM
 * is doing what it's doing.
 */
export const L5P_CALIBRATION_CONTEXT: CalibrationContext[] = [
  // Boost
  {
    parameter: 'KtAICC_p_BstSetPt',
    humanName: 'Boost Pressure Setpoint Table',
    dimensions: '20×21 (RPM × Load)',
    axisDescription: 'RPM breakpoints (idle to redline) × load breakpoints (0-100% pedal/fuel demand)',
    tuningRelevance: 'This is the primary table that determines desired boost at any operating point. On tuned trucks, this table is modified to command higher boost. When you see desired boost in the datalog, this is where that number comes from. Multiple altitude variants exist (Lo = high altitude, Mid, Sea = sea level) — the ECM blends between them based on barometric pressure.',
  },
  {
    parameter: 'KtAICC_K_VGT_FF',
    humanName: 'VGT Feedforward Table',
    dimensions: 'Various',
    axisDescription: 'RPM × airflow demand',
    tuningRelevance: 'Pre-calculated vane position that gets the turbo close to target before the PID controller takes over. On tuned trucks with larger turbos, this table needs adjustment to match the new turbo\'s flow characteristics. Mismatched feedforward = slow boost response or overshoot.',
  },

  // Fuel Pressure
  {
    parameter: 'KtFHPC_p_PresSetPt',
    humanName: 'Rail Pressure Setpoint Table',
    dimensions: '15×16 (RPM × Fuel Quantity)',
    axisDescription: 'RPM breakpoints × fuel quantity breakpoints (mm³/stroke)',
    tuningRelevance: 'Determines desired rail pressure for any RPM/fuel combination. Higher fuel quantities need higher rail pressure for proper atomization. On tuned trucks, this is raised to support increased fueling. The HP4 pump has a practical limit around 29,000-30,000 PSI — pushing beyond that accelerates wear.',
  },
  {
    parameter: 'KtFCBR_p_MaxFuelSysPresCmd',
    humanName: 'Maximum Fuel System Pressure Command',
    dimensions: '33×1 (RPM)',
    axisDescription: 'RPM breakpoints — the absolute ceiling for commanded rail pressure at each RPM',
    tuningRelevance: 'The hard ceiling for rail pressure. Even if the PresSetPt table asks for more, this table caps it. OEM L5P peaks around 29,000 PSI. Going 3,000+ PSI above OEM peak is getting into spicy territory for the HP4.',
  },

  // Injection Timing
  {
    parameter: 'KtFULC_K_SOI_M',
    humanName: 'Start of Injection (Main) Timing',
    dimensions: '12×1 to 12×7 (RPM × conditions)',
    axisDescription: 'RPM breakpoints × operating condition modifiers',
    tuningRelevance: 'Controls when the main injection event fires relative to TDC. More advance = more power but higher cylinder pressure and EGT. On the L5P, timing past 27° BTDC is getting aggressive. The ECM uses multiple SOI variants for different combustion modes.',
  },
  {
    parameter: 'KtFULC_t_ET_InjTbl',
    humanName: 'Injector Energizing Time Table',
    dimensions: '22×20 (RPM × Fuel Quantity)',
    axisDescription: 'RPM breakpoints × fuel quantity breakpoints',
    tuningRelevance: 'The actual injector pulse width command. This is the biggest table in the calibration. On piezo injectors (L5P), pulse widths above 1.5ms are race territory with high EGT risk. The table has 22 RPM points and 20 fuel quantity points — very high resolution for precise fuel delivery.',
  },

  // Torque
  {
    parameter: 'KtETQC_m_TorqToFuel',
    humanName: 'Torque-to-Fuel Conversion Table',
    dimensions: '16×15 (RPM × Torque)',
    axisDescription: 'RPM breakpoints × torque request (Nm)',
    tuningRelevance: 'Converts the driver\'s torque request into fuel quantity. This is the fundamental link between pedal position and fuel delivery. On tuned trucks, this table is modified to allow more fuel for a given torque request.',
  },

  // EGT
  {
    parameter: 'KtEGTC_T_CatHtSetPt',
    humanName: 'Catalyst Heating Temperature Setpoint',
    dimensions: '15×16 (RPM × Load)',
    axisDescription: 'RPM × load during DPF regeneration',
    tuningRelevance: 'Target EGT during DPF regen. The ECM uses post-injection and intake throttling to hit these temperatures. Typical regen target is 1100-1200°F. If EGTs in your datalog are in this range during steady-state driving, the truck is likely in a regen cycle.',
  },

  // Oil
  {
    parameter: 'KtEOPC_EngOilPresMin',
    humanName: 'Minimum Engine Oil Pressure Curve',
    dimensions: '17×1 (RPM)',
    axisDescription: 'RPM breakpoints — minimum acceptable oil pressure at each RPM',
    tuningRelevance: 'The ECM monitors oil pressure against this curve. At idle (~700 RPM), minimum is typically around 5-10 PSI. At higher RPM, the minimum rises. Falling below this curve triggers oil pressure DTCs and eventually power reduction.',
  },

  // Transmission
  {
    parameter: 'KaCSSD_r_TransRatios',
    humanName: 'Transmission Gear Ratios',
    dimensions: '6×1',
    axisDescription: 'Gear 1 through 6 (or Reverse + 1-5)',
    tuningRelevance: 'The Allison 10L1000 gear ratios used for speed and slip calculations. The ECM uses these to calculate expected turbine speed from output speed.',
  },
];

// ─── Analysis Context Generator ──────────────────────────────────────────────

export interface AnalysisInsight {
  title: string;
  context: string;
  subsystem: string;
  relevance: 'high' | 'medium' | 'low';
}

/**
 * Given observed datalog behavior, provide ECU calibration context
 * that explains WHY the ECM is doing what it's doing.
 */
export function getCalibrationContext(
  observation: 'boost_deviation' | 'rail_pressure_high' | 'rail_pressure_hunting' | 'high_egt' | 'injector_pulse_high' | 'timing_aggressive' | 'vane_position_high' | 'tcc_slip' | 'low_boost' | 'pcv_maxed' | 'oil_pressure_low' | 'regen_detected'
): AnalysisInsight {
  const insights: Record<string, AnalysisInsight> = {
    boost_deviation: {
      title: 'Boost Deviation — AICC Subsystem',
      context: 'The L5P\'s AICC subsystem uses a 20×21 boost setpoint table (RPM × load) with altitude compensation. Desired boost comes from this table. The VGT feedforward map gets the turbo close, then PID gains chase the target. Sustained deviation means either the turbo can\'t physically deliver (undersized, boost leak, high backpressure) or the PID gains need adjustment for modified hardware. The AICD diagnostic subsystem monitors this deviation and will set a DTC if it exceeds thresholds for too long.',
      subsystem: 'AICC/AICD',
      relevance: 'high',
    },
    rail_pressure_high: {
      title: 'Elevated Rail Pressure — FHPC Subsystem',
      context: 'Rail pressure setpoints come from the FHPC 15×16 table (RPM × fuel quantity). Higher fuel demand = higher pressure needed for atomization. The L5P HP4 pump peaks around 29,000 PSI from the factory. The MaxFuelSysPresCmd table (33×1) sets the absolute ceiling per RPM. Going 3,000+ PSI above OEM peak accelerates HP4 wear and increases the risk of fuel system failure. The PCV duty cycle shows how hard the system is working to maintain pressure.',
      subsystem: 'FHPC',
      relevance: 'high',
    },
    rail_pressure_hunting: {
      title: 'Rail Pressure Oscillation — FHPC PID Tuning',
      context: 'The FHPC subsystem uses separate PID gains for the pressure regulator valve (PRV) and metering unit (MU). Hunting/oscillation typically means the proportional or integral gains are mismatched for the current fuel system setup. On modified trucks with different injectors or pump modifications, the factory PID gains may not be optimal. Watch PCV duty cycle — if it\'s oscillating in sync with rail pressure, the PID loop is the culprit.',
      subsystem: 'FHPC',
      relevance: 'high',
    },
    high_egt: {
      title: 'Elevated EGT — EGTC/FULC Interaction',
      context: 'The L5P monitors 5 EGT positions (B1S1 pre-turbo through B1S5 tailpipe). High EGT is primarily driven by fuel quantity and timing. The FULC subsystem\'s injection timing tables control when fuel enters the cylinder — more advance = more cylinder pressure but potentially higher EGT. The EGTC subsystem has protection thresholds that will reduce torque if EGT exceeds limits. During DPF regen (DPFC), target EGT is 1100-1200°F — this is normal. Sustained EGT above 1300°F under load is getting aggressive.',
      subsystem: 'EGTC/FULC',
      relevance: 'high',
    },
    injector_pulse_high: {
      title: 'High Injector Pulse Width — FULC ET_InjTbl',
      context: 'Injector pulse width comes from the FULC ET_InjTbl (22×20 RPM × fuel quantity). The L5P uses piezo injectors — pulse widths above 1.5ms are race territory with high EGT risk. The FADC subsystem monitors per-cylinder fuel delivery via crankshaft acceleration patterns and adapts individual injector trims. If injector learning (FSA_LrnMap) is hitting its limits, the injectors may be worn or mismatched for the fuel demand. OEM duration or lower for desired horsepower is the rule of thumb for injector sizing.',
      subsystem: 'FULC/FADC',
      relevance: 'high',
    },
    timing_aggressive: {
      title: 'Aggressive Injection Timing — FULC SOI Tables',
      context: 'The FULC subsystem has multiple SOI (Start of Injection) table variants for different combustion modes — the L5P uses 22 combustion modes managed by CMBC. Main injection timing past 27° BTDC on a diesel is getting aggressive. High pulse width calls for high timing to complete combustion before the exhaust valve opens, but this increases cylinder pressure and thermal stress. The total crank angle duration (CAD) of the injection event depends on pulse width and RPM.',
      subsystem: 'FULC/CMBC',
      relevance: 'high',
    },
    vane_position_high: {
      title: 'High VGT Vane Position — AICC Feedforward',
      context: 'The AICC subsystem commands VGT vane position through feedforward tables and PID correction. Vane position above 45% at high RPM (2900+) with boost below 33 PSI and high MAF is a classic boost leak signature — the ECM is closing the vanes trying to build pressure but air is escaping before the intake manifold. The AICC learning (BstCntlPstnA) tracks vane position adaptation — if it hits its learn limit, the ECM sets a DTC.',
      subsystem: 'AICC',
      relevance: 'high',
    },
    tcc_slip: {
      title: 'TCC Slip — CSSD/ADPC Subsystems',
      context: 'The Allison 10L1000 TCC is managed by the ADPC (Adaptive Pressure Control) and CSSD (Converter Slip/Speed) subsystems. The CSSD subsystem contains the 6 gear ratios and turbine speed thresholds for performance monitoring. TCC slip during lockup indicates either insufficient apply pressure, worn clutch material, or the converter stall speed doesn\'t match the power curve. With larger turbos that shift the power curve to the right, a higher-stall converter helps the turbo spool before lockup.',
      subsystem: 'CSSD/ADPC',
      relevance: 'high',
    },
    low_boost: {
      title: 'Low Boost — AICC/AICD Analysis',
      context: 'The AICC boost setpoint table (20×21) defines what the ECM wants. If actual boost is consistently below desired, the AICD diagnostic subsystem will eventually flag it. Common causes on the L5P: boost leak (check intercooler boots, clamps, charge pipe), carbon buildup on VGT vanes reducing effective range, or the turbo is simply undersized for the tune\'s airflow demand. The VGT feedforward table may also need adjustment if the turbo has been upgraded.',
      subsystem: 'AICC/AICD',
      relevance: 'high',
    },
    pcv_maxed: {
      title: 'PCV Current High — Fuel Pressure Regulator at Limit',
      context: 'The PCV (Pressure Control Valve) regulates fuel rail pressure by controlling how much fuel bypasses back to the tank. PCV values are measured in milliamps (mA), not percentage. Higher mA = more fuel bypassed (lower rail pressure). Lower mA = more fuel flowing to the rail (higher pressure). At ~400 mA, the CP3 is receiving roughly 97% of available fuel. When PCV current stays very low under load, the fuel system is at its maximum delivery capacity. On tuned trucks, this means fuel demand exceeds what the stock fuel system can supply. Solutions: check lift pump output, inspect fuel filter, upgrade to larger injectors matched to desired HP, or add a lift pump to improve CP3 inlet pressure. Note: HP4 pumps are only on 2017+ L5P trucks. LB7 through LMM use CP3, LML uses CP4.2.',
      subsystem: 'FHPC',
      relevance: 'high',
    },
    oil_pressure_low: {
      title: 'Low Oil Pressure — EOPC Monitoring',
      context: 'The EOPC subsystem monitors oil pressure against a 17-point RPM curve (KtEOPC_EngOilPresMin). At idle, minimum is typically 5-10 PSI. At 3000 RPM, minimum rises to 25-30 PSI. The warning lamp has a delay timer (9-point table) to avoid false alarms from transient dips. Sustained low oil pressure under load is a serious concern — especially on tuned trucks making more power, which increases bearing loads.',
      subsystem: 'EOPC',
      relevance: 'high',
    },
    regen_detected: {
      title: 'DPF Regeneration — DPFC Subsystem',
      context: 'The DPFC subsystem uses a soot loading model (ModFlowRes 18×17) to estimate DPF loading. When soot exceeds the threshold, it initiates regen using the RgnActvReq priority matrix (17×19). During regen, the EGTC subsystem targets 1100-1200°F using post-injection and intake throttling. Elevated EGT during steady-state driving with normal boost is a strong indicator of active regen. The DPFC has 16 regen fuel quantity profiles that control how aggressively it burns off soot.',
      subsystem: 'DPFC/EGTC',
      relevance: 'medium',
    },
  };

  return insights[observation] || {
    title: 'Unknown Observation',
    context: 'No specific calibration context available for this observation.',
    subsystem: 'Unknown',
    relevance: 'low' as const,
  };
}

// ─── GM Naming Convention Decoder ────────────────────────────────────────────

/**
 * Decode a GM internal parameter name into human-readable components.
 * Example: KtAICC_p_BstSetPt_LoBC1 → 
 *   Type: Table, Subsystem: Air Intake & Boost Control, 
 *   Unit: pressure, Name: Boost Setpoint Low Altitude BC1
 */
export function decodeGmParameterName(name: string): {
  type: string;
  subsystem: string;
  unit: string;
  description: string;
} | null {
  const prefixTypes: Record<string, string> = {
    'Ka': 'Array (indexed)',
    'Kt': 'Table (2D/3D map)',
    'Ke': 'Scalar (single value)',
    'De': 'Default value',
    'Be': 'Boolean flag',
    'Ce': 'Enumeration constant',
    'Ct': 'Constant table',
    'Da': 'Data array',
  };

  const unitCodes: Record<string, string> = {
    'p': 'pressure (kPa or PSI)',
    'T': 'temperature (°C or °F)',
    't': 'time (seconds or ms)',
    'n': 'speed (RPM)',
    'm': 'mass/fuel quantity (mg or mm³)',
    'M': 'torque (Nm)',
    'K': 'gain/multiplier',
    'V': 'volume (mm³)',
    'Pct': 'percentage (%)',
    'I': 'current (amps)',
    'U': 'voltage (V)',
    'r': 'ratio',
    'k': 'filter coefficient',
    'b': 'boolean/enable',
    'e': 'enumeration/mode',
    'dm': 'delta mass',
    'dp': 'delta pressure',
    'phi': 'angle (degrees)',
    'cmp': 'compression/angle',
    'Cnt': 'counter',
    'd': 'distance/delta',
  };

  const match = name.match(/^([A-Z][a-z])([A-Z]{2,6})_([A-Za-z]+)_(.+)$/);
  if (!match) return null;

  const [, prefix, subsys, unitCode, rest] = match;

  return {
    type: prefixTypes[prefix] || prefix,
    subsystem: L5P_SUBSYSTEMS[subsys]?.name || subsys,
    unit: unitCodes[unitCode] || unitCode,
    description: rest
      .replace(/([A-Z])/g, ' $1')
      .replace(/([0-9]+)/g, ' $1')
      .trim(),
  };
}

// ─── EGT Sensor Position Map ─────────────────────────────────────────────────

export const L5P_EGT_POSITIONS = {
  B1S1: { position: 1, location: 'Pre-Turbo (Exhaust Manifold)', description: 'Hottest reading — directly measures combustion exhaust before the turbo. This is the most critical EGT for monitoring fueling and timing effects.' },
  B1S2: { position: 2, location: 'Post-Turbo / Pre-DOC', description: 'After the turbo, before the Diesel Oxidation Catalyst. Shows turbo efficiency — large drop from S1 means the turbo is extracting energy well.' },
  B1S3: { position: 3, location: 'Post-DOC / Pre-DPF', description: 'After the DOC, before the DPF. During regen, this sensor shows the DOC outlet temperature which should be elevated.' },
  B1S4: { position: 4, location: 'Post-DPF / Pre-SCR', description: 'After the DPF, before the SCR catalyst. During regen, this shows DPF outlet temperature. Should be close to S3 during active regen.' },
  B1S5: { position: 5, location: 'Post-SCR (Tailpipe)', description: 'Final exhaust temperature after all aftertreatment. Lowest reading under normal conditions. Elevated readings here indicate the aftertreatment system is generating heat (regen or SCR reaction).' },
};

// ─── Combustion Mode Reference ───────────────────────────────────────────────

export const L5P_COMBUSTION_MODES = {
  modeCount: 22,
  description: 'The L5P E41 controller uses 22 distinct combustion modes managed by the CMBC subsystem. Each mode has its own injection strategy (pilot count, main timing, post injection), EGR rate, and boost target. The ECM transitions between modes based on operating conditions using a 22×22 priority matrix.',
  commonModes: [
    { name: 'Conventional Combustion (CC)', description: 'Standard diesel combustion. Single pilot + main injection. Used for most driving conditions.' },
    { name: 'Low-Temperature Combustion (LTC)', description: 'High EGR rate with retarded timing. Reduces NOx but increases soot. Used at light loads.' },
    { name: 'Catalyst Heating (CH)', description: 'Post-injection and retarded timing to raise exhaust temperature for DPF regen or SCR light-off.' },
    { name: 'Advanced Combustion (AD)', description: 'More aggressive timing for improved efficiency. Used at moderate loads with favorable conditions.' },
  ],
};
