/**
 * DBC File Parser
 * 
 * TIER 2: Parses Vector DBC (Database CAN) files to extract:
 *   - CAN message definitions (ID, name, length, sender)
 *   - Signal definitions (bit position, length, factor, offset, unit, range)
 *   - Value tables (enumerated values)
 *   - Signal groups and comments
 *
 * DBC format reference: Vector CANdb++ format
 * Supports: BO_ (messages), SG_ (signals), CM_ (comments), VAL_ (value tables),
 *           BA_DEF_ (attribute definitions), BA_ (attributes)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ByteOrder = 'little_endian' | 'big_endian';
export type ValueType = 'unsigned' | 'signed';

export interface DBCSignal {
  name: string;
  startBit: number;
  bitLength: number;
  byteOrder: ByteOrder;
  valueType: ValueType;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  receivers: string[];
  comment?: string;
  valueTable?: Map<number, string>;
  // Computed
  id: string; // message_id + signal_name
}

export interface DBCMessage {
  id: number; // CAN ID (11-bit or 29-bit)
  name: string;
  length: number; // DLC in bytes
  sender: string;
  signals: DBCSignal[];
  comment?: string;
  isExtended: boolean; // 29-bit extended frame
  // Computed
  signalCount: number;
}

export interface DBCNode {
  name: string;
  comment?: string;
}

export interface DBCParseResult {
  version: string;
  nodes: DBCNode[];
  messages: DBCMessage[];
  messageCount: number;
  signalCount: number;
  errors: string[];
  warnings: string[];
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a DBC file string into structured data.
 */
export function parseDBC(content: string): DBCParseResult {
  const result: DBCParseResult = {
    version: '',
    nodes: [],
    messages: [],
    messageCount: 0,
    signalCount: 0,
    errors: [],
    warnings: [],
  };

  const lines = content.split('\n');
  let i = 0;

  // Collect comments and value tables to apply after parsing
  const messageComments = new Map<number, string>();
  const signalComments = new Map<string, string>(); // "msgId_signalName" -> comment
  const valueTables = new Map<string, Map<number, string>>(); // "msgId_signalName" -> values

  while (i < lines.length) {
    const line = lines[i].trim();

    // VERSION
    if (line.startsWith('VERSION')) {
      const match = line.match(/VERSION\s+"([^"]*)"/);
      if (match) result.version = match[1];
      i++;
      continue;
    }

    // BU_ (nodes)
    if (line.startsWith('BU_')) {
      const match = line.match(/BU_\s*:\s*(.*)/);
      if (match) {
        const nodeNames = match[1].trim().split(/\s+/).filter(n => n.length > 0);
        result.nodes = nodeNames.map(name => ({ name }));
      }
      i++;
      continue;
    }

    // BO_ (message)
    if (line.startsWith('BO_ ')) {
      const msgMatch = line.match(/BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\w+)/);
      if (!msgMatch) {
        result.errors.push(`Line ${i + 1}: Failed to parse message: ${line.slice(0, 80)}`);
        i++;
        continue;
      }

      const rawId = parseInt(msgMatch[1], 10);
      const isExtended = (rawId & 0x80000000) !== 0;
      const canId = isExtended ? rawId & 0x1FFFFFFF : rawId;

      const message: DBCMessage = {
        id: canId,
        name: msgMatch[2],
        length: parseInt(msgMatch[3], 10),
        sender: msgMatch[4],
        signals: [],
        isExtended,
        signalCount: 0,
      };

      i++;

      // Parse signals (SG_ lines following BO_)
      while (i < lines.length) {
        const sigLine = lines[i].trim();
        if (!sigLine.startsWith('SG_ ')) break;

        const signal = parseSignalLine(sigLine, canId);
        if (signal) {
          message.signals.push(signal);
        } else {
          result.warnings.push(`Line ${i + 1}: Failed to parse signal: ${sigLine.slice(0, 80)}`);
        }
        i++;
      }

      message.signalCount = message.signals.length;
      result.messages.push(message);
      continue;
    }

    // CM_ (comments)
    if (line.startsWith('CM_ ')) {
      const fullComment = collectMultilineString(lines, i);
      i = fullComment.nextIndex;

      const msgCommentMatch = fullComment.text.match(/CM_\s+BO_\s+(\d+)\s+"([^"]*)"/);
      if (msgCommentMatch) {
        messageComments.set(parseInt(msgCommentMatch[1], 10), msgCommentMatch[2]);
        continue;
      }

      const sigCommentMatch = fullComment.text.match(/CM_\s+SG_\s+(\d+)\s+(\w+)\s+"([^"]*)"/);
      if (sigCommentMatch) {
        const key = `${sigCommentMatch[1]}_${sigCommentMatch[2]}`;
        signalComments.set(key, sigCommentMatch[3]);
        continue;
      }

      const nodeCommentMatch = fullComment.text.match(/CM_\s+BU_\s+(\w+)\s+"([^"]*)"/);
      if (nodeCommentMatch) {
        const node = result.nodes.find(n => n.name === nodeCommentMatch[1]);
        if (node) node.comment = nodeCommentMatch[2];
        continue;
      }

      continue;
    }

    // VAL_ (value tables)
    if (line.startsWith('VAL_ ')) {
      const valMatch = line.match(/VAL_\s+(\d+)\s+(\w+)\s+(.*);/);
      if (valMatch) {
        const key = `${valMatch[1]}_${valMatch[2]}`;
        const valMap = parseValueDefinitions(valMatch[3]);
        valueTables.set(key, valMap);
      }
      i++;
      continue;
    }

    i++;
  }

  // Apply comments and value tables
  for (const msg of result.messages) {
    const comment = messageComments.get(msg.id);
    if (comment) msg.comment = comment;

    for (const sig of msg.signals) {
      const sigKey = `${msg.id}_${sig.name}`;
      const sigComment = signalComments.get(sigKey);
      if (sigComment) sig.comment = sigComment;

      const valTable = valueTables.get(sigKey);
      if (valTable) sig.valueTable = valTable;
    }
  }

  result.messageCount = result.messages.length;
  result.signalCount = result.messages.reduce((sum, m) => sum + m.signalCount, 0);

  return result;
}

// ─── Signal Line Parser ─────────────────────────────────────────────────────

/**
 * Parse a SG_ line:
 * SG_ signal_name : start_bit|bit_length@byte_order value_type (factor,offset) [min|max] "unit" receivers
 */
function parseSignalLine(line: string, messageId: number): DBCSignal | null {
  // SG_ SignalName : 0|8@1+ (1,0) [0|255] "unit" Receiver1,Receiver2
  const match = line.match(
    /SG_\s+(\w+)\s*(?:\w+\s*)?:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"\s*(.*)/
  );

  if (!match) return null;

  const name = match[1];
  const startBit = parseInt(match[2], 10);
  const bitLength = parseInt(match[3], 10);
  const byteOrder: ByteOrder = match[4] === '1' ? 'little_endian' : 'big_endian';
  const valueType: ValueType = match[5] === '+' ? 'unsigned' : 'signed';
  const factor = parseFloat(match[6]);
  const offset = parseFloat(match[7]);
  const min = parseFloat(match[8]);
  const max = parseFloat(match[9]);
  const unit = match[10];
  const receivers = match[11].trim().split(',').map(r => r.trim()).filter(r => r.length > 0);

  return {
    name,
    startBit,
    bitLength,
    byteOrder,
    valueType,
    factor,
    offset,
    min,
    max,
    unit,
    receivers,
    id: `${messageId}_${name}`,
  };
}

// ─── Value Definition Parser ────────────────────────────────────────────────

function parseValueDefinitions(valStr: string): Map<number, string> {
  const map = new Map<number, string>();
  const regex = /(\d+)\s+"([^"]*)"/g;
  let match;
  while ((match = regex.exec(valStr)) !== null) {
    map.set(parseInt(match[1], 10), match[2]);
  }
  return map;
}

// ─── Multiline String Collector ─────────────────────────────────────────────

function collectMultilineString(lines: string[], startIdx: number): { text: string; nextIndex: number } {
  let text = lines[startIdx];
  let idx = startIdx + 1;

  // If the line ends with ; it's complete
  if (text.trim().endsWith(';')) {
    return { text, nextIndex: idx };
  }

  // Collect continuation lines
  while (idx < lines.length) {
    text += ' ' + lines[idx].trim();
    idx++;
    if (text.trim().endsWith(';')) break;
  }

  return { text, nextIndex: idx };
}

// ─── CAN Frame Decoder ─────────────────────────────────────────────────────

/**
 * Decode a raw CAN frame using DBC signal definitions.
 * Returns decoded signal values.
 */
export function decodeCANFrame(
  messageId: number,
  data: Uint8Array,
  dbcResult: DBCParseResult
): { signalName: string; value: number; unit: string; rawValue: number; displayValue: string }[] {
  const message = dbcResult.messages.find(m => m.id === messageId);
  if (!message) return [];

  const results: { signalName: string; value: number; unit: string; rawValue: number; displayValue: string }[] = [];

  for (const signal of message.signals) {
    const rawValue = extractBits(data, signal.startBit, signal.bitLength, signal.byteOrder, signal.valueType);
    const physValue = rawValue * signal.factor + signal.offset;

    let displayValue = `${physValue.toFixed(signal.factor < 1 ? 2 : 0)} ${signal.unit}`;
    if (signal.valueTable) {
      const enumName = signal.valueTable.get(rawValue);
      if (enumName) displayValue = enumName;
    }

    results.push({
      signalName: signal.name,
      value: physValue,
      unit: signal.unit,
      rawValue,
      displayValue,
    });
  }

  return results;
}

/**
 * Extract bits from a CAN data payload.
 */
function extractBits(
  data: Uint8Array,
  startBit: number,
  bitLength: number,
  byteOrder: ByteOrder,
  valueType: ValueType
): number {
  let rawValue = 0;

  if (byteOrder === 'little_endian') {
    // Intel byte order: LSB first
    for (let bit = 0; bit < bitLength; bit++) {
      const bitPos = startBit + bit;
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = bitPos % 8;
      if (byteIdx < data.length) {
        if (data[byteIdx] & (1 << bitIdx)) {
          rawValue |= 1 << bit;
        }
      }
    }
  } else {
    // Motorola byte order: MSB first
    let bitPos = startBit;
    for (let bit = bitLength - 1; bit >= 0; bit--) {
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = bitPos % 8;
      if (byteIdx < data.length) {
        if (data[byteIdx] & (1 << bitIdx)) {
          rawValue |= 1 << bit;
        }
      }
      // Navigate Motorola bit numbering
      if (bitIdx === 0) {
        bitPos += 15; // Jump to next byte MSB
      } else {
        bitPos--;
      }
    }
  }

  // Handle signed values
  if (valueType === 'signed' && bitLength > 1) {
    const signBit = 1 << (bitLength - 1);
    if (rawValue & signBit) {
      rawValue -= 1 << bitLength;
    }
  }

  return rawValue;
}

// ─── Search DBC ─────────────────────────────────────────────────────────────

/**
 * Search DBC messages and signals by name or comment.
 */
export function searchDBC(
  dbcResult: DBCParseResult,
  query: string
): { messages: DBCMessage[]; signals: (DBCSignal & { messageName: string; messageId: number })[] } {
  const q = query.toLowerCase();

  const messages = dbcResult.messages.filter(m =>
    m.name.toLowerCase().includes(q) ||
    (m.comment && m.comment.toLowerCase().includes(q))
  );

  const signals: (DBCSignal & { messageName: string; messageId: number })[] = [];
  for (const msg of dbcResult.messages) {
    for (const sig of msg.signals) {
      if (
        sig.name.toLowerCase().includes(q) ||
        (sig.comment && sig.comment.toLowerCase().includes(q)) ||
        sig.unit.toLowerCase().includes(q)
      ) {
        signals.push({ ...sig, messageName: msg.name, messageId: msg.id });
      }
    }
  }

  return { messages, signals };
}

// ─── DBC to Protocol Normalizer Bridge ──────────────────────────────────────

/**
 * Convert DBC-decoded signals to NormalizedReading format
 * for integration with the unified diagnostics pipeline.
 */
export function dbcSignalToNormalizedFormat(
  signal: DBCSignal,
  messageId: number,
  messageName: string,
  value: number,
  timestamp: number
): {
  id: string;
  protocol: 'j1939' | 'obd2';
  timestamp: number;
  value: number;
  unit: string;
  name: string;
  shortName: string;
  category: string;
  min: number;
  max: number;
  resolution: number;
} {
  // Determine protocol based on message ID range
  const protocol: 'j1939' | 'obd2' = messageId > 0x7FF ? 'j1939' : 'obd2';

  // Infer category from signal name/unit
  let category = 'custom';
  const nameLower = signal.name.toLowerCase();
  if (nameLower.includes('rpm') || nameLower.includes('engine') || nameLower.includes('torque')) category = 'engine';
  else if (nameLower.includes('speed') || nameLower.includes('wheel')) category = 'vehicle';
  else if (nameLower.includes('temp') || nameLower.includes('coolant')) category = 'temperature';
  else if (nameLower.includes('pressure') || nameLower.includes('boost')) category = 'pressure';
  else if (nameLower.includes('fuel') || nameLower.includes('injection')) category = 'fuel';
  else if (nameLower.includes('trans') || nameLower.includes('gear')) category = 'transmission';
  else if (nameLower.includes('volt') || nameLower.includes('current')) category = 'electrical';

  return {
    id: `dbc_${messageId}_${signal.name}`,
    protocol,
    timestamp,
    value,
    unit: signal.unit,
    name: `${messageName} - ${signal.name}`,
    shortName: signal.name,
    category,
    min: signal.min,
    max: signal.max,
    resolution: signal.factor,
  };
}
