/**
 * Test E86B Segment Header Scanning
 * Verifies that the dynamic header scanner finds all 8 segment headers
 * in the E86B-12660477 binary files.
 */
import { readFileSync } from 'fs';

const BIN_PATH = '/home/ubuntu/upload/E86B-12660477_EFILive_Editable.bin';
const BIN2_PATH = '/home/ubuntu/upload/E86B-12660477_EFILive_30hp_cp3.bin';

// Replicate the scanSegmentHeaders logic from binaryParser.ts
function scanSegmentHeaders(data) {
  const segments = [];
  const MAGIC_55AA = 0x0055AAFF;
  const MAGIC_AFAF = 0xAFAFAFAF;
  
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const len = data.byteLength;
  
  // Scan for 0055AAFF 0055AAFF double-magic headers
  for (let off = 0; off < len - 32; off += 0x10) {
    if (off + 32 > len) break;
    const w0 = view.getUint32(off, true);
    const w1 = view.getUint32(off + 4, true);
    
    if (w0 === MAGIC_55AA && w1 === MAGIC_55AA) {
      // Extract part number from offset+0x0D as ASCII
      let pn = '';
      for (let j = 0; j < 9; j++) {
        const ch = data[off + 0x0D + j];
        if (ch >= 0x30 && ch <= 0x39) pn += String.fromCharCode(ch);
        else if (ch >= 0x41 && ch <= 0x5A) pn += String.fromCharCode(ch);
        else break;
      }
      // Strip leading 'A' prefix if present
      if (pn.startsWith('A') && pn.length === 9) pn = pn.substring(1);
      
      segments.push({
        type: '0055AAFF',
        offset: off,
        offsetHex: '0x' + off.toString(16).toUpperCase(),
        partNumber: pn || 'unknown',
      });
    }
  }
  
  // Scan for AFAFAFAF headers
  for (let off = 0; off < len - 32; off += 0x10) {
    if (off + 32 > len) break;
    const w0 = view.getUint32(off, true);
    
    if (w0 === MAGIC_AFAF) {
      // Check it's not already found as 0055AAFF
      const alreadyFound = segments.some(s => Math.abs(s.offset - off) < 0x100);
      if (alreadyFound) continue;
      
      // Extract part number
      let pn = '';
      for (let j = 0; j < 9; j++) {
        const ch = data[off + 0x0D + j];
        if (ch >= 0x30 && ch <= 0x39) pn += String.fromCharCode(ch);
        else if (ch >= 0x41 && ch <= 0x5A) pn += String.fromCharCode(ch);
        else break;
      }
      if (pn.startsWith('A') && pn.length === 9) pn = pn.substring(1);
      
      segments.push({
        type: 'AFAFAFAF',
        offset: off,
        offsetHex: '0x' + off.toString(16).toUpperCase(),
        partNumber: pn || 'unknown',
      });
    }
  }
  
  // Sort by offset
  segments.sort((a, b) => a.offset - b.offset);
  return segments;
}

// Expected part numbers from our earlier analysis
const EXPECTED_PARTS = [
  '12657305', // Seg 1 (OS)
  '12660477', // Seg 2
  '12661604', // Seg 4
  '12659362', // Seg 5
  '12661785', // Seg 6
  '12659350', // Seg 7
  '12663190', // Seg 8
  '12661769', // Seg 9
];

console.log('=== Testing E86B Segment Header Scanning ===\n');

for (const path of [BIN_PATH, BIN2_PATH]) {
  const filename = path.split('/').pop();
  console.log(`\n--- ${filename} ---`);
  
  try {
    const data = new Uint8Array(readFileSync(path));
    console.log(`File size: ${data.byteLength} bytes (${(data.byteLength / 1024).toFixed(0)} KB)`);
    
    const segments = scanSegmentHeaders(data);
    console.log(`Found ${segments.length} segment headers:`);
    
    for (const seg of segments) {
      const isExpected = EXPECTED_PARTS.includes(seg.partNumber);
      console.log(`  ${seg.offsetHex} [${seg.type}] PN: ${seg.partNumber} ${isExpected ? '✓' : '?'}`);
    }
    
    // Check coverage
    const foundParts = new Set(segments.map(s => s.partNumber));
    const missing = EXPECTED_PARTS.filter(p => !foundParts.has(p));
    if (missing.length === 0) {
      console.log(`\n  ALL ${EXPECTED_PARTS.length} expected part numbers found!`);
    } else {
      console.log(`\n  MISSING ${missing.length} part numbers: ${missing.join(', ')}`);
    }
  } catch (e) {
    console.log(`  Error: ${e.message}`);
  }
}

console.log('\n=== Test Complete ===');
