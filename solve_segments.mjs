/**
 * Solve the segment mapping.
 * 
 * We know:
 * - 1,218 maps at flash 0x944028C-0x9447048 fall in the 0xFF gap
 * - 19,763 maps at flash 0x944704C-0x9482382 are in post-gap data
 * - The post-gap data starts at file offset 0x468000
 * - With base 0x08FE0018, AirPah at 0x9464588 maps to file 0x484570 (correct!)
 * 
 * So for the POST-GAP maps, base 0x08FE0018 works.
 * For the GAP maps, we need to find where their data actually is.
 * 
 * The gap maps span flash 0x944028C to 0x9447048.
 * Size = 0x9447048 - 0x944028C = 0x6DBC bytes = 28,092 bytes
 * 
 * This data must be somewhere in the pre-gap region (0x400-0x2AFBC0).
 * The pre-gap region has ~2.7MB of data, so the 28KB of gap map data
 * is somewhere in there.
 * 
 * Strategy: Find distinctive float patterns from gap maps in the pre-gap data.
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

const a2lContent = readFileSync('/home/ubuntu/duramax_analyzer/test_files/1E1101953.a2l', 'utf8');

// Parse CHARACTERISTICs
const charRegex = /\/begin CHARACTERISTIC\s+(\S+)\s+"[^"]*"\s+(\S+)\s+(0x[0-9A-Fa-f]+|\d+)\s+(\S+)/g;
const maps = [];
let match;
while ((match = charRegex.exec(a2lContent)) !== null) {
  const [, name, type, addrStr, recordLayout] = match;
  const address = parseInt(addrStr);
  if (address > 0x08000000 && address < 0x0A000000) {
    maps.push({ name, type, address, recordLayout });
  }
}
maps.sort((a, b) => a.address - b.address);

// The post-gap base is 0x08FE0018
const postGapBase = 0x08FE0018;

// Separate gap maps and post-gap maps
const gapMaps = maps.filter(m => {
  const off = m.address - postGapBase;
  return off >= 0x2AFBC0 && off < 0x468000;
});
const postGapMaps = maps.filter(m => {
  const off = m.address - postGapBase;
  return off >= 0x468000 && off < binData.length;
});
const preGapMaps = maps.filter(m => {
  const off = m.address - postGapBase;
  return off >= 0 && off < 0x2AFBC0;
});

console.log(`Pre-gap maps: ${preGapMaps.length} (flash 0x${preGapMaps.length > 0 ? preGapMaps[0].address.toString(16) : '?'} - 0x${preGapMaps.length > 0 ? preGapMaps[preGapMaps.length-1].address.toString(16) : '?'})`);
console.log(`Gap maps: ${gapMaps.length} (flash 0x${gapMaps[0].address.toString(16)} - 0x${gapMaps[gapMaps.length-1].address.toString(16)})`);
console.log(`Post-gap maps: ${postGapMaps.length} (flash 0x${postGapMaps[0].address.toString(16)} - 0x${postGapMaps[postGapMaps.length-1].address.toString(16)})`);

// Wait - the pre-gap maps have 0 entries. That means ALL maps are in the 0x9440xxxx range.
// With base 0x08FE0018, the file offsets for all maps are:
// Lowest: 0x944028C - 0x08FE0018 = 0x460274
// Highest: 0x9482382 - 0x08FE0018 = 0x4A236A

// The gap is at 0x2AFBC0-0x467FFF
// So maps at flash 0x944028C map to file 0x460274 which is IN the gap!
// And maps at flash 0x944704C map to file 0x466E34 which is ALSO in the gap!

// Wait, let me recalculate:
console.log('\n=== Recalculating file offsets ===');
const lowestAddr = maps[0].address;
const highestAddr = maps[maps.length - 1].address;
console.log(`Lowest A2L addr: 0x${lowestAddr.toString(16)}`);
console.log(`Highest A2L addr: 0x${highestAddr.toString(16)}`);
console.log(`With base 0x08FE0018:`);
console.log(`  Lowest file offset: 0x${(lowestAddr - postGapBase).toString(16)}`);
console.log(`  Highest file offset: 0x${(highestAddr - postGapBase).toString(16)}`);
console.log(`  AirPah (0x9464588) file offset: 0x${(0x9464588 - postGapBase).toString(16)}`);

// So with base 0x08FE0018:
// - Lowest map at file 0x460274 (in the gap 0x2AFBC0-0x467FFF? NO! 0x460274 > 0x2AFBC0)
// Wait, 0x460274 is between 0x2AFBC0 and 0x467FFF. So it IS in the gap!
// But AirPah at 0x484570 is AFTER the gap (0x468000+). And it reads correctly!

// So the gap is at file offsets 0x2AFBC0-0x467FFF
// Maps at file offsets 0x460274-0x466E34 are in the gap → read 0xFF
// Maps at file offsets 0x468000+ are after the gap → read correctly

// This means base 0x08FE0018 is WRONG for the first ~1218 maps.
// The correct mapping must skip the gap.

// Let me think about this differently.
// The DEADBEEF container stores flash data in segments.
// The flash address space is contiguous: 0x944028C to 0x9482382
// But the file has a gap at 0x2AFBC0-0x467FFF (1,803,328 bytes)

// If we REMOVE the gap, the file would be:
// 0x000000-0x2AFBBF: data (2,817,984 bytes)
// 0x2AFBC0-0x2AFBC0+remaining: data continues
// Total data = 0x5E8000 - 1,803,328 - header = about 4.3MB

// The flash range 0x944028C to 0x9482382 = 0x420F6 bytes = 270,582 bytes = 264KB
// This easily fits in the post-gap data (0x468000 to 0x4B8000 = 327,680 bytes)

// But wait - AirPah at flash 0x9464588 reads correctly at file 0x484570 with base 0x08FE0018.
// File 0x484570 is AFTER the gap (gap ends at 0x467FFF).
// So the post-gap data starts at 0x468000 and AirPah is at 0x484570 (offset 0x1C570 into post-gap).

// The first map at flash 0x944028C should be at file offset 0x460274 with base 0x08FE0018.
// But 0x460274 is in the gap (0x2AFBC0-0x467FFF).

// HYPOTHESIS: The gap maps' data is actually stored in the pre-gap region,
// and the DEADBEEF header defines a segment that maps it.
// OR: The gap is just padding and the data is stored contiguously,
// meaning we need to SKIP the gap when computing file offsets.

// Let's test: if we skip the gap, the effective file offset for flash 0x944028C would be:
// raw_offset = 0x944028C - 0x08FE0018 = 0x460274
// gap_start = 0x2AFBC0, gap_size = 0x468000 - 0x2AFBC0 = 0x1B8440
// Since raw_offset (0x460274) > gap_start (0x2AFBC0):
//   adjusted_offset = raw_offset - gap_size = 0x460274 - 0x1B8440 = 0x2A7E34
// This is in the pre-gap data region!

const gapStart = 0x2AFBC0;
const gapEnd = 0x468000;
const gapSize = gapEnd - gapStart;

console.log(`\n=== Testing Gap-Skip Hypothesis ===`);
console.log(`Gap: 0x${gapStart.toString(16)} - 0x${gapEnd.toString(16)} (${gapSize} bytes)`);

// Test: for the first gap map, skip the gap
const firstGapMap = gapMaps[0];
const rawOffset = firstGapMap.address - postGapBase;
const adjustedOffset = rawOffset >= gapStart ? rawOffset - gapSize : rawOffset;
console.log(`First gap map: ${firstGapMap.name} at flash 0x${firstGapMap.address.toString(16)}`);
console.log(`  Raw file offset: 0x${rawOffset.toString(16)} (in gap)`);
console.log(`  Adjusted (skip gap): 0x${adjustedOffset.toString(16)}`);
if (adjustedOffset >= 0 && adjustedOffset < binData.length - 4) {
  const v = dv.getFloat32(adjustedOffset, false);
  console.log(`  Value: ${v.toFixed(6)} (${Number.isNaN(v) ? 'NaN!' : 'OK'})`);
}

// But wait - this doesn't work for AirPah!
// AirPah raw offset = 0x484570 (after gap)
// Adjusted = 0x484570 - 0x1B8440 = 0x2CC130
// But we KNOW AirPah data is at file 0x484570, not 0x2CC130!
// So the gap-skip hypothesis is wrong for post-gap maps.

// NEW HYPOTHESIS: The gap is real - the file stores data at the actual flash offsets.
// The gap represents an erased/unused flash region.
// Maps in the gap region have their data in the pre-gap area with a DIFFERENT base.

// Let me try: what if there are TWO bases?
// Base 1 for maps in the pre-gap file region
// Base 2 for maps in the post-gap file region

// We know Base 2 = 0x08FE0018 (for AirPah and post-gap maps)
// For the gap maps, their flash addresses are 0x944028C-0x9447048
// Their data must be somewhere in 0x400-0x2AFBC0

// Let's search for the first gap map's data in the pre-gap region
console.log('\n=== Searching for Gap Maps Data ===');

// The first gap map is likely a VALUE or CURVE type
// Let's find a MAP type gap map with distinctive data
const gapMapTypes = {};
for (const m of gapMaps) {
  gapMapTypes[m.type] = (gapMapTypes[m.type] || 0) + 1;
}
console.log('Gap map types:', gapMapTypes);

// Let's try a completely different approach:
// Instead of trying to figure out the segment table,
// let's find the CORRECT base by testing what base makes
// ALL maps (including gap maps) read reasonable values.

// The trick: we need to find a base where:
// 1. Maps at 0x944028C-0x9447048 map to pre-gap data (file < 0x2AFBC0)
// 2. Maps at 0x944704C-0x9482382 map to post-gap data (file >= 0x468000)

// For condition 1: base = 0x944028C - X where X < 0x2AFBC0
//   → base > 0x944028C - 0x2AFBC0 = 0x91906CC
// For condition 2: base = 0x944704C - Y where Y >= 0x468000
//   → base <= 0x944704C - 0x468000 = 0x93FE04C

// These ranges DON'T OVERLAP! (0x91906CC > 0x93FE04C is FALSE)
// Wait: 0x91906CC < 0x93FE04C, so they DO overlap.
// Base must be in range: 0x91906CC to 0x93FE04C

// Hmm, but that's a huge range. Let me be more precise.
// For condition 1: file offset of LAST gap map < 0x2AFBC0
//   0x9447048 - base < 0x2AFBC0
//   base > 0x9447048 - 0x2AFBC0 = 0x9197488
// For condition 2: file offset of FIRST post-gap map >= 0x468000
//   0x944704C - base >= 0x468000
//   base <= 0x944704C - 0x468000 = 0x93FE04C

// So base must be in: 0x9197488 to 0x93FE04C
// That's a range of 0x266BC4 = 2,518,980 bytes

// But we also need the FIRST map to be after the header:
// 0x944028C - base >= 0x400
//   base <= 0x944028C - 0x400 = 0x943FE8C

// And the LAST map to be before the end of file:
// 0x9482382 - base < 0x5E8000
//   base > 0x9482382 - 0x5E8000 = 0x8E9A382

// So combined: base in 0x9197488 to 0x93FE04C

console.log('\n=== Two-Segment Base Search ===');
console.log('Required base range: 0x9197488 to 0x93FE04C');

// Let's search this range
let bestBase = 0, bestScore = 0, bestDetails = '';
for (let base = 0x9197000; base <= 0x9400000; base += 0x100) {
  let total = 0, reasonable = 0, inGap = 0;
  for (let i = 0; i < maps.length; i += 5) { // sample every 5th
    const m = maps[i];
    const fileOff = m.address - base;
    if (fileOff < 0 || fileOff >= binData.length - 4) continue;
    // Check if in gap
    if (fileOff >= gapStart && fileOff < gapEnd) { inGap++; continue; }
    total++;
    const v = dv.getFloat32(fileOff, false);
    if (!Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e10) reasonable++;
  }
  const score = total > 0 ? reasonable / total : 0;
  if (score > bestScore && inGap === 0) {
    bestScore = score;
    bestBase = base;
    bestDetails = `${reasonable}/${total} reasonable, ${inGap} in gap`;
  }
}
console.log(`Best base (no gap hits): 0x${bestBase.toString(16).toUpperCase()} (${(bestScore * 100).toFixed(1)}%, ${bestDetails})`);

// Verify
if (bestBase > 0) {
  const airOff = 0x9464588 - bestBase;
  if (airOff >= 0 && airOff < binData.length - 4) {
    const v = dv.getFloat32(airOff, false);
    console.log(`AirPah at best base: ${v.toFixed(4)} (expected ~0.92)`);
  }
  
  // Check first and last map
  const firstOff = maps[0].address - bestBase;
  const lastOff = maps[maps.length-1].address - bestBase;
  console.log(`First map file offset: 0x${firstOff.toString(16)}`);
  console.log(`Last map file offset: 0x${lastOff.toString(16)}`);
  console.log(`In gap? First: ${firstOff >= gapStart && firstOff < gapEnd}, Last: ${lastOff >= gapStart && lastOff < gapEnd}`);
  
  // Count how many maps are in each region
  let preGap = 0, inGap2 = 0, postGap2 = 0, oob = 0;
  for (const m of maps) {
    const off = m.address - bestBase;
    if (off < 0 || off >= binData.length) { oob++; continue; }
    if (off < gapStart) preGap++;
    else if (off < gapEnd) inGap2++;
    else postGap2++;
  }
  console.log(`Pre-gap: ${preGap}, In gap: ${inGap2}, Post-gap: ${postGap2}, OOB: ${oob}`);
  
  // Full validation
  let fullTotal = 0, fullReasonable = 0, fullNaN = 0;
  for (const m of maps) {
    const off = m.address - bestBase;
    if (off < 0 || off >= binData.length - 4) continue;
    if (off >= gapStart && off < gapEnd) continue; // skip gap
    fullTotal++;
    const v = dv.getFloat32(off, false);
    if (Number.isNaN(v) || !Number.isFinite(v)) fullNaN++;
    else if (Math.abs(v) < 1e10) fullReasonable++;
  }
  console.log(`Full validation: ${fullReasonable}/${fullTotal} reasonable, ${fullNaN} NaN`);
}
