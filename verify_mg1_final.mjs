/**
 * MG1 DEADBEEF Multi-Segment Verification
 * Tests the correct base address (0x08FE0018) against the actual binary and A2L
 * to verify maps display correctly matching WinOLS.
 */
import { readFileSync } from 'fs';

const binPath = '/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin';
const a2lPath = '/home/ubuntu/duramax_analyzer/test_files/1E1101953.a2l';

const binData = readFileSync(binPath);
const a2lText = readFileSync(a2lPath, 'utf-8');

const BASE = 0x08FE0018;
const fileSize = binData.length;

console.log(`Binary: ${fileSize} bytes (0x${fileSize.toString(16)})`);
console.log(`Base: 0x${BASE.toString(16).toUpperCase()}`);
console.log();

// Parse a subset of CHARACTERISTIC entries from the A2L
const charRegex = /\/begin\s+CHARACTERISTIC\s+(\S+)\s+"([^"]*)"\s+(\S+)\s+0x([0-9A-Fa-f]+)/g;
const maps = [];
let match;
while ((match = charRegex.exec(a2lText)) !== null) {
  maps.push({
    name: match[1],
    desc: match[2],
    type: match[3],
    addr: parseInt(match[4], 16),
  });
}
console.log(`Parsed ${maps.length} CHARACTERISTICs from A2L`);

// Categorize maps by where they fall in the binary
let inSegment2 = 0;
let inGap = 0;
let outOfRange = 0;

for (const m of maps) {
  const fileOff = m.addr - BASE;
  if (fileOff < 0 || fileOff >= fileSize) {
    outOfRange++;
  } else if (fileOff >= 0x468000 && fileOff < 0x4B8000) {
    inSegment2++;
  } else if (fileOff >= 0x2AFBC0 && fileOff < 0x468000) {
    inGap++;
  }
}

console.log(`Maps in Segment 2 (valid data): ${inSegment2}`);
console.log(`Maps in Gap (0xFF fill): ${inGap}`);
console.log(`Maps out of range: ${outOfRange}`);
console.log();

// Test specific maps that should match WinOLS
const testMaps = [
  { name: 'AirPah_ratMAirEngInNom_5253', addr: 0x9464588, expected: [0.92, 0.95, 1.0, 1.0] },
];

// Find a few more maps in the A2L that are in segment 2
const seg2Maps = maps.filter(m => {
  const off = m.addr - BASE;
  return off >= 0x468000 && off < 0x4B0000;
}).slice(0, 20);

console.log('=== Sample maps in Segment 2 ===');
for (const m of seg2Maps) {
  const fileOff = m.addr - BASE;
  // Read first 8 bytes as float32 LE
  const vals = [];
  for (let i = 0; i < 4; i++) {
    const off = fileOff + i * 4;
    if (off + 4 <= fileSize) {
      const buf = Buffer.from(binData.slice(off, off + 4));
      vals.push(buf.readFloatLE(0));
    }
  }
  const isValid = vals.some(v => !isNaN(v) && Math.abs(v) < 1e10 && v !== 0);
  console.log(`  ${m.name} @ 0x${m.addr.toString(16)} → file 0x${fileOff.toString(16)} [${isValid ? 'VALID' : 'INVALID'}]`);
  if (isValid) {
    console.log(`    Values: ${vals.map(v => v.toFixed(4)).join(', ')}`);
  }
}

console.log();

// Test the specific map from WinOLS screenshot
console.log('=== WinOLS Verification: AirPah_ratMAirEngInNom_5253 ===');
const airPahAddr = 0x9464588;
const airPahFileOff = airPahAddr - BASE;
console.log(`  A2L addr: 0x${airPahAddr.toString(16)}`);
console.log(`  File offset: 0x${airPahFileOff.toString(16)}`);

// Read first row (18 float32 values) - WinOLS shows 20x30 map
const row0 = [];
for (let i = 0; i < 18; i++) {
  const off = airPahFileOff + i * 4;
  const buf = Buffer.from(binData.slice(off, off + 4));
  row0.push(buf.readFloatLE(0));
}
console.log(`  Row 0: ${row0.map(v => v.toFixed(2)).join(', ')}`);
console.log(`  Expected (WinOLS): 0.92, 0.95, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00`);

// Check if values match
const expectedRow0 = [0.92, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
let allMatch = true;
for (let i = 0; i < expectedRow0.length; i++) {
  if (Math.abs(row0[i] - expectedRow0[i]) > 0.01) {
    allMatch = false;
    console.log(`  MISMATCH at col ${i}: got ${row0[i].toFixed(4)}, expected ${expectedRow0[i].toFixed(4)}`);
  }
}
if (allMatch) {
  console.log('  ✅ ALL VALUES MATCH WINOLS!');
}

// Now check: what does the current editor engine compute as the base?
// The DEADBEEF header is at offset 0x0 of the file
console.log();
console.log('=== DEADBEEF Header Analysis ===');
const magic = binData.readUInt32BE(0);
console.log(`  Magic at 0x0: 0x${magic.toString(16).toUpperCase()} ${magic === 0xDEADBEEF ? '(DEADBEEF ✅)' : '(NOT DEADBEEF)'}`);

// Check for second DEADBEEF at segment 2
const seg2Start = 0x468000;
if (seg2Start + 4 <= fileSize) {
  const magic2 = binData.readUInt32BE(seg2Start);
  console.log(`  Magic at 0x${seg2Start.toString(16)}: 0x${magic2.toString(16).toUpperCase()} ${magic2 === 0xDEADBEEF ? '(DEADBEEF ✅)' : '(NOT DEADBEEF)'}`);
}

// Parse the DEADBEEF header to find flash addresses
console.log();
console.log('=== Segment 2 DEADBEEF Header ===');
// Read flash address range from header
for (let off = seg2Start; off < seg2Start + 0x400; off += 4) {
  const val = binData.readUInt32BE(off);
  // Look for addresses in the 0x0944xxxx range
  if (val >= 0x09440000 && val <= 0x09490000) {
    console.log(`  0x${off.toString(16)}: 0x${val.toString(16).toUpperCase()}`);
  }
}

// The key question: how does the editor currently compute the base?
// It uses generateDEADBEEFCandidateBases which tries headerSize from 0x80 to 0x6000
// For this binary: base = flashAddr - headerSize
// The DEADBEEF header at 0x0 has flash addresses in the 0x08FDxxxx range
// Let's find them
console.log();
console.log('=== Segment 1 DEADBEEF Header Flash Addresses ===');
for (let off = 0; off < 0x400; off += 4) {
  const val = binData.readUInt32BE(off);
  if (val >= 0x08F00000 && val <= 0x09000000) {
    console.log(`  0x${off.toString(16)}: 0x${val.toString(16).toUpperCase()}`);
  }
}

// Summary
console.log();
console.log('=== SUMMARY ===');
console.log(`Correct base for this binary: 0x${BASE.toString(16).toUpperCase()}`);
console.log(`Maps with valid data (in segment 2): ${inSegment2} / ${maps.length}`);
console.log(`Maps in gap (no data): ${inGap}`);
console.log(`Maps out of range: ${outOfRange}`);
console.log(`AirPah_ratMAirEngInNom row 0 matches WinOLS: ${allMatch}`);
