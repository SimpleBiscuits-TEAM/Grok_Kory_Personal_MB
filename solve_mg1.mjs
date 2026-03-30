/**
 * MG1 DEADBEEF Multi-Segment Solver
 * 
 * Key findings from segment 2 header:
 *   hdr+0x150: 0x09440100 (flash start of this segment)
 *   hdr+0x154: 0x09484957 (flash end of this segment)
 *   hdr+0x10C: 0x09440208 (another reference)
 *   hdr+0x16c: 0x09440200 (another reference)
 *   hdr+0x210: 0x09440220 (another reference)
 * 
 * Segment 2 flash range: 0x09440100 - 0x09484957
 * A2L map range:          0x0944028C - 0x09482382
 * These overlap! So ALL calibration maps are in segment 2.
 * 
 * Segment 2 file location: starts at 0x468000
 * Segment 2 header size: 0x100 bytes (first non-zero data at +0x100)
 * But the header extends to at least +0x400 with structured data.
 * 
 * The actual DATA in segment 2 must start after the header.
 * We need to find: at what file offset does the flash address 0x09440100 begin?
 * 
 * Strategy: Try different header sizes and verify against known map values.
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

const seg2Start = 0x468000;
const seg2FlashStart = 0x09440100;
const seg2FlashEnd = 0x09484957;

// AirPah_ratMAirEngInNom_5253 is at A2L address 0x9464588
// WinOLS shows values: 0.92, 0.95, 1, 1, 1, ...
// The first value should be float32 = 0.92

const testMaps = [
  { name: 'AirPah_ratMAirEngInNom_5253', addr: 0x9464588, expectedFirst: 0.92 },
];

// The flash start is 0x09440100. If data starts at file offset X,
// then: file_offset = flash_addr - 0x09440100 + X
// For AirPah: file_offset = 0x9464588 - 0x09440100 + X = 0x24488 + X

console.log('=== MG1 Segment 2 Base Address Solver ===\n');

// Scan through possible data start offsets within segment 2
// The header is at seg2Start (0x468000), data starts somewhere after
console.log('Testing data start offsets within segment 2:');
console.log('(flash_start = 0x09440100)\n');

// Let's be more systematic: scan every 0x10 bytes from seg2Start+0x200 to seg2Start+0x1000
// and check if AirPah value at the computed offset matches 0.92
const results = [];
for (let dataStart = seg2Start + 0x200; dataStart <= seg2Start + 0x1000; dataStart += 0x10) {
  const airOff = 0x9464588 - seg2FlashStart + dataStart;
  if (airOff >= 0 && airOff < binData.length - 4) {
    const val = dv.getFloat32(airOff, false);
    if (Math.abs(val - 0.92) < 0.01) {
      results.push({ dataStart, airOff, val, hdrSize: dataStart - seg2Start });
    }
  }
}

if (results.length > 0) {
  console.log('MATCHES FOUND:');
  for (const r of results) {
    console.log(`  Data starts at seg2+0x${r.hdrSize.toString(16)} (file 0x${r.dataStart.toString(16)})`);
    console.log(`  AirPah at file 0x${r.airOff.toString(16)} = ${r.val}`);
    console.log(`  Effective base = flash_start - data_start = 0x${(seg2FlashStart - r.dataStart).toString(16).toUpperCase()}`);
    console.log();
  }
} else {
  console.log('No exact match for AirPah=0.92. Scanning wider...');
  // Try wider scan and show closest matches
  const wider = [];
  for (let dataStart = seg2Start; dataStart <= seg2Start + 0x2000; dataStart += 0x4) {
    const airOff = 0x9464588 - seg2FlashStart + dataStart;
    if (airOff >= 0 && airOff < binData.length - 4) {
      const val = dv.getFloat32(airOff, false);
      if (val > 0.5 && val < 1.5) {
        wider.push({ dataStart, airOff, val, hdrSize: dataStart - seg2Start });
      }
    }
  }
  console.log(`Found ${wider.length} candidates with AirPah in [0.5, 1.5]:`);
  for (const r of wider.slice(0, 20)) {
    console.log(`  seg2+0x${r.hdrSize.toString(16)}: AirPah=${r.val.toFixed(4)} (file 0x${r.airOff.toString(16)})`);
  }
}

// Also try: maybe the flash addresses in the header are NOT the data start.
// Maybe the data is contiguous from the beginning of the segment (after DEADBEEF magic).
// In that case, the "base" for this segment would be:
// base = seg2FlashStart - (seg2Start + headerSize)
// And we need to find headerSize such that AirPah maps correctly.

console.log('\n=== Alternative: Direct base computation ===');
// We know AirPah is at file 0x484570 (from WinOLS analysis)
// and flash addr 0x9464588
// So: base = 0x9464588 - 0x484570 = 0x08FE0018
// With this base, seg2FlashStart (0x09440100) maps to file: 0x09440100 - 0x08FE0018 = 0x4600E8
// But seg2 starts at 0x468000, which is AFTER 0x4600E8!
// So with base 0x08FE0018, the flash range 0x09440100-0x09445FFF maps to files BEFORE seg2.
// This means part of the calibration data is in segment 1!

console.log('With base 0x08FE0018:');
console.log(`  Flash 0x09440100 → file 0x${(0x09440100 - 0x08FE0018).toString(16)}`);
console.log(`  Flash 0x09448000 → file 0x${(0x09448000 - 0x08FE0018).toString(16)}`);
console.log(`  Flash 0x09464588 → file 0x${(0x09464588 - 0x08FE0018).toString(16)}`);
console.log(`  Flash 0x09484957 → file 0x${(0x09484957 - 0x08FE0018).toString(16)}`);
console.log(`  Seg2 starts at file 0x468000 → flash 0x${(0x468000 + 0x08FE0018).toString(16).toUpperCase()}`);

// So with base 0x08FE0018:
// - Flash 0x09440100-0x094460E7 → file 0x4600E8-0x467FFF (end of seg1 + gap)
// - Flash 0x094480018 → file 0x468000 (start of seg2)
// But seg2 has a header! So the data doesn't start at 0x468000.

// CRITICAL INSIGHT: The DEADBEEF container format means the file is NOT a flat dump.
// The segments have headers that must be STRIPPED to get the raw flash data.
// 
// The correct approach:
// 1. Parse each segment's header to find: flash_start, flash_end, data_offset_in_segment
// 2. Build a virtual flat image where flash addresses map to data bytes
// 3. Use a single base of 0 against this virtual image (since flash addrs are absolute)

// Let's figure out where the actual calibration data starts in segment 2
// by looking at the data patterns

console.log('\n=== Segment 2 Data Pattern Analysis ===');
// The header has structured data up to ~0x400. After that, it should be calibration data.
// Let's check what's at seg2+0x400 onwards
for (let off = 0x400; off < 0x500; off += 0x10) {
  const absOff = seg2Start + off;
  const hex = [];
  const floats = [];
  for (let j = 0; j < 16; j += 4) {
    const f = dv.getFloat32(absOff + j, false);
    floats.push(f.toFixed(4));
    for (let k = 0; k < 4; k++) {
      hex.push(binData[absOff + j + k].toString(16).padStart(2, '0'));
    }
  }
  console.log(`  seg2+0x${off.toString(16)}: ${hex.join(' ')}  floats: ${floats.join(', ')}`);
}

// Let's also check: what if the header is exactly 0x200 bytes?
// Then data starts at seg2+0x200 = file 0x468200
// And flash 0x09440100 maps to file 0x468200
// So base = 0x09440100 - 0x468200 = 0x08FD7F00
// Wait! That's the base we computed before!
// Let's verify:
console.log('\n=== Testing base 0x08FD7F00 (header=0x200) ===');
const base_7F00 = 0x08FD7F00;
const airOff_7F00 = 0x9464588 - base_7F00;
console.log(`AirPah at file 0x${airOff_7F00.toString(16)}: ${dv.getFloat32(airOff_7F00, false)}`);

// And with header=0x400?
console.log('\n=== Testing base with header=0x400 ===');
// base = 0x09440100 - (seg2Start + 0x400) = 0x09440100 - 0x468400 = 0x08FD7D00
const base_7D00 = 0x09440100 - (seg2Start + 0x400);
const airOff_7D00 = 0x9464588 - base_7D00;
console.log(`Base: 0x${base_7D00.toString(16).toUpperCase()}`);
console.log(`AirPah at file 0x${airOff_7D00.toString(16)}: ${dv.getFloat32(airOff_7D00, false)}`);

// Let's try many header sizes and find which gives AirPah ≈ 0.92
console.log('\n=== Brute force: find header size that gives AirPah ≈ 0.92 ===');
for (let hdrSize = 0; hdrSize <= 0x2000; hdrSize += 4) {
  const base = seg2FlashStart - (seg2Start + hdrSize);
  const airOff = 0x9464588 - base;
  if (airOff >= 0 && airOff < binData.length - 4) {
    const val = dv.getFloat32(airOff, false);
    if (Math.abs(val - 0.92) < 0.005) {
      console.log(`  hdrSize=0x${hdrSize.toString(16)}: base=0x${base.toString(16).toUpperCase()}, AirPah=${val.toFixed(6)}`);
    }
  }
}

// Also verify: with the correct base, check multiple maps
console.log('\n=== Multi-map verification with base 0x08FE0018 ===');
const base_0018 = 0x08FE0018;
const verifyMaps = [
  { name: 'AirPah_ratMAirEngInNom_5253', addr: 0x9464588, expected: [0.92, 0.95, 1, 1, 1] },
  { name: 'First A2L map', addr: 0x0944028C, expected: null },
];
for (const m of verifyMaps) {
  const off = m.addr - base_0018;
  console.log(`\n${m.name} @ flash 0x${m.addr.toString(16)} → file 0x${off.toString(16)}:`);
  if (off >= 0 && off < binData.length - 20) {
    const vals = [];
    for (let i = 0; i < 5; i++) {
      vals.push(dv.getFloat32(off + i * 4, false).toFixed(4));
    }
    console.log(`  Values: ${vals.join(', ')}`);
    if (off >= seg2Start) {
      console.log(`  (In segment 2, offset from seg2 start: 0x${(off - seg2Start).toString(16)})`);
    } else if (off >= 0x2AFBC0 && off < seg2Start) {
      console.log(`  (In the GAP region! This data is 0xFF)`);
    } else {
      console.log(`  (In segment 1)`);
    }
  } else {
    console.log(`  OUT OF BOUNDS`);
  }
}

// KEY QUESTION: With base 0x08FE0018, the first ~1218 maps fall in the gap.
// But maybe those maps' data is actually in segment 1 (before the gap)?
// Let's check: what's at file offset 0x460274 (first map with base 0x08FE0018)?
console.log('\n=== Checking gap region data ===');
const firstMapOff = 0x0944028C - base_0018;
console.log(`First A2L map (0x944028C) → file 0x${firstMapOff.toString(16)}`);
for (let i = firstMapOff; i < firstMapOff + 20 && i < binData.length; i += 4) {
  console.log(`  0x${i.toString(16)}: raw=0x${dv.getUint32(i, false).toString(16).padStart(8, '0')} float=${dv.getFloat32(i, false)}`);
}

// Check if the gap is truly all 0xFF
let gapStart = 0x2AFBC0;
let gapEnd = 0x468000;
let allFF = true;
let firstNonFF = -1;
for (let i = gapStart; i < gapEnd; i++) {
  if (binData[i] !== 0xFF) {
    allFF = false;
    if (firstNonFF === -1) firstNonFF = i;
  }
}
console.log(`\nGap 0x${gapStart.toString(16)}-0x${gapEnd.toString(16)}: all 0xFF? ${allFF}`);
if (!allFF) {
  console.log(`First non-0xFF in gap: 0x${firstNonFF.toString(16)}`);
}

// REVELATION: If the gap is truly all 0xFF, then the first 1218 maps
// with base 0x08FE0018 would read garbage. This means base 0x08FE0018
// is WRONG for those maps.
//
// The correct interpretation must be:
// The binary has TWO segments with DIFFERENT base addresses, OR
// the binary needs to be "decompiled" by removing the gap.
//
// Let's try the decompilation approach:
// Remove the gap (0x2AFBC0-0x467FFF) and stitch seg1 data + seg2 data together.
// Then find a single base for the stitched image.

console.log('\n=== Decompilation approach: stitch segments ===');
const seg1DataEnd = 0x2AFBC0; // end of actual data in segment 1
const seg2DataStart = seg2Start; // segment 2 starts here (includes its own header)

// But segment 2 has a header too. Let's figure out where its DATA starts.
// From the header analysis:
// - DEADBEEF at 0x468000
// - Structured header data from 0x468100 to 0x4683FF
// - At 0x468400, the data pattern changes
// Let's check what's at 0x468400:
console.log('Data at seg2+0x400:');
for (let i = 0; i < 20; i++) {
  const off = seg2Start + 0x400 + i * 4;
  const f = dv.getFloat32(off, false);
  const raw = dv.getUint32(off, false);
  console.log(`  0x${off.toString(16)}: raw=0x${raw.toString(16).padStart(8, '0')} float=${f.toFixed(6)}`);
}

// And what's at seg2+0x200:
console.log('\nData at seg2+0x200:');
for (let i = 0; i < 10; i++) {
  const off = seg2Start + 0x200 + i * 4;
  const f = dv.getFloat32(off, false);
  const raw = dv.getUint32(off, false);
  console.log(`  0x${off.toString(16)}: raw=0x${raw.toString(16).padStart(8, '0')} float=${f.toFixed(6)}`);
}

// FINAL APPROACH: Instead of guessing, let's use the segment header's flash range.
// Segment 2 header says: flash 0x09440100 to 0x09484957
// Size of flash data: 0x09484957 - 0x09440100 + 1 = 0x44858 = 280,664 bytes
// Segment 2 file region: 0x468000 to 0x4B7FFF = 0x50000 = 327,680 bytes
// So the header takes: 327,680 - 280,664 = 47,016 bytes ≈ 0xB7B8
// That's a LOT of header. But wait, the segment might not fill the entire region.

const flashSize = seg2FlashEnd - seg2FlashStart + 1;
const fileRegionSize = 0x4B8000 - seg2Start;
const headerSize = fileRegionSize - flashSize;
console.log(`\nFlash data size: 0x${flashSize.toString(16)} (${flashSize} bytes)`);
console.log(`File region size: 0x${fileRegionSize.toString(16)} (${fileRegionSize} bytes)`);
console.log(`Implied header size: 0x${headerSize.toString(16)} (${headerSize} bytes)`);

// Actually, the segment might not extend to 0x4B8000. Let's find where data ends.
let seg2DataEnd = seg2Start;
for (let i = 0x4B7FFF; i >= seg2Start; i--) {
  if (binData[i] !== 0xFF) {
    seg2DataEnd = i + 1;
    break;
  }
}
console.log(`Segment 2 actual data ends at: 0x${seg2DataEnd.toString(16)}`);
const actualDataSize = seg2DataEnd - seg2Start;
const actualHdrSize = actualDataSize - flashSize;
console.log(`Actual segment 2 size: 0x${actualDataSize.toString(16)} (${actualDataSize} bytes)`);
console.log(`Actual header size: 0x${actualHdrSize.toString(16)} (${actualHdrSize} bytes)`);

// So: data_start_in_file = seg2Start + actualHdrSize
// base = seg2FlashStart - (seg2Start + actualHdrSize)
if (actualHdrSize > 0) {
  const computedBase = seg2FlashStart - (seg2Start + actualHdrSize);
  const testAirOff = 0x9464588 - computedBase;
  console.log(`\nComputed base: 0x${computedBase.toString(16).toUpperCase()}`);
  console.log(`AirPah at file 0x${testAirOff.toString(16)}: ${dv.getFloat32(testAirOff, false)}`);
}

// Let's also try: the header is 0x200 bytes (common Bosch pattern)
// Then data starts at 0x468200
// base = 0x09440100 - 0x468200 = 0x08FD7F00
// AirPah: 0x9464588 - 0x08FD7F00 = 0x48C688
console.log('\n=== Testing header=0x200 (base=0x08FD7F00) ===');
const testOff = 0x9464588 - 0x08FD7F00;
console.log(`AirPah at file 0x${testOff.toString(16)}: ${dv.getFloat32(testOff, false)}`);
// Check 5 values
const vals200 = [];
for (let i = 0; i < 10; i++) {
  vals200.push(dv.getFloat32(testOff + i * 4, false).toFixed(4));
}
console.log(`First 10 values: ${vals200.join(', ')}`);

// And header=0x100
console.log('\n=== Testing header=0x100 (base=0x08FD8000) ===');
const base100 = seg2FlashStart - (seg2Start + 0x100);
const testOff100 = 0x9464588 - base100;
console.log(`Base: 0x${base100.toString(16).toUpperCase()}`);
console.log(`AirPah at file 0x${testOff100.toString(16)}: ${dv.getFloat32(testOff100, false)}`);
const vals100 = [];
for (let i = 0; i < 10; i++) {
  vals100.push(dv.getFloat32(testOff100 + i * 4, false).toFixed(4));
}
console.log(`First 10 values: ${vals100.join(', ')}`);
