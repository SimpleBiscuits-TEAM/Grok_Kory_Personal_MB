/**
 * ME17 WinOLS Project Parser & A2L Compiler
 * 
 * Extracts map definitions from WinOLS .ols files and generates ASAP2 A2L format
 * Supports ME17 Bosch ECU family (Can-Am Spyder, Maverick, etc.)
 */

export interface ME17MapDefinition {
  index: number;
  name: string;
  address: number;
  length: number;
  rows: number;
  cols: number;
  dataType: 'UBYTE' | 'SBYTE' | 'UWORD' | 'SWORD' | 'ULONG' | 'SLONG' | 'FLOAT' | 'DOUBLE';
  unit: string;
  min: number;
  max: number;
  factor: number;
  offset: number;
  description: string;
}

export interface ME17WinOLSProject {
  vehicle: string;
  model: string;
  processor: string;
  processorVersion: string;
  ecuId: string;
  softwareVersion: string;
  fileName: string;
  binary: Uint8Array;
  baseAddress: number;
  maps: ME17MapDefinition[];
  parseTime: number;
}

/**
 * Parse WinOLS header to extract metadata
 */
function parseWinOLSHeader(buffer: Uint8Array): {
  vehicle: string;
  model: string;
  processor: string;
  processorVersion: string;
  ecuId: string;
  softwareVersion: string;
  fileName: string;
  headerEnd: number;
} {
  let offset = 0;

  function readLengthPrefixedString(off: number): { value: string; nextOffset: number } {
    const view = new DataView(buffer.buffer, buffer.byteOffset + off, 4);
    const length = view.getUint32(0, true);

    if (length === 0 || length > 10000) {
      return { value: '', nextOffset: off + 4 };
    }

    const str = new TextDecoder('ascii', { fatal: false }).decode(
      buffer.slice(off + 4, off + 4 + length)
    );

    return { value: str.trim(), nextOffset: off + 4 + length };
  }

  // Magic: "WinOLS File"
  const magic = readLengthPrefixedString(offset);
  offset = magic.nextOffset;

  // Skip 4 bytes
  offset += 4;

  // Skip version info (4 bytes)
  offset += 4;

  // Vehicle
  const vehicle = readLengthPrefixedString(offset);
  offset = vehicle.nextOffset;

  // Model
  const model = readLengthPrefixedString(offset);
  offset = model.nextOffset;

  // Processor
  const processor = readLengthPrefixedString(offset);
  offset = processor.nextOffset;

  // Processor version
  const processorVersion = readLengthPrefixedString(offset);
  offset = processorVersion.nextOffset;

  // ECU ID
  const ecuId = readLengthPrefixedString(offset);
  offset = ecuId.nextOffset;

  // Software version
  const softwareVersion = readLengthPrefixedString(offset);
  offset = softwareVersion.nextOffset;

  // File name
  const fileName = readLengthPrefixedString(offset);
  offset = fileName.nextOffset;

  // Version string
  const versionString = readLengthPrefixedString(offset);
  offset = versionString.nextOffset;

  return {
    vehicle: vehicle.value,
    model: model.value,
    processor: processor.value,
    processorVersion: processorVersion.value,
    ecuId: ecuId.value,
    softwareVersion: softwareVersion.value,
    fileName: fileName.value,
    headerEnd: offset,
  };
}

/**
 * Find binary section in WinOLS file
 */
function findBinarySection(buffer: Uint8Array, startOffset: number): { offset: number; size: number } | null {
  const commonSizes = [0x80000, 0x100000, 0x200000, 0x400000];

  for (let i = startOffset; i < buffer.length - 4; i++) {
    const view = new DataView(buffer.buffer, buffer.byteOffset + i, 4);
    const potentialSize = view.getUint32(0, true);

    if (commonSizes.includes(potentialSize) && i + 4 + potentialSize <= buffer.length) {
      return { offset: i + 4, size: potentialSize };
    }
  }

  return null;
}

/**
 * Parse map definitions from WinOLS map section
 */
function parseMapDefinitions(buffer: Uint8Array): ME17MapDefinition[] {
  const maps: ME17MapDefinition[] = [];
  let offset = 0;
  let mapIndex = 0;

  function readString(off: number, maxLen: number = 256): string {
    let len = 0;
    while (len < maxLen && off + len < buffer.length && buffer[off + len] !== 0) {
      len++;
    }
    return new TextDecoder('ascii').decode(buffer.slice(off, off + len));
  }

  function readU32LE(off: number): number {
    if (off + 4 > buffer.length) return 0;
    const view = new DataView(buffer.buffer, buffer.byteOffset + off, 4);
    return view.getUint32(0, true);
  }

  function readU16LE(off: number): number {
    if (off + 2 > buffer.length) return 0;
    const view = new DataView(buffer.buffer, buffer.byteOffset + off, 2);
    return view.getUint16(0, true);
  }

  function readFloatLE(off: number): number {
    if (off + 4 > buffer.length) return 0;
    const view = new DataView(buffer.buffer, buffer.byteOffset + off, 4);
    return view.getFloat32(0, true);
  }

  // Parse maps
  while (offset < buffer.length - 100 && mapIndex < 500) {
    // Look for MAP marker
    if (buffer[offset] === 0x4d && buffer[offset + 1] === 0x41 && buffer[offset + 2] === 0x50) {
      const mapStart = offset;
      const mapName = readString(offset, 100);

      // Skip to map metadata (after name + nulls)
      offset += mapName.length + 1;
      while (offset < buffer.length && buffer[offset] === 0) {
        offset++;
      }

      // Read map structure (heuristic parsing)
      let rows = 1;
      let cols = 1;
      let address = 0;
      let length = 0;
      let dataType: ME17MapDefinition['dataType'] = 'UBYTE';

      if (offset + 32 < buffer.length) {
        const val1 = readU32LE(offset);
        const val2 = readU32LE(offset + 4);
        const val3 = readU32LE(offset + 8);
        const val4 = readU32LE(offset + 12);

        // Heuristic: if val1 looks like dimensions (small numbers)
        if (val1 > 0 && val1 < 1000 && val2 > 0 && val2 < 1000) {
          rows = val1;
          cols = val2;
          length = rows * cols;
        }

        // Look for address pattern (0x80xxxxxx for ME17)
        if ((val1 & 0xff000000) === 0x80000000) {
          address = val1;
        } else if ((val2 & 0xff000000) === 0x80000000) {
          address = val2;
        } else if ((val3 & 0xff000000) === 0x80000000) {
          address = val3;
        }
      }

      // Infer data type from length
      if (length === 0) {
        length = rows * cols;
      }

      maps.push({
        index: mapIndex,
        name: mapName || `MAP_${mapIndex}`,
        address,
        length,
        rows,
        cols,
        dataType,
        unit: '',
        min: 0,
        max: 255,
        factor: 1,
        offset: 0,
        description: `Map ${mapIndex}`,
      });

      offset += 16;
      mapIndex++;
    } else {
      offset++;
    }
  }

  return maps;
}

/**
 * Parse ME17 WinOLS project file
 */
export function parseME17WinOLSProject(buffer: ArrayBuffer): ME17WinOLSProject | null {
  try {
    const startTime = performance.now();
    const data = new Uint8Array(buffer);

    // Parse header
    const header = parseWinOLSHeader(data);

    // Find binary section
    const binarySection = findBinarySection(data, header.headerEnd);
    if (!binarySection) {
      console.warn('Could not find binary section in WinOLS file');
      return null;
    }

    const binary = data.slice(binarySection.offset, binarySection.offset + binarySection.size);

    // Find map section (look for MAP marker)
    // Find MAP marker by searching for 'MAP' string
    let mapMarkerOffset = -1;
    for (let i = binarySection.offset; i < data.length - 3; i++) {
      if (data[i] === 0x4d && data[i + 1] === 0x41 && data[i + 2] === 0x50) {
        mapMarkerOffset = i;
        break;
      }
    }
    if (mapMarkerOffset === -1) {
      console.warn('Could not find map section in WinOLS file');
      return null;
    }

    const mapSection = data.slice(mapMarkerOffset);
    const maps = parseMapDefinitions(mapSection);

    const parseTime = performance.now() - startTime;

    return {
      vehicle: header.vehicle,
      model: header.model,
      processor: header.processor,
      processorVersion: header.processorVersion,
      ecuId: header.ecuId,
      softwareVersion: header.softwareVersion,
      fileName: header.fileName,
      binary,
      baseAddress: 0x80020000, // ME17 standard base address
      maps,
      parseTime,
    };
  } catch (error) {
    console.error('Error parsing ME17 WinOLS project:', error);
    return null;
  }
}

/**
 * Generate ASAP2 A2L format from ME17 WinOLS project
 */
export function generateME17A2L(project: ME17WinOLSProject): string {
  let a2l = `ASAP2_VERSION 1 71

PROJECT ${project.ecuId}
  HEADER "ME17 ECU Definition - Generated from WinOLS"
    VERSION "${project.softwareVersion}"
    COMPANY "WinOLS Import"
    AUTHOR "VOP ME17 Decompiler"
    DATE ""
    DESCRIPTION "Auto-generated A2L for ${project.vehicle} ${project.model}"
  /HEADER

  MODULE ${project.ecuId}
    SHORT_NAME "${project.processorVersion}"
    LONG_NAME "${project.vehicle} ${project.model} - ${project.softwareVersion}"
    
    MOD_COMMON ""
      BYTE_ORDER MSB_FIRST
      ALIGNMENT_BYTE 1
      ALIGNMENT_WORD 2
      ALIGNMENT_LONG 4
      ALIGNMENT_INT64 8
      ALIGNMENT_FLOAT 4
      ALIGNMENT_DOUBLE 8
    /MOD_COMMON

    MEMORY_LAYOUT STANDARD
      EEPROM 0x0 ${(project.binary.length).toString(16)}
    /MEMORY_LAYOUT

`;

  // Add record layouts
  a2l += `    RECORD_LAYOUT RL_UBYTE
      FNC_VALUES 1 UBYTE
    /RECORD_LAYOUT

    RECORD_LAYOUT RL_SBYTE
      FNC_VALUES 1 SBYTE
    /RECORD_LAYOUT

    RECORD_LAYOUT RL_UWORD
      FNC_VALUES 1 UWORD
    /RECORD_LAYOUT

    RECORD_LAYOUT RL_SWORD
      FNC_VALUES 1 SWORD
    /RECORD_LAYOUT

    RECORD_LAYOUT RL_ULONG
      FNC_VALUES 1 ULONG
    /RECORD_LAYOUT

    RECORD_LAYOUT RL_SLONG
      FNC_VALUES 1 SLONG
    /RECORD_LAYOUT

    RECORD_LAYOUT RL_FLOAT
      FNC_VALUES 1 FLOAT
    /RECORD_LAYOUT

`;

  // Add computation methods
  a2l += `    COMPU_METHOD IDENTICAL
      REF_UNIT ""
      COMPU_INTERNAL_TO_PHYS
        COMPU_SCALES
          COMPU_SCALE 1 0 ""
        /COMPU_SCALES
      /COMPU_INTERNAL_TO_PHYS
    /COMPU_METHOD

`;

  // Add characteristics (maps)
  for (const map of project.maps) {
    if (map.address === 0) continue; // Skip maps without address

    const recordLayout = `RL_${map.dataType}`;
    const a2lAddress = map.address - project.baseAddress;

    a2l += `    /CHARACTERISTIC
      ${map.name.replace(/[^a-zA-Z0-9_]/g, '_')}
      "${map.description}"
      VALUE
      0x${a2lAddress.toString(16).padStart(8, '0')}
      RECORD_LAYOUT ${recordLayout}
      COMPU_METHOD IDENTICAL
      LOWER_LIMIT ${map.min}
      UPPER_LIMIT ${map.max}
    /CHARACTERISTIC

`;
  }

  a2l += `  /MODULE
/PROJECT
`;

  return a2l;
}

/**
 * Export ME17 project data to JSON
 */
export function exportME17ProjectJSON(project: ME17WinOLSProject): string {
  return JSON.stringify(
    {
      metadata: {
        vehicle: project.vehicle,
        model: project.model,
        processor: project.processor,
        processorVersion: project.processorVersion,
        ecuId: project.ecuId,
        softwareVersion: project.softwareVersion,
        fileName: project.fileName,
        baseAddress: `0x${project.baseAddress.toString(16)}`,
        binarySize: project.binary.length,
        mapCount: project.maps.length,
        parseTime: `${project.parseTime.toFixed(2)}ms`,
      },
      maps: project.maps.map(m => ({
        index: m.index,
        name: m.name,
        address: `0x${m.address.toString(16)}`,
        length: m.length,
        rows: m.rows,
        cols: m.cols,
        dataType: m.dataType,
        description: m.description,
      })),
    },
    null,
    2
  );
}
