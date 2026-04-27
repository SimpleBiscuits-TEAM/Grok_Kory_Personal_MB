# Flash Log #6 Analysis — 04533083 (Apr 3, 2026)

## HUGE PROGRESS — First Successful Post-Broadcast USDT Communication!

### Timeline Summary

| Time | Phase | Event | Result |
|------|-------|-------|--------|
| 0.0s | PRE_CHECK | Ignition ON confirmed | ✓ |
| 6.2s | PRE_CHECK | PCAN bridge connected | ✓ |
| 9.2s | PRE_CHECK | Programming session (3 attempts) | NRC 0x12 all 3 |
| 12.2s | PRE_CHECK | GMLAN ProgrammingMode fallback | Failed |
| 12.2s | PRE_CHECK | Security seed request | NRC 0x12 |
| 12.6s | PRE_CHECK | TesterPresent cyclic started | ✓ |
| 12.6s | SESSION_OPEN | Broadcast sequence (8 commands) | All ✓ (UUDT) |
| 19.1s | SESSION_OPEN | A5 03 ProgrammingMode Complete | ✓ |
| 19.6s | SECURITY_ACCESS | Seed request on 0x7E0 | **NRC 0x37 at 57.9s** |
| 68.0s | SECURITY_ACCESS | Seed received after 10s lockout wait | **57 09 FD 6C 06** |
| 68.0s | SECURITY_ACCESS | Key computed | **C6 BF 02 28 58** |
| 70.0s | SECURITY_ACCESS | **Security access GRANTED** | **✓ !!!** |
| 70.3s | PRE_FLASH | RequestDownload 0x34 PriRC | TX: 0x7E0 05 34 00 00 0F FE |
| 75.4s | PRE_FLASH | First attempt timeout | Timeout |
| 79.6s | PRE_FLASH | Second attempt | **NRC 0x22 (conditionsNotCorrect)** |
| 86.3s | PRE_FLASH | Third attempt timeout | Timeout → FAILED |

### Key Findings

1. **TIMING FIX WORKED!** Security access now works AFTER the broadcast. The ECU responded to the seed request (with NRC 0x37 lockout first, then seed after 10s wait). This confirms:
   - The 1000ms A5 01→A5 03 delay (matching E88) is correct
   - Removing the physical session re-establishment was correct
   - The 500ms delay before first USDT command is correct
   - The ECU IS responsive on USDT after the broadcast

2. **NRC 0x37 (requiredTimeDelayNotExpired)** — The ECU had a security lockout timer active. This is normal — the PRE_CHECK security attempt (which got NRC 0x12) may have triggered the lockout. The engine correctly waited 10s and retried.

3. **Security access GRANTED at 70.0s** — Seed/key exchange worked perfectly. The ECU accepted the key.

4. **RequestDownload (0x34) PriRC FAILED** — Three attempts:
   - Attempt 1: Timeout (75.4s — 5s after TX at 70.3s)
   - Attempt 2: NRC 0x22 (conditionsNotCorrect) at 79.6s
   - Attempt 3: Timeout at 86.3s

### NRC 0x22 Analysis (conditionsNotCorrect)

NRC 0x22 means the ECU received the command but the preconditions for executing it are not met. Possible reasons:

1. **The PriRC command format is wrong** — `34 00 00 0F FE` may not be the correct format for E41
   - E88 uses: `34 00 00 0F FE` (from the reference procedure)
   - But E41 may use a different format
   - The addressAndLengthFormatIdentifier (0x00) may be wrong for E41

2. **The PriRC is E88-specific and not needed for E41** — The E41 may not use a PriRC at all. The PriRC may be an E88-specific initialization step.

3. **The ECU needs EraseMemory (0x31) before RequestDownload** — Some ECUs require an erase command before download. The E88 procedure may handle this differently.

4. **The ECU session timed out** — Between security access grant (70.0s) and 0x34 TX (70.3s) is only 300ms, so this is unlikely.

5. **The security access level is wrong** — Level 1 may not be sufficient for programming. Some ECUs need Level 3 or Level 11 for flash programming.

### Most Likely Root Cause

The PriRC command `34 00 00 0F FE` is E88-specific. The E41 likely uses a different RequestDownload format or doesn't need the PriRC at all. The E41 may need:
- A different addressAndLengthFormatIdentifier
- An EraseMemory command before RequestDownload
- The block-specific RequestDownload directly (not a PriRC)

### Proposed Fix

1. **Make the PriRC non-fatal** — If it fails, continue to the block-specific RequestDownload
2. **OR remove the PriRC entirely for E41** — It may be E88-specific
3. **Check the block RequestDownload format** — Make sure the per-block 0x34 uses the correct format for E41
