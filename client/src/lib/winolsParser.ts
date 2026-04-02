/**
 * WinOLS Project File Parser
 * 
 * Parses WinOLS .ols binary format to extract:
 * - Project metadata (vehicle, ECU, software version)
 * - Embedded binary file
 * - Map definitions with addresses and data types
 * - Calibration data
 */

interface WinOLSHeader {
  magic: string;
  version: string;
  vehicle: string;
  model: string;
  processor: string;
  ecuId: string;
  softwareVersion: string;
  fileName: string;
}

interface WinOLSMap {
  name: string;
  address: number;
  length: number;
  rows: number;
  cols: number;
  dataType: string;
  unit: string;
  min: number;
  max: number;
  factor: number;
  offset: number;
  data: Uint8Array;
}

interface WinOLSProject {
  header: WinOLSHeader;
  binary: Uint8Array;
  maps: WinOLSMap[];
  baseAddress: number;
}

/**
 * Read a length-prefixed string from buffer at offset
 * Format: 4-byte little-endian length + string bytes
 */
function readLengthPrefixedString(buffer: Uint8Array, offset: number): { value: string; nextOffset: number } {
  const view = new DataView(buffer.buffer, buffer.byteOffset + offset, 4);
  const length = view.getUint32(0, true); // little-endian
  
  if (length === 0 || length > 10000) {
    return { value: '', nextOffset: offset + 4 };
  }
  
  const str = new TextDecoder('ascii', { fatal: false }).decode(
    buffer.slice(offset + 4, offset + 4 + length)
  );
  
  return { value: str.trim(), nextOffset: offset + 4 + length };
}

/**
 * Parse WinOLS project file header
 */
function parseWinOLSHeader(buffer: Uint8Array): { header: WinOLSHeader; nextOffset: number } {
  let offset = 0;
  
  // Magic: 4-byte length + "WinOLS File"
  const magic = readLengthPrefixedString(buffer, offset);
  offset = magic.nextOffset;
  
  // Skip some unknown bytes
  offset += 4;
  
  // Version info (4 bytes)
  offset += 4;
  
  // Vehicle name
  const vehicle = readLengthPrefixedString(buffer, offset);
  offset = vehicle.nextOffset;
  
  // Model name
  const model = readLengthPrefixedString(buffer, offset);
  offset = model.nextOffset;
  
  // Processor type
  const processor = readLengthPrefixedString(buffer, offset);
  offset = processor.nextOffset;
  
  // Processor version (e.g., "ME17.8.5")
  const processorVersion = readLengthPrefixedString(buffer, offset);
  offset = processorVersion.nextOffset;
  
  // ECU ID
  const ecuId = readLengthPrefixedString(buffer, offset);
  offset = ecuId.nextOffset;
  
  // Software version
  const softwareVersion = readLengthPrefixedString(buffer, offset);
  offset = softwareVersion.nextOffset;
  
  // File name
  const fileName = readLengthPrefixedString(buffer, offset);
  offset = fileName.nextOffset;
  
  // Version string (e.g., "OLS 5.0 (WinOLS)")
  const versionString = readLengthPrefixedString(buffer, offset);
  offset = versionString.nextOffset;
  
  const header: WinOLSHeader = {
    magic: magic.value,
    version: versionString.value,
    vehicle: vehicle.value,
    model: model.value,
    processor: processor.value,
    ecuId: ecuId.value,
    softwareVersion: softwareVersion.value,
    fileName: fileName.value,
  };
  
  return { header, nextOffset: offset };
}

/**
 * Find binary data section in WinOLS file
 * Looks for common binary signatures or size patterns
 */
function findBinarySection(buffer: Uint8Array, startOffset: number): { offset: number; size: number } | null {
  // Common binary sizes for ME17: 512KB, 1MB, 2MB
  const commonSizes = [0x80000, 0x100000, 0x200000, 0x400000];
  
  // Search for patterns that indicate binary data
  // ME17 binaries often start with specific patterns
  for (let i = startOffset; i < buffer.length - 4; i++) {
    // Look for 4-byte size header followed by binary data
    const view = new DataView(buffer.buffer, buffer.byteOffset + i, 4);
    const potentialSize = view.getUint32(0, true);
    
    if (commonSizes.includes(potentialSize) && i + 4 + potentialSize <= buffer.length) {
      return { offset: i + 4, size: potentialSize };
    }
  }
  
  return null;
}

/**
 * Parse WinOLS map definitions from project
 * Maps are typically stored as a table with metadata
 */
function parseMapDefinitions(buffer: Uint8Array, startOffset: number, binarySize: number): WinOLSMap[] {
  const maps: WinOLSMap[] = [];
  let offset = startOffset + binarySize;
  
  // Skip to map section (look for map count or marker)
  // This is a heuristic - actual format may vary
  const maxMaps = 500;
  
  for (let i = 0; i < maxMaps && offset < buffer.length - 50; i++) {
    // Try to read map entry
    // Format: address (4), length (4), rows (2), cols (2), name (string)
    
    if (offset + 12 > buffer.length) break;
    
    const view = new DataView(buffer.buffer, buffer.byteOffset + offset);
    const address = view.getUint32(0, true);
    const length = view.getUint32(4, true);
    
    // Sanity checks
    if (address === 0 || address > 0x10000000 || length === 0 || length > 0x100000) {
      break;
    }
    
    offset += 8;
    
    // Try to read map name
    const nameResult = readLengthPrefixedString(buffer, offset);
    offset = nameResult.nextOffset;
    
    if (nameResult.value.length === 0) break;
    
    maps.push({
      name: nameResult.value,
      address,
      length,
      rows: 1,
      cols: length,
      dataType: 'UBYTE',
      unit: '',
      min: 0,
      max: 255,
      factor: 1,
      offset: 0,
      data: new Uint8Array(),
    });
  }
  
  return maps;
}

/**
 * Parse WinOLS project file
 */
export function parseWinOLSProject(buffer: ArrayBuffer): WinOLSProject | null {
  try {
    const data = new Uint8Array(buffer);
    
    // Parse header
    const { header, nextOffset: headerEnd } = parseWinOLSHeader(data);
    
    // Find binary section
    const binarySection = findBinarySection(data, headerEnd);
    if (!binarySection) {
      console.warn('Could not find binary section in WinOLS file');
      return null;
    }
    
    const binary = data.slice(binarySection.offset, binarySection.offset + binarySection.size);
    
    // Parse map definitions
    const maps = parseMapDefinitions(data, binarySection.offset, binarySection.size);
    
    return {
      header,
      binary,
      maps,
      baseAddress: 0x80020000, // ME17 typical base address
    };
  } catch (error) {
    console.error('Error parsing WinOLS file:', error);
    return null;
  }
}

/**
 * Extract metadata from WinOLS project
 */
export function extractWinOLSMetadata(buffer: ArrayBuffer): WinOLSHeader | null {
  try {
    const data = new Uint8Array(buffer);
    const { header } = parseWinOLSHeader(data);
    return header;
  } catch (error) {
    console.error('Error extracting WinOLS metadata:', error);
    return null;
  }
}

/**
 * Generate A2L from WinOLS project
 * Creates ASAP2 format definitions from WinOLS maps
 */
export function generateA2LFromWinOLS(project: WinOLSProject): string {
  let a2l = `ASAP2_VERSION 1 71

PROJECT ${project.header.fileName}
  HEADER "Generated from WinOLS: ${project.header.vehicle} ${project.header.model}"
    VERSION "${project.header.softwareVersion}"
    COMPANY "WinOLS Import"
  /HEADER

  MODULE ${project.header.ecuId}
    SHORT_NAME "${project.header.processor}"
    LONG_NAME "${project.header.vehicle} ${project.header.model}"
    
    MOD_COMMON ""
      BYTE_ORDER MSB_FIRST
      ALIGNMENT_BYTE 1
      ALIGNMENT_WORD 2
      ALIGNMENT_LONG 4
      ALIGNMENT_INT64 8
      ALIGNMENT_FLOAT 4
      ALIGNMENT_DOUBLE 8
    /MOD_COMMON

`;

  // Add memory layout
  a2l += `    MEMORY_LAYOUT STANDARD
      EEPROM 0x0 ${(project.binary.length).toString(16)}
    /MEMORY_LAYOUT

`;

  // Add maps
  for (const map of project.maps) {
    a2l += `    /CHARACTERISTIC
      ${map.name}
      "Map: ${map.name}"
      VALUE
      0x${map.address.toString(16).padStart(8, '0')}
      RECORD_LAYOUT RL_UBYTE
      COMPU_METHOD IDENTICAL
      LOWER_LIMIT 0
      UPPER_LIMIT 255
    /CHARACTERISTIC

`;
  }

  a2l += `  /MODULE
/PROJECT
`;

  return a2l;
}
