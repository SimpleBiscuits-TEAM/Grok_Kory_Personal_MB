/**
 * Deep analysis of the DEADBEEF container format and WinOLS project.
 * 
 * Goal: Understand the exact segment layout so we can reconstruct
 * the flat flash image that WinOLS sees.
 */
import { readFileSync } from 'fs';

const binData = readFileSync('/home/ubuntu/upload/1E1102029SE7VLM3_StockRead_exported.bin');
const dv = new DataView(binData.buffer, binData.byteOffset, binData.byteLength);

console.log('=== DEADBEEF Container Analysis ===');
console.log(`File size: ${binData.length} bytes (0x${binData.length.toString(16)})`);
console.log(`Magic: 0x${dv.getUint32(0, false).toString(16).toUpperCase()}`);

// Dump the first 0x200 bytes of the header in detail
console.log('\n=== Header Dump (0x000 - 0x1FF) ===');
for (let row = 0; row < 0x200 / 16; row++) {
  const off = row * 16;
  const hex = [];
  const ascii = [];
  for (let j = 0; j < 16; j++) {
    const b = binData[off + j];
    hex.push(b.toString(16).padStart(2, '0'));
    ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${off.toString(16).padStart(6, '0')}: ${hex.join(' ')}  ${ascii.join('')}`);
}

// Parse header fields
console.log('\n=== Header Field Analysis ===');
// Bytes 0-3: DEADBEEF magic
console.log(`[0x000] Magic: 0x${dv.getUint32(0, false).toString(16).toUpperCase()}`);
// Bytes 4-7: 
console.log(`[0x004] Field: 0x${dv.getUint32(4, false).toString(16).toUpperCase()}`);
// Bytes 8-11:
console.log(`[0x008] Field: 0x${dv.getUint32(8, false).toString(16).toUpperCase()}`);
// Bytes 12-15:
console.log(`[0x00C] Field: 0x${dv.getUint32(0xC, false).toString(16).toUpperCase()}`);

// Scan for all 32-bit values that look like flash addresses or sizes
console.log('\n=== Flash Addresses in Header ===');
for (let off = 0; off < 0x200; off += 4) {
  const val = dv.getUint32(off, false);
  if (val >= 0x08000000 && val <= 0x09FFFFFF) {
    console.log(`  [0x${off.toString(16).padStart(3, '0')}] 0x${val.toString(16).toUpperCase()}`);
  }
}

// Look for size/count fields
console.log('\n=== Potential Size/Count Fields ===');
for (let off = 0; off < 0x200; off += 4) {
  const val = dv.getUint32(off, false);
  if (val > 0 && val < 0x1000000 && val !== 0xDEADBEEF) {
    console.log(`  [0x${off.toString(16).padStart(3, '0')}] ${val} (0x${val.toString(16)})`);
  }
}

// Now let's look at the WinOLS project to understand what it sees
console.log('\n\n=== WinOLS Project Analysis ===');
const olsData = readFileSync('/home/ubuntu/upload/Can-Am2026MavRXRs(Original_VLM3).ols');
console.log(`OLS file size: ${olsData.length} bytes`);

// WinOLS .ols files are typically compressed or have a specific format
// Let's check the magic bytes
console.log(`OLS magic: ${Array.from(olsData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

// Check if it's a ZIP/compressed format
const olsMagic = olsData[0].toString(16) + olsData[1].toString(16);
console.log(`OLS first 2 bytes: 0x${olsMagic}`);

// Search for known strings in OLS
const olsText = olsData.toString('latin1');
const searchStrings = ['1E1102029', 'MG1CA920', 'MDG1', 'DEADBEEF', 'AirPah', 'ratMAir'];
for (const s of searchStrings) {
  const idx = olsText.indexOf(s);
  if (idx >= 0) {
    console.log(`  Found "${s}" at offset 0x${idx.toString(16)} in OLS`);
    // Show context
    const ctx = olsText.substring(Math.max(0, idx - 20), idx + s.length + 40);
    console.log(`    Context: ${JSON.stringify(ctx)}`);
  }
}

// The key question: what does WinOLS show for the map at address 0x9464588?
// From the screenshot: AirPah_ratMAirEngInNom_5253, Addr: 0x9464588, Size: 20x30
// Values are ratios around 0.76-1.02
//
// In our editor, we're reading at file offset = 0x9464588 - base
// With base 0x08FD7F00: file offset = 0x9464588 - 0x08FD7F00 = 0x48C688
// 
// Let's check what's at that file offset:
const base = 0x08FD7F00;
const mapAddr = 0x9464588;
const fileOffset = mapAddr - base;
console.log(`\n=== Map AirPah_ratMAirEngInNom at 0x${mapAddr.toString(16).toUpperCase()} ===`);
console.log(`With base 0x${base.toString(16).toUpperCase()}: file offset = 0x${fileOffset.toString(16)}`);

if (fileOffset >= 0 && fileOffset < binData.length - 100) {
  // Read as float32 BE (the A2L says this is a float)
  console.log('First 20 float32 BE values:');
  const vals = [];
  for (let i = 0; i < 20; i++) {
    const v = dv.getFloat32(fileOffset + i * 4, false);
    vals.push(v.toFixed(4));
  }
  console.log(`  ${vals.join(', ')}`);
  
  // Also try reading as uint16 BE with conversion
  console.log('First 20 uint16 BE values:');
  const u16vals = [];
  for (let i = 0; i < 20; i++) {
    const v = dv.getUint16(fileOffset + i * 2, false);
    u16vals.push(v);
  }
  console.log(`  ${u16vals.join(', ')}`);
} else {
  console.log(`  File offset 0x${fileOffset.toString(16)} is OUT OF BOUNDS (file size: 0x${binData.length.toString(16)})`);
}

// Now let's look at what WinOLS actually shows:
// From the screenshot, the first row of AirPah_ratMAirEngInNom is:
// 0.92, 0.95, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
// These look like float32 values close to 1.0
// float32 for 0.92 = 0x3F6B851F (BE)
// float32 for 1.0 = 0x3F800000 (BE)

// Let's search for the pattern 0.92, 0.95 as float32 BE
const target1 = Buffer.alloc(4);
const target1dv = new DataView(target1.buffer);
target1dv.setFloat32(0, 0.92, false);
console.log(`\nSearching for float32 0.92 (${Array.from(target1).map(b => b.toString(16).padStart(2, '0')).join(' ')})...`);

const matches = [];
for (let i = 0; i < binData.length - 4; i++) {
  const v = dv.getFloat32(i, false);
  if (Math.abs(v - 0.92) < 0.005) {
    // Check if next value is ~0.95
    if (i + 4 < binData.length) {
      const next = dv.getFloat32(i + 4, false);
      if (Math.abs(next - 0.95) < 0.005) {
        matches.push(i);
        if (matches.length <= 5) {
          // Read the full row
          const row = [];
          for (let j = 0; j < 18; j++) {
            row.push(dv.getFloat32(i + j * 4, false).toFixed(2));
          }
          console.log(`  Match at 0x${i.toString(16)}: ${row.join(', ')}`);
          console.log(`    → A2L addr with base 0x08FD7F00: 0x${(i + base).toString(16).toUpperCase()}`);
        }
      }
    }
  }
}
console.log(`Total matches: ${matches.length}`);

// Also search for the pattern from row 11: 0.79, 0.79, 0.78, 0.77, 0.77, 0.76
console.log('\nSearching for row 11 pattern (0.79, 0.79, 0.78)...');
for (let i = 0; i < binData.length - 12; i++) {
  const v1 = dv.getFloat32(i, false);
  const v2 = dv.getFloat32(i + 4, false);
  const v3 = dv.getFloat32(i + 8, false);
  if (Math.abs(v1 - 0.79) < 0.005 && Math.abs(v2 - 0.79) < 0.005 && Math.abs(v3 - 0.78) < 0.005) {
    const row = [];
    for (let j = 0; j < 18; j++) {
      row.push(dv.getFloat32(i + j * 4, false).toFixed(2));
    }
    console.log(`  Match at 0x${i.toString(16)}: ${row.join(', ')}`);
    console.log(`    → A2L addr with base 0x08FD7F00: 0x${(i + base).toString(16).toUpperCase()}`);
  }
}

// Let's also check: does the editor screenshot show the CORRECT data?
// The screenshot shows values at Addr: 0x9464588
// Let me check what the editor is actually reading at that address
console.log('\n=== What the editor currently reads ===');
console.log(`Map addr: 0x9464588, base: 0x08FD7F00`);
console.log(`File offset: 0x${(0x9464588 - 0x08FD7F00).toString(16)}`);
const editorOffset = 0x9464588 - 0x08FD7F00;
if (editorOffset >= 0 && editorOffset < binData.length - 100) {
  const row = [];
  for (let j = 0; j < 18; j++) {
    row.push(dv.getFloat32(editorOffset + j * 4, false).toFixed(2));
  }
  console.log(`  Values: ${row.join(', ')}`);
}

// Now let's understand the DEADBEEF container structure better
// The container has segments that map flash addresses to file positions
// The key insight: the binary is NOT a flat flash dump - it's a container
// with a segment table that maps discontinuous flash regions to file positions

console.log('\n\n=== DEADBEEF Segment Table Deep Analysis ===');
// The header at 0x100-0x1D0 contains segment descriptors
// Let's try to parse them as structured records

// Common DEADBEEF segment table format:
// Each entry: [flash_start:u32] [flash_end:u32] [flags:u32]
// Or: [flash_start:u32] [size:u32] [file_offset:u32]

// Let's dump the segment table region and try to identify the structure
console.log('Segment table region (0x100-0x1D0):');
for (let off = 0x100; off < 0x1D0; off += 4) {
  const val = dv.getUint32(off, false);
  const isFlash = val >= 0x08000000 && val <= 0x09FFFFFF;
  const label = isFlash ? ' ← FLASH ADDR' : (val < 0x100000 ? ` ← small (${val})` : '');
  console.log(`  [0x${off.toString(16)}] 0x${val.toString(16).toUpperCase().padStart(8, '0')}${label}`);
}

// Extended header (0x200+)
console.log('\nExtended header (0x200-0x400):');
for (let off = 0x200; off < 0x400; off += 4) {
  const val = dv.getUint32(off, false);
  if (val !== 0) {
    const isFlash = val >= 0x08000000 && val <= 0x09FFFFFF;
    const label = isFlash ? ' ← FLASH ADDR' : (val < 0x100000 ? ` ← small (${val})` : '');
    console.log(`  [0x${off.toString(16)}] 0x${val.toString(16).toUpperCase().padStart(8, '0')}${label}`);
  }
}

// Let's find where the actual data starts by looking for non-header patterns
console.log('\n=== Finding data start ===');
// TriCore code typically starts with specific patterns
// Calibration data is typically float32 or uint16 values
// Header data contains flash addresses and small integers

let dataStart = 0;
for (let i = 0x100; i < 0x10000; i += 2) {
  // Look for the first region that has many consecutive "reasonable" float32 values
  let floatCount = 0;
  for (let j = 0; j < 20; j++) {
    if (i + j * 4 >= binData.length) break;
    const v = dv.getFloat32(i + j * 4, false);
    if (!Number.isNaN(v) && Number.isFinite(v) && Math.abs(v) < 1e10 && Math.abs(v) > 1e-10) {
      floatCount++;
    }
  }
  if (floatCount >= 15) {
    console.log(`  Possible calibration data start at 0x${i.toString(16)}`);
    const vals = [];
    for (let j = 0; j < 10; j++) {
      vals.push(dv.getFloat32(i + j * 4, false).toFixed(4));
    }
    console.log(`    Values: ${vals.join(', ')}`);
    dataStart = i;
    break;
  }
}

// Let's also check: what does WinOLS see as the "file offset" for the map?
// WinOLS typically shows maps at their A2L virtual address
// But internally it maps them to file offsets using the segment table
// 
// The OLS project file should contain this mapping information
// Let's try to extract it

console.log('\n=== Searching OLS for map offset information ===');
// Search for the address 0x9464588 in the OLS file
const addrBytes = Buffer.alloc(4);
const addrDv = new DataView(addrBytes.buffer);
addrDv.setUint32(0, 0x9464588, false); // big-endian
const addrBytesLE = Buffer.alloc(4);
const addrDvLE = new DataView(addrBytesLE.buffer);
addrDvLE.setUint32(0, 0x9464588, true); // little-endian

for (let i = 0; i < olsData.length - 4; i++) {
  if (olsData[i] === addrBytes[0] && olsData[i+1] === addrBytes[1] && 
      olsData[i+2] === addrBytes[2] && olsData[i+3] === addrBytes[3]) {
    console.log(`  Found 0x9464588 (BE) at OLS offset 0x${i.toString(16)}`);
    // Show context
    const ctx = [];
    for (let j = -8; j < 16; j++) {
      if (i + j >= 0 && i + j < olsData.length) {
        ctx.push(olsData[i + j].toString(16).padStart(2, '0'));
      }
    }
    console.log(`    Context: ${ctx.join(' ')}`);
  }
  if (olsData[i] === addrBytesLE[0] && olsData[i+1] === addrBytesLE[1] && 
      olsData[i+2] === addrBytesLE[2] && olsData[i+3] === addrBytesLE[3]) {
    console.log(`  Found 0x9464588 (LE) at OLS offset 0x${i.toString(16)}`);
    const ctx = [];
    for (let j = -8; j < 16; j++) {
      if (i + j >= 0 && i + j < olsData.length) {
        ctx.push(olsData[i + j].toString(16).padStart(2, '0'));
      }
    }
    console.log(`    Context: ${ctx.join(' ')}`);
  }
}

// Also search for the file offset that should contain the map data
// If we found the 0.92, 0.95 pattern, that file offset is the answer
if (matches.length > 0) {
  const mapFileOffset = matches[0];
  console.log(`\nMap data found at file offset 0x${mapFileOffset.toString(16)}`);
  console.log(`With base 0x08FD7F00, A2L addr would be 0x${(mapFileOffset + 0x08FD7F00).toString(16).toUpperCase()}`);
  console.log(`Editor shows addr 0x9464588`);
  console.log(`Difference: 0x${Math.abs((mapFileOffset + 0x08FD7F00) - 0x9464588).toString(16)}`);
  
  // What base would make the A2L addr 0x9464588 point to this file offset?
  const correctBase = 0x9464588 - mapFileOffset;
  console.log(`\nCorrect base for this map: 0x${correctBase.toString(16).toUpperCase()}`);
  console.log(`This means: file_offset = A2L_addr - 0x${correctBase.toString(16).toUpperCase()}`);
}
