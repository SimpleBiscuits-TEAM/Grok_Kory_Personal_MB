# Polaris MG1C400A1T2 Unlock Patch Analysis

## Overview

Analysis of three Polaris Pro R MG1 ECU files (6.25 MB each):
1. **Stock** (Read.bdc) — Original factory calibration
2. **Dynojet-patched** (Read_DynojetPatched.bdc) — Dynojet unlock applied
3. **HPTuners-patched** (Read_HPTunersPatched.bdc) — HPTuners unlock applied

## Dynojet Unlock Pattern

**Total changes: 1 byte**

| Offset | Stock | Dynojet | Description |
|--------|-------|---------|-------------|
| 0x030363 | 0x23 | 0x03 | Primary unlock flag |

The Dynojet unlock is a **minimal single-byte patch**. This byte appears to be a control flag that enables tuning access.

## HPTuners Unlock Pattern

**Total changes: 10 bytes**

| Offset | Stock | HPTuners | Description |
|--------|-------|----------|-------------|
| 0x018E06 | 0x30 | 0x36 | Checksum/version byte 1 |
| 0x018E07 | 0x32 | 0x39 | Checksum/version byte 2 |
| 0x02EE01 | 0x10 | 0x00 | Configuration flag 1 |
| 0x02EE02 | 0xE5 | 0xE4 | Configuration flag 2 |
| 0x03034E | 0xE2 | 0x44 | Lock control byte |
| 0x03034F | 0x0A | 0x00 | Lock control byte 2 |
| 0x030363 | 0x23 | 0x23 | **NOT changed** (different from Dynojet) |
| 0x032C16 | 0x30 | 0x36 | Checksum/version byte 3 |
| 0x032C17 | 0x32 | 0x39 | Checksum/version byte 4 |
| 0x0350AE | 0x30 | 0x36 | Checksum/version byte 5 |
| 0x0350AF | 0x32 | 0x39 | Checksum/version byte 6 |

The HPTuners unlock is more **comprehensive**, modifying multiple configuration and checksum bytes. Notably, it does NOT change offset 0x030363 (which Dynojet changes), suggesting HPTuners uses a different unlock mechanism.

## Key Observations

1. **Different unlock strategies**: Dynojet uses a single flag byte, while HPTuners modifies multiple configuration and checksum regions.

2. **Checksum pattern**: HPTuners changes appear at offsets 0x018E06-07, 0x032C16-17, and 0x0350AE-AF. These byte pairs (0x30→0x36, 0x32→0x39) suggest ASCII character changes or checksum updates:
   - 0x30 = '0', 0x36 = '6'
   - 0x32 = '2', 0x39 = '9'
   - This could indicate version/date strings or CRC/checksum calculations

3. **Configuration flags**: HPTuners modifies 0x02EE01-02 and 0x03034E-0F, which likely control ECU features or restrictions.

4. **Mutual exclusivity**: The two unlocks are not compatible — they use different mechanisms and would conflict if both applied.

## Patch Tool Implementation Strategy

### Patch Detection
- Scan for known byte patterns at the documented offsets
- Identify which unlock (if any) is currently applied
- Report unlock status to user

### Patch Application
- **Apply Dynojet**: Change byte at 0x030363 from 0x23 to 0x03
- **Apply HPTuners**: Change 10 bytes at documented offsets
- **Remove unlock**: Revert all changed bytes to stock values

### Validation
- Verify file size remains 6,553,616 bytes
- Checksum validation (if checksums can be reverse-engineered)
- Byte-range validation to ensure no accidental overwrites

### UI Components
- **Patch status indicator**: Show current unlock type (Stock/Dynojet/HPTuners)
- **Apply/Remove buttons**: Apply or remove the selected unlock
- **Patch comparison**: Show before/after bytes for transparency
- **Custom patch builder**: Allow users to create custom patches by selecting bytes

## Future Work

1. Map unlock addresses to A2L characteristics using the MG1C400A1T2.a2l file
2. Reverse-engineer the checksum algorithm for HPTuners patches
3. Test patch tool with real-world files
4. Extend to other Polaris MG1 variants (MG1C400A1T2, etc.)
5. Create patch templates for common tuning modifications
