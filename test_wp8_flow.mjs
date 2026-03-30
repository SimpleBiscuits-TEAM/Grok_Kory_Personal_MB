import fs from 'fs';

const fileData = fs.readFileSync('/home/ubuntu/upload/UTV96_YawPowerCoils_Rev_0_4_Run_6.wp8');
const buffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);

// Simulate the exact import path used in Home.tsx
// We can't use @/ alias in Node, so let's replicate the parser logic

const data = new Uint8Array(buffer);
const view = new DataView(buffer);

const WP8_MAGIC = 0xFECEFACE;
const HONDA_TALON_PART_PREFIXES = ['0801EB', '0801EA'];
const HONDA_TALON_DCT_KEYWORDS = ['DCT', 'Dual Clutch'];

// Check magic
const magic = view.getUint32(0, false);
console.log('Magic:', magic.toString(16), magic === WP8_MAGIC ? 'VALID' : 'INVALID');

// Check V2 detection
const isV2 = data[4] === 0x01 && data[5] === 0x0a;
console.log('Is V2:', isV2);

// Quick parse to get channels
function readVarint(data, pos) {
  let result = 0;
  let shift = 0;
  while (pos < data.length) {
    const b = data[pos];
    result |= (b & 0x7f) << shift;
    pos++;
    if (!(b & 0x80)) break;
    shift += 7;
    if (shift > 35) break;
  }
  return [result >>> 0, pos];
}

let pos = 5;
const channels = [];

while (pos < data.length - 2) {
  const [tag, pos2] = readVarint(data, pos);
  const wireType = tag & 0x07;
  if (wireType !== 2) break;
  const [length, pos3] = readVarint(data, pos2);
  const blockEnd = pos3 + length;
  if (blockEnd > data.length) break;

  let innerPos = pos3;
  let channelName = '';

  while (innerPos < blockEnd - 1) {
    const [innerTag, innerPos2] = readVarint(data, innerPos);
    const innerField = innerTag >>> 3;
    const innerWire = innerTag & 0x07;

    if (innerWire === 2) {
      const [innerLen, innerPos3] = readVarint(data, innerPos2);
      const contentEnd = innerPos3 + innerLen;
      if (contentEnd > blockEnd) break;
      if (innerField === 2) {
        const bytes = data.slice(innerPos3, contentEnd);
        channelName = '';
        for (let i = 0; i < bytes.length; i++) {
          channelName += String.fromCharCode(bytes[i]);
        }
      }
      innerPos = contentEnd;
    } else if (innerWire === 0) {
      const [, nextPos] = readVarint(data, innerPos2);
      innerPos = nextPos;
    } else if (innerWire === 5) {
      innerPos = innerPos2 + 4;
    } else if (innerWire === 1) {
      innerPos = innerPos2 + 8;
    } else {
      innerPos = innerPos2 + 1;
      break;
    }
  }

  if (channelName.length > 0) {
    channels.push({ index: channels.length, name: channelName.trim(), blockOffset: pos });
  }
  pos = blockEnd;
}

console.log('Total channels:', channels.length);

// Now test Honda Talon detection exactly as the parser does
const partNumber = ''; // V2 has no part number

const isHondaPart = HONDA_TALON_PART_PREFIXES.some(prefix =>
  partNumber.toUpperCase().includes(prefix)
);

const hasDCT = channels.some(ch =>
  HONDA_TALON_DCT_KEYWORDS.some(kw =>
    ch.name.toUpperCase().includes(kw.toUpperCase())
  )
);

const hasAlphaN = channels.some(ch => ch.name === 'Alpha N');

console.log('\nHonda Talon Detection:');
console.log('  isHondaPart:', isHondaPart, '(partNumber: "' + partNumber + '")');
console.log('  hasDCT:', hasDCT);
console.log('  hasAlphaN:', hasAlphaN);
console.log('  (isHondaPart && hasDCT):', isHondaPart && hasDCT);
console.log('  (hasDCT && hasAlphaN):', hasDCT && hasAlphaN);

const vehicleType = (isHondaPart && hasDCT) || (hasDCT && hasAlphaN) ? 'HONDA_TALON' : 'UNKNOWN';
console.log('  vehicleType:', vehicleType);

// Check the exact Alpha N channel name
const alphaNChannels = channels.filter(ch => ch.name.includes('Alpha'));
console.log('\nAlpha channels found:', alphaNChannels.map(ch => JSON.stringify(ch.name)));

const dctChannels = channels.filter(ch => ch.name.toUpperCase().includes('DCT'));
console.log('DCT channels found:', dctChannels.length, dctChannels.slice(0, 3).map(ch => ch.name));

// Now simulate the sessionStorage data
console.log('\n--- Simulating Home.tsx flow ---');
if (vehicleType === 'HONDA_TALON') {
  console.log('Would redirect to /advanced?tab=talon');
  console.log('Rows to serialize (cap 2000):', Math.min(2000, channels.length > 0 ? 'has rows' : 'no rows'));
} else {
  console.log('ERROR: Would throw "WP8 file detected but not a Honda Talon datalog"');
}
