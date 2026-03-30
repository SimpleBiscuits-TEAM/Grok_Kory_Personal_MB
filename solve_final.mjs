/**
 * DEFINITIVE segment solver.
 * 
 * Key insight from previous analysis:
 * - ALL 20,981 maps are in flash range 0x944028C-0x9482382
 * - With base 0x08FE0018, they map to file offsets 0x460274-0x4A236A
 * - The file has a 1.8MB gap of 0xFF at 0x2AFBC0-0x467FFF
 * - 1,292 maps fall in this gap (file offsets 0x460274-0x467FDC)
 * - 19,689 maps are after the gap (file offsets 0x46816C-0x4A236A)
 * 
 * The gap-skip hypothesis: the DEADBEEF container stores data contiguously
 * but with the gap removed. The file layout is:
 * 
 * File region 0x000-0x2AFBBF: flash data for addresses BEFORE the gap
 * File region 0x2AFBC0-0x467FFF: 0xFF padding (not real data)
 * File region 0x468000-0x4B7FFF: flash data for addresses AFTER the gap
 * 
 * But this doesn't work because AirPah at flash 0x9464588 reads correctly
 * at file 0x484570 with base 0x08FE0018, and 0x484570 is AFTER the gap.
 * 
 * NEW APPROACH: What if the gap maps' data is stored contiguously
 * right before the post-gap data? I.e., the gap in the file doesn't
 * correspond to a gap in flash space. Instead, the DEADBEEF container
 * packs the data tightly and the gap is just unused space.
 * 
 * Let me test: what if the gap maps' data starts at the end of the
 * pre-gap data (0x2AFBC0 - gap_map_data_size)?
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

const a2lContent = readFileSync('/home/ubuntu/duramax_analyzer/test_files/1E1101953.a2l', 'utf8');

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

const gapStart = 0x2AFBC0;
const gapEnd = 0x468000;
const gapSize = gapEnd - gapStart;

// The post-gap base works: 0x08FE0018
// AirPah at 0x9464588 → file 0x484570 ✓
const postGapBase = 0x08FE0018;

// For the gap maps (flash 0x944028C-0x9447FDC), their "natural" file offsets
// with base 0x08FE0018 are 0x460274-0x467FC4, which fall in the gap.
// 
// The gap is 0x1B8440 bytes. If we subtract the gap size from the natural offset:
// adjusted = 0x460274 - 0x1B8440 = 0x2A7E34
// This is in the pre-gap data region!
//
// But does this actually contain the right data?

console.log('=== Gap-Skip Mapping Test ===');
console.log('Testing: for maps in the gap, subtract gap size from file offset');

// Test with first few gap maps
let gapMapCount = 0;
let gapReasonable = 0;
let gapNaN = 0;

for (const m of maps) {
  const rawOff = m.address - postGapBase;
  if (rawOff < gapStart || rawOff >= gapEnd) continue; // not a gap map
  
  gapMapCount++;
  const adjustedOff = rawOff - gapSize;
  
  if (adjustedOff < 0 || adjustedOff >= binData.length - 4) continue;
  
  const v = dv.getFloat32(adjustedOff, false);
  const isOK = !Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e10;
  
  if (isOK) gapReasonable++;
  else gapNaN++;
  
  if (gapMapCount <= 20) {
    console.log(`  ${m.name}: flash 0x${m.address.toString(16)} → raw 0x${rawOff.toString(16)} → adjusted 0x${adjustedOff.toString(16)} = ${v.toFixed(6)} ${isOK ? '✓' : '✗'}`);
  }
}
console.log(`\nGap maps: ${gapReasonable}/${gapMapCount} reasonable, ${gapNaN} NaN`);

// Test post-gap maps (should work with base directly)
let postTotal = 0, postReasonable = 0, postNaN = 0;
for (const m of maps) {
  const rawOff = m.address - postGapBase;
  if (rawOff < gapEnd || rawOff >= binData.length) continue;
  
  postTotal++;
  const v = dv.getFloat32(rawOff, false);
  if (!Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e10) postReasonable++;
  else postNaN++;
}
console.log(`Post-gap maps: ${postReasonable}/${postTotal} reasonable, ${postNaN} NaN`);

// Now test: what if instead of gap-skip, we just use a DIFFERENT base
// that maps ALL maps to the contiguous data region?
// 
// The contiguous data is at:
// Pre-gap: 0x400 to 0x2AFBBF (2,816,960 bytes)
// Post-gap: 0x468000 to 0x4B7FFF (327,680 bytes)
// Total data: 3,144,640 bytes
//
// The maps span: 0x944028C to 0x9482382 = 0x420F6 bytes = 270,582 bytes
// This fits entirely in the post-gap region (327,680 bytes)!
//
// So maybe ALL maps are in the post-gap region with a single base,
// and the gap maps just need a slightly different base.

// Actually, let me reconsider. The total map address range is only 270KB.
// The post-gap data region is 327KB. So ALL maps could fit there.
// The question is: what base puts ALL maps in the post-gap region?

// For ALL maps to be in post-gap (file offset >= 0x468000):
// lowest_addr - base >= 0x468000
// 0x944028C - base >= 0x468000
// base <= 0x944028C - 0x468000 = 0x93F9A8C

// For ALL maps to be before end of data (file offset < 0x4B8000):
// highest_addr - base < 0x4B8000
// 0x9482382 - base < 0x4B8000
// base > 0x9482382 - 0x4B8000 = 0x93CA382

// So base must be in: 0x93CA382 to 0x93F9A8C
// That's a range of 0x2F70A = 194,314 bytes

console.log('\n\n=== Single Base for Post-Gap Region ===');
console.log('Required base range: 0x93CA382 to 0x93F9A8C');

let bestBase = 0, bestScore = 0;
for (let base = 0x93CA000; base <= 0x93FA000; base += 0x10) {
  let total = 0, reasonable = 0;
  for (let i = 0; i < maps.length; i += 10) {
    const m = maps[i];
    const fileOff = m.address - base;
    if (fileOff < 0x468000 || fileOff >= 0x4B8000) continue;
    total++;
    const v = dv.getFloat32(fileOff, false);
    if (!Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e10) reasonable++;
  }
  const score = total > 0 ? reasonable / total : 0;
  if (score > bestScore) {
    bestScore = score;
    bestBase = base;
  }
}
console.log(`Best: 0x${bestBase.toString(16).toUpperCase()} (${(bestScore * 100).toFixed(1)}%)`);

// Fine-tune
for (let base = bestBase - 0x10; base <= bestBase + 0x10; base += 0x2) {
  let total = 0, reasonable = 0;
  for (let i = 0; i < maps.length; i += 5) {
    const m = maps[i];
    const fileOff = m.address - base;
    if (fileOff < 0x468000 || fileOff >= 0x4B8000) continue;
    total++;
    const v = dv.getFloat32(fileOff, false);
    if (!Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e10) reasonable++;
  }
  const score = total > 0 ? reasonable / total : 0;
  if (score > bestScore) {
    bestScore = score;
    bestBase = base;
  }
}
console.log(`Fine-tuned: 0x${bestBase.toString(16).toUpperCase()} (${(bestScore * 100).toFixed(1)}%)`);

// Verify AirPah
const airOff = 0x9464588 - bestBase;
if (airOff >= 0 && airOff < binData.length - 4) {
  console.log(`AirPah file offset: 0x${airOff.toString(16)}`);
  console.log(`AirPah value: ${dv.getFloat32(airOff, false).toFixed(4)} (expected ~0.92)`);
  
  // Read first row
  const row = [];
  for (let i = 0; i < 18; i++) {
    row.push(dv.getFloat32(airOff + i * 4, false).toFixed(2));
  }
  console.log(`AirPah row 0: ${row.join(', ')}`);
}

// Full validation with best base
console.log('\n=== Full Validation ===');
let fullTotal = 0, fullReasonable = 0, fullNaN = 0, fullOOB = 0;
for (const m of maps) {
  const fileOff = m.address - bestBase;
  if (fileOff < 0 || fileOff >= binData.length - 4) { fullOOB++; continue; }
  fullTotal++;
  const v = dv.getFloat32(fileOff, false);
  if (Number.isNaN(v) || !Number.isFinite(v)) fullNaN++;
  else if (Math.abs(v) < 1e10) fullReasonable++;
}
console.log(`${fullReasonable}/${fullTotal} reasonable, ${fullNaN} NaN, ${fullOOB} OOB`);

// Check: how many maps fall in the gap with this base?
let inGap = 0;
for (const m of maps) {
  const fileOff = m.address - bestBase;
  if (fileOff >= gapStart && fileOff < gapEnd) inGap++;
}
console.log(`Maps in gap: ${inGap}`);

// Also check: what about the header at 0x468000?
// The post-gap data starts at 0x468000. Let's see what's there.
console.log('\nData at post-gap start (0x468000):');
const postGapHex = [];
for (let i = 0; i < 32; i++) {
  postGapHex.push(binData[0x468000 + i].toString(16).padStart(2, '0'));
}
console.log(`  ${postGapHex.join(' ')}`);

// Is there another DEADBEEF header at the post-gap start?
const postGapMagic = dv.getUint32(0x468000, false);
console.log(`Post-gap magic: 0x${postGapMagic.toString(16).toUpperCase()}`);

// Check if the post-gap region has its own header
console.log('\nPost-gap header analysis:');
for (let off = 0x468000; off < 0x468100; off += 4) {
  const val = dv.getUint32(off, false);
  if (val >= 0x08000000 && val <= 0x09FFFFFF) {
    console.log(`  [0x${off.toString(16)}] 0x${val.toString(16).toUpperCase()} ← FLASH ADDR`);
  }
}
