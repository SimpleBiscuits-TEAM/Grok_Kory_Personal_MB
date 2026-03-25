/**
 * Data processing utilities for Duramax OBD-II logs
 * Handles CSV parsing for both HP Tuners and EFILIVE formats
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
  railPressureActual: number[];
  railPressureDesired: number[];
  pcvDutyCycle: number[];
  boostDesired: number[];
  turboVanePosition: number[];
  exhaustGasTemp: number[];
  converterSlip: number[];
  converterDutyCycle: number[];
  converterPressure: number[];
  oilPressure: number[];
  coolantTemp: number[];
  oilTemp: number[];
  transFluidTemp: number[];
  timestamp: string;
  duration: number;
  fileFormat: 'hptuners' | 'efilive' | 'bankspower';
}

export interface ProcessedMetrics {
  rpm: number[];
  maf: number[];
  boost: number[];
  hpTorque: number[];
  hpMaf: number[];
  vehicleSpeed: number[];
  timeMinutes: number[];
  railPressureActual: number[];
  railPressureDesired: number[];
  pcvDutyCycle: number[];
  boostDesired: number[];
  turboVanePosition: number[];
  exhaustGasTemp: number[];
  converterSlip: number[];
  converterDutyCycle: number[];
  converterPressure: number[];
  oilPressure: number[];
  coolantTemp: number[];
  oilTemp: number[];
  transFluidTemp: number[];
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
  fileFormat: 'hptuners' | 'efilive' | 'bankspower';
}

/**
 * Detect file format and parse accordingly
 */
export function parseCSV(content: string): DuramaxData {
  // Try to detect format
  const lines = content.split('\n').map(line => line.trim());
  
  // Check for Banks Power format (has "Horsepower ECU", "Torque ECU", "DYNO" columns)
  const isBanksPower = lines.some(line => 
    line.includes('Horsepower ECU') || 
    line.includes('DYNO - WHP') || 
    line.includes('Transmission Slip')
  );
  
  // EFILIVE format starts with "Frame", "Time", "Flags" and has "ECM.RPM", "ECM.MAF"
  const isEFILive = lines.some(line => line.includes('ECM.RPM') || line.includes('ECM.MAF'));
  
  if (isBanksPower) {
    return parseBanksPowerCSV(content);
  } else if (isEFILive) {
    return parseEFILiveCSV(content);
  } else {
    return parseHPTunersCSV(content);
  }
}

/**
 * Parse HP Tuners CSV format
 */
function parseHPTunersCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());
  
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Offset') && lines[i].includes('Mass Airflow')) {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    throw new Error('Could not find CSV header in HP Tuners log file');
  }
  
  const headers = lines[headerIndex].split(',').map(h => h.trim());
  
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
  const railActualIdx = getColumnIndex(['Fuel Rail Pressure']);
  const railDesiredIdx = getColumnIndex(['Desired Fuel Pressure']);
  const pcvIdx = getColumnIndex(['PCV', 'Pressure Regulator']);
  const boostDesiredIdx = getColumnIndex(['Desired Boost']);
  const turboVaneIdx = getColumnIndex(['Turbo Vane Position', 'Turbo A Vane Position']);
  const egtIdx = getColumnIndex(['Exhaust Gas Temperature', 'EGT']);
  const converterSlipIdx = getColumnIndex(['Converter Slip', 'TCM.TCSLIP']);
  const converterDutyIdx = getColumnIndex(['Converter Duty', 'Converter PWM']);
  const converterPressureIdx = getColumnIndex(['Converter Pressure', 'TCC Pressure']);
  const oilPressureIdx = getColumnIndex(['Engine Oil Pressure', 'Oil Pressure']);
  const coolantTempIdx = getColumnIndex(['Engine Coolant Temp', 'Coolant Temperature', 'ECT']);
  const oilTempIdx = getColumnIndex(['Engine Oil Temp', 'Oil Temperature', 'EOT']);
  const transFluidTempIdx = getColumnIndex(['Transmission Fluid Temp', 'Trans Fluid Temp', 'Trans Temp']);
  
  if (rpmIdx === -1 || mafIdx === -1 || torqueIdx === -1) {
    throw new Error('Missing required columns: RPM, MAF, or Torque');
  }
  
  const dataStart = headerIndex + 4;
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  
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
    railPressureActual.push(railActualIdx !== -1 ? values[railActualIdx] : 0);
    railPressureDesired.push(railDesiredIdx !== -1 ? values[railDesiredIdx] : 0);
    pcvDutyCycle.push(pcvIdx !== -1 ? values[pcvIdx] : 0);
    boostDesired.push(boostDesiredIdx !== -1 ? values[boostDesiredIdx] : 0);
    turboVanePosition.push(turboVaneIdx !== -1 ? values[turboVaneIdx] : 0);
    exhaustGasTemp.push(egtIdx !== -1 ? values[egtIdx] : 0);
    converterSlip.push(converterSlipIdx !== -1 ? values[converterSlipIdx] : 0);
    converterDutyCycle.push(converterDutyIdx !== -1 ? values[converterDutyIdx] : 0);
    converterPressure.push(converterPressureIdx !== -1 ? values[converterPressureIdx] : 0);
    oilPressure.push(oilPressureIdx !== -1 ? values[oilPressureIdx] : 0);
    coolantTemp.push(coolantTempIdx !== -1 ? values[coolantTempIdx] : 0);
    oilTemp.push(oilTempIdx !== -1 ? values[oilTempIdx] : 0);
    transFluidTemp.push(transFluidTempIdx !== -1 ? values[transFluidTempIdx] : 0);
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
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    timestamp: new Date().toLocaleString(),
    duration,
    fileFormat: 'hptuners',
  };
}

/**
 * Parse EFILIVE CSV format
 */
function parseEFILiveCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('Invalid EFILIVE CSV format');
  }
  
  // EFILIVE format: first line is header
  const headers = lines[0].split(',').map(h => h.trim());
  
  const getColumnIndex = (keywords: string[]): number => {
    for (const keyword of keywords) {
      const idx = headers.findIndex(h => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  
  // EFILIVE column mappings
  const timeIdx = getColumnIndex(['Time']);
  const rpmIdx = getColumnIndex(['ECM.RPM']);
  const mafIdx = getColumnIndex(['ECM.MAF']);
  const mapIdx = getColumnIndex(['ECM.MAP']);
  const torqueIdx = getColumnIndex(['ECM.TQ_ACT']);
  const maxTorqueIdx = getColumnIndex(['ECM.TQ_REF']);
  const speedIdx = getColumnIndex(['ECM.VSS']);
  const fuelRateIdx = getColumnIndex(['ECM.FUEL_RATE']);
  const railActualIdx = getColumnIndex(['ECM.FRP_A']);
  const railDesiredIdx = getColumnIndex(['ECM.FRPDI']);
  const pcvIdx = getColumnIndex(['ECM.FRPVDC']);
  const boostDesiredIdx = getColumnIndex(['ECM.DESTQ']);
  const turboVaneIdx = getColumnIndex(['ECM.TCVPOS']);
  const egtIdx = getColumnIndex(['ECM.EGTS1', 'ECM.EGTS']);
  const converterSlipIdx = getColumnIndex(['TCM.TCSLIP']);
  const converterDutyIdx = getColumnIndex(['TCM.TCCPCSCP']);
  const converterPressureIdx = getColumnIndex(['TCM.TCCP']);
  const oilPressureIdx = getColumnIndex(['ECM.OILP', 'Oil Pressure']);
  const coolantTempIdx = getColumnIndex(['ECM.ECT', 'Engine Coolant Temp']);
  const oilTempIdx = getColumnIndex(['ECM.EOT', 'Engine Oil Temp']);
  const transFluidTempIdx = getColumnIndex(['TCM.TFT', 'Transmission Fluid Temp']);
  
  if (rpmIdx === -1 || mafIdx === -1 || torqueIdx === -1) {
    throw new Error('Missing required columns in EFILIVE format: ECM.RPM, ECM.MAF, or ECM.TQ_ACT');
  }
  
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const values = line.split(',').map(v => {
      const num = parseFloat(v.trim());
      return isNaN(num) ? 0 : num;
    });
    
    if (values.length < Math.max(rpmIdx, mafIdx, torqueIdx) + 1) continue;
    
    rpm.push(values[rpmIdx] || 0);
    maf.push(values[mafIdx] || 0);
    boost.push(mapIdx !== -1 ? values[mapIdx] : 0);
    torquePercent.push(values[torqueIdx] || 0);
    maxTorque.push(maxTorqueIdx !== -1 ? values[maxTorqueIdx] : 879.174);
    vehicleSpeed.push(speedIdx !== -1 ? values[speedIdx] : 0);
    fuelRate.push(fuelRateIdx !== -1 ? values[fuelRateIdx] : 0);
    offset.push(timeIdx !== -1 ? values[timeIdx] : i);
    railPressureActual.push(railActualIdx !== -1 ? values[railActualIdx] : 0);
    railPressureDesired.push(railDesiredIdx !== -1 ? values[railDesiredIdx] : 0);
    pcvDutyCycle.push(pcvIdx !== -1 ? values[pcvIdx] : 0);
    boostDesired.push(boostDesiredIdx !== -1 ? values[boostDesiredIdx] : 0);
    turboVanePosition.push(turboVaneIdx !== -1 ? values[turboVaneIdx] : 0);
    exhaustGasTemp.push(egtIdx !== -1 ? values[egtIdx] : 0);
    converterSlip.push(converterSlipIdx !== -1 ? values[converterSlipIdx] : 0);
    converterDutyCycle.push(converterDutyIdx !== -1 ? values[converterDutyIdx] : 0);
    converterPressure.push(converterPressureIdx !== -1 ? values[converterPressureIdx] : 0);
    oilPressure.push(oilPressureIdx !== -1 ? values[oilPressureIdx] : 0);
    coolantTemp.push(coolantTempIdx !== -1 ? values[coolantTempIdx] : 0);
    oilTemp.push(oilTempIdx !== -1 ? values[oilTempIdx] : 0);
    transFluidTemp.push(transFluidTempIdx !== -1 ? values[transFluidTempIdx] : 0);
  }
  
  if (rpm.length === 0) {
    throw new Error('No valid data rows found in EFILIVE CSV');
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
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    timestamp: new Date().toLocaleString(),
    duration,
    fileFormat: 'efilive',
  };
}

/**
 * Parse Banks Power CSV format
 */
function parseBanksPowerCSV(content: string): DuramaxData {
  const lines = content.split('\n').map(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('Invalid Banks Power CSV format');
  }
  
  // Banks Power format: first line is header
  const headers = lines[0].split(',').map(h => h.trim());
  
  const getColumnIndex = (keywords: string[]): number => {
    for (const keyword of keywords) {
      const idx = headers.findIndex(h => h.includes(keyword));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  
  // Banks Power column mappings
  const timeIdx = getColumnIndex(['TIME']);
  const rpmIdx = getColumnIndex(['Engine RPM']);
  const mafIdx = getColumnIndex(['Mass Air Flow']);
  const mapIdx = getColumnIndex(['Manifold Absolute Pressure']);
  const torqueIdx = getColumnIndex(['Torque ECU']);
  const hpIdx = getColumnIndex(['Horsepower ECU']);
  const speedIdx = getColumnIndex(['Vehicle Speed']);
  const fuelRateIdx = getColumnIndex(['Fuel Flow Rate', 'Cylinder Fuel Rate']);
  const railActualIdx = getColumnIndex(['Fuel Rail Pressure']);
  const railDesiredIdx = getColumnIndex(['FRP Commanded']);
  const pcvIdx = getColumnIndex(['Fuel Rail Pressure']); // Banks doesn't have direct PCV, use FRP
  const boostDesiredIdx = getColumnIndex(['MAP Commanded']);
  const turboVaneIdx = getColumnIndex(['Turbo Vane Position']);
  const egtIdx = getColumnIndex(['EGT1 - Diesel Oxidization CAT', 'EGT - Turbo Inlet Temperature']);
  const converterSlipIdx = getColumnIndex(['Transmission Slip']);
  const converterDutyIdx = getColumnIndex(['Torque Converter Status']);
  const converterPressureIdx = getColumnIndex(['Trans Line 1 Pressure']);
  const oilPressureIdx = getColumnIndex(['Engine Oil Pressure', 'Oil Pressure']);
  const coolantTempIdx = getColumnIndex(['Engine Coolant Temp', 'Coolant Temp']);
  const oilTempIdx = getColumnIndex(['Engine Oil Temp', 'Oil Temp']);
  const transFluidTempIdx = getColumnIndex(['Transmission Fluid Temp', 'Trans Fluid Temp']);
  
  if (rpmIdx === -1 || mafIdx === -1) {
    throw new Error('Missing required columns in Banks Power format: Engine RPM or Mass Air Flow');
  }
  
  const rpm: number[] = [];
  const maf: number[] = [];
  const boost: number[] = [];
  const torquePercent: number[] = [];
  const maxTorque: number[] = [];
  const vehicleSpeed: number[] = [];
  const fuelRate: number[] = [];
  const offset: number[] = [];
  const railPressureActual: number[] = [];
  const railPressureDesired: number[] = [];
  const pcvDutyCycle: number[] = [];
  const boostDesired: number[] = [];
  const turboVanePosition: number[] = [];
  const exhaustGasTemp: number[] = [];
  const converterSlip: number[] = [];
  const converterDutyCycle: number[] = [];
  const converterPressure: number[] = [];
  const oilPressure: number[] = [];
  const coolantTemp: number[] = [];
  const oilTemp: number[] = [];
  const transFluidTemp: number[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const values = line.split(',').map(v => {
      const num = parseFloat(v.trim());
      return isNaN(num) ? 0 : num;
    });
    
    if (values.length < Math.max(rpmIdx, mafIdx) + 1) continue;
    
    rpm.push(values[rpmIdx] || 0);
    maf.push(values[mafIdx] || 0);
    boost.push(mapIdx !== -1 ? values[mapIdx] : 0);
    
    // Banks Power provides actual torque and HP, not percentages
    // Convert torque to percentage if we have max torque reference
    if (torqueIdx !== -1 && hpIdx !== -1) {
      // Use torque directly, assume 879 lb-ft reference
      torquePercent.push((values[torqueIdx] / 879.174) * 100);
      maxTorque.push(879.174);
    } else {
      torquePercent.push(0);
      maxTorque.push(879.174);
    }
    
    vehicleSpeed.push(speedIdx !== -1 ? values[speedIdx] : 0);
    fuelRate.push(fuelRateIdx !== -1 ? values[fuelRateIdx] : 0);
    offset.push(timeIdx !== -1 ? values[timeIdx] : i);
    railPressureActual.push(railActualIdx !== -1 ? values[railActualIdx] : 0);
    railPressureDesired.push(railDesiredIdx !== -1 ? values[railDesiredIdx] : 0);
    pcvDutyCycle.push(pcvIdx !== -1 ? values[pcvIdx] : 0);
    boostDesired.push(boostDesiredIdx !== -1 ? values[boostDesiredIdx] : 0);
    turboVanePosition.push(turboVaneIdx !== -1 ? values[turboVaneIdx] : 0);
    exhaustGasTemp.push(egtIdx !== -1 ? values[egtIdx] : 0);
    converterSlip.push(converterSlipIdx !== -1 ? values[converterSlipIdx] : 0);
    converterDutyCycle.push(converterDutyIdx !== -1 ? values[converterDutyIdx] : 0);
    converterPressure.push(converterPressureIdx !== -1 ? values[converterPressureIdx] : 0);
    oilPressure.push(oilPressureIdx !== -1 ? values[oilPressureIdx] : 0);
    coolantTemp.push(coolantTempIdx !== -1 ? values[coolantTempIdx] : 0);
    oilTemp.push(oilTempIdx !== -1 ? values[oilTempIdx] : 0);
    transFluidTemp.push(transFluidTempIdx !== -1 ? values[transFluidTempIdx] : 0);
  }
  
  if (rpm.length === 0) {
    throw new Error('No valid data rows found in Banks Power CSV');
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
    railPressureActual,
    railPressureDesired,
    pcvDutyCycle,
    boostDesired,
    turboVanePosition,
    exhaustGasTemp,
    converterSlip,
    converterDutyCycle,
    converterPressure,
    oilPressure,
    coolantTemp,
    oilTemp,
    transFluidTemp,
    timestamp: new Date().toLocaleString(),
    duration,
    fileFormat: 'bankspower',
  };
}

/**
 * Calculate horsepower from torque and RPM
 */
function calculateHPFromTorque(torquePercent: number[], maxTorque: number[], rpm: number[]): number[] {
  return torquePercent.map((pct, i) => {
    const torqueLbFt = (pct / 100) * maxTorque[i];
    return (torqueLbFt * rpm[i]) / 5252;
  });
}

/**
 * Calculate horsepower from MAF
 */
function calculateHPFromMAF(maf: number[]): number[] {
  const BSFC = 0.35; // Brake Specific Fuel Consumption for diesel
  const AFR = 19; // Air-Fuel Ratio for diesel
  
  return maf.map(m => {
    return (m * 60) / (BSFC * AFR);
  });
}

/**
 * Process raw data into metrics
 */
export function processData(rawData: DuramaxData): ProcessedMetrics {
  const hpTorque = calculateHPFromTorque(
    rawData.torquePercent,
    rawData.maxTorque,
    rawData.rpm
  );
  
  const hpMaf = calculateHPFromMAF(rawData.maf);
  
  const timeMinutes = rawData.offset.map(o => o / 60);
  
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
    railPressureActual: rawData.railPressureActual,
    railPressureDesired: rawData.railPressureDesired,
    pcvDutyCycle: rawData.pcvDutyCycle,
    boostDesired: rawData.boostDesired,
    turboVanePosition: rawData.turboVanePosition,
    exhaustGasTemp: rawData.exhaustGasTemp,
    converterSlip: rawData.converterSlip,
    converterDutyCycle: rawData.converterDutyCycle,
    converterPressure: rawData.converterPressure,
    oilPressure: rawData.oilPressure,
    coolantTemp: rawData.coolantTemp,
    oilTemp: rawData.oilTemp,
    transFluidTemp: rawData.transFluidTemp,
    stats,
    fileFormat: rawData.fileFormat,
  };
}

/**
 * Downsample data for performance
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
    railPressureActual: downsample(data.railPressureActual),
    railPressureDesired: downsample(data.railPressureDesired),
    pcvDutyCycle: downsample(data.pcvDutyCycle),
    boostDesired: downsample(data.boostDesired),
    turboVanePosition: downsample(data.turboVanePosition),
    exhaustGasTemp: downsample(data.exhaustGasTemp),
    converterSlip: downsample(data.converterSlip),
    converterDutyCycle: downsample(data.converterDutyCycle),
    converterPressure: downsample(data.converterPressure),
    oilPressure: downsample(data.oilPressure),
    coolantTemp: downsample(data.coolantTemp),
    oilTemp: downsample(data.oilTemp),
    transFluidTemp: downsample(data.transFluidTemp),
  };
}

/**
 * Create binned data for trend lines
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
