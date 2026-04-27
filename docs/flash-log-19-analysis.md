# Flash Log #19 Analysis (a801bd9e) — Apr 3, 2026

## Summary
**SECURITY ACCESS GRANTED** — First successful security unlock ever. AES key from Seed_key.cs works perfectly.

## Key Metrics
- Duration: **3m 7s** (best ever, down from 9m 58s in log #14)
- Bridge disconnects: 1 (at ~88s, reconnected in 0.3s)
- Security access: **GRANTED** in PRE_CHECK (19.3s) and KEY_CYCLE (149.0s)
- VERIFICATION DIDs: **8/9** responded (VIN 0x90 still times out)
- Post-key-cycle session: Attempt 2/5 (consistent)

## Milestone: Security Access Works!
```
[19.047s] Seed received (level 0x01): 57 09 FD 6C 06 (5 bytes)
[19.047s] 🔑 Key computed (E41 Seed_key.cs AES): C6 BF 02 28 58
[19.303s] 🔓 Security access granted — GMLAN DIDs should now be readable
```

Key computation: Seed `57 09 FD 6C 06` → AES key `45AE6BA2CB81F5656B05072D74FF47E0` → Key `C6 BF 02 28 58`
The same seed/key pair works consistently in both PRE_CHECK and KEY_CYCLE.

## Remaining Issues
1. Physical session re-establishment (0x10 0x02 on 0x7E0) after SESSION_OPEN broadcast times out (4 retries, all fail)
   - This is the same issue as real flash attempt #1
   - ECU responds to USDT in PRE_CHECK but not after broadcast SESSION_OPEN
   - Non-fatal in dry run, but will block real flash

2. SECURITY_ACCESS seed request after SESSION_OPEN also times out
   - Bridge disconnects at ~88s during retries
   - After reconnect, still fails
   - Same root cause: ECU not responding to USDT after broadcast

3. ClearDTC (0x04 on 0x7DF) times out in CLEANUP
   - 4 retries, all fail
   - May need physical address instead of functional

4. VIN (DID 0x90) never responds — consistent across all logs

## Positive Findings
- PRE_CHECK security access works perfectly (seed → key → granted)
- VERIFICATION DIDs respond (8/9) — ECU is alive after key cycle
- KEY_CYCLE security access also works (seed → key → granted)
- Finalize (0xAE) positive response
- Programming counter (0xCC): 03 4F FE EC
- Unlock status (0xD0): 41 42

## Root Cause Analysis: Post-Broadcast USDT Failure
The ECU responds to USDT commands in PRE_CHECK (before broadcast SESSION_OPEN) but NOT after the broadcast sequence. This suggests:
- The broadcast puts the ECU into a state where it ignores USDT on 0x7E0
- OR the ECU expects a different re-establishment sequence
- OR there's a timing issue — the ECU needs more time after A5 03

The VERIFICATION DIDs work because they come AFTER the key cycle, which resets the ECU state. The post-key-cycle session re-establishment succeeds because the ECU has been rebooted.

## Comparison with Previous Logs
| Metric | #18 (hexToBytes bug) | #19 (fixed) |
|--------|---------------------|-------------|
| Security access | FAILED (14-byte key) | **GRANTED** |
| Duration | 4m 22s | **3m 7s** |
| Key computation | Invalid AES key length | C6 BF 02 28 58 |
| VERIFICATION DIDs | 8/9 | 8/9 |
