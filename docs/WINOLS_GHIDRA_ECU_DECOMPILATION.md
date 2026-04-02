# WinOLS & Ghidra ECU Decompilation — Erika Learning Reference

> **Source:** YouTube video analysis of [WinOLS and Ghidra ECU decompilation workflow](https://www.youtube.com/watch?v=wLIJ_9Ercms&list=PLHJZ2jPhTMKf0VC7-s1bSBLSXSLI3qMav)
> **Purpose:** Reference guide for Erika to learn practical ECU reverse engineering using industry-standard tools.
> **Focus:** Identifying and extracting calibration maps from Denso SH7058 ECUs using WinOLS and Ghidra together.

---

## Overview

This document captures the practical workflow for reverse engineering ECU calibration data using **WinOLS** (hex editor + map viewer) and **Ghidra** (disassembler + decompiler) together. The example focuses on finding **Diagnostic Trouble Code (DTC) maps** in a Denso SH7058 ECU, but the techniques apply broadly to any ECU reverse engineering task.

---

## 1. WinOLS: Visual Binary Analysis

### 1.1 Hex Searching with Known Values

**Workflow:**
1. Identify a **known value** that should exist in the calibration data
   - Example: DTC code `U0294` → search for hex value `2494` (or `9424` depending on byte order)
2. Configure search byte order:
   - **High-Low** = Big Endian (Bosch, Denso, Nissan)
   - **Low-High** = Little Endian (some ARM-based ECUs)
3. Search the hex dump for the value
4. Verify the context around the found value

**Key insight:** Use **specific, uncommon values** to avoid false positives. Searching for `0401` will return hundreds of matches; searching for `2494` will return only relevant DTC entries.

**Erika Application:**
- Build a database of known values for each ECU type
- For Duramax: known boost pressure limits, fuel rail pressures, torque limiters
- For Polaris: known RPM limits, speed limiters, gear ratios
- For Nissan: known DTC codes, emission thresholds

### 1.2 Visual Pattern Recognition

**Technique:** Once a known value is found, examine surrounding hex data for visual markers:

| Pattern | Meaning |
|---------|---------|
| `00 00 00 00` (repeated) | Padding or unused space |
| `02 01` or `01 01` (repeating) | Possible axis count markers or structure delimiters |
| Sharp transition from data to zeros | Map boundary |
| Monotonically increasing values | Likely an axis (breakpoints) |
| Repeating byte patterns | Possible array of identical elements |

**Example from video:**
- Found DTC hex value at address `05E2C4`
- Looked at surrounding data to identify the map boundaries
- Found visual markers indicating where the map starts and ends
- Identified adjacent "helper maps" (related data structures)

**Erika Application:**
- Implement pattern detection in the binary analyzer
- Scan for axis patterns: monotonically increasing float sequences
- Scan for map patterns: 2D arrays with consistent row/column counts
- Flag suspicious regions (all zeros, all 0xFF, repeating patterns)

### 1.3 Defining Maps in WinOLS

**Steps:**
1. Specify the **starting address** of the map
2. Specify the **bit size** (8-bit, 16-bit, 32-bit)
3. Specify the **axis lengths** (rows × columns)
4. Verify the data displays correctly as a 2D table

**Common issue:** Overlay problems where multiple maps share the same address space
- **Solution:** Adjust bit size (e.g., change from 16-bit to 8-bit) to correctly parse the data

**Example from video:**
- Initial definition showed overlay issues
- Changed bit size from 16-bit to 8-bit
- Map now displayed correctly as a 2D table with proper axis labels

**Erika Application:**
- When auto-detecting maps, try multiple bit sizes and pick the one that produces valid physical values
- Validate axis lengths: if a map claims to be 256×256 but only occupies 512 bytes, it's 8-bit not 32-bit
- Check for overlays by verifying that adjacent maps don't share addresses

---

## 2. Ghidra: Code-Level Verification

### 2.1 Cross-Referencing Addresses

**Workflow:**
1. Take a memory address from WinOLS (e.g., `05E2C4`)
2. Open Ghidra and search for that address in the disassembled code
3. Look at how the code **references** that address
4. Determine what the code does with that data

**Why this matters:** Visual patterns in hex can be deceiving. The actual code tells you definitively what the data is used for.

**Example from video:**
- Found DTC map at `05E2C4` in WinOLS
- Searched for `05E2C4` in Ghidra
- Found code that loads this address and iterates through it
- Confirmed it's a lookup table (array of DTC values)

**Erika Application:**
- When uncertain about a map's purpose, search for its address in the decompiled code
- Look for patterns like:
  - `for (i = 0; i < N; i++) { value = map[i]; }`  → 1D array/curve
  - `for (i = 0; i < rows; i++) { for (j = 0; j < cols; j++) { value = map[i][j]; } }` → 2D map
  - `if (value > threshold) { ... }` → threshold/limit value

### 2.2 Finding Map Boundaries

**Technique:** Scroll through decompiled code to find the **next referenced address** after the current map

**Workflow:**
1. Start at the address of the current map (e.g., `05E2C4`)
2. Scroll down through the code
3. Look for the next `MOV` or `LEA` instruction that loads a different address
4. That new address is likely the start of the next map
5. The difference between the two addresses is the size of the current map

**Example from video:**
- Current map starts at `05E2C4`
- Scrolled through code and found next reference at `05E2D0`
- Map size = `05E2D0 - 05E2C4 = 0x0C = 12 bytes`
- With 172 data points, this means 8-bit values (172 bytes would be too large)

**Erika Application:**
- Automate this process: scan the decompiled code for all `MOV reg, address` instructions
- Build a sorted list of all referenced addresses
- Calculate gaps between consecutive addresses
- These gaps are likely map/table sizes

### 2.3 Determining Data Type from Size

**Formula:**
```
Data Type = Map Size / Number of Elements
```

**Example:**
- Map occupies 344 bytes
- Contains 172 elements
- Data type = 344 / 172 = 2 bytes = **16-bit**

**Common sizes:**
| Bytes | Type | Range |
|-------|------|-------|
| 1 | UINT8 | 0–255 |
| 2 | UINT16 | 0–65,535 |
| 4 | FLOAT32 | ±3.4E38 |
| 8 | FLOAT64 | ±1.7E308 |

**Erika Application:**
- When extracting a map, calculate the expected byte size
- Verify the actual file size matches
- If mismatch, the map boundaries are wrong

---

## 3. Tandem Workflow: WinOLS + Ghidra

### 3.1 The Cycle

```
WinOLS (Find start address)
    ↓
Ghidra (Find next address)
    ↓
WinOLS (Calculate map size)
    ↓
Ghidra (Verify in code)
    ↓
Repeat for next map
```

### 3.2 Practical Example: Finding a DTC Map

**Step 1: WinOLS Search**
- Search for known DTC code `2494` (U0294)
- Find it at address `05E2C4`
- Note surrounding hex patterns

**Step 2: Ghidra Verification**
- Search for address `05E2C4` in code
- Find instruction: `MOV R0, 0x05E2C4`
- Scroll down to find next address reference: `MOV R1, 0x05E2D0`

**Step 3: WinOLS Calculation**
- Map size = `0x05E2D0 - 0x05E2C4 = 12 bytes`
- Number of DTCs = 172 (known from documentation)
- Data type = 12 / 172 ≈ 0.07 bytes (doesn't work!)
- **Recalculate:** Maybe the map is larger. Search for next reference after `0x05E2D0`
- Find `MOV R2, 0x05E2D0 + 0xAC = 0x05E2DC`
- Revised map size = `0x05E2DC - 0x05E2C4 = 24 bytes`
- Still doesn't work. Maybe 172 is wrong.
- **Adjust:** If 24 bytes, then 24 / 8-bit = 24 elements, or 24 / 16-bit = 12 elements
- Check documentation: yes, 12 DTC codes in this map!

**Step 4: WinOLS Definition**
- Set address: `05E2C4`
- Set bit size: 16-bit
- Set length: 12 elements
- Verify: displays 12 DTC codes correctly

**Erika Application:**
- Implement this cycle as an automated search algorithm
- Start with known values from A2L or documentation
- Use Ghidra's address references to build a map of all calibration data
- Validate each map by checking if values are physically meaningful

---

## 4. Best Practices

### 4.1 Use Unique Search Values

| ❌ Bad | ✅ Good |
|--------|---------|
| Search for `0401` | Search for `2494` (DTC code) |
| Search for `0000` | Search for `3F800000` (float 1.0) |
| Search for `FF FF` | Search for `42C80000` (float 100.0) |

**Reason:** Common values return too many false positives. Unique values pinpoint the exact location.

### 4.2 Watch for Byte Order Gotchas

**Example from video:**
- Searching for DTC `U0294`
- In hex: `02 94` (Big Endian) or `94 02` (Little Endian)
- WinOLS shows `C294` in the display (which is `94 C2` in memory)
- This is a **byte order conversion issue** — the display is showing the value in a different endianness than the search

**Solution:** Always verify the byte order setting matches the ECU architecture.

### 4.3 Verify with Multiple Sources

- **WinOLS visual patterns** — fast but can be misleading
- **Ghidra code references** — definitive but requires code reading
- **Documentation/A2L** — authoritative but may be incomplete
- **Physical validation** — does the value make sense? (RPM 0–8000, temp -40–150°C)

### 4.4 Build a Reference Library

For each ECU family, maintain:
- Known calibration addresses
- Known axis sizes
- Known value ranges
- Known data types
- Example maps with verified boundaries

**Erika Application:**
- Store these in a database indexed by ECU family
- Use as templates for reverse-engineering similar ECUs
- Accelerate future analysis by 10x

---

## 5. Comparison: WinOLS vs Ghidra vs IDA Pro

| Aspect | WinOLS | Ghidra | IDA Pro |
|--------|--------|--------|---------|
| **Hex viewing** | Excellent | Good | Good |
| **Map visualization** | Excellent | None | None |
| **Disassembly** | None | Excellent | Excellent |
| **Decompilation** | None | Good | Excellent |
| **Scripting** | Limited | Excellent (Python) | Excellent (IDC/Python) |
| **Cost** | Commercial | Free | Commercial |
| **Learning curve** | Easy | Moderate | Steep |

**Best practice:** Use **WinOLS for visual analysis** + **Ghidra for code verification**. This combination is faster than either tool alone.

---

## 6. Erika's Decompilation Strategy (Updated)

Based on both IDA Pro and WinOLS/Ghidra workflows:

### Phase 1: Quick Visual Scan (WinOLS)
1. Search for known values (DTCs, limits, ratios)
2. Identify visual patterns (axes, maps, padding)
3. Mark likely map boundaries

### Phase 2: Code Verification (Ghidra)
1. Cross-reference found addresses in code
2. Find next referenced address to confirm boundaries
3. Determine data type from size calculation

### Phase 3: Extraction
1. Define maps in WinOLS with verified parameters
2. Export as CSV or binary
3. Validate values are physically meaningful

### Phase 4: Synthesis (Generate A2L)
1. Create AXIS_PTS entries for discovered axes
2. Create CHARACTERISTIC entries for discovered maps
3. Assign COMPU_METHOD based on value ranges
4. Validate against known ECU behavior

---

## 7. Tools Summary

| Tool | Purpose | Erika Integration |
|------|---------|-------------------|
| **WinOLS** | Visual hex analysis, map viewing | Implement hex search + pattern detection |
| **Ghidra** | Disassembly, code analysis | Parse decompiled code for address references |
| **IDA Pro** | Premium disassembly, scripting | Alternative to Ghidra for complex analysis |
| **Radare2** | Open-source disassembly | CLI-based alternative |
| **Binary Ninja** | Modern disassembly, API | Programmatic analysis |

---

## 8. Key Takeaways

1. **WinOLS is for maps, Ghidra is for code** — use both together
2. **Unique search values** — avoid common patterns that return false positives
3. **Byte order matters** — always verify Big Endian vs Little Endian
4. **Cross-reference everything** — visual patterns + code logic + physical validation
5. **Build a reference library** — each ECU family has known patterns; reuse them
6. **Automate the cycle** — WinOLS search → Ghidra verification → size calculation can be scripted

---

*Document created: 2026-03-28*
*Source: WinOLS & Ghidra ECU decompilation video analysis*
*For use by Erika AI calibration assistant*
