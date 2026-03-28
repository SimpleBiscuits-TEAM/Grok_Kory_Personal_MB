# Bosch ECU BIN-to-A2L Offset Discovery Playbook

This document captures the methodology for finding the correct base address offset when mapping raw `.bin` files to A2L calibration definitions. The same process applies to all Bosch ECU families: MG1CA920, EDC17, EDC16, MED9, ME7, etc.

## Problem Statement

A2L files define calibration characteristics (maps, curves, values) at absolute memory addresses (e.g., `0x094403E4`). When a user uploads a raw `.bin` file (a flat memory dump), the editor needs to know which byte in the BIN corresponds to which A2L address. The relationship is:

```
BIN_offset = A2L_address - BASE_ADDRESS
```

If `BASE_ADDRESS` is wrong, all map values will be NaN or garbage.

## Step-by-Step Discovery Process

### Step 1: Parse the iHEX or S-Record (if available)

Intel HEX (`.hex`) and Motorola S-Record (`.s19`) files contain explicit address information. Parse the file to find the actual memory regions:

```python
# For Intel HEX:
# Each record has: :LLAAAATT[DD...]CC
# LL = byte count, AAAA = address, TT = record type
# Type 04 = Extended Linear Address (sets upper 16 bits)
# Type 00 = Data record
```

The lowest populated address in the HEX file is the BIN base address.

### Step 2: Sample A2L Characteristics

Pick 5-10 VALUE characteristics (type `VALUE`, size 1x1) spread across the address range. These are single scalar values with known `lowerLimit` and `upperLimit` bounds.

### Step 3: Brute-Force Search (when no HEX available)

Try candidate base addresses and check if the values read from the BIN at `A2L_addr - candidate_base` fall within the A2L-defined limits:

```python
import struct

def try_base(bin_data, characteristics, base, big_endian=True):
    valid = 0
    for char in characteristics:
        offset = char.address - base
        if offset < 0 or offset + 4 > len(bin_data):
            continue
        fmt = '>f' if big_endian else '<f'
        val = struct.unpack(fmt, bin_data[offset:offset+4])[0]
        if char.lower_limit <= val <= char.upper_limit:
            valid += 1
    return valid / len(characteristics)
```

### Step 4: Verify with Byte-Level Matching

Once a candidate base is found, verify by reading 16 bytes at several A2L addresses from both the HEX and BIN:

```python
hex_bytes = read_hex_at(a2l_addr, 16)
bin_bytes = read_bin_at(a2l_addr - base, 16)
assert hex_bytes == bin_bytes  # Must match exactly
```

### Step 5: Validate at Scale

Test 100-200 characteristics across the full address range. Expect 95-100% match rate. Mismatches may indicate:
- Multi-region binaries (different segments at different bases)
- Compressed or encrypted regions
- A2L version mismatch

## Known Base Addresses by ECU Family

| ECU Family | Known Base Addresses | Notes |
|---|---|---|
| MG1CA920 | `0x08FD8000` | Confirmed via 1E1101953 Can-Am A2L |
| MG1C (generic) | `0x94400000`, `0x94000000`, `0x80000000` | Common Bosch MG1C variants |
| BRP/MG1CA920 | `0x80000000`, `0x80010000`, `0xA0040000` | BRP-specific variants |
| EDC17 | `0x80000000`, `0x80010000`, `0x80040000` | Common EDC17 bases |
| EDC16 | `0x80000000`, `0x800000` | Older Bosch diesel ECUs |
| MED9 | `0x80000000` | Bosch gasoline ECUs |
| ME7 | `0x00000000`, `0x800000` | Older Bosch gasoline ECUs |

## Key Technical Details

### Byte Order

Check the A2L `MOD_COMMON` block for `BYTE_ORDER`:
- `MSB_FIRST` = Big-endian (most Bosch ECUs)
- `MSB_LAST` = Little-endian

### AXIS_PTS with NO_AXIS_PTS_X

When a record layout has `NO_AXIS_PTS_X`, the first N bytes at the AXIS_PTS address are a count field, not axis data. Skip the count field before reading axis values:

```
Record Layout: RB_Axis_U16
  NO_AXIS_PTS_X at position 1 (UWORD = 2 bytes)
  AXIS_PTS_X at position 2 (UWORD)

Memory layout at AXIS_PTS address:
  [count_word (2 bytes)] [axis_value_0] [axis_value_1] ... [axis_value_N-1]
```

### AXIS_PTS Token Order (ASAP2 Spec)

The correct token order for AXIS_PTS is:
```
/begin AXIS_PTS
  Name
  LongIdentifier
  Address
  InputQuantity      ← often missed by parsers!
  Deposit (RecordLayout)
  MaxDiff
  Conversion (CompuMethod)
  MaxAxisPoints
  LowerLimit
  UpperLimit
  ...
/end AXIS_PTS
```

Parsers that skip `InputQuantity` will assign wrong values to all subsequent fields, causing `maxAxisPoints = 0` and broken map dimensions.

### COM_AXIS vs STD_AXIS

- **STD_AXIS**: Axis values are embedded in the characteristic's own data block
- **COM_AXIS**: Axis values are in a separate AXIS_PTS block, referenced by name. The actual axis count comes from the AXIS_PTS entry's `maxAxisPoints`, not the AXIS_DESCR's `maxAxisPoints` (though they should match)

## Troubleshooting Checklist

1. **All values NaN**: Wrong base address. Run brute-force search.
2. **Values look like garbage**: Wrong byte order. Check `MSB_FIRST` vs `MSB_LAST`.
3. **MAP shows as 1x1**: `maxAxisPoints` is 0. Check AXIS_PTS parsing (InputQuantity token).
4. **Axis values wrong**: Check if record layout has `NO_AXIS_PTS_X` — need to skip count word.
5. **Some maps work, others don't**: Multi-region binary. Check if A2L addresses span multiple ranges.
6. **100% alignment but values still wrong**: Data type mismatch. Verify `FLOAT32_IEEE` vs `UWORD` vs `UBYTE`.

## Adding Support for a New ECU Family

1. Obtain both a `.hex` and `.bin` for the same calibration
2. Parse the HEX to find the base address (lowest populated address)
3. Verify with 200+ characteristics using the brute-force method
4. Add the confirmed base to `editorEngine.ts` in both:
   - `alignOffsets()` → family-specific known offsets list
   - `autoHealAlignment()` → `boschBases` array
5. Test in browser: load A2L, load BIN, verify 100% alignment and correct map values
