/**
 * Find the correct base address by using the A2L file and the actual binary.
 * 
 * Key facts:
 * - A2L says AirPah_ratMAirEngInNom_5253 is at address 0x9464588
 * - It's a MAP type with Lookup2D_FLOAT32_IEEE record layout
 * - Size: 20 rows x 30 columns (from screenshot)
 * - The data (0.92, 0.95, 1.0...) is found at file offset 0x484570
 * - Therefore: base = 0x9464588 - 0x484570 = 0x08FE0018
 * 
 * But the DEADBEEF header says flash starts at 0x08FD8100.
 * And the previous analysis found 0x08FD7F00 worked for some maps.
 * 
 * The question: is 0x08FE0018 the correct base for ALL maps,
 * or do different regions need different bases?
 * 
 * Let's test systematically using many maps from the A2L.
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

// Parse the A2L to get map addresses and expected data types
const a2lContent = readFileSync('/home/ubuntu/duramax_analyzer/test_files/1E1101953.a2l', 'utf8');

// Extract CHARACTERISTIC blocks with their addresses and types
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
console.log(`Parsed ${maps.length} CHARACTERISTICs from A2L`);

// Sort by address
maps.sort((a, b) => a.address - b.address);
console.log(`Address range: 0x${maps[0].address.toString(16)} - 0x${maps[maps.length-1].address.toString(16)}`);

// Determine data type size for each record layout
function getDataSize(layout) {
  if (layout.includes('FLOAT32')) return { size: 4, type: 'float32' };
  if (layout.includes('FLOAT64')) return { size: 8, type: 'float64' };
  if (layout.includes('SWORD') || layout.includes('WORD') || layout.includes('UINT16') || layout.includes('INT16')) return { size: 2, type: 'uint16' };
  if (layout.includes('SBYTE') || layout.includes('BYTE') || layout.includes('UINT8') || layout.includes('INT8')) return { size: 1, type: 'uint8' };
  if (layout.includes('SLONG') || layout.includes('LONG') || layout.includes('UINT32') || layout.includes('INT32')) return { size: 4, type: 'uint32' };
  // Default for Lookup2D_FLOAT32_IEEE, etc.
  if (layout.includes('FLOAT')) return { size: 4, type: 'float32' };
  return { size: 2, type: 'uint16' }; // default
}

function readValueAt(offset, dataType) {
  if (offset < 0 || offset >= binData.length - 8) return NaN;
  switch (dataType) {
    case 'float32': return dv.getFloat32(offset, false);
    case 'float64': return dv.getFloat64(offset, false);
    case 'uint16': return dv.getUint16(offset, false);
    case 'uint8': return binData[offset];
    case 'uint32': return dv.getUint32(offset, false);
    default: return dv.getFloat32(offset, false);
  }
}

function isReasonable(v, dataType) {
  if (Number.isNaN(v) || !Number.isFinite(v)) return false;
  if (dataType === 'float32' || dataType === 'float64') {
    // Check for denormals and extreme values
    if (Math.abs(v) > 0 && Math.abs(v) < 1e-30) return false; // denormal
    if (Math.abs(v) > 1e15) return false; // extreme
    return true;
  }
  return true; // integers are always "reasonable"
}

// Test multiple base candidates
const candidates = [
  0x08FE0018,  // computed from AirPah_ratMAirEngInNom
  0x08FD7F00,  // previous "correct" base
  0x08FD8000,  // old confirmed base
  0x08FD8100,  // header flash start
  0x08FE0000,  // round number near computed base
  0x08FD7D00,  // header flash start - 0x400
];

// Also try a fine-grained search around 0x08FE0018
for (let delta = -0x100; delta <= 0x100; delta += 0x10) {
  const c = 0x08FE0018 + delta;
  if (!candidates.includes(c)) candidates.push(c);
}

console.log('\n=== Base Address Comparison ===');
for (const base of candidates.slice(0, 10)) {
  let total = 0, reasonable = 0, nan = 0, oob = 0;
  for (const m of maps) {
    const { size, type } = getDataSize(m.recordLayout);
    const fileOff = m.address - base;
    if (fileOff < 0 || fileOff >= binData.length - size) { oob++; continue; }
    total++;
    const v = readValueAt(fileOff, type);
    if (isReasonable(v, type)) reasonable++;
    else nan++;
  }
  const score = total > 0 ? (reasonable / total * 100).toFixed(1) : '0.0';
  const airOff = 0x9464588 - base;
  let airVal = 'OOB';
  if (airOff >= 0 && airOff < binData.length - 4) {
    airVal = dv.getFloat32(airOff, false).toFixed(4);
  }
  console.log(`  0x${base.toString(16).toUpperCase().padStart(8, '0')}: ${score}% reasonable (${reasonable}/${total}), ${nan} NaN/Inf, ${oob} OOB, AirPah=${airVal}`);
}

// Now do the fine-grained search
console.log('\n=== Fine-Grained Search (0x08FDF000 - 0x08FF0000, step 0x100) ===');
let bestBase = 0, bestScore = 0, bestReasonable = 0;
for (let base = 0x08FDF000; base <= 0x08FF0000; base += 0x100) {
  let total = 0, reasonable = 0;
  // Sample every 10th map for speed
  for (let i = 0; i < maps.length; i += 10) {
    const m = maps[i];
    const { size, type } = getDataSize(m.recordLayout);
    const fileOff = m.address - base;
    if (fileOff < 0 || fileOff >= binData.length - size) continue;
    total++;
    const v = readValueAt(fileOff, type);
    if (isReasonable(v, type)) reasonable++;
  }
  const score = total > 0 ? reasonable / total : 0;
  if (score > bestScore || (score === bestScore && reasonable > bestReasonable)) {
    bestScore = score;
    bestBase = base;
    bestReasonable = reasonable;
  }
}
console.log(`Best: 0x${bestBase.toString(16).toUpperCase()} (${(bestScore * 100).toFixed(1)}%, ${bestReasonable} reasonable)`);

// Fine-tune
let fineBest = bestBase, fineScore = bestScore;
for (let base = bestBase - 0x100; base <= bestBase + 0x100; base += 0x2) {
  let total = 0, reasonable = 0;
  for (let i = 0; i < maps.length; i += 10) {
    const m = maps[i];
    const { size, type } = getDataSize(m.recordLayout);
    const fileOff = m.address - base;
    if (fileOff < 0 || fileOff >= binData.length - size) continue;
    total++;
    const v = readValueAt(fileOff, type);
    if (isReasonable(v, type)) reasonable++;
  }
  const score = total > 0 ? reasonable / total : 0;
  if (score > fineScore) {
    fineScore = score;
    fineBest = base;
  }
}
console.log(`Fine-tuned: 0x${fineBest.toString(16).toUpperCase()} (${(fineScore * 100).toFixed(1)}%)`);

// Verify the fine-tuned base against the known map
const verifyOff = 0x9464588 - fineBest;
if (verifyOff >= 0 && verifyOff < binData.length - 4) {
  const v = dv.getFloat32(verifyOff, false);
  console.log(`AirPah_ratMAirEngInNom at fine-tuned base: ${v.toFixed(4)} (expected ~0.92)`);
}

// Now let's check: does the file have a SEGMENT structure?
// If different address ranges need different bases, we'll see inconsistencies.
// Let's check the base needed for maps at different address ranges.

console.log('\n=== Per-Region Base Analysis ===');
// Group maps by address range (every 0x100000)
const regions = new Map();
for (const m of maps) {
  const region = Math.floor(m.address / 0x100000) * 0x100000;
  if (!regions.has(region)) regions.set(region, []);
  regions.get(region).push(m);
}

for (const [region, regionMaps] of [...regions.entries()].sort((a, b) => a[0] - b[0])) {
  // For each region, find the best base
  let rBest = 0, rScore = 0;
  for (let base = 0x08FD0000; base <= 0x08FF0000; base += 0x1000) {
    let total = 0, reasonable = 0;
    for (const m of regionMaps) {
      const { size, type } = getDataSize(m.recordLayout);
      const fileOff = m.address - base;
      if (fileOff < 0 || fileOff >= binData.length - size) continue;
      total++;
      const v = readValueAt(fileOff, type);
      if (isReasonable(v, type)) reasonable++;
    }
    const score = total > 0 ? reasonable / total : 0;
    if (score > rScore) { rScore = score; rBest = base; }
  }
  console.log(`  Region 0x${region.toString(16).toUpperCase()}: ${regionMaps.length} maps, best base 0x${rBest.toString(16).toUpperCase()} (${(rScore * 100).toFixed(1)}%)`);
}

// Check the big 0xFF gap at 0x2AFBC0-0x468000 (1.8MB of 0xFF)
// This is a HUGE gap. The data before it (0x400-0x2AFBC0) and after it (0x468000-0x4B8000)
// might be two different flash segments.
console.log('\n=== Segment Analysis Around 0xFF Gap ===');
console.log('Gap: 0x2AFBC0 - 0x468000 (1,803,328 bytes)');

// Maps that fall in the pre-gap region (file offset < 0x2AFBC0)
// With base 0x08FE0018: flash range = 0x08FE0418 to 0x0928FBD8
const preGapMaps = maps.filter(m => {
  const off = m.address - fineBest;
  return off >= 0 && off < 0x2AFBC0;
});
console.log(`Maps in pre-gap region: ${preGapMaps.length}`);
if (preGapMaps.length > 0) {
  console.log(`  Flash range: 0x${preGapMaps[0].address.toString(16)} - 0x${preGapMaps[preGapMaps.length-1].address.toString(16)}`);
}

// Maps that fall in the post-gap region (file offset >= 0x468000)
const postGapMaps = maps.filter(m => {
  const off = m.address - fineBest;
  return off >= 0x468000 && off < binData.length;
});
console.log(`Maps in post-gap region: ${postGapMaps.length}`);
if (postGapMaps.length > 0) {
  console.log(`  Flash range: 0x${postGapMaps[0].address.toString(16)} - 0x${postGapMaps[postGapMaps.length-1].address.toString(16)}`);
}

// Maps that fall in the gap (should be 0 if single base is correct)
const gapMaps = maps.filter(m => {
  const off = m.address - fineBest;
  return off >= 0x2AFBC0 && off < 0x468000;
});
console.log(`Maps in gap region: ${gapMaps.length}`);
if (gapMaps.length > 0) {
  console.log(`  These maps would read 0xFF data!`);
  console.log(`  Flash range: 0x${gapMaps[0].address.toString(16)} - 0x${gapMaps[gapMaps.length-1].address.toString(16)}`);
  // This is the key: if maps fall in the gap, the single base is wrong
  // and we need a segment table to skip the gap.
}
