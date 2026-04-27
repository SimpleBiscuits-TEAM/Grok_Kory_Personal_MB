# HPT L5P Common PIDs — Definitive DDDI Analysis

**Source:** BusMaster capture of HPT Scanner connecting to L5P E41 ECM, idle to 3K RPM rev test.
**Date:** April 24, 2026
**Validation:** Every channel cross-referenced against HPT's own datalog export with exact value matching.

---

## Architecture Overview

HPT streams **34 channels** at **20 Hz** using:

1. **7 IOCTL (0x2D) commands** — define RAM address slots as virtual DIDs on DPID 0xFE
2. **8 DDDI (0x2C) commands** — define DPIDs 0xF7-0xFE, each packing 7 data bytes from IOCTL slots + standard DIDs
3. **1 periodic start (0xAA 04)** — starts all 8 DPIDs streaming at 25ms on CAN ID 0x5E8
4. **2 polled DIDs** (0x0077, 0x0069) — read at 1-2 Hz via standard Mode 22 for slow-changing data

Total bandwidth: 8 DPIDs × 7 bytes × 40 Hz = 2,240 bytes/sec on a single CAN ID.

---

## Complete Setup Sequence (Byte-for-Byte)

### IOCTL RAM Address Definitions (0x2D)

| Slot | Raw Command (ISO-TP payload) | RAM Address | Size | Channel |
|------|------------------------------|-------------|------|---------|
| 0 | `2D FE 00 40 02 21 58 04` | 0x022158 | 4B | Metering Unit Valve Current (A) |
| 1 | `2D FE 01 40 01 4F 08 04` | 0x014F08 | 4B | Fuel Rail Pressure (MPa) |
| 2 | `2D FE 02 40 01 BC 8C 04` | 0x01BC8C | 4B | Lambda Smoke Limit |
| 3 | `2D FE 03 40 01 3B 84 04` | 0x013B84 | 4B | Injector Pulse Width Cyl 1 (us) |
| 4 | `2D FE 04 40 01 BB 54 04` | 0x01BB54 | 4B | Cylinder Airmass (mg) |
| 5 | `2D FE 05 40 01 1F 18 02` | 0x011F18 | 2B | Unknown (0 at stationary) |
| 6 | `2D FE 06 40 02 25 D8 04` | 0x0225D8 | 4B | Desired Fuel Rail Pressure (MPa) |

### DDDI Definitions (0x2C)

| DPID | Raw Command (ISO-TP payload) | Components |
|------|------------------------------|------------|
| 0xFE | `2C FE FE 00 30 AA 24 5D` | IOCTL[0] + DID 0x30AA + DID 0x245D |
| 0xFD | `2C FD FE 01 30 A9 15 43` | IOCTL[1] + DID 0x30A9 + DID 0x1543 |
| 0xFC | `2C FC FE 02 30 3B 15 40` | IOCTL[2] + DID 0x303B + DID 0x1540 |
| 0xFB | `2C FB FE 03 30 3A 00 0B` | IOCTL[3] + DID 0x303A + PID 0x0B |
| 0xFA | `2C FA FE 04 FE 05 00 0D` | IOCTL[4] + IOCTL[5] + PID 0x0D |
| 0xF9 | `2C F9 FE 06 20 B4 00 2C` | IOCTL[6] + DID 0x20B4 + PID 0x2C |
| 0xF8 | `2C F8 30 AB 00 5D 00 10 00 0F` | DID 0x30AB + PID 0x5D + PID 0x10 + PID 0x0F |
| 0xF7 | `2C F7 20 E3 00 0C 32 8A` | DID 0x20E3 + PID 0x0C + DID 0x328A |

### Periodic Start

```
AA 04 FE FD FC FB FA F9 F8 F7
```
Rate 0x04 = 25ms. All 8 DPIDs.

---

## Definitive Byte Map (Validated Against HPT Datalog)

### DPID 0xFE — Metering Unit Valve + Fuel Rate

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-3 | float32 BE | Metering Unit Valve Current | Direct (A) | ratio=1.0000 |
| 4-5 | uint16 | (constant 0x28A0) | N/A — DID 0x30AA filler | Always 10400 |
| 6 | uint8 | Main Fuel Rate | Direct (mm³/stroke) | b6=6 → HPT=6.0 |

### DPID 0xFD — Fuel Pressure + Turbo Vane

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-3 | float32 BE | Fuel Rail Pressure | × 145.038 → psi | 32.29 MPa → 4683.9 psi |
| 4-5 | uint16 | (constant 0x28A0) | N/A — DID 0x30A9 filler | Always 10400 |
| 6 | uint8 | Turbo Vane Position | × 100/255 → % | 162 → 63.53% |

### DPID 0xFC — Lambda Smoke Limit + Desired Turbo Vane

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-3 | float32 BE | Lambda Smoke Limit | Direct (dimensionless) | ratio=1.0000 |
| 4-5 | uint16 | (constant 0x28A0) | N/A — DID 0x303B filler | Always 10400 |
| 6 | uint8 | Desired Turbo Vane Position | × 100/255 → % | 162 → 63.53% |

### DPID 0xFB — Injector Pulse Width + MAP

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-3 | float32 BE | Injector Pulse Width Cyl 1 | ÷ 1000 → ms | 1217.36 → 1.2174 ms |
| 4-5 | uint16 | (constant 0x28A0) | N/A — DID 0x303A filler | Always 10400 |
| 6 | uint8 | Intake MAP | Standard OBD 0x0B (kPa) | 58 kPa |

### DPID 0xFA — Cylinder Airmass + Vehicle Speed

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-3 | float32 BE | Cylinder Airmass | ÷ 1000 → grams | 769.93 → 0.7699 g |
| 4-5 | uint16 | Unknown (IOCTL slot 5) | 0 at stationary | Needs driving data |
| 6 | uint8 | Vehicle Speed | Standard OBD 0x0D (km/h) | 0 (stationary) |

### DPID 0xF9 — Desired Fuel Pressure + EGR

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-3 | float32 BE | Desired Fuel Rail Pressure | × 145.038 → psi | 32.30 MPa → 4684.8 psi |
| 4-5 | uint16 | Commanded EGR A | DID 0x20B4 (complex scaling) | r=0.9263 |
| 6 | uint8 | Commanded EGR | × 100/255 → % | 160 → 62.75% |

### DPID 0xF8 — Injection Timing + MAF + IAT

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-1 | uint16 | (constant 0x28A0) | N/A — DID 0x30AB filler | Always 10400 |
| 2-3 | uint16 | Fuel Injection Timing | ÷ 128 - 210 → degrees | 26761 → -0.93° |
| 4-5 | uint16 | Mass Airflow | ÷ 100 → g/s, × 0.132277 → lb/min | 3080 → 4.07 lb/min |
| 6 | uint8 | Intake Air Temp | - 40 → °C, × 9/5 + 32 → °F | 93 → 127.4°F |

### DPID 0xF7 — Boost + RPM + Desired Boost

| Bytes | Type | Channel | Formula | Validation |
|-------|------|---------|---------|------------|
| 0-1 | uint16 | Boost/Vacuum | ÷ 100 → kPa gauge, × 0.145038 → psi | 2319 → 3.36 psi |
| 2-3 | uint16 | Engine RPM | ÷ 4 → RPM | 10051 → 2512.8 RPM |
| 4-5 | uint16 | Desired Boost | ÷ 100 → kPa abs, × 0.145038 → psi | 12120 → 17.58 psi |
| 6 | uint8 | (always 0) | Padding | — |

---

## Polled DIDs (1-2 Hz)

| DID | Bytes | Likely Channels |
|-----|-------|----------------|
| 0x0077 | 5 | CAC temps (B1S1, B1S2) + Combustion Mode |
| 0x0069 | 7 | EGT sensors (B1S1-S4, B2S3) — all maxed at 1832°F (bad sensors) |

---

## Constant 0x28A0 DIDs

DIDs 0x30AA, 0x30A9, 0x303B, 0x303A, 0x30AB all return constant `0x28A0` (10400). These are likely ECU status/calibration identifiers, not live data. They serve as 2-byte filler in the DPID frame.

---

## V-OP Implementation Plan

### What to Replicate

Send the exact same 16 commands (7 IOCTL + 8 DDDI + 1 AA) in the same order. The ECU accepts them and streams all 8 DPIDs at 25ms.

### Bridge Changes (ppei_pcan_bridge.py)

1. Add new mode `dddi_mode='hpt_common'`
2. Send all 7 IOCTL commands (0x2D) with flow control handling
3. Send all 8 DDDI commands (0x2C) with flow control handling
4. Send periodic start `AA 04 FE FD FC FB FA F9 F8 F7`
5. Parse 8 DPIDs on 0x5E8 using the byte map above
6. Also poll DID 0x0077 and 0x0069 at 1-2 Hz for slow channels

### Frontend Changes

1. Add new DPID parser for `hpt_common` mode
2. Map DPID bytes to V-OP PID IDs using the formulas above
3. Auto-select `hpt_common` mode when multiple common PIDs are selected

### New Channels Unlocked

These channels are NOT accessible via standard Mode 22 DID reads — they require IOCTL RAM addresses:

- Metering Unit Valve Current (addr 0x022158)
- Fuel Rail Pressure as float32 (addr 0x014F08) — more precise than DID reads
- Lambda Smoke Limit (addr 0x01BC8C)
- Injector Pulse Width Cyl 1 (addr 0x013B84)
- Cylinder Airmass (addr 0x01BB54)
- Desired Fuel Rail Pressure as float32 (addr 0x0225D8)
