# DDDI Decode Findings

## Original HPT Capture (full 88 DID scan)

### DDDI Define Commands (Multi-frame to 0x7E0)

The 4 DDDI define commands at ~9690.85s are multi-frame ISO-TP messages.
Looking at the raw CAN frames:

#### Define 1: Target 0xFD
```
TX FF: 10 08 2C FD 00 4F 00 10 00 0A
RX FC: 30 00 0A
TX CF: 21 00 0A AA AA AA AA AA
```
Reassembled (8 bytes): 2C FD 00 4F 00 10 00 0A
- Service: 0x2C (DDDI)
- This is NOT standard UDS format. GM uses proprietary DDDI.
- 0xFD = target periodic ID
- Remaining: 00 4F 00 10 00 0A

Wait — looking at the fuel pressure capture more carefully:

#### Fuel Pressure Capture DDDI Sequence:
```
TX FF: 10 08 2D FE 00 40 01 4F  → service 0x2D? Or is this 0x2C with different framing?
RX FC: 30 00 0A
RX SF: 03 6D FE 00  → positive response 0x6D for service 0x2D
RX FC: 30 00 0A
RX SF: 02 6C FE     → positive response 0x6C for service 0x2C
RX FC: 30 00 0A
RX SF: 03 6D FE 01  → positive response 0x6D for service 0x2D
TX SF: 04 2C FD FE 01  → service 0x2C, target FD, source FE byte 1?
RX SF: 02 6C FD     → positive response for 0x2C on FD
TX SF: 04 AA 04 FE FD  → GM proprietary: start periodic for FE and FD
RX SF: 01 7E        → positive response (TesterPresent echo?)
```

### Key Insight: HPT Fuel Pressure DDDI Setup

For the fuel-pressure-only capture, HPT:
1. Sends `2D FE 00 40 01 4F` — this is **InputOutputControlByIdentifier** (0x2D), not DDDI!
   - Wait, 0x2D = InputOutputControl. But response is 0x6D which confirms it.
   - Actually: `10 08` = FF with 8 bytes total
   - Payload: `2D FE 00 40 01 4F` — but that's only 6 bytes, need 2 more from CF
   - Full: `2D FE 00 40 01 4F XX XX`
   
   Actually wait — the first frame `10 08 2D FE 00 40 01 4F` has:
   - PCI: 0x10 0x08 = First Frame, total length 8
   - Payload starts at byte 2: `2D FE 00 40 01 4F`
   - But we need 8 bytes total, and FF gives 6, so 2 more from CF
   
   Hmm, but there's no CF21 frame after this. The next frames are RX responses.
   
   Let me reconsider: maybe `10 08` means something different in GM's protocol?

2. Sends `2C FD FE 01` — DDDI define: target=FD, source=FE, position=01
3. Sends `AA 04 FE FD` — GM start periodic for IDs FE and FD

### Periodic Frame Structure (Fuel Pressure Only)

FE frames: `FE 42 02 XX YY 0C ZZ WW`
- Byte 0: 0xFE (periodic ID)
- Bytes 1-4: `42 02 XX YY` — these change (fuel pressure data)
- Bytes 5-7: `0C ZZ WW` — these change slowly

FD frames: `FD 42 02 XX YY 00 00 00`
- Byte 0: 0xFD (periodic ID)  
- Bytes 1-4: `42 02 XX YY` — same pattern as FE bytes 1-4
- Bytes 5-7: `00 00 00` — always zero

### Correlation with HPT Values

HPT FP_ACT at start: ~4712 PSI
FE first frame bytes 1-4: 42 02 60 AC
  - As uint32: 0x420260AC = 1107427500
  - As uint16 pair: 0x4202 = 16898, 0x60AC = 24748
  
HPT FP_SAE at start: ~59.18 PSI
FE bytes 5-6: 0C BB
  - 0x0CBB = 3259
  - 3259 * 0.01868 = 60.88 — close to 59.18!

So FE frame structure for fuel pressure:
- Bytes 1-4: FRP (fuel rail pressure) — 4 byte value
- Bytes 5-6: FP_SAE (low feed pressure) — 2 byte value  
- Byte 7: unknown

FD frame structure:
- Bytes 1-4: Same as FE (duplicate FRP?)
- Bytes 5-7: zeros

### Original Capture Periodic Frames

FE: `FE 44 A3 8E D3 09 62 A2` — 7 data bytes after periodic ID
FA: `FA 68 72 03 E8 27 10 00` — bytes 5-6 = 27 10 = 10000 → FRP_ACT!
FB: `FB FF F6 03 E8 00 3B A1`
FD: `FD 14 00 00 2B 0C 18 89`
F9: `F9 0C AC 1D 8B 90 FF FF`
F8: `F8 33 C0 FC 57 7C 66 45`
FC: `FC FF F7 00 00 0C A6 07`

FA bytes 5-6: 0x2710 = 10000 → 10000 * 0.4712 = 4712 PSI = FRP_ACT ✓
FD bytes 5-6: 0x0C18 = 3096 → 3096 * 0.01868 = 57.8 PSI ≈ FP_SAE ✓

## Conclusion

HPT uses DDDI periodic streaming with GM proprietary commands:
1. 0x2D (InputOutputControl) to set up something on periodic ID 0xFE
2. 0x2C (DDDI) to define composite periodic IDs
3. 0xAA 04 XX YY to start periodic transmission of IDs XX and YY
4. ECU pushes data on 0x5E8 with periodic ID as first byte

The periodic frames pack multiple DID values into 7 data bytes.
The exact byte mapping depends on the DDDI define commands.

For V-OP, we need to replicate this exact sequence.
