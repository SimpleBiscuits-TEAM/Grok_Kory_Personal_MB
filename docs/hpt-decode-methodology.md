# HPT Scanner Decode Methodology

**Purpose:** Step-by-step playbook for reverse-engineering HP Tuners' DDDI-based high-speed datalogger on any new vehicle platform. This methodology was developed and validated on the 2019 L5P Duramax (E41 ECM) and is designed to be repeatable for future platforms (LBZ, LML, LLY, Ford 6.7, Cummins, gas trucks, etc.).

---

## Overview

HP Tuners uses the UDS **DynamicallyDefineDataIdentifier** (0x2C) and **InputOutputControlByIdentifier** (0x2D / IOCTL) services to create high-speed periodic data streams from the ECU. Instead of polling individual DIDs one at a time (slow), HPT packs multiple data sources into **DPIDs** (Dynamic Periodic Identifiers) that the ECU pushes continuously at 25ms intervals (~40 Hz) on a dedicated CAN ID.

This gives HPT 30+ channels at 20-40 Hz — far faster than traditional Mode 22 polling (5-10 Hz per PID). V-OP replicates this by capturing and replaying HPT's exact setup commands.

---

## Required Tools

1. **BusMaster** (preferred) or IntelliSpy — CAN bus sniffer running on a separate laptop/device
2. **HP Tuners Scanner** — the tool being reverse-engineered
3. **HPT Datalog Export** — CSV export from HPT's scanner with channel names, units, and values
4. **Python 3** — for analysis scripts

**BusMaster vs IntelliSpy:**
- BusMaster writes to disk with no frame limit — captures the ENTIRE session
- IntelliSpy has a 500K frame buffer (V-OP's updated limit). At 4000 frames/sec, this is ~2 minutes. The protected head (first 2000 frames) preserves setup commands, but BusMaster is still preferred for initial decode work.

---

## Step 1: Capture the Full Session

### Setup
1. Connect BusMaster/IntelliSpy to the OBD-II port via a CAN Y-splitter (or second channel)
2. Start BusMaster logging BEFORE launching HPT Scanner
3. In HPT Scanner, select the desired PID channels and start logging
4. Rev the engine through the full RPM range (idle → 3000+ → idle) to create variation in ALL channels
5. Log for 30-60 seconds with good RPM variation
6. Stop HPT logging, then stop BusMaster
7. Export HPT datalog as CSV

### Critical: Why RPM Variation Matters
At idle, most channels are near-constant. Without variation, temporal correlation analysis cannot distinguish which DPID byte maps to which HPT channel. A full idle→3K→idle sweep creates unique "signatures" for each channel that enable definitive matching.

---

## Step 2: Parse the Setup Sequence

### Identify ECU Arbitration IDs
- **Request ID**: 0x7E0 (ECM), 0x7E2 (TCM), etc.
- **Response ID**: 0x7E8 (ECM), 0x7EA (TCM), etc.
- **Periodic Stream ID**: 0x5E8 (ECM DPIDs), 0x5EA (TCM DPIDs)

### Extract Setup Commands
Filter for request ID (e.g., 0x7E0) and look for these UDS services in chronological order:

| Service | Name | Purpose |
|---------|------|---------|
| **0x10** | DiagnosticSessionControl | Switch to extended session (0x10 03) |
| **0x2D** | InputOutputControlByIdentifier (IOCTL) | Define RAM address slots for float32 data |
| **0x2C** | DynamicallyDefineDataIdentifier (DDDI) | Pack DIDs/IOCTL slots into DPID frames |
| **0xAA** | SchedulePeriodicIdentifier | Start/stop periodic streaming |
| **0x3E** | TesterPresent | Keepalive (every ~2.8s) |

### ISO-TP Reassembly
Multi-byte commands (>7 bytes) use ISO-TP framing:
- **Single Frame**: `0L DD DD DD ...` where L = length, D = data
- **First Frame**: `1L LL DD DD DD ...` where LLL = total length
- **Consecutive Frame**: `2N DD DD DD ...` where N = sequence (1-F)
- **Flow Control**: `30 00 00` (from receiver, allowing sender to continue)

Reassemble multi-frame messages before decoding.

---

## Step 3: Decode IOCTL Commands (0x2D)

### Format
```
2D <DPID> <slot_index> <addr_hi> <addr_mid> <addr_lo> <size>
```

- **DPID**: Target periodic identifier (0xF7-0xFE)
- **slot_index**: 0x00-0x06 (up to 7 slots per DPID)
- **addr**: 3-byte RAM address in the ECU
- **size**: Number of bytes to read (typically 0x04 for float32)

### Example (L5P E41)
```
2D FE 00 40 02 21 58 04  → DPID 0xFE, slot 0, RAM 0x402158, 4 bytes (float32)
```

### Key Insight
IOCTL slots provide access to **internal ECU RAM** — data that has no standard DID. This is how HPT reads float32-precision values for Fuel Rail Pressure, Cylinder Airmass, Injector Pulse Width, etc. These values are NOT accessible via Mode 22 reads.

---

## Step 4: Decode DDDI Commands (0x2C)

### Format
```
2C <DPID> [source_1] [source_2] ... [source_N]
```

Each source is either:
- **2 bytes**: A standard DID (e.g., `24 5D` = DID 0x245D)
- **Referencing IOCTL**: When the DPID has IOCTL slots defined, the first N bytes of the DPID frame come from those slots

### Frame Layout
Each DPID carries exactly **7 data bytes** (8-byte CAN frame: 1 byte DPID ID + 7 bytes payload). The 0x2C command defines how those 7 bytes are filled:

```
DPID frame: [DPID_ID] [byte1] [byte2] [byte3] [byte4] [byte5] [byte6] [byte7]
```

### Common Patterns (L5P E41)
1. **float32 (4B) + filler (2B) + single-byte DID (1B)**: Most common. The float32 comes from an IOCTL slot, the filler is a constant-value DID (like 0x30AA returning 0x28A0), and the last byte is a useful 1-byte DID.

2. **DID (2B) + DID (2B) + DID (2B) + padding (1B)**: Three 2-byte DIDs packed together.

3. **Mixed**: Various combinations of 1-byte and 2-byte DIDs filling the 7 bytes.

### Filler DIDs
HPT uses certain DIDs as **spacers** to pad the frame to exactly 7 bytes. On L5P E41, the 0x30xx series DIDs (0x30AA, 0x30A9, 0x303B, 0x303A, 0x30AB) all return the constant value `0x28A0`. These are "snapshot" DIDs that only update during key-on events and are effectively useless during live logging.

---

## Step 5: Decode the Periodic Start Command (0xAA)

### Format
```
AA <rate> <DPID_1> <DPID_2> ... <DPID_N>
```

- **rate**: 0x01=fast (10ms), 0x02=medium (25ms), 0x03=slow (100ms), 0x04=25ms (HPT default)
- **DPID_N**: List of DPIDs to stream

### Example
```
AA 04 FE FD FC FB FA F9 F8 F7  → Start 8 DPIDs at 25ms rate
```

---

## Step 6: Cross-Reference with HPT Datalog

### Time Alignment
The BusMaster capture and HPT datalog have different time bases. To align them:

1. Find a channel with distinctive variation (RPM is ideal — the idle→3K→idle sweep)
2. Extract the RPM time series from both sources
3. Use cross-correlation to find the time offset
4. Apply the offset to align all channels

### Temporal Correlation Method
For each DPID byte position, compute the Pearson correlation coefficient against each HPT channel:

```python
from scipy.stats import pearsonr

for dpid_byte_series in dpid_bytes:
    for hpt_channel_series in hpt_channels:
        r, p = pearsonr(dpid_byte_series, hpt_channel_series)
        if abs(r) > 0.95:
            print(f"Match: DPID byte → {hpt_channel} (r={r:.4f})")
```

### Value Matching Method
For channels with known scaling, compute the ratio between raw DPID values and HPT display values:

```python
ratio = hpt_value / raw_dpid_value
# If ratio is constant across all samples → formula found
```

### Common Scaling Patterns

| Data Type | Raw → Display | Example |
|-----------|--------------|---------|
| float32 BE | IEEE 754 big-endian | FRP: float32 MPa × 145.038 = PSI |
| uint16 BE | (hi << 8 \| lo) × scale | RPM: uint16 / 4 |
| uint8 | byte × scale | MAP: byte × 0.244574 = PSI |
| uint8 ratio | byte × 100/255 | Turbo Vane: byte × 100/255 = % |
| uint16 kPa | uint16 / 100 × 0.145038 | Boost: uint16/100 kPa → PSI |
| int16 signed | (v > 32767 ? v-65536 : v) × scale | Inj Timing: signed/128 - 210 = ° |
| Temperature | byte - 40 | IAT: byte - 40 = °C, then × 1.8 + 32 = °F |

### DDDI-Specific Scaling Warning
Standard OBD PID formulas may NOT apply inside DDDI frames. For example, PID 0x0B (MAP) normally uses 1 kPa/count, but in HPT's DDDI frame it uses 1.686 kPa/count (0.244574 PSI/count). Always validate scaling empirically against the HPT datalog rather than assuming standard formulas.

---

## Step 7: Validate and Document

### Validation Checklist
For each decoded channel:
- [ ] Raw value range matches expected physical range
- [ ] Scaling formula produces values matching HPT datalog (within 1%)
- [ ] Values track correctly across the full RPM sweep
- [ ] Idle values match HPT idle values
- [ ] Peak values match HPT peak values
- [ ] The ratio (HPT_value / decoded_value) is constant across all samples

### Documentation Template
For each DPID, document:
```
DPID 0xFE:
  Setup: 2D FE 00 40 02 21 58 04  (IOCTL: RAM 0x402158, 4 bytes)
         2C FE 00 0C 24 5D        (DDDI: DID 0x000C + DID 0x245D)
  Layout:
    bytes[1:5] = Metering Unit Valve (float32 BE, Amps)
    bytes[5:7] = constant 0x28A0 (filler DID 0x30AA)
    byte[7]    = Fuel Injection Qty (uint8, mm³/stroke)
  Validated: ✓ (HPT idle=6mm³, V-OP idle=6mm³)
```

---

## Step 8: Implement in V-OP Bridge

### Bridge Changes (ppei_pcan_bridge.py)
1. Add IOCTL command constants (exact bytes from capture)
2. Add DDDI command constants (exact bytes from capture)
3. Add periodic start command with all DPIDs
4. Update `_gm_session_setup()` to send commands in order: Session → IOCTL → DDDI → Periodic
5. Track the active mode for the periodic frame parser

### Frontend Changes (PpeiDataloggerPanel.tsx)
1. Add DPID parser cases for each periodic ID (0xF7-0xFE)
2. Add virtual DID definitions for IOCTL-only channels (0xDD00+)
3. Update mode detection logic to auto-select the new mode
4. Add virtual DIDs to DDDI_EXEMPT_PIDS (never batch-read these)
5. Add virtual DIDs to presets

### Key Architecture Decisions
- **Virtual DIDs (0xDDxx)**: Used for channels that only exist in the DDDI periodic stream (IOCTL RAM addresses). These have no Mode 22 equivalent and their PID definitions have `formula: () => 0` since values come exclusively from the periodic parser.
- **DID Collision Avoidance**: Some DIDs serve different purposes in DDDI vs Mode 22 contexts (e.g., 0x20E3 = Fuel Flow in Mode 22, Boost/Vacuum in DDDI). Use virtual DIDs to avoid collisions.
- **Mode Auto-Detection**: The frontend detects which DDDI mode to use based on which PIDs the user has selected. If 2+ virtual DIDs are active → hpt_common mode.

---

## Appendix A: L5P E41 Complete DPID Map (Reference)

### IOCTL Definitions (7 slots)
```
Slot 0: 2D FE 00 40 02 21 58 04  → Metering Unit Valve Current (A)
Slot 1: 2D FD 00 40 02 1E 18 04  → Fuel Rail Pressure (MPa)
Slot 2: 2D FC 00 40 02 22 1C 04  → Lambda Smoke Limit
Slot 3: 2D FB 00 40 02 1E 58 04  → Injector Pulse Width Cyl 1 (µs)
Slot 4: 2D FA 00 40 02 22 58 04  → Cylinder Airmass (mg)
Slot 5: 2D FA 01 40 02 1E 98 04  → Unknown (0 at stationary, likely wheel speed related)
Slot 6: 2D F9 00 40 02 1E 1C 04  → Desired Fuel Rail Pressure (MPa)
```

### DDDI Definitions (8 DPIDs)
```
DPID 0xFE: 2C FE 00 0C 24 5D        → [IOCTL0:f32] + [30AA:2B] + [245D:1B]
DPID 0xFD: 2C FD 00 0C 15 43        → [IOCTL1:f32] + [30A9:2B] + [1543:1B]
DPID 0xFC: 2C FC 00 0C 15 40        → [IOCTL2:f32] + [303B:2B] + [1540:1B]
DPID 0xFB: 2C FB 00 0C 00 0B        → [IOCTL3:f32] + [303A:2B] + [000B:1B]
DPID 0xFA: 2C FA 00 0C 00 0D        → [IOCTL4:f32] + [IOCTL5:2B] + [000D:1B]
DPID 0xF9: 2C F9 20 B4 00 2C        → [IOCTL6:f32] + [20B4:2B] + [002C:1B]
DPID 0xF8: 2C F8 30 AB 12 DA 00 10 00 0F 00 05 00 33 23 2C
           → [30AB:2B] + [12DA:2B] + [0010:2B] + [000F:1B] (10 bytes, multi-frame ISO-TP)
DPID 0xF7: 2C F7 20 E3 00 0C 32 8A  → [20E3:2B] + [000C:2B] + [328A:2B] + [pad:1B]
```

### Periodic Start
```
AA 04 FE FD FC FB FA F9 F8 F7  → All 8 DPIDs at 25ms
```

### Channel Map
| DPID | Bytes | Channel | Formula | Unit |
|------|-------|---------|---------|------|
| 0xFE | 1:5 | Metering Unit Valve | float32 BE | A |
| 0xFE | 7 | Fuel Injection Qty | uint8 direct | mm³ |
| 0xFD | 1:5 | Fuel Rail Pressure | float32 BE × 145.038 | PSI |
| 0xFD | 7 | Throttle Position A | uint8 × 100/255 | % |
| 0xFC | 1:5 | Lambda Smoke Limit | float32 BE | ratio |
| 0xFC | 7 | Throttle Position B | uint8 × 100/255 | % |
| 0xFB | 1:5 | Injector Pulse Width | float32 BE / 1000 | ms |
| 0xFB | 7 | MAP | uint8 × 0.244574 | PSI |
| 0xFA | 1:5 | Cylinder Airmass | float32 BE / 1000 | g |
| 0xFA | 5:7 | Unknown Slot 5 | uint16 BE | ? |
| 0xFA | 7 | Vehicle Speed | uint8 × 0.621371 | MPH |
| 0xF9 | 1:5 | Desired FRP | float32 BE × 145.038 | PSI |
| 0xF9 | 5:7 | Commanded EGR A | uint16 BE (DID 0x20B4) | raw |
| 0xF9 | 7 | Commanded EGR % | uint8 × 100/255 | % |
| 0xF8 | 1:3 | (filler 0x28A0) | — | — |
| 0xF8 | 3:5 | Injection Timing | int16 BE / 128 - 210 | °BTDC |
| 0xF8 | 5:7 | MAF Rate | uint16 BE / 100 | g/s |
| 0xF8 | 7 | IAT | uint8 - 40 (°C) → °F | °F |
| 0xF7 | 1:3 | Boost/Vacuum | uint16 BE / 100 × 0.145038 | PSI |
| 0xF7 | 3:5 | Engine RPM | uint16 BE / 4 | RPM |
| 0xF7 | 5:7 | Desired Boost | uint16 BE / 100 × 0.145038 | PSI |

### Polled DIDs (1-2 Hz, separate from DDDI stream)
```
DID 0x0077 (5 bytes): Charge Air Cooler Temps (B1S1, B2S1, B2S2)
DID 0x0069 (7 bytes): Exhaust Gas Temps (B1S1-S4, B2S3)
```

---

## Appendix B: Applying to New Vehicles

### What Changes Per Vehicle
1. **Arbitration IDs**: Different ECUs use different CAN IDs
2. **IOCTL RAM addresses**: Completely different per ECU calibration
3. **DID numbers**: May differ between ECU families (E41 vs E98 vs Ford PCM)
4. **DPID count**: HPT may use fewer or more DPIDs depending on channel count
5. **Scaling formulas**: Each parameter has its own conversion factor

### What Stays the Same
1. **UDS protocol**: 0x2D (IOCTL), 0x2C (DDDI), 0xAA (periodic) are standard
2. **ISO-TP framing**: Same multi-frame format on all vehicles
3. **DPID structure**: 1 byte ID + 7 bytes data per frame
4. **Analysis methodology**: Capture → decode setup → cross-reference → validate

### Quick-Start for New Vehicle
1. Capture with BusMaster (full session, idle→rev→idle)
2. Export HPT datalog as CSV
3. Run `decode_busmaster.py` (adapt CAN IDs if needed)
4. Run `validate_scaling.py` to match channels
5. Add new mode constants to bridge
6. Add parser cases to frontend
7. Test on truck

---

*Document created: April 24, 2026*
*Validated on: 2019 GMC Sierra HD 6.6L L5P Duramax (E41 ECM)*
*Author: V-OP Development Team*
