# BUSMASTER Flash Log Analysis — E41 L5P

## Key Discovery: Seed/Key Values

**Both logs use the SAME seed and key:**
- Seed: `A0 9A 34 9B 06` (5 bytes)
- Key:  `AF 72 2A 51 7E` (5 bytes)
- Result: `67 02` — Key Accepted

This means the AES key for this ECU is FIXED (same seed always produces same key).
The ECU returns the same seed every time because it's HPTuners-unlocked.

## Stock Flash Sequence (successful)

### Phase 1: Pre-Read (no session switch needed)
1. ReadDID 0x1A 0x90 (VIN) → multi-frame response ✓
2. ReadDID 0x1A 0xC1 → `04 27 65 8B` ✓
3. ReadDID 0x1A 0xC2 → `00 C1 9B EE` ✓
4. ReadDID 0x1A 0xC3 → `00 C1 9B E8` ✓
5. ReadDID 0x1A 0xC4 → `00 C1 9C 03` ✓
6. ReadDID 0x1A 0xC5 → `00 C1 A6 38` ✓
7. ReadDID 0x1A 0xC6 → `00 C1 A6 2C` ✓
8. ReadDID 0x1A 0xD0 → `55 4C` (UL = unlocked) ✓
9. ReadDID 0x1A 0xCC → `01 6E 37 E5` ✓

### Phase 2: Functional Broadcast Sequence (on 0x101)
1. `0x101: FE 01 20` → ReturnToNormal (all ECUs respond 0x60)
2. `0x101: FE 02 1A B0` → ReadDID 0xB0 (all ECUs respond with SW versions)
3. `0x101: FE 02 10 02` → DiagnosticSession 0x02 (Programming) — 0x652 returns NRC 0x12, rest accept
4. `0x101: FE 01 28` → DisableNormalComm (all respond 0x68)
5. `0x101: FE 01 A2` → ReportProgrammedState (all respond E2 00)
6. `0x101: FE 02 A5 01` → ProgrammingMode Enable (all respond E5)
7. `0x101: FE 02 A5 03` → ProgrammingMode Complete

### Phase 3: TesterPresent Keepalive
- `0x101: FE 01 3E` every ~500ms during 5s wait
- 7 TesterPresent frames before security access

### Phase 4: Security Access (physical 0x7E0)
1. `27 01` → Seed: `A0 9A 34 9B 06`
2. `27 02 AF 72 2A 51 7E` → `67 02` Key Accepted ✓

### Phase 5: Block Transfer (6 blocks for stock)
1. RequestDownload `34 00 00 0F FE` (first block, 0xFFE bytes)
   - ECU responds NRC 0x78 (ResponsePending), then 0x74 (positive)
2. RequestDownload `34 10 0F FE` (subsequent blocks)
   - Immediate 0x74 positive response
3. TransferData `36 xx ...` in multi-frame ISO-TP
   - ECU flow control: `30 00 F1` (no wait, 241 separation time)
4. TransferExit `37` after each block

### Phase 6: Post-Flash Verification
1. ReadDID 0x1A 0x90 (VIN) ✓
2. ReadDID 0x1A 0xC1-C6 (Cal IDs) ✓
3. ReadDID 0x1A 0xD0 → `55 4C` ✓
4. ReadDID 0x1A 0xCC ✓

### Phase 7: Cleanup
- ReturnToNormal via functional broadcast

### Timing
- Total: ~11 minutes (10:58:31 to 11:09:49)
- 6 blocks transferred

## Mod Flash Sequence (on unlocked E41)

### Differences from Stock:
1. **Initial read phase**: Same DID reads, but also requests seed (27 01) without sending key — just checking
2. **10-minute gap**: 11:30:47 to 11:40:58 — likely user interaction/file selection
3. **Second read phase**: Repeats all DID reads
4. **Same functional broadcast sequence**: ReturnToNormal → ReadB0 → DiagSession → DisableComm → ProgrammedState → ProgrammingMode
5. **Same TesterPresent pattern**: ~500ms interval, 7 frames before security
6. **Same seed/key**: `A0 9A 34 9B 06` / `AF 72 2A 51 7E` → Accepted ✓
7. **7 blocks** (vs 6 for stock) — mod file is larger
8. **Post-flash**: Same verification reads, then `AE 28 80` command (unknown), then reads again
9. **Total**: ~13 minutes (11:40:59 to 11:53:18)

## Critical Implementation Notes for V-OP

1. **Functional broadcast (0x101) is ESSENTIAL** — the tool uses `FE` prefix on 0x101 for all broadcast commands
2. **The `FE` prefix** on 0x101 appears to be a BUSMASTER/PCAN protocol marker, not part of the CAN data
3. **Sequence matters**: ReturnToNormal → ReadB0 → DiagSession → DisableComm → ProgrammedState → ProgrammingMode(01) → ProgrammingMode(03) → TesterPresent x7 → SecurityAccess
4. **TesterPresent on 0x101** (functional), not 0x7E0 (physical) — sent as `FE 01 3E`
5. **RequestDownload first block** uses `34 00 00 0F FE`, subsequent use `34 10 0F FE`
6. **ECU flow control**: `30 00 F1` — STmin=241 (0xF1), BlockSize=0 (unlimited)
7. **NRC 0x78 (ResponsePending)** on first RequestDownload is normal — ECU is erasing flash
8. **The seed is STATIC** on this unlocked ECU — always `A0 9A 34 9B 06`, key is always `AF 72 2A 51 7E`
