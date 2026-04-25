import { describe, it, expect } from 'vitest';
import { GM_EXTENDED_PIDS, PID_PRESETS, type PIDDefinition } from './obdConnection';

// Helper to find a PID definition by pid number, optional ecuHeader and fuelType
function findPid(pid: number, ecuHeader?: string, fuelType?: string): PIDDefinition | undefined {
  if (ecuHeader && fuelType) {
    return GM_EXTENDED_PIDS.find((p) => p.pid === pid && p.ecuHeader === ecuHeader && p.fuelType === fuelType);
  }
  if (ecuHeader) {
    return GM_EXTENDED_PIDS.find((p) => p.pid === pid && p.ecuHeader === ecuHeader);
  }
  if (fuelType) {
    return GM_EXTENDED_PIDS.find((p) => p.pid === pid && p.fuelType === fuelType);
  }
  return GM_EXTENDED_PIDS.find((p) => p.pid === pid);
}

// Helper to find E90 gas truck PIDs specifically
function findE90Pid(pid: number, ecuHeader?: string): PIDDefinition | undefined {
  return findPid(pid, ecuHeader ?? '7E0', 'gasoline');
}

describe('E90 ECM Extended PIDs', () => {
  it('should have Engine Oil Pressure (0x119C) on 7E0', () => {
    const pid = findE90Pid(0x119C);
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('ENGOILP');
    expect(pid!.ecuHeader).toBe('7E0');
    expect(pid!.fuelType).toBe('gasoline');
    expect(pid!.service).toBe(0x22);
  });

  it('should have MAF Raw Frequency (0x12DA) on 7E0', () => {
    const pid = findE90Pid(0x12DA);
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('MAFFREQ2');
    expect(pid!.unit).toBe('Hz');
  });

  it('should have Fuel Rail Pressure Desired (0x131F) on 7E0 (diesel)', () => {
    const pid = findPid(0x131F, '7E0', 'diesel');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('FRPDI');
  });

  it('should have MAP Unfiltered (0x1470) on 7E0', () => {
    const pid = findE90Pid(0x1470);
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('MAPU');
  });

  it('should have TC Desired Boost Pressure (0x2012) on 7E0', () => {
    const pid = findE90Pid(0x2012);
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TCDBPR');
    expect(pid!.category).toBe('turbo');
  });

  it('should have AFM Inhibit Reason 2 (0x328A) on 7E0', () => {
    const pid = findE90Pid(0x328A);
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('AFMIR2');
    expect(pid!.fuelType).toBe('gasoline');
  });

  it('should have all 8 E90 gas-specific ECM DIDs', () => {
    // 0x131F and 0x208A are diesel-only, not gasoline
    const ecmDids = [0x119C, 0x12DA, 0x1470, 0x2012, 0x204D, 0x248B, 0x308A, 0x328A];
    for (const did of ecmDids) {
      const pid = findE90Pid(did);
      expect(pid).toBeDefined();
      expect(pid!.ecuHeader).toBe('7E0');
      expect(pid!.manufacturer).toBe('gm');
      expect(pid!.fuelType).toBe('gasoline');
      expect(pid!.service).toBe(0x22);
    }
  });
});

describe('T87A TCM Extended PIDs (on 7E2, NOT 7E1)', () => {
  // T87A is the 10L80 TCM used on both gas and diesel GM trucks (2019+).
  // T87A, T87, T93, A50, A40, AL5 are all different TCM variants with different protocols.
  // These 8 DIDs were confirmed via IntelliSpy CAN capture + HP Tuners DDDI source analysis
  // on a 2019 L5P Duramax.

  it('should have Trans Input Speed (0x1941) on 7E2', () => {
    const pid = findPid(0x1941, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TIS_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.fuelType).toBe('any');
    expect(pid!.unit).toBe('rpm');
  });

  it('should have Trans Output Speed (0x1942) on 7E2', () => {
    const pid = findPid(0x1942, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TOS_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.unit).toBe('rpm');
  });

  it('should have TCC Commanded Pressure (0x194F) on 7E2', () => {
    const pid = findPid(0x194F, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TCCP_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.unit).toBe('PSI');
  });

  it('should have Battery Voltage TCM (0x1991) on 7E2', () => {
    const pid = findPid(0x1991, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('VOLTS_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.unit).toBe('V');
  });

  it('should have PRNDL Position (0x1141) on 7E2', () => {
    const pid = findPid(0x1141, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('PRNDL_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
  });

  it('should have Engine Torque Commanded TCM (0x199A) on 7E2', () => {
    const pid = findPid(0x199A, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TRQENG_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.unit).toBe('lb·ft');
  });

  it('should have TCC Reference Slip (0x19D4) on 7E2', () => {
    const pid = findPid(0x19D4, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TCCRS_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.unit).toBe('rpm');
  });

  it('should have TCC Line Pressure (0x281C) on 7E2', () => {
    const pid = findPid(0x281C, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TCCLP_T87A');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.unit).toBe('PSI');
  });

  it('should have exactly 8 confirmed T87A TCM PIDs on 7E2 (GM manufacturer)', () => {
    const t87aPids = GM_EXTENDED_PIDS.filter(
      (p) => p.ecuHeader === '7E2' && p.manufacturer === 'gm'
    );
    expect(t87aPids.length).toBe(8);
    for (const pid of t87aPids) {
      expect(pid.fuelType).toBe('any');
      expect(pid.service).toBe(0x22);
    }
  });

  it('all T87A PIDs should be on 7E2 (not 7E1)', () => {
    const t87aPids = GM_EXTENDED_PIDS.filter(
      (p) => p.shortName?.includes('T87A')
    );
    expect(t87aPids.length).toBe(8);
    for (const pid of t87aPids) {
      expect(pid.ecuHeader).toBe('7E2');
    }
  });

  it('should NOT have any old T93-labeled PIDs', () => {
    const t93Pids = GM_EXTENDED_PIDS.filter(
      (p) => p.shortName?.includes('_T93') && p.ecuHeader === '7E2' && p.manufacturer === 'gm'
    );
    expect(t93Pids.length).toBe(0);
  });
});

describe('E90 Preset Profiles', () => {
  it('should have an Engine Basics preset', () => {
    const basics = PID_PRESETS.find((p) => p.name.includes('Engine Basics'));
    expect(basics).toBeDefined();
    expect(basics!.pids.length).toBeGreaterThan(0);
  });
});

describe('PID Formula Sanity Checks', () => {
  it('Engine Oil Pressure formula should produce reasonable values', () => {
    const pid = findE90Pid(0x119C);
    expect(pid).toBeDefined();
    const value = pid!.formula([0x0D, 0x48]); // 3400 raw
    expect(value).toBeCloseTo(49.3, 0);
  });

  it('T87A TCC Reference Slip formula should handle signed values', () => {
    const pid = findPid(0x19D4, '7E2');
    expect(pid).toBeDefined();
    // 0 slip = 32768 → [0x80, 0x00], × 0.125 = 0
    expect(pid!.formula([0x80, 0x00])).toBe(0);
    // Positive slip: 32768 + 800 = 33568 → [0x83, 0x20], × 0.125 = 100
    expect(pid!.formula([0x83, 0x20])).toBe(100);
    // Negative slip: 32768 - 800 = 31968 → [0x7C, 0xE0], × 0.125 = -100
    expect(pid!.formula([0x7C, 0xE0])).toBe(-100);
  });

  it('T87A Trans Input Speed formula should produce RPM with 0.25 resolution', () => {
    const pid = findPid(0x1941, '7E2');
    expect(pid).toBeDefined();
    // ~601 RPM at idle: raw = 601/0.25 = 2404 → [0x09, 0x64]
    expect(pid!.formula([0x09, 0x64])).toBeCloseTo(601, 0);
    // 0 RPM
    expect(pid!.formula([0x00, 0x00])).toBe(0);
  });

  it('T87A Battery Voltage TCM formula should produce reasonable voltage', () => {
    const pid = findPid(0x1991, '7E2');
    expect(pid).toBeDefined();
    // 14.3V = raw 14300 → [0x37, 0xDC]
    expect(pid!.formula([0x37, 0xDC])).toBeCloseTo(14.3, 1);
  });

  it('T87A PRNDL Position formula should return raw byte', () => {
    const pid = findPid(0x1141, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.formula([0x00])).toBe(0); // Park
    expect(pid!.formula([0x01])).toBe(1); // Reverse
    expect(pid!.formula([0x06])).toBe(6); // D6
  });

  it('T87A TCC Commanded Pressure formula should convert kPa to PSI', () => {
    const pid = findPid(0x194F, '7E2');
    expect(pid).toBeDefined();
    // 0 PSI at idle
    expect(pid!.formula([0x00, 0x00])).toBe(0);
    // ~4.28 PSI: raw = 4.28 / (0.1 * 0.145038) ≈ 295 → [0x01, 0x27]
    expect(pid!.formula([0x01, 0x27])).toBeCloseTo(4.28, 0);
  });
});
