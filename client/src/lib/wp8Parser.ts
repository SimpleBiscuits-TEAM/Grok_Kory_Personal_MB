/**
 * WP8 (Dynojet WinPEP / Dynoware RT Datalog) Parser
 *
 * Supports two file format versions:
 *
 * V1 (Legacy binary):
 *   Magic: FECE FACE (4 bytes)
 *   Header: offset(4) + flags(4) + padding(4) + part_number(null-terminated)
 *   Channel definitions: blocks starting with 00 10, each containing channel name and metadata
 *   Data rows: marker 03 10 + size(2) + padding(2) + payload(4-byte counter + N x float32 LE)
 *
 * V2 (Protobuf-encoded, Dynoware RT):
 *   Magic: FECE FACE (4 bytes)
 *   Version byte: 0x01 (1 byte)
 *   Protobuf channel blocks (field=1, length-delimited), each containing:
 *     field=1: metadata sub-message (varint fields)
 *     field=2: channel name (string)
 *     field=4: data points (repeated sub-messages with float32 value + varint timestamp)
 *   Data is COLUMNAR — each channel carries its own time-series data points
 *
 * Honda Talon detection: DCT channels + part number containing "0801EB" or "0801EA"
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

/** Honda Talon detection: DCT channels + specific part number prefixes */
const HONDA_TALON_PART_PREFIXES = ['0801EB', '0801EA'];
const HONDA_TALON_DCT_KEYWORDS = ['DCT', 'Dual Clutch'];

// ─── Protobuf helpers ───────────────────────────────────────────────

function readVarint(data: Uint8Array, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (pos < data.length) {
    const b = data[pos];
    result |= (b & 0x7f) << shift;
    pos++;
    if (!(b & 0x80)) break;
    shift += 7;
    if (shift > 35) break; // safety: max 5 bytes for 32-bit varint
  }
  // Handle unsigned 32-bit overflow
  return [result >>> 0, pos];
}

// ─── V2 Protobuf parser ─────────────────────────────────────────────

interface V2ChannelData {
  name: string;
  points: Array<{ ts: number; val: number }>;
}

function parseV2(data: Uint8Array, view: DataView): WP8ParseResult {
  const channels: WP8Channel[] = [];
  const channelData: V2ChannelData[] = [];
  let v3PartNumber = '';

  // Find where protobuf blocks start (handles V2 and V3+ header variants)
  let pos = findProtobufStart(data);

  while (pos < data.length - 2) {
    const [tag, pos2] = readVarint(data, pos);
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    // We only expect field=1, wire_type=2 (length-delimited) at the top level
    if (wireType !== 2) break;

    // V3 part number block: field!=1, wire=2 — extract raw ASCII string and stop channel parsing
    if (fieldNum !== 1) {
      const [blockLen, blockStart] = readVarint(data, pos2);
      const blockEnd = blockStart + blockLen;
      if (blockEnd <= data.length) {
        // Read the block content as a raw ASCII string
        let candidate = '';
        let isAscii = true;
        for (let i = blockStart; i < blockEnd; i++) {
          if (data[i] >= 0x20 && data[i] <= 0x7E) {
            candidate += String.fromCharCode(data[i]);
          } else {
            isAscii = false;
            break;
          }
        }
        if (isAscii && candidate.length > 0) {
          v3PartNumber = candidate;
        }
        pos = blockEnd;
      }
      break; // After part number block, data rows follow
    }

    const [length, pos3] = readVarint(data, pos2);
    const blockEnd = pos3 + length;
    if (blockEnd > data.length) break;

    // Parse inside the channel block
    let innerPos = pos3;
    let channelName = '';
    const points: Array<{ ts: number; val: number }> = [];

    while (innerPos < blockEnd - 1) {
      const [innerTag, innerPos2] = readVarint(data, innerPos);
      const innerField = innerTag >>> 3;
      const innerWire = innerTag & 0x07;

      if (innerWire === 2) {
        // Length-delimited
        const [innerLen, innerPos3] = readVarint(data, innerPos2);
        const contentEnd = innerPos3 + innerLen;
        if (contentEnd > blockEnd) break;

        if (innerField === 2) {
          // Channel name (string)
          const bytes = data.slice(innerPos3, contentEnd);
          channelName = '';
          for (let i = 0; i < bytes.length; i++) {
            channelName += String.fromCharCode(bytes[i]);
          }
        } else if (innerField === 4) {
          // Data point sub-message: field=1 float32, field=2 varint timestamp
          let dpPos = innerPos3;
          let dpVal = 0;
          let dpTs = 0;
          let hasVal = false;
          let hasTs = false;

          while (dpPos < contentEnd) {
            const [dpTag, dpPos2] = readVarint(data, dpPos);
            const dpField = dpTag >>> 3;
            const dpWire = dpTag & 0x07;

            if (dpWire === 5 && dpField === 1) {
              // float32 (fixed 32-bit)
              if (dpPos2 + 4 <= contentEnd) {
                dpVal = view.getFloat32(dpPos2, true);
                hasVal = true;
              }
              dpPos = dpPos2 + 4;
            } else if (dpWire === 0) {
              // varint (timestamp)
              const [v, nextPos] = readVarint(data, dpPos2);
              if (dpField === 2) {
                dpTs = v;
                hasTs = true;
              }
              dpPos = nextPos;
            } else {
              // Skip unknown
              dpPos = dpPos2 + 1;
              break;
            }
          }

          if (hasVal && hasTs) {
            points.push({ ts: dpTs, val: dpVal });
          }
        } else {
          // Skip other length-delimited fields (e.g., metadata sub-message field=1)
        }

        innerPos = contentEnd;
      } else if (innerWire === 0) {
        // Varint — skip
        const [, nextPos] = readVarint(data, innerPos2);
        innerPos = nextPos;
      } else if (innerWire === 5) {
        // Fixed 32-bit — skip
        innerPos = innerPos2 + 4;
      } else if (innerWire === 1) {
        // Fixed 64-bit — skip
        innerPos = innerPos2 + 8;
      } else {
        innerPos = innerPos2 + 1;
        break;
      }
    }

    if (channelName.length > 0) {
      channels.push({
        index: channels.length,
        name: channelName.trim(),
        blockOffset: pos,
      });
      channelData.push({ name: channelName.trim(), points });
    }

    pos = blockEnd;
  }

  // Check if channels have data points (V2 columnar) or not (V3 flat rows)
  const hasColumnarData = channelData.some(ch => ch.points.length > 0);
  const numChannels = channels.length;
  const rows: WP8DataRow[] = [];
  let partNumber = '';

  if (hasColumnarData) {
    // ── V2 columnar format: data points embedded in channel blocks ──
    const tsSet = new Set<number>();
    for (const ch of channelData) {
      for (const pt of ch.points) {
        tsSet.add(pt.ts);
      }
    }
    const allTimestamps = Array.from(tsSet).sort((a, b) => a - b);

    const channelMaps: Map<number, number>[] = channelData.map(ch => {
      const m = new Map<number, number>();
      for (const pt of ch.points) {
        m.set(pt.ts, pt.val);
      }
      return m;
    });

    for (const ts of allTimestamps) {
      const values = new Float32Array(numChannels);
      for (let i = 0; i < numChannels; i++) {
        const val = channelMaps[i].get(ts);
        if (val !== undefined) {
          values[i] = val;
        } else {
          values[i] = NaN;
        }
      }
      rows.push({ timestamp: ts, values });
    }

    // Forward-fill NaN values
    for (let col = 0; col < numChannels; col++) {
      let lastVal = 0;
      for (let row = 0; row < rows.length; row++) {
        if (Number.isNaN(rows[row].values[col])) {
          rows[row].values[col] = lastVal;
        } else {
          lastVal = rows[row].values[col];
        }
      }
    }
  } else {
    // ── V3 flat-row format: data stored after channel definitions ──
    // Part number was already extracted during the channel loop (v3PartNumber)
    // pos now points to the start of flat data rows
    let dataPos = pos;
    partNumber = v3PartNumber;

    // Parse flat data rows: 4-byte LE uint32 timestamp + numChannels × 4-byte LE float32
    const rowSize = 4 + numChannels * 4;
    const remaining = data.length - dataPos;
    const numRows = Math.floor(remaining / rowSize);

    for (let r = 0; r < numRows; r++) {
      const rowOffset = dataPos + r * rowSize;
      const timestamp = view.getUint32(rowOffset, true);
      const values = new Float32Array(numChannels);
      for (let ch = 0; ch < numChannels; ch++) {
        values[ch] = view.getFloat32(rowOffset + 4 + ch * 4, true);
      }
      rows.push({ timestamp, values });
    }
  }

  const vehicleType = detectVehicleType(partNumber, channels);

  return {
    magic: WP8_MAGIC,
    partNumber,
    channels,
    rows,
    totalRows: rows.length,
    vehicleType,
    rawSize: data.length,
  };
}

// ─── V1 Legacy binary parser ────────────────────────────────────────

const V1_CHANNEL_MARKER_B0 = 0x00;
const V1_CHANNEL_MARKER_B1 = 0x10;
const V1_ROW_MARKER_B0 = 0x03;
const V1_ROW_MARKER_B1 = 0x10;

function parseV1(data: Uint8Array, view: DataView): WP8ParseResult {
  // Extract part number (null-terminated string)
  let partNumber = '';
  let pos = 0x0C;
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
    if (data[channelStartPos] === V1_ROW_MARKER_B0 && data[channelStartPos + 1] === V1_ROW_MARKER_B1) {
      break;
    }
    if (data[channelStartPos] === V1_CHANNEL_MARKER_B0 && data[channelStartPos + 1] === V1_CHANNEL_MARKER_B1) {
      const blockSize = data[channelStartPos + 2];
      const blockDataStart = channelStartPos + 3;

      let namePos = blockDataStart;
      while (namePos < blockDataStart + blockSize - 6) {
        if (data[namePos] === 0x01 && data[namePos + 1] === 0x10) {
          const strLen = view.getUint32(namePos + 2, true);
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
            }
          }
          break;
        }
        namePos++;
      }

      channelStartPos = blockDataStart + blockSize;
      while (channelStartPos < data.length && data[channelStartPos] === 0x00) {
        if (channelStartPos + 1 < data.length && data[channelStartPos + 1] === 0x10) {
          break;
        }
        channelStartPos++;
      }
      continue;
    }
    channelStartPos++;
  }

  // Find data section
  let dataStart = channelStartPos;
  while (dataStart < data.length - 4) {
    if (data[dataStart] === V1_ROW_MARKER_B0 && data[dataStart + 1] === V1_ROW_MARKER_B1) {
      break;
    }
    dataStart++;
  }

  // Parse data rows
  const rows: WP8DataRow[] = [];
  let rowPos = dataStart;
  const numChannels = channels.length;

  while (rowPos < data.length - 6) {
    if (data[rowPos] !== V1_ROW_MARKER_B0 || data[rowPos + 1] !== V1_ROW_MARKER_B1) {
      rowPos++;
      continue;
    }

    const rowSize = view.getUint16(rowPos + 2, true);
    const payloadStart = rowPos + 6;

    if (payloadStart + rowSize > data.length) break;

    const timestamp = view.getUint16(payloadStart, true);
    const floatStart = payloadStart + 4;
    const numFloats = Math.min(numChannels, Math.floor((rowSize - 4) / 4));
    const values = new Float32Array(numFloats);

    for (let i = 0; i < numFloats; i++) {
      values[i] = view.getFloat32(floatStart + i * 4, true);
    }

    rows.push({ timestamp, values });
    rowPos = payloadStart + rowSize;
  }

  const vehicleType = detectVehicleType(partNumber, channels);

  return {
    magic: WP8_MAGIC,
    partNumber,
    channels,
    rows,
    totalRows: rows.length,
    vehicleType,
    rawSize: data.length,
  };
}

// ─── Format detection ───────────────────────────────────────────────

/**
 * Detect whether a WP8 file uses protobuf-based format (V2/V3+).
 *
 * V2 files: magic(4) + version=0x01(1) + protobuf tag 0x0a at offset 5
 * V3 files: magic(4) + version varint + metadata varints + protobuf tag 0x0a
 *
 * V1 files have raw binary channel markers (0x00 0x10) which are distinct.
 */
function isV2Format(data: Uint8Array): boolean {
  if (data.length < 7) return false;
  // Quick check: V2 classic
  if (data[4] === 0x01 && data[5] === 0x0a) return true;
  // V3+: scan for the first protobuf field=1 tag (0x0a) within the first 20 bytes
  // after magic, and verify it's NOT a V1 file (V1 has 0x00 0x10 channel markers)
  for (let i = 5; i < Math.min(data.length, 20); i++) {
    if (data[i] === 0x0a) {
      // Verify this looks like a protobuf length-delimited block
      // by checking the next bytes form a valid varint length
      const [len, nextPos] = readVarint(data, i + 1);
      if (len > 10 && len < 10000 && nextPos < data.length) return true;
    }
  }
  return false;
}

/**
 * Find the offset where protobuf channel blocks begin.
 * V2: offset 5 (magic + 1 version byte)
 * V3+: scan for first 0x0a tag that starts a valid protobuf block
 */
function findProtobufStart(data: Uint8Array): number {
  // V2 classic: version byte 0x01 at offset 4
  if (data[4] === 0x01 && data[5] === 0x0a) return 5;
  // V3+: scan from offset 5 for the first valid protobuf field=1 tag
  for (let i = 5; i < Math.min(data.length, 20); i++) {
    if (data[i] === 0x0a) {
      const [len, nextPos] = readVarint(data, i + 1);
      if (len > 10 && len < 10000 && nextPos < data.length) return i;
    }
  }
  return 5; // fallback
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Parse a WP8 binary file into structured data.
 * Automatically detects V1 (legacy) vs V2 (protobuf) format.
 */
export function parseWP8(buffer: ArrayBuffer): WP8ParseResult {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Validate magic
  const magic = view.getUint32(0, false);
  if (magic !== WP8_MAGIC) {
    throw new Error(`Invalid WP8 file: expected magic FECEFACE, got ${magic.toString(16).toUpperCase()}`);
  }

  if (isV2Format(data)) {
    return parseV2(data, view);
  } else {
    return parseV1(data, view);
  }
}

/**
 * Detect vehicle type from part number and channel names
 */
function detectVehicleType(
  partNumber: string,
  channels: WP8Channel[]
): 'HONDA_TALON' | 'UNKNOWN' {
  const isHondaPart = HONDA_TALON_PART_PREFIXES.some(prefix =>
    partNumber.toUpperCase().includes(prefix)
  );

  const hasDCT = channels.some(ch =>
    HONDA_TALON_DCT_KEYWORDS.some(kw =>
      ch.name.toUpperCase().includes(kw.toUpperCase())
    )
  );

  const hasAlphaN = channels.some(ch => ch.name === 'Alpha N');

  // Honda Talon: DCT channels + (matching part number OR Alpha N)
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
    honda3BarMap: find('Honda_PV3_3 bar MAP'),
    honda3BarBaro: find('Honda_3 bar Baro_0801EB0401'),
    afr1: find('Air Fuel Ratio 1'),
    afr2: find('Air Fuel Ratio 2'),
    afrAverage: find('AFR Average'),
    lambda1: find('Lambda 1'),
    lambda2: find('Lambda 2'),
    pc5Lambda1: find('PC5_Lambda_1'),
    pc5Lambda2: find('PC5_Lambda_2'),
    o2Voltage: find('Oxygen Sensor Voltage'),
    stft: find('Short Term Fuel Trim'),
    polarisTotalFuelTrim: find('Polaris_Total Fuel Trim'),
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
    // Temperature/voltage channels
    oilTempVoltage: find('Engine Oil Temperature Sensor Voltage'),
    irTempProbe: find('IR Temp Probe Reading'),
    fuelPumpRelay: find('Fuel Pump Relay'),
    // Dyno-specific channels (multiple naming conventions)
    horsepower: find('Horsepower'),
    torque: find('Torque'),
    power: find('Power (uncorrected)'),
    powerDrum1: find('Power Drum 1 (uncorrected)'),
    powerDrum2: find('Power Drum 2 (uncorrected)'),
    torqueUncorrected: find('Torque (uncorrected)'),
    torqueDrum1: find('Torque Drum 1 (uncorrected)'),
    torqueDrum2: find('Torque Drum 2 (uncorrected)'),
    normalizedPower: find('Normalized Power (uncorrected)'),
    loadcellTorque: find('Loadcell Torque'),
    force: find('Force'),
    force1: find('Force 1'),
    drumDistance1: find('Drum Distance 1'),
    drumDistance2: find('Drum Distance 2'),
    speed1: find('Speed 1'),
    speed2: find('Speed 2'),
    gearRatio: find('Gear Ratio'),
    // Talon-specific channels discovered from 2,792 dyno logs
    talonClutchSlip5th: find('Talon_HL6_Clutch Slip_5th Gear'),
    hondaAddPw1: find('Honda_Add PW_0801EB0402'),
    hondaAddPw2: find('Honda_Add PW_0803880501'),
    massAirFlow: find('Mass Air Flow'),
    velocity1: find('Velocity 1'),
    drumMoving2: find('Drum Moving 2'),
    power1: find('Power 1'),
    loadControlDutyCycle1: find('Load Control Duty Cycle 1'),
    loadControlTorque0: find('Load Control Torque 0'),
    veError: find('X3_VE Error'),
  };
}
