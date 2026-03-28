/**
 * ECU Calibration Editor Engine
 *
 * Core engine for the professional-grade calibration editor.
 * Handles:
 *  - Enhanced A2L parsing (GM-style + Bosch DAMOS dialects)
 *  - Cummins CSV map format parsing
 *  - Binary format readers (raw, S-Record, Intel HEX, PPEI)
 *  - COMPU_METHOD scaling (RAT_FUNC, TAB_INTP, IDENTICAL)
 *  - Binary ↔ A2L offset alignment
 *  - Map value reading/writing from binary data
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type DataTypeInfo = {
  name: string;
  size: number;       // bytes
  signed: boolean;
  float: boolean;
};

export const DATA_TYPES: Record<string, DataTypeInfo> = {
  UBYTE:   { name: 'UBYTE',   size: 1, signed: false, float: false },
  SBYTE:   { name: 'SBYTE',   size: 1, signed: true,  float: false },
  UWORD:   { name: 'UWORD',   size: 2, signed: false, float: false },
  SWORD:   { name: 'SWORD',   size: 2, signed: true,  float: false },
  ULONG:   { name: 'ULONG',   size: 4, signed: false, float: false },
  SLONG:   { name: 'SLONG',   size: 4, signed: true,  float: false },
  FLOAT32_IEEE: { name: 'FLOAT32_IEEE', size: 4, signed: true, float: true },
  FLOAT64_IEEE: { name: 'FLOAT64_IEEE', size: 8, signed: true, float: true },
  A_UINT64: { name: 'A_UINT64', size: 8, signed: false, float: false },
  A_INT64:  { name: 'A_INT64',  size: 8, signed: true,  float: false },
};

export interface CompuMethod {
  name: string;
  type: 'IDENTICAL' | 'RAT_FUNC' | 'TAB_INTP' | 'TAB_VERB' | 'LINEAR' | 'FORM' | string;
  unit: string;
  format: string;
  // RAT_FUNC: physical = (a*raw^2 + b*raw + c) / (d*raw^2 + e*raw + f)
  // Typically simplified: physical = (b*raw + c) / (e*raw + f)
  coefficients?: number[]; // [a, b, c, d, e, f]
  // TAB_INTP: lookup table
  tabRef?: string;
  tabValues?: { raw: number; phys: number }[];
  // FORM: formula string
  formula?: string;
}

export interface RecordLayout {
  name: string;
  fncValuesType?: string;      // data type for function values
  fncValuesLayout?: string;    // COLUMN_DIR or ROW_DIR
  axisXType?: string;
  axisYType?: string;
  noAxisX?: number;            // for FIX_AXIS
  noAxisY?: number;
  isStatic?: boolean;
}

export interface AxisPts {
  name: string;
  description: string;
  address: number;
  recordLayout: string;
  maxDiff: number;
  compuMethod: string;
  maxAxisPoints: number;
  lowerLimit: number;
  upperLimit: number;
}

export interface AxisDescriptor {
  type: 'COM_AXIS' | 'FIX_AXIS' | 'STD_AXIS' | 'RES_AXIS' | 'CURVE_AXIS' | string;
  inputQuantity: string;
  compuMethod: string;
  maxAxisPoints: number;
  lowerLimit: number;
  upperLimit: number;
  axisPtsRef?: string;         // for COM_AXIS
  fixAxisPar?: { offset: number; shift: number; count: number }; // for FIX_AXIS
}

export interface CalibrationMap {
  name: string;
  description: string;
  type: 'VALUE' | 'CURVE' | 'MAP' | 'VAL_BLK' | 'ASCII' | 'CUBOID' | string;
  address: number;
  recordLayout: string;
  compuMethod: string;
  lowerLimit: number;
  upperLimit: number;
  annotations: string[];
  axes: AxisDescriptor[];
  // Resolved data (after binary read)
  rawValues?: number[];
  physValues?: number[];
  axisXValues?: number[];
  axisYValues?: number[];
  rows?: number;
  cols?: number;
  // Edit state
  modified?: boolean;
  modifiedValues?: number[];   // modified raw values
  // Category for tree organization
  category?: string;
  subcategory?: string;
}

export interface Measurement {
  name: string;
  description: string;
  dataType: string;
  compuMethod: string;
  resolution: number;
  accuracy: number;
  lowerLimit: number;
  upperLimit: number;
  ecuAddress?: number;
  bitMask?: number;
  unit?: string;
  annotations: string[];
}

export interface EcuDefinition {
  source: 'a2l' | 'csv';
  fileName: string;
  ecuFamily: string;
  moduleInfo: {
    name: string;
    comment: string;
    cpuType?: string;
    epromId?: string;
    byteOrder?: 'MSB_FIRST' | 'MSB_LAST';
  };
  maps: CalibrationMap[];
  measurements: Measurement[];
  compuMethods: Map<string, CompuMethod>;
  recordLayouts: Map<string, RecordLayout>;
  axisPts: Map<string, AxisPts>;
  parseTime: number;
  errors: string[];
  stats: {
    totalMaps: number;
    totalMeasurements: number;
    mapsByType: Record<string, number>;
  };
}

// ─── A2L Block Extraction ────────────────────────────────────────────────────

/**
 * Extract all /begin BLOCK_TYPE ... /end BLOCK_TYPE blocks.
 * Handles nested blocks correctly by tracking depth.
 */
function extractBlocksDeep(content: string, blockType: string): { name: string; body: string; startIdx: number }[] {
  const results: { name: string; body: string; startIdx: number }[] = [];
  const beginPattern = `/begin ${blockType}`;
  const endPattern = `/end ${blockType}`;
  let searchFrom = 0;

  while (searchFrom < content.length) {
    const beginIdx = content.indexOf(beginPattern, searchFrom);
    if (beginIdx === -1) break;

    const afterBegin = beginIdx + beginPattern.length;
    // Find the block name (first non-whitespace token after /begin TYPE)
    const nameMatch = content.substring(afterBegin, afterBegin + 500).match(/^\s+(\S+)/);
    if (!nameMatch) {
      searchFrom = afterBegin;
      continue;
    }
    const name = nameMatch[1];
    const bodyStart = afterBegin + nameMatch[0].length;

    // Find matching /end, accounting for nested blocks of the same type
    let depth = 1;
    let pos = bodyStart;
    while (depth > 0 && pos < content.length) {
      const nextBegin = content.indexOf(beginPattern, pos);
      const nextEnd = content.indexOf(endPattern, pos);

      if (nextEnd === -1) break; // malformed

      if (nextBegin !== -1 && nextBegin < nextEnd) {
        depth++;
        pos = nextBegin + beginPattern.length;
      } else {
        depth--;
        if (depth === 0) {
          results.push({
            name,
            body: content.substring(bodyStart, nextEnd),
            startIdx: beginIdx,
          });
        }
        pos = nextEnd + endPattern.length;
      }
    }
    searchFrom = pos;
  }

  return results;
}

// ─── COMPU_METHOD Parser ─────────────────────────────────────────────────────

function parseCompuMethods(content: string): Map<string, CompuMethod> {
  const methods = new Map<string, CompuMethod>();
  const blocks = extractBlocksDeep(content, 'COMPU_METHOD');

  for (const { name, body } of blocks) {
    const lines = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('//'));
    const firstLine = lines.join(' ');

    // Parse: "long identifier" TYPE FORMAT "UNIT"
    const match = firstLine.match(/^"([^"]*)"?\s+(\S+)\s+"([^"]*)"\s+"([^"]*)"/);
    if (!match) {
      // Try without quotes on identifier
      const match2 = firstLine.match(/^\s*(\S+)\s+"([^"]*)"\s+"([^"]*)"/);
      if (match2) {
        const cm: CompuMethod = {
          name,
          type: match2[1],
          format: match2[2],
          unit: match2[3],
        };
        parseCompuMethodBody(cm, body);
        methods.set(name, cm);
      }
      continue;
    }

    const cm: CompuMethod = {
      name,
      type: match[2],
      format: match[3],
      unit: match[4],
    };
    parseCompuMethodBody(cm, body);
    methods.set(name, cm);
  }

  return methods;
}

function parseCompuMethodBody(cm: CompuMethod, body: string): void {
  // COEFFS a b c d e f
  const coeffMatch = body.match(/COEFFS\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)\s+([\d.\-eE+]+)/i);
  if (coeffMatch) {
    cm.coefficients = coeffMatch.slice(1, 7).map(Number);
  }

  // COMPU_TAB_REF
  const tabRefMatch = body.match(/COMPU_TAB_REF\s+(\S+)/i);
  if (tabRefMatch) {
    cm.tabRef = tabRefMatch[1];
  }

  // FORMULA
  const formulaMatch = body.match(/FORMULA\s+"([^"]+)"/i);
  if (formulaMatch) {
    cm.formula = formulaMatch[1];
  }
}

// ─── RECORD_LAYOUT Parser ────────────────────────────────────────────────────

function parseRecordLayouts(content: string): Map<string, RecordLayout> {
  const layouts = new Map<string, RecordLayout>();
  const blocks = extractBlocksDeep(content, 'RECORD_LAYOUT');

  for (const { name, body } of blocks) {
    const rl: RecordLayout = { name };

    // FNC_VALUES position dataType layout direction
    const fncMatch = body.match(/FNC_VALUES\s+\d+\s+(\S+)\s+(\S+)\s+(\S+)/i);
    if (fncMatch) {
      rl.fncValuesType = fncMatch[1];
      rl.fncValuesLayout = fncMatch[2];
    }

    // AXIS_PTS_X position dataType ...
    const axisXMatch = body.match(/AXIS_PTS_X\s+\d+\s+(\S+)/i);
    if (axisXMatch) rl.axisXType = axisXMatch[1];

    // AXIS_PTS_Y position dataType ...
    const axisYMatch = body.match(/AXIS_PTS_Y\s+\d+\s+(\S+)/i);
    if (axisYMatch) rl.axisYType = axisYMatch[1];

    // NO_AXIS_PTS_X
    const noXMatch = body.match(/NO_AXIS_PTS_X\s+\d+\s+(\S+)/i);
    if (noXMatch) rl.noAxisX = parseInt(noXMatch[1]) || 0;

    // NO_AXIS_PTS_Y
    const noYMatch = body.match(/NO_AXIS_PTS_Y\s+\d+\s+(\S+)/i);
    if (noYMatch) rl.noAxisY = parseInt(noYMatch[1]) || 0;

    // STATIC_RECORD_LAYOUT
    if (body.includes('STATIC_RECORD_LAYOUT')) rl.isStatic = true;

    layouts.set(name, rl);
  }

  return layouts;
}

// ─── AXIS_PTS Parser ─────────────────────────────────────────────────────────

function parseAxisPts(content: string): Map<string, AxisPts> {
  const axisMap = new Map<string, AxisPts>();
  const blocks = extractBlocksDeep(content, 'AXIS_PTS');

  for (const { name, body } of blocks) {
    const firstLine = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ');
    const quotedMatch = firstLine.match(/^"([^"]*)"([\s\S]*)$/);

    let desc = '';
    let rest = firstLine;
    if (quotedMatch) {
      desc = quotedMatch[1];
      rest = quotedMatch[2].trim();
    }

    const tokens = rest.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('/'));

    const address = parseInt(tokens[0], 16) || parseInt(tokens[0]) || 0;
    axisMap.set(name, {
      name,
      description: desc,
      address,
      recordLayout: tokens[1] || '',
      maxDiff: parseFloat(tokens[2]) || 0,
      compuMethod: tokens[3] || 'NO_COMPU_METHOD',
      maxAxisPoints: parseInt(tokens[4]) || 0,
      lowerLimit: parseFloat(tokens[5]) || 0,
      upperLimit: parseFloat(tokens[6]) || 0,
    });
  }

  return axisMap;
}

// ─── CHARACTERISTIC Parser (Enhanced for Editor) ─────────────────────────────

function parseCharacteristics(content: string): CalibrationMap[] {
  const maps: CalibrationMap[] = [];
  const blocks = extractBlocksDeep(content, 'CHARACTERISTIC');

  for (const { name, body } of blocks) {
    const map = parseOneCharacteristic(name, body);
    if (map) maps.push(map);
  }

  return maps;
}

function parseOneCharacteristic(name: string, body: string): CalibrationMap | null {
  try {
    const lines = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const firstLine = lines.join(' ');

    // Extract long identifier (quoted string)
    const quotedMatch = firstLine.match(/^"([^"]*)"([\s\S]*)$/) ||
                        firstLine.match(/^"((?:[^"\\]|\\.)*)"\s*([\s\S]*)$/);
    let desc = '';
    let rest = firstLine;
    if (quotedMatch) {
      desc = quotedMatch[1];
      rest = quotedMatch[2].trim();
    }

    // Tokenize remaining: TYPE ADDRESS RECORD_LAYOUT MAX_DIFF COMPU_METHOD LOWER UPPER
    const tokens = rest.split(/\s+/).filter(t =>
      t.length > 0 && !t.startsWith('/') && !t.startsWith('"')
    );

    const type = tokens[0] || 'VALUE';
    const addressStr = tokens[1] || '0x0';
    const address = addressStr.startsWith('0x') || addressStr.startsWith('0X')
      ? parseInt(addressStr, 16)
      : parseInt(addressStr) || 0;

    const map: CalibrationMap = {
      name,
      description: desc,
      type: type as CalibrationMap['type'],
      address,
      recordLayout: tokens[2] || '',
      compuMethod: tokens[4] || tokens[3] || 'NO_COMPU_METHOD',
      lowerLimit: parseFloat(tokens[5]) || parseFloat(tokens[4]) || 0,
      upperLimit: parseFloat(tokens[6]) || parseFloat(tokens[5]) || 0,
      annotations: [],
      axes: [],
    };

    // Fix: if recordLayout looks like a number, shift tokens
    if (map.recordLayout && !isNaN(Number(map.recordLayout))) {
      map.compuMethod = tokens[3] || 'NO_COMPU_METHOD';
      map.lowerLimit = parseFloat(tokens[4]) || 0;
      map.upperLimit = parseFloat(tokens[5]) || 0;
    }

    // Parse AXIS_DESCR blocks
    const axisBlocks = extractBlocksDeep(body, 'AXIS_DESCR');
    for (const ab of axisBlocks) {
      const axisTokens = ab.body.trim().split(/\s+/).filter(t => t.length > 0 && !t.startsWith('/'));
      const axisType = ab.name; // COM_AXIS, FIX_AXIS, STD_AXIS, etc.

      const axis: AxisDescriptor = {
        type: axisType,
        inputQuantity: axisTokens[0] || '',
        compuMethod: axisTokens[1] || '',
        maxAxisPoints: parseInt(axisTokens[2]) || 0,
        lowerLimit: parseFloat(axisTokens[3]) || 0,
        upperLimit: parseFloat(axisTokens[4]) || 0,
      };

      // AXIS_PTS_REF for COM_AXIS
      const refMatch = ab.body.match(/AXIS_PTS_REF\s+(\S+)/i);
      if (refMatch) axis.axisPtsRef = refMatch[1];

      // FIX_AXIS_PAR offset shift count
      const fixMatch = ab.body.match(/FIX_AXIS_PAR\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/i);
      if (fixMatch) {
        axis.fixAxisPar = {
          offset: parseFloat(fixMatch[1]),
          shift: parseFloat(fixMatch[2]),
          count: parseInt(fixMatch[3]),
        };
      }

      map.axes.push(axis);
    }

    // Parse annotations
    const annotRegex = /ANNOTATION_TEXT[\s\S]*?"([^"]+)"/gi;
    let annotMatch;
    while ((annotMatch = annotRegex.exec(body)) !== null) {
      map.annotations.push(annotMatch[1].trim());
    }

    // Also try multi-line annotation text blocks
    const annotBlockRegex = /\/begin\s+ANNOTATION_TEXT\s*([\s\S]*?)\/end\s+ANNOTATION_TEXT/gi;
    let annotBlockMatch;
    while ((annotBlockMatch = annotBlockRegex.exec(body)) !== null) {
      const text = annotBlockMatch[1]
        .split('\n')
        .map(l => l.trim().replace(/^"/, '').replace(/"$/, ''))
        .filter(l => l.length > 0)
        .join(' ');
      if (text && !map.annotations.includes(text)) {
        map.annotations.push(text);
      }
    }

    // Categorize by name prefix
    categorizeMap(map);

    return map;
  } catch {
    return null;
  }
}

// ─── MEASUREMENT Parser (Enhanced) ───────────────────────────────────────────

function parseMeasurements(content: string): Measurement[] {
  const measurements: Measurement[] = [];
  const blocks = extractBlocksDeep(content, 'MEASUREMENT');

  for (const { name, body } of blocks) {
    const m = parseOneMeasurement(name, body);
    if (m) measurements.push(m);
  }

  return measurements;
}

function parseOneMeasurement(name: string, body: string): Measurement | null {
  try {
    const firstLine = body.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ');
    const quotedMatch = firstLine.match(/^"([^"]*)"([\s\S]*)$/);

    let desc = '';
    let rest = firstLine;
    if (quotedMatch) {
      desc = quotedMatch[1];
      rest = quotedMatch[2].trim();
    }

    const tokens = rest.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('/'));

    const m: Measurement = {
      name,
      description: desc,
      dataType: tokens[0] || 'UBYTE',
      compuMethod: tokens[1] || 'NO_COMPU_METHOD',
      resolution: parseFloat(tokens[2]) || 0,
      accuracy: parseFloat(tokens[3]) || 0,
      lowerLimit: parseFloat(tokens[4]) || 0,
      upperLimit: parseFloat(tokens[5]) || 0,
      annotations: [],
    };

    // ECU_ADDRESS
    const addrMatch = body.match(/ECU_ADDRESS\s+(0x[0-9A-Fa-f]+|\d+)/i);
    if (addrMatch) {
      m.ecuAddress = addrMatch[1].startsWith('0x')
        ? parseInt(addrMatch[1], 16)
        : parseInt(addrMatch[1]);
    }

    // BIT_MASK
    const maskMatch = body.match(/BIT_MASK\s+(0x[0-9A-Fa-f]+|\d+)/i);
    if (maskMatch) {
      m.bitMask = maskMatch[1].startsWith('0x')
        ? parseInt(maskMatch[1], 16)
        : parseInt(maskMatch[1]);
    }

    // Annotations
    const annotRegex = /ANNOTATION_TEXT[\s\S]*?"([^"]+)"/gi;
    let annotMatch;
    while ((annotMatch = annotRegex.exec(body)) !== null) {
      m.annotations.push(annotMatch[1].trim());
    }

    return m;
  } catch {
    return null;
  }
}

// ─── Map Categorization ──────────────────────────────────────────────────────

const CATEGORY_PREFIXES: [RegExp, string, string][] = [
  // GM-style prefixes
  [/^Ka?DFIR/i, 'Fuel System', 'Direct Fuel Injection Rail'],
  [/^Ka?DFIC/i, 'Fuel System', 'Direct Fuel Injection Control'],
  [/^Ka?DFIT/i, 'Fuel System', 'Direct Fuel Injection Timing'],
  [/^Ka?FUEL/i, 'Fuel System', 'Fuel Control'],
  [/^Ka?FRP/i, 'Fuel System', 'Fuel Rail Pressure'],
  [/^Ka?INJ/i, 'Fuel System', 'Injector'],
  [/^Ka?BSTC/i, 'Boost Control', 'Boost Control'],
  [/^Ka?VGT/i, 'Boost Control', 'Variable Geometry Turbo'],
  [/^Ka?WGDC/i, 'Boost Control', 'Wastegate Duty Cycle'],
  [/^Ka?TQMN/i, 'Torque Management', 'Torque Management'],
  [/^Ka?TQM/i, 'Torque Management', 'Torque Management'],
  [/^Ka?TORQ/i, 'Torque Management', 'Torque'],
  [/^Ka?EGRC/i, 'Emissions', 'EGR Control'],
  [/^Ka?DPF/i, 'Emissions', 'DPF/Regen'],
  [/^Ka?SCR/i, 'Emissions', 'SCR/DEF'],
  [/^Ka?NOX/i, 'Emissions', 'NOx'],
  [/^Ka?EGT/i, 'Exhaust', 'Exhaust Gas Temperature'],
  [/^Ka?EXHT/i, 'Exhaust', 'Exhaust'],
  [/^Ka?COOL/i, 'Cooling', 'Coolant'],
  [/^Ka?OILT/i, 'Cooling', 'Oil Temperature'],
  [/^Ka?IDLE/i, 'Idle Control', 'Idle'],
  [/^Ka?STRT/i, 'Starting', 'Start/Crank'],
  [/^Ka?DIAG/i, 'Diagnostics', 'Diagnostic'],
  [/^Ka?DTC/i, 'Diagnostics', 'DTC'],
  [/^Ka?MPRD/i, 'Diagnostics', 'Monitor'],
  [/^Ka?MPMR/i, 'Diagnostics', 'Monitor Present'],
  [/^Ka?TCCM/i, 'Transmission', 'TCC Management'],
  [/^Ka?TRNS/i, 'Transmission', 'Transmission'],
  [/^Ka?SHFT/i, 'Transmission', 'Shift'],
  [/^Ka?GEAR/i, 'Transmission', 'Gear'],
  [/^Ka?SPKR/i, 'Ignition', 'Spark'],
  [/^Ka?IGNC/i, 'Ignition', 'Ignition Control'],
  [/^Ka?KNCK/i, 'Ignition', 'Knock Control'],
  [/^Ka?THRT/i, 'Throttle', 'Throttle'],
  [/^Ka?ETCS/i, 'Throttle', 'Electronic Throttle'],
  [/^Ka?CRNK/i, 'Engine', 'Crank'],
  [/^Ka?ENGN/i, 'Engine', 'Engine'],
  [/^Ka?LMDA/i, 'Fuel System', 'Lambda'],
  [/^Ka?MAF/i, 'Airflow', 'Mass Airflow'],
  [/^Ka?MAP/i, 'Airflow', 'Manifold Pressure'],
  [/^Ka?BARO/i, 'Airflow', 'Barometric'],
  [/^Ka?ACCS/i, 'Accessories', 'Accessories'],
  [/^Ka?CLIM/i, 'Accessories', 'Climate'],
  [/^Ka?FANS/i, 'Cooling', 'Fan Control'],
  [/^Ka?LIMP/i, 'Protection', 'Limp Mode'],
  [/^Ka?PROT/i, 'Protection', 'Protection'],
  [/^Ka?RVLM/i, 'Protection', 'Rev Limiter'],
  [/^Ka?SPD/i, 'Speed', 'Speed'],
  [/^Ka?VSPD/i, 'Speed', 'Vehicle Speed'],
  // Bosch/Can-Am style prefixes
  [/^AirPah/i, 'Airflow', 'Air Path'],
  [/^Bst/i, 'Boost Control', 'Boost'],
  [/^CoEng/i, 'Engine', 'Engine Coordination'],
  [/^CrkAng/i, 'Engine', 'Crank Angle'],
  [/^Epm/i, 'Engine', 'Engine Position'],
  [/^InjCrv/i, 'Fuel System', 'Injection Curve'],
  [/^InjCtl/i, 'Fuel System', 'Injection Control'],
  [/^FuSys/i, 'Fuel System', 'Fuel System'],
  [/^Ful/i, 'Fuel System', 'Fuel'],
  [/^Ign/i, 'Ignition', 'Ignition'],
  [/^Knk/i, 'Ignition', 'Knock'],
  [/^Lam/i, 'Fuel System', 'Lambda'],
  [/^MoF/i, 'Torque Management', 'Torque'],
  [/^TqLim/i, 'Torque Management', 'Torque Limiter'],
  [/^TqSys/i, 'Torque Management', 'Torque System'],
  [/^Thr/i, 'Throttle', 'Throttle'],
  [/^Exh/i, 'Exhaust', 'Exhaust'],
  [/^Cat/i, 'Emissions', 'Catalyst'],
  [/^Dsm/i, 'Diagnostics', 'Diagnostic'],
  [/^Dem/i, 'Diagnostics', 'DEM'],
  [/^Fid/i, 'Diagnostics', 'Fault ID'],
  [/^Can_/i, 'Communication', 'CAN Bus'],
  [/^Com_/i, 'Communication', 'Communication'],
  [/^Veh/i, 'Vehicle', 'Vehicle'],
  [/^Trns/i, 'Transmission', 'Transmission'],
  // Cummins style
  [/^P_/i, 'Calibration', 'Parameter'],
  [/^T_/i, 'Calibration', 'Table'],
  [/^CFTR/i, 'Diagnostics', 'Fault'],
];

function categorizeMap(map: CalibrationMap): void {
  for (const [regex, category, subcategory] of CATEGORY_PREFIXES) {
    if (regex.test(map.name)) {
      map.category = category;
      map.subcategory = subcategory;
      return;
    }
  }
  map.category = 'Other';
  map.subcategory = 'Uncategorized';
}

// ─── Module Info Parser ──────────────────────────────────────────────────────

function parseModuleInfo(content: string): EcuDefinition['moduleInfo'] {
  const info: EcuDefinition['moduleInfo'] = { name: '', comment: '' };

  const moduleBlocks = extractBlocksDeep(content, 'MODULE');
  if (moduleBlocks.length > 0) {
    info.name = moduleBlocks[0].name;
    const commentMatch = moduleBlocks[0].body.match(/^"([^"]*)"/);
    if (commentMatch) info.comment = commentMatch[1];
  }

  // CPU_TYPE
  const cpuMatch = content.match(/CPU_TYPE\s+"([^"]+)"/i);
  if (cpuMatch) info.cpuType = cpuMatch[1];

  // EPK
  const epkMatch = content.match(/EPK\s+"([^"]+)"/i);
  if (epkMatch) info.epromId = epkMatch[1];

  // BYTE_ORDER
  if (content.includes('MSB_FIRST') || content.includes('BYTE_ORDER_MSB_FIRST')) {
    info.byteOrder = 'MSB_FIRST';
  } else if (content.includes('MSB_LAST') || content.includes('BYTE_ORDER_MSB_LAST')) {
    info.byteOrder = 'MSB_LAST';
  }

  return info;
}

// ─── ECU Family Detection ────────────────────────────────────────────────────

export function detectEcuFamily(content: string, fileName: string): string {
  const upper = fileName.toUpperCase();

  // GM E-series from filename
  const eMatch = upper.match(/\b(E\d{2})\b/);
  if (eMatch) return eMatch[1];

  // L5P from filename
  if (upper.includes('L5P')) return 'E41';

  // T93 from filename
  if (upper.includes('T93')) return 'T93';

  // MG1C from content or filename
  if (upper.includes('MG1C') || content.includes('MG1C')) return 'MG1C';

  // Cummins from filename
  if (upper.includes('CUMMINS') || upper.includes('68RFE')) return 'CUMMINS';

  // Try to detect from A2L content
  if (content.includes('MDG1C') || content.includes('MG1CA920')) return 'MG1C';
  if (content.includes('E41') || content.includes('L5P')) return 'E41';

  // Check for GM-style module info
  const epkMatch = content.match(/EPK\s+"([^"]+)"/i);
  if (epkMatch) {
    const epk = epkMatch[1].toUpperCase();
    if (epk.includes('E41')) return 'E41';
    if (epk.includes('E46')) return 'E46';
    if (epk.includes('E90')) return 'E90';
    if (epk.includes('T93')) return 'T93';
  }

  return 'UNKNOWN';
}

// ─── Main A2L Parser ─────────────────────────────────────────────────────────

export function parseA2LForEditor(content: string, fileName: string): EcuDefinition {
  const startTime = performance.now();
  const errors: string[] = [];

  const ecuFamily = detectEcuFamily(content, fileName);
  const moduleInfo = parseModuleInfo(content);
  const compuMethods = parseCompuMethods(content);
  const recordLayouts = parseRecordLayouts(content);
  const axisPtsMap = parseAxisPts(content);
  const maps = parseCharacteristics(content);
  const measurements = parseMeasurements(content);

  // Count map types
  const mapsByType: Record<string, number> = {};
  for (const m of maps) {
    mapsByType[m.type] = (mapsByType[m.type] || 0) + 1;
  }

  return {
    source: 'a2l',
    fileName,
    ecuFamily,
    moduleInfo,
    maps,
    measurements,
    compuMethods,
    recordLayouts,
    axisPts: axisPtsMap,
    parseTime: performance.now() - startTime,
    errors,
    stats: {
      totalMaps: maps.length,
      totalMeasurements: measurements.length,
      mapsByType,
    },
  };
}

// ─── Cummins CSV Parser ──────────────────────────────────────────────────────

export function parseCumminsCSV(csvContent: string, fileName: string): EcuDefinition {
  const startTime = performance.now();
  const errors: string[] = [];
  const maps: CalibrationMap[] = [];
  const compuMethods = new Map<string, CompuMethod>();
  const recordLayouts = new Map<string, RecordLayout>();

  // Add default IDENTICAL compu method
  compuMethods.set('IDENTICAL', {
    name: 'IDENTICAL',
    type: 'IDENTICAL',
    unit: '',
    format: '%8.3',
  });

  const lines = csvContent.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    errors.push('CSV file has no data rows');
    return {
      source: 'csv',
      fileName,
      ecuFamily: detectEcuFamily(csvContent, fileName),
      moduleInfo: { name: 'Cummins', comment: fileName },
      maps,
      measurements: [],
      compuMethods,
      recordLayouts,
      axisPts: new Map(),
      parseTime: performance.now() - startTime,
      errors,
      stats: { totalMaps: 0, totalMeasurements: 0, mapsByType: {} },
    };
  }

  // Parse header
  const header = lines[0].split(';').map(h => h.trim());
  const nameIdx = header.indexOf('Name');
  const addrIdx = header.indexOf('Address');
  const sizeIdx = header.indexOf('Size');
  const valuesIdx = header.indexOf('Fieldvalues.Values');
  const axisXIdx = header.indexOf('AxisX.Values');
  const axisYIdx = header.indexOf('AxisY.Values');
  const commentIdx = header.indexOf('Comment');

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const name = cols[nameIdx]?.trim();
    if (!name) continue;

    const addressStr = cols[addrIdx]?.trim() || '0';
    const address = addressStr.startsWith('$')
      ? parseInt(addressStr.substring(1), 16)
      : parseInt(addressStr, 16) || parseInt(addressStr) || 0;

    const sizeStr = cols[sizeIdx]?.trim() || '1x1';
    const sizeMatch = sizeStr.match(/(\d+)x(\d+)/);
    const cols_count = sizeMatch ? parseInt(sizeMatch[1]) : 1;
    const rows_count = sizeMatch ? parseInt(sizeMatch[2]) : 1;

    const valuesStr = cols[valuesIdx]?.trim() || '';
    const rawValues = valuesStr.split(/\s+/).filter(v => v.length > 0).map(Number);

    const axisXStr = cols[axisXIdx]?.trim() || '';
    const axisXValues = axisXStr.split(/\s+/).filter(v => v.length > 0).map(Number);

    const axisYStr = cols[axisYIdx]?.trim() || '';
    const axisYValues = axisYStr.split(/\s+/).filter(v => v.length > 0).map(Number);

    const comment = cols[commentIdx]?.trim() || '';

    let type: CalibrationMap['type'] = 'VALUE';
    const axes: AxisDescriptor[] = [];

    if (rows_count > 1 && cols_count > 1) {
      type = 'MAP';
      axes.push({
        type: 'STD_AXIS',
        inputQuantity: 'X',
        compuMethod: 'IDENTICAL',
        maxAxisPoints: cols_count,
        lowerLimit: 0,
        upperLimit: 65535,
      });
      axes.push({
        type: 'STD_AXIS',
        inputQuantity: 'Y',
        compuMethod: 'IDENTICAL',
        maxAxisPoints: rows_count,
        lowerLimit: 0,
        upperLimit: 65535,
      });
    } else if (cols_count > 1 || rows_count > 1) {
      type = 'CURVE';
      axes.push({
        type: 'STD_AXIS',
        inputQuantity: 'X',
        compuMethod: 'IDENTICAL',
        maxAxisPoints: Math.max(cols_count, rows_count),
        lowerLimit: 0,
        upperLimit: 65535,
      });
    }

    const map: CalibrationMap = {
      name,
      description: comment,
      type,
      address,
      recordLayout: 'CSV_FLOAT',
      compuMethod: 'IDENTICAL',
      lowerLimit: -999999,
      upperLimit: 999999,
      annotations: comment ? [comment] : [],
      axes,
      rawValues,
      physValues: rawValues, // CSV values are already physical
      axisXValues: axisXValues.length > 0 ? axisXValues : undefined,
      axisYValues: axisYValues.length > 0 ? axisYValues : undefined,
      rows: rows_count,
      cols: cols_count,
    };

    categorizeMap(map);
    maps.push(map);
  }

  const mapsByType: Record<string, number> = {};
  for (const m of maps) {
    mapsByType[m.type] = (mapsByType[m.type] || 0) + 1;
  }

  return {
    source: 'csv',
    fileName,
    ecuFamily: detectEcuFamily(csvContent, fileName),
    moduleInfo: { name: 'Cummins', comment: fileName },
    maps,
    measurements: [],
    compuMethods,
    recordLayouts,
    axisPts: new Map(),
    parseTime: performance.now() - startTime,
    errors,
    stats: {
      totalMaps: maps.length,
      totalMeasurements: 0,
      mapsByType,
    },
  };
}

// ─── Binary Format Readers ───────────────────────────────────────────────────

/**
 * Parse Motorola S-Record (.ptp, .srec, .s19, .s28, .s37) into flat binary.
 * Returns { data, baseAddress } where baseAddress is the lowest address found.
 */
export function parseSRecord(content: string): { data: Uint8Array; baseAddress: number } | null {
  const lines = content.split('\n').filter(l => l.trim().startsWith('S'));
  if (lines.length === 0) return null;

  let minAddr = Infinity;
  let maxAddr = 0;
  const records: { address: number; bytes: number[] }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 4) continue;

    const recType = trimmed.substring(0, 2);
    const byteCount = parseInt(trimmed.substring(2, 4), 16);
    if (isNaN(byteCount)) continue;

    let addrLen = 0;
    switch (recType) {
      case 'S1': addrLen = 2; break; // 16-bit address
      case 'S2': addrLen = 3; break; // 24-bit address
      case 'S3': addrLen = 4; break; // 32-bit address
      default: continue; // S0 (header), S5 (count), S7/S8/S9 (terminator) — skip
    }

    const addrStr = trimmed.substring(4, 4 + addrLen * 2);
    const address = parseInt(addrStr, 16);
    if (isNaN(address)) continue;

    // Data bytes start after address, end before checksum (last byte)
    const dataStart = 4 + addrLen * 2;
    const dataEnd = 2 + byteCount * 2; // byteCount includes address + data + checksum
    const dataHex = trimmed.substring(dataStart, dataEnd);

    const bytes: number[] = [];
    for (let i = 0; i < dataHex.length - 2; i += 2) { // -2 to exclude checksum
      bytes.push(parseInt(dataHex.substring(i, i + 2), 16));
    }

    if (bytes.length > 0) {
      records.push({ address, bytes });
      minAddr = Math.min(minAddr, address);
      maxAddr = Math.max(maxAddr, address + bytes.length);
    }
  }

  if (records.length === 0) return null;

  const totalSize = maxAddr - minAddr;
  const data = new Uint8Array(totalSize);
  data.fill(0xFF); // Fill with 0xFF (erased flash default)

  for (const rec of records) {
    const offset = rec.address - minAddr;
    for (let i = 0; i < rec.bytes.length; i++) {
      data[offset + i] = rec.bytes[i];
    }
  }

  return { data, baseAddress: minAddr };
}

/**
 * Parse Intel HEX (.hex, .ihex) into flat binary.
 */
export function parseIntelHex(content: string): { data: Uint8Array; baseAddress: number } | null {
  const lines = content.split('\n').filter(l => l.trim().startsWith(':'));
  if (lines.length === 0) return null;

  let extendedAddress = 0;
  let minAddr = Infinity;
  let maxAddr = 0;
  const records: { address: number; bytes: number[] }[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 11) continue;

    const byteCount = parseInt(trimmed.substring(1, 3), 16);
    const address = parseInt(trimmed.substring(3, 7), 16);
    const recType = parseInt(trimmed.substring(7, 9), 16);

    switch (recType) {
      case 0x00: { // Data record
        const fullAddr = extendedAddress + address;
        const bytes: number[] = [];
        for (let i = 0; i < byteCount; i++) {
          bytes.push(parseInt(trimmed.substring(9 + i * 2, 11 + i * 2), 16));
        }
        if (bytes.length > 0) {
          records.push({ address: fullAddr, bytes });
          minAddr = Math.min(minAddr, fullAddr);
          maxAddr = Math.max(maxAddr, fullAddr + bytes.length);
        }
        break;
      }
      case 0x02: { // Extended segment address
        extendedAddress = parseInt(trimmed.substring(9, 13), 16) << 4;
        break;
      }
      case 0x04: { // Extended linear address
        extendedAddress = parseInt(trimmed.substring(9, 13), 16) << 16;
        break;
      }
      case 0x01: // EOF
        break;
    }
  }

  if (records.length === 0) return null;

  const totalSize = maxAddr - minAddr;
  const data = new Uint8Array(totalSize);
  data.fill(0xFF);

  for (const rec of records) {
    const offset = rec.address - minAddr;
    for (let i = 0; i < rec.bytes.length; i++) {
      data[offset + i] = rec.bytes[i];
    }
  }

  return { data, baseAddress: minAddr };
}

/**
 * Detect binary file format and extract raw data.
 */
export function extractBinaryData(
  buffer: ArrayBuffer,
  fileName: string,
  textContent?: string
): { data: Uint8Array; baseAddress: number; format: string } {
  const upper = fileName.toUpperCase();

  // Check if it's a text-based format (S-Record or Intel HEX)
  if (textContent) {
    if (textContent.trimStart().startsWith('S0') || textContent.trimStart().startsWith('S2') || textContent.trimStart().startsWith('S3')) {
      const result = parseSRecord(textContent);
      if (result) return { ...result, format: 'srec' };
    }
    if (textContent.trimStart().startsWith(':')) {
      const result = parseIntelHex(textContent);
      if (result) return { ...result, format: 'ihex' };
    }
  }

  // Check file extension for text formats
  if (upper.endsWith('.PTP') || upper.endsWith('.SREC') || upper.endsWith('.S19') || upper.endsWith('.S28') || upper.endsWith('.S37')) {
    const text = new TextDecoder('ascii').decode(buffer);
    const result = parseSRecord(text);
    if (result) return { ...result, format: 'srec' };
  }

  if (upper.endsWith('.HEX') || upper.endsWith('.IHEX')) {
    const text = new TextDecoder('ascii').decode(buffer);
    const result = parseIntelHex(text);
    if (result) return { ...result, format: 'ihex' };
  }

  // Raw binary
  return {
    data: new Uint8Array(buffer),
    baseAddress: 0,
    format: 'raw',
  };
}

// ─── COMPU_METHOD Value Conversion ───────────────────────────────────────────

/**
 * Convert raw integer/float value to physical (display) value using COMPU_METHOD.
 */
export function rawToPhysical(raw: number, cm: CompuMethod | undefined): number {
  if (!cm || cm.type === 'IDENTICAL') return raw;

  if (cm.type === 'RAT_FUNC' && cm.coefficients) {
    const [a, b, c, d, e, f] = cm.coefficients;
    // ASAP2 RAT_FUNC: physical = (a*raw^2 + b*raw + c) / (d*raw^2 + e*raw + f)
    // But ASAP2 convention is inverted: INT = (a*PHYS^2 + b*PHYS + c) / (d*PHYS^2 + e*PHYS + f)
    // For simple linear: PHYS = (raw * f - c) / (b - raw * d)
    // Most common case: a=0, d=0 → PHYS = (raw * f - c) / b
    if (a === 0 && d === 0) {
      if (b === 0) return raw;
      return (raw * f - c) / b;
    }
    // General case — try simple linear first
    const denom = b - raw * d;
    if (Math.abs(denom) < 1e-15) return raw;
    return (raw * f - c) / denom;
  }

  if (cm.type === 'LINEAR' && cm.coefficients && cm.coefficients.length >= 2) {
    return cm.coefficients[0] * raw + cm.coefficients[1];
  }

  if (cm.type === 'TAB_INTP' && cm.tabValues && cm.tabValues.length > 0) {
    // Linear interpolation in lookup table
    const tab = cm.tabValues;
    if (raw <= tab[0].raw) return tab[0].phys;
    if (raw >= tab[tab.length - 1].raw) return tab[tab.length - 1].phys;
    for (let i = 0; i < tab.length - 1; i++) {
      if (raw >= tab[i].raw && raw <= tab[i + 1].raw) {
        const frac = (raw - tab[i].raw) / (tab[i + 1].raw - tab[i].raw);
        return tab[i].phys + frac * (tab[i + 1].phys - tab[i].phys);
      }
    }
    return raw;
  }

  return raw;
}

/**
 * Convert physical (display) value back to raw integer/float.
 */
export function physicalToRaw(phys: number, cm: CompuMethod | undefined): number {
  if (!cm || cm.type === 'IDENTICAL') return phys;

  if (cm.type === 'RAT_FUNC' && cm.coefficients) {
    const [a, b, c, d, e, f] = cm.coefficients;
    // INT = (a*PHYS^2 + b*PHYS + c) / (d*PHYS^2 + e*PHYS + f)
    if (d === 0 && e === 0) {
      if (f === 0) return phys;
      return (a * phys * phys + b * phys + c) / f;
    }
    const denom = d * phys * phys + e * phys + f;
    if (Math.abs(denom) < 1e-15) return phys;
    return (a * phys * phys + b * phys + c) / denom;
  }

  if (cm.type === 'LINEAR' && cm.coefficients && cm.coefficients.length >= 2) {
    if (cm.coefficients[0] === 0) return phys;
    return (phys - cm.coefficients[1]) / cm.coefficients[0];
  }

  return phys;
}

// ─── Binary Value Reading ────────────────────────────────────────────────────

/**
 * Read a single value from binary data at the given offset.
 */
export function readValue(
  data: Uint8Array,
  offset: number,
  dataType: DataTypeInfo,
  bigEndian: boolean = false
): number {
  if (offset < 0 || offset + dataType.size > data.length) return 0;

  const view = new DataView(data.buffer, data.byteOffset + offset, dataType.size);

  if (dataType.float) {
    if (dataType.size === 4) return view.getFloat32(0, !bigEndian);
    if (dataType.size === 8) return view.getFloat64(0, !bigEndian);
  }

  switch (dataType.size) {
    case 1: return dataType.signed ? view.getInt8(0) : view.getUint8(0);
    case 2: return dataType.signed ? view.getInt16(0, !bigEndian) : view.getUint16(0, !bigEndian);
    case 4: return dataType.signed ? view.getInt32(0, !bigEndian) : view.getUint32(0, !bigEndian);
    default: return 0;
  }
}

/**
 * Write a single value to binary data at the given offset.
 */
export function writeValue(
  data: Uint8Array,
  offset: number,
  value: number,
  dataType: DataTypeInfo,
  bigEndian: boolean = false
): void {
  if (offset < 0 || offset + dataType.size > data.length) return;

  const view = new DataView(data.buffer, data.byteOffset + offset, dataType.size);

  if (dataType.float) {
    if (dataType.size === 4) { view.setFloat32(0, value, !bigEndian); return; }
    if (dataType.size === 8) { view.setFloat64(0, value, !bigEndian); return; }
  }

  switch (dataType.size) {
    case 1: dataType.signed ? view.setInt8(0, value) : view.setUint8(0, value); break;
    case 2: dataType.signed ? view.setInt16(0, value, !bigEndian) : view.setUint16(0, value, !bigEndian); break;
    case 4: dataType.signed ? view.setInt32(0, value, !bigEndian) : view.setUint32(0, value, !bigEndian); break;
  }
}

/**
 * Resolve the data type from a RECORD_LAYOUT name.
 */
export function resolveDataType(layoutName: string, layouts: Map<string, RecordLayout>): DataTypeInfo {
  const layout = layouts.get(layoutName);
  if (layout?.fncValuesType) {
    const dt = DATA_TYPES[layout.fncValuesType];
    if (dt) return dt;
  }

  // Infer from layout name patterns
  const upper = layoutName.toUpperCase();
  if (upper.includes('FLOAT32') || upper.includes('_FL')) return DATA_TYPES.FLOAT32_IEEE;
  if (upper.includes('FLOAT64') || upper.includes('_DB')) return DATA_TYPES.FLOAT64_IEEE;
  if (upper.includes('ULONG') || upper.includes('_UL')) return DATA_TYPES.ULONG;
  if (upper.includes('SLONG') || upper.includes('_SL')) return DATA_TYPES.SLONG;
  if (upper.includes('UWORD') || upper.includes('_UW')) return DATA_TYPES.UWORD;
  if (upper.includes('SWORD') || upper.includes('_SW')) return DATA_TYPES.SWORD;
  if (upper.includes('UBYTE') || upper.includes('_UB')) return DATA_TYPES.UBYTE;
  if (upper.includes('SBYTE') || upper.includes('_SB')) return DATA_TYPES.SBYTE;

  // Default
  return DATA_TYPES.UWORD;
}

// ─── Offset Alignment ────────────────────────────────────────────────────────

export interface AlignmentResult {
  offset: number;          // delta to add to A2L addresses to get binary file offsets
  confidence: number;      // 0-1
  method: string;
  anchors: { a2lAddr: number; binOffset: number; name: string }[];
}

/**
 * Try to align A2L addresses to binary file offsets.
 * Uses known calibration patterns and value matching.
 */
export function alignOffsets(
  ecuDef: EcuDefinition,
  binaryData: Uint8Array,
  binaryBaseAddress: number
): AlignmentResult {
  // Strategy 1: If binary has a base address from S-Record/iHEX, use direct mapping
  if (binaryBaseAddress > 0) {
    return {
      offset: -binaryBaseAddress,
      confidence: 0.9,
      method: 'base_address',
      anchors: [{ a2lAddr: binaryBaseAddress, binOffset: 0, name: 'File base address' }],
    };
  }

  // Strategy 2: Try common offset patterns for known ECU families
  const family = ecuDef.ecuFamily.toUpperCase();
  const knownOffsets: number[] = [];

  if (family === 'MG1C' || family.includes('BOSCH')) {
    // Bosch MG1C: A2L addresses typically 0x94xxxxx, binary starts at 0x00
    // The binary file usually starts at the flash base
    knownOffsets.push(0x94400000, 0x94000000, 0x80000000, 0x60C00000);
  } else if (family === 'E41' || family.includes('L5P')) {
    // GM E41: addresses 0x0006xxxx
    knownOffsets.push(0x00060000, 0x00020000, 0x00000000);
  } else if (family === 'T93') {
    // GM T93: addresses 0x09xxxxxx
    knownOffsets.push(0x09000000, 0x09001000, 0x08000000);
  }

  // Try each known offset and verify by reading a few known values
  const valueMaps = ecuDef.maps.filter(m => m.type === 'VALUE' && m.address > 0);
  const sampleMaps = valueMaps.slice(0, 50);

  for (const baseOffset of knownOffsets) {
    let matches = 0;
    let total = 0;
    const anchors: AlignmentResult['anchors'] = [];

    for (const map of sampleMaps) {
      const binOffset = map.address - baseOffset;
      if (binOffset < 0 || binOffset >= binaryData.length - 4) continue;
      total++;

      // Read the value and check if it's within the map's limits
      const dt = resolveDataType(map.recordLayout, ecuDef.recordLayouts);
      const bigEndian = ecuDef.moduleInfo.byteOrder === 'MSB_FIRST';
      const raw = readValue(binaryData, binOffset, dt, bigEndian);
      const cm = ecuDef.compuMethods.get(map.compuMethod);
      const phys = rawToPhysical(raw, cm);

      if (phys >= map.lowerLimit && phys <= map.upperLimit) {
        matches++;
        if (anchors.length < 5) {
          anchors.push({ a2lAddr: map.address, binOffset, name: map.name });
        }
      }
    }

    if (total > 0 && matches / total > 0.5) {
      return {
        offset: -baseOffset,
        confidence: matches / total,
        method: 'known_offset',
        anchors,
      };
    }
  }

  // Strategy 3: Brute-force search with step alignment
  // Try offsets at 0x1000 boundaries
  const firstMapAddr = ecuDef.maps[0]?.address || 0;
  const searchStart = Math.max(0, firstMapAddr - binaryData.length);
  const searchEnd = firstMapAddr + 0x100000;

  let bestOffset = 0;
  let bestScore = 0;
  let bestAnchors: AlignmentResult['anchors'] = [];

  for (let tryBase = searchStart; tryBase <= searchEnd; tryBase += 0x1000) {
    let matches = 0;
    let total = 0;
    const anchors: AlignmentResult['anchors'] = [];

    for (const map of sampleMaps.slice(0, 20)) {
      const binOffset = map.address - tryBase;
      if (binOffset < 0 || binOffset >= binaryData.length - 4) continue;
      total++;

      const dt = resolveDataType(map.recordLayout, ecuDef.recordLayouts);
      const bigEndian = ecuDef.moduleInfo.byteOrder === 'MSB_FIRST';
      const raw = readValue(binaryData, binOffset, dt, bigEndian);
      const cm = ecuDef.compuMethods.get(map.compuMethod);
      const phys = rawToPhysical(raw, cm);

      if (phys >= map.lowerLimit && phys <= map.upperLimit) {
        matches++;
        if (anchors.length < 5) {
          anchors.push({ a2lAddr: map.address, binOffset, name: map.name });
        }
      }
    }

    if (total > 0) {
      const score = matches / total;
      if (score > bestScore) {
        bestScore = score;
        bestOffset = tryBase;
        bestAnchors = anchors;
      }
    }
  }

  return {
    offset: -bestOffset,
    confidence: bestScore,
    method: bestScore > 0.3 ? 'brute_force' : 'none',
    anchors: bestAnchors,
  };
}

// ─── Map Value Population ────────────────────────────────────────────────────

/**
 * Read all values for a calibration map from binary data.
 */
export function populateMapValues(
  map: CalibrationMap,
  ecuDef: EcuDefinition,
  binaryData: Uint8Array,
  offsetDelta: number
): void {
  const dt = resolveDataType(map.recordLayout, ecuDef.recordLayouts);
  const bigEndian = ecuDef.moduleInfo.byteOrder === 'MSB_FIRST';
  const cm = ecuDef.compuMethods.get(map.compuMethod);

  const binAddr = map.address + offsetDelta;
  if (binAddr < 0 || binAddr >= binaryData.length) return;

  if (map.type === 'VALUE') {
    const raw = readValue(binaryData, binAddr, dt, bigEndian);
    map.rawValues = [raw];
    map.physValues = [rawToPhysical(raw, cm)];
    map.rows = 1;
    map.cols = 1;
  } else if (map.type === 'CURVE') {
    const axis = map.axes[0];
    const count = axis?.maxAxisPoints || 1;

    // Read axis values
    if (axis?.axisPtsRef) {
      const axisPt = ecuDef.axisPts.get(axis.axisPtsRef);
      if (axisPt) {
        const axisDt = resolveDataType(axisPt.recordLayout, ecuDef.recordLayouts);
        const axisAddr = axisPt.address + offsetDelta;
        const axisCm = ecuDef.compuMethods.get(axisPt.compuMethod);
        const axisRaw: number[] = [];
        for (let i = 0; i < count; i++) {
          axisRaw.push(readValue(binaryData, axisAddr + i * axisDt.size, axisDt, bigEndian));
        }
        map.axisXValues = axisRaw.map(v => rawToPhysical(v, axisCm));
      }
    } else if (axis?.fixAxisPar) {
      const { offset: axOff, shift, count: axCount } = axis.fixAxisPar;
      map.axisXValues = [];
      for (let i = 0; i < axCount; i++) {
        map.axisXValues.push(axOff + i * Math.pow(2, shift));
      }
    }

    // Read function values
    const rawValues: number[] = [];
    for (let i = 0; i < count; i++) {
      rawValues.push(readValue(binaryData, binAddr + i * dt.size, dt, bigEndian));
    }
    map.rawValues = rawValues;
    map.physValues = rawValues.map(v => rawToPhysical(v, cm));
    map.rows = 1;
    map.cols = count;
  } else if (map.type === 'MAP') {
    const axisX = map.axes[0];
    const axisY = map.axes[1];
    const xCount = axisX?.maxAxisPoints || 1;
    const yCount = axisY?.maxAxisPoints || 1;

    // Read X axis
    if (axisX?.axisPtsRef) {
      const axisPt = ecuDef.axisPts.get(axisX.axisPtsRef);
      if (axisPt) {
        const axisDt = resolveDataType(axisPt.recordLayout, ecuDef.recordLayouts);
        const axisAddr = axisPt.address + offsetDelta;
        const axisCm = ecuDef.compuMethods.get(axisPt.compuMethod);
        const axisRaw: number[] = [];
        for (let i = 0; i < xCount; i++) {
          axisRaw.push(readValue(binaryData, axisAddr + i * axisDt.size, axisDt, bigEndian));
        }
        map.axisXValues = axisRaw.map(v => rawToPhysical(v, axisCm));
      }
    }

    // Read Y axis
    if (axisY?.axisPtsRef) {
      const axisPt = ecuDef.axisPts.get(axisY.axisPtsRef);
      if (axisPt) {
        const axisDt = resolveDataType(axisPt.recordLayout, ecuDef.recordLayouts);
        const axisAddr = axisPt.address + offsetDelta;
        const axisCm = ecuDef.compuMethods.get(axisPt.compuMethod);
        const axisRaw: number[] = [];
        for (let i = 0; i < yCount; i++) {
          axisRaw.push(readValue(binaryData, axisAddr + i * axisDt.size, axisDt, bigEndian));
        }
        map.axisYValues = axisRaw.map(v => rawToPhysical(v, axisCm));
      }
    }

    // Read function values (row-major: Y rows × X cols)
    const rawValues: number[] = [];
    for (let y = 0; y < yCount; y++) {
      for (let x = 0; x < xCount; x++) {
        const idx = y * xCount + x;
        rawValues.push(readValue(binaryData, binAddr + idx * dt.size, dt, bigEndian));
      }
    }
    map.rawValues = rawValues;
    map.physValues = rawValues.map(v => rawToPhysical(v, cm));
    map.rows = yCount;
    map.cols = xCount;
  } else if (map.type === 'VAL_BLK') {
    // Value block — array of values without axes
    // Try to determine count from record layout or default to small block
    const count = map.axes[0]?.maxAxisPoints || 16;
    const rawValues: number[] = [];
    for (let i = 0; i < count && binAddr + i * dt.size < binaryData.length; i++) {
      rawValues.push(readValue(binaryData, binAddr + i * dt.size, dt, bigEndian));
    }
    map.rawValues = rawValues;
    map.physValues = rawValues.map(v => rawToPhysical(v, cm));
    map.rows = 1;
    map.cols = rawValues.length;
  }
}

// ─── Map Tree Building ───────────────────────────────────────────────────────

export interface MapTreeNode {
  id: string;
  label: string;
  children?: MapTreeNode[];
  mapIndex?: number;       // index into ecuDef.maps
  mapCount?: number;       // total maps in this branch
}

export function buildMapTree(maps: CalibrationMap[]): MapTreeNode[] {
  const categories = new Map<string, Map<string, number[]>>();

  for (let i = 0; i < maps.length; i++) {
    const cat = maps[i].category || 'Other';
    const sub = maps[i].subcategory || 'Uncategorized';

    if (!categories.has(cat)) categories.set(cat, new Map());
    const subs = categories.get(cat)!;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub)!.push(i);
  }

  const tree: MapTreeNode[] = [];

  // Sort categories alphabetically
  const sortedCats = Array.from(categories.keys()).sort();
  for (const cat of sortedCats) {
    const subs = categories.get(cat)!;
    const catNode: MapTreeNode = {
      id: `cat-${cat}`,
      label: cat,
      children: [],
      mapCount: 0,
    };

    const sortedSubs = Array.from(subs.keys()).sort();
    for (const sub of sortedSubs) {
      const indices = subs.get(sub)!;
      const subNode: MapTreeNode = {
        id: `sub-${cat}-${sub}`,
        label: sub,
        children: indices.map(idx => ({
          id: `map-${idx}`,
          label: maps[idx].name,
          mapIndex: idx,
        })),
        mapCount: indices.length,
      };
      catNode.children!.push(subNode);
      catNode.mapCount! += indices.length;
    }

    tree.push(catNode);
  }

  return tree;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export function searchMaps(
  maps: CalibrationMap[],
  query: string
): number[] {
  if (!query.trim()) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  const scored: { idx: number; score: number }[] = [];

  for (let i = 0; i < maps.length; i++) {
    const m = maps[i];
    const text = `${m.name} ${m.description} ${m.annotations.join(' ')} ${m.category} ${m.subcategory}`.toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 1;
      if (m.name.toLowerCase().includes(term)) score += 2; // name match bonus
    }
    // Exact name match bonus
    if (m.name.toLowerCase() === query.toLowerCase()) score += 10;

    if (score > 0) scored.push({ idx: i, score });
  }

  return scored.sort((a, b) => b.score - a.score).map(s => s.idx);
}
