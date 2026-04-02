import { describe, expect, it } from 'vitest';
import {
  FORD_MODULES, RAM_MODULES, GM_MODULES, ALL_KNOWN_MODULES,
  FORD_FUEL_TANK_SIZES, RAM_FUEL_TANK_SIZES, COMMON_TIRE_SIZES,
  calculateFordChecksum, parseAsBuiltHex, encodeAsBuiltHex,
  decodeFordFuelTankSize, encodeFordFuelTankSize,
  calculateSpeedoCorrection, parseTireSize,
  getModulesForManufacturer, lookupModule, getScanAddresses,
  decodeFordIPCBlock01,
  IDENTIFICATION_DIDS, FORD_ASBUILT_DIDS, RAM_CONFIG_DIDS,
} from './moduleScanner';

// ═══════════════════════════════════════════════════════════════════════════
// Module Database Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Module Database', () => {
  it('Ford modules have valid addresses and response addresses', () => {
    for (const mod of FORD_MODULES) {
      expect(mod.address).toBeGreaterThan(0x6FF);
      expect(mod.address).toBeLessThan(0x800);
      expect(mod.responseAddress).toBe(mod.address + 8);
      expect(mod.name.length).toBeGreaterThan(0);
      expect(mod.acronym.length).toBeGreaterThan(0);
      expect(mod.manufacturer).toBe('ford');
    }
  });

  it('RAM modules have valid addresses', () => {
    for (const mod of RAM_MODULES) {
      expect(mod.address).toBeGreaterThan(0x6FF);
      expect(mod.address).toBeLessThan(0x800);
      expect(mod.responseAddress).toBe(mod.address + 8);
      expect(mod.manufacturer).toBe('ram');
    }
  });

  it('GM modules have valid addresses', () => {
    for (const mod of GM_MODULES) {
      expect(mod.address).toBeGreaterThan(0x200);
      expect(mod.name.length).toBeGreaterThan(0);
      expect(mod.manufacturer).toBe('gm');
    }
  });

  it('ALL_KNOWN_MODULES contains all manufacturers', () => {
    expect(ALL_KNOWN_MODULES.length).toBe(FORD_MODULES.length + RAM_MODULES.length + GM_MODULES.length);
  });

  it('lookupModule finds Ford PCM at 0x7E0', () => {
    const mod = lookupModule(0x7E0);
    expect(mod).not.toBeNull();
    expect(mod!.acronym).toBe('PCM');
  });

  it('lookupModule returns null for unknown address', () => {
    expect(lookupModule(0x999)).toBeNull();
  });

  it('getModulesForManufacturer returns correct sets', () => {
    expect(getModulesForManufacturer('ford').length).toBe(FORD_MODULES.length);
    expect(getModulesForManufacturer('ram').length).toBe(RAM_MODULES.length);
    expect(getModulesForManufacturer('gm').length).toBe(GM_MODULES.length);
  });

  it('getScanAddresses returns valid ranges', () => {
    const fordAddrs = getScanAddresses('ford');
    expect(fordAddrs.length).toBeGreaterThan(0);
    for (const addr of fordAddrs) {
      expect(addr).toBeGreaterThanOrEqual(0x700);
      expect(addr).toBeLessThanOrEqual(0x7FF);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DID Constants Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('DID Constants', () => {
  it('IDENTIFICATION_DIDS has standard UDS DIDs', () => {
    expect(IDENTIFICATION_DIDS.VIN).toBe(0xF190);
    expect(IDENTIFICATION_DIDS.ECU_PART_NUMBER).toBe(0xF187);
    expect(IDENTIFICATION_DIDS.ECU_SW_VERSION).toBe(0xF189);
  });

  it('FORD_ASBUILT_DIDS has IPC blocks', () => {
    expect(FORD_ASBUILT_DIDS).toBeDefined();
    expect(typeof FORD_ASBUILT_DIDS.IPC_BLOCK_01_01).toBe('number');
  });

  it('RAM_CONFIG_DIDS has fuel tank and tire DIDs', () => {
    expect(RAM_CONFIG_DIDS.FUEL_TANK_CAPACITY).toBeDefined();
    expect(RAM_CONFIG_DIDS.TIRE_CIRCUMFERENCE).toBeDefined();
    expect(RAM_CONFIG_DIDS.TIRE_REVS_PER_KM).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Ford As-Built Codec Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Ford As-Built Codec', () => {
  it('parseAsBuiltHex parses hex into bytes and 16-bit words', () => {
    // "2120 6047 39" = 5 bytes: 0x21, 0x20, 0x60, 0x47, 0x39
    // Words (16-bit pairs): 0x2120, 0x6047 (0x39 is odd byte, no pair)
    const result = parseAsBuiltHex('2120 6047 39');
    expect(result.bytes).toEqual([0x21, 0x20, 0x60, 0x47, 0x39]);
    // Words are 16-bit pairs: only complete pairs
    expect(result.words.length).toBe(2);
    expect(result.words[0]).toBe(0x2120);
    expect(result.words[1]).toBe(0x6047);
  });

  it('parseAsBuiltHex handles 6-byte block correctly', () => {
    const result = parseAsBuiltHex('2120 6047 394A');
    expect(result.bytes.length).toBe(6);
    expect(result.words.length).toBe(3);
    expect(result.words[2]).toBe(0x394A);
  });

  it('encodeAsBuiltHex produces padded hex words', () => {
    const encoded = encodeAsBuiltHex([0x2120, 0x6047]);
    expect(encoded).toBe('2120 6047');
  });

  it('calculateFordChecksum produces valid checksum byte', () => {
    const bytes = [0x21, 0x20, 0x60, 0x47];
    const checksum = calculateFordChecksum(bytes);
    expect(checksum).toBeGreaterThanOrEqual(0);
    expect(checksum).toBeLessThanOrEqual(255);
  });

  it('decodeFordFuelTankSize decodes from hex bytes', () => {
    // First 12 bits: bytes[0]=0x71, bytes[1]=0x90
    // Raw = (0x71 << 4) | (0x90 >> 4) = 0x719 = 1817 → 181.7L → 48.0 gal
    const result = decodeFordFuelTankSize('7190 0000 0000');
    expect(result.liters).toBeCloseTo(181.7, 0);
    expect(result.gallons).toBeGreaterThan(40);
    expect(result.gallons).toBeLessThan(55);
  });

  it('encodeFordFuelTankSize produces valid modified hex', () => {
    const original = '2120 6047 394A';
    const result = encodeFordFuelTankSize(original, 60);
    expect(result.modifiedHex.length).toBeGreaterThan(0);
    expect(result.newLiters).toBeGreaterThan(200); // 60 gal ≈ 227L
    expect(result.newLiters).toBeLessThan(250);
  });

  it('encodeFordFuelTankSize round-trips correctly', () => {
    const original = '2120 6047 394A';
    const targetGallons = 50;
    const encoded = encodeFordFuelTankSize(original, targetGallons);
    const decoded = decodeFordFuelTankSize(encoded.modifiedHex);
    // Should be within 0.5 gallon of target
    expect(Math.abs(decoded.gallons - targetGallons)).toBeLessThan(0.5);
  });

  it('decodeFordIPCBlock01 returns decoded fields for 6+ byte block', () => {
    const fields = decodeFordIPCBlock01('2120 6047 394A');
    expect(fields.length).toBeGreaterThan(0);
    const fuelField = fields.find(f => f.name === 'Fuel Tank Capacity');
    expect(fuelField).toBeDefined();
    expect(fuelField!.editable).toBe(true);
  });

  it('decodeFordIPCBlock01 returns empty for short block', () => {
    const fields = decodeFordIPCBlock01('2120');
    expect(fields.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fuel Tank Size Database Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Fuel Tank Size Databases', () => {
  it('Ford fuel tank sizes have valid data', () => {
    expect(FORD_FUEL_TANK_SIZES.length).toBeGreaterThanOrEqual(10);
    for (const tank of FORD_FUEL_TANK_SIZES) {
      expect(tank.gallons).toBeGreaterThan(0);
      expect(tank.liters).toBeGreaterThan(0);
      expect(tank.hexValue).toBeGreaterThan(0);
      expect(tank.label.length).toBeGreaterThan(0);
      // Verify gallon-to-liter conversion is reasonable
      expect(Math.abs(tank.liters - tank.gallons * 3.785)).toBeLessThan(1);
    }
  });

  it('RAM fuel tank sizes have valid data', () => {
    expect(RAM_FUEL_TANK_SIZES.length).toBeGreaterThanOrEqual(5);
    for (const tank of RAM_FUEL_TANK_SIZES) {
      expect(tank.gallons).toBeGreaterThan(0);
      expect(tank.liters).toBeGreaterThan(0);
      expect(tank.label.length).toBeGreaterThan(0);
    }
  });

  it('Ford fuel tank sizes are sorted by gallons', () => {
    for (let i = 1; i < FORD_FUEL_TANK_SIZES.length; i++) {
      expect(FORD_FUEL_TANK_SIZES[i].gallons).toBeGreaterThanOrEqual(FORD_FUEL_TANK_SIZES[i - 1].gallons);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tire Size Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Tire Size Database & Parser', () => {
  it('COMMON_TIRE_SIZES has valid entries', () => {
    expect(COMMON_TIRE_SIZES.length).toBeGreaterThanOrEqual(20);
    for (const tire of COMMON_TIRE_SIZES) {
      expect(tire.size.length).toBeGreaterThan(0);
      expect(tire.revsPerMile).toBeGreaterThan(400);
      expect(tire.revsPerMile).toBeLessThan(800);
      expect(tire.circumference_mm).toBeGreaterThan(1500);
      expect(tire.diameter_in).toBeGreaterThan(28);
      expect(tire.diameter_in).toBeLessThan(45);
    }
  });

  it('parseTireSize handles metric format (LT275/70R18)', () => {
    const result = parseTireSize('LT275/70R18');
    expect(result).not.toBeNull();
    expect(result!.diameter_in).toBeGreaterThan(30);
    expect(result!.diameter_in).toBeLessThan(36);
    expect(result!.revsPerMile).toBeGreaterThan(600);
    expect(result!.revsPerMile).toBeLessThan(700);
  });

  it('parseTireSize handles P-metric format (P265/70R17)', () => {
    const result = parseTireSize('P265/70R17');
    expect(result).not.toBeNull();
    expect(result!.diameter_in).toBeGreaterThan(28);
    expect(result!.diameter_in).toBeLessThan(35);
  });

  it('parseTireSize handles inch format (35x12.50R17)', () => {
    const result = parseTireSize('35x12.50R17');
    expect(result).not.toBeNull();
    expect(result!.diameter_in).toBe(35);
    expect(result!.revsPerMile).toBeGreaterThan(550);
    expect(result!.revsPerMile).toBeLessThan(650);
  });

  it('parseTireSize handles 37" tire format', () => {
    const result = parseTireSize('37x12.50R20');
    expect(result).not.toBeNull();
    expect(result!.diameter_in).toBe(37);
  });

  it('parseTireSize returns null for invalid input', () => {
    expect(parseTireSize('not a tire')).toBeNull();
    expect(parseTireSize('')).toBeNull();
    expect(parseTireSize('12345')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Speedometer Correction Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Speedometer Correction', () => {
  it('calculates no correction for same tire size', () => {
    const result = calculateSpeedoCorrection(654, 654);
    expect(result.correctionFactor).toBe(1);
    expect(result.speedoError).toBe(0);
    expect(result.description).toContain('No correction');
  });

  it('calculates positive error for larger tires (fewer revs/mile)', () => {
    // Stock: 654 rev/mi, New: 601 rev/mi (35" tires)
    const result = calculateSpeedoCorrection(654, 601);
    expect(result.speedoError).toBeGreaterThan(0);
    expect(result.correctionFactor).toBeGreaterThan(1);
    expect(result.description).toContain('LOW');
  });

  it('calculates negative error for smaller tires (more revs/mile)', () => {
    const result = calculateSpeedoCorrection(601, 654);
    expect(result.speedoError).toBeLessThan(0);
    expect(result.correctionFactor).toBeLessThan(1);
    expect(result.description).toContain('HIGH');
  });

  it('35" tire on stock 275/70R18 shows ~8% error', () => {
    const result = calculateSpeedoCorrection(654, 601);
    expect(result.speedoError).toBeGreaterThan(7);
    expect(result.speedoError).toBeLessThan(10);
  });

  it('37" tire on stock 275/70R18 shows ~14% error', () => {
    const result = calculateSpeedoCorrection(654, 571);
    expect(result.speedoError).toBeGreaterThan(12);
    expect(result.speedoError).toBeLessThan(16);
  });
});
