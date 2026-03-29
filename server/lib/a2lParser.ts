/**
 * A2L Parser - Extracts calibration maps and metadata from ASAP2 files
 * Used for building the knowledge base and reverse engineering engine
 */

export interface CalibrationMap {
  name: string;
  address: number;
  size: number;
  dataType: string;
  dimensions: string;
  description?: string;
  category?: string;
  xAxisName?: string;
  yAxisName?: string;
  zAxisName?: string;
  units?: string;
  minValue?: number;
  maxValue?: number;
}

export interface A2LMetadata {
  version: string;
  projectName: string;
  ecuFamily: string;
  moduleCount: number;
  characteristicCount: number;
  measurementCount: number;
}

/**
 * Parse A2L file and extract calibration maps
 */
export function parseA2LFile(content: string): {
  metadata: A2LMetadata;
  maps: CalibrationMap[];
} {
  const metadata = extractMetadata(content);
  const maps = extractCalibrationMaps(content);

  return { metadata, maps };
}

/**
 * Extract metadata from A2L header
 */
function extractMetadata(content: string): A2LMetadata {
  const versionMatch = content.match(/ASAP2_VERSION\s+(\d+)\s+(\d+)/);
  const projectMatch = content.match(/\/begin PROJECT\s+(\w+)\s+"([^"]+)"/);
  const versionStringMatch = content.match(/VERSION\s+"([^"]+)"/);

  return {
    version: versionMatch ? `${versionMatch[1]}.${versionMatch[2]}` : "unknown",
    projectName: projectMatch ? projectMatch[2] : "unknown",
    ecuFamily: projectMatch ? projectMatch[1] : "unknown",
    moduleCount: (content.match(/\/begin MODULE/g) || []).length,
    characteristicCount: (content.match(/\/begin CHARACTERISTIC/g) || []).length,
    measurementCount: (content.match(/\/begin MEASUREMENT/g) || []).length,
  };
}

/**
 * Extract calibration maps from CHARACTERISTIC blocks
 */
function extractCalibrationMaps(content: string): CalibrationMap[] {
  const maps: CalibrationMap[] = [];

  // Split by CHARACTERISTIC blocks
  const charRegex = /\/begin CHARACTERISTIC\s+(\w+)\s+"([^"]*)"\s+([\s\S]*?)\/end CHARACTERISTIC/g;
  let match;

  while ((match = charRegex.exec(content)) !== null) {
    const name = match[1];
    const description = match[2];
    const blockContent = match[3];

    // Extract address (ECU address)
    const addressMatch = blockContent.match(/ECU_ADDRESS\s+0x([0-9A-Fa-f]+)/);
    const address = addressMatch ? parseInt(addressMatch[1], 16) : 0;

    // Extract data type
    const typeMatch = blockContent.match(/TYPE\s+(\w+)/);
    const dataType = typeMatch ? typeMatch[1] : "unknown";

    // Extract dimensions
    const dimMatch = blockContent.match(/MATRIX_DIM\s+(\d+)\s+(\d+)\s+(\d+)/);
    let dimensions = "1D";
    if (dimMatch) {
      const x = parseInt(dimMatch[1]);
      const y = parseInt(dimMatch[2]);
      const z = parseInt(dimMatch[3]);
      if (z > 1) dimensions = "3D";
      else if (y > 1) dimensions = "2D";
    }

    // Extract size
    const sizeMatch = blockContent.match(/NUMBER_OF_ELEMENTS\s+(\d+)/);
    const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

    // Extract units
    const unitsMatch = blockContent.match(/UNIT\s+"([^"]+)"/);
    const units = unitsMatch ? unitsMatch[1] : undefined;

    // Extract min/max values
    const minMatch = blockContent.match(/MIN_VALUE\s+([-\d.eE+]+)/);
    const maxMatch = blockContent.match(/MAX_VALUE\s+([-\d.eE+]+)/);
    const minValue = minMatch ? parseFloat(minMatch[1]) : undefined;
    const maxValue = maxMatch ? parseFloat(maxMatch[1]) : undefined;

    // Categorize map
    const category = categorizeMap(name, description);

    maps.push({
      name,
      address,
      size,
      dataType,
      dimensions,
      description: description || undefined,
      category,
      units,
      minValue,
      maxValue,
    });
  }

  return maps;
}

/**
 * Categorize calibration map based on name and description
 */
function categorizeMap(name: string, description: string): string {
  const combined = `${name} ${description}`.toLowerCase();

  if (combined.includes("fuel") || combined.includes("injection")) return "fuel_injection";
  if (combined.includes("boost") || combined.includes("turbo")) return "boost_control";
  if (combined.includes("ignition") || combined.includes("spark")) return "ignition_timing";
  if (combined.includes("idle") || combined.includes("rpm")) return "idle_control";
  if (combined.includes("egr")) return "egr_control";
  if (combined.includes("vgt") || combined.includes("vane")) return "vgt_control";
  if (combined.includes("rail") || combined.includes("pressure")) return "pressure_control";
  if (combined.includes("temp") || combined.includes("temperature")) return "temperature_control";
  if (combined.includes("lambda") || combined.includes("o2")) return "lambda_control";
  if (combined.includes("knock")) return "knock_control";
  if (combined.includes("torque") || combined.includes("load")) return "torque_control";

  return "other";
}

/**
 * Parse hex file (Intel or Motorola format) and extract binary data
 */
export function parseHexFile(content: string): {
  data: Map<number, number>;
  startAddress: number;
  endAddress: number;
} {
  const data = new Map<number, number>();
  let startAddress = 0xffffffff;
  let endAddress = 0;
  let extendedLinearAddress = 0;

  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.startsWith(":")) continue;

    const byteCount = parseInt(line.substring(1, 3), 16);
    const address = parseInt(line.substring(3, 7), 16);
    const recordType = parseInt(line.substring(7, 9), 16);
    const dataStr = line.substring(9, 9 + byteCount * 2);

    // Handle extended linear address record
    if (recordType === 0x04) {
      extendedLinearAddress = parseInt(dataStr, 16) << 16;
      continue;
    }

    // Handle data record
    if (recordType === 0x00) {
      const fullAddress = extendedLinearAddress + address;

      for (let i = 0; i < byteCount; i++) {
        const byteValue = parseInt(dataStr.substring(i * 2, i * 2 + 2), 16);
        data.set(fullAddress + i, byteValue);

        startAddress = Math.min(startAddress, fullAddress + i);
        endAddress = Math.max(endAddress, fullAddress + i);
      }
    }
  }

  return { data, startAddress, endAddress };
}

/**
 * Parse Motorola S-record file and extract binary data
 */
export function parseSRecordFile(content: string): {
  data: Map<number, number>;
  startAddress: number;
  endAddress: number;
} {
  const data = new Map<number, number>();
  let startAddress = 0xffffffff;
  let endAddress = 0;

  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.startsWith("S")) continue;

    const recordType = line.substring(1, 2);
    const byteCountStr = line.substring(2, 4);
    const byteCount = parseInt(byteCountStr, 16);

    // S1: 16-bit address
    if (recordType === "1") {
      const address = parseInt(line.substring(4, 8), 16);
      const dataStart = 8;
      const dataEnd = 4 + byteCount * 2 - 2; // Exclude checksum

      for (let i = dataStart; i < dataEnd; i += 2) {
        const byteValue = parseInt(line.substring(i, i + 2), 16);
        const offset = (i - dataStart) / 2;
        data.set(address + offset, byteValue);

        startAddress = Math.min(startAddress, address + offset);
        endAddress = Math.max(endAddress, address + offset);
      }
    }

    // S3: 32-bit address
    if (recordType === "3") {
      const address = parseInt(line.substring(4, 12), 16);
      const dataStart = 12;
      const dataEnd = 4 + byteCount * 2 - 2; // Exclude checksum

      for (let i = dataStart; i < dataEnd; i += 2) {
        const byteValue = parseInt(line.substring(i, i + 2), 16);
        const offset = (i - dataStart) / 2;
        data.set(address + offset, byteValue);

        startAddress = Math.min(startAddress, address + offset);
        endAddress = Math.max(endAddress, address + offset);
      }
    }
  }

  return { data, startAddress, endAddress };
}

/**
 * Detect ECU family from binary data
 */
export function detectECUFamily(binaryData: Buffer | Map<number, number>): {
  family: string;
  confidence: number;
  signature: string;
} {
  let dataArray: Uint8Array;

  if (binaryData instanceof Map) {
    // Convert map to array
    const keys = Array.from(binaryData.keys());
    const maxAddr = keys.length > 0 ? Math.max(...keys) : 0;
    dataArray = new Uint8Array(maxAddr + 1);
    binaryData.forEach((value, addr) => {
      dataArray[addr] = value;
    });
  } else {
    dataArray = new Uint8Array(binaryData);
  }

  // Check for MG1C signature (DEADBEEF magic)
  const mg1cSignature = detectMG1C(dataArray);
  if (mg1cSignature.confidence > 0) {
    return mg1cSignature;
  }

  // Check for ME17 signature
  const me17Signature = detectME17(dataArray);
  if (me17Signature.confidence > 0) {
    return me17Signature;
  }

  return {
    family: "unknown",
    confidence: 0,
    signature: "no_match",
  };
}

/**
 * Detect MG1C ECU family (Bosch MG1)
 */
function detectMG1C(data: Uint8Array): {
  family: string;
  confidence: number;
  signature: string;
} {
  // Look for DEADBEEF magic marker
  for (let i = 0; i < data.length - 3; i++) {
    if (
      data[i] === 0xde &&
      data[i + 1] === 0xad &&
      data[i + 2] === 0xbe &&
      data[i + 3] === 0xef
    ) {
      return {
        family: "MG1C",
        confidence: 0.95,
        signature: `DEADBEEF_at_0x${i.toString(16)}`,
      };
    }
  }

  return { family: "", confidence: 0, signature: "" };
}

/**
 * Detect ME17 ECU family (Bosch ME17)
 */
function detectME17(data: Uint8Array): {
  family: string;
  confidence: number;
  signature: string;
} {
  // Look for ME17 specific patterns
  const me17Patterns = [
    { pattern: [0x4d, 0x45, 0x31, 0x37], name: "ME17_ASCII" }, // "ME17" in ASCII
    { pattern: [0x4d, 0x45, 0x44, 0x31, 0x37], name: "MED17_ASCII" }, // "MED17" in ASCII
  ];

  for (const { pattern, name } of me17Patterns) {
    for (let i = 0; i < data.length - pattern.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.length; j++) {
        if (data[i + j] !== pattern[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        return {
          family: "ME17",
          confidence: 0.85,
          signature: `${name}_at_0x${i.toString(16)}`,
        };
      }
    }
  }

  return { family: "", confidence: 0, signature: "" };
}
