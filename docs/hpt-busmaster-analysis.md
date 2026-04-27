# HP Tuners BUSMASTER Capture Analysis — FRP DDDI

## HPT DDDI Setup Sequence (lines 185-197)

### Step 1: IOCTL Clear FE00 (multi-frame)
```
7E0: 10 08 2D FE 00 40 01 4F   (FF: IOCTL clear FE, source=0x4F, pos=0x01)
7E8: 30 00 0A                   (FC: BS=0, STmin=10ms)
7E0: 21 08 04 00 00 00 00 00   (CF)
7E8: 03 6D FE 00               (Positive: IOCTL FE cleared)
```

### Step 2: Define FE composite
```
7E0: 06 2C FE FE 00 00 0A 00   (DDDI define FE: source=FE00, pos=0x00, size=0x0A)
7E8: 02 6C FE                   (Positive: FE defined)
```
Wait — this is `2C FE FE 00 00 0A 00`. That's:
- 0x2C = DynamicallyDefineDataIdentifier
- 0xFE = periodic ID
- 0xFE, 0x00 = source DID F200 or FE00?
- 0x00 = position in source
- 0x0A = size (10 bytes)

### Step 3: IOCTL Clear FE01 (multi-frame)
```
7E0: 10 08 2D FE 01 40 02 25   (FF: IOCTL clear FE01, source=0x0225)
7E8: 30 00 0A                   (FC)
7E0: 21 D8 04 00 00 00 00 00   (CF)
7E8: 03 6D FE 01               (Positive: IOCTL FE01 cleared)
```

### Step 4: Define FD composite
```
7E0: 04 2C FD FE 01 00 00 00   (DDDI define FD: source=FE01, pos=0, size=?)
7E8: 02 6C FD                   (Positive: FD defined)
```

### Step 5: Start periodic streaming
```
7E0: 04 AA 04 FE FD 00 00 00   (ReadDataByPeriodicIdentifier: rate=fast, IDs=FE,FD)
```
NOTE: Only 2 periodic IDs! FE and FD. Not 4 like our bridge sends.

### Step 6: First 0x5E8 frames arrive
```
0x5E8: FE 42 02 34 00 89 00 00   (periodic ID=FE)
0x5E8: FD 42 02 34 00 00 00 00   (periodic ID=FD)
```

## CRITICAL FINDING: HPT uses IOCTL (0x2D) not DDDI (0x2C) with DID lists!

HPT's approach is completely different from what our bridge does:
1. HPT uses **InputOutputControlByIdentifier (0x2D)** to clear IOCTL FE00 and FE01
2. HPT uses **DynamicallyDefineDataIdentifier (0x2C)** with `source=FE00/FE01` — referencing the IOCTL IDs
3. HPT only defines **2 composites** (FE, FD) not 4
4. The IOCTL defines the data source, the DDDI just maps it to a periodic ID

Our bridge defines composites with raw DID lists (0x2C FB 20B4 30BE 328A 000D).
HPT defines composites by referencing IOCTL memory blocks.

## The 0x5E8 Frame Layout (HPT)

FE frames: `FE 42 02 XX XX YY 00 00`
- Byte 0: 0xFE (periodic ID)
- Bytes 1-2: 0x42 0x02 — this looks like it could be RPM (0x4202 = 16898 / 4 = 4224 RPM? No...)
- Actually 0x4202 at idle... let me check

FD frames: `FD 42 02 XX XX 00 00 00`
- Same first bytes

The bytes 1-2 are IDENTICAL between FE and FD frames at the same timestamp.
This suggests bytes 1-2 are NOT part of the periodic data but rather a header.

Wait — `42 02` could be the Mode 02 response prefix (freeze frame). No...

Let me look at the changing bytes:
```
FE: 42 02 34 00 89 00 00  → bytes 3-4 change: 34 00, 20 C4, 2A 47, 1D 04...
FD: 42 02 34 00 00 00 00  → bytes 3-4 same pattern
```

Bytes 3-4 in FE frames are changing rapidly — THAT's the live FRP data!
0x3400 = 13312 * some_scale = ?
0x20C4 = 8388
0x2A47 = 10823
0x5D94 = 23956

If scale is 0.4712: 13312 * 0.4712 = 6272 PSI (too low for high RPM)
If scale is 1.0 kPa → PSI: 13312 * 0.145038 = 1931 PSI (too low)
If raw = PSI directly: 13312 PSI? No...

Hmm, let me check what 0x5E8 FE byte 5 is:
89, 87, 8A, 8B, 88, 8A, 8B, 88, 89, 88, 8A, 8A, 88, 89, 8B, 8B, 88, 89, 89, 8A, 89
These are around 0x87-0x8B = 135-139. Could be temperature?
