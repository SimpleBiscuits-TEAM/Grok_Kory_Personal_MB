# IntelliSpy Capture Analysis: HPT Fuel Rate DDDI Setup

**Date**: 2026-04-24  
**Capture**: `intellispy_capture_2026-04-24T16-27-12-381Z.csv`  
**Purpose**: Decode HPT's DDDI setup for RPM + fuel flow mm³ PID  
**Vehicle**: 2019 GMC Sierra HD, L5P Duramax, E41 ECM

---

## Capture Summary

| Metric | Value |
|--------|-------|
| Total frames | 50,000 |
| 0x7E0 (ECM requests) | 6 unique |
| 0x7E8 (ECM responses) | 10 (5 unique, duplicated) |
| 0x5E8 (DDDI stream) | ~333 DPID 0xFE samples |
| Duration | ~11 seconds |

---

## Full Diagnostic Sequence (Chronological)

```
→ 0x7E0: 06 2C FE 00 0C 24 5D 00   DDDI Define DPID 0xFE
← 0x7E8: 02 6C FE                    Positive response (DDDI OK)
→ 0x7E0: 03 AA 04 FE                 $AA Start periodic, rate=medium(25ms), DPID=0xFE
→ 0x7E0: 01 3E                       TesterPresent (keepalive)
← 0x7E8: 01 7E                       TesterPresent OK
   ... (TesterPresent every ~2.8s) ...
→ 0x7E0: 02 AA 00                    $AA Stop all periodic
← 0x7E8: 01 60                       Return to default session OK
```

**Key observations:**
- NO 0x2D (IOCTL) commands — HPT does NOT use RAM address mapping for fuel rate
- NO extended diagnostic session (0x10 03) — operates in default session
- NO security access — no 0x27 commands
- Single 0x2C command defines the entire DPID

---

## DDDI Define Command Decode

### Raw bytes: `06 2C FE 00 0C 24 5D 00`

| Byte | Hex | Meaning |
|------|-----|---------|
| 0 | 0x06 | PCI length (6 payload bytes) |
| 1 | 0x2C | Service: DynamicallyDefineDataIdentifier |
| 2 | 0xFE | DPID number (254) |
| 3 | 0x00 | Payload byte 1 |
| 4 | 0x0C | Payload byte 2 |
| 5 | 0x24 | Payload byte 3 |
| 6 | 0x5D | Payload byte 4 |
| 7 | 0x00 | CAN frame padding |

### Format interpretation

The payload after `2C FE` is: `00 0C 24 5D`

**Competing theories:**

1. **GMW3110 single-element**: `pos=0x00, DID=0x0C24, size=0x5D(93)` — size=93 is impossible for 7-byte DPID
2. **Two-DID packed**: `DID1=0x000C (RPM), DID2=0x245D (fuel rate)` — ECU infers sizes from DID definitions
3. **Two 2-byte elements**: `[pos=0, ref=0x0C] [pos=0x24, ref=0x5D]` — unusual format

**Most likely**: The exact internal format is proprietary to GM's E41 ECU. What matters is that the command works and produces the correct stream data.

---

## DPID 0xFE Stream Layout (Verified)

From 0x5E8 periodic frames:

| Byte | Content | Format | Example |
|------|---------|--------|---------|
| 0 | DPID ID | Always 0xFE | 0xFE |
| 1-2 | Engine RPM | Big-endian uint16, ×0.25 | 0x095F = 599.75 RPM |
| 3 | Fuel Rate | uint8, mm³/stroke | 0x06 = 6 mm³ |
| 4-7 | Unused | Always 0x00 | 0x00000000 |

### Fuel Rate Statistics

| Metric | Value |
|--------|-------|
| Range | 0–14 mm³/stroke |
| Idle (~600 RPM) | 6 mm³ |
| Elevated RPM (~1400 RPM) | 8–14 mm³ |
| HPT ground truth (idle) | 6 mm³ ✓ |
| HPT ground truth (3000 RPM) | 10 mm³ |
| Resolution | 1 mm³ (integer) |
| Scaling | None (raw = value) |

---

## Comparison: V-OP FRP Setup vs HPT Fuel Rate Setup

| Aspect | V-OP FRP Setup | HPT Fuel Rate Setup |
|--------|---------------|---------------------|
| IOCTL 0x2D | 2 commands (RAM addresses) | None |
| DDDI 0x2C | 2 commands (FE + FD) | 1 command (FE only) |
| Session | Extended (0x10 03) | Default |
| DPIDs | 0xFE (FRP_ACT) + 0xFD (FRP_DES) | 0xFE only |
| Data format | IEEE 754 float32 (MPa) | uint16 RPM + uint8 fuel |
| Periodic rate | Medium (25ms) | Medium (25ms) |
| Stream CAN ID | 0x5E8 | 0x5E8 |

---

## Implementation: Replicate HPT's Exact Command

To get per-injection fuel rate in V-OP, send HPT's exact bytes:

```python
# Step 1: Define DPID 0xFE for RPM + fuel rate
dddi_define = bytes([0x2C, 0xFE, 0x00, 0x0C, 0x24, 0x5D])

# Step 2: Start periodic streaming
periodic_start = bytes([0xAA, 0x04, 0xFE])

# Step 3: Parse 0x5E8 stream
# byte 0 = 0xFE (DPID)
# byte 1-2 = RPM raw (big-endian, ×0.25)
# byte 3 = fuel rate (integer mm³/stroke)
```

**Important**: This REPLACES the existing FRP DDDI setup on DPID 0xFE. Cannot run both simultaneously. Options:
1. Use a different DPID (e.g., 0xFC) for fuel rate
2. Switch between FRP and fuel rate modes
3. Combine both into a single DPID (if ECU supports multi-element define)

---

## Next Steps

1. **Option A (Safe)**: Add HPT's exact `2C FE 00 0C 24 5D` command as an alternative DDDI mode
2. **Option B (Investigate)**: Try `22 24 5D` (Mode 22 read DID 0x245D) on the truck
3. **Option C (Investigate)**: Try `22 0C 24` (Mode 22 read DID 0x0C24) on the truck
4. Fix NRC detection in pcanConnection.ts
5. Remove DID 0x1638 from presets (confirmed NRC 0x22 on L5P)
6. Relabel DID 0x20E3 as total fuel flow rate (scales with RPM)
