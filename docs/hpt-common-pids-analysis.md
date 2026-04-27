# HPT Common L5P PIDs — IntelliSpy Analysis

## Executive Summary

HPT streams 34 channels at ~20 Hz using **8 DPIDs (0xF7-0xFE)** on CAN ID 0x5E8 via GM's DDDI (0x2C) service, plus **2 polled DIDs (0x0077, 0x0069)** at ~1 Hz. Each DPID carries 7 data bytes (1 DPID ID + 7 payload), giving 56 bytes of streaming data per cycle.

## HPT Architecture

### DDDI Command Format (Confirmed)

The 0x2C command format is:

```
2C <DPID_ID> [DID_hi DID_lo] [DID_hi DID_lo] ...
```

Each referenced DID contributes its **full response bytes** to the DPID payload sequentially. The ECU knows how many bytes each DID returns and concatenates them.

**Confirmed by fuel rate test:**
- `2C FE 00 0C 24 5D` → DID 0x000C (RPM, 2 bytes) + DID 0x245D (fuel qty, 1 byte)
- DPID 0xFE bytes: [RPM_hi][RPM_lo][fuel_qty][00][00][00][00]

### Setup Sequence (from April 22 capture)

1. **DID Probing Phase**: HPT sends ~60 single-frame `04 2C FE 00 <byte>` commands to test which 1-byte DID references the ECU supports. 24 accepted, 32 rejected.

2. **Multi-frame DPID Definitions**: HPT sends 0x2C commands via ISO-TP multi-frame to define each DPID with specific DID references.

3. **Periodic Scheduling**: `AA 04 FE FD FC FB FA F9 F8` starts all 7 DPIDs at 25ms rate.

4. **Polled DIDs**: `22 00 77` and `22 00 69` are polled every ~500ms-1s for additional data.

### Captured DPID Definitions

| DPID | 0x2C Payload | DID References | Status |
|------|-------------|----------------|--------|
| 0xFE | `2C FE 00 0C 24 5D` | PID 0x0C (RPM) + DID 0x245D (Fuel Qty) | **Fuel rate mode — CONFIRMED** |
| 0xFD | `2C FD 00 4F 00 10 00 0A` | PID 0x4F (4B) + PID 0x10 (MAF, 2B) + PID 0x0A (1B) | Captured |
| 0xFB | `2C FB 20 B4 30 BE 32 8A 00 0D` | DID 0x20B4 + DID 0x30BE + DID 0x328A + PID 0x0D (VSS) | Captured |
| 0xF8 | `2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C` | 7 DIDs, 1 byte each | Captured |
| 0xF9 | `2C F9 30 8A 13 2A ...` (partial) | DID 0x308A + DID 0x132A + ... | Partial (cancelled by F8) |
| 0xFC | Not captured | Unknown | Missing |
| 0xFA | Not captured | Unknown | Missing |
| 0xF7 | Not captured | Unknown | Missing |

### Accepted 1-Byte DID References

These single-byte references were accepted by the ECU during HPT's probing phase:

```
0x01, 0x04, 0x0F, 0x1E, 0x21, 0x2C, 0x30, 0x41, 0x42, 0x46, 0x4A, 0x4F,
0x5B, 0x5C, 0x61, 0x67, 0x68, 0x69, 0x6A, 0x71, 0x77, 0x7A, 0x87, 0x8B
```

### HPT's 88 Mode 22 DIDs (Initial Scan)

HPT reads these DIDs during initialization to discover what the ECU supports:

```
0x1131, 0x1135, 0x114D, 0x1152, 0x1154, 0x1158, 0x115C, 0x115D, 0x115E,
0x116F, 0x11BB, 0x11EB, 0x11F8, 0x11FA, 0x1200, 0x1202, 0x1206, 0x1208,
0x1232, 0x1233, 0x1234, 0x1237, 0x1238, 0x1239, 0x12BD, 0x12DA, 0x130E,
0x131D, 0x131F, 0x1337, 0x13B5, 0x13C8, 0x1502, 0x150D, 0x1540, 0x1543,
0x1561, 0x1677, 0x169C, 0x1942, 0x2000, 0x2002, 0x2006, 0x201B, 0x201E,
0x2022, 0x2024, 0x204C, 0x2070, 0x2083, 0x2084, 0x2085, 0x208B, 0x20AC,
0x20AF, 0x20B2, 0x20B4, 0x20B6, 0x20B8, 0x20BA, 0x20BC, 0x20DE, 0x20E2,
0x20E3, 0x232C, 0x2331, 0x2428, 0x2434, 0x2437, 0x244E, 0x244F, 0x247C,
0x2489, 0x24A0, 0x303B, 0x3088, 0x308A, 0x30BD, 0x30BF, 0x30C1, 0x30CA,
0x30D5, 0x30DD, 0x30DE, 0x321B, 0x3298, 0x32A8, 0x90D6
```

## Confirmed Channel Mappings

### By Value Range (from streaming data)

| DPID | Bytes 0-3 (float32) | Byte 6 | Confidence |
|------|---------------------|--------|------------|
| 0xFE | MUV Current Setpoint (1.23-1.99 A) | Main Fuel Rate (0-11 mm³) | **HIGH** — exact range match |
| 0xFC | Lambda Smoke Limit (0.50-0.87) | TBD | **HIGH** — exact range match |
| 0xFB | Engine RPM (~598 at idle) | TBD (14-162 range) | **HIGH** — exact idle match |
| 0xFA | Unknown (~960 at idle) | 0 (constant, likely VSS=0) | Medium |
| 0xF9 | Unknown (32-140 range) | IAT raw (91-94 → 124-129°F) | **HIGH** for byte6 |
| 0xFD | Unknown (32-140 range) | TVP or EGR (11-164 → 4-64%) | Medium |
| 0xF7 | 0 (constant) | 0 (constant) | Low — no variation |
| 0xF8 | NOT float32 — 7 individual bytes | See below | Special |

### DPID 0xF8 Byte Layout (7 individual bytes)

| Byte | Range | Best Hypothesis |
|------|-------|----------------|
| 0 | 104-110 | Unknown (slowly varying) |
| 1 | 0-254 | Unknown (high variation) |
| 2 | 0-255 | Unknown |
| 3 | 0-255 | Unknown |
| 4 | 11-75 | Unknown (slowly varying) |
| 5 | 1-255 | Unknown |
| 6 | 0-160 | Unknown |

## What V-OP Needs to Replicate HPT

### Phase 1: Immediate (Already Done)
- [x] Fuel rate DDDI mode (`2C FE 00 0C 24 5D`) — confirmed working
- [x] NRC detection fix in bridge and frontend
- [x] DID cleanup (remove 0x1638, relabel 0x20E3)

### Phase 2: Replicate Known DPIDs
Send the exact captured 0x2C commands for DPIDs FD, FB, F8:
```
2C FD 00 4F 00 10 00 0A
2C FB 20 B4 30 BE 32 8A 00 0D
2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C
```

### Phase 3: Discover Missing DPIDs
Need another IntelliSpy capture with:
1. Start IntelliSpy FIRST
2. IntelliSpy buffer must be large enough (>100K frames)
3. Start HPT scanner
4. Capture the full setup sequence including FC, FA, F7 definitions

### Phase 4: Build Custom DPID Packing
Once all DIDs are known, V-OP can build its own DPID definitions:
- Pack the most important channels into float32 positions (bytes 0-3)
- Use byte 6 for 1-byte channels (temperatures, percentages)
- Use bytes 4-5 for 2-byte channels or leave as padding

## Key Technical Details

### Timing
- DPID periodic rate: 0x04 = 25ms (40 Hz per DPID)
- With 8 DPIDs cycling: effective ~5 Hz per individual DPID
- Polled DIDs: ~1 Hz (DID 0x0077 every 500ms, DID 0x0069 every 1s)
- TesterPresent: every ~3-4 seconds

### CAN IDs
- 0x7E0: Tester → ECM requests
- 0x7E8: ECM → Tester responses
- 0x5E8: ECM periodic DPID streaming (broadcast)

### IntelliSpy Buffer Limitation
IntelliSpy has a 50,000 frame buffer. At ~1000 frames/second on a busy CAN bus, the buffer fills in ~50 seconds. The DDDI setup takes ~8 seconds but happens within the first few seconds of HPT connecting. If IntelliSpy is started too early, the setup frames get pushed out of the buffer by normal CAN traffic before the capture is saved.

**Recommendation:** Start IntelliSpy, then immediately start HPT scanner, then save the IntelliSpy capture within 30 seconds.
