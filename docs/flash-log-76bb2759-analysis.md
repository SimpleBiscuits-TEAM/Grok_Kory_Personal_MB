# Flash Log #15 Analysis — 76bb2759 (FAILED)

> **Date:** Apr 4, 2026
> **Duration:** 6m 50s
> **Result:** FAILED — ECU bootloader never responded
> **Transferred:** 0 B / 1.4 MB

## Failure Summary

The ECU bootloader was completely unresponsive after the A5 03 reboot. 36 seed request probes across 3 rounds (12 probes × 3 retries = 6+ minutes) all timed out. No CAN response was received from 0x7E8 at any point during the security access phase.

## Root Cause Analysis

Three issues identified by comparing with the BUSMASTER reference (successful stock flash):

### 1. Keepalive Paused During Bootloader Polling (CRITICAL)

The `executeCommand()` method calls `pauseKeepalive()` before dispatching to `handleSecurityAccess()`. This means TesterPresent keepalive (`FE 01 3E` on 0x101) was NOT being sent during the entire 6+ minutes of bootloader polling.

**BUSMASTER reference:** 7 TesterPresent keepalive frames are sent during the 4.0-second bootloader wait window. The bootloader may require these keepalives to complete initialization.

**Fix:** Security access now manages keepalive internally — keepalive runs during polling, only paused for the brief moment of the actual seed/key UDS exchange.

### 2. A5 01 → A5 03 Timing Too Slow

Our engine had a 1000ms delay between A5 01 (ProgrammingMode Enable) and A5 03 (ProgrammingMode Complete). The BUSMASTER reference shows this gap is exactly **50ms**.

**Fix:** `delayBeforeMs` for A5 03 changed from 1000ms to 50ms.

### 3. Seed Request Too Early After A5 03

Our engine started sending seed requests 500ms after A5 03. The BUSMASTER reference shows a **4.0-second fixed delay** with keepalive running before the first physical command (seed request).

**Fix:** `delayBeforeMs` for the seed request changed from 500ms to 4000ms.

## Why Log #14 Worked But #15 Didn't

In log #14, the bridge WebSocket disconnected and reconnected during bootloader polling. The reconnection may have:
1. Caused a brief burst of keepalive frames that the bootloader needed
2. Reset the bridge's CAN state, allowing it to properly receive the seed response

In log #15, no disconnection occurred, so the bootloader never received keepalives and never completed initialization.

## Changes Made

| File | Change |
|------|--------|
| `pcanFlashEngine.ts` | Security access manages keepalive internally; keepalive runs during polling |
| `pcanFlashEngine.ts` | Poll interval reduced from 5s to 3s |
| `pcanFlashOrchestrator.ts` | A5 01 → A5 03 delay: 1000ms → 50ms |
| `pcanFlashOrchestrator.ts` | Seed request delay: 500ms → 4000ms |

## Expected Behavior After Fix

1. A5 01 sent, 50ms later A5 03 sent (matching BUSMASTER)
2. 4.0s fixed delay with keepalive running (7 TesterPresent frames)
3. Seed request on 0x7E0 — should get immediate response (3.8ms per BUSMASTER)
4. Key computed and sent — accepted in 4.4ms
5. RequestDownload `34 00 00 0F FE` — should get NRC 0x78 (erase) then 0x74
