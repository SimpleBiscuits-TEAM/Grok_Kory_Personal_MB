/**
 * VIN Extraction and Vehicle Information Lookup
 * Extracts VIN from filename and provides vehicle details
 */

export interface VehicleInfo {
  vin: string;
  year: number;
  make: string;
  model: string;
  series: string;
  trim: string;
  engine: string;
  displacement: string;
  cylinders: number;
  driveType: string;
  factoryHp: number;
  factoryTorque: number;
  transmission: string;
  fuelType: string;
}

/**
 * Extract VIN from filename
 * Looks for 17-character VIN pattern in filename
 */
export function extractVinFromFilename(filename: string): string | null {
  // Match 17-character VIN pattern (alphanumeric)
  const vinMatch = filename.match(/[A-HJ-NPR-Z0-9]{17}/);
  return vinMatch ? vinMatch[0] : null;
}

/**
 * Get vehicle information from VIN
 * Returns known Duramax vehicle configurations
 */
export function getVehicleInfoFromVin(vin: string): VehicleInfo | null {
  // Extract year from VIN (10th character)
  const yearChar = vin.charAt(9);
  const yearMap: { [key: string]: number } = {
    'J': 2018,
    'K': 2019,
    'L': 2020,
    'M': 2021,
    'N': 2022,
    'P': 2023,
    'R': 2024,
    'T': 2025,
    'V': 2026,
  };
  const year = yearMap[yearChar] || 2018;

  // Common Duramax configurations
  const duraMaxConfigs: { [key: string]: Partial<VehicleInfo> } = {
    // 2018-2024 Silverado 2500 HD with L5P Duramax
    '1GC1KWEY': {
      make: 'Chevrolet',
      model: 'Silverado 2500 HD',
      series: '2500',
      trim: 'LTZ',
      engine: 'L5P Duramax Gen 5',
      displacement: '6.6L',
      cylinders: 8,
      driveType: '4WD',
      factoryHp: 445,
      factoryTorque: 910,
      transmission: 'Allison 6-Speed Automatic',
      fuelType: 'Ultra-Low Sulfur Diesel (ULSD)',
    },
    // 2017-2019 Silverado 3500 HD with L5P Duramax
    '1GC1KWEZ': {
      make: 'Chevrolet',
      model: 'Silverado 3500 HD',
      series: '3500',
      trim: 'LTZ',
      engine: 'L5P Duramax Gen 5',
      displacement: '6.6L',
      cylinders: 8,
      driveType: '4WD',
      factoryHp: 445,
      factoryTorque: 910,
      transmission: 'Allison 6-Speed Automatic',
      fuelType: 'Ultra-Low Sulfur Diesel (ULSD)',
    },
    // 2015-2016 Silverado 2500 HD with LML Duramax
    '1GC1KWE': {
      make: 'Chevrolet',
      model: 'Silverado 2500 HD',
      series: '2500',
      trim: 'LTZ',
      engine: 'LML Duramax Gen 4',
      displacement: '6.6L',
      cylinders: 8,
      driveType: '4WD',
      factoryHp: 445,
      factoryTorque: 910,
      transmission: 'Allison 6-Speed Automatic',
      fuelType: 'Ultra-Low Sulfur Diesel (ULSD)',
    },
    // 2011-2016 Silverado 2500 HD with LML Duramax
    '1GC1KWC': {
      make: 'Chevrolet',
      model: 'Silverado 2500 HD',
      series: '2500',
      trim: 'LTZ',
      engine: 'LML Duramax Gen 4',
      displacement: '6.6L',
      cylinders: 8,
      driveType: '4WD',
      factoryHp: 445,
      factoryTorque: 910,
      transmission: 'Allison 6-Speed Automatic',
      fuelType: 'Ultra-Low Sulfur Diesel (ULSD)',
    },
    // 2006-2010 Silverado 2500 HD with LBZ/LMM Duramax
    '1GCHK29U': {
      make: 'Chevrolet',
      model: 'Silverado 2500 HD',
      series: '2500',
      trim: 'LTZ',
      engine: 'LBZ/LMM Duramax Gen 3',
      displacement: '6.6L',
      cylinders: 8,
      driveType: '4WD',
      factoryHp: 360,
      factoryTorque: 650,
      transmission: 'Allison 6-Speed Automatic',
      fuelType: 'Ultra-Low Sulfur Diesel (ULSD)',
    },
  };

  // Try to find matching configuration by VIN prefix
  let config: Partial<VehicleInfo> | null = null;
  for (const [prefix, cfg] of Object.entries(duraMaxConfigs)) {
    if (vin.startsWith(prefix)) {
      config = cfg;
      break;
    }
  }

  // If no specific match, use generic Duramax config
  if (!config) {
    config = {
      make: 'Chevrolet',
      model: 'Silverado',
      series: '2500',
      engine: 'L5P Duramax',
      displacement: '6.6L',
      cylinders: 8,
      driveType: '4WD',
      factoryHp: 445,
      factoryTorque: 910,
      transmission: 'Allison Automatic',
      fuelType: 'Ultra-Low Sulfur Diesel (ULSD)',
    };
  }

  return {
    vin,
    year,
    make: config.make || 'Chevrolet',
    model: config.model || 'Silverado',
    series: config.series || '2500',
    trim: config.trim || 'Unknown',
    engine: config.engine || 'Duramax Diesel',
    displacement: config.displacement || '6.6L',
    cylinders: config.cylinders || 8,
    driveType: config.driveType || '4WD',
    factoryHp: config.factoryHp || 445,
    factoryTorque: config.factoryTorque || 910,
    transmission: config.transmission || 'Allison Automatic',
    fuelType: config.fuelType || 'Diesel',
  };
}

/**
 * Extract VIN from filename and get vehicle info
 */
export function getVehicleInfoFromFilename(filename: string): VehicleInfo | null {
  const vin = extractVinFromFilename(filename);
  if (!vin) return null;
  return getVehicleInfoFromVin(vin);
}
