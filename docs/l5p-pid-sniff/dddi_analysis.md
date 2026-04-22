# HP Tuners DDDI Setup Analysis — L5P E41 ECM

## Key Finding
HP Tuners does NOT send 0x10 0x03 (Extended Diagnostic Session).
Instead, it uses DDDI to define composite DIDs and starts periodic reads.
After DDDI setup, individual Mode 22 (0x22) reads also work.

## Sequence
1. Mode 01 bitmask scan on 0x7DF (functional broadcast)
2. Mode 22 DID 0x0100 on 0x7E0 → NRC 0x31 (requestOutOfRange) — fails in default session
3. Mode 0xAA (ReadDataByPeriodicIdentifier) → NRC 0x31 — fails
4. ~6 second gap
5. DDDI setup begins (0x2D + 0x2C commands)
6. 0xAA starts periodic reads (rate=4, IDs: FE FD FC FB FA F9 F8 F7)
7. ECU responds on 0x5E8 with periodic data (5574 frames total)
8. Individual Mode 22 reads (0x22 DID) now work!
9. Mode 0x23 ReadMemoryByAddress also works!

## DDDI Commands for ECM (0x7E0 → 0x7E8)

### Step 1: Define memory-mapped DIDs (0x2D)
- 0x2D FE00 → RAM addr 0x40022158, 4 bytes
- 0x2D FE01 → RAM addr 0x4001BC8C, 4 bytes
- 0x2D FE02 → RAM addr 0x40014F08, 4 bytes
- 0x2D FE03 → RAM addr 0x400123D4, 4 bytes
- 0x2D FE04 → RAM addr 0x40011F18, 2 bytes
- 0x2D FE05 → RAM addr 0x40014082, 2 bytes

### Step 2: Define periodic identifiers (0x2C) linking DIDs
- 0xFE → sources: FE00, DID 0x0010, DID 0x3035
- 0xFD → sources: FE01, DID 0x208B, DID 0x30D4
- 0xFC → sources: FE02, DID 0x20B4, DID 0x245D
- 0xFB → sources: FE03, DID 0x30AA, DID 0x1543
- 0xFA → sources: DID 0x303B, DID 0x30AB, FE04, DID 0x1540
- 0xF9 → sources: DID 0x303A, DID 0x131F, DID 0x0023, DID 0x0049
- 0xF8 → sources: DID 0x30A9, DID 0x30C3, DID 0x20E3, DID 0x0004
- 0xF7 → sources: DID 0x208A, DID 0x12DA, FE05, DID 0x0061

### Step 3: Start periodic reads (0xAA)
- AA 04 FE FD FC FB FA F9 F8 F7
- Rate 04 = "stopSending" per ISO 14229... but HPT uses it as fast rate
- ECU responds on 0x5E8 (not 0x7E8!) with periodic frames

## After DDDI: Individual Mode 22 reads that work
- 0x22 0071 → OK (6 bytes)
- 0x22 006A → OK (5 bytes)
- 0x22 000D → OK (1 byte)
- 0x22 005D → OK (2 bytes)
- 0x22 0062 → OK (1 byte)
- 0x22 30C1 → OK (2 bytes)
- 0x22 0063 → OK (2 bytes)
- 0x22 328A → OK (2 bytes)
- 0x22 30BC → OK (2 bytes)
- 0x22 002C → OK (1 byte)
- 0x22 1337 → OK (2 bytes)
- 0x22 004A → OK (1 byte)
- 0x22 20BC → OK (1 byte)
- 0x22 30BE → OK (2 bytes)
- 0x22 000F → OK (1 byte)
- 0x22 308A → OK (2 bytes)
- 0x22 007A → OK (responds)

## Critical Insight
The DDDI setup (0x2D/0x2C) implicitly transitions the ECU into a session
that allows Mode 22 reads. Without DDDI, Mode 22 returns NRC 0x31.
0x10 0x03 alone may not be sufficient — the ECU may require the DDDI
"handshake" to enable Mode 22 access.
