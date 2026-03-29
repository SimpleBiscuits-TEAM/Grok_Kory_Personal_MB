/**
 * WP8 (Dynojet Power Vision Datalog) Parser
 *
 * File format:
 *   Magic: FECE FACE (4 bytes)
 *   Header: offset(4) + flags(4) + padding(4) + part_number(null-terminated)
 *   Channel definitions: blocks starting with 00 10, each containing channel name and metadata
 *   Data rows: marker 03 10 + size(2) + padding(2) + payload(4-byte counter + N x float32 LE)
 *
 * Honda Talon detection: DCT channels + part number containing "0801EB"
 */

export interface WP8Channel {
  index: number;
  name: string;
  blockOffset: number;
}

export interface WP8DataRow {
  timestamp: number;
  values: Float32Array;
}

export interface WP8ParseResult {
  magic: number;
  partNumber: string;
  channels: WP8Channel[];
  rows: WP8DataRow[];
  totalRows: number;
  vehicleType: 'HONDA_TALON' | 'UNKNOWN';
  rawSize: number;
}

const WP8_MAGIC = 0xFECEFACE;
const CHANNEL_MARKER = 0x0010;  // big-endian
const NAME_SUB_MARKER = 0x0110; // big-endian
const ROW_MARKER_BYTE0 = 0x03;
const ROW_MARKER_BYTE1 = 0x10;

/** Honda Talon detection: DCT channels + specific part number prefixes */
const HONDA_TALON_PART_PREFIXES = ['0801EB', '0801EA'];
const HONDA_TALON_DCT_KEYWORDS = ['DCT', 'Dual Clutch'];

/**
 * Parse a WP8 binary file into structured data
 */
export function parseWP8(buffer: ArrayBuffer): WP8ParseResult {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Validate magic
  const magic = view.getUint32(0, false); // big-endian FECE FACE
  if (magic !== WP8_MAGIC) {
    throw new Error(`Invalid WP8 file: expected magic FECEFACE, got ${magic.toString(16).toUpperCase()}`);
  }

  // Extract part number (null-terminated string)
  // Scan from offset 0x0C, skip non-printable bytes to find start of ASCII part number
  let partNumber = '';
  let pos = 0x0C;
  // Skip leading zeros/non-printable bytes
  while (pos < Math.min(data.length, 0x20) && (data[pos] < 0x20 || data[pos] > 0x7E)) {
    pos++;
  }
  while (pos < data.length && data[pos] !== 0) {
    partNumber += String.fromCharCode(data[pos]);
    pos++;
  }
  pos++; // skip null terminator

  // Parse channel definitions
  const channels: WP8Channel[] = [];
  let channelStartPos = pos;

  while (channelStartPos < data.length - 6) {
    // Stop if we hit a data row marker (03 10) - we've passed the channel section
    if (data[channelStartPos] === ROW_MARKER_BYTE0 && data[channelStartPos + 1] === ROW_MARKER_BYTE1) {
      break;
    }
    // Look for channel block marker: 00 10
    if (data[channelStartPos] === 0x00 && data[channelStartPos + 1] === 0x10) {
      const blockSize = data[channelStartPos + 2];
      const blockDataStart = channelStartPos + 3;

      // Look for name sub-marker 01 10 within the block
      let namePos = blockDataStart;
      let foundName = false;
      while (namePos < blockDataStart + blockSize - 6) {
        if (data[namePos] === 0x01 && data[namePos + 1] === 0x10) {
          const strLen = view.getUint32(namePos + 2, true); // LE
          if (strLen > 0 && strLen < 100) {
            let name = '';
            for (let i = 0; i < strLen; i++) {
              const ch = data[namePos + 6 + i];
              if (ch === 0) break;
              name += String.fromCharCode(ch);
            }
            if (name.length > 0) {
              channels.push({
                index: channels.length,
                name: name.trim(),
                blockOffset: channelStartPos,
              });
              foundName = true;
            }
          }
          break;
        }
        namePos++;
      }

      // Advance past this block
      channelStartPos = blockDataStart + blockSize;
      // Skip padding zeros until next block or data section
      while (channelStartPos < data.length && data[channelStartPos] === 0x00) {
        // Check if next byte could be start of a new channel block (0x10)
        if (channelStartPos + 1 < data.length && data[channelStartPos + 1] === 0x10) {
          break;
        }
        channelStartPos++;
      }
      continue;
    }
    channelStartPos++;
  }

  // Find data section - look for first row marker (03 10)
  let dataStart = channelStartPos;
  while (dataStart < data.length - 4) {
    if (data[dataStart] === ROW_MARKER_BYTE0 && data[dataStart + 1] === ROW_MARKER_BYTE1) {
      break;
    }
    dataStart++;
  }

  // Parse data rows
  const rows: WP8DataRow[] = [];
  let rowPos = dataStart;
  const numChannels = channels.length;

  while (rowPos < data.length - 6) {
    if (data[rowPos] !== ROW_MARKER_BYTE0 || data[rowPos + 1] !== ROW_MARKER_BYTE1) {
      rowPos++;
      continue;
    }

    const rowSize = view.getUint16(rowPos + 2, true); // LE
    const payloadStart = rowPos + 6; // marker(2) + size(2) + padding(2)

    if (payloadStart + rowSize > data.length) break;

    // First 4 bytes of payload are timestamp/counter
    const timestamp = view.getUint16(payloadStart, true);

    // Remaining bytes are float32 values
    const floatStart = payloadStart + 4;
    const numFloats = Math.min(numChannels, Math.floor((rowSize - 4) / 4));
    const values = new Float32Array(numFloats);

    for (let i = 0; i < numFloats; i++) {
      values[i] = view.getFloat32(floatStart + i * 4, true); // LE
    }

    rows.push({ timestamp, values });

    // Advance to next row
    rowPos = payloadStart + rowSize;
  }

  // Detect vehicle type
  const vehicleType = detectVehicleType(partNumber, channels);

  return {
    magic,
    partNumber,
    channels,
    rows,
    totalRows: rows.length,
    vehicleType,
    rawSize: data.length,
  };
}

/**
 * Detect vehicle type from part number and channel names
 */
function detectVehicleType(
  partNumber: string,
  channels: WP8Channel[]
): 'HONDA_TALON' | 'UNKNOWN' {
  // Check part number
  const isHondaPart = HONDA_TALON_PART_PREFIXES.some(prefix =>
    partNumber.toUpperCase().includes(prefix)
  );

  // Check for DCT channels (Honda Talon uses Dual Clutch Transmission)
  const hasDCT = channels.some(ch =>
    HONDA_TALON_DCT_KEYWORDS.some(kw =>
      ch.name.toUpperCase().includes(kw.toUpperCase())
    )
  );

  // Honda Talon: must have DCT channels AND matching part number
  // Or just DCT channels with Alpha N (Honda fueling strategy)
  const hasAlphaN = channels.some(ch => ch.name === 'Alpha N');

  if ((isHondaPart && hasDCT) || (hasDCT && hasAlphaN)) {
    return 'HONDA_TALON';
  }

  return 'UNKNOWN';
}

/**
 * Quick check if a file is a WP8 file (just checks magic bytes)
 */
export function isWP8File(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false;
  const view = new DataView(buffer);
  return view.getUint32(0, false) === WP8_MAGIC;
}

/**
 * Convert WP8 data to CSV format for compatibility with existing analyzer
 */
export function wp8ToCSV(result: WP8ParseResult): string {
  const headers = result.channels.map(ch => ch.name);
  const lines: string[] = [headers.join(',')];

  for (const row of result.rows) {
    const vals: string[] = [];
    for (let i = 0; i < result.channels.length; i++) {
      const v = i < row.values.length ? row.values[i] : 0;
      // Round to 4 decimal places to keep CSV clean
      vals.push(Number.isFinite(v) ? v.toFixed(4) : '0');
    }
    lines.push(vals.join(','));
  }

  return lines.join('\n');
}

/**
 * Get key Honda Talon channels for quick display
 */
export function getHondaTalonKeyChannels(result: WP8ParseResult) {
  const find = (name: string) =>
    result.channels.find(ch => ch.name === name)?.index ?? -1;

  return {
    engineSpeed: find('Engine Speed'),
    throttlePosition: find('Throttle Position'),
    vehicleSpeed: find('Vehicle Speed'),
    coolantTemp: find('Coolant Temperature'),
    intakeAirTemp: find('Intake Air Temperature'),
    map: find('Manifold Absolute Pressure'),
    mapCorrected: find('Manifold Absolute Pressure Corrected'),
    mapSensorVoltage: find('Manifold Absolute Pressure Sensor Voltage'),
    afr1: find('Air Fuel Ratio 1'),
    afr2: find('Air Fuel Ratio 2'),
    o2Voltage: find('Oxygen Sensor Voltage'),
    stft: find('Short Term Fuel Trim'),
    injPwFinal: find('Injector Pulsewidth Final'),
    injPwDesired: find('Injector Pulsewidth Desired'),
    injDutyCycle: find('Injector Duty Cycle'),
    ignitionTiming: find('Ignition Timing Final'),
    commandedGear: find('Commanded Gear'),
    alphaN: find('Alpha N'),
    moduleVoltage: find('Module Voltage'),
    baroSensorVoltage: find('Baro Sensor Voltage'),
    baroPressure: find('Barometric Pressure'),
    dctClutch1Pressure: find('DCT Clutch 1 Pressure'),
    dctClutch2Pressure: find('DCT Clutch 2 Pressure'),
    dctLinePressure: find('DCT Line Pressure'),
    dctOutputShaftSpeed: find('DCT Output Shaft Speed'),
    dctClutch1SlipSpeed: find('DCT Clutch 1 Slip Speed'),
    dctClutch2SlipSpeed: find('DCT Clutch 2 Slip Speed'),
    launchStatus: find('Launch Status'),
  };
}
