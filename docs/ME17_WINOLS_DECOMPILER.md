# ME17 WinOLS Decompiler & A2L Compiler

## Overview

This document describes the ME17 WinOLS project parser and A2L compiler for Bosch ME17-based ECUs (Can-Am Spyder, Maverick, etc.). The system can extract binary files and map definitions from WinOLS .ols project files and generate ASAP2-compliant A2L definitions.

## WinOLS File Format

### Structure

WinOLS project files (.ols) are binary containers with the following structure:

```
[Header Section]
├─ Magic: "WinOLS File" (length-prefixed string)
├─ Metadata (vehicle, model, processor, ECU ID, software version)
├─ File name and version information
│
[Binary Section]
├─ Size marker (4-byte little-endian)
├─ Raw binary data (typically 2MB for ME17)
│
[Map Definitions Section]
├─ MAP[0] marker
├─ Map metadata (address, dimensions, data type)
├─ MAP[1] marker
└─ ... (repeated for each map)
```

### Header Format

All strings in the header are **length-prefixed**:
- 4-byte little-endian length
- N bytes of ASCII string data
- Null terminator (included in length)

**Header fields (in order):**
1. Magic: "WinOLS File"
2. Unknown 4 bytes
3. Version info (4 bytes)
4. Vehicle name (e.g., "CAN AM")
5. Model name (e.g., "Maverick 3R RR 2020")
6. Processor type (e.g., "Bosch")
7. Processor version (e.g., "ME17.8.5")
8. ECU ID (e.g., "VM7E270175A0")
9. Software version (e.g., "10SW052195")
10. File name
11. Version string (e.g., "OLS 5.0 (WinOLS)")

### Binary Section

Located after header, marked by a 4-byte size field:
- Common sizes: 0x80000 (512KB), 0x100000 (1MB), 0x200000 (2MB), 0x400000 (4MB)
- ME17 typically uses 0x200000 (2MB)
- Data immediately follows the size marker

### Map Definitions Section

Starts with "MAP" marker (0x4D 0x41 0x50) followed by:
- Map name (null-terminated string)
- Metadata (address, dimensions, data type)
- Repeated for each map

## Extraction Process

### Step 1: Parse Header

```typescript
const header = parseWinOLSHeader(buffer);
// Returns: { vehicle, model, processor, ecuId, softwareVersion, headerEnd }
```

### Step 2: Extract Binary

```typescript
const binarySection = findBinarySection(buffer, headerEnd);
const binary = buffer.slice(binarySection.offset, binarySection.offset + binarySection.size);
```

### Step 3: Parse Maps

```typescript
const mapMarkerOffset = findMapMarker(buffer, binarySection.offset);
const maps = parseMapDefinitions(buffer.slice(mapMarkerOffset));
```

### Step 4: Generate A2L

```typescript
const a2l = generateME17A2L(project);
```

## ME17 Base Address

ME17 ECUs use a fixed base address for calibration data:

```
Base Address: 0x80020000
```

This is used to convert A2L addresses to binary file offsets:

```
Binary Offset = A2L Address + Alignment Offset
Alignment Offset = 0x80020000 - Base Address
```

## Map Data Types

Supported data types in ME17 maps:

| Type | Size | Signed | Description |
|------|------|--------|-------------|
| UBYTE | 1 | No | Unsigned 8-bit integer (0-255) |
| SBYTE | 1 | Yes | Signed 8-bit integer (-128 to 127) |
| UWORD | 2 | No | Unsigned 16-bit integer (0-65535) |
| SWORD | 2 | Yes | Signed 16-bit integer (-32768 to 32767) |
| ULONG | 4 | No | Unsigned 32-bit integer |
| SLONG | 4 | Yes | Signed 32-bit integer |
| FLOAT | 4 | No | IEEE 754 single-precision float |
| DOUBLE | 8 | No | IEEE 754 double-precision float |

## A2L Generation

The parser generates ASAP2-compliant A2L files with:

- **RECORD_LAYOUT** definitions for each data type
- **COMPU_METHOD** for value scaling and units
- **CHARACTERISTIC** entries for each map with:
  - Address (relative to base address)
  - Data type
  - Min/Max limits
  - Physical unit

Example A2L characteristic:

```asap2
/CHARACTERISTIC
  SpeedLimiter
  "Maximum vehicle speed limit"
  VALUE
  0x00001234
  RECORD_LAYOUT RL_UBYTE
  COMPU_METHOD IDENTICAL
  LOWER_LIMIT 0
  UPPER_LIMIT 255
/CHARACTERISTIC
```

## Example Usage

### Parse WinOLS Project

```typescript
import { parseME17WinOLSProject } from '@/lib/me17WinolsParser';

const buffer = await file.arrayBuffer();
const project = parseME17WinOLSProject(buffer);

console.log(`Vehicle: ${project.vehicle} ${project.model}`);
console.log(`ECU: ${project.ecuId}`);
console.log(`Maps found: ${project.maps.length}`);
```

### Generate A2L

```typescript
import { generateME17A2L } from '@/lib/me17WinolsParser';

const a2l = generateME17A2L(project);
const blob = new Blob([a2l], { type: 'text/plain' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `${project.ecuId}.a2l`;
a.click();
```

### Export Project Metadata

```typescript
import { exportME17ProjectJSON } from '@/lib/me17WinolsParser';

const json = exportME17ProjectJSON(project);
console.log(json);
```

## Supported ECU Variants

### Can-Am Spyder (ME17)

- **ECU ID**: VM7E270175A0
- **Software**: 10SW052195
- **Binary Size**: 2MB (0x200000)
- **Maps**: ~34 (varies by software version)

### Can-Am Maverick (ME17)

- **ECU ID**: VM7E270175A0
- **Software**: 10SW052195
- **Binary Size**: 2MB (0x200000)
- **Maps**: ~34

## Known Limitations

1. **Map Metadata Parsing**: Some map metadata (rows, cols, data type) is inferred heuristically. Actual values may need manual verification.

2. **Address Resolution**: Maps without detected addresses are skipped. These may need manual offset discovery.

3. **Computation Methods**: Currently generates IDENTICAL (1:1) scaling. Physical scaling factors are not extracted from WinOLS.

4. **Units**: Physical units are not extracted from WinOLS format. All maps default to unitless.

## Future Enhancements

1. **Automatic Map Dimension Detection**: Parse WinOLS metadata to extract exact row/column counts.

2. **Scaling Factor Extraction**: Extract COMPU_METHOD scaling from WinOLS definitions.

3. **Unit Extraction**: Parse WinOLS unit definitions and include in A2L.

4. **Checksum Calculation**: Implement ME17 checksum algorithms for modified binaries.

5. **Multi-ECU Support**: Extend to other Bosch ECU families (EDC17, EDC16, MED9).

## Testing

All parser functions are covered by comprehensive unit tests:

```bash
pnpm test -- me17WinolsParser.test.ts
```

Tests verify:
- Header parsing accuracy
- Binary extraction
- Map definition parsing
- A2L generation
- JSON export

## References

- **ASAP2 Standard**: https://www.asam.net/standards/detail/mdf
- **Bosch ME17 Documentation**: Internal technical references
- **WinOLS Format**: Reverse-engineered from project files
