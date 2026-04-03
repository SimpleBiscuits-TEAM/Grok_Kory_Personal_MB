# Ford FMFU Protocol & DID Notes

## Key Findings from FORScan Documentation

### Ford Module Identification
- **Assembly Part Number** (Assy #): Read from module, format like `JK2T-14G371-FCC`
  - Prefix (JK2T) + Core (-14G371-) + Suffix (FCC)
  - Core identifies module type: `-12A650-` = PCM always
- **Calibration Level**: Virtual assy number calculated from all firmware in module
- **Hardware ID**: Read from module
- **SBL (Secondary Boot Loader)**: Loaded into RAM for programming

### Ford Firmware File Types
Each module has multiple firmware files, each with its own DID:
1. **Strategy** — Main application executable (like GM's OS block)
2. **Calibration** — Data/maps for the application (like GM's cal blocks)
3. **Configuration** — Module-specific settings

### Ford DIDs for Module Identification
From FORScan work area, firmware files are identified by DID:
- Each firmware file type has a unique DID
- The DID is used by Ford to identify which firmware slot to read/write

### Standard UDS DIDs Used by Ford
- **0xF188** — ECU Software Number (Strategy part number)
- **0xF120** — Strategy part number (Ford-specific, seen in Mach-E forum)
- **0xF190** — VIN
- **0xF191** — ECU Hardware Number
- **0xF187** — Spare Part Number (Assembly number)
- **0xF189** — ECU Software Version Number
- **0xF18C** — ECU Serial Number
- **0xF197** — System Name / Engine Type

### Ford Programming Sequence (2nd Gen FMFU)
1. Switch to programming mode
2. Load SBL into module RAM
3. For each firmware file:
   a. Open and analyze firmware (VBF format)
   b. Erase flash memory for this firmware
   c. Upload firmware blocks
   d. Verify checksum
4. Check for valid application
5. Exit programming mode

### Ford vs GM Key Differences
| Feature | Ford | GM |
|---------|------|-----|
| Protocol | Standard UDS | GMLAN (modified UDS) |
| Session Control | 0x10 (standard) | 0xA5 (ProgrammingMode) |
| ReadDID | 0x22 (standard) | 0x1A (GMLAN) |
| Firmware Format | VBF files | PPEI .bin containers |
| Cal Segments | 1-3 (Strategy + Cal + Config) | 9 (OS + 8 cals) |
| Security Access | Standard 0x27 | 0x27 with GM-specific levels |
| Boot Loader | SBL loaded into RAM | Built-in bootloader |

### Ford ECU CAN Addresses
- PCM: 0x7E0 / 0x7E8 (same as GM)
- TCM: 0x7E1 / 0x7E9
- ABS: 0x760 / 0x768
- BCM: 0x726 / 0x72E
- IPC: 0x720 / 0x728

### Cummins Notes
Cummins uses standard UDS protocol:
- CM2350/CM2450 ECUs
- Standard UDS DIDs (0xF190 VIN, 0xF188 SW#, etc.)
- Security level 0x05
- Calibration ID format: `DO90066.04` or `HB80320.11`
- ESN (Engine Serial Number) readable via 0xF18C
