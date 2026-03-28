import { describe, expect, it } from 'vitest';
import {
  CANAM_EXTENDED_PIDS, SEADOO_EXTENDED_PIDS, POLARIS_EXTENDED_PIDS, KAWASAKI_EXTENDED_PIDS,
  POWERSPORTS_PRESETS, getPowersportsPresets,
  detectPowersportsFromVin, getPowersportsPids, getAllPowersportsPids,
  POWERSPORTS_WMI_CODES,
} from './powersportsPids';
import {
  UDS_SERVICES, NRC_CODES, UDS_DIDS,
  SECURITY_ACCESS_PROCEDURES,
  CANAM_CUAKEYA, CANAM_CUCAKEYSB,
  computeCanamKey, computeBrpDashKey, computePolarisKey,
  computeFordMG1Key, computeCumminsKey,
  LOGGER_LEVELS, getDidsForLevel, getDidsGroupedByCategory,
  getSecurityProcedure, getRoutinesForPlatform, getIOControlsForPlatform,
  getUDSService, decodeNRC,
  ROUTINE_CONTROLS, IO_CONTROLS,
} from './udsReference';

// ═══════════════════════════════════════════════════════════════════════════
// Powersports PID Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Powersports PIDs', () => {
  it('CAN-am PIDs have valid structure', () => {
    expect(CANAM_EXTENDED_PIDS.length).toBeGreaterThanOrEqual(20);
    for (const pid of CANAM_EXTENDED_PIDS) {
      expect(pid.name.length).toBeGreaterThan(0);
      expect(typeof pid.unit).toBe('string');
      expect(typeof pid.pid).toBe('number');
    }
  });

  it('Sea-Doo PIDs have valid structure', () => {
    expect(SEADOO_EXTENDED_PIDS.length).toBeGreaterThanOrEqual(15);
    for (const pid of SEADOO_EXTENDED_PIDS) {
      expect(pid.name.length).toBeGreaterThan(0);
    }
  });

  it('Polaris PIDs have valid structure', () => {
    expect(POLARIS_EXTENDED_PIDS.length).toBeGreaterThanOrEqual(20);
    for (const pid of POLARIS_EXTENDED_PIDS) {
      expect(pid.name.length).toBeGreaterThan(0);
    }
  });

  it('Kawasaki PIDs have valid structure', () => {
    expect(KAWASAKI_EXTENDED_PIDS.length).toBeGreaterThanOrEqual(10);
    for (const pid of KAWASAKI_EXTENDED_PIDS) {
      expect(pid.name.length).toBeGreaterThan(0);
    }
  });

  it('Powersports presets have valid structure', () => {
    expect(POWERSPORTS_PRESETS.length).toBeGreaterThanOrEqual(10);
    for (const preset of POWERSPORTS_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.pids.length).toBeGreaterThan(0);
    }
  });

  it('getPowersportsPresets returns presets for known makes', () => {
    const canamPresets = getPowersportsPresets('canam');
    expect(canamPresets.length).toBeGreaterThan(0);
    
    const polarisPresets = getPowersportsPresets('polaris');
    expect(polarisPresets.length).toBeGreaterThan(0);
  });

  it('getPowersportsPids returns PIDs for each manufacturer', () => {
    expect(getPowersportsPids('canam').length).toBeGreaterThan(0);
    expect(getPowersportsPids('seadoo').length).toBeGreaterThan(0);
    expect(getPowersportsPids('polaris').length).toBeGreaterThan(0);
    expect(getPowersportsPids('kawasaki').length).toBeGreaterThan(0);
  });

  it('getAllPowersportsPids returns combined PIDs', () => {
    const all = getAllPowersportsPids();
    expect(all.length).toBe(
      CANAM_EXTENDED_PIDS.length + SEADOO_EXTENDED_PIDS.length +
      POLARIS_EXTENDED_PIDS.length + KAWASAKI_EXTENDED_PIDS.length
    );
  });

  it('detectPowersportsFromVin identifies CAN-am VINs', () => {
    // CAN-am WMI starts with 3JB
    const result = detectPowersportsFromVin('3JBMXAX');
    expect(result).not.toBeNull();
    expect(result!.manufacturer).toBe('canam');
  });

  it('detectPowersportsFromVin identifies Polaris VINs', () => {
    // Polaris WMI starts with 4XA
    const result = detectPowersportsFromVin('4XASXE');
    expect(result).not.toBeNull();
    expect(result!.manufacturer).toBe('polaris');
  });

  it('detectPowersportsFromVin returns null for unknown VINs', () => {
    const result = detectPowersportsFromVin('1GCGG25K');
    expect(result).toBeNull();
  });

  it('POWERSPORTS_WMI_CODES has entries for all manufacturers', () => {
    expect(POWERSPORTS_WMI_CODES.length).toBeGreaterThanOrEqual(4);
    const manufacturers = POWERSPORTS_WMI_CODES.map(w => w.manufacturer);
    expect(manufacturers).toContain('canam');
    expect(manufacturers).toContain('polaris');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UDS Reference Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('UDS Reference', () => {
  it('UDS_SERVICES has all standard services', () => {
    expect(UDS_SERVICES.length).toBeGreaterThanOrEqual(10);
    const serviceIds = UDS_SERVICES.map(s => s.id);
    expect(serviceIds).toContain(0x10); // DiagnosticSessionControl
    expect(serviceIds).toContain(0x11); // ECUReset
    expect(serviceIds).toContain(0x22); // ReadDataByIdentifier
    expect(serviceIds).toContain(0x27); // SecurityAccess
    expect(serviceIds).toContain(0x2E); // WriteDataByIdentifier
    expect(serviceIds).toContain(0x2F); // IOControlByIdentifier
    expect(serviceIds).toContain(0x31); // RoutineControl
    expect(serviceIds).toContain(0x34); // RequestDownload
    expect(serviceIds).toContain(0x36); // TransferData
  });

  it('NRC_CODES has standard negative response codes', () => {
    // NRC_CODES is a Record<number, ...>
    expect(NRC_CODES[0x10]).toBeDefined(); // generalReject
    expect(NRC_CODES[0x11]).toBeDefined(); // serviceNotSupported
    expect(NRC_CODES[0x22]).toBeDefined(); // conditionsNotCorrect
    expect(NRC_CODES[0x33]).toBeDefined(); // securityAccessDenied
    expect(NRC_CODES[0x35]).toBeDefined(); // invalidKey
    expect(NRC_CODES[0x78]).toBeDefined(); // responsePending
  });

  it('UDS_DIDS has VIN and identification DIDs', () => {
    expect(UDS_DIDS.length).toBeGreaterThanOrEqual(10);
    const didIds = UDS_DIDS.map(d => d.did);
    expect(didIds).toContain(0xF190); // VIN
    expect(didIds).toContain(0xF187); // Part Number
    expect(didIds).toContain(0xF188); // SW Number
  });

  it('decodeNRC returns correct description', () => {
    const nrc = decodeNRC(0x33);
    expect(nrc).toBeDefined();
    expect(nrc.name.toLowerCase()).toContain('security');
  });

  it('getUDSService returns service info', () => {
    const svc = getUDSService(0x22);
    expect(svc).toBeDefined();
    expect(svc!.name.toLowerCase()).toContain('read');
  });

  it('getUDSService returns undefined for unknown service', () => {
    expect(getUDSService(0xFF)).toBeUndefined();
  });

  it('SECURITY_ACCESS_PROCEDURES has entries', () => {
    expect(SECURITY_ACCESS_PROCEDURES.length).toBeGreaterThanOrEqual(3);
  });

  it('getSecurityProcedure returns procedure for known platform', () => {
    const proc = getSecurityProcedure('CAN-am');
    expect(proc).toBeDefined();
  });

  it('ROUTINE_CONTROLS has entries', () => {
    expect(ROUTINE_CONTROLS.length).toBeGreaterThanOrEqual(5);
  });

  it('IO_CONTROLS has entries', () => {
    expect(IO_CONTROLS.length).toBeGreaterThanOrEqual(3);
  });

  it('LOGGER_LEVELS has tiered levels', () => {
    expect(LOGGER_LEVELS.length).toBeGreaterThanOrEqual(3);
    const levels = LOGGER_LEVELS.map(l => l.level);
    expect(levels).toContain(1);
    expect(levels).toContain(2);
    expect(levels).toContain(3);
  });

  it('getDidsForLevel returns DIDs for each level', () => {
    const level1 = getDidsForLevel(1);
    const level2 = getDidsForLevel(2);
    const level3 = getDidsForLevel(3);
    expect(level1.length).toBeGreaterThan(0);
    expect(level2.length).toBeGreaterThanOrEqual(level1.length);
    expect(level3.length).toBeGreaterThanOrEqual(level2.length);
  });

  it('getDidsGroupedByCategory returns a Map', () => {
    const grouped = getDidsGroupedByCategory();
    expect(grouped).toBeInstanceOf(Map);
    expect(grouped.size).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Seed/Key Algorithm Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Seed/Key Algorithms', () => {
  it('CAN-am seed/key tables are defined', () => {
    expect(CANAM_CUAKEYA).toBeDefined();
    expect(CANAM_CUAKEYA.length).toBe(4);
    expect(CANAM_CUCAKEYSB).toBeDefined();
    expect(CANAM_CUCAKEYSB.length).toBe(8);
  });

  it('computeCanamKey returns a 16-bit key', () => {
    const key = computeCanamKey(0x1234, 3);
    expect(key).toBeGreaterThanOrEqual(0);
    expect(key).toBeLessThanOrEqual(0xFFFF);
  });

  it('computeCanamKey returns different keys for different seeds', () => {
    const key1 = computeCanamKey(0x1234, 3);
    const key2 = computeCanamKey(0x5678, 3);
    expect(key1).not.toBe(key2);
  });

  it('computeBrpDashKey returns a 16-bit key', () => {
    const key = computeBrpDashKey(0xABCD);
    expect(key).toBeGreaterThanOrEqual(0);
    expect(key).toBeLessThanOrEqual(0xFFFF);
  });

  it('computePolarisKey returns a 16-bit key', () => {
    const key = computePolarisKey(0xABCD);
    expect(key).toBeGreaterThanOrEqual(0);
    expect(key).toBeLessThanOrEqual(0xFFFF);
  });

  it('computeFordMG1Key returns a 24-bit key', () => {
    const key = computeFordMG1Key(0x123456);
    expect(key).toBeGreaterThanOrEqual(0);
    expect(key).toBeLessThanOrEqual(0xFFFFFF);
  });

  it('computeFordMG1Key returns different keys for different seeds', () => {
    const key1 = computeFordMG1Key(0x123456);
    const key2 = computeFordMG1Key(0x654321);
    expect(key1).not.toBe(key2);
  });

  it('computeCumminsKey returns a 32-bit key', () => {
    const key = computeCumminsKey(0x12345678, 0x40DA1B97, 0x9E5B2C4F);
    expect(key).toBeGreaterThanOrEqual(0);
    expect(key).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('computeCumminsKey returns different keys for different secrets', () => {
    const key1 = computeCumminsKey(0x12345678, 0x40DA1B97, 0x9E5B2C4F);
    const key2 = computeCumminsKey(0x12345678, 0x2148F227, 0xB163BBBE);
    expect(key1).not.toBe(key2);
  });

  it('getRoutinesForPlatform returns routines', () => {
    const routines = getRoutinesForPlatform('GM');
    expect(routines.length).toBeGreaterThan(0);
  });

  it('getIOControlsForPlatform returns IO controls', () => {
    const controls = getIOControlsForPlatform('GM');
    expect(controls.length).toBeGreaterThan(0);
  });
});
