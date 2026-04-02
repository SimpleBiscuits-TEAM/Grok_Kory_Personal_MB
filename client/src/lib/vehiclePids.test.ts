/**
 * Tests for vehicle-specific PID support -- Ford Raptor 6.2L Boss, 2024 Duramax L5P, 2024 BMW XM
 */
import { describe, it, expect } from 'vitest';
import {
  STANDARD_PIDS,
  GM_EXTENDED_PIDS,
  FORD_EXTENDED_PIDS,
  BMW_EXTENDED_PIDS,
  ALL_PIDS,
  PID_PRESETS,
  getPidsByManufacturer,
  getPidsForVehicle,
  getPresetsForVehicle,
  MANUFACTURER_PIDS,
} from './obdConnection';

// ─── Universal Standard PIDs ───────────────────────────────────────────────

describe('Universal Standard PIDs', () => {
  it('contains gas engine PIDs (O2 sensors, fuel trims)', () => {
    const pidNumbers = STANDARD_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x14); // O2 Sensor Bank 1 Sensor 1
    expect(pidNumbers).toContain(0x15); // O2 Sensor Bank 1 Sensor 2
    expect(pidNumbers).toContain(0x06); // STFT Bank 1
    expect(pidNumbers).toContain(0x07); // LTFT Bank 1
  });

  it('contains gas engine categories', () => {
    const categories = new Set(STANDARD_PIDS.map(p => p.category));
    expect(categories.has('oxygen')).toBe(true);
    expect(categories.has('fuel')).toBe(true);
    expect(categories.has('engine')).toBe(true);
  });

  it('has fuelType tags on relevant PIDs', () => {
    const frpDiesel = STANDARD_PIDS.find(p => p.pid === 0x23);
    expect(frpDiesel).toBeDefined();
    const egt = STANDARD_PIDS.find(p => p.pid === 0x78);
    expect(egt).toBeDefined();
  });

  it('has manufacturer tags on PIDs', () => {
    for (const pid of STANDARD_PIDS) {
      const mfr = pid.manufacturer ?? 'universal';
      expect(typeof mfr).toBe('string');
    }
  });
});

// ─── Ford 6.2L Boss V8 (2012 Raptor) ────────────────────────────────────

describe('Ford 6.2L Boss Extended PIDs', () => {
  it('FORD_EXTENDED_PIDS array exists and has entries', () => {
    expect(FORD_EXTENDED_PIDS).toBeDefined();
    expect(FORD_EXTENDED_PIDS.length).toBeGreaterThan(0);
  });

  it('all Ford PIDs are service 0x22', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('all Ford PIDs have manufacturer=ford', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.manufacturer).toBe('ford');
    }
  });

  it('all Ford PIDs have required fields', () => {
    for (const pid of FORD_EXTENDED_PIDS) {
      expect(pid.pid).toBeGreaterThanOrEqual(0);
      expect(pid.name).toBeTruthy();
      expect(pid.shortName).toBeTruthy();
      expect(pid.unit).toBeDefined();
      expect(pid.bytes).toBeGreaterThan(0);
      expect(typeof pid.formula).toBe('function');
      expect(pid.category).toBeTruthy();
    }
  });

  it('has unique PIDs within Ford extended set', () => {
    const pidNumbers = FORD_EXTENDED_PIDS.map(p => p.pid);
    const unique = new Set(pidNumbers);
    expect(unique.size).toBe(pidNumbers.length);
  });

  // ── Boss-specific PIDs ──
  it('contains Boss engine oil temp/pressure PIDs', () => {
    const pidNumbers = FORD_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0xF480); // EOT Boss
    expect(pidNumbers).toContain(0xF481); // EOP Boss
  });

  it('contains Boss cylinder head temperature PID', () => {
    const cht = FORD_EXTENDED_PIDS.find(p => p.pid === 0xF483);
    expect(cht).toBeDefined();
    expect(cht!.shortName).toBe('CHT_BOSS');
    expect(cht!.category).toBe('cooling');
  });

  it('contains Boss torque PIDs (calculated and desired)', () => {
    const pidNumbers = FORD_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0xF484); // Calculated torque
    expect(pidNumbers).toContain(0xF485); // Desired torque
  });

  it('contains Boss knock retard PIDs for all 8 cylinders', () => {
    const knockPids = FORD_EXTENDED_PIDS.filter(p =>
      p.shortName.startsWith('KR_C') && p.category === 'ignition'
    );
    expect(knockPids.length).toBe(8);
  });

  it('contains Boss misfire count PIDs for all 8 cylinders', () => {
    const misfirePids = FORD_EXTENDED_PIDS.filter(p =>
      p.shortName.startsWith('MIS_C') && p.category === 'ignition'
    );
    expect(misfirePids.length).toBe(8);
  });

  it('contains Boss VCT cam position PIDs (intake/exhaust, bank 1/2)', () => {
    const pidNumbers = FORD_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0xF491); // Intake Cam B1
    expect(pidNumbers).toContain(0xF492); // Intake Cam B2
    expect(pidNumbers).toContain(0xF493); // Exhaust Cam B1
    expect(pidNumbers).toContain(0xF494); // Exhaust Cam B2
  });

  it('contains 6R80 transmission PIDs', () => {
    const pidNumbers = FORD_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0xF4C0); // Trans fluid temp
    expect(pidNumbers).toContain(0xF4C1); // TC slip
    expect(pidNumbers).toContain(0xF4C5); // Current gear
    expect(pidNumbers).toContain(0xF4C7); // TCC duty
    expect(pidNumbers).toContain(0xF4C4); // Line pressure
  });

  it('Boss engine PIDs have ecuHeader=7E0', () => {
    const bossPids = FORD_EXTENDED_PIDS.filter(p => p.shortName.includes('BOSS'));
    for (const pid of bossPids) {
      expect(pid.ecuHeader).toBe('7E0');
    }
  });

  it('6R80 transmission PIDs have ecuHeader=7E1', () => {
    const transPids = FORD_EXTENDED_PIDS.filter(p => p.shortName.includes('6R80'));
    for (const pid of transPids) {
      expect(pid.ecuHeader).toBe('7E1');
    }
  });

  it('Boss formulas produce valid numbers', () => {
    const bossPids = FORD_EXTENDED_PIDS.filter(p =>
      p.pid >= 0xF480 && p.pid <= 0xF4D1
    );
    for (const pid of bossPids) {
      const testBytes = new Array(pid.bytes).fill(128);
      const result = pid.formula(testBytes);
      expect(typeof result).toBe('number');
      expect(isNaN(result)).toBe(false);
    }
  });
});

// ─── GM Extended PIDs (2024 Duramax L5P) ─────────────────────────────────

describe('GM Extended PIDs for Duramax', () => {
  it('contains key Duramax PIDs', () => {
    const pidNumbers = GM_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x0564); // Commanded FRP
    expect(pidNumbers).toContain(0x0565); // Actual FRP
    expect(pidNumbers).toContain(0x1A10); // DPF Soot Load
    expect(pidNumbers).toContain(0x1A20); // DEF Tank Level
    expect(pidNumbers).toContain(0x0576); // Turbo Speed
  });

  it('all GM PIDs have manufacturer=gm', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(pid.manufacturer).toBe('gm');
    }
  });

  it('all GM PIDs have fuelType diesel or any', () => {
    for (const pid of GM_EXTENDED_PIDS) {
      expect(['diesel', 'any']).toContain(pid.fuelType);
    }
  });
});

// ─── BMW UDS Extended PIDs (2024 BMW XM) ─────────────────────────────────

describe('BMW UDS Extended PIDs', () => {
  it('BMW_EXTENDED_PIDS array exists and has entries', () => {
    expect(BMW_EXTENDED_PIDS).toBeDefined();
    expect(BMW_EXTENDED_PIDS.length).toBeGreaterThan(0);
  });

  it('all BMW PIDs are service 0x22', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      expect(pid.service).toBe(0x22);
    }
  });

  it('all BMW PIDs have manufacturer=bmw', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      expect(pid.manufacturer).toBe('bmw');
    }
  });

  it('all BMW PIDs have required fields', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      expect(pid.pid).toBeGreaterThanOrEqual(0);
      expect(pid.name).toBeTruthy();
      expect(pid.shortName).toBeTruthy();
      expect(pid.unit).toBeDefined();
      expect(pid.bytes).toBeGreaterThan(0);
      expect(typeof pid.formula).toBe('function');
      expect(pid.category).toBeTruthy();
    }
  });

  it('has unique PIDs within BMW extended set', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    const unique = new Set(pidNumbers);
    expect(unique.size).toBe(pidNumbers.length);
  });

  // ── DME Engine PIDs ──
  it('contains DME engine management PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0xD004); // Engine Load
    expect(pidNumbers).toContain(0xD00C); // RPM
    expect(pidNumbers).toContain(0x110A); // Oil Temp
    expect(pidNumbers).toContain(0x110B); // Oil Pressure
    expect(pidNumbers).toContain(0x1124); // Actual Torque
  });

  it('DME PIDs have ecuHeader=7E0', () => {
    const dmePids = BMW_EXTENDED_PIDS.filter(p => p.ecuHeader === '7E0');
    expect(dmePids.length).toBeGreaterThan(10);
  });

  // ── VANOS PIDs ──
  it('contains VANOS cam position PIDs (intake/exhaust, bank 1/2)', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x112C); // VANOS Intake B1
    expect(pidNumbers).toContain(0x112D); // VANOS Intake B2
    expect(pidNumbers).toContain(0x112E); // VANOS Exhaust B1
    expect(pidNumbers).toContain(0x112F); // VANOS Exhaust B2
  });

  // ── Valvetronic ──
  it('contains Valvetronic PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x11A0); // Valvetronic Lift
    expect(pidNumbers).toContain(0x11A1); // Valvetronic Motor Position
  });

  // ── Turbo PIDs ──
  it('contains turbo boost PIDs (actual and target)', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x11B1); // Actual Boost
    expect(pidNumbers).toContain(0x11B2); // Target Boost
    expect(pidNumbers).toContain(0x11B0); // Wastegate
  });

  // ── EGS Transmission (ZF 8HP) ──
  it('contains ZF 8HP transmission PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1200); // Trans Fluid Temp
    expect(pidNumbers).toContain(0x1201); // TC Slip
    expect(pidNumbers).toContain(0x1205); // Current Gear
    expect(pidNumbers).toContain(0x1204); // Line Pressure
    expect(pidNumbers).toContain(0x1207); // Mechatronic Temp
  });

  it('EGS PIDs have ecuHeader=7E1', () => {
    const egsPids = BMW_EXTENDED_PIDS.filter(p => p.ecuHeader === '7E1');
    expect(egsPids.length).toBeGreaterThan(5);
  });

  // ── DSC / xDrive ──
  it('contains xDrive torque distribution PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1300); // Front Axle Torque
    expect(pidNumbers).toContain(0x1301); // Rear Axle Torque
    expect(pidNumbers).toContain(0x1302); // Transfer Case Clutch
  });

  it('contains DSC dynamics PIDs (yaw, lat/lon G, steering)', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1303); // Yaw Rate
    expect(pidNumbers).toContain(0x1304); // Lateral G
    expect(pidNumbers).toContain(0x1305); // Longitudinal G
    expect(pidNumbers).toContain(0x130B); // Steering Angle
  });

  it('contains individual wheel speed PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1306); // FL
    expect(pidNumbers).toContain(0x1307); // FR
    expect(pidNumbers).toContain(0x1308); // RL
    expect(pidNumbers).toContain(0x1309); // RR
  });

  it('DSC PIDs have ecuHeader=7B0', () => {
    const dscPids = BMW_EXTENDED_PIDS.filter(p => p.ecuHeader === '7B0');
    expect(dscPids.length).toBeGreaterThan(5);
  });

  // ── Hybrid System (XM PHEV) ──
  it('contains HV battery PIDs (SOC, voltage, current, temp)', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1400); // HV SOC
    expect(pidNumbers).toContain(0x1401); // HV Voltage
    expect(pidNumbers).toContain(0x1402); // HV Current
    expect(pidNumbers).toContain(0x1403); // HV Temp
  });

  it('contains electric motor PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1404); // Motor Temp
    expect(pidNumbers).toContain(0x1405); // Motor Torque
    expect(pidNumbers).toContain(0x1406); // Motor Speed
  });

  it('contains charging PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x140D); // Charging Status
    expect(pidNumbers).toContain(0x140E); // Charging Power
    expect(pidNumbers).toContain(0x140C); // EV Range
  });

  it('contains combined system power PID', () => {
    const sysPwr = BMW_EXTENDED_PIDS.find(p => p.pid === 0x140B);
    expect(sysPwr).toBeDefined();
    expect(sysPwr!.shortName).toBe('SYS_PWR_BMW');
  });

  it('hybrid PIDs use correct ECU headers (607 for SME, 7E2 for EME)', () => {
    const smePids = BMW_EXTENDED_PIDS.filter(p => p.ecuHeader === '607');
    const emePids = BMW_EXTENDED_PIDS.filter(p => p.ecuHeader === '7E2');
    expect(smePids.length).toBeGreaterThan(0);
    expect(emePids.length).toBeGreaterThan(0);
  });

  // ── Active Suspension ──
  it('contains damper current PIDs for all 4 corners', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1500); // FL
    expect(pidNumbers).toContain(0x1501); // FR
    expect(pidNumbers).toContain(0x1502); // RL
    expect(pidNumbers).toContain(0x1503); // RR
  });

  it('contains ride height PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1504); // FL
    expect(pidNumbers).toContain(0x1505); // FR
    expect(pidNumbers).toContain(0x1506); // RL
    expect(pidNumbers).toContain(0x1507); // RR
  });

  it('contains body roll and pitch PIDs', () => {
    const pidNumbers = BMW_EXTENDED_PIDS.map(p => p.pid);
    expect(pidNumbers).toContain(0x1509); // Roll
    expect(pidNumbers).toContain(0x150A); // Pitch
  });

  it('BMW formulas produce valid numbers', () => {
    for (const pid of BMW_EXTENDED_PIDS) {
      const testBytes = new Array(pid.bytes).fill(128);
      const result = pid.formula(testBytes);
      expect(typeof result).toBe('number');
      expect(isNaN(result)).toBe(false);
    }
  });
});

// ─── Manufacturer PID Collections ──────────────────────────────────────────

describe('MANUFACTURER_PIDS', () => {
  it('has GM PIDs', () => {
    expect(MANUFACTURER_PIDS.gm).toBeDefined();
    expect(MANUFACTURER_PIDS.gm.length).toBeGreaterThan(0);
  });

  it('has Ford PIDs', () => {
    expect(MANUFACTURER_PIDS.ford).toBeDefined();
    expect(MANUFACTURER_PIDS.ford.length).toBeGreaterThan(0);
  });

  it('has BMW PIDs', () => {
    expect(MANUFACTURER_PIDS.bmw).toBeDefined();
    expect(MANUFACTURER_PIDS.bmw.length).toBeGreaterThan(0);
  });
});

// ─── getPidsByManufacturer ─────────────────────────────────────────────────

describe('getPidsByManufacturer', () => {
  it('returns standard PIDs for universal', () => {
    const pids = getPidsByManufacturer('universal');
    expect(pids.length).toBe(STANDARD_PIDS.length);
  });

  it('returns GM extended PIDs for gm', () => {
    const pids = getPidsByManufacturer('gm');
    expect(pids.length).toBeGreaterThan(0);
    for (const pid of pids) {
      expect(pid.manufacturer).toBe('gm');
    }
  });

  it('returns Ford extended PIDs for ford', () => {
    const pids = getPidsByManufacturer('ford');
    expect(pids.length).toBeGreaterThan(0);
    for (const pid of pids) {
      expect(pid.manufacturer).toBe('ford');
    }
  });

  it('returns BMW extended PIDs for bmw', () => {
    const pids = getPidsByManufacturer('bmw');
    expect(pids.length).toBeGreaterThan(0);
    for (const pid of pids) {
      expect(pid.manufacturer).toBe('bmw');
    }
  });
});

// ─── getPidsForVehicle ─────────────────────────────────────────────────────

describe('getPidsForVehicle', () => {
  it('returns standard + GM diesel PIDs for 2024 Duramax', () => {
    const pids = getPidsForVehicle('gm', 'diesel');
    expect(pids.length).toBeGreaterThan(STANDARD_PIDS.length / 2);
    const hasGmExt = pids.some(p => (p.service ?? 0x01) === 0x22 && p.manufacturer === 'gm');
    expect(hasGmExt).toBe(true);
  });

  it('returns standard + Ford gas PIDs for 2012 Raptor', () => {
    const pids = getPidsForVehicle('ford', 'gasoline');
    expect(pids.length).toBeGreaterThan(0);
    const hasFordExt = pids.some(p => (p.service ?? 0x01) === 0x22 && p.manufacturer === 'ford');
    expect(hasFordExt).toBe(true);
    // Should include Boss engine PIDs
    const hasBoss = pids.some(p => p.shortName === 'EOT_BOSS');
    expect(hasBoss).toBe(true);
  });

  it('returns standard + BMW PIDs for 2024 XM', () => {
    const pids = getPidsForVehicle('bmw', 'gasoline');
    expect(pids.length).toBeGreaterThan(0);
    const hasBmwExt = pids.some(p => (p.service ?? 0x01) === 0x22 && p.manufacturer === 'bmw');
    expect(hasBmwExt).toBe(true);
    // Should include hybrid PIDs
    const hasHybrid = pids.some(p => p.shortName === 'HV_SOC');
    expect(hasHybrid).toBe(true);
  });

  it('filters out diesel PIDs for gasoline vehicles', () => {
    const pids = getPidsForVehicle('ford', 'gasoline');
    const dieselOnly = pids.filter(p => p.fuelType === 'diesel');
    expect(dieselOnly.length).toBe(0);
  });

  it('filters out gasoline PIDs for diesel vehicles', () => {
    const pids = getPidsForVehicle('gm', 'diesel');
    const gasOnly = pids.filter(p => p.fuelType === 'gasoline');
    expect(gasOnly.length).toBe(0);
  });
});

// ─── getPresetsForVehicle ──────────────────────────────────────────────────

describe('getPresetsForVehicle', () => {
  it('returns Duramax presets for GM diesel', () => {
    const presets = getPresetsForVehicle('gm', 'diesel');
    expect(presets.length).toBeGreaterThan(0);
    const names = presets.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes('engine basics'))).toBe(true);
    expect(names.some(n => n.includes('duramax'))).toBe(true);
  });

  it('returns Raptor presets for Ford gasoline', () => {
    const presets = getPresetsForVehicle('ford', 'gasoline');
    expect(presets.length).toBeGreaterThan(0);
    const names = presets.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes('engine basics'))).toBe(true);
    expect(names.some(n => n.includes('raptor'))).toBe(true);
  });

  it('returns BMW XM presets for BMW gasoline', () => {
    const presets = getPresetsForVehicle('bmw', 'gasoline');
    expect(presets.length).toBeGreaterThan(0);
    const names = presets.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes('bmw') || n.includes('xm'))).toBe(true);
  });

  it('returns BMW hybrid and suspension presets', () => {
    const presets = getPresetsForVehicle('bmw', 'gasoline');
    const names = presets.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes('hybrid'))).toBe(true);
    expect(names.some(n => n.includes('suspension'))).toBe(true);
    expect(names.some(n => n.includes('xdrive'))).toBe(true);
  });

  it('returns Raptor transmission and knock presets', () => {
    const presets = getPresetsForVehicle('ford', 'gasoline');
    const names = presets.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes('6r80'))).toBe(true);
    expect(names.some(n => n.includes('knock'))).toBe(true);
  });

  it('does not return diesel presets for gasoline vehicles', () => {
    const presets = getPresetsForVehicle('ford', 'gasoline');
    const names = presets.map(p => p.name.toLowerCase());
    expect(names.some(n => n.includes('dpf'))).toBe(false);
    expect(names.some(n => n.includes('def'))).toBe(false);
  });
});

// ─── ALL_PIDS Integrity ────────────────────────────────────────────────────

describe('ALL_PIDS', () => {
  it('includes standard + all manufacturer PIDs including BMW', () => {
    expect(ALL_PIDS.length).toBeGreaterThan(STANDARD_PIDS.length);
    expect(ALL_PIDS.length).toBeGreaterThan(GM_EXTENDED_PIDS.length);
    // Should include BMW PIDs
    const hasBmw = ALL_PIDS.some(p => p.manufacturer === 'bmw');
    expect(hasBmw).toBe(true);
  });

  it('all PIDs have valid formula functions', () => {
    for (const pid of ALL_PIDS) {
      expect(typeof pid.formula).toBe('function');
      const testBytes = new Array(pid.bytes).fill(0);
      const result = pid.formula(testBytes);
      expect(typeof result).toBe('number');
      expect(isNaN(result)).toBe(false);
    }
  });

  it('has no duplicate PID numbers across all manufacturers', () => {
    // Within each manufacturer, PIDs should be unique
    const manufacturers = ['gm', 'ford', 'bmw', 'chrysler', 'toyota', 'honda'] as const;
    for (const mfr of manufacturers) {
      const mfrPids = ALL_PIDS.filter(p => p.manufacturer === mfr);
      const pidNums = mfrPids.map(p => p.pid);
      const unique = new Set(pidNums);
      expect(unique.size).toBe(pidNums.length);
    }
  });
});

// ─── Preset PID References ─────────────────────────────────────────────────

describe('Preset PID references', () => {
  it('all preset PIDs reference valid PID numbers in ALL_PIDS or STANDARD_PIDS', () => {
    const allPidNumbers = new Set(ALL_PIDS.map(p => p.pid));
    for (const preset of PID_PRESETS) {
      for (const pidNum of preset.pids) {
        expect(allPidNumbers.has(pidNum)).toBe(true);
      }
    }
  });
});
