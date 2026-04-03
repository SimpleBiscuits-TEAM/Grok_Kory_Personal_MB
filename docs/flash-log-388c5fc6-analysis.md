# Flash Log #13 Analysis — 388c5fc6

## Timeline
| Time | Phase | Event |
|------|-------|-------|
| 0.0s | PRE_CHECK | Start |
| 9.8s | PRE_CHECK | Programming session attempts start |
| 28.4s | PRE_CHECK | Programming session active (attempt 3/3) |
| 30.4s | PRE_CHECK | Seed received: 57 09 FD 6C 06 |
| 30.7s | PRE_CHECK | **Security GRANTED** (PRE_CHECK) |
| 30.9s | PRE_CHECK | TesterPresent keepalive started |
| 30.9s | SESSION_OPEN | Broadcast sequence starts |
| 37.4s | SESSION_OPEN | A5 03 ProgrammingMode Complete |
| 37.9s | SECURITY_ACCESS | First seed probe (500ms after A5 03) |
| 43.0s | SECURITY_ACCESS | Bootloader not ready (attempt 1/12) |
| 53.2s | SECURITY_ACCESS | Bootloader not ready (attempt 2/12) |
| 63.3s | SECURITY_ACCESS | Bootloader not ready (attempt 3/12) |
| 72.7s | SECURITY_ACCESS | **Seed received** (35s after A5 03) |
| 74.7s | SECURITY_ACCESS | **Security GRANTED** (post-broadcast) |
| 74.7s | BLOCK_TRANSFER | RequestDownload sent: 34 00 00 0F FE |
| 78.7s | BLOCK_TRANSFER | **NRC 0x22 (conditionsNotCorrect)** |

## Key Observations

1. **Security GRANTED twice** — both PRE_CHECK and post-broadcast. Confirmed working.
2. **Bootloader polling working** — 3 probes, ECU responds at 35s after A5 03.
3. **RequestDownload format**: `34 00 00 0F FE` — GMLAN format, first block, maxBlockLen=0xFFE.
4. **NRC 0x22 at 78.7s** — 4s after security grant. Session should still be alive.
5. **No PriRC** — removed in previous fix. Good.

## Root Cause Analysis

NRC 0x22 = conditionsNotCorrect. Possible causes:
1. **Wrong RequestDownload format** — `34 00 00 0F FE` may not be correct for E41
2. **Missing EraseMemory before RequestDownload** — E41 may need erase despite earlier analysis
3. **Wrong session state** — ECU may need explicit programming session (0x10 0x02) AFTER bootloader reboot
4. **Container rc34 not being used** — the engine is using GMLAN fallback format, not container rc34

## BUSMASTER Reference Comparison
From busmaster_analysis.md, the working sequence after security access is:
- RequestDownload: `34 00 00 0F FE` (first block) — ECU responds NRC 0x78 then 0x74
- TransferData: `36 xx ...` chunks
- TransferExit: `37`

The format matches! But the BUSMASTER ECU was HPTuners-unlocked (static seed A0 9A 34 9B 06).
Our ECU has a dynamic seed (57 09 FD 6C 06).

## Critical Question
Is the ECU actually in programming mode after the bootloader reboot?
The bootloader polling does seed/key (0x27) but does NOT re-establish programming session (0x10 0x02).
After the bootloader reboots, it may start in DEFAULT session, not programming session.
The broadcast sent 0x10 0x02 via UUDT (functional), but the bootloader rebooted AFTER that.

## Hypothesis: Missing Programming Session After Bootloader Reboot
The broadcast sequence sends ProgrammingSession (0x10 0x02) at 32.4s.
Then A5 01 at 36.4s and A5 03 at 37.4s trigger the bootloader reboot.
The bootloader starts fresh — it doesn't inherit the session from the application firmware.
The seed/key exchange works because 0x27 is available in default session on some ECUs.
But RequestDownload (0x34) requires programming session.

**FIX: Send 0x10 0x02 (DiagnosticSessionControl ProgrammingSession) on 0x7E0 AFTER security access is granted, BEFORE RequestDownload.**
