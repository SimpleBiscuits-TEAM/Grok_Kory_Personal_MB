# Flash Log #4 Analysis — 538072b2 (FAILED)

## Key Timeline

| Time | Phase | Event | Result |
|------|-------|-------|--------|
| 0.0s | PRE_CHECK | Ignition ON confirmed | OK |
| 6.9s | PRE_CHECK | PCAN bridge connected | OK |
| 9.9s | PRE_CHECK | Programming session 0x10 0x02 attempt 1 | NRC 0x12 |
| 11.5s | PRE_CHECK | Programming session attempt 2 | NRC 0x12 |
| 18.2s | PRE_CHECK | Programming session attempt 3 | **SUCCESS** |
| 18.2s | PRE_CHECK | Security access seed request (0x27 0x01) | **TIMEOUT at 23.6s** |
| 23.8s | SESSION_OPEN | UUDT broadcast sequence | All OK (fire-and-forget) |
| 37.3s | SESSION_OPEN | Physical session 0x10 0x02 on 0x7E0 | TIMEOUT (nonFatal, OK) |
| 62.4s | SECURITY_ACCESS | Seed request 0x27 0x01 on 0x7E0 | **TIMEOUT → FATAL FAILURE** |

## Root Cause

**PRE_CHECK seed request timed out** — unlike log #3 where PRE_CHECK seed succeeded (57 09 FD 6C 06), this time the ECU didn't respond to the seed request at all during PRE_CHECK. Therefore `lastSecurityAccessGranted` remained `false`, and the GMLAN skip optimization we added did NOT trigger.

The SECURITY_ACCESS commands were marked `nonFatal: isGMLAN` in the orchestrator, BUT the engine's `handleSecurityAccess()` method throws on timeout rather than returning null — the nonFatal check in `executeCommand()` only catches errors thrown from the retry loop, and `handleSecurityAccess` is called INSIDE the retry loop.

Wait — actually looking at the code flow:
1. `executeCommand()` calls `handleSecurityAccess()` inside the retry/response loop
2. `handleSecurityAccess()` calls `sendUDSRequest()` which returns null on timeout
3. The null response falls through to the retry loop in `executeCommand()`
4. After all retries exhausted, `executeCommand()` checks `cmd.nonFatal` at line ~1343
5. But the SECURITY_ACCESS commands ARE marked `nonFatal: true` for GMLAN...

**So why did it fail?** Let me re-read the log:
- Line 57: `SECURITY_ACCESS error FAILED: Request Seed (Level 1)`
- This means the error was thrown, not caught by nonFatal

The issue: `handleSecurityAccess()` is called from inside the retry loop. When it returns null (timeout), the retry loop continues. After all retries, the code reaches the nonFatal check. But the log shows "FAILED" which means it threw an error.

**WAIT** — The real issue is that `handleSecurityAccess` is called inside the try block at line 1233. When it returns null, `response` is null. Then the code falls to the "no response" branch at line 1300-1309, which sets `lastError` and continues the retry loop. After retries exhausted, it should hit the nonFatal check at line 1343.

But the log shows it as a FATAL error. This means either:
1. The nonFatal flag wasn't set (orchestrator change didn't deploy?)
2. OR there's a code path that throws before reaching the nonFatal check

## Fix Required

The GMLAN skip optimization only works when PRE_CHECK security succeeds. But PRE_CHECK security is unreliable (works sometimes, doesn't other times — likely timing/bus contention). 

**The fix must be unconditional for GMLAN:** The SECURITY_ACCESS phase should ALWAYS be nonFatal for GMLAN ECUs, and the engine should proceed to PRE_FLASH regardless of whether security was granted in PRE_CHECK or not.

The E88 reference procedure shows security access happens after the broadcast and DOES work in the real SPS tool. The difference is likely timing or the specific way we're sending the request. But for now, we need to make the flash attempt proceed past SECURITY_ACCESS to see if PRE_FLASH (RequestDownload 0x34) works.
