# L5P E41 Duramax — PID Reference (HP Tuners + BUSMASTER Confirmed)

**Date:** April 22, 2026
**Source:** HP Tuners PID sniff CSV + BUSMASTER CAN log (BUSMASTERLogFile_FullPIDsChannelListHPT4.21.26)
**ECU:** E41 (2017-2023 L5P) / E42 (2024+ L5P)
**Protocol:** UDS Mode 22 (ReadDataByIdentifier) on CAN 0x7E0→0x7E8

---

## Summary

HP Tuners logs 93 channels from the L5P using a combination of:
- **Standard OBD-II Mode 01 PIDs** (0x00-0xFF range) — RPM, Speed, ECT, MAF, Load, etc.
- **UDS Mode 22 DIDs** (0x0500+ range) — GM-proprietary diesel parameters
- **GM Diesel Proprietary DIDs** (0x30xx range) — FRP, Throttle, ECT, DEF, DPF
- **Multi-frame ISO-TP DIDs** (0x0069, 0x006A, 0x0071, 0x007A, 0x008B) — EGT, NOx, Exhaust Pressure

---

## Confirmed DID Scaling (Cross-referenced BUSMASTER raw bytes ↔ HP Tuners values)

### Fuel System

| DID | Name | Bytes | Formula | Unit | Confirmed |
|------|------|-------|---------|------|-----------|
| 0x0564 | FRP Commanded | 2 | (A×256+B) × 0.00390625 | MPa | Yes (existing) |
| 0x0565 | FRP Actual | 2 | (A×256+B) × 0.00390625 | MPa | Yes (existing) |
| 0x054A | FRP Deviation | 2 | ((A×256+B) - 32768) × 0.00390625 | MPa | Yes (existing) |
| 0x056C | Injection Timing | 2 | ((A×256+B) - 32768) × 0.0078125 | °BTDC | Yes (existing) |
| 0x056D | Injection Quantity | 2 | (A×256+B) × 0.01 | mm³/stroke | Yes (existing) |
| 0x0549 | FPR Current | 1 | 400 + (A/255) × 1400 | mA | Yes (existing) |
| 0x30BC | FRP Desired (HPT) | 2 | (A×256+B) × 1.39 | kPa | **NEW — confirmed** |
| 0x30C1 | FRP Actual (HPT) | 2 | (A×256+B) × 1.39 | kPa | **NEW — confirmed** |
| 0x005D | Injection Timing (SAE) | 2 | ((A×256+B) - 26880) / 128 | °BTDC | **NEW** |

### Turbo / Boost

| DID | Name | Bytes | Formula | Unit | Confirmed |
|------|------|-------|---------|------|-----------|
| 0x0572 | Boost Commanded | 2 | (A×256+B) × 0.0078125 | kPa | Yes (existing) |
| 0x0573 | Boost Actual | 2 | (A×256+B) × 0.0078125 | kPa | Yes (existing) |
| 0x0574 | VGT Commanded | 1 | (A×100) / 255 | % | Yes (existing) |
| 0x0575 | VGT Actual | 1 | (A×100) / 255 | % | Yes (existing) |
| 0x0576 | Turbo Speed | 2 | (A×256+B) × 4 | RPM | Yes (existing) |

### Engine / Torque

| DID | Name | Bytes | Formula | Unit | Confirmed |
|------|------|-------|---------|------|-----------|
| 0x0062 | Actual Engine Torque % | 1 | A - 125 | % | **NEW** |
| 0x0063 | Reference Torque | 2 | (A×256+B) | Nm | **NEW** |
| 0x30BE | Diesel Commanded Throttle | 2 | (A×256+B) × 0.1 | % | **NEW — confirmed: 1000→100%** |
| 0x30D5 | ECT (Diesel) | 1 | A - 40 | °C | **NEW — confirmed: 120→80°C** |

### Exhaust / EGT / DPF

| DID | Name | Bytes | Formula | Unit | Confirmed |
|------|------|-------|---------|------|-----------|
| 0x0580 | EGT Pre-Turbo | 2 | (A×256+B) × 0.1 - 40 | °C | Yes (existing) |
| 0x0581 | EGT Post-Turbo | 2 | (A×256+B) × 0.1 - 40 | °C | Yes (existing) |
| 0x0069 | EGT Bank Extended | 7 (multi-frame) | byte1-2: (B×256+C) × 0.1 - 40 | °C | **NEW** |
| 0x0071 | NOx Concentration | 6 (multi-frame) | byte1-2: (B×256+C) × 0.05 | ppm | **NEW** |
| 0x007A | NOx O2 Concentration | 7 (multi-frame) | byte1-2: (B×256+C) × 0.001 - 12 | % | **NEW** |
| 0x006A | Exhaust Gas Pressure | 5 (multi-frame) | (A×256+B) × 0.03125 | kPa | **NEW** |
| 0x008B | Diesel Particulate Matter | 7 (multi-frame) | byte1-2: (B×256+C) × 0.01 | mg/m³ | **NEW** |
| 0x328A | DPF Regen Percentage | 2 | (A×256+B) × 0.01 | % | **NEW — confirmed** |
| 0x30DA | DPF Soot Load % | 1 | A | % | **NEW** |
| 0x30CA | Injection Pattern Active | 1 | A (bitmask) | — | **NEW** |

### DEF / Emissions

| DID | Name | Bytes | Formula | Unit | Confirmed |
|------|------|-------|---------|------|-----------|
| 0x30D7 | DEF Tank Level | 1 | (A×100) / 255 | % | **NEW — confirmed: 97→38.04%** |
| 0x308A | Barometric Pressure | 2 | (A×256+B) × 0.03125 | kPa | **NEW — confirmed: 3245→101.4 kPa** |

### Misc

| DID | Name | Bytes | Formula | Unit | Confirmed |
|------|------|-------|---------|------|-----------|
| 0x1141 | Fuel Tank Level | 1 | A × 0.2275 | gal | **NEW — derived** |
| 0x90D6 | VIN Program Counter | 1 | A | — | **NEW** |

---

## BUSMASTER CAN Frame Analysis

### Request Pattern
HP Tuners sends Mode 22 requests on 0x7E0 (ECM) and 0x7E2 (TCM):
```
7E0: 03 22 XX XX 00 00 00 00   (single-frame Mode 22 request)
7E2: 03 22 XX XX 00 00 00 00   (TCM request)
```

### Response Pattern
ECM responds on 0x7E8, TCM on 0x7EA:
```
7E8: 05 62 XX XX [data]        (single-frame: ≤4 data bytes)
7E8: 10 0A 62 XX XX [data]     (multi-frame first frame, followed by consecutive frames)
```

### Multi-frame DIDs (ISO-TP)
These require ISO-TP reassembly — the bridge handles this automatically:
- 0x0069: 7 data bytes (EGT extended)
- 0x006A: 5 data bytes (exhaust pressure)
- 0x0071: 6 data bytes (NOx)
- 0x007A: 7 data bytes (NOx O2)
- 0x008B: 7 data bytes (DPM)

### Polling Rate
HP Tuners polls all 25 DIDs in a round-robin loop at ~10 Hz aggregate (each DID polled ~0.4 Hz with 25 DIDs in the loop).

---

## HP Tuners Channel List (93 channels from CSV)

The 93 channels include computed/derived values beyond the raw DIDs:
- Raw DID values (25 Mode 22 + 8 Mode 01)
- Computed channels: HP, Torque (ft-lb), Boost (psi from kPa), FRP (psi from MPa)
- Derived channels: Fuel economy, gear ratio, transmission efficiency
- Status channels: DTC count, MIL status, readiness monitors

---

## Notes for Datalogger Testing

1. **Multi-frame DIDs** require ISO-TP support in the PCAN bridge — verify the bridge handles flow control correctly
2. **0x30xx DIDs** are GM-proprietary and may not respond on all L5P calibrations — test with both stock and tuned ECUs
3. **0x90D6 (VIN Program Counter)** increments each time the ECU is flashed — useful for detecting reflashes
4. **Duplicate DID numbers** (0x308A, 0x328A, 0x1141) have different meanings on diesel vs gasoline platforms — the datalogger resolves by fuelType context
5. **Scaling confirmation method:** Raw CAN byte × formula = HP Tuners displayed value (within rounding tolerance)
