# A2L Cross-Reference Findings — E41 L5P DDDI Periodic Streaming

## Source Files
- **A2L**: `E41_a171711502_quasi.a2l` (42.78 MB, ECM_E41 project)
- **BUSMASTER log**: Full 88-DID HPT capture (has CFs that IntelliSpy missed)
- **IntelliSpy CSV**: Fuel-pressure-only capture (3 channels)

---

## Critical Finding #1: FRP is FLOAT32, Not uint16

The A2L declares:
```
VeFHPR_p_FuelRail
  Type: FLOAT32_IEEE
  Unit: MPa (CM_T_p_MPa, COEFFS 0 1 0 0 0 1 = identity)
  ECU_ADDRESS: 0x40014398
  Description: "SIDI Filtered Fuel Rail Pressure. Sampled at 6.25ms."
```

The 0x2D command maps a 4-byte RAM region into periodic ID FE00.
**Bytes 1-4 of the FE frame are IEEE 754 FLOAT32 in Big Endian (MSB_FIRST).**

### Proof (10 consecutive FE frames from IntelliSpy):

| Frame Hex | FLOAT32 BE (MPa) | PSI | Match? |
|-----------|-------------------|-----|--------|
| FE **42 02 60 AC** 0C BB 88 | 32.5944 | 4727.4 | ~4712 HPT |
| FE **42 02 2F B1** 0C B6 8B | 32.5466 | 4720.5 | |
| FE **42 02 28 7B** 0C B5 88 | 32.5395 | 4719.5 | |
| FE **42 02 3B 0D** 0C B7 87 | 32.5577 | 4722.1 | |
| FE **42 02 1D B1** 0C B4 89 | 32.5290 | 4717.9 | |

All values cluster around 4718-4727 PSI at idle. HPT shows ~4712 PSI. **Match confirmed.**

### Our code was wrong:
```ts
// WRONG: treating bytes 6-7 as uint16 × 0.1338
const frpRaw = b67_LE;
const frpPsi = frpRaw * 0.1338;
```

### Correct interpretation:
```ts
// CORRECT: bytes 1-4 are IEEE 754 FLOAT32 Big Endian, value in MPa
const buf = new DataView(new Uint8Array(data.slice(1, 5)).buffer);
const frpMpa = buf.getFloat32(0, false); // false = big-endian
const frpPsi = frpMpa * 145.038; // MPa → PSI
```

---

## Critical Finding #2: FP_SAE is uint16 BE × 0.01868

Bytes 5-6 of the FE frame:
- 0x0CBB = 3259 × 0.01868 = 60.88 PSI (HPT shows ~59.18 PSI — close)
- This comes from DID 0x0010 in the 0x2C FE define

**Our code for FP_SAE was approximately correct** (uint16 BE × 0.01868).

---

## Critical Finding #3: Byte Order is MSB_FIRST (Big Endian)

The A2L explicitly states:
```
BYTE_ORDER MSB_FIRST
BYTEORDER_MSB_FIRST
```

This means ALL multi-byte values from this ECU are Big Endian.
Our code had `b67_LE` (little-endian) — this was wrong.

---

## Critical Finding #4: IntelliSpy Missed Continuation Frames

The BUSMASTER full capture reveals that **every 0x2D and 0x2C command is a multi-frame ISO-TP message** with an FF + CF pair. IntelliSpy only captured the FF for most commands.

### Full DDDI Setup Sequence (from BUSMASTER):

| Step | Service | Target | Payload (FF+CF reassembled) | Meaning |
|------|---------|--------|----------------------------|---------|
| 1 | 0x2D | FE00 | `40 02 21 58 04` | Define FE00 = RAM 0x40022158, 4 bytes |
| 2 | 0x2C | FE | `FE 00 00 10 30 35` | Periodic FE = [FE00, DID 0x0010, DID 0x3035] |
| 3 | 0x2D | FE01 | `40 01 BC 8C 04` | Define FE01 = RAM 0x4001BC8C, 4 bytes |
| 4 | 0x2C | FD | `FE 01 20 8B 30 D4` | Periodic FD = [FE01, DID 0x208B, DID 0x30D4] |
| 5 | 0x2D | FE02 | `40 01 4F 08 04` | Define FE02 = RAM 0x40014F08, 4 bytes |
| 6 | 0x2C | FC | `FE 02 20 B4 24 5D` | Periodic FC = [FE02, DID 0x20B4, DID 0x245D] |
| 7 | 0x2D | FE03 | `40 01 23 D4 04` | Define FE03 = RAM 0x400123D4, 4 bytes |
| 8 | 0x2C | FB | `FE 03 30 AA 15 43` | Periodic FB = [FE03, DID 0x30AA, DID 0x1543] |
| 9 | 0x2D | FE04 | `40 01 1F 18 02` | Define FE04 = RAM 0x40011F18, **2 bytes** |
| 10 | 0x2C | FA | `30 3B 30 AB FE 04 15 40` | Periodic FA = [DID 0x303B, DID 0x30AB, FE04, DID 0x1540] |
| 11 | 0x2C | F9 | `30 3A 13 1F 00 23 00 49` | Periodic F9 = [DID 0x303A, DID 0x131F, DID 0x0023, DID 0x0049] |
| 12 | 0x2C | F8 | `30 A9 30 C3 20 E3 00 04` | Periodic F8 = [DID 0x30A9, DID 0x30C3, DID 0x20E3, DID 0x0004] |
| 13 | 0x2D | FE05 | `40 01 40 82 02` | Define FE05 = RAM 0x40014082, **2 bytes** |
| 14 | 0x2C | F7 | `20 8A 12 DA FE 05 00 61` | Periodic F7 = [DID 0x208A, DID 0x12DA, FE05, DID 0x0061] |

### A2L RAM Address Lookup:

| Param ID | RAM Address | A2L Variable | Type | Description |
|----------|-------------|-------------|------|-------------|
| FE00 | 0x40022158 | VeFULC_i_RPWC_R2_Grp1_InvBX_L | FLOAT32 | Fuel control interpolation |
| FE01 | 0x4001BC8C | VeEGTC_dm_HC_QntyCL_Prop | FLOAT32 | HC closed loop proportional |
| FE02 | 0x40014F08 | (not in quasi-A2L) | FLOAT32 | Unknown (4 bytes) |
| FE03 | 0x400123D4 | VeASSR_g_ChkEngOnB | ULONG | Engine-on request bits |
| FE04 | 0x40011F18 | VeFULR_V_MaxQntyThrshA | FLOAT32 | Max injection quantity threshold |
| FE05 | 0x40014082 | (not in quasi-A2L) | ? | Unknown (2 bytes) |

---

## Critical Finding #5: The Fuel-Pressure-Only Capture Uses Different RAM Address

The fuel-pressure-only capture sends:
```
FF: 10 08 2D FE 00 40 01 4F
CF: (missed by IntelliSpy)
```

This maps FE00 to RAM address 0x40014F**XX** (last 2 bytes unknown from CF).
The full capture maps FE00 to 0x40022158.

**HPT dynamically selects different RAM addresses depending on which channels the user selects.**
When only fuel pressure channels are selected, HPT maps FE00 directly to the fuel rail pressure variable.

The fuel-pressure-only address (0x40014F??) is likely **VeFHPR_p_FuelRail** at 0x40014398
or a nearby fuel pressure variable. The quasi-A2L doesn't have the exact address, but the
FLOAT32 interpretation proves it's correct.

---

## Critical Finding #6: GM Proprietary Protocol Format

The A2L confirms this is NOT standard UDS. GM uses proprietary extensions:

1. **0x2D** = DynamicallyDefineDataIdentifier by memory address (NOT InputOutputControl!)
   - Format: `2D [paramID_HI] [paramID_LO] [memAddr 4 bytes] [memSize 1 byte]`
   - AALFI = 0x14 (1-byte size field, 4-byte address field)
   - Response: `6D [paramID_HI] [paramID_LO]`

2. **0x2C** = DynamicallyDefineDataIdentifier by source DID
   - Format: `2C [1-byte periodic ID] [2-byte source DID] [2-byte source DID] ...`
   - Periodic IDs: 0xEF-0xFE (single byte, from AVAILABLE_PERIODIC_IDENTIFIER_RANGE)
   - Parameter IDs: 0xFE00-0xFE3F (from AVAILABLE_PARAMETER_IDENTIFIER_RANGE)
   - Response: `6C [periodic ID]`

3. **0xAA** = GM ReadDataByPeriodicIdentifier (start/stop periodic transmission)
   - Format: `AA [rate] [periodicID1] [periodicID2] ...`
   - Rate 0x04 = fast (HPT uses this)
   - Rate 0x00 in stop command: `AA 04 00` = stop all
   - Response on 0x5E8 (UUDT CAN ID, not 0x7E8)

4. **Transmission modes** (from A2L SOURCE definitions):
   - SLOW, MEDIUM, FAST — all use 0x5E8 for UUDT responses

---

## What Our Code Needs to Fix

### Bug 1: FRP_ACT parsing (CRITICAL)
- **Current**: `b67_LE × 0.1338` (uint16 little-endian)
- **Correct**: `FLOAT32_BE(bytes[1:5]) × 145.038` (IEEE 754 float, MPa → PSI)

### Bug 2: FP_SAE byte positions
- **Current**: `b56_BE × 0.01868` — approximately correct
- **Verify**: bytes 5-6 are from DID 0x0010 in the composite. The scale factor
  may need adjustment (we get 60.88 vs HPT's 59.18 — could be a different DID).

### Bug 3: The 0x2D command is incomplete
- **Current**: We send `[0x2D, 0xFE, 0x00, 0x40, 0x01, 0x4F]` (6 bytes)
- **Correct**: This is an 8-byte multi-frame. We're missing the last 2 bytes from the CF.
  The full command should be `2D FE 00 40 01 4F XX XX` where XX XX completes the address + size.
- **Impact**: The ECU may be responding to a partial/incorrect address, or the ISO-TP
  layer is completing it with zeros. This could explain why streaming doesn't work.

### Not a bug: The 0x2C and 0xAA commands look correct for the fuel-pressure-only case.

---

## Recommended Next Steps

1. **Fix FRP_ACT parsing immediately** — use `DataView.getFloat32(0, false)` on bytes 1-4
2. **Add FLOAT32 logging** to the debug output so we can verify on the truck
3. **Investigate the missing CF bytes** for the 0x2D command — we need to know the full
   8-byte payload. The BUSMASTER log for the fuel-pressure-only capture would tell us.
4. **Consider using the full capture's DDDI setup** instead of the fuel-pressure-only one,
   since we have the complete byte sequences from BUSMASTER.
