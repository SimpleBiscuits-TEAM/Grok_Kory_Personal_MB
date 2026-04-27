# Flash Log #8 Analysis — 4d32f3e4 (Apr 3, 2026)

## MAJOR PROGRESS — Bootloader Polling Works Perfectly!

### Timeline Summary

| Time | Phase | Event | Result |
|------|-------|-------|--------|
| 0.0s | PRE_CHECK | Ignition ON confirmed | OK |
| 6.1s | PRE_CHECK | PCAN bridge connected | OK |
| 19.4s | PRE_CHECK | Programming session attempt 1 | Timeout |
| 21.0s | PRE_CHECK | Programming session attempt 2 | **OK** |
| 26.4s | PRE_CHECK | Security seed request | Timeout (no lockout) |
| 26.6s | SESSION_OPEN | Broadcast sequence (8 commands) | All OK (UUDT) |
| 33.1s | SESSION_OPEN | A5 03 ProgrammingMode Complete | OK |
| 33.6s | SECURITY_ACCESS | Probe 1 — seed request | Timeout (ECU rebooting) |
| 38.7s | SECURITY_ACCESS | Probe 2 — seed request | Timeout |
| 48.9s | SECURITY_ACCESS | Probe 3 — seed request | Timeout |
| 59.0s | SECURITY_ACCESS | Probe 4 — seed request | Timeout |
| 69.2s | SECURITY_ACCESS | Probe 5 — seed request | Timeout |
| 79.3s | SECURITY_ACCESS | Probe 6 — seed request | **Seed received!** 57 09 FD 6C 06 |
| 84.5s | SECURITY_ACCESS | Key computed | C6 BF 02 28 58 |
| 89.7s | SECURITY_ACCESS | Key send | **Timeout!** (key send failed) |
| 95.8s | SECURITY_ACCESS | Retry — Probe 1 | Timeout |
| 100.9s | SECURITY_ACCESS | Retry — Probe 2 | **Seed received again** |
| 101.1s | SECURITY_ACCESS | Key send | **GRANTED!** |
| 101.4s | PRE_FLASH | PriRC 0x34 00 00 0F FE | Timeout → NRC 0x22 → nonFatal skip |
| 119.1s | PRE_FLASH | Per-block 0x34 00 44 1000 160d45 | **TIMEOUT → FAILED** |

## Key Observations

### 1. Bootloader Polling Works!
- ECU took ~51s to respond after A5 03 (33.1s → 84.5s)
- 5 timeout probes before seed received — exactly as predicted
- Polling loop budget (60s) was sufficient

### 2. Key Send Timeout — Interesting!
- Seed received at 84.5s, key computed immediately
- Key send at ~85s → **TIMEOUT at 89.7s** (5s timeout)
- The ECU gave us the seed but then didn't respond to the key!
- On retry, seed received again at 100.9s, key sent at 101.1s → **GRANTED**
- This suggests the ECU may have a narrow window for key response

### 3. PriRC NRC 0x22 — Expected and Handled
- PriRC correctly got NRC 0x22 (conditionsNotCorrect) — E88-specific, not for E41
- Correctly skipped as nonFatal

### 4. Per-Block RequestDownload — THE FAILURE POINT
- Command: `TX: 0x7E0 xx 34 00 44 1000 160d45`
- The `xx` is the length byte (calculated at runtime)
- Format: `34 00 44 {4-byte start addr} {4-byte block length}`
- addressAndLengthFormatIdentifier = 0x44 (4-byte address + 4-byte length)
- Start address: 0x00001000
- Block length: 0x00160d45

### 5. BUT WAIT — There's No Erase Before RequestDownload!
Looking at the log, after PriRC skip, it goes DIRECTLY to RequestDownload.
The orchestrator generates: Erase → RequestDownload → TransferData → TransferExit
But the erase command (`0x31 01 FF 00`) is NOT in the log!

Let me check: The block has `erase !== '0'` check. If the container's block has erase='0', the erase command is skipped.

### 6. The RequestDownload Format May Be Wrong
- `34 00 44 1000 160d45` — this uses `00` as dataFormatIdentifier and `44` as addressAndLengthFormatIdentifier
- But GMLAN may use a different format
- The E88 reference uses `34 00 00 0F FE` for PriRC — which is `00` for both identifiers
- The per-block format should match the E88 reference block format

## Root Cause Candidates

### A. Missing EraseMemory before RequestDownload
The ECU may require erase before accepting a download request. If the container block has erase='0', the erase is skipped. Need to check the container.

### B. Wrong RequestDownload format
- `34 00 44 {addr} {len}` may be wrong for GMLAN
- GMLAN may use `34 00 {addr_2bytes} {len_2bytes}` (2-byte format, not 4-byte)
- Or the addressAndLengthFormatIdentifier should be different

### C. The ECU session timed out
- Security granted at 101.1s
- PriRC attempts from 101.4s to 119.1s (18s of timeouts)
- Per-block 0x34 at 119.1s — that's 18s after security grant
- The ECU may have timed out the programming session during the PriRC attempts!
- **This is very likely** — the TesterPresent keepalive was paused during the PriRC command execution

## Most Likely Root Cause: Session Timeout During PriRC Attempts

The PriRC takes 3 retries × 5s timeout = 15s+ before being skipped as nonFatal.
During this time, TesterPresent is PAUSED (line 1231 in executeCommand: `this.pauseKeepalive()`).
The ECU's programming session likely timed out (typical P3 timeout is 5-10s).

By the time the per-block RequestDownload is sent at 119s, the ECU has dropped out of programming session.

## Fix: Reduce PriRC timeout and/or resume keepalive between retries
