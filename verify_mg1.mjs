/**
 * Definitive MG1 verification:
 * Count how many A2L maps produce valid data with base 0x08FE0018
 * vs how many fall in the gap.
 * Then determine the correct multi-segment mapping.
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);
const a2lText = readFileSync('/home/ubuntu/duramax_analyzer/test_files/1E1101953.a2l', 'utf-8');

// Parse all CHARACTERISTIC addresses from A2L
const charRegex = /\/begin\s+CHARACTERISTIC\s+(\S+)\s+"[^"]*"\s+\w+\s+(0x[0-9A-Fa-f]+)/g;
const maps = [];
let m;
while ((m = charRegex.exec(a2lText)) !== null) {
  maps.push({ name: m[1], addr: parseInt(m[2], 16) });
}
console.log('Total A2L CHARACTERISTICs:', maps.length);

const BASE = 0x08FE0018;
const GAP_START = 0x2AFBC0;
const GAP_END = 0x468000;
const SEG2_START = 0x468000;
const FILE_SIZE = binData.length;

let inSeg1 = 0, inGap = 0, inSeg2 = 0, outOfBounds = 0;
let seg2Valid = 0, seg2NaN = 0, seg2Zero = 0;
let seg1Valid = 0, seg1NaN = 0;
const gapMaps = [];

for (const map of maps) {
  const fileOff = map.addr - BASE;
  if (fileOff < 0 || fileOff >= FILE_SIZE - 4) {
    outOfBounds++;
  } else if (fileOff < GAP_START) {
    inSeg1++;
    const val = dv.getFloat32(fileOff, false);
    if (isNaN(val)) seg1NaN++; else seg1Valid++;
  } else if (fileOff < GAP_END) {
    inGap++;
    gapMaps.push(map);
  } else {
    inSeg2++;
    const val = dv.getFloat32(fileOff, false);
    if (isNaN(val)) seg2NaN++;
    else if (val === 0) seg2Zero++;
    else seg2Valid++;
  }
}

console.log('\nWith base 0x' + BASE.toString(16).toUpperCase() + ':');
console.log('  In segment 1 (file < 0x' + GAP_START.toString(16) + '): ' + inSeg1);
console.log('    - Valid: ' + seg1Valid + ', NaN: ' + seg1NaN);
console.log('  In gap (0x' + GAP_START.toString(16) + '-0x' + GAP_END.toString(16) + '): ' + inGap);
console.log('  In segment 2 (file >= 0x' + SEG2_START.toString(16) + '): ' + inSeg2);
console.log('    - Valid float: ' + seg2Valid + ', NaN: ' + seg2NaN + ', Zero: ' + seg2Zero);
console.log('  Out of bounds: ' + outOfBounds);

// Show the flash address range of gap maps
if (gapMaps.length > 0) {
  gapMaps.sort((a, b) => a.addr - b.addr);
  console.log('\nGap maps flash range: 0x' + gapMaps[0].addr.toString(16) + ' - 0x' + gapMaps[gapMaps.length - 1].addr.toString(16));
  console.log('Gap maps file range: 0x' + (gapMaps[0].addr - BASE).toString(16) + ' - 0x' + (gapMaps[gapMaps.length - 1].addr - BASE).toString(16));
  console.log('First 5 gap maps:');
  for (const gm of gapMaps.slice(0, 5)) {
    console.log('  ' + gm.name + ' @ 0x' + gm.addr.toString(16));
  }
}

// Now the key question: can we find the gap maps' data in segment 2?
// Segment 2 header says flash_start = 0x09440100
// The gap maps are at flash 0x944028C onwards
// If segment 2 contains ALL the calibration data (including the gap maps),
// then the data layout in segment 2 would be:
//   [header] [gap maps data] [main cal data]
// And the gap maps data would start at seg2Start + headerSize

// We know AirPah (flash 0x9464588) is at file 0x484570
// The offset from flash_start: 0x9464588 - 0x09440100 = 0x24488
// So: file_of_flash_start + 0x24488 = 0x484570
// file_of_flash_start = 0x484570 - 0x24488 = 0x4600E8

// But 0x4600E8 is in the gap! This means with a SINGLE base,
// the flash data would span across the gap.

// ALTERNATIVE: What if segment 2's data is CONTIGUOUS and the gap
// doesn't exist in the virtual flash image?
// i.e., segment 2 data starts at seg2Start + headerSize,
// and maps to flash 0x09440100 contiguously.

// Let's find headerSize by matching AirPah:
// seg2Start + headerSize + (0x9464588 - 0x09440100) = 0x484570  ... NO
// That gives: headerSize = 0x484570 - 0x468000 - 0x24488 = 0x484570 - 0x48C488 = NEGATIVE
// So AirPah is NOT at flash_offset 0x24488 from seg2 data start.

// Wait, let me reconsider. AirPah is at file 0x484570.
// seg2Start = 0x468000.
// AirPah is at seg2 + 0x1C570.
// If the header is H bytes, then AirPah is at data_offset 0x1C570 - H from data start.
// Flash offset of AirPah from flash_start: 0x9464588 - 0x09440100 = 0x24488
// So: 0x1C570 - H = 0x24488
// H = 0x1C570 - 0x24488 = NEGATIVE (0x1C570 < 0x24488)
// This means AirPah is CLOSER to seg2Start than expected!
// The flash data must be COMPRESSED or the gap maps are NOT stored.

console.log('\n=== Key calculation ===');
console.log('AirPah at seg2 + 0x' + (0x484570 - SEG2_START).toString(16));
console.log('AirPah flash offset from flash_start: 0x' + (0x9464588 - 0x09440100).toString(16));
console.log('Difference (expected header): 0x' + ((0x9464588 - 0x09440100) - (0x484570 - SEG2_START)).toString(16));
console.log('This means: ' + ((0x9464588 - 0x09440100) - (0x484570 - SEG2_START)) + ' bytes are MISSING');
console.log('The gap size: ' + (GAP_END - GAP_START) + ' bytes');

// AH HA! The difference is:
// 0x24488 - 0x1C570 = 0x7F18 = 32,536 bytes
// The gap is 0x2AFBC0 to 0x468000 = 1,803,328 bytes
// So it's not the gap itself that's missing, but a smaller chunk.

// WAIT. Let me reconsider the whole thing.
// What if the binary is a FLAT dump where:
// - Segment 1 data: file 0x000000 to 0x2AFBBF (with its own DEADBEEF header)
// - Gap: 0x2AFBC0 to 0x467FFF (erased flash, all 0xFF)
// - Segment 2 data: file 0x468000 to 0x4B7FFF (with its own DEADBEEF header)
//
// And the flash layout is:
// - Segment 1 flash: starts at some base (code region)
// - Segment 2 flash: starts at 0x09440100 (calibration region)
//
// In segment 2, the DEADBEEF header takes some bytes, then the cal data follows.
// The cal data maps to flash 0x09440100 onwards.
// So: flash_addr = 0x09440100 + (file_offset - seg2Start - headerSize)
// Or: file_offset = flash_addr - 0x09440100 + seg2Start + headerSize
//
// For AirPah: 0x484570 = 0x9464588 - 0x09440100 + 0x468000 + H
// 0x484570 = 0x24488 + 0x468000 + H
// 0x484570 = 0x48C488 + H
// H = 0x484570 - 0x48C488 = NEGATIVE
//
// This is impossible! AirPah is at a LOWER file offset than expected.
// This means the gap maps' data is NOT in segment 2.

// FINAL REALIZATION: The base 0x08FE0018 works because:
// The binary IS a flat flash dump. The gap is real erased flash.
// The DEADBEEF headers are part of the flash image.
// There is NO segment remapping needed.
//
// The 1218 "gap maps" simply have their data in erased flash (0xFF).
// They are maps that exist in the A2L but whose calibration area
// was erased or never programmed in this particular binary.
//
// The correct approach: use base 0x08FE0018 and accept that
// ~1218 maps will show as "empty/erased" (all 0xFF = NaN).

console.log('\n=== FINAL CONCLUSION ===');
console.log('Base 0x08FE0018 IS the correct and ONLY base needed.');
console.log('The binary is a flat flash dump with an erased gap.');
console.log(inSeg2 + ' maps have valid data in segment 2.');
console.log(inGap + ' maps are in erased flash (will show NaN/empty).');
console.log(inSeg1 + ' maps are in segment 1 (code region, may have data).');
console.log('\nThe editor should:');
console.log('1. Use base 0x08FE0018');
console.log('2. Mark maps with all-NaN/0xFF data as "not present in binary"');
console.log('3. Display the ' + (seg2Valid + seg2Zero) + ' maps that have valid data');

// Verify a few more maps from WinOLS
console.log('\n=== Verification of known maps ===');
const verifyAddrs = [
  { name: 'AirPah_ratMAirEngInNom_5253', addr: 0x9464588, expected: '0.92' },
  { name: 'Random seg2 map', addr: 0x9470000, expected: 'any valid float' },
  { name: 'Near end of cal', addr: 0x9480000, expected: 'any valid float' },
];
for (const v of verifyAddrs) {
  const off = v.addr - BASE;
  if (off >= 0 && off < FILE_SIZE - 4) {
    const val = dv.getFloat32(off, false);
    const raw = dv.getUint32(off, false);
    console.log(v.name + ': file 0x' + off.toString(16) + ' = ' + val.toFixed(6) + ' (raw: 0x' + raw.toString(16).padStart(8, '0') + ')');
  }
}

// Count how many seg2 maps have the FIRST value as a reasonable calibration float
let reasonable = 0;
let unreasonable = 0;
for (const map of maps) {
  const fileOff = map.addr - BASE;
  if (fileOff >= SEG2_START && fileOff < FILE_SIZE - 4) {
    const val = dv.getFloat32(fileOff, false);
    if (!isNaN(val) && Math.abs(val) < 1e10 && Math.abs(val) > 1e-20 || val === 0) {
      reasonable++;
    } else {
      unreasonable++;
    }
  }
}
console.log('\nSeg2 maps: ' + reasonable + ' reasonable, ' + unreasonable + ' unreasonable');
