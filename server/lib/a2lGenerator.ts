/**
 * A2L Auto-Generator
 * Generates complete ASAP2 format A2L definition files from discovered calibration maps.
 * Used by the reverse engineering pipeline to create definitions for unknown ECUs.
 */

export interface DiscoveredMap {
  name: string;
  address: number;
  size: number;
  dataType: string;
  dimensions: '1D' | '2D' | '3D';
  xAxisSize?: number;
  yAxisSize?: number;
  description?: string;
  category?: string;
  units?: string;
  minValue?: number;
  maxValue?: number;
  confidence: number;
}

export interface A2LGenerationOptions {
  projectName: string;
  ecuFamily: string;
  version?: string;
  moduleName?: string;
  includeComments?: boolean;
}

export interface A2LValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    characteristicCount: number;
    totalSize: number;
    addressOverlaps: number;
    duplicateNames: number;
  };
}

/**
 * Discover calibration maps in a raw binary by scanning for structured data patterns.
 * Looks for:
 * - Repeating value patterns (lookup tables)
 * - Monotonically increasing/decreasing sequences (axis data)
 * - Structured blocks with consistent data types
 */
export function discoverMapsInBinary(
  binary: Buffer,
  ecuFamily: string,
  options?: { minMapSize?: number; maxMapSize?: number; scanStep?: number }
): DiscoveredMap[] {
  const minMapSize = options?.minMapSize ?? 8;
  const maxMapSize = options?.maxMapSize ?? 65536;
  const scanStep = options?.scanStep ?? 2;
  const discovered: DiscoveredMap[] = [];
  let mapIndex = 0;

  // Strategy 1: Find monotonic sequences (axis breakpoints)
  const axes = findMonotonicSequences(binary, minMapSize, scanStep);

  // Strategy 2: Find structured data blocks (calibration values)
  const dataBlocks = findStructuredDataBlocks(binary, minMapSize, maxMapSize, scanStep);

  // Strategy 3: Find pointer tables (common in Bosch ECUs)
  const pointerTables = findPointerTables(binary, ecuFamily);

  // Combine and deduplicate
  for (const axis of axes) {
    mapIndex++;
    discovered.push({
      name: `AXIS_${ecuFamily}_${mapIndex.toString().padStart(4, '0')}`,
      address: axis.offset,
      size: axis.length * 2,
      dataType: axis.dataWidth === 1 ? 'UBYTE' : axis.dataWidth === 2 ? 'UWORD' : 'ULONG',
      dimensions: '1D',
      xAxisSize: axis.length,
      description: `Discovered axis at 0x${axis.offset.toString(16).toUpperCase()}`,
      category: 'axis',
      confidence: axis.confidence,
    });
  }

  for (const block of dataBlocks) {
    mapIndex++;
    const dims = block.rows > 1 ? '2D' : '1D';
    discovered.push({
      name: `MAP_${ecuFamily}_${mapIndex.toString().padStart(4, '0')}`,
      address: block.offset,
      size: block.totalBytes,
      dataType: block.dataWidth === 1 ? 'UBYTE' : block.dataWidth === 2 ? 'UWORD' : 'ULONG',
      dimensions: dims as '1D' | '2D',
      xAxisSize: block.cols,
      yAxisSize: block.rows > 1 ? block.rows : undefined,
      description: `Discovered ${dims} map at 0x${block.offset.toString(16).toUpperCase()} (${block.cols}x${block.rows})`,
      category: 'calibration',
      confidence: block.confidence,
    });
  }

  for (const ptr of pointerTables) {
    mapIndex++;
    discovered.push({
      name: `PTR_${ecuFamily}_${mapIndex.toString().padStart(4, '0')}`,
      address: ptr.offset,
      size: ptr.count * 4,
      dataType: 'ULONG',
      dimensions: '1D',
      xAxisSize: ptr.count,
      description: `Pointer table at 0x${ptr.offset.toString(16).toUpperCase()} (${ptr.count} entries)`,
      category: 'pointer_table',
      confidence: ptr.confidence,
    });
  }

  // Sort by address
  discovered.sort((a, b) => a.address - b.address);

  return discovered;
}

/**
 * Find monotonically increasing sequences (likely axis breakpoints)
 */
function findMonotonicSequences(
  binary: Buffer,
  minLength: number,
  scanStep: number
): Array<{ offset: number; length: number; dataWidth: number; confidence: number }> {
  const results: Array<{ offset: number; length: number; dataWidth: number; confidence: number }> = [];

  // Scan for 16-bit monotonic sequences
  for (let offset = 0; offset < binary.length - minLength * 2; offset += scanStep) {
    let length = 0;
    let isIncreasing = true;
    let prevValue = binary.readUInt16BE(offset);

    for (let i = 1; i < Math.min(256, (binary.length - offset) / 2); i++) {
      const pos = offset + i * 2;
      if (pos + 1 >= binary.length) break;

      const value = binary.readUInt16BE(pos);
      if (value > prevValue && value - prevValue < 0x2000) {
        length++;
        prevValue = value;
      } else {
        break;
      }
    }

    if (length >= minLength) {
      const confidence = Math.min(0.3 + length * 0.05, 0.95);
      results.push({ offset, length: length + 1, dataWidth: 2, confidence });
      offset += length * 2; // Skip past this sequence
    }
  }

  return results;
}

/**
 * Find structured data blocks (repeating patterns of similar-range values)
 */
function findStructuredDataBlocks(
  binary: Buffer,
  minSize: number,
  maxSize: number,
  scanStep: number
): Array<{ offset: number; cols: number; rows: number; dataWidth: number; totalBytes: number; confidence: number }> {
  const results: Array<{ offset: number; cols: number; rows: number; dataWidth: number; totalBytes: number; confidence: number }> = [];

  // Look for blocks of 16-bit values within a reasonable range
  for (let offset = 0; offset < binary.length - minSize; offset += scanStep * 4) {
    // Check if we have a block of values in a consistent range
    const blockAnalysis = analyzeBlock(binary, offset, minSize, maxSize);
    if (blockAnalysis) {
      results.push({
        offset,
        cols: blockAnalysis.cols,
        rows: blockAnalysis.rows,
        dataWidth: 2,
        totalBytes: blockAnalysis.cols * blockAnalysis.rows * 2,
        confidence: blockAnalysis.confidence,
      });
      offset += blockAnalysis.cols * blockAnalysis.rows * 2;
    }
  }

  return results;
}

/**
 * Analyze a potential data block at a given offset
 */
function analyzeBlock(
  binary: Buffer,
  offset: number,
  minSize: number,
  maxSize: number
): { cols: number; rows: number; confidence: number } | null {
  if (offset + minSize * 2 > binary.length) return null;

  // Read first 32 values and check if they're in a reasonable range
  const values: number[] = [];
  for (let i = 0; i < Math.min(32, (binary.length - offset) / 2); i++) {
    const pos = offset + i * 2;
    if (pos + 1 >= binary.length) break;
    values.push(binary.readUInt16BE(pos));
  }

  if (values.length < minSize / 2) return null;

  // Check if values are within a reasonable range (not all 0xFF or 0x00)
  const nonZero = values.filter(v => v !== 0 && v !== 0xFFFF);
  if (nonZero.length < values.length * 0.3) return null;

  // Check variance - calibration data typically has moderate variance
  const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  const variance = nonZero.reduce((a, b) => a + (b - mean) ** 2, 0) / nonZero.length;
  const cv = Math.sqrt(variance) / (mean || 1);

  // Coefficient of variation should be moderate (not random noise, not constant)
  if (cv < 0.01 || cv > 2.0) return null;

  // Try to detect row/column structure
  const cols = detectColumnCount(values);
  const rows = Math.floor(values.length / cols);

  if (rows < 1 || cols < 2) return null;

  const confidence = Math.min(0.3 + (rows * cols) * 0.01 + (cv > 0.05 && cv < 1.0 ? 0.2 : 0), 0.85);

  return { cols, rows, confidence };
}

/**
 * Detect column count by looking for repeating patterns in value ranges
 */
function detectColumnCount(values: number[]): number {
  // Try common column counts
  for (const cols of [16, 12, 10, 8, 6]) {
    if (values.length < cols * 2) continue;

    // Check if rows have similar value ranges
    let consistent = true;
    const rows = Math.floor(values.length / cols);

    for (let r = 1; r < Math.min(rows, 4); r++) {
      const row0Range = getRange(values.slice(0, cols));
      const rowNRange = getRange(values.slice(r * cols, (r + 1) * cols));

      // Ranges should be within 3x of each other
      if (row0Range.max > 0 && rowNRange.max > 0) {
        const ratio = Math.max(row0Range.max, rowNRange.max) / Math.min(row0Range.max, rowNRange.max);
        if (ratio > 3) {
          consistent = false;
          break;
        }
      }
    }

    if (consistent) return cols;
  }

  return Math.min(values.length, 8);
}

function getRange(values: number[]): { min: number; max: number } {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/**
 * Find pointer tables (32-bit addresses pointing within the binary)
 */
function findPointerTables(
  binary: Buffer,
  ecuFamily: string
): Array<{ offset: number; count: number; confidence: number }> {
  const results: Array<{ offset: number; count: number; confidence: number }> = [];

  // MG1C typically has pointers in the 0x08xx_xxxx range
  const validPointerRange = ecuFamily.includes('MG1')
    ? { min: 0x08000000, max: 0x09FFFFFF }
    : { min: 0x00100000, max: 0x0FFFFFFF };

  for (let offset = 0; offset < binary.length - 16; offset += 4) {
    let count = 0;

    for (let i = 0; i < Math.min(64, (binary.length - offset) / 4); i++) {
      const pos = offset + i * 4;
      if (pos + 3 >= binary.length) break;

      const value = binary.readUInt32BE(pos);
      if (value >= validPointerRange.min && value <= validPointerRange.max) {
        count++;
      } else {
        break;
      }
    }

    if (count >= 4) {
      results.push({
        offset,
        count,
        confidence: Math.min(0.4 + count * 0.05, 0.9),
      });
      offset += count * 4;
    }
  }

  return results;
}

/**
 * Generate a complete ASAP2 (A2L) definition file from discovered maps
 */
export function generateA2L(maps: DiscoveredMap[], options: A2LGenerationOptions): string {
  const {
    projectName,
    ecuFamily,
    version = '1.0.0',
    moduleName = ecuFamily,
    includeComments = true,
  } = options;

  const lines: string[] = [];

  // Header
  lines.push('ASAP2_VERSION 1 71');
  lines.push('');
  if (includeComments) {
    lines.push(`/* Auto-generated A2L definition for ${ecuFamily} */`);
    lines.push(`/* Generated by PPEI V-OP Reverse Engineering Engine */`);
    lines.push(`/* Maps discovered: ${maps.length} */`);
    lines.push(`/* Date: ${new Date().toISOString()} */`);
    lines.push('');
  }

  // Project
  lines.push(`/begin PROJECT ${projectName} "${ecuFamily} Calibration Definition"`);
  lines.push('');
  lines.push(`  /begin HEADER "${ecuFamily} Auto-Generated Definition"`);
  lines.push(`    VERSION "${version}"`);
  lines.push('  /end HEADER');
  lines.push('');

  // Module
  lines.push(`  /begin MODULE ${moduleName} "${ecuFamily} Module"`);
  lines.push('');

  // MOD_COMMON
  lines.push('    /begin MOD_COMMON ""');
  lines.push('      BYTE_ORDER MSB_LAST');
  lines.push('      ALIGNMENT_BYTE 1');
  lines.push('      ALIGNMENT_WORD 2');
  lines.push('      ALIGNMENT_LONG 4');
  lines.push('    /end MOD_COMMON');
  lines.push('');

  // RECORD_LAYOUTs
  const layouts = generateRecordLayouts(maps);
  for (const layout of layouts) {
    lines.push(layout);
  }
  lines.push('');

  // COMPU_METHODs
  lines.push('    /begin COMPU_METHOD CM_IDENTICAL ""');
  lines.push('      IDENTICAL "%6.3" ""');
  lines.push('    /end COMPU_METHOD');
  lines.push('');

  // CHARACTERISTICs
  for (const map of maps) {
    lines.push(generateCharacteristic(map, includeComments));
    lines.push('');
  }

  lines.push('  /end MODULE');
  lines.push('');
  lines.push('/end PROJECT');

  return lines.join('\n');
}

/**
 * Generate RECORD_LAYOUT definitions for the data types used
 */
function generateRecordLayouts(maps: DiscoveredMap[]): string[] {
  const layouts: string[] = [];
  const usedTypes = new Set(maps.map(m => m.dataType));

  for (const dataType of Array.from(usedTypes)) {
    const a2lType = mapDataTypeToA2L(dataType);
    layouts.push(`    /begin RECORD_LAYOUT RL_${dataType}`);
    layouts.push(`      FNC_VALUES 1 ${a2lType} ROW_DIR DIRECT`);
    layouts.push(`    /end RECORD_LAYOUT`);
  }

  return layouts;
}

/**
 * Generate a single CHARACTERISTIC block
 */
function generateCharacteristic(map: DiscoveredMap, includeComments: boolean): string {
  const lines: string[] = [];
  const charType = map.dimensions === '1D' ? 'CURVE' : 'MAP';
  const layoutName = `RL_${map.dataType}`;
  const addressHex = `0x${map.address.toString(16).toUpperCase()}`;

  if (includeComments && map.description) {
    lines.push(`    /* ${map.description} (confidence: ${(map.confidence * 100).toFixed(0)}%) */`);
  }

  lines.push(`    /begin CHARACTERISTIC ${map.name} "${map.description || map.name}"`);
  lines.push(`      ${charType}`);
  lines.push(`      ${addressHex}`);
  lines.push(`      ${layoutName}`);
  lines.push(`      0`);
  lines.push(`      CM_IDENTICAL`);
  lines.push(`      ${map.minValue ?? 0}`);
  lines.push(`      ${map.maxValue ?? 65535}`);

  if (map.xAxisSize) {
    lines.push(`      MATRIX_DIM ${map.xAxisSize} ${map.yAxisSize || 1} 1`);
  }

  if (map.units) {
    lines.push(`      PHYS_UNIT "${map.units}"`);
  }

  lines.push(`      ECU_ADDRESS ${addressHex}`);
  lines.push(`    /end CHARACTERISTIC`);

  return lines.join('\n');
}

/**
 * Map internal data type names to A2L data type keywords
 */
function mapDataTypeToA2L(dataType: string): string {
  switch (dataType) {
    case 'UBYTE': return 'UBYTE';
    case 'SBYTE': return 'SBYTE';
    case 'UWORD': return 'UWORD';
    case 'SWORD': return 'SWORD';
    case 'ULONG': return 'ULONG';
    case 'SLONG': return 'SLONG';
    case 'FLOAT32_IEEE': return 'FLOAT32_IEEE';
    default: return 'UWORD';
  }
}

/**
 * Validate a generated A2L for common issues
 */
export function validateA2L(maps: DiscoveredMap[]): A2LValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let addressOverlaps = 0;
  let duplicateNames = 0;

  // Check for duplicate names
  const nameSet = new Set<string>();
  for (const map of maps) {
    if (nameSet.has(map.name)) {
      duplicateNames++;
      errors.push(`Duplicate name: ${map.name}`);
    }
    nameSet.add(map.name);
  }

  // Check for address overlaps
  const sorted = [...maps].sort((a, b) => a.address - b.address);
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.address + current.size > next.address) {
      addressOverlaps++;
      warnings.push(
        `Address overlap: ${current.name} (0x${current.address.toString(16)}-0x${(current.address + current.size).toString(16)}) overlaps with ${next.name} (0x${next.address.toString(16)})`
      );
    }
  }

  // Check for zero-size maps
  for (const map of maps) {
    if (map.size <= 0) {
      errors.push(`Zero or negative size: ${map.name}`);
    }
    if (map.confidence < 0.3) {
      warnings.push(`Low confidence map: ${map.name} (${(map.confidence * 100).toFixed(0)}%)`);
    }
  }

  const totalSize = maps.reduce((sum, m) => sum + m.size, 0);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      characteristicCount: maps.length,
      totalSize,
      addressOverlaps,
      duplicateNames,
    },
  };
}
