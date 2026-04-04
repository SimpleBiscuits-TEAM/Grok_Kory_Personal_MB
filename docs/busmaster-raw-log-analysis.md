# BUSMASTER Raw CAN Log Analysis — E41 L5P Stock Flash (Successful)

> **Source:** `BUSMASTERLogFile_18L5Pstockflashsuccess.txt`
> **Date:** 2025-07-17 10:53:46
> **Total CAN frames:** 504,189
> **Total duration:** 241.0 seconds (4.0 minutes)
> **Result:** Successful stock flash of E41 (L5P Duramax)

## Complete Flash Sequence

The successful flash follows this exact sequence with no deviations:

### Phase 1 — Pre-Flash DID Reads (0.11s – 0.28s)

All reads on physical 0x7E0 → 0x7E8 while ECU is in default session.

| DID | Response | Value |
|-----|----------|-------|
| 0x90 (VIN) | Multi-frame 19 bytes | `1GT42WEY3KF132831` |
| 0xC1 (Cal ID 1) | `04 27 65 8B` | Primary calibration |
| 0xC2 (Cal ID 2) | `00 C1 9B EE` | |
| 0xC3 (Cal ID 3) | `00 C1 9B E8` | |
| 0xC4 (Cal ID 4) | `00 C1 9C 03` | |
| 0xC5 (Cal ID 5) | `00 C1 A6 38` | |
| 0xC6 (Cal ID 6) | `00 C1 A6 2C` | |
| 0xD0 (Unlock) | `55 4C` | "UL" = Unlocked |
| 0xCC (CRC) | `01 6E 37 E5` | |
| 0xD0 (again) | `55 4C` | Confirmation read |

### Phase 2 — SESSION_OPEN Broadcast (0.29s – 2.50s)

All commands on UUDT 0x101. Each command is 1 second apart except where noted.

| Time | Command | Bytes | Description |
|------|---------|-------|-------------|
| 0.29s | ReturnToNormal | `FE 01 20` | Reset all ECUs to default session |
| 1.29s | ReadDID B0 | `FE 02 1A B0` | Read programming counter from all ECUs |
| 1.35s | DiagSessionControl | `FE 02 10 02` | Switch all ECUs to programming session |
| 1.40s | DisableNormalComm | `FE 01 28` | Suppress normal CAN traffic |
| 1.45s | ReportProgrammedState | `FE 01 A2` | Query programming state |
| 2.45s | ProgrammingMode Request | `FE 02 A5 01` | Request programming mode |
| 2.50s | ProgrammingMode Complete | `FE 02 A5 03` | **ECU reboots into bootloader** |

**Key timing:** A5 01 → A5 03 gap is only **50ms**. Previous commands are ~500ms apart, but A5 01 → A5 03 is much faster.

### Phase 3 — Bootloader Wait (2.50s – 6.50s)

After A5 03, the tester sends TesterPresent keepalive broadcasts (`FE 01 3E`) every ~500ms for exactly **4.0 seconds** before attempting the first physical command. Seven TesterPresent frames are sent during this wait.

**Critical finding:** The BUSMASTER reference uses a **fixed 4.0s delay**, not polling. The bootloader is ready after 4.0s.

### Phase 4 — Security Access (6.50s – 6.51s)

All on physical 0x7E0 → 0x7E8. The entire security exchange takes **10ms**.

| Time | Direction | Data | Description |
|------|-----------|------|-------------|
| 6.5019s | TX | `02 27 01` | Seed Request (level 0x01) |
| 6.5057s | RX | `07 67 01 A0 9A 34 9B 06` | Seed: `A0 9A 34 9B 06` (3.8ms response) |
| 6.5075s | TX | `07 27 02 AF 72 2A 51 7E` | Key: `AF 72 2A 51 7E` (1.8ms after seed) |
| 6.5119s | RX | `02 67 02` | **Key Accepted** (4.4ms after key send) |

**No session change between security and RequestDownload.** The bootloader is already in the correct session from the broadcast.

### Phase 5 — Block Transfers (6.71s – 213.28s)

**7 RequestDownload commands** define 7 blocks. The first RequestDownload triggers an erase (NRC 0x78). **No TransferExit (0x37) is used at any point.**

#### RequestDownload Sequence

| Block | Time | Command | Response | Data Size |
|-------|------|---------|----------|-----------|
| 1 | 6.71s | `05 34 00 00 0F FE` | NRC 0x78 → 0x74 (31ms erase) | 0 bytes (erase only) |
| 2 | 6.75s | `04 34 10 0F FE` | 0x74 (immediate) | 2,890,364 bytes (706 chunks) |
| 3 | 173.70s | `04 34 10 0F FE` | 0x74 (immediate) | 12,282 bytes (3 chunks) |
| 4 | 175.35s | `04 34 10 0F FE` | 0x74 (immediate) | 8,188 bytes (2 chunks) |
| 5 | 176.87s | `04 34 10 0F FE` | 0x74 (immediate) | 8,188 bytes (2 chunks) |
| 6 | 178.33s | `04 34 10 0F FE` | 0x74 (immediate) | 61,410 bytes (15 chunks) |
| 7 | 182.51s | `04 34 10 0F FE` | 0x74 (immediate) | 540,408 bytes (132 chunks) |

**Total data transferred:** ~3.52 MB across 860 TransferData chunks.

**Block 1 is an erase-only command.** It sends `34 00 00 0F FE`, gets NRC 0x78 (responsePending = erasing), then 0x74 (done). The erase takes only 31ms in this log. No TransferData is sent for Block 1.

#### TransferData Pattern (Per Chunk)

Each 4094-byte chunk follows this exact pattern:

```
1. TX: First Frame (FF)    — 1F FE 36 00 [data...]     (0x7E0)
2. RX: Flow Control (FC)   — 30 00 F1                   (0x7E8)
3. TX: 584 Consecutive Frames (CF)                       (0x7E0)
4. RX: NRC 0x78            — 03 7F 36 78                (0x7E8, ECU writing to flash)
5. RX: Positive 0x76       — 01 76                      (0x7E8, write complete)
6. [wait ~15ms, then send next chunk]
```

**Timing per chunk:**
- FF → FC: 0.2-0.3ms
- FC → last CF: 158-178ms (584 CFs at ~0.3ms each)
- Last CF → NRC 0x78: 0.2-0.5ms (immediate)
- NRC 0x78 → 0x76: 5-20ms (flash write time)
- 0x76 → next FF: 14-26ms

**Total per chunk: ~200ms** (sending) + ~20ms (write) = ~220ms per 4094 bytes.

**Exception — Chunk 1 of Block 2:** The first TransferData chunk after erase takes 22.15 seconds for the NRC 0x78 → 0x76 transition. This is the initial flash erase completing. All subsequent chunks take ~20ms.

#### Flow Control Parameters

The ECU always responds with `30 00 F1`:
- **FlowStatus:** 0 = ContinueToSend
- **BlockSize:** 0 = unlimited (send all CFs without waiting)
- **STmin:** 0xF1 = 100 microseconds (per ISO 15765-2, 0xF1-0xF9 = 100-900µs)

Actual CF pacing is ~0.3ms (300µs), which is faster than the 100µs minimum but within CAN bus physical limits.

#### TransferData Sequence Number

The sequence number (byte 4 of the First Frame, after SID 0x36) is always `0x00` for all 860 chunks. This is **not** an incrementing counter — it appears to be a fixed block sequence identifier.

#### TesterPresent During Transfer

TesterPresent keepalive (`FE 01 3E` on 0x101) continues throughout the entire transfer at ~500ms intervals. **412 keepalives** are sent during the 206-second transfer window. The keepalive is **never paused**.

### Phase 6 — Post-Flash Sequence (213.28s – 241.03s)

After the last TransferData positive response (0x76) at 213.28s:

| Time | Delta | Command | Response |
|------|-------|---------|----------|
| 214.28s | +1.0s | `FE 01 20` (ReturnToNormal broadcast) | — |
| 214.33s | +0.05s | `03 AE 28 80` (DeviceControl) on 0x7E0 | **No response** |
| 214.33s–226.55s | 12.2s | TesterPresent keepalive continues | — |
| 226.55s | +12.2s | ReadDID 0x90 (VIN) | Multi-frame: `1GT42WEY3KF132831` |
| 226.57s | +0.02s | ReadDID 0xC1 | `00 C1 EF D4` (new cal!) |
| 226.58s | +0.01s | ReadDID 0xC2 | `00 C1 9B EE` |
| 226.58s | +0.01s | ReadDID 0xC3 | `00 C1 9B E8` |
| 226.59s | +0.01s | ReadDID 0xC4 | `00 C1 9C 00` (changed!) |
| 226.60s | +0.01s | ReadDID 0xC5 | `00 C1 FB 83` (changed!) |
| 226.60s | +0.01s | ReadDID 0xC6 | `00 C1 FB 77` (changed!) |
| 226.61s | +0.01s | ReadDID 0xD0 | `55 4C` (still unlocked) |
| 226.62s | +0.01s | ReadDID 0xCC | `01 6E 37 E5` (CRC unchanged) |
| 226.78s | +0.16s | ClearDTC on 0x7DF | `01 44` (positive) |
| 241.01s | +14.2s | OBD-II 0x09 0x02 on 0x7DF | VIN multi-frame |

**DeviceControl `0xAE 0x28 0x80`:** Sent 50ms after ReturnToNormal broadcast. The ECU does not respond to this command. The tester waits 12.2 seconds before reading verification DIDs. This command likely signals the bootloader to finalize the flash and reboot into the application.

## Discrepancies with Current Flash Engine

| Issue | BUSMASTER Reference | Current Engine | Fix Required |
|-------|-------------------|----------------|--------------|
| TransferExit | **Never sent** | Sends 0x37 after each block | Remove TransferExit |
| Block count | 7 blocks (1 erase + 6 data) | Assumes 1 block from container | Parse container for all blocks |
| First RD | `34 00 00 0F FE` (erase only) | Same format but expects data transfer | Handle erase-only first block |
| TD response wait | Must wait for NRC 0x78 → 0x76 after each chunk | May not wait for response | Add per-chunk response wait |
| Sequence number | Always 0x00 | May use incrementing counter | Fix to 0x00 |
| Bootloader wait | Fixed 4.0s with keepalive | Polling loop (12 probes × 5s) | Consider fixed delay + polling fallback |
| Keepalive during TD | Never paused, every ~500ms | May pause during transfer | Ensure keepalive runs continuously |
| Post-flash | RTN → AE 28 80 → 12s wait → DIDs → ClearDTC | Missing AE 28 80 and post-flash DIDs | Add complete post-flash sequence |
| ClearDTC | On 0x7DF (functional) | May use 0x7E0 (physical) | Use 0x7DF |
