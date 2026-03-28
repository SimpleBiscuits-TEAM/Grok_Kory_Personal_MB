# ME17 Bosch ECU Decompilation Template

## Overview

This document describes the ME17 ECU architecture and provides a template for reverse-engineering calibration definitions from ME17 files without an A2L file.

## Key Differences: ME17 vs MG1

| Parameter | ME17 | MG1CA920 |
|-----------|------|----------|
| **Base Address** | 0x80020000 | 0x08FD8000 |
| **Memory Space** | 64 KB (0x0000-0xFFFF) | Multi-MB |
| **Characteristics** | ~3,276 total | ~21,000 maps |
| **Address Range** | 0x800200E0 - 0x8002D3FA | 0x094403E4 - 0x9XXXXXX |
| **Data Range** | 54 KB | Multi-MB |
| **Byte Order** | Typically MSB_FIRST | MSB_FIRST |
| **Record Layouts** | 88 types | Fewer types |
| **COMPU_METHODS** | 444 | Fewer |
| **AXIS_PTS** | 46 | More |

## ME17 Memory Layout

```
0x80000000 ─────────────────────────────────────
           │ (Bootloader/ROM?)                   │
0x80020000 ─────────────────────────────────────
           │ Calibration Data Start              │
           │ - Characteristics (1,707)           │
           │ - AXIS_PTS (46)                     │
           │ - Values & Maps                     │
0x8002D3FA ─────────────────────────────────────
           │ (Calibration Data End)              │
0x80030000 ─────────────────────────────────────
           │ (Unused?)                           │
```

## Address Offset Calculation

**Formula:** `HEX_offset = A2L_address - 0x80020000`

**Example:**
- A2L address: 0x800200E0
- HEX offset: 0x800200E0 - 0x80020000 = 0x000000E0
- This byte is at position 0xE0 in the HEX file

## Record Layout Structure

ME17 uses 88 different record layouts, primarily for:

1. **Single Value (VALUE)** — FNC_VALUES with data type (UBYTE, UWORD, SWORD, etc.)
2. **Curves (CURVE)** — FNC_VALUES with AXIS_PTS_X for axis definition
3. **Maps (MAP)** — FNC_VALUES with AXIS_PTS_X and AXIS_PTS_Y
4. **3D Maps (CUBOID)** — FNC_VALUES with AXIS_PTS_X, AXIS_PTS_Y, AXIS_PTS_Z

### Common Record Layouts

| Layout Name | Type | Fields | Data Type |
|-------------|------|--------|-----------|
| FklWU16 | VALUE | FNC_VALUES | UWORD |
| FklWU8 | VALUE | FNC_VALUES | UBYTE |
| GkfWS8 | VALUE | FNC_VALUES | SBYTE |
| GkfWU16 | VALUE | FNC_VALUES | UWORD |
| (Curve layouts) | CURVE | FNC_VALUES + AXIS_PTS_X | Various |
| (Map layouts) | MAP | FNC_VALUES + AXIS_PTS_X + AXIS_PTS_Y | Various |

## Data Types and Sizes

| Data Type | Size | Range | Signed |
|-----------|------|-------|--------|
| UBYTE | 1 byte | 0-255 | No |
| SBYTE | 1 byte | -128 to 127 | Yes |
| UWORD | 2 bytes | 0-65535 | No |
| SWORD | 2 bytes | -32768 to 32767 | Yes |
| ULONG | 4 bytes | 0-4294967295 | No |
| SLONG | 4 bytes | -2147483648 to 2147483647 | Yes |
| FLOAT32_IEEE | 4 bytes | IEEE 754 | Yes |

## Decompilation Strategy

### Step 1: Identify Base Address

For any ME17 file, the base address can be found by:

1. **Parse the HEX/BIN file** to determine size (typically 64 KB for ME17)
2. **Extract A2L addresses** from a reference A2L file (if available)
3. **Calculate offset:** `base_address = min_a2l_address - min_hex_offset`
4. **Verify:** Check that all A2L addresses fit within the HEX file when offset is applied

### Step 2: Extract Record Layouts

From the A2L file, extract all RECORD_LAYOUT definitions:

```
/begin RECORD_LAYOUT RecordLayoutName
  FNC_VALUES DataType [Position]
  AXIS_PTS_X DataType [Position]
  AXIS_PTS_Y DataType [Position]
  ...
/end RECORD_LAYOUT
```

### Step 3: Parse Characteristics

For each CHARACTERISTIC:

1. Extract name, address, and record layout
2. Determine type (VALUE, CURVE, MAP, CUBOID)
3. Calculate HEX offset: `offset = address - base_address`
4. Read data from HEX file at that offset
5. Parse according to record layout definition

### Step 4: Extract AXIS_PTS

For CURVE and MAP types, extract axis definitions:

```
/begin AXIS_PTS AxisName
  Address 0xXXXXXXXX
  InputQuantity InputName
  Deposit RecordLayout
  MaxAxisPoints N
  LowerLimit L
  UpperLimit U
/end AXIS_PTS
```

### Step 5: Apply COMPU_METHOD

For each characteristic, apply the COMPU_METHOD to convert raw values:

```
/begin COMPU_METHOD CompuMethodName
  Phys = (Raw * Scale) + Offset
/end COMPU_METHOD
```

## Spyder ME17 Specific Findings

**File:** Spyder_991_2011.a2l + Spyder_991_2011.hex

- **Total Characteristics:** 3,276
- **Characteristics with Addresses:** 1,707
- **Base Address:** 0x80020000
- **Address Range:** 0x800200E0 - 0x8002D3FA
- **Data Range:** 54 KB (within 64 KB HEX file)
- **Record Layouts:** 88
- **COMPU_METHODS:** 444
- **AXIS_PTS:** 46

### Address Mapping Verification

✅ All 1,707 characteristics map correctly to HEX file using offset 0x80020000

### Common Characteristic Types in Spyder

1. **Calibration Constants** (MoCADC_*, MoCGPTA_*, etc.)
   - Type: VALUE
   - Data Type: UBYTE, UWORD, SWORD
   - Purpose: Sensor calibration, thresholds, timeouts

2. **Engine Parameters** (ACTFUEL, ACTIGN*, ACTINJ*, etc.)
   - Type: VALUE or CURVE
   - Purpose: Fuel injection, ignition timing, injector control

3. **Maps** (Various names)
   - Type: MAP or CUBOID
   - Purpose: Lookup tables for performance parameters

## Reverse-Engineering Workflow

### For ME17 Files WITH A2L:

1. Parse A2L to extract all definitions
2. Parse HEX/BIN file
3. Map addresses using base offset
4. Verify all values are readable and within expected ranges
5. Store definitions for reuse

### For ME17 Files WITHOUT A2L:

1. **Find reference A2L** for same ECU family (e.g., another Spyder model)
2. **Calculate base address** by comparing HEX file size and address ranges
3. **Extract record layouts** from reference A2L
4. **Map characteristics** using the same record layouts
5. **Generate synthetic A2L** with extracted definitions
6. **Validate** by checking value ranges and data types

## Known ME17 ECU Variants

- **Spyder 991 (2011)** — Base address: 0x80020000, 1,707 characteristics
- (Add more as discovered)

## Tools & Scripts

### Python Script: Extract ME17 Definitions

```python
import re

def extract_me17_definitions(a2l_path, hex_path, base_address=0x80020000):
    """Extract ME17 calibration definitions from A2L and HEX files"""
    
    # Parse HEX file
    hex_data = {}
    with open(hex_path, 'r') as f:
        for line in f:
            if not line.startswith(':'):
                continue
            byte_count = int(line[1:3], 16)
            address = int(line[3:7], 16)
            record_type = int(line[7:9], 16)
            if record_type == 0x00:
                data = line[9:9+byte_count*2]
                for i in range(byte_count):
                    hex_data[address + i] = data[i*2:i*2+2]
    
    # Parse A2L file
    with open(a2l_path, 'r', encoding='latin-1') as f:
        a2l_content = f.read()
    
    # Extract characteristics
    char_blocks = re.findall(
        r'/begin CHARACTERISTIC\s+(\w+)\s+"([^"]*)"\s+(.+?)/end CHARACTERISTIC',
        a2l_content, re.DOTALL
    )
    
    definitions = []
    for name, desc, body in char_blocks:
        addr_match = re.search(r'0x([0-9A-F]+)', body)
        if not addr_match:
            continue
        
        a2l_addr = int(addr_match.group(1), 16)
        hex_offset = a2l_addr - base_address
        
        if 0 <= hex_offset < len(hex_data):
            definitions.append({
                'name': name,
                'address': a2l_addr,
                'hex_offset': hex_offset,
                'description': desc,
            })
    
    return definitions, hex_data
```

## Next Steps

1. **Implement ME17 support in calibration editor** — add ME17 family detection and offset calculation
2. **Create A2L generator** — synthesize A2L files from binary analysis
3. **Test with multiple Spyder variants** — verify offset calculation works across different model years
4. **Extend to other ME17 ECUs** — Can-Am Commander, Outlander, etc.
5. **Build patch library** — document common tuning modifications for ME17

---

**Document Version:** 1.0  
**Last Updated:** 2026-03-28  
**Reference Files:** Spyder_991_2011.a2l, Spyder_991_2011.hex
