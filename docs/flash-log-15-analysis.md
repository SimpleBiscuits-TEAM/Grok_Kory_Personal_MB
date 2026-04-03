# Flash Log #15 (509c32c5) — First Run with reconnectForFlash + In-Loop Reconnect

## Summary

This is a **breakthrough log**. Duration dropped from 9m58s (log #14) to **3m52s** — a 61% reduction. The `reconnectForFlash()` fix and in-loop reconnect are working. The ECU is responding to USDT commands during VERIFICATION for the first time.

## Key Metrics Comparison

| Metric | Log #13 (no term) | Log #14 (120Ω, old code) | Log #15 (120Ω, new code) |
|--------|-------------------|--------------------------|--------------------------|
| Duration | 7m 52s | 9m 58s | **3m 52s** |
| Bridge disconnects | 4 | 5 | **1** |
| Reconnect time | ~14s avg | ~30s avg | **0.3s** |
| VERIFICATION DIDs read | 0/9 | 0/9 | **7/9** |
| Post-key-cycle session | Success (attempt 5) | FAILED (all 5) | **Success (attempt 2)** |
| Seed received | No | Yes (PRE_CHECK only) | **Yes (PRE_CHECK + KEY_CYCLE)** |
| ClearDTC response | Yes | No | **Yes** |
| ECU Reset response | No | No | **Yes (NRC 0x11)** |

## Phase-by-Phase Analysis

### PRE_CHECK (0-77s)
- Programming session: **All 3 attempts timed out** (vs log #14 which got NRC 0x12 then success). Possible CAN bus noise or ECU state difference.
- Seed request: **Success — 57 09 FD 6C 06** (same seed as all previous logs)
- DID 0xB0: **Success — B0 11** (consistent with log #14)
- DIDs 0xC1, 0x90, 0xA0: Timeout (consistent — these need security unlock)
- TesterPresent (0x3E 0x00): Timeout (consistent — GMLAN doesn't support USDT TesterPresent)

### SESSION_OPEN (77-83s)
Timing identical to all previous logs. E88 alignment confirmed stable.

### SECURITY_ACCESS (83-101s)
Seed request times out after SESSION_OPEN (expected — DisableNormalCommunication blocks USDT).

### VERIFICATION (101-149s) — **MAJOR IMPROVEMENT**

This is where the new code shines. For the first time, the ECU responds to USDT DID reads during VERIFICATION:

| DID | Log #14 | Log #15 | Response Data |
|-----|---------|---------|---------------|
| 0x90 (VIN) | Timeout | Timeout + reconnect | — |
| 0xC1 (Cal ID 1) | Timeout | **SUCCESS** | C1 00 C1 A5 4A |
| 0xC2 (Cal ID 2) | Timeout | **SUCCESS** | C2 00 C1 9B AF |
| 0xC3 (Cal ID 3) | Timeout | **SUCCESS** | C3 00 C1 9B A7 |
| 0xC4 (Cal ID 4) | Timeout | Timeout | — |
| 0xC5 (Cal ID 5) | Timeout | **SUCCESS** | C5 00 C1 A6 20 |
| 0xC6 (Cal ID 6) | Timeout | **SUCCESS** | C6 00 C1 A6 14 |
| 0xD0 (Unlock) | Timeout | **SUCCESS** | D0 41 42 |
| 0xCC (Prog Counter) | Timeout | **SUCCESS** | CC 03 4F FE EC |
| 0xAE (Finalize) | Timeout | **SUCCESS** | 28 (positive) |

7 out of 9 VERIFICATION commands succeeded. Only VIN (0x90) and Cal ID 4 (0xC4) timed out.

The bridge only disconnected ONCE (at ~107s), and `reconnectForFlash()` reconnected in **0.3 seconds** (vs 25-53s with old `connect()`).

### KEY_CYCLE (149-207s) — **MAJOR IMPROVEMENT**

- ECU Reset (0x11 0x01): **ECU responded** with NRC 0x11 (serviceNotSupported) — first time we've seen a response to this command. The ECU is alive and communicating.
- Key Off/On: Fast (5s off, 2s on)
- Boot wait: 8s
- Session re-establish: **Success on attempt 2/5** (vs attempt 5/5 in log #13, FAILED in log #14)
- Seed after boot: **57 09 FD 6C 06** — received immediately
- Dummy key: Sent, then timed out (expected — ECU locks after invalid key)

### CLEANUP (207-232s) — **PERFECT**

- ECU Reset: NRC 0x11 (ECU alive, service not supported in GMLAN)
- ClearDTC (0x04 on 0x7DF): **Positive response** — ECU cleared DTCs
- ReturnToNormal: Success (UUDT)

## What the New Code Fixed

1. **reconnectForFlash()**: Bridge reconnect dropped from 14-53s to 0.3s because it skips VIN read + PID scan and properly resets UDS monitor state.

2. **In-loop reconnect in reEstablishSession()**: Post-key-cycle session succeeded on attempt 2 because the WebSocket was checked and reconnected before each attempt (log #14 failed all 5 attempts because bridge was dead).

3. **Dry run retry reduction**: VERIFICATION retries capped at 1 (was 2), saving ~6s per timed-out DID.

## Remaining Observations

1. **DID 0x90 (VIN) still times out** — even with working USDT. This DID may require security unlock or may not be supported in the current session state.

2. **DID 0xC4 times out** — intermittent. C1-C3 and C5-C6 work, but C4 doesn't. Could be a timing issue or this specific calibration slot is empty.

3. **Programming session fails in PRE_CHECK** — all 3 attempts timed out, but seed request succeeded. The ECU may not respond to 0x10 0x02 in default session but still responds to 0x27 0x01.

4. **TesterPresent (0x3E 0x00) still times out** — confirmed GMLAN E41 does not support USDT TesterPresent. The UUDT broadcast (FE 01 3E) is the correct keepalive. Consider removing the USDT TesterPresent verify command from the orchestrator for GMLAN ECUs.

5. **ECU Reset (0x11 0x01) returns NRC 0x11** — "serviceNotSupported". The E41 may use a different reset command (0x11 0x03 for soft reset, or 0x20 for ReturnToNormal which is already in CLEANUP).
