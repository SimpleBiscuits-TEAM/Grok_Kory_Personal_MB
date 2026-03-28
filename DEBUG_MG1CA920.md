# MG1CA920 A2L Analysis & Debug Findings

## File Information
- A2L: `1E1101953.a2l` (19 MB, ISO-8859-1 encoded)
- BIN: `1E1101953SA2VLMJMG1CA920.bin` (6 MB)
- ECU: MG1CA920A (Bosch MED17.8.5 variant)

## Root Cause Analysis

### Issue 1: NaN Values in Map Display

**Root Cause:** Data type mismatch in record layout resolution

Example MAP from A2L:
```
/begin CHARACTERISTIC
    AirPah_arEffThr_9192
    MAP
    0x946723C
    Lookup2D_FLOAT32_IEEE        ← Record layout name
    ...
    /begin AXIS_DESCR
        COM_AXIS
        Inp_ratThr
        ...
        AXIS_PTS_REF AirPah_ratThr_AX92  ← Axis reference (16 points)
    /end AXIS_DESCR
    /begin AXIS_DESCR
        COM_AXIS
        AirPah_nEngRsnCorr
        ...
        AXIS_PTS_REF AirPah_nEng_AX91    ← Axis reference (16 points)
    /end AXIS_DESCR
/end CHARACTERISTIC
```

**Problem:**
1. Record layout name is `Lookup2D_FLOAT32_IEEE` (not in standard recordLayouts map)
2. Parser doesn't resolve AXIS_PTS_REF to extract dimension counts (16×16)
3. `resolveDataType` falls back to UWORD (2 bytes) instead of FLOAT32 (4 bytes)
4. Reading 2-byte chunks from 4-byte float data produces garbage/NaN

### Issue 2: 3D Maps Not Appearing in Right Pane

**Root Cause:** Missing dimension metadata

In `MapDetailPanel.tsx` line 32:
```typescript
const isMap = map.type === 'MAP' && (map.rows || 1) >= 2 && (map.cols || 1) >= 2;
```

If `map.rows` and `map.cols` are undefined, they default to 1, so `isMap` is false and the 3D button doesn't appear.

**Problem:** `populateMapValues` doesn't set `rows` and `cols` from AXIS_DESCR sections.

## Solution Strategy

### Fix 1: Parse AXIS_PTS Sections
Add parsing for AXIS_PTS blocks to extract point counts:
```
/begin AXIS_PTS
    AirPah_nEng_AX91
    0x94661B4
    Lookup2D_X_FLOAT32_IEEE
    16                          ← Extract this as axis point count
    -3.4E+38
    3.4E+38
/end AXIS_PTS
```

### Fix 2: Resolve AXIS_PTS_REF in CHARACTERISTIC
When parsing CHARACTERISTIC with AXIS_DESCR sections:
1. Extract AXIS_PTS_REF names
2. Look up in parsed AXIS_PTS map
3. Set `map.rows` and `map.cols` from point counts

### Fix 3: Extend resolveDataType
Add `Lookup2D_*` variants to DATA_TYPES map so they're recognized directly.

## Implementation Checklist

- [ ] Add `parseAxisPts()` function to extract AXIS_PTS definitions
- [ ] Add `axisPts` Map to EcuDefinition interface
- [ ] Modify `parseA2LForEditor()` to call `parseAxisPts()`
- [ ] Modify map parsing to resolve AXIS_PTS_REF and set rows/cols
- [ ] Add Lookup2D variants to DATA_TYPES
- [ ] Test with MG1CA920 files to verify:
  - Maps display with correct dimensions
  - Values are FLOAT32 (not NaN)
  - 3D button appears for 2D+ maps
  - Copy-to-primary works correctly

## Test Files Location
- `/home/ubuntu/duramax_analyzer/test_files/1E1101953.a2l`
- `/home/ubuntu/duramax_analyzer/test_files/1E1101953SA2VLMJMG1CA920.bin`
