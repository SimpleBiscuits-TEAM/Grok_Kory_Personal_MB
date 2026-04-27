# Flash Log #13 Analysis — 575373d8 (Post Bridge Reconnect)

## Summary
- ECU: E41 (L5P Duramax), DRY RUN mode, PCAN connection
- Result: SUCCESS (dry run completed all phases)
- Duration: 7m 52s (472s)
- **Major improvement**: Bridge reconnect works! 4 successful reconnections during session.

## Key Findings

### What's Working (Improvements from Log #12)

1. **Bridge auto-reconnect is working** — 4 successful reconnections:
   - PRE_CHECK at 88.9s → reconnected at 98.2s (attempt 1/3) ✓
   - VERIFICATION at 153.4s → reconnected at 167.6s (attempt 1/3) ✓
   - VERIFICATION at 216.8s → reconnected at 231.1s (attempt 1/3) ✓
   - VERIFICATION at 280.3s → reconnected at 294.6s (attempt 1/3) ✓
   - KEY_CYCLE at 380.9s → reconnected at 387.2s (attempt 1/3) ✓

2. **SESSION_OPEN sequence fires correctly** — all UUDT commands succeed:
   - ReturnToNormal (FE 01 20) at 98.7s ✓
   - TesterPresent cyclic (FE 01 3E) at 99.7s ✓
   - ReadB0 (FE 02 1A B0) at 99.9s ✓
   - DiagSession (FE 02 10 02) at 100.2s ✓
   - DisableComm (FE 01 28) at 101.2s ✓
   - ReportProgrammedState (FE 01 A2) at 103.2s ✓
   - ProgrammingMode Enable (FE 02 A5 01) at 104.2s ✓
   - ProgrammingMode Complete (FE 02 A5 03) at 104.7s ✓

3. **Post-key-cycle session re-established** — programming session recovered on attempt 5/5 at 416.4s ✓

4. **Seed received after boot**: 57 09 FD 6C 06 — same seed as log #11 ✓

5. **ClearDTC GMLAN works** — 0x04 on 0x7DF got positive response (RX: 0x7E8) at 472.9s ✓

6. **CLEANUP sequence correct** — ECU Reset → ClearDTC → ReturnToNormal ✓

### Issues Found

1. **Bridge drops every ~60s** — Pattern is clear:
   - Connected at 8.0s, drops at ~88.9s (80s)
   - Reconnected at 98.2s, drops at ~153.4s (55s)
   - Reconnected at 167.6s, drops at ~216.8s (49s)
   - Reconnected at 231.1s, drops at ~280.3s (49s)
   - This is likely the bridge's WebSocket idle timeout or a keepalive issue

2. **After reconnect, first command still fails** — "WebSocket not connected" on the very next command after successful reconnect. The reconnect succeeds but the PCANConnection internal state may not be fully reset (monitorActive, udsMonitorStarted, etc.)

3. **ECU doesn't respond to USDT commands** — ALL USDT requests timeout (DID reads, TesterPresent, security access). Only exceptions:
   - Programming session (0x10 0x02) succeeded at 16.2s ✓
   - TesterPresent got NRC 0x12 at 418.0s (after key cycle) ✓
   - ClearDTC got positive response at 472.9s ✓
   - Seed received at 417.6s (after key cycle) ✓
   This suggests the ECU only responds after fresh power cycle (key cycle), not during the initial session.

4. **Dummy key rejected with NRC 0x35** (invalidKey) — Expected, since the ECU is locked and needs proper AES key computation with pri_key from the container.

5. **Total time is 7m 52s** — mostly wasted on VERIFICATION DID read retries (each takes ~18s with retries). In dry run mode, these could be skipped or reduced.

## Recommendations

1. **Reduce VERIFICATION retries in dry run** — Each DID read takes 18s (5s timeout × 3 attempts + backoff). With 9 DIDs, that's 162s wasted. In dry run, reduce to 1 retry or skip entirely since we know the ECU won't respond to USDT after SESSION_OPEN broadcast.

2. **Fix post-reconnect state** — After reconnect, the PCANConnection's internal state (monitorActive, udsMonitorStarted, udsResponseListener) may be stale. Need to reset these on reconnect.

3. **Investigate bridge timeout** — The ~50-60s disconnect pattern suggests the bridge has a WebSocket idle timeout. Consider:
   - Adding WebSocket ping/pong to the bridge
   - Sending periodic bridge-level heartbeats (not just CAN keepalive)

4. **Add pri_key to container** — The seed/key exchange works but needs the actual AES key from the container's pri_key field to compute the correct key for seed 57 09 FD 6C 06.
