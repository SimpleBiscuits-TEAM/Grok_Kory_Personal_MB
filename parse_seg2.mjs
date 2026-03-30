/**
 * Parse the second DEADBEEF segment at file offset 0x468000.
 * This segment contains the calibration data.
 * 
 * We need to find:
 * 1. The segment's flash base address
 * 2. The data start offset within the segment
 * 3. The correct base for mapping A2L addresses to file offsets
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

const seg2Start = 0x468000;
console.log('=== Segment 2 Header Analysis ===');
console.log(`Segment 2 starts at file offset: 0x${seg2Start.toString(16)}`);

// Dump the header
console.log('\nHeader dump (first 0x400 bytes):');
for (let row = 0; row < 64; row++) {
  const off = seg2Start + row * 16;
  const hex = [];
  const ascii = [];
  for (let j = 0; j < 16; j++) {
    const b = binData[off + j];
    hex.push(b.toString(16).padStart(2, '0'));
    ascii.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${off.toString(16).padStart(6, '0')}: ${hex.join(' ')}  ${ascii.join('')}`);
}

// Look for flash addresses in the header
console.log('\n\nFlash addresses in segment 2 header:');
for (let off = seg2Start; off < seg2Start + 0x400; off += 4) {
  const val = dv.getUint32(off, false);
  if (val >= 0x08000000 && val <= 0x09FFFFFF) {
    console.log(`  [0x${off.toString(16)}] (hdr+0x${(off - seg2Start).toString(16)}): 0x${val.toString(16).toUpperCase()}`);
  }
}

// The segment header should tell us the flash base address
// Common DEADBEEF format: magic(4) + segment_info + flash_start + flash_end

// Let's check specific offsets
console.log('\n\nKey header values:');
for (let off = 0; off < 0x200; off += 4) {
  const val = dv.getUint32(seg2Start + off, false);
  if (val !== 0) {
    console.log(`  hdr+0x${off.toString(16).padStart(3, '0')}: 0x${val.toString(16).toUpperCase().padStart(8, '0')} (${val})`);
  }
}

// Now find where the actual data starts in segment 2
// (first non-zero, non-header byte after the header region)
let dataStart = seg2Start + 0x100; // minimum header size
for (let i = seg2Start + 0x100; i < seg2Start + 0x1000; i++) {
  // Look for the transition from header to data
  // The header typically has structured entries, while data is more random
  if (binData[i] !== 0x00 && binData[i] !== 0xFF) {
    // Check if this looks like data (not a flash address)
    const val = dv.getUint32(i, false);
    if (val < 0x08000000 || val > 0x09FFFFFF) {
      // Could be data - but let's look for a clear boundary
    }
  }
}

// Let's try: if the segment 2 header is similar to segment 1 header,
// the data starts at seg2Start + 0x200 or seg2Start + 0x400
console.log('\n\nTesting data start positions:');
for (const dataOff of [0x100, 0x120, 0x140, 0x200, 0x400]) {
  const absOff = seg2Start + dataOff;
  // If data starts here, and the first map is at flash 0x944028C,
  // then base = 0x944028C - (absOff - seg2Start) ... no wait
  // base = 0x944028C - absOff (absolute file offset)
  // But actually, the maps might not start at the very beginning of data
  
  // Let's compute: what base makes AirPah (0x9464588) point to file 0x484570?
  // base = 0x9464588 - 0x484570 = 0x08FE0018
  // This is independent of the segment header.
  
  // The question is: what base makes the FIRST map (0x944028C) point to
  // valid data within segment 2?
  // With base 0x08FE0018: 0x944028C - 0x08FE0018 = 0x460274
  // But 0x460274 < 0x468000 (segment 2 start), so it's in the gap!
  
  // So the first map's data is NOT in segment 2 with base 0x08FE0018.
  // It must be in segment 1 (before the gap).
  
  // Let's check: with base 0x08FE0018, the first post-gap map is at:
  // file offset >= 0x468000
  // flash addr >= 0x468000 + 0x08FE0018 = 0x09448018
  
  console.log(`  Data at seg2+0x${dataOff.toString(16)}: flash addr for this = 0x${(absOff + 0x08FE0018).toString(16).toUpperCase()}`);
}

// KEY INSIGHT: With base 0x08FE0018:
// - Segment 2 data starts at file 0x468000 → flash 0x09448018
// - But segment 2 has its own DEADBEEF header (0x468000-0x468100?)
// - So actual data starts at 0x468100 or later → flash 0x09448118+
// - The first post-gap map is at flash 0x094481xx
// - The gap maps are at flash 0x944028C-0x9447FDC → file 0x460274-0x467FC4

// The gap maps' file offsets (0x460274-0x467FC4) are BEFORE segment 2 (0x468000).
// They should be in segment 1's data region.
// Let's check: is the data at file 0x460274 valid?
console.log('\n\nData at gap map file offsets:');
for (let off = 0x460274; off < 0x460294; off += 4) {
  const v = dv.getFloat32(off, false);
  const raw = dv.getUint32(off, false);
  console.log(`  0x${off.toString(16)}: raw=0x${raw.toString(16).padStart(8, '0')} float=${v}`);
}

// These are in the gap (0xFF)! So base 0x08FE0018 doesn't work for gap maps.
// The gap maps need a different base, or the binary needs to be "decompiled"
// by removing the gap and stitching the segments together.

// SOLUTION: Build a virtual flash image by:
// 1. Parse segment 1 header to get its flash range
// 2. Parse segment 2 header to get its flash range
// 3. Map each segment's data to the correct flash addresses
// 4. Create a flat buffer where A2L addresses map directly

// Let's first understand segment 1's header
console.log('\n\n=== Segment 1 Header Flash Addresses ===');
for (let off = 0; off < 0x400; off += 4) {
  const val = dv.getUint32(off, false);
  if (val >= 0x08000000 && val <= 0x09FFFFFF) {
    console.log(`  hdr+0x${off.toString(16).padStart(3, '0')}: 0x${val.toString(16).toUpperCase()}`);
  }
}

// From previous analysis, segment 1 header has:
// 0x104: 0x08FF56F0
// 0x108: 0x09000000
// 0x10C: 0x08FD8168
// 0x150: 0x08FD8100 (flash start)
// 0x154: 0x08FF5C07 (flash end)
// 0x15C: 0x08FF5C08

// Segment 1 flash range: 0x08FD8100 to 0x08FF5C07
// Size: 0x1DB07 = 121,607 bytes
// But segment 1 data is much larger (0x400 to 0x2AFBC0 = 2,816,960 bytes)
// So segment 1 contains more than just the declared flash range.

// Let's check segment 2's flash range
console.log('\n\n=== Segment 2 Flash Range ===');
// Look for the same pattern as segment 1: flash start at hdr+0x150, end at hdr+0x154
const seg2FlashStart = dv.getUint32(seg2Start + 0x150, false);
const seg2FlashEnd = dv.getUint32(seg2Start + 0x154, false);
console.log(`Seg2 hdr+0x150: 0x${seg2FlashStart.toString(16).toUpperCase()}`);
console.log(`Seg2 hdr+0x154: 0x${seg2FlashEnd.toString(16).toUpperCase()}`);

// Also check other positions
const seg2_104 = dv.getUint32(seg2Start + 0x104, false);
const seg2_108 = dv.getUint32(seg2Start + 0x108, false);
const seg2_10C = dv.getUint32(seg2Start + 0x10C, false);
console.log(`Seg2 hdr+0x104: 0x${seg2_104.toString(16).toUpperCase()}`);
console.log(`Seg2 hdr+0x108: 0x${seg2_108.toString(16).toUpperCase()}`);
console.log(`Seg2 hdr+0x10C: 0x${seg2_10C.toString(16).toUpperCase()}`);

// Now let's try: if segment 2's flash start is at hdr+0x150,
// and the data starts right after the header,
// then base = flash_start - (seg2Start + header_size)

// First, find where segment 2's actual data begins
console.log('\n\nSegment 2 data region scan:');
for (let off = 0x100; off < 0x200; off += 0x10) {
  const absOff = seg2Start + off;
  const hex = [];
  for (let j = 0; j < 16; j++) {
    hex.push(binData[absOff + j].toString(16).padStart(2, '0'));
  }
  console.log(`  seg2+0x${off.toString(16)}: ${hex.join(' ')}`);
}

// Check if segment 2 has a shorter header
// Look for the first non-zero data after the header
let seg2DataStart = seg2Start;
for (let i = seg2Start + 4; i < seg2Start + 0x400; i++) {
  if (binData[i] !== 0x00) {
    seg2DataStart = i;
    break;
  }
}
console.log(`\nFirst non-zero byte in seg2: offset 0x${(seg2DataStart - seg2Start).toString(16)} (abs 0x${seg2DataStart.toString(16)})`);

// Actually, looking at the header dump, segment 2 might have a VERY short header
// (just the 4-byte DEADBEEF magic + some zeros).
// Let's check: if the header is just 0x100 bytes (or even less):

for (const hdrSize of [0x4, 0x8, 0x10, 0x20, 0x80, 0x100, 0x120, 0x140, 0x200]) {
  const dataAbsOff = seg2Start + hdrSize;
  const base = 0x944028C - (dataAbsOff - 0); // if first map data is right at data start
  // Actually, the first map might not be at the very start of the data.
  // Let's use AirPah as anchor: 0x9464588 at file 0x484570
  // base = 0x9464588 - 0x484570 = 0x08FE0018
  // With this base, first map at 0x944028C → file 0x460274
  // This is BEFORE seg2Start (0x468000), so it's in seg1 or the gap.
  
  // Alternative: maybe the base for segment 2 is different from segment 1.
  // If segment 2 data starts at seg2Start + hdrSize,
  // and the first A2L map in segment 2 starts at some flash address,
  // then base = first_flash_addr - (seg2Start + hdrSize)
  
  // But we don't know which maps are in segment 2 vs segment 1.
  // Let's try: if ALL maps are in segment 2 (since they're all calibration),
  // then base = 0x944028C - (seg2Start + hdrSize)
  const testBase = 0x944028C - (seg2Start + hdrSize);
  const airOff = 0x9464588 - testBase;
  let airVal = 'OOB';
  if (airOff >= 0 && airOff < binData.length - 4) {
    airVal = dv.getFloat32(airOff, false).toFixed(4);
  }
  console.log(`  hdrSize=0x${hdrSize.toString(16)}: base=0x${testBase.toString(16).toUpperCase()}, AirPah@0x${airOff.toString(16)}=${airVal}`);
}

// WAIT - let me reconsider. The DEADBEEF header at segment 2 might define
// the flash address where this segment's data should be loaded.
// If the header says "this segment contains flash 0x09440000",
// and the data starts at seg2Start + headerSize,
// then: file_offset = flash_addr - 0x09440000 + seg2Start + headerSize
// Or equivalently: base = 0x09440000 - seg2Start - headerSize

// Let's look for 0x0944xxxx in the segment 2 header
console.log('\n\nSearching for 0x0944xxxx in seg2 header:');
for (let off = 0; off < 0x400; off += 4) {
  const val = dv.getUint32(seg2Start + off, false);
  if (val >= 0x09400000 && val <= 0x094FFFFF) {
    console.log(`  hdr+0x${off.toString(16)}: 0x${val.toString(16).toUpperCase()}`);
  }
}

// Also search for 0x08FDxxxx and 0x08FFxxxx
console.log('\nSearching for 0x08FDxxxx-0x0900xxxx in seg2 header:');
for (let off = 0; off < 0x400; off += 4) {
  const val = dv.getUint32(seg2Start + off, false);
  if (val >= 0x08FD0000 && val <= 0x09100000) {
    console.log(`  hdr+0x${off.toString(16)}: 0x${val.toString(16).toUpperCase()}`);
  }
}
