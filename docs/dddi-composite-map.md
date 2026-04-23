# DDDI Composite Map — From IntelliSpy HPT Capture

## Composite Definitions (from ppei_pcan_bridge.py)

### Composite FD: `0x2C, 0xFD, 0x00, 0x4F, 0x00, 0x10, 0x00, 0x0A`
- Format: `0x2C` (defineByIdentifier) + periodic ID `0xFD` + DID pairs
- DIDs: 0x004F, 0x0010, 0x000A
- 0x004F = ? (need to check PID list)
- 0x0010 = ? 
- 0x000A = ?

### Composite FB: `0x2C, 0xFB, 0x20, 0xB4, 0x30, 0xBE, 0x32, 0x8A, 0x00, 0x0D`
- Format: `0x2C` (defineByIdentifier) + periodic ID `0xFB` + DID pairs
- DIDs: 0x20B4, 0x30BE, 0x328A, 0x000D
- **0x328A = FRP_ACT (Fuel Rail Pressure Actual)** ← THIS IS THE ONE WE NEED
- 0x20B4 = ? (need to check)
- 0x30BE = ?
- 0x000D = VSS (Vehicle Speed)

### Composite F9: `0x2C, 0xF9, 0x30, 0x8A, 0x13, 0x2A`
- Format: `0x2C` (defineByIdentifier) + periodic ID `0xF9` + DID pairs
- DIDs: 0x308A, 0x132A
- 0x308A = ?
- 0x132A = ?

### Composite F8: `0x2C, 0xF8, 0x11, 0xBB, 0x20, 0xBC, 0x32, 0xA8, 0x00, 0x0F, 0x00, 0x05, 0x00, 0x33, 0x23, 0x2C`
- Format: `0x2C` (defineByIdentifier) + periodic ID `0xF8` + DID pairs
- DIDs: 0x11BB, 0x20BC, 0x32A8, 0x000F, 0x0005, 0x0033, 0x232C
- 0x11BB = ?
- 0x20BC = ?
- 0x32A8 = ?
- 0x000F = ?
- 0x0005 = ?
- 0x0033 = ?
- 0x232C = ?

## Periodic Start Command
To start streaming: `0xAA 0x04 0xFD 0xFB 0xF9 0xF8`
- 0xAA = ReadDataByPeriodicIdentifier
- 0x04 = transmissionMode (medium rate)
- 0xFD, 0xFB, 0xF9, 0xF8 = periodic IDs to stream

ECU will push data on arb ID 0x5E8.

## 0x5E8 Frame Format
Each 8-byte frame on 0x5E8:
- Byte 0: periodic identifier (FD, FB, F9, or F8)
- Bytes 1-7: data bytes for that composite's DIDs (packed sequentially)

For composite FB (contains FRP_ACT):
- Byte 0: 0xFB
- Bytes 1-2: DID 0x20B4 data (2 bytes)
- Bytes 3-4: DID 0x30BE data (2 bytes)  
- Bytes 5-6: DID 0x328A data (2 bytes) = FRP_ACT!
- Byte 7: DID 0x000D data (1 byte) = VSS

Wait — need to verify byte counts. Let me check the PID definitions.

FRP_ACT (0x328A): bytes: 2
0x20B4: need to check
0x30BE: need to check
0x000D (VSS): bytes: 1

If 0x20B4 = 2 bytes, 0x30BE = 2 bytes, 0x328A = 2 bytes, 0x000D = 1 byte
Total = 7 bytes → fits in one 8-byte frame (1 byte periodic ID + 7 data)!

## Key Insight
The bridge DEFINES composites but never STARTS periodic streaming.
Need to add: `0xAA 0x04 0xFD 0xFB 0xF9 0xF8` after Phase 3.
