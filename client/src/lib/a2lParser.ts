/**
 * PPEI Advanced Mode - a2L (ASAP2) Calibration File Parser
 *
 * Parses ASAP2/a2L calibration files used in ECU tuning.
 * Extracts measurements, characteristics, axis descriptions, record layouts,
 * and conversion methods for display and cross-referencing with the knowledge base.
 *
 * a2L files are text-based with a hierarchical block structure:
 *   /begin BLOCK_TYPE name ... /end BLOCK_TYPE
 *
 * Key block types:
 *   MEASUREMENT    - Readable ECU values (sensors, calculated values)
 *   CHARACTERISTIC - Tunable parameters (maps, curves, scalars)
 *   AXIS_DESCR     - Axis definitions for maps/curves
 *   COMPU_METHOD   - Conversion formulas (raw -> physical)
 *   RECORD_LAYOUT  - Memory layout descriptions
 *   MOD_PAR        - Module parameters (ECU info)
 *   MOD_COMMON     - Common module settings
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface A2LMeasurement {
  name: string;
  longIdentifier: string;
  dataType: string;
  conversionMethod: string;
  resolution: number;
  accuracy: number;
  lowerLimit: number;
  upperLimit: number;
  unit?: string;
  ecuAddress?: string;
  bitMask?: string;
  format?: string;
  annotations?: string[];
}

export interface A2LCharacteristic {
  name: string;
  longIdentifier: string;
  type: 'VALUE' | 'CURVE' | 'MAP' | 'CUBOID' | 'VAL_BLK' | 'ASCII' | string;
  address: string;
  recordLayout: string;
  maxDiff: number;
  conversionMethod: string;
  lowerLimit: number;
  upperLimit: number;
  unit?: string;
  axisDescriptions?: A2LAxisDescription[];
  annotations?: string[];
}

export interface A2LAxisDescription {
  attribute: string;
  inputQuantity: string;
  conversionMethod: string;
  maxAxisPoints: number;
  lowerLimit: number;
  upperLimit: number;
  unit?: string;
}

export interface A2LCompuMethod {
  name: string;
  longIdentifier: string;
  conversionType: string;
  format: string;
  unit: string;
  coefficients?: number[];
  formula?: string;
  compuTabRef?: string;
}

export interface A2LRecordLayout {
  name: string;
  fields: string[];
}

export interface A2LModuleInfo {
  name: string;
  comment: string;
  ecuCalibrationOffset?: string;
  cpuType?: string;
  epromIdentifier?: string;
}

export interface A2LParseResult {
  measurements: A2LMeasurement[];
  characteristics: A2LCharacteristic[];
  compuMethods: A2LCompuMethod[];
  recordLayouts: A2LRecordLayout[];
  moduleInfo: A2LModuleInfo | null;
  fileName: string;
  parseTime: number;
  errors: string[];
  stats: {
    totalMeasurements: number;
    totalCharacteristics: number;
    totalCompuMethods: number;
    totalRecordLayouts: number;
    characteristicTypes: Record<string, number>;
  };
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Extract all blocks of a given type from the a2L content.
 * Returns array of [blockName, blockContent] tuples.
 */
function extractBlocks(content: string, blockType: string): [string, string][] {
  const results: [string, string][] = [];
  const regex = new RegExp(
    `/begin\\s+${blockType}\\s+(\\S+)([\\s\\S]*?)/end\\s+${blockType}`,
    'gi'
  );
  let match;
  while ((match = regex.exec(content)) !== null) {
    results.push([match[1], match[2]]);
  }
  return results;
}

/**
 * Clean a string value - remove quotes and trim
 */
function cleanString(s: string): string {
  return s.replace(/^"(.*)"$/, '$1').trim();
}

/**
 * Parse a MEASUREMENT block
 */
function parseMeasurement(name: string, body: string): A2LMeasurement | null {
  try {
    // The first line after the name contains: longIdentifier dataType conversionMethod resolution accuracy lowerLimit upperLimit
    const lines = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return null;

    // Try to parse the first line which has the core fields
    // Format: "long identifier" dataType conversionMethod resolution accuracy lowerLimit upperLimit
    const firstLine = lines.join(' ');
    const quotedMatch = firstLine.match(/^"([^"]*)"([\s\S]*)$/);
    
    let longId = '';
    let rest = firstLine;
    
    if (quotedMatch) {
      longId = quotedMatch[1];
      rest = quotedMatch[2].trim();
    }

    const tokens = rest.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('/'));
    
    const measurement: A2LMeasurement = {
      name,
      longIdentifier: longId,
      dataType: tokens[0] || 'UNKNOWN',
      conversionMethod: tokens[1] || 'NO_COMPU_METHOD',
      resolution: parseFloat(tokens[2]) || 0,
      accuracy: parseFloat(tokens[3]) || 0,
      lowerLimit: parseFloat(tokens[4]) || 0,
      upperLimit: parseFloat(tokens[5]) || 0,
    };

    // Extract optional fields
    const ecuAddrMatch = body.match(/ECU_ADDRESS\s+(0x[0-9A-Fa-f]+|\d+)/i);
    if (ecuAddrMatch) measurement.ecuAddress = ecuAddrMatch[1];

    const bitMaskMatch = body.match(/BIT_MASK\s+(0x[0-9A-Fa-f]+|\d+)/i);
    if (bitMaskMatch) measurement.bitMask = bitMaskMatch[1];

    const formatMatch = body.match(/FORMAT\s+"([^"]+)"/i);
    if (formatMatch) measurement.format = formatMatch[1];

    // Extract annotations
    const annotations: string[] = [];
    const annotRegex = /ANNOTATION_TEXT\s+"([^"]+)"/gi;
    let annotMatch;
    while ((annotMatch = annotRegex.exec(body)) !== null) {
      annotations.push(annotMatch[1]);
    }
    if (annotations.length > 0) measurement.annotations = annotations;

    return measurement;
  } catch {
    return null;
  }
}

/**
 * Parse a CHARACTERISTIC block
 */
function parseCharacteristic(name: string, body: string): A2LCharacteristic | null {
  try {
    const firstLine = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ');
    const quotedMatch = firstLine.match(/^"([^"]*)"([\s\S]*)$/);
    
    let longId = '';
    let rest = firstLine;
    
    if (quotedMatch) {
      longId = quotedMatch[1];
      rest = quotedMatch[2].trim();
    }

    const tokens = rest.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('/'));

    const characteristic: A2LCharacteristic = {
      name,
      longIdentifier: longId,
      type: tokens[0] || 'VALUE',
      address: tokens[1] || '0x0',
      recordLayout: tokens[2] || 'UNKNOWN',
      maxDiff: parseFloat(tokens[3]) || 0,
      conversionMethod: tokens[4] || 'NO_COMPU_METHOD',
      lowerLimit: parseFloat(tokens[5]) || 0,
      upperLimit: parseFloat(tokens[6]) || 0,
    };

    // Extract axis descriptions
    const axisBlocks = extractBlocks(body, 'AXIS_DESCR');
    if (axisBlocks.length > 0) {
      characteristic.axisDescriptions = axisBlocks.map(([attr, axisBody]) => {
        const axisTokens = axisBody.trim().split(/\s+/).filter(t => t.length > 0);
        return {
          attribute: attr,
          inputQuantity: axisTokens[0] || '',
          conversionMethod: axisTokens[1] || '',
          maxAxisPoints: parseInt(axisTokens[2]) || 0,
          lowerLimit: parseFloat(axisTokens[3]) || 0,
          upperLimit: parseFloat(axisTokens[4]) || 0,
        };
      });
    }

    // Extract annotations
    const annotations: string[] = [];
    const annotRegex = /ANNOTATION_TEXT\s+"([^"]+)"/gi;
    let annotMatch;
    while ((annotMatch = annotRegex.exec(body)) !== null) {
      annotations.push(annotMatch[1]);
    }
    if (annotations.length > 0) characteristic.annotations = annotations;

    return characteristic;
  } catch {
    return null;
  }
}

/**
 * Parse a COMPU_METHOD block
 */
function parseCompuMethod(name: string, body: string): A2LCompuMethod | null {
  try {
    const firstLine = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ');
    const quotedMatch = firstLine.match(/^"([^"]*)"([\s\S]*)$/);
    
    let longId = '';
    let rest = firstLine;
    
    if (quotedMatch) {
      longId = quotedMatch[1];
      rest = quotedMatch[2].trim();
    }

    const tokens = rest.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('/'));

    const method: A2LCompuMethod = {
      name,
      longIdentifier: longId,
      conversionType: tokens[0] || 'IDENTICAL',
      format: tokens[1] || '%8.3',
      unit: cleanString(tokens[2] || ''),
    };

    // Extract COEFFS for RAT_FUNC type
    const coeffMatch = body.match(/COEFFS\s+([\d.\-e+]+)\s+([\d.\-e+]+)\s+([\d.\-e+]+)\s+([\d.\-e+]+)\s+([\d.\-e+]+)\s+([\d.\-e+]+)/i);
    if (coeffMatch) {
      method.coefficients = [
        parseFloat(coeffMatch[1]),
        parseFloat(coeffMatch[2]),
        parseFloat(coeffMatch[3]),
        parseFloat(coeffMatch[4]),
        parseFloat(coeffMatch[5]),
        parseFloat(coeffMatch[6]),
      ];
    }

    // Extract FORMULA
    const formulaMatch = body.match(/FORMULA\s+"([^"]+)"/i);
    if (formulaMatch) method.formula = formulaMatch[1];

    // Extract COMPU_TAB_REF
    const tabRefMatch = body.match(/COMPU_TAB_REF\s+(\S+)/i);
    if (tabRefMatch) method.compuTabRef = tabRefMatch[1];

    return method;
  } catch {
    return null;
  }
}

/**
 * Parse a RECORD_LAYOUT block
 */
function parseRecordLayout(name: string, body: string): A2LRecordLayout {
  const fields = body.trim().split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('/'));
  return { name, fields };
}

/**
 * Parse MOD_PAR and MOD_COMMON for module info
 */
function parseModuleInfo(content: string): A2LModuleInfo | null {
  const moduleBlocks = extractBlocks(content, 'MODULE');
  if (moduleBlocks.length === 0) return null;

  const [moduleName, moduleBody] = moduleBlocks[0];
  const commentMatch = moduleBody.match(/^"([^"]*)"/);

  const info: A2LModuleInfo = {
    name: moduleName,
    comment: commentMatch ? commentMatch[1] : '',
  };

  const cpuMatch = moduleBody.match(/CPU_TYPE\s+"([^"]+)"/i);
  if (cpuMatch) info.cpuType = cpuMatch[1];

  const epromMatch = moduleBody.match(/EPK\s+"([^"]+)"/i);
  if (epromMatch) info.epromIdentifier = epromMatch[1];

  const calOffsetMatch = moduleBody.match(/ECU_CALIBRATION_OFFSET\s+(0x[0-9A-Fa-f]+|\d+)/i);
  if (calOffsetMatch) info.ecuCalibrationOffset = calOffsetMatch[1];

  return info;
}

// ─── Main Parse Function ─────────────────────────────────────────────────────

/**
 * Parse an a2L file content string into structured data.
 * Handles large files efficiently by using regex-based extraction.
 */
export function parseA2L(content: string, fileName: string): A2LParseResult {
  const startTime = performance.now();
  const errors: string[] = [];

  // Parse measurements
  const measurementBlocks = extractBlocks(content, 'MEASUREMENT');
  const measurements: A2LMeasurement[] = [];
  for (const [name, body] of measurementBlocks) {
    const m = parseMeasurement(name, body);
    if (m) {
      measurements.push(m);
    } else {
      errors.push(`Failed to parse MEASUREMENT: ${name}`);
    }
  }

  // Parse characteristics
  const characteristicBlocks = extractBlocks(content, 'CHARACTERISTIC');
  const characteristics: A2LCharacteristic[] = [];
  for (const [name, body] of characteristicBlocks) {
    const c = parseCharacteristic(name, body);
    if (c) {
      characteristics.push(c);
    } else {
      errors.push(`Failed to parse CHARACTERISTIC: ${name}`);
    }
  }

  // Parse computation methods
  const compuMethodBlocks = extractBlocks(content, 'COMPU_METHOD');
  const compuMethods: A2LCompuMethod[] = [];
  for (const [name, body] of compuMethodBlocks) {
    const cm = parseCompuMethod(name, body);
    if (cm) {
      compuMethods.push(cm);
    } else {
      errors.push(`Failed to parse COMPU_METHOD: ${name}`);
    }
  }

  // Parse record layouts
  const recordLayoutBlocks = extractBlocks(content, 'RECORD_LAYOUT');
  const recordLayouts: A2LRecordLayout[] = recordLayoutBlocks.map(
    ([name, body]) => parseRecordLayout(name, body)
  );

  // Parse module info
  const moduleInfo = parseModuleInfo(content);

  // Count characteristic types
  const characteristicTypes: Record<string, number> = {};
  for (const c of characteristics) {
    characteristicTypes[c.type] = (characteristicTypes[c.type] || 0) + 1;
  }

  const parseTime = performance.now() - startTime;

  return {
    measurements,
    characteristics,
    compuMethods,
    recordLayouts,
    moduleInfo,
    fileName,
    parseTime,
    errors,
    stats: {
      totalMeasurements: measurements.length,
      totalCharacteristics: characteristics.length,
      totalCompuMethods: compuMethods.length,
      totalRecordLayouts: recordLayouts.length,
      characteristicTypes,
    },
  };
}

/**
 * Convert a2L data to searchable knowledge base documents
 * for integration with the existing search engine.
 */
export function a2lToSearchContext(result: A2LParseResult): string {
  const lines: string[] = [];

  if (result.moduleInfo) {
    lines.push(`ECU Module: ${result.moduleInfo.name}`);
    if (result.moduleInfo.cpuType) lines.push(`CPU: ${result.moduleInfo.cpuType}`);
    if (result.moduleInfo.epromIdentifier) lines.push(`EPROM: ${result.moduleInfo.epromIdentifier}`);
    lines.push('');
  }

  lines.push(`=== MEASUREMENTS (${result.measurements.length}) ===`);
  for (const m of result.measurements.slice(0, 200)) {
    const unit = m.unit || '';
    lines.push(`${m.name}: ${m.longIdentifier} [${m.lowerLimit}..${m.upperLimit}${unit ? ' ' + unit : ''}] (${m.dataType}, ${m.conversionMethod})`);
  }
  if (result.measurements.length > 200) {
    lines.push(`... and ${result.measurements.length - 200} more measurements`);
  }

  lines.push('');
  lines.push(`=== CHARACTERISTICS (${result.characteristics.length}) ===`);
  for (const c of result.characteristics.slice(0, 200)) {
    lines.push(`${c.name}: ${c.longIdentifier} [${c.type}] (${c.lowerLimit}..${c.upperLimit})`);
  }
  if (result.characteristics.length > 200) {
    lines.push(`... and ${result.characteristics.length - 200} more characteristics`);
  }

  return lines.join('\n');
}

/**
 * Search within a2L data for a query string.
 * Returns matching measurements and characteristics.
 */
export function searchA2L(
  result: A2LParseResult,
  query: string
): { measurements: A2LMeasurement[]; characteristics: A2LCharacteristic[] } {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(t => t.length > 1);

  const matchScore = (text: string): number => {
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += 1;
    }
    // Exact match bonus
    if (lower.includes(q)) score += 3;
    return score;
  };

  const measurements = result.measurements
    .map(m => ({
      item: m,
      score: matchScore(`${m.name} ${m.longIdentifier} ${m.annotations?.join(' ') || ''}`),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item)
    .slice(0, 50);

  const characteristics = result.characteristics
    .map(c => ({
      item: c,
      score: matchScore(`${c.name} ${c.longIdentifier} ${c.annotations?.join(' ') || ''}`),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item)
    .slice(0, 50);

  return { measurements, characteristics };
}
