/**
 * Universal VIN Decoder — Vehicle Identification for Any Make/Model
 * 
 * Decodes 17-character VINs to determine:
 * - Manufacturer (GM, Ford, Chrysler, Toyota, Honda, Nissan, Hyundai, etc.)
 * - Fuel type (gasoline vs diesel)
 * - Vehicle type (car, truck, SUV)
 * - Model year
 * 
 * Used by the datalogger to auto-select appropriate PID presets.
 */

import type { PIDManufacturer, FuelType } from './obdConnection';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DecodedVehicle {
  vin: string;
  make: string;
  model: string;
  year: number;
  manufacturer: PIDManufacturer;
  fuelType: FuelType;
  engineType: string;
  displacement: string;
  cylinders: number;
  vehicleType: 'car' | 'truck' | 'suv' | 'van' | 'unknown';
  country: string;
  nhtsaVerified: boolean;
}

// ─── VIN Year Decode (Position 10) ───────────────────────────────────────────

const YEAR_CODES: Record<string, number> = {
  'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
  'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
  'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
  'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029,
  'Y': 2030,
  // 1980-2009 cycle
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
  '6': 2006, '7': 2007, '8': 2008, '9': 2009,
};

// ─── WMI Database (World Manufacturer Identifier) ────────────────────────────
// Position 1-3 of VIN identifies the manufacturer

interface WmiEntry {
  make: string;
  manufacturer: PIDManufacturer;
  country: string;
  defaultFuel: FuelType;
}

const WMI_DATABASE: Record<string, WmiEntry> = {
  // ── General Motors ──
  '1G1': { make: 'Chevrolet', manufacturer: 'gm', country: 'USA', defaultFuel: 'gasoline' },
  '1G2': { make: 'Pontiac', manufacturer: 'gm', country: 'USA', defaultFuel: 'gasoline' },
  '1GC': { make: 'Chevrolet', manufacturer: 'gm', country: 'USA', defaultFuel: 'any' },
  '1GT': { make: 'GMC', manufacturer: 'gm', country: 'USA', defaultFuel: 'any' },
  '1GK': { make: 'GMC', manufacturer: 'gm', country: 'USA', defaultFuel: 'gasoline' },
  '1GY': { make: 'Cadillac', manufacturer: 'gm', country: 'USA', defaultFuel: 'gasoline' },
  '2G1': { make: 'Chevrolet', manufacturer: 'gm', country: 'Canada', defaultFuel: 'gasoline' },
  '2GC': { make: 'Chevrolet', manufacturer: 'gm', country: 'Canada', defaultFuel: 'any' },
  '2GT': { make: 'GMC', manufacturer: 'gm', country: 'Canada', defaultFuel: 'any' },
  '3GC': { make: 'Chevrolet', manufacturer: 'gm', country: 'Mexico', defaultFuel: 'any' },
  '3GT': { make: 'GMC', manufacturer: 'gm', country: 'Mexico', defaultFuel: 'any' },
  '3G7': { make: 'GMC', manufacturer: 'gm', country: 'Mexico', defaultFuel: 'gasoline' },
  // ── Ford ──
  '1FA': { make: 'Ford', manufacturer: 'ford', country: 'USA', defaultFuel: 'gasoline' },
  '1FB': { make: 'Ford', manufacturer: 'ford', country: 'USA', defaultFuel: 'gasoline' },
  '1FC': { make: 'Ford', manufacturer: 'ford', country: 'USA', defaultFuel: 'gasoline' },
  '1FD': { make: 'Ford', manufacturer: 'ford', country: 'USA', defaultFuel: 'any' },
  '1FT': { make: 'Ford', manufacturer: 'ford', country: 'USA', defaultFuel: 'any' },
  '1FM': { make: 'Ford', manufacturer: 'ford', country: 'USA', defaultFuel: 'gasoline' },
  '1LN': { make: 'Lincoln', manufacturer: 'ford', country: 'USA', defaultFuel: 'gasoline' },
  '2FM': { make: 'Ford', manufacturer: 'ford', country: 'Canada', defaultFuel: 'gasoline' },
  '3FA': { make: 'Ford', manufacturer: 'ford', country: 'Mexico', defaultFuel: 'gasoline' },
  // ── Chrysler/Stellantis ──
  '1C3': { make: 'Chrysler', manufacturer: 'chrysler', country: 'USA', defaultFuel: 'gasoline' },
  '1C4': { make: 'Chrysler', manufacturer: 'chrysler', country: 'USA', defaultFuel: 'gasoline' },
  '1C6': { make: 'Ram', manufacturer: 'chrysler', country: 'USA', defaultFuel: 'any' },
  '2C3': { make: 'Chrysler', manufacturer: 'chrysler', country: 'Canada', defaultFuel: 'gasoline' },
  '2C4': { make: 'Chrysler', manufacturer: 'chrysler', country: 'Canada', defaultFuel: 'gasoline' },
  '2D7': { make: 'Ram', manufacturer: 'chrysler', country: 'Canada', defaultFuel: 'any' },
  '3C4': { make: 'Chrysler', manufacturer: 'chrysler', country: 'Mexico', defaultFuel: 'gasoline' },
  '3C6': { make: 'Ram', manufacturer: 'chrysler', country: 'Mexico', defaultFuel: 'any' },
  '1J4': { make: 'Jeep', manufacturer: 'chrysler', country: 'USA', defaultFuel: 'gasoline' },
  '1J8': { make: 'Jeep', manufacturer: 'chrysler', country: 'USA', defaultFuel: 'gasoline' },
  '2B3': { make: 'Dodge', manufacturer: 'chrysler', country: 'Canada', defaultFuel: 'gasoline' },
  '2B7': { make: 'Dodge', manufacturer: 'chrysler', country: 'Canada', defaultFuel: 'gasoline' },
  // ── Toyota ──
  '1NX': { make: 'Toyota', manufacturer: 'toyota', country: 'USA', defaultFuel: 'gasoline' },
  '2T1': { make: 'Toyota', manufacturer: 'toyota', country: 'Canada', defaultFuel: 'gasoline' },
  '2T2': { make: 'Lexus', manufacturer: 'toyota', country: 'Canada', defaultFuel: 'gasoline' },
  '4T1': { make: 'Toyota', manufacturer: 'toyota', country: 'USA', defaultFuel: 'gasoline' },
  '4T3': { make: 'Toyota', manufacturer: 'toyota', country: 'USA', defaultFuel: 'gasoline' },
  '4T4': { make: 'Toyota', manufacturer: 'toyota', country: 'USA', defaultFuel: 'gasoline' },
  '5TD': { make: 'Toyota', manufacturer: 'toyota', country: 'USA', defaultFuel: 'gasoline' },
  '5TF': { make: 'Toyota', manufacturer: 'toyota', country: 'USA', defaultFuel: 'gasoline' },
  '5TB': { make: 'Toyota', manufacturer: 'toyota', country: 'USA', defaultFuel: 'gasoline' },
  'JTD': { make: 'Toyota', manufacturer: 'toyota', country: 'Japan', defaultFuel: 'gasoline' },
  'JTE': { make: 'Toyota', manufacturer: 'toyota', country: 'Japan', defaultFuel: 'gasoline' },
  'JTH': { make: 'Lexus', manufacturer: 'toyota', country: 'Japan', defaultFuel: 'gasoline' },
  'JTJ': { make: 'Lexus', manufacturer: 'toyota', country: 'Japan', defaultFuel: 'gasoline' },
  // ── Honda ──
  '1HG': { make: 'Honda', manufacturer: 'honda', country: 'USA', defaultFuel: 'gasoline' },
  '2HG': { make: 'Honda', manufacturer: 'honda', country: 'Canada', defaultFuel: 'gasoline' },
  '2HK': { make: 'Honda', manufacturer: 'honda', country: 'Canada', defaultFuel: 'gasoline' },
  '5FN': { make: 'Honda', manufacturer: 'honda', country: 'USA', defaultFuel: 'gasoline' },
  '5J6': { make: 'Honda', manufacturer: 'honda', country: 'USA', defaultFuel: 'gasoline' },
  '19U': { make: 'Acura', manufacturer: 'honda', country: 'USA', defaultFuel: 'gasoline' },
  'JHM': { make: 'Honda', manufacturer: 'honda', country: 'Japan', defaultFuel: 'gasoline' },
  // ── Nissan ──
  '1N4': { make: 'Nissan', manufacturer: 'nissan', country: 'USA', defaultFuel: 'gasoline' },
  '1N6': { make: 'Nissan', manufacturer: 'nissan', country: 'USA', defaultFuel: 'gasoline' },
  '5N1': { make: 'Nissan', manufacturer: 'nissan', country: 'USA', defaultFuel: 'gasoline' },
  'JN1': { make: 'Nissan', manufacturer: 'nissan', country: 'Japan', defaultFuel: 'gasoline' },
  'JN8': { make: 'Nissan', manufacturer: 'nissan', country: 'Japan', defaultFuel: 'gasoline' },
  // ── Hyundai/Kia ──
  '5NP': { make: 'Hyundai', manufacturer: 'hyundai', country: 'USA', defaultFuel: 'gasoline' },
  '5NM': { make: 'Hyundai', manufacturer: 'hyundai', country: 'USA', defaultFuel: 'gasoline' },
  'KMH': { make: 'Hyundai', manufacturer: 'hyundai', country: 'South Korea', defaultFuel: 'gasoline' },
  'KNA': { make: 'Kia', manufacturer: 'hyundai', country: 'South Korea', defaultFuel: 'gasoline' },
  'KND': { make: 'Kia', manufacturer: 'hyundai', country: 'South Korea', defaultFuel: 'gasoline' },
  // ── Ford (additional) ──
  '1FV': { make: 'Ford', manufacturer: 'ford', country: 'USA', defaultFuel: 'gasoline' },
  // ── European (mapped to universal since no extended PIDs) ──
  'WBA': { make: 'BMW', manufacturer: 'bmw', country: 'Germany', defaultFuel: 'gasoline' },
  'WBS': { make: 'BMW M', manufacturer: 'bmw', country: 'Germany', defaultFuel: 'gasoline' },
  'WBY': { make: 'BMW', manufacturer: 'bmw', country: 'Germany', defaultFuel: 'gasoline' },
  '5UX': { make: 'BMW', manufacturer: 'bmw', country: 'USA', defaultFuel: 'gasoline' },
  '5YM': { make: 'BMW M', manufacturer: 'bmw', country: 'USA', defaultFuel: 'gasoline' },
  'WDD': { make: 'Mercedes-Benz', manufacturer: 'universal', country: 'Germany', defaultFuel: 'gasoline' },
  'WDB': { make: 'Mercedes-Benz', manufacturer: 'universal', country: 'Germany', defaultFuel: 'gasoline' },
  'WAU': { make: 'Audi', manufacturer: 'universal', country: 'Germany', defaultFuel: 'gasoline' },
  'WVW': { make: 'Volkswagen', manufacturer: 'universal', country: 'Germany', defaultFuel: 'gasoline' },
  'WP0': { make: 'Porsche', manufacturer: 'universal', country: 'Germany', defaultFuel: 'gasoline' },
  'YV1': { make: 'Volvo', manufacturer: 'universal', country: 'Sweden', defaultFuel: 'gasoline' },
  'SAL': { make: 'Land Rover', manufacturer: 'universal', country: 'UK', defaultFuel: 'gasoline' },
  'SAJ': { make: 'Jaguar', manufacturer: 'universal', country: 'UK', defaultFuel: 'gasoline' },
  // ── Subaru ──
  'JF1': { make: 'Subaru', manufacturer: 'universal', country: 'Japan', defaultFuel: 'gasoline' },
  'JF2': { make: 'Subaru', manufacturer: 'universal', country: 'Japan', defaultFuel: 'gasoline' },
  '4S3': { make: 'Subaru', manufacturer: 'universal', country: 'USA', defaultFuel: 'gasoline' },
  '4S4': { make: 'Subaru', manufacturer: 'universal', country: 'USA', defaultFuel: 'gasoline' },
  // ── Mazda ──
  'JM1': { make: 'Mazda', manufacturer: 'universal', country: 'Japan', defaultFuel: 'gasoline' },
  'JM3': { make: 'Mazda', manufacturer: 'universal', country: 'Japan', defaultFuel: 'gasoline' },
  '3MZ': { make: 'Mazda', manufacturer: 'universal', country: 'Mexico', defaultFuel: 'gasoline' },
  // ── Mitsubishi ──
  'JA3': { make: 'Mitsubishi', manufacturer: 'universal', country: 'Japan', defaultFuel: 'gasoline' },
  'JA4': { make: 'Mitsubishi', manufacturer: 'universal', country: 'Japan', defaultFuel: 'gasoline' },
};

// ─── Diesel Engine Indicators ────────────────────────────────────────────────
// Known VIN patterns that indicate diesel engines

const DIESEL_INDICATORS: Array<{
  test: (vin: string) => boolean;
  description: string;
}> = [
  // GM Duramax: Position 8 engine codes
  { test: (v) => /^[123]G[CT]/.test(v) && ['Y', 'L', '8', '2', '1', 'U', 'J'].includes(v[7]), description: 'GM Duramax diesel' },
  // Ford Powerstroke: F-series with diesel engine codes
  { test: (v) => /^1F[DT]/.test(v) && ['V', 'W', 'T', 'P', 'K', 'F'].includes(v[7]), description: 'Ford Powerstroke diesel' },
  // Ram Cummins: Position 8 engine codes
  { test: (v) => /^[123]C6/.test(v) && ['G', 'H', 'L', 'A', 'E'].includes(v[7]), description: 'Ram Cummins diesel' },
  { test: (v) => /^[12]D7/.test(v) && ['G', 'H', 'L', 'A', 'E'].includes(v[7]), description: 'Ram Cummins diesel' },
  // Jeep EcoDiesel
  { test: (v) => /^1C4/.test(v) && v[7] === 'M', description: 'Jeep EcoDiesel' },
  // GM Colorado/Canyon diesel
  { test: (v) => /^1G[CT]/.test(v) && v[7] === 'H', description: 'GM 2.8L Duramax diesel' },
  // Ford Transit diesel
  { test: (v) => /^1FB/.test(v) && v[7] === 'E', description: 'Ford Transit diesel' },
];

// ─── Country Code (Position 1) ───────────────────────────────────────────────

const COUNTRY_CODES: Record<string, string> = {
  '1': 'United States', '2': 'Canada', '3': 'Mexico', '4': 'United States', '5': 'United States',
  'J': 'Japan', 'K': 'South Korea', 'L': 'China',
  'S': 'UK', 'W': 'Germany', 'Y': 'Sweden', 'Z': 'Italy',
  '9': 'Brazil',
};

// ─── Local VIN Decode ────────────────────────────────────────────────────────

export function decodeVinLocal(vin: string): DecodedVehicle {
  const v = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');

  if (v.length !== 17) {
    return {
      vin: v,
      make: 'Unknown',
      model: 'Unknown',
      year: 0,
      manufacturer: 'universal',
      fuelType: 'any',
      engineType: 'Unknown',
      displacement: '',
      cylinders: 0,
      vehicleType: 'unknown',
      country: 'Unknown',
      nhtsaVerified: false,
    };
  }

  // Decode year from position 10
  const yearChar = v[9];
  const year = YEAR_CODES[yearChar] || 2020;

  // Decode WMI (positions 1-3)
  const wmi3 = v.substring(0, 3);
  const wmi2 = v.substring(0, 2);
  const wmiEntry = WMI_DATABASE[wmi3] || WMI_DATABASE[wmi2 + v[2]] || null;

  const make = wmiEntry?.make || 'Unknown';
  const manufacturer: PIDManufacturer = wmiEntry?.manufacturer || 'universal';
  const country = wmiEntry?.country || COUNTRY_CODES[v[0]] || 'Unknown';

  // Determine fuel type
  let fuelType: FuelType = wmiEntry?.defaultFuel || 'gasoline';
  for (const indicator of DIESEL_INDICATORS) {
    if (indicator.test(v)) {
      fuelType = 'diesel';
      break;
    }
  }

  return {
    vin: v,
    make,
    model: '',  // Will be filled by NHTSA
    year,
    manufacturer,
    fuelType,
    engineType: '',
    displacement: '',
    cylinders: 0,
    vehicleType: 'unknown',
    country,
    nhtsaVerified: false,
  };
}

// ─── NHTSA API Decode ────────────────────────────────────────────────────────

export async function decodeVinNhtsa(vin: string): Promise<DecodedVehicle> {
  const v = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  const local = decodeVinLocal(v);

  if (v.length !== 17) return local;

  try {
    const resp = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${v}?format=json`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!resp.ok) return local;

    const json = await resp.json();
    const r = json?.Results?.[0];
    if (!r) return local;

    const pick = (val: string | undefined, fallback: string): string => {
      if (val && val.trim() && val !== 'Not Applicable' && val !== '0') return val.trim();
      return fallback;
    };
    const pickNum = (val: string | undefined, fallback: number): number => {
      const n = parseFloat(val || '');
      return isNaN(n) || n === 0 ? fallback : n;
    };

    // Determine fuel type from NHTSA data
    const nhtsaFuel = (r.FuelTypePrimary || '').toLowerCase();
    let fuelType: FuelType = local.fuelType;
    if (nhtsaFuel.includes('diesel')) {
      fuelType = 'diesel';
    } else if (nhtsaFuel.includes('gasoline') || nhtsaFuel.includes('gas')) {
      fuelType = 'gasoline';
    }

    // Determine vehicle type from NHTSA body class
    const bodyClass = (r.BodyClass || '').toLowerCase();
    let vehicleType: DecodedVehicle['vehicleType'] = 'unknown';
    if (bodyClass.includes('pickup') || bodyClass.includes('truck')) vehicleType = 'truck';
    else if (bodyClass.includes('suv') || bodyClass.includes('sport utility') || bodyClass.includes('multipurpose')) vehicleType = 'suv';
    else if (bodyClass.includes('van') || bodyClass.includes('cargo')) vehicleType = 'van';
    else if (bodyClass.includes('sedan') || bodyClass.includes('coupe') || bodyClass.includes('hatchback') || bodyClass.includes('convertible') || bodyClass.includes('wagon')) vehicleType = 'car';

    // Build engine description
    const displacementL = r.DisplacementL ? `${parseFloat(r.DisplacementL).toFixed(1)}L` : '';
    const cylinders = pickNum(r.EngineCylinders, local.cylinders);
    const turbo = r.Turbo === 'Yes' ? 'Turbo' : '';
    const engineModel = pick(r.EngineModel, '');
    const engineType = [displacementL, cylinders ? `${cylinders}-cyl` : '', turbo, engineModel].filter(Boolean).join(' ');

    return {
      vin: v,
      make: pick(r.Make, local.make),
      model: pick(r.Model, local.model),
      year: pickNum(r.ModelYear, local.year),
      manufacturer: local.manufacturer,  // Keep our WMI-based manufacturer mapping
      fuelType,
      engineType,
      displacement: displacementL || local.displacement,
      cylinders,
      vehicleType,
      country: pick(r.PlantCountry, local.country),
      nhtsaVerified: true,
    };
  } catch {
    return local;
  }
}

// ─── Quick VIN Identification (no network) ───────────────────────────────────

export function identifyVehicleFromVin(vin: string): {
  manufacturer: PIDManufacturer;
  fuelType: FuelType;
  make: string;
  year: number;
} {
  const decoded = decodeVinLocal(vin);
  return {
    manufacturer: decoded.manufacturer,
    fuelType: decoded.fuelType,
    make: decoded.make,
    year: decoded.year,
  };
}

// ─── VIN Validation ──────────────────────────────────────────────────────────

export function isValidVin(vin: string): boolean {
  if (!vin || vin.length !== 17) return false;
  // VINs cannot contain I, O, or Q
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase());
}

export function extractVinFromString(text: string): string | null {
  const match = text.match(/[A-HJ-NPR-Z0-9]{17}/i);
  return match ? match[0].toUpperCase() : null;
}
