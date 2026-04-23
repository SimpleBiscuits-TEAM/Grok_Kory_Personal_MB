# HPT Exact IOCTL Commands from BUSMASTER Capture

## Line 185-197: The DDDI Setup Sequence

### IOCTL FE00 (FRP Actual) — Lines 185-188
```
TX 0x7E0: 10 08 2D FE 00 40 01 4F    (FF: IOCTL 0x2D, DID=FE00, subFunc=0x40, addr=0x014F, ...)
RX 0x7E8: 30 00 0A                    (FC: BS=0, STmin=10ms)
TX 0x7E0: 21 08 04 00 00 00 00 00    (CF: ...addr cont=08, len=04, padding)
RX 0x7E8: 03 6D FE 00                (Positive response: 0x6D = IOCTL OK for FE00)
```
Full IOCTL payload: `2D FE00 40 014F08 04 00000000`
- Service: 0x2D (InputOutputControlByIdentifier)
- DID: 0xFE00
- SubFunction: 0x40
- RAM Address: 0x014F08 (3 bytes)
- Length: 0x04 (4 bytes = float32)
- Padding: 00 00 00 00

### DDDI FE (map periodic FE → IOCTL FE00) — Line 189-190
```
TX 0x7E0: 06 2C FE FE 00 00 0A 00    (DDDI: map periodic 0xFE to DID 0xFE00, offset 0, size 0x0A?)
RX 0x7E8: 02 6C FE                    (Positive response)
```
Wait — `06 2C FE FE 00 00 0A` — that's:
- PCI: 06 (single frame, 6 bytes)
- SID: 0x2C (DynamicallyDefineDataIdentifier)
- Periodic ID: 0xFE
- Source DID: 0xFE00
- Position: 0x00
- Size: 0x0A (10? or is this the periodic rate?)

Actually looking more carefully:
- `2C FE FE00 00 0A` = DDDI subFunc=0xFE?, or periodic ID = FE, source = FE00, pos=00, memSize=0A

### IOCTL FE01 (FRP Desired) — Lines 191-194
```
TX 0x7E0: 10 08 2D FE 01 40 02 25    (FF: IOCTL 0x2D, DID=FE01, subFunc=0x40, addr=0x0225...)
RX 0x7E8: 30 00 0A                    (FC)
TX 0x7E0: 21 D8 04 00 00 00 00 00    (CF: ...addr=D8, len=04)
RX 0x7E8: 03 6D FE 01                (Positive response for FE01)
```
Full IOCTL payload: `2D FE01 40 0225D8 04 00000000`
- RAM Address: 0x0225D8

### DDDI FD (map periodic FD → IOCTL FE01) — Lines 195-196
```
TX 0x7E0: 04 2C FD FE 01 00 00 00    (DDDI: map periodic 0xFD to DID 0xFE01)
RX 0x7E8: 02 6C FD                    (Positive response)
```

### Start Periodic — Line 197
```
TX 0x7E0: 04 AA 04 FE FD 00 00 00    (ReadDataByPeriodicIdentifier: rate=0x04 fast, IDs=FE,FD)
```

## 0x5E8 Frame Data (Lines 198+)
```
FE 42 02 34 00 89 00 00    → float32(42 02 34 00) = 32.55 MPa = 4721 PSI (byte 5 = 0x89 = extra?)
FD 42 02 34 00 00 00 00    → float32(42 02 34 00) = 32.55 MPa = 4721 PSI
FE 42 02 20 C4 87 00 00    → float32(42 02 20 C4) = 32.53 MPa = 4718 PSI
FD 42 02 20 C4 00 00 00    → float32(42 02 20 C4) = 32.53 MPa
FE 42 02 2A 47 8A 00 00    → float32(42 02 2A 47) = 32.54 MPa = 4720 PSI
```

## KEY OBSERVATION
The FE frames have an EXTRA byte at position 5 (0x89, 0x87, 0x8A, 0x8B...) 
while FD frames have 0x00 at position 5.

The DDDI FE definition was: `2C FE FE00 00 0A` — size 0x0A = 10 bytes?
But the IOCTL only reads 4 bytes (float32). So maybe the DDDI maps MORE than just the IOCTL output?

Actually wait — `06 2C FE FE 00 00 0A`:
- 06 = PCI (6 data bytes)
- 2C = DDDI service
- FE = subFunction (defineByIdentifier)
- FE 00 = source DID (0xFE00)
- 00 = position in source (byte 0)
- 0A = memorySize (10 bytes? or something else)

Hmm, but `04 2C FD FE 01`:
- 04 = PCI (4 data bytes)
- 2C = DDDI service  
- FD = subFunction (defineByMemoryAddress? No...)

Actually the UDS standard for 0x2C DDDI has subFunctions:
- 0x01 = defineByIdentifier
- 0x02 = defineByMemoryAddress
- 0x03 = clearDynamicallyDefinedDataIdentifier

So `2C FE ...` means subFunction=0xFE? That's not standard...

WAIT — GM uses a non-standard DDDI format:
- `2C <periodicID> <sourceDID_high> <sourceDID_low> <position> <size>`
- periodicID IS the subFunction byte in GM's implementation

So: `2C FE FE00 00 0A` = define periodic 0xFE from DID 0xFE00, position 0, size 0x0A (10 bytes)
And: `2C FD FE01` = define periodic 0xFD from DID 0xFE01 (no position/size = use all?)

The size difference: FE gets 10 bytes (includes the float32 + 6 extra), FD gets default.
