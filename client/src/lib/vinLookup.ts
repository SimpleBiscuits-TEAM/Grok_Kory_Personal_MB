/**
 * VIN Decoder — Comprehensive Vehicle Information
 * Decodes 17-character NHTSA-standard VINs for GM diesel trucks.
 * Provides decodethis.com-level detail: WMI, VDS, VIS, plant, sequence, etc.
 */

export interface VehicleInfo {
  // Core identity
  vin: string;
  year: number;
  make: string;
  model: string;
  series: string;
  trim: string;
  bodyStyle: string;
  // Engine
  engine: string;
  engineCode: string;
  displacement: string;
  cylinders: number;
  fuelType: string;
  injectionSystem: string;
  maxRailPressure: string;
  turbocharger: string;
  // Drivetrain
  driveType: string;
  transmission: string;
  transmissionCode: string;
  // Performance
  factoryHp: number;
  factoryTorque: number;
  peakTorqueRpm: number;
  peakHpRpm: number;
  redline: number;
  // Identification
  country: string;
  manufacturer: string;
  plant: string;
  plantCity: string;
  sequenceNumber: string;
  checkDigit: string;
  // VIN position breakdown
  wmi: string;       // World Manufacturer Identifier (pos 1–3)
  vds: string;       // Vehicle Descriptor Section (pos 4–9)
  vis: string;       // Vehicle Identifier Section (pos 10–17)
  // Decoded positions
  pos1_country: string;
  pos2_make: string;
  pos3_vehicleType: string;
  pos4_gvwr: string;
  pos5_series: string;
  pos6_body: string;
  pos7_restraint: string;
  pos8_engine: string;
  pos9_check: string;
  pos10_year: string;
  pos11_plant: string;
  pos12_17_sequence: string;
  // Aftertreatment
  aftertreatment: string;
  // Service info
  oilCapacity: string;
  coolantCapacity: string;
  defTankCapacity: string;
  fuelTankCapacity: string;
  towingCapacity: string;
  payloadCapacity: string;
  gvwr: string;
  nhtsaVerified: boolean;
}

// ─── VIN POSITION DECODERS ────────────────────────────────────────────────────

const YEAR_MAP: Record<string, number> = {
  'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
  'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
  'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
  'S': 2025, 'T': 2026, 'V': 2027,
};

const COUNTRY_MAP: Record<string, string> = {
  '1': 'United States', '2': 'Canada', '3': 'Mexico',
  '4': 'United States', '5': 'United States',
};

const GM_PLANT_MAP: Record<string, { city: string; state: string }> = {
  'F': { city: 'Flint', state: 'Michigan' },
  'J': { city: 'Janesville', state: 'Wisconsin' },
  'T': { city: 'Pontiac', state: 'Michigan' },
  'Z': { city: 'Silao', state: 'Guanajuato, Mexico' },
  '0': { city: 'Oshawa', state: 'Ontario, Canada' },
  '1': { city: 'Oshawa', state: 'Ontario, Canada' },
};

const ENGINE_CODE_MAP: Record<string, { name: string; displacement: string; hp: number; torque: number }> = {
  'Y': { name: 'L5P Duramax 6.6L Turbodiesel V8', displacement: '6.6L', hp: 445, torque: 910 },
  'L': { name: 'LML Duramax 6.6L Turbodiesel V8', displacement: '6.6L', hp: 397, torque: 765 },
  '8': { name: 'LMM Duramax 6.6L Turbodiesel V8', displacement: '6.6L', hp: 365, torque: 660 },
  '2': { name: 'LBZ Duramax 6.6L Turbodiesel V8', displacement: '6.6L', hp: 360, torque: 650 },
  '1': { name: 'LLY Duramax 6.6L Turbodiesel V8', displacement: '6.6L', hp: 310, torque: 605 },
  'U': { name: 'LB7 Duramax 6.6L Turbodiesel V8', displacement: '6.6L', hp: 300, torque: 520 },
};

const GVWR_MAP: Record<string, string> = {
  'C': 'Class C (10,001–14,000 lbs)',
  'D': 'Class D (14,001–16,000 lbs)',
  'E': 'Class E (16,001–19,500 lbs)',
  'F': 'Class F (19,501–26,000 lbs)',
};

// ─── WMI DATABASE ─────────────────────────────────────────────────────────────

interface WmiData {
  country: string;
  make: string;
  manufacturer: string;
}

const WMI_MAP: Record<string, WmiData> = {
  '1GC': { country: 'United States', make: 'Chevrolet', manufacturer: 'General Motors LLC' },
  '1GT': { country: 'United States', make: 'GMC', manufacturer: 'General Motors LLC' },
  '2GC': { country: 'Canada', make: 'Chevrolet', manufacturer: 'General Motors of Canada' },
  '2GT': { country: 'Canada', make: 'GMC', manufacturer: 'General Motors of Canada' },
  '3GC': { country: 'Mexico', make: 'Chevrolet', manufacturer: 'General Motors de Mexico' },
  '3GT': { country: 'Mexico', make: 'GMC', manufacturer: 'General Motors de Mexico' },
};

/** Check if a VIN belongs to a known GM truck */
function isGmVin(vin: string): boolean {
  const wmi = vin.substring(0, 3).toUpperCase();
  return WMI_MAP.hasOwnProperty(wmi);
}

/** Return a generic unknown engine detail for non-GM VINs */
function getGenericEngineDetail(): EngineDetail {
  return {
    name: 'Unknown Engine',
    code: 'Unknown',
    displacement: 'Unknown',
    hp: 0,
    torque: 0,
    peakTorqueRpm: 0,
    peakHpRpm: 0,
    redline: 0,
    injectionSystem: 'Unknown',
    maxRailPressure: 'Unknown',
    turbocharger: 'Unknown',
    aftertreatment: 'Unknown',
    oilCapacity: 'Unknown',
    coolantCapacity: 'Unknown',
    defTankCapacity: 'Unknown',
  };
}

// ─── DETAILED VIN CONFIGS ─────────────────────────────────────────────────────

interface VinConfig {
  model: string;
  series: string;
  trim: string;
  bodyStyle: string;
  driveType: string;
  gvwr: string;
  towingCapacity: string;
  payloadCapacity: string;
  fuelTankCapacity: string;
}

// Keyed by first 8 characters of VIN (WMI + partial VDS)
const VIN_CONFIGS: Record<string, VinConfig> = {
  // Chevrolet Silverado 2500 HD — 4WD — LTZ/High Country
  '1GC1KWEY': {
    model: 'Silverado 2500 HD', series: '2500 HD', trim: 'LTZ / High Country',
    bodyStyle: 'Crew Cab Pickup', driveType: '4WD (4x4)',
    gvwr: '10,000 lbs (Class III)', towingCapacity: 'Up to 18,500 lbs',
    payloadCapacity: 'Up to 3,979 lbs', fuelTankCapacity: '36 gal',
  },
  '1GC1KWEZ': {
    model: 'Silverado 3500 HD', series: '3500 HD', trim: 'LTZ / High Country',
    bodyStyle: 'Crew Cab Pickup', driveType: '4WD (4x4)',
    gvwr: '13,200 lbs (Class IV)', towingCapacity: 'Up to 23,300 lbs',
    payloadCapacity: 'Up to 7,442 lbs', fuelTankCapacity: '36 gal',
  },
  '1GC1KWE8': {
    model: 'Silverado 2500 HD', series: '2500 HD', trim: 'LT',
    bodyStyle: 'Crew Cab Pickup', driveType: '4WD (4x4)',
    gvwr: '10,000 lbs (Class III)', towingCapacity: 'Up to 18,500 lbs',
    payloadCapacity: 'Up to 3,979 lbs', fuelTankCapacity: '36 gal',
  },
  // GMC Sierra 2500 HD
  '1GT12UEY': {
    model: 'Sierra 2500 HD', series: '2500 HD', trim: 'SLT / Denali',
    bodyStyle: 'Crew Cab Pickup', driveType: '4WD (4x4)',
    gvwr: '10,000 lbs (Class III)', towingCapacity: 'Up to 18,500 lbs',
    payloadCapacity: 'Up to 3,979 lbs', fuelTankCapacity: '36 gal',
  },
  '1GT12UEZ': {
    model: 'Sierra 3500 HD', series: '3500 HD', trim: 'SLT / Denali',
    bodyStyle: 'Crew Cab Pickup', driveType: '4WD (4x4)',
    gvwr: '13,200 lbs (Class IV)', towingCapacity: 'Up to 23,300 lbs',
    payloadCapacity: 'Up to 7,442 lbs', fuelTankCapacity: '36 gal',
  },
};

// ─── TRANSMISSION DECODER ─────────────────────────────────────────────────────

function getTransmissionInfo(year: number, engineCode: string): { name: string; code: string } {
  if (year >= 2024) {
    return { name: 'GM/Allison 10L1000 10-Speed Automatic', code: '10L1000' };
  } else if (year >= 2020) {
    return { name: 'GM/Allison 10L1000 10-Speed Automatic (MYC)', code: '10L1000' };
  } else if (year >= 2006) {
    return { name: 'Allison 1000 6-Speed Automatic', code: 'MYD' };
  } else {
    return { name: 'Allison 1000 5-Speed Automatic', code: 'MYD' };
  }
}

// ─── ENGINE DETAIL BY YEAR ────────────────────────────────────────────────────

interface EngineDetail {
  name: string;
  code: string;
  displacement: string;
  hp: number;
  torque: number;
  peakTorqueRpm: number;
  peakHpRpm: number;
  redline: number;
  injectionSystem: string;
  maxRailPressure: string;
  turbocharger: string;
  aftertreatment: string;
  oilCapacity: string;
  coolantCapacity: string;
  defTankCapacity: string;
}

function getEngineDetail(year: number, engineChar: string, isGm: boolean = true): EngineDetail {
  // Non-GM VINs should not get Duramax engine defaults
  if (!isGm) return getGenericEngineDetail();
  // L5P Gen 2 (2024+) — E42 ECM, Global B architecture
  if (year >= 2024 && (engineChar === 'Y' || engineChar === 'L')) {
    return {
      name: 'Duramax L5P Gen 2 6.6L Turbodiesel V8',
      code: 'L5P',
      displacement: '6.6L (402 cu in)',
      hp: 470,
      torque: 975,
      peakTorqueRpm: 1600,
      peakHpRpm: 2800,
      redline: 3500,
      injectionSystem: 'Denso HP4 High-Pressure Common Rail (up to 32,000 psi)',
      maxRailPressure: '32,000 psi (220 MPa)',
      turbocharger: 'Garrett Variable Geometry Turbocharger (VGT) — 10-blade, enhanced actuator',
      aftertreatment: 'DOC + DPF + SCR (DEF/AdBlue) + EGR',
      oilCapacity: '10 qts (9.5L) with filter',
      coolantCapacity: '~23 qts (21.7L)',
      defTankCapacity: '5.3 gal (20L)',
    };
  }
  // L5P Gen 1 (2017–2023) — E41 ECM
  if (year >= 2017 && (engineChar === 'Y' || engineChar === 'L')) {
    return {
      name: 'Duramax L5P 6.6L Turbodiesel V8',
      code: 'L5P',
      displacement: '6.6L (402 cu in)',
      hp: 445,
      torque: 910,
      peakTorqueRpm: 1600,
      peakHpRpm: 3000,
      redline: 3500,
      injectionSystem: 'Denso HP4 High-Pressure Common Rail (up to 29,000 psi)',
      maxRailPressure: '29,000 psi (200 MPa)',
      turbocharger: 'Garrett Variable Geometry Turbocharger (VGT)',
      aftertreatment: 'DOC + DPF + SCR (DEF/AdBlue) + EGR',
      oilCapacity: '10 qts (9.5L) with filter',
      coolantCapacity: '~23 qts (21.7L)',
      defTankCapacity: '5.3 gal (20L)',
    };
  }
  // LML (2011–2016)
  if (year >= 2011 && year <= 2016) {
    return {
      name: 'Duramax LML 6.6L Turbodiesel V8',
      code: 'LML',
      displacement: '6.6L (402 cu in)',
      hp: 397,
      torque: 765,
      peakTorqueRpm: 1600,
      peakHpRpm: 3000,
      redline: 3500,
      injectionSystem: 'Bosch CP4.1 High-Pressure Common Rail (up to 26,000 psi)',
      maxRailPressure: '26,000 psi (180 MPa)',
      turbocharger: 'Garrett Variable Geometry Turbocharger (VGT)',
      aftertreatment: 'DOC + DPF + SCR (DEF/AdBlue) + EGR',
      oilCapacity: '10 qts (9.5L) with filter',
      coolantCapacity: '~23 qts (21.7L)',
      defTankCapacity: '5.3 gal (20L)',
    };
  }
  // LMM (2007.5–2010)
  if (year >= 2007 && year <= 2010) {
    return {
      name: 'Duramax LMM 6.6L Turbodiesel V8',
      code: 'LMM',
      displacement: '6.6L (402 cu in)',
      hp: 365,
      torque: 660,
      peakTorqueRpm: 1600,
      peakHpRpm: 3100,
      redline: 3500,
      injectionSystem: 'Bosch CP3 High-Pressure Common Rail',
      maxRailPressure: '23,000 psi (160 MPa)',
      turbocharger: 'Garrett Variable Geometry Turbocharger (VGT)',
      aftertreatment: 'DOC + DPF + EGR',
      oilCapacity: '10 qts (9.5L) with filter',
      coolantCapacity: '~23 qts (21.7L)',
      defTankCapacity: 'N/A (pre-SCR)',
    };
  }
  // Default / LBZ
  return {
    name: 'Duramax LBZ 6.6L Turbodiesel V8',
    code: 'LBZ',
    displacement: '6.6L (402 cu in)',
    hp: 360,
    torque: 650,
    peakTorqueRpm: 1600,
    peakHpRpm: 3100,
    redline: 3500,
    injectionSystem: 'Bosch CP3 High-Pressure Common Rail',
    maxRailPressure: '23,000 psi (160 MPa)',
    turbocharger: 'Garrett Variable Geometry Turbocharger (VGT)',
    aftertreatment: 'EGR only',
    oilCapacity: '10 qts (9.5L) with filter',
    coolantCapacity: '~23 qts (21.7L)',
    defTankCapacity: 'N/A',
  };
}

// ─── MAIN DECODER ─────────────────────────────────────────────────────────────

export function extractVinFromFilename(filename: string): string | null {
  const vinMatch = filename.match(/[A-HJ-NPR-Z0-9]{17}/);
  return vinMatch ? vinMatch[0] : null;
}

export function decodeVin(vin: string): VehicleInfo {
  const v = vin.toUpperCase();

  // WMI (positions 1–3)
  const wmi = v.substring(0, 3);
  const wmiData = WMI_MAP[wmi] || {
    country: COUNTRY_MAP[v[0]] || 'Unknown',
    make: 'Unknown',
    manufacturer: 'Unknown',
  };

  // VDS (positions 4–9)
  const vds = v.substring(3, 9);
  const pos4_gvwr = v[3]; // GVWR class
  const pos5_series = v[4]; // Series
  const pos6_body = v[5]; // Body style
  const pos7_restraint = v[6]; // Restraint system
  const pos8_engine = v[7]; // Engine
  const pos9_check = v[8]; // Check digit

  // VIS (positions 10–17)
  const vis = v.substring(9);
  const pos10_year = v[9];
  const pos11_plant = v[10];
  const pos12_17_sequence = v.substring(11);

  const year = YEAR_MAP[pos10_year] || 2018;
  const plantData = GM_PLANT_MAP[pos11_plant] || { city: 'Unknown', state: '' };
  const isGm = isGmVin(v);
  const engineDetail = getEngineDetail(year, pos8_engine, isGm);
  const transmissionInfo = isGm ? getTransmissionInfo(year, pos8_engine) : { name: 'Unknown', code: 'Unknown' };

  // Try to find vehicle config by 8-char prefix
  let vinConfig: VinConfig | null = null;
  for (const [prefix, cfg] of Object.entries(VIN_CONFIGS)) {
    if (v.startsWith(prefix)) {
      vinConfig = cfg;
      break;
    }
  }

  // Fallback config
  if (!vinConfig) {
    if (isGm) {
      const isSierra = wmiData.make === 'GMC';
      const is3500 = v[4] === 'Z' || v[4] === '3';
      vinConfig = {
        model: isSierra ? (is3500 ? 'Sierra 3500 HD' : 'Sierra 2500 HD') : (is3500 ? 'Silverado 3500 HD' : 'Silverado 2500 HD'),
        series: is3500 ? '3500 HD' : '2500 HD',
        trim: 'Unknown',
        bodyStyle: 'Pickup Truck',
        driveType: '4WD',
        gvwr: '10,000+ lbs',
        towingCapacity: 'See window sticker',
        payloadCapacity: 'See window sticker',
        fuelTankCapacity: '36 gal',
      };
    } else {
      // Non-GM: generic fallback, let NHTSA fill in the real data
      vinConfig = {
        model: 'Unknown',
        series: 'Unknown',
        trim: 'Unknown',
        bodyStyle: 'Unknown',
        driveType: 'Unknown',
        gvwr: 'Unknown',
        towingCapacity: 'Unknown',
        payloadCapacity: 'Unknown',
        fuelTankCapacity: 'Unknown',
      };
    }
  }

  // Decode body/series position
  const bodyMap: Record<string, string> = {
    'E': 'Crew Cab (4-door)',
    'C': 'Extended Cab (2-door)',
    'R': 'Regular Cab (2-door)',
    'Y': 'Crew Cab Short Bed',
    'Z': 'Crew Cab Long Bed',
  };
  const seriesMap: Record<string, string> = {
    'K': 'HD 2500 4WD',
    'C': 'HD 2500 2WD',
    'J': 'HD 3500 4WD',
    'H': 'HD 3500 2WD',
  };

  return {
    vin: v,
    year,
    make: wmiData.make,
    model: vinConfig.model,
    series: vinConfig.series,
    trim: vinConfig.trim,
    bodyStyle: bodyMap[pos6_body] || vinConfig.bodyStyle,
    engine: engineDetail.name,
    engineCode: engineDetail.code,
    displacement: engineDetail.displacement,
    cylinders: isGm ? 8 : 0,
    fuelType: isGm ? 'Ultra-Low Sulfur Diesel (ULSD)' : 'Unknown',
    injectionSystem: engineDetail.injectionSystem,
    maxRailPressure: engineDetail.maxRailPressure,
    turbocharger: engineDetail.turbocharger,
    driveType: vinConfig.driveType,
    transmission: transmissionInfo.name,
    transmissionCode: transmissionInfo.code,
    factoryHp: engineDetail.hp,
    factoryTorque: engineDetail.torque,
    peakTorqueRpm: engineDetail.peakTorqueRpm,
    peakHpRpm: engineDetail.peakHpRpm,
    redline: engineDetail.redline,
    country: wmiData.country,
    manufacturer: wmiData.manufacturer,
    plant: `${plantData.city}${plantData.state ? ', ' + plantData.state : ''}`,
    plantCity: plantData.city,
    sequenceNumber: pos12_17_sequence,
    checkDigit: pos9_check,
    wmi,
    vds,
    vis,
    pos1_country: `${v[0]} — ${wmiData.country}`,
    pos2_make: `${v[1]} — ${wmiData.make}`,
    pos3_vehicleType: `${v[2]} — Truck/MPV`,
    pos4_gvwr: `${pos4_gvwr} — ${GVWR_MAP[pos4_gvwr] || 'Heavy Duty'}`,
    pos5_series: `${pos5_series} — ${seriesMap[pos5_series] || vinConfig.series}`,
    pos6_body: `${pos6_body} — ${bodyMap[pos6_body] || vinConfig.bodyStyle}`,
    pos7_restraint: `${pos7_restraint} — Active Front Air Bags + Seat Belts`,
    pos8_engine: `${pos8_engine} — ${engineDetail.name}`,
    pos9_check: `${pos9_check} — Check Digit`,
    pos10_year: `${pos10_year} — ${year} Model Year`,
    pos11_plant: `${pos11_plant} — ${plantData.city || 'Assembly Plant'}`,
    pos12_17_sequence: `${pos12_17_sequence} — Production Sequence Number`,
    aftertreatment: engineDetail.aftertreatment,
    oilCapacity: engineDetail.oilCapacity,
    coolantCapacity: engineDetail.coolantCapacity,
    defTankCapacity: engineDetail.defTankCapacity,
    fuelTankCapacity: vinConfig.fuelTankCapacity,
    towingCapacity: vinConfig.towingCapacity,
    payloadCapacity: vinConfig.payloadCapacity,
    gvwr: vinConfig.gvwr,
    nhtsaVerified: false,
  };
}

export function getVehicleInfoFromVin(vin: string): VehicleInfo {
  return decodeVin(vin);
}

export function getVehicleInfoFromFilename(filename: string): VehicleInfo | null {
  const vin = extractVinFromFilename(filename);
  if (!vin) return null;
  return decodeVin(vin);
}

/**
 * Async VIN decode via NHTSA vPIC API.
 * Returns NHTSA-verified VehicleInfo, falling back to local decode on failure.
 */
export async function decodeVinNhtsa(vin: string): Promise<VehicleInfo> {
  const v = vin.toUpperCase();
  const localFallback = decodeVin(v);

  try {
    const resp = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${v}?format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return { ...localFallback, nhtsaVerified: false };

    const json = await resp.json();
    const r = json?.Results?.[0];
    if (!r) return { ...localFallback, nhtsaVerified: false };

    // Only trust NHTSA data if ErrorCode is 0 (clean decode)
    const errorCode = r.ErrorCode?.toString() || '';
    const isClean = errorCode === '0' || errorCode === '';

    // Helper: prefer NHTSA value, fall back to local
    const pick = (nhtsaVal: string | undefined, localVal: string): string => {
      if (nhtsaVal && nhtsaVal !== 'Not Applicable' && nhtsaVal !== '0' && nhtsaVal.trim()) {
        return nhtsaVal.trim();
      }
      return localVal;
    };
    const pickNum = (nhtsaVal: string | undefined, localVal: number): number => {
      const n = parseFloat(nhtsaVal || '');
      return isNaN(n) || n === 0 ? localVal : n;
    };

    // Build engine name from NHTSA fields
    const nhtsaDisplacement = r.DisplacementL ? `${parseFloat(r.DisplacementL).toFixed(1)}L` : '';
    const nhtsaCylinders = r.EngineCylinders ? `V${r.EngineCylinders}` : '';
    const nhtsaFuelType = pick(r.FuelTypePrimary, '');
    const nhtsaTurbo = r.Turbo === 'Yes' ? 'Turbocharged' : (r.Turbo || '');
    const nhtsaEngineName = [nhtsaDisplacement, nhtsaCylinders, nhtsaTurbo, nhtsaFuelType, r.EngineModel || ''].filter(Boolean).join(' ');

    return {
      ...localFallback,
      nhtsaVerified: isClean,
      // Override with NHTSA-verified data
      year: pickNum(r.ModelYear, localFallback.year),
      make: pick(r.Make, localFallback.make),
      model: pick(r.Model, localFallback.model),
      series: pick(r.Series || r.Series2, localFallback.series),
      trim: pick(r.Trim || r.Trim2, localFallback.trim),
      bodyStyle: pick(r.BodyClass, localFallback.bodyStyle),
      engine: nhtsaEngineName || localFallback.engine,
      engineCode: pick(r.EngineModel, localFallback.engineCode),
      displacement: nhtsaDisplacement || localFallback.displacement,
      cylinders: pickNum(r.EngineCylinders, localFallback.cylinders),
      fuelType: pick(r.FuelTypePrimary, localFallback.fuelType),
      injectionSystem: pick(r.FuelInjectionType, localFallback.injectionSystem),
      turbocharger: pick(nhtsaTurbo || r.Turbo, localFallback.turbocharger),
      driveType: pick(r.DriveType, localFallback.driveType),
      transmission: pick(r.TransmissionStyle, localFallback.transmission),
      factoryHp: pickNum(r.EngineHP, localFallback.factoryHp),
      country: pick(r.PlantCountry, localFallback.country),
      manufacturer: pick(r.Manufacturer, localFallback.manufacturer),
      plant: pick(
        [r.PlantCity, r.PlantState].filter(Boolean).join(', '),
        localFallback.plant
      ),
      plantCity: pick(r.PlantCity, localFallback.plantCity),
      gvwr: pick(r.GVWR, localFallback.gvwr),
    };
  } catch {
    // Network error or timeout: fall back to local decode
    return { ...localFallback, nhtsaVerified: false };
  }
}
