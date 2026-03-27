/**
 * PPEI Advanced Mode - Multi-Vehicle Knowledge Base
 *
 * Vehicle-specific PID mappings, Mode 6 data, and diagnostic info
 * for Duramax variants (L5P, LML, LBZ, LLY, LB7) and GM gas engines (LS/LT).
 *
 * This extends the base knowledgeBase.ts with platform-specific data.
 */

import { KBDocument } from './knowledgeBase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VehiclePlatform {
  id: string;
  name: string;
  engineCode: string;
  years: string;
  displacement: string;
  fuelType: 'diesel' | 'gasoline';
  description: string;
  keySpecs: Record<string, string>;
  commonDTCs: VehicleDTC[];
  specificPIDs: VehiclePID[];
  diagnosticNotes: string[];
}

export interface VehicleDTC {
  code: string;
  description: string;
  severity: 'critical' | 'moderate' | 'info';
  commonCauses: string[];
  diagnosticSteps: string[];
}

export interface VehiclePID {
  name: string;
  pidHex?: string;
  hpTunersName?: string;
  efiliveName?: string;
  banksName?: string;
  units: string;
  normalRange: string;
  description: string;
  diagnosticRelevance: string;
}

// ─── L5P Duramax (2017-Present) ──────────────────────────────────────────────

const L5P_PLATFORM: VehiclePlatform = {
  id: 'l5p',
  name: 'L5P Duramax',
  engineCode: 'L5P',
  years: '2017-Present',
  displacement: '6.6L V8 Turbo Diesel',
  fuelType: 'diesel',
  description: 'The L5P is GM\'s latest Duramax diesel, featuring a new Denso HP4 injection system with solenoid injectors, redesigned turbocharger, and advanced emissions controls including SCR with DEF injection.',
  keySpecs: {
    'Horsepower': '445 HP @ 2800 RPM (2017-2023) / 470 HP @ 2800 RPM (2024+)',
    'Torque': '910 lb-ft @ 1600 RPM (2017-2023) / 975 lb-ft @ 1600 RPM (2024+)',
    'Compression Ratio': '16.0:1',
    'Injection System': 'Denso HP4 Common Rail (solenoid injectors)',
    'Max Rail Pressure': '29,000 PSI (200 MPa) Gen 1 / 32,000 PSI (220 MPa) Gen 2 (2024+)',
    'Turbocharger': 'Variable Geometry Turbo (VGT) - 11-blade Gen 1 / 10-blade Gen 2 (2024+)',
    'Emissions': 'SCR + DPF + DOC + EGR',
    'Transmission': 'GM/Allison 10L1000 10-speed (2020+)',
    'ECM': 'E41 (2017-2023) / E42 Global B (2024+)',
    'TCM': 'T87A (2017-2023) / T93 (2024+)',
  },
  commonDTCs: [
    { code: 'P0087', description: 'Fuel Rail/System Pressure Too Low', severity: 'critical', commonCauses: ['Weak HP4 pump', 'Fuel filter restriction', 'Injector leak-back', 'Low fuel supply pressure', 'Air in fuel system'], diagnosticSteps: ['Check fuel filter condition', 'Monitor rail pressure desired vs actual', 'Check fuel supply pressure at HP4 inlet', 'Perform injector balance rate test', 'Check for air leaks in fuel system'] },
    { code: 'P0088', description: 'Fuel Rail/System Pressure Too High', severity: 'critical', commonCauses: ['Stuck fuel pressure regulator', 'Faulty PCV/FCA valve', 'ECM calibration issue'], diagnosticSteps: ['Monitor PCV duty cycle', 'Check fuel pressure regulator operation', 'Verify ECM calibration version'] },
    { code: 'P0234', description: 'Turbocharger/Supercharger Overboost Condition', severity: 'moderate', commonCauses: ['VGT vane sticking', 'Wastegate actuator failure', 'Boost sensor fault', 'Aftermarket tune overboosting'], diagnosticSteps: ['Check VGT actuator operation', 'Monitor commanded vs actual boost', 'Inspect turbo vanes for carbon buildup', 'Check boost pressure sensor'] },
    { code: 'P0299', description: 'Turbocharger/Supercharger Underboost', severity: 'moderate', commonCauses: ['VGT vane sticking open', 'Boost leak in charge piping', 'Intercooler leak', 'Turbo bearing failure'], diagnosticSteps: ['Pressure test charge air system', 'Check VGT actuator movement', 'Monitor turbo shaft speed vs commanded', 'Inspect intercooler boots'] },
    { code: 'P0401', description: 'EGR Flow Insufficient', severity: 'moderate', commonCauses: ['Carbon buildup in EGR valve', 'EGR cooler plugged', 'EGR position sensor fault'], diagnosticSteps: ['Check EGR valve operation', 'Monitor EGR commanded vs actual position', 'Inspect EGR cooler for restriction'] },
    { code: 'P049D', description: 'EGR "A" Control Position Exceeded Learning Limit', severity: 'moderate', commonCauses: ['EGR valve carbon buildup', 'EGR actuator wear', 'Intake manifold carbon'], diagnosticSteps: ['Clean EGR valve', 'Check EGR actuator', 'Inspect intake manifold'] },
    { code: 'P2002', description: 'DPF Efficiency Below Threshold Bank 1', severity: 'critical', commonCauses: ['DPF cracked or melted substrate', 'Excessive soot loading', 'Failed regeneration attempts', 'Sensor fault'], diagnosticSteps: ['Check DPF differential pressure', 'Monitor soot loading estimate', 'Verify DPF temperature sensors', 'Check for upstream issues causing excess soot'] },
    { code: 'P20EE', description: 'SCR NOx Catalyst Efficiency Below Threshold', severity: 'critical', commonCauses: ['Bad DEF quality', 'DEF injector clogged', 'SCR catalyst degraded', 'NOx sensor fault'], diagnosticSteps: ['Test DEF quality', 'Check DEF injector spray pattern', 'Monitor NOx sensor readings upstream/downstream', 'Check SCR catalyst temperature'] },
    { code: 'P2463', description: 'DPF Soot Accumulation', severity: 'moderate', commonCauses: ['Excessive idle time', 'Short trip driving', 'Failed regen attempts', 'Injector issues causing excess soot'], diagnosticSteps: ['Force manual DPF regen', 'Check soot loading level', 'Verify regen conditions are being met', 'Check for injector issues'] },
    { code: 'P0700', description: 'Transmission Control System Malfunction', severity: 'moderate', commonCauses: ['TCM communication fault', 'Transmission solenoid issue', 'Wiring harness problem'], diagnosticSteps: ['Check TCM DTCs', 'Verify CAN communication', 'Check transmission fluid level and condition'] },
  ],
  specificPIDs: [
    { name: 'Fuel Rail Pressure (Actual)', pidHex: '23', hpTunersName: 'Fuel Rail Pressure', efiliveName: 'FUEL_PRESS_ACT', banksName: 'Rail Pressure', units: 'PSI/MPa', normalRange: '3000-29000 PSI', description: 'Actual fuel rail pressure from the rail pressure sensor', diagnosticRelevance: 'Compare to desired. Deviation >500 PSI indicates fuel system issue.' },
    { name: 'Fuel Rail Pressure (Desired)', hpTunersName: 'Fuel Rail Pressure Desired', efiliveName: 'FUEL_PRESS_DES', units: 'PSI/MPa', normalRange: '3000-29000 PSI', description: 'ECM commanded fuel rail pressure', diagnosticRelevance: 'Desired vs actual delta is primary fuel system health indicator.' },
    { name: 'Boost Pressure (Actual)', pidHex: '70', hpTunersName: 'Boost Pressure', efiliveName: 'BOOST_ACT', banksName: 'Boost', units: 'PSI/kPa', normalRange: '0-40 PSI', description: 'Actual turbocharger boost pressure', diagnosticRelevance: 'Compare to desired. Underboost indicates turbo or charge pipe issue.' },
    { name: 'Boost Pressure (Desired)', hpTunersName: 'Boost Pressure Desired', efiliveName: 'BOOST_DES', units: 'PSI/kPa', normalRange: '0-40 PSI', description: 'ECM commanded boost pressure', diagnosticRelevance: 'Desired vs actual delta indicates VGT or boost leak issues.' },
    { name: 'EGT Bank 1 Sensor 1', pidHex: '6B', hpTunersName: 'Exhaust Gas Temp B1S1', efiliveName: 'EGT_B1S1', banksName: 'EGT 1', units: '°F/°C', normalRange: '200-1400°F', description: 'Pre-turbo exhaust gas temperature', diagnosticRelevance: 'High EGT (>1400°F) indicates over-fueling or restricted exhaust.' },
    { name: 'MAF (Mass Air Flow)', pidHex: '10', hpTunersName: 'Mass Airflow', efiliveName: 'MAF_ACT', banksName: 'MAF', units: 'g/s', normalRange: '5-250 g/s', description: 'Mass air flow sensor reading', diagnosticRelevance: 'Low MAF at high RPM indicates restricted intake or sensor fault.' },
    { name: 'TCC Slip Speed', hpTunersName: 'TCC Slip Speed', efiliveName: 'TCC_SLIP', units: 'RPM', normalRange: '-50 to 50 RPM (locked)', description: 'Torque converter clutch slip speed', diagnosticRelevance: 'Excessive slip (>100 RPM) when locked indicates TCC wear or fluid issue.' },
    { name: 'Transmission Fluid Temp', hpTunersName: 'Trans Fluid Temp', efiliveName: 'TRANS_TEMP', banksName: 'Trans Temp', units: '°F/°C', normalRange: '150-220°F', description: 'Automatic transmission fluid temperature', diagnosticRelevance: 'Above 250°F causes accelerated wear. Above 300°F is critical.' },
    { name: 'DPF Soot Loading', hpTunersName: 'DPF Soot Mass', efiliveName: 'DPF_SOOT', units: 'grams', normalRange: '0-35g', description: 'Estimated soot mass in the DPF', diagnosticRelevance: 'Above 35g triggers regen. Above 60g may require dealer regen.' },
    { name: 'DEF Tank Level', pidHex: '83', hpTunersName: 'DEF Level', efiliveName: 'DEF_LEVEL', units: '%', normalRange: '10-100%', description: 'Diesel Exhaust Fluid tank level', diagnosticRelevance: 'Below 10% triggers warning. At 0% vehicle enters limp mode.' },
    { name: 'VGT Position (Actual)', hpTunersName: 'VGT Position', efiliveName: 'VGT_POS_ACT', units: '%', normalRange: '0-100%', description: 'Variable geometry turbo vane position', diagnosticRelevance: 'Compare to commanded. Slow response indicates sticking vanes.' },
    { name: 'PCV Duty Cycle', hpTunersName: 'Fuel Pressure Regulator DC', efiliveName: 'PCV_DC', units: '%', normalRange: '10-60%', description: 'Pressure control valve duty cycle for fuel rail', diagnosticRelevance: 'High duty cycle (>70%) indicates pump working hard. Low (<5%) may indicate stuck regulator.' },
  ],
  diagnosticNotes: [
    'The L5P uses a Denso HP4 injection pump instead of the Bosch CP4 used in LML. This is generally more reliable but still sensitive to fuel quality.',
    'Gen 1 (2017-2023): Rail pressure can reach 29,000 PSI (200 MPa). Gen 2 (2024+): Upgraded pump capacity to 32,000 PSI (220 MPa) with thicker fuel rails.',
    'The GM/Allison 10L1000 10-speed transmission has different shift adaptation behavior than the Allison 1000 6-speed. TCC slip patterns differ significantly between the two platforms.',
    'L5P uses solenoid injectors with the Denso HP4 common rail system. 2024+ Gen 2 (E42) has higher-flow injectors.',
    'DPF regeneration on L5P occurs approximately every 300-500 miles depending on driving conditions.',
    'Gen 1 ECM is E41. Gen 2 (2024+) ECM is E42 with Global B architecture. The E42 uses an updated communication protocol that may require updated scan tool firmware.',
    'DEF consumption rate is approximately 2-3% of fuel consumption. Higher rates may indicate SCR issues.',
    '2024+ Gen 2 features: tapered bowl pistons, improved cylinder head cooling jackets, beefed up exhaust valve springs for better exhaust braking, and enhanced VGT actuator for quicker boost response.',
  ],
};

// ─── LML Duramax (2011-2016) ────────────────────────────────────────────────

const LML_PLATFORM: VehiclePlatform = {
  id: 'lml',
  name: 'LML Duramax',
  engineCode: 'LML',
  years: '2011-2016',
  displacement: '6.6L V8 Turbo Diesel',
  fuelType: 'diesel',
  description: 'The LML was the first Duramax with DEF/SCR aftertreatment. It uses the Bosch CP4.2 high-pressure fuel pump and features a redesigned turbocharger with improved response.',
  keySpecs: {
    'Horsepower': '397 HP @ 3000 RPM',
    'Torque': '765 lb-ft @ 1600 RPM',
    'Compression Ratio': '16.0:1',
    'Injection System': 'Bosch CP4.2 Common Rail',
    'Max Rail Pressure': '29,000 PSI (200 MPa)',
    'Turbocharger': 'Variable Geometry Turbo (VGT)',
    'Emissions': 'SCR + DPF + DOC + EGR',
    'Transmission': 'Allison 1000 6-speed',
    'ECM': 'E86A (2011-2014) / E86B (2015-2016)',
  },
  commonDTCs: [
    { code: 'P0087', description: 'Fuel Rail/System Pressure Too Low', severity: 'critical', commonCauses: ['CP4.2 pump failure (CRITICAL - can contaminate entire fuel system)', 'Fuel filter restriction', 'Injector leak-back', 'Lift pump failure'], diagnosticSteps: ['IMMEDIATELY check for metal in fuel filter - CP4 failure can destroy injectors, lines, and rail', 'Check lift pump pressure', 'Monitor rail pressure desired vs actual', 'Perform injector balance rate test'] },
    { code: 'P0088', description: 'Fuel Rail/System Pressure Too High', severity: 'critical', commonCauses: ['Stuck FCA/PCV valve', 'Fuel pressure regulator failure', 'ECM calibration'], diagnosticSteps: ['Monitor PCV duty cycle', 'Check fuel return line restriction', 'Verify ECM calibration'] },
    { code: 'P0234', description: 'Turbocharger Overboost', severity: 'moderate', commonCauses: ['VGT vane sticking', 'Wastegate issue', 'Boost sensor fault'], diagnosticSteps: ['Check VGT actuator', 'Monitor boost desired vs actual', 'Inspect turbo vanes'] },
    { code: 'P0299', description: 'Turbocharger Underboost', severity: 'moderate', commonCauses: ['VGT vane sticking open', 'Boost leak', 'Turbo bearing failure', 'Intercooler leak'], diagnosticSteps: ['Pressure test charge air system', 'Check VGT movement', 'Inspect intercooler'] },
    { code: 'P0401', description: 'EGR Flow Insufficient', severity: 'moderate', commonCauses: ['EGR valve carbon buildup', 'EGR cooler plugged'], diagnosticSteps: ['Clean EGR valve', 'Check EGR cooler'] },
    { code: 'P2002', description: 'DPF Efficiency Below Threshold', severity: 'critical', commonCauses: ['DPF substrate damage', 'Excessive soot', 'Failed regens'], diagnosticSteps: ['Check DPF differential pressure', 'Monitor soot loading', 'Verify temp sensors'] },
    { code: 'P20EE', description: 'SCR NOx Catalyst Efficiency Below Threshold', severity: 'critical', commonCauses: ['Bad DEF', 'DEF injector clogged', 'SCR catalyst degraded'], diagnosticSteps: ['Test DEF quality', 'Check DEF injector', 'Monitor NOx sensors'] },
    { code: 'P11DB', description: 'Reductant Injection Valve Circuit', severity: 'moderate', commonCauses: ['DEF injector failure', 'Wiring issue', 'DEF crystallization'], diagnosticSteps: ['Check DEF injector resistance', 'Inspect wiring', 'Check for crystallization at injector'] },
  ],
  specificPIDs: [
    { name: 'Fuel Rail Pressure (Actual)', hpTunersName: 'Fuel Rail Pressure', efiliveName: 'GM.FRP', units: 'PSI/MPa', normalRange: '3000-29000 PSI', description: 'Actual fuel rail pressure', diagnosticRelevance: 'CP4 failure shows erratic pressure or inability to build pressure.' },
    { name: 'Fuel Rail Pressure (Desired)', hpTunersName: 'Fuel Rail Pressure Desired', efiliveName: 'GM.FRPD', units: 'PSI/MPa', normalRange: '3000-29000 PSI', description: 'ECM commanded fuel rail pressure', diagnosticRelevance: 'Large desired vs actual gap indicates fuel system issue.' },
    { name: 'Injector Balance Rates', hpTunersName: 'Inj Balance Rate Cyl 1-8', efiliveName: 'GM.IBR1-8', units: 'mm3/stroke', normalRange: '-4 to +4 mm3', description: 'Individual injector fuel trim corrections', diagnosticRelevance: 'Values >6 mm3 indicate injector wear or failure.' },
    { name: 'Boost Pressure', hpTunersName: 'Boost Pressure', efiliveName: 'GM.BOOST', units: 'PSI/kPa', normalRange: '0-35 PSI', description: 'Actual turbocharger boost pressure', diagnosticRelevance: 'Compare to desired for VGT health assessment.' },
    { name: 'EGT Pre-Turbo', hpTunersName: 'Exhaust Gas Temp Pre-Turbo', efiliveName: 'GM.EGT_PT', units: '°F/°C', normalRange: '200-1300°F', description: 'Pre-turbo exhaust gas temperature', diagnosticRelevance: 'High EGT indicates over-fueling or restricted exhaust.' },
    { name: 'DPF Differential Pressure', hpTunersName: 'DPF Delta P', efiliveName: 'GM.DPF_DP', units: 'kPa', normalRange: '0-15 kPa', description: 'Pressure drop across DPF', diagnosticRelevance: 'High delta P indicates soot loading or plugged DPF.' },
  ],
  diagnosticNotes: [
    'CRITICAL: The Bosch CP4.2 pump in the LML is known for catastrophic failure. Metal debris from a failed CP4 can destroy injectors, fuel lines, and the fuel rail. Always check for metal in the fuel filter first.',
    'LML was the first Duramax with DEF/SCR. Early models (2011-2012) had more DEF system issues.',
    'The LML uses the Allison 1000 6-speed transmission. TCC lockup behavior differs from the 10-speed in L5P.',
    'Injector balance rates are a critical diagnostic tool. Values beyond +/-6 mm3/stroke indicate injector issues.',
    'The LML ECM (E86A for 2011-2014, E86B for 2015-2016) is more accessible for tuning than the L5P E92.',
    'Common CP4 failure symptoms: sudden loss of power, metallic debris in fuel filter, erratic rail pressure.',
  ],
};

// ─── LBZ Duramax (2006-2007) ────────────────────────────────────────────────

const LBZ_PLATFORM: VehiclePlatform = {
  id: 'lbz',
  name: 'LBZ Duramax',
  engineCode: 'LBZ',
  years: '2006-2007',
  displacement: '6.6L V8 Turbo Diesel',
  fuelType: 'diesel',
  description: 'The LBZ is widely considered the most desirable pre-emissions Duramax. It features the Bosch CP3 injection pump, a variable geometry turbo, and no DPF or DEF requirements.',
  keySpecs: {
    'Horsepower': '360 HP @ 3200 RPM',
    'Torque': '650 lb-ft @ 1600 RPM',
    'Compression Ratio': '16.8:1',
    'Injection System': 'Bosch CP3 Common Rail',
    'Max Rail Pressure': '23,200 PSI (160 MPa)',
    'Turbocharger': 'Garrett Variable Geometry Turbo',
    'Emissions': 'EGR only (no DPF, no DEF)',
    'Transmission': 'Allison 1000 6-speed',
    'ECM': 'E35',
  },
  commonDTCs: [
    { code: 'P0087', description: 'Fuel Rail Pressure Too Low', severity: 'critical', commonCauses: ['CP3 pump wear', 'Fuel filter restriction', 'Injector leak-back', 'Lift pump failure'], diagnosticSteps: ['Check fuel filter', 'Monitor rail pressure', 'Test lift pump pressure', 'Perform injector balance test'] },
    { code: 'P0234', description: 'Turbocharger Overboost', severity: 'moderate', commonCauses: ['VGT vane sticking', 'Unison ring failure', 'Aftermarket tune'], diagnosticSteps: ['Check VGT actuator', 'Inspect unison ring', 'Monitor boost levels'] },
    { code: 'P0299', description: 'Turbocharger Underboost', severity: 'moderate', commonCauses: ['VGT vane sticking open', 'Boost leak', 'Turbo bearing failure'], diagnosticSteps: ['Pressure test charge air', 'Check VGT movement', 'Inspect turbo'] },
    { code: 'P0380', description: 'Glow Plug Circuit A', severity: 'info', commonCauses: ['Failed glow plug', 'Glow plug relay', 'Wiring issue'], diagnosticSteps: ['Test individual glow plugs', 'Check relay', 'Inspect wiring'] },
    { code: 'P0401', description: 'EGR Flow Insufficient', severity: 'moderate', commonCauses: ['EGR valve carbon buildup', 'EGR cooler plugged'], diagnosticSteps: ['Clean EGR valve', 'Check EGR cooler'] },
  ],
  specificPIDs: [
    { name: 'Fuel Rail Pressure', hpTunersName: 'Fuel Rail Pressure', efiliveName: 'GM.FRP', units: 'PSI/MPa', normalRange: '3000-23200 PSI', description: 'Actual fuel rail pressure', diagnosticRelevance: 'CP3 is more reliable than CP4 but still monitor for wear.' },
    { name: 'Boost Pressure', hpTunersName: 'Boost Pressure', efiliveName: 'GM.BOOST', units: 'PSI/kPa', normalRange: '0-35 PSI', description: 'Turbocharger boost pressure', diagnosticRelevance: 'LBZ turbo is known for good response. Slow spool indicates issues.' },
    { name: 'Injector Balance Rates', hpTunersName: 'Inj Balance Rate Cyl 1-8', efiliveName: 'GM.IBR1-8', units: 'mm3/stroke', normalRange: '-4 to +4 mm3', description: 'Individual injector fuel trim corrections', diagnosticRelevance: 'Values >6 mm3 indicate injector wear.' },
    { name: 'EGT Pre-Turbo', hpTunersName: 'Exhaust Gas Temp', efiliveName: 'GM.EGT', units: '°F/°C', normalRange: '200-1300°F', description: 'Pre-turbo exhaust gas temperature', diagnosticRelevance: 'No DPF means EGT is purely engine health indicator.' },
  ],
  diagnosticNotes: [
    'The LBZ uses the Bosch CP3 pump which is significantly more reliable than the CP4 in later models.',
    'No DPF or DEF system simplifies diagnostics considerably.',
    'The LBZ VGT uses a Garrett turbo with a unison ring that can crack, causing vane sticking.',
    'LBZ is the last Duramax without emissions aftertreatment, making it popular for performance builds.',
    'The Allison 1000 in the LBZ can handle significantly more power than stock with proper tuning.',
    'Common performance mods: EFILive tuning, intake, exhaust, lift pump upgrade.',
  ],
};

// ─── LLY Duramax (2004.5-2006) ──────────────────────────────────────────────

const LLY_PLATFORM: VehiclePlatform = {
  id: 'lly',
  name: 'LLY Duramax',
  engineCode: 'LLY',
  years: '2004.5-2006',
  displacement: '6.6L V8 Turbo Diesel',
  fuelType: 'diesel',
  description: 'The LLY was the first Duramax with a variable geometry turbocharger. It introduced EGR and had some known overheating issues related to the turbo mouthpiece.',
  keySpecs: {
    'Horsepower': '310 HP @ 3000 RPM',
    'Torque': '605 lb-ft @ 1600 RPM',
    'Compression Ratio': '16.8:1',
    'Injection System': 'Bosch CP3 Common Rail',
    'Max Rail Pressure': '23,200 PSI (160 MPa)',
    'Turbocharger': 'Garrett Variable Geometry Turbo',
    'Emissions': 'EGR (first Duramax with EGR)',
    'Transmission': 'Allison 1000 5-speed',
    'ECM': 'E60',
  },
  commonDTCs: [
    { code: 'P0087', description: 'Fuel Rail Pressure Too Low', severity: 'critical', commonCauses: ['CP3 pump wear', 'Fuel filter', 'Injector leak-back'], diagnosticSteps: ['Check fuel filter', 'Monitor rail pressure', 'Test injectors'] },
    { code: 'P0234', description: 'Turbocharger Overboost', severity: 'moderate', commonCauses: ['VGT vane sticking', 'Turbo mouthpiece restriction'], diagnosticSteps: ['Check VGT', 'Inspect turbo mouthpiece for restriction'] },
    { code: 'P0101', description: 'MAF Sensor Range/Performance', severity: 'moderate', commonCauses: ['Dirty MAF sensor', 'Intake leak after MAF', 'MAF sensor failure'], diagnosticSteps: ['Clean MAF sensor', 'Check for intake leaks', 'Test MAF output'] },
    { code: 'P0380', description: 'Glow Plug Circuit', severity: 'info', commonCauses: ['Failed glow plug', 'Relay issue'], diagnosticSteps: ['Test individual glow plugs', 'Check relay'] },
  ],
  specificPIDs: [
    { name: 'Fuel Rail Pressure', hpTunersName: 'Fuel Rail Pressure', efiliveName: 'GM.FRP', units: 'PSI', normalRange: '3000-23200 PSI', description: 'Actual fuel rail pressure', diagnosticRelevance: 'Monitor for CP3 health.' },
    { name: 'Boost Pressure', hpTunersName: 'Boost Pressure', efiliveName: 'GM.BOOST', units: 'PSI', normalRange: '0-30 PSI', description: 'Turbocharger boost pressure', diagnosticRelevance: 'LLY turbo mouthpiece restriction can limit boost.' },
    { name: 'Coolant Temperature', hpTunersName: 'Coolant Temp', efiliveName: 'GM.ECT', units: '°F', normalRange: '180-210°F', description: 'Engine coolant temperature', diagnosticRelevance: 'LLY is known for overheating. Monitor closely under load.' },
  ],
  diagnosticNotes: [
    'The LLY is known for overheating issues, often caused by the turbo mouthpiece restricting airflow.',
    'Turbo mouthpiece upgrade is one of the most common and important LLY modifications.',
    'First Duramax with EGR, which can cause intake manifold carbon buildup.',
    'The LLY VGT can have unison ring issues similar to the LBZ.',
    'Head gasket failures are more common on the LLY than other Duramax variants.',
  ],
};

// ─── LB7 Duramax (2001-2004) ────────────────────────────────────────────────

const LB7_PLATFORM: VehiclePlatform = {
  id: 'lb7',
  name: 'LB7 Duramax',
  engineCode: 'LB7',
  years: '2001-2004',
  displacement: '6.6L V8 Turbo Diesel',
  fuelType: 'diesel',
  description: 'The original Duramax diesel. The LB7 is known for injector issues but is otherwise a robust platform. No EGR, no DPF, no DEF. Uses Bosch solenoid injectors and a CP3 high-pressure pump. EFILive logs use PCM.* prefix (not ECM.*).',
  keySpecs: {
    'Horsepower': '300 HP @ 3100 RPM (stock)',
    'Torque': '520 lb-ft @ 1800 RPM (stock)',
    'Compression Ratio': '17.5:1',
    'Injection System': 'Bosch CP3 Common Rail (solenoid injectors)',
    'Injector Type': 'Bosch solenoid (100mm3 reference max on pulse table)',
    'Max Rail Pressure': '23,200 PSI (160 MPa)',
    'Turbocharger': 'Garrett GT3788VA (fixed geometry with wastegate)',
    'Turbo Spool Range': '~1800-2200 RPM (stock), higher for aftermarket turbos',
    'Emissions': 'None (no EGR, no DPF, no DEF)',
    'Transmission': 'Allison 1000 5-speed',
    'ECM': 'E35 (PCM prefix in EFILive)',
    'EFILive PID Prefix': 'PCM.* (not ECM.*)',
    'Rail Pressure Units': 'MPa (EFILive), converted to PSI by analyzer',
    'Boost Units': 'kPa absolute (EFILive BOOST_M), converted to PSI gauge',
    'Pulse Width Units': 'Microseconds (µs) via PCM.MAINBPW',
    'Fuel Quantity PID': 'PCM.FUEL_MAIN_M (mm3, can be negative = pilot injection)',
  },
  commonDTCs: [
    { code: 'P0087', description: 'Fuel Rail Pressure Too Low', severity: 'critical', commonCauses: ['Injector leak-back (VERY common on LB7)', 'CP3 pump wear', 'Fuel filter restriction', 'Lift pump failure'], diagnosticSteps: ['Perform injector return rate test (most important)', 'Check fuel filter', 'Monitor rail pressure desired vs actual', 'Check lift pump pressure'] },
    { code: 'P0201-P0208', description: 'Injector Circuit Malfunction Cyl 1-8', severity: 'critical', commonCauses: ['Injector failure (common LB7 issue)', 'Wiring harness damage under valve covers', 'ECM driver issue'], diagnosticSteps: ['Check injector resistance', 'Inspect wiring harness routing under valve covers', 'Test ECM injector drivers'] },
    { code: 'P0380', description: 'Glow Plug Circuit', severity: 'info', commonCauses: ['Failed glow plug', 'Relay', 'Module'], diagnosticSteps: ['Test glow plugs individually', 'Check relay and module'] },
    { code: 'P0234', description: 'Turbocharger Overboost Condition', severity: 'moderate', commonCauses: ['Wastegate stuck closed', 'Boost controller malfunction', 'Aftermarket turbo without proper tuning'], diagnosticSteps: ['Check wastegate operation', 'Verify boost controller', 'Check for aftermarket turbo'] },
    { code: 'P0299', description: 'Turbocharger Underboost Condition', severity: 'moderate', commonCauses: ['Boost leak (intercooler boots, clamps, up-pipe)', 'Wastegate stuck open', 'Turbo bearing failure', 'Exhaust restriction'], diagnosticSteps: ['Boost leak test (pressurize charge system)', 'Check wastegate actuator', 'Inspect turbo for shaft play', 'Check exhaust back pressure'] },
  ],
  specificPIDs: [
    { name: 'Engine RPM', hpTunersName: 'Engine Speed', efiliveName: 'PCM.RPM', units: 'RPM', normalRange: '650-3200 RPM', description: 'Engine speed', diagnosticRelevance: 'Idle should be ~680 RPM. Monitor during WOT launches for converter stall analysis.' },
    { name: 'Fuel Rail Pressure Actual', hpTunersName: 'Fuel Rail Pressure', efiliveName: 'PCM.FRPACT', units: 'MPa (converted to PSI)', normalRange: '3000-23200 PSI (20-160 MPa)', description: 'Actual fuel rail pressure', diagnosticRelevance: 'LB7 injector leak-back is the #1 issue. Monitor rail pressure closely. EFILive logs in MPa.' },
    { name: 'Fuel Rail Pressure Desired', hpTunersName: 'Desired Fuel Pressure', efiliveName: 'PCM.FRPDES', units: 'MPa (converted to PSI)', normalRange: '3000-23200 PSI', description: 'Commanded fuel rail pressure', diagnosticRelevance: 'Compare desired vs actual for rail pressure deviation analysis.' },
    { name: 'Fuel Rail Pressure Command', efiliveName: 'PCM.FRP_C', units: 'kPa', normalRange: 'Varies', description: 'Rail pressure command in kPa (alternate PID)', diagnosticRelevance: 'Secondary rail pressure PID in some LB7 logs.' },
    { name: 'FRP Regulator Current', efiliveName: 'PCM.FRPACOM', units: 'mA', normalRange: '200-800 mA', description: 'Fuel pressure regulator actuator commanded current', diagnosticRelevance: 'Monitor for PCV saturation indicating fuel supply restriction.' },
    { name: 'Boost Pressure', hpTunersName: 'Boost Pressure', efiliveName: 'PCM.BOOST_M', units: 'kPa absolute (converted to PSI gauge)', normalRange: '0-22 PSI (stock), higher with aftermarket turbo', description: 'Manifold boost pressure', diagnosticRelevance: 'EFILive logs as kPa absolute. Analyzer subtracts atmospheric (~86 kPa) for gauge reading.' },
    { name: 'Mass Air Flow', hpTunersName: 'Mass Airflow', efiliveName: 'PCM.MAF', units: 'g/s (converted to lb/min)', normalRange: '5-80+ g/s', description: 'Mass airflow rate', diagnosticRelevance: 'High MAF with low boost suggests boost leak. MAF adequate for fuel if mm3 and pulse width are in range.' },
    { name: 'Main Injection Pulse Width', efiliveName: 'PCM.MAINBPW', units: 'µs (converted to ms)', normalRange: '500-2500 µs', description: 'Main injection pulse width in microseconds', diagnosticRelevance: 'LB7 solenoid injectors: >2500µs indicates race-level fueling. 100mm3 is reference max but increasing pulse at 100mm3 delivers more fuel.' },
    { name: 'Fuel Quantity Main', efiliveName: 'PCM.FUEL_MAIN_M', units: 'mm3', normalRange: '0-100 mm3', description: 'Main injection fuel quantity per stroke', diagnosticRelevance: 'LB7 has 100mm3 reference max on pulse table. Values can be negative (pilot injection). Increasing pulse at 100mm3 delivers more than 100mm3.' },
    { name: 'Injection Timing', efiliveName: 'PCM.MNINJTIM', units: 'degrees', normalRange: '0-20° BTDC', description: 'Main injection timing', diagnosticRelevance: 'High timing (>27°) indicates aggressive tuning. Monitor with EGT.' },
    { name: 'Throttle Position', efiliveName: 'PCM.TP_A', units: '%', normalRange: '0-100%', description: 'Accelerator pedal position', diagnosticRelevance: 'Used for WOT detection in converter stall and boost leak analysis.' },
    { name: 'TCC Slip Speed', efiliveName: 'TCM.TCCSLIP', units: 'RPM', normalRange: '-15 to +15 RPM (locked)', description: 'Torque converter clutch slip speed', diagnosticRelevance: 'Monitor during WOT launches for converter stall analysis. Low stall RPM with larger turbo = possible mismatch.' },
    { name: 'TCC Duty Cycle', efiliveName: 'TCM.TCCDC', units: '%', normalRange: '0-100%', description: 'TCC apply duty cycle', diagnosticRelevance: 'Full lock at ~90%+. Monitor alongside slip for converter health.' },
    { name: 'Turbine Speed', efiliveName: 'TCM.TURBINE', units: 'RPM', normalRange: 'Varies', description: 'Transmission turbine (input) shaft speed', diagnosticRelevance: 'Compare to engine RPM for converter slip calculation.' },
    { name: 'Current Gear', efiliveName: 'TCM.GEAR', units: 'Gear number', normalRange: '1-5', description: 'Current transmission gear (text in EFILive: First, Second, etc.)', diagnosticRelevance: 'Used for shift analysis and gear-shift exclusion in TCC slip detection.' },
    { name: 'Trans Fluid Temp', efiliveName: 'TCM.TFT', units: '°C (converted to °F)', normalRange: '150-220°F', description: 'Transmission fluid temperature', diagnosticRelevance: 'High TFT with converter slip indicates excessive heat generation.' },
    { name: 'Injector Balance Rates', hpTunersName: 'Inj Balance Rate Cyl 1-8', efiliveName: 'GM.IBR1-8', units: 'mm3/stroke', normalRange: '-4 to +4 mm3', description: 'Individual injector fuel trim corrections', diagnosticRelevance: 'LB7 injectors commonly fail. Balance rates are the primary diagnostic tool.' },
  ],
  diagnosticNotes: [
    'LB7 injectors are the #1 failure point. GM extended warranty coverage to 200,000 miles on some models.',
    'Injector return rate test is the most important diagnostic for LB7. Each injector should return <80ml in 15 seconds.',
    'No emissions equipment (no EGR, DPF, or DEF) makes the LB7 the simplest Duramax to diagnose.',
    'The LB7 uses internal injectors (under the valve covers), making replacement labor-intensive.',
    'CP3 pump is generally reliable on the LB7. Unlike the LML CP4.2, the CP3 rarely fails catastrophically.',
    'EFILive logs use PCM.* prefix (not ECM.* like later Duramax). Rail pressure in MPa, boost in kPa absolute, pulse width in microseconds.',
    'LB7 solenoid injectors have a 100mm3 reference max on the pulse table, but increasing pulse width at 100mm3 delivers more fuel than 100mm3.',
    'For vehicles with aftermarket turbochargers: the stock GT3788VA spools around 1500-1800 RPM. Larger turbos may not produce meaningful boost until 2000+ RPM.',
    'Converter stall speed is critical for turbo spool on larger turbo builds. If the converter stall does not reach the turbo spool range, the vehicle will feel laggy and smokey from a dead stop.',
    'When diagnosing smoke and lag complaints on modified LB7s: check converter stall RPM vs turbo spool threshold, AND check for boost leaks. These two issues compound each other.',
    'A boost leak on an LB7 with a larger turbo will exaggerate a tight converter stall — the turbo cannot build pressure it is losing, making the stall problem appear worse.',
    'Allison 1000 5-speed: gear text in EFILive (First, Second, Third, Fourth, Fifth, Reverse, Neutral, Park). Analyzer converts to numeric.',
  ],
};

// ─── GM Gas Engines (LS/LT) ────────────────────────────────────────────────

const LS_LT_PLATFORM: VehiclePlatform = {
  id: 'ls_lt',
  name: 'GM LS/LT Gas Engines',
  engineCode: 'LS/LT',
  years: '1997-Present',
  displacement: 'Various (4.8L-6.2L V8)',
  fuelType: 'gasoline',
  description: 'GM\'s LS and LT family of small-block V8 engines. LS (Gen III/IV) covers 1997-2013, LT (Gen V) covers 2014-present. Widely used in trucks, SUVs, and performance vehicles.',
  keySpecs: {
    'LS Family': 'Gen III (1997-2004) and Gen IV (2005-2013)',
    'LT Family': 'Gen V (2014-Present)',
    'Common Variants': 'LS1, LS2, LS3, LS7, L83, L86, LT1, LT4',
    'Truck Variants': '4.8L (LR4/L20), 5.3L (LM7/L83/L84), 6.0L (LQ4/L96), 6.2L (L86/L87)',
    'Fuel System': 'Port injection (LS) / Direct injection (LT) / Dual injection (some LT)',
    'Emissions': 'Catalytic converter + O2 sensors + EVAP',
  },
  commonDTCs: [
    { code: 'P0300', description: 'Random/Multiple Cylinder Misfire', severity: 'moderate', commonCauses: ['Spark plugs worn', 'Ignition coil failure', 'Fuel injector issue', 'Vacuum leak', 'Low compression'], diagnosticSteps: ['Check spark plugs', 'Swap coils to identify failed unit', 'Check for vacuum leaks', 'Compression test'] },
    { code: 'P0420', description: 'Catalyst System Efficiency Below Threshold Bank 1', severity: 'moderate', commonCauses: ['Catalytic converter degraded', 'O2 sensor fault', 'Exhaust leak before cat'], diagnosticSteps: ['Compare upstream/downstream O2 signals', 'Check for exhaust leaks', 'Monitor catalyst temperature'] },
    { code: 'P0442', description: 'EVAP System Leak Detected (Small Leak)', severity: 'info', commonCauses: ['Loose gas cap', 'EVAP canister vent valve', 'EVAP line crack'], diagnosticSteps: ['Check gas cap seal', 'Smoke test EVAP system', 'Check vent valve'] },
    { code: 'P0521', description: 'Engine Oil Pressure Sensor Range/Performance', severity: 'moderate', commonCauses: ['Oil pressure sensor failure', 'Low oil pressure', 'Oil pump wear'], diagnosticSteps: ['Replace oil pressure sensor', 'Verify with mechanical gauge', 'Check oil level and condition'] },
    { code: 'P0172', description: 'System Too Rich Bank 1', severity: 'moderate', commonCauses: ['Leaking fuel injector', 'Faulty MAF sensor', 'High fuel pressure', 'EVAP purge valve stuck open'], diagnosticSteps: ['Check fuel trims', 'Clean/test MAF sensor', 'Check fuel pressure', 'Test EVAP purge valve'] },
  ],
  specificPIDs: [
    { name: 'Engine RPM', pidHex: '0C', hpTunersName: 'Engine Speed', units: 'RPM', normalRange: '600-6500 RPM', description: 'Engine speed', diagnosticRelevance: 'Idle should be 600-700 RPM. Erratic idle indicates vacuum leak or sensor issue.' },
    { name: 'Short Term Fuel Trim B1', pidHex: '06', hpTunersName: 'STFT B1', units: '%', normalRange: '-10 to +10%', description: 'Short term fuel trim Bank 1', diagnosticRelevance: 'Values beyond +/-15% indicate fueling issue.' },
    { name: 'Long Term Fuel Trim B1', pidHex: '07', hpTunersName: 'LTFT B1', units: '%', normalRange: '-10 to +10%', description: 'Long term fuel trim Bank 1', diagnosticRelevance: 'Persistent offset indicates systematic fueling issue.' },
    { name: 'Knock Retard', hpTunersName: 'Knock Retard', units: '°', normalRange: '0°', description: 'Timing retard due to knock detection', diagnosticRelevance: 'Any knock retard under normal conditions indicates fuel quality or mechanical issue.' },
    { name: 'AFM/DFM Status', hpTunersName: 'AFM Fuel Cutoff', units: 'on/off', normalRange: 'Varies', description: 'Active Fuel Management / Dynamic Fuel Management status', diagnosticRelevance: 'AFM lifter failure is common on 5.3L and 6.2L. Monitor for unusual patterns.' },
  ],
  diagnosticNotes: [
    'LS/LT engines with Active Fuel Management (AFM) or Dynamic Fuel Management (DFM) are prone to lifter failure.',
    'Gen V LT engines with direct injection can have carbon buildup on intake valves.',
    'Dual injection (port + direct) on newer LT engines helps reduce carbon buildup.',
    'LS engines are known for reliable ignition systems but coil packs can fail, especially on high-mileage vehicles.',
    'Oil consumption on 5.3L LS engines (especially 2007-2013) is a known issue related to PCV and ring design.',
    'The LT4 (supercharged 6.2L) has different monitoring requirements than naturally aspirated variants.',
  ],
};

// ─── Exports ─────────────────────────────────────────────────────────────────

export const VEHICLE_PLATFORMS: VehiclePlatform[] = [
  L5P_PLATFORM,
  LML_PLATFORM,
  LBZ_PLATFORM,
  LLY_PLATFORM,
  LB7_PLATFORM,
  LS_LT_PLATFORM,
];

export function getVehiclePlatform(id: string): VehiclePlatform | undefined {
  return VEHICLE_PLATFORMS.find(p => p.id === id);
}

/**
 * Build searchable documents from all vehicle platforms
 * for integration with the existing search engine.
 */
export function buildVehicleSearchDocuments(): KBDocument[] {
  const docs: KBDocument[] = [];

  for (const platform of VEHICLE_PLATFORMS) {
    // Platform overview
    docs.push({
      id: `vehicle-${platform.id}`,
      title: `${platform.name} (${platform.years}) - ${platform.displacement}`,
      source: `PPEI Vehicle Database`,
      category: 'standard',
      tags: [platform.id, platform.engineCode.toLowerCase(), platform.fuelType, 'vehicle', 'platform'],
      content: [
        platform.description,
        '',
        'Key Specifications:',
        ...Object.entries(platform.keySpecs).map(([k, v]) => `${k}: ${v}`),
        '',
        'Diagnostic Notes:',
        ...platform.diagnosticNotes,
      ].join('\n'),
    });

    // Vehicle-specific DTCs
    for (const dtc of platform.commonDTCs) {
      docs.push({
        id: `vehicle-${platform.id}-dtc-${dtc.code}`,
        title: `${platform.name} - ${dtc.code}: ${dtc.description}`,
        source: `PPEI ${platform.name} Database`,
        category: 'dtc',
        tags: [platform.id, 'dtc', dtc.code.toLowerCase(), dtc.severity],
        content: [
          `DTC ${dtc.code}: ${dtc.description}`,
          `Severity: ${dtc.severity}`,
          `Platform: ${platform.name} (${platform.years})`,
          '',
          'Common Causes:',
          ...dtc.commonCauses.map(c => `- ${c}`),
          '',
          'Diagnostic Steps:',
          ...dtc.diagnosticSteps.map((s, i) => `${i + 1}. ${s}`),
        ].join('\n'),
      });
    }

    // Vehicle-specific PIDs
    for (const pid of platform.specificPIDs) {
      docs.push({
        id: `vehicle-${platform.id}-pid-${pid.name.replace(/\s+/g, '-').toLowerCase()}`,
        title: `${platform.name} - ${pid.name}`,
        source: `PPEI ${platform.name} Database`,
        category: 'pid',
        tags: [platform.id, 'pid', pid.name.toLowerCase(), pid.units.toLowerCase()],
        content: [
          `${pid.name} (${platform.name})`,
          pid.pidHex ? `Standard PID: $${pid.pidHex}` : '',
          pid.hpTunersName ? `HP Tuners: ${pid.hpTunersName}` : '',
          pid.efiliveName ? `EFILive: ${pid.efiliveName}` : '',
          pid.banksName ? `Banks Power: ${pid.banksName}` : '',
          `Units: ${pid.units}`,
          `Normal Range: ${pid.normalRange}`,
          `Description: ${pid.description}`,
          `Diagnostic Relevance: ${pid.diagnosticRelevance}`,
        ].filter(Boolean).join('\n'),
      });
    }
  }

  return docs;
}

/**
 * Get a summary of all platforms for the vehicle selector
 */
export function getVehicleSummaries() {
  return VEHICLE_PLATFORMS.map(p => ({
    id: p.id,
    name: p.name,
    engineCode: p.engineCode,
    years: p.years,
    displacement: p.displacement,
    fuelType: p.fuelType,
    dtcCount: p.commonDTCs.length,
    pidCount: p.specificPIDs.length,
  }));
}
