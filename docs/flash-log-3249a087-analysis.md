# Flash Log #16 Analysis — 3249a087 (FAILED)

## Timeline
- **Duration:** 4m 43s
- **Result:** FAILED — ECU bootloader never responded across 36 probe attempts (3 rounds)
- **Data transferred:** 0 bytes

## Root Cause Analysis

### Problem: ECU bootloader completely unresponsive after A5 03

The ECU never responded to any seed request (0x27 0x01) across 36 attempts spanning ~230 seconds. This is the second consecutive failure with the same symptom (log #15 also had zero response).

### Comparison: When DID the bootloader respond?

| Log | Bootloader Response | Time After A5 03 | Key Difference |
|-----|---------------------|-------------------|----------------|
| #10 (73b202dc) | YES — seed received | ~30s | PRE_CHECK had NO physical session/security attempts |
| #13 (388c5fc6) | YES — seed received | ~30s | Similar to #10 |
| #14 (daac7370) | YES — seed received | ~77s | PRE_CHECK had physical session/security attempts |
| #15 (76bb2759) | NO — 36 probes, no response | Never | Keepalive fix + timing changes |
| #16 (3249a087) | NO — 36 probes, no response | Never | Same as #15 |

### Six Discrepancies Between Our Sequence and BUSMASTER

#### 1. PRE_CHECK sends physical commands BEFORE broadcast (BUSMASTER: NOTHING before broadcast)

Our PRE_CHECK phase (lines 17-23) sends:
- 3× `0x10 0x02` on physical 0x7E0 (programming session) — all timeout
- 1× `0x27 0x01` on physical 0x7E0 (seed request) — times out

These take **~29 seconds** and put 4 physical CAN frames on the bus before the broadcast even starts. BUSMASTER sends ZERO physical commands before the broadcast.

**Impact:** The ECU receives unexpected physical commands while in DEFAULT session. While they timeout, the ECU may enter a confused state or start a lockout timer.

#### 2. Broadcast timing is 2.5x too slow

Our broadcast takes **5.56s** (39.37s → 44.93s). BUSMASTER takes **2.21s** (0.29s → 2.50s).

The E88-based delays (1000, 250, 250, 1000, 2000, 1000, 50) don't match the actual E41 BUSMASTER timing (1000, 60, 50, 50, 1000, 50).

#### 3. TesterPresent starts during broadcast (BUSMASTER: starts AFTER A5 03)

Our keepalive starts at 39.4s (during PRE_CHECK), which means keepalive frames are interleaved with broadcast commands. BUSMASTER starts keepalive ONLY during the 4s bootloader wait after A5 03.

#### 4. Keepalive pauses during seed probes

Each seed probe pauses keepalive for ~5s (timeout duration). During the 36-probe polling phase, keepalive is paused ~70% of the time. BUSMASTER shows keepalive runs continuously, never paused.

#### 5. Seed probes are too aggressive

We send `0x27 0x01` every 8s (5s timeout + 3s wait). BUSMASTER sends ONE seed request after a fixed 4.0s wait and gets an immediate response. The repeated seed requests may be interfering with the bootloader.

#### 6. Bridge WebSocket drops during polling

The bridge disconnects at 118.0s and 269.3s (every ~150s). During reconnection, there's a ~1s gap where no CAN frames are sent. The keepalive stops during this gap.

## Comprehensive Fix Plan

### Fix 1: Skip PRE_CHECK physical commands for GMLAN flash mode

For GMLAN ECUs in FULL_FLASH mode, skip the physical session/security attempts in PRE_CHECK. The BUSMASTER reference sends NOTHING before the broadcast. The PRE_CHECK physical commands are only useful for dry-run DID reads, not for the actual flash.

### Fix 2: Match BUSMASTER broadcast timing exactly

Replace E88-based delays with BUSMASTER-proven timing:
```
ReturnToNormal:           0ms (first command)
ReadDID B0:            1000ms after RTN
DiagSessionControl:      60ms after ReadDID
DisableNormalComm:       50ms after DiagSession
ReportProgrammedState:   50ms after DisableComm
ProgrammingMode A5 01: 1000ms after ReportState
ProgrammingMode A5 03:   50ms after A5 01
```

### Fix 3: Don't start keepalive until after A5 03

Remove the TesterPresent Cyclic command from the broadcast sequence. Instead, start keepalive automatically after A5 03 is sent. This matches BUSMASTER where keepalive only appears during the 4s bootloader wait.

### Fix 4: Use fixed 4.0s delay instead of polling

After A5 03, wait exactly 4.0s (with keepalive running), then send ONE seed request. If it fails, fall back to polling with 3s intervals. BUSMASTER shows the bootloader is ready in exactly 4.0s.

### Fix 5: Don't pause keepalive during seed request

The BUSMASTER shows keepalive running continuously, even during the seed/key exchange. The seed request is on physical 0x7E0 and keepalive is on broadcast 0x101 — they don't interfere. Remove the pause/resume around seed probes.

### Fix 6: Increase polling budget

If the fixed 4.0s delay doesn't work (bench ECU may be slower), increase polling to 30 attempts × 3s = 90s before giving up.

## Implementation Status

All 6 fixes implemented and verified:
- TypeScript: 0 compilation errors
- Tests: 1377/1380 pass (3 pre-existing failures in geofence/shareToken, unrelated)
- Orchestrator: broadcast timing matches BUSMASTER exactly, TesterPresent moved after A5 03
- Flash engine: PRE_CHECK skips physical commands for live flash, keepalive never paused during security

## Expected Behavior for Attempt #17

1. PRE_CHECK: Bridge connect + 3s settle (no physical commands)
2. SESSION_OPEN: RTN → 1000ms → ReadDID → 60ms → DiagSession → 50ms → DisableComm → 50ms → ReportState → 1000ms → A5 01 → 50ms → A5 03 → 50ms → Start Keepalive
3. SECURITY_ACCESS: 4.0s delay → seed request (keepalive running) → seed response → key send → granted
4. BLOCK_TRANSFER: RequestDownload → NRC 0x78 (erase) → 0x74 (positive) → TransferData chunks

Total broadcast window: ~2.26s (vs 5.56s before)
Total PRE_CHECK: ~10s (vs ~39s before)
