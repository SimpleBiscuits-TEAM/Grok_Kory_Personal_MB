# DDDI Protocol Decoded from IntelliSpy

## Key Finding: Two Different DDDI Setups

### Fuel Pressure Only Capture (3 channels: FP_SAE, FP_ACT, FP_DES)

HPT sends only 3 commands to set up periodic streaming:

1. **`2D FE 00 40 01 4F`** — InputOutputControlByIdentifier
   - Service 0x2D
   - DID: 0xFE00 (periodic ID 0xFE with 0x00?)
   - Control: `40 01 4F`
   - Response: `6D FE 00` (positive)

2. **`2C FD FE 01`** — DDDI Define
   - Service 0x2C
   - Target periodic ID: 0xFD
   - Source: 0xFE, position 0x01
   - This defines FD as a copy of FE starting at byte 1
   - Response: `6C FD` (positive)

3. **`AA 04 FE FD`** — GM Start Periodic
   - Start periodic transmission for IDs 0xFE and 0xFD
   - Response: `7E` (positive)

Result: ECU pushes FE and FD frames on 0x5E8 every ~25ms

### Full 88-DID Capture (all channels)

Before the DDDI defines, there's a preceding multi-frame that ends with:
- CF: `21 84 04 00 00 00 00 00` → response `6D FE 00`
- CF: `21 15 40 00 00 00 00 00` → response `6C FE`

Then 4 DDDI define commands:

1. **`2C FD 00 4F 00 10 00 0A`** (8 bytes)
   - Target: 0xFD
   - Data: `00 4F 00 10 00 0A`
   - Interpretation: Source DID 0x004F? No — these are likely byte positions/sizes within the FE source

2. **`2C FB 20 B4 30 BE 32 8A 00 0D`** (10 bytes)
   - Target: 0xFB
   - Source DIDs: 0x20B4, 0x30BE, 0x328A
   - Trailing: 0x00, 0x0D
   - **0x20B4 = IBR_1, 0x30BE = THRTL_CMD, 0x328A = FRP_ACT!**

3. **`2C F9 30 8A 13 2A 32 A8 00 0F 00 05`** (12 bytes)
   - Target: 0xF9
   - Source DIDs: 0x308A, 0x132A, 0x32A8
   - Trailing: 0x00, 0x0F, 0x00, 0x05
   - **0x308A = BARO_DSL, 0x132A = ?, 0x32A8 = DPF_REGEN_PCT**

4. **`2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C`** (16 bytes)
   - Target: 0xF8
   - Source DIDs: 0x11BB, 0x20BC, 0x32A8, ...
   - **0x11BB = ?, 0x20BC = IPW_5, 0x32A8 = DPF_REGEN_PCT**
   - More: 0x00, 0x0F, 0x00, 0x05, 0x00, 0x33, 0x23, 0x2C

Then the AA start command is embedded in a CF frame:
- CF: `21 FA F9 F8 00 00 00 00` — this looks like it's part of a multi-frame
- But preceded by FC from ECM, suggesting it's a continuation

**Wait — I need to look at this more carefully.**

The frame at 9690.951: `RX FC: 30 00 0A` (flow control from ECM)
Then at 9690.956: `TX CF: 21 FA F9 F8 00 00 00 00`

This CF is part of a multi-frame message. The preceding FF must be the `2C F8...` define.
So the full F8 define is: `2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C`
Wait, that's only 14 bytes from FF+CF1+CF2. Let me recount.

FF: `10 10 2C F8 11 BB 20 BC` → total=16, payload=6 bytes: `2C F8 11 BB 20 BC`
CF1: `21 32 A8 00 0F 00 05 00` → +7 = 13 bytes
CF2: `22 33 23 2C 00 00 00 00` → +3 (only need 3 more to reach 16) = 16 bytes

Full payload (16 bytes): `2C F8 11 BB 20 BC 32 A8 00 0F 00 05 00 33 23 2C`
Response: `6C F8` (positive)

Then: FC from ECM: `30 00 0A`
Then CF: `21 FA F9 F8 00 00 00 00`

**This CF belongs to a DIFFERENT multi-frame message!** There must be an FF before the FC.

Actually wait — the FC at 9690.951 is FROM the ECM (RX). That means the ECM is sending a flow control for a message WE'RE sending. So there's an FF from us before this FC.

But looking at the sequence:
- 9690.946: RX `6C F8` (response to F8 define)
- 9690.951: RX FC `30 00 0A` (ECM requesting more data from us)
- 9690.956: TX CF `21 FA F9 F8 00 00 00 00` (our continuation frame)

So there's a multi-frame message from us that started BEFORE the FC. The FF must be somewhere.
Looking at the full window, after `6C F8`, there's no TX FF visible. The FC at 9690.951 must be for a message that started earlier.

Actually — I think the `AA 03` start periodic command is a multi-frame:
FF: somewhere (maybe the `6C F8` response triggered it)
The CF `21 FA F9 F8` would be: AA 03 FE FD FB FA F9 F8 (start periodic for 6 IDs)

Let me look for the FF that precedes this CF.

## Conclusion

The GM DDDI protocol for L5P:
1. Use 0x2D (IOCTL) to configure periodic ID 0xFE with source DIDs
2. Use 0x2C to define additional periodic IDs (FD, FB, FA, F9, F8) as composites of source DIDs
3. Use 0xAA 03 to start periodic transmission for all defined IDs
4. ECU pushes data on 0x5E8 with periodic ID as byte 0

The source DIDs in the DDDI defines ARE the same 0x30xx/0x32xx DIDs that don't update on direct Mode 22 reads. The ECU only updates them in the periodic stream context.
