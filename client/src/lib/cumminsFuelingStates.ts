/**
 * Cummins Fueling Control States / Combustion Control Path Owners
 *
 * Source: Cummins HDD Controls — CumminsFuelingControlStates.docx
 * Contact: Russ Poling Sr, HDD Controls
 *
 * Applies to Cummins Heavy Duty Automotive Engines built starting January 2004.
 *
 * Calterm PID names:
 *   - FSFNFLST (pre-EGR, Core 1)
 *   - FUELING_CONTROL_STATE (EGR, Core 1)
 *   - COMBUSTION_CONTROL_PATH_OWNER (2007+, Core 2)
 *
 * Datalog PID: ECM.FUELCTRL_F
 *
 * The current value indicates the current winning governor or controlling limit.
 * Can be used to troubleshoot performance complaints and identify derates.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type FuelingStateGeneration = 'core1' | 'core2' | 'all';
export type FuelingStateSeverity = 'normal' | 'info' | 'warning' | 'derate' | 'critical';

export interface CumminsFuelingState {
  code: number;
  name: string;
  shortName: string;
  description: string;
  severity: FuelingStateSeverity;
  generation: FuelingStateGeneration;
  /** Year range when this state was introduced */
  introduced: string;
  /** Whether this state is commonly seen in normal operation */
  normalOperation: boolean;
  /** Troubleshooting notes for technicians */
  troubleshooting?: string;
  /** Related fault codes that may accompany this state */
  relatedFaultCodes?: string[];
  /** Whether this state is deprecated / not used since a certain year */
  deprecated?: string;
}

// ─── Fueling Control State Database ──────────────────────────────────────────

export const CUMMINS_FUELING_STATES: CumminsFuelingState[] = [
  {
    code: 1,
    name: 'JCOMM Torque State',
    shortName: 'JCOMM Torque',
    description: 'Engine torque has been limited or altered by an external device (typically a transmission). Typically seen with automated manual (Autoshift, SureShift, Ultrashift, Ultrashift Plus) or fully automatic transmissions at shift points.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during transmission shifts. If sustained outside of shifts, check J1939 communication with transmission controller.',
  },
  {
    code: 2,
    name: 'JCOMM Speed State',
    shortName: 'JCOMM Speed',
    description: 'Engine speed has been limited or altered by an external device (typically transmission). Typically seen with automated manual (Autoshift, SureShift, Ultrashift, Ultrashift Plus) or fully automatic transmissions at shift points.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during transmission shifts. If sustained, check J1939 communication.',
  },
  {
    code: 3,
    name: 'Progressive Shift Speed',
    shortName: 'Prog Shift',
    description: 'Progressive shift speed control. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 4,
    name: 'PTO State',
    shortName: 'PTO',
    description: 'PTO (Power Take-Off) governor is controlling the engine. PTO is engaged and managing engine speed.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal when PTO is engaged. If seen unexpectedly, check PTO switch and wiring.',
  },
  {
    code: 5,
    name: 'User Command State',
    shortName: 'User Cmd',
    description: 'Indicated that fueling was being overridden. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 6,
    name: 'Limp Home Torque',
    shortName: 'Limp Home',
    description: 'Accelerator pedal problems have forced control system into Limp Home state. Torque is limited but enough torque should be available to "limp" the vehicle to a repair shop or off the roadway.',
    severity: 'critical',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check accelerator pedal position sensor (APPS). Verify pedal wiring harness. Check for related fault codes. Vehicle should be taken to service shop.',
    relatedFaultCodes: ['FC 2185', 'FC 2186', 'FC 2187'],
  },
  {
    code: 7,
    name: 'ASG Governor State',
    shortName: 'ASG Gov',
    description: 'Variable Speed Governor must be selected. Typically seen during part load/part throttle condition leading up to max throttle conditions.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during part-throttle operation with Variable Speed Governor selected.',
  },
  {
    code: 8,
    name: '4-D (Automotive) Governor State',
    shortName: '4-D Gov',
    description: 'Typically seen during part load/part throttle condition leading up to max throttle conditions. On some products at full load, fueling state will fluctuate between 8 and 19 (Maximum Throttle).',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during part-throttle driving. Fluctuation between 8 and 19 at full load is expected on some applications.',
  },
  {
    code: 9,
    name: 'Cruise Control State',
    shortName: 'Cruise',
    description: 'Cruise control is active and cruise control is the winning governor. Note: Other governors can be the winner even though Cruise is active.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal when cruise control is engaged. If cruise disengages unexpectedly, check brake switch, clutch switch, and vehicle speed signal.',
  },
  {
    code: 10,
    name: 'Road Speed Governor State',
    shortName: 'RSG',
    description: 'Road speed is being limited by Max Road Speed Trim or one of several road speed limiters (e.g., Gear Down Protection, Driver Reward). A max vehicle speed must be set as a parameter in INSITE.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal when vehicle reaches programmed speed limit. Check INSITE parameters if limit is incorrect.',
  },
  {
    code: 11,
    name: 'Low Speed Governor State',
    shortName: 'LSG / Idle',
    description: 'This is the normal state at idle condition. May also be seen while motoring (engine braking with zero fueling).',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal at idle. If idle is unstable while in this state, check for air leaks, injector issues, or sensor problems.',
  },
  {
    code: 12,
    name: 'High Speed Governor State',
    shortName: 'HSG',
    description: 'Normal state at high speed conditions (typically fueling is being reduced when on HSG). Engine will typically go on HSG state approximately 100-200 RPM below rated speed. Prematurely hitting HSG state can be an indication of other issues (acceleration noise control, etc.).',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal near rated speed. If HSG activates prematurely (well below rated speed), check for acceleration noise control interference, turbo issues, or incorrect calibration.',
  },
  {
    code: 13,
    name: 'Torque Derate Override',
    shortName: 'Torque Override',
    description: 'Torque derate override. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 14,
    name: 'Low Gear State',
    shortName: 'Low Gear',
    description: 'Low gear state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 15,
    name: 'Altitude Derate / Turbo Overspeed',
    shortName: 'Alt Derate',
    description: 'Pre-2007: Altitude Derate — fueling is limited to a set value less than maximum fueling, can be caused by high altitude operation. 2007+: Turbo Overspeed — fueling limited to protect turbocharger from excessive speed.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'If at high altitude, this is expected. At normal altitude, check turbo speed sensor, wastegate, and VGT actuator.',
    relatedFaultCodes: ['FC 2346'],
  },
  {
    code: 16,
    name: 'AFC Derate / OFC Derate',
    shortName: 'AFC/OFC',
    description: 'Pre-2007: AFC (Air/Fuel Command) Derate. 2007+: OFC (Oxygen Fuel Control) Derate. Fuel limited for amount of intake air — not enough boost for commanded fueling, or too much boost (inoperable wastegates). Pre-2007: briefly seen on acceleration is normal; extended periods indicate issues. 2010+: a few seconds of OFC during hard accelerations is normal.',
    severity: 'warning',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Brief occurrence during hard acceleration is normal (especially 2010+). Extended AFC/OFC indicates: turbo lag, boost leak, plugged air filter, faulty wastegate, VGT actuator failure, or intake restriction. Check boost pressure vs. target.',
    relatedFaultCodes: ['FC 2346', 'FC 1963'],
  },
  {
    code: 17,
    name: 'Acceleration Noise Control',
    shortName: 'Accel Noise',
    description: 'Fueling/torque is being limited in order to reduce drive-by noise. The ECM intentionally limits fueling rate to reduce combustion noise during acceleration.',
    severity: 'info',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal emissions/noise compliance feature. If causing performance complaints, calibration adjustment may be needed.',
  },
  {
    code: 18,
    name: 'Engine Protection Speed Derate',
    shortName: 'EP Speed',
    description: 'Engine Protection System is asking for speed derate due to a malfunction. The ECM is reducing engine speed to protect the engine from damage.',
    severity: 'critical',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check for active engine protection faults: low oil pressure, high coolant temp, high intake manifold temp, low coolant level. Address the root cause immediately.',
    relatedFaultCodes: ['FC 415', 'FC 111', 'FC 151'],
  },
  {
    code: 19,
    name: 'Maximum Throttle / Torque Curve State',
    shortName: 'Max Throttle',
    description: 'Pre-2007: Maximum Throttle. 2007+: Torque Curve State. Normal state for maximum throttle/max load condition (on torque curve). This is where peak power is produced.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal at WOT/full load. If not reaching state 19 at full throttle, check APPS, turbo, fuel system.',
  },
  {
    code: 20,
    name: 'JCOMM Torque Derate',
    shortName: 'JCOMM Derate',
    description: 'Data link device (e.g., Automated Manual Transmission, ABS, Traction Control) has asked for a torque derate via J1939.',
    severity: 'warning',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check which J1939 device is requesting the derate. Common causes: ABS intervention, traction control, transmission protection. Check J1939 communication.',
  },
  {
    code: 21,
    name: 'Out of Gear Torque Limit',
    shortName: 'Out of Gear',
    description: 'Vehicle speed is above RSG limit and driver is attempting to shift gears. Provides just enough torque (~200 ft-lb) to allow engine speed to change for gear completion. Road Speed Governor will also be disabled for a short period. Typically seen while going down a grade.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during gear changes at high vehicle speed. If sustained, check transmission shift linkage and vehicle speed sensor.',
  },
  {
    code: 22,
    name: 'Cranking State',
    shortName: 'Cranking',
    description: 'Normal state during cranking of the engine. Some engines have a "jump start" portion — if the engine does not start after several seconds of cranking, commanded fueling is increased to assist in starting.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during engine start. If extended cranking, check fuel supply, air in fuel system, glow plugs/intake heater, compression.',
  },
  {
    code: 23,
    name: 'Fuel Override',
    shortName: 'Fuel Override',
    description: 'Used by Natural Gas engines to override fueling.',
    severity: 'info',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Only applicable to natural gas engines. Should not appear on diesel applications.',
  },
  {
    code: 24,
    name: 'Braking State',
    shortName: 'Braking',
    description: 'Normal state during active braking (retarder/exhaust brake) condition. Commanded fueling is 0 during this state.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during engine braking. If exhaust brake is not engaging, check exhaust brake solenoid, VGT actuator, and exhaust brake switch.',
  },
  {
    code: 25,
    name: 'Engine Overspeed',
    shortName: 'Overspeed',
    description: 'Control system has detected that engine speed is above the overspeed limit. Typically 2450 RPM on an ISX.',
    severity: 'critical',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Critical condition. Check for runaway engine condition, failed fuel shutoff, or turbo seal failure allowing oil into intake. Investigate immediately.',
  },
  {
    code: 26,
    name: 'Stop State',
    shortName: 'Stopped',
    description: 'Normal state once engine has shut down (0 RPM).',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
  },
  {
    code: 27,
    name: 'Shutdown State',
    shortName: 'Shutdown',
    description: 'Engine has been shut off but still reading RPM. Should switch to state 26 when engine speed reads 0 RPM.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Transient state during shutdown. If engine does not reach 0 RPM, check for diesel runaway or stuck injector.',
  },
  {
    code: 28,
    name: 'FSS Specific Derate',
    shortName: 'FSS Derate',
    description: 'Fuel System Specific controlled derate — fuel system software has detected a fuel system specific malfunction.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check for fuel system fault codes. Common causes: injector failure, fuel pressure regulator malfunction, fuel pump issues.',
  },
  {
    code: 29,
    name: 'EPD Torque Limit',
    shortName: 'EPD Torque',
    description: 'Torque derate due to an active engine protection fault (low oil pressure, high coolant temp, etc.).',
    severity: 'critical',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check engine protection system faults: oil pressure, coolant temp, intake temp, coolant level. Address root cause before clearing.',
    relatedFaultCodes: ['FC 415', 'FC 111', 'FC 151', 'FC 2346'],
  },
  {
    code: 30,
    name: 'ASG Application State',
    shortName: 'ASG App',
    description: 'ASG application state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 31,
    name: 'Alternate Torque State',
    shortName: 'Alt Torque',
    description: 'Alternate torque state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 32,
    name: 'MS Override State',
    shortName: 'MS Override',
    description: 'MS override state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 33,
    name: 'Engine Start Oil Limit',
    shortName: 'Start Oil',
    description: 'Prevents revving of engine until oil pressure has built up after start.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during cold start. If sustained, check oil level, oil pump, oil pressure sensor.',
  },
  {
    code: 34,
    name: 'PTO Torque Limit',
    shortName: 'PTO Torque',
    description: 'PTO governor is limiting engine torque based on PTO Torque Limit set in INSITE. PTO will ramp engine speed down at a rate of 250 RPM/sec by controlling torque.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal when PTO is active. Check INSITE PTO torque limit parameter if limit is incorrect.',
  },
  {
    code: 35,
    name: 'Torque Control State',
    shortName: 'Torque Ctrl',
    description: 'Torque control state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 36,
    name: 'Powertrain Protection Derate',
    shortName: 'PTP Derate',
    description: 'Powertrain protection is active and causing a derate. Can be normal for some applications with Allison automatic transmissions (requested by Allison). Inadvertently turning on powertrain protection and/or incorrect PTP settings can cause problems.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check if powertrain protection is intentionally enabled (Allison trans). If not, check PTP settings in INSITE. Verify transmission oil temp and pressure.',
  },
  {
    code: 37,
    name: 'Top 2 Transmission Shift State (Up)',
    shortName: 'Top2 Up',
    description: 'Top 2 upshift state. Cummins does not support Top 2 transmissions in 2007 and later products.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2007',
  },
  {
    code: 38,
    name: 'Top 2 Transmission Shift State (Down)',
    shortName: 'Top2 Down',
    description: 'Top 2 downshift state. Cummins does not support Top 2 transmissions in 2007 and later products.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2007',
  },
  {
    code: 39,
    name: 'Top 2 Transmission Shift State (Neutral)',
    shortName: 'Top2 Neutral',
    description: 'Top 2 neutral state. Cummins does not support Top 2 transmissions in 2007 and later products.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2007',
  },
  {
    code: 40,
    name: 'No Derate State',
    shortName: 'No Derate',
    description: 'No derate state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 41,
    name: 'Anti Theft',
    shortName: 'Anti Theft',
    description: 'Anti-theft algorithm is active. Engine operation is restricted.',
    severity: 'warning',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check anti-theft system. Verify correct key/fob. May need INSITE to reset anti-theft.',
  },
  {
    code: 42,
    name: 'Partial Throttle State',
    shortName: 'Part Throttle',
    description: 'Partial throttle state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 43,
    name: 'SS Ambient Derate State',
    shortName: 'SS Ambient',
    description: 'SS ambient derate state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 44,
    name: 'Transient Coolant Derate State',
    shortName: 'Coolant Derate',
    description: 'Transient coolant derate state. Not used since 2004.',
    severity: 'info',
    generation: 'core1',
    introduced: '2004',
    normalOperation: false,
    deprecated: '2004',
  },
  {
    code: 45,
    name: 'Vehicle Acceleration Management',
    shortName: 'VAM',
    description: 'Vehicle acceleration is being limited. Not typically used in North America HD applications. Commonly used to decrease noise or fuel consumption.',
    severity: 'info',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check if VAM is enabled in INSITE. Not typical for North America applications.',
  },
  {
    code: 46,
    name: 'Air Density Limit',
    shortName: 'Air Density',
    description: 'Derate to protect the turbocharger from excessive temperatures and turbocharger speed, typically due to high altitudes. Pre-2010: tracked via FC 1963 when >10% fueling derate. 2010+: FC 2346 (No Lamp) will indicate if this happens for long durations.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Expected at high altitude. At normal altitude, check turbo speed sensor, intake restriction, charge air cooler, and barometric pressure sensor.',
    relatedFaultCodes: ['FC 1963', 'FC 2346'],
  },
  {
    code: 47,
    name: 'Chi Fuel Limit',
    shortName: 'Chi Limit',
    description: 'Max allowed fuel for the CHI state you are in. CHI state is determined based on air density and operating mode. 2007+: could also indicate a torque limit.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check air density conditions, operating mode, and turbo performance. May indicate altitude-related fueling restriction.',
  },
  {
    code: 48,
    name: 'Turbo Fueling Control (TFC) Derate',
    shortName: 'TFC Derate',
    description: 'Fueling and torque is limited due to turbo overspeed. Turbo speed must be above the limit for 1 second. Derate will be active for 10 seconds following turbo speed falling below limit.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check turbo speed sensor, VGT actuator, wastegate. Inspect turbo for bearing wear or shaft play. Check for exhaust restriction.',
  },
  {
    code: 49,
    name: 'Gross Fuel Override',
    shortName: 'Gross Override',
    description: 'Gross fuel override active.',
    severity: 'warning',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
  },
  {
    code: 50,
    name: 'CHM Torque Limit',
    shortName: 'CHM Torque',
    description: 'CHM (Combustion Health Monitor) torque limit active.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
  },
  {
    code: 51,
    name: 'JCOMM PTP Derate',
    shortName: 'JCOMM PTP',
    description: 'J1939 device has asked for powertrain protection via J1939 data link.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check which J1939 device is requesting PTP. Common: Allison transmission requesting protection due to high trans temp or pressure.',
  },
  {
    code: 52,
    name: 'Auxiliary NDot / Limp Home Speed Limit',
    shortName: 'Aux NDot/Limp',
    description: 'Pre-2007: Auxiliary NDot. 2007+: Limp Home Speed Limit — occurs when accelerator pedal has failed.',
    severity: 'critical',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check accelerator pedal position sensor (APPS). Verify pedal wiring harness. Vehicle should be taken to service shop.',
    relatedFaultCodes: ['FC 2185', 'FC 2186'],
  },
  // ─── States 53-78: New for 2007 (Core 2) ──────────────────────────────────
  {
    code: 53,
    name: 'Dyno Operations',
    shortName: 'Dyno',
    description: 'Vehicle is being tested on a dynamometer. ECM is in dyno mode.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Normal during dyno testing. If seen on road, check INSITE dyno mode setting.',
  },
  {
    code: 54,
    name: 'VSS Diagnostics',
    shortName: 'VSS Diag',
    description: 'Vehicle Speed Signal Lost or Tamper faults are active.',
    severity: 'warning',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Check vehicle speed sensor, wiring, and ABS module communication. Check for VSS tamper fault codes.',
  },
  {
    code: 55,
    name: 'ESCC',
    shortName: 'ESCC',
    description: 'Engine Speed Cruise Control. Industrial applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 56,
    name: 'WPD (Cold Idle Adjust)',
    shortName: 'Cold Idle',
    description: 'If engine coolant temp is below one of two thresholds, engine speed is raised to one of two calibrated settings to warm up faster.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2007',
    normalOperation: true,
    troubleshooting: 'Normal during cold start. Idle speed will return to normal as coolant warms up.',
  },
  {
    code: 57,
    name: 'TSD (Turbo Speed Derate)',
    shortName: 'Turbo Speed',
    description: 'Turbo speed derate active. Fueling limited to protect turbocharger from excessive speed.',
    severity: 'derate',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Check turbo speed sensor, VGT actuator, and turbo bearing condition. May indicate turbo is overspeeding.',
  },
  {
    code: 58,
    name: 'EWP (Engine Warmup Protection)',
    shortName: 'Warmup Prot',
    description: 'Disables accelerator pedal torque request to give time for oil pressure to build up and prevent engine damage. Time limit is based on coolant temp — colder coolant means longer delay.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2007',
    normalOperation: true,
    troubleshooting: 'Normal during cold start. If excessively long, check coolant temp sensor and oil pressure.',
  },
  {
    code: 59,
    name: 'JCOMM Speed Limit',
    shortName: 'JCOMM Spd Lim',
    description: 'J1939 device has requested an engine speed limit.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Check which J1939 device is requesting the speed limit. Common: transmission controller during shift protection.',
  },
  {
    code: 60,
    name: 'Auxiliary Ndot',
    shortName: 'Aux Ndot',
    description: 'An auxiliary device is providing governor control. Typically seen on firetrucks.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 61,
    name: 'Fast Idle Warmup',
    shortName: 'Fast Idle',
    description: 'Engine speed has been raised to quickly warm up the engine. Midrange engines only.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2007',
    normalOperation: true,
  },
  {
    code: 62,
    name: 'Fast Idle Warmup Ramp',
    shortName: 'Fast Idle Ramp',
    description: 'Fast idle warmup is ramping up engine speed. Midrange engines only.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2007',
    normalOperation: true,
  },
  {
    code: 63,
    name: 'Alternator Failure Warning',
    shortName: 'Alt Failure',
    description: 'This feature has detected low battery voltage and has increased engine speed in order to increase alternator output.',
    severity: 'warning',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Check alternator output, belt tension, battery condition, and wiring. Low voltage may indicate alternator failure.',
  },
  {
    code: 65,
    name: 'Hot Idle Adjustment',
    shortName: 'Hot Idle',
    description: 'Raises idle speed if the engine is hot in order to cool the engine. New for 2010 and later.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2010',
    normalOperation: true,
    troubleshooting: 'Normal when engine is overheating. If frequent, check cooling system: radiator, fan clutch, coolant level, thermostat.',
  },
  {
    code: 66,
    name: 'Regen',
    shortName: 'DPF Regen',
    description: 'DPF regeneration in progress. 2007 engines: idle speed increased to 1100 RPM. 2010 and 2013 engines: idle speed increased to 900 RPM.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2007',
    normalOperation: true,
    troubleshooting: 'Normal during DPF regeneration. If regen is too frequent, check DPF soot loading, injector health, and driving patterns.',
  },
  {
    code: 67,
    name: 'RTD',
    shortName: 'RTD',
    description: 'RTD state. PowerGen applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 68,
    name: 'IRD',
    shortName: 'IRD',
    description: 'IRD state. PowerGen applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 69,
    name: 'Load Based Speed Control',
    shortName: 'LBSC',
    description: 'Feature is limiting engine speed to decrease drive-by noise. Also used to increase fuel economy. Effectively lowers the HSG limit.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: true,
    troubleshooting: 'Normal noise/efficiency feature. If causing performance complaints, check LBSC calibration settings.',
  },
  {
    code: 70,
    name: 'XSC — Auxiliary Speed Control',
    shortName: 'XSC',
    description: 'Auxiliary speed control. Industrial applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 71,
    name: 'XPC — Auxiliary Pressure Control',
    shortName: 'XPC',
    description: 'Auxiliary pressure control. Industrial applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 72,
    name: 'CACLK',
    shortName: 'CACLK',
    description: 'CACLK state. New for 2013.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 73,
    name: 'Torque Rate Limiting',
    shortName: 'Torque Rate',
    description: 'Torque is limited to allow slack in driveline to be taken up. Prevents driveline shock during sudden throttle application.',
    severity: 'normal',
    generation: 'all',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal during sudden throttle changes. Protects driveline components.',
  },
  {
    code: 74,
    name: 'On Board Diagnostics',
    shortName: 'OBD',
    description: 'On-board diagnostics system is controlling fueling for emissions testing or diagnostic purposes.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 75,
    name: 'JCOMM MEO',
    shortName: 'JCOMM MEO',
    description: 'JCOMM Momentary Engine speed Override — J1939 transmission is overriding engine speed.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Normal during automated transmission operations. If sustained, check J1939 communication.',
  },
  {
    code: 76,
    name: 'Fueling Surge Limit',
    shortName: 'Surge Limit',
    description: 'Fueling surge limit active. Prevents rapid fueling changes that could cause engine surge.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 77,
    name: 'Customer Power Limiter',
    shortName: 'Cust Power',
    description: 'Customer power limiter. PowerGen applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 78,
    name: 'ESM Xwire',
    shortName: 'ESM Xwire',
    description: 'ESM Xwire state. Chrysler products only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Chrysler-specific. Check ESM (Engine Supervisory Module) communication on Chrysler/RAM applications.',
  },
  // ─── States 79-97: New for 2010 ────────────────────────────────────────────
  {
    code: 79,
    name: 'JCOMM Max LSI',
    shortName: 'JCOMM Max LSI',
    description: 'Automated Manual Transmission is in gear during a mobile regen. LSI will be upper bounded based on a calibration setting. Should only be seen on 2010 engines; if seen on 2013 engine then a calibration is set incorrectly.',
    severity: 'info',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
    troubleshooting: 'Expected on 2010 during mobile regen with AMT. If seen on 2013+, check calibration settings.',
  },
  {
    code: 80,
    name: 'Hybrid Power',
    shortName: 'Hybrid Pwr',
    description: 'Used for hybrid vehicles only. Hybrid powertrain is managing engine output.',
    severity: 'info',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
  },
  {
    code: 81,
    name: 'Light Duty Interface',
    shortName: 'LD Interface',
    description: 'Light duty applications only. The ECM is interfacing with light-duty vehicle systems (RAM trucks).',
    severity: 'normal',
    generation: 'core2',
    introduced: '2004',
    normalOperation: true,
    troubleshooting: 'Normal on RAM/Chrysler light-duty applications. If causing issues, check CAN communication between ECM and vehicle systems.',
  },
  {
    code: 82,
    name: 'AC LSI',
    shortName: 'AC LSI',
    description: 'Air conditioning is affecting Low Speed Governor. AC compressor load is being compensated.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2010',
    normalOperation: true,
    troubleshooting: 'Normal when AC is running. Idle speed may increase slightly to compensate for AC load.',
  },
  {
    code: 83,
    name: 'ACI Torque Limit',
    shortName: 'ACI Torque',
    description: 'Accelerator Interlock is limiting torque. Bus applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
  },
  {
    code: 84,
    name: 'RS',
    shortName: 'RS',
    description: 'Unknown state. Purpose not documented.',
    severity: 'info',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
  },
  {
    code: 85,
    name: 'Hybrid Speed',
    shortName: 'Hybrid Spd',
    description: 'Used only on hybrid vehicles. Hybrid system is controlling engine speed.',
    severity: 'info',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
  },
  {
    code: 87,
    name: 'JCOMM LSI',
    shortName: 'JCOMM LSI',
    description: 'J1939 device is controlling Low Speed Governor.',
    severity: 'info',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
    troubleshooting: 'Check which J1939 device is controlling idle speed.',
  },
  {
    code: 88,
    name: 'JCOMM Headway Torque Limit',
    shortName: 'Headway Torque',
    description: 'Adaptive Cruise Control torque device is limiting torque in order to reduce vehicle speed for safe following distance.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2010',
    normalOperation: true,
    troubleshooting: 'Normal when adaptive cruise control is active and reducing speed. Check ACC radar sensor if activating inappropriately.',
  },
  {
    code: 89,
    name: 'Cold Ambient Limit',
    shortName: 'Cold Ambient',
    description: 'Engine speed is limited due to cold ambient temperatures to protect engine components.',
    severity: 'info',
    generation: 'core2',
    introduced: '2010',
    normalOperation: true,
    troubleshooting: 'Normal in extreme cold. Engine will return to full capability as it warms up.',
  },
  {
    code: 90,
    name: 'JCOMM PTO',
    shortName: 'JCOMM PTO',
    description: 'A J1939 PTO device is in control of the engine.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2010',
    normalOperation: true,
  },
  {
    code: 91,
    name: 'Inducement',
    shortName: 'Inducement',
    description: 'Engine torque, engine speed, and/or vehicle speed are being limited due to extremely low DEF level or a malfunction with the emissions system. This is a regulatory compliance derate.',
    severity: 'critical',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
    troubleshooting: 'Check DEF level and quality. Check for emissions system fault codes (NOx sensor, SCR catalyst, DEF dosing). Refill DEF tank. May require INSITE to clear after repair.',
    relatedFaultCodes: ['FC 3868', 'FC 4094', 'FC 6255'],
  },
  {
    code: 92,
    name: 'DTC',
    shortName: 'DTC Control',
    description: 'J1939 device is controlling engine due to a Diagnostic Trouble Code.',
    severity: 'warning',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
    troubleshooting: 'Check for active DTCs on all J1939 devices. Address the fault causing the DTC.',
  },
  {
    code: 93,
    name: 'MCA Auxiliary Shutoff',
    shortName: 'MCA Shutoff',
    description: 'Machine Control Agent Auxiliary device has commanded shutdown.',
    severity: 'critical',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
    troubleshooting: 'Check MCA device and communication. Typically industrial/off-highway applications.',
  },
  {
    code: 95,
    name: 'Mobile PTO',
    shortName: 'Mobile PTO',
    description: 'Mobile PTO state. Used on Chrysler/RAM vehicles.',
    severity: 'normal',
    generation: 'core2',
    introduced: '2010',
    normalOperation: true,
  },
  {
    code: 96,
    name: 'SWD (System Watchdog)',
    shortName: 'Sys Watchdog',
    description: 'System Watchdog (low level software) is in control. This indicates a low-level software safety intervention.',
    severity: 'critical',
    generation: 'core2',
    introduced: '2010',
    normalOperation: false,
    troubleshooting: 'Critical software safety state. May indicate ECM hardware failure or severe software fault. ECM replacement may be needed.',
  },
  // ─── States 98-107: New for 2013 ───────────────────────────────────────────
  {
    code: 98,
    name: 'Hybrid LSI',
    shortName: 'Hybrid LSI',
    description: 'Hybrid vehicle Low Speed Idle control.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 99,
    name: 'Hybrid HSI',
    shortName: 'Hybrid HSI',
    description: 'Hybrid vehicle High Speed Idle control.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 100,
    name: 'Hybrid Power Manager',
    shortName: 'Hybrid PM',
    description: 'Hybrid power manager is controlling engine output.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 101,
    name: 'Accelerator Based Torque Min Torque',
    shortName: 'ABT Min Torque',
    description: 'Accelerator-based torque minimum torque limit active.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 102,
    name: 'Antitheft Lockout',
    shortName: 'Antitheft Lock',
    description: 'Antitheft feature has control of the control system. Engine operation is locked out.',
    severity: 'critical',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
    troubleshooting: 'Check anti-theft system. Verify correct key/fob. May need INSITE or dealer tool to reset.',
  },
  {
    code: 103,
    name: 'MCAHB Min Torque',
    shortName: 'MCAHB Min',
    description: 'MCA Hybrid minimum torque. Hybrid vehicles only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 104,
    name: 'Frequency Throttle',
    shortName: 'Freq Throttle',
    description: 'Frequency throttle control. PowerGen applications only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 105,
    name: 'User Selected Fuel Economy',
    shortName: 'Fuel Econ',
    description: 'User-selected fuel economy mode. Not used in North America.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 106,
    name: 'Transmission Parameter Idle Adjust',
    shortName: 'Trans Idle Adj',
    description: 'Gear ratio based idle speed adjustment. Not used in North America.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  {
    code: 107,
    name: 'Interactive Vehicle Control Module',
    shortName: 'IVCM',
    description: 'Interactive Vehicle Control Module. Hybrid vehicles only.',
    severity: 'info',
    generation: 'core2',
    introduced: '2013',
    normalOperation: false,
  },
  // ─── Special/Extended States ───────────────────────────────────────────────
  {
    code: 202,
    name: 'IDD (Idle Ramp Down)',
    shortName: 'Idle Ramp Down',
    description: 'Idle ramp down. Industrial applications only. 2007 and later.',
    severity: 'info',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
  },
  {
    code: 256,
    name: 'FSS Torque Derate',
    shortName: 'FSS Torque',
    description: 'Fuel system has asked for a torque derate due to a malfunction. The fuel system software has detected a condition requiring reduced torque.',
    severity: 'derate',
    generation: 'all',
    introduced: '2004',
    normalOperation: false,
    troubleshooting: 'Check for fuel system fault codes. Common causes: injector failure, fuel pressure regulator malfunction, CP4.2 pump issues, fuel contamination.',
  },
  {
    code: 514,
    name: 'EPD Fuel Temp',
    shortName: 'EPD Fuel Temp',
    description: 'Engine Protection Derate due to fuel temperature. 2007 engines only.',
    severity: 'derate',
    generation: 'core2',
    introduced: '2007',
    normalOperation: false,
    troubleshooting: 'Check fuel temperature. May indicate fuel cooler failure or restricted fuel return line.',
  },
];

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

/** Map for O(1) lookup by code */
const stateMap = new Map<number, CumminsFuelingState>();
for (const state of CUMMINS_FUELING_STATES) {
  stateMap.set(state.code, state);
}

/**
 * Decode a numeric fueling control state code to its full definition.
 * Returns undefined if the code is not in the database.
 */
export function decodeFuelingState(code: number): CumminsFuelingState | undefined {
  return stateMap.get(code);
}

/**
 * Get the short human-readable name for a fueling control state code.
 * Returns "Unknown (code)" if not found.
 */
export function getFuelingStateName(code: number): string {
  const state = stateMap.get(code);
  return state ? state.shortName : `Unknown (${code})`;
}

/**
 * Get the severity level for a fueling control state code.
 * Returns 'info' for unknown codes.
 */
export function getFuelingStateSeverity(code: number): FuelingStateSeverity {
  const state = stateMap.get(code);
  return state ? state.severity : 'info';
}

/**
 * Check if a fueling control state indicates a derate condition.
 */
export function isDerateState(code: number): boolean {
  const state = stateMap.get(code);
  if (!state) return false;
  return state.severity === 'derate' || state.severity === 'critical';
}

/**
 * Check if a fueling control state is normal operation.
 */
export function isNormalOperation(code: number): boolean {
  const state = stateMap.get(code);
  if (!state) return false;
  return state.normalOperation;
}

/**
 * Get all fueling states that indicate a derate or critical condition.
 * Useful for diagnostics to flag problematic states in datalogs.
 */
export function getDerateStates(): CumminsFuelingState[] {
  return CUMMINS_FUELING_STATES.filter(s => s.severity === 'derate' || s.severity === 'critical');
}

/**
 * Get all normal operation states.
 */
export function getNormalStates(): CumminsFuelingState[] {
  return CUMMINS_FUELING_STATES.filter(s => s.normalOperation);
}

/**
 * Analyze a time series of fueling control state values and return a summary.
 * Useful for datalog analysis to identify time spent in each state.
 */
export function analyzeFuelingStateTimeSeries(states: number[]): {
  stateDistribution: { code: number; name: string; count: number; percentage: number; severity: FuelingStateSeverity }[];
  derateEvents: { code: number; name: string; startIndex: number; endIndex: number; duration: number }[];
  totalSamples: number;
  deratePercentage: number;
} {
  if (states.length === 0) {
    return { stateDistribution: [], derateEvents: [], totalSamples: 0, deratePercentage: 0 };
  }

  // Count occurrences of each state
  const counts = new Map<number, number>();
  for (const code of states) {
    counts.set(code, (counts.get(code) || 0) + 1);
  }

  const stateDistribution = Array.from(counts.entries())
    .map(([code, count]) => ({
      code,
      name: getFuelingStateName(code),
      count,
      percentage: (count / states.length) * 100,
      severity: getFuelingStateSeverity(code),
    }))
    .sort((a, b) => b.count - a.count);

  // Find contiguous derate events
  const derateEvents: { code: number; name: string; startIndex: number; endIndex: number; duration: number }[] = [];
  let derateStart = -1;
  let derateCode = -1;

  for (let i = 0; i < states.length; i++) {
    const isDerating = isDerateState(states[i]);
    if (isDerating && derateStart === -1) {
      derateStart = i;
      derateCode = states[i];
    } else if (isDerating && states[i] !== derateCode) {
      // Different derate state — close previous, start new
      derateEvents.push({
        code: derateCode,
        name: getFuelingStateName(derateCode),
        startIndex: derateStart,
        endIndex: i - 1,
        duration: i - derateStart,
      });
      derateStart = i;
      derateCode = states[i];
    } else if (!isDerating && derateStart !== -1) {
      derateEvents.push({
        code: derateCode,
        name: getFuelingStateName(derateCode),
        startIndex: derateStart,
        endIndex: i - 1,
        duration: i - derateStart,
      });
      derateStart = -1;
      derateCode = -1;
    }
  }
  // Close any open derate event at end
  if (derateStart !== -1) {
    derateEvents.push({
      code: derateCode,
      name: getFuelingStateName(derateCode),
      startIndex: derateStart,
      endIndex: states.length - 1,
      duration: states.length - derateStart,
    });
  }

  const derateSamples = states.filter(s => isDerateState(s)).length;

  return {
    stateDistribution,
    derateEvents,
    totalSamples: states.length,
    deratePercentage: (derateSamples / states.length) * 100,
  };
}

/**
 * Get a formatted tooltip string for a fueling control state code.
 * Used by chart overlays to show human-readable state info on hover.
 */
export function getFuelingStateTooltip(code: number): string {
  const state = stateMap.get(code);
  if (!state) return `Fueling State ${code} (Unknown)`;
  const severityIcon = {
    normal: '\u2705',
    info: '\u2139\ufe0f',
    warning: '\u26a0\ufe0f',
    derate: '\ud83d\udfe1',
    critical: '\ud83d\udd34',
  }[state.severity];
  return `${severityIcon} ${state.name} (${code})\n${state.description}`;
}
