import { readFileSync } from 'fs';

// Minimal WP8 binary parser to analyze the test file
const buf = readFileSync('./test_data.wp8');
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// WP8 header parsing
let offset = 0;

// Read string helper
function readString(len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[offset + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  offset += len;
  return s;
}

// File signature
const sig = readString(4);
console.log('Signature:', sig);

// Read version
const version = view.getUint16(offset, true);
offset += 2;
console.log('Version:', version);

// Skip to channel count - WP8 format varies, let's try to find channel info
// Reset and try a different approach - read the raw header
offset = 0;
const headerBytes = [];
for (let i = 0; i < 200; i++) {
  headerBytes.push(buf[i]);
}

// Try to find channel names by scanning for readable strings
console.log('\n--- Scanning for channel names ---');
const channels = [];
let pos = 0;
const text = buf.toString('latin1');

// WP8 files have a specific structure - let's look for common channel names
const knownChannels = [
  'Engine Speed', 'Throttle Position', 'Injector Pulsewidth',
  'Air Fuel Ratio', 'Lambda', 'Manifold Absolute Pressure',
  'Vehicle Speed', 'Coolant Temperature', 'Ignition Timing',
  'Horsepower', 'Torque', 'Power'
];

for (const ch of knownChannels) {
  const idx = text.indexOf(ch);
  if (idx >= 0) {
    // Read surrounding context
    const start = Math.max(0, idx - 5);
    const end = Math.min(text.length, idx + ch.length + 50);
    const context = text.substring(idx, end).replace(/[^\x20-\x7E]/g, '|');
    console.log(`  Found "${ch}" at offset ${idx}: "${context}"`);
  }
}

// Let's also look for the specific channels
const specificChannels = [
  'Injector Pulsewidth Final',
  'Injector Pulsewidth Desired',
  'Injector Duty Cycle',
  'Alpha N',
  'Short Term Fuel Trim',
  'ID1050',
  'PPEI',
];

console.log('\n--- Specific channel search ---');
for (const ch of specificChannels) {
  const idx = text.indexOf(ch);
  if (idx >= 0) {
    const context = text.substring(idx, Math.min(text.length, idx + 60)).replace(/[^\x20-\x7E]/g, '|');
    console.log(`  Found "${ch}" at offset ${idx}: "${context}"`);
  } else {
    console.log(`  NOT FOUND: "${ch}"`);
  }
}

// Look at the filename metadata
console.log('\n--- File metadata search ---');
const metaStrings = ['ID1050', 'RACETUNE', 'PPEI', 'Rev', 'StockIntake', 'Belmouth'];
for (const ms of metaStrings) {
  const idx = text.indexOf(ms);
  if (idx >= 0) {
    const start = Math.max(0, idx - 20);
    const end = Math.min(text.length, idx + ms.length + 40);
    const context = text.substring(start, end).replace(/[^\x20-\x7E]/g, '|');
    console.log(`  Found "${ms}" at offset ${idx}: "${context}"`);
  }
}

// Try to find the sample rate and data section
console.log('\n--- Looking for numeric patterns (sample rate, channel count) ---');
// Read first 500 bytes as uint16 values
for (let i = 0; i < 100; i += 2) {
  const val = view.getUint16(i, true);
  if (val > 0 && val < 200) {
    // Could be channel count
  }
}

// Look for the note/name field that contains injector info
const notePatterns = ['Note', 'Name', 'Title', 'Description', 'Comment'];
for (const np of notePatterns) {
  let searchIdx = 0;
  while (true) {
    const idx = text.indexOf(np, searchIdx);
    if (idx < 0 || idx > 5000) break;
    const context = text.substring(idx, Math.min(text.length, idx + 80)).replace(/[^\x20-\x7E]/g, '|');
    console.log(`  Found "${np}" at offset ${idx}: "${context}"`);
    searchIdx = idx + np.length;
  }
}

// Let's count all channel names by looking for the pattern
console.log('\n--- All channel names (scanning for readable strings > 5 chars) ---');
let currentString = '';
let stringStart = -1;
const allStrings = [];

for (let i = 0; i < Math.min(buf.length, 10000); i++) {
  const c = buf[i];
  if (c >= 32 && c < 127) {
    if (currentString === '') stringStart = i;
    currentString += String.fromCharCode(c);
  } else {
    if (currentString.length >= 8) {
      allStrings.push({ offset: stringStart, text: currentString });
    }
    currentString = '';
  }
}

// Print unique strings that look like channel names
const seen = new Set();
for (const s of allStrings) {
  if (!seen.has(s.text) && s.text.length > 8) {
    seen.add(s.text);
    console.log(`  [${s.offset}] "${s.text}"`);
  }
}
