/**
 * Reverse-engineer the DEADBEEF segment table.
 * 
 * Strategy: We know the map data for AirPah_ratMAirEngInNom is at file offset 0x484570
 * and its A2L address is 0x9464588. This gives us one anchor point.
 * 
 * We also know the header has flash addresses. Let's try to understand the
 * segment table format by:
 * 1. Finding multiple known data patterns in the file
 * 2. Computing the flash-to-file offset for each
 * 3. Identifying segment boundaries
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

// First, let's understand the header structure at 0x100-0x1CF more carefully
// The pattern seems to be: [flash_addr:u32] [data...] repeating
// Let's look at the structure around the key flash addresses

console.log('=== Detailed Header Structure Analysis ===');
console.log('\nSegment table at 0x100:');

// The first entry at 0x100:
// 02 00 00 50 = 0x02000050 (not a flash addr - could be flags/count)
// 08 FF 56 F0 = 0x08FF56F0 (flash addr)
// 09 00 00 00 = 0x09000000 (flash addr - end of region?)
// 08 FD 81 68 = 0x08FD8168 (flash addr)
// 01 01 08 01 = flags?
// FA FA FA FA... = padding

// Let's try a different interpretation:
// Maybe the segment table at 0x150 is the key:
// 0x150: 08 FD 81 00 = flash start
// 0x154: 08 FF 5C 07 = flash end
// This would be a segment from 0x08FD8100 to 0x08FF5C07
// Size = 0x08FF5C07 - 0x08FD8100 = 0x1DB07 = 121,607 bytes? That seems small.

// Actually, let's look at the OLS file to understand what WinOLS sees
const olsData = readFileSync('/home/ubuntu/upload/Can-Am2026MavRXRs(Original_VLM3).ols');

// WinOLS .ols files have a specific binary format
// Let's check if it's a known format
console.log('\n=== OLS File Format Analysis ===');
console.log(`Magic bytes: ${Array.from(olsData.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

// Check for common WinOLS signatures
const olsStr = olsData.toString('latin1');
// Search for "WinOLS" string
let idx = olsStr.indexOf('WinOLS');
if (idx >= 0) console.log(`Found "WinOLS" at offset ${idx}`);
idx = olsStr.indexOf('EVC');
if (idx >= 0) console.log(`Found "EVC" at offset ${idx}`);

// WinOLS .ols files typically contain:
// - Project metadata
// - The binary data (possibly modified)
// - Map definitions with addresses and sizes
// - Checksum information

// Let's search for the actual binary data inside the OLS file
// The DEADBEEF magic should appear if the binary is embedded
for (let i = 0; i < olsData.length - 4; i++) {
  if (olsData[i] === 0xDE && olsData[i+1] === 0xAD && olsData[i+2] === 0xBE && olsData[i+3] === 0xEF) {
    console.log(`Found DEADBEEF at OLS offset 0x${i.toString(16)}`);
  }
}

// Search for the map data pattern (0.92 as float32 BE = 3F 6B 85 1F)
const f092 = Buffer.alloc(4);
new DataView(f092.buffer).setFloat32(0, 0.92, false);
console.log(`\nSearching for float32 0.92 (${Array.from(f092).map(b => b.toString(16).padStart(2, '0')).join(' ')}) in OLS...`);
for (let i = 0; i < olsData.length - 8; i++) {
  const v1 = new DataView(olsData.buffer, olsData.byteOffset + i, 4).getFloat32(0, false);
  if (Math.abs(v1 - 0.92) < 0.005) {
    const v2 = new DataView(olsData.buffer, olsData.byteOffset + i + 4, 4).getFloat32(0, false);
    if (Math.abs(v2 - 0.95) < 0.005) {
      console.log(`  Found 0.92, 0.95 pattern at OLS offset 0x${i.toString(16)}`);
      // Show more values
      const vals = [];
      for (let j = 0; j < 10; j++) {
        vals.push(new DataView(olsData.buffer, olsData.byteOffset + i + j * 4, 4).getFloat32(0, false).toFixed(2));
      }
      console.log(`    Values: ${vals.join(', ')}`);
    }
  }
}

// Now let's try a completely different approach:
// The DEADBEEF container format used by Bosch MG1/MDG1 ECUs typically has:
// - Header with DEADBEEF magic
// - Segment descriptor table
// - Multiple data segments, each mapped to a flash address range
//
// The key insight is that the binary is NOT a flat flash dump.
// It's a container where segments may not be contiguous in flash space.
//
// Let's try to find the segment boundaries by looking for patterns in the data

console.log('\n\n=== Segment Boundary Detection ===');

// Look for regions of 0xFF (erased flash) which typically separate segments
let inFF = false;
let ffStart = 0;
const ffRegions = [];
for (let i = 0x400; i < binData.length; i++) {
  if (binData[i] === 0xFF) {
    if (!inFF) { inFF = true; ffStart = i; }
  } else {
    if (inFF) {
      const len = i - ffStart;
      if (len >= 256) { // Only report significant gaps
        ffRegions.push({ start: ffStart, end: i, len });
      }
      inFF = false;
    }
  }
}
if (inFF) {
  const len = binData.length - ffStart;
  if (len >= 256) ffRegions.push({ start: ffStart, end: binData.length, len });
}

console.log(`Found ${ffRegions.length} significant 0xFF regions (>= 256 bytes):`);
for (const r of ffRegions.slice(0, 30)) {
  console.log(`  0x${r.start.toString(16)} - 0x${r.end.toString(16)} (${r.len} bytes)`);
}

// Now let's try to understand the segment mapping by using multiple anchor points
// We need to find more known maps in the binary
console.log('\n\n=== Multi-Anchor Segment Mapping ===');

// From the A2L, we know several maps and their addresses.
// Let's search for distinctive data patterns and compute the offset for each.

// Pattern 1: AirPah_ratMAirEngInNom row 0: [0.92, 0.95, 1, 1, 1, 1...]
// Already found at file offset 0x484570, A2L addr 0x9464588

// Pattern 2: Row 11 of AirPah_ratMAirEngInNom: [0.79, 0.79, 0.78, 0.77, 0.77, 0.76]
// This should be at file offset 0x484570 + 11 * 18 * 4 = 0x484570 + 0x318 = 0x484888
// (assuming 18 columns per row, float32)
// Actually the screenshot shows 20x30 map, so 30 columns
// Row 11 offset = 0x484570 + 11 * 30 * 4 = 0x484570 + 0x528 = 0x484A98

// Let's verify:
const mapStart = 0x484570;
console.log(`\nVerifying map structure at 0x${mapStart.toString(16)}:`);
for (let row = 0; row < 20; row++) {
  const vals = [];
  for (let col = 0; col < 18; col++) {
    const off = mapStart + (row * 18 + col) * 4;
    if (off < binData.length - 4) {
      vals.push(dv.getFloat32(off, false).toFixed(2));
    }
  }
  console.log(`  Row ${row.toString().padStart(2)}: ${vals.join(', ')}`);
}

// The screenshot shows 20x30 map, let's try 30 columns
console.log(`\nWith 30 columns:`);
for (let row = 0; row < 3; row++) {
  const vals = [];
  for (let col = 0; col < 30; col++) {
    const off = mapStart + (row * 30 + col) * 4;
    if (off < binData.length - 4) {
      vals.push(dv.getFloat32(off, false).toFixed(2));
    }
  }
  console.log(`  Row ${row}: ${vals.join(', ')}`);
}

// Now let's search for other distinctive patterns from the WinOLS screenshot
// The screenshot shows "AirPah_ratMAirEngInNom_5253" with Size: 20x30
// The map has 20 rows and 30 columns (or vice versa)

// Let's also try to find the map with 20 columns (matching the row labels 0-17+ visible)
console.log(`\nWith 20 columns:`);
for (let row = 0; row < 20; row++) {
  const vals = [];
  for (let col = 0; col < 20; col++) {
    const off = mapStart + (row * 20 + col) * 4;
    if (off < binData.length - 4) {
      vals.push(dv.getFloat32(off, false).toFixed(2));
    }
  }
  console.log(`  Row ${row.toString().padStart(2)}: ${vals.join(', ')}`);
}

// From the screenshot, the exact values are:
// Row 0:  0.92, 0.95, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
// Row 11: 0.79, 0.79, 0.78, 0.77, 0.77, 0.76, ...
// Row 17: 0.81, 0.85, 0.84, 0.80, 0.79, 0.78, 0.90, 0.90, 0.87, 0.80, 0.75, 0.75, 0.75, 0.79, 0.79, 0.77, 0.77, 0.76

// The 20 column version matches! Row 11 should be 0.79, 0.79, 0.78...
// Let me verify row 11 with 20 columns:
const row11Off = mapStart + 11 * 20 * 4;
const row11 = [];
for (let col = 0; col < 20; col++) {
  row11.push(dv.getFloat32(row11Off + col * 4, false).toFixed(2));
}
console.log(`\nRow 11 (20 cols): ${row11.join(', ')}`);

// Now we have confirmed:
// Map AirPah_ratMAirEngInNom_5253 at A2L addr 0x9464588
// Found at file offset 0x484570
// Correct base = 0x9464588 - 0x484570 = 0x08FE0018
//
// But wait - the previous analysis found base 0x08FD7F00 was correct for OTHER maps.
// This means different maps use different bases! The container has multiple segments.

console.log('\n\n=== Computing Segment Bases ===');
console.log(`Map 1: AirPah_ratMAirEngInNom_5253`);
console.log(`  A2L addr: 0x9464588`);
console.log(`  File offset: 0x${mapStart.toString(16)}`);
console.log(`  Base: 0x${(0x9464588 - mapStart).toString(16).toUpperCase()}`);

// Let's find more maps to determine if there are multiple segments
// Search for other distinctive patterns

// Search for a sequence of small integers (like axis breakpoints)
// Common patterns: 0, 500, 1000, 1500, 2000, 2500, 3000 (RPM axis)
console.log('\nSearching for RPM axis patterns (uint16 BE: 0, 500, 1000, 1500)...');
for (let i = 0; i < binData.length - 8; i += 2) {
  const v1 = dv.getUint16(i, false);
  const v2 = dv.getUint16(i + 2, false);
  const v3 = dv.getUint16(i + 4, false);
  const v4 = dv.getUint16(i + 6, false);
  if (v1 === 0 && v2 === 500 && v3 === 1000 && v4 === 1500) {
    console.log(`  Found at 0x${i.toString(16)}`);
    const vals = [];
    for (let j = 0; j < 10; j++) {
      vals.push(dv.getUint16(i + j * 2, false));
    }
    console.log(`    Values: ${vals.join(', ')}`);
    console.log(`    Base for this: 0x${(0x9464588 - i).toString(16).toUpperCase()} (if same map)`);
  }
}

// Search for float32 patterns of common calibration values
// e.g., temperatures: 20, 40, 60, 80, 100 as float32
console.log('\nSearching for temperature axis (float32: 20, 40, 60, 80)...');
for (let i = 0; i < binData.length - 16; i += 4) {
  const v1 = dv.getFloat32(i, false);
  const v2 = dv.getFloat32(i + 4, false);
  const v3 = dv.getFloat32(i + 8, false);
  const v4 = dv.getFloat32(i + 12, false);
  if (Math.abs(v1 - 20) < 0.5 && Math.abs(v2 - 40) < 0.5 && Math.abs(v3 - 60) < 0.5 && Math.abs(v4 - 80) < 0.5) {
    console.log(`  Found at 0x${i.toString(16)}`);
  }
}

// Let's also check: what is the relationship between the header flash addresses and the data?
// Header says first segment starts at 0x08FD8100
// If the data starts at file offset 0x400 (after the header), then:
// base_for_segment_1 = 0x08FD8100 - 0x400 = 0x08FD7D00
// But we found the correct base for the map is 0x08FE0018
// That doesn't match either.

// Let's try another approach: compute the base for EVERY flash address in the header
// by assuming each one marks the start of a segment at a specific file offset

console.log('\n\n=== Testing Multiple Base Hypotheses ===');
const headerAddrs = [
  { addr: 0x08FD8100, label: 'seg1_start' },
  { addr: 0x08FF56F0, label: 'seg1_end?' },
  { addr: 0x08FD8168, label: 'seg1_data?' },
  { addr: 0x08FD81C8, label: 'seg2?' },
  { addr: 0x08FD8200, label: 'seg3?' },
  { addr: 0x08FD8E00, label: 'seg4?' },
  { addr: 0x08FD8F68, label: 'seg5?' },
  { addr: 0x08FD9110, label: 'seg6?' },
  { addr: 0x08FD9130, label: 'seg7?' },
];

// For each hypothesis: if this flash addr maps to file offset 0x400 (data start),
// what base does that imply, and does that base work for the known map?
for (const h of headerAddrs) {
  const hypotheticalBase = h.addr - 0x400;
  const mapFileOff = 0x9464588 - hypotheticalBase;
  const inBounds = mapFileOff >= 0 && mapFileOff < binData.length - 100;
  let match = false;
  if (inBounds) {
    const v = dv.getFloat32(mapFileOff, false);
    match = Math.abs(v - 0.92) < 0.01;
  }
  console.log(`  ${h.label} (0x${h.addr.toString(16)}): base=0x${hypotheticalBase.toString(16)}, map@0x${mapFileOff.toString(16)} ${inBounds ? (match ? '✓ MATCH' : '✗ no match') : 'OOB'}`);
}

// The correct base is 0x08FE0018. Let's see what flash address this implies
// for file offset 0x400:
const correctBase = 0x08FE0018;
const flashAt0x400 = correctBase + 0x400;
console.log(`\nCorrect base 0x${correctBase.toString(16).toUpperCase()}: flash addr at file 0x400 = 0x${flashAt0x400.toString(16).toUpperCase()}`);
// = 0x08FE0418

// Hmm, that's not one of the header addresses. Let's check if the data actually
// starts at a different offset than 0x400

// Let's find where the first non-zero, non-header data starts
console.log('\nFinding actual data start...');
for (let i = 0x1D0; i < 0x1000; i++) {
  if (binData[i] !== 0x00 && binData[i] !== 0xFF) {
    console.log(`  First non-zero byte after header at 0x${i.toString(16)}: 0x${binData[i].toString(16)}`);
    // But this is still in the extended header region (0x200-0x400)
    if (i >= 0x400) {
      console.log(`  Data starts at 0x${i.toString(16)}`);
      const flashAtDataStart = correctBase + i;
      console.log(`  Flash addr at data start: 0x${flashAtDataStart.toString(16).toUpperCase()}`);
      break;
    }
    continue;
  }
}

// Let's check what's right after the extended header (0x400)
console.log('\nData at 0x400-0x440:');
for (let row = 0; row < 4; row++) {
  const off = 0x400 + row * 16;
  const hex = [];
  for (let j = 0; j < 16; j++) {
    hex.push(binData[off + j].toString(16).padStart(2, '0'));
  }
  console.log(`  ${off.toString(16).padStart(6, '0')}: ${hex.join(' ')}`);
}

// Actually, let me reconsider. The DEADBEEF format might not have a fixed header size.
// Let's look at the actual data right after the last header entry (0x1CC = 0x08FFFFFF)
// The next non-zero region after the header zeros might be the data start

let actualDataStart = 0;
for (let i = 0x1D0; i < binData.length; i++) {
  if (binData[i] !== 0x00) {
    actualDataStart = i;
    break;
  }
}
console.log(`\nActual data starts at: 0x${actualDataStart.toString(16)}`);
const flashAtActualStart = correctBase + actualDataStart;
console.log(`Flash addr at actual data start: 0x${flashAtActualStart.toString(16).toUpperCase()}`);

// Let's also compute: what file offset does the header flash addr 0x08FD8100 map to
// with the correct base 0x08FE0018?
const seg1FileOff = 0x08FD8100 - correctBase;
console.log(`\nHeader addr 0x08FD8100 maps to file offset: 0x${seg1FileOff.toString(16)} (${seg1FileOff})`);
// If this is negative, it means 0x08FD8100 is BEFORE the file data start in flash space
// which would mean the file doesn't contain that region

// Actually wait - 0x08FD8100 < 0x08FE0018, so seg1FileOff would be negative!
// This means the correct base 0x08FE0018 can't be a simple base for the whole file.
// The file must contain data from MULTIPLE flash regions with different mappings.

console.log('\n\n=== CRITICAL INSIGHT ===');
console.log('The correct base 0x08FE0018 for the map data means the file data');
console.log('at offset 0x484570 maps to flash 0x9464588.');
console.log('But header addr 0x08FD8100 would map to file offset -0x7F18 (negative!)');
console.log('This PROVES the file has multiple segments with different flash-to-file mappings.');
console.log('');
console.log('The DEADBEEF container is NOT a flat flash dump with a single base.');
console.log('It contains a segment table that maps flash address ranges to file positions.');
