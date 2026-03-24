/**
 * Data processing utilities for Duramax OBD-II logs
 * Handles CSV parsing, data extraction, and horsepower calculations
 */

export interface DuramaxData {
  rpm: number[];
  maf: number[];
  boost: number[];
  torquePercent: number[];
  maxTorque: number[];
  vehicleSpeed: number[];
  fuelRate: number[];
  offset: number[];
  timestamp: string;
  duration: number; // in seconds
}

export interface ProcessedMetrics {
  rpm: number[];
  maf: number[];
  boost: number[];
  hpTorque: number[];
  hpMaf: number[];
  vehicleSpeed: number[];
  timeMinutes: number[];
  stats: {
    rpmMin: number;
    rpmMax: number;
    rpmMean: number;
    mafMin: number;
    mafMax: number;
    mafMean: number;
    hpTorqueMax: number;
    hpMafMax: number;
    boostMax: number;
    duration: number;
  };
}

/**
 * Parse CSV content from Duramax log file
 * Handles the specific format with metadata headers
 */
export function parseCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());
  
  // Find the header row (contains "Offset", "Mass Airflow", etc.)
  // HP Tuners format: line 0=title, 1=version, 2=blank, 3=[Log Info], 4=time, 5=notes, 6=blank, 7=[Channel Info], 8=IDs, 9=HEADER, 10=units, 11=blank, 12=[Channel Data], 13+=data
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Offset') && lines[i].includes('Mass Airflow')) {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    throw new Error('Could not find CSV header in log file');
  }
  
  // Parse header
  const headers = lines[headerIndex].split(',').map(h => h.trim());
  
  // Find column indices
  const getColumnIndex = (keywords: string[]): number => {
    for (const keyword of keywords) {
      const idx = headers.findIndex(h => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  
  const offsetIdx = getColumnIndex(['Offset']);
  const mafIdx = getColumnIndex(['Mass Airflow']);
  const boostIdx = getColumnIndex(['Intake Manifold Absolute Pressure']);
  const rpmIdx = getColumnIndex(['Engine RPM']);
  const torqueIdx = getColumnIndex(['Actual Engine Torque']);
  const maxTorqueIdx = getColumnIndex(['Maximum Engine Torque']);
  const speedIdx = getColumnIndex(['Vehicle Speed']);
  const fuelRateIdx = getColumnIndex(['Engine Fuel Rate']);
  
  if (rpmIdx === -1 || mafIdx === -1 || torqueIdx === -1) {
    throw new Error('Missing required columns: RPM, MAF, or Torque');
  }
  
  // Skip units row (headerIndex + 1) and blank row (headerIndex + 2) and [Channel Data] marker (headerIndex + 3), start from first data row (headerIndex + 4)
  const dataStart = headerIndex + 4; 
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('[')) break;
    
    const values = line.split(',').map(v => {
      const num = parseFloat(v.trim());
      return isNaN(num) ? 0 : num;
    });
    
    if (values.length < Math.max(rpmIdx, mafIdx, torqueIdx) + 1) continue;
    
    rpm.push(values[rpmIdx] || 0);
    maf.push(values[mafIdx] || 0);
    boost.push(boostIdx !== -1 ? values[boostIdx] : 0);
    torquePercent.push(values[torqueIdx] || 0);
    maxTorque.push(maxTorqueIdx !== -1 ? values[maxTorqueIdx] : 879.174);
    vehicleSpeed.push(speedIdx !== -1 ? values[speedIdx] : 0);
    fuelRate.push(fuelRateIdx !== -1 ? values[fuelRateIdx] : 0);
    offset.push(offsetIdx !== -1 ? values[offsetIdx] : i - dataStart);
  }
  
  if (rpm.length === 0) {
    throw new Error('No valid data rows found in CSV');
  }
  
  const duration = offset[offset.length - 1] - offset[0];
  
  return {
    rpm,
    maf,
    boost,
    torquePercent,
    maxTorque,
    vehicleSpeed,
    fuelRate,
    offset,
    timestamp: new Date().toLocaleString(),
    duration,
  };
}

/**
 * Calculate horsepower from torque and RPM
 * HP = Torque(lb·ft) × RPM / 5252
 */
function calculateHPFromTorque(torquePercent: number[], maxTorque: number[], rpm: number[]): number[] {
  return torquePercent.map((pct, i) => {
    const torqueLbFt = (pct / 100) * maxTorque[i];
    return (torqueLbFt * rpm[i]) / 5252;
  });
}

/**
 * Calculate horsepower from MAF (Mass Air Flow)
 * For diesel: HP ≈ MAF(lb/min) × 60 / (BSFC × AFR)
 * Using BSFC ≈ 0.35 lb/hp-hr and AFR ≈ 19:1
 */
function calculateHPFromMAF(maf: number[]): number[] {
  const BSFC = 0.35;
  const AFR = 19;
  return maf.map(m => (m * 60) / (BSFC * AFR));
}

/**
 * Process raw data and calculate all metrics
 */
export function processData(rawData: DuramaxData): ProcessedMetrics {
  const hpTorque = calculateHPFromTorque(
    rawData.torquePercent,
    rawData.maxTorque,
    rawData.rpm
  );
  
  const hpMaf = calculateHPFromMAF(rawData.maf);
  
  const timeMinutes = rawData.offset.map(o => o / 60);
  
  // Calculate statistics
  const stats = {
    rpmMin: Math.min(...rawData.rpm),
    rpmMax: Math.max(...rawData.rpm),
    rpmMean: rawData.rpm.reduce((a, b) => a + b, 0) / rawData.rpm.length,
    mafMin: Math.min(...rawData.maf),
    mafMax: Math.max(...rawData.maf),
    mafMean: rawData.maf.reduce((a, b) => a + b, 0) / rawData.maf.length,
    hpTorqueMax: Math.max(...hpTorque),
    hpMafMax: Math.max(...hpMaf),
    boostMax: Math.max(...rawData.boost),
    duration: rawData.duration,
  };
  
  return {
    rpm: rawData.rpm,
    maf: rawData.maf,
    boost: rawData.boost,
    hpTorque,
    hpMaf,
    vehicleSpeed: rawData.vehicleSpeed,
    timeMinutes,
    stats,
  };
}

/**
 * Downsample data for performance (keep every nth point)
 * Useful for large datasets to reduce chart rendering time
 */
export function downsampleData(data: ProcessedMetrics, targetPoints: number = 1000): ProcessedMetrics {
  if (data.rpm.length <= targetPoints) return data;
  
  const factor = Math.ceil(data.rpm.length / targetPoints);
  
  const downsample = (arr: number[]) => arr.filter((_, i) => i % factor === 0);
  
  return {
    ...data,
    rpm: downsample(data.rpm),
    maf: downsample(data.maf),
    boost: downsample(data.boost),
    hpTorque: downsample(data.hpTorque),
    hpMaf: downsample(data.hpMaf),
    vehicleSpeed: downsample(data.vehicleSpeed),
    timeMinutes: downsample(data.timeMinutes),
  };
}

/**
 * Create binned data for trend lines
 * Groups data into RPM bins and calculates mean values
 */
export function createBinnedData(
  data: ProcessedMetrics,
  binCount: number = 30
): Array<{
  rpmBin: number;
  mafMean: number;
  hpTorqueMean: number;
  hpMafMean: number;
  boostMean: number;
  count: number;
}> {
  const rpmMin = data.stats.rpmMin;
  const rpmMax = data.stats.rpmMax;
  const binSize = (rpmMax - rpmMin) / binCount;
  
  const bins: Map<number, { maf: number[]; hpTorque: number[]; hpMaf: number[]; boost: number[] }> = new Map();
  
  for (let i = 0; i < data.rpm.length; i++) {
    const binIndex = Math.floor((data.rpm[i] - rpmMin) / binSize);
    const binKey = rpmMin + binIndex * binSize + binSize / 2;
    
    if (!bins.has(binKey)) {
      bins.set(binKey, { maf: [], hpTorque: [], hpMaf: [], boost: [] });
    }
    
    const bin = bins.get(binKey)!;
    bin.maf.push(data.maf[i]);
    bin.hpTorque.push(data.hpTorque[i]);
    bin.hpMaf.push(data.hpMaf[i]);
    bin.boost.push(data.boost[i]);
  }
  
  return Array.from(bins.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rpmBin, values]) => ({
      rpmBin,
      mafMean: values.maf.reduce((a, b) => a + b, 0) / values.maf.length,
      hpTorqueMean: values.hpTorque.reduce((a, b) => a + b, 0) / values.hpTorque.length,
      hpMafMean: values.hpMaf.reduce((a, b) => a + b, 0) / values.hpMaf.length,
      boostMean: values.boost.reduce((a, b) => a + b, 0) / values.boost.length,
      count: values.maf.length,
    }));
}
