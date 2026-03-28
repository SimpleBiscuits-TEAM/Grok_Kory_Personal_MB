# E42 (2024 L5P Gen2) A2L Analysis - Logging Tool Relevance

## File Summary
- **A2L**: E42_12737238.a2l (48MB, 1.56M lines)
- **Binary**: E42_12737238.bin (12MB)
- **CHARACTERISTICs**: 50,636 calibration maps
- **MEASUREMENTs**: 0 (none defined - unusual, means no live-read addresses)
- **COMPU_METHODs**: 2,575 scaling formulas
- **RECORD_LAYOUTs**: 44
- **AXIS_PTS**: 2,668 shared axis definitions
- **Byte Order**: Mixed (MSB_LAST primary, some MSB_FIRST)
- **Address Range**: 0x500000 - 0xBBF000 (maps directly into binary, base address = 0)

## CAN Diagnostic Addressing (from binary)
| Direction | Service | CAN ID (Extended) | Standard |
|-----------|---------|-------------------|----------|
| RX | OBD Functional | 0x10DB7EF1 | 0x7DF |
| RX | OBD Physical | 0x14DA11F1 | 0x1F1 |
| RX | AllNodeSpNet | 0x10EBFEF1 | 0x6F1 |
| TX | USDT Response | 0x14DA11F1 | 0x1F1 |

**Key insight**: The E42 uses extended CAN IDs (29-bit) for UDS diagnostics, not standard 11-bit. The OBD functional address is 0x7DF (standard) but physical addressing uses 0x14DA11F1 (extended). This is critical for ELM327/PCAN communication.

## Logging-Relevant Map Categories
| Category | Count | Notes |
|----------|-------|-------|
| DTC/Fault Thresholds | 8,076 | Every fault condition, trigger type, enable criteria |
| Fuel System (Rail Pressure) | 3,389 | FHPC subsystem, PCV duty, rail targets |
| Boost/Turbo/VGT | 1,685 | CHGR subsystem, vane position, boost targets |
| EGT/Exhaust | 1,244 | EGTC/SOTC subsystems, temp limits |
| Transmission/TCC | 1,094 | TCCM, shift tables, lockup strategy |
| DPF/DEF/Emissions | 1,189 | Regen strategy, soot model, SCR dosing |
| Torque Management | 1,158 | ETQC subsystem, torque limits |
| Injector/Timing | 1,158 | SOI timing, pulse width, cylinder balance |
| OBD Monitor Enable | 132 | Readiness flags, IUMPR counters |
| Speed/RPM Limits | 82 | Rev limiters, speed governors |
| **TOTAL** | **20,289** | **40% of all maps are logging-relevant** |

## Key Fault Thresholds (from binary)
| Parameter | Value | Unit |
|-----------|-------|------|
| EGT Cat Upstream Temp Disable CL | 700.0 | degC |
| EGT Cat Down Over Temp (warmup) | 300.0 | degC |
| EGT Derivative Positive (steady) | 50.0 | degC/s |
| EGT Derivative Positive (warmup) | 15.0 | degC/s |
| EGT Derivative Negative (steady) | -10.0 | degC/s |
| EGT Integration Negative | -20.0 | degC |
| Total Exhaust Temp Model Threshold | 50.0 | degC |

## Fault-to-DID Mapping (what gets frozen on fault)
| Fault Condition | Freeze Frame DID |
|-----------------|-----------------|
| FRP_TooLo (P0087) | 0x0023 |
| FRP_TooHi (P0088) | 0x0023 |
| Boost Control Position | 0x0014 |
| Boost Control Performance | 0x0014 |
| EGT Sensor Circuit (all banks) | 0x0024 |
| TCC Incorrect Ratio | 0x0017 |
| TCC Shift Pending | 0x0027 |

## ELM327/PCAN Implications
1. **No MEASUREMENT blocks** = no predefined live-read addresses. This means you can't do traditional XCP/CCP measurement protocol reads.
2. **But** the CHARACTERISTICs have addresses = you CAN read calibration values via UDS ReadMemoryByAddress (0x23) if security access is granted.
3. **1,683 UDS DID entries** = these are the freeze frame data identifiers. With Mode 22 (ReadDataByIdentifier), you can read these DIDs live.
4. **Extended CAN IDs required** = ELM327 needs `ATSP 6` (ISO 15765-4 CAN 29-bit 500kbps) or manual header setup.
5. **Security access** = 373 security-related maps suggest multiple security levels. Level 1 may allow reads, higher levels for writes.

## What You Could Build with ELM327 + This A2L
- **Live DID reader**: Read all 1,683 DIDs via Mode 22 for real-time monitoring
- **Calibration verification**: ReadMemoryByAddress to verify map values match expected
- **Fault threshold display**: Show the actual ECU thresholds alongside live data
- **Freeze frame decoder**: Use DID mappings to decode exactly what was captured on fault
- **Monitor readiness**: Read the 55 OBD readiness monitor states
