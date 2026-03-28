# IDA Pro Nissan ECU Decompilation — Erika Learning Reference

> **Source:** YouTube video analysis of [IDA Pro Nissan ECU reverse engineering](https://www.youtube.com/watch?v=xH07bVuuxSM&t=9s)
> **Purpose:** Reference guide for Erika to learn ECU decompilation techniques applicable to Nissan and similar architectures.

---

## Overview

This document captures the IDA Pro workflow demonstrated for reverse engineering a **Nissan ROM** using a **Renesas SH7058** processor. While the specific ECU is Nissan (not Bosch), the techniques are broadly applicable to any ECU reverse engineering task.

---

## 1. Pre-Analysis (Before IDA Pro)

**Key step:** Always run external tools before opening IDA to establish baseline facts.

- Use `nisrom` (or equivalent tool) to:
  - Identify the **CPU type** (e.g., SH7058)
  - Determine **dump size**
  - **Verify checksums** — confirms the binary is complete and unmodified

**Erika Application:** When a user uploads an unknown binary, attempt to:
1. Identify processor family from binary signatures (header bytes, known patterns)
2. Verify file size matches expected ECU dump size
3. Check for known checksum patterns at standard offsets

---

## 2. Processor Architecture Identification

| Step | Action |
|------|--------|
| External tool | `nisrom` identifies CPU as **SH7058** |
| IDA setting | Select **Renesas SH-4b Big Endian (SH4B)** processor |
| Byte order | **Big Endian** — critical for reading multi-byte values correctly |

**Key insight:** The processor family determines byte order. Renesas SH = Big Endian. This is the same as Bosch MG1/ME17 ECUs which also use Big Endian (MSB_FIRST in A2L).

**Erika Application:** Byte order detection is already implemented in the A2L parser via `MOD_COMMON BYTE_ORDER MSB_FIRST`. For binaries without A2L, check for known big-endian patterns (e.g., IEEE 754 float `3F800000` = 1.0).

---

## 3. Memory Segment Setup

**Nissan SH7058 memory map:**
- ROM: starts at `0x00000000`
- RAM: starts at `0xFFFF0000`, size `0xFFFE`

**Key technique:** Manually create the RAM segment in IDA with correct start address and size based on hardware datasheet knowledge.

**Erika Application:** Each ECU family has a known memory map:
- MG1CA920: Calibration at `0x08FC0000`–`0x095BFFFF`
- MG1C400A1T2: Calibration at `0x08FC0000`–`0x095BFFFF`
- ME17 Spyder: Calibration at `0x80020000`–`0x8002FFFF`
- Nissan SH7058: ROM at `0x00000000`, RAM at `0xFFFF0000`

---

## 4. Vector Base Register (VBR) Tracking — Nissan Specific

**Critical Nissan technique:**

1. At power-on reset (address `0x0000`), the CPU executes a few instructions
2. Then it executes `LDC VBR` to **relocate the interrupt vector table** to a secondary location (e.g., `0x1000`)
3. The **secondary vector table** is what's actually used during normal operation
4. Finding the `LDC VBR` opcode reveals where the real interrupt table is

**Why this matters:** If you use the primary vector table at `0x0000`, you'll analyze the wrong interrupt handlers. The real execution flow starts from the secondary table.

**Erika Application:** For any ECU, look for vector table relocation patterns. In Bosch ECUs, the startup code similarly sets up interrupt handlers before entering the main calibration loop.

---

## 5. Finding Calibration Call Tables

**Workflow:**
1. Navigate to `INT_ATUII_IMIA3` — a **periodic timer interrupt** that runs the main control loops
2. Follow the `BSR` (Branch to Subroutine) at the end of the interrupt
3. Inside the subroutine, find loops with this pattern:
   - Load counter (number of functions)
   - Load pointer (address of function table)
   - Jump to function (`JSR`)
   - Increment pointer
   - Decrement counter
   - Branch back if counter > 0
4. The address loaded as the pointer is the **start of the call table**

**Pattern in assembly (SH4):**
```asm
MOV.L   @(offset, PC), R0    ; Load table address
MOV.L   @R0, R1              ; Load function pointer
JSR     @R1                  ; Call function
ADD     #4, R0               ; Next pointer
DT      R2                   ; Decrement counter
BF      loop_start           ; Loop if not zero
```

**Erika Application:** For Bosch ECUs, the equivalent is the **OSEK/AUTOSAR task scheduler** which calls calibration functions at fixed intervals. The A2L file maps these to named characteristics.

---

## 6. Data Type Definition in IDA

| Action | IDA Key | Purpose |
|--------|---------|---------|
| Define as offset | `O` | Mark a 4-byte value as a pointer/address |
| Create function | `P` | Convert address to a named function |
| Create array | `*` | Group multiple offsets into a structured array |

**Manual process:**
1. Navigate to call table address
2. Press `O` to define first entry as offset
3. Press `P` on the destination to create a function
4. Repeat for each entry

**Automation with IDC script (`calltable.idc`):**
```c
// Pseudo-code of the script
auto addr = start_of_table;
auto count = table_size;
while (count > 0) {
    OpOff(addr, 0, 0);      // Define as offset
    MakeFunction(Dword(addr)); // Create function
    addr += 4;
    count--;
}
```

**Erika Application:** When reverse-engineering unknown binaries, use similar pattern detection:
1. Scan for sequences of valid addresses pointing into the code region
2. These are likely function pointer tables (call tables)
3. Scan for sequences of valid addresses pointing into the data region
4. These are likely calibration map/table pointer arrays

---

## 7. Applying This to Bosch ECU Reverse Engineering

While Nissan uses Renesas SH architecture, Bosch ECUs use **Infineon TriCore** (TC1766, TC1796, TC1797, TC1798). The workflow is analogous:

| Aspect | Nissan SH7058 | Bosch TriCore |
|--------|---------------|---------------|
| Architecture | Renesas SH-4 | Infineon TriCore |
| Byte order | Big Endian | Big Endian |
| IDA processor | SH4B | TC1xxx |
| ROM start | 0x00000000 | 0x80000000 |
| Calibration region | Embedded in ROM | Separate segment (0x08FC0000+) |
| Main loop | INT_ATUII_IMIA3 | OS task scheduler |
| Call tables | Function pointer arrays | AUTOSAR RTE calls |

**Key Bosch-specific techniques:**
1. **Calibration segment identification:** Look for the segment starting with known A2L characteristic values
2. **Record layout detection:** Find repeating patterns of (count_word + data_array) = AXIS_PTS with NO_AXIS_PTS_X
3. **COMPU_METHOD inference:** If a value is always in range [0, 1] with 4-byte float, it's likely a ratio/factor
4. **Map boundary detection:** Look for 2D arrays where row/column counts match known axis sizes

---

## 8. Erika's Decompilation Strategy for Unknown Binaries

Based on the IDA Pro workflow, Erika should follow this process for unknown ECU binaries:

### Step 1: Identify Architecture
- Check file size against known ECU dump sizes
- Scan for processor-specific opcodes or header patterns
- Check byte order by looking for known float constants (1.0 = `3F800000` BE or `0000803F` LE)

### Step 2: Find Calibration Region
- Look for dense regions of IEEE 754 float values
- Check for axis patterns: monotonically increasing sequences of floats
- Look for count words followed by data arrays

### Step 3: Map Tables
- Find 1D arrays (CURVE): count_word + N floats
- Find 2D arrays (MAP): count_word_X + count_word_Y + X*Y floats
- Verify axis values are physically meaningful (RPM: 0-8000, temp: -40 to 150°C, etc.)

### Step 4: Generate Synthetic A2L
- Create AXIS_PTS entries for discovered axis arrays
- Create CHARACTERISTIC entries for discovered maps
- Assign COMPU_METHOD based on value ranges
- Validate by checking if values match known physical parameters

### Step 5: Cross-Reference with Known Files
- If a similar ECU's A2L exists, use address offsets to map characteristics
- Look for identical byte sequences between known and unknown files
- Use the offset discovery playbook to find the correct base address

---

## 9. Tools Referenced in Video

| Tool | Purpose |
|------|---------|
| `nisrom` | Pre-analysis: CPU identification, checksum verification |
| IDA Pro | Disassembly and reverse engineering |
| `calltable.idc` | Custom IDC script for automating call table definition |
| SH4B processor module | IDA plugin for Renesas SH-4 Big Endian |

**Open-source alternatives:**
- **Ghidra** (NSA) — free, supports TriCore and SH4
- **Binary Ninja** — commercial, good scripting API
- **Radare2** — free, command-line focused
- **ECUFlash** — open-source Subaru/Mitsubishi ECU tool with map detection

---

## 10. Key Takeaways for Erika

1. **Byte order is fundamental** — always determine before reading any multi-byte value
2. **Architecture knowledge accelerates analysis** — knowing the processor family reveals memory map, interrupt structure, and calling conventions
3. **Pattern recognition beats brute force** — known patterns (timer interrupts, call tables, axis arrays) are faster to find than analyzing every byte
4. **Scripting is essential** — automate repetitive tasks; manual analysis of 1000+ functions is impractical
5. **Cross-reference with known files** — if any similar ECU has a known A2L, use it as a template
6. **Calibration data has physical constraints** — values must be physically meaningful (RPM, temperature, pressure ranges)

---

*Document created: 2026-03-28*
*Source: IDA Pro Nissan ECU decompilation video analysis*
*For use by Erika AI calibration assistant*
