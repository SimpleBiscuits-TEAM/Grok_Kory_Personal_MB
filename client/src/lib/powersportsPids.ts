/**
 * Powersports Extended PIDs — CAN-am / BRP Sea-Doo / Polaris / Kawasaki
 *
 * These use manufacturer-specific CAN protocols (NOT standard OBD-II).
 * Most powersports ECUs broadcast data on proprietary CAN IDs rather than
 * responding to OBD-II service requests. The PID numbers here are virtual
 * identifiers mapped to the actual CAN arbitration IDs + byte offsets.
 *
 * CAN-am / BRP: Rotax ECU, 500 kbps CAN, BuDS2 diagnostic protocol
 * Sea-Doo / BRP Marine: Rotax 4-TEC, 250 kbps CAN, NMEA 2000 overlay
 * Polaris: Delphi ECU, 500 kbps CAN, proprietary protocol
 * Kawasaki: KDS protocol over CAN, 500 kbps, 6-pin diagnostic connector
 *
 * PID numbering scheme:
 *   0xCA00–0xCAFF = CAN-am / BRP ATV/UTV (Rotax)
 *   0xSD00–0xSDFF = Sea-Doo / BRP Marine
 *   0xPO00–0xPOFF = Polaris
 *   0xKW00–0xKWFF = Kawasaki
 *
 * Since TypeScript hex literals are numeric, we use decimal ranges:
 *   CAN-am:  0x2000–0x20FF (8192–8447)
 *   Sea-Doo: 0x2500–0x25FF (9472–9727)
 *   Polaris: 0x2200–0x22FF (8704–8959)
 *   Kawasaki: 0x2300–0x23FF (8960–9215)
 */

import type { PIDDefinition, PIDPreset } from './obdConnection';

// ═══════════════════════════════════════════════════════════════════════════
// CAN-am / BRP (Rotax ECU) — Maverick X3, Outlander, Commander, Defender
// ═══════════════════════════════════════════════════════════════════════════
// ECU: Bosch MED17.8.5 (pre-2020) / MG1CA920 (2020+)
// CAN Bus: 500 kbps, 11-bit standard IDs
// Diagnostic: UDS over CAN, ECM at 0x7E0, Cluster at 0x720, DESS at 0x621

export const CANAM_EXTENDED_PIDS: PIDDefinition[] = [
  // ── Engine Core ──
  {
    pid: 0x2000, name: 'Engine RPM', shortName: 'RPM_CA',
    unit: 'rpm', min: 0, max: 9000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2001, name: 'Engine Coolant Temperature', shortName: 'ECT_CA',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2002, name: 'Intake Air Temperature', shortName: 'IAT_CA',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2003, name: 'Throttle Position', shortName: 'TPS_CA',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2004, name: 'Manifold Air Pressure', shortName: 'MAP_CA',
    unit: 'kPa', min: 0, max: 400, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2005, name: 'Vehicle Speed', shortName: 'VSS_CA',
    unit: 'mph', min: 0, max: 160, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01 * 0.621371,  // km/h to mph
    ecuHeader: '7E0',
  },
  {
    pid: 0x2006, name: 'Engine Load', shortName: 'LOAD_CA',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  // ── Fuel System ──
  {
    pid: 0x2010, name: 'Fuel Pressure', shortName: 'FP_CA',
    unit: 'psi', min: 0, max: 100, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 * 0.145038,  // kPa to psi
    ecuHeader: '7E0',
  },
  {
    pid: 0x2011, name: 'Fuel Injection Duration', shortName: 'INJ_DUR_CA',
    unit: 'ms', min: 0, max: 30, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2012, name: 'Fuel Level', shortName: 'FUEL_LVL_CA',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2013, name: 'Lambda / AFR', shortName: 'LAMBDA_CA',
    unit: 'λ', min: 0.5, max: 2.0, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.0001,
    ecuHeader: '7E0',
  },
  // ── Oil System ──
  {
    pid: 0x2020, name: 'Oil Temperature', shortName: 'OIL_T_CA',
    unit: '°F', min: -40, max: 350, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2021, name: 'Oil Pressure', shortName: 'OIL_P_CA',
    unit: 'psi', min: 0, max: 100, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.145038,  // kPa to psi
    ecuHeader: '7E0',
  },
  // ── Turbo / Boost (Maverick X3 Turbo models) ──
  {
    pid: 0x2030, name: 'Boost Pressure', shortName: 'BOOST_CA',
    unit: 'psi', min: -14.7, max: 30, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 101.325) * 0.145038,  // kPa abs to psig
    ecuHeader: '7E0',
  },
  {
    pid: 0x2031, name: 'Charge Air Temperature', shortName: 'CAT_CA',
    unit: '°F', min: -40, max: 400, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2032, name: 'Exhaust Gas Temperature', shortName: 'EGT_CA',
    unit: '°F', min: 0, max: 2000, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2033, name: 'Wastegate Duty Cycle', shortName: 'WG_DC_CA',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'turbo',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  // ── Ignition / Timing ──
  {
    pid: 0x2040, name: 'Ignition Timing Advance', shortName: 'IGN_ADV_CA',
    unit: '°BTDC', min: -20, max: 60, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2041, name: 'Knock Retard', shortName: 'KNK_RET_CA',
    unit: '°', min: 0, max: 20, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a * 0.25,
    ecuHeader: '7E0',
  },
  // ── Electrical / DESS ──
  {
    pid: 0x2050, name: 'Battery Voltage', shortName: 'VBAT_CA',
    unit: 'V', min: 0, max: 18, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2051, name: 'DESS Key Status', shortName: 'DESS_CA',
    unit: '', min: 0, max: 3, bytes: 1, service: 0x22, category: 'electrical',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=No key, 1=Valid key, 2=Invalid key, 3=Learning
    ecuHeader: '621',
  },
  {
    pid: 0x2052, name: 'Engine Hours', shortName: 'ENG_HRS_CA',
    unit: 'hrs', min: 0, max: 99999, bytes: 4, service: 0x22, category: 'other',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b, c, d]) => ((a << 24) | (b << 16) | (c << 8) | d) * 0.05,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2053, name: 'Odometer', shortName: 'ODO_CA',
    unit: 'mi', min: 0, max: 999999, bytes: 4, service: 0x22, category: 'other',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b, c, d]) => ((a << 24) | (b << 16) | (c << 8) | d) * 0.1 * 0.621371,
    ecuHeader: '720',
  },
  // ── CVT / Drivetrain ──
  {
    pid: 0x2060, name: 'CVT Belt Temperature (Est)', shortName: 'BELT_T_CA',
    unit: '°F', min: 0, max: 500, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2061, name: 'Gear Position', shortName: 'GEAR_CA',
    unit: '', min: 0, max: 6, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=P, 1=R, 2=N, 3=L, 4=H
    ecuHeader: '7E0',
  },
  {
    pid: 0x2062, name: 'Front Diff Lock Status', shortName: 'DIFF_LOCK_CA',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=Unlocked, 1=Locked
    ecuHeader: '7E0',
  },
  // ── Ambient / Misc ──
  {
    pid: 0x2070, name: 'Ambient Temperature', shortName: 'AMB_T_CA',
    unit: '°F', min: -40, max: 150, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'canam', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Sea-Doo / BRP Marine (Rotax 4-TEC) — RXP, GTX, Fish Pro, Spark
// ═══════════════════════════════════════════════════════════════════════════
// ECU: Bosch MED17 / Continental, Rotax 4-TEC 900/1500/1630
// CAN Bus: 250 kbps (NMEA 2000 overlay) + 500 kbps internal
// Supercharged models: 230/300 HP with intercooler

export const SEADOO_EXTENDED_PIDS: PIDDefinition[] = [
  // ── Engine Core ──
  {
    pid: 0x2500, name: 'Engine RPM', shortName: 'RPM_SD',
    unit: 'rpm', min: 0, max: 9000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2501, name: 'Engine Coolant Temperature', shortName: 'ECT_SD',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2502, name: 'Intake Air Temperature', shortName: 'IAT_SD',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2503, name: 'Throttle Position', shortName: 'TPS_SD',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2504, name: 'GPS Speed', shortName: 'GPS_SPD_SD',
    unit: 'mph', min: 0, max: 100, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01 * 0.621371,
    ecuHeader: '720',
  },
  {
    pid: 0x2505, name: 'Engine Load', shortName: 'LOAD_SD',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  // ── Supercharger / Boost ──
  {
    pid: 0x2510, name: 'Supercharger Boost Pressure', shortName: 'SC_BOOST_SD',
    unit: 'psi', min: -14.7, max: 25, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 101.325) * 0.145038,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2511, name: 'Intercooler Temperature', shortName: 'IC_TEMP_SD',
    unit: '°F', min: -40, max: 300, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2512, name: 'Exhaust Temperature', shortName: 'EXH_T_SD',
    unit: '°F', min: 0, max: 2000, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2513, name: 'Manifold Air Pressure', shortName: 'MAP_SD',
    unit: 'kPa', min: 0, max: 400, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  // ── Oil System ──
  {
    pid: 0x2520, name: 'Oil Temperature', shortName: 'OIL_T_SD',
    unit: '°F', min: -40, max: 350, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2521, name: 'Oil Pressure', shortName: 'OIL_P_SD',
    unit: 'psi', min: 0, max: 100, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.145038,
    ecuHeader: '7E0',
  },
  // ── Impeller / Jet Drive ──
  {
    pid: 0x2530, name: 'Impeller RPM', shortName: 'IMP_RPM_SD',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'transmission',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => (a * 256) + b,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2531, name: 'Ride Plate Position', shortName: 'RIDE_POS_SD',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '720',
  },
  {
    pid: 0x2532, name: 'Trim Position', shortName: 'TRIM_SD',
    unit: '°', min: -10, max: 10, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '720',
  },
  // ── Electrical / Fuel ──
  {
    pid: 0x2540, name: 'Battery Voltage', shortName: 'VBAT_SD',
    unit: 'V', min: 0, max: 18, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2541, name: 'Fuel Level', shortName: 'FUEL_LVL_SD',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '720',
  },
  {
    pid: 0x2542, name: 'Engine Hours', shortName: 'ENG_HRS_SD',
    unit: 'hrs', min: 0, max: 99999, bytes: 4, service: 0x22, category: 'other',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b, c, d]) => ((a << 24) | (b << 16) | (c << 8) | d) * 0.05,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2543, name: 'Ambient Temperature', shortName: 'AMB_T_SD',
    unit: '°F', min: -40, max: 150, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  // ── Fuel System ──
  {
    pid: 0x2550, name: 'Fuel Pressure', shortName: 'FP_SD',
    unit: 'psi', min: 0, max: 100, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 * 0.145038,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2551, name: 'Fuel Injection Duration', shortName: 'INJ_DUR_SD',
    unit: 'ms', min: 0, max: 30, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2552, name: 'Ignition Timing', shortName: 'IGN_ADV_SD',
    unit: '°BTDC', min: -20, max: 60, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'seadoo', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7E0',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Polaris — RZR, Ranger, Sportsman, General, Scrambler
// ═══════════════════════════════════════════════════════════════════════════
// ECU: Delphi / Continental, proprietary CAN protocol
// CAN Bus: 500 kbps, Delphi 8-pin GT150 connector
// Supported: RZR RS1, RZR XP 1000, RZR XP Turbo, RZR PRO, Ranger, General

export const POLARIS_EXTENDED_PIDS: PIDDefinition[] = [
  // ── Engine Core ──
  {
    pid: 0x2200, name: 'Engine RPM', shortName: 'RPM_POL',
    unit: 'rpm', min: 0, max: 10000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2201, name: 'Water Temperature', shortName: 'ECT_POL',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2202, name: 'Intake Air Temperature', shortName: 'IAT_POL',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2203, name: 'Throttle Position', shortName: 'TPS_POL',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2204, name: 'Vehicle Speed', shortName: 'VSS_POL',
    unit: 'mph', min: 0, max: 120, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01 * 0.621371,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2205, name: 'Engine Load', shortName: 'LOAD_POL',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2206, name: 'Gear Position', shortName: 'GEAR_POL',
    unit: '', min: 0, max: 6, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=P, 1=R, 2=N, 3=L, 4=H
    ecuHeader: '7E0',
  },
  // ── Turbo / Boost (XP Turbo, Pro XP Turbo) ──
  {
    pid: 0x2210, name: 'Boost Pressure', shortName: 'BOOST_POL',
    unit: 'psi', min: -14.7, max: 25, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 101.325) * 0.145038,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2211, name: 'Charge Air Temperature', shortName: 'CAT_POL',
    unit: '°F', min: -40, max: 400, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2212, name: 'Manifold Air Pressure', shortName: 'MAP_POL',
    unit: 'kPa', min: 0, max: 400, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2213, name: 'Barometric Pressure', shortName: 'BARO_POL',
    unit: 'kPa', min: 50, max: 110, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  // ── Fuel System ──
  {
    pid: 0x2220, name: 'Fuel Level', shortName: 'FUEL_LVL_POL',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'fuel',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2221, name: 'Fuel Rate', shortName: 'FUEL_RATE_POL',
    unit: 'gal/h', min: 0, max: 20, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.05 * 0.264172,  // L/h to gal/h
    ecuHeader: '7E0',
  },
  {
    pid: 0x2222, name: 'Fuel Economy', shortName: 'MPG_POL',
    unit: 'mpg', min: 0, max: 50, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  // ── EPS (Electronic Power Steering) ──
  {
    pid: 0x2230, name: 'EPS Temperature', shortName: 'EPS_T_POL',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2231, name: 'EPS Steering Rate', shortName: 'EPS_RATE_POL',
    unit: '°/s', min: -500, max: 500, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.1,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2232, name: 'EPS Input Torque', shortName: 'EPS_IN_POL',
    unit: 'Nm', min: -50, max: 50, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2233, name: 'EPS Output Torque', shortName: 'EPS_OUT_POL',
    unit: 'Nm', min: -100, max: 100, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2234, name: 'EPS Current', shortName: 'EPS_A_POL',
    unit: 'A', min: 0, max: 100, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  // ── AWD / Drivetrain ──
  {
    pid: 0x2240, name: 'Front Drive Active (AWD)', shortName: 'AWD_POL',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=2WD, 1=AWD Active
    ecuHeader: '7E0',
  },
  {
    pid: 0x2241, name: 'Brake Switch', shortName: 'BRK_SW_POL',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=Released, 1=Applied
    ecuHeader: '7E0',
  },
  {
    pid: 0x2242, name: 'Seat Belt Status', shortName: 'BELT_POL',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=Unbuckled, 1=Buckled
    ecuHeader: '7E0',
  },
  // ── Electrical ──
  {
    pid: 0x2250, name: 'Battery Voltage', shortName: 'VBAT_POL',
    unit: 'V', min: 0, max: 18, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2251, name: 'MIL Status', shortName: 'MIL_POL',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=Off, 1=On
    ecuHeader: '7E0',
  },
  {
    pid: 0x2252, name: 'Odometer', shortName: 'ODO_POL',
    unit: 'mi', min: 0, max: 999999, bytes: 4, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b, c, d]) => ((a << 24) | (b << 16) | (c << 8) | d) * 0.1 * 0.621371,
    ecuHeader: '720',
  },
  {
    pid: 0x2253, name: 'Trip Odometer', shortName: 'TRIP_POL',
    unit: 'mi', min: 0, max: 9999, bytes: 4, service: 0x22, category: 'other',
    manufacturer: 'polaris', fuelType: 'gasoline',
    formula: ([a, b, c, d]) => ((a << 24) | (b << 16) | (c << 8) | d) * 0.1 * 0.621371,
    ecuHeader: '720',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Kawasaki — Ninja, Z-series, Versys, KFX, Teryx, Mule
// ═══════════════════════════════════════════════════════════════════════════
// ECU: Denso / Keihin, KDS (Kawasaki Diagnostic System) over CAN
// CAN Bus: 500 kbps, 6-pin diagnostic connector (CAN models)
// Motorcycles: Ninja ZX-10R, Z900, Versys 650, etc.
// ATV/UTV: KFX 450R, Teryx, Mule Pro

export const KAWASAKI_EXTENDED_PIDS: PIDDefinition[] = [
  // ── Engine Core ──
  {
    pid: 0x2300, name: 'Engine RPM', shortName: 'RPM_KW',
    unit: 'rpm', min: 0, max: 16000, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.25,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2301, name: 'Engine Coolant Temperature', shortName: 'ECT_KW',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2302, name: 'Intake Air Temperature', shortName: 'IAT_KW',
    unit: '°F', min: -40, max: 300, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => (a - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2303, name: 'Throttle Position', shortName: 'TPS_KW',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2304, name: 'Vehicle Speed', shortName: 'VSS_KW',
    unit: 'mph', min: 0, max: 200, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01 * 0.621371,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2305, name: 'Engine Load', shortName: 'LOAD_KW',
    unit: '%', min: 0, max: 100, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => a * 100 / 255,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2306, name: 'Manifold Air Pressure', shortName: 'MAP_KW',
    unit: 'kPa', min: 0, max: 400, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1,
    ecuHeader: '7E0',
  },
  // ── Fuel System ──
  {
    pid: 0x2310, name: 'Fuel Injection Duration', shortName: 'INJ_DUR_KW',
    unit: 'ms', min: 0, max: 30, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.001,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2311, name: 'Ignition Timing Advance', shortName: 'IGN_ADV_KW',
    unit: '°BTDC', min: -20, max: 60, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2312, name: 'Fuel Pressure', shortName: 'FP_KW',
    unit: 'psi', min: 0, max: 100, bytes: 2, service: 0x22, category: 'fuel',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.1 * 0.145038,
    ecuHeader: '7E0',
  },
  // ── Gear / Transmission ──
  {
    pid: 0x2320, name: 'Gear Position', shortName: 'GEAR_KW',
    unit: '', min: 0, max: 6, bytes: 1, service: 0x22, category: 'transmission',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=N, 1-6=Gears
    ecuHeader: '7E0',
  },
  {
    pid: 0x2321, name: 'Lean Angle', shortName: 'LEAN_KW',
    unit: '°', min: -70, max: 70, bytes: 2, service: 0x22, category: 'other',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) - 32768) * 0.01,
    ecuHeader: '7E0',
  },
  // ── Oil System ──
  {
    pid: 0x2330, name: 'Oil Temperature', shortName: 'OIL_T_KW',
    unit: '°F', min: -40, max: 350, bytes: 2, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2331, name: 'Oil Pressure Switch', shortName: 'OIL_SW_KW',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'engine',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=Low, 1=OK
    ecuHeader: '7E0',
  },
  // ── Electrical / Switches ──
  {
    pid: 0x2340, name: 'Battery Voltage', shortName: 'VBAT_KW',
    unit: 'V', min: 0, max: 18, bytes: 2, service: 0x22, category: 'electrical',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => ((a * 256) + b) * 0.01,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2341, name: 'Side Stand Switch', shortName: 'STAND_KW',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=Up, 1=Down
    ecuHeader: '7E0',
  },
  {
    pid: 0x2342, name: 'Clutch Switch', shortName: 'CLUTCH_KW',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=Released, 1=Pulled
    ecuHeader: '7E0',
  },
  {
    pid: 0x2343, name: 'Neutral Switch', shortName: 'NEUTRAL_KW',
    unit: '', min: 0, max: 1, bytes: 1, service: 0x22, category: 'other',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a]) => a,  // 0=In gear, 1=Neutral
    ecuHeader: '7E0',
  },
  // ── Supercharger (ZX-10R SE, H2, etc.) ──
  {
    pid: 0x2350, name: 'Boost Pressure', shortName: 'BOOST_KW',
    unit: 'psi', min: -14.7, max: 20, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 101.325) * 0.145038,
    ecuHeader: '7E0',
  },
  {
    pid: 0x2351, name: 'Charge Air Temperature', shortName: 'CAT_KW',
    unit: '°F', min: -40, max: 400, bytes: 2, service: 0x22, category: 'turbo',
    manufacturer: 'kawasaki', fuelType: 'gasoline',
    formula: ([a, b]) => (((a * 256) + b) * 0.1 - 40) * 9 / 5 + 32,
    ecuHeader: '7E0',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Powersports PID Presets
// ═══════════════════════════════════════════════════════════════════════════

export const POWERSPORTS_PRESETS: PIDPreset[] = [
  // ── CAN-am Presets ──
  {
    name: 'CAN-am Engine Monitor',
    description: 'RPM, ECT, IAT, TPS, Load, Oil Temp, Battery',
    pids: [0x2000, 0x2001, 0x2002, 0x2003, 0x2006, 0x2020, 0x2050],
  },
  {
    name: 'CAN-am Turbo Performance',
    description: 'RPM, Boost, Charge Air Temp, EGT, Wastegate, TPS, Speed',
    pids: [0x2000, 0x2030, 0x2031, 0x2032, 0x2033, 0x2003, 0x2005],
  },
  {
    name: 'CAN-am Fuel & Ignition',
    description: 'RPM, Fuel Pressure, Inj Duration, Lambda, Timing, Knock',
    pids: [0x2000, 0x2010, 0x2011, 0x2013, 0x2040, 0x2041],
  },
  {
    name: 'CAN-am Trail Ride',
    description: 'Speed, RPM, ECT, Belt Temp, Gear, Diff Lock, Fuel Level',
    pids: [0x2005, 0x2000, 0x2001, 0x2060, 0x2061, 0x2062, 0x2012],
  },
  {
    name: 'CAN-am DESS & Electrical',
    description: 'DESS Key Status, Battery, Engine Hours, Odometer',
    pids: [0x2051, 0x2050, 0x2052, 0x2053],
  },
  // ── Sea-Doo Presets ──
  {
    name: 'Sea-Doo Engine Monitor',
    description: 'RPM, ECT, IAT, TPS, Load, Oil Temp, Battery',
    pids: [0x2100, 0x2101, 0x2102, 0x2103, 0x2105, 0x2120, 0x2140],
  },
  {
    name: 'Sea-Doo Supercharger',
    description: 'RPM, SC Boost, Intercooler Temp, Exhaust Temp, MAP, TPS',
    pids: [0x2100, 0x2110, 0x2111, 0x2112, 0x2113, 0x2103],
  },
  {
    name: 'Sea-Doo Jet Drive',
    description: 'RPM, Impeller RPM, GPS Speed, Trim, Ride Plate, Throttle',
    pids: [0x2100, 0x2130, 0x2104, 0x2132, 0x2131, 0x2103],
  },
  {
    name: 'Sea-Doo Fuel & Ignition',
    description: 'RPM, Fuel Pressure, Inj Duration, Timing, Fuel Level',
    pids: [0x2100, 0x2150, 0x2151, 0x2152, 0x2141],
  },
  // ── Polaris Presets ──
  {
    name: 'Polaris Engine Monitor',
    description: 'RPM, Water Temp, IAT, TPS, Load, Battery, Fuel Level',
    pids: [0x2200, 0x2201, 0x2202, 0x2203, 0x2205, 0x2250, 0x2220],
  },
  {
    name: 'Polaris Turbo Performance',
    description: 'RPM, Boost, Charge Air Temp, MAP, Baro, TPS, Speed',
    pids: [0x2200, 0x2210, 0x2211, 0x2212, 0x2213, 0x2203, 0x2204],
  },
  {
    name: 'Polaris Trail Ride',
    description: 'Speed, RPM, Water Temp, Gear, AWD, Fuel Level, Fuel Economy',
    pids: [0x2204, 0x2200, 0x2201, 0x2206, 0x2240, 0x2220, 0x2222],
  },
  {
    name: 'Polaris EPS Monitor',
    description: 'EPS Temp, Steering Rate, Input/Output Torque, EPS Current',
    pids: [0x2230, 0x2231, 0x2232, 0x2233, 0x2234],
  },
  // ── Kawasaki Presets ──
  {
    name: 'Kawasaki Engine Monitor',
    description: 'RPM, ECT, IAT, TPS, Load, Oil Temp, Battery',
    pids: [0x2300, 0x2301, 0x2302, 0x2303, 0x2305, 0x2330, 0x2340],
  },
  {
    name: 'Kawasaki Sport Ride',
    description: 'RPM, Speed, Gear, Lean Angle, TPS, Timing, Fuel Pressure',
    pids: [0x2300, 0x2304, 0x2320, 0x2321, 0x2303, 0x2311, 0x2312],
  },
  {
    name: 'Kawasaki H2 Supercharger',
    description: 'RPM, Boost, Charge Air Temp, MAP, TPS, Timing, Speed',
    pids: [0x2300, 0x2350, 0x2351, 0x2306, 0x2303, 0x2311, 0x2304],
  },
  {
    name: 'Kawasaki Safety Switches',
    description: 'Side Stand, Clutch, Neutral, Gear, Oil Pressure, Battery',
    pids: [0x2341, 0x2342, 0x2343, 0x2320, 0x2331, 0x2340],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Powersports VIN WMI Codes for Auto-Detection
// ═══════════════════════════════════════════════════════════════════════════

export type PowersportsManufacturer = 'canam' | 'seadoo' | 'polaris' | 'kawasaki';

export interface PowersportsWMI {
  wmi: string;
  manufacturer: PowersportsManufacturer;
  brand: string;
  type: string;  // 'atv' | 'utv' | 'motorcycle' | 'pwc' (personal watercraft)
}

export const POWERSPORTS_WMI_CODES: PowersportsWMI[] = [
  // ── BRP / CAN-am ──
  { wmi: '3JB', manufacturer: 'canam', brand: 'CAN-am', type: 'atv' },
  { wmi: '3JB', manufacturer: 'canam', brand: 'CAN-am', type: 'utv' },
  { wmi: '2BP', manufacturer: 'canam', brand: 'CAN-am', type: 'utv' },
  { wmi: '2BV', manufacturer: 'canam', brand: 'CAN-am', type: 'atv' },
  { wmi: '2BU', manufacturer: 'canam', brand: 'CAN-am', type: 'utv' },
  // ── BRP / Sea-Doo ──
  { wmi: 'YDV', manufacturer: 'seadoo', brand: 'Sea-Doo', type: 'pwc' },
  { wmi: 'YDV', manufacturer: 'seadoo', brand: 'Sea-Doo', type: 'pwc' },
  { wmi: 'CA0', manufacturer: 'seadoo', brand: 'Sea-Doo', type: 'pwc' },
  // ── Polaris ──
  { wmi: '4XA', manufacturer: 'polaris', brand: 'Polaris', type: 'atv' },
  { wmi: '4XA', manufacturer: 'polaris', brand: 'Polaris', type: 'utv' },
  { wmi: '4XAT', manufacturer: 'polaris', brand: 'Polaris RZR', type: 'utv' },
  { wmi: '4XAR', manufacturer: 'polaris', brand: 'Polaris Ranger', type: 'utv' },
  { wmi: '4XAS', manufacturer: 'polaris', brand: 'Polaris Sportsman', type: 'atv' },
  { wmi: '3NS', manufacturer: 'polaris', brand: 'Polaris', type: 'utv' },
  // ── Kawasaki ──
  { wmi: 'JKA', manufacturer: 'kawasaki', brand: 'Kawasaki', type: 'motorcycle' },
  { wmi: 'JKB', manufacturer: 'kawasaki', brand: 'Kawasaki', type: 'atv' },
  { wmi: 'JKA', manufacturer: 'kawasaki', brand: 'Kawasaki', type: 'motorcycle' },
  { wmi: 'JSK', manufacturer: 'kawasaki', brand: 'Kawasaki', type: 'pwc' },
];

/**
 * Detect powersports manufacturer from VIN
 */
export function detectPowersportsFromVin(vin: string): PowersportsWMI | null {
  if (!vin || vin.length < 3) return null;
  const wmi3 = vin.substring(0, 3).toUpperCase();
  const wmi4 = vin.substring(0, 4).toUpperCase();

  // Try 4-char match first (more specific)
  const match4 = POWERSPORTS_WMI_CODES.find(w => w.wmi === wmi4);
  if (match4) return match4;

  // Fall back to 3-char
  const match3 = POWERSPORTS_WMI_CODES.find(w => w.wmi === wmi3);
  return match3 || null;
}

/**
 * Get all PIDs for a powersports manufacturer
 */
export function getPowersportsPids(manufacturer: PowersportsManufacturer): PIDDefinition[] {
  switch (manufacturer) {
    case 'canam': return CANAM_EXTENDED_PIDS;
    case 'seadoo': return SEADOO_EXTENDED_PIDS;
    case 'polaris': return POLARIS_EXTENDED_PIDS;
    case 'kawasaki': return KAWASAKI_EXTENDED_PIDS;
    default: return [];
  }
}

/**
 * Get all powersports PIDs combined
 */
export function getAllPowersportsPids(): PIDDefinition[] {
  return [
    ...CANAM_EXTENDED_PIDS,
    ...SEADOO_EXTENDED_PIDS,
    ...POLARIS_EXTENDED_PIDS,
    ...KAWASAKI_EXTENDED_PIDS,
  ];
}

/**
 * Get presets for a powersports manufacturer
 */
export function getPowersportsPresets(manufacturer: PowersportsManufacturer): PIDPreset[] {
  const prefix = {
    canam: 'CAN-am',
    seadoo: 'Sea-Doo',
    polaris: 'Polaris',
    kawasaki: 'Kawasaki',
  }[manufacturer];
  return POWERSPORTS_PRESETS.filter(p => p.name.startsWith(prefix));
}
