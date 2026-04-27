# Flash Log #14 Analysis — daac7370

## Timeline
| Time | Phase | Event |
|------|-------|-------|
| 0.0s | PRE_CHECK | Start |
| 10.6s | PRE_CHECK | Programming session attempts start |
| 29.2s | PRE_CHECK | Programming session active (attempt 3/3) |
| 34.5s | PRE_CHECK | Security access timeout — continuing |
| 34.7s | SESSION_OPEN | Broadcast sequence starts |
| 41.2s | SESSION_OPEN | A5 03 ProgrammingMode Complete |
| 41.8s | SECURITY_ACCESS | First seed probe (500ms after A5 03) |
| 46.9s | SECURITY_ACCESS | Bootloader not ready (attempt 1/12) |
| 57.1s | SECURITY_ACCESS | Bootloader not ready (attempt 2/12) |
| ... | SECURITY_ACCESS | Attempts 3-11 all timeout |
| 112.2s | SECURITY_ACCESS | All 12 probes exhausted (~70s after A5 03) |
| 112.2s | SECURITY_ACCESS | Bridge WebSocket disconnected |
| 112.5s | SECURITY_ACCESS | Bridge reconnected (attempt 1/3) |
| 113.0s | SECURITY_ACCESS | Retry 1/2 after reconnect |
| 119.0s | SECURITY_ACCESS | **Seed received: 57 09 FD 6C 06** |
| 119.0s | SECURITY_ACCESS | Key computed (AES): C6 BF 02 28 58 |
| 119.4s | SECURITY_ACCESS | **Security access GRANTED** |
| 119.4s | BLOCK_TRANSFER | Block #0 starts |
| 119.4s | BLOCK_TRANSFER | **Programming session accepted (0x10 0x02)** ✓ |
| 119.7s | BLOCK_TRANSFER | TX: RequestDownload 34 00 00 0F FE |
| 123.5s | BLOCK_TRANSFER | **NRC 0x22 (conditionsNotCorrect)** ✗

## Key Observations

1. **Programming session fix WORKED** — 0x10 0x02 accepted at 119.5s (line 69)
2. **RequestDownload STILL fails with NRC 0x22** despite programming session being active
3. **Bootloader took much longer** — 12 probes exhausted (60s budget), then bridge dropped, reconnected, and seed came on retry 1/2 at 119.0s (~77s after A5 03)
4. **Bridge disconnected** at 112.2s during bootloader polling — reconnected successfully

## Root Cause Analysis

The programming session is now active, but RequestDownload still returns NRC 0x22. This means the session state is correct but something else is missing. Possible causes:

### Hypothesis 1: Security invalidated by session change
When DiagnosticSessionControl (0x10 0x02) is sent AFTER security access, the session transition may reset the security state. In standard UDS, changing sessions typically resets security access. The correct sequence should be:

1. Programming session (0x10 0x02) — FIRST
2. Security access (0x27 seed/key) — SECOND (after session is established)
3. RequestDownload (0x34) — THIRD

Our current sequence is:
1. Security access (0x27 seed/key) — during SECURITY_ACCESS phase
2. Programming session (0x10 0x02) — in executeBlockTransfer, before RequestDownload
3. RequestDownload (0x34) — fails with NRC 0x22

**This is the most likely cause.** The session change at step 2 invalidated the security grant from step 1.

### Hypothesis 2: Container rc34 should be used
The engine is constructing `34 00 00 0F FE` as a fallback because the container's `rc34` field might be empty or not being read. The BUSMASTER reference says to use container-provided rc34.

### Hypothesis 3: Missing PriRC before RequestDownload
The E41 protocol master reference mentions PriRC from `block_struct.pri_rc` should be sent before RequestDownload. We removed PriRC entirely, but maybe it's needed for E41 (not just E88).

## Fix Plan

**Primary fix: Reorder session and security**

Move the programming session establishment (0x10 0x02) to BEFORE security access, not after. The correct sequence after bootloader polling:

1. Wait for bootloader to respond (polling loop)
2. Send 0x10 0x02 (Programming Session) on physical address
3. Send 0x27 0x01 (Seed Request) — security access
4. Send 0x27 0x02 + key (Key Send)
5. Send 0x34 (RequestDownload)

This matches the standard UDS sequence where security is always done WITHIN the programming session, not before it.

**Implementation:** Remove the physical 0x10 0x02 from `executeBlockTransfer()` entirely.

The broadcast already sent programming session via UUDT (`FE 02 10 02` on 0x101) BEFORE the A5 03 reboot. The BUSMASTER reference shows the sequence goes directly from key accepted → 206ms → RequestDownload, with NO session change in between. The DevProg GM_FLASH_SEQUENCE also confirms: `OPENPS_GMLAN → REQUEST_SEED → SEND_KEY → PRIRC → FLASH_BLOCKS` — session is opened BEFORE security, never after.

**Fix applied:** Replaced the 0x10 0x02 block with a comment explaining why it must NOT be sent.
