# Dry Run #11 Analysis (Apr 3, 2026)

## Major Progress
- UUDT broadcast commands working perfectly — all SESSION_OPEN commands fire-and-forget with FE prefix
- CLEANUP ReturnToNormal uses UUDT correctly
- Programming session succeeded on attempt 1/3 (26.6s)
- VERIFICATION phase: C1-C6, D0, CC all responded successfully
- Finalize 0xAE succeeded
- Post-key-cycle session re-established on attempt 2/5
- Full run completed in 204.2s

## Issues Found

### 1. Keepalive STILL shows UDS format
Line 36: `💓 TesterPresent keepalive started (0x3E 0x80 every 2s)`
Line 312: `💓 TesterPresent keepalive started (0x3E 0x80 every 2s)`
The LOG MESSAGE still says UDS format. Need to check if the actual CAN frame is correct (UUDT FE 01 3E) but the log text wasn't updated, or if the code change didn't take effect.

### 2. Seed-to-Key Lookup NOT matching bench ECU
Line 303-306: `Seed received after boot: 57 09 FD 6C 06` → `Unknown seed, no pri_key — sending dummy key`
The bench ECU seed is `A0 9A 34 9B 06` but after key cycle it sends `57 09 FD 6C 06`.
Wait — `57 09 FD 6C 06` is NOT in our lookup table! We have:
- Bench ECU: `A09A349B06` → `AF722A517E`
- Truck ECU: `CEDAF98306` → `592EF40F33`

But the bench ECU is sending a DIFFERENT seed (`57 09 FD 6C 06`) after key cycle!
This means the bench ECU seed is NOT static — it changes between sessions or after key cycle.
OR — this is a different ECU than the one in the BUSMASTER logs.

### 3. NRC 0x37 (requiredTimeDelayNotExpired) on Security Access
Line 135: `Seed received: 7F 27 37 (3 bytes)`
This is NOT a seed — it's NRC `7F 27 37` = negative response to service 0x27, NRC 0x37.
NRC 0x37 means the ECU has a security access delay timer active (usually 10s after failed attempt).
The engine is misinterpreting this NRC as a "3-byte seed".

### 4. PRE_CHECK security access timed out
Line 32: `Security access error: Timeout waiting for CAN response`
The initial security access attempt before DID reads timed out.

### 5. DID 0x90 still times out every time
Both pre-flash and post-key-cycle. This DID may genuinely not be supported.

## Key Findings
1. The seed `57 09 FD 6C 06` is the REAL bench ECU seed (seen in all previous dry runs too)
2. The BUSMASTER seed `A0 9A 34 9B 06` was from a DIFFERENT flash session or ECU state
3. Need to add `5709FD6C06` to the lookup table — but we don't know the correct key for it!
4. NRC 0x37 handling needs to be fixed — should wait 10s and retry, not treat as seed
