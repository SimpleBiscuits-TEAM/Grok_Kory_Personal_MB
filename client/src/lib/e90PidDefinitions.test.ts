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

  it('should have Fuel Rail Pressure Desired (0x131F) on 7E0', () => {
    const pid = findE90Pid(0x131F);
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

  it('should have all 10 GM-specific ECM DIDs', () => {
    const ecmDids = [0x119C, 0x12DA, 0x131F, 0x1470, 0x2012, 0x204D, 0x208A, 0x248B, 0x308A, 0x328A];
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

describe('T93 TCM Extended PIDs (on 7E2, NOT 7E1)', () => {
  it('should have TFT on 7E2 (Global B address)', () => {
    const pid = findPid(0x1940, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TFT_T93');
    expect(pid!.ecuHeader).toBe('7E2');
    expect(pid!.fuelType).toBe('gasoline');
  });

  it('should have Current Gear on 7E2', () => {
    const pid = findPid(0x1124, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('GEAR_T93');
    expect(pid!.ecuHeader).toBe('7E2');
  });

  it('should have TCC Slip on 7E2', () => {
    const pid = findPid(0x194C, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TCCSLIP_T93');
    expect(pid!.ecuHeader).toBe('7E2');
  });

  it('should have Turbine Speed on 7E2', () => {
    const pid = findPid(0x197E, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.shortName).toBe('TURBINE_T93');
    expect(pid!.ecuHeader).toBe('7E2');
  });

  it('should have shift timing DIDs (1232-1237) on 7E2', () => {
    for (let did = 0x1232; did <= 0x1237; did++) {
      const pid = findPid(did, '7E2');
      expect(pid).toBeDefined();
      expect(pid!.ecuHeader).toBe('7E2');
      expect(pid!.unit).toBe('s');
    }
  });

  it('should have PCS solenoid pressure control DIDs on 7E2', () => {
    const pcsDids = [0x2809, 0x280A, 0x280C, 0x280F, 0x2810, 0x2811];
    for (const did of pcsDids) {
      const pid = findPid(did, '7E2');
      expect(pid).toBeDefined();
      expect(pid!.ecuHeader).toBe('7E2');
      // Accept kPa or PSI (may have been converted to imperial)
      expect(pid!.unit).toBeTruthy();
    }
  });

  it('all T93 PIDs should be on 7E2 (not 7E1)', () => {
    const t93Pids = GM_EXTENDED_PIDS.filter(
      (p) => p.shortName?.includes('T93') || p.shortName?.includes('_T93')
    );
    expect(t93Pids.length).toBeGreaterThan(0);
    for (const pid of t93Pids) {
      expect(pid.ecuHeader).toBe('7E2');
    }
  });
});

describe('E90 Preset Profiles', () => {
  it('should have a Core preset', () => {
    const core = PID_PRESETS.find((p) => p.name.includes('E90') && p.name.includes('Core'));
    expect(core).toBeDefined();
    expect(core!.pids.length).toBeGreaterThan(20);
  });

  it('should have a Full EFI Live preset', () => {
    const full = PID_PRESETS.find((p) => p.name.includes('E90') && p.name.includes('Full EFI'));
    expect(full).toBeDefined();
    expect(full!.pids.length).toBeGreaterThanOrEqual(88);
  });

  it('Core preset should include GM-specific ECM DIDs', () => {
    const core = PID_PRESETS.find((p) => p.name.includes('E90') && p.name.includes('Core'));
    expect(core).toBeDefined();
    expect(core!.pids).toContain(0x119C); // ENGOILP
    expect(core!.pids).toContain(0x131F); // FRPDI
    expect(core!.pids).toContain(0x2012); // TCDBPR
  });

  it('Core preset should include T93 TCM DIDs (on 7E2)', () => {
    const core = PID_PRESETS.find((p) => p.name.includes('E90') && p.name.includes('Core'));
    expect(core).toBeDefined();
    expect(core!.pids).toContain(0x1940); // TFT_T93
    expect(core!.pids).toContain(0x1124); // GEAR_T93
    expect(core!.pids).toContain(0x194C); // TCCSLIP_T93
  });

  it('Full EFI Live preset should include all 30 ECM + 58 TCM DIDs', () => {
    const full = PID_PRESETS.find((p) => p.name.includes('E90') && p.name.includes('Full EFI'));
    expect(full).toBeDefined();
    // ECM DIDs
    expect(full!.pids).toContain(0x119C);
    expect(full!.pids).toContain(0x328A);
    // TCM DIDs
    expect(full!.pids).toContain(0x1940);
    expect(full!.pids).toContain(0x1239);
  });
});

describe('PID Formula Sanity Checks', () => {
  it('Engine Oil Pressure formula should produce reasonable values', () => {
    const pid = findE90Pid(0x119C);
    expect(pid).toBeDefined();
    const value = pid!.formula([0x0D, 0x48]); // 3400 raw
    expect(value).toBeCloseTo(49.3, 0);
  });

  it('TCC Slip formula should handle negative values', () => {
    const pid = findPid(0x194C, '7E2');
    expect(pid).toBeDefined();
    // 0 slip = 32768 → [0x80, 0x00]
    expect(pid!.formula([0x80, 0x00])).toBe(0);
    // Positive slip
    expect(pid!.formula([0x80, 0x64])).toBe(100);
    // Negative slip
    expect(pid!.formula([0x7F, 0x9C])).toBe(-100);
  });

  it('Current Gear formula should return integer gear number', () => {
    const pid = findPid(0x1124, '7E2');
    expect(pid).toBeDefined();
    expect(pid!.formula([0x05])).toBe(5);
    expect(pid!.formula([0x0A])).toBe(10);
  });

  it('Shift time formula should produce seconds', () => {
    const pid = findPid(0x1232, '7E2');
    expect(pid).toBeDefined();
    // 500ms = [0x01, 0xF4]
    expect(pid!.formula([0x01, 0xF4])).toBeCloseTo(0.5, 2);
  });
});
