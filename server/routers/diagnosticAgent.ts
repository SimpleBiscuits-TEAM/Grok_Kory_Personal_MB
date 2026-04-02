import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { getFullKnoxKnowledge } from "../lib/knoxKnowledgeServer";

/* ─── PID Database for auto-population ─── */
interface DiagnosticPID {
  pid: number;
  service: number;  // 0x01 or 0x22
  name: string;
  shortName: string;
  unit: string;
  category: string;
}

/**
 * Master PID catalog organized by diagnostic category.
 * Knox uses this to map customer complaints to the exact PIDs needed.
 */
const DIAGNOSTIC_PID_CATALOG: Record<string, DiagnosticPID[]> = {
  dpf_soot: [
    { pid: 0x303E, service: 0x22, name: 'DPF Regen Status', shortName: 'DPF_REGEN', unit: 'enum', category: 'DPF/Soot' },
    { pid: 0x3337, service: 0x22, name: 'DPF Delta Pressure', shortName: 'DPF_DP', unit: 'kPa', category: 'DPF/Soot' },
    { pid: 0x7C, service: 0x01, name: 'DPF Temperature', shortName: 'DPF_TEMP', unit: '°F', category: 'DPF/Soot' },
    { pid: 0x7E, service: 0x01, name: 'DPF Differential Pressure', shortName: 'DPF_DIFF', unit: 'kPa', category: 'DPF/Soot' },
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
    { pid: 0x006E, service: 0x22, name: 'EGR Position Actual', shortName: 'EGR_ACT', unit: '%', category: 'EGR' },
    { pid: 0x006D, service: 0x22, name: 'EGR Position Desired', shortName: 'EGR_DES', unit: '%', category: 'EGR' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
    { pid: 0x10, service: 0x01, name: 'MAF Sensor', shortName: 'MAF', unit: 'g/s', category: 'Air' },
  ],
  dpf_regen: [
    { pid: 0x303E, service: 0x22, name: 'DPF Regen Status', shortName: 'DPF_REGEN', unit: 'enum', category: 'DPF/Regen' },
    { pid: 0x3337, service: 0x22, name: 'DPF Delta Pressure', shortName: 'DPF_DP', unit: 'kPa', category: 'DPF/Regen' },
    { pid: 0x7C, service: 0x01, name: 'DPF Temperature', shortName: 'DPF_TEMP', unit: '°F', category: 'DPF/Regen' },
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
    { pid: 0x1638, service: 0x22, name: 'Fuel Rate', shortName: 'FUEL_RATE', unit: 'L/h', category: 'Fuel' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
    { pid: 0x0D, service: 0x01, name: 'Vehicle Speed', shortName: 'VSS', unit: 'mph', category: 'Engine' },
  ],
  nox_scr: [
    { pid: 0x331C, service: 0x22, name: 'SCR Average Efficiency', shortName: 'SCR_EFF', unit: '%', category: 'SCR' },
    { pid: 0x331B, service: 0x22, name: 'SCR Fluid (DEF)', shortName: 'DEF_LVL', unit: '%', category: 'SCR' },
    { pid: 0x334B, service: 0x22, name: 'NH3 Load in SCR', shortName: 'NH3_LOAD', unit: 'g', category: 'SCR' },
    { pid: 0x3311, service: 0x22, name: 'SCR Service Status', shortName: 'SCR_SVC', unit: 'enum', category: 'SCR' },
    { pid: 0x7F, service: 0x01, name: 'NOx Sensor', shortName: 'NOX', unit: 'ppm', category: 'Emissions' },
    { pid: 0x303E, service: 0x22, name: 'DPF Regen Status', shortName: 'DPF_REGEN', unit: 'enum', category: 'DPF' },
    { pid: 0x7C, service: 0x01, name: 'DPF Temperature', shortName: 'DPF_TEMP', unit: '°F', category: 'DPF' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
  ],
  reduced_power: [
    { pid: 0x303E, service: 0x22, name: 'DPF Regen Status', shortName: 'DPF_REGEN', unit: 'enum', category: 'DPF' },
    { pid: 0x3337, service: 0x22, name: 'DPF Delta Pressure', shortName: 'DPF_DP', unit: 'kPa', category: 'DPF' },
    { pid: 0x7C, service: 0x01, name: 'DPF Temperature', shortName: 'DPF_TEMP', unit: '°F', category: 'DPF' },
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
    { pid: 0x11, service: 0x01, name: 'Throttle Position', shortName: 'TPS', unit: '%', category: 'Engine' },
    { pid: 0x1A2D, service: 0x22, name: 'Actual Steady State Torque', shortName: 'TORQUE', unit: 'Nm', category: 'Performance' },
    { pid: 0x006E, service: 0x22, name: 'EGR Position Actual', shortName: 'EGR_ACT', unit: '%', category: 'EGR' },
    { pid: 0x10, service: 0x01, name: 'MAF Sensor', shortName: 'MAF', unit: 'g/s', category: 'Air' },
    { pid: 0x0B, service: 0x01, name: 'Intake MAP', shortName: 'MAP', unit: 'kPa', category: 'Air' },
  ],
  turbo_boost: [
    { pid: 0x0B, service: 0x01, name: 'Intake MAP', shortName: 'MAP', unit: 'kPa', category: 'Air' },
    { pid: 0x208A, service: 0x22, name: 'Extended Range MAP', shortName: 'MAP_EXT', unit: 'kPa', category: 'Air' },
    { pid: 0x1540, service: 0x22, name: 'VGT Desired Position', shortName: 'VGT_DES', unit: '%', category: 'Turbo' },
    { pid: 0x1543, service: 0x22, name: 'VGT Actual Position', shortName: 'VGT_ACT', unit: '%', category: 'Turbo' },
    { pid: 0x2041, service: 0x22, name: 'VGT Duty Cycle', shortName: 'VGT_DC', unit: '%', category: 'Turbo' },
    { pid: 0x1689, service: 0x22, name: 'VGT Open Learned Offset', shortName: 'VGT_OPN_LRN', unit: '', category: 'Turbo' },
    { pid: 0x168A, service: 0x22, name: 'VGT Close Learned Offset', shortName: 'VGT_CLS_LRN', unit: '', category: 'Turbo' },
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x10, service: 0x01, name: 'MAF Sensor', shortName: 'MAF', unit: 'g/s', category: 'Air' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
  ],
  fuel_system: [
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x23, service: 0x01, name: 'Fuel Rail Pressure', shortName: 'FRP', unit: 'kPa', category: 'Fuel' },
    { pid: 0x1638, service: 0x22, name: 'Fuel Rate', shortName: 'FUEL_RATE', unit: 'L/h', category: 'Fuel' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
    { pid: 0x10, service: 0x01, name: 'MAF Sensor', shortName: 'MAF', unit: 'g/s', category: 'Air' },
    { pid: 0x0B, service: 0x01, name: 'Intake MAP', shortName: 'MAP', unit: 'kPa', category: 'Air' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
    { pid: 0x11, service: 0x01, name: 'Throttle Position', shortName: 'TPS', unit: '%', category: 'Engine' },
  ],
  injector_health: [
    { pid: 0x162F, service: 0x22, name: 'Cylinder Balance Rate 1', shortName: 'CYL1_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x1630, service: 0x22, name: 'Cylinder Balance Rate 2', shortName: 'CYL2_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x1631, service: 0x22, name: 'Cylinder Balance Rate 3', shortName: 'CYL3_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x1632, service: 0x22, name: 'Cylinder Balance Rate 4', shortName: 'CYL4_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x1633, service: 0x22, name: 'Cylinder Balance Rate 5', shortName: 'CYL5_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x1634, service: 0x22, name: 'Cylinder Balance Rate 6', shortName: 'CYL6_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x1635, service: 0x22, name: 'Cylinder Balance Rate 7', shortName: 'CYL7_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x1636, service: 0x22, name: 'Cylinder Balance Rate 8', shortName: 'CYL8_BAL', unit: 'mm³/st', category: 'Injectors' },
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x23, service: 0x01, name: 'Fuel Rail Pressure', shortName: 'FRP', unit: 'kPa', category: 'Fuel' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
  ],
  tcc_transmission: [
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x0D, service: 0x01, name: 'Vehicle Speed', shortName: 'VSS', unit: 'mph', category: 'Engine' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
    { pid: 0x0F, service: 0x01, name: 'Intake Air Temperature', shortName: 'IAT', unit: '°F', category: 'Engine' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
    { pid: 0x11, service: 0x01, name: 'Throttle Position', shortName: 'TPS', unit: '%', category: 'Engine' },
  ],
  performance_general: [
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x0D, service: 0x01, name: 'Vehicle Speed', shortName: 'VSS', unit: 'mph', category: 'Engine' },
    { pid: 0x0B, service: 0x01, name: 'Intake MAP', shortName: 'MAP', unit: 'kPa', category: 'Air' },
    { pid: 0x10, service: 0x01, name: 'MAF Sensor', shortName: 'MAF', unit: 'g/s', category: 'Air' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
    { pid: 0x11, service: 0x01, name: 'Throttle Position', shortName: 'TPS', unit: '%', category: 'Engine' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
    { pid: 0x23, service: 0x01, name: 'Fuel Rail Pressure', shortName: 'FRP', unit: 'kPa', category: 'Fuel' },
    { pid: 0x1A2D, service: 0x22, name: 'Actual Steady State Torque', shortName: 'TORQUE', unit: 'Nm', category: 'Performance' },
  ],
  egt_overtemp: [
    { pid: 0x7C, service: 0x01, name: 'DPF Temperature', shortName: 'DPF_TEMP', unit: '°F', category: 'Exhaust' },
    { pid: 0x0C, service: 0x01, name: 'Engine RPM', shortName: 'RPM', unit: 'RPM', category: 'Engine' },
    { pid: 0x04, service: 0x01, name: 'Engine Load', shortName: 'LOAD', unit: '%', category: 'Engine' },
    { pid: 0x10, service: 0x01, name: 'MAF Sensor', shortName: 'MAF', unit: 'g/s', category: 'Air' },
    { pid: 0x303E, service: 0x22, name: 'DPF Regen Status', shortName: 'DPF_REGEN', unit: 'enum', category: 'DPF' },
    { pid: 0x05, service: 0x01, name: 'Coolant Temperature', shortName: 'ECT', unit: '°F', category: 'Engine' },
    { pid: 0x1638, service: 0x22, name: 'Fuel Rate', shortName: 'FUEL_RATE', unit: 'L/h', category: 'Fuel' },
  ],
};

/**
 * Test condition templates for each diagnostic category.
 * These tell the customer exactly what driving conditions are needed
 * to properly capture the problem area.
 */
const TEST_CONDITIONS: Record<string, {
  title: string;
  description: string;
  steps: string[];
  duration: string;
  warnings: string[];
}> = {
  dpf_soot: {
    title: 'DPF Soot Loading Test',
    description: 'Capture soot accumulation rate and regen behavior under real driving conditions.',
    steps: [
      'Start engine cold (below 160°F coolant) and let it idle for 2 minutes',
      'Drive at highway speed (55-70 mph) for at least 15 minutes to reach operating temperature',
      'Perform 3 wide-open-throttle (WOT) pulls from 30 mph to 80 mph in Drive',
      'Return to highway cruise for 5 minutes (this is where passive regen should occur)',
      'Note if the "DPF Regen Active" indicator appears during cruise',
      'End with 2 minutes of idle before stopping the log',
    ],
    duration: '25-30 minutes',
    warnings: [
      'Do NOT stop the log during a regen event — let it complete',
      'Ensure the vehicle is in NORMAL operating mode (not tow/haul or sport)',
      'Coolant must reach full operating temperature (195°F+) for valid soot model data',
    ],
  },
  dpf_regen: {
    title: 'DPF Regeneration Monitoring Test',
    description: 'Monitor a complete regen cycle from start to finish.',
    steps: [
      'Start logging at idle with engine at operating temperature',
      'Drive at highway speed (60-70 mph) until a regen event begins',
      'Maintain steady highway speed throughout the entire regen (do NOT stop or idle)',
      'Continue logging for 5 minutes after regen completes',
      'If no regen occurs after 30 minutes, perform 2 WOT pulls then return to cruise',
    ],
    duration: '30-45 minutes (depends on when regen triggers)',
    warnings: [
      'Do NOT shut off the engine during a regen — this causes incomplete burn and more soot',
      'Regen typically takes 15-25 minutes at highway speed',
      'EGT will rise to 1000-1200°F during active regen — this is normal',
    ],
  },
  nox_scr: {
    title: 'SCR/NOx System Test',
    description: 'Evaluate SCR efficiency and DEF dosing under load.',
    steps: [
      'Ensure DEF tank is at least 25% full before starting',
      'Start engine and let it reach full operating temperature (195°F+ coolant)',
      'Drive at highway speed (60-70 mph) for 10 minutes of steady cruise',
      'Perform 3 moderate acceleration events (50% throttle, 40-70 mph)',
      'Return to steady cruise for another 10 minutes',
      'End with 2 minutes of idle',
    ],
    duration: '25-30 minutes',
    warnings: [
      'SCR needs exhaust temps above 400°F to function — highway driving is essential',
      'Cold-start data is useful but SCR efficiency readings are only valid when warm',
      'If DEF light is on, note the mileage and any warning messages',
    ],
  },
  reduced_power: {
    title: 'Reduced Engine Power Diagnosis Test',
    description: 'Capture the exact conditions when power reduction occurs.',
    steps: [
      'Start logging at idle with engine at operating temperature',
      'Drive normally and attempt to reproduce the reduced power condition',
      'When reduced power occurs, note the exact time and conditions',
      'Continue logging for at least 2 minutes after the event',
      'If possible, try to reproduce it 2-3 times in the same log session',
      'Include both highway and city driving to cover all load conditions',
    ],
    duration: '15-30 minutes (until condition reproduces)',
    warnings: [
      'Do NOT clear DTCs before logging — we need the freeze frame data',
      'Note any dashboard warning lights or messages when power reduces',
      'If the condition only occurs under specific conditions (hot day, towing, etc.), try to replicate those',
    ],
  },
  turbo_boost: {
    title: 'Turbo/Boost System Test',
    description: 'Evaluate VGT response, boost build, and turbo health.',
    steps: [
      'Start engine and reach full operating temperature',
      'Perform 5 WOT pulls from 1500 RPM to redline in 2nd or 3rd gear',
      'Between each pull, cruise at 40 mph for 30 seconds to let turbo cool',
      'Perform 2 "tip-in" tests: from 40 mph cruise, floor it briefly (2 seconds) then release',
      'End with 2 minutes of steady highway cruise',
    ],
    duration: '15-20 minutes',
    warnings: [
      'Ensure no boost leaks before testing (listen for hissing under load)',
      'VGT learned offsets indicate vane wear — increasing values over time = carbon buildup',
      'Boost should build within 1-2 seconds of throttle application at 2000+ RPM',
    ],
  },
  fuel_system: {
    title: 'Fuel System Health Test',
    description: 'Evaluate fuel rail pressure tracking, PCV behavior, and injector delivery.',
    steps: [
      'Start logging at cold idle (note initial rail pressure)',
      'Let engine warm to operating temperature',
      'Perform 3 WOT pulls from 30-80 mph',
      'Between pulls, decelerate with foot off throttle (fuel cut-off test)',
      'Perform a steady-state cruise at 70 mph for 5 minutes',
      'End with 2 minutes of idle',
    ],
    duration: '20-25 minutes',
    warnings: [
      'Rail pressure should track desired within ±2000 PSI during steady state',
      'PCV oscillation during steady cruise indicates air in fuel or failing lift pump',
      'If rail pressure drops during WOT, check fuel filter and lift pump',
    ],
  },
  injector_health: {
    title: 'Injector Balance Test',
    description: 'Evaluate per-cylinder fuel delivery balance.',
    steps: [
      'Start engine and reach full operating temperature (195°F+ coolant)',
      'Log at idle for 3 minutes (cylinder balance is most visible at idle)',
      'Rev to 1500 RPM and hold for 1 minute',
      'Rev to 2000 RPM and hold for 1 minute',
      'Perform 2 WOT pulls to check balance under load',
      'Return to idle for 2 minutes',
    ],
    duration: '15-20 minutes',
    warnings: [
      'Cylinder balance deviation >5% from mean = injector wear',
      'Cylinder balance deviation >10% from mean = failing injector — replace soon',
      'Cold engine balance data is less reliable — wait for full warm-up',
    ],
  },
  tcc_transmission: {
    title: 'TCC/Transmission Test',
    description: 'Evaluate torque converter clutch lockup and transmission behavior.',
    steps: [
      'Start logging at idle with engine at operating temperature',
      'Accelerate gently from stop to 70 mph (let transmission shift through all gears)',
      'Cruise at 70 mph for 3 minutes (TCC should lock up)',
      'Perform 2 moderate accelerations (50% throttle) from 40-70 mph',
      'Perform 1 WOT pull from 30-80 mph',
      'Decelerate gradually to stop',
      'Repeat the 0-70 mph acceleration once more',
    ],
    duration: '15-20 minutes',
    warnings: [
      'TCC slip >50 RPM during locked cruise = TCC wear or low line pressure',
      'Harsh shifts or flares indicate transmission fluid temp or solenoid issues',
      'Note transmission fluid temperature — should be 160-200°F for valid test',
    ],
  },
  performance_general: {
    title: 'General Performance Baseline Test',
    description: 'Capture a complete performance baseline for comparison.',
    steps: [
      'Start engine cold and log the warm-up phase (2-3 minutes)',
      'Drive to highway and cruise at 60 mph for 5 minutes',
      'Perform 3 WOT pulls from 30-80 mph with 30 seconds between each',
      'Cruise at 70 mph for 5 minutes',
      'Perform 2 "roll-on" tests: from 60 mph, floor it to 100 mph',
      'End with 2 minutes of idle',
    ],
    duration: '25-30 minutes',
    warnings: [
      'Ensure vehicle is in NORMAL mode (not tow/haul, sport, or regen)',
      'Ambient temperature and altitude affect results — note conditions',
      'For valid HP comparison, use SAE-corrected values',
    ],
  },
  egt_overtemp: {
    title: 'EGT/Exhaust Temperature Test',
    description: 'Monitor exhaust temperatures under sustained load.',
    steps: [
      'Start logging at idle with engine at operating temperature',
      'Drive at highway speed under moderate load for 10 minutes',
      'Perform 3 sustained WOT pulls (hold WOT for 10+ seconds each)',
      'Immediately after each pull, note the peak EGT and cooldown rate',
      'If towing, log during a hill climb or sustained grade',
      'End with 5 minutes of light-load cruise to observe cooldown',
    ],
    duration: '20-30 minutes',
    warnings: [
      'EGT above 1300°F sustained = danger zone, back off throttle',
      'EGT above 1500°F = immediate risk of turbo/manifold damage',
      'During DPF regen, EGT will be elevated — this is normal',
    ],
  },
};

/* ─── Complaint-to-Category Mapping ─── */
const COMPLAINT_KEYWORDS: Record<string, string[]> = {
  dpf_soot: ['soot', 'dpf', 'particulate', 'filter loading', 'soot load', 'dpf full', 'dpf clogged', 'high soot'],
  dpf_regen: ['regen', 'regeneration', 'dpf regen', 'regen cycle', 'regen not completing', 'regen too frequent', 'constant regen'],
  nox_scr: ['nox', 'scr', 'def', 'urea', 'adblue', 'catalytic', 'emissions light', 'def quality', 'reductant'],
  reduced_power: ['reduced power', 'limp mode', 'power loss', 'engine power reduced', 'no power', 'power cut', 'derate', 'derating'],
  turbo_boost: ['turbo', 'boost', 'lag', 'turbo lag', 'no boost', 'boost leak', 'vgt', 'wastegate', 'slow spool', 'turbo whistle'],
  fuel_system: ['fuel pressure', 'rail pressure', 'cp4', 'cp3', 'hp4', 'fuel pump', 'pcv', 'fuel filter', 'fuel starvation', 'p0087', 'fuel rail'],
  injector_health: ['injector', 'cylinder balance', 'rough idle', 'miss', 'misfire', 'injector failure', 'iqa', 'balance rate', 'rough running'],
  tcc_transmission: ['tcc', 'torque converter', 'transmission', 'shift', 'slip', 'harsh shift', 'flare', 'shudder', 'lockup'],
  performance_general: ['performance', 'slow', 'sluggish', 'baseline', 'power test', 'dyno', 'horsepower', 'torque', 'acceleration'],
  egt_overtemp: ['egt', 'exhaust temp', 'exhaust temperature', 'overtemp', 'hot exhaust', 'exhaust hot', 'pyrometer', 'towing hot'],
};

/**
 * Match a customer complaint to diagnostic categories using keyword matching.
 * Returns sorted by relevance (most keyword matches first).
 */
function matchComplaintToCategories(complaint: string): string[] {
  const lower = complaint.toLowerCase();
  const scores: { category: string; score: number }[] = [];

  for (const [category, keywords] of Object.entries(COMPLAINT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += kw.split(' ').length; // Multi-word matches score higher
    }
    if (score > 0) scores.push({ category, score });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.map(s => s.category);
}

/**
 * Deduplicate PIDs across multiple categories
 */
function deduplicatePids(categories: string[]): DiagnosticPID[] {
  const seen = new Set<string>();
  const result: DiagnosticPID[] = [];

  for (const cat of categories) {
    const pids = DIAGNOSTIC_PID_CATALOG[cat] || [];
    for (const pid of pids) {
      const key = `${pid.service}:${pid.pid}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(pid);
      }
    }
  }

  return result;
}

/* ─── Router ─── */
export const diagnosticAgentRouter = router({
  /**
   * Map a customer complaint to recommended PIDs and test conditions.
   * This is the "What are you trying to figure out?" endpoint.
   */
  mapComplaint: protectedProcedure
    .input(z.object({
      complaint: z.string().min(3).max(2000),
      vehicleYear: z.number().optional(),
      vehicleEngine: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { complaint, vehicleYear, vehicleEngine } = input;

      // Step 1: Keyword-based category matching
      const matchedCategories = matchComplaintToCategories(complaint);

      // Step 2: If no keyword match, use LLM to classify
      let categories = matchedCategories;
      if (categories.length === 0) {
        try {
          const result = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are an automotive diagnostic classifier. Given a customer complaint about a diesel truck, classify it into one or more of these categories: ${Object.keys(DIAGNOSTIC_PID_CATALOG).join(', ')}. Return ONLY a JSON array of category strings, nothing else.`
              },
              { role: "user", content: complaint }
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "categories",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    categories: { type: "array", items: { type: "string" } }
                  },
                  required: ["categories"],
                  additionalProperties: false,
                }
              }
            }
          });
          const rawCat = result.choices?.[0]?.message?.content;
          const parsed = JSON.parse(typeof rawCat === 'string' ? rawCat : '{"categories":[]}');
          categories = (parsed.categories || []).filter((c: string) => DIAGNOSTIC_PID_CATALOG[c]);
        } catch {
          categories = ['performance_general']; // Fallback
        }
      }

      // If still nothing, default to general performance
      if (categories.length === 0) categories = ['performance_general'];

      // Step 3: Collect PIDs and test conditions
      const recommendedPids = deduplicatePids(categories);
      const primaryCategory = categories[0];
      const testCondition = TEST_CONDITIONS[primaryCategory] || TEST_CONDITIONS.performance_general;

      // Step 4: Generate Knox's explanation via LLM
      let knoxExplanation = '';
      try {
        const knowledgeBase = getFullKnoxKnowledge();
        const pidList = recommendedPids.map(p =>
          `- ${p.name} (${p.shortName}) [${p.service === 0x22 ? 'Mode 22' : 'Mode 01'} 0x${p.pid.toString(16).toUpperCase()}] — ${p.unit}`
        ).join('\n');

        const vehicleContext = vehicleYear && vehicleEngine
          ? `Vehicle: ${vehicleYear} ${vehicleEngine}`
          : 'Vehicle: Duramax diesel (year unknown)';

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are Knox, the PPEI V-OP AI Diagnostic Agent. You are an expert diesel engine diagnostician.
${vehicleContext}

You have access to this knowledge base:
${knowledgeBase.substring(0, 6000)}

The customer described their problem and you've selected these diagnostic PIDs:
${pidList}

Test conditions: ${testCondition.title}

Respond with a brief, confident diagnostic explanation:
1. What you think might be causing the problem (2-3 sentences)
2. Why you selected these specific PIDs (1-2 sentences)
3. What you'll be looking for in the data (2-3 key indicators)

Keep it conversational but technical. Use the customer's language. Do NOT use markdown headers.`
            },
            { role: "user", content: complaint }
          ],
        });
        const rawContent = result.choices?.[0]?.message?.content;
        knoxExplanation = typeof rawContent === 'string' ? rawContent : '';
      } catch {
        knoxExplanation = `Based on your description, I've identified ${categories.length} diagnostic area${categories.length > 1 ? 's' : ''} to investigate. I've selected ${recommendedPids.length} PIDs that will give us the data we need. Let me set up the datalogger for you.`;
      }

      return {
        categories,
        recommendedPids: recommendedPids.map(p => ({
          pid: p.pid,
          service: p.service,
          name: p.name,
          shortName: p.shortName,
          unit: p.unit,
          category: p.category,
        })),
        testCondition: {
          title: testCondition.title,
          description: testCondition.description,
          steps: testCondition.steps,
          duration: testCondition.duration,
          warnings: testCondition.warnings,
        },
        knoxExplanation,
      };
    }),

  /**
   * Analyze an uploaded datalog and identify what's missing.
   * Knox reviews the available PIDs, does his best diagnosis,
   * then suggests additional PIDs to "dial it in."
   */
  analyzeDatalog: protectedProcedure
    .input(z.object({
      complaint: z.string(),
      availablePids: z.array(z.string()), // Column names from the CSV
      dataSummary: z.string(), // Key stats from the datalog
      vehicleYear: z.number().optional(),
      vehicleEngine: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { complaint, availablePids, dataSummary, vehicleYear, vehicleEngine } = input;

      const knowledgeBase = getFullKnoxKnowledge();
      const vehicleContext = vehicleYear && vehicleEngine
        ? `Vehicle: ${vehicleYear} ${vehicleEngine}`
        : 'Vehicle: Duramax diesel (year unknown)';

      // Determine what PIDs are missing
      const matchedCategories = matchComplaintToCategories(complaint);
      const idealPids = deduplicatePids(matchedCategories.length > 0 ? matchedCategories : ['performance_general']);

      // Find PIDs that aren't in the datalog
      const availableLower = availablePids.map(p => p.toLowerCase());
      const missingPids = idealPids.filter(p => {
        const nameMatch = availableLower.some(a =>
          a.includes(p.shortName.toLowerCase()) ||
          a.includes(p.name.toLowerCase()) ||
          a.includes(p.shortName.replace(/_/g, ' ').toLowerCase())
        );
        return !nameMatch;
      });

      // Ask Knox to analyze with what we have
      let analysis = '';
      try {
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are Knox, the PPEI V-OP AI Diagnostic Agent. Expert diesel diagnostician.
${vehicleContext}

Knowledge base:
${knowledgeBase.substring(0, 6000)}

Customer complaint: "${complaint}"

Available PIDs in this datalog:
${availablePids.join(', ')}

Data summary:
${dataSummary}

${missingPids.length > 0 ? `Missing PIDs that would help: ${missingPids.map(p => p.name).join(', ')}` : 'All recommended PIDs are present.'}

Provide your diagnostic analysis:
1. What the data tells you (use specific values from the summary)
2. Your diagnosis based on available data
3. Confidence level (high/medium/low) and what would increase it
4. If PIDs are missing, explain what each missing PID would tell us

Be specific, reference actual values, and explain your reasoning like a master technician would.`
            },
            { role: "user", content: `Here's the datalog summary:\n${dataSummary}` }
          ],
        });
        const rawAnalysis = result.choices?.[0]?.message?.content;
        analysis = typeof rawAnalysis === 'string' ? rawAnalysis : 'Analysis unavailable.';
      } catch (err) {
        analysis = 'Knox analysis temporarily unavailable. Please try again.';
      }

      return {
        analysis,
        missingPids: missingPids.map(p => ({
          pid: p.pid,
          service: p.service,
          name: p.name,
          shortName: p.shortName,
          unit: p.unit,
          category: p.category,
        })),
        confidence: missingPids.length === 0 ? 'high' : missingPids.length <= 3 ? 'medium' : 'low',
        availablePidCount: availablePids.length,
        idealPidCount: idealPids.length,
      };
    }),

  /**
   * Get test conditions for a specific diagnostic category.
   */
  getTestConditions: protectedProcedure
    .input(z.object({
      category: z.string(),
    }))
    .query(({ input }) => {
      return TEST_CONDITIONS[input.category] || TEST_CONDITIONS.performance_general;
    }),

  /**
   * Get all available diagnostic categories for the UI.
   */
  getCategories: protectedProcedure
    .query(() => {
      return Object.entries(DIAGNOSTIC_PID_CATALOG).map(([key, pids]) => ({
        id: key,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        pidCount: pids.length,
        testCondition: TEST_CONDITIONS[key]?.title || 'General Test',
      }));
    }),
});
