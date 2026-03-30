/**
 * Parse the DEADBEEF segment table to build flash-to-file mapping.
 * 
 * From the header analysis:
 * - 0x100: 02 00 00 50 = flags/type
 * - 0x104: 08 FF 56 F0 = flash addr (end of calibration region?)
 * - 0x108: 09 00 00 00 = flash addr (end of flash?)
 * - 0x10C: 08 FD 81 68 = flash addr (start of something)
 * - 0x110: 01 01 08 01 = flags
 * - 0x114-0x13F: FA FA FA FA... + FF FF FF FF... = padding
 * - 0x140: 08 FF 56 F8 = flash addr
 * - 0x144: "1234567890" = serial/ID string
 * - 0x150: 08 FD 81 00 = flash segment start
 * - 0x154: 08 FF 5C 07 = flash segment end
 * - 0x158: 00 09 00 02 = flags/type
 * - 0x15C: 08 FF 5C 08 = another flash addr
 * 
 * The segment at 0x150-0x154 defines: 0x08FD8100 to 0x08FF5C07
 * Size = 0x08FF5C07 - 0x08FD8100 + 1 = 0x1DB08 bytes
 * But the file is 0x5E8000 bytes with ~0x400 header = 0x5E7C00 data bytes
 * That's way more than 0x1DB08, so there must be more to the story.
 * 
 * Actually, looking more carefully:
 * 0x08FD8100 to 0x08FF5C07 = 0x1DB07 bytes
 * But the A2L addresses go up to 0x094xxxxx range
 * So the flash space is much larger: 0x08FD8100 to 0x094xxxxx
 * 
 * Wait - the map at A2L 0x9464588 is in the 0x09xxxxxx range,
 * which is ABOVE 0x08FF5C07. So the segment table must define
 * a larger region, or there are multiple segments.
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

// Let's take a completely different approach.
// Instead of trying to parse the header format (which is proprietary),
// let's use the data itself to determine the mapping.
//
// We know:
// 1. The map AirPah_ratMAirEngInNom at A2L 0x9464588 is at file offset 0x484570
// 2. The header says flash region starts at 0x08FD8100
//
// If the data starts right after the header, and the header is at 0x000-0x3FF (1024 bytes),
// then the first data byte is at file offset 0x400.
// If that first data byte maps to flash 0x08FD8100, then:
// base = 0x08FD8100 - 0x400 = 0x08FD7D00
//
// But we know the map at 0x9464588 is at file 0x484570
// With base 0x08FD7D00: A2L = 0x484570 + 0x08FD7D00 = 0x0945C270
// Actual A2L: 0x09464588
// Difference: 0x09464588 - 0x0945C270 = 0x8318
//
// Hmm, that's close but not exact. Let me reconsider.

// Actually, let me look at the header more carefully.
// The extended header at 0x200-0x400 contains what looks like a checksum table:
// [0x308] flash_addr, [0x30C] checksum, [0x310] size_x, [0x314] size_y
// This is a MAP DEFINITION TABLE, not a segment table!

// Let me re-examine the header at 0x150-0x15C:
// 0x150: 08 FD 81 00 = segment flash start
// 0x154: 08 FF 5C 07 = segment flash end
// 0x158: 00 09 00 02 = ??? 
// 0x15C: 08 FF 5C 08 = next segment start?

// But 0x08FF5C07 to 0x08FF5C08 is just 1 byte gap.
// Maybe the format is different.

// Let me try: what if the header at 0x100 defines the ENTIRE flash range,
// and the data is simply stored contiguously starting from a fixed offset?

// Let's test: if data starts at file offset 0x200 (right after the main header):
// base = 0x08FD8100 - 0x200 = 0x08FD7F00
// Map at 0x9464588: file offset = 0x9464588 - 0x08FD7F00 = 0x48C688
// But we found the data at 0x484570. Difference = 0x48C688 - 0x484570 = 0x8118

// What if data starts at some other offset?
// If data starts at file offset X, and flash starts at 0x08FD8100:
// base = 0x08FD8100 - X
// Map file offset = 0x9464588 - base = 0x9464588 - 0x08FD8100 + X = 0x48C488 + X
// We need this to equal 0x484570
// So X = 0x484570 - 0x48C488 = -0x7F18 (negative!)
// This means the data does NOT start at 0x08FD8100 in flash.

// OK, new theory: the header at 0x150 says the CALIBRATION region is 
// 0x08FD8100 to 0x08FF5C07, but the binary also contains CODE regions
// that come BEFORE the calibration data in the file.

// Let's check: the file is 0x5E8000 bytes. The calibration region is
// 0x08FF5C07 - 0x08FD8100 = 0x1DB07 bytes (about 122KB).
// But the file is 6MB. So most of the file is CODE, not calibration.

// The A2L address 0x9464588 is in the 0x09xxxxxx range.
// Flash memory on TriCore typically has:
// - Program Flash (PFlash): 0x80000000-0x803FFFFF (on TC1xxx)
// - Data Flash (DFlash): 0xAF000000-0xAF0FFFFF
// But for MG1/MDG1 on TC3xx:
// - PFlash: 0x80000000-0x807FFFFF
// - Or on some variants: 0x08000000-0x09FFFFFF

// The addresses 0x08FD8100-0x09464588 span about 0x48C488 bytes (~4.5MB)
// The file has ~6MB of data. So the flash region covers most of the file.

// Let me try a brute force approach: scan through the file looking for
// where the 0xFF gap regions are, and see if they correspond to
// segment boundaries in flash space.

console.log('=== 0xFF Gap Analysis ===');
let inFF = false;
let ffStart = 0;
const gaps = [];
for (let i = 0; i < binData.length; i++) {
  if (binData[i] === 0xFF) {
    if (!inFF) { inFF = true; ffStart = i; }
  } else {
    if (inFF) {
      const len = i - ffStart;
      if (len >= 16) gaps.push({ start: ffStart, end: i, len });
      inFF = false;
    }
  }
}
if (inFF) gaps.push({ start: ffStart, end: binData.length, len: binData.length - ffStart });

console.log(`Found ${gaps.length} 0xFF gaps (>= 16 bytes):`);
for (const g of gaps) {
  console.log(`  0x${g.start.toString(16).padStart(6, '0')} - 0x${g.end.toString(16).padStart(6, '0')} (${g.len} bytes = 0x${g.len.toString(16)})`);
}

// Now let's try the simplest possible theory:
// The DEADBEEF header is just metadata, and the actual data starts at some fixed offset.
// The flash-to-file mapping is: file_offset = flash_addr - base
// where base is a single value for the entire file.
//
// We know the map data is at file 0x484570 and A2L 0x9464588.
// So base = 0x9464588 - 0x484570 = 0x08FE0018.
//
// Let's verify this base against OTHER known patterns in the file.

const testBase = 0x08FE0018;
console.log(`\n=== Testing single base 0x${testBase.toString(16).toUpperCase()} ===`);

// With this base, the file data starts at flash addr:
// file offset 0 → flash 0x08FE0018
// file offset 0x100 → flash 0x08FE0118 (header region)
// file offset 0x400 → flash 0x08FE0418

// The header flash addr 0x08FD8100 would map to file offset:
// 0x08FD8100 - 0x08FE0018 = -0x7F18 (negative! before start of file)
// This means the header references a flash address BELOW the file's flash range.

// But wait - maybe the header addresses are metadata pointers, not data addresses.
// The actual data in the file might all be in the 0x08FE0018+ range.

// Let's check: what's the lowest A2L address in the definition file?
// And what's the highest?
// From the editor screenshot: 21009 maps, addresses in 0x09xxxxxx range

// Let me search for more known patterns to verify the base.
// If base is 0x08FE0018, then:
// - Flash 0x08FE0018 = file offset 0x000 (start of DEADBEEF header)
// - Flash 0x08FE0218 = file offset 0x200 (extended header)
// - Flash 0x08FE0418 = file offset 0x400 (first data after header)

// The header at file 0x150 contains 0x08FD8100.
// With base 0x08FE0018, this would be at flash 0x08FE0168.
// But the VALUE at file 0x150 is 0x08FD8100, which is a flash address pointer.
// So the header contains pointers to flash addresses that are BELOW the file's range.
// This makes sense - the header is metadata about the ECU, not data to be flashed.

// Let's verify the base by finding another map.
// From the WinOLS screenshot, the map tree shows categories like:
// Airflow (349), Communication (142), Diagnostics (21), Engine (112), etc.

// Let's search for another distinctive pattern.
// A common Bosch calibration: idle speed ~800 RPM
// As float32: 800.0 = 0x44480000
// Let's find sequences of RPM-like values

console.log('\nSearching for idle speed calibration (float32 ~800)...');
let found800 = 0;
for (let i = 0; i < binData.length - 4; i += 4) {
  const v = dv.getFloat32(i, false);
  if (Math.abs(v - 800) < 1) {
    found800++;
    if (found800 <= 3) {
      console.log(`  float32 800.0 at file 0x${i.toString(16)} → flash 0x${(i + testBase).toString(16).toUpperCase()}`);
    }
  }
}
console.log(`  Total 800.0 occurrences: ${found800}`);

// Let's try to find the A2L definition file to get actual map addresses
console.log('\n=== Looking for A2L files ===');
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

// Check common locations
const searchDirs = [
  '/home/ubuntu/upload',
  '/home/ubuntu/duramax_analyzer/client/src/lib/definitions',
  '/home/ubuntu/duramax_analyzer',
];

for (const dir of searchDirs) {
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    const a2lFiles = files.filter(f => f.endsWith('.a2l') || f.endsWith('.A2L') || f.includes('MG1'));
    if (a2lFiles.length > 0) {
      console.log(`  ${dir}:`);
      for (const f of a2lFiles) {
        console.log(`    ${f}`);
      }
    }
  }
}

// Let's also check the definitions directory
const defDir = '/home/ubuntu/duramax_analyzer/client/src/lib/definitions';
if (existsSync(defDir)) {
  const files = readdirSync(defDir);
  console.log(`\nDefinition files (${files.length}):`);
  for (const f of files.slice(0, 20)) {
    console.log(`  ${f}`);
  }
  if (files.length > 20) console.log(`  ... and ${files.length - 20} more`);
}

// Let's load the MG1CA920 definition and check some map addresses
const mg1Files = existsSync(defDir) ? readdirSync(defDir).filter(f => f.includes('MG1') || f.includes('mg1')) : [];
console.log(`\nMG1 definition files: ${mg1Files.join(', ')}`);

if (mg1Files.length > 0) {
  const defPath = join(defDir, mg1Files[0]);
  const defContent = readFileSync(defPath, 'utf8');
  const def = JSON.parse(defContent);
  
  console.log(`\nLoaded: ${mg1Files[0]}`);
  console.log(`  ECU Family: ${def.ecuFamily}`);
  console.log(`  Maps: ${def.maps?.length || 0}`);
  
  // Find the AirPah_ratMAirEngInNom map
  const airMap = def.maps?.find(m => m.name.includes('AirPah_ratMAirEngInNom'));
  if (airMap) {
    console.log(`\n  AirPah_ratMAirEngInNom:`);
    console.log(`    Address: 0x${airMap.address.toString(16).toUpperCase()}`);
    console.log(`    Type: ${airMap.type}`);
    console.log(`    Record Layout: ${airMap.recordLayout}`);
    console.log(`    Axes: ${JSON.stringify(airMap.axes?.map(a => ({ name: a.name, count: a.count })))}`);
    
    // With base 0x08FE0018:
    const fileOff = airMap.address - testBase;
    console.log(`    File offset with base 0x08FE0018: 0x${fileOff.toString(16)}`);
    if (fileOff >= 0 && fileOff < binData.length - 4) {
      const v = dv.getFloat32(fileOff, false);
      console.log(`    Value at that offset: ${v.toFixed(4)}`);
    }
  }
  
  // Check multiple maps with the test base
  console.log('\n  Testing base 0x08FE0018 against 20 maps:');
  let matchCount = 0;
  let testCount = 0;
  for (const m of (def.maps || []).slice(0, 50)) {
    const fileOff = m.address - testBase;
    if (fileOff >= 0 && fileOff < binData.length - 4) {
      testCount++;
      const v = dv.getFloat32(fileOff, false);
      const isReasonable = !Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e6 && Math.abs(v) > 1e-10;
      if (isReasonable) matchCount++;
      if (testCount <= 20) {
        console.log(`    ${m.name}: 0x${m.address.toString(16)} → file 0x${fileOff.toString(16)} = ${v.toFixed(4)} ${isReasonable ? '✓' : '✗'}`);
      }
    }
  }
  console.log(`  Reasonable values: ${matchCount}/${testCount}`);
  
  // Also test with the old base 0x08FD7F00
  console.log('\n  Testing base 0x08FD7F00 against same maps:');
  const oldBase = 0x08FD7F00;
  let oldMatchCount = 0;
  let oldTestCount = 0;
  for (const m of (def.maps || []).slice(0, 50)) {
    const fileOff = m.address - oldBase;
    if (fileOff >= 0 && fileOff < binData.length - 4) {
      oldTestCount++;
      const v = dv.getFloat32(fileOff, false);
      const isReasonable = !Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e6 && Math.abs(v) > 1e-10;
      if (isReasonable) oldMatchCount++;
      if (oldTestCount <= 20) {
        console.log(`    ${m.name}: 0x${m.address.toString(16)} → file 0x${fileOff.toString(16)} = ${v.toFixed(4)} ${isReasonable ? '✓' : '✗'}`);
      }
    }
  }
  console.log(`  Reasonable values: ${oldMatchCount}/${oldTestCount}`);
  
  // Now let's do a comprehensive test with ALL maps and BOTH bases
  // to see which one gives better results
  console.log('\n\n=== Comprehensive Base Comparison (ALL maps) ===');
  for (const base of [0x08FE0018, 0x08FD7F00, 0x08FD8000, 0x08FD8100]) {
    let total = 0, reasonable = 0, nan = 0, oob = 0;
    for (const m of (def.maps || [])) {
      const fileOff = m.address - base;
      if (fileOff < 0 || fileOff >= binData.length - 4) { oob++; continue; }
      total++;
      const v = dv.getFloat32(fileOff, false);
      if (Number.isNaN(v) || !Number.isFinite(v)) { nan++; continue; }
      if (Math.abs(v) < 1e10 && (Math.abs(v) > 1e-15 || v === 0)) reasonable++;
    }
    console.log(`  Base 0x${base.toString(16).toUpperCase()}: ${reasonable}/${total} reasonable, ${nan} NaN, ${oob} OOB`);
  }
  
  // Let's also try to find the OPTIMAL base by testing many candidates
  console.log('\n=== Brute Force Base Search ===');
  let bestBase = 0, bestScore = 0;
  // Search around the known candidates
  for (let base = 0x08FD0000; base <= 0x08FF0000; base += 0x100) {
    let total = 0, reasonable = 0;
    // Sample 200 maps evenly distributed
    const step = Math.max(1, Math.floor((def.maps || []).length / 200));
    for (let i = 0; i < (def.maps || []).length; i += step) {
      const m = def.maps[i];
      const fileOff = m.address - base;
      if (fileOff < 0 || fileOff >= binData.length - 4) continue;
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
  console.log(`  Best base: 0x${bestBase.toString(16).toUpperCase()} (score: ${(bestScore * 100).toFixed(1)}%)`);
  
  // Fine-tune around the best base
  let fineBestBase = bestBase, fineBestScore = bestScore;
  for (let base = bestBase - 0x100; base <= bestBase + 0x100; base += 0x2) {
    let total = 0, reasonable = 0;
    const step = Math.max(1, Math.floor((def.maps || []).length / 200));
    for (let i = 0; i < (def.maps || []).length; i += step) {
      const m = def.maps[i];
      const fileOff = m.address - base;
      if (fileOff < 0 || fileOff >= binData.length - 4) continue;
      total++;
      const v = dv.getFloat32(fileOff, false);
      if (!Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e10) reasonable++;
    }
    const score = total > 0 ? reasonable / total : 0;
    if (score > fineBestScore) {
      fineBestScore = score;
      fineBestBase = base;
    }
  }
  console.log(`  Fine-tuned best: 0x${fineBestBase.toString(16).toUpperCase()} (score: ${(fineBestScore * 100).toFixed(1)}%)`);
  
  // Verify the fine-tuned base against the known map
  const verifyOff = 0x9464588 - fineBestBase;
  if (verifyOff >= 0 && verifyOff < binData.length - 4) {
    const v = dv.getFloat32(verifyOff, false);
    console.log(`  AirPah_ratMAirEngInNom at fine-tuned base: ${v.toFixed(4)} (expected ~0.92)`);
  }
}
