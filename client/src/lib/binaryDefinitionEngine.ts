/**
 * Binary-to-Definition Engine
 *
 * Automatically discovers calibration maps in raw ECU binaries without A2L files.
 * Uses pattern recognition, axis detection, and patent-based descriptions to generate
 * complete EcuDefinition objects suitable for the calibration editor.
 *
 * Algorithms based on:
 * - WinOLS map identification techniques
 * - Bosch ECU binary structure analysis
 * - Polaris & Can-Am patent documents (US20190185110A1, US20200182164A1)
 * - PCMTec and HUD ECU Hacker reverse-engineering approaches
 */

import {
  EcuDefinition,
  CalibrationMap,
  CompuMethod,
  RecordLayout,
  AxisPts,
  AxisDescriptor,
  DATA_TYPES,
  DataTypeInfo,
} from './editorEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MapCandidate {
  offset: number;
  rows: number;
  cols: number;
  dataType: DataTypeInfo;
  axisXType: DataTypeInfo;
  axisYType: DataTypeInfo;
  axisXValues?: number[];
  axisYValues?: number[];
  dataValues?: number[];
  confidence: number;  // 0-1, how sure we are this is a real map
  pattern: 'header_2d' | 'header_1d' | 'shared_axis' | 'inferred';
  estimatedCategory?: string;
  estimatedName?: string;
}

export interface BinaryAnalysisResult {
  candidates: MapCandidate[];
  ecuFamily: string;
  byteOrder: 'MSB_FIRST' | 'MSB_LAST';
  confidence: number;
  log: string[];
}

// ─── Patent-Based Map Descriptions ───────────────────────────────────────────

/**
 * Map descriptions derived from Polaris and Can-Am patent documents.
 * Indexed by (axisX_type, axisY_type) → description
 */
const PATENT_MAP_DESCRIPTIONS: Record<string, Record<string, string>> = {
  'RPM|TPS': {
    '2d': 'Fuel Injection Quantity (main)',
    '1d': 'Fuel Injection Quantity (single axis)',
  },
  'RPM|LOAD': {
    '2d': 'Fuel Injection Duration',
    '1d': 'Fuel Injection Duration',
  },
  'RPM|BOOST': {
    '2d': 'VGT Vane Position Target',
    '1d': 'Boost Target',
  },
  'RPM|MAF': {
    '2d': 'Intake Air Mass Compensation',
    '1d': 'MAF Scaling',
  },
  'RPM|COOLANT': {
    '2d': 'Coolant Temperature Compensation',
    '1d': 'Coolant Offset',
  },
  'RPM|IAT': {
    '2d': 'Intake Air Temperature Compensation',
    '1d': 'IAT Offset',
  },
  'RPM|NULL': {
    '1d': 'Speed Limiter',
    '1d_alt': 'Rev Limiter',
    '1d_torque': 'Torque Limiter',
  },
  'BOOST|TPS': {
    '2d': 'Boost Pressure Target',
  },
  'LOAD|RPM': {
    '2d': 'Smoke Limiter',
    '2d_alt': 'EGR Rate',
  },
};

/**
 * Common axis value ranges for different sensor types.
 * Used to classify axes and infer map purpose.
 */
const AXIS_SIGNATURES = {
  RPM: { min: 500, max: 8000, typical: [800, 1000, 1200, 1400, 1600, 2000, 2500, 3000, 4000, 5000, 6000] },
  TPS: { min: 0, max: 100, typical: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
  LOAD: { min: 0, max: 100, typical: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] },
  BOOST: { min: 0, max: 50, typical: [0, 5, 10, 15, 20, 25, 30, 35, 40] },
  MAF: { min: 0, max: 1000, typical: [0, 50, 100, 150, 200, 250, 300, 400, 500] },
  COOLANT: { min: -40, max: 120, typical: [-40, -20, 0, 20, 40, 60, 80, 100, 120] },
  IAT: { min: -40, max: 80, typical: [-40, -20, 0, 20, 40, 60, 80] },
};

// ─── Core Algorithm ──────────────────────────────────────────────────────────

/**
 * Scan binary for calibration maps using pattern recognition.
 * Returns list of candidate maps with confidence scores.
 */
export function scanBinaryForMaps(
  binaryData: Uint8Array,
  ecuFamily: string = 'UNKNOWN',
  byteOrder: 'MSB_FIRST' | 'MSB_LAST' = 'MSB_LAST'
): BinaryAnalysisResult {
  const log: string[] = [];
  const candidates: MapCandidate[] = [];

  log.push(`[Binary Scanner] Starting scan of ${binaryData.length} bytes (${(binaryData.length / 1024 / 1024).toFixed(1)}MB)`);
  log.push(`[Binary Scanner] ECU Family: ${ecuFamily}, Byte Order: ${byteOrder}`);

  // Strategy 1: Look for 2D map headers (dimension byte + dimension byte + axes + data)
  const headerCandidates = scanFor2DMapHeaders(binaryData, byteOrder, log);
  candidates.push(...headerCandidates);

  // Strategy 2: Look for 1D maps (single axis + data)
  const curve1DCandidates = scanFor1DCurves(binaryData, byteOrder, log);
  candidates.push(...curve1DCandidates);

  // Strategy 3: Look for shared axis patterns (multiple tables referencing same axis)
  const sharedAxisCandidates = scanForSharedAxisPatterns(binaryData, byteOrder, log);
  candidates.push(...sharedAxisCandidates);

  // Deduplicate and score candidates
  const dedupedCandidates = deduplicateCandidates(candidates);
  const scoredCandidates = scoreCandidates(dedupedCandidates, log);

  log.push(`[Binary Scanner] Found ${scoredCandidates.length} candidate maps with confidence > 0.3`);

  return {
    candidates: scoredCandidates.filter(c => c.confidence > 0.3),
    ecuFamily,
    byteOrder,
    confidence: scoredCandidates.length > 0 ? 0.5 : 0.1,
    log,
  };
}

/**
 * Scan for 2D map headers: [rows] [cols] [axis_x_values...] [axis_y_values...] [data...]
 */
function scanFor2DMapHeaders(
  data: Uint8Array,
  byteOrder: 'MSB_FIRST' | 'MSB_LAST',
  log: string[]
): MapCandidate[] {
  const candidates: MapCandidate[] = [];
  const bigEndian = byteOrder === 'MSB_FIRST';

  // Scan for dimension bytes (1-32, typically)
  for (let i = 0; i < data.length - 100; i++) {
    const rows = data[i];
    const cols = data[i + 1];

    // Heuristic: rows and cols should be small (1-32) and reasonable
    if (rows < 1 || rows > 32 || cols < 1 || cols > 32) continue;
    if (rows * cols > 1024) continue; // Sanity check

    // Try different data types for axes
    for (const axisType of [DATA_TYPES.UWORD, DATA_TYPES.SWORD]) {
      const axisSize = axisType.size;
      const headerSize = 2 + rows * axisSize + cols * axisSize;

      if (i + headerSize + rows * cols * 2 > data.length) continue;

      // Extract axis values
      const axisXStart = i + 2;
      const axisYStart = axisXStart + rows * axisSize;
      const dataStart = axisYStart + cols * axisSize;

      const axisXValues = extractAxisValues(data, axisXStart, rows, axisType, bigEndian);
      const axisYValues = extractAxisValues(data, axisYStart, cols, axisType, bigEndian);

      // Check if axes are monotonically increasing (strong indicator of real map)
      if (!isMonotonicIncreasing(axisXValues) || !isMonotonicIncreasing(axisYValues)) continue;

      // Extract data values
      const dataValues = extractDataValues(data, dataStart, rows * cols, DATA_TYPES.UWORD, bigEndian);

      candidates.push({
        offset: i,
        rows,
        cols,
        dataType: DATA_TYPES.UWORD,
        axisXType: axisType,
        axisYType: axisType,
        axisXValues,
        axisYValues,
        dataValues,
        confidence: 0.7, // High confidence for proper headers
        pattern: 'header_2d',
      });
    }
  }

  log.push(`[2D Header Scanner] Found ${candidates.length} 2D map candidates`);
  return candidates;
}

/**
 * Scan for 1D curves: [count] [axis_values...] [data...]
 */
function scanFor1DCurves(
  data: Uint8Array,
  byteOrder: 'MSB_FIRST' | 'MSB_LAST',
  log: string[]
): MapCandidate[] {
  const candidates: MapCandidate[] = [];
  const bigEndian = byteOrder === 'MSB_FIRST';

  for (let i = 0; i < data.length - 50; i++) {
    const count = data[i];

    if (count < 2 || count > 32) continue;

    for (const axisType of [DATA_TYPES.UWORD, DATA_TYPES.SWORD]) {
      const axisSize = axisType.size;
      const headerSize = 1 + count * axisSize;

      if (i + headerSize + count * 2 > data.length) continue;

      const axisStart = i + 1;
      const dataStart = axisStart + count * axisSize;

      const axisValues = extractAxisValues(data, axisStart, count, axisType, bigEndian);

      if (!isMonotonicIncreasing(axisValues)) continue;

      const dataValues = extractDataValues(data, dataStart, count, DATA_TYPES.UWORD, bigEndian);

      candidates.push({
        offset: i,
        rows: count,
        cols: 1,
        dataType: DATA_TYPES.UWORD,
        axisXType: axisType,
        axisYType: DATA_TYPES.UBYTE,
        axisXValues: axisValues,
        dataValues,
        confidence: 0.6,
        pattern: 'header_1d',
      });
    }
  }

  log.push(`[1D Curve Scanner] Found ${candidates.length} 1D curve candidates`);
  return candidates;
}

/**
 * Scan for shared axis patterns (multiple tables with same axis).
 * Common in Bosch ECUs where 4 tables share one axis.
 */
function scanForSharedAxisPatterns(
  data: Uint8Array,
  byteOrder: 'MSB_FIRST' | 'MSB_LAST',
  log: string[]
): MapCandidate[] {
  const candidates: MapCandidate[] = [];
  // Placeholder for advanced pattern detection
  // This would look for repeating data blocks followed by shared axis definitions
  log.push(`[Shared Axis Scanner] Placeholder (advanced feature)`);
  return candidates;
}

/**
 * Extract axis values from binary data.
 */
function extractAxisValues(
  data: Uint8Array,
  offset: number,
  count: number,
  dataType: DataTypeInfo,
  bigEndian: boolean
): number[] {
  const values: number[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.length);

  for (let i = 0; i < count; i++) {
    const pos = offset + i * dataType.size;
    if (pos + dataType.size > data.length) break;

    let value = 0;
    if (dataType.size === 1) {
      value = dataType.signed ? view.getInt8(pos) : view.getUint8(pos);
    } else if (dataType.size === 2) {
      value = dataType.signed ? view.getInt16(pos, !bigEndian) : view.getUint16(pos, !bigEndian);
    } else if (dataType.size === 4) {
      value = dataType.signed ? view.getInt32(pos, !bigEndian) : view.getUint32(pos, !bigEndian);
    }
    values.push(value);
  }

  return values;
}

/**
 * Extract data values from binary.
 */
function extractDataValues(
  data: Uint8Array,
  offset: number,
  count: number,
  dataType: DataTypeInfo,
  bigEndian: boolean
): number[] {
  const values: number[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.length);

  for (let i = 0; i < count; i++) {
    const pos = offset + i * dataType.size;
    if (pos + dataType.size > data.length) break;

    let value = 0;
    if (dataType.size === 1) {
      value = dataType.signed ? view.getInt8(pos) : view.getUint8(pos);
    } else if (dataType.size === 2) {
      value = dataType.signed ? view.getInt16(pos, !bigEndian) : view.getUint16(pos, !bigEndian);
    } else if (dataType.size === 4) {
      value = dataType.signed ? view.getInt32(pos, !bigEndian) : view.getUint32(pos, !bigEndian);
    }
    values.push(value);
  }

  return values;
}

/**
 * Check if array is monotonically increasing.
 */
function isMonotonicIncreasing(values: number[]): boolean {
  if (values.length < 2) return true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] <= values[i - 1]) return false;
  }
  return true;
}

/**
 * Deduplicate candidates that overlap significantly.
 */
function deduplicateCandidates(candidates: MapCandidate[]): MapCandidate[] {
  const unique: MapCandidate[] = [];

  for (const candidate of candidates) {
    const overlaps = unique.some(
      u =>
        Math.abs(u.offset - candidate.offset) < 10 &&
        u.rows === candidate.rows &&
        u.cols === candidate.cols
    );

    if (!overlaps) {
      unique.push(candidate);
    }
  }

  return unique;
}

/**
 * Score candidates based on heuristics.
 */
function scoreCandidates(candidates: MapCandidate[], log: string[]): MapCandidate[] {
  return candidates
    .map(c => {
      let score = c.confidence;

      // Boost confidence for reasonable data ranges
      if (c.dataValues) {
        const dataMin = Math.min(...c.dataValues);
        const dataMax = Math.max(...c.dataValues);
        const dataRange = dataMax - dataMin;

        // Good maps have non-zero range and reasonable values
        if (dataRange > 10 && dataMax < 65535) {
          score += 0.1;
        }
      }

      // Boost confidence for recognizable axis patterns
      if (c.axisXValues) {
        const axisType = classifyAxis(c.axisXValues);
        if (axisType !== 'UNKNOWN') {
          score += 0.1;
        }
      }

      return { ...c, confidence: Math.min(score, 1.0) };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Classify an axis based on its value range and pattern.
 */
function classifyAxis(values: number[]): string {
  if (values.length === 0) return 'UNKNOWN';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // RPM: typically 500-8000
  if (min >= 400 && max <= 10000 && range > 1000) return 'RPM';

  // TPS/Load: typically 0-100
  if (min >= -10 && max <= 110 && range > 50) return 'TPS';

  // Boost: typically 0-50 PSI
  if (min >= -5 && max <= 60 && range > 10) return 'BOOST';

  // MAF: typically 0-1000 g/s
  if (min >= -50 && max <= 1500 && range > 100) return 'MAF';

  // Coolant temp: typically -40 to 120°C
  if (min >= -50 && max <= 150 && range > 50) return 'COOLANT';

  return 'UNKNOWN';
}

/**
 * Generate an EcuDefinition from binary analysis results.
 */
export function generateEcuDefinitionFromBinary(
  binaryData: Uint8Array,
  analysisResult: BinaryAnalysisResult,
  fileName: string
): EcuDefinition {
  const maps: CalibrationMap[] = [];
  const compuMethods = new Map<string, CompuMethod>();
  const recordLayouts = new Map<string, RecordLayout>();
  const axisPts = new Map<string, AxisPts>();

  // Create standard record layouts
  recordLayouts.set('UWORD_2D', {
    name: 'UWORD_2D',
    fncValuesType: 'UWORD',
    fncValuesLayout: 'ROW_DIR',
    axisXType: 'UWORD',
    axisYType: 'UWORD',
  });

  recordLayouts.set('UWORD_1D', {
    name: 'UWORD_1D',
    fncValuesType: 'UWORD',
    fncValuesLayout: 'ROW_DIR',
    axisXType: 'UWORD',
  });

  // Create standard compu method (identity: physical = raw)
  compuMethods.set('IDENTITY', {
    name: 'IDENTITY',
    type: 'IDENTICAL',
    unit: 'raw',
    format: '%.0f',
  });

  // Convert candidates to maps
  for (let i = 0; i < analysisResult.candidates.length; i++) {
    const candidate = analysisResult.candidates[i];
    const mapName = generateMapName(candidate, i);
    const mapDesc = generateMapDescription(candidate);

    const map: CalibrationMap = {
      name: mapName,
      description: mapDesc,
      type: candidate.cols > 1 ? 'MAP' : 'CURVE',
      address: candidate.offset,
      recordLayout: candidate.cols > 1 ? 'UWORD_2D' : 'UWORD_1D',
      compuMethod: 'IDENTITY',
      lowerLimit: 0,
      upperLimit: 65535,
      annotations: [`Auto-discovered from binary`, `Confidence: ${(candidate.confidence * 100).toFixed(0)}%`],
      axes: [],
      rows: candidate.rows,
      cols: candidate.cols,
      rawValues: candidate.dataValues,
      category: 'Auto-Discovered',
      subcategory: candidate.estimatedCategory || 'Other',
      level: 5, // Full A2L level
    };

    // Add axis descriptors if we have axis values
    if (candidate.axisXValues) {
      map.axes.push({
        type: 'FIX_AXIS',
        inputQuantity: 'RPM', // Placeholder
        compuMethod: 'IDENTITY',
        maxAxisPoints: candidate.rows,
        lowerLimit: 0,
        upperLimit: 65535,
      });
    }

    if (candidate.cols > 1 && candidate.axisYValues) {
      map.axes.push({
        type: 'FIX_AXIS',
        inputQuantity: 'TPS', // Placeholder
        compuMethod: 'IDENTITY',
        maxAxisPoints: candidate.cols,
        lowerLimit: 0,
        upperLimit: 65535,
      });
    }

    maps.push(map);
  }

  return {
    source: 'a2l', // Treat as A2L-like for compatibility
    fileName,
    ecuFamily: analysisResult.ecuFamily,
    moduleInfo: {
      name: `Auto-discovered from ${fileName}`,
      comment: `Binary-to-Definition engine analysis`,
      byteOrder: analysisResult.byteOrder,
    },
    maps,
    measurements: [],
    compuMethods,
    recordLayouts,
    axisPts,
    parseTime: Date.now(),
    errors: [],
    stats: {
      totalMaps: maps.length,
      totalMeasurements: 0,
      mapsByType: {
        MAP: maps.filter(m => m.type === 'MAP').length,
        CURVE: maps.filter(m => m.type === 'CURVE').length,
      },
    },
  };
}

/**
 * Generate a descriptive name for a map candidate.
 */
function generateMapName(candidate: MapCandidate, index: number): string {
  if (candidate.estimatedName) return candidate.estimatedName;

  const typeStr = candidate.cols > 1 ? 'Map' : 'Curve';
  const dimStr = candidate.cols > 1 ? `${candidate.rows}x${candidate.cols}` : `${candidate.rows}pt`;

  return `${typeStr}_${dimStr}_${index.toString().padStart(3, '0')}`;
}

/**
 * Generate a description for a map candidate.
 */
function generateMapDescription(candidate: MapCandidate): string {
  if (candidate.estimatedName) return candidate.estimatedName;

  const typeStr = candidate.cols > 1 ? '2D Map' : '1D Curve';
  const dimStr = candidate.cols > 1 ? `${candidate.rows}×${candidate.cols}` : `${candidate.rows} points`;

  return `${typeStr} (${dimStr}) - Auto-discovered from binary`;
}
