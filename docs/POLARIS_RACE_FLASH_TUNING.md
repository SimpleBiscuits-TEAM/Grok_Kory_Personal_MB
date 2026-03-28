# Polaris Pro R Race Flash Tuning Analysis

## Overview

Comparison of two Polaris Pro R MG1 ECU files:
1. **Stock** (PolarisRZRProR(Original)-562590.bin) — Original factory calibration (6.3 MB)
2. **Tuned** (ProR_PolarisRaceFlash(OSNameChange).bdc) — Race Flash performance tune (6.3 MB)

## Tuning Scope

**Total changes: 4,127 regions** across the entire calibration

This is a **comprehensive performance tune**, not just an unlock. The modifications span every major performance parameter in the ECU.

## Change Distribution

### By Region Size

| Size Range | Count | Typical Purpose |
|---|---|---|
| 1 byte | 2,847 | Flags, enable/disable bits |
| 2-4 bytes | 1,023 | Scalar values, thresholds |
| 5-99 bytes | 187 | Small lookup tables |
| 100-999 bytes | 68 | Medium maps |
| 1KB-9KB | 2 | Large maps (fuel, boost, timing) |

### Large Modification Zones (>1KB)

| Offset | Size | Likely Purpose |
|--------|------|---|
| 0x6148C5 - 0x615829 | 3,941 bytes | Fuel injection map or boost control |
| 0x6176AF - 0x6185FC | 3,918 bytes | Timing advance map or torque limiter |
| 0x622092 - 0x6243F3 | 9,058 bytes | **Largest zone** — primary performance map |
| 0x625E72 - 0x6281D3 | 9,058 bytes | **Largest zone** — secondary performance map |

### Characteristic Change Patterns

1. **Flag bytes** (0x00 → 0xFF or 0xFF → 0x00):
   - Offsets: 0x3C2778, 0x3C28D2, 0x3C28E4
   - Purpose: Enable/disable performance features

2. **Version/Date strings** (ASCII changes):
   - 0x24014A: 0x31393133 → 0x36323831 ("1913" → "6281")
   - 0x3C014A: 0x31393133 → 0x36323831 (same pattern)
   - Purpose: Calibration version tracking

3. **Lookup table changes**:
   - Multiple 256-byte regions (0x035158, 0x53FAF8)
   - Multiple 512-byte regions throughout 0x3C-0x3E range
   - Purpose: Fuel maps, boost curves, timing tables

4. **Control parameter changes**:
   - Regions with single-byte changes (0x1B0337: 0xD6 → 0x18)
   - Regions with 4-byte changes (0x24014D: 0x31393133 → 0x36323831)
   - Purpose: Thresholds, limits, calibration factors

## Comparison with Unlock Patches

| Modification Type | Changes | Scope | Purpose |
|---|---|---|---|
| Dynojet Unlock | 1 byte | Single flag | Enable tuning access |
| HPTuners Unlock | 10 bytes | Checksums + flags | Enable tuning access |
| Race Flash Tuning | 4,127 regions | Entire calibration | Performance optimization |

## Key Observations

1. **Comprehensive recalibration**: Unlike unlocks that modify only access flags, Race Flash modifies every major performance parameter.

2. **Dual-zone strategy**: Two 9,058-byte zones suggest mirrored or redundant maps (common for fail-safe ECU design).

3. **Version tracking**: The ASCII version changes ("1913" → "6281") allow identifying which tuning version is applied.

4. **Modular structure**: Changes cluster in specific address ranges (0x3C-0x3E, 0x61-0x62), suggesting modular ECU memory layout.

5. **Flag-heavy approach**: ~69% of changes are single-byte flag modifications, indicating a feature-flag-based tuning strategy.

## Patch Tool Implications

### Detection Strategy
- Scan for known version strings (0x24014A, 0x3C014A) to identify tuning version
- Check flag bytes (0x3C2778, 0x3C28D2) to detect enable/disable state
- Compare against known tuning signatures

### Application Strategy
- **Unlock patches**: Apply sequentially (Dynojet OR HPTuners, not both)
- **Tuning files**: Replace entire regions to avoid partial/corrupt states
- **Custom patches**: Allow byte-level editing with validation

### Safety Considerations
- **Backup before tuning**: Always save original before applying tuning
- **Checksum validation**: Verify file integrity after patch application
- **Version tracking**: Log which tuning was applied and when
- **Rollback capability**: Store undo history for all changes

## Future Work

1. Map large zones (0x6148C5, 0x6176AF, 0x622092, 0x625E72) to A2L characteristics
2. Reverse-engineer the tuning algorithm to understand performance gains
3. Create custom tuning templates for common modifications (boost, fuel, timing)
4. Implement patch merging (combine multiple tunings safely)
5. Build tuning comparison tool to show before/after maps
