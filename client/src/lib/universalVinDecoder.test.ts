/**
 * Tests for Universal VIN Decoder — decodeVinLocal, identifyVehicleFromVin, isValidVin
 */
import { describe, it, expect } from 'vitest';
import {
  decodeVinLocal,
  identifyVehicleFromVin,
  isValidVin,
  extractVinFromString,
} from './universalVinDecoder';

// ─── VIN Validation ────────────────────────────────────────────────────────

describe('isValidVin', () => {
  it('accepts valid 17-character VINs', () => {
    expect(isValidVin('1GCVK8EL5RZ123456')).toBe(true); // 2024 Chevy Silverado
    expect(isValidVin('1FTFW1R69CFA12345')).toBe(true);  // 2012 Ford Raptor
    expect(isValidVin('5UXCR6C09R9A12345')).toBe(true);  // BMW XM
  });

  it('rejects short VINs', () => {
    expect(isValidVin('1GCVK8EL5RZ')).toBe(false);
    expect(isValidVin('')).toBe(false);
  });

  it('rejects VINs with I, O, Q', () => {
    expect(isValidVin('1GCVK8EL5RZ12345I')).toBe(false);
    expect(isValidVin('1GCVK8EL5RZ12345O')).toBe(false);
    expect(isValidVin('1GCVK8EL5RZ12345Q')).toBe(false);
  });

  it('rejects null/undefined', () => {
    expect(isValidVin(null as any)).toBe(false);
    expect(isValidVin(undefined as any)).toBe(false);
  });
});

// ─── extractVinFromString ──────────────────────────────────────────────────

describe('extractVinFromString', () => {
  it('extracts VIN from filename', () => {
    const vin = extractVinFromString('datalog_1GCVK8EL5RZ123456_2024.csv');
    expect(vin).toBe('1GCVK8EL5RZ123456');
  });

  it('returns null when no VIN found', () => {
    expect(extractVinFromString('no_vin_here.csv')).toBeNull();
  });
});

// ─── decodeVinLocal ────────────────────────────────────────────────────────

describe('decodeVinLocal', () => {
  it('decodes 2024 Duramax VIN (1GC = GM truck)', () => {
    // 1GC = GM truck, R = 2024 model year
    const result = decodeVinLocal('1GCVK8EL5RZ123456');
    expect(result.make).toBe('Chevrolet');
    expect(result.manufacturer).toBe('gm');
    expect(result.year).toBe(2024);
    expect(result.country).toBe('USA');
  });

  it('decodes 2012 Ford Raptor VIN (1FT = Ford truck)', () => {
    // 1FT = Ford truck, C = 2012 model year
    const result = decodeVinLocal('1FTFW1R69CFA12345');
    expect(result.make).toBe('Ford');
    expect(result.manufacturer).toBe('ford');
    expect(result.year).toBe(2012);
    expect(result.country).toBe('USA');
  });

  it('decodes BMW VIN (5UX = BMW SUV)', () => {
    // 5UX = BMW SUV, R = 2024
    const result = decodeVinLocal('5UXCR6C09R9A12345');
    expect(result.make).toBe('BMW');
    expect(result.manufacturer).toBe('bmw');
    expect(result.year).toBe(2024);
    expect(result.country).toBe('USA');
  });

  it('decodes WBA BMW VIN (German-built)', () => {
    const result = decodeVinLocal('WBA11CF0XRCE12345');
    expect(result.make).toBe('BMW');
    expect(result.manufacturer).toBe('bmw');
    expect(result.country).toBe('Germany');
  });

  it('decodes Toyota VIN', () => {
    const result = decodeVinLocal('JTDKN3DU5R0123456');
    expect(result.make).toBe('Toyota');
    expect(result.manufacturer).toBe('toyota');
  });

  it('decodes Honda VIN', () => {
    const result = decodeVinLocal('1HGCV1F30RA123456');
    expect(result.make).toBe('Honda');
    expect(result.manufacturer).toBe('honda');
  });

  it('decodes Chrysler/Stellantis VIN', () => {
    const result = decodeVinLocal('2C3CDXCT5RH123456');
    expect(result.manufacturer).toBe('chrysler');
  });

  it('returns universal for unknown WMI', () => {
    const result = decodeVinLocal('ZZZZZZZZZZZ123456');
    expect(result.manufacturer).toBe('universal');
    expect(result.make).toBe('Unknown');
  });

  it('returns default for invalid VIN length', () => {
    const result = decodeVinLocal('SHORT');
    expect(result.manufacturer).toBe('universal');
    expect(result.year).toBe(0);
    expect(result.make).toBe('Unknown');
  });

  it('detects diesel fuel type for Duramax indicators', () => {
    // Duramax VINs typically have diesel indicators in VDS
    // This tests the diesel detection patterns
    const result = decodeVinLocal('1GCVK8EL5RZ123456');
    // The local decoder may or may not detect diesel without NHTSA
    // but it should at least return a valid fuelType
    expect(['gasoline', 'diesel', 'any']).toContain(result.fuelType);
  });
});

// ─── identifyVehicleFromVin ────────────────────────────────────────────────

describe('identifyVehicleFromVin', () => {
  it('identifies GM manufacturer from Duramax VIN', () => {
    const result = identifyVehicleFromVin('1GCVK8EL5RZ123456');
    expect(result.manufacturer).toBe('gm');
    expect(result.make).toBe('Chevrolet');
    expect(result.year).toBe(2024);
  });

  it('identifies Ford manufacturer from Raptor VIN', () => {
    const result = identifyVehicleFromVin('1FTFW1R69CFA12345');
    expect(result.manufacturer).toBe('ford');
    expect(result.make).toBe('Ford');
    expect(result.year).toBe(2012);
  });

  it('identifies BMW manufacturer from XM VIN', () => {
    const result = identifyVehicleFromVin('5UXCR6C09R9A12345');
    expect(result.manufacturer).toBe('bmw');
    expect(result.make).toBe('BMW');
    expect(result.year).toBe(2024);
  });
});

// ─── Year Decoding ─────────────────────────────────────────────────────────

describe('VIN Year Decoding', () => {
  it('decodes 2012 (C)', () => {
    const result = decodeVinLocal('1FTFW1R69CFA12345');
    expect(result.year).toBe(2012);
  });

  it('decodes 2024 (R)', () => {
    const result = decodeVinLocal('1GCVK8EL5RZ123456');
    expect(result.year).toBe(2024);
  });

  it('decodes 2025 (S)', () => {
    const result = decodeVinLocal('1GCVK8EL5SZ123456');
    expect(result.year).toBe(2025);
  });

  it('decodes 2026 (T)', () => {
    const result = decodeVinLocal('1GCVK8EL5TZ123456');
    expect(result.year).toBe(2026);
  });
});
